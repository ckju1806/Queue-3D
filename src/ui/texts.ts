import { type BallGroup, groupOf } from '../game/balls';
import type { FoulType, GameOverReason, ShotOutcome } from '../game/rules';
import type { TrainingOutcome } from '../game/training';
import type { HintKey, SessionState } from '../game/types';

/** Alle sichtbaren Texte der Oberfläche (Deutsch). */

export type MessageTone = 'info' | 'success' | 'foul' | 'turn';

export interface UiMessage {
  text: string;
  tone: MessageTone;
}

export const GROUP_LABEL: Record<BallGroup, string> = {
  solids: 'Volle 1–7',
  stripes: 'Halbe 9–15',
};

export const GROUP_LONG: Record<BallGroup, string> = {
  solids: 'die vollen Kugeln (1–7)',
  stripes: 'die halben Kugeln (9–15)',
};

export const FOUL_TEXT: Record<FoulType, string> = {
  scratch: 'Foul: Die Weiße wurde versenkt.',
  noContact: 'Foul: Die Weiße hat keine Objektkugel getroffen.',
  wrongFirstContact: 'Foul: Zuerst wurde eine nicht erlaubte Kugel getroffen.',
  noCushion: 'Foul: Nach dem Kontakt wurde weder eine Kugel versenkt noch eine Bande berührt.',
};

export const HINT_TEXT: Record<HintKey, string> = {
  holdToCharge: 'Linke Maustaste gedrückt halten, um die Stoßstärke aufzuladen.',
  invalidPlacement: 'Hier kann die Weiße nicht platziert werden.',
  repositionNotAllowed: 'Die Weiße darf nur bei Ball in Hand versetzt werden.',
};

export function reasonText(reason: GameOverReason, shooter: string): string {
  switch (reason) {
    case 'eightPocketed':
      return `${shooter} hat die schwarze 8 regelgerecht versenkt.`;
    case 'eightEarly':
      return `${shooter} hat die schwarze 8 zu früh versenkt.`;
    case 'eightWithFoul':
      return `${shooter} hat die schwarze 8 mit einem Foul versenkt.`;
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Meldungen nach einem ausgewerteten 8-Ball-Stoß. */
export function outcomeMessages(outcome: ShotOutcome, names: [string, string], tableOpenAfter: boolean): UiMessage[] {
  const shooter = names[outcome.shooter];
  const next = names[outcome.nextPlayer];
  const out: UiMessage[] = [];
  if (outcome.gameOver) return out;

  if (outcome.wasBreak) {
    if (outcome.pocketed.length > 0) {
      out.push({ text: `Anstoß: ${plural(outcome.pocketed.length, 'Kugel', 'Kugeln')} versenkt. Der Tisch ist offen.`, tone: 'info' });
    }
    if (outcome.respotEight) {
      out.push({ text: 'Die schwarze 8 fiel beim Anstoß und wird wieder eingesetzt.', tone: 'info' });
    }
  }
  for (const f of outcome.fouls) out.push({ text: FOUL_TEXT[f], tone: 'foul' });

  if (outcome.assignedGroup) {
    out.push({ text: `${shooter} spielt ${GROUP_LONG[outcome.assignedGroup]}.`, tone: 'success' });
  } else if (!outcome.wasBreak && outcome.fouls.length === 0 && tableOpenAfter) {
    const solids = outcome.pocketed.filter((id) => groupOf(id) === 'solids').length;
    const stripes = outcome.pocketed.filter((id) => groupOf(id) === 'stripes').length;
    if (solids > 0 && stripes > 0) {
      out.push({ text: 'Kugeln beider Gruppen versenkt – der Tisch bleibt offen.', tone: 'info' });
    }
  }

  if (outcome.ballInHand) {
    out.push({ text: `Ball in Hand für ${next}.`, tone: 'turn' });
  } else if (outcome.continueTurn) {
    out.push({ text: `${shooter} bleibt am Zug.`, tone: 'success' });
  } else if (outcome.pocketed.length > 0 && !outcome.wasBreak) {
    out.push({ text: `Keine eigene Kugel versenkt – ${next} ist am Zug.`, tone: 'turn' });
  } else {
    out.push({ text: `Spielerwechsel: ${next} ist am Zug.`, tone: 'turn' });
  }
  return out;
}

/** Meldungen im Trainingsmodus. */
export function trainingMessages(outcome: TrainingOutcome): UiMessage[] {
  const out: UiMessage[] = [];
  if (outcome.cueScratched) out.push({ text: 'Weiße versenkt – platziere sie neu.', tone: 'foul' });
  else if (outcome.hints.includes('noContact')) out.push({ text: 'Keine Kugel getroffen.', tone: 'info' });
  if (outcome.pocketed.length > 0) {
    out.push({ text: `${plural(outcome.pocketed.length, 'Kugel', 'Kugeln')} versenkt.`, tone: 'success' });
  }
  return out;
}

export function statusText(state: SessionState, opts: { kitchenOnly: boolean; aiTurn: boolean; canReposition: boolean; training: boolean }): string {
  if (opts.aiTurn) {
    switch (state) {
      case 'aiThinking':
        return 'Computer überlegt …';
      case 'aiming':
        return 'Computer zielt …';
      case 'charging':
      case 'striking':
        return 'Computer stößt …';
      default:
        break;
    }
  }
  switch (state) {
    case 'ballInHand':
      return opts.kitchenOnly ? 'Anstoß: Weiße im Anstoßraum platzieren (Linksklick)' : 'Ball in Hand: Weiße platzieren (Linksklick)';
    case 'aiming':
      return opts.canReposition || opts.training
        ? 'Zielen · Linke Maustaste halten · B: Weiße versetzen'
        : 'Zielen · Linke Maustaste halten zum Aufladen';
    case 'charging':
      return 'Loslassen zum Stoßen · Esc bricht ab';
    case 'striking':
    case 'rolling':
      return 'Kugeln rollen …';
    case 'evaluating':
      return 'Stoß wird ausgewertet …';
    case 'paused':
      return 'Pause';
    case 'gameOver':
      return 'Spiel beendet';
    default:
      return '';
  }
}

export const CONTROLS: Array<[string, string]> = [
  ['Maus bewegen', 'Stoßrichtung festlegen'],
  ['Linke Maustaste halten', 'Stoßstärke aufladen'],
  ['Linke Maustaste loslassen', 'Stoß ausführen'],
  ['Rechte Maustaste ziehen', 'Kamera um den Tisch drehen'],
  ['Mausrad', 'Zoom'],
  ['V', 'Perspektive / Draufsicht'],
  ['R', 'Kamera zurücksetzen'],
  ['Esc', 'Aufladen abbrechen / Pause'],
  ['B', 'Weiße versetzen (Training, Ball in Hand)'],
  ['← / →', 'Feinjustierung (mit Umschalt: gröber)'],
  ['M', 'Ton an/aus'],
  ['H', 'Hilfe ein-/ausblenden'],
];

export const RULES: string[] = [
  'Vereinfachtes Freizeit-Regelwerk für 8-Ball – keine offiziellen Turnierregeln.',
  'Ein Spieler spielt die vollen Kugeln 1–7, der andere die halben 9–15. Taschen müssen nicht angesagt werden.',
  'Nach dem Anstoß ist der Tisch offen. Die Gruppe wird nach einem foulfreien Stoß zugeordnet, bei dem nur Kugeln einer Gruppe fallen.',
  'Wer ohne Foul eine eigene Kugel versenkt, spielt weiter. Sonst wechselt der Zug.',
  'Fouls: Weiße versenkt · keine Objektkugel getroffen · zuerst falsche Kugel getroffen · nach dem Kontakt weder Kugel versenkt noch Bande berührt.',
  'Nach einem Foul erhält der Gegner Ball in Hand und darf die Weiße frei auf dem Tisch platzieren.',
  'Die 8 darf erst gespielt werden, wenn die eigene Gruppe zu Stoßbeginn abgeräumt ist. Zu früh oder mit Foul versenkt = verloren.',
  'Fällt die 8 beim Anstoß, wird sie wieder eingesetzt – weder Sieg noch Niederlage.',
];
