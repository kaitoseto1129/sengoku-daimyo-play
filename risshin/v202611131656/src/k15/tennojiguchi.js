// ======================================================================
// 天王寺・岡山の戦い　①天王寺口の段（四天王寺の南）
// 毛利勝永が本多忠朝・小笠原秀政の先手を崩す乱戦。忠朝の奮戦と討死。
// 主人公の手柄：崩れる本多の先手の中で、囲まれた組頭を守り、倒れた本多の旗を取り返す。
// 大軍は軽い作り（addClash）で東の脇に置き、本物の兵は増やしすぎない（足すのは十人ほど）。
// 呼び方：stage1 で install(rt, ctx)、tadatomo で ctx.fall()、update の①の間で ctx.update(dt)。
// ======================================================================
import { nobori, sakamogi, palisade } from '../props.js';
import { allyGroup, enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';
import { clash } from '../b_sekigahara.js';

const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const alive = (g) => g && !g.routed && g.count > 0;

// ctx：{ F, sq, FRONT, SHITENNO, HONDA, TOYO }
export function install(rt, ctx) {
  const { F, sq, FRONT, SHITENNO, HONDA, TOYO } = ctx;
  const T = { st: 0, t0: rt.t };
  F.tq = T;
  const SPOT = { x: FRONT.x - 9, z: FRONT.z + 7 };   // 組頭が囲まれる所（木村の手が横を突く西の側）

  // 野の作り（kaito 11/13）：本多の先手の前に逆茂木と柵を並べる（鉄砲の撃ち合いの野。軽い飾り）
  try {
    for (let k = 0; k < 4; k++) rt.scene.add(sakamogi(rt.world, FRONT.x - 15 + k * 8, FRONT.z - 9, Math.PI, 5.5));
    rt.scene.add(palisade(rt.world, [FRONT.x - 19, FRONT.z - 12, FRONT.x + 17, FRONT.z - 12], { h: 1.6 }));
  } catch (e) { /* 飾りが作れない時は省く */ }

  // 本多忠朝の奮戦：討死の時まで家臣が周りを固め、忠朝は倒れない（討死は tadatomo の筋書きで）
  const tada = F.honda?.units.find((u) => u.name === '本多忠朝');
  if (tada) { tada.invuln = true; tada.dmg = (tada.dmg || 1) * 1.6; }
  rt.after(14, () => { if (!T.fell) rt.say('本多忠朝', '退くな！　この忠朝の前を、一人も通すな！', 3.2); });
  rt.after(26, () => { if (!T.fell) rt.say('本多の侍', '殿が自ら槍を振るうておられる！　続け！', 3); });

  // 東の脇の大きな押し合い（小笠原の手と毛利の別手）。軽い作り。本物にはならない
  try {
    T.C = clash(rt, {
      x: FRONT.x + 34, z: FRONT.z - 12, facing: Math.PI, w: 44, gap0: 10, seed: 15071, noRout: false, noWake: true,
      A: { flag: 'honda', armor: HONDA.armor, count: 120, flagRate: 0.5, bannerStride: 6, guns: true },
      B: { flag: 'toyotomi', armor: TOYO.armor, count: 150, flagRate: 0.5, bannerStride: 6, guns: true },
    });
    rt.after(2, () => T.C?.go?.());
  } catch (e) { T.C = null; }

  // 倒れた本多の旗（初めは立てて組頭の後ろに。崩れた時に倒れる）
  try { T.flag = nobori(rt.world, SPOT.x - 1.5, SPOT.z + 1.5, 'honda', 5); rt.scene.add(T.flag); } catch (e) { T.flag = null; }
  T.fallT = 0;

  // 崩れる：組頭と数人が取り残され、毛利の侍に囲まれる
  T.fall = () => {
    if (T.fell) return;
    T.fell = true; T.st = 1; T.t1 = rt.t;
    T.kumi = allyGroup(rt, { faction: 'tokugawa', name: '本多の組頭', anchor: { x: SPOT.x, z: SPOT.z }, facing: Math.PI, width: 4, aggro: 6, seekRange: 8, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq(HONDA, 'samurai', 1, { hat: 'kabuto_m' }), sq(HONDA, 'ashigaru', 3)]);
    T.head = T.kumi.units.find((u) => u.type === 'samurai') || T.kumi.units[0];
    if (T.head) T.head.invuln = true;   // 主人公が着くまでは持ちこたえる
    T.kumi.defMult = 1.4;
    T.foe = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利の侍', anchor: { x: SPOT.x - 6, z: SPOT.z - 6 }, facing: 0, width: 5, aggro: 16, seekRange: 22, order: 'attack', morale: 90 },
      [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 3)]);
    T.foe.anchor = { x: SPOT.x, z: SPOT.z };
    T.n = T.foe.count;
    rt.marker('k15tq', () => (T.head?.alive ? { x: T.head.pos.x, z: T.head.pos.z } : SPOT), '組頭');
    rt.after(2.4, () => rt.say('本多の組頭', '旗が倒れた！　囲まれたぞ、誰か来てくれ！', 3.2));
    T.C?.push?.('B', 0.6);
  };

  T.update = (dt) => {
    // 旗が倒れる・起きる
    if (T.flag) {
      const want = T.st === 1 || T.st === 2 ? 1.45 : 0;
      T.fallT += Math.sign(want - T.fallT) * Math.min(Math.abs(want - T.fallT), dt * (want ? 1.6 : 0.8));
      T.flag.rotation.z = T.fallT;
    }
    if (F.step !== 1) { T.end(); return; }
    const P = rt.player.u.pos;
    if (T.st === 1) {
      // 主人公が寄ったら、組頭の守りを外して普通の斬り合いにする
      if (T.head?.invuln && near(P, T.head.pos, 9)) T.head.invuln = false;
      // 着かぬまま長く経てば、組頭は討たれる（負けにはしない）
      if (T.head?.alive && T.head.invuln && rt.t - T.t1 > 50) { T.head.invuln = false; rt.army.kill(T.head, null); }
      if (!alive(T.foe) || T.foe.count <= T.n * 0.25) {
        T.st = 2;
        for (const u of T.foe?.units || []) if (u.alive && !u.fleeing) { u.moraleFleeDir = { x: 0, z: -1 }; u.fleeing = true; u.fleeT = rt.army.time; u.target = null; }
        if (T.head?.alive) { rt.say('本多の組頭', 'かたじけない！　あの旗を……本多の旗を頼む！', 3.2); T.saved = true; }
        else rt.say('本多の侍', '組頭が……！　せめて旗だけは取り返せ！', 3);
        rt.marker('k15tq', { x: T.flag ? T.flag.position.x : SPOT.x, z: T.flag ? T.flag.position.z : SPOT.z }, '本多の旗');
      }
    } else if (T.st === 2) {
      const fp = T.flag ? T.flag.position : SPOT;
      if (near(P, fp, 3.2)) {
        T.st = 3; rt.unmark('k15tq'); sfx('taiko', 0.7);
        rt.say(nm(rt), '本多の旗、取り返したぞ！　ここに踏み止まれ！', 3);
        rt.award((t) => t.side.push(T.saved ? '組頭を守り、本多の旗を取り返した' : '本多の旗を取り返した'), T.saved ? '組頭を守り、旗を取り返した' : '本多の旗を取り返した');
        if (alive(F.honda)) F.honda.morale = Math.max(F.honda.morale, 70);
        if (alive(T.kumi)) { T.kumi.anchor = { x: FRONT.x, z: FRONT.z - 4 }; }
      }
    }
  };

  T.end = () => {
    if (T.ended) return;
    T.ended = true;
    rt.unmark('k15tq');
    if (T.head) T.head.invuln = false;
    try { T.C?.rout?.('A', { from: 0, hideAfter: 20 }); } catch (e) { /* 軽い作りが無い時 */ }
  };
  return T;
}
