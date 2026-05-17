import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve, normalize, relative } from "path";
import { getFileContent, getRepoTree } from "@/lib/github";
import { getBasePath, sessionExists } from "@/lib/local-store";
import type { TreeNode } from "@/types";

const COOKIE_NAME = "cn-llm-settings";
const REPO_COOKIE = "cn-current-repo";
const LOCAL_SESSION_COOKIE = "cn-local-session";
const MAX_LINES = 200;

async function getLLMConfig(): Promise<{ baseURL: string; apiKey: string; model: string }> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.baseURL && parsed.model) {
        return {
          baseURL: parsed.baseURL,
          apiKey: parsed.apiKey || "ollama",
          model: parsed.model,
        };
      }
    } catch {
      // fall through to defaults
    }
  }
  return {
    baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.OPENAI_API_KEY || "ollama",
    model: process.env.OPENAI_MODEL || "qwen2.5",
  };
}

interface RepoContext {
  type: "github";
  owner: string;
  repo: string;
  branch: string;
}
interface LocalContext {
  type: "local";
  sessionId: string;
}
type ProjectContext = RepoContext | LocalContext | null;

async function getProjectContext(): Promise<ProjectContext> {
  const jar = await cookies();

  const localSession = jar.get(LOCAL_SESSION_COOKIE)?.value;
  if (localSession && sessionExists(decodeURIComponent(localSession))) {
    return { type: "local", sessionId: decodeURIComponent(localSession) };
  }

  const repoCookie = jar.get(REPO_COOKIE)?.value;
  if (repoCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(repoCookie));
      if (parsed.owner && parsed.repo && parsed.branch) {
        return { type: "github", owner: parsed.owner, repo: parsed.repo, branch: parsed.branch };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function sliceLines(content: string, startLine?: number, endLine?: number): string {
  const lines = content.split("\n");
  const from = startLine ? Math.max(0, startLine - 1) : 0;
  const rawTo = endLine ? endLine : from + MAX_LINES;
  const to = Math.min(rawTo, from + MAX_LINES, lines.length);
  const slice = lines.slice(from, to);
  const numbered = slice.map((l, i) => `${from + i + 1}: ${l}`).join("\n");
  const truncated = to < lines.length;
  return `Lines ${from + 1}–${to} of ${lines.length}:\n${numbered}${truncated ? `\n\n(${lines.length - to} more lines — use startLine/endLine to continue reading)` : ""}`;
}

function flattenTreeNode(node: TreeNode, acc: string[] = []): string[] {
  if (node.type === "file") acc.push(node.path);
  for (const child of node.children ?? []) flattenTreeNode(child, acc);
  return acc;
}

const IGNORED_WALK_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".cache",
  "__pycache__", ".venv", "venv", "coverage", ".turbo",
]);

function walkLocalPaths(sessionId: string): string[] {
  const basePath = getBasePath(sessionId);
  if (!basePath) return [];
  const rootPath = basePath;
  const paths: string[] = [];

  function walk(dir: string): void {
    let entries: import("fs").Dirent[] = [];
    try { entries = readdirSync(dir, { withFileTypes: true }) as unknown as import("fs").Dirent[]; } catch { return; }
    for (const e of entries) {
      const ename = String(e.name);
      if (e.isDirectory()) {
        if (IGNORED_WALK_DIRS.has(ename) || ename.startsWith(".")) continue;
        walk(join(dir, ename));
      } else if (e.isFile()) {
        try { statSync(join(dir, ename)); } catch { continue; }
        paths.push(relative(rootPath, join(dir, ename)).replace(/\\/g, "/"));
      }
    }
  }
  walk(rootPath);
  return paths;
}

export const POST = async (req: NextRequest) => {
  const { baseURL, apiKey, model } = await getLLMConfig();
  const ctx = await getProjectContext();

  const openai = new OpenAI({ baseURL, apiKey });
  const serviceAdapter = new OpenAIAdapter({ openai, model });

  const runtime = new CopilotRuntime({
    actions: [
      {
        name: "readFile",
        description:
          "Read the actual source code content of a file in the loaded project. Use this to understand implementations before answering questions. Returns up to 200 lines at a time with line numbers.",
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Relative file path (e.g. src/lib/auth.ts)",
            required: true,
          },
          {
            name: "startLine",
            type: "number",
            description: "First line to return (1-indexed). Omit to start from the beginning.",
            required: false,
          },
          {
            name: "endLine",
            type: "number",
            description: "Last line to return (inclusive). Max startLine + 199.",
            required: false,
          },
        ],
        handler: async ({ path, startLine, endLine }: { path: string; startLine?: number; endLine?: number }) => {
          if (!ctx) return "No project loaded. Ask the user to load a repository or folder first.";
          try {
            let content: string;
            if (ctx.type === "local") {
              const basePath = getBasePath(ctx.sessionId);
              if (!basePath) return "Local session not found.";
              const fullPath = resolve(join(basePath, normalize(path).replace(/^(\.\.[/\\])+/, "")));
              if (!fullPath.startsWith(basePath)) return "Access denied.";
              content = readFileSync(fullPath, "utf-8");
            } else {
              content = await getFileContent(ctx.owner, ctx.repo, path, ctx.branch);
            }
            return sliceLines(content, startLine, endLine);
          } catch (e) {
            return `Error reading ${path}: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: "listFiles",
        description:
          "List files in the loaded project, optionally filtered by a directory prefix. Returns file paths one per line.",
        parameters: [
          {
            name: "directory",
            type: "string",
            description: "Directory path to list (e.g. src/components). Omit for all files.",
            required: false,
          },
          {
            name: "maxResults",
            type: "number",
            description: "Maximum number of results to return (default 100, max 500).",
            required: false,
          },
        ],
        handler: async ({ directory, maxResults }: { directory?: string; maxResults?: number }) => {
          if (!ctx) return "No project loaded.";
          try {
            let paths: string[];
            if (ctx.type === "local") {
              paths = walkLocalPaths(ctx.sessionId);
            } else {
              paths = flattenTreeNode(await getRepoTree(ctx.owner, ctx.repo, ctx.branch));
            }

            if (directory) {
              const prefix = directory.replace(/\/$/, "") + "/";
              paths = paths.filter((p) => p.startsWith(prefix) || p === directory);
            }

            const limit = Math.min(maxResults ?? 100, 500);
            const sliced = paths.slice(0, limit);
            const extra = paths.length - sliced.length;
            return sliced.join("\n") + (extra > 0 ? `\n... and ${extra} more` : "");
          } catch (e) {
            return `Error listing files: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: "searchFiles",
        description:
          "Find files in the project whose path matches a pattern (substring or simple glob). Returns matching file paths.",
        parameters: [
          {
            name: "pattern",
            type: "string",
            description: "Pattern to search for in file paths (case-insensitive substring match, e.g. 'auth', 'route', '.test.ts')",
            required: true,
          },
          {
            name: "maxResults",
            type: "number",
            description: "Maximum number of results (default 50).",
            required: false,
          },
        ],
        handler: async ({ pattern, maxResults }: { pattern: string; maxResults?: number }) => {
          if (!ctx) return "No project loaded.";
          try {
            let paths: string[];
            if (ctx.type === "local") {
              paths = walkLocalPaths(ctx.sessionId);
            } else {
              paths = flattenTreeNode(await getRepoTree(ctx.owner, ctx.repo, ctx.branch));
            }

            const lowerPattern = pattern.toLowerCase();
            const matches = paths.filter((p) => p.toLowerCase().includes(lowerPattern));
            const limit = Math.min(maxResults ?? 50, 200);
            const sliced = matches.slice(0, limit);
            if (sliced.length === 0) return `No files found matching "${pattern}".`;
            const extra = matches.length - sliced.length;
            return `${sliced.length} file(s) matching "${pattern}":\n${sliced.join("\n")}${extra > 0 ? `\n... and ${extra} more` : ""}`;
          } catch (e) {
            return `Error searching files: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
    ],
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
