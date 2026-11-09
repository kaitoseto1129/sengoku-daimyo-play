// ======================================================================
// 墨俣 0〜2分半：材木の運搬の護衛（藤吉郎の段取り）
//   永禄九年九月。墨俣は長良川と犀川の間の中洲。木下藤吉郎は川並衆（蜂須賀小六ら）に上流で材木を組ませ、筏と舟で流し下らせた（伝承）。
//   『信長公記』は墨俣の守りを固めたとだけ記す。一夜城は後の物語（本体の終わりの言葉と同じ扱い）。
//   主人公は岸の舟着きへ行き、舟から材木を受けた人足を砦まで守って戻る。帰り道に斎藤の物見が荷を狙って寄せる。
//   主人公が舟着きへ行き、人足が砦へ戻り、物見を退けたら普請の段取りへ進む。
// ======================================================================
import { sfx } from '../audio.js';
import { KISHI_ROAD } from '../castles/sunomata.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

export function start(rt, def, C, then) {
  const F = rt.flags, v = F.s15;
  if (v.hakobiT) return;
  v.hakobiT = rt.t; v.ph = 'hakobi'; v.then = then;
  v.dock = C.dock;
  rt.marker('s15dock', v.dock, '岸の舟着き');
  const live = () => !rt.over && !F.ending && v.ph === 'hakobi';
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (live()) rt.say(who, s, d); });
  say(1, '木下藤吉郎', '材木は上の川で組ませ、舟で流して来させた。岸の舟着きで受け取り、柵まで担ぐのじゃ', 4);
  say(6, '蜂須賀正勝', '川並衆の舟が着くぞ。荷を下ろす間、岸を見張ってくれ', 3.4);
  // 人足の半分が舟着きへ向かう（本物の人足が歩く）
  rt.after(2, () => {
    if (!live() || !F.wk) return;
    F.wk.order = 'path'; F.wk.pathIdx = 0; F.wk.speed = 2;
    // 東の柵へ直進せず、南門から岸の道へ出る。道の終端は荷を受ける場所に合わせる。
    F.wk.path = [[0, C.FORT - 5], ...KISHI_ROAD.slice(0, -1), [v.dock.x * 0.85, v.dock.z * 0.85]];
    F.wk.onArrive = (g) => { g.order = 'hold'; v.wkAtDock = rt.t; };
  });
  say(14, '人足', '材木は重いぞ……一本ずつ担いでゆくしかない', 3);
}

export function dest(rt) {
  const v = rt.flags.s15;
  if (v.raid && v.raid.units.some(ready)) { const P = rt.player.u.pos; let best = null, bd = 1e9; for (const u of v.raid.units) if (ready(u)) { const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2; if (d < bd) { bd = d; best = u; } } return best?.pos; }
  return v.atDock ? { x: 0, z: 0 } : v.dock;
}

function back(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  if (v.backT) return;
  v.backT = rt.t;
  sfx('taiko', 0.6);
  rt.say('木下藤吉郎', '荷は下りた。人足と一緒に砦へ戻れ！', 3);
  if (F.wk) {
    F.wk.order = 'path'; F.wk.pathIdx = 0; F.wk.speed = 1.6;
    F.wk.path = [...KISHI_ROAD.slice(0, -1).reverse(), [0, C.FORT - 5], [-6, -10]];
    F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; v.wkHome = rt.t; };
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

function done(rt) {
  const F = rt.flags, v = F.s15;
  if (v.hakobiDone) return;
  v.hakobiDone = true; v.ph = null;
  rt.unmark('s15dock'); rt.unmark('s15raid');
  if (v.raid) { v.raid.noRout = false; v.raid.morale = 0; }
  if (F.wk) { F.wk.order = 'move'; F.wk.dest = { x: -6, z: -10 }; F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; }; }
  rt.say('人足', '材木は砦へ入ったぞ。さあ、柵を結ぶ！', 3);
  rt.award((t) => t.side.push('材木を運ぶ人足を守った'), '材木を運ぶ人足を守った');
  rt.after(3, () => v.then?.());
}

export function tick(rt) {
  const F = rt.flags, v = F.s15;
  if (v.hakobiDone || rt.over) return;
  const P = rt.player.u.pos;
  if (!v.atDock && Math.hypot(P.x - v.dock.x, P.z - v.dock.z) < 8) {
    v.atDock = rt.t; rt.unmark('s15dock');
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
  // 11/9 bot が始まりで止まった所：物見の残りが柵の外で立ち往生し、荷の護衛が終わらなかった。
  //   人足が戻って四十秒たっても柵の外に残る物見は、荷を諦めて退く（討死にはしない）
  if (v.raid && v.wkHome && rt.t - v.wkHome > 40 && !v.raid.routed && v.raid.units.some(ready) &&
      v.raid.units.every((u) => !ready(u) || Math.max(Math.abs(u.pos.x), Math.abs(u.pos.z)) > v.C.FORT + 1)) {
    v.raid.noRout = false; v.raid.morale = 0; v.raid.routed = true; v.raid.order = 'flee'; v.raid.fleeSet = true; v.raid.fleeDir = { x: 0, z: -1 };
    rt.say('足軽', '物見は荷を諦めて退いてゆくぞ', 2.6);
  }
  const raidGone = v.raid && (v.raid.routed || !v.raid.units.some(ready));
  // 人足が砦の内へ戻った（着いた知らせが押し合いで来ない時も、砦の内に入れば戻ったとみなす。11/9 bot が止まった）
  if (v.backT && !v.wkHome && F.wk?.units.some(ready)) {
    if (F.wk.units.filter(ready).every((u) =>
      Math.abs(u.pos.x) < v.C.FORT - 2 && Math.abs(u.pos.z) < v.C.FORT - 2)) v.wkHome = rt.t;
  }
  if (v.atDock && v.wkHome && raidGone && rt.t - v.backT > 25 &&
      Math.abs(P.x) < v.C.FORT && Math.abs(P.z) < v.C.FORT) done(rt);
}
