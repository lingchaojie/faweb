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
