// Payment link creation + SMS delivery via Twilio.
// Supports Shopify buy-button URLs, Stripe Checkout, or demo mode.
// Priority: Shopify URLs (if configured) → Stripe (if key set) → demo.

const { payments, fees, uid } = require('./store');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Parse Shopify checkout URLs from env — format: SHOPIFY_URL_<CODE>=https://...
// e.g. SHOPIFY_URL_WRITE_GRANT=https://yourstore.myshopify.com/cart/12345:1
const shopifyUrls = {};
for (const [key, val] of Object.entries(process.env)) {
  if (key.startsWith('SHOPIFY_URL_') && val) {
    // SHOPIFY_URL_WRITE_GRANT → WRITE-GRANT
    const code = key.replace('SHOPIFY_URL_', '').replace(/_/g, '-');
    shopifyUrls[code] = val;
  }
}
const hasShopify = Object.keys(shopifyUrls).length > 0;

const paymentsMode = () => (hasShopify ? 'shopify' : stripe ? 'stripe' : 'demo');
const smsMode = () => (twilioClient ? 'twilio' : 'demo');

// Create a checkout link for a fee code. Returns { url, payment }
async function createCheckout({ feeCode, patientId, callId, baseUrl }) {
  const fee = fees.find(f => f.code === feeCode) || fees.all()[0];

  let url, sessionId;

  if (shopifyUrls[fee.code]) {
    // Shopify buy-button / checkout URL — use as-is
    url = shopifyUrls[fee.code];
    sessionId = 'shopify_' + uid();
  } else if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: fee.name, description: fee.desc },
          unit_amount: fee.price,
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pay/cancelled`,
      metadata: { fee_code: fee.code, patient_id: patientId || '', call_id: callId || '' },
    });
    url = session.url;
    sessionId = session.id;
  } else {
    // Demo checkout page served by our own server
    sessionId = 'demo_cs_' + uid();
    url = `${baseUrl}/pay/demo/${sessionId}`;
  }

  const payment = payments.insert({
    patient_id: patientId || null, call_id: callId || null,
    fee_code: fee.code, description: fee.name,
    amount: fee.price, currency: 'usd',
    status: 'pending', method: hasShopify ? 'shopify' : 'checkout_link',
    stripe_session_id: sessionId, checkout_url: url,
  });

  return { url, payment, fee };
}

// Text the link to the caller
async function sendCheckoutSms({ to, url, feeName }) {
  const body = `The Pink Print Firm 💗 Secure checkout for your ${feeName}: ${url}`;
  if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
    await twilioClient.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body });
    return { sent: 'twilio' };
  }
  console.log(`[DEMO SMS → ${to}] ${body}`);
  return { sent: 'demo', body };
}

// Stripe webhook: mark payment paid
function handleStripeEvent(event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const p = payments.find(x => x.stripe_session_id === session.id);
    if (p) payments.update(p.id, { status: 'paid', paid_at: Date.now() });
    return p;
  }
  return null;
}

// Demo payment completion
function completeDemoPayment(sessionId) {
  const p = payments.find(x => x.stripe_session_id === sessionId);
  if (p && p.status === 'pending') payments.update(p.id, { status: 'paid', paid_at: Date.now() });
  return p;
}

function refund(paymentId) {
  const p = payments.get(paymentId);
  if (!p || p.status !== 'paid') return null;
  // In live mode you would call stripe.refunds.create({ payment_intent }) here.
  payments.update(p.id, { status: 'refunded', refunded_at: Date.now() });
  return payments.get(p.id);
}

module.exports = { createCheckout, sendCheckoutSms, handleStripeEvent, completeDemoPayment, refund, paymentsMode, smsMode, twilioClient: () => twilioClient };
