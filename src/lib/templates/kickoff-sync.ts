import { apiFetch } from "@/lib/auth/client";

/** Default marketplace pack synced from first-run setup when the checkbox is on. */
export const SETUP_TEMPLATE_SOURCE_ID = "n8n-community";

/**
 * Start the community template sync without blocking the caller.
 * Owner setup must navigate after register even if git clone is slow.
 */
export function kickoffCommunityTemplateSync(
  fetchFn: typeof apiFetch = apiFetch,
): void {
  void fetchFn("/api/v1/template-sources/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: SETUP_TEMPLATE_SOURCE_ID }),
  }).catch(() => {
    /* non-fatal — /templates can retry */
  });
}
