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
 
function numericDates(leads) {
  return leads
    .map((l) => Number(l.user_registration_date || l.user_date || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
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
 
    const supaSave = async (leads, seen) => {
      const fresh = leads.filter(
        (lead) => !seen.has(String(leadIdentity(lead)))
      );
      fresh.forEach((lead) => seen.add(String(leadIdentity(lead))));
      if (fresh.length > 0) {
        const rows = fresh.map((lead) => ({
          lead_id: String(leadIdentity(lead)),
          data: lead,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await supabase
          .from("merito_leads")
          .upsert(rows, { onConflict: "lead_id" });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
      }
      return fresh.length;
    };
 
    const now = Math.floor(Date.now() / 1000);
    const from48 = now - 48 * 60 * 60;
 
    const seenLeadIds = new Set();
    let totalSaved = 0;
    const notes = [];
 
    const mainResponse = await fetchLeadsPage({
      fields,
      fromDate: from48,
      toDate: now,
    });
    const mainLeads = extractLeads(mainResponse);
    totalSaved += await supaSave(mainLeads, seenLeadIds);
    const mainDates = numericDates(mainLeads);
 
    notes.push({
      request: "main window (48h → now)",
      merittoCode: mainResponse?.code,
      merittoMessage: mainResponse?.message,
      received: mainLeads.length,
      oldestLead: mainDates[0] || null,
      newestLead: mainDates[mainDates.length - 1] || null,
    });
 
    let walkProbeWorks = false;
 
    if (mainLeads.length === 100 && mainDates.length > 0) {
      const oldestSeen = mainDates[0];
 
      const probeResponse = await fetchLeadsPage({
        fields,
        fromDate: from48,
        toDate: oldestSeen - 1,
      });
      const probeLeads = extractLeads(probeResponse);
      const probeDates = numericDates(probeLeads);
      const probeFresh = await supaSave(probeLeads, seenLeadIds);
      totalSaved += probeFresh;
 
      walkProbeWorks = probeFresh > 0;
 
      notes.push({
        request: `walk probe (48h → ${oldestSeen - 1}, i.e. older than oldest seen)`,
        merittoCode: probeResponse?.code,
        merittoMessage: probeResponse?.message,
        received: probeLeads.length,
        fresh: probeFresh,
        oldestLead: probeDates[0] || null,
        newestLead: probeDates[probeDates.length - 1] || null,
      });
 
      const half = Math.floor((from48 + now) / 2);
      const halfResponse = await fetchLeadsPage({
        fields,
        fromDate: half,
        toDate: now,
      });
      const halfLeads = extractLeads(halfResponse);
      notes.push({
        request: "diagnostic half window (24h → now)",
        merittoCode: halfResponse?.code,
        merittoMessage: halfResponse?.message,
        received: halfLeads.length,
      });
 
      const pastResponse = await fetchLeadsPage({
        fromDate: from48,
        toDate: now - 12 * 60 * 60,
        fields,
      });
      const pastLeads = extractLeads(pastResponse);
      notes.push({
        request: "diagnostic past-to_date window (48h → 12h ago)",
        merittoCode: pastResponse?.code,
        merittoMessage: pastResponse?.message,
        received: pastLeads.length,
      });
    }
 
    return Response.json({
      ok: true,
      startedAt,
      fieldsDiscovered: fields.length,
      leadsSaved: totalSaved,
      uniqueLeadsSeen: seenLeadIds.size,
      walkProbeWorks,
      notes,
    });
  } catch (err) {
    return Response.json(
      { ok: false, startedAt, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
