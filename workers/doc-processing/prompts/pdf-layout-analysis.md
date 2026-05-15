Analyze the provided PDF extraction manifest for editable PPTX reconstruction.

You will receive:
- A path to `manifest.json` containing page sizes, text blocks, extracted images, drawings, and page image paths.
- A list of page numbers to analyze.

Return only the JSON object described by the `pdf-layout-analyzer` skill.

Important:
- Use source text block IDs from the manifest.
- Keep coordinates in PDF point units.
- Merge text fragments that visually form a single title, paragraph, bullet, label, or table cell.
- Prefer fewer coherent text boxes over many single-word text boxes.
- Treat photos and complex charts as images.
- Identify tables only when row and column structure is visually clear.
- If a page is simple, return mergedTextBlocks and leave tables empty.
