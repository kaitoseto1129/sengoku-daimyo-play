// ======================================================================
// 野田・福島の戦い　中の段「竹束の鉄砲戦」（6〜9分。docs/oda15_plan_1108.md の 10）
// - 三好の打って出た槍を浅瀬で退けた後、すぐ夜にせず、福島砦の前の竹束の列で根来・雑賀の鉄砲衆三千（織田方）と砦の雑賀衆が撃ち合う。
//   天地も響く密集射撃（公記）。途中で本願寺の門徒が砦へ入ったと知らせが来る（本願寺勢の参戦）。
// - 西の野田砦から三好の槍が竹束の鉄砲衆へ寄せる。主人公は鉄砲衆を守る。
// - 済んだら本の筋書きの夜（本願寺の早鐘）へ渡す。
// ======================================================================
import { sfx } from '../audio.js';

export const MISSION = '竹束の列で、根来・雑賀の鉄砲衆を野田砦の槍から守れ';
const POST = { x: -22, z: -20 };    // 竹束の列（堤の下の岸、西寄り）
// 西の浅瀬を渡り終えた南岸から寄せる。旧位置（-56, -32）は浅瀬のない深みで、
// 深みの柵にも阻まれ、目標に書いた槍が竹束へ着けなかった。
const SALLY_FROM = { x: -82, z: -14 };
const MIN_T = 120;
// 深手や退いた兵を残敵に数えず、戦える相手だけを防ぐ。
const fighting = u => u.alive && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget && !u.gone;

// ctx：{ enemyGroup, makeRoom, allyGroup, dress, foe, ally, levZ, done() }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.nodaTeppo) return;
  // 味方の鉄砲衆にも増援と同じ人数枠を空ける。足りない時は次の更新で試す。
  if (ctx.makeRoom(rt, 12) < 12) return;
  const S = F.nodaTeppo = { t0: rt.t, done: false, k: 0, at: POST };
  const live = () => !S.done && !F.ending && !rt.over && !F.retreating;
  const guns = ctx.allyGroup(rt, { name: '根来・雑賀の鉄砲衆', anchor: { x: POST.x, z: POST.z + 3 }, facing: Math.PI, width: 14, aggro: 80, seekRange: 90, noRout: true, formation: 'line' },
    ctx.dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 11 }], ctx.ally));
  S.guns = guns;
  if (guns) { guns.order = 'hold'; guns.anchor = { x: POST.x, z: POST.z + 3 }; }
  for (const g of [F.fortGun, ...(F.fortTowerGuns || [])]) if (g && g.count) { g.seekRange = 95; g.aggro = 90; g.holdFire = false; }
  rt.marker('nodaTaba', POST, '竹束の列', { guideAlways: true, alwaysDistance: true });
  try { sfx('sig_kakari', 0.6); } catch (e) { /* 音が無くても進む */ }
  rt.say('前田利家', '根来・雑賀の鉄砲衆が竹束へ着いた。砦と撃ち合うぞ。西の竹束の列へ寄れ！', 4);
  // 天地も響く撃ち合い：砦と竹束の間で数秒おきに銃声と硝煙
  S.fireT = 0;
  rt.after(22, () => { if (!live()) return; rt.say('使番', '本願寺の門徒が鉄砲を担いで、福島砦へ入り申した！', 3.8); try { sfx('bellRapid', 0.35); } catch (e) { /* 音が無くても進む */ } });
  rt.after(30, () => live() && rt.say('雑賀の鉄砲衆', '門徒の鉄砲も加わった！　狭間から撃ちすくめよ！', 3.2));
  rt.after(40, () => sally());
  // 期限だけで「守った」にせず、寄せた槍を押し返すまで待つ。

  function sally() {
    if (!live() || S.g || rt.t < (S.spawnAt || 0)) return;
    S.spawnAt = rt.t + 5;
    if (ctx.makeRoom(rt, 14) < 14) return;
    const g = ctx.enemyGroup(rt, { faction: 'miyoshi', name: '野田砦の三好の槍', anchor: { ...SALLY_FROM }, facing: Math.PI / 2, aggro: 14, seekRange: 60, width: 12, morale: 90 },
      ctx.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ctx.foe));
    if (!g || !g.count) return;
    S.g = g; S.k = 1; S.gT = rt.t;
    // 横幅十二歩の後列も南岸へ収め、竹束の横まで深みを横切らず進む。
    g.order = 'move'; g.dest = { x: POST.x - 4, z: POST.z + 6 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; };
    rt.marker('nodaTabaFoe', () => { const u = g.units.find(fighting); return u ? { x: u.pos.x, z: u.pos.z } : null; }, '野田砦の槍', { red: true, group: g });
    rt.army.play('eshout', SALLY_FROM, 1.5);
    rt.say('足軽', '西の野田砦から槍が出たぞ！　鉄砲衆の横を突く気じゃ！', 3.2);
    rt.after(3.4, () => live() && rt.say('前田利家', '鉄砲衆の前に出よ！　込め替えの間を守れ！', 3.2));
  }
  function withdraw() {
    const g = S.g;
    if (!g || g.routed) return;
    // 攻めの到着処理を残すと、退く途中で再び竹束へ掛かってしまう。
    g.onArrive = null; g.focus = null;
    g.dest = { ...SALLY_FROM };
    g.noRout = false; g.morale = 0; g.order = 'retreat';
  }
  S.tick = (dt) => {
    if (!live() || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    const atPost = Math.hypot(p.x - POST.x, p.z - POST.z) < 12;
    if (atPost) S.joined = true;
    // 一度寄った記録だけで、持ち場を離れた本人まで防戦済みにしない。
    if (atPost && !S.timedOut && S.contestedAt == null && S.g?.units.some(u => fighting(u) &&
        Math.hypot(u.pos.x - POST.x, u.pos.z - POST.z) < 18 &&
        Math.abs(u.pos.y - p.y) < 3 && !rt.army.wallBetween(p, -1, u.pos) &&
        !rt.army.terrainBlocks(p, u.pos))) S.contestedAt = rt.t;
    if (!S.g && rt.t - S.t0 >= 40) sally();
    S.fireT -= dt;
    if (S.fireT <= 0) {
      S.fireT = 1.6 + Math.random() * 2.2;
      const x = POST.x + (Math.random() - 0.5) * 30, z = -40 - Math.random() * 6;
      try { rt.army.smoke(x, rt.world.heightAt(x, z) + 2.2, z, 0, 1); rt.army.play('gun', { x, z }, 0.8); } catch (e) { /* 煙が無くても進む */ }
    }
    if (S.k === 1 && S.g) {
      const left = S.g.units.filter(fighting).length;
      if (atPost && (left <= 3 || S.g.routed || S.timedOut)) {
        S.k = 2; S.okT = rt.t;
        rt.unmark('nodaTabaFoe');
        withdraw();
        // 上限による退却の後は敗走や残兵の減少も起こる。本人の接敵記録だけで戦功を分ける。
        const defended = S.contestedAt != null;
        if (defended)
          rt.award((t) => t.side.push('竹束の鉄砲衆を野田砦の槍から守った'), '鉄砲衆を守った', POST);
        rt.say('雑賀の鉄砲衆', defended ? '助かった！　これで心置きなく撃てる！' : '野田砦の槍は退いた。竹束の列で撃ち合いを続けるぞ！', 3);
      }
    }
    // 本人が持ち場へ加わり、槍が実際に竹束へ寄せた後だけ、撃ちすくめて退く。
    // 出せなかった敵や、水際で止まった敵を時刻だけで防いだ事にしない。
    if (S.k === 1 && S.g && atPost && S.contestedAt != null && rt.t - S.contestedAt > 120) {
      S.k = 2; S.okT = rt.t;
      rt.unmark('nodaTabaFoe');
      withdraw();
      rt.award((t) => t.side.push('竹束の鉄砲衆を野田砦の槍から守った'), '鉄砲衆を守った', POST);
      rt.say('雑賀の鉄砲衆', '撃ちすくめた！　野田砦の槍が退くぞ！', 3);
    }
    // 11/10 クラウド：槍が持ち場の外（西の水際）で止まり、追った本人も持ち場を離れて十一分止まった（act bot）。
    //   出撃から百六十秒で槍は退くが、本人が竹束へ合流するまでは次の段へ進めない。
    if (S.k === 1 && S.g && !S.timedOut && rt.t - S.gT > 160) {
      S.timedOut = true;
      rt.unmark('nodaTabaFoe');
      withdraw();
      rt.say('雑賀の鉄砲衆', '野田砦の槍が退くぞ。竹束の列へ合流せよ！', 3);
    }
    if (S.k === 2 && atPost && rt.t - S.okT > 14 && rt.t - S.t0 > MIN_T) finish();
  };
  function finish() {
    if (S.done) return;
    S.done = true;
    rt.unmark('nodaTaba'); rt.unmark('nodaTabaFoe');
    withdraw();
    if (!F.ending && !rt.over) rt.say('前田利家', '日が暮れる。撃ち方やめ、堤へ戻って列を整えよ', 3.4);
    ctx.done();
  }
}
export function active(rt) { const S = rt.flags.nodaTeppo; return !!S && !S.done; }
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.nodaTeppo;
  if (!S || S.done) return false;
  const u = p.u;
  // 持ち場へ戻ってから防ぐ。一度加わった印だけで遠くの槍を追うと、
  // 竹束での交戦が始まらず、鉄砲衆を守る段が閉じなくなる。
  const atPost = Math.hypot(u.pos.x - S.at.x, u.pos.z - S.at.z) < 12;
  if (atPost && S.joined && S.k === 1 && S.g && !S.g.routed) {
    let e = null, best = Infinity;
    for (const v of S.g.units) if (fighting(v) && Math.hypot(v.pos.x - S.at.x, v.pos.z - S.at.z) < 14) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < best) { best = d; e = v; } }
    if (e && best < 40) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (best > 2.2) {
        const dx = e.pos.x - S.at.x, dz = e.pos.z - S.at.z, k = Math.min(1, 10 / Math.hypot(dx, dz));
        goTo(p, inp, S.at.x + dx * k, S.at.z + dz * k, 2);
      } else strike(p, inp, e, best);
      return true;
    }
  }
  goTo(p, inp, S.at.x, S.at.z + 4, 3);
  return true;
}
