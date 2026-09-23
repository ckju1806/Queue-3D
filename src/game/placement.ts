import type { PhysicsWorld } from '../physics/physicsWorld';
import type { Vec2 } from '../physics/vec2';

export type PlacementProblem = 'outside' | 'kitchen' | 'pocket' | 'overlap';

export interface PlacementResult {
  valid: boolean;
  problem: PlacementProblem | null;
}

export interface PlacementOptions {
  /** Nur im Anstoßraum (hinter der Kopflinie) erlaubt. */
  kitchenOnly: boolean;
  /** Diese Kugel bei der Überlappungsprüfung ignorieren (meist die Weiße selbst). */
  ignoreId?: number;
}

const EDGE_MARGIN = 0.0005;
const BALL_MARGIN = 0.0008;

/** Prüft, ob eine Kugel an dieser Position gültig platziert werden kann. */
export function validatePlacement(world: PhysicsWorld, p: Vec2, opts: PlacementOptions): PlacementResult {
  const g = world.geometry;
  const R = world.ballRadius;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { valid: false, problem: 'outside' };
  if (Math.abs(p.x) > g.halfLength - R - EDGE_MARGIN || Math.abs(p.y) > g.halfWidth - R - EDGE_MARGIN) {
    return { valid: false, problem: 'outside' };
  }
  if (opts.kitchenOnly && p.x > g.headStringX) return { valid: false, problem: 'kitchen' };
  for (const pk of g.pockets) {
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < pk.captureRadius + R) return { valid: false, problem: 'pocket' };
  }
  for (const b of world.balls) {
    if (!b.onTable || b.id === opts.ignoreId) continue;
    if (Math.hypot(b.x - p.x, b.y - p.y) < 2 * R + BALL_MARGIN) return { valid: false, problem: 'overlap' };
  }
  return { valid: true, problem: null };
}

/** Begrenzt eine (Maus-)Position auf die erlaubte Fläche – für eine ruhige Vorschau. */
export function clampToPlacementArea(world: PhysicsWorld, p: Vec2, kitchenOnly: boolean): Vec2 {
  const g = world.geometry;
  const R = world.ballRadius;
  const mx = g.halfLength - R - EDGE_MARGIN * 2;
  const my = g.halfWidth - R - EDGE_MARGIN * 2;
  const maxX = kitchenOnly ? Math.min(mx, g.headStringX) : mx;
  return {
    x: Math.min(maxX, Math.max(-mx, p.x)),
    y: Math.min(my, Math.max(-my, p.y)),
  };
}

/**
 * Sucht eine freie, gültige Position möglichst nahe an `preferred`
 * (z. B. zum Wiedereinsetzen der 8 oder als Startposition der Weißen).
 * Zuerst entlang der Längsachse in Richtung `axisDir`, dann spiralförmig.
 */
export function findFreeSpot(world: PhysicsWorld, preferred: Vec2, opts: PlacementOptions, axisDir = 1): Vec2 {
  const R = world.ballRadius;
  const check = (p: Vec2) => validatePlacement(world, p, opts).valid;
  if (check(preferred)) return preferred;
  const step = R * 0.5;
  for (let i = 1; i < 80; i++) {
    const p = { x: preferred.x + axisDir * step * i, y: preferred.y };
    if (check(p)) return p;
  }
  for (let ring = 1; ring < 60; ring++) {
    const r = ring * step;
    const n = 8 + ring * 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = { x: preferred.x + Math.cos(a) * r, y: preferred.y + Math.sin(a) * r };
      if (check(p)) return p;
    }
  }
  return preferred;
}
