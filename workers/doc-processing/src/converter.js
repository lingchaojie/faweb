const { spawn } = require("node:child_process");
const { mkdir, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");

const { analyzeLayoutWithClaude } = require("./claude-analyzer");
const { validateLayoutHints } = require("./layout-hints");

const workerRoot = resolve(__dirname, "..");

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || workerRoot,
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
      resolveCommand(stdout);
    });
  });
}

async function defaultExtract(inputPath, jobDir) {
  const extractDir = join(jobDir, "extract");
  await runCommand("python3", ["scripts/extract_pdf.py", inputPath, extractDir], { cwd: workerRoot });
  const manifestPath = join(extractDir, "manifest.json");
  delete require.cache[require.resolve(manifestPath)];
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
  await runCommand("python3", ["scripts/build_pptx.py", manifestPath, hintsPath, outputPath], { cwd: workerRoot });
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

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`PDF to PPT job timed out after ${config.jobTimeoutMs}ms`)), config.jobTimeoutMs);
  });

  const work = async () => {
    const extracted = await extract(inputPath, jobDir, config);
    const hints = await analyze(extracted.manifestPath, extracted.pageNumbers, config);
    const hintsPath = await writeLayoutHints(jobDir, hints);
    const outputPath = join(outputDir, `${taskId}-result.pptx`);
    return build(extracted.manifestPath, hintsPath, outputPath, config);
  };

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  convertPdfToPpt,
  writeLayoutHints,
};
