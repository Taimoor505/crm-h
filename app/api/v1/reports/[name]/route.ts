import { ApiError, json, readQuery, userRoute } from '@/server/http';
import { REPORTS, reportFilters } from '@/server/reports/reports';

/**
 * GET /reports/{sources|speed-to-lead|funnel|agents|won-value|lost-reasons}
 * Filters: from, to (YYYY-MM-DD, workspace time, inclusive; default last 30
 * days), pipeline_id, source, agent_id. Agents only ever get their own numbers.
 */
export const GET = userRoute<{ name: string }>({}, async ({ req, tx, workspace, userId, isManager, params }) => {
  const report = REPORTS[params.name as keyof typeof REPORTS];
  if (!report) throw new ApiError(404, 'not_found', `Unknown report "${params.name}"`);
  const filters = readQuery(req, reportFilters);
  if (!isManager) filters.agent_id = userId;
  const data = await report({ tx, workspaceId: workspace.id, timezone: workspace.timezone, filters });
  return json({ data, filters: { ...filters, timezone: workspace.timezone } });
});
