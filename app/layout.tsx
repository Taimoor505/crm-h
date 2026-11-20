import type { Metadata, Viewport } from 'next';
import {
  Plus_Jakarta_Sans,
  DM_Sans,
  JetBrains_Mono,
  Noto_Sans_Arabic,
  Inter,
  Manrope,
  Poppins,
  Nunito_Sans,
  IBM_Plex_Sans,
  Outfit,
} from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

// Only the developer workbench uses it; kept so /dev/workbench renders as before.
const notoUrdu = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-urdu',
  preload: false,
});

// Brand font choices (Settings › Branding). Not preloaded: a browser only
// downloads the one a workspace picks (lib/theme/fonts.ts).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', preload: false });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', preload: false });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', preload: false });
const nunito = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito', preload: false });
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', preload: false });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', preload: false });

// Branding sets the real title and favicon on the client (lib/theme/BrandingProvider).
export const metadata: Metadata = {
  title: 'CRM',
  description: 'Lead management, pipelines, follow-ups and WhatsApp.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4F46E5',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  return (
    <html
      lang="en"
      className={[plusJakarta, dmSans, jetbrainsMono, notoUrdu, inter, manrope, poppins, nunito, plex, outfit].map((f) => f.variable).join(" ")}
    >
      <body suppressHydrationWarning className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
