import {
  createInitialState, executePlaceReserve, executeStackFromReserve,
  executeMoveExisting, executeRemoveBalls,
} from '../game/GameState'
import type { GameStateData, Position, BallColor } from '../game/types'

export interface MoveIntent {
  type: 'place' | 'stack' | 'move' | 'remove'
  pos?: Position
  from?: Position
  to?: Position
  positions?: Position[]
}

export interface Room {
  id: string
  state: GameStateData
  light?: string
  dark?: string
}

export type JoinResult = { color: BallColor } | { error: string }
export type MoveResult = { ok: true } | { error: string }

const rooms = new Map<string, Room>()
type Listener = (state: GameStateData) => void
const listeners = new Map<string, Set<Listener>>()

export function createRoom(): Room {
  const id = Math.random().toString(36).slice(2, 8)
  const room: Room = { id, state: createInitialState() }
  rooms.set(id, room)
  listeners.set(id, new Set())
  return room
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id)
}

export function joinRoom(id: string, playerId: string): JoinResult {
  const room = rooms.get(id)
  if (!room) return { error: 'room not found' }
  if (!room.light) {
    room.light = playerId
    return { color: 'light' }
  }
  if (!room.dark) {
    room.dark = playerId
    return { color: 'dark' }
  }
  return { error: 'room full' }
}

export function applyMove(id: string, playerId: string, move: MoveIntent): MoveResult {
  const room = rooms.get(id)
  if (!room) return { error: 'room not found' }
  const s = room.state
  const color: BallColor | null =
    room.light === playerId ? 'light' : room.dark === playerId ? 'dark' : null
  if (!color) return { error: 'not a player' }
  if (color !== s.players[s.currentPlayerIndex].color) return { error: 'not your turn' }

  let ok = false
  switch (move.type) {
    case 'place':
      ok = move.pos ? executePlaceReserve(s, move.pos) : false
      break
    case 'stack':
      ok = move.pos ? executeStackFromReserve(s, move.pos) : false
      break
    case 'move':
      ok = move.from && move.to ? executeMoveExisting(s, move.from, move.to) : false
      break
    case 'remove':
      ok = Array.isArray(move.positions) ? executeRemoveBalls(s, move.positions) : false
      break
    default:
      return { error: 'unknown move type' }
  }

  if (!ok) return { error: 'invalid move' }

  for (const cb of listeners.get(id) ?? []) cb(s)
  return { ok: true }
}

export function subscribe(id: string, cb: Listener): () => void {
  const set = listeners.get(id)
  if (!set) return () => {}
  set.add(cb)
  return () => set.delete(cb)
}

export function resetRoomsForTests(): void {
  rooms.clear()
  listeners.clear()
}
