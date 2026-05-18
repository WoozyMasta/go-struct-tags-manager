import { knownTypes } from './knownTypes'

export type Architecture = 'amd64' | 'arm64' | '386'

export interface FieldSpec {
  name: string
  typeName: string
}

export interface FieldLayout {
  name: string
  offset: number
  size: number
  alignment: number
  paddingBefore: number
}

export interface StructLayout {
  fields: FieldLayout[]
  totalSize: number
  totalPadding: number
}

export interface OptimizationResult {
  orderedNames: string[]
  /** Padding bytes saved (struct size reduction). 0 for GC-only optimizations. */
  bytesSaved: number
  /** True when the optimal order differs from source order (covers both padding and GC). */
  reordered: boolean
}

function pointerSize(arch: Architecture): number {
  return arch === '386' ? 4 : 8
}

function alignOffset(offset: number, alignment: number): number {
  const r = offset % alignment
  return r === 0 ? offset : offset + (alignment - r)
}

function getTypeInfo(
  typeName: string,
  ptrSize: number,
): { size: number; alignment: number } {
  switch (typeName) {
    case 'bool':
    case 'int8':
    case 'uint8':
    case 'byte':
      return { size: 1, alignment: 1 }
    case 'int16':
    case 'uint16':
      return { size: 2, alignment: 2 }
    case 'int32':
    case 'uint32':
    case 'float32':
    case 'rune':
      return { size: 4, alignment: 4 }
    case 'int64':
    case 'uint64':
    case 'float64':
      return { size: 8, alignment: 8 }
    case 'complex64':
      return { size: 8, alignment: 4 }
    case 'complex128':
      return { size: 16, alignment: 8 }
    case 'int':
    case 'uint':
    case 'uintptr':
      return { size: ptrSize, alignment: ptrSize }
    case 'string':
      return { size: ptrSize * 2, alignment: ptrSize }
    case 'interface{}':
    case 'any':
    case 'error':
      return { size: ptrSize * 2, alignment: ptrSize }
    default:
      if (typeName.startsWith('*') || typeName === 'unsafe.Pointer') {
        return { size: ptrSize, alignment: ptrSize }
      }
      if (typeName.startsWith('[]')) {
        return { size: ptrSize * 3, alignment: ptrSize }
      }
      if (typeName.startsWith('[')) {
        const m = typeName.match(/^\[(\d+)\](.+)/)
        if (m) {
          const count = parseInt(m[1], 10)
          const elem = getTypeInfo(m[2], ptrSize)
          return { size: count * elem.size, alignment: elem.alignment }
        }
      }
      if (
        typeName.startsWith('map[') ||
        typeName.startsWith('chan') ||
        typeName.startsWith('<-chan') ||
        typeName.startsWith('func(')
      ) {
        return { size: ptrSize, alignment: ptrSize }
      }
      // Curated external types (time.Time, sync.Mutex, sql.NullString, etc.)
      const known = knownTypes[typeName]
      if (known) {
        return { size: known.size(ptrSize), alignment: known.alignment(ptrSize) }
      }
      // Unknown types (custom structs, qualified types) → pointer size
      return { size: ptrSize, alignment: ptrSize }
  }
}

/**
 * Returns true when the type contains (or may contain) Go pointers,
 * making it subject to GC scanning. Used to sort pointer-bearing fields
 * before non-pointer fields at the same alignment level (betteralign criterion 3).
 */
function containsPointer(typeName: string): boolean {
  switch (typeName) {
    // Definite non-pointers — built-in scalars
    case 'bool':
    case 'byte':
    case 'rune':
    case 'int8':
    case 'int16':
    case 'int32':
    case 'int64':
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
    case 'uintptr': // pointer-sized integer, but NOT GC-traced
    case 'float32':
    case 'float64':
    case 'complex64':
    case 'complex128':
    case 'int':
    case 'uint':
      return false
    // Definite pointers — built-in pointer-bearing types
    case 'string': // (ptr, len)
    case 'any':
    case 'interface{}':
    case 'error': // interface
      return true
  }

  // Curated external types — look up containsPointer from the table
  const known = knownTypes[typeName]
  if (known !== undefined) {
    return known.containsPointer
  }

  if (typeName.startsWith('*') || typeName === 'unsafe.Pointer') {
    return true
  }
  if (typeName.startsWith('[]')) {
    return true
  }
  if (
    typeName.startsWith('map[') ||
    typeName.startsWith('chan') ||
    typeName.startsWith('<-chan') ||
    typeName.startsWith('func(')
  ) {
    return true
  }
  if (typeName.startsWith('[')) {
    const m = typeName.match(/^\[(\d+)\](.+)/)
    if (m) {
      if (parseInt(m[1], 10) === 0) {
        return false // [0]T never traced by GC
      }
      return containsPointer(m[2])
    }
  }
  // Unknown types (external packages, custom structs): assume yes (conservative)
  return true
}

export function calculateLayout(
  fields: FieldSpec[],
  arch: Architecture = 'amd64',
): StructLayout {
  const ptrSize = pointerSize(arch)

  if (fields.length === 0) {
    return { fields: [], totalSize: 0, totalPadding: 0 }
  }

  let offset = 0
  let maxAlign = 1
  let totalPadding = 0
  const fieldLayouts: FieldLayout[] = []

  for (const f of fields) {
    const info = getTypeInfo(f.typeName, ptrSize)
    maxAlign = Math.max(maxAlign, info.alignment)

    const aligned = alignOffset(offset, info.alignment)
    const paddingBefore = aligned - offset
    totalPadding += paddingBefore

    fieldLayouts.push({
      name: f.name,
      offset: aligned,
      size: info.size,
      alignment: info.alignment,
      paddingBefore,
    })
    offset = aligned + info.size
  }

  const totalSize = alignOffset(offset, maxAlign)
  totalPadding += totalSize - offset

  return { fields: fieldLayouts, totalSize, totalPadding }
}

export function optimalOrder(
  fields: FieldSpec[],
  arch: Architecture = 'amd64',
): OptimizationResult {
  if (fields.length < 2) {
    return { orderedNames: fields.map((f) => f.name), bytesSaved: 0, reordered: false }
  }

  const ptrSize = pointerSize(arch)

  const sorted = [...fields].sort((a, b) => {
    const ai = getTypeInfo(a.typeName, ptrSize)
    const bi = getTypeInfo(b.typeName, ptrSize)

    // Criterion 1: zero-sized fields first (avoids end-of-struct padding)
    const aZero = ai.size === 0
    const bZero = bi.size === 0
    if (aZero !== bZero) {
      return aZero ? -1 : 1
    }

    // Criterion 2: higher alignment first (reduces inter-field padding)
    if (bi.alignment !== ai.alignment) {
      return bi.alignment - ai.alignment
    }

    // Criterion 3: pointer-bearing before non-pointer (reduces GC scan range)
    const ap = containsPointer(a.typeName)
    const bp = containsPointer(b.typeName)
    if (ap !== bp) {
      return ap ? -1 : 1
    }

    // Criterion 4: larger size first
    return bi.size - ai.size
  })

  const currentPadding = calculateLayout(fields, arch).totalPadding
  const optimalPadding = calculateLayout(sorted, arch).totalPadding
  const bytesSaved = Math.max(0, currentPadding - optimalPadding)
  const reordered = sorted.some((f, i) => f.name !== fields[i].name)

  return {
    orderedNames: sorted.map((f) => f.name),
    bytesSaved,
    reordered,
  }
}
