// ======================================================================
// 稲葉山城 15分の構成（docs/oda15_plan_1108.md 5）　④「本丸周辺・斎藤方精鋭・複数方向から織田軍が登る」（10〜13分）
// 本丸の段（signal）に入った後に重ねる：
//   ・東の百曲りと西の二の丸の斜面で、柴田・丹羽の手が別の道から登って来る（軽い作り addClash。本物の兵は増やさない）
//   ・龍興の近習の精鋭が本丸の奥から打って出る（本物の兵。本丸の守りに数え、退けるまで合図の火は付けられない）
//   ・一番の見せ場：本丸の旗が揺らぎ、龍興が本丸を捨てて落ちる知らせ（裸城になった稲葉山の終わり）
// 呼び方：b_inabayama.js の signal() の終わりで install(rt, ctx)。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { clash } from '../b_sekigahara.js';
import { TIER } from '../device_tier.js';

const gone = (g) => !g || g.count === 0 || g.routed;

// ctx：{ HON, dress, officer }
export function install(rt, ctx) {
  const F = rt.flags;
  if (F.k15Hon) return;
  const { HON, dress, officer } = ctx;
  const H = (F.k15Hon = { t0: rt.t });
  const n = (k) => Math.round(k * (TIER.weak ? 0.6 : 1));

  // 別の道から登る織田勢（東の百曲り・西の二の丸）。本人の近くは本物の兵に任せ、軽い兵は遠くだけ描く
  rt.after(10, () => {
    if (rt.over || F.ending) return;
    try {
      H.C = [
        clash(rt, { x: HON.x + 34, z: HON.z + 18, facing: -Math.PI / 2, w: 22, gap0: 8, seed: 156801, noRout: true, noWake: true, nearHide: 14, killRate: 0.02,
          A: { flag: 'oda', armor: 0x302d29, count: n(110), team: 0, faction: 'oda', flagRate: 0.4 },
          B: { flag: 'saito', armor: 0x38352f, count: n(90), team: 1, faction: 'saito', flagRate: 0.4 } }),
        clash(rt, { x: HON.x - 46, z: HON.z + 20, facing: Math.PI / 2, w: 20, gap0: 8, seed: 156802, noRout: true, noWake: true, nearHide: 14, killRate: 0.02,
          A: { flag: 'oda', armor: 0x302d29, count: n(100), team: 0, faction: 'oda', flagRate: 0.4 },
          B: { flag: 'saito', armor: 0x38352f, count: n(80), team: 1, faction: 'saito', flagRate: 0.4 } }),
      ].filter(Boolean);
      for (const C of H.C) C.go?.();
    } catch (e) { H.C = []; }
    rt.banner('三方から登る', '百曲りと二の丸からも織田の旗');
    rt.say('使番', '柴田殿の手が百曲りを、丹羽殿の手が二の丸を登っております！', 3.6);
  });

  // 龍興の近習の精鋭：本丸の奥から打って出る。退けるまで合図は上げられない（本丸の守りに数える）
  rt.after(32, () => {
    if (rt.over || F.ending || F.step !== 4) return;
    const at = { x: HON.x + 6, z: HON.z - 6 };
    const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: '龍興の近習衆', anchor: at, facing: Math.PI / 2, order: 'attack', aggro: 16, seekRange: 34, width: 4, morale: 100, formation: 'yari', fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 4, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 4 }], { flag: 'saito' }));
    g.noRout = true;
    rt.after(40, () => { if (!gone(g)) g.noRout = false; });
    H.elite = g;
    F.hata.push(g); F.honGuards.unshift(g);
    rt.banner('斎藤の精鋭', '龍興の近習が本丸から打って出る');
    rt.say('斎藤の侍', '織田の雑兵ども、ここから先は通さぬ！', 3.2);
    rt.after(3.6, () => { if (!rt.over && !F.ending) rt.say(officer(rt), '近習衆じゃ、手強いぞ。囲んで突け！', 3); });
    rt.marker('k15elite', () => (gone(g) ? null : g.center()), '龍興の近習衆', { red: true, group: g });
  });

  // 見せ場：本丸の旗が揺らぎ、龍興が本丸を捨てる
  const fall = () => {
    if (H.fell || rt.over || F.ending) return;
    H.fell = true;
    rt.banner('龍興、本丸を捨てる', '裸城となった稲葉山');
    rt.say('使番', '龍興、裏の口から長良川へ落ちてゆきます！', 3.4);
    rt.after(3.8, () => { if (!rt.over && !F.ending) rt.say(officer(rt), '城主は逃げた。あとは本丸の旗を倒し、合図の火を上げよ！', 3.6); });
    for (const C of H.C || []) C.push?.('A', 0.7);
    for (const g of F.hata || []) if (!gone(g) && g !== H.elite) g.morale = Math.min(g.morale, 45);
  };
  H.tick = () => {
    if (H.fell || !H.elite) return;
    if (gone(H.elite) || H.elite.count <= 3 || rt.t - H.t0 > 120) fall();
  };
}

export function tick(rt) { rt.flags.k15Hon?.tick?.(); }
