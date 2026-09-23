# Pool Lounge 3D

Ein lokal spielbares 3D-Billardspiel (8-Ball) für den Browser – entwickelt mit **TypeScript**, **Three.js** und **Vite**.
Ruhige Lounge-Atmosphäre, eigene getestete Billardphysik, drei Spielmodi, deutsche Oberfläche.
Kein Backend, keine Registrierung, keine API-Schlüssel, keine CDN-Abhängigkeiten zur Laufzeit.

- **Training** – freies Spielen ohne Gegner und ohne Niederlage; die Weiße kann bei ruhendem Tisch jederzeit neu platziert werden.
- **Zwei Spieler** – abwechselnd am selben PC.
- **Gegen Computer** – Mensch gegen KI in den Stufen *Einfach* und *Mittel*.

---

## Voraussetzungen

| Komponente | Version | Hinweis |
|---|---|---|
| Betriebssystem | Windows 10/11 (auch Linux/macOS möglich) | Zielplattform Windows-PC mit Maus und Tastatur |
| Node.js | **22 LTS** (≥ 22.12) oder 24 LTS | <https://nodejs.org> → „LTS“ herunterladen und installieren |
| npm | wird mit Node.js installiert | – |
| Browser | aktueller Chrome, Edge oder Firefox mit WebGL | Hardwarebeschleunigung aktiviert lassen |

Eine Internetverbindung wird nur **einmalig** für `npm install` benötigt. Danach läuft das Spiel vollständig offline.

## Installation (Windows)

1. Node.js LTS installieren (Standardoptionen genügen).
2. Eingabeaufforderung oder PowerShell im Projektordner öffnen
   (im Explorer in den Ordner wechseln, in die Adresszeile `cmd` eingeben und Enter drücken).
3. Abhängigkeiten installieren:

   ```bat
   npm install
   ```

## Spiel starten

```bat
npm run dev
```

Anschließend im Browser **<http://localhost:5173>** öffnen.

Alternativ als optimierter Produktionsbuild:

```bat
npm run build
npm run preview
```

→ **<http://localhost:4173>** öffnen.

> Tipp bei schwacher Grafikhardware: `http://localhost:5173/?quality=low` (geringere Auflösung, keine Schatten).

## Steuerung

| Eingabe | Aktion |
|---|---|
| Maus über dem Tisch bewegen | Stoßrichtung festlegen |
| Linke Maustaste gedrückt halten | Stoßstärke aufladen (Anzeige rechts) |
| Linke Maustaste loslassen | Stoß ausführen |
| Rechte Maustaste ziehen | Kamera um den Tisch drehen |
| Mausrad | Zoom |
| `V` | Perspektive ↔ Draufsicht |
| `R` | Kamera auf Standardposition |
| `Esc` | Aufladen abbrechen bzw. Pausemenü öffnen/schließen |
| `B` | Weiße neu platzieren (Training jederzeit bei ruhendem Tisch; sonst bei Ball in Hand vor dem Stoß) |
| `←` / `→` | Feinjustierung der Richtung (mit `Umschalt` gröber) |
| `M` | Ton an/aus |
| `H` | Steuerungshinweise ein-/ausblenden |
| Linksklick bei *Ball in Hand* | Weiße an der Vorschauposition platzieren (grün = gültig, rot = ungültig) |

Schutzmechanismen: Klicks auf Menüs/Buttons lösen keinen Stoß aus, die rechte Maustaste (Kamera) nie; während Kugeln rollen
oder der Computer am Zug ist, sind Stöße gesperrt; bei Fokusverlust wird eine laufende Aufladung abgebrochen.
Sehr kurze Klicks (< 0,08 s) gelten nicht als Stoß.

**Zielhilfe:** dezente Ziellinie, Geisterkugel an der voraussichtlichen Kontaktposition (berücksichtigt den Kugelradius),
markierter Kontaktpunkt. Rote Geisterkugel = zuerst getroffene Kugel wäre nicht erlaubt, orange = die Weiße liefe direkt in eine Tasche.
Im Training zusätzlich kurze Vorschau der Laufrichtungen von Objektkugel und Weißer (abschaltbar in den Einstellungen).

## Verwendetes Freizeit-Regelwerk (8-Ball, vereinfacht)

> Dies ist ein **bewusst vereinfachtes Freizeit-Regelwerk** und **nicht** das vollständige offizielle Turnierregelwerk.

**Grundsätzliches**
- Ein Spieler spielt die vollen Kugeln 1–7, der andere die halben (gestreiften) Kugeln 9–15.
- Die schwarze 8 darf erst gespielt werden, wenn die eigene Gruppe **zu Beginn des Stoßes** vollständig versenkt ist.
- Taschen müssen nicht angesagt werden.

**Aufbau und Anstoß**
- Dreieck mit der 8 in der Mitte; in den hinteren Ecken je eine volle und eine halbe Kugel; übrige Kugeln gemischt.
- Der Anstoß erfolgt aus dem Anstoßraum (hinter der Kopflinie). Nach dem Anstoß ist der Tisch offen.
- Wird beim Anstoß regelkonform mindestens eine Objektkugel versenkt, bleibt der Spieler am Zug, sonst wechselt der Zug.
- Fällt die 8 beim Anstoß, wird sie auf den Fußpunkt (bzw. die nächste freie Position dahinter) zurückgesetzt – weder Sieg noch Niederlage.
- Weiße versenkt oder keine Objektkugel getroffen beim Anstoß → der Gegner erhält Ball in Hand.
- Keine Mindestanzahl an Bandenkontakten beim Anstoß.

**Gruppenzuordnung**
- Außerhalb des Anstoßes nach einem foulfreien Stoß, bei dem ausschließlich Kugeln **einer** Gruppe versenkt wurden.
- Fallen bei offenem Tisch Kugeln beider Gruppen, bleibt der Tisch offen; der Spieler spielt nach einem foulfreien Stoß weiter.
- Bei offenem Tisch darf zuerst jede Objektkugel außer der 8 getroffen werden.

**Spielerwechsel**
- Wer ohne Foul mindestens eine eigene Kugel versenkt, spielt weiter; sonst wechselt der Zug.
- Versenkte gegnerische Kugeln bleiben versenkt, berechtigen aber allein nicht zum Weiterspielen.
- Ein Foul hat immer Vorrang vor dem Anspruch auf einen weiteren Stoß.

**Fouls** → der Gegner erhält *Ball in Hand* (Weiße frei auf dem Tisch platzierbar; keine Überschneidung mit Kugeln, nicht außerhalb der Spielfläche oder in einer Tasche; Vorschau zeigt Gültigkeit).
- Die Weiße wird versenkt.
- Die Weiße trifft keine Objektkugel.
- Bei festgelegten Gruppen (sowie bei offenem Tisch die 8) wird zuerst eine nicht erlaubte Kugel getroffen.
- Außerhalb des Anstoßes wird nach dem ersten Objektkugelkontakt weder eine Objektkugel versenkt noch eine Bande von irgendeiner Kugel berührt.

**Schwarze 8**
- Außerhalb des Anstoßes zu früh versenkt → verloren.
- Zusammen mit einem Foul versenkt → verloren.
- Nach vollständig abgeräumter eigener Gruppe ohne Foul versenkt → gewonnen.

**Festgelegte Detailentscheidungen (Annahmen, wo die Vorgabe offen war)**
- Eine beim Anstoß versenkte 8 zählt als versenkte Objektkugel – der Anstoßende bleibt ohne Foul am Zug (angelehnt an WPA).
- Trifft die Weiße bei offenem Tisch zuerst die 8, ist das ein Foul („falsche Kugel zuerst“).
- Bei einer Revanche wechselt das Anstoßrecht.

## Test- und Buildbefehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run dev` | Entwicklungsserver (http://localhost:5173) |
| `npm run typecheck` | TypeScript-Prüfung ohne Ausgabe (`tsc --noEmit`) |
| `npm test` | Automatisierte Tests (Vitest) |
| `npm run build` | Typprüfung + Produktionsbuild nach `dist/` |
| `npm run preview` | Produktionsbuild lokal ausliefern (http://localhost:4173) |

Optional (nicht Teil von `npm test`): Browser-Smoke-Test mit Playwright, falls installiert –
`npm run preview` starten und `node scripts/smoke-test.mjs http://localhost:4173 tmp/smoke` ausführen.

**Abgedeckte Tests** (`tests/`): gerader Kugelstoß und Impulsübertragung, schräger Stoß (90°-Regel), Anti-Tunneling bei
extremen Geschwindigkeiten, Bandenabprall, Ausrollen durch Reibung, Bildraten-Unabhängigkeit, Begrenzung aufgestauter Zeit,
Anstoß-Stabilität (keine Überlappungen, alle Kugeln im Tisch), Taschenaufnahme aller sechs Taschen ohne doppelte Ereignisse,
Sicherheitsnetz gegen verlorene Kugeln, Sperre eines zweiten Stoßes während der Bewegung, genau eine Auswertung pro Stoß,
Gruppenzuordnung, Spielerwechsel, alle Fouls und Ball in Hand, zu früh/korrekt versenkte 8, 8 beim Anstoß,
Platzierungsprüfung, Zielvorschau (Radius, Bande, Übereinstimmung mit der Physik), KI (nur erlaubte Ziele, Hindernisse,
Sicherheitsstoß, Ball in Hand, Fehlergrenzen, Vorausberechnung verändert den Tisch nicht), Dreieck-Aufbau.

## Technik und Architektur (Kurzfassung)

| Bereich | Ordner | Inhalt |
|---|---|---|
| Konfiguration | `src/config/` | Zentrale Parameter: Tischmaße, Kugelradius, Taschen, Reibung, Stoßzahlen, Stoßkraft, Zeitschritt |
| Physik | `src/physics/` | Eigene 2D-Billardphysik, fester Zeitschritt 1/240 s, ereignisgesteuerte kontinuierliche Kollisionserkennung, gleichzeitige Stöße im Dreieck |
| Spiellogik | `src/game/` | Zustandsautomat (`GameSession`), Regeln (`rules.ts`), Stoß-Aufzeichnung, Platzierung, Dreieck, einzige Stoßfunktion |
| Zielhilfe | `src/aim/` | Swept-Circle-Cast mit denselben Kollisionsfunktionen wie die Physik |
| KI | `src/ai/` | Kandidatensuche, Hinderniserkennung, Stärkewahl, Sicherheitsstoß, Ball in Hand |
| Darstellung | `src/render/` | Three.js-Szene, Tisch aus der Physikgeometrie, Kugeln, Queue, Kamera, Overlays |
| Eingaben | `src/input/` | Maus/Tastatur mit Guards |
| Oberfläche | `src/ui/` | Menüs, HUD, Meldungen (Deutsch) |
| Audio | `src/audio/` | Prozedurale Web-Audio-Sounds |
| Einstellungen | `src/storage/` | Lautstärke, Stumm, Hilfen (localStorage) |

Ausführlich: [`docs/architektur.md`](docs/architektur.md). Paketversionen sind in `package.json` exakt gepinnt und in `package-lock.json` festgehalten:
`three 0.186.0`, `@types/three 0.186.0`, `vite 7.3.6`, `vitest 5.0.1`, `typescript 5.9.3`.

## Bekannte Einschränkungen

- Keine Effet-, Sprung- oder Massé-Stöße; die Weiße wird immer mittig getroffen (bewusst, zugunsten einer stabilen Grundphysik).
- Vereinfachtes Rollmodell: Kugeln rollen ohne Gleitphase; Stöße Kugel–Kugel sind reibungsfrei (klassische 90°-Regel).
- Taschen sind vereinfacht modelliert (Fangkreis + Backen); „Rattern“ in der Tasche ist nur eingeschränkt nachgebildet.
- Die KI spielt kein Positionsspiel und plant keine Kombinationen/Banden-Lochstöße; „Mittel“ prüft Kandidaten per Vorausberechnung derselben Physik (ohne Sonderparameter), danach wird ein begrenzter Zielfehler addiert.
- Laufende Partien werden nicht gespeichert (nur Einstellungen).
- Keine Touch-Bedienung (Zielplattform: Maus und Tastatur).
- Im Software-Rendering (ohne GPU-Beschleunigung) läuft das Spiel sehr langsam; dann `?quality=low` verwenden bzw. Hardwarebeschleunigung aktivieren.

## Lizenz

MIT – siehe [`LICENSE`](LICENSE).
