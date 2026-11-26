// 武将の能力を模擬合戦・対戦の備に小さく効かせる（11/21 クラウド kaito2 k365-cloud-27・司令塔の割り振り「SS と N の大将の釣り合い」）。
//   紙：online_final 25「基礎性能の差は最大でも約10〜15%以内。SS だから HP2倍は禁止」・27〜35 の七つの能力。
//   効かせ方（試合の始まりに一度。毎コマは何もしない）：
//     ・備ごと：その武将の能力の平均で、押す力（軽い備どうしの押し合い・本物の組の打つ力）と、損で落ちる士気の受けを決める。N（50）で1倍、SS（72〜80）で約1.09倍。
//     ・総大将：COMMAND で使番の速さ（36 の applyCommandDelay）、MORALE で全隊の士気の受けを少し（SS の大名で約3%）。
//   重課金だけが勝つ形にしない：上の倍率は合わせても15%まで（POW_MAX・紙の上限）。
import { bushouByName, statsOf } from './bushou_online.js';

export const POW_K = 0.55, POW_MAX = 0.15;   // 11/21 13:30：0.4・0.12 では SS の勝ちが55%（効き目が薄い）。紙の上限15%まで上げた
const avg = (s) => (s.COMMAND + s.MORALE + s.COHESION + s.TACTICS + s.MOBILITY + s.RANGED) / 6;

export function bushouPower(name) {
  const s = statsOf(bushouByName(name)); if (!s) return { pow: 1, guard: 1, stats: null };
  const pow = 1 + Math.min(POW_MAX, Math.max(0, (avg(s) - 50) / 100 * POW_K));
  const guard = 1 + Math.min(POW_MAX, Math.max(0, (s.MORALE - 50) / 100 * POW_K));
  return { pow, guard, stats: s };
}

// sonae：army4kSpawn の備（S.taisho・S.team・S.line・S.b）。cmd：36 の command.js（applyCommandDelay）
export function applyBushouPower(rt, sonae, cmd) {
  const out = [];
  for (const team of [0, 1]) {
    const L = (sonae || []).filter((S) => (S.team ? 1 : 0) === team);
    const H = L.find((S) => S.line === 'honjin') || L[0];
    const top = H ? bushouPower(H.taisho) : null;
    const lead = top?.stats ? 1 + Math.min(0.03, Math.max(0, (top.stats.MORALE - 50) / 100 * 0.12)) : 1;
    if (top?.stats && cmd?.applyCommandDelay) { try { cmd.applyCommandDelay(rt, team, top.stats.COMMAND, true); } catch (e) { /* 使番が無い戦でも進む */ } }
    for (const S of L) {
      const p = bushouPower(S.taisho), B = S.b; if (!B) continue;
      B.powK = p.pow; B.guardK = Math.min(1 + POW_MAX, p.guard * lead);
      const G = B.real; if (G) { G.dmgMult = (G.dmgMult || 1) * p.pow; G.defMult = (G.defMult || 1) * B.guardK; }   // 後で出来る本物の組は butai.js が powK・guardK を掛ける
      out.push({ team, name: S.taisho, pow: +p.pow.toFixed(3), guard: +B.guardK.toFixed(3) });
    }
  }
  rt.flags.bushouPower = out;
  return out;
}
