// t04a_sengokubori/scene.js … 千石堀城の舞台（地形・城・本陣・兵の組）。段の中身は s1〜s5 の各ファイル
// 北（-z）から寄せる。外の木柵と土橋の木戸 → 土橋の先の虎口の門 → 二の丸（小屋が燃える）→ 橋の無い堀の先の本丸（煙硝蔵）。
import * as THREE from 'three';
import { castleBoardFence, hut, kabukimon, jinmaku, shogi, nobori, solidSeg } from '../props.js';
import { enemyGroup } from '../bhelp.js';
import { addSite } from '../map_sites.js';
import { troops } from '../toyo15/kit.js';

export const HASHIBA = { armor: 0x282420, flag: 'toyotomi' };
export const NEGORO = { armor: 0x302a24, flag: 'maru' };
export const P = {
  spawn: { x: 0, z: -168 }, camp: { x: -18, z: -118 },
  rally: { x: 0, z: -72 },          // 秀次の先手の竹束
  kido: { x: 0, z: -39 },           // 外の木柵・土橋の木戸
  gate: { x: 0, z: -32 },           // 虎口の門
  ni: { x: 0, z: -19 },             // 二の丸
  hon: { x: 0, z: 18 },             // 本丸
  store: { x: 9, z: 33 },           // 煙硝蔵
  archer: { x: 44, z: -18 },        // 東の堀の外の火矢の射手
};
const clamp = (v) => Math.max(0, Math.min(1, v));
export function senHeight(x, z) {
  let h = 0.6 + 3.4 * clamp((z + 70) / 30) * clamp((70 - z) / 30);
  const east = Math.min(Math.abs(x - 30), Math.abs(x - 39));
  const west = Math.abs(x + 30);
  if (z > -27 && z < 50) h -= 2.8 * clamp(1 - Math.min(east, west) / 3);
  if (Math.abs(x) > 4 && Math.abs(x) < 28) h -= 2.6 * clamp(1 - Math.abs(z + 32) / 4);
  // 本丸の手前の堀（橋は外してある）。最後の段で崩れた土手から渡る
  if (Math.abs(x) < 25) h -= 3 * clamp(1 - Math.abs(z - 2) / 4) * (Math.abs(x) < 5 ? 0.45 : 1);
  return h;
}
// 北の土橋を出てから、東の二重堀の北を回る（火矢の射手へ行く時）
export function route(u, want) {
  const p = u.pos, q = u._kishuWay || (u._kishuWay = { x: 0, z: 0, botRadius: 2 });
  // 東の堀外へ出る時は、城内の行き先と取り違えず北の門まで戻る。
  // 先に元の行き先で虎口を判定すると、門の内外を往復して堀外へ出られない。
  if (want.x > 40) {
    if (p.x >= 42) return want;
    if (p.z > 6 && Math.abs(p.x) < 25) { q.x = 0; q.z = p.z > 8 && Math.abs(p.x) > 2.5 ? 14 : 3; }
    else if (p.z > -28.5 && Math.abs(p.x) < 25) { q.x = 2; q.z = -30.5; }
    else { q.x = p.z > -39 ? 0 : 47; q.z = -44; }
    return q;
  }
  if (want.x < 10 && p.x > 28) { q.x = p.z > -39 ? 47 : 0; q.z = -44; return q; }
  // 本丸から二の丸へ戻る兵も、北の開いた門を通す。
  if (want.z < 7 && p.z > 6 && Math.abs(p.x) < 25) {
    q.x = 0; q.z = p.z > 8 && Math.abs(p.x) > 2.5 ? 14 : 3; return q;
  }
  // 外の木柵も中央の木戸を通す。虎口の手前で止まる行き先や、外へ戻る兵も塀へ直進させない。
  if (want.z > -37 && p.z < -37 && Math.abs(p.x) < 28) {
    q.x = 0; q.z = Math.abs(p.x) > 2.5 ? -41 : -35; return q;
  }
  if (want.z < -37 && p.z > -37 && p.z < -31 && Math.abs(p.x) < 28) {
    q.x = 0; q.z = Math.abs(p.x) > 2.5 ? -34 : -41; return q;
  }
  // 虎口（北の門）：塀を抜けず、門の口（x が ±2.5 の内）を通る。内の食い違いの塀（x −7〜−1）は右から回る
  if (want.z > -30 && p.z < -31) { if (Math.abs(p.x) > 2.5) { q.x = 0; q.z = -41; } else { q.x = 2.5; q.z = -27; } return q; }
  if (want.z < -33 && p.z > -31 && p.z < -4) { if (p.z > -28.5) { q.x = 2; q.z = -30.5; } else if (Math.abs(p.x) > 2.5) { q.x = 0; q.z = -29; } else { q.x = 0; q.z = -38; } return q; }
  // 二の丸の南口から堀へ。左右の小屋や塀へ直進せず、開いた中央を通す。
  if (want.z > -3 && p.z < -3 && p.z > -31) { q.x = 0; q.z = Math.abs(p.x) > 2.5 ? -7 : 0; return q; }
  if (want.z < -5 && p.z > -5 && p.z < 7) { q.x = 0; q.z = Math.abs(p.x) > 2.5 ? 0 : -8; return q; }
  // 本丸の門（焼け落ちた後）：塀を抜けず、門の口を通る
  if (want.z > 9 && p.z < 7 && p.z > -4) { if (Math.abs(p.x) > 2.5) { q.x = 0; q.z = 3; } else { q.x = 0; q.z = 11; } return q; }
  return want;
}
function fence(rt, seg, h = 2.4) {
  rt.scene.add(castleBoardFence(rt.world, seg, { h }));
  const s = solidSeg(...seg, 0.18);
  s.missileH = h; s.missileType = 'wood';
  return s;
}
// 門扉（板戸）：struct にして、段の筋で破る（hp では時間を決めない）
function door(rt, x, z, w, name, h = 3) {
  const W = rt.world, mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), new THREE.MeshLambertMaterial({ color: 0x3e2e20 }));
  mesh.position.set(x, W.heightAt(x, z) + h / 2, z); mesh.castShadow = true; rt.scene.add(mesh);
  return rt.army.addStruct({ seg: [x - w / 2, z, x + w / 2, z], nx: 0, nz: -1, hp: 99999, maxHp: 99999, team: 1, name, mesh, noTarget: true });   // 打たせる門の札は出さない（段の筋で破る）
}
export function breakStruct(rt, s) { if (s && s.alive) rt.army.damage(s, s.hp + 1, null); }
function burnSpot(W, x, z, w, d, part, name) { (W.burnSpots || (W.burnSpots = [])).push({ x, z, w, d, y: W.heightAt(x, z), h: 4, rot: 0, part, name }); }
// 塀の上の鉄砲衆（持ち場を離れない）
export function sentries(rt, name, spots, dmg = 0.05) {
  const g = enemyGroup(rt, { faction: 'saika', flag: 'maru', name, anchor: spots[0], fixed: true, noRout: true, order: 'hold', aggro: 2, seekRange: 0, dmgMult: dmg },
    spots.map(() => ({ type: 'gun', n: 1, o: NEGORO })));
  g.stay = true; g.noAI = true; g.gunRanks = () => 1;
  g.units.forEach((u, i) => {
    const p = spots[i], y = rt.world.heightAt(p.x, p.z) + 1.15;
    u.pos.set(p.x, y, p.z); u.mesh.position.copy(u.pos);
    u.perch = { x: p.x, y, z: p.z }; u.gunAmmo = 30;
  });
  return g;
}
export function silence(g) { if (g) for (const u of g.units) { u.gunAmmo = 0; u.target = null; } }

export function build(rt) {
  const F = rt.flags, W = rt.world;
  // 秀吉の本陣（床几・陣幕）。通り過ぎる時に「巨大な本陣」を見せる
  rt.scene.add(jinmaku(W, P.camp.x, P.camp.z, 16, 12, 6, { mon: 'toyotomi' }));
  rt.scene.add(shogi(W, P.camp.x, P.camp.z + 1));
  for (const [x, z] of [[-30, -126], [-6, -126], [-30, -110], [-6, -110], [8, -132], [-40, -118]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  const camp = troops(rt, true, '秀吉の本陣', { x: P.camp.x, z: P.camp.z + 1 }, [{ type: 'ashigaru', n: 10 }, { type: 'busho', n: 1, o: { name: '羽柴秀吉' } }], HASHIBA);
  camp.stay = true; camp.aggro = 0; camp.seekRange = 0;
  for (const u of camp.units) if (u.name === '羽柴秀吉') { u.invuln = true; u.noTarget = true; u.jinchu = { standing: false, t: 0, soldiers: [] }; }
  // 二の丸の囲み（北に虎口）。外の木柵（土橋の左右）と木戸
  for (const seg of [[-23, -32, -4, -32], [4, -32, 23, -32], [-23, -32, -23, -4], [23, -32, 23, -4], [-23, -4, -4, -4], [4, -4, 23, -4]]) fence(rt, seg);
  rt.scene.add(kabukimon(W, 0, -32, 8));
  fence(rt, [-7, -26, -1, -26]);   // 虎口の内の食い違い
  F.outer = [fence(rt, [-26, -37, -4, -37], 1.8), fence(rt, [4, -37, 26, -37], 1.8)];
  F.kido = door(rt, 0, -37.2, 8, '土橋の木戸', 2.2);
  F.gate = door(rt, 0, -32.4, 8, '虎口の門', 3.1);
  // 本丸の囲み（北の塀に焼けて崩れる門）
  for (const seg of [[-23, 8, -4, 8], [4, 8, 23, 8], [-23, 8, -23, 48], [23, 8, 23, 48], [-23, 48, 23, 48]]) fence(rt, seg);
  F.honGate = door(rt, 0, 7.8, 8, '本丸の門', 2.8);
  // 二の丸の小屋（火矢で燃える）・本丸の小屋と煙硝蔵
  F.niHuts = [[-13, -19, 8, 6], [13, -21, 7, 5], [-14, -10, 6, 5]].map(([x, z, w, d]) => { const m = hut(W, x, z, w, d); rt.scene.add(m); return { x, z, w, d, m }; });
  F.store = hut(W, P.store.x, P.store.z, 8, 6); rt.scene.add(F.store);
  const h2 = hut(W, -10, 30, 9, 6); rt.scene.add(h2);
  burnSpot(W, -10, 30, 9, 6, h2, '本丸の小屋');
  for (const [x, z] of [[-18, -28], [18, -28], [-18, 12], [18, 44], [6, 14]]) rt.scene.add(nobori(W, x, z, 'maru', 5));
  // 自分の先手（羽柴秀次）
  F.friends = troops(rt, true, '羽柴秀次の先手', { x: 4, z: -80 }, [{ type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }, { type: 'busho', n: 1, o: { name: '羽柴秀次', horse: true } }], HASHIBA);
  F.friends.stay = true;
  addSite(rt, 'castle', 0, 28, '千石堀城本丸');
  addSite(rt, 'fort', 0, -19, '二の丸');
  addSite(rt, 'fort', 0, -40, '北の土橋');
}
