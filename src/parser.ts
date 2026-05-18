import * as vscode from 'vscode'
import { FieldSpec } from './memory'

/** A single `key:"value"` pair extracted from a struct tag. */
export interface TagPair {
  /** Tag key, e.g. `json`, `yaml`, `db`. */
  key: string
  /** Raw value string between the quotes, e.g. `my_field,required`. */
  value: string
}

/** A struct field that carries at least one tag, along with its source location. */
export interface StructField {
  /** 0-based line index within the document. */
  line: number
  /** Column of the opening backtick. */
  tagStart: number
  /** Column of the character immediately after the closing backtick. */
  tagEnd: number
  /** Parsed tag pairs in source order. */
  tags: TagPair[]
}

/** A Go struct definition with the source range and all tagged fields it contains. */
export interface GoStruct {
  /** 0-based line of the `type X struct {` declaration. */
  startLine: number
  /** 0-based line of the closing `}`. */
  endLine: number
  /** Struct type name. */
  name: string
  /** Only fields that carry at least one parsed tag. */
  fields: StructField[]
}

/** A Go struct field (tagged or not) with its source line and resolved type. */
export interface GoField extends FieldSpec {
  /** 0-based line index within the document. */
  line: number
}

/** GoStruct extended with all fields (including untagged ones) for memory analysis. */
export interface GoStructFull extends GoStruct {
  /** All fields in source order, including those without tags. */
  allFields: GoField[]
  /**
   * True when any line in the struct (declaration or body) contains
   * `// go-struct-tags:no-reorder`, which suppresses memory analysis for the whole struct.
   */
  noReorder: boolean
}

const reNoReorder = /\/\/\s*(?:go-struct-tags:no-reorder|betteralign:ignore)/

const reStructStart = /^\s*type\s+(\w+)\s+struct\s*\{/

const GENERATED_SUFFIXES = [
  '_generated.go',
  '_gen.go',
  '.gen.go',
  '.pb.go',
  '.pb.gw.go',
]
const reGeneratedComment = /Code generated .* DO NOT EDIT/

/** Returns true for files that should be silently skipped (generated files, test files). */
function isSkippedFile(document: vscode.TextDocument): boolean {
  const name = document.fileName ?? ''
  if (name.endsWith('_test.go')) {
    return true
  }
  for (const suffix of GENERATED_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return true
    }
  }
  if (document.lineCount && document.lineAt) {
    const scanLines = Math.min(document.lineCount, 10)
    for (let i = 0; i < scanLines; i++) {
      if (reGeneratedComment.test(document.lineAt(i).text)) {
        return true
      }
    }
  }
  return false
}
const reTaggedField = /^(\s*\w[\w\d]*\s+\S[^`]*?)\s*(`[^`]+`)/
const reTag = /(\w[\w-]*):"((?:[^"\\]|\\.)*)"/g

/**
 * Parses all top-level struct definitions from a Go source document.
 *
 * @param document - The Go source file to analyse.
 * @returns An array of structs, each containing only fields that carry at least one tag.
 */
export function parseStructs(document: vscode.TextDocument): GoStruct[] {
  if (isSkippedFile(document)) {
    return []
  }
  const lines = document.getText().split('\n')
  const structs: GoStruct[] = []

  for (let i = 0; i < lines.length; i++) {
    const m = reStructStart.exec(lines[i])
    if (!m) {
      continue
    }

    const name = m[1]
    const startLine = i
    let depth = 1
    let endLine = i

    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j]
      for (const ch of trimmed) {
        if (ch === '{') {
          depth++
        } else if (ch === '}') {
          depth--
          if (depth === 0) {
            endLine = j
            break
          }
        }
      }
      if (depth === 0) {
        break
      }
    }

    const fields: StructField[] = []
    for (let j = startLine + 1; j < endLine; j++) {
      const field = parseFieldLine(lines[j], j)
      if (field) {
        fields.push(field)
      }
    }

    structs.push({ startLine, endLine, name, fields })
    i = endLine
  }

  return structs
}

/**
 * Attempts to parse a single struct body line as a tagged field.
 *
 * @param line - The raw source line.
 * @param lineIndex - The 0-based line number within the document.
 * @returns A `StructField` when the line contains a backtick tag with at least one key/value pair, otherwise `null`.
 */
function parseFieldLine(line: string, lineIndex: number): StructField | null {
  const m = reTaggedField.exec(line)
  if (!m) {
    return null
  }

  const tagLiteral = m[2] // includes backticks
  const tagStart = line.indexOf('`')
  const tagEnd = tagStart + tagLiteral.length
  const raw = tagLiteral.slice(1, -1) // strip backticks

  const tags = parseTags(raw)
  if (tags.length === 0) {
    return null
  }

  return { line: lineIndex, tagStart, tagEnd, tags }
}

/**
 * Parses a raw struct tag string into key/value pairs.
 *
 * @param raw - Tag content without surrounding backticks, e.g. `json:"id" yaml:"id"`.
 * @returns Ordered array of tag pairs as found in the source.
 */
export function parseTags(raw: string): TagPair[] {
  const pairs: TagPair[] = []
  let match: RegExpExecArray | null

  reTag.lastIndex = 0
  while ((match = reTag.exec(raw)) !== null) {
    pairs.push({ key: match[1], value: match[2] })
  }

  return pairs
}

// Matches any field line: leading whitespace, identifier, whitespace, type token.
// Does NOT match embedded fields (no type token) or comment-only lines.
const reAnyField = /^\s{1,}(\w[\w\d]*)\s+(\S+)/

/**
 * Attempts to parse a struct body line as a field with a type.
 * Skips comment lines, blank lines, and inner struct declarations.
 */
function parseAnyFieldLine(line: string, lineIndex: number): GoField | null {
  const trimmed = line.trimStart()
  if (trimmed === '' || trimmed.startsWith('//')) {
    return null
  }
  // Skip inner struct / interface declarations
  if (
    trimmed.includes('struct {') ||
    trimmed.includes('struct{') ||
    trimmed.includes('interface{')
  ) {
    return null
  }

  const m = reAnyField.exec(line)
  if (!m) {
    return null
  }

  return { name: m[1], typeName: m[2], line: lineIndex }
}

/**
 * Parses all top-level struct definitions from a Go source document,
 * including all fields (tagged and untagged) for memory layout analysis.
 */
export function parseStructsWithFields(
  document: vscode.TextDocument,
): GoStructFull[] {
  if (isSkippedFile(document)) {
    return []
  }
  const lines = document.getText().split('\n')
  const structs: GoStructFull[] = []

  for (let i = 0; i < lines.length; i++) {
    const m = reStructStart.exec(lines[i])
    if (!m) {
      continue
    }

    const name = m[1]
    const startLine = i
    let depth = 1
    let endLine = i

    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j]
      for (const ch of trimmed) {
        if (ch === '{') {
          depth++
        } else if (ch === '}') {
          depth--
          if (depth === 0) {
            endLine = j
            break
          }
        }
      }
      if (depth === 0) {
        break
      }
    }

    const fields: StructField[] = []
    const allFields: GoField[] = []
    let noReorder = reNoReorder.test(lines[startLine])
    let innerDepth = 0

    for (let j = startLine + 1; j < endLine; j++) {
      const line = lines[j]
      if (!noReorder && reNoReorder.test(line)) {
        noReorder = true
      }

      // Track brace depth so inner struct/interface bodies are not confused
      // with top-level fields of this struct.
      const wasAtTop = innerDepth === 0
      for (const ch of line) {
        if (ch === '{') {
          innerDepth++
        } else if (ch === '}') {
          innerDepth--
        }
      }

      if (wasAtTop) {
        const tagged = parseFieldLine(line, j)
        if (tagged) {
          fields.push(tagged)
        }
        const any = parseAnyFieldLine(line, j)
        if (any) {
          allFields.push(any)
        }
      }
    }

    structs.push({ startLine, endLine, name, fields, allFields, noReorder })
    i = endLine
  }

  return structs
}

/**
 * Serializes tag pairs back into a backtick-delimited struct tag literal.
 * Produces a single space between each `key:"value"` pair with no leading or trailing whitespace inside the backticks.
 *
 * @param tags - Ordered tag pairs to serialize.
 * @returns A normalized tag literal including the surrounding backticks, e.g. `` `json:"id" yaml:"id"` ``.
 */
export function reconstructTag(tags: TagPair[]): string {
  return '`' + tags.map((t) => `${t.key}:"${t.value}"`).join(' ') + '`'
}
