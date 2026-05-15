# PDF to PPT Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a samples-first `pdf_to_ppt` worker path that uses local PDF extraction plus Claude Code layout analysis to produce editable PPTX files through the existing FlowAssist API.

**Architecture:** Keep `pdf_to_ppt` inside the existing `doc-processing` worker. The worker runs a deterministic pipeline: PyMuPDF extraction writes page artifacts, Claude Code returns strict layout hints, and a Python PPTX builder writes `<taskId>-result.pptx`; failures in Claude analysis fail the job rather than silently returning low-quality output.

**Tech Stack:** Node.js 22, Express 5, built-in `node:test`, Python 3, PyMuPDF, python-pptx, Pillow, Claude Code CLI, Docker Compose.

---

## File Structure

### Existing files to modify

- `workers/doc-processing/package.json` — add test scripts and worker-only runtime configuration scripts.
- `workers/doc-processing/server.js` — reduce to process bootstrap; the Express app moves into `src/create-app.js` for testability.
- `workers/doc-processing/Dockerfile` — switch to a Python-capable Debian image, install Claude Code, Python dependencies, and fonts.
- `docker-compose.yml` — pass Anthropic env vars and mount worker Claude config/prompts for development.
- `deploy/production/docker-compose.yml` — pass Anthropic env vars and mount worker Claude config/prompts for production deployments.

### New worker files

- `workers/doc-processing/src/config.js` — centralizes env parsing, Claude auth checks, timeout constants, and path configuration.
- `workers/doc-processing/src/job-store.js` — in-memory job state with a small interface used by HTTP handlers.
- `workers/doc-processing/src/layout-hints.js` — validates Claude layout hints before the builder consumes them.
- `workers/doc-processing/src/claude-analyzer.js` — invokes `claude -p` headlessly and parses strict JSON output.
- `workers/doc-processing/src/converter.js` — orchestrates extract → analyze → build for one `pdf_to_ppt` job.
- `workers/doc-processing/src/create-app.js` — Express routes wired to the job store and converter.
- `workers/doc-processing/scripts/extract_pdf.py` — PyMuPDF extractor that writes `manifest.json`, page images, text blocks, images, and simple drawings.
- `workers/doc-processing/scripts/build_pptx.py` — python-pptx builder that reads extractor output and Claude hints.
- `workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs` — optional end-to-end API test helper for local Docker Compose runs.
- `workers/doc-processing/requirements.txt` — Python runtime dependencies.
- `workers/doc-processing/prompts/pdf-layout-analysis.md` — prompt content appended to each Claude analysis call.
- `workers/doc-processing/claude-config/skills/pdf-layout-analyzer/SKILL.md` — worker-specific Claude Code skill discovered via `CLAUDE_CONFIG_DIR`.

### New test files

- `workers/doc-processing/tests/config.test.js` — Node tests for env/config behavior.
- `workers/doc-processing/tests/job-store.test.js` — Node tests for job lifecycle state.
- `workers/doc-processing/tests/layout-hints.test.js` — Node tests for analyzer schema validation.
- `workers/doc-processing/tests/claude-analyzer.test.js` — Node tests using a fake `claude` binary.
- `workers/doc-processing/tests/create-app.test.js` — Node tests for worker HTTP routes with a fake converter.
- `workers/doc-processing/tests/test_extract_pdf.py` — Python tests that generate a small PDF fixture and verify extractor artifacts.
- `workers/doc-processing/tests/test_build_pptx.py` — Python tests that build and inspect a PPTX from fixture artifacts.

---

## Task 1: Add Worker Config and Test Harness

**Files:**
- Modify: `workers/doc-processing/package.json`
- Create: `workers/doc-processing/src/config.js`
- Create: `workers/doc-processing/tests/config.test.js`
- Create: `workers/doc-processing/requirements.txt`

- [ ] **Step 1: Write the failing config test**

Create `workers/doc-processing/tests/config.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildClaudeEnv,
  getWorkerConfig,
  requireClaudeAuth,
} = require("../src/config");

test("getWorkerConfig uses safe defaults", () => {
  const config = getWorkerConfig({});

  assert.equal(config.claudeConfigDir, "/app/claude-config");
  assert.equal(config.promptDir, "/app/prompts");
  assert.equal(config.jobTimeoutMs, 20 * 60 * 1000);
  assert.equal(config.claudeBatchTimeoutMs, 90 * 1000);
  assert.equal(config.pageBatchSize, 4);
});

test("buildClaudeEnv preserves auth and sets discovery config", () => {
  const env = buildClaudeEnv({
    ANTHROPIC_API_KEY: "test-key",
    PATH: "/usr/local/bin:/usr/bin",
  }, "/tmp/claude-config");

  assert.equal(env.ANTHROPIC_API_KEY, "test-key");
  assert.equal(env.CLAUDE_CONFIG_DIR, "/tmp/claude-config");
  assert.equal(env.PATH, "/usr/local/bin:/usr/bin");
});

test("requireClaudeAuth accepts Anthropic API key", () => {
  assert.doesNotThrow(() => requireClaudeAuth({ ANTHROPIC_API_KEY: "test-key" }));
});

test("requireClaudeAuth accepts Claude OAuth token", () => {
  assert.doesNotThrow(() => requireClaudeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "token" }));
});

test("requireClaudeAuth fails clearly when no supported auth env exists", () => {
  assert.throws(
    () => requireClaudeAuth({}),
    /Missing Claude auth env: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN/,
  );
});
```

- [ ] **Step 2: Add test scripts to package.json**

Replace `workers/doc-processing/package.json` with:

```json
{
  "name": "doc-processing-worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "test": "npm run test:node && npm run test:python",
    "test:node": "node --test tests/*.test.js",
    "test:python": "python3 -m unittest discover -s tests -p 'test_*.py'"
  },
  "dependencies": {
    "express": "^5.1.0"
  }
}
```

Create `workers/doc-processing/requirements.txt`:

```txt
PyMuPDF>=1.24,<2
python-pptx>=1.0,<2
Pillow>=10,<12
```

- [ ] **Step 3: Run the config test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/config.test.js
```

Expected: FAIL with `Cannot find module '../src/config'`.

- [ ] **Step 4: Implement config.js**

Create `workers/doc-processing/src/config.js`:

```js
function numberFromEnv(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getWorkerConfig(env = process.env) {
  return {
    claudeConfigDir: env.CLAUDE_CONFIG_DIR || "/app/claude-config",
    promptDir: env.CLAUDE_WORKER_PROMPT_DIR || "/app/prompts",
    jobTimeoutMs: numberFromEnv(env, "PDF_TO_PPT_JOB_TIMEOUT_MS", 20 * 60 * 1000),
    claudeBatchTimeoutMs: numberFromEnv(env, "PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS", 90 * 1000),
    pageBatchSize: numberFromEnv(env, "PDF_TO_PPT_PAGE_BATCH_SIZE", 4),
  };
}

function buildClaudeEnv(baseEnv = process.env, claudeConfigDir = getWorkerConfig(baseEnv).claudeConfigDir) {
  return {
    ...baseEnv,
    CLAUDE_CONFIG_DIR: claudeConfigDir,
  };
}

function requireClaudeAuth(env = process.env) {
  if (env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN) return;
  throw new Error("Missing Claude auth env: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN");
}

module.exports = {
  buildClaudeEnv,
  getWorkerConfig,
  requireClaudeAuth,
};
```

- [ ] **Step 5: Run the config test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/config.test.js
```

Expected: PASS for all five config tests.

- [ ] **Step 6: Commit**

```bash
git add workers/doc-processing/package.json workers/doc-processing/requirements.txt workers/doc-processing/src/config.js workers/doc-processing/tests/config.test.js
git commit -m "test: add doc worker config harness"
```

---

## Task 2: Add Job Store

**Files:**
- Create: `workers/doc-processing/src/job-store.js`
- Create: `workers/doc-processing/tests/job-store.test.js`

- [ ] **Step 1: Write the failing job store tests**

Create `workers/doc-processing/tests/job-store.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { createJobStore } = require("../src/job-store");

test("createJob stores processing job state", () => {
  const store = createJobStore(() => "job-1");

  const job = store.createJob({ taskId: "task-1", taskType: "pdf_to_ppt" });

  assert.equal(job.jobId, "job-1");
  assert.equal(job.status, "processing");
  assert.equal(job.taskId, "task-1");
  assert.equal(store.getJob("job-1").taskType, "pdf_to_ppt");
});

test("completeJob records result path", () => {
  const store = createJobStore(() => "job-1");
  store.createJob({ taskId: "task-1", taskType: "pdf_to_ppt" });

  store.completeJob("job-1", "/tmp/result.pptx");

  assert.deepEqual(store.getPublicJob("job-1"), {
    status: "completed",
    resultPath: "/tmp/result.pptx",
    error: undefined,
  });
});

test("failJob records error message", () => {
  const store = createJobStore(() => "job-1");
  store.createJob({ taskId: "task-1", taskType: "pdf_to_ppt" });

  store.failJob("job-1", new Error("Claude failed"));

  assert.deepEqual(store.getPublicJob("job-1"), {
    status: "failed",
    resultPath: undefined,
    error: "Claude failed",
  });
});

test("getPublicJob returns null for unknown job", () => {
  const store = createJobStore(() => "job-1");
  assert.equal(store.getPublicJob("missing"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/job-store.test.js
```

Expected: FAIL with `Cannot find module '../src/job-store'`.

- [ ] **Step 3: Implement job-store.js**

Create `workers/doc-processing/src/job-store.js`:

```js
const { randomUUID } = require("node:crypto");

function createJobStore(idFactory = randomUUID) {
  const jobs = new Map();

  function createJob(payload) {
    const jobId = idFactory();
    const job = {
      jobId,
      status: "processing",
      taskId: payload.taskId,
      taskType: payload.taskType,
      inputPath: payload.inputPath,
      outputDir: payload.outputDir,
      resultPath: undefined,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobs.set(jobId, job);
    return job;
  }

  function getJob(jobId) {
    return jobs.get(jobId) || null;
  }

  function getPublicJob(jobId) {
    const job = getJob(jobId);
    if (!job) return null;
    return {
      status: job.status,
      resultPath: job.resultPath,
      error: job.error,
    };
  }

  function completeJob(jobId, resultPath) {
    const job = getJob(jobId);
    if (!job) return;
    job.status = "completed";
    job.resultPath = resultPath;
    job.error = undefined;
    job.updatedAt = new Date();
  }

  function failJob(jobId, error) {
    const job = getJob(jobId);
    if (!job) return;
    job.status = "failed";
    job.resultPath = undefined;
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = new Date();
  }

  return {
    createJob,
    getJob,
    getPublicJob,
    completeJob,
    failJob,
  };
}

module.exports = { createJobStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/job-store.test.js
```

Expected: PASS for all four job store tests.

- [ ] **Step 5: Commit**

```bash
git add workers/doc-processing/src/job-store.js workers/doc-processing/tests/job-store.test.js
git commit -m "feat: add doc worker job store"
```

---

## Task 3: Add PDF Extractor

**Files:**
- Create: `workers/doc-processing/scripts/extract_pdf.py`
- Create: `workers/doc-processing/tests/test_extract_pdf.py`

- [ ] **Step 1: Write the failing extractor test**

Create `workers/doc-processing/tests/test_extract_pdf.py`:

```python
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
```

- [ ] **Step 2: Run extractor test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:python -- tests/test_extract_pdf.py
```

Expected: FAIL because `scripts/extract_pdf.py` does not exist.

- [ ] **Step 3: Implement extract_pdf.py**

Create `workers/doc-processing/scripts/extract_pdf.py`:

```python
import json
import sys
from pathlib import Path

import fitz


def color_to_hex(color):
    if color is None:
        return None
    if isinstance(color, int):
        return "#%06x" % (color & 0xFFFFFF)
    if isinstance(color, (list, tuple)) and len(color) >= 3:
        return "#%02x%02x%02x" % tuple(max(0, min(255, round(c * 255))) for c in color[:3])
    return None


def rect_to_list(rect):
    return [float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])]


def extract_text_blocks(page):
    result = []
    text_dict = page.get_text("dict")
    index = 0
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        lines = []
        spans_out = []
        for line in block.get("lines", []):
            line_text = "".join(span.get("text", "") for span in line.get("spans", []))
            if line_text.strip():
                lines.append(line_text)
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text.strip():
                    continue
                spans_out.append({
                    "text": text,
                    "bbox": rect_to_list(span.get("bbox", [0, 0, 0, 0])),
                    "font": span.get("font"),
                    "size": float(span.get("size", 0)),
                    "color": color_to_hex(span.get("color")),
                })
        text = "\n".join(lines).strip()
        if not text:
            continue
        result.append({
            "id": f"t{index}",
            "text": text,
            "bbox": rect_to_list(block.get("bbox", [0, 0, 0, 0])),
            "spans": spans_out,
        })
        index += 1
    return result


def extract_images(page, doc, page_dir):
    result = []
    image_index = 0
    for image in page.get_images(full=True):
        xref = image[0]
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.alpha:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            name = f"image-{image_index}.png"
            path = page_dir / name
            pix.save(path)
            rects = page.get_image_rects(xref)
            bbox = rect_to_list(rects[0]) if rects else [0, 0, pix.width, pix.height]
            result.append({
                "id": f"i{image_index}",
                "path": str(Path(page_dir.name) / name),
                "bbox": bbox,
                "width": pix.width,
                "height": pix.height,
            })
            image_index += 1
        except Exception:
            continue
    return result


def extract_drawings(page):
    result = []
    for index, drawing in enumerate(page.get_drawings()):
        rect = drawing.get("rect")
        if rect is None:
            continue
        result.append({
            "id": f"d{index}",
            "bbox": rect_to_list(rect),
            "fill": color_to_hex(drawing.get("fill")),
            "stroke": color_to_hex(drawing.get("color")),
            "width": float(drawing.get("width") or 0),
        })
    return result


def extract_pdf(pdf_path, output_dir):
    pdf_path = Path(pdf_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    pages = []
    for page_index, page in enumerate(doc):
        page_number = page_index + 1
        page_dir = output_dir / f"page-{page_number:03d}"
        page_dir.mkdir(parents=True, exist_ok=True)

        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        image_name = "page.png"
        pix.save(page_dir / image_name)

        page_info = {
            "pageNumber": page_number,
            "width": float(page.rect.width),
            "height": float(page.rect.height),
            "rotation": int(page.rotation),
            "imagePath": str(Path(page_dir.name) / image_name),
            "textBlocks": extract_text_blocks(page),
            "images": extract_images(page, doc, page_dir),
            "drawings": extract_drawings(page),
        }
        pages.append(page_info)

    manifest = {
        "pdfPath": str(pdf_path),
        "pageCount": len(pages),
        "pages": pages,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    doc.close()


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_pdf.py <input.pdf> <output-dir>")
    extract_pdf(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run extractor test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:python -- tests/test_extract_pdf.py
```

Expected: PASS for the extractor test.

- [ ] **Step 5: Commit**

```bash
git add workers/doc-processing/scripts/extract_pdf.py workers/doc-processing/tests/test_extract_pdf.py
git commit -m "feat: add pdf extraction artifacts"
```

---

## Task 4: Add Claude Layout Hint Validation

**Files:**
- Create: `workers/doc-processing/src/layout-hints.js`
- Create: `workers/doc-processing/tests/layout-hints.test.js`

- [ ] **Step 1: Write the failing layout hints tests**

Create `workers/doc-processing/tests/layout-hints.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { validateLayoutHints } = require("../src/layout-hints");

test("validateLayoutHints accepts page hints with merged text and tables", () => {
  const hints = validateLayoutHints({
    pages: [
      {
        pageNumber: 1,
        mergedTextBlocks: [
          {
            id: "m1",
            sourceTextBlockIds: ["t1", "t2"],
            role: "title",
            text: "Merged title",
            bbox: [10, 20, 300, 80],
          },
        ],
        tables: [
          {
            id: "table1",
            bbox: [10, 100, 400, 220],
            rows: 2,
            columns: 3,
            sourceTextBlockIds: ["t3", "t4"],
          },
        ],
        ignoredBlockIds: ["d1"],
        imageRoles: [{ imageId: "i1", role: "logo" }],
      },
    ],
  });

  assert.equal(hints.pages[0].pageNumber, 1);
  assert.equal(hints.pages[0].mergedTextBlocks[0].role, "title");
});

test("validateLayoutHints rejects missing pages", () => {
  assert.throws(() => validateLayoutHints({}), /layout hints must contain pages array/);
});

test("validateLayoutHints rejects invalid bbox", () => {
  assert.throws(
    () => validateLayoutHints({ pages: [{ pageNumber: 1, mergedTextBlocks: [{ id: "m1", sourceTextBlockIds: ["t1"], role: "body", text: "x", bbox: [0, 1, 2] }] }] }),
    /bbox must contain four numbers/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/layout-hints.test.js
```

Expected: FAIL with `Cannot find module '../src/layout-hints'`.

- [ ] **Step 3: Implement layout-hints.js**

Create `workers/doc-processing/src/layout-hints.js`:

```js
function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
}

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("bbox must contain four numbers");
  }
  return bbox.map(Number);
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined) return [];
  assertArray(value, `${fieldName} must be an array`);
  return value.map((item) => String(item));
}

function normalizeMergedTextBlock(block) {
  assertObject(block, "mergedTextBlocks entries must be objects");
  return {
    id: String(block.id),
    sourceTextBlockIds: normalizeStringArray(block.sourceTextBlockIds, "sourceTextBlockIds"),
    role: String(block.role || "body"),
    text: String(block.text || ""),
    bbox: normalizeBbox(block.bbox),
  };
}

function normalizeTable(table) {
  assertObject(table, "tables entries must be objects");
  return {
    id: String(table.id),
    bbox: normalizeBbox(table.bbox),
    rows: Number(table.rows),
    columns: Number(table.columns),
    sourceTextBlockIds: normalizeStringArray(table.sourceTextBlockIds, "sourceTextBlockIds"),
  };
}

function normalizeImageRole(imageRole) {
  assertObject(imageRole, "imageRoles entries must be objects");
  return {
    imageId: String(imageRole.imageId),
    role: String(imageRole.role || "image"),
  };
}

function validateLayoutHints(value) {
  assertObject(value, "layout hints must be an object");
  assertArray(value.pages, "layout hints must contain pages array");

  return {
    pages: value.pages.map((page) => {
      assertObject(page, "page hints must be objects");
      return {
        pageNumber: Number(page.pageNumber),
        mergedTextBlocks: (page.mergedTextBlocks || []).map(normalizeMergedTextBlock),
        tables: (page.tables || []).map(normalizeTable),
        ignoredBlockIds: normalizeStringArray(page.ignoredBlockIds, "ignoredBlockIds"),
        imageRoles: (page.imageRoles || []).map(normalizeImageRole),
      };
    }),
  };
}

module.exports = { validateLayoutHints };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/layout-hints.test.js
```

Expected: PASS for all three layout hint tests.

- [ ] **Step 5: Commit**

```bash
git add workers/doc-processing/src/layout-hints.js workers/doc-processing/tests/layout-hints.test.js
git commit -m "feat: validate claude layout hints"
```

---

## Task 5: Add Worker Claude Skill, Prompt, and Analyzer

**Files:**
- Create: `workers/doc-processing/claude-config/skills/pdf-layout-analyzer/SKILL.md`
- Create: `workers/doc-processing/prompts/pdf-layout-analysis.md`
- Create: `workers/doc-processing/src/claude-analyzer.js`
- Create: `workers/doc-processing/tests/claude-analyzer.test.js`

- [ ] **Step 1: Create Claude skill and prompt files**

Create `workers/doc-processing/claude-config/skills/pdf-layout-analyzer/SKILL.md`:

```markdown
---
name: pdf-layout-analyzer
description: Analyze extracted PDF page elements and page images for editable PPTX reconstruction. Use when asked to produce layout hints for PDF-to-PPT conversion.
---

You analyze PDF pages for reconstruction as editable PowerPoint slides.

Rules:
- Return only valid JSON.
- Do not include markdown fences.
- Do not rewrite source text unless merging adjacent fragments that visibly belong together.
- Prefer grouping fragmented title/body text into fewer editable text boxes.
- Identify table regions when text blocks align into rows and columns.
- Mark purely decorative extracted blocks as ignored only when they would harm editability or duplicate background imagery.
- Preserve page numbers and source block IDs exactly.

The JSON shape must be:

{
  "pages": [
    {
      "pageNumber": 1,
      "mergedTextBlocks": [
        {
          "id": "m1",
          "sourceTextBlockIds": ["t1", "t2"],
          "role": "title",
          "text": "Merged visible text",
          "bbox": [10, 20, 300, 80]
        }
      ],
      "tables": [
        {
          "id": "table1",
          "bbox": [10, 100, 400, 220],
          "rows": 2,
          "columns": 3,
          "sourceTextBlockIds": ["t3", "t4", "t5"]
        }
      ],
      "ignoredBlockIds": ["d1"],
      "imageRoles": [
        { "imageId": "i1", "role": "logo" }
      ]
    }
  ]
}
```

Create `workers/doc-processing/prompts/pdf-layout-analysis.md`:

```markdown
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
```

- [ ] **Step 2: Write the failing analyzer tests**

Create `workers/doc-processing/tests/claude-analyzer.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, chmod } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { analyzeLayoutWithClaude, extractJsonObject } = require("../src/claude-analyzer");

async function fakeClaudeDir(stdout) {
  const dir = await mkdtemp(join(tmpdir(), "fake-claude-"));
  const bin = join(dir, "claude");
  await writeFile(bin, `#!/bin/sh\nprintf '%s' '${stdout.replaceAll("'", "'\\''")}'\n`);
  await chmod(bin, 0o755);
  return dir;
}

test("extractJsonObject parses clean JSON", () => {
  assert.deepEqual(extractJsonObject('{"pages":[]}'), { pages: [] });
});

test("extractJsonObject parses JSON surrounded by logs", () => {
  assert.deepEqual(extractJsonObject('log before\n{"pages":[]}\nlog after'), { pages: [] });
});

test("analyzeLayoutWithClaude invokes claude and validates hints", async () => {
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');
  const result = await analyzeLayoutWithClaude({
    manifestPath: "/tmp/job/manifest.json",
    pageNumbers: [1],
    promptPath: "/tmp/prompt.md",
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  assert.equal(result.pages[0].pageNumber, 1);
});

test("analyzeLayoutWithClaude fails when auth env is missing", async () => {
  await assert.rejects(
    () => analyzeLayoutWithClaude({
      manifestPath: "/tmp/job/manifest.json",
      pageNumbers: [1],
      promptPath: "/tmp/prompt.md",
      claudeConfigDir: "/tmp/claude-config",
      timeoutMs: 5000,
      env: { PATH: process.env.PATH },
    }),
    /Missing Claude auth env/,
  );
});
```

- [ ] **Step 3: Run analyzer test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/claude-analyzer.test.js
```

Expected: FAIL with `Cannot find module '../src/claude-analyzer'`.

- [ ] **Step 4: Implement claude-analyzer.js**

Create `workers/doc-processing/src/claude-analyzer.js`:

```js
const { spawn } = require("node:child_process");
const { readFile } = require("node:fs/promises");

const { buildClaudeEnv, requireClaudeAuth } = require("./config");
const { validateLayoutHints } = require("./layout-hints");

function extractJsonObject(text) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("Claude output did not contain a JSON object");
  }
  return JSON.parse(text.slice(first, last + 1));
}

function runClaude(prompt, options) {
  return new Promise((resolve, reject) => {
    const env = buildClaudeEnv(options.env, options.claudeConfigDir);
    const child = spawn("claude", ["-p", "--allowedTools", "Read"], {
      cwd: options.cwd || process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Claude analysis timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.end(prompt);
  });
}

async function analyzeLayoutWithClaude(options) {
  requireClaudeAuth(options.env);
  const promptBase = await readFile(options.promptPath, "utf8").catch(() => "");
  const prompt = `${promptBase}\n\nManifest path: ${options.manifestPath}\nPage numbers: ${options.pageNumbers.join(", ")}\nReturn only JSON.`;
  const stdout = await runClaude(prompt, options);
  return validateLayoutHints(extractJsonObject(stdout));
}

module.exports = {
  analyzeLayoutWithClaude,
  extractJsonObject,
};
```

- [ ] **Step 5: Run analyzer tests to verify they pass**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/claude-analyzer.test.js
```

Expected: PASS for all four analyzer tests.

- [ ] **Step 6: Commit**

```bash
git add workers/doc-processing/claude-config workers/doc-processing/prompts workers/doc-processing/src/claude-analyzer.js workers/doc-processing/tests/claude-analyzer.test.js
git commit -m "feat: add claude layout analyzer"
```

---

## Task 6: Add PPTX Builder

**Files:**
- Create: `workers/doc-processing/scripts/build_pptx.py`
- Create: `workers/doc-processing/tests/test_build_pptx.py`

- [ ] **Step 1: Write the failing builder test**

Create `workers/doc-processing/tests/test_build_pptx.py`:

```python
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
```

- [ ] **Step 2: Run builder test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:python -- tests/test_build_pptx.py
```

Expected: FAIL because `scripts/build_pptx.py` does not exist.

- [ ] **Step 3: Implement build_pptx.py**

Create `workers/doc-processing/scripts/build_pptx.py`:

```python
import json
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt


def points(value):
    return Inches(float(value) / 72.0)


def bbox_to_position(bbox):
    x1, y1, x2, y2 = bbox
    return points(x1), points(y1), points(max(1, x2 - x1)), points(max(1, y2 - y1))


def parse_color(value, fallback="000000"):
    if not value or not isinstance(value, str):
        value = fallback
    value = value.lstrip("#")
    if len(value) != 6:
        value = fallback
    return RGBColor(int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def find_page_hints(hints, page_number):
    for page in hints.get("pages", []):
        if int(page.get("pageNumber", 0)) == int(page_number):
            return page
    return {"mergedTextBlocks": [], "tables": [], "ignoredBlockIds": [], "imageRoles": []}


def add_text_box(slide, text_item):
    left, top, width, height = bbox_to_position(text_item["bbox"])
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.clear()
    paragraph = frame.paragraphs[0]
    run = paragraph.add_run()
    run.text = text_item.get("text", "")
    run.font.size = Pt(14 if text_item.get("role") == "body" else 20)
    run.font.color.rgb = parse_color(text_item.get("color"), "111111")
    return box


def add_drawing(slide, drawing):
    left, top, width, height = bbox_to_position(drawing["bbox"])
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    if drawing.get("fill"):
        shape.fill.solid()
        shape.fill.fore_color.rgb = parse_color(drawing.get("fill"), "ffffff")
    else:
        shape.fill.background()
    if drawing.get("stroke"):
        shape.line.color.rgb = parse_color(drawing.get("stroke"), "000000")
    return shape


def add_image(slide, manifest_root, image):
    path = manifest_root / image["path"]
    if not path.exists():
        return None
    left, top, width, height = bbox_to_position(image["bbox"])
    return slide.shapes.add_picture(str(path), left, top, width, height)


def build_pptx(manifest_path, hints_path, output_path):
    manifest_path = Path(manifest_path)
    hints_path = Path(hints_path)
    output_path = Path(output_path)
    manifest = json.loads(manifest_path.read_text())
    hints = json.loads(hints_path.read_text())

    prs = Presentation()
    first_page = manifest["pages"][0]
    prs.slide_width = points(first_page["width"])
    prs.slide_height = points(first_page["height"])
    blank_layout = prs.slide_layouts[6]

    for page in manifest["pages"]:
        slide = prs.slides.add_slide(blank_layout)
        page_hints = find_page_hints(hints, page["pageNumber"])
        ignored = set(page_hints.get("ignoredBlockIds", []))
        merged_source_ids = set()

        for image in page.get("images", []):
            if image.get("id") not in ignored:
                add_image(slide, manifest_path.parent, image)

        for drawing in page.get("drawings", []):
            if drawing.get("id") not in ignored:
                add_drawing(slide, drawing)

        for item in page_hints.get("mergedTextBlocks", []):
            add_text_box(slide, item)
            merged_source_ids.update(item.get("sourceTextBlockIds", []))

        for block in page.get("textBlocks", []):
            if block.get("id") in ignored or block.get("id") in merged_source_ids:
                continue
            add_text_box(slide, {
                "text": block.get("text", ""),
                "bbox": block.get("bbox", [0, 0, 1, 1]),
                "role": "body",
                "color": block.get("spans", [{}])[0].get("color", "#111111") if block.get("spans") else "#111111",
            })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(output_path)


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: build_pptx.py <manifest.json> <hints.json> <output.pptx>")
    build_pptx(sys.argv[1], sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run builder test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:python -- tests/test_build_pptx.py
```

Expected: PASS for the builder test.

- [ ] **Step 5: Commit**

```bash
git add workers/doc-processing/scripts/build_pptx.py workers/doc-processing/tests/test_build_pptx.py
git commit -m "feat: build editable pptx from layout hints"
```

---

## Task 7: Add Converter Orchestration

**Files:**
- Create: `workers/doc-processing/src/converter.js`
- Create: `workers/doc-processing/tests/converter.test.js`

- [ ] **Step 1: Write the failing converter tests**

Create `workers/doc-processing/tests/converter.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { convertPdfToPpt, writeLayoutHints } = require("../src/converter");

test("writeLayoutHints writes validated hints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "converter-"));
  const path = await writeLayoutHints(dir, { pages: [{ pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] }] });
  assert.equal(path, join(dir, "layout-hints.json"));
  assert.equal(existsSync(path), true);
});

test("convertPdfToPpt runs extract analyze build in order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "converter-"));
  const inputPath = join(dir, "input.pdf");
  await writeFile(inputPath, "fake pdf");
  const calls = [];

  const resultPath = await convertPdfToPpt({
    taskId: "task-1",
    inputPath,
    outputDir: dir,
    config: {
      promptDir: dir,
      claudeConfigDir: dir,
      jobTimeoutMs: 5000,
      claudeBatchTimeoutMs: 1000,
      pageBatchSize: 4,
    },
    deps: {
      extract: async () => {
        calls.push("extract");
        return { manifestPath: join(dir, "manifest.json"), pageNumbers: [1] };
      },
      analyze: async () => {
        calls.push("analyze");
        return { pages: [{ pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] }] };
      },
      build: async () => {
        calls.push("build");
        const output = join(dir, "task-1-result.pptx");
        await writeFile(output, "pptx");
        return output;
      },
    },
  });

  assert.deepEqual(calls, ["extract", "analyze", "build"]);
  assert.equal(resultPath, join(dir, "task-1-result.pptx"));
});

test("convertPdfToPpt fails when analyzer fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "converter-"));
  const inputPath = join(dir, "input.pdf");
  await writeFile(inputPath, "fake pdf");

  await assert.rejects(
    () => convertPdfToPpt({
      taskId: "task-1",
      inputPath,
      outputDir: dir,
      config: {
        promptDir: dir,
        claudeConfigDir: dir,
        jobTimeoutMs: 5000,
        claudeBatchTimeoutMs: 1000,
        pageBatchSize: 4,
      },
      deps: {
        extract: async () => ({ manifestPath: join(dir, "manifest.json"), pageNumbers: [1] }),
        analyze: async () => { throw new Error("Claude failed"); },
        build: async () => { throw new Error("builder should not run"); },
      },
    }),
    /Claude failed/,
  );
});
```

- [ ] **Step 2: Run converter test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/converter.test.js
```

Expected: FAIL with `Cannot find module '../src/converter'`.

- [ ] **Step 3: Implement converter.js**

Create `workers/doc-processing/src/converter.js`:

```js
const { spawn } = require("node:child_process");
const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const { analyzeLayoutWithClaude } = require("./claude-analyzer");
const { validateLayoutHints } = require("./layout-hints");

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function defaultExtract(inputPath, jobDir) {
  const extractDir = join(jobDir, "extract");
  await runCommand("python3", ["scripts/extract_pdf.py", inputPath, extractDir], { cwd: process.cwd() });
  const manifestPath = join(extractDir, "manifest.json");
  const manifest = require(manifestPath);
  return {
    manifestPath,
    pageNumbers: manifest.pages.map((page) => page.pageNumber),
  };
}

async function defaultAnalyze(manifestPath, pageNumbers, config) {
  const promptPath = join(config.promptDir, "pdf-layout-analysis.md");
  return analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers,
    promptPath,
    claudeConfigDir: config.claudeConfigDir,
    timeoutMs: config.claudeBatchTimeoutMs,
    env: process.env,
  });
}

async function defaultBuild(manifestPath, hintsPath, outputPath) {
  await runCommand("python3", ["scripts/build_pptx.py", manifestPath, hintsPath, outputPath], { cwd: process.cwd() });
  return outputPath;
}

async function writeLayoutHints(jobDir, hints) {
  const validated = validateLayoutHints(hints);
  const path = join(jobDir, "layout-hints.json");
  await writeFile(path, JSON.stringify(validated, null, 2));
  return path;
}

async function convertPdfToPpt(options) {
  const { taskId, inputPath, outputDir, config } = options;
  const deps = options.deps || {};
  const extract = deps.extract || defaultExtract;
  const analyze = deps.analyze || defaultAnalyze;
  const build = deps.build || defaultBuild;

  const jobDir = join(outputDir, `${taskId}-work`);
  await mkdir(jobDir, { recursive: true });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`PDF to PPT job timed out after ${config.jobTimeoutMs}ms`)), config.jobTimeoutMs);
  });

  const work = async () => {
    const extracted = await extract(inputPath, jobDir, config);
    const hints = await analyze(extracted.manifestPath, extracted.pageNumbers, config);
    const hintsPath = await writeLayoutHints(jobDir, hints);
    const outputPath = join(outputDir, `${taskId}-result.pptx`);
    return build(extracted.manifestPath, hintsPath, outputPath, config);
  };

  return Promise.race([work(), timeout]);
}

module.exports = {
  convertPdfToPpt,
  writeLayoutHints,
};
```

- [ ] **Step 4: Run converter test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/converter.test.js
```

Expected: PASS for all three converter tests.

- [ ] **Step 5: Commit**

```bash
git add workers/doc-processing/src/converter.js workers/doc-processing/tests/converter.test.js
git commit -m "feat: orchestrate pdf to ppt conversion"
```

---

## Task 8: Wire Express Routes to the Converter

**Files:**
- Create: `workers/doc-processing/src/create-app.js`
- Modify: `workers/doc-processing/server.js`
- Create: `workers/doc-processing/tests/create-app.test.js`

- [ ] **Step 1: Write the failing app tests**

Create `workers/doc-processing/tests/create-app.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { createApp } = require("../src/create-app");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("health returns ok", async () => {
  const { server, baseUrl } = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("pdf_to_ppt job completes through HTTP contract", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "app-"));
  const inputPath = join(tmp, "input.pdf");
  await writeFile(inputPath, "fake pdf");

  const app = createApp({
    converter: async ({ taskId, outputDir }) => {
      const result = join(outputDir, `${taskId}-result.pptx`);
      await writeFile(result, "pptx");
      return result;
    },
  });
  const { server, baseUrl } = await listen(app);

  try {
    const createRes = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task-1", taskType: "pdf_to_ppt", inputPath, outputDir: tmp }),
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    assert.equal(typeof created.jobId, "string");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const pollRes = await fetch(`${baseUrl}/jobs/${created.jobId}`);
    assert.equal(pollRes.status, 200);
    const polled = await pollRes.json();
    assert.equal(polled.status, "completed");
    assert.equal(polled.resultPath, join(tmp, "task-1-result.pptx"));
  } finally {
    server.close();
  }
});

test("missing fields return 400", async () => {
  const { server, baseUrl } = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task-1" }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run app test to verify it fails**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/create-app.test.js
```

Expected: FAIL with `Cannot find module '../src/create-app'`.

- [ ] **Step 3: Implement create-app.js**

Create `workers/doc-processing/src/create-app.js`:

```js
const express = require("express");
const { writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const { convertPdfToPpt } = require("./converter");
const { getWorkerConfig } = require("./config");
const { createJobStore } = require("./job-store");

function legacyStub(taskId, taskType, inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await mkdir(outputDir, { recursive: true });
        const ext = taskType === "pdf_to_word" ? "docx" : "txt";
        const resultPath = join(outputDir, `${taskId}-result.${ext}`);
        await writeFile(resultPath, `Stub output for ${taskType} from ${inputPath}`);
        resolve(resultPath);
      } catch (error) {
        reject(error);
      }
    }, 500);
  });
}

function createApp(options = {}) {
  const app = express();
  const store = options.store || createJobStore();
  const converter = options.converter || ((payload) => convertPdfToPpt({ ...payload, config: getWorkerConfig() }));

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/jobs", async (req, res) => {
    const { taskId, taskType, inputPath, outputDir, config } = req.body;

    if (!taskId || !taskType || !inputPath || !outputDir) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const job = store.createJob({ taskId, taskType, inputPath, outputDir });

    const runner = taskType === "pdf_to_ppt"
      ? converter({ taskId, inputPath, outputDir, config })
      : legacyStub(taskId, taskType, inputPath, outputDir);

    runner
      .then((resultPath) => store.completeJob(job.jobId, resultPath))
      .catch((error) => store.failJob(job.jobId, error));

    return res.json({ jobId: job.jobId });
  });

  app.get("/jobs/:jobId", (req, res) => {
    const job = store.getPublicJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    return res.json(job);
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Replace server.js with bootstrap**

Replace `workers/doc-processing/server.js` with:

```js
const { createApp } = require("./src/create-app");

const PORT = process.env.PORT ?? 8001;
const app = createApp();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Doc processing worker listening on :${PORT}`);
});
```

- [ ] **Step 5: Run app test to verify it passes**

Run:

```bash
npm --prefix workers/doc-processing run test:node -- tests/create-app.test.js
```

Expected: PASS for all three app tests.

- [ ] **Step 6: Run all worker tests**

Run:

```bash
npm --prefix workers/doc-processing test
```

Expected: PASS for Node and Python worker tests.

- [ ] **Step 7: Commit**

```bash
git add workers/doc-processing/server.js workers/doc-processing/src/create-app.js workers/doc-processing/tests/create-app.test.js
git commit -m "feat: wire pdf to ppt worker route"
```

---

## Task 9: Configure Docker and Compose for Claude Worker Runtime

**Files:**
- Modify: `workers/doc-processing/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `deploy/production/docker-compose.yml`

- [ ] **Step 1: Update Dockerfile**

Replace `workers/doc-processing/Dockerfile` with:

```dockerfile
FROM node:22-bookworm-slim

ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=$NPM_CONFIG_REGISTRY
ENV CLAUDE_CONFIG_DIR=/app/claude-config
ENV CLAUDE_WORKER_PROMPT_DIR=/app/prompts
ENV PATH="/opt/worker-venv/bin:$PATH"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fonts-liberation \
    python3 \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  && npm install -g @anthropic-ai/claude-code

COPY requirements.txt ./
RUN python3 -m venv /opt/worker-venv \
  && pip install --no-cache-dir -r requirements.txt

COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY claude-config ./claude-config
COPY prompts ./prompts

EXPOSE 8001

CMD ["node", "server.js"]
```

- [ ] **Step 2: Update development compose environment and mounts**

In `docker-compose.yml`, replace the `doc-worker` service with:

```yaml
  doc-worker:
    build:
      context: ./workers/doc-processing
    environment:
      PORT: 8001
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      CLAUDE_CODE_OAUTH_TOKEN: ${CLAUDE_CODE_OAUTH_TOKEN:-}
      CLAUDE_CONFIG_DIR: /app/claude-config
      CLAUDE_WORKER_PROMPT_DIR: /app/prompts
      PDF_TO_PPT_JOB_TIMEOUT_MS: ${PDF_TO_PPT_JOB_TIMEOUT_MS:-1200000}
      PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS: ${PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS:-90000}
      PDF_TO_PPT_PAGE_BATCH_SIZE: ${PDF_TO_PPT_PAGE_BATCH_SIZE:-4}
    volumes:
      - shared-storage:/app/storage
      - ./workers/doc-processing/claude-config:/app/claude-config:ro
      - ./workers/doc-processing/prompts:/app/prompts:ro
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://localhost:8001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 10s
      timeout: 5s
      retries: 5
```

- [ ] **Step 3: Update production compose environment and mounts**

In `deploy/production/docker-compose.yml`, replace the `doc-worker` service with:

```yaml
  doc-worker:
    build:
      context: ../../workers/doc-processing
      args:
        NPM_CONFIG_REGISTRY: ${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}
    restart: unless-stopped
    environment:
      PORT: 8001
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      CLAUDE_CODE_OAUTH_TOKEN: ${CLAUDE_CODE_OAUTH_TOKEN:-}
      CLAUDE_CONFIG_DIR: /app/claude-config
      CLAUDE_WORKER_PROMPT_DIR: /app/prompts
      PDF_TO_PPT_JOB_TIMEOUT_MS: ${PDF_TO_PPT_JOB_TIMEOUT_MS:-1200000}
      PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS: ${PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS:-90000}
      PDF_TO_PPT_PAGE_BATCH_SIZE: ${PDF_TO_PPT_PAGE_BATCH_SIZE:-4}
    volumes:
      - flowassist-shared-storage:/app/storage
      - ../../workers/doc-processing/claude-config:/app/claude-config:ro
      - ../../workers/doc-processing/prompts:/app/prompts:ro
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://localhost:8001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 10s
      timeout: 5s
      retries: 5
```

- [ ] **Step 4: Validate compose files**

Run:

```bash
docker compose config >/tmp/flowassist-compose.yml
```

Expected: exit 0.

Run:

```bash
cd deploy/production && docker compose --env-file .env.production.example config >/tmp/flowassist-prod-compose.yml
```

Expected: exit 0, or a clear error only if `.env.production.example` lacks required production variables that must be copied first.

- [ ] **Step 5: Build worker image**

Run:

```bash
docker compose build doc-worker
```

Expected: image builds successfully and installs Node, Python dependencies, fonts, and Claude Code CLI.

- [ ] **Step 6: Commit**

```bash
git add workers/doc-processing/Dockerfile docker-compose.yml deploy/production/docker-compose.yml
git commit -m "feat: configure claude pdf worker runtime"
```

---

## Task 10: Add End-to-End API Test Helper

**Files:**
- Create: `workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs`

- [ ] **Step 1: Create the e2e helper script**

Create `workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs`:

```js
import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Readable } from "node:stream";

const baseUrl = process.env.FLOWASSIST_BASE_URL || "http://localhost:60001";
const username = process.env.FLOWASSIST_USERNAME || "admin";
const password = process.env.FLOWASSIST_PASSWORD || "123456";
const samplePdf = resolve(process.env.SAMPLE_PDF || "workers/doc-processing/samples/test_final.pdf");
const outputPptx = resolve(process.env.OUTPUT_PPTX || "/tmp/flowassist-pdf-to-ppt-result.pptx");
const pollTimeoutMs = Number(process.env.E2E_TIMEOUT_MS || 20 * 60 * 1000);

let cookie = "";

function rememberCookies(res) {
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const raw = setCookie.length > 0 ? setCookie : [res.headers.get("set-cookie")].filter(Boolean);
  if (raw.length > 0) {
    cookie = raw.map((value) => value.split(";")[0]).join("; ");
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  rememberCookies(res);
  return res;
}

async function login() {
  const form = new FormData();
  form.set("username", username);
  form.set("password", password);
  const res = await request("/api/auth/login", { method: "POST", body: form });
  if (![302, 303].includes(res.status)) {
    throw new Error(`Login failed with status ${res.status}: ${await res.text()}`);
  }
}

async function uploadPdf() {
  const handle = await open(samplePdf, "r");
  const blob = new Blob([await handle.readFile()], { type: "application/pdf" });
  await handle.close();

  const form = new FormData();
  form.set("file", blob, basename(samplePdf));
  const res = await request("/api/files/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed with status ${res.status}: ${await res.text()}`);
  return res.json();
}

async function createTask(fileId) {
  const res = await request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, workflowType: "doc_processing", taskType: "pdf_to_ppt" }),
  });
  if (!res.ok) throw new Error(`Create task failed with status ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pollTask(taskId) {
  const started = Date.now();
  while (Date.now() - started < pollTimeoutMs) {
    const res = await request(`/api/tasks/${taskId}`);
    if (!res.ok) throw new Error(`Poll failed with status ${res.status}: ${await res.text()}`);
    const task = await res.json();
    if (task.status === "completed") return task;
    if (task.status === "failed") throw new Error(`Task failed: ${task.errorMessage || "unknown error"}`);
    await delay(5000);
  }
  throw new Error(`Task did not complete within ${pollTimeoutMs}ms`);
}

async function downloadResult(taskId) {
  const res = await request(`/api/files/download/${taskId}`);
  if (!res.ok) throw new Error(`Download failed with status ${res.status}: ${await res.text()}`);
  const file = createWriteStream(outputPptx);
  await once(Readable.fromWeb(res.body).pipe(file), "finish");
  return outputPptx;
}

await login();
const uploaded = await uploadPdf();
const created = await createTask(uploaded.id);
await pollTask(created.id);
const downloaded = await downloadResult(created.id);
console.log(JSON.stringify({ ok: true, taskId: created.id, outputPptx: downloaded }, null, 2));
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs
git commit -m "test: add pdf to ppt api e2e helper"
```

---

## Task 11: Run Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run worker tests**

Run:

```bash
npm --prefix workers/doc-processing test
```

Expected: all Node and Python worker tests pass.

- [ ] **Step 2: Run app build**

Run:

```bash
npm run build
```

Expected: Next.js build exits 0.

- [ ] **Step 3: Build worker container**

Run:

```bash
docker compose build doc-worker
```

Expected: worker image builds successfully.

- [ ] **Step 4: Run container smoke test**

Run:

```bash
docker compose up -d db doc-worker && docker compose exec doc-worker node -e "fetch('http://localhost:8001/health').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(err => { console.error(err); process.exit(1); })"
```

Expected: prints `{"ok":true}` and exits 0.

- [ ] **Step 5: Run Claude discovery smoke test when auth is available**

Run:

```bash
docker compose exec doc-worker sh -lc 'test -n "$ANTHROPIC_API_KEY$CLAUDE_CODE_OAUTH_TOKEN" && test -f "$CLAUDE_CONFIG_DIR/skills/pdf-layout-analyzer/SKILL.md" && claude -p "Use the pdf-layout-analyzer skill if relevant. Reply with JSON only: {\"ok\":true}"'
```

Expected: exits 0 and outputs JSON containing `"ok": true`. If auth env is intentionally absent, record that the smoke test is skipped because the environment is not configured for Claude calls.

- [ ] **Step 6: Run end-to-end API helper when auth and sample file are available**

Run:

```bash
FLOWASSIST_BASE_URL=http://localhost:60001 FLOWASSIST_USERNAME=admin FLOWASSIST_PASSWORD=123456 SAMPLE_PDF="workers/doc-processing/samples/test_final.pdf" node workers/doc-processing/scripts/e2e_pdf_to_ppt_api.mjs
```

Expected: exits 0 and prints JSON with `ok: true`, `taskId`, and `outputPptx`. If samples are not present in the repository checkout, run with `SAMPLE_PDF` pointing to a local sample PDF.

- [ ] **Step 7: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or untracked. User-provided sample PDFs and screenshots must not be committed unless explicitly requested.

---

## Self-Review Notes

- Spec coverage: the plan covers worker HTTP contract, local extraction, Claude Code subprocess, skill discovery via `CLAUDE_CONFIG_DIR`, deterministic PPTX building, timeouts, Docker configuration, and end-to-end API testing.
- Runtime quality scoring remains outside the normal job path; only the e2e helper and sanity checks are planned.
- Claude is treated as a strong dependency for successful high-quality conversion; analyzer failure fails the job instead of returning a local-only result as success.
- User-provided `workers/doc-processing/samples` files are used by local tests when present but are not automatically committed by this plan.
