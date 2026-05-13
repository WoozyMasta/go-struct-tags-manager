import { GoStruct, StructField, TagPair } from './parser'

/** Configuration for the sort operation, read from workspace settings on each invocation. */
export interface SortOptions {
  /**
   * Determines how the canonical key order is derived when no priority applies.
   * - `smart` — sorts by tag frequency (desc) then average rendered width (asc),
   *   so common short tags come first and long/rare tags fall to the end.
   * - `first-field` — order is derived from the first struct field.
   * - `alphabetical` — all keys sorted A–Z.
   */
  mode: 'smart' | 'first-field' | 'alphabetical'
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
 * @param opts - Sort mode and explicit priority keys.
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
  } else if (opts.mode === 'smart') {
    remaining = buildSmartOrder(fields).filter((k) => !prioritySet.has(k))
  } else {
    remaining = buildCanonicalOrder(fields).filter((k) => !prioritySet.has(k))
  }

  return [...priorityKeys, ...remaining]
}

/**
 * Derives a tag key order optimised for readability of mixed-tag structs.
 * Keys are ranked by frequency across all fields (descending) and then by
 * average rendered width (ascending), so common short tags come first and
 * long or rare tags — such as `description` — fall naturally to the end.
 *
 * @param fields - All tagged fields of the struct.
 * @returns Keys sorted from most-frequent/shortest to least-frequent/longest.
 */
function buildSmartOrder(fields: StructField[]): string[] {
  if (fields.length === 0) {
    return []
  }

  const count = new Map<string, number>()
  const totalWidth = new Map<string, number>()

  for (const field of fields) {
    for (const tag of field.tags) {
      count.set(tag.key, (count.get(tag.key) ?? 0) + 1)
      totalWidth.set(
        tag.key,
        (totalWidth.get(tag.key) ?? 0) + `${tag.key}:"${tag.value}"`.length,
      )
    }
  }

  const n = fields.length
  return [...count.keys()].sort((a, b) => {
    const fa = count.get(a)! / n
    const fb = count.get(b)! / n
    if (fa !== fb) {
      return fb - fa
    }
    const avgA = totalWidth.get(a)! / count.get(a)!
    const avgB = totalWidth.get(b)! / count.get(b)!
    return avgA - avgB
  })
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
 * Computes padded tag strings for a group of consecutive fields so that columns align vertically.
 *
 * Tags are split into two classes based on how often they appear across the group:
 * - **Common** (frequency ≥ `columnThreshold`): get a dedicated column. Missing cells are
 *   filled with blank space so subsequent common columns stay aligned. The last common column
 *   a field has is never padded.
 * - **Rare** (frequency < `columnThreshold`): appended after the last common column without
 *   column alignment, avoiding large gaps caused by tags that only a few fields carry.
 *
 * @param group - Two or more consecutive struct fields to align.
 * @param columnThreshold - Fraction of fields [0–1] that must have a tag for it to get a
 *   dedicated column. Defaults to `0.5`.
 * @returns A map of line number to the new raw tag content (without surrounding backticks).
 */
export function alignGroup(
  group: StructField[],
  columnThreshold = 0.5,
  maxGap = 0,
): Map<number, string> {
  const order = buildCanonicalOrder(group)
  const n = group.length

  // Classify each key by frequency within the group
  const freq = new Map<string, number>()
  for (const key of order) {
    let count = 0
    for (const field of group) {
      if (field.tags.some((t) => t.key === key)) {
        count++
      }
    }
    freq.set(key, count / n)
  }

  const rareKeySet = new Set(
    order.filter((k) => (freq.get(k) ?? 0) <= columnThreshold),
  )
  const orderSet = new Set(order)

  // Max rendered width for each common key
  const maxLen = new Map<string, number>()
  for (const key of order) {
    if (rareKeySet.has(key)) {
      continue
    }
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

  // Within the group, reorder common columns by (frequency DESC, maxLen ASC) so that
  // narrow columns always precede wide ones at equal frequency — preventing a wide tag
  // like `description` from being padded just to align a narrow trailing tag like `short`.
  const commonKeys = order
    .filter((k) => !rareKeySet.has(k))
    .sort((a, b) => {
      const fd = (freq.get(b) ?? 0) - (freq.get(a) ?? 0)
      if (fd !== 0) {
        return fd
      }
      return (maxLen.get(a) ?? 0) - (maxLen.get(b) ?? 0)
    })

  const result = new Map<number, string>()

  for (const field of group) {
    const parts: string[] = []

    // Determine the last common key this field has, to know where padding stops
    let lastCommonKey: string | undefined
    for (let i = commonKeys.length - 1; i >= 0; i--) {
      if (field.tags.some((t) => t.key === commonKeys[i])) {
        lastCommonKey = commonKeys[i]
        break
      }
    }

    if (lastCommonKey !== undefined) {
      const lastCommonIdx = commonKeys.indexOf(lastCommonKey)
      let pendingGap = ''

      for (let i = 0; i < commonKeys.length; i++) {
        const key = commonKeys[i]
        const tag = field.tags.find((t) => t.key === key)

        if (tag) {
          // Flush accumulated empty-slot gap before the next real tag
          if (pendingGap) {
            if (maxGap <= 0 || pendingGap.length <= maxGap) {
              parts.push(pendingGap)
            }
            pendingGap = ''
          }

          const rendered = `${tag.key}:"${tag.value}"`
          if (key === lastCommonKey) {
            parts.push(rendered) // last column for this field — no padding
          } else {
            parts.push(rendered.padEnd(maxLen.get(key) ?? rendered.length))
          }
        } else if (i < lastCommonIdx) {
          // Accumulate empty-slot space; include the join ' ' between consecutive slots
          const slotStr = ' '.repeat(maxLen.get(key) ?? 0)
          pendingGap = pendingGap ? pendingGap + ' ' + slotStr : slotStr
        }
        // Keys beyond lastCommonIdx that the field doesn't have are simply skipped
      }
    }

    // Append rare keys in sorted order, no column alignment
    for (const tag of field.tags) {
      if (rareKeySet.has(tag.key)) {
        parts.push(`${tag.key}:"${tag.value}"`)
      }
    }

    // Append unknown keys (not seen anywhere in the group)
    for (const tag of field.tags) {
      if (!orderSet.has(tag.key)) {
        parts.push(`${tag.key}:"${tag.value}"`)
      }
    }

    result.set(field.line, parts.join(' '))
  }

  return result
}
