import { API_BASE_URL } from "@/config";
import { getAuthToken } from "./storage";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const message = (isJson && (body as any)?.message) || res.statusText || "Request failed";
    throw new Error(message);
  }

  return body as T;
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
};

export type LoginResponse = { token: string; user?: AuthUser };

export const api = {
  login: (data: { email: string; password: string }) =>
    request<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),
  signup: (data: { name: string; email: string; password: string }) =>
    request<LoginResponse>("/api/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  forgotPassword: (data: { email: string }) =>
    request<{ success: boolean; message?: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }),
  me: () => request<AuthUser>("/api/auth/me", { method: "GET" }),
};

export { request };
