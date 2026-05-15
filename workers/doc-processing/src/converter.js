const { spawn } = require("node:child_process");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");

const { analyzeLayoutWithClaude } = require("./claude-analyzer");
const { validateLayoutHints, validateLayoutHintsForPages } = require("./layout-hints");

const workerRoot = resolve(__dirname, "..");

function abortError(signal, fallbackMessage) {
  if (signal?.reason instanceof Error) return signal.reason;
  if (signal?.reason) return new Error(String(signal.reason));
  return new Error(fallbackMessage);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, reject) => {
    if (options.signal?.aborted) {
      reject(abortError(options.signal, `${command} aborted before start`));
      return;
    }

    const child = spawn(command, args, {
      cwd: options.cwd || workerRoot,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let aborted = false;

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
    };
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      settle(() => reject(aborted ? abortError(options.signal, `${command} aborted`) : error));
    });
    child.on("close", (code, signal) => {
      settle(() => {
        if (aborted) {
          reject(abortError(options.signal, `${command} aborted`));
          return;
        }
        if (code !== 0) {
          reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
          return;
        }
        if (signal) {
          reject(new Error(`${command} terminated by signal ${signal}: ${stderr.trim()}`));
          return;
        }
        resolveCommand(stdout);
      });
    });
  });
}

async function readManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function defaultExtract(inputPath, jobDir, _config, options = {}) {
  const extractDir = join(jobDir, "extract");
  await runCommand("python3", ["scripts/extract_pdf.py", inputPath, extractDir], { cwd: workerRoot, signal: options.signal });
  const manifest = await readManifest(join(extractDir, "manifest.json"));
  return {
    manifestPath: join(extractDir, "manifest.json"),
    pageNumbers: manifest.pages.map((page) => page.pageNumber),
  };
}

function chunkPageNumbers(pageNumbers, pageBatchSize) {
  const size = Number.isFinite(pageBatchSize) && pageBatchSize > 0 ? Math.floor(pageBatchSize) : pageNumbers.length;
  const chunks = [];
  for (let index = 0; index < pageNumbers.length; index += size) {
    chunks.push(pageNumbers.slice(index, index + size));
  }
  return chunks;
}

function remainingTimeoutMs(config, deadlineAt) {
  if (!deadlineAt) return config.claudeBatchTimeoutMs;
  return Math.max(1, Math.min(config.claudeBatchTimeoutMs, deadlineAt - Date.now()));
}

function baselineLayoutHints(manifest, pageNumbers) {
  const requestedPages = new Set(pageNumbers);
  return {
    pages: manifest.pages
      .filter((page) => requestedPages.has(page.pageNumber))
      .map((page) => ({
        pageNumber: page.pageNumber,
        mergedTextBlocks: (page.textBlocks || []).map((block) => ({
          id: `m-${block.id}`,
          sourceTextBlockIds: [block.id],
          role: "body",
          text: block.text || "",
          bbox: block.bbox,
        })),
        tables: [],
        regions: [],
        fallbacks: [],
        ignoredBlockIds: [],
        imageRoles: (page.images || []).map((image) => ({ imageId: image.id, role: "image" })),
      })),
  };
}

async function defaultAnalyze(manifestPath, pageNumbers, config, options = {}) {
  const manifest = await readManifest(manifestPath);
  const baseline = baselineLayoutHints(manifest, pageNumbers);
  const pagesByNumber = new Map(baseline.pages.map((page) => [page.pageNumber, page]));
  const promptPath = join(config.promptDir, "pdf-layout-analysis.md");
  const claudePageNumbers = pageNumbers.slice(0, Math.max(0, config.claudeMaxPages));

  for (const batchPageNumbers of chunkPageNumbers(claudePageNumbers, config.pageBatchSize)) {
    if (options.signal?.aborted) throw abortError(options.signal, "Claude analysis aborted");
    const hints = await analyzeLayoutWithClaude({
      manifestPath,
      pageNumbers: batchPageNumbers,
      promptPath,
      claudeConfigDir: config.claudeConfigDir,
      timeoutMs: remainingTimeoutMs(config, options.deadlineAt),
      model: config.claudeModel,
      env: process.env,
      signal: options.signal,
    });
    for (const page of validateLayoutHintsForPages(hints, batchPageNumbers).pages) {
      pagesByNumber.set(page.pageNumber, page);
    }
  }

  return validateLayoutHintsForPages({ pages: pageNumbers.map((pageNumber) => pagesByNumber.get(pageNumber)) }, pageNumbers);
}

async function defaultBuild(manifestPath, hintsPath, outputPath, _config, options = {}) {
  await runCommand("python3", ["scripts/build_pptx.py", manifestPath, hintsPath, outputPath], { cwd: workerRoot, signal: options.signal });
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
  const controller = new AbortController();
  const signal = controller.signal;

  const jobDir = join(outputDir, `${taskId}-work`);
  await mkdir(jobDir, { recursive: true });

  const deadlineAt = Date.now() + config.jobTimeoutMs;
  let timeoutId;
  const timeoutError = new Error(`PDF to PPT job timed out after ${config.jobTimeoutMs}ms`);
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, config.jobTimeoutMs);
  });

  const work = async () => {
    const callOptions = { signal, deadlineAt };
    const extracted = await extract(inputPath, jobDir, config, callOptions);
    const hints = await analyze(extracted.manifestPath, extracted.pageNumbers, config, callOptions);
    const hintsPath = await writeLayoutHints(jobDir, hints);
    const outputPath = join(outputDir, `${taskId}-result.pptx`);
    return build(extracted.manifestPath, hintsPath, outputPath, config, callOptions);
  };

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  baselineLayoutHints,
  chunkPageNumbers,
  convertPdfToPpt,
  readManifest,
  runCommand,
  writeLayoutHints,
};
