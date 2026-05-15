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

test("unsupported task types return 400", async () => {
  const { server, baseUrl } = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task-1", taskType: "pdf_to_word", inputPath: "/tmp/input.pdf", outputDir: "/tmp/output" }),
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Unsupported taskType/);
  } finally {
    server.close();
  }
});

test("empty request body returns 400", async () => {
  const { server, baseUrl } = await listen(createApp());
  try {
    const res = await fetch(`${baseUrl}/jobs`, { method: "POST" });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("request config cannot override worker runtime config", async () => {
  const originalEnv = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CLAUDE_WORKER_PROMPT_DIR: process.env.CLAUDE_WORKER_PROMPT_DIR,
    PDF_TO_PPT_JOB_TIMEOUT_MS: process.env.PDF_TO_PPT_JOB_TIMEOUT_MS,
    PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS: process.env.PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS,
    PDF_TO_PPT_PAGE_BATCH_SIZE: process.env.PDF_TO_PPT_PAGE_BATCH_SIZE,
  };

  process.env.CLAUDE_CONFIG_DIR = "/server/claude-config";
  process.env.CLAUDE_WORKER_PROMPT_DIR = "/server/prompts";
  process.env.PDF_TO_PPT_JOB_TIMEOUT_MS = "120000";
  process.env.PDF_TO_PPT_CLAUDE_BATCH_TIMEOUT_MS = "45000";
  process.env.PDF_TO_PPT_PAGE_BATCH_SIZE = "3";

  let capturedPayload;
  const app = createApp({
    converter: async (payload) => {
      capturedPayload = payload;
      return join(payload.outputDir, `${payload.taskId}-result.pptx`);
    },
  });
  const { server, baseUrl } = await listen(app);

  try {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "task-config",
        taskType: "pdf_to_ppt",
        inputPath: "/tmp/input.pdf",
        outputDir: "/tmp/output",
        config: {
          claudeConfigDir: "/evil",
          promptDir: "/evil-prompts",
          jobTimeoutMs: 1,
          claudeBatchTimeoutMs: 1,
          pageBatchSize: 1,
        },
      }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(capturedPayload.config, {
      claudeConfigDir: "/server/claude-config",
      promptDir: "/server/prompts",
      jobTimeoutMs: 120000,
      claudeBatchTimeoutMs: 45000,
      pageBatchSize: 3,
      claudeModel: "sonnet",
      claudeMaxPages: 3,
    });
  } finally {
    server.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
