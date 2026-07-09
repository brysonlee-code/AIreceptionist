// ElevenLabs Conversational AI — agent setup + management
// Creates/updates the ElevenLabs agent via REST API with server-side tools

const { fees } = require('./store');
const { SYSTEM_PROMPT } = require('./agent');

const EL_API = 'https://api.elevenlabs.io/v1';

let agentId = process.env.ELEVENLABS_AGENT_ID || null;

function elHeaders() {
  return {
    'xi-api-key': process.env.ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
  };
}

function buildSystemPrompt() {
  // Reuse the same prompt from agent.js but strip the [SEND_PAYMENT:*] instruction
  // since ElevenLabs will call our webhook tools instead
  const base = SYSTEM_PROMPT();
  return base.replace(
    /If the caller wants to pay or enroll.*?\[SEND_PAYMENT:<FEE_CODE>\][^.]*\./s,
    'If the caller wants to pay or enroll, use the send_payment_link tool with the matching fee code. Never invent prices or guarantee grant awards.'
  );
}

function buildAgentConfig(publicUrl) {
  const feeList = fees.all();

  return {
    name: 'Penny — Pink Print AI Receptionist',
    conversationConfig: {
      agent: {
        firstMessage: "Thank you for calling The Pink Print Firm, this is Penny, the firm's AI assistant. How can I help you get funded today?",
        language: 'en',
        prompt: {
          prompt: buildSystemPrompt(),
          temperature: 0.7,
          maxTokens: 200,
          tools: [
            {
              type: 'webhook',
              name: 'get_services',
              description: 'Get the list of available services and their prices. Call this when the caller asks about pricing, services, or what you offer.',
              apiSchema: {
                url: `${publicUrl}/api/el/tools/fees`,
                method: 'GET',
              },
            },
            {
              type: 'webhook',
              name: 'lookup_caller',
              description: 'Look up a caller by phone number to personalize the conversation. Call this at the start of each conversation.',
              apiSchema: {
                url: `${publicUrl}/api/el/tools/lookup-caller`,
                method: 'POST',
                requestBodySchema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string', description: "The caller's phone number in E.164 format" },
                  },
                  required: ['phone'],
                },
              },
            },
            {
              type: 'webhook',
              name: 'send_payment_link',
              description: 'Create a secure checkout link and text it to the caller. Use this when the caller wants to pay, enroll, or sign up for a service. Use the fee code from the services list.',
              apiSchema: {
                url: `${publicUrl}/api/el/tools/send-payment`,
                method: 'POST',
                requestBodySchema: {
                  type: 'object',
                  properties: {
                    fee_code: { type: 'string', description: 'The service fee code (e.g. WRITE-GRANT, GRANT-READY)' },
                    phone: { type: 'string', description: "The caller's phone number" },
                  },
                  required: ['fee_code', 'phone'],
                },
              },
            },
          ],
        },
      },
      tts: process.env.ELEVENLABS_VOICE_ID ? {
        voiceId: process.env.ELEVENLABS_VOICE_ID,
      } : undefined,
    },
  };
}

async function setupAgent(publicUrl) {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is required');
  }

  const config = buildAgentConfig(publicUrl);

  if (agentId) {
    // Update existing agent
    const res = await fetch(`${EL_API}/convai/agents/${agentId}`, {
      method: 'PATCH',
      headers: elHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`ElevenLabs update failed: ${res.status} ${err.detail || JSON.stringify(err)}`);
    }
    console.log(`ElevenLabs agent updated: ${agentId}`);
    return agentId;
  }

  // Create new agent
  const res = await fetch(`${EL_API}/convai/agents/create`, {
    method: 'POST',
    headers: elHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ElevenLabs create failed: ${res.status} ${err.detail || JSON.stringify(err)}`);
  }
  const data = await res.json();
  agentId = data.agent_id;
  console.log(`ElevenLabs agent created: ${agentId}`);
  return agentId;
}

function getAgentId() {
  return agentId;
}

module.exports = { setupAgent, getAgentId };
