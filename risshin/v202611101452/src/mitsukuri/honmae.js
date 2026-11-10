// ======================================================================
// 箕作城 15分の構成（docs/oda15_plan_1108.md 6）　④「本丸前・六角方守将戦・別働隊が側面侵入」（10〜13分）
// 本丸の段（inside）に入ってから重ねる：
//   ・東の口で丹羽の手と六角勢が押し合う（軽い作り addClash）
//   ・別働の丹羽長秀の手が東の尾根から本丸の脇へ入る（本物の兵・少数）
//   ・城将 吉田出雲守が旗本と自ら打って出る（討つ役ではない。退けると城兵が崩れる。最期は史料に無いので逃がす）
// 呼び方：b_mitsukuri.js の inside() で install(rt, ctx)。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { clash } from '../b_sekigahara.js';
import { TIER } from '../device_tier.js';

const gone = (g) => !g || g.count === 0 || g.routed;

// ctx：{ HON, EAST, dress, sayKino }
export function install(rt, ctx) {
  const F = rt.flags;
  if (F.k15Hon) return;
  const { HON, EAST, dress, sayKino } = ctx;
  const H = (F.k15Hon = { t0: rt.t });
  const n = (k) => Math.round(k * (TIER.weak ? 0.6 : 1));

  rt.after(6, () => {
    if (rt.over || F.ending) return;
    try {
      // 本丸へ寄る本人の周りは本物の兵だけ。東の押し合いの絵は遠方に限る。
      H.C = clash(rt, { x: (HON.x + EAST.x) / 2 + 6, z: (HON.z + EAST.z) / 2, facing: -Math.PI / 2, w: 18, gap0: 8, seed: 156901, noRout: true, noWake: true, nearHide: 60, killRate: 0.02,
        A: { flag: 'oda', armor: 0x302d29, count: n(100), team: 0, faction: 'oda', flagRate: 0.4 },
        B: { flag: 'rokkaku', armor: 0x33291f, count: n(80), team: 1, faction: 'rokkaku', flagRate: 0.4 } });
      H.C?.go?.();
    } catch (e) { H.C = null; }
    rt.bark('東の口でも丹羽の手が押している');
  });

  // 別働隊：東の尾根から本丸の脇へ
  rt.after(20, () => {
    if (rt.over || F.ending) return;
    // 郭の控えと同じ実兵の上限を守り、空き人数だけ東の手から加勢する。
    let soldiers = 0;
    for (const u of rt.army.units) if (u.alive && !u.isStruct) soldiers++;
    const count = Math.min(9, Math.max(0, 250 - soldiers));
    if (!count) return;
    // 東の口は丹羽、西の谷は浅井。追加の攻め手も既存の四手と同じく崩れて戻らなくならない。
    const g = allyGroup(rt, { fixed: true, name: '丹羽長秀の別働隊', anchor: { x: EAST.x - 8, z: EAST.z }, facing: -Math.PI / 2, width: 4, aggro: 14, seekRange: 30, order: 'move', formation: 'yari', noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: count - 1 }], { flag: 'oda' }));
    g.dest = { x: HON.x + 6, z: HON.z }; g.speed = 3.2;
    g.onArrive = (gg) => { gg.order = 'attack'; gg.anchor = { x: HON.x, z: HON.z }; };
    H.flank = g;
    rt.banner('別働の手、脇から', '東の尾根から本丸の脇へ');
    rt.say('使番', '丹羽長秀殿の手、東の尾根から本丸の脇へ回りました！', 3.4);
    H.C?.push?.('A', 0.5);
  });

  // 城将が自ら打って出る
  rt.after(42, () => {
    if (rt.over || F.ending || gone(F.commandGuard)) return;
    const g = F.commandGuard;
    g.order = 'attack'; g.aggro = 16; g.seekRange = 30; g.anchor = { x: HON.x, z: HON.z };
    rt.banner('城将、打って出る', '吉田出雲守の旗本');
    rt.say('吉田出雲守', '六角の名を汚すな！　本丸は渡さぬ！', 3.2);
    rt.after(3.6, () => { if (!rt.over && !F.ending) sayKino(rt, '城将の旗本じゃ。囲んで押し返せ！　旗を守れ', 3.2); });
    // 城将は名前と共通の敵印で示す。本丸の行き先に別の印を重ねない。
  });
}
