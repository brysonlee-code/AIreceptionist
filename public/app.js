// ═══════════════════════════════════════════════════════════
// Pink Print Voice CRM — dashboard frontend
// ═══════════════════════════════════════════════════════════

let state = { view: 'dashboard', overview: null, calls: [], payments: [], patients: [], fees: [], activeCall: null, simCall: null };
let modal = null;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = (id) => document.getElementById(id);
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const timeAgo = (ts) => { const d = Date.now() - ts, m = 60000, h = 3600000, day = 86400000; if (d < h) return Math.max(1, Math.floor(d / m)) + 'm ago'; if (d < day) return Math.floor(d / h) + 'h ago'; return Math.floor(d / day) + 'd ago'; };

const api = {
  get: (p) => fetch('/api' + p).then(r => r.json()),
  post: (p, b) => fetch('/api' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json()),
  put: (p, b) => fetch('/api' + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  del: (p) => fetch('/api' + p, { method: 'DELETE' }).then(r => r.json()),
};

async function refresh() {
  const [overview, callsList, pays, pats, feesList] = await Promise.all([
    api.get('/overview'), api.get('/calls'), api.get('/payments'), api.get('/patients'), api.get('/fees'),
  ]);
  state.overview = overview; state.calls = callsList; state.payments = pays; state.patients = pats; state.fees = feesList;
  render();
}

const I = {
  dash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  phone: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>',
  card: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  users: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
  tag: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  mic: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>',
  plus: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  check: '<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  send: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  end: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2A19.86 19.86 0 013 5.18 2 2 0 015 3h3a2 2 0 012 1.72"/><line x1="23" y1="1" x2="1" y2="23"/></svg>',
  trash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  link: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
};

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `${I.check} ${esc(msg)}`; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }
function closeModal() { modal = null; render(); }
function go(v) { state.view = v; render(); }

// ── SHELL ───────────────────────────────────────────────────
function render() {
  const m = state.overview?.modes || {};
  const chip = (label, mode) => `<span class="mode-chip ${mode === 'demo' ? 'mode-demo' : 'mode-live'}">${label}: ${mode.toUpperCase()}</span>`;
  const nav = [
    ['dashboard', 'Dashboard', I.dash, null],
    ['calls', 'Calls', I.phone, state.calls.length],
    ['payments', 'Payments', I.card, state.payments.length],
    ['patients', 'Clients', I.users, state.patients.length],
    ['fees', 'Service menu', I.tag, state.fees.length],
    ['simulator', 'Test the agent', I.mic, null],
  ];
  $('app').innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">P</div>
          <div><div class="brand-name">Pink Print</div><div class="brand-sub">AI Receptionist</div></div></div>
        <nav class="nav">
          ${nav.map(([id, label, ico, badge]) => `
            <button class="nav-item ${state.view === id ? 'active' : ''}" onclick="go('${id}')">
              <span class="nav-ico">${ico}</span>${label}
              ${badge !== null ? `<span class="nav-badge">${badge}</span>` : ''}
            </button>`).join('')}
        </nav>
        <div class="sidebar-foot">
          <div class="mode-chips">
            ${chip('Agent', m.agent === 'claude' ? 'live' : 'demo')}
            ${chip('Phone', m.telephony || 'demo')}
            ${chip('Pay', m.payments === 'stripe' ? 'live' : 'demo')}
          </div>
        </div>
      </aside>
      <main class="main">${renderView()}</main>
    </div>
    ${modal || ''}`;
}

function renderView() {
  switch (state.view) {
    case 'dashboard': return viewDashboard();
    case 'calls': return viewCalls();
    case 'payments': return viewPayments();
    case 'patients': return viewPatients();
    case 'fees': return viewFees();
    case 'simulator': return viewSimulator();
  }
}

const topbar = (title, sub, actions = '') =>
  `<div class="topbar"><div><div class="page-title">${title}</div><div class="page-sub">${sub}</div></div><div style="display:flex;gap:10px">${actions}</div></div>`;
const stat = (label, value, sub, accent) =>
  `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${accent ? 'stat-accent' : ''}">${value}</div><div class="stat-sub">${sub}</div></div>`;

// ── DASHBOARD ───────────────────────────────────────────────
function viewDashboard() {
  const s = state.overview?.stats || {};
  const recent = state.calls.slice(0, 6);
  return `
    ${topbar('Dashboard', 'Penny, your AI receptionist — calls, payments, and enrollments at a glance')}
    <div class="content">
      <div class="stat-grid">
        ${stat('Total calls', s.totalCalls ?? 0, s.liveCalls ? `<span class="live-dot"></span>${s.liveCalls} live now` : 'all handled by Penny')}
        ${stat('Avg duration', fmtDur(s.avgDuration || 0), 'per call')}
        ${stat('Revenue collected', money(s.revenue || 0), 'in service payments', true)}
        ${stat('Collection rate', (s.collectRate ?? 0) + '%', `${s.pendingPayments || 0} pending`, true)}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recent calls</h3><button class="btn btn-sm btn-primary" onclick="go('simulator')">${I.mic} Test the agent</button></div>
        <div>${callTable(recent)}</div>
      </div>
    </div>`;
}

// ── CALLS ───────────────────────────────────────────────────
function viewCalls() {
  return `
    ${topbar('Calls', `${state.calls.length} calls — click any row for the full transcript`)}
    <div class="content"><div class="table-wrap">${callTable(state.calls)}</div></div>`;
}

function callTable(list) {
  if (!list.length) return `<div class="empty"><div class="empty-ico">${I.phone}</div><h3>No calls yet</h3><p>Point your Twilio number at this server, or try the simulator to see the AI receptionist in action.</p><button class="btn btn-primary" onclick="go('simulator')">${I.mic} Open simulator</button></div>`;
  return `<table>
    <thead><tr><th>Caller</th><th>Intent</th><th class="hide-sm">Duration</th><th>Status</th><th class="hide-sm">When</th></tr></thead>
    <tbody>${list.map(c => {
      const p = state.patients.find(x => x.id === c.patient_id);
      return `<tr class="contact-row call-row" onclick="openCall('${c.id}')">
        <td><div class="cell-flex"><span class="avatar">${p ? p.name.split(' ').map(w => w[0]).join('').slice(0, 2) : '?'}</span>
          <div><div class="contact-name">${p ? esc(p.name) : 'Unknown caller'}</div><div class="contact-email">${esc(c.from)}</div></div></div></td>
        <td style="color:var(--text-2)">${esc(c.intent) || '—'}</td>
        <td class="hide-sm dur">${c.duration_sec ? fmtDur(c.duration_sec) : '—'}</td>
        <td>${c.status === 'in-progress' ? `<span class="badge badge-meeting"><span class="live-dot"></span>Live</span>` : `<span class="badge badge-replied">Completed</span>`}</td>
        <td class="hide-sm" style="color:var(--text-3);font-size:12px">${c.started_at ? timeAgo(c.started_at) : '—'}</td>
      </tr>`; }).join('')}
    </tbody></table>`;
}

async function openCall(id) {
  const c = await api.get('/calls/' + id);
  const p = state.patients.find(x => x.id === c.patient_id);
  const pays = state.payments.filter(x => x.call_id === c.id);
  modal = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal modal-lg">
    <div class="modal-head"><div><h2>${p ? esc(p.name) : 'Unknown caller'} · ${esc(c.from)}</h2>
      <div style="font-size:12px;color:var(--text-3);margin-top:3px">${c.duration_sec ? fmtDur(c.duration_sec) + ' · ' : ''}${esc(c.intent || '')}${c.sentiment ? ' · ' + esc(c.sentiment) + ' sentiment' : ''}</div></div>
      <button class="modal-close" onclick="closeModal()">${I.x}</button></div>
    ${c.summary ? `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:13px 15px;font-size:13px;color:var(--text-2);margin-bottom:16px"><strong style="color:var(--text)">AI summary:</strong> ${esc(c.summary)}</div>` : ''}
    ${c.recording_url ? `<audio controls src="${esc(c.recording_url)}" style="width:100%;margin-bottom:14px"></audio>` : ''}
    <div class="transcript">
      ${(c.transcript || []).map(m => `<div class="bubble ${m.role}">${esc(m.text)}<span class="t">${m.role === 'agent' ? 'Penny (AI)' : 'Caller'} · ${fmtDur(m.t || 0)}</span></div>`).join('') || '<p class="hint">No transcript recorded.</p>'}
    </div>
    ${pays.length ? `<div style="margin-top:16px"><div style="font-size:12px;font-weight:700;color:var(--text-2);margin-bottom:8px">PAYMENTS ON THIS CALL</div>
      ${pays.map(pp => `<div class="step-item"><div class="step-info"><div class="n">${esc(pp.description)} — <span class="money">${money(pp.amount)}</span></div><div class="d">${esc(pp.stripe_session_id)}</div></div><span class="badge pay-${pp.status}">${pp.status}</span></div>`).join('')}</div>` : ''}
  </div></div>`;
  render();
}

// ── PAYMENTS ────────────────────────────────────────────────
function viewPayments() {
  const paid = state.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const pending = state.payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  return `
    ${topbar('Payments', 'Checkout links, invoices, and refunds', `<button class="btn btn-primary" onclick="openManualPayment()">${I.link} Send checkout link</button>`)}
    <div class="content">
      <div class="stat-grid">
        ${stat('Collected', money(paid), 'completed payments', true)}
        ${stat('Outstanding', money(pending), 'links sent, unpaid')}
        ${stat('Transactions', state.payments.length, 'all time')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Description</th><th>Client</th><th>Amount</th><th>Status</th><th class="hide-sm">Session</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${state.payments.map(p => {
          const pat = state.patients.find(x => x.id === p.patient_id);
          return `<tr class="contact-row">
            <td class="contact-name">${esc(p.description)}</td>
            <td style="color:var(--text-2)">${pat ? esc(pat.name) : '—'}</td>
            <td class="money">${money(p.amount)}</td>
            <td><span class="badge pay-${p.status}">${p.status}</span></td>
            <td class="hide-sm" style="font-size:11px;color:var(--text-3);font-family:var(--mono)">${esc((p.stripe_session_id || '').slice(0, 18))}…</td>
            <td><div class="row-actions">
              ${p.status === 'pending' && p.checkout_url ? `<button class="icon-btn" title="Open checkout" onclick="window.open('${esc(p.checkout_url)}','_blank')">${I.link}</button>` : ''}
              ${p.status === 'paid' ? `<button class="btn btn-sm btn-danger" onclick="doRefund('${p.id}')">Refund</button>` : ''}
            </div></td>
          </tr>`; }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">No payments yet</td></tr>`}
        </tbody></table></div>
    </div>`;
}

async function doRefund(id) {
  if (!confirm('Refund this payment?')) return;
  const r = await api.post(`/payments/${id}/refund`);
  if (r.error) return toast(r.error);
  toast('Payment refunded'); await refresh();
}

function openManualPayment() {
  modal = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">
    <div class="modal-head"><h2>Send checkout link</h2><button class="modal-close" onclick="closeModal()">${I.x}</button></div>
    <div class="field"><label>Client</label><select id="mp-patient">${state.patients.map(p => `<option value="${p.id}">${esc(p.name)} · ${esc(p.phone)}</option>`).join('')}</select></div>
    <div class="field"><label>Service</label><select id="mp-fee">${state.fees.map(f => `<option value="${f.code}">${esc(f.name)} — ${money(f.price)}</option>`).join('')}</select></div>
    <p class="hint">A secure checkout link is created and texted to the client's phone (or logged, in demo mode).</p>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sendManualPayment()">${I.send} Create & send</button></div>
  </div></div>`;
  render();
}
async function sendManualPayment() {
  const r = await api.post('/payments/manual', { patientId: $('mp-patient').value, feeCode: $('mp-fee').value });
  if (r.error) return toast(r.error);
  closeModal(); toast('Checkout link sent'); await refresh();
}

// ── PATIENTS ────────────────────────────────────────────────
function viewPatients() {
  return `
    ${topbar('Clients', `${state.patients.length} client records`, `<button class="btn btn-primary" onclick="openPatient()">${I.plus} Add client</button>`)}
    <div class="content"><div class="table-wrap"><table>
      <thead><tr><th>Client</th><th>Phone</th><th class="hide-sm">Notes</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${state.patients.map(p => `<tr class="contact-row">
        <td><div class="cell-flex"><span class="avatar">${p.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
          <div><div class="contact-name">${esc(p.name)}</div><div class="contact-email">${esc(p.email)}</div></div></div></td>
        <td style="font-family:var(--mono);font-size:12.5px">${esc(p.phone)}</td>
        <td class="hide-sm" style="color:var(--text-2);font-size:12.5px">${esc(p.notes) || '—'}</td>
        <td><div class="row-actions"><button class="icon-btn danger" onclick="delPatient('${p.id}')">${I.trash}</button></div></td>
      </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:30px">No patients yet</td></tr>`}
      </tbody></table></div></div>`;
}
function openPatient() {
  modal = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">
    <div class="modal-head"><h2>Add client</h2><button class="modal-close" onclick="closeModal()">${I.x}</button></div>
    <div class="field"><label>Full name</label><input id="pt-name" placeholder="Jane Smith"></div>
    <div class="field"><label>Phone (E.164)</label><input id="pt-phone" placeholder="+12165551234"></div>
    <div class="field"><label>Email</label><input id="pt-email" placeholder="jane@example.com"></div>
    <div class="field"><label>Notes</label><textarea id="pt-notes" style="min-height:60px"></textarea></div>
    <p class="hint">When this phone number calls in, Penny recognizes the client and links the call automatically.</p>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="savePatient()">${I.check} Add</button></div>
  </div></div>`;
  render();
}
async function savePatient() {
  const r = await api.post('/patients', { name: $('pt-name').value.trim(), phone: $('pt-phone').value.trim(), email: $('pt-email').value.trim(), notes: $('pt-notes').value.trim() });
  if (r.error) return toast(r.error);
  closeModal(); toast('Client added'); await refresh();
}
async function delPatient(id) { if (confirm('Delete this client?')) { await api.del('/patients/' + id); await refresh(); } }

// ── FEES ────────────────────────────────────────────────────
function viewFees() {
  return `
    ${topbar('Service menu', 'What Penny can quote and charge on calls', `<button class="btn btn-primary" onclick="openFee()">${I.plus} Add service</button>`)}
    <div class="content"><div class="table-wrap"><table>
      <thead><tr><th>Code</th><th>Service</th><th class="hide-sm">Description</th><th>Price</th><th style="text-align:right"></th></tr></thead>
      <tbody>${state.fees.map(f => `<tr class="contact-row">
        <td style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--teal-dark)">${esc(f.code)}</td>
        <td class="contact-name">${esc(f.name)}</td>
        <td class="hide-sm" style="color:var(--text-2);font-size:12.5px">${esc(f.desc)}</td>
        <td class="money">${money(f.price)}</td>
        <td><div class="row-actions"><button class="icon-btn danger" onclick="delFee('${f.id}')">${I.trash}</button></div></td>
      </tr>`).join('')}</tbody></table></div>
      <p class="hint" style="margin-top:12px">Penny quotes prices only from this menu — it never invents numbers. Changes apply to the very next call.</p>
    </div>`;
}
function openFee() {
  modal = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">
    <div class="modal-head"><h2>Add service</h2><button class="modal-close" onclick="closeModal()">${I.x}</button></div>
    <div class="field-row">
      <div class="field"><label>Code</label><input id="fe-code" placeholder="WRITE-GRANT" style="text-transform:uppercase"></div>
      <div class="field"><label>Price (USD)</label><input id="fe-price" type="number" step="0.01" placeholder="2497.00"></div></div>
    <div class="field"><label>Service name</label><input id="fe-name" placeholder="Write My Grant Package"></div>
    <div class="field"><label>Description (Penny reads this)</label><textarea id="fe-desc" style="min-height:60px"></textarea></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveFee()">${I.check} Add</button></div>
  </div></div>`;
  render();
}
async function saveFee() {
  const r = await api.post('/fees', { code: $('fe-code').value.trim(), name: $('fe-name').value.trim(), price: parseFloat($('fe-price').value), desc: $('fe-desc').value.trim() });
  if (r.error) return toast(r.error);
  closeModal(); toast('Service added'); await refresh();
}
async function delFee(id) { if (confirm('Remove this service?')) { await api.del('/fees/' + id); await refresh(); } }

// ── SIMULATOR ───────────────────────────────────────────────
function viewSimulator() {
  const sc = state.simCall;
  return `
    ${topbar('Test the agent', 'Talk to Penny exactly as a caller would — no phone required')}
    <div class="content"><div class="split">
      <div class="panel"><div class="panel-head"><h3>${sc ? `<span class="live-dot"></span>Live call · ${esc(sc.phone)}` : 'Start a simulated call'}</h3>
        ${sc ? `<button class="btn btn-sm btn-danger" onclick="endSim()">${I.end} End call</button>` : ''}</div>
        <div class="panel-body">
          ${!sc ? `
            <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:16px">This runs the exact same agent pipeline as a real Twilio call — greeting, fee lookup, and payment link sending — just with typed messages instead of speech.</p>
            <div class="field"><label>Caller phone (optional — use a patient's number to test recognition)</label>
              <input id="sim-phone" placeholder="+14045550163 (Tanya Brooks)"></div>
            <button class="btn btn-primary" onclick="startSim()">${I.phone} Simulate incoming call</button>`
          : `
            <div class="transcript" id="sim-transcript">${sc.messages.map(m =>
              m.role === 'sys' ? `<div class="bubble sys">${esc(m.text)}</div>`
              : `<div class="bubble ${m.role}">${esc(m.text)}<span class="t">${m.role === 'agent' ? 'Penny (AI)' : 'You'}</span></div>`).join('')}</div>
            <div class="sim-bar">
              <input id="sim-input" placeholder="Say something… e.g. 'How much is the Write My Grant package?'" onkeydown="if(event.key==='Enter')simSay()">
              <button class="btn btn-primary" onclick="simSay()">${I.send}</button>
            </div>
            <p class="hint" style="margin-top:10px">Try: "How much is Write My Grant?" → "Sign me up, I want to pay now" — watch the payment link fire and appear in the Payments tab.</p>`}
        </div>
      </div>
      <div class="panel"><div class="panel-head"><h3>How this connects to a real phone line</h3></div>
        <div class="panel-body" style="font-size:13px;color:var(--text-2);line-height:1.7">
          <p style="margin-bottom:10px"><strong style="color:var(--text)">1. Twilio number.</strong> Buy a number, point its Voice webhook at <code style="font-family:var(--mono);font-size:11.5px;background:var(--surface-2);padding:2px 6px;border-radius:5px">POST /voice/incoming</code> on this server.</p>
          <p style="margin-bottom:10px"><strong style="color:var(--text)">2. Speech loop.</strong> Twilio transcribes the caller, this server generates the AI reply, and Twilio speaks it back with a neural voice — every turn is saved to the transcript you see in Calls.</p>
          <p style="margin-bottom:10px"><strong style="color:var(--text)">3. Payment mid-call.</strong> When a caller wants to pay, the agent creates a Stripe Checkout session and texts the link to the caller's number during the conversation.</p>
          <p><strong style="color:var(--text)">4. Reconciliation.</strong> Stripe's webhook marks the payment paid, and it shows in the payment log tied to the exact call and transcript.</p>
        </div>
      </div>
    </div></div>`;
}

async function startSim() {
  const phone = $('sim-phone').value.trim() || undefined;
  const r = await api.post('/sim/start', { phone });
  state.simCall = { id: r.callId, phone: phone || 'simulated caller', messages: [{ role: 'agent', text: r.agent }] };
  render();
  setTimeout(() => $('sim-input')?.focus(), 50);
}
async function simSay() {
  const input = $('sim-input');
  const text = input.value.trim();
  if (!text || !state.simCall) return;
  state.simCall.messages.push({ role: 'caller', text });
  input.value = '';
  render();
  const r = await api.post(`/sim/${state.simCall.id}/say`, { text });
  if (r.error) { toast(r.error); return; }
  state.simCall.messages.push({ role: 'agent', text: r.agent });
  if (r.paymentLink) {
    state.simCall.messages.push({ role: 'sys', text: `💳 Checkout link ${r.paymentLink.smsMode === 'twilio' ? 'texted to caller' : 'created (demo — click to open)'}: ${r.paymentLink.url}` });
  }
  render();
  const tEl = $('sim-transcript'); if (tEl) tEl.scrollTop = tEl.scrollHeight;
  setTimeout(() => $('sim-input')?.focus(), 50);
}
async function endSim() {
  if (!state.simCall) return;
  await api.post(`/sim/${state.simCall.id}/end`);
  state.simCall = null;
  toast('Call ended — transcript saved to Calls');
  await refresh();
}

// Poll for live updates every 5s (payments completing, live calls)
setInterval(async () => {
  if (modal || state.simCall) return; // don't re-render over an open modal or active sim
  const prev = state.view;
  await refresh();
  state.view = prev;
}, 5000);

refresh();
