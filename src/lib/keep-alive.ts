// SELF-PING SYSTEM: Prevents Render Free tier from sleeping
// This module runs a setInterval that pings the health endpoint internally

let keepAliveStarted = false;

export function startKeepAlive() {
  if (keepAliveStarted) return;
  if (typeof window !== "undefined") return; // Server-only
  if (process.env.NODE_ENV !== "production") return;
  
  keepAliveStarted = true;
  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.VERCEL_URL;
  if (!appUrl) {
    console.warn("[keep-alive] No APP_URL configured, skipping self-ping");
    return;
  }

  const fullUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;

  // Ping every 10 minutes
  setInterval(async () => {
    try {
      await fetch(`${fullUrl}/api/health`, { 
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      console.log("[keep-alive] Ping OK");
    } catch (e) {
      console.warn("[keep-alive] Ping failed:", e);
    }
  }, 10 * 60 * 1000);

  console.log("[keep-alive] System started, pinging every 10 minutes");
}
