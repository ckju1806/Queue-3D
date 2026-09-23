import type { Difficulty } from '../game/types';

/** Lokal gespeicherte Einstellungen (keine Spielstände). */
export interface Settings {
  volume: number;
  muted: boolean;
  /** Anschlussrichtungen im Training anzeigen. */
  trainingAimHelp: boolean;
  /** Steuerungshinweise unten links anzeigen. */
  showControlsHint: boolean;
  lastDifficulty: Difficulty;
}

const KEY = 'poolLounge3d.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  muted: false,
  trainingAimHelp: true,
  showControlsHint: true,
  lastDifficulty: 'easy',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
      trainingAimHelp: typeof parsed.trainingAimHelp === 'boolean' ? parsed.trainingAimHelp : DEFAULT_SETTINGS.trainingAimHelp,
      showControlsHint:
        typeof parsed.showControlsHint === 'boolean' ? parsed.showControlsHint : DEFAULT_SETTINGS.showControlsHint,
      lastDifficulty: parsed.lastDifficulty === 'medium' || parsed.lastDifficulty === 'easy' ? parsed.lastDifficulty : 'easy',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus) – Einstellungen gelten nur für diese Sitzung
  }
}
