import { signIn } from '@/server/identity/routes';
import { logged } from '@/server/observability/request-log';

export const POST = logged(signIn);
export const dynamic = 'force-dynamic';
