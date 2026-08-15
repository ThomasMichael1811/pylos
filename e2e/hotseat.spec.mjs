import {
  launch, newPage, load, rectOf, clickCell, clickWorld, drag,
  cellWorld, stackWorld, state, startLocal, assert,
} from './helpers.mjs'

export async function run() {
  const browser = await launch()
  try {
    const { ctx, page } = await newPage(browser)
    try {
      await load(page)
      await startLocal(page)
      const rect = await rectOf(page)

      // 1. Setzen per Klick
      await clickCell(page, rect, 0, 0)
      let s = await state(page)
      assert(s.board[0][0][0]?.ball?.color === 'light', 'Klick setzt helle Kugel (0,0)')
      assert(s.players[0].reserve === 14, 'Reserve Hell = 14')
      assert(s.currentPlayerIndex === 1, 'Spielerwechsel nach Klick')

      // 2. Setzen per Drag aus Reserve
      await drag(page, rect, { wx: -3.5, wz: -3.9 }, cellWorld(1, 0))
      s = await state(page)
      assert(s.board[0][0][1]?.ball?.color === 'dark', 'Drag setzt dunkle Kugel (1,0)')

      // 3. Versetzen per Drag: helle Kugel (2,2) → fremdes Ziel (1,0,0)
      // Quadrat (0,0) gemischt bilden, dann helle Kugel außerhalb setzen
      await clickCell(page, rect, 0, 1)   // l
      await clickCell(page, rect, 1, 1)   // d → Quadrat (0,0) komplett (gemischt)
      await clickCell(page, rect, 2, 2)   // l (außerhalb, unbedeckt)
      await clickCell(page, rect, 3, 3)   // d
      s = await state(page)
      assert(s.currentPlayerIndex === 0, 'Hell am Zug für Versetzen')
      await drag(page, rect, cellWorld(2, 2), stackWorld(1, 0, 0))
      s = await state(page)
      assert(s.board[1][0][0]?.ball?.color === 'light', 'Versetzen auf (1,0,0)')
      assert(s.board[0][2][2]?.ball == null, 'Quelle (2,2) leer')

      // 4. Quadrat (2,2) bilden + Stapeln per Drag aus Reserve
      await clickCell(page, rect, 3, 2)   // d
      await clickCell(page, rect, 2, 3)   // l
      await clickCell(page, rect, 2, 2)   // d → Quadrat (2,2) komplett
      s = await state(page)
      assert(s.currentPlayerIndex === 0, 'Hell am Zug für Stapeln')
      await drag(page, rect, { wx: -3.5, wz: -3.9 }, stackWorld(1, 2, 2))
      s = await state(page)
      assert(s.board[1][2][2]?.ball, 'Stapel auf (1,2,2)')

      // 5. Entfernen-Fluss: frisches Spiel, helles Quadrat (0,0), dann 1 Kugel zurücknehmen
      await ctx.close()
    } finally {
      await ctx.close().catch(() => {})
    }

    const { ctx: ctx2, page: page2 } = await newPage(browser)
    try {
      await load(page2)
      await startLocal(page2)
      const rect2 = await rectOf(page2)
      await clickCell(page2, rect2, 0, 0)   // l
      await clickCell(page2, rect2, 3, 3)   // d
      await clickCell(page2, rect2, 1, 0)   // l
      await clickCell(page2, rect2, 3, 2)   // d
      await clickCell(page2, rect2, 0, 1)   // l
      await clickCell(page2, rect2, 3, 1)   // d
      await clickCell(page2, rect2, 1, 1)   // l → Quadrat (0,0) hell
      let s = await state(page2)
      assert(s.phase === 'remove_own_balls', 'Farbquadrat löst Entfernen-Phase aus')
      const before = s.players[0].reserve
      await clickCell(page2, rect2, 0, 0)   // Kugel auswählen
      await page2.click('#remove-confirm-btn')
      await page2.waitForTimeout(300)
      s = await state(page2)
      assert(s.board[0][0][0]?.ball == null, 'Kugel entfernt')
      assert(s.players[0].reserve === before + 1, 'Reserve +1')
      assert(s.phase === 'select_ball', 'Phase zurück zu select_ball')
      await ctx2.close().catch(() => {})
    } finally {
      await ctx2.close().catch(() => {})
    }

    // 6. Spielende: volle Pyramide bauen → Spitze → Sieg + Neues Spiel
    const { ctx: ctx3, page: page3 } = await newPage(browser)
    try {
      await load(page3)
      await startLocal(page3)
      const rect3 = await rectOf(page3)
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) await clickCell(page3, rect3, x, y)
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) await clickWorld(page3, rect3, ...Object.values(stackWorld(1, x, y)))
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) await clickWorld(page3, rect3, ...Object.values(stackWorld(2, x, y)))
      await clickWorld(page3, rect3, ...Object.values(stackWorld(3, 0, 0)))
      const s = await state(page3)
      assert(s.phase === 'game_over' && s.winner, 'Spitze belegt → game_over')
      const hasBtn = await page3.evaluate(() => !!document.getElementById('new-game-btn'))
      assert(hasBtn, 'Neues-Spiel-Button sichtbar')
      await page3.click('#new-game-btn')
      await page3.waitForTimeout(300)
      const s2 = await state(page3)
      assert(s2.moveCount === 0 && s2.phase === 'select_ball', 'Neues Spiel setzt zurück')
      await ctx3.close().catch(() => {})
    } finally {
      await ctx3.close().catch(() => {})
    }
    console.log('hotseat: OK')
  } finally {
    await browser.close()
  }
}
