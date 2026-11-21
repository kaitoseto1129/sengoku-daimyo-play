// K467（11/20 kaito「十人ほどしか来ない。天王寺の真田・毛利の時のように一気に大勢で来る」）の共通の部品。
//   cloud-47 が三方ヶ原（b_mikatagahara.js takedaMove）で作った形を、ほかの戦の「敵が寄せる段」から一行で呼べるようにした（クラウド kaito2 k365-cloud-27）。
//   布陣の表が立てた敵の太い塊（十二人以上）のうち本人に近い n 個を、at の前へ横に並べて走り込ませる（天王寺の charge と同じ：
//   持ち場を前へ移し、走って寄せ、目の前の者と斬り合う）。遠くの塊は持ち場に残り、地図に陣の形を残す。兵は足さない（K285）。
//   11/21 司令塔（cloud-08 の見立て）：K457 の fujinAdvance が先に前へ出した塊（_fjGo）も選ぶ（岩石城・根白坂・山中城で一つも選ばず空振りした）。
//   選んだ塊は onArrive・dest を外して寄せの持ち場へ替える（fujinAdvance は _fjGo の塊を「move で行き先無し」の時しか触らないので、hold の寄せはそのまま）。
//   _fjGo を付けて、布陣の動き（fujin_place.js fujinMoves）が元の持ち場へ戻さないようにする。返す数は動かした塊の数。
import { enemyRush } from './audio.js';
import { isTouch } from './touch.js';

export function chargeFujinBlocks(rt, at, o = {}) {
  const me = rt.player?.u; if (!me || !at || typeof window !== 'undefined' && (window.__k467off || /[?&]k467off\b/.test(location.search))) return 0;   // __k467off：前後の比べの時だけ（直す前の動き）
  const n = o.n ?? 3, maxD = o.maxD ?? 220, spread = o.spread ?? 12, min = o.min ?? 12;
  const blocks = (rt.army.groups || []).filter((g) => g._fjR && g.team !== me.team && g.count >= min && !g.routed && !g.hidden && !g._charge)
    .map((g) => { const c = g.center(); return { g, d: Math.hypot(c.x - me.pos.x, c.z - me.pos.z) }; })
    .filter((q) => q.d < maxD).sort((a, b) => a.d - b.d).slice(0, n);
  // 横に並べる向き：at から本人へ向かう線に直交
  const vx = me.pos.x - at.x, vz = me.pos.z - at.z, vl = Math.hypot(vx, vz) || 1, px = -vz / vl, pz = vx / vl;
  blocks.forEach(({ g }, i) => {
    const k = i - (blocks.length - 1) / 2;
    g._chA = o.aggro ?? 7; g.allOutRun = true; g.order = 'hold'; g._charge = true; g._fjGo = true; g.stay = true;
    g.dest = null; g.path = null; g.focus = null; g.onArrive = null;
    g.anchor = { x: at.x + px * k * spread, z: at.z + pz * k * spread };
    g.aggro = o.aggro ?? 7; g.seekRange = o.seekRange ?? 11; g.morale = Math.max(g.morale || 0, 90); g._far = false; g.marching = false; g.noEngage = false;
  });
  if (blocks.length && o.sound !== false) try { enemyRush(Math.min(1, 0.55 + blocks.length * 0.15)); } catch (e) { console.error(e); }   // K467 寄せの始まりの音（cloud-28）：敵の陣太鼓の早打ちと、迫る鬨の声
  return blocks.length;
}

// K467 の騎馬（cloud-32・司令塔「騎馬だけの突撃を三方ヶ原で。47 の mass_charge と合わせる」）：走り込ませた塊（chargeFujinBlocks の塊・takedaMove の塊）の
//   名の無い騎馬武者だけを一つの騎馬の塊に分け、徒の列より先に駆け込ませる。徒の歩調に合わせて並足で寄るだけで、駆け出し（突撃）が起きなかった。
//   兵は足さず・強さも変えない（元の塊から移すだけ）。騎馬の塊は army_think の騎馬の決まり（そろって鬨の声で駆け出し・当てて駆け抜け・また寄せる）で動く。
//   返すのは騎馬の塊（四騎に満たなければ null）。
export function cavalryVanguard(rt, groups, at, o = {}) {
  if (!at || typeof window !== 'undefined' && window.__k467off) return null;
  const list = [];
  for (const g of groups || []) {
    if (!g?.units) continue;
    for (const u of g.units) if (u.alive && !u.gone && u.mounted && !u.name && u.type === 'cavalry' && !u.isPlayer) list.push(u);
  }
  if (list.length < (o.min ?? 4)) return null;
  const src = groups[0];
  let x = 0, z = 0; for (const u of list) { x += u.pos.x; z += u.pos.z; } x /= list.length; z /= list.length;
  const facing = Math.atan2(at.x - x, at.z - z);
  const sg = rt.army.addGroup({ team: src.team, faction: src.faction, name: o.name || `${(src.name || '').replace(/\s.*$/, '')}の騎馬武者`, anchor: { x, z }, facing,
    order: 'hold', formation: 'line', width: Math.min(24, list.length * 1.6), aggro: 60, seekRange: 60, morale: Math.max(src.morale || 0, 90), noRout: !!src.noRout, fleeDir: src.fleeDir });
  for (const u of list) {
    const og = u.group, i = og.units.indexOf(u);
    if (i >= 0) og.units.splice(i, 1);
    if (og.leader === u) og.leader = null;
    u.group = sg; u.slot = sg.units.length; sg.units.push(u);
    u.target = null; u.moveTo = null; u.aiT = 0;
    // 武田の名の無い馬乗りは三人中二人が接敵の前に下馬する（cavalry_tactics.js）。駆け込ませる騎馬の塊だけは馬上で当たる（戦の定義の horseBattle と同じ指定）
    if (o.mounted !== false) u.horseBattle = 'mounted';
  }
  sg.initial = sg.units.length; sg.leader = sg.units[0];
  sg.allOutRun = true; sg._fjGo = true; sg._cavVan = true; sg._far = false; sg.marching = false;
  // 要（anchor）を駆け足より速く列へ動かすと、持ち場から十二歩より離れた騎馬が駆け出す（army_think の「騎馬の隊が駆けて寄せる」）。着いたら斬り合う
  sg.speed = o.speed ?? 7; sg.guard = false; sg.order = 'move'; sg.dest = { x: at.x, z: at.z }; sg.path = null;
  sg.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; };
  sg._cvvUntil = rt.army.time + (o.chargeFor ?? 60);   // 駆け出しを掛けるのは寄せの間だけ（退きの段で殿の馬を追い回さない）
  return sg;
}
// 騎馬の塊（cavalryVanguard）が列へ寄せる間、半秒ごとに三十歩内・八歩より先の敵を見つけた騎馬を突撃に入れる（槍を伏せ、当たれば突撃の一撃と踏み倒し）。
//   乱戦の五歩内・柵の前・疲れた馬では駆け出さない決まり（army_think startCharge）はそのまま。戦の update から呼ぶ
export function cavalryVanguardTick(rt) {
  const A = rt.army; if (!A || rt._cvvT > A.time) return; rt._cvvT = A.time + 0.5;
  for (const g of A.groups) {
    if (!g._cavVan || g.routed || !g.hasLive() || A.time > (g._cvvUntil ?? Infinity)) continue;
    for (const u of g.units) {
      if (!u.alive || u.gone || !u.mounted || u.charging || u.fleeing || u.chargeCd > A.time) continue;
      const e = A.nearestEnemy(u, 30, (q) => !q.isStruct && !q.fleeing && Math.abs(q.pos.y - u.pos.y) < 2);
      if (!e || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 8) continue;
      A.startCharge(u, true);
    }
  }
}

// K467 の携帯（11/21 司令塔「携帯が主。寄せの段だけ、本人から遠い本物を退かせて枠を空け、寄せる塊を本物にしてから chargeFujinBlocks」・クラウド k365-cloud-01）：
//   携帯は本物の兵が realCap（250）までで、布陣の太い塊は fujin_place.js の lazy・roomFull で本物にならず、chargeFujinBlocks は0組だった（大河内の押しの段 175秒）。
//   ①本人から farD（既定 90m）より遠く、斬り合っていない名の無い本物（本人の側の後備え・崩れて退く敵の残り）を、遠い順に need 人まで遠景へ戻す
//     （army.despawn の無傷の戻し＝_shedN に数え、両軍の札は減らない。k365-03 の仕組み）。②空いた枠で布陣の塊が立つのを一秒ごとに見て（最長 tries 秒）、
//   立ったら chargeFujinBlocks。パソコン（isTouch でない）は今まで通り chargeFujinBlocks をすぐ呼ぶ。then(n) に寄せた塊の数を返す。兵は足さない。
export function shedFarReal(rt, need, o = {}) {
  const me = rt.player?.u; if (!me || !(need > 0)) return 0;
  const farD = o.farD ?? 90, list = [];
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.isStruct || u.civ || u.isPlayer || u.name || u.invuln || u.type === 'busho') continue;
    const g = u.group; if (!g || g.isPlayerSquad || g._charge || g.leader === u) continue;
    if (u.target || u.atk || u.swing) continue;
    const enemyRest = u.team !== me.team && (g.routed || u.fleeing);
    if (u.team !== me.team && !enemyRest) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (d > farD) list.push([d, u]);
  }
  list.sort((a, b) => b[0] - a[0]);
  let n = 0;
  for (const [, u] of list) { if (n >= need) break; rt.army.despawn(u); n++; }
  return n;
}
export function chargeWithRoom(rt, at, o = {}) {
  const then = o.then || (() => {});
  if (!isTouch) { then(chargeFujinBlocks(rt, at, o)); return; }
  if (typeof window !== 'undefined' && (window.__k467off || /[?&]k467off\b/.test(location.search))) { then(0); return; }
  let live = 0; for (const u of rt.army.units) if (u.alive && !u.gone) live++;
  const cap = Math.min(rt.def?.realCap ?? 250, 250);
  const want = o.room ?? 72;   // 塊三つ分（携帯の塊は六〜十二人の行が並ぶ）
  rt.flags._k467Shed = (rt.flags._k467Shed || 0) + shedFarReal(rt, want - Math.max(0, cap - live), o);
  // 空けた枠を、ほかの取っておきの備（本人の側の後備えなど）が先に埋めた（大河内：47人退かせても本物の数は戻り、城の控えは立たなかった）。
  //   取っておきの列（fujin_place.js の _fjPend）で、寄せる側の塊を寄せる所に近い順に前へ並べ替え、次の見直し（一秒ごと）で先に立たせる
  const P = rt.flags._fjPend, meT = rt.player?.u?.team;
  if (P && P.length > 1) {
    const dd = (r) => (r.side !== meT ? 0 : 1e6) + Math.hypot(r.x - at.x, r.z - at.z);
    P.sort((a, b) => dd(a) - dd(b));
  }
  // 携帯の布陣の塊は一つ四〜六人で立つ（fujin_place.js の携帯の割合 0.02）。三人以上の塊を、塊の数を倍にして寄せる
  const nT = o.nTouch ?? (o.n ?? 3) * 2;
  const oo = { ...o, min: o.minTouch ?? 3, n: nT };
  let tries = o.tries ?? 8, sum = 0;
  const step = () => {
    if (rt.over || rt.flags?.ending) { then(sum); return; }
    sum += chargeFujinBlocks(rt, at, { ...oo, n: nT - sum, sound: sum === 0 && o.sound !== false });
    if (sum >= nT || --tries <= 0) { then(sum); return; }
    rt.after(1, step);
  };
  rt.after(1, step);
}
