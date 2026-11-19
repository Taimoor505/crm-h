import { getRequestConfig } from 'next-intl/server';

// English only for now (brief §3). Locale is not part of the URL.
export default getRequestConfig(async () => ({
  locale: 'en',
  messages: (await import('../messages/en.json')).default,
}));
