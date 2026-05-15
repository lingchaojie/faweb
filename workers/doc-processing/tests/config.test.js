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
