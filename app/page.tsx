import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// middleware.ts normally handles "/"; this covers runtimes without middleware.
export default async function RootPage() {
  const signedIn = (await cookies()).has('crm_session');
  redirect(signedIn ? '/home' : '/login');
}
