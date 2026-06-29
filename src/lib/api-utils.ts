// API utilities: retry logic, exponential backoff, rate limiting

/**
 * Retry a fetch request with exponential backoff
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If 429 (rate limit) or 5xx (server error), retry
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(
            `[api-utils] ${url} returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleep(delay);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[api-utils] ${url} failed: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} retries: ${url}`);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limiter: ensures we don't exceed a certain number of requests per minute
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private readonly maxRequestsPerMinute: number;
  private readonly requestTimes: number[] = [];

  constructor(maxRequestsPerMinute: number) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    // Remove requests older than 1 minute
    while (this.requestTimes.length > 0 && this.requestTimes[0] < now - 60000) {
      this.requestTimes.shift();
    }

    // If we're at the limit, wait
    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = 60000 - (now - oldestRequest);
      console.log(`[rate-limiter] Rate limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);
      return this.waitForSlot();
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }
}
