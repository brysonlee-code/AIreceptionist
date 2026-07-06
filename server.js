require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { uid, now, patients, calls, payments, fees } = require('./store');
const { respond, agentMode } = require('./agent');
const { createCheckout, sendCheckoutSms, handleStripeEvent, completeDemoPayment, refund, paymentsMode, smsMode, twilioClient: getTwilioClient } = require('./payments');

const app = express();
const PORT = process.env.PORT || 3000;
const baseUrl = () => process.env.PUBLIC_URL || `http://localhost:${PORT}`;

app.use(cors());

// Stripe webhook needs the raw body — mount BEFORE json parser
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    let event;
    if (process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
    handleStripeEvent(event);
    res.json({ received: true });
  } catch (e) { res.status(400).send(`Webhook error: ${e.message}`); }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════════════════
// TWILIO VOICE WEBHOOKS — real inbound calls
// Point your Twilio number's Voice webhook at POST {PUBLIC_URL}/voice/incoming
// ════════════════════════════════════════════════════════════
const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const say = (text) => `<Say voice="Polly.Danielle-Neural">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Say>`;

app.post('/voice/incoming', async (req, res) => {
  const from = req.body.From || 'unknown';
  const patient = patients.find(p => p.phone === from);
  const call = calls.insert({
    twilio_sid: req.body.CallSid || null,
    patient_id: patient ? patient.id : null,
    from, direction: 'inbound', status: 'in-progress',
    started_at: now(), transcript: [], duration_sec: 0,
    recording_url: null, summary: '', intent: '', sentiment: '',
  });

  // Start recording via Twilio REST API
  const tc = getTwilioClient();
  if (tc && req.body.CallSid) {
    try {
      await tc.calls(req.body.CallSid).recordings.create({
        recordingStatusCallback: `${baseUrl()}/voice/recording`,
        recordingStatusCallbackEvent: ['completed'],
      });
    } catch (e) { console.error('Recording start failed:', e.message); }
  }

  const { text } = await respond([]);
  calls.update(call.id, { transcript: [{ role: 'agent', text, t: 0 }] });

  res.type('text/xml').send(twiml(`
    ${say(text)}
    <Gather input="speech" action="${baseUrl()}/voice/turn/${call.id}" speechTimeout="auto" language="en-US"/>
    <Redirect method="POST">${baseUrl()}/voice/turn/${call.id}</Redirect>
  `));
});

app.post('/voice/turn/:callId', async (req, res) => {
  const call = calls.get(req.params.callId);
  if (!call) return res.type('text/xml').send(twiml(say('Sorry, something went wrong. Goodbye.') + '<Hangup/>'));

  const heard = (req.body.SpeechResult || '').trim();
  const transcript = call.transcript || [];
  const elapsed = Math.round((now() - call.started_at) / 1000);

  if (!heard) {
    return res.type('text/xml').send(twiml(`
      ${say("I didn't catch that — could you say it again?")}
      <Gather input="speech" action="${baseUrl()}/voice/turn/${call.id}" speechTimeout="auto" language="en-US"/>
      <Hangup/>
    `));
  }

  transcript.push({ role: 'caller', text: heard, t: elapsed });
  const { text, paymentCode } = await respond(transcript);
  transcript.push({ role: 'agent', text, t: elapsed + 2 });
  calls.update(call.id, { transcript });

  if (paymentCode) {
    try {
      const { url, fee } = await createCheckout({ feeCode: paymentCode, patientId: call.patient_id, callId: call.id, baseUrl: baseUrl() });
      await sendCheckoutSms({ to: call.from, url, feeName: fee.name });
    } catch (e) { console.error('Payment link failed:', e.message); }
  }

  const done = /\b(goodbye|have a great day|thanks for calling)\b/i.test(text);
  res.type('text/xml').send(twiml(`
    ${say(text)}
    ${done ? '<Hangup/>' : `<Gather input="speech" action="${baseUrl()}/voice/turn/${call.id}" speechTimeout="auto" language="en-US"/><Hangup/>`}
  `));
});

app.post('/voice/status', (req, res) => {
  // Twilio status callback — finalize the call record
  const call = calls.find(c => c.twilio_sid === req.body.CallSid);
  if (call && req.body.CallStatus === 'completed') {
    calls.update(call.id, {
      status: 'completed',
      duration_sec: parseInt(req.body.CallDuration || '0', 10),
      recording_url: req.body.RecordingUrl || call.recording_url,
    });
  }
  res.sendStatus(200);
});

app.post('/voice/recording', (req, res) => {
  // Twilio recording status callback — save recording URL to call record
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;
  if (callSid && recordingUrl) {
    const call = calls.find(c => c.twilio_sid === callSid);
    if (call) calls.update(call.id, { recording_url: recordingUrl + '.mp3' });
  }
  res.sendStatus(200);
});

// ════════════════════════════════════════════════════════════
// CALL SIMULATOR — demo the agent from the dashboard, no phone needed
// ════════════════════════════════════════════════════════════
app.post('/api/sim/start', async (req, res) => {
  const phone = req.body.phone || '+1216555' + String(Math.floor(1000 + Math.random() * 9000));
  const patient = patients.find(p => p.phone === phone);
  const call = calls.insert({
    patient_id: patient ? patient.id : null,
    from: phone, direction: 'inbound', status: 'in-progress',
    started_at: now(), transcript: [], duration_sec: 0, simulated: true,
    recording_url: null, summary: '', intent: '', sentiment: '',
  });
  const { text } = await respond([]);
  const transcript = [{ role: 'agent', text, t: 0 }];
  calls.update(call.id, { transcript });
  res.json({ callId: call.id, agent: text });
});

app.post('/api/sim/:callId/say', async (req, res) => {
  const call = calls.get(req.params.callId);
  if (!call || call.status !== 'in-progress') return res.status(400).json({ error: 'Call not active' });
  const heard = (req.body.text || '').trim();
  if (!heard) return res.status(400).json({ error: 'Empty message' });

  const transcript = call.transcript || [];
  const elapsed = Math.round((now() - call.started_at) / 1000);
  transcript.push({ role: 'caller', text: heard, t: elapsed });

  const { text, paymentCode } = await respond(transcript);
  transcript.push({ role: 'agent', text, t: elapsed + 2 });
  calls.update(call.id, { transcript });

  let paymentLink = null;
  if (paymentCode) {
    try {
      const { url, fee } = await createCheckout({ feeCode: paymentCode, patientId: call.patient_id, callId: call.id, baseUrl: baseUrl() });
      const sms = await sendCheckoutSms({ to: call.from, url, feeName: fee.name });
      paymentLink = { url, feeName: fee.name, smsMode: sms.sent };
    } catch (e) { console.error(e.message); }
  }
  res.json({ agent: text, paymentLink });
});

app.post('/api/sim/:callId/end', async (req, res) => {
  const call = calls.get(req.params.callId);
  if (!call) return res.status(404).json({ error: 'Not found' });
  const duration = Math.round((now() - call.started_at) / 1000);
  // Cheap auto-summary from transcript
  const callerLines = (call.transcript || []).filter(m => m.role === 'caller').map(m => m.text).join(' ');
  const paid = payments.find(p => p.call_id === call.id && p.status === 'paid');
  const pending = payments.find(p => p.call_id === call.id && p.status === 'pending');
  const intent = /pay|checkout|book/i.test(callerLines) ? 'Booking + payment' : /price|cost|how much/i.test(callerLines) ? 'Pricing inquiry' : 'General inquiry';
  calls.update(call.id, {
    status: 'completed', duration_sec: duration, intent,
    sentiment: /thank|great|perfect/i.test(callerLines) ? 'positive' : 'neutral',
    summary: `Caller inquiry handled by AI receptionist. Intent: ${intent}.` +
      (paid ? ' Payment completed during call.' : pending ? ' Checkout link sent; payment pending.' : ''),
  });
  res.json(calls.get(call.id));
});

// ════════════════════════════════════════════════════════════
// DEMO CHECKOUT PAGE (when Stripe not configured)
// ════════════════════════════════════════════════════════════
app.get('/pay/demo/:sessionId', (req, res) => {
  const p = payments.find(x => x.stripe_session_id === req.params.sessionId);
  if (!p) return res.status(404).send('Checkout session not found');
  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checkout — The Pink Print Firm</title>
  <style>body{font-family:Inter,-apple-system,sans-serif;background:#FDF7FA;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(26,34,51,.14);padding:36px;max-width:400px;width:90%}
  h2{margin:0 0 4px;color:#1A2233}p{color:#5A6580;font-size:14px}.amt{font-size:34px;font-weight:800;color:#E91E8C;margin:16px 0}
  button{width:100%;padding:13px;border:none;border-radius:9px;background:#E91E8C;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
  .note{font-size:11px;color:#8A93A8;margin-top:14px;text-align:center}</style></head><body>
  <div class="card"><h2>The Pink Print Firm</h2><p>${p.description}</p><div class="amt">$${(p.amount / 100).toFixed(2)}</div>
  ${p.status === 'paid' ? '<p style="color:#16A34A;font-weight:700">✓ Already paid</p>' :
    `<form method="POST" action="/pay/demo/${p.stripe_session_id}/complete"><button>Pay $${(p.amount / 100).toFixed(2)}</button></form>`}
  <div class="note">Demo checkout — connect Stripe in .env for live payments</div></div></body></html>`);
});
app.post('/pay/demo/:sessionId/complete', (req, res) => {
  completeDemoPayment(req.params.sessionId);
  res.redirect('/pay/success');
});
app.get('/pay/success', (req, res) => {
  if (req.query.session_id) completeDemoPayment(req.query.session_id);
  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Inter,sans-serif;background:#FDF7FA;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .c{text-align:center}.ok{width:64px;height:64px;border-radius:50%;background:#E4F6EB;color:#16A34A;font-size:30px;line-height:64px;margin:0 auto 14px}</style></head>
  <body><div class="c"><div class="ok">✓</div><h2>Payment complete</h2><p style="color:#5A6580">Thank you — you can return to your call.</p></div></body></html>`);
});
app.get('/pay/cancelled', (req, res) => res.send('Payment cancelled. You can close this page.'));

// ════════════════════════════════════════════════════════════
// REST API — dashboard data
// ════════════════════════════════════════════════════════════
app.get('/api/overview', (req, res) => {
  const allCalls = calls.all();
  const allPays = payments.all();
  const paid = allPays.filter(p => p.status === 'paid');
  res.json({
    modes: { agent: agentMode(), payments: paymentsMode(), sms: smsMode(), telephony: process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'demo' },
    stats: {
      totalCalls: allCalls.length,
      liveCalls: allCalls.filter(c => c.status === 'in-progress').length,
      avgDuration: allCalls.length ? Math.round(allCalls.reduce((s, c) => s + (c.duration_sec || 0), 0) / allCalls.length) : 0,
      revenue: paid.reduce((s, p) => s + p.amount, 0),
      pendingPayments: allPays.filter(p => p.status === 'pending').length,
      collectRate: allPays.length ? Math.round(paid.length / allPays.length * 100) : 0,
    },
  });
});

app.get('/api/calls', (req, res) =>
  res.json(calls.all().sort((a, b) => (b.started_at || 0) - (a.started_at || 0))));
app.get('/api/calls/:id', (req, res) => {
  const c = calls.get(req.params.id);
  c ? res.json(c) : res.status(404).json({ error: 'Not found' });
});

app.get('/api/payments', (req, res) =>
  res.json(payments.all().sort((a, b) => (b.created_at || 0) - (a.created_at || 0))));
app.post('/api/payments/:id/refund', (req, res) => {
  const p = refund(req.params.id);
  p ? res.json(p) : res.status(400).json({ error: 'Cannot refund this payment' });
});
app.post('/api/payments/manual', async (req, res) => {
  // Create + send a checkout link outside a call (from the dashboard)
  const { feeCode, patientId } = req.body;
  const patient = patients.get(patientId);
  try {
    const { url, payment, fee } = await createCheckout({ feeCode, patientId, callId: null, baseUrl: baseUrl() });
    if (patient?.phone) await sendCheckoutSms({ to: patient.phone, url, feeName: fee.name });
    res.json({ payment, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/patients', (req, res) => res.json(patients.all()));
app.post('/api/patients', (req, res) => {
  const b = req.body;
  if (!b.name || !b.phone) return res.status(400).json({ error: 'Name and phone required' });
  res.json(patients.insert({ name: b.name, phone: b.phone, email: b.email || '', notes: b.notes || '' }));
});
app.put('/api/patients/:id', (req, res) => res.json(patients.update(req.params.id, req.body)));
app.delete('/api/patients/:id', (req, res) => { patients.remove(req.params.id); res.json({ ok: true }); });

app.get('/api/fees', (req, res) => res.json(fees.all()));
app.post('/api/fees', (req, res) => {
  const b = req.body;
  if (!b.code || !b.name || b.price == null) return res.status(400).json({ error: 'Code, name, price required' });
  res.json(fees.insert({ code: b.code.toUpperCase(), name: b.name, price: Math.round(b.price * 100), desc: b.desc || '' }));
});
app.delete('/api/fees/:id', (req, res) => { fees.remove(req.params.id); res.json({ ok: true }); });

// ════════════════════════════════════════════════════════════
// REPORTS — aggregated analytics
// ════════════════════════════════════════════════════════════
app.get('/api/reports', (req, res) => {
  const allCalls = calls.all();
  const allPays = payments.all();
  const nowMs = Date.now();
  const day = 86400000;

  // Call volume by day (last 30 days)
  const callsByDay = [];
  for (let i = 29; i >= 0; i--) {
    const start = nowMs - (i + 1) * day;
    const end = nowMs - i * day;
    const dayStr = new Date(end).toISOString().slice(5, 10); // MM-DD
    const count = allCalls.filter(c => c.started_at >= start && c.started_at < end).length;
    callsByDay.push({ day: dayStr, count });
  }

  // Peak hours (0-23)
  const hourCounts = Array(24).fill(0);
  allCalls.forEach(c => { if (c.started_at) hourCounts[new Date(c.started_at).getHours()]++; });

  // Intent breakdown
  const intentMap = {};
  allCalls.forEach(c => { const k = c.intent || 'Unknown'; intentMap[k] = (intentMap[k] || 0) + 1; });
  const intents = Object.entries(intentMap).map(([name, count]) => ({ name, count }));

  // Sentiment breakdown
  const sentMap = {};
  allCalls.forEach(c => { const k = c.sentiment || 'unknown'; sentMap[k] = (sentMap[k] || 0) + 1; });
  const sentiments = Object.entries(sentMap).map(([name, count]) => ({ name, count }));

  // Avg duration by day (last 30 days)
  const avgDurationByDay = [];
  for (let i = 29; i >= 0; i--) {
    const start = nowMs - (i + 1) * day;
    const end = nowMs - i * day;
    const dayStr = new Date(end).toISOString().slice(5, 10);
    const dayCalls = allCalls.filter(c => c.started_at >= start && c.started_at < end && c.duration_sec);
    const avg = dayCalls.length ? Math.round(dayCalls.reduce((s, c) => s + c.duration_sec, 0) / dayCalls.length) : 0;
    avgDurationByDay.push({ day: dayStr, avg });
  }

  // Conversion funnel
  const totalCalls = allCalls.length;
  const linksCreated = allPays.length;
  const paymentsCompleted = allPays.filter(p => p.status === 'paid').length;
  const funnel = [
    { stage: 'Calls', count: totalCalls },
    { stage: 'Payment links', count: linksCreated },
    { stage: 'Payments completed', count: paymentsCompleted },
  ];

  // Top callers
  const callerMap = {};
  allCalls.forEach(c => {
    const key = c.from || 'unknown';
    if (!callerMap[key]) callerMap[key] = { phone: key, name: null, count: 0 };
    callerMap[key].count++;
    if (c.patient_id) {
      const p = patients.find(x => x.id === c.patient_id);
      if (p) callerMap[key].name = p.name;
    }
  });
  const topCallers = Object.values(callerMap).sort((a, b) => b.count - a.count).slice(0, 10);

  // Agent performance (live vs simulated)
  const liveCalls = allCalls.filter(c => !c.simulated).length;
  const simCalls = allCalls.filter(c => c.simulated).length;
  const agentPerformance = [
    { name: 'Live calls', count: liveCalls },
    { name: 'Simulated', count: simCalls },
  ];

  res.json({ callsByDay, hourCounts, intents, sentiments, avgDurationByDay, funnel, topCallers, agentPerformance });
});

// ════════════════════════════════════════════════════════════
// EARNINGS — revenue analytics
// ════════════════════════════════════════════════════════════
app.get('/api/earnings', (req, res) => {
  const allPays = payments.all();
  const allCalls = calls.all();
  const nowMs = Date.now();
  const day = 86400000;

  const paid = allPays.filter(p => p.status === 'paid');
  const pending = allPays.filter(p => p.status === 'pending');
  const refunded = allPays.filter(p => p.status === 'refunded');

  const allTimeRevenue = paid.reduce((s, p) => s + p.amount, 0);
  const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0);
  const thisMonth = paid.filter(p => p.paid_at >= thisMonthStart.getTime()).reduce((s, p) => s + p.amount, 0);
  const weekStart = nowMs - 7 * day;
  const thisWeek = paid.filter(p => p.paid_at >= weekStart).reduce((s, p) => s + p.amount, 0);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = paid.filter(p => p.paid_at >= todayStart.getTime()).reduce((s, p) => s + p.amount, 0);

  const outstanding = pending.reduce((s, p) => s + p.amount, 0);
  const collected = allTimeRevenue;
  const avgTransaction = paid.length ? Math.round(allTimeRevenue / paid.length) : 0;
  const revenuePerCall = allCalls.length ? Math.round(allTimeRevenue / allCalls.length) : 0;

  // Projected monthly: daily avg over last 30 days * 30
  const last30Paid = paid.filter(p => p.paid_at >= nowMs - 30 * day);
  const dailyAvg = last30Paid.length ? last30Paid.reduce((s, p) => s + p.amount, 0) / 30 : 0;
  const projectedMonthly = Math.round(dailyAvg * 30);

  // Revenue by service
  const serviceMap = {};
  paid.forEach(p => {
    const k = p.description || p.fee_code || 'Other';
    if (!serviceMap[k]) serviceMap[k] = { name: k, revenue: 0, count: 0 };
    serviceMap[k].revenue += p.amount;
    serviceMap[k].count++;
  });
  const byService = Object.values(serviceMap).sort((a, b) => b.revenue - a.revenue);

  // Payment method breakdown
  const methodMap = {};
  paid.forEach(p => {
    const k = p.method || 'checkout_link';
    if (!methodMap[k]) methodMap[k] = { method: k, amount: 0, count: 0 };
    methodMap[k].amount += p.amount;
    methodMap[k].count++;
  });
  const byMethod = Object.values(methodMap);

  // Monthly revenue (last 12 months)
  const monthlyRevenue = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const label = d.toISOString().slice(0, 7); // YYYY-MM
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const rev = paid.filter(p => p.paid_at >= mStart && p.paid_at < mEnd).reduce((s, p) => s + p.amount, 0);
    monthlyRevenue.push({ month: label, revenue: rev });
  }

  // Monthly collection rate
  const monthlyCollection = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const label = d.toISOString().slice(0, 7);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const mAll = allPays.filter(p => (p.created_at || 0) >= mStart && (p.created_at || 0) < mEnd);
    const mPaid = mAll.filter(p => p.status === 'paid');
    monthlyCollection.push({ month: label, rate: mAll.length ? Math.round(mPaid.length / mAll.length * 100) : 0 });
  }

  const transactionCount = { paid: paid.length, pending: pending.length, refunded: refunded.length };

  res.json({
    totals: { allTime: allTimeRevenue, thisMonth, thisWeek, today },
    outstanding, collected, avgTransaction, revenuePerCall, projectedMonthly,
    byService, byMethod, monthlyRevenue, monthlyCollection, transactionCount,
  });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  Pink Print Voice CRM → ${baseUrl()}`);
  console.log(`  Agent: ${agentMode().toUpperCase()} · Payments: ${paymentsMode().toUpperCase()} · Telephony: ${process.env.TWILIO_ACCOUNT_SID ? 'TWILIO' : 'DEMO'}\n`);
});
