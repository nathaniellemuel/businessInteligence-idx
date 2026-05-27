// Convert data_clean_pivot.csv -> data.js for the dashboard
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'data_clean_pivot.csv');
const OUT = path.join(__dirname, 'data.js');

const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);

function splitCsv(line) {
  // Split on ; respecting quoted fields
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ';' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const header = splitCsv(lines[0]);
// header[0] = symbol; rest = "sum(YYYY)_<Metric>"
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

const out = `// Auto-generated from data_clean_pivot.csv. Do not edit by hand.
window.IDX_META = ${JSON.stringify({ years, metrics }, null, 2)};
window.IDX_DATA = ${JSON.stringify(data)};
`;
fs.writeFileSync(OUT, out, 'utf8');
console.log('Wrote', OUT, 'with', data.length, 'companies, years:', years.join(','), ', metrics:', metrics.length);
