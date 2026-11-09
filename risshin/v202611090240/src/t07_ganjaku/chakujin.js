// ======================================================================
// 岩石城　着陣の段（0〜3分）：秀吉の本隊が岩石山の麓を埋める。戸次川の先手とは数が違う、を最初の景色で
//   麓の四方に豊臣・蒲生・前田の大軍（軽い作り。本物にはならない）。鉄砲衆が城の塀へ絶え間なく撃ちかける（史実）。
//   本人は秀勝の本陣の脇から大手の坂の下（蒲生の先手）まで歩き、着いて少しすると①の坂へ。
// 呼び方：setup で install(rt, K)、update の段0で update(rt, K, dt)（true を返したら go(1)）。pin(rt) は段0の行き先。
// ======================================================================
import { nobori, jinmaku } from '../props.js';
import { sfx } from '../audio.js';

// 麓の大軍：[x, z, 幅, 奥行き, 人数, 旗]
const HOSTS = [[-196, 120, 44, 18, 420, 'tsuru'], [-118, 206, 50, 18, 460, 'toyotomi'], [-226, 168, 30, 30, 380, 'toyotomi'],
  [-170, 228, 46, 16, 400, 'maeda'], [-236, 96, 34, 16, 300, 'tsuru'], [-92, 228, 40, 14, 320, 'toyotomi']];

export function install(rt, K) {
  const W = rt.world, F = rt.flags;
  F.c0 = { t0: rt.t, vol: 0 };
  for (const [i, [x, z, w, d, n, flag]] of HOSTS.entries()) {
    try { W.addDistantArmy({ x, z, w, d, count: n, facing: Math.atan2(K.GATE.x - x, K.GATE.z - z), armor: 0x2a2420, flag, mon: flag, team: 0, seed: 1587 + i * 11, farFill: true, host: false }); } catch (e) { /* 飾り */ }
  }
  // 羽柴秀勝の本陣（総大将。秀吉は馬ヶ岳にいて、この山には来ない）
  try {
    rt.scene.add(jinmaku(W, -214, 214, 16, 10, 4, { mon: 'toyotomi' }));
    for (const [x, z] of [[-200, 204], [-224, 200], [-206, 226], [-190, 214]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 8));
  } catch (e) { /* 飾り */ }
  const say = (t, who, s, d = 3.2) => rt.after(t, () => { if ((F.stage || 0) === 0) rt.say(who, s, d); });
  say(7.5, '蒲生氏郷', '見よ。これが殿下の本隊じゃ。戸次川の先手とは数が違う', 3.6);
  say(15, '使番', '殿下は馬ヶ岳の本陣に。総勢二十万余、豊前に入りました', 3.4);
  say(27, '蒲生氏郷', '鉄砲衆、前へ。城の塀へ絶え間なく撃ちかけよ', 3.2);
  say(44, '使番', '前田利勝様より：搦手は前田が受け持つ、と', 3);
  say(62, '使番', '東の尾根にも羽柴の手が取り付きました！', 3);
  say(80, '物見', '城の塀に煙。秋月も撃ち返してまいります', 3);
  say(98, '蒲生郷成', '坂の下に揃え。合図で一気に登るぞ', 3);
  say(132, '物見', '西の尾根の蒲生の手、梯子を担いで登っていきます', 3);
  say(148, '蒲生郷成', '法螺が鳴れば登る。石が落ちて来たら、竹束の陰へ', 3.2);
  say(116, '使番', '城方は三千。大手は芥田悪六兵衛、本丸は熊井越中守', 3.2);
}

// 鉄砲衆の一斉射（城の塀の上に煙と音）。段0の間、十秒ごと
function volley(rt, K) {
  const F = rt.flags, k = F.c0.vol++;
  const at = [K.GATE, { x: K.GATE.x + 10, z: K.GATE.z - 8 }, { x: -24, z: 30 }, { x: K.GATE.x - 8, z: K.GATE.z + 6 }][k % 4];
  rt.army.play('volley', { x: -128, z: 128 }, 1.1);
  rt.after(0.5, () => { try { rt.army.smoke(at.x, rt.world.heightAt(at.x, at.z) + 3, at.z, 0, 0); } catch (e) { /* 煙は飾り */ } });
  if (k === 0) sfx('taiko', 0.7);
}

export function pin(rt, K) { return K.SPAWN; }

export function update(rt, K) {
  const F = rt.flags, C = F.c0, el = rt.t - C.t0, P = rt.player.u.pos;
  if (el > 30 && el - (C.lastV || 0) > 10) { C.lastV = el; volley(rt, K); }
  if (el > 62 && !C.east) { C.east = true; F.fronts?.east?.go?.(); }
  const near = Math.hypot(P.x - K.SPAWN.x, P.z - K.SPAWN.z) < 14;
  return (el > 15 && near) || el > 200;
}
