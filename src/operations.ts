import { GoStruct, StructField, TagPair } from './parser'

/** Configuration for the sort operation, read from workspace settings on each invocation. */
export interface SortOptions {
  /** Determines how the canonical key order is derived when no priority applies. */
  mode: 'first-field' | 'alphabetical'
  /** Tag keys that always sort first, in the order listed. Keys absent from the struct are ignored. */
  priority: string[]
}

/**
 * Derives the canonical tag key order from the struct fields.
 * The first field defines the base order; subsequent fields append any keys not yet seen.
 *
 * @param fields - All tagged fields of a struct, in source order.
 * @returns Ordered list of unique tag keys.
 */
export function buildCanonicalOrder(fields: StructField[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()

  for (const field of fields) {
    for (const tag of field.tags) {
      if (!seen.has(tag.key)) {
        seen.add(tag.key)
        order.push(tag.key)
      }
    }
  }

  return order
}

/**
 * Builds the final key order used when sorting, applying priority overrides on top of the chosen mode.
 * Priority keys that are not present in the struct are silently ignored.
 *
 * @param fields - All tagged fields of a struct.
 * @param opts - Sort mode (`first-field` or `alphabetical`) and explicit priority keys.
 * @returns Ordered list of tag keys: priority keys first, then the rest per the chosen mode.
 */
export function buildSortOrder(
  fields: StructField[],
  opts: SortOptions,
): string[] {
  const allKeys = new Set<string>()
  for (const field of fields) {
    for (const tag of field.tags) {
      allKeys.add(tag.key)
    }
  }

  const priorityKeys = opts.priority.filter((k) => allKeys.has(k))
  const prioritySet = new Set(priorityKeys)

  let remaining: string[]
  if (opts.mode === 'alphabetical') {
    remaining = [...allKeys].filter((k) => !prioritySet.has(k)).sort()
  } else {
    remaining = buildCanonicalOrder(fields).filter((k) => !prioritySet.has(k))
  }

  return [...priorityKeys, ...remaining]
}

/**
 * Returns a new array of tags sorted to match the given key order.
 * Tags whose keys are not in `order` are appended at the end, preserving their relative order.
 * The original array is not mutated.
 *
 * @param tags - Tag pairs to sort.
 * @param order - Desired key sequence.
 * @returns A new sorted array of tag pairs.
 */
export function sortFieldTags(tags: TagPair[], order: string[]): TagPair[] {
  return [...tags].sort((a, b) => {
    const ai = order.indexOf(a.key)
    const bi = order.indexOf(b.key)
    if (ai === -1 && bi === -1) {
      return 0
    }
    if (ai === -1) {
      return 1
    }
    if (bi === -1) {
      return -1
    }
    return ai - bi
  })
}

/**
 * Groups consecutive tagged fields that have no blank lines between them.
 * Only groups with at least two fields are returned; single-field groups need no alignment.
 *
 * @param struct - The struct to inspect.
 * @param lines - All lines of the document, used to detect blank separators between fields.
 * @returns An array of field groups, each containing two or more consecutive fields.
 */
export function findAlignmentGroups(
  struct: GoStruct,
  lines: string[],
): StructField[][] {
  const { fields } = struct
  if (fields.length < 2) {
    return []
  }

  const groups: StructField[][] = []
  let current: StructField[] = [fields[0]]

  for (let i = 1; i < fields.length; i++) {
    const prev = fields[i - 1]
    const next = fields[i]
    const hasBlankBetween = hasBlankLine(lines, prev.line, next.line)

    if (hasBlankBetween) {
      if (current.length >= 2) {
        groups.push(current)
      }
      current = [next]
    } else {
      current.push(next)
    }
  }

  if (current.length >= 2) {
    groups.push(current)
  }

  return groups
}

/**
 * Checks whether any line between `fromLine` and `toLine` (exclusive) is blank.
 *
 * @param lines - All document lines.
 * @param fromLine - Start line (exclusive lower bound).
 * @param toLine - End line (exclusive upper bound).
 * @returns `true` if at least one blank line exists in the range.
 */
function hasBlankLine(
  lines: string[],
  fromLine: number,
  toLine: number,
): boolean {
  for (let i = fromLine + 1; i < toLine; i++) {
    if (lines[i].trim() === '') {
      return true
    }
  }
  return false
}

/**
 * Computes padded tag strings for a group of consecutive fields so that each tag column aligns vertically.
 * The last tag on each line is never padded.
 *
 * @param group - Two or more consecutive struct fields to align.
 * @returns A map of line number to the new raw tag content (without surrounding backticks).
 */
export function alignGroup(group: StructField[]): Map<number, string> {
  // Build ordered list of all keys in canonical order for this group
  const order = buildCanonicalOrder(group)

  // For each key position, find the max rendered length of key:"value"
  const maxLen = new Map<string, number>()
  for (const key of order) {
    let max = 0
    for (const field of group) {
      const tag = field.tags.find((t) => t.key === key)
      if (tag) {
        const len = `${tag.key}:"${tag.value}"`.length
        if (len > max) {
          max = len
        }
      }
    }
    maxLen.set(key, max)
  }

  const result = new Map<number, string>()

  for (const field of group) {
    const parts: string[] = []

    for (let i = 0; i < order.length; i++) {
      const key = order[i]
      const tag = field.tags.find((t) => t.key === key)

      if (!tag) {
        continue
      }

      const rendered = `${tag.key}:"${tag.value}"`
      const isLast =
        i === order.length - 1 ||
        !order.slice(i + 1).some((k) => field.tags.some((t) => t.key === k))

      if (isLast) {
        parts.push(rendered)
      } else {
        const max = maxLen.get(key) ?? rendered.length
        parts.push(rendered.padEnd(max))
      }
    }

    // Also append any tags not in canonical order (unknown keys)
    for (const tag of field.tags) {
      if (!order.includes(tag.key)) {
        parts.push(`${tag.key}:"${tag.value}"`)
      }
    }

    result.set(field.line, parts.join(' '))
  }

  return result
}
