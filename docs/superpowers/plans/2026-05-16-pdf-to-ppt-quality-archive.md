# PDF-to-PPT Quality Optimization Archive — 2026-05-16

## Purpose

This note is a context-reset handoff. If the conversation is cleared, start here to understand the current branch state, what has been implemented, what has been verified, and what should happen next.

## Workspace

- Worktree: `/home/alvin/faweb/.claude/worktrees/pdf-to-ppt-worker`
- Branch: `worktree-pdf-to-ppt-worker`
- Base branch: `main`
- Base commit before this quality phase: `895c2c9 chore: archive pdf to ppt workflow state`

## Current implementation status

The branch now contains the PDF-to-PPT quality optimization infrastructure and deterministic builder improvements.

Implemented areas:

1. Development quality comparison harness
   - `workers/doc-processing/scripts/quality_compare.py`
   - `workers/doc-processing/tests/test_quality_compare.py`
   - `workers/doc-processing/package.json` script: `quality:compare`
   - Finds sample PDF/PPTX pairs.
   - Renders source PDF pages.
   - Renders WPS/reference PPTX pages through LibreOffice.
   - Optionally renders generated PPTX pages from a generated output directory.
   - Writes side-by-side review images and `summary.json`.
   - Computes simple pixel differences and PPTX object counts.

2. Claude layout hint schema expansion
   - `workers/doc-processing/src/layout-hints.js`
   - `workers/doc-processing/src/converter.js`
   - `workers/doc-processing/prompts/pdf-layout-analysis.md`
   - `workers/doc-processing/claude-config/skills/pdf-layout-analyzer/SKILL.md`
   - Validated consumed fields now include text style, table confidence, semantic regions, and fallbacks.
   - `style.bullet` must be a real boolean; strings like `"false"` are rejected.
   - Baseline hints now include `regions: []` and `fallbacks: []`.

3. Deterministic PPTX builder quality improvements
   - `workers/doc-processing/scripts/build_pptx.py`
   - `workers/doc-processing/tests/test_build_pptx.py`
   - Preserves source text instead of trusting Claude hint text.
   - Uses largest visible source span for font size/family/color fallback.
   - Applies hint font size, font family, color, alignment, and bullet status.
   - Emits CJK East Asian font XML (`a:ea`) for Chinese text.
   - Safely falls back on invalid six-character non-hex colors.
   - Supports fallback and image-strategy region crops without persistent crop files.
   - Suppresses duplicate source objects using meaningful bbox overlap.
   - Builds confident editable tables and includes omitted in-table source text when Claude table source IDs are incomplete.
   - Keeps low-confidence table hints from suppressing normal source objects.

## Recent commits in this phase

- `e3f25f8 test: add pdf to ppt quality stats harness`
- `0e5a619 feat: add pdf to ppt visual comparison helpers`
- `a220954 feat: add sample quality comparison runner`
- `2ac5e9b feat: extend pdf layout hints for quality reconstruction`
- `a216da0 fix: clarify pdf layout hint prompt schema`
- `5af5eb4 fix: validate pdf layout style booleans`
- `15d9e72 feat: preserve pdf text style in pptx builder`
- `ce5526e test: support direct pptx builder test command`
- `de67441 fix: harden pptx text style output`
- `0990b50 feat: consume pdf layout hints in pptx builder`
- `7e5913c fix: avoid duplicate fallback artifacts`
- `4a6d792 fix: suppress duplicated table content`
- `6e8a23f fix: suppress merged table text duplicates`
- `84815f9 fix: preserve fallback and table content`

## Verification completed

Full worker tests passed:

```bash
npm --prefix workers/doc-processing test
```

Observed results:

- Node tests: 51 passed, 0 failed.
- Python tests: 26 passed, 0 failed.

LibreOffice is available:

```bash
which soffice
# /usr/bin/soffice
```

The quality harness was run in the worktree:

```bash
npm --prefix workers/doc-processing run quality:compare
```

Result: `{"samples": 0, "outputDir": "samples/_quality_compare"}` because this worktree's `workers/doc-processing/samples` directory does not contain the sample PDF/PPTX files.

The same harness was then run against the original checkout's samples directory and wrote artifacts outside the repo:

```bash
python3 workers/doc-processing/scripts/quality_compare.py \
  --samples-dir /home/alvin/faweb/workers/doc-processing/samples \
  --output-dir /tmp/pdf-to-ppt-quality-compare
```

Result: 6 sample pairs processed.

Summary inspected from `/tmp/pdf-to-ppt-quality-compare/summary.json`:

- `Maple Pledge-高管访谈培训材料`: 7 slides, 40 reference text shapes
- `Maple pitchbook_世界模型_vF_001`: 18 slides, 165 reference text shapes
- `test_final`: 19 slides, 151 reference text shapes
- `千诀Teaser外发`: 1 slide, 22 reference text shapes
- `无穹创新_Teaser`: 1 slide, 24 reference text shapes
- `汉阳科技Yarbo BP_2023`: 26 slides, 635 reference text shapes

Final whole-branch code review passed with no blocking issues.

## Important caveat

This phase did not produce a fresh worker-generated PPTX through the real API/E2E path after the builder improvements. The work verified unit/integration tests and the comparison harness, but not a new end-to-end converted PPTX quality result.

## Next recommended step

Run one real `pdf_to_ppt` conversion with the improved worker, then compare the generated PPTX against the WPS reference.

Recommended first sample:

- Input PDF: `/home/alvin/faweb/workers/doc-processing/samples/test_final.pdf`
- WPS reference: `/home/alvin/faweb/workers/doc-processing/samples/test_final.pptx`

Suggested workflow:

1. Start the app stack with worker and Claude auth available.
2. Run the existing API E2E helper for `test_final.pdf` or submit a `doc_processing/pdf_to_ppt` task through the app API.
3. Save the generated PPTX into a generated output directory using the same basename, for example:

```text
/tmp/pdf-to-ppt-generated/test_final.pptx
```

4. Run the quality harness with both samples and generated output:

```bash
python3 workers/doc-processing/scripts/quality_compare.py \
  --samples-dir /home/alvin/faweb/workers/doc-processing/samples \
  --generated-dir /tmp/pdf-to-ppt-generated \
  --output-dir /tmp/pdf-to-ppt-quality-compare-generated
```

5. Inspect:

```text
/tmp/pdf-to-ppt-quality-compare-generated/summary.json
/tmp/pdf-to-ppt-quality-compare-generated/test_final/review/page-*.png
```

6. Use the rendered comparisons to decide the next builder improvement. Do not treat valid PPTX generation alone as quality success.

## Files intentionally not committed as generated artifacts

Generated comparison artifacts should stay out of git unless explicitly requested:

- `workers/doc-processing/samples/_quality_compare/`
- `/tmp/pdf-to-ppt-quality-compare/`
- `/tmp/pdf-to-ppt-quality-compare-generated/`

Python cache directories were removed from the worktree after verification.
