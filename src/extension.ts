import * as vscode from 'vscode'
import { addHighlight } from './highlight'
import { TagCodeLensProvider } from './codelens'
import { registerCommands, handleWillSave } from './commands'
import { MemoryDiagnosticsProvider } from './memoryDiagnostics'

export function activate(context: vscode.ExtensionContext): void {
  addHighlight(context)

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'go' },
      new TagCodeLensProvider(),
    ),
  )

  registerCommands(context)

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(handleWillSave),
  )

  new MemoryDiagnosticsProvider().activate(context)
}

export function deactivate(): void {
  // subscriptions cleaned up automatically
}
