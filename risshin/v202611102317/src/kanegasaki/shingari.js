// ======================================================================
// 金ヶ崎の退き口 15分の構成（docs/oda15_plan_1108.md 8）　④「殿戦・藤吉郎・光秀ら・一定時間食い止める」（9〜13分）
// 一番の見せ場：笙の川の砦で、藤吉郎の殿が朝倉の本手を食い止め、主力（信長の本隊）を若狭への道へ逃がす。
// 渡りの段（deep B）の後、狭路の砦へ退く前に入る。朝倉の騎馬と侍の大きな寄せを三度受け、決めの秒だけ持ちこたえる。
// 呼び方：b_kanegasaki.js の deep('B') の後で start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Shingari) return;
  F.k15Shingari = 'on';
  F.dpOn = true;
  // 11/10 kanegasaki_spec_1109「味方の数は見た目で減らす（本物の AI の数でなく）」：渡りの段の後に続くこの殿の段で、
  //   木下の組が二十二人から一人まで溶けて備が崩れ、act の bot が毎回「合流が間に合わず」で負けた。この段の間だけ殿の組を固くする
  for (const g of F.tono || []) if (g) g.defMult = Math.max(g.defMult || 1, 3);
  const { LINE1, LOOK } = ctx;
  const from = (dx, dz) => ({ x: LINE1.x + dx, z: LINE1.z + dz });
  const stages = [
    DP.rest({ dur: 5, heal: 0.3, banner: ['金ヶ崎の殿', '主力が退ききるまで、川の砦で食い止める'],
      say: [['木下藤吉郎', '殿はこの藤吉郎が引き受けた！　上様が朽木を越えるまで、一人も通すな！', 4.2]] }),
    DP.hold({
      at: LINE1, r: 11, dur: 95, limit: 200, noRefill: true, label: '川の砦', title: '殿の戦い', sub: '朝倉の本手が川を渡って来る',
      obj: '川の砦で朝倉の本手を食い止めよ。主力を逃がせ',
      waves: [
        { t: 3, say: ['足軽', '川向こうに朝倉の旗が並んだ！　渡って来るぞ！'],
          foes: () => [{ name: '朝倉の本手の追手', from: from(0, -30), formation: 'yari', list: [{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], mass: 200 }] },
        { t: 12, say: ['朝倉の侍大将', '織田の殿を踏み潰せ！　信長を逃がすな！'], foes: () => [] },
        { t: 35, say: ['池田勝正', '騎馬が浅瀬を回るぞ！　横を固めよ！'],
          foes: () => [{ name: '朝倉の騎馬', from: from(-24, -18), list: [{ type: 'cavalry', n: 4 }, { type: 'samurai', n: 1 }], mass: 80 }] },
        { t: 65, say: ['使番', '上様の本隊、若狭への道に入られました！　あと少し！'],
          foes: () => [{ name: '朝倉の新手', from: from(16, -26), list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], mass: 120 }] },
      ],
      reward: '金ヶ崎の殿で朝倉の本手を食い止めた',
      // 守備を離れて失敗した時は、後の退き口で成功へ変えない。
      onEnd: (rt2, m, won) => { if (!won) m.kgFailed = true; },
    }),
    DP.rest({ dur: 5, heal: 0.3, banner: ['主力は抜けた', '殿も狭路の砦へ退く'],
      say: [['木下藤吉郎', 'ようやった！　上様は抜けられた。わしらも退くぞ、狭路の砦まで走れ！', 4]] }),
  ];
  for (const stage of stages) stage.idleAdvance = false;
  const hold = stages[1], tick = hold.tick, end = hold.end;
  // 到着待ちと接敵後の守備を別に数える。共通の期限では先に打ち切らない。
  hold.limit = Infinity; hold.noHardCap = true;
  hold.tick = (rt2, C, m, context, el, dt) => {
    const held = C.inT;
    // 寄せが川の砦へ届く前の待機は、殿の守備に数えない。
    if (!C.contacted) C.contacted = C.groups.some(g => !g.routed && g.units.some(u =>
      u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - LINE1.x, u.pos.z - LINE1.z) < 26));
    tick(rt2, C, m, context, el, dt);
    // 共通の守備は旗から四十一メートルまで数える。ここでは川の砦を
    // 離れても守ったことにならないよう、指定した十一メートル内だけ数える。
    const p = rt2.player.u.pos;
    // 11/10 関所：十一メートルでは砦の柵の前で槍を合わせる間が数えられず、act の bot が三度とも期限（二百秒）で失敗→殿が崩れて負けた。
    //   柵のすぐ前で寄せを受ける所（二十二メートル）までは守っている事にする。川を渡って追い回せば数えない。
    const defending = Math.hypot(p.x - LINE1.x, p.z - LINE1.z) < 22;
    // 川の北で三度の寄せを退けた場合も、砦で守備を続けられるようにする。
    // 未到着の控えと未投入の波は除外せず、空の隊だけで達成にしない。
    if (!C.contacted && defending && !C.waves.length &&
      C.groups.some(g => g.units.length > 0) &&
      C.groups.every(g => !g.kgPending && (g.routed || g.order === 'flee' ||
        !g.units.some(u => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget)))) C.contacted = true;
    C.inT = held + (C.contacted && defending ? dt : 0);
    // 二百秒近くで追手が着いても、必要な守備時間を残す。一度だけ延ばし、
    // 持ち場を離れたり未到着のままだったりしても、無期限には待たせない。
    if (C.contacted && !C.contactDeadlineSet) {
      C.contactDeadlineSet = true;
      C.deadline = Math.max(200, el + 95 * 0.6 + 1);
    }
    if (el >= (C.deadline ?? 200)) { C.timeout = true; return true; }
    // 追手の全滅は求めない。殿は三度の寄せを受けて定めの間を守れば退く。
    return C.contacted && el >= 95 && !C.waves.length && C.inT >= 95 * 0.6;
  };
  hold.end = (rt2, C, m) => {
    // 共通の守備判定は時間切れでも滞在秒だけで達成にするため、
    // 接敵後の守備不足・期限切れは必ず失敗として後の退きへ渡す。
    if (C.timeout || !C.contacted || C.inT < 95 * 0.6) C.inT = 0;
    end(rt2, C, m);
  };
  const withdrawal = stages[2], withdrawalStart = withdrawal.start;
  const failedWithdrawal = DP.rest({ dur: 5, heal: 0.3,
    banner: ['川の砦を守りきれぬ', '残った組と若狭への道へ退く'],
    say: [['木下藤吉郎', '備が持たぬ！　残った者を集め、若狭への道へ退け！', 4]] });
  withdrawal.start = (rt2, C, m, context) =>
    (m.kgFailed ? failedWithdrawal.start : withdrawalStart)(rt2, C, m, context);
  depthStart(rt, { ...ctx, look: LOOK, scale: 1.0, dmg: 0.5 }, stages,
    () => { F.k15Shingari = 'done'; F.dpOn = false; for (const g of F.tono || []) if (g && g.defMult > 1.6) g.defMult = 1.6; done(); });
}
