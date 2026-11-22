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
import { suitAt, terrainOf, heishuOf, zoneOf } from './match_terrain.js';
import { keyPoints } from './front_line.js';
import { troopsOf } from './unit_type.js';   // K624⑤：格で率いる兵（N600〜SS2000）

const JIN_NAMES = ['横陣', '縦陣', '魚鱗', '鶴翼', '長蛇', '方円'];   // online/jinkei6.js の JIN と同じ名（試しでは読み込まない）
const PALETTE = ['#7a1f1a', '#25507a', '#2f6a3a', '#6a4a1f'];

/** 編成の画面（hensei_ui.js）の手持ちは名前の文字列。オブジェクトに直す。 */
export function normalizeGenerals(list) {
  return (list || []).map((g, i) => (typeof g === 'string' ? { id: g, name: g } : { ...g })).map((g, i) => ({ id: g.id ?? g.name, name: g.name, troops: g.troops ?? 1000, tSet: g.troops != null, formation: JIN_NAMES.includes(g.formation) ? g.formation : '横陣', color: g.color || PALETTE[i % PALETTE.length] }));
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
// K605（11/21）：前の枠は六人の形（左翼・左中・中央・右中・右翼の五列）で場所を決め、人数に合わせて開く。開いていない枠は地図に薄く『未解放』
const FRONT6 = ['左翼', '左中', '中央', '右中', '右翼'];
const OPEN = { 4: ['左翼', '中央', '右翼'], 5: ['左翼', '左中', '中央', '右翼'], 6: FRONT6 };
const HQX0 = 62;
// 置ける範囲は戦場ごと（K605：match_terrain.js の zoneOf。天王寺は右が平野川まで・設楽原は川の手前まで出られる 等）
const geom = (mapId) => { const Z = zoneOf(mapId), cx = (Z.xl + Z.xr) / 2, hq = Math.min(HQX0, (Z.xl - Z.xr) / 6); return { ...Z, cx, hq }; };
const frontRect = (name, G0) => { const i = FRONT6.indexOf(name), w = (G0.xl - G0.xr) / 5; return { x0: G0.xl - (i + 1) * w, x1: G0.xl - i * w, z0: G0.fz[0], z1: G0.fz[1] }; };
export function slotsFor(n, mapId = 'heigen') {
  const G0 = geom(mapId), open = OPEN[Math.max(4, Math.min(6, n))] || OPEN[4];
  const S = open.map((name) => ({ name, rects: [frontRect(name, G0)] }));
  S.push({ name: '後詰', rects: [{ x0: G0.cx + G0.hq, x1: G0.xl, z0: G0.bz[0], z1: G0.bz[1] }, { x0: G0.xr, x1: G0.cx - G0.hq, z0: G0.bz[0], z1: G0.bz[1] }] });
  // 本陣（K605）：後ろ（安全）と、前の列のすぐ後ろの真ん中（命令が届きやすい）の二か所から選ぶ
  const mid = G0.fz[0] - G0.bz[1] > 10 ? [{ x0: G0.cx - 44, x1: G0.cx + 44, z0: G0.bz[1] + 2, z1: G0.fz[0] - 2 }] : [];
  S.push({ name: '本陣', rects: [{ x0: G0.cx - G0.hq, x1: G0.cx + G0.hq, z0: G0.bz[0], z1: G0.bz[1] }, ...mid], honjin: true });
  return S;
}
/** 開いていない前の枠（地図に薄く出す） */
export const lockedSlots = (n, mapId = 'heigen') => { const G0 = geom(mapId); return FRONT6.filter((nm) => !(OPEN[Math.max(4, Math.min(6, n))] || OPEN[4]).includes(nm)).map((name) => ({ name, rects: [frontRect(name, G0)] })); };
/** 本陣の置き場の種類（K605：後ろ＝安全・中央＝命令が有利） */
export const honjinKind = (p, mapId = 'heigen') => (p && p.z > geom(mapId).bz[1] ? '中央' : '後ろ');
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
export function slotLayout(generals, mapId = 'heigen') {
  const slots = slotsFor(generals.length, mapId), G0 = geom(mapId);
  return generals.map((g, i) => {
    const want = ROLE_SLOT[i] || '中央', sl = slots.find((s) => s.name === want) || slots[0];
    const c = want === '後詰' ? { x: G0.cx + G0.hq + 26, z: (G0.bz[0] + G0.bz[1]) / 2 } : center(sl.rects[0]);
    return { ...g, slot: sl.name, pos: c, facing: 0, honjin: sl.honjin === true };
  });
}
/** おすすめ布陣（K601 48〜49・39）：兵種と地形から。騎馬＝翼の平原・槍＝中央・鉄砲＝丘か後ろ寄り・弓＝丘か側翼。総大将は本陣の一番高い所 */
export function recommendLayout(pieces, mapId) {
  const slots = slotsFor(pieces.length, mapId), out = pieces.map((p) => ({ ...p }));
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
export const BOOK_NAMES = ['標準', '攻勢', '守備', '騎馬', '鉄砲'];   // K605 の五つ
const BOOK_KEY = 'risshin_fujin_v1';
export function bookLoad() { try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '{}') || {}; } catch (e) { return {}; } }
export function bookSave(b) { try { localStorage.setItem(BOOK_KEY, JSON.stringify(b)); return true; } catch (e) { return false; } }


// ---- NPC の家ごとの布陣（K605）：武田＝騎馬を翼・槍を中央・信玄の本陣を後ろ／織田＝鉄砲を高所か中央の後ろ・槍を前・騎馬を側翼／島津＝一部を前・一部を林と側翼（釣り野伏）
//   相手の側から見た置き場（自陣が −z の同じ書き方）で返す＝match.js の foeLayout（真ん中を軸に裏返して北へ置く）。地形は裏返して見る
export function npcLayout(foe, house, mapId, heishuOfName = () => '槍') {
  const mir = (k, x, z) => suitAt(mapId, k, -x, -z);
  const ps = slotLayout(normalizeGenerals(foe), mapId).map((p) => ({ ...p, heishu: heishuOfName(p.name) }));
  const slots = slotsFor(ps.length, mapId), front = slots.filter((s) => !s.honjin && s.name !== '後詰').map((s) => s.name);
  const best = (sl, kind, pref) => { let b = null; for (const r of sl.rects) for (let x = r.x0 + 8; x <= r.x1 - 8; x += 8) for (let z = r.z0 + 6; z <= r.z1 - 6; z += 6) { const t = mir(kind, x, z), sc = t.grade * 100 + (pref ? pref(t, x, z) : 0); if (!b || sc > b.sc) b = { sc, pos: { x, z } }; } return b?.pos || center(sl.rects[0]); };
  const put = (p, name, pref) => { const sl = slots.find((s) => s.name === name); p.slot = name; p.honjin = !!sl.honjin; p.pos = best(sl, p.heishu, pref); };
  const [lord, ...rest] = ps;
  put(lord, '本陣', house === 'oda' ? (t) => (t.terrain === 'hill' ? 60 : 0) : (t, x, z) => -z * 0.3);   // 織田の本陣は高い所・ほかは後ろ
  const by = (k) => rest.filter((p) => p.heishu === k);
  const used = new Set(), take = (names) => names.find((n) => front.includes(n) && !used.has(n));
  const order = house === 'takeda' ? [...by('騎馬'), ...by('槍'), ...by('鉄砲'), ...by('弓')] : house === 'oda' ? [...by('槍'), ...by('鉄砲'), ...by('騎馬'), ...by('弓')] : rest.slice();
  // 島津：釣り野伏の将（家久）は後詰にしない（前の真ん中で誘う）。後詰は残りの者から
  const bait = house === 'shimazu' ? rest.find((p) => p.name === '島津家久') : null;
  const reserve = house === 'oda' ? (by('鉄砲')[0] || rest[rest.length - 1]) : [...rest].reverse().find((p) => p !== bait) || rest[rest.length - 1];
  if (bait) { const i = order.indexOf(bait); if (i > 0) { order.splice(i, 1); order.unshift(bait); } }
  for (const p of order) {
    if (p === reserve && rest.length >= 3) { put(p, '後詰', house === 'oda' ? (t) => (t.terrain === 'hill' ? 80 : 0) : null); continue; }
    const want = p === bait ? ['中央', '左中', '右中'] : p.heishu === '騎馬' ? ['左翼', '右翼', '左中', '右中', '中央'] : p.heishu === '鉄砲' && house === 'oda' ? ['中央', '左中', '右中', '左翼', '右翼'] : ['中央', '左中', '右中', '左翼', '右翼'];
    const nm = take(want) || take(front); if (!nm) { put(p, '後詰'); continue; }
    used.add(nm);
    // 島津：前の一隊は真ん中、ほかは林の縁と側翼（伏兵）
    put(p, nm, house === 'shimazu' && p !== bait ? (t) => (t.terrain === 'forest' ? 90 : 0) : null);
  }
  return toLayout({ generals: ps.map((p) => ({ name: p.name, formation: p.formation, type: KATA_OF[p.heishu], slot: p.slot, pos: p.pos, facing: 0, honjin: p.honjin })) });
}
const KATA_OF = { 騎馬: '騎馬重視', 鉄砲: '鉄砲重視', 槍: '槍重視', 弓: '標準' };

const KATA_TYPE = { std: '標準', yari: '槍重視', teppo: '鉄砲重視', kiba: '騎馬重視', shubi: '守備重視' };
const HEISHU_ICON = { 騎馬: 'kiba', 鉄砲: 'teppo', 槍: 'yari', 弓: 'yumi' };
// K616（ui_refs_sengoku 原理4・5）：兵種ごとに色も変える（札の左の帯・向きの扇）。形（印）と色の両方で見分ける
const HEISHU_COL = { 騎馬: '#e0913a', 槍: '#7d93b8', 鉄砲: '#5a5a5a', 弓: '#5f9a4e' };
const RING_KEY = 'risshin_fujin_ring_v1';
const RC = { SS: '#e0b84a', S: '#c9563a', A: '#4f8f55', R: '#4a72a8', N: '#8a8478' };
// 地名の札（K605：戦術の意味を持つ名）は match_terrain.js の TERRAIN（丘・浅瀬と橋・村の name と desc・labels）
// 役割（K605：中核・守備／側面突撃／後詰／射撃支援／正面突破）と一言
function roleOf(slot, heishu) {
  if (slot === '本陣') return ['本陣', '全軍に下知する。崩れると負け'];
  if (slot === '後詰') return ['後詰', '前が崩れた所へ入れる予備'];
  if (heishu === '鉄砲' || heishu === '弓') return ['射撃支援', '前の槍の後ろから寄せる敵を撃つ'];
  if (heishu === '騎馬') return /翼/.test(slot) ? ['側面突撃', '平地の翼から敵の横を突く'] : ['正面突破', '正面の弱い所へ突っ込む'];
  return slot === '中央' ? ['中核・守備', '正面を受け止める壁'] : ['正面突破', '前へ押して戦線を進める'];
}
const BEST_GROUND = { 騎馬: '平原', 槍: '村・狭い道', 鉄砲: '高所・平原', 弓: '高所' };

// ---- K607（kaito 11/21「編成画面で連れていく武将と陣形・布陣を作っておけば、毎回の戦で布陣を選ばなくていい」） ----
//   軍団の画面（hensei_ui.js defaultFujinOf）で決めた既定の置き場（左翼〜後詰・本陣）と陣形を、その戦場の枠へ写す。
//   置き場は戦場ごとに違う（zoneOf）ので、同じ名の枠の中で、その武将の兵種に一番良い地点（吸い付く三点のうち）へ置く。名の枠が無ければ空いた前の枠へ
export function placeDefault(def, mapId, heishuOfName = () => '槍') {
  const n = def.length, slots = slotsFor(n, mapId), used = new Set();
  const front = slots.filter((s) => !s.honjin && s.name !== '後詰').map((s) => s.name);
  const pts = (sl) => sl.rects.flatMap((r) => [1 / 6, 0.5, 5 / 6].map((k) => ({ x: r.x0 + (r.x1 - r.x0) * k, z: (r.z0 + r.z1) / 2 })));
  return def.map((q, i) => {
    let name = i === 0 ? '本陣' : q.slot;
    if (!slots.some((s) => s.name === name) || (name !== '後詰' && name !== '本陣' && used.has(name)) || name === '本陣' && i) name = front.find((f) => !used.has(f)) || '後詰';
    used.add(name);
    const sl = slots.find((s) => s.name === name), k = heishuOfName(q.name);
    const best = pts(sl).filter((p) => !used.has(`${p.x}|${p.z}`)).sort((a, b) => suitAt(mapId, k, b.x, b.z).grade - suitAt(mapId, k, a.x, a.z).grade)[0] || center(sl.rects[0]);
    used.add(`${best.x}|${best.z}`);
    return { name: q.name, slot: name, pos: { ...best }, formation: JIN_NAMES.includes(q.formation) ? q.formation : '横陣', honjin: name === '本陣' };
  });
}
/** 既定の布陣を、その戦場で試合（match.js）へ渡す並びにする */
export function layoutFromDefault(def, mapId, map = { w: 400, h: 300 }, heishuOfName, typeOfName = () => null) {
  const ps = placeDefault(def, mapId, heishuOfName);
  return toLayout({ generals: ps.map((p) => ({ name: p.name, formation: p.formation, type: typeOfName(p.name), slot: p.slot, pos: p.pos, facing: 0, honjin: p.honjin })) }, map);
}
/** 始まる前の確かめの札（K607）：既定の布陣のまま出陣するか、［布陣を変える］で今の布陣の画面へ。onGo()・onEdit()・onBack() */
export function openStartCard(o = {}) {
  const en = (o.lang || LANG) === 'en', W2 = (j, e) => (en ? e : j);
  const T = terrainOf(o.mapId || 'heigen');
  const el = document.createElement('div'); el.className = 'fj-start'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:62;display:flex;align-items:center;justify-content:center;background:rgba(10,7,4,.78);padding:12px;font:14px/1.45 sans-serif;color:#f3ecd8';
  const rows = (o.pieces || []).map((p) => `<tr><td style="padding:2px 10px 2px 0">${en ? tr(p.name) : p.name}</td><td style="padding:2px 10px 2px 0;color:#ffd88a">${p.slot}</td><td style="opacity:.85">${p.formation}</td></tr>`).join('');
  el.innerHTML = `<div style="max-width:560px;width:100%;background:#17130e;border:1px solid #d9b45a;border-radius:6px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
    <div style="font:700 17px serif">${W2('この布陣で出陣します', 'Deploy with your saved layout')}</div>
    <div style="font-size:13px;opacity:.9">${en ? (o.mapName || '') : (T.name || o.mapName || '')}　${en ? '' : (T.season || '')}${o.foe?.length ? `　${W2('相手', 'vs')}：${o.foe.map((n) => (en ? tr(n) : n)).join('・')}` : ''}</div>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    <div class="fj-sbar" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"></div></div>`;
  const bar = el.querySelector('.fj-sbar');
  const mk = (t, main) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.style.cssText = `min-height:44px;min-width:110px;padding:0 14px;border-radius:5px;border:1px solid ${main ? '#e0a070' : '#c9b27a'};background:${main ? '#8a2a1f' : 'rgba(20,14,8,.7)'};color:#f3ecd8;font-size:15px`; bar.appendChild(b); return b; };
  if (o.onBack) mk(W2('戻る', 'Back')).onclick = () => { el.remove(); o.onBack(); };
  mk(W2('布陣を変える', 'Change layout')).onclick = () => { el.remove(); o.onEdit?.(); };
  const go = mk(W2('出陣', 'Deploy'), true); go.onclick = () => { el.remove(); o.onGo?.(); };
  document.body.appendChild(el); go.focus({ preventScroll: true });
  return el;
}

export function mountFujin(root, opts) {
  const map = opts.map || { w: 400, h: 300 }, mapId = opts.mapId || map.id || 'heigen';
  const en = (opts.lang || LANG) === 'en';
  const L = TEXT[en ? 'en' : 'ja'];
  const T = terrainOf(mapId);
  const W2 = (j, e) => (en ? e : j);
  const gens = normalizeGenerals(opts.generals);
  const N = gens.length;
  let pieces = slotLayout(gens, mapId), sel = 0, drag = null, slots = slotsFor(N, mapId), locked = lockedSlots(N, mapId), bookSel = '標準', layer2 = { terrain: false, info: false }, detailMore = false;
  let H = null, TC = null, BO = null;
  // K616 三すくみの輪：布陣を初めて開いた時だけ（軍団の画面に埋めた時は出さず数えない・覚えられない時は出す）
  let ringShow = !opts.embed; if (ringShow) try { ringShow = !localStorage.getItem(RING_KEY); localStorage.setItem(RING_KEY, '1'); } catch (e) { /* 覚えられない時は出す */ }
  const kataOf = (n) => { const o = H?.loadOnline?.(); const b = H?.bushoOf?.(n); return o?.kata?.[n] || b?.fav || 'std'; };
  const fill = () => { for (const p of pieces) { const k = kataOf(p.name); p.type = KATA_TYPE[k] || '標準'; p.heishu = heishuOf(k); p.rare = H?.bushoOf?.(p.name)?.rare || 'N'; if (!p.tSet && H?.bushoOf?.(p.name)) p.troops = troopsOf(p.rare); } };
  const hs = (k) => (en ? { 騎馬: 'Cavalry', 槍: 'Spear', 鉄砲: 'Gun', 弓: 'Bow' }[k] : k);
  const nm = (n) => (en ? tr(n) : n);
  // NPC の相手の布陣（見せてよい）と、対人の相手（名だけ）
  const foeShown = Array.isArray(opts.foeLayout) && opts.showFoe;

  const wrap = document.createElement('div');
  wrap.className = 'fujin2';
  wrap.style.cssText = 'position:relative;width:100%;height:100%;box-sizing:border-box;display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto 1fr auto;background:#1c140c;color:#f3ecd8;font:14px/1.35 sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);overflow:hidden';
  const sty = document.createElement('style');
  sty.textContent = `@keyframes fujinGlow{0%,100%{box-shadow:0 0 6px 1px rgba(255,233,168,.35)}50%{box-shadow:0 0 0 4px rgba(255,233,168,.28),0 0 16px 5px rgba(255,233,168,.7)}}.fujin-go.on{animation:fujinGlow 1.6s ease-in-out infinite;border-color:#ffe9a8!important}@media (prefers-reduced-motion:reduce){.fujin-go.on{animation:none;box-shadow:0 0 0 3px rgba(255,233,168,.8)}}
.fj-b{min-height:44px;min-width:44px;padding:0 10px;border-radius:5px;border:1px solid #c9b27a;background:rgba(20,14,8,.7);color:#f3ecd8;font-size:14px;flex:none}
.fj-b[aria-pressed=true]{background:#7a2a1f;border-color:#ffe9a8}.fj-b:disabled{opacity:.45}
.fj-side{display:flex;flex-direction:column;gap:6px;padding:4px 6px}
.fj-side .fj-b{padding:0 6px;font-size:13px;width:64px}
.fj-card{position:absolute;min-width:62px;height:44px;margin:-22px 0 0 -31px;padding:0 6px 0 3px;border-radius:3px;display:flex;align-items:center;gap:4px;box-shadow:0 2px 4px rgba(0,0,0,.5);touch-action:none;cursor:grab;color:#fff;border:2px solid #9fc0ea;background:linear-gradient(180deg,#2b5486,#1b3658)}
.fj-card.foe{border-color:#f1a99c;background:linear-gradient(180deg,#8e2b22,#5c1712);cursor:default}
.fj-card.sel{outline:3px solid #ffe9a8;outline-offset:1px;z-index:3}
.fj-card .fc{width:30px;height:30px;border-radius:3px;overflow:hidden;background:#3a3226;flex:none}.fj-card .fc img{width:100%;height:100%;object-fit:cover}
.fj-card .tx{display:flex;flex-direction:column;line-height:14px;white-space:nowrap}.fj-card .nm{font-size:12px;font-weight:700}.fj-card .hs{font-size:11px;opacity:.95;display:flex;align-items:center;gap:2px}
.fj-card .hq{position:absolute;top:-10px;left:-4px;font-size:10px;font-weight:800;padding:0 3px;background:#ffe9a8;color:#7a1f1a;border-radius:2px}
.fj-list{display:flex;gap:6px;overflow-x:auto;padding:4px 6px}
.fj-li{position:relative;flex:none;display:flex;align-items:center;gap:5px;min-height:46px;padding:2px 8px 2px 3px;border-radius:4px;border:1px solid #6d8fb8;background:#1b2a40;color:#f3ecd8;touch-action:none}
.fj-li.placed{opacity:.55}.fj-li.miss{border-color:#ff8a7a;box-shadow:0 0 0 2px rgba(255,120,100,.5)}.fj-li.sel{outline:2px solid #ffe9a8}
.fj-li .fc{width:34px;height:34px;border-radius:3px;overflow:hidden;background:#3a3226}.fj-li .fc img{width:100%;height:100%;object-fit:cover}
.fj-li small{display:block;font-size:11px;opacity:.9}
.fj-det{width:176px;padding:6px 8px;background:rgba(20,14,8,.78);border:1px solid #8a6a40;border-radius:5px;font-size:13px;line-height:1.45}
.fj-det b{font-size:15px}.fj-det .rl{color:#ffd88a}
.fj-tip{position:absolute;pointer-events:none;padding:3px 8px;border-radius:4px;background:rgba(24,16,8,.92);border:1px solid #c9b27a;font-size:13px;white-space:nowrap;z-index:5;transform:translate(-50%,-100%)}
.fj-ov{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;background:rgba(8,6,4,.62)}
.fj-ov .bx{padding:18px 20px;background:#17130e;border:1px solid #d9b45a;border-radius:6px;text-align:center;display:flex;flex-direction:column;gap:12px}
.fj-cd{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;font:700 72px serif;color:#ffe9a8;text-shadow:0 2px 12px #000;pointer-events:none}`;
  wrap.appendChild(sty);
  const btn = (txt, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fj-b ' + cls; b.textContent = txt; return b; };
  // 上：戦場の名・出陣編成・時節と天候｜総兵力・配置枠｜布陣決定
  const bar = document.createElement('div'); bar.style.cssText = 'grid-column:1/4;display:flex;align-items:center;gap:8px;padding:3px 8px;min-height:46px';
  const bBack = btn('‹ ' + W2('戻る', 'Back')); bBack.onclick = () => opts.onBack?.();
  const title = document.createElement('div'); title.style.cssText = 'display:flex;flex-direction:column;line-height:1.2';
  title.innerHTML = `<b style="font:700 16px serif;letter-spacing:.08em"></b><small style="opacity:.85"></small>`;
  title.querySelector('b').textContent = W2('出陣編成', 'Deployment') + '　' + (opts.fieldName || (en ? `${map.name || mapId}` : T.name || `${map.name || (mapId === 'kawa' ? '川と橋' : '平原')}の戦い`));
  title.querySelector('small').textContent = opts.season || W2(T.season || ('晩春（五月）・晴・' + ((T.rivers || []).length ? '川と橋' : '平原と丘')), 'Late spring · Clear');
  const status = document.createElement('div'); status.style.cssText = 'flex:1;min-width:0;font-size:12px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center';
  const count = document.createElement('div'); count.style.cssText = 'font-size:13px;white-space:nowrap;text-align:right';
  const timer = document.createElement('div'); timer.style.cssText = 'font:700 15px sans-serif;min-width:36px;text-align:center;color:#ffd88a';
  const bGo = btn(W2('布陣決定', 'Confirm'), 'fujin-go'); bGo.style.cssText += ';background:#8a2a1f;font-weight:700;padding:0 16px';
  if (opts.onBack) bar.append(bBack);
  bar.append(title, status, count, timer, bGo);
  // 軍団の画面に埋め込む時（k598-tonya・kaito「軍団の下に布陣の地図を常に」）：見出し・時節・布陣決定・時間・戻るは出さない（上の軍団の画面が持つ）
  if (opts.embed) { for (const e of [title, timer, bGo, bBack]) e.style.display = 'none'; }
  const changed = () => { try { opts.onChange?.(api.state()); } catch (e) { /* 知らせの先の誤りで布陣は止めない */ } };
  // 左：地形・情報・配置クリア・おすすめ
  const side = document.createElement('div'); side.className = 'fj-side';
  const bTer = btn(W2('地形', 'Terrain')), bInf = btn(W2('情報', 'Info')), bClr = btn(W2('配置クリア', 'Clear')), bRec = btn(W2('おすすめ', 'Suggest'));
  bClr.style.fontSize = '12px';
  side.append(bTer, bInf, bClr, bRec);
  // 中：地図
  const stage = document.createElement('div'); stage.style.cssText = 'position:relative;min-height:0;min-width:0;overflow:hidden';
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;inset:0';
  const tip = document.createElement('div'); tip.className = 'fj-tip'; tip.hidden = true;
  stage.append(cv, layer, tip);
  // 右：選んだ武将の詳細・布陣帳
  const right = document.createElement('div'); right.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 6px;min-height:0;overflow:auto';
  const det = document.createElement('div'); det.className = 'fj-det'; det.setAttribute('role', 'button'); det.tabIndex = 0;
  const book = document.createElement('div'); book.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;width:176px';
  const bookBtns = BOOK_NAMES.map((n) => { const b = btn(W2(n, { 標準: 'Std', 攻勢: 'Attack', 守備: 'Defend', 騎馬: 'Cav', 鉄砲: 'Guns' }[n])); b.style.cssText += ';min-width:44px;padding:0 6px;font-size:12px'; b.dataset.book = n; b.onclick = () => { bookSel = n; const bk = bookLoad()[mapId + ':' + n]; if (bk) applyBook(bk); draw(); }; return b; });
  const bSave = btn(W2('残す', 'Save')); bSave.style.cssText += ';font-size:12px;padding:0 8px'; bSave.onclick = () => { const bk = bookLoad(); bk[mapId + ':' + bookSel] = snap(); bookSave(bk); flash(W2(`布陣帳『${bookSel}』に残した`, `Saved "${bookSel}"`)); draw(); };
  book.append(...bookBtns, bSave);
  right.append(det, book);
  // K616（原理4）：三すくみの輪は初めの一度だけ、左の欄（おすすめの下）に小さく（矢の先に強い：槍→騎馬→鉄砲・弓→槍）
  if (ringShow) {
    const rc = document.createElement('canvas'), dpr = Math.min(2, globalThis.devicePixelRatio || 1), S = 70; rc.width = S * dpr; rc.height = S * dpr; rc.style.cssText = `width:${S}px;height:${S}px;align-self:center;flex:none`;
    rc.setAttribute('role', 'img'); rc.setAttribute('aria-label', W2('相性：槍は騎馬に強い・騎馬は鉄砲と弓に強い・鉄砲と弓は槍に強い', 'Matchups: spear beats cavalry, cavalry beats guns and bows, guns and bows beat spear'));
    const g = rc.getContext('2d');
    if (g) { g.setTransform(dpr, 0, 0, dpr, 0, 0); const cx = S / 2, cy = S / 2 + 2, R0 = 21, ks = ['槍', '騎馬', '鉄砲'];
      g.fillStyle = 'rgba(20,14,8,.78)'; g.beginPath(); g.arc(cx, cy - 2, S / 2 - 1, 0, 6.3); g.fill();
      const P = ks.map((k, i) => { const a = -Math.PI / 2 + i * 2.094; return [cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]; });
      g.strokeStyle = '#ffd88a'; g.fillStyle = '#ffd88a'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % 3], a = Math.atan2(y1 - y0, x1 - x0), ax = x1 - Math.cos(a) * 9, ay = y1 - Math.sin(a) * 9;
        g.beginPath(); g.moveTo(x0 + Math.cos(a) * 9, y0 + Math.sin(a) * 9); g.lineTo(ax, ay); g.stroke();
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - Math.cos(a - 0.5) * 6, ay - Math.sin(a - 0.5) * 6); g.lineTo(ax - Math.cos(a + 0.5) * 6, ay - Math.sin(a + 0.5) * 6); g.closePath(); g.fill(); }
      ks.forEach((k, i) => { const [x, y] = P[i]; g.fillStyle = HEISHU_COL[k]; g.beginPath(); g.arc(x, y, 8, 0, 6.3); g.fill(); if (i === 2) { g.fillStyle = HEISHU_COL.弓; g.beginPath(); g.arc(x, y, 8, -Math.PI / 2, Math.PI / 2); g.fill(); } g.strokeStyle = '#f3ecd8'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 8, 0, 6.3); g.stroke(); });
      g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; [en ? 'S' : '槍', en ? 'C' : '騎', en ? 'G' : '鉄'].forEach((t, i) => g.fillText(t, P[i][0], P[i][1] + 3.5)); }
    rc.style.marginTop = 'auto'; side.appendChild(rc);
  }
  // 下：出陣武将の一覧・陣形
  const bottom = document.createElement('div'); bottom.style.cssText = 'grid-column:1/4;display:flex;align-items:center;gap:6px;min-width:0';
  const list = document.createElement('div'); list.className = 'fj-list'; list.style.flex = '1';
  const jinRow = document.createElement('div'); jinRow.style.cssText = 'display:flex;gap:4px;padding-right:6px';
  const jinBtns = JIN_NAMES.map((n) => { const b = btn(L.jin?.[n] || n); b.style.cssText += ';min-width:44px;padding:0 6px;font-size:12px'; b.dataset.jin = n; b.onclick = () => { if (pieces[sel]) { pieces[sel].formation = n; draw(); changed(); } }; return b; });
  jinRow.append(...jinBtns);
  bottom.append(list, jinRow);
  wrap.append(bar, side, stage, right, bottom); root.appendChild(wrap);
  const g2 = cv.getContext('2d');
  const snap = () => pieces.map((p) => ({ name: p.name, slot: p.slot, pos: p.pos, formation: p.formation }));
  const applyBook = (bk) => { for (const q of bk) { const p = pieces.find((x) => x.name === q.name); if (p && q.slot && slots.some((s) => s.name === q.slot)) { p.slot = q.slot; p.pos = { ...q.pos }; p.formation = q.formation || p.formation; p.honjin = q.slot === '本陣'; } } };
  let flashT = 0; const flash = (t) => { status.textContent = t; flashT = performance.now() + 2200; };

  // 地図 ⇄ 画面：少し斜めから見下ろす（奥行きを縮める＝VK）。北（敵の側）が上で回さない。自陣（−z）が下・左（+x）が左
  const VK = 0.68;
  let sc = 1, ox = 0, oz = 0, Wd = 0, Hd = 0;
  const sx = (p) => ox - p.x * sc, sy = (p) => oz - p.z * sc * VK;
  const fromS = (x, y) => ({ x: (ox - x) / sc, z: (oz - y) / (sc * VK) });
  const fit = () => {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    Wd = Math.max(1, Math.round(r.width)); Hd = Math.max(1, Math.round(r.height)); cv.width = Wd * dpr; cv.height = Hd * dpr; g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (Wd < 120 || Hd < 80) return;
    const m = 8, VIS = foeShown ? 1 : 0.8;   // NPC は敵の布陣まで全部・対人は敵の奥を切る
    sc0 = Math.max(0.2, Math.min((Wd - 2 * m) / map.w, (Hd - 2 * m - 18) / (map.h * VIS * VK))); ox0 = Wd / 2; oz0 = Hd - m - 18 - (map.h / 2) * sc0 * VK;
    applyView(); buildCards(); draw();
  };
  // ピンチで寄る・引く（K605）：二本の指の間の所を中心に一〜二・六倍。寄った時は空いた所を一本の指で動かす。パソコンは回し車
  let sc0 = 1, ox0 = 0, oz0 = 0;
  const view = { z: 1, px: 0, py: 0 };
  function applyView() {
    view.z = Math.max(1, Math.min(2.6, view.z)); if (view.z === 1) { view.px = 0; view.py = 0; }
    const lim = (Wd + Hd) * (view.z - 1) * 0.5; view.px = Math.max(-lim, Math.min(lim, view.px)); view.py = Math.max(-lim, Math.min(lim, view.py));
    sc = sc0 * view.z; ox = Wd / 2 + (ox0 - Wd / 2) * view.z + view.px; oz = Hd / 2 + (oz0 - Hd / 2) * view.z + view.py;
    paper = null;
  }
  const zoomAt = (fx, fy, k) => { const z0 = view.z; view.z = Math.max(1, Math.min(2.6, z0 * k)); const r = view.z / z0;
    // 指の下の所が動かないように寄せる：画面の点 f は ox の式で r 倍に広がるので、その分だけ戻す
    view.px = (view.px - (fx - Wd / 2)) * r + (fx - Wd / 2); view.py = (view.py - (fy - Hd / 2)) * r + (fy - Hd / 2);
    applyView(); draw(); };
  const touches = new Map(); let pinch = null, pan = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target !== cv && e.target !== layer) return;   // 札を掴んだ時は札を引く
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const [a, b2] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b2.x, a.y - b2.y) || 1 }; pan = null; }
    else if (view.z > 1) pan = { x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) { const [a, b2] = [...touches.values()], d = Math.hypot(a.x - b2.x, a.y - b2.y) || 1, r = stage.getBoundingClientRect(); zoomAt((a.x + b2.x) / 2 - r.left, (a.y + b2.y) / 2 - r.top, d / pinch.d); pinch.d = d; }
    else if (pan) { view.px += e.clientX - pan.x; view.py += e.clientY - pan.y; pan = { x: e.clientX, y: e.clientY }; applyView(); draw(); }
  });
  const tEnd = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (!touches.size) pan = null; };
  stage.addEventListener('pointerup', tEnd); stage.addEventListener('pointercancel', tEnd);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });

  // 絵図（和紙・斜めの俯瞰）：丘は日の当たる面と影で盛り上げ、林は木の影を落とす
  let paper = null;
  const ink = 'rgba(52,36,20,', R = (seed) => { let s2 = seed; return () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647); };
  function drawPaper() {
    const c = document.createElement('canvas'), dpr = Math.min(2, globalThis.devicePixelRatio || 1); c.width = Wd * dpr; c.height = Hd * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = R(7);
    g.fillStyle = '#1c140c'; g.fillRect(0, 0, Wd, Hd);
    const x0 = sx({ x: map.w / 2 }), x1 = sx({ x: -map.w / 2 }), y0 = sy({ z: map.h / 2 }), y1 = sy({ z: -map.h / 2 });
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#cdbb93'); gr.addColorStop(1, '#ecdfc0'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.lineWidth = 0.6; for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(150,120,80,${0.05 + rnd() * 0.08})`; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), a = rnd() * 6.28, l = 6 + rnd() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    g.fillStyle = 'rgba(160,40,30,.08)'; g.fillRect(x0, y0, x1 - x0, sy({ z: 60 }) - y0);
    g.fillStyle = 'rgba(40,70,120,.09)'; g.fillRect(x0, sy({ z: -60 }), x1 - x0, y1 - sy({ z: -60 }));
    // 丘：影（南東へ落ちる）→ 日の面 → 等高線
    for (const q of T.hills) {
      const X = sx(q), Y = sy(q), rx = q.r * sc * 1.05, ry = q.r * sc * VK * 0.95, hp = q.h * sc * 1.6;
      g.fillStyle = 'rgba(60,40,20,.22)'; g.beginPath(); g.ellipse(X + hp * 0.5, Y + hp * 0.25, rx, ry, 0, 0, 6.3); g.fill();
      const hg = g.createRadialGradient(X - rx * 0.3, Y - hp - ry * 0.3, 2, X, Y - hp * 0.5, rx * 1.1); hg.addColorStop(0, 'rgba(236,222,184,1)'); hg.addColorStop(0.6, 'rgba(196,170,120,1)'); hg.addColorStop(1, 'rgba(160,130,86,.9)');
      g.fillStyle = hg; g.beginPath(); g.ellipse(X, Y - hp * 0.45, rx, ry + hp * 0.45, 0, 0, 6.3); g.fill();
      for (let k = 1; k <= 3; k++) { g.strokeStyle = ink + (0.25 + k * 0.1) + ')'; g.lineWidth = 1; g.beginPath(); g.ellipse(X, Y - hp * (0.25 + k * 0.2), rx * (1 - k * 0.24), ry * (1 - k * 0.24), 0, 0, 6.3); g.stroke(); }
    }
    g.strokeStyle = 'rgba(140,96,50,.6)'; g.lineWidth = Math.max(2, 3 * sc); g.setLineDash([6, 4]);
    for (const pts of T.roads) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(sx({ x }), sy({ z })) : g.moveTo(sx({ x }), sy({ z })))); g.stroke(); }
    g.setLineDash([]);
    for (const RV of T.rivers || []) {
      const P = RV.pts, w = RV.w * sc * 2 * VK + 2;
      g.strokeStyle = 'rgba(62,98,136,.85)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo(sx({ x }), sy({ z })) : g.moveTo(sx({ x }), sy({ z })))); g.stroke();
      g.strokeStyle = 'rgba(230,240,250,.55)'; g.lineWidth = 1; for (let i = 2; i < P.length; i += 2) { const [x, z] = P[i]; const X = sx({ x }), Y = sy({ z }); g.beginPath(); g.moveTo(X - 5, Y); g.quadraticCurveTo(X - 2.5, Y - 2, X, Y); g.quadraticCurveTo(X + 2.5, Y + 2, X + 5, Y); g.stroke(); }
      for (const f of RV.fords) {
        const X = sx({ x: f.x }), Y = sy({ z: f.z });
        if (f.bridge) { g.fillStyle = '#7a5530'; g.fillRect(X - f.w * sc * 0.5, Y - w * 0.8, f.w * sc, w * 1.6); g.strokeStyle = ink + '.8)'; g.lineWidth = 1.2; g.strokeRect(X - f.w * sc * 0.5, Y - w * 0.8, f.w * sc, w * 1.6); }
        else { g.fillStyle = 'rgba(200,190,150,.9)'; for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(X + k * f.w * sc * 0.25, Y + (k % 2) * 2, 2.2, 0, 6.3); g.fill(); } }
      }
    }
    // 林：木を奥から手前へ（影→幹→葉）
    for (const f of T.forests) {
      const rr = R(Math.abs(Math.round(f.x * 7 + f.z * 13)) + 999), n = Math.round(f.n * 0.8), trees = [];
      for (let k = 0; k < n; k++) { const a = rr() * 6.28, d = Math.sqrt(rr()) * 0.92; trees.push({ x: f.x + Math.cos(a) * d * f.r * (f.sx || 1), z: f.z + Math.sin(a) * d * f.r * (f.sz || 1), s: 3.5 + rr() * 2.2, c: rr() }); }
      trees.sort((a, b) => b.z - a.z);
      for (const t of trees) {
        const X = sx(t), Y = sy(t), s = t.s;
        g.fillStyle = 'rgba(40,30,15,.25)'; g.beginPath(); g.ellipse(X + s * 0.6, Y + s * 0.2, s * 0.9, s * 0.35, 0, 0, 6.3); g.fill();
        g.strokeStyle = ink + '.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y - s); g.stroke();
        g.fillStyle = `rgb(${46 + t.c * 30 | 0},${78 + t.c * 30 | 0},${44 + t.c * 18 | 0})`; g.beginPath(); g.moveTo(X, Y - s * 2.6); g.lineTo(X + s, Y - s * 0.7); g.lineTo(X - s, Y - s * 0.7); g.closePath(); g.fill();
      }
    }
    for (const v of T.villages) for (const [dx, dz] of [[-9, -4], [8, 3], [-1, 11]]) {
      const X = sx({ x: v.x + dx }), Y = sy({ z: v.z + dz });
      g.fillStyle = '#8b6a44'; g.fillRect(X - 6, Y - 3, 12, 7); g.fillStyle = '#4a3a2a'; g.beginPath(); g.moveTo(X - 8, Y - 2); g.lineTo(X, Y - 10); g.lineTo(X + 8, Y - 2); g.closePath(); g.fill();
    }
    g.restore();
    g.strokeStyle = '#6b4a28'; g.lineWidth = 3; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    return c;
  }
  const keyPts = () => [...keyPoints(mapId).filter((k) => k.name), ...(T.labels || []).map((l, i) => ({ id: `label${i}`, x: l.x, z: l.z, name: l.name, desc: l.desc }))];

  function rectS(r) { const xa = sx({ x: r.x1 }), xb = sx({ x: r.x0 }), ya = sy({ z: r.z1 }), yb = sy({ z: r.z0 }); return { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) }; }
  // 吸い付く所：枠の四角ごとに左・真ん中・右の三点（地形を選べる）
  const anchors = (sl) => sl.rects.flatMap((r) => [1 / 6, 0.5, 5 / 6].map((k) => ({ x: r.x0 + (r.x1 - r.x0) * k, z: (r.z0 + r.z1) / 2 })));
  // 陣札（地図の上）と一覧の札
  const cards = [], foeCards = [], items = [];
  function cardEl(p, foe) {
    const c = document.createElement('div'); c.className = 'fj-card' + (foe ? ' foe' : '');
    c.innerHTML = `${p.honjin ? `<span class="hq">${W2('本陣', 'HQ')}</span>` : ''}<div class="fc"></div><div class="tx"><span class="nm"></span><span class="hs"><i class="ic"></i><span class="ht"></span></span></div>`;
    c.querySelector('.nm').textContent = nm(p.name).slice(0, 6); c.querySelector('.ht').textContent = hs(p.heishu) + (foe ? '' : ' ' + p.troops);
    if (H?.face) H.face(c.querySelector('.fc'), p.name);
    const icn = HEISHU_ICON[p.heishu] || 'yari';
    if (H?.kataCanvas && icn !== 'yumi') c.querySelector('.ic').appendChild(H.kataCanvas(icn, 14));
    c.style.borderLeft = `6px solid ${HEISHU_COL[p.heishu] || HEISHU_COL.槍}`;
    c.setAttribute('aria-label', `${nm(p.name)}・${hs(p.heishu)}${foe ? '・' + W2('敵', 'enemy') : ''}`);
    return c;
  }
  function buildCards() {
    layer.innerHTML = ''; cards.length = 0; foeCards.length = 0; list.innerHTML = ''; items.length = 0;
    pieces.forEach((p, i) => {
      const c = cardEl(p, false); c.setAttribute('role', 'button'); c.tabIndex = 0;
      c.addEventListener('pointerdown', (e) => startDrag(i, e));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { pick(i); } });
      layer.appendChild(c); cards.push(c);
      const li = document.createElement('div'); li.className = 'fj-li'; li.setAttribute('role', 'button'); li.tabIndex = 0;
      li.innerHTML = `<div class="fc"></div><div><b></b><small></small></div>`;
      li.querySelector('b').textContent = nm(p.name); li.querySelector('small').textContent = `${hs(p.heishu)}・${p.troops}`;
      if (H?.face) H.face(li.querySelector('.fc'), p.name);
      li.addEventListener('pointerdown', (e) => startDrag(i, e));
      list.appendChild(li); items.push(li);
    });
    if (foeShown) for (const q of opts.foeLayout) {   // 相手の置き場は相手の側の書き方：真ん中を軸に裏返す
      const name = q.name, x = -(q.pos.x - map.w / 2), z = -(q.pos.y - map.h / 2);
      const k = Object.entries(KATA_TYPE).find(([, v]) => v === q.type)?.[0] || BO?.find((b) => b.name === name)?.fav || 'std';
      const fp = { name, heishu: heishuOf(k), honjin: !!q.honjin, pos: { x, z }, troops: troopsOf(BO?.find((b) => b.name === name)) };
      const c = cardEl(fp, true); layer.appendChild(c); foeCards.push([c, fp]);
    }
  }
  const pt = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function pick(i) { if (sel === i) detailMore = !detailMore; else { sel = i; detailMore = false; } draw(); }
  // 引く：札（地図か一覧）を掴み、指に付いて動く。放した所が枠なら吸い付く
  function startDrag(i, e) {
    e.preventDefault(); const p = pieces[i];
    const was = { slot: p.slot, pos: p.pos && { ...p.pos } }, q0 = pt(e);
    drag = { i, was, moved: false, x0: e.clientX, y0: e.clientY };
    const mv = (ev) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
      drag.moved = true; const q = pt(ev), w = fromS(q.x, q.y);
      p.pos = { x: Math.max(-map.w / 2, Math.min(map.w / 2, w.x)), z: Math.max(-map.h / 2, Math.min(map.h / 2, w.z)) }; p.slot = p.slot || '…';
      showTip(p); draw();
    };
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      const d = drag; drag = null; tip.hidden = true;
      if (!d) return;
      if (!d.moved) { p.slot = was.slot; p.pos = was.pos; pick(i); return; }
      const q = pt(ev), inside = q.x >= 0 && q.y >= 0 && q.x <= Wd && q.y <= Hd;
      drop(i, inside, was); sel = i; draw(); changed();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    void q0;
  }
  function showTip(p) {
    const s = suitAt(mapId, p.heishu, p.pos.x, p.pos.z), sl = slotAt(slots, p.pos), lk = slotAt(locked, p.pos);
    const tn = en ? { plain: 'Plain', road: 'Road', hill: 'Hill', forest: 'Wood', village: 'Village', ford: 'Ford', river: 'River' }[s.terrain] : s.name;
    tip.textContent = `${sl ? (en ? '' : sl.name + '・') : lk ? W2('未解放の枠', 'Locked slot') + '・' : W2('枠の外', 'Outside slots') + '・'}${tn}　${hs(p.heishu)}${W2('適性', ' fit')} ${s.mark}${s.why && !en ? '　' + s.why : ''}`;
    tip.style.left = `${Math.max(120, Math.min(Wd - 120, sx(p.pos)))}px`; tip.style.top = `${sy(p.pos) - 26}px`; tip.hidden = false;
    tip.style.borderColor = s.grade === 2 ? '#bfe3a1' : s.grade === 0 ? '#f2b3aa' : '#c9b27a';
  }
  // 落とす：総大将は本陣だけ・本陣には総大将だけ。枠の中なら近い吸い付く点へ（そこに居る者とは入れ替え）。枠の外・未解放なら元へ
  function drop(i, inside, was) {
    const p = pieces[i]; let sl = inside ? slotAt(slots, p.pos) : null;
    if (inside && !sl && slotAt(locked, p.pos)) flash(W2('この枠はまだ開いていない（軍団の第五・第六陣で開く）', 'This slot is locked (open the 5th/6th slot in your army)'));
    if (i === 0 && sl && !sl.honjin) sl = null;
    if (i !== 0 && sl?.honjin) sl = null;
    if (!sl) { p.slot = was.slot; p.pos = was.pos; return; }
    let best = null, bd = Infinity; for (const a of anchors(sl)) { const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z); if (d < bd) { bd = d; best = a; } }
    const other = sl.name === '後詰' ? pieces.find((q, j) => j !== i && q.slot === '後詰' && Math.hypot(q.pos.x - best.x, q.pos.z - best.z) < 4) : pieces.find((q, j) => j !== i && q.slot === sl.name);
    if (other) { other.slot = was.slot; other.pos = was.pos; other.honjin = was.slot === '本陣'; }
    p.slot = sl.name; p.honjin = !!sl.honjin; p.pos = { ...best };
    const s = suitAt(mapId, p.heishu, p.pos.x, p.pos.z), [rl] = roleOf(p.slot, p.heishu);
    flash(`${nm(p.name)}：${sl.name}${rl !== sl.name ? '・' + rl : '（' + honjinKind(p.pos, mapId) + '）'}・${hs(p.heishu)}${W2('適性', ' fit')} ${s.mark}`);
  }
  // 進む矢印（想定）：翼は敵の翼へ・中は正面へ・後詰は前の真ん中へ。相手（NPC）は赤で自陣へ
  function arrow(from, to, col) {
    const X0 = sx(from), Y0 = sy(from), X1 = sx(to), Y1 = sy(to), mx = (X0 + X1) / 2 + (X1 - X0) * 0.1, my = (Y0 + Y1) / 2;
    g2.strokeStyle = col; g2.lineWidth = 3; g2.setLineDash([7, 5]); g2.beginPath(); g2.moveTo(X0, Y0); g2.quadraticCurveTo(mx, my, X1, Y1); g2.stroke(); g2.setLineDash([]);
    const a = Math.atan2(Y1 - my, X1 - mx); g2.fillStyle = col; g2.beginPath(); g2.moveTo(X1, Y1); g2.lineTo(X1 - Math.cos(a - 0.45) * 10, Y1 - Math.sin(a - 0.45) * 10); g2.lineTo(X1 - Math.cos(a + 0.45) * 10, Y1 - Math.sin(a + 0.45) * 10); g2.closePath(); g2.fill();
  }
  const aim = (p, sgn) => (p.slot === '後詰' ? { x: p.pos.x * 0.5, z: sgn * -70 } : { x: p.pos.x * (/翼/.test(p.slot) ? 1.05 : 0.6), z: sgn * 35 });
  function draw() {
    if (!paper) paper = drawPaper();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, cv.width, cv.height); g2.drawImage(paper, 0, 0); g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ［地形］：選んだ武将の兵種の適性を地面に強く（◎緑・△赤）。川は通れない所を濃く
    if (layer2.terrain) {
      const k = pieces[sel]?.heishu || '騎馬', st = 10;
      for (let x = -map.w / 2; x < map.w / 2; x += st) for (let z = -map.h / 2; z < map.h / 2; z += st) {
        const s = suitAt(mapId, k, x + st / 2, z + st / 2); if (s.grade === 1 && s.terrain !== 'river') continue;
        g2.fillStyle = s.terrain === 'river' ? 'rgba(20,30,60,.55)' : s.grade === 2 ? 'rgba(80,160,70,.30)' : 'rgba(200,60,40,.30)';
        const a = rectS({ x0: x, x1: x + st, z0: z, z1: z + st }); g2.fillRect(a.x, a.y, a.w + 0.5, a.h + 0.5);
      }
    }
    // 枠（墨の点線・名）。未解放の枠は薄く『未解放』
    g2.font = 'bold 11px serif'; g2.textAlign = 'center';
    for (const s of locked) for (const r of s.rects) { const q = rectS(r); g2.setLineDash([3, 4]); g2.strokeStyle = 'rgba(60,60,60,.35)'; g2.lineWidth = 1; g2.strokeRect(q.x, q.y, q.w, q.h); g2.setLineDash([]); g2.fillStyle = 'rgba(60,50,40,.55)'; g2.fillText(W2(`${s.name}（未解放）`, 'Locked'), q.x + q.w / 2, q.y + q.h / 2 + 4); }
    for (const s of slots) {
      const occ = pieces.some((p) => p.slot === s.name);
      for (const r of s.rects) {
        const q = rectS(r);
        g2.fillStyle = s.honjin ? 'rgba(138,42,31,.13)' : occ ? 'rgba(40,70,120,.12)' : 'rgba(40,70,120,.05)'; g2.fillRect(q.x, q.y, q.w, q.h);
        g2.setLineDash(s.honjin ? [4, 3] : [6, 4]); g2.strokeStyle = s.honjin ? 'rgba(150,40,30,.85)' : 'rgba(40,50,90,.65)'; g2.lineWidth = 1.4; g2.strokeRect(q.x, q.y, q.w, q.h); g2.setLineDash([]);
        g2.fillStyle = s.honjin ? 'rgba(130,30,20,.9)' : 'rgba(30,40,80,.85)'; g2.fillText(en ? { 左翼: 'L.wing', 左中: 'L.center', 中央: 'Center', 右中: 'R.center', 右翼: 'R.wing', 後詰: 'Reserve', 本陣: 'HQ' }[s.name] : s.name, q.x + q.w / 2, q.y + q.h - 3);
      }
    }
    // 地名の札（金と白）。［情報］で一言も
    for (const k of keyPts()) {
      const P2 = [k.name, k.desc || ''];
      const X = sx(k), Y = sy(k) - (k.up ? k.up * sc * 1.6 + 8 : 8), t = en ? k.id.replace(/\d/, '') : P2[0];
      g2.font = 'bold 12px serif'; const w = g2.measureText(t).width + 12;
      g2.fillStyle = 'rgba(250,244,228,.92)'; g2.fillRect(X - w / 2, Y - 15, w, 17); g2.strokeStyle = '#b8902e'; g2.lineWidth = 1.5; g2.strokeRect(X - w / 2, Y - 15, w, 17);
      g2.fillStyle = '#3a2410'; g2.textAlign = 'center'; g2.fillText(t, X, Y - 2);
    }
    // ［情報］：地名ごとの一言を、地図の左上の箱に並べる（地図の上に重ねると読めない）
    if (layer2.info && !en) {
      const rows = keyPts().filter((k) => k.desc).map((k) => [k.name, k.desc]);
      g2.font = '12px sans-serif'; g2.textAlign = 'left';
      const w = Math.min(Wd - 16, Math.max(...rows.map((r) => g2.measureText(`${r[0]}：${r[1]}`).width)) + 16), h = rows.length * 17 + 8;
      g2.fillStyle = 'rgba(20,14,8,.9)'; g2.fillRect(8, 8, w, h); g2.strokeStyle = '#b8902e'; g2.strokeRect(8, 8, w, h);
      rows.forEach((r, i) => { g2.fillStyle = '#ffd88a'; g2.fillText(r[0], 16, 24 + i * 17); g2.fillStyle = '#f3ecd8'; g2.fillText('：' + r[1], 16 + g2.measureText(r[0]).width, 24 + i * 17); });
      g2.textAlign = 'center';
    }
    // K616 案F（原理8）：自分の置ける所（枠）より前は少し暗くして、置ける区域を浮かせる（地形は見えるまま）
    { let zt = -Infinity; for (const s of [...slots, ...locked]) for (const r of s.rects) zt = Math.max(zt, r.z0, r.z1);
      if (zt > -Infinity) { const ya = sy({ z: map.h / 2 }), yb = sy({ z: zt + 3 }), xa = sx({ x: map.w / 2 }), xb = sx({ x: -map.w / 2 }); if (yb > ya) { g2.fillStyle = 'rgba(24,16,8,.2)'; g2.fillRect(xa, ya, xb - xa, yb - ya); } } }
    // K616 案G（原理4）：駒の前に向きの扇（兵種の色）。自軍は敵の方へ、相手は自陣の方へ
    const fan = (pos, to, col, up) => { const X = sx(pos), Y = sy(pos) + (up ? -24 : 24), a = Math.atan2(sy(to) - sy(pos), sx(to) - sx(pos)), r = 30;
      g2.fillStyle = col; g2.globalAlpha = 0.42; g2.beginPath(); g2.moveTo(X, Y); g2.arc(X, Y, r, a - 0.55, a + 0.55); g2.closePath(); g2.fill(); g2.globalAlpha = 1; };
    for (const p of pieces) if (p.slot && p.slot !== '…' && p.pos) fan(p.pos, p.slot === '本陣' ? { x: p.pos.x, z: p.pos.z + 40 } : aim(p, 1), HEISHU_COL[p.heishu] || HEISHU_COL.槍, true);
    for (const [, fp] of foeCards) fan(fp.pos, { x: fp.pos.x * 0.8, z: fp.pos.z - 40 }, HEISHU_COL[fp.heishu] || HEISHU_COL.槍, false);
    // 進む矢印（薄く）
    for (const p of pieces) if (p.slot && p.slot !== '本陣' && p.slot !== '…' && p.pos) arrow(p.pos, aim(p, 1), 'rgba(40,90,170,.35)');
    for (const [, fp] of foeCards) if (!fp.honjin) arrow(fp.pos, { x: fp.pos.x * 0.8, z: -40 }, 'rgba(180,40,30,.32)');
    // 敵の名（対人は名だけ・置き場は見せない＝K605）
    if (!foeShown && opts.foe?.length) { g2.font = '12px serif'; g2.fillStyle = 'rgba(120,30,20,.95)'; g2.textAlign = 'center'; g2.fillText(W2(`敵出陣武将 ${opts.foe.length}名：`, `Enemy generals (${opts.foe.length}): `) + opts.foe.map(nm).join('・'), Wd / 2, Math.max(14, sy({ z: 120 }))); }
    // 札の位置
    pieces.forEach((p, i) => { const c = cards[i]; if (!c) return; const on = !!(p.slot && p.pos); c.style.display = on ? '' : 'none'; if (on) { c.style.left = `${sx(p.pos)}px`; c.style.top = `${sy(p.pos)}px`; } c.classList.toggle('sel', i === sel); });
    for (const [c, fp] of foeCards) { c.style.left = `${sx(fp.pos)}px`; c.style.top = `${sy(fp.pos)}px`; }
    const placed = pieces.filter((p) => p.slot && p.slot !== '…' && p.pos).length;
    items.forEach((li, i) => { const p = pieces[i]; li.classList.toggle('placed', !!(p.slot && p.slot !== '…')); li.classList.toggle('sel', i === sel); li.classList.toggle('miss', false); /* K610：置かない者は控え（赤い警告はやめ、上の『n人で出陣』で知らせる） */ });
    for (const b of jinBtns) b.setAttribute('aria-pressed', String(pieces[sel]?.formation === b.dataset.jin));
    const bk = bookLoad(); for (const b of bookBtns) { b.setAttribute('aria-pressed', String(b.dataset.book === bookSel)); b.style.opacity = bk[mapId + ':' + b.dataset.book] ? '1' : '.6'; }
    bTer.setAttribute('aria-pressed', String(layer2.terrain)); bInf.setAttribute('aria-pressed', String(layer2.info));
    count.innerHTML = `${W2('総兵力', 'Troops')} ${pieces.reduce((a, p) => a + (p.slot && p.slot !== '…' && p.pos ? p.troops || 1000 : 0), 0).toLocaleString()}<br>${W2('配置枠', 'Placed')} <b style="color:${placed < N ? '#ffd88a' : '#bfe3a1'}">${placed}/${N}</b>${placed < N && placed ? `<br><span style="color:#ffd88a">${W2(`${placed}人で出陣`, `${placed} will deploy`)}</span>` : ''}`;
    const lordIn = !!(pieces[0]?.slot && pieces[0].slot !== '…' && pieces[0].pos); bGo.disabled = !lordIn; bGo.classList.toggle('on', lordIn && !drag);   // K610：総大将（本陣）さえ置けば決められる
    if (performance.now() > flashT) { const p = pieces[sel]; if (p?.pos && p.slot && p.slot !== '…') { const s = suitAt(mapId, p.heishu, p.pos.x, p.pos.z); status.textContent = `${nm(p.name)}・${p.slot}${p.honjin ? '（' + honjinKind(p.pos, mapId) + '）' : ''}・${hs(p.heishu)}${W2('適性', ' fit')} ${s.mark}`; } else status.textContent = placed < N ? W2('武将を地図の枠へ引いて置く', 'Drag generals onto the slots') : ''; }
    drawDetail();
  }
  let missing = false;
  // 右下の詳細（K605）：名・兵種・兵力・役割・一言。もう一度押すと固有戦法・得意の地形・統率・士気
  function drawDetail() {
    const p = pieces[sel]; if (!p) { det.innerHTML = ''; return; }
    const [rl, say] = roleOf(p.slot === '…' || !p.slot ? (sel === 0 ? '本陣' : '中央') : p.slot, p.heishu);
    const tac = TC?.TACTICS?.[TC?.BUSHO_TACTIC?.[p.name]];
    const st = BO && H?.bushoOf ? (BO.statsOf?.(BO.bushouByName?.(p.name)) || null) : null;
    const key = `${p.name}|${p.slot}|${detailMore}|${!!tac}|${!!st}`; if (det.dataset.k === key) return; det.dataset.k = key;
    det.innerHTML = `<b></b><div></div><div class="rl"></div><div style="opacity:.85"></div>${detailMore ? '<hr style="border:0;border-top:1px solid #6b5030;margin:4px 0"><div class="mo"></div>' : `<div style="font-size:11px;opacity:.6">${W2('もう一度押すと詳しく', 'Tap again for more')}</div>`}`;
    det.children[0].textContent = nm(p.name);
    det.children[1].textContent = `${hs(p.heishu)}・${W2('兵力', 'Troops')} ${p.troops}・${p.rare}`;
    det.children[2].textContent = `${W2('役割', 'Role')}：${rl}`;
    det.children[3].textContent = en ? '' : say;
    if (detailMore) det.querySelector('.mo').textContent = [tac ? `${W2('固有戦法', 'Tactic')}：${en ? tac.en : tac.name}` : '', `${W2('得意の地形', 'Best ground')}：${en ? '' : BEST_GROUND[p.heishu] || ''}`, st ? `${W2('統率', 'Command')} ${st.COMMAND}・${W2('士気', 'Morale')} ${st.MORALE}` : ''].filter(Boolean).join('\n');
    det.style.whiteSpace = 'pre-line';
  }
  det.onclick = () => { detailMore = !detailMore; draw(); };
  bTer.onclick = () => { layer2.terrain = !layer2.terrain; draw(); };
  bInf.onclick = () => { layer2.info = !layer2.info; draw(); };
  bClr.onclick = () => { for (const p of pieces) { p.slot = null; p.pos = null; p.honjin = false; } sel = 0; draw(); changed(); flash(W2('武将を地図へ置き直す', 'Place your generals again')); };
  bRec.onclick = () => { setTimeout(changed, 0); pieces = recommendLayout(pieces.map((p, i) => ({ ...p, pos: p.pos || center(slotsFor(N, mapId)[0].rects[0]), slot: p.slot || (i ? '中央' : '本陣') })), mapId); buildCards(); draw(); flash(W2('兵種と地形と役割から置いた（後から直せる）', 'Placed by type, terrain and role')); };
  // 布陣決定 → 確かめの札［出陣］［修正］→ 3・2・1・開戦 → 地図から寄って戦場へ
  let going = false;
  const confirmGo = () => {
    const placed = pieces.filter((p) => p.slot && p.slot !== '…' && p.pos).length;
    if (!(pieces[0]?.slot && pieces[0].slot !== '…' && pieces[0].pos)) { flash(W2('総大将を本陣に置く', 'Place your general in the HQ')); return; }
    const ov = document.createElement('div'); ov.className = 'fj-ov';
    ov.innerHTML = `<div class="bx"><div style="font:700 17px serif">${W2('この布陣で出陣しますか？', 'Deploy with this layout?')}</div>${placed < N ? `<div style="font-size:14px;color:#ffd88a">${W2(`${placed}人で出陣（${N - placed}人は控え）`, `${placed} deploy (${N - placed} stay back)`)}</div>` : ''}<div style="display:flex;gap:10px;justify-content:center"></div></div>`;
    const bOk = btn(W2('出陣', 'Deploy')), bFix = btn(W2('修正', 'Adjust')); bOk.style.background = '#8a2a1f'; bOk.style.minWidth = '120px'; bFix.style.minWidth = '120px';
    ov.querySelector('.bx > div:last-child').append(bOk, bFix); wrap.appendChild(ov); bOk.focus({ preventScroll: true });
    bFix.onclick = () => ov.remove();
    bOk.onclick = () => { ov.remove(); launch(); };
  };
  const launch = (quick = false) => {
    if (going) return; going = true; clearInterval(tmT);
    const bk = bookLoad(); bk[mapId + ':前回'] = snap(); bookSave(bk);   // 同じ地図の再戦は前回の布陣
    const st = api.state(), placedSt = { ...st, generals: st.generals.filter((g, i) => pieces[i]?.slot && pieces[i].slot !== '…' && pieces[i].pos) }, lay = toLayout(placedSt, map);   // K610：置いた者だけ出陣
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cd = document.createElement('div'); cd.className = 'fj-cd'; cd.setAttribute('role', 'status'); wrap.appendChild(cd);
    const seq = opts.countdown === false || quick ? [] : ['3', '2', '1', W2('開戦', 'Battle!')];
    let k = 0;
    const next = () => {
      if (k < seq.length) { cd.textContent = seq[k++]; setTimeout(next, reduce ? 450 : 700); return; }
      cd.remove();
      const on = pieces.filter((p) => p.pos && p.slot && p.slot !== '…'), own = on.reduce((a, p) => ({ x: a.x + p.pos.x / on.length, z: a.z + p.pos.z / on.length }), { x: 0, z: 0 });
      stage.style.transformOrigin = `${sx(own)}px ${sy(own)}px`;
      stage.style.transition = reduce ? 'opacity .3s' : 'transform 1.1s cubic-bezier(.5,0,.8,.4), opacity 1.1s ease-in';
      for (const el of [bar, side, right, bottom]) { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }
      requestAnimationFrame(() => { if (!reduce) stage.style.transform = 'scale(4.5)'; stage.style.opacity = '0'; });
      setTimeout(() => opts.onDone?.(lay, st), reduce ? 320 : 1050);
    };
    next();
  };
  // 道具（描かずの通し・bot・window.__fujinNoConfirm）は確かめの札と数え下げを飛ばす（npc_run・online_flow などが止まらないように）
  const toolRun = typeof location !== 'undefined' && (/[?&](norender|bot)\b/.test(location.search) || globalThis.__fujinNoConfirm);
  bGo.onclick = () => { if (toolRun) { if (pieces.some((p) => !p.slot || p.slot === '…' || !p.pos)) bRec.onclick(); launch(true); } else confirmGo(); };
  // 布陣の時間（K605：NPC は無し・気軽な対人 60秒・段位戦 45秒）。切れたら置いていない者をおすすめで置いてそのまま出陣
  let tmT = 0;
  if (opts.timeLimit > 0) {
    let left = opts.timeLimit; timer.textContent = String(left);
    tmT = setInterval(() => { left--; timer.textContent = String(Math.max(0, left)); timer.style.color = left <= 10 ? '#ff8a7a' : '#ffd88a'; if (left <= 0) { clearInterval(tmT); if (pieces.some((p) => !p.slot || p.slot === '…' || !p.pos)) bRec.onclick(); launch(); } }, 1000);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; ro?.observe(stage);
  const api = {
    state: () => ({ generals: pieces.map((p) => ({ id: p.id, name: p.name, troops: p.troops, formation: p.formation, type: p.type, slot: p.slot, pos: { x: +(p.pos?.x ?? 0).toFixed(2), z: +(p.pos?.z ?? -130).toFixed(2) }, facing: 0, honjin: !!p.honjin })), honjin: honjinKind(pieces[0]?.pos, mapId) }),
    destroy: () => { clearInterval(tmT); ro?.disconnect(); wrap.remove(); },
    // 外の札から地図へ（軍団の上の札・手持ちの棚）：その武将の pointerdown の event を渡すと、地図の上で引いて置ける（吸い付き・適性の札も同じ）
    dragFrom: (name, e) => { const i = pieces.findIndex((p) => p.name === name); if (i < 0) return false; startDrag(i, e); return true; },
    // 画面の点（clientX, clientY）へ直に置く（落とした所が枠でなければ元のまま）。置けたら true
    addGeneral: (name, clientX, clientY) => {
      const i = pieces.findIndex((p) => p.name === name); if (i < 0) return false;
      const p = pieces[i], was = { slot: p.slot, pos: p.pos && { ...p.pos } }, q = pt({ clientX, clientY });
      const inside = q.x >= 0 && q.y >= 0 && q.x <= Wd && q.y <= Hd; p.pos = fromS(q.x, q.y);
      drop(i, inside, was); sel = i; draw(); changed();
      return !!(p.slot && p.slot !== '…' && (p.slot !== was.slot || !was.pos || p.pos.x !== was.pos.x || p.pos.z !== was.pos.z));   // 置き場か位置が変わった時だけ true
    },
  };
  fill(); buildCards(); fit();
  Promise.all([import('./house.js').then((m) => (H = m)).catch(() => null), import('./tactics.js').then((m) => (TC = m)).catch(() => null), import('./bushou_online.js').then((m) => { BO = m.BUSHOU_ONLINE; BO.statsOf = m.statsOf; BO.bushouByName = m.bushouByName; }).catch(() => null)]).then(() => {
    fill();
    // 同じ地図の再戦は前回の布陣（同じ顔ぶれの者だけ）
    const prev = bookLoad()[mapId + ':前回']; if (prev && opts.usePrev !== false && !opts.initial) applyBook(prev);
    if (opts.initial) applyBook(opts.initial);   // K607：軍団で決めた既定の布陣（戦場の枠へ写した物）から始める
    buildCards(); draw();
  });
  return api;
}
