// ======================================================================
// 道明寺の陣立ての厚みと流れ（kaito 11/8 docs/toku15_plan_1108.md の 13・docs/army_depth_spec_1108.md）
//   大和口の徳川方（三万四千）は国分の隘路に縦に連なり、伊達の本隊が後ろから着く。
//   又兵衛が果てると、すぐに使番「真田隊、来ます！」。西の遠くに赤い旗の大軍（真田・毛利）が土煙を上げて寄せ、
//   ④の誉田では伊達勢と鉄砲を撃ち合う（伊達の騎馬鉄砲も出る）。伊達は押し戻され、徳川も大きく損じる（圧勝にしない）。
//   ⑤では真田の騎馬が殿を斬り払い、豊臣方は大坂へ退く。徳川は疲れて追わない。
// 軽い大軍（addDistantArmy。兵力の数に入れない・本物に替えない）と、本物の騎馬を少し。
// 入れ方：setup の終わりで install(rt, def)。update の頭で tick(rt, dt)。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { allyGroup, enemyGroup } from '../bhelp.js';
import * as kerai from '../k12/kerai.js';

const WEST = -Math.PI / 2, EAST = Math.PI / 2;
const n = (a, b) => (isTouch ? a : b);
const HONDA = { x: -116, z: 26 };
// 弾切れや脇差への持替えは、射線が通っていても射撃戦に数えない。
const ranged = (u) => !u.mounted && !u.sidearm &&
  (u.weapon === 'gun' ? (u.gunAmmo ?? 20) > 0 : u.weapon === 'bow' && (u.arrowAmmo ?? 24) > 0);

export function install(rt, def) {
  const W = rt.world, F = rt.flags;
  const mk = (o) => { try { return W.addDistantArmy ? W.addDistantArmy({ host: false, farFill: true, kind: 'mixed', ...o, flagTex: flagTexture(o.flag) }) : null; } catch (e) { return null; } };
  const M = {
    // 国分の隘路の後続・水野の二の備は、陣立ての表（k13/depth.js・army_depth.js）が置く
  };
  // 負けを大きく見せる（徳川も大損害。兵の数の棒が大きく減る）。def.force は一度だけ包む
  if (!def._force0) def._force0 = def.force;
  def.force = (r) => { const o = def._force0(r); o.a = Math.max(0, o.a - Math.round(r.flags._loss13 || 0)); return o; };
  F._loss13 = 0;
  F._jin13 = { M, i: -9, def, mk };
  return F._jin13;
}

export function tick(rt, dt) {
  const F = rt.flags, st = F._jin13;
  if (!st) return;
  const D = F.dp, i = D && D.on ? D.i : (F.begun ? -1 : -2);
  const M = st.M;
  if (F.ending) {
    if (!st.end) {
      st.end = true;
      try { M.sana?.follow(null); M.sana?.moveTo(-250, 40, 50); M.mori?.moveTo(-250, -10, 50); M.dateH?.halt(); } catch (e) { /* 無くても進む */ }
    }
    return;
  }
  // 終戦後は護衛の迎撃・前進も止め、勝ちの下知で止めた追撃を再開しない。
  kerai.tick(rt, dt, {
    keepHold: (g) => g === F.tadateru || g === F.masamune,
    guns: () => (i >= 5 ? [F.katakura, F.date] : i <= 1 ? [F.mizuno, F.honda] : []),
  });
  // 本物の片倉隊が待ち伏せで押し戻された時、後ろの伊達勢も退く。
  // 段の始まりからの時刻だけでは、射撃を待っている間にも退いてしまう。
  if (!st.datePushed && F.pushedUntil > rt.t) {
    st.datePushed = true;
    try { M.dateH?.retreat(16, 10); } catch (e) { /* 無くても進む */ }
  }
  // 又兵衛が果てた直後：使番「真田隊、来ます！」。西の遠くに真田・毛利の大軍
  if (F.matabei && !st.sanadaCall) {
    st.sanadaCall = true;
    rt.after(5.5, () => {
      if (F.ending) return;
      rt.say('使番', '真田隊、来ます！　誉田の西に赤い旗と土煙！', 3.2);
      M.sana = st.mk({ x: -232, z: 44, w: 40, d: 14, count: n(150, 260), facing: EAST, team: 1, armor: 0x8e1f16, flag: 'sanada', seed: 13203 });
      M.mori = st.mk({ x: -232, z: -14, w: 36, d: 12, count: n(120, 200), facing: EAST, team: 1, armor: 0x2e2a26, flag: 'toyotomi', seed: 13204 });
      try { M.sana?.moveTo(-196, 46, 70); M.mori?.moveTo(-200, -6, 70); } catch (e) { /* 無くても進む */ }
    });
  }
  // 伊達の本隊が後ろに着く（片倉の鉄砲が先、政宗の旗本の後ろに大勢）
  // 軽い軍勢を作れない環境でも、毎コマ同じ生成を繰り返さない。
  if (F.date && !st.dateTried) {
    st.dateTried = true;
    M.dateH = st.mk({ x: 70, z: -30, w: 34, d: 12, count: n(120, 200), facing: WEST, armor: 0x24221f, flag: 'date', seed: 13205 });
  }
  // ④⑤の損害は、戦える両軍が交戦距離に入った時だけ数える。
  // 到着待ちや豊臣勢が退いた後まで、段の時刻だけで兵数を減らさない。
  if (i >= 5 && F._loss13 < 4200) {
    // 射線と近敵の総当たりは半秒ごと。段が替わったら前の交戦を引き継がない。
    if (st.lossStage !== i || rt.t >= (st.lossScanAt || 0)) {
      st.lossStage = i; st.lossScanAt = rt.t + 0.5;
      const active = (u) => u.alive && !u.fleeing && !u.gone && !u.woundOut &&
        !u.rearWound && !u.downed && !u.noTarget && !u.isStruct;
      st.fighting = D.cur.groups.some((g) => !g.routed && g.order !== 'retreat' &&
        g.order !== 'flee' && g.units.some((u) => active(u) &&
          rt.army.nearestEnemy(u, 42, (v) => active(v) &&
            (Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) <= 6 ||
              (ranged(u) && rt.army.coverBetween(u.pos, v.pos, u.team) > 0 && !rt.army.shotBlocked(u, v.pos)) ||
              (ranged(v) && rt.army.coverBetween(v.pos, u.pos, v.team) > 0 && !rt.army.shotBlocked(v, u.pos))))));
    }
    if (st.fighting) F._loss13 = Math.min(4200, F._loss13 + dt * 32);
  }
  // 鉄砲の音と硝煙は共通の実弾発射に任せる。装填中に音だけの斉射を重ねない。
  if (i === st.i) return;
  st.i = i;
  try {
    if (i === 3) {
      // ③の間に真田・毛利の大軍がじわりと誉田へ寄る（移動もできごとにする）
      M.sana?.moveTo(-178, 44, 90); M.mori?.moveTo(-184, -2, 90);
    } else if (i === 5) {
      // ④：伊達の本隊は誉田の東へ。真田・毛利の大軍は誉田陵の西に並ぶ。伊達の騎馬鉄砲が北の脇から
      M.dateH?.moveTo(HONDA.x + 60, HONDA.z - 30, 50);
      M.sana?.moveTo(-164, 44, 40); M.mori?.moveTo(-170, 0, 40);
      const C = allyGroup(rt, { faction: 'tokugawa', name: '伊達の騎馬鉄砲', fixed: true, anchor: { x: HONDA.x + 40, z: HONDA.z - 30 }, facing: WEST, width: 6, aggro: 14, order: 'attack', seekRange: 60, speed: 6, noRout: true, dmgMult: 0.8 },
        // 鉄砲兵は馬で寄せ、接敵したら下馬して撃つ。共通の射撃は本人以外の馬上射撃を通さない。
        [{ type: 'gun', n: n(5, 6), o: { horse: true, flag: 'date', armor: 0x24221f } }]);
      // cavalryRole は鉄砲兵を対象にしないため、実体に下馬の役割を渡す。
      for (const u of C.units) u.horseBattle = 'foot';
      C.anchor = { x: HONDA.x + 6, z: HONDA.z - 10 };
      rt.after(3, () => rt.say('伊達の侍', '騎馬鉄砲、駆けよ！　敵に寄せたら馬を降り、放て！', 2.6));
      // 神保相茂の手（水野勢に付いて誉田へ。史実では伊達の鉄砲に巻き込まれて討たれた）
      const J = allyGroup(rt, { faction: 'tokugawa', name: '神保相茂の手', fixed: true, anchor: { x: HONDA.x + 30, z: HONDA.z + 22 }, facing: WEST, width: 6, aggro: 12, order: 'attack', seekRange: 40, speed: 4.2, noRout: true, dmgMult: 0.7 },
        [{ type: 'busho', n: 1, o: { name: '神保相茂', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: n(5, 7) }, { type: 'gun', n: 2 }]);
      J.anchor = { x: HONDA.x + 10, z: HONDA.z + 14 };
    } else if (i === 6) {
      // ⑤：真田の騎馬が殿を斬り払う。大軍は後ろから退き始める
      const E = enemyGroup(rt, { faction: 'toyotomi', name: '真田の騎馬', fixed: true, anchor: { x: HONDA.x - 60, z: HONDA.z + 10 }, facing: EAST, width: 6, aggro: 16, order: 'attack', seekRange: 50, speed: 6, noRout: true, dmgMult: 0.5, morale: 100 },
        [{ type: 'cavalry', n: n(4, 5), o: { flag: 'sanada', armor: 0x8e1f16 } }]);
      E.anchor = { x: HONDA.x - 4, z: HONDA.z };
      // 殿の騎馬も⑤で押し返す敵に数える。段の外に置くと、騎馬が戦っていても勝ちになる。
      D.cur.groups.push(E);
      D.cur.nTot = (D.cur.nTot || 0) + E.count;
      rt.after(25, () => { E.noRout = false; });
      M.mori?.moveTo(-226, -10, 60);
      rt.after(10, () => { try { M.sana?.moveTo(-220, 44, 60); } catch (e) { /* 無くても進む */ } });
    }
  } catch (e) { /* 軽い大軍が無くても戦は進む */ }
}
