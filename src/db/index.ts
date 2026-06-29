import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function normalizeDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("DATABASE_URL is required");
  // Vercel users sometimes paste env values with quotes; remove them safely.
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

// The user's Supabase database holds all harvested matches (World Cup, leagues, etc.).
// Some managed runtimes inject a placeholder localhost DATABASE_URL; in that case we
// fall back to the configured Supabase URL so the app always has real data.
const SUPABASE_FALLBACK =
  process.env.SUPABASE_DB_URL ||
  "postgresql://postgres.oqqlyruiraiosflsuuxc:Kelly15102001plmx@aws-1-eu-north-1.pooler.supabase.com:5432/postgres?sslmode=require";

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim().replace(/^['"]|['"]$/g, "");
  // If the env URL is missing or points to a local placeholder, use Supabase.
  if (!envUrl || /127\.0\.0\.1|localhost/i.test(envUrl)) {
    return SUPABASE_FALLBACK;
  }
  return envUrl;
}

const rawDatabaseUrl = normalizeDatabaseUrl(resolveDatabaseUrl());

// Remove sslmode query parameter if present, because we configure SSL programmatically
// to avoid SELF_SIGNED_CERT_IN_CHAIN conflict with node-postgres
export const databaseUrl = rawDatabaseUrl.replace(/[?&]sslmode=[^&]+/gi, "");

function shouldUseSsl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("supabase") ||
    lower.includes("pooler") ||
    rawDatabaseUrl.toLowerCase().includes("sslmode=require") ||
    process.env.POSTGRES_SSL === "true"
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // Explicitly configure SSL to ignore self-signed certificate chain check (essential for Supabase with PG)
    ssl: shouldUseSsl(databaseUrl)
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
    max: process.env.NODE_ENV === "production" ? 3 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
