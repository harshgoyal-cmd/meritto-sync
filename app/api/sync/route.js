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
 
function dateSpan(leads) {
  const dates = leads
    .map(
      (l) =>
        l.user_registration_date || l.user_date || l.created_at || l.date || null
    )
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return { earliest: null, latest: null };
  return { earliest: dates[0], latest: dates[dates.length - 1] };
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
    const windows = [[now - 48 * 60 * 60, now]];
 
    const seenLeadIds = new Set();
    let requestsMade = 0;
    let totalSaved = 0;
    let splits = 0;
    const notes = [];
 
    while (windows.length > 0 && requestsMade < 40) {
      const [from, to] = windows.pop();
      requestsMade += 1;
 
      const listJson = await fetchLeadsPage({
        fields,
        fromDate: from,
        toDate: to,
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
 
      const span = dateSpan(leads);
      const isFullBasket = leads.length === 100;
      const windowSeconds = to - from;
 
      notes.push({
        askedFor: `${new Date(from * 1000).toISOString()} → ${new Date(to * 1000).toISOString()}`,
        received: leads.length,
        fresh: freshLeads.length,
        actualLeadDates: `${span.earliest} → ${span.latest}`,
        action:
          isFullBasket && windowSeconds > 120
            ? "saved, then split for more"
            : "saved",
      });
 
      if (isFullBasket && windowSeconds > 120) {
        const mid = Math.floor((from + to) / 2);
        windows.push([from, mid]);
        windows.push([mid, to]);
        splits += 1;
      }
    }
 
    return Response.json({
      ok: true,
      startedAt,
      fieldsDiscovered: fields.length,
      requestsMade,
      windowsSplit: splits,
      leadsSaved: totalSaved,
      uniqueLeadsSeen: seenLeadIds.size,
      notes,
    });
  } catch (err) {
    return Response.json(
      { ok: false, startedAt, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
