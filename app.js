/* ============================================================
   PAINMAP — app.js
   State machine · Data fetching · Orchestration
   ============================================================ */

'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────
const MAX_QUERIES = 3;
const MAX_POSTS_TOTAL = 20;
const MIN_TEXT_WORDS = 12;
const HN_BASE = 'https://hn.algolia.com/api/v1/search';
const REDDIT_PROXY = 'https://corsproxy.io/?';
const REDDIT_BASE = 'https://www.reddit.com/search.json';
const REDDIT_TIMEOUT_MS = 5000;
const REDDIT_MAX_QUERIES = 2;
const REDDIT_USER_AGENT = 'PainMap/1.0 (web client)';
const REDDIT_PAIN_TERMS = [
  'pain point', 'frustrated', 'annoying', 'hate', 'struggle', 'expensive', 'broken', 'problem'
];

const REDDIT_SUBREDDITS = {
  'Freelance Payments':   'freelance+Upwork+fiverr+contracts+Entrepreneur',
  'E-commerce Returns':   'ecommerce+shopify+amazon+retail+flipping',
  'Last-mile Delivery':   'logistics+delivery+doordash+uberdrivers+shipping',
  'Student Productivity': 'college+GetStudying+studytips+Notion+ADHD',
  'Developer Tooling':    'programming+webdev+devops+sysadmin+learnprogramming',
  'Healthcare Admin':     'healthIT+medicine+healthcare+medicalbilling',
  'Small Business Ops':   'smallbusiness+Entrepreneur+accounting+bookkeeping',
  'Creator Monetization': 'youtubers+contentcreators+Twitch+creatorservices+Instagram'
};

const REDDIT_FALLBACK_SUBREDDITS = 'startups+Entrepreneur+SaaS';

// ─── QUERY PACKS ─────────────────────────────────────────────
// Each chip maps to 3 tightly-targeted HN queries.
// Specificity matters: vague queries = noise.
const QUERY_PACKS = {
  'Freelance Payments': [
    'freelance client late payment invoice dispute',
    'upwork payment withheld contractor problem',
    'freelancer not getting paid contract scope creep'
  ],
  'E-commerce Returns': [
    'ecommerce return policy refund denied frustrated',
    'online shopping return label process broken',
    'amazon return restocking fee annoying problem'
  ],
  'Last-mile Delivery': [
    'last mile delivery package stolen missing problem',
    'courier driver failed delivery attempt complaint',
    'FedEx UPS delivery delay wrong address frustrated'
  ],
  'Student Productivity': [
    'student note taking app study workflow broken',
    'university assignment deadline tool frustrated',
    'learning management system LMS canvas blackboard annoying'
  ],
  'Developer Tooling': [
    'developer build tool configuration painful broken',
    'CI CD pipeline debugging frustrating hours wasted',
    'local development environment setup broken annoying'
  ],
  'Healthcare Admin': [
    'insurance prior authorization denied medical billing',
    'doctor appointment booking system broken frustrated',
    'medical records EHR interoperability problem'
  ],
  'Small Business Ops': [
    'small business accounting invoicing payroll software problem',
    'SMB owner tax filing bookkeeping frustrated annoying',
    'small business owner cash flow invoicing tool missing'
  ],
  'Creator Monetization': [
    'youtube creator ad revenue demonetization problem',
    'content creator sponsorship brand deal platform frustrated',
    'creator economy monetization tool missing platform fails'
  ]
};

// ─── DOMAIN KEYWORDS ─────────────────────────────────────────
// Used to pre-filter fetched posts — removes off-topic noise
// before sending to Gemini for clustering.
const DOMAIN_KEYWORDS = {
  'Freelance Payments':   ['freelance', 'invoice', 'client', 'payment', 'contractor', 'upwork', 'fiverr', 'contract', 'scope'],
  'E-commerce Returns':   ['return', 'refund', 'shipping', 'order', 'purchase', 'ecommerce', 'amazon', 'product', 'store'],
  'Last-mile Delivery':   ['delivery', 'package', 'courier', 'parcel', 'driver', 'fedex', 'ups', 'usps', 'shipped', 'tracking'],
  'Student Productivity': ['student', 'study', 'homework', 'assignment', 'university', 'class', 'exam', 'learning', 'lecture', 'notes'],
  'Developer Tooling':    ['developer', 'code', 'coding', 'build', 'pipeline', 'deploy', 'ci', 'framework', 'tooling', 'environment', 'ide'],
  'Healthcare Admin':     ['health', 'medical', 'doctor', 'insurance', 'hospital', 'appointment', 'prescription', 'billing', 'ehr', 'claim'],
  'Small Business Ops':   ['business', 'accounting', 'invoice', 'payroll', 'employee', 'revenue', 'tax', 'bookkeeping', 'smb', 'cashflow'],
  'Creator Monetization': ['creator', 'youtube', 'content', 'monetize', 'subscriber', 'audience', 'sponsorship', 'platform', 'channel']
};

// Pain-keyword expansion for custom input
const PAIN_KEYWORDS = ['frustrated', 'annoying', 'hate', 'broken', 'problem'];

const GENERIC_LABELS = new Set([
  'problem', 'problems', 'pain', 'issue', 'issues', 'frustrated', 'annoying', 'hate',
  'broken', 'complaint', 'complaints', 'delay', 'delays', 'pain point', 'pain points'
]);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'your', 'you',
  'our', 'are', 'was', 'were', 'been', 'but', 'not', 'its', 'they', 'them', 'their', 'about',
  'into', 'over', 'under', 'when', 'where', 'what', 'why', 'how', 'who', 'will', 'would',
  'could', 'should', 'can', 'just', 'like', 'than', 'then', 'there', 'here', 'out', 'get',
  'got', 'make', 'made', 'take', 'took', 'very', 'more', 'most', 'much', 'many', 'some',
  'any', 'each', 'every', 'also', 'use', 'used', 'using', 'via', 'per', 'etc', 'im', 'ive',
  'dont', 'doesnt', 'isnt', 'wasnt', 'wont', 'cant', 'shouldnt', 'good', 'great', 'nice',
  'hype', 'insane', 'tech', 'product', 'products', 'feature', 'features', 'increase',
  'increased', 'seems', 'know', 'dont', 'didnt'
]);

const BAD_LABEL_TOKENS = new Set([
  'good', 'great', 'nice', 'hype', 'insane', 'tech', 'product', 'products', 'feature',
  'features', 'increase', 'increased', 'seems', 'dont', 'know', 'unknown', 'stuff', 'things'
]);

const DOMAIN_PAIN_FALLBACK = {
  'Freelance Payments': 'late payment disputes and payout delays',
  'E-commerce Returns': 'refund friction and return disputes',
  'Last-mile Delivery': 'missed deliveries and tracking failures',
  'Student Productivity': 'study workflow breakdowns and deadline chaos',
  'Developer Tooling': 'environment setup drag and broken build workflows',
  'Healthcare Admin': 'billing delays and prior authorization bottlenecks',
  'Small Business Ops': 'cash flow bottlenecks and manual back office work',
  'Creator Monetization': 'platform policy shocks and revenue instability'
};

const TOPIC_RULES = [
  { label: 'Payment delays', keywords: ['late payment', 'payment', 'paid', 'payout', 'invoice', 'chargeback', 'billing'] },
  { label: 'Scope creep', keywords: ['scope creep', 'scope', 'requirements', 'change request', 'revision'] },
  { label: 'Refund friction', keywords: ['refund', 'return', 'restocking', 'chargeback'] },
  { label: 'Delivery failures', keywords: ['delivery', 'shipping', 'courier', 'package', 'parcel', 'tracking', 'lost', 'stolen'] },
  { label: 'Tool setup drag', keywords: ['setup', 'install', 'configuration', 'configure', 'dependency', 'environment'] },
  { label: 'Workflow blockers', keywords: ['workflow', 'process', 'approval', 'manual', 'paperwork'] },
  { label: 'Support dead-ends', keywords: ['support', 'ticket', 'unresponsive', 'no response', 'helpdesk'] },
  { label: 'Policy risk', keywords: ['policy', 'ban', 'suspend', 'suspension', 'demonet', 'compliance'] },
  { label: 'Integration gaps', keywords: ['integration', 'api', 'sync', 'export', 'import', 'connect'] },
  { label: 'Scheduling friction', keywords: ['schedule', 'scheduling', 'booking', 'appointment', 'calendar'] },
  { label: 'Cash flow crunch', keywords: ['cash flow', 'cashflow', 'payroll', 'tax', 'reconcile'] }
];

// ─── APP STATE ───────────────────────────────────────────────
const STATE = {
  IDLE: 'IDLE',
  VALIDATING: 'VALIDATING',
  FETCHING: 'FETCHING',
  CLUSTERING: 'CLUSTERING',
  RESULTS: 'RESULTS',
  IDEATING: 'IDEATING',
  IDEA_READY: 'IDEA_READY',
  STRESS_TESTING: 'STRESS_TESTING'
};

let currentState = STATE.IDLE;
let currentDomain = '';
let allPosts = [];
let clusters = [];
let activeCluster = null;
let currentIdea = null;
let savedInsights = [];

// ─── STATE MACHINE ───────────────────────────────────────────
function transition(newState, payload = {}) {
  console.log(`[PainMap] ${currentState} → ${newState}`, payload);
  currentState = newState;

  // Notify UI layer
  if (typeof window.onStateChange === 'function') {
    window.onStateChange(newState, payload);
  }
}

// ─── INPUT VALIDATION ────────────────────────────────────────
/**
 * Layer 1: Basic client-side checks (instant)
 * Returns { valid: bool, reason: string }
 */
function validateDomain(val) {
  const trimmed = val.trim();
  if (!trimmed || trimmed.length < 4) {
    return { valid: false, reason: 'too_short' };
  }
  if (!/[aeiou]/i.test(trimmed)) {
    return { valid: false, reason: 'no_vowels' };
  }
  if (/^[^a-zA-Z]+$/.test(trimmed)) {
    return { valid: false, reason: 'no_letters' };
  }
  if (/^(.)\1{3,}$/.test(trimmed)) {
    return { valid: false, reason: 'repeated_chars' };
  }
  return { valid: true };
}

/**
 * Layer 2: Fuzzy match against known chip labels
 * Returns array of suggested chip labels
 */
function getSuggestions(val) {
  const lower = val.toLowerCase();
  return Object.keys(QUERY_PACKS).filter(label => {
    const labelLower = label.toLowerCase();
    return labelLower.includes(lower) ||
      lower.split(' ').some(w => w.length > 2 && labelLower.includes(w));
  }).slice(0, 3);
}

// ─── QUERY BUILDER ───────────────────────────────────────────
/**
 * Returns up to MAX_QUERIES search strings for a domain.
 * Uses predefined pack if available, else expands with pain keywords.
 */
function buildQueries(domain) {
  if (QUERY_PACKS[domain]) {
    return QUERY_PACKS[domain].slice(0, MAX_QUERIES);
  }
  // Custom domain: expand with pain keywords
  return PAIN_KEYWORDS.slice(0, MAX_QUERIES).map(kw => `${domain} ${kw}`);
}

// ─── DATA FETCHING ───────────────────────────────────────────

/** Strip HTML tags from HN comment text */
function stripHTML(html) {
  return html
    .replace(/<p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if post text has enough signal */
function hasEnoughWords(text) {
  return text.split(/\s+/).filter(Boolean).length >= MIN_TEXT_WORDS;
}

/** Deduplicate posts by URL */
function deduplicateByUrl(posts) {
  const seen = new Set();
  return posts.filter(p => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}

/**
 * Fetch posts from HN Algolia for a single query.
 * Returns normalized post objects.
 */
async function fetchHNQuery(query) {
  try {
    const url = `${HN_BASE}?query=${encodeURIComponent(query)}&tags=comment&hitsPerPage=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    return (data.hits || [])
      .map(h => {
        const text = h.comment_text ? stripHTML(h.comment_text) : '';
        return {
          text: text.slice(0, 400),
          source: 'HN',
          url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          score: h.points || 0,
          query: query,
          weight: 1.2
        };
      })
      .filter(p => hasEnoughWords(p.text));
  } catch (err) {
    console.warn('[HN] fetch failed for query:', query, err.message);
    return [];
  }
}

/**
 * Fetch all HN queries in parallel.
 */
async function fetchAllHN(queries) {
  const results = await Promise.all(queries.map(fetchHNQuery));
  return deduplicateByUrl(results.flat());
}

/**
 * Fetch posts from Reddit via CORS proxy (silent fallback).
 * Never throws — returns [] on any failure.
 */
async function fetchReddit(query) {
  return fetchRedditQuery(query, null);
}

/**
 * Fetch Reddit for first query only (to limit failure surface).
 */
async function fetchAllReddit(queries, domain) {
  const subreddit = getRedditSubreddits(domain);
  const redditQueries = buildRedditQueries(domain, queries);

  const results = await Promise.all(
    redditQueries.map(q => fetchRedditQuery(q, subreddit))
  );

  return deduplicateByUrl(results.flat());
}

function getRedditSubreddits(domain) {
  return REDDIT_SUBREDDITS[domain] || REDDIT_FALLBACK_SUBREDDITS;
}

function buildRedditQueries(domain, baseQueries) {
  const painClause = REDDIT_PAIN_TERMS.map(t => `"${t}"`).join(' OR ');
  const domainQuery = `"${domain}" (${painClause})`;
  const altQuery = baseQueries?.[0] ? `${baseQueries[0]} (${painClause})` : domainQuery;
  return [domainQuery, altQuery].filter(Boolean).slice(0, REDDIT_MAX_QUERIES);
}

async function fetchRedditQuery(query, subreddit) {
  try {
    const base = subreddit
      ? `https://www.reddit.com/r/${subreddit}/search.json`
      : REDDIT_BASE;
    const target = `${base}?q=${encodeURIComponent(query)}&restrict_sr=${subreddit ? 1 : 0}`
      + '&sort=relevance&limit=15&t=year&type=link';
    const proxied = `${REDDIT_PROXY}${encodeURIComponent(target)}`;
    const res = await fetch(proxied, {
      signal: AbortSignal.timeout(REDDIT_TIMEOUT_MS),
      headers: {
        'Accept': 'application/json',
        'User-Agent': REDDIT_USER_AGENT
      }
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data?.data?.children || [])
      .map(child => {
        const p = child.data || {};
        const title = p.title || '';
        const body = p.selftext || '';
        const combined = `${title}${title && body ? ' — ' : ''}${body}`.slice(0, 400);
        return {
          text: combined,
          source: 'Reddit',
          url: `https://reddit.com${p.permalink}`,
          score: p.score || 0,
          query: query,
          weight: 1.0
        };
      })
      .filter(p => hasEnoughWords(p.text));
  } catch {
    return [];
  }
}

/**
 * Master fetch: HN always + Reddit silent attempt.
 * Returns merged, weighted, sorted, capped array.
 */
async function fetchPosts(domain) {
  const queries = buildQueries(domain);
  console.log('[PainMap] Queries:', queries);

  // Fire HN and Reddit in parallel
  const [hnPosts, redditPosts] = await Promise.all([
    fetchAllHN(queries),
    fetchAllReddit(queries, domain)
  ]);

  console.log(`[PainMap] HN: ${hnPosts.length}, Reddit: ${redditPosts.length}`);

  // Merge
  const merged = deduplicateByUrl([...hnPosts, ...redditPosts]);

  // Sort by weighted score
  merged.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));

  // Cap at MAX_POSTS_TOTAL
  return merged.slice(0, MAX_POSTS_TOTAL);
}

// ─── SAVED INSIGHTS ──────────────────────────────────────────
function saveInsight(idea, clusterLabel) {
  const insight = {
    id: Date.now(),
    idea,
    cluster: clusterLabel,
    domain: currentDomain,
    savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  savedInsights.unshift(insight);

  // Notify UI
  if (typeof window.onInsightSaved === 'function') {
    window.onInsightSaved(savedInsights);
  }

  showToast('Insight saved ✓', 'success');
  return insight;
}

function removeInsight(id) {
  savedInsights = savedInsights.filter(i => i.id !== id);
  if (typeof window.onInsightSaved === 'function') {
    window.onInsightSaved(savedInsights);
  }
}

// ─── TOAST ───────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'default') {
  let el = document.getElementById('globalToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── RELEVANCE FILTER ────────────────────────────────────────
/**
 * Strips posts with no domain-relevant keywords before clustering.
 * Prevents off-topic HN noise from confusing the model.
 * Falls back to all posts for custom domains.
 */
function filterRelevantPosts(posts, domain) {
  let keywords = DOMAIN_KEYWORDS[domain];
  if (!keywords || keywords.length === 0) {
    const tokens = domain
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/[\s-]+/)
      .filter(t => t.length >= 4);
    keywords = tokens.length > 0 ? tokens : null;
  }
  if (!keywords || keywords.length === 0) return posts; // custom domain: skip filter

  const filtered = posts.filter(post => {
    const text = post.text.toLowerCase();
    return keywords.some(k => text.includes(k));
  });

  return filtered.length >= 5 ? filtered : posts;
}


// ─── MAIN ORCHESTRATION ──────────────────────────────────────
/**
 * Entry point called from results.html after page load.
 * domain: string from URL params
 */
async function runPainMap(domain) {
  currentDomain = domain;
  transition(STATE.FETCHING, { domain });

  // ── Stage 1: Fetch posts ──
  try {
    allPosts = await fetchPosts(domain);
  } catch (err) {
    console.error('[PainMap] Fetch error:', err);
    allPosts = [];
  }

  if (allPosts.length === 0) {
    transition(STATE.IDLE, { error: 'no_results', domain });
    return;
  }

  // ── Stage 1.5: Pre-filter off-topic posts ──
  const filtered = filterRelevantPosts(allPosts, domain);
  console.log(`[PainMap] Filter: ${allPosts.length} → ${filtered.length} relevant posts`);
  // Use filtered if it has enough signal, otherwise fall back to raw posts
  allPosts = filtered.length >= 5 ? filtered : allPosts;

  // Render quote feed (UI layer)
  if (typeof window.renderFeed === 'function') {
    window.renderFeed(allPosts);
  }

  // ── Stage 2: Cluster ──
  transition(STATE.CLUSTERING, { postCount: allPosts.length });

  try {
    clusters = await window.clusterPosts(allPosts, domain);
  } catch (err) {
    console.error('[PainMap] Cluster error:', err);
    clusters = buildFallbackClusters(allPosts, domain);
  }

  if (!clusters || clusters.length === 0) {
    console.warn('[PainMap] Clustering returned null — using fallback');
    clusters = buildFallbackClusters(allPosts, domain);
  }

  clusters = refineClusterLabels(clusters, allPosts, domain);

  // ── Stage 3: Render results ──
  transition(STATE.RESULTS, { clusters, posts: allPosts });

  if (typeof window.renderBubbles === 'function') {
    window.renderBubbles(clusters, allPosts);
  }
}

/**
 * Called when user clicks a cluster bubble.
 */
async function handleClusterClick(cluster) {
  activeCluster = cluster;
  transition(STATE.IDEATING, { cluster });

  if (typeof window.showIdeaLoading === 'function') {
    window.showIdeaLoading(cluster);
  }

  try {
    const idxs = cluster.indices || cluster.quotes || [];
    const clusterPosts = idxs.map(i => allPosts[i]).filter(Boolean);
    currentIdea = await generateIdeaWithRetry(cluster, clusterPosts, window.APP.getDomain());
    transition(STATE.IDEA_READY, { idea: currentIdea, cluster });

    if (typeof window.renderIdeaCard === 'function') {
      window.renderIdeaCard(currentIdea, cluster);
    }
  } catch (err) {
    console.error('[PainMap] Idea gen error:', err);
    showToast('Idea generation failed. Try again.', 'error');
    transition(STATE.RESULTS);
  }
}

/**
 * Called when user hits Stress Test button.
 */
async function handleStressTest() {
  if (!currentIdea) return;
  transition(STATE.STRESS_TESTING, { idea: currentIdea });

  if (typeof window.showStressTestLoading === 'function') {
    window.showStressTestLoading();
  }

  try {
    const stressResult = await window.stressTestIdea(currentIdea);
    if (typeof window.renderStressResult === 'function') {
      window.renderStressResult(stressResult);
    }
  } catch (err) {
    console.error('[PainMap] Stress test error:', err);
    showToast('Stress test failed. Try again.', 'error');
  }
}

// ─── FALLBACK CLUSTERING ─────────────────────────────────────
/**
 * If Gemini clustering fails, group posts by the pain keyword
 * used in their query. Simple but functional.
 */
function buildFallbackClusters(posts, domain) {
  const groups = {};

  posts.forEach((post, i) => {
    const keyword = inferTopicFromText(post.text, domain) || extractKeyword(post.query) || 'pain';
    if (!groups[keyword]) {
      groups[keyword] = { label: capitalize(keyword), quotes: [], count: 0 };
    }
    groups[keyword].quotes.push(i);
    groups[keyword].count++;
  });

  return Object.values(groups).map((g, idx) => ({
    label: g.label,
    theme: `Users expressing "${g.label.toLowerCase()}" about this domain`,
    quotes: g.quotes,
    intensity: g.count >= 5 ? 'high' : g.count >= 3 ? 'medium' : 'low',
    count: g.count
  }));
}

function extractKeyword(query) {
  const keywords = ['frustrated', 'annoying', 'hate', 'wish', 'problem', 'delayed'];
  for (const kw of keywords) {
    if (query.toLowerCase().includes(kw)) return kw;
  }
  return 'pain';
}

function inferTopicFromText(text, domain) {
  const lower = (text || '').toLowerCase();
  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return rule.label;
    }
  }

  const tokens = extractTopTokens(lower, domain, 2);
  if (tokens.length === 0) return null;
  return tokens.map(capitalize).join(' ');
}

function extractTopTokens(text, domain, maxTokens = 2) {
  const domainTokens = (domain || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(t => t.length >= 3);

  const counts = new Map();
  text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .forEach(token => {
      if (token.length < 3) return;
      if (STOPWORDS.has(token)) return;
      if (BAD_LABEL_TOKENS.has(token)) return;
      if (domainTokens.includes(token)) return;
      counts.set(token, (counts.get(token) || 0) + 1);
    });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTokens)
    .map(([token]) => token);
}

function refineClusterLabels(clusterList, posts, domain) {
  return clusterList.map(cluster => {
    const rawLabel = (cluster.label || '').trim();
    const normalized = rawLabel.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (!rawLabel || rawLabel.length < 4 || GENERIC_LABELS.has(normalized) || isLowSignalLabel(rawLabel)) {
      const better = inferLabelFromCluster(cluster, posts, domain);
      const finalLabel = better && !isLowSignalLabel(better)
        ? better
        : normalizePainLabel(rawLabel, domain);
      return { ...cluster, label: finalLabel || rawLabel || 'Pain cluster' };
    }
    return cluster;
  });
}

function inferLabelFromCluster(cluster, posts, domain) {
  const idxs = cluster.indices || cluster.quotes || [];
  const sampleText = idxs
    .map(i => posts[i]?.text || '')
    .join(' ');
  return inferTopicFromText(sampleText, domain);
}

function isLowSignalLabel(label) {
  const normalized = (label || '').toLowerCase().replace(/[^a-z\s]/g, ' ').trim();
  if (!normalized) return true;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.every(t => t.length <= 3)) return true;
  if (tokens.some(t => BAD_LABEL_TOKENS.has(t))) return true;
  return false;
}

function normalizePainLabel(label, domain) {
  if (!label || isLowSignalLabel(label)) {
    return DOMAIN_PAIN_FALLBACK[domain] || `${domain} workflow breakdowns`;
  }
  return label;
}

async function generateIdeaWithRetry(cluster, clusterPosts, domain) {
  try {
    return await window.generateIdea(cluster, clusterPosts, domain);
  } catch (err) {
    console.warn('[PainMap] Idea gen failed, retrying with fewer posts:', err.message);
  }

  if (clusterPosts.length > 3) {
    try {
      return await window.generateIdea(cluster, clusterPosts.slice(0, 3), domain);
    } catch (err) {
      console.warn('[PainMap] Idea gen retry failed, falling back:', err.message);
    }
  }

  return buildFallbackIdea(cluster, clusterPosts, domain);
}

function buildFallbackIdea(cluster, clusterPosts, domain) {
  const pain = normalizePainLabel(cluster.label, domain).toLowerCase();
  const market = guessMarket(domain, clusterPosts);
  const whyNow = guessWhyNow(clusterPosts);
  const problem = `Teams dealing with ${pain} in ${domain} lack a consistent way to detect issues early and resolve them fast.`;
  const solution = `A workflow assistant that flags ${pain}, routes the right next step, and documents resolution outcomes automatically.`;
  const idea = `${capitalize(domain)} ${pain} response desk for ${market}.`;
  const hardestAssumption = `Teams in ${market} will trust automated triage enough to change their current workflow.`;

  return {
    idea,
    problem,
    solution,
    market,
    why_now: whyNow,
    hardest_assumption: hardestAssumption
  };
}

function guessMarket(domain, posts) {
  const lower = (domain || '').toLowerCase();
  if (lower.includes('freelance')) return 'independent freelancers and agencies';
  if (lower.includes('delivery')) return 'delivery operations teams';
  if (lower.includes('e-commerce') || lower.includes('ecommerce')) return 'online store operators';
  if (lower.includes('student')) return 'students and academic support teams';
  if (lower.includes('developer') || lower.includes('tooling')) return 'engineering teams';
  if (lower.includes('health')) return 'clinic admins and billing teams';
  if (lower.includes('business')) return 'small business owners';
  if (lower.includes('creator')) return 'independent creators';

  const sample = (posts[0]?.text || '').toLowerCase();
  if (sample.includes('client')) return 'client-facing teams';
  if (sample.includes('invoice')) return 'finance teams';
  return 'operators in this space';
}

function guessWhyNow(posts) {
  const sample = (posts[0]?.text || '').toLowerCase();
  if (sample.includes('platform')) return 'platform policy changes are accelerating churn and forcing teams to adapt.';
  if (sample.includes('remote') || sample.includes('distributed')) {
    return 'distributed work has made coordination gaps harder to spot and resolve.';
  }
  return 'increased volume and automation expectations make manual handling too slow.';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── EXPORTS (accessed globally from HTML/other scripts) ─────
window.APP = {
  validateDomain,
  getSuggestions,
  buildQueries,
  fetchPosts,
  runPainMap,
  handleClusterClick,
  handleStressTest,
  saveInsight,
  removeInsight,
  showToast,
  getState: () => currentState,
  getDomain: () => currentDomain,
  getPosts: () => allPosts,
  getClusters: () => clusters,
  getSavedInsights: () => savedInsights,
  STATE,
  QUERY_PACKS
};