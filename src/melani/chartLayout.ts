export type SvgTextAnchor = "start" | "middle" | "end";

export type HoverLabelPlacement = {
  x: number;
  textAnchor: SvgTextAnchor;
};

/**
 * Keep a chart's hover label inside its plot at both edge points.
 * Centered labels work in the middle, but the first and last points need
 * inward-facing anchors so their text never escapes the SVG.
 */
export function hoverLabelPlacement(
  pointX: number,
  plotLeft: number,
  plotRight: number,
  inset = 8
): HoverLabelPlacement {
  const width = Math.max(0, plotRight - plotLeft);
  const edgeZone = width * 0.25;

  if (pointX <= plotLeft + edgeZone) {
    return { x: plotLeft + inset, textAnchor: "start" };
  }
  if (pointX >= plotRight - edgeZone) {
    return { x: plotRight - inset, textAnchor: "end" };
  }
  return {
    x: Math.min(Math.max(pointX, plotLeft + inset), plotRight - inset),
    textAnchor: "middle",
  };
}

/** One-line SVG labels cannot ellipsize through CSS, so cap pathological input. */
export function fitChartHoverLabel(
  label: string,
  plotWidth: number,
  averageCharacterWidth = 6.2
): string {
  const maxCharacters = Math.max(
    20,
    Math.floor((Math.max(0, plotWidth) - 20) / averageCharacterWidth)
  );
  if (label.length <= maxCharacters) return label;
  return `${label.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}
