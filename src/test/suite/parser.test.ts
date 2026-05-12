import * as assert from 'assert'
import * as vscode from 'vscode'
import { parseTags, reconstructTag, parseStructs } from '../../parser'

function mockDoc(text: string): vscode.TextDocument {
  return { getText: () => text } as unknown as vscode.TextDocument
}

suite('parseTags', () => {
  test('empty string returns empty array', () => {
    assert.deepStrictEqual(parseTags(''), [])
  })

  test('single tag', () => {
    assert.deepStrictEqual(parseTags('json:"id"'), [
      { key: 'json', value: 'id' },
    ])
  })

  test('multiple tags', () => {
    assert.deepStrictEqual(parseTags('json:"id" yaml:"id"'), [
      { key: 'json', value: 'id' },
      { key: 'yaml', value: 'id' },
    ])
  })

  test('value with options (comma inside quotes)', () => {
    assert.deepStrictEqual(parseTags('json:"id,omitempty"'), [
      { key: 'json', value: 'id,omitempty' },
    ])
  })

  test('preserves key order', () => {
    const result = parseTags('yaml:"y" json:"j" db:"d"')
    assert.deepStrictEqual(
      result.map((t) => t.key),
      ['yaml', 'json', 'db'],
    )
  })

  test('empty value', () => {
    assert.deepStrictEqual(parseTags('json:""'), [{ key: 'json', value: '' }])
  })
})

suite('reconstructTag', () => {
  test('single tag', () => {
    assert.strictEqual(
      reconstructTag([{ key: 'json', value: 'id' }]),
      '`json:"id"`',
    )
  })

  test('multiple tags joined by single space', () => {
    assert.strictEqual(
      reconstructTag([
        { key: 'json', value: 'id' },
        { key: 'yaml', value: 'id' },
      ]),
      '`json:"id" yaml:"id"`',
    )
  })

  test('empty tags array returns empty backtick string', () => {
    assert.strictEqual(reconstructTag([]), '``')
  })
})

suite('parseStructs', () => {
  test('no structs returns empty array', () => {
    assert.deepStrictEqual(
      parseStructs(mockDoc('package main\n\nfunc foo() {}')),
      [],
    )
  })

  test('struct with no tagged fields returns empty fields', () => {
    const structs = parseStructs(mockDoc('type Empty struct {\n\tID int\n}'))
    assert.strictEqual(structs.length, 1)
    assert.strictEqual(structs[0].name, 'Empty')
    assert.deepStrictEqual(structs[0].fields, [])
  })

  test('struct with a single tagged field', () => {
    const src = [
      'type User struct {',
      '\tID int `json:"id" yaml:"id"`',
      '}',
    ].join('\n')
    const structs = parseStructs(mockDoc(src))
    assert.strictEqual(structs.length, 1)
    assert.strictEqual(structs[0].fields.length, 1)
    assert.deepStrictEqual(structs[0].fields[0].tags, [
      { key: 'json', value: 'id' },
      { key: 'yaml', value: 'id' },
    ])
  })

  test('struct with multiple tagged fields', () => {
    const src = [
      'type User struct {',
      '\tID   int    `json:"id"   yaml:"id"`',
      '\tName string `json:"name" yaml:"name"`',
      '}',
    ].join('\n')
    const structs = parseStructs(mockDoc(src))
    assert.strictEqual(structs[0].fields.length, 2)
  })

  test('multiple structs in one file', () => {
    const src = [
      'type A struct { X int `json:"x"` }',
      'type B struct { Y string `yaml:"y"` }',
    ].join('\n')
    const structs = parseStructs(mockDoc(src))
    assert.strictEqual(structs.length, 2)
    assert.strictEqual(structs[0].name, 'A')
    assert.strictEqual(structs[1].name, 'B')
  })

  test('records correct line numbers for fields', () => {
    const src = [
      'type T struct {',
      '\tA int `json:"a"`',
      '\tB int `json:"b"`',
      '}',
    ].join('\n')
    const structs = parseStructs(mockDoc(src))
    assert.strictEqual(structs[0].fields[0].line, 1)
    assert.strictEqual(structs[0].fields[1].line, 2)
  })
})
