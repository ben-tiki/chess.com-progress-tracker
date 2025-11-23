import { niceCount } from '../utils.js';

// GENERAL UI
// --------------------------------------
export function updateTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
  const el = document.getElementById('timezone');
  el.textContent = `Timezone: ${tz}`;
}

export function bindFilterChips(onChange) {
  const buttons = document.querySelectorAll('.segment, .chip.filter');
  const handleClick = (btn) => {
    const group = btn.dataset.filter;
    document.querySelectorAll(`[data-filter="${group}"]`).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    onChange(group, btn.dataset.value);
  };
  buttons.forEach((btn) => btn.addEventListener('click', () => handleClick(btn)));
}

export function updateLoading({ active, message, progress, total }) {
  const status = document.getElementById('status');
  const barWrap = document.getElementById('progress');
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');
  status.textContent = message || '';
  if (active) {
    barWrap.hidden = false;
    const pct = total ? Math.round((progress / total) * 100) : 0;
    bar.style.width = `${pct}%`;
    text.textContent = `${pct}%`;
  } else {
    barWrap.hidden = true;
  }
}

// KPI RENDERING
// --------------------------------------
export function renderKPIs({ currentRatings, peakRatings, totalGames, overallRate }) {
  const set = (id, value, meta = '') => {
    const el = document.querySelector(`#${id} .kpi-value`);
    const m = document.querySelector(`#${id} .kpi-meta`);
    el.textContent = (value ?? '\u2014');
    m.textContent = meta;
  };
  set('kpi-current-rating', currentRatings, 'From stats if available');
  set('kpi-peak-rating', peakRatings, 'Across selected controls');
  set('kpi-total-games', niceCount(totalGames));
  set('kpi-win-rate', `${(overallRate * 100).toFixed(1)}%`);
}
