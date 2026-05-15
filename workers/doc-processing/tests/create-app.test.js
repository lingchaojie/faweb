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
