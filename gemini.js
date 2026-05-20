/* ============================================================
   PAINMAP — gemini.js
   Frontend AI client · Calls backend proxy · No keys here
   ============================================================ */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────
// All API keys live in .env on the server.
// This file only talks to our own backend routes.
const API_BASE = ''; // empty = same origin (served by Express)

// ─── JSON PARSER ─────────────────────────────────────────────
function safeParseJSON(raw) {
    try {
        const cleaned = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        const parsed = JSON.parse(cleaned);
        if (parsed?.error === true) return null;
        return parsed;
    } catch {
        try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch { }
        return null;
    }
}

// ─── BACKEND CALLER ──────────────────────────────────────────
/**
 * POST to our backend proxy.
 * Throws on network error or non-OK HTTP status.
 */
async function callBackend(route, body) {
    const res = await fetch(`${API_BASE}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
    }

    return res.json();
}

// ─── CALL 1: CLUSTER POSTS ───────────────────────────────────
/**
 * Cluster an array of posts into pain themes.
 * @param {Array} posts - normalized post objects
 * @param {string} domain - the search domain
 * @returns {Array} clusters
 */
async function clusterPosts(posts, domain) {
    const data = await callBackend('/api/cluster', { posts, domain });

    if (!data.clusters || !Array.isArray(data.clusters)) {
        console.warn('[API] Cluster response missing clusters array');
        return null;
    }

    // Normalize: support both 'indices' and 'quotes' field names
    return data.clusters.map(c => {
        const idxs = c.indices || c.quotes || [];
        return { ...c, indices: idxs, quotes: idxs, count: idxs.length };
    });
}

// ─── CALL 2: GENERATE IDEA ───────────────────────────────────
/**
 * Generate a startup idea from a pain cluster.
 * @param {Object} cluster - the selected cluster
 * @param {Array} clusterPosts - posts belonging to this cluster
 * @param {string} domain - the search domain
 * @returns {Object} idea
 */
async function generateIdea(cluster, clusterPosts, domain) {
    const data = await callBackend('/api/idea', { cluster, clusterPosts, domain });

    if (!data.idea) {
        throw new Error('Invalid idea response from server');
    }

    return data;
}

// ─── CALL 3: STRESS TEST ─────────────────────────────────────
/**
 * Stress test a generated idea.
 * @param {Object} idea - the generated idea object
 * @returns {Object} stress test result
 */
async function stressTestIdea(idea) {
    const data = await callBackend('/api/stress-test', { idea });

    if (!data.fatal_flaw) {
        throw new Error('Invalid stress test response from server');
    }

    // Normalize verdict
    const validVerdicts = ['pass', 'risky', 'hard_pass'];
    if (!validVerdicts.includes(data.verdict)) {
        data.verdict = 'risky';
    }

    return data;
}

// ─── EXPOSE TO WINDOW ────────────────────────────────────────
window.clusterPosts    = clusterPosts;
window.generateIdea    = generateIdea;
window.stressTestIdea  = stressTestIdea;

window.GEMINI = {
    clusterPosts,
    generateIdea,
    stressTestIdea
};