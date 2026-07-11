import { getLeadFields, extractFieldKeys } from "../../../lib/meritto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const meta = await getLeadFields();
    const fieldKeys = extractFieldKeys(meta);
    return Response.json({
      ok: true,
      fieldKeysDiscovered: fieldKeys.length,
      fieldKeys,
      rawResponse: meta,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
