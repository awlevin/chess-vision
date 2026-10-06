import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import { CLOUD } from "@/lib/cloud";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!CLOUD) return Response.json({ error: "Cloud storage is off" }, { status: 404 });
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const sql = getSql();
  const rows = await sql`
    SELECT value FROM user_storage
    WHERE user_id = ${userId} AND key = ${key}
  `;
  if (rows.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ key, value: rows[0].value });
}

export async function PUT(req: Request, ctx: Ctx) {
  if (!CLOUD) return Response.json({ error: "Cloud storage is off" }, { status: 404 });
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  let value: unknown;
  try {
    ({ value } = await req.json());
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof value !== "string") {
    return Response.json({ error: "value must be a string" }, { status: 400 });
  }

  const sql = getSql();
  await sql`
    INSERT INTO user_storage (user_id, key, value, updated_at)
    VALUES (${userId}, ${key}, ${value}, now())
    ON CONFLICT (user_id, key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return Response.json({ key, value });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!CLOUD) return Response.json({ error: "Cloud storage is off" }, { status: 404 });
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const sql = getSql();
  await sql`
    DELETE FROM user_storage WHERE user_id = ${userId} AND key = ${key}
  `;
  return Response.json({ ok: true });
}
