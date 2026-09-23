import type { GameConfig } from '../config/gameConfig';
import type { Rng } from '../game/random';
import type { RulesState } from '../game/rules';
import type { Difficulty } from '../game/types';
import type { PhysicsWorld } from '../physics/physicsWorld';
import type { Vec2 } from '../physics/vec2';

export type AiShotKind = 'break' | 'pot' | 'safety' | 'kick' | 'fallback';

export interface AiShotPlan {
  /** Position der Weißen bei Ball in Hand (sonst null). */
  placement: Vec2 | null;
  direction: Vec2;
  /** Stoßstärke 0 … 1 (dieselbe Skala wie beim Menschen). */
  power: number;
  kind: AiShotKind;
  targetBall: number | null;
  pocket: number | null;
}

export interface AiInput {
  /** Aktueller Tischzustand (wird nicht verändert; Vorausberechnungen nutzen Kopien). */
  world: PhysicsWorld;
  rules: RulesState;
  ballInHand: boolean;
  kitchenOnly: boolean;
  difficulty: Difficulty;
  rng: Rng;
  config: GameConfig;
}

export type AiPlanner = (input: AiInput) => AiShotPlan;
