// ======================================================================
// castles/nagashima.js … 長島一向一揆・輪中の砦の縄張り（docs/quality-upgrade-plan.md 束7）
// castle_plan.js の riverFortPlan（岸の広場・本陣・水の堀）を、輪中の向き（奥＝北＝-z）に
// 合わせて使う（riverFortPlan は既定で奥が +z なので、z を反転させて作ってから戻す）。
// 砦の縄張り・川の深み・兵の配置・戦い方は b_nagashima.js 側。ここは場と道の「データ」だけ。
// ======================================================================
import { riverFortPlan } from '../castle_plan.js';

function flipZ(plan) {
  const f = (pts) => pts.map(([x, z]) => [x, -z]);
  return {
    ...plan,
    kuruwa: plan.kuruwa.map((k) => ({ ...k, poly: f(k.poly), gapAt: !k.gapAt ? undefined : Array.isArray(k.gapAt[0]) ? f(k.gapAt) : [k.gapAt[0], -k.gapAt[1]] })),
    koguchi: plan.koguchi.map((g) => ({ ...g, at: [g.at[0], -g.at[1]] })),
    paths: plan.paths.map((p) => ({ ...p, pts: f(p.pts) })),
    hori: (plan.hori || []).map((h) => ({ ...h, pts: f(h.pts) })),
    river: plan.river ? { ...plan.river, z: -plan.river.z, bridgeAt: [plan.river.bridgeAt[0], -plan.river.bridgeAt[1]] } : undefined,
  };
}

// 中江の砦：南の岸の広場（土塁の口、z=-52）の奥（北）に本陣（z=-52〜-100 あたり）
export const NAKAE_PLAN = { ...flipZ(riverFortPlan({ name: '中江の砦', bridgeZ: -52, w: 60, honjinD: 48 })) };
// 屋長島の砦：中江よりひとまわり小さく、東寄り
export const YANAGASHIMA_PLAN = { ...flipZ(riverFortPlan({ name: '屋長島の砦', bridgeZ: -40, w: 36, honjinD: 28 })) };

export const NAKAE_GATE = { x: 0, z: -52, name: '中江の冠木門' };
export const YANAGASHIMA = { x: 48, z: -70 };   // 中江の東、島のへり（地形の盛り上がりの縁。水に寄りすぎない所）
