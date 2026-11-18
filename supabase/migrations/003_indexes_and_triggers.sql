-- Taimoor Core: 003_indexes_and_triggers.sql
-- GIN Indexes on JSONB & Tags, E.164 Duplicate Key, and Cursor Pagination Indexes

-- Unique E.164 phone per workspace for active (non-soft-deleted) contacts
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_ws_phone_unique
  ON public.contacts (workspace_id, phone_e164)
  WHERE deleted_at IS NULL;

-- GIN indexes for fast JSONB custom field filtering and tag containment queries
CREATE INDEX IF NOT EXISTS idx_contacts_custom_gin ON public.contacts USING GIN (custom);
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON public.contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_deals_custom_gin ON public.deals USING GIN (custom);
CREATE INDEX IF NOT EXISTS idx_companies_custom_gin ON public.companies USING GIN (custom);

-- Cursor pagination & timeline indexes
CREATE INDEX IF NOT EXISTS idx_contacts_cursor
  ON public.contacts (workspace_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_deals_pipeline_stage
  ON public.deals (workspace_id, pipeline_id, stage_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_contact_timeline
  ON public.activities (workspace_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent
  ON public.messages (conversation_id, sent_at ASC);
