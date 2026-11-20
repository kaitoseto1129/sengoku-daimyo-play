// ======================================================================
// 本能寺の変　信長の最後の防衛（12〜14分・docs/oda15_plan_1108.md 32「信長最後の防衛・主人公と信長が近くで戦う・内部へ後退」）
// 御殿の奥へ退く前に：広間で上様と並んで槍を振るう（この戦の一番有名な場面）→ 上様が肘に槍傷を受ける →
// 最後の明智勢を控えの間の口で受ける → 元の「もはやこれまで」（p8）へ。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.p8 を包む。
// ======================================================================
import { k15Freeze, k15Heal, k15Off, k15Go, k15Scenes, k15Live, centerOf } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const p8 = def.p8;
  def.p8 = function (r) {
    const F = r.flags;
    if (F.ending || r.over || !r.player.u.alive) return;
    if (k15Off(r) || F.saigoDone || (F.hp || 0) >= 8) return p8.call(this, r);
    if (F.k15stage === 'saigo') return;
    start(r, K, () => { k15Heal(r); F.saigoDone = true; F.k15on = false; F.k15stage = null; p8.call(this, r); });
  };
}

function start(rt, K, done) {
  const F = rt.flags;
  F.k15stage = 'saigo'; F.k15on = true;
  k15Freeze(rt, 'saigo');   // 前の段の時計を止める
  const stop = () => F.k15stage !== 'saigo' || F.ending || !rt.player.u.alive;
  // 11/18 cloud-06（act bot 3回とも御殿の最後の間で倒れた）：回廊の段と同じく守る長さを 70→45秒に詰め、入る時に命を半ばまで戻す（数と重さは変えない）
  { const u = rt.player.u; if (u.alive && u.hp < u.maxHp * 0.5) u.hp = u.maxHp * 0.5; }
  // 前の口の敵は近習が受け持つ。合流する一息を作り、戸口を通って上様の横へ導く。
  K.pushBack(rt, 6, '小姓', '上様の横へ！　追手は我らが止める！');
  K.holdFoes(rt, rt.player.u.pos, 18, 8);
  // 11/18 クラウドし（act bot 2026-11-17-2236：goten の段 970秒で倒れた。受けた傷は侍277・足軽120で、全部が前の段（控えの間の守り）の
  //   『縁側から来る』『廊下から来る』組＝刃が常の重さのまま）。この段の台本の二波（刃 0.5）と同じ重さに揃え、上様と並ぶ間に斬り殺されないようにする。
  //   毎秒の均し（honnoGm）は g.dmg0 から刃を作り直すので、元の重さ（dmg0）の方を下げる。
  const me = rt.player.u.pos;
  // 11/18 持ち主（act bot 714秒：最後の間で『藤田伝五』の足軽が attack のまま本人のそばの壁の外で6秒動かない）：
  //   御殿の内は台本の二波が相手。流し込まれた一門衆（光忠・藤田・溝尾）の組で本人から十歩より遠い物は、その場で御殿を囲んで構える（兵は消さない）
  for (const g of rt.army.groups || []) {
    if (!g || g.team !== 1 || !/^(明智光忠|藤田伝五|溝尾茂朝)$/.test(g.name || '') || !g.units?.some((u) => u.alive)) continue;
    const c = g.center ? g.center() : g.anchor;
    if (!c || Math.hypot(c.x - me.x, c.z - me.z) <= 10) continue;
    g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.aggro = 3; g.focus = null; g.onArrive = null;
    for (const u of g.units) if (u.alive && u.target && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) > 3) u.target = null;
  }
  for (const g of F.foes || []) {
    if (!g?.units?.some((u) => u.alive)) continue;
    const c = g.center();
    if (Math.hypot(c.x - me.x, c.z - me.z) < 30) { g.dmg0 = Math.min(g.dmg0 ?? g.dmgMult ?? 1, 0.5); g.dmgMult = Math.min(g.dmgMult ?? 1, 0.5); if (g.dmgMultPlayer != null) g.dmgMultPlayer = Math.min(g.dmgMultPlayer, 0.5); }
  }
  // 11/18 09:40 持ち主 クラウド（act bot 0931・0933：戦が964〜1081秒・指示書の本能寺8〜9分）：二つの波の守る長さ 35→28秒（数と重さはそのまま）
  // 11/18 17:20 持ち主 クラウド（act bot 1710：872秒・段5 が183秒）：二つの波 28→22秒（数と重さはそのまま）
  // 11/20 クラウドし K438「『上様の横』のピンが一か所に固定されている。上様に付いて動く」：行き先は関数でも渡せ、毎回の今の点で道を引く
  const route = (goal0) => {
    let nextScan = -1;
    const pt = typeof goal0 === 'function' ? goal0 : () => goal0;
    let goal = pt();
    return {
      limit: 20,   // 11/18 クラウド（本能寺の持ち主・長さ）：最後の間の段が232秒。歩く上限 60→35→20（御殿の内の短い道）・守る 45→35秒
      guide: () => {
        if (rt.t >= nextScan) { nextScan = rt.t + 0.5; goal = pt(); K.guardGuide(rt, goal); }
        return F.guardGuide;
      },
      canArrive: () => { goal = pt(); return K.guardClear(rt, goal.x, goal.z); },
    };
  };
  const hiroma = PT.hiroma, hikae = PT.hikae;
  // 広間が既に燃えていれば、控えの間で受ける。火の中へ戻る任務にしない。
  const post = F.heatZone ? hikae : hiroma, place = F.heatZone ? '控えの間' : '広間';
  K.nbSet(rt, 'E', { at: { ...post } });
  // 上様が生きて御殿の内にいる間は、上様の今の居場所を「上様の横」にする（持ち場から十二歩より離れたら持ち場の点）
  const nbAt = () => { const u = F.nb; return u?.alive && u.pos && Math.hypot(u.pos.x - post.x, u.pos.z - post.z) < 12 ? { x: u.pos.x, z: u.pos.z } : post; };
  rt.banner('上様と並んで', `小袖の信長が、自ら槍を取って${place}に立つ`);
  k15Scenes(rt, [
    [1, () => K.say(rt, '織田信長', 'そこの者、わしの横に付け。一人も奥へ通すな', 4)],
  ], () => k15Go(rt, 'sg-hiroma', nbAt, 4, `${place}で、上様の横に付け`, '上様の横', () => {
    // 東壁へ斜めに突っ込まず、北の廊下と襖の開口から座敷へ入る。
    const entryX = F.heatZone ? -62 : -54;
    // 11/19 クラウドし K380（要件書26「御殿内部でも敵が入ってくる。廊下・襖・煙・炎。明智兵が一人・二人ずつ入る」）：
    //   五人を一度に流し込まず、廊下の口から煙と共に二人・一人・二人と三秒半おきに入れる（数と重さはそのまま）
    K.say(rt, '森蘭丸', `${place}へ来るぞ！　上様をお守りせよ！`, 3);
    trickle(rt, K, '御殿へ踏み込む明智勢', [[-52, 81.8], [entryX, 82.2], [entryX, 86], [entryX, 89], [post.x, post.z]],
      [[K.uS(1), K.uA(1)], [K.uA(1)], [K.uS(1), K.uA(1)]], `${place}の明智勢`, { sec: 22, reward: `${place}で上様と並んで戦った` }, stop,
      (g, i) => { if (i) return; const lead = g.units.find((u) => u.alive && u.type === 'samurai'); if (lead) { lead.name = '安田作兵衛'; lead.nameOpen = true; } },   // 寄せ手の頭は安田作兵衛（蘭丸を討ったと伝わる明智の侍）
      () => k15Scenes(rt, [
      [1, () => { rt.banner('上様、肘に傷', '明智の槍が、信長の肘を裂いた'); sfx('hit', 0.6); }],
      [3, () => K.say(rt, '織田信長', '……かすり傷じゃ。蘭丸、控えの間を固めよ', 4)],
      [4, () => K.say(rt, '森蘭丸', '上様を奥へ！　最後の口は、我らが守る！', 3.5)],
    ], () => {
      K.nbSet(rt, 'E', { at: { ...hikae } });
      k15Go(rt, 'sg-hikae', hikae, 4, '控えの間の口で、最後の明智勢を受けよ', '控えの間の口', () => {
      trickle(rt, K, '奥へ迫る明智勢', [[-52, 81.8], [-62, 82.2], [-62, 86], [hikae.x + 2, hikae.z]],
        [[K.uS(1), K.uA(1)], [K.uA(2)], [K.uS(1), K.uA(1)]], '奥へ迫る明智勢', { sec: 22, reward: '控えの間の口で最後の明智勢を受けた' }, stop, null, () => k15Scenes(rt, [
        [1, () => K.say(rt, '小姓', '火が奥まで来た！', 3)],
        [3, () => {}],
      ], done, stop));
      }, route(hikae));
    }, stop));
  }, route(nbAt)), stop);
}

// 11/19 クラウドし K380 要件書26：明智兵を廊下の口から一人・二人ずつ入れ、入れた全部を一つの敵として数える（k15Track と同じ終わり方）。
//   akechi が枠待ちで後から出した組も、同じ名で拾って数える。
function trickle(rt, K, name, path, packs, label, o, stop, onPack, done) {
  const F = rt.flags, t0 = rt.t, gap = 3.5;
  const before = new Set(rt.army.groups || []);
  const N0 = packs.reduce((n, l) => n + l.reduce((v, q) => v + q.n, 0), 0);
  let sent = 0, seen = 0, over = false;
  const groups = () => (rt.army.groups || []).filter((g) => g && g.name === name && g.team === 1 && !before.has(g));
  const send = () => {
    if (over || stop() || sent >= packs.length) return;
    const i = sent++;
    const [x, z] = path[1] || path[0];
    rt.world.gunSmoke?.(x, z, 0x3e3a36);   // 襖の口から煙と共に
    K.akechi(rt, name, path, packs[i], { entered: true, followPath: true, player: true, dmg: 0.5 });
    if (sent < packs.length) rt.after(gap, send, true);
  };
  send();
  F.k15fight = true;
  const tick = () => {
    if (over || rt.over || F.ending || rt.player.u.alive === false) return;
    const gs = groups();
    for (; seen < gs.length; seen++) onPack?.(gs[seen], seen);
    const g = gs[gs.length - 1];
    if (g) rt.marker('k15foe', centerOf(g), label, { red: true, group: g });
    const live = k15Live(gs), unsent = packs.slice(sent).reduce((n, l) => n + l.reduce((v, q) => v + q.n, 0), 0);
    rt.objProgress('main', `${label} ${Math.min(N0, live + unsent)}／${N0}`);
    if ((sent >= packs.length && rt.t - t0 > 1 && live <= 1) || rt.t - t0 > (o.sec || 90)) {
      over = true;
      for (const q of gs) for (const u of [...q.units]) if (u.alive && !u.gone) rt.army.despawn(u);
      rt.unmark('k15foe'); F.k15fight = false;
      if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward);
      done?.();
      return;
    }
    rt.after(0.5, tick, true);
  };
  rt.after(1, tick, true);
}
