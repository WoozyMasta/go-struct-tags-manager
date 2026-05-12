import * as vscode from 'vscode'
import { GoStruct, StructField, parseStructs, reconstructTag } from './parser'
import {
  SortOptions,
  alignGroup,
  buildSortOrder,
  findAlignmentGroups,
  sortFieldTags,
} from './operations'

export type TransformMode = 'sort' | 'align' | 'sort-align'

export interface StructSpan {
  startLine: number
  endLine: number
}

export function readSortOptions(): SortOptions {
  const cfg = vscode.workspace.getConfiguration('goStructTags')
  return {
    mode: cfg.get<'first-field' | 'alphabetical'>('sortMode') ?? 'first-field',
    priority: cfg.get<string[]>('sortPriority') ?? [],
  }
}

export function findStructAtLine(
  structs: GoStruct[],
  line: number,
): GoStruct | undefined {
  return structs.find((s) => line >= s.startLine && line <= s.endLine)
}

export function findStructBySpan(
  structs: GoStruct[],
  span: StructSpan,
): GoStruct | undefined {
  return structs.find(
    (s) => s.startLine === span.startLine && s.endLine === span.endLine,
  )
}

export function buildEdits(
  document: vscode.TextDocument,
  mode: TransformMode,
  target?: GoStruct,
): vscode.TextEdit[] {
  const structs = target ? [target] : parseStructs(document)
  if (structs.length === 0) {
    return []
  }

  const lines = document.getText().split('\n')
  const opts = readSortOptions()
  const edits: vscode.TextEdit[] = []

  for (const struct of structs) {
    const byLine = projectTagsByLine(struct, mode, lines, opts)
    for (const field of struct.fields) {
      const next = byLine.get(field.line)
      if (!next) {
        continue
      }
      const range = new vscode.Range(
        field.line,
        field.tagStart,
        field.line,
        field.tagEnd,
      )
      if (document.getText(range) === next) {
        continue
      }
      edits.push(vscode.TextEdit.replace(range, next))
    }
  }

  return edits
}

function projectTagsByLine(
  struct: GoStruct,
  mode: TransformMode,
  lines: string[],
  opts: SortOptions,
): Map<number, string> {
  const result = new Map<number, string>()
  if (struct.fields.length === 0) {
    return result
  }

  const projectedFields =
    mode === 'align'
      ? struct.fields
      : sortStructFields(struct.fields, buildSortOrder(struct.fields, opts))

  if (mode === 'sort') {
    for (const field of projectedFields) {
      result.set(field.line, reconstructTag(field.tags))
    }
    return result
  }

  const projectedStruct: GoStruct = { ...struct, fields: projectedFields }
  const alignedByLine = new Map<number, string>()
  for (const group of findAlignmentGroups(projectedStruct, lines)) {
    for (const [line, raw] of alignGroup(group)) {
      alignedByLine.set(line, raw)
    }
  }

  for (const field of projectedFields) {
    const aligned = alignedByLine.get(field.line)
    result.set(
      field.line,
      aligned ? '`' + aligned + '`' : reconstructTag(field.tags),
    )
  }

  return result
}

function sortStructFields(
  fields: StructField[],
  order: string[],
): StructField[] {
  return fields.map((f) => ({ ...f, tags: sortFieldTags(f.tags, order) }))
}
