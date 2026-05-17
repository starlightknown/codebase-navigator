import { NextRequest, NextResponse } from "next/server";
import { readdirSync, statSync, Dirent } from "fs";
import { join, relative, resolve } from "path";
import { createSession, getFolderName } from "@/lib/local-store";
import type { TreeNode } from "@/types";

export const runtime = "nodejs";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".cache",
  "__pycache__", ".venv", "venv", ".idea", ".vscode", "coverage",
  ".turbo", ".parcel-cache",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".mp3", ".wav", ".ogg", ".avi",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".bin", ".dll", ".so", ".dylib",
  ".pdf", ".lock",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB — skip files larger than this

function collectPaths(dir: string, base: string, paths: string[]): void {
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return; // skip unreadable dirs
  }

  for (const entry of entries) {
    const name = String(entry.name);
    const fullPath = join(dir, name);
    const relPath = relative(base, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(name) || name.startsWith(".")) continue;
      collectPaths(fullPath, base, paths);
    } else if (entry.isFile()) {
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      if (IGNORED_EXTENSIONS.has(ext)) continue;
      try {
        const stat = statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
      } catch {
        continue;
      }
      paths.push(relPath);
    }
  }
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { path: "", type: "directory", children: [] };
  const dirMap = new Map<string, TreeNode>();
  dirMap.set("", root);

  const sorted = [...paths].sort();

  for (const filePath of sorted) {
    const parts = filePath.split("/");

    // Ensure all parent directories exist
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      if (!dirMap.has(dirPath)) {
        const node: TreeNode = { path: dirPath, type: "directory", children: [] };
        dirMap.set(dirPath, node);
        const parentPath = parts.slice(0, i - 1).join("/");
        const parent = dirMap.get(parentPath)!;
        parent.children = parent.children ?? [];
        parent.children.push(node);
      }
    }

    // Add the file node
    const fileNode: TreeNode = { path: filePath, type: "file" };
    const parentPath = parts.slice(0, -1).join("/");
    const parent = dirMap.get(parentPath) ?? root;
    parent.children = parent.children ?? [];
    parent.children.push(fileNode);
  }

  return root;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawPath: string = body?.folderPath;

    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ error: "Missing folderPath" }, { status: 400 });
    }

    // Resolve to an absolute path (handles ~, relative paths)
    const basePath = resolve(rawPath.replace(/^~/, process.env.HOME ?? "~"));

    // Verify it exists and is a directory
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(basePath);
    } catch {
      return NextResponse.json({ error: `Path not found: ${basePath}` }, { status: 404 });
    }
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: `Not a directory: ${basePath}` }, { status: 400 });
    }

    const sessionId = crypto.randomUUID();
    const folderName = basePath.split("/").filter(Boolean).pop() ?? "local";

    createSession(sessionId, basePath, folderName);

    const paths: string[] = [];
    collectPaths(basePath, basePath, paths);

    if (paths.length === 0) {
      return NextResponse.json({ error: "No supported source files found in this folder." }, { status: 400 });
    }

    const tree = buildTree(paths);

    return NextResponse.json({
      sessionId,
      folderName: getFolderName(sessionId),
      fileCount: paths.length,
      basePath,
      tree,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
