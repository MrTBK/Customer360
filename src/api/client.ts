const BASE_URL = '/api';
const API_KEY = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_KEY || '';

export function getToken(): string {
  try {
    return localStorage.getItem('c360_token') || '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem('c360_token', token);
    else localStorage.removeItem('c360_token');
  } catch {
    /* storage unavailable */
  }
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      ...authHeaders(),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}
