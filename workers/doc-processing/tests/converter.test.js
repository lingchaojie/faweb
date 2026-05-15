const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { baselineLayoutHints, chunkPageNumbers, convertPdfToPpt, readManifest, runCommand, writeLayoutHints } = require("../src/converter");

test("writeLayoutHints writes validated hints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "converter-"));
  const path = await writeLayoutHints(dir, { pages: [{ pageNumber: 1, mergedTextBlocks: [], tables: [], ignoredBlockIds: [], imageRoles: [] }] });
  assert.equal(path, join(dir, "layout-hints.json"));
  assert.equal(existsSync(path), true);
});

test("readManifest reads manifest JSON without adding it to require cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "converter-"));
  const manifestPath = join(dir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({ pages: [{ pageNumber: 1 }] }));

  const manifest = await readManifest(manifestPath);

  assert.deepEqual(manifest, { pages: [{ pageNumber: 1 }] });
  assert.equal(require.cache[manifestPath], undefined);
});

test("chunkPageNumbers splits pages by configured batch size", () => {
  assert.deepEqual(chunkPageNumbers([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkPageNumbers([1, 2, 3], 10), [[1, 2, 3]]);
});

test("baselineLayoutHints creates editable text hints for requested pages", () => {
  const hints = baselineLayoutHints({
    pages: [
      { pageNumber: 1, textBlocks: [{ id: "t1", text: "Hello", bbox: [1, 2, 3, 4] }], images: [{ id: "i1" }] },
      { pageNumber: 2, textBlocks: [{ id: "t2", text: "World", bbox: [5, 6, 7, 8] }], images: [] },
    ],
  }, [2]);

  assert.deepEqual(hints.pages, [{
    pageNumber: 2,
    mergedTextBlocks: [{ id: "m-t2", sourceTextBlockIds: ["t2"], role: "body", text: "World", bbox: [5, 6, 7, 8] }],
    tables: [],
    ignoredBlockIds: [],
    imageRoles: [],
  }]);
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

test("convertPdfToPpt aborts timed-out work and does not build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "converter-"));
  const inputPath = join(dir, "input.pdf");
  await writeFile(inputPath, "fake pdf");
  let observedSignal;
  let buildCalled = false;

  await assert.rejects(
    () => convertPdfToPpt({
      taskId: "task-1",
      inputPath,
      outputDir: dir,
      config: {
        promptDir: dir,
        claudeConfigDir: dir,
        jobTimeoutMs: 25,
        claudeBatchTimeoutMs: 1000,
        pageBatchSize: 4,
      },
      deps: {
        extract: async (_inputPath, _jobDir, _config, options) => {
          observedSignal = options.signal;
          return new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
            setTimeout(() => resolve({ manifestPath: join(dir, "manifest.json"), pageNumbers: [1] }), 250);
          });
        },
        analyze: async () => { throw new Error("analyze should not run"); },
        build: async () => {
          buildCalled = true;
          throw new Error("build should not run");
        },
      },
    }),
    /PDF to PPT job timed out after 25ms/,
  );

  assert.equal(observedSignal.aborted, true);
  assert.equal(buildCalled, false);
});

test("runCommand kills child process when aborted", async () => {
  const controller = new AbortController();
  const childScript = "process.on('SIGTERM', () => process.exit(42)); setInterval(() => {}, 1000);";
  const before = Date.now();

  const commandPromise = runCommand(process.execPath, ["-e", childScript], { signal: controller.signal });
  setTimeout(() => controller.abort(new Error("stop child")), 25);

  await assert.rejects(commandPromise, /aborted|SIGTERM|code 42|stop child/);
  assert.ok(Date.now() - before < 1000);
});
