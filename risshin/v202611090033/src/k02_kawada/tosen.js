// ======================================================================
// 河田・米野　渡河の厚みと戦況の移り（docs/toku15_plan_1108.md の 2）
//  ・0〜3分：南岸に河田の手の備が奥へ重なる（池田の二陣・本陣の後ろ、浅野・一柳・山内）。北の奥に織田の後詰
//  ・6〜9分：米野。東軍が次々渡り、北岸に味方の旗が増える。米野の東の田で両軍の大きな押し合い（軽い作り）
//  ・9〜12分：米野が崩れると織田勢は岐阜へ退く。騎馬が追うが、深追いはさせない
//  ・12〜15分：使番「秀信、岐阜城へ籠もりました！」。東軍の備が金華山の麓へ動く
// 本物の兵は足さない。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { sfx } from '../audio.js';
import { clash } from '../b_sekigahara.js';
import { sonaeLayers, showLayers, onceWhen } from '../k_toku_a/sonae.js';

const BLACK = 0x1e1b19, WEST = 0x2a2622;

export function install(rt, ctx) {
  const F = rt.flags, T = {};
  F.k02t = T;
  const di = () => F.dp?.i ?? -1;
  const N = Math.PI;   // 北（-z）を向く
  // 南岸は河田の手だけ。尾越を渡る福島・黒田・細川の旗は置かない。
  T.south = [
    ...sonaeLayers(rt, { x: -10, z: 100, facing: N, mon: 'ageha', armor: BLACK, team: 0, seed: 21, layers: [{ back: 0, w: 40, d: 10, count: 160 }, { back: 50, w: 22, d: 10, count: 80, kind: 'honjin' }] }),
    ...sonaeLayers(rt, { x: -112, z: 96, facing: N, mon: 'asano', armor: BLACK, team: 0, seed: 22, layers: [{ back: 0, w: 34, d: 10, count: 130 }] }),
    ...sonaeLayers(rt, { x: -200, z: 70, facing: N - 0.35, mon: 'kuginuki', armor: BLACK, team: 0, seed: 23, layers: [{ back: 0, w: 44, d: 12, count: 180 }, { back: 22, w: 40, d: 12, count: 150 }] }),
    ...sonaeLayers(rt, { x: 60, z: 128, facing: N, mon: 'ageha', armor: BLACK, team: 0, seed: 24, layers: [{ back: 0, w: 36, d: 10, count: 140 }] }),
    ...sonaeLayers(rt, { x: 120, z: 110, facing: N, mon: 'kashiwa', armor: BLACK, team: 0, seed: 25, layers: [{ back: 0, w: 36, d: 10, count: 140 }] }),
  ];
  // 北の奥：織田秀信の後詰（岐阜への道の上）。米野が崩れると消える（岐阜へ退いた）
  T.north = sonaeLayers(rt, { x: -40, z: -200, facing: 0, mon: 'oda', armor: WEST, team: 1, seed: 26, layers: [{ back: 0, w: 36, d: 10, count: 130 }, { back: 22, w: 18, d: 10, count: 60, kind: 'honjin' }] });
  // 渡った後の東軍：北岸に旗が増える（米野の段で見せる）
  T.crossed = [
    ...sonaeLayers(rt, { x: -20, z: -30, facing: N + 0.6, mon: 'ageha', armor: BLACK, team: 0, seed: 27, layers: [{ back: 0, w: 30, d: 10, count: 120 }] }),
    ...sonaeLayers(rt, { x: 30, z: -24, facing: N + 0.6, mon: 'kashiwa', armor: BLACK, team: 0, seed: 28, layers: [{ back: 0, w: 28, d: 10, count: 110 }] }),
  ];
  showLayers(T.crossed, false);

  T.tick = onceWhen(rt, [
    // 北岸の柵を取った後：後ろの備も続いて渡り始める
    [() => di() >= 3, () => { showLayers(T.crossed, true); rt.after(1, () => rt.say('使番', '山内殿・池田の二陣、続いて渡りました！', 3.2)); }],
    // 米野：村の東の田で両軍の大きな押し合い（本物の戦の脇。軽い作り）
    [() => di() >= 4, () => {
      try {
        T.C = clash(rt, { x: -96, z: -112, facing: N + 0.5, w: 40, gap0: 8, seed: 16008, noRout: false, noWake: true,
          A: { flag: 'ageha', armor: BLACK, count: 120, flagRate: 0.5, bannerStride: 6, guns: true },
          B: { flag: 'oda', armor: WEST, count: 110, flagRate: 0.5, bannerStride: 6, guns: true } });
        rt.after(1.5, () => T.C?.go?.());
      } catch (e) { T.C = null; }
      rt.after(5, () => rt.say('浅野幸長', '堤の向こうでも組み合うておる。米野を抜けば敵は総崩れじゃ', 3.6));
    }],
    // 米野が崩れた：押し合いの織田勢も退き、騎馬が追う。深追いはさせない
    [() => !!F.yonenoBroke, () => {
      T.C?.push?.('A', 0.9);
      rt.after(2, () => { T.C?.cavalry?.('A', { from: 1, count: 30, flag: 'ageha', armor: BLACK }); sfx('horagai', 0.6); });
      rt.after(6, () => T.C?.rout?.('B', { from: 0, hideAfter: 20, minFight: 2 }));
      rt.after(7, () => rt.say('池田照政', '騎馬で追え。ただし深追いはするな、新加納の砦を先に破る', 3.8));
    }],
    // 新加納の段：北の奥の後詰は岐阜へ退いて消える
    [() => di() >= 6, () => { rt.after(20, () => showLayers(T.north, false)); }],
  ]);

  // 締め：使番の知らせ → 東軍の備が金華山の麓へ動き出す
  T.ending = () => {
    showLayers(T.north, false);
    rt.after(1, () => { sfx('horagai', 0.6); rt.say('使番', '秀信、岐阜城へ籠もりました！', 3); });
    rt.after(17.6, () => rt.say('池田照政', '皆、金華山の麓へ。明日は城攻めじゃ', 3.6));
  };
  ctx.tick = (dt) => T.tick(dt);
  ctx.ending = () => T.ending();
  return ctx;
}
