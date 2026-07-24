export function timeToFrame(timeMs: number, fps: number): number {
  return Math.max(0, Math.round((timeMs / 1000) * fps));
}
