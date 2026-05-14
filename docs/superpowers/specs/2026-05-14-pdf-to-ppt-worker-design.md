# PDF to PPT Worker Design

## Purpose

Implement the first real `pdf_to_ppt` conversion path for FlowAssist inside the existing `doc-processing` worker. The first version is samples-first: it should target high-fidelity conversion for the PDFs in `workers/doc-processing/samples` and use the WPS-generated PPTX files in that directory as reference material.

The target output is an editable `.pptx` where text, basic shapes, and confidently detected tables are editable PowerPoint objects. Photos, logos, complex charts, and difficult visual assets may remain images. The conversion must run through the existing backend API path, not through a local-only script.

## Confirmed Scope

### In scope

- Implement real conversion for `taskType = "pdf_to_ppt"` in `workers/doc-processing`.
- Keep `pdf_to_ppt` under the existing `doc_processing` workflow for the first version.
- Use Claude Code as a worker subprocess for layout understanding.
- Use host-provided environment variables for Claude/Anthropic auth.
- Mount only worker-specific Claude skills and prompts into the worker container.
- Tune and validate against the existing sample PDF/PPTX pairs.
- Target about 20 pages in under 10 minutes.
- Enforce a hard job timeout of 20 minutes.
- Test through the existing web/backend API: upload file, create task, poll status, download result.

### Out of scope

- Generic high-quality conversion for arbitrary PDFs.
- Runtime visual quality scoring for every user job.
- Full native editability for complex charts, formulas, and arbitrary vector art.
- Real implementations for `pdf_to_word` and `pdf_extract_text` unless explicitly added later.
- Copying the host's full `~/.claude` directory into the worker container.

## Architecture

The existing web API remains the entry point:

1. User uploads a PDF via `POST /api/files/upload`.
2. User creates a task via `POST /api/tasks` with `workflowType = "doc_processing"` and `taskType = "pdf_to_ppt"`.
3. The backend calls the worker's `POST /jobs` endpoint.
4. The frontend polls `GET /api/tasks/:id`, which polls the worker's `GET /jobs/:jobId`.
5. On success, the user downloads `<taskId>-result.pptx` through the existing download API.

Inside the worker, the conversion pipeline is:

1. Probe the PDF page count and page sizes.
2. Extract page-level source material with local tools.
3. Ask Claude Code to analyze layout and return structured hints.
4. Build the final PPTX deterministically from extracted elements and Claude hints.
5. Mark the job completed or failed.

The worker owns conversion and output generation. The web app should not know the internals of the conversion pipeline.

## Worker Components

### HTTP server

The existing worker HTTP contract stays in place:

- `GET /health` returns `{ ok: true }`.
- `POST /jobs` accepts `{ taskId, taskType, inputPath, outputDir, config? }` and returns `{ jobId }` quickly.
- `GET /jobs/:jobId` returns `{ status, resultPath?, error? }`.

For `pdf_to_ppt`, `POST /jobs` starts a background conversion. Other task types may remain stubbed or become explicit unsupported responses.

### PDF extractor

The extractor produces deterministic intermediate artifacts per job:

- Page metadata: width, height, rotation, page count.
- Page raster images or thumbnails for Claude visual context.
- Text blocks with coordinates, font sizes, colors, and spans where available.
- Extracted images with page coordinates.
- Basic vector drawing information such as lines and rectangles where practical.

PyMuPDF is the primary candidate for extraction because it can inspect text, images, geometry, and render pages. The output should be normalized into JSON files under the job workspace so it can be inspected and replayed.

### Claude layout analyzer

Claude Code is a required part of the high-quality workflow. Local extraction supplies raw elements, but it is not considered a complete replacement for Claude's layout reasoning.

Claude receives, per page or per small batch:

- The normalized page-elements JSON.
- A page image or thumbnail path.
- A worker-specific prompt and skill describing the expected layout-hints schema.

Claude returns strict JSON with layout hints, such as:

- Text blocks that should be merged into a single title, paragraph, label, or bullet list.
- Table regions and row/column grouping hints.
- Layer ordering hints.
- Identification of background images, logos, photos, icons, and decorative elements.
- Elements that should be ignored or de-emphasized during PPTX reconstruction.

The worker validates Claude's JSON before using it. If Claude authentication fails, times out, or returns invalid JSON, the job should be marked `failed` with a diagnostic error. A low-quality local-only PPTX may be written as a debug artifact, but it must not be reported as a successful conversion result.

### PPTX builder

The builder reads extracted elements and validated Claude layout hints, then writes `<taskId>-result.pptx`.

The builder should:

- Match the PPT slide size to the PDF page size.
- Preserve one slide per PDF page.
- Place extracted images at their page coordinates.
- Create editable text boxes for merged text groups.
- Convert basic lines, rectangles, and simple filled areas into PPT shapes where practical.
- Reconstruct confident tables as editable PPT tables; otherwise use aligned text boxes and border lines.
- Use page images only for assets that cannot be reliably decomposed, not as the default output strategy.

The builder must be deterministic. Claude should provide structure and grouping hints, not directly hand-edit the final PPTX package.

## Claude Code Container Configuration

The worker Docker image should include Claude Code CLI and the dependencies needed by the extraction/build pipeline.

Authentication should use environment variables passed from the host or deployment environment. The design should not copy host auth files into the image.

Skill discovery must use Claude Code's documented locations. The recommended container setup is:

- Set `CLAUDE_CONFIG_DIR=/app/claude-config`.
- Mount or copy only worker-specific skills to `/app/claude-config/skills/<skill-name>/SKILL.md`.
- Store worker prompt templates in a separate explicit directory such as `/app/prompts`.
- Run Claude Code in headless mode with `claude -p`.
- Do not use `--bare` for analyzer calls, because `--bare` disables automatic discovery of skills and related context.

The container must not mount the host's complete `~/.claude` directory, full skills directory, plugins, history, or unrelated settings.

## Runtime Behavior and Timeouts

The target runtime is about 20 pages in under 10 minutes. The hard upper bound is 20 minutes per job.

The worker should enforce:

- A total job deadline.
- Per-Claude-call timeouts.
- Batching of pages for Claude analysis, initially around 3 to 5 pages per batch unless testing shows a better value.
- Immediate failure with a clear diagnostic error when Claude auth/config is missing.
- Failure rather than silent low-quality success when Claude analysis cannot complete.

Job logs should include enough information to diagnose failures:

- Input file path and page count.
- Per-stage durations.
- Claude command invocation mode, without secrets.
- Claude batch count and timeout/failure reason.
- Output path or failure message.

## Testing Strategy

### Worker smoke tests

- Build the worker Docker image.
- Start the worker container with Claude auth environment variables.
- Verify `GET /health` succeeds.
- Verify Claude Code can run headlessly in the container and discover the worker-specific skill.

### Module-level checks

- Run the extractor on sample PDFs and verify it writes page JSON and thumbnails.
- Run the builder on representative extractor/analyzer fixtures and verify it writes a valid PPTX package.
- Validate Claude analyzer output against the expected JSON schema before the builder consumes it.

### End-to-end API test

The primary test path must exercise the app stack:

1. Start Docker Compose with the web app, database, and worker.
2. Ensure Claude auth environment variables are available to the worker.
3. Upload a sample PDF via `POST /api/files/upload`.
4. Create a task via `POST /api/tasks` with `taskType = "pdf_to_ppt"`.
5. Poll `GET /api/tasks/:id` until `completed` or `failed`.
6. Download the generated PPTX through the existing file download API.
7. Verify the PPTX is a valid zip package, slide count matches the PDF page count, and the file contains editable text/shape/picture objects.

Manual visual review remains required for first-pass quality. Runtime visual scoring is intentionally not part of the per-job pipeline.

## Development Benchmark

A separate optional benchmark script may be added later to compare sample outputs against WPS-generated references. It should not run during normal user jobs.

Useful benchmark signals include:

- Slide count match.
- PPTX object counts for text, shapes, pictures, and tables.
- Rendered slide visual comparison against the source PDF or WPS PPTX.
- Runtime per page.

This benchmark is a development tool, not a runtime requirement for first implementation.

## Risks and Constraints

- WPS likely combines PDF vector extraction, OCR/layout models, and domain-specific reconstruction. Exact parity may require multiple iterations.
- Claude Code subprocess startup and page analysis can make the 10-minute target tight. Batching and prompt size control are important.
- Container fonts can affect visual fidelity. The worker should install common CJK and Latin fonts before serious quality tuning.
- Formula-heavy pages and complex charts may need specialized later handling.
- If Claude auth or skill discovery is misconfigured, high-quality conversion should fail fast with a clear error instead of silently producing a poor PPTX.

## External Research Notes

Observed public approaches cluster around the same pipeline: extract native PDF structure when available, apply OCR or AI layout understanding for scanned/complex pages, then rebuild slides as editable objects. Relevant references include WPS PDF-to-PPT/OCR/AI Slides, SlideForge, MinerU2PPT, pdftoppt, PyMuPDF, PptxGenJS, Docling, and recent image-to-editable-slide research.
