// ======================================================================
// 岩村城・水晶山　昼の段（0〜6分）「包囲の陣の見回り・城方の出撃」（docs/oda15_plan_1108.md 20）
//   ① 昼の水晶山の陣。本陣で信忠の下知を受け、柵ぞいの物見の台の下から岩村城を望む（囲んで五月・兵糧の尽きかけた城）。
//   ② 麓の搦手道に兵糧入れの小荷駄。組と駆け下りて護りを崩す（長い囲みは兵糧を断つ戦）。
//      城方が打って出て、柵の口まで退き、口の前の野で槍を合わせる。三度目の寄せ（侍大将・大島杢之助）まで押し返すと、日が暮れる。
//   ③ 日が暮れたら本体の夜の段（篝火→夜討ち→追い討ち）へ渡す。
// 兵は兵糧入れの十一人、城方の三つの寄せ三十四人（順に一つずつ）と、口を守る味方の槍十人。字は台詞と任務の一行だけ。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export const GOALS = ['水晶山の囲みを見回り、岩村城を望む', '麓の兵糧入れを止め、打って出た城方を押し返す'];
const HONJIN = { x: 0, z: 30 };   // 信忠の本陣の前（下知を受ける）
const KOMODA = { x: -4, z: -74 }; // 城の麓の搦手道の登り口（兵糧入れの小荷駄）
const LOOK = { x: -14, z: 0 };       // 柵の内、物見の台の下（城を望む所）
const MOUTH = { x: 0, z: -16 };      // 柵の口の前の野
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

export function active(rt) { const H = rt.flags.iwHiru; return !!H && !H.night; }   // 日が暮れて夜の段へ渡すまで
export function stage(rt) { const H = rt.flags.iwHiru; return !H || H.s < 2 ? 0 : 1; }
export function pin(rt) { const H = rt.flags.iwHiru; return !H || H.done ? null : H.s === 0 ? HONJIN : H.s === 1 ? LOOK : H.s === 2 ? KOMODA : H.s === 3 ? null : MOUTH; }

// ctx：{ done（夜の段へ） }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.iwHiru) return;
  const H = F.iwHiru = { s: 0, at: rt.t, ctx, done: false };
  rt.world.setTime('day');
  rt.marker('iwHiru', () => pin(rt) || rt.player.u.pos, '', { guideAlways: true });
  rt.after(1.5, () => rt.say('河尻秀隆', '信忠様が本陣でお呼びじゃ。行くぞ', 3.2));
}

function sally(rt, H, n) {
  const g = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: n === 1 ? '城方の出撃' : n === 2 ? '城方の二の手' : '大島杢之助の手', fixed: true, noGuard: true,
    anchor: { x: MOUTH.x + (n === 1 ? -6 : 8), z: -64 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 30, seekRange: 40, width: 10, formation: 'line', morale: 100, noRout: true, speed: 3.4 },
  n === 1 ? [{ type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 9, o: { flag: 'takeda' } }]
    : n === 2 ? [{ type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }, { type: 'gun', n: 2, o: { flag: 'takeda' } }]
    // 三の手は城の侍大将・大島杢之助が率いる（後に開城の礼に出て磔にされる三将の一人。ここでは討たれずに退く）
      : [{ type: 'busho', n: 1, o: { name: '大島杢之助', flag: 'takeda' } }, { type: 'samurai', n: 3, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }]);
  g.order = 'path'; g.pathIdx = 0; g.dest = null; g.path = [[MOUTH.x + (n === 1 ? -3 : 4), MOUTH.z - 4]];
  g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.aggro = 40; };
  // 11/9 二巡（織田H）：杢之助を invuln にすると、斬りかかっても傷がつかず「不死身」に見えた。
  //   傷は付くが、深手（命の四割）になると討たれる前に城へ退く（開城の礼に出る三将の一人なので、ここでは死なせない）。
  if (n === 3) {
    const lead = g.units.find((u) => u.name === '大島杢之助');
    const watch = () => {
      if (!lead || !lead.alive || rt.over || rt.flags.ending) return;
      if (lead.hp <= lead.maxHp * 0.4) {
        lead.invuln = true; lead.noTarget = true; lead.fleeing = true; lead.target = null; lead.atk = null; lead.aiT = 0;
        rt.say('物見', '杢之助が深手を負うて、城へ退くぞ！', 3);
        return;
      }
      rt.after(0.3, watch, true);
    };
    rt.after(0.3, watch, true);
  }
  return g;
}
const standing = (g) => g.units.filter((u) => u.alive && !u.fleeing).length;
function rout(g) {
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.focus = null; g.fleeDir = { x: 0, z: -1 };
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
}

// hidden：夜討ちの寄せ手（闇で忍ぶ者）。昼の間は柵の外に立って見えないよう隠し、狙わせない
export function tick(rt, hidden = []) {
  const F = rt.flags, H = F.iwHiru;
  if (!H || H.done || F.ending) return;
  for (const g of hidden) for (const u of g?.units || []) {
    if (!u.alive) continue;
    if (u._iwDay === undefined) u._iwDay = !!u.noTarget;
    u.noTarget = true; if (u.mesh) u.mesh.visible = false;
  }
  H.hidden = hidden;
  const p = rt.player.u.pos, T = rt.t - H.at;
  // ① 本陣で信忠の下知
  if (H.s === 0) {
    if (near(p, HONJIN, 7) || T > 60) {
      H.s = 1; H.at = rt.t;
      rt.say('織田信忠', '城の兵糧は尽きかけておる。夜に紛れて兵糧を入れようとするはず。一粒も入れるな', 4.2);
      rt.after(4.6, () => rt.say('河尻秀隆', 'はっ。……柵ぞいに物見の台の下へ。城を見ておけ', 3.4));
    }
    return;
  }
  // ② 物見の台の下から城を望む。麓に兵糧入れの小荷駄が見つかる
  if (H.s === 1) {
    if (T < 8) return;
    if (near(p, LOOK, 6) || T > 70) {
      H.s = 2; H.at = rt.t;
      rt.say('河尻秀隆', 'あれが岩村城じゃ。秋山虎繁と、信長様の叔母御のおつやの方が籠る', 4);
      rt.after(4.4, () => rt.say('河尻秀隆', '囲んで五月。城の兵糧は尽きかけておる', 3));
      rt.after(8, () => {
        if (F.ending || H.done) return;
        rt.say('物見', '麓の搦手道に小荷駄！　昼のうちに兵糧を入れる気です', 3.4);
        rt.after(3.6, () => rt.say('河尻秀隆', '組を連れて麓へ駆けよ。俵を城へ入れさせるな！', 3.2));
        H.esc = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: '兵糧入れの護り', fixed: true, noGuard: true, anchor: { x: KOMODA.x - 2, z: KOMODA.z - 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 20, seekRange: 26, width: 8, formation: 'loose', morale: 100, noRout: true, speed: 3.2 },
          [{ type: 'samurai', n: 1, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }, { type: 'porter', n: 3, o: { flag: null } }]);
        H.esc.order = 'hold';
        for (const u of H.esc.units) if (u.type === 'porter') u.noTarget = true;
        H.escN = H.esc.units.filter((u) => u.type !== 'porter').length;
      });
    }
    return;
  }
  // ③ 麓の兵糧入れ。護りを崩すと人足は俵を捨てて城へ逃げる
  if (H.s === 2) {
    if (!H.esc) return;
    if (near(p, KOMODA, 26)) { H.esc.order = 'attack'; H.esc.aggro = 30; }
    const left = H.esc.units.filter((u) => u.alive && !u.fleeing && u.type !== 'porter').length;
    if (left > 2 && T < 110) return;
    rout(H.esc);
    H.s = 3; H.at = rt.t;
    rt.say('足軽', '人足が俵を捨てて逃げたぞ！', 2.6);
    rt.after(3, () => {
      if (F.ending || H.done) return;
      try { sfx('taiko', 0.9); } catch (e) { /* なし */ }
      rt.say('物見', '城の木戸が開いた！　城方が打って出ます！', 3);
      rt.after(3.2, () => rt.say('河尻秀隆', '麓で囲まれるな。柵の口まで退け！', 3));
      H.s = 4; H.at = rt.t;
    });
    return;
  }
  if (H.s === 3) return;
  // ④ 柵の口まで退くと、城方の出撃が口の前の野へ寄せる
  if (H.s === 4) {
    if (near(p, MOUTH, 10) || T > 45) {
      H.s = 5; H.at = rt.t;
      try { sfx('toki', 0.8); } catch (e) { /* なし */ }
      H.g = sally(rt, H, 1); H.n = H.g.units.length; H.wave = 1; H.wt = rt.t;
      // 口を守る味方の槍（足軽十人）
      H.ally = allyGroup(rt, { faction: 'oda', name: '柵の口の槍組', fixed: true, noGuard: true, anchor: { x: MOUTH.x, z: -2 }, facing: Math.PI, width: 10, formation: 'line', aggro: 20, seekRange: 30 },
        [{ type: 'ashigaru', n: 10, o: { flag: 'oda' } }]);
      H.ally.order = 'move'; H.ally.dest = { x: MOUTH.x, z: MOUTH.z + 2 }; H.ally.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.aggro = 30; };
      rt.say('河尻秀隆', '槍をそろえよ。口の前で受け止める！', 3);
    }
    return;
  }
  if (!H.g) return;
  if (standing(H.g) > Math.ceil(H.n * 0.35) && rt.t - H.wt < 100) return;
  rout(H.g);
  if (H.wave < 3) {
    const w = H.wave + 1;
    rt.say('河尻秀隆', w === 2 ? '退いたか。まだ来るぞ、口を空けるな！' : 'よし、二の手も退いた。……旗が見えるか。次は侍大将じゃ', 3.2);
    H.g = null;
    rt.after(16, () => {
      if (F.ending || H.done) return;
      try { sfx('toki', 0.8); } catch (e) { /* なし */ }
      rt.say(w === 2 ? '物見' : '大島杢之助', w === 2 ? '二の手が坂を下りて来ます。鉄砲も混じっております' : '岩村の意地を見せよ！　柵の口を破れ！', 3.2);
      H.g = sally(rt, H, w); H.n = H.g.units.length; H.wave = w; H.wt = rt.t;
    });
    return;
  }
  // 三の手も崩れた。日が暮れて夜の段へ
  H.g = null; H.done = true;
  rt.unmark('iwHiru');
  rt.award((t) => { t.side.push('昼、麓の兵糧入れを止め、柵の口の前で城方の出撃を三度押し返した'); }, '城方の出撃を押し返した', MOUTH);
  rt.say('河尻秀隆', 'よう押し返した。じきに日が暮れる。今夜は篝火を絶やすな', 3.6);
  if (H.ally) { H.ally.order = 'move'; H.ally.dest = { x: MOUTH.x, z: -1 }; H.ally.onArrive = (q) => { q.order = 'hold'; }; }
  rt.after(6, () => {
    if (F.ending) { H.night = true; return; }
    for (const g of H.hidden || []) for (const u of g?.units || []) {
      if (u._iwDay !== undefined) { u.noTarget = u._iwDay; delete u._iwDay; }
      if (u.mesh && u.alive) u.mesh.visible = true;
    }
    rt.world.setTime('night');
    H.night = true;
    try { H.ctx.done(); } catch (e) { /* なし */ }
  });
}

// 昼の段の bot：近い敵を突き、いなければ金の▼へ
export function bot(b, inp, { goTo, patientStrike }) {
  const p = b.player, u = p.u;
  const e = b.army.nearestEnemy?.(u, 18, (o) => !o.isStruct && !o.fleeing && !o.noTarget && o.alive);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.runHeld = d > 6;
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2) patientStrike(p, inp, e, d);
    return;
  }
  const q = pin(b);
  if (q) { inp.runHeld = true; goTo(p, inp, q.x, q.z, 3); }
}
