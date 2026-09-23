/**
 * Zentrale Spielkonfiguration.
 *
 * Alle physikalischen Größen in Metern, Sekunden und Metern pro Sekunde.
 * Physik, Zielvorschau, KI und Darstellung lesen ausschließlich diese Werte,
 * damit Tischgeometrie und Kugelradius überall identisch sind.
 */

export interface TableConfig {
  /** Länge der Spielfläche zwischen den Bandennasen (x-Achse). */
  length: number;
  /** Breite der Spielfläche zwischen den Bandennasen (y-Achse). */
  width: number;
  /** Breite des Bandengummis von der Nase bis zum Holzrahmen. */
  cushionWidth: number;
  /** Mundweite der Ecktaschen (Abstand der Backenspitzen). */
  cornerMouth: number;
  /** Mundweite der Mitteltaschen. */
  sideMouth: number;
  /** Innenwinkel zwischen Bandennase und Backenfläche an den Ecktaschen (Grad). */
  cornerJawAngleDeg: number;
  /** Innenwinkel zwischen Bandennase und Backenfläche an den Mitteltaschen (Grad). */
  sideJawAngleDeg: number;
  /** Fangradius der Ecktaschen (Kugelmittelpunkt innerhalb => versenkt). */
  cornerCaptureRadius: number;
  /** Verschiebung des Ecktaschen-Fangzentrums vom Spielflächeneck entlang der Diagonalen nach außen. */
  cornerCaptureOffset: number;
  /** Fangradius der Mitteltaschen. */
  sideCaptureRadius: number;
  /** Verschiebung des Mitteltaschen-Fangzentrums hinter die Bandenlinie. */
  sideCaptureOffset: number;
  /** Sichtbarer Lochradius im Tuch (nur Darstellung). */
  cornerHoleRadius: number;
  sideHoleRadius: number;
  sideHoleOffset: number;
  /** Radius der Aussparung im Holzrahmen an den Taschen (nur Darstellung). */
  cornerRailCutRadius: number;
  sideRailCutRadius: number;
  /**
   * Sicherheitsnetz: Überschreitet ein Kugelmittelpunkt die Bandenlinie um mehr als
   * diesen Betrag, gilt die Kugel als in der nächsten Tasche versenkt.
   * Das ist nur über eine Taschenöffnung möglich.
   */
  offTableMargin: number;
}

export interface BallConfig {
  radius: number;
}

export interface PhysicsConfig {
  /** Fester Physik-Zeitschritt. */
  timeStep: number;
  /** Maximal berücksichtigte Frame-Zeit (gegen aufgestaute Zeit nach Tabwechsel). */
  maxFrameDelta: number;
  /** Maximale Anzahl Physikschritte pro Frame. */
  maxStepsPerFrame: number;
  /** Stoßzahl Kugel-Kugel (1 = vollelastisch). */
  ballRestitution: number;
  /** Stoßzahl Kugel-Bande (Normalanteil). */
  cushionRestitution: number;
  /** Erhaltener Tangentialanteil beim Bandenkontakt. */
  cushionTangentialFactor: number;
  /** Konstante Rollverzögerung in m/s². */
  rollingDeceleration: number;
  /** Geschwindigkeitsproportionale Dämpfung in 1/s. */
  linearDamping: number;
  /** Unterhalb dieser Geschwindigkeit wird eine Kugel exakt angehalten. */
  stopSpeed: number;
  /** Wie lange alle Kugeln ruhen müssen, bevor ein Stoß als beendet gilt. */
  restTime: number;
  /** Dauer der Einsinkanimation einer versenkten Kugel. */
  sinkDuration: number;
  /** Maximale Kollisionsereignisse pro Physikschritt (Schutz vor Endlosschleifen). */
  maxEventsPerStep: number;
}

export interface ShotConfig {
  /** Anfangsgeschwindigkeit der Weißen bei minimaler Stärke. */
  minSpeed: number;
  /** Anfangsgeschwindigkeit der Weißen bei maximaler Stärke. */
  maxSpeed: number;
  /** Exponent der Stärkekurve (>1 = feinere Dosierung bei leichten Stößen). */
  powerExponent: number;
  /** Zeit bis zur vollen Aufladung in Sekunden. */
  chargeTime: number;
  /** Kürzere Klicks gelten nicht als Stoß (Schutz vor versehentlichen Stößen). */
  minChargeTime: number;
  /** Dauer der Vorwärtsbewegung des Queues. */
  strikeDuration: number;
}

export interface GameConfig {
  table: TableConfig;
  ball: BallConfig;
  physics: PhysicsConfig;
  shot: ShotConfig;
}

const BALL_RADIUS = 0.028575; // 57,15 mm Durchmesser

export const DEFAULT_CONFIG: GameConfig = {
  table: {
    length: 2.24, // 8-ft-Tisch
    width: 1.12,
    cushionWidth: 0.05,
    cornerMouth: 0.118,
    sideMouth: 0.132,
    cornerJawAngleDeg: 142,
    sideJawAngleDeg: 104,
    cornerCaptureRadius: 0.056,
    cornerCaptureOffset: 0.0,
    sideCaptureRadius: 0.052,
    sideCaptureOffset: 0.03,
    cornerHoleRadius: 0.062,
    sideHoleRadius: 0.058,
    sideHoleOffset: 0.026,
    cornerRailCutRadius: 0.078,
    sideRailCutRadius: 0.068,
    offTableMargin: BALL_RADIUS * 0.5,
  },
  ball: {
    radius: BALL_RADIUS,
  },
  physics: {
    timeStep: 1 / 240,
    maxFrameDelta: 0.1,
    maxStepsPerFrame: 48,
    ballRestitution: 0.95,
    cushionRestitution: 0.76,
    cushionTangentialFactor: 0.94,
    rollingDeceleration: 0.15,
    linearDamping: 0.34,
    stopSpeed: 0.006,
    restTime: 0.25,
    sinkDuration: 0.45,
    maxEventsPerStep: 96,
  },
  shot: {
    minSpeed: 0.3,
    maxSpeed: 6.6,
    powerExponent: 1.35,
    chargeTime: 1.3,
    minChargeTime: 0.08,
    strikeDuration: 0.11,
  },
};

/** Tiefe Kopie mit optionalen Überschreibungen (z. B. für Tests ohne Reibung). */
export function createConfig(overrides: {
  table?: Partial<TableConfig>;
  ball?: Partial<BallConfig>;
  physics?: Partial<PhysicsConfig>;
  shot?: Partial<ShotConfig>;
} = {}): GameConfig {
  return {
    table: { ...DEFAULT_CONFIG.table, ...overrides.table },
    ball: { ...DEFAULT_CONFIG.ball, ...overrides.ball },
    physics: { ...DEFAULT_CONFIG.physics, ...overrides.physics },
    shot: { ...DEFAULT_CONFIG.shot, ...overrides.shot },
  };
}
