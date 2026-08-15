import { chromium } from 'playwright'

export const CELL = 1.8
export const PX = 75
export const VITE_URL = 'http://localhost:5199/'
export const API_URL = 'http://localhost:8787'

export async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGE-EXC:', e.message))
  return { ctx, page }
}

export async function load(page, url = VITE_URL) {
  await page.goto(url)
  await page.waitForSelector('canvas', { timeout: 10000 })
  await page.waitForTimeout(1200)
}

export async function rectOf(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
}

export function worldToScreen(rect, wx, wz) {
  return {
    x: rect.left + rect.width / 2 + wx * PX,
    y: rect.top + rect.height / 2 + wz * PX,
  }
}

export const cellWorld = (x, y) => ({ wx: (x - 1.5) * CELL, wz: (y - 1.5) * CELL })
export const stackWorld = (level, x, y) => {
  const ox = 1.5 - 0.5 * level
  return { wx: (x - ox) * CELL, wz: (y - ox) * CELL }
}

export async function clickCell(page, rect, x, y) {
  const w = cellWorld(x, y)
  const p = worldToScreen(rect, w.wx, w.wz)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(90)
}

export async function clickWorld(page, rect, wx, wz) {
  const p = worldToScreen(rect, wx, wz)
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(90)
}

export async function drag(page, rect, wFrom, wTo) {
  const from = worldToScreen(rect, wFrom.wx, wFrom.wz)
  const to = worldToScreen(rect, wTo.wx, wTo.wz)
  await page.mouse.move(from.x, from.y)
  await page.waitForTimeout(60)
  await page.mouse.down()
  await page.waitForTimeout(60)
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 15, from.y + (to.y - from.y) * i / 15)
    await page.waitForTimeout(25)
  }
  await page.mouse.up()
  await page.waitForTimeout(200)
}

export async function state(page) {
  return page.evaluate(() => window.__pylos())
}

export async function startLocal(page) {
  await page.click('#lobby-local-btn')
  await page.waitForTimeout(200)
}

export function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
}

export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true })
}
