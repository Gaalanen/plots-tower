import Stripe from 'stripe';
import { takenSet, saveOrder, PRICE_CENTS } from '../../lib/store';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const { selection, details } = req.body || {};
    const keys = Array.isArray(selection) ? [...new Set(selection.map(String))] : [];
    if (!keys.length) { res.status(400).json({ error: 'empty' }); return; }

    // block windows that are already taken, before charging
    const taken = await takenSet(keys);
    const conflict = keys.filter(k => taken.has(k));
    if (conflict.length) { res.status(200).json({ error: 'taken', taken: conflict }); return; }

    const orderId = (globalThis.crypto?.randomUUID?.()) ||
                    (Date.now() + '-' + Math.random().toString(36).slice(2));
    await saveOrder(orderId, {
      selection: keys, details: details || {},
      amount: keys.length * PRICE_CENTS, status: 'pending'
    });

    const origin = req.headers.origin || ('https://' + req.headers.host);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: PRICE_CENTS,
          product_data: { name: 'Tower window (Plots)', tax_code: 'txcd_10000000' }
        },
        quantity: keys.length
      }],
      metadata: { orderId },
      payment_intent_data: { metadata: { orderId } },
      success_url: origin + '/?paid=1',
      cancel_url: origin + '/?canceled=1',
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: 'checkout_failed', detail: String((e && e.message) || e), hasKey: !!process.env.STRIPE_SECRET_KEY, keyPrefix: (process.env.STRIPE_SECRET_KEY||'').slice(0,7) });
  }
}
