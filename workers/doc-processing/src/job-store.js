const { randomUUID } = require("node:crypto");

function createJobStore(idFactory = randomUUID) {
  const jobs = new Map();

  function createJob(payload) {
    const jobId = idFactory();
    const job = {
      jobId,
      status: "processing",
      taskId: payload.taskId,
      taskType: payload.taskType,
      inputPath: payload.inputPath,
      outputDir: payload.outputDir,
      resultPath: undefined,
      error: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobs.set(jobId, job);
    return job;
  }

  function getJob(jobId) {
    return jobs.get(jobId) || null;
  }

  function getPublicJob(jobId) {
    const job = getJob(jobId);
    if (!job) return null;
    return {
      status: job.status,
      resultPath: job.resultPath,
      error: job.error,
    };
  }

  function completeJob(jobId, resultPath) {
    const job = getJob(jobId);
    if (!job) return;
    job.status = "completed";
    job.resultPath = resultPath;
    job.error = undefined;
    job.updatedAt = new Date();
  }

  function failJob(jobId, error) {
    const job = getJob(jobId);
    if (!job) return;
    job.status = "failed";
    job.resultPath = undefined;
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = new Date();
  }

  return {
    createJob,
    getJob,
    getPublicJob,
    completeJob,
    failJob,
  };
}

module.exports = { createJobStore };
