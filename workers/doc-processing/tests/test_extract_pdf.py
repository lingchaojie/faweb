import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import fitz


class ExtractPdfTest(unittest.TestCase):
    def test_extracts_manifest_page_image_text_and_drawings(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            pdf_path = tmp_path / "input.pdf"
            out_dir = tmp_path / "out"

            doc = fitz.open()
            page = doc.new_page(width=960, height=540)
            page.insert_text((72, 96), "Hello PDF", fontsize=24, color=(0.1, 0.2, 0.3))
            page.draw_rect(fitz.Rect(72, 140, 240, 190), color=(1, 0, 0), fill=(1, 0.8, 0.8), width=1)
            doc.save(pdf_path)
            doc.close()

            subprocess.run(
                ["python3", "scripts/extract_pdf.py", str(pdf_path), str(out_dir)],
                cwd=Path(__file__).resolve().parents[1],
                check=True,
            )

            manifest = json.loads((out_dir / "manifest.json").read_text())
            self.assertEqual(manifest["pdfPath"], str(pdf_path))
            self.assertEqual(len(manifest["pages"]), 1)

            page_info = manifest["pages"][0]
            self.assertEqual(page_info["pageNumber"], 1)
            self.assertEqual(page_info["width"], 960)
            self.assertEqual(page_info["height"], 540)
            self.assertTrue((out_dir / page_info["imagePath"]).exists())

            text_values = [block["text"] for block in page_info["textBlocks"]]
            self.assertIn("Hello PDF", text_values)
            self.assertGreaterEqual(len(page_info["drawings"]), 1)

    def test_records_each_visible_placement_for_reused_image_xobject(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            pdf_path = tmp_path / "reused-image.pdf"
            out_dir = tmp_path / "out"

            doc = fitz.open()
            page = doc.new_page(width=200, height=120)
            pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 10, 10), False)
            pix.clear_with(0x336699)
            xref = page.insert_image(fitz.Rect(10, 10, 40, 40), pixmap=pix)
            page.insert_image(fitz.Rect(80, 20, 120, 60), xref=xref)
            doc.save(pdf_path)
            doc.close()

            subprocess.run(
                ["python3", "scripts/extract_pdf.py", str(pdf_path), str(out_dir)],
                cwd=Path(__file__).resolve().parents[1],
                check=True,
            )

            manifest = json.loads((out_dir / "manifest.json").read_text())
            images = manifest["pages"][0]["images"]

            self.assertEqual(len(images), 2)
            self.assertEqual({image["id"] for image in images}, {"i0", "i1"})
            self.assertEqual(images[0]["bbox"], [10.0, 10.0, 40.0, 40.0])
            self.assertEqual(images[1]["bbox"], [80.0, 20.0, 120.0, 60.0])
            for image in images:
                self.assertTrue((out_dir / image["path"]).exists())

    def test_converts_non_rgb_pixmap_before_png_save(self):
        import importlib.util

        script_path = Path(__file__).resolve().parents[1] / "scripts" / "extract_pdf.py"
        spec = importlib.util.spec_from_file_location("extract_pdf", script_path)
        extract_pdf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(extract_pdf)

        class FakePixmap:
            def __init__(self):
                self.n = 4
                self.alpha = 0

        converted = []

        def fake_factory(colorspace, pixmap):
            converted.append((colorspace, pixmap))
            return "converted"

        pixmap = FakePixmap()
        result = extract_pdf.pixmap_for_png(pixmap, pixmap_factory=fake_factory)

        self.assertEqual(result, "converted")
        self.assertEqual(converted, [(fitz.csRGB, pixmap)])

