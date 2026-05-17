import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join, resolve, normalize } from "path";
import { getBasePath, sessionExists } from "@/lib/local-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sessionId = searchParams.get("sessionId");
  const path = searchParams.get("path");

  if (!sessionId || !path) {
    return NextResponse.json({ error: "Missing sessionId or path" }, { status: 400 });
  }

  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const basePath = getBasePath(sessionId);
  if (!basePath) {
    return NextResponse.json({ error: "Session has no base path" }, { status: 404 });
  }

  // Prevent path traversal: resolve the full path and verify it stays within basePath
  const fullPath = resolve(join(basePath, normalize(path).replace(/^(\.\.[/\\])+/, "")));
  if (!fullPath.startsWith(basePath)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const content = readFileSync(fullPath, "utf-8");
    return NextResponse.json({ path, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
