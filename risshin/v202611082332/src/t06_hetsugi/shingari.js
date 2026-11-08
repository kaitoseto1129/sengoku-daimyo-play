// ======================================================================
// 戸次川　④の段（12〜13分）：浅瀬の口で殿をし、皆を先に渡らせてから最後に渡る
//   川は落ちる四国の衆で混み合い、浅瀬を外れた者は深みに沈む（本体の drown）。本人は北の岸の浅瀬の口で四十五秒ほど追手を防ぎ、
//   手勢の侍の「皆渡った」の声で川へ入る。行き先の▼は殿の間は北の口、渡れの後は南の岸。
// 呼び方：toStep(4) で start(rt, K)、update の④で update(rt, K)。pin(rt, K)・crossNow(rt)。
// ======================================================================
export const MOUTH_N = { x: 20, z: -18 };   // 北の岸の浅瀬の口

export function start(rt, K) {
  const F = rt.flags;
  F.s4 = { t0: rt.t, go: false };
  rt.after(2, () => { if (F.step === 4) rt.say('手勢の侍', '浅瀬の口で殿じゃ！　皆が渡り切るまで、ここを通すな！', 3); });
  rt.after(18, () => { if (F.step === 4 && !F.s4.go) rt.say('長宗我部の足軽', '押すな！　浅瀬は狭い、一列で渡れ！', 2.8); });
  rt.after(32, () => { if (F.step === 4 && !F.s4.go) rt.say('手勢の侍', 'もう少しじゃ！　島津の槍を止めよ！', 2.6); });
}

function release(rt) {
  const F = rt.flags, S = F.s4;
  if (S.go) return;
  S.go = true;
  rt.say('手勢の侍', '皆渡った！　殿、今じゃ。川へ！', 2.8);
}

export function crossNow(rt) { return !!rt.flags.s4?.go; }

export function pin(rt, K) { return crossNow(rt) ? { x: K.FORD.x, z: 34 } : MOUTH_N; }

export function update(rt) {
  const S = rt.flags.s4, P = rt.player.u.pos;
  if (!S || S.go) return;
  const el = rt.t - S.t0, atMouth = Math.hypot(P.x - MOUTH_N.x, P.z - MOUTH_N.z) < 16;
  if (atMouth) S.held = (S.held || 0) + 0.25;
  // 口で三十秒余り防ぐか、来なくても七十秒で皆が渡り終える
  if ((S.held > 45 && el > 55) || el > 85) release(rt);
}
