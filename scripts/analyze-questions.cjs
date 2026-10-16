/* 題庫分析：關卡數、題數分佈、選項數、類型統計（唯讀） */
const fs = require('fs');
const ts =
  fs.readFileSync('src/data/curriculumPart1.ts', 'utf8') +
  fs.readFileSync('src/data/curriculumPart2.ts', 'utf8');

const parts = ts.split(/lesson\('/);
const dist = {};
let totalQ = 0;
for (let i = 1; i < parts.length; i++) {
  const nxt = parts[i].indexOf("lesson('");
  const seg = nxt === -1 ? parts[i] : parts[i].slice(0, nxt);
  const cnt = (seg.match(/\bq\(/g) || []).length;
  dist[cnt] = (dist[cnt] || 0) + 1;
  totalQ += cnt;
}
console.log('總關卡:', parts.length - 1, '總題數:', totalQ);
console.log('每關題數分佈:', JSON.stringify(dist));

// 選項數
const ch = [...ts.matchAll(/\[([^\[\]]*?)\], \d+, /g)].map((m) => m[1].split(',').length);
const cd = {};
ch.forEach((n) => (cd[n] = (cd[n] || 0) + 1));
console.log('選項數分佈:', JSON.stringify(cd));

// kind 統計
const kinds = {};
for (const m of ts.matchAll(/'((?:concept|calc|scenario|data|order|detect|simulate|dialogue))',/g)) {
  kinds[m[1]] = (kinds[m[1]] || 0) + 1;
}
console.log('關卡 kind 分佈:', JSON.stringify(kinds));

// 可改造成實作（計算輸入）題的 calc 關：列出 id 與題幹
const lessons = [...ts.matchAll(/lesson\('([^']+)', '([^']+)', '([^']+)', '(\w+)'/g)];
console.log('calc/data 關卡數:', lessons.filter((m) => m[4] === 'calc' || m[4] === 'data').length);
