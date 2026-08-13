import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import {
  assertRuntimeFiles,
  childEnvironment,
  dshBinPath,
  parseReadyUrl,
  runtimeNodePath,
} from './runtime.mjs'

const STARTUP_TIMEOUT_MS = 90_000
let mainWindow
let dshProcess
let shuttingDown = false

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

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('file:')) {
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
  const binPath = dshBinPath({ appPath: app.getAppPath() })
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
      void mainWindow?.loadURL(readyUrl)
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
    if (!shuttingDown && !settled) showStartupError(`DeepSeek Harness exited during startup (code ${code ?? 'unknown'}).`)
  })
}

function showStartupError(message) {
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
