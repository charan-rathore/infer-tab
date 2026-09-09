/** Outline the inclusive causal staircase with linear vertices and one SVG element, including each diagonal cell. */
export function causalAreaPath(rows: number): string {
  return `M12 12 ${Array.from({ length: rows }, (_, row) => `H${13 + row} V${13 + row}`).join(" ")} H12 Z`;
}
