export const LEVEL_SIZE = [4, 3, 2, 1] as const

export type BallColor = 'light' | 'dark'

export interface Position {
  level: number
  x: number
  y: number
}

export interface Ball {
  color: BallColor
}

export interface Slot {
  position: Position
  ball: Ball | null
}

export interface Player {
  color: BallColor
  reserve: number
}

export type GamePhase =
  | 'select_ball'      
  | 'place_on_board'   
  | 'remove_own_balls' 
  | 'game_over'        

export interface GameStateData {
  board: Slot[][][]     
  players: [Player, Player]
  currentPlayerIndex: number
  phase: GamePhase
  winner: BallColor | null
  gameOverReason: 'tip' | 'empty_reserve' | null
  moveCount: number
}

export function getLevelSize(level: number): number {
  return LEVEL_SIZE[level] ?? 0
}

export function isValidPosition(pos: Position): boolean {
  const size = getLevelSize(pos.level)
  return pos.x >= 0 && pos.x < size && pos.y >= 0 && pos.y < size
}

export function otherColor(c: BallColor): BallColor {
  return c === 'light' ? 'dark' : 'light'
}

export interface MoveIntent {
  type: 'place' | 'stack' | 'move' | 'remove'
  pos?: Position
  from?: Position
  to?: Position
  positions?: Position[]
}
