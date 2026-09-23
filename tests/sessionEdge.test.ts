import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/gameSession';
describe('Randfälle des Zustandsautomaten', () => {
  it('Neustart und Hauptmenü während rollender Kugeln sind sicher', () => {
    const s = new GameSession({ seed: 4 });
    s.startGame('twoPlayer');
    s.tryPlaceCueBall();
    s.setAimDirection({ x: 1, y: 0 });
    s.beginCharge();
    for (let i = 0; i < 40; i++) s.update(1 / 60);
    s.releaseCharge();
    for (let i = 0; i < 20; i++) s.update(1 / 60);
    expect(s.state).toBe('rolling');
    s.restart();
    expect(s.state).toBe('ballInHand');
    expect(s.world.isMoving()).toBe(false);
    expect(s.world.balls.filter((b) => b.onTable).length).toBe(15);
    // Nächster Stoß wird normal ausgewertet (genau einmal)
    const before = s.evaluationCount;
    s.tryPlaceCueBall();
    s.setAimDirection({ x: 1, y: 0.01 });
    s.beginCharge();
    for (let i = 0; i < 30; i++) s.update(1 / 60);
    s.releaseCharge();
    for (let i = 0; i < 60 * 30 && s.state !== 'aiming' && s.state !== 'ballInHand'; i++) s.update(1 / 60);
    expect(s.evaluationCount).toBe(before + 1);
    s.quitToMenu();
    s.prepareShowcase();
    expect(s.state).toBe('menu');
    expect(s.beginCharge()).toBe(false);
  });
});
