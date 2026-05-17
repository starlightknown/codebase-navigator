import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { readFileSync, readdirSync } from "fs";
import { join, resolve, normalize, relative } from "path";
import { getBasePath, sessionExists } from "@/lib/local-store";
import { getFileContent, getRepoTree } from "@/lib/github";
import type { TreeNode } from "@/types";

// ─── config / context helpers ────────────────────────────────────────────────

const COOKIE_LLM = "cn-llm-settings";
const COOKIE_REPO = "cn-current-repo";
const COOKIE_LOCAL = "cn-local-session";
const MAX_LINES = 200;

async function getLLMConfig() {
  const jar = await cookies();
  const raw = jar.get(COOKIE_LLM)?.value;
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p.baseURL && p.model) {
        return { baseURL: p.baseURL, apiKey: p.apiKey || "ollama", model: p.model };
      }
    } catch { /* fall through */ }
  }
  return {
    baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.OPENAI_API_KEY || "ollama",
    model: process.env.OPENAI_MODEL || "qwen2.5-coder:7b",
  };
}

interface RepoCtx { type: "github"; owner: string; repo: string; branch: string }
interface LocalCtx { type: "local"; sessionId: string }
type ProjectCtx = RepoCtx | LocalCtx | null;

async function getProjectContext(): Promise<ProjectCtx> {
  const jar = await cookies();
  const local = jar.get(COOKIE_LOCAL)?.value;
  if (local && sessionExists(decodeURIComponent(local))) {
    return { type: "local", sessionId: decodeURIComponent(local) };
  }
  const repo = jar.get(COOKIE_REPO)?.value;
  if (repo) {
    try {
      const p = JSON.parse(decodeURIComponent(repo));
      if (p.owner && p.repo && p.branch) {
        return { type: "github", owner: p.owner, repo: p.repo, branch: p.branch };
      }
    } catch { /* ignore */ }
  }
  return null;
}

// ─── filesystem helpers ───────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
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
    try { entries = readdirSync(dir, { withFileTypes: true }) as unknown as import("fs").Dirent[]; }
    catch { return; }
    for (const e of entries) {
      const name = String(e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
        walk(join(dir, name));
      } else if (e.isFile()) {
        paths.push(relative(rootPath, join(dir, name)).replace(/\\/g, "/"));
      }
    }
  }
  walk(rootPath);
  return paths;
}

function flattenTree(node: TreeNode, acc: string[] = []): string[] {
  if (node.type === "file") acc.push(node.path);
  for (const c of node.children ?? []) flattenTree(c, acc);
  return acc;
}

function sliceLines(content: string, startLine?: number, endLine?: number): string {
  const lines = content.split("\n");
  const from = startLine ? Math.max(0, startLine - 1) : 0;
  const rawTo = endLine ? endLine : from + MAX_LINES;
  const to = Math.min(rawTo, from + MAX_LINES, lines.length);
  const numbered = lines.slice(from, to).map((l, i) => `${from + i + 1}: ${l}`).join("\n");
  const remaining = lines.length - to;
  return `Lines ${from + 1}–${to} of ${lines.length}:\n${numbered}${remaining > 0 ? `\n\n(${remaining} more lines)` : ""}`;
}

// ─── tool execution ───────────────────────────────────────────────────────────

async function runTool(name: string, args: Record<string, unknown>, ctx: ProjectCtx): Promise<string> {
  if (name === "listFiles") {
    if (!ctx) return "No project loaded.";
    const directory = args.directory as string | undefined;
    const maxResults = Math.min((args.maxResults as number | undefined) ?? 100, 500);
    try {
      let paths =
        ctx.type === "local"
          ? walkLocalPaths(ctx.sessionId)
          : flattenTree(await getRepoTree(ctx.owner, ctx.repo, ctx.branch));
      if (directory) {
        const prefix = directory.replace(/\/$/, "") + "/";
        paths = paths.filter((p) => p.startsWith(prefix) || p === directory);
      }
      const sliced = paths.slice(0, maxResults);
      const extra = paths.length - sliced.length;
      if (sliced.length === 0) return "No files found.";
      return sliced.join("\n") + (extra > 0 ? `\n… and ${extra} more` : "");
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (name === "readFile") {
    if (!ctx) return "No project loaded.";
    const path = args.path as string;
    const startLine = args.startLine as number | undefined;
    const endLine = args.endLine as number | undefined;
    if (!path) return "Missing path parameter.";
    try {
      let content: string;
      if (ctx.type === "local") {
        const base = getBasePath(ctx.sessionId);
        if (!base) return "Local session not found.";
        const full = resolve(join(base, normalize(path).replace(/^(\.\.[/\\])+/, "")));
        if (!full.startsWith(base)) return "Access denied.";
        content = readFileSync(full, "utf-8");
      } else {
        content = await getFileContent(ctx.owner, ctx.repo, path, ctx.branch);
      }
      return sliceLines(content, startLine, endLine);
    } catch (e) {
      return `Error reading ${path}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (name === "searchFiles") {
    if (!ctx) return "No project loaded.";
    const pattern = (args.pattern as string || "").toLowerCase();
    const maxResults = Math.min((args.maxResults as number | undefined) ?? 50, 200);
    try {
      const paths =
        ctx.type === "local"
          ? walkLocalPaths(ctx.sessionId)
          : flattenTree(await getRepoTree(ctx.owner, ctx.repo, ctx.branch));
      const matches = paths.filter((p) => p.toLowerCase().includes(pattern)).slice(0, maxResults);
      if (matches.length === 0) return `No files matching "${pattern}".`;
      return `${matches.length} file(s):\n${matches.join("\n")}`;
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (name === "showResult") {
    // Handled by the caller — just acknowledge
    return "Result displayed.";
  }

  return `Unknown tool: ${name}`;
}

// ─── tool-call detection ──────────────────────────────────────────────────────

interface ParsedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsStr: string;
}

// ─── OpenAI tool definitions ──────────────────────────────────────────────────

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "List files in the project, optionally filtered by directory.",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory prefix to filter by (optional)" },
          maxResults: { type: "number", description: "Max results (default 100)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read the source code of a file in the project (max 200 lines per call).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path, e.g. src/auth.ts" },
          startLine: { type: "number", description: "First line to read (1-indexed, optional)" },
          endLine: { type: "number", description: "Last line to read (inclusive, optional)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchFiles",
      description: "Find files whose path contains a pattern string.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern to match in file paths (case-insensitive)" },
          maxResults: { type: "number", description: "Max results (default 50)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "showResult",
      description: "Call this at the end to pin relevant files in the analysis panel. Always call this once you have finished reading files.",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description: "List of relevant file paths found during analysis",
          },
          summary: {
            type: "string",
            description: "One-sentence summary of the finding",
          },
        },
        required: ["files", "summary"],
      },
    },
  },
];

// ─── SSE helper ───────────────────────────────────────────────────────────────

type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; arg: string }
  | { type: "tool_done"; name: string; preview: string }
  | { type: "result"; files: string[]; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

function encodeEvent(enc: TextEncoder, ev: ChatEvent): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(ev)}\n\n`);
}

function streamTextAsChunks(send: (ev: ChatEvent) => void, text: string): void {
  const cleaned = text.trim();
  if (!cleaned) return;
  const parts = cleaned.match(/.{1,220}(\s|$)/g) ?? [cleaned];
  for (const part of parts) {
    send({ type: "text", delta: part });
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ─── system prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ProjectCtx): string {
  const projectLabel =
    ctx == null
      ? "No project loaded yet."
      : ctx.type === "local"
      ? `Local folder (session: ${ctx.sessionId})`
      : `GitHub repo: ${ctx.owner}/${ctx.repo} @ ${ctx.branch}`;

  return `You are a codebase analysis assistant.
Project: ${projectLabel}

You have these tools:
- listFiles(directory?) — list files, optionally filtered by directory
- readFile(path, startLine?, endLine?) — read source code (max 200 lines per call)
- searchFiles(pattern) — find files by name pattern
- showResult(files, summary) — pin relevant files in the UI panel (call once at the end)

Workflow:
1. Use tools to explore and read actual code before answering.
2. Write your analysis step-by-step as you read files.
3. When done, call showResult with the relevant file paths and a short summary.

Important:
- Always call showResult at the end of your analysis.
- Never output raw JSON tool calls in user-facing text.`;
}

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeToolCall(raw: unknown): ParsedToolCall | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const fn = obj.function as Record<string, unknown> | undefined;
  const name =
    (typeof obj.name === "string" && obj.name) ||
    (typeof obj.function === "string" && obj.function) ||
    (typeof fn?.name === "string" && fn.name) ||
    "";
  if (!name) return null;
  const args = parseArgs(obj.arguments ?? obj.args ?? obj.parameters ?? fn?.arguments ?? {});
  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : crypto.randomUUID(),
    name,
    args,
    argsStr: JSON.stringify(args),
  };
}

function parseJsonToolCallsFromContent(content: string): ParsedToolCall[] {
  const cleaned = content.trim();
  if (!cleaned) return [];

  const candidates: string[] = [];
  const fencedBlocks = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const block of fencedBlocks) {
    const body = block[1]?.trim();
    if (body) candidates.push(body);
  }
  candidates.push(cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, ""));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) {
        const list = parsed.map(normalizeToolCall).filter((x): x is ParsedToolCall => x !== null);
        if (list.length > 0) return list;
      } else if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.tool_calls)) {
          const list = obj.tool_calls.map(normalizeToolCall).filter((x): x is ParsedToolCall => x !== null);
          if (list.length > 0) return list;
        }
        if (Array.isArray(obj.calls)) {
          const list = obj.calls.map(normalizeToolCall).filter((x): x is ParsedToolCall => x !== null);
          if (list.length > 0) return list;
        }
        const one = normalizeToolCall(obj);
        if (one) return [one];
      }
    } catch {
      continue;
    }
  }

  return [];
}

// ─── main handler ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as {
    messages: Array<{ role: string; content: string }>;
  };
  const userMessages = body.messages ?? [];

  const { baseURL, apiKey, model } = await getLLMConfig();
  const ctx = await getProjectContext();

  const openai = new OpenAI({ baseURL, apiKey });
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(ev: ChatEvent) {
        try { controller.enqueue(encodeEvent(enc, ev)); } catch { /* closed */ }
      }

      try {
        const systemPrompt = buildSystemPrompt(ctx);
        const loopMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...(userMessages as OpenAI.ChatCompletionMessageParam[]),
        ];
        const MAX_ITERATIONS = 12;
        const MAX_TOOL_CALLS = 30;
        let totalToolCalls = 0;
        let showResultCalled = false;
        const toolSignatureCount = new Map<string, number>();
        const toolEvidence: string[] = [];

        // Phase 1: deterministic tool loop (non-stream)
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          if (totalToolCalls >= MAX_TOOL_CALLS || showResultCalled) break;

          const completion = await openai.chat.completions.create({
            model,
            messages: loopMessages,
            tools: TOOLS,
            max_tokens: 900,
          });

          const message = completion.choices[0]?.message;
          const assistantText =
            typeof message?.content === "string"
              ? message.content
              : "";

          const properToolCalls: ParsedToolCall[] =
            message?.tool_calls
              ?.map((tc) =>
                normalizeToolCall({
                  id: tc.id,
                  function: { name: tc.function?.name, arguments: tc.function?.arguments },
                })
              )
              .filter((x): x is ParsedToolCall => x !== null) ?? [];

          const jsonToolCalls = properToolCalls.length === 0 ? parseJsonToolCallsFromContent(assistantText) : [];
          const toolCalls = properToolCalls.length > 0 ? properToolCalls : jsonToolCalls;

          if (toolCalls.length === 0) {
            // Never leak raw JSON/tool-thinking to the user.
            // If the model skipped tools entirely, bootstrap one grounding tool call.
            if (totalToolCalls === 0) {
              const bootstrap: ParsedToolCall = {
                id: crypto.randomUUID(),
                name: "listFiles",
                args: { directory: "src", maxResults: 150 },
                argsStr: JSON.stringify({ directory: "src", maxResults: 150 }),
              };
              loopMessages.push({
                role: "assistant",
                tool_calls: [
                  {
                    id: bootstrap.id,
                    type: "function",
                    function: { name: bootstrap.name, arguments: bootstrap.argsStr },
                  },
                ],
              });
              const mainArg = "src";
              send({ type: "tool_start", name: bootstrap.name, arg: mainArg });
              const result = await runTool(bootstrap.name, bootstrap.args, ctx);
              send({ type: "tool_done", name: bootstrap.name, preview: result.slice(0, 200) });
              loopMessages.push({
                role: "tool",
                tool_call_id: bootstrap.id,
                content: result,
              });
              totalToolCalls += 1;
              toolEvidence.push(`[${bootstrap.name}:${mainArg}] ${result.slice(0, 240)}`);
              continue;
            }
            break;
          }

          loopMessages.push({
            role: "assistant",
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.argsStr },
            })),
          });

          for (const tc of toolCalls) {
            if (totalToolCalls >= MAX_TOOL_CALLS) break;
            const mainArg = String(tc.args.path ?? tc.args.directory ?? tc.args.pattern ?? "");
            send({ type: "tool_start", name: tc.name, arg: mainArg });
            totalToolCalls += 1;

            const signature = `${tc.name}:${JSON.stringify(tc.args)}`;
            const seen = (toolSignatureCount.get(signature) ?? 0) + 1;
            toolSignatureCount.set(signature, seen);
            if (seen >= 3) {
              loopMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: "Skipped: same tool call repeated multiple times.",
              });
              send({ type: "tool_done", name: tc.name, preview: "Skipped repeated tool call." });
              continue;
            }

            let result: string;
            if (tc.name === "showResult") {
              const files = ((tc.args.files as string[]) ?? (Array.isArray(tc.args.relevantFiles)
                ? (tc.args.relevantFiles as Array<{ path?: string }>)
                    .map((f) => (typeof f?.path === "string" ? f.path : ""))
                    .filter(Boolean)
                : []));
              const summary = (tc.args.summary as string) ?? "";
              if (files.length === 0 || toolEvidence.length === 0) {
                result = "Rejected showResult: read files first and provide non-empty relevant files.";
              } else {
                result = `Showing ${files.length} file(s).`;
                send({ type: "result", files, summary });
                showResultCalled = true;
              }
            } else {
              result = await runTool(tc.name, tc.args, ctx);
              toolEvidence.push(`[${tc.name}${mainArg ? `:${mainArg}` : ""}] ${result.slice(0, 240)}`);
            }

            send({ type: "tool_done", name: tc.name, preview: result.slice(0, 200) });
            loopMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          }
        }

        // Phase 2: always force a final textual answer (non-stream for reliability)
        let finalText = "";
        try {
          const final = await withTimeout(
            openai.chat.completions.create({
              model,
              messages: [
                ...loopMessages,
                {
                  role: "user",
                  content:
                    "Now provide your final answer in plain text based on gathered evidence. Do not call tools. Be complete and concrete.",
                },
              ],
              max_tokens: 650,
            }),
            25000
          );
          finalText = final.choices[0]?.message?.content?.trim() ?? "";
        } catch {
          finalText = "";
        }
        if (finalText) streamTextAsChunks(send, finalText);

        // Fallback: synthesize final text if model emitted nothing.
        if (!finalText) {
          let fallbackText = "";
          try {
            const fallback = await withTimeout(
              openai.chat.completions.create({
                model,
                messages: [
                  ...loopMessages,
                  {
                    role: "user",
                    content:
                      "Output a short final analysis now in plain text. No tools.",
                  },
                ],
                max_tokens: 380,
              }),
              12000
            );
            fallbackText = fallback.choices[0]?.message?.content?.trim() ?? "";
          } catch {
            fallbackText = "";
          }
          if (fallbackText) {
            streamTextAsChunks(send, fallbackText);
          } else {
            const evidence = toolEvidence.slice(-8).join("\n");
            streamTextAsChunks(
              send,
              evidence
                ? `J’ai analysé le code et exécuté des outils, mais le modèle n’a pas renvoyé de synthèse finale.\n\nÉléments collectés:\n${evidence}`
                : "Le modèle n’a pas renvoyé de réponse finale textuelle."
            );
          }
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
