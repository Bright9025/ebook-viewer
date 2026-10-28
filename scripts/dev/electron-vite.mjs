import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

// Some Windows shells export ELECTRON_RUN_AS_NODE=1 for tooling. If Electron
// inherits it, the app starts as a plain Node process and exits immediately.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const cli = resolve(import.meta.dirname, '..', '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
