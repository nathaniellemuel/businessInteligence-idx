// Convert data_clean_pivot.csv + k_means.csv + regresi_linear.csv -> data.js
// Run from project root:  node dashboard/build_data.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'clean', 'data_clean_pivot.csv');
const KM = path.join(ROOT, 'data', 'models', 'k_means.csv');
const RL = path.join(ROOT, 'data', 'models', 'regresi_linear.csv');
const OUT = path.join(__dirname, 'data.js');

function splitCsv(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ';' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// ---- Load pivot ----
const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
const header = splitCsv(lines[0]);
const fieldDefs = header.slice(1).map(h => {
  const m = h.match(/sum\((\d{4})\)_(.+)/);
  return m ? { year: m[1], metric: m[2] } : { year: null, metric: h };
});
const years = [...new Set(fieldDefs.map(f => f.year).filter(Boolean))];
const metrics = [...new Set(fieldDefs.map(f => f.metric))];

const data = [];
for (let i = 1; i < lines.length; i++) {
  const cells = splitCsv(lines[i]);
  if (cells.length < header.length) continue;
  const symbol = cells[0].trim();
  if (!symbol) continue;
  const obj = { symbol, byYear: {} };
  years.forEach(y => obj.byYear[y] = {});
  for (let j = 1; j < header.length; j++) {
    const def = fieldDefs[j - 1];
    const v = cells[j];
    const num = (v === '' || v === undefined || v === null) ? null : Number(v);
    obj.byYear[def.year][def.metric] = isNaN(num) ? null : num;
  }
  data.push(obj);
}

// Symbols sorted alphabetically (this is the row order in source pivot — RapidMiner exports keep this order)
// Confirm by id range below.

// ---- Load k_means ----
let clusterByIdx = {}; // 0-based row index -> cluster_n
let kmFeatures = [];
try {
  const kraw = fs.readFileSync(KM, 'utf8');
  const klines = kraw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const khead = splitCsv(klines[0]);
  // Find the cluster + id columns
  const idIdx = khead.findIndex(h => /^"?id"?$/i.test(h.trim()));
  const cIdx = khead.findIndex(h => /^"?cluster"?$/i.test(h.trim()));
  const featureIdx = khead.map((h, i) => ({ h: h.trim(), i }))
    .filter(x => x.i !== idIdx && x.i !== cIdx);
  kmFeatures = featureIdx.map(x => x.h);
  for (let i = 1; i < klines.length; i++) {
    const cells = splitCsv(klines[i]);
    const id = parseInt(cells[idIdx], 10);
    const c = (cells[cIdx] || '').replace(/"/g, '').trim();
    if (!isNaN(id) && c) {
      // id is 1-based row index in the original pivot
      const arrIdx = id - 1;
      const feats = {};
      featureIdx.forEach(x => {
        const v = Number(cells[x.i]);
        feats[x.h] = isNaN(v) ? null : v;
      });
      clusterByIdx[arrIdx] = { cluster: c, features: feats };
    }
  }
} catch (e) {
  console.warn('k_means.csv not loaded:', e.message);
}

// Attach cluster to companies (assuming pivot order matches)
data.forEach((c, i) => {
  if (clusterByIdx[i]) {
    c.cluster = clusterByIdx[i].cluster;
    c.kmFeatures = clusterByIdx[i].features;
  } else {
    c.cluster = null;
  }
});

// Determine cluster health label by examining mean of features per cluster.
// Higher mean on net income / equity / revenue / assets => "Sehat",
// Lowest => "Beresiko", in-between => "Stabil".
const clusterStats = {};
data.forEach(c => {
  if (!c.cluster || !c.kmFeatures) return;
  if (!clusterStats[c.cluster]) clusterStats[c.cluster] = { count: 0, sum: {}, members: [] };
  clusterStats[c.cluster].count++;
  clusterStats[c.cluster].members.push(c.symbol);
  Object.entries(c.kmFeatures).forEach(([k, v]) => {
    if (typeof v === 'number') {
      clusterStats[c.cluster].sum[k] = (clusterStats[c.cluster].sum[k] || 0) + v;
    }
  });
});
Object.values(clusterStats).forEach(s => {
  s.mean = {};
  Object.entries(s.sum).forEach(([k, v]) => s.mean[k] = v / s.count);
});

// Score each cluster by averaging mean of "positive" health metrics
const POSITIVE_KEYS = kmFeatures.filter(h =>
  /Net Income|Total Equity|Total Revenue|Total Assets|Current Assets|End Cash/i.test(h)
);
const NEGATIVE_KEYS = kmFeatures.filter(h => /Liabilit/i.test(h));
const clusterScores = {};
Object.entries(clusterStats).forEach(([cl, s]) => {
  let pos = 0; let np = 0;
  POSITIVE_KEYS.forEach(k => { if (typeof s.mean[k] === 'number') { pos += s.mean[k]; np++; } });
  let neg = 0; let nn = 0;
  NEGATIVE_KEYS.forEach(k => { if (typeof s.mean[k] === 'number') { neg += s.mean[k]; nn++; } });
  // Healthy = high positive, low liabilities
  clusterScores[cl] = (np ? pos / np : 0) - (nn ? neg / nn : 0);
});

// Compute raw financial averages per cluster (for labeling + UI display)
function safeDiv(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number' || b === 0) return null;
  const v = a / b;
  return isFinite(v) ? v : null;
}
const lastY = years[years.length - 1];
const rawStats = {};
data.forEach(c => {
  if (!c.cluster) return;
  if (!rawStats[c.cluster]) rawStats[c.cluster] = { rev: [], ni: [], assets: [], eq: [], li: [], roe: [], roa: [], npm: [], der: [], cr: [] };
  const r = c.byYear[lastY] || {};
  const rev = r['Total Revenue'];
  const ni = r['Net Income'];
  const ta = r['Total Assets'];
  const eq = r['Total Equity Gross Minority Interest'];
  const tl = r['Total Liabilities Net Minority Interest'];
  const ca = r['Current Assets'];
  const cl = r['Current Liabilities'];
  if (typeof rev === 'number') rawStats[c.cluster].rev.push(rev);
  if (typeof ni === 'number') rawStats[c.cluster].ni.push(ni);
  if (typeof ta === 'number') rawStats[c.cluster].assets.push(ta);
  if (typeof eq === 'number') rawStats[c.cluster].eq.push(eq);
  if (typeof tl === 'number') rawStats[c.cluster].li.push(tl);
  const roe = safeDiv(ni, eq); if (roe !== null) rawStats[c.cluster].roe.push(roe * 100);
  const roa = safeDiv(ni, ta); if (roa !== null) rawStats[c.cluster].roa.push(roa * 100);
  const npm = safeDiv(ni, rev); if (npm !== null) rawStats[c.cluster].npm.push(npm * 100);
  const der = safeDiv(tl, eq); if (der !== null) rawStats[c.cluster].der.push(der);
  const cr = safeDiv(ca, cl); if (cr !== null) rawStats[c.cluster].cr.push(cr);
});
function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
const rawSummary = {};
Object.entries(rawStats).forEach(([cl, s]) => {
  rawSummary[cl] = {
    avgRevenue: mean(s.rev), avgNetIncome: mean(s.ni), avgAssets: mean(s.assets),
    avgEquity: mean(s.eq), avgLiabilities: mean(s.li),
    medROE: median(s.roe), medROA: median(s.roa), medNPM: median(s.npm),
    medDER: median(s.der), medCR: median(s.cr)
  };
});

// LABELING STRATEGY:
// k-means dengan data terstandarisasi cenderung memisahkan outlier (raksasa) ke cluster sendiri.
// 1. Cluster terbesar (>50% emiten) = "Stabil" — populasi normal pasar.
// 2. Sisa cluster: yang punya rata-rata Net Income, ROE, & Equity lebih tinggi = "Sehat".
//    Yang lebih rendah / DER lebih tinggi = "Beresiko".
const totalCount = data.filter(c => c.cluster).length;
const sortedBySize = Object.entries(clusterStats).sort((a, b) => b[1].count - a[1].count).map(x => x[0]);
const labels = {};
if (sortedBySize.length === 0) {
  // nothing
} else if (sortedBySize.length === 1) {
  labels[sortedBySize[0]] = 'Stabil';
} else if (sortedBySize.length === 2) {
  // Pick higher health score as Sehat, other as Beresiko
  const sortedByScore = sortedBySize.slice().sort((a, b) => clusterScores[b] - clusterScores[a]);
  labels[sortedByScore[0]] = 'Sehat';
  labels[sortedByScore[1]] = 'Beresiko';
} else {
  // 3+ clusters: largest = Stabil, then rank remaining by health score
  const big = sortedBySize[0];
  const bigShare = clusterStats[big].count / totalCount;
  if (bigShare > 0.5) {
    labels[big] = 'Stabil';
    const remaining = sortedBySize.slice(1).sort((a, b) => clusterScores[b] - clusterScores[a]);
    labels[remaining[0]] = 'Sehat';
    labels[remaining[remaining.length - 1]] = 'Beresiko';
    for (let i = 1; i < remaining.length - 1; i++) labels[remaining[i]] = 'Stabil';
  } else {
    // No dominant cluster: rank by score
    const ranked = sortedBySize.slice().sort((a, b) => clusterScores[b] - clusterScores[a]);
    labels[ranked[0]] = 'Sehat';
    labels[ranked[ranked.length - 1]] = 'Beresiko';
    for (let i = 1; i < ranked.length - 1; i++) labels[ranked[i]] = 'Stabil';
  }
}

data.forEach(c => {
  if (c.cluster) c.clusterLabel = labels[c.cluster] || 'Stabil';
  else c.clusterLabel = null;
});

// ---- Linear regression on raw EPS for prediction ----
// y = a + b*x, where x = year - YEAR0 (0..3)
function linearReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  // R²
  const yMean = sy / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yp = a + b * xs[i];
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - yp) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { a, b, r2 };
}

const YEARS_NUM = years.map(y => parseInt(y, 10)).sort();
const YEAR0 = YEARS_NUM[0];

data.forEach(c => {
  const xs = []; const ys = [];
  years.forEach(y => {
    const v = c.byYear[y] && c.byYear[y]['Basic EPS'];
    if (typeof v === 'number' && !isNaN(v)) {
      xs.push(parseInt(y, 10) - YEAR0);
      ys.push(v);
    }
  });
  c.epsHistory = years.map(y => ({
    year: parseInt(y, 10),
    eps: (c.byYear[y] && c.byYear[y]['Basic EPS']) ?? null
  }));
  const reg = linearReg(xs, ys);
  c.epsModel = reg;
  if (reg) {
    const FUTURE = [2024, 2025, 2026, 2027, 2028];
    c.epsForecast = FUTURE.map(yy => ({
      year: yy,
      eps: reg.a + reg.b * (yy - YEAR0)
    }));
  } else {
    c.epsForecast = [];
  }
});

// ---- Write output ----
const out = `// Auto-generated from data_clean_pivot.csv + k_means.csv + regresi_linear.csv. Do not edit by hand.
window.IDX_META = ${JSON.stringify({
  years,
  metrics,
  clusterLabels: labels,
  clusterCounts: Object.fromEntries(Object.entries(clusterStats).map(([k, v]) => [k, v.count])),
  clusterStats: Object.fromEntries(Object.entries(clusterStats).map(([k, v]) => [k, { mean: v.mean, count: v.count }])),
  clusterRawSummary: rawSummary
}, null, 2)};
window.IDX_DATA = ${JSON.stringify(data)};
`;
fs.writeFileSync(OUT, out, 'utf8');

const summary = {};
data.forEach(c => { if (c.clusterLabel) summary[c.clusterLabel] = (summary[c.clusterLabel] || 0) + 1; });
console.log('Wrote', OUT, 'with', data.length, 'companies, years:', years.join(','), ', metrics:', metrics.length);
console.log('Cluster mapping:', labels);
console.log('Cluster distribution:', summary);
console.log('EPS forecast example (first company):',
  data[0].symbol, 'history:', data[0].epsHistory.map(h => h.eps).join(','), '→',
  data[0].epsForecast.map(f => f.eps.toFixed(1)).join(','));
