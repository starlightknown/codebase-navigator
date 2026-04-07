import { NextRequest, NextResponse } from "next/server";
import { getFileContent, parseRepoUrl } from "@/lib/github";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const repoUrl = searchParams.get("repo");
  const path = searchParams.get("path");
  const ref = searchParams.get("ref");

  if (!repoUrl || !path) {
    return NextResponse.json(
      { error: "Missing repo or path parameter" },
      { status: 400 }
    );
  }

  try {
    const { owner, repo } = parseRepoUrl(repoUrl);
    const content = await getFileContent(owner, repo, path, ref || undefined);

    return NextResponse.json({ path, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch file content";
    const status =
      error instanceof Error && "status" in error && error.status === 404
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
