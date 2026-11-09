// ======================================================================
// 天王寺の戦い　籠城の中の段「原田討死の報せ・西の柵の破れ」（3〜6分。b_tennoji.js の siege から入れる）
// 史実：原田直政の討死で、砦は救いの無いまま一万五千に囲まれた（公記巻九）。砦が長く持たないとの注進が信長へ走った。
// 遊び：籠城の初めの寄せを防ぐと、原田の家来が直政の馬印を抱えて来て、討死が確かになる（味方の気落ち）。
//   続いて西の柵に火が付き、燃えて倒れた所から門徒が砦の内へ雪崩れ込む＝砦の危機。破れ口へ走って塞ぐ。
//   後詰（信長）の段は、この段が済むまで（遅くとも籠城から約三分）始めない（b_tennoji.js の breakIn が F.holdBreakUntil を見る）。
// 字は出さない：燃える柵・倒れる柵・赤い印の門徒で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

const BREACH = { x: -22, z: -66 };   // 西の柵の破れ口（外曲輪の西の辺の中ほど）

export function install(rt, ctx) {
  const F = rt.flags;
  const { march, spent, dress, IKKO, GATE_REAR } = ctx;
  const t0 = rt.t;
  F.holdBreakUntil = t0 + 250;
  let wall = null, burnSaid = false, crisis = false, crisisT = 0, done = false;
  // 西の辺の中ほどの柵（F.C.walls の中で破れ口に一番近い物）
  let best = 1e9;
  for (const w of F.C?.walls || []) {
    if (!w?.seg || !w.alive) continue;
    const mx = (w.seg[0] + w.seg[2]) / 2, mz = (w.seg[1] + w.seg[3]) / 2, d = Math.hypot(mx - BREACH.x, mz - BREACH.z);
    if (d < best) { best = d; wall = w; }
  }
  if (best > 12) wall = null;

  // 原田の家来が直政の馬印を抱えて来る（35秒）。気落ちを見せ、光秀が立て直す
  rt.after(35, () => {
    if (F.ending || rt.over) return;
    sfx('kane', 0.5);
    rt.say('原田の家来', '原田直政様は、木津で討死なされた……。馬印だけを持ち帰りました。', 4);
    for (const g of [F.ake, F.fgun, F.harada]) if (g && !spent(g)) g.morale = Math.min(g.morale || 100, 62);
    rt.after(5, () => { if (!F.ending) rt.say('明智光秀', '弔いは後じゃ。殿（信長）は必ず来られる。砦を守れ！', 4); });
    rt.after(9, () => { for (const g of [F.ake, F.fgun, F.harada]) if (g && !spent(g)) g.morale = Math.max(g.morale || 0, 85); });
  });

  // 柵の外に門徒の寄せ（破れ口を狙う組）。初めは柵の外で火を掛ける
  // 柵の外の寄せ（火を掛ける者。外の空堀の際に留まる背景の組）と、柵が倒れた所から入る組（破れ口で現れる）
  const O = enemyGroup(rt, { name: '西の柵に火を掛ける門徒', anchor: { x: BREACH.x - 16, z: BREACH.z + 4 }, facing: Math.PI / 2, width: 6, order: 'hold', guard: true, guardLeash: 4, aggro: 6, morale: 85, faction: 'honganji', fleeDir: { x: -1, z: -0.3 } },
    dress([{ type: 'ashigaru', n: 3 }, { type: 'bow', n: 2 }], IKKO));
  F.foes.push(O);
  let B = null;

  // 60秒：西の柵に火が付く。燃え落ちる（約一分）か、85秒で破れ口から雪崩れ込む
  rt.after(60, () => {
    if (F.ending || rt.over || done) return;
    if (wall?.alive && rt.army.igniteStruct) {
      const p = { x: (wall.seg[0] + wall.seg[2]) / 2, z: (wall.seg[1] + wall.seg[3]) / 2 };
      for (let i = 0; i < 3; i++) rt.army.igniteStruct(wall, p);
    }
    rt.army.play?.('eshout', { x: BREACH.x - 10, z: BREACH.z }, 1.4);
    burnSaid = true;
    // 柵の外へ寄って火を掛ける（燃え落ちたら、外の者から順に破れ口を越える）
    O.ai = false; O.guard = false; O.fixed = false; O.order = 'move'; O.dest = { x: BREACH.x - 9, z: BREACH.z }; O.aggro = 2;
    O.onArrive = (q) => { q.order = 'hold'; q.guard = true; q.guardLeash = 3; q.facing = Math.PI / 2; };
    rt.say('砦の足軽', '西の柵に火が付いた！　柵が燃え落ちるぞ！', 3.5);
    rt.marker('yabure', { x: BREACH.x + 3, z: BREACH.z }, '西の柵の破れ口', { h: 3, guideAlways: true, guidePriority: 450 });
    rt.obj('yabure', '西の柵の破れ口へ走り、入る門徒を払え', 'order');
  });

  const breach = () => {
    if (crisis) return;
    crisis = true; crisisT = rt.t;
    if (wall?.alive) { wall.hp = 0; wall.alive = false; rt.army.structFall?.(wall); }
    sfx('crash', 0.8);
    rt.army.play?.('eshout', BREACH, 1.6);
    rt.banner('西の柵が破れた', '門徒が砦の内へ入る');
    B = enemyGroup(rt, { name: '破れ口から入る門徒', anchor: { x: BREACH.x + 2.5, z: BREACH.z }, facing: Math.PI / 2, width: 4, order: 'hold', aggro: 20, morale: 85, faction: 'honganji', fleeDir: { x: -1, z: -0.3 } },
      dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 5 }], IKKO));
    F.breachG = B;
    F.foes.push(B);
    B.ai = false; B.guard = false; B.noRing = true;
    march(B, [[BREACH.x + 8, BREACH.z], [GATE_REAR.x - 6, GATE_REAR.z - 8]], 'attack');
    B.seekRange = 24; B.aggro = 20;
    rt.marker('yabureFoe', () => (spent(B) ? null : B.center()), '破れ口の門徒', { red: true, group: B });
    // 明智の後ろの槍も破れ口へ回す（主人公ひとりに任せない）
    const R = F.rearGuard;
    if (R && !spent(R)) { R.ai = true; R.guard = false; R.order = 'attack'; R.seekRange = 30; R.dest = { x: BREACH.x + 6, z: BREACH.z }; }
  };

  // 165秒：北の空堀を門徒が登る（破れ口の次の寄せ。後詰の前の最後の危機）
  let north = null;
  rt.after(150, () => {
    if (F.ending || rt.over || F.step !== 2.5) return;
    sfx('gun', 0.5);
    rt.army.play?.('eshout', { x: 6, z: -100 }, 1.0);
    rt.after(12, () => {
      if (F.ending || rt.over || F.step !== 2.5) return;
      // 空堀を登り切った所（柵の内の北の際）に現れる
      north = enemyGroup(rt, { name: '北の空堀を登った門徒', anchor: { x: 6, z: -86.5 }, facing: 0, width: 6, order: 'hold', aggro: 20, morale: 85, faction: 'honganji', fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 5 }], IKKO));
      F.northClimb = north;
      F.foes.push(north);
      rt.army.play?.('eshout', { x: 6, z: -95 }, 1.4);
      rt.say('砦の足軽', '北じゃ！　空堀を登って来るぞ！　主郭の裏が破られる！', 3.5);
      march(north, [[GATE_REAR.x + 4, GATE_REAR.z - 14]], 'attack');
      north.seekRange = 24; north.aggro = 20;
      rt.obj('kita', '北の空堀を登る門徒を払え', 'order');
      rt.marker('kita', () => (spent(north) ? null : north.center()), '北の門徒', { red: true, group: north });
    });
  });

  let tick = 0;
  return {
    update(dt) {
      if (F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      if (north && !F.northDone) {
        let n = 0;
        for (const u of north.units) if (u.alive && !u.fleeing && !u.woundOut) n++;
        if (rt.t > 0 && F.step === 2.5) rt.objProgress('kita', n ? `北の門徒 ${n}人` : '');
        if (!n || F.step !== 2.5) {
          F.northDone = true; rt.unmark('kita');
          if (!n) { rt.objDone('kita'); rt.award((t) => t.side.push('北の空堀を登った門徒を払った'), '北の空堀の門徒を払った'); }
          else rt.objRemove('kita');
        }
      }
      if (done) return;
      if (burnSaid && !crisis && (!wall || !wall.alive || el > 85)) breach();
      if (crisis) {
        let live = 0;
        for (const u of B.units) if (u.alive && !u.fleeing && !u.woundOut) live++;
        rt.objProgress('yabure', live ? `破れ口の門徒 ${live}人` : '');
        if (!live || rt.t - crisisT > 80 || F.step !== 2.5) {
          done = true;
          rt.unmark('yabure'); rt.unmark('yabureFoe');
          if (!live) {
            rt.objDone('yabure');
            rt.award((t) => t.side.push('燃え落ちた西の柵の破れ口を塞いだ'), '西の柵の破れ口を塞いだ');
            rt.say('明智光秀', '破れ口は塞いだ。もう少しじゃ、持ちこたえよ！', 3.5);
          } else rt.objRemove('yabure');
          // 破れ口を塞いだら、後詰の段を待たせすぎない
          F.holdBreakUntil = Math.min(F.holdBreakUntil, Math.max(rt.t + 25, t0 + 230));
          rt.after(6, () => { if (F.step === 2.5 && !F.ending) rt.say('物見の櫓', '南に旗！　住吉口から木瓜の旗が来るぞ！', 4); });
        }
      }
    },
  };
}
