import * as vscode from 'vscode'
import { parseStructs, parseStructsWithFields } from './parser'
import { t, tf } from './i18n'
import {
  TransformMode,
  structNeedsTransform,
  readSortOptions,
  readAlignColumnThreshold,
  readAlignMaxColumnGap,
} from './engine'
import { optimalOrder, Architecture } from './memory'

interface LensAction {
  title: string
  command: string
  mode: TransformMode
}

function actionsFromSettings(): LensAction[] {
  const cfg = vscode.workspace.getConfiguration('goStructTags')
  const autoSort = cfg.get<boolean>('autoSortOnSave') ?? false
  const autoAlign = cfg.get<boolean>('autoAlignOnSave') ?? false

  if (autoSort && autoAlign) {
    return [
      {
        title: t('Sort & Align Tags'),
        command: 'goStructTags.sortAndAlignTags',
        mode: 'sort-align',
      },
    ]
  }
  if (autoSort) {
    return [
      { title: t('Sort Tags'), command: 'goStructTags.sortTags', mode: 'sort' },
    ]
  }
  if (autoAlign) {
    return [
      { title: t('Sort Tags'), command: 'goStructTags.sortTags', mode: 'sort' },
      {
        title: t('Align Tags'),
        command: 'goStructTags.alignTags',
        mode: 'align',
      },
    ]
  }

  return [
    {
      title: t('Sort & Align Tags'),
      command: 'goStructTags.sortAndAlignTags',
      mode: 'sort-align',
    },
    { title: t('Sort Tags'), command: 'goStructTags.sortTags', mode: 'sort' },
    {
      title: t('Align Tags'),
      command: 'goStructTags.alignTags',
      mode: 'align',
    },
  ]
}

/** Provides three CodeLens actions above each Go struct that has tagged fields: Sort & Align, Sort, Align. */
export class TagCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
  private readonly configListener: vscode.Disposable
  readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event

  constructor() {
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('goStructTags.autoSortOnSave') ||
        e.affectsConfiguration('goStructTags.autoAlignOnSave') ||
        e.affectsConfiguration('goStructTags.memory.enable') ||
        e.affectsConfiguration('goStructTags.memory.architecture')
      ) {
        this.onDidChangeEmitter.fire()
      }
    })
  }

  dispose(): void {
    this.configListener.dispose()
    this.onDidChangeEmitter.dispose()
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'go') {
      return []
    }
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      return []
    }
    if (!vscode.workspace.fs.isWritableFileSystem(document.uri.scheme)) {
      return []
    }

    const structs = parseStructs(document)
    const lenses: vscode.CodeLens[] = []
    const actions = actionsFromSettings()
    const lines = document.getText().split('\n')
    const opts = readSortOptions()
    const columnThreshold = readAlignColumnThreshold()
    const maxColumnGap = readAlignMaxColumnGap()

    for (const s of structs) {
      if (s.fields.length === 0) {
        continue
      }

      const lineRange = new vscode.Range(s.startLine, 0, s.startLine, 0)
      const arg: StructArg = { startLine: s.startLine, endLine: s.endLine }

      for (const action of actions) {
        if (
          !structNeedsTransform(
            s,
            action.mode,
            lines,
            opts,
            columnThreshold,
            maxColumnGap,
          )
        ) {
          continue
        }
        lenses.push(
          new vscode.CodeLens(lineRange, {
            title: action.title,
            command: action.command,
            arguments: [arg],
          }),
        )
      }
    }

    const cfg = vscode.workspace.getConfiguration('goStructTags')
    if (cfg.get<boolean>('memory.enable') ?? true) {
      const arch = (cfg.get<string>('memory.architecture') ??
        'amd64') as Architecture
      const allStructs = parseStructsWithFields(document)

      for (const s of allStructs) {
        if (s.noReorder || s.allFields.length < 2) {
          continue
        }
        const result = optimalOrder(s.allFields, arch)
        if (!result.reordered) {
          continue
        }
        const lineRange = new vscode.Range(s.startLine, 0, s.startLine, 0)
        const arg: StructArg = { startLine: s.startLine, endLine: s.endLine }
        const title =
          result.bytesSaved > 0
            ? tf('Optimize layout (save {0} bytes)', result.bytesSaved)
            : t('Optimize field order')
        lenses.push(
          new vscode.CodeLens(lineRange, {
            title,
            command: 'goStructTags.optimizeLayout',
            arguments: [arg],
          }),
        )
      }
    }

    return lenses
  }
}

/** Struct boundaries passed as a command argument by a CodeLens click. */
export interface StructArg {
  /** 0-based line of the `type X struct {` declaration. */
  startLine: number
  /** 0-based line of the closing `}`. */
  endLine: number
}
