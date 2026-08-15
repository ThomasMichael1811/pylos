import { describe, it, expect, beforeEach } from 'vitest'
import { createRoom, getRoom, joinRoom, applyMove, subscribe, resetRoomsForTests } from './store'
import type { MoveIntent } from './store'

const p = (level: number, x: number, y: number) => ({ level, x, y })

beforeEach(() => {
  resetRoomsForTests()
})

describe('Server-Store (#365)', () => {
  it('erstellt Raum, vergibt hell/dunkel nach Beitritt, lehnt dritten ab', () => {
    const room = createRoom()
    expect(joinRoom(room.id, 'a')).toEqual({ color: 'light' })
    expect(joinRoom(room.id, 'b')).toEqual({ color: 'dark' })
    expect(joinRoom(room.id, 'c')).toEqual({ error: 'room full' })
  })

  it('unbekannter Raum und Nicht-Spieler werden abgelehnt', () => {
    const room = createRoom()
    expect(applyMove('nope', 'a', { type: 'place', pos: p(0, 0, 0) })).toEqual({ error: 'room not found' })
    expect(applyMove(room.id, 'fremd', { type: 'place', pos: p(0, 0, 0) })).toEqual({ error: 'not a player' })
  })

  it('nur der Spieler am Zug darf ziehen (Turn-Enforcement)', () => {
    const room = createRoom()
    joinRoom(room.id, 'a')
    joinRoom(room.id, 'b')
    expect(applyMove(room.id, 'b', { type: 'place', pos: p(0, 0, 0) })).toEqual({ error: 'not your turn' })
    expect(applyMove(room.id, 'a', { type: 'place', pos: p(0, 0, 0) })).toEqual({ ok: true })
    expect(getRoom(room.id)?.state.players[0].reserve).toBe(14)
    expect(getRoom(room.id)?.state.currentPlayerIndex).toBe(1)
  })

  it('ungültiger Zug wird abgelehnt, Zustand unverändert', () => {
    const room = createRoom()
    joinRoom(room.id, 'a')
    joinRoom(room.id, 'b')
    expect(applyMove(room.id, 'a', { type: 'place', pos: p(0, 0, 0) })).toEqual({ ok: true })
    const before = JSON.stringify(room.state)
    expect(applyMove(room.id, 'b', { type: 'place', pos: p(0, 0, 0) })).toEqual({ error: 'invalid move' })
    expect(JSON.stringify(room.state)).toBe(before)
    expect(applyMove(room.id, 'b', { type: 'place', pos: p(1, 0, 0) })).toEqual({ error: 'invalid move' })
    expect(applyMove(room.id, 'b', { type: 'move', from: p(0, 0, 0), to: p(1, 0, 0) })).toEqual({ error: 'invalid move' })
  })

  it('zwei parallele Partien beeinflussen sich nicht', () => {
    const r1 = createRoom()
    const r2 = createRoom()
    joinRoom(r1.id, 'a1'); joinRoom(r1.id, 'b1')
    joinRoom(r2.id, 'a2'); joinRoom(r2.id, 'b2')
    expect(applyMove(r1.id, 'a1', { type: 'place', pos: p(0, 0, 0) })).toEqual({ ok: true })
    expect(applyMove(r2.id, 'a2', { type: 'place', pos: p(0, 3, 3) })).toEqual({ ok: true })
    expect(getRoom(r1.id)?.state.board[0][0][0].ball?.color).toBe('light')
    expect(getRoom(r1.id)?.state.board[0][3][3].ball).toBeNull()
    expect(getRoom(r2.id)?.state.board[0][0][0].ball).toBeNull()
    expect(getRoom(r2.id)?.state.board[0][3][3].ball?.color).toBe('light')
  })

  it('Subscriptions feuern bei Beitritt und Zügen, Unsubscribe stoppt', () => {
    const room = createRoom()
    joinRoom(room.id, 'a')
    const events: string[] = []
    const unsub = subscribe(room.id, (evt) => { events.push(evt.type) })
    joinRoom(room.id, 'b')
    expect(events).toEqual(['joined'])
    applyMove(room.id, 'a', { type: 'place', pos: p(0, 0, 0) })
    expect(events).toEqual(['joined', 'state'])
    unsub()
    applyMove(room.id, 'b', { type: 'place', pos: p(0, 1, 0) })
    expect(events).toEqual(['joined', 'state'])
  })

  it('komplette Partie: Farbquadrat → Entfernen-Phase → remove', () => {
    const room = createRoom()
    joinRoom(room.id, 'a'); joinRoom(room.id, 'b')
    const lightMoves: MoveIntent[] = [
      { type: 'place', pos: p(0, 0, 0) },
      { type: 'place', pos: p(0, 1, 0) },
      { type: 'place', pos: p(0, 0, 1) },
      { type: 'place', pos: p(0, 1, 1) },
    ]
    const darkMoves: MoveIntent[] = [
      { type: 'place', pos: p(0, 3, 3) },
      { type: 'place', pos: p(0, 3, 2) },
      { type: 'place', pos: p(0, 3, 1) },
    ]
    for (let i = 0; i < 4; i++) {
      expect(applyMove(room.id, 'a', lightMoves[i])).toEqual({ ok: true })
      if (i < 3) expect(applyMove(room.id, 'b', darkMoves[i])).toEqual({ ok: true })
    }
    expect(room.state.phase).toBe('remove_own_balls')
    const remove: MoveIntent = { type: 'remove', positions: [p(0, 0, 0)] }
    expect(applyMove(room.id, 'a', remove)).toEqual({ ok: true })
    expect(room.state.board[0][0][0].ball).toBeNull()
    expect(room.state.players[0].reserve).toBe(12)
  })
})
