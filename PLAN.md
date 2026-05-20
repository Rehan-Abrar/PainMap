# PainMap — Build Plan
> Find where markets hurt. Build what fixes it.
> Hackathon: Antigravity | Time budget: 60 minutes

---

## File Structure

```
painmap/
├── index.html        — Landing page (chips, input, validation)
├── results.html      — Results page (feed, bubbles, idea card, drawer)
├── style.css         — Design system, shared tokens, animations
├── app.js            — State machine, orchestration, data merging
├── gemini.js         — All 3 Gemini calls, JSON enforcement, fallbacks
└── ui.js             — Bubble render, card animations, drawer, stages
```

---

## Phase 0 — Setup (Minutes 0–5)

**Goal:** Project skeleton is ready, nothing breaks.

### Tasks
- [ ] Create all 6 files with empty boilerplate
- [ ] Link `style.css`, `app.js`, `ui.js`, `gemini.js` in both HTML files
- [ ] Add Google Fonts import (`Syne` display + `JetBrains Mono` for quotes)
- [ ] Define all CSS variables in `:root` (colors, spacing, radii, shadows)
- [ ] Test that both HTML pages open without console errors

### CSS Variables to define
```css
:root {
  --bg-base: #0a0a0a;
  --bg-surface: #111111;
  --bg-card: #181818;
  --bg-card-hover: #1f1f1f;
  --accent: #f97316;          /* orange — pain is hot */
  --accent-dim: #7c3a1a;
  --accent-glow: rgba(249, 115, 22, 0.15);
  --text-primary: #f5f5f5;
  --text-secondary: #888888;
  --text-mono: #a3a3a3;
  --border: rgba(255,255,255,0.06);
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
}
```

### Deliverable
Both pages load. Dark background visible. Fonts loading.

---

## Phase 1 — Landing Page UI (Minutes 5–18)

**Goal:** `index.html` looks production-ready, chips work, input validates.

### Tasks

#### Layout
- [ ] Top nav: `PainMap` wordmark (left) + `Built on Antigravity` badge (right)
- [ ] Hero: Large headline `"Where does your market hurt?"` + subline
- [ ] Chip grid: 8 domain chips in 2 rows × 4
- [ ] Input: Search bar below chips, placeholder `"or describe your own domain…"`
- [ ] Trending row: 3 static hot tags with `🔥` prefix
- [ ] CTA button: `"Find Pain Points →"` — disabled until valid input

#### Chip query packs (hardcode in `app.js`)
```js
const QUERY_PACKS = {
  "Freelance Payments":    ["freelance payment delayed frustrated", "client invoice problem", "why is there no invoicing tool freelancers"],
  "E-commerce Returns":    ["ecommerce returns frustrating", "online shopping return policy problem", "refund process annoying"],
  "Last-mile Delivery":    ["last mile delivery problem frustrated", "package delivery delay complaint", "courier service hate"],
  "Student Productivity":  ["student productivity problem", "studying frustrated tools", "why is there no app for students"],
  "Developer Tooling":     ["developer tools frustrating", "why is there no dev tool", "coding workflow annoying"],
  "Healthcare Admin":      ["healthcare admin problem", "doctor appointment booking frustrated", "medical records annoying"],
  "Small Business Ops":    ["small business operations problem", "SME tools frustrated", "why is there no software for small business"],
  "Creator Monetization":  ["creator monetization problem", "youtube creator frustrated", "why is there no tool for creators"]
}
```

#### Input validation (3 layers in `app.js`)
```
Layer 1 — Client (instant):
  length < 4 → block
  no vowels OR all numbers → block
  pass → green border, button activates

Layer 2 — Suggestion fallback:
  fuzzy match input against 8 chip labels
  show "Did you mean: X, Y?" if weak match

Layer 3 — Gemini gate (optional):
  single YES/NO call before proceeding
  only fires if layers 1+2 pass
```

#### Trending tags (static, hardcoded)
```
🔥 Payment delays     📈 AI tool fatigue     🌍 Remote work friction
```

### Deliverable
Landing page fully styled. Clicking a chip highlights it and activates the button. Bad input shows suggestions. Good input navigates to `results.html?domain=...`

---

## Phase 2 — Data Layer (Minutes 18–30)

**Goal:** Real posts fetched from HN. Reddit attempted silently. Posts normalized.

### HN Algolia fetch (in `app.js`)

```js
// Constants
const MAX_QUERIES = 3
const MAX_POSTS_TOTAL = 20
const MIN_TEXT_WORDS = 15
const HN_BASE = "https://hn.algolia.com/api/v1/search"

// Fetch one query
async function fetchHN(query) {
  const url = `${HN_BASE}?query=${encodeURIComponent(query)}&tags=comment&hitsPerPage=8`
  const res = await fetch(url)
  const data = await res.json()
  return data.hits
    .filter(h => h.comment_text && h.comment_text.split(' ').length >= MIN_TEXT_WORDS)
    .map(h => ({
      text: stripHTML(h.comment_text).slice(0, 300),
      source: "HN",
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      score: h.points || 0,
      query: query
    }))
}

// Fetch all queries in parallel
async function fetchAllHN(queries) {
  const results = await Promise.all(queries.slice(0, MAX_QUERIES).map(fetchHN))
  return deduplicateByUrl(results.flat())
}
```

### Reddit fetch (silent fallback, in `app.js`)

```js
const REDDIT_PROXY = "https://corsproxy.io/?"
const REDDIT_BASE = "https://www.reddit.com/search.json"

async function fetchReddit(query) {
  try {
    const url = `${REDDIT_PROXY}${encodeURIComponent(`${REDDIT_BASE}?q=${query}&sort=new&limit=8`)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    const data = await res.json()
    return data.data.children
      .filter(p => p.data.selftext && p.data.selftext.split(' ').length >= MIN_TEXT_WORDS)
      .map(p => ({
        text: p.data.selftext.slice(0, 300),
        source: "Reddit",
        url: `https://reddit.com${p.data.permalink}`,
        score: p.data.score || 0,
        query: query
      }))
  } catch {
    return [] // silent fail — never surfaces to user
  }
}
```

### Normalization + merging

```js
function mergeSources(hn, reddit) {
  const weighted = [
    ...hn.map(p => ({ ...p, weight: 1.2 })),
    ...reddit.map(p => ({ ...p, weight: 1.0 }))
  ]
  const deduped = deduplicateByUrl(weighted)
  const sorted = deduped.sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
  return sorted.slice(0, MAX_POSTS_TOTAL)
}
```

### Deliverable
`app.js` exports `fetchPosts(domain)` → returns max 20 normalized post objects. Reddit failure is invisible.

---

## Phase 3 — Gemini Layer (Minutes 30–40)

**Goal:** All 3 Gemini calls work, return strict JSON, have fallbacks.

### Setup (in `gemini.js`)

```js
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

async function callGemini(prompt, systemPrompt) {
  const res = await fetch(`${GEMINI_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: prompt }] }]
    })
  })
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}
```

### Call 1 — Clustering

**System prompt:**
```
You are a startup analyst. Analyze complaint posts and group them into 3-5 pain clusters.
Respond ONLY with valid JSON. No explanation. No markdown. No preamble.
If you cannot comply, return {"error": true}
```

**User prompt:**
```
Here are ${posts.length} complaints about "${domain}":
${posts.map((p,i) => `[${i}] ${p.text}`).join('\n')}

Group them into clusters. Return exactly:
{
  "clusters": [
    {
      "label": "short name",
      "theme": "one sentence description of the pain",
      "quotes": [0, 3, 5],
      "intensity": "high|medium|low"
    }
  ]
}
```

**Fallback if parse fails:** Group posts by their `query` field → create one cluster per query keyword used.

### Call 2 — Idea generation

**System prompt:**
```
You are a sharp startup advisor. Generate one actionable startup idea from a pain cluster.
Respond ONLY with valid JSON. No explanation. No markdown. No preamble.
```

**User prompt:**
```
Pain cluster: "${cluster.label}"
Theme: "${cluster.theme}"
Real complaints:
${clusterPosts.map(p => `- ${p.text}`).join('\n')}

Return exactly:
{
  "idea": "one-line startup concept",
  "problem": "specific problem being solved",
  "solution": "how it solves it",
  "market": "who pays for this",
  "why_now": "why this moment specifically",
  "hardest_assumption": "the one thing that must be true for this to work"
}
```

### Call 3 — Stress test

**System prompt:**
```
You are a skeptical VC partner stress-testing a startup idea.
Respond ONLY with valid JSON. No explanation. No markdown. No preamble.
```

**User prompt:**
```
Startup idea: "${idea.idea}"
Solution: "${idea.solution}"

Argue against this idea. Return exactly:
{
  "fatal_flaw": "the single biggest reason this fails",
  "market_risk": "why the market might not pay",
  "existing_solution": "what already exists that competes",
  "what_must_be_true": "the assumption that, if wrong, kills everything"
}
```

### Deliverable
`gemini.js` exports `clusterPosts()`, `generateIdea()`, `stressTest()`. All handle parse failures gracefully.

---

## Phase 4 — Results Page UI (Minutes 40–55)

**Goal:** `results.html` renders feed, bubbles, idea card, drawer.

### Layout structure
```
[ Navbar: PainMap logo + domain tag + "X pain signals found" ]
─────────────────────────────────────────────────────────────
[ LEFT PANEL 40% ]          [ RIGHT PANEL 60% ]
  Quote feed                  Bubble cluster map
  (scrollable)                (SVG canvas)
─────────────────────────────────────────────────────────────
[ IDEA CARD — slides up from bottom on bubble click ]
─────────────────────────────────────────────────────────────
[ SAVED INSIGHTS DRAWER — slides in from right ]
```

### Quote feed (in `ui.js`)
- Cards stagger in with 120ms delay each
- Each card shows: quote text (monospace) + source badge (HN orange / Reddit red) + faint score
- Cards are NOT clickable — they're evidence, not navigation

### Bubble map (in `ui.js`)
```js
// SVG-based, no canvas dependency
function renderBubbles(clusters, posts) {
  clusters.forEach(cluster => {
    const size = BASE_SIZE + (cluster.quotes.length * 14)
    // position using simple force-spread algorithm
    // glow intensity tied to intensity field: high=strong, low=dim
    // click → fires generateIdea(cluster)
  })
}
```

Bubble sizing — deterministic:
```js
const BASE_SIZE = 50
size = BASE_SIZE + (quoteCount * 14)
// max ~120px for largest cluster
```

### Loading stages (in `ui.js`)
```js
const STAGES = [
  { text: "Scanning the internet for pain…",    duration: 0 },
  { text: "Detecting complaint patterns…",       duration: 2200 },
  { text: "Mapping opportunity spaces…",         duration: 4500 },
]
// Stage text replaces in top status bar with fade transition
```

### Idea card (in `ui.js`)
- Fixed bottom panel, hidden by default (`transform: translateY(100%)`)
- On bubble click → slides up (`transform: translateY(0)`)
- Front face: idea, problem, solution, market, why now, hardest assumption
- Back face (stress test): fatal flaw, market risk, existing solution, what must be true
- Flip triggered by button — 1.2s delay + "Challenging assumptions…" text first

### Save Insight (in `app.js` + `ui.js`)
```js
// Save button on idea card
let savedInsights = []
function saveInsight(idea) {
  savedInsights.push({ ...idea, savedAt: Date.now() })
  updateDrawer()
}
```
Drawer shows saved cards in reverse chronological order. `×` removes individual items.

### Deliverable
Full results page renders. Bubbles clickable. Idea card animates. Drawer opens/closes. Stress test flips card.

---

## Phase 5 — Polish + Demo Prep (Minutes 55–60)

**Goal:** Nothing looks broken. Demo sequence rehearsed.

### Tasks
- [ ] Test with "Freelance Payments" chip — full flow end to end
- [ ] Test Reddit failure — confirm no errors shown
- [ ] Test gibberish input — confirm suggestion shown
- [ ] Verify idea card stress test delay feels right (1.2s)
- [ ] Add `painmap.netlify.app` deploy via drag-and-drop (2 minutes)
- [ ] Rehearse 30-second demo sequence (see below)

### The 30-second demo sequence
```
1. Open landing → click "Freelance Payments" chip
2. Watch quotes stream into feed (point: "these are real complaints")
3. Bubbles form on the right (point: "AI grouped them by theme")
4. Click the biggest bubble
5. Idea card slides up (point: "grounded in actual pain, not hallucination")
6. Hit stress test → card flips (point: "we pressure-test our own ideas")
7. Hit Save Insight → drawer opens (point: "it's a tool, not a demo")
```

---

## Failure Mode Cheatsheet

| What breaks | What happens | What user sees |
|---|---|---|
| Reddit CORS blocked | `catch {}` swallows error | Nothing — HN results show normally |
| Gemini returns bad JSON | `try/catch` → fallback grouping | Flat list of posts instead of bubbles |
| HN returns < 5 results | Widen query, remove domain prefix | Spinner slightly longer |
| Gibberish input | Layer 1 blocks instantly | Suggestion text below input |
| Gemini rate limit hit | Retry once after 2s | "Thinking…" stays visible briefly |
| All queries noisy | Show "try a more specific domain" | Clean error state, input resets |

---

## Time Budget

| Phase | Task | Minutes |
|---|---|---|
| 0 | Setup + skeleton | 0–5 |
| 1 | Landing page UI | 5–18 |
| 2 | Data layer | 18–30 |
| 3 | Gemini layer | 30–40 |
| 4 | Results page UI | 40–55 |
| 5 | Polish + deploy | 55–60 |

**Total: 60 minutes. No buffer needed if phases are followed in order.**

---

*PainMap — built at Antigravity Hackathon*