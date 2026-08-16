import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoom, getRoom, joinRoom, applyMove, subscribe, setConnected, resetRoomsForTests } from './store'
import type { MoveIntent } from './store'

const p = (level: number, x: number, y: number) => ({ level, x, y })

beforeEach(() => {
  resetRoomsForTests()
})

describe('Server-Store (#365)', () => {
  it('erstellt Raum, vergibt hell/dunkel nach Beitritt, lehnt dritten ab', () => {
    const room = createRoom()
    expect(joinRoom(room.id, 'a')).toEqual({ color: 'light', ready: false })
    expect(joinRoom(room.id, 'b')).toEqual({ color: 'dark', ready: true })
    expect(joinRoom(room.id, 'c')).toEqual({ error: 'room full' })
  })

  it('Rejoin mit derselben playerId liefert dieselbe Farbe', () => {
    const room = createRoom()
    joinRoom(room.id, 'a')
    joinRoom(room.id, 'b')
    expect(joinRoom(room.id, 'a')).toEqual({ color: 'light', ready: true })
    expect(joinRoom(room.id, 'b')).toEqual({ color: 'dark', ready: true })
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

  it('Reconnect-Fenster: beide weg → Abbruch nach Timeout, Raum aufgeräumt (#368)', () => {
    vi.useFakeTimers()
    try {
      const room = createRoom()
      joinRoom(room.id, 'a'); joinRoom(room.id, 'b')
      const events: string[] = []
      subscribe(room.id, (evt) => events.push(evt.type))
      setConnected(room.id, 'a', true)
      setConnected(room.id, 'b', true)
      setConnected(room.id, 'b', false)
      expect(events).toContain('disconnected')
      setConnected(room.id, 'a', false)
      vi.advanceTimersByTime(60_000)
      expect(events).toContain('aborted')
      expect(getRoom(room.id)).toBeUndefined()
      expect(joinRoom(room.id, 'a')).toEqual({ error: 'room not found' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('Rejoin innerhalb Fenster verhindert Abbruch, meldet rejoined (#368)', () => {
    vi.useFakeTimers()
    try {
      const room = createRoom()
      joinRoom(room.id, 'a'); joinRoom(room.id, 'b')
      const events: string[] = []
      subscribe(room.id, (evt) => events.push(evt.type))
      setConnected(room.id, 'a', true)
      setConnected(room.id, 'b', true)
      setConnected(room.id, 'a', false)
      setConnected(room.id, 'b', false)
      vi.advanceTimersByTime(30_000)
      setConnected(room.id, 'a', true)
      expect(events).toContain('rejoined')
      vi.advanceTimersByTime(90_000)
      expect(events).not.toContain('aborted')
      expect(getRoom(room.id)).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('verspäteter Close alter Verbindung: nur EIN disconnected (#381-Race)', () => {
    const room = createRoom()
    joinRoom(room.id, 'a'); joinRoom(room.id, 'b')
    const events: string[] = []
    subscribe(room.id, (evt) => events.push(evt.type))
    setConnected(room.id, 'a', true)
    setConnected(room.id, 'b', true)   // alte Verbindung
    setConnected(room.id, 'b', true)   // neue Verbindung (vor altem Close)
    setConnected(room.id, 'b', false)  // verspäteter Close der alten
    setConnected(room.id, 'b', false)  // Close der neuen
    expect(events.filter(e => e === 'disconnected')).toHaveLength(1)
    expect(events.filter(e => e === 'rejoined')).toHaveLength(2)  // je 1x pro Spieler (Erstverbindung)
  })
})
