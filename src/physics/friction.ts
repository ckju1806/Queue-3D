import type { PhysicsConfig } from '../config/gameConfig';

/**
 * Analytische Hilfen zum Reibungsmodell dv/dt = −(a + k·v)
 * (a = Rollverzögerung, k = lineare Dämpfung). Genutzt von der KI zur Stärkewahl.
 */

/** Strecke, auf der die Geschwindigkeit von v0 auf v1 sinkt. */
export function distanceBetweenSpeeds(v0: number, v1: number, cfg: PhysicsConfig): number {
  const a = cfg.rollingDeceleration;
  const k = cfg.linearDamping;
  if (v0 <= v1) return 0;
  if (k < 1e-9) return (v0 * v0 - v1 * v1) / (2 * a);
  return (v0 - v1) / k - (a / (k * k)) * Math.log((a + k * v0) / (a + k * v1));
}

/** Gesamte Rollstrecke bis zum Stillstand. */
export function stoppingDistance(v0: number, cfg: PhysicsConfig): number {
  return distanceBetweenSpeeds(v0, cfg.stopSpeed, cfg);
}

/** Restgeschwindigkeit nach einer Strecke (0, falls die Kugel vorher stoppt). */
export function speedAfterDistance(v0: number, distance: number, cfg: PhysicsConfig): number {
  if (stoppingDistance(v0, cfg) <= distance) return 0;
  let lo = cfg.stopSpeed;
  let hi = v0;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (distanceBetweenSpeeds(v0, mid, cfg) > distance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Nötige Anfangsgeschwindigkeit, um nach `distance` noch `endSpeed` zu haben. */
export function speedNeededFor(distance: number, endSpeed: number, cfg: PhysicsConfig): number {
  const target = Math.max(endSpeed, cfg.stopSpeed);
  let lo = target;
  let hi = 30;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (distanceBetweenSpeeds(mid, target, cfg) < distance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
