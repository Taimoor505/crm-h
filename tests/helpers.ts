import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import postgres from 'postgres';

/** Superuser connection for seeding and assertions (bypasses RLS). */
export const admin = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });

export async function token(userId: string): Promise<string> {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!));
}

export async function createUser(name: string): Promise<string> {
  const id = randomUUID();
  await admin`insert into auth.users (id, email) values (${id}, ${`${id}@test.local`})`;
  await admin`insert into public.users (id, name) values (${id}, ${name})`;
  return id;
}

let housePartner: string | null = null;

export async function createWorkspace(name = 'Test Realty', timezone = 'Asia/Karachi') {
  if (!housePartner) {
    const [p] = await admin<{ id: string }[]>`
      insert into public.partners (name, is_house) values ('House', true) returning id`;
    housePartner = p.id;
  }
  const [ws] = await admin<{ id: string }[]>`
    insert into public.workspaces (partner_id, name, timezone) values (${housePartner}, ${name}, ${timezone})
    returning id`;
  return ws.id;
}

export async function addMember(workspaceId: string, userId: string, role: 'owner' | 'manager' | 'agent') {
  await admin`insert into public.memberships (workspace_id, user_id, role) values (${workspaceId}, ${userId}, ${role})`;
}

/** A workspace with an owner/manager and three agents. */
export async function team(name = 'Test Realty') {
  const ws = await createWorkspace(name);
  const manager = await createUser('Manager Mehwish');
  const ali = await createUser('Ali');
  const sara = await createUser('Sara');
  const bilal = await createUser('Bilal');
  await addMember(ws, manager, 'owner');
  for (const a of [ali, sara, bilal]) await addMember(ws, a, 'agent');
  return { ws, manager, ali, sara, bilal };
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  as?: string;       // user id → Authorization header
  ws?: string;       // workspace id → X-Workspace-Id
  params?: Record<string, string>;
}

/** Invokes a Next.js route handler directly and parses the JSON response. */
export async function call(handler: unknown, opts: CallOptions = {}) {
  const url = new URL(`https://crm.test${opts.path ?? '/api/v1/test'}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.as) headers.authorization = `Bearer ${await token(opts.as)}`;
  if (opts.ws) headers['x-workspace-id'] = opts.ws;
  let body: BodyInit | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['content-type'] ??= 'application/json';
  }
  const req = new Request(url, { method: opts.method ?? 'GET', headers, body });
  const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

export function minutesFromNow(m: number): string {
  return new Date(Date.now() + m * 60_000).toISOString();
}
