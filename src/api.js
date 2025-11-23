import { sleep } from './utils.js';
import { setLoading, addError } from './state.js';

// CONSTANTS & GLOBALS
// --------------------------------------
const API = 'https://api.chess.com/pub';

// Simple in-session cache
const CACHE = new Map();

// Request queue with basic rate limiting
const QUEUE = [];
let ACTIVE_REQUESTS = 0;
const MAX_ACTIVE = 3; // concurrency
const MIN_GAP_MS = 250; // spacing
let LAST_REQUEST_TIME = 0;

// QUEUE LOGIC
// --------------------------------------
async function runQueue() {
  if (ACTIVE_REQUESTS >= MAX_ACTIVE || QUEUE.length === 0) {
    return;
  }
  const now = Date.now();
  const since = now - LAST_REQUEST_TIME;
  if (since < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - since);
  }
  const job = QUEUE.shift();
  if (!job) {
    return; // queue emptied while we waited
  }
  ACTIVE_REQUESTS += 1;
  LAST_REQUEST_TIME = Date.now();
  try {
    job.resolve(await job.fn());
  } catch (e) {
    job.reject?.(e);
  } finally {
    ACTIVE_REQUESTS = Math.max(0, ACTIVE_REQUESTS - 1);
    runQueue();
  }
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    QUEUE.push({ fn, resolve, reject });
    runQueue();
  });
}

async function fetchJSON(url) {
  if (CACHE.has(url)) {
    return CACHE.get(url);
  }
  const res = await enqueue(async () => {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} for ${url}`);
    }
    return r.json();
  });
  CACHE.set(url, res);
  return res;
}

// API FUNCTIONS
// --------------------------------------
export async function getProfile(username) {
  const url = `${API}/player/${encodeURIComponent(username)}`;
  try {
    return await fetchJSON(url);
  } catch (e) {
    addError(e.message);
    throw e;
  }
}

export async function getStats(username) {
  const url = `${API}/player/${encodeURIComponent(username)}/stats`;
  try {
    return await fetchJSON(url);
  } catch (e) {
    addError(e.message);
    return null;
  }
}

async function getArchives(username) {
  const url = `${API}/player/${encodeURIComponent(username)}/games/archives`;
  try {
    const data = await fetchJSON(url);
    return data.archives || [];
  } catch (e) {
    addError(e.message);
    return [];
  }
}

async function getMonthlyGames(monthUrl) {
  try {
    const data = await fetchJSON(monthUrl);
    return data.games || [];
  } catch (e) {
    addError(e.message);
    return [];
  }
}

export async function getAllGames(username, controls, onProgress) {
  const archives = await getArchives(username);
  const total = archives.length;
  setLoading({ active: true, message: 'Fetching archives…', progress: 0, total });
  const out = [];
  let done = 0;
  for (const url of archives) {
    const games = await getMonthlyGames(url);
    for (const game of games) {
      if (!game.time_class) {
        continue;
      }
      if (controls.size && !controls.has(game.time_class)) {
        continue;
      }
      out.push(game);
    }
    done += 1;
    onProgress?.(done, total);
    setLoading({ active: true, message: `Fetched ${done}/${total} months…`, progress: done, total });
  }
  setLoading({ active: false, message: '', progress: 0, total: 0 });
  return out;
}
