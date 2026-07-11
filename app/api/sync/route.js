import { createClient } from "@supabase/supabase-js";
import {
  getLeadFields,
  extractFieldKeys,
  fetchLeadsPage,
  extractLeads,
  extractPaginationId,
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
          hint: "No field_key values found. Visit /api/fields to inspect the raw response shape.",
          sample: meta,
        },
        { status: 502 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const fromDate = now - 48 * 60 * 60;

    let paginationId = null;
    let page = 0;
    let totalSaved = 0;
    const pageNotes = [];

    do {
      page += 1;
      const listJson = await fetchLeadsPage({
        fields,
        fromDate,
        toDate: now,
        paginationId,
      });

      const leads = extractLeads(listJson);
      paginationId = extractPaginationId(listJson);

      if (leads.length === 0 && page === 1) {
        pageNotes.push({
          page,
          note: "No leads array found in response; raw shape attached.",
          shape: Object.keys(listJson?.data || listJson || {}),
        });
        break;
      }

      if (leads.length > 0) {
        const rows = leads.map((lead) => ({
          lead_id: String(leadIdentity(lead)),
          data: lead,
          synced_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("merito_leads")
          .upsert(rows, { onConflict: "lead_id" });

        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
        totalSaved += rows.length;
        pageNotes.push({ page, saved: rows.length });
      }

      if (leads.length < 100) paginationId = null;
    } while (paginationId && page < 50);

    return Response.json({
      ok: true,
      startedAt,
      fieldsDiscovered: fields.length,
      pagesFetched: page,
      leadsSaved: totalSaved,
      pageNotes,
    });
  } catch (err) {
    return Response.json(
      { ok: false, startedAt, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
