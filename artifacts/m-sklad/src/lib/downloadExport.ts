import { customFetch } from "@workspace/api-client-react";

/**
 * Downloads a file from an authenticated API endpoint (e.g. an Excel export).
 * A plain `window.open`/`<a href>` navigation carries no Authorization header —
 * this app authenticates purely via Bearer token, not cookies — so the API
 * would 401. customFetch attaches the token, we turn the blob into a download.
 */
export async function downloadExport(url: string, filename: string): Promise<void> {
  const blob = await customFetch<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
