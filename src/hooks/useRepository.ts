"use client";

import { useCallback } from "react";
import { useAppStore } from "@/store";
import { buildOverviewGraph } from "@/lib/analyzer";
import { fetchFile } from "@/lib/fetch-file";
import type { TreeNode } from "@/types";

interface TreeResponse {
  owner: string;
  repo: string;
  branch: string;
  tree: TreeNode;
}

export function useRepository() {
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const tree = useAppStore((s) => s.repo.tree);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const loading = useAppStore((s) => s.repo.loading);
  const error = useAppStore((s) => s.repo.error);
  const setRepoInfo = useAppStore((s) => s.setRepoInfo);
  const setTree = useAppStore((s) => s.setTree);
  const setRepoLoading = useAppStore((s) => s.setRepoLoading);
  const setRepoError = useAppStore((s) => s.setRepoError);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const setCodeViewer = useAppStore((s) => s.setCodeViewer);
  const clearCodeViewer = useAppStore((s) => s.clearCodeViewer);
  const setVisualization = useAppStore((s) => s.setVisualization);

  const loadRepository = useCallback(
    async (repoUrl: string) => {
      setRepoLoading(true);
      setRepoError(null);
      clearCodeViewer();

      try {
        const res = await fetch(
          `/api/github/tree?repo=${encodeURIComponent(repoUrl)}`
        );
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to fetch repository");
        }
        const data: TreeResponse = await res.json();
        setRepoInfo({ owner: data.owner, repo: data.repo, branch: data.branch });
        setTree(data.tree);

        // Store repo info in cookie so server-side AI tools can access it
        document.cookie = `cn-current-repo=${encodeURIComponent(
          JSON.stringify({ owner: data.owner, repo: data.repo, branch: data.branch })
        )}; path=/; max-age=86400`;
        document.cookie = `cn-local-session=; path=/; max-age=0`; // clear local session

        const overview = buildOverviewGraph(data.tree);
        setVisualization(overview.nodes, overview.edges, "architecture");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load repository";
        setRepoError(message);
      } finally {
        setRepoLoading(false);
      }
    },
    [setRepoInfo, setTree, setRepoLoading, setRepoError, clearCodeViewer, setVisualization]
  );

  const loadLocalFolder = useCallback(
    async (folderPath: string) => {
      setRepoLoading(true);
      setRepoError(null);
      clearCodeViewer();

      try {
        const res = await fetch("/api/local/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Scan failed");
        }

        const data: { sessionId: string; folderName: string; fileCount: number; tree: TreeNode } = await res.json();

        setRepoInfo({
          owner: data.folderName,
          repo: data.folderName,
          branch: "local",
          localMode: true,
          sessionId: data.sessionId,
        });
        setTree(data.tree);

        // Store session in cookie for server-side tools
        document.cookie = `cn-local-session=${encodeURIComponent(data.sessionId)}; path=/; max-age=14400`;
        document.cookie = `cn-current-repo=; path=/; max-age=0`; // clear github cookie

        const overview = buildOverviewGraph(data.tree);
        setVisualization(overview.nodes, overview.edges, "architecture");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load folder";
        setRepoError(message);
      } finally {
        setRepoLoading(false);
      }
    },
    [setRepoInfo, setTree, setRepoLoading, setRepoError, clearCodeViewer, setVisualization]
  );

  const loadFile = useCallback(
    async (filePath: string) => {
      if (!repoInfo) return;

      setSelectedFile(filePath);

      try {
        const content = await fetchFile(
          repoInfo.owner,
          repoInfo.repo,
          filePath,
          repoInfo.branch,
          { localMode: repoInfo.localMode, sessionId: repoInfo.sessionId }
        );
        setCodeViewer(filePath, content);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load file";
        setRepoError(message);
      }
    },
    [repoInfo, setSelectedFile, setCodeViewer, setRepoError]
  );

  return {
    loadRepository,
    loadLocalFolder,
    loadFile,
    repoInfo,
    tree,
    selectedFile,
    loading,
    error,
  };
}

