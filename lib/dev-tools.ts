/** Dev-only pages (/dev/*) and helpers. Server and client safe. */
export function isDevToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true'
  );
}
