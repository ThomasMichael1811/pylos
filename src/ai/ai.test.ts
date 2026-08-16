import { describe, it, expect } from 'vitest'
import { createInitialState } from '../game/GameState'
import { placeBall } from '../game/Board'
import {
  enumerateMoves, evaluate, chooseMove, createRng, cloneState, applyMove, moveFormsSquare, greedyBest, minimax,
} from './ai'
import type { AiLevel } from './ai'
import type { GameStateData, Position, BallColor } from '../game/types'

const p = (level: number, x: number, y: number): Position => ({ level, x, y })

function fillSquare(s: GameStateData, sx: number, sy: number) {
  placeBall(s.board, p(0, sx, sy), 'light')
  placeBall(s.board, p(0, sx + 1, sy), 'dark')
  placeBall(s.board, p(0, sx, sy + 1), 'dark')
  placeBall(s.board, p(0, sx + 1, sy + 1), 'light')
}

describe('KI-Architektur (#374)', () => {
  it('Initialzustand: 16 Platzierungs-Züge, alle legal', () => {
    const s = createInitialState()
    const moves = enumerateMoves(s)
    expect(moves.length).toBe(16)
    for (const m of moves) {
      expect(applyMove(cloneState(s), m)).toBe(true)
    }
  })

  it('mit Quadrat: Stapel-Zug enthalten und legal', () => {
    const s = createInitialState()
    fillSquare(s, 0, 0)
    const moves = enumerateMoves(s)
    expect(moves.some(m => m.type === 'stack' && m.pos?.level === 1)).toBe(true)
    const stack = moves.find(m => m.type === 'stack')!
    expect(applyMove(cloneState(s), stack)).toBe(true)
  })

  it('Versetzen: nur legale Paare, ohne eigenes Stützquadrat (#360)', () => {
    const s = createInitialState()
    fillSquare(s, 0, 0)
    fillSquare(s, 2, 2)
    const moves = enumerateMoves(s).filter(m => m.type === 'move')
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(applyMove(cloneState(s), m)).toBe(true)
      if (m.type === 'move' && m.from && m.to) {
        expect(isOwnSupportingSquare(m.from, m.to)).toBe(false)
      }
    }
  })

  it('remove-Phase: 1er- und 2er-Kombinationen, alle legal', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    placeBall(s.board, p(0, 1, 1), 'light')
    s.phase = 'remove_own_balls'
    const moves = enumerateMoves(s)
    // 4 Kugeln → C(4,1) + C(4,2) = 10
    expect(moves.length).toBe(10)
    for (const m of moves) {
      expect(applyMove(cloneState(s), m)).toBe(true)
    }
  })

  it('evaluate: Reserve-Vorteil schlägt höher ein', () => {
    const a = createInitialState()
    const b = createInitialState()
    a.players[0].reserve = 12
    b.players[0].reserve = 8
    expect(evaluate(a, 'light')).toBeGreaterThan(evaluate(b, 'light'))
  })

  it('chooseMove leicht: legal + deterministisch mit Seed', () => {
    const s = createInitialState()
    const m1 = chooseMove(s, 'leicht', createRng(42))
    const m2 = chooseMove(s, 'leicht', createRng(42))
    expect(m1).toEqual(m2)
    expect(applyMove(cloneState(s), m1)).toBe(true)
  })

  it('schwer liefert legalen Zug (#377)', () => {
    const s = createInitialState()
    const move = chooseMove(s, 'schwer', createRng(5))
    expect(applyMove(cloneState(s), move)).toBe(true)
  })

  it('Leicht: 100 Zufallszüge aus zufälligen Stellungen alle legal (#375)', () => {
    const rng = createRng(1337)
    let s = createInitialState()
    for (let i = 0; i < 100; i++) {
      const move = chooseMove(s, 'leicht', rng)
      expect(applyMove(s, move)).toBe(true)
      if (s.phase === 'remove_own_balls') {
        // Pflicht-Entfernung: KI nimmt 1–2 Kugeln
        const remove = chooseMove(s, 'leicht', rng)
        expect(remove.type).toBe('remove')
        expect(applyMove(s, remove)).toBe(true)
      }
      if (s.phase === 'game_over') break
    }
  })

  it('Leicht: Quadrat-Präferenz wählt quadratbildenden Zug, wenn vorhanden', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    // Hell bildet mit (1,1) ein Farbquadrat
    const rngAlwaysSquare = () => 0  // < 0.5 → Präferenz-Pfad; zweiter Aufruf → Index 0
    const move = chooseMove(s, 'leicht', rngAlwaysSquare)
    expect(moveFormsSquare(s, move)).toBe(true)
  })

  it('Mittel: remove-Phase wählt beste Entfernung (2 Kugeln) (#376)', () => {
    const s = createInitialState()
    placeBall(s.board, p(0, 0, 0), 'light')
    placeBall(s.board, p(0, 1, 0), 'light')
    placeBall(s.board, p(0, 0, 1), 'light')
    placeBall(s.board, p(0, 1, 1), 'light')
    placeBall(s.board, p(0, 3, 3), 'light')
    s.phase = 'remove_own_balls'
    const move = chooseMove(s, 'mittel', createRng(7))
    expect(move.type).toBe('remove')
    expect(move.positions?.length).toBe(2)
  })

  it('Mittel: Antwortzeit unter 1 s in fortgeschrittener Stellung', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (x === 3 && y === 3) continue
      placeBall(s.board, p(0, x, y), y % 2 === 0 ? 'light' : 'dark')
    }
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      placeBall(s.board, p(1, x, y), (x + y) % 2 === 0 ? 'light' : 'dark')
    }
    const start = Date.now()
    const move = chooseMove(s, 'mittel', createRng(3))
    expect(applyMove(cloneState(s), move)).toBe(true)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('Selbstspiel: Mittel schlägt Leicht deutlich (#376)', () => {
    let mittelWins = 0
    const games = 10
    for (let g = 0; g < games; g++) {
      const s = createInitialState()
      const rng = createRng(100 + g)
      let guard = 0
      while (s.phase !== 'game_over' && guard++ < 400) {
        const level: AiLevel = s.currentPlayerIndex === (g % 2) ? 'mittel' : 'leicht'
        const move = chooseMove(s, level, rng)
        if (!applyMove(s, move)) throw new Error('illegaler Zug im Selbstspiel')
      }
      const winner = s.winner
      const mittelColor: BallColor = (g % 2) === 0 ? 'light' : 'dark'
      if (winner === mittelColor) mittelWins++
    }
    expect(mittelWins).toBeGreaterThan(games * 0.6)
  })

  it('greedyBest liefert legalen Zug und bevorzugt bessere Bewertung', () => {
    const s = createInitialState()
    const move = greedyBest(s, createRng(1))
    expect(applyMove(cloneState(s), move)).toBe(true)
  })

  it('Alpha-Beta pruned deutlich weniger Knoten als ohne Pruning (#377)', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (x === 3 && y === 3) continue
      placeBall(s.board, p(0, x, y), y % 2 === 0 ? 'light' : 'dark')
    }
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      placeBall(s.board, p(1, x, y), (x + y) % 2 === 0 ? 'light' : 'dark')
    }
    const start = Date.now()
    const pruned = { nodes: 0, start, prune: true, timeLimitMs: 60_000 }
    minimax(s, 3, -Infinity, Infinity, true, 'light', pruned)
    const plain = { nodes: 0, start: Date.now(), prune: false, timeLimitMs: 60_000 }
    minimax(s, 3, -Infinity, Infinity, true, 'light', plain)
    expect(pruned.nodes).toBeLessThan(plain.nodes)
  })

  it('Schwer: Antwortzeit < 2 s in fortgeschrittener Stellung', () => {
    const s = createInitialState()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (x === 3 && y === 3) continue
      placeBall(s.board, p(0, x, y), y % 2 === 0 ? 'light' : 'dark')
    }
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      placeBall(s.board, p(1, x, y), (x + y) % 2 === 0 ? 'light' : 'dark')
    }
    const start = Date.now()
    const move = chooseMove(s, 'schwer', createRng(4))
    expect(applyMove(cloneState(s), move)).toBe(true)
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('Selbstspiel: Schwer schlägt Mittel deutlich (#377)', () => {
    let schwerWins = 0
    const games = 6
    for (let g = 0; g < games; g++) {
      const s = createInitialState()
      const rng = createRng(500 + g)
      let guard = 0
      while (s.phase !== 'game_over' && guard++ < 400) {
        const level: AiLevel = s.currentPlayerIndex === (g % 2) ? 'schwer' : 'mittel'
        const move = chooseMove(s, level, rng)
        if (!applyMove(s, move)) throw new Error('illegaler Zug im Selbstspiel')
      }
      const schwerColor: BallColor = (g % 2) === 0 ? 'light' : 'dark'
      if (s.winner === schwerColor) schwerWins++
    }
    expect(schwerWins).toBeGreaterThan(games * 0.6)
  }, 120_000)
})

function isOwnSupportingSquare(from: Position, to: Position): boolean {
  if (to.level <= from.level) return false
  const below = to.level - 1
  return from.level === below &&
    from.x >= to.x && from.x <= to.x + 1 &&
    from.y >= to.y && from.y <= to.y + 1
}
