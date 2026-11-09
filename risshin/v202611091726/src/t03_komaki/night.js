// ======================================================================
// 小牧の対陣　⑥⑦の段「夜の出陣」（9〜15分）
//   ⑥夜、池田・森・堀・秀次の列が篝火を残して静かに出る。主人公は森勢の列と五条川の渡しへ。
//     途中、徳川の物見の小組と出会う（小さな斥候戦）。討ち漏らした一人が小牧山へ走る。
//   ⑦五条川を渡って夜明けの道を南東へ。使番「徳川勢、小牧山より動きました！」。小牧山の陣が動き出す（軽い作り）。
//     決着はつかない。見出し「徳川軍、追撃開始」→ 次の戦（小牧・長久手 二）へ続く。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { moveSonae } from './depth.js';

function say(rt, who, s, t, sec = 3) { rt.after(t, () => { if (!rt.flags.ending) rt.say(who, s, sec); }); }
export const FORD = { x: 132, z: 30 };      // 五条川の渡し（⑥の行き先）
export const DAWN = { x: 146, z: 96 };      // 渡った先の南東の道（⑦の行き先）

export function startNight(rt, K) {
  const F = rt.flags, W = rt.world;
  try { W.dayClock = null; W.setTime('night'); if (W.fade) W.fade.dur = 8; } catch (e) { /* 空はそのまま */ }
  // 夜討ちで点けた篝火を残す。同じ場所に火と光を重ねない。
  if (!F.campFiresLit) {
    for (const [x, z] of F.campFires || []) W.addFire(x, z, { h: 1.3, size: 0.6, lightRadius: 10, smoke: false });
    F.campFiresLit = true;
  }
  // 陣の間の備は帰す（本物の兵の枠を夜の列に回す）
  for (const g of [...(F.campBi || []), F.council, F.moriOrders, F.porters, F.sortie]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  // 森勢の列（本物の兵）：主人公と五条川の渡しへ。松明は持たない
  F.moriG = allyGroup(rt, { name: '森長可の隊', fullStrength: true, anchor: { x: K.MORIJIN.x - 6, z: K.MORIJIN.z + 6 }, facing: 0, width: 6, formation: 'column', aggro: 8, seekRange: 12, speed: 2.8, order: 'move', noRout: true, dmgMult: 0.5 },
    K.fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true, invuln: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'tsuru'));
  F.moriG.dest = { x: FORD.x - 4, z: FORD.z - 6 };
  F.moriG.onArrive = (q) => { q.order = 'hold'; };
  F.ikedaG = allyGroup(rt, { name: '池田恒興の隊', fullStrength: true, anchor: { x: K.MORIJIN.x - 30, z: K.MORIJIN.z - 2 }, facing: 0, width: 6, formation: 'column', aggro: 8, seekRange: 12, speed: 2.6, order: 'move', noRout: true, dmgMult: 0.5 },
    K.fl([{ type: 'busho', n: 1, o: { name: '池田恒興', horse: true, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }], 'ageha'));
  F.ikedaG.dest = { x: FORD.x - 16, z: FORD.z - 10 };
  F.ikedaG.onArrive = (q) => { q.order = 'hold'; };
  // 秀次・堀の列（遠景）も東へ動く
  moveSonae(rt, 'A', 'hidetsugu', 110, -70);
  moveSonae(rt, 'A', 'hori', 60, -40);
  rt.banner('四月六日　夜', '');
  say(rt, '森長可', '声を立てるな。馬の口を縛れ', 2, 2.8);
  say(rt, '使番', '孫七郎様の本隊、堀様の隊も続いて出られました', 24, 3);
}
export function tickNight(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  // 道の半ばで徳川の物見と出会う（斥候戦）
  if (!F.scoutT && (Math.hypot(P.x - FORD.x, P.z - FORD.z) < 40 || el > 60)) {
    F.scoutT = rt.t;
    F.tScout = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の物見', anchor: { x: FORD.x - 10, z: FORD.z + 14 }, facing: Math.PI, width: 5, formation: 'line', morale: 70, dmgMult: 0.35,
      order: 'attack', seekRange: 30, aggro: 18, speed: 3.6 }, K.dressT([{ type: 'samurai', n: 2, o: { horse: true } }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 2 }]));
    K.pushWave(F.tScout);
    rt.say('森長可', '物見じゃ……！　一人も帰すな！', 2.6);
  }
  if (F.scoutT && !F.scoutDone && (K.aliveN(F.tScout) <= 1 || rt.t - F.scoutT > 60)) {
    F.scoutDone = rt.t;
    // 討ち漏らした一人が小牧山へ走る
    const last = F.tScout.units.find((u) => u.alive && !u.gone);
    if (last) { F.tScout.order = 'retreat'; F.tScout.dest = { x: 60, z: 130 }; F.tScout.speed = 5; F.tScout.aggro = 0; F.tScout.seekRange = 0; }
    rt.say('足軽', last ? '物見が逃げた……小牧山の方へ！' : '徳川の物見を討ち取ったぞ！', 2.6);
    rt.after(3, () => rt.say('森長可', '構わぬ。夜が明ける前に川を越えるぞ', 2.8));
  }
  // 渡しの手前の藪に伏せた物見の鉄砲（二度目の接触。渡る列を撃つ）
  if (F.scoutDone && !F.ambush && Math.hypot(P.x - FORD.x, P.z - FORD.z) < 20) {
    F.ambush = rt.t;
    F.tAmb = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の伏せ鉄砲', anchor: { x: FORD.x + 12, z: FORD.z + 16 }, facing: Math.PI, width: 5, formation: 'line', morale: 70, dmgMult: 0.3,
      order: 'attack', seekRange: 30, aggro: 20, speed: 3.6 }, K.dressT([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 3 }]));
    K.pushWave(F.tAmb);
    rt.army.play('volley', { x: FORD.x + 12, z: FORD.z + 16 }, 0.9);
    rt.say('森長可', '川向こうの藪から撃って来た！　押し渡って突け！', 2.8);
    say(rt, '池田恒興', '池田の列は上の浅瀬を渡る。森殿、下を頼む', 30, 3);
    say(rt, '使番', '孫七郎様の本隊、無事に川を越えられました', 44, 3);
    say(rt, '森長可', '列を詰めよ。夜が明けるまでに一里は進むぞ', 56, 3);
  }
  if (F.ambush && Math.hypot(P.x - FORD.x, P.z - FORD.z) < 20 && rt.t - F.ambush > 25 && (!K.live(F.tAmb) || F.tAmb.routed || K.aliveN(F.tAmb) <= 1) && el > 140) {
    rt.award((t) => t.side.push('夜の道で徳川の物見を払い、五条川の渡しに着いた'), '五条川の渡しに着いた');
    K.next();
  }
}

export function startDawn(rt, K) {
  const F = rt.flags, W = rt.world;
  try { W.setTime('morning'); if (W.fade) W.fade.dur = 40; } catch (e) { /* 空はそのまま */ }
  for (const g of [F.moriG, F.ikedaG]) if (K.live(g)) { g.order = 'move'; g.dest = { x: DAWN.x - 6 - (g === F.ikedaG ? 14 : 0), z: DAWN.z - 8 }; g.speed = 2.8; g.onArrive = (q) => { q.order = 'hold'; }; }
  say(rt, '池田恒興', '夜が白む。このまま岩崎城を抜いて岡崎へ', 3, 3);
}
export function tickDawn(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  // 渡った先の道で、別の戦線の知らせが続く（同じ時に別の所でも軍勢が動く）
  if (!F.dawnRep && el > 6) {
    F.dawnRep = true;
    say(rt, '使番', '孫七郎様の本隊、白山林にて兵を休めておられまする', 6, 3.2);
    say(rt, '使番', '堀様の隊は檜ヶ根の辺り。後ろを固めておられます', 20, 3.2);
    say(rt, '足軽', '三河はまだ遠いのう……', 34, 2.6);
    say(rt, '使番', '楽田の筑前様、小牧山の動きに目を光らせておられまする', 48, 3.2);
    say(rt, '森長可', '岩崎城の丹羽氏重は小勢。ひと揉みで抜くぞ', 62, 3);
    say(rt, '池田恒興', '日が昇る。旗を巻け。三河の者に見られるな', 78, 3);
  }
  if (!F.dawnAt && Math.hypot(P.x - DAWN.x, P.z - DAWN.z) < 14 && el > 90) {
    F.dawnAt = rt.t;
    rt.army.play('horagai', { x: -80, z: 110 }, 0.8);
    rt.say('使番', '徳川勢、小牧山より動きました！　小幡城へ向かう由！', 3.4);
    // 小牧山の陣が動き出す（南東へ。軽い作り）
    // 軽い備の初めの位置は army.cx にある。群の position だけでは二組とも同じ地点へ集まる。
    for (const A of F.farToku || []) {
      if (!A?.army || !A.moveTo) continue;
      const at = A.army.off.clone();
      at.x += A.army.cx; at.z += A.army.cz;
      A.localToWorld(at);
      A.moveTo(at.x + 70, 118, 50);
    }
    for (const s of F.depth?.B?.sonae || []) {
      if (!s.bound) moveSonae(rt, 'B', s.id, s.x + 70, 118);
    }
    rt.after(4, () => rt.say('森長可', '気取られたか。……かまわぬ、前へ進め', 3));
    rt.after(8, () => rt.say('三好信吉', '後ろは堀が守る。岡崎を目指せ', 3));
    rt.after(15, () => { if (!rt.over) rt.banner('徳川軍、追撃開始', ''); });
    rt.after(12, () => rt.say('池田恒興', '追うて来るなら来い。岩崎城はもう目の前じゃ', 3));
    rt.after(21, () => K.win());
  }
}
