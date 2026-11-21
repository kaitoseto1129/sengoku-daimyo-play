// ======================================================================
// オンライン対戦の「布陣」の画面（K585・61〜72・11/21 クラウド24）
//   試合の前に戦場を上から見る（ここだけは三人称でなく戦術の地図）。自陣側 30% の区域に、4武将の駒を指で置き、指でなぞって向きを決める。
//   総大将の駒には本陣の印。本陣は決まった区域（後方・中央・側方）の中だけに置ける。
//   編成（コスト・兵種の型・陣形の選び）は hensei_ui.js（cloud-48）。この画面は『4武将の配列』を受け取り、置き場と向きを足して返す。
// 使い方：
//   const ui = mountFujin(root, { generals: ['信長', '柴田', …] か [{ id, name, troops, formation, color }]（hensei_ui.js の手持ちは名前の文字列）, map: { w: 400, h: 300 }, lang: 'ja', onChange, onDone(layout, state) });  // layout＝試合（match.js）へ渡す [{name,pos,facing,jin,honjin}]
//   ui.state() → { generals: [{ id, name, troops, formation, pos: {x,z}, facing, honjin }], honjin: '後方' }
//   ui.destroy()
// 筋書き（ソロ）の戦は変えない。ここは online/ の中だけで完結し、道具の試しは tools/online_fujin.test.mjs（描かない）。
// ======================================================================

const TEXT = {
  ja: { title: '布陣', own: '自陣', honjin: '本陣', go: 'この布陣で出陣', reset: '置き直す', hint: '駒を指で動かし、矢じりをなぞって向きを決める。下の釦で陣形', zone: { 後方: '後方', 中央: '中央', 側方: '側方' }, ok: '置けた', need: '本陣の区域に置いてください' },
  en: { title: 'Deployment', own: 'Your side', honjin: 'HQ', go: 'Deploy and march', reset: 'Reset', hint: 'Drag a piece to place it, drag the arrowhead to face it. Pick a formation below', jin: { 横陣: 'Line', 縦陣: 'Column', 魚鱗: 'Fish-scale', 鶴翼: 'Crane wing', 長蛇: 'Long snake', 方円: 'Ring' }, zone: { 後方: 'Rear', 中央: 'Center', 側方: 'Flank' }, ok: 'Placed', need: 'Place the HQ inside an HQ zone' },
};

// ---- 描かない決まり（試しはここだけ読む） ----------------------------------------------------------

/** 自陣側 30% の長方形。side='south' は +z 側（画面の下）、'north' は −z 側（上）。地図の中心が原点。 */
export function ownZone(map, side = 'south', ratio = 0.3) {
  const w = map.w, h = map.h, d = h * ratio;
  return side === 'north' ? { x0: -w / 2, x1: w / 2, z0: -h / 2, z1: -h / 2 + d } : { x0: -w / 2, x1: w / 2, z0: h / 2 - d, z1: h / 2 };
}

/** 本陣の区域（名前つき・最適が一つにならない）。自陣の中の相対で、後方＝奥の真ん中・中央＝前の真ん中・側方＝左の奥。 */
export function honjinZones(map, side = 'south') {
  const z = ownZone(map, side), w = z.x1 - z.x0, d = z.z1 - z.z0, south = side !== 'north';
  const back = (a, b) => (south ? { z0: z.z1 - d * b, z1: z.z1 - d * a } : { z0: z.z0 + d * a, z1: z.z0 + d * b });
  return [
    { name: '後方', x0: z.x0 + w * 0.3, x1: z.x0 + w * 0.7, ...back(0, 0.45) },
    { name: '中央', x0: z.x0 + w * 0.3, x1: z.x0 + w * 0.7, ...back(0.55, 1) },
    { name: '側方', x0: z.x0 + w * 0.02, x1: z.x0 + w * 0.22, ...back(0, 0.7) },
  ];
}

export function clampToRect(p, r, pad = 0) {
  return { x: Math.min(r.x1 - pad, Math.max(r.x0 + pad, p.x)), z: Math.min(r.z1 - pad, Math.max(r.z0 + pad, p.z)) };
}

export function zoneAt(zones, p) {
  return zones.find((q) => p.x >= q.x0 && p.x <= q.x1 && p.z >= q.z0 && p.z <= q.z1) || null;
}

/** 向き（ラジアン・+z が 0・x が正で π/2。ゲームの heading と同じ）。駒の中心から指の位置へ。近すぎれば前の向きのまま。 */
export function facingFrom(center, finger, prev = 0) {
  const dx = finger.x - center.x, dz = finger.z - center.z;
  return Math.hypot(dx, dz) < 1e-6 ? prev : Math.atan2(dx, dz);
}

/** 駒どうしが重ならないように押し分ける（最小の間 gap）。固定する駒 idx は動かさない。 */
export function separate(pieces, zone, gap, fixed = -1) {
  const ZS = 0.35;   // 自陣は浅い帯（奥行き30%）。前後には離れにくいので、前後のずれは軽く見て横へ押し分ける（実際の間は d' 以上）
  for (let it = 0; it < 12; it++) {
    let moved = false;
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i].pos, b = pieces[j].pos; let dx = b.x - a.x, dz = (b.z - a.z) * ZS, d = Math.hypot(dx, dz);
      if (d >= gap) continue;
      const share = fixed === i || fixed === j ? 1 : 2;
      if (Math.abs(dx) < gap * 0.3) {   // ほぼ縦に並んだ二つは、横へ割る（前後には逃げ場が無い）：横に必要な間 = √(gap² − dz²)
        const sg = dx === 0 ? (j % 2 ? 1 : -1) : Math.sign(dx), need = Math.sqrt(Math.max(0, gap * gap - dz * dz)), push = (need - Math.abs(dx)) / share;
        if (fixed !== j) b.x += sg * push;
        if (fixed !== i) a.x -= sg * push;
      } else {
        const push = (gap - d) / share, ux = dx / d, uz = dz / d / ZS;
        if (fixed !== j) { b.x += ux * push; b.z += uz * push; }
        if (fixed !== i) { a.x -= ux * push; a.z -= uz * push; }
      }
      moved = true;
    }
    for (const p of pieces) p.pos = clampToRect(p.pos, zone, 3);
    if (!moved) break;
  }
}

/** はじめの並び：自陣の前縁に一列。総大将（先頭）は本陣の『後方』の真ん中。向きは敵（反対側）へ。 */
export function defaultLayout(generals, map, side = 'south') {
  const z = ownZone(map, side), zs = honjinZones(map, side), south = side !== 'north';
  const face = south ? Math.PI : 0;   // 南の自陣は −z（北）を向く。atan2(dx,dz)=π が −z
  const n = generals.length, w = z.x1 - z.x0, frontZ = south ? z.z0 + (z.z1 - z.z0) * 0.25 : z.z1 - (z.z1 - z.z0) * 0.25;
  // K592（11/21）：役（hensei の ROLES＝総大将・左翼・右翼・後詰）の通りに置く。前は一列に順に並べ、左翼が敵へ向いた時の右に出て、後詰が前の端に出た。
  //   敵へ向いた時の左：南の自陣（−z を向く）は −x、北の自陣（+z を向く）は +x。画面では どちらも左に出る（sx の flip）
  const L = south ? -1 : 1, backZ = south ? z.z1 - (z.z1 - z.z0) * 0.12 : z.z0 + (z.z1 - z.z0) * 0.12;
  const ROLE = [null, { x: L * w * 0.3, z: frontZ }, { x: -L * w * 0.3, z: frontZ }, { x: -L * w * 0.2, z: backZ }];
  return generals.map((g, i) => {
    if (i === 0) { const q = zs[0]; return { ...g, pos: { x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2 }, facing: face, honjin: true }; }
    if (n === 4 && ROLE[i]) return { ...g, pos: { ...ROLE[i] }, facing: face, honjin: false };
    const k = i - 1, m = n - 1;
    return { ...g, pos: { x: z.x0 + w * ((k + 1) / (m + 1)), z: frontZ }, facing: face, honjin: false };
  });
}

/** 置けたか。総大将の駒が本陣の区域の中。返すのは { ok, honjin: 区域の名前 or null }。 */
export function validate(pieces, map, side = 'south') {
  const hq = pieces.find((p) => p.honjin), zone = hq ? zoneAt(honjinZones(map, side), hq.pos) : null;
  return { ok: !!zone, honjin: zone ? zone.name : null };
}

// ---- 画面（DOM と canvas。指で動かす） -------------------------------------------------------------

import { LANG, tr } from '../i18n.js';
import { suitAt, terrainOf, heishuOf } from './match_terrain.js';

const JIN_NAMES = ['横陣', '縦陣', '魚鱗', '鶴翼', '長蛇', '方円'];   // online/jinkei6.js の JIN と同じ名（試しでは読み込まない）
const PALETTE = ['#7a1f1a', '#25507a', '#2f6a3a', '#6a4a1f'];

/** 編成の画面（hensei_ui.js）の手持ちは名前の文字列。オブジェクトに直す。 */
export function normalizeGenerals(list) {
  return (list || []).map((g, i) => (typeof g === 'string' ? { id: g, name: g } : { ...g })).map((g, i) => ({ id: g.id ?? g.name, name: g.name, troops: g.troops ?? 1000, formation: JIN_NAMES.includes(g.formation) ? g.formation : '横陣', color: g.color || PALETTE[i % PALETTE.length] }));
}

/** 試合（match.js の rosterOf）へ渡す並び。武将の順のまま [{name, pos:{x,y}, facing, jin, honjin}]。
 *  置き場 pos は【一つの書き方】＝メートル・地図の左上が (0,0)・y は『match の世界の z + h/2』（match.js は x−w/2、y−h/2 で真ん中が原点の世界へ戻す）。
 *  自陣は y の小さい側（match の世界の −z）＝match の既定の自分の側と同じ。{x,z} では渡さない（33 の読み違いの元）。 */
export function toLayout(state, map = { w: 400, h: 300 }) {
  return state.generals.map((g) => ({ name: g.name, pos: { x: +(g.pos.x + map.w / 2).toFixed(2), y: +(g.pos.z + map.h / 2).toFixed(2) }, facing: g.facing, jin: g.formation, honjin: g.honjin, ...(g.type ? { type: g.type } : {}), ...(g.slot ? { role: g.slot } : {}) }));
}


// ---- 置き場の枠（K601 35〜38）：人数ごとの決まった枠＋本陣。自陣は −z（地図の下）・左は +x（敵へ向いた時の左＝画面の左） ----
//   4人＝本陣（総大将）＋左翼・中央・右翼・後詰（三人をこの四つのどれかへ。一つは空く）／5人＝＋左中／6人＝＋右中
//   枠は自陣の中の四角（または四角の組）。枠の中なら好きな所へ置ける（同じ左翼でも林の縁か平原かを選べる）。別の枠へ落とすと入れ替わる
const FRONT = { 4: ['左翼', '中央', '右翼'], 5: ['左翼', '左中', '中央', '右翼'], 6: ['左翼', '左中', '中央', '右中', '右翼'] };
const FZ = [-92, -62], BZ = [-148, -110], HQX = 62, XL = 196;
export function slotsFor(n) {
  const front = FRONT[Math.max(4, Math.min(6, n))] || FRONT[4], w = (2 * XL) / front.length;
  const S = front.map((name, i) => ({ name, rects: [{ x0: XL - (i + 1) * w, x1: XL - i * w, z0: FZ[0], z1: FZ[1] }] }));
  S.push({ name: '後詰', rects: [{ x0: HQX, x1: XL, z0: BZ[0], z1: BZ[1] }, { x0: -XL, x1: -HQX, z0: BZ[0], z1: BZ[1] }] });
  S.push({ name: '本陣', rects: [{ x0: -HQX, x1: HQX, z0: BZ[0], z1: BZ[1] }], honjin: true });
  return S;
}
const inR = (r, p) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
export const slotAt = (slots, p) => slots.find((s) => s.rects.some((r) => inR(r, p))) || null;
const center = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
/** 枠の中へ収める（枠の四角のうち近い方） */
export function clampToSlot(slot, p, pad = 6) {
  let best = null, bd = Infinity;
  for (const r of slot.rects) { const q = clampToRect(p, r, pad), d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
  return best;
}
// 役（hensei の ROLES：総大将・左翼・右翼・後詰 …）から初めの枠
const ROLE_SLOT = ['本陣', '左翼', '右翼', '後詰', '中央', '左中'];
/** 初めの並び：総大将＝本陣、ほかは役の枠の真ん中。向きは敵（+z＝0） */
export function slotLayout(generals) {
  const slots = slotsFor(generals.length);
  return generals.map((g, i) => {
    const want = ROLE_SLOT[i] || '中央', sl = slots.find((s) => s.name === want) || slots[0];
    const c = want === '後詰' ? { x: HQX + 26, z: (BZ[0] + BZ[1]) / 2 } : center(sl.rects[0]);
    return { ...g, slot: sl.name, pos: c, facing: 0, honjin: sl.honjin === true };
  });
}
/** おすすめ布陣（K601 48〜49・39）：兵種と地形から。騎馬＝翼の平原・槍＝中央・鉄砲＝丘か後ろ寄り・弓＝丘か側翼。総大将は本陣の一番高い所 */
export function recommendLayout(pieces, mapId) {
  const slots = slotsFor(pieces.length), out = pieces.map((p) => ({ ...p }));
  const best = (slot, kind) => {   // 枠の中を 8m おきに見て、その兵種に一番良い地点（同じなら枠の真ん中寄り）
    let b = null;
    for (const r of slot.rects) for (let x = r.x0 + 8; x <= r.x1 - 8; x += 8) for (let z = r.z0 + 6; z <= r.z1 - 6; z += 6) {
      const s = suitAt(mapId, kind, x, z), c = center(r), sc = s.grade * 100 - Math.hypot(x - c.x, z - c.z) * 0.3;
      if (!b || sc > b.sc) b = { sc, pos: { x, z } };
    }
    return b;
  };
  out[0].slot = '本陣'; out[0].honjin = true; out[0].pos = best(slots.find((s) => s.honjin), out[0].heishu || '槍')?.pos || out[0].pos;
  // 後詰は一隊は残す（K603 57：後詰が戦の中心）。前の枠は人数に合わせて左右に均して選び（二隊なら両翼・三隊なら両翼と中央）、兵種で誰をどこへ置くか決める
  const rest = out.slice(1);
  const reserve = rest.length >= 3 ? rest.reduce((b, p) => ((p.heishu === '鉄砲' || p.heishu === '弓') && !(b.heishu === '鉄砲' || b.heishu === '弓') ? p : b), rest[rest.length - 1]) : null;
  const front = rest.filter((p) => p !== reserve);
  const order = slots.filter((s) => !s.honjin && s.name !== '後詰').map((s) => s.name);   // 左→右
  const k = front.length, pick = k >= order.length ? order : k === 1 ? ['中央'] : k === 2 ? ['左翼', '右翼'] : k === 3 ? ['左翼', '中央', '右翼'] : ['左翼', '左中', '右中', '右翼'].filter((n) => order.includes(n)).concat(order).filter((n, i, a) => a.indexOf(n) === i).slice(0, k);
  const wingy = (p) => (p.heishu === '騎馬' ? 2 : p.heishu === '弓' ? 1 : 0);
  const fr = front.slice().sort((a, b) => wingy(b) - wingy(a));   // 騎馬・弓を先に翼へ
  const wings = pick.filter((n) => /翼/.test(n)), mids = pick.filter((n) => !/翼/.test(n));
  for (const p of fr) {
    const name = (wingy(p) ? wings.shift() || mids.shift() : mids.shift() || wings.shift());
    const sl = slots.find((s) => s.name === name); p.slot = name; p.honjin = false; p.pos = best(sl, p.heishu || '槍')?.pos || center(sl.rects[0]);
  }
  if (reserve) { const sl = slots.find((s) => s.name === '後詰'); reserve.slot = '後詰'; reserve.honjin = false; reserve.pos = best(sl, reserve.heishu || '槍')?.pos || center(sl.rects[0]); }
  return out;
}
// 布陣帳（K601 71〜72）：五つの名・地図ごと。端末に残す（読めない端末では残さないだけ）
export const BOOK_NAMES = ['標準', '騎馬', '鉄砲', '守備', '山岳'];
const BOOK_KEY = 'risshin_fujin_v1';
export function bookLoad() { try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '{}') || {}; } catch (e) { return {}; } }
export function bookSave(b) { try { localStorage.setItem(BOOK_KEY, JSON.stringify(b)); return true; } catch (e) { return false; } }

const KATA_TYPE = { std: '標準', yari: '槍重視', teppo: '鉄砲重視', kiba: '騎馬重視', shubi: '守備重視' };
const HEISHU_ICON = { 騎馬: 'kiba', 鉄砲: 'teppo', 槍: 'yari', 弓: 'yumi' };
const RC = { SS: '#e0b84a', S: '#c9563a', A: '#4f8f55', R: '#4a72a8', N: '#8a8478' };

export function mountFujin(root, opts) {
  const map = opts.map || { w: 400, h: 300 }, mapId = opts.mapId || map.id || 'heigen';
  const en = (opts.lang || LANG) === 'en';
  const L = TEXT[en ? 'en' : 'ja'];
  const T = terrainOf(mapId);
  const W2 = (j, e) => (en ? e : j);
  const gens = normalizeGenerals(opts.generals);
  let pieces = slotLayout(gens), sel = 0, drag = null, slots = slotsFor(pieces.length), bookSel = '標準';
  // 兵種と札の中身（肖像・レア）は house.js の表から（読めなければ槍・N）
  let H = null;
  const kataOf = (n) => { const o = H?.loadOnline?.(); const b = H?.bushoOf?.(n); return o?.kata?.[n] || b?.fav || 'std'; };
  const fill = () => { for (const p of pieces) { const k = kataOf(p.name); p.type = KATA_TYPE[k] || '標準'; p.heishu = heishuOf(k); p.rare = H?.bushoOf?.(p.name)?.rare || 'N'; } };

  const wrap = document.createElement('div');
  wrap.className = 'fujin2';
  wrap.style.cssText = 'position:relative;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;background:#20180f;color:#f3ecd8;font:15px/1.4 sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);overflow:hidden';
  const sty = document.createElement('style');
  sty.textContent = `@keyframes fujinGlow{0%,100%{box-shadow:0 0 6px 1px rgba(255,233,168,.35)}50%{box-shadow:0 0 0 4px rgba(255,233,168,.28),0 0 18px 6px rgba(255,233,168,.75)}}.fujin-go.on{animation:fujinGlow 1.6s ease-in-out infinite;border-color:#ffe9a8!important}@media (prefers-reduced-motion:reduce){.fujin-go.on{animation:none;box-shadow:0 0 0 3px rgba(255,233,168,.8)}}
.fj-b{min-height:44px;min-width:44px;padding:0 12px;border-radius:6px;border:1px solid #c9b27a;background:rgba(20,14,8,.55);color:#f3ecd8;font-size:15px;flex:none}
.fj-b[aria-pressed=true]{background:#8a2a1f;border-color:#ffe9a8}
.fj-card{position:absolute;width:50px;height:60px;margin:-30px 0 0 -25px;border-radius:5px;background:#f4ead2;border:2px solid var(--rc);box-shadow:0 2px 5px rgba(0,0,0,.45);color:#2a1d10;display:flex;flex-direction:column;align-items:center;touch-action:none;cursor:grab}
.fj-card.sel{outline:3px solid #ffe9a8;outline-offset:1px;z-index:3}
.fj-card .fc{width:30px;height:30px;margin-top:2px;border-radius:50%;overflow:hidden;background:#3a3226}
.fj-card .fc img{width:100%;height:100%;object-fit:cover}
.fj-card .nm{font-size:9px;line-height:11px;font-weight:700;white-space:nowrap;max-width:48px;overflow:hidden}
.fj-card .rw{display:flex;align-items:center;gap:2px;font-size:9px;line-height:11px}
.fj-card .rr{padding:0 3px;border-radius:2px;color:#fff;background:var(--rc);font-weight:800}
.fj-card .hq{position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800;padding:0 4px;background:#7a1f1a;color:#ffe9a8;border-radius:2px}
.fj-tip{position:absolute;pointer-events:none;padding:4px 8px;border-radius:4px;background:rgba(24,16,8,.9);border:1px solid #c9b27a;font-size:13px;white-space:nowrap;z-index:5;transform:translate(-50%,-100%)}`;
  wrap.appendChild(sty);
  const btn = (txt, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fj-b ' + cls; b.textContent = txt; return b; };
  const bar = document.createElement('div'); bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 10px;min-height:48px;z-index:4';
  const title = document.createElement('div'); title.textContent = L.title; title.style.cssText = 'font-weight:700';
  const status = document.createElement('div'); status.style.cssText = 'font-size:12px;opacity:.9;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
  const bRec = btn(W2('おすすめ布陣', 'Suggested')), bReset = btn(L.reset), bGo = btn(L.go, 'fujin-go'); bGo.style.background = '#8a2a1f';
  if (opts.onBack) { const bBack = btn('‹'); bBack.setAttribute('aria-label', en ? 'Back' : '戻る'); bBack.style.padding = '0'; bBack.onclick = () => opts.onBack(); bar.append(bBack); }
  bar.append(title, status, bRec, bReset, bGo);
  const stage = document.createElement('div'); stage.style.cssText = 'position:relative;flex:1;min-height:0';
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;inset:0';
  const tip = document.createElement('div'); tip.className = 'fj-tip'; tip.hidden = true;
  stage.append(cv, layer, tip);
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;padding:4px 10px 6px;overflow-x:auto;align-items:center;z-index:4';
  const jinBtns = JIN_NAMES.map((n) => { const b = btn(L.jin?.[n] || n); b.dataset.jin = n; b.onclick = () => { if (pieces[sel]) { pieces[sel].formation = n; draw(); opts.onChange?.(api.state()); } }; return b; });
  const sep = document.createElement('span'); sep.style.cssText = 'width:1px;height:28px;background:#c9b27a66;flex:none';
  const bookBtns = BOOK_NAMES.map((n) => { const b = btn(W2(n, { 標準: 'Standard', 騎馬: 'Cavalry', 鉄砲: 'Guns', 守備: 'Defense', 山岳: 'Hills' }[n])); b.dataset.book = n; b.onclick = () => { bookSel = n; const bk = bookLoad()[mapId + ':' + n]; if (bk) applyBook(bk); draw(); }; return b; });
  const bSave = btn(W2('この布陣を残す', 'Save layout')); bSave.onclick = () => { const bk = bookLoad(); bk[mapId + ':' + bookSel] = pieces.map((p) => ({ name: p.name, slot: p.slot, pos: p.pos, formation: p.formation })); bookSave(bk); flash(W2(`布陣帳『${bookSel}』に残した`, `Saved to "${bookSel}"`)); draw(); };
  row.append(...jinBtns, sep, ...bookBtns, bSave);
  wrap.append(bar, stage, row); root.appendChild(wrap);
  const g2 = cv.getContext('2d');
  const applyBook = (bk) => { for (const q of bk) { const p = pieces.find((x) => x.name === q.name); if (p && slots.some((s) => s.name === q.slot)) { p.slot = q.slot; p.pos = { ...q.pos }; p.formation = q.formation || p.formation; p.honjin = q.slot === '本陣'; } } };
  let flashT = 0; const flash = (t) => { status.textContent = t; flashT = performance.now() + 1800; };

  // 地図 ⇄ 画面：自陣（−z）が画面の下。左（+x）が画面の左
  let sc = 1, ox = 0, oz = 0, Wd = 0, Hd = 0;
  const sx = (p) => ox - p.x * sc, sy = (p) => oz - p.z * sc;
  const fromS = (x, y) => ({ x: (ox - x) / sc, z: (oz - y) / sc });
  const fit = () => {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    Wd = Math.max(1, Math.round(r.width)); Hd = Math.max(1, Math.round(r.height)); cv.width = Wd * dpr; cv.height = Hd * dpr; g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (Wd < 120 || Hd < 80) return;
    const m = 10, VIS = 0.62;   // 自陣と川の向こう（地図の六割ほど）を入れる。敵の奥は上へ切れる（敵の布陣は開戦前に見せない・K601 32）
    sc = Math.max(0.2, Math.min((Wd - 2 * m) / map.w, (Hd - 2 * m - 30) / (map.h * VIS))); ox = Wd / 2; oz = Hd - m - 30 - (map.h / 2) * sc;
    paper = null; draw();
  };

  // 和紙の絵図（K601 30：和紙・絵図の風。川・山・森・道・村・橋）。描き直しは大きさが替わった時だけ（paper を作り置く）
  let paper = null;
  const ink = 'rgba(52,36,20,', R = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  function drawPaper() {
    const c = document.createElement('canvas'), dpr = Math.min(2, globalThis.devicePixelRatio || 1); c.width = Wd * dpr; c.height = Hd * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = R(7);
    // 地：生成りの和紙と繊維
    g.fillStyle = '#2a2016'; g.fillRect(0, 0, Wd, Hd);
    const x0 = sx({ x: map.w / 2 }), x1 = sx({ x: -map.w / 2 }), y0 = sy({ z: map.h / 2 }), y1 = sy({ z: -map.h / 2 });
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#d9c8a2'); gr.addColorStop(1, '#ecdfc0'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.lineWidth = 0.6; for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(150,120,80,${0.05 + rnd() * 0.08})`; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), a = rnd() * 6.28, l = 6 + rnd() * 18; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    // 敵の側は薄い朱、自陣は薄い藍
    g.fillStyle = 'rgba(160,40,30,.07)'; g.fillRect(x0, y0, x1 - x0, sy({ z: 60 }) - y0);
    g.fillStyle = 'rgba(40,70,120,.08)'; g.fillRect(x0, sy({ z: -60 }), x1 - x0, y1 - sy({ z: -60 }));
    // 丘：墨の等高線とけば
    for (const q of T.hills) {
      for (let k = 1; k <= 4; k++) { const rr = q.r * (1.25 - k * 0.22) * sc; g.strokeStyle = ink + (0.22 + k * 0.1) + ')'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(sx(q), sy(q), rr * 1.15, rr * 0.85, 0.3, 0, 6.3); g.stroke(); }
      g.strokeStyle = ink + '.35)'; g.lineWidth = 0.8; for (let a = 0; a < 6.28; a += 0.32) { const r1 = q.r * 0.38 * sc, r2 = q.r * 0.58 * sc; g.beginPath(); g.moveTo(sx(q) + Math.cos(a) * r1 * 1.15, sy(q) + Math.sin(a) * r1 * 0.85); g.lineTo(sx(q) + Math.cos(a) * r2 * 1.15, sy(q) + Math.sin(a) * r2 * 0.85); g.stroke(); }
    }
    // 道：薄茶の破線
    g.strokeStyle = 'rgba(140,96,50,.55)'; g.lineWidth = Math.max(2, 3 * sc); g.setLineDash([6, 4]);
    for (const pts of T.roads) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(sx({ x }), sy({ z })) : g.moveTo(sx({ x }), sy({ z })))); g.stroke(); }
    g.setLineDash([]);
    // 川：藍の帯と波・浅瀬と橋
    if (T.river) {
      const P = T.river.pts, w = T.river.w * sc * 2;
      g.strokeStyle = 'rgba(70,105,140,.75)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo(sx({ x }), sy({ z })) : g.moveTo(sx({ x }), sy({ z })))); g.stroke();
      g.strokeStyle = 'rgba(230,240,250,.55)'; g.lineWidth = 1; for (let i = 2; i < P.length; i += 2) { const [x, z] = P[i]; const X = sx({ x }), Y = sy({ z }); g.beginPath(); g.moveTo(X - 6, Y); g.quadraticCurveTo(X - 3, Y - 3, X, Y); g.quadraticCurveTo(X + 3, Y + 3, X + 6, Y); g.stroke(); }
      for (const f of T.river.fords) {
        const z = P.reduce((b, q) => (Math.abs(q[0] - f.x) < Math.abs(b[0] - f.x) ? q : b))[1], X = sx({ x: f.x }), Y = sy({ z });
        if (f.name === '橋') { g.fillStyle = '#7a5530'; g.fillRect(X - f.w * sc * 0.5, Y - w * 0.85, f.w * sc, w * 1.7); g.strokeStyle = ink + '.8)'; g.lineWidth = 1.2; g.strokeRect(X - f.w * sc * 0.5, Y - w * 0.85, f.w * sc, w * 1.7); }
        else { g.fillStyle = 'rgba(200,190,150,.85)'; for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(X + k * f.w * sc * 0.3, Y + (k % 2) * 2, 2.2, 0, 6.3); g.fill(); } }
      }
    }
    // 林：墨の木の印を寄せる
    for (const f of T.forests) {
      const rr = R(Math.abs(Math.round(f.x * 7 + f.z * 13)) + 999), n = Math.round(f.n * 0.7);
      g.fillStyle = 'rgba(70,95,55,.18)'; g.beginPath(); g.ellipse(sx(f), sy(f), f.r * (f.sx || 1) * sc, f.r * (f.sz || 1) * sc, 0, 0, 6.3); g.fill();
      for (let k = 0; k < n; k++) {
        const a = rr() * 6.28, d = Math.sqrt(rr()) * 0.92, x = f.x + Math.cos(a) * d * f.r * (f.sx || 1), z = f.z + Math.sin(a) * d * f.r * (f.sz || 1), X = sx({ x }), Y = sy({ z }), s = 3.5 + rr() * 2;
        g.fillStyle = `rgba(${40 + rr() * 30 | 0},${70 + rr() * 30 | 0},${40 + rr() * 20 | 0},.85)`; g.beginPath(); g.moveTo(X, Y - s * 1.6); g.lineTo(X + s, Y + s * 0.4); g.lineTo(X - s, Y + s * 0.4); g.closePath(); g.fill();
        g.strokeStyle = ink + '.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(X, Y + s * 0.4); g.lineTo(X, Y + s); g.stroke();
      }
    }
    // 村：屋根の印
    for (const v of T.villages) for (const [dx, dz] of [[-9, -4], [8, 3], [-1, 11]]) {
      const X = sx({ x: v.x + dx }), Y = sy({ z: v.z + dz });
      g.fillStyle = '#8b6a44'; g.fillRect(X - 6, Y - 2, 12, 7); g.fillStyle = '#4a3a2a'; g.beginPath(); g.moveTo(X - 8, Y - 1); g.lineTo(X, Y - 8); g.lineTo(X + 8, Y - 1); g.closePath(); g.fill();
    }
    // 縁と地名（字は小さく。地形の名だけ）
    g.restore();
    g.strokeStyle = '#6b4a28'; g.lineWidth = 3; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.font = '11px serif'; g.fillStyle = ink + '.75)'; g.textAlign = 'center';
    const lb = (t, x, z) => g.fillText(t, sx({ x }), sy({ z }));
    for (const q of T.hills) lb(W2('丘', 'Hill'), q.x, q.z + q.r * 0.15);
    for (const f of T.forests) lb(W2('林', 'Wood'), f.x, f.z - f.r * 0.1);
    if (T.river) lb(W2('川', 'River'), -180, T.river.pts[3][1] + 12);
    return c;
  }

  function rectS(r) { const xa = sx({ x: r.x1 }), xb = sx({ x: r.x0 }), ya = sy({ z: r.z1 }), yb = sy({ z: r.z0 }); return { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) }; }
  // 札（DOM）：肖像・名・兵種の印・レア・兵力
  const cards = [];
  function buildCards() {
    layer.innerHTML = ''; cards.length = 0;
    pieces.forEach((p, i) => {
      const c = document.createElement('div'); c.className = 'fj-card'; c.setAttribute('role', 'button'); c.tabIndex = 0;
      c.style.setProperty('--rc', RC[p.rare] || RC.N);
      c.setAttribute('aria-label', `${en ? tr(p.name) : p.name}・${en ? p.heishu : p.heishu}・${p.rare}`);
      c.innerHTML = `${i === 0 ? `<span class="hq">${L.honjin}</span>` : ''}<div class="fc"></div><div class="nm"></div><div class="rw"><span class="ic"></span><span class="rr">${p.rare}</span><span>${p.troops}</span></div>`;
      c.querySelector('.nm').textContent = (en ? tr(p.name) : p.name).slice(0, 5);
      if (H?.face) H.face(c.querySelector('.fc'), p.name);
      const ic = c.querySelector('.ic'), icn = HEISHU_ICON[p.heishu] || 'yari';
      if (H?.kataCanvas && icn !== 'yumi') { const k = H.kataCanvas(icn, 11); k.style.background = '#3a2a18'; k.style.borderRadius = '2px'; ic.appendChild(k); } else ic.textContent = icn === 'yumi' ? '弓' : '';
      c.addEventListener('pointerdown', (e) => { e.preventDefault(); sel = i; const q = pt(e), w = fromS(q.x, q.y); drag = { i, dx: p.pos.x - w.x, dz: p.pos.z - w.z, from: p.slot }; c.setPointerCapture?.(e.pointerId); draw(); });
      c.addEventListener('pointermove', (e) => { if (!drag || drag.i !== i) return; const q = pt(e), w = fromS(q.x, q.y); p.pos = { x: Math.max(-map.w / 2, Math.min(map.w / 2, w.x + drag.dx)), z: Math.max(-map.h / 2, Math.min(map.h / 2, w.z + drag.dz)) }; showTip(p); draw(); });
      const up = () => { if (!drag || drag.i !== i) return; drop(i); drag = null; tip.hidden = true; draw(); opts.onChange?.(api.state()); };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { sel = i; draw(); } });
      layer.appendChild(c); cards.push(c);
    });
  }
  const pt = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  // 札を引いている間：その地点の地形と、その武将の兵種の適性（K601 45）
  function showTip(p) {
    const s = suitAt(mapId, p.heishu, p.pos.x, p.pos.z), sl = slotAt(slots, p.pos);
    const hs = en ? { 騎馬: 'Cavalry', 槍: 'Spear', 鉄砲: 'Gun', 弓: 'Bow' }[p.heishu] : p.heishu;
    const tn = en ? { plain: 'Plain', road: 'Road', hill: 'Hill', forest: 'Wood', village: 'Village', ford: 'Ford', river: 'River' }[s.terrain] : s.name;
    tip.textContent = `${sl ? (en ? '' : sl.name + '・') : (en ? 'Out of slots・' : '枠の外・')}${tn}　${hs}${en ? ' fit' : '適性'} ${s.mark}　${en ? 'Terrain' : '地形効果'} ${s.pct > 0 ? '+' : ''}${s.pct}%${s.why && !en ? '　' + s.why : ''}`;
    tip.style.left = `${Math.max(120, Math.min(Wd - 120, sx(p.pos)))}px`; tip.style.top = `${sy(p.pos) - 42}px`; tip.hidden = false;
    tip.style.borderColor = s.grade === 2 ? '#bfe3a1' : s.grade === 0 ? '#f2b3aa' : '#c9b27a';
  }
  // 落とした所：枠の中ならその枠へ（ほかの武将がいれば入れ替え）。総大将は本陣だけ・本陣には総大将だけ。枠の外なら元の枠へ戻す
  function drop(i) {
    const p = pieces[i]; let sl = slotAt(slots, p.pos);
    if (i === 0) sl = slots.find((s) => s.honjin); else if (!sl || sl.honjin) sl = slots.find((s) => s.name === drag.from);
    if (sl.name !== drag.from) {
      const o = pieces.find((q, j) => j !== i && q.slot === sl.name && sl.name !== '後詰');
      if (o) { o.slot = drag.from; o.pos = clampToSlot(slots.find((s) => s.name === drag.from), center(slots.find((s) => s.name === drag.from).rects[0])); }
    }
    p.slot = sl.name; p.honjin = !!sl.honjin; p.pos = clampToSlot(sl, p.pos);
    const s = suitAt(mapId, p.heishu, p.pos.x, p.pos.z);
    flash(`${en ? tr(p.name) : p.name}：${s.mark} ${s.pct > 0 ? '+' : ''}${s.pct}%`);
  }
  function draw() {
    if (!paper) paper = drawPaper();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, cv.width, cv.height); g2.drawImage(paper, 0, 0); g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 枠：墨の点線の四角と小さな名（左翼・中央・右翼・後詰・本陣が分かる＝K601 受け入れ）
    g2.font = 'bold 11px serif'; g2.textAlign = 'center';
    for (const s of slots) {
      const occ = pieces.some((p) => p.slot === s.name);
      for (const r of s.rects) {
        const q = rectS(r);
        g2.fillStyle = s.honjin ? 'rgba(138,42,31,.13)' : occ ? 'rgba(40,70,120,.10)' : 'rgba(40,70,120,.04)'; g2.fillRect(q.x, q.y, q.w, q.h);
        g2.setLineDash(s.honjin ? [4, 3] : [6, 4]); g2.strokeStyle = s.honjin ? 'rgba(150,40,30,.85)' : 'rgba(40,50,90,.6)'; g2.lineWidth = 1.4; g2.strokeRect(q.x, q.y, q.w, q.h); g2.setLineDash([]);
        g2.fillStyle = s.honjin ? 'rgba(130,30,20,.9)' : 'rgba(30,40,80,.8)'; g2.fillText(en ? { 左翼: 'L.wing', 左中: 'L.center', 中央: 'Center', 右中: 'R.center', 右翼: 'R.wing', 後詰: 'Reserve', 本陣: 'HQ' }[s.name] : s.name, q.x + q.w / 2, q.y + q.h - 4);
      }
    }
    // 敵の武将の名（K601 73：名は見せる。置き場は見せない）
    if (opts.foe?.length) { g2.font = '12px serif'; g2.fillStyle = 'rgba(120,30,20,.95)'; g2.textAlign = 'center'; g2.fillText((en ? 'Enemy: ' : '相手：') + opts.foe.map((n) => (en ? tr(n) : n)).join('・'), Wd / 2, Math.max(14, sy({ z: 150 }) + 16)); }
    pieces.forEach((p, i) => { const c = cards[i]; if (!c) return; c.style.left = `${sx(p.pos)}px`; c.style.top = `${sy(p.pos)}px`; c.classList.toggle('sel', i === sel); });
    for (const b of jinBtns) b.setAttribute('aria-pressed', String(pieces[sel]?.formation === b.dataset.jin));
    const bk = bookLoad();
    for (const b of bookBtns) { b.setAttribute('aria-pressed', String(b.dataset.book === bookSel)); b.style.opacity = bk[mapId + ':' + b.dataset.book] ? '1' : '.6'; }
    if (performance.now() > flashT) { const p = pieces[sel]; const s = p && suitAt(mapId, p.heishu, p.pos.x, p.pos.z); status.textContent = p ? `${en ? tr(p.name) : p.name}・${p.slot}・${s.mark} ${s.pct > 0 ? '+' : ''}${s.pct}%` : ''; }
    bGo.disabled = false; bGo.classList.toggle('on', !drag);
  }
  bRec.onclick = () => { pieces = recommendLayout(pieces, mapId); draw(); flash(W2('兵種と地形から置いた', 'Placed by unit type and terrain')); opts.onChange?.(api.state()); };
  bReset.onclick = () => { const keep = pieces.map((p) => ({ type: p.type, heishu: p.heishu, rare: p.rare })); pieces = slotLayout(gens).map((p, i) => ({ ...p, ...keep[i] })); sel = 0; draw(); opts.onChange?.(api.state()); };
  // 出陣（K601 67）：和紙の地図から自軍の中央へ寄って降り、紙が消えて戦場へ（試合の側は本物の隊を同じ所に立てる）
  bGo.onclick = () => {
    if (bGo.dataset.going) return; bGo.dataset.going = '1';
    const st = api.state(), lay = toLayout(st, map);
    const own = pieces.reduce((a, p) => ({ x: a.x + p.pos.x / pieces.length, z: a.z + p.pos.z / pieces.length }), { x: 0, z: 0 });
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    stage.style.transformOrigin = `${sx(own)}px ${sy(own)}px`;
    stage.style.transition = reduce ? 'opacity .3s' : 'transform 1.1s cubic-bezier(.5,0,.8,.4), opacity 1.1s ease-in';
    bar.style.transition = row.style.transition = 'opacity .4s'; bar.style.opacity = row.style.opacity = '0';
    requestAnimationFrame(() => { if (!reduce) stage.style.transform = 'scale(4.5)'; stage.style.opacity = '0'; wrap.style.transition = 'background-color 1.1s'; wrap.style.backgroundColor = '#0d0905'; /* 裏の題の画面を見せない（戦場が立つまで暗いまま） */ });
    setTimeout(() => opts.onDone?.(lay, st), reduce ? 320 : 1050);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; ro?.observe(stage);
  const api = {
    state: () => ({ generals: pieces.map((p) => ({ id: p.id, name: p.name, troops: p.troops, formation: p.formation, type: p.type, slot: p.slot, pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) }, facing: 0, honjin: !!p.honjin })), honjin: '本陣' }),
    destroy: () => { ro?.disconnect(); wrap.remove(); },
  };
  fill(); buildCards(); fit();
  import('./house.js').then((m) => { H = m; fill(); buildCards(); draw(); }).catch(() => {});
  return api;
}
