// 通し試遊の最後の job：一人の bot が新しく始めて全戦を続けて遊んだ記録（through.json）を、risshin-players/通し.md にまとめる
// 使い方：node through-gather.mjs --in=集めた置き場 --dest=risshin-players
// 書く物：通し.md（人が読む）・through.json（最新の回。誤りの鍵つき。毎日の頼みの元）・through-history.jsonl（回ごとの一行・直近60回）・through-shots/（写真）
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';
const args = process.argv.slice(2);
const arg = (k, d = '') => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const IN = arg('in'), DEST = arg('dest', 'risshin-players'), TOTAL = +arg('total', '31');
const walk = (d, o = []) => { if (!existsSync(d)) return o; for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); e.isDirectory() ? walk(f, o) : o.push(f); } return o; };
const files = IN ? walk(IN) : [];
const tj = files.find((f) => basename(f) === 'through.json');
const now = new Date();
const RUN = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(2);
mkdirSync(join(DEST, 'through-shots'), { recursive: true });
const HP = join(DEST, 'through-history.jsonl');
let hist = existsSync(HP) ? readFileSync(HP, 'utf8').split('\n').filter(Boolean) : [];
let md;
if (!tj) {
  const log = files.filter((f) => f.endsWith('loop.log')).map((f) => readFileSync(f, 'utf8')).join('').slice(-1500);
  md = `# 通し試遊のまとめ\n\n更新 ${now.toISOString().slice(0, 16)}（UTC）\n\nこの回は記録が取れませんでした（最初の戦にも入れなかったか、途中で落ちた）。\n\n\`\`\`\n${log}\n\`\`\`\n`;
  hist.push(JSON.stringify({ run: RUN, at: now.toISOString(), ok: false, reached: 0 }));
  writeFileSync(join(DEST, 'through.json'), JSON.stringify({ run: RUN, at: now.toISOString(), ok: false, errors: [{ key: 'through:record-none', title: '通し試遊の記録が取れない（最初の戦に入れない・途中で落ちた）', where: '通し', sev: 3 }] }));
} else {
  const t = JSON.parse(readFileSync(tj, 'utf8'));
  const shotSrc = new Map(files.filter((f) => /\/shots\/[^/]+\.(jpg|png)$/.test(f)).map((f) => [basename(f), f]));
  const keep = (s) => { const b = basename(s || ''); if (!b || !shotSrc.has(b)) return ''; const n = `${RUN}_${b}`; copyFileSync(shotSrc.get(b), join(DEST, 'through-shots', n)); return `through-shots/${n}`; };
  const clean = (n) => String(n).replace(/（途中で打ち切り）|（試験の持ち時間で打ち切り）/g, '');
  const bats = t.battles || [];
  const errors = [];
  const rankRe = /出世|昇進|身分|rank|評定|加増|禄|知行/;
  bats.forEach((b, i) => {
    const nm = clean(b.battle);
    const sh = keep((b.shots || [])[0]);
    if (b.main !== true && !b.cut && !b.timeout) errors.push({ key: `through:fail:${nm}`, title: `通し試遊で「${nm}」の任務が果たせなかった（${i + 1}戦目）`, where: nm, sev: 2, shot: sh });
    for (const e of b.errors || []) errors.push({ key: `through:err:${nm}:${e.slice(0, 50)}`, title: `通し試遊の「${nm}」で不具合：${e.slice(0, 90)}`, where: nm, sev: rankRe.test(e) ? 3 : 2, shot: sh, rank: rankRe.test(e) });
    for (const e of b.stuck || []) errors.push({ key: `through:stuck:${nm}:${e.slice(0, 50)}`, title: `通し試遊の「${nm}」で止まった・進めない：${e.slice(0, 90)}`, where: nm, sev: 3, shot: sh });
  });
  for (const it of t.issues || []) if (/出陣|城下|評定|進め|止ま|出世|昇進|身分|支度|問屋/.test(it.title || '') || /^camp-|^rank-|^stuck/.test(it.key || '')) errors.push({ key: `through:aud:${it.key}`, title: `通し試遊：${it.title}`, where: it.where || '', sev: it.sev || 2, shot: keep(it.shot) , rank: /出世|昇進|身分|評定/.test(it.title || '') });
  const reached = bats.filter((b) => !b.cut).length;
  const total = (t.plan || []).length || TOTAL;
  const last = bats.length ? clean(bats[bats.length - 1].battle) : '—';
  const stopped = reached < total;
  if (stopped) errors.push({ key: `through:stop:${stopped ? last : ''}`, title: `通し試遊が「${last}」までで止まった（${reached}/${total}戦。${t.cut || '理由は記録なし'}）`, where: last, sev: 3, shot: keep(((bats[bats.length - 1] || {}).shots || [])[0]) });
  const seen = new Set(); const uniq = errors.filter((e) => !seen.has(e.key) && seen.add(e.key));
  const rows = bats.map((b, i) => `| ${i + 1} | ${clean(b.battle)} | ${b.time}秒 | ${b.main === true ? '達成' : b.cut || b.timeout ? '打ち切り' : '失敗'}${b.down ? '・倒れた' : ''} | ${[...(b.errors || []).map((e) => '不具合：' + e.slice(0, 70)), ...(b.stuck || []).map((e) => '止まった：' + e.slice(0, 70))].join(' ／ ') || '—'} |`);
  md = [`# 通し試遊のまとめ（新しく始めて続けて遊ぶ）`, '', `更新 ${now.toISOString().slice(0, 16)}（UTC）　／　画面 ${t.size}　／　${Math.round((t.sec || 0) / 60)}分かけた`, '',
    `**${reached}/${total}戦まで進んだ**${stopped ? `　止まった所：「${last}」（${t.cut || '理由なし'}）` : '　最後まで遊べた'}`, '',
    '| 順 | 戦 | 時間 | 任務 | 不具合・止まり |', '|---|---|---|---|---|', ...rows, '',
    `## 誤り・止まり（${uniq.length}件）`, '', ...(uniq.length ? uniq.map((e, i) => `${i + 1}. ${e.rank ? '【出世の画面】' : ''}${'★'.repeat(e.sev || 1)} ${e.title}${e.shot ? ` [画面](${e.shot})` : ''}　鍵 \`${e.key}\``) : ['なし']), '',
    '## 感想', '', `> ${t.feel || '—'}`, ''].join('\n');
  hist.push(JSON.stringify({ run: RUN, at: now.toISOString(), ok: true, reached, total, stoppedAt: stopped ? last : '', errors: uniq.length }));
  writeFileSync(join(DEST, 'through.json'), JSON.stringify({ run: RUN, at: now.toISOString(), ok: true, reached, total, errors: uniq }));
}
writeFileSync(join(DEST, '通し.md'), md);
writeFileSync(HP, hist.slice(-60).join('\n') + '\n');
console.log(md.split('\n').slice(0, 8).join('\n'));
