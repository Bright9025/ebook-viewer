/* Electron 45 downloads its binary lazily. Make `npm install` deterministic. */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..', '..')
const electronDir = path.join(root, 'node_modules', 'electron')
const marker = path.join(electronDir, 'path.txt')
const installer = path.join(electronDir, 'install.js')

if (!fs.existsSync(electronDir)) {
  process.exit(0)
}

const platformPath = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
const binary = path.join(electronDir, 'dist', platformPath)

if (fs.existsSync(marker) && fs.existsSync(binary)) {
  process.exit(0)
}

if (!fs.existsSync(installer)) {
  console.warn('[ensure-electron] installer not found, skip')
  process.exit(0)
}

console.log('[ensure-electron] downloading Electron binary...')
const result = spawnSync(process.execPath, [installer], { stdio: 'inherit', cwd: root })
process.exit(result.status ?? 1)
