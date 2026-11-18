import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getState,
  PARTNER_IDS,
  saveState,
  syncToSupabaseIfConfigured,
  USER_IDS,
  writeAuditLog,
} from '@/lib/taimoor/store';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { Stage, TemplateKey } from '@/lib/taimoor/types';

export async function GET(req: NextRequest) {
  const state = getState();
  const userId = req.headers.get('x-sandbox-user-id') || USER_IDS.OWNER;
  const user = state.users.find((u) => u.id === userId);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessible = state.workspaces.filter((ws) => {
    const isMember = state.memberships.some(
      (m) => m.workspace_id === ws.id && m.user_id === user.id && m.status === 'active'
    );
    const isPartnerAdmin = Boolean(user.partner_admin_of) && user.partner_admin_of === ws.partner_id;
    return isMember || isPartnerAdmin;
  });

  return NextResponse.json({
    data: accessible,
    all_workspaces_count: state.workspaces.length,
  });
}

export async function POST(req: NextRequest) {
  try {
    const state = getState();
    const userId = req.headers.get('x-sandbox-user-id') || USER_IDS.OWNER;
    const user = state.users.find((u) => u.id === userId);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const name = String(body?.name || '').trim();
    const templateKey = (body?.template_key || 'general') as TemplateKey;
    const locale = body?.locale === 'ur' ? 'ur' : 'en';
    const partnerId = body?.partner_id || user.partner_admin_of || PARTNER_IDS.HOUSE;
    const seedSamples = body?.seed_samples !== false;

    if (!name) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }

    const template = state.industry_templates.find((t) => t.key === templateKey);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template_key "${templateKey}". Valid: real_estate, law, distributor, clinic, general` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const workspaceId = crypto.randomUUID();
    const workspace = {
      id: workspaceId,
      partner_id: partnerId,
      name,
      name_ur: body?.name_ur ? String(body.name_ur) : undefined,
      industry_template_id: template.id,
      template_key: template.key,
      branding: {
        appName: name,
        logoText: name.slice(0, 2).toUpperCase(),
        ...(body?.branding || {}),
      },
      locale: locale as 'en' | 'ur',
      timezone: 'Asia/Karachi',
      status: 'active' as const,
      created_at: now,
    };

    state.workspaces.push(workspace);
    state.memberships.push({
      id: crypto.randomUUID(),
      user_id: user.id,
      workspace_id: workspaceId,
      role: 'owner',
      status: 'active',
      created_at: now,
    });

    // Clone custom field definitions into workspace
    const clonedFields = template.definition.custom_fields.map((cf, idx) => {
      const def = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        entity: cf.entity,
        key: cf.key,
        label_en: cf.label_en,
        label_ur: cf.label_ur,
        type: cf.type,
        options: cf.options || [],
        required: cf.required,
        position: idx + 1,
        hidden: false,
        created_at: now,
      };
      state.custom_field_defs.push(def);
      return def;
    });

    // Clone pipelines & stages
    let firstPipelineId = '';
    const clonedStages: Stage[] = [];
    template.definition.pipelines.forEach((p, pIdx) => {
      const pipelineId = crypto.randomUUID();
      if (pIdx === 0) firstPipelineId = pipelineId;
      state.pipelines.push({
        id: pipelineId,
        workspace_id: workspaceId,
        name: p.name,
        position: pIdx + 1,
        created_at: now,
      });
      p.stages.forEach((s, sIdx) => {
        const st: Stage = {
          id: crypto.randomUUID(),
          workspace_id: workspaceId,
          pipeline_id: pipelineId,
          name: s.name,
          position: sIdx + 1,
          kind: s.kind,
        };
        state.stages.push(st);
        clonedStages.push(st);
      });
    });

    // Optionally seed sample contacts and deals
    let seededContacts = 0;
    let seededDeals = 0;
    if (seedSamples) {
      for (const sc of template.definition.sample_contacts) {
        const norm = normalizePhoneToE164(sc.phone);
        const contactId = crypto.randomUUID();
        state.contacts.push({
          id: contactId,
          workspace_id: workspaceId,
          name: sc.name,
          phone_e164: norm.e164 || `+92300${Math.floor(1000000 + Math.random() * 8999999)}`,
          alt_phone: null,
          email: sc.email || null,
          company_id: null,
          source: sc.source,
          owner_id: user.id,
          status: sc.status,
          tags: sc.tags,
          custom: sc.custom,
          last_activity_at: now,
          updated_at: now,
          created_at: now,
          deleted_at: null,
        });
        seededContacts += 1;

        if (sc.deal && firstPipelineId && clonedStages.length > 0) {
          const st = clonedStages[sc.deal.stage_index] || clonedStages[0];
          state.deals.push({
            id: crypto.randomUUID(),
            workspace_id: workspaceId,
            pipeline_id: firstPipelineId,
            stage_id: st.id,
            contact_id: contactId,
            title: sc.deal.title,
            value_pkr: sc.deal.value_pkr,
            owner_id: user.id,
            expected_close: null,
            lost_reason: null,
            custom: sc.deal.custom,
            stage_entered_at: now,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });
          seededDeals += 1;
        }
      }
    }

    writeAuditLog(state, {
      workspace_id: workspaceId,
      actor_id: user.id,
      action: 'workspace.created',
      entity_type: 'workspace',
      entity_id: workspaceId,
      meta: {
        template_key: template.key,
        cloned_custom_fields: clonedFields.length,
        cloned_stages: clonedStages.length,
      },
    });

    saveState(state);
    await syncToSupabaseIfConfigured('workspaces', workspace as unknown as Record<string, unknown>);

    return NextResponse.json(
      {
        workspace,
        cloned: {
          template_key: template.key,
          custom_fields: clonedFields.length,
          stages: clonedStages.length,
          sample_contacts: seededContacts,
          sample_deals: seededDeals,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
