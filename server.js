/* ============================================================
   PAINMAP — server.js
   Express backend · Securely proxies Gemini + Groq API calls
   ============================================================ */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files
app.use(express.static(__dirname));

// ─── CONFIG ──────────────────────────────────────────────────
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GROQ_KEY     = process.env.GROQ_API_KEY;

const GEMINI_MODEL = 'gemini-2.0-flash';
const GROQ_MODEL   = 'llama-3.1-8b-instant';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

// ─── SHARED AI ROUTER ────────────────────────────────────────
/**
 * Tries Gemini first. Falls back to Groq on any failure.
 * Returns raw text from whichever provider responds.
 */
async function callGeminiKey(key, systemPrompt, userPrompt, maxTokens) {
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4, topP: 0.9 }
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Gemini HTTP ${res.status}: ${err?.error?.message || ''}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');
    console.log(`[Gemini] OK — ${text.length} chars returned`);
    return text;
}


async function callLLM(systemPrompt, userPrompt, maxTokens = 1200) {
    // 1. Try primary Gemini key
    if (GEMINI_KEY) {
        try {
            const text = await callGeminiKey(GEMINI_KEY, systemPrompt, userPrompt, maxTokens);
            console.log('[AI] Provider: Gemini (primary)');
            return text;
        } catch (e) {
            console.warn('[AI] Gemini primary failed:', e.message, '— trying fallback...');
        }
    }

    // 2. Fall back to Groq
    if (GROQ_KEY && !GROQ_KEY.startsWith('AIza')) {
        try {
            const res = await fetch(GROQ_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_KEY}`
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user',   content: userPrompt   }
                    ],
                    temperature: 0.4
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(`Groq HTTP ${res.status}: ${err?.error?.message || ''}`);
            }
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new Error('Empty Groq response');

            console.log(`[Groq] OK (fallback) — ${text.length} chars returned`);
            return text;
        } catch (e) {
            console.warn('[AI] Groq fallback failed:', e.message);
        }
    } else if (GROQ_KEY && GROQ_KEY.startsWith('AIza')) {
        console.warn('[AI] Skipping Groq fallback — GROQ_API_KEY looks like a Gemini key. Please provide a real Groq key starting with gsk_');
    }

    throw new Error('All API keys failed or rate-limited. Please wait 60 seconds and try again.');
}

// ─── SYSTEM PROMPTS ──────────────────────────────────────────
const CLUSTER_SYSTEM_PROMPT = `
You are a data analyst who specializes in signal extraction from noisy text.
Your job is not to have opinions. Your job is to find structure.

You will receive raw complaint posts from the internet.
Your task: group them into 3–5 clusters based on shared underlying pain.
Not surface similarity. Not keyword overlap. Underlying pain.

INPUT FORMAT:
You will receive an array of posts, each with an index number and text.
Use those exact index numbers when assigning posts to clusters.

CLUSTERING RULES:
- Each cluster must represent a distinct, non-overlapping problem category
- Labels must be 2–4 words. Name the problem, not the feeling — no adjectives like "frustrating" or "bad"
- Themes must describe the structural failure, not the emotion around it
- Intensity must be inferred from frequency and severity of language — score it 1 (mild) to 5 (severe)
- Every post index must appear in exactly one cluster. No orphans. No duplicates.
- If posts are too similar, create fewer clusters — 2 strong clusters beats 5 weak ones

OUTPUT RULES:
- Return ONLY valid JSON. No markdown. No explanation. No preamble. No trailing text.
- If you cannot comply, return exactly: {"error": true}

OUTPUT FORMAT:
{
  "clusters": [
    {
      "label": "string (2-4 words)",
      "theme": "string (one sentence describing the structural failure)",
      "indices": [number, number],
      "intensity": number (1-5)
    }
  ]
}
`.trim();

const IDEA_SYSTEM_PROMPT = `
You are an early-stage founder who has seen enough bad ideas to know what a real one looks like.
You've read the complaints. You know the pain is real. Now you build.

Your job: take one pain cluster and generate the startup idea it's screaming for.
Not a feature. Not a vague platform. A specific, opinionated solution with a clear who, what, and why now.

IDEA RULES:
- Every part of the idea must be directly grounded in the complaints provided
- "idea" is one sharp line. If it could describe 10 different products, it's too vague.
- "problem" is the specific market failure, stated plainly. No padding.
- "solution" is concrete and specific to this pain — not a generic SaaS description
- "market" is who opens their wallet. Not "businesses" or "people" — be specific.
- "why_now" must name a real shift: technology, behavior, regulation, or timing. Not vibes.
- "hardest_assumption" is the one thing that, if wrong, makes the whole idea collapse.
- Each field must be under 40 words

OUTPUT RULES:
- Return ONLY valid JSON. No markdown. No explanation. No preamble. No trailing text.
- If you cannot comply, return exactly: {"error": true}

OUTPUT FORMAT:
{
  "idea": "string",
  "problem": "string",
  "solution": "string",
  "market": "string",
  "why_now": "string",
  "hardest_assumption": "string"
}
`.trim();

const STRESS_TEST_SYSTEM_PROMPT = `
You are a VC partner in a Monday morning investment meeting.
You have seen 4,000 pitches. You have funded 12.
You are not trying to be cruel — you are trying to find the hole before $2M goes in.

Your job: stress-test this startup idea. Find the single most dangerous assumption.
Not a list of risks. Not a balanced view. The kill shot.

STRESS TEST RULES:
- "fatal_flaw" is the one structural reason this fails — not a surface-level concern
- "market_risk" is specifically why the target customer might not pay, switch, or care enough
- "existing_solution" must be real and specific — name what actually exists, even if imperfect
- "what_must_be_true" is the core assumption the founder is making that they probably haven't validated
- "verdict" must be exactly "pass", "risky", or "hard_pass"
- Avoid generic risks — the flaw must be specific to THIS idea
- Each field must be under 30 words

OUTPUT RULES:
- Return ONLY valid JSON. No markdown. No explanation. No preamble. No trailing text.
- If you cannot comply, return exactly: {"error": true}

OUTPUT FORMAT:
{
  "fatal_flaw": "string",
  "market_risk": "string",
  "existing_solution": "string",
  "what_must_be_true": "string",
  "verdict": "pass" | "risky" | "hard_pass"
}
`.trim();

// ─── JSON EXTRACTOR ──────────────────────────────────────────
/**
 * Finds and parses the first valid JSON object in any LLM response.
 * Handles: raw JSON, ```json fences, prose before/after the block.
 */
function extractJSON(raw) {
    // 1. Strip markdown fences
    const stripped = raw
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/\s*```\s*$/m, '')
        .trim();

    // 2. Try parsing directly
    try { return JSON.parse(stripped); } catch { }

    // 3. Find first { ... } block (handles preamble text)
    const match = raw.match(/(\{[\s\S]*\})/);
    if (match) {
        try { return JSON.parse(match[1]); } catch { }
    }

    return null;
}

// ─── ROUTES ──────────────────────────────────────────────────

/**
 * POST /api/cluster
 * Body: { posts: [...], domain: string }
 * Returns: { clusters: [...] }
 */
app.post('/api/cluster', async (req, res) => {
    const { posts, domain } = req.body;

    if (!Array.isArray(posts) || posts.length === 0) {
        return res.status(400).json({ error: 'posts array required' });
    }

    const postLines = posts
        .slice(0, 20)
        .map((p, i) => `[${i}] (${p.source}) ${p.text}`)
        .join('\n');

    const userPrompt = `
Domain: "${domain}"
Total posts: ${posts.length}

Posts to analyze:
${postLines}

Group these into 3-5 pain clusters. Every post index must appear in exactly one cluster.
`.trim();

    try {
        const raw = await callLLM(CLUSTER_SYSTEM_PROMPT, userPrompt, 1000);
        const parsed = extractJSON(raw);

        if (!parsed || parsed?.error || !Array.isArray(parsed?.clusters)) {
            console.error('[/api/cluster] Bad response:', raw.slice(0, 300));
            return res.status(422).json({ error: 'LLM returned invalid structure' });
        }

        const clusters = parsed.clusters.map(c => {
            const idxs = c.indices || c.quotes || [];
            return { ...c, indices: idxs, quotes: idxs, count: idxs.length };
        });

        res.json({ clusters });
    } catch (err) {
        console.error('[/api/cluster]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/idea
 * Body: { cluster: {...}, clusterPosts: [...], domain: string }
 * Returns: { idea, problem, solution, market, why_now, hardest_assumption }
 */
app.post('/api/idea', async (req, res) => {
    const { cluster, clusterPosts, domain } = req.body;

    if (!cluster || !Array.isArray(clusterPosts)) {
        return res.status(400).json({ error: 'cluster and clusterPosts required' });
    }

    const quotesText = clusterPosts
        .slice(0, 6)
        .map(p => `- [${p.source}] "${p.text.slice(0, 200)}"`)
        .join('\n');

    const userPrompt = `
Domain: "${domain}"
Pain cluster: "${cluster.label}"
Theme: "${cluster.theme}"
Intensity: ${cluster.intensity}

Real complaints from actual users:
${quotesText}

Generate ONE startup idea that directly solves this pain.
`.trim();

    try {
        const raw = await callLLM(IDEA_SYSTEM_PROMPT, userPrompt, 900);
        const parsed = extractJSON(raw);

        if (!parsed || parsed?.error || !parsed?.idea) {
            console.error('[/api/idea] Bad response:', raw.slice(0, 300));
            return res.status(422).json({ error: 'LLM returned invalid structure' });
        }

        res.json(parsed);
    } catch (err) {
        console.error('[/api/idea]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/stress-test
 * Body: { idea: {...} }
 * Returns: { fatal_flaw, market_risk, existing_solution, what_must_be_true, verdict }
 */
app.post('/api/stress-test', async (req, res) => {
    const { idea } = req.body;

    if (!idea?.idea) {
        return res.status(400).json({ error: 'idea object required' });
    }

    const userPrompt = `
Startup idea: "${idea.idea}"
Problem: "${idea.problem}"
Solution: "${idea.solution}"
Market: "${idea.market}"
Why now: "${idea.why_now}"

Be brutally honest. Find the kill shot.
`.trim();

    try {
        const raw = await callLLM(STRESS_TEST_SYSTEM_PROMPT, userPrompt, 700);
        const parsed = extractJSON(raw);

        if (!parsed || parsed?.error || !parsed?.fatal_flaw) {
            console.error('[/api/stress-test] Bad response:', raw.slice(0, 300));
            return res.status(422).json({ error: 'LLM returned invalid structure' });
        }

        if (!['pass', 'risky', 'hard_pass'].includes(parsed.verdict)) {
            parsed.verdict = 'risky';
        }

        res.json(parsed);
    } catch (err) {
        console.error('[/api/stress-test]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── START ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 PainMap server running at http://localhost:${PORT}`);
    console.log(`   Gemini key (primary):  ${GEMINI_KEY ? '✓ loaded' : '✗ missing'}`);
    
    let groqStatus = '✗ missing (optional)';
    if (GROQ_KEY) {
        if (GROQ_KEY.startsWith('AIza')) groqStatus = '⚠ INVALID (Looks like a Gemini key)';
        else groqStatus = '✓ loaded';
    }
    console.log(`   Groq key (fallback):   ${groqStatus}\n`);
});
