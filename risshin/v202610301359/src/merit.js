// 手柄の点（kaito 10/29）：自分で討った雑兵一人1点・名のある侍や武将一人3点・敵の大将を討つかミッション達成で20点（一度だけ）。
// 点は戦をまたいで G.tegara に貯まり、点で位が上がる。位は今の身分（state.js の RANKS の番号 G.rank）にも写す（その戦の上限 ceil まで）。
// 今は稲生だけ（kaito：ほかの戦は稲生を見てから）。ほかの戦で使う時は ON に足す。
// state.js から読むので、ここから state.js は読まない（輪にしない）。
export const TEGARA_ON = new Set(['inou']);
const BOSS = { inou: '林美作守' };   // 戦の表（taisho.js）に敵の大将が無い戦の大将

// 位の段：pt はそこへ上がる点、rank はその位に当てる RANKS の番号
export const TEGARA_LADDER = [
  { name: '足軽', pt: 0, rank: 0 },
  { name: '足軽組頭', pt: 30, rank: 2 },
  { name: '徒士', pt: 90, rank: 3 },
  { name: '侍', pt: 180, rank: 4 },
  { name: '侍大将', pt: 320, rank: 4 },
  { name: '部将', pt: 520, rank: 4 },
  { name: '家老', pt: 800, rank: 4 },
  { name: '城主', pt: 1200, rank: 4 },
];
export const tegaraStep = (pt) => { let i = 0; while (i + 1 < TEGARA_LADDER.length && pt >= TEGARA_LADDER[i + 1].pt) i++; return i; };
export const tegaraTitle = (pt) => TEGARA_LADDER[tegaraStep(pt)].name;
// 前の保存（点を持たない）は、今の身分に当たる段の点から始める（位が下がって見えないように）
export function tegaraSeed(G) {
  if (G.tegara != null) return G.tegara;
  const i = TEGARA_LADDER.findIndex((l) => l.rank >= (G.rank || 0));
  return i <= 0 ? 0 : TEGARA_LADDER[i].pt;
}

const on = (rt) => rt && !rt.def.dojo && !rt.def.town && TEGARA_ON.has(rt.def.key);

// battle.js の onKill（自分が討った時）から
export function tegaraKill(rt, v) {
  if (!on(rt) || v.civ || v.isStruct || v.type === 'dummy') return;
  const t = rt.tracker.tegara || (rt.tracker.tegara = { zako: 0, named: 0, boss: false });
  const isBoss = rt.taisho?.b?.u === v || (v.type === 'busho' && v.name && v.name === BOSS[rt.def.key]);
  if (isBoss) t.boss = true;
  else if (v.type === 'busho' || (v.type === 'samurai' && v.name)) t.named++;
  else t.zako++;
}

// state.js の settle から。この戦の点を足し、位の前後を返す（手柄の点を使わない戦は null）
export function tegaraSettle(G, tr, id) {
  if (!TEGARA_ON.has(id)) return null;
  const t = tr.tegara || { zako: 0, named: 0, boss: false };
  const big = t.boss || tr.main === true ? 20 : 0;
  const pts = t.zako + t.named * 3 + big;
  const before = tegaraSeed(G);
  G.tegara = before + pts;
  const s0 = tegaraStep(before), s1 = tegaraStep(G.tegara);
  const next = TEGARA_LADDER[s1 + 1];
  return { zako: t.zako, named: t.named, big, pts, before, after: G.tegara, stepBefore: s0, stepAfter: s1,
    titleBefore: TEGARA_LADDER[s0].name, titleAfter: TEGARA_LADDER[s1].name, rank: TEGARA_LADDER[s1].rank,
    from: TEGARA_LADDER[s1].pt, to: next ? next.pt : null };
}

// 戦の後の画面の一段：点の内訳（印と数）と、位の段（点の棒）。説明の字は出さない
export function tegaraHtml(tg) {
  if (!tg) return '';
  const k = tg.to ? Math.max(0, Math.min(1, (tg.after - tg.from) / (tg.to - tg.from))) : 1;
  const k0 = tg.to && tg.stepBefore === tg.stepAfter ? Math.max(0, Math.min(1, (tg.before - tg.from) / (tg.to - tg.from))) : 0;
  const chip = (cls, n, p) => n ? `<span class="tg-c ${cls}"><i aria-hidden="true"></i>×${n}<small>+${p}</small></span>` : '';
  const steps = TEGARA_LADDER.map((l, i) => `<span class="tg-s${i < tg.stepAfter ? ' done' : ''}${i === tg.stepAfter ? ' now' : ''}${i > tg.stepBefore && i <= tg.stepAfter ? ' up' : ''}" title="${l.name}"></span>`).join('');
  return `<style>.tg{margin:8px 0;padding:8px 10px;border:1px solid rgba(194,162,90,.5);border-radius:6px;background:rgba(20,18,15,.35)}
.tg-r{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:16px}
.tg-c{display:inline-flex;align-items:center;gap:4px}.tg-c small{font-size:12px;opacity:.8}
.tg-c i{display:inline-block;width:12px;height:12px;background:#c9b48a;border-radius:50%}
.tg-c.n i{background:#c2a25a;border-radius:2px;transform:rotate(45deg)}
.tg-c.b i{width:16px;height:16px;background:#e8c04a;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.tg-p{margin-left:auto;font-size:22px;font-weight:700;color:#f0d890}
.tg-l{display:flex;align-items:center;gap:8px;margin-top:8px}
.tg-l b{font-size:18px;white-space:nowrap}.tg-l b.up{color:#f0d890}
.tg-bar{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;position:relative}
.tg-bar i{position:absolute;left:0;top:0;bottom:0;background:#c2a25a}.tg-bar i.old{background:#8a7650}
.tg-st{display:flex;gap:4px;margin-top:6px}.tg-s{width:14px;height:6px;border-radius:2px;background:rgba(255,255,255,.15)}
.tg-s.done{background:#8a7650}.tg-s.now{background:#c2a25a}.tg-s.up{background:#f0d890;box-shadow:0 0 4px #f0d890}</style>
<div class="tg" role="group" aria-label="手柄 ${tg.pts}点 ${tg.titleAfter}">
<div class="tg-r">${chip('z', tg.zako, tg.zako)}${chip('n', tg.named, tg.named * 3)}${tg.big ? chip('b', 1, tg.big) : ''}<span class="tg-p">+${tg.pts}</span></div>
<div class="tg-l">${tg.stepAfter > tg.stepBefore ? `<b>${tg.titleBefore}</b><span aria-hidden="true">→</span><b class="up">${tg.titleAfter}</b>` : `<b>${tg.titleAfter}</b>`}
<span class="tg-bar"><i style="width:${(k * 100).toFixed(1)}%"></i><i class="old" style="width:${(k0 * 100).toFixed(1)}%"></i></span><small>${tg.after}${tg.to ? `／${tg.to}` : ''}</small></div>
<div class="tg-st">${steps}</div></div>`;
}
