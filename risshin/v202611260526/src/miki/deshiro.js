// ======================================================================
// 三木城・大村の合戦 大村坂の後：城の二度目の出撃（約8分〜11分半）
// 構成：docs/oda15_plan_1108.md の 26（9〜12 三木城側出撃・包囲陣を守る）。
// 大村坂を取った後、城の門が開き、別所の手が手薄の平田の付城へ打って出る。
// 流れ：使番の急報 → 大村から平田へ駆け戻る（移る間：俵を担ぐ味方・秀吉の馬廻が追い越す）
//   → 木戸で一の寄せ（二十人）→ 城から鉄砲・二の寄せ（二十人）→ 退けたら段の終わり。
// 寄せ手は少数の本物の兵（本物の兵の総数が二百二十人を超える時は人数を減らす）。敵の体力は変えない。
// ======================================================================
import { sfx } from '../audio.js';
import { enemyGroup } from '../bhelp.js';
import { dress } from '../b_inabayama.js';
import { RANKS } from '../state.js';
import { chargeFujinBlocks } from '../mass_charge.js';   // K467

export const DESHIRO_LEN = 180;   // 長引いた時に木戸を守れているか確かめる秒

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.step >= 3) return;
  F.step = 3; F.stepT = rt.t;
  const S = (F.mkSally = { t0: rt.t, waves: [], w1: false, w2: false, arrived: false, done: false, said: {} });
  rt.setPhase('sally2'); rt.objProgress('main', '');
  rt.objDone('main');
  rt.unmark('omura'); rt.unzone('omura');
  rt.obj('main', '平田の付城へ戻り、木戸を守れ', 'main');
  sfx('horagai', 0.7);
  rt.army.playFar('taiko', ctx.castle, 0.8);
  rt.say('使番', '三木の城の門が開いた！　別所の手が、手薄の平田へ打って出たぞ！', 4.5);
  rt.after(5, () => { if (!rt.over && !F.ending && F.step === 3 && F.mkSally === S && !S.done) rt.say('羽柴秀吉', '大村は取った。者ども、平田へ駆け戻れ！　付城を一つも破らせるな', 4.5); });
  ctx.rally(rt);
  refill(rt);
  // 後備えそのものを二・三の寄せに使う。同じ寄せを別に増員しない。
  // 南岸の道に細い縦隊で控える。広い槍列の翼を川へはみ出させない。
  // 11/18 クラウド kaito2（歯ごたえ・act bot「無傷で25人」・描かずの数え 270〜360秒に本人の30m内の敵1〜3人）：後備えを厚く
  S.back = [backline(rt, ctx, -38, -46, 20), backline(rt, ctx, -26, -52, 16)];
}

// 11/18 見回り（クラウド25・act bot 387秒）：大村坂までの斬り合いで組が皆、逃げたか倒れたまま、この段の号令「突撃」が空を切った。
//   駆け戻る間に、平井山の陣から組の者を呼び直す（足りない分だけ・本人の後ろ）。組の居ない身分では何もしない
// 11/18 クラウド kaito2（act bot 325秒：寄せを厚くした後、組15人のうち11人が逃げたか傷で動けず「突撃」が空を切った）：
//   二の手・三の手の前にも、木戸の守り手から足りない分を組へ呼び直す。傷で退いた者も欠けに数える。本物の兵の上限は越えない
function refill(rt) {
  // 11/18 クラウドロ三（act bot：組29人のうち21人が逃げ散ったまま「突撃」が空を切る）：生きている組の者の逃げ・浅手の退きを呼び戻す（天王寺 K365 と同じ）
  for (const s of rt.squad || []) if (s.alive && !s.gone && !s.dying) {
    if (s.fleeing) { s.fleeing = false; s.moraleFleeDir = null; s.fright = 0; s.backUntil = 0; s.routIn = undefined; s.target = null; s.atk = null; }
    if (s.rearWound) s.rearWound = null;
    if (s.woundOut && s.woundOut.t !== Infinity && !s.invuln) { s.woundOut = null; s.noTarget = false; }
  }
  // 11/18 21:30 クラウド kaito2（act bot 359秒：組15人のうち13人が逃げ、組は五つとも order 'flee'・routed のまま。頭の無い呼び直しの組は
  //   士気二十二を割ると十秒の間にまた崩れた）：崩れの印と一緒に逃げの下知も外して本人に付かせ、この段の間は本人の組を崩れさせない（段の終わりに元へ）
  const S = rt.flags.mkSally;
  for (const g of rt.squadGroups || []) if (g.count) {
    if (S && !S.squadNoRout) S.squadNoRout = new Map();
    if (S && !S.squadNoRout.has(g)) { S.squadNoRout.set(g, g.noRout); g.noRout = true; }
    if (g.routed || g.order === 'flee') { g.order = 'follow'; g.fleeSet = false; g.fleeDir = null; }
    g.routed = false; g.morale = Math.max(g.morale || 0, 42);
  }
  steady(rt);
  const want = RANKS[rt.G?.rank]?.squad || 0;
  const able = rt.squad.filter((u) => u.alive && !u.downed && !u.fleeing && !u.woundOut && !u.evacuatedWound).length;
  let real = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct) real++;
  const n = Math.min(Math.max(0, want - able), Math.max(Math.min(8, want - able), 250 - real));
  if (want > 0 && n > 0) {
    const p = rt.player.u.pos, a = rt.player.yaw || 0;
    try { rt.makeSquad({ x: p.x - Math.sin(a) * 5, z: p.z - Math.cos(a) * 5 }, a, [{ kind: 'spear', n }]); } catch (e) { /* 呼べなければ今の組のまま */ }
  }
}

// 11/18 03:55 クラウド kaito2（act bot 678秒：出城の段で組の二十人が皆、士気0で逃げた）：大村坂の斬り合いで減った士気のまま木戸へ着き、
//   一の寄せですぐ崩れていた。付城の柵の内で守り手と並び直した組（崩れていない者）は、帰着と二・三の手の前に士気を七十まで戻す。逃げている者は共通の呼び戻しに任せる
function steady(rt) {
  const seen = new Set();
  for (const u of rt.squad) {
    const g = u.group;
    if (!g || seen.has(g) || g.routed || !u.alive || u.fleeing) continue;
    seen.add(g); g.morale = Math.max(g.morale || 0, 70); g.wavered = false;
  }
}

function backline(rt, ctx, x, z, n) {
  if (rt.world.walkable?.(x, z) === false) return null;
  let real = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct) real++;
  n = Math.min(n, Math.max(0, 220 - real));
  if (n < 4) return null;
  const g = enemyGroup(rt, { fixed: true, faction: 'bessho', name: '城から出た手の後備え', anchor: { x, z }, facing: -Math.PI / 2, formation: 'column', colW: 3, spacing: 1.1, roadColumn: true, arriveCount: 2, arriveRadius: 4, aggro: 12, seekRange: 16, fleeDir: { x: 1, z: 0.4 } },
    dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: n - 4 }, { type: 'bow', n: 2 }], ctx.bessho));
  g.order = 'hold'; g.stay = true; g.dmgMult = 0.45;
  return g;
}

// 控えた同じ兵を寄せ手に数え、倒れた者は補充しない。
function sendBack(rt, ctx, n) {
  const S = rt.flags.mkSally, g = S.back && S.back.shift();
  // 足場が無く控えを置けなかった時だけ、城から同じ規模の手を出す。
  if (!g) return wave(rt, ctx, n, 2);
  S.waves.push(g);
  if (ctx.gone(g)) return g;
  // 木戸の八歩手前で整列を終えず、守り手のいる木戸まで攻め寄せる。
  g.dmgMult = 1; g.stay = false; g.order = 'path'; g.path = [[ctx.gate.x, ctx.gate.z]]; g.pathIdx = 0; g.march = false;
  g.speed = Math.max(g.speed || 0, 3.2);
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.onArrive = null; q.seekRange = 40; q.focus = atPlayer(rt, ctx); q.gateT = rt.t; };
  return g;
}

// 木戸に着いた寄せ手は、木戸を守る本人へ真っ先に打ち掛かる（大村の三太夫の先手と同じ。本人が木戸を離れていれば木戸の守り手へ）
function atPlayer(rt, ctx) {
  const me = rt.player.u, G = ctx.gate;
  return me.alive && Math.hypot(me.pos.x - G.x, me.pos.z - G.z) < 25 ? me : null;
}

function wave(rt, ctx, n, bows) {
  const F = rt.flags;
  let real = 0; for (const u of rt.army.units) if (u.alive) real++;
  const room = Math.max(6, Math.min(n, 220 - real));
  const list = [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: Math.max(2, room - 2 - bows) }];
  if (bows) list.push({ type: 'bow', n: bows });
  const at = ctx.sallyFrom;
  const g = enemyGroup(rt, { fixed: true, faction: 'bessho', name: '城から出た別所勢', anchor: { x: at.x, z: at.z }, facing: -Math.PI / 2,
    formation: 'column', colW: 3, spacing: 1.1, roadColumn: true, arriveCount: 2, arriveRadius: 4, aggro: 12, fleeDir: { x: 1, z: 0.4 } },
  dress(list, ctx.bessho));
  g.order = 'path'; g.path = [[at.x, at.z], ...ctx.sallyPath.map((p) => p.slice())]; g.pathIdx = 0; g.march = false;
  // 浅瀬までの道順は保ち、最後だけ木戸の守備位置へ詰める。
  g.path[g.path.length - 1] = [ctx.gate.x, ctx.gate.z];
  g.speed = Math.max(g.speed || 0, 3.2);
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.march = false; q.onArrive = null; q.seekRange = Math.max(q.seekRange || 0, 40); q.focus = atPlayer(rt, ctx); q.gateT = rt.t; };
  F.mkSally.waves.push(g);
  return g;
}

// 遠くに残った弓兵一人で次の寄せを七十秒待たせない。後備えは数えない。
function wavesBroken(S, ctx) {
  let total = 0, fighting = 0;
  for (const g of S.waves) {
    total += g.units.length;
    if (ctx.gone(g)) continue;
    for (const u of g.units) if (u.alive && u.hp > 0 && !u.gone && !u.dying &&
      !u.fleeing && !u.woundOut && !u.evacuatedWound && !u.noTarget) fighting++;
  }
  return total > 0 && fighting <= Math.floor(total * .2);
}

// 毎コマ（半秒ごと）。段が終わったら true。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.mkSally;
  if (!S || S.done) return false;
  const t = rt.t - S.t0, p = rt.player.u.pos, G = ctx.gate;
  const once = (k, fn) => { if (!S.said[k]) { S.said[k] = true; fn(); } };
  // 11/18 クラウド kaito2（act bot「6分で6人・斬り合う相手が少なくて退屈」・味方の討ち取り86）：木戸の守り手と秀吉の手が寄せ手を先に討ち切っていた。
  //   寄せが来てからは、本人の組でない味方の刃を四割に（本人の前に斬り合う相手を残す。兵の数と敵の強さは変えない）。段の終わりに元へ
  if (S.w1 && !S.allyMult) {
    S.allyMult = new Map();
    for (const g of rt.army.groups) if (g.team === 0 && !g.isPlayerSquad && !g.civ) { S.allyMult.set(g, g.dmgMult); g.dmgMult = (g.dmgMult ?? 1) * 0.4; }
  }
  // 11/18 クラウドロ三（act bot 356秒：組25人のうち19人が逃げ・傷で動けず「突撃」が空を切る）：段の間、二十秒ごとに足りない分を呼び直す
  // 11/18 夜50-32（act bot 483・520秒：二十秒の間に組の十一〜十二人が崩れて逃げ、その間の「突撃」が空を切る）：十秒ごとに
  if (t >= 20 && t - (S.refillT || 0) >= 10) { S.refillT = t; refill(rt); }
  // 駆け戻る間の出来事
  if (t >= 18) once('tawara', () => rt.say('足軽', '荷駄の俵じゃ！　陣へ運べ、城へは一俵もやらぬ', 3));
  if (t >= 34) once('uma', () => { rt.army.playFar('hooves', p, 0.8); rt.say('使番', '秀吉様の馬廻が先に駆ける。平田の木戸で並べ！', 3.5); });
  // 11/18 19:30 クラウド kaito2（中学生 bot 2本：本人が木戸の東三十〜四十mで浅瀬から来る寄せ手と斬り合い、木戸の十八m内へは入らず
  //   「戻った」にならないまま段が414〜551秒に延びた）：寄せが出て二十秒たてば、木戸の四十五m内で受けていれば戻ったと見る
  const gd = Math.hypot(p.x - G.x, p.z - G.z);
  if (!S.arrived && (gd < 18 || S.w1 && rt.t - S.w1T >= 20 && gd < 45)) {
    S.arrived = true; S.arrivedT = rt.t; rt.say('組頭', 'よう戻った！　浅瀬を渡って来るぞ、木戸の前で槍をそろえよ', 4);
    // 先に木戸へ着いて味方と斬り合う一の寄せも、着いた本人へ向ける（寄せ手の着いた時に本人がまだ居なかった分）
    for (const g of S.waves) if (!ctx.gone(g) && g.order === 'attack' && !g.focus) g.focus = atPlayer(rt, ctx);
    steady(rt);
  }
  // 11/18 ス五（act bot 248秒：行き先の木戸の印に着いて六秒何も起きない）：印の七m内に着いたら一度だけ組頭が声を掛ける
  if (S.arrived && Math.hypot(p.x - G.x, p.z - G.z) < 7) once('atgate', () => rt.say('組頭', '木戸の前じゃ！　ここで受けよ、浅瀬の敵が来るぞ', 3.5));
  // 11/18 03:40 クラウド kaito2（描かずの数え：木戸に着いてから一の寄せが来るまで約四十五秒、本人の三十m内の敵0〜7）：
  //   城の口から木戸までは百二十mあり、帰着の後に出すと着くまで四十秒かかった。駆け戻りの初め（八秒）に城を出し、本人の帰着と同じ頃に木戸へ着かせる
  if (!S.w1 && (t >= 8 || S.arrived)) {
    S.w1 = true; S.w1T = rt.t;
    wave(rt, ctx, 20, 0);
    rt.army.playFar('toki', ctx.sallyFrom, 0.9);
    rt.say('物見', '城兵が浅瀬を渡る！　二十人ほど、木戸を目がけて来るぞ！', 3.5);
    rt.obj('main', '平田の木戸で、城から出た別所勢を退けよ', 'main');
    // 11/22 12:50 クラウド 三木の持ち主（K582・act bot --mobile 3本に1本：305秒 木戸で本人の寄0・敵36、「別所の城下の備 4」に囲まれ命96→0 を九秒）：
    //   味方の布陣の塊は大村坂に残り、木戸は本人一人だった。一の寄せと一緒に（二の手では着くのが遅く、本人から57m）、本人に近い味方の塊を三つ木戸の左右と後ろへ走り込ませる（兵は足さない・強さは同じ）
    { const me = rt.player.u, SF = ctx.sallyFrom, gl = Math.hypot(SF.x - ctx.gate.x, SF.z - ctx.gate.z) || 1, vx = SF.x - ctx.gate.x, vz = SF.z - ctx.gate.z, px = -vz / gl, pz = vx / gl;
      const mates = rt.army.groups.filter((g) => g._fjR && g.team === me.team && !g.isPlayerSquad && g.count >= 4 && !g.routed && !g.hidden && !g._charge)
        .map((g) => { const c = g.center(); return { g, d: Math.hypot(c.x - me.pos.x, c.z - me.pos.z) }; }).filter((q) => q.d < 220).sort((a, b) => a.d - b.d).slice(0, 3);
      mates.forEach(({ g }, i) => {
        const k = [1, -1, 0][i], back = i === 2 ? 5 : 0, a = { x: ctx.gate.x + px * k * 6 - vx / gl * back, z: ctx.gate.z + pz * k * 6 - vz / gl * back };
        g.allOutRun = true; g.order = 'hold'; g._charge = true; g.stay = true; g.dest = null; g.path = null; g.focus = null; g.onArrive = null;
        g.anchor = rt.world.walkable?.(a.x, a.z) === false ? { x: ctx.gate.x, z: ctx.gate.z } : a; g.aggro = 7; g.seekRange = 11; g._far = false; g.marching = false; g.noEngage = false;
      }); }
  }
  // 11/18 09:35 クラウド kaito2（act bot 489秒・POSLOG：本人が木戸へ早く戻ると、一の寄せがまだ浅瀬の道を歩き、木戸で敵0のまま三十秒立った）：
  //   本人が木戸に着いて四秒たっても道の上にいる寄せ手は、駆け足（毎秒4.4m）で木戸へ急がせる。人数・強さは変えない
  if (S.arrived && rt.t - S.arrivedT >= 4) for (const g of S.waves) if (!ctx.gone(g) && g.order === 'path' && !(g.speed >= 4.4)) g.speed = 4.4;
  // 11/18 14:25 クラウド kaito2（見回り 13:32 の POSLOG：一の寄せ16人が木戸で十秒のうちに12人まとめて背を向け、本人の討ち取りが段で3〜4）：
  //   木戸に着いて三十秒は、寄せ手の士気を三十六より下げない（崩れの境 22〜34 の上）。崩れなくはしない（noRout は追って散った）。三十秒の後は従来どおり崩れる
  for (const g of S.waves) if (!ctx.gone(g) && !g.routed && g.gateT != null && rt.t - g.gateT < 30) g.morale = Math.max(g.morale || 0, 36);
  // 二の寄せ：一の寄せが崩れるか、七十秒たったら。城の鉄砲が先に鳴る
  if (S.w1 && !S.w2 && (wavesBroken(S, ctx) && rt.t - S.w1T >= 25 || rt.t - S.w1T >= 45)) {
    S.w2 = true; S.w2T = rt.t;
    rt.army.playFar('volley', ctx.castle, 1);
    rt.after(1.5, () => { if (!rt.over && !F.ending && F.step === 3 && F.mkSally === S && !S.done) rt.army.playFar('volley', ctx.castle, 0.8); });
    sendBack(rt, ctx, 20); refill(rt);
    // 11/21 クラウド kaito2（K467：act の数えで本人の三十m 内の敵は平均19・布陣の塊の寄せ0）：二の手と一緒に、布陣の表の別所の塊を本人に近い順に四つ、木戸の前へ一度に走り込ませる（兵は足さない）
    // 11/22 09:40 クラウド 三木の持ち主（K582・act bot --mobile 3本に1本：264秒 木戸で本人が「別所の城下の備 4 一・二」と大村の別所勢に三方から囲まれ、
    //   命110→0 を六秒。塊の持ち場が木戸そのもので、四つの塊が本人の立つ所へ重なって寄せた）：持ち場の並びを木戸から城の側へ十m 出した所にする。
    //   四つ一度に走り込む・数・強さは同じ。本人の前に横一列の壁となって当たり、本人を中に包まない
    const SF = ctx.sallyFrom, gl = Math.hypot(SF.x - ctx.gate.x, SF.z - ctx.gate.z) || 1;
    const front = { x: ctx.gate.x + (SF.x - ctx.gate.x) / gl * 10, z: ctx.gate.z + (SF.z - ctx.gate.z) / gl * 10 };
    chargeFujinBlocks(rt, rt.world.walkable?.(front.x, front.z) === false ? ctx.gate : front, { n: 4, min: 4, maxD: 220 });
    rt.say('組頭', '城から鉄砲じゃ！　二の手が来る。列を崩すな！', 3.5);
  }
  // 三の寄せ：二の手が崩れるか七十秒たったら、火矢で付城の小屋を焼き、その煙に紛れて最後の手が来る（11/9 二巡：段を一つ厚く）
  if (S.w2 && !S.w3 && (wavesBroken(S, ctx) && rt.t - S.w2T >= 20 || rt.t - S.w2T >= 45)) {
    S.w3 = true; S.w3T = rt.t;
    const G = ctx.gate, fx = G.x + 6, fz = G.z - 10;
    S.fire = rt.world.addFire?.(fx, fz, { h: 1.5, size: 2.2 });
    rt.army.play('arrow', { x: fx, z: fz }, 1);
    rt.army.scriptArrows?.(1, { x: fx, z: fz }, 5);   // 11/18 cloud-31：音だけだった。城方の弓兵が付城の小屋へ火矢を射込む
    rt.say('足軽', '火矢じゃ！　付城の小屋が燃える！', 3);
    // 決着や次の段への移行後に、予約済みの出撃・声・音を残さない。
    rt.after(4, () => { if (!rt.over && !F.ending && F.step === 3 && F.mkSally === S && !S.done) { sendBack(rt, ctx, 16); refill(rt); rt.army.playFar('toki', ctx.sallyFrom, 0.9); rt.say('組頭', '煙に紛れて三の手じゃ！　木戸を渡すな！', 3.5); } });
    rt.after(60, () => { if (S.fire) { rt.world.removeFire?.(S.fire); S.fire = null; } });
  }
  // 主力を退けた後、浅瀬や柵に残った数人を探し続けさせない。
  // 本人の帰着と三の手の実際の出撃を待ち、残兵には城へ退く下知を出す。
  if (S.arrived && S.w3 && S.waves.length >= 3 && rt.t - S.w3T >= 70 && !S.retreatOrdered) {
    let remaining = 0, pressing = 0;
    for (const g of S.waves) for (const u of g.units) {
      if (u.alive && u.hp > 0 && !u.gone && !u.dying && !u.fleeing && !u.woundOut && !u.evacuatedWound && !u.noTarget) {
        remaining++;
        if (Math.hypot(u.pos.x - G.x, u.pos.z - G.z) < 30) pressing++;
      }
    }
    // 最後の寄せは百二十秒を上限にする。柵のそばに寄せ手が残っても、
    // 本人が生きて木戸を二十秒守り続ければ、攻めあぐねた城兵は退く。
    // 上限前は近くの寄せ手を退ける必要があり、木戸を離れた間は守備に数えない。
    const waveExpired = rt.t - S.w3T >= 120;
    if (t < DESHIRO_LEN || !rt.player.u.alive || Math.hypot(p.x - G.x, p.z - G.z) >= 18 || pressing && !waveExpired) S.heldSince = null;
    else if (S.heldSince == null) S.heldSince = rt.t;
    const held = S.heldSince != null && rt.t - S.heldSince >= 20;
    // 11/13 MB係四：寄せ手の弓が木戸から三十mより外で居座り、本人が追って木戸を離れるたびに守りの刻が消え、十八分たっても段が終わらなかった（Mac act bot 1080秒）。
    //   三の手から百二十秒たって木戸の三十m内に寄せ手がいなければ、または三の手から二百秒たてば、攻めあぐねた城兵は退く。
    const stale = rt.player.u.alive && t >= DESHIRO_LEN && (waveExpired && !pressing || rt.t - S.w3T >= 200);
    if (remaining <= 4 || held || stale) {
      S.retreatOrdered = true;
      for (const g of [...S.waves, ...(S.back || []), ...(S.sent || []), S.rear]) if (g && !ctx.gone(g)) ctx.flee(g);
      rt.say('物見', '城兵が三木城へ退いてゆくぞ！', 4);
    }
  }
  if (S.arrived && S.w3 && S.waves.length >= 3 && S.waves.every(ctx.gone) && rt.t - S.w3T >= 20) {
    once('won', () => rt.award((t2) => { if (!t2.side.includes('城の出撃から平田の付城を守った')) t2.side.push('城の出撃から平田の付城を守った'); }, '付城を守った'));
    S.done = true; backOff(rt, ctx, S); return true;
  }
  // 木戸を守り、残兵へ退却を命じた後だけ、退場待ちの足止めを解く。
  // 木戸へ一度戻っただけで、多数が残る守備を時間だけで達成にしない。
  if (S.arrived && S.retreatOrdered && S.w3 && S.waves.length >= 3 && rt.t - S.w3T >= 120 && t >= DESHIRO_LEN + 60 && rt.player.u.alive) {
    once('won', () => rt.award((t2) => { if (!t2.side.includes('城の出撃から平田の付城を守った')) t2.side.push('城の出撃から平田の付城を守った'); }, '付城を守った'));
    S.done = true; backOff(rt, ctx, S); return true;
  }
  if (t >= DESHIRO_LEN) {
    // 時間だけで敵を退かせて達成にしない。木戸への帰着と三度の寄せの決着を待つ。
    once('long', () => rt.say('組頭', '平田の木戸を守れ！　城兵を退けるまで持ち場を離れるな！', 4));
  }
  return false;
}

function backOff(rt, ctx, S) {
  if (S.allyMult) { for (const [g, m] of S.allyMult) g.dmgMult = m; S.allyMult = null; }
  if (S.squadNoRout) { for (const [g, v] of S.squadNoRout) g.noRout = v; S.squadNoRout = null; }
  // 11/18 21:35 クラウド kaito2（中学生 bot 430秒：木戸を守った後の飢えの段で、組11人のうち9人が四百m余り逃げたまま「突撃」が空を切る）：
  //   寄せを退けた勝ちの後は、逃げた組の者を本人の旗へ呼び戻す（崩れの印と逃げの下知も外す。数・強さは変えない）
  for (const u of rt.squad || []) if (u.alive && !u.gone && !u.dying && u.fleeing) { u.fleeing = false; u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; u.routIn = undefined; u.target = null; u.atk = null; }
  for (const g of rt.squadGroups || []) if (g.count && (g.routed || g.order === 'flee')) { g.routed = false; g.order = 'follow'; g.fleeSet = false; g.fleeDir = null; g.morale = Math.max(g.morale || 0, 60); }
  for (const g of [...(S.back || []), ...(S.sent || []), S.rear]) if (g && !ctx.gone(g)) ctx.flee(g); }

export function pin(rt, ctx) {
  const S = rt.flags.mkSally;
  return S && !S.done ? ctx.gate : null;
}
