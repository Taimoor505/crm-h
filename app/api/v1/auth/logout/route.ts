import { signOut } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(signOut);
export const dynamic = 'force-dynamic';
