const API_BASE_URL = "http://localhost:3000/api/v1";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
