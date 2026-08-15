# AGENTS.md — Pylos

## Git-Regeln

- Nach abgeschlossener Arbeit direkt committen (`git add` + `git commit`) — ohne Rückfrage.
- Immer ohne GPG-Signatur committen: `git commit --no-gpg-sign`.
- Conventional Commits, Subject-Zeile ≤ 50 Zeichen.
- Kein `git push` ohne ausdrückliche Aufforderung.

## Tests

- Bei jeder Umsetzung `npm test` ausführen; Ergebnis (echter Output) im Ticket-Kommentar belegen.
- Coverage: `npm run test:coverage` — Schwellwert ≥ 50 % Line-Coverage auf `src/game/**` (Regelkern). Renderer/UI werden per Browser-Sichtprüfung verifiziert.
- Jede Ticket-Umsetzung liefert Tests mit (AC „Tests beigefügt").

## Regeln-Quelle

- `PYLOS-REGELN.txt` ist die verbindliche Textfassung der offiziellen Regeln
  (inkl. Bildbeschreibungen). `PYLOS.md` enthält OCR-Fehler.
