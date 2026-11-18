/** wa.me / tel: links from E.164. No libphonenumber here, so the app shell stays small. */
export function waDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}

export function waLink(e164: string, text?: string): string {
  return `https://wa.me/${waDigits(e164)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function telLink(e164: string): string {
  return `tel:${e164}`;
}
