import type { PhysicsEvent } from '../physics/physicsWorld';
import type { Vec2 } from '../physics/vec2';
import type { PlayerIndex, ShotOutcome } from './rules';
import type { TrainingOutcome } from './training';

export type GameMode = 'training' | 'twoPlayer' | 'vsComputer';
export type Difficulty = 'easy' | 'medium';

/** Klare Spielzustände des Zustandsautomaten. */
export type SessionState =
  | 'menu' // Hauptmenü
  | 'ballInHand' // Weiße platzieren
  | 'aiming' // Zielen
  | 'charging' // Stoßstärke aufladen
  | 'striking' // Queue-Vorwärtsbewegung
  | 'rolling' // Kugeln rollen
  | 'evaluating' // Stoß auswerten
  | 'aiThinking' // Computer plant
  | 'paused' // Pause
  | 'gameOver'; // Spielende

export type Controller = 'human' | 'ai';

export interface PlayerInfo {
  name: string;
  controller: Controller;
}

export type SessionEvent =
  | { type: 'stateChanged'; state: SessionState; previous: SessionState }
  | { type: 'gameStarted'; mode: GameMode }
  | { type: 'turnStarted'; player: PlayerIndex; ballInHand: boolean; kitchenOnly: boolean }
  | { type: 'shot'; player: PlayerIndex; power: number; direction: Vec2 }
  | { type: 'physics'; event: PhysicsEvent }
  | { type: 'shotEvaluated'; outcome: ShotOutcome }
  | { type: 'trainingEvaluated'; outcome: TrainingOutcome }
  | { type: 'tableCleared' }
  | { type: 'gameOver'; winner: PlayerIndex; outcome: ShotOutcome }
  | { type: 'hint'; key: HintKey };

export type HintKey = 'holdToCharge' | 'invalidPlacement' | 'repositionNotAllowed';
