"use client";

import { useState, useCallback } from "react";

interface RepoInputProps {
  onSubmit: (repoUrl: string) => void;
  onLoadFolder: (folderPath: string) => void;
  loading: boolean;
  error: string | null;
}

export function RepoInput({ onSubmit, onLoadFolder, loading, error }: RepoInputProps) {
  const [url, setUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [mode, setMode] = useState<"github" | "local">("github");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
    },
    [url, onSubmit]
  );

  const handleFolderSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = folderPath.trim();
      if (!trimmed) return;
      onLoadFolder(trimmed);
    },
    [folderPath, onLoadFolder]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("github")}
          className={`flex-1 rounded-md py-1 font-medium transition-colors ${
            mode === "github" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          GitHub
        </button>
        <button
          type="button"
          onClick={() => setMode("local")}
          className={`flex-1 rounded-md py-1 font-medium transition-colors ${
            mode === "local" ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Local folder
        </button>
      </div>

      {mode === "github" ? (
        <form onSubmit={handleSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="owner/repo"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "..." : "Load"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleFolderSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="/path/to/project"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !folderPath.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "..." : "Open"}
          </button>
        </form>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}


