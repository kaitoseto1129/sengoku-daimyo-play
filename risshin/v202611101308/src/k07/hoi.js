// ======================================================================
// 佐和山の包囲（kaito 11/8：docs/toku15_plan_1108.md の 7「遠景の山城。三成の本拠だが三成はいない。東軍が包囲」・army_depth_spec）
//   寄せ手一万五千を、本物の兵（b_k07_sawayama.js の陣）のさらに奥に軽い大軍（addDistantArmy）で重ねる。
//   大手の外の田の奥（小早川・朽木・赤座）、北の尾根の外（脇坂の後備え）、西の湖の側（田中吉政）、南の正法山（家康の旗本）。
//   本物の兵からは百五十歩より奥なので、近くに見せかけの兵は出ない（world.js FAKE_NEAR）。兵力の数・当たり・bot には入れない。
//   落城の時、寄せ手の大軍が城へ向かって押し出す（勝鬨の代わりの動き。字は出さない）。
// 入れ方：setup で install(rt) を一度。win で advance(rt) を一度。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';

const TK = 0x24221f;
export function install(rt) {
  const W = rt.world, F = rt.flags;
  if (!W.addDistantArmy) return null;
  const n = (a, b) => (isTouch ? a : b);
  const mk = (o) => { try { return W.addDistantArmy({ host: false, farFill: true, kind: 'mixed', flagRate: 0.3, mon: o.flag, ...o, flagTex: flagTexture(o.flag) }); } catch (e) { return null; } };
  const W0 = -Math.PI / 2, E0 = Math.PI / 2;   // 東から西を向く・西から東を向く
  // 11/9 布陣図どおりの兵数（docs/fujin/k07_sawayama.md）：塊の人数と幅を名目の兵数の比にする（一人あたり パソコン 25 人・携帯 45 人）
  const K = n(1 / 45, 1 / 25);
  const by = (men, o) => { const c = Math.max(24, Math.round(men * K)); return mk({ ...o, count: c, w: Math.min(70, Math.sqrt(c) * 3.4), d: Math.max(8, Math.sqrt(c) * 1.2) }); };
  F.hoi = [
    by(4500, { x: 236, z: -26, facing: W0, armor: 0x2a2622, flag: 'sashi:kobayakawa:#ece6d6:#16140f', seed: 7001 }),   // 小早川秀秋の本隊（大手の外の田の奥）
    by(3500, { x: 244, z: 30, facing: W0, armor: 0x2a2622, flag: 'sashi:kobayakawa:#ece6d6:#16140f', seed: 7002 }),    // 小早川の二の備え
    by(990, { x: 214, z: -96, facing: W0 - 0.4, armor: TK, flag: 'wakisaka', seed: 7003 }),                             // 脇坂の後備え（北の尾根の外）
    by(3600, { x: 200, z: 116, facing: W0 + 0.5, armor: TK, flag: 'ii', seed: 7004 }),                                  // 井伊直政（南の正法山の側）
    by(3000, { x: -236, z: 6, facing: E0, armor: TK, flag: 'maru', seed: 7005 }),                                       // 田中吉政（西の湖の側）
  ].filter(Boolean);
  return F.hoi;
}

export function advance(rt) {
  for (const g of rt.flags.hoi || []) { try { g.advance(18, 16); } catch (e) { /* 無くても締めは進む */ } }
}
