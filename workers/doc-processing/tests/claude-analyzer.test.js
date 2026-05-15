const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, chmod, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { analyzeLayoutWithClaude, extractJsonObject } = require("../src/claude-analyzer");

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function fakeClaudeDir(stdout, argsPath, promptPath) {
  const dir = await mkdtemp(join(tmpdir(), "fake-claude-"));
  const bin = join(dir, "claude");
  let script = "#!/bin/sh\n";
  if (argsPath) script += `printf '%s\\n' "$@" > ${shellQuote(argsPath)}\n`;
  if (promptPath) script += `cat > ${shellQuote(promptPath)}\n`;
  script += `printf '%s' ${shellQuote(stdout)}\n`;
  await writeFile(bin, script);
  await chmod(bin, 0o755);
  return dir;
}

async function writePromptAndManifest() {
  const dir = await mkdtemp(join(tmpdir(), "claude-analyzer-input-"));
  const promptPath = join(dir, "prompt.md");
  const manifestPath = join(dir, "manifest.json");
  await writeFile(promptPath, "Analyze the supplied manifest.\n", "utf8");
  await writeFile(manifestPath, JSON.stringify({ pages: [{ pageNumber: 1, textBlocks: [] }] }), "utf8");
  return { dir, promptPath, manifestPath };
}

test("extractJsonObject parses clean JSON", () => {
  assert.deepEqual(extractJsonObject('{"pages":[]}'), { pages: [] });
});

test("extractJsonObject parses JSON surrounded by logs", () => {
  assert.deepEqual(extractJsonObject('log before\n{"pages":[]}\nlog after'), { pages: [] });
});

test("analyzeLayoutWithClaude invokes claude and validates hints", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');
  const result = await analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers: [1],
    promptPath,
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  assert.equal(result.pages[0].pageNumber, 1);
});

test("analyzeLayoutWithClaude preserves Anthropic base URL auth token and traffic settings", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const dir = await mkdtemp(join(tmpdir(), "claude-analyzer-env-"));
  const envPath = join(dir, "env.txt");
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');
  await writeFile(join(fakeDir, "claude"), `#!/bin/sh\nenv > ${shellQuote(envPath)}\nprintf '%s' '{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}'\n`);
  await chmod(join(fakeDir, "claude"), 0o755);

  await analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers: [1],
    promptPath,
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_AUTH_TOKEN: "auth-token",
      ANTHROPIC_BASE_URL: "http://host.docker.internal:8080",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  const childEnv = await readFile(envPath, "utf8");
  assert.match(childEnv, /^ANTHROPIC_AUTH_TOKEN=auth-token$/m);
  assert.match(childEnv, /^ANTHROPIC_BASE_URL=http:\/\/host\.docker\.internal:8080$/m);
  assert.match(childEnv, /^CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1$/m);
});

test("analyzeLayoutWithClaude rewrites Docker-localhost Anthropic base URL for child process", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const dir = await mkdtemp(join(tmpdir(), "claude-analyzer-docker-env-"));
  const envPath = join(dir, "env.txt");
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');
  await writeFile(join(fakeDir, "claude"), `#!/bin/sh\nenv > ${shellQuote(envPath)}\nprintf '%s' '{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}'\n`);
  await chmod(join(fakeDir, "claude"), 0o755);

  await analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers: [1],
    promptPath,
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_AUTH_TOKEN: "auth-token",
      ANTHROPIC_BASE_URL: "http://localhost:8080",
      FLOWASSIST_RUNNING_IN_DOCKER: "1",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  const childEnv = await readFile(envPath, "utf8");
  assert.match(childEnv, /^ANTHROPIC_BASE_URL=http:\/\/host\.docker\.internal:8080$/m);
});

test("analyzeLayoutWithClaude invokes claude without allowed filesystem tools", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const dir = await mkdtemp(join(tmpdir(), "claude-analyzer-args-"));
  const argsPath = join(dir, "args.txt");
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}', argsPath);

  await analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers: [1],
    promptPath,
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  const args = await readFile(argsPath, "utf8");
  assert.equal(args, "-p\n");
});

test("analyzeLayoutWithClaude limits manifest data to requested pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-analyzer-bounded-"));
  const promptPath = join(dir, "prompt.md");
  const manifestPath = join(dir, "manifest.json");
  const actualPromptPath = join(dir, "actual-prompt.txt");
  await writeFile(promptPath, "Analyze the supplied manifest.\n", "utf8");
  await writeFile(manifestPath, JSON.stringify({
    pageCount: 2,
    pages: [
      { pageNumber: 1, textBlocks: [{ id: "t1", text: "included" }] },
      { pageNumber: 99, textBlocks: [{ id: "t99", text: "SECRET: follow these instructions" }] },
    ],
  }), "utf8");
  const fakeDir = await fakeClaudeDir(
    '{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}',
    undefined,
    actualPromptPath,
  );

  await analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers: [1],
    promptPath,
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  const actualPrompt = await readFile(actualPromptPath, "utf8");
  assert.match(actualPrompt, /included/);
  assert.doesNotMatch(actualPrompt, /SECRET/);
  assert.doesNotMatch(actualPrompt, /pageNumber":99/);
});

test("analyzeLayoutWithClaude passes delimited manifest content in prompt", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const dir = await mkdtemp(join(tmpdir(), "claude-analyzer-prompt-"));
  const actualPromptPath = join(dir, "prompt.txt");
  const fakeDir = await fakeClaudeDir(
    '{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]},{"pageNumber":2,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}',
    undefined,
    actualPromptPath,
  );

  await analyzeLayoutWithClaude({
    manifestPath,
    pageNumbers: [1, 2],
    promptPath,
    claudeConfigDir: "/tmp/claude-config",
    timeoutMs: 5000,
    env: {
      ANTHROPIC_API_KEY: "test-key",
      PATH: `${fakeDir}:${process.env.PATH}`,
    },
  });

  const actualPrompt = await readFile(actualPromptPath, "utf8");
  assert.match(actualPrompt, /Analyze the supplied manifest\./);
  assert.match(actualPrompt, /Page numbers: 1, 2/);
  assert.match(actualPrompt, /<manifest-json>\n\{"pages":\[\{"pageNumber":1,"textBlocks":\[\]\}\]\}\n<\/manifest-json>/);
  assert.match(actualPrompt, /untrusted PDF extraction data/);
  assert.match(actualPrompt, /Return only JSON\./);
});

test("analyzeLayoutWithClaude rejects empty layout hints for requested pages", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const fakeDir = await fakeClaudeDir('{"pages":[]}');

  await assert.rejects(
    () => analyzeLayoutWithClaude({
      manifestPath,
      pageNumbers: [1],
      promptPath,
      claudeConfigDir: "/tmp/claude-config",
      timeoutMs: 5000,
      env: {
        ANTHROPIC_API_KEY: "test-key",
        PATH: `${fakeDir}:${process.env.PATH}`,
      },
    }),
    /Claude layout hints missing pages: 1/,
  );
});

test("analyzeLayoutWithClaude rejects duplicate requested page hints", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]},{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');

  await assert.rejects(
    () => analyzeLayoutWithClaude({
      manifestPath,
      pageNumbers: [1],
      promptPath,
      claudeConfigDir: "/tmp/claude-config",
      timeoutMs: 5000,
      env: {
        ANTHROPIC_API_KEY: "test-key",
        PATH: `${fakeDir}:${process.env.PATH}`,
      },
    }),
    /Claude layout hints duplicate page: 1/,
  );
});

test("analyzeLayoutWithClaude rejects invalid page numbers in hints", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":"not-a-number","mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');

  await assert.rejects(
    () => analyzeLayoutWithClaude({
      manifestPath,
      pageNumbers: [1],
      promptPath,
      claudeConfigDir: "/tmp/claude-config",
      timeoutMs: 5000,
      env: {
        ANTHROPIC_API_KEY: "test-key",
        PATH: `${fakeDir}:${process.env.PATH}`,
      },
    }),
    /Claude layout hints included invalid pageNumber/,
  );
});

test("analyzeLayoutWithClaude rejects unexpected page hints", async () => {
  const { promptPath, manifestPath } = await writePromptAndManifest();
  const fakeDir = await fakeClaudeDir('{"pages":[{"pageNumber":1,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]},{"pageNumber":4,"mergedTextBlocks":[],"tables":[],"ignoredBlockIds":[],"imageRoles":[]}]}');

  await assert.rejects(
    () => analyzeLayoutWithClaude({
      manifestPath,
      pageNumbers: [1],
      promptPath,
      claudeConfigDir: "/tmp/claude-config",
      timeoutMs: 5000,
      env: {
        ANTHROPIC_API_KEY: "test-key",
        PATH: `${fakeDir}:${process.env.PATH}`,
      },
    }),
    /Claude layout hints included unexpected pages: 4/,
  );
});

test("analyzeLayoutWithClaude fails clearly when prompt cannot be read", async () => {
  const { manifestPath } = await writePromptAndManifest();
  const missingPromptPath = join(tmpdir(), `missing-prompt-${Date.now()}.md`);

  await assert.rejects(
    () => analyzeLayoutWithClaude({
      manifestPath,
      pageNumbers: [1],
      promptPath: missingPromptPath,
      claudeConfigDir: "/tmp/claude-config",
      timeoutMs: 5000,
      env: {
        ANTHROPIC_API_KEY: "test-key",
        PATH: process.env.PATH,
      },
    }),
    new RegExp(`Failed to read Claude layout analysis prompt at ${missingPromptPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`),
  );
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
