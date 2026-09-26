/**
 * Run the same diagnostics as the VS Code Tailwind CSS IntelliSense extension.
 *
 * Usage:
 *   pnpm check:tailwind
 *   pnpm check:tailwind --fix
 *   pnpm check:tailwind --verbose
 *
 * Set TAILWINDCSS_LANGUAGE_SERVER to override automatic server discovery.
 */
import { fork } from 'node:child_process'
import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const workspacePath = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspaceUri = pathToFileURL(workspacePath).href
const verbose = process.argv.includes('--verbose')
const fix = process.argv.includes('--fix')
const requestedFilePaths = process.argv
  .slice(2)
  .filter((argument) => !argument.startsWith('-'))
  .map((path) => resolve(workspacePath, path))

function pathKey(path) {
  const absolutePath = resolve(path)
  return process.platform === 'win32'
    ? absolutePath.toLowerCase()
    : absolutePath
}

const requestedFixPaths =
  requestedFilePaths.length === 0
    ? null
    : new Set(requestedFilePaths.map(pathKey))

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findLanguageServer() {
  if (process.env.TAILWINDCSS_LANGUAGE_SERVER) {
    const explicitPath = resolve(process.env.TAILWINDCSS_LANGUAGE_SERVER)
    if (await exists(explicitPath)) return explicitPath
    throw new Error(
      `TAILWINDCSS_LANGUAGE_SERVER does not exist: ${explicitPath}`,
    )
  }

  const projectServerPath = join(
    workspacePath,
    'node_modules',
    '@tailwindcss',
    'language-server',
    'bin',
    'tailwindcss-language-server',
  )
  if (await exists(projectServerPath)) return projectServerPath

  const extensionRoots = [
    process.env.VSCODE_EXTENSIONS,
    join(homedir(), '.vscode', 'extensions'),
    join(homedir(), '.vscode-insiders', 'extensions'),
  ].filter(Boolean)

  for (const extensionRoot of extensionRoots) {
    let entries
    try {
      entries = await readdir(extensionRoot, { withFileTypes: true })
    } catch {
      continue
    }

    const extensions = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith('bradlc.vscode-tailwindcss-'),
      )
      .sort((left, right) =>
        right.name.localeCompare(left.name, undefined, { numeric: true }),
      )

    for (const extension of extensions) {
      const serverPath = join(
        extensionRoot,
        extension.name,
        'dist',
        'tailwindServer.js',
      )
      if (await exists(serverPath)) return serverPath
    }
  }

  throw new Error(
    'Tailwind CSS language server was not found. Run pnpm install, install the bradlc.vscode-tailwindcss VS Code extension, or set TAILWINDCSS_LANGUAGE_SERVER.',
  )
}

const settings = {
  tailwindCSS: {
    validate: true,
    classAttributes: ['class', 'className', 'ngClass', 'class:list'],
    classFunctions: ['cn', 'cva', 'clsx'],
    includeLanguages: {},
    files: {
      exclude: ['**/.git/**', '**/node_modules/**', '**/.output/**'],
    },
    lint: {
      cssConflict: 'warning',
      invalidApply: 'error',
      invalidScreen: 'error',
      invalidVariant: 'error',
      deprecatedAtRule: 'warning',
      invalidConfigPath: 'error',
      invalidTailwindDirective: 'error',
      recommendedVariantOrder: 'warning',
      usedBlocklistedClass: 'warning',
      suggestCanonicalClasses: 'warning',
    },
  },
  editor: { quickSuggestions: { strings: true } },
  files: { exclude: {} },
}

const languageIds = new Map([
  ['.cjs', 'javascript'],
  ['.cts', 'typescript'],
  ['.css', 'css'],
  ['.html', 'html'],
  ['.js', 'javascript'],
  ['.jsx', 'javascriptreact'],
  ['.mjs', 'javascript'],
  ['.mts', 'typescript'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescriptreact'],
])

const automaticallyFixableCodes = new Set([
  'deprecatedAtRule',
  'invalidConfigPath',
  'invalidScreen',
  'invalidTailwindDirective',
  'invalidVariant',
  'recommendedVariantOrder',
  'suggestCanonicalClasses',
])

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)))
    } else if (languageIds.has(extname(entry.name))) {
      files.push(path)
    }
  }

  return files
}

const serverPath = await findLanguageServer()
const child = fork(serverPath, ['--node-ipc'], {
  cwd: workspacePath,
  silent: true,
})

let nextId = 1
let lastDiagnosticAt = Date.now()
let serverExited = false
let resolveProjectInitialized
let resolveServerExit

const pending = new Map()
const diagnostics = new Map()
const documents = new Map()
const serverLogs = []
const serverWarnings = new Set()

const projectInitialized = new Promise((resolveProject) => {
  resolveProjectInitialized = resolveProject
})
const serverExit = new Promise((resolveExit) => {
  resolveServerExit = resolveExit
})

function send(message) {
  if (!child.connected) {
    throw new Error('Tailwind language server IPC channel closed')
  }
  child.send(message)
}

function request(method, params) {
  const id = nextId++
  send({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolveRequest, rejectRequest) => {
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
  })
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function handleServerRequest(message) {
  if (message.method === 'workspace/configuration') {
    respond(
      message.id,
      message.params.items.map(({ section }) => settings[section] ?? null),
    )
    return
  }

  if (message.method === 'workspace/workspaceFolders') {
    respond(message.id, [{ uri: workspaceUri, name: 'lc3sim' }])
    return
  }

  if (message.method === 'workspace/applyEdit') {
    respond(message.id, { applied: false })
    return
  }

  if (message.method === '@/tailwindCSS/getDocumentSymbols') {
    respond(message.id, [])
    return
  }

  respond(message.id, null)
}

function handleMessage(message) {
  if (message.id !== undefined && message.method) {
    handleServerRequest(message)
    return
  }

  if (message.id !== undefined) {
    const callback = pending.get(message.id)
    if (!callback) return
    pending.delete(message.id)
    if (message.error) callback.reject(new Error(message.error.message))
    else callback.resolve(message.result)
    return
  }

  if (message.method === 'textDocument/publishDiagnostics') {
    diagnostics.set(message.params.uri, message.params.diagnostics)
    lastDiagnosticAt = Date.now()
    return
  }

  if (message.method === '@/tailwindCSS/projectInitialized') {
    resolveProjectInitialized()
  }

  const logMessage = message.params?.message
  if (typeof logMessage === 'string') {
    serverLogs.push(`${message.method}: ${logMessage}`)

    const isWarning =
      message.method === '@/tailwindCSS/warn' ||
      ((message.method === 'window/logMessage' ||
        message.method === 'window/showMessage') &&
        message.params.type === 2) ||
      logMessage.startsWith('hoist-at-import:')

    if (isWarning) serverWarnings.add(logMessage)
  }
}

child.on('message', handleMessage)
child.stdout.on('data', (chunk) => {
  const message = chunk.toString('utf8').trim()
  if (message) serverLogs.push(message)
})
child.stderr.on('data', (chunk) => {
  const message = chunk.toString('utf8').trim()
  if (message) serverLogs.push(message)
})
child.on('error', (error) => serverLogs.push(error.stack ?? error.message))
child.on('exit', (code, signal) => {
  serverExited = true
  resolveServerExit()
  if (code !== 0) {
    serverLogs.push(`Server exited with code ${code} and signal ${signal}`)
  }
  for (const { reject } of pending.values()) {
    reject(new Error('Tailwind language server exited'))
  }
  pending.clear()
})

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function waitForProject() {
  await Promise.race([
    projectInitialized,
    delay(15_000).then(() => {
      throw new Error('Timed out while initializing the Tailwind project')
    }),
  ])
}

async function waitForDiagnostics() {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 15_000) {
    const quiet = Date.now() - lastDiagnosticAt > 2_000
    if (diagnostics.size > 0 && quiet) return
    if (serverExited) throw new Error('Tailwind language server exited early')
    await delay(100)
  }

  throw new Error('Timed out while collecting Tailwind diagnostics')
}

function canFixDocument(uri) {
  const document = documents.get(uri)
  if (!document) return false
  return (
    requestedFixPaths === null || requestedFixPaths.has(pathKey(document.path))
  )
}

function offsetAt(text, position) {
  let offset = 0
  for (let line = 0; line < position.line; line++) {
    const newline = text.indexOf('\n', offset)
    if (newline === -1) return text.length
    offset = newline + 1
  }
  return Math.min(offset + position.character, text.length)
}

function actionEdits(action) {
  if (
    action.kind !== 'quickfix' ||
    action.command ||
    !action.edit?.changes ||
    action.edit.documentChanges
  ) {
    return null
  }

  const edits = []
  for (const [uri, documentEdits] of Object.entries(action.edit.changes)) {
    if (!canFixDocument(uri)) return null
    for (const edit of documentEdits) edits.push({ uri, ...edit })
  }
  return edits.length > 0 ? edits : null
}

async function applySafeQuickFixes() {
  const editsByDocument = new Map()

  for (const [uri, issues] of diagnostics) {
    if (!canFixDocument(uri)) continue

    for (const issue of issues) {
      if (!automaticallyFixableCodes.has(issue.code)) continue

      const actions = await request('textDocument/codeAction', {
        textDocument: { uri },
        range: issue.range,
        context: {
          diagnostics: [issue],
          only: ['quickfix'],
          triggerKind: 1,
        },
      })
      const applicableActions = (actions ?? [])
        .map((action) => actionEdits(action))
        .filter(Boolean)

      if (applicableActions.length !== 1) continue
      for (const edit of applicableActions[0]) {
        const edits = editsByDocument.get(edit.uri) ?? []
        edits.push(edit)
        editsByDocument.set(edit.uri, edits)
      }
    }
  }

  let editCount = 0
  let documentCount = 0

  for (const [uri, edits] of editsByDocument) {
    const document = documents.get(uri)
    if (!document) continue

    const uniqueEdits = [
      ...new Map(
        edits.map((edit) => [JSON.stringify([edit.range, edit.newText]), edit]),
      ).values(),
    ]
      .map((edit) => ({
        ...edit,
        start: offsetAt(document.text, edit.range.start),
        end: offsetAt(document.text, edit.range.end),
      }))
      .sort((left, right) => right.start - left.start || right.end - left.end)

    let nextEditStart = Number.POSITIVE_INFINITY
    if (
      uniqueEdits.some((edit) => {
        const overlaps = edit.end > nextEditStart
        nextEditStart = edit.start
        return overlaps
      })
    ) {
      continue
    }

    let nextText = document.text
    for (const edit of uniqueEdits) {
      nextText =
        nextText.slice(0, edit.start) + edit.newText + nextText.slice(edit.end)
    }

    if (nextText === document.text) continue
    await writeFile(document.path, nextText, 'utf8')
    document.text = nextText
    document.version++
    editCount += uniqueEdits.length
    documentCount++
  }

  return { documentCount, editCount }
}

async function refreshDiagnostics() {
  diagnostics.clear()
  lastDiagnosticAt = Date.now()

  for (const [uri, document] of documents) {
    document.version++
    send({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri, version: document.version },
        contentChanges: [{ text: document.text }],
      },
    })
  }

  await waitForDiagnostics()
}

async function stopServer() {
  if (!serverExited) {
    const shutdownRequest = request('shutdown', null).catch(() => null)
    await Promise.race([shutdownRequest, delay(2_000)])

    if (!serverExited && child.connected) {
      send({ jsonrpc: '2.0', method: 'exit', params: null })
    }
    if (child.connected) child.disconnect()
  }

  await Promise.race([serverExit, delay(1_000)])
  if (!serverExited) child.kill()
}

try {
  await request('initialize', {
    processId: process.pid,
    clientInfo: { name: 'Tailwind diagnostics script', version: '1.0.0' },
    rootUri: workspaceUri,
    rootPath: workspacePath,
    workspaceFolders: [{ uri: workspaceUri, name: 'lc3sim' }],
    capabilities: {
      workspace: {
        configuration: true,
        workspaceFolders: true,
        didChangeWatchedFiles: { dynamicRegistration: true },
      },
      textDocument: {
        codeAction: {
          codeActionLiteralSupport: {
            codeActionKind: { valueSet: ['quickfix'] },
          },
          dynamicRegistration: false,
        },
        publishDiagnostics: {
          relatedInformation: true,
          tagSupport: { valueSet: [1, 2] },
        },
      },
    },
    initializationOptions: {},
  })
  send({ jsonrpc: '2.0', method: 'initialized', params: {} })

  const files = await collectFiles(join(workspacePath, 'src'))
  files.sort((left, right) => {
    if (left.endsWith('styles.css')) return -1
    if (right.endsWith('styles.css')) return 1
    return left.localeCompare(right)
  })

  const [stylesheetPath, ...sourcePaths] = files
  const stylesheetText = await readFile(stylesheetPath, 'utf8')
  const stylesheetUri = pathToFileURL(stylesheetPath).href
  documents.set(stylesheetUri, {
    path: stylesheetPath,
    text: stylesheetText,
    version: 1,
  })
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: stylesheetUri,
        languageId: languageIds.get(extname(stylesheetPath)),
        version: 1,
        text: stylesheetText,
      },
    },
  })

  await waitForProject()
  diagnostics.clear()
  lastDiagnosticAt = Date.now()
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didChange',
    params: {
      textDocument: {
        uri: stylesheetUri,
        version: 2,
      },
      contentChanges: [{ text: stylesheetText }],
    },
  })
  documents.get(stylesheetUri).version = 2

  for (const path of sourcePaths) {
    const uri = pathToFileURL(path).href
    const text = await readFile(path, 'utf8')
    documents.set(uri, { path, text, version: 1 })
    send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: languageIds.get(extname(path)),
          version: 1,
          text,
        },
      },
    })
  }

  await waitForDiagnostics()

  let fixedEditCount = 0
  let fixedDocumentCount = 0
  if (fix) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await applySafeQuickFixes()
      if (result.editCount === 0) break
      fixedEditCount += result.editCount
      fixedDocumentCount += result.documentCount
      await refreshDiagnostics()
    }
  }

  let issueCount = 0
  for (const [uri, issues] of [...diagnostics.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const path = relative(workspacePath, fileURLToPath(uri)).replaceAll(
      '\\',
      '/',
    )

    for (const issue of issues) {
      issueCount++
      const severity =
        ['', 'error', 'warning', 'information', 'hint'][issue.severity] ??
        'unknown'
      const location = `${path}:${issue.range.start.line + 1}:${issue.range.start.character + 1}`
      console.log(
        `${severity} ${location} [${issue.code ?? 'tailwindcss'}] ${issue.message}`,
      )
    }
  }

  for (const warning of serverWarnings) {
    issueCount++
    console.log(`warning [tailwindcss-server] ${warning}`)
  }

  if (fixedEditCount > 0) {
    console.log(
      `Applied ${fixedEditCount} safe quick fix(es) across ${fixedDocumentCount} file update(s).`,
    )
  }

  console.log(
    `Tailwind CSS IntelliSense: ${issueCount} issue(s); scanned ${files.length} files.`,
  )
  if (verbose && serverLogs.length > 0) console.log(serverLogs.join('\n'))

  await stopServer()
  process.exitCode = issueCount === 0 ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  if (serverLogs.length > 0) console.error(serverLogs.join('\n'))
  if (!serverExited) child.kill()
  process.exitCode = 2
}
