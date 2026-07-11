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
  const ax = Math.floor(x / 2)
  const ay = Math.floor(y / 2)
  if (ax < 0 || ax >= aboveSize || ay < 0 || ay >= aboveSize) return false
  const above = getSlot(board, { level: aboveLevel, x: ax, y: ay })
  return above !== null && above.ball !== null
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
      const tx = Math.floor(sq.x / 2)
      const ty = Math.floor(sq.y / 2)
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

export function getMovableOwnBalls(board: Slot[][][], color: BallColor): Position[] {
  const stackTargets = getStackTargets(board)
  if (stackTargets.length === 0) return []

  const balls = getOwnBallsOnBoard(board, color)
  return balls.filter(pos => {
    const targetLevel = pos.level + 1
    if (targetLevel > 3) return false
    return stackTargets.some(t =>
      t.level === targetLevel &&
      t.x === Math.floor(pos.x / 2) &&
      t.y === Math.floor(pos.y / 2)
    )
  })
}
