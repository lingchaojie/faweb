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
