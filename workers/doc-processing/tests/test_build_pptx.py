import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.build_pptx import build_pptx


class BuildPptxTest(unittest.TestCase):
    def test_builds_valid_pptx_with_editable_text_and_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_path = root / "manifest.json"
            hints_path = root / "hints.json"
            output_path = root / "result.pptx"

            manifest = {
                "pdfPath": str(root / "input.pdf"),
                "pageCount": 1,
                "pages": [
                    {
                        "pageNumber": 1,
                        "width": 960,
                        "height": 540,
                        "rotation": 0,
                        "imagePath": "page-001/page.png",
                        "textBlocks": [
                            {"id": "t1", "text": "Hello", "bbox": [72, 72, 160, 110], "spans": [{"text": "Hello", "bbox": [72, 72, 160, 110], "size": 24, "font": "Helvetica", "color": "#111111"}]},
                            {"id": "t2", "text": "World", "bbox": [170, 72, 280, 110], "spans": [{"text": "World", "bbox": [170, 72, 280, 110], "size": 24, "font": "Helvetica", "color": "#111111"}]}
                        ],
                        "images": [],
                        "drawings": [
                            {"id": "d1", "bbox": [72, 140, 240, 190], "fill": "#ffeeee", "stroke": "#ff0000", "width": 1}
                        ],
                    }
                ],
            }
            hints = {
                "pages": [
                    {
                        "pageNumber": 1,
                        "mergedTextBlocks": [
                            {"id": "m1", "sourceTextBlockIds": ["t1", "t2"], "role": "title", "text": "Hello World", "bbox": [72, 72, 280, 110]}
                        ],
                        "tables": [],
                        "ignoredBlockIds": [],
                        "imageRoles": [],
                    }
                ]
            }
            manifest_path.write_text(json.dumps(manifest))
            hints_path.write_text(json.dumps(hints))

            build_pptx(manifest_path, hints_path, output_path)

            self.assertTrue(output_path.exists())
            with zipfile.ZipFile(output_path) as pptx:
                slide = pptx.read("ppt/slides/slide1.xml").decode("utf-8")
                self.assertIn("Hello World", slide)
                self.assertIn("p:sp", slide)

    def test_merged_text_uses_source_blocks_in_geometry_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_path = root / "manifest.json"
            hints_path = root / "hints.json"
            output_path = root / "result.pptx"

            manifest = {
                "pdfPath": str(root / "input.pdf"),
                "pageCount": 1,
                "pages": [
                    {
                        "pageNumber": 1,
                        "width": 960,
                        "height": 540,
                        "rotation": 0,
                        "textBlocks": [
                            {"id": "t2", "text": "World", "bbox": [170, 72, 280, 110], "spans": []},
                            {"id": "t1", "text": "Hello", "bbox": [72, 72, 160, 110], "spans": []},
                        ],
                        "images": [],
                        "drawings": [],
                    }
                ],
            }
            hints = {
                "pages": [
                    {
                        "pageNumber": 1,
                        "mergedTextBlocks": [
                            {
                                "id": "m1",
                                "sourceTextBlockIds": ["t2", "t1"],
                                "role": "title",
                                "text": "MALICIOUS HALLUCINATION",
                                "bbox": [72, 72, 280, 110],
                            }
                        ],
                        "tables": [],
                        "ignoredBlockIds": [],
                        "imageRoles": [],
                    }
                ]
            }
            manifest_path.write_text(json.dumps(manifest))
            hints_path.write_text(json.dumps(hints))

            build_pptx(manifest_path, hints_path, output_path)

            with zipfile.ZipFile(output_path) as pptx:
                slide = pptx.read("ppt/slides/slide1.xml").decode("utf-8")
                self.assertIn("Hello World", slide)
                self.assertNotIn("MALICIOUS", slide)
