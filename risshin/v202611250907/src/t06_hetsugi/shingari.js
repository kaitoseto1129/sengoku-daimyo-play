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
    g.order = 'hold'; g.dest = null; g.onArrive = null; g.anchor = at; g.facing = Math.PI; g.aggro = 22; g.seekRange = 26; g.speed = 3.6;   // 11/18 夜50-40（歴史好き bot 640秒：殿の十河の旗本4人が二十 m 先の島津を前に攻めのまま立った）：殿は寄る追手へ二十余 m 打ち掛かる
    for (const u of g.units) if (u.alive && !u.gone && u.type !== 'busho') u.invuln = false;
    rt.after(1, () => { if (F.step === 4) rt.say('十河存保', '四国の衆、先へ行け！　十河がここで止める！', 3); });
  }
  // K405（kaito 11/20「元親は後ろで、蓋をされないようしんがりとして戦う」）：元親の隊も浅瀬の口の外（十河の反対の脇）で向き直り、
  //   退き口を塞がれないよう追手を止める。元親は生き延びる（史実）。皆が渡れば元親も浅瀬を渡って南の岸へ（release）
  const m = F.moto;
  if (m?.count) {
    F.follow = (F.follow || []).filter(([q]) => q !== m);
    const at = { x: MOUTH_N.x - 8, z: MOUTH_N.z - 14 };
    m.order = 'hold'; m.dest = null; m.onArrive = null; m.path = null; m.anchor = at; m.facing = Math.PI; m.aggro = 18; m.seekRange = 22; m.speed = 3.6; m.stay = true;
    for (const u of m.units) if (u.alive && !u.gone && u.type === 'busho') u.invuln = true;
    rt.after(4.5, () => { if (F.step === 4 && !F.s4.go) rt.say('長宗我部元親', '退き口に蓋をさせるな！　ここで止めよ！', 3); });
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
  if (S.K) rt.marker('ford', () => pin(rt, S.K), '戸次川の浅瀬');
  rt.after(3, () => rt.say('十河存保', '行け！　振り返るな！', 2.4));
  // K405：殿に立った元親の隊も浅瀬を渡って南の岸へ退く（十河は残る＝別の死）
  const m = F.moto;
  if (m?.count) {
    const fx = (S.K?.FORD?.x ?? MOUTH_N.x) - 6;
    m.stay = false; m.aggro = 0; m.seekRange = 0; m.focus = null;
    m.order = 'move'; m.dest = { x: fx, z: 44 }; m.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: fx, z: 44 }; };
  }
}

// P4（K410）：浅瀬の北口のピンに着いて「済」の後、少し置いて渡る下知（北口で長く待たせない）
export function releaseNow(rt) { if (rt.flags.s4) release(rt, false); }

export function crossNow(rt) { return !!rt.flags.s4?.go; }

export function crossed(rt, K) {
  const P = rt.player.u.pos;
  // K410（kaito 11/20「浅瀬まで退いたのにクリアにならない」）：殿の下知を待たず、浅瀬の南へ着いたらそこで済み（次の行き先が出る）
  if (!crossNow(rt) && rt.flags.s4 && P.z > 26 && Math.hypot(P.x - K.FORD.x, P.z - 34) < 26) release(rt, true);
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
    F.mText = '浅瀬の北口で味方を守れ'; rt.obj('main', F.mText, 'main', true);
    rt.say('十河存保', '浅瀬の口は任せた！　退く味方を守れ！', 2.8);
    // 着いた所で守る間は行き先のピンを消す（戦の声は名のある将の声が届く時だけで、着いても何も変わらない回があった。渡る下知でまた出す）
    rt.unmark('ford'); S.K = K;
    // 11/16 iMac act bot：北口に着いても声が届かない回があり、六秒何も起きなかった（481秒）。着いたら近い島津の追手二組を本人へ向け、土手を寄せて来させる
    const me = rt.player.u;
    const near = rt.army.groups.filter((g) => g.team === 1 && g.count && !g.routed && g !== F.ieh && g !== F.iehS && !g.stay && g.kind !== 'main')
      .map((g) => [g, Math.hypot(g.center().x - P.x, g.center().z - P.z)]).filter(([, d]) => d < 90).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [g] of near) { g.order = 'attack'; g.focus = me; g.dest = null; g.aggro = 14; g.seekRange = 40; g.speed = Math.max(g.speed || 0, 4.4); }
  }
  if (atMouth) S.held = (S.held || 0) + dt;
  // 11/19 持ち主（中学生 bot 501秒：退きの下知の後も信親の倒れた所（百 m 奥）で島津と突き合い続け、囲まれて倒れた）：口から四十五 m より遠い間は、
  //   十二秒目から十四秒ごとに手勢の侍が浅瀬の口へ呼ぶ（行き先は▼のまま。字の札は足さない）
  if (!S.arrived && el > 12 && Math.hypot(P.x - MOUTH_N.x, P.z - MOUTH_N.z) > 45 && rt.t > (S.callT ?? 0)) {
    S.callT = rt.t + 14;
    rt.say('手勢の侍', (S.calls = (S.calls || 0) + 1) % 2 ? '殿！　ここに留まれば囲まれまする！　浅瀬の口へ退かれよ！' : '島津が回り込む！　川へ、川へ退け！', 2.6);
  }
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
  if (atMouth && S.held > 36 && !S.hailed50) {
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
  // 11/18 クラウド持ち主（長さ）：act bot は北口と斬り合いを行き来して百秒の切り上げで渡っていた。残兵がいても六十秒・居所に関わらず八十秒で渡す
  // 11/18 23:10 持ち主（せっかち bot 一戦が長い）：守り四十秒・残兵がいても五十秒・居所に関わらず七十秒で渡す
  if (atMouth && S.held > 40 && el > 48 && (!remaining || S.held > 50)) release(rt, remaining);
  // 11/14 クラウド：act bot が口から離れて斬り合うと atMouth が立たず殿の段が終わらなかった。百秒を過ぎたら居所に関わらず退きの下知を出す
  else if (el > 70) release(rt, remaining);
}
