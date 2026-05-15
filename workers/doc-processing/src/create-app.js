const express = require("express");

const { convertPdfToPpt } = require("./converter");
const { getWorkerConfig } = require("./config");
const { createJobStore } = require("./job-store");

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

    if (taskType !== "pdf_to_ppt") {
      return res.status(400).json({ error: `Unsupported taskType: ${taskType}` });
    }

    const job = store.createJob({ taskId, taskType, inputPath, outputDir });

    const runner = converter({ taskId, inputPath, outputDir, config: getWorkerConfig() });

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
