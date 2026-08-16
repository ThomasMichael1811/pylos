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
  lightStreams: number
  darkStreams: number
  abortTimer?: ReturnType<typeof setTimeout>
}

export type JoinResult = { color: BallColor; ready: boolean } | { error: string }
export type MoveResult = { ok: true } | { error: string }
export type RoomEvent =
  | { type: 'state'; state: GameStateData }
  | { type: 'joined'; color: BallColor }
  | { type: 'rejoined'; color: BallColor }
  | { type: 'disconnected'; color: BallColor }
  | { type: 'aborted' }

export const RECONNECT_WINDOW_MS = 60_000

const rooms = new Map<string, Room>()
type Listener = (evt: RoomEvent) => void
const listeners = new Map<string, Set<Listener>>()

export function createRoom(): Room {
  const id = Math.random().toString(36).slice(2, 8)
  const room: Room = { id, state: createInitialState(), lightStreams: 0, darkStreams: 0 }
  rooms.set(id, room)
  listeners.set(id, new Set())
  return room
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id)
}

function broadcast(id: string, evt: RoomEvent): void {
  for (const cb of listeners.get(id) ?? []) cb(evt)
}

export function joinRoom(id: string, playerId: string): JoinResult {
  const room = rooms.get(id)
  if (!room) return { error: 'room not found' }
  if (room.light === playerId) return { color: 'light', ready: room.dark !== undefined }
  if (room.dark === playerId) return { color: 'dark', ready: true }
  if (!room.light) {
    room.light = playerId
    return { color: 'light', ready: false }
  }
  if (!room.dark) {
    room.dark = playerId
    broadcast(id, { type: 'joined', color: 'dark' })
    return { color: 'dark', ready: true }
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

  broadcast(id, { type: 'state', state: s })
  return { ok: true }
}

export function subscribe(id: string, cb: Listener): () => void {
  const set = listeners.get(id)
  if (!set) return () => {}
  set.add(cb)
  return () => set.delete(cb)
}

export function isPlayer(room: Room, playerId: string): BallColor | null {
  if (room.light === playerId) return 'light'
  if (room.dark === playerId) return 'dark'
  return null
}

export function setConnected(id: string, playerId: string, connected: boolean): void {
  const room = rooms.get(id)
  if (!room) return
  const color = isPlayer(room, playerId)
  if (!color) return

  if (connected) {
    if (room.abortTimer) {
      clearTimeout(room.abortTimer)
      room.abortTimer = undefined
    }
    if (color === 'light') {
      const was = room.lightStreams
      room.lightStreams = was + 1
      if (was === 0) broadcast(id, { type: 'rejoined', color })
    } else {
      const was = room.darkStreams
      room.darkStreams = was + 1
      if (was === 0) broadcast(id, { type: 'rejoined', color })
    }
    return
  }

  if (color === 'light') {
    if (room.lightStreams <= 0) return
    room.lightStreams--
    if (room.lightStreams === 0) broadcast(id, { type: 'disconnected', color })
  } else {
    if (room.darkStreams <= 0) return
    room.darkStreams--
    if (room.darkStreams === 0) broadcast(id, { type: 'disconnected', color })
  }
  if (room.lightStreams === 0 && room.darkStreams === 0) {
    room.abortTimer = setTimeout(() => {
      broadcast(id, { type: 'aborted' })
      rooms.delete(id)
      listeners.delete(id)
    }, RECONNECT_WINDOW_MS)
  }
}

export function resetRoomsForTests(): void {
  rooms.clear()
  listeners.clear()
}
