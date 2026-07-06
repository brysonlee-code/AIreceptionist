const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'pinkprint.json');
const uid = () => crypto.randomBytes(6).toString('hex');
const now = () => Date.now();

let data = { patients: [], calls: [], payments: [], fees: [], settings: {} };

function loadFromDisk() {
  try { if (fs.existsSync(DB_FILE)) data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { console.warn('DB read failed, starting fresh:', e.message); }
}
let t = null;
function persist() {
  clearTimeout(t);
  t = setTimeout(() => { try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error(e.message); } }, 50);
}

const col = (name) => ({
  all: () => data[name].slice(),
  get: (id) => data[name].find(x => x.id === id),
  find: (fn) => data[name].find(fn),
  filter: (fn) => data[name].filter(fn),
  insert: (row) => { const r = { id: row.id || uid(), created_at: now(), ...row }; data[name].push(r); persist(); return r; },
  update: (id, patch) => { const r = data[name].find(x => x.id === id); if (r) { Object.assign(r, patch); persist(); } return r; },
  remove: (id) => { data[name] = data[name].filter(x => x.id !== id); persist(); },
  count: () => data[name].length,
});

const patients = col('patients');
const calls = col('calls');
const payments = col('payments');
const fees = col('fees');

function seed() {
  if (fees.count() > 0) return;
  [
    { code: 'GRANT-READY', name: 'Get Grant Ready Development Package', price: 149700, desc: 'Full business foundation setup — entity structuring, document organization, and grant-readiness review' },
    { code: 'WRITE-GRANT', name: 'Write My Grant Package', price: 249700, desc: 'Done-for-you grant writing by our expert team, from opportunity match to submission' },
    { code: 'BIZ-PLAN', name: 'Pink Print Business Plan', price: 99700, desc: 'Comprehensive, funder-ready business plan written by our team' },
    { code: 'GRANT-CERT', name: 'Certified Grant Writer Program', price: 199700, desc: 'Become a certified grant writer — full training, templates, and certification' },
    { code: 'STRATEGY', name: 'Grant Strategy Session', price: 29700, desc: '60-minute 1:1 funding strategy call with a senior grant advisor' },
  ].forEach(f => fees.insert(f));

  const p1 = patients.insert({ name: 'Tanya Brooks', phone: '+14045550163', email: 'tanya@brooksbeautyco.com', notes: 'Beauty brand founder — attended the free grant webinar, wants Write My Grant' });
  const p2 = patients.insert({ name: 'Keisha Daniels', phone: '+17135550188', email: 'keisha@danielsconsult.com', notes: 'Consulting LLC — needs Grant Ready package before applying' });

  const call = calls.insert({
    patient_id: p1.id, from: p1.phone, direction: 'inbound', status: 'completed',
    duration_sec: 212, recording_url: null, sentiment: 'positive',
    intent: 'Booking + payment', started_at: now() - 3600000 * 4,
    transcript: [
      { role: 'agent', text: 'Thank you for calling The Pink Print Firm, this is Penny, the firm\'s AI assistant. How can I help you get funded today?', t: 0 },
      { role: 'caller', text: 'Hi! I was on the webinar last week. How much is it for you all to write my grant for me?', t: 7 },
      { role: 'agent', text: 'So glad the webinar landed for you! Our Write My Grant Package is $2,497 — that\'s fully done-for-you grant writing from opportunity match to submission by our expert team. Would you like to secure your spot?', t: 15 },
      { role: 'caller', text: 'Yes, let\'s do it. Can I pay right now?', t: 28 },
      { role: 'agent', text: 'Absolutely, boss! I\'m texting a secure checkout link to the number you\'re calling from — it\'ll arrive in seconds and you can complete it while we\'re on the line.', t: 34 },
      { role: 'caller', text: 'Okay, done! Just paid.', t: 82 },
      { role: 'agent', text: 'Payment confirmed — welcome to Pink Print, Tanya! Our team will reach out within one business day to kick off your grant. Anything else I can help with?', t: 90 },
      { role: 'caller', text: 'That\'s everything, thank you so much!', t: 99 },
    ],
    summary: 'Webinar attendee called about done-for-you grant writing. Quoted Write My Grant Package at $2,497, sent checkout link mid-call, payment completed on the line. Onboarding handoff queued.',
  });
  payments.insert({
    patient_id: p1.id, call_id: call.id, fee_code: 'WRITE-GRANT', description: 'Write My Grant Package',
    amount: 249700, currency: 'usd', status: 'paid', method: 'checkout_link', stripe_session_id: 'demo_cs_' + uid(),
  });
}

loadFromDisk();
seed();

module.exports = { uid, now, patients, calls, payments, fees };
