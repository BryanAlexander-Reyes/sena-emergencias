/** Raíz del proyecto, nunca /rest/v1 ni /functions/v1. Sin secretos en errores. */
export function normalizarUrlSupabase(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) return '';
    return url.origin;
  } catch {
    return '';
  }
}
