import { createClient } from "@supabase/supabase-js";
import {
  getLeadFields,
  extractFieldKeys,
  fetchLeadsPage,
  extractLeads,
  findPagination,
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
        {
          ok: false,
          step: "getMetaData",
          hint: "No field_key values found. Visit /api/fields to inspect the raw response.",
          sample: meta,
        },
        { status: 502 }
      );
    }
 
    const now = Math.floor(Date.now() / 1000);
    const fromDate = now - 48 * 60 * 60;
 
    let paginationId = null;
    let paginationKey = null;
    const seenLeadIds = new Set();
    let page = 0;
    let totalSaved = 0;
    const pageNotes = [];
    let rawDebug = null;
 
    do {
      page += 1;
      const listJson = await fetchLeadsPage({
        fields,
        fromDate,
        toDate: now,
        paginationId,
        paginationKey,
      });
 
      const leads = extractLeads(listJson);
      const pagination = findPagination(listJson);
 
      if (leads.length === 0 && page === 1) {
        rawDebug = listJson;
        pageNotes.push({
          page,
          note: "No leads found; raw response attached as rawDebug.",
        });
        break;
      }
 
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
 
      pageNotes.push({
        page,
        received: leads.length,
        fresh: freshLeads.length,
        paginationKeyFound: pagination.key,
        paginationValue: pagination.id ? String(pagination.id).slice(0, 60) : null,
      });
 
      const wholePageRepeated = leads.length > 0 && freshLeads.length === 0;
 
      if (pagination.id && leads.length === 100 && !wholePageRepeated) {
        paginationId = pagination.id;
        paginationKey = pagination.key;
      } else {
        paginationId = null;
      }
    } while (paginationId && page < 50);
 
    return Response.json({
      ok: true,
      startedAt,
      fieldsDiscovered: fields.length,
      pagesFetched: page,
      leadsSaved: totalSaved,
      pageNotes,
      rawDebug,
    });
  } catch (err) {
    return Response.json(
      { ok: false, startedAt, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
