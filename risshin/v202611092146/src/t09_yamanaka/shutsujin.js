// ======================================================================
// 山中城　出陣の段（0〜3分）：小田原征伐の始まり。秀次の本陣の前に全国から集まった豊臣の諸将の旗が並び、
//   街道の坂の上に山中城（出丸・障子堀・畝堀・虎口）を見上げる。使番が別の戦線（韮山・小田原・家康の道）を知らせる。
//   本人は本陣の前から先手の列（一柳・中村の前）へ歩き、少しして①の出丸攻めが始まる。
// 呼び方：setup で install(rt, K)、update の段0で update(rt, K) が true を返したら dai(rt)。pin は先手の列。
// ======================================================================
import { nobori } from '../props.js';
import { flagTexture } from '../textures.js';
import { sfx } from '../audio.js';

export const LINE = { x: 14, z: 204 };   // 先手の列の前（出丸の鉄砲の届く外）

// 諸将の陣：[x, z, 幅, 奥行き, 人数, 旗]（街道の坂の下の左右。動ける範囲の外に置き、近くに絵の兵を出さない）
const CAMPS = [[-40, 280, 34, 14, 260, 'kuginuki'], [70, 280, 30, 14, 240, 'hori'], [-14, 310, 26, 12, 220, 'kashiwa'], [96, 310, 28, 16, 260, 'toyotomi']];

export function install(rt, K) {
  const W = rt.world, F = rt.flags;
  F.s0 = { t0: rt.t };
  for (const [i, [x, z, w, d, n, flag]] of CAMPS.entries()) {
    try {
      const g = W.addDistantArmy({ x, z, w, d, count: n, facing: Math.PI, farFill: true, armor: 0x2b2723, team: 0, flagTex: flagTexture(flag), mon: flag, seed: 15910 + i });
      // 街道の後続も遠景のまま保ち、近づいた時に実兵を増やさない。
      if (g?.army) g.army.noWake = true;
    } catch (e) { /* 飾り */ }
    try { rt.scene.add(nobori(W, x + w / 2 + 3, z - d / 2, flag, 6)); } catch (e) { /* 飾り */ }
  }
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (!F.step) rt.say(who, s, d); });
  say(13, '使番', '小田原へは、殿下の二十万余が東海道と箱根の道を進んでおります', 3.6);
  say(26, '堀秀政', '見よ、坂の上の出丸。あれが間宮康俊の岱崎出丸じゃ', 3.4);
  say(40, '使番', '伊豆の韮山城は織田信雄様が囲まれました。今日、箱根の口を三つ同時に攻めまする', 3.8);
  say(56, '中村一氏', '堀の底は畝で仕切ってある。落ちれば這い上がれぬぞ', 3.2);
  say(72, '使番', '北の足柄の道からも、徳川殿の手が北条の城へ寄せております', 3.6);
  say(88, '山内一豊', '先手は揃うた。法螺が鳴れば、出丸へ駆け上がる', 3.2);
  say(104, '豊臣秀次', '日の高いうちに山中を落とす。掛かれ！', 3);
  rt.after(0.5, () => sfx('taiko', 0.5));
}

export function update(rt, K) {
  const F = rt.flags, el = rt.t - F.s0.t0, P = rt.player.u.pos;
  const near = Math.hypot(P.x - LINE.x, P.z - LINE.z) < 12;
  // 先手の列へ来た本人を長く待たせず、離れたまま時間だけで開戦しない。
  return el > 5 && near;
}
