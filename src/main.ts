import {
  createInitialState, currentPlayer, getAvailableMoves,
  executePlaceReserve, executeStackFromReserve,
  executeMoveExisting, executeRemoveBalls, autoRemoveTriggered,
} from './game/GameState'
import { Position } from './game/types'
import { getStackTargets, getOwnBallsOnBoard } from './game/Board'
import { PylosRenderer, GameEvent } from './renderer/PylosRenderer'
import { chooseMove, applyMove } from './ai/ai'
import type { MoveIntent } from './server/store'

let state = createInitialState()
let selectedBall: Position | null = null
let removeSelection: Position[] = []
let onlineMode = false
let roomId: string | null = null
let eventSource: EventSource | null = null
let myColor: 'light' | 'dark' | null = null
let aiMode = false
let aiLevel: 'leicht' | 'mittel' | 'schwer' = 'leicht'

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
    if (aiMode) {
      statusText.innerHTML = `
        <select id="ai-level-re" aria-label="Neue KI-Stufe">
          <option value="leicht">Leicht</option>
          <option value="mittel">Mittel</option>
          <option value="schwer">Schwer</option>
        </select>
        <button id="new-ai-game-btn">Neues Spiel (KI)</button>
      `
      ;(document.getElementById('ai-level-re') as HTMLSelectElement).value = aiLevel
      document.getElementById('new-ai-game-btn')?.addEventListener('click', () => {
        aiLevel = (document.getElementById('ai-level-re') as HTMLSelectElement).value as 'leicht' | 'mittel' | 'schwer'
        resetGame()
        updateUI()
      })
    } else if (onlineMode) {
      statusText.textContent = 'Partie beendet.'
    } else {
      statusText.innerHTML = '<button id="new-game-btn">Neues Spiel</button>'
      document.getElementById('new-game-btn')?.addEventListener('click', resetGame)
    }
    return
  }

  const cpName = state.currentPlayerIndex === 0 ? 'Hell' : 'Dunkel'

  switch (state.phase) {
    case 'select_ball': {
      let turn = `${cpName} ist am Zug`
      let status = 'Klicke auf ein blaues Feld oder ziehe eine Kugel aus der Reserve'
      if (aiMode) {
        turn += ` — Gegner: KI (${aiLevel})`
        if (state.currentPlayerIndex === 1) {
          status = 'KI überlegt …'
        }
      }
      if (onlineMode && myColor) {
        turn += myTurn() ? ' — dein Zug' : ' — Gegner am Zug'
        status = myTurn() ? 'Du bist dran: Kugel setzen, stapeln oder versetzen' : 'Warte auf den Zug deines Gegners …'
      }
      turnText.textContent = turn
      statusText.textContent = status
      moveOptions.innerHTML = ''
      break
    }
    case 'remove_own_balls':
      turnText.textContent = 'Du hast ein Quadrat in deiner Farbe gebildet!'
      statusText.textContent = `Pflicht: Entferne 1 oder 2 deiner Kugeln. Klicke mit der Maus auf eine rot markierte Kugel, dann auf „Entfernen". Ausgewählt: ${removeSelection.length}/2`
      moveOptions.innerHTML = `
        <button id="remove-confirm-btn" ${removeSelection.length === 0 ? 'disabled' : ''}>
          ${removeSelection.length} Kugel${removeSelection.length !== 1 ? 'n' : ''} entfernen
        </button>
      `
      document.getElementById('remove-confirm-btn')?.addEventListener('click', () => {
        if (onlineMode) {
          sendMove({ type: 'remove', positions: [...removeSelection] })
        } else {
          executeRemoveBalls(state, removeSelection)
          renderer.updateState(state)
          updateUI()
          scheduleAi()
        }
        removeSelection = []
      })
      break
  }
}

function resetGame() {
  if (onlineMode) return
  state = createInitialState()
  selectedBall = null
  removeSelection = []
  renderer.updateState(state)
  updateUI()
}

function isAiTurn(): boolean {
  return aiMode && state.currentPlayerIndex === 1 && state.phase !== 'game_over'
}

function doAiMove() {
  if (!isAiTurn()) return
  let move
  try {
    move = chooseMove(state, aiLevel)
  } catch {
    move = chooseMove(state, 'leicht')
  }
  if (!applyMove(state, move)) {
    document.getElementById('game-status')!.textContent = 'KI-Zug ungültig (Bug!)'
    return
  }
  selectedBall = null
  removeSelection = []
  renderer.updateState(state)
  updateUI()
  if (isAiTurn()) {
    setTimeout(doAiMove, 500)
  }
}

function scheduleAi() {
  if (!isAiTurn()) return
  setTimeout(doAiMove, 600)
}

function handleEvent(evt: GameEvent) {
  if (state.phase === 'game_over') return
  if (onlineMode && !myTurn()) return
  if (isAiTurn()) return

  switch (evt.type) {
    case 'drag_move': {
      if (state.phase !== 'select_ball') return
      if (onlineMode) {
        sendMove({ type: 'move', from: evt.from, to: evt.to })
      } else {
        executeMoveExisting(state, evt.from, evt.to)
        renderer.updateState(state)
        updateUI()
        scheduleAi()
      }
      selectedBall = null
      return
    }

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
        if (onlineMode) {
          sendMove({ type: 'remove', positions: [...removeSelection] })
        } else {
          executeRemoveBalls(state, removeSelection)
          scheduleAi()
        }
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
          if (onlineMode) {
            sendMove({ type: 'move', from: ball, to: evt.pos })
          } else {
            executeMoveExisting(state, ball, evt.pos)
            renderer.updateState(state)
            updateUI()
            scheduleAi()
          }
          selectedBall = null
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
        if (onlineMode) {
          sendMove({ type: 'place', pos: evt.pos })
        } else {
          executePlaceReserve(state, evt.pos)
          renderer.updateState(state)
          updateUI()
          scheduleAi()
        }
        selectedBall = null
        return
      }

      if (isStack) {
        if (onlineMode) {
          sendMove({ type: 'stack', pos: evt.pos })
        } else {
          executeStackFromReserve(state, evt.pos)
          renderer.updateState(state)
          updateUI()
          scheduleAi()
        }
        selectedBall = null
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
        if (onlineMode) {
          sendMove({ type: 'move', from: selectedBall, to: evt.pos })
        } else {
          executeMoveExisting(state, selectedBall, evt.pos)
          renderer.updateState(state)
          updateUI()
          scheduleAi()
        }
        selectedBall = null
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
window.addEventListener('load', () => renderer.resize())

// ── Online-Modus (#366/#367) ────────────────────────────────────────
const API_BASE = import.meta.env.DEV ? 'http://localhost:8787' : ''
const lobbyEl = document.getElementById('lobby')!
const lobbyStatus = document.getElementById('lobby-status')!

const playerId = (() => {
  let id = localStorage.getItem('pylos-player')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('pylos-player', id)
  }
  return id
})()

function myTurn(): boolean {
  if (!onlineMode || !myColor) return false
  return state.players[state.currentPlayerIndex].color === myColor
}

function lobbyMessage(text: string) {
  lobbyStatus.textContent = text
}

function hideLobby() {
  lobbyEl.style.display = 'none'
}

function startOnlineGame() {
  onlineMode = true
  lobbyMessage('Beide Spieler da — Partie beginnt!')
  setTimeout(hideLobby, 800)
}

async function sendMove(move: MoveIntent) {
  if (!roomId) return
  try {
    const res = await fetch(`${API_BASE}/api/games/${roomId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, move }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err.error === 'not your turn' ? 'Warte — du bist nicht am Zug.' : 'Ungültiger Zug.'
      document.getElementById('game-status')!.textContent = msg
    }
  } catch {
    document.getElementById('game-status')!.textContent = 'Server nicht erreichbar.'
  }
}

function connectStream() {
  if (!roomId) return
  eventSource?.close()
  eventSource = new EventSource(`${API_BASE}/api/games/${roomId}/events?player=${playerId}`)
  eventSource.addEventListener('state', (e) => {
    state = JSON.parse((e as MessageEvent).data)
    renderer.updateState(state, removeSelection, selectedBall)
    updateUI()
  })
  eventSource.addEventListener('joined', () => {
    startOnlineGame()
  })
  eventSource.addEventListener('rejoined', () => {
    document.getElementById('game-status')!.textContent = 'Gegner ist wieder da.'
  })
  eventSource.addEventListener('disconnected', () => {
    document.getElementById('game-status')!.textContent = 'Gegner hat die Verbindung verloren — warte auf Rückkehr …'
  })
  eventSource.addEventListener('aborted', () => {
    onlineMode = false
    myColor = null
    roomId = null
    eventSource?.close()
    lobbyEl.style.display = 'flex'
    lobbyMessage('Partie abgebrochen — Gegner hat die Verbindung verloren.')
  })
  eventSource.onerror = () => {
    document.getElementById('game-status')!.textContent = 'Verbindung unterbrochen — versuche neu …'
  }
}

async function joinRoomAs(input: string): Promise<boolean> {
  const id = input.trim().replace(/.*[?&]room=/, '').replace(/[^a-z0-9]/gi, '')
  if (!id) {
    lobbyMessage('Bitte Raum-ID oder Link eingeben.')
    return false
  }
  try {
    const res = await fetch(`${API_BASE}/api/games/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })
    if (res.status === 404) {
      lobbyMessage('Raum nicht gefunden — ID/Link prüfen.')
      return false
    }
    if (res.status === 409) {
      lobbyMessage('Raum ist voll — beide Plätze belegt.')
      return false
    }
    const data = await res.json()
    myColor = data.color
    roomId = id
    if (data.ready) {
      startOnlineGame()
    } else {
      lobbyMessage(`Du spielst ${myColor === 'light' ? 'Hell' : 'Dunkel'}. Warte auf zweiten Spieler …`)
    }
    connectStream()
    return true
  } catch {
    lobbyMessage('Server nicht erreichbar. Läuft `npm run server`?')
    return false
  }
}

async function createOnlineRoom() {
  try {
    const res = await fetch(`${API_BASE}/api/games`, { method: 'POST' })
    const data = await res.json()
    roomId = String(data.roomId)
    const url = new URL(location.href)
    url.searchParams.set('room', roomId)
    history.replaceState(null, '', url)
    const linkInput = document.getElementById('room-link-input') as HTMLInputElement
    document.getElementById('room-link')!.hidden = false
    linkInput.value = url.toString()
    lobbyMessage('Raum erstellt — Warte auf zweiten Spieler …')
    await joinRoomAs(roomId)
  } catch {
    lobbyMessage('Server nicht erreichbar. Läuft `npm run server`?')
  }
}

document.getElementById('create-room-btn')!.addEventListener('click', createOnlineRoom)
document.getElementById('join-room-btn')!.addEventListener('click', () => {
  joinRoomAs((document.getElementById('room-input') as HTMLInputElement).value)
})
document.getElementById('lobby-local-btn')!.addEventListener('click', () => {
  onlineMode = false
  myColor = null
  aiMode = false
  hideLobby()
})
document.getElementById('ai-btn')!.addEventListener('click', () => {
  onlineMode = false
  myColor = null
  aiMode = true
  aiLevel = (document.getElementById('ai-level') as HTMLSelectElement).value as 'leicht' | 'mittel' | 'schwer'
  state = createInitialState()
  selectedBall = null
  removeSelection = []
  renderer.updateState(state)
  updateUI()
  hideLobby()
})

const urlRoom = new URLSearchParams(location.search).get('room')
if (urlRoom) {
  document.getElementById('room-input')!.setAttribute('value', urlRoom)
  joinRoomAs(urlRoom)
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __pylos: () => unknown }).__pylos = () => state
}
