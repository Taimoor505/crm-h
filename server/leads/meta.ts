import { jsonb, type Db, type Tx } from '../db';
import { ApiError } from '../http';
import { decryptSecret } from '../crypto';
import { metaGraph } from '../channels/meta';
import { enqueue } from '../queue';
import { applyMapping } from './mapping';
import { ingestLead } from './ingest';
import type { LeadSource } from './sources';

/** Subscribes the page to our app's leadgen webhook; Meta errors become a 422. */
export async function subscribeMetaPage(pageId: string, token: string): Promise<void> {
  try {
    await metaGraph().subscribePage(pageId, token);
  } catch (err) {
    throw new ApiError(422, 'meta_subscribe_failed', err instanceof Error ? err.message : 'Could not subscribe the page');
  }
}

export interface LeadgenChange {
  leadgen_id: string;
  page_id: string;
  form_id?: string;
  ad_id?: string;
  created_time?: number;
}

/**
 * Webhook step: one `leadgen` change → a lead_events row and a job to fetch
 * the answers. The source is the active meta_leadgen source for that page
 * whose form list includes the form (or is empty); a form-specific source
 * wins over a catch-all. Meta retries webhooks, so a lead already recorded
 * for the source is ignored.
 */
export async function recordLeadgen(tx: Db, change: LeadgenChange): Promise<'queued' | 'duplicate' | 'no_source'> {
  const [source] = await tx<{ id: string; workspace_id: string }[]>`
    select s.id, s.workspace_id
      from public.lead_sources s
      join public.workspaces w on w.id = s.workspace_id
     where s.type = 'meta_leadgen' and s.is_active and w.status = 'active'
       and s.settings->>'meta_page_id' = ${change.page_id}
       and (coalesce(jsonb_array_length(s.settings->'meta_form_ids'), 0) = 0
            or s.settings->'meta_form_ids' ? ${change.form_id ?? ''})
     order by coalesce(jsonb_array_length(s.settings->'meta_form_ids'), 0) desc, s.created_at
     limit 1`;
  if (!source) return 'no_source';

  const [dup] = await tx`
    select 1 from public.lead_events
     where lead_source_id = ${source.id} and payload->>'leadgen_id' = ${change.leadgen_id}`;
  if (dup) return 'duplicate';

  const [event] = await tx<{ id: string }[]>`
    insert into public.lead_events (workspace_id, lead_source_id, payload)
    values (${source.workspace_id}, ${source.id}, ${jsonb(tx, change)}::jsonb)
    returning id`;
  await enqueue(tx, 'meta.fetch_lead', { lead_event_id: event.id }, {
    workspaceId: source.workspace_id,
    dedupeKey: `meta.fetch_lead:${event.id}`,
  });
  return 'queued';
}

/**
 * Worker step ('meta.fetch_lead'): read the lead's answers from the Graph API
 * with the page token and send them through the normal ingest path. Graph
 * errors are thrown so the job retries with backoff; a lead with no usable
 * phone or email is recorded as rejected.
 */
export async function fetchMetaLead(tx: Tx, leadEventId: string): Promise<string> {
  const [ev] = await tx<{ id: string; status: string; payload: LeadgenChange; source: LeadSource }[]>`
    select e.id, e.status, e.payload, to_jsonb(s.*) as source
      from public.lead_events e
      join public.lead_sources s on s.id = e.lead_source_id
     where e.id = ${leadEventId}
       for update of e`;
  if (!ev || ev.status !== 'received') return 'already handled';
  if (!ev.source.secret) throw new Error('Meta lead source has no page token');

  const lead = await metaGraph().fetchLead(ev.payload.leadgen_id, decryptSecret(ev.source.secret));
  await tx`update public.lead_events set payload = payload || ${jsonb(tx, { lead })}::jsonb where id = ${ev.id}`;

  try {
    const result = await tx.savepoint((sp) =>
      ingestLead(sp, {
        workspaceId: ev.source.workspace_id,
        source: {
          id: ev.source.id,
          name: ev.source.name,
          source_label: ev.source.source_label,
          default_tags: ev.source.settings?.default_tags,
        },
        lead: applyMapping(lead, ev.source.mapping),
        leadEventId: ev.id,
      }),
    );
    await tx`update public.lead_events set status = ${result.status}, contact_id = ${result.contact.id}
             where id = ${ev.id}`;
    return result.status;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    await tx`update public.lead_events set status = 'rejected', error = ${err.message} where id = ${ev.id}`;
    return 'rejected';
  }
}
