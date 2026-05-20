/* ============================================================
   PAINMAP — ui.js
   Rendering · Animations · Bubbles · Cards · Drawer
   ============================================================ */

'use strict';

// ─── LOADING STAGES ──────────────────────────────────────────
const STAGES = [
    { text: 'Scanning the internet for pain…', delay: 0 },
    { text: 'Detecting complaint patterns…', delay: 2400 },
    { text: 'Mapping opportunity spaces…', delay: 4800 }
];

let stageTimer = null;
let stageIndex = 0;
let ideaDismissBound = false;

function startLoadingStages() {
    const el = document.getElementById('stageText');
    if (!el) return;
    stageIndex = 0;
    _updateStage(el);
}

function _updateStage(el) {
    if (stageIndex >= STAGES.length) return;
    const stage = STAGES[stageIndex];
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = stage.text;
        el.style.opacity = '1';
    }, 200);
    stageIndex++;
    if (stageIndex < STAGES.length) {
        stageTimer = setTimeout(() => _updateStage(el), STAGES[stageIndex].delay - stage.delay + 200);
    }
}

function stopLoadingStages() {
    clearTimeout(stageTimer);
    const el = document.getElementById('stageText');
    if (el) { el.style.opacity = '0'; }
}

// ─── QUOTE FEED ──────────────────────────────────────────────
/**
 * Animate quote cards into the feed panel, staggered.
 * @param {Array} posts - normalized post objects
 */
function renderFeed(posts) {
    const container = document.getElementById('quoteFeed');
    if (!container) return;

    container.innerHTML = '';

    // Remove skeletons if any
    const skeletons = document.getElementById('feedSkeletons');
    if (skeletons) skeletons.remove();

    posts.forEach((post, i) => {
        const card = _buildQuoteCard(post, i);
        card.style.animationDelay = `${i * 110}ms`;
        container.appendChild(card);
    });

    // Update count in navbar
    const countEl = document.getElementById('signalCount');
    if (countEl) {
        countEl.innerHTML = `<strong>${posts.length}</strong> signals found`;
    }
}

function _buildQuoteCard(post, index) {
    const card = document.createElement('div');
    card.className = 'quote-card';
    card.setAttribute('data-index', index);

    const badge = post.source === 'HN'
        ? `<span class="source-badge hn">HN</span>`
        : `<span class="source-badge reddit">Reddit</span>`;

    card.innerHTML = `
    <div class="quote-header">
      ${badge}
      ${post.score > 0 ? `<span class="quote-score">↑${post.score}</span>` : ''}
    </div>
    <p class="quote-text">${escapeHTML(post.text)}</p>
    <a class="quote-link" href="${post.url}" target="_blank" rel="noopener">
      View source ↗
    </a>
  `;

    return card;
}

// ─── BUBBLE MAP ──────────────────────────────────────────────
const BUBBLE_BASE = 52;
const BUBBLE_STEP = 13;
const BUBBLE_MAX = 130;
const INTENSITY_GLOW = { high: 0.55, medium: 0.32, low: 0.16 };

/**
 * Render cluster bubbles on SVG canvas.
 * Sizing is deterministic (count-based), glow is intensity-based.
 * @param {Array} clusters
 * @param {Array} posts
 */
function renderBubbles(clusters, posts) {
    const container = document.getElementById('bubbleMap');
    if (!container) return;

    container.innerHTML = '';
    stopLoadingStages();

    // Hide cluster placeholder
    const placeholder = document.getElementById('bubblePlaceholder');
    if (placeholder) placeholder.style.display = 'none';

    const W = container.offsetWidth || 520;
    const H = container.offsetHeight || 420;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.overflow = 'visible';

    // Defs for glow filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
    <filter id="glow-high">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <filter id="glow-medium">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <filter id="glow-low">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  `;
    svg.appendChild(defs);

    // Compute positions using simple spread layout
    const positions = _computePositions(clusters.length, W, H);

    clusters.forEach((cluster, i) => {
        const pos = positions[i];
        const radius = Math.min(BUBBLE_BASE + (cluster.count * BUBBLE_STEP), BUBBLE_MAX);
        const glow = INTENSITY_GLOW[cluster.intensity] || 0.25;
        const filter = `glow-${cluster.intensity || 'medium'}`;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'bubble-group');
        group.setAttribute('data-cluster-index', i);
        group.style.cursor = 'pointer';
        group.style.animation = `popIn 0.5s ${i * 140}ms cubic-bezier(0.34,1.56,0.64,1) both`;

        // Outer glow ring
        const glowCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glowCircle.setAttribute('cx', pos.x);
        glowCircle.setAttribute('cy', pos.y);
        glowCircle.setAttribute('r', radius + 10);
        glowCircle.setAttribute('fill', `rgba(249,115,22,${glow * 0.4})`);
        glowCircle.setAttribute('filter', `url(#${filter})`);

        // Main circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', `rgba(249,115,22,${glow})`);
        circle.setAttribute('stroke', `rgba(249,115,22,0.5)`);
        circle.setAttribute('stroke-width', '1.5');

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', pos.x);
        label.setAttribute('y', pos.y);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#f0f0f0');
        const labelFont = _getLabelFontSize(radius, cluster.label);
        label.setAttribute('font-size', String(labelFont));
        label.setAttribute('font-family', 'Syne, sans-serif');
        label.setAttribute('font-weight', '700');
        label.setAttribute('class', 'bubble-label');

        const labelLines = _splitLabel(cluster.label, radius);
        const lineHeight = labelFont * 1.15;
        const startY = pos.y - ((labelLines.length - 1) * lineHeight) / 2;
        labelLines.forEach((line, idx) => {
          const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('x', pos.x);
          tspan.setAttribute('y', startY + (idx * lineHeight));
          tspan.textContent = line;
          label.appendChild(tspan);
        });

        // Count sub-label
        const countLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        countLabel.setAttribute('x', pos.x);
        const countOffset = (labelLines.length * lineHeight) / 2 + (labelFont * 0.7);
        const maxCountY = pos.y + radius - 10;
        const countY = Math.min(pos.y + countOffset, maxCountY);
        countLabel.setAttribute('y', countY);
        countLabel.setAttribute('text-anchor', 'middle');
        countLabel.setAttribute('fill', 'rgba(249,115,22,0.85)');
        countLabel.setAttribute('font-size', String(Math.max(9, Math.floor(labelFont * 0.7))));
        countLabel.setAttribute('font-family', 'Syne, sans-serif');
        countLabel.textContent = `${cluster.count} signal${cluster.count !== 1 ? 's' : ''}`;

        group.appendChild(glowCircle);
        group.appendChild(circle);
        group.appendChild(label);
        group.appendChild(countLabel);

        // Hover effect
        group.addEventListener('mouseenter', () => {
            circle.setAttribute('fill', `rgba(249,115,22,${Math.min(glow + 0.2, 0.85)})`);
            circle.setAttribute('r', radius + 4);
        });
        group.addEventListener('mouseleave', () => {
            circle.setAttribute('fill', `rgba(249,115,22,${glow})`);
            circle.setAttribute('r', radius);
        });

        // Click → generate idea
        group.addEventListener('click', () => {
            _highlightBubble(group, svg);
            window.APP.handleClusterClick(cluster);
        });

        svg.appendChild(group);
    });

    container.appendChild(svg);
}

function _computePositions(count, W, H) {
    const positions = [];
    const cx = W / 2;
    const cy = H / 2;

    if (count === 1) {
        return [{ x: cx, y: cy }];
    }
    if (count === 2) {
        return [{ x: cx - 120, y: cy }, { x: cx + 120, y: cy }];
    }

    // Distribute evenly around an ellipse, slightly offset
    const rx = W * 0.32;
    const ry = H * 0.30;
    const offsets = [0, 0.15, -0.1, 0.08, -0.15]; // slight irregularity

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + (offsets[i] || 0);
        positions.push({
            x: cx + rx * Math.cos(angle),
            y: cy + ry * Math.sin(angle)
        });
    }

    return positions;
}

function _splitLabel(label, radius) {
  const safeLabel = (label || '').trim();
  const words = safeLabel.split(/\s+/).filter(Boolean);
  if (radius < 55) return [words[0] || safeLabel || 'Signal'];
  if (radius < 75) {
    if (words.length === 2) return [words[0], words[1]];
    if (words.length === 3) return [`${words[0]} ${words[1]}`, words[2]];
    const short = safeLabel.length > 14 ? safeLabel.slice(0, 13) + '…' : safeLabel;
    return [short];
  }

  if (words.length <= 2) return [safeLabel];
  if (words.length === 3) {
    return [`${words[0]} ${words[1]}`, words[2]];
  }

  const lineOne = `${words[0]} ${words[1]}`;
  const lineTwo = words.slice(2).join(' ');
  return [_trimLine(lineOne, 18), _trimLine(lineTwo, 18)];
}

function _trimLine(line, maxLen) {
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen - 1) + '…';
}

function _getLabelFontSize(radius, label) {
  const text = (label || '').trim();
  let size = radius > 90 ? 15 : radius > 70 ? 13 : 11;
  if (radius < 70) size -= 1;
  if (text.length > 16) size -= 1;
  if (text.length > 22) size -= 1;
  if (text.length > 28) size -= 1;
  return Math.max(8, size);
}

function _highlightBubble(activeGroup, svg) {
    // Dim all other bubbles
    svg.querySelectorAll('.bubble-group').forEach(g => {
        g.style.opacity = g === activeGroup ? '1' : '0.35';
    });
}

function hideIdeaPanel() {
  const panel = document.getElementById('ideaPanel');
  if (!panel) return;
  panel.classList.remove('visible');
}

function bindIdeaDismiss() {
  if (ideaDismissBound) return;
  ideaDismissBound = true;

  document.addEventListener('mousedown', (event) => {
    const panel = document.getElementById('ideaPanel');
    if (!panel || !panel.classList.contains('visible')) return;

    const insidePanel = panel.contains(event.target);
    const onBubble = event.target.closest && event.target.closest('.bubble-group');
    const onAction = event.target.closest && event.target.closest('#saveInsightBtn, #stressTestBtn');

    if (!insidePanel && !onBubble && !onAction) {
      hideIdeaPanel();
    }
  });
}

// ─── IDEA CARD ───────────────────────────────────────────────
/**
 * Show loading state in idea panel.
 */
function showIdeaLoading(cluster) {
    const panel = document.getElementById('ideaPanel');
    if (!panel) return;

    panel.classList.add('visible');
  bindIdeaDismiss();
    panel.innerHTML = `
    <div class="idea-loading">
      <div class="spinner"></div>
      <span>Generating idea for <strong>${escapeHTML(cluster.label)}</strong>…</span>
    </div>
  `;
}

/**
 * Render the idea card (front face).
 */
function renderIdeaCard(idea, cluster) {
    const panel = document.getElementById('ideaPanel');
    if (!panel) return;

    panel.classList.add('visible');
  bindIdeaDismiss();
    panel.innerHTML = `
    <div class="idea-card" id="ideaCard">

      <!-- Card front -->
      <div class="idea-face idea-front" id="ideaFront">

        <div class="idea-card-header">
          <div class="idea-cluster-tag">
            <span class="pulse-dot"></span>
            ${escapeHTML(cluster.label)}
          </div>
          <div class="idea-actions">
            <button class="btn btn-ghost btn-sm" id="saveInsightBtn" onclick="handleSaveInsight()">
              ＋ Save Insight
            </button>
            <button class="btn btn-danger btn-sm" id="stressTestBtn" onclick="handleStressTestClick()">
              ⚡ Stress Test
            </button>
          </div>
        </div>

        <h2 class="idea-title">${escapeHTML(idea.idea)}</h2>

        <div class="idea-fields">
          <div class="idea-field">
            <div class="idea-field-label">The Problem</div>
            <div class="idea-field-value">${escapeHTML(idea.problem)}</div>
          </div>
          <div class="idea-field">
            <div class="idea-field-label">The Solution</div>
            <div class="idea-field-value">${escapeHTML(idea.solution)}</div>
          </div>
          <div class="idea-field">
            <div class="idea-field-label">Market</div>
            <div class="idea-field-value">${escapeHTML(idea.market)}</div>
          </div>
          <div class="idea-field">
            <div class="idea-field-label">Why Now</div>
            <div class="idea-field-value">${escapeHTML(idea.why_now)}</div>
          </div>
          <div class="idea-field idea-field--warning">
            <div class="idea-field-label">Hardest Assumption</div>
            <div class="idea-field-value">${escapeHTML(idea.hardest_assumption)}</div>
          </div>
        </div>

      </div>

      <!-- Card back (stress test, hidden until triggered) -->
      <div class="idea-face idea-back" id="ideaBack" style="display:none;">
        <div class="stress-loading" id="stressLoading">
          <div class="spinner"></div>
          <span>Challenging assumptions…</span>
        </div>
        <div class="stress-result" id="stressResult" style="display:none;"></div>
      </div>

    </div>
  `;
}

/**
 * Show stress test loading (with deliberate delay for UX).
 */
function showStressTestLoading() {
    const front = document.getElementById('ideaFront');
    const back = document.getElementById('ideaBack');
    if (!front || !back) return;

    // Flip card
    front.style.display = 'none';
    back.style.display = 'flex';
    back.style.animation = 'fadeIn 0.3s ease both';
}

/**
 * Render stress test result on back of card.
 */
function renderStressResult(result) {
    const loadingEl = document.getElementById('stressLoading');
    const resultEl = document.getElementById('stressResult');
    if (!loadingEl || !resultEl) return;

    loadingEl.style.display = 'none';
    resultEl.style.display = 'block';

    const verdictColor = {
        pass: '#22c55e',
        risky: '#f97316',
        hard_pass: '#ef4444'
    };
    const verdictLabel = {
        pass: '✓ Worth exploring',
        risky: '⚠ Proceed with caution',
        hard_pass: '✕ Hard pass'
    };

    const vColor = verdictColor[result.verdict] || '#f97316';
    const vLabel = verdictLabel[result.verdict] || result.verdict;

    resultEl.innerHTML = `
    <div class="stress-header">
      <div class="stress-title">Stress Test Results</div>
      <div class="stress-verdict" style="color: ${vColor}; border-color: ${vColor}33; background: ${vColor}11;">
        ${vLabel}
      </div>
    </div>

    <div class="stress-fields">
      <div class="stress-field stress-field--danger">
        <div class="stress-field-label">Fatal Flaw</div>
        <div class="stress-field-value">${escapeHTML(result.fatal_flaw)}</div>
      </div>
      <div class="stress-field">
        <div class="stress-field-label">Market Risk</div>
        <div class="stress-field-value">${escapeHTML(result.market_risk)}</div>
      </div>
      <div class="stress-field">
        <div class="stress-field-label">Existing Competition</div>
        <div class="stress-field-value">${escapeHTML(result.existing_solution)}</div>
      </div>
      <div class="stress-field stress-field--warning">
        <div class="stress-field-label">What Must Be True</div>
        <div class="stress-field-value">${escapeHTML(result.what_must_be_true)}</div>
      </div>
    </div>

    <button class="btn btn-ghost btn-sm" style="margin-top:16px;" onclick="flipCardBack()">
      ← Back to Idea
    </button>
  `;
}

// ─── CARD FLIP BACK ──────────────────────────────────────────
window.flipCardBack = function () {
    const front = document.getElementById('ideaFront');
    const back = document.getElementById('ideaBack');
    if (!front || !back) return;
    back.style.display = 'none';
    front.style.display = 'block';
    front.style.animation = 'fadeIn 0.3s ease both';
};

// ─── STRESS TEST CLICK ───────────────────────────────────────
window.handleStressTestClick = function () {
    const btn = document.getElementById('stressTestBtn');
    if (btn) btn.disabled = true;
    window.APP.handleStressTest();
};

// ─── SAVE INSIGHT CLICK ──────────────────────────────────────
window.handleSaveInsight = function () {
    const clusters = window.APP.getClusters();
    const posts = window.APP.getPosts();
    const idea = window.APP.currentIdea
        || window._lastRenderedIdea;

    // Grab current idea from last rendered card
    const titleEl = document.querySelector('.idea-title');
    if (!titleEl) return;

    // Build minimal idea object from DOM (safe fallback)
    const ideaObj = window._lastRenderedIdea || { idea: titleEl.textContent };
    const clusterTag = document.querySelector('.idea-cluster-tag');
    const clusterLabel = clusterTag ? clusterTag.textContent.trim() : 'Unknown';

    window.APP.saveInsight(ideaObj, clusterLabel);
};

// ─── SAVED INSIGHTS DRAWER ───────────────────────────────────
/**
 * Called when savedInsights array changes.
 * Rebuilds drawer content.
 */
window.onInsightSaved = function (insights) {
    const countEl = document.getElementById('drawerCount');
    if (countEl) countEl.textContent = insights.length;

    const drawer = document.getElementById('insightsDrawer');
    if (!drawer) return;

    const list = drawer.querySelector('.drawer-list');
    if (!list) return;

    if (insights.length === 0) {
        list.innerHTML = `
      <div class="drawer-empty">
        <div style="font-size:28px;margin-bottom:10px;">🗂</div>
        <div>No saved insights yet.</div>
        <div style="color:var(--text-tertiary);margin-top:4px;font-size:11px;">
          Click "Save Insight" on any idea card.
        </div>
      </div>
    `;
        return;
    }

    list.innerHTML = insights.map(ins => `
    <div class="drawer-item" id="insight-${ins.id}">
      <div class="drawer-item-header">
        <span class="drawer-item-domain">${escapeHTML(ins.domain)}</span>
        <span class="drawer-item-time">${ins.savedAt}</span>
        <button class="drawer-item-remove" onclick="APP.removeInsight(${ins.id})" title="Remove">×</button>
      </div>
      <div class="drawer-item-cluster">${escapeHTML(ins.cluster)}</div>
      <div class="drawer-item-idea">${escapeHTML(ins.idea.idea || '')}</div>
      ${ins.idea.why_now ? `<div class="drawer-item-why">${escapeHTML(ins.idea.why_now)}</div>` : ''}
    </div>
  `).join('');
};

window.toggleDrawer = function () {
    const drawer = document.getElementById('insightsDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (!drawer) return;
    const isOpen = drawer.classList.contains('open');
    drawer.classList.toggle('open', !isOpen);
    if (overlay) overlay.classList.toggle('visible', !isOpen);
};

window.closeDrawer = function () {
    const drawer = document.getElementById('insightsDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
};

// ─── STATE CHANGE HANDLER ────────────────────────────────────
/**
 * Called by app.js on every state transition.
 * Maps states to visual changes.
 */
window.onStateChange = function (state, payload) {
    const statusBar = document.getElementById('statusBar');
    const loadingZone = document.getElementById('loadingZone');
    const resultsZone = document.getElementById('resultsZone');

    switch (state) {
        case 'FETCHING':
            if (loadingZone) loadingZone.style.display = 'flex';
            if (resultsZone) resultsZone.style.display = 'none';
            startLoadingStages();
            break;

        case 'CLUSTERING':
            // Feed is already rendering — just update stage text
            const el = document.getElementById('stageText');
            if (el) {
                el.style.opacity = '0';
                setTimeout(() => {
                    el.textContent = 'Detecting complaint patterns…';
                    el.style.opacity = '1';
                }, 200);
            }
            break;

        case 'RESULTS':
            if (loadingZone) loadingZone.style.display = 'none';
            if (resultsZone) {
                resultsZone.style.display = 'grid';
                resultsZone.style.animation = 'fadeIn 0.4s ease both';
            }
            break;

        case 'IDLE':
            if (payload.error === 'no_results') {
                showNoResults(payload.domain);
            }
            break;
    }
};

function showNoResults(domain) {
    const loadingZone = document.getElementById('loadingZone');
    const resultsZone = document.getElementById('resultsZone');
    if (loadingZone) loadingZone.style.display = 'none';
    if (resultsZone) {
        resultsZone.style.display = 'grid';
        const feed = document.getElementById('quoteFeed');
        if (feed) feed.innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px;margin-bottom:12px;">🔍</div>
        <div class="empty-state-title">No signals found</div>
        <div class="empty-state-sub">
          Try a more specific domain or choose from the popular chips.
        </div>
        <a href="index.html" class="btn btn-ghost" style="margin-top:16px;">← Try another domain</a>
      </div>
    `;
    }
}

// ─── SKELETONS ───────────────────────────────────────────────
function renderFeedSkeletons(count = 5) {
    const container = document.getElementById('quoteFeed');
    if (!container) return;
    container.innerHTML = Array(count).fill(0).map(() => `
    <div class="quote-card-skeleton">
      <div class="skeleton" style="width:50px;height:16px;margin-bottom:10px;"></div>
      <div class="skeleton" style="width:100%;height:12px;margin-bottom:6px;"></div>
      <div class="skeleton" style="width:88%;height:12px;margin-bottom:6px;"></div>
      <div class="skeleton" style="width:72%;height:12px;"></div>
    </div>
  `).join('');
}

// ─── UTILS ───────────────────────────────────────────────────
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── EXPOSE ──────────────────────────────────────────────────
window.UI = {
    renderFeed,
    renderBubbles,
    renderIdeaCard,
    showIdeaLoading,
    showStressTestLoading,
    renderStressResult,
    renderFeedSkeletons,
    startLoadingStages,
    stopLoadingStages,
    escapeHTML
};

// Bind render functions to window so app.js can call them
window.renderFeed = renderFeed;
window.renderBubbles = renderBubbles;
window.renderIdeaCard = renderIdeaCard;
window.showIdeaLoading = showIdeaLoading;
window.showStressTestLoading = showStressTestLoading;
window.renderStressResult = renderStressResult;