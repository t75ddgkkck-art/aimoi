import "server-only";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { sql } from "drizzle-orm";
import { seedDatabase } from "@/lib/seed";
import { getRefreshState } from "@/lib/refresh-state";
import { startKeepAlive } from "@/lib/keep-alive";
import { execSync } from "child_process";

// Start the keep-alive system on module load (server startup)
startKeepAlive();

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

async function pushSchemaIfNeeded() {
  try {
    await db.execute(sql`select 1 from ${matches} limit 1`);
    return;
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      console.log("[bootstrap] tables missing — pushing schema");
      try {
        execSync("npx drizzle-kit push", {
          stdio: "inherit",
          env: { ...process.env },
        });
      } catch (e) {
        console.error("[bootstrap] drizzle-kit push failed:", e);
        throw e;
      }
    } else {
      throw err;
    }
  }
}

export async function ensureSeeded(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      await pushSchemaIfNeeded();
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(matches);
      if (!count || count === 0) {
        const refreshState = getRefreshState();
        if (refreshState.running) {
          console.log("[bootstrap] refresh already running — skipping auto seed");
          return;
        }
        console.log("[bootstrap] empty db — seeding");
        await seedDatabase();
        // After first seed, derive real strengths so predictions aren't coin-flips
        try {
          const { recomputeTeamStrengths } = await import("@/lib/recompute-strengths");
          const { refreshUpcomingPredictions } = await import("@/lib/refresh-predictions");
          await recomputeTeamStrengths();
          await refreshUpcomingPredictions();
          console.log("[bootstrap] strengths + predictions initialized");
        } catch (e) {
          console.warn("[bootstrap] strength init skipped:", e);
        }
      } else {
        console.log(`[bootstrap] db has ${count} matches — skipping seed`);
      }
      bootstrapped = true;
    } catch (err) {
      console.error("[bootstrap] failed:", err);
      bootstrapPromise = null;
      throw err;
    }
  })();

  return bootstrapPromise;
}
