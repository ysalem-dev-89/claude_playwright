/** Fixed size for both the browser viewport and the live canvas in the UI, so frames line up 1:1. */
export const LIVE_VIEW_VIEWPORT = { width: 960, height: 720 };

interface Screenshottable {
  screenshot(options: { type: "jpeg"; quality: number }): Promise<Buffer>;
}

export async function captureFrameDataUrl(page: Screenshottable): Promise<string> {
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
