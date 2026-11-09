// ======================================================================
// 八尾・若江の二正面（kaito 11/8 docs/toku15_plan_1108.md の 14・docs/army_depth_spec_1108.md）
//   真ん中から見て、左（南）の八尾で藤堂勢と長宗我部勢が、右（北）の若江で井伊の赤備えと木村勢が向き合う。
//   主人公が八尾にいる間も若江の両軍は遠くに並び、伝令「井伊隊、木村重成と交戦！」で若江がぶつかる。
//   若江にいる間も、遠くの八尾で藤堂勢が押され続ける。木村が討たれ若江が崩れると、八尾の長宗我部も退く（二つの戦場がつながる）。
// 軽い大軍（addDistantArmy・addClash。兵力の数に入れない・本物に替えない）。本物の兵は今のまま。
// 入れ方：setup の終わりで install(rt, def)。update の頭で tick(rt, dt)。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import * as kerai from '../k12/kerai.js';
import { depthOrder, depthRout } from '../army_depth.js';

const WEST = -Math.PI / 2, EAST = Math.PI / 2;
const n = (a, b) => (isTouch ? a : b);

export function install(rt, def) {
  const W = rt.world, F = rt.flags;
  const mk = (o) => { try { return W.addDistantArmy ? W.addDistantArmy({ host: false, farFill: true, kind: 'mixed', ...o, flagTex: flagTexture(o.flag) }) : null; } catch (e) { return null; } };
  const cl = (o) => { try { return W.addClash ? W.addClash({ rt, play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke(x, y, z, fx, fz), host: false, noRout: true, ...o }) : null; } catch (e) { return null; } };
  const M = {
    // 両軍の二陣・後備え・後ろの幕府軍は、陣立ての表（k14/depth.js・army_depth.js）が置く
  };
  // 若江：井伊の先手と木村の前の列（はじめは田を挟んで向き合う）。八尾：藤堂の先手と長宗我部（はじめから組み合い、藤堂が押される）
  const C = {
    wakae: cl({ x: 30, z: -96, facing: WEST, w: 30, gap0: 16, seed: 14205, killRate: 0.004, maxDrift: 8, corpses: 6, nearHide: 40,
      A: { flag: 'ii', armor: 0xa52b1c, count: n(60, 110), flagRate: 0.25, guns: true }, B: { flag: 'toyotomi', armor: 0x2c2a2a, count: n(60, 110), flagRate: 0.25, guns: true } }),
    yao: cl({ x: 22, z: 136, facing: WEST, w: 32, gap0: 0, seed: 14206, killRate: 0.005, maxDrift: 10, corpses: 8, nearHide: 40,
      A: { flag: 'todo', armor: 0x24221f, count: n(70, 120), flagRate: 0.2 }, B: { flag: 'chosokabe', armor: 0x2a2622, count: n(70, 120), flagRate: 0.25 } }),
  };
  // 名のある諸将（docs/generals_toyo_toku_1108.md）：長宗我部の横の備の将に増田盛次、藤堂の鉄砲衆の将に藤堂氏勝
  for (const [g, name] of [[F.choSide, '増田盛次'], [F.todoGun, '藤堂氏勝']]) {
    const u = g && g.units.find((q) => q.type === 'samurai' && !q.name);
    if (u) u.name = name;
  }
  try { C.yao?.go?.(); C.yao?.push?.('B', 0.4); } catch (e) { /* 無くても進む */ }
  F._jin14 = { M, C, step: -1, def };
  return F._jin14;
}

export function tick(rt, dt) {
  const F = rt.flags, st = F._jin14;
  if (!st) return;
  kerai.tick(rt, dt, {
    guards: () => [F.mine],
    // 総大将の旗本・堤に伏せた槍（伏せたまま待つ）は動かさない。若江の井伊の先手は②の伝令まで川の東で構える
    keepHold: (g) => g === F.iiG || g === F.todoG || ((g === F.sakiG || g === F.iharaG || g === F.andoG) && (F.step || 0) < 2),
    guns: () => ((F.step || 0) <= 1 ? [F.todoGun] : [F.sakiG, F.iharaG]),
  });
  const { C } = st;
  const dOrder = (side, id, cmd) => { try { const D = F.depth && F.depth[side]; if (D) depthOrder(D, id, cmd); } catch (e) { /* 無くても進む */ } };
  const dRout = (side, id) => { try { const D = F.depth && F.depth[side]; if (D) depthRout(D, id); } catch (e) { /* 無くても進む */ } };
  if (F.ending) {
    if (!st.end) {
      st.end = true;
      if (rt.tracker && rt.tracker.main) try {
        // 若江が崩れ、八尾の長宗我部も退く
        C.wakae?.rout?.('B', { from: 0, hideAfter: 30 });
        C.yao?.push?.('B', 0); C.yao?.rout?.('B', { from: 0, hideAfter: 30 });
        for (const id of ['kimura2', 'kimura3']) dRout('B', id);
        for (const id of ['choso2', 'choso3', 'chohata', 'choA', 'fuse', 'masuda']) dOrder('B', id, 'retreat');
      } catch (e) { /* 無くても進む */ }
    }
    return;
  }
  const step = F.step || 0;
  if (step === st.step) return;
  st.step = step;
  try {
    if (step === 2) {
      // 伝令の時：若江の両軍がぶつかる。八尾では藤堂勢がさらに押される
      C.wakae?.go?.();
      C.yao?.push?.('B', 0.6);
      dOrder('A', 'ii2', 'advance');
    } else if (step === 4) {
      // 木村の本隊の段：若江の前の列は井伊が押す
      C.wakae?.push?.('A', 0.5);
    }
  } catch (e) { /* 軽い大軍が無くても戦は進む */ }
}
