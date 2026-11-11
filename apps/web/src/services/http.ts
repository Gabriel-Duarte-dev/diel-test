const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1").replace(/\/$/, "");

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const payload = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message?: unknown }).message)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}
