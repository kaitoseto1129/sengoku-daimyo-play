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
  // ③で出た新手（待つ備）は殿の段で島津の本手の後ろへ引く。追い討ちは段の島津の手（伊集院・新納）が受け持つ（11/14 クラウドゆ）
  for (const q of rt.army.groups) if (q.team === 1 && q.count && (q.isReserve || q._rsv || q.name === '新手')) {
    q.stay = false; q.noRout = false; q.morale = 0;
    for (const u of q.units) if (u.alive && !u.gone) { u.fleeing = true; u.target = null; u.atk = null; u.swing = null; }
  }
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
  const F = rt.flags, S = F.s4, P = rt.player.u.pos;
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
  if (atMouth && !S.arrived) {
    S.arrived = true;
    F.mText = '戸次川の浅瀬の北口で退く味方を守れ'; rt.obj('main', F.mText, 'main', true);
    rt.say('十河存保', '浅瀬の口は任せた！　退く味方を守れ！', 2.8);
  }
  if (atMouth) S.held = (S.held || 0) + dt;
  // 到着後も退く味方の状況を知らせる。殿の長さや追手の強さは変えない。
  // 11/16 iMac act bot：北口に着いて十秒、印の真上に寄っても六秒何も起きなかった（473秒）。五秒で追手の声を入れる
  if (atMouth && S.held > 5 && !S.hailed8) {
    S.hailed8 = true;
    rt.say('十河存保', '島津の追手が土手を来るぞ！　槍を揃えよ！', 2.6);   // 戦の声は名のある将だけが届く（物見の声は鳴らない）
  }
  if (atMouth && S.held > 20 && !S.hailed20) {
    S.hailed20 = true;
    rt.say('手勢の侍', '味方が浅瀬を渡っておる！　北口を守れ！', 2.8);
  }
  if (atMouth && S.held > 50 && !S.hailed50) {
    S.hailed50 = true;
    rt.say('手勢の侍', '後ろの者も退かせる！　殿、渡る支度を！', 2.8);
  }
  // 浅瀬の口で殿を務めてから渡る。先に逃げても時間だけでは果たさない。
  // 戦列を離れた負傷兵は隊の到着判定と同じく除き、動けない者で進行を止めない。
  // 先に退いた仙石の隊も、北岸に残っていれば渡河済みに数えない。
  const remaining = [F.sen, F.nobuStand ? null : F.nobu, F.tsune, F.moto, ...(F.allyBands || [])].some((g) =>
    g?.units.some((u) => u.alive && !u.gone && !u.dying && !u.noTarget && !u.woundOut && !u.rearWound && u.pos.z <= 26));
  // 殿を務めた後でも、味方を残して先に渡った時は口へ戻るまで下知を出さない。
  // 一人が足止めされても無期限の防戦にしない。残兵がいる時は渡り切ったと知らせない。
  // 11/14 クラウドゆ act bot：残る味方が岸に一人でもいると百五十秒守り続け、渡る前に時切れ（899秒→1080秒）。残兵がいても七十五秒で渡す
  if (atMouth && S.held > 45 && el > 55 && (!remaining || S.held > 75)) release(rt, remaining);
  // 11/14 クラウド：act bot が口から離れて斬り合うと atMouth が立たず殿の段が終わらなかった。百秒を過ぎたら居所に関わらず退きの下知を出す
  else if (el > 100) release(rt, remaining);
}
