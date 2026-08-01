import { Redis } from '@upstash/redis';

// Reads either the Upstash-native env vars or the Vercel Marketplace ones.
const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const WKEY = 'plots:windows';
export const PRICE_CENTS = 1900; // €19.00 per window

export async function getWindows() {
  const all = (await redis.hgetall(WKEY)) || {};
  return Object.entries(all).map(([parcel, d]) => ({ parcel, ...(d || {}) }));
}

export async function takenSet(keys) {
  if (!keys.length) return new Set();
  const vals = await redis.hmget(WKEY, ...keys);
  const taken = new Set();
  keys.forEach((k, i) => { if (vals && vals[i]) taken.add(k); });
  return taken;
}

export async function setWindow(parcel, data) {
  await redis.hset(WKEY, { [parcel]: data });
}

export async function saveOrder(id, order) {
  await redis.set('plots:order:' + id, order, { ex: 3600 });
}

export async function getOrder(id) {
  return await redis.get('plots:order:' + id);
}

export async function patchOrder(id, patch) {
  const o = await getOrder(id);
  if (o) await redis.set('plots:order:' + id, { ...o, ...patch }, { ex: 3600 });
}
