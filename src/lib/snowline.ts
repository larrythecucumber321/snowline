// Derive a current snow line from satellite-observed points: the elevation
// below which trails have reliably melted out. Used to classify segments that
// the imagery could not see (cloud cover) by elevation alone.
export function deriveSnowLine(
  observed: { elev: number; snow: boolean }[],
  fallback: number,
): number {
  const snowElevs = observed
    .filter((o) => o.snow)
    .map((o) => o.elev)
    .sort((a, b) => a - b);

  if (snowElevs.length < 5) return fallback;

  const pct = (arr: number[], p: number) =>
    arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

  // 15th percentile of snowy elevations: a few low outliers (shaded gullies,
  // misclassified water) should not drag the line down.
  const line = pct(snowElevs, 0.15);
  return Math.round(Math.max(300, Math.min(2500, line)));
}
