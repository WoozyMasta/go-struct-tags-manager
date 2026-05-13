import * as vscode from 'vscode'
import { debounced } from './utils'

const CFG = 'goStructTags'

/** Collected decoration ranges for all tag components found in the document. */
interface TagRanges {
  /** Ranges covering tag keys, e.g. `json`, `yaml`. */
  keys: vscode.Range[]
  /** Ranges covering plain tag values, e.g. `my_field`. */
  values: vscode.Range[]
  /** Ranges covering option segments (`key=val` pairs inside a tag value). */
  options: vscode.Range[]
  /** Ranges covering comma separators within tag values. */
  separators: vscode.Range[]
}

const reMatchLine = /(`[^`]+`)/
const reTag = /(\w[\w-]*):"([^"]*)"/g
const reOption = /\w[\w-]*(=)([^,]+)/g

export function addHighlight(context: vscode.ExtensionContext): void {
  let { types, update } = buildDecorator(context)

  update()

  context.subscriptions.push(
    // Use () => update() so the closure always calls the *current* update after
    // onDidChangeConfiguration replaces it; passing update directly captures the
    // initial value and ignores the reassignment.
    vscode.window.onDidChangeActiveTextEditor(() => update()),
    vscode.workspace.onDidChangeTextDocument(() => update()),
    vscode.workspace.onDidOpenTextDocument(() => update()),
    vscode.window.onDidChangeVisibleTextEditors(() => update()),
    vscode.workspace.onDidChangeConfiguration(() => {
      types.dispose()
      ;({ types, update } = buildDecorator(context))
      update()
    }),
  )
}

/** Bundle of decoration types created from the current color settings, one per tag component. */
interface DecoTypes {
  /** Decoration type applied to tag keys. */
  key: vscode.TextEditorDecorationType
  /** Decoration type applied to plain tag values. */
  value: vscode.TextEditorDecorationType
  /** Decoration type applied to option segments (`key=val`). */
  option: vscode.TextEditorDecorationType
  /** Decoration type applied to comma separators. */
  separator: vscode.TextEditorDecorationType
  /** Disposes all four decoration types at once. */
  dispose(): void
}

/**
 * Creates decoration types from current color settings and returns the update helper.
 * Must be called again whenever settings change so that `noop` and color values are re-evaluated.
 *
 * @param context - Extension context used to register disposables.
 * @returns Decoration type bundle plus `update` (debounced apply to all visible Go editors).
 */
function buildDecorator(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration(CFG)
  const keyColor = cfg.get<string>('colors.key') || ''
  const valueColor = cfg.get<string>('colors.value') || ''
  const optionColor = cfg.get<string>('colors.option') || ''
  const separatorColor = cfg.get<string>('colors.separator') || ''

  // If all colors empty, skip decoration entirely — grammar handles coloring
  const noop = !keyColor && !valueColor && !optionColor && !separatorColor

  const makeType = (color: string) =>
    vscode.window.createTextEditorDecorationType(color ? { color } : {})

  const types: DecoTypes = {
    key: makeType(keyColor),
    value: makeType(valueColor),
    option: makeType(optionColor),
    separator: makeType(separatorColor),
    dispose() {
      this.key.dispose()
      this.value.dispose()
      this.option.dispose()
      this.separator.dispose()
    },
  }

  context.subscriptions.push(
    types.key,
    types.value,
    types.option,
    types.separator,
  )

  /**
   * Applies or clears decorations for a single editor.
   * When `noop` is true (no color overrides configured) all decoration ranges are set to empty,
   * leaving the TextMate grammar as the sole coloring mechanism.
   *
   * @param editor - The editor to decorate.
   */
  const applyToEditor = (editor: vscode.TextEditor) => {
    if (editor.document.languageId !== 'go') {
      return
    }
    if (noop) {
      editor.setDecorations(types.key, [])
      editor.setDecorations(types.value, [])
      editor.setDecorations(types.option, [])
      editor.setDecorations(types.separator, [])
      return
    }
    const ranges = collectRanges(editor.document)
    editor.setDecorations(types.key, ranges.keys)
    editor.setDecorations(types.value, ranges.values)
    editor.setDecorations(types.option, ranges.options)
    editor.setDecorations(types.separator, ranges.separators)
  }

  /** Debounced: re-applies decorations to all currently visible Go editors. */
  const update = debounced(() => {
    for (const editor of vscode.window.visibleTextEditors) {
      applyToEditor(editor)
    }
  }, 50)

  return { types, update }
}

/**
 * Scans a Go document and returns decoration ranges for every tag component.
 * Skips lines where the backtick appears after a `//` comment or inside a double-quoted string.
 *
 * @param document - The Go source document to scan.
 * @returns Sets of ranges for keys, values, options (`key=val` segments), and separators (`,`).
 */
function collectRanges(document: vscode.TextDocument): TagRanges {
  const keys: vscode.Range[] = []
  const values: vscode.Range[] = []
  const options: vscode.Range[] = []
  const separators: vscode.Range[] = []

  const lines = document.getText().split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!reMatchLine.test(line)) {
      continue
    }

    // Skip lines where backtick appears after // comment or inside a string
    const backtickCol = line.indexOf('`')
    const prefix = line.slice(0, backtickCol)
    if (prefix.includes('//') || prefix.match(/"[^"]*$/) !== null) {
      continue
    }

    const tagOpen = backtickCol
    const tagClose = line.lastIndexOf('`')
    if (tagOpen === tagClose) {
      continue
    }

    const raw = line.slice(tagOpen + 1, tagClose)

    reTag.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = reTag.exec(raw)) !== null) {
      const base = tagOpen + 1 + m.index

      // key range
      keys.push(range(i, base, base + m[1].length))

      const valueStart = base + m[1].length + 2 // skip :"
      const valueEnd = valueStart + m[2].length

      // scan value for separators and options
      let lastSplit = 0
      const valStr = m[2]

      reOption.lastIndex = 0
      let om: RegExpExecArray | null
      const optionRanges: Array<[number, number]> = []
      while ((om = reOption.exec(valStr)) !== null) {
        optionRanges.push([
          valueStart + om.index,
          valueStart + om.index + om[0].length,
        ])
      }

      for (let k = 0; k < valStr.length; k++) {
        if (valStr[k] === ',') {
          // value segment before comma
          const segStart = valueStart + lastSplit
          const segEnd = valueStart + k
          if (!inOptionRange(segStart, segEnd, optionRanges)) {
            values.push(range(i, segStart, segEnd))
          } else {
            options.push(range(i, segStart, segEnd))
          }
          separators.push(range(i, valueStart + k, valueStart + k + 1))
          lastSplit = k + 1
        }
      }

      // last segment
      const segStart = valueStart + lastSplit
      if (!inOptionRange(segStart, valueEnd, optionRanges)) {
        values.push(range(i, segStart, valueEnd))
      } else {
        options.push(range(i, segStart, valueEnd))
      }
    }
  }

  return { keys, values, options, separators }
}

/**
 * Checks whether a text segment falls entirely within any of the pre-computed option spans.
 * Used to decide whether to classify a value segment as a plain value or as an option (`key=val`).
 *
 * @param start - Absolute column start of the segment.
 * @param end - Absolute column end of the segment.
 * @param ranges - Option column spans collected from the current tag value.
 * @returns `true` if the segment is fully contained within one of the option spans.
 */
function inOptionRange(
  start: number,
  end: number,
  ranges: Array<[number, number]>,
): boolean {
  return ranges.some(([rs, re]) => start >= rs && end <= re)
}

/**
 * Constructs a `vscode.Range` from a line number and two column offsets.
 *
 * @param line - 0-based line number.
 * @param start - Inclusive start column.
 * @param end - Exclusive end column.
 * @returns The corresponding `vscode.Range`.
 */
function range(line: number, start: number, end: number): vscode.Range {
  return new vscode.Range(
    new vscode.Position(line, start),
    new vscode.Position(line, end),
  )
}
