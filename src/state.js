// CONSTANTS & GLOBALS
// --------------------------------------
const SUBSCRIBERS = new Set();

const INITIAL_STATE = {
  user: '',
  controls: new Set(['blitz', 'rapid']),
  filters: { color: 'all', range: 'all', opening: null, oppBucket: 'all' },
  data: { profile: null, stats: null, games: [] },
  cache: new Map(),
  loading: { active: false, message: '', progress: 0, total: 0 },
  errors: [],
};

export const STATE = structuredClone(INITIAL_STATE);

// SUBSCRIPTION
// --------------------------------------
export function subscribe(fn) {
  SUBSCRIBERS.add(fn);
  return () => SUBSCRIBERS.delete(fn);
}

function notify() {
  for (const fn of SUBSCRIBERS) {
    fn(STATE);
  }
}

// ACTIONS
// --------------------------------------
export function resetData() {
  STATE.data = { profile: null, stats: null, games: [] };
  STATE.errors = [];
  notify();
}

export function setUser(user) {
  STATE.user = user;
  notify();
}

export function setControls(controls) {
  STATE.controls = new Set(controls);
  notify();
}

export function setFilters(filters) {
  STATE.filters = { ...STATE.filters, ...filters };
  notify();
}

export function setLoading({ active, message, progress, total }) {
  STATE.loading = { ...STATE.loading, active, message, progress, total };
  notify();
}

export function setProfile(profile) {
  STATE.data.profile = profile;
  notify();
}

export function setStats(stats) {
  STATE.data.stats = stats;
  notify();
}

export function setGames(games) {
  STATE.data.games = games;
  notify();
}

export function addError(err) {
  STATE.errors.push(err);
  notify();
}

