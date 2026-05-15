import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches

from scripts.quality_compare import collect_pptx_stats, find_sample_pairs


class QualityCompareTest(unittest.TestCase):
    def test_find_sample_pairs_only_returns_pdfs_with_matching_pptx(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "alpha.pdf").write_bytes(b"%PDF-1.4\n")
            (root / "alpha.pptx").write_bytes(b"pptx")
            (root / "beta.pdf").write_bytes(b"%PDF-1.4\n")
            (root / "notes.txt").write_text("ignored")

            pairs = find_sample_pairs(root)

            self.assertEqual(len(pairs), 1)
            self.assertEqual(pairs[0].name, "alpha")
            self.assertEqual(pairs[0].pdf_path, root / "alpha.pdf")
            self.assertEqual(pairs[0].reference_pptx_path, root / "alpha.pptx")

    def test_collect_pptx_stats_counts_editable_objects(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "image.png"
            Image.new("RGB", (20, 20), "red").save(image_path)

            pptx_path = root / "deck.pptx"
            prs = Presentation()
            slide = prs.slides.add_slide(prs.slide_layouts[6])
            textbox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(2), Inches(0.5))
            textbox.text = "Editable title"
            slide.shapes.add_picture(str(image_path), Inches(0.5), Inches(1.2), Inches(1), Inches(1))
            slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(2), Inches(1.2), Inches(1), Inches(1))
            table = slide.shapes.add_table(2, 2, Inches(0.5), Inches(2.5), Inches(2), Inches(1)).table
            table.cell(0, 0).text = "A"
            table.cell(0, 1).text = "B"
            table.cell(1, 0).text = "C"
            table.cell(1, 1).text = "D"
            prs.save(pptx_path)

            stats = collect_pptx_stats(pptx_path)

            self.assertEqual(stats["slideCount"], 1)
            self.assertEqual(stats["textShapes"], 1)
            self.assertEqual(stats["pictures"], 1)
            self.assertGreaterEqual(stats["shapes"], 2)
            self.assertEqual(stats["tables"], 1)


if __name__ == "__main__":
    unittest.main()
