const express = require("express");
const { randomUUID } = require("node:crypto");
const { writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const app = express();
app.use(express.json());

const jobs = new Map();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/jobs", async (req, res) => {
  const { taskId, taskType, inputPath, outputDir } = req.body;

  if (!taskId || !taskType || !inputPath || !outputDir) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "processing", taskId, taskType, inputPath, outputDir });

  setTimeout(async () => {
    try {
      await mkdir(outputDir, { recursive: true });
      const ext = taskType === "pdf_to_ppt" ? "pptx"
        : taskType === "pdf_to_word" ? "docx"
        : "txt";
      const resultPath = join(outputDir, `${taskId}-result.${ext}`);
      await writeFile(resultPath, `Stub output for ${taskType} from ${inputPath}`);
      jobs.set(jobId, { status: "completed", resultPath });
    } catch (err) {
      jobs.set(jobId, { status: "failed", error: err.message });
    }
  }, 5000);

  res.json({ jobId });
});

app.get("/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({
    status: job.status,
    resultPath: job.resultPath ?? undefined,
    error: job.error ?? undefined,
  });
});

const PORT = process.env.PORT ?? 8001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Doc processing worker listening on :${PORT}`);
});
