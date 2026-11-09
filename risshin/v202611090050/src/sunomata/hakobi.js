// ======================================================================
// 墨俣 0〜2分半：材木の運搬の護衛（藤吉郎の段取り）
//   永禄九年九月。墨俣は長良川と犀川の間の中洲。木下藤吉郎は川並衆（蜂須賀小六ら）に上流で材木を組ませ、筏と舟で流し下らせた（伝承）。
//   『信長公記』は墨俣の守りを固めたとだけ記す。一夜城は後の物語（本体の終わりの言葉と同じ扱い）。
//   主人公は岸の舟着きへ行き、舟から材木を受けた人足を砦まで守って戻る。帰り道に斎藤の物見が荷を狙って寄せる。
//   人足が砦へ戻ったら、本体の「北門から塞ぐか、脇から直すか」の段取りへ。二分半で必ず次へ進む。
// ======================================================================
import { sfx } from '../audio.js';

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
    F.wk.order = 'move'; F.wk.speed = 2; F.wk.dest = { x: v.dock.x * 0.85, z: v.dock.z * 0.85 };
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
  if (F.wk) { F.wk.order = 'move'; F.wk.speed = 1.6; F.wk.dest = { x: -6, z: -10 }; F.wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; v.wkHome = rt.t; }; }
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
  const P = rt.player.u.pos, t = rt.t - v.hakobiT;
  if (!v.atDock && Math.hypot(P.x - v.dock.x, P.z - v.dock.z) < 8) {
    v.atDock = rt.t; rt.unmark('s15dock');
    sfx('taiko', 0.4);
    rt.say('蜂須賀正勝', 'よう来た。荷を下ろすぞ。少し待て', 2.8);
    rt.after(12, () => back(rt));
  }
  if (!v.atDock && t > 70) { v.atDock = rt.t; rt.unmark('s15dock'); back(rt); }
  const raidGone = v.raid && !v.raid.units.some(ready);
  if (v.backT && (raidGone && rt.t - v.backT > 25 || rt.t - v.backT > 70) || t > 150) done(rt);
}
