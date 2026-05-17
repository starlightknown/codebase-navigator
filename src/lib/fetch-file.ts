const cache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchFile(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  options?: { localMode?: boolean; sessionId?: string }
): Promise<string> {
  const { localMode, sessionId } = options ?? {};

  if (localMode && sessionId) {
    return fetchLocalFile(sessionId, path);
  }

  const key = `${owner}/${repo}/${ref}/${path}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  const repoUrl = `${owner}/${repo}`;
  const res = await fetch(
    `/api/github/file?repo=${encodeURIComponent(repoUrl)}&path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`
  );
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to fetch file");
  }
  const data = await res.json();

  cache.set(key, { content: data.content, timestamp: Date.now() });

  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 50; i++) {
      cache.delete(oldest[i][0]);
    }
  }

  return data.content;
}

async function fetchLocalFile(sessionId: string, path: string): Promise<string> {
  const res = await fetch(
    `/api/local/file?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`
  );
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to fetch local file");
  }
  const data = await res.json();
  return data.content;
}

