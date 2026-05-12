import * as assert from 'assert'
import { StructField, GoStruct } from '../../parser'
import {
  buildCanonicalOrder,
  buildSortOrder,
  sortFieldTags,
  findAlignmentGroups,
  alignGroup,
} from '../../operations'

function field(line: number, ...tags: [string, string][]): StructField {
  return {
    line,
    tagStart: 0,
    tagEnd: 0,
    tags: tags.map(([key, value]) => ({ key, value })),
  }
}

function struct(fields: StructField[], startLine = 0): GoStruct {
  const endLine =
    fields.length > 0 ? fields[fields.length - 1].line + 1 : startLine + 1
  return { startLine, endLine, name: 'T', fields }
}

suite('buildCanonicalOrder', () => {
  test('single field', () => {
    const fields = [field(1, ['json', 'a'], ['yaml', 'a'])]
    assert.deepStrictEqual(buildCanonicalOrder(fields), ['json', 'yaml'])
  })

  test('order follows first field, subsequent fields add new keys', () => {
    const fields = [
      field(1, ['json', 'a'], ['yaml', 'a']),
      field(2, ['yaml', 'b'], ['json', 'b'], ['db', 'b']),
    ]
    assert.deepStrictEqual(buildCanonicalOrder(fields), ['json', 'yaml', 'db'])
  })

  test('no duplicate keys in result', () => {
    const fields = [
      field(1, ['json', 'a']),
      field(2, ['json', 'b']),
      field(3, ['json', 'c']),
    ]
    assert.deepStrictEqual(buildCanonicalOrder(fields), ['json'])
  })

  test('empty fields returns empty array', () => {
    assert.deepStrictEqual(buildCanonicalOrder([]), [])
  })
})

suite('buildSortOrder', () => {
  const fields = [
    field(1, ['json', 'a'], ['yaml', 'a']),
    field(2, ['db', 'b'], ['validate', 'b']),
  ]

  test('first-field mode equals canonical order', () => {
    const order = buildSortOrder(fields, { mode: 'first-field', priority: [] })
    assert.deepStrictEqual(order, ['json', 'yaml', 'db', 'validate'])
  })

  test('alphabetical mode sorts keys A-Z', () => {
    const order = buildSortOrder(fields, { mode: 'alphabetical', priority: [] })
    assert.deepStrictEqual(order, ['db', 'json', 'validate', 'yaml'])
  })

  test('priority keys come first in first-field mode', () => {
    const order = buildSortOrder(fields, {
      mode: 'first-field',
      priority: ['db', 'json'],
    })
    assert.deepStrictEqual(order, ['db', 'json', 'yaml', 'validate'])
  })

  test('priority keys come first in alphabetical mode', () => {
    const order = buildSortOrder(fields, {
      mode: 'alphabetical',
      priority: ['json', 'yaml'],
    })
    assert.deepStrictEqual(order, ['json', 'yaml', 'db', 'validate'])
  })

  test('priority keys not present in struct are ignored', () => {
    const order = buildSortOrder(fields, {
      mode: 'first-field',
      priority: ['missing', 'json'],
    })
    assert.deepStrictEqual(order[0], 'json')
    assert.ok(!order.includes('missing'))
  })
})

suite('sortFieldTags', () => {
  test('reorders tags to match given key order', () => {
    const tags = [
      { key: 'yaml', value: 'a' },
      { key: 'json', value: 'a' },
    ]
    const sorted = sortFieldTags(tags, ['json', 'yaml'])
    assert.deepStrictEqual(
      sorted.map((t) => t.key),
      ['json', 'yaml'],
    )
  })

  test('unknown keys go to the end', () => {
    const tags = [
      { key: 'custom', value: 'x' },
      { key: 'json', value: 'a' },
    ]
    const sorted = sortFieldTags(tags, ['json', 'yaml'])
    assert.deepStrictEqual(
      sorted.map((t) => t.key),
      ['json', 'custom'],
    )
  })

  test('does not mutate original array', () => {
    const tags = [
      { key: 'yaml', value: 'a' },
      { key: 'json', value: 'a' },
    ]
    sortFieldTags(tags, ['json', 'yaml'])
    assert.strictEqual(tags[0].key, 'yaml')
  })
})

suite('findAlignmentGroups', () => {
  test('two consecutive fields form one group', () => {
    const fields = [field(1, ['json', 'a']), field(2, ['json', 'b'])]
    const lines = [
      'type T struct {',
      '\tA int `json:"a"`',
      '\tB int `json:"b"`',
      '}',
    ]
    const groups = findAlignmentGroups(struct(fields), lines)
    assert.strictEqual(groups.length, 1)
    assert.strictEqual(groups[0].length, 2)
  })

  test('blank line between fields splits into separate groups', () => {
    const fields = [field(1, ['json', 'a']), field(3, ['json', 'b'])]
    const lines = [
      'type T struct {',
      '\tA int `json:"a"`',
      '',
      '\tB int `json:"b"`',
      '}',
    ]
    const groups = findAlignmentGroups(struct(fields), lines)
    assert.strictEqual(groups.length, 0) // each group has only 1 field → filtered out
  })

  test('three consecutive fields form one group', () => {
    const fields = [
      field(1, ['json', 'a']),
      field(2, ['json', 'b']),
      field(3, ['json', 'c']),
    ]
    const lines = [
      'type T struct {',
      '\tA int `json:"a"`',
      '\tB int `json:"b"`',
      '\tC int `json:"c"`',
      '}',
    ]
    const groups = findAlignmentGroups(struct(fields), lines)
    assert.strictEqual(groups.length, 1)
    assert.strictEqual(groups[0].length, 3)
  })

  test('blank line produces two groups when each side has ≥2 fields', () => {
    const fields = [
      field(1, ['json', 'a']),
      field(2, ['json', 'b']),
      field(4, ['json', 'c']),
      field(5, ['json', 'd']),
    ]
    const lines = [
      'type T struct {',
      '\tA int `json:"a"`',
      '\tB int `json:"b"`',
      '',
      '\tC int `json:"c"`',
      '\tD int `json:"d"`',
      '}',
    ]
    const groups = findAlignmentGroups(struct(fields), lines)
    assert.strictEqual(groups.length, 2)
  })

  test('fewer than 2 total fields returns no groups', () => {
    const fields = [field(1, ['json', 'a'])]
    const lines = ['type T struct {', '\tA int `json:"a"`', '}']
    assert.deepStrictEqual(findAlignmentGroups(struct(fields), lines), [])
  })
})

suite('alignGroup', () => {
  test('pads shorter tag to max column width', () => {
    // json:"a" = 8 chars, json:"a_key" = 12 chars → max = 12
    const group = [
      field(1, ['json', 'a'], ['yaml', 'a_key']),
      field(2, ['json', 'a_key'], ['yaml', 'a']),
    ]
    const result = alignGroup(group)

    // field 1: json:"a" padded to 12, then space, then yaml:"a_key" (last, no pad)
    assert.strictEqual(result.get(1), 'json:"a"     yaml:"a_key"')
    // field 2: json:"a_key" already 12, then space, then yaml:"a" (last, no pad)
    assert.strictEqual(result.get(2), 'json:"a_key" yaml:"a"')
  })

  test('single-column group needs no padding', () => {
    const group = [
      field(1, ['json', 'short']),
      field(2, ['json', 'longer_value']),
    ]
    const result = alignGroup(group)
    // only one column → always isLast, no padding applied
    assert.strictEqual(result.get(1), 'json:"short"')
    assert.strictEqual(result.get(2), 'json:"longer_value"')
  })

  test('all fields with equal tag lengths need no padding', () => {
    const group = [
      field(1, ['json', 'ab'], ['yaml', 'ab']),
      field(2, ['json', 'ab'], ['yaml', 'ab']),
    ]
    const result = alignGroup(group)
    assert.strictEqual(result.get(1), 'json:"ab" yaml:"ab"')
    assert.strictEqual(result.get(2), 'json:"ab" yaml:"ab"')
  })
})
