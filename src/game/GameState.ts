import {
  GameStateData, BallColor, Position, Player,
} from './types'
import {
  createBoard, getSlot, isFree, placeBall, removeBall, getFreeSlots,
  findSquares, getStackTargets, getMovableOwnBalls,
  isMonochromaticSquare, hasBallAbove,
} from './Board'

export function createInitialState(): GameStateData {
  return {
    board: createBoard(),
    players: [
      { color: 'light', reserve: 15 },
      { color: 'dark', reserve: 15 },
    ],
    currentPlayerIndex: 0,
    phase: 'select_ball',
    winner: null,
    gameOverReason: null,
    moveCount: 0,
  }
}

export function currentPlayer(state: GameStateData): Player {
  return state.players[state.currentPlayerIndex]
}

export function opponentColor(state: GameStateData): BallColor {
  return state.currentPlayerIndex === 0 ? 'dark' : 'light'
}

function switchPlayer(state: GameStateData): void {
  state.currentPlayerIndex = state.currentPlayerIndex === 0 ? 1 : 0
  state.phase = 'select_ball'
  if (currentPlayer(state).reserve <= 0) {
    state.winner = opponentColor(state)
    state.phase = 'game_over'
    state.gameOverReason = 'empty_reserve'
  }
}

function checkGameOver(state: GameStateData): boolean {
  const board = state.board
  const top = getSlot(board, { level: 3, x: 0, y: 0 })
  if (top && top.ball !== null) {
    state.winner = top.ball.color
    state.phase = 'game_over'
    state.gameOverReason = 'tip'
    return true
  }
  return false
}

export function canPlaceFromReserve(state: GameStateData): boolean {
  if (state.phase !== 'select_ball') return false
  const cp = currentPlayer(state)
  if (cp.reserve <= 0) return false
  const freeSlots = getFreeSlots(state.board).filter(s => s.level === 0)
  return freeSlots.length > 0
}

export type AvailableMove =
  | { type: 'place_from_reserve'; targets: Position[] }
  | { type: 'stack_from_reserve'; targets: Position[] }
  | { type: 'move_existing'; targets: Position[] }

export function getAvailableMoves(state: GameStateData): AvailableMove[] {
  const moves: AvailableMove[] = []

  if (state.phase !== 'select_ball') return []

  const cp = currentPlayer(state)

  const freeSlots = getFreeSlots(state.board)
  const stackTargets = getStackTargets(state.board)

  const lowestFree = freeSlots.length > 0 ? freeSlots[0].level : -1

  const placeTargets = (lowestFree === 0) ? freeSlots.filter(s => s.level === 0) : []

  if (cp.reserve > 0) {
    if (placeTargets.length > 0) {
      moves.push({ type: 'place_from_reserve', targets: placeTargets })
    }

    const freeStackTargets = stackTargets.filter(t => isFree(state.board, t))
    if (freeStackTargets.length > 0) {
      const existingStack = moves.find(m => m.type === 'stack_from_reserve')
      if (existingStack) {
        existingStack.targets.push(...freeStackTargets)
      } else {
        moves.push({ type: 'stack_from_reserve', targets: freeStackTargets })
      }
    }
  }

  const movableBalls = getMovableOwnBalls(state.board, cp.color)
  if (movableBalls.length > 0) {
    const existingMove = moves.find(m => m.type === 'move_existing')
    if (existingMove) {
      existingMove.targets.push(...movableBalls)
    } else {
      moves.push({ type: 'move_existing', targets: movableBalls })
    }
  }

  return moves
}

export function executePlaceReserve(state: GameStateData, pos: Position): boolean {
  if (!canPlaceFromReserve(state)) return false
  const cp = currentPlayer(state)
  if (cp.reserve <= 0) return false
  if (!isFree(state.board, pos) || pos.level !== 0) return false

  placeBall(state.board, pos, cp.color)
  cp.reserve--
  state.moveCount++

  return afterPlace(state, pos)
}

export function executeStackFromReserve(state: GameStateData, pos: Position): boolean {
  if (state.phase !== 'select_ball') return false
  const cp = currentPlayer(state)
  if (cp.reserve <= 0) return false
  if (!isFree(state.board, pos) || pos.level < 1) return false

  const stackTargets = getStackTargets(state.board)
  const valid = stackTargets.some(t => t.x === pos.x && t.y === pos.y && t.level === pos.level)
  if (!valid) return false

  const belowLevel = pos.level - 1
  const sx = pos.x
  const sy = pos.y
  const belowSquare = findSquares(state.board, belowLevel)
  const validSquare = belowSquare.some(sq => sq.x === sx && sq.y === sy)
  if (!validSquare) return false

  placeBall(state.board, pos, cp.color)
  cp.reserve--
  state.moveCount++

  return afterPlace(state, pos)
}

export function executeMoveExisting(state: GameStateData, fromPos: Position, toPos: Position): boolean {
  if (state.phase !== 'select_ball') return false
  const cp = currentPlayer(state)
  const ball = getSlot(state.board, fromPos)?.ball
  if (!ball || ball.color !== cp.color) return false
  if (hasBallAbove(state.board, fromPos)) return false
  if (!isFree(state.board, toPos)) return false
  if (toPos.level <= fromPos.level) return false

  const stackTargets = getStackTargets(state.board)
  const valid = stackTargets.some(t => t.x === toPos.x && t.y === toPos.y && t.level === toPos.level)
  if (!valid) return false

  if (toPos.level !== fromPos.level + 1) return false

  removeBall(state.board, fromPos)
  placeBall(state.board, toPos, cp.color)
  state.moveCount++

  return afterPlace(state, toPos)
}

function afterPlace(state: GameStateData, pos: Position): boolean {
  if (checkGameOver(state)) return true

  const cpColor = currentPlayer(state).color
  const squares = findSquares(state.board, pos.level)
  for (const sq of squares) {
    if (isMonochromaticSquare(state.board, pos.level, sq.x, sq.y, cpColor)) {
      state.phase = 'remove_own_balls'
      return true
    }
  }

  switchPlayer(state)
  return true
}

export function executeRemoveBalls(state: GameStateData, positions: Position[]): boolean {
  if (state.phase !== 'remove_own_balls') return false
  if (positions.length < 0 || positions.length > 2) return false

  const cp = currentPlayer(state)
  for (const pos of positions) {
    const ball = getSlot(state.board, pos)?.ball
    if (!ball || ball.color !== cp.color) return false
    if (hasBallAbove(state.board, pos)) return false
  }

  for (const pos of positions) {
    removeBall(state.board, pos)
    cp.reserve++
  }

  switchPlayer(state)
  return true
}

export function skipRemoveBalls(state: GameStateData): boolean {
  if (state.phase !== 'remove_own_balls') return false
  switchPlayer(state)
  return true
}
