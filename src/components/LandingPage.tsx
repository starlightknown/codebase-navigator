"use client";

import { useState, useCallback } from "react";
import { SettingsModal } from "@/components/SettingsModal";
import { CodeIcon, SettingsIcon } from "@/components/icons";

interface LandingPageProps {
  onLoadRepo: (repoUrl: string) => void;
  onLoadFolder: (folderPath: string) => void;
  loading: boolean;
  error: string | null;
}

export function LandingPage({ onLoadRepo, onLoadFolder, loading, error }: LandingPageProps) {
  const [url, setUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;
      onLoadRepo(trimmed);
    },
    [url, onLoadRepo]
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
    <div className="flex h-screen w-screen flex-col bg-white">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <CodeIcon size={16} />
          </div>
          <span className="text-base font-semibold text-gray-900">Codebase Navigator</span>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <SettingsIcon />
          Settings
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <div className="w-full max-w-xl text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <CodeIcon size={32} />
            </div>
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900">
            Understand any codebase
          </h1>
          <p className="mb-8 text-base text-gray-500">
            Connect a GitHub repository or open a local folder. Ask questions in natural language and watch the AI reason through your code in real time.
          </p>

          {/* GitHub URL */}
          <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="shrink-0 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </span>
              ) : "Explore"}
            </button>
          </form>

          {/* Divider */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or open a local folder</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Local folder path */}
          <form onSubmit={handleFolderSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/home/user/my-project  or  ~/projects/app"
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !folderPath.trim()}
              className="shrink-0 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-5 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Scanning..." : "Open"}
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
          )}

          <div className="mt-12 grid grid-cols-3 gap-6 text-left">
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Ask questions</h3>
              <p className="text-xs leading-relaxed text-gray-500">Ask how authentication works, where the API layer is, or how services connect.</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Visual diagrams</h3>
              <p className="text-xs leading-relaxed text-gray-500">See architecture graphs, dependency maps, and request flow diagrams.</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">Live reasoning</h3>
              <p className="text-xs leading-relaxed text-gray-500">Watch the AI read real files and reason step-by-step — no guesswork.</p>
            </div>
          </div>
        </div>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
