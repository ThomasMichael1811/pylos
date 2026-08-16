import {
  launch, newPage, load, rectOf, clickCell, clickWorld, stackWorld, state, assert,
} from './helpers.mjs'

function stackTargets(s) {
  const out = []
  for (let lvl = 0; lvl < 3; lvl++) {
    const size = 4 - lvl
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const full = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]
        .every(([cx, cy]) => s.board[lvl][cy][cx]?.ball)
      if (full && !s.board[lvl + 1][y][x]?.ball) out.push({ level: lvl + 1, x, y })
    }
  }
  return out
}

export async function run() {
  const browser = await launch()
  try {
    const { ctx, page } = await newPage(browser)
    try {
      await load(page)
      await page.click('#ai-btn')
      await page.waitForTimeout(300)
      const rect = await rectOf(page)

      let moves = 0
      for (; moves < 300; moves++) {
        const s = await state(page)
        if (s.phase === 'game_over') break
        if (s.currentPlayerIndex !== 0) {
          await page.waitForTimeout(900) // KI am Zug → warten
          continue
        }
        if (s.phase === 'remove_own_balls') {
          const targets = []
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const b = s.board[0][y][x]?.ball
            if (b && b.color === 'light') targets.push([x, y])
          }
          assert(targets.length > 0, 'remove-Phase: keine entfernbare Kugel')
          await clickCell(page, rect, targets[0][0], targets[0][1])
          await page.click('#remove-confirm-btn')
          await page.waitForTimeout(300)
          continue
        }
        let free = null
        for (let y = 0; y < 4 && !free; y++) for (let x = 0; x < 4 && !free; x++) {
          if (!s.board[0][y][x]?.ball) free = [x, y]
        }
        if (free) {
          await clickCell(page, rect, free[0], free[1])
          await page.waitForTimeout(200)
          continue
        }
        const stacks = stackTargets(s)
        if (stacks.length > 0) {
          const t = stacks[0]
          const w = stackWorld(t.level, t.x, t.y)
          await clickWorld(page, rect, w.wx, w.wz)
          await page.waitForTimeout(200)
          continue
        }
        break // keine einfachen Züge mehr für den Test-Menschen
      }

      const s = await state(page)
      assert(s.phase === 'game_over' && s.winner, `Partie endete nicht (moves=${moves}, phase=${s.phase})`)
      console.log(`ai: OK (Sieger: ${s.winner} nach ${moves} Schleifen)`)

      // #398: Stufe nach Spielende neu wählen und neues KI-Spiel starten
      await page.selectOption('#ai-level-re', 'schwer')
      await page.click('#new-ai-game-btn')
      await page.waitForTimeout(400)
      const s2 = await state(page)
      assert(s2.moveCount === 0 && s2.phase === 'select_ball', 'Neues KI-Spiel startet frisch')
      const turn = await page.evaluate(() => document.getElementById('turn-indicator').textContent)
      assert(turn.includes('schwer'), `Stufe übernommen (war: ${turn})`)
      console.log('ai: Neustart mit neuer Stufe OK')
    } finally {
      await ctx.close().catch(() => {})
    }
  } finally {
    await browser.close()
  }
}
