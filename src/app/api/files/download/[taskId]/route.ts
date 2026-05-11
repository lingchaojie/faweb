import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { userId: true, resultPath: true, status: true, taskType: true },
  });

  if (!task || task.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status !== "completed" || !task.resultPath) {
    return NextResponse.json({ error: "Task not completed" }, { status: 400 });
  }

  if (!existsSync(task.resultPath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileStat = await stat(task.resultPath);
  const stream = createReadStream(task.resultPath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  const ext = task.resultPath.split(".").pop() ?? "bin";
  const filename = `result-${task.taskType}.${ext}`;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
