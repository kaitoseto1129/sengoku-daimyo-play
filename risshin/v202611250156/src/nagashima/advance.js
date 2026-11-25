// ======================================================================
// 長島一向一揆　作り直し（kaito 11/9 夜 docs/nagashima_spec_1109.md「逃げ場がなくなっていく」）
// 岸の物見（monomi.js）の後、細い堤 → 堤の砦 → 舟着場（水路）→ 寺内の在所 → 囲みを閉じる → 最後の突破 → 堤の上の終わり。
// 段は共通の b_depth.js（fight・hold・move・rest）に、長島の決まりを足して使う：
//   ・制圧は全滅でなく、寄せた数の七割が崩れるか、門徒頭が倒れるか、刻限で進む（残兵は奥へ退く）
//   ・特定の NPC・舟の到着・本人の一太刀に頼らない（残兵を探し続けない刻限）
//   ・非戦の民（war_people の群れ）は狙いの外。武器を持つ門徒だけが敵
// 座標は b_nagashima.js の地形（堤 x=-46、堤の砦 -50,-58、西の分流 x≈-64、願証寺 -44,-82、南の川 z≈-134）に合わせる。
// ======================================================================
import { sfx } from '../audio.js';
import { fight, hold, move, rest } from '../b_depth.js';
import { TSUTSUMI_PLAN } from '../castles/nagashima.js';

// 砦の柵を斜めに横切らず、実際の木戸の中央へ寄ってから抜ける。
// 案内と試し役で同じ道を使い、曲がり角の入れ物は使い回す。
export function fortWay(u, goal) {
  const p = u.pos;
  const gates = TSUTSUMI_PLAN.koguchi;
  const south = goal.z < p.z;
  // 南の木戸から戻る時、北の木戸や砦の持ち場へ直行すると番所の角を横切る。
  // 西の通路を北へ抜けてから曲がり、案内の印も同じ道へ置く。
  if (!south && p.z >= gates[gates.length - 1].at[1] + 1.5 && p.z < -56 && goal.z >= -56 &&
      p.x >= -60 && p.x <= -40) {
    const q = u._ngFortWay || (u._ngFortWay = { x: 0, z: 0, botRadius: .35 });
    q.x = -54;
    q.z = Math.abs(p.x + 54) > .6 ? p.z : -56;
    return q;
  }
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[south ? i : gates.length - 1 - i];
    const [x, z] = gate.at;
    const dir = south ? -1 : 1;
    if ((goal.z - z) * dir <= 0 || (p.z - z) * dir >= 1.5) continue;
    // 砦の横を通るだけの道は引き戻さない。砦の内にいる間は、
    // 行き先が左右へ外れても木戸を抜けてから曲がる。
    if (p.x < -60 || p.x > -40) continue;
    const q = u._ngFortWay || (u._ngFortWay = { x: 0, z: 0, botRadius: .35 });
    // 11/18 cloud-27 の照らし（長島③△・200秒で本人が砦の物見の木組みに入り込み二十秒動けない）：南の木戸（-54,-65）へ x=-54 を真っすぐ下りると、
    //   物見（-55,-60・幅四m）の脚の間を通る。物見と番所の間（x=-51.8）を物見の南の端より下まで下りてから、木戸の前へ寄る
    if (south && gate.id === 'tsutsumi_oku_gate' && p.z > -63.6) {
      q.x = -51.8; q.z = Math.abs(p.x + 51.8) > .4 ? p.z : -63.9;   // 物見の東の端（-53.1）と番所（castles/nagashima.js bank_watch・西の端 -50.5）の間
      return q;
    }
    q.x = x;
    q.z = Math.abs(p.x - x) > .6 ? p.z : z + dir * 2;
    return q;
  }
  return goal;
}

export const ADV_MISSIONS = [
  '堤の上へ上がり、輪中と門徒の砦を見よ',
  '前方の堤を確保せよ',
  '第一砦を制圧せよ',
  '水路を確保せよ',
  '在所の門徒を退けよ',   // 11/17 クラウド kaito2 K365：数（10/17）が付くと右上の札で二行に割れた。短く
  '最後の脱出路を封鎖せよ',
  '最後の突破を食い止めよ',
  '堤の上を歩け',
];
// チェックポイント（指示書の CP1〜CP6）→ 段の番号
export const ADV_CP = { 1: 0, 2: 3, 3: 5, 4: 8, 5: 10, 6: 13 };

const P = {
  dikeHead: { x: -46, z: -10 },
  dikeFront: { x: -46, z: -42 },
  fort: { x: -50, z: -55 },
  landing: { x: -57, z: -76 },
  village: { x: -54, z: -100 },  // 舟着場から本堂（-53〜-35, -94〜-74）の西の小道をまっすぐ南へ下りた在所の口
  exit: { x: -36, z: -122 },
  walk: { x: -52, z: -123 },     // 左に南の川、右に燃える在所（東の大きな堂の脇は避ける）
};
export const ADV_POINTS = P;

// 生きて戦える者の数（崩れた・逃げた・深手の者を除く）
function fighters(C) {
  let n = 0;
  for (const g of C.groups) if (!g.routed && g.order !== 'retreat') for (const u of g.units) {
    // 深手で後送された者や武器を捨てた者を、残る守兵として探させない。
    // 転倒は数秒後に起き上がるため、撃退済みには数えない。
    if (u.alive && u.hp > 0 && !u.dying && !u.gone && !u.fleeing && !u.woundOut &&
        !u.rearWound && !u.noTarget && !u.civ && !u.isStruct) n++;
  }
  return n;
}
// 本人が戦線を保った後の刻限。柵や水路に残った隊にも撤退を命じ、
// 頭が生きていても下知で退けるよう、行き先も渡す。
function withdraw(C) {
  for (const g of C.groups) {
    // 既に退く隊にも攻撃停止を伝える。退路は既存の下知を保つ。
    for (const u of g.units) {
      u.target = null; u.atk = null; u.swing = null; u.bind = null; u.reload = null;
      u.charging = false;
    }
    // 個々の狙いだけを消しても、隊の攻撃対象が残ると再び狙い直してしまう。
    g.fire = false; g.focus = null;
    if (g.routed || g.order === 'retreat') continue;
    g.noRout = false; g.morale = 0; g.order = 'retreat';
    // 南の舟入りでは川へ下がらず、家族のいる在所の側へ退く。
    g.dest = { x: C.at.x, z: C.at.z + (C.at.z < -110 ? 24 : -24) };
  }
}
// 制圧の段：本人が持ち場へ進み、寄せた数の ratio が崩れたら残りは奥へ退く。
function take(o) {
  const st = fight({ ...o, noRefill: true });
  const tick = st.tick;
  const end = st.end;
  // 全滅ではなく拠点の制圧。残兵の中心へ案内すると、必要な持ち場から外れてしまう。
  st.killAll = false;
  st.leadAt = o.leadAt;   // 立つだけの本人が寄る所（b_nagashima.js の autoLeadTarget。木戸の内まで入らないと済まない砦）
  st.idleAdvance = false; st.noHardCap = true; st.limit = Infinity;
  st.tick = (rt, C, m, ctx, el, dt) => {
    const cleared = tick(rt, C, m, ctx, el, dt);
    C.goal = C.at;
    const u = rt.player.u;
    // 11/18 夜50-28：堤の先・堤の砦で敵が全部退いた後、本人が印の8〜17歩手前に立ったまま六歩の内に入らず、四十〜五十秒何も起きなかった（描かずの流し二回）。
    //   戦う敵も後から来る敵も残っていない時は二十歩の内で済ませる
    const empty = !C.later.length && (C.nTot || 0) > 0 && fighters(C) === 0;
    const present = u.alive && u.hp > 0 && !u.downed && !u.dying && !u.gone && !u.woundOut && !u.rearWound && !u.fleeing &&
      // 11/16 owner-4：舟着場の六歩の内へ水と舟に阻まれて入れず「水路を確保せよ」のまま時切れ（act bot 0031・0300）。二分たてば十五歩の内で数える
      Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (empty ? 20 : el > 120 ? 15 : 6) && (el > 120 || empty || !o.reached || o.reached(u.pos));
    C.takeT = (C.takeT || 0) + (present ? dt : 0);
    // 11/16 owner-4：十五歩にしても舟着場の段が十五分続いた（0331）。五分たって本人が四十歩内なら残りは退き、段を済ませる
    // 11/17 クラウド kaito2 K365：act が堤の先 (-46,-42) を越えて砦の前 (-54,-56)＝十六歩先に立ち、「前方の堤を確保せよ」が三百秒動かなかった。五分→二分
    if (el > 90 && u.alive && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 40) {   // 11/18 クラウド k365-cloud-28：120→90秒（戦全体が九〜十一分）
    withdraw(C); C.later.length = 0; return true; }
    // 味方だけで敵を退けても、本人が来ないまま制圧にはしない。
    if (!present || C.takeT < 3) return false;
    if (C.later.length) return false;
    if (cleared) return true;
    const tot = C.nTot || 0;
    if (tot && (tot - fighters(C)) / tot >= (o.ratio ?? 0.7)) return true;
    if (o.leader && C.groups.some((g) => g.leader && !g.leader.alive) && (tot - fighters(C)) / tot >= 0.4) return true;
    // 刻限を越えた残兵には撤退の下知を出す。本人不在・後続待ちではここへ来ない。
    // 持ち場を離れて過ごした時間では撤退を起こさない。
    // 経過時間だけを見ると、長く放置した後に三秒来るだけで砦が落ちていた。
    if (C.takeT > (o.cap || 170)) { withdraw(C); return false; }
    return false;
  };
  // 七割の崩れや門徒頭の討死でも、残兵には次の拠点への撤退先を渡す。
  // 共通の終了処理の士気低下だけでは、攻撃の下知と射撃が残っていた。
  st.end = (rt, C, m, ctx) => {
    withdraw(C);
    end?.(rt, C, m, ctx);
  };
  return st;
}
// 旗を立てる：本人が印の内に三秒、近くに武器を持つ敵がいない。
function plant(o) {
  return {
    kind: 'move', max: 60, limit: Infinity, idleAdvance: false, noHardCap: true,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.t = 0;
      rt.obj('dp', o.obj, 'main');
      rt.marker('dp', o.at, o.label, { h: 3 });
      rt.zone('dp', o.at.x, o.at.z, 4);
      for (const [who, text, d] of o.say || []) rt.say(who, text, d || 3.5);
    },
    tick(rt, C, m, ctx, el, dt) {
      const u = rt.player.u, p = u.pos;
      const near = u.alive && u.hp > 0 && !u.downed && !u.dying && !u.gone && !u.woundOut && !u.rearWound && !u.fleeing && Math.hypot(p.x - o.at.x, p.z - o.at.z) < (el > 120 ? 15 : 4.5);   // 11/16 owner-4：舟着場の四歩半へ水と舟で入れず旗の段で時切れ（act bot 1901）。二分で十五歩
      if (el > 240 && u.alive && Math.hypot(p.x - o.at.x, p.z - o.at.z) < 40) return true;
      let calm = near;
      // 制圧で退却の下知を受けた残兵は、柵に詰まっていても旗立てを妨げない。
      if (calm) for (const q of rt.army.units) if (q.team !== u.team && q.alive && q.hp > 0 && !q.downed && !q.dying && !q.gone &&
        !q.woundOut && !q.rearWound && !q.fleeing && !q.noTarget && !q.isStruct && !q.civ &&
        !q.group?.routed && q.group?.order !== 'retreat' &&
        (q.pos.x - p.x) ** 2 + (q.pos.z - p.z) ** 2 < 36 &&
        !rt.army.wallBetween(p, u.team, q.pos)) { calm = false; break; }
      // 離れたり敵に割り込まれたりしたら、旗を立てる作業をやり直す。
      C.t = calm ? C.t + dt : 0;
      // 11/17 クラウド kaito2 K365：act が舟着場の手前 (-53,-61)＝十五歩先の柵と水路の向こうで止まり、旗が立たず六百秒の時切れ。
      //   段から六十秒、本人が二十五歩の内にいれば、組の者が旗を立てる
      if (el > 60 && u.alive && Math.hypot(p.x - o.at.x, p.z - o.at.z) < 25) { if (!C.allyPlant) { C.allyPlant = true; rt.say('組頭', '旗はわしの手の者が立てる。続け！', 3); } return true; }
      return C.t >= 3;
    },
    end(rt, C) { rt.unmark('dp'); rt.unzone('dp'); rt.objDone('dp'); o.done?.(rt); },
  };
}
// 長島の防衛は本人の守備で決める。共通の味方三人の到着判定で、
// 守り切った後に失敗の記録を付けたまま結末へ進めない。
function defend(o) {
  const st = hold(o);
  st.end = (rt, C, m) => {
    rt.unmark('dp'); rt.unzone('dp');
    const won = !!C.ngHeld;
    if (won) {
      rt.objDone('dp');
      if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward);
    } else rt.objFail('dp');
    o.onEnd?.(rt, m, won);
  };
  return st;
}
// 段に右上の番号とチェックポイントを付ける
function tag(st, k, cp, pin) {
  const start = st.start;
  // 本人の移動・守備を、共通の放置送りや時間切れで飛ばさない。
  if (st.kind === 'move' || st.kind === 'hold') {
    const lim0 = st.limit;
    st.idleAdvance = false; st.noHardCap = true; st.limit = Infinity;
    const tick = st.tick;
    st.tick = (rt, C, m, ctx, el, dt) => {
      const u = rt.player.u;
      const ready = u.alive && u.hp > 0 && !u.downed && !u.dying && !u.gone && !u.woundOut && !u.rearWound && !u.fleeing;
      if (st.kind === 'move') {
        // 転倒中にも旗立ての途中の時間を持ち越さない。
        if (!ready) { if (C.t != null) C.t = 0; return false; }
        return tick(rt, C, m, ctx, el, dt);
      }
      const before = C.inT;
      tick(rt, C, m, ctx, el, dt);
      // 共通の「半分ほど参加」ではなく、持ち場で守った時間を数える。
      // 11/17 クラウド kaito2 K365：舟着場の手前 (-53,-61)＝柵と水路に囲まれた所から在所の口 (-54,-100) へ出られず、守りの段が八百秒閉じず時切れ（act 1080秒）。
      //   持ち場の外で四十五秒ほとんど動かなければ、持ち場の後ろ（六歩手前）へ出す（暗く落としてから）
      if (ready && el > 30) {
        if (!C.stuckAt || Math.hypot(u.pos.x - C.stuckAt.x, u.pos.z - C.stuckAt.z) > 2) C.stuckAt = { x: u.pos.x, z: u.pos.z, t: el };
        // 11/18 クラウドセ五：中学生 act（0232）が持ち場の七十歩外 (14,-143) をゆっくり歩き続け（二歩ずつ動くので止まり扱いにならず）千八十秒時切れ。
        //   持ち場の四十歩より外に六十秒いたら、動いていても後ろ（六歩手前）へ戻す
        if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > 40) { C.farT = C.farT == null ? el : C.farT; if (el - C.farT > 60) C.stuckAt.t = el - 46; } else C.farT = null;
        if (el - C.stuckAt.t > 45 && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > C.botRadius) {
          const dx = u.pos.x - C.at.x, dz = u.pos.z - C.at.z, d = Math.hypot(dx, dz) || 1, x = C.at.x + dx / d * 6, z = C.at.z + dz / d * 6;
          rt.scene.visible = false; rt.after(0.5, () => { rt.scene.visible = true; }, true);
          u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z); u.mesh?.position.copy(u.pos); C.stuckAt = null;
        }
      }
      const present = ready && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < C.botRadius;
      C.inT = before + (present ? dt : 0);
      const duration = st.max - 35;
      // 残り秒数を出さず、今の行いを伝える（critic60 長島・五1／五2）。
      rt.objProgress('dp', !present ? '持ち場へ戻り、味方と守れ' :
        C.inT < duration ? '持ち場で味方と守れ' : C.waves.length ? '持ち場で後の寄せを待て' :
          fighters(C) ? '残る寄せを味方と押し返せ' : '持ち場の列を保った');
      // 寄せの上限後は残兵を退かせる。本人が守らないまま成功にはしない。
      if (present && C.inT >= duration && !C.waves.length && el >= Math.max(duration + 30, 130)) withdraw(C);   // 11/18 クラウド k365-cloud-28：200→130秒（在所の段が150秒）
      // 11/17 クラウド kaito2 K365：最後の突破（realHold・退かない門徒）で本人が持ち場の十八歩外 (-50,-133) で斬り合い続け、七百秒閉じず時切れ（act 1080秒）。
      //   段の上限（limit）から四十秒たてば残りの門徒は退き、味方が持ち場を保った事にする
      if (ready && Number.isFinite(lim0) && el > lim0 + 40) { withdraw(C); C.ngHeld = true; return true; }
      // 二人以下でも戦っている者は残る寄せ。退却の下知か撃退まで待つ。
      C.ngHeld = present && C.inT >= duration && !C.waves.length && !fighters(C);
      return C.ngHeld;
    };
    if (st.kind === 'hold') {
      const end = st.end;
      st.end = (rt, C, m, ctx) => {
        // 二人以下の組も崩れた扱いで段が終わる。残兵の射撃と攻撃の下知を残さない。
        withdraw(C);
        end?.(rt, C, m, ctx);
      };
    }
  }
  if (pin) st.pin = pin;
  st.start = (rt, C, m, ctx) => {
    const F = rt.flags;
    F.advK = Math.max(F.advK || 0, k);
    if (cp) { F.advCP = cp; F.step = 10 + cp; }
    start(rt, C, m, ctx);
    if (st.kind !== 'rest') rt.obj('main', ADV_MISSIONS[F.advK], 'main');
  };
  return st;
}

// K：{ monto(n, s2), guns(n), bows(n), desperate(n, s2), events: { … 場面の絵 } }
export function advanceSteps(K) {
  const E = K.events;
  return [
    // ---- 0:00〜2:30 細い堤 ----
    tag(rest({ dur: 4, heal: 0, banner: ['細い堤', '左右は水。大軍も一列でしか進めない'], fn: (rt) => E.column(rt),
      say: [['組頭', '道が狭い。'], ['足軽', '前が止まると、後ろも全部止まる……']] }), 1, 1, P.dikeHead),
    // 堤の口は細く、先に着いた味方の列が口を塞ぐ。半径5m だと列の後ろ（5.0m）で着かずに止まった（立つだけの本人・K203 11/14）。7m で着いた事にする
    tag(move({ to: P.dikeHead, obj: ADV_MISSIONS[1], label: '堤の口', r: 7, max: 90 }), 1),
    tag(take({ at: P.dikeFront, title: '堤の先に門徒の旗', sub: '槍・弓・鉄砲。ここでは人数が役に立たない', obj: ADV_MISSIONS[1], cap: 150, ratio: 0.65,
      say: [['組頭', '一人ずつしか前へ出られん。槍を揃えて押せ！']],
      foes: () => [
        { name: '堤を塞ぐ門徒', hunt: true, from: { x: -46, z: -50 }, list: K.monto(7, 2), mass: 0, dmg: 0.7 },
        { name: '砦の土塁の弓', from: { x: -54, z: -54 }, list: K.bows(3), mass: 0, dmg: 0.5 },
      ],
      later: [
        { t: 22, say: ['足軽', '横の葦から鉄砲じゃ！　伏せろ！'], foes: () => [{ name: '葦に伏せた鉄砲', from: { x: -40, z: -49 }, list: K.guns(3), mass: 0, dmg: 0.5 }] },
      ],
      reward: '前方の堤を確保した' }), 1),
    // ---- 2:30〜5:00 第一砦（堤の砦）----
    tag(rest({ dur: 4, heal: 0.2, fn: (rt) => E.fortWarn(rt), say: [['使番', '堤の先の砦じゃ！　門を抜けよ！'], ['組頭', '正面だけ見るな。水路の向こうからも来るぞ']] }), 2, 2, P.fort),
    tag(take({ at: P.fort, title: '堤の砦', sub: '柵と土塁と小さな櫓。寺と在所へ続く口', obj: ADV_MISSIONS[2], cap: 170, ratio: 0.7, leader: true,
      // 前の堤や木戸の外から、味方の戦果だけで砦を取った事にしない。
      reached: (p) => p.z < TSUTSUMI_PLAN.koguchi[0].at[1],
      leadAt: { x: TSUTSUMI_PLAN.koguchi[0].at[0], z: TSUTSUMI_PLAN.koguchi[0].at[1] - 4 },
      foes: () => [
        { name: '砦の門徒', hunt: true, from: { x: -50, z: -62 }, list: K.monto(8, 2, '門徒頭'), mass: 0, dmg: 0.7 },
        { name: '水路の向こうの鉄砲', from: { x: -72, z: -58 }, list: K.guns(3), mass: 0, dmg: 0.45, noRout: 60 },
      ],
      later: [
        { t: 18, say: ['足軽', '小舟じゃ！　水路から上がって来よる！'], foes: () => [{ name: '小舟から上がる門徒', from: { x: -59, z: -66 }, list: K.monto(5, 1), mass: 0, dmg: 0.7 }] },
      ],
      reward: '堤の砦を制圧した', onEnd: (rt) => E.fortTaken(rt) }), 2),
    // ---- 5:00〜7:30 水路の戦い（舟着場）----
    tag(rest({ dur: 5, heal: 0.25, fn: (rt) => E.fleetIn(rt), say: [['使番', '九鬼殿の船が水路へ入る！　舟着場を取れ！'], ['組頭', '舟を全部沈めずともよい。岸を取って旗を立てるのじゃ']] }), 3, 3, P.landing),
    tag(take({ at: P.landing, title: '舟着場', sub: '水面に矢と弾。岸からは槍', obj: ADV_MISSIONS[3], cap: 160, ratio: 0.7,
      foes: () => [
        { name: '舟着場の門徒', hunt: true, from: { x: -52, z: -88 }, list: K.monto(7, 1), mass: 0, dmg: 0.7 },
        { name: '対岸の弓', from: { x: -76, z: -84 }, list: K.bows(4), mass: 0, dmg: 0.45, noRout: 60 },
      ],
      later: [
        { t: 20, say: ['足軽', '舟が横付けしてくる！'], foes: () => [{ name: '横付けした舟の門徒', from: { x: -60, z: -92 }, list: K.monto(5, 1), mass: 0, dmg: 0.7 }] },
      ],
      reward: '舟着場を取った' }), 3),
    tag(plant({ at: P.landing, obj: '舟着場に旗を立てよ', label: '舟着場', say: [['組頭', '旗を立てよ！　水軍に知らせるのじゃ']], done: (rt) => E.flagLanding(rt) }), 3),
    // ---- 7:30〜10:00 寺内の在所 ----
    tag(rest({ dur: 7, heal: 0.3, fn: (rt) => E.village(rt),
      say: [['足軽', '……家じゃ。鍋も、干した着物もある'], ['組頭', '槍を持つ者だけを討て。逃げる者は追うな'], ['足軽', 'ここに住んどる者が、戦うとるんか……']] }), 4, 4, P.village),
    tag(defend({ at: P.village, dur: 66, r: 12, noRefill: true, title: '寺内の在所', sub: '武器を持つ門徒が、家族を奥へ逃がすため防ぐ', label: '在所の入口', obj: ADV_MISSIONS[4],
      waves: [
        { t: 0, foes: () => [{ name: '在所の口を守る門徒', hunt: true, from: { x: -50, z: -110 }, list: K.monto(7, 2, '在所の門徒頭'), mass: 0, dmg: 0.6 }] },
        { t: 26, say: ['足軽', '後ろを、女子供が走っていく……'], foes: () => [{ name: '寺から出た門徒', from: { x: -44, z: -104 }, list: K.monto(5, 1), mass: 0, dmg: 0.6 }] },
        { t: 48, foes: () => [{ name: '在所の鉄砲', from: { x: -57, z: -110 }, list: K.guns(3), mass: 0, dmg: 0.45 }] },
      ],
      reward: '在所の入口を押さえた' }), 4),
    // ---- 10:00〜12:30 包囲が完成する ----
    tag(rest({ dur: 12, heal: 0.3, fn: (rt) => E.closing(rt) }), 5, 5, P.exit),
    tag(move({ to: P.exit, obj: ADV_MISSIONS[5], label: '最後の脱出路', r: 5, max: 110,
      say: [['組頭', '南の舟入りが最後の出口じゃ。塞げ！']] }), 5),
    tag(rest({ dur: 9, heal: 0, fn: (rt) => E.lastClosed(rt) }), 5, 0, P.exit),
    // ---- 12:30〜14:00 最後の突破（金ヶ崎の殿の裏返し）----
    tag(rest({ dur: 5, heal: 0.4, fn: (rt) => E.desperate(rt), say: [['組頭', '来るぞ……退く所の無い者は、強い。ここを守れ！']] }), 6, 6, P.exit),
    // 退路のない最後の抵抗。少人数・守備時間の経過で士気を落とさず、
    // 段の上限で出す撤退の下知（withdraw）までは踏みとどまる。
    tag(defend({ at: P.exit, dur: 80, r: 12, realHold: true, noRefill: true, limit: 100,   /* 11/18 クラウド k365-cloud-28：act bot で上限の200秒（＋40）まで続き戦が九分余り。100秒（＋40）に */ title: '最後の突破', sub: '後ろの家族を逃がすため、門徒が突っ込んでくる', label: '最後の脱出路', obj: ADV_MISSIONS[6],
      waves: [
        { t: 0, foes: () => [{ name: '突破する門徒', from: { x: -48, z: -110 }, list: K.desperate(9, 2, '突破の門徒頭'), mass: 0, dmg: 0.75, noRout: Infinity, morale: 100 }] },
        { t: 24, say: ['足軽', '旗が倒れても、まだ来る……！'], foes: () => [{ name: '家族を背にした門徒', from: { x: -42, z: -108 }, list: K.desperate(8, 1), mass: 0, dmg: 0.75, noRout: Infinity, morale: 100 }] },
        { t: 46, say: ['組頭', '……わしらが金ヶ崎でやった事と、同じじゃ'], foes: () => [{ name: '最後に突っ込む門徒', from: { x: -52, z: -110 }, list: K.desperate(7, 2), mass: 0, dmg: 0.75, noRout: Infinity, morale: 100 }] },
      ],
      reward: '最後の突破を食い止めた', onEnd: (rt) => E.breakFailed(rt) }), 6),
  ];
}
