/* ============================================================
   Infrastructure endpoints (trucking-crm monorepo).
   Override per environment in .env / .env.local:
     VITE_API_BASE_URL   → Express CRM API   (server/, port 3001)
     VITE_VOICE_WS_URL   → Grok voice relay  (setter-agent/, port 3100)
   ============================================================ */

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export const VOICE_WS_URL =
  import.meta.env.VITE_VOICE_WS_URL || "ws://localhost:3100/ws";

/* small fetch helper with a hard timeout so the UI never hangs
   on a cold backend — callers fall back to local behaviour */
export async function apiFetch(path, options = {}, timeoutMs = 2500) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
