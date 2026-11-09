// ======================================================================
// 三木城・大村の合戦 出撃を退けた後：止めた兵糧と飢える城（約11分半〜13分半）
// 構成：docs/oda15_plan_1108.md の 26（12〜15 補給失敗・城内飢餓・別所長治の最期への伏線）。
// 移る事も出来事にする：大村道に残った俵の所へ行く（着くと、柵の向こうの痩せた城兵・城の鐘・手柄）
//   → 俵を平田の蔵へ運ばせる（蔵に着くと秀吉の使番が「干し殺し」の下知を伝える）→ 余韻へ。
// 兵は増やさない。台詞・音・行き先のピンだけ。どの所も時が過ぎれば先へ進む（負けにしない）。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.mkKiga) return;
  // 回収済みの俵の跡を指さず、今も地面にある俵を確かめる。
  const sack = F.sacks?.find(s => !s.stored && s.mesh.visible && s.mesh.parent === rt.scene);
  const road = sack ? { x: sack.mesh.position.x, z: sack.mesh.position.z } : ctx.store;
  const S = (F.mkKiga = { t0: rt.t, k: 0, kT: rt.t, road, done: false });
  F.step = 4; F.stepT = rt.t;
  rt.setPhase('kiga'); rt.objProgress('main', '');
  rt.objDone('main');
  rt.obj('main', sack ? '大村道に残った俵を見て参れ' : '平田の蔵で、運び入れた俵を確かめよ', 'main');
  rt.say('組頭', sack ? 'よう守った。道に捨てた荷駄の俵、陣へ運ぶぞ。数を見て参れ' : 'よう守った。平田の蔵へ行き、運び入れた俵を確かめよ', 4);
}

function next(rt, S) { S.k++; S.kT = rt.t; }

// 毎コマ（半秒ごと）。余韻へ移る時に true。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.mkKiga;
  if (!S || S.done) return false;
  const p = rt.player.u.pos, t = rt.t - S.kT;
  if (S.k === 0) {
    const at = Math.hypot(p.x - S.road.x, p.z - S.road.z) < 6;
    if (at || t >= 70) {
      next(rt, S);
      rt.army.playFar('kane', ctx.castle, 0.6);
      rt.say('足軽', at ? '米じゃ、塩もある……。見よ、川向こうの柵に城兵が立っておる。骨と皮じゃ' : '川向こうの柵に城兵が立っておる。骨と皮じゃ', 4.5);
      rt.after(5, () => { if (F.mkKiga === S) rt.say('組頭', '城の内は草の根も食い尽くしたと聞く。この俵が入らねば、冬は越せまい', 4.5); });
      if (at) rt.award((t2) => { if (!t2.side.includes('止めた兵糧の俵を確かめた')) t2.side.push('止めた兵糧の俵を確かめた'); }, '止めた兵糧を確かめた');
      rt.obj('main', '俵を担ぐ者と、平田の蔵へ戻れ', 'main');
    }
  } else if (S.k === 1) {
    const G = ctx.store;
    const at = Math.hypot(p.x - G.x, p.z - G.z) < 8;
    if (at || t >= 75) {
      next(rt, S);
      sfx('horagai', 0.5);
      rt.say('使番', '平井山より！　「城を力で攻めるな。囲みを締め、兵糧の道を一つ残らず断て」との仰せ', 5);
      rt.after(6, () => { if (F.mkKiga === S) rt.say('組頭', '干し殺しか……。長治殿は城兵の命をどうなさるおつもりか', 4); });
    }
  } else if (t >= 12) {
    S.done = true; return true;
  }
  return false;
}

export function pin(rt, ctx) {
  const S = rt.flags.mkKiga;
  if (!S || S.done || S.k >= 2) return null;
  return S.k === 0 ? S.road : ctx.store;
}
