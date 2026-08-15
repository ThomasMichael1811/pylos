import {
  launch, newPage, load, rectOf, clickCell, state, assert, VITE_URL,
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
      assert(link.includes('room='), 'Einladungslink erzeugt')

      await pageB.goto(link)
      await pageB.waitForSelector('canvas', { timeout: 10000 })
      await pageB.waitForTimeout(1500)

      const hideA = await pageA.evaluate(() => document.getElementById('lobby').style.display === 'none')
      const hideB = await pageB.evaluate(() => document.getElementById('lobby').style.display === 'none')
      assert(hideA && hideB, 'Beide Lobbys geschlossen nach Beitritt')

      const rectA = await rectOf(pageA)
      const rectB = await rectOf(pageB)

      await clickCell(pageA, rectA, 0, 0)
      await pageB.waitForTimeout(600)
      let sb = await state(pageB)
      assert(sb.board[0][0][0]?.ball?.color === 'light', 'B sieht Zug von A')
      assert(sb.currentPlayerIndex === 1, 'B ist am Zug (dunkel)')

      await clickCell(pageB, rectB, 1, 0)
      await pageA.waitForTimeout(600)
      let sa = await state(pageA)
      assert(sa.board[0][0][1]?.ball?.color === 'dark', 'A sieht Zug von B')
      assert(sa.currentPlayerIndex === 0, 'A ist wieder am Zug')

      // Fehlerfälle
      const { ctx: ctxC, page: pageC } = await newPage(browser)
      try {
        await load(pageC)
        await pageC.fill('#room-input', link)
        await pageC.click('#join-room-btn')
        await pageC.waitForTimeout(600)
        const msg = await pageC.evaluate(() => document.getElementById('lobby-status').textContent)
        assert(msg.includes('voll'), `Raum-voll-Meldung (war: ${msg})`)
      } finally {
        await ctxC.close().catch(() => {})
      }

      const { ctx: ctxD, page: pageD } = await newPage(browser)
      try {
        await load(pageD)
        await pageD.fill('#room-input', 'zzzzzz')
        await pageD.click('#join-room-btn')
        await pageD.waitForTimeout(600)
        const msg = await pageD.evaluate(() => document.getElementById('lobby-status').textContent)
        assert(msg.includes('nicht gefunden'), `Raum-nicht-gefunden-Meldung (war: ${msg})`)
      } finally {
        await ctxD.close().catch(() => {})
      }

      console.log('online: OK')
    } finally {
      await ctxA.close().catch(() => {})
      await ctxB.close().catch(() => {})
    }
  } finally {
    await browser.close()
  }
}
