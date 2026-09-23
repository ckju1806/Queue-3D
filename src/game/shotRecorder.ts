import type { PhysicsEvent } from '../physics/physicsWorld';
import { CUE_BALL } from './balls';

/** Alle regelrelevanten Ereignisse eines Stoßes. */
export interface ShotRecord {
  /** Erste von der Weißen berührte Objektkugel (`null` = keine Berührung). */
  firstContact: number | null;
  /** Hat nach dem ersten Objektkugelkontakt irgendeine Kugel eine Bande berührt? */
  cushionAfterContact: boolean;
  /** Anzahl Bandenkontakte nach dem ersten Kontakt (alle Kugeln). */
  cushionContactsAfterContact: number;
  /** Versenkte Kugeln in Reihenfolge (inkl. 0 bei Scratch). */
  pocketed: number[];
  /** Wurde die Weiße versenkt? */
  cueScratched: boolean;
}

export function emptyShotRecord(): ShotRecord {
  return { firstContact: null, cushionAfterContact: false, cushionContactsAfterContact: 0, pocketed: [], cueScratched: false };
}

/** Sammelt Physikereignisse eines Stoßes. Trennt Regellogik von der Physik. */
export class ShotRecorder {
  private record: ShotRecord = emptyShotRecord();
  private active = false;

  begin(): void {
    this.record = emptyShotRecord();
    this.active = true;
  }

  get isActive(): boolean {
    return this.active;
  }

  onEvent(e: PhysicsEvent): void {
    if (!this.active) return;
    const r = this.record;
    switch (e.type) {
      case 'ballBall':
        if (r.firstContact === null) {
          if (e.a === CUE_BALL) r.firstContact = e.b;
          else if (e.b === CUE_BALL) r.firstContact = e.a;
        }
        return;
      case 'cushion':
        if (r.firstContact !== null) {
          r.cushionAfterContact = true;
          r.cushionContactsAfterContact++;
        }
        return;
      case 'pocket':
        if (!r.pocketed.includes(e.ball)) r.pocketed.push(e.ball);
        if (e.ball === CUE_BALL) r.cueScratched = true;
        return;
    }
  }

  /** Beendet die Aufzeichnung und liefert das Ergebnis (nur einmal pro Stoß). */
  finish(): ShotRecord {
    this.active = false;
    return { ...this.record, pocketed: [...this.record.pocketed] };
  }
}
