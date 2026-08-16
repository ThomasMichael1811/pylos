import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

async function waitFor(url, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: url.endsWith('/') ? 'GET' : 'POST' })
      if (res.status < 500) return
    } catch { /* noch nicht da */ }
    await sleep(300)
  }
  throw new Error(`Timeout: ${url} nicht erreichbar`)
}

const server = spawn('npx', ['tsx', 'src/server/server.ts'], { stdio: 'inherit', env: { ...process.env, PORT: '8787' } })
const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { stdio: 'inherit' })

let failed = false
try {
  await waitFor('http://localhost:5199/')
  await waitFor('http://localhost:8787/api/games')

  const specs = ['hotseat.spec.mjs', 'online.spec.mjs', 'reconnect.spec.mjs', 'ai.spec.mjs', 'demo.spec.mjs']
  for (const file of specs) {
    console.log(`── E2E ${file} ──`)
    try {
      const mod = await import(`./${file}`)
      await mod.run()
    } catch (err) {
      console.error(`FAIL ${file}:`, err.message)
      failed = true
    }
  }
} finally {
  server.kill('SIGTERM')
  vite.kill('SIGTERM')
  await sleep(500)
}

if (failed) process.exit(1)
console.log('── Alle E2E-Specs grün ──')
