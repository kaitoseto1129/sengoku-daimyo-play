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
  const { LINE1, LOOK } = ctx;
  const from = (dx, dz) => ({ x: LINE1.x + dx, z: LINE1.z + dz });
  const stages = [
    DP.rest({ dur: 5, heal: 0.3, banner: ['金ヶ崎の殿', '主力が退ききるまで、ここで食い止める'],
      say: [['木下藤吉郎', '殿はこの藤吉郎が引き受けた！　上様が朽木を越えるまで、一人も通すな！', 4.2]] }),
    DP.hold({
      at: LINE1, r: 11, dur: 95, limit: 200, noRefill: true, label: '川の砦', title: '殿の戦い', sub: '朝倉の本手が川を渡って来る',
      obj: '川の砦で朝倉の本手を食い止めよ。主力を逃がせ',
      waves: [
        { t: 3, say: ['足軽', '川向こうに朝倉の旗が並んだ！　渡って来るぞ！'],
          foes: () => [{ name: '朝倉の本手の追手', from: from(0, -30), formation: 'yari', list: [{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], mass: 200 }] },
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
  hold.tick = (rt2, C, m, context, el, dt) => {
    // 寄せが川の砦へ届く前の待機は、殿の守備に数えない。
    if (!C.contacted) C.contacted = C.groups.some(g => !g.routed && g.units.some(u =>
      u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - LINE1.x, u.pos.z - LINE1.z) < 26));
    tick(rt2, C, m, context, el, dt);
    if (!C.contacted) C.inT = 0;
    // 追手の大将は倒せない設定。全員を倒す共通の終了条件では大将が残り、
    // 七分の期限まで止まる。殿は三度の寄せを受けて定めの間を守れば退く。
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
    () => { F.k15Shingari = 'done'; F.dpOn = false; done(); });
}
