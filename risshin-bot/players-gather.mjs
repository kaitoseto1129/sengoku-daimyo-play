// GitHub Actions の最後の job：20本の遊び手の結果を合わせて、置き場の risshin-players/ に まとめ.md を書く
// 使い方：node players-gather.mjs --in=集めた置き場 --dest=risshin-players --start=0 --count=200 [--fixed=risshin-bot/fixed.json] [--config=risshin-bot/players.json]
//   --in の下の */history.jsonl・*/*.md・*/shots/* を読む（artifact を download-artifact で展開した所）
// まとめ.md は「直近1万人（足りなければ今までの全員）のうち何人が困ったか」の順。同じ問題は鍵の数字を均して束ねる
// 置き場を太らせない：記録は回ごとの history/<回>.jsonl（書いたら二度と書き直さない）で、直近1万人より古い回の物は消す。
//   写真は上位30件の分だけ（一度残した写真は、その問題が上位にいる間は替えない）。latest/ は最新の回だけ
// 直った印（fixed.json：[{ "key": "鍵か見出しの一部", "at": "2026-09-28T00:00:00Z", "note": "..." }]）が付いた物は、その時より前の回を数えない
// 印が無くても、最後に出たあと同じ戦を20人が遊んで一度も出なければ「直ったらしい」として下へ移す
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ROWS, TOTAL, NAMES, ORDER } from './players-table.mjs';

const args = process.argv.slice(2);
const arg = (k, d = '') => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const IN = arg('in'), DEST = arg('dest', 'risshin-players');
const START = +arg('start', '0'), COUNT = +arg('count', '100');
const FIXED = arg('fixed', 'risshin-bot/fixed.json');
let CONF = {}; try { CONF = JSON.parse(readFileSync(arg('config', 'risshin-bot/players.json'), 'utf8')); } catch (e) { /* 無ければ決まりの値 */ }
const WINDOW = +(CONF.window || 10000), TOPSHOTS = +(CONF.topShots || 30);
const PN = { chu: '中学生', reki: '歴史好き', act: 'アクション好き', sen: '戦略家', sek: 'せっかち' };
const PN2 = { chu: 'はじめての中学生', reki: '歴史好きの大人', act: 'アクション好き', sen: '指揮好きの戦略家', sek: 'せっかちな社会人' };
const now = new Date();
const RUN = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(2);   // 例 2609280140
mkdirSync(join(DEST, 'shots'), { recursive: true });

// ---- 1. この回の結果を読む ----
const walk = (d, out = []) => { if (!existsSync(d)) return out; for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f, out); else out.push(f); } return out; };
const files = IN ? walk(IN) : [];
const shotSrc = new Map(files.filter((f) => /\/shots\/[^/]+\.(jpg|png)$/.test(f)).map((f) => [basename(f), f]));
const fresh = [];
for (const f of files.filter((x) => x.endsWith('history.jsonl'))) {
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) { try { fresh.push(JSON.parse(l)); } catch (e) { /* 壊れた行は捨てる */ } }
}
// 写真の名を回ごとに変える（1万人で一回りすると同じ番号がまた来るので）
const ren = (s) => (s ? `shots/${RUN}_${basename(s)}` : '');
const cut = (x, n) => (x == null ? x : String(x).slice(0, n));
const srcOf = new Map();   // 新しい写真の名 → artifact の中の名
for (const r of fresh) {
  r.run = RUN; r.feel = cut(r.feel, 400);
  // 記録は細くする（置き場を太らせない）
  r.issues = (r.issues || []).slice(0, 25).map((it) => { const o = { key: cut(it.key, 90), cat: it.cat, title: cut(it.title, 80), what: cut(it.what, 160), where: cut(it.where, 70), sev: it.sev, count: it.count, battles: (it.battles || []).slice(0, 3), fix: cut(it.fix, 90) }; if (it.shot) { o.shot = ren(it.shot); srcOf.set(basename(o.shot), basename(it.shot)); } return o; });
}
const logs = files.filter((f) => f.endsWith('loop.log')).map((f) => readFileSync(f, 'utf8')).join('');

// ---- 2. 積み重ね：回ごとの history/<回>.jsonl。直近 WINDOW 人より古い回の物は消す ----
const HD = join(DEST, 'history');
mkdirSync(HD, { recursive: true });
const HP = join(DEST, 'history.jsonl');   // 前の形（一つの物）は history/ へ移す
if (existsSync(HP)) { writeFileSync(join(HD, '0000000000.jsonl'), readFileSync(HP, 'utf8')); rmSync(HP); }
if (fresh.length) writeFileSync(join(HD, `${RUN}.jsonl`), fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
const hfiles = readdirSync(HD).filter((f) => f.endsWith('.jsonl')).sort();
const perFile = hfiles.map((f) => readFileSync(join(HD, f), 'utf8').split('\n').filter(Boolean));
let keepFrom = 0, n = 0;
for (let i = perFile.length - 1; i >= 0; i--) { if (n >= WINDOW) { keepFrom = i + 1; break; } n += perFile[i].length; }
hfiles.slice(0, keepFrom).forEach((f) => rmSync(join(HD, f)));
const runs = perFile.slice(keepFrom).flat().slice(-WINDOW).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);

// ---- 3. 一人ずつの感想（この回の分だけ latest/ に。写真の先は ../shots/） ----
if (fresh.length) rmSync(join(DEST, 'latest'), { recursive: true, force: true });   // 一人も取れなかった回は前の latest を残す
mkdirSync(join(DEST, 'latest'), { recursive: true });
for (const f of files.filter((x) => /\/p\d{4}_[^/]+\.md$/.test(x))) {
  const t = readFileSync(f, 'utf8').replace(/\]\(shots\/([^)]+)\)/g, (m, n) => `](../shots/${RUN}_${n})`);
  writeFileSync(join(DEST, 'latest', basename(f)), t);
}

// ---- 4. 束ねて数える ----
let fixed = [];
try { fixed = JSON.parse(readFileSync(FIXED, 'utf8')); } catch (e) { /* 印が無ければ無し */ }
const norm = (k) => String(k).replace(/\d+(\.\d+)?/g, '#');
const markOf = (m) => fixed.filter((x) => x && x.key && (m.key.includes(norm(x.key)) || m.title.includes(x.key))).map((x) => x.at).sort().pop() || '';
const M = new Map();
runs.forEach((r, ri) => {
  const seen = new Set();
  for (const it of r.issues || []) {
    const k = norm(it.key);
    const m = M.get(k) || { key: k, title: it.title, cat: it.cat, fix: it.fix, occ: [], sev: 0, times: 0, battles: new Set() };
    m.occ.push({ ri, at: r.at, persona: r.persona, size: r.size || '', v: r.v || '', sev: it.sev, count: it.count, what: it.what, where: it.where, shot: it.shot, first: !seen.has(k) });
    seen.add(k);
    (it.battles || []).forEach((b) => m.battles.add(b));
    M.set(k, m);
  }
});
const live = [], gone = [];
for (const m of M.values()) {
  const mark = markOf(m);
  const occ = mark ? m.occ.filter((o) => o.at > mark) : m.occ;
  if (!occ.length) { gone.push({ ...m, why: `直した印（${mark.slice(0, 10)}）のあと出ていない`, before: new Set(m.occ.map((o) => o.ri)).size, lastAt: m.occ[m.occ.length - 1].at }); continue; }
  const who = new Set(occ.map((o) => o.ri));
  const last = occ[occ.length - 1];
  const after = runs.slice(last.ri + 1).filter((r) => !m.battles.size || (r.battles || []).some((b) => m.battles.has(b)));
  const x = { ...m, occ, mark, people: who.size, personas: new Set(occ.map((o) => o.persona)), sev: Math.max(...occ.map((o) => o.sev)), times: occ.reduce((a, o) => a + (o.count || 1), 0), last, lastAt: last.at, shot: [...occ].reverse().find((o) => o.shot && existsSync(join(DEST, o.shot)))?.shot || [...occ].reverse().find((o) => o.shot && srcOf.has(basename(o.shot)))?.shot || '' };
  // 直ったらしい：最後に出たあと同じ戦を遊んだ人が、出る割合から見て3回は出ているはずの数（20人以上）を超えても出ない
  const expo = runs.slice(0, last.ri + 1).filter((r) => !m.battles.size || (r.battles || []).some((b) => m.battles.has(b))).length || 1;
  const rate = Math.min(1, who.size / expo);
  if (after.length >= Math.max(20, Math.ceil(3 / rate))) gone.push({ ...x, why: `最後に出たあと、同じ戦を${after.length}人が遊んで出ていない`, before: who.size });
  else live.push(x);
}
live.sort((a, b) => b.people - a.people || b.sev - a.sev || b.times - a.times);
gone.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));

// どんな遊び手に多いか（画面・癖・遊ぶ所）
const vq = (v, k) => (String(v).match(new RegExp(`(?:^|&)${k}=([^&]+)`)) || [])[1] || '';
function lean(m) {
  const ppl = new Map(); for (const o of m.occ) ppl.set(o.ri, o);
  const L = [...ppl.values()];
  const part = (f, nm) => { const c = {}; for (const o of L) { const k = f(o); if (k) c[k] = (c[k] || 0) + 1; } const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length && e[0][1] >= Math.max(2, L.length * 0.5) ? `${nm(e[0][0])}${e[0][1]}人` : ''; };
  return [
    part((o) => (/^1280/.test(o.size) ? 'pc' : o.size ? 'phone' : ''), (k) => (k === 'pc' ? 'パソコン' : 'iPhone')),
    part((o) => vq(o.v, 'habit'), (k) => NAMES.habit[k] || k),
    part((o) => vq(o.v, 'mode'), (k) => NAMES.mode[k] || k),
  ].filter(Boolean).join('・') || 'ばらけている';
}

// ---- 5. まとめ.md ----
const cur = (() => { try { return JSON.parse(readFileSync(join(DEST, 'cursor.json'), 'utf8')); } catch (e) { return { next: 0, round: 0, history: [] }; } })();
const got = new Set(fresh.map((r) => r.id));
const missed = [];
for (let i = 0; i < COUNT; i++) { const id = (START + i) % TOTAL; if (!got.has(id)) missed.push(id); }
const esc = (s) => String(s || '').replace(/\|/g, '／').replace(/\n/g, ' ');
const pname = (s) => [...s].map((k) => PN[k] || k).join('・');
const L = [
  '# テストプレイヤー（1万人）のまとめ：改善候補（多くの人が困った順）', '',
  `更新 ${now.toISOString().slice(0, 16).replace('T', ' ')}（UTC）　／　数えた人 直近${runs.length}人　／　残っている問題 ${live.length}件　／　直った・直ったらしい物 ${gone.length}件`, '',
  `この回：${START}〜${(START + COUNT - 1) % TOTAL}番の${COUNT}人を GitHub Actions で遊ばせ、${fresh.length}人の記録が取れた${missed.length ? `（取れなかった番：${missed.slice(0, 30).join('・')}${missed.length > 30 ? ' ほか' : ''}）` : ''}。遊んだ版 ${[...new Set(fresh.map((r) => r.ver).filter(Boolean))].join('・') || '—'}`, '',
  `並べ方：直近${WINDOW}人（まだ足りなければ今までの全員）のうち困った人の数 → 困り具合（★3＝やめたくなった）→ のべ回数。同じ問題は一つに束ねる（鍵の数字は均す）。`,
  '直したら reports/players-fixed.json に鍵（下の表の右端）と時を書いて mkpages で出す → その時より前の回は数えない。印が無くても、最後に出たあと同じ戦を遊んだ人が「出る割合なら3回は出ているはずの数（20人以上）」を超えて出なければ「直ったらしい」へ移す。', '',
  '| 順 | 改善候補 | 困った人 | 性格 | 困り具合 | 多かった遊び手 | どこで | 直し方の目安 | 鍵 |', '|---|---|---|---|---|---|---|---|---|',
];
live.slice(0, 60).forEach((m, i) => L.push(`| ${i + 1} | ${esc(m.title)}${m.shot ? ` [画面](${m.shot})` : ''} | ${m.people}人 | ${pname(m.personas)} | ${'★'.repeat(m.sev)} | ${esc(lean(m))} | ${esc([...m.battles].slice(0, 3).join('・')) || '—'} | ${esc(m.fix) || '—'} | \`${esc(m.key).slice(0, 60)}\` |`));
if (live.length > 60) L.push('', `ほか ${live.length - 60} 件（困った人が少ない物）`);
L.push('', '## 上位の中身', '');
live.slice(0, 15).forEach((m, i) => {
  const o = m.last;
  L.push(`${i + 1}. **${m.title}**（${m.people}人・${pname(m.personas)}）`, `   - 何が：${o.what || '—'}`, `   - どこで：${o.where || '—'}`, `   - 最後に出た人：${o.v ? (vq(o.v, 'row') || '') + '番' : ''}（${PN[o.persona] || o.persona}・${o.size}）`, '');
});
L.push('## 性格ごとの最新の感想', '');
for (const k of ORDER) {
  const rs = runs.filter((r) => r.persona === k).slice(-2);
  for (const r of rs) L.push(`- **${PN2[k]}**（${r.id != null ? r.id + '番・' : ''}${r.label || r.size || ''}・${(r.battles || []).join('、') || '戦なし'}${r.cut ? '・' + r.cut : ''}）${r.run === RUN ? `[感想](latest/${r.file})` : ''}`, `  > ${esc(r.feel) || '（感想を書く前に止まった）'}`);
}
if (gone.length) { L.push('', '## 直った・直ったらしい物', ''); gone.slice(0, 30).forEach((m) => L.push(`- ${m.title}（${m.why}。前は${m.before}人）`)); }
const fails = logs.split('\n').filter((l) => /データが取れなかった|打ち切る|失敗/.test(l)).slice(0, 20);
if (fails.length) L.push('', '## この回に止まった人', '', ...fails.map((l) => `- ${esc(l).slice(0, 200)}`));
L.push('', `遊び手の表：risshin-bot/players-table.mjs（性格5 × 癖・画面・遊ぶ所・速さ・身分・問屋・見え方・戦の数・感度・止める。種で決まる${TOTAL}通り）。一人ずつの感想は latest/（この回の分）。写真は上位${TOPSHOTS}件の分だけ残す。`);
writeFileSync(join(DEST, 'まとめ.md'), L.join('\n') + '\n');
writeFileSync(join(DEST, 'summary.json'), JSON.stringify({ made: now.toISOString(), runs: runs.length, live: live.slice(0, 60).map((m) => ({ key: m.key, title: m.title, cat: m.cat, people: m.people, who: [...m.personas], sev: m.sev, times: m.times, lean: lean(m), battles: [...m.battles].slice(0, 4), fix: m.fix, what: m.last.what, shot: m.shot })), liveN: live.length, gone: gone.slice(0, 30).map((m) => ({ title: m.title, why: m.why })) }, null, 1));

// ---- 6. 写真：上位の分だけ残す（ほかは消す＝置き場を太らせない） ----
const need = new Set(live.slice(0, TOPSHOTS).map((m) => m.shot).filter(Boolean).map((s) => basename(s)));
for (const f of need) if (!existsSync(join(DEST, 'shots', f)) && srcOf.has(f) && shotSrc.has(srcOf.get(f))) copyFileSync(shotSrc.get(srcOf.get(f)), join(DEST, 'shots', f));
for (const f of readdirSync(join(DEST, 'shots'))) if (!need.has(f)) rmSync(join(DEST, 'shots', f), { force: true });

// ---- 7. どこまで回したか ----
// 一人も取れなかった回（全部落ちた）は進めない＝同じ人たちを次の回にもう一度
if (fresh.length) { cur.next = (START + COUNT) % TOTAL; if (cur.next < START || COUNT >= TOTAL) cur.round = (cur.round || 0) + 1; }
cur.history = [...(cur.history || []), { at: now.toISOString(), start: START, count: COUNT, got: fresh.length }].slice(-50);
writeFileSync(join(DEST, 'cursor.json'), JSON.stringify(cur, null, 1) + '\n');
console.log(`記録 ${fresh.length}/${COUNT} 人・残っている問題 ${live.length} 件・次は ${cur.next} 番から`);
