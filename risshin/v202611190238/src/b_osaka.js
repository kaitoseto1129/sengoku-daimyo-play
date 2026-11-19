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
  // 11/19 02:40 クラウド持ち主 POSLOG：十秒後に大助の脇から出ると、本人の八歩内に来るのは351秒（退く下知の二十秒前）だった。
  //   四秒で出し、本人へまっすぐ向ける（手前の前田の塊と先に斬り結ばない。兵は足さない・強さは0.4のまま）
  rt.after(4, () => {
    const F = rt.flags;
    if (F.step !== 5 || F.ending || F.osakaSpear) return;
    const lead = (rt.army.groups || []).find((g) => g.team === 1 && g.count && g.name === '真田大助の隊');
    const u = lead && lead.units.find((x) => x.alive);
    const at = u ? { x: u.pos.x + 6, z: u.pos.z - 4 } : { x: 40, z: 4 };
    const lk = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
    const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '丸の内から出た真田の槍', anchor: at, facing: 0, width: 8, aggro: 14, order: 'attack', seekRange: 130, noRout: true },
      [{ type: 'samurai', n: 2, o: lk }, { type: 'ashigaru', n: 12, o: lk }]);
    g.dmgMult = 0.4; g.sortie = true; F.osakaSpear = g;
    const P = rt.player && rt.player.u;
    if (P && P.alive) { g.focus = P; g.focusMeFirst = true; g.focusMeRange = 14; }
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
// ⑦ 竹束の陣で退く者を受け止める前田の備（徳川編の withdraw が印の六歩北 (6,86) に横一列で立てる）は、印 (6,92) と南の竹束の列（z98）の間を
//   北から塞いだ（11/18 15:19 act bot：575秒から百八十秒、印へ十一歩より近づけず任務の札が残った）。備は印の東脇へずらし、北からの退き道を空ける
sanadamaru.withdraw = function (rt) {
  const had = rt.flags.campGuard;
  k11_sanadamaru.withdraw.call(this, rt);
  const g = rt.flags.campGuard;
  if (!g || g === had || !g.anchor) return;
  const dx = 16, dz = -2;
  g.anchor = { x: g.anchor.x + dx, z: g.anchor.z + dz };
  for (const u of g.units) { u.pos.x += dx; u.pos.z += dz; u.moveTo = null; u.aiT = 0; }
};
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
// ⑥ 篠山の北の麓へ退く段は、本人が麓の印に届かないと徳川編の百五十秒の締めまで札が残った（11/18 17:27 act bot：372→537秒の百六十五秒、
//   戦が六百八十九秒で七分を大きく越えた）。退く下知から六十秒たてば（17:41 POSLOG：bot は麓の印でなく打って出の敵と斬り合い続ける）、麓に着かなくても次（竹束の陣への撤収）へ進める
sanadamaru.minEl = function (st, sec, label, radius) {
  const r = k11_sanadamaru.minEl.call(this, st, label === '竹束の陣' ? Math.min(sec, 40) : sec, label, radius);
  if (label !== '篠山の北の麓') return r;
  const tick = r.tick;
  r.tick = (rt, C, m, ctx, el, dt) => tick(rt, C, m, ctx, el, dt) || el >= 60;
  return r;
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
    // 11/19 06:25 クラウド持ち主 act bot：退かせた前田の新手の二人が西の (-77,-12) で兵の歩き先の無い move のまま二十秒（371秒・型=行き先無し）。
    //   anchorWalk が動けない組をその場の控えにしても、ここが四秒ごとに竹束の陣への move に言い直して止まりに戻した。控えにした組は言い直さない
    if (g._osakaStay) { if (g.order === 'hold') continue; g._osakaStay = false; }
    // 11/18 04:35 描かずの流し：竹束の陣に着いた残り（山崎長徳の組の三人）が、元の人数の縦の列の持ち場 (-38,107) に立ったまま
    //   move の下知で四十秒余り（行き先 (-38,92)）。着いた残りは竹束の陰で丸の方（北）へ向いて休ませる（hold）
    if (g.order === 'move' && g.dest && g.dest.z === 92) {
      const c = g.center();
      // 11/18 15:19 act bot：前田の新手の二人が竹束の陣の手前 (-22,83) で 376〜481秒 move のまま止まった（z>85 に届かず休みに入れない）。九歩手前から休ませる
      if (c.z > 78 && Math.hypot(c.x - g.dest.x, c.z - 92) < 18) {
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
    // 11/18 15:35 act bot：⑥で前田の後の手（寄せた後の手＝jam）の一人が (18,31) で attack のまま八十秒立った。後の手を外すのは⑤まで
    if (squads.includes(g) || (F.step <= 5 && (F.jam || []).includes(g)) || (F.rams || []).includes(g) || /本陣|旗本/.test(g.name || '')) continue;
    if (g.order !== 'hold' && g.order !== 'attack') continue;
    const c = g.center();
    // 11/18 14:24 act bot：⑥で前田の新手の一人が (15,66) に hold のまま二十秒（丸から遠い z>60 は拾わなかった）。⑥⑦は遠くの残りも退かせる
    if (Math.hypot(c.x - P.x, c.z - P.z) > 60 || (c.z > 60 && F.step < 6)) continue;
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
//   11/18 15:55 クラウド持ち主：act bot 六回のうち二回 討ち取り5・9で『退屈』。⑤は三十四歩まで拾う
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
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < (F.step === 5 ? 34 : 20) && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur.focusMeFirst = false; cur.focusMeRange = undefined;
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  // 11/18 19:30 クラウド持ち主 act bot 二回：受けた傷は鉄砲だけで刃0（⑤で向けた真田大助の隊は本人の十七〜二十四歩で前田の塊と斬り結び、
  //   三十秒余り本人に一太刀も来ない）。向けた組のうち本人の十歩内の兵は、手前の味方より本人へ打ち込む（田野・道明寺の focusMeFirst の形）
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; g.focusMeFirst = true; g.focusMeRange = 10; F._hunter = g; return; }
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
    // 11/18 22:46 act bot：⑤の後（321秒）に柵を破る組の一人が行き先の無い move のまま (12,46) で二十秒立った（型=行き先無し）→ その場の控えにする
    if (g && g.count && !g.routed && g.order === 'move' && !g.dest) {
      const c = g.center();
      g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.aggro = Math.max(g.aggro || 0, 12);
      for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
      continue;
    }
    if (!g || !g.count || g.routed || g.order !== 'move' || !g.dest) continue;
    const c = g.center(), far = Math.hypot(c.x - g.dest.x, c.z - g.dest.z);
    // 11/18 09:25 act bot：篠山の北の斜面 (19,47) で十一人の横の列が麓の控えの八歩の外に掛かり、要は動くのに兵は二十秒立った。麓の控えは十二歩で着いた内に
    // 11/18 09:43・09:46 act bot：五人・三人の組が西の退き先の手前 (-64,1)(-58,1) で move のまま二十秒立った（柵を打つ段の後）。
    //   八秒動けない組は、そこを控えの場として北へ向いて待たせる（丸の外の柵より遠い所だけ）
    if (far > (g.dest.x === 18 && g.dest.z === 42 ? 12 : 3)) {
      const s = g._osakaRamWait;
      if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaRamWait = { x: c.x, z: c.z, t: rt.t }; continue; }
      if (rt.t - s.t < 8) continue;
      // 11/19 01:27 クラウド持ち主 act bot：柵を打つ段の後、柵を破る組の四人が西の柵の際 (-42,-4) で横の列のまま塀に塞がれて二十秒立った
      //   （丸の外の柵より内は控えにしない決まりで、八秒動けなくても退き先へ歩けなかった）。柵の際で動けない組は、丸の中心から外向きに
      //   六十四歩の所へ縦の列で一歩出す（着けば上の決まりで控えになる）
      const r0 = Math.hypot(c.x, c.z + 40);
      if (r0 < 56) {
        if (r0 > 40 && !g._osakaOut) {
          const d = { x: c.x * 64 / r0, z: -40 + (c.z + 40) * 64 / r0 };
          g._osakaOut = true; g._osakaRamWait = null; g.formation = 'column'; g.noRing = true;
          g.dest = d; g.anchor = { x: c.x, z: c.z };
          for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
        }
        continue;
      }
    }
    g._osakaRamWait = null;
    // 11/18 16:20 act bot：⑥（391秒）で控えに替えた柵を破る組の四人が (-17,47) で真田の打って出を前に hold のまま二十秒（退く時の aggro 3 のまま）。
    //   控えは寄って来た敵には槍を合わせる（持ち場は離れない）
    g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.aggro = Math.max(g.aggro || 0, 12);
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
}
// 11/18 03:17〜03:33 act bot 五回：控えに置いた前田の新手（槍二十人）が、二十歩の内に真田の兵を見ながら槍を揃えて hold のまま立った
//   （176秒 (-73,-24)・206秒 (-32,21)・346秒 (-31,24)・376秒 (-35,24)）。③④⑤の間、塀を挟まず丸の外（中心から四十四歩より外）の敵が
//   十八歩の内に来た控えは、控えの放ち（depth_reserve.js の release と同じ形）で打ちかからせる。兵は足さない
function reserveEngage(rt) {
  const F = rt.flags;
  if (F.ending) return;
  if (F._resEngT != null && rt.t - F._resEngT < 2) return;
  F._resEngT = rt.t;
  // 11/18 19:45 クラウド持ち主 act bot：⑤の間に二の線へ戻し始めた前田の新手（十一人・三人）が、⑥⑦に入ってから行き先 (2,24) に着いても
  //   着いた判定（下のループ）が③〜⑤しか回らず、move のまま 451〜486秒 立った。戻しの着きだけは段を問わず見る
  if (!(F.step >= 3 && F.step <= 5)) {
    for (const g of rt.army.groups || []) if (g._osakaRelBack && g.team === 0 && g.count && !g.routed && g.order === 'move') relArrive(g);
    return;
  }
  const ok = (o) => !o.fleeing && !o.downed && Math.hypot(o.pos.x, o.pos.z + 40) > 44;
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || !g.count || g.routed || g.name !== '前田の新手' || g.order !== 'hold' || !g.stay) continue;
    const c = g.center();
    const e = rt.army.nearestEnemy({ pos: c, team: 0 }, 24, ok);   // 11/18 14:34 act bot：311秒 (-32,21) で二十歩余りの敵を前に二十秒 hold。十八歩→二十四歩
    if (!e || rt.army.wallBetween(c, 0, e.pos)) {
      // 11/19 05:22 クラウド持ち主 act bot：306〜326秒 前田の新手（十七人）が (-37,18) で柵・塀越しの二十五歩内の敵を前に二十秒 hold のまま。
      //   越えて斬り掛かれない相手の前で控えが突っ立つのでなく、八秒で十四歩下がって竹束の陣の側で控え直す（新しく兵は足さない）
      const w = e || rt.army.nearestEnemy({ pos: c, team: 0 }, 25, (o) => !o.fleeing && !o.downed && !o.noTarget);
      if (!w) { g._osakaWallT = 0; continue; }
      g._osakaWallT = (g._osakaWallT || 0) + 2;
      if (g._osakaWallT < 8) continue;
      g._osakaWallT = 0;
      const dx = c.x - w.pos.x, dz = c.z - w.pos.z, L = Math.hypot(dx, dz) || 1;
      const d = { x: Math.max(-70, Math.min(70, c.x + dx / L * 14)), z: Math.max(c.z + 6, Math.min(95, c.z + dz / L * 14)) };
      g.order = 'move'; g.dest = d; g.anchor = { x: c.x, z: c.z }; g.keepMoveOrder = true; g.formation = 'column'; g.noRing = true; g.focus = null; g.stay = false;
      g._osakaRel = true; g._osakaRelBack = true;
      for (const u of g.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
      continue;
    }
    g.stay = false; g.fire = true; g.aggro = 14; g.seekRange = 30; g.order = 'attack'; g.dest = null; g.focus = null; g._osakaRel = true;
  }
  // 11/18 17:19 act bot：放った前田の新手（二十一人）が、相手の真田の兵が塀の内へ引いた後 (-33,19) で狙いの無いまま attack で二十秒立った
  //   （丸の中心から六十七歩＝徳川編の柵の際の詰まり直しの外）。六秒だれも打ち合わなければ、本人の十二歩後ろの二の線へ戻して控えに返す
  const P = rt.player && rt.player.u && rt.player.u.alive && rt.player.u.pos;
  // 11/18 18:21 act bot：共通の控えの放ち（depth_reserve.js の release）で放たれた前田の新手は _osakaRel が無く、この戻しに掛からずに
  //   181秒 (-74,-25)・306秒 (-32,20) で狙い無しの attack のまま二十秒立った。名で拾って同じに戻す
  for (const g of rt.army.groups || []) {
    // 11/19 01:41 クラウド持ち主 act bot：211秒 前田の新手（二十一人）が (-33,19) で attack のまま狙い無しで二十秒立った（着いて待つ）。
    //   控えの放ちの後も持ち場の印（stay）が残った組はこの拾いから漏れていた。attack の前田の新手は stay に係わらず拾う
    if (g.team === 0 && g.name === '前田の新手' && g.order === 'attack' && !g._osakaRel) g._osakaRel = true;
    if (!g._osakaRel || g.team !== 0 || !g.count || g.routed) continue;
    if (g.order === 'move' && g._osakaRelBack) { relArrive(g); continue; }
    if (g.order !== 'attack') { g._osakaRelIdle = 0; continue; }
    // 11/18 18:25 act bot：狙いは持つが塀の内の相手で届かず、組の真ん中が動かないまま二十秒（201秒 (-66,-20)・(-74,-25)）。
    //   狙いが無ければ六秒、狙いがあっても斬り合わず二秒に一歩も動かなければ十秒で戻す
    const gc = g.center(), lc = g._osakaRelC, still = lc && Math.hypot(gc.x - lc.x, gc.z - lc.z) < 1;
    g._osakaRelC = { x: gc.x, z: gc.z };
    // 11/19 06:44 クラウド持ち主 act bot：201秒 前田の新手（二十一人）が (-33,17) で歩き先を持つのに二十秒動かず（型=敵が遠く歩けず）。
    //   二秒ごとに一歩ほど揺れるので「動かない」に数えられず戻しから漏れた。最初の居所から三歩と離れずに十二秒、だれも打ち合わなければ戻す
    const rf = g._osakaRelRef;
    if (!rf || Math.hypot(gc.x - rf.x, gc.z - rf.z) > 3 || g.units.some((u) => u.alive && u.atk)) g._osakaRelRef = { x: gc.x, z: gc.z, t: rt.t };
    const stuck12 = rf && rt.t - rf.t >= 12 && g._osakaRelRef === rf;
    if (!stuck12 && (g.units.some((u) => u.alive && u.atk) || (g.units.some((u) => u.alive && (u.target || u.swing)) && !still))) { g._osakaRelIdle = 0; continue; }
    if (stuck12) { g._osakaRelIdle = 6; g._osakaRelRef = null; }
    g._osakaRelIdle = (g._osakaRelIdle || 0) + (g.units.some((u) => u.alive && u.target) ? 1.2 : 2);
    if (g._osakaRelIdle < 6 || !P) continue;
    g._osakaRelIdle = 0; g._osakaRelBack = true;
    const c = g.center(), d = { x: Math.max(-70, Math.min(70, P.x)), z: Math.max(P.z + 12, 10) };
    g.order = 'move'; g.dest = d; g.anchor = { x: c.x, z: c.z }; g.keepMoveOrder = true; g.formation = 'column'; g.noRing = true; g.focus = null; g.stay = false;
    for (const u of g.units) { u.target = null; u.moveTo = null; u.aiT = 0; }
  }
}
// 二の線へ戻す前田の新手が行き先に着いたら控え（hold）に返す
function relArrive(g) {
  if (!g.dest) return;
  const c = g.center();
  // 11/18 17:28 act bot：要が行き先に着いた後、縦の列の二十一人が (-53,12) で move のまま立った（中心は六歩の外）。要が着いて十二歩内なら着いたとする
  const ah = g.anchor && Math.hypot(g.anchor.x - g.dest.x, g.anchor.z - g.dest.z) < 1;
  if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) < (ah ? 12 : 6)) { g._osakaRelBack = false; g._osakaRel = false; g.order = 'hold'; g.stay = true; g.formation = 'yari'; g.facing = Math.PI; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.keepMoveOrder = false; g.aggro = 3; }
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
    // 11/19 07:21 クラウド持ち主 act bot（501秒）：伊木遠雄の隊の九人が持ち場の七歩先 (-25,-19) で一点に重なり hold のまま立った（十歩の内なので数えなかった）。
    //   打ち合っていない兵は持ち場の三歩より外で重なって六秒動かなければ片付ける（本人が十歩内に居る間は斬り合いの塊なので残す）
    const pp = rt.player && rt.player.u && rt.player.u.pos;
    for (const u of [...g.units]) {
      if (!u.alive || u.gone || u.type === 'busho' || u === g.leader || u.target || u.atk || (pp && Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z) < 10) || Math.hypot(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z) < 3) { u._osakaPile = null; continue; }
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
  // 11/19 01:16 クラウド持ち主 chu bot：⑥⑦の間、寄せた後の手の残り二人ずつ（本多の後の手 (3,20)・前田の後の手 (-11,34)・富田の組 (1,39)）が
  //   行き先の無い move のまま 431〜476秒 立った（型=行き先無し）。行き先の無い move の組は、その場で北へ向く控え（寄る敵には槍を合わせる）にする
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || !g.count || g.routed || g.isPlayerSquad || g.order !== 'move' || g.dest) continue;
    const c = g.center();
    g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.aggro = Math.max(g.aggro || 0, 12);
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
  // 11/19 06:32・06:34 クラウド持ち主 act bot：柵を破る組の一人が (7,36)(8,35) で、要は歩く（0.27〜0.38）のに兵は歩き先も狙いも持たない move のまま
  //   二十秒（356秒・321秒・型=行き先無し）。下の「要を戻す」は兵が少し揺れると数え直して届かなかった。兵のだれも歩き先と狙いを持たない move の組が
  //   十秒で二歩と動かなければ、その場で北へ向く控えにする（退く組は survivorsBack が言い直さない印 _osakaStay を付ける）
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || !g.count || g.routed || g.isPlayerSquad || g.order !== 'move' || g._arcWalk || g.units.some((u) => u.alive && (u.moveTo || u.target || u.atk))) { if (g) g._osakaNoMt = null; continue; }
    const c = g.center(), m = g._osakaNoMt;
    if (!m || Math.hypot(c.x - m.x, c.z - m.z) > 2) { g._osakaNoMt = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - m.t < 10) continue;
    g._osakaNoMt = null; g._osakaStay = true; g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.aggro = Math.max(g.aggro || 0, 12);
    for (const u of g.units) u.aiT = 0;
  }
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
    // 11/19 01:55 クラウド持ち主 chu bot：④（526〜552秒）本多の後の手の二人が行き先の十歩内 (1,17) で、兵の歩き先が無いまま move で立った。
    //   十歩内で八秒動かず、だれも歩き先を持たない組は、着いた物としてその場で北へ向く控えにする
    if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) < 10) {
      if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaLag = { x: c.x, z: c.z, t: rt.t }; continue; }
      if (rt.t - s.t < 8 || g.units.some((u) => u.alive && u.moveTo)) continue;
      g._osakaLag = null; g._osakaStay = true; g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.aggro = Math.max(g.aggro || 0, 12);
      for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
      continue;
    }
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaLag = { x: c.x, z: c.z, t: rt.t, n: s && Math.hypot(c.x - s.x, c.z - s.z) < 4 ? s.n || 0 : 0 }; continue; }
    if (rt.t - s.t < 6) continue;
    // 11/19 06:20 クラウド持ち主 act bot：⑥（446秒）山崎長徳の組の八人が篠山の北の麓 (-2,33) で、兵は歩き先を持つのに歩けず
    //   要を戻しても二十秒動かなかった（型=敵が遠く歩けず）。要を二度戻しても四歩と動けない組は、その場で北へ向く控えにする
    if ((s.n || 0) >= 1) {
      g._osakaLag = null; g._osakaStay = true; g.order = 'hold'; g.formation = 'line'; g.width = 6; g.facing = Math.PI; g.keepMoveOrder = false; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.aggro = Math.max(g.aggro || 0, 12);
      for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
      continue;
    }
    g._osakaLag = { x: c.x, z: c.z, t: rt.t, n: (s.n || 0) + 1 }; g.anchor = { x: c.x, z: c.z }; g.formation = 'column'; g.noRing = true;
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
    // 11/18 17:19 act bot：⑥（356秒）で退く前田の新手の残り二人が竹束の陣の手前 (26,64) で move のまま二十秒（要の速さ0）。
    //   三人までの残りは、陣の手前（z50 より南）でも八秒動けなければ、そこで丸の方へ向いて休ませる
    const few = g.count <= 3 && c.z > 50;
    if (!few && (c.z < 85 || g.dest.z < 85)) { g._osakaCamp = null; continue; }
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._osakaCamp = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - s.t < 8) continue;
    g._osakaCamp = null;
    g.order = 'hold'; g.formation = 'line'; g.width = Math.max(3, Math.min(8, g.count)); g.facing = Math.PI; g.keepMoveOrder = false;
    g.anchor = { x: c.x, z: c.z }; g.dest = null; g.stay = true;
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
}
// 11/18 09:58・14:24 act bot：西の (-70,46) で名の無い守り（備の大将を囲む円陣）が四人に減っても円陣のまま attack で二十秒立った。
//   四人では大将を囲めない。円陣の組が四人以下になれば円陣をやめさせ（ai.js の noRing）、持ち場から打って出る形に返す
function smallRing(rt) {
  const F = rt.flags;
  if (F._smallRingT != null && rt.t - F._smallRingT < 2) return;
  F._smallRingT = rt.t;
  for (const g of rt.army.groups || []) {
    if (g.team !== 0 || g.formation !== 'ring' || !g.count || g.count > 4 || g.isPlayerSquad) continue;
    // noRing だけでは円陣が解けなかった（11/18 14:37・14:40 act bot：(-70,46) の四人が円陣のまま）。形も槍の横の列へ替える
    g.noRing = true; g.formation = 'yari';
    for (const u of g.units) { u.moveTo = null; u.aiT = 0; }
  }
}
// 11/18 20:30 クラウド持ち主 act bot 3回：討ち取り7・16・19でも本人へ振られた刃は0〜2（刃の行方 {}）。本人の四歩内に来た真田の槍が、
//   六〜十二歩先の前田の兵を狙ったまま本人の脇を素通りしていた（寄った訳「的味6〜12 attack」）。三歩半内で本人より遠い味方を狙う兵は、
//   二人まで本人へ向き直る（本人の命が五割半を割ったら向けない・塀越しは向けない。四割では 20:44 の一回で⑤に西の口の予備に囲まれて倒れた）
function closeSwing(rt, dt) {
  const F = rt.flags;
  if ((F._csT = (F._csT || 0) - dt) > 0) return;
  F._csT = 0.5;
  const P = rt.player && rt.player.u, A = rt.army;
  if (!P || !P.alive || F.ending || F.step < 2 || F.step > 5 || P.hp < P.maxHp * 0.55) return;
  let n = 0;
  const cand = [];
  for (const u of A.units) {
    if (!u.alive || u.team !== 1 || u.isStruct || u.fleeing || u.woundOut || u.downed) continue;
    const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
    if (u.target === P) { n++; continue; }
    if (!u.sidearm && (u.type === 'gun' || u.type === 'bow')) continue;
    const g = u.group;
    if (!g || g.routed || g.stay || (g.order !== 'attack' && g.order !== 'hold')) continue;
    const d = Math.hypot(dx, dz), t = u.target;
    if (d > 3.5 || !t || t.isStruct || t.isPlayer || Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < d + 1.5) continue;
    if (A.wallBetween(u.pos, u.team, P.pos)) continue;
    cand.push(u);
  }
  for (const u of cand) { if (n >= 2) break; u.target = P; u.watch = null; u.aiT = 1.2; n++; }
}
// ⑤の後半（打って出を受ける・持ちこたえろ）の持ち場を東の口の方へ八歩・南へ二歩寄せる（11/18 21:40 クラウド持ち主 POSLOG：
//   (8,20) では打って出の敵が前田の先手に先に当たり、本人の十二歩内に来るのは退く下知の十〜二十秒前だけ。⑤の本人の討ち取り0〜3）
// ⑤の始めに東の口から出た真田の兵（十五人）が、二十秒ほどで一斉に逃げ散っていた（11/18 20:53 持ち主の残り・出所未特定）
//   → 出所は柵を破る段の終わり（b_depth の hold の end の routAll）。柵が倒れると、まだ斬り合う最中の打って出の兵の士気を0にしていた。
//   ⑤の正面の柵だけは、生きた組を罠の段（持ちこたえろ）へ引き継ぐ（逃げさせず、段の終わりに左右の口へ引く。兵は足さない）
sanadamaru.breakStep = function (h, T, clamp) {
  const r = k11_sanadamaru.breakStep.call(this, h, T, clamp);
  const end = r.end;
  r.end = function (rt, C, m) {
    const F = rt.flags;
    if (T === F.target && C.groups) {
      F.carryFoes = C.groups.filter((g) => g && g.count > 0 && !g.routed && !g.spent);
      C.groups = C.groups.filter((g) => !F.carryFoes.includes(g));
    }
    return end.call(this, rt, C, m);
  };
  return r;
};
sanadamaru.holdStep = function (h, dur) {
  { const st0 = h.start;
    h.start = function (rt, C, m, ctx) {
      const r = st0.call(this, rt, C, m, ctx);
      const F = rt.flags, keep = (F.carryFoes || []).filter((g) => g.count > 0 && !g.routed);
      F.carryFoes = null;
      if (keep.length) {
        C.groups = (C.groups || []).concat(keep);
        for (const g of keep) { g.noRout = true; g.morale = Math.max(g.morale || 0, 60); rt.after(14, () => { g.noRout = false; }); }
      }
      return r;
    };
  }
  if (dur === 50 && h.kind === 'hold') {
    const st = h.start;
    h.start = function (rt, C, m, ctx) {
      const r = st.call(this, rt, C, m, ctx);
      const at = { x: 16, z: 22 };
      C.at = at; C.goal = at;
      rt.marker('dp', at, '持ち場', { h: 3 });
      rt.zone('dp', at.x, at.z, C.botRadius || 14);
      return r;
    };
  }
  return k11_sanadamaru.holdStep.call(this, h, dur);
};
// 11/19 05:30 クラウド持ち主 act bot（十回に一回の1080秒の失敗）：⑦で本人が柵と塀の間の堀の帯に残り、破れ口へ向くピン「破れた柵」(0,3) の
//   十三歩東 (13,4) で駆け足のまま二百秒動けなかった（834〜1028秒）。破れ口へ寄れずに十五秒その場なら、本人の脇の柵の一間を
//   味方が引き倒して出口にする（退く兵が柵を倒して逃げ道を開ける。ピンはその一間へ向く＝徳川編の outStep が F.extraGaps を拾う）
function outUnstick(rt, dt) {
  const F = rt.flags, P = rt.player && rt.player.u;
  if (!(F.step >= 6) || F.ending || !F.outWay || !P || !P.alive) { F._osStk = 0; F._osStkP = null; return; }
  if ((F._osStkT = (F._osStkT || 0) + dt) < 3) return;
  F._osStkT = 0;
  const p = P.pos, lp = F._osStkP;
  F._osStkP = { x: p.x, z: p.z };
  F._osStk = lp && Math.hypot(p.x - lp.x, p.z - lp.z) < 2 ? (F._osStk || 0) + 3 : 0;
  if (F._osStk < 15) return;
  F._osStk = 0;
  let T = null, bd = 8;
  for (const s of F.fence || []) {
    if (!s.alive || !s.seg) continue;
    const d = Math.hypot((s.seg[0] + s.seg[2]) / 2 - p.x, (s.seg[1] + s.seg[3]) / 2 - p.z);
    if (d < bd) { bd = d; T = s; }
  }
  if (!T) return;
  T.hp = 0; T.alive = false; rt.army.structFall(T);
  (F.extraGaps || (F.extraGaps = [])).push(Math.atan2((T.seg[0] + T.seg[2]) / 2, (T.seg[1] + T.seg[3]) / 2 + 40));
  rt.say('山崎長徳', '柵を引き倒したぞ！　ここから出よ！', 2.6);
}
sanadamaru.update = function (rt, dt) {
  outUnstick(rt, dt);
  smallRing(rt);
  campRest(rt);
  anchorWalk(rt);
  gateTidy(rt);
  ramsRest(rt);
  reserveEngage(rt);
  quietSanada(rt);
  followJam(rt);
  survivorsBack(rt, rt.player && rt.player.u && rt.player.u.alive && rt.player.u.pos);
  huntPlayer(rt, dt);
  closeSwing(rt, dt);
  turnBack(rt, dt);
  return k11_sanadamaru.update.call(this, rt, dt);
};

export { sanadamaru };
