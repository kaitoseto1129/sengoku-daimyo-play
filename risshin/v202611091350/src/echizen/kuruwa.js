// ======================================================================
// 越前一向一揆・木ノ芽峠　郭の守兵が退く（docs/oda15_plan_1108.md 18：主防御線 → 一揆勢撤退）
//   木戸を破った後の郭（木ノ芽峠城の木戸内・奥の曲輪・本陣）で、塀の上や届かない所の守兵が十数人残ると、
//   郭が誰の物にもならず七分余り止まっていた（11/9 の流し：木戸内で 440 秒）。
//   味方が郭に入って七十五秒たっても守兵が残っていたら、残る守兵は「峠を捨てよ」の声とともに北の府中の方へ退く。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
import { sfx } from '../audio.js';

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
  if (hon.owner !== 'friend' || F.echSideGone) return;
  if (F.echHonT == null) F.echHonT = rt.t;
  if (rt.t - F.echHonT < 45) return;
  F.echSideGone = true;
  try { sfx('farHorn', 0.7); } catch (e) { /* なし */ }
  rt.say('使番', '杉津口の堀江景忠、寝返りました！　西光寺丸も鉢伏も、一揆勢が城を捨てて逃げます！', 4);
  for (const id of SIDE) {
    const z = F.SZ.byId[id];
    if (!z) continue;
    rout(rt, z);
    z.owner = z.state = 'friend'; z.enemies = 0; z.fallen = true;
  }
}

// 前田・佐々・不破の手（echizen/goryu.js）は木戸を破った後、木戸の前で斬り合ったまま郭の奥へ来ず、
//   本人が一人で主郭の四十人に入って討たれた（11/9 の流し）。六秒ごとに、今の郭の真ん中へ寄せ直す
function follow(rt, z, dt) {
  const F = rt.flags, G = F.echGoryu;
  if (!G?.done || (F.echFollowT = (F.echFollowT || 0) - dt) > 0) return;
  F.echFollowT = 6;
  for (const g of G.groups) {
    if (!g.count || g.routed) continue;
    const c = g.center(), P = rt.player.u.pos;
    if (z.test(c.x, c.z) && Math.hypot(c.x - z.pos.x, c.z - z.pos.z) < 30) continue;
    // 九十九折りで詰まって本人から九十メートル余り離れた手は、本人の後ろ（郭と反対の側・画面の外）へ寄せる
    if (Math.hypot(c.x - P.x, c.z - P.z) > 90) {
      const dx = P.x - z.pos.x, dz = P.z - z.pos.z, d = Math.hypot(dx, dz) || 1;
      const bx = P.x + dx / d * 24, bz = P.z + dz / d * 24;
      for (const u of g.units) if (u.alive) { u.pos.x = bx + (Math.random() - 0.5) * 8; u.pos.z = bz + (Math.random() - 0.5) * 8; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
    }
    g.order = 'move'; g.dest = { x: z.pos.x + (Math.random() - 0.5) * 8, z: z.pos.z + (Math.random() - 0.5) * 8 }; g.speed = 4.5;
    g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.aggro = 30; };
  }
}

export function tick(rt, dt) {
  const F = rt.flags;
  if (!F.kannonFell || F.ending || F.echAdv || !F.SZ?.byId) return;
  side(rt);
  const id = ORDER.find((k) => F.SZ.byId[k] && F.SZ.byId[k].owner !== 'friend');
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
    const f = ctx.front, P = rt.player.u, W = rt.world;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); u.vel && (u.vel.x = u.vel.z = 0); };
    put(P, f.x, f.z + 14);
    // 場面替えの間に息を整えた（追う間の時が過ぎている）。命を八割五分まで戻す
    if (P.maxHp) P.hp = Math.max(P.hp, P.maxHp * 0.85);
    for (const q of rt.squadGroups || []) for (const u of q.units) if (u.alive) put(u, f.x - 3 + Math.random() * 6, f.z + 17 + Math.random() * 5);
    for (const g of F.echUp || []) {
      for (const u of g.units) if (u.alive) put(u, f.x - 6 + Math.random() * 12, f.z + 18 + Math.random() * 6);
      g.pathIdx = Math.max(0, (g.path?.length || 1) - 1);
    }
    rt.say('組頭', '追いついたぞ。坂の上に殿が踏みとどまっておる！', 3);
  });
}
