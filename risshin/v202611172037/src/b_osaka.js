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
    if (!g || !g.count || !g.dest || g.order !== 'move') continue;
    const c = g.center();
    if (Math.hypot(c.x - P.x, c.z - P.z) > 22) { jamBehind(rt); return; }
  }
  // 寄せ先に着いて、打って出の敵が十五歩の内にいる組は、立ったままにせず斬り合いに入る（11/18 act bot：416秒 富田の組が (11,25) で move のまま止まった）
  const foes = (rt.army.groups || []).filter((q) => q.team === 1 && q.count > 0 && q.sortie);
  for (const g of F.jam || []) {
    if (!g || !g.count || g.order !== 'move' || !g.dest) continue;
    const c = g.center();
    if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) > 5) continue;
    if (!foes.some((q) => { const e = q.center(); return Math.hypot(e.x - c.x, e.z - c.z) < 15; })) continue;
    g.order = 'attack'; g.keepMoveOrder = false; g.aggro = 15;
  }
}
// 11/18 クラウド持ち主 act bot 三回：討ち取り11・11・6、受けた傷は鉄砲だけで槍・刀は0（「7分で6人。斬り合う相手が少なくて退屈」）。
//   ③の押し返してくる槍と⑤の打って出の間だけ、本人から二十歩内で塀を挟まない敵の槍の組を一つ本人へ向ける（木津川口の huntPlayer の形）。
//   敵の数・強さは変えない。本人の命が七割を切ったら、塀を挟んだら、組が崩れたら放す
function huntPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player && rt.player.u;
  const on = P && P.alive && !F.ending && (F.step === 3 || F.step === 5) && P.hp >= P.maxHp * 0.7;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack' || g.stay) return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; F._hunter = g; return; }
}
sanadamaru.update = function (rt, dt) {
  quietSanada(rt);
  followJam(rt);
  huntPlayer(rt, dt);
  turnBack(rt, dt);
  return k11_sanadamaru.update.call(this, rt, dt);
};

export { sanadamaru };
