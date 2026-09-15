export type AppMode = "full" | "showcase";

export const appMode: AppMode = import.meta.env.VITE_APP_MODE === "full" ? "full" : "showcase";
export const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const ACCESS_KEY = "decypher.accessToken";
const REFRESH_KEY = "decypher.refreshToken";

export interface ApiEvidence {
  id: string;
  case_id: string;
  name: string;
  description: string;
  type: string;
  mime_type: string;
  size: number;
  sha256: string;
  status: string;
  verification_token: string;
  created_at: string;
  registered_at: string | null;
  custody?: Array<Record<string, string>>;
  analysis?: Array<Record<string, unknown>>;
  blockchain?: Record<string, unknown> | null;
}

export function authToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem("decypher.user");
}

export function currentSession() {
  const raw = localStorage.getItem("decypher.user");
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function authorizedFetch(url: string, init: RequestInit = {}, authenticated = true) {
  const headers = new Headers(init.headers);
  if (authenticated && authToken()) headers.set("Authorization", `Bearer ${authToken()}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let response = await fetch(url, { ...init, headers });
  if (response.status === 401 && authenticated && localStorage.getItem(REFRESH_KEY)) {
    try {
      await refreshSession(); headers.set("Authorization",`Bearer ${authToken()}`);
      response = await fetch(url,{...init,headers});
    } catch { clearSession(); window.dispatchEvent(new Event("decypher:session")); }
  }
  if (!response.ok) {
    if(response.status===401&&authenticated){clearSession();window.dispatchEvent(new Event("decypher:session"));}
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail?.message || body.detail || body.message || message;
    } catch { /* keep fallback */ }
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return response;
}
async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  if (appMode !== "full") throw new Error("This secure operation requires the local full-stack demo.");
  return (await authorizedFetch(`${apiBase}${path}`,init,authenticated)).json() as Promise<T>;
}

let refreshFlight: Promise<void> | null = null;
export async function refreshSession() {
  if (!refreshFlight) refreshFlight = (async () => {
    const response = await fetch(`${apiBase}/auth/refresh`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:localStorage.getItem(REFRESH_KEY)})});
    if (!response.ok) throw new Error("Session expired. Sign in again.");
    const session=await response.json();localStorage.setItem(ACCESS_KEY,session.access_token);localStorage.setItem(REFRESH_KEY,session.refresh_token);localStorage.setItem("decypher.user",JSON.stringify(session.user));
  })().finally(()=>{refreshFlight=null;});
  return refreshFlight;
}

export async function logout() {
  try { if(appMode==="full" && authToken()) await request("/auth/logout",{method:"POST",body:JSON.stringify({refresh_token:localStorage.getItem(REFRESH_KEY)})}); }
  finally {clearSession();window.dispatchEvent(new Event("decypher:session"));}
}

export async function login(email: string, password: string) {
  const session = await request<{ access_token: string; refresh_token: string; user: Record<string, string> }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false);
  localStorage.setItem(ACCESS_KEY, session.access_token);
  localStorage.setItem(REFRESH_KEY, session.refresh_token);
  localStorage.setItem("decypher.user", JSON.stringify(session.user));
  return session.user;
}

export const api = {
  me: () => request<any>("/auth/me"),
  snapshot: (caseId:string) => request<any>(`/cases/${caseId}/snapshot`),
  reportPreview: (caseId:string,locale:string) => request<{html:string}>(`/cases/${caseId}/report-preview?locale=${locale}`),
  listReports: (caseId:string) => request<any[]>(`/cases/${caseId}/reports`),
  custody: (id:string,body:Record<string,string>) => request<any>(`/evidence/${id}/custody`,{method:"POST",body:JSON.stringify(body)}),
  resetDemo: () => request<any>("/admin/reset-demo", { method:"POST" }),
  listCases: () => request<any[]>("/cases"),
  createCase: (body: { title:string; description:string; priority:string; lead_investigator?:string }) => request<any>("/cases", { method:"POST", body:JSON.stringify(body) }),
  getCase: (id: string) => request<any>(`/cases/${id}`),
  listEvidence: (caseId = "CASE-2026-017") => request<ApiEvidence[]>(`/evidence?case_id=${encodeURIComponent(caseId)}`),
  getEvidence: (id: string) => request<ApiEvidence>(`/evidence/${id}`),
  uploadEvidence: (caseId: string, file: File, description = "") => {
    const body = new FormData(); body.append("case_id", caseId); body.append("description", description); body.append("file", file);
    return request<ApiEvidence>("/evidence", { method: "POST", body });
  },
  registerEvidence: (id: string) => request<any>(`/evidence/${id}/register`, { method: "POST" }),
  analyzeEvidence: (id: string) => request<any>(`/evidence/${id}/analyze`, { method: "POST" }),
  verifyEvidence: (id: string, file?: File) => { const body = new FormData(); if (file) body.append("file", file); return request<any>(`/evidence/${id}/verify`, { method: "POST", body }); },
  graph: (caseId: string) => request<any>(`/cases/${caseId}/graph`),
  timeline: (caseId: string) => request<any[]>(`/cases/${caseId}/timeline`),
  map: (caseId: string) => request<any[]>(`/cases/${caseId}/map`),
  network: (caseId: string) => request<any>(`/cases/${caseId}/network`),
  copilot: (caseId: string, question: string, locale: string) => request<any>("/copilot/query", { method: "POST", body: JSON.stringify({ case_id: caseId, question, locale }) }),
  generateReport: (caseId: string, locale: string) => request<any>(`/cases/${caseId}/reports`, { method: "POST", body: JSON.stringify({ locale }) }),
  job: (id: string, signal?:AbortSignal) => request<any>(`/jobs/${id}`,{signal}),
  submitScan: (caseId:string,requestKey:string,pages:Array<{evidence_id:string;transform:unknown}>) => request<any>("/scans",{method:"POST",body:JSON.stringify({case_id:caseId,request_key:requestKey,pages})}),
  queueOCR: (id:string) => request<any>(`/evidence/${id}/ocr`,{method:"POST"}),
  scanCorners: (id:string) => request<any>(`/evidence/${id}/scan-corners`),
  getOCR: (id:string) => request<any>(`/evidence/${id}/ocr`),
  correctOCR: (pageId:string,revision:number,text:string,reason:string) => request<any>(`/ocr/pages/${pageId}/corrections`,{method:"POST",body:JSON.stringify({expected_revision:revision,text,reason})}),
  publicVerify: async (token: string) => {
    const response = await fetch(`${apiBase}/verify/${encodeURIComponent(token)}`); if (!response.ok) throw new Error("Evidence identity was not found."); return response.json();
  },
  downloadUrl: (path: string) => `${apiBase.replace(/\/api\/v1$/, "")}${path}`,
  fileUrl: (id: string) => `${apiBase}/evidence/${id}/file`,
  qrUrl: (id: string) => `${apiBase}/evidence/${id}/qr`,
};

export async function waitForJob(id: string, onProgress?: (status: string) => void, signal?:AbortSignal) {
  const deadline = Date.now() + 660_000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const job = await api.job(id,signal); onProgress?.(job.status);
    if (job.status === "succeeded") return job.result;
    if (job.status === "failed") throw new Error(job.error || "Processing failed.");
    await new Promise<void>((resolve,reject) => {
      const abort=()=>{clearTimeout(timer);reject(signal?.reason||new DOMException("Polling stopped","AbortError"));};
      const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},1000);
      signal?.addEventListener("abort",abort,{once:true});
      if(signal?.aborted)abort();
    });
  }
  throw new Error(`Job ${id} is still pending. Check that the processing worker is running.`);
}

export async function browserSha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
