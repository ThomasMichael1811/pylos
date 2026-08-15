import {
  launch, newPage, load, rectOf, clickCell, state, assert,
} from './helpers.mjs'

export async function run() {
  const browser = await launch()
  try {
    const { ctx: ctxA, page: pageA } = await newPage(browser)
    const { ctx: ctxB, page: pageB } = await newPage(browser)
    try {
      await load(pageA)
      await load(pageB)

      await pageA.click('#create-room-btn')
      await pageA.waitForTimeout(1000)
      const link = await pageA.inputValue('#room-link-input')

      await pageB.goto(link)
      await pageB.waitForSelector('canvas', { timeout: 10000 })
      await pageB.waitForTimeout(1500)

      const rectA = await rectOf(pageA)
      await clickCell(pageA, rectA, 0, 0)
      await pageB.waitForTimeout(600)
      let sb = await state(pageB)
      assert(sb.board[0][0][0]?.ball?.color === 'light', 'Zug vor Reload sichtbar')

      // B lädt neu → URL enthält ?room → Auto-Join, gleiche Farbe, State wiederhergestellt
      await pageB.reload()
      await pageB.waitForSelector('canvas', { timeout: 10000 })
      await pageB.waitForTimeout(2000)

      const hideB = await pageB.evaluate(() => document.getElementById('lobby').style.display === 'none')
      assert(hideB, 'B-Lobby nach Reload geschlossen (Rejoin)')
      const sb2 = await state(pageB)
      assert(sb2.board[0][0][0]?.ball?.color === 'light', 'State nach Reload wiederhergestellt')
      assert(sb2.currentPlayerIndex === 1, 'B bleibt Dunkel und ist am Zug')

      // A bekommt rejoined-Hinweis
      await pageA.waitForTimeout(600)
      const statusA = await pageA.evaluate(() => document.getElementById('game-status').textContent)
      assert(statusA.includes('wieder da'), `rejoined-Hinweis bei A (war: ${statusA})`)

      console.log('reconnect: OK')
    } finally {
      await ctxA.close().catch(() => {})
      await ctxB.close().catch(() => {})
    }
  } finally {
    await browser.close()
  }
}
