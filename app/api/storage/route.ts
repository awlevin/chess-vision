import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import { CLOUD } from "@/lib/cloud";

export async function GET() {
  if (!CLOUD) return Response.json({ error: "Cloud storage is off" }, { status: 404 });
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getSql();
  const rows = await sql`
    SELECT key FROM user_storage WHERE user_id = ${userId} ORDER BY key
  `;
  return Response.json({ keys: rows.map((r) => r.key) });
}
