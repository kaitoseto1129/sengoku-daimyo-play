// ======================================================================
// 三木城・大村の合戦 出撃を退けた後：止めた兵糧と飢える城（約11分半〜13分半）
// 構成：docs/oda15_plan_1108.md の 26（12〜15 補給失敗・城内飢餓・別所長治の最期への伏線）。
// 移る事も出来事にする：大村道に残った俵の所へ行く（着くと、柵の向こうの痩せた城兵・城の鐘・手柄）
//   → 俵を平田の蔵へ運ばせる（蔵に着くと秀吉の使番が「干し殺し」の下知を伝える）→ 余韻へ。
// 兵は増やさない。俵と蔵の確認は本人の到着を待つ（待っているだけでは勝ちにしない）。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.mkKiga) return;
  // 回収済みの俵の跡を指さず、今も地面にある俵を確かめる。
  const sack = F.sacks?.find(s => !s.stored && s.mesh.visible && s.mesh.parent === rt.scene);
  const S = (F.mkKiga = { t0: rt.t, k: 0, kT: rt.t, atStore: !sack, done: false });
  F.step = 4; F.stepT = rt.t;
  rt.setPhase('kiga'); rt.objProgress('main', '');
  rt.objDone('main');
  rt.obj('main', sack ? '大村道に残った俵を見て参れ' : F.storedLoads > 0 ? '平田の蔵で、運び入れた俵を確かめよ' : '平田の蔵で、俵の運び入れを待て', 'main');
  rt.say('組頭', sack ? 'よう守った。道に捨てた荷駄の俵、陣へ運ぶぞ。数を見て参れ' : F.storedLoads > 0 ? 'よう守った。平田の蔵へ行き、運び入れた俵を確かめよ' : '俵は運んでおる。平田の蔵で運び入れるのを待て', 4);
}

function next(rt, S) { S.k++; S.kT = rt.t; }

function roadAt(rt, ctx) {
  const sack = rt.flags.sacks?.find(s => !s.stored && s.mesh.visible && s.mesh.parent === rt.scene);
  return sack ? sack.mesh.position : ctx.store;
}

// 毎コマ（半秒ごと）。余韻へ移る時に true。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.mkKiga;
  if (!S || S.done) return false;
  const p = rt.player.u.pos, t = rt.t - S.kT;
  if (S.k === 0) {
    // 回収役が先に運んだ時も、消えた俵の跡へ行かせない。
    const road = roadAt(rt, ctx);
    if (road === ctx.store && !S.atStore) {
      S.atStore = true;
      rt.say('組頭', F.storedLoads > 0 ? '俵は平田の蔵へ運んだ。蔵へ行き、運び入れた俵を確かめよ' : '俵は運んでおる。平田の蔵で運び入れるのを待て', 4);
      rt.obj('main', F.storedLoads > 0 ? '平田の蔵で、運び入れた俵を確かめよ' : '平田の蔵で、俵の運び入れを待て', 'main');
    }
    const at = Math.hypot(p.x - road.x, p.z - road.z) < 6;
    // 担ぎ手の肩にある俵は蔵の荷ではない。実際に一俵届くまで確認を果たさない。
    if (at && (road !== ctx.store || F.storedLoads > 0)) {
      next(rt, S);
      rt.army.playFar('kane', ctx.castle, 0.6);
      rt.say('足軽', S.atStore ? '蔵に米と塩を運び入れたぞ。城へは通さずに済んだ' : '米じゃ、塩もある……。この荷を城へ通すために、別所の手が打って出たのか', 4.5);
      rt.after(5, () => { if (F.mkKiga === S) rt.say('組頭', '城の兵糧が尽きかけておると聞く。この俵が入らねば、冬は越せまい', 4.5); });
      if (at) rt.award((t2) => { if (!t2.side.includes('止めた兵糧の俵を確かめた')) t2.side.push('止めた兵糧の俵を確かめた'); }, '止めた兵糧を確かめた');
      rt.obj('main', S.atStore ? '平田の蔵で、秀吉の使番の下知を聞け' : '俵を担ぐ者と、平田の蔵へ進め', 'main');
    }
  } else if (S.k === 1) {
    const G = ctx.store;
    const at = Math.hypot(p.x - G.x, p.z - G.z) < 8;
    if (at && !(F.storedLoads > 0) && !S.waitingLoads) {
      S.waitingLoads = true;
      rt.obj('main', '平田の蔵で、俵の運び入れを待て', 'main');
      rt.say('組頭', '担ぎ手が俵を運んでおる。蔵で到着を待て', 3.5);
    }
    // 蔵で俵を確かめた時も、足軽の声と五秒後の組頭の声を聞いてから下知へ進む。
    // 本人だけ先に着いても、担ぎ手の運び入れが済むまで次の下知へ進めない。
    if (at && t >= 10 && F.storedLoads > 0) {
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
  return S.k === 0 ? roadAt(rt, ctx) : ctx.store;
}
