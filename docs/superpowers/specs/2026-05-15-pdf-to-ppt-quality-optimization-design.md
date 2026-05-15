# PDF-to-PPT Quality Optimization Design

## Purpose

Optimize the existing `pdf_to_ppt` worker for output quality. The current worktree proves the API-driven workflow can run end-to-end, but the generated PPTX is not visually close enough to the WPS/sample references to be useful. This phase focuses on measuring and improving visual fidelity across all sample PDF/PPTX pairs.

## Confirmed Direction

Use a development quality comparison harness first, then use that harness to drive deterministic builder improvements.

This work does not expand the API workflow or treat valid PPTX generation as success. Success means the worker output is measurably and visibly closer to the WPS-generated reference PPTX files in `workers/doc-processing/samples`.

## Scope

### In scope

- Cover every sample PDF/PPTX pair in `workers/doc-processing/samples`.
- Add a development-only comparison harness for source PDF, WPS reference PPTX, and generated PPTX outputs.
- Produce per-sample and per-slide comparison artifacts that can be reviewed manually.
- Produce basic PPTX object statistics for WPS references and generated outputs.
- Improve deterministic reconstruction in `build_pptx.py` using extractor data and Claude layout hints.
- Keep text, basic shapes, and confident tables editable where practical.
- Use cropped page/image fallbacks for complex regions where editability would hurt visual fidelity.

### Out of scope

- Runtime visual scoring for normal user jobs.
- Claiming generic high-quality conversion for arbitrary PDFs.
- Replacing the deterministic builder with Claude-generated PPTX content.
- Expanding `pdf_to_word` or `pdf_extract_text`.
- Treating workflow plumbing or valid ZIP/PPTX output as a quality milestone.

## Quality Comparison Harness

Add a development script that scans `workers/doc-processing/samples` for PDF files with same-basename PPTX references. For each pair, it should:

1. Render source PDF pages to images.
2. Render the WPS reference PPTX pages to images.
3. Render the worker-generated PPTX pages to images when a generated output is provided or produced.
4. Create per-slide side-by-side comparison images.
5. Compute simple visual difference metrics such as page count match, rendered image dimensions, and pixel difference against the WPS render.
6. Extract object counts from the reference and generated PPTX files, including text boxes, pictures, shapes, and tables.
7. Write artifacts under a samples analysis directory so results are inspectable and repeatable.

The harness is a development and regression tool only. It must not run in the normal worker request path.

## Builder Optimization Focus

The main quality work should happen in the deterministic PPTX builder. Priority areas are:

- Match slide size and page coordinate mapping to the source PDF.
- Preserve backgrounds and large visual regions accurately.
- Improve image placement, cropping, scaling, transparency, and z-order.
- Preserve text font family, font size, color, alignment, line spacing, and bullet structure.
- Prefer CJK-capable font fallbacks for Chinese-heavy samples.
- Reconstruct simple shapes and decorative lines when they improve visual similarity.
- Reconstruct confident tables as editable tables when possible.
- Fall back to aligned text boxes and line shapes for uncertain tables.
- Use cropped image regions for complex charts, screenshots, formulas, or dense visual areas.

The builder should remain deterministic. Given the same extractor artifacts and validated Claude hints, it should produce the same PPTX.

## Claude Layout Hints

Claude layout analysis should remain a source of structured hints for the builder, not a direct PPTX generator.

The hints schema should only contain fields the builder consumes. Useful categories include:

- `textGroups`: span IDs or regions that should become one title, paragraph, bullet list, caption, label, or footnote.
- `regions`: semantic regions such as background, logo, photo, chart, table, decorative element, header, and footer.
- `tables`: table bounding boxes, row/column counts, header/body hints, and confidence.
- `layering`: relative ordering for important regions or objects.
- `fallbacks`: regions that should be preserved as cropped images because native reconstruction is likely to be worse.

Builder consumption order:

1. Place base elements from extractor coordinates and assets.
2. Apply Claude hints to merge text, classify regions, and choose table/list handling.
3. Apply fallback image crops for complex or low-confidence regions.
4. Generate PPTX output.
5. Run the comparison harness and use the artifacts to decide the next builder or hints change.

## Acceptance Criteria

- Every sample PDF/PPTX pair has repeatable comparison output.
- Comparison output includes rendered source PDF, WPS reference PPTX, generated PPTX, side-by-side review images, and object statistics where rendering succeeds.
- The optimization workflow can show whether a builder change improves or regresses similarity to WPS references.
- Claude hints used by the builder have clear schema fields and validation; unused hint fields are not added.
- The worker still runs through the existing API path for actual conversion.

## Risks and Constraints

- Rendering PPTX files may require LibreOffice or another local renderer, which can differ from WPS/PowerPoint rendering.
- Some sample slides may only be visually matchable with image fallbacks, reducing editability.
- CJK font availability can change rendered output; the worker and harness should use consistent installed fonts where possible.
- Pixel metrics are a guide, not the final quality judgment. Manual visual review remains required.
