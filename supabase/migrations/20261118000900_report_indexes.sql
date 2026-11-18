-- =============================================================================
-- Indexes for /reports/* (Huzaifa, weeks 9-10)
-- Reports run as live queries (fine up to ~50k contacts per workspace, per
-- the brief). These indexes keep the date-range scans cheap. They are on
-- Taimoor's tables; keep them when his migrations replace the stub.
-- =============================================================================

-- Lead arrivals and re-enquiries (system activities with meta.kind).
create index if not exists activities_lead_events_idx on public.activities (workspace_id, created_at)
  where type = 'system' and meta ->> 'kind' in ('lead_received', 're_enquiry');
-- Assignments per agent.
create index if not exists activities_assignment_idx on public.activities (workspace_id, created_at)
  where type = 'assignment';
-- Stage history for the funnel.
create index if not exists activities_stage_change_idx on public.activities (deal_id)
  where type = 'stage_change';

create index if not exists contacts_workspace_created_idx on public.contacts (workspace_id, created_at);
create index if not exists deals_workspace_stage_entered_idx on public.deals (workspace_id, stage_entered_at);
create index if not exists deals_workspace_created_idx on public.deals (workspace_id, created_at);
create index if not exists tasks_completed_idx on public.tasks (workspace_id, completed_at) where status = 'done';
