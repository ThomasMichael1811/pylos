import {
  launch, newPage, load, state, assert,
} from './helpers.mjs'

export async function run() {
  const browser = await launch()
  try {
    const { ctx, page } = await newPage(browser)
    try {
      await load(page)
      await page.selectOption('#demo-level-light', 'leicht')
      await page.selectOption('#demo-level-dark', 'leicht')
      await page.click('#demo-btn')
      await page.waitForTimeout(300)

      // Demo läuft automatisch — warte bis game_over (max. 180 s)
      const deadline = Date.now() + 180_000
      let s
      while (Date.now() < deadline) {
        s = await state(page)
        if (s.phase === 'game_over') break
        await page.waitForTimeout(1000)
      }
      assert(s.phase === 'game_over' && s.winner, `Demo endete nicht (phase=${s?.phase})`)

      // Zur Lobby zurück
      await page.click('#demo-lobby-btn')
      await page.waitForTimeout(300)
      const lobbyVisible = await page.evaluate(() => document.getElementById('lobby').style.display !== 'none')
      assert(lobbyVisible, 'Lobby nach Demo wieder sichtbar')
      console.log(`demo: OK (Sieger: ${s.winner})`)
    } finally {
      await ctx.close().catch(() => {})
    }
  } finally {
    await browser.close()
  }
}
