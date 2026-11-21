// 軽い型の戦（light_battle.js）に城を一つ置く（K563 武田編・上杉編の城攻め・11/21 クラウド35）
//   使い方：export const u11_nanao = withCastle(lightBattle({ ... }), { plan: NANAO_PLAN, at: { x: 0, z: -120 }, lift: 30, team: 1 })
//   plan は castles/<城>.js の縄張り（座標は城の中心を原点にした局所の値）。at に動かして置く。
//   lift：城の下に盛る山の高さ（山城。0 で平城）。scale：平面を縮める倍（既定 1）。地面の格子は要る分だけ広げる（260 まで）。山は城の外へなだらかに下がり、曲輪の段（level）は山の頂の高さからの差として置く。
//   guards：門・櫓・御殿の中の守りの兵（共通の makeInteriorGuards）。既定は置かない＝敵は戦の段の表（foes）だけ。
//   near：本人が城の中へ入る戦だけ true（櫓・御殿・門を中に入れる共通の作りで建てる）。既定 false＝遠景の城：
//     櫓・御殿・門・門の篝火を、中に入れない外回りだけの軽い形にして一つの形へまとめる（描く回数は塀・土塁の束と合わせて十数回）。
//     11/21 クラウド35：春日山を向くと一コマの描く回数が城なし約330→約445。増えた分の大半が中に入れる櫓・御殿の部品と門の篝火だった。
//   realGates：遠景の城でも門だけは共通の本物の門（本人が門の前で戦う城攻め。d10 長篠城）。櫓・御殿は軽い形のまま。
//   堀（hori）は地面を掘り、曲輪の塀・櫓・門・御殿は共通の buildCastlePlan が建てる（新しい動きは足さない）。
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { solidRect, solidSeg } from './props.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 遠景の城の軽い形：櫓（井楼の脚と囲い・寄棟）・御殿（壁と大屋根）・門（二本の柱と冠木と小屋根）を頂点色の一つの形に
const FAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
function paintGeo(g, hex) {
  const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
function farShells(rt, P) {
  const W = rt.world, parts = [];
  const box = (x, y, z, w, h, d, rot, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(x, y + h / 2, z); parts.push(paintGeo(g, hex)); };
  const roof = (x, y, z, w, d, h, rot, hex) => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(w, h, d); g.rotateY(rot); g.translate(x, y + h / 2, z); parts.push(paintGeo(g, hex)); };
  for (const y of P.yagura || []) {
    const [x, z] = y.at, g = W.heightAt(x, z), r = y.rot || 0, H = 5.2;
    for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const c = Math.cos(r), s = Math.sin(r); box(x + lx * c + lz * s, g, z - lx * s + lz * c, 0.28, H, 0.28, r, 0x4a3a2a); }
    box(x, g + H - 1.6, z, 3.1, 1.5, 3.1, r, 0x6b5a44);
    roof(x, g + H - 0.1, z, 4.4, 4.4, 1.5, r, 0x4f4a45);
    solidRect(x, z, 2.8, 2.8, r);   // K168：軽い形でも兵と本人が櫓の脚の内を抜けない
  }
  if (P.lordSeat) {
    const L = P.lordSeat, [x, z] = L.at, g = W.heightAt(x, z), r = L.rot || 0;
    box(x, g, z, L.w || 11, 2.7, L.d || 7, r, 0xb8ab90);
    box(x, g + 2.35, z, (L.w || 11) + 0.1, 0.18, (L.d || 7) + 0.1, r, 0x2e2016);
    roof(x, g + 2.7, z, (L.w || 11) + 2.2, (L.d || 7) + 2.2, 2.6, r, 0x4d4842);
    solidRect(x, z, L.w || 11, L.d || 7, r);   // K168：御殿の壁を抜けない
  }
  for (const k of P.koguchi || []) {
    if (!k.at) continue;
    const [x, z] = k.at, g = W.heightAt(x, z), r = k.rot || 0, w = (k.w || k.w1 || 4.4) / 2 + 0.2, c = Math.cos(r), s = Math.sin(r);
    for (const sx of [-1, 1]) box(x + sx * w * c, g, z - sx * w * s, 0.36, 3.4, 0.36, r, 0x3e2e22);
    for (const sx of [-1, 1]) { const px = x + sx * w * c, pz = z - sx * w * s; solidSeg(px - .2, pz, px + .2, pz, .25); }   // 門柱
    box(x, g + 3.2, z, w * 2 + 0.8, 0.32, 0.4, r, 0x3a2a1c);
    roof(x, g + 3.5, z, w * 2 + 1.6, 1.8, 0.9, r, 0x4f4a45);
  }
  if (!parts.length) return null;
  const m = new THREE.Mesh(mergeGeometries(parts), FAR_MAT);
  m.castShadow = m.receiveShadow = true; m.name = '遠景の城の櫓と門';
  rt.scene.add(m);
  return m;
}

// 縄張りの座標を at へ動かした複製（元の plan は変えない）。scale で平面だけ縮める（段の高さ・堀の深さはそのまま）
// flip：城を半回り（180度）回して置く（大手を +z へ向ける。11/21 クラウド42：春日山・海津を戦の側へ向けるため）
export function placePlan(plan, at, top = 0, scale = 1, flip = false) {
  const f = flip ? -scale : scale, R = (r) => (flip && r != null ? r + Math.PI : r);
  const dx = at.x, dz = at.z, M = (p) => [p[0] * f + dx, p[1] * f + dz], MM = (a) => a.map(M);
  return {
    ...plan,
    kuruwa: plan.kuruwa.map((k) => ({ ...k, level: (typeof k.level === 'function' ? k.level(() => 0) : k.level) + top, poly: MM(k.poly),
      gapAt: k.gapAt ? (Array.isArray(k.gapAt[0]) ? MM(k.gapAt) : M(k.gapAt)) : k.gapAt })),
    koguchi: (plan.koguchi || []).map((g) => ({ ...g, rot: R(g.rot), at: g.at && M(g.at), sideFire: g.sideFire && g.sideFire.map(([x, z, r, n]) => [...M([x, z]), r, n]) })),
    paths: (plan.paths || []).map((p) => ({ ...p, pts: MM(p.pts) })),
    hori: (plan.hori || []).map((h) => ({ ...h, pts: MM(h.pts) })),
    yagura: (plan.yagura || []).map((y) => ({ ...y, rot: R(y.rot), at: M(y.at) })),
    yokoya: (plan.yokoya || []).map((y) => ({ ...y, dir: R(y.dir), at: M(y.at) })),
    lordSeat: plan.lordSeat && { ...plan.lordSeat, rot: R(plan.lordSeat.rot), at: M(plan.lordSeat.at) },
    taba: (plan.taba || []).map(M),
  };
}

export function withCastle(def, { plan, at, lift = 0, radius = 0, team = 1, mon, scale = 1, flip = false, life = true, guards = false, near = false, realGates = false } = {}) {
  const old = def.world.height;
  // 城の広がり（曲輪の外枠の半径）。山の裾はその1.6倍まで
  let R = radius;
  if (!R) for (const k of plan.kuruwa) for (const [x, z] of k.poly) R = Math.max(R, Math.hypot(x, z) * scale);
  const top = old(at.x, at.z) + lift;
  const P = placePlan(mon ? { ...plan, mon } : plan, at, top, scale, flip);
  // 城と山の裾が地面の格子（既定 180）の外に出ると、平らな遠景の野に建物が浮く。要る分だけ広げる（260 まで。広げすぎると重い）
  const need = Math.ceil(Math.max(Math.abs(at.x), Math.abs(at.z)) + R * (lift ? 1.6 : 1.1) + 12);
  if (need > (def.world.groundHalf || 180)) def.world.groundHalf = Math.min(260, need);
  if (need > 260) console.warn('城が地面の外へ出る：at を中へ寄せるか scale を小さく', plan.name, need);
  const hill = (x, z) => {
    if (!lift) return 0;
    const d = Math.hypot(x - at.x, z - at.z) / (R * 1.6);
    return d >= 1 ? 0 : lift * (1 - d * d) * (1 - d * d);
  };
  const HORI = P.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
  const base = (x, z) => { let h = old(x, z) + hill(x, z); for (const f of HORI) h += f(x, z); return h; };
  const castleH = heightOf(P, base, 3);
  def.world.height = (x, z) => castleH(x, z);
  // 城の中と堀の上に木を生やさない
  const td = def.world.treeDensity;
  def.world.treeDensity = (x, z) => (Math.hypot(x - at.x, z - at.z) < R + 12 ? 0 : td ? td(x, z) : 1);
  // 戦の森（groves）は treeDensity を見ないので、城にかかる森は置かない（11/21 クラウド35：u15 長谷堂・u08 臼井・u09 本庄で曲輪の中に杉が立った。
  //   城の外へずらすと、新しい所の木の束の分だけ描く回数が増えた）
  if (def.world.groves) def.world.groves = def.world.groves.filter((g) => Math.hypot(g.x - at.x, g.z - at.z) >= R + 12 + g.r * 0.5);
  const setup = def.setup;
  def.setup = function (rt) {
    // life: false＝城の中の兵と暮らしを置かない（遠景の城・11/21 クラウド42 川中島の海津）
    try {
      if (near) rt.flags.castle = buildCastlePlan(rt, P, { baseHeight: base, edgeW: 3, buildGates: true, buildTowers: true, life, team, interiorGuards: guards });
      else {
        // 遠景：塀・土塁・堀・暮らしの小屋（束）は共通の作り、櫓・御殿・門は軽い形
        // 遠景の水堀は空堀にする：水面は一枚の平らな板で、細い堀・曲がった堀では描く地面（2.5 歩の格子）の溝と合わず、
        //   宙に浮いた青い四角に見えた（海津の三日月堀。幅を7歩に広げても直らなかった。11/21 クラウド35）
        const dry = P.hori.map((h) => ({ ...h, water: false, kind: h.kind === 'mizubori' ? 'karabori' : h.kind }));
        rt.flags.castle = buildCastlePlan(rt, { ...P, hori: dry, yagura: [], lordSeat: null }, { baseHeight: base, edgeW: 3, buildGates: realGates, buildTowers: false, buildSeat: false, life, team, interiorGuards: false });
        rt.flags.castleShell = farShells(rt, realGates ? { ...P, koguchi: [] } : P);
      }
    }
    catch (e) { console.warn('城を建てられなかった', e); }
    return setup.call(this, rt);
  };
  def.castlePlan = P;
  return def;
}
