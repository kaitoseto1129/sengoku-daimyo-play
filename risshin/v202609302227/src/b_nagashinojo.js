// 長篠編 一戦目　長篠城籠城（天正三年五月十四日〜十六日）
// 寒狭川と宇連川の合わさる崖の上の城。北の大手から武田の大軍が寄せ、奥平信昌の五百が塀の内で守る。
// 流れ：①大手門と北の塀への寄せ ②兵糧蔵に火矢 ③夕暮れ、鳥居強右衛門を川まで送り出す ④二日後、強右衛門の知らせ ⑤最後の寄せを後詰の旗まで凌ぐ
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { distToPolyline, nearHideRequest } from './world.js';
import { stumps, nobori, hut, yagura, kabukimon, tawara, jinCamp, village, tobiraLeaf } from './props.js';
import { woodTex } from './nature.js';
import { flagTexture } from './textures.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, samaTs } from './bhelp.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { camp } from './b_mid.js';

// ---------------- 大軍の見せ方（どの戦でも使う小さな道具。battles.js からは nagashinojo.kit で使う） ----------------
// 家ごとの具足の色（遠くの軍勢と控えで同じ色にそろえる）
export const ARMOR = { oda: 0x2b3140, tokugawa: 0x24221f, takeda: 0x3a2622, akazonae: 0x8e1f16, imagawa: 0x3f2a24, saito: 0x33302a, west: 0x2c2a2a };
// 遠くの軍勢を一つ置く。kind は 'mixed'|'spear'|'gun'|'bow'|'cavalry'|'honjin'
export function farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind = 'mixed') {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, seed, kind });
}
// 戦う隊 g の後ろに、同じ旗の控えを付けて歩かせる。g が崩れるか尽きたら控えも崩れる
// o：{ flag, armor, kind, w, depth, count, gap, seed, stop }（stop() が真の間は、その場で止まって待つ。城の中へは付いて入らない等）
export function backOf(rt, g, o = {}) {
  const c = g.center(), depth = o.depth || 10, gap = o.gap ?? 5;
  const f0 = o.facing ?? g.facing, back = gap + depth / 2 + 3;
  const b = rt.world.addBacking({ x: c.x, z: c.z, facing: f0, flag: o.flag, armor: o.armor, kind: o.kind || 'spear', w: o.w || 16, depth, count: o.count, gap: gap + 3, seed: o.seed });
  // 控えの向きは寄せてくる向き（初めの向き）のままにする：前の隊が振り向くたびに、控えが隊の中を突っ切って反対側へ回らないように。
  // 間も 3m 広く取る（前の隊が立て直しで下がっても、控えの中へ入り込まないように）
  b.follow(() => (g.count && !g.routed && !(o.stop && o.stop()) ? { ...g.center(), facing: f0 } : null), { gap: back });
  b.army.team = g.team;   // 控えは前の隊と同じ側
  (rt.flags.backs = rt.flags.backs || []).push({ b, g });
  return b;
}
// 毎こま呼ぶ：崩れた隊の控えを崩し、プレイヤーに近い軽い大軍を消す。近づいた敵の軽い兵は本物の兵に替える
export function backTick(rt) {
  if (rt._backTickT === rt.t) return;   // 一コマに一度（戦の定義と taisho.js の両方から呼ばれても二度回さない）
  rt._backTickT = rt.t;
  for (const q of rt.flags.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
  nearHide(rt);
  wake(rt);
}

// ---------------- 軽い兵を本物の兵に替える（本陣や大軍を素通りさせない） ----------------
// ・プレイヤーが敵の軽い大軍（farHost・backOf）の 58m ほどまで寄ると、近い所の十数人をその場で本物の兵に替える。
//   さらに奥へ進めば、次の十数人を替える（一つの隊で本陣は 40 人、ほかは 24 人まで）。戦う隊の後ろの控えは、中へ踏み込んだ時だけ 6 人ずつ（12 人まで）
// ・陣の者（honjin の人）は、敵（プレイヤーでも兵でも）が 30m に入ると、立ち上がって武器を取る
// 替えた隊は g.guard（守る隊。ai.js：寄る敵へ向き直って迎え撃ち、離れたら持ち場へ戻る）。
// 元の軽い隊が退けば一緒に下がり、崩れれば一緒に崩れる（戦の定義の「退き陣」などはそのまま）
// 戦の側から使える印：army.team（0 味方・1 敵。決めなければ家紋で決める）・army.lord = '武田勝頼'（本陣から大将を出す。討たれない）・army.noWake = true（替えない）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe']);
const MON_FAC = { takeda: 'takeda', furin: 'takeda', akazonae: 'akazonae', imagawa: 'imagawa', saito: 'saito', oda: 'oda', eiraku: 'oda', tokugawa: 'tokugawa', onri: 'tokugawa', okubo: 'tokugawa', okudaira: 'tokugawa', katabami: 'tokugawa' };
const WAKE_TYPE = ['ashigaru', 'gun', 'bow', 'samurai', 'ashigaru', 'cavalry', 'samurai'];
const WAKE_ROOM = 235;   // 戦う兵がこの数を超えていれば、もう替えない（重さ）
const WAKE_R = 18;       // 本人からこの内の軽い兵は、みな本物の兵に替える（カメラの近くの見せない輪 14m より少し広く。外の軽い兵は人の形のまま残し、大軍の数を減らさない）
function sideOf(rt, A) {
  if (A.team !== undefined) return A.team;
  const me = rt.player.u.team, S = rt.def.sides || {};
  A.team = S.b && A.mon === S.b.mon ? 1 - me : S.a && A.mon === S.a.mon ? me : ENEMY_MON.has(A.mon) ? 1 - me : me;
  return A.team;
}
function wake(rt) {
  const F = rt.flags, P = rt.player && rt.player.u;
  // 籠城の戦（def.noWake）では替えない：塀の内から見える寄せ手の大軍が、次々に本物の兵になって塀へ来ないように
  if (rt.def && rt.def.noWake) return;
  if (!P || !P.alive || rt.over || !(rt.t >= (F.wakeAt || 0))) return;
  F.wakeAt = rt.t + 0.3;
  let alive = 0, starved = false;
  for (const u of rt.army.units) if (u.alive) alive++;
  for (const A of rt.world.armies || []) {
    if (!A.mesh.take) continue;
    const W = A.wk || (A.wk = { at: [], groups: [], last: null });
    // 元の軽い隊が動いた分だけ、替えた隊の持ち場もずらす。崩れたら一緒に崩れる
    const cx = A.mesh.position.x + (A.people ? 0 : A.cx) + A.off.x, cz = A.mesh.position.z + (A.people ? 0 : A.cz) + A.off.z;
    if (W.groups.length) {
      const dx = W.last ? cx - W.last.x : 0, dz = W.last ? cz - W.last.z : 0;
      for (const g of W.groups) {
        if (!g.count || g.routed) continue;
        if (A.rout) { g.noRout = false; g.morale = 0; continue; }
        if ((Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) && (g.order === 'hold' || g.order === 'yari')) g.anchor = { x: g.anchor.x + dx, z: g.anchor.z + dz };
      }
    }
    W.last = { x: cx, z: cz };
    if (A.rout || A.noWake || !A.mesh.visible || !A.mesh.parent) continue;
    const team = sideOf(rt, A);
    let who = null;
    if (A.people) {
      // 陣の者：敵が 30m に入った（プレイヤーでも兵でも）
      if (A.took >= A.n) continue;
      who = rt.army.nearestEnemy({ pos: { x: A.cx + A.off.x, z: A.cz + A.off.z }, team }, 30, (o) => !o.fleeing);
    } else {
      // 敵でも味方でも、自分が隊の四角の 40m（本陣は 58m・後ろの控えは 24m）に入れば、近い所から本物の兵に替える
      if (!A._ext) A._ext = extentOf(A);
      const dx = P.pos.x - cx, dz = P.pos.z - cz, cf = Math.cos(A.facing), sf = Math.sin(A.facing);
      const lx = Math.abs(dx * cf - dz * sf) - A._ext.hw, lz = Math.abs(dx * sf + dz * cf) - A._ext.hd;
      const edge = Math.hypot(Math.max(0, lx), Math.max(0, lz));
      if (edge < (A.followFn ? 24 : A.kind === 'honjin' ? 58 : 40)) who = P;
      // 後詰め（隊の後ろの厚い層。軽い兵の本体より奥）の中に踏み込んだか：そこは本体の兵が取れないので hostFill で埋める
      const bz = dx * sf + dz * cf;
      if (A.hostD && !A.rout && Math.abs(dx * cf - dz * sf) < A._ext.hw * 1.2 + 4 && bz < -A._ext.hd + 4 && bz > -A._ext.hd - A.hostD - 6) { who = P; hostFill(rt, A, team, P, alive); }
    }
    if (!who) continue;
    // 替える所：本人から WAKE_R m の内に残っている軽い兵を、近い者から（毎 0.3 秒、一つの隊で十数人ずつ。内に残る者が尽きるまで続ける）
    // 自分のまわり 25m に本物の敵がもう二十人（初めの戦は十二人）いれば、それ以上は替えない（内の軽い兵は見せない輪で隠す。囲まれて押し潰されないように）
    let crowded = false;
    if (!A.people && who === P) { let near = 0; rt.army.forNear(P.pos.x, P.pos.z, 25, (o) => { if (o.alive && o.team !== P.team && !o.fleeing) near++; }); crowded = near >= (rt.firstFights ? 12 : 20); }
    // 戦の定義が wakeAllyNear・wakeFoeNear を持てば、自分の持ち場では味方を控えめに・敵を多めに替える（既定 1＝これまでどおり）
    const wakeBias = team === P.team ? (rt.def.wakeAllyNear ?? 1) : (rt.def.wakeFoeNear ?? 1);
    const want = A.people ? A.n - A.took : crowded ? 0 : Math.round(16 * wakeBias);
    // 枠が足りなければ、プレイヤーから遠い「戻せる」本物の兵（wake で替えた兵）を大軍の中へ帰して空ける（WAKE_ROOM は守る）
    if (WAKE_ROOM - alive < want) alive -= recycle(rt, want - (WAKE_ROOM - alive), P);
    const n = Math.min(want, WAKE_ROOM - alive);
    const pts = [];
    if (n >= 1) {
      // 本陣の大将：床几の者を大将にする（一度だけ）
      if (A.lord && !W.lord) { const q = A.mesh.take(who.pos.x, who.pos.z, 1, 1e9, (k) => k === 6); if (q.length) { q[0].lord = true; pts.push(q[0]); W.lord = true; } }
      pts.push(...A.mesh.take(who.pos.x, who.pos.z, n - pts.length, A.people ? 90 : WAKE_R));
    } else if (!A.people) {
      // 枠が尽きた：内に軽い兵が残っていれば、見せない輪を広げる（近くで軽い兵が動いて見えないように）
      if (!A.mesh.left || A.mesh.left(who.pos.x, who.pos.z, WAKE_R) > 0) starved = true;
    }
    if (!pts.length) continue;
    const g = wakeGroup(rt, A, team, pts, who);
    // 味方の替えた兵は、持ち場で待たずに本人のまわりの敵へ打って出る
    if (team === P.team && !A.people) { g.order = 'attack'; g.seekRange = 40; g.aggro = 14; g.guard = false; }
    alive += g.count;
    W.groups.push(g); W.at.push({ x: who.pos.x, z: who.pos.z });
  }
  // 枠が尽きて替えきれない時だけ、軽い兵を見せない輪を本人のまわりの替える所ほどに広げる（替えが進めば元へ）
  nearHideRequest('wake', starved ? WAKE_R + 6 : 0);
}
// 後詰めの中へ踏み込んだ時：後詰めの軽い兵は本人の 24m 内で見せないので、そこに本物の兵を立てて「大軍の中にいる」ようにする
//   本人のまわり 16m に同じ側の本物が 12 人より少なければ、6〜18m の後詰めの中へ 12 人ずつ（一つの隊で 40 人まで・枠 WAKE_ROOM を守る）
//   立てた兵は戻せる隊（遠くなれば静かに外す）
function hostFill(rt, A, team, P, alive) {
  const W = A.wk; if (!W) return;
  if ((W.hostT || 0) > rt.t || (W.hostN || 0) >= 40) return;
  W.hostT = rt.t + 1.2;
  let near = 0; rt.army.forNear(P.pos.x, P.pos.z, 16, (u) => { if (u.alive && u.team === team && !u.isPlayer && u !== P) near++; });
  if (near >= 12) return;
  let n = Math.min(12, 40 - (W.hostN || 0), WAKE_ROOM - alive);
  if (n < 12 && WAKE_ROOM - alive < 12) n = Math.min(12, n + recycle(rt, 12 - n, P));
  if (n < 3) return;
  const cx = A.mesh.position.x + A.cx + A.off.x, cz = A.mesh.position.z + A.cz + A.off.z, cf = Math.cos(A.facing), sf = Math.sin(A.facing);
  const hw = A._ext.hw, hd = A._ext.hd, pts = [];
  for (let k = 0; k < n * 4 && pts.length < n; k++) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 12;
    const x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    const dx = x - cx, dz = z - cz, lx = dx * cf - dz * sf, lz = dx * sf + dz * cf;
    if (Math.abs(lx) > hw * 1.15 || lz > -hd + 1 || lz < -hd - A.hostD || Math.abs(x) > 172 || Math.abs(z) > 172) continue;
    pts.push({ x, z, k: Math.random() < 0.8 ? 0 : 3 });
  }
  if (pts.length < 3) return;
  const g = wakeGroup(rt, A, team, pts, P);
  g.name = '後詰の兵'; g.defRecycle = true;
  g.units.forEach((u) => { u.wkFrom = null; });
  W.hostN = (W.hostN || 0) + g.count;
  W.groups.push(g);
}
// 遠い戻せる兵を n 人まで大軍へ帰す（戦っていない・名のない・カメラから遠い者から）。帰した数を返す
// 戦の定義から：任務に数えていない隊（柵の内の後ろの控え・遠い控え・通り過ぎた隊）は markRecyclable(g) で戻せる隊にする
export function markRecyclable(...gs) { for (const g of gs) if (g) { g.recyclable = true; g.defRecycle = true; } }
function recycle(rt, n, P) {
  const cam = rt.camera && rt.camera.position;
  const cand = [];
  for (const g of rt.army.groups) {
    if (!g.recyclable) continue;
    for (const u of g.units) {
      // （戦の定義が g.recyclable を付けた隊の兵は wkFrom が無い：大軍へは帰さず、遠くで静かに外す）
      if (!u.alive || u.gone || (!u.wkFrom && !g.defRecycle) || u.name || u.invuln || u.isPlayer || u.isSub || u.target || u.atk || u.fleeing) continue;
      const A = u.wkFrom && u.wkFrom.A;
      if (A && (A.rout || !A.mesh.visible || !A.mesh.parent)) continue;
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z), dc = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : d;
      if (d < 55 || dc < 50) continue;
      cand.push({ u, d });
    }
  }
  cand.sort((a, b) => b.d - a.d);
  let k = 0;
  for (const { u } of cand) {
    if (k >= n) break;
    if (u.wkFrom && (!u.wkFrom.A.mesh.give || !u.wkFrom.A.mesh.give(u.wkFrom.i))) continue;
    rt.army.despawn(u);
    k++;
  }
  return k;
}
function wakeGroup(rt, A, team, pts, who) {
  let x = 0, z = 0;
  for (const p of pts) { x += p.x; z += p.z; }
  x /= pts.length; z /= pts.length;
  // 家：家紋から。分からなければ、同じ側の一番近い隊の家
  let fac = MON_FAC[A.mon], bd = Infinity;
  if (!fac) for (const g of rt.army.groups) { if (g.team !== team || !g.count || g.isPlayerSquad) continue; const c = g.anchor, d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; fac = g.faction; } }
  fac = fac || (team === 0 ? 'tokugawa' : 'saito');
  const face = Math.atan2(who.pos.x - x, who.pos.z - z);
  const name = A.people ? '陣の者' : A.kind === 'honjin' ? '本陣の旗本' : '備の兵';
  const g = rt.army.addGroup({
    team, faction: fac, name, order: 'hold', formation: 'line', anchor: { x, z }, facing: face, width: Math.max(4, Math.min(16, pts.length * 1.1)),
    aggro: 12, seekRange: 30, morale: 85, speed: 2.6, fleeDir: { x: -Math.sin(face), z: -Math.cos(face) },
  });
  let lead = null;
  const list = pts.map((p, i) => {
    let type = WAKE_TYPE[p.k] || 'ashigaru';
    // 戦場の端（176m）より外の者は、端の内側に立たせる（出たあとで端へ引き戻されて、一息に飛んで見えないように）
    const o = { x: Math.max(-172, Math.min(172, p.x)), z: Math.max(-172, Math.min(172, p.z)), heading: face, armor: A.armor };
    if (A.mon && ENEMY_MON.has(A.mon) || MON_FAC[A.mon]) o.flag = A.mon;
    if (p.lord) { type = 'busho'; o.name = A.lord; o.invuln = true; delete o.armor; }
    else if (p.k === 6 && A.people && !lead) type = 'samurai';
    return { type, n: 1, o };
  });
  rt.army.spawn(g, list);
  // 戻せる隊：戦の定義が数えていない（wake で替えただけの）兵。遠くなれば大軍の中へ帰して、枠を近くへ回す
  g.recyclable = true;
  g.units.forEach((u, j) => { if (pts[j] && !pts[j].lord) u.wkFrom = { A, i: pts[j].i }; });
  lead = g.units.find((u) => u.type === 'busho') || g.units.find((u) => u.type === 'samurai');
  if (lead) g.leader = lead;
  g.guard = true;
  g.woke = A;
  rt.army.play('eshout', { x, z }, 1.4);
  if (who === rt.player.u && team !== who.team && !A.wk.said) {
    A.wk.said = true;
    rt.bark(A.people ? '陣の者が武器を取った！' : A.kind === 'honjin' ? '本陣の旗本が気づいた！　迎え撃ってくるぞ' : '敵の備が気づいた！　向き直ってくるぞ', true);
  }
  return g;
}
// 軽い作りの兵は近くで見ると箱のように見えるので、前はプレイヤーから 60m ほどより近い隊を丸ごと描かなかった
// → 目の前の大軍が消えて空になるので、今は隊を消さない。カメラの近く（world.js の ARMY_NEAR）の軽い兵は輪の外へ押し出し、内は wake で本物の兵に替える
// （隊の四角の縁までの近さで測る。負の数で、消さない）
const NEAR_IN = -1, NEAR_OUT = -1;
function extentOf(A) {
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), cf = Math.cos(A.facing), sf = Math.sin(A.facing);
  let hw = 1, hd = 1;
  const x0 = A.mesh.position.x, z0 = A.mesh.position.z;
  for (let i = 0; i < A.n; i++) {
    A.body.getMatrixAt(i, m4); v.setFromMatrixPosition(m4);
    const dx = v.x + x0 - (x0 + A.cx), dz = v.z + z0 - (z0 + A.cz);
    hw = Math.max(hw, Math.abs(dx * cf - dz * sf)); hd = Math.max(hd, Math.abs(dx * sf + dz * cf));
  }
  return { hw, hd };
}
function nearHide(rt) {
  const p = rt.player && rt.player.u && rt.player.u.pos;
  if (!p) return;
  for (const A of rt.world.armies || []) {
    if (A.n <= 30) continue;
    if (!A._ext) {
      A._ext = extentOf(A);
      // 近い間は、兵・旗・馬の数を 0 にして描かない（隊の見え隠れは戦の側の visible に任せたまま）
      for (const c of A.mesh.children) if (c.isInstancedMesh) { const f = c.onBeforeRender; c.onBeforeRender = (...a) => { f.apply(c, a); if (A._near) c.count = 0; }; }
    }
    const cx = A.mesh.position.x + A.cx + A.off.x, cz = A.mesh.position.z + A.cz + A.off.z;
    const dx = p.x - cx, dz = p.z - cz, cf = Math.cos(A.facing), sf = Math.sin(A.facing);
    const lx = Math.abs(dx * cf - dz * sf) - A._ext.hw, lz = Math.abs(dx * sf + dz * cf) - A._ext.hd;
    const d = Math.hypot(Math.max(0, lx), Math.max(0, lz));
    A._near = A._near ? d < NEAR_OUT : d < NEAR_IN;
  }
}
// 本陣一式（陣幕・床几の大将と諸将・馬印・旗本）を置く
export function honjin(rt, x, z, o = {}) {
  const c = jinCamp(rt.world, x, z, o);
  rt.scene.add(c);
  // 大将の床几の左奥に、櫃に据えた飾りの具足（本物の3Dスキャン。読み終わってから置く。描かない時は置かない）
  if (o.yoroi !== false && typeof window !== 'undefined' && !(window.__norender === true || /[?&]norender/.test(location.search))) {
    const d = o.d || 12, w = o.w || 16, yx = x - Math.min(3.4, w / 2 - 1.2), yz = z - d / 2 + 1.3;
    import('./humans.js').then((H) => H.displayYoroi()).then((g) => {
      if (!g || !c.parent) return;
      g.position.set(yx, rt.world.heightAt(yx, yz), yz); g.rotation.y = 0.25;
      c.add(g);
    }).catch(() => {});
  }
  return c;
}
// 遠景の村
export function farVillage(rt, x, z, o = {}) {
  const v = village(rt.world, x, z, o);
  rt.scene.add(v);
  return v;
}
// 倒れた者の所へ、戦の後に烏が降りる（数が多いので二人に一人だけ知らせる）
export function carrion(rt, v) {
  rt.flags.carrionN = (rt.flags.carrionN || 0) + 1;
  if (v && v.pos && rt.flags.carrionN % 2) rt.world.addCarrion(v.pos.x, v.pos.z);
}
// 戦の定義から：本陣を置く前などに、戻せる隊（markRecyclable）を先に n 人まで軽い兵へ戻し、本物の兵の枠を空ける（帰した数を返す）
export function freeRoom(rt, n, near) { return n > 0 ? recycle(rt, n, near || rt.player.u) : 0; }
export const KIT = { ARMOR, farHost, backOf, backTick, honjin, farVillage, carrion, markRecyclable, freeRoom };
// 一斉射（kaito 0929）：味方の鉄砲の組に「引きつけよ」で撃つのを待たせ、wait 秒の後に「放て」で揃えて撃たせる。
// 撃った後、鉄砲の組から r の内にいる敵の隊は気勢（morale）が hit 下がる。C（clash）があれば軽い大軍も一斉に撃つ。
export function volley(rt, guns, o = {}) {
  const live = () => (guns || []).filter((g) => g && g.count > 0 && !g.routed);
  if (!live().length) return false;
  const who = o.who || '鉄砲頭';
  for (const g of live()) g.holdFire = true;
  if (o.waitLine !== '') rt.say(who, o.waitLine || 'まだじゃ……まだ撃つな。引きつけよ', 2.2);
  rt.after(o.wait ?? 2.4, () => {
    const gs = live();
    for (const g of gs) { g.holdFire = false; g.fire = true; }
    if (o.banner) rt.banner(o.banner[0], o.banner[1] || '');
    rt.say(who, o.line || '放てぇっ！', 1.8);
    if (gs[0]) rt.army.play('gun', gs[0].center(), 1.3);
    if (o.C) o.C.volley(o.side || 'A');
    rt.after(1.2, () => {
      const cs = gs.filter((g) => g.count > 0).map((g) => g.center());
      for (const e of rt.army.groups) {
        if (e.team === 0 || e.routed || !(e.count > 0)) continue;
        const c = e.center();
        if (!cs.some((q) => Math.hypot(c.x - q.x, c.z - q.z) < (o.r ?? 55))) continue;
        e.morale = Math.max(o.floor ?? 6, (e.morale ?? 60) - (o.hit ?? 24));
      }
      if (o.done) o.done(rt, gs);
    });
  });
  return true;
}

// ---------------- 城の形 ----------------
// 北が -z。城は台地の上（高さ 14）。南と西は崖で、その下を川が流れる
const N_Z = -24, S_Z = 40, W_X = -38, E_X = 32;   // 外の塀（二の丸と本丸をまとめて囲む）
const IN_Z = 10;                                   // 二の丸（北）と本丸（南）の境の塀
const GATE = { x: -3, z: N_Z };                    // 大手門（幅6）
const GATE_HITTERS = 6;                            // 一度に大手門を打てる寄せ手の数
const GATE2 = { x: -5, z: IN_Z };                  // 本丸の門（戸はない）
const KARA = { x: 21, z: S_Z };                    // 搦手の口
const HALL = { x: -14, z: 27 };                    // 本丸の館
const KURA = { x: 18, z: -5 };                     // 兵糧蔵
const MID = { x: -3, z: 8 };
const TOP = 14;                                    // 台地の高さ
// 川：寒狭川（西を北から南へ）・宇連川（南を東から西へ）。城の南西で合わさって豊川になる
const KANSA = [[-72, -180], [-63, -110], [-57, -40], [-56, 20], [-58, 62]];
const URE = [[180, 80], [110, 73], [60, 66], [0, 64], [-58, 62]];
const TOYO = [[-58, 62], [-78, 105], [-92, 180]];
// 大手道と、搦手から崖を下りて川べりへ出る細道（強右衛門の道）
const OTE = [[-3, -24], [-4, -52], [-8, -82], [-12, -125]];
const SUNE_PATH = [[21, 36], [21, 43], [33, 44], [41, 47], [48, 51], [55, 55], [58, 58.5]];

const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const plateau = (x, z) => sm(52, 47, z) * sm(-47, -42, x) * sm(-76, -36, z) * sm(74, 40, x);
function baseH(x, z) {
  let h = 0.9 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.026) + 0.5 * Math.sin(z * 0.07 + x * 0.02);
  // 北の医王寺山（勝頼の陣）・北東の丘・東の台・対岸の鳶ヶ巣山・西の山
  h += 16 * gauss(x, z, -30, -155, 2600) + 11 * gauss(x, z, 95, -120, 2400) + 9 * gauss(x, z, 150, -10, 3000);
  h += 22 * gauss(x, z, 35, 150, 3400) + 14 * gauss(x, z, -130, 140, 3000) + 17 * gauss(x, z, -140, -40, 3200);
  return h;
}
const heightFn = (x, z) => { const p = plateau(x, z); return TOP * p + baseH(x, z) * (1 - p * 0.85); };
const insideCastle = (x, z, m = 0) => x > W_X - m && x < E_X + m && z > N_Z - m && z < S_Z + m;
// 寄せ手の控えは塀から離れた所で待つ（塀の内の者から 60m ほど離して置く）
const inCastle = (g) => () => { const c = g.center(); return insideCastle(c.x, c.z, 45); };

// ---------------- 小道具（この戦だけで使う形） ----------------
const WOOD = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), roughness: 0.9, metalness: 0 });
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mesh(parts) {
  const m = new THREE.Mesh(mergeGeometries(parts), WOOD);
  m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true;
  return m;
}
// 板塀：板を張った塀に、柱・押縁・狭間（鉄砲や弓を出す穴）と、板葺きの小さな屋根
function hei(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const y = Math.min(world.heightAt(ax, az), world.heightAt(bx, bz), world.heightAt(mx, mz));
  const H = 1.9, parts = [];   // 胸ほどの高さ：塀越しに寄せ手の大軍が見える
  const box = (w, h, d, x, yy, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, yy, z); parts.push(paint(g, hex)); return g; };
  box(0.16, H + 0.5, len + 0.04, 0, (H + 0.5) / 2 - 0.5, 0, 0x6a5540);
  for (const hy of [0.45, H - 0.35]) box(0.22, 0.09, len, 0, hy, 0, 0x4a3a2a);
  const posts = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) box(0.24, H + 0.2, 0.24, 0, (H + 0.2) / 2 - 0.2, -len / 2 + (i / posts) * len, 0x4e3c2a);
  // 狭間：城兵が立って撃つ所と同じ割り方（bhelp の samaTs）。鉄砲を構えた筒の高さ（1.3m ほど）に三角と四角を交互に
  samaTs(len, o.samaStep || 1.8).forEach((t, i) => {
    const z = -len / 2 + t * len;
    if (i % 2) box(0.2, 0.22, 0.24, 0, 1.28, z, 0x14110e);
    else { const g = new THREE.CylinderGeometry(0.16, 0.16, 0.2, 3); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); g.translate(0, 1.27, z); parts.push(paint(g, 0x14110e)); }
  });
  for (const sd of [1, -1]) { const g = new THREE.BoxGeometry(0.62, 0.06, len + 0.3); g.rotateZ(sd * 0.5); g.translate(sd * 0.24, H + 0.1, 0); parts.push(paint(g, 0x2f2a25)); }
  box(0.12, 0.1, len + 0.3, 0, H + 0.26, 0, 0x26211c);
  const m = mesh(parts);
  m.position.set(mx, y, mz);
  m.rotation.y = ang;
  return m;
}
// 大手門の扉（二枚。破られると内へ倒れる）
function gateDoors(world, x, z, w) {
  const grp = new THREE.Group();
  grp.userData.leaves = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sd * w / 4, 0, 0);
    pv.add(tobiraLeaf(w / 2 - 0.06, 3.1, sd));   // 板と乳金物・内の貫と筋交いの扉（props.js）
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  grp.position.set(x, world.heightAt(x, z), z);
  return grp;
}

// ---------------- 塀の破れ目と寄せ手の動き ----------------
// 塀の区画の外向き（城の中心から離れる向き）
function outward(s) {
  const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
  const dx = s.seg[2] - s.seg[0], dz = s.seg[3] - s.seg[1], L = Math.hypot(dx, dz) || 1;
  let nx = -dz / L, nz = dx / L;
  if (nx * (mx - MID.x) + nz * (mz - MID.z) < 0) { nx = -nx; nz = -nz; }
  return { mx, mz, nx, nz };
}
// side：'gate'（大手門）・'w'（北の塀の西）・'e'（北の塀の東）
function assaultFn(rt, side) {
  return (u) => {
    const F = rt.flags;
    const x = u.pos.x, z = u.pos.z;
    if (insideCastle(x, z, -0.4)) {
      // 本丸に入ったら館へ。二の丸なら本丸の門を抜ける
      if (z > IN_Z + 0.8) return F.hall.alive ? F.hall : null;
      if (Math.abs(x - GATE2.x) < 2.2 && z > IN_Z - 3) return { x: GATE2.x, z: IN_Z + 5 };
      return { x: GATE2.x, z: IN_Z - 2.5 };
    }
    // 破れ目（門を含む）があれば、そこから入る
    let gap = null, gd = 45;
    for (const s of F.north) {
      if (s.alive) continue;
      const o = outward(s);
      const d = Math.hypot(x - o.mx, z - o.mz);
      if (d < gd) { gd = d; gap = o; }
    }
    if (gap) {
      const out = (x - gap.mx) * gap.nx + (z - gap.mz) * gap.nz;
      const lat = Math.abs((x - gap.mx) * gap.nz - (z - gap.mz) * gap.nx);
      if (out < 3 && lat < 2) return { x: gap.mx - gap.nx * 6, z: gap.mz - gap.nz * 6 };
      return { x: gap.mx + gap.nx * 2.5, z: gap.mz + gap.nz * 2.5 };
    }
    if (side === 'gate' && F.gate.alive) {
      // 門の幅は6m。一度に門を打てるのは前の6人まで。前の者が倒れたら入れ替わる
      const hit = F.gateHit = (F.gateHit || []).filter((q) => q.alive && q.group && !q.group.routed);
      if (hit.includes(u)) return F.gate;
      const gd = Math.hypot(x - GATE.x, z - N_Z);
      if (gd > 12) return F.gate;
      if (hit.length < GATE_HITTERS) { hit.push(u); return F.gate; }
      // あぶれた者は門のすぐ脇の塀（大手の槍の組の前）を打つ。そこも尽きていれば門の前で控える
      const beside = F.north.filter((q) => q.alive && q !== F.gate && Math.abs((q.seg[0] + q.seg[2]) / 2 - GATE.x) < 9);
      if (beside.length) return beside[u.id % beside.length];
      const k = (u.id % 7) - 3;
      return { x: GATE.x + k * 1.3, z: N_Z - 5 - (u.id % 3) * 1.3 };
    }
    if (!u.segTarget || !u.segTarget.alive) {
      const cands = F.north.filter((s) => s.alive && s !== F.gate && (side === 'w' ? s.seg[0] < GATE.x : side === 'e' ? s.seg[0] > GATE.x : true));
      let best = null, bd = Infinity;
      for (const s of cands.length ? cands : F.north.filter((q) => q.alive)) {
        const o = outward(s);
        const d = Math.hypot(x - o.mx, z - o.mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      u.segTarget = best;
    }
    return u.segTarget;
  };
}

// 寄せ手の一隊
function takedaGroup(rt, side, o, list) {
  const F = rt.flags;
  // 最後の大きな寄せは数で押す分、一人一人の突きは少し弱める（最初の戦なので、初めての人が倒れすぎないように）
  const g = enemyGroup(rt, { faction: 'takeda', facing: 0, order: 'assault', fleeDir: { x: 0, z: -1 }, width: 10, aggro: 8, morale: 100, dmgMult: rt.phase === 'final' ? 0.45 : 1, ...o }, list);
  g.assault = assaultFn(rt, side);
  g.bornT = rt.t;
  F.enemies.push(g);
  return g;
}

// 破れた塀と門を繕う
function repairWalls(rt) {
  const F = rt.flags;
  let n = 0;
  for (const s of F.north) {
    if (s.alive) continue;
    s.alive = true; s.hp = s.maxHp; s.mesh.visible = true;
    if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
    if (s === F.gate) for (const lv of s.mesh.userData.leaves) { lv.rotation.x = 0; lv.position.y = 0; }
    n++;
  }
  return n;
}

const gone = (g) => !g || g.count === 0 || g.routed;

// ======================================================================
export const nagashinojo = {
  spawn: { x: -3, z: -13, heading: Math.PI },
  noWake: true,   // 籠城なので、遠くの寄せ手の軽い兵は本物に替えない（KIT の wake）
  tutorialHold: 30,   // 初めての手ほどきの間は、一の寄せを30秒まで遅らせてよい（battle.js）
  world: {
    // 退く武田兵は、北の原の大軍の列の手前で消す
    fleeOut: (x, z, team) => team === 1 && z < -104,
    seed: 75,
    muddy: 0.2,
    time: 'day',
    paths: [],
    height: heightFn,
    tint(x, z, h, c) {
      const n = Math.sin(x * 0.37) * Math.cos(z * 0.29) * 0.04;
      // 崖：急な所は岩肌
      const sl = Math.abs(heightFn(x + 1.5, z) - heightFn(x - 1.5, z)) + Math.abs(heightFn(x, z + 1.5) - heightFn(x, z - 1.5));
      if (sl > 2.2) { const k = Math.min(1, (sl - 2.2) / 2.5); c.lerp(new THREE.Color(0.35 + n, 0.32 + n, 0.28 + n), k); }
      // 城の中は踏み固められた土
      if (insideCastle(x, z, 1)) c.setRGB(0.40 + n, 0.35 + n, 0.26 + n);
      // 大手道と、崖の細道
      const pd = Math.min(distToPolyline(x, z, OTE) - 1.2, distToPolyline(x, z, SUNE_PATH) - 0.2);
      if (pd < 1.6) c.setRGB(0.39 + n, 0.33 + n, 0.23);
      // 川原：石まじりの砂
      const rd = Math.min(distToPolyline(x, z, KANSA), distToPolyline(x, z, URE), distToPolyline(x, z, TOYO));
      if (rd < 12 && rd > 7) c.lerp(new THREE.Color(0.46, 0.44, 0.39), 0.7);
    },
    clear: (x, z) => insideCastle(x, z, 6) || (Math.abs(x + 4) < 40 && z < -24 && z > -105) || Math.hypot(x + 114, z - 100) < 40,   // 最後は西の村
    streams: [{ pts: KANSA, w: 7, depth: 3.4 }, { pts: URE, w: 7, depth: 3.4 }, { pts: TOYO, w: 8, depth: 3.6 }],
    trees: 440,
    tufts: 3600,
    treeDensity: (x, z) => (Math.abs(x) < 70 && z > -110 && z < 55 ? 0.25 : 1),
    groves: [{ x: 35, z: 118, r: 22, n: 40 }, { x: -120, z: -40, r: 18, n: 30 }, { x: 70, z: -60, r: 12, n: 16 }, { x: -85, z: 120, r: 16, n: 24 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.enemies = [];
    F.mor = 60;   // 城兵の士気
    // ----- 塀と門 -----
    // 塀は厚い板塀（鉄砲の狭間の所は槍が届かないので、一の寄せで破れすぎないよう強めに）
    const wopt = { hp: 800, segLen: 6, name: '塀', mesh: hei, sama: 1.8 };
    F.north = [
      ...wallLine(rt, [[W_X, N_Z + 4], [W_X + 4, N_Z], [GATE.x - 3, N_Z]], wopt),
      ...wallLine(rt, [[GATE.x + 3, N_Z], [E_X - 4, N_Z], [E_X, N_Z + 4]], wopt),
    ];
    F.gate = rt.army.addStruct({ seg: [GATE.x - 3, N_Z, GATE.x + 3, N_Z], hp: 2200, maxHp: 2200, armor: 0.3, team: 0, name: '大手門' });
    F.gate.mesh = gateDoors(W, GATE.x, N_Z, 6);
    rt.scene.add(F.gate.mesh);
    rt.scene.add(kabukimon(W, GATE.x, N_Z, 6.4, 0, { doors: false }));
    F.north.push(F.gate);
    const rest = { hp: 99999, segLen: 6, name: '塀', mesh: hei, sama: 1.8 };
    wallLine(rt, [[E_X, N_Z + 4], [E_X, S_Z - 5], [E_X - 5, S_Z], [KARA.x + 3, S_Z]], rest);
    wallLine(rt, [[KARA.x - 3, S_Z], [W_X + 5, S_Z], [W_X, S_Z - 5], [W_X, N_Z + 4]], rest);
    rt.scene.add(kabukimon(W, KARA.x, S_Z, 5.4));
    // 本丸と二の丸の境
    wallLine(rt, [[W_X, IN_Z], [GATE2.x - 3, IN_Z]], rest);
    wallLine(rt, [[GATE2.x + 3, IN_Z], [E_X, IN_Z]], rest);
    rt.scene.add(kabukimon(W, GATE2.x, IN_Z, 6));
    // ----- 館・蔵・櫓・幟 -----
    F.hall = rt.army.addStruct({ x: HALL.x, z: HALL.z, r: 5, solidR: 4.8, hp: 2600, maxHp: 2600, armor: 0.35, team: 0, name: '本丸の館' });
    F.hall.mesh = hut(W, HALL.x, HALL.z, 11, 7, Math.PI, { h: 3.1, wall: 0x6e5a44 });
    rt.scene.add(F.hall.mesh);
    rt.army.addStruct({ x: KURA.x, z: KURA.z, r: 3, solidR: 3.2, hp: 1e9, maxHp: 1e9, team: 0, name: '兵糧蔵' });
    rt.scene.add(hut(W, KURA.x, KURA.z, 6.5, 5, Math.PI, { h: 2.9, wall: 0xcfc6b0 }));
    rt.scene.add(tawara(W, KURA.x + 5, KURA.z - 1, 0.3, 6), tawara(W, KURA.x - 4.5, KURA.z + 1, -0.4, 5));
    rt.scene.add(hut(W, 14, 26, 6, 4, Math.PI / 2, { roof: 0x6a5c44 }));
    for (const [x, z] of [[-13, N_Z + 4], [7, N_Z + 4], [E_X - 5, N_Z + 5], [W_X + 5, N_Z + 5], [E_X - 5, S_Z - 5], [W_X + 5, S_Z - 6]]) rt.scene.add(yagura(W, x, z));
    for (const [x, z, k] of [[-8, N_Z + 3, 'okudaira'], [2, N_Z + 3, 'okudaira'], [-24, -8, 'tokugawa'], [18, 4, 'okudaira'], [-20, 20, 'okudaira'], [-8, 20, 'tokugawa'], [GATE2.x - 4, IN_Z + 2, 'okudaira'], [GATE2.x + 4, IN_Z + 2, 'okudaira']]) rt.scene.add(nobori(W, x, z, k, 5.5));

    // ----- 味方：奥平信昌と城兵 -----
    const oku = allyGroup(rt, { faction: 'tokugawa', name: '奥平信昌', anchor: { x: GATE2.x, z: 2 }, facing: Math.PI, noRout: true, aggro: 4, width: 5 },
      [{ type: 'busho', n: 1, o: { name: '奥平信昌', invuln: true, flag: 'okudaira' } }, { type: 'samurai', n: 4, o: { flag: 'okudaira', invuln: true } }]);
    F.oku = oku.units[0];
    const flagOf = (i) => (i % 3 === 2 ? 'tokugawa' : 'okudaira');
    F.allies = [];
    // 槍の組は塀にぴったり付いて立つ（塀から 1.5m より離れると、塀越しに槍が届かない：units.js の wallBetween）
    // 大手の脇と、北の塀の東西の端を受け持つ。鉄砲の組とは持ち場を分ける（同じ所に並ぶと押し合って、どちらも塀から離れる）
    [[GATE.x, 14, 10], [-31, 12, 7], [25, 12, 7]].forEach(([x, n, w], i) => {
      F.allies.push(allyGroup(rt, { faction: 'tokugawa', name: '槍の組', anchor: { x, z: N_Z + 1.2 }, facing: Math.PI, width: w, spacing: 1.45, aggro: 7, noRout: true },
        [{ type: 'samurai', n: 1, o: { flag: flagOf(i) } }, { type: 'ashigaru', n, o: { flag: flagOf(i) } }]));
    });
    // 鉄砲の組は北の塀の狭間の真後ろに一人ずつ（狭間は 1.8m ごと。槍の組の間に、塀に付いて立つ）
    for (const [x, i] of [[-18, 0], [12, 1]]) {
      F.allies.push(allyGroup(rt, { faction: 'tokugawa', name: '鉄砲の組', anchor: { x, z: N_Z + 0.7 }, facing: Math.PI, width: 9, spacing: 1.8, aggro: 6, noRout: true },
        [{ type: 'gun', n: 9, o: { flag: flagOf(i) } }]));
    }
    F.guard = allyGroup(rt, { faction: 'tokugawa', name: '本丸の守り', anchor: { x: HALL.x, z: HALL.z - 7 }, facing: Math.PI, width: 6, aggro: 9, noRout: true },
      [{ type: 'samurai', n: 1, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: 8, o: { flag: 'okudaira' } }]);
    F.allies.push(F.guard);

    // ----- 武田の大軍（遠景） -----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const face = (x, z) => Math.atan2(MID.x - x, MID.z - z);
    const TD = ARMOR.takeda, AK = ARMOR.akazonae;
    // 北の原：城を囲む寄せ手の列（前に鉄砲と槍の備）
    F.siege = [DA(-40, -118, 70, 12, 380, 0, TD, 'takeda', 71, 'mixed'), DA(35, -116, 70, 12, 360, 0, TD, 'furin', 72, 'spear')];
    // 医王寺山の勝頼の本陣と、その前と脇の備（赤備えの騎馬は赤）
    // 見に行けば勝頼と旗本がいる（籠城で wake は止めてあるので、本物の兵で置く。後ろの控えは軽い兵）
    F.kCamp = camp(rt, { x: -30, z: -162, facing: 0, team: 1, faction: 'takeda', mon: 'takeda', armor: TD, general: { name: '武田勝頼' }, guard: 15, reserve: 260, runTo: { x: -30, z: -125 } });
    [[-30, -136, 'takeda', 'spear'], [-62, -140, 'furin', 'cavalry'], [6, -146, 'akazonae', 'cavalry']].forEach(([x, z, f, kind], i) => DA(x, z, 22, 14, kind === 'cavalry' ? 150 : 240, face(x, z), f === 'akazonae' ? AK : TD, f, 73 + i, kind));
    // 北東・東の台地、宇連川の向こう（鳶ヶ巣山）、寒狭川の向こう
    [[92, -100, 'takeda', 'spear'], [128, -20, 'furin', 'mixed'], [120, 40, 'takeda', 'spear'], [20, 112, 'takeda', 'gun'], [70, 118, 'furin', 'spear'], [-112, -30, 'takeda', 'mixed'], [-118, 30, 'akazonae', 'cavalry']].forEach(([x, z, f, kind], i) =>
      DA(x, z, 24, kind === 'gun' ? 6 : 16, kind === 'cavalry' ? 140 : 220, face(x, z), f === 'akazonae' ? AK : TD, f, 80 + i, kind));
    for (const [x, z, k] of [[-44, -150, 'furin'], [-50, -132, 'furin'], [8, -134, 'akazonae'], [60, -104, 'takeda']]) rt.scene.add(nobori(W, x, z, k, 6.5));
    // 遠景の村（寒狭川の向こうの山すそ）
    farVillage(rt, -104, 100, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 12 });
    // 寄せの波ごとに、北の原から後続の隊が坂の下まで押し出す（見た目だけ）
    F.far = [];
    for (const [x, f, kind] of [[-26, 'takeda', 'spear'], [18, 'furin', 'spear'], [-8, 'akazonae', 'cavalry'], [36, 'takeda', 'mixed']]) {
      const m = DA(x, -150, 18, 10, 110, 0, f === 'akazonae' ? AK : TD, f, 90 + F.far.length, kind);
      m.visible = false;
      F.far.push({ m, x, v: 0 });
    }

    // ----- 任務と下知 -----
    rt.world.setTime('day');
    rt.setPhase('brief');
    const hiR = !rt.G.lord && (rt.G.rank || 0) >= 3;   // 足軽大将ほどの者は、大手の塀の一手を預かる
    rt.obj('hold', hiR ? '大手の塀の一手を預かり、長篠城を守り抜け（本丸の館を守る）' : '長篠城を守り抜け（本丸の館を守る）', 'main');
    rt.obj('stay', '塀の内で守れ（城の外へ出るな）', 'order');
    rt.obj('gate', '大手門を破らせるな', 'side');
    rt.marker('oku', unitPos(F.oku), '奥平信昌', { h: 3.2 });
    rt.after(12, () => rt.unmark('oku'));
    rt.say('奥平信昌', `${nm(rt)}、見よ。北の原も、川向こうの山も、みな武田の旗じゃ`, 4.5);
    rt.say('奥平信昌', '寄せ手は一万五千、我らは五百。じゃが南と西は崖、攻め口は北の大手しかない', 5);
    rt.say('奥平信昌', '塀に取り付く者を、狭間から鉄砲で撃ち、槍で突き落とせ。門を破らせるな', 4.5);
    if (hiR) rt.say('奥平信昌', 'その方には大手の脇の塀を預ける。槍と鉄砲の組を指図し、門の脇を固めよ', 4.5);
    // 手ほどきの文は、城主の話が済んでから（字幕が溜まって飛ばされないように）
    rt.after(12, () => rt.bark('狭間や塀の上から、槍で突ける。塀の外へは出るな'));
    F.wave = 0;
    rt.after(16, () => this.wave1(rt));   // 寄せ手は坂の中ほどから（着くまでの空白を短く）
  },

  // ① 大手門と北の塀への寄せ
  wave1(rt) {
    const F = rt.flags;
    if (F.wave) return;
    F.wave = 1;
    rt.setPhase('w1');
    F.w1 = [
      takedaGroup(rt, 'gate', { name: '大手への寄せ', anchor: { x: GATE.x, z: -74 } },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 3 }]),
      takedaGroup(rt, 'w', { name: '北の塀への寄せ', faction: 'takeda', anchor: { x: -24, z: -78 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 3 }]),
    ];
    this.farPush(rt, 2);
    // 寄せ手の後ろに、同じ旗の後続が続く
    backOf(rt, F.w1[0], { flag: 'takeda', armor: ARMOR.takeda, kind: 'spear', w: 16, depth: 10, count: 110, seed: 95, stop: inCastle(F.w1[0]) });
    backOf(rt, F.w1[1], { flag: 'takeda', armor: ARMOR.takeda, kind: 'spear', w: 14, depth: 8, count: 80, seed: 96, stop: inCastle(F.w1[1]) });
    sfx('taiko', 1);
    rt.after(0.6, () => sfx('horagai', 0.8));
    rt.banner('武田勢、寄せ来る', '大手門と北の塀へ');
    rt.army.play('eshout', { x: GATE.x, z: -60 }, 2);
    rt.say('足軽', '来たぞ！　武田の寄せじゃ！', 2.5);
    rt.say('奥平信昌', '引きつけて撃て！　塀に取り付いた者から突け！', 3.5);
    rt.marker('w1a', centerOf(F.w1[0]), () => `大手への寄せ・${moraleWord(F.w1[0].morale)}`, { red: true, group: F.w1[0] });
    rt.marker('w1b', centerOf(F.w1[1]), () => `北の塀への寄せ・${moraleWord(F.w1[1].morale)}`, { red: true, group: F.w1[1] });
  },

  // 遠くの後続が坂の下まで押し出す
  farPush(rt, n) {
    const fin = rt.phase === 'final';
    for (const fc of rt.flags.far.filter((q) => !q.v).slice(0, n)) {
      fc.v = 1; fc.m.reform(); fc.m.visible = true;
      fc.m.advance(70, fin ? 9 : 12, { charge: fin });
      fc.backAt = rt.t + (fin ? 9 : 12) + 18;
    }
  },

  // ② 兵糧蔵に火矢
  startFire(rt) {
    const F = rt.flags;
    if (F.fire && F.fire !== 'soon') return;
    F.fire = 'active';
    F.fireEnd = rt.t + 60;
    const W = rt.world;
    // 北東の坂から火矢を射かける弓の隊
    F.fireBows = enemyGroup(rt, { faction: 'takeda', name: '火矢の隊', anchor: { x: 30, z: -54 }, facing: -0.3, order: 'hold', aggro: 34, fleeDir: { x: 0.3, z: -1 }, width: 6 },
      [{ type: 'samurai', n: 1 }, { type: 'bow', n: 7 }]);
    F.enemies.push(F.fireBows);
    // 蔵の西・東・北の壁に火がつく（壁の外側から軒へ燃え上がる）
    const spots = [[KURA.x - 3.6, KURA.z - 1], [KURA.x + 3.6, KURA.z + 0.6], [KURA.x + 1, KURA.z - 3.8]];
    F.fires = spots.map(([x, z], i) => {
      // 軒から屋根へ燃え上がる炎（いくつも重ねて、昼でも見えるように）
      const flames = [W.addFire(x, z, { h: 0.2 }), W.addFire(x + 0.3, z - 0.3, { h: 1.0 }), W.addFire(x - 0.3, z + 0.3, { h: 1.8 }), W.addFire(x, z, { h: 2.6 })];
      for (const fl of flames) fl.size = 2.1;   // 焚き火より大きな炎
      return { x, z, flames, out: false };
    });
    rt.army.play('arrow', { x: KURA.x, z: KURA.z }, 1.2);
    rt.banner('火矢', '兵糧蔵が燃えている');
    rt.say('足軽', '火矢じゃ！　兵糧蔵に火がついたぞ！', 3);
    rt.say('奥平信昌', `${nm(rt)}！　水桶を持て、蔵の火を消せ！　兵糧を焼かれては籠城できぬ`, 4);
    rt.obj('fire', isTouch ? '兵糧蔵の火を消せ（蔵のそばで「取る」を長押し）' : `兵糧蔵の火を消せ（蔵のそばで ${K('use')} 長押し）`, 'side');
    rt.marker('kura', { x: KURA.x, z: KURA.z }, '兵糧蔵（火）', { h: 6 });
    F.fires.forEach((f, i) => {
      rt.addInteract('fire' + i, { x: f.x, z: f.z + (i === 1 ? 0 : 0) }, '水を掛けて火を消す', () => this.douse(rt, i), { r: 2.8, hold: 1.6 });
    });
  },

  douse(rt, i) {
    const F = rt.flags;
    const f = F.fires[i];
    if (!f || f.out) return;
    f.out = true;
    rt.uninteract('fire' + i);
    for (const fl of f.flames) rt.world.removeFire(fl);
    rt.army.smoke(f.x, rt.world.heightAt(f.x, f.z) + 2.4, f.z, 0, 0);
    sfx('ui');
    const left = F.fires.filter((q) => !q.out).length;
    if (left) rt.bark(`火をひとつ消した（残り ${left} か所）`);
    else {
      F.fire = 'done';
      rt.objDone('fire'); rt.objProgress('fire', ''); rt.unmark('kura');
      rt.award((t) => t.side.push('兵糧蔵の火を消した'), '副任務：兵糧蔵の火を消した');
      rt.say('奥平信昌', 'ようやった！　兵糧は守られた', 3);
      F.mor = Math.min(100, F.mor + 8);
    }
  },

  fireFail(rt) {
    const F = rt.flags;
    F.fire = 'fail';
    rt.objFail('fire'); rt.objProgress('fire', ''); rt.unmark('kura');
    for (let i = 0; i < F.fires.length; i++) {
      rt.uninteract('fire' + i);
      if (!F.fires[i].out) for (const fl of F.fires[i].flames) rt.world.removeFire(fl);
    }
    F.mor = Math.max(10, F.mor - 25);
    rt.banner('兵糧蔵が焼け落ちた', '城兵の士気が下がる');
    rt.say('足軽', '蔵が……兵糧が焼けてしもうた', 3);
    rt.say('奥平信昌', 'うろたえるな！　残りの米を分けて食え。まだ戦える', 3.5);
  },

  // ③ 夕暮れ：鳥居強右衛門を川まで送り出す
  startSune(rt) {
    const F = rt.flags;
    rt.setPhase('sune');
    rt.world.setTime('dusk');
    const W = rt.world;
    for (const [x, z] of [[GATE.x - 3.4, N_Z + 0.6], [GATE.x + 3.4, N_Z + 0.6], [KARA.x - 3, S_Z - 0.6], [HALL.x + 5, HALL.z - 4.5]]) W.addFire(x, z, { torch: true, h: 1.5 });
    rt.banner('夕暮れ', '武田勢はいったん兵を引いた');
    const sg = allyGroup(rt, { faction: 'tokugawa', name: '強右衛門', anchor: { x: SUNE_PATH[0][0], z: SUNE_PATH[0][1] }, facing: 0, noRout: true, aggro: 2, speed: 2.3, width: 1 },
      [{ type: 'ashigaru', n: 1, o: { name: '鳥居強右衛門', flag: null, hat: 'none' } }]);
    const s = sg.units[0];
    s.hp = s.maxHp = 140;
    sg.path = SUNE_PATH.map((p) => [...p]);
    F.sune = s; F.suneG = sg;
    F.suneAt = rt.t;
    // 川べりの見張り
    F.watch = enemyGroup(rt, { faction: 'takeda', name: '川べりの見張り', anchor: { x: 45, z: 53 }, facing: Math.PI - 0.5, order: 'hold', aggro: 8, fleeDir: { x: 1, z: 0.3 }, width: 3, morale: 90 },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]);
    F.enemies.push(F.watch);
    rt.say('奥平信昌', `${nm(rt)}、これへ。この者は鳥居強右衛門。今宵、囲みを抜けて岡崎の殿へ後詰を願いに行く`, 5);
    rt.say('鳥居強右衛門', '川に潜って下れば、武田の目もごまかせましょう。崖の下までお頼み申す', 4.5);
    rt.say('奥平信昌', '搦手から崖の細道を下りよ。川べりには武田の見張りがおる。強右衛門を守り、川まで送り届けよ', 5);
    rt.obj('sune', '鳥居強右衛門を搦手から川まで送り出せ', 'side');
    rt.obj('stay', '強右衛門について搦手を出よ（見張りを討て）', 'order');
    rt.marker('sune', unitPos(s), '鳥居強右衛門', { h: 2.8 });
    rt.marker('river', { x: SUNE_PATH[SUNE_PATH.length - 1][0], z: SUNE_PATH[SUNE_PATH.length - 1][1] }, '川（宇連川）', { h: 1.5 });
    rt.marker('watch', centerOf(F.watch), () => `武田の見張り・${moraleWord(F.watch.morale)}`, { red: true, group: F.watch });
  },

  suneUpdate(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    const s = F.sune, g = F.suneG;
    if (F.suneState) return;
    if (!s.alive) {
      F.suneState = 'fail';
      rt.objFail('sune'); rt.unmark('sune'); rt.unmark('river'); rt.unmark('watch');
      rt.banner('強右衛門が討たれた');
      rt.say('奥平信昌', '……強右衛門が。いや、まだ望みは捨てぬ。別の者を出す', 4);
      rt.after(6, () => this.startNews(rt));
      return;
    }
    const near = Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 9;
    const foe = rt.army.nearestEnemy(s, 13);
    const go = near && !foe;
    if (go && g.order !== 'path') { g.order = 'path'; F.waitSaid = false; }
    if (!go && g.order === 'path') { g.order = 'hold'; g.anchor = { x: s.pos.x, z: s.pos.z }; }
    if (!go) {
      F.waitT = (F.waitT || 0) + dt;
      if (F.waitT > 6 && !F.waitSaid) {
        F.waitSaid = true;
        rt.say('鳥居強右衛門', foe ? '見張りがおる……先に片付けてくだされ' : `${nm(rt)}殿、ついて来てくだされ`, 3);
      }
    } else F.waitT = 0;
    rt.objProgress('sune', foe ? '見張りが道をふさいでいる' : near ? '崖の細道を下りている' : '強右衛門のそばへ');
    if (gone(F.watch) && !F.watchDone) { F.watchDone = true; rt.unmark('watch'); rt.bark('見張りを片付けた'); }
    // 川に着いた
    if (g.pathIdx >= g.path.length) {
      F.suneState = 'done';
      rt.objDone('sune'); rt.objProgress('sune', ''); rt.unmark('sune'); rt.unmark('river'); rt.unmark('watch');
      rt.award((t) => t.side.push('強右衛門を送り出した'), '副任務：強右衛門を送り出した');
      rt.say('鳥居強右衛門', 'かたじけない。必ず後詰を連れて戻りまする', 3.5);
      rt.banner('強右衛門、川へ', '闇にまぎれ、流れを下っていった');
      rt.after(2, () => { rt.army.despawn(s); rt.world.puff(s.pos.x, s.pos.z, 4); });
      rt.after(8, () => this.startNews(rt));
      return;
    }
    // 送り出せずに長く経った
    if (rt.t - F.suneAt > 170) {
      F.suneState = 'fail';
      rt.objFail('sune'); rt.unmark('sune'); rt.unmark('river'); rt.unmark('watch');
      rt.say('鳥居強右衛門', 'もう待てぬ。ひとりで参る！', 3);
      rt.after(1.5, () => rt.army.despawn(s));
      rt.after(6, () => this.startNews(rt));
    }
  },

  // ④ 二日後：強右衛門の知らせ
  startNews(rt) {
    const F = rt.flags;
    if (rt.phase === 'news') return;
    rt.setPhase('news');
    rt.world.setTime('day');
    for (const g of F.enemies) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    // 夜のうちに塀と門を繕い、傷の手当てをした
    const n = repairWalls(rt);
    for (const sg of F.north) if (sg !== F.gate) { sg.maxHp = 900; sg.hp = 900; }
    // 破られずに残った大手門も、夜のうちに閂と板を繕う（8割までは戻す）
    if (F.gate.alive) F.gate.hp = Math.max(F.gate.hp, F.gate.maxHp * 0.8);
    const u = rt.player.u;
    u.hp = u.maxHp;
    u.pos.x = 6; u.pos.z = S_Z - 5;
    rt.player.yaw = 0.15;
    rt.player.camInit = false;
    // 討たれた城兵の穴を控えで埋める
    const lost = F.allies.reduce((a, g) => a + g.units.filter((q) => !q.alive).length, 0);
    if (lost > 3) {
      F.allies.push(allyGroup(rt, { faction: 'tokugawa', name: '城兵（控え）', anchor: { x: GATE.x, z: N_Z + 9 }, facing: Math.PI, width: 10, aggro: 8, noRout: true },
        [{ type: 'ashigaru', n: Math.min(18, lost), o: { flag: 'okudaira' } }]));
    }
    F.newsDay = true;
    rt.objRemove('sune');
    rt.obj('stay', '塀の内で守れ（城の外へ出るな）', 'order');
    rt.banner('――二日後', '五月十六日　朝');
    rt.say('', n ? '――夜のうちに、破られた塀と門を繕った' : '――囲みは解けぬまま、二日が過ぎた', 3.5);
    // 対岸に引き出された強右衛門
    F.across = rt.world.addDistantArmy({ x: 16, z: 80, w: 12, d: 5, count: 40, facing: Math.PI, armor: 0x3a2622, flagTex: flagTexture('takeda'), seed: 99 });
    rt.after(3.5, () => {
      rt.player.cine = { x: 16, z: 80, t: 3 };
      rt.say('足軽', '宇連川の向こうをご覧あれ！　武田の者に引き立てられて……あれは強右衛門殿じゃ！', 4.5);
      rt.say('奥平信昌', '岡崎まで走り抜き、殿と信長公に会うて戻る途中で、捕らえられたか', 4.5);
      rt.say('', '――「援軍は来ぬ」と城へ告げれば命は助ける。武田方はそう言い含めて、強右衛門を川べりに立たせたという', 6);
      rt.say('鳥居強右衛門', '皆の衆、聞けぇ！　援軍はすぐに来る！　あと二、三日の辛抱ぞ！　城を守り抜け！', 5);
      rt.say('', '――強右衛門は、その場で磔にされた', 4);
      rt.say('奥平信昌', '……皆、聞いたな。後詰は来る。強右衛門の声を無にするな。この城、断じて渡さぬ！', 5);
      rt.say('城兵', 'おおおーっ！', 2.5);
    });
    rt.after(26, () => {
      F.mor = Math.min(100, F.mor + 45);
      rt.banner('城兵の士気、大いに上がる', '強右衛門の声が、城を奮い立たせた');
      for (const g of F.allies) g.morale = 100;
      rt.army.celebrate(0);
      sfx('taiko', 0.8);
    });
    rt.after(32, () => this.startFinal(rt));
  },

  // ⑤ 最後の大きな寄せ
  startFinal(rt) {
    const F = rt.flags;
    if (rt.phase === 'final') return;
    rt.setPhase('final');
    F.finalAt = rt.t;
    F.holdEnd = rt.t + 125;
    if (F.across) F.across.visible = false;
    // 西の塀と大手へ先に寄せ、赤備えは少し遅れて東の塀へ
    F.fin = [
      takedaGroup(rt, 'gate', { name: '大手への総がかり', anchor: { x: GATE.x, z: -80 } },
        [{ type: 'busho', n: 1, o: { name: '寄せ手の大将' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'bow', n: 2 }]),
      takedaGroup(rt, 'w', { name: '北の塀（西）への寄せ', anchor: { x: -26, z: -78 } },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 1 }]),
    ];
    rt.after(24, () => {
      if (rt.phase !== 'final' || F.won) return;
      F.fin.push(takedaGroup(rt, 'e', { name: '赤備えの寄せ', faction: 'akazonae', anchor: { x: 20, z: -80 } },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 2 }]));
      backOf(rt, F.fin[2], { flag: 'akazonae', armor: ARMOR.akazonae, kind: 'spear', w: 14, depth: 10, count: 100, seed: 98, stop: inCastle(F.fin[2]) });
      rt.marker('f2', centerOf(F.fin[2]), () => `赤備え・${moraleWord(F.fin[2].morale)}`, { red: true, group: F.fin[2] });
      rt.say('足軽', '東からも来るぞ！　赤備えじゃ！', 2.5);
    });
    this.farPush(rt, 4);
    backOf(rt, F.fin[0], { flag: 'takeda', armor: ARMOR.takeda, kind: 'spear', w: 16, depth: 10, count: 110, seed: 97, stop: inCastle(F.fin[0]) });
    // 武田の騎馬の大きな塊：坂の下の原へ押し出し、城を囲む（軽い作り。kaito 0929）
    for (const [x, z, f, sd] of [[58, -118, 'akazonae', 131], [-60, -124, 'takeda', 132]]) farHost(rt, x, z, 34, 20, 240, Math.atan2(-x, -z), f === 'akazonae' ? ARMOR.akazonae : ARMOR.takeda, f, sd, 'cavalry').advance(14, 10);
    rt.after(10, () => { if (rt.phase === 'final' && !F.won) rt.say('奥平信昌', '寄せ手は大手の坂で足が鈍る。坂の中ほどまで引きつけ、狭間から揃えて撃て', 4); });
    rt.after(60, () => {
      if (rt.phase !== 'final' || F.won) return;
      F.fin.push(takedaGroup(rt, 'gate', { name: '新手', anchor: { x: 6, z: -80 } }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 16 }]));
      rt.banner('新手', '武田の後続が大手へ');
      rt.say('足軽', '新手じゃ！　大手へ押し寄せてくる！', 2.5);
      for (const fc of F.far) if (fc.v === 2) fc.v = 0;
      this.farPush(rt, 2);
    });
    sfx('taiko', 1);
    rt.after(0.5, () => sfx('horagai', 1));
    rt.banner('武田の総がかり', '後詰の旗が見えるまで持ちこたえよ');
    rt.army.play('eshout', { x: GATE.x, z: -60 }, 2.2);
    rt.say('奥平信昌', '武田が総がかりに来るぞ！　後詰の旗が見えるまで、一歩も退くな！', 4);
    rt.obj('hold', '後詰の旗が見えるまで持ちこたえよ', 'main');
    rt.marker('f0', centerOf(F.fin[0]), () => `大手への総がかり・${moraleWord(F.fin[0].morale)}`, { red: true, group: F.fin[0] });
  },

  win(rt) {
    const F = rt.flags;
    if (F.won) return;
    F.won = true;
    rt.setPhase('end');
    rt.unmark('f0'); rt.unmark('f2');
    const W = rt.world;
    // 西の山に織田・徳川の後詰の旗
    const DA = (x, z, flag, armor, seed, kind) => farHost(rt, x, z, 30, 14, kind === 'cavalry' ? 150 : 260, Math.atan2(-x, -z), armor, flag, seed, kind).advance(16, 14);
    DA(-135, -70, 'oda', ARMOR.oda, 111, 'spear'); DA(-140, -100, 'eiraku', ARMOR.oda, 112, 'cavalry'); DA(-128, -40, 'tokugawa', ARMOR.tokugawa, 113, 'mixed'); DA(-150, -15, 'onri', ARMOR.tokugawa, 114, 'spear');
    rt.player.cine = { x: -135, z: -60, t: 3 };
    sfx('horagai', 1);
    rt.banner('織田・徳川の後詰の旗が見える！', '西の山に、永楽銭と葵の旗');
    rt.say('足軽', '旗じゃ！　西の山に後詰の旗が見えるぞ！', 3);
    rt.say('奥平信昌', '持ちこたえたぞ！　強右衛門、聞こえるか。後詰は来たぞ！', 4);
    rt.say('', '――武田勢は囲みを解き、設楽原の方へ兵を向けはじめた', 4.5);
    for (const g of F.enemies) { g.noRout = false; g.morale = 0; }
    for (const fc of F.far) if (fc.v === 1) fc.backAt = rt.t;
    // 北の原の寄せ手も囲みを解いて、背を向けて退く
    F.siege.forEach((m, i) => rt.after(4 + i * 3, () => m.retreat(40, 36)));
    rt.objDone('hold'); rt.objProgress('hold', '');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '長篠城を守り抜いた', pts: 25 }; }, '任務達成・長篠城を守り抜いた');
    if (!F.gateBroken) { rt.objDone('gate'); rt.award((t) => t.side.push('大手門を守った'), '副任務：大手門を守った'); }
    if (!F.outWarned) rt.objDone('stay');
    rt.finish({}, 11);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 一斉射：総がかりの先手が大手の坂の中ほど（塀から十八間ほど）まで来たら、狭間の鉄砲が揃えて放つ（kaito 0929）
    if (rt.phase === 'final' && !F.finVol && F.fin && F.fin[0] && !gone(F.fin[0]) && F.fin[0].center().z > N_Z - 34) {
      F.finVol = true;
      volley(rt, F.allies.filter((g) => g.isGun || g.units.some((u) => u.type === 'gun')), { who: '奥平信昌', wait: 2.6, line: '狭間の鉄砲、放てぇっ！', banner: ['一斉射', '狭間の鉄砲が、坂を上る寄せ手へ揃えて放つ'], r: 70, hit: 24 });
    }
    // 遠くの後続：坂の下まで押し出し、しばらく留まってから背を向けて引く
    for (const fc of F.far) {
      if (fc.v === 1 && rt.t > fc.backAt) { fc.v = -1; fc.m.retreat(70, 18); fc.hideAt = rt.t + 18; }
      else if (fc.v === -1 && rt.t > fc.hideAt) { fc.v = 2; fc.m.visible = false; }
    }
    backTick(rt);
    // 城兵の士気：強さに効く
    for (const g of F.allies) g.dmgMult = 0.8 + F.mor / 200;
    const hallPct = Math.round(F.hall.hp / F.hall.maxHp * 100);
    const gatePct = Math.round(F.gate.hp / F.gate.maxHp * 100);
    const status = `城兵の士気 ${moraleWord(F.mor)}・大手門 ${F.gate.alive ? gatePct + '%' : '破られた'}・館 ${hallPct}%`;
    if (rt.phase === 'final' && !F.won) {
      const left = Math.max(0, Math.ceil(F.holdEnd - rt.t));
      rt.objProgress('hold', `残り ${left}秒・${status}`);
      // 寄せ手が早く崩れたら：時が残っていれば三の手、残り少なければ後詰の旗を早める（何もない待ちを作らない）
      if (F.fin.length >= 3 && F.fin.every(gone) && !F.lastPush) {
        F.lastPush = true;
        if (left > 50) {
          F.pushPending = true;
          rt.after(6, () => {
            F.pushPending = false;
            if (F.won) return;
            const g = takedaGroup(rt, 'w', { name: '三の手', anchor: { x: -14, z: -96 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 15 }, { type: 'bow', n: 1 }]);
            F.fin.push(g);
            rt.banner('三の手', '武田はなおも寄せてくる');
            rt.say('奥平信昌', 'まだ来るか……！　槍を立てよ、あと一息じゃ！', 3);
            this.farPush(rt, 2);
          });
        }
      } else if (F.lastPush && !F.pushPending && F.fin.every(gone) && left > 15 && !F.shortened) {
        F.shortened = true;
        F.holdEnd = rt.t + 15;
        rt.say('足軽', '武田が引いていく……？　西の山を見よ！', 3);
      }
      if (left <= 0) this.win(rt);
    } else if (!F.won) rt.objProgress('hold', status);
    if (hallPct < 50 && !F.hallWarn) { F.hallWarn = true; rt.bark('本丸の館が危ない！　中に入った敵を討て', true); }
    // 寄せが長引いたら、残った者は退く（どこかで詰まらないように）
    for (const g of F.enemies) {
      if (gone(g) || g === F.watch) continue;
      const age = rt.t - (g.bornT || 0);
      const live = g.units.filter((u) => u.alive);
      if ((age > 110 && live.length <= 4) || (age > 80 && live.every((u) => u.type === 'bow' || u.type === 'gun')) || age > 190) { g.noRout = false; g.morale = 0; }
    }
    // 城の外へ出たか（強右衛門を送る間は別）
    if (rt.phase !== 'sune' && !F.won && !insideCastle(p.x, p.z, 3)) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 4 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく城の外へ出た', ['奥平信昌', '戻れ！　塀の外へ出るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else F.outT = 0;
    if (rt.phase === 'w1') this.w1Update(rt);
    if (F.fire === 'active') {
      const left = Math.ceil(F.fireEnd - rt.t);
      rt.objProgress('fire', `残り ${F.fires.filter((q) => !q.out).length} か所・${Math.max(0, left)}秒`);
      if ((F.smokeT = (F.smokeT || 0) - dt) <= 0) {
        F.smokeT = 0.7;
        for (const f of F.fires) if (!f.out) rt.army.smoke(f.x + (Math.random() - 0.5), rt.world.heightAt(f.x, f.z) + 3.4, f.z, 0.1, 0.05);
      }
      if (left <= 25 && !F.fireWarn) { F.fireWarn = true; rt.bark('蔵の火が広がっている！　急げ', true); }
      if (left <= 0) this.fireFail(rt);
    }
    if (rt.phase === 'sune') this.suneUpdate(rt, dt);
  },

  w1Update(rt) {
    const F = rt.flags;
    if (!F.fire && (rt.pt > 55 || F.w1.every(gone))) { F.fire = 'soon'; rt.after(3, () => this.startFire(rt)); }
    if (F.w1.every(gone)) { rt.unmark('w1a'); rt.unmark('w1b'); }
    else { if (gone(F.w1[0])) rt.unmark('w1a'); if (gone(F.w1[1])) rt.unmark('w1b'); }
    const fireOver = F.fire === 'done' || F.fire === 'fail';
    if (F.w1.every(gone) && fireOver && !F.w1Done) {
      F.w1Done = true;
      rt.setPhase('lull');
      if (F.fireBows && !gone(F.fireBows)) { F.fireBows.noRout = false; F.fireBows.morale = 0; }
      rt.award((t) => t.side.push('一の寄せを退けた'), '一の寄せを退けた');
      rt.say('奥平信昌', 'よう凌いだ。……じゃが、武田は明日もまた来る。兵糧も心許ない', 4);
      rt.after(10, () => this.startSune(rt));
      F.suneSoon = rt.t + 10;
    }
  },

  onKill(rt, v) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else if (!v.isPlayer) rt.flags.ak = (rt.flags.ak || 0) + 1;
    carrion(rt, v);
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.watch) rt.unmark('watch');
    if ((F.fin || []).includes(g)) rt.say('足軽', `${g.name}が崩れたぞ！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.hitWarn = rt.t;
    if (s === F.hall) { rt.bark('本丸の館が攻められている！', true); return; }
    if (s === F.gate) { rt.bark('大手門が打ち破られそうじゃ！', true); return; }
    if (!s.seg) return;
    const x = (s.seg[0] + s.seg[2]) / 2;
    rt.bark(`${x < GATE.x ? '北の塀の西' : '北の塀の東'}に取り付かれている！`, true);
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s === F.hall) {
      rt.banner('本丸の館が破られた', '長篠城、落ちる');
      rt.say('奥平信昌', '無念……ここまでか', 3.5);
      rt.tracker.main = false;
      rt.objFail('hold');
      rt.finish({}, 7);
      return;
    }
    if (s === F.gate) {
      F.gateBroken = true;
      rt.objFail('gate');
      s.mesh.visible = true;
      for (const lv of s.mesh.userData.leaves) { lv.rotation.x = 1.4 + Math.random() * 0.12; lv.position.y = 0.1; }
      rt.banner('大手門が破られた', '二の丸へなだれ込んでくる');
      rt.say('奥平信昌', '門が破られた！　門の内で食い止めよ！　本丸へは入れるな！', 3.5);
      sfx('wood', 1.2);
      return;
    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    rt.say('奥平信昌', '塀が破られたぞ！　破れ目を槍で塞げ！', 3);
    sfx('wood', 1);
  },
  onFinish(rt) {
    const R = rt.G.rel.okudaira;
    if (!R) return;
    if (rt.tracker.main) { R.trust += 8; R.like += 6; }
    if (rt.flags.suneState === 'done') R.like += 4;
  },
};

// 両軍の総勢（城兵 五百、武田 一万五千）
nagashinojo.kit = KIT;   // battles.js の戦も使う
nagashinojo.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(100, 500 - (F.ak || 0) * 3), a0: 500, b: 15000 - (F.ek || 0) * 18, b0: 15000 };
};
nagashinojo.sides = { a: { name: '徳川方・奥平勢', mon: 'okudaira' }, b: { name: '武田軍', mon: 'takeda' } };
nagashinojo.date = (rt) => {
  const w = rt.world;
  const time = { day: '昼', dusk: '夕暮れ', after: '昼下がり', storm: '昼' }[w.timeKey] || '昼';
  return rt.flags.newsDay ? `天正三年五月十六日　夏・晴・${w.timeKey === 'day' ? '朝' : time}` : `天正三年五月十四日　夏・晴・${time}`;
};
nagashinojo.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '武田の寄せまで待つ' : rt.phase === 'lull' ? '夕暮れまで待つ' : '');
nagashinojo.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
nagashinojo.history = '天正三年五月、武田勝頼はおよそ一万五千の兵で長篠城を囲んだ。城主の奥平信昌（この頃の名は貞昌）はわずか五百ほどの兵で守り、兵糧蔵を焼かれて追い詰められたと伝わる。鳥居強右衛門は夜のうちに城を抜け出して川を下り、岡崎で家康と信長に後詰を願った。城へ戻る途中で武田方に捕らえられ、「援軍は来ない」と告げるよう命じられたが、城に向かって「援軍はすぐに来る」と叫び、磔にされたと伝わる。五月十八日、織田・徳川の後詰は設楽原に着き、二十一日の決戦へと続いた。';

// 素直な遊び手：火が出れば消しに行き、夕暮れは強右衛門について見張りを討ち、ほかは塀の内で寄せ手を突く
// 城の中の塀は、本丸の門と搦手の口を通って越える
function navTo(p, inp, x, z, r, goTo) {
  const u = p.u, px = u.pos.x, pz = u.pos.z;
  const inP = insideCastle(px, pz), inT = insideCastle(x, z);
  // 口の手前に寄ってから、まっすぐ抜ける
  const via = (gx, gz) => {
    if (Math.abs(px - gx) > 1.2) { goTo(p, inp, gx, gz, 0.6); return true; }
    return false;
  };
  // 本丸と二の丸をまたぐ
  const sideOf = (zz) => (zz > IN_Z ? 1 : -1);
  if (inP && (inT || z > S_Z) && sideOf(pz) !== sideOf(z)) {
    const s = sideOf(pz);
    if (!via(GATE2.x, IN_Z + s * 2.5)) goTo(p, inp, GATE2.x, IN_Z - s * 3, 0.5);
    return;
  }
  // 搦手から出る・入る
  if (inP && !inT && z > S_Z) {
    if (!via(KARA.x, S_Z - 2.5)) goTo(p, inp, KARA.x, S_Z + 3, 0.5);
    return;
  }
  if (!inP && inT && pz > S_Z - 1) {
    if (!via(KARA.x, S_Z + 3)) goTo(p, inp, KARA.x, S_Z - 3, 0.5);
    return;
  }
  goTo(p, inp, x, z, r);
}
nagashinojo.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const fight = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 塀の外の敵は、塀のすぐ内で待って突く（塀越しに突けるのは、塀から 1.5m の内だけ）
    const overWall = insideCastle(u.pos.x, u.pos.z) && e.pos.z < N_Z && (b.flags.gate.alive || Math.abs(e.pos.x - GATE.x) > 3.5);
    if (overWall) goTo(p, inp, Math.max(W_X + 2, Math.min(E_X - 2, e.pos.x)), N_Z + 1.1, 0.4);   // 塀から 1.5m の内でないと槍が越えない
    else if (d > 2.4) navTo(p, inp, e.pos.x, e.pos.z, 2.2, goTo);
    if (d < 4 && !(overWall && inp.k.has('KeyW'))) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
  };
  // 火消し
  if (F.fire === 'active') {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('fire')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) {
      const foe = b.army.nearestEnemy(u, 2.6);
      if (foe) { fight(foe); return; }
      if (bd > 1.6) navTo(p, inp, it.pos.x, it.pos.z, 1.2, goTo); else inp.k.add('KeyE');
      return;
    }
  }
  // 強右衛門の送り出し
  if (b.phase === 'sune' && F.sune && F.sune.alive && !F.suneState) {
    const s = F.sune;
    const foe = b.army.nearestEnemy(s, 16) || b.army.nearestEnemy(u, 5);
    if (foe) { fight(foe); return; }
    navTo(p, inp, s.pos.x, s.pos.z, 4, goTo);
    return;
  }
  // 本丸に入った敵が最優先
  const inHon = b.army.nearestEnemy(u, 90, (o) => insideCastle(o.pos.x, o.pos.z) && o.pos.z > IN_Z);
  if (inHon) { fight(inHon); return; }
  // 深手なら、二の丸の奥で息を整える
  if (u.hp < u.maxHp * 0.5) F.botRest = true;
  if (u.hp > u.maxHp * 0.85) F.botRest = false;
  if (F.botRest) {
    const foe = b.army.nearestEnemy(u, 2.8);
    if (foe) { fight(foe); return; }
    navTo(p, inp, GATE2.x + 6, IN_Z - 4, 1.5, goTo);
    return;
  }
  // 大手門に取り付いた敵（門が打たれている間は、門の内から先に突く）
  if (F.gate.alive && F.gate.hp < F.gate.maxHp * 0.98) {
    const g = b.army.nearestEnemy(u, 60, (o) => Math.abs(o.pos.x - GATE.x) < 6 && o.pos.z < N_Z && o.pos.z > N_Z - 6);
    if (g) { fight(g); return; }
  }
  // 城の内か、塀のすぐ外の敵
  const e = b.army.nearestEnemy(u, 24, (o) => o.pos.z > N_Z - 3 && o.pos.x > W_X - 1 && o.pos.x < E_X + 1 && o.pos.z < S_Z);
  if (e) { fight(e); return; }
  // 寄せ手のいる所の塀へ
  const far = b.army.nearestEnemy(u, 200, (o) => o.pos.z < N_Z + 40 && o.pos.z > -130);
  if (far) navTo(p, inp, Math.max(W_X + 4, Math.min(E_X - 4, far.pos.x)), N_Z + 2.5, 2, goTo);
  else navTo(p, inp, GATE.x, N_Z + 8, 3, goTo);
};
