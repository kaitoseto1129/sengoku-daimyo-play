// 千石堀城 ③ 6〜9分「虎口の門前」：土橋の上は塀と門の楼から撃たれ、寄せ手がばたばたと倒れる（大損害）。
// 「押せ！止まるな！」。後ろには筒井の新手と数万の後詰。丸太が門を打ち、門が破れると二の丸の根来衆が出て来る。
import { P, NEGORO, HASHIBA, breakStruct, sentries } from './scene.js';
import { troops, host, reports, move, living, fallOne, near } from '../toyo15/kit.js';
import { makeRam } from '../hajo.js';

export default {
  goal: '土橋を渡り、虎口の門を破れ',
  pin: { x: 0, z: -38, label: '虎口の門' },
  enter(rt, F) {
    // この段から再開しても、済んだ外の木戸を閉じたままにしない。
    breakStruct(rt, F.kido);
    F.niGuard = troops(rt, false, '虎口の根来衆', { x: 0, z: -22 }, [{ type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }, { type: 'samurai', n: 1 }], NEGORO);
    F.niGuard.stay = true;
    F.gateGuns = sentries(rt, '虎口の楼の鉄砲衆', [{ x: -5, z: -31 }, { x: 5, z: -31 }], 0.07);
    F.follow = troops(rt, true, '筒井の寄せ手', { x: -4, z: -100 }, [{ type: 'ashigaru', n: 14 }, { type: 'busho', n: 1, o: { name: '筒井定次', horse: true } }], { ...HASHIBA, flag: 'umebachi' }, { free: true });
    move(F.follow, { x: -2, z: -42 }, true);
    F.hostRear = host(rt, { x: 0, z: -108, w: 70, d: 24, count: 760, facing: 0, seed: 1104 });
    F.hostRear.advance(18, 60);
    if (living(F.ramG) < 2) {
      F.ramG = troops(rt, true, '新しい丸太の組', { x: 4, z: -92 }, [{ type: 'porter', n: 6, o: { armor: 0x4a4034, flag: null } }], HASHIBA, { aggro: 0, seek: 0 });
      rt.say('人夫頭', '新しい丸太を運べ！', 2.5);
    }
    move(F.ramG, { x: 0, z: -35 });
    F.ram = makeRam(rt, { group: F.ramG, gate: { struct: F.gate, get breached() { return !F.gate.alive; } }, kind: '丸太' });
    move(F.friends, { x: 0, z: -40 }, true);
    F.fallT = 0; F.ramWork = 0; F.gateT = null;
    reports(rt, [
      [6, '羽柴秀次', '押せ！　止まるな！　門の前で止まれば撃ち殺されるぞ！'],
      [40, '組頭', '前の者がまた倒れた！　屍を越えて進め！'],
      [75, '使番', '筒井勢、堀を越えに掛かります。堀の底も根来の鉄砲で埋まっております'],
      [115, '羽柴秀次', '門が揺らいだ！　丸太を離すな！'],
      [145, '組頭', '閂が折れかけておる！　あと一息じゃ、楼の鉄砲に構うな！'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (F.ram) F.ram.tick(dt);
    // 門前の大損害：土橋の上の味方が撃たれて倒れる（門が破れるまで）
    if (F.gate.alive && (F.fallT -= dt) <= 0) { F.fallT = 9 + Math.random() * 4; fallOne(rt, [F.follow, F.friends], { x: 0, z: -38, r: 12 }); }
    const n = living(F.ramG);
    F.ramWork += dt * (n >= 3 ? 1 : n > 0 ? 0.6 : 0.3);
    if (F.gate.alive && t > 140 && (F.ramWork > 110 || t > 175)) {
      breakStruct(rt, F.gate);
    }
    // 丸太などが先に門を破っても、開門後の進行を一度だけ始める。
    if (!F.gate.alive && F.gateT === null) {
      F.gateT = t;
      F.niGuard.stay = false; move(F.niGuard, { x: 0, z: -36 }, true); F.niGuard.aggro = 16;
      rt.say('羽柴秀次', '虎口が開いた！　二の丸へ斬り込め！', 3);
    }
    return !F.gate.alive && t - F.gateT > 18 && (near(rt, P.gate, 18) || t - F.gateT > 40);
  },
  foes: (rt) => [rt.flags.niGuard],
  botLeash: 26,
  max: 250,
};
