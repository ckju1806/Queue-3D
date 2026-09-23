# Architektur – Pool Lounge 3D

## Überblick

```
            ┌──────────────┐   Ereignisse    ┌──────────┐
 Maus/Tast. │ InputManager ├───────────────▶│          │──▶ GameUI (DOM, Deutsch)
 ──────────▶│  (Guards)    │  Methoden mit  │  Game-   │──▶ AudioEngine (Web Audio)
            └──────────────┘  Zustandsprüf. │  Session │
                                            │ (Zustands│◀── KI-Planer (planAiShot)
            ┌──────────────┐  liest Zustand │ automat) │
            │SceneRenderer │◀───────────────┤          │
            │ (Three.js)   │                └────┬─────┘
            └──────────────┘                     │ update(dt)
                                   ┌─────────────┼──────────────┐
                                   ▼             ▼              ▼
                            PhysicsWorld    rules.ts       ShotRecorder
                            (2D, CCD)       (rein)         (Ereignisse)
```

- **Logik ohne DOM:** `GameSession`, Physik, Regeln, KI und Zielvorschau sind reine TypeScript-Module ohne Browser-Abhängigkeit und vollständig in Node testbar.
- **Einweg-Datenfluss zur Darstellung:** Renderer und UI lesen den Zustand; Änderungen erfolgen ausschließlich über Methoden der Session.
- **Eine Stoßfunktion:** `computeCueVelocity()` in `src/game/shot.ts`; aufgerufen nur in `GameSession.executeShot()` – für Mensch und Computer identisch.

## Zustandsautomat (`src/game/gameSession.ts`)

| Zustand | Bedeutung | Übergänge |
|---|---|---|
| `menu` | Hauptmenü | → `ballInHand` (Spielstart) |
| `ballInHand` | Weiße platzieren (Anstoß: nur Anstoßraum) | → `aiming` (gültige Platzierung) |
| `aiming` | Zielen | → `charging` (LMB), → `ballInHand` (B bei erlaubtem Versetzen) |
| `charging` | Stärke aufladen | → `striking` (loslassen), → `aiming` (Esc, Fokusverlust, RMB, zu kurzer Klick) |
| `striking` | Queue-Vorwärtsbewegung | → `rolling` (Stoß ausgeführt) |
| `rolling` | Kugeln rollen | → `evaluating` (alle Kugeln ≥ 0,25 s in Ruhe, Einsinken abgeschlossen) |
| `evaluating` | Stoß genau einmal auswerten | → `aiming` / `ballInHand` / `aiThinking` / `gameOver` |
| `aiThinking` | Computer plant (sichtbar: Platzierung wandert) | → `aiming` → `charging` → `striking` (wie Mensch) |
| `paused` | Pause (merkt Vorzustand, Simulation eingefroren) | → Vorzustand |
| `gameOver` | Ergebnis, Revanche | → `ballInHand` (Revanche) / `menu` |

Guards: Menschliche Eingabemethoden liefern `false`, wenn der Zustand nicht passt, Kugeln rollen oder der Computer am Zug ist.

## Physik (`src/physics/`)

- **Koordinaten:** Meter; x = Längsachse, y = Querachse; Ursprung Tischmitte. Darstellung: (x, y) → Three.js (x, Höhe, y).
- **Fester Zeitschritt** 1/240 s mit Akkumulator; Frame-Delta ≤ 0,1 s, ≤ 48 Schritte pro Frame (keine aufgestaute Zeit nach Tabwechsel).
- **Kontinuierliche Kollisionserkennung:** Innerhalb jedes Schritts wird das früheste Ereignis (Kugel–Kugel, Kugel–Bandensegment, Kugel–Backenspitze, Taschenfang) per Time-of-Impact gesucht, alles bis dorthin bewegt und aufgelöst. Kein Durchtunneln – auch nicht bei extremen Geschwindigkeiten (getestet bis 40 m/s).
- **Kugel–Kugel:** gleiche Massen, Stoßzahl 0,95, reibungsfrei (90°-Regel). Kugeln mit ≤ 1 mm Spalt werden als **gleichzeitiger Stoß** aufgelöst (Poisson-Hypothese, Sequential Impulses) – realistisches Aufbrechen des Dreiecks.
- **Banden:** Stoßzahl 0,76, Tangentialanteil 0,94. Taschenöffnungen sind in der Geometrie offen (Backen mit 142°/104°).
- **Reibung:** `dv/dt = −(a + k·v)` mit a = 0,15 m/s², k = 0,34 1/s; unter 0,006 m/s exakter Stillstand.
- **Taschen:** Fangkreis je Tasche (Ecke 56 mm, Mitte 52 mm) + Sicherheitsnetz (Kugel jenseits der Bandenlinie → nächste Tasche). Versenkte Kugeln verlassen sofort die Physik, genau ein `pocket`-Ereignis, 0,45 s Einsinkanimation.
- **Numerische Absicherung:** Überlappungskorrektur, Herausdrücken aus Banden, begrenzte Ereignisse pro Schritt.

## Regeln (`src/game/rules.ts`)

`evaluateShot(zustandZuStoßbeginn, shotRecord) → { neuerZustand, outcome }` – reine Funktion.
`ShotRecorder` sammelt: erster Objektkugelkontakt, Bandenkontakte nach dem ersten Kontakt, versenkte Kugeln (Reihenfolge), Scratch.

## Zielvorschau (`src/aim/aimPreview.ts`)

Swept-Circle-Cast mit exakt dem Physikradius und denselben TOI-Funktionen. Liefert Geisterkugel, Kontaktpunkt, Objektkugelrichtung (Normale) und Laufrichtung der Weißen (identische Stoßformel wie die Physik). Tests prüfen die Übereinstimmung mit der Simulation (< 0,12°).

## KI (`src/ai/aiPlayer.ts`)

1. Erlaubte Ziele aus den Regeln (`legalTargets`).
2. Für jede Ziel-/Taschenkombination: Weg Zielkugel → Tasche und Weg Weiße → Geisterkugel per Cast prüfen (Kugeln und Banden als Hindernisse), Schnitt- und Anlaufwinkel bewerten.
3. Stärke aus der Umkehrung des Reibungsmodells + Marge.
4. *Mittel*: beste Kandidaten per Vorausberechnung in einer Kopie derselben Physikwelt prüfen (Stärkevarianten).
5. Ohne Lochmöglichkeit: Sicherheitsstoß (legaler Erstkontakt, möglichst wenig Lochchancen für den Gegner), sonst Ein-Banden-Stoß.
6. Ball in Hand: Kandidatenpositionen hinter Zielkugeln, validiert über `validatePlacement`.
7. Begrenzter, gleichverteilter Ziel-/Stärkefehler: Einfach ±1,8° / ±14 %, Mittel ±0,6° / ±6 %.

## Rendering (`src/render/`)

- Tischmodell aus `TableGeometry` (Banden-Polygone, Backen, Taschenlöcher, Rahmenaussparungen) – Optik = Kollisionsgeometrie.
- MeshPhysicalMaterial (Clearcoat für Kugeln und Holz, Sheen für Tuch), RoomEnvironment-Reflexionen (lokal gebündelt), ACES-Tonemapping, PCF-Schatten mit weichem Radius.
- Kugelrotation aus der tatsächlichen Verschiebung (Achse = oben × Weg, Winkel = Weg/R).
- Queue: Lathe-Geometrie, automatische Anhebung über Bande/Rahmen, Aufzieh- und Stoßanimation passend zur Stärke.
- Kamera: Orbit mit Dämpfung, automatische Einpassung des ganzen Tisches, Draufsicht; Lampenkörper werden bei steilem Blick ausgeblendet.
