import { planAiShot } from '../ai/aiPlayer';
import type { AiPlanner, AiShotPlan } from '../ai/types';
import { computeAimPreview, type AimPreview } from '../aim/aimPreview';
import { DEFAULT_CONFIG, type GameConfig } from '../config/gameConfig';
import { PhysicsWorld } from '../physics/physicsWorld';
import { createTableGeometry, type TableGeometry } from '../physics/tableGeometry';
import { normalize, rotate, type Vec2 } from '../physics/vec2';
import { CUE_BALL, EIGHT_BALL, OBJECT_BALLS } from './balls';
import { clampToPlacementArea, findFreeSpot, validatePlacement, type PlacementResult } from './placement';
import { createRack, defaultCuePosition } from './rack';
import { createRng, randomSeed, randRange, type Rng } from './random';
import {
  createInitialRulesState,
  evaluateShot,
  legalTargets,
  opponent,
  type PlayerIndex,
  type RulesState,
  type ShotOutcome,
} from './rules';
import { computeCueVelocity } from './shot';
import { ShotRecorder } from './shotRecorder';
import { evaluateTrainingShot } from './training';
import type { Difficulty, GameMode, PlayerInfo, SessionEvent, SessionState } from './types';

/**
 * Zustandsautomat des Spiels – vollständig ohne DOM und ohne Rendering.
 *
 * Menschliche Eingaben laufen über die öffentlichen Methoden (mit Guards),
 * der Computer nutzt intern dieselben Zustände (Zielen → Aufladen → Stoß)
 * und dieselbe Stoßfunktion `executeShot` → `computeCueVelocity`.
 */

const AI_THINK_TIME: Record<Difficulty, [number, number]> = {
  easy: [0.9, 1.5],
  medium: [0.8, 1.3],
};
const AI_AIM_TIME = 0.75;
const AI_AIM_PAUSE = 0.25;

interface AiTurnState {
  plan: AiShotPlan;
  thinkTime: number;
  elapsed: number;
  previewFrom: Vec2;
  aimFrom: number;
  aimTo: number;
  aimElapsed: number;
}

export interface SessionOptions {
  config?: GameConfig;
  seed?: number;
  planner?: AiPlanner;
}

export class GameSession {
  readonly config: GameConfig;
  readonly geometry: TableGeometry;
  readonly world: PhysicsWorld;

  mode: GameMode = 'training';
  difficulty: Difficulty = 'medium';
  players: [PlayerInfo, PlayerInfo] = [
    { name: 'Spieler 1', controller: 'human' },
    { name: 'Spieler 2', controller: 'human' },
  ];
  rules: RulesState = createInitialRulesState(0);

  /** Aktuelle Zielrichtung (Einheitsvektor). */
  aimDirection: Vec2 = { x: 1, y: 0 };
  /** Aktuelle Stoßstärke während des Aufladens (0 … 1). */
  power = 0;
  /** Stärke des laufenden bzw. letzten Stoßes. */
  strikePower = 0;
  /** Fortschritt der Queue-Vorwärtsbewegung (0 … 1). */
  strikeProgress = 0;
  /** Vorschauposition der Weißen bei Ball in Hand. */
  cuePreview: Vec2;
  /** Ball in Hand nur im Anstoßraum. */
  kitchenOnly = false;
  /** Darf die Weiße vor dem Stoß (erneut) platziert werden? */
  canRepositionCue = false;
  lastShotOutcome: ShotOutcome | null = null;
  stats = { shots: [0, 0] as [number, number], fouls: [0, 0] as [number, number] };
  training = { shots: 0, pocketed: 0, racks: 1 };
  /** Anzahl bisheriger Stoßauswertungen (zur Prüfung "genau einmal pro Stoß"). */
  evaluationCount = 0;
  /** Zeit seit dem letzten Stoß (für die Queue-Ausblendung). */
  timeSinceShot = 0;

  private _state: SessionState = 'menu';
  private pausedFrom: SessionState | null = null;
  private chargeElapsed = 0;
  private strikeElapsed = 0;
  private rulesAtShotStart: RulesState | null = null;
  private objectBallsAtShotStart: number[] = [];
  private readonly recorder = new ShotRecorder();
  private readonly listeners = new Set<(e: SessionEvent) => void>();
  private readonly rng: Rng;
  private readonly planner: AiPlanner;
  private breaker: PlayerIndex = 0;
  private aiTurn: AiTurnState | null = null;

  constructor(options: SessionOptions = {}) {
    this.config = options.config ?? DEFAULT_CONFIG;
    this.geometry = createTableGeometry(this.config.table);
    this.world = new PhysicsWorld(this.geometry, this.config);
    this.rng = createRng(options.seed ?? randomSeed());
    this.planner = options.planner ?? planAiShot;
    this.cuePreview = defaultCuePosition(this.geometry);
  }

  // ---------------------------------------------------------------------------
  // Ereignisse

  on(listener: (e: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: SessionEvent): void {
    for (const l of this.listeners) l(e);
  }

  get state(): SessionState {
    return this._state;
  }

  /** Zustand für die Darstellung: während der Pause der Zustand davor. */
  get displayState(): SessionState {
    return this._state === 'paused' && this.pausedFrom ? this.pausedFrom : this._state;
  }

  private setState(next: SessionState): void {
    const previous = this._state;
    if (previous === next) return;
    this._state = next;
    this.emit({ type: 'stateChanged', state: next, previous });
  }

  // ---------------------------------------------------------------------------
  // Spielablauf

  startGame(mode: GameMode, difficulty: Difficulty = this.difficulty): void {
    this.mode = mode;
    this.difficulty = difficulty;
    if (mode === 'vsComputer') {
      this.players = [
        { name: 'Du', controller: 'human' },
        { name: difficulty === 'easy' ? 'Computer (Einfach)' : 'Computer (Mittel)', controller: 'ai' },
      ];
    } else if (mode === 'twoPlayer') {
      this.players = [
        { name: 'Spieler 1', controller: 'human' },
        { name: 'Spieler 2', controller: 'human' },
      ];
    } else {
      this.players = [
        { name: 'Training', controller: 'human' },
        { name: '–', controller: 'human' },
      ];
    }
    this.breaker = 0;
    this.training = { shots: 0, pocketed: 0, racks: 1 };
    this.stats = { shots: [0, 0], fouls: [0, 0] };
    this.pausedFrom = null;
    this.setupRack();
    this.emit({ type: 'gameStarted', mode });
  }

  /** Neustart im selben Modus. Bei einer Revanche wechselt der Anstoß. */
  restart(options: { alternateBreaker?: boolean } = {}): void {
    if (options.alternateBreaker && this.mode !== 'training') this.breaker = opponent(this.breaker);
    this.stats = { shots: [0, 0], fouls: [0, 0] };
    this.training = { shots: 0, pocketed: 0, racks: 1 };
    this.pausedFrom = null;
    this.setupRack();
    this.emit({ type: 'gameStarted', mode: this.mode });
  }

  /** Aufgebauter Tisch als Hintergrund für das Hauptmenü (ohne Spielstart). */
  prepareShowcase(): void {
    if (this._state !== 'menu') return;
    this.world.clear();
    for (const p of createRack(this.geometry, this.world.ballRadius, this.rng)) this.world.placeBall(p.id, p.x, p.y);
    const cue = defaultCuePosition(this.geometry);
    this.world.placeBall(CUE_BALL, cue.x, cue.y);
  }

  quitToMenu(): void {
    this.aiTurn = null;
    this.pausedFrom = null;
    this.power = 0;
    this.setState('menu');
  }

  private setupRack(): void {
    this.aiTurn = null;
    this.world.clear();
    const rack = createRack(this.geometry, this.world.ballRadius, this.rng);
    for (const p of rack) this.world.placeBall(p.id, p.x, p.y);
    this.rules = createInitialRulesState(this.breaker);
    this.lastShotOutcome = null;
    this.aimDirection = { x: 1, y: 0 };
    this.power = 0;
    this.strikeProgress = 0;
    this.cuePreview = defaultCuePosition(this.geometry);
    this.startTurn(this.breaker, true, true);
  }

  private startTurn(player: PlayerIndex, ballInHand: boolean, kitchenOnly: boolean): void {
    this.rules = { ...this.rules, currentPlayer: player };
    this.kitchenOnly = kitchenOnly;
    this.canRepositionCue = ballInHand;
    this.power = 0;
    this.strikeProgress = 0;
    if (ballInHand) {
      const cue = this.world.balls[CUE_BALL];
      const start = cue.onTable ? { x: cue.x, y: cue.y } : defaultCuePosition(this.geometry);
      this.world.removeBall(CUE_BALL);
      const clamped = clampToPlacementArea(this.world, start, kitchenOnly);
      this.cuePreview = findFreeSpot(this.world, clamped, { kitchenOnly, ignoreId: CUE_BALL }, -1);
    }
    this.emit({ type: 'turnStarted', player, ballInHand, kitchenOnly });
    if (this.isAiTurn()) this.beginAiTurn();
    else this.setState(ballInHand ? 'ballInHand' : 'aiming');
  }

  // ---------------------------------------------------------------------------
  // Abfragen

  get currentPlayer(): PlayerIndex {
    return this.rules.currentPlayer;
  }

  isAiTurn(): boolean {
    return this.mode === 'vsComputer' && this.players[this.rules.currentPlayer].controller === 'ai';
  }

  isHumanTurn(): boolean {
    return !this.isAiTurn();
  }

  isInGame(): boolean {
    return this._state !== 'menu';
  }

  /** Position der Weißen für die Darstellung (Vorschau bei Ball in Hand). */
  cueBallPosition(): Vec2 | null {
    const st = this.displayState;
    if (st === 'ballInHand' || (st === 'aiThinking' && this.canRepositionCue && this.aiTurn)) {
      return this.cuePreview;
    }
    const cue = this.world.balls[CUE_BALL];
    return cue.onTable ? { x: cue.x, y: cue.y } : null;
  }

  placementValidity(p: Vec2 = this.cuePreview): PlacementResult {
    return validatePlacement(this.world, p, { kitchenOnly: this.kitchenOnly, ignoreId: CUE_BALL });
  }

  /** Zielvorschau für den aktuellen Zustand (null, wenn nicht gezielt wird). */
  aimPreview(): AimPreview | null {
    const st = this.displayState;
    if (st !== 'aiming' && st !== 'charging' && st !== 'striking') return null;
    const cue = this.world.balls[CUE_BALL];
    if (!cue.onTable) return null;
    return computeAimPreview(this.world, { x: cue.x, y: cue.y }, this.aimDirection);
  }

  /** Erlaubte Zielkugeln des aktiven Spielers (Training: alle). */
  currentLegalTargets(): number[] {
    if (this.mode === 'training') return OBJECT_BALLS.filter((id) => this.world.balls[id].onTable);
    return legalTargets(this.rules);
  }

  // ---------------------------------------------------------------------------
  // Menschliche Eingaben (mit Guards)

  setAimDirection(dir: Vec2): boolean {
    if (this._state !== 'aiming' || !this.isHumanTurn()) return false;
    if (Math.hypot(dir.x, dir.y) < 1e-9) return false;
    this.aimDirection = normalize(dir);
    return true;
  }

  nudgeAim(angle: number): boolean {
    if (this._state !== 'aiming' || !this.isHumanTurn()) return false;
    this.aimDirection = normalize(rotate(this.aimDirection, angle));
    return true;
  }

  beginCharge(): boolean {
    if (this._state !== 'aiming' || !this.isHumanTurn()) return false;
    if (this.world.isMoving() || !this.world.balls[CUE_BALL].onTable) return false;
    this.chargeElapsed = 0;
    this.power = 0;
    this.setState('charging');
    return true;
  }

  cancelCharge(): boolean {
    if (this._state !== 'charging' || !this.isHumanTurn()) return false;
    this.power = 0;
    this.chargeElapsed = 0;
    this.setState('aiming');
    return true;
  }

  releaseCharge(): boolean {
    if (this._state !== 'charging' || !this.isHumanTurn()) return false;
    if (this.chargeElapsed < this.config.shot.minChargeTime) {
      this.cancelCharge();
      this.emit({ type: 'hint', key: 'holdToCharge' });
      return false;
    }
    this.startStrike();
    return true;
  }

  updateCuePreview(p: Vec2): boolean {
    if (this._state !== 'ballInHand' || !this.isHumanTurn()) return false;
    this.cuePreview = clampToPlacementArea(this.world, p, this.kitchenOnly);
    return true;
  }

  tryPlaceCueBall(p: Vec2 = this.cuePreview): boolean {
    if (this._state !== 'ballInHand' || !this.isHumanTurn()) return false;
    const pos = clampToPlacementArea(this.world, p, this.kitchenOnly);
    if (!this.placementValidity(pos).valid) {
      this.emit({ type: 'hint', key: 'invalidPlacement' });
      return false;
    }
    this.cuePreview = pos;
    this.world.placeBall(CUE_BALL, pos.x, pos.y);
    this.setState('aiming');
    return true;
  }

  /** Weiße erneut aufnehmen (Training jederzeit bei ruhendem Tisch, sonst nur bei Ball in Hand vor dem Stoß). */
  requestCueReposition(): boolean {
    if (this._state !== 'aiming' || !this.isHumanTurn()) return false;
    if (this.mode !== 'training' && !this.canRepositionCue) {
      this.emit({ type: 'hint', key: 'repositionNotAllowed' });
      return false;
    }
    const cue = this.world.balls[CUE_BALL];
    if (cue.onTable) this.cuePreview = { x: cue.x, y: cue.y };
    this.world.removeBall(CUE_BALL);
    this.setState('ballInHand');
    return true;
  }

  canPause(): boolean {
    return this._state !== 'menu' && this._state !== 'gameOver' && this._state !== 'paused';
  }

  pause(): boolean {
    if (!this.canPause()) return false;
    if (this._state === 'charging' && this.isHumanTurn()) this.cancelCharge();
    this.pausedFrom = this._state;
    this.setState('paused');
    return true;
  }

  resume(): boolean {
    if (this._state !== 'paused' || !this.pausedFrom) return false;
    const target = this.pausedFrom;
    this.pausedFrom = null;
    this.setState(target);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Zeitfortschritt

  update(frameDelta: number): void {
    const dt = Math.min(Math.max(frameDelta, 0), this.config.physics.maxFrameDelta);
    if (dt === 0) return;
    this.timeSinceShot += dt;
    switch (this._state) {
      case 'charging': {
        this.chargeElapsed += dt;
        this.power = Math.min(1, this.chargeElapsed / this.config.shot.chargeTime);
        if (this.isAiTurn() && this.aiTurn && this.power >= this.aiTurn.plan.power) {
          this.power = this.aiTurn.plan.power;
          this.startStrike();
        }
        break;
      }
      case 'striking': {
        this.strikeElapsed += dt;
        this.strikeProgress = Math.min(1, this.strikeElapsed / this.config.shot.strikeDuration);
        if (this.strikeProgress >= 1) this.executeShot();
        break;
      }
      case 'rolling': {
        this.world.advance(frameDelta);
        for (const e of this.world.drainEvents()) {
          this.recorder.onEvent(e);
          this.emit({ type: 'physics', event: e });
        }
        if (this.world.isSettled()) this.finishShot();
        break;
      }
      case 'aiThinking':
      case 'aiming':
        if (this.isAiTurn()) this.updateAi(dt);
        break;
      default:
        break;
    }
  }

  private startStrike(): void {
    this.strikePower = Math.max(0, Math.min(1, this.power));
    this.strikeElapsed = 0;
    this.strikeProgress = 0;
    this.setState('striking');
  }

  /**
   * Führt den Stoß aus – der einzige Weg, die Weiße in Bewegung zu setzen.
   * Wird für Mensch und Computer identisch am Ende der Queue-Animation aufgerufen.
   */
  private executeShot(): boolean {
    if (this._state !== 'striking') return false;
    if (this.world.isMoving()) return false;
    const cue = this.world.balls[CUE_BALL];
    if (!cue.onTable) return false;
    const v = computeCueVelocity(this.aimDirection, this.strikePower, this.config.shot);
    this.recorder.begin();
    this.rulesAtShotStart = { ...this.rules, onTable: [...this.rules.onTable], groups: [this.rules.groups[0], this.rules.groups[1]] };
    this.objectBallsAtShotStart = OBJECT_BALLS.filter((id) => this.world.balls[id].onTable);
    this.world.drainEvents();
    this.world.setVelocity(CUE_BALL, v.x, v.y);
    this.canRepositionCue = false;
    this.timeSinceShot = 0;
    this.power = 0;
    const shooter = this.rules.currentPlayer;
    if (this.mode === 'training') this.training.shots++;
    else this.stats.shots[shooter]++;
    this.aiTurn = null;
    this.setState('rolling');
    this.emit({ type: 'shot', player: shooter, power: this.strikePower, direction: { ...this.aimDirection } });
    return true;
  }

  /** Stoßende: genau eine Auswertung, danach nächster Zug. */
  private finishShot(): void {
    if (!this.recorder.isActive) return;
    this.setState('evaluating');
    const record = this.recorder.finish();
    this.evaluationCount++;

    if (this.mode === 'training') {
      const outcome = evaluateTrainingShot(this.objectBallsAtShotStart, record);
      this.training.pocketed += outcome.pocketed.length;
      this.emit({ type: 'trainingEvaluated', outcome });
      if (outcome.tableCleared) {
        this.emit({ type: 'tableCleared' });
        this.training.racks++;
        this.setupRack();
        return;
      }
      this.startTurn(0, outcome.cueScratched, false);
      return;
    }

    const { state, outcome } = evaluateShot(this.rulesAtShotStart ?? this.rules, record);
    this.rules = state;
    this.lastShotOutcome = outcome;
    if (outcome.fouls.length > 0) this.stats.fouls[outcome.shooter]++;
    if (outcome.respotEight) {
      const spot = findFreeSpot(this.world, this.geometry.footSpot, { kitchenOnly: false, ignoreId: EIGHT_BALL }, 1);
      this.world.placeBall(EIGHT_BALL, spot.x, spot.y);
    }
    this.emit({ type: 'shotEvaluated', outcome });
    if (outcome.gameOver) {
      this.setState('gameOver');
      this.emit({ type: 'gameOver', winner: outcome.gameOver.winner, outcome });
      return;
    }
    this.startTurn(outcome.nextPlayer, outcome.ballInHand, false);
  }

  // ---------------------------------------------------------------------------
  // Computerzug (nutzt dieselben Zustände und dieselbe Stoßfunktion)

  private beginAiTurn(): void {
    this.setState('aiThinking');
    const [lo, hi] = AI_THINK_TIME[this.difficulty];
    let plan: AiShotPlan;
    try {
      plan = this.planner({
        world: this.world,
        rules: this.rules,
        ballInHand: this.canRepositionCue,
        kitchenOnly: this.kitchenOnly,
        difficulty: this.difficulty,
        rng: this.rng,
        config: this.config,
      });
    } catch (err) {
      console.error('KI-Planung fehlgeschlagen, nutze Ersatzstoß', err);
      plan = this.fallbackPlan();
    }
    this.aiTurn = {
      plan,
      thinkTime: randRange(this.rng, lo, hi),
      elapsed: 0,
      previewFrom: { ...this.cuePreview },
      aimFrom: Math.atan2(this.aimDirection.y, this.aimDirection.x),
      aimTo: Math.atan2(plan.direction.y, plan.direction.x),
      aimElapsed: 0,
    };
  }

  private fallbackPlan(): AiShotPlan {
    const cue = this.world.balls[CUE_BALL].onTable ? this.world.balls[CUE_BALL] : this.cuePreview;
    const targets = legalTargets(this.rules);
    const target = targets.length > 0 ? this.world.balls[targets[0]] : { x: 0, y: 0 };
    return {
      placement: this.canRepositionCue ? this.cuePreview : null,
      direction: normalize({ x: target.x - cue.x, y: target.y - cue.y }),
      power: 0.5,
      kind: 'fallback',
      targetBall: targets[0] ?? null,
      pocket: null,
    };
  }

  private updateAi(dt: number): void {
    const ai = this.aiTurn;
    if (!ai) return;
    if (this._state === 'aiThinking') {
      ai.elapsed += dt;
      const t = Math.min(1, ai.elapsed / ai.thinkTime);
      if (this.canRepositionCue && ai.plan.placement) {
        const s = t * t * (3 - 2 * t);
        this.cuePreview = {
          x: ai.previewFrom.x + (ai.plan.placement.x - ai.previewFrom.x) * s,
          y: ai.previewFrom.y + (ai.plan.placement.y - ai.previewFrom.y) * s,
        };
      }
      if (t < 1) return;
      if (this.canRepositionCue) {
        const wanted = ai.plan.placement ?? this.cuePreview;
        const opts = { kitchenOnly: this.kitchenOnly, ignoreId: CUE_BALL };
        const pos = validatePlacement(this.world, wanted, opts).valid ? wanted : findFreeSpot(this.world, wanted, opts, -1);
        this.cuePreview = pos;
        this.world.placeBall(CUE_BALL, pos.x, pos.y);
        // Richtung nach der tatsächlichen Platzierung beibehalten
      }
      if (!this.world.balls[CUE_BALL].onTable) {
        // Sollte nicht vorkommen – Sicherheitsnetz
        const pos = findFreeSpot(this.world, defaultCuePosition(this.geometry), { kitchenOnly: false, ignoreId: CUE_BALL }, -1);
        this.world.placeBall(CUE_BALL, pos.x, pos.y);
      }
      ai.aimFrom = Math.atan2(this.aimDirection.y, this.aimDirection.x);
      ai.aimElapsed = 0;
      this.setState('aiming');
      return;
    }
    // Zielen: Queue dreht sich sichtbar zur geplanten Richtung
    ai.aimElapsed += dt;
    const t = Math.min(1, ai.aimElapsed / AI_AIM_TIME);
    const s = t * t * (3 - 2 * t);
    let delta = ai.aimTo - ai.aimFrom;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const angle = ai.aimFrom + delta * s;
    this.aimDirection = { x: Math.cos(angle), y: Math.sin(angle) };
    if (ai.aimElapsed >= AI_AIM_TIME + AI_AIM_PAUSE) {
      this.aimDirection = normalize(ai.plan.direction);
      this.chargeElapsed = 0;
      this.power = 0;
      this.setState('charging');
    }
  }
}
