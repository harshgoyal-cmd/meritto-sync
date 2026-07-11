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
    throw new Error(
      `getMetaData returned non-JSON (HTTP ${status}): ${String(raw).slice(0, 300)}`
    );
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
 
function looksLikeNotFound(result) {
  if (!result) return true;
  if (result.status === 404 || result.status === 405) return true;
  const code = result.json?.code;
  return code === 404 || code === 405;
}
 
export async function fetchLeadsPage({ fields, fromDate, toDate, paginationId }) {
  const body = {
    page_size: 100,
    fields,
    filter: {
      date_range: { from_date: fromDate, to_date: toDate },
    },
  };
 
  let path = "/lead/v1/list";
 
  if (paginationId) {
    const ticket = String(paginationId);
 
    body.pagination = { next: ticket };
    body.next = ticket;
    body.pagination_id = ticket;
    body.paginationId = ticket;
    body.pagination_token = ticket;
    body.next_page_id = ticket;
    body.page_id = ticket;
    body.cursor = ticket;
 
    const flatKeys = ["next", "pagination_id", "paginationId", "cursor", "page_id"];
    const qs = flatKeys
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(ticket)}`)
      .join("&");
    path = `/lead/v1/list?${qs}`;
  }
 
  let methodUsed = "GET";
  let result = await merittoRequest("GET", path, body);
 
  if (looksLikeNotFound(result)) {
    methodUsed = "POST";
    result = await merittoRequest("POST", path, body);
  }
 
  const { status, json, raw } = result;
  if (!json) {
    throw new Error(
      `lead/list (${methodUsed}) returned non-JSON (HTTP ${status}): ${String(raw).slice(0, 300)}`
    );
  }
  json.__methodUsed = methodUsed;
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
 
const PAGINATION_KEY_PATTERN = /pagin|cursor|next|page_id|last_id|offset_id/i;
 
export function findPagination(listJson) {
  const containers = [listJson, listJson?.data].filter(
    (c) => c && typeof c === "object" && !Array.isArray(c)
  );
  for (const container of containers) {
    for (const [key, value] of Object.entries(container)) {
      if (key === "__methodUsed") continue;
      if (!PAGINATION_KEY_PATTERN.test(key)) continue;
      if (typeof value === "string" || typeof value === "number") {
        if (value !== "" && value !== 0 && value !== null) {
          return { key, id: value };
        }
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [innerKey, innerValue] of Object.entries(value)) {
          if (
            (typeof innerValue === "string" || typeof innerValue === "number") &&
            innerValue !== "" &&
            innerValue !== 0
          ) {
            return { key: innerKey, id: innerValue };
          }
        }
      }
    }
  }
  return { key: null, id: null };
}
 
export function extractPaginationId(listJson) {
  return findPagination(listJson).id;
}
