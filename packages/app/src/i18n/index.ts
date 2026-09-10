import en from './en.json';

type Dict = Record<string, string>;
const dictionaries: Record<string, Dict> = { en };
let current = 'en';

export function setLocale(locale: string): void {
  if (dictionaries[locale]) current = locale;
}

/** t('hud.turnOf', { name: 'Bob' }) */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = dictionaries[current]?.[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
