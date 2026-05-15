import argparse
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree

import fitz
from PIL import Image, ImageChops, ImageDraw


PML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
AML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS = {"p": PML_NS, "a": AML_NS}


@dataclass(frozen=True)
class SamplePair:
    name: str
    pdf_path: Path
    reference_pptx_path: Path


def natural_slide_key(name):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else name


def find_sample_pairs(samples_dir):
    root = Path(samples_dir)
    pairs = []
    for pdf_path in sorted(root.glob("*.pdf")):
        reference_pptx_path = pdf_path.with_suffix(".pptx")
        if reference_pptx_path.exists():
            pairs.append(SamplePair(pdf_path.stem, pdf_path, reference_pptx_path))
    return pairs


def collect_pptx_stats(pptx_path):
    pptx_path = Path(pptx_path)
    totals = {
        "slideCount": 0,
        "textShapes": 0,
        "pictures": 0,
        "shapes": 0,
        "tables": 0,
    }
    with zipfile.ZipFile(pptx_path) as package:
        slide_names = sorted(
            [name for name in package.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", name)],
            key=natural_slide_key,
        )
        totals["slideCount"] = len(slide_names)
        for slide_name in slide_names:
            root = ElementTree.fromstring(package.read(slide_name))
            shapes = root.findall(".//p:sp", NS)
            totals["shapes"] += len(shapes)
            totals["pictures"] += len(root.findall(".//p:pic", NS))
            totals["tables"] += len(root.findall(".//a:tbl", NS))
            for shape in shapes:
                text = "".join(node.text or "" for node in shape.findall(".//a:t", NS)).strip()
                if text:
                    totals["textShapes"] += 1
    return totals


def render_pdf_pages(pdf_path, output_dir, zoom=2.0):
    pdf_path = Path(pdf_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    paths = []
    try:
        for index, page in enumerate(doc, start=1):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            output_path = output_dir / f"page-{index:03d}.png"
            pixmap.save(output_path)
            paths.append(output_path)
    finally:
        doc.close()
    return paths


def render_pptx_pages(pptx_path, output_dir, libreoffice_bin="soffice", zoom=2.0):
    pptx_path = Path(pptx_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        subprocess.run(
            [libreoffice_bin, "--headless", "--convert-to", "pdf", "--outdir", str(tmp_dir), str(pptx_path)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        converted_pdf = tmp_dir / f"{pptx_path.stem}.pdf"
        if not converted_pdf.exists():
            pdfs = sorted(tmp_dir.glob("*.pdf"))
            if not pdfs:
                raise FileNotFoundError(f"LibreOffice did not create a PDF for {pptx_path}")
            converted_pdf = pdfs[0]
        return render_pdf_pages(converted_pdf, output_dir, zoom=zoom)


def compare_images(reference_path, candidate_path):
    reference = Image.open(reference_path).convert("RGB")
    candidate = Image.open(candidate_path).convert("RGB")
    if candidate.size != reference.size:
        candidate = candidate.resize(reference.size)
    diff = ImageChops.difference(reference, candidate)
    histogram = diff.histogram()
    total = 0
    for channel in range(3):
        bins = histogram[channel * 256:(channel + 1) * 256]
        total += sum(value * count for value, count in enumerate(bins))
    width, height = reference.size
    return total / float(255 * 3 * width * height)


def write_side_by_side(items, output_path):
    opened = [(label, Image.open(path).convert("RGB")) for label, path in items]
    label_height = 24
    width = sum(image.width for _, image in opened)
    height = max(image.height for _, image in opened) + label_height
    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)
    x = 0
    for label, image in opened:
        draw.text((x + 4, 4), label, fill="black")
        canvas.paste(image, (x, label_height))
        x += image.width
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)
    return output_path


def relative_to(path, root):
    path = Path(path)
    root = Path(root)
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def render_set_for_sample(pair, sample_output_dir, generated_pptx_path, render_pdf, render_pptx, libreoffice_bin, zoom):
    pdf_renders = render_pdf(pair.pdf_path, sample_output_dir / "source-pdf", zoom=zoom)
    reference_renders = render_pptx(pair.reference_pptx_path, sample_output_dir / "reference-pptx", libreoffice_bin=libreoffice_bin, zoom=zoom)
    generated_renders = []
    if generated_pptx_path and generated_pptx_path.exists():
        generated_renders = render_pptx(generated_pptx_path, sample_output_dir / "generated-pptx", libreoffice_bin=libreoffice_bin, zoom=zoom)
    return pdf_renders, reference_renders, generated_renders


def sample_stats(pair, generated_pptx_path):
    stats = {"reference": collect_pptx_stats(pair.reference_pptx_path), "generated": None}
    if generated_pptx_path and generated_pptx_path.exists():
        stats["generated"] = collect_pptx_stats(generated_pptx_path)
    return stats


def slide_reports(sample_output_dir, pdf_renders, reference_renders, generated_renders):
    reports = []
    review_dir = sample_output_dir / "review"
    max_pages = max(len(pdf_renders), len(reference_renders), len(generated_renders))
    for index in range(max_pages):
        page_number = index + 1
        items = []
        slide = {"pageNumber": page_number}
        if index < len(pdf_renders):
            slide["sourcePdfRender"] = relative_to(pdf_renders[index], sample_output_dir)
            items.append(("PDF", pdf_renders[index]))
        if index < len(reference_renders):
            slide["referencePptxRender"] = relative_to(reference_renders[index], sample_output_dir)
            items.append(("WPS reference", reference_renders[index]))
        if index < len(generated_renders):
            slide["generatedPptxRender"] = relative_to(generated_renders[index], sample_output_dir)
            items.append(("Generated", generated_renders[index]))
        if index < len(reference_renders) and index < len(generated_renders):
            slide["generatedDiffToReference"] = compare_images(reference_renders[index], generated_renders[index])
        else:
            slide["generatedDiffToReference"] = None
        if items:
            review_path = write_side_by_side(items, review_dir / f"page-{page_number:03d}.png")
            slide["reviewImage"] = relative_to(review_path, sample_output_dir)
        reports.append(slide)
    return reports


def run_comparison(
    samples_dir,
    output_dir,
    generated_dir=None,
    render_pdf=render_pdf_pages,
    render_pptx=render_pptx_pages,
    libreoffice_bin="soffice",
    zoom=2.0,
):
    samples_dir = Path(samples_dir)
    output_dir = Path(output_dir)
    generated_dir = Path(generated_dir) if generated_dir else None
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {"samplesDir": str(samples_dir), "outputDir": str(output_dir), "samples": []}
    for pair in find_sample_pairs(samples_dir):
        generated_pptx_path = generated_dir / f"{pair.name}.pptx" if generated_dir else None
        sample_output_dir = output_dir / pair.name
        sample_output_dir.mkdir(parents=True, exist_ok=True)
        pdf_renders, reference_renders, generated_renders = render_set_for_sample(
            pair,
            sample_output_dir,
            generated_pptx_path,
            render_pdf,
            render_pptx,
            libreoffice_bin,
            zoom,
        )
        report["samples"].append({
            "name": pair.name,
            "pdf": str(pair.pdf_path),
            "referencePptx": str(pair.reference_pptx_path),
            "generatedPptx": str(generated_pptx_path) if generated_pptx_path and generated_pptx_path.exists() else None,
            "stats": sample_stats(pair, generated_pptx_path),
            "slides": slide_reports(sample_output_dir, pdf_renders, reference_renders, generated_renders),
        })
    (output_dir / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="Compare sample PDF-to-PPT outputs against WPS PPTX references.")
    parser.add_argument("--samples-dir", default="samples")
    parser.add_argument("--output-dir", default="samples/_quality_compare")
    parser.add_argument("--generated-dir")
    parser.add_argument("--libreoffice-bin", default=shutil.which("soffice") or "soffice")
    parser.add_argument("--zoom", type=float, default=2.0)
    args = parser.parse_args(argv)
    report = run_comparison(
        samples_dir=args.samples_dir,
        output_dir=args.output_dir,
        generated_dir=args.generated_dir,
        libreoffice_bin=args.libreoffice_bin,
        zoom=args.zoom,
    )
    print(json.dumps({"samples": len(report["samples"]), "outputDir": str(args.output_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
