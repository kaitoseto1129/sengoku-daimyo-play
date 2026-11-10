// ======================================================================
// 設楽原の決戦　追加改善（docs/shitaragahara_plus_1109.md）
//   ・鳶ヶ巣山（酒井忠次）：使番の報だけで終わらせない。開戦から一分余りで遠くの鳶ヶ巣山から鉄砲の音と白煙
//     → 使番「酒井隊、鳶ヶ巣山へ攻め入りました！」→ 四十秒ほどで陥落の黒煙と「長篠城、包囲解けました！」
//     → 武田の備の気が落ち、川向こうの奥の備の一部が後ろ（東）へ下がる（後ろが危ない）。
//   ・大斉射：毎回の番の射撃とは別に、寄せが近い口で十五分に六回まで「構え！」「まだだ！」「放て！」の大斉射。
//     撃ってから少し遅れて何人も倒れる（火縄銃の重さ）。白煙の後に柵際まで来た敵がいれば「来てるぞ！」。
// 兵は足さない。毎コマ new しない。字は台詞だけ。
// ======================================================================
import { sfx } from '../audio.js';

export const TOBI = { x: 880, z: 620 };
const PT = { x: 0, z: 0 };
export const shooters = (q) => q.routed ? 0 : q.units.reduce((n, u) => n +
  (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget ? 1 : 0), 0);

// 鳶ヶ巣山の別の戦場。t0 は夜明けの寄せの始まり（本体の N.t0）
export function tobiTick(rt, t0) {
  const F = rt.flags;
  const K = F.shTobi || (F.shTobi = { s: 0, next: 0 });
  if (K.s >= 3 || F.ending) return;
  const t = rt.t - t0;
  if (K.s === 0) {
    if (t < 75) return;
    K.s = 1; K.at = rt.t;
    K.cols = [[880, 620], [905, 645]].map(([x, z]) =>
      rt.world.addSmokeColumn?.(x, rt.world.heightAt(x, z) + 8, z, { size: 2.6 }));
    try { sfx('volleyFar', 0.55); } catch (e) { /* 音が無くても進む */ }
    rt.say('使番', '鳶ヶ巣山の方で鉄砲の音！　酒井隊が、武田の砦へ攻め入りました！', 4);
    return;
  }
  if (K.s === 1) {
    // 遠い砦攻めの音が途切れ途切れに続く
    if (rt.t - (K.last || 0) > K.next) {
      K.last = rt.t; K.next = 3 + Math.random() * 3;
      try { sfx('volleyFar', 0.3 + Math.random() * 0.2); } catch (e) { /* なし */ }
    }
    if (rt.t - K.at < 40) return;
    K.s = 2; K.at = rt.t;
    F.tobiSmoke = [[880, 620], [930, 660], [850, 700]].map(([x, z], i) =>
      rt.world.addSmokeColumn?.(x, rt.world.heightAt(x, z) + 8, z, { size: 4 - i * 0.6, black: true }));
    rt.say('使番', '鳶ヶ巣山の砦、陥落！　長篠城の囲みが解けました！', 4);
    // 武田の後ろが危ない：気が落ち、川向こうの奥の備の一部が東へ下がる
    let k = 0;
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.routed) continue;
      g.morale = Math.max(0, (g.morale ?? 100) - 12);
      if (!g.count || g.noRout === true || g.fixed) continue;
      const c = g.center?.();
      if (c && c.x > 220 && k < 3 && g.order === 'hold' && g.anchor) { g.anchor.x += 70; k++; }
    }
    return;
  }
  if (K.s === 2 && rt.t - K.at > 6) {
    K.s = 3;
    rt.say('組頭', '武田の後ろが燃えておる。もう退くだけでは済まぬぞ。勝頼は前へ出るしかない', 4);
  }
}

// 大斉射（四〜六回の見せ場）。teppo_wall.js の近い口の番から呼ぶ。
// gs：その口で撃てる鉄砲組、z：口の z、power：鉄砲兵の残り（0〜1）、hit(z, power)：当たり
export function bigVolley(rt, W, gs, z, SB, power, hit) {
  const n0 = gs.reduce((n, q) => n + shooters(q), 0);
  if (!n0 || !W.on || rt.over || rt.flags.ending) return;
  W.big = (W.big || 0) + 1; W.bigT = rt.t;
  for (const q of gs) { q.fire = false; q.holdFire = true; }
  rt.say('鉄砲頭', '構え！　引き付けよ……', 1.6);
  rt.after(1.7, () => { if (W.on && !rt.over && !rt.flags.ending) rt.say('鉄砲頭', 'まだだ！　まだ撃つな！', 1.4); });
  rt.after(3.4, () => {
    if (!W.on || rt.over || rt.flags.ending) return;
    const remaining = gs.reduce((n, q) => n + shooters(q), 0);
    let inside = 0;
    for (const u of rt.army.units) {
      if (u.team === 1 && u.alive && !u.fleeing && !u.gone && !u.noTarget && !u.woundOut && !u.rearWound &&
          u.pos.x < SB.x0 - SB.gap - 1 && u.pos.x > SB.x0 - 40 && Math.abs(u.pos.z - z) < 32) inside++;
    }
    // 構えている間の損耗と突破を反映し、撃てない組の煙や当たりを出さない。
    if (!remaining || inside >= 3) {
      for (const q of gs) { q.fire = false; q.holdFire = true; }
      return;
    }
    power *= Math.min(1, remaining / n0);
    rt.say('鉄砲頭', '放てぇっ！', 1.4);
    for (const q of gs) { q.fire = shooters(q) > 0; q.holdFire = !q.fire; }
    PT.x = SB.x0 + 2; PT.z = z;
    try { rt.army.play('volley', PT, 1.6); } catch (e) { /* なし */ }
    const rows = Math.max(1, Math.round(3 * power));
    for (let k = -rows; k <= rows; k++) {
      try { rt.army.smoke(SB.x0 + 1.5, rt.world.heightAt(SB.x0 + 1.5, z + k * 4) + 1.5, z + k * 4, 1, 0); } catch (e) { /* なし */ }
    }
    try { rt.world.gunSmoke?.(SB.x0 + 4, z); rt.world.gunSmoke?.(SB.x0 + 6, z + 8); } catch (e) { /* なし */ }
    // 撃ってから少し遅れて倒れる（火縄銃の重さ）
    rt.after(0.2, () => hit(z, power * 1.6));
    rt.after(0.45, () => hit(z + 6, power));
    // 白煙で前が見えない。晴れると柵際まで来ている
    rt.after(5.5, () => {
      if (!W.on || rt.over || rt.flags.ending) return;
      let n = 0;
      for (const u of rt.army.units) {
        if (u.team !== 1 || !u.alive || u.fleeing || u.gone || u.noTarget || u.woundOut || u.rearWound || u.group?.shWaiting) continue;
        const dx = u.pos.x - SB.x0;
        if (dx > -2 && dx < 14 && Math.abs(u.pos.z - z) < 30) n++;
      }
      if (n >= 2) { try { sfx('hooves', 0.8); } catch (e) { /* なし */ } rt.say('足軽', '煙の向こう……来てるぞ！　柵の際じゃ！', 2.6); }
    });
  });
}
