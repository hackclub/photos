import Redis from "ioredis";

function createRedisClient() {
  const url = process.env.REDIS_URL;

  if (!url) return null;

  const client = new Redis(url, {
    lazyConnect: true,

    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy: () => null,
  });

  client.on("error", (err) => {
    void err;
  });

  return client;
}

const redis = createRedisClient();

export interface RateLimitConfig {
  limit: number;
  window: number;
  failOpen?: boolean;
}

function shouldFailOpen(config: RateLimitConfig): boolean {
  if (typeof config.failOpen === "boolean") return config.failOpen;
  return process.env.RATE_LIMIT_FAIL_OPEN === "true";
}

export async function rateLimit(
  identifier: string,
  config: RateLimitConfig,
): Promise<{
  success: boolean;
  remaining: number;
  resetAt: number;
}> {
  const resetAt = Date.now() + config.window * 1000;

  if (!redis) {
    if (shouldFailOpen(config)) {
      return { success: true, remaining: config.limit, resetAt };
    }
    return { success: false, remaining: 0, resetAt };
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const key = `rate_limit:${identifier}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, config.window);
    }

    const ttl = await redis.pttl(key);
    const computedResetAt = Date.now() + (ttl > 0 ? ttl : config.window * 1000);

    if (count > config.limit) {
      return {
        success: false,
        remaining: 0,
        resetAt: computedResetAt,
      };
    }

    return {
      success: true,
      remaining: config.limit - count,
      resetAt: computedResetAt,
    };
  } catch (err) {
    console.error("[rate-limit] backend error:", err);
    if (shouldFailOpen(config)) {
      return { success: true, remaining: config.limit, resetAt };
    }
    return { success: false, remaining: 0, resetAt };
  }
}
