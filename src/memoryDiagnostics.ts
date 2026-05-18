import * as vscode from 'vscode'
import { parseStructsWithFields } from './parser'
import { optimalOrder, Architecture } from './memory'
import { debounced } from './utils'
import { tf, t } from './i18n'

export class MemoryDiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection
  private readonly debouncedUpdate: (doc: vscode.TextDocument) => void
  private readonly listeners: vscode.Disposable[] = []

  constructor() {
    this.collection =
      vscode.languages.createDiagnosticCollection('go-struct-memory')
    this.debouncedUpdate = debounced(
      (doc: vscode.TextDocument) => this.update(doc),
      300,
    )
  }

  activate(context: vscode.ExtensionContext): void {
    this.listeners.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === 'go') {
          this.debouncedUpdate(e.document)
        }
      }),

      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === 'go') {
          this.debouncedUpdate(doc)
        }
      }),

      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.collection.delete(doc.uri)
      }),

      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('goStructTags.memory')) {
          for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'go') {
              this.debouncedUpdate(doc)
            }
          }
        }
      }),
    )

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'go') {
        this.debouncedUpdate(doc)
      }
    }

    context.subscriptions.push(this)
  }

  dispose(): void {
    this.collection.dispose()
    for (const l of this.listeners) {
      l.dispose()
    }
  }

  private update(doc: vscode.TextDocument): void {
    const cfg = vscode.workspace.getConfiguration('goStructTags')
    const enabled = cfg.get<boolean>('memory.enable') ?? true
    if (!enabled) {
      this.collection.delete(doc.uri)
      return
    }

    const arch = (cfg.get<string>('memory.architecture') ??
      'amd64') as Architecture
    const severityStr = cfg.get<string>('memory.severity') ?? 'hint'
    const severity = severityFromString(severityStr)

    const structs = parseStructsWithFields(doc)
    const diagnostics: vscode.Diagnostic[] = []

    for (const s of structs) {
      if (s.noReorder || s.allFields.length < 2) {
        continue
      }
      const result = optimalOrder(s.allFields, arch)
      if (!result.reordered) {
        continue
      }

      const lineText = doc.lineAt(s.startLine).text
      const nameStart = lineText.indexOf(s.name)
      const range = new vscode.Range(
        s.startLine,
        nameStart,
        s.startLine,
        nameStart + s.name.length,
      )

      const message =
        result.bytesSaved > 0
          ? tf(
              'Memory: {0} bytes wasted in padding — reorder fields to save',
              result.bytesSaved,
            )
          : t(
              'Memory: pointer-bearing fields should precede non-pointer fields',
            )

      const diag = new vscode.Diagnostic(range, message, severity)
      diag.source = 'go-struct-tags'
      diagnostics.push(diag)
    }

    this.collection.set(doc.uri, diagnostics)
  }
}

function severityFromString(s: string): vscode.DiagnosticSeverity {
  switch (s) {
    case 'error':
      return vscode.DiagnosticSeverity.Error
    case 'warning':
      return vscode.DiagnosticSeverity.Warning
    case 'information':
      return vscode.DiagnosticSeverity.Information
    default:
      return vscode.DiagnosticSeverity.Hint
  }
}
