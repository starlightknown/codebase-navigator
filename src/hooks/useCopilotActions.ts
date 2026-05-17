"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { useAppStore } from "@/store";
import { categorizeFileType, extractImports, buildDependencyNodes } from "@/lib/analyzer";
import { fetchFile } from "@/lib/fetch-file";
import type { FlowNode, FlowEdge, RelevantFile } from "@/types";

const MAX_LINES_IN_TOOL_RESULT = 200;

export function useCopilotActions() {
  const repo = useAppStore((s) => s.repo);
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);
  const setVisualization = useAppStore((s) => s.setVisualization);
  const setCodeViewer = useAppStore((s) => s.setCodeViewer);

  const fetchRepoFile = async (filePath: string): Promise<string> => {
    if (!repo.repoInfo) throw new Error("No repository loaded");
    return fetchFile(
      repo.repoInfo.owner,
      repo.repoInfo.repo,
      filePath,
      repo.repoInfo.branch,
      { localMode: repo.repoInfo.localMode, sessionId: repo.repoInfo.sessionId }
    );
  };

  useFrontendTool({
    name: "showResult",
    description:
      "Display the final analysis in the visual panels. Call this ONLY after you have finished reading files and written your full explanation as normal chat text. This updates the file panel and dependency diagram. Do NOT call this at the beginning — only when your investigation is complete.",
    parameters: z.object({
      relevantFiles: z
        .array(z.object({ path: z.string(), relevance: z.string().optional() }))
        .describe("Files you actually read and found relevant. Each entry needs a path and optional one-sentence relevance note."),
      summary: z.string().describe("One short sentence summarising the finding (e.g. 'Authentication is handled by 3 files in src/auth/')"),
      diagramFiles: z
        .array(z.string())
        .optional()
        .describe("Subset of file paths to include in the dependency diagram (max 15). Omit to use relevantFiles."),
    }),
    handler: async ({ relevantFiles, summary, diagramFiles }) => {
      const diagramPaths = (diagramFiles ?? relevantFiles.map((f) => f.path)).slice(0, 15);

      let graph: { nodes: FlowNode[]; edges: FlowEdge[] };
      if (repo.repoInfo && diagramPaths.length > 0) {
        const fileDataPromises = diagramPaths.map(async (p) => {
          try {
            const content = await fetchRepoFile(p);
            return { path: p, imports: extractImports(content) };
          } catch {
            return { path: p, imports: [] };
          }
        });
        const fileData = await Promise.all(fileDataPromises);
        graph = buildDependencyNodes(fileData);
        for (const node of graph.nodes) {
          node.type = categorizeFileType(node.metadata?.fullPath || node.id);
        }
      } else {
        graph = {
          nodes: diagramPaths.map((p, i) => ({
            id: `node-${i}`,
            type: categorizeFileType(p),
            label: p.split("/").pop() || p,
            metadata: { fullPath: p },
          })),
          edges: [],
        };
      }

      const files: RelevantFile[] = relevantFiles.map((f) => ({
        path: f.path,
        relevance: f.relevance ?? "",
      }));

      setAnalysisResult({ explanation: summary, relevantFiles: files, flowDiagram: graph });
      if (graph.nodes.length > 0) setVisualization(graph.nodes, graph.edges, "dependency");

      return `Result panel updated: ${files.length} relevant files shown.`;
    },
  }, [repo.tree, repo.repoInfo]);

  useFrontendTool({
    name: "fetchFileContent",
    description:
      "Fetch and display a file from the repository in the code viewer panel. Returns the file content so you can read and reason about it.",
    parameters: z.object({
      filePath: z.string().describe("The exact file path to fetch (e.g. src/main.rs)"),
      startLine: z.number().optional().describe("First line to return (1-indexed, optional)"),
      endLine: z.number().optional().describe("Last line to return (inclusive, max startLine+199, optional)"),
    }),
    handler: async ({ filePath, startLine, endLine }) => {
      if (!repo.repoInfo) {
        return "No repository loaded.";
      }

      try {
        const content = await fetchRepoFile(filePath);
        setCodeViewer(filePath, content);

        // Return actual content so the AI can reason about it
        const lines = content.split("\n");
        const from = startLine ? Math.max(0, startLine - 1) : 0;
        const to = endLine ? Math.min(endLine, from + MAX_LINES_IN_TOOL_RESULT) : from + MAX_LINES_IN_TOOL_RESULT;
        const slice = lines.slice(from, to);
        const truncated = slice.length < lines.length;
        const result = slice.map((l, i) => `${from + i + 1}: ${l}`).join("\n");
        return `File: ${filePath} (lines ${from + 1}–${from + slice.length} of ${lines.length})\n\`\`\`\n${result}\n\`\`\`${truncated ? `\n\n(File has ${lines.length} total lines — use startLine/endLine to read more)` : ""}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch file";
        return `Error: ${message}`;
      }
    },
  }, [repo.repoInfo]);

  useFrontendTool({
    name: "generateFlowDiagram",
    description:
      "Generate a visual diagram from a list of file paths. Automatically creates nodes and layout.",
    parameters: z.object({
      files: z.array(z.string()).describe("List of file paths to include in the diagram"),
      diagramType: z.enum(["dependency", "flow", "architecture"]).describe("Type of diagram to generate"),
    }),
    handler: async ({ files, diagramType }) => {
      if (repo.repoInfo && files.length > 0) {
        const fileDataPromises = files.slice(0, 20).map(async (f) => {
          try {
            const content = await fetchRepoFile(f);
            return { path: f, imports: extractImports(content) };
          } catch {
            return { path: f, imports: [] };
          }
        });
        const fileData = await Promise.all(fileDataPromises);
        const graph = buildDependencyNodes(fileData);
        for (const node of graph.nodes) {
          node.type = categorizeFileType(node.metadata?.fullPath || node.id);
        }
        setVisualization(graph.nodes, graph.edges, diagramType);
        return `Diagram generated with ${graph.nodes.length} nodes and ${graph.edges.length} dependency edges.`;
      }

      const flowNodes: FlowNode[] = files.map((f, i) => ({
        id: `node-${i}`,
        type: categorizeFileType(f),
        label: f.split("/").pop() || f,
        metadata: { fullPath: f },
      }));
      setVisualization(flowNodes, [], diagramType);
      return `Diagram generated with ${flowNodes.length} nodes.`;
    },
  }, [repo.repoInfo]);

  useFrontendTool({
    name: "highlightCode",
    description:
      "Show a file in the code viewer with specific lines highlighted. Returns the file content around the highlighted lines so you can reference it.",
    parameters: z.object({
      filePath: z.string().describe("Path of the file to display"),
      lines: z.array(z.number()).describe("Line numbers to highlight"),
      explanation: z.string().describe("Explanation of the highlighted lines"),
    }),
    handler: async ({ filePath, lines, explanation }) => {
      if (!repo.repoInfo) {
        return "No repository loaded.";
      }

      try {
        const content = await fetchRepoFile(filePath);
        setCodeViewer(filePath, content, lines, explanation);

        // Return context around the highlighted lines
        const allLines = content.split("\n");
        const minLine = Math.max(0, Math.min(...lines) - 5);
        const maxLine = Math.min(allLines.length, Math.max(...lines) + 5);
        const snippet = allLines
          .slice(minLine, maxLine)
          .map((l, i) => {
            const lineNum = minLine + i + 1;
            const marker = lines.includes(lineNum) ? "→" : " ";
            return `${marker} ${lineNum}: ${l}`;
          })
          .join("\n");
        return `Showing ${filePath} with ${lines.length} highlighted lines (${lines.join(", ")}).\n\`\`\`\n${snippet}\n\`\`\`\n\n${explanation}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch file";
        return `Error: ${message}`;
      }
    },
  }, [repo.repoInfo]);
}
