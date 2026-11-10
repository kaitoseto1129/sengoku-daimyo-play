// 千石堀城 ④ 9〜12分「二の丸の火」：東の堀の外から中坊秀行の組が火矢を射込み、二の丸の小屋が次々に燃える。
// 煙で見通しが落ち、本丸から根来衆が下りて来て最後まで抗う。味方も倒れる。
import * as THREE from 'three';
import { P, NEGORO, HASHIBA, breakStruct } from './scene.js';
import { troops, reports, move, broken, fallOne, smoke } from '../toyo15/kit.js';
import { sfx } from '../audio.js';

let ARROW_GEO = null;
export default {
  goal: '二の丸で根来衆と戦え。燃える小屋に寄るな',
  pin: { x: 0, z: -20, label: '二の丸' },
  enter(rt, F) {
    // 再開時にも、二の丸までの寄せ口は突破済み。
    breakStruct(rt, F.kido); breakStruct(rt, F.gate);
    F.archers = troops(rt, true, '中坊秀行の火矢の組', P.archer, [{ type: 'bow', n: 6 }], HASHIBA, { facing: -Math.PI / 2 });
    F.archers.stay = true;
    // 新手：堀秀政の手が後ろから入る（門前で討たれた分を埋める。戦場を空にしない）
    F.hori = troops(rt, true, '堀秀政の手', { x: 6, z: -70 }, [{ type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }, { type: 'busho', n: 1, o: { name: '堀秀政', horse: true } }], { ...HASHIBA, flag: 'hori' }, { free: true });
    for (const g of [F.friends, F.follow, F.hori]) move(g, { x: 0, z: -22 }, true);
    rt.after(3, () => rt.say('堀秀政', '堀の手、入るぞ！　討たれた者の分まで押せ！', 3));
    if (F.niGuard) { F.niGuard.stay = false; move(F.niGuard, { x: -2, z: -18 }); F.niGuard.aggro = 14; }
    if (!ARROW_GEO) { ARROW_GEO = new THREE.CylinderGeometry(0.03, 0.03, 1.8, 4); ARROW_GEO.rotateZ(Math.PI / 2); }
    F.arrow = new THREE.Mesh(ARROW_GEO, new THREE.MeshBasicMaterial({ color: 0xff9b32 }));
    F.arrow.visible = false; rt.scene.add(F.arrow);
    F.burnN = 0; F.shotAt = 8; F.smokeK = 0; F.fallT = 10;
    rt.say('中坊秀行', '東の堀の外から火矢を射込む！　燃える小屋に寄るでないぞ！', 4);
    reports(rt, [
      [45, '組頭', '本丸から根来衆が下りて来た！', () => {
        F.down = troops(rt, false, '本丸から下りた根来衆', { x: 2, z: -12 }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], NEGORO, { aggro: 16 });
        move(F.down, { x: 3, z: -16 });
      }],
      [70, '使番', '積善寺城、なお囲みの中。畠中は焼け落ちました'],
      [100, '組頭', '煙で前が見えぬ！　声を掛け合え、味方を斬るな！'],
      [112, '根来の頭', '根来の者は退かぬ！　ここで死ね！', () => {
        F.kashira = troops(rt, false, '根来の頭の組', { x: -6, z: -13 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], NEGORO, { aggro: 18 });
        move(F.kashira, { x: -3, z: -17 });
      }],
      [150, '羽柴秀次', '本丸の門が焼けておる。あそこから入れるぞ'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags, W = rt.world;
    // 火矢：二十秒ごとに一本、東から二の丸の小屋へ弧を描いて飛ぶ。当たると小屋が燃える
    if (F.burnN < F.niHuts.length && t > F.shotAt) {
      const h = F.niHuts[F.burnN], k = Math.min(1, (t - F.shotAt) / 2);
      if (!F.arrow.visible) { F.arrow.visible = true; sfx('arrow', 0.7); }
      const a = P.archer;
      F.arrow.position.set(a.x + (h.x - a.x) * k, W.heightAt(a.x, a.z) + 2 + 9 * Math.sin(Math.PI * k), a.z + (h.z - a.z) * k);
      F.arrow.rotation.y = Math.atan2(-(h.z - a.z), h.x - a.x);
      if (k >= 1) { F.arrow.visible = false; W.addBlaze(h.x, h.z, { w: h.w, d: h.d, h: 3.2 }); F.burnN++; F.shotAt = t + 22; }
    }
    F.smokeK = Math.min(0.75, F.smokeK + dt * 0.012 * F.burnN);
    smoke(rt, F.smokeK);
    if (t < 160 && (F.fallT -= dt) <= 0) { F.fallT = 17 + Math.random() * 6; fallOne(rt, [F.follow, F.friends, F.hori], { x: 0, z: -20, r: 16 }); }
    const quiet = broken(F.niGuard, 0.3) && broken(F.down, 0.35) && broken(F.kashira, 0.4);
    return t > 170 && !!F.kashira && (quiet || t > 195);
  },
  leave(rt, F) { for (const g of [F.niGuard, F.down, F.kashira]) if (g) { g.noRout = false; g.morale = 0; move(g, { x: 0, z: 26 }); } },
  foes: (rt) => [rt.flags.niGuard, rt.flags.down, rt.flags.kashira],
  max: 250,
};
