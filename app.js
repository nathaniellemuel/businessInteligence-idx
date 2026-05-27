/* IDX Fundamental BI dashboard */
(function () {
  'use strict';

  const DATA = window.IDX_DATA || [];
  const META = window.IDX_META || { years: [], metrics: [] };
  const YEARS = META.years.slice().sort();
  const METRICS = META.metrics.slice();

  // ---- Theme / chart defaults ------------------------------------------------
  Chart.defaults.color = '#94a3c0';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,21,37,.96)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(91,140,255,.35)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = true;

  const PALETTE = [
    '#5b8cff', '#7c5bff', '#22d3ee', '#10d39c', '#ffb84d',
    '#ff5d6c', '#f472b6', '#a3e635', '#38bdf8', '#fb923c'
  ];

  // ---- Helpers ---------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function fmtIDR(v, opts = {}) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    const a = Math.abs(v);
    let s;
    if (a >= 1e12) s = (v / 1e12).toFixed(2) + ' T';
    else if (a >= 1e9) s = (v / 1e9).toFixed(2) + ' M';
    else if (a >= 1e6) s = (v / 1e6).toFixed(2) + ' Jt';
    else if (a >= 1e3) s = (v / 1e3).toFixed(2) + ' Rb';
    else s = v.toFixed(2);
    return (opts.rp ? 'Rp ' : '') + s;
  }
  function fmtPct(v, d = 1) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    return v.toFixed(d) + '%';
  }
  function fmtNum(v, d = 2) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    return Number(v).toLocaleString('id-ID', { maximumFractionDigits: d });
  }
  function safeDiv(a, b) {
    if (a === null || b === null || b === 0 || !isFinite(a / b)) return null;
    return a / b;
  }
  function pctChange(a, b) {
    if (a === null || b === null || b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  }
  function gradFill(ctx, chartArea, c1, c2) {
    if (!chartArea) return c1;
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }

  // ---- State -----------------------------------------------------------------
  const state = {
    year: YEARS[YEARS.length - 1],
    page: 'overview',
    selectedTrend: 'Total Revenue',
    company: DATA[0] ? DATA[0].symbol : null,
    compare: [],
    screener: {}
  };

  // ---- Aggregations ----------------------------------------------------------
  function totalByYear(metric) {
    const out = {};
    YEARS.forEach(y => {
      let s = 0; let n = 0;
      DATA.forEach(c => {
        const v = c.byYear[y] && c.byYear[y][metric];
        if (typeof v === 'number' && !isNaN(v)) { s += v; n++; }
      });
      out[y] = { sum: s, count: n };
    });
    return out;
  }
  function avgRatioByYear(fn) {
    const out = {};
    YEARS.forEach(y => {
      const arr = [];
      DATA.forEach(c => {
        const v = fn(c.byYear[y] || {});
        if (typeof v === 'number' && isFinite(v)) arr.push(v);
      });
      if (!arr.length) { out[y] = null; return; }
      // Trimmed mean (5%) to reduce extreme outliers
      arr.sort((a, b) => a - b);
      const trim = Math.floor(arr.length * 0.05);
      const trimmed = arr.slice(trim, arr.length - trim);
      out[y] = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    });
    return out;
  }

  function ratiosOf(rec) {
    if (!rec) return {};
    const ni = rec['Net Income'];
    const eq = rec['Total Equity Gross Minority Interest'];
    const ta = rec['Total Assets'];
    const rev = rec['Total Revenue'];
    const gp = rec['Gross Profit'];
    const ca = rec['Current Assets'];
    const cl = rec['Current Liabilities'];
    const tl = rec['Total Liabilities Net Minority Interest'];
    const oi = rec['Operating Income'];
    return {
      ROE: safeDiv(ni, eq) === null ? null : safeDiv(ni, eq) * 100,
      ROA: safeDiv(ni, ta) === null ? null : safeDiv(ni, ta) * 100,
      NPM: safeDiv(ni, rev) === null ? null : safeDiv(ni, rev) * 100,
      OPM: safeDiv(oi, rev) === null ? null : safeDiv(oi, rev) * 100,
      GPM: safeDiv(gp, rev) === null ? null : safeDiv(gp, rev) * 100,
      CR: safeDiv(ca, cl),
      DER: safeDiv(tl, eq)
    };
  }

  // ---- Charts registry -------------------------------------------------------
  const charts = {};
  function destroy(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }
  function makeChart(id, cfg) {
    destroy(id);
    const el = document.getElementById(id);
    if (!el) return null;
    charts[id] = new Chart(el.getContext('2d'), cfg);
    return charts[id];
  }

  // ============================================================================
  //  OVERVIEW PAGE
  // ============================================================================
  function renderOverview() {
    const y = state.year;
    const yIdx = YEARS.indexOf(y);
    const prevY = yIdx > 0 ? YEARS[yIdx - 1] : null;

    // KPIs
    const kpiDefs = [
      ['Total Revenue', 'kpiRevenue', 'kpiRevenueMeta', 'revenue'],
      ['Net Income', 'kpiNetIncome', 'kpiNetIncomeMeta', 'netIncome'],
      ['Total Assets', 'kpiAssets', 'kpiAssetsMeta', 'assets'],
      ['Total Equity Gross Minority Interest', 'kpiEquity', 'kpiEquityMeta', 'equity']
    ];
    kpiDefs.forEach(([metric, valId, metaId, sparkKey]) => {
      const totals = totalByYear(metric);
      const cur = totals[y] && totals[y].sum;
      const prev = prevY ? totals[prevY] && totals[prevY].sum : null;
      $(`#${valId}`).textContent = fmtIDR(cur, { rp: true });
      const ch = pctChange(cur, prev);
      $(`#${metaId}`).innerHTML = ch === null
        ? `<span class="muted">${y}</span>`
        : `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%</span> vs ${prevY}`;
      sparkline(sparkKey, YEARS.map(yy => totals[yy].sum));
    });

    // Ratio KPIs (avg)
    const npm = avgRatioByYear(r => {
      const v = safeDiv(r['Net Income'], r['Total Revenue']);
      return v === null ? null : v * 100;
    });
    const roe = avgRatioByYear(r => {
      const v = safeDiv(r['Net Income'], r['Total Equity Gross Minority Interest']);
      return v === null ? null : v * 100;
    });
    $('#kpiNPM').textContent = fmtPct(npm[y]);
    $('#kpiROE').textContent = fmtPct(roe[y]);
    {
      const prevNPM = prevY ? npm[prevY] : null;
      const dN = (npm[y] !== null && prevNPM !== null) ? (npm[y] - prevNPM) : null;
      $('#kpiNPMMeta').innerHTML = dN === null ? `<span class="muted">${y}</span>` :
        `<span class="${dN >= 0 ? 'up' : 'down'}">${dN >= 0 ? '▲' : '▼'} ${Math.abs(dN).toFixed(1)} pp</span> vs ${prevY}`;
      const prevROE = prevY ? roe[prevY] : null;
      const dR = (roe[y] !== null && prevROE !== null) ? (roe[y] - prevROE) : null;
      $('#kpiROEMeta').innerHTML = dR === null ? `<span class="muted">${y}</span>` :
        `<span class="${dR >= 0 ? 'up' : 'down'}">${dR >= 0 ? '▲' : '▼'} ${Math.abs(dR).toFixed(1)} pp</span> vs ${prevY}`;
    }
    sparkline('npm', YEARS.map(yy => npm[yy]));
    sparkline('roe', YEARS.map(yy => roe[yy]));

    drawTrendChart();
    drawBubble();
    drawTopMetric('topRevenue', 'Total Revenue', '#5b8cff', '#22d3ee');
    drawTopMetric('topNI', 'Net Income', '#10d39c', '#7c5bff');
    drawAssetMix();
    drawCapitalMix();
  }

  function sparkline(key, values) {
    const el = document.querySelector(`canvas[data-spark="${key}"]`);
    if (!el) return;
    const id = 'spark_' + key;
    const last = values[values.length - 1];
    const first = values[0];
    const up = last >= first;
    if (charts[id]) { charts[id].destroy(); }
    charts[id] = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: YEARS,
        datasets: [{
          data: values,
          borderColor: up ? '#10d39c' : '#ff5d6c',
          backgroundColor: function (ctx) {
            const { chart } = ctx;
            const { ctx: c, chartArea } = chart;
            return gradFill(c, chartArea,
              up ? 'rgba(16,211,156,.30)' : 'rgba(255,93,108,.30)',
              up ? 'rgba(16,211,156,0)' : 'rgba(255,93,108,0)');
          },
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: 0 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { capBezierPoints: true } }
      }
    });
  }

  function drawTrendChart() {
    const metric = state.selectedTrend;
    const totals = totalByYear(metric);
    const labels = YEARS;
    const data = labels.map(y => totals[y].sum / 1e12); // in trillion
    makeChart('trendChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: metric,
          data,
          backgroundColor: function (ctx) {
            const { chart } = ctx;
            const { ctx: c, chartArea } = chart;
            return gradFill(c, chartArea, 'rgba(91,140,255,.95)', 'rgba(124,91,255,.55)');
          },
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 60
        }, {
          label: 'Tren',
          type: 'line',
          data,
          borderColor: '#22d3ee',
          backgroundColor: '#22d3ee',
          tension: 0.4, pointRadius: 4, pointHoverRadius: 6,
          borderWidth: 2.5
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: Rp ${fmtNum(c.parsed.y)} T`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(255,255,255,.04)' },
            ticks: { callback: v => 'Rp ' + fmtNum(v, 1) + ' T' }
          }
        }
      }
    });
  }

  function drawBubble() {
    const y = state.year;
    const points = DATA.map(c => {
      const r = c.byYear[y] || {};
      const rev = r['Total Revenue']; const ni = r['Net Income']; const ta = r['Total Assets'];
      if (!rev || !ni || !ta) return null;
      return { x: rev / 1e12, y: ni / 1e12, r: Math.max(3, Math.min(28, Math.sqrt(ta / 1e11) * 1.2)), symbol: c.symbol, ta };
    }).filter(Boolean);

    makeChart('bubbleChart', {
      type: 'bubble',
      data: {
        datasets: [{
          label: y,
          data: points,
          backgroundColor: 'rgba(91,140,255,.45)',
          borderColor: 'rgba(91,140,255,.9)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => {
                const p = c.raw;
                return `${p.symbol} · Rev Rp ${fmtNum(p.x)} T · NI Rp ${fmtNum(p.y)} T · Aset Rp ${fmtNum(p.ta / 1e12)} T`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Total Revenue (Rp T)' },
            grid: { color: 'rgba(255,255,255,.04)' }
          },
          y: {
            title: { display: true, text: 'Net Income (Rp T)' },
            grid: { color: 'rgba(255,255,255,.04)' }
          }
        }
      }
    });
  }

  function drawTopMetric(canvasId, metric, c1, c2) {
    const y = state.year;
    const arr = DATA.map(c => ({ symbol: c.symbol, v: c.byYear[y] && c.byYear[y][metric] }))
      .filter(x => typeof x.v === 'number' && !isNaN(x.v))
      .sort((a, b) => b.v - a.v).slice(0, 10);
    makeChart(canvasId, {
      type: 'bar',
      data: {
        labels: arr.map(x => x.symbol),
        datasets: [{
          data: arr.map(x => x.v / 1e12),
          backgroundColor: function (ctx) {
            const { chart } = ctx;
            const { ctx: cx, chartArea } = chart;
            if (!chartArea) return c1;
            const g = cx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
            g.addColorStop(0, c1); g.addColorStop(1, c2);
            return g;
          },
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: c => `Rp ${fmtNum(c.parsed.x)} T` }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => fmtNum(v, 1) + ' T' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  function drawAssetMix() {
    const y = state.year;
    let cur = 0, ncur = 0;
    DATA.forEach(c => {
      const r = c.byYear[y] || {};
      if (typeof r['Current Assets'] === 'number') cur += r['Current Assets'];
      if (typeof r['Total Non Current Assets'] === 'number') ncur += r['Total Non Current Assets'];
    });
    makeChart('assetMix', {
      type: 'doughnut',
      data: {
        labels: ['Aset Lancar', 'Aset Non Lancar'],
        datasets: [{
          data: [cur, ncur],
          backgroundColor: ['#5b8cff', '#7c5bff'],
          borderColor: 'rgba(0,0,0,0)', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => `${c.label}: Rp ${fmtNum(c.parsed / 1e12)} T` } },
          title: { display: true, text: 'Komposisi Aset', color: '#94a3c0' }
        }
      }
    });
  }
  function drawCapitalMix() {
    const y = state.year;
    let eq = 0, li = 0;
    DATA.forEach(c => {
      const r = c.byYear[y] || {};
      if (typeof r['Total Equity Gross Minority Interest'] === 'number') eq += r['Total Equity Gross Minority Interest'];
      if (typeof r['Total Liabilities Net Minority Interest'] === 'number') li += r['Total Liabilities Net Minority Interest'];
    });
    makeChart('capitalMix', {
      type: 'doughnut',
      data: {
        labels: ['Ekuitas', 'Liabilitas'],
        datasets: [{
          data: [eq, li],
          backgroundColor: ['#10d39c', '#ff5d6c'],
          borderColor: 'rgba(0,0,0,0)', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => `${c.label}: Rp ${fmtNum(c.parsed / 1e12)} T` } },
          title: { display: true, text: 'Struktur Modal', color: '#94a3c0' }
        }
      }
    });
  }

  // ============================================================================
  //  LEADERBOARD
  // ============================================================================
  function renderLeaderboard() {
    const metricSel = $('#lbMetric');
    if (!metricSel.options.length) {
      METRICS.forEach(m => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m;
        if (m === 'Total Revenue') o.selected = true;
        metricSel.appendChild(o);
      });
    }
    const metric = metricSel.value;
    const order = $('#lbOrder').value;
    const limit = parseInt($('#lbLimit').value, 10);
    const y = state.year;

    const arr = DATA.map(c => ({ symbol: c.symbol, v: c.byYear[y] && c.byYear[y][metric] }))
      .filter(x => typeof x.v === 'number' && !isNaN(x.v));
    arr.sort((a, b) => order === 'desc' ? b.v - a.v : a.v - b.v);
    const top = arr.slice(0, limit);

    makeChart('lbChart', {
      type: 'bar',
      data: {
        labels: top.map(x => x.symbol),
        datasets: [{
          data: top.map(x => x.v),
          backgroundColor: function (ctx) {
            const { chart } = ctx;
            const { ctx: cx, chartArea } = chart;
            if (!chartArea) return '#5b8cff';
            const g = cx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
            g.addColorStop(0, '#5b8cff'); g.addColorStop(1, '#22d3ee');
            return g;
          },
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => fmtIDR(c.parsed.x, { rp: true }) } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => fmtIDR(v) } },
          y: { grid: { display: false } }
        }
      }
    });

    // Table
    $('#lbTableSub').textContent = `${arr.length} emiten · metrik: ${metric} · tahun ${y}`;
    const thead = $('#lbTable thead');
    const tbody = $('#lbTable tbody');
    thead.innerHTML = `<tr><th>#</th><th>Symbol</th><th class="num">${metric}</th><th class="num">YoY</th></tr>`;
    const prevY = YEARS.indexOf(y) > 0 ? YEARS[YEARS.indexOf(y) - 1] : null;
    tbody.innerHTML = arr.slice(0, limit).map((x, i) => {
      let yoy = null;
      if (prevY) {
        const pv = (DATA.find(d => d.symbol === x.symbol).byYear[prevY] || {})[metric];
        yoy = pctChange(x.v, pv);
      }
      const yoyHtml = yoy === null ? '–' : `<span class="${yoy >= 0 ? 'pos' : 'neg'}">${yoy >= 0 ? '▲' : '▼'} ${Math.abs(yoy).toFixed(1)}%</span>`;
      return `<tr><td>${i + 1}</td><td class="symbol">${x.symbol}</td><td class="num">${fmtIDR(x.v, { rp: true })}</td><td class="num">${yoyHtml}</td></tr>`;
    }).join('');
  }

  // ============================================================================
  //  COMPANY PAGE
  // ============================================================================
  function renderCompany() {
    const sel = $('#companySelect');
    if (!sel.options.length) {
      DATA.slice().sort((a, b) => a.symbol.localeCompare(b.symbol)).forEach(c => {
        const o = document.createElement('option');
        o.value = c.symbol; o.textContent = c.symbol;
        sel.appendChild(o);
      });
    }
    if (state.company) sel.value = state.company;
    const company = DATA.find(d => d.symbol === sel.value);
    if (!company) return;
    state.company = company.symbol;

    // KPI cards
    const y = state.year;
    const r = company.byYear[y] || {};
    const ratios = ratiosOf(r);
    const items = [
      ['Total Revenue', fmtIDR(r['Total Revenue'], { rp: true })],
      ['Net Income', fmtIDR(r['Net Income'], { rp: true })],
      ['Total Assets', fmtIDR(r['Total Assets'], { rp: true })],
      ['Total Equity', fmtIDR(r['Total Equity Gross Minority Interest'], { rp: true })],
      ['ROE', fmtPct(ratios.ROE)],
      ['ROA', fmtPct(ratios.ROA)],
      ['Net Margin', fmtPct(ratios.NPM)],
      ['Current Ratio', fmtNum(ratios.CR)]
    ];
    $('#companyKPI').innerHTML = items.map(([k, v]) =>
      `<div class="cKpi"><div class="cKpi-label">${k}</div><div class="cKpi-value">${v}</div></div>`
    ).join('');

    // Income chart
    makeChart('cIncome', {
      type: 'bar',
      data: {
        labels: YEARS,
        datasets: [
          { label: 'Revenue', data: YEARS.map(yy => (company.byYear[yy] || {})['Total Revenue'] / 1e12), backgroundColor: '#5b8cff', borderRadius: 6 },
          { label: 'Cost of Revenue', data: YEARS.map(yy => (company.byYear[yy] || {})['Cost Of Revenue'] / 1e12), backgroundColor: '#ff5d6c', borderRadius: 6 },
          { label: 'Gross Profit', data: YEARS.map(yy => (company.byYear[yy] || {})['Gross Profit'] / 1e12), backgroundColor: '#22d3ee', borderRadius: 6 },
          { label: 'Net Income', data: YEARS.map(yy => (company.byYear[yy] || {})['Net Income'] / 1e12), backgroundColor: '#10d39c', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: Rp ${fmtNum(c.parsed.y)} T` } } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => 'Rp ' + fmtNum(v, 1) + ' T' } } }
      }
    });

    // Balance chart
    makeChart('cBalance', {
      type: 'line',
      data: {
        labels: YEARS,
        datasets: [
          { label: 'Total Assets', data: YEARS.map(yy => (company.byYear[yy] || {})['Total Assets'] / 1e12), borderColor: '#5b8cff', backgroundColor: 'rgba(91,140,255,.18)', tension: .35, fill: true, borderWidth: 2 },
          { label: 'Total Liabilities', data: YEARS.map(yy => (company.byYear[yy] || {})['Total Liabilities Net Minority Interest'] / 1e12), borderColor: '#ff5d6c', backgroundColor: 'rgba(255,93,108,.14)', tension: .35, fill: true, borderWidth: 2 },
          { label: 'Total Equity', data: YEARS.map(yy => (company.byYear[yy] || {})['Total Equity Gross Minority Interest'] / 1e12), borderColor: '#10d39c', backgroundColor: 'rgba(16,211,156,.14)', tension: .35, fill: true, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: Rp ${fmtNum(c.parsed.y)} T` } } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => 'Rp ' + fmtNum(v, 1) + ' T' } } }
      }
    });

    // Cash flow
    makeChart('cCash', {
      type: 'bar',
      data: {
        labels: YEARS,
        datasets: [
          { label: 'Operating CF', data: YEARS.map(yy => (company.byYear[yy] || {})['Cash Flowsfromusedin Operating Activities Direct'] / 1e12), backgroundColor: '#22d3ee', borderRadius: 6 },
          { label: 'Capital Expenditure', data: YEARS.map(yy => (company.byYear[yy] || {})['Capital Expenditure'] / 1e12), backgroundColor: '#ffb84d', borderRadius: 6 },
          { label: 'End Cash', data: YEARS.map(yy => (company.byYear[yy] || {})['End Cash Position'] / 1e12), backgroundColor: '#7c5bff', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: Rp ${fmtNum(c.parsed.y)} T` } } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => 'Rp ' + fmtNum(v, 1) + ' T' } } }
      }
    });

    // Ratios
    makeChart('cRatios', {
      type: 'line',
      data: {
        labels: YEARS,
        datasets: [
          { label: 'ROE (%)', data: YEARS.map(yy => ratiosOf(company.byYear[yy] || {}).ROE), borderColor: '#5b8cff', backgroundColor: 'rgba(91,140,255,.0)', tension: .35, borderWidth: 2 },
          { label: 'ROA (%)', data: YEARS.map(yy => ratiosOf(company.byYear[yy] || {}).ROA), borderColor: '#22d3ee', tension: .35, borderWidth: 2 },
          { label: 'NPM (%)', data: YEARS.map(yy => ratiosOf(company.byYear[yy] || {}).NPM), borderColor: '#10d39c', tension: .35, borderWidth: 2 },
          { label: 'GPM (%)', data: YEARS.map(yy => ratiosOf(company.byYear[yy] || {}).GPM), borderColor: '#ffb84d', tension: .35, borderWidth: 2 },
          { label: 'Current Ratio', data: YEARS.map(yy => ratiosOf(company.byYear[yy] || {}).CR), borderColor: '#7c5bff', tension: .35, borderWidth: 2, yAxisID: 'y2' },
          { label: 'DER', data: YEARS.map(yy => ratiosOf(company.byYear[yy] || {}).DER), borderColor: '#ff5d6c', tension: .35, borderWidth: 2, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => v + '%' } },
          y2: { position: 'right', grid: { display: false }, ticks: { callback: v => fmtNum(v, 2) + 'x' } }
        }
      }
    });

    // Table
    const thead = $('#cTable thead');
    const tbody = $('#cTable tbody');
    thead.innerHTML = `<tr><th>Metrik</th>${YEARS.map(yy => `<th class="num">${yy}</th>`).join('')}</tr>`;
    tbody.innerHTML = METRICS.map(m => {
      const cells = YEARS.map(yy => {
        const v = (company.byYear[yy] || {})[m];
        return `<td class="num">${typeof v === 'number' && !isNaN(v) ? (m === 'Basic EPS' ? fmtNum(v, 2) : fmtIDR(v)) : '–'}</td>`;
      }).join('');
      return `<tr><td class="symbol">${m}</td>${cells}</tr>`;
    }).join('');
  }

  // ============================================================================
  //  COMPARE
  // ============================================================================
  function renderCompare() {
    const sel = $('#cmpMetric');
    if (!sel.options.length) {
      METRICS.forEach(m => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m;
        if (m === 'Total Revenue') o.selected = true;
        sel.appendChild(o);
      });
    }
    if (!state.compare.length) {
      // pick top 3 by revenue at last year
      const lastY = YEARS[YEARS.length - 1];
      state.compare = DATA.map(c => ({ s: c.symbol, v: c.byYear[lastY] && c.byYear[lastY]['Total Revenue'] || 0 }))
        .sort((a, b) => b.v - a.v).slice(0, 3).map(x => x.s);
    }
    drawCompareChips();
    drawCompareLine();
    drawCompareRadar();
  }
  function drawCompareChips() {
    const root = $('#cmpChips');
    root.innerHTML = '';
    state.compare.forEach((sym, i) => {
      const span = document.createElement('span');
      span.className = 'pill';
      span.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PALETTE[i]}"></span>${sym}<span class="x" data-rm="${sym}">✕</span>`;
      root.appendChild(span);
    });
    if (state.compare.length < 5) {
      const inp = document.createElement('input');
      inp.placeholder = 'Tambah kode emiten (Enter)…';
      inp.list = 'companiesDatalist';
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const v = e.target.value.trim().toUpperCase();
          if (v && DATA.find(d => d.symbol === v) && !state.compare.includes(v)) {
            state.compare.push(v);
            drawCompareChips(); drawCompareLine(); drawCompareRadar();
          } else { toast('Emiten tidak ditemukan: ' + v); }
        }
      });
      root.appendChild(inp);
      ensureCompaniesDatalist();
    }
    root.querySelectorAll('[data-rm]').forEach(el => {
      el.onclick = () => {
        state.compare = state.compare.filter(s => s !== el.dataset.rm);
        drawCompareChips(); drawCompareLine(); drawCompareRadar();
      };
    });
  }
  function ensureCompaniesDatalist() {
    if (document.getElementById('companiesDatalist')) return;
    const dl = document.createElement('datalist');
    dl.id = 'companiesDatalist';
    DATA.slice().sort((a, b) => a.symbol.localeCompare(b.symbol)).forEach(c => {
      const o = document.createElement('option'); o.value = c.symbol; dl.appendChild(o);
    });
    document.body.appendChild(dl);
  }
  function drawCompareLine() {
    const metric = $('#cmpMetric').value;
    const datasets = state.compare.map((sym, i) => {
      const c = DATA.find(d => d.symbol === sym);
      return {
        label: sym,
        data: YEARS.map(y => (c.byYear[y] || {})[metric]),
        borderColor: PALETTE[i],
        backgroundColor: PALETTE[i] + '22',
        tension: .35, borderWidth: 2.5, fill: false, pointRadius: 4
      };
    });
    makeChart('cmpChart', {
      type: 'line',
      data: { labels: YEARS, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtIDR(c.parsed.y, { rp: true })}` } } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => fmtIDR(v) } } }
      }
    });
  }
  function drawCompareRadar() {
    const y = state.year;
    const RAD = ['Total Revenue', 'Net Income', 'Total Assets', 'Total Equity Gross Minority Interest', 'Gross Profit', 'Operating Income'];
    // Build percentile scores
    const pctRanks = {};
    RAD.forEach(m => {
      const arr = DATA.map(c => c.byYear[y] && c.byYear[y][m]).filter(v => typeof v === 'number');
      arr.sort((a, b) => a - b);
      pctRanks[m] = arr;
    });
    function score(m, v) {
      const arr = pctRanks[m];
      if (!arr.length || typeof v !== 'number') return 0;
      // Find rank
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < v) lo = mid + 1; else hi = mid;
      }
      return Math.round((lo / arr.length) * 100);
    }
    const datasets = state.compare.map((sym, i) => {
      const c = DATA.find(d => d.symbol === sym);
      const r = c.byYear[y] || {};
      return {
        label: sym,
        data: RAD.map(m => score(m, r[m])),
        backgroundColor: PALETTE[i] + '33',
        borderColor: PALETTE[i],
        borderWidth: 2, pointRadius: 3
      };
    });
    makeChart('cmpRadar', {
      type: 'radar',
      data: { labels: RAD.map(m => m.replace('Total ', '').replace(' Gross Minority Interest', '').replace(' Net Minority Interest', '')), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          r: {
            angleLines: { color: 'rgba(255,255,255,.06)' },
            grid: { color: 'rgba(255,255,255,.06)' },
            pointLabels: { color: '#94a3c0', font: { size: 11 } },
            ticks: { backdropColor: 'transparent', color: '#6577a0', stepSize: 25 },
            min: 0, max: 100
          }
        }
      }
    });
  }

  // ============================================================================
  //  RATIOS PAGE
  // ============================================================================
  function renderRatios() {
    const y = state.year;
    const all = DATA.map(c => ({ symbol: c.symbol, r: ratiosOf(c.byYear[y] || {}) }));
    const buckets = (vals, bins) => {
      vals = vals.filter(v => typeof v === 'number' && isFinite(v));
      if (!vals.length) return { labels: [], data: [] };
      vals.sort((a, b) => a - b);
      // Clip 1%-99% so chart stays readable
      const lo = vals[Math.floor(vals.length * 0.01)];
      const hi = vals[Math.floor(vals.length * 0.99)];
      const span = (hi - lo) || 1;
      const w = span / bins;
      const counts = new Array(bins).fill(0);
      const labels = [];
      for (let i = 0; i < bins; i++) {
        labels.push((lo + i * w).toFixed(1));
      }
      vals.forEach(v => {
        if (v < lo || v > hi) return;
        let i = Math.floor((v - lo) / w);
        if (i >= bins) i = bins - 1;
        counts[i]++;
      });
      return { labels, data: counts };
    };
    function histo(canvasId, key, label, color) {
      const { labels, data } = buckets(all.map(x => x.r[key]), 18);
      makeChart(canvasId, {
        type: 'bar',
        data: { labels, datasets: [{ label, data, backgroundColor: color, borderRadius: 4, borderSkipped: false }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: label, color: '#e6ecff' } },
          scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }, y: { grid: { color: 'rgba(255,255,255,.04)' } } }
        }
      });
    }
    histo('distROE', 'ROE', 'ROE (%)', '#5b8cff');
    histo('distROA', 'ROA', 'ROA (%)', '#22d3ee');
    histo('distNPM', 'NPM', 'Net Margin (%)', '#10d39c');
    histo('distDER', 'DER', 'DER (x)', '#ff5d6c');
    histo('distCR', 'CR', 'Current Ratio (x)', '#ffb84d');
    histo('distGM', 'GPM', 'Gross Margin (%)', '#7c5bff');

    function topRatio(canvasId, key, color) {
      const arr = all.filter(x => typeof x.r[key] === 'number' && isFinite(x.r[key]))
        .sort((a, b) => b.r[key] - a.r[key]).slice(0, 10);
      makeChart(canvasId, {
        type: 'bar',
        data: { labels: arr.map(x => x.symbol), datasets: [{ data: arr.map(x => x.r[key]), backgroundColor: color, borderRadius: 6, borderSkipped: false }] },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtPct(c.parsed.x) } } },
          scales: { x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }
        }
      });
    }
    topRatio('topROE', 'ROE', '#5b8cff');
    topRatio('topNPM', 'NPM', '#10d39c');
  }

  // ============================================================================
  //  SCREENER
  // ============================================================================
  const SCREENER_DEFS = [
    { key: 'rev', label: 'Total Revenue (Rp T)', fn: r => r['Total Revenue'] / 1e12, min: 0, max: 500, step: 1, suffix: ' T' },
    { key: 'ni', label: 'Net Income (Rp T)', fn: r => r['Net Income'] / 1e12, min: -50, max: 100, step: 0.5, suffix: ' T' },
    { key: 'roe', label: 'ROE (%)', fn: r => ratiosOf(r).ROE, min: -50, max: 100, step: 1, suffix: '%' },
    { key: 'npm', label: 'Net Margin (%)', fn: r => ratiosOf(r).NPM, min: -50, max: 100, step: 1, suffix: '%' },
    { key: 'der', label: 'DER (x)', fn: r => ratiosOf(r).DER, min: 0, max: 10, step: 0.1, suffix: 'x' },
    { key: 'cr', label: 'Current Ratio (x)', fn: r => ratiosOf(r).CR, min: 0, max: 10, step: 0.1, suffix: 'x' }
  ];
  function renderScreener() {
    const root = $('#screenerGrid');
    if (!root.dataset.built) {
      root.innerHTML = SCREENER_DEFS.map(d => `
        <div class="s-row" data-key="${d.key}">
          <label><span>${d.label}</span><span class="vals"><span class="vmin"></span> – <span class="vmax"></span></span></label>
          <input type="range" class="rmin" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.min}">
          <input type="range" class="rmax" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.max}">
        </div>
      `).join('');
      root.dataset.built = '1';
      SCREENER_DEFS.forEach(d => {
        state.screener[d.key] = { min: d.min, max: d.max };
      });
      $$('.s-row').forEach(row => {
        const key = row.dataset.key;
        const def = SCREENER_DEFS.find(x => x.key === key);
        const rmin = row.querySelector('.rmin');
        const rmax = row.querySelector('.rmax');
        const vmin = row.querySelector('.vmin');
        const vmax = row.querySelector('.vmax');
        const update = () => {
          let a = +rmin.value, b = +rmax.value;
          if (a > b) { [a, b] = [b, a]; rmin.value = a; rmax.value = b; }
          state.screener[key] = { min: a, max: b };
          vmin.textContent = a + def.suffix;
          vmax.textContent = b + def.suffix;
          applyScreener();
        };
        rmin.addEventListener('input', update);
        rmax.addEventListener('input', update);
        update();
      });
      $('#screenerReset').onclick = () => {
        $$('.s-row').forEach(row => {
          const def = SCREENER_DEFS.find(x => x.key === row.dataset.key);
          row.querySelector('.rmin').value = def.min;
          row.querySelector('.rmax').value = def.max;
          row.querySelector('.rmin').dispatchEvent(new Event('input'));
        });
      };
    }
    applyScreener();
  }
  function applyScreener() {
    const y = state.year;
    const rows = DATA.map(c => {
      const r = c.byYear[y] || {};
      const vals = {};
      SCREENER_DEFS.forEach(d => { vals[d.key] = d.fn(r); });
      return { symbol: c.symbol, vals, raw: r };
    }).filter(item => {
      return SCREENER_DEFS.every(d => {
        const v = item.vals[d.key];
        if (typeof v !== 'number' || !isFinite(v)) return false;
        const f = state.screener[d.key];
        return v >= f.min && v <= f.max;
      });
    });
    rows.sort((a, b) => (b.vals.rev || 0) - (a.vals.rev || 0));
    $('#screenerCount').textContent = `${rows.length} emiten cocok dengan kriteria`;

    const thead = $('#screenerTable thead');
    const tbody = $('#screenerTable tbody');
    thead.innerHTML = `<tr><th>#</th><th>Symbol</th><th class="num">Revenue</th><th class="num">Net Income</th><th class="num">ROE</th><th class="num">NPM</th><th class="num">DER</th><th class="num">CR</th></tr>`;
    tbody.innerHTML = rows.slice(0, 200).map((x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="symbol">${x.symbol}</td>
        <td class="num">${fmtIDR(x.raw['Total Revenue'], { rp: true })}</td>
        <td class="num">${fmtIDR(x.raw['Net Income'], { rp: true })}</td>
        <td class="num">${fmtPct(x.vals.roe)}</td>
        <td class="num">${fmtPct(x.vals.npm)}</td>
        <td class="num">${fmtNum(x.vals.der, 2)}</td>
        <td class="num">${fmtNum(x.vals.cr, 2)}</td>
      </tr>`).join('');
  }

  // ============================================================================
  //  TRENDS / GROWTH
  // ============================================================================
  function renderTrends() {
    const metrics = ['Total Revenue', 'Net Income', 'Total Assets', 'Total Equity Gross Minority Interest', 'Gross Profit', 'Operating Income'];
    const colors = ['#5b8cff', '#10d39c', '#22d3ee', '#7c5bff', '#ffb84d', '#ff5d6c'];

    // Populate metric selector for absolute trend chart
    const metricSel = $('#trendMetric');
    if (!metricSel.options.length) {
      metrics.forEach(m => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m;
        metricSel.appendChild(o);
      });
      metricSel.addEventListener('change', drawTrendAbs);
    }
    function drawTrendAbs() {
      const metric = metricSel.value;
      const tot = totalByYear(metric);
      const values = YEARS.map(y => tot[y].sum / 1e12);
      makeChart('trendAbsChart', {
        type: 'bar',
        data: {
          labels: YEARS,
          datasets: [{
            label: metric,
            data: values,
            backgroundColor: function (ctx) {
              const { chart } = ctx;
              const { ctx: c, chartArea } = chart;
              return gradFill(c, chartArea, 'rgba(91,140,255,.95)', 'rgba(124,91,255,.55)');
            },
            borderRadius: 8, borderSkipped: false, maxBarThickness: 80
          }, {
            type: 'line', label: 'Tren', data: values,
            borderColor: '#22d3ee', backgroundColor: '#22d3ee',
            tension: .35, pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: Rp ${fmtNum(c.parsed.y)} T` } }
          },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => 'Rp ' + fmtNum(v, 1) + ' T' } }
          }
        }
      });
    }
    drawTrendAbs();

    // YoY growth: skip first year (no baseline), so labels = 2021..2023
    const yoyLabels = YEARS.slice(1);
    const datasets = metrics.map((m, i) => {
      const tot = totalByYear(m);
      const data = yoyLabels.map((y, idx) => {
        const prev = YEARS[idx]; // YEARS[idx] is the year before yoyLabels[idx]
        return pctChange(tot[y].sum, tot[prev].sum);
      });
      return {
        label: m, data, borderColor: colors[i], backgroundColor: colors[i] + '22',
        tension: .35, borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7
      };
    });
    makeChart('growthChart', {
      type: 'line',
      data: { labels: yoyLabels.map(y => y + ' YoY'), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtPct(c.parsed.y, 2)}` } }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => v + '%' } }
        }
      }
    });

    const fy = YEARS[0], ly = YEARS[YEARS.length - 1];
    function topGrowth(metric, canvasId, color) {
      const arr = DATA.map(c => {
        const a = c.byYear[fy] && c.byYear[fy][metric];
        const b = c.byYear[ly] && c.byYear[ly][metric];
        if (typeof a !== 'number' || typeof b !== 'number' || a <= 0) return null;
        return { symbol: c.symbol, g: pctChange(b, a) };
      }).filter(Boolean).sort((a, b) => b.g - a.g).slice(0, 10);
      makeChart(canvasId, {
        type: 'bar',
        data: { labels: arr.map(x => x.symbol), datasets: [{ data: arr.map(x => x.g), backgroundColor: color, borderRadius: 6, borderSkipped: false }] },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtPct(c.parsed.x) } } },
          scales: { x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }
        }
      });
    }
    topGrowth('Total Revenue', 'topGrowthRev', '#5b8cff');
    topGrowth('Net Income', 'topGrowthNI', '#10d39c');
  }

  // ============================================================================
  //  Routing / UI wiring
  // ============================================================================
  function setPage(page) {
    state.page = page;
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $$('.page').forEach(el => el.classList.toggle('hidden', el.dataset.page !== page));
    const titles = {
      overview: ['Overview', 'Ringkasan fundamental ' + DATA.length + ' emiten Bursa Efek Indonesia'],
      leaderboard: ['Leaderboard', 'Peringkat emiten berdasarkan metrik fundamental'],
      company: ['Perusahaan', 'Detail laporan keuangan per emiten'],
      compare: ['Compare', 'Bandingkan kinerja antar emiten'],
      ratios: ['Rasio Keuangan', 'Distribusi rasio fundamental seluruh pasar'],
      screener: ['Screener', 'Saring emiten berdasarkan kriteria fundamental Anda'],
      trends: ['Tren Pasar', 'Pertumbuhan agregat 2020–2023']
    };
    const t = titles[page] || ['', ''];
    $('#pageTitle').textContent = t[0];
    $('#pageSub').textContent = t[1];
    rerender();
  }

  function rerender() {
    if (state.page === 'overview') renderOverview();
    else if (state.page === 'leaderboard') renderLeaderboard();
    else if (state.page === 'company') renderCompany();
    else if (state.page === 'compare') renderCompare();
    else if (state.page === 'ratios') renderRatios();
    else if (state.page === 'screener') renderScreener();
    else if (state.page === 'trends') renderTrends();
  }

  function buildYearPills() {
    const root = $('#yearPills');
    root.innerHTML = '';
    YEARS.forEach(y => {
      const b = document.createElement('button');
      b.textContent = y;
      if (y === state.year) b.classList.add('active');
      b.onclick = () => {
        state.year = y;
        $$('#yearPills button').forEach(x => x.classList.toggle('active', x === b));
        rerender();
      };
      root.appendChild(b);
    });
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function init() {
    $('#footCompanies').textContent = DATA.length;
    $('#footYears').textContent = YEARS[0] + '–' + YEARS[YEARS.length - 1];
    $('#footMetrics').textContent = METRICS.length;

    buildYearPills();

    // Sidebar nav
    $$('.nav-item').forEach(el => el.addEventListener('click', () => setPage(el.dataset.page)));

    // Trend chips
    $$('[data-trend]').forEach(b => {
      b.addEventListener('click', () => {
        $$('[data-trend]').forEach(x => x.classList.toggle('active', x === b));
        state.selectedTrend = b.dataset.trend;
        drawTrendChart();
      });
    });

    // Search
    $('#globalSearch').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = e.target.value.trim().toUpperCase();
        const c = DATA.find(d => d.symbol === v);
        if (c) {
          state.company = v;
          setPage('company');
          e.target.value = '';
        } else {
          toast('Emiten tidak ditemukan: ' + v);
        }
      }
    });

    // Leaderboard controls
    $('#lbMetric').addEventListener('change', renderLeaderboard);
    $('#lbOrder').addEventListener('change', renderLeaderboard);
    $('#lbLimit').addEventListener('change', renderLeaderboard);

    // Company select
    $('#companySelect').addEventListener('change', e => {
      state.company = e.target.value;
      renderCompany();
    });

    // Compare metric change
    $('#cmpMetric').addEventListener('change', drawCompareLine);

    setPage('overview');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
