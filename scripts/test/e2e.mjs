import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = resolve(import.meta.dirname, '..', '..')
const userData = join(root, '.tmp-e2e', `run-${Date.now()}`)
const port = 9471
const sample = join(root, 'samples', '山窗读书记.epub')
const artifacts = join(root, '.tmp-e2e', 'artifacts')

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`)
  console.log(`  ok - ${message}`)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.EBOOK_USER_DATA = userData

const child = spawn(electronPath, ['.', '--no-sandbox', `--remote-debugging-port=${port}`], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
})
let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += String(chunk)
})

let browser
try {
  let ready = null
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        ready = await response.json()
        break
      }
    } catch {
      /* retry */
    }
    await sleep(250)
  }
  if (!ready) throw new Error(`Electron did not expose CDP on ${port}\n${stderr.slice(-2000)}`)

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = browser.contexts().flatMap((context) => context.pages())[0]
  assert(page, 'main window opened')
  await page.waitForSelector('.library-shell', { timeout: 20000 })
  console.log('library loaded')

  const imported = await page.evaluate(async (path) => {
    const books = await window.__ebookTest.importBook(path)
    return books.map((book) => ({ id: book.id, title: book.title }))
  }, sample)
  assert(imported.length === 1, 'sample EPUB imported')
  await page.waitForTimeout(500)

  const list = await page.evaluate(() => window.__ebookTest.listBooks())
  const bookId = list[0].id
  await page.evaluate((id) => window.__ebookTest.openBook(id), bookId)
  await page.waitForFunction(() => window.__ebookTest?.ready?.(), null, { timeout: 30000 })
  await page.waitForTimeout(900)
  console.log('reader loaded')
  assert((await page.locator('button[title="最小化"]').count()) === 1, 'reader has a minimize button')
  assert((await page.locator('button[title="关闭到托盘"]').count()) === 1, 'reader has a close button')

  const read = () =>
    page.evaluate(() => ({
      top: window.__ebookTest.topSentence(),
      topCfi: window.__ebookTest.topCfi(),
      anchor: window.__ebookTest.anchorCfi(),
      visible: window.__ebookTest.anchorVisible(),
      chapter: window.__ebookTest.chapter(),
      pct: window.__ebookTest.percent()
    }))

  for (let index = 0; index < 4; index++) {
    await page.evaluate(() => window.__ebookTest.next())
    await page.waitForTimeout(550)
  }
  const before = await read()
  assert(Boolean(before.anchor), 'an anchor sentence exists after page turns')
  console.log(`anchor: ${before.top} (${before.pct.toFixed(3)})`)

  const sizes = [
    [1100, 760],
    [900, 620],
    [700, 520],
    [1280, 860],
    [600, 450]
  ]
  for (const [width, height] of sizes) {
    await page.evaluate(([w, h]) => window.resizeTo(w, h), [width, height])
    await page.waitForTimeout(1400)
    const after = await read()
    const layout = await page.evaluate(() => window.__ebookTest.layout())
    assert(after.anchor === before.anchor, `anchor CFI stable at ${width}x${height}`)
    assert(Math.abs(after.pct - before.pct) < 0.0001, `progress stable at ${width}x${height}`)
    assert(after.visible, `anchor still visible at ${width}x${height}`)
    assert(after.chapter === before.chapter, `chapter unchanged at ${width}x${height}`)
    assert(
      layout.settings && layout.viewer && Math.abs(layout.settings.width - layout.viewer[0]) <= 2,
      `epub layout follows window width at ${width}x${height}`
    )
  }

  const beforeNav = await read()
  await page.evaluate(() => document.querySelector('button[title="目录"]')?.click())
  await page.waitForTimeout(400)
  assert((await page.locator('.toc-item').count()) >= 2, 'table of contents has entries')
  await page.locator('.toc-item').nth(1).click()
  await page.waitForTimeout(1200)
  const afterToc = await read()
  assert(afterToc.chapter.includes('第二章'), 'TOC jump changes chapter')
  console.log(`  TOC chapter: ${afterToc.chapter}, progress ${afterToc.pct.toFixed(3)}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  const anchorBeforeFont = await read()
  await page.evaluate(() => document.querySelector('button[title="排版"]')?.click())
  await page.waitForTimeout(400)
  await page.locator('.settings-card .step-btn').last().click()
  await page.waitForTimeout(1300)
  const afterFont = await read()
  assert(afterFont.anchor === anchorBeforeFont.anchor, 'font size change keeps the anchor CFI')
  assert(afterFont.visible, 'font size change keeps the anchor visible')
  assert(
    Math.abs(afterFont.pct - anchorBeforeFont.pct) < 0.002,
    'font size change keeps progress stable'
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  await page.evaluate(() => document.querySelector('button[title="暗黑模式"]')?.click())
  await page.waitForTimeout(700)
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme applied')
  const iframeBackground = await page.evaluate(() => {
    const iframe = document.querySelector('.reader-viewer iframe')
    return iframe?.contentDocument ? getComputedStyle(iframe.contentDocument.body).backgroundColor : ''
  })
  console.log(`  reader background: ${iframeBackground}`)

  const cfi = await page.evaluate(() => window.__ebookTest.anchorCfi())
  const opened = await page.evaluate(
    async ({ bookId, cfi }) => window.api.stealth.open({ bookId, cfi }),
    { bookId, cfi }
  )
  assert(opened === true, 'stealth window requested')

  let stealthPage = null
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(250)
    stealthPage = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().includes('#/stealth'))
    if (stealthPage) break
  }
  assert(stealthPage, 'stealth window opened')
  await stealthPage.waitForFunction(() => window.__ebookTest?.ready?.(), null, { timeout: 20000 })
  await sleep(600)

  const stealthInfo = await stealthPage.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    html: getComputedStyle(document.documentElement).backgroundColor,
    ink: window.__ebookTest.ink(),
    before: window.__ebookTest.cfi()
  }))
  assert(stealthInfo.body === 'rgba(0, 0, 0, 0)', 'stealth page background is transparent')
  assert(stealthInfo.html === 'rgba(0, 0, 0, 0)', 'stealth root background is transparent')
  console.log(`  ink: ${stealthInfo.ink.color}, contrast ${stealthInfo.ink.contrast}`)
  assert(
    stealthInfo.ink.contrast >= 2.2 && stealthInfo.ink.contrast <= 4.2,
    'ink contrast stays subtle'
  )
  assert(/^rgba\(/.test(stealthInfo.ink.color), 'ink color is translucent')
  assert((await stealthPage.locator('.stealth-ch').count()) > 10, 'stealth renders per-character text')
  assert((await stealthPage.locator('.stealth-toolbar .tool-button').count()) === 2, 'stealth toolbar has hide/close controls')
  const inkColors = await stealthPage.evaluate(() =>
    [...document.querySelectorAll('.stealth-ch')].slice(0, 30).map((node) => getComputedStyle(node).color)
  )
  assert(inkColors.length > 10 && inkColors.every(Boolean), 'every visible glyph receives an ink color')

  const beforeKey = await stealthPage.evaluate(() => window.__ebookTest.cfi())
  await stealthPage.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  })
  await sleep(900)
  const afterKey = await stealthPage.evaluate(() => window.__ebookTest.cfi())
  console.log('  key turn:', beforeKey, '->', afterKey)
  assert(afterKey !== beforeKey, 'arrow key turns the stealth page')

  await stealthPage.screenshot({ path: join(artifacts, 'stealth.png'), omitBackground: true })
  console.log('stealth verified')
  console.log('E2E PASS')
} finally {
  try {
    await browser?.close()
  } catch {
    /* ignore */
  }
  child.kill()
  await sleep(500)
  await rm(join(root, '.tmp-e2e'), { recursive: true, force: true }).catch(() => undefined)
}
