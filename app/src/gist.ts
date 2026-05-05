const GIST_FILE = 'invoice-data.json';
const SYNC_KEY = 'invoice_sync';

export interface SyncConfig {
  pat: string;
  gistId: string;
}

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return { pat: '', gistId: '' };
    return { pat: '', gistId: '', ...JSON.parse(raw) };
  } catch {
    return { pat: '', gistId: '' };
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(config));
}

function headers(pat: string) {
  return {
    Authorization: `token ${pat}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

/** Fetch JSON content from a Gist. Returns null on failure. */
export async function fetchGist(config: SyncConfig): Promise<string | null> {
  if (!config.pat || !config.gistId) return null;
  try {
    const res = await fetch(`https://api.github.com/gists/${config.gistId}`, {
      headers: headers(config.pat),
    });
    if (!res.ok) return null;
    const body = await res.json() as { files?: Record<string, { content?: string }> };
    return body.files?.[GIST_FILE]?.content ?? null;
  } catch {
    return null;
  }
}

/** Push JSON content to a Gist. Returns true on success. */
export async function pushGist(config: SyncConfig, content: string): Promise<boolean> {
  if (!config.pat || !config.gistId) return false;
  try {
    const res = await fetch(`https://api.github.com/gists/${config.gistId}`, {
      method: 'PATCH',
      headers: headers(config.pat),
      body: JSON.stringify({ files: { [GIST_FILE]: { content } } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Create a new private Gist. Returns the Gist ID or null on failure. */
export async function createGist(pat: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: headers(pat),
      body: JSON.stringify({
        description: 'Invoice Generator Data',
        public: false,
        files: {
          [GIST_FILE]: {
            content: JSON.stringify({ sender: {}, customers: [], lastUsed: {}, history: [] }, null, 2),
          },
        },
      }),
    });
    if (!res.ok) return null;
    const body = await res.json() as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}
