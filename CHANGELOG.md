# Änderungsprotokoll

Alle nennenswerten Änderungen an Pool Lounge 3D. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen nach [Semantic Versioning](https://semver.org/lang/de/).

## [1.0.0] – 2026-09-23

Erste veröffentlichte Version.

### Spiel
- Drei Spielmodi: **Training**, **Zwei Spieler** (lokal), **Gegen Computer** (Einfach/Mittel).
- Vereinfachtes Freizeit-Regelwerk für 8-Ball: Anstoß, offener Tisch, Gruppenzuordnung, Fouls mit Ball in Hand,
  schwarze 8 (zu früh / mit Foul / korrekt), 8 beim Anstoß wird wieder eingesetzt.
- Eigene 2D-Billardphysik mit festem Zeitschritt und kontinuierlicher Kollisionserkennung (kein Durchtunneln),
  realistisches Aufbrechen des Dreiecks, offene Taschen mit Backen, Einsinkanimation.
- Computergegner: plant nur auf erlaubte Kugeln, erkennt Hindernisse, wählt die Stärke nach Entfernung,
  spielt Sicherheits- und Bandenstöße, löst Ball in Hand selbst.

### Darstellung und Bedienung
- 3D-Lounge mit petrolfarbenem Tisch, Holzrahmen, Diamanten, Lampe, weichen Schatten und dezenten Reflexionen.
- Nummerierte volle und halbe Kugeln mit bewegungstreuer Rotation, animierter Queue.
- Zielhilfe mit Geisterkugel und Kontaktpunkt; im Training zusätzlich Laufrichtungen.
- Maus-/Tastatursteuerung mit Schutz vor versehentlichen Stößen; Orbit-Kamera, Draufsicht (V), Reset (R).
- Deutsche Oberfläche: Hauptmenü, HUD, Meldungen, Stärkeanzeige, Pause, Ergebnis mit Revanche.
- Prozedurale Sounds (Web Audio), Lautstärke und Stummschaltung, Einstellungen werden lokal gespeichert.

### Projekt
- TypeScript, Three.js 0.186.0, Vite 7.3.6, Vitest 5.0.1 – exakt gepinnt.
- 80 automatisierte Tests (Physik, Taschen, Regeln, Zustandsautomat, Zielvorschau, KI, Texte).
- Deutsche README, bebilderte [Spielanleitung](docs/spielanleitung.md), Architektur- und Projektdokumentation.
- Automatische Veröffentlichung über GitHub Pages.
