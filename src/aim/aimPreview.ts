import { toiApproach, toiBallBall, toiBallPoint, toiBallSegment } from '../physics/collision';
import type { PhysicsWorld } from '../physics/physicsWorld';
import { normalize, type Vec2 } from '../physics/vec2';

/**
 * Zielvorschau über einen "Swept Circle": Eine Kugel mit exakt dem
 * Physik-Radius wird entlang der Zielrichtung geschoben. Verwendet dieselben
 * TOI-Funktionen und dieselbe Tischgeometrie wie die Physiksimulation.
 */

export type CastHit =
  | { type: 'ball'; id: number; distance: number; position: Vec2 }
  | { type: 'cushion'; distance: number; position: Vec2; normal: Vec2 }
  | { type: 'pocket'; pocket: number; distance: number; position: Vec2 }
  | { type: 'none'; distance: number; position: Vec2 };

/** Schiebt eine Kugel (Radius wie Physik) von `start` in Richtung `dir` bis zum ersten Kontakt. */
export function castBall(
  world: PhysicsWorld,
  start: Vec2,
  direction: Vec2,
  maxDistance = 10,
  ignore: readonly number[] = [],
): CastHit {
  const R = world.ballRadius;
  const g = world.geometry;
  const d = normalize(direction);
  let best: CastHit = { type: 'none', distance: maxDistance, position: at(start, d, maxDistance) };
  let bestT = maxDistance;

  for (const b of world.balls) {
    if (!b.onTable || ignore.includes(b.id)) continue;
    const t = toiBallBall(start.x, start.y, d.x, d.y, b.x, b.y, 0, 0, 2 * R);
    if (t < bestT) {
      bestT = t;
      best = { type: 'ball', id: b.id, distance: t, position: at(start, d, t) };
    }
  }
  for (const seg of g.segments) {
    const t = toiBallSegment(start.x, start.y, d.x, d.y, seg, R);
    if (t < bestT) {
      bestT = t;
      best = { type: 'cushion', distance: t, position: at(start, d, t), normal: { x: seg.nx, y: seg.ny } };
    }
  }
  for (const q of g.vertices) {
    const t = toiBallPoint(start.x, start.y, d.x, d.y, q.x, q.y, R);
    if (t < bestT) {
      bestT = t;
      const pos = at(start, d, t);
      best = { type: 'cushion', distance: t, position: pos, normal: normalize({ x: pos.x - q.x, y: pos.y - q.y }) };
    }
  }
  for (const pk of g.pockets) {
    const t = toiApproach(start.x - pk.x, start.y - pk.y, d.x, d.y, pk.captureRadius);
    if (t < bestT) {
      bestT = t;
      best = { type: 'pocket', pocket: pk.index, distance: t, position: at(start, d, t) };
    }
  }
  return best;
}

export interface AimPreview {
  origin: Vec2;
  direction: Vec2;
  hit: CastHit;
  /** Position der Weißen im Kontaktmoment ("Geisterkugel"). */
  ghost: Vec2;
  /** Richtung der getroffenen Objektkugel (nur bei Kugelkontakt). */
  objectDirection: Vec2 | null;
  /** Position der getroffenen Objektkugel. */
  objectPosition: Vec2 | null;
  /** Laufrichtung der Weißen nach dem Kontakt (gleiche Stoßformel wie die Physik; null bei nahezu vollem Treffer). */
  cueDirection: Vec2 | null;
  /** Anteil der Geschwindigkeit, der auf die Objektkugel übergeht (cos des Schnittwinkels). */
  transfer: number;
}

export function computeAimPreview(world: PhysicsWorld, origin: Vec2, direction: Vec2): AimPreview {
  const dir = normalize(direction);
  const hit = castBall(world, origin, dir, 10, [0]);
  const preview: AimPreview = {
    origin,
    direction: dir,
    hit,
    ghost: hit.position,
    objectDirection: null,
    objectPosition: null,
    cueDirection: null,
    transfer: 0,
  };
  if (hit.type === 'ball') {
    const obj = world.balls[hit.id];
    const n = normalize({ x: obj.x - hit.position.x, y: obj.y - hit.position.y });
    const cosCut = dir.x * n.x + dir.y * n.y;
    preview.objectDirection = n;
    preview.objectPosition = { x: obj.x, y: obj.y };
    preview.transfer = Math.max(0, cosCut);
    // Identisch zur Physik: v' = v − (1 + e)/2 · (v·n) · n  (gleiche Massen)
    const k = ((1 + world.config.physics.ballRestitution) / 2) * cosCut;
    const cx = dir.x - k * n.x;
    const cy = dir.y - k * n.y;
    const cl = Math.hypot(cx, cy);
    preview.cueDirection = cl > 0.06 ? { x: cx / cl, y: cy / cl } : null;
  }
  return preview;
}

function at(start: Vec2, d: Vec2, t: number): Vec2 {
  return { x: start.x + d.x * t, y: start.y + d.y * t };
}
