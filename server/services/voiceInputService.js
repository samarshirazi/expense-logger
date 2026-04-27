/**
 * Voice → structured shopping items, via OpenAI.
 *
 *   transcribeAudio(buffer, filename)
 *     -> { transcript: string, language: string }   (Whisper)
 *
 *   parseItemsFromText(transcript, knownLists?)
 *     -> { items: [{name, quantity, unit, notes, suggested_list, confidence}] }
 *
 * The audio path expects a Buffer plus a hint at the original filename so
 * Whisper can pick the right decoder. We auto-detect language so the user
 * can speak Hindi, English, or Hinglish freely.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const PARSE_MODEL = process.env.OPENAI_PARSE_MODEL || 'gpt-4o-mini';

let _openai = null;

function getOpenAI() {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

async function transcribeAudio(buffer, originalFilename = 'audio.webm') {
  const openai = getOpenAI();

  // Whisper SDK takes a fs.ReadStream; write to a temp file so the SDK can
  // stream it.
  const ext = path.extname(originalFilename) || '.webm';
  const tmpPath = path.join(os.tmpdir(), `voice-${uuidv4()}${ext}`);
  await fs.promises.writeFile(tmpPath, buffer);

  try {
    const resp = await openai.audio.transcriptions.create({
      model: TRANSCRIBE_MODEL,
      file: fs.createReadStream(tmpPath),
      response_format: 'verbose_json', // gives us language detection
    });
    return {
      transcript: (resp.text || '').trim(),
      language: resp.language || null,
      duration: resp.duration || null,
    };
  } finally {
    fs.promises.unlink(tmpPath).catch(() => {});
  }
}

const PARSE_SYSTEM_PROMPT = `You convert a shopping intent (spoken in English, Hindi, or a mix) into a JSON array of shopping items.

Rules:
- Output JSON only, in the form {"items": [...]}.
- Each item has: name (string, in English), quantity (number, default 1), unit (string or null, e.g. "packets", "kg", "litres"), notes (string or null), suggested_list (string or null), confidence (number 0-1).
- If the speaker mentions a store explicitly ("add to Costco list..."), set suggested_list to that store name (case-insensitive match against the provided list of known lists).
- If the speaker does NOT name a store but the item is typically bought at a specific store from the known lists, you may still suggest one — but lower confidence (≤0.6).
- Translate Hindi item names to common English equivalents (e.g., "ghee", "atta", "dal"). Keep the original word in notes if useful.
- Numbers spoken in Hindi/English are both valid ("char" or "four" both = 4).
- If quantity is implied as "a", "some", "ek" → 1.
- Ignore filler words and politeness ("please", "I need", "kya hai").
- If the input has no items, return {"items": []}.`;

async function parseItemsFromText(transcript, knownLists = []) {
  const openai = getOpenAI();
  const known = (knownLists || []).map((l) => l.name || l).filter(Boolean);

  const userMsg = [
    `Known shopping lists for this household: ${JSON.stringify(known)}.`,
    `Transcript: ${JSON.stringify(transcript)}.`,
    'Return JSON only.',
  ].join('\n');

  const resp = await openai.chat.completions.create({
    model: PARSE_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  });

  const raw = resp.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { items: [] };
  }
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return {
    items: items
      .filter((it) => it && typeof it.name === 'string' && it.name.trim())
      .map((it) => ({
        name: String(it.name).trim(),
        quantity: Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 1,
        unit: it.unit ? String(it.unit) : null,
        notes: it.notes ? String(it.notes) : null,
        suggested_list: it.suggested_list ? String(it.suggested_list) : null,
        confidence:
          Number.isFinite(Number(it.confidence)) ? Math.max(0, Math.min(1, Number(it.confidence))) : 0.5,
      })),
  };
}

async function transcribeAndParse(buffer, originalFilename, knownLists) {
  const t = await transcribeAudio(buffer, originalFilename);
  if (!t.transcript) {
    return { transcript: '', language: t.language, items: [] };
  }
  const p = await parseItemsFromText(t.transcript, knownLists);
  return { transcript: t.transcript, language: t.language, items: p.items };
}

module.exports = { transcribeAudio, parseItemsFromText, transcribeAndParse };
