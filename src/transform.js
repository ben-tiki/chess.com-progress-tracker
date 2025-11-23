import { clamp } from './utils.js';

// FILTERS
// --------------------------------------
export function filterGames(games, { color = 'all', range = 'all' }) {
  return games.filter((game) => (color === 'all' || game.color === color) && game.endTime && (range === 'all' || true));
}

export function restrictByDateRange(games, range) {
  if (range === 'all') {
    return games;
  }
  const now = new Date();
  const map = { '1y': 365, '6m': 182, '3m': 91 };
  const limit = new Date(now);
  limit.setDate(now.getDate() - (map[range] || 99999));
  return games.filter((game) => game.endTime >= limit);
}

// TIMELINE LOGIC
// --------------------------------------
function computeTimeline(gamesByControl, startAtLowest = false) {
  const raw = new Map();
  let minRating = Infinity;
  let minDate = null;

  for (const [tc, games] of gamesByControl) {
    const sorted = [...games].filter((game) => game.ourRating).sort((a, b) => a.endTime - b.endTime);
    const points = sorted.map((game) => {
      const t = game.endTime;
      const d = t instanceof Date ? t : (typeof t === 'number' ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t));
      return { date: d, rating: game.ourRating };
    });
    raw.set(tc, points);
    for (const p of points) {
      if (p.rating < minRating || (p.rating === minRating && (!minDate || p.date < minDate))) {
        minRating = p.rating;
        minDate = p.date;
      }
    }
  }

  const series = {};
  const combined = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const [tc, pointsRaw] of raw.entries()) {
    const pts = startAtLowest && minDate ? pointsRaw.filter((p) => p.date >= minDate) : pointsRaw;
    if (!pts.length) {
      series[tc] = { label: tc, points: [], movingAverage: [], best: null, trend: null, forecast: [] };
      continue;
    }
    const ma = movingAvg7d(pts);
    pts.forEach((p, i) => {
      p.ma = ma[i];
    });
    const ratings = pts.map((p) => p.rating);
    const best = ratings.length ? Math.max(...ratings) : null;
    const bestIdx = best != null ? ratings.indexOf(best) : -1;
    const trendData = regressionWithForecast(pts);
    const mlFx = polyRidgeForecast(pts, 1, 1e-2);

    series[tc] = {
      label: tc,
      points: pts,
      movingAverage: ma,
      best: best != null ? { rating: best, date: pts[bestIdx].date } : null,
      trend: trendData?.line || null,
      forecast: trendData?.forecast || [],
      forecastML: mlFx,
    };

    combined.push(...pts.map((p) => ({ date: p.date, rating: p.rating })));
    globalMin = Math.min(globalMin, ...ratings);
    globalMax = Math.max(globalMax, ...ratings);
  }

  const milestones = milestoneMarks(combined);
  const nextThreshold = Math.floor(globalMax / 100) * 100 + 100;
  const maxML = Math.max(
    globalMax,
    ...Object.values(series).flatMap(s => (s.forecastML || []).map(p => p.value))
  );
  const forecastMilestonesML = computeForecastMilestones(Object.values(series).map(s => s.forecastML || []), nextThreshold, maxML);
  return { series, milestones, forecastMilestonesML, yExtent: isFinite(globalMin) ? [globalMin, globalMax] : null };
}

export function ratingTimelineBoth(gamesByControl) {
  return {
    normal: computeTimeline(gamesByControl, false),
    lowest: computeTimeline(gamesByControl, true),
  };
}

function movingAvg7d(points) {
  if (!points.length) {
    return [];
  }
  const out = new Array(points.length);
  let j = 0;
  let sum = 0, cnt = 0;
  for (let i = 0; i < points.length; i++) {
    const curT = points[i].date.getTime();
    const startT = curT - 1000*60*60*24*6; // last 7 days inclusive
    // include current point
    // expand window from previous state
    while (j <= i && points[j].date.getTime() < startT) {
      sum -= points[j].rating; cnt -= 1; j += 1;
    }
    sum += points[i].rating; cnt += 1;
    out[i] = cnt ? sum / cnt : points[i].rating;
  }
  return out;
}

function regressionWithForecast(points) {
  if (points.length < 5) {
    return null;
  }
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const cutoff = new Date(lastDate.getTime() - 1000 * 60 * 60 * 24 * 120); // last ~4 months
  const sample = points.filter((p) => p.date >= cutoff);
  if (sample.length < 5) {
    return null;
  }
  const xs = sample.map((p) => p.date.getTime());
  const ys = sample.map((p) => p.rating);
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXX += xs[i] * xs[i];
    sumXY += xs[i] * ys[i];
  }
  const denom = Math.max(1e-9, n * sumXX - sumX * sumX);
  let slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // clamp slope to avoid unrealistic forecasts (>8 elo/day)
  const maxDaily = 8;
  const maxSlope = maxDaily / (1000 * 60 * 60 * 24);
  slope = clamp(slope, -maxSlope, maxSlope);

  const xStart = firstDate.getTime();
  const xEnd = lastDate.getTime();
  const line = [
    { date: new Date(xStart), value: slope * xStart + intercept },
    { date: new Date(xEnd), value: slope * xEnd + intercept },
  ];
  // No linear forecast returned (we keep trend line only)
  return { line, forecast: [] };
}

function polyRidgeForecast(points, degree = 2, lambda = 1e-2) {
  if (points.length < degree + 2) {
    return [];
  }
  const lastDate = points[points.length - 1].date.getTime();
  const sixMonths = 1000 * 60 * 60 * 24 * 180;
  const sample = points.filter(p => p.date.getTime() >= lastDate - sixMonths);
  if (sample.length < degree + 2) {
    return [];
  }
  const t0 = sample[0].date.getTime();
  const scale = (sample[sample.length - 1].date.getTime() - t0) || 1;
  const xs = sample.map(p => (p.date.getTime() - t0) / scale);
  const ys = sample.map(p => p.rating);
  // Build (degree+1) x (degree+1) Gram matrix and vector
  const k = degree + 1;
  const G = Array.from({ length: k }, () => Array(k).fill(0));
  const v = Array(k).fill(0);
  
  // Weighted Ridge Regression
  // Give more weight to recent games to capture the "current" trend rather than the 6-month average.
  // Weight ramps linearly from 0.1 (oldest) to 1.0 (newest).
  for (let i = 0; i < xs.length; i++) {
    const weight = 0.1 + 0.9 * (i / (xs.length - 1));
    
    const basis = Array(k).fill(0);
    let p = 1;
    for (let d = 0; d < k; d++) { basis[d] = p; p *= xs[i]; }
    
    for (let r = 0; r < k; r++) {
      v[r] += weight * basis[r] * ys[i];
      for (let c = 0; c < k; c++) {
        G[r][c] += weight * basis[r] * basis[c];
      }
    }
  }
  // Ridge (add lambda to diagonal)
  for (let d = 0; d < k; d++) G[d][d] += lambda;
  // Solve G a = v via Gaussian elimination (small k)
  const A = G.map((row, i) => row.concat([v[i]]));
  for (let col = 0; col < k; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return [];
    if (piv !== col) { const tmp = A[col]; A[col] = A[piv]; A[piv] = tmp; }
    // normalize
    const div = A[col][col];
    for (let c = col; c <= k; c++) A[col][c] /= div;
    // eliminate
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      for (let c = col; c <= k; c++) A[r][c] -= factor * A[col][c];
    }
  }
  const coeffs = A.map(row => row[k]);

  // Calculate Weighted RMSE on training data
  let ss = 0;
  let sumW = 0;
  for (let j = 0; j < xs.length; j++) {
    const weight = 0.1 + 0.9 * (j / (xs.length - 1));
    let yh = 0, pw = 1;
    for (let d = 0; d < k; d++) { yh += coeffs[d] * pw; pw *= xs[j]; }
    const err = ys[j] - yh; 
    ss += weight * err * err;
    sumW += weight;
  }
  const rmse = Math.sqrt(ss / Math.max(1e-9, sumW - k)); // Weighted RMSE approximation
  const z = 1.64; // ~90% CI

  // Calculate trend value at last observed date to determine offset
  const xLast = (lastDate - t0) / scale;
  let yTrendLast = 0, pwrLast = 1;
  for (let d = 0; d < k; d++) { yTrendLast += coeffs[d] * pwrLast; pwrLast *= xLast; }
  
  // Extract the linear slope (coefficient of x) from the model
  // coeffs[0] is intercept, coeffs[1] is slope (for degree 1)
  // Note: This slope is per "unit x", where x is 0..1 over the sample range.
  const currentSlope = (degree >= 1) ? coeffs[1] : 0;

  const lastObs = points[points.length - 1].rating;
  
  // Forecast next ~120 days at 2-day steps (higher resolution)
  const oneDay = 1000 * 60 * 60 * 24;
  const step = oneDay * 2;
  const horizonSteps = 60; // 60 * 2 = 120 days
  const out = [];
  
  out.push({ date: new Date(lastDate), value: lastObs, lo: lastObs, hi: lastObs });

  // Damping factor: Reduce slope by ~5% every 15 days to model diminishing returns
  // Since step is now 2 days, we need to adjust damping per step.
  // (0.95)^(1/7.5) approx 0.993 per 2-day step to match 0.95 per 15-day step
  const damping = 0.993;
  let dampedSlope = currentSlope;
  let currentVal = lastObs;

  for (let i = 1; i <= horizonSteps; i++) {
    const t = lastDate + step * i;
    
    // Advance value using damped slope
    // We need to convert slope from "per domain unit" to "per step"
    // Domain scale is `scale` ms. Step is `step` ms.
    // Slope per step = currentSlope * (step / scale)
    
    dampedSlope *= damping;
    const stepChange = dampedSlope * (step / scale);
    currentVal += stepChange;

    // Widen CI over time
    // Adjust width growth to match previous rate (0.15 per 15 days -> 0.02 per 2 days)
    const width = z * rmse * (1 + 0.02 * i);
    
    out.push({ date: new Date(t), value: currentVal, lo: currentVal - width, hi: currentVal + width });
  }
  return out;
}

function milestoneMarks(points) {
  if (!points.length) {
    return [];
  }
  const sorted = [...points].sort((a, b) => a.date - b.date);
  let maxSoFar = sorted[0].rating;
  let next = Math.max(100, Math.floor(sorted[0].rating / 100) * 100 + 100);
  const marks = [];
  for (const pt of sorted) {
    if (pt.rating > maxSoFar) {
      maxSoFar = pt.rating;
    }
    while (maxSoFar >= next) {
      marks.push({ rating: next, date: pt.date });
      next += 100;
    }
  }
  return marks;
}

function computeForecastMilestones(listOfForecasts, startThreshold, maxForecast) {
  if (!listOfForecasts || listOfForecasts.length === 0) {
    return [];
  }
  const upTo = Math.ceil((maxForecast || startThreshold) / 100) * 100;
  const out = [];
  for (let t = startThreshold; t <= upTo; t += 100) {
    let bestDate = null;
    for (const f of listOfForecasts) {
      if (!f || f.length < 2) {
        continue;
      }
      // search crossing segment-by-segment
      for (let i = 1; i < f.length; i++) {
        const a = f[i - 1], b = f[i];
        const ymin = Math.min(a.value, b.value), ymax = Math.max(a.value, b.value);
        if (t >= ymin && t <= ymax) {
          const x0 = a.date.getTime(), x1 = b.date.getTime();
          const y0 = a.value, y1 = b.value;
          if (Math.abs(y1 - y0) < 1e-6) {
            continue;
          }
          const ratio = (t - y0) / (y1 - y0);
          const tcross = new Date(x0 + ratio * (x1 - x0));
          if (!bestDate || tcross < bestDate) {
            bestDate = tcross;
          }
          break;
        }
      }
      // if not found within range, extrapolate beyond last point using last segment
      if (!bestDate) {
        const a = f[f.length - 2], b = f[f.length - 1];
        const x0 = a.date.getTime(), x1 = b.date.getTime();
        const y0 = a.value, y1 = b.value;
        const slope = (y1 - y0) / Math.max(1, x1 - x0);
        if (Math.abs(slope) > 1e-9) {
          const dt = (t - y1) / slope;
          if (dt > 0) {
            const tcross = new Date(x1 + dt);
            if (!bestDate || tcross < bestDate) {
              bestDate = tcross;
            }
          }
        }
      }
    }
    if (bestDate) {
      out.push({ rating: t, date: bestDate });
    }
  }
  return out;
}

// STATS LOGIC
// --------------------------------------

export function outcomeBreakdown(games) {
  const tot = games.length;
  const wins = games.filter((game) => game.result === 'win').length;
  const draws = games.filter((game) => game.result === 'draw').length;
  const losses = games.filter((game) => game.result === 'loss').length;
  const rate = tot ? wins / tot : 0;
  const byColor = {
    white: outcomeBreakdownSimple(games.filter((game) => game.color === 'white')),
    black: outcomeBreakdownSimple(games.filter((game) => game.color === 'black')),
  };
  return { tot, wins, draws, losses, rate, byColor };
}

function outcomeBreakdownSimple(games) {
  const tot = games.length;
  const wins = games.filter((game) => game.result === 'win').length;
  const draws = games.filter((game) => game.result === 'draw').length;
  const losses = games.filter((game) => game.result === 'loss').length;
  const rate = tot ? wins / tot : 0;
  return { tot, wins, draws, losses, rate };
}
