// 千石堀城 ② 3〜6分「外の木柵」：丸太の組が土橋の木戸を打ち、梯子の組が堀端に梯子を渡す。
// 塀の上から鉄砲が降り、堀端から根来衆が回り込んで担ぎ手を狙う。担ぎ手を守るのが自分の役目。木戸は時と手で破れる（体力では伸ばさない）。
import { P, NEGORO, breakStruct } from './scene.js';
import { troops, reports, move, living, near } from '../toyo15/kit.js';
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
    // 移動だけでは丸太は木戸を打たない。中央へ寄せてから木戸を狙わせる。
    // 舞台の仮の耐久99999を残すと、丸太を届かせても時間の救済まで撃たれ続ける。
    // 虎口の門と同じ二十打を上限にし、担ぎ手を守った働きで先へ進める。
    F.kido.hp = Math.min(F.kido.hp, 960);
    F.kido.maxHp = 960;
    F.kido.noTarget = false;
    const approaches = [{ x: -0.6, z: -40 }, { x: 0.6, z: -40 }];
    F.ramG.senRam = true;
    F.ramG.formation = 'column'; F.ramG.colW = 2;
    F.ramG.order = 'assault';
    F.ramG.assault = (u) => {
      if (!F.kido.alive) return null;
      // 経由点の手前で持ち場に着いたと判定されても、門を狙える幅を残す。
      if (Math.abs(u.pos.x) > 2.8) return approaches[u.slot % 2];
      return F.kido;
    };
    F.ramG.assault.gateOnly = true;
    F.ram = makeRam(rt, { group: F.ramG, gate: { struct: F.kido, get breached() { return !F.kido.alive; } }, kind: '丸太' });
    move(F.friends, { x: 2, z: -48 }, true);
    F.work = 0; F.kidoIdle = 0; F.kidoHp = F.kido.hp;
    rt.say('羽柴秀次', '丸太で木戸を破る。梯子の組は堀端へ。担ぎ手を撃たせるな', 4);
    reports(rt, [
      [24, '組頭', null, () => waveA(rt, F)],
      [70, '使番', '積善寺城の寄せ手、外曲輪を取りました！'],
      // 木戸を早く破った時は、古い段の予約で虎口の背後に敵を足さない。
      [88, '組頭', null, () => {
        if (F.step !== 2 || !F.kido.alive) return;
        rt.say('組頭', '東からも来るぞ！', 4);
        F.waveB = troops(rt, false, '東の堀端の根来衆', { x: 34, z: -46 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }], NEGORO, { free: true, aggro: 16 });
        // 11/19 07:25 クラウド 紀州の持ち主：act bot 226秒★「東の堀端の根来衆 号令 move」の足軽が本人のそばで六秒立った（着いた後も歩みの下知のまま③へ残る）。着いたら攻めに替える
        move(F.waveB, { x: 4, z: -44 }, true); F.waveB.onArrive = toAttack;
      }],
      [130, '人夫頭', null, () => {
        if (F.step === 2 && F.kido.alive) rt.say('人夫頭', 'もう少しじゃ！　木戸の閂が割れかけておる！', 4);
      }],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (F.ram) F.ram.tick(dt);
    // 11/22 クラウド 紀州の持ち主：act bot 125秒★★「木戸の印に着いて6秒なにも起きない」＝印に早く着くと西の堀端の根来衆（24秒）を待つだけになる。
    //   本人が木戸の印の十四m 内に着いたら、同じ組を早めに出す（数と刃は同じ）
    if (!F.waveA && t > 6 && near(rt, { x: 0, z: -50 }, 14)) waveA(rt, F);
    const n = living(F.ramG);
    F.work += dt * (n >= 3 ? 1 : n > 0 ? 0.6 : 0.35);   // 担ぎ手が減ると遅れる（自分が守った分だけ早い）
    // 担ぎ手が生きていても、木戸を打てず止まることがある。
    // 虎口の門と同じく、六十秒傷が付かなければ別の寄せ手が突破を補う。
    F.kidoIdle = F.kido.hp < F.kidoHp ? 0 : F.kidoIdle + dt;
    F.kidoHp = F.kido.hp;
    // 木戸が破れた時や作業が済んだ時は、最低時間まで待たせない。
    if (!F.kido.alive || F.work > 115 || F.kidoIdle >= 60 || t > 180) {
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
function waveA(rt, F) {
  if (F.waveA || F.step !== 2 || !F.kido.alive) return;
  rt.say('組頭', '堀端から根来衆が回り込んで来る！　担ぎ手を狙っておるぞ！', 4);
  F.waveA = troops(rt, false, '西の堀端の根来衆', { x: -34, z: -46 }, [{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], NEGORO, { free: true, aggro: 16 });
  move(F.waveA, { x: -6, z: -44 }, true); F.waveA.onArrive = toAttack;
}
function toAttack(q) { q.onArrive = null; q.order = 'attack'; q.dest = null; q.seekRange = Math.max(q.seekRange || 0, 24); }
