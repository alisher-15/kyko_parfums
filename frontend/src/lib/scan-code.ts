// Keys of the Russian ЙЦУКЕН layout → the Latin characters on the same keys (QWERTY).
const RU_KEYS = "йцукенгшщзхъфывапролджэячсмитьбюё";
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
// Punctuation that the Russian layout puts on other keys.
const RU_PUNCT: Record<string, string> = {
  ".": "/",
  ",": "?",
  '"': "@",
  "№": "#",
  ";": "$",
  ":": "^",
  "?": "&",
};

export function hasCyrillic(s: string): boolean {
  return /[а-яё]/i.test(s);
}

/**
 * A code typed while the Russian keyboard layout was on, back in Latin: a scanner presses keys,
 * so «ФИС12345» is really «ABC12345». Strings without Cyrillic are returned as they are.
 */
export function fromRussianLayout(s: string): string {
  if (!hasCyrillic(s)) return s;
  return [...s]
    .map((ch) => {
      const lower = ch.toLowerCase();
      const i = RU_KEYS.indexOf(lower);
      if (i >= 0) return ch === lower ? EN_KEYS[i] : EN_KEYS[i].toUpperCase();
      return RU_PUNCT[ch] ?? ch;
    })
    .join("");
}

/** A scanned code as sent to the server: no spaces, Latin even if typed in the Russian layout. */
export function normalizeScan(raw: string): string {
  return fromRussianLayout(raw.replace(/\s+/g, ""));
}
