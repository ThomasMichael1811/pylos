import { execSync } from 'node:child_process'

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

const lastTag = process.argv[2] || run('git describe --tags --abbrev=0 2>/dev/null || echo ""')
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const log = run(`git log ${range} --pretty=format:%s --no-merges`)

const groups = [
  ['✨ Neue Features', 'feat'],
  ['🐛 Fehlerbehebungen', 'fix'],
  ['📚 Dokumentation', 'docs'],
  ['🧹 Aufräumen/Sonstiges', 'chore'],
  ['✅ Tests', 'test'],
]

const sections = []
for (const [title, prefix] of groups) {
  const lines = log
    .split('\n')
    .filter(s => s && s.startsWith(`${prefix}:`))
    .map(s => `- ${s.slice(prefix.length + 1).trim()}`)
  if (lines.length > 0) sections.push(`## ${title}\n\n${lines.join('\n')}`)
}

const rest = log
  .split('\n')
  .filter(s => s && !/^(feat|fix|docs|chore|test):/.test(s))

console.log(`# Release Notes${lastTag ? ` — seit ${lastTag}` : ''}\n`)
if (sections.length === 0 && rest.length === 0) {
  console.log('Keine Commits seit dem letzten Tag — nichts zu veröffentlichen.')
} else {
  if (sections.length > 0) console.log(sections.join('\n\n'))
  if (rest.length > 0) console.log(`\n## Sonstige Commits\n\n${rest.map(s => `- ${s}`).join('\n')}`)
}
