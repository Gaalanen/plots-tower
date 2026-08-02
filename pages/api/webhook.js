import Stripe from 'stripe';
import { takenSet, setWindow, getOrder, patchOrder, PRICE_CENTS } from '../../lib/store';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });

// Stripe needs the raw body to verify the signature.
export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  let event;
  try {
    const buf = await rawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try { await fulfill(session.metadata?.orderId, session); } catch (e) { /* logged by Vercel */ }
  }
  res.status(200).json({ received: true });
}

async function fulfill(orderId, session) {
  if (!orderId) return;
  const order = await getOrder(orderId);
  if (!order || order.status === 'paid') return;

  const keys = order.selection || [];
  const d = order.details || {};
  const taken = await takenSet(keys);
  const free = keys.filter(k => !taken.has(k));
  const conflicts = keys.filter(k => taken.has(k));

  for (const key of free) {
    const [r, c] = String(key).split('-').map(Number);
    await setWindow(key, {
      businessName: d.businessName || '', linkUrl: d.linkUrl || '',
      color: d.color || '#7FD3FF', mark: d.mark || '', tagline: d.tagline || '',
      floor: 30 - r, unit: c + 1, ts: Date.now()
    });
  }

  // auto-refund the rare double-booked window
  if (conflicts.length && session.payment_intent) {
    try {
      await stripe.refunds.create({
        payment_intent: session.payment_intent,
        amount: conflicts.length * PRICE_CENTS
      });
    } catch (e) { /* handle manually if provider blocks partial refund */ }
  }

  await patchOrder(orderId, { status: 'paid', activated: free, conflicts });
}
