import {
  executePlaceReserve, executeStackFromReserve,
  executeMoveExisting, executeRemoveBalls,
} from '../game/GameState'
import {
  getFreeSlots, getStackTargets, getMovableOwnBalls,
  getOwnBallsOnBoard, isInSupportingSquare, findSquares, isMonochromaticSquare,
} from '../game/Board'
import type { GameStateData, MoveIntent, BallColor } from '../game/types'

export type AiLevel = 'leicht' | 'mittel' | 'schwer'

/**
 * Alle legalen Züge der aktuellen Phase (strukturell legal, da aus
 * getAvailableMoves/Board-Funktionen abgeleitet — ADR adr-pylos-ki-architektur).
 */
export function enumerateMoves(state: GameStateData): MoveIntent[] {
  const moves: MoveIntent[] = []

  if (state.phase === 'remove_own_balls') {
    const color = state.players[state.currentPlayerIndex].color
    const balls = getOwnBallsOnBoard(state.board, color)
    for (const b of balls) moves.push({ type: 'remove', positions: [b] })
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        moves.push({ type: 'remove', positions: [balls[i], balls[j]] })
      }
    }
    return moves
  }

  if (state.phase !== 'select_ball') return moves

  const color = state.players[state.currentPlayerIndex].color

  if (state.players[state.currentPlayerIndex].reserve > 0) {
    for (const pos of getFreeSlots(state.board).filter(s => s.level === 0)) {
      moves.push({ type: 'place', pos })
    }
    for (const pos of getStackTargets(state.board)) {
      moves.push({ type: 'stack', pos })
    }
  }

  for (const from of getMovableOwnBalls(state.board, color)) {
    for (const to of getStackTargets(state.board)) {
      if (to.level > from.level && !isInSupportingSquare(from, to)) {
        moves.push({ type: 'move', from, to })
      }
    }
  }

  return moves
}

/**
 * Bewertung aus Sicht von `color` (+ = gut für color).
 * Gewichte siehe ADR adr-pylos-ki-architektur.
 */
export function evaluate(state: GameStateData, color: BallColor): number {
  if (state.phase === 'game_over') {
    if (state.winner === color) return 10_000
    if (state.winner !== null) return -10_000
  }

  const me = state.players.find(p => p.color === color)!
  const opp = state.players.find(p => p.color !== color)!
  let score = (me.reserve - opp.reserve) * 10

  for (let level = 0; level <= 2; level++) {
    const squares = findSquares(state.board, level)
    for (const sq of squares) {
      if (isMonochromaticSquare(state.board, level, sq.x, sq.y, color)) score += 5
      if (isMonochromaticSquare(state.board, level, sq.x, sq.y, opp.color)) score -= 5
    }
  }

  score += getOwnBallsOnBoard(state.board, color).length
  score -= getOwnBallsOnBoard(state.board, opp.color).length

  return score
}

/** Einfacher seedbarer RNG (mulberry32) für deterministische Tests. */
export function createRng(seed = 1): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Wählt einen Zug für die Stufe. `leicht` = zufälliger legaler Zug mit
 * leichter Quadrat-Präferenz (bewusst schwach); `mittel` = Greedy mit
 * Bewertungsfunktion (1 Halbzug, remove-Phase mitbewertet); `schwer`
 * folgt in #377.
 */
export function chooseMove(state: GameStateData, level: AiLevel, rng: () => number = createRng()): MoveIntent {
  const moves = enumerateMoves(state)
  if (moves.length === 0) throw new Error('keine legalen Züge')
  if (level === 'leicht') {
    if (rng() < 0.5) {
      const squareMoves = moves.filter(m => moveFormsSquare(state, m))
      if (squareMoves.length > 0) {
        return squareMoves[Math.floor(rng() * squareMoves.length)]
      }
    }
    return moves[Math.floor(rng() * moves.length)]
  }
  if (level === 'mittel') {
    return greedyBest(state, rng)
  }
  if (level === 'schwer') {
    return minimaxBest(state, rng)
  }
  throw new Error(`Stufe "${level}" noch nicht implementiert`)
}

/**
 * Greedy: wählt den Zug mit der besten Bewertung nach einem Halbzug.
 * Löst der Zug eine remove_own_balls-Phase aus, wird die beste Entfernung
 * mitbewertet. Gleichwertige Züge werden zufällig gestreut.
 */
export function greedyBest(state: GameStateData, rng: () => number): MoveIntent {
  const color = state.players[state.currentPlayerIndex].color
  const moves = enumerateMoves(state)
  let best = -Infinity
  let bestMoves: MoveIntent[] = []
  for (const m of moves) {
    const clone = cloneState(state)
    if (!applyMove(clone, m)) continue
    let score: number
    if (clone.phase === 'remove_own_balls') {
      let bestR = -Infinity
      for (const r of enumerateMoves(clone)) {
        const c2 = cloneState(clone)
        if (!applyMove(c2, r)) continue
        const s = evaluate(c2, color)
        if (s > bestR) bestR = s
      }
      score = bestR === -Infinity ? evaluate(clone, color) : bestR
    } else {
      score = evaluate(clone, color)
    }
    if (score > best) {
      best = score
      bestMoves = [m]
    } else if (score === best) {
      bestMoves.push(m)
    }
  }
  return bestMoves[Math.floor(rng() * bestMoves.length)]
}

/** Bildet der Zug ein Quadrat in eigener Farbe (löst remove_own_balls aus)? */
export function moveFormsSquare(state: GameStateData, move: MoveIntent): boolean {
  const clone = cloneState(state)
  if (!applyMove(clone, move)) return false
  return clone.phase === 'remove_own_balls'
}

// ── Stufe Schwer: Minimax mit Alpha-Beta (#377) ─────────────────────

const TIMEOUT = Symbol('timeout')

/** Zug-Sortierung für Cutoffs: remove/stack/move vor place. */
export function orderMoves(moves: MoveIntent[]): MoveIntent[] {
  const rank = (m: MoveIntent) => (m.type === 'remove' ? 0 : m.type === 'stack' ? 1 : m.type === 'move' ? 2 : 3)
  return [...moves].sort((a, b) => rank(a) - rank(b))
}

export interface MinimaxCtx {
  nodes: number
  start: number
  prune: boolean
  timeLimitMs: number
}

export function minimax(
  state: GameStateData,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  color: BallColor,
  ctx: MinimaxCtx,
): number {
  ctx.nodes++
  if (ctx.nodes % 512 === 0 && Date.now() - ctx.start > ctx.timeLimitMs) throw TIMEOUT
  if (depth === 0 || state.phase === 'game_over') return evaluate(state, color)

  const moves = orderMoves(enumerateMoves(state))
  let value = maximizing ? -Infinity : Infinity
  for (const m of moves) {
    const clone = cloneState(state)
    if (!applyMove(clone, m)) continue
    // remove_own_balls gehört weiter demselben Spieler → gleiches maximizing
    const samePlayer = clone.phase === 'remove_own_balls'
    const child = minimax(clone, depth - 1, alpha, beta, samePlayer ? maximizing : !maximizing, color, ctx)
    if (maximizing) {
      if (child > value) value = child
      if (ctx.prune && value > alpha) alpha = value
    } else {
      if (child < value) value = child
      if (ctx.prune && value < beta) beta = value
    }
    if (ctx.prune && beta <= alpha) break
  }
  if (value === Infinity || value === -Infinity) return evaluate(state, color)
  return value
}

/** Minimax auf Wurzel-Ebene: Tiefe 3 mit Fallback auf Tiefe 2 bei Zeitlimit. */
export function minimaxBest(state: GameStateData, rng: () => number, depth = 3, timeLimitMs = 1500): MoveIntent {
  const color = state.players[state.currentPlayerIndex].color
  const start = Date.now()
  let d = depth
  while (d >= 2) {
    const ctx: MinimaxCtx = { nodes: 0, start, prune: true, timeLimitMs }
    let best = -Infinity
    const bestMoves: MoveIntent[] = []
    try {
      for (const m of orderMoves(enumerateMoves(state))) {
        const clone = cloneState(state)
        if (!applyMove(clone, m)) continue
        const samePlayer = clone.phase === 'remove_own_balls'
        const score = minimax(clone, d - 1, -Infinity, Infinity, samePlayer ? true : false, color, ctx)
        if (score > best) {
          best = score
          bestMoves.length = 0
          bestMoves.push(m)
        } else if (score === best) {
          bestMoves.push(m)
        }
      }
      if (bestMoves.length > 0) {
        return bestMoves[Math.floor(rng() * bestMoves.length)]
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e
    }
    d--
  }
  return greedyBest(state, rng)
}

export function cloneState(state: GameStateData): GameStateData {
  return JSON.parse(JSON.stringify(state)) as GameStateData
}

export function applyMove(state: GameStateData, move: MoveIntent): boolean {
  switch (move.type) {
    case 'place': return move.pos ? executePlaceReserve(state, move.pos) : false
    case 'stack': return move.pos ? executeStackFromReserve(state, move.pos) : false
    case 'move': return move.from && move.to ? executeMoveExisting(state, move.from, move.to) : false
    case 'remove': return Array.isArray(move.positions) ? executeRemoveBalls(state, move.positions) : false
  }
}
