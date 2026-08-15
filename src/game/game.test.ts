import { describe, it, expect } from 'vitest'
import {
  createInitialState, getAvailableMoves,
  executePlaceReserve, executeStackFromReserve, executeMoveExisting,
  executeRemoveBalls,
} from './GameState'
import { placeBall, getBall, getStackTargets } from './Board'
import type { Position } from './types'

const p = (level: number, x: number, y: number): Position => ({ level, x, y })

describe('Platzieren aus Reserve (#9)', () => {
  it('bietet initial alle 16 Ebene-0-Felder als Ziele an', () => {
    const s = createInitialState()
    const place = getAvailableMoves(s).find(m => m.type === 'place_from_reserve')
    expect(place?.targets.length).toBe(16)
    expect(place?.targets.every(t => t.level === 0)).toBe(true)
  })

  it('platziert Kugel, verringert Reserve, wechselt Spieler', () => {
    const s = createInitialState()
    expect(executePlaceReserve(s, p(0, 0, 0))).toBe(true)
    expect(getBall(s.board, p(0, 0, 0))?.color).toBe('light')
    expect(s.players[0].reserve).toBe(14)
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('lehnt belegtes Feld und höhere Ebene ab', () => {
    const s = createInitialState()
    executePlaceReserve(s, p(0, 0, 0))
    expect(executePlaceReserve(s, p(0, 0, 0))).toBe(false)
    expect(executePlaceReserve(s, p(1, 0, 0))).toBe(false)
    expect(s.players[0].reserve).toBe(14)
  })

  it('ohne Reserve kein Setzen', () => {
    const s = createInitialState()
    s.players[0].reserve = 0
    expect(executePlaceReserve(s, p(0, 0, 0))).toBe(false)
  })

  it('keine Platzierungsziele mehr, wenn Ebene 0 voll ist', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      expect(executePlaceReserve(s, p(0, x, y))).toBe(true)
    }
    const place = getAvailableMoves(s).find(m => m.type === 'place_from_reserve')
    expect(place).toBeUndefined()
  })
})

describe('Stapeln auf Quadrat (#10)', () => {
  function fillSquare(s: ReturnType<typeof createInitialState>, sx: number, sy: number) {
    placeBall(s.board, p(0, sx, sy), 'light')
    placeBall(s.board, p(0, sx + 1, sy), 'dark')
    placeBall(s.board, p(0, sx, sy + 1), 'dark')
    placeBall(s.board, p(0, sx + 1, sy + 1), 'light')
  }

  it('Quadrat (2,2) auf Ebene 0 → Stapelziel (1,2,2) (direkte Zuordnung)', () => {
    const s = createInitialState()
    fillSquare(s, 2, 2)
    expect(getStackTargets(s.board)).toContainEqual(p(1, 2, 2))
  })

  it('stapelt auf freies Stapelziel, Reserve sinkt', () => {
    const s = createInitialState()
    fillSquare(s, 0, 0)
    expect(executeStackFromReserve(s, p(1, 0, 0))).toBe(true)
    expect(getBall(s.board, p(1, 0, 0))?.color).toBe('light')
    expect(s.players[0].reserve).toBe(14)
  })

  it('Quadrat trägt nur eine Kugel', () => {
    const s = createInitialState()
    fillSquare(s, 0, 0)
    expect(executeStackFromReserve(s, p(1, 0, 0))).toBe(true)
    expect(getStackTargets(s.board)).not.toContainEqual(p(1, 0, 0))
    expect(executeStackFromReserve(s, p(1, 0, 0))).toBe(false)
  })

  it('ohne vollständiges Quadrat kein Stapeln', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    expect(executeStackFromReserve(s, p(1, 0, 0))).toBe(false)
  })

  it('Stapelregel ebenerweise bis zur Spitze', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) placeBall(s.board, p(0, x, y), 'light')
    expect(getStackTargets(s.board).length).toBe(9)
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) placeBall(s.board, p(1, x, y), 'light')
    expect(getStackTargets(s.board).length).toBe(4)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) placeBall(s.board, p(2, x, y), 'light')
    expect(getStackTargets(s.board)).toContainEqual(p(3, 0, 0))
  })
})

describe('Versetzen (#12, Constraints)', () => {
  it('versetzt unbedeckte eigene Kugel eine Ebene hoch, Reserve unverändert', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    placeBall(s.board, p(0, 1, 1), 'light')
    const reserveBefore = s.players[0].reserve
    const moves = getAvailableMoves(s)
    expect(moves.some(m =>
      m.type === 'move_existing' &&
      m.targets.some(t => t.level === 0 && t.x === 0 && t.y === 0)
    )).toBe(true)
    expect(executeMoveExisting(s, p(0, 0, 0), p(1, 0, 0))).toBe(true)
    expect(getBall(s.board, p(0, 0, 0))).toBeNull()
    expect(getBall(s.board, p(1, 0, 0))?.color).toBe('light')
    expect(s.players[0].reserve).toBe(reserveBefore)
  })

  it('lehnt bedeckte Kugel ab', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    placeBall(s.board, p(0, 1, 1), 'light')
    placeBall(s.board, p(1, 0, 0), 'light')
    expect(executeMoveExisting(s, p(0, 0, 0), p(1, 0, 0))).toBe(false)
  })

  it('lehnt Versetzen nach unten/gleich und auf Nicht-Quadrat ab', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    placeBall(s.board, p(0, 1, 1), 'light')
    expect(executeMoveExisting(s, p(0, 0, 0), p(0, 3, 3))).toBe(false)
    expect(executeMoveExisting(s, p(0, 0, 0), p(1, 2, 2))).toBe(false)
  })

  it('versetzt Kugel über mehrere Ebenen (PDF B 2)', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (x === 3 && y === 3) continue
      placeBall(s.board, p(0, x, y), 'dark')
    }
    placeBall(s.board, p(1, 0, 0), 'dark')
    placeBall(s.board, p(1, 1, 0), 'dark')
    placeBall(s.board, p(1, 0, 1), 'dark')
    placeBall(s.board, p(1, 1, 1), 'dark')
    placeBall(s.board, p(0, 3, 3), 'light')
    const reserveBefore = s.players[0].reserve
    expect(executeMoveExisting(s, p(0, 3, 3), p(2, 0, 0))).toBe(true)
    expect(getBall(s.board, p(0, 3, 3))).toBeNull()
    expect(getBall(s.board, p(2, 0, 0))?.color).toBe('light')
    expect(s.players[0].reserve).toBe(reserveBefore)
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('Bedeckt-Erkennung passt zur direkten Abbildung: Feld (2,2) deckt Zelle (2,2)', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'dark')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    placeBall(s.board, p(0, 1, 1), 'dark')
    placeBall(s.board, p(0, 2, 2), 'light')
    placeBall(s.board, p(0, 3, 2), 'dark')
    placeBall(s.board, p(0, 2, 3), 'dark')
    placeBall(s.board, p(0, 3, 3), 'dark')
    placeBall(s.board, p(1, 2, 2), 'dark')
    expect(executeMoveExisting(s, p(0, 2, 2), p(1, 0, 0))).toBe(false)
  })

  it('bedeckte Kugel wird nicht als versetzbar angeboten (#354)', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    placeBall(s.board, p(0, 1, 1), 'light')
    placeBall(s.board, p(1, 0, 0), 'dark')
    placeBall(s.board, p(0, 2, 2), 'light')
    placeBall(s.board, p(0, 3, 2), 'dark')
    placeBall(s.board, p(0, 2, 3), 'dark')
    placeBall(s.board, p(0, 3, 3), 'light')
    const moveExisting = getAvailableMoves(s).find(m => m.type === 'move_existing')
    expect(moveExisting).toBeDefined()
    expect(moveExisting?.targets.some(t => t.level === 0 && t.x === 0 && t.y === 0)).toBe(false)
    expect(moveExisting?.targets.some(t => t.level === 0 && t.x === 1 && t.y === 1)).toBe(false)
    expect(moveExisting?.targets.some(t => t.level === 0 && t.x === 2 && t.y === 2)).toBe(true)
    expect(moveExisting?.targets.some(t => t.level === 0 && t.x === 3 && t.y === 3)).toBe(true)
  })
})

describe('Farbquadrat entfernen (#11)', () => {
  it('einfarbiges Quadrat auf Ebene 0 löst remove_own_balls aus', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    expect(executePlaceReserve(s, p(0, 1, 1))).toBe(true)
    expect(s.phase).toBe('remove_own_balls')
    expect(s.currentPlayerIndex).toBe(0)
  })

  it('bestehendes Farbquadrat löst nichts aus, wenn woanders gesetzt wird (#357)', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    placeBall(s.board, p(0, 1, 1), 'light')
    expect(executePlaceReserve(s, p(0, 2, 2))).toBe(true)
    expect(s.phase).toBe('select_ball')
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('entfernt 1-2 eigene unbedeckte Kugeln, inkl. gerade gesetzter', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    executePlaceReserve(s, p(0, 1, 1))
    expect(s.phase).toBe('remove_own_balls')
    const reserveBefore = s.players[0].reserve
    expect(executeRemoveBalls(s, [p(0, 1, 1), p(0, 0, 0)])).toBe(true)
    expect(getBall(s.board, p(0, 1, 1))).toBeNull()
    expect(getBall(s.board, p(0, 0, 0))).toBeNull()
    expect(s.players[0].reserve).toBe(reserveBefore + 2)
    expect(s.currentPlayerIndex).toBe(1)
  })

  it('mehrere Farbquadrate durch einen Zug → trotzdem max. 2 Kugeln', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (x === 2 && y === 2) continue
      placeBall(s.board, p(0, x, y), 'light')
    }
    expect(executePlaceReserve(s, p(0, 2, 2))).toBe(true)
    expect(s.phase).toBe('remove_own_balls')
    expect(executeRemoveBalls(s, [p(0, 0, 0), p(0, 1, 0), p(0, 0, 1)])).toBe(false)
  })

  it('lehnt bedeckte Kugel ab (Guard #354)', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'dark')
    placeBall(s.board, p(0, 0, 1), 'dark')
    placeBall(s.board, p(0, 1, 1), 'light')
    placeBall(s.board, p(1, 0, 0), 'dark')
    s.phase = 'remove_own_balls'
    expect(executeRemoveBalls(s, [p(0, 0, 0)])).toBe(false)
  })

  it('lehnt gegnerische Kugel ab', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    executePlaceReserve(s, p(0, 1, 1))
    placeBall(s.board, p(0, 3, 3), 'dark')
    expect(executeRemoveBalls(s, [p(0, 3, 3)])).toBe(false)
  })

  // Entscheidung kb_user (2026-08-15): Es MUSS mindestens 1 Kugel genommen
  // werden, maximal 2. 0 ist nicht erlaubt — Überspringen existiert nicht.
  it('0 Kugeln entfernen ist nicht erlaubt', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    executePlaceReserve(s, p(0, 1, 1))
    expect(s.phase).toBe('remove_own_balls')
    expect(executeRemoveBalls(s, [])).toBe(false)
    expect(s.phase).toBe('remove_own_balls')
  })
})

describe('Neues Spiel (#352)', () => {
  it('createInitialState liefert sauberen Startzustand (Reset-Basis)', () => {
    const s = createInitialState()
    expect(s.phase).toBe('select_ball')
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.players[0].reserve).toBe(15)
    expect(s.players[1].reserve).toBe(15)
    expect(s.winner).toBeNull()
    expect(s.gameOverReason).toBeNull()
    expect(s.moveCount).toBe(0)
    for (let level = 0; level < 4; level++) {
      for (let y = 0; y < (level === 0 ? 4 : level === 1 ? 3 : level === 2 ? 2 : 1); y++) {
        for (let x = 0; x < (level === 0 ? 4 : level === 1 ? 3 : level === 2 ? 2 : 1); x++) {
          expect(getBall(s.board, p(level, x, y))).toBeNull()
        }
      }
    }
    const place = getAvailableMoves(s).find(m => m.type === 'place_from_reserve')
    expect(place?.targets.length).toBe(16)
  })

  it('nach Reset: erster Zug platziert helle Kugel', () => {
    const s = createInitialState()
    expect(s.currentPlayerIndex).toBe(0)
    expect(executePlaceReserve(s, p(0, 0, 0))).toBe(true)
    expect(getBall(s.board, p(0, 0, 0))?.color).toBe('light')
  })
})

describe('Spielende (#351)', () => {
  it('Spitze belegt → tip-Sieg für aktuellen Spieler', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) placeBall(s.board, p(0, x, y), 'dark')
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) placeBall(s.board, p(1, x, y), 'dark')
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) placeBall(s.board, p(2, x, y), 'dark')
    expect(executeStackFromReserve(s, p(3, 0, 0))).toBe(true)
    expect(s.phase).toBe('game_over')
    expect(s.winner).toBe('light')
    expect(s.gameOverReason).toBe('tip')
  })

  it('leere Reserve am Zuganfang → empty_reserve-Niederlage', () => {
    const s = createInitialState()
    s.players[0].reserve = 0
    s.currentPlayerIndex = 1
    expect(executePlaceReserve(s, p(0, 0, 0))).toBe(true)
    expect(s.phase).toBe('game_over')
    expect(s.winner).toBe('dark')
    expect(s.gameOverReason).toBe('empty_reserve')
  })

  it('nach game_over keine Züge mehr', () => {
    const s = createInitialState()
    s.phase = 'game_over'
    expect(executePlaceReserve(s, p(0, 0, 0))).toBe(false)
    expect(executeStackFromReserve(s, p(1, 0, 0))).toBe(false)
    expect(executeMoveExisting(s, p(0, 0, 0), p(1, 0, 0))).toBe(false)
    expect(executeRemoveBalls(s, [p(0, 0, 0)])).toBe(false)
    expect(getAvailableMoves(s)).toEqual([])
  })
})
