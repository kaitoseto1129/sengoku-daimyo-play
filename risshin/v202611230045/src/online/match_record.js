// K603 P1（kaito_online_battle_1121 74・11/21 iMac k592-net）：詳しい報告と短い見返し。
//   試合の間、二秒ごとに各隊の居所・兵・状態を写し（見返しの絵）、出来事（翼の崩れ・予備の投入・総大将の討死・本陣の危機・戦法）を時刻つきで記す。
//   報告の勝因・敗因は、終わりの形だけでなく、この出来事の早い順から選ぶ（言葉は pvp_rules.matchReasons と同じ表＝match_link の英訳がそのまま効く）。
//   match.js の update が recTick、matchReport が reportExtra を呼ぶ。報告の画面（match_link.showMatchEnd）が mountReplay で見返しを出す。
//   記憶：十五分で四百五十コマ×八〜十二隊の数だけ（数十KB）。描く物は報告の画面の小さな canvas 一枚だけ
import { S as SET } from '../settings.js';
import { TACTICS } from './tactics.js';
const STEP = 2, MAXF = 600;
const code = (S) => (S.state === '敗走' ? 2 : S.state === '交戦中' || S._k603eng ? 1 : 0);
const wingOf = (S) => (S.line === 'honjin' ? 'honjin' : S.line === 'gotsume' ? 'gotsume' : S.slot === 'left' ? 'left' : S.slot === 'right' ? 'right' : 'center');

export function recTick(rt, M) {
  const t = rt.t - M.t0, R = (M.rec ||= { frames: [], ev: [], prev: new Map(), hq: ['', ''], tacN: 0, units: null, nextT: 0 });
  if (t < R.nextT) return; R.nextT = t + STEP;
  const L = M.sonae || [];
  if (!R.units) R.units = L.map((S) => ({ name: S.taisho || S.name, team: S.team ? 1 : 0, wing: wingOf(S), heishu: S.heishu || '' }));
  if (R.frames.length < MAXF) R.frames.push({ t: Math.round(t), s: L.map((S) => [Math.round(S.b.pos.x), Math.round(S.b.pos.z), Math.round(S.b.aliveNominal()), code(S)]) });
  const add = (e) => R.ev.push({ t: Math.round(t), ...e });
  L.forEach((S, i) => {
    const p = R.prev.get(S) || {}, team = S.team ? 1 : 0, who = S.taisho || S.name, wing = wingOf(S);
    if (S.state === '敗走' && p.state !== '敗走' && !p.routed) { add({ k: 'rout', team, who, wing }); p.routed = true; }
    if (wing === 'gotsume' && !p.in && (code(S) === 1 || S.b?.cmd?.id === 'attack' || S.b?.cmd?.id === 'charge')) { add({ k: 'reserve', team, who }); p.in = true; }
    if (S.taishoDead && !p.dead) { add({ k: 'taisho', team, who, chief: S.line === 'honjin' }); p.dead = true; }
    p.state = S.state; R.prev.set(S, p);
  });
  (M.hq || []).forEach((q, team) => { const st = q?.state || ''; if (st && st !== R.hq[team] && /UNDER_ATTACK|COLLAPSING|FALLEN/.test(st) && !R.ev.some((e) => e.k === 'hq' && e.team === team && e.st === st)) add({ k: 'hq', team, st }); R.hq[team] = st; });
  const tl = rt.tactics?.log || [];
  for (; R.tacN < tl.length; R.tacN++) { const x = tl[R.tacN]; const m = (rt.tactics.match || []).find((q) => q.id === x.id && q.team === x.team); add({ k: 'tactic', team: x.team, who: m?.s?.taisho || '', id: x.id, name: m?.nm?.ja || TACTICS[x.id]?.name || null }); }
}

// 勝因・敗因を出来事の早い順に（決着の訳は先頭）。言葉は matchReasons と同じ
export function eventReasons(M, r, base = []) {
  const R = M.rec; if (!R) return base;
  const win = r?.winner === 0, out = [], add = (s) => { if (s && !out.includes(s) && out.length < 3) out.push(s); };
  // K641 ②：総崩れは兵が三割を切った時、総大将の討死は総大将の名で（matchReasons と同じ言葉）
  const col = r?.sub === 'collapse', all = r?.sub === 'all';
  const first = { honjin: win ? '敵本陣陥落' : '本陣突破', rout: win ? (col ? '敵の兵が三割を切った' : '敵全軍の士気崩壊') : (col ? '兵が三割を切った' : '全軍の士気崩壊'), taisho: win ? '敵総大将討取' : all ? '武将が皆討たれた' : '総大将の討死', surrender: win ? '敵の降伏' : '降伏',
    time: r?.lead === 'loss' ? (win ? '討たれた兵が少なかった' : '討たれた兵が多かった') : null }[r?.why];
  add(first);
  if (r?.winner == null) return base.length ? base : ['両軍拮抗'];
  const foe = win ? 1 : 0;   // 崩れた側
  for (const e of R.ev) {
    if (e.k === 'rout' && e.team === foe && (e.wing === 'left' || e.wing === 'right')) add(win ? (e.wing === 'left' ? '敵左翼を突破' : '敵右翼を突破') : (e.wing === 'left' ? '左翼崩壊' : '右翼崩壊'));
    else if (e.k === 'taisho' && e.chief && e.team === foe) add(win ? '敵総大将討取' : '総大将の討死');
    else if (e.k === 'reserve' && e.team === 0 && win && R.ev.some((x) => x.k === 'rout' && x.team === 1 && x.t >= e.t && x.t - e.t < 90)) add('予備隊の投入');   // 予備を入れて九十秒の内に敵が崩れた
    else if (e.k === 'hq' && e.team === foe && e.st !== 'UNDER_ATTACK' && r.why !== 'honjin') add(win ? '敵本陣陥落' : '本陣突破');
  }
  if (!win) { const res = R.ev.find((e) => e.k === 'reserve' && e.team === 0); add(res ? (R.ev.some((e) => e.k === 'rout' && e.team === 0 && e.who === res.who) ? '予備隊消耗' : null) : '予備隊を使わなかった'); }
  for (const s of base) add(s);   // 足りなければ終わりの形から（士気で優勢・判定など）
  return out;
}

// 流れ（報告の下の短い年表）：自分の側から見た大きな出来事を三つまで（横長の携帯で一画面に収める）
const NAME_EN = { left: 'left wing', right: 'right wing', center: 'center', gotsume: 'reserve', honjin: 'HQ' };
const WING_JA = { left: '左翼', right: '右翼', center: '中央', gotsume: '後詰', honjin: '本陣' };
export function timeline(M, en = false) {
  const R = M.rec; if (!R) return [];
  const mm = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const L = [];
  for (const e of R.ev) {
    const mine = e.team === 0, who = e.who || '';
    let s = null;
    if (e.k === 'rout') s = en ? `${mine ? 'Our' : 'Enemy'} ${NAME_EN[e.wing]} broke (${who})` : `${mine ? '味方' : '敵'}の${WING_JA[e.wing]}が崩れた（${who}隊）`;
    else if (e.k === 'reserve') s = en ? `${mine ? 'We' : 'Enemy'} committed the reserve (${who})` : `${mine ? '' : '敵が'}後詰を入れた（${who}隊）`;
    else if (e.k === 'taisho') s = en ? `${who} fell${e.chief ? ' — commander' : ''}` : `${who}が討たれた${e.chief ? '（総大将）' : ''}`;
    else if (e.k === 'hq') s = en ? `${mine ? 'Our' : 'Enemy'} HQ ${e.st === 'FALLEN' ? 'fell' : e.st === 'COLLAPSING' ? 'was collapsing' : 'was attacked'}` : `${mine ? '味方' : '敵'}の本陣が${e.st === 'FALLEN' ? '落ちた' : e.st === 'COLLAPSING' ? '崩れかけた' : '攻められた'}`;
    else if (e.k === 'tactic' && mine) s = en ? `${who}: tactic` : `${who}が戦法『${e.name || '戦術'}』`;
    if (s) L.push({ t: e.t, s: `${mm(e.t)} ${s}` });
  }
  // 多い時は、崩れ・討死・本陣を先に残して時刻の順に五つ
  const pri = (x) => (/崩れ|broke|討たれ|fell|本陣|HQ/.test(x.s) ? 0 : 1);
  return L.map((x, i) => ({ ...x, i })).sort((a, b) => pri(a) - pri(b) || a.t - b.t).slice(0, 3).sort((a, b) => a.t - b.t).map((x) => x.s);
}
// 報告に足す物（match.js matchReport から）
export function reportExtra(M, r, base, en = false) {
  return { reasons: eventReasons(M, r, base), timeline: timeline(M, en), replay: M.rec ? { units: M.rec.units, frames: M.rec.frames, ev: M.rec.ev.map((e) => ({ t: e.t, k: e.k, team: e.team })) } : null };
}

// ---- 見返し：上から見た小さな図で、十二秒ほどで試合を早送りする。押せばもう一度 ----
//   自軍は青・敵は赤の丸（兵の数で大きさ）、崩れた隊は×、斬り合いは輪。出来事の時は小さな光。字は使わない（Simple）
export function mountReplay(host, rep, en = false) {
  if (!host || !rep?.frames?.length || typeof document === 'undefined') return null;
  const W = 200, H = 72, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = `width:${W}px;height:${H}px;display:block;margin:0 auto;border:1px solid rgba(201,180,138,.4);border-radius:4px;background:#3b4a2c`;
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', en ? 'Battle replay' : '合戦の見返し');
  // 釦を別に置かず、図そのものを押すともう一度（高さ100px・画面を広げない）
  cv.tabIndex = 0; cv.style.cursor = 'pointer'; cv.setAttribute('role', 'button'); cv.setAttribute('aria-label', en ? 'Battle replay — tap to watch again' : '合戦の見返し（押すともう一度）');
  host.append(cv);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  // 盤：全コマの居所から範囲を決める（自軍が下）
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of rep.frames) for (const [x, z] of f.s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const pad = 20, sx = (W - 16) / Math.max(60, x1 - x0 + pad * 2), sz = (H - 16) / Math.max(60, z1 - z0 + pad * 2), k = Math.min(sx, sz);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, P = (x, z) => [W / 2 + (x - cx) * k, H / 2 + (z - cz) * k];   // 自軍は −z（試合の決まり）＝画面の上…なので裏返す
  const Q = (x, z) => { const [a, b] = P(x, z); return [a, H - b]; };
  const N = rep.frames.length, dur = SET.reduceMotion ? 1 : 12000;   // 動きを減らす：早送りせず終わりの形だけ
  let t0 = 0, raf = 0;
  const draw = (now) => {
    if (!t0) t0 = now;
    const f = Math.min(N - 1, Math.floor(((now - t0) / dur) * N)), F = rep.frames[f];
    g.fillStyle = '#3b4a2c'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 1; i < 4; i++) g.fillRect(0, (H / 4) * i, W, 1);
    F.s.forEach(([x, z, n, c], i) => {
      const u = rep.units[i]; if (!u || n <= 0) return;
      const [a, b] = Q(x, z), r = 3 + Math.sqrt(n) * 0.22, col = u.team ? '#c8432e' : '#3f7fd0';
      if (c === 2) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(a - r, b - r); g.lineTo(a + r, b + r); g.moveTo(a + r, b - r); g.lineTo(a - r, b + r); g.stroke(); return; }
      g.fillStyle = col; g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.fill();
      if (u.wing === 'honjin') { g.strokeStyle = '#f2d27a'; g.lineWidth = 1.5; g.stroke(); }
      if (c === 1) { g.strokeStyle = 'rgba(255,240,200,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(a, b, r + 3, 0, Math.PI * 2); g.stroke(); }
    });
    // 出来事の光（その時刻の前後）
    for (const e of rep.ev) if (Math.abs(e.t - F.t) < 6 && (e.k === 'rout' || e.k === 'taisho' || e.k === 'hq')) { g.fillStyle = 'rgba(255,230,140,.25)'; g.fillRect(0, 0, W, 3); }
    // 進み（下の細い棒）
    g.fillStyle = 'rgba(242,210,122,.85)'; g.fillRect(0, H - 3, (W * (f + 1)) / N, 3);
    if (f < N - 1) raf = requestAnimationFrame(draw);
  };
  const play = () => { cancelAnimationFrame(raf); t0 = 0; raf = requestAnimationFrame(draw); };
  cv.addEventListener('click', (e) => { e.stopPropagation(); play(); }); cv.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); play(); } });
  play();
  return { play, dispose() { cancelAnimationFrame(raf); cv.remove(); } };
}
