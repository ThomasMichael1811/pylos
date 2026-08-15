import { Slot, Ball, Position, getLevelSize, isValidPosition, BallColor } from './types'

export function createBoard(): Slot[][][] {
  const board: Slot[][][] = []
  for (let level = 0; level < 4; level++) {
    const size = getLevelSize(level)
    const grid: Slot[][] = []
    for (let y = 0; y < size; y++) {
      const row: Slot[] = []
      for (let x = 0; x < size; x++) {
        row.push({ position: { level, x, y }, ball: null })
      }
      grid.push(row)
    }
    board.push(grid)
  }
  return board
}

export function getSlot(board: Slot[][][], pos: Position): Slot | null {
  if (!isValidPosition(pos)) return null
  return board[pos.level][pos.y][pos.x] ?? null
}

export function isFree(board: Slot[][][], pos: Position): boolean {
  const slot = getSlot(board, pos)
  return slot !== null && slot.ball === null
}

export function getBall(board: Slot[][][], pos: Position): Ball | null {
  const slot = getSlot(board, pos)
  return slot?.ball ?? null
}

export function placeBall(board: Slot[][][], pos: Position, color: BallColor): boolean {
  const slot = getSlot(board, pos)
  if (!slot || slot.ball !== null) return false
  slot.ball = { color }
  return true
}

export function removeBall(board: Slot[][][], pos: Position): Ball | null {
  const slot = getSlot(board, pos)
  if (!slot || slot.ball === null) return null
  if (hasBallAbove(board, pos)) return null
  const ball = slot.ball
  slot.ball = null
  return ball
}

export function hasBallAbove(board: Slot[][][], pos: Position): boolean {
  const { level, x, y } = pos
  if (level >= 3) return false
  const aboveLevel = level + 1
  const aboveSize = getLevelSize(aboveLevel)
  for (const ax of [x - 1, x]) {
    for (const ay of [y - 1, y]) {
      if (ax < 0 || ax >= aboveSize || ay < 0 || ay >= aboveSize) continue
      const above = getSlot(board, { level: aboveLevel, x: ax, y: ay })
      if (above !== null && above.ball !== null) return true
    }
  }
  return false
}

export function findSquares(board: Slot[][][], level: number): { x: number; y: number }[] {
  const size = getLevelSize(level)
  const squares: { x: number; y: number }[] = []
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const balls = [
        getBall(board, { level, x, y }),
        getBall(board, { level, x: x + 1, y }),
        getBall(board, { level, x, y: y + 1 }),
        getBall(board, { level, x: x + 1, y: y + 1 }),
      ]
      if (balls.every(b => b !== null)) {
        squares.push({ x, y })
      }
    }
  }
  return squares
}

export function isMonochromaticSquare(board: Slot[][][], level: number, sx: number, sy: number, color: BallColor): boolean {
  const positions = [
    { level, x: sx, y: sy },
    { level, x: sx + 1, y: sy },
    { level, x: sx, y: sy + 1 },
    { level, x: sx + 1, y: sy + 1 },
  ]
  return positions.every(p => {
    const b = getBall(board, p)
    return b !== null && b.color === color
  })
}

export function getFreeSlots(board: Slot[][][]): Position[] {
  const free: Position[] = []
  for (let level = 0; level < 4; level++) {
    const size = getLevelSize(level)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFree(board, { level, x, y })) {
          free.push({ level, x, y })
        }
      }
    }
  }
  return free.sort((a, b) => a.level - b.level)
}

export function getStackTargets(board: Slot[][][]): Position[] {
  const targets: Position[] = []
  for (let level = 0; level < 3; level++) {
    const aboveLevel = level + 1
    const aboveSize = getLevelSize(aboveLevel)
    const squares = findSquares(board, level)
    for (const sq of squares) {
      const tx = sq.x
      const ty = sq.y
      if (tx >= 0 && tx < aboveSize && ty >= 0 && ty < aboveSize) {
        const target: Position = { level: aboveLevel, x: tx, y: ty }
        if (isFree(board, target)) {
          if (!targets.some(t => t.x === target.x && t.y === target.y && t.level === target.level)) {
            targets.push(target)
          }
        }
      }
    }
  }
  return targets
}

export function getOwnBallsOnBoard(board: Slot[][][], color: BallColor): Position[] {
  const balls: Position[] = []
  for (let level = 0; level < 4; level++) {
    const size = getLevelSize(level)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const b = getBall(board, { level, x, y })
        if (b !== null && b.color === color && !hasBallAbove(board, { level, x, y })) {
          balls.push({ level, x, y })
        }
      }
    }
  }
  return balls
}

export function isInSupportingSquare(pos: Position, target: Position): boolean {
  if (target.level <= pos.level) return false
  const below = target.level - 1
  return pos.level === below &&
    pos.x >= target.x && pos.x <= target.x + 1 &&
    pos.y >= target.y && pos.y <= target.y + 1
}

export function getMovableOwnBalls(board: Slot[][][], color: BallColor): Position[] {
  const stackTargets = getStackTargets(board)
  if (stackTargets.length === 0) return []

  const balls = getOwnBallsOnBoard(board, color)
  return balls.filter(pos => stackTargets.some(t =>
    t.level > pos.level && !isInSupportingSquare(pos, t)
  ))
}
