import json
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt


def points(value):
    return Inches(float(value) / 72.0)


def bbox_to_position(bbox):
    x1, y1, x2, y2 = bbox
    return points(x1), points(y1), points(max(1, x2 - x1)), points(max(1, y2 - y1))


def parse_color(value, fallback="000000"):
    if not value or not isinstance(value, str):
        value = fallback
    value = value.lstrip("#")
    if len(value) != 6:
        value = fallback
    return RGBColor(int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def find_page_hints(hints, page_number):
    for page in hints.get("pages", []):
        if int(page.get("pageNumber", 0)) == int(page_number):
            return page
    return {"mergedTextBlocks": [], "tables": [], "ignoredBlockIds": [], "imageRoles": []}


def add_text_box(slide, text_item):
    left, top, width, height = bbox_to_position(text_item["bbox"])
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.clear()
    paragraph = frame.paragraphs[0]
    run = paragraph.add_run()
    run.text = text_item.get("text", "")
    run.font.size = Pt(14 if text_item.get("role") == "body" else 20)
    run.font.color.rgb = parse_color(text_item.get("color"), "111111")
    return box


def add_drawing(slide, drawing):
    left, top, width, height = bbox_to_position(drawing["bbox"])
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    if drawing.get("fill"):
        shape.fill.solid()
        shape.fill.fore_color.rgb = parse_color(drawing.get("fill"), "ffffff")
    else:
        shape.fill.background()
    if drawing.get("stroke"):
        shape.line.color.rgb = parse_color(drawing.get("stroke"), "000000")
    return shape


def add_image(slide, manifest_root, image):
    path = manifest_root / image["path"]
    if not path.exists():
        return None
    left, top, width, height = bbox_to_position(image["bbox"])
    return slide.shapes.add_picture(str(path), left, top, width, height)


def build_pptx(manifest_path, hints_path, output_path):
    manifest_path = Path(manifest_path)
    hints_path = Path(hints_path)
    output_path = Path(output_path)
    manifest = json.loads(manifest_path.read_text())
    hints = json.loads(hints_path.read_text())

    prs = Presentation()
    first_page = manifest["pages"][0]
    prs.slide_width = points(first_page["width"])
    prs.slide_height = points(first_page["height"])
    blank_layout = prs.slide_layouts[6]

    for page in manifest["pages"]:
        slide = prs.slides.add_slide(blank_layout)
        page_hints = find_page_hints(hints, page["pageNumber"])
        ignored = set(page_hints.get("ignoredBlockIds", []))
        merged_source_ids = set()

        for image in page.get("images", []):
            if image.get("id") not in ignored:
                add_image(slide, manifest_path.parent, image)

        for drawing in page.get("drawings", []):
            if drawing.get("id") not in ignored:
                add_drawing(slide, drawing)

        for item in page_hints.get("mergedTextBlocks", []):
            add_text_box(slide, item)
            merged_source_ids.update(item.get("sourceTextBlockIds", []))

        for block in page.get("textBlocks", []):
            if block.get("id") in ignored or block.get("id") in merged_source_ids:
                continue
            add_text_box(slide, {
                "text": block.get("text", ""),
                "bbox": block.get("bbox", [0, 0, 1, 1]),
                "role": "body",
                "color": block.get("spans", [{}])[0].get("color", "#111111") if block.get("spans") else "#111111",
            })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(output_path)


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: build_pptx.py <manifest.json> <hints.json> <output.pptx>")
    build_pptx(sys.argv[1], sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    main()
