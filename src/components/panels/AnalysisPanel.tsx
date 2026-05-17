"use client";

import { useCallback } from "react";
import { useAppStore } from "@/store";
import { fetchFile } from "@/lib/fetch-file";

export function AnalysisPanel() {
  const analysis = useAppStore((s) => s.analysis);
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const setCodeViewer = useAppStore((s) => s.setCodeViewer);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const setRepoError = useAppStore((s) => s.setRepoError);

  const handleFileClick = useCallback(async (filePath: string) => {
    if (!repoInfo) return;

    setSelectedFile(filePath);

    try {
      const content = await fetchFile(repoInfo.owner, repoInfo.repo, filePath, repoInfo.branch, {
        localMode: repoInfo.localMode,
        sessionId: repoInfo.sessionId,
      });

      const relevantFile = analysis.result?.relevantFiles.find(
        (f) => f.path === filePath
      );
      setCodeViewer(
        filePath,
        content,
        relevantFile?.highlightedLines ?? [],
        relevantFile?.relevance
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load file";
      setRepoError(msg);
    }
  }, [repoInfo, analysis.result, setSelectedFile, setCodeViewer, setRepoError]);

  if (!analysis.result && !analysis.loading) {
    return null;
  }

  if (analysis.loading) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
        Analyzing...
      </div>
    );
  }

  if (analysis.error) {
    return (
      <div className="border-t border-gray-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
        {analysis.error}
      </div>
    );
  }

  const { explanation, relevantFiles } = analysis.result!;

  return (
    <div className="flex flex-col overflow-hidden max-h-[30%] border-t border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Analysis</span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
          {relevantFiles.length} files
        </span>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {explanation && (
          <p className="mb-2 text-xs italic text-gray-500">{explanation}</p>
        )}
        {relevantFiles.length > 0 && (
          <div className="space-y-0.5">
            {relevantFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => handleFileClick(file.path)}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-indigo-600 hover:bg-indigo-50"
              >
                <span className="truncate">{file.path}</span>
                {file.relevance && (
                  <span className="ml-auto shrink-0 pl-3 text-[11px] text-gray-400 truncate max-w-[40%]">{file.relevance}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
