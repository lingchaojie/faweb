import json
import sys
from pathlib import Path

import fitz


def color_to_hex(color):
    if color is None:
        return None
    if isinstance(color, int):
        return "#%06x" % (color & 0xFFFFFF)
    if isinstance(color, (list, tuple)) and len(color) >= 3:
        return "#%02x%02x%02x" % tuple(max(0, min(255, round(c * 255))) for c in color[:3])
    return None


def rect_to_list(rect):
    return [float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])]


def extract_text_blocks(page):
    result = []
    text_dict = page.get_text("dict")
    index = 0
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        lines = []
        spans_out = []
        for line in block.get("lines", []):
            line_text = "".join(span.get("text", "") for span in line.get("spans", []))
            if line_text.strip():
                lines.append(line_text)
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text.strip():
                    continue
                spans_out.append({
                    "text": text,
                    "bbox": rect_to_list(span.get("bbox", [0, 0, 0, 0])),
                    "font": span.get("font"),
                    "size": float(span.get("size", 0)),
                    "color": color_to_hex(span.get("color")),
                })
        text = "\n".join(lines).strip()
        if not text:
            continue
        result.append({
            "id": f"t{index}",
            "text": text,
            "bbox": rect_to_list(block.get("bbox", [0, 0, 0, 0])),
            "spans": spans_out,
        })
        index += 1
    return result


def pixmap_for_png(pix, pixmap_factory=fitz.Pixmap):
    if pix.alpha or pix.n - pix.alpha > 3:
        return pixmap_factory(fitz.csRGB, pix)
    return pix


def extract_images(page, doc, page_dir):
    result = []
    image_index = 0
    saved_images = {}
    processed_xrefs = set()
    for image in page.get_images(full=True):
        xref = image[0]
        if xref in processed_xrefs:
            continue
        processed_xrefs.add(xref)
        try:
            if xref in saved_images:
                name, width, height = saved_images[xref]
            else:
                pix = pixmap_for_png(fitz.Pixmap(doc, xref))
                name = f"image-{len(saved_images)}.png"
                path = page_dir / name
                pix.save(path)
                width = pix.width
                height = pix.height
                saved_images[xref] = (name, width, height)

            rects = page.get_image_rects(xref)
            if not rects:
                rects = [fitz.Rect(0, 0, width, height)]
            for rect in rects:
                result.append({
                    "id": f"i{image_index}",
                    "path": str(Path(page_dir.name) / name),
                    "bbox": rect_to_list(rect),
                    "width": width,
                    "height": height,
                })
                image_index += 1
        except Exception:
            continue
    return result


def extract_drawings(page):
    result = []
    for index, drawing in enumerate(page.get_drawings()):
        rect = drawing.get("rect")
        if rect is None:
            continue
        result.append({
            "id": f"d{index}",
            "bbox": rect_to_list(rect),
            "fill": color_to_hex(drawing.get("fill")),
            "stroke": color_to_hex(drawing.get("color")),
            "width": float(drawing.get("width") or 0),
        })
    return result


def extract_pdf(pdf_path, output_dir):
    pdf_path = Path(pdf_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    pages = []
    for page_index, page in enumerate(doc):
        page_number = page_index + 1
        page_dir = output_dir / f"page-{page_number:03d}"
        page_dir.mkdir(parents=True, exist_ok=True)

        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        image_name = "page.png"
        pix.save(page_dir / image_name)

        page_info = {
            "pageNumber": page_number,
            "width": float(page.rect.width),
            "height": float(page.rect.height),
            "rotation": int(page.rotation),
            "imagePath": str(Path(page_dir.name) / image_name),
            "textBlocks": extract_text_blocks(page),
            "images": extract_images(page, doc, page_dir),
            "drawings": extract_drawings(page),
        }
        pages.append(page_info)

    manifest = {
        "pdfPath": str(pdf_path),
        "pageCount": len(pages),
        "pages": pages,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    doc.close()


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_pdf.py <input.pdf> <output-dir>")
    extract_pdf(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
