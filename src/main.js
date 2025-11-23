import { parseQuery, updateQuery, sanitizeUsername, tzName } from './utils.js';
import { STATE, subscribe, setUser, setControls, setFilters, setProfile, setStats, setGames, resetData } from './state.js';
import { getProfile, getStats, getAllGames } from './api.js';
import { normalizeGame } from './parsers.js';
import { filterGames, restrictByDateRange, ratingTimelineBoth, outcomeBreakdown } from './transform.js';
import { updateTimezone, bindFilterChips, renderKPIs, updateLoading } from './ui/ui.js';
import { renderRatingTimeline } from './charts/ratingTimelineChartjs.js';

// HELPERS
// --------------------------------------
function qs(sel) {
  return document.querySelector(sel);
}

// INITIALIZATION
// --------------------------------------
function initFormFromQuery() {
  const { user, controls } = parseQuery();
  if (user) {
    qs('#username').value = user;
  }
  const checks = document.querySelectorAll('input[name="controls"]');
  const cset = new Set(controls.length ? controls : ['blitz', 'rapid']);
  checks.forEach((c) => {
    c.checked = cset.has(c.value);
  });
}

// CORE LOGIC
// --------------------------------------
async function analyze(username, controlsArr) {
  resetData();
  setUser(username);
  setControls(controlsArr);
  updateQuery({ user: username, controls: controlsArr });
  qs('#status').textContent = 'Loading profile...';
  try {
    const [profile, stats] = await Promise.all([getProfile(username), getStats(username)]);
    setProfile(profile || null);
    setStats(stats || null);
  } catch (_) { /* handled in api */ }

  const controlsSet = new Set(controlsArr);
  let analyzed = 0, skipped = 0;
  const all = await getAllGames(username, controlsSet, () => {});
  const normalized = [];
  for (const game of all) {
    try {
      normalized.push(normalizeGame(game, username));
      analyzed += 1;
    } catch {
      skipped += 1;
    }
  }
  setGames(normalized);
  qs('#status').textContent = `Analyzed ${analyzed} games${skipped ? `, skipped ${skipped}` : ''}.`;
  renderAll();
}

function selectedControls() {
  const checks = document.querySelectorAll('input[name="controls"]:checked');
  return Array.from(checks).map((c) => c.value);
}

function wireForm() {
  const form = qs('#search-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const username = sanitizeUsername(qs('#username').value);
    if (!username || /[^a-z0-9_-]/i.test(username)) {
      qs('#status').textContent = 'Please enter a valid Chess.com username.';
      qs('#username').focus();
      return;
    }
    const controls = selectedControls();
    if (!controls.length) {
      qs('#status').textContent = 'Select at least one time control.';
      return;
    }
    analyze(username, controls);
  });
}

function deriveRatingsFromStats(stats, controls) {
  if (!stats) {
    return { current: null, peak: null };
  }
  let current = [], peak = [];
  for (const tc of controls) {
    const key = `chess_${tc}`;
    const s = stats[key];
    if (s?.last?.rating) {
      current.push(s.last.rating);
    }
    if (s?.best?.rating) {
      peak.push(s.best.rating);
    }
  }
  return {
    current: current.length ? Math.round(current.reduce((a, b) => a + b, 0) / current.length) : null,
    peak: peak.length ? Math.max(...peak) : null
  };
}

// RENDERING
// --------------------------------------
function renderAll() {
  const controls = Array.from(STATE.controls);
  const base = restrictByDateRange(filterGames(STATE.data.games, STATE.filters), STATE.filters.range);
  const byControl = new Map(Object.entries(groupByTC(base)));

  // KPIs
  const { current, peak } = deriveRatingsFromStats(STATE.data.stats, controls);
  const overall = outcomeBreakdown(base);
  renderKPIs({ currentRatings: current, peakRatings: peak, totalGames: base.length, overallRate: overall.rate });

  // Charts
  const rtBoth = ratingTimelineBoth(byControl);
  renderRatingTimeline(document.getElementById('chart-rating'), rtBoth);
}

function groupByTC(games) {
  const by = {};
  for (const game of games) {
    (by[game.timeClass] ||= []).push(game);
  }
  return by;
}

// EVENT HANDLERS
// --------------------------------------
function bindFilters() {
  bindFilterChips((group, value) => {
    if (group === 'color') {
      setFilters({ color: value });
    }
    if (group === 'range') {
      setFilters({ range: value });
    }
    renderAll();
  });
}

function bindExportButton() {
  const btn = document.getElementById('btn-export-csv');
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    if (!STATE.data.games || !STATE.data.games.length) {
      return;
    }
    
    // Get currently filtered games
    const filtered = restrictByDateRange(filterGames(STATE.data.games, STATE.filters), STATE.filters.range);
    if (!filtered.length) {
      const original = btn.textContent;
      btn.textContent = 'No data';
      setTimeout(() => btn.textContent = original, 2000);
      return;
    }

    // Sort by date
    const sorted = [...filtered].sort((a, b) => a.endTime - b.endTime);

    // Build TSV (Tab Separated Values) for easy spreadsheet pasting
    const header = ['Date', 'Time Control', 'Rating', 'Result', 'Opponent', 'Opponent Rating', 'URL'];
    const rows = sorted.map(game => {
      // game.endTime is a Date object from parsers.js
      const d = game.endTime;
      // Format as YYYY-MM-DD HH:mm:ss for spreadsheet compatibility
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      
      return [
        dateStr,
        game.timeClass,
        game.ourRating,
        game.result,
        game.opponent,
        game.oppRating,
        game.url
      ].join('\t');
    });
    
    const csv = [header.join('\t'), ...rows].join('\n');
    
    navigator.clipboard.writeText(csv).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = original, 2000);
    }).catch(err => {
      console.error(err);
      btn.textContent = 'Error';
    });
  });
}

function observeState() {
  updateLoading(STATE.loading);
}

// BOOTSTRAP
// --------------------------------------
function bootstrap() {
  updateTimezone();
  initFormFromQuery();
  wireForm();
  bindFilters();
  bindExportButton();

  const tz = tzName();
  document.getElementById('timezone').textContent = `Timezone: ${tz}`;

  const { user, controls } = parseQuery();
  if (user) {
    const c = controls.length ? controls : ['blitz','rapid'];
    analyze(user, c);
  }
  // subscribe to loading state
  subscribe(observeState);
}

bootstrap();
