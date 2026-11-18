'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail, MessageCircle, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBranding } from '@/lib/theme/BrandingProvider';
import { useSession } from '@/lib/auth/SessionProvider';
import { waLink } from '@/lib/phone';

/** Full-page state for `403 workspace_suspended` (brief §8.11). */
export default function SuspendedPage() {
  const t = useTranslations('suspended');
  const { branding } = useBranding();
  const { signOut } = useSession();
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-gray-100 text-gray-700" aria-hidden="true">
          <PauseCircle className="size-7" />
        </div>
        <h1 className="font-heading text-xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-600">{t('body')}</p>
        <div className="mt-6 flex flex-col gap-2">
          {branding.supportWhatsapp && (
            <Button asChild className="h-12">
              <a href={waLink(branding.supportWhatsapp)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" aria-hidden="true" />
                {t('whatsapp')}
              </a>
            </Button>
          )}
          {branding.supportEmail && (
            <Button asChild variant="outline" className="h-12">
              <a href={`mailto:${branding.supportEmail}`}>
                <Mail className="size-4" aria-hidden="true" />
                {t('email')}
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-12"
            onClick={() => {
              signOut();
              router.replace('/login');
            }}
          >
            {t('signOut')}
          </Button>
        </div>
      </div>
    </main>
  );
}
