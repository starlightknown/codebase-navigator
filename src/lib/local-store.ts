/**
 * Server-side store for locally scanned folders.
 * Maps sessionId → { basePath, folderName }.
 * File content is never loaded into memory — reads go straight to disk via basePath.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

const SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours
const STORE_FILE = process.env.CN_LOCAL_STORE_FILE || "/tmp/codebase-navigator/local-sessions.json";

interface Session {
  basePath: string;
  folderName: string;
  createdAt: number;
}

type StoreMap = Record<string, Session>;

let inMemoryCache: StoreMap | null = null;

function loadStore(): StoreMap {
  if (inMemoryCache) return inMemoryCache;
  try {
    if (!existsSync(STORE_FILE)) {
      inMemoryCache = {};
      return inMemoryCache;
    }
    const raw = readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoreMap;
    inMemoryCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    inMemoryCache = {};
  }
  return inMemoryCache;
}

function saveStore(store: StoreMap): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store), "utf-8");
  inMemoryCache = store;
}

function pruneOldSessions(store: StoreMap): StoreMap {
  const now = Date.now();
  let changed = false;
  const next: StoreMap = {};
  for (const [id, session] of Object.entries(store)) {
    if (now - session.createdAt <= SESSION_TTL) {
      next[id] = session;
    } else {
      changed = true;
    }
  }
  if (changed) saveStore(next);
  return next;
}

export function createSession(sessionId: string, basePath: string, folderName: string): void {
  const store = pruneOldSessions(loadStore());
  store[sessionId] = { basePath, folderName, createdAt: Date.now() };
  saveStore(store);
}

export function getBasePath(sessionId: string): string | null {
  const store = pruneOldSessions(loadStore());
  return store[sessionId]?.basePath ?? null;
}

export function getFolderName(sessionId: string): string {
  const store = pruneOldSessions(loadStore());
  return store[sessionId]?.folderName ?? "local";
}

export function sessionExists(sessionId: string): boolean {
  const store = pruneOldSessions(loadStore());
  return Boolean(store[sessionId]);
}
