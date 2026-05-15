import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

DOC_PROCESSING_ROOT = Path(__file__).resolve().parents[1]
if str(DOC_PROCESSING_ROOT) not in sys.path:
    sys.path.insert(0, str(DOC_PROCESSING_ROOT))

from scripts.build_pptx import build_pptx
from scripts.build_pptx import choose_font_family, style_from_source_blocks


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

    def test_style_from_source_blocks_uses_largest_visible_span(self):
        blocks = [
            {
                "text": "Small",
                "spans": [{"text": "Small", "font": "Helvetica", "size": 12, "color": "#111111"}],
            },
            {
                "text": "Large",
                "spans": [{"text": "Large", "font": "Aptos", "size": 28, "color": "#223344"}],
            },
        ]

        style = style_from_source_blocks(blocks, role="title")

        self.assertEqual(style["fontSize"], 28)
        self.assertEqual(style["fontFamily"], "Aptos")
        self.assertEqual(style["color"], "#223344")

    def test_choose_font_family_uses_cjk_fallback_for_chinese_text(self):
        self.assertEqual(choose_font_family("Helvetica", "无穹创新"), "Noto Sans CJK SC")

    def test_build_emits_east_asian_font_for_chinese_text(self):
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
                            {"id": "t1", "text": "无穹创新", "bbox": [72, 72, 240, 110], "spans": [{"text": "无穹创新", "bbox": [72, 72, 240, 110], "size": 24, "font": "Helvetica", "color": "#112233"}]}
                        ],
                        "images": [],
                        "drawings": [],
                    }
                ],
            }
            hints = {"pages": [{"pageNumber": 1, "mergedTextBlocks": [], "tables": [], "ignoredBlockIds": [], "imageRoles": []}]}
            manifest_path.write_text(json.dumps(manifest))
            hints_path.write_text(json.dumps(hints))

            build_pptx(manifest_path, hints_path, output_path)

            with zipfile.ZipFile(output_path) as pptx:
                slide = pptx.read("ppt/slides/slide1.xml").decode("utf-8")
                self.assertIn("无穹创新", slide)
                self.assertIn('<a:ea typeface="Noto Sans CJK SC"/>', slide)

    def test_build_falls_back_when_hint_color_is_invalid_hex(self):
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
                            {"id": "t1", "text": "Styled", "bbox": [72, 72, 240, 110], "spans": [{"text": "Styled", "bbox": [72, 72, 240, 110], "size": 24, "font": "Aptos", "color": "#112233"}]}
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
                                "sourceTextBlockIds": ["t1"],
                                "role": "title",
                                "text": "Styled",
                                "bbox": [72, 72, 240, 110],
                                "style": {"color": "gggggg"},
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
                self.assertIn('val="111111"', slide)
                self.assertNotIn("gggggg", slide)

    def test_build_uses_hint_text_style_in_pptx_xml(self):
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
                            {"id": "t1", "text": "Styled", "bbox": [72, 72, 240, 110], "spans": [{"text": "Styled", "bbox": [72, 72, 240, 110], "size": 24, "font": "Aptos", "color": "#112233"}]}
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
                                "sourceTextBlockIds": ["t1"],
                                "role": "title",
                                "text": "Styled",
                                "bbox": [72, 72, 240, 110],
                                "style": {"fontSize": 30, "fontFamily": "Aptos", "color": "#112233", "align": "center"},
                            }
                        ],
                        "tables": [],
                        "regions": [],
                        "fallbacks": [],
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
                self.assertIn("Styled", slide)
                self.assertIn('typeface="Aptos"', slide)
                self.assertIn('sz="3000"', slide)
                self.assertIn('algn="ctr"', slide)

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

    def test_fallback_region_adds_cropped_page_image_and_skips_covered_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            page_dir = root / "page-001"
            page_dir.mkdir()
            Image.new("RGB", (200, 100), "white").save(page_dir / "page.png")
            manifest_path = root / "manifest.json"
            hints_path = root / "hints.json"
            output_path = root / "result.pptx"
            manifest = {
                "pdfPath": str(root / "input.pdf"),
                "pageCount": 1,
                "pages": [
                    {
                        "pageNumber": 1,
                        "width": 200,
                        "height": 100,
                        "rotation": 0,
                        "imagePath": "page-001/page.png",
                        "textBlocks": [
                            {"id": "t1", "text": "Covered", "bbox": [60, 20, 120, 40], "spans": []},
                            {"id": "t2", "text": "Visible", "bbox": [10, 70, 80, 90], "spans": []},
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
                        "mergedTextBlocks": [],
                        "tables": [],
                        "regions": [],
                        "fallbacks": [{"id": "f1", "reason": "complex", "bbox": [50, 10, 150, 60], "confidence": 0.9, "zIndex": 1}],
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
                media_names = [name for name in pptx.namelist() if name.startswith("ppt/media/")]
                self.assertNotIn("Covered", slide)
                self.assertIn("Visible", slide)
                self.assertEqual(len(media_names), 1)

    def test_region_image_strategy_behaves_as_fallback_crop(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            page_dir = root / "page-001"
            page_dir.mkdir()
            Image.new("RGB", (200, 100), "white").save(page_dir / "page.png")
            manifest_path = root / "manifest.json"
            hints_path = root / "hints.json"
            output_path = root / "result.pptx"
            manifest = {
                "pdfPath": str(root / "input.pdf"),
                "pageCount": 1,
                "pages": [{"pageNumber": 1, "width": 200, "height": 100, "rotation": 0, "imagePath": "page-001/page.png", "textBlocks": [], "images": [], "drawings": []}],
            }
            hints = {
                "pages": [
                    {
                        "pageNumber": 1,
                        "mergedTextBlocks": [],
                        "tables": [],
                        "regions": [{"id": "r1", "role": "chart", "strategy": "image", "bbox": [20, 20, 100, 80], "sourceIds": [], "confidence": 0.8, "zIndex": 1}],
                        "fallbacks": [],
                        "ignoredBlockIds": [],
                        "imageRoles": [],
                    }
                ]
            }
            manifest_path.write_text(json.dumps(manifest))
            hints_path.write_text(json.dumps(hints))

            build_pptx(manifest_path, hints_path, output_path)

            with zipfile.ZipFile(output_path) as pptx:
                media_names = [name for name in pptx.namelist() if name.startswith("ppt/media/")]
                self.assertEqual(len(media_names), 1)

    def test_confident_table_hint_builds_editable_table(self):
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
                        "width": 400,
                        "height": 300,
                        "rotation": 0,
                        "textBlocks": [
                            {"id": "t1", "text": "A", "bbox": [10, 10, 100, 40], "spans": []},
                            {"id": "t2", "text": "B", "bbox": [110, 10, 200, 40], "spans": []},
                            {"id": "t3", "text": "C", "bbox": [10, 60, 100, 90], "spans": []},
                            {"id": "t4", "text": "D", "bbox": [110, 60, 200, 90], "spans": []},
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
                        "mergedTextBlocks": [],
                        "tables": [{"id": "table1", "bbox": [0, 0, 220, 120], "rows": 2, "columns": 2, "sourceTextBlockIds": ["t1", "t2", "t3", "t4"], "confidence": 0.9}],
                        "regions": [],
                        "fallbacks": [],
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
                self.assertIn("a:tbl", slide)
                self.assertIn("A", slide)
                self.assertIn("D", slide)
