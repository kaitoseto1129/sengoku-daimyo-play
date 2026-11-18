// ======================================================================
// 大坂の陣　真田丸の戦い（慶長十九年十二月四日）
// 大坂城の南に突き出た出丸・真田丸。外に柵、その内に空堀、土塁の上に塀と櫓。塀の内から鉄砲が並ぶ。
// 足軽は前田利光の手（先手・山崎長徳の組）。徳川編の真田丸（b_k11_sanadamaru.js）と同じ縄張り・七段の流れ・台詞で遊ぶ：
//   ①篠山（もぬけ）②正面＝引きつけての一斉射 ③西から回り込み＝横の鉄砲衆と予備の槍 ④先走りの渋滞を整理
//   ⑤最大の攻め＝柵を破ると二の構えの一斉射と大助・伊木の打って出 ⑥攻撃中止 ⑦竹束の陣へ撤収（docs/sanadamaru_spec_1109.md）
// この筋書きだけの違いは下で上に重ねる（docs/check60/sanadamaru.md）
// 向き：北が -z（大坂城）。寄せ手は南（+z）から北へ攻める
// ======================================================================
import { k11_sanadamaru } from './b_k11_sanadamaru.js';
import { STAGES } from './stages.js';
import { enemyGroup } from './bhelp.js';

// 写しは getter ごと写す（battles.js の copyDef と同じ）。同じ object を二つの id に出すと .key の取り合いになる
const sanadamaru = Object.defineProperties({}, Object.getOwnPropertyDescriptors(k11_sanadamaru));
// 段の字は徳川編と同じ（右上の目標・終わりの札は STAGES[key] を引く）
STAGES.sanadamaru = STAGES.k11_sanadamaru;
// 段の名（柵の前・打って出）を phase にも出す（広告の撮り方 tools/pv1104_page.js が phase で待つ）
sanadamaru.fenceStart = function (rt) { k11_sanadamaru.fenceStart.call(this, rt); rt.setPhase('fence'); jamBehind(rt); };
// 最大の攻めの間、④で整理して竹束の陣へ下げた後の手（三組・二十余り）は退き口で立ち尽くしていた（11/17 クラウド持ち主 act bot：
//   361〜376秒に「前田の後の手・富田の組・本多の後の手」が (±34,89) で move のまま止まり＝遠くの本物）。
//   本人の十数歩後ろの二の線へ寄せ、塊の厚みに入れる（新しく兵は足さない。⑥の攻撃中止では徳川編の withdraw が竹束の陣へ戻す）
function jamBehind(rt) {
  const P = rt.player && rt.player.u && rt.player.u.pos;
  if (!P) return;
  (rt.flags.jam || []).filter((g) => g && g.count > 0).forEach((g, i) => {
    const d = { x: Math.max(-60, Math.min(60, P.x + [-12, 12, 0][i % 3])), z: P.z + 14 + (i % 3) * 3 };
    g.order = 'move'; g.dest = d; g.anchor = d; g.keepMoveOrder = true; g.aggro = 8; g.fire = true; g.stay = false;
    for (const u of g.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
  });
}
// 打って出は大助と伊木の手に、丸の内の槍の一組（六文銭の赤）を重ねる（11/17 クラウド持ち主 act bot：8分で討ち取り7＝斬り合う相手が少ない。
//   前田の先手は柵の前で打って出の槍に揉まれて大きな損を出した。出るのは大助の隊と同じ東の口から、大助の後に続いて）
sanadamaru.sortie = function (rt) {
  k11_sanadamaru.sortie.call(this, rt);
  rt.setPhase('sortie');
  rt.after(10, () => {
    const F = rt.flags;
    if (F.step !== 5 || F.ending || F.osakaSpear) return;
    const lead = (rt.army.groups || []).find((g) => g.team === 1 && g.count && g.name === '真田大助の隊');
    const u = lead && lead.units.find((x) => x.alive);
    const at = u ? { x: u.pos.x + 6, z: u.pos.z - 4 } : { x: 40, z: 4 };
    const lk = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
    const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '丸の内から出た真田の槍', anchor: at, facing: 0, width: 8, aggro: 14, order: 'attack', seekRange: 130, noRout: true },
      [{ type: 'samurai', n: 2, o: lk }, { type: 'ashigaru', n: 12, o: lk }]);
    g.dmgMult = 0.4; g.sortie = true; F.osakaSpear = g;
    rt.after(40, () => { g.noRout = false; });
  });
};
// 携帯の横（高さ 500px まで）では目標の札を細く小さく（844×390 で札が画面の右半分を覆い、柵と塀が見えなかった。戦場の三分の二は空ける）
sanadamaru.goalsHud = function (rt) {
  k11_sanadamaru.goalsHud.call(this, rt);
  if (!rt.hud || !rt.hud.root || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = `@media (max-height: 500px) {
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode { max-width:min(300px, 36vw) !important; padding:5px 8px 6px 7px !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3, li) { font-size:12px !important; line-height:1.35 !important; }
html:root body #hud#hud#hud.sanada-goals #h-prog#h-prog.goal-mode .pg-goals li.now { font-size:13px !important; padding:2px 4px !important; } }`;
  document.head.appendChild(st);
  const dispose = rt.dispose;
  rt.dispose = function () { st.remove(); return dispose.call(this); };
};
// 結果の札の一行は最後の段（殿）を果たした事を書く（大きな任務の札は①のままなので「篠山の頂まで登れを果たした」と出ていた）
sanadamaru.onFinish = (rt) => { if (rt.tracker.main === true) rt.lastMainDone = STAGES.sanadamaru[STAGES.sanadamaru.length - 1][0]; };
// 言葉：前田利常が家臣の前で家康を呼ぶ時は「大御所様」（敬いを落とさない。専門家の目・11/6）
sanadamaru.setup = function (rt) {
  const say = rt.say;
  rt.say = function (who, text, ...a) { return say.call(this, who, who === '前田利常' && typeof text === 'string' ? text.replace(/^大御所は/, '大御所様は') : text, ...a); };
  return k11_sanadamaru.setup.call(this, rt);
};
// 真田は砦を守る：寄せ手が崩れても塀の鉄砲や信繁の旗本が「追撃」に出ない（史実も信繁は丸を出ず、打って出たのは大助・伊木の手だけ。
//   11/10 遊んだ：⑥で「塀の内の鉄砲、追撃／真田信繁の旗本、追撃／塀の内の西の鉄砲衆、追撃」が中央に三枚重なった）
sanadamaru.noPursuit = true;
// 両軍の備は、本物の名の将が実際に討たれた時だけ「敵の大将を討った」「味方の大将が討たれた」と出す。
//   名目の損のくじや、名の無い組頭の死では出さない（11/10 遊んだ：④と⑤で「敵の大将を討った」、③で「味方の大将が討たれた」。
//   この日、真田の将も前田の山崎・本多も討たれていない）
function quietSanada(rt) {
  for (const S of rt.sonae || []) {
    if (S._sanaQuiet) continue;
    S._sanaQuiet = true;
    const w = S.watch;
    S.watch = function () { const u = this.b && this.b.taishoU; if (u && this.taisho && u.name === this.taisho) return w.call(this); };
  }
  // 段と段の合間（篠山の北の麓で組を立て直す間）の札は、その場の行い（共通の「組のそばで槍を構えよ」は構えの案内で、ここに合わない）
  const g = rt.missionGuide;
  if (g && g.waitObjective && !g.waitObjective._sana) {
    g.waitObjective._sana = true;
    // 撤収の後（和議の場面）は竹束の陣から丸を見る
    Object.defineProperty(g.waitObjective, 'text', { get: () => (rt.flags.ending ? '竹束の陣から真田丸を見よ' : '篠山の北の麓で組を立て直せ'), set() {}, configurable: true });
  }
}
// ⑦ 竹束の陣に着いた後、何も起きずに一分余り立って待った（11/10 遊んだ：着いて 65 秒）。着いて取り残された組が戻る間だけ待つ
sanadamaru.minEl = function (st, sec, label, radius) {
  return k11_sanadamaru.minEl.call(this, st, label === '竹束の陣' ? Math.min(sec, 40) : sec, label, radius);
};
// 締め：「振り返ると……六文銭の旗が、まだ立っている」の台詞で、本人が丸の方へ振り返る（11/10 遊んだ：竹束の陣で南を向いたまま、
//   和議・堀の埋め立て・丸の破却の場面（k11/wagi.js）が背中の側で起きて一つも見えなかった）。下知の台詞に合わせた一度だけの振り向き
sanadamaru.win = function (rt) {
  const was = rt.flags.ending;
  k11_sanadamaru.win.call(this, rt);
  if (!was && rt.flags.ending) rt.after(4.4, () => { rt.flags.sanaTurnT = rt.t; });
};
function turnBack(rt, dt) {
  const F = rt.flags, p = rt.player;
  if (F.sanaTurnT == null || !p || !p.u || rt.t - F.sanaTurnT > 2.4) return;
  const want = Math.atan2(0 - p.u.pos.x, -40 - p.u.pos.z);   // 真田丸の中心（b_k11_sanadamaru.js の C）
  let d = (want - p.yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  p.yaw += d * Math.min(1, dt * 2.6);
}
// ③ 横の鉄砲衆を抑える段が三分半続いた（11/10 遊んだ：210→430 秒。手本は第二の攻め全体で二分半）。
//   百十秒寄せ続ければ、半ばを討てなくても鉄砲衆は塀の内へ引く（引かせ方は徳川編の段のまま）
sanadamaru.subdue = function (o) {
  const st = k11_sanadamaru.subdue.call(this, o), tick = st.tick;
  st.tick = (rt, C, m, ctx, el, dt) => { if (el > 110) C.pressT = Math.max(C.pressT || 0, 100); return tick.call(st, rt, C, m, ctx, el, dt); };
  return st;
};
// 11/18 クラウド持ち主 act bot：⑤の始めに一度だけ寄せた後の手三組は、本人が柵へ進んだ後も始めの場所 (-16,35)(8,39)(-3,38) で
//   321〜371秒 move のまま立ち尽くした（着いた後に本人が離れた）。⑤の間は八秒ごとに本人の後ろへ寄せ直し、塊を本人に付いて来させる
function followJam(rt) {
  const F = rt.flags;
  if (F.step !== 5 || F.ending) return;
  if (F.jamFollowT != null && rt.t - F.jamFollowT < 8) return;
  F.jamFollowT = rt.t;
  const P = rt.player && rt.player.u && rt.player.u.alive && rt.player.u.pos;
  if (!P) return;
  for (const g of F.jam || []) {
    if (!g || !g.count || !g.dest || (g.order !== 'move' && !g._osakaLine)) continue;
    const c = g.center();
    if (Math.hypot(c.x - P.x, c.z - P.z) > 22) { for (const q of F.jam) if (q) { q._osakaLine = false; q.formation = 'column'; } jamBehind(rt); return; }
  }
  // 11/18 クラウド持ち主 act bot：寄せ先に着いた後の手が縦の列（column）のまま move で四十秒立ち尽くした（281〜301秒 (-14,23)）。
  //   着いた組は槍を揃えて丸の方（北）へ向く二の線の構えに替える（本人が二十二歩より離れれば、上の寄せ直しでまた付いて来る）
  for (const g of F.jam || []) {
    if (!g || !g.count || g.order !== 'move' || !g.dest || g._osakaLine) continue;
    const c = g.center();
    if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) > 4) continue;
    g._osakaLine = true; g.order = 'hold'; g.formation = 'yari'; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z };
  }
  // 寄せ先に着いて、打って出の敵が十五歩の内にいる組は、立ったままにせず斬り合いに入る（11/18 act bot：416秒 富田の組が (11,25) で move のまま止まった）
  const foes = (rt.army.groups || []).filter((q) => q.team === 1 && q.count > 0 && q.sortie);
  for (const g of F.jam || []) {
    if (!g || !g.count || (g.order !== 'move' && !g._osakaLine) || !g.dest) continue;
    const c = g.center();
    if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) > 5) continue;
    if (!foes.some((q) => { const e = q.center(); return Math.hypot(e.x - c.x, e.z - c.z) < 15; })) continue;
    g._osakaLine = false; g.order = 'attack'; g.keepMoveOrder = false; g.aggro = 15;
  }
  // 丸の内から出た槍は東の口の外 (40,-11) で相手を探せず、遠くの軽い動かしの間に十一人が一点に重なって止まった（11/18 act bot 351秒）。
  //   本人から二十五歩より遠い間は、前田の寄せ手の塊（本人の前）へ駆け寄らせ、着けば斬り合いに戻す
  const sp = F.osakaSpear;
  if (sp && sp.count > 0 && !sp.routed) {
    const c = sp.center(), d = Math.hypot(c.x - P.x, c.z - P.z);
    if (d > 25) {
      const to = { x: P.x + (c.x - P.x) * 8 / d, z: P.z + (c.z - P.z) * 8 / d };
      sp.order = 'move'; sp.dest = to; sp.anchor = to; sp.keepMoveOrder = true;
      for (const u of sp.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
    } else if (sp.order === 'move') { sp.order = 'attack'; sp.keepMoveOrder = false; }
  }
  // 討たれ残った組（四人まで）が本人のそばで hold のまま敵の前に立ち尽くした（11/18 クラウド持ち主 act bot：321〜346秒
  //   本多政重の二の手が一人で (4,26) に、301秒 山崎長徳の組が一人で (-2,24) に）。攻めの下知に替えても塀越しで相手が無く立ったまま
  //   だった。前田の先手は大きな損を出して退いた（手負いの生き残りは竹束の陣へ下がる）。⑤の間、三人までの残りは竹束の陣へ退かせる
}
// 11/18 クラウド持ち主 act bot：③でも本多政重の二の手が一人だけ西の柵の際 (-50,-9) に hold のまま二十秒余り立ち尽くした（226秒）。
//   三人までの残りを竹束の陣へ退かせるのは③④⑤の間（⑥⑦は徳川編の withdraw が皆を戻す）
function survivorsBack(rt, P) {
  const F = rt.flags;
  // 11/18 09:21 act bot：⑦でも前田の後の手の一人が (-1,11) で attack のまま二十秒立った。⑥⑦の残りも竹束の陣へ退かせる
  if (F.ending || !(F.step >= 3 && F.step <= 7) || !P) return;
  if (F.survBackT != null && rt.t - F.survBackT < 4) return;
  F.survBackT = rt.t;
  const squads = rt.squadGroups || [];
  // 11/18 03:23 act bot：退かせた残り（山崎長徳の組の一人・本多政重の二の手の三人）が、徳川編の段の下知（hold・柵の外の持ち場）に
  //   上書きされ、(-21,14)(-15,13) で三十秒余り立ち尽くした。退かせた組は四秒ごとに竹束の陣への move を言い直す
  for (const g of rt.army.groups || []) {
    if (!g._osakaBack || !g.count || g.routed || g.team !== 0) continue;
    // 手負いが戻るなどで四人より多くなった組は、徳川編の下知に返す（引き合いにしない）
    if (g.count > 6 || !g.name) { g._osakaBack = false; continue; }   // 11/18 09:18：四人に戻った組を放すと要だけ先に着き (-46,56) で立った。六人までは退かせ続ける
    // 休ませた後に徳川編の段の下知（柵の外の持ち場）に上書きされたら、また竹束の陣へ退かせる
    if (g._osakaRest) { if (g.order === 'hold' && g.anchor && g.anchor.z > 80) continue; g._osakaRest = false; }
    // 11/18 04:35 描かずの流し：竹束の陣に着いた残り（山崎長徳の組の三人）が、元の人数の縦の列の持ち場 (-38,107) に立ったまま
    //   move の下知で四十秒余り（行き先 (-38,92)）。着いた残りは竹束の陰で丸の方（北）へ向いて休ませる（hold）
    if (g.order === 'move' && g.dest && g.dest.z === 92) {
      const c = g.center();
      if (c.z > 85 && Math.hypot(c.x - g.dest.x, c.z - 92) < 18) {
        g._osakaRest = true; g.order = 'hold'; g.formation = 'line'; g.width = 4; g.facing = Math.PI;
        g.anchor = { x: c.x, z: c.z }; g.dest = null; g.keepMoveOrder = false;
        for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
      }
      continue;
    }
    const c0 = g.center(), d = { x: Math.max(-40, Math.min(40, c0.x)), z: 92 };
    // 11/18 07:31 act bot：退かせた残り（前田の新手の一〜三人）が (-42,49)(-46,55)(-50,61) で move のまま要（anchor）の速さ0で立ち尽くした。
    //   要を行き先そのものに置くと要が歩かず（army_groups の move は要を行き先へ運ぶ）、遠くの兵は持ち場を引かれない。要は今いる所から歩かせる
    g.order = 'move'; g.dest = d; g.anchor = { x: c0.x, z: c0.z }; g.keepMoveOrder = true; g.aggro = 3; g.fire = false; g.focus = null; g.assault = null; g.fixed = false; g.stay = false;
    g.formation = 'column'; g.noRing = true;
    for (const u of g.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
  }
  for (const g of rt.army.groups || []) {
    // 名の無い組は備の大将の守り（ai.js が持ち場・退き先を指図する）。退かせると指図と引き合いになり、行き先を替えながら立ち尽くした
    //   （11/18 03:46・03:48 act bot：(-18,33) で行き先 (-35,11)・(-54,25) で行き先 (-63,53)）。名のある組だけを退かせる
    if (!g.name) continue;
    if (g.team !== 0 || !g.count || g.count > 3 || g._osakaBack || g.routed || g.isPlayerSquad || g.sortie) continue;
    if (squads.includes(g) || (F.jam || []).includes(g) || (F.rams || []).includes(g) || /本陣|旗本/.test(g.name || '')) continue;
    if (g.order !== 'hold' && g.order !== 'attack') continue;
    const c = g.center();
    if (Math.hypot(c.x - P.x, c.z - P.z) > 60 || c.z > 60) continue;
    const d = { x: Math.max(-40, Math.min(40, c.x)), z: 92 };
    // 円陣（ring）の形のままでは行軍しない（army_groups.js：ring は marching に入らない）。11/18 03:17 act bot：大将を囲んだ円陣の
    //   残り一人二人が (-33,14)(-47,7) で move のまま四十秒立ち尽くした。退く時は縦の列に替える。
    //   山崎長徳の組の一人は本人から三十歩より遠く (-52,-2) に残ったので、拾う広さを六十歩に
    g.formation = 'column'; g.noRing = true;
    g._osakaBack = true; g.order = 'move'; g.dest = d; g.anchor = { x: c.x, z: c.z }; g.keepMoveOrder = true; g.aggro = 3; g.fire = false;
    g.focus = null; g.assault = null; g.fixed = false; g.stay = false;
    for (const u of g.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
  }
}
// 11/18 クラウド持ち主 act bot 三回：討ち取り11・11・6、受けた傷は鉄砲だけで槍・刀は0（「7分で6人。斬り合う相手が少なくて退屈」）。
//   ③の押し返してくる槍と⑤の打って出の間だけ、本人から二十歩内で塀を挟まない敵の槍の組を一つ本人へ向ける（木津川口の huntPlayer の形）。
//   敵の数・強さは変えない。本人の命が五割を切ったら（徳川編の hunt と同じ。11/18 04:00 act bot：鉄砲の傷で七割を早く切り、刃の傷0・討ち取り5〜7の回）、塀を挟んだら、組が崩れたら放す
//   11/18 02:35 クラウド持ち主：act bot 討ち取り 6〜16 で二回に一回『退屈』。⑤の打って出は前田の塊に先に揉まれるので、⑤だけ二十八歩まで拾う
function huntPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player && rt.player.u;
  const on = P && P.alive && !F.ending && (F.step === 3 || F.step === 5) && P.hp >= P.maxHp * 0.5;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack' || g.stay) return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    // 堀と段の内（丸の中心 (0,-40) から四十四歩の内）の組は向けない（11/18 02:47 act bot：⑤で本人が上の段 (-13,-8) へ誘われ、
    //   降りられずに撃たれ続けて千八十秒で任務失敗）。野へ打って出た組だけを本人へ
    if (Math.hypot(c.x, c.z + 40) < 44) return false;
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < (F.step === 5 ? 28 : 20) && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; F._hunter = g; return; }
}
// 11/18 03:23 act bot：柵を打つ段で遠くに残った柵を破る組は、篠山の北の麓 (18,42) へ退かせる（徳川編の withdraw）が、
//   篠山の斜面 (18,47) で縦の列のまま move で六十秒立ち尽くした（146〜206秒）。着いた控えは槍を揃えて丸の方（北）へ向く横の列で待つ
//   （次の柵を打つ段では徳川編の ramOrder が assault に替える）
function ramsRest(rt) {
  const F = rt.flags;
  if (F.ending || (F._ramRestT != null && rt.t - F._ramRestT < 2)) return;
  F._ramRestT = rt.t;
  // 11/18 05:40 描かずの流し：③で打ち減らされた柵を破る組の残り一二人が、西の柵の外へ退く下知（行き先 (-64,1)）のまま
  //   (-52,0) で柵に当たり 235〜262秒 立ち尽くした。八秒動けない二人までの残りは、篠山の北の麓の控え (18,42) へ退かせる（着けば下で休ませる）
  for (const g of F.rams || []) {
    if (!g || !g.count || g.routed || g.count > 2 || g.order !== 'move' || !g.dest || (g.dest.x === 18 && g.dest.z === 42)) { if (g) g._osakaStuck = null; continue; }
    const c = g.center(), s = g._osakaStuck;
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaStuck = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - s.t < 8) continue;
    g._osakaStuck = null; g.formation = 'column'; g.noRing = true;
    const d = { x: 18, z: 42 };
    g.order = 'move'; g.dest = d; g.anchor = { x: c.x, z: c.z }; g.keepMoveOrder = true; g.aggro = 3; g.fire = false; g.focus = null; g.assault = null; g.fixed = false;
    for (const u of g.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
  }
  // 11/18 07:48 act bot：柵を打つ段の後、退いた柵を破る組（五人）が退き先 (-64,1) に着いたまま move の横の列で五十秒余り立った（271〜296秒）。
  //   徳川編の withdraw は要（anchor）を行き先そのものに置くので、着いても「行く」のまま。どの退き先でも着いた組は北へ向いて待たせる
  //   （次の柵を打つ段では徳川編の ramOrder が assault に替える）
  for (const g of F.rams || []) {
    if (!g || !g.count || g.routed || g.order !== 'move' || !g.dest) continue;
    const c = g.center(), far = Math.hypot(c.x - g.dest.x, c.z - g.dest.z);
    // 11/18 09:25 act bot：篠山の北の斜面 (19,47) で十一人の横の列が麓の控えの八歩の外に掛かり、要は動くのに兵は二十秒立った。麓の控えは十二歩で着いた内に
    // 11/18 09:43・09:46 act bot：五人・三人の組が西の退き先の手前 (-64,1)(-58,1) で move のまま二十秒立った（柵を打つ段の後）。
    //   八秒動けない組は、そこを控えの場として北へ向いて待たせる（丸の外の柵より遠い所だけ）
    if (far > (g.dest.x === 18 && g.dest.z === 42 ? 12 : 3)) {
      const s = g._osakaRamWait;
      if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaRamWait = { x: c.x, z: c.z, t: rt.t }; continue; }
      if (rt.t - s.t < 8 || Math.hypot(c.x, c.z + 40) < 56) continue;
    }
    g._osakaRamWait = null;
    g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.dest = null;
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
}
// 11/18 03:17〜03:33 act bot 五回：控えに置いた前田の新手（槍二十人）が、二十歩の内に真田の兵を見ながら槍を揃えて hold のまま立った
//   （176秒 (-73,-24)・206秒 (-32,21)・346秒 (-31,24)・376秒 (-35,24)）。③④⑤の間、塀を挟まず丸の外（中心から四十四歩より外）の敵が
//   十八歩の内に来た控えは、控えの放ち（depth_reserve.js の release と同じ形）で打ちかからせる。兵は足さない
function reserveEngage(rt) {
  const F = rt.flags;
  if (F.ending || !(F.step >= 3 && F.step <= 5)) return;
  if (F._resEngT != null && rt.t - F._resEngT < 2) return;
  F._resEngT = rt.t;
  const ok = (o) => !o.fleeing && !o.downed && Math.hypot(o.pos.x, o.pos.z + 40) > 44;
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || !g.count || g.routed || g.name !== '前田の新手' || g.order !== 'hold' || !g.stay) continue;
    const c = g.center();
    const e = rt.army.nearestEnemy({ pos: c, team: 0 }, 18, ok);
    if (!e || rt.army.wallBetween(c, 0, e.pos)) continue;
    g.stay = false; g.fire = true; g.aggro = 14; g.seekRange = 30; g.order = 'attack'; g.dest = null; g.focus = null;
  }
}
// 11/18 05:44 act bot：撤収の後（471秒）、口の内の持ち場へ入れた伊木遠雄の隊の七人が (-27,-23) の一点に重なって立った。
//   徳川編は口に着いた名の無い兵を「丸の内へ入った」として片付けるが、将が先に着いて持ち場（hold）に替わると行き先が消え、
//   後から着いた名の無い兵は片付けられずに将の足元へ寄り集まる。持ち場へ入った組の名の無い兵は、持ち場の八歩内に着けば片付ける
function gateTidy(rt) {
  const F = rt.flags;
  if (!(F.step >= 6) || (F._gateTidyT != null && rt.t - F._gateTidyT < 1)) return;
  F._gateTidyT = rt.t;
  for (const g of rt.army.groups || []) {
    if (g.team !== 1 || !g._inGate || !g.count || !g.anchor) continue;
    for (const u of [...g.units]) if (u.alive && !u.gone && !u.name && Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) < 8) rt.army.despawn(u);
  }
  // 11/18 09:40 act bot：撤収の後（421秒）、丸へ戻る真田大助の隊の十三人が東の口の外 (32,-7) で一点に重なり、持ち場（三十歩先の内）へ入れずに立った。
  //   ⑥⑦の間、丸の内の持ち場へ戻る真田の組（打って出の組）で、持ち場から十歩より遠く、一歩半の内に味方が二人いて六秒動けない兵は、口から丸へ入った物として片付ける（大将は残す）
  for (const g of rt.army.groups || []) {
    if (g.team !== 1 || !g.count || !(g.sortie || /大助|伊木/.test(g.name || '')) || g.order !== 'hold' || !g.anchor) continue;
    for (const u of [...g.units]) {
      if (!u.alive || u.gone || u.type === 'busho' || u === g.leader || Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) < 10) { u._osakaPile = null; continue; }
      const s = u._osakaPile;
      if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1) { u._osakaPile = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
      if (rt.t - s.t < 6) continue;
      let n = 0;
      for (const o of g.units) if (o !== u && o.alive && !o.gone && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 1.5) n++;
      if (n >= 2) rt.army.despawn(u);
    }
  }
}
// 11/18 07:51 act bot：撤収（⑥）の後、前田の新手・後の手の一人が (-47,47)(-7,54) で move の縦の列のまま要（anchor）の速さ0で四十秒余り立った。
//   徳川編の withdraw は要を行き先そのものに置く。army_groups の move は要を行き先へ運び兵は要の持ち場へ歩くので、要が初めから着いていると
//   遠くの兵は持ち場を引かれず立ち尽くす。要が行き先と同じ物で、組が四歩より離れていれば、要を今いる所へ戻して歩かせる（行き先は変えない）
function anchorWalk(rt) {
  const F = rt.flags;
  if (F._anchorWalkT != null && rt.t - F._anchorWalkT < 2) return;
  F._anchorWalkT = rt.t;
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || !g.count || g.routed || g.isPlayerSquad || g.order !== 'move' || !g.dest || g.anchor !== g.dest) continue;
    const c = g.center();
    if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) > 4) g.anchor = { x: c.x, z: c.z };
  }
  // 11/18 09:18 act bot：要（anchor）は写しでも、先に行き先へ着くと兵が置き去りのまま立つ（346秒 本多政重の二の手の四人 (-46,56)・
  //   421秒 同じ六人 (-6,72)、要の速さ0）。要が行き先に着き、組が十歩より手前で六秒動かなければ、要を組の所へ戻してもう一度歩かせる
  for (const g of rt.army.groups || []) {
    // 11/18 09:21 act bot：⑦で山崎長徳の組の九人が (-2,46) で要の速さ0のまま二十秒（要は行き先の手前）。要の居所に係わらず、動けない組は要を戻す
    if (g.team !== 0 || !g.count || g.routed || g.isPlayerSquad || g.order !== 'move' || !g.dest || !g.anchor) { if (g) g._osakaLag = null; continue; }
    const c = g.center(), s = g._osakaLag;
    if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) < 10) { g._osakaLag = null; continue; }
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaLag = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - s.t < 6) continue;
    g._osakaLag = null; g.anchor = { x: c.x, z: c.z }; g.formation = 'column'; g.noRing = true;
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
}
// 11/18 08:42 act bot：撤収（⑥⑦）の後、竹束の陣の際まで戻った組が move のまま立った（436秒 柵を破る組の九人 (18,104)・
//   451秒 前田の手の新手の一人 (6,89)、要は動くのに兵は二十秒動かない）。竹束の陣の内（z が 85 より南）で八秒動けない組は、
//   着いた物として丸の方（北）へ向いて休ませる（行き先の十数歩手前でも、そこはもう陣の内）
function campRest(rt) {
  const F = rt.flags;
  if (!(F.step >= 6) || (F._campRestT != null && rt.t - F._campRestT < 2)) return;
  F._campRestT = rt.t;
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || !g.count || g.routed || g.isPlayerSquad || g.order !== 'move' || !g.dest) { if (g) g._osakaCamp = null; continue; }
    const c = g.center(), s = g._osakaCamp;
    if (c.z < 85 || g.dest.z < 85) { g._osakaCamp = null; continue; }
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaCamp = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - s.t < 8) continue;
    g._osakaCamp = null;
    g.order = 'hold'; g.formation = 'line'; g.width = Math.max(3, Math.min(8, g.count)); g.facing = Math.PI; g.keepMoveOrder = false;
    g.anchor = { x: c.x, z: c.z }; g.dest = null; g.stay = true;
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
}
sanadamaru.update = function (rt, dt) {
  campRest(rt);
  anchorWalk(rt);
  gateTidy(rt);
  ramsRest(rt);
  reserveEngage(rt);
  quietSanada(rt);
  followJam(rt);
  survivorsBack(rt, rt.player && rt.player.u && rt.player.u.alive && rt.player.u.pos);
  huntPlayer(rt, dt);
  turnBack(rt, dt);
  return k11_sanadamaru.update.call(this, rt, dt);
};

export { sanadamaru };
