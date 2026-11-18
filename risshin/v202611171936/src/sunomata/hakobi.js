// ======================================================================
// 墨俣 0〜2分半：材木の運搬の護衛（藤吉郎の段取り）
//   永禄九年九月。墨俣は長良川と犀川の間の中洲。木下藤吉郎は川並衆（蜂須賀小六ら）に上流で材木を組ませ、筏と舟で流し下らせた（伝承）。
//   『信長公記』は墨俣の守りを固めたとだけ記す。一夜城は後の物語（本体の終わりの言葉と同じ扱い）。
//   主人公は岸の舟着きへ行き、舟から材木を受けた人足を砦まで守って戻る。帰り道に斎藤の物見が荷を狙って寄せる。
//   主人公が舟着きへ行き、人足が砦へ戻り、物見を退けたら普請の段取りへ進む。
// ======================================================================
import { sfx } from '../audio.js';
import { KISHI_ROAD } from '../castles/sunomata.js';

export const ready = (u) => !!u && u.alive && !(u.hp <= 0) && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

// 同じ運び手を追い、倒れた時だけ生きている仲間へ引き継ぐ。
export function protectedWorker(rt) {
  const v = rt.flags.s15;
  if (v?.ph !== 'hakobi' || v.reserveSupply || v.wkHome) return null;
  if (!ready(v.protectedWorker)) v.protectedWorker = rt.flags.wk?.units.find(ready) || null;
  return v.protectedWorker;
}
function markWorker(rt) {
  rt.marker('s15dock', () => protectedWorker(rt)?.pos || dest(rt), '川岸から砦へ運ぶ人', {
    guidePerson: () => protectedWorker(rt), guidePersonLabel: 'この人を守れ', guideProtect: true,
  });
}

export function start(rt, def, C, then) {
  const F = rt.flags, v = F.s15;
  if (v.hakobiT) return;
  v.hakobiT = rt.t; v.ph = 'hakobi'; v.then = then;
  v.dock = C.dock;
  markWorker(rt);
  const live = () => !rt.over && !F.ending && v.ph === 'hakobi';
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (live()) rt.say(who, s, d); });
  // 11/10 紙（sunomata_spec_1109）の一番目：何もない河原で「ここに城を築く。」、見回しても何もない
  say(.5, '木下藤吉郎', 'ここに城を築く。', 2.4);
  say(3, '足軽', '……ここに？', 1.8);
  say(5.2, '木下藤吉郎', '材木は上の川で組ませ、舟で流して来させた。岸の舟着きで受け取り、柵まで担ぐのじゃ', 4);
  say(9.6, '蜂須賀正勝', '川並衆の舟が着くぞ。荷を下ろす間、岸を見張ってくれ', 3.4);
  // 人足の半分が舟着きへ向かう（本物の人足が歩く）
  rt.after(2, () => {
    if (!live() || !F.wk) return;
    F.wk.order = 'path'; F.wk.pathIdx = 0; F.wk.speed = 2;
    // 東の柵へ直進せず、南門から岸の道へ出る。道の終端は荷を受ける場所に合わせる。
    F.wk.path = [[0, C.FORT - 5], ...KISHI_ROAD.slice(0, -1), [v.dock.x * 0.85, v.dock.z * 0.85]];
    F.wk.onArrive = (g) => { g.order = 'hold'; v.wkAtDock = rt.t; };
  });
  say(15, '人足', '材木は重いぞ……一本ずつ担いでゆくしかない', 3);
}

export function dest(rt) {
  const v = rt.flags.s15;
  // 組に退却の下知が出た時点で護衛へ戻す。兵ごとの逃走の印が付くまで追わせない。
  if (!v.reserveSupply && v.raid && !v.raid.routed && v.raid.units.some(ready)) { const P = rt.player.u.pos; let best = null, bd = 1e9; for (const u of v.raid.units) if (ready(u)) { const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2; if (d < bd) { bd = d; best = u; } } return best?.pos; }
  // 荷下ろし中は舟着きを離れず、帰りは砦に着くまで実際の人足に付く。
  // 人足が全員倒れても、本人の出迎えは省かない。出迎え後は南門へ案内し、帰還後の停滞救済につなぐ。
  if (!v.backT && (!v.atDock || rt.flags.wk?.units.some(ready))) return v.dock;
  const p = v.homeGuide || (v.homeGuide = { x: 0, z: 0 });
  // 隊の中心が砦へ入っても、門外に残る荷を置き去りに案内しない。
  const outside = !v.reserveSupply && !v.wkHome && rt.flags.wk?.units.find((u) => ready(u) &&
    (Math.abs(u.pos.x) >= v.C.FORT - 2 || Math.abs(u.pos.z) >= v.C.FORT - 2));
  const c = outside ? outside.pos : !v.reserveSupply && !v.wkHome && rt.flags.wk?.units.some(ready) ? rt.flags.wk.center() : null;
  p.x = c ? c.x : 0; p.z = c ? c.z : 0;
  return p;
}

function back(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  if (v.backT) return;
  v.backT = rt.t;
  sfx('taiko', 0.6);
  rt.say('木下藤吉郎', v.reserveSupply
    ? '荷が遅れておる。砦の予備材で普請を続ける。南門から戻れ！'
    : '荷は下りた。人足と一緒に砦へ戻れ！', 3);
  if (F.wk) {
    F.wk.order = 'path'; F.wk.pathIdx = 0; F.wk.speed = 1.6;
    F.wk.path = [...KISHI_ROAD.slice(0, -1).reverse(), [0, C.FORT - 5], [-6, -10]];
    // 隊の到着通知は後列の帰還を保証しない。全員の位置は tick で確かめる。
    F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; };
  }
  // 帰り道の脇の葦から、斎藤の物見が荷を狙って寄せる
  rt.after(6, () => {
    if (v.ph !== 'hakobi' || rt.over) return;
    const p = { x: v.dock.x * 0.6 + 14, z: v.dock.z * 0.6 - 10 };
    v.raid = C.enemyGroup(rt, { faction: 'saito', name: '斎藤の物見', anchor: p, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 14, seekRange: 26, dmgMult: 0.35, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]);
    v.raid.order = 'attack'; v.raid.focus = F.wk?.units.find(ready) || null;
    rt.army.play?.('eshout', p, 1.2);
    rt.say('足軽', '葦の中から斎藤の物見じゃ！　人足の荷を狙うておる！', 3);
    rt.marker('s15raid', () => v.raid?.units.find(ready)?.pos || null, '斎藤の物見', { red: true, group: v.raid });
  });
}

// 11/10 六十秒の見張り（fushin.js）：人足や物見が引っかかっても、運搬の護衛を済ませて次へ進める
export function force(rt) { const v = rt.flags.s15; if (v?.raid && !v.raid.routed) { v.raid.noRout = false; v.raid.morale = 0; v.raid.routed = true; v.raid.order = 'flee'; v.raid.fleeSet = true; v.raid.fleeDir = { x: 0, z: -1 }; } done(rt); }
function done(rt) {
  const F = rt.flags, v = F.s15;
  if (v.hakobiDone) return;
  v.hakobiDone = true; v.ph = null;
  rt.unmark('s15dock'); rt.unmark('s15raid');
  if (v.raid) { v.raid.noRout = false; v.raid.morale = 0; }
  if (F.wk) { F.wk.order = 'move'; F.wk.dest = { x: -6, z: -10 }; F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; }; }
  const lost = !F.wk?.units.some(ready);
  const delivered = !lost && F.wk.units.every((u) => !ready(u) ||
    Math.abs(u.pos.x) < v.C.FORT - 2 && Math.abs(u.pos.z) < v.C.FORT - 2);
  // 運ぶのは人足。護衛を済ませた後に、主人公の手運びをもう一度要求しない。
  // 人足を失った場合も、砦に積んだ予備材を柵の兵が引き継ぐ。
  F.woodDelivered = true;
  rt.say(!delivered ? '前野長康' : '人足', lost
    ? '人足を失った。柵の兵は砦の予備材で普請を引き継げ。砦を守るぞ！'
    : !delivered ? '荷が遅れている。柵の兵は砦の予備材で普請を引き継げ。砦を守るぞ！'
    : '材木は砦へ入ったぞ。さあ、柵を結ぶ！', 3);
  if (delivered) rt.award((t) => t.side.push('材木を運ぶ人足を守った'), '材木を運ぶ人足を守った');
  rt.after(3, () => v.then?.());
}

export function tick(rt) {
  const F = rt.flags, v = F.s15;
  if (v.hakobiDone || rt.over || F.ending || !ready(rt.player.u)) return;
  // 倒れた人足や、荷を届けた人足を追い続けて物見が止まらないようにする。
  if (v.raid && !v.raid.routed && v.raid.units.some(ready)) {
    const target = !v.wkHome && F.wk?.units.find(ready);
    v.raid.focus = target || (ready(rt.player.u) ? rt.player.u : null);
  }
  // 11/17 act bot：舟着きへ歩く間や荷下ろしを待つ間、五秒以上なにも起きない。四秒おきに短い声を挟む（K175）
  if ((!v.hakobiT || rt.t - v.hakobiT > 0.5) && rt.t >= (v.nudgeAt || 0)) {
    v.nudgeAt = rt.t + 4.5;
    // 11/17 フ三：名の無い声（足軽・人足）は字幕が出ず bot に届かない。四秒おきの声はすべて名のある者の声にする
    const L = v.backT ? ['蜂須賀正勝', '前野長康', '蜂須賀正勝', '前野長康'] : v.atDock ? ['前野長康', '蜂須賀正勝', '前野長康', '蜂須賀正勝'] : ['前野長康', '蜂須賀正勝', '前野長康', '蜂須賀正勝'];
    const T = v.backT
      ? ['砦はもうすぐじゃ。遅れるな', '荷はもう砦の中だ。柵へ戻れ', '振り返るな、足を運べ', '砦で柵を結ぶぞ。急げ']
      : v.atDock
      ? ['材木が一本、また一本と下りるぞ', '岸の見張りを頼む。葦がざわめく', '荷はもうすぐじゃ。気を抜くな', '舟が揺れる。縄を張れ']
      : ['舟着きはこの先じゃ。急げ', '川の風が冷たいのう。足を止めるな', '荷を担ぐ者が後ろから来るぞ', '岸の道はぬかるむ。足元に気をつけよ'];
    // 戦の中の名の無い声は出ない（字幕なし）ので、右上の一行の進みでも示す（act bot「印に着いて6秒なにも起きない」）
    const near = !v.backT && !v.atDock && Math.hypot(rt.player.u.pos.x - v.dock.x, rt.player.u.pos.z - v.dock.z) < 30;
    const ph = v.backT ? 'back' : v.atDock ? 'dock' : near ? 'near' : 'walk';
    if (v.progPh !== ph && !rt.over) {
      v.progPh = ph;
      { const id = F.sunoTask || 'defend'; const tk = F.sunoTasks?.get(id); const txt = ph === 'walk' ? '人足を守り、舟着きへ荷を取りに行け' : ph === 'near' ? '舟着きはもうすぐ。人足から離れるな' : ph === 'dock' ? '荷下ろしの間、岸を見張れ' : '荷を担ぐ人足を、砦へ守り抜け'; if (tk && !tk.state) tk.progress = txt; rt.objProgress?.(id, txt); }
    }
    const i = (v.nudgeN = (v.nudgeN || 0) + 1) % 4;
    rt.say(L[i], T[i], 2.4);
  }
  const P = rt.player.u.pos;
  if (!v.atDock && Math.hypot(P.x - v.dock.x, P.z - v.dock.z) < 8) {
    v.atDock = rt.t;
    // 荷下ろしから帰還まで同じ印を残し、実際に守る人足と帰路へ追従させる。
    markWorker(rt);
    sfx('taiko', 0.4);
    rt.say('蜂須賀正勝', 'よう来た。荷を下ろすぞ。少し待て', 2.8);
  }
  // 主人公だけ先に着いても、人足の到着と荷下ろしを飛ばさない。
  if (!v.wkAtDock && !v.backT && F.wk?.units.some(ready)) {
    const c = F.wk.center();
    if (Math.hypot(c.x - v.dock.x * 0.85, c.z - v.dock.z * 0.85) < 6) v.wkAtDock = rt.t;
  }
  if (v.atDock && v.wkAtDock && !v.backT) {
    if (v.loadingT == null) v.loadingT = rt.t;
    if (rt.t - v.loadingT >= 12) back(rt);
  }
  // 縦隊が後列待ちで止まったら、残る道を歩き直す。到着や荷下ろしの条件は飛ばさない。
  const wk = F.wk;
  if (wk && (v.backT ? !v.wkHome : !v.wkAtDock) && wk.units.some(ready) && rt.t >= (v.walkCheckAt || 0)) {
    v.walkCheckAt = rt.t + 2;
    const c = wk.center(), last = v.walkStep;
    if (!last || Math.hypot(c.x - last.x, c.z - last.z) > 2) {
      v.walkStep = { x: c.x, z: c.z, t: rt.t };
      v.walkProgressT = rt.t;
    }
    else if (rt.t - last.t >= 24 && wk.order === 'path' && wk.path?.length) {
      // 遅れた人足が南門まで道をたどれるよう、通過済みの曲がり角も消さない。
      wk.formation = 'column'; wk.colW = 1; wk.roadColumn = true; wk._fitAt = 0;
      wk.noAI = false; wk.focus = null;
      for (const u of wk.units) if (ready(u)) u.aiT = 0;
      last.t = rt.t;
    }
  }
  // 歩き直しても六十秒動けなければ、予備材で引き継ぐ。人足の到着・護衛成功は偽らない。
  // 本人の出迎えと南門からの帰還は残し、舟着きや遅れた一人を追い続けさせない。
  if (v.atDock && !v.reserveSupply && !v.wkHome &&
      rt.t - Math.max(v.backT || v.atDock, v.walkProgressT || 0) >= 60) {
    v.reserveSupply = true;
    if (!v.backT) back(rt);
    else rt.say('前野長康', '荷が遅れている。砦の予備材で引き継ぐ。南門から戻れ！', 3);
  }
  // 11/9 bot が始まりで止まった所：物見の残りが柵の外で立ち往生し、荷の護衛が終わらなかった。
  //   人足が戻って四十秒たっても柵の外に残る物見は、荷を諦めて退く（討死にはしない）
  if (v.raid && v.wkHome && rt.t - v.wkHome > 40 && !v.raid.routed && v.raid.units.some(ready) &&
      v.raid.units.every((u) => !ready(u) || Math.max(Math.abs(u.pos.x), Math.abs(u.pos.z)) > v.C.FORT + 1)) {
    v.raid.noRout = false; v.raid.morale = 0; v.raid.routed = true; v.raid.order = 'flee'; v.raid.fleeSet = true; v.raid.fleeDir = { x: 0, z: -1 };
    rt.say('足軽', '物見は荷を諦めて退いてゆくぞ', 2.6);
  }
  const raidGone = v.raid && (v.raid.routed || !v.raid.units.some(ready));
  // 人足が砦の内へ戻った（着いた知らせが押し合いで来ない時も、砦の内に入れば戻ったとみなす。11/9 bot が止まった）
  // 帰路の停滞は上の歩き直しと fushin.js の救済で扱う。時間だけで門外の荷を到着済みにしない。
  if (v.backT && !v.wkHome && F.wk?.units.some(ready)) {
    const live = F.wk.units.filter(ready);
    const inside = live.filter((u) => Math.abs(u.pos.x) < v.C.FORT - 2 && Math.abs(u.pos.z) < v.C.FORT - 2).length;
    if (inside === live.length) v.wkHome = rt.t;
  }
  if (v.atDock && v.wkHome && raidGone && rt.t - v.backT > 25 &&
      Math.abs(P.x) < v.C.FORT && Math.abs(P.z) < v.C.FORT) done(rt);
  // 11/16 iMac n-nagashino K338：予備材で引き継ぐと決めた後も、人足が戻らないと done が来ず、本人が砦へ戻っても
  //   三分近く「北の口で、人足の普請を守れ」のまま止まった（描かずの試し 362秒→539秒・act bot は始めの段だけで503秒）。
  //   予備材に切り替えた後は、本人が砦の内へ入れば次の普請へ進む
  else if (v.reserveSupply && Math.abs(P.x) < v.C.FORT && Math.abs(P.z) < v.C.FORT) done(rt);
}
