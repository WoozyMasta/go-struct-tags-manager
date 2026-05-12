import * as vscode from 'vscode'

type Dict = Record<string, string>

const fallbackByLang: Record<string, Dict> = {
  de: {
    'Sort & Align Tags': 'Tags sortieren und ausrichten',
    'Sort Tags': 'Tags sortieren',
    'Align Tags': 'Tags ausrichten',
  },
  es: {
    'Sort & Align Tags': 'Ordenar y alinear etiquetas',
    'Sort Tags': 'Ordenar etiquetas',
    'Align Tags': 'Alinear etiquetas',
  },
  fr: {
    'Sort & Align Tags': 'Trier et aligner les tags',
    'Sort Tags': 'Trier les tags',
    'Align Tags': 'Aligner les tags',
  },
  it: {
    'Sort & Align Tags': 'Ordina e allinea i tag',
    'Sort Tags': 'Ordina i tag',
    'Align Tags': 'Allinea i tag',
  },
  ja: {
    'Sort & Align Tags': 'タグを並び替えして揃える',
    'Sort Tags': 'タグを並び替え',
    'Align Tags': 'タグを揃える',
  },
  ko: {
    'Sort & Align Tags': '태그 정렬 및 맞춤',
    'Sort Tags': '태그 정렬',
    'Align Tags': '태그 맞춤',
  },
  'pt-br': {
    'Sort & Align Tags': 'Ordenar e alinhar tags',
    'Sort Tags': 'Ordenar tags',
    'Align Tags': 'Alinhar tags',
  },
  ru: {
    'Sort & Align Tags': 'Сортировать и выровнять теги',
    'Sort Tags': 'Сортировать теги',
    'Align Tags': 'Выровнять теги',
  },
  'zh-cn': {
    'Sort & Align Tags': '排序并对齐标签',
    'Sort Tags': '排序标签',
    'Align Tags': '对齐标签',
  },
  'zh-tw': {
    'Sort & Align Tags': '排序並對齊標籤',
    'Sort Tags': '排序標籤',
    'Align Tags': '對齊標籤',
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
