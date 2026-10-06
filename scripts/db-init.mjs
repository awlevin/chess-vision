import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
  process.exit(1);
}

const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS user_storage (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
  )
`;

console.log("user_storage table ready");
