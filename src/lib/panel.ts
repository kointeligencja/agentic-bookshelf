/** Width in CSS pixels of the left panel (video and themes) for a viewport this wide. */
export function panelWidth(viewport: number): number {
  return Math.round(Math.min(viewport * 0.45, Math.max(360, Math.min(500, viewport * 0.36))));
}

/** Width in CSS pixels of the book panel: just over half the space right of the left panel. */
export function cardWidth(viewport: number): number {
  return Math.round((viewport - panelWidth(viewport)) * 0.55);
}
