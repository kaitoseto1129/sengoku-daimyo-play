// ======================================================================
// 姉川の戦い　終わりの段「野村への追い討ち」（12〜15分。docs/oda15_plan_1108.md の 9）
// - 北岸の殿を崩した後、すぐに勝ちにせず、野村の浅井本陣へ追い討つ（大規模追撃）。長政の本陣は小谷の方へ退いていく。
// - 追う途中、浅井の遠藤直経（喜右衛門）が首を提げて味方に紛れ、信長の本陣を狙う（姉川の名高い話）。主人公が止める。
//   味方が討った時も、主人公がその場まで進んで止めた事を確かめる。
// - 済んだら本の締め（anegawa.ending：法螺貝・横山城の戦後）へ渡す。余韻は削らない。
// ======================================================================
import { sfx } from '../audio.js';

export const MISSIONS = ['野村の浅井本陣へ追い討て', '信長の首を狙う遠藤直経を止めよ'];

// ctx：{ enemyGroup, allyGroup, dress, AZAI, AZAI_FLEE, ending(), HQ, nomura }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.aneTsui) return;
  // 二の手の跡を本陣と呼ばず、布陣と同じ野村の本陣まで追う。
  const DEST = ctx.nomura;
  const S = F.aneTsui = { k: 0, t0: rt.t, done: false, at: DEST };
  const live = () => !F.ending && !rt.over && rt.player?.u?.alive;
  rt.marker('aneNomura', DEST, '野村');
  // 段が破られた時に備えた追い手も野村まで同行し、本人だけを先へ行かせない。
  for (const g of [F.mori, F.shibata, F.inaba, F.kino, F.vanguard, F.chase]) if (g && g.count && !g.routed && g.order !== 'retreat' && g.order !== 'flee') {
    g.order = 'move'; g.dest = { x: DEST.x + (Math.random() - 0.5) * 20, z: DEST.z + 8 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; };
  }
  // 浅井の後ろの手は崩れて北西（小谷）へ。長政の本陣も旗を巻いて退く
  try {
    F.azDA?.[0]?.m.rout?.({ hideAfter: 30 });
    F.azDA?.[2]?.m.rout?.({ hideAfter: 30 });
    F.azDA?.[1]?.m.moveTo(-60, -205, 70);
  } catch (e) { /* 遠景が無くても進む */ }
  try { sfx('horagai', 0.8); } catch (e) { /* 音が無くても進む */ }
  rt.say('森可成', '浅井は総崩れじゃ！　野村の長政の本陣まで追い討て！', 4);
  rt.after(9, () => live() && !S.done && rt.say('足軽', '長政の馬印が退いていくぞ！　小谷の方じゃ！', 3));

  function endo() {
    if (S.k !== 0.5 || S.done || !live()) return;
    // 空の隊で「遠藤を止めた」と果たさない。七人の枠が空いてから出す。
    if (!ctx.canDeploy(7)) { rt.after(1, endo); return; }
    S.k = 1; S.endoT = rt.t;
    rt.unmark('aneNomura');
    const p = rt.player.u.pos;
    const from = { x: p.x - 26, z: p.z - 18 };
    const g = ctx.enemyGroup(rt, { faction: 'azai', name: '遠藤直経の手', anchor: from, facing: Math.PI, fleeDir: ctx.AZAI_FLEE, aggro: 8, width: 8, morale: 100, noRout: true, speed: 3.6 },
      ctx.dress([{ type: 'busho', n: 1, o: { name: '遠藤直経', hat: 'kabuto', haori: 0 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }], ctx.AZAI));
    S.g = g; S.u = g.units.find((u) => u.name === '遠藤直経') || g.units[0];
    // 首を提げて南の本陣へ紛れ込む
    g.order = 'move'; g.dest = { x: ctx.HQ.x, z: ctx.HQ.z - 16 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
    rt.marker('aneEndo', () => (S.u?.alive ? { x: S.u.pos.x, z: S.u.pos.z } : null), '遠藤直経', { red: true, group: g });
    rt.say('竹中久作', 'あれは遠藤喜右衛門！　首を提げて味方に紛れ、殿の本陣を狙う気じゃ！', 4);
    rt.after(4.5, () => live() && !S.done && rt.say('森可成', '討て！　本陣へ行かすな！', 2.6));
    try { sfx('taiko', 1); } catch (e) { /* 音が無くても進む */ }
  }

  S.tick = () => {
    if (S.done || !live()) return;
    const p = rt.player.u.pos;
    if (S.k === 0 && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 12) {
      rt.award((t) => t.side.push('野村の浅井本陣まで追い討った'), '野村まで追い討った', DEST);
      rt.say('組頭', '本陣はもぬけの殻じゃ。長政は小谷へ逃げたか……', 3.5);
      rt.after(5, () => endo());
      S.k = 0.5;
    }
    if (S.k === 1) {
      // 時計で遠藤を討たず、実際の戦闘を待つ。遠い味方の討ち取りだけで勝ちにしない。
      if (S.u && !S.u.alive && Math.hypot(p.x - S.u.pos.x, p.z - S.u.pos.z) < 12) return close();
    }
  };

  function close() {
    if (S.done) return;
    S.done = true; S.k = 2;
    rt.unmark('aneEndo');
    if (S.g && !S.g.routed) { S.g.noRout = false; S.g.morale = 0; S.g.order = 'retreat'; }
    rt.award((t) => { t.side.push('遠藤直経を止めた'); t.special = { label: '遠藤直経を止めた', pts: 15 }; }, '遠藤直経を止めた');
    rt.say('竹中久作', '遠藤喜右衛門、ここに果てたり！', 3.6);
    rt.after(4, () => live() && rt.say('森可成', '浅井は小谷へ退いた。追い討ちはここまでじゃ', 3.4));
    rt.after(8, () => live() && ctx.ending());
  }
}

export function stageOf(rt) {
  const S = rt.flags.aneTsui;
  if (!S) return null;
  return S.k >= 1 ? 1 : 0;
}

export function pin(rt, q) {
  const S = rt.flags.aneTsui;
  if (!S || S.done) return undefined;
  if (S.k >= 1 && S.u?.alive) { q.unit = S.u; q.enemy = true; q.x = S.u.pos.x; q.z = S.u.pos.z; q.r = q.hide = 2; return q; }
  if (S.k >= 1 && S.u) { q.x = S.u.pos.x; q.z = S.u.pos.z; q.r = q.hide = 8; return q; }
  if (S.k < 1) { q.x = S.at.x; q.z = S.at.z; q.r = 8; q.hide = 8; return q; }
  return undefined;
}

// bot：野村へ進み、遠藤直経へ向かう。返り値 true で動きを決めた
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.aneTsui;
  if (!S || S.done) return !!S;
  const u = p.u;
  if (S.k >= 1 && S.u && !S.u.alive) { goTo(p, inp, S.u.pos.x, S.u.pos.z, 8); return true; }
  if (S.k >= 1 && S.u?.alive) {
    const e = S.u, d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀へ持ち替えても、届かない二メートルで止まらない。
    const approach = (p.weapon === 'sword' ? 1.9 : 2.8) * 0.85;
    if (d > approach) goTo(p, inp, e.pos.x, e.pos.z, approach);
    else strike(p, inp, e, d);
    return true;
  }
  if (S.k === 0) { goTo(p, inp, S.at.x, S.at.z, 4); return true; }
  return true;
}
