'use client';

import dynamic from 'next/dynamic';

// Client only: the session arrives in the URL fragment.
const AuthCallback = dynamic(() => import('@/components/layout/AuthCallback').then((m) => m.AuthCallback), { ssr: false });

export default function AuthCallbackPage() {
  return <AuthCallback />;
}
