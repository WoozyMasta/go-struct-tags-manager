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

  test('value with escaped quotes', () => {
    assert.deepStrictEqual(
      parseTags('description:"address i.e \\"0.0.0.0:8080\\" (default)"'),
      [
        {
          key: 'description',
          value: 'address i.e \\"0.0.0.0:8080\\" (default)',
        },
      ],
    )
  })

  test('escaped quotes do not truncate subsequent tags', () => {
    const result = parseTags('description:"i.e \\"0.0.0.0:8080\\"" env:"ADDR"')
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].key, 'description')
    assert.strictEqual(result[1].key, 'env')
    assert.strictEqual(result[1].value, 'ADDR')
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

  test('tagEnd stops at closing backtick, not a backtick in a comment', () => {
    // If tagEnd used lastIndexOf('`'), it would extend into the comment backtick
    const line = '\tA string `json:"a"` // use `json:"x"` as reference'
    const src = ['type T struct {', line, '}'].join('\n')
    const structs = parseStructs(mockDoc(src))
    const field = structs[0].fields[0]
    // tag is `json:"a"` — 10 chars; tagEnd must point right after its closing backtick
    const expectedEnd = line.indexOf('`') + '`json:"a"`'.length
    assert.strictEqual(field.tagEnd, expectedEnd)
  })

  test('tagStart and tagEnd are correct for field with escaped-quote value', () => {
    const tag = '`description:"i.e \\"0.0.0.0:8080\\""`'
    const line = '\tA ListenEndpoint ' + tag
    const src = ['type T struct {', line, '}'].join('\n')
    const structs = parseStructs(mockDoc(src))
    const field = structs[0].fields[0]
    assert.strictEqual(field.tagStart, line.indexOf('`'))
    assert.strictEqual(field.tagEnd, line.indexOf('`') + tag.length)
  })
})
