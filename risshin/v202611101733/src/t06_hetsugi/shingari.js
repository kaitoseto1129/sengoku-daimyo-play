// ======================================================================
// 戸次川　④の段（12〜13分）：浅瀬の口で殿をし、皆を先に渡らせてから最後に渡る
//   川は落ちる四国の衆で混み合い、浅瀬を外れた者は深みに沈む（本体の drown）。本人は北の岸の浅瀬の口で四十五秒ほど追手を防ぎ、
//   手勢の侍の「皆渡った」の声で川へ入る。行き先の▼は殿の間は北の口、渡れの後は南の岸。
// 呼び方：toStep(4) で start(rt, K)、update の④で update(rt, K)。pin(rt, K)・crossNow(rt)。
// ======================================================================
export const MOUTH_N = { x: 20, z: -18 };   // 北の岸の浅瀬の口

export function start(rt) {
  const F = rt.flags;
  F.s4 = { t0: rt.t, tickT: rt.t, go: false };
  // 11/9 夜 kaito：十河存保は信親と別の死。逃げる味方の後ろで十河の隊が向き直り、殿に残る（本人は一度ここで加勢する）
  const g = F.sogo;
  if (g?.count) {
    F.follow = (F.follow || []).filter(([q]) => q !== g);
    const at = { x: MOUTH_N.x + 8, z: MOUTH_N.z - 16 };
    g.order = 'hold'; g.dest = null; g.onArrive = null; g.anchor = at; g.facing = Math.PI; g.aggro = 14; g.seekRange = 14; g.speed = 3.6;
    for (const u of g.units) if (u.alive && !u.gone && u.type !== 'busho') u.invuln = false;
    rt.after(1, () => { if (F.step === 4) rt.say('十河存保', '四国の衆、先へ行け！　十河がここで止める！', 3); });
  }
  rt.after(2, () => { if (F.step === 4) rt.say('手勢の侍', '浅瀬の口で殿じゃ！　皆が渡り切るまで、ここを通すな！', 3); });
  rt.after(18, () => { if (F.step === 4 && !F.s4.go) rt.say('長宗我部の足軽', '押すな！　浅瀬は狭い、一列で渡れ！', 2.8); });
  rt.after(32, () => { if (F.step === 4 && !F.s4.go) rt.say('手勢の侍', 'もう少しじゃ！　島津の槍を止めよ！', 2.6); });
}

function release(rt, remaining) {
  const F = rt.flags, S = F.s4;
  if (S.go) return;
  S.go = true;
  rt.say('手勢の侍', remaining ? '残る者も退け！　殿、これ以上は持ちませぬ。川へ！' : '皆渡った！　殿、今じゃ。川へ！', 2.8);
  F.mText = '川を渡れ'; rt.obj('main', F.mText, 'main', true);
  rt.after(3, () => rt.say('十河存保', '行け！　振り返るな！', 2.4));
}

export function crossNow(rt) { return !!rt.flags.s4?.go; }

export function crossed(rt, K) {
  const P = rt.player.u.pos;
  return crossNow(rt) && P.z > 26 && Math.hypot(P.x - K.FORD.x, P.z - 34) < 26;
}

export function pin(rt, K) { return crossNow(rt) ? { x: K.FORD.x, z: 34 } : MOUTH_N; }

export function update(rt, K) {
  const S = rt.flags.s4, P = rt.player.u.pos;
  if (!S) return;
  if (S.go) {
    // 下知だけでは退いた事にしない。本人が浅瀬へ入ってから、後ろに残る十河の討死を知らせる。
    // 渡り切りの判定は浅瀬の縁にも届く。中央を通らず岸へ上がった時も、
    // ⑤へ進む前に十河の知らせを予約し、生還の締めを止めない。
    if (!S.fallQueued && ((P.z > -8 && Math.abs(P.x - MOUTH_N.x) < 22) || crossed(rt, K))) {
      S.fallQueued = true;
      rt.after(9, () => rt.def.sogoFall?.(rt));
    }
    return;
  }
  // 固定の加算では見回りが遅い時に殿の務めまで長くなる。
  const dt = Math.max(0, rt.t - (S.tickT ?? rt.t));
  S.tickT = rt.t;
  const el = rt.t - S.t0, atMouth = Math.hypot(P.x - MOUTH_N.x, P.z - MOUTH_N.z) < 16;
  if (atMouth) S.held = (S.held || 0) + dt;
  // 浅瀬の口で殿を務めてから渡る。先に逃げても時間だけでは果たさない。
  const F = rt.flags;
  // 戦列を離れた負傷兵は隊の到着判定と同じく除き、動けない者で進行を止めない。
  const remaining = [F.nobu, F.tsune, F.moto, ...(F.allyBands || [])].some((g) =>
    g?.units.some((u) => u.alive && !u.gone && !u.dying && !u.noTarget && !u.woundOut && !u.rearWound && u.pos.z <= 26));
  // 殿を務めた後でも、味方を残して先に渡った時は口へ戻るまで下知を出さない。
  // 一人が足止めされても無期限の防戦にしない。残兵がいる時は渡り切ったと知らせない。
  if (atMouth && S.held > 45 && el > 55 && (!remaining || S.held > 150)) release(rt, remaining);
}
