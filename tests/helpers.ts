import { createConfig, DEFAULT_CONFIG, type GameConfig, type PhysicsConfig } from '../src/config/gameConfig';
import { PhysicsWorld } from '../src/physics/physicsWorld';
import { createTableGeometry } from '../src/physics/tableGeometry';

export const R = DEFAULT_CONFIG.ball.radius;

export function makeWorld(physics: Partial<PhysicsConfig> = {}): { world: PhysicsWorld; config: GameConfig } {
  const config = createConfig({ physics });
  const geometry = createTableGeometry(config.table);
  return { world: new PhysicsWorld(geometry, config), config };
}

/** Simuliert bis zum Stillstand (inkl. Einsinkanimationen) oder bis maxSeconds. */
export function runUntilSettled(world: PhysicsWorld, maxSeconds = 30): number {
  const dt = world.config.physics.timeStep;
  let t = 0;
  world.step();
  t += dt;
  while (!world.isSettled() && t < maxSeconds) {
    world.step();
    t += dt;
  }
  return t;
}

export function runSteps(world: PhysicsWorld, steps: number): void {
  for (let i = 0; i < steps; i++) world.step();
}
