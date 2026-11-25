import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readPortFromEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((entry) => /^\s*PORT\s*=/.test(entry))
  if (!line) return undefined
  let value = line.slice(line.indexOf('=') + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  } else {
    value = value.replace(/\s+#.*$/, '').trim()
  }
  return value || undefined
}

const command = process.argv[2]
if (!['dev', 'start'].includes(command)) {
  console.error('Usage: node scripts/next-with-env.mjs <dev|start> [Next.js options]')
  process.exit(1)
}

const args = process.argv.slice(3)
const hasExplicitPort = args.some((arg) => arg === '-p' || arg === '--port' || arg.startsWith('--port='))
const port = process.env.PORT || readPortFromEnvLocal()
if (!hasExplicitPort && port) {
  const parsed = Number(port)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error('PORT in .env.local must be a valid port between 1 and 65535.')
    process.exit(1)
  }
  args.push('--port', String(parsed))
}

const nextBin = resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, command, ...args], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
