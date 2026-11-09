// ======================================================================
// 小牧の対陣　④⑤の段「軍議と中入りの支度」（6〜9分）
//   ④楽田の本陣の軍議へ戻る：池田恒興・森長可が「三河へ回り込む」中入りを言い出し、秀吉が許す（羽柴秀次を大将に）。
//   ⑤森長可の陣へ中入りの下知を届ける：陣の間を東へ駆ける。着くと森長可が羽黒の借りを返すと誓い、陣払いの支度。
//     途中、荷駄の列・馬を引く者・陣を払う兵（中入りの支度の動き）を見る。日が暮れてゆく。
// ======================================================================
import { allyGroup } from '../bhelp.js';

function say(rt, who, s, t, sec = 3) { rt.after(t, () => { if (!rt.flags.ending) rt.say(who, s, sec); }); }

export function startCouncil(rt, K) {
  const F = rt.flags;
  say(rt, '羽柴秀吉', '家康め、動かぬ。……戻って参れ、軍議じゃ', 0.6, 3.2);
  say(rt, '日根野弘就', '砦は我らが守る。本陣へ急がれよ', 5, 2.8);
  // 大手門の前の床几に将が集まる（秀吉・秀次・池田・森・堀。討てない・動かない）
  F.council = allyGroup(rt, { name: '軍議の衆', fullStrength: true, anchor: { x: K.COUNCIL.x, z: K.COUNCIL.z - 4 }, facing: 0, width: 8, formation: 'line', aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
    K.fl([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'busho', n: 1, o: { name: '羽柴秀次', invuln: true } }, { type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, flag: 'ageha' } },
      { type: 'busho', n: 1, o: { name: '森長可', invuln: true, flag: 'tsuru' } }, { type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, flag: 'hori' } }], 'toyotomi'));
  for (const u of F.council.units) { u.noTarget = true; u.invuln = true; }
}
export function tickCouncil(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  const at = K.COUNCIL;
  if (!F.cnAt && Math.hypot(P.x - at.x, P.z - at.z) < 10 && el > 8) {
    F.cnAt = rt.t;
    const L = [
      ['池田恒興', '睨み合うたままでは埒があかぬ。三河は留守。岡崎を突けば、徳川殿は小牧を捨てて戻られよう', 0.2, 4],
      ['森長可', '羽黒の借り、三河で返す。わしも行く', 4.6, 3],
      ['堀秀政', '道は長い。気取られれば、我らが野で挟まれまするぞ', 8, 3.2],
      ['羽柴秀吉', 'そこまで申すなら許そう。孫七郎を大将に、二万で回り込め', 11.6, 3.4],
      ['羽柴秀次', '承った。夜のうちに出る。音を立てるな', 15.4, 3],
      ['羽柴秀吉', '家康は野の戦の上手。くれぐれも、気取られるな', 18.8, 3],
      ['羽柴秀吉', 'その方は荷駄の列を連れて森の陣へ行け。今宵出ると伝えよ', 22.4, 3.2],
    ];
    for (const [who, s, t, sec] of L) say(rt, who, s, t, sec);
    rt.after(26, () => K.next());
  }
}

export function startOrders(rt, K) {
  const F = rt.flags;
  // 日が傾く（夜の出陣へ）
  try { const W = rt.world; W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = 60; } catch (e) { /* 空はそのまま */ }
  // 陣を払う荷駄と足軽の小組（中入りの支度の動き。道の脇を東へ）
  F.porters = allyGroup(rt, { name: '中入りの荷駄', fullStrength: true, anchor: { x: K.RAKUDA.x + 16, z: K.RK.z1 + 10 }, facing: Math.PI / 2, width: 4, formation: 'column', aggro: 0, seekRange: 0, order: 'move', speed: 2.2, noRout: true },
    K.fl([{ type: 'ashigaru', n: 8, o: { flagScale: 1 } }], 'ageha'));
  F.porters.dest = { x: K.MORIJIN.x - 20, z: K.MORIJIN.z - 8 };
  F.porters.onArrive = (q) => { q.order = 'hold'; };
  say(rt, '足軽', '陣払いじゃと？　夜に出るのか', 10, 2.8);
  say(rt, '使番', '池田勢、荷を軽うして集まりまする！', 26, 3);
  // 東の森勢の後備（遠景）も陣を払って寄る
  try { F.farHashiba?.[5]?.moveTo?.(110, -36, 60); } catch (e) { /* 遠景 */ }
}
export function tickOrders(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  // 荷駄の列を連れて行く（列が陣の近くへ着くまで待つ。荷駄は人の足）
  const pc = K.live(F.porters) ? F.porters.center() : null;
  const with_ = !pc || Math.hypot(pc.x - K.MORIJIN.x, pc.z - K.MORIJIN.z) < 40 || el > 120;
  if (!F.ordAt && Math.hypot(P.x - K.MORIJIN.x, P.z - K.MORIJIN.z) < 14 && el > 10 && with_) {
    F.ordAt = rt.t;
    rt.award((t) => t.side.push('森長可の陣へ中入りの下知を届けた'), '森の陣へ下知を届けた');
    say(rt, '森長可', '待ちかねたわ！　羽黒で討たれた三百の仇、三河で取る', 0.2, 3.2);
    say(rt, '森長可', '篝火はそのままにして陣を払え。徳川の物見に悟られるな', 3.8, 3.2);
    say(rt, '森長可', '者ども、荷を軽うせよ。腰兵糧は三日分じゃ', 8, 3);
    say(rt, '足軽', '具足の紐を締め直せ。夜通し歩くぞ', 12, 2.8);
    rt.after(16, () => K.next());
  }
}
