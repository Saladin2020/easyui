import type { Diagnostic, UiDoc } from "../../src/shared/types";

export interface DocListItem {
  id: string;
  name: string;
  style: string;
  screens: string[];
  errors: number;
}

export interface WorkspaceSummary {
  root: string;
  config: { name: string; doc: string; scale: number };
  docs: DocListItem[];
  backgrounds: string[];
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

export const fetchWorkspace = () => fetch("/api/workspace").then((r) => json<WorkspaceSummary>(r));
export const fetchDoc = (id: string) => fetch(`/api/docs/${id}`).then((r) => json<{ doc: UiDoc; errors: Diagnostic[]; warnings: Diagnostic[] }>(r));
export const saveDoc = (id: string, doc: UiDoc) =>
  fetch(`/api/docs/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc }) }).then((r) => json<{ ok: boolean; errors: Diagnostic[]; warnings: Diagnostic[] }>(r));
export const exportDoc = (id: string, preset: string) =>
  fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, preset }) }).then((r) => json<{ dirs: string[]; files: number; warnings: string[] }>(r));
export const fileUrl = (src: string) => `/api/files/${src.split("/").map(encodeURIComponent).join("/")}`;
