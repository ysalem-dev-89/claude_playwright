import { FrameEmitter } from "./logger";

/** Fixed size for both the browser viewport and the live canvas in the UI, so frames line up 1:1. */
export const LIVE_VIEW_VIEWPORT = { width: 960, height: 720 };

interface Screenshottable {
  screenshot(options: { type: "jpeg"; quality: number }): Promise<Buffer>;
}

export async function captureFrame(page: Screenshottable, frame: FrameEmitter): Promise<void> {
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  frame(buffer);
}
