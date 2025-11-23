// CONSTANTS & GLOBALS
// --------------------------------------
let CHART_INSTANCE = null;

function color(i) {
  const palette = ['#0ea5e9', '#6366f1', '#10b981', '#f97316', '#ec4899'];
  return palette[i % palette.length];
}

// CHART RENDERING
// --------------------------------------
export function renderRatingTimeline(el, timelineBoth) {
  el.innerHTML = '';
  const options = { rating: true, ma: true, trend: false, forecast: false, mlForecast: false, milestones: true, startAtLowest: true };
  let tl = options.startAtLowest ? timelineBoth.lowest : timelineBoth.normal;
  let entries = Object.entries(tl.series).filter(([, s]) => s.points.length);
  if (!entries.length) {
    el.textContent = 'No rating data available for selected filters.';
    return;
  }

  const title = document.createElement('h3');
  title.className = 'chart-title';
  title.textContent = 'Rating History';
  el.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'chart-controls-wrapper';
  controls.innerHTML = `
    <div class="chart-controls-inner">
      <div class="control-group">
        <div class="control-label">Show Elements</div>
        <div class="checkbox-group">
          <label class="checkbox-item"><input type="checkbox" data-opt="rating"> <span class="cb-mark"></span> ELO Rating</label>
          <label class="checkbox-item"><input type="checkbox" data-opt="ma"> <span class="cb-mark"></span> Moving Average</label>
          <label class="checkbox-item"><input type="checkbox" data-opt="trend"> <span class="cb-mark"></span> Linear Trend</label>
          <label class="checkbox-item"><input type="checkbox" data-opt="milestones"> <span class="cb-mark"></span> Milestones</label>
          <label class="checkbox-item"><input type="checkbox" data-opt="startAtLowest"> <span class="cb-mark"></span> Start at Lowest ELO</label>
          <label class="checkbox-item"><input type="checkbox" data-opt="mlForecast"> <span class="cb-mark"></span> ML Forecast</label>
        </div>
      </div>
    </div>
  `;
  el.appendChild(controls);

  const chartWrapper = document.createElement('div');
  chartWrapper.style.position = 'relative';
  chartWrapper.style.width = '100%';
  chartWrapper.style.height = '500px';
  el.appendChild(chartWrapper);

  const canvas = document.createElement('canvas');
  chartWrapper.appendChild(canvas);

  // Bind Toggles (Checkboxes)
  controls.querySelectorAll('input[type="checkbox"][data-opt]').forEach(input => {
    const key = input.dataset.opt;
    input.checked = options[key];
    
    input.addEventListener('change', () => {
      options[key] = input.checked;
      draw();
    });
  });

  let chartLines = [];
  let chartPredLinesML = [];

  function buildDatasets() {
    const ds = [];
    entries.forEach(([key, data], idx) => {
      const baseColor = color(idx);
      const maColor = '#10b981';
      const trendColor = '#7c3aed';
      const forecastColor = '#f59e0b';
      const mlForecastColor = '#ef4444';
      
      const ratingPts = data.points.map((p) => ({ x: p.date.getTime(), y: p.rating }));

      if (options.rating) {
        ds.push({ label: `${key} rating`, data: ratingPts, borderColor: baseColor, pointRadius: 0, tension: 0.35, yAxisID: 'y' });
      }
      
      if (options.ma && data.movingAverage?.length) {
        const maPts = data.points.map((p, i) => ({ x: p.date.getTime(), y: data.movingAverage[i] ?? p.rating }));
        ds.push({ label: `${key} 7d MA`, data: maPts, borderColor: maColor, borderDash: [4,4], pointRadius: 0, tension: 0.35, yAxisID: 'y' });
      }
      if (options.trend && data.trend?.length) {
        const trPts = data.trend.map((p) => ({ x: p.date.getTime(), y: p.value }));
        ds.push({ label: `${key} trend`, data: trPts, borderColor: trendColor, borderDash: [6,3], pointRadius: 0, yAxisID: 'y' });
      }
      if (options.forecast && data.forecast?.length) {
        const fxPts = data.forecast.map((p) => ({ x: p.date.getTime(), y: p.value }));
        ds.push({ label: `${key} forecast`, data: fxPts, borderColor: forecastColor, borderDash: [2,4], borderWidth: 1, pointRadius: 0, yAxisID: 'y' });
      }
      if (options.mlForecast && data.forecastML?.length) {
        const fxPts = data.forecastML.map((p) => ({ x: p.date.getTime(), y: p.value }));
        const fxHi = data.forecastML.map((p) => ({ x: p.date.getTime(), y: p.hi ?? p.value }));
        const fxLo = data.forecastML.map((p) => ({ x: p.date.getTime(), y: p.lo ?? p.value }));
        // CI band (hi then lo with fill to previous)
        ds.push({ label: `${key} forecast CI hi`, data: fxHi, borderColor: 'rgba(239,68,68,0)', backgroundColor: 'rgba(239,68,68,0.08)', pointRadius: 0, fill: false, yAxisID: 'y' });
        ds.push({ label: `${key} forecast CI lo`, data: fxLo, borderColor: 'rgba(239,68,68,0)', backgroundColor: 'rgba(239,68,68,0.08)', pointRadius: 0, fill: '-1', yAxisID: 'y' });
        // Mean forecast line on top
        ds.push({ label: `${key} ML forecast`, data: fxPts, borderColor: mlForecastColor, borderDash: [1,3], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y' });
      }
    });
    chartLines = options.milestones && tl.milestones?.length ? tl.milestones.map(m => ({ x: m.date.getTime(), y: m.rating, date: m.date, label: String(m.rating) })) : [];
    
    // Calculate max forecast time to filter extrapolated milestones
    let maxForecastTime = 0;
    if (options.mlForecast) {
       const allML = Object.values(tl.series).flatMap(s => s.forecastML || []);
       if (allML.length) {
         maxForecastTime = Math.max(...allML.map(p => p.date.getTime()));
       }
    }

    // Only show predicted ML milestone lines when ML forecast is visible
    chartPredLinesML = (options.mlForecast && options.milestones && tl.forecastMilestonesML?.length && maxForecastTime > 0)
      ? tl.forecastMilestonesML
          .filter(m => m.date.getTime() <= maxForecastTime)
          .map(m => ({ x: m.date.getTime(), y: m.rating, date: m.date, label: String(m.rating)+' est' }))
      : [];
    return ds;
  }

  function computeYRange() {
    let [min, max] = tl.yExtent || [0, 1000];

    if (options.mlForecast) {
      entries.forEach(([, s]) => {
        if (s.forecastML?.length) {
          const highs = s.forecastML.map(p => p.hi ?? p.value);
          const lows = s.forecastML.map(p => p.lo ?? p.value);
          max = Math.max(max, ...highs);
          min = Math.min(min, ...lows);
        }
      });
    }

    const yMin = Math.floor((min - 25) / 100) * 100;
    const yMax = Math.ceil((max + 25) / 100) * 100;
    return [yMin, Math.max(yMin + 100, yMax)];
  }

  const milestoneLines = {
    id: 'milestoneLines',
    afterDatasetsDraw(chart) {
      if (!chartLines.length && !chartPredLinesML.length) {
        return;
      }
      const { ctx, chartArea: { top, bottom }, scales: { x, y } } = chart;
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6,4]);

      const linesWithPx = chartLines.map(l => ({ ...l, px: x.getPixelForValue(l.x), py: y.getPixelForValue(l.y) }));

      for (let i = 0; i < linesWithPx.length - 1; i++) {
        const curr = linesWithPx[i];
        const next = linesWithPx[i+1];
        if (next.px - curr.px < 40) {
          curr.align = 'right';
          curr.offsetX = -4;
          next.align = 'left';
          next.offsetX = 4;
        }
      }

      linesWithPx.forEach(({ px, py, label, align, offsetX }) => {
        // Draw dot
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#475569';
        ctx.fill();
        
        if (label) {
          ctx.setLineDash([]);
          ctx.font = 'bold 11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
          ctx.fillStyle = '#475569';
          ctx.textAlign = align || 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, px + (offsetX || 0), py - 8);
          ctx.setLineDash([6,4]);
        }
      });

      // Draw predicted ML milestone dots (red)
      if (chartPredLinesML.length) {
        chartPredLinesML.forEach(({ x: xv, y: yv, label }) => {
          const px = x.getPixelForValue(xv);
          const py = y.getPixelForValue(yv);
          
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#ef4444';
          ctx.fill();

          if (label) {
            ctx.setLineDash([]);
            ctx.font = 'bold 11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
            ctx.fillStyle = '#7f1d1d';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, px, py - 8);
          }
        });
      }

      ctx.restore();
    }
  };

  const milestoneDurations = {
    id: 'milestoneDurations',
    afterDatasetsDraw(chart) {
      if (!chartLines.length || chartLines.length < 2) {
        return;
      }
      const { ctx, chartArea: { bottom }, scales: { x } } = chart;
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.fillStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let i = 1; i < chartLines.length; i++) {
        const prev = chartLines[i-1];
        const cur = chartLines[i];
        const px0 = x.getPixelForValue(prev.x);
        const px1 = x.getPixelForValue(cur.x);
        const mid = (px0 + px1) / 2;
        const y = bottom - 8;
        ctx.beginPath();
        ctx.moveTo(px0, y);
        ctx.lineTo(px1, y);
        ctx.stroke();
        const days = Math.max(0, Math.round((cur.date - prev.date) / (1000*60*60*24)));
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${days}d`, mid, y - 2);
      }
      ctx.restore();
    }
  };

  function draw() {
    tl = options.startAtLowest ? timelineBoth.lowest : timelineBoth.normal;
    entries = Object.entries(tl.series).filter(([, s]) => s.points.length);
    const datasets = buildDatasets();
    const [yMin, yMax] = computeYRange();
    
    // Calculate X range explicitly to avoid excessive padding
    let xMin = undefined;
    let xMax = undefined;
    
    try {
      const allPoints = entries.flatMap(([, s]) => s.points.map(p => p.date.getTime()));
      if (allPoints.length) {
        xMin = Math.min(...allPoints);
        xMax = Math.max(...allPoints);
      }
      
      if (options.mlForecast) {
        const lastML = Object.values(tl.series).flatMap(s => (s.forecastML||[])).map(p => p.date.getTime());
        // Only extend to the end of the forecast line (120 days), ignoring extrapolated milestones beyond that
        if (lastML.length) {
          xMax = Math.max(xMax || 0, ...lastML);
        }
      }
    } catch {}

    const cfg = {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 32 } },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: { 
            type: 'linear', 
            min: xMin,
            max: xMax,
            ticks: {
              callback: (val) => {
                const d = new Date(val);
                return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
              }
            },
            afterFit: (axis) => { axis.height += 10; }
          },
          y: { 
            beginAtZero: false, 
            min: yMin, 
            max: yMax, 
            ticks: { 
              padding: 10,
              stepSize: 100,
              callback: (val) => String(val)
            } 
          },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { 
            itemSort: (a, b) => b.parsed.y - a.parsed.y,
            callbacks: { 
              title: (ctx) => {
                const d = new Date(ctx[0].parsed.x);
                return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
              },
              label: (ctx) => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)}` 
            } 
          },
        },
      },
      plugins: [milestoneLines, milestoneDurations],
    };
    if (CHART_INSTANCE) {
      CHART_INSTANCE.destroy();
    }
    // eslint-disable-next-line no-undef
    CHART_INSTANCE = new Chart(canvas.getContext('2d'), cfg);
  }

  draw();
}
