import * as vscode from 'vscode'
import {
  TransformMode,
  buildEdits,
  findStructAtLine,
  findStructBySpan,
} from '../engine'
import { parseStructs, parseStructsWithFields } from '../parser'
import { StructArg } from '../codelens'
import { optimalOrder, Architecture } from '../memory'
import { reorderFields } from '../operations'

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'goStructTags.sortTags',
      (arg?: StructArg) => runStructMode('sort', arg),
    ),
    vscode.commands.registerCommand(
      'goStructTags.alignTags',
      (arg?: StructArg) => runStructMode('align', arg),
    ),
    vscode.commands.registerCommand(
      'goStructTags.sortAndAlignTags',
      (arg?: StructArg) => runStructMode('sort-align', arg),
    ),
    vscode.commands.registerCommand(
      'goStructTags.sortTagsAll',
      (doc?: vscode.TextDocument) => runAllMode('sort', doc),
    ),
    vscode.commands.registerCommand(
      'goStructTags.alignTagsAll',
      (doc?: vscode.TextDocument) => runAllMode('align', doc),
    ),
    vscode.commands.registerCommand(
      'goStructTags.sortAndAlignTagsAll',
      (doc?: vscode.TextDocument) => runAllMode('sort-align', doc),
    ),
    vscode.commands.registerCommand(
      'goStructTags.optimizeLayout',
      (arg?: StructArg) => runOptimizeLayout(arg),
    ),
  )
}

export function handleWillSave(event: vscode.TextDocumentWillSaveEvent): void {
  const document = event.document
  if (document.languageId !== 'go') {
    return
  }

  const mode = modeFromSettings()
  if (!mode) {
    return
  }

  const edits = buildEdits(document, mode)
  if (edits.length > 0) {
    event.waitUntil(Promise.resolve(edits))
  }
}

async function runStructMode(
  mode: TransformMode,
  arg?: StructArg,
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'go') {
    return
  }

  const structs = parseStructs(editor.document)
  const target =
    arg !== undefined
      ? findStructBySpan(structs, arg)
      : findStructAtLine(structs, editor.selection.active.line)
  if (!target) {
    return
  }

  const edits = buildEdits(editor.document, mode, target)
  await applyEditorEdits(editor, edits)
}

async function runAllMode(
  mode: TransformMode,
  explicitDocument?: vscode.TextDocument,
): Promise<void> {
  const editor = resolveEditor(explicitDocument)
  if (!editor || editor.document.languageId !== 'go') {
    return
  }
  const edits = buildEdits(editor.document, mode)
  await applyEditorEdits(editor, edits)
}

function resolveEditor(
  document?: vscode.TextDocument,
): vscode.TextEditor | undefined {
  if (!document) {
    return vscode.window.activeTextEditor
  }
  return vscode.window.visibleTextEditors.find((e) => e.document === document)
}

function modeFromSettings(): TransformMode | undefined {
  const cfg = vscode.workspace.getConfiguration('goStructTags')
  const autoSort = cfg.get<boolean>('autoSortOnSave')
  const autoAlign = cfg.get<boolean>('autoAlignOnSave')
  if (autoSort && autoAlign) {
    return 'sort-align'
  }
  if (autoSort) {
    return 'sort'
  }
  if (autoAlign) {
    return 'align'
  }
  return undefined
}

async function runOptimizeLayout(arg?: StructArg): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'go') {
    return
  }

  const structs = parseStructsWithFields(editor.document)
  const target =
    arg !== undefined
      ? structs.find(
          (s) => s.startLine === arg.startLine && s.endLine === arg.endLine,
        )
      : structs.find(
          (s) =>
            s.startLine <= editor.selection.active.line &&
            s.endLine >= editor.selection.active.line,
        )

  if (!target || target.noReorder || target.allFields.length < 2) {
    return
  }

  const cfg = vscode.workspace.getConfiguration('goStructTags')
  const arch = (cfg.get<string>('memory.architecture') ??
    'amd64') as Architecture
  const result = optimalOrder(target.allFields, arch)
  if (!result.reordered) {
    return
  }

  const lines = editor.document.getText().split('\n')
  const newBodyLines = reorderFields(
    lines,
    target.startLine,
    target.endLine,
    result.orderedNames,
  )

  const startPos = new vscode.Position(target.startLine + 1, 0)
  const endPos = new vscode.Position(target.endLine, 0)
  const range = new vscode.Range(startPos, endPos)
  const newText = newBodyLines.join('\n') + '\n'

  await editor.edit((builder) => builder.replace(range, newText))
}

async function applyEditorEdits(
  editor: vscode.TextEditor,
  edits: vscode.TextEdit[],
): Promise<void> {
  if (edits.length === 0) {
    return
  }
  await editor.edit((builder) => {
    for (const edit of edits) {
      builder.replace(edit.range, edit.newText)
    }
  })
}
