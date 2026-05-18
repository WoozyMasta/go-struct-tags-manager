/**
 * Describes the memory layout and GC pointer status of a known external type.
 * All values follow the Go memory model for each target architecture.
 */
export interface KnownTypeSpec {
  /** Computes size in bytes for the given pointer size (4 on 386, 8 on amd64/arm64). */
  size: (ptrSize: number) => number
  /** Computes required alignment in bytes for the given pointer size. */
  alignment: (ptrSize: number) => number
  /** Whether the type contains (or may contain) GC-traced pointers. */
  containsPointer: boolean
}

/**
 * Curated layout table for stdlib and popular external types.
 * Keyed by "package.Type" as it appears in Go source (using the import alias).
 *
 * Layout rules:
 *  - Types with no pointers and fixed sizes use constant functions.
 *  - Types containing pointers or slices scale with ptrSize (4 on 386, 8 on amd64/arm64).
 *  - Sizes verified against Go spec and `go tool compile -S` output.
 */
export const knownTypes: Record<string, KnownTypeSpec> = {
  //? time

  // wall uint64(8) + ext int64(8) + loc *Location(p)
  // align: 8 on 64-bit (uint64 sets alignment), 4 on 386 (uint64 is 4-aligned there)
  'time.Time': {
    size: (p) => 16 + p,
    alignment: (p) => (p === 4 ? 4 : 8),
    containsPointer: true,
  },
  // int64 alias — no pointer
  'time.Duration': {
    size: () => 8,
    alignment: () => 8,
    containsPointer: false,
  },

  //? net

  // []byte slice header: ptr+len+cap = 3p
  'net.IP': { size: (p) => p * 3, alignment: (p) => p, containsPointer: true },
  'net.HardwareAddr': {
    size: (p) => p * 3,
    alignment: (p) => p,
    containsPointer: true,
  },
  // IP(3p) + Mask IPMask(3p) = 6p
  'net.IPNet': {
    size: (p) => p * 6,
    alignment: (p) => p,
    containsPointer: true,
  },

  //? net/netip

  // uint128(16, align 8) + z *intern.Value(p)
  // On 386: 16+4 = 20 → padded to 24 (align 8). On 64-bit: 16+8 = 24.
  'netip.Addr': { size: () => 24, alignment: () => 8, containsPointer: true },
  // Addr(24) + port uint16(2) → padded to 32 (align 8)
  'netip.AddrPort': {
    size: () => 32,
    alignment: () => 8,
    containsPointer: true,
  },
  // Addr(24) + bits int8(1) → padded to 32 (align 8)
  'netip.Prefix': { size: () => 32, alignment: () => 8, containsPointer: true },

  //? sync

  // state int32(4) + sema uint32(4)
  'sync.Mutex': { size: () => 8, alignment: () => 4, containsPointer: false },
  // Mutex(8) + writerSem(4) + readerSem(4) + readerCount(4) + readerWait(4)
  'sync.RWMutex': {
    size: () => 24,
    alignment: () => 4,
    containsPointer: false,
  },
  // done atomic.Uint32(4) + m Mutex(8), align 4
  'sync.Once': { size: () => 12, alignment: () => 4, containsPointer: false },
  // state atomic.Uint64(8) + sema uint32(4) → padded to 16 (align 8)
  'sync.WaitGroup': {
    size: () => 16,
    alignment: () => 8,
    containsPointer: false,
  },
  // mu Mutex(8) + read atomic.Pointer(p) + dirty map(p) + misses int(p)
  'sync.Map': {
    size: (p) => 8 + p * 3,
    alignment: (p) => p,
    containsPointer: true,
  },

  //? sync/atomic

  // v any = 2p
  'atomic.Value': {
    size: (p) => p * 2,
    alignment: (p) => p,
    containsPointer: true,
  },
  // v uint32 (4 bytes, no pointer)
  'atomic.Bool': { size: () => 4, alignment: () => 4, containsPointer: false },
  'atomic.Int32': { size: () => 4, alignment: () => 4, containsPointer: false },
  'atomic.Uint32': {
    size: () => 4,
    alignment: () => 4,
    containsPointer: false,
  },
  // v int64/uint64 — Go guarantees 8-byte alignment even on 386
  'atomic.Int64': { size: () => 8, alignment: () => 8, containsPointer: false },
  'atomic.Uint64': {
    size: () => 8,
    alignment: () => 8,
    containsPointer: false,
  },
  // v uintptr — pointer-sized but NOT a GC-traced pointer
  'atomic.Uintptr': {
    size: (p) => p,
    alignment: (p) => p,
    containsPointer: false,
  },

  //? math/big

  // neg bool(1) + padding + abs nat([]uintptr = 3p)
  // On 64-bit: 1+7+24 = 32, align 8. On 386: 1+3+12 = 16, align 4.
  'big.Int': {
    size: (p) => (p === 4 ? 16 : 32),
    alignment: (p) => p,
    containsPointer: true, // slice header in abs carries a backing-array pointer
  },
  // prec(4)+mode+acc+form+neg(4) + mant nat(3p) + exp int32(4) + padding
  // On 64-bit: 8+24+4+4pad = 40, align 8. On 386: 8+12+4 = 24, align 4.
  'big.Float': {
    size: (p) => (p === 4 ? 24 : 40),
    alignment: (p) => (p === 4 ? 4 : 8),
    containsPointer: true,
  },

  //? database/sql

  // string(2p) + bool(1) → padded to 3p
  'sql.NullString': {
    size: (p) => p * 3,
    alignment: (p) => p,
    containsPointer: true,
  },
  // int64(8) + bool(1) → padded to 16
  'sql.NullInt64': {
    size: () => 16,
    alignment: () => 8,
    containsPointer: false,
  },
  // float64(8) + bool(1) → padded to 16
  'sql.NullFloat64': {
    size: () => 16,
    alignment: () => 8,
    containsPointer: false,
  },
  // int32(4) + bool(1) → padded to 8
  'sql.NullInt32': {
    size: () => 8,
    alignment: () => 4,
    containsPointer: false,
  },
  // int16(2) + bool(1) → padded to 4
  'sql.NullInt16': {
    size: () => 4,
    alignment: () => 2,
    containsPointer: false,
  },
  // bool(1) + bool(1) = 2
  'sql.NullBool': { size: () => 2, alignment: () => 1, containsPointer: false },
  'sql.NullByte': { size: () => 2, alignment: () => 1, containsPointer: false },
  // time.Time(16+p) + bool(1) → padded to 32 on 64-bit, 24 on 386
  'sql.NullTime': {
    size: (p) => (p === 4 ? 24 : 32),
    alignment: (p) => (p === 4 ? 4 : 8),
    containsPointer: true, // via time.Time → *Location
  },

  //? bytes/strings

  // buf []byte(3p) + off int(p) + lastRead int8(1) → padded
  // On 64-bit: 24+8+1 → 40, align 8. On 386: 12+4+1 → 20, align 4.
  'bytes.Buffer': {
    size: (p) => (p === 4 ? 20 : 40),
    alignment: (p) => p,
    containsPointer: true,
  },
  // addr *Builder(p) + buf []byte(3p)
  'strings.Builder': {
    size: (p) => p * 4,
    alignment: (p) => p,
    containsPointer: true,
  },
  // s string(2p) + i int64(8, align 8) + prevRune int(p)
  // On 64-bit: 16+8+8 = 32, align 8. On 386: 8+8+4 = 20 → padded to 24 (align 8).
  'strings.Reader': {
    size: (p) => (p === 4 ? 24 : 32),
    alignment: () => 8,
    containsPointer: true,
  },

  //? popular external

  // github.com/google/uuid, github.com/satori/go.uuid — [16]byte
  'uuid.UUID': { size: () => 16, alignment: () => 1, containsPointer: false },
}
