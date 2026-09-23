import type { Segment } from './tableGeometry';

/**
 * Time-of-Impact-Funktionen (kontinuierliche Kollisionserkennung).
 *
 * Alle Funktionen gehen von konstanter Geschwindigkeit innerhalb des
 * betrachteten Intervalls aus und liefern die Zeit bis zum Kontakt
 * (>= 0) oder `Infinity`, wenn kein Kontakt bevorsteht.
 * Sie werden sowohl von der Physik (Geschwindigkeit in m/s → Zeit in s)
 * als auch von der Zielvorschau (Einheitsrichtung → Strecke in m) genutzt.
 */

/**
 * Zeit, bis ein bewegter Punkt (relative Position r, relative Geschwindigkeit w)
 * den Abstand `dist` zum Ursprung erreicht. Nur annähernde Bewegungen zählen.
 * Überlappende, annähernde Konstellationen liefern 0.
 */
export function toiApproach(rx: number, ry: number, wx: number, wy: number, dist: number): number {
  const b = rx * wx + ry * wy; // halbes b der quadratischen Gleichung
  if (b >= 0) return Infinity; // entfernt sich oder bewegt sich tangential
  const a = wx * wx + wy * wy;
  if (a < 1e-18) return Infinity;
  const c = rx * rx + ry * ry - dist * dist;
  if (c <= 0) return 0;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  return t < 0 ? 0 : t;
}

/** Kugel–Kugel: Zeit bis die Mittelpunkte den Abstand `2R` erreichen. */
export function toiBallBall(
  ax: number,
  ay: number,
  avx: number,
  avy: number,
  bx: number,
  by: number,
  bvx: number,
  bvy: number,
  contactDistance: number,
): number {
  return toiApproach(bx - ax, by - ay, bvx - avx, bvy - avy, contactDistance);
}

/**
 * Kugel–Bandensegment: Zeit bis der Mittelpunkt den Abstand `radius` zur
 * Segmentfläche erreicht (einseitig, nur von der freien Seite aus).
 * Kontakte außerhalb der Segmentenden werden über die Eckpunkte behandelt.
 */
export function toiBallSegment(px: number, py: number, vx: number, vy: number, seg: Segment, radius: number): number {
  const vn = vx * seg.nx + vy * seg.ny;
  if (vn >= 0) return Infinity;
  const d0 = (px - seg.ax) * seg.nx + (py - seg.ay) * seg.ny;
  if (d0 < 0) return Infinity; // Mittelpunkt hinter der Fläche: ungültig, ignorieren
  let t = (d0 - radius) / -vn;
  if (t < 0) t = 0;
  const cx = px + vx * t - seg.ax;
  const cy = py + vy * t - seg.ay;
  const ex = seg.bx - seg.ax;
  const ey = seg.by - seg.ay;
  const s = (cx * ex + cy * ey) / (ex * ex + ey * ey);
  if (s < 0 || s > 1) return Infinity;
  return t;
}

/** Kugel–fester Punkt (runde Backenspitze): Zeit bis Abstand `radius`. */
export function toiBallPoint(px: number, py: number, vx: number, vy: number, qx: number, qy: number, radius: number): number {
  return toiApproach(px - qx, py - qy, vx, vy, radius);
}
