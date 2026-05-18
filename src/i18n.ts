import * as vscode from 'vscode'

type Dict = Record<string, string>

const fallbackByLang: Record<string, Dict> = {
  de: {
    'Sort & Align Tags': 'Tags sortieren und ausrichten',
    'Sort Tags': 'Tags sortieren',
    'Align Tags': 'Tags ausrichten',
    'Optimize layout (save {0} bytes)': 'Layout optimieren ({0} Bytes sparen)',
    'Optimize field order': 'Feldreihenfolge optimieren',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'Speicher: {0} Bytes als Padding verschwendet — Felder neu anordnen',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'Speicher: Felder mit Zeigern sollten vor zeigerfreien Feldern stehen',
  },
  es: {
    'Sort & Align Tags': 'Ordenar y alinear etiquetas',
    'Sort Tags': 'Ordenar etiquetas',
    'Align Tags': 'Alinear etiquetas',
    'Optimize layout (save {0} bytes)': 'Optimizar memoria (ahorrar {0} bytes)',
    'Optimize field order': 'Optimizar orden de campos',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'Memoria: {0} bytes desperdiciados en relleno — reordenar campos',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'Memoria: los campos con punteros deben preceder a los campos sin punteros',
  },
  fr: {
    'Sort & Align Tags': 'Trier et aligner les tags',
    'Sort Tags': 'Trier les tags',
    'Align Tags': 'Aligner les tags',
    'Optimize layout (save {0} bytes)':
      'Optimiser la disposition ({0} octets économisés)',
    'Optimize field order': "Optimiser l'ordre des champs",
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'Mémoire : {0} octets perdus en rembourrage — réordonner les champs',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'Mémoire : les champs avec pointeurs doivent précéder les champs sans pointeur',
  },
  it: {
    'Sort & Align Tags': 'Ordina e allinea i tag',
    'Sort Tags': 'Ordina i tag',
    'Align Tags': 'Allinea i tag',
    'Optimize layout (save {0} bytes)': 'Ottimizza layout (risparmia {0} byte)',
    'Optimize field order': "Ottimizza l'ordine dei campi",
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'Memoria: {0} byte sprecati in padding — riordinare i campi',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'Memoria: i campi con puntatori devono precedere i campi senza puntatori',
  },
  ja: {
    'Sort & Align Tags': 'タグを並び替えして揃える',
    'Sort Tags': 'タグを並び替え',
    'Align Tags': 'タグを揃える',
    'Optimize layout (save {0} bytes)': 'レイアウトを最適化（{0} バイト節約）',
    'Optimize field order': 'フィールド順を最適化',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'メモリ: パディングに {0} バイト無駄 — フィールドを並び替えて節約',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'メモリ: ポインタを含むフィールドは非ポインタフィールドより先に置く必要があります',
  },
  ko: {
    'Sort & Align Tags': '태그 정렬 및 맞춤',
    'Sort Tags': '태그 정렬',
    'Align Tags': '태그 맞춤',
    'Optimize layout (save {0} bytes)': '레이아웃 최적화 ({0} 바이트 절약)',
    'Optimize field order': '필드 순서 최적화',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      '메모리: 패딩으로 {0} 바이트 낙비 — 필드 재정렬로 절약 가능',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      '메모리: 포인터를 포함한 필드가 비포인터 필드보다 앞에 와야 합니다',
  },
  'pt-br': {
    'Sort & Align Tags': 'Ordenar e alinhar tags',
    'Sort Tags': 'Ordenar tags',
    'Align Tags': 'Alinhar tags',
    'Optimize layout (save {0} bytes)': 'Otimizar layout (economiza {0} bytes)',
    'Optimize field order': 'Otimizar ordem dos campos',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'Memória: {0} bytes desperdiçados em padding — reordenar campos',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'Memória: campos com ponteiros devem preceder campos sem ponteiros',
  },
  ru: {
    'Sort & Align Tags': 'Сортировать и выровнять теги',
    'Sort Tags': 'Сортировать теги',
    'Align Tags': 'Выровнять теги',
    'Optimize layout (save {0} bytes)':
      'Оптимизировать расположение (сэкономить {0} байт)',
    'Optimize field order': 'Оптимизировать порядок полей',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      'Память: {0} байт потрачено на выравнивание — переупорядочить поля',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      'Память: поля с указателями должны стоять перед полями без указателей',
  },
  'zh-cn': {
    'Sort & Align Tags': '排序并对齐标签',
    'Sort Tags': '排序标签',
    'Align Tags': '对齐标签',
    'Optimize layout (save {0} bytes)': '优化内存布局（节省 {0} 字节）',
    'Optimize field order': '优化字段顺序',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      '内存：填充浪费 {0} 字节 — 重新排序字段可节省',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      '内存：包含指针的字段应展列在非指针字段之前',
  },
  'zh-tw': {
    'Sort & Align Tags': '排序並對齊標籤',
    'Sort Tags': '排序標籤',
    'Align Tags': '對齊標籤',
    'Optimize layout (save {0} bytes)': '優化記憶體佈局（節省 {0} 位元組）',
    'Optimize field order': '優化欄位順序',
    'Memory: {0} bytes wasted in padding — reorder fields to save':
      '記憶體：填充浪費 {0} 位元組 — 重新排序欄位可節省',
    'Memory: pointer-bearing fields should precede non-pointer fields':
      '記憶體：含指標的欄位應展列於非指標欄位之前',
  },
}

function detectLang(): string {
  return vscode.env.language.toLowerCase()
}

function fallbackForLang(lang: string): Dict | undefined {
  if (fallbackByLang[lang]) {
    return fallbackByLang[lang]
  }
  const base = lang.split('-')[0]
  if (base && fallbackByLang[base]) {
    return fallbackByLang[base]
  }
  return undefined
}

export function t(key: string): string {
  const translated = vscode.l10n.t(key)
  if (translated !== key) {
    return translated
  }
  return fallbackForLang(detectLang())?.[key] ?? key
}

/**
 * Translates a key with positional placeholders `{0}`, `{1}`, … replaced by `args`.
 * Falls back to the English key with substitutions applied when no translation is found.
 */
export function tf(key: string, ...args: (string | number)[]): string {
  const template =
    vscode.l10n.t(key) !== key
      ? vscode.l10n.t(key)
      : (fallbackForLang(detectLang())?.[key] ?? key)
  return template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''))
}
