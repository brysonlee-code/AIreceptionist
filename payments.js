// Stripe checkout link creation + SMS delivery via Twilio.
// Both degrade gracefully to demo mode when keys are absent.

const { payments, fees, uid } = require('./store');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const paymentsMode = () => (stripe ? 'stripe' : 'demo');
const smsMode = () => (twilioClient ? 'twilio' : 'demo');

// Create a checkout link for a fee code. Returns { url, payment }
async function createCheckout({ feeCode, patientId, callId, baseUrl }) {
  const fee = fees.find(f => f.code === feeCode) || fees.all()[0];

  let url, sessionId;
  if (stripe) {
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
    status: 'pending', method: 'checkout_link',
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

module.exports = { createCheckout, sendCheckoutSms, handleStripeEvent, completeDemoPayment, refund, paymentsMode, smsMode };
