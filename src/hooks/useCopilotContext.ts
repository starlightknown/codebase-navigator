"use client";

import { useMemo } from "react";
import { useAgentContext } from "@copilotkit/react-core/v2";
import { useAppStore } from "@/store";
import { flattenTree } from "@/lib/analyzer";
import type { TreeNode } from "@/types";

const MAX_FILE_PATHS = 500;

function treeToPathList(tree: TreeNode | null): string | null {
  if (!tree) return null;
  const paths = flattenTree(tree);
  if (paths.length <= MAX_FILE_PATHS) return paths.join("\n");
  return paths.slice(0, MAX_FILE_PATHS).join("\n") + `\n... and ${paths.length - MAX_FILE_PATHS} more files`;
}

export function useCopilotContext() {
  const repo = useAppStore((s) => s.repo);
  const analysis = useAppStore((s) => s.analysis);
  const codeViewer = useAppStore((s) => s.codeViewer);

  const fileList = useMemo(() => treeToPathList(repo.tree), [repo.tree]);

  const repoLabel = repo.repoInfo
    ? repo.repoInfo.localMode
      ? `${repo.repoInfo.owner} (local folder)`
      : `${repo.repoInfo.owner}/${repo.repoInfo.repo} (branch: ${repo.repoInfo.branch})`
    : null;

  useAgentContext({
    description: "Current repository / project information",
    value: repo.repoInfo ? JSON.stringify(repo.repoInfo) : null,
  });

  useAgentContext({
    description: `File paths in the project (max ${MAX_FILE_PATHS}), one per line. Use these paths with the tools below.`,
    value: fileList,
  });

  useAgentContext({
    description: "Currently selected file path",
    value: repo.selectedFile,
  });

  useAgentContext({
    description: "Latest analysis result including explanation, relevant files, and flow diagram",
    value: analysis.result ? JSON.stringify(analysis.result) : null,
  });

  useAgentContext({
    description: "Currently viewed file content and highlighted lines in the code viewer",
    value: codeViewer.filePath
      ? JSON.stringify({ filePath: codeViewer.filePath, highlightedLines: codeViewer.highlightedLines })
      : null,
  });

  useAgentContext({
    description: "System instructions",
    value: repo.repoInfo
      ? `You are a Codebase Navigator AI assistant with REAL access to the project's source files.

LOADED PROJECT: ${repoLabel}

═══════════════════════════════════════
HOW TO RESPOND — FOLLOW THIS STRICTLY
═══════════════════════════════════════

1. WRITE YOUR THOUGHTS AS NORMAL CHAT MESSAGES — not inside tool parameters.
   Stream your reasoning directly: "Let me explore the file structure first…", "I can see that…", "Reading app.py now…"

2. USE THESE TOOLS TO ACCESS REAL CODE:
   Server-side (available instantly):
   • readFile(path, startLine?, endLine?)   — read up to 200 lines of any file
   • listFiles(directory?, maxResults?)     — list all or filtered file paths
   • searchFiles(pattern, maxResults?)     — find files by name pattern

   Frontend display tools:
   • fetchFileContent(filePath, startLine?, endLine?) — open a file in the code viewer panel
   • highlightCode(filePath, lines, explanation)      — show highlighted lines in the viewer
   • generateFlowDiagram(files, diagramType)          — create a visual diagram
   • showResult(relevantFiles, summary, diagramFiles?) — show final result panel (call LAST)

3. THE REQUIRED WORKFLOW for any question about the codebase:
   Step 1 → Write: "Let me look at the file list first."
   Step 2 → Call listFiles() or searchFiles() to find relevant files
   Step 3 → Write which files you plan to read
   Step 4 → Call readFile() on each key file — read the ACTUAL source code
   Step 5 → Write your analysis based on what you ACTUALLY read (cite line numbers)
   Step 6 → Call showResult() with the list of relevant files and a one-line summary
   Step 7 → Optionally call highlightCode() to point to specific lines

4. NEVER guess or assume — always read files before making claims about the code.
5. NEVER put your analysis text inside tool parameters — write it as chat messages.
6. Use ONLY file paths from the file list above.`
      : "You are a Codebase Navigator assistant. No project is currently loaded. Ask the user to paste a GitHub repository URL or type a local folder path in the Repository panel.",
  });
}

