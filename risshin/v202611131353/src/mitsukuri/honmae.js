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
import { MITSUKURI_PLAN, ROAD_HON } from '../castles/mitsukuri.js';

// 東尾根から二の丸の東口へ入り、本丸の石段を通る。郭へ直進して柵と切岸へ詰まらない。
const FLANK_ROAD = [...MITSUKURI_PLAN.paths.find((p) => p.id === 'east_ridge').pts.slice(0, 3).reverse(), ...ROAD_HON.slice(1)];

const gone = (g) => !g || g.count === 0 || g.routed;

// ctx：{ HON, EAST, dress, sayKino, sayNear, march }
export function install(rt, ctx) {
  const F = rt.flags;
  if (F.k15Hon) return;
  const { HON, EAST, dress, sayKino, sayNear, march } = ctx;
  const H = (F.k15Hon = { t0: rt.t });
  // 再開前の予約や、本丸を離れた後の攻めの声を持ち越さない。
  const live = () => rt.flags === F && F.k15Hon === H && F.step === 4 &&
    !rt.over && !F.ending && rt.player.u.alive;
  const n = (k) => Math.round(k * (TIER.weak ? 0.6 : 1));

  rt.after(6, () => {
    if (!live()) return;
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
    if (!live()) return;
    // 郭の控えと同じ実兵の上限を守り、空き人数だけ東の手から加勢する。
    let soldiers = 0;
    for (const u of rt.army.units) if (u.alive && !u.isStruct) soldiers++;
    const count = Math.min(9, Math.max(0, 250 - soldiers));
    if (!count) return;
    // 東の口は丹羽、西の谷は浅井。追加の攻め手も既存の四手と同じく崩れて戻らなくならない。
    const g = allyGroup(rt, { fixed: true, name: '丹羽長秀の別働隊', anchor: { x: FLANK_ROAD[0][0], z: FLANK_ROAD[0][1] }, facing: -Math.PI / 2, width: 2, aggro: 14, seekRange: 30, order: 'move', formation: 'column', noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: count - 1 }], { flag: 'oda' }));
    H.flank = g;
    march(g, FLANK_ROAD, 3.2, () => {
      // 退却・全滅や再開後に、古い到着の予約で攻撃の下知へ戻さない。
      if (!live() || H.flank !== g || gone(g)) return;
      g.order = 'attack'; g.anchor = { x: HON.x, z: HON.z };
      // 出発しただけで到着の知らせを出さず、実際に石段を登った時に伝える。
      rt.banner('別働の手、脇から', '東の尾根から本丸の脇へ');
      rt.say('使番', '丹羽長秀殿の手、東の尾根から本丸の脇へ回りました！', 3.4);
      H.C?.push?.('A', 0.5);
    });
  });

  // 城将が自ら打って出る
  rt.after(42, () => {
    if (!live() || gone(F.commandGuard)) return;
    const g = F.commandGuard;
    g.order = 'attack'; g.aggro = 16; g.seekRange = 30; g.anchor = { x: HON.x, z: HON.z };
    // 城将が倒れても旗本は戦う。倒れた本人や遠い本人の声を予約で出さない。
    rt.banner('本丸の旗本、打って出る', '六角の旗本');
    sayNear(rt, F.commander, '六角の名を汚すな！　本丸は渡さぬ！', 3.2);
    rt.after(3.6, () => { if (live() && F.commandGuard === g && !gone(g)) sayKino(rt, '城将の旗本じゃ。囲んで押し返せ！　旗を守れ', 3.2); });
    // 城将は名前と共通の敵印で示す。本丸の行き先に別の印を重ねない。
  });
}
