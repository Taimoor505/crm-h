import type { Metadata } from 'next';
import {
  Plus_Jakarta_Sans,
  DM_Sans,
  JetBrains_Mono,
  Noto_Sans_Arabic,
} from 'next/font/google';
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

const notoUrdu = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-urdu',
});

export const metadata: Metadata = {
  title: 'Taimoor Core — White-Label CRM Backend & Schema Explorer',
  description:
    'Multi-tenant Supabase/PostgreSQL CRM backend workbench, OpenAPI 3.1 live runner, RLS isolation tester, and bilingual EN/UR industry template engine.',
  openGraph: {
    title: 'Taimoor Core — White-Label CRM Backend & Schema Explorer',
    description:
      'Multi-tenant Supabase/PostgreSQL CRM backend workbench, OpenAPI 3.1 live runner, RLS isolation tester, and bilingual EN/UR industry template engine.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Taimoor Core — White-Label CRM Backend & Schema Explorer',
    description:
      'Multi-tenant Supabase/PostgreSQL CRM backend workbench, OpenAPI 3.1 live runner, RLS isolation tester, and bilingual EN/UR industry template engine.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${notoUrdu.variable}`}
    >
      <body suppressHydrationWarning className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
