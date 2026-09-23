import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PROFILES, findPotCandidates, planAiShot, simulateShot } from '../src/ai/aiPlayer';
import type { AiInput } from '../src/ai/types';
import { DEFAULT_CONFIG } from '../src/config/gameConfig';
import { validatePlacement } from '../src/game/placement';
import { createRng } from '../src/game/random';
import { createInitialRulesState, legalTargets, type RulesState } from '../src/game/rules';
import type { Difficulty } from '../src/game/types';
import type { PhysicsWorld } from '../src/physics/physicsWorld';
import { makeWorld, R } from './helpers';

function rulesFor(onTable: number[], groups: RulesState['groups'] = ['solids', 'stripes']): RulesState {
  return { ...createInitialRulesState(0), isBreak: false, groups, onTable };
}

function input(world: PhysicsWorld, rules: RulesState, difficulty: Difficulty, seed: number, ballInHand = false): AiInput {
  return { world, rules, ballInHand, kitchenOnly: false, difficulty, rng: createRng(seed), config: DEFAULT_CONFIG };
}

const angleDeg = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) * 180) / Math.PI;

describe('Computergegner', () => {
  it('plant nur auf erlaubte Zielkugeln', () => {
    const { world } = makeWorld();
    // Gegnerische Halbe liegt ideal vor der Tasche, eigene Volle schwieriger
    world.placeBall(0, 0, 0);
    world.placeBall(10, 0.7, 0.35); // Halbe, leichte Lochmöglichkeit
    world.placeBall(3, -0.6, -0.3); // eigene Volle
    world.placeBall(8, 0.3, -0.35);
    const rules = rulesFor([3, 8, 10]);
    for (const diff of ['easy', 'medium'] as const) {
      for (let seed = 1; seed <= 5; seed++) {
        const plan = planAiShot(input(world, rules, diff, seed));
        if (plan.targetBall !== null) expect(legalTargets(rules)).toContain(plan.targetBall);
        const res = simulateShot(world, rules, DEFAULT_CONFIG, null, plan.direction, plan.power);
        // erster Kontakt ist legal (keine gegnerische Kugel, nicht die 8)
        expect(res.outcome.fouls).not.toContain('wrongFirstContact');
      }
    }
  });

  it('versenkt einen einfachen geraden Ball zuverlässig (Mittel)', () => {
    const { world } = makeWorld();
    const pk = world.geometry.pockets[3]; // (+,+)
    const target = { x: pk.x - 0.3 * Math.SQRT1_2, y: pk.y - 0.3 * Math.SQRT1_2 };
    world.placeBall(5, target.x, target.y);
    world.placeBall(0, target.x - 0.35 * Math.SQRT1_2, target.y - 0.35 * Math.SQRT1_2);
    world.placeBall(8, -0.5, 0.2);
    const rules = rulesFor([5, 8]);
    let success = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const plan = planAiShot(input(world, rules, 'medium', seed));
      expect(plan.kind).toBe('pot');
      expect(plan.targetBall).toBe(5);
      const res = simulateShot(world, rules, DEFAULT_CONFIG, null, plan.direction, plan.power);
      if (res.outcome.pocketed.includes(5) && res.outcome.fouls.length === 0) success++;
    }
    expect(success).toBeGreaterThanOrEqual(9);
  });

  it('berücksichtigt Hindernisse auf dem Weg der Zielkugel und der Weißen', () => {
    const { world } = makeWorld();
    const cfg = DEFAULT_CONFIG;
    const pk = world.geometry.pockets[3];
    const target = { x: pk.x - 0.4 * Math.SQRT1_2, y: pk.y - 0.4 * Math.SQRT1_2 };
    world.placeBall(5, target.x, target.y);
    world.placeBall(0, target.x - 0.4 * Math.SQRT1_2, target.y - 0.4 * Math.SQRT1_2);
    // Blocker zwischen Zielkugel und Tasche
    world.placeBall(12, target.x + 0.18 * Math.SQRT1_2, target.y + 0.18 * Math.SQRT1_2);
    const cue = { x: world.balls[0].x, y: world.balls[0].y };
    const cands = findPotCandidates(world, cue, [5], cfg, DIFFICULTY_PROFILES.medium);
    expect(cands.some((c) => c.pocket === 3)).toBe(false);

    // Blocker zwischen Weißer und Zielkugel
    world.removeBall(12);
    world.placeBall(13, target.x - 0.2 * Math.SQRT1_2, target.y - 0.2 * Math.SQRT1_2);
    const cands2 = findPotCandidates(world, cue, [5], cfg, DIFFICULTY_PROFILES.medium);
    expect(cands2).toHaveLength(0);
  });

  it('spielt ohne Lochmöglichkeit einen legalen Sicherheits- oder Bandenstoß', () => {
    const { world } = makeWorld();
    // Eigene Kugel mitten auf dem Tisch, von gegnerischen Kugeln "eingemauert" Richtung Taschen
    world.placeBall(0, -0.8, 0);
    world.placeBall(2, 0.0, 0.0);
    world.placeBall(9, 0.0 + 2 * R + 0.001, 0.0);
    world.placeBall(10, 0.0, 2 * R + 0.001);
    world.placeBall(11, 0.0, -2 * R - 0.001);
    world.placeBall(8, 0.8, 0.4);
    const rules = rulesFor([2, 8, 9, 10, 11]);
    const plan = planAiShot(input(world, rules, 'medium', 3));
    expect(['safety', 'kick', 'pot']).toContain(plan.kind);
    const res = simulateShot(world, rules, DEFAULT_CONFIG, null, plan.direction, plan.power);
    expect(res.outcome.fouls).not.toContain('wrongFirstContact');
    expect(res.outcome.fouls).not.toContain('noContact');
  });

  it('löst Ball in Hand selbstständig mit gültiger Platzierung', () => {
    for (const diff of ['easy', 'medium'] as const) {
      const { world } = makeWorld();
      world.placeBall(4, 0.4, 0.2);
      world.placeBall(12, -0.3, -0.25);
      world.placeBall(8, 0.9, -0.4);
      const rules = rulesFor([4, 8, 12]);
      const plan = planAiShot(input(world, rules, diff, 7, true));
      expect(plan.placement).not.toBeNull();
      expect(validatePlacement(world, plan.placement!, { kitchenOnly: false, ignoreId: 0 }).valid).toBe(true);
      expect(plan.kind).toBe('pot');
    }
  });

  it('Anstoß: platziert im Anstoßraum und stößt kräftig auf die Spitze', () => {
    const { world } = makeWorld();
    world.placeBall(1, world.geometry.footSpot.x, 0);
    const rules = createInitialRulesState(1);
    const plan = planAiShot({ ...input(world, rules, 'medium', 2, true), kitchenOnly: true });
    expect(plan.kind).toBe('break');
    expect(plan.placement!.x).toBeLessThanOrEqual(world.geometry.headStringX);
    expect(plan.power).toBeGreaterThan(0.8);
  });

  it('Zielfehler sind begrenzt und bei „Einfach“ größer als bei „Mittel“', () => {
    const { world } = makeWorld();
    const pk = world.geometry.pockets[4];
    world.placeBall(6, 0, pk.y - 0.35);
    world.placeBall(0, 0, pk.y - 0.8);
    world.placeBall(8, -0.9, -0.4);
    const rules = rulesFor([6, 8]);
    const exact = findPotCandidates(world, { x: 0, y: pk.y - 0.8 }, [6], DEFAULT_CONFIG, DIFFICULTY_PROFILES.medium)[0];
    const mean: Record<Difficulty, number> = { easy: 0, medium: 0 };
    for (const diff of ['easy', 'medium'] as const) {
      let sum = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const plan = planAiShot(input(world, rules, diff, seed));
        const dev = angleDeg(plan.direction, exact.direction);
        expect(dev).toBeLessThanOrEqual(DIFFICULTY_PROFILES[diff].angleErrorDeg + 0.5);
        sum += dev;
      }
      mean[diff] = sum / 40;
    }
    expect(mean.easy).toBeGreaterThan(mean.medium);
  });

  it('Vorausberechnung verändert den echten Tisch nicht', () => {
    const { world } = makeWorld();
    world.placeBall(0, -0.5, 0);
    world.placeBall(3, 0.2, 0.05);
    const before = JSON.stringify(world.balls);
    simulateShot(world, rulesFor([3]), DEFAULT_CONFIG, null, { x: 1, y: 0.07 }, 0.8);
    expect(JSON.stringify(world.balls)).toBe(before);
  });
});
