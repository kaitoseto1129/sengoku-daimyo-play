// 遠景の軍勢・控え・本陣の共通道具。戦の定義を読み込まずに使う。
import * as THREE from 'three';
import { nearHideRequest, ARMY_REAL_P, ARMY_REAL_R, ARMY_REAL_NEAR } from './world.js';
import { LIGHT_HIDE_R } from './world_army_shader.js';
import { jinCamp, village } from './props.js';
import { flagTexture } from './textures.js';
import { horseStyleFor } from './units_model.js';
const realArmyRange = () => 60;

// ---------------- 大軍の見せ方（どの戦でも使う小さな道具。battles.js からは nagashinojo.kit で使う） ----------------
// 家ごとの具足の色（遠くの軍勢と控えで同じ色にそろえる）
export const ARMOR = { oda: 0x2a2622, tokugawa: 0x24221f, takeda: 0x3a2622, akazonae: 0x8e1f16, imagawa: 0x3f2a24, saito: 0x33302a, west: 0x2c2a2a };
// 遠くの軍勢を一つ置く。kind は 'mixed'|'spear'|'gun'|'bow'|'cavalry'|'honjin'
export function farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind = 'mixed') {
  if (rt.world.outsideNearView(x, z, Math.hypot(w, d))) return rt.world.emptyDistantArmy({ x, z, facing, armor, flag, kind });
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
  const followPos = { x: c.x, z: c.z, facing: f0 };
  b.follow(() => {
    if (!g.count || g.routed || (o.stop && o.stop())) return null;
    // 控えごとに同じ入れ物を使い、毎コマ中心の物体を二つ作らない。
    let x = 0, z = 0, n = 0;
    for (const u of g.units) if (u.alive) { x += u.pos.x; z += u.pos.z; n++; }
    followPos.x = n ? x / n : g.anchor.x;
    followPos.z = n ? z / n : g.anchor.z;
    return followPos;
  }, { gap: back });
  b.army.team = g.team;   // 控えは前の隊と同じ側
  (rt.flags.backs = rt.flags.backs || []).push({ b, g });
  return b;
}
// 毎こま呼ぶ：崩れた隊の控えを崩し、プレイヤーに近い軽い大軍を消す。近づいた敵の軽い兵は本物の兵に替える
export function backTick(rt) {
  if (rt._backTickT === rt.t) return;   // 一コマに一度（戦の定義と taisho.js の両方から呼ばれても二度回さない）
  rt._backTickT = rt.t;
  // world.shyTick：味方の軽い大軍を減らす（kaito 10/2「味方が多すぎて負ける気がしない」）ために、隊が味方かを渡す
  if (!rt.world.allySide && rt.player && rt.player.u) rt.world.allySide = (A) => sideOf(rt, A) === rt.player.u.team;
  if (rt.player && rt.player.u) rt.world.meTeam = rt.player.u.team;
  // 軽い合戦と控えが、同じ上限の中で遠い兵の枠を近くへ回す。
  if (!rt.world.recycleNear) rt.world.recycleNear = (n) => recycle(rt, n, rt.player.u);
  for (const q of rt.flags.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
  nearHide(rt);
  wake(rt);
}

// ---------------- 軽い兵を本物の兵に替える（本陣や大軍を素通りさせない） ----------------
// ・敵味方とも本人から60m以内の兵を、その場で本物へ替える。
//   一つの隊に偏らず、遠い兵を戻して近くの隊へ枠を回す。
// ・陣の者（honjin の人）は、敵（プレイヤーでも兵でも）が 30m に入ると、立ち上がって武器を取る
// 替えた隊は g.guard（守る隊。ai.js：寄る敵へ向き直って迎え撃ち、離れたら持ち場へ戻る）。
// 元の軽い隊が退けば一緒に下がり、崩れれば一緒に崩れる（戦の定義の「退き陣」などはそのまま）
// 戦の側から使える印：army.team（0 味方・1 敵。決めなければ家紋で決める）・army.lord = '武田勝頼'（本陣から大将を出す。討たれない）・army.noWake = true（替えない）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'maru', 'namu', 'yatagarasu', 'sagarifuji', 'miyoshi', 'rokkaku', 'uesugi', 'mori']);
const MON_FAC = { takeda: 'takeda', sanada: 'takeda', takeda_kiba: 'akazonae', furin: 'takeda', akazonae: 'akazonae', imagawa: 'imagawa', saito: 'saito', oda: 'oda', eiraku: 'oda', tokugawa: 'tokugawa', onri: 'tokugawa', okubo: 'tokugawa', okudaira: 'tokugawa', katabami: 'tokugawa' };
const WAKE_TYPE = ['ashigaru', 'gun', 'bow', 'samurai', 'ashigaru', 'cavalry', 'samurai', 'porter'];
const WAKE_ROOM = 250;   // 戦う兵がこの数を超えていれば、もう替えない（重さ）
const WAKE_R = ARMY_REAL_NEAR; // 敵味方とも、本人から60m以内は戦える兵へ替える。
function sideOf(rt, A) {
  if (A.team !== undefined) return A.team;
  const me = rt.player.u.team, S = rt.def.sides || {};
  A.team = S.b && A.mon === S.b.mon ? 1 - me : S.a && A.mon === S.a.mon ? me : ENEMY_MON.has(A.mon) ? 1 - me : me;
  return A.team;
}
const WAKE_SWAP = false;
function wake(rt) {
  const WAKE_R = realArmyRange();
  const F = rt.flags, P = rt.player && rt.player.u;
  // 籠城・開戦前も近くの軽い形は隠す。敵を実体化するかは台本の決まりを守る。
  // 隠す輪は手前だけ（LIGHT_HIDE_R・11/2 夕）。替える輪 WAKE_R の内でも、替わるまで軽い兵を残す
  if (P) { ARMY_REAL_P.value.set(P.pos.x, P.pos.z); ARMY_REAL_R.value = LIGHT_HIDE_R; }
  // 11/5 BQ（九の5）：近づくと軽い兵が本物に替わる仕組みは全戦でやめる。軽い兵は 150m の外だけに描き（world.js FAKE_NEAR）、
  //   近づいても替えない。消した分を本物の兵で補わない（重さを増やさない）。戦う兵は戦の台本の隊だけ
  if (!WAKE_SWAP) return;
  // 籠城の戦（def.noWake）では替えない：塀の内から見える寄せ手の大軍が、次々に本物の兵になって塀へ来ないように
  //   ただし本物の隊の後ろの控え（av_host.js の wakeAlways）は、近づけば本物に替える（11/3 AV4「近づくと消える」をやめる）
  const only = !!(rt.def && rt.def.noWake);
  if (only && !(rt.world.armies || []).some((A) => A.wakeAlways && !A.rout)) return;
  // 筋の前の静かな段（def.wakeOK が偽）では替えない：自分の近くへ敵を出さない
  if (rt.def && rt.def.wakeOK && !rt.def.wakeOK(rt)) return;
  rt.world.wakeLive = rt.world.time || 0;   // world.shyTick：替える仕組みが動いている戦の軽い兵は、退かせずに本物へ替える
  if (!P || !P.alive || rt.over || !(rt.t >= (F.wakeAt || 0))) return;
  F.wakeAt = rt.t + 0.3;
  let alive = 0;
  for (const u of rt.army.units) if (u.alive) alive++;
  // 遠い兵を戻し、近くの敵味方へ枠を回す。
  alive -= recycle(rt, Infinity, P, true);
  // 一つの大軍が枠を取り切らないよう、味方の隣の組からも順に拾う。
  const armies = F.wakeArmies || (F.wakeArmies = []);
  armies.length = 0;
  let ally = 0, foe = 0, clashLive = 0;
  for (const u of rt.army.units) if (u.alive && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) <= WAKE_R) {
    if (u.team === P.team) ally++; else foe++;
    if (u.wkClash) clashLive++;
  }
  let needAlly = false, needFoe = false;
  for (const A of rt.world.armies || []) {
    if (!A.mesh.take) continue;
    if (!A._ext) A._ext = extentOf(A);
    const dx = P.pos.x - A.mesh.position.x - A.cx - A.off.x, dz = P.pos.z - A.mesh.position.z - A.cz - A.off.z;
    const cf = Math.cos(A.facing), sf = Math.sin(A.facing);
    A.wakeDistance = Math.hypot(Math.max(0, Math.abs(dx * cf - dz * sf) - A._ext.hw), Math.max(0, Math.abs(dx * sf + dz * cf) - A._ext.hd));
    A.wakeNeed = !A.rout && !A.noWake && !(only && !A.wakeAlways) && A.mesh.visible && A.mesh.parent && A.mesh.left
      ? A.mesh.left(P.pos.x, P.pos.z, WAKE_R) : 0;
    if (A.wakeNeed) { if (sideOf(rt, A) === P.team) needAlly = true; else needFoe = true; }
    armies.push(A);
  }
  const alliesFirst = ally < Math.max(48, foe);
  armies.sort((a, b) => {
    const sa = sideOf(rt, a) === P.team, sb = sideOf(rt, b) === P.team;
    return (sa !== sb ? (sa === alliesFirst ? -1 : 1) : 0) || a.wakeDistance - b.wakeDistance;
  });
  for (const A of armies) {
    const W = A.wk || (A.wk = { at: [], groups: [], last: null });
    for (let j = W.groups.length - 1; j >= 0; j--) if (!W.groups[j].count) W.groups.splice(j, 1);
    // 元の軽い隊が動いた分だけ、替えた隊の持ち場もずらす。崩れたら一緒に崩れる
    const cx = A.mesh.position.x + A.cx + A.off.x, cz = A.mesh.position.z + A.cz + A.off.z;
    if (W.groups.length) {
      const dx = W.last ? cx - W.last.x : 0, dz = W.last ? cz - W.last.z : 0;
      for (const g of W.groups) {
        if (!g.count || g.routed) continue;
        if (A.rout) { g.noRout = false; g.morale = 0; continue; }
        if (A.yose) {
          const d = Math.hypot(g.anchor.x - P.pos.x, g.anchor.z - P.pos.z);
          g.speed = 1.3 + 1.3 * Math.max(0, Math.min(1, (36 - d) / 20));
        }
        if ((Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) && (g.order === 'hold' || g.order === 'yari')) { g.anchor.x += dx; g.anchor.z += dz; }
      }
    }
    if (!W.last) W.last = { x: cx, z: cz }; else { W.last.x = cx; W.last.z = cz; }
    if (A.rout || A.noWake || !A.mesh.visible || !A.mesh.parent || (only && !A.wakeAlways)) continue;
    const team = sideOf(rt, A);
    let who = null;
    if (A.people) {
      // 陣の者：敵が 30m に入った（プレイヤーでも兵でも）
      if (A.took >= A.n) continue;
      who = rt.army.nearestEnemy({ pos: { x: A.cx + A.off.x, z: A.cz + A.off.z }, team }, 30, (o) => !o.fleeing);
    } else {
      // 敵味方とも、隊の縁から60m以内で近い兵を拾う
      if (!A._ext) A._ext = extentOf(A);
      const dx = P.pos.x - cx, dz = P.pos.z - cz, cf = Math.cos(A.facing), sf = Math.sin(A.facing);
      const lx = Math.abs(dx * cf - dz * sf) - A._ext.hw, lz = Math.abs(dx * sf + dz * cf) - A._ext.hd;
      const edge = Math.hypot(Math.max(0, lx), Math.max(0, lz));
      if (edge < WAKE_R || (A.recyclePool && A.wakeNeed)) who = P;
      // 後詰め（隊の後ろの厚い層。軽い兵の本体より奥）の中に踏み込んだか：そこは本体の兵が取れないので hostFill で埋める
      const bz = dx * sf + dz * cf;
      if (A.hostD && !A.rout && Math.abs(dx * cf - dz * sf) < A._ext.hw * 1.2 + 4 && bz < -A._ext.hd + 4 && bz > -A._ext.hd - A.hostD - 6) { who = P; alive += hostFill(rt, A, team, P, alive); }
    }
    if (!who) continue;
    // 替える所：本人から WAKE_R m の内に残っている軽い兵を、近い者から（毎 0.3 秒、一つの隊で十数人ずつ。内に残る者が尽きるまで続ける）
    // 敵の人数で替えを止めず、両軍に枠を渡す。隣の味方の隊も毎回少しずつ替える。
    // 戦ごとの味方・敵の人数調整を保ち、近くの両軍へ枠を残す。
    const wakeBias = team === P.team ? (rt.def.wakeAllyNear ?? 1) : (rt.def.wakeFoeNear ?? 1);
    const want = A.people ? A.n - A.took : Math.round(12 * wakeBias);
    if (!A.people && !A.wakeNeed) continue;
    // 近くに両軍がある時、味方60人・敵48人の枠を先に確保する。
    // 軽い前線にも両軍20人分を残し、控えだけで上限を埋めない。
    const clashNear = (rt.world.clashes || []).some((C) => C.wakeEnabled && !C.winner && C.blockNear(P.pos.x, P.pos.z).d < WAKE_R);
    const reserve = team === P.team ? (needFoe ? Math.max(0, 48 - foe) : 0) : (needAlly ? Math.max(0, 60 - ally) : 0);
    const room = Math.min(WAKE_ROOM, rt.def.wakeRoom ?? WAKE_ROOM) - Math.max(reserve, clashNear ? Math.max(0, 40 - clashLive) : 0);
    // 枠が足りなければ、プレイヤーから遠い「戻せる」本物の兵（wake で替えた兵）を大軍の中へ帰して空ける（room は守る）
    if (room - alive < want) alive -= recycle(rt, want - (room - alive), P);
    const n = Math.min(want, room - alive);
    const pts = [];
    if (n >= 1) {
      // 本陣の大将：床几の者を大将にする（一度だけ）
      if (A.lord && !W.lord) { const q = A.mesh.take(who.pos.x, who.pos.z, 1, 1e9, (k) => k === 6); if (q.length) { q[0].lord = true; pts.push(q[0]); W.lord = true; } }
      pts.push(...A.mesh.take(who.pos.x, who.pos.z, n - pts.length, A.people ? 90 : WAKE_R, null, (x, z) => Math.abs(x) <= (rt.def.moveLim || 176) - 4 && Math.abs(z) <= (rt.def.moveLim || 176) - 4));
    } else if (!A.people) {
      // 枠が尽きた：内に軽い兵が残っていれば、見せない輪を広げる（近くで軽い兵が動いて見えないように）
      if (!A.mesh.left || A.mesh.left(who.pos.x, who.pos.z, WAKE_R) > 0) { A.starvedAt = rt.world.time || 0; }
    }
    if (!pts.length) continue;
    const g = wakeGroup(rt, A, team, pts, who);
    // 味方の替えた兵は、持ち場で待たずに本人のまわりの敵へ打って出る
    //   ただし本陣・大殿の旗本（kind:'honjin'）は陣形を崩さず、大将を囲んで落ち着いて待つ（敵が間近に来た時だけ迎え撃つ。kaito 10/1）
    if (team === P.team && !A.people && A.kind !== 'honjin' && !A.jinkeiGuard) { g.order = 'attack'; g.seekRange = 40; g.aggro = 14; g.guard = false; }
    else if (team === P.team && A.kind === 'honjin') { g.order = 'hold'; g.aggro = 6; g.seekRange = 14; g.guard = true; }
    alive += g.count;
    if (team === P.team) ally += g.count; else foe += g.count;
    W.groups.push(g);
  }
  // 本人中心の60mの輪を使い、カメラ中心の輪は従来のままにする。
  nearHideRequest('wake', 0);
}
// 後詰めの中へ踏み込んだ時：後詰めの軽い兵は本人の 24m 内で見せないので、そこに本物の兵を立てて「大軍の中にいる」ようにする
//   本人のまわり 16m に同じ側の本物が 12 人より少なければ、6〜18m の後詰めの中へ 12 人ずつ（一つの隊で 40 人まで・枠 WAKE_ROOM を守る）
//   立てた兵は戻せる隊（遠くなれば静かに外す）
function hostFill(rt, A, team, P, alive) {
  const W = A.wk; if (!W) return 0;
  if ((W.hostT || 0) > rt.t || (W.hostN || 0) >= 40) return 0;
  W.hostT = rt.t + 1.2;
  let near = 0; rt.army.forNear(P.pos.x, P.pos.z, 16, (u) => { if (u.alive && u.team === team && !u.isPlayer && u !== P) near++; });
  if (near >= 12) return 0;
  const room = Math.min(WAKE_ROOM, rt.def.wakeRoom ?? WAKE_ROOM);
  let n = Math.min(12, 40 - (W.hostN || 0), room - alive);
  let freed = 0;
  if (n < 12 && room - alive < 12) { freed = recycle(rt, 12 - n, P); n = Math.min(12, n + freed); }
  if (n < 3) return -freed;
  const cx = A.mesh.position.x + A.cx + A.off.x, cz = A.mesh.position.z + A.cz + A.off.z, cf = Math.cos(A.facing), sf = Math.sin(A.facing);
  const hw = A._ext.hw, hd = A._ext.hd, pts = [];
  for (let k = 0; k < n * 4 && pts.length < n; k++) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 12;
    const x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    const dx = x - cx, dz = z - cz, lx = dx * cf - dz * sf, lz = dx * sf + dz * cf;
    if (Math.abs(lx) > hw * 1.15 || lz > -hd + 1 || lz < -hd - A.hostD || Math.abs(x) > 172 || Math.abs(z) > 172) continue;
    pts.push({ x, z, k: Math.random() < 0.8 ? 0 : 3 });
  }
  if (pts.length < 3) return -freed;
  const g = wakeGroup(rt, A, team, pts, P);
  g.name = '後詰の兵'; g.defRecycle = true;
  g.units.forEach((u) => { u.wkFrom = null; });
  W.hostN = (W.hostN || 0) + g.count;
  W.groups.push(g);
  return g.count - freed;
}
// 遠い戻せる兵を n 人まで大軍へ帰す（戦っていない・名のない・カメラから遠い者から）。帰した数を返す
// 戦の定義から：任務に数えていない隊（柵の内の後ろの控え・遠い控え・通り過ぎた隊）は markRecyclable(g) で戻せる隊にする
export function markRecyclable(...gs) { for (const g of gs) if (g) { g.recyclable = true; g.defRecycle = true; } }
function recycle(rt, n, P, farOnly = false) {
  const WAKE_R = realArmyRange();
  if (n <= 0 || !P) return 0;
  const cam = rt.camera && rt.camera.position;
  const cand = rt.flags.wakeRecycle || (rt.flags.wakeRecycle = []);
  cand.length = 0;
  for (const g of rt.army.groups) {
    if (!g.recyclable || (farOnly && !g.woke && WAKE_R >= ARMY_REAL_NEAR)) continue;
    for (const u of g.units) {
      // 引継ぎ元のない控えは、退場前に同じ位置・人数の遠景を用意する。
      if (!u.alive || u.gone || (!u.wkFrom && !u.wkClash && !g.defRecycle) || u.name || u.invuln || u.isPlayer || u.isSub || u.atk || u.swing || (u.target && (u.target.isPlayer || Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 12)) || u.fleeing) continue;
      const A = u.wkFrom && u.wkFrom.A;
      if (A && (A.rout || !A.mesh.visible || !A.mesh.parent)) continue;
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z), dc = cam ? Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) : d;
      if (d < WAKE_R + 8 || dc < WAKE_R) continue;
      cand.push({ u, d });
    }
  }
  cand.sort((a, b) => b.d - a.d);
  let k = 0;
  for (const { u } of cand) {
    if (k >= n) break;
    if (!u.wkFrom && !u.wkClash && !recycleSource(rt, u.group, u)) continue;
    if (u.wkFrom && (!u.wkFrom.A.mesh.give || !u.wkFrom.A.mesh.give(u.wkFrom.i, u.pos, u.heading))) continue;
    if (u.wkClash) u.wkClash.C.giveBack(u.wkClash.key, [u.wkClash.s], 1, u.pos, u.heading);
    rt.army.despawn(u);
    k++;
  }
  return k;
}
// 戦の定義が置いた控えの引継ぎ元。一隊につき一度だけ作り、近づけば既存の本物化を使う。
function recycleSource(rt, g, u) {
  if (!g.recycleArmy) {
    const lim = (rt.def.moveLim || 176) - 1;
    const units = g.units.filter((o) => Math.abs(o.pos.x) < lim && Math.abs(o.pos.z) < lim && o.alive && !o.gone && !o.wkFrom && !o.wkClash && !o.name && !o.invuln && !o.isPlayer && !o.isSub);
    if (!units.length) return false;
    const people = units.map((o) => ({ x: o.pos.x, z: o.pos.z, facing: o.heading,
      k: o.mounted ? 5 : o.type === 'gun' ? 1 : o.type === 'bow' ? 2 : o.type === 'samurai' ? 3 : 0,
      helm: o.look?.hat?.startsWith('kabuto') ? 1 : 0, flag: o.look?.flag ? 1 : 0 }));
    const mesh = rt.world.addDistantArmy({ x: 0, z: 0, people, team: g.team, flag: g.faction,
      armor: ARMOR[g.faction], facing: g.facing, kind: 'spear', yose: false });
    const A = g.recycleArmy = mesh.army;
    A.people = false; A.recyclePool = true;
    // 全員分を先に隠し、本物が遠景へ戻った時だけその一人を見せる。人数を二重に増やさない。
    const pts = mesh.take(0, 0, units.length, 1e9);
    for (const p of pts) { const o = units[p.i]; if (o) o.wkFrom = { A, i: p.i }; }
  }
  return !!u.wkFrom;
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
    team, faction: fac, name, order: 'hold', formation: 'line', anchor: { x, z }, facing: A.facing, noGuard: true, width: Math.max(4, Math.min(16, pts.length * 1.1)),
    aggro: 12, seekRange: 30, morale: 85, speed: 2.6, fleeDir: { x: -Math.sin(face), z: -Math.cos(face) },
  });
  // 隊旗は軽い隊の家紋のまま（表に無い家を近い隊の家＝織田などにしない。kaito 11/3 AQ4）
  if (A.mon && !MON_FAC[A.mon]) g.mon = A.mon;
  let lead = null;
  const list = pts.map((p, i) => {
    let type = WAKE_TYPE[p.k] || 'ashigaru';
    // 場所・向き・笠や兜・家の色は軽い兵から引き継ぐ。
    const o = { x: p.x, z: p.z, heading: p.yaw ?? A.facing, armor: A.armor, hat: p.helm ? 'kabuto' : 'jingasa', flag: p.flag === 0 ? null : A.mon || undefined };
    if (p.flag !== 0 && (A.mon && ENEMY_MON.has(A.mon) || MON_FAC[A.mon])) o.flag = A.mon;
    if (A.yose && p.flagKind) o.flag = p.flagKind;
    // 一つの備の近い兵も、元の家紋に揃える。
    if (p.flag !== 0 && A.yoseFamily === 'takeda' && ['sanada', 'akazonae'].includes(A.mon)) o.flag = A.mon === 'sanada' ? 'sanada' : 'takeda_kiba';
    if (type === 'cavalry' && A.yoseFamily === 'takeda') o.horseBattle = 'mounted';
    if (p.lord) { type = 'busho'; o.name = A.lord; o.invuln = true; delete o.armor; }
    else if (p.general && !rt.army.units.some((u) => u.alive && u.name === p.general)) { type = 'busho'; o.name = p.general; o.horse = true; o.invuln = true; }
    else if (p.k === 6 && A.people && !lead) type = 'samurai';
    if (A.yose && p.k === 5 && p.ex === 2) {
      // 見せるための白馬。将の名・生死・軍の数は元のまま。
      o.horseStyle = horseStyleFor(p.i + 17, 2, fac); o.horseStyle.coat = 0xe9e4d6; o.horseStyle.mane = 0xc9c1ae;
      if (A.yoseFamily === 'takeda' && (!o.name || o.name === '武田信玄' || o.name === '武田勝頼')) o.hat = 'kabuto_suwa';
      if (!o.name) { o.haori = 0x701c16; o.trim = 0xc9a24a; }
    }
    if (p.k === 4 && (p.flagKind || A.mon)) {
      type = 'samurai'; o.standard = A.yoseFamily === 'takeda' && ['sanada', 'akazonae'].includes(A.mon) ? (A.mon === 'sanada' ? 'sanada' : 'takeda_kiba') : p.flagKind || A.mon; o.flag = null; o.weapon = 'none'; o.dmg = 0;
    }
    return { type, n: 1, o };
  });
  rt.army.spawn(g, list);
  if (A.yose) {
    // 本物へ替えても元の横列・旗持ちの間隔を保つ。間合いに入れば通常の打ち合いへ。
    const slots = pts.map((p) => ({ dx: p.x - x, dz: p.z - z, x: p.x, z: p.z })), slotPos = g.slotPos;
    g.slotPos = function (i, n) {
      const p = slots[i];
      if (!p || (this.order !== 'hold' && this.order !== 'yari') || Math.hypot(this.anchor.x - who.pos.x, this.anchor.z - who.pos.z) < 18) return slotPos.call(this, i, n);
      p.x = this.anchor.x + p.dx; p.z = this.anchor.z + p.dz; return p;
    };
  }
  // 戻せる隊：戦の定義が数えていない（wake で替えただけの）兵。遠くなれば大軍の中へ帰して、枠を近くへ回す
  g.recyclable = true;
  g.units.forEach((u, j) => {
    const p = pts[j];
    if (p && !p.lord) {
      u.wkFrom = { A, i: p.i };
      if (p.sy && !rt.def.wakeFullSize) u.mesh.scale.set(p.sx, p.sy, p.sz);
    }
  });
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
  if (rt.world.outsideNearView(x, z, 30)) return new THREE.Group();
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
