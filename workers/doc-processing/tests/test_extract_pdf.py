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
