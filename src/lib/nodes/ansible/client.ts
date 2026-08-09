import { apiFetch } from "@/lib/auth/client";
import type { AnsibleGalleryEntry, AnsibleModuleSchema } from "./types";

export type AnsibleGalleryHit = AnsibleGalleryEntry & { hasFormSchema?: boolean };

export async function fetchAnsibleModules(opts?: {
  q?: string;
  limit?: number;
  collection?: string;
}): Promise<{ count: number; total: number; items: AnsibleGalleryHit[] }> {
  const sp = new URLSearchParams();
  if (opts?.q) sp.set("q", opts.q);
  if (opts?.limit != null) sp.set("limit", String(opts.limit));
  if (opts?.collection) sp.set("collection", opts.collection);
  const res = await apiFetch(`/api/v1/ansible/modules?${sp}`);
  if (!res.ok) throw new Error(`ansible modules ${res.status}`);
  return res.json() as Promise<{ count: number; total: number; items: AnsibleGalleryHit[] }>;
}

export async function fetchAnsibleModuleSchema(
  fqcn: string,
): Promise<(AnsibleModuleSchema & { hasFormSchema?: boolean }) | null> {
  const res = await apiFetch(`/api/v1/ansible/modules/${encodeURIComponent(fqcn)}/schema`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ansible schema ${res.status}`);
  return res.json() as Promise<AnsibleModuleSchema & { hasFormSchema?: boolean }>;
}
