import {
  createInitialState, currentPlayer, getAvailableMoves,
  executePlaceReserve, executeStackFromReserve,
  executeMoveExisting, executeRemoveBalls, autoRemoveTriggered,
} from './game/GameState'
import { Position } from './game/types'
import { getStackTargets, getOwnBallsOnBoard } from './game/Board'
import { PylosRenderer, GameEvent } from './renderer/PylosRenderer'

let state = createInitialState()
let selectedBall: Position | null = null
let removeSelection: Position[] = []

const renderer = new PylosRenderer(document.getElementById('canvas-container')!)

function updateUI() {
  const pLight = state.players[0]
  const pDark = state.players[1]

  document.getElementById('reserve-light')!.textContent = String(pLight.reserve)
  document.getElementById('reserve-dark')!.textContent = String(pDark.reserve)

  const lightCard = document.getElementById('player-light')!
  const darkCard = document.getElementById('player-dark')!
  lightCard.classList.toggle('active', state.currentPlayerIndex === 0)
  darkCard.classList.toggle('active', state.currentPlayerIndex === 1)

  const turnText = document.getElementById('turn-indicator')!
  const statusText = document.getElementById('game-status')!
  const moveOptions = document.getElementById('move-options')!

  if (state.phase === 'game_over' && state.winner) {
    const winnerName = state.winner === 'light' ? 'Hell' : 'Dunkel'
    turnText.textContent = `${winnerName} hat gewonnen!`
    moveOptions.innerHTML = ''
    statusText.innerHTML = '<button id="new-game-btn">Neues Spiel</button>'
    document.getElementById('new-game-btn')?.addEventListener('click', resetGame)
    return
  }

  const cpName = state.currentPlayerIndex === 0 ? 'Hell' : 'Dunkel'

  switch (state.phase) {
    case 'select_ball':
      turnText.textContent = `${cpName} ist am Zug`
      statusText.textContent = 'Klicke auf ein blaues Feld oder ziehe eine Kugel aus der Reserve'
      moveOptions.innerHTML = ''
      break
    case 'remove_own_balls':
      turnText.textContent = 'Du hast ein Quadrat in deiner Farbe gebildet!'
      statusText.textContent = `Pflicht: Entferne 1 oder 2 deiner Kugeln. Klicke mit der Maus auf eine rot markierte Kugel, dann auf „Entfernen". Ausgewählt: ${removeSelection.length}/2`
      moveOptions.innerHTML = `
        <button id="remove-confirm-btn" ${removeSelection.length === 0 ? 'disabled' : ''}>
          ${removeSelection.length} Kugel${removeSelection.length !== 1 ? 'n' : ''} entfernen
        </button>
      `
      document.getElementById('remove-confirm-btn')?.addEventListener('click', () => {
        executeRemoveBalls(state, removeSelection)
        removeSelection = []
        renderer.updateState(state)
        updateUI()
      })
      break
  }
}

function resetGame() {
  state = createInitialState()
  selectedBall = null
  removeSelection = []
  renderer.updateState(state)
  updateUI()
}

function handleEvent(evt: GameEvent) {
  if (state.phase === 'game_over') return

  switch (evt.type) {
    case 'drag_remove': {
      if (state.phase !== 'remove_own_balls') return
      const board = state.board
      const cp = currentPlayer(state)
      const slot = board[evt.pos.level]?.[evt.pos.y]?.[evt.pos.x]
      if (!slot?.ball || slot.ball.color !== cp.color) return

      const idx = removeSelection.findIndex(p =>
        p.x === evt.pos.x && p.y === evt.pos.y && p.level === evt.pos.level
      )
      if (idx >= 0) {
        removeSelection.splice(idx, 1)
      } else if (removeSelection.length < 2) {
        removeSelection.push(evt.pos)
      }

      const removable = getOwnBallsOnBoard(board, cp.color).length
      if (autoRemoveTriggered(removeSelection.length, removable)) {
        executeRemoveBalls(state, removeSelection)
        removeSelection = []
      }
      renderer.updateState(state, removeSelection)
      updateUI()
      return
    }

    case 'click_remove_toggle': {
      const board = state.board
      const cp = currentPlayer(state)
      const slot = board[evt.pos.level]?.[evt.pos.y]?.[evt.pos.x]
      if (!slot?.ball || slot.ball.color !== cp.color) return

      const idx = removeSelection.findIndex(p =>
        p.x === evt.pos.x && p.y === evt.pos.y && p.level === evt.pos.level
      )
      if (idx >= 0) {
        removeSelection.splice(idx, 1)
      } else if (removeSelection.length < 2) {
        removeSelection.push(evt.pos)
      }
      renderer.updateState(state, removeSelection)
      updateUI()
      return
    }

    case 'click_ball':
    case 'drag_place': {
      if (state.phase !== 'select_ball') return

      const moves = getAvailableMoves(state)

      if (selectedBall && evt.type === 'click_ball') {
        const ball = selectedBall
        const isMovableSource = moves.some(m =>
          m.type === 'move_existing' &&
          m.targets.some(t => t.x === evt.pos.x && t.y === evt.pos.y && t.level === evt.pos.level)
        )
        if (isMovableSource) {
          selectedBall = evt.pos
          renderer.updateState(state, [], selectedBall)
          updateUI()
          return
        }
        const isMoveTarget = getStackTargets(state.board).some(t =>
          t.x === evt.pos.x && t.y === evt.pos.y && t.level === evt.pos.level &&
          t.level > ball.level
        )
        if (isMoveTarget) {
          executeMoveExisting(state, ball, evt.pos)
          selectedBall = null
          renderer.updateState(state)
          updateUI()
          return
        }
      }

      const isPlace = moves.some(m =>
        m.type === 'place_from_reserve' &&
        m.targets.some(t => t.x === evt.pos.x && t.y === evt.pos.y && t.level === evt.pos.level)
      )
      const isStack = moves.some(m =>
        m.type === 'stack_from_reserve' &&
        m.targets.some(t => t.x === evt.pos.x && t.y === evt.pos.y && t.level === evt.pos.level)
      )

      if (isPlace) {
        executePlaceReserve(state, evt.pos)
        selectedBall = null
        renderer.updateState(state)
        updateUI()
        return
      }

      if (isStack) {
        executeStackFromReserve(state, evt.pos)
        selectedBall = null
        renderer.updateState(state)
        updateUI()
        return
      }

      const isMovableSource = moves.some(m =>
        m.type === 'move_existing' &&
        m.targets.some(t => t.x === evt.pos.x && t.y === evt.pos.y && t.level === evt.pos.level)
      )

      if (isMovableSource && evt.type === 'click_ball') {
        selectedBall = evt.pos
        renderer.updateState(state, [], selectedBall)
        updateUI()
        return
      }

      if (selectedBall && evt.type === 'click_ball') {
        executeMoveExisting(state, selectedBall, evt.pos)
        selectedBall = null
        renderer.updateState(state)
        updateUI()
        return
      }

      selectedBall = null
      renderer.updateState(state)
      updateUI()
      return
    }
  }
}

renderer.setOnEvent(handleEvent)
renderer.updateState(state)
updateUI()
renderer.start()
