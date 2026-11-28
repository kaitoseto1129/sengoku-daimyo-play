// ======================================================================
// 小牧の対陣　⑥⑦の段「夜の出陣」（9〜15分）
//   ⑥夜、池田・森・堀・秀次の列が篝火を残して静かに出る。主人公は森勢の列と五条川の渡しへ。
//     途中、徳川の物見の小組と出会う（小さな斥候戦）。討ち漏らした一人が小牧山へ走る。
//   ⑦五条川を渡って夜明けの道を南東へ。使番「徳川勢、小牧山より動きました！」。小牧山の陣が動き出す（軽い作り）。
//     決着はつかない。見出し「徳川軍、追撃開始」→ 次の戦（小牧・長久手 二）へ続く。
// ======================================================================
import * as THREE from 'three';
import { enemyGroup, allyGroup } from '../bhelp.js';
import { moveSonae } from './depth.js';
import { dobei, yagura, nobori, dorui } from '../props.js';

function after(rt, t, run) {
  const stage = rt.flags.stage;
  const dawnAt = rt.flags.dawnAt;
  rt.after(t, () => {
    // 討死後・暗転中や徳川の出陣後に、古い行軍の下知を出さない。
    if (!rt.over && rt.player?.u?.alive !== false && !rt.flags.ending && !rt.flags.transitioning && rt.flags.stage === stage && rt.flags.dawnAt === dawnAt) run();
  });
}
function say(rt, who, s, t, sec = 3) {
  after(rt, t, () => rt.say(who, s, sec));
}
export const FORD = { x: 132, z: 30 };      // 五条川の渡し（⑥の行き先）
export const DAWN = { x: 146, z: 96 };      // 渡った先の南東の道（⑦の行き先）

export function startNight(rt, K) {
  const F = rt.flags, W = rt.world;
  // 出陣の札と日付が夜へ替わる時に、夕方の光を八秒残さない。
  try { W.dayClock = null; W.setTime('night', true); } catch (e) { /* 空はそのまま */ }
  // 夜討ちで点けた篝火を残す。同じ場所に火と光を重ねない。
  if (!F.campFiresLit) {
    for (const [x, z] of F.campFires || []) W.addFire(x, z, { h: 1.3, size: 0.6, lightRadius: 10, smoke: false });
    F.campFiresLit = true;
  }
  // 陣の間の備は帰す（本物の兵の枠を夜の列に回す）
  for (const g of [...(F.campBi || []), F.council, F.moriOrders, F.moriPrep, F.porters, F.sortie, F.kmPorters]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  // 11/18 夜50-35（位置の記録 400〜500秒）：砦の加勢の足軽の残り二人が、砦の北の回り道（path）のまま本人の百 m 後ろを歩き続けた。
  //   四十 m より遠くに残った加勢は砦の持ち場へ戻ったとみなして帰す（近くで共に歩く者は残す）
  if (F.men) { const P0 = rt.player.u.pos; for (const u of [...F.men.units]) if (u.alive && !u.gone && !u.isPlayer && Math.hypot(u.pos.x - P0.x, u.pos.z - P0.z) > 40) rt.army.despawn(u); }
  // 森勢の列（本物の兵）：主人公と五条川の渡しへ。松明は持たない
  F.moriG = allyGroup(rt, { name: '森長可の隊', fullStrength: true, anchor: { x: K.MORIJIN.x - 6, z: K.MORIJIN.z + 6 }, facing: 0, width: 6, formation: 'column', aggro: 8, seekRange: 12, speed: 2.8, order: 'move', noRout: true, dmgMult: 0.5 },
    K.fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true, invuln: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'tsuru'));
  F.moriG.dest = { x: FORD.x - 4, z: FORD.z - 6 };
  F.moriG.onArrive = (q) => { q.order = 'hold'; };
  F.ikedaG = allyGroup(rt, { name: '池田恒興の隊', fullStrength: true, anchor: { x: K.MORIJIN.x - 30, z: K.MORIJIN.z - 2 }, facing: 0, width: 6, formation: 'column', aggro: 8, seekRange: 12, speed: 2.6, order: 'move', noRout: true, dmgMult: 0.5 },
    K.fl([{ type: 'busho', n: 1, o: { name: '池田恒興', horse: true, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }], 'ageha'));
  F.ikedaG.dest = { x: FORD.x - 16, z: FORD.z - 10 };
  F.ikedaG.onArrive = (q) => { q.order = 'hold'; };
  // 行軍中は武将の押し出しや遠い敵への追従で列を渡しから逸らさない。
  for (const g of [F.moriG, F.ikedaG]) {
    g.march = true; g.keepMoveOrder = true;
    g.onArrive = (q) => { q.order = 'hold'; q.march = false; q.keepMoveOrder = false; };
  }
  // 本物の列だけでなく、森・池田の備も陣を払う。遠景を元の陣に残さない。
  moveSonae(rt, 'A', 'mori', FORD.x - 4, FORD.z - 6);
  moveSonae(rt, 'A', 'ikeda', FORD.x - 16, FORD.z - 10);
  // 池田元助の二の備も父の列に続く。中入り後も楽田に置き去りにしない。
  moveSonae(rt, 'A', 'motosuke', FORD.x - 24, FORD.z - 18);
  // 秀次・堀の列（遠景）も東へ動く
  moveSonae(rt, 'A', 'hidetsugu', 110, -70);
  moveSonae(rt, 'A', 'hori', 60, -40);
  rt.banner('四月六日　夜', '');
  say(rt, '森長可', '声を立てるな。馬の口を縛れ', 2, 2.8);
  say(rt, '使番', '孫七郎様の本隊、堀様の隊も続いて出られました', 24, 3);
  // 11/18 K306（一統記14巻 VOL.122）：中入りは前から徳川に漏れていた。家康は百姓の姿で列の歩き方を見たという
  say(rt, '足軽', '道端に菅笠の百姓が一人。夜更けに、じっと列を数えておった', 38, 3);
  say(rt, '森長可', '百姓など捨て置け。……いや、妙に目つきの鋭い奴じゃったな', 42, 3);
}
// 11/18 K358：本人が先へ駆けると森・池田の列が後ろに残り、渡しの斬り合いも夜明けの道も本人一人になった（874×402 の写真）。
//   本人が列の頭から十八 m より先へ出たら、列も駆け足で追う（行き先の下知はそのまま）
function keepUp(rt, K, canWait = true) {
  const F = rt.flags, P = rt.player.u.pos;
  if (rt.t - (F.colAt ?? -9) < 0.5) return;
  F.colAt = rt.t;
  for (const g of [F.moriG, F.ikedaG]) {
    if (!K.live(g)) continue;
    const c = g.center?.(); if (!c) continue;
    // 11/18 夜50-35（act bot の位置の記録・440秒）：列が本人より先に出て、渡しの手前四十七 m で待っていた＝本人は暗い野を一人で歩いた。
    //   先に出た時に駆け足で離れていたのは、前後を見ずに「十八 m 離れたら駆ける」だったため。行き先へ本人より十 m 以上近い（先にいる）列は、
    //   本人が十二 m の内へ来るまでその場で待ち、追いついたら行軍へ戻す
    const dd = g.dest || g._kuDest;
    const ahead = canWait && dd && Math.hypot(c.x - dd.x, c.z - dd.z) + 10 < Math.hypot(P.x - dd.x, P.z - dd.z) && Math.hypot(c.x - P.x, c.z - P.z) > 12;
    if (ahead && g.order === 'move') { g._kuDest = g.dest; g.order = 'hold'; g._kuWait = true; }
    else if (!ahead && g._kuWait) { g._kuWait = false; if (g.order === 'hold' && g._kuDest) { g.order = 'move'; g.dest = g._kuDest; } g._kuDest = null; }
    if (g._kuWait) continue;
    const far = Math.hypot(c.x - P.x, c.z - P.z) > 18;
    g.speed = far ? 4.6 : (g === F.moriG ? 2.8 : 2.6);
    for (const u of g.units) { if (u._run0 == null) u._run0 = u.run; u.run = far ? Math.max(u._run0 || 0, 4.6) : u._run0; }
  }
}
export function tickNight(rt, K, dt) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  keepUp(rt, K, !F.ambush);   // 渡しで撃たれた後は列を待たせず押し渡らせる
  // 道の半ばで徳川の物見と出会う（斥候戦）
  // 11/28 09時 クラウド 小牧の持ち主（K582）：act bot 547秒で⑥が98秒→物見の出る刻限を六十→四十秒・物見の離れを四十五→三十五秒に
  if (!F.scoutT && (Math.hypot(P.x - FORD.x, P.z - FORD.z) < 40 || el > 25)) {   // 11/28 10時 同：物見の出る刻限 四十→二十五秒
    F.scoutT = rt.t;
    // 11/18 08時 クラウド持ち主（描かずの通し）：物見が渡しの北 (122,44) に湧き、北西の野 (79,71) へ流れ、本人は列から七十五 m 離れて
    //   一人で追い、段6で本人の討ち取り0だった→本人の行く道の二十 m 先・小牧山の側（北西）に湧かせ、列の前で出会わせる。寄る範囲は二十 m。
    const fx = FORD.x - P.x, fz = FORD.z - P.z, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    const ahead = Math.min(20, fl * 0.6), sx = uz, sz = -ux, side = (sx * -1 + sz) >= 0 ? 8 : -8;
    const sAt = { x: P.x + ux * ahead + sx * side, z: P.z + uz * ahead + sz * side };
    F.tScout = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の物見', anchor: sAt, facing: Math.atan2(P.x - sAt.x, P.z - sAt.z), width: 5, formation: 'line', morale: 92, dmgMult: 0.35,
      order: 'attack', seekRange: 20, aggro: 18, speed: 3.6 }, K.dressT([{ type: 'samurai', n: 3, o: { horse: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }]));
    K.pushWave(F.tScout);
    // 11/19 06:10 クラウド 小牧の持ち主：act bot 段6 で本人の討ち取り0〜3（物見八人の大半を森・池田の列が先に討つ）→物見を八→十二人（徳川の物見の一手：騎馬三・徒六・鉄砲三）。
    //   描かずの通し（三秒ごと）：物見は本人に着いて三秒・三人討たれたところで士気（七十）が崩れて逃げた→士気を九十二に（討ち漏らしは段の決まりどおり一人だけ走る）。伏せ鉄砲も七十→八十五
    //   物見の間、森・池田の列は道を固め、寄って来た者だけを討つ（寄る範囲を十二→七 m。本人の組が前で斬り合う）
    for (const g of [F.moriG, F.ikedaG]) if (K.live(g)) { g._sr0 = g.seekRange; g.seekRange = 7; }
    // 目の前に湧かせない共通の決まり（guardSpawn）で出る所は闇の奥へずれる。そこから列の先の本人へ駆けて来させる（北西の野へ流さない）
    F.tScout.focus = rt.player.u; F.tScout.seekRange = 60;
    rt.say('森長可', '物見じゃ……！　一人も帰すな！', 2.6);
  }
  if (F.scoutT && !F.scoutDone && (K.resistingN(F.tScout) <= 1 || rt.t - F.scoutT > 28)) {
    F.scoutDone = rt.t;
    for (const g of [F.moriG, F.ikedaG]) if (g && g._sr0 != null) { g.seekRange = g._sr0; g._sr0 = null; }
    // 討ち漏らした一人が小牧山へ走る
    const last = F.tScout.units.find((u) => u.alive && !u.gone && !u.woundOut);
    if (last) { F.tScout.order = 'retreat'; F.tScout.dest = { x: K.HONJIN.x, z: 140 }; F.tScout.speed = 5; F.tScout.aggro = 0; F.tScout.seekRange = 0; }
    const slain = F.tScout.units.every((u) => !u.alive && u.hp <= 0);
    rt.say('足軽', last ? '物見が逃げた……小牧山の方へ！' : slain ? '徳川の物見を討ち取ったぞ！' : '徳川の物見は、もう向かって来ぬ！', 2.6);
    say(rt, '森長可', '構わぬ。夜が明ける前に川を越えるぞ', 3, 2.8);
  }
  // 渡しの手前の藪に伏せた物見の鉄砲（二度目の接触。渡る列を撃つ）
  // 11/28 09時 同：物見を払った所から渡しまでが遠く、伏兵の出る二十 m まで歩く間に段が延びた→三十 m で伏兵を出す
  if (F.scoutDone && !F.ambush && Math.hypot(P.x - FORD.x, P.z - FORD.z) < 30) {
    F.ambush = rt.t;
    F.tAmb = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の伏せ鉄砲', anchor: { x: FORD.x + 12, z: FORD.z + 16 }, facing: Math.PI, width: 5, formation: 'line', morale: 85, dmgMult: 0.3,
      // 11/18 08時 クラウド持ち主（描かずの通し）：共通の湧き隠し（guardSpawn）が伏兵を東の見えない壁の外へずらし、去らせて伏兵0人になった→藪に伏せたまま出す
      order: 'attack', seekRange: 30, aggro: 20, speed: 3.6, noGuard: true, ambush: true }, K.dressT([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 3 }]));
    K.pushWave(F.tAmb);
    F.ambushN = K.resistingN(F.tAmb);
    // 渡しの北で止まった列を、実際に撃ってきた川向こうへ押し渡らせる。
    // 主人公だけが伏兵を追い、森・池田の兵が岸で待ち続ける形にしない。
    for (const g of [F.moriG, F.ikedaG]) if (K.live(g)) {
      g.order = 'move'; g.seekRange = 24; g.march = true; g.keepMoveOrder = true; g.commanderPush = null;
      for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; }
      g.dest = { x: FORD.x + (g === F.ikedaG ? -4 : 8), z: FORD.z + 12 };
      g.onArrive = (q) => { q.order = 'attack'; q.march = false; q.keepMoveOrder = false; };
    }
    rt.army.play('volley', { x: FORD.x + 12, z: FORD.z + 16 }, 0.9);
    // 11/18 cloud-31：音だけの一斉射だった。渡しの五十歩内の徳川方の鉄砲が、渡る森・池田の列へ本当に撃つ（暗い藪に筒先の火と硝煙）。本人は狙わない
    { const A = rt.army, foes = [F.moriG, F.ikedaG].filter((g) => K.live(g));
      for (const g of A.groups) if (g.team === 1 && g.count && !g.routed) { const c = g.center(); if (Math.hypot(c.x - FORD.x - 12, c.z - FORD.z - 16) < 50) A.scriptSalvo?.(g, foes, 5); } }
    rt.say('森長可', '川向こうの藪から撃って来た！　押し渡って突け！', 2.8);
    say(rt, '池田恒興', '池田の列は上の浅瀬を渡る。森殿、下を頼む', 30, 3);
    // 後続はまだ北岸にいる。渡河済みとは知らせず、渡しへ続く備も実際に進める。
    moveSonae(rt, 'A', 'hidetsugu', FORD.x - 14, FORD.z - 14);
    moveSonae(rt, 'A', 'hori', FORD.x - 28, FORD.z - 22);
    say(rt, '使番', '孫七郎様の本隊、堀様の隊も渡しへ続いておりまする', 44, 3);
    say(rt, '森長可', '列を詰めよ。夜が明けるまでに一里は進むぞ', 56, 3);
  }
  if (F.ambush && Math.hypot(P.x - FORD.x, P.z - FORD.z) < 36) F.fordPress = (F.fordPress || 0) + dt;
  // 伏兵七人の最後の一、二人が藪や川岸に残っても、列を止め続けない。
  // 四分の一以上を崩せば二分で退く。藪の銃兵を討ち減らせなくても、渡しで四十五秒
  // 踏みとどまった後の二分半で物見は離脱する。渡しへ来ずに時を過ごすだけでは進まない。
  const ambushOff = F.ambush && (K.resistingN(F.tAmb) <= 1 ||
    (rt.t - F.ambush > 40 && F.fordPress >= 15 && K.resistingN(F.tAmb) <= F.ambushN * 0.75) ||
    (rt.t - F.ambush > 55 && F.fordPress >= 18));
  // 11/28 09時 同（act bot 549秒で⑥が121秒）：伏兵の離れを六十/八十→四十/五十五秒（踏みとどまる秒は十五/十八）
  // 11/18 クラウド持ち主：⑥が百四十秒・一戦が615秒で七分を越えた→物見の離れを六十→四十五秒・伏兵の離れを百二十/百五十→九十/百十五秒に
  // 11/28 08:30 UTC クラウド 小牧の持ち主（K582 一戦4〜7分）：act bot で⑥が113秒・一戦575秒→伏兵の離れを九十/百十五→六十/八十秒（渡しで踏みとどまる秒は二十/二十五）
  if (ambushOff && K.live(F.tAmb) && F.tAmb.order !== 'retreat' && F.tAmb.order !== 'flee') {
    F.tAmb.order = 'retreat'; F.tAmb.dest = { x: K.HONJIN.x, z: 140 };
    F.tAmb.aggro = 0; F.tAmb.seekRange = 0;
  }
  // 伏兵を退けて渡しに着いたら進む。段の開始からの時刻だけで足止めしない。
  // 11/28 09時 クラウド 小牧の持ち主（K582・act bot 602秒で⑥が176秒）：伏兵が退いた後、本人が逃げる伏兵を追って渡しの二十 m の外で斬り合い続けると段が延びた。
  //   退かせて四十秒を過ぎたら、渡しの六十 m 内で次の段へ（段2 の木戸と同じ手）
  const fordD = Math.hypot(P.x - FORD.x, P.z - FORD.z);
  if (ambushOff && !F.ambOffT) F.ambOffT = rt.t;
  if (F.ambush && rt.t - F.ambush > 25 && ambushOff && (fordD < 20 || (rt.t - F.ambOffT > 15 && fordD < 60))) {
    rt.award((t) => t.side.push('夜の道で徳川の物見を払い、五条川の渡しに着いた'), '五条川の渡しに着いた');
    K.next();
  }
}

export function startDawn(rt, K) {
  const F = rt.flags, W = rt.world;
  // 四月六日の夜から九日の朝へは暗転で日が飛ぶ。夜の照明を次の朝へ持ち越さない。
  try { W.dayClock = null; W.setTime('morning', true); } catch (e) { /* 空はそのまま */ }
  // 11/19 持ち主（430秒の写真：「夜明けの道」が真昼の白い空と強い日差しだった）：段の頭は東の低い朱の日と薄暗い野（夜が白む）にし、
  //   二十秒から四十秒かけて朝の光へ移ろわせる（池田「夜が白む」・日が昇る、の台詞と合わせる）。色の入れ物は段の頭に一度だけ作る
  try {
    const L = W.lookOf('morning');
    L.sky.lerp(new THREE.Color(0x9a8a90), 0.55); L.fog.lerp(new THREE.Color(0x8a7e86), 0.5);
    L.sun.set(0xffa868); L.sunI *= 0.55; L.hemiI *= 0.62; L.hemiSky.lerp(new THREE.Color(0x7e88a6), 0.5);
    L.sunDir.set(110, 9, 30).normalize(); L.top.lerp(new THREE.Color(0x3a4a6c), 0.6); L.glow.set(0xff8a50); L.glowK = Math.max(L.glowK || 0, 0.9); L.vis = Math.min(L.vis, 360);
    W.applyLook(L); W.updateEnv();
    rt.after(20, () => { if (W.timeKey === 'morning' && !W.fade) W.fade = { from: W.currentLook(), to: W.lookOf('morning'), fromNight: 0, fromDusk: 0, t: 0, dur: 40, env: 0 }; });
  } catch (e) { /* 朝の光のまま */ }
  for (const g of [F.moriG, F.ikedaG]) if (K.live(g)) {
    // 渡しでの交戦を終え、南東の道へ列を進める。古い狙いと武将の押し出しを引き継がない。
    g.order = 'move'; g.march = true; g.keepMoveOrder = true; g.commanderPush = null;
    g.dest = { x: DAWN.x - 6 - (g === F.ikedaG ? 14 : 0), z: DAWN.z - 8 }; g.speed = 2.8;
    for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; }
    g.onArrive = (q) => { q.order = 'hold'; q.march = false; q.keepMoveOrder = false; q.stay = true; };
  }
  moveSonae(rt, 'A', 'mori', DAWN.x - 6, DAWN.z - 8);
  moveSonae(rt, 'A', 'ikeda', DAWN.x - 20, DAWN.z - 8);
  moveSonae(rt, 'A', 'motosuke', DAWN.x - 28, DAWN.z - 16);
  moveSonae(rt, 'A', 'hidetsugu', DAWN.x - 14, DAWN.z + 12);
  moveSonae(rt, 'A', 'hori', FORD.x - 20, FORD.z + 10);
  say(rt, '池田恒興', '夜が白む。このまま岩崎城を抜いて岡崎へ', 3, 3);
  iwasaki(rt);
}
// 11/18 クラウド持ち主：⑦の台詞「岩崎城はもう目の前じゃ」の城が野に無かった。道の南の先（壁の外）に、
//   丹羽氏次の岩崎城（尾張の丘の上の土の城）を遠景で置く。板塀の曲輪・井楼・徳川方の幟・朝餉の煙。
//   出所：日進市の岩崎城跡（土塁・空堀の残る中世の平山城。天正十二年四月九日早朝、池田恒興の手に攻められ落ちた）。形は略復元。
export const IWASAKI = { x: 156, z: 168 };
function iwasaki(rt) {
  const F = rt.flags, W = rt.world;
  if (F.iwasakiBuilt || !W) return;
  F.iwasakiBuilt = true;
  const { x, z } = IWASAKI, hw = 13, hd = 9;
  const c = [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    if (i === 0) {   // 北（道の側）は大手の口を空ける
      rt.scene.add(dobei(W, [ax, az, x - 2.5, az], { ita: true }), dobei(W, [x + 2.5, az, bx, bz], { ita: true }));
    } else rt.scene.add(dobei(W, [ax, az, bx, bz], { ita: true }));
    // 11/18 クラウド持ち主（455秒の写真：平らな野に板の箱が置かれただけで城に見えない）：塀の外に土塁を盛る（岩崎城跡の土塁・空堀の丘の城）
    const nn = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
    rt.scene.add(dorui(W, [ax, az, bx, bz], nn[0], nn[1], { h: 1.6, w: 4.5, surfaceOnly: false }));
  }
  rt.scene.add(yagura(W, x + hw - 4, z - hd + 4, { team: 1, boarded: true, height: 8, name: '岩崎城の井楼' }));
  for (const [nx, nz] of [[x - hw + 2, z - hd - 1], [x - 4, z - hd - 1], [x + 4, z - hd - 1], [x + hw - 2, z - hd - 1], [x - hw + 2, z + 1]]) rt.scene.add(nobori(W, nx, nz, 'tokugawa', 7));
  if (W.addSmokeColumn) W.addSmokeColumn(x - 5, W.heightAt(x - 5, z + 3) + 2, z + 3, { size: 1.2 });
}
export function tickDawn(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  if (!F.dawnAt) keepUp(rt, K);
  // 渡った先の道で、別の戦線の知らせが続く（同じ時に別の所でも軍勢が動く）
  if (!F.dawnRep && !F.dawnAt && el > 6) {
    F.dawnRep = true;
    say(rt, '使番', '孫七郎様の本隊、白山林にて兵を休めておられまする', 6, 3.2);
    say(rt, '使番', '堀様の隊は檜ヶ根の辺り。後ろを固めておられます', 20, 3.2);
    say(rt, '足軽', '三河はまだ遠いのう……', 34, 2.6);
    say(rt, '使番', '楽田の筑前様、小牧山の動きに目を光らせておられまする', 48, 3.2);
    say(rt, '森長可', '岩崎城の丹羽氏重は小勢。ひと揉みで抜くぞ', 62, 3);
    say(rt, '池田恒興', '日が昇る。旗を巻け。三河の者に見られるな', 78, 3);
  }
  // 南東の道への到着で知らせを受ける。到着後に九十秒の時刻条件で待たせない。
  if (!F.dawnAt && Math.hypot(P.x - DAWN.x, P.z - DAWN.z) < 14) {
    F.dawnAt = rt.t;
    // 11/18 09時 クラウド持ち主（435秒の 874×402 の写真・位置の記録）：着いた時、森・池田の列は本人の十八〜二十六 m 後ろで止まり（行き先の手前で着いたとみなす）、
    //   締めの二十一秒は本人が夜明けの野に一人で立つ絵だった→着いたら列を本人の脇を抜けて南の岩崎城の方へ進ませる（壁 z=120 の内）
    for (const g of [F.moriG, F.ikedaG]) if (K.live(g)) {
      g.order = 'move'; g.march = true; g.keepMoveOrder = true; g.stay = false; g.commanderPush = null; g.speed = 3.2;
      g.dest = { x: DAWN.x - 6 - (g === F.ikedaG ? 12 : 0), z: DAWN.z + 18 };
      for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; }
      g.onArrive = (q) => { q.order = 'hold'; q.march = false; q.keepMoveOrder = false; q.stay = true; };
    }
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
      // 本多忠勝は小牧の留守を守る。追撃の知らせで留守居の備まで出さない。
      if (!s.bound && s.id !== 'honda') moveSonae(rt, 'B', s.id, s.x + 70, 118);
    }
    // 11/28 09時 クラウド 小牧の持ち主（K582・act bot 389秒：着いた後に六秒なにも起きない）：着いた後の触れを三秒おきに詰め、十三秒で⑧へ
    say(rt, '森長可', '気取られたか。……かまわぬ、前へ進め', 3.4, 3);
    say(rt, '三好信吉', '後ろは堀が守る。岡崎を目指せ', 6.6, 3);
    say(rt, '池田恒興', '追うて来るなら来い。岩崎城はもう目の前じゃ', 9.8, 3);
    after(rt, 11, () => rt.banner('徳川軍、追撃開始', ''));

  }
  // 到着後の途中の保存からも、残りの時刻で締めへ進む。
  // K652②（11/25 Sanae）：締めの前に⑧ 岩崎城の段へ（前は着いて二十一秒で勝ち）
  // 11/28 K564 クラウド小牧（act bot 452秒：着いた後の触れ〈十五秒の旗〉から段送りまでの六秒が空いた）→十七秒で⑧へ
  if (F.dawnAt && rt.t - F.dawnAt >= 13) K.next();
}
// ⑧（K652② 11/25 Sanae・kaito「全部の戦を10分ぐらいに」）：天正十二年四月九日の夜明け、岩崎城の丹羽氏重（十六歳）が、城の前を通る池田恒興の列へ鉄砲を撃ちかけ、
//   池田勢が城を攻め落とした（氏重は討死）。ここでは、城から打って出た丹羽の手を道の上で迎え撃つ（城そのものは壁の外の遠景のまま）。
export const IWA_ROAD = { x: 142, z: 108 };
export function startIwasaki(rt, K) {
  const F = rt.flags;
  F.iwaAt = rt.t; F.iwaDone = null;
  F.iwaGuns = enemyGroup(rt, { faction: 'tokugawa', name: '岩崎城の鉄砲', anchor: { x: 152, z: 117 }, facing: Math.PI, width: 6, formation: 'line', morale: 88, dmgMult: 0.25,
    order: 'attack', seekRange: 26, aggro: 22, speed: 3.4 }, K.dressT([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }]));
  K.pushWave(F.iwaGuns);
  rt.army.play('volley', { x: 152, z: 117 }, 1.2);
  rt.say('物見', '岩崎城から鉄砲じゃ！　列を撃って来る！', 3);
  say(rt, '池田恒興', '小城が嘗めた真似を。者ども、払え！', 3.5, 3);
  for (const g of [F.moriG, F.ikedaG]) if (K.live(g)) {
    g.order = 'attack'; g.march = false; g.keepMoveOrder = false; g.stay = false; g.aggro = 16; g.seekRange = 24;
  }
  // 11/28 K564 クラウド小牧（act bot：⑧の行き先に着いても六秒なにも起きない 431秒）：城から打って出る手は、二十四秒か、本人が道の行き先に着いた時の早い方
  // 11/28 09時 クラウド 小牧の持ち主（K582 一戦4〜7分）：act bot 547秒で⑧が85秒→打って出る刻限を二十四→十六秒・押し返しの最短を四十→三十秒・保険を百九十→百二十秒・勝ちまでの間を十三→十秒に
  after(rt, 16, () => iwaSallyOut(rt, K));
}
function iwaSallyOut(rt, K) {
  const F = rt.flags;
  if (F.iwaSally || F.ending || rt.over) return;
  {
    F.iwaSally = enemyGroup(rt, { faction: 'tokugawa', name: '丹羽氏重の手', anchor: { x: 146, z: 118 }, facing: Math.PI, width: 7, formation: 'line', morale: 92, dmgMult: 0.32,
      order: 'attack', seekRange: 30, aggro: 24, speed: 3.6 }, K.dressT([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }]));
    K.pushWave(F.iwaSally);
    rt.army.play('eshout', { x: 146, z: 116 }, 1.4);
    rt.say('使番', '城の門が開いた！　丹羽氏重、自ら打って出て来ます！', 3.4);
    say(rt, '森長可', '十六の若武者というぞ。侮るな', 6, 3);
  }
}
export function tickIwasaki(rt, K) {
  const F = rt.flags, el = rt.t - F.iwaAt, P = rt.player.u.pos;
  if (!F.iwaSally && el > 3 && Math.hypot(P.x - IWA_ROAD.x, P.z - IWA_ROAD.z) < 9) iwaSallyOut(rt, K);
  //   11/28 09時 同（act bot 549秒で⑧が107秒）：七十秒を過ぎて城の手の残りが五人までなら押し返した事にする・保険は九十秒
  if (F.iwaDone == null && F.iwaSally && ((el > 30 && K.resistingN(F.iwaGuns) <= 1 && K.resistingN(F.iwaSally) <= 2) ||
      (el > 40 && K.resistingN(F.iwaGuns) + K.resistingN(F.iwaSally) <= 5))) {
    F.iwaDone = rt.t;
    rt.army.play('toki', { x: 150, z: 116 }, 1);
    rt.say('池田恒興', '押し返した。このまま城へ攻め入れ。岩崎を抜いて三河へ', 3.4);
    say(rt, '使番', '岩崎城に池田の旗！　丹羽氏重、討死の由！', 4.5, 3.4);
    say(rt, '森長可', '……陽が昇ったか。三河はまだ遠い', 9, 3);
  }
  // 段の保険：刻限で味方の働きとして進む（敵の体力で延ばさない）
  // 11/28 10時 同（act bot 520秒で⑧が105秒・⑥が107秒）：押し返しの最短 五十→四十秒・保険 七十→五十五秒
  if (F.iwaDone == null && el > 55) F.iwaDone = rt.t;   // 09:30 同：⑧がまだ88秒→五十秒・保険七十秒
  if (F.iwaDone != null && rt.t - F.iwaDone >= 10) K.win();
}

