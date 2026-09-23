import type { ShotConfig } from '../config/gameConfig';
import { normalize, type Vec2 } from '../physics/vec2';

/**
 * EINZIGE Stoßfunktion des Spiels.
 * Mensch und Computer erzeugen die Anfangsgeschwindigkeit der Weißen
 * ausschließlich hierüber (siehe GameSession.executeShot).
 */

/** Anfangsgeschwindigkeit in m/s für eine Stoßstärke von 0 … 1. */
export function shotSpeed(power: number, cfg: ShotConfig): number {
  const p = Math.min(1, Math.max(0, power));
  return cfg.minSpeed + (cfg.maxSpeed - cfg.minSpeed) * Math.pow(p, cfg.powerExponent);
}

/** Umkehrfunktion: Stoßstärke für eine gewünschte Anfangsgeschwindigkeit. */
export function powerForSpeed(speed: number, cfg: ShotConfig): number {
  if (speed <= cfg.minSpeed) return 0;
  if (speed >= cfg.maxSpeed) return 1;
  return Math.pow((speed - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed), 1 / cfg.powerExponent);
}

/** Geschwindigkeitsvektor der Weißen für Richtung und Stärke. */
export function computeCueVelocity(direction: Vec2, power: number, cfg: ShotConfig): Vec2 {
  const d = normalize(direction);
  const v = shotSpeed(power, cfg);
  return { x: d.x * v, y: d.y * v };
}
