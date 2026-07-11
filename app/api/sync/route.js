import { createClient } from "@supabase/supabase-js";
import {
  getLeadFields,
  extractFieldKeys,
  fetchLeadsPage,
  extractLeads,
} from "../../../lib/meritto";
 
export const dynamic = "force-dynamic";
export const maxDuration = 60;
 
function leadIdentity(lead) {
  return (
    lead.lead_id ||
    lead.leadId ||
    lead.id ||
    lead.user_id ||
    lead.email ||
    lead.mobile ||
    JSON.stringify(lead)
  );
}
 
function oldestDate(leads) {
  const dates = leads
    .map((l) => Number(l.user_registration_date || l.user_date || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  return dates.length ? Math.min(...dates) : null;
}
 
export async function GET() {
  const startedAt = new Date().toISOString();
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
 
    const meta = await getLeadFields();
    const fields = extractFieldKeys(meta);
    if (fields.length === 0) {
      return Response.json(
        { ok: false, step: "getMetaData", sample: meta },
        { status: 502 }
      );
    }
 
    const now = Math.floor(Date.now() / 1000);
    const fromDate = now - 48 * 60 * 60;
 
    const seenLeadIds = new Set();
    let cursor = now;
    let requestsMade = 0;
    let totalSaved = 0;
    const steps = [];
 
    while (requestsMade < 40) {
      requestsMade += 1;
 
      const listJson = await fetchLeadsPage({
        fields,
        fromDate,
        toDate: cursor,
      });
      const leads = extractLeads(listJson);
 
      const freshLeads = leads.filter(
        (lead) => !seenLeadIds.has(String(leadIdentity(lead)))
      );
      freshLeads.forEach((lead) =>
        seenLeadIds.add(String(leadIdentity(lead)))
      );
 
      if (freshLeads.length > 0) {
        const rows = freshLeads.map((lead) => ({
          lead_id: String(leadIdentity(lead)),
          data: lead,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await supabase
          .from("merito_leads")
          .upsert(rows, { onConflict: "lead_id" });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
        totalSaved += rows.length;
      }
 
      steps.push({
        step: requestsMade,
        received: leads.length,
        fresh: freshLeads.length,
      });
 
      const oldest = oldestDate(leads);
 
      if (leads.length < 100 || !oldest || freshLeads.length === 0) break;
      cursor = oldest - 1;
      if (cursor <= fromDate) break;
    }
 
    return Response.json({
      ok: true,
      startedAt,
      requestsMade,
      leadsSaved: totalSaved,
      uniqueLeadsSeen: seenLeadIds.size,
      steps,
    });
  } catch (err) {
    return Response.json(
      { ok: false, startedAt, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
