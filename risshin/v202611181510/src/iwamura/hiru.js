// ======================================================================
// 岩村城・水晶山　昼の段（0〜6分）「包囲の陣の見回り・城方の出撃」（docs/oda15_plan_1108.md 20）
//   ① 昼の水晶山の陣。本陣で信忠の下知を受け、柵ぞいの物見の台の下から岩村城を望む（囲んで五月・兵糧の尽きかけた城）。
//   ② 麓の搦手道に兵糧入れの小荷駄。組と駆け下りて護りを崩す（長い囲みは兵糧を断つ戦）。
//      城方が打って出て、柵の口まで退き、口の前の野で槍を合わせる。三度目の寄せ（侍大将・大島杢之助）まで押し返すと、日が暮れる。
//   ③ 日が暮れたら本体の夜の段（篝火→夜討ち→追い討ち）へ渡す。
// 兵は兵糧入れの十一人、城方の三つの寄せ三十四人（順に一つずつ）と、口を守る味方の槍十人。字は台詞と任務の一行だけ。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export const GOALS = ['水晶山の囲みを見回り、岩村城を望む', '麓の兵糧入れを止め、打って出た城方を押し返す'];
const HONJIN = { x: 0, z: 30 };   // 信忠の本陣の前（下知を受ける）
const KOMODA = { x: -11, z: -74 }; // 城の麓の搦手道の登り口（兵糧入れの小荷駄）。11/18 持ち主 クラウド：(-4,-74) は九十九折りの道（(-20,-62)→(0,-90)）の外の急な斜面で、護りが本人より二〜三m 低く散り、突きが届かず段②の本人の討ち取りが0だった。道の上へ
const LOOK = { x: -14, z: 0 };       // 柵の内、物見の台の下（城を望む所）
const MOUTH = { x: 0, z: -16 };      // 柵の口の前の野
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

export function active(rt) { const H = rt.flags.iwHiru; return !!H && !H.night; }   // 日が暮れて夜の段へ渡すまで
export function stage(rt) { const H = rt.flags.iwHiru; return !H || H.s < 2 ? 0 : 1; }
export function label(rt) { const H = rt.flags.iwHiru; return !H ? '' : ['本陣へ', '物見の台へ', '麓の小荷駄へ', '麓の小荷駄へ', '柵の口へ'][H.s] ?? '柵の口へ'; }
export function pin(rt) {
  const H = rt.flags.iwHiru;
  if (!H) return null;
  if (H.s === 0) return HONJIN;
  if (H.s === 1) return LOOK;
  // 出撃の知らせを待つ間と日暮れの間も、麓・柵の口の印を保つ。
  const goal = H.s === 2 || H.s === 3 ? KOMODA : MOUTH;
  // 11/18 持ち主 クラウド：出撃は最後の折れ（x 10〜15・z -34、口の二十歩下）で止まり、口で待つ本人と刃を交えないまま退いていた
  //   （act bot の位置の記録 docs/evidence_cloud_1118/iwamura/hiru_kuchi/）。止まった寄せの先頭を指し、本人を坂の口の前へ下ろす。
  if (H.s >= 5 && H.g && !H.g.routed) {
    const foe = leadFoe(H.g, rt.world);
    if (foe) { H.foePin ??= { x: 0, z: 0 }; H.foePin.x = foe.pos.x; H.foePin.z = foe.pos.z; return H.foePin; }
  }
  // 麓を直に指すと切岸を横切る。昼も追撃と同じ九十九折りを往復する。
  if ((H.s === 2 || H.s === 4) && !near(rt.player.u.pos, goal, 5)) {
    guideRoad(H.s === 2 ? H.down : H.up, rt.player.u.pos, H.guide);
    return H.guide;
  }
  return goal;
}

// 口から十二〜二十八歩の先にいる、口に一番近い寄せ手（口に届いた手や遠い麓の手は指さない）
// 11/18 17:35 持ち主 クラウド：act bot 1730「156秒 行き先（歩けない地面）」＝切岸の上に立つ寄せ手をピンに指していた。歩けない地面の者は指さない。
function leadFoe(g, W) {
  let best = null, bd = Infinity;
  for (const u of g.units) {
    if (!u.alive || u.fleeing || u.gone || u.noTarget) continue;
    if (W?.walkable && W.walkable(u.pos.x, u.pos.z) === false) continue;
    const d = Math.hypot(u.pos.x - MOUTH.x, u.pos.z - MOUTH.z);
    if (d < bd) { bd = d; best = u; }
  }
  return bd > 12 && bd < 28 ? best : null;
}

// 11/10 関所の3：案内の点（guideRoad）は本人の四歩先なので、見せる▼が「着いた」扱いで山道の間ずっと消えていた。
//   画面の印は夜の追撃と同じく、山道の次の折れ（六歩より先）を指す。bot の足取りは pin() の細かい案内のまま。
const signAt = { x: 0, z: 0 };
export function signPin(rt) {
  const H = rt.flags.iwHiru;
  if (!H || H.s !== 2 && H.s !== 4) return pin(rt);
  const goal = H.s === 2 ? KOMODA : MOUTH, path = H.s === 2 ? H.down : H.up, p = rt.player.u.pos;
  if (near(p, goal, 5)) return goal;
  let bi = 1, bd = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t);
    if (d < bd) { bd = d; bi = i; }
  }
  for (let i = bi; i < path.length; i++) {
    const c = path[i];
    if (i === path.length - 1 || Math.hypot(c[0] - p.x, c[1] - p.z) > 6) { signAt.x = c[0]; signAt.z = c[1]; return signAt; }
  }
  return goal;
}

// 11/10 関所の3：麓の小荷駄の護りに着くと、道の案内の点が足元になって行き先の印が消え、護りにも▼が付かなかった。
//   麓へ近づいたら、見える高さの護り（人足は除く）の一人を行き先にする。
export function signTarget(rt) {
  const H = rt.flags.iwHiru, me = rt.player.u;
  if (!H || H.s !== 2 || !H.esc || !near(me.pos, KOMODA, 24)) return null;
  let best = null, bd = Infinity;
  for (const u of H.esc.units) {
    if (!u.alive || u.dying || u.gone || u.fleeing || u.woundOut || u.rearWound || u.downed ||
        u.hp <= 0 || u.mesh?.visible === false || u.noTarget || u.type === 'porter' || Math.abs(u.pos.y - me.pos.y) > 4) continue;
    // 切岸や柵越しの護りへ誘わず、見失った時は通れる山道の案内を残す。
    if (rt.army.wallBetween?.(me.pos, -1, u.pos) || rt.army.terrainBlocks?.(me.pos, u.pos)) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

// 味方の組を山道（九十九折り）に沿って歩かせ、着いたらそこで敵に掛からせる
function walk(rt, g, path, at) {
  if (!g || g.routed || !(g.count > 0) || !path?.length) return;
  // 守りの組も出発の下知を優先する。横隊のままでは折れの後列が切岸を横切る。
  g.guard = false; g.guardOn = false; g.noGuard = true; g.stay = false;
  // 11/18 03:25 持ち主 クラウド：下知が共通の使番（script_orders）に回され、信忠の本陣から使番が着くまで組は柵の内で hold に戻されていた
  //   （act bot：本人が麓で戦う間、二組とも (10,-10)・(-7,-14) から動かず、本人の十五歩内の味方0）。この下知はそばの河尻が自ら出す。
  g.directOrders = true;
  g.noAI = true; g.noHunt = true; g.noFrontline = true; g.fixed = false;
  g.formation = 'column'; g.roadColumn = true; g.followColumnRoad = true; g.colW = 2; g._fitAt = 0;
  g.order = 'path'; g.pathIdx = 0; g.path = path.map((q) => [q[0], q[1]]); g.dest = null; g.focus = null;
  g.iwChaseCheck = { x: g.anchor.x, z: g.anchor.z, t: rt.t };
  g.iwChaseFrom = { x: 0, y: 0, z: 0 }; g.iwChaseTo = { x: 0, y: 0, z: 0 };
  g.iwMarchAt = rt.t;
  // 麓の護りは本人の手で崩す物：下ろした組は脇を固めて刃を浅く（組が先に八人を討ち、本人の討ち取りが2に減った act bot 11/18）。口へ戻る時は元の刃に
  if (at === KOMODA) { g.iwDmg ??= g.dmgMult ?? 1; g.dmgMult = 0.3; } else if (g.iwDmg != null) { g.dmgMult = g.iwDmg; g.iwDmg = null; }
  g.onArrive = (q) => { q.anchor = { x: at.x, z: at.z }; q.order = 'attack'; q.seekRange = 20; q.aggro = 12; };
}
function sendDown(rt, path) {
  const me = rt.player.u, out = [];
  // 名のある者の隊（信忠の旗本など）は本陣に残す。山道を下ろすと九十九折りで一点に重なった（act bot 11/13）。本人から 45m 内の名無しの組だけ
  const gs = rt.army.groups.filter((g) => { if (g.team !== me.team || g.isPlayerSquad || g.routed || g.count < 4 || g.units.some((u) => u.isPlayer || u.name)) return false; const c = g.center(); return Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < 45; });
  gs.sort((a, b) => { const ca = a.center(), cb = b.center(); return Math.hypot(ca.x - me.pos.x, ca.z - me.pos.z) - Math.hypot(cb.x - me.pos.x, cb.z - me.pos.z); });
  for (const g of gs.slice(0, 2)) { walk(rt, g, path, KOMODA); out.push(g); }
  return out;
}

// 折れのすぐ外から遠い次の角を狙うと切岸を横切る。
// 昼の往復は最寄りの区間の四歩先を示し、曲がり角を細かくたどる。
function guideRoad(path, p, out) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (len * len)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d > best) continue;
    best = d;
    const ahead = d > 3 ? t : Math.min(1, t + 4 / len);
    out.x = a[0] + dx * ahead; out.z = a[1] + dz * ahead;
    if (d <= 3 && Math.hypot(p.x - b[0], p.z - b[1]) < 3 && i + 1 < path.length) {
      const c = path[i + 1], nextLen = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const step = Math.min(1, 4 / (nextLen || 1));
      out.x = b[0] + (c[0] - b[0]) * step; out.z = b[1] + (c[1] - b[1]) * step;
    }
  }
}

// ctx：{ road（九十九折り）, guideRoad（道に沿う案内）, done（夜の段へ） }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.iwHiru) return;
  const H = F.iwHiru = { s: 0, at: rt.t, ctx, done: false };
  // 昼に外した夜討ち勢も、途中で戦を出る時は通常の片付けへ返す。
  const dispose = rt.dispose;
  rt.dispose = function () { restoreNight(rt, H); return dispose.call(this); };
  // 小荷駄より先へ下りず、戻る時も口の前で止まる。配列は始まりに一度だけ作る。
  H.down = [];
  for (let i = 0; i < ctx.road.length; i++) {
    const q = ctx.road[i];
    if (q[1] <= KOMODA.z) {
      const a = ctx.road[i - 1], t = (KOMODA.z - a[1]) / (q[1] - a[1]);
      H.down.push([a[0] + (q[0] - a[0]) * t, KOMODA.z]);
      break;
    }
    H.down.push(q);
  }
  H.down.push([KOMODA.x, KOMODA.z]);
  H.up = H.down.slice().reverse();
  const end = H.up.findIndex((q) => q[1] > MOUTH.z);
  if (end > 0) {
    const a = H.up[end - 1], b = H.up[end], t = (MOUTH.z - a[1]) / (b[1] - a[1]);
    H.up.splice(end, H.up.length - end, [a[0] + (b[0] - a[0]) * t, MOUTH.z]);
  }
  H.up.push([MOUTH.x, MOUTH.z]);
  H.guide = { x: 0, z: 0 };
  rt.world.setTime('day');
  // 11/18 クラウド19 見回り：陣の土と霜の斑は月夜で読める明るさに決めてあり、昼の冬の日では白い砂浜の無地に飛んだ。
  //   昼の段の間だけ地面の材質の色を落とし、日が暮れたら b_iwamura.js の夜へ移る所で 1 に戻す。
  if (rt.world.terrain?.material?.color) rt.world.terrain.material.color.setRGB(0.56, 0.54, 0.52);
  //   地面の低い靄（夜の霧の分）も昼の日では明るい膜になって土を白くするので、昼の段の間は薄く（W.def はこの戦の写し）。
  rt.world.def.groundMistScale = 0.25;
  rt.obj('main', GOALS[0], 'main', true);   // 右上と行き先の札（無いと「組のそばで槍を構えよ」の待ちの札が出た）
  rt.marker('iwHiru', () => pin(rt) || rt.player.u.pos, '', { guideAlways: true });
  rt.after(1.5, () => rt.say('河尻秀隆', '信忠様が本陣でお呼びじゃ。行くぞ', 3.2));
}

// 昼に加わる手も初期数と残数へ一緒に入れ、倒れた分を上の兵数へ反映する。
function countForce(rt, g, ally = false) {
  // 昼の兵糧入れと出撃も、夜の手と同じく決めた道と下知で動かす。
  // 共通の前線補充で護りを麓から抜いたり、次の寄せを陣の奥へ送らせない。
  g.noFrontline = true; g.noAI = true; g.noHunt = true;
  const F = rt.flags, groups = ally ? F.fieldAllies : F.rearGroups;
  if (!groups || groups.includes(g)) return;
  groups.push(g);
  const key = ally ? 'forceA0' : 'forceB0';
  F[key] += g.units.length;
}

function sally(rt, H, n) {
  // 夜の追撃と同じ九十九折りを逆に登る。麓から口への直線は切岸を横切る。
  const path = H.ctx.road.slice().reverse();
  // 柵の内まで登らず、口の前で列を開く。最後の折れの途中も道から外さない。
  const endZ = MOUTH.z - 4;
  const end = path.findIndex((q) => q[1] > endZ);
  if (end > 0) {
    const a = path[end - 1], b = path[end], t = (endZ - a[1]) / (b[1] - a[1]);
    path.splice(end, path.length - end, [a[0] + (b[0] - a[0]) * t, endZ]);
  }
  // 折れの東端で横隊へ広がると、後列が道脇へ斜めに進んで止まる。
  // 口の前の中央まで縦隊で運び、通れる寄せ場で列を開く。
  path.push([MOUTH.x, MOUTH.z]);
  // 11/18 持ち主 クラウド：麓（z -90）から出ると最後の折れまで三十秒かかった。一つ目の折れ（z -62 あたり）から登らせる。
  const first = path.findIndex((q) => q[1] > -66);
  if (first > 0) path.splice(0, first);
  // 11/18 夜50-29：一つ目の折れ（-20,-62）には夜の殿（麓の道を守る武田勢・昼は休ませて止めたまま）が立っている。
  //   そこから出た手は殿の体に塞がれて二十〜四十秒動けず、要だけが口へ先走り、口に一人も来ないまま退いていた（描かずの流し）。
  //   殿の輪の外（折れから道に沿って十歩先）から登らせる。
  const guard = (rt.flags.roadGuards || []).find((g) => Math.hypot(g.anchor.x - path[0][0], g.anchor.z - path[0][1]) < 8);
  if (guard && path.length > 1) {
    const [ax, az] = path[0], [bx, bz] = path[1], L = Math.hypot(bx - ax, bz - az) || 1, k = Math.min(10, L * 0.5) / L;
    path[0] = [ax + (bx - ax) * k, az + (bz - az) * k];
  }
  const [x, z] = path[0];
  const g = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: n === 1 ? '城方の出撃' : n === 2 ? '城方の二の手' : '大島杢之助の手', fixed: true, noGuard: true,
    anchor: { x, z }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, seekRange: 14, width: 2, spacing: 1.8, formation: 'column', morale: 100, noRout: true, speed: 3.4 },
  n === 1 ? [{ type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 9, o: { flag: 'takeda' } }]
    : n === 2 ? [{ type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }, { type: 'gun', n: 2, o: { flag: 'takeda' } }]
    // 三の手は城の侍大将・大島杢之助が率いる（後に開城の礼に出て磔にされる三将の一人。ここでは討たれずに退く）
      : [{ type: 'busho', n: 1, o: { name: '大島杢之助', flag: 'takeda' } }, { type: 'samurai', n: 3, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }]);
  countForce(rt, g);
  g.roadColumn = true; g.followColumnRoad = true; g.colW = 2;
  // 夜討ちと同じく、先頭の死傷や後列待ちで山道に止まった列を歩き直す。
  g.fixed = false;
  g.iwChaseCheck = { x: g.anchor.x, z: g.anchor.z, t: rt.t };
  g.iwChaseFrom = { x: 0, y: 0, z: 0 }; g.iwChaseTo = { x: 0, y: 0, z: 0 };
  g.order = 'path'; g.pathIdx = 1; g.dest = null; g.path = path;
  g.iwMarchAt = rt.t;
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'line'; q.width = 10; q.seekRange = 40; q.aggro = 40; };
  // 11/9 二巡（織田H）：杢之助を invuln にすると、斬りかかっても傷がつかず「不死身」に見えた。
  //   傷は付くが、深手（命の四割）になると討たれる前に城へ退く（開城の礼に出る三将の一人なので、ここでは死なせない）。
  if (n === 3) {
    const lead = g.units.find((u) => u.name === '大島杢之助');
    // 定期の見張りの間に致命傷を受けても、後日の捕縛と食い違う討死にしない。
    // 味方の攻撃も傷として通し、共通の手傷の入口から同じ山道へ退かせる。
    const withdraw = () => {
      if (!lead || !lead.alive || lead.noTarget || rt.over || rt.flags.ending) return;
      retreatRoad(g, H.ctx.retreat || H.ctx.road, lead);
      lead.noTarget = true; lead.fleeing = true; lead.target = null; lead.atk = null; lead.swing = null; lead.aiT = 0;
      rt.say('物見', '杢之助が深手を負うて、城へ退くぞ！', 3);
    };
    if (lead) { lead.invuln = true; lead.allyOk = true; lead.mustLive = true; lead.onWound = withdraw; }
    const watch = () => {
      if (!lead || !lead.alive || lead.noTarget || rt.over || rt.flags.ending) return;
      if (lead.hp <= lead.maxHp * 0.4) {
        withdraw();
        return;
      }
      rt.after(0.3, watch, true);
    };
    rt.after(0.3, watch, true);
  }
  return g;
}
// 深手で離脱した者は戦力に残さない。一時的に転んだ者は起きるので数える。
const fighting = (u) => u.alive && u.hp > 0 && !u.gone && !u.noTarget && !u.fleeing && !u.woundOut && !u.rearWound;
function standing(g, guardsOnly = false) {
  let n = 0;
  for (const u of g.units) if (fighting(u) && (!guardsOnly || u.type !== 'porter')) n++;
  return n;
}
// 進みが変わった時だけ既存の任務札を更新し、携帯で毎コマ札を作り直さない。
function progress(rt, H, text) {
  if (H.progress === text) return;
  H.progress = text;
  rt.objProgress('main', text);
}
// 昼の援護も寄せ手と同じ道を歩き直す。後列の遅れで麓に取り残さない。
function march(rt, H, g) {
  if (!g || g.routed || g.order !== 'path' || !g.path?.length || !g.onArrive ||
      rt.t < (g.iwMarchAt ?? 0) + 0.5) return;
  g.iwMarchAt = rt.t;
  // 11/18 夜50-29：山道を下りて迎えに出た本人のすぐ脇を、登る手（大島杢之助の手）が縦隊のまま六秒以上素通りした（act bot『すぐそばの敵がなにもしない』）。
  //   本人が道の上で列の誰かと七歩以内・同じ高さで向き合ったら、その場で列を開いて打ちかかる。
  const P = rt.player?.u;
  if (P?.alive && g.units.some((u) => fighting(u) && !u.gone && !u.noTarget && !u.downed &&
      Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 7 && Math.abs(u.pos.y - P.pos.y) < 2.5 &&
      !rt.army.wallBetween(u.pos, -1, P.pos) && !rt.army.terrainBlocks(u.pos, P.pos))) {
    const deploy = g.onArrive; g.onArrive = null; g.anchor.x = P.pos.x; g.anchor.z = P.pos.z; deploy(g);
    return;
  }
  H.ctx.march?.(g, 0.5);
  const end = g.path[Math.min(g.pathIdx, g.path.length - 1)];
  if (Math.hypot(g.anchor.x - end[0], g.anchor.z - end[1]) >= 1.5 ||
      !g.units.some((u) => fighting(u) && !u.gone && !u.noTarget && !u.downed &&
        Math.hypot(u.pos.x - end[0], u.pos.z - end[1]) < 5)) return;
  if (g.pathIdx < g.path.length - 1) g.pathIdx++;
  else { const deploy = g.onArrive; g.onArrive = null; deploy(g); }
}
// 11/18 15:45 持ち主 クラウド（岩村）：口へ着いた組（要と先頭が口で onArrive）の後れが、口から五十歩下の山道で
//   的も行き先も無く六十秒立っていた（見回り k365-cloud-32・act bot 91秒 (-13,-10)・140秒 (21,-66)）。
//   着いた後も、口から十四歩より遠く的の無い者は九十九折りの次の折れへ歩かせる（直に寄せると切岸に詰まる）。
function catchUp(rt, H, g, at) {
  if (!g || g.routed || g.order === 'path' || !g.count || rt.t < (g.iwCatchAt ?? 0)) return;
  g.iwCatchAt = rt.t + 1;
  const road = H.up, ay = H.mouthY ??= rt.world.heightAt(at.x, at.z);
  for (const u of g.units) {
    if (!fighting(u) || u.downed || u.target || u.atk) continue;
    if (Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 14 && Math.abs(u.pos.y - ay) < 3) continue;
    let best = Infinity, next = road.length - 1;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1], len = dx * dx + dz * dz;
      const t = len ? Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len)) : 0;
      const d = Math.hypot(u.pos.x - a[0] - dx * t, u.pos.z - a[1] - dz * t);
      if (d < best) { best = d; next = i; }
    }
    let q = road[next];
    if (Math.hypot(u.pos.x - q[0], u.pos.z - q[1]) < 2 && next < road.length - 1) q = road[next + 1];
    // 道から外れた段の縁（z -66 の東）で歩けず四秒動かない者は、本人から四十歩より遠ければ道の上の一番近い所へ寄せる（act bot 15:48 の流しで 143〜472秒 立った）
    const moved = u.iwCatchP ? Math.hypot(u.pos.x - u.iwCatchP.x, u.pos.z - u.iwCatchP.z) : 9;
    if (moved > 1) { u.iwCatchP = { x: u.pos.x, z: u.pos.z }; u.iwCatchN = 0; } else u.iwCatchN = (u.iwCatchN || 0) + 1;
    const P = rt.player?.u?.pos;
    if (u.iwCatchN >= 4 && P && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 40) {
      const a = road[next - 1], b = road[next], dx = b[0] - a[0], dz = b[1] - a[1], len = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len));
      // 一息で飛ばさない（act bot「兵が一息で飛んだ」）：一秒に一歩半ずつ道へ寄せる
      const ex = a[0] + dx * t - u.pos.x, ez = a[1] + dz * t - u.pos.z, ed = Math.hypot(ex, ez) || 1, st = Math.min(1.5, ed);
      u.pos.x += ex / ed * st; u.pos.z += ez / ed * st; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      u.iwCatchN = 3; u.iwCatchP = { x: u.pos.x, z: u.pos.z };
    }
    // 11/18 16:50 持ち主 クラウド（岩村）：口から十五歩の柵の際 (-13,-9) で、口へ歩けず行き先のまま二十秒立つ者がいた（act bot 85秒・前の回の残り①）。
    //   口と同じ高さで二十歩内なら、四秒動けなければ着いた事にしてその場で構えさせる。
    if (u.iwCatchN >= 4 && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 20 && Math.abs(u.pos.y - ay) < 3) { u.moveTo = null; continue; }
    u.moveTo = { x: q[0], z: q[1] }; u.aiT = 1.2;
  }
}
// 昼の敗走も、登って来た九十九折りを城へ戻る。直進では切岸に詰まる。
// 各兵が今いる道の区間から先へ進め、麓や通過済みの折れへ飛ばさない。
function retreatRoad(g, road, only = null) {
  g.fleePath = road;
  for (const u of g.units) {
    if (!u.alive || only && u !== only) continue;
    let best = Infinity, next = 0;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = dx * dx + dz * dz;
      const t = len ? Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len)) : 0;
      const d = Math.hypot(u.pos.x - a[0] - dx * t, u.pos.z - a[1] - dz * t);
      if (d < best) { best = d; next = i; }
    }
    u.fleePathIdx = next;
  }
}
function rout(g, road) {
  retreatRoad(g, road);
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.focus = null; g.fleeDir = { x: 0, z: -1 };
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
}

function restoreNight(rt, H) {
  for (const g of H.hidden || []) {
    const saved = g?.iwDayPark;
    if (!saved) continue;
    g.order = saved.order; g.noAI = saved.noAI; g.noHunt = saved.noHunt;
    g.aggro = saved.aggro; g.seekRange = saved.seekRange;
    delete g.iwDayPark;
    for (const u of g.units) {
      rt.army.units.push(u);
      u.noTarget = u._iwDay; delete u._iwDay;
      if (u.mesh && u.alive) u.mesh.visible = true;
    }
  }
}

// 夜討ち勢は元の場所で待機し、昼の戦闘・押し合いの計算には入れない。
export function tick(rt, hidden = []) {
  const F = rt.flags, H = F.iwHiru;
  // 昼が済んだ後も、口へ着いた組の後れは道沿いに口へ寄せる（夜の段の間 山道の段の縁に立ったまま残っていた）
  if (H?.done && !F.ending && H.up) for (const g of H.help || []) catchUp(rt, H, g, MOUTH);
  if (!H || H.done || F.ending) return;
  // 11/18 18:40 持ち主 クラウド（岩村）：描かずの足跡で、号令「突撃」の組が麓の荷駄の護りの逃げる者を追って
  //   本人から七十m 先の城の登り口（z−100〜−110）まで下り、木戸の城兵に一人ずつ討たれ、夜討ちの前に組が尽きていた（act bot「突撃したが組が戦列を離れている」）。
  //   昼の間、本人から二十六m より離れた組の者は、逃げる敵や遠い敵を追わず本人の後ろへ戻る
  const P = rt.player.u;
  if (P?.alive && rt.t >= (H.sqLeashAt ?? 0)) {
    H.sqLeashAt = rt.t + 0.5;
    for (const g of rt.squadGroups || []) for (const u of g.units) {
      if (!u.alive || u.gone || u.fleeing || u.isPlayer) continue;
      if (Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 26) continue;
      const t = u.target;
      if (t && !t.fleeing && Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) < 20) continue;
      u.target = null; u.watch = null; u.atk = null; u.aiT = 1.2;
      u.moveTo = { x: P.pos.x - Math.sin(P.heading || 0) * 5, z: P.pos.z - Math.cos(P.heading || 0) * 5 };
    }
  }
  // 休ませる手が同じ間は、外した全兵の非表示を毎コマ設定し直さない。
  if (H.hidden !== hidden) for (const g of hidden) {
    if (!g) continue;
    // 遠方へ移して戻すと、夜の始まりに兵が数百歩飛ぶ。
    // 位置は変えず、昼だけ更新対象から外せば道も塞がず計算も増えない。
    if (!g.iwDayPark) {
      g.iwDayPark = { order: g.order,
        noAI: g.noAI, noHunt: g.noHunt, aggro: g.aggro, seekRange: g.seekRange };
      for (const u of g.units) {
        const i = rt.army.units.indexOf(u);
        if (i >= 0) rt.army.units.splice(i, 1);
        u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
      }
      g.order = 'hold'; g.noAI = true; g.noHunt = true; g.aggro = 0; g.seekRange = 0;
    }
    for (const u of g.units) {
      if (!u.alive) continue;
      if (u._iwDay === undefined) u._iwDay = !!u.noTarget;
      u.noTarget = true; if (u.mesh) u.mesh.visible = false;
    }
  }
  H.hidden = hidden;
  for (const g of H.help || []) march(rt, H, g);
  if (H.s >= 4) for (const g of H.help || []) catchUp(rt, H, g, MOUTH);
  const p = rt.player.u.pos, T = rt.t - H.at;
  // 新手は装束の手本から「守り」も写す。攻めの下知と食い違う守りを外し、山道は縦隊で通す。
  if (rt.t >= (H.reserveAt || 0)) {
    H.reserveAt = rt.t + 1;
    for (const g of rt.army.groups) {
      if (g.team !== rt.player.u.team || !(g._rsv || g.isReserve) || g.iwHiruReserve) continue;
      g.iwHiruReserve = true;
      g.guard = false; g.guardOn = false; g.noGuard = true; g.noAI = true;
      g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true; g._fitAt = 0;
    }
  }
  // 今の手への命中と、昼の戦いへの参加を分けて記録する。立って待つだけで任務を済ませない。
  const swing = rt.player.u.swing;
  const opponent = H.s === 2 ? H.esc : H.s === 5 ? H.g : null;
  if (opponent && swing?.target?.group === opponent && swing.res && swing.res !== 'miss') {
    H.fought = true;
    H.foughtDay = true;
  }
  // ① 本陣で信忠の下知
  if (H.s === 0) {
    if (near(p, HONJIN, 7)) {
      H.s = 1; H.at = rt.t;
      rt.say('織田信忠', '城の兵糧は尽きかけておる。夜に紛れて兵糧を入れようとするはず。一粒も入れるな', 4.2);
      rt.after(4.6, () => rt.say('河尻秀隆', 'はっ。……柵ぞいに物見の台の下へ。城を見ておけ', 3.4));
    }
    return;
  }
  // ② 物見の台の下から城を望む。麓に兵糧入れの小荷駄が見つかる
  if (H.s === 1) {
    if (T < 8) return;
    if (near(p, LOOK, 6)) {
      H.s = 2; H.at = rt.t;
      rt.obj('main', GOALS[1], 'main', true);
      rt.say('河尻秀隆', 'あれが岩村城じゃ。秋山虎繁と、信長様の叔母御のおつやの方が籠る', 4);
      rt.after(4.4, () => rt.say('河尻秀隆', '囲んで五月。城の兵糧は尽きかけておる', 3));
      rt.after(8, () => {
        if (F.ending || H.done) return;
        rt.say('物見', '麓の搦手道に小荷駄！　昼のうちに兵糧を入れる気です', 3.4);
        rt.after(3.6, () => rt.say('河尻秀隆', '組を連れて麓へ駆けよ。俵を城へ入れさせるな！', 3.2));
        H.help = sendDown(rt, H.down);   // 本人に近い味方の二組を九十九折りで麓へ下ろし、護りに掛からせる
        H.esc = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: '兵糧入れの護り', fixed: true, noGuard: true, anchor: KOMODA, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 5, seekRange: 7, guard: true, guardLeash: 8, width: 4, spacing: 1.4, formation: 'yari', morale: 100, noRout: true, speed: 3.2 },
          [{ type: 'samurai', n: 1, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }, { type: 'porter', n: 3, o: { flag: null } }]);
        countForce(rt, H.esc);
        H.esc.order = 'hold';
        // 11/13 クラウドH：act bot が二回とも、組より先に麓へ着いた本人が護り八人に一人で斬られ53秒で倒れた（一太刀25）。護りの刃は浅く（荷を守る兵で、討ち取りに来る兵ではない）
        H.esc.dmgMult = 0.45;
        for (const u of H.esc.units) if (u.type === 'porter') u.noTarget = true;
        H.escN = H.esc.units.filter((u) => u.type !== 'porter').length;
        // 11/13 MB係四：act bot が麓で八人の護りに一人で囲まれ、一度も突けずに 58 秒で倒れた（待つ備なしでも同じ）。
        //   「組を連れて麓へ」の下知どおり味方の二組を下ろす（下の H.help）。護りは荷駄の脇で受け、八人が一度に本人へ寄らない（aggro 10→5）
      });
    }
    return;
  }
  // ③ 麓の兵糧入れ。護りを崩すと人足は俵を捨てて城へ逃げる
  if (H.s === 2) {
    if (!H.esc) return;
    // 護りは荷駄のそばで受ける。坂の上の本人を追って折れの切岸へ集まらない。
    // 11/13 クラウドH：act bot で護りが本人を麓から十八m 上の坂まで追い、組から離れた本人を囲んで倒した。荷駄から十m を越えた護りは荷へ戻す
    for (const u of H.esc.units) if (fighting(u) && u.type !== 'porter' && !u.downed && Math.hypot(u.pos.x - KOMODA.x, u.pos.z - KOMODA.z) > 10) {
      u.target = null;
      u.moveTo = u.iwKomodaReturn || (u.iwKomodaReturn = { x: KOMODA.x, z: KOMODA.z });
    }
    // 11/14 クラウドゆ act bot：味方の二組より先に麓へ着いた本人が護りに一太刀二割五分〜三割で続けて斬られ67秒で倒れた（組の dmgMult は共通の床で効かない）。
    //   命が六割を切った間は、本人へ同時に打ち込む護りを一人までにする（味方の組が着くまでの間）
    // 11/16 クラウドす：act bot が組より先に麓へ着くと、命が六割へ落ちる前の二人掛かりで55秒で倒れていた（11/16 02:20）。
    //   下ろした味方の組が荷駄から十五m へ着くまでは、命に関わらず一人までにする（出だしを緩める）
    // 一度来た味方が倒れたり退いた後も「援護あり」にしない。
    // 切岸の上や転倒中の兵では、麓で一人になった本人を守れない。
    H.komodaY ??= rt.world.heightAt(KOMODA.x, KOMODA.z);
    H.helpIn = (H.help || []).some((g) => !g.routed && g.units.some((u) => fighting(u) && !u.downed &&
      Math.hypot(u.pos.x - KOMODA.x, u.pos.z - KOMODA.z) < 15 && Math.abs(u.pos.y - H.komodaY) < 3 &&
      !rt.army.wallBetween(p, -1, u.pos) && !rt.army.terrainBlocks(p, u.pos)));
    if (rt.world?.def) rt.world.def.playerAtkMax = !H.helpIn || rt.player.u.hp < rt.player.u.maxHp * 0.6 ? 1 : 2;
    const left = standing(H.esc, true);
    progress(rt, H, `麓の小荷駄へ。護りを崩せ（${H.escN - left}／${H.escN}）`);
    // 待ち時間では兵糧入れを止めた事にしない。護りを実際に崩し、麓へ出た本人が確かめる。
    // 11/10 クラウドの流し（携帯の bot）：槍衾で構えた護りに突きが通らず、麓で千秒斬り合って日が暮れなかった。
    //   本人が護りに攻撃を当て、九十秒で一人でも崩したか、百五十秒戦えば残る護りも退く。
    // 麓を離れた時間を受け止めた時間へ足さない。戻っただけで護りを退かせない。
    if (near(p, KOMODA, 18)) H.komAt ??= rt.t;
    else H.komAt = null;
    const komT = H.komAt == null ? 0 : rt.t - H.komAt;
    // 11/13 MB係四：下ろした味方の二組と共に戦うので、麓で九十秒（一人崩せば四十五秒）で護りは退く（act bot：この段に 640 秒かかった）
    // 11/14 imac-own4 描かずの通し：麓の坂は急で、本人と護りの高さが三m 以上違い、bot も護りも刃を交えず五百秒が過ぎた。
    //   麓に二分居続けたら、下ろした味方の組と押した事にして護りは退く（K203 立つだけでも物語は進む）。
    const worn = H.fought && (komT > 90 || komT > 45 && left < H.escN) || komT > 90 || rt.t - H.at > 110;   // 11/18 長さ合わせ：150→110   // 11/16 p100：120・240→90・150（昼の段が四分を越えた）
    if (left > Math.ceil(H.escN * 0.25) && !worn || !near(p, KOMODA, 18) && rt.t - H.at < 200) return;   // 11/18 ヤ三：麓へ寄らない本人でも200秒で進む（act bot が (1,-16) で止まり段②が260秒）
    rout(H.esc, H.ctx.retreat || H.ctx.road);
    H.s = 3; H.at = rt.t; H.fought = false;
    rt.say('足軽', '人足が俵を捨てて逃げたぞ！', 2.6);
    // 11/18 14:45 持ち主 クラウド：act bot の記録で本人の組が麓の荷駄の斬り合い（99秒ごろ）で組ごと崩れ（routed）、夜討ちでも号令に付かなかった（組全体の敗走は共通の立て直しが戻さない）。
    //   荷駄を止めた勝ちの所で、傷の浅い逃げた者は得物を取り直して本人の組へ戻る（深手・得物を捨てた者は戻さない）。
    for (const g of rt.squadGroups || []) {
      if (!g.count) continue;
      let back = 0;
      for (const u of g.units) {
        if (!u.alive || u.gone || !u.fleeing || u.woundOut || u.rearWound || u.dropped || u.wpnKind === 'none' || u.downed || u.hp < u.maxHp * 0.35) continue;
        u.fleeing = false; u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; u.routIn = undefined;
        u.squadRallyTo = null; u.squadRallySince = null; u.moveTo = null; u.target = null; u.atk = null; u.confused = 0; u.aiT = 0.2 + Math.random() * 0.8;
        back++;
      }
      if (back || g.routed) { g.routed = false; g.wavered = false; g.morale = Math.max(g.morale, 60); if (g.order === 'flee') g.order = 'follow'; }
    }
    rt.after(3, () => {
      if (F.ending || H.done) return;
      try { sfx('taiko', 0.9); } catch (e) { /* なし */ }
      rt.say('物見', '城の木戸が開いた！　城方が打って出ます！', 3);
      rt.after(3.2, () => rt.say('河尻秀隆', '麓で囲まれるな。柵の口まで退け！', 3));
      H.s = 4; H.at = rt.t;
      for (const g of H.help || []) walk(rt, g, H.up, MOUTH);   // 麓へ下ろした組も柵の口へ戻す
      // 11/18 持ち主 クラウド（岩村）：「退け」の下知の後も本人の組が「突撃」のまま坂の中ほど（z−56）で打って出た城方と斬り合い、
      //   本人が口へ戻った後に組が尽きた（描かずの足跡 153〜193秒）。退きの下知で本人の組も本人に付いて口へ戻る
      for (const g of rt.squadGroups || []) if (g.count && g.order === 'attack') {
        g.order = 'follow'; g.focus = null;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.isPlayer) { u.target = null; u.watch = null; u.aiT = 0.3 + Math.random() * 0.5; }
      }
      rt.objProgress('main', '山道を戻り、柵の口で城方を迎えよ');
    });
    return;
  }
  if (H.s === 3) return;
  // ④ 柵の口まで退くと、城方の出撃が口の前の野へ寄せる
  if (H.s === 4) {
    // 11/18 16:30 持ち主 クラウド（岩村）：口に着いてから一の手を出すと、一つ目の折れ（z -60）から口まで七十歩を登る間（81〜113秒）本人が口で三十秒ひとりだった。
    //   本人が一つ目の折れより上へ登ったら、すぐ後ろ（下の折れ）から一の手を打って出させる（「城方が打って出ます」の通り、退く本人を追って登る）。
    if (near(p, MOUTH, 10) || rt.t - H.at > 2 && p.z > -52 && p.z < MOUTH.z + 4) {
      H.s = 5; H.at = rt.t;
      try { sfx('toki', 0.8); } catch (e) { /* なし */ }
      H.g = sally(rt, H, 1); H.n = H.g.units.length; H.wave = 1; H.wt = rt.t;
      // 口を守る味方の槍（足軽十人）
      H.ally = allyGroup(rt, { faction: 'oda', name: '柵の口の槍組', fixed: true, noGuard: true, anchor: { x: MOUTH.x, z: -2 }, facing: Math.PI, width: 10, formation: 'line', aggro: 8, seekRange: 12 },
        [{ type: 'ashigaru', n: 10, o: { flag: 'oda' } }]);
      countForce(rt, H.ally, true);
      H.ally.order = 'move'; H.ally.dest = { x: MOUTH.x, z: MOUTH.z + 2 }; // 11/18 クラウド岩村：口の槍組が三十歩先まで駆け出て寄せ手を先に討ち、act bot は昼の段（178秒）で一人しか斬れなかった。
      //   槍組は口の前で槍衾を組んで受ける（十二歩）。寄せ手は口まで来て、本人と槍組が並んで斬り合う。
      H.ally.onArrive = (q) => { q.order = 'attack'; q.seekRange = 12; q.aggro = 8; };
      rt.say('河尻秀隆', '槍をそろえよ。口の前で受け止める！', 3);
    }
    return;
  }
  if (!H.g) return;
  // 後列が折れで遅れても、口に着いた先頭まで全員の到着を待たせない。
  // 途中の角では隊を開かず、最後の寄せ先に要と実兵が着いてから攻める。
  march(rt, H, H.g);
  const left = standing(H.g), holding = near(p, MOUTH, 27);   // 11/18：坂の口の前（二十歩下の折れ）で受けても口を守った事にする
  progress(rt, H, `柵の口で城方の${H.wave}の手を防げ（${H.n - left}／${H.n}）`);
  // 岩や折れで後列が止まっても、口を守った戦を永久に続けない。
  // 長引いた寄せは下知で退く。本人が口を離れたままでは次へ渡さない。
  if (!holding) H.holdAt = null;
  else if (H.holdAt == null) H.holdAt = rt.t;
  // 11/10 クラウドの流し（携帯の bot）：寄せ手が山道の岩や折れで止まり、口の前に一人も来ないまま本人が二百秒待った。
  //   昼の戦いに本人が加わった後、口を守っても寄せ手が来なければ、その寄せへ退く下知を出す。
  //   今の手への命中を必須にすると、全員が折れで止まった時には救済自体が働かない。
  // 切岸の下や柵の向こうの兵は、口へ届いた寄せに数えない。
  const mouth = H.mouth || (H.mouth = { ...MOUTH, y: rt.world.heightAt(MOUTH.x, MOUTH.z) });
  const close = H.g.units.some((u) => fighting(u) && !u.gone && !u.noTarget &&
    Math.hypot(u.pos.x - MOUTH.x, u.pos.z - MOUTH.z) < 25 && Math.abs(u.pos.y - mouth.y) < 4 &&
    !rt.army.wallBetween(mouth, -1, u.pos) && !rt.army.terrainBlocks(mouth, u.pos));
  // 11/18 夜50-29：描かずの流しで、一の手も三の手も一つ目の折れ（z -56）から登る途中で、出て三十秒の『口に寄せが来ない』退きに掛かり、
  //   本人と一度も刃を交えずに退いていた（口で六十秒待つだけ＝斬り合う相手が少ない）。列が道を登っている間は『来ない』に数えない。
  const climbing = H.g.order === 'path' && !!H.g.onArrive;
  if (close || !holding || climbing) H.farAt = null; else H.farAt ??= rt.t;
  // 二十五歩以内で止まった手も、今の手への命中を待ち続けない。
  // 昼の戦いに加わり、口を守り続けた本人には百五十秒で退く下知をつなぐ。
  // 11/16 p100：act bot で昼が234秒・討ち取り5＝寄せ手を斬り込ませ（aggro 8）、手の間16→8秒、退く時150→100・90→60秒
  const exhausted = H.foughtDay && rt.t - H.wt >= 100 && H.holdAt != null && rt.t - H.holdAt >= 30 ||
    H.foughtDay && rt.t - H.wt >= 40 && H.farAt != null && rt.t - H.farAt >= 25 ||
    // 11/14 imac-own4：刃を交えないまま口で待つ本人にも、一つの手は九十秒で退く（三手で昼が六分を越えない）
    rt.t - H.wt >= 60 && H.holdAt != null && rt.t - H.holdAt >= 20 ||
    // 11/18 クラウド kaito2（司令塔「岩村で bot が50秒立ち止まる」）：三の手が数人で崩れ、口の前に寄せ手がいないまま本人が手から六十秒待った（106〜186秒）。口に寄せが来ていなければ手から三十秒・空いて十五秒で退く
    rt.t - H.wt >= 30 && H.farAt != null && rt.t - H.farAt >= 15;
  if (!holding || left > Math.ceil(H.n * 0.35) && !exhausted) return;
  H.holdAt = null; H.farAt = null; H.fought = false;
  rout(H.g, H.ctx.retreat || H.ctx.road);
  if (H.wave < 3) {
    // 11/18 長さ合わせ（クラウド kaito2・一戦4〜7分）：昼が三つの手で四分近く（act bot の岩村 約600秒）。二の手を飛ばし、一の手の次は侍大将の三の手へ
    const w = 3;
    rt.say('河尻秀隆', w === 2 ? '退いたか。まだ来るぞ、口を空けるな！' : 'よし、退いたか。……旗が見えるか。次は侍大将じゃ', 3.2);
    H.g = null;
    rt.after(8, () => {
      if (F.ending || H.done) return;
      try { sfx('toki', 0.8); } catch (e) { /* なし */ }
      rt.say(w === 2 ? '物見' : '大島杢之助', w === 2 ? '二の手が坂を登って来ます。鉄砲も混じっております' : '岩村の意地を見せよ！　柵の口を破れ！', 3.2);
      H.g = sally(rt, H, w); H.n = H.g.units.length; H.wave = w; H.wt = rt.t;
    });
    return;
  }
  // 三の手も崩れた。日が暮れて夜の段へ
  H.g = null; H.done = true;
  rt.unmark('iwHiru');
  rt.award((t) => { t.side.push('昼、麓の兵糧入れを止め、柵の口の前で城方の出撃を三度押し返した'); }, '城方の出撃を押し返した', MOUTH);
  rt.say('河尻秀隆', 'よう押し返した。じきに日が暮れる。今夜は篝火を絶やすな', 3.6);
  // 夜討ちでは口の槍組が今までどおり三十歩まで迎え撃つ（昼の口の受けだけ十二歩。夜まで狭いと本人が囲まれて倒れた）
  if (H.ally) { H.ally.order = 'move'; H.ally.dest = { x: MOUTH.x, z: -1 }; H.ally.seekRange = 30; H.ally.aggro = 30; H.ally.onArrive = (q) => { q.order = 'hold'; q.seekRange = 30; q.aggro = 30; }; }
  rt.after(6, () => {
    if (F.ending) { H.night = true; return; }
    restoreNight(rt, H);
    rt.world.setTime('night');
    // 本人と配下を陣内へ飛ばさない。夜の支度にある帰陣の道標で
    // 柵の口を歩いて通り、そのまま篝火へ向かう。
    H.night = true;
    try { H.ctx.done(); } catch (e) { /* なし */ }
  });
}

// 昼の段の bot：近い敵を突き、いなければ金の▼へ
function onRoad(path, p) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < 6) return true;
  }
  return false;
}
export function bot(b, inp, { goTo, patientStrike }) {
  const p = b.player, u = p.u, H = b.flags.iwHiru;
  const road = H.s === 2 ? H.down : H.s === 4 ? H.up : null;
  // 今の任務の護り・寄せだけを持ち場で迎える。道外の別の備に隣接したまま
  // 突きを続け、麓へ戻る条件を満たせず刻限を迎えないようにする。
  const opponent = H.s === 2 && near(u.pos, KOMODA, 18) ? H.esc
    : H.s === 5 && near(u.pos, MOUTH, 18) ? H.g : null;
  const e = b.army.nearestEnemy?.(u, 18, (o) => !o.isStruct && !o.fleeing && !o.noTarget && o.alive &&
    !!opponent && o.group === opponent && !o.woundOut && !o.rearWound && !o.invuln &&
    (!road || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= 2.4 || onRoad(road, o.pos)) &&
    near(o.pos, H.s === 2 ? KOMODA : MOUTH, H.s === 2 ? 10 : 25) &&
    Math.abs(o.pos.y - u.pos.y) < (H.s === 2 ? 4.5 : 3) && !b.army.wallBetween(u.pos, -1, o.pos) &&   // 11/18 持ち主 クラウド：麓への道は急で、四〜五歩下の護りは三m 低い。寄れば届くので麓では四m半まで寄りに行く（折れで四十秒止まった）
    !b.army.terrainBlocks(u.pos, o.pos));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.runHeld = d > 6;
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2) patientStrike(p, inp, e, d);
    return;
  }
  if (p.lock) inp.e.add('KeyQ');
  inp.guardHold = (b.army.threats || []).some((o) => o.alive && !o.fleeing &&
    Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4 && Math.abs(o.pos.y - u.pos.y) < 2);   // 11/18 持ち主 クラウド：折れの切岸の下の護りに構えたまま道で四十秒止まった
  const q = pin(b);
  if (q) { inp.runHeld = true; goTo(p, inp, q.x, q.z, 1.2); }
}
