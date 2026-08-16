# Pylos

Rundenbasiertes Strategiespiel für zwei Personen im Browser. Zwei Spieler bauen aus 30 Kugeln eine Pyramide — wer die letzte Kugel auf die Spitze legt, gewinnt. Klassisches Denkspiel (Gigamic), hier als modernes Webspiel umgesetzt.

## Features

- **Vollständiges Regelwerk:** Setzen, Stapeln auf 2×2-Quadrate, Versetzen auf beliebige höhere Ebenen, Farbquadrat-Bonus (1–2 Kugeln zurück), Sieg per Spitze, Niederlage bei leerer Reserve, alle Zug-Guards (bedeckte Kugeln, Stützquadrat-Schutz).
- **Drei Spielmodi:**
  - Lokal (Hot-Seat) an einem Bildschirm
  - Online über Server (Lobby mit Raum-Link, SSE-Sync, Auto-Reconnect mit 60 s Fenster)
  - KI-Gegner in Stufen (geplant, Epic #372)
- **Komfortable Bedienung:** Klicks + Drag & Drop (Kugeln greifen, legen, stapeln, versetzen, entfernen), farbige Legende in der Sidebar, 2D/3D-Umschaltung.
- **Qualität:** Unit-Tests (Vitest, Coverage ≥ 50 % auf `src/game`, aktuell ~98 %), E2E-Suite (Playwright: Hot-Seat, Online, Reconnect).
- **Betrieb:** Ein kombinierter Docker-Container (Frontend + API + SSE), Helm-Chart für Kubernetes, lokal auf k3d testbar.

## Schnellstart

Voraussetzungen: Node.js ≥ 20, npm. Für Online-Spiel zusätzlich nichts — der Server läuft lokal.

```bash
npm install
npm run dev          # Frontend: http://localhost:5173/
npm run server       # Online-Server: http://localhost:8787/ (zweites Terminal)
```

Lokal spielen: Lobby → „Lokale Partie (Hot-Seat)". Online: Lobby → „Neue Partie erstellen" → Link an zweiten Spieler senden (zweiter Browser/Rechner).

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Vite-Dev-Server (Frontend) |
| `npm run build` | TypeScript-Check + Produktions-Build nach `dist/` |
| `npm run preview` | Produktions-Build lokal ansehen |
| `npm run server` | Online-Server (tsx, Port 8787, API + SSE; mit `STATIC_DIR` auch statisch) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:coverage` | Tests mit Coverage-Report (Threshold 50 % Lines auf `src/game/**`) |
| `npm run test:e2e` | E2E-Suite: startet Server + Vite selbst, Hot-Seat/Online/Reconnect |

## Spielregeln in Kürze

- Brett: 4×4-Grundplatte, darüber Ebenen 3×3, 2×2, Spitze. Je 15 helle und dunkle Kugeln.
- Am Zug: Kugel aus Reserve auf freies Feld (Ebene 0) ODER auf ein vollständiges 2×2-Quadrat stapeln ODER eigene unbedeckte Kugel auf ein höheres Quadrat versetzen (Reserve bleibt).
- Farbquadrat: Schließt ein Zug ein 2×2 in eigener Farbe, nimmt der Spieler sofort 1–2 eigene unbedeckte Kugeln zurück (Pflicht, mindestens 1).
- Ende: Spitze belegt → Sieg; wer am Zug keine Reserve-Kugel mehr hat, verliert.

**Verbindliche Quelle inkl. Bildbeschreibungen (barrierefrei):** [`PYLOS-REGELN.txt`](PYLOS-REGELN.txt). `PYLOS.md` enthält OCR-Fehler und ist nur historisch.

## Projektstruktur

```
src/
  game/           reine Regellogik — kein DOM/Three (Board, GameState, types)
  renderer/       Three.js-Darstellung + Pointer-/Drag-Interaktion
  server/         Online-Server: store (Räume, Validierung), server (HTTP+SSE)
  main.ts         Controller: UI-Events → Spielzüge → Renderer/UI, Lobby, Netz-Client
e2e/              Playwright-Suite + Runner (test:e2e)
deploy/pylos/     Helm-Chart (Deployment/Service/Ingress)
```

Die Spiellogik ist bewusst DOM-/Three-frei gehalten (Unit-Tests laufen in Node) und wird vom Online-Server 1:1 wiederverwendet — der Server ist autoritativ (Thin Client), siehe Knowledge-Base-ADR `adr-pylos-client-server-aufteilung`.

## Online-Architektur kurz

- Kommunikation: **SSE** (Server→Client) + **HTTP POST** (Züge), ADR `adr-pylos-kommunikation-sse-post`.
- API: `POST /api/games`, `POST /api/games/:id/join`, `POST /api/games/:id/move`, `GET /api/games/:id/events?player=…`, `GET /health`.
- Partien liegen **im Speicher** → Deployment mit genau **1 Replica** (sonst gehen Raum-Zuordnungen verloren). Restart = laufende Partien weg (akzeptiert, siehe DEPLOY.md).

## Docker & Kubernetes

```bash
docker build -t pylos:1.0 .
docker run -d --name pylos -p 8787:8787 pylos:1.0   # http://localhost:8787/
```

Kubernetes: Helm-Chart in `deploy/pylos`. Lokales k3d-Deployment (Cluster `gitops-playground`) inkl. Image-Import und Port-Forward: siehe [`DEPLOY.md`](DEPLOY.md). Produktiv-Ziel: Oracle Free Tier + k3s, siehe ADR `adr-pylos-hosting-evaluierung`.

## Entwicklung

- **Commits:** Conventional Commits, ohne GPG-Signatur (`git commit --no-gpg-sign`), kein Push ohne Aufforderung — siehe `AGENTS.md`.
- **Test-Policy:** Jede Umsetzung liefert Tests, `npm test` vor Abschluss, Ergebnis (echter Output) in den Ticket-Kommentar. Coverage-Schwelle 50 % Lines auf `src/game/**`.
- **Tickets:** kabai-Board, Projekt „PyrPylosmid" — Epic #7 Grundspiel (abgeschlossen), #361 Online-Modus, #372 KI-Gegner.
- **Wissen:** Knowledge-Base-Noten (ADRs zu Architektur, Kommunikation, Hosting; `pylos-architektur-regeln` als Übersicht).
- **Versionsstände:** Tags `v1.0` / `1.0` = Grundspiel fertig.

## Lizenz / Quellen

Spielkonzept: Pylos © Gigamic (Nach einem Konzept von David G. Royffe). Diese Implementierung ist ein privates Lern-/Hobbyprojekt; Regeln aus der offiziellen Anleitung (`pylos.pdf`), barrierefreie Fassung in `PYLOS-REGELN.txt`.
