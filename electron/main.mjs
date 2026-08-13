import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import {
  assertRuntimeFiles,
  childEnvironment,
  dshBinPath,
  isAllowedNavigation,
  parseReadyUrl,
  runtimeNodePath,
} from './runtime.mjs'

const STARTUP_TIMEOUT_MS = 90_000
const UI_TIMEOUT_MS = 60_000
const smokeTest = process.env.ADHD_SMOKE_TEST === '1'
let mainWindow
let dshProcess
let shuttingDown = false
let fatalShown = false
let harnessOrigin

if (process.env.ADHD_USER_DATA_DIR) {
  if (!isAbsolute(process.env.ADHD_USER_DATA_DIR)) throw new Error('ADHD_USER_DATA_DIR must be an absolute path')
  app.setPath('userData', process.env.ADHD_USER_DATA_DIR)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: 'ADHD — DeepSeek Harness Desktop',
    backgroundColor: '#090b10',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => { if (!smokeTest) mainWindow?.show() })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, harnessOrigin)) {
      event.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  void mainWindow.loadFile(join(import.meta.dirname, 'loading.html'))
}

function writeLog(stream, source, chunk) {
  const text = chunk.toString()
  stream.write(`[${new Date().toISOString()}] [${source}] ${text}`)
  return text
}

function startHarness() {
  const dshHome = join(app.getPath('userData'), 'dsh-home')
  const logsDirectory = join(app.getPath('userData'), 'logs')
  mkdirSync(dshHome, { recursive: true })
  mkdirSync(logsDirectory, { recursive: true })

  const nodePath = runtimeNodePath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
  })
  const binPath = dshBinPath({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  })
  assertRuntimeFiles({ 'Node runtime': nodePath, 'DeepSeek Harness CLI': binPath })

  const log = createWriteStream(join(logsDirectory, 'dsh.log'), { flags: 'a' })
  const workspace = process.env.ADHD_WORKSPACE || app.getPath('home')
  dshProcess = spawn(nodePath, [binPath, 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: workspace,
    env: childEnvironment({ dshHome, isPackaged: app.isPackaged }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })

  let combinedOutput = ''
  let settled = false
  const timeout = setTimeout(() => {
    if (!settled) showStartupError(`DeepSeek Harness did not become ready within ${STARTUP_TIMEOUT_MS / 1000} seconds.`)
  }, STARTUP_TIMEOUT_MS)

  const onOutput = (source, chunk) => {
    combinedOutput = (combinedOutput + writeLog(log, source, chunk)).slice(-32_768)
    const readyUrl = parseReadyUrl(combinedOutput)
    if (!settled && readyUrl) {
      settled = true
      clearTimeout(timeout)
      void openHarness(readyUrl)
    }
  }
  dshProcess.stdout.on('data', chunk => onOutput('stdout', chunk))
  dshProcess.stderr.on('data', chunk => onOutput('stderr', chunk))
  dshProcess.on('error', error => {
    log.end()
    if (!settled) showStartupError(error.message)
  })
  dshProcess.on('exit', code => {
    clearTimeout(timeout)
    log.end()
    if (!shuttingDown) {
      const phase = settled ? 'stopped unexpectedly' : 'exited during startup'
      showStartupError(`DeepSeek Harness ${phase} (code ${code ?? 'unknown'}).`)
    }
  })
}

async function openHarness(readyUrl) {
  try {
    harnessOrigin = new URL(readyUrl).origin
    await mainWindow?.loadURL(readyUrl)
    if (!smokeTest) return
    const result = await waitForUiReady()
    writeFileSync(join(app.getPath('userData'), 'smoke-ready.json'), JSON.stringify({ readyUrl, ...result }, null, 2))
    app.quit()
  } catch (error) {
    showStartupError(error instanceof Error ? error.message : String(error))
  }
}

async function waitForUiReady() {
  const deadline = Date.now() + UI_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await mainWindow?.webContents.executeJavaScript(`({
      title: document.title,
      pluginCount: window.__DSH_BOOT__?.entries?.length ?? 0,
      rootChildren: document.querySelector('#root')?.childElementCount ?? 0
    })`)
    if (result?.pluginCount >= 20 && result.rootChildren > 0) return result
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Harness UI did not render within ${UI_TIMEOUT_MS / 1000} seconds`)
}

function showStartupError(message) {
  if (fatalShown) return
  fatalShown = true
  if (smokeTest) {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(join(app.getPath('userData'), 'smoke-failure.json'), JSON.stringify({ message }, null, 2))
    stopHarness()
    app.exit(1)
    return
  }
  void dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'ADHD could not start',
    message,
    detail: `See ${join(app.getPath('userData'), 'logs', 'dsh.log')} for details.`,
  }).finally(() => app.quit())
}

function stopHarness() {
  shuttingDown = true
  if (!dshProcess || dshProcess.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(dshProcess.pid), '/t', '/f'], { windowsHide: true })
  } else {
    try { process.kill(-dshProcess.pid, 'SIGTERM') } catch { dshProcess.kill('SIGTERM') }
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })
  app.whenReady().then(() => {
    createWindow()
    try { startHarness() } catch (error) { showStartupError(error instanceof Error ? error.message : String(error)) }
  })
  app.on('before-quit', stopHarness)
  app.on('window-all-closed', () => app.quit())
}
