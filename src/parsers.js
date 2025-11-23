import { toLocalDate } from './utils.js';

// PGN PARSING
// --------------------------------------
function parsePgnTags(pgn) {
  const tags = {};
  if (!pgn) {
    return tags;
  }
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(pgn))) {
    tags[m[1]] = m[2];
  }
  return tags;
}

function normalizeResult(result, username, white, black) {
  // Chess.com results: win, checkmated, resigned, timeout, agreed, repitition, stalemate, timevsinsufficient, etc.
  // Determine our outcome
  const selfColor = white.username.toLowerCase() === username ? 'white' : 'black';
  const ourRes = (selfColor === 'white' ? white.result : black.result) || '';
  if (ourRes === 'win') {
    return 'win';
  }
  if (ourRes === 'agreed' || ourRes === 'stalemate' || ourRes.startsWith('repetition') || ourRes.includes('insufficient')) {
    return 'draw';
  }
  if (ourRes === 'timeout' && (selfColor === 'white' ? black.result : white.result).includes('insufficient')) {
    return 'draw';
  }
  if (ourRes) {
    return 'loss';
  }
  return 'unknown';
}

// GAME NORMALIZATION
// --------------------------------------

export function normalizeGame(game, username) {
  const user = username.toLowerCase();
  const pgnTags = parsePgnTags(game.pgn || '');
  const endDate = toLocalDate(game.end_time || pgnTags.Date || 0);
  const selfIsWhite = game.white?.username?.toLowerCase() === user;
  const ourRating = selfIsWhite ? Number(game.white?.rating || pgnTags.WhiteElo || 0) : Number(game.black?.rating || pgnTags.BlackElo || 0);
  const oppRating = selfIsWhite ? Number(game.black?.rating || 0) : Number(game.white?.rating || 0);
  const selfColor = selfIsWhite ? 'white' : 'black';
  const outcome = normalizeResult(null, user, game.white || {}, game.black || {});
  const timeClass = game.time_class || (pgnTags.Event || '').toLowerCase();
  const opp = selfIsWhite ? (game.black?.username || '') : (game.white?.username || '');
  const day = endDate.getDay();
  const hour = endDate.getHours();
  return {
    id: game.uuid || `${game.url || game.pgn?.slice(0, 32)}`,
    url: game.url,
    endTime: endDate,
    timeClass,
    color: selfColor,
    result: outcome,
    ourRating: ourRating || null,
    oppRating: oppRating || null,
    ratingDiff: (ourRating && oppRating) ? (ourRating - oppRating) : null,
    white: game.white?.username || '',
    black: game.black?.username || '',
    opponent: opp,
    pgn: game.pgn || null,
    accuracies: game.accuracies || null,
    weekday: day,
    hour,
    monthKey: `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}`,
  };
}



