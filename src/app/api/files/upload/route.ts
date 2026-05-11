import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import crypto from "node:crypto";

const uploadDir = process.env.UPLOAD_DIR ?? "./storage/uploads";

export async function POST(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = file.name.includes(".")
    ? "." + file.name.split(".").pop()
    : "";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const userDir = join(uploadDir, user.id);
  await mkdir(userDir, { recursive: true });
  const storedPath = join(userDir, storedName);

  await writeFile(storedPath, buffer);

  const record = await prisma.uploadedFile.create({
    data: {
      userId: user.id,
      originalName: file.name,
      storedPath,
      sizeBytes: buffer.length,
      mimeType: file.type || null,
    },
  });

  return NextResponse.json({
    id: record.id,
    originalName: record.originalName,
    sizeBytes: record.sizeBytes,
    mimeType: record.mimeType,
  });
}
