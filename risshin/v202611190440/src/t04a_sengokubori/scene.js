// t04a_sengokubori/scene.js … 千石堀城の舞台（地形・城・本陣・兵の組）。段の中身は s1〜s5 の各ファイル
// 北（-z）から寄せる。外の木柵と土橋の木戸 → 土橋の先の虎口の門 → 二の丸（小屋が燃える）→ 橋の無い堀の先の本丸（煙硝蔵）。
import * as THREE from 'three';
import { castleBoardFence, hut, kabukimon, jinmaku, shogi, nobori, solidSeg } from '../props.js';
import { enemyGroup } from '../bhelp.js';
import { addSite } from '../map_sites.js';
import { drawGroundAt } from '../render_camera.js';
import { troops } from '../toyo15/kit.js';
import { addTaba, patchGunCover } from '../taketaba.js';

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
  return tabaWay(u, castleRoute(u, want));
}
// 据え竹束へ直進すると、敵や持ち場が近くても束の裏で止まる。
// 城の門を通る経路を決めた後で、三列の竹束だけ中央か外端へ回す。
const TABA_ROWS = [-70, -48.5, -44.5];
function tabaWay(u, want) {
  const p = u.pos;
  // 丸太の六人を中央の一点へ集めると、竹束と仲間に塞がれて門を打てない。
  // 二列を束の外端へ通し、最後の束を越えてから木戸の口へ寄せる。
  if (u.group?.senRam && u.group.order === 'assault' && p.z < -42 && want.z > p.z) {
    const q = u._kishuTabaWay || (u._kishuTabaWay = { x: 0, z: 0 });
    q.x = u.slot % 2 ? 4 : -4;
    q.z = Math.abs(p.x - q.x) > 0.6 ? p.z : -41;
    // 押されて束の横へ出た時も、束の手前だけへ戻して外端へ抜ける。
    if (Math.abs(p.x - q.x) > 0.6) for (const z of TABA_ROWS) {
      if (Math.abs(p.z - z) < 1.6) { q.z = z - 1.6; break; }
    }
    return q;
  }
  if (u.isPlayer || p.z < -74 || p.z > -42) return want;
  const dz = want.z - p.z;
  if (Math.abs(dz) < 0.01) return want;
  const dir = Math.sign(dz);
  for (let i = 0; i < 3; i++) {
    const z = TABA_ROWS[dir > 0 ? i : 2 - i];
    if ((z - p.z) * dir < 0 || (want.z - z) * dir < 0.9) continue;
    const t = Math.max(0, Math.min(1, (z - p.z) / dz));
    const x = p.x + (want.x - p.x) * t;
    if (Math.abs(x) < 0.45 || Math.abs(x) > 3.55) continue;
    const q = u._kishuTabaWay || (u._kishuTabaWay = { x: 0, z: 0 });
    const lane = Math.abs(p.x) <= 2 ? 0 : Math.sign(p.x) * 4;
    q.x = lane;
    q.z = Math.abs(p.x - lane) > 0.2 ? z - dir * 1.2 : z + dir * 1.2;
    return q;
  }
  return want;
}
function castleRoute(u, want) {
  const p = u.pos, q = u._kishuWay || (u._kishuWay = { x: 0, z: 0, botRadius: 2 });
  // 二の丸・本丸の側塀の外にいる兵は、内側の経由点へ直進させない。
  // 先に外の木柵の端より外へ寄せ、北へ回ってから中央の木戸へ向かう。
  if (Math.abs(p.x) >= 23 && Math.abs(p.x) < 28 && p.z > -39 && p.z < 50 &&
      (Math.abs(want.x) < 23 || want.z < -39)) {
    q.x = Math.sign(p.x) * 27.5;
    q.z = Math.abs(p.x) < 27 ? p.z : -41;
    return q;
  }
  // 東の堀外へ出る時は、城内の行き先と取り違えず北の門まで戻る。
  // 先に元の行き先で虎口を判定すると、門の内外を往復して堀外へ出られない。
  if (want.x > 40) {
    if (p.x >= 42) return want;
    if (p.z > 6 && Math.abs(p.x) < 25) { q.x = 0; q.z = p.z > 8 && Math.abs(p.x) > 2.5 ? 14 : 3; }
    else if (p.z > -28.5 && Math.abs(p.x) < 25) { q.x = 2; q.z = -30.5; }
    else { q.x = p.z > -39 ? 0 : 47; q.z = -44; }
    return q;
  }
  // 西の堀外からも、東と同じく北を回って木戸へ戻る。
  // 西だけ経路が無いと、二の丸・本丸の塀へ直進して止まる。
  if (Math.abs(want.x) < 23 && Math.abs(p.x) >= 28) {
    q.x = p.z > -39 ? Math.sign(p.x) * 47 : 0; q.z = -44; return q;
  }
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
  // 門を越えても、内側の食い違い（z=-26）の右端を抜けるまでは案内する。
  // 門の直後で案内を切ると、左寄りの持ち場へ向かう兵がこの塀に突き当たる。
  if (want.z > -25 && p.z >= -31 && p.z < -25 && Math.abs(p.x) < 23 && (p.z < -26 || p.x >= 1)) {
    q.x = 2.5; q.z = p.x < 1 ? -28 : -24; return q;
  }
  if (want.z < -33 && p.z > -31 && p.z < -4) { if (p.z > -28.5) { q.x = 2; q.z = -30.5; } else if (Math.abs(p.x) > 2.5) { q.x = 0; q.z = -29; } else { q.x = 0; q.z = -38; } return q; }
  // 二の丸の南口から堀へ。左右の小屋や塀へ直進せず、開いた中央を通す。
  if (want.z > -3 && p.z < -3 && p.z > -31) { q.x = 0; q.z = Math.abs(p.x) > 2.5 ? -7 : 0; return q; }
  if (want.z < -5 && p.z > -5 && p.z < 7) { q.x = 0; q.z = Math.abs(p.x) > 2.5 ? 0 : -8; return q; }
  // 本丸の門（焼け落ちた後）：塀の位置（z=8）までは門の口へ回す。
  // z=7で案内を切ると、押し合いでその先へ出た兵が塀へ直進して止まる。
  if (want.z > 9 && p.z < 8 && p.z > -4) { if (Math.abs(p.x) > 2.5) { q.x = 0; q.z = 3; } else { q.x = 0; q.z = 11; } return q; }
  return want;
}
// 11/18 夜50-37（renraku 1622 の見つけ）：夕の日は西の低い所（-120,17,-24）から差すので、東向き・南向きの塀の面は
//   逆光で、暗い板の色と木の絵が掛け合わさり模様の見えない真っ黒な面になった（150秒 外の木柵の内で画面の右上四分の一）。
//   日の当たらない面の頂点の色だけ、空の照り返しの分を持ち上げる（日の当たる面・形・数は今のまま）
const SUN = new THREE.Vector3(-120, 17, -24).normalize();
function liftShade(mesh) {
  const g = mesh && mesh.geometry, c = g && g.attributes.color, nr = g && g.attributes.normal;
  if (!c || !nr) return;
  for (let k = 0; k < c.count; k++) {
    const d = nr.getX(k) * SUN.x + nr.getY(k) * SUN.y + nr.getZ(k) * SUN.z;
    if (d >= .35) continue;   // 北向きの面も日が浅く掠るだけなので少し
    const m = 1 + .75 * Math.min(1, (.35 - d) / .6);
    c.setXYZ(k, Math.min(1, c.getX(k) * m), Math.min(1, c.getY(k) * m), Math.min(1, c.getZ(k) * m));
  }
  c.needsUpdate = true;
}
function fence(rt, seg, h = 2.4) {
  const fm = castleBoardFence(rt.world, seg, { h });
  liftShade(fm);
  rt.scene.add(fm);
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
  // 11/19 クラウド35（K365 城の見た目）：東の二重堀・西の堀・北の堀・本丸の前の堀（senHeight で掘ってある）が、草と同じ色で上からも寄せ口からも溝と読めなかった。
  //   堀の底に沿って湿った黒土の帯を一つの形で敷く（貝塚市の発掘解説の二重堀・土橋。当たりは無し・描く回数は一つ）
  {
    const pos = [], col = [], dirt = new THREE.Color(0x4a3b2a), wet = new THREE.Color(0x2f2619);
    const strip = (ax, az, bx, bz, w) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 2)), nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
        const t0 = i / n, t1 = (i + 1) / n, s0 = (j / 4 - 0.5) * w, s1 = ((j + 1) / 4 - 0.5) * w;
        const P = (t, sd) => { const x = ax + (bx - ax) * t + nx * sd, z = az + (bz - az) * t + nz * sd; return [x, Math.max(W.heightAt(x, z), drawGroundAt(W, x, z)) + 0.08, z]; };
        const q = [P(t0, s0), P(t1, s0), P(t1, s1), P(t0, s1)];
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...q[k]); const c = Math.abs((k === 1 || k === 2 ? s1 : s0)) < w * 0.2 ? wet : dirt; col.push(c.r, c.g, c.b); }
      }
    };
    strip(30, -27, 30, 50, 3.6); strip(39, -27, 39, 50, 3.6); strip(-30, -27, -30, 50, 3.6);
    strip(-28, -32, -4, -32, 3.2); strip(4, -32, 28, -32, 3.2); strip(-25, 2, -5, 2, 3.6); strip(5, 2, 25, 2, 3.6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    // 帯の面の向きが下を向いていたので、両面で描く（片面だと裏から見て消えていた）
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true; m.name = '堀の底の土'; rt.scene.add(m);
  }
  // 秀吉の本陣（床几・陣幕）。通り過ぎる時に「巨大な本陣」を見せる
  rt.scene.add(jinmaku(W, P.camp.x, P.camp.z, 16, 12, 6, { mon: 'toyotomi' }));
  rt.scene.add(shogi(W, P.camp.x, P.camp.z + 1));
  for (const [x, z] of [[-30, -126], [-6, -126], [-30, -110], [-6, -110], [8, -132], [-40, -118]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  const camp = troops(rt, true, '秀吉の本陣', { x: P.camp.x, z: P.camp.z + 1 }, [{ type: 'ashigaru', n: 10 }, { type: 'busho', n: 1, o: { name: '羽柴秀吉' } }], HASHIBA, { width: 13 });   // 11/18 クラウド：幅8では後から加わる者と陣幕の中で重なった（act bot 19人・21組）
  camp.stay = true; camp.aggro = 0; camp.seekRange = 0;
  for (const u of camp.units) if (u.name === '羽柴秀吉') { u.invuln = true; u.noTarget = true; u.jinchu = { standing: false, t: 0, soldiers: [] }; }
  // 二の丸の囲み（北に虎口）。外の木柵（土橋の左右）と木戸
  for (const seg of [[-23, -32, -4, -32], [4, -32, 23, -32], [-23, -32, -23, -4], [23, -32, 23, -4], [-23, -4, -4, -4], [4, -4, 23, -4]]) fence(rt, seg);
  rt.scene.add(kabukimon(W, 0, -32, 8));
  fence(rt, [-7, -26, -1, -26]);   // 虎口の内の食い違い
  F.outer = [fence(rt, [-26, -37, -4, -37], 1.8), fence(rt, [4, -37, 26, -37], 1.8)];
  F.kido = door(rt, 0, -37.2, 8, '土橋の木戸', 2.2);
  F.gate = door(rt, 0, -32.4, 8, '虎口の門', 3.1);
  // 台詞にある先手の竹束と、木柵で担ぎ手を守る弾除けを実際に据える。
  // 中央には二歩ほどの通り道を残し、丸太の組が木戸へ寄せられるようにする。
  for (const z of [P.rally.z + 2, -48.5, -44.5]) {
    for (const x of [-2, 2]) addTaba(rt, x, z, 0, { fixed: true, rot: 0 });
  }
  patchGunCover(rt);
  // 本丸の囲み（北の塀に焼けて崩れる門）
  for (const seg of [[-23, 8, -4, 8], [4, 8, 23, 8], [-23, 8, -23, 48], [23, 8, 23, 48], [-23, 48, 23, 48]]) fence(rt, seg);
  F.honGate = door(rt, 0, 7.8, 8, '本丸の門', 2.8);
  // 門は丸太で打つ。兵用の受け流し処理へ渡すと、門に無い位置を読んで戦が止まる。
  // 担ぎ手の狙いは残す（丸太の作業判定に必要）が、通常の近接攻撃は始めない。
  const beforeMelee = rt.army.hooks.beforeMelee;
  rt.army.hooks.beforeMelee = (u, target) => {
    if (target === F.kido || target === F.gate || target === F.honGate) return false;
    return !beforeMelee || beforeMelee(u, target);
  };
  // 二の丸の小屋（火矢で燃える）・本丸の小屋と煙硝蔵
  F.niHuts = [[-13, -19, 8, 6], [13, -21, 7, 5], [-14, -10, 6, 5]].map(([x, z, w, d]) => { const m = hut(W, x, z, w, d); rt.scene.add(m); return { x, z, w, d, m }; });
  F.store = hut(W, P.store.x, P.store.z, 8, 6); rt.scene.add(F.store);
  const h2 = hut(W, -10, 30, 9, 6); rt.scene.add(h2);
  burnSpot(W, -10, 30, 9, 6, h2, '本丸の小屋');
  // 11/18 クラウド ⑥90秒の写真：竹束から見た二の丸の塀の上に根来の印が一本も無く、守る城に見えない → 塀の内の北に幟を四本足す
  for (const [x, z] of [[-18, -28], [18, -28], [-11, -29], [-5, -29], [5, -29], [11, -29], [-18, 12], [18, 44], [6, 14]]) rt.scene.add(nobori(W, x, z, 'maru', 5));
  // 自分の先手（羽柴秀次）
  F.friends = troops(rt, true, '羽柴秀次の先手', { x: 4, z: -80 }, [{ type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }, { type: 'busho', n: 1, o: { name: '羽柴秀次', horse: true } }], HASHIBA);
  F.friends.stay = true;
  // 11/18 iMac n-kwatch の検品：245秒（虎口の門前）に「羽柴秀次　討死」の札が出た。秀次は千石堀で討たれていない（後に関白）。死なせない
  for (const u of F.friends.units) if (u.name === '羽柴秀次') { u.invuln = true; }
  addSite(rt, 'castle', 0, 28, '千石堀城本丸');
  addSite(rt, 'fort', 0, -19, '二の丸');
  addSite(rt, 'fort', 0, -40, '北の土橋');
}
