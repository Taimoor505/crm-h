/**
 * Re-mounts on every navigation, so each page enters with the Material
 * "rise" transition (CSS, no JavaScript cost).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
