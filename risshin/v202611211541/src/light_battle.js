// 軽い型の戦（K563・12月頭に武田編・上杉編を15戦ずつ出すための型。11/21 クラウド k365-cloud-42）
//   一つの戦を「地形の丘と川・味方の組・段の並び（rest / move / fight / hold）・勝ち負けの言葉」の表だけで書く。
//   段の動き・印・右上の札・bot は今の共通の部品（b_depth.js・bhelp.js・stages.js）をそのまま使う。新しい動きは足さない。
//   使い方：export const u01_fuse = lightBattle({ id: 'u01_fuse', ... })（prototype/src/b_u01_fuse.js を手本に）
import { allyGroup, nm } from './bhelp.js';
import { RANKS } from './state.js';
import { depthStart, depthTick, depthBot, depthJump, rest, fight, hold, move } from './b_depth.js';
import { setStages, dress, uS, uA, uG, uB } from './b_k_help.js';
import { distToPolyline } from './world.js';

export { uS, uA, uG, uB };
export const busho = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, horse: true, invuln: true, mustLive: true, ...o } });

// 丘（[x, z, 半径, 高さ]）を足し合わせた地面。川は低く削る
function heightFn(W) {
  const hills = W.hills || [], river = W.river, rw = (W.riverW || 10) * 0.5 + 6;
  return (x, z) => {
    let h = 0;
    for (const [hx, hz, r, hh] of hills) { const d2 = ((x - hx) ** 2 + (z - hz) ** 2) / (r * r); if (d2 < 9) h += hh * Math.exp(-d2); }
    if (river) { const d = distToPolyline(x, z, river); if (d < rw) h -= 1.4 * (1 - d / rw); }
    return h;
  };
}

// 本人の十八歩内の名の無い敵を、本人へ打ちかかる者が五人になるまで（11/21 前半六戦で討ち取りが1〜4人だったので十四歩・四人から広げた）本人へ向ける（半秒ごと・同じ高さ・塀を挟まない）。
//   元和天下返し（k16PullToPlayer）で効いた形。味方の先手が先に討ち切り、本人の前に相手が残らないのを防ぐ。敵の数と強さは変えない
function pullToPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._lbPullT = (F._lbPullT || 0) - dt) > 0 || F.ending) return;
  F._lbPullT = 0.5;
  const P = rt.player.u;
  if (!P?.alive || P.hp < P.maxHp * 0.5) return;
  // 崩れた隊の名の無い兵は本人から外して背を向けさせる（act bot「崩れた部隊が、また戦っている」・塩崎と八幡原）。
  //   本人へ打ちかかる名の無い兵は七人まで（塩崎で十人を超え、本人が避けて退いてばかりで討ち取りが0〜4だった・11/21 の POSLOG）
  let on = 0; const cand = [], onP = [];
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team === P.team || u.fleeing || u.isStruct || u.civ) continue;
    if (u.group?.routed && !u.name && !u.isTaisho) { if (u.target === P) u.target = null; u.fleeing = true; continue; }
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (u.target === P && !u.name) onP.push([d, u]);
    if (d > 18 || Math.abs((u.pos.y || 0) - (P.pos.y || 0)) > 4) continue;   // 山の裾の受け（生野山）で上から来る敵を外さない
    if (u.target === P) { on++; continue; }
    if (!u.name && u.type !== 'gun' && u.type !== 'bow') cand.push([d, u]);
  }
  if (onP.length > 7) { onP.sort((a, b) => a[0] - b[0]); for (const [, u] of onP.slice(7)) { u.target = null; u.aiT = 2; } }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, u] of cand) {
    if (on >= 5) break;
    if (rt.army.wallBetween?.(u.pos, u.team, P.pos)) continue;
    u.target = P; u.aiT = 1.5; u.moveTo = null; on++;
  }
}

// 受けの段の厚み（13・08 の気づき：受けの段で本人の討ち取りが少なく、戦が150〜240秒で終わった）。
//   受けの段には、最後の寄せの三十秒後に「三の手」（一の手と同じ数）を本人の持ち場のすぐ前から足す。受けの段は95秒より短くしない。
//   戦の表に thick: true と書いた戦だけ（u01〜u08）。u09〜u15 は段ごとに自分で厚みを書いてあるので二重に掛けない（11/21 合わせた後の act で討ち取り2〜3に落ちた）
//   後詰の無い激突の段には、四十五秒目に一の手の六割の新手を足す（thin: true の段は足さない）。継ぎ足し（refill）は使わない
function thickWaves(s) {
  const W = (s.waves || []).slice();
  if (s.thin || !W.length) return W;
  const last = W.reduce((a, w) => Math.max(a, w.t || 0), 0), f0 = W[0].foes?.[0];
  if (!f0) return W;
  W.push({ t: last + 30, say: ['組頭', 'まだ来る！　持ち場を離れるな！'],
    foes: [{ ...f0, name: f0.name.replace(/(の)?(一の手|新手|二の手)?$/, '') + 'の三の手', from: { x: s.at.x + 6, z: s.at.z + 26 } }] });
  return W;
}
function thickLater(s) {
  const f0 = s.foes[0], list = f0.list.map((u) => (u.n > 2 ? { ...u, n: Math.max(2, Math.round(u.n * 0.6)) } : u));
  return { t: 45, say: ['組頭', '新手が来るぞ！　構えよ！'], foes: () => [{ ...f0, name: f0.name + 'の新手', list, from: { x: s.at.x - 18, z: s.at.z + 20 } }] };
}

export function lightBattle(S) {
  const GOALS = S.steps.filter((s) => s.kind !== 'rest').map((s) => s.obj);
  setStages(S.id, GOALS.map((t, i) => [t, i]));
  const height = heightFn(S.world || {});
  const foeLook = S.foeLook || {}, allyLook = S.allyLook || {};
  const ctxOf = (rt) => ({
    faction: S.sides.b.faction, flag: foeLook.flag, armor: foeLook.armor, look: (list) => dress(list, foeLook),
    dmg: S.foeDmg ?? 0.6, scale: 1, backing: false, fixedSpawn: true,
    // 11/21 cloud-41（武田編・08 の野田城でも討ち取り0〜5）：段の始めに sendFriends が味方の組を全部攻めに出し、本人より先に敵を討ち切っていた。
    //   S.friendsSend（数）を書いた戦は、本人に近い順にその数の組だけを出す（書かない戦は今まで通り全部）
    friends: () => {
      const L = (rt.flags.allies || []).filter((g) => g && g.count && !g.routed);
      if (!(S.friendsSend >= 0)) return L;
      const P = rt.player?.u?.pos; if (!P) return L.slice(0, S.friendsSend);
      return L.map((g) => { const c = g.center(); return [c ? Math.hypot(c.x - P.x, c.z - P.z) : 1e9, g]; }).sort((a, b) => a[0] - b[0]).slice(0, S.friendsSend).map((q) => q[1]);
    },
  });
  // 段の表 → 共通の段の形。fight と hold と move を数えて F.step を進める（右上の札の行と同じ番号）
  const stepsOf = (rt) => {
    const F = rt.flags; let k = 0;
    return S.steps.map((s) => {
      const say = (s.say || []).map(([w, t, d]) => [w === '本人' ? (r) => nm(r) : w, t, d]);
      if (s.kind === 'rest') return rest({ dur: s.dur || 12, heal: s.heal ?? 0.35, say, banner: s.banner });
      const n = ++k, done = () => { F.step = n; };
      const foes = () => (s.foes || []).map((f) => ({ mass: 100, ...f, list: f.list }));
      const later = (s.later || []).map((w) => ({ ...w, foes: () => w.foes }));
      if (s.kind === 'move') return move({ to: s.at, label: s.label, obj: s.obj, r: s.r || 10, say, max: s.max || 120, ambush: s.ambush && { ...s.ambush, foes: () => s.ambush.foes }, onEnd: done });
      if (s.kind === 'hold') return hold({ at: s.at, label: s.label, obj: s.obj, r: s.r || 16, dur: S.thick ? Math.max(s.dur || 75, 95) : s.dur || 75, say, title: s.title, sub: s.sub, waves: (S.thick ? thickWaves(s) : s.waves || []).map((w) => ({ ...w, foes: () => w.foes })), noRefill: true, reward: s.reward, onEnd: done });   // 寄せた敵が尽きたら次へ（共通の継ぎ足しで本人の討ち取りを待つと、犀川の受けの段が377秒に延びた）
      if (S.thick && !s.later && !s.thin && s.foes?.length) later.push(thickLater(s));
      return fight({ at: s.at, obj: s.obj, title: s.title, sub: s.sub, say, foes, later, max: s.max || 150, ...(s.limit != null ? { limit: s.limit } : {}), noRefill: true, reward: s.reward, onEnd: done });   // limit：段の上限の秒（11/21 cloud-41・倒れない大将の段が七分まで延びた。渡していなかった）
    });
  };
  const def = {
    spawn: { x: S.spawn.x, z: S.spawn.z, heading: S.spawn.heading || 0 },
    noReserve: true, noFrontFill: true, frontlineDensity: false, noTaishoRaid: true,
    stageGoalsOnly: true, goalsAllRows: true, keepTaskPanel: true, goalSignTriangle: true,
    missions: GOALS,
    missionOf(rt) { return Math.max(0, Math.min(GOALS.length - 1, rt.flags.step || 0)); },
    playerTaken: S.playerTaken ?? 0.6,
    minutes: S.minutes || 6,
    introText: () => S.intro,
    date: () => S.date,
    sides: S.sides,
    history: S.history,
    world: {
      noFake: true, seed: S.world?.seed || 1, time: S.world?.time || 'day', fogFar: S.world?.fogFar || 420, clearAirFar: S.world?.fogFar || 420,
      height, autumn: S.world?.autumn, winter: S.world?.winter,
      // 11/21 K365 クラウド34（docs/weather_takeda_uesugi.md）：史実の天気を軽い型の戦でも書けるように。書かない戦は前と同じ
      ...Object.fromEntries(['snow', 'overcast', 'wetStart', 'mist', 'marchMist', 'marchMistFar', 'sunRiseRate', 'sunDriftRate', 'lightning'].filter((k) => S.world?.[k] !== undefined).map((k) => [k, S.world[k]])),
      ...(S.world?.sky || {}),   // 天気（docs/weather_takeda_uesugi.md の def の値：mist・overcast・snow・marchMist など）
      streams: S.world?.river ? [{ pts: S.world.river, w: S.world.riverW || 10, depth: S.world.riverDepth ?? 0.6 }] : [],
      waterSlow: true,
      // 11/21 cloud-19（K563 武田編の地形・標高の asset が来るまで）：戦ごとの森（groves）と道（paths）を手書きで足せるように。書かない戦は前と同じ
      ...(S.world?.groves ? { groves: S.world.groves } : {}), ...(S.world?.paths ? { paths: S.world.paths } : {}),
      trees: S.world?.trees ?? 500, tufts: S.world?.tufts ?? 1800,
      treeDensity: (x, z) => (S.world?.river && distToPolyline(x, z, S.world.river) < 18 ? 0 : height(x, z) > 6 ? 1.4 : 0.15),
      clear: (x, z) => Math.hypot(x - S.spawn.x, z - S.spawn.z) < 20 || S.steps.some((s) => s.at && Math.hypot(x - s.at.x, z - s.at.z) < 26),
    },
    checkpointStep(rt) { const D = rt.flags.dp; return D && D.on ? D.i : -1; },
    resumeSteps: S.steps.map((_, i) => [i + 1, function (rt) { depthJump(rt, i + 1); }]),
    setup(rt) {
      const F = rt.flags;
      F.step = 0; F.ending = false;
      if (S.world?.rain && rt.world.setRainTarget) { rt.world.setRainTarget(S.world.rain); rt.world.rainLevel = S.world.rain; }   // 雨の戦は始めから降らせる（0〜1）
      F.allies = (S.allies || []).map((a) => allyGroup(rt, { name: a.name, flag: a.flag || allyLook.flag, anchor: { ...a.at }, facing: a.face || 0, fullStrength: true, noRout: true, aggro: 12, morale: 95, dmgMult: a.dmg ?? S.allyDmg ?? 0.4, fixed: !!a.fixed, noAI: !!a.fixed, order: 'hold' },
        dress(a.list, allyLook)));
      const n = RANKS[rt.G.rank]?.squad;
      if (n) rt.makeSquad({ x: S.spawn.x + 2, z: S.spawn.z - 4 }, S.spawn.heading || 0, [{ kind: 'spear', n }]);
      depthStart(rt, ctxOf(rt), stepsOf(rt), () => def.win(rt));
    },
    update(rt, dt) { depthTick(rt, dt); pullToPlayer(rt, dt); S.update?.(rt, dt); },   // S.update：戦ごとの足し（11/21 cloud-07・u12）
    win(rt) {
      const F = rt.flags;
      if (F.ending) return;
      F.ending = true;
      rt.setPhase?.('end');
      rt.objDone('main');
      rt.tracker.main = true;
      rt.player.u.invuln = true;
      rt.award((t) => { t.main = true; t.special = { label: S.win.award, pts: 20 }; }, S.win.award);
      rt.banner(S.win.banner, S.win.sub || '');
      let d = 1.2;
      for (const [w, t, dur] of S.win.say || []) { rt.after(d, () => rt.say(w === '本人' ? nm(rt) : w, t, dur || 3.4)); d += (dur || 3.4) + 0.4; }
      // 締めの台詞を聞く間をとる（ほかの戦の締めと同じ三十秒前後。短いと結果を読む前に戦が片付く＝bot の数が取れなかった）
      rt.finish({ scriptedEnd: true }, Math.max(d + 6, 26));
    },
    lose(rt, why) {
      const F = rt.flags;
      if (F.ending) return;
      F.ending = true;
      rt.tracker.main = false;
      rt.finish({ failureReason: why }, 6);
    },
  };
  def.botBrain = (b, inp, { goTo }) => {
    inp.quickCmd = null;
    if (!b.player.u.alive || b.flags.ending) return;
    depthBot(b, inp, goTo);
  };
  def.force = (rt) => {
    const F = rt.flags, st = Math.min(GOALS.length, F.step || 0) / Math.max(1, GOALS.length);
    return { a: S.force.a, a0: S.force.a, b: Math.round(S.force.b * (1 - 0.5 * st)), b0: S.force.b };
  };
  return def;
}
