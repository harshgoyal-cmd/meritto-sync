import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PREFERRED_COLUMNS = [
  "name",
  "email",
  "mobile",
  "lead_stage",
  "city",
  "state",
  "course",
  "lead_status",
];

function pickColumns(rows) {
  if (rows.length === 0) return [];
  const present = new Set();
  rows.forEach((r) => Object.keys(r.data || {}).forEach((k) => present.add(k)));
  const preferred = PREFERRED_COLUMNS.filter((c) => present.has(c));
  if (preferred.length >= 3) return preferred.slice(0, 6);
  return [...present].slice(0, 6);
}

export default async function Dashboard() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { count: totalLeads } = await supabase
    .from("merito_leads")
    .select("*", { count: "exact", head: true });

  const { data: latest } = await supabase
    .from("merito_leads")
    .select("lead_id, data, synced_at")
    .order("synced_at", { ascending: false })
    .limit(25);

  const rows = latest || [];
  const columns = pickColumns(rows);
  const lastSync = rows[0]?.synced_at
    ? new Date(rows[0].synced_at).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "Never — run /api/sync once";

  const card = {
    background: "#171C22",
    border: "1px solid #232A33",
    borderRadius: 10,
    padding: "18px 22px",
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 20px" }}>
      <header style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#7FD1AE",
            marginBottom: 6,
          }}
        >
          Enrolment pulse
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
          Meritto leads, synced daily
        </h1>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 30,
        }}
      >
        <div style={card}>
          <div style={{ fontSize: 13, color: "#9AA3AD" }}>Total leads stored</div>
          <div style={{ fontSize: 34, fontWeight: 600, marginTop: 4 }}>
            {totalLeads ?? 0}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#9AA3AD" }}>Last sync (IST)</div>
          <div style={{ fontSize: 17, fontWeight: 500, marginTop: 10 }}>
            {lastSync}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#9AA3AD" }}>Sync schedule</div>
          <div style={{ fontSize: 17, fontWeight: 500, marginTop: 10 }}>
            Every day, 6:00 AM IST
          </div>
        </div>
      </section>

      <section style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid #232A33",
            fontSize: 14,
            color: "#9AA3AD",
          }}
        >
          Latest 25 leads
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: "26px 22px", color: "#9AA3AD", fontSize: 14 }}>
            No leads yet. Visit <code>/api/sync</code> in your browser to run the
            first sync, then refresh this page.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13.5,
              }}
            >
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      style={{
                        textAlign: "left",
                        padding: "10px 16px",
                        color: "#7FD1AE",
                        fontWeight: 500,
                        borderBottom: "1px solid #232A33",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.replaceAll("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lead_id}>
                    {columns.map((c) => (
                      <td
                        key={c}
                        style={{
                          padding: "9px 16px",
                          borderBottom: "1px solid #1D232B",
                          color: "#D7DBE0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(r.data?.[c] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer style={{ marginTop: 22, fontSize: 12.5, color: "#5F6870" }}>
        Data flows: Meritto → /api/sync (daily cron) → Supabase → this page.
      </footer>
    </main>
  );
}
