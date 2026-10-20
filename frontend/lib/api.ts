import type { EditState, KitRecord, User } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
let csrfToken = "";

export class ApiError extends Error {
  constructor(message: string, public code = "API_ERROR", public status = 500, public details?: unknown) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (["POST", "PATCH", "DELETE", "PUT"].includes(method) && csrfToken) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(`${API_URL}${path}`, { ...init, method, headers, credentials: "include", cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string; details?: unknown } } & Record<string, unknown>;
  if (!response.ok) throw new ApiError(payload.error?.message ?? "Request failed. Please try again.", payload.error?.code, response.status, payload.error?.details);
  if (typeof payload.csrfToken === "string") csrfToken = payload.csrfToken;
  return payload as T;
}

export const api = {
  async getCsrf() { return request<{ csrfToken: string }>("/auth/csrf"); },
  async register(email: string, password: string) {
    await this.getCsrf();
    return request<{ user: User; csrfToken: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  async login(email: string, password: string) {
    await this.getCsrf();
    return request<{ user: User; csrfToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  async me() { return request<{ user: User; csrfToken: string }>("/auth/me"); },
  async logout() { return request<void>("/auth/logout", { method: "POST" }); },
  async listKits() { return request<{ kits: KitRecord[] }>("/kits"); },
  async getKit(id: string) { return request<{ kit: KitRecord }>(`/kits/${encodeURIComponent(id)}`); },
  async createKit(input: { jd: string; company_url: string; days: number }) {
    return request<{ kit: KitRecord }>("/kits", { method: "POST", body: JSON.stringify(input) });
  },
  async createBatch(cases: unknown[]) { return request<{ results: Array<{ id: string; status: string; kit_id: string | null; error: { code: string; message: string } | null }> }>("/kits/batch", { method: "POST", body: JSON.stringify({ cases }) }); },
  async saveKit(id: string, kit: unknown, editState: EditState) {
    return request<{ kit: KitRecord }>(`/kits/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ kit, editState }) });
  },
  async regenerate(id: string, target: string, force = false) {
    return request<{ kit: KitRecord }>(`/kits/${encodeURIComponent(id)}/regenerate`, { method: "POST", body: JSON.stringify({ target, force }) });
  },
  async retry(id: string) { return request<{ kit: KitRecord }>(`/kits/${encodeURIComponent(id)}/retry`, { method: "POST", body: "{}" }); },
  async deleteKit(id: string) { return request<void>(`/kits/${encodeURIComponent(id)}`, { method: "DELETE" }); },
  async recordPractice(id: string, flashcard_id: string, confidence: number) {
    return request<{ practice: EditState["practice"] }>(`/kits/${encodeURIComponent(id)}/practice`, { method: "POST", body: JSON.stringify({ flashcard_id, confidence }) });
  },
};
