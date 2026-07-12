"use client";

/**
 * Previously rendered brutalist crop-mark brackets at the four corners.
 * In the minimal charcoal redesign these are intentionally removed —
 * kept as a no-op so existing call sites don't need to change.
 */
export function CornerMarks(_props: {
  size?: number;
  inset?: number;
  color?: string;
  thickness?: number;
  opacity?: number;
}) {
  return null;
}
