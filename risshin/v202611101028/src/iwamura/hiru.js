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
export function label(rt) { const H = rt.flags.iwHiru; return !H ? '' : ['本陣へ', '物見の台へ', '麓の小荷駄へ', '麓の小荷駄へ', '柵の口へ'][H.s] ?? '柵の口へ'; }
export function pin(rt) {
  const H = rt.flags.iwHiru;
  if (!H) return null;
  if (H.s === 0) return HONJIN;
  if (H.s === 1) return LOOK;
  // 出撃の知らせを待つ間と日暮れの間も、麓・柵の口の印を保つ。
  const goal = H.s === 2 || H.s === 3 ? KOMODA : MOUTH;
  // 麓を直に指すと切岸を横切る。昼も追撃と同じ九十九折りを往復する。
  if ((H.s === 2 || H.s === 4) && !near(rt.player.u.pos, goal, 5)) {
    guideRoad(H.s === 2 ? H.down : H.up, rt.player.u.pos, H.guide);
    return H.guide;
  }
  return goal;
}

// 折れのすぐ外から遠い次の角を狙うと切岸を横切る。
// 昼の往復は最寄りの区間の四歩先を示し、曲がり角を細かくたどる。
function guideRoad(path, p, out) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (len * len)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d > best) continue;
    best = d;
    const ahead = d > 3 ? t : Math.min(1, t + 4 / len);
    out.x = a[0] + dx * ahead; out.z = a[1] + dz * ahead;
    if (d <= 3 && Math.hypot(p.x - b[0], p.z - b[1]) < 3 && i + 1 < path.length) {
      const c = path[i + 1], nextLen = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const step = Math.min(1, 4 / (nextLen || 1));
      out.x = b[0] + (c[0] - b[0]) * step; out.z = b[1] + (c[1] - b[1]) * step;
    }
  }
}

// ctx：{ road（九十九折り）, guideRoad（道に沿う案内）, done（夜の段へ） }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.iwHiru) return;
  const H = F.iwHiru = { s: 0, at: rt.t, ctx, done: false };
  // 小荷駄より先へ下りず、戻る時も口の前で止まる。配列は始まりに一度だけ作る。
  H.down = [];
  for (let i = 0; i < ctx.road.length; i++) {
    const q = ctx.road[i];
    if (q[1] <= KOMODA.z) {
      const a = ctx.road[i - 1], t = (KOMODA.z - a[1]) / (q[1] - a[1]);
      H.down.push([a[0] + (q[0] - a[0]) * t, KOMODA.z]);
      break;
    }
    H.down.push(q);
  }
  H.down.push([KOMODA.x, KOMODA.z]);
  H.up = H.down.slice().reverse();
  const end = H.up.findIndex((q) => q[1] > MOUTH.z);
  if (end > 0) {
    const a = H.up[end - 1], b = H.up[end], t = (MOUTH.z - a[1]) / (b[1] - a[1]);
    H.up.splice(end, H.up.length - end, [a[0] + (b[0] - a[0]) * t, MOUTH.z]);
  }
  H.up.push([MOUTH.x, MOUTH.z]);
  H.guide = { x: 0, z: 0 };
  rt.world.setTime('day');
  rt.obj('main', GOALS[0], 'main', true);   // 右上と行き先の札（無いと「組のそばで槍を構えよ」の待ちの札が出た）
  rt.marker('iwHiru', () => pin(rt) || rt.player.u.pos, '', { guideAlways: true });
  rt.after(1.5, () => rt.say('河尻秀隆', '信忠様が本陣でお呼びじゃ。行くぞ', 3.2));
}

// 昼に加わる手も初期数と残数へ一緒に入れ、倒れた分を上の兵数へ反映する。
function countForce(rt, g, ally = false) {
  // 昼の兵糧入れと出撃も、夜の手と同じく決めた道と下知で動かす。
  // 共通の前線補充で護りを麓から抜いたり、次の寄せを陣の奥へ送らせない。
  g.noFrontline = true; g.noAI = true; g.noHunt = true;
  const F = rt.flags, groups = ally ? F.fieldAllies : F.rearGroups;
  if (!groups || groups.includes(g)) return;
  groups.push(g);
  const key = ally ? 'forceA0' : 'forceB0';
  F[key] += g.units.length;
}

function sally(rt, H, n) {
  // 夜の追撃と同じ九十九折りを逆に登る。麓から口への直線は切岸を横切る。
  const path = H.ctx.road.slice().reverse();
  // 柵の内まで登らず、口の前で列を開く。最後の折れの途中も道から外さない。
  const endZ = MOUTH.z - 4;
  const end = path.findIndex((q) => q[1] > endZ);
  if (end > 0) {
    const a = path[end - 1], b = path[end], t = (endZ - a[1]) / (b[1] - a[1]);
    path.splice(end, path.length - end, [a[0] + (b[0] - a[0]) * t, endZ]);
  }
  const [x, z] = path[0];
  const g = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: n === 1 ? '城方の出撃' : n === 2 ? '城方の二の手' : '大島杢之助の手', fixed: true, noGuard: true,
    anchor: { x, z }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 4, seekRange: 8, width: 2, formation: 'column', morale: 100, noRout: true, speed: 3.4 },
  n === 1 ? [{ type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 9, o: { flag: 'takeda' } }]
    : n === 2 ? [{ type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }, { type: 'gun', n: 2, o: { flag: 'takeda' } }]
    // 三の手は城の侍大将・大島杢之助が率いる（後に開城の礼に出て磔にされる三将の一人。ここでは討たれずに退く）
      : [{ type: 'busho', n: 1, o: { name: '大島杢之助', flag: 'takeda' } }, { type: 'samurai', n: 3, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }]);
  countForce(rt, g);
  g.roadColumn = true; g.followColumnRoad = true; g.colW = 2;
  g.order = 'path'; g.pathIdx = 1; g.dest = null; g.path = path;
  g.onArrive = (q) => { q.order = 'attack'; q.formation = 'line'; q.width = 10; q.seekRange = 40; q.aggro = 40; };
  // 11/9 二巡（織田H）：杢之助を invuln にすると、斬りかかっても傷がつかず「不死身」に見えた。
  //   傷は付くが、深手（命の四割）になると討たれる前に城へ退く（開城の礼に出る三将の一人なので、ここでは死なせない）。
  if (n === 3) {
    const lead = g.units.find((u) => u.name === '大島杢之助');
    // 定期の見張りの間に致命傷を受けても、後日の捕縛と食い違う討死にしない。
    // 味方の攻撃も傷として通し、共通の手傷の入口から同じ山道へ退かせる。
    const withdraw = () => {
      if (!lead || !lead.alive || lead.noTarget || rt.over || rt.flags.ending) return;
      retreatRoad(g, H.ctx.retreat || H.ctx.road, lead);
      lead.noTarget = true; lead.fleeing = true; lead.target = null; lead.atk = null; lead.swing = null; lead.aiT = 0;
      rt.say('物見', '杢之助が深手を負うて、城へ退くぞ！', 3);
    };
    if (lead) { lead.invuln = true; lead.allyOk = true; lead.mustLive = true; lead.onWound = withdraw; }
    const watch = () => {
      if (!lead || !lead.alive || lead.noTarget || rt.over || rt.flags.ending) return;
      if (lead.hp <= lead.maxHp * 0.4) {
        withdraw();
        return;
      }
      rt.after(0.3, watch, true);
    };
    rt.after(0.3, watch, true);
  }
  return g;
}
// 深手で離脱した者は戦力に残さない。一時的に転んだ者は起きるので数える。
const fighting = (u) => u.alive && !u.fleeing && !u.woundOut && !u.rearWound;
function standing(g, guardsOnly = false) {
  let n = 0;
  for (const u of g.units) if (fighting(u) && (!guardsOnly || u.type !== 'porter')) n++;
  return n;
}
// 進みが変わった時だけ既存の任務札を更新し、携帯で毎コマ札を作り直さない。
function progress(rt, H, text) {
  if (H.progress === text) return;
  H.progress = text;
  rt.objProgress('main', text);
}
// 昼の敗走も、登って来た九十九折りを城へ戻る。直進では切岸に詰まる。
// 各兵が今いる道の区間から先へ進め、麓や通過済みの折れへ飛ばさない。
function retreatRoad(g, road, only = null) {
  g.fleePath = road;
  for (const u of g.units) {
    if (!u.alive || only && u !== only) continue;
    let best = Infinity, next = 0;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = dx * dx + dz * dz;
      const t = len ? Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len)) : 0;
      const d = Math.hypot(u.pos.x - a[0] - dx * t, u.pos.z - a[1] - dz * t);
      if (d < best) { best = d; next = i; }
    }
    u.fleePathIdx = next;
  }
}
function rout(g, road) {
  retreatRoad(g, road);
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.focus = null; g.fleeDir = { x: 0, z: -1 };
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
}

// hidden：夜討ちの寄せ手（闇で忍ぶ者）。昼の間は柵の外に立って見えないよう隠し、狙わせない
export function tick(rt, hidden = []) {
  const F = rt.flags, H = F.iwHiru;
  if (!H || H.done || F.ending) return;
  for (const g of hidden) {
    if (!g) continue;
    // 非表示だけでは兵の体が昼の折れを塞ぐ。夜専用の手は戦場の外縁で待機する。
    // 初回の配置と下知を保存し、夜の始まりに同じ場所へ戻す。
    if (!g.iwDayPark) {
      g.iwDayPark = { x: g.anchor.x, z: g.anchor.z, order: g.order,
        noAI: g.noAI, noHunt: g.noHunt, aggro: g.aggro, seekRange: g.seekRange };
      const dx = 300 + (g.id % 6) * 10 - g.anchor.x, dz = 300 - g.anchor.z;
      g.anchor.x += dx; g.anchor.z += dz;
      for (const u of g.units) {
        u.iwDayPos = { x: u.pos.x, y: u.pos.y, z: u.pos.z };
        u.pos.x += dx; u.pos.z += dz; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
      }
      g.order = 'hold'; g.noAI = true; g.noHunt = true; g.aggro = 0; g.seekRange = 0;
    }
    for (const u of g.units) {
      if (!u.alive) continue;
      if (u._iwDay === undefined) u._iwDay = !!u.noTarget;
      u.noTarget = true; if (u.mesh) u.mesh.visible = false;
    }
  }
  H.hidden = hidden;
  const p = rt.player.u.pos, T = rt.t - H.at;
  // ① 本陣で信忠の下知
  if (H.s === 0) {
    if (near(p, HONJIN, 7)) {
      H.s = 1; H.at = rt.t;
      rt.say('織田信忠', '城の兵糧は尽きかけておる。夜に紛れて兵糧を入れようとするはず。一粒も入れるな', 4.2);
      rt.after(4.6, () => rt.say('河尻秀隆', 'はっ。……柵ぞいに物見の台の下へ。城を見ておけ', 3.4));
    }
    return;
  }
  // ② 物見の台の下から城を望む。麓に兵糧入れの小荷駄が見つかる
  if (H.s === 1) {
    if (T < 8) return;
    if (near(p, LOOK, 6)) {
      H.s = 2; H.at = rt.t;
      rt.obj('main', GOALS[1], 'main', true);
      rt.say('河尻秀隆', 'あれが岩村城じゃ。秋山虎繁と、信長様の叔母御のおつやの方が籠る', 4);
      rt.after(4.4, () => rt.say('河尻秀隆', '囲んで五月。城の兵糧は尽きかけておる', 3));
      rt.after(8, () => {
        if (F.ending || H.done) return;
        rt.say('物見', '麓の搦手道に小荷駄！　昼のうちに兵糧を入れる気です', 3.4);
        rt.after(3.6, () => rt.say('河尻秀隆', '組を連れて麓へ駆けよ。俵を城へ入れさせるな！', 3.2));
        H.esc = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: '兵糧入れの護り', fixed: true, noGuard: true, anchor: KOMODA, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 10, seekRange: 12, guard: true, guardLeash: 8, width: 4, spacing: 1.4, formation: 'yari', morale: 100, noRout: true, speed: 3.2 },
          [{ type: 'samurai', n: 1, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 7, o: { flag: 'takeda' } }, { type: 'porter', n: 3, o: { flag: null } }]);
        countForce(rt, H.esc);
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
    // 護りは荷駄のそばで受ける。坂の上の本人を追って折れの切岸へ集まらない。
    const left = standing(H.esc, true);
    progress(rt, H, `麓の小荷駄へ。護りを崩せ（${H.escN - left}／${H.escN}）`);
    // 待ち時間では兵糧入れを止めた事にしない。護りを実際に崩し、麓へ出た本人が確かめる。
    if (left > Math.ceil(H.escN * 0.25) || !near(p, KOMODA, 18)) return;
    rout(H.esc, H.ctx.retreat || H.ctx.road);
    H.s = 3; H.at = rt.t;
    rt.say('足軽', '人足が俵を捨てて逃げたぞ！', 2.6);
    rt.after(3, () => {
      if (F.ending || H.done) return;
      try { sfx('taiko', 0.9); } catch (e) { /* なし */ }
      rt.say('物見', '城の木戸が開いた！　城方が打って出ます！', 3);
      rt.after(3.2, () => rt.say('河尻秀隆', '麓で囲まれるな。柵の口まで退け！', 3));
      H.s = 4; H.at = rt.t;
      rt.objProgress('main', '山道を戻り、柵の口で城方を迎えよ');
    });
    return;
  }
  if (H.s === 3) return;
  // ④ 柵の口まで退くと、城方の出撃が口の前の野へ寄せる
  if (H.s === 4) {
    if (near(p, MOUTH, 10)) {
      H.s = 5; H.at = rt.t;
      try { sfx('toki', 0.8); } catch (e) { /* なし */ }
      H.g = sally(rt, H, 1); H.n = H.g.units.length; H.wave = 1; H.wt = rt.t;
      // 口を守る味方の槍（足軽十人）
      H.ally = allyGroup(rt, { faction: 'oda', name: '柵の口の槍組', fixed: true, noGuard: true, anchor: { x: MOUTH.x, z: -2 }, facing: Math.PI, width: 10, formation: 'line', aggro: 20, seekRange: 30 },
        [{ type: 'ashigaru', n: 10, o: { flag: 'oda' } }]);
      countForce(rt, H.ally, true);
      H.ally.order = 'move'; H.ally.dest = { x: MOUTH.x, z: MOUTH.z + 2 }; H.ally.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.aggro = 30; };
      rt.say('河尻秀隆', '槍をそろえよ。口の前で受け止める！', 3);
    }
    return;
  }
  if (!H.g) return;
  const left = standing(H.g), holding = near(p, MOUTH, 18);
  progress(rt, H, `柵の口で城方の${H.wave}の手を防げ（${H.n - left}／${H.n}）`);
  // 岩や折れで後列が止まっても、口を守った戦を永久に続けない。
  // 長引いた寄せは下知で退く。本人が口を離れたままでは次へ渡さない。
  if (!holding) H.holdAt = null;
  else if (H.holdAt == null) H.holdAt = rt.t;
  const exhausted = rt.t - H.wt >= 150 && H.holdAt != null && rt.t - H.holdAt >= 30;
  if (!holding || left > Math.ceil(H.n * 0.35) && !exhausted) return;
  H.holdAt = null;
  rout(H.g, H.ctx.retreat || H.ctx.road);
  if (H.wave < 3) {
    const w = H.wave + 1;
    rt.say('河尻秀隆', w === 2 ? '退いたか。まだ来るぞ、口を空けるな！' : 'よし、二の手も退いた。……旗が見えるか。次は侍大将じゃ', 3.2);
    H.g = null;
    rt.after(16, () => {
      if (F.ending || H.done) return;
      try { sfx('toki', 0.8); } catch (e) { /* なし */ }
      rt.say(w === 2 ? '物見' : '大島杢之助', w === 2 ? '二の手が坂を登って来ます。鉄砲も混じっております' : '岩村の意地を見せよ！　柵の口を破れ！', 3.2);
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
    for (const g of H.hidden || []) {
      if (!g) continue;
      const saved = g.iwDayPark;
      if (saved) {
        g.anchor.x = saved.x; g.anchor.z = saved.z;
        g.order = saved.order; g.noAI = saved.noAI; g.noHunt = saved.noHunt;
        g.aggro = saved.aggro; g.seekRange = saved.seekRange;
        delete g.iwDayPark;
      }
      for (const u of g.units) {
        if (u.iwDayPos) {
          Object.assign(u.pos, u.iwDayPos); delete u.iwDayPos;
          u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
          u.mv.x = u.mv.z = u.vel.x = u.vel.z = u.push.x = u.push.z = 0;
        }
        if (u._iwDay !== undefined) { u.noTarget = u._iwDay; delete u._iwDay; }
        if (u.mesh && u.alive) u.mesh.visible = true;
      }
    }
    rt.world.setTime('night');
    // 日が暮れるまでの間に柵の内の陣へ戻っている（場面替え）。柵の外で夜を迎えて柵に阻まれ、篝火へ行けなかった（11/9 の流し）
    const P = rt.player.u, W = rt.world;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); };
    put(P, 2, 10);
    for (const q of rt.squadGroups || []) for (const u of q.units) if (u.alive) put(u, 4 + Math.random() * 3, 12 + Math.random() * 3);
    H.night = true;
    try { H.ctx.done(); } catch (e) { /* なし */ }
  });
}

// 昼の段の bot：近い敵を突き、いなければ金の▼へ
export function bot(b, inp, { goTo, patientStrike }) {
  const p = b.player, u = p.u;
  // 夜の追撃と同じく、柵や切岸の向こうへ斬りかかり続けない。
  const e = b.army.nearestEnemy?.(u, 18, (o) => !o.isStruct && !o.fleeing && !o.noTarget && o.alive &&
    !o.woundOut && !o.rearWound && !o.invuln &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
    !b.army.terrainBlocks(u.pos, o.pos));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.runHeld = d > 6;
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2) patientStrike(p, inp, e, d);
    return;
  }
  const q = pin(b);
  if (q) { inp.runHeld = true; goTo(p, inp, q.x, q.z, 1.2); }
}
