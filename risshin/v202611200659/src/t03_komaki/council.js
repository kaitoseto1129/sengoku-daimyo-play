// ======================================================================
// 小牧の対陣　④⑤の段「軍議と中入りの支度」（6〜9分）
//   ④楽田の本陣の軍議へ戻る：池田恒興・森長可が「三河へ回り込む」中入りを言い出し、秀吉が許す（羽柴秀次を大将に）。
//   ⑤森長可の陣へ中入りの下知を届ける：陣の間を東へ駆ける。着くと森長可が羽黒の借りを返すと誓い、陣払いの支度。
//     途中、荷駄の列・馬を引く者・陣を払う兵（中入りの支度の動き）を見る。日が暮れてゆく。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { moveSonae } from './depth.js';
import { seatCommander } from './camp.js';

function after(rt, t, run) {
  const stage = rt.flags.stage;
  rt.after(t, () => {
    if (!rt.over && rt.player?.u?.alive !== false && !rt.flags.ending && !rt.flags.transitioning && rt.flags.stage === stage) run();
  });
}
function say(rt, who, s, t, sec = 3) {
  after(rt, t, () => rt.say(who, s, sec));
}

// 軍議への往復も本人が大手門を通る。暗転の前後で三十歩を飛び移らせない。
function walkCommander(rt, K, at, returning = false) {
  const g = rt.flags.hideyoshi;
  g.noAI = true; g.stay = false; g.march = true; g.keepMoveOrder = true;
  g.order = 'path'; g.dest = null; g.pathIdx = 0; g.speed = 3.4;
  const inside = [K.RAKUDA.x, K.RK.z1 - 5], outside = [K.RAKUDA.x, K.RK.z1 + 5];
  g.path = returning ? [outside, inside, [at.x, at.z]] : [inside, outside, [at.x, at.z]];
  // 床几の将は狙われない者なので、非戦闘員も到着判定に含める。
  g.arriveNoncombat = true; g.arriveRadius = 1;
  for (const u of g.units) {
    u._crouch = false; u.target = null; u.watch = null; u.moveTo = null;
  }
  g.onArrive = (q) => {
    q.path = null; q.order = 'hold'; q.march = false; q.keepMoveOrder = false; q.stay = true;
    // 着いた本人の位置で座る。到着判定の残りの距離も瞬間移動で詰めない。
    seatCommander(rt, q, q.units[0].pos);
    q.facing = 0;
  };
}

export function startCouncil(rt, K) {
  const F = rt.flags;
  // 夜討ちの後とは日が違う軍議。日付の「夕」と空の明るさを揃える。
  rt.world.dayClock = null;
  rt.world.setTime('dusk', true);
  // 本陣の秀吉本人が、主人公の帰陣中に門前の軍議へ出る。
  walkCommander(rt, K, { x: K.COUNCIL.x, z: K.COUNCIL.z - 7 });
  // 11/19 06:00 クラウド 小牧の持ち主：一戦が455〜495秒で七分を越え、その三割（段4・5 の百三十秒）が斬り合いの無い長い歩きだった
  //   （田から楽田まで百二十 m・楽田から森の陣まで百六十 m）。日の替わる暗転の間に、本人と組を本陣の手前三十五 m（楽田の南の野）へ移す
  K.warpTo?.(-14, -42, K.COUNCIL);
  say(rt, '羽柴秀吉', '徳川殿は動かぬ。……戻って参れ、軍議じゃ', 0.6, 3.2);
  // 本陣へ戻る道すがら（二巡 徳川A 11/9：戻り道の一分半に何も起きなかった）。夕の陣の間に、中入りの前触れを聞かせる
  say(rt, '足軽', '小牧山の柵の内に、篝火が増えてゆく。徳川も眠らぬのう', 4, 3);
  // 大手門の前の床几に将が集まる（秀吉・秀次・池田・森・堀。討てない・動かない）
  F.council = allyGroup(rt, { name: '軍議の衆', fullStrength: true, anchor: { x: K.COUNCIL.x, z: K.COUNCIL.z - 4 }, facing: 0, width: 8, formation: 'line', aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
    K.fl([{ type: 'busho', n: 1, o: { name: '三好信吉', invuln: true } }, { type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, flag: 'ageha' } },
      { type: 'busho', n: 1, o: { name: '森長可', invuln: true, flag: 'tsuru' } }, { type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, flag: 'hori' } }], 'toyotomi'));
  for (const u of F.council.units) { u.noTarget = true; u.invuln = true; u._crouch = true; }
}
export function tickCouncil(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  const at = K.COUNCIL;
  // 組は床几の二十四 m 手前から留める（着いてから留めると、本人の脇まで来た十人余りが十五秒かけて下がり、その間 軍議の前に人垣が立つ）
  if (!F.cnHold && !F.cnAt && Math.hypot(P.x - at.x, P.z - at.z) < 24) holdAtCouncil(rt, at);
  if (!F.cnAt && Math.hypot(P.x - at.x, P.z - at.z) < 10 && el > 8) {
    F.cnAt = rt.t;
    const L = [
      ['池田恒興', '睨み合うたままでは埒があかぬ。三河は留守。岡崎を突けば、徳川殿は小牧を捨てて戻られよう', 0.2, 4],
      ['森長可', '羽黒の借り、三河で返す。わしも行く', 4.6, 3],
      ['堀秀政', '道は長い。気取られれば、我らが野で挟まれまするぞ', 8, 3.2],
      ['羽柴秀吉', 'そこまで申すなら許そう。孫七郎を大将に、二万で回り込め', 11.6, 3.4],
      ['三好信吉', '承った。夜のうちに出る。音を立てるな', 15.4, 3],
      ['羽柴秀吉', '徳川殿は野の戦の上手。くれぐれも、気取られるな', 18.8, 3],
      ['羽柴秀吉', 'その方は荷駄の列を連れて森の陣へ行け。出立の支度をせよと伝えよ', 22.4, 3.2],
    ];
    for (const [who, s, t, sec] of L) say(rt, who, s, t, sec);

  }
  // 再開では到着済みの印だけが戻るため、段の終了は予約だけに頼らない。
  if (F.cnAt && rt.t - F.cnAt >= 26) K.next();
}

// 11/19 07:55 クラウド 小牧の持ち主：床几に着いた後、名の無い組の兵十〜十五人が本人に付いて軍議の衆の前へ寄り、人垣で将が隠れた
//   （07:35 の描かずの数え）→着いたら組を床几の手前十一 m の南に留め、北の軍議を向いて待たせる。下知の段で追従へ戻す
function holdAtCouncil(rt, at) {
  rt.flags.cnHold = true;
  // 本人の来た向き（床几→本人）の二十 m 先に留める。床几の真南に置くと、南東から来る組が本人を追い越して前へ出た
  const P = rt.player.u.pos, d = Math.hypot(P.x - at.x, P.z - at.z) || 1, ux = (P.x - at.x) / d, uz = (P.z - at.z) / d;
  let k = 0;
  for (const g of [...(rt.squadGroups || []), rt.flags.men]) if (g && g.units) {
    g._cnAggro = [g.aggro, g.seekRange]; g.aggro = 0; g.seekRange = 0; g.focus = null;   // 寄る相手を探さない（探すと本人の前へ寄り直した）
    g.order = 'hold'; g.dest = null; g.path = null; g.formation = 'line'; g.facing = Math.atan2(-ux, -uz);
    const r = 20 + k * 4, sd = k ? 6 : 0;
    g.anchor = { x: at.x + ux * r + uz * sd, z: at.z + uz * r - ux * sd }; k++;
  }
}
function releaseCouncil(rt) {
  if (!rt.flags.cnHold) return;
  rt.flags.cnHold = false;
  for (const g of [...(rt.squadGroups || []), rt.flags.men]) if (g && g._cnAggro) { [g.aggro, g.seekRange] = g._cnAggro; g._cnAggro = null; }
  for (const g of rt.squadGroups || []) if (g) g.order = 'follow';
}

export function startOrders(rt, K) {
  const F = rt.flags;
  releaseCouncil(rt);
  walkCommander(rt, K, { x: K.RAKUDA.x, z: K.RAKUDA.z - 4 }, true);
  // 11/19 06:00 クラウド 小牧の持ち主：楽田から森の陣まで百六十 m の歩きを、暗転の間に犬山への道の上（森の陣の西三十七 m）へ移して詰める
  K.warpTo?.(88, -15, K.MORIJIN);
  // 日を改めた届け先には、軍議を終えた森長可と旗本を置く。
  for (const u of F.council?.units || []) if (u.name === '森長可' && u.alive && !u.gone) rt.army.despawn(u);
  F.moriOrders = allyGroup(rt, { name: '森長可の陣の旗本', fullStrength: true, anchor: { x: K.MORIJIN.x, z: K.MORIJIN.z + 8 }, facing: 0, width: 5, formation: 'line', aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
    K.fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true, invuln: true } }, { type: 'samurai', n: 4 }], 'tsuru'));
  for (const u of F.moriOrders.units) u.noTarget = true;
  // 11/19 01:30 クラウド 小牧の持ち主 ⑥（330秒の写真：森長可の陣が陣幕と旗本五人だけで、三千の森勢の陣に見えない）：
  //   陣幕の前の野に、陣を払って出る支度の森勢の足軽・鉄砲を二列に並べる（本物の兵・寄せない。段6 の初めに森長可の隊へ替える）
  F.moriPrep = allyGroup(rt, { name: '森勢の支度の足軽', fullStrength: true, anchor: { x: K.MORIJIN.x - 12, z: K.MORIJIN.z + 18 }, facing: 0, width: 9, formation: 'line', aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
    K.fl([{ type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 6 }], 'tsuru'));
  for (const u of F.moriPrep.units) u.noTarget = true;
  // 日が傾く（夜の出陣へ）
  try { const W = rt.world; W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = 60; } catch (e) { /* 空はそのまま */ }
  // 陣を払う荷駄と足軽の小組（中入りの支度の動き。道の脇を東へ）
  //   荷駄は本人の脇の道（西二十 m）から森の陣へ東へ進む（本人の目に入る所で）
  F.porters = allyGroup(rt, { name: '中入りの荷駄', fullStrength: true, anchor: { x: 68, z: -21 }, facing: Math.PI / 2, width: 4, formation: 'column', aggro: 0, seekRange: 0, order: 'move', speed: 2.2, noRout: true },
    K.fl([{ type: 'ashigaru', n: 8, o: { flagScale: 1 } }], 'ageha'));
  F.porters.dest = { x: K.MORIJIN.x - 20, z: K.MORIJIN.z - 8 };
  F.porters.onArrive = (q) => { q.order = 'hold'; };
  say(rt, '足軽', '陣払いじゃと？　夜に出るのか', 1.5, 2.8);
  say(rt, '使番', '池田勢、荷を軽うして集まりまする！', 4.5, 3);
  // 東の森勢の後備（遠景）も陣を払って寄る
  moveSonae(rt, 'A', 'mori', 110, -36);
}
export function tickOrders(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  // 下知は主人公が届ける。支度中の荷駄が道に詰まっても、森の陣で待たせない。
  // 11/18 cloud-06（中学生の bot：森の陣に早く着くと十秒待たされ、台詞の十六秒と合わせて30秒、印も敵も無く迷った）：着いて三秒で下知を届けた事にする
  if (!F.ordAt && Math.hypot(P.x - K.MORIJIN.x, P.z - K.MORIJIN.z) < 14 && el > 3) {
    F.ordAt = rt.t;
    rt.award((t) => t.side.push('森長可の陣へ中入りの下知を届けた'), '森の陣へ下知を届けた');
    say(rt, '森長可', '待ちかねたわ！　羽黒で討たれた三百の仇、三河で取る', 0.2, 3.2);
    say(rt, '森長可', '篝火はそのままにして陣を払え。徳川の物見に悟られるな', 3.8, 3.2);
    say(rt, '森長可', '者ども、荷を軽うせよ。腰兵糧は三日分じゃ', 8, 3);
    say(rt, '足軽', '具足の紐を締め直せ。夜通し歩くぞ', 12, 2.8);

  }
  if (F.ordAt && rt.t - F.ordAt >= 16) K.next();
}
