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

    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE" && !settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
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
