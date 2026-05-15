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
