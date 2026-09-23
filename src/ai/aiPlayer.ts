import { castBall } from '../aim/aimPreview';
import type { GameConfig } from '../config/gameConfig';
import { CUE_BALL } from '../game/balls';
import { findFreeSpot, validatePlacement } from '../game/placement';
import { type Rng } from '../game/random';
import { evaluateShot, legalTargets, type RulesState, type ShotOutcome } from '../game/rules';
import { computeCueVelocity, powerForSpeed } from '../game/shot';
import { ShotRecorder } from '../game/shotRecorder';
import type { Difficulty } from '../game/types';
import { speedNeededFor } from '../physics/friction';
import type { PhysicsWorld } from '../physics/physicsWorld';
import { normalize, rotate, type Vec2 } from '../physics/vec2';
import type { AiInput, AiShotPlan } from './types';

/**
 * Computergegner.
 *
 * Plant ausschließlich auf erlaubte Zielkugeln, prüft direkte Lochmöglichkeiten
 * (Weg der Weißen und Weg der Zielkugel über denselben Swept-Circle-Cast wie
 * die Zielvorschau), berechnet die Stärke aus dem Reibungsmodell und addiert
 * einen begrenzten Zielfehler. Der Stoß selbst wird von der GameSession mit
 * derselben Stoßfunktion wie beim Menschen ausgeführt.
 */

interface DifficultyProfile {
  /** Maximaler Winkelfehler in Grad (gleichverteilt, begrenzt). */
  angleErrorDeg: number;
  /** Relativer Stärkefehler (gleichverteilt, begrenzt). */
  powerError: number;
  /** Maximaler Schnittwinkel für Lochversuche. */
  maxCutDeg: number;
  /** Zufallsauswahl unter den besten N Kandidaten. */
  pickAmongTop: number;
  /** Anzahl Kandidaten, die per Vorausberechnung geprüft werden (0 = keine). */
  simulateTop: number;
  /** Zusätzliche Zielpunkte in der Taschenöffnung prüfen. */
  extraAimPoints: boolean;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { angleErrorDeg: 1.8, powerError: 0.14, maxCutDeg: 70, pickAmongTop: 3, simulateTop: 0, extraAimPoints: false },
  medium: { angleErrorDeg: 0.6, powerError: 0.06, maxCutDeg: 80, pickAmongTop: 1, simulateTop: 6, extraAimPoints: true },
};

export interface PotCandidate {
  target: number;
  pocket: number;
  cue: Vec2;
  direction: Vec2;
  power: number;
  cutDeg: number;
  score: number;
}

const DEG = Math.PI / 180;

export function planAiShot(input: AiInput): AiShotPlan {
  const profile = DIFFICULTY_PROFILES[input.difficulty];
  let plan: AiShotPlan;
  if (input.rules.isBreak) {
    plan = planBreak(input);
  } else if (input.ballInHand) {
    plan = planBallInHand(input, profile);
  } else {
    const cue = input.world.balls[CUE_BALL];
    plan = planFromPosition(input, profile, { x: cue.x, y: cue.y }, null);
  }
  return applyError(plan, profile, input.rng);
}

// -----------------------------------------------------------------------------
// Anstoß

function planBreak(input: AiInput): AiShotPlan {
  const { world, rng, kitchenOnly, difficulty } = input;
  const g = world.geometry;
  const wanted = { x: g.headStringX - 0.05, y: (rng() * 2 - 1) * 0.08 };
  const placement = input.ballInHand
    ? findFreeSpot(world, wanted, { kitchenOnly, ignoreId: CUE_BALL }, -1)
    : { x: world.balls[CUE_BALL].x, y: world.balls[CUE_BALL].y };
  // Spitzenkugel = Kugel am nächsten zum Fußpunkt
  let apex: Vec2 = g.footSpot;
  let best = Infinity;
  for (const b of world.balls) {
    if (!b.onTable || b.id === CUE_BALL) continue;
    const d = Math.hypot(b.x - g.footSpot.x, b.y - g.footSpot.y);
    if (d < best) {
      best = d;
      apex = { x: b.x, y: b.y };
    }
  }
  return {
    placement: input.ballInHand ? placement : null,
    direction: normalize({ x: apex.x - placement.x, y: apex.y - placement.y }),
    power: difficulty === 'easy' ? 0.85 : 0.96,
    kind: 'break',
    targetBall: null,
    pocket: null,
  };
}

// -----------------------------------------------------------------------------
// Ball in Hand

function planBallInHand(input: AiInput, profile: DifficultyProfile): AiShotPlan {
  const { world, rules, kitchenOnly, config } = input;
  const R = world.ballRadius;
  const targets = legalTargets(rules).filter((id) => world.balls[id].onTable);
  const positions: Vec2[] = [];
  for (const id of targets) {
    const t = world.balls[id];
    for (const pk of world.geometry.pockets) {
      const aim = { x: pk.x, y: pk.y };
      const u = normalize({ x: aim.x - t.x, y: aim.y - t.y });
      const hit = castBall(world, { x: t.x, y: t.y }, u, 5, [id, CUE_BALL]);
      if (hit.type !== 'pocket' || hit.pocket !== pk.index) continue;
      const ghost = { x: t.x - u.x * 2 * R, y: t.y - u.y * 2 * R };
      for (const dist of [0.2, 0.32, 0.5]) {
        for (const off of [0, 14, -14, 28, -28]) {
          const back = rotate(u, off * DEG);
          positions.push({ x: ghost.x - back.x * dist, y: ghost.y - back.y * dist });
        }
      }
    }
  }
  const valid = positions.filter((p) => validatePlacement(world, p, { kitchenOnly, ignoreId: CUE_BALL }).valid);

  let bestPlan: AiShotPlan | null = null;
  let bestScore = -Infinity;
  // Kandidaten je Position bewerten (nur Geometrie), dann beste per Simulation prüfen
  const scored: Array<{ pos: Vec2; cand: PotCandidate }> = [];
  for (const pos of valid) {
    const cands = findPotCandidates(world, pos, targets, config, profile);
    if (cands.length > 0) scored.push({ pos, cand: cands[0] });
  }
  scored.sort((a, b) => b.cand.score - a.cand.score);

  if (profile.simulateTop > 0) {
    for (const { pos, cand } of scored.slice(0, Math.max(3, profile.simulateTop - 2))) {
      const res = simulateShot(world, rules, config, pos, cand.direction, cand.power);
      const score = cand.score + outcomeBonus(res.outcome, rules);
      if (score > bestScore) {
        bestScore = score;
        bestPlan = potPlan(cand, pos);
      }
    }
  } else if (scored.length > 0) {
    const pick = scored[Math.floor(input.rng() * Math.min(profile.pickAmongTop, scored.length))];
    bestPlan = potPlan(pick.cand, pick.pos);
  }
  if (bestPlan) return bestPlan;

  // Keine Lochmöglichkeit: Weiße mit freier Linie zu einer erlaubten Kugel legen und sicher spielen
  const fallbackPos = findSafetyPlacement(world, targets, kitchenOnly);
  return planFromPosition(input, profile, fallbackPos, fallbackPos);
}

function findSafetyPlacement(world: PhysicsWorld, targets: number[], kitchenOnly: boolean): Vec2 {
  for (const id of targets) {
    const t = world.balls[id];
    for (const a of [180, 150, 210, 120, 240, 90, 270, 0, 45, 315]) {
      const dir = rotate({ x: -Math.sign(t.x || 1), y: 0 }, a * DEG);
      const pos = { x: t.x + dir.x * 0.3, y: t.y + dir.y * 0.3 };
      if (!validatePlacement(world, pos, { kitchenOnly, ignoreId: CUE_BALL }).valid) continue;
      const hit = castBall(world, pos, { x: t.x - pos.x, y: t.y - pos.y }, 2, [CUE_BALL]);
      if (hit.type === 'ball' && hit.id === id) return pos;
    }
  }
  const g = world.geometry;
  return findFreeSpot(world, { x: kitchenOnly ? g.headStringX - 0.1 : 0, y: 0 }, { kitchenOnly, ignoreId: CUE_BALL }, -1);
}

// -----------------------------------------------------------------------------
// Normale Stoßwahl von einer festen Weißen-Position

function planFromPosition(input: AiInput, profile: DifficultyProfile, cue: Vec2, placement: Vec2 | null): AiShotPlan {
  const { world, rules, config, rng } = input;
  const targets = legalTargets(rules).filter((id) => world.balls[id].onTable);
  const candidates = findPotCandidates(world, cue, targets, config, profile);

  if (candidates.length > 0) {
    if (profile.simulateTop > 0) {
      let best: { cand: PotCandidate; score: number } | null = null;
      for (const cand of candidates.slice(0, profile.simulateTop)) {
        for (const factor of [1, 0.85, 1.2]) {
          const power = Math.min(1, cand.power * factor);
          const res = simulateShot(world, rules, config, placement, cand.direction, power);
          const score = cand.score + outcomeBonus(res.outcome, rules) - Math.abs(1 - factor) * 5;
          if (!best || score > best.score) best = { cand: { ...cand, power }, score };
          if (res.outcome.continueTurn || res.outcome.gameOver?.winner === rules.currentPlayer) break;
        }
      }
      if (best && best.score > 0) return potPlan(best.cand, placement);
    } else {
      const pick = candidates[Math.floor(rng() * Math.min(profile.pickAmongTop, candidates.length))];
      return potPlan(pick, placement);
    }
  }

  const safety = planSafety(input, profile, cue, placement, targets);
  if (safety) return safety;
  const kick = planKick(input, profile, cue, placement, targets);
  if (kick) return kick;

  // Letzter Ausweg: direkt auf die nächste erlaubte Kugel
  const nearest = targets
    .map((id) => world.balls[id])
    .sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0];
  const dir = nearest ? { x: nearest.x - cue.x, y: nearest.y - cue.y } : { x: 1, y: 0 };
  return { placement, direction: normalize(dir), power: 0.5, kind: 'fallback', targetBall: nearest?.id ?? null, pocket: null };
}

/**
 * Sucht direkte Lochmöglichkeiten: Zielkugel → Tasche frei, Weiße → Geisterkugel frei,
 * erster Kontakt ist die Zielkugel. Liefert nach Bewertung sortierte Kandidaten.
 */
export function findPotCandidates(
  world: PhysicsWorld,
  cue: Vec2,
  targets: number[],
  config: GameConfig,
  profile: DifficultyProfile,
): PotCandidate[] {
  const R = world.ballRadius;
  const e = config.physics.ballRestitution;
  const out: PotCandidate[] = [];
  const maxCos = Math.cos(profile.maxCutDeg * DEG);

  for (const id of targets) {
    const t = world.balls[id];
    if (!t.onTable) continue;
    for (const pk of world.geometry.pockets) {
      const aimPoints: Vec2[] = [{ x: pk.x, y: pk.y }];
      if (profile.extraAimPoints) {
        aimPoints.push({ x: pk.mouth.x + pk.axis.x * R * 0.5, y: pk.mouth.y + pk.axis.y * R * 0.5 });
      }
      for (const aim of aimPoints) {
        const toPocket = { x: aim.x - t.x, y: aim.y - t.y };
        const u = normalize(toPocket);
        // Weg der Zielkugel: muss den Fangbereich dieser Tasche vor jeder Bande/Kugel erreichen
        const objHit = castBall(world, { x: t.x, y: t.y }, u, 5, [id, CUE_BALL]);
        if (objHit.type !== 'pocket' || objHit.pocket !== pk.index) continue;
        // Anlaufwinkel zur Tasche
        const approachDeg = Math.acos(Math.max(-1, Math.min(1, u.x * pk.axis.x + u.y * pk.axis.y))) / DEG;
        if (pk.kind === 'side' && approachDeg > 62) continue;
        if (pk.kind === 'corner' && approachDeg > 58) continue;

        const ghost = { x: t.x - u.x * 2 * R, y: t.y - u.y * 2 * R };
        const toGhost = { x: ghost.x - cue.x, y: ghost.y - cue.y };
        const distCG = Math.hypot(toGhost.x, toGhost.y);
        if (distCG < 1e-4) continue;
        const v = { x: toGhost.x / distCG, y: toGhost.y / distCG };
        const cosCut = v.x * u.x + v.y * u.y;
        if (cosCut < maxCos) continue;
        // Weg der Weißen: erster Kontakt muss die Zielkugel an der Geisterposition sein
        const cueHit = castBall(world, cue, v, distCG + 0.05, [CUE_BALL]);
        if (cueHit.type !== 'ball' || cueHit.id !== id || Math.abs(cueHit.distance - distCG) > 2e-3) continue;

        // Stärke aus dem Reibungsmodell
        const objDist = objHit.distance + 0.04;
        const vObj = speedNeededFor(objDist, 0.45, config.physics);
        const vCueContact = vObj / (cosCut * ((1 + e) / 2));
        const v0 = speedNeededFor(distCG, vCueContact, config.physics);
        if (v0 > config.shot.maxSpeed) continue;
        const power = Math.min(1, powerForSpeed(v0 * 1.08, config.shot));

        const cutDeg = Math.acos(Math.min(1, cosCut)) / DEG;
        const score =
          100 -
          cutDeg * 0.9 -
          (distCG + objDist) * 14 -
          approachDeg * (pk.kind === 'side' ? 0.5 : 0.25) -
          (power > 0.85 ? 10 : 0);
        out.push({ target: id, pocket: pk.index, cue, direction: v, power: Math.max(0.08, power), cutDeg, score });
      }
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// -----------------------------------------------------------------------------
// Sicherheitsstoß und Bandenstoß

function planSafety(
  input: AiInput,
  profile: DifficultyProfile,
  cue: Vec2,
  placement: Vec2 | null,
  targets: number[],
): AiShotPlan | null {
  const { world, rules, config } = input;
  const R = world.ballRadius;
  const options: Array<{ id: number; direction: Vec2; power: number }> = [];
  for (const id of targets) {
    const t = world.balls[id];
    const toT = normalize({ x: t.x - cue.x, y: t.y - cue.y });
    const perp = { x: -toT.y, y: toT.x };
    for (const off of [0, 0.7, -0.7, 1.3, -1.3]) {
      const aim = { x: t.x + perp.x * off * R, y: t.y + perp.y * off * R };
      const dir = normalize({ x: aim.x - cue.x, y: aim.y - cue.y });
      const hit = castBall(world, cue, dir, 5, [CUE_BALL]);
      if (hit.type !== 'ball' || hit.id !== id) continue;
      for (const power of [0.32, 0.45, 0.6]) options.push({ id, direction: dir, power });
    }
  }
  if (options.length === 0) return null;

  if (profile.simulateTop === 0) {
    const full = options.find((o) => o.power === 0.45) ?? options[0];
    return { placement, direction: full.direction, power: full.power, kind: 'safety', targetBall: full.id, pocket: null };
  }

  let best: { o: (typeof options)[number]; score: number } | null = null;
  const limit = Math.min(options.length, 18);
  for (let i = 0; i < limit; i++) {
    const o = options[i];
    const res = simulateShot(world, rules, config, placement, o.direction, o.power);
    let score = res.outcome.fouls.length === 0 ? 100 : -100;
    if (res.outcome.continueTurn) score += 200;
    if (res.outcome.gameOver) score += res.outcome.gameOver.winner === rules.currentPlayer ? 500 : -1000;
    if (res.outcome.fouls.length === 0 && !res.outcome.gameOver) {
      // Möglichst wenige leichte Lochmöglichkeiten für den Gegner hinterlassen
      const cueAfter = res.world.balls[CUE_BALL];
      if (cueAfter.onTable) {
        if (!res.outcome.continueTurn) {
          // res.state.currentPlayer ist bereits der Gegner
          const oppTargets = legalTargets(res.state);
          const oppCands = findPotCandidates(res.world, { x: cueAfter.x, y: cueAfter.y }, oppTargets, config, DIFFICULTY_PROFILES.easy);
          score -= oppCands.length > 0 ? Math.max(0, oppCands[0].score) * 0.6 : -15;
        }
      }
    }
    if (!best || score > best.score) best = { o, score };
  }
  if (!best) return null;
  return { placement, direction: best.o.direction, power: best.o.power, kind: 'safety', targetBall: best.o.id, pocket: null };
}

function planKick(
  input: AiInput,
  profile: DifficultyProfile,
  cue: Vec2,
  placement: Vec2 | null,
  targets: number[],
): AiShotPlan | null {
  const { world, rules, config } = input;
  const g = world.geometry;
  const R = world.ballRadius;
  const hl = g.halfLength - R;
  const hw = g.halfWidth - R;
  let best: { plan: AiShotPlan; score: number } | null = null;
  for (const id of targets) {
    const t = world.balls[id];
    const mirrors: Vec2[] = [
      { x: t.x, y: 2 * hw - t.y },
      { x: t.x, y: -2 * hw - t.y },
      { x: 2 * hl - t.x, y: t.y },
      { x: -2 * hl - t.x, y: t.y },
    ];
    for (const m of mirrors) {
      const dir = normalize({ x: m.x - cue.x, y: m.y - cue.y });
      const first = castBall(world, cue, dir, 5, [CUE_BALL]);
      if (first.type !== 'cushion') continue;
      const plan: AiShotPlan = { placement, direction: dir, power: 0.55, kind: 'kick', targetBall: id, pocket: null };
      if (profile.simulateTop === 0) return plan;
      const res = simulateShot(world, rules, config, placement, dir, 0.55);
      const score = res.outcome.fouls.length === 0 ? 100 : 0;
      if (!best || score > best.score) best = { plan, score };
      if (score >= 100) return plan;
    }
  }
  return best?.plan ?? null;
}

// -----------------------------------------------------------------------------
// Hilfen

function potPlan(cand: PotCandidate, placement: Vec2 | null): AiShotPlan {
  return {
    placement,
    direction: cand.direction,
    power: cand.power,
    kind: 'pot',
    targetBall: cand.target,
    pocket: cand.pocket,
  };
}

/** Bewertet ein vorausberechnetes Ergebnis aus Sicht des Schützen. */
function outcomeBonus(outcome: ShotOutcome, rules: RulesState): number {
  if (outcome.gameOver) return outcome.gameOver.winner === rules.currentPlayer ? 1000 : -2000;
  if (outcome.fouls.length > 0) return -300;
  if (outcome.continueTurn) return 400;
  return 0;
}

export interface SimulationResult {
  outcome: ShotOutcome;
  state: RulesState;
  world: PhysicsWorld;
}

/**
 * Vorausberechnung eines Stoßes in einer KOPIE der Physikwelt mit identischen
 * Parametern und derselben Stoßfunktion. Verändert den echten Tisch nicht.
 */
export function simulateShot(
  world: PhysicsWorld,
  rules: RulesState,
  config: GameConfig,
  placement: Vec2 | null,
  direction: Vec2,
  power: number,
  maxSeconds = 14,
): SimulationResult {
  const w = world.clone();
  if (placement) w.placeBall(CUE_BALL, placement.x, placement.y);
  const v = computeCueVelocity(direction, power, config.shot);
  const recorder = new ShotRecorder();
  recorder.begin();
  w.drainEvents();
  w.setVelocity(CUE_BALL, v.x, v.y);
  const dt = config.physics.timeStep;
  let t = 0;
  do {
    w.step();
    for (const ev of w.drainEvents()) recorder.onEvent(ev);
    t += dt;
  } while (!w.isSettled() && t < maxSeconds);
  const { state, outcome } = evaluateShot(rules, recorder.finish());
  return { outcome, state, world: w };
}

/** Begrenzter, gleichverteilter Ziel- und Stärkefehler. */
function applyError(plan: AiShotPlan, profile: DifficultyProfile, rng: Rng): AiShotPlan {
  const scale = plan.kind === 'break' ? 0.5 : 1;
  const angle = (rng() * 2 - 1) * profile.angleErrorDeg * DEG * scale;
  const power = plan.power * (1 + (rng() * 2 - 1) * profile.powerError * scale);
  return {
    ...plan,
    direction: rotate(normalize(plan.direction), angle),
    power: Math.max(0.05, Math.min(1, power)),
  };
}
