import { zipSync, strToU8 } from "fflate";
import { buildIssueBody, type IssueDiagnostics } from "./github-issue";

/** Capture the workflow canvas (or full viewport) as a PNG blob. */
export async function captureScreenshot(selector = ".react-flow"): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try {
    const { default: html2canvas } = await import("html2canvas");
    const el =
      (document.querySelector(selector) as HTMLElement | null) ??
      (document.querySelector("[data-testid='rf__wrapper']") as HTMLElement | null) ??
      document.body;
    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      scale: Math.min(2, window.devicePixelRatio || 1),
    });
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return null;
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/** Build a zip of diagnostics.json + optional screenshot.png and trigger download. */
export async function downloadDebugBundle(
  diagnostics: IssueDiagnostics,
  screenshot?: Blob | null,
): Promise<string> {
  const files: Record<string, Uint8Array> = {
    "diagnostics.json": strToU8(
      JSON.stringify(
        {
          ...diagnostics,
          issueBody: buildIssueBody(diagnostics),
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    ),
    "ISSUE_BODY.md": strToU8(buildIssueBody(diagnostics)),
  };

  if (screenshot && screenshot.size > 0) {
    files["screenshot.png"] = await blobToUint8(screenshot);
  }

  const zipped = zipSync(files, { level: 6 });
  const name = `openflow-debug-${stamp()}.zip`;
  const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return name;
}

/** Capture screenshot, download bundle, return suggested issue URL opener helper data. */
export async function prepareIssueReport(diagnostics: IssueDiagnostics): Promise<{
  bundleName: string;
  body: string;
}> {
  const shot = await captureScreenshot();
  const bundleName = await downloadDebugBundle(diagnostics, shot);
  return { bundleName, body: buildIssueBody(diagnostics) };
}
