import { describe, it, expect } from 'vitest'
import { createInitialState } from '../game/GameState'
import { placeBall } from '../game/Board'
import {
  enumerateMoves, evaluate, chooseMove, createRng, cloneState, applyMove, moveFormsSquare,
} from './ai'
import type { GameStateData, Position } from '../game/types'

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

  it('mittel/schwer: noch nicht implementiert → Fehler', () => {
    const s = createInitialState()
    expect(() => chooseMove(s, 'mittel')).toThrow(/noch nicht implementiert/)
    expect(() => chooseMove(s, 'schwer')).toThrow(/noch nicht implementiert/)
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
})

function isOwnSupportingSquare(from: Position, to: Position): boolean {
  if (to.level <= from.level) return false
  const below = to.level - 1
  return from.level === below &&
    from.x >= to.x && from.x <= to.x + 1 &&
    from.y >= to.y && from.y <= to.y + 1
}
