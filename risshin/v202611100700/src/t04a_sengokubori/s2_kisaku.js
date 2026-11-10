// 千石堀城 ② 3〜6分「外の木柵」：丸太の組が土橋の木戸を打ち、梯子の組が堀端に梯子を渡す。
// 塀の上から鉄砲が降り、堀端から根来衆が回り込んで担ぎ手を狙う。担ぎ手を守るのが自分の役目。木戸は時と手で破れる（体力では伸ばさない）。
import { P, NEGORO, breakStruct } from './scene.js';
import { troops, reports, move, living } from '../toyo15/kit.js';
import { makeRam } from '../hajo.js';
import { allyGroup } from '../bhelp.js';

const porters = (rt, name, at) => {
  const g = allyGroup(rt, { faction: 'oda', name, anchor: at, width: 5, fixed: true, fullStrength: true, aggro: 0, seekRange: 0 },
    [{ type: 'porter', n: 6, o: { armor: 0x4a4034, flag: null } }]);
  g.noAI = true; return g;
};
export default {
  goal: '外の木柵で、丸太と梯子の組を守れ',
  pin: { x: 0, z: -50, label: '土橋の木戸' },
  enter(rt, F) {
    F.ramG = porters(rt, '丸太の組', { x: -3, z: -92 });
    F.ladder = porters(rt, '梯子の組', { x: 6, z: -94 });
    move(F.ramG, { x: 0, z: -40 }); move(F.ladder, { x: -14, z: -40 });
    F.ram = makeRam(rt, { group: F.ramG, gate: { struct: F.kido, get breached() { return !F.kido.alive; } }, kind: '丸太' });
    move(F.friends, { x: 2, z: -48 }, true);
    F.work = 0;
    rt.say('羽柴秀次', '丸太で木戸を破る。梯子の組は堀端へ。担ぎ手を撃たせるな', 4);
    reports(rt, [
      [24, '組頭', '堀端から根来衆が回り込んで来る！　担ぎ手を狙っておるぞ！', () => {
        F.waveA = troops(rt, false, '西の堀端の根来衆', { x: -34, z: -46 }, [{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], NEGORO, { free: true, aggro: 16 });
        move(F.waveA, { x: -6, z: -44 }, true);
      }],
      [70, '使番', '積善寺城の寄せ手、外曲輪を取りました！'],
      [88, '組頭', '東からも来るぞ！', () => {
        F.waveB = troops(rt, false, '東の堀端の根来衆', { x: 34, z: -46 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }], NEGORO, { free: true, aggro: 16 });
        move(F.waveB, { x: 4, z: -44 }, true);
      }],
      [130, '人夫頭', 'もう少しじゃ！　木戸の閂が割れかけておる！'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (F.ram) F.ram.tick(dt);
    const n = living(F.ramG);
    F.work += dt * (n >= 3 ? 1 : n > 0 ? 0.6 : 0.35);   // 担ぎ手が減ると遅れる（自分が守った分だけ早い）
    if (t > 150 && (!F.kido.alive || F.work > 115 || t > 180)) {
      if (F.kido.alive) breakStruct(rt, F.kido);
      rt.say('羽柴秀次', '木戸が破れた！　土橋へ押し出せ！', 3);
      return true;
    }
    return false;
  },
  foes: (rt) => [rt.flags.waveA, rt.flags.waveB],
  leave(rt, F) {
    // 次の段で丸太を作り直す前に、古い丸太と担ぎ手の手の固定を解く。
    breakStruct(rt, F.kido);
    if (F.ram) F.ram.tick(0);
  },
  max: 240,
};
