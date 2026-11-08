// ======================================================================
// 伏見城　寄せ手の厚みと城の崩れ（docs/toku15_plan_1108.md の 1）
//  ・3〜6分：城外に西軍の旗。宇喜多・小早川・島津・毛利・石田の備が先鋒→二陣→本陣と奥へ重なる（遠景の軽い作り）
//  ・6〜9分：寄せ手の梯子が石垣に掛かる。三の丸の東の櫓が焼け落ち、城の内に火が回る
//  ・9〜12分：曲輪ごとに梯子が増え、本丸へ段々に退く（使番の知らせ）
//  ・終わり：「伏見城　落城」の後に「任務達成　徳川軍の時間を稼いだ」（落城＝負けではない）
// 本物の兵は足さない。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { hashigo } from '../props.js';
import { sfx } from '../audio.js';
import { sonaeLayers, showLayers, onceWhen } from '../k_toku_a/sonae.js';

const ARM = 0x2c2a26;
// 寄せ手の陣の奥（実の陣 CAMPS の後ろ）へ、前から先鋒・二陣・本陣
const HOSTS = [
  { k: 1, mon: 'ukita', x: 0, z: 196, facing: Math.PI, layers: [{ back: 0, w: 46, d: 10, count: 170 }, { back: 20, w: 50, d: 12, count: 200 }, { back: 38, w: 22, d: 12, count: 90, kind: 'honjin' }] },
  { k: 2, mon: 'kobayakawa', x: -128, z: 40, facing: Math.PI / 2, layers: [{ back: 0, w: 40, d: 10, count: 150 }, { back: 20, w: 44, d: 12, count: 170 }, { back: 36, w: 20, d: 10, count: 80, kind: 'honjin' }] },
  { k: 2, mon: 'shimazu', x: 122, z: 122, facing: -Math.PI * 0.8, layers: [{ back: 0, w: 26, d: 8, count: 90 }, { back: 16, w: 16, d: 8, count: 50, kind: 'honjin' }] },
  { k: 2, mon: 'mori', x: 134, z: 16, facing: -Math.PI / 2, layers: [{ back: 0, w: 40, d: 10, count: 150 }, { back: 22, w: 40, d: 12, count: 160 }, { back: 38, w: 20, d: 10, count: 70, kind: 'honjin' }] },
  { k: 3, mon: 'ishida', x: -98, z: 176, facing: Math.atan2(98, -176), layers: [{ back: 0, w: 34, d: 10, count: 130 }, { back: 18, w: 18, d: 10, count: 70, kind: 'honjin' }] },
];
// 梯子：[曲輪の段（D.i がこれ以上で掛かる）, x, 足もとの z, 石垣の上の z]
const LADDERS = [
  [2, -19, 49.2, 45.6], [2, -11, 49.2, 45.6], [2, 12, 49.2, 45.6], [2, 20, 49.2, 45.6],
  [6, -17, 7.2, 3.6], [6, -10, 7.2, 3.6], [6, 11, 7.2, 3.6], [6, 18, 7.2, 3.6],
  [8, -11, -30.6, -34.4], [8, 11, -30.6, -34.4],
];

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world, T = { hosts: [], ladders: [] };
  F.k01y = T;
  const di = () => F.dp?.i ?? -1;
  // 遠景の大軍は始めに作って隠しておく（主人公が本丸まで下がった後では遠すぎて作れない）
  for (const h of HOSTS) { const L = sonaeLayers(rt, { ...h, armor: ARM, team: 1, seed: 1600 + h.k * 7 + h.x }); showLayers(L, false); T.hosts.push({ k: h.k, L }); }
  const showHosts = (k) => { for (const h of T.hosts) if (h.k <= k) showLayers(h.L, true); };
  const ladder = (x, z0, z1) => {
    try {
      const foot = { x, y: W.heightAt(x, z0), z: z0 }, top = { x, y: Math.max(W.heightAt(x, z1 - 1.5), W.heightAt(x, z1)) + 1.1, z: z1 };
      const m = hashigo(foot, top); rt.scene.add(m); T.ladders.push(m);
    } catch (e) { /* 掛けられない所は飛ばす */ }
  };
  const ladders = (k) => { for (const [i, x, z0, z1] of LADDERS) if (i === k) ladder(x, z0, z1); };

  T.tick = onceWhen(rt, [
    // 宇喜多が着く：南の丘の奥に先鋒・二陣・本陣の旗
    [() => di() >= 1, () => showHosts(1)],
    // 三の丸の虎口の段：石垣に梯子が掛かる
    [() => di() >= 2, () => { ladders(2); rt.after(6, () => rt.say('鳥居の侍', '梯子じゃ！　石垣の上から突き落とせ', 3)); }],
    // 小早川・島津・毛利が着く：西・東の奥にも旗が並ぶ
    [() => di() >= 3, () => { showHosts(2); rt.after(1.5, () => rt.say('使番', '西に小早川、東に島津と毛利の旗！　城の三方が埋まりました', 3.4)); }],
    // 石田が着く：南西の奥にも
    [() => di() >= 4, () => showHosts(3)],
    // 二の丸へ回る段：三の丸の東の櫓が火矢で焼け落ちる（城の内の火の始まり）
    [() => di() >= 5, () => {
      if (W.addFire) for (const [x, z, s, h] of [[24, 42, 2.8, 6], [22, 38, 2.2, 3], [14, 32, 1.6, 2]]) W.addFire(x, z, { size: s, h, blackSmoke: h > 2 });
      if (W.addSmokeColumn) W.addSmokeColumn(24, W.heightAt(24, 42) + 10, 42, { size: 3, black: true });
      sfx('thunder', 0.9);
      rt.after(0.6, () => rt.say('使番', '三の丸の東の櫓が焼け落ちた！　火が城の内へ回るぞ', 3.4));
    }],
    // 二の丸の段：二の丸の石垣にも梯子
    [() => di() >= 6, () => ladders(6)],
    // 本丸の段：本丸の口の脇にも梯子。本丸の外はもう寄せ手のもの
    [() => di() >= 8, () => { ladders(8); rt.after(4, () => rt.say('使番', '二の丸、乗っ取られました！　残るは本丸のみ', 3.2)); }],
  ]);

  // 落城の締め：炎上 → 自刃 → 「伏見城　落城」 → 「任務達成　徳川軍の時間を稼いだ」。勝鬨は上げない
  T.ending = () => {
    rt.after(20.5, () => { sfx('taiko', 0.5); rt.banner('伏見城　落城', '慶長五年八月一日'); });
    rt.after(25.5, () => rt.banner('任務達成', '徳川軍の時間を稼いだ'));
  };
  ctx.tick = (dt) => T.tick(dt);
  ctx.ending = () => T.ending();
  return ctx;
}
