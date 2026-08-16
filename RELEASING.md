# Releases & Release Notes

So veröffentlichst du eine neue Version (Tag + Release Notes) — Schritt für Schritt.

## 1. Sicherstellen, dass alles grün ist

```bash
npm test
npm run build
npm run test:e2e   # optional, dauert länger
```

## 2. Release Notes generieren

```bash
npm run release:notes
```

Sammelt alle Commits seit dem letzten Tag und gruppiert sie nach
Conventional-Commits-Prefixen (feat/fix/docs/chore/test) als Markdown.
Ausgabe in die Zwischenablage/Datei kopieren:

```bash
npm run release:notes > /tmp/notes.md
```

## 3. Tag anlegen

Konvention: `vX.Y.Z` (semantisch: X = Breaking, Y = Features, Z = Fixes).
Annotierter Tag (hat Message, Datum, Autor):

```bash
git tag -a v3.0 -m "Pylos 3.0 — <Kurzbeschreibung>"
```

## 4. GitHub Release erstellen

**Mit `gh` (falls installiert und angemeldet):**

```bash
git push origin v3.0
gh release create v3.0 --notes-file /tmp/notes.md --title "Pylos 3.0"
# alternativ automatisch aus Commits:
gh release create v3.0 --generate-notes
```

**Per Web-UI:**
1. `git push origin v3.0`
2. GitHub → Repo → „Releases" → „Draft a new release"
3. Tag `v3.0` wählen, Titel setzen, Inhalt aus `/tmp/notes.md` einfügen
4. „Publish release"

## Konventionen

- Release Notes immer aus `npm run release:notes` — nie von Hand raten.
- Commits nutzen Conventional Commits (siehe AGENTS.md) → Gruppierung stimmt automatisch.
- Tags NICHT neu setzen, wenn bereits gepusht (Git-Historie bleibt unverändert).

## Automatisierung

Zwei Automatismen erledigen die meiste Arbeit:

**1. Lokaler Git-Hook (Tag → Notes-Datei)**

```bash
npm run hooks:install    # einmalig: core.hooksPath = .githooks
```

Ab dann erzeugt jeder neue `v*`-Tag automatisch `RELEASE_NOTES.md`
(gitignored) mit den gruppierten Notizen — Hook: `.githooks/reference-transaction`.

**2. GitHub Action (Tag-Push → Release)**

Beim Push eines `v*`-Tags erstellt der Workflow `.github/workflows/release.yml`
automatisch ein GitHub Release mit `--generate-notes`.

Ablauf künftig: `git tag -a vX.Y.Z -m "…"` → Hook erzeugt Notes → `git push
origin vX.Y.Z` → GitHub Action veröffentlicht das Release. Fertig.
