"use client";

import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore } from "@/store";
import type { AnalysisResult } from "@/types";

type UiMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; arg: string }
  | { type: "tool_done"; name: string; preview: string }
  | { type: "result"; files: string[]; summary: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function ChatPanel() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<string[]>([]);
  const [latestTool, setLatestTool] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const setAnalysisLoading = useAppStore((s) => s.setAnalysisLoading);
  const setAnalysisError = useAppStore((s) => s.setAnalysisError);
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);
  const abortRef = useRef<AbortController | null>(null);
  const hasAssistantTextRef = useRef(false);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

  const applyPendingResult = (pending: { files: string[]; summary: string } | null) => {
    if (!pending) return;
    const result: AnalysisResult = {
      explanation: pending.summary,
      relevantFiles: pending.files.map((path) => ({ path, relevance: "" })),
      flowDiagram: { nodes: [], edges: [] },
    };
    setAnalysisResult(result);
  };

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    const nextMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(nextMessages);
    setToolEvents([]);
    setLatestTool(null);
    setShowTools(false);
    setInput("");
    setIsStreaming(true);
    setAnalysisLoading(true);
    setAnalysisError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let pendingResult: { files: string[]; summary: string } | null = null;
    hasAssistantTextRef.current = false;

    try {
      const history = nextMessages
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          let ev: StreamEvent;
          try {
            ev = JSON.parse(payload) as StreamEvent;
          } catch {
            continue;
          }

          if (ev.type === "text") {
            hasAssistantTextRef.current = true;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (!last || last.role !== "assistant") {
                copy.push({ role: "assistant", content: ev.delta });
                return copy;
              }
              copy[copy.length - 1] = {
                ...last,
                content: last.content + ev.delta,
              };
              return copy;
            });
          } else if (ev.type === "tool_start") {
            const label = `Using ${ev.name}${ev.arg ? ` (${ev.arg})` : ""}`;
            setLatestTool(label);
            setToolEvents((prev) => [...prev, `${label}…`]);
          } else if (ev.type === "tool_done") {
            setToolEvents((prev) => [...prev, `${ev.name} done.`]);
          } else if (ev.type === "result") {
            pendingResult = { files: ev.files, summary: ev.summary };
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          } else if (ev.type === "done") {
            applyPendingResult(pendingResult);
          }
        }
      }

      if (!hasAssistantTextRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Je n’ai reçu aucun texte final. Réessaie, ou change de modèle dans Settings.",
          },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Streaming failed";
      setAnalysisError(message);
    } finally {
      abortRef.current = null;
      setLatestTool(null);
      setIsStreaming(false);
      setAnalysisLoading(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const newChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    hasAssistantTextRef.current = false;
    setMessages([]);
    setToolEvents([]);
    setLatestTool(null);
    setShowTools(false);
    setInput("");
    setIsStreaming(false);
    setAnalysisLoading(false);
    setAnalysisError(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f7f7f8]">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">AI Assistant</span>
        <button
          onClick={newChat}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          New chat
        </button>
      </div>
      <div className="flex-1 overflow-auto px-4 py-5 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask anything about the loaded codebase. I will read real files with tools and stream the reasoning here.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl bg-[#e7f0ff] px-4 py-2.5 text-sm text-[#12315f]"
                : "max-w-[95%] px-1 text-sm leading-6 text-gray-800"
            }
          >
            {m.role === "user" ? (
              m.content
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ ...props }) => <h1 className="text-2xl font-semibold mt-4 mb-2" {...props} />,
                  h2: ({ ...props }) => <h2 className="text-xl font-semibold mt-4 mb-2" {...props} />,
                  h3: ({ ...props }) => <h3 className="text-lg font-semibold mt-3 mb-2" {...props} />,
                  h4: ({ ...props }) => <h4 className="text-base font-semibold mt-3 mb-1.5" {...props} />,
                  h5: ({ ...props }) => <h5 className="text-sm font-semibold mt-2.5 mb-1.5" {...props} />,
                  h6: ({ ...props }) => <h6 className="text-sm font-semibold mt-2 mb-1" {...props} />,
                  p: ({ ...props }) => <p className="mb-3 whitespace-pre-wrap" {...props} />,
                  a: ({ ...props }) => <a className="text-indigo-600 underline hover:text-indigo-500" target="_blank" rel="noreferrer" {...props} />,
                  ul: ({ ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                  ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                  li: ({ ...props }) => <li className="leading-6" {...props} />,
                  blockquote: ({ ...props }) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-700 my-3" {...props} />,
                  hr: ({ ...props }) => <hr className="my-4 border-gray-300" {...props} />,
                  table: ({ ...props }) => <div className="my-3 overflow-auto"><table className="w-full border-collapse text-sm" {...props} /></div>,
                  thead: ({ ...props }) => <thead className="bg-gray-100" {...props} />,
                  tbody: ({ ...props }) => <tbody {...props} />,
                  tr: ({ ...props }) => <tr className="border-b border-gray-200" {...props} />,
                  th: ({ ...props }) => <th className="px-2 py-1.5 text-left font-semibold" {...props} />,
                  td: ({ ...props }) => <td className="px-2 py-1.5 align-top" {...props} />,
                  code: ({ className, children, ...props }) => {
                    const isBlock = Boolean(className?.includes("language-"));
                    if (isBlock) return <code className={className} {...props}>{children}</code>;
                    return <code className="rounded bg-gray-100 px-1 py-0.5 text-[13px]" {...props}>{children}</code>;
                  },
                  pre: ({ ...props }) => <pre className="mb-3 overflow-auto rounded-lg bg-gray-900 p-3 text-gray-100 text-[13px]" {...props} />,
                }}
              >
                {m.content}
              </ReactMarkdown>
            )}
          </div>
        ))}
        {(isStreaming || toolEvents.length > 0) && (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                {isStreaming ? "Analyzing codebase…" : "Tool activity"}
              </span>
              {toolEvents.length > 0 && (
                <button
                  onClick={() => setShowTools((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {showTools ? "Hide" : `Show (${toolEvents.length})`}
                </button>
              )}
            </div>
            {latestTool && !showTools && (
              <p className="mt-1 truncate text-xs text-gray-600">{latestTool}</p>
            )}
            {showTools && toolEvents.length > 0 && (
              <div className="mt-2 max-h-36 overflow-auto space-y-1">
                {toolEvents.map((line, idx) => (
                  <p key={`${line}-${idx}`} className="text-xs text-gray-600">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-gray-200 bg-white p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask about architecture, data flow, auth, etc."
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
          />
          {!isStreaming ? (
            <button
              onClick={() => void sendMessage()}
              disabled={!canSend}
              className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          ) : (
            <button
              onClick={stopStreaming}
              className="rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-medium text-white"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
