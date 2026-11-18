// 千石堀城 ⑤ 12〜15分「本丸」：焼けて崩れた本丸の門から、浅くなった堀を渡って入る。根来衆は最後の一人まで撃つ。
// 守りが崩れると火が煙硝蔵へ入り、大きく炎上する（史実：火が煙硝蔵に入って落城）。
import { P, NEGORO, HASHIBA, breakStruct, sentries, silence } from './scene.js';
import { troops, reports, move, broken, smoke, near, living } from '../toyo15/kit.js';
import { sfx } from '../audio.js';

export default {
  goal: '本丸へ渡り、最後の根来衆を討て',
  pin: { ...P.hon, label: '本丸' },
  enter(rt, F) {
    // 本丸前から再開した時、後続の味方を閉じた木戸や虎口に残さない。
    breakStruct(rt, F.kido); breakStruct(rt, F.gate);
    F.honEntered = false;
    breakStruct(rt, F.honGate);
    rt.world.addFire(-4, 8.5, { size: 1.6, h: 0.6 }); rt.world.addFire(4, 8.5, { size: 1.4, h: 0.6 });
    F.hon = troops(rt, false, '本丸の根来衆', { x: 0, z: 22 }, [{ type: 'ashigaru', n: 12 }, { type: 'gun', n: 5 }, { type: 'samurai', n: 2 }], NEGORO, { aggro: 14 });
    // 本丸の守りは持ち場を保ちつつ、近づいた寄せ手とは自ら打ち合う。
    F.hon.order = 'attack';
    F.honGuns = sentries(rt, '本丸の塀の鉄砲衆', [{ x: -14, z: 9 }, { x: -8, z: 9 }, { x: 8, z: 9 }, { x: 14, z: 9 }], 0.06);
    F.hase = troops(rt, true, '長谷川秀一の手', { x: -4, z: -60 }, [{ type: 'ashigaru', n: 12 }, { type: 'busho', n: 1, o: { name: '長谷川秀一', horse: true } }], { ...HASHIBA, flag: 'toyotomi' }, { free: true });
    for (const g of [F.friends, F.follow, F.hori, F.hase]) if (g) {
      move(g, { x: 0, z: 14 }, true);
      g.onArrive = (q) => { if (F.step === 5) q.order = 'attack'; };
    }
    rt.say('羽柴秀次', '本丸の門が焼け落ちた！　堀を越えよ、本丸じゃ！', 3.5);
    reports(rt, [
      [36, '使番', '根来寺から援けは出ませぬ。城の根来衆は、ここで死ぬ気でございます'],
      [55, '組頭', '煙硝蔵がある！　火が入るぞ、蔵に寄るな！'],
      [72, '足軽', '蔵の屋根から煙が出ておる！　皆、離れよ！'],
      // 11/17 コ四：act bot「本丸で45秒なにも起きない」→ 間を埋める声を二つ足す
      [18, '組頭', '本丸の門は抜けた！　残りの根来衆を討て、続け！'],
      [92, '使番', '本丸の守りは、あと少しで崩れまする！'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    if (p.z > 10 && p.z < 48 && near(rt, P.hon, 20)) F.honEntered = true;
    // 11/17 K358 iMac n-k15：焼けた門の前の瓦礫と堀で本丸の内へ入り切れず、本丸の前で戦い続けて680秒進まなかった（act bot）。150秒を過ぎ、本丸の40m 内で戦っていれば入ったと見る（城外に居るだけでは進まない）
    if (!F.honEntered && t > 150 && near(rt, P.hon, 40)) F.honEntered = true;
    // 11/17 クラウド：外の堀の手前（本丸から46m）で突き続けて600秒止まった（act bot）。240秒を過ぎ、本丸の60m 内まで寄っていれば入ったと見る
    if (!F.honEntered && t > 240 && near(rt, P.hon, 60)) F.honEntered = true;
    smoke(rt, Math.max(0.35, 0.75 - t * 0.004));
    // 11/17 クラウドコ四：本丸の戦いが長く続く間、残りの根来衆の数を右上に出す（act bot「45秒なにも起きない」）
    if (!F.blown && rt.objProgress) rt.objProgress('main', F.honEntered ? `本丸の根来衆 あと${living(F.hon)}人` : `本丸まで あと${Math.round(Math.hypot(p.x - P.hon.x, p.z - P.hon.z) / 10) * 10}m`);
    if (!F.blown && F.honEntered && t > 80 && (broken(F.hon, 0.35) || t > 105)) {
      F.blown = t;
      rt.world.addBlaze(P.store.x, P.store.z, { w: 8, d: 6, h: 4, size: 4 });
      rt.world.addFire(P.store.x, P.store.z, { size: 6, h: 3, blackSmoke: true });
      sfx('gun', 1); sfx('taiko', 0.5);
      rt.army.play?.('volley', P.store, 1.6);
      rt.banner('煙硝蔵、炎上', '千石堀城の本丸が崩れる');
      silence(F.honGuns); silence(F.gateGuns); silence(F.wallGuns);
      if (F.hon) { F.hon.noRout = false; F.hon.morale = 0; }
    }
    return !!F.blown && t - F.blown > 6;
  },
  foes: (rt) => [rt.flags.hon],
  // 城外に取り残されたまま、刻限だけで勝ちにしない。本丸へ着けば進む。
  max: Infinity,
};
