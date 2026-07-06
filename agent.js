// Penny — The Pink Print Firm's AI receptionist.
// Uses Anthropic API when ANTHROPIC_API_KEY is set; falls back to a rules engine.

const { fees } = require('./store');

const SYSTEM_PROMPT = () => `You are Penny, the AI receptionist for The Pink Print Firm — a results-driven grant writing agency that has raised over $23M in debt-free grant funding for entrepreneurs, with a special focus on empowering women founders ("Boss Ladies").
You answer inbound phone calls. Keep replies under 40 words — this is spoken audio. Be warm, confident, and encouraging, in the Pink Print voice.
You can quote prices ONLY from this service menu:
${fees.all().map(f => `- ${f.code}: ${f.name} — $${(f.price / 100).toFixed(2)} (${f.desc})`).join('\n')}

Key facts you can share: Pink Print has raised $23M+ in grants for clients; the firm focuses on "foundation first" — getting the business structured, documents organized, and story sharpened before applying; there is a free grant webinar for people not ready to buy.
If the caller wants to pay or enroll, respond naturally AND end your reply with the exact token [SEND_PAYMENT:<FEE_CODE>] — the system texts them a secure checkout link. Never invent prices or guarantee grant awards. For refund questions, refer them to the team; for anything outside scope, offer a callback from a grant advisor.`;

async function claudeRespond(history) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 200,
      system: SYSTEM_PROMPT(),
      messages: history.map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text })),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
}

function rulesRespond(history) {
  const last = (history[history.length - 1]?.text || '').toLowerCase();
  const feeList = fees.all();

  if (history.length <= 1) {
    return "Thank you for calling The Pink Print Firm, this is Penny, the firm's AI assistant. How can I help you get funded today?";
  }
  // Payment / enrollment intent
  if (/\b(pay|payment|card|checkout|invoice|sign me up|enroll|secure my spot|let'?s do it|book it)\b/.test(last)) {
    const mentioned =
      /\b(write|done.?for.?you)\b/.test(last) ? feeList.find(f => f.code === 'WRITE-GRANT') :
      /\b(ready|foundation|development)\b/.test(last) ? feeList.find(f => f.code === 'GRANT-READY') :
      /\b(plan)\b/.test(last) ? feeList.find(f => f.code === 'BIZ-PLAN') :
      /\b(cert|writer|course|program)\b/.test(last) ? feeList.find(f => f.code === 'GRANT-CERT') :
      /\b(strategy|session|consult)\b/.test(last) ? feeList.find(f => f.code === 'STRATEGY') :
      feeList[1]; // default: Write My Grant
    return `Absolutely, boss! I'm texting a secure checkout link for the ${mentioned.name} to the number you're calling from now — you can complete it while we're on the line. [SEND_PAYMENT:${mentioned.code}]`;
  }
  // Price inquiry
  if (/\b(price|cost|how much|fee|pricing|charge)\b/.test(last)) {
    const match =
      /\b(write|done.?for.?you|write my grant)\b/.test(last) ? feeList.find(f => f.code === 'WRITE-GRANT') :
      /\b(ready|foundation|development|get grant ready)\b/.test(last) ? feeList.find(f => f.code === 'GRANT-READY') :
      /\b(business plan|plan)\b/.test(last) ? feeList.find(f => f.code === 'BIZ-PLAN') :
      /\b(certif|become a grant writer|writer program)\b/.test(last) ? feeList.find(f => f.code === 'GRANT-CERT') :
      /\b(strategy|session|consult|1.?on.?1)\b/.test(last) ? feeList.find(f => f.code === 'STRATEGY') : null;
    if (match) return `The ${match.name} is $${(match.price / 100).toLocaleString()} — ${match.desc}. Would you like to secure your spot?`;
    return `Our most popular services: Get Grant Ready at $1,497, Write My Grant done-for-you at $2,497, Business Plan at $997, the Certified Grant Writer Program at $1,997, and Strategy Sessions at $297. Which fits where you are right now?`;
  }
  if (/\b(webinar|free|not ready|just looking|learn)\b/.test(last)) {
    return "Perfect place to start! We host a free grant education webinar — I'll text you the registration link, and when you're ready to get funded, we'll be here. Anything else?";
  }
  if (/\b(23 ?million|results|success|track record|legit|reviews?)\b/.test(last)) {
    return "Great question — Pink Print has raised over 23 million dollars in debt-free grant funding for entrepreneurs. Our method is foundation first: structure, documents, and story before applications. Want to hear about packages?";
  }
  if (/\b(refund|cancel|money back)\b/.test(last)) {
    return "I'll flag this for our client care team and they'll reach out within one business day to take care of you. Is there anything else I can help with?";
  }
  if (/\b(human|person|someone|advisor|team)\b/.test(last)) {
    return "Of course — I'll arrange a callback from one of our grant advisors within one business day. In the meantime, can I answer anything about our services?";
  }
  if (/\b(thank|that'?s (all|everything)|no.*(else|more)|bye|goodbye)\b/.test(last)) {
    return "You're so welcome — thanks for calling The Pink Print Firm. Go get that funding, and have a wonderful day!";
  }
  return "I can help with service pricing, enrollment and payment, our free grant webinar, or booking a strategy session. What would you like to know?";
}

async function respond(history) {
  let text;
  if (process.env.ANTHROPIC_API_KEY) {
    try { text = await claudeRespond(history); }
    catch (e) { console.warn('Claude call failed, using rules:', e.message); text = rulesRespond(history); }
  } else {
    text = rulesRespond(history);
  }
  let paymentCode = null;
  const m = text.match(/\[SEND_PAYMENT:([A-Z0-9-]+)\]/);
  if (m) { paymentCode = m[1]; text = text.replace(m[0], '').trim(); }
  return { text, paymentCode };
}

const agentMode = () => process.env.ANTHROPIC_API_KEY ? 'claude' : 'rules';

module.exports = { respond, agentMode };
