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
