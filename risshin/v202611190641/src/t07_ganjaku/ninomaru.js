// ======================================================================
// 岩石城　④二の丸の曲輪（9〜12分）：門を抜けた先の狭い曲輪で城兵と乱戦。小屋に火が回り、煙の中で斬り合う
//   城兵（二の丸の城兵）は始めから曲輪の奥で構えている（setup の foe）。段に入ると打って掛かり、少しして矢倉の下から新手。
// 呼び方：go(4) で start(rt, K)、update の段4で update(rt, K) が true を返したら go(5)。
// ======================================================================
import { sfx } from '../audio.js';
import { hut } from '../props.js';

export const NINO = { x: -32, z: 32 };   // 二の丸の曲輪の中ほど（門の内と本丸の口の間）
// 11/19 クラウド持ち主 ⑥（段4 170秒の写真：「火の中の城兵」の火が草の上に浮く炎だけで、燃える物が無かった）：
//   曲輪の両脇（門から本丸への筋 x+z=0 から十一〜十三m 外）に掘立の小屋四つを建て、段4でその屋根に火を掛ける
const HUTS = [[-30, 46, 4.4, 3.2, 2.6], [-46, 30, 4.8, 3.4, 2.4], [-20, 36, 4, 3, 2.1], [-36, 18, 4.2, 3, 2]];
export function build(rt) {
  for (const [x, z, w, d] of HUTS) { try { rt.scene.add(hut(rt.world, x, z, w, d, -Math.PI / 4)); } catch (e) { console.warn(e); } }
}

export function make(rt, K) {
  // 野戦の回り込みで本丸の塀へ集まらず、二の丸の持ち場から寄せ手と戦う。
  const g = K.foe('二の丸の城兵', NINO, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }], { aggro: 5, width: 5, noAI: true });
  // 11/18 持ち主（act bot）：煙の曲輪で城兵に囲まれ、一突きの床三十余りが続いて倒れた（二の丸の城兵70の傷）。小屋が燃え浮き足立つ守りなので打ち込みを七割半に（床もこの倍に従う）
  g.dmgMult = Math.min(g.dmgMult ?? 1, 0.75);
  return g;
}

export function start(rt, K) {
  const F = rt.flags, W = rt.world;
  F.n4 = { t0: rt.t };
  rt.obj('s4', K.TEXT[3], 'main');
  rt.marker('t07', NINO, '二の丸', { h: 3 });
  // 曲輪の小屋に火（攻め手が火を掛け、一気に畳みかけた伝え）
  for (const [i, [x, z, , , s]] of HUTS.entries()) rt.after(i * 2.5, () => { try { W.addFire(x, z, { size: s, h: 2.2, blackSmoke: true }); } catch (e) { /* 飾り */ } });
  const g = F.nino;
  // 11/18 クラウド（K358）：門を抜けた本人が蒲生勢より先に曲輪へ入り、城兵十三が一人の本人へ打って出て act bot が倒れた（15m 内の味方0）。打って出るのは味方が寄ってから（update）
  if (g && g.count) g.noRout = true;
  rt.say('蒲生郷成', '二の丸じゃ！　小屋に火を掛けよ、煙に紛れて討ち払え！', 3.2);
  rt.after(6, () => { if (F.stage === 4) rt.say('蒲生の侍', '火が回るぞ！　煙を吸うな、低く進め！', 2.8); });
  // 新手は三十秒前に声と物音で知らせる（全戦共通の後詰の予告）。
  rt.after(10, () => {
    if (F.stage !== 4 || F.ending || F.nino2) return;
    rt.army.play('eshout', { x: -22, z: 22 }, 0.9);
    rt.say('蒲生の侍', '矢倉の下に城兵が集まっておる！', 2.8);
  });
  // 矢倉の下から新手（四十秒。曲輪の城兵が先に討ち減れば update で早める）
  rt.after(40, () => spawn2(rt, K));
  sfx('taiko', 0.7);
}

// 矢倉の下の新手。一度だけ出す
function spawn2(rt, K) {
  const F = rt.flags;
  if (F.stage !== 4 || F.ending || F.nino2) return;
  F.nino2 = K.foe('矢倉の下の新手', { x: -22, z: 22 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { aggro: 16, width: 4, noAI: true });
  F.nino2.order = 'attack'; F.nino2.seekRange = 30; F.nino2.noFrontline = true; F.nino2.noRout = true; F.nino2.dmgMultPlayer = 0.6;
  F.foes.push(F.nino2);
  F.n4.n2At = rt.t;
  rt.army.play('eshout', { x: -22, z: 22 }, 1.4);
  rt.say('蒲生の侍', '矢倉の下から新手じゃ！', 2.6);
}

export function update(rt, K) {
  const F = rt.flags, el = rt.t - F.n4.t0;
  if (!F.n4.out) {
    const P = rt.player.u; let n = 0;
    for (const q of rt.army.units) if (q.alive && q.team === P.team && q !== P && Math.hypot(q.pos.x - NINO.x, q.pos.z - NINO.z) < 30) n++;
    if (n >= 8 || el > 25) { F.n4.out = true; const g = F.nino; if (g && g.count) { g.order = 'attack'; g.aggro = 16; g.seekRange = 30; } }
  }
  // 11/19 08:10 持ち主（act bot 3本：段4が十五〜二十二秒で、新手の出る四十秒の前に曲輪の十三人を討ち尽くし、矢倉の下の新手が一度も出なかった＝火の曲輪の乱戦が一合で終わる）：
  //   曲輪の城兵が四人以下に減ったら、新手を四十秒を待たず今出す（二の波。新手を討ち払うまで段を済みにしない）
  if (!F.nino2 && el > 6 && (F.nino ? K.fighting(F.nino) : 0) <= 4) spawn2(rt, K);
  // 11/19 08:20 持ち主（act bot 231秒：矢倉の下の新手八人が曲輪を離れ、本丸の東 (27,14) で一点に重なって止まった）：新手は曲輪の持ち場の兵。曲輪から二十八m より外へ出た者は曲輪へ戻す
  if (F.nino2 && !(F.n4.leashAt > rt.t)) {
    F.n4.leashAt = rt.t + 1;
    for (const u of F.nino2.units) {
      if (!u.alive || u.fleeing || u.woundOut || Math.hypot(u.pos.x - NINO.x, u.pos.z - NINO.z) < 28) continue;
      u.target = null; u.atk = null; u.swing = null; u.aiT = 2; u.moveTo = { x: NINO.x + 8 + (Math.random() - 0.5) * 8, z: NINO.z - 8 + (Math.random() - 0.5) * 8 };
    }
  }
  const left = (F.nino ? K.fighting(F.nino) : 0) + (F.nino2 ? K.fighting(F.nino2) : 0);
  // 時間だけで「討ち払った」にしない。寄せ手と実際に斬り合ってから撤退の時を数える。
  if (F.n4.fightT == null && !(F.n4.checkAt > rt.t)) {
    F.n4.checkAt = rt.t + 0.5;
    for (const g of [F.nino, F.nino2]) {
      if (!g) continue;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut) continue;
        const target = rt.army.nearestEnemy(u, 6, (v) => !v.noTarget && !v.isStruct && !v.fleeing && Math.abs(v.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, v.pos));
        if (target) { F.n4.fightT = rt.t; break; }
      }
      if (F.n4.fightT != null) break;
    }
  }
  // 討ち減らされた時も、長引いた時も、残兵は本丸へ退く。少数だけ曲輪で戦い続けない
  // 全員を討ったら、新手の到着や最低秒数のためだけに空の曲輪で待たせない。
  // 段が進めば、start の予約も新手を出さない。
  // 新手が出る四十秒を過ぎ、大半を討ち払えば残り三人を探し回らせない。
  // 入る前に味方が大半を討った時は、残兵との再接触を要求しない。
  // 味方だけが先に討ち払っても、本人が曲輪へ入る前に目標を済みにしない。
  // 一度入った後は、残兵を追って曲輪の外へ出ても到着を取り消さない。
  const p = rt.player.u.pos;
  // 11/18 15:10 持ち主（act bot 602秒の回：段4が250秒。本人は輪の縁の十四m まで来て止まり、内へ一歩入れなかった）：輪の縁から二m 外までを着いた事にする
  if (Math.hypot(p.x - NINO.x, p.z - NINO.z) < 16) F.n4.entered = true;
  // 11/18 クラウドり（岩石城 act bot 二回目：門の内 (-55,51) の曲輪の外で足止め→段4が186秒から1080秒まで十五分動かず時間切れ）：
  //   曲輪の十四m 内に入れないまま二百五十秒が過ぎたら、到着済みにして残兵を退かせる（段を進める）
  //   11/18 15:10 持ち主：二百五十秒は一戦の七分を越えるので百五十秒へ
  if (el >= 150) F.n4.entered = true;
  const secured = (el > 40 || (F.n4.n2At != null && rt.t - F.n4.n2At > 12)) && left <= 3;
  // 接敵できない城兵が岩や塀に残っても、新手の到着から百八十五秒で退かせる。
  // 本人の曲輪への到着は必要とし、麓にいるだけでは済みにしない。
  // 11/18 クラウド（act bot）：札「二の丸の曲輪で…」のまま七十〜百秒なにも起きなかった。待つ上限を百八十五秒から百二十秒へ
  const stalled = el >= 40 + 120;
  // 11/18 持ち主（act bot「札『二の丸の曲輪で…』のまま46〜82秒なにも起きない」）：曲輪に入った後、本人の二十五m 内に戦える城兵が十五秒いなければ、残りは本丸へ退かせて段を進める（新手の出る四十秒の後だけ）
  if (F.n4.entered && el > 45) {
    let near = false;
    for (const g of [F.nino, F.nino2]) if (g && !near) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 25) { near = true; break; }
    if (near) F.n4.quietT0 = null; else if (F.n4.quietT0 == null) F.n4.quietT0 = rt.t;
  }
  const quiet = F.n4.quietT0 != null && rt.t - F.n4.quietT0 > 15;
  if (F.n4.entered && ((left === 0 && (F.nino2 || el > 40)) || secured || stalled || quiet || (F.n4.fightT != null && rt.t - F.n4.fightT > 120))) {
    // 上限による撤退と、実際に討ち払った戦功を分ける。保存にも残せる真偽の印にする。
    F.ninoRepelled = left <= 3 || F.n4.fightT != null;
    retreat(rt);
    return true;
  }
  return false;
}

// 通常の制圧と、済んだ段を作り直す再開で同じ撤退を使う。
export function retreat(rt) {
  for (const g of [rt.flags.nino, rt.flags.nino2]) if (g && !g.routed) {
    g.fire = false; g.noRout = false; g.order = 'retreat'; g.morale = 0;
    g.fleeSet = true; g.fleeDir = { x: 0.7, z: -0.7 };
  }
}
