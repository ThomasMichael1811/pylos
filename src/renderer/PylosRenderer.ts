import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  GameStateData, Position, getLevelSize,
} from '../game/types'
import {
  getSlot, getFreeSlots, getStackTargets, getMovableOwnBalls,
  findSquares, isMonochromaticSquare, hasBallAbove,
} from '../game/Board'

const BOARD_SIZE = 4
const CELL = 1.8
const BALL_RADIUS = 0.7
const RESERVE_Z = -3.9

const COLORS = {
  light: 0xf0f0f0,
  dark: 0x222222,
  boardBase: 0x2a1f0e,
  gridLine: 0x5a3d1a,
  highlightTarget: 0x4fc3f7,
  highlightHover: 0x81d4fa,
  highlightSquare: 0xffeb3b,
  highlightAllSquare: 0x66bb6a,
  highlightRemove: 0xff5252,
  bg: 0x1a1a2e,
}

function levelY(level: number): number {
  return level * (BALL_RADIUS * 2 - 0.3)
}

function posToWorld(pos: Position): THREE.Vector3 {
  const ox = 1.5 - 0.5 * pos.level
  return new THREE.Vector3(
    (pos.x - ox) * CELL,
    levelY(pos.level),
    (pos.y - ox) * CELL,
  )
}

const emptyMoves: AvailableMovesRaw = {
  placeTargets: [],
  stackTargets: [],
  movableBalls: [],
  allSquares: [],
  monochromeSquares: [],
}

function cellCenter(level: number, x: number, y: number): THREE.Vector3 {
  const size = getLevelSize(level)
  const half = (BOARD_SIZE - size) / 2
  return new THREE.Vector3(
    (x + 0.5 + half - 1.5) * CELL,
    levelY(level),
    (y + 0.5 + half - 1.5) * CELL,
  )
}

export type GameEvent =
  | { type: 'click_place'; pos: Position }
  | { type: 'click_select_move'; pos: Position }
  | { type: 'click_move_to'; from: Position; to: Position }
  | { type: 'click_remove_toggle'; pos: Position }
  | { type: 'drag_remove'; pos: Position }
  | { type: 'drag_move'; from: Position; to: Position }
  | { type: 'drag_place'; pos: Position }
  | { type: 'click_ball'; pos: Position }

export class PylosRenderer {
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private boardGroup: THREE.Group
  private ballGroup: THREE.Group
  private highlightGroup: THREE.Group
  private reserveGroup: THREE.Group
  private dragGroup: THREE.Group
  private raycaster: THREE.Raycaster
  private pointer: THREE.Vector2
  private state: GameStateData | null = null
  private animFrameId: number = 0
  private is3D: boolean = false
  private onEvent: ((evt: GameEvent) => void) | null = null
  private removeSelection: Position[] = []
  private selectedBall: Position | null = null

  private dragActive = false
  private ghostBall: THREE.Mesh | null = null
  private hoverPos: Position | null = null
  private dragStartScreen = new THREE.Vector2()
  private removeDragPos: Position | null = null
  private moveDragPos: Position | null = null

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(COLORS.bg)

    const rect = container.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const viewSize = 12

    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect / 2,
      viewSize * aspect / 2,
      viewSize / 2,
      -viewSize / 2,
      0.1,
      100,
    )
    this.camera.position.set(0, 15, 0)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(rect.width, rect.height)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableRotate = false
    this.controls.enablePan = true
    this.controls.mouseButtons = { LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    this.boardGroup = new THREE.Group()
    this.ballGroup = new THREE.Group()
    this.highlightGroup = new THREE.Group()
    this.reserveGroup = new THREE.Group()
    this.dragGroup = new THREE.Group()
    this.scene.add(this.boardGroup)
    this.scene.add(this.ballGroup)
    this.scene.add(this.highlightGroup)
    this.scene.add(this.reserveGroup)
    this.scene.add(this.dragGroup)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('resize', this.onResize)
  }

  setOnEvent(cb: (evt: GameEvent) => void) {
    this.onEvent = cb
  }

  private onResize = () => {
    const container = this.renderer.domElement.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    const aspect = rect.width / rect.height
    const viewSize = 12
    this.camera.left = -viewSize * aspect / 2
    this.camera.right = viewSize * aspect / 2
    this.camera.top = viewSize / 2
    this.camera.bottom = -viewSize / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(rect.width, rect.height)
  }

  private screenToPlane(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const y = this.dragActive ? levelY(this.hoverPos?.level ?? this.removeDragPos?.level ?? 0) : 0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const target = new THREE.Vector3()
    const hit = this.raycaster.ray.intersectPlane(plane, target)
    return hit ?? null
  }

  private isInReserveArea(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ny = 1 - (clientY - rect.top) / rect.height * 2
    if (ny < -0.45) return true
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    for (const child of this.reserveGroup.children) {
      if (child instanceof THREE.Mesh && this.raycaster.intersectObject(child, false).length > 0) {
        return true
      }
    }
    return false
  }

  private getTargetAtPointer(clientX: number, clientY: number): Position | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)

    for (const child of this.highlightGroup.children) {
      if (child instanceof THREE.Mesh) {
        const hit = this.raycaster.intersectObject(child, false)
        if (hit.length > 0 && child.userData.pos) {
          return child.userData.pos as Position
        }
      }
    }
    for (const child of this.ballGroup.children) {
      if (child instanceof THREE.Mesh) {
        const hit = this.raycaster.intersectObject(child, false)
        if (hit.length > 0 && child.userData.pos) {
          return child.userData.pos as Position
        }
      }
    }
    return null
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    if (!this.state || this.state.phase === 'game_over') return

    if (this.isInReserveArea(e.clientX, e.clientY)) {
      const cp = this.state.players[this.state.currentPlayerIndex]
      if (cp.reserve <= 0) return
      if (this.state.phase !== 'select_ball') return

      this.dragActive = true
      this.dragStartScreen.set(e.clientX, e.clientY)

      const geo = new THREE.SphereGeometry(BALL_RADIUS, 20, 20)
      const mat = new THREE.MeshStandardMaterial({
        color: cp.color === 'light' ? COLORS.light : COLORS.dark,
        transparent: true,
        opacity: 0.7,
      })
      this.ghostBall = new THREE.Mesh(geo, mat)
      this.dragGroup.add(this.ghostBall)

      const wp = this.screenToPlane(e.clientX, e.clientY)
      if (wp) this.ghostBall.position.copy(wp)
      return
    }

    const targetPos = this.getTargetAtPointer(e.clientX, e.clientY)
    if (!targetPos) return
    if (this.state.phase === 'remove_own_balls') {
      const slot = getSlot(this.state.board, targetPos)
      const cpColor = this.state.players[this.state.currentPlayerIndex].color
      if (!slot?.ball || slot.ball.color !== cpColor) return
      if (hasBallAbove(this.state.board, targetPos)) return

      this.removeDragPos = targetPos
      this.dragActive = true
      this.dragStartScreen.set(e.clientX, e.clientY)

      const cp = this.state.players[this.state.currentPlayerIndex]
      const geo = new THREE.SphereGeometry(BALL_RADIUS, 20, 20)
      const mat = new THREE.MeshStandardMaterial({
        color: cp.color === 'light' ? COLORS.light : COLORS.dark,
        transparent: true,
        opacity: 0.7,
      })
      this.ghostBall = new THREE.Mesh(geo, mat)
      this.dragGroup.add(this.ghostBall)

      const wp = this.screenToPlane(e.clientX, e.clientY)
      if (wp) this.ghostBall.position.copy(wp)
      return
    }

    const isMovableSource = getAvailableMovesRaw(this.state).movableBalls.some(t =>
      t.x === targetPos.x && t.y === targetPos.y && t.level === targetPos.level
    )
    if (isMovableSource) {
      this.moveDragPos = targetPos
      this.dragActive = true
      this.dragStartScreen.set(e.clientX, e.clientY)

      const cp = this.state.players[this.state.currentPlayerIndex]
      const geo = new THREE.SphereGeometry(BALL_RADIUS, 20, 20)
      const mat = new THREE.MeshStandardMaterial({
        color: cp.color === 'light' ? COLORS.light : COLORS.dark,
        transparent: true,
        opacity: 0.7,
      })
      this.ghostBall = new THREE.Mesh(geo, mat)
      this.dragGroup.add(this.ghostBall)

      const wp = this.screenToPlane(e.clientX, e.clientY)
      if (wp) this.ghostBall.position.copy(wp)
      return
    }

    this.onEvent?.({ type: 'click_ball', pos: targetPos })
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragActive && this.ghostBall) {
      if (this.removeDragPos) {
        const wp = this.screenToPlane(e.clientX, e.clientY)
        if (wp) this.ghostBall.position.copy(wp)
        this.clearGroup(this.highlightGroup)
        this.drawHighlights()
        this.drawDropZone()
        return
      }

      if (this.moveDragPos) {
        const moves = this.state ? getAvailableMovesRaw(this.state) : emptyMoves
        const hover = this.getTargetAtPointer(e.clientX, e.clientY)
        const isValid = hover && moves.stackTargets.some(t =>
          t.x === hover.x && t.y === hover.y && t.level === hover.level &&
          t.level > this.moveDragPos!.level
        )
        this.hoverPos = isValid ? hover : null

        const wp = this.screenToPlane(e.clientX, e.clientY)
        if (wp && this.ghostBall) {
          this.ghostBall.position.copy(wp)
          this.ghostBall.position.y = isValid ? this.ghostBall.position.y + 0.5 : levelY(this.moveDragPos.level) + BALL_RADIUS + 0.5
        }

        this.clearGroup(this.highlightGroup)
        this.drawFixedHighlights(moves)

        if (hover && isValid) {
          const highlightGeo = new THREE.PlaneGeometry(CELL - 0.2, CELL - 0.2)
          const highlightMat = new THREE.MeshBasicMaterial({
            color: COLORS.highlightHover,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          })
          const mesh = new THREE.Mesh(highlightGeo, highlightMat)
          const wp2 = posToWorld(hover)
          mesh.position.set(wp2.x, wp2.y + 0.1, wp2.z)
          mesh.rotation.x = -Math.PI / 2
          this.highlightGroup.add(mesh)
        }
        return
      }

      const moves = this.state ? getAvailableMovesRaw(this.state) : emptyMoves
      const targets = [
        ...moves.placeTargets,
        ...moves.stackTargets,
      ]

      const hover = this.getTargetAtPointer(e.clientX, e.clientY)
      const isValid = hover && targets.some(t =>
        t.x === hover.x && t.y === hover.y && t.level === hover.level
      )

      this.hoverPos = isValid ? hover : null

      if (this.ghostBall) {
        const wp = this.screenToPlane(e.clientX, e.clientY)
        if (wp) {
          this.ghostBall.position.copy(wp)
          this.ghostBall.position.y = isValid ? this.ghostBall.position.y + 0.5 : levelY(0) + BALL_RADIUS + 0.5
        }
      }

      this.clearGroup(this.highlightGroup)
      this.drawFixedHighlights(moves)
      this.drawDropZone()

      if (hover && isValid) {
        const highlightGeo = new THREE.PlaneGeometry(CELL - 0.2, CELL - 0.2)
        const highlightMat = new THREE.MeshBasicMaterial({
          color: COLORS.highlightHover,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(highlightGeo, highlightMat)
        const wp2 = posToWorld(hover)
        mesh.position.set(wp2.x, wp2.y + 0.1, wp2.z)
        mesh.rotation.x = -Math.PI / 2
        this.highlightGroup.add(mesh)
      }
      return
    }

    if (this.state && this.state.phase === 'select_ball') {
      const overTarget = this.getTargetAtPointer(e.clientX, e.clientY)
      const overReserve = this.isInReserveArea(e.clientX, e.clientY)
      this.renderer.domElement.style.cursor = overReserve ? 'grab' : overTarget ? 'pointer' : 'default'
    }
  }

  private drawDropZone() {
    const geo = new THREE.PlaneGeometry(30, 2.6)
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.highlightHover,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, 0.05, -4.6)
    mesh.rotation.x = -Math.PI / 2
    this.highlightGroup.add(mesh)
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragActive || !this.ghostBall) return

    if (this.removeDragPos) {
      if (this.isInReserveArea(e.clientX, e.clientY)) {
        this.onEvent?.({ type: 'drag_remove', pos: this.removeDragPos })
      } else if (Math.hypot(e.clientX - this.dragStartScreen.x, e.clientY - this.dragStartScreen.y) < 6) {
        this.onEvent?.({ type: 'click_remove_toggle', pos: this.removeDragPos })
      }
      this.removeDragPos = null
    }

    if (this.moveDragPos) {
      if (this.hoverPos) {
        this.onEvent?.({ type: 'drag_move', from: this.moveDragPos, to: this.hoverPos })
      } else if (Math.hypot(e.clientX - this.dragStartScreen.x, e.clientY - this.dragStartScreen.y) < 6) {
        this.onEvent?.({ type: 'click_ball', pos: this.moveDragPos })
      }
      this.moveDragPos = null
    } else if (this.hoverPos) {
      this.onEvent?.({ type: 'drag_place', pos: this.hoverPos })
    }

    this.dragGroup.clear()
    this.ghostBall.geometry.dispose()
    if (Array.isArray(this.ghostBall.material)) {
      this.ghostBall.material.forEach(m => m.dispose())
    } else {
      this.ghostBall.material.dispose()
    }
    this.ghostBall = null
    this.dragActive = false
    this.hoverPos = null

    if (this.state) {
      this.renderBoard()
    }
  }

  toggle3D() {
    this.is3D = !this.is3D
    this.controls.enableRotate = this.is3D
    this.camera.position.set(this.is3D ? 10 : 0, this.is3D ? 8 : 15, this.is3D ? 10 : 0)
    this.camera.lookAt(0, 0, 0)
    this.renderBoard()
  }

  updateState(state: GameStateData, removeSelection: Position[] = [], selectedBall: Position | null = null) {
    this.state = state
    this.removeSelection = removeSelection
    this.selectedBall = selectedBall
    this.renderBoard()
  }

  private renderBoard() {
    this.clearGroup(this.boardGroup)
    this.clearGroup(this.ballGroup)
    this.clearGroup(this.highlightGroup)
    this.clearGroup(this.reserveGroup)
    this.dragGroup.clear()

    this.drawLevels()
    this.drawBalls()
    this.drawReserve()
    this.drawHighlights()
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0]
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
      if (child instanceof THREE.Line) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
      group.remove(child)
    }
  }

  private hasSquaresBelow(level: number): boolean {
    if (!this.state || level === 0) return true
    return findSquares(this.state.board, level - 1).length > 0
  }

  private drawLevels() {
    if (!this.state) return

    for (let level = 0; level < 4; level++) {
      if (level > 0 && !this.hasSquaresBelow(level)) continue

      const size = getLevelSize(level)
      const half = (BOARD_SIZE - size) / 2
      const y = levelY(level)

      const planeGeo = new THREE.PlaneGeometry(size * CELL - 0.1, size * CELL - 0.1)
      const planeMat = new THREE.MeshBasicMaterial({
        color: COLORS.boardBase,
        transparent: true,
        opacity: 0.5 + level * 0.12,
        depthWrite: false,
      })
      const plane = new THREE.Mesh(planeGeo, planeMat)
      const centerOffset = (size - 1) / 2 + half
      plane.position.set(
        (centerOffset - 1.5) * CELL,
        y - 0.05,
        (centerOffset - 1.5) * CELL,
      )
      plane.rotation.x = -Math.PI / 2
      this.boardGroup.add(plane)

      const gridMat = new THREE.LineBasicMaterial({ color: COLORS.gridLine })
      for (let i = 0; i <= size; i++) {
        const p = (i - size / 2) * CELL
        const minP = -size / 2 * CELL
        const maxP = size / 2 * CELL

        const hPoints = [new THREE.Vector3(minP, y, p), new THREE.Vector3(maxP, y, p)]
        this.boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPoints), gridMat))

        const vPoints = [new THREE.Vector3(p, y, minP), new THREE.Vector3(p, y, maxP)]
        this.boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vPoints), gridMat))
      }
    }
  }

  private drawBalls() {
    if (!this.state) return
    const board = this.state.board

    for (let level = 0; level < 4; level++) {
      const size = getLevelSize(level)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const slot = getSlot(board, { level, x, y })
          if (!slot || !slot.ball) continue

          const pos = posToWorld({ level, x, y })
          const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24)
          const isLight = slot.ball.color === 'light'
          const mat = new THREE.MeshStandardMaterial({
            color: isLight ? COLORS.light : COLORS.dark,
            roughness: isLight ? 0.3 : 0.6,
            metalness: isLight ? 0.1 : 0.4,
          })
          const mesh = new THREE.Mesh(geo, mat)
          mesh.position.copy(pos)
          mesh.userData.pos = { level, x, y }
          this.ballGroup.add(mesh)
        }
      }
    }

    if (!this.scene.children.some(c => c instanceof THREE.AmbientLight)) {
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    }
    if (!this.scene.children.some(c => c instanceof THREE.DirectionalLight)) {
      const dir = new THREE.DirectionalLight(0xffffff, 0.8)
      dir.position.set(5, 15, 5)
      this.scene.add(dir)
    }
  }

  private drawReserve() {
    if (!this.state) return
    const spacing = 0.8

    for (let pi = 0; pi < 2; pi++) {
      const player = this.state.players[pi]
      const isLight = player.color === 'light'
      const count = player.reserve
      const offsetX = pi === 0 ? -3.5 : 3.5

      for (let i = 0; i < count && i < 15; i++) {
        const col = i % 5
        const row = Math.floor(i / 5)
        const x = offsetX + (col - 2) * spacing
        const z = RESERVE_Z - row * spacing
        const geo = new THREE.SphereGeometry(BALL_RADIUS * 0.55, 16, 16)
        const mat = new THREE.MeshStandardMaterial({
          color: isLight ? COLORS.light : COLORS.dark,
          roughness: isLight ? 0.3 : 0.6,
          metalness: isLight ? 0.1 : 0.4,
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, -0.3, z)
        mesh.userData.isReserve = true
        this.reserveGroup.add(mesh)
      }
    }
  }

  private drawHighlights() {
    if (!this.state) return

    if (this.state.phase === 'select_ball') {
      const moves = getAvailableMovesRaw(this.state)
      this.drawFixedHighlights(moves)
    }

    if (this.state.phase === 'remove_own_balls') {
      const board = this.state.board
      const cp = this.state.players[this.state.currentPlayerIndex]
      for (let level = 0; level < 4; level++) {
        const size = getLevelSize(level)
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const slot = getSlot(board, { level, x, y })
            if (!slot || !slot.ball || slot.ball.color !== cp.color) continue
            if (hasBallAbove(board, { level, x, y })) {
              this.addCoveredHighlight({ level, x, y })
            } else {
              this.addRemoveHighlight({ level, x, y })
            }
          }
        }
      }
      for (const sel of this.removeSelection) {
        this.addSelectedHighlight(posToWorld(sel))
      }
    }
  }

  private drawFixedHighlights(moves: ReturnType<typeof getAvailableMovesRaw>) {
    for (const pos of moves.placeTargets) {
      this.addTargetHighlight(pos, COLORS.highlightTarget)
    }
    for (const pos of moves.stackTargets) {
      this.addTargetHighlight(pos, COLORS.highlightTarget)
    }
    for (const pos of moves.movableBalls) {
      this.addMovableHighlight(pos, COLORS.highlightRemove)
    }
    if (this.selectedBall) {
      this.addSelectedBallHighlight(this.selectedBall)
    }
    for (const sq of moves.allSquares) {
      this.addSquareHighlight(sq.level, sq.x, sq.y, COLORS.highlightAllSquare)
    }
    for (const sq of moves.monochromeSquares) {
      this.addSquareHighlight(sq.level, sq.x, sq.y, COLORS.highlightSquare)
    }
  }

  private addTargetHighlight(pos: Position, color: number) {
    const wp = posToWorld(pos)
    const geo = new THREE.PlaneGeometry(CELL - 0.2, CELL - 0.2)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.08, wp.z)
    mesh.rotation.x = -Math.PI / 2
    mesh.userData.pos = pos
    this.highlightGroup.add(mesh)
  }

  private addMovableHighlight(pos: Position, color: number) {
    const wp = posToWorld(pos)
    const geo = new THREE.RingGeometry(BALL_RADIUS + 0.05, BALL_RADIUS + 0.25, 32)
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.1, wp.z)
    mesh.rotation.x = -Math.PI / 2
    mesh.userData.pos = pos
    this.highlightGroup.add(mesh)
  }

  private addRemoveHighlight(pos: Position) {
    const wp = posToWorld(pos)
    const geo = new THREE.RingGeometry(BALL_RADIUS + 0.05, BALL_RADIUS + 0.25, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.highlightRemove,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.1, wp.z)
    mesh.rotation.x = -Math.PI / 2
    mesh.userData.pos = pos
    this.highlightGroup.add(mesh)
  }

  private addSelectedHighlight(wp: THREE.Vector3) {
    const geo = new THREE.CircleGeometry(BALL_RADIUS + 0.15, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.highlightRemove,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.12, wp.z)
    mesh.rotation.x = -Math.PI / 2
    this.highlightGroup.add(mesh)
  }

  private addCoveredHighlight(pos: Position) {
    const wp = posToWorld(pos)
    const geo = new THREE.RingGeometry(BALL_RADIUS + 0.05, BALL_RADIUS + 0.25, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9e9e9e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.1, wp.z)
    mesh.rotation.x = -Math.PI / 2
    this.highlightGroup.add(mesh)
  }

  private addSelectedBallHighlight(pos: Position) {
    const wp = posToWorld(pos)
    const geo = new THREE.RingGeometry(BALL_RADIUS + 0.3, BALL_RADIUS + 0.5, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.highlightTarget,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.12, wp.z)
    mesh.rotation.x = -Math.PI / 2
    this.highlightGroup.add(mesh)
  }

  private addSquareHighlight(level: number, sx: number, sy: number, color: number) {
    const wp = cellCenter(level, sx, sy)
    const geo = new THREE.PlaneGeometry(CELL * 2 - 0.2, CELL * 2 - 0.2)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(wp.x, wp.y + 0.08, wp.z)
    mesh.rotation.x = -Math.PI / 2
    this.highlightGroup.add(mesh)
  }

  start() {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  stop() {
    cancelAnimationFrame(this.animFrameId)
  }
}

interface AvailableMovesRaw {
  placeTargets: Position[]
  stackTargets: Position[]
  movableBalls: Position[]
  allSquares: { level: number; x: number; y: number }[]
  monochromeSquares: { level: number; x: number; y: number }[]
}

function getAvailableMovesRaw(state: GameStateData): AvailableMovesRaw {
  const board = state.board
  const freeSlots = getFreeSlots(board)
  const stackTargets = getStackTargets(board)
  const cpColor = state.players[state.currentPlayerIndex].color
  const movableBalls = getMovableOwnBalls(board, cpColor)

  const lowestFree = freeSlots.length > 0 ? freeSlots[0].level : -1
  const placeTargets = lowestFree === 0
    ? freeSlots.filter(s => s.level === 0)
    : []

  const allSquares: { level: number; x: number; y: number }[] = []
  const monochromeSquares: { level: number; x: number; y: number }[] = []
  for (const level of [0, 1, 2]) {
    const squares = findSquares(board, level)
    for (const sq of squares) {
      allSquares.push({ level, x: sq.x, y: sq.y })
      if (isMonochromaticSquare(board, level, sq.x, sq.y, cpColor)) {
        monochromeSquares.push({ level, x: sq.x, y: sq.y })
      }
    }
  }

  return {
    placeTargets,
    stackTargets,
    movableBalls,
    allSquares,
    monochromeSquares,
  }
}
