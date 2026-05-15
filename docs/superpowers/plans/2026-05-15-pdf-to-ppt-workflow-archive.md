# PDF-to-PPT Workflow Archive — 2026-05-15

## Current local changes

This branch now has an API-driven PDF-to-PPT workflow that can run end-to-end through the app stack:

1. Upload a PDF through the web API.
2. Create a `doc_processing/pdf_to_ppt` task.
3. Dispatch the task to `doc-worker`.
4. Extract PDF geometry and assets with PyMuPDF.
5. Ask Claude Code for layout hints on a bounded set of pages.
6. Build a PPTX with `python-pptx`.
7. Poll task completion and download the result.

The workflow was verified with:

- Input: `~/faweb/workers/doc-processing/samples/test_final.pdf`
- Output: `/tmp/flowassist-test_final-result.pptx`
- Result file type: Microsoft OOXML PPTX

## Important quality finding

Manual review found the generated PPTX is far below the WPS/sample reference quality and is not usable as a real conversion result.

This implementation should be treated as infrastructure/workflow plumbing only, not as an acceptable PDF-to-PPT quality milestone.

## Notable implementation details

- Dev and production Postgres host port are configurable via `POSTGRES_HOST_PORT`, defaulting to `5435`.
- Dev Docker Compose includes a `claude-proxy` service so containers can reach the host Claude proxy on port `8080`.
- Worker Claude config is writable while worker skills/prompts remain mounted read-only.
- API now rejects unsupported doc-processing task types instead of returning stub outputs.
- API validates `pdf_to_ppt` inputs as PDF files.
- Claude layout analysis now uses:
  - compressed manifest payloads,
  - `--output-format json`,
  - configurable model, default `sonnet`,
  - bounded Claude page coverage, default first 3 pages,
  - geometry baseline hints for the remaining pages.

## Verification already run

- `npm --prefix workers/doc-processing test`
- `npm run build`
- `docker compose config`
- production compose config with `.env.production.example`
- API E2E using `workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs`

Known build warnings remain pre-existing/non-blocking:

- `src/components/admin-shell.tsx` has an unused `Link` import warning.
- Build logs a Prisma `DATABASE_URL` warning during static page generation when no DB env is present.

## Next optimization target

The next task should focus on output quality, not more workflow plumbing.

Primary goal:

- Match the visual quality of the WPS-generated PPTX samples as closely as possible while keeping text/basic shapes/tables editable.

Recommended next steps:

1. Build a quality comparison harness for each sample PDF/PPTX pair.
2. Render generated PPTX and WPS reference PPTX to images for slide-by-slide visual diff.
3. Use the WPS PPTX files as structural references to learn how text boxes, image backgrounds, tables, and grouped objects should be represented.
4. Improve the PPTX builder to preserve typography, colors, alignment, z-order, backgrounds, and image cropping.
5. Revisit Claude’s role: it should identify semantic grouping and difficult layout regions, but deterministic reconstruction should be measured against WPS references.
6. Do not accept a conversion as successful unless the generated PPTX is visually close to the sample reference; merely producing a valid PPTX is insufficient.

## Current caveat

The current generated PPTX proves the pipeline can execute, but it should not be presented as a usable PDF-to-PPT converter yet.
