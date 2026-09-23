import { type BallGroup, ballsOfGroup, EIGHT_BALL, groupOf, OBJECT_BALLS, otherGroup } from './balls';
import type { ShotRecord } from './shotRecorder';

/**
 * Vereinfachtes Freizeit-Regelwerk für 8-Ball (keine offiziellen Turnierregeln).
 * Reine Funktionen ohne Abhängigkeit von Rendering oder Physik.
 */

export type PlayerIndex = 0 | 1;

export interface RulesState {
  currentPlayer: PlayerIndex;
  /** Gruppenzuordnung je Spieler; `null` = Tisch offen. */
  groups: [BallGroup | null, BallGroup | null];
  /** Steht der Anstoß noch aus? */
  isBreak: boolean;
  /** Noch auf dem Tisch befindliche Objektkugeln (1–15). */
  onTable: number[];
  winner: PlayerIndex | null;
}

export type FoulType = 'scratch' | 'noContact' | 'wrongFirstContact' | 'noCushion';

export type GameOverReason = 'eightPocketed' | 'eightEarly' | 'eightWithFoul';

export interface ShotOutcome {
  wasBreak: boolean;
  shooter: PlayerIndex;
  fouls: FoulType[];
  /** In diesem Stoß versenkte Objektkugeln (ohne Weiße). */
  pocketed: number[];
  /** Darf der Schütze weiterspielen? */
  continueTurn: boolean;
  nextPlayer: PlayerIndex;
  /** Erhält der nächste Spieler Ball in Hand? */
  ballInHand: boolean;
  /** Wurde die 8 beim Anstoß versenkt und wird wieder eingesetzt? */
  respotEight: boolean;
  /** In diesem Stoß neu zugeordnete Gruppe des Schützen. */
  assignedGroup: BallGroup | null;
  gameOver: { winner: PlayerIndex; reason: GameOverReason } | null;
}

export function createInitialRulesState(startingPlayer: PlayerIndex = 0): RulesState {
  return {
    currentPlayer: startingPlayer,
    groups: [null, null],
    isBreak: true,
    onTable: [...OBJECT_BALLS],
    winner: null,
  };
}

export const opponent = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** Anzahl noch liegender Kugeln einer Gruppe. */
export function remainingOfGroup(state: RulesState, group: BallGroup): number {
  const ids = ballsOfGroup(group);
  return state.onTable.filter((id) => ids.includes(id)).length;
}

/** Darf der Spieler zu Beginn dieses Stoßes auf die 8 spielen? */
export function isOnEight(state: RulesState, player: PlayerIndex = state.currentPlayer): boolean {
  const g = state.groups[player];
  if (g !== null) return remainingOfGroup(state, g) === 0;
  // Sonderfall: offener Tisch, aber keine Gruppenkugel mehr vorhanden
  return state.onTable.every((id) => id === EIGHT_BALL);
}

/** Aktuell erlaubte Kugeln für den ersten Kontakt. */
export function legalTargets(state: RulesState, player: PlayerIndex = state.currentPlayer): number[] {
  if (state.isBreak) return state.onTable.slice();
  if (isOnEight(state, player)) return state.onTable.includes(EIGHT_BALL) ? [EIGHT_BALL] : [];
  const g = state.groups[player];
  if (g === null) return state.onTable.filter((id) => id !== EIGHT_BALL);
  const ids = ballsOfGroup(g);
  return state.onTable.filter((id) => ids.includes(id));
}

/**
 * Wertet einen vollständig beendeten Stoß aus.
 * @param state Spielzustand zu Stoßbeginn
 * @param record Aufgezeichnete Ereignisse des Stoßes
 */
export function evaluateShot(state: RulesState, record: ShotRecord): { state: RulesState; outcome: ShotOutcome } {
  const shooter = state.currentPlayer;
  const opp = opponent(shooter);
  const objPocketed = record.pocketed.filter((id) => id !== 0);
  const eightPocketed = objPocketed.includes(EIGHT_BALL);

  // --- Fouls ermitteln ---
  const fouls: FoulType[] = [];
  if (record.cueScratched) fouls.push('scratch');
  if (record.firstContact === null) {
    fouls.push('noContact');
  } else if (!state.isBreak) {
    if (!legalTargets(state, shooter).includes(record.firstContact)) fouls.push('wrongFirstContact');
    if (objPocketed.length === 0 && !record.cushionAfterContact) fouls.push('noCushion');
  }
  const foul = fouls.length > 0;

  let onTable = state.onTable.filter((id) => !objPocketed.includes(id));

  // --- Anstoß ---
  if (state.isBreak) {
    const respotEight = eightPocketed;
    if (respotEight) onTable = [...onTable, EIGHT_BALL].sort((a, b) => a - b);
    const continueTurn = !foul && objPocketed.length > 0;
    const nextPlayer = continueTurn ? shooter : opp;
    const newState: RulesState = { ...state, isBreak: false, onTable, currentPlayer: nextPlayer, groups: [null, null] };
    return {
      state: newState,
      outcome: {
        wasBreak: true,
        shooter,
        fouls,
        pocketed: objPocketed,
        continueTurn,
        nextPlayer,
        ballInHand: foul,
        respotEight,
        assignedGroup: null,
        gameOver: null,
      },
    };
  }

  // --- Schwarze 8 außerhalb des Anstoßes ---
  if (eightPocketed) {
    const legalWin = !foul && isOnEight(state, shooter);
    const winner = legalWin ? shooter : opp;
    const reason: GameOverReason = legalWin ? 'eightPocketed' : foul ? 'eightWithFoul' : 'eightEarly';
    const newState: RulesState = { ...state, onTable, winner };
    return {
      state: newState,
      outcome: {
        wasBreak: false,
        shooter,
        fouls,
        pocketed: objPocketed,
        continueTurn: false,
        nextPlayer: winner,
        ballInHand: false,
        respotEight: false,
        assignedGroup: null,
        gameOver: { winner, reason },
      },
    };
  }

  // --- Gruppenzuordnung (nur nach foulfreiem Stoß bei offenem Tisch) ---
  let groups: [BallGroup | null, BallGroup | null] = [state.groups[0], state.groups[1]];
  let assignedGroup: BallGroup | null = null;
  if (!foul && groups[shooter] === null) {
    const solids = objPocketed.filter((id) => groupOf(id) === 'solids').length;
    const stripes = objPocketed.filter((id) => groupOf(id) === 'stripes').length;
    if ((solids > 0) !== (stripes > 0)) {
      assignedGroup = solids > 0 ? 'solids' : 'stripes';
      groups = shooter === 0 ? [assignedGroup, otherGroup(assignedGroup)] : [otherGroup(assignedGroup), assignedGroup];
    }
  }

  // --- Weiterspielen oder Wechsel (Foul hat Vorrang) ---
  const own = groups[shooter];
  const pocketedOwn = own === null ? objPocketed.length > 0 : objPocketed.some((id) => groupOf(id) === own);
  const continueTurn = !foul && pocketedOwn;
  const nextPlayer = continueTurn ? shooter : opp;

  return {
    state: { ...state, onTable, groups, currentPlayer: nextPlayer },
    outcome: {
      wasBreak: false,
      shooter,
      fouls,
      pocketed: objPocketed,
      continueTurn,
      nextPlayer,
      ballInHand: foul,
      respotEight: false,
      assignedGroup,
      gameOver: null,
    },
  };
}
