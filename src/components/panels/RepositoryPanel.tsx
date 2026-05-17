"use client";

import { useRepository } from "@/hooks/useRepository";
import { RepoInput } from "@/components/RepoInput";
import { FileTree } from "@/components/FileTree";

export function RepositoryPanel() {
  const { loadRepository, loadLocalFolder, loadFile, tree, repoInfo, selectedFile, loading, error } =
    useRepository();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Explorer</p>
        <RepoInput
          onSubmit={loadRepository}
          onLoadFolder={loadLocalFolder}
          loading={loading}
          error={error}
        />
      </div>
      {repoInfo && (
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
          {repoInfo.localMode ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate text-sm font-medium text-gray-900">{repoInfo.owner}</span>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">local</span>
            </>
          ) : (
            <>
              <span className="truncate text-sm font-medium text-gray-900">
                {repoInfo.owner}/{repoInfo.repo}
              </span>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                {repoInfo.branch}
              </span>
            </>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto px-1 py-1">
        {tree ? (
          <FileTree
            node={tree}
            selectedFile={selectedFile}
            onSelectFile={loadFile}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-center text-sm text-gray-400">
              {loading ? "Loading..." : "Enter a repo URL or select a local folder"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

