// ======================================================================
// 山崎の戦い　序「備中の本陣と中国大返し」（docs/yamazaki_spec_1109.md。操作できる三〜四分）
//   本能寺の終わり（伝令が西へ）からつなぐ。山崎の布陣からは始めない。
//   幕0 備中高松の羽柴本陣（夜・戦なし）：伝令の馬が駆け込み、急報が官兵衛から秀吉へ。皆すぐは喋らない。秀吉「戻るぞ。」→「第二章 豊臣編」
//   幕1 備中（夜・小雨）：陣を畳む本陣の脇で、遅れた足軽の組をまとめて街道の口へ。遠くに毛利の旗（講和。背の緊張）
//   幕2 姫路（朝）：城下で兵糧を受け取り、新手を連れる。秀吉が騎馬で隊列の横を通る
//   幕3 播磨〜摂津（雨の夜・泥・松明）：合流の地へ急ぐ。明智の物見が道へ出る（小さな妨害だけ）
//   その後、山崎の手前（本筋の①）へ：諸将の旗が増え、走っていた軍が戦う軍勢になる。
//   日数は出さない。場面の変わり目は暗転と短い見出しだけ。山崎の兵（本物）はこの段が済んでから並べる（ctx.deploy）。
// 場所は山崎の地図の南の端（z 120〜170）を使い回し、時刻・雨・置き物で場面を分ける（遊びのための場面転換）。
// ======================================================================
import { allyGroup, enemyGroup } from '../bhelp.js';
import { nobori, tawara, kagaribi } from '../props.js';
import { report } from './far.js';

// 幕ごとの始まりの所と行き先（heading π＝北向き）
export const SCENE = [null,
  { at: { x: -30, z: 136, heading: Math.PI }, pins: [{ x: -80, z: 156 }, { x: -6, z: 164 }] },
  { at: { x: 66, z: 164, heading: Math.PI }, pins: [{ x: 84, z: 128 }, { x: 40, z: 104 }] },
  { at: { x: -74, z: 150, heading: Math.PI / 2 }, pins: [{ x: 22, z: 136 }] },
];
export const TEXT = ['', '備中で遅れた足軽の組をまとめ、街道の口へ急ぐ', '姫路の城下で兵糧を受け取り、新手を連れる', '雨の街道を進み、摂津の合流地点へ急ぐ'];
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

// 置き物（setup で一度だけ）：備中の本陣の篝火・毛利の旗・姫路の兵糧の俵
export function props(rt) {
  const W = rt.world, list = rt.flags.proProps = [];
  const add = (object) => { list.push(object); rt.scene.add(object); };
  try { for (const [x, z] of [[-44, 126], [-24, 126], [-50, 106], [-18, 106]]) add(kagaribi(W, x, z)); } catch (e) { /* 篝火なしでも進む */ }
  // 遠くの毛利の旗（講和したが、まだそこにいる。背の緊張）
  for (const [x, z] of [[-150, 176], [-142, 188], [-156, 164]]) add(nobori(W, x, z, 'mori'));
  try { for (const [x, z, r] of [[88, 124, 0.3], [92, 130, 1.2], [80, 122, 2.1]]) add(tawara(W, x, z, r, 6)); } catch (e) { /* 俵なしでも進む */ }
}

// 主人公・自分の組・連れた隊をまとめて場面の始まりへ移す（暗転の間）
function warp(rt, at, groups) {
  const W = rt.world, P = rt.player.u;
  const place = (u, x, z) => { u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; if (u.vel) u.vel.x = u.vel.z = 0; };
  place(P, at.x, at.z);
  if (at.heading !== undefined) { P.heading = at.heading; rt.player.yaw = at.heading; }
  let k = 0;
  for (const g of [...(rt.squadGroups || []), ...groups]) {
    if (!g) continue;
    let i = 0;
    for (const u of g.units) if (u.alive && !u.gone && u !== P) { place(u, at.x - 4 + (i % 4) * 1.6, at.z + 4 + k * 3 + Math.floor(i / 4) * 1.6); i++; }
    if (g.anchor) { g.anchor.x = at.x; g.anchor.z = at.z + 4 + k * 3; }
    g.dest = null; g.onArrive = null; g.path = null;
    k += Math.ceil(i / 4) + 1;
  }
  try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
}
function follow(rt, g) {
  if (!g) return;
  const P = rt.player.u.pos;
  g.order = 'move'; g.dest = { x: P.x + 3, z: P.z + 4 }; g.onArrive = null; g.speed = 4.6;
}

// 同じ幕をやり直しても、前の幕の声や兵の追加を持ち越さない。
function after(rt, sec, fn) {
  const F = rt.flags, pro = F.pro, order = F.proOrder;
  rt.after(sec, () => {
    if (rt.flags !== F || F.pro !== pro || F.proOrder !== order || F.stage || F.proWarp || F.ending || rt.over || rt.retryOpen || !rt.player.u.alive) return;
    fn();
  });
}

// 幕0＋幕1：備中の本陣（setup の後に呼ぶ）
export function start(rt, ctx, cine = true) {
  const F = rt.flags;
  F.proOrder = (F.proOrder || 0) + 1;
  F.pro = 1; F.oStep = 0; F.proT0 = rt.t; F.holdPlayer = cine;
  rt.world.dayClock = null; rt.world.setTime('night', true);
  if (rt.world.setRainTarget) { rt.world.setRainTarget(0.15); rt.world.rainLevel = 0.15; }
  warp(rt, SCENE[1].at, [F.ikeda]);
  // 本陣の人々（秀吉・秀長・官兵衛・蜂須賀・宮部と使番）。動かず、討てない
  F.proHon = allyGroup(rt, { name: '羽柴の本陣', anchor: { x: -34, z: 120 }, facing: 0, width: 8, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
    ctx.fl([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true } },
      { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, flag: ctx.KU } }, { type: 'busho', n: 1, o: { name: '蜂須賀正勝', invuln: true } },
      { type: 'busho', n: 1, o: { name: '宮部継潤', invuln: true } }, { type: 'samurai', n: 4, o: { keep: true } }], ctx.HA));
  for (const u of F.proHon.units) { u.invuln = true; u.noTarget = true; }
  // 疲れ切った伝令の馬（南の街道から本陣へ）
  F.rider = allyGroup(rt, { name: '京よりの伝令', anchor: { x: -14, z: 168 }, facing: 0, width: 2, formation: 'column', noRout: true, fullStrength: true, aggro: 0, seekRange: 0, speed: 5 },
    ctx.fl([{ type: 'samurai', n: 1, o: { name: '伝令', horse: true, invuln: true } }], ctx.HA));
  F.rider.order = 'move'; F.rider.dest = { x: -30, z: 126 }; F.rider.onArrive = (g) => { g.order = 'hold'; };
  if (!cine) return;
  rt.banner('備中高松　羽柴の本陣', '天正十年六月三日の夜');
  after(rt, 2, () => rt.say('使番', '道を開けよ！　京よりの急ぎの使いじゃ！', 2.8));
  after(rt, 6, () => rt.say('伝令', '……京にて、上様ご生害。明智日向守の謀反にござる', 3.6));
  after(rt, 10.5, () => rt.say('羽柴秀吉', '…………', 2.6));
  after(rt, 14, () => rt.say('黒田官兵衛', '毛利との和を今夜のうちに結べば、背は空きまする。日向は京。時がござらぬ', 4));
  after(rt, 18.5, () => rt.say('羽柴秀吉', '戻るぞ。', 2.4));
  after(rt, 21, () => {
    rt.army.play('horagai', { x: -34, z: 120 }, 1.0);
    rt.banner('第二章　豊臣編', '中国大返し');
  });
  after(rt, 25, () => {
    F.holdPlayer = false; F.oStep = 1;
    rt.obj('main', TEXT[1], 'main');
    rt.say('蜂須賀正勝', '陣を畳め！　兵糧を積め！　馬の支度じゃ！', 3);
    // 本陣も動き出す（秀吉は騎馬で先へ。ずっと横にはいない）
    if (F.proHon) { F.proHon.fixed = false; F.proHon.order = 'move'; F.proHon.dest = { x: 10, z: 166 }; F.proHon.speed = 3.2; }
    // 遅れた足軽の組（槍を杖に座り込む）
    F.tired = allyGroup(rt, { name: '遅れた足軽の組', anchor: { ...SCENE[1].pins[0] }, facing: 0.6, width: 6, formation: 'line', aggro: 4, seekRange: 8, morale: 70, noRout: true, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], ctx.HA));
  });
  after(rt, 33, () => rt.say('足軽', '毛利は……後ろから攻めては来ぬのか？', 3));
  after(rt, 37, () => rt.say('羽柴秀長', '和は結んだ。振り返るな。前だけを見よ', 3));
}

function scene(rt, ctx, n) {
  const F = rt.flags;
  F.proOrder = (F.proOrder || 0) + 1;
  F.pro = n; F.oStep = 1; F.proT0 = rt.t;
  rt.obj('main', TEXT[n], 'main');
  if (n === 2) {
    rt.world.dayClock = null; rt.world.setTime('morning', true);
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0); rt.world.rainLevel = 0; }
    warp(rt, SCENE[2].at, [F.ikeda, F.tired]);
    rt.banner('姫路', '備中から駆け通して、城下で一息つく間もない');
    F.newG = allyGroup(rt, { name: '姫路の新手', anchor: { ...SCENE[2].pins[0] }, facing: Math.PI, width: 8, formation: 'line', aggro: 4, seekRange: 8, morale: 90, noRout: true, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'samurai', n: 2 }], ctx.HA));
    after(rt, 3, () => rt.say('足軽', '足が……もう棒のようじゃ', 2.8));
    after(rt, 8, () => report(rt, '城の蔵の米と銀、皆に配れとの仰せにござる！'));
  } else if (n === 3) {
    rt.world.dayClock = null; rt.world.setTime('night', true);
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0.7); rt.world.rainLevel = 0.7; }
    if (rt.world.wetness !== undefined) rt.world.wetness = 1;
    warp(rt, SCENE[3].at, [F.ikeda, F.tired, F.newG]);
    rt.banner('播磨から摂津へ', '雨の夜も、松明を掲げて歩き続ける');
    after(rt, 4, () => rt.say('足軽', 'まだ行くのか……', 2.4));
    after(rt, 7, () => rt.say('使番', '京まで止まらんぞ！　遅れるな！', 2.8));
    after(rt, 16, () => report(rt, '摂津の中川様・高山様、こちらに付くとの返事にござる！'));
  }
}

export function tick(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos;
  if (!rt.player.u.alive || rt.retryOpen) return;
  // 暗転中に討たれても、予約処理で次の地へ移さない。生存中の時間だけ進める。
  if (F.proWarp) {
    F.proWarpT -= dt;
    if (F.proWarpT <= 0) {
      const n = F.proNext;
      F.proWarp = false;
      rt.scene.visible = true;
      if (n <= 3) scene(rt, ctx, n);
      else ctx.toYamazaki();
    }
    return;
  }
  if (F.oStep === 0) return;
  const el = rt.t - F.proT0;
  // 連れた隊は主人公の後ろを歩く（行き先は主人公が動いた時だけ置き直す）
  if ((F.proFT = (F.proFT || 0) - dt) <= 0) {
    F.proFT = 1;
    for (const g of [F.ikeda, F.tired && F.tiredJoin ? F.tired : null, F.newG && F.newJoin ? F.newG : null]) {
      if (!g) continue;
      const c = g.center?.();
      if (c && Math.hypot(c.x - P.x, c.z - P.z) > 9 && (!g.dest || Math.hypot(g.dest.x - P.x, g.dest.z - P.z) > 6)) follow(rt, g);
    }
  }
  if (F.pro === 1) {
    if (F.oStep === 1 && F.tired && near(P, SCENE[1].pins[0], 9)) {
      F.oStep = 2; F.tiredJoin = true;
      rt.say('足軽', '……へい。立ちまする', 2.4);
      after(rt, 3, () => rt.say('羽柴秀長', '遅れる者はおらぬか。街道の口で隊を揃えよ', 3));
    } else if (F.oStep === 2 && near(P, SCENE[1].pins[1], 10)) next(rt, ctx, 2);
  } else if (F.pro === 2) {
    if (F.oStep === 1 && near(P, SCENE[2].pins[0], 9)) {
      F.oStep = 2; F.newJoin = true;
      rt.say('足軽', '握り飯じゃ……ありがたい', 2.4);
      // 秀吉が騎馬で隊列の横を通る（ずっと横にはいない）
      if (F.proHon) {
        for (const u of F.proHon.units) if (u.alive) { const x = 96, z = 150 + Math.random() * 6; u.pos.set(x, rt.world.heightAt(x, z), z); u.mesh?.position.copy(u.pos); }
        F.proHon.order = 'move'; F.proHon.dest = { x: 10, z: 96 }; F.proHon.speed = 4.6; F.proHon.onArrive = null;
      }
      after(rt, 2, () => rt.say('羽柴秀吉', '米も銀も皆に配れ。生きて戻れば、また貯めればよい！', 3.4));
      after(rt, 6, () => rt.say('姫路の侍', '新手の者ども、羽柴様の列に付け！', 2.8));
    } else if (F.oStep === 2 && near(P, SCENE[2].pins[1], 10)) next(rt, ctx, 3);
  } else if (F.pro === 3) {
    // 明智の物見（小さな妨害だけ）：道の半ばで北の藪から
    if (!F.proScouts && (P.x > -30 || el > 30)) {
      F.proScouts = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: -6, z: 112 }, facing: 0, width: 6, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 60, dmgMult: 0.35 },
        ctx.ak([{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }, { type: 'gun', n: 1 }]));
      F.proScouts.dest = { x: P.x, z: P.z };
      rt.say('使番', '桔梗の旗！　明智の物見じゃ、追い散らせ！', 2.8);
    }
    const left = F.proScouts ? ctx.aliveN(F.proScouts) : 9;
    if (F.proScouts && left <= 1 && !F.proScoutsGone) {
      F.proScoutsGone = true;
      if (ctx.live(F.proScouts)) { F.proScouts.routed = true; F.proScouts.order = 'flee'; }
      rt.say('足軽', '追い払うたぞ！', 2);
    }
    // 刻限だけで健在の物見を消して山崎へ進めない。合流地点まで追わせ、実際に退けてから移る。
    if (!F.proScoutsGone && F.proScouts && near(P, SCENE[3].pins[0], 10) && el > 95) {
      const g = F.proScouts;
      if (!(g.order === 'move' && g._tateRe) && (!g.dest || !near(g.dest, P, 6))) {
        g.order = 'move'; g.dest = { x: P.x, z: P.z };
        g.onArrive = (q) => { q.order = 'attack'; };
      }
    }
    if (near(P, SCENE[3].pins[0], 10) && F.proScoutsGone) next(rt, ctx, 4);
  }
}

// 暗転して次の場面へ（4 は山崎の手前＝本筋の①）
function next(rt, ctx, n) {
  const F = rt.flags;
  F.proWarp = true;
  F.proWarpT = 1.6; F.proNext = n;
  rt.scene.visible = false;
}

// 山崎へ移る時：序の隊を片付ける（自分の備だけ残す）
export function clear(rt) {
  const F = rt.flags;
  // 備中・姫路だけの旗と荷物を山崎に残さない。終了時の片付けに含めるため場面には保つ。
  for (const object of F.proProps || []) object.visible = false;
  for (const g of [F.proHon, F.rider, F.tired, F.newG, F.proScouts]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.proHon = F.rider = F.tired = F.newG = F.proScouts = null;
  F.pro = 0;
}

// 途中から続ける時の幕の始まり（battle_checkpoint の resumeSteps）
export function resumeScene(rt, ctx, n) {
  const F = rt.flags;
  F.proWarp = false; F.proWarpT = 0; F.proNext = 0;
  rt.scene.visible = true;
  if (n === 1) { start(rt, ctx); return; }
  if (!F.proHon) start(rt, ctx, false);
  F.holdPlayer = false;
  scene(rt, ctx, n);
}

export function pin(F) {
  if (!F.pro || F.proWarp) return null;
  const S = SCENE[F.pro];
  const p = F.pro === 1 ? S.pins[F.oStep >= 2 ? 1 : 0] : F.pro === 2 ? S.pins[F.oStep >= 2 ? 1 : 0] : S.pins[0];
  PIN.x = p.x; PIN.z = p.z;
  return PIN;
}
// bot：近い物見を討ち、いなければ行き先へ
export function botTarget(F) { return F.oStep ? pin(F) : null; }
