// Semantic concept search with TypeSafe Jev.
// Design: notebooklm_answers/00_JEV_SEARCH_DESIGN.md
//   stage "skim": request 1 only. Choice over every concept (chunks of <=250) plus a gate Noul.
//   stage "full": request 1, then request 2 with one Noul per shortlisted concept, using the
//                 longer description. Noul probabilities are what the interface shows as "% could help".
// Works as a Vercel serverless function (default export) and from dev.mjs locally.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8'));
const BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.TYPESAFE_MODEL || 'jev-latest';
const CHUNK = 250; // Choice accepts at most 255 options
const PER_CHUNK_SHORTLIST = 8;
const MAX_SHORTLIST = 12;
const TIMEOUT_MS = 8000;

const GATE = 'Does this text describe a situation, problem, question or topic about how people work, decide, communicate, delegate, learn, check work or organize, that general ideas on those subjects could help with?';
const PICK = 'Which of these ideas would most help the person with what they describe?';

const cache = new Map();
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

async function systemOne(state, questions, signal) {
  const key = (process.env.TYPESAFE_API_KEY || '').trim();
  if (!key) {
    const err = new Error('TYPESAFE_API_KEY is not set');
    err.code = 'no_key';
    throw err;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`TypeSafe ${res.status}: ${text.slice(0, 300)}`);
    err.code = res.status === 429 || res.status === 529 ? 'busy' : 'upstream';
    throw err;
  }
  return res.json();
}

async function skim(query, signal) {
  const questions = { gate: { type: 'noul', instructions: GATE } };
  const chunks = [];
  for (let i = 0; i < CATALOG.length; i += CHUNK) chunks.push(CATALOG.slice(i, i + CHUNK));
  chunks.forEach((chunk, i) => {
    questions[`pick${i}`] = {
      type: 'choice',
      instructions: PICK,
      criteria: Object.fromEntries(chunk.map((c) => [c.id, `${c.name}: ${c.line}`])),
    };
  });
  const t0 = Date.now();
  const data = await systemOne({ request: query }, questions, signal);
  const a = data.answers || {};
  const ranked = [];
  const shortlist = [];
  chunks.forEach((_, i) => {
    const probs = Object.entries(a[`pick${i}`]?.probabilities || {}).sort((x, y) => y[1] - x[1]);
    probs.forEach(([id, p]) => ranked.push({ id, p }));
    shortlist.push(...probs.slice(0, PER_CHUNK_SHORTLIST).map(([id, p]) => ({ id, p })));
  });
  ranked.sort((x, y) => y.p - x.p);
  shortlist.sort((x, y) => y.p - x.p);
  return {
    gate: a.gate?.noul ?? null,
    ranked: ranked.slice(0, 40),
    shortlist: shortlist.slice(0, MAX_SHORTLIST).map((s) => s.id),
    ms: Date.now() - t0,
    tokens: data.usage?.input_tokens ?? null,
  };
}

async function confirm(query, ids, signal) {
  const questions = {};
  for (const id of ids) {
    const c = BY_ID[id];
    questions[`help::${id}`] = {
      type: 'noul',
      instructions: `Could this idea help with the person's situation or question? The idea: ${c.name}. ${c.desc}`,
    };
  }
  const t0 = Date.now();
  const data = await systemOne({ request: query }, questions, signal);
  const a = data.answers || {};
  const results = ids
    .map((id) => ({ id, p: a[`help::${id}`]?.noul ?? null }))
    .filter((r) => r.p !== null)
    .sort((x, y) => y.p - x.p);
  return { results, ms: Date.now() - t0, tokens: data.usage?.input_tokens ?? null };
}

export async function search(query, stage = 'skim') {
  const q = norm(query);
  const key = `${stage}::${q}`;
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const first = cache.get(`skim::${q}`) || (await skim(q, controller.signal));
    cache.set(`skim::${q}`, first);
    if (stage === 'skim') return first;
    const second = await confirm(q, first.shortlist, controller.signal);
    const out = { ...first, results: second.results, ms2: second.ms, tokens2: second.tokens };
    cache.set(key, out);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const query = String(body?.q || '').slice(0, 1000);
  const stage = body?.stage === 'full' ? 'full' : 'skim';
  if (norm(query).length < 3) {
    res.status(400).json({ error: 'query_too_short' });
    return;
  }
  try {
    res.status(200).json(await search(query, stage));
  } catch (err) {
    console.error('[search]', err?.code || 'error', err?.message || err);
    const status = err?.code === 'no_key' ? 503 : err?.code === 'busy' ? 429 : 502;
    res.status(status).json({ error: err?.code || 'error', message: String(err?.message || err) });
  }
}
