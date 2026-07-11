import https from "https";

const HOST = "api.nopaperforms.io";

function merittoRequest(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const options = {
    hostname: HOST,
    path,
    method,
    headers: {
      "secret-key": process.env.MERITTO_SECRET_KEY,
      "access-key": process.env.MERITTO_ACCESS_KEY,
      "Content-Type": "application/json",
      ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, json: null, raw });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export async function getLeadFields() {
  const { status, json, raw } = await merittoRequest(
    "GET",
    "/lead/v1/getMetaData"
  );
  if (!json) {
    throw new Error(`getMetaData returned non-JSON (HTTP ${status}): ${String(raw).slice(0, 300)}`);
  }
  return json;
}

export function extractFieldKeys(metaJson) {
  const keys = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node && typeof node === "object") {
      if (typeof node.field_key === "string") keys.add(node.field_key);
      Object.values(node).forEach(visit);
    }
  };
  visit(metaJson);
  return [...keys];
}

export async function fetchLeadsPage({ fields, fromDate, toDate, paginationId }) {
  const body = {
    page_size: 100,
    fields,
    filter: {
      date_range: { from_date: fromDate, to_date: toDate },
    },
  };
  if (paginationId) {
    body.pagination_id = paginationId;
    body.paginationId = paginationId;
  }

  const { status, json, raw } = await merittoRequest("GET", "/lead/v1/list", body);
  if (!json) {
    throw new Error(`lead/list returned non-JSON (HTTP ${status}): ${String(raw).slice(0, 300)}`);
  }
  return json;
}

export function extractLeads(listJson) {
  const d = listJson?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.leads)) return d.leads;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(d?.details)) return d.details;
  if (Array.isArray(listJson?.leads)) return listJson.leads;
  return [];
}

export function extractPaginationId(listJson) {
  return (
    listJson?.data?.pagination_id ||
    listJson?.data?.paginationId ||
    listJson?.pagination_id ||
    listJson?.paginationId ||
    null
  );
}
