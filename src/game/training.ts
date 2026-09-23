import { OBJECT_BALLS } from './balls';
import type { FoulType } from './rules';
import type { ShotRecord } from './shotRecorder';

/** Auswertung im Trainingsmodus: keine Niederlage, Fouls nur als Hinweis. */
export interface TrainingOutcome {
  pocketed: number[];
  /** Hinweise (z. B. Weiße versenkt) – ohne Konsequenzen außer der Neuplatzierung. */
  hints: FoulType[];
  cueScratched: boolean;
  tableCleared: boolean;
}

export function evaluateTrainingShot(onTableBefore: readonly number[], record: ShotRecord): TrainingOutcome {
  const pocketed = record.pocketed.filter((id) => id !== 0);
  const hints: FoulType[] = [];
  if (record.cueScratched) hints.push('scratch');
  if (record.firstContact === null) hints.push('noContact');
  const remaining = onTableBefore.filter((id) => !pocketed.includes(id) && OBJECT_BALLS.includes(id));
  return { pocketed, hints, cueScratched: record.cueScratched, tableCleared: remaining.length === 0 };
}
