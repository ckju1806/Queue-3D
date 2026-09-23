import type { TableConfig } from '../config/gameConfig';
import type { Vec2 } from './vec2';

/**
 * Kollisionsgeometrie des Tisches in der 2D-Tischebene.
 *
 * Koordinatensystem: Ursprung in der Tischmitte, x entlang der Längsachse,
 * y entlang der Querachse. Die Bandennasen liegen bei |x| = halfLength bzw.
 * |y| = halfWidth. Zwischen den Backenspitzen der Taschen gibt es KEINE
 * Bande – die Taschenöffnungen sind in der Kollisionsgeometrie offen.
 */

export type SegmentKind = 'rail' | 'jaw';

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Einheitsnormale, zeigt von der Bandenfläche in den freien Raum. */
  nx: number;
  ny: number;
  kind: SegmentKind;
}

export type PocketKind = 'corner' | 'side';

export interface Pocket {
  index: number;
  kind: PocketKind;
  /** Fangzentrum (Physik). */
  x: number;
  y: number;
  captureRadius: number;
  /** Mitte der Taschenöffnung zwischen den Backenspitzen. */
  mouth: Vec2;
  /** Einheitsvektor in die Tasche hinein (weg vom Tisch). */
  axis: Vec2;
  /** Sichtbares Loch im Tuch (Darstellung). */
  hole: { x: number; y: number; radius: number };
  /** Aussparung im Holzrahmen (Darstellung). */
  railCut: { x: number; y: number; radius: number };
  /** Backenspitzen dieser Tasche. */
  tips: [Vec2, Vec2];
}

/** Polygon eines Bandengummis in der Draufsicht (für die Darstellung). */
export interface CushionShape {
  points: Vec2[];
}

export interface TableGeometry {
  halfLength: number;
  halfWidth: number;
  cushionWidth: number;
  segments: Segment[];
  /** Runde Ecken (Backenspitzen und Backenenden). */
  vertices: Vec2[];
  pockets: Pocket[];
  cushions: CushionShape[];
  /** x-Koordinate der Kopflinie (Grenze des Anstoßraums). */
  headStringX: number;
  headSpot: Vec2;
  footSpot: Vec2;
  offTableMargin: number;
}

const DEG = Math.PI / 180;

interface RailSpec {
  /** Anfangs- und Endspitze auf der Nasenlinie. */
  a: Vec2;
  b: Vec2;
  /** Normale der Nasenlinie in den Tisch hinein. */
  inward: Vec2;
  /** Jaw-Innenwinkel an Spitze a bzw. b. */
  angleA: number;
  angleB: number;
}

export function createTableGeometry(cfg: TableConfig): TableGeometry {
  const hl = cfg.length / 2;
  const hw = cfg.width / 2;
  const cw = cfg.cushionWidth;
  const dc = cfg.cornerMouth / Math.SQRT2; // Abstand Spitze ↔ Spielflächeneck entlang der Bande
  const sh = cfg.sideMouth / 2;
  const cornerA = cfg.cornerJawAngleDeg * DEG;
  const sideA = cfg.sideJawAngleDeg * DEG;

  const rails: RailSpec[] = [];
  for (const sy of [-1, 1]) {
    const inward = { x: 0, y: -sy };
    // Linke Hälfte der langen Bande: von Ecktasche zu Mitteltasche
    rails.push({ a: { x: -hl + dc, y: sy * hw }, b: { x: -sh, y: sy * hw }, inward, angleA: cornerA, angleB: sideA });
    // Rechte Hälfte: von Mitteltasche zu Ecktasche
    rails.push({ a: { x: sh, y: sy * hw }, b: { x: hl - dc, y: sy * hw }, inward, angleA: sideA, angleB: cornerA });
  }
  for (const sx of [-1, 1]) {
    rails.push({
      a: { x: sx * hl, y: -hw + dc },
      b: { x: sx * hl, y: hw - dc },
      inward: { x: -sx, y: 0 },
      angleA: cornerA,
      angleB: cornerA,
    });
  }

  const segments: Segment[] = [];
  const vertices: Vec2[] = [];
  const cushions: CushionShape[] = [];

  for (const rail of rails) {
    const { a, b, inward } = rail;
    segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, nx: inward.x, ny: inward.y, kind: 'rail' });
    const outward = { x: -inward.x, y: -inward.y };

    const jawAtA = buildJaw(a, b, outward, rail.angleA, cw);
    const jawAtB = buildJaw(b, a, outward, rail.angleB, cw);
    segments.push(jawAtA.segment, jawAtB.segment);
    vertices.push(a, b, jawAtA.end, jawAtB.end);
    cushions.push({ points: [a, b, jawAtB.end, jawAtA.end] });
  }

  const pockets: Pocket[] = [];
  // Reihenfolge: 0 Ecke (−,−), 1 Mitte (0,−), 2 Ecke (+,−), 3 Ecke (+,+), 4 Mitte (0,+), 5 Ecke (−,+)
  const order: Array<{ kind: PocketKind; sx: number; sy: number }> = [
    { kind: 'corner', sx: -1, sy: -1 },
    { kind: 'side', sx: 0, sy: -1 },
    { kind: 'corner', sx: 1, sy: -1 },
    { kind: 'corner', sx: 1, sy: 1 },
    { kind: 'side', sx: 0, sy: 1 },
    { kind: 'corner', sx: -1, sy: 1 },
  ];

  order.forEach((spec, index) => {
    if (spec.kind === 'corner') {
      const { sx, sy } = spec;
      const axis = { x: sx / Math.SQRT2, y: sy / Math.SQRT2 };
      const cx = sx * hl;
      const cy = sy * hw;
      const tipLong = { x: sx * (hl - dc), y: sy * hw };
      const tipShort = { x: sx * hl, y: sy * (hw - dc) };
      pockets.push({
        index,
        kind: 'corner',
        x: cx + axis.x * cfg.cornerCaptureOffset,
        y: cy + axis.y * cfg.cornerCaptureOffset,
        captureRadius: cfg.cornerCaptureRadius,
        mouth: { x: (tipLong.x + tipShort.x) / 2, y: (tipLong.y + tipShort.y) / 2 },
        axis,
        hole: { x: cx, y: cy, radius: cfg.cornerHoleRadius },
        railCut: { x: cx, y: cy, radius: cfg.cornerRailCutRadius },
        tips: [tipLong, tipShort],
      });
    } else {
      const { sy } = spec;
      pockets.push({
        index,
        kind: 'side',
        x: 0,
        y: sy * (hw + cfg.sideCaptureOffset),
        captureRadius: cfg.sideCaptureRadius,
        mouth: { x: 0, y: sy * hw },
        axis: { x: 0, y: sy },
        hole: { x: 0, y: sy * (hw + cfg.sideHoleOffset), radius: cfg.sideHoleRadius },
        railCut: { x: 0, y: sy * (hw + cfg.sideHoleOffset), radius: cfg.sideRailCutRadius },
        tips: [
          { x: -sh, y: sy * hw },
          { x: sh, y: sy * hw },
        ],
      });
    }
  });

  return {
    halfLength: hl,
    halfWidth: hw,
    cushionWidth: cw,
    segments,
    vertices,
    pockets,
    cushions,
    headStringX: -hl / 2,
    headSpot: { x: -hl / 2, y: 0 },
    footSpot: { x: hl / 2, y: 0 },
    offTableMargin: cfg.offTableMargin,
  };
}

/**
 * Baut die Backenfläche an einer Spitze.
 * @param tip Backenspitze
 * @param other andere Spitze derselben Bande (zeigt in die Bande hinein)
 * @param outward Normale der Nasenlinie vom Tisch weg (in das Gummi hinein)
 * @param interiorAngle Innenwinkel des Gummis zwischen Nasenlinie und Backenfläche
 */
function buildJaw(tip: Vec2, other: Vec2, outward: Vec2, interiorAngle: number, cushionWidth: number) {
  // Richtung entlang der Nase zurück in die Bande
  const bx = other.x - tip.x;
  const by = other.y - tip.y;
  const bl = Math.hypot(bx, by);
  const back = { x: bx / bl, y: by / bl };
  // Backenrichtung: von "back" um den Innenwinkel zur Außenseite gedreht
  const jx = Math.cos(interiorAngle) * back.x + Math.sin(interiorAngle) * outward.x;
  const jy = Math.cos(interiorAngle) * back.y + Math.sin(interiorAngle) * outward.y;
  const len = cushionWidth / Math.sin(interiorAngle);
  const end = { x: tip.x + jx * len, y: tip.y + jy * len };
  // Normale zur freien Seite (weg vom Gummi, also entgegen "back")
  let nx = -jy;
  let ny = jx;
  if (nx * back.x + ny * back.y > 0) {
    nx = -nx;
    ny = -ny;
  }
  const segment: Segment = { ax: tip.x, ay: tip.y, bx: end.x, by: end.y, nx, ny, kind: 'jaw' };
  return { segment, end };
}

/** Liegt ein Punkt im Anstoßraum (hinter der Kopflinie)? */
export function isInKitchen(geometry: TableGeometry, p: Vec2): boolean {
  return p.x <= geometry.headStringX;
}
