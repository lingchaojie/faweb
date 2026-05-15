const express = require("express");
const { writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const { convertPdfToPpt } = require("./converter");
const { getWorkerConfig } = require("./config");
const { createJobStore } = require("./job-store");

function legacyStub(taskId, taskType, inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await mkdir(outputDir, { recursive: true });
        const ext = taskType === "pdf_to_word" ? "docx" : "txt";
        const resultPath = join(outputDir, `${taskId}-result.${ext}`);
        await writeFile(resultPath, `Stub output for ${taskType} from ${inputPath}`);
        resolve(resultPath);
      } catch (error) {
        reject(error);
      }
    }, 500);
  });
}

function createApp(options = {}) {
  const app = express();
  const store = options.store || createJobStore();
  const converter = options.converter || convertPdfToPpt;

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/jobs", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { taskId, taskType, inputPath, outputDir } = body;

    if (!taskId || !taskType || !inputPath || !outputDir) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const job = store.createJob({ taskId, taskType, inputPath, outputDir });

    const runner = taskType === "pdf_to_ppt"
      ? converter({ taskId, inputPath, outputDir, config: getWorkerConfig() })
      : legacyStub(taskId, taskType, inputPath, outputDir);

    runner
      .then((resultPath) => store.completeJob(job.jobId, resultPath))
      .catch((error) => store.failJob(job.jobId, error));

    return res.json({ jobId: job.jobId });
  });

  app.get("/jobs/:jobId", (req, res) => {
    const job = store.getPublicJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    return res.json(job);
  });

  return app;
}

module.exports = { createApp };
