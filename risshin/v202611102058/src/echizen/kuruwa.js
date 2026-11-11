// ======================================================================
// 越前一向一揆・木ノ芽峠　郭の守兵が退く（docs/oda15_plan_1108.md 18：主防御線 → 一揆勢撤退）
//   木戸を破った後の郭（木ノ芽峠城の木戸内・奥の曲輪・本陣）で、塀の上や届かない所の守兵が十数人残ると、
//   郭が誰の物にもならず七分余り止まっていた（11/9 の流し：木戸内で 440 秒）。
//   味方が郭に入って七十五秒たっても守兵が残っていたら、残る守兵は「峠を捨てよ」の声とともに北の府中の方へ退く。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
import { sfx } from '../audio.js';
import { toCourt } from './goryu.js';
import { k15Fade } from '../oda15_kit.js';
import { fighter, pursuer } from './fuchu.js';
import { KINOME_PLAN } from '../castles/kinome.js';

const ORDER = ['kinome_sou', 'kinome_fuku', 'kinome_hon'];

const SIDE = ['saikoji_mae', 'saikoji_hon', 'hachibuse_mae', 'hachibuse_hon'];

// その郭の守兵（実兵の隊と控えの軽い兵）を府中の方へ退かせる
function rout(rt, z) {
  const F = rt.flags;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || !g.units.some((u) => u.alive && !u.fleeing && z.test(u.pos.x, u.pos.z))) continue;
    g.routed = true; g.order = 'flee'; g.morale = 0; g.focus = null; g.noRout = false;
    g.fleeDir = { x: 0, z: 1 };
    for (const u of g.units) { u.fleeing = true; u.target = null; u.aiT = 0; }
  }
  for (const b of F.defenders || []) {
    if (!z.test(b.pos.x, b.pos.z)) continue;
    if (b.real) { b.real.routed = true; b.real.order = 'flee'; b.real.morale = 0; }
    try { b.light?.rout?.({ hideAfter: 40 }); } catch (e) { /* なし */ }
  }
}

// 本道の主郭が落ちて四十五秒：杉津口の堀江景忠が寝返り（信長公記・8月15日）、別手の西光寺丸・鉢伏の一揆勢も峠を捨てる。
//   別手の城を味方の手が押さえきれず、本人が峠の主郭で待ち続けて終わらなかった（11/9 の流し：五百八秒から先へ進まず）。
function side(rt) {
  const F = rt.flags, hon = F.SZ.byId.kinome_hon;
  // 退却後も空城の時計だけで制圧にしない。通常の郭判定が実兵の入城・保持を
  // 確かめ、前郭の落城から本郭への下知を渡した後に、使番が知らせる。
  if (F.echSideGone && !F.echSideTaken) {
    const left = SIDE.map((id) => F.SZ.byId[id]);
    if (left.every((z) => z?.owner === 'friend' && !z.enemies)) {
      F.echSideTaken = true;
      if (F.echSideRetreatNames?.length)
        rt.say('使番', `別手の味方が、捨てられた${F.echSideRetreatNames.join('と')}の砦を押さえました！`, 3.6);
    } else {
      if (rt.t - F.echSideGone >= 60) for (const z of left) if (z.enemies) rout(rt, z);
      // 11/10 関所：別手の味方が尾根の遠い砦へ入らず、主郭で四百五十秒止まって刻限が切れた（取り込み後の流し）。
      //   退いて四十五秒、守兵の残らない砦は、峠へ上がった別手が押さえた事にする（本人を主郭で待たせ続けない）
      if (rt.t - F.echSideGone >= 45) for (const z of left) if (z && z.owner !== 'friend' && !z.enemies) { z.owner = 'friend'; z.fallen = true; }
    }
  }
  if (hon.owner !== 'friend' || hon.enemies > 0 || F.echSideGone) return;
  if (F.echHonT == null) F.echHonT = rt.t;
  // 11/10 関所：主郭を取ってから別手が退くまで四十五秒＋押さえるまで三十秒、本人は主郭で何もせず待っていた（流しで七十五秒）。二十秒に縮める
  if (rt.t - F.echHonT < 20) return;
  F.echSideGone = rt.t || 0.001;
  // 既に味方が押さえた城を、守兵が焼き捨てた事にしない。
  const pending = SIDE.filter(id => {
    const z = F.SZ.byId[id];
    return z && (z.owner !== 'friend' || z.enemies > 0);
  });
  if (!pending.length) return;
  F.echRetreatT ??= rt.t;
  // 四城制圧前の別手の退きも、府中に火が掛かった夜の出来事にそろえる。
  rt.world.setTime?.('night');
  for (const id of ['saikoji_hon', 'hachibuse_hon']) {
    const z = F.SZ.byId[id];
    if (pending.includes(id)) {
      rt.world.addFire(z.pos.x - 6, z.pos.z, { size: 3.2, blackSmoke: true });
      (F.echBurningCourts ||= new Set()).add(id);
    }
  }
  try { sfx('farHorn', 0.7); } catch (e) { /* なし */ }
  const names = [];
  if (pending.some(id => id.startsWith('saikoji_'))) names.push('西光寺丸');
  if (pending.some(id => id.startsWith('hachibuse_'))) names.push('鉢伏');
  F.echSideRetreatNames = names;
  F.echSideReported = true;
  rt.say('使番', `杉津口の堀江景忠が寝返り、府中の龍門寺にも火が掛かりました！　${names.join('と')}の一揆勢が、砦を捨てて退きます！`, 4);
  for (const id of pending) {
    const z = F.SZ.byId[id];
    if (!z) continue;
    rout(rt, z);
    // 撤退は制圧ではない。別手か本人が入り、通常の人数・保持時間を
    // 満たしてから siege_zones が持ち主と落城の知らせを更新する。
  }
}

// 前田・佐々・不破の手（echizen/goryu.js）は木戸を破った後、木戸の前で斬り合ったまま郭の奥へ来ず、
//   本人が一人で主郭の四十人に入って討たれた。六秒ごとに進む郭を確かめ、口を通る道を渡す。
function follow(rt, z, dt) {
  const F = rt.flags, G = F.echGoryu;
  if (!G?.done || (F.echFollowT = (F.echFollowT || 0) - dt) > 0) return;
  F.echFollowT = 6;
  // 逆襲の間は副郭で支える。主郭へ先走って本人を孤立させない。
  if (F.echElite && !F.echElite.done) z = F.SZ.byId.kinome_fuku;
  for (const g of G.groups) {
    if (!g.count || g.routed) continue;
    const c = g.center();
    if (z.test(c.x, c.z) && Math.hypot(c.x - z.pos.x, c.z - z.pos.z) < 30) continue;
    toCourt(rt, g, z);
  }
}

export function tick(rt, dt) {
  const F = rt.flags;
  if (!F.kannonFell || F.ending || F.echAdv || !F.SZ?.byId) return;
  side(rt);
  // 勝ち・目標と同じ条件で選ぶ。制圧後に残敵が戻った郭も支援し直す。
  const id = ORDER.find((k) => F.SZ.byId[k] &&
    (F.SZ.byId[k].owner !== 'friend' || F.SZ.byId[k].enemies > 0));
  if (!id) return;
  const z = F.SZ.byId[id];
  const K = F.echKuruwa || (F.echKuruwa = {});
  const S = K[id] || (K[id] = { t: null });
  follow(rt, z, dt);
  // 守兵が消えた郭に本人が立っても、味方の手が遅れて「三人そろわない」と郭が落ちなかった（11/9 の流し：副郭で八百秒）。
  //   本人が空の郭に十五秒立てば、本人の手で押さえた事にする
  if (!z.enemies && z.friends && z.test(rt.player.u.pos.x, rt.player.u.pos.z)) {
    S.empty = (S.empty || 0) + dt;
    if (S.empty > 15 && z.initialNeed > 1) z.initialNeed = 1;
  } else S.empty = 0;
  // 守兵の無い郭の口の外で、本人が六十秒入れずにいた（11/9 の流し：主郭の口の外で七百秒）。郭の真ん中へ移す
  const P = rt.player.u.pos;
  if (!z.enemies && !z.test(P.x, P.z) && Math.hypot(P.x - z.pos.x, P.z - z.pos.z) < 160 && (!z.enabled || z.enabled())) {
    S.out = (S.out || 0) + dt;
    if (S.out > 60) {
      S.out = 0;
      const u = rt.player.u, ox = u.pos.x, oz = u.pos.z;
      u.pos.x = z.pos.x; u.pos.z = z.pos.z; u.pos.y = rt.world.heightAt(z.pos.x, z.pos.z);
      // 11/9 二巡：逃げた・手負いで下がった・遠くに残った組の者まで郭へ移すと、八百歩先から一息に飛んだ（流しの指摘 455 回）。本人のそばの者だけ連れて行く
      for (const q of rt.squadGroups || []) for (const v of q.units) if (!q.routed && v.alive && !v.fleeing && !v.woundOut && !v.rearWound && Math.hypot(v.pos.x - ox, v.pos.z - oz) < 40) { v.pos.x = z.pos.x + (Math.random() - 0.5) * 6; v.pos.z = z.pos.z + (Math.random() - 0.5) * 6; v.pos.y = rt.world.heightAt(v.pos.x, v.pos.z); }
    }
  } else S.out = 0;
  // 11/10 クラウドの正式の流し：副郭から主郭の口へ向かう途中、副郭の西の塀際（-25,34）で塀越しに突き続け、刻限まで四百秒動かなかった。
  //   郭の外で四十五秒、六歩の内から動けず、同じ高さの敵も近くにいなければ、暗転してその郭の口の手前へ送る（人が引っ掛かった時も同じ）
  if (!z.test(P.x, P.z) && rt.player.u.alive) {
    if (!S.stuck || Math.hypot(P.x - S.stuck.x, P.z - S.stuck.z) > 6) S.stuck = { x: P.x, z: P.z, t: rt.t };
    let foe = false;
    for (const u of rt.army.units) if (fighter(u) && u.team !== rt.player.u.team && Math.abs(u.pos.y - P.y) < 2 && Math.abs(u.pos.x - P.x) < 4 && Math.abs(u.pos.z - P.z) < 4 && !rt.army.wallBetween(P, -1, u.pos, false)) { foe = true; break; }
    if (foe) S.stuck.t = rt.t;
    const gaps = KINOME_PLAN.kuruwa.find((k) => k.id === id)?.gapAt;
    if (rt.t - S.stuck.t > 45 && gaps?.length) {
      let best = Infinity, g = gaps[0];
      for (const q of gaps) { const d = Math.hypot(P.x - q[0], P.z - q[1]); if (d < best) { best = d; g = q; } }
      const dz = g[1] < z.pos.z ? -4 : 4;
      S.stuck = null;
      const me = rt.player.u, ox = P.x, oz = P.z;
      k15Fade(rt, () => {
        const put = (u, x, zz) => { u.pos.x = x; u.pos.z = zz; u.pos.y = rt.world.heightAt(x, zz); u.vel && (u.vel.x = u.vel.z = 0); };
        put(me, g[0], g[1] + dz);
        for (const q of rt.squadGroups || []) for (const v of q.units) if (pursuer(v) && Math.hypot(v.pos.x - ox, v.pos.z - oz) < 30) put(v, g[0] - 2 + Math.random() * 4, g[1] + dz * 2);
      });
    }
  } else S.stuck = null;
  // 11/10 クラウドの流し：木戸が破れた後、守兵が口の外へ打って出て本人と木戸の前で斬り合い続け、三百秒余り郭へ入れなかった。
  //   木戸が破れて百秒、本人が木戸の四十五歩の内で戦っていれば、残る守兵は奥へ退く（味方の手も口へ押し入っている）
  const gs = id === 'kinome_sou' ? F.gateKinome?.struct : null;
  if (gs && !gs.alive && z.enemies) {
    S.open ??= rt.t;
    if (rt.t - S.open > 100 && Math.hypot(P.x - gs.seg[0] / 2 - gs.seg[2] / 2, P.z - gs.seg[1] / 2 - gs.seg[3] / 2) < 45) {
      S.open = rt.t;
      rout(rt, z);
      rt.say('一揆の衆徒', '木戸を破られた！　郭を捨てて奥へ退け！', 3);
      return;
    }
  }
  // 11/10 クラウドの流し：副郭の中に本人が立っても、残り十五人が控えの軽い兵や遠い塀の上で、三十歩の内に斬れる敵が一人もおらず
  //   刻限まで五百秒止まった（breachHit が立たないので下の七十五秒の退きも来ない）。郭の中で斬れる敵（同じ高さ・二十五歩の内。
  //   塀の上や切岸の上で動かない守兵は数えない）が三十秒いなければ、残りは退く
  if (z.enemies && z.test(P.x, P.z)) {
    let near = false;
    for (const u of rt.army.units) if (fighter(u) && u.team !== rt.player.u.team &&
        Math.abs(u.pos.y - P.y) < 3 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 25 &&
        !rt.army.wallBetween(P, -1, u.pos, false)) { near = true; break; }
    S.idle = near ? 0 : (S.idle || 0) + dt;
    // 斬り合っていても残りの数が六十秒減らない（塀の上の弓・届かない所の守兵が混ざる）時も退く（正式の流し：残り十五人のまま百五秒）
    if (S.cntV !== z.enemies) { S.cntV = z.enemies; S.cntT = rt.t; }
    if (S.idle > 25 || rt.t - S.cntT > 60) {
      S.cntT = rt.t;
      S.idle = 0;
      rout(rt, z);
      rt.say('一揆の衆徒', 'この郭はもう持たぬ！　奥へ退け！', 3);
      return;
    }
  } else {
    // 郭を離れて休んだ時間を、守兵と戦い続けた六十秒に足さない。
    S.idle = 0; S.cntV = null; S.cntT = null;
  }
  // どの郭も本人が守兵へ当てて戦う。副郭・主郭も味方と時計だけでは退かせない。
  if (!F['breachHit_' + id] || !z.test(P.x, P.z)) { S.t = null; return; }
  if (!z.friends || !z.enemies) return;
  if (S.t == null) S.t = rt.t;          // 味方が初めて郭に入った時から数える（数が少しずつ揺れても止まらない）
  if (rt.t - S.t < 75) return;
  S.t = rt.t; S.done = true;   // 後から郭へ入った守兵が残れば、また七十五秒で退く
  rout(rt, z);
  rt.say('一揆の衆徒', 'もう持たぬ！　この郭を捨てて奥へ退け！', 3);
}

// 四城を押さえた後：峠の主郭から観音丸の北口の先の殿まで、本道を五百メートル余り歩いて戻っていた（11/9 の流し：二百八十秒）。
//   砦の火と知らせを見せた後（十二秒）、場面替えで殿の手前の峠道へ。味方の手も一緒に並べる。ctx：{ front }（殿の前の点）
export function chaseCut(rt, ctx) {
  const F = rt.flags;
  if (F.echChaseCut) return;
  F.echChaseCut = true;
  rt.after(12, () => {
    if (F.ending || rt.over || F.echGateReached || !rt.player.u.alive) return;
    // 暗転して移す（11/10：見えたまま五百歩飛んでいた）
    k15Fade(rt, () => cut(rt, ctx), '峠道を追う', '');
  });
}
function cut(rt, ctx) {
  const F = rt.flags;
  {
    const f = ctx.front, P = rt.player.u, W = rt.world;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); u.vel && (u.vel.x = u.vel.z = 0); };
    const ox = P.pos.x, oz = P.pos.z;
    put(P, f.x, f.z + 14);
    // 場面替えの間に息を整えた（追う間の時が過ぎている）。命を八割五分まで戻す
    if (P.maxHp) P.hp = Math.max(P.hp, P.maxHp * 0.85);
    for (const q of rt.squadGroups || []) for (const u of q.units) if (pursuer(u) && Math.hypot(u.pos.x - ox, u.pos.z - oz) < 40) put(u, f.x - 3 + Math.random() * 6, f.z + 17 + Math.random() * 5);
    for (const g of F.echUp || []) {
      if (g.routed || g.order === 'flee') continue;
      // 遠くの将の手は本道を歩かせる。倒れた者も場面替えで運ばない。
      // 組の途中だけを飛ばすと隊の中心が遠くへ戻るため、追手全員の近さを調べる。
      const followers = g.units.filter(pursuer);
      if (!followers.length || followers.some(u => Math.hypot(u.pos.x - ox, u.pos.z - oz) >= 40)) continue;
      for (const u of followers) put(u, f.x - 6 + Math.random() * 12, f.z + 18 + Math.random() * 6);
      const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z; g._fitAt = 0;
      g.pathIdx = Math.max(0, (g.path?.length || 1) - 1);
    }
    rt.after(1, () => { if (!F.ending && !rt.over) rt.say('組頭', '追いついたぞ。坂の上に殿が踏みとどまっておる！', 3); });
  }
}

// 観音丸が落ちた後：九十九折りの尾根道を千メートル近く歩き、道の脇の一揆勢と斬り合って
//   木ノ芽峠城の木戸の前まで五百秒余り掛かり、刻限の十八分を越えていた（11/10 クラウドの流し：木戸に着いたのが830秒）。
//   落ちて二十秒（火と台詞を見せた後）、本人がまだ折れ道の下にいれば、暗転して木戸の七十歩手前の峠道へ。
//   前田・佐々・不破の手と、本人のそばの組の者も一緒に並べる。ctx：{ below（この南北より南なら送る）, at（本人を置く点）, ahead（手を置く南北）}
export function roadCut(rt, ctx) {
  const F = rt.flags;
  if (!F.kannonFell || F.echAdv || F.ending || rt.over) return;
  const P = rt.player.u;
  if (F.echRoadCut) {
    // 11/10 正式の流し：主郭の段なのに、本人が九十九折りを下って殿の一揆勢と斬り合い、刻限が切れた（三度）。
    //   峠の城の段の間に折れ道の下へ三十秒いれば、また暗転して木戸の前へ戻す
    if (!P.alive || P.pos.z > ctx.below) { F.echBelowT = null; return; }
    F.echBelowT ??= rt.t;
    if (rt.t - F.echBelowT < 30) return;
    F.echBelowT = null;
  } else {
    if (F.souFell) return;
    if (F.echKannonFellT == null) F.echKannonFellT = rt.t;
    if (rt.t - F.echKannonFellT < 20) return;
    if (!P.alive || P.pos.z > ctx.below) { F.echRoadCut = true; return; }
    F.echRoadCut = true;
  }
  const W = rt.world, first = !F.echRoadCutDone;
  F.echRoadCutDone = true;
  const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); u.vel && (u.vel.x = u.vel.z = 0); u.target = null; };
  k15Fade(rt, () => {
    const ox = P.pos.x, oz = P.pos.z, f = ctx.at;
    put(P, f.x, f.z);
    if (P.maxHp) P.hp = Math.max(P.hp, P.maxHp * 0.85);
    for (const q of rt.squadGroups || []) for (const u of q.units) if (!q.routed && u.alive && !u.fleeing && !u.woundOut && !u.rearWound && Math.hypot(u.pos.x - ox, u.pos.z - oz) < 40) put(u, f.x - 3 + Math.random() * 6, f.z - 4 - Math.random() * 5);
    const G = first ? F.echGoryu : null;   // 二度目からは本人と組だけ戻す（前田らの手は郭の中に残す）
    for (const g of G?.groups || []) {
      if (!g.count || g.routed) continue;
      const dx = g.units[0] ? (g.units[0].pos.x > 0 ? 3 : -3) : 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound) put(u, f.x + dx - 2 + Math.random() * 4, ctx.ahead + Math.random() * 8);
      const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z; g._fitAt = 0;
      if (g.order === 'path' && G.route?.length) { g.path = [[c.x, c.z], ...G.route.filter(([, z]) => z > c.z + 2)]; g.pathIdx = 0; }
    }
    // 送った先より下（折れ道）に残る本道の小勢は、追い越された事にして谷へ散らす。
    //   残すと bot も人も折れ道を引き返して二百秒斬り合っていた（11/10 クラウドの流し）
    for (const b of first ? F.roadGuards || [] : []) {
      const g = b?.real;
      if (!g?.count || g.routed || g === F.echTail) continue;
      const c = g.center();
      if (c.z > f.z - 6) continue;
      g.routed = true; g.order = 'flee'; g.morale = 0; g.focus = null; g.noRout = false; g.fleeDir = { x: c.x < 0 ? -1 : 1, z: 0 };
      for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.atk = null; u.aiT = 0; }
    }
    F.statusAt = 0;
  }, first ? '尾根道を上り詰めた' : '', first ? '木ノ芽峠城の木戸の前' : '');
  if (first) rt.after(1.5, () => { if (!F.ending && !rt.over) rt.say('前田利家', '木戸はすぐそこじゃ。打ち破って中へ押し入れ！', 3.4); });
}
