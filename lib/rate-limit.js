const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');

const limiterCache = new Map();

function getIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  return req.headers.get('x-real-ip') || 'unknown';
}

function getLimiter(scope, limit, duration) {
  const key = `${scope}:${limit}:${duration}`;
  if (limiterCache.has(key)) return limiterCache.get(key);

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    limiterCache.set(key, null);
    return null;
  }

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, duration),
    analytics: true,
    prefix: `encuentrame:${scope}`,
  });

  limiterCache.set(key, limiter);
  return limiter;
}

async function enforceRateLimit(req, { scope = 'default', limit = 20, duration = '1 m' } = {}) {
  const limiter = getLimiter(scope, limit, duration);
  if (!limiter) return { success: true };

  const identifier = `${scope}:${getIp(req)}`;
  return limiter.limit(identifier);
}

module.exports = { enforceRateLimit };
