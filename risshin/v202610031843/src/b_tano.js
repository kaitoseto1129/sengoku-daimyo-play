// ======================================================================
// 織田家編　田野の戦い・天目山（天正十年三月十一日）
// 高遠城が落ちると、武田の家臣は次々に離れていった。武田勝頼は新府城を焼いて、小山田信茂の岩殿城を頼ったが、
// 小山田にも背かれ、わずかな供と天目山のふもとの田野へ逃れた。滝川一益の手がこれを追いつめ、勝頼は自害した。
// 狭い崖道で土屋昌恒が一人で多くの敵を防いだ（片手千人斬り）という話は、のちの伝えである。
// 自分は滝川の先手。谷道の押し合い → 崖道で鉄砲の合図 → 平屋敷の柵の口 → 最後の寄せ。
// 向き：西南西から東北東への谷筋を +x に合わせて復元。田野は谷の奥。寸法は地形資料の既存座標。
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { demBlend } from './dem.js';
import { gauss, enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { battleEvent, EVENT_VOLLEY, EVENT_UNIT_BREAK } from './battle_events.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, depthBot, rest, fight, hold, move } from './b_depth.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 谷の道（西から東へ上る）
const ROAD = [[-190, 6], [-120, -4], [-60, 4], [-10, -2], [30, 2], [70, -4], [120, 2], [180, -6]];
const NARROW = { x0: 20, x1: 60 };          // 崖道（道の幅が狭い所）
const TANO = { x: 120, z: 2 };              // 田野（勝頼の最後の陣）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

// 国土地理院の標高（asset_dem_tano.js）を手書きの崖道の base に薄く混ぜる
let tanoDem = null;
import('./asset_dem_tano.js').then((m) => { tanoDem = m.default; }).catch(() => {});
function height(x, z) {
  const b = heightBase(x, z);
  return tanoDem ? demBlend(tanoDem, x, z, b, { scale: 0.12, floor: b - 2, xyScale: 4 }) : b;
}
function heightBase(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += (x + 200) * 0.05;
  const d = distToPolyline(x, z, ROAD);
  // 崖道は谷がせまく、切り立つ
  const narrow = x > NARROW.x0 && x < NARROW.x1;
  const half = narrow ? 4.5 : 14;
  // 川側（+z）は低い谷、反対側は山腹。両側が同じ崖にはしない。
  h += Math.min(narrow ? 40 : 30, Math.max(0, d - half) * (z > 0 ? 0.18 : narrow ? 1.6 : 0.5));
  h += 40 * gauss(x, z, 160, -140, 9000) + 40 * gauss(x, z, 60, 160, 9000);
  return h;
}

// ---- 共通の小道具（組E の戦で使い回す） ----
// 味方の鉄砲の組に一斉射を任せる。込めたまま待たせ（holdFire）、敵の前線が near m まで寄せたら「放て」で撃たせ、敵の気勢を下げる。
// o：{ guns: () => [隊], foes: () => [隊], who: 話し手, near: 38, drop: 25, max: 60（この秒を過ぎたら待たずに撃つ）, line: 見出しの小さな字, say: 合図の台詞, onFire(rt) }
export function volleyAt(rt, o) {
  const gs = () => (o.guns() || []).filter((g) => g && g.count > 0);
  for (const g of gs()) { g.holdFire = true; g.fire = true; }
  const t0 = rt.t;
  const fire = (hit) => {
    for (const g of gs()) g.holdFire = false;
    rt.say(o.who || '鉄砲頭', o.say || '寄せきったぞ……放て！', 3);
    rt.banner('一斉射', o.line || '味方の鉄砲がそろって火を吹いた。敵の前が崩れる');
    sfx('volley', 1);
    for (const g of gs()) {
      const c = g.center();
      rt.army.play('gun', c, 1.4);
      for (let i = 0; i < 4; i++) rt.army.smoke(c.x - 4 + i * 2.6, rt.world.heightAt(c.x, c.z) + 1.4, c.z, 0, 0);
    }
    for (const f of hit) { f.morale = Math.max(0, f.morale - (o.drop || 25)); }
    if (o.onFire) o.onFire(rt, hit);
  };
  const tick = () => {
    if (rt.over || rt.flags.ending) return;
    const G = gs();
    if (!G.length) return;
    const foes = (o.foes() || []).filter((f) => f && f.count > 0 && !f.routed);
    const near = o.near || 38;
    const hit = foes.filter((f) => { const c = f.center(); return G.some((g) => { const d = g.center(); return Math.hypot(c.x - d.x, c.z - d.z) < near; }); });
    if (hit.length) return fire(hit);
    if (rt.t - t0 > (o.max || 60)) return fire(foes);
    rt.after(0.4, tick);
  };
  rt.after(0.4, tick);
}
// 武田の騎馬の大きな塊を遠くに見せる（軽い作り）。facing は向く先
export function horseHost(rt, x, z, w, d, count, facing, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, armor: 0x3a2622, flagTex: flagTexture('takeda'), mon: 'takeda', seed, kind: 'cavalry' });
}

// 敵の武士は全段を通じて四十一人。段の間に控えを増やさない。
const tano = {
  noWake: true,
  spawn: { x: -160, z: 4, heading: Math.PI / 2 },
  world: {
    seed: 15823, moveLim: 230, time: 'day', mist: true, wind: [1, 0.15], muddy: 0.25,
    paths: [ROAD], height,
    streams: [{ pts: ROAD.map(([x, z]) => [x, z + 22]), w: 3, depth: 2.8 }],
    tint(x, z, h, c) { if (distToPolyline(x, z, ROAD) > 12) c.setRGB(c.r * 0.8, c.g * 0.86, c.b * 0.8); },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 12 || Math.hypot(x - TANO.x, z - TANO.z) < 24,
    trees: 700, tufts: 2400,
    treeDensity: (x, z) => distToPolyline(x, z, ROAD) < 16 ? 0.1 : 1,
    groves: [{ x: -80, z: -30, r: 12, n: 16 }, { x: 90, z: -30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && x > 175,
  },
  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.ek = 0; F.ak = 0;
    // 谷・平屋敷の柵は信長公記。崖道の寸法と鉄砲の運用は遊びのための復元。
    F.hist = { valley: 'HIST_A', fence: 'HIST_A', cliffRoad: 'HIST_B', volley: 'GAME_C' };
    for (const sd of [-1, 1]) {
      for (const s of wallLine(rt, [[16, sd * 7], [64, sd * 7]], { team: 1, hp: 1e9, name: '崖', segLen: 8, mesh: () => new THREE.Group() })) { s.noTarget = true; s.wall = true; }
    }
    // 城ではなく民家を囲む急ごしらえの柵。西の口だけは六メートル開ける。
    F.fence = wallLine(rt, [[104, -3], [104, -14], [144, -14], [144, 16], [104, 16], [104, 3]], { team: 1, hp: 180, name: '田野の柵', segLen: 6, meshOpt: { h: 1.8 } });
    rt.scene.add(hut(W, 128, 0, 7, 5, 0.2, { wall: 0x5a4a38 }), tawara(W, 138, 7, 0.2, 3));
    for (const [x, z] of [[-40, -7], [34, -4], [108, -9], [140, 8]]) rt.scene.add(nobori(W, x, z, 'takeda', 5));
    F.taki = allyGroup(rt, { name: '滝川一益の先手', anchor: { x: -168, z: 2 }, facing: Math.PI / 2, width: 10, aggro: 12, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_w' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }], ODA));
    F.kawa = allyGroup(rt, { name: '河尻秀隆の手', anchor: { x: -178, z: -6 }, facing: Math.PI / 2, width: 10, aggro: 12, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '河尻秀隆', invuln: true } }, { type: 'ashigaru', n: 14 }], ODA));
    F.tgun = allyGroup(rt, { name: '滝川の鉄砲組', anchor: { x: -176, z: 6 }, facing: Math.PI / 2, width: 6, aggro: 8, order: 'hold', noRout: true }, dress([{ type: 'gun', n: 6 }], ODA));
    F.oda = [F.taki, F.kawa, F.tgun];
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -176, z: 8 }, Math.PI / 2, [{ kind: 'spear', n }]);
    W.addDistantArmy({ x: -205, z: 0, w: 12, d: 28, count: 100, facing: Math.PI / 2, armor: 0x2b3140, flagTex: flagTexture('oda'), team: 0, seed: 15824 }).noWake = true;
    // 守る兵は初めから地形に置く。共通の増援処理で背後へ出し直さない。
    const guard = (name, x, list, width = 6) => enemyGroup(rt, { faction: 'takeda', name, anchor: { x, z: 0 }, facing: -Math.PI / 2, order: 'hold', width, aggro: 5, morale: 100, noRout: true, fleeDir: { x: 1, z: 0 }, dmgMult: 0.58 }, dress(list, TAKEDA));
    F.defenders = [
      guard('谷道の武田勢', -40, [uS(2), uA(4)], 8),
      guard('谷道の後ろの侍', -20, [uS(3), uA(5)], 8),
      guard('土屋昌恒の衆', 34, [{ type: 'busho', n: 1, o: { name: '土屋昌恒', hat: 'kabuto_m' } }, uS(3), uA(5)], 5),
      guard('田野の柵を守る侍', 110, [uS(4), uA(6)], 7),
      guard('武田の最後の侍', 128, [uS(4), uA(4)]),
    ];
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '先手の一手を率い、日川の谷から田野へ進め' : '滝川の先手につき、日川の谷から田野へ進め', 'main');
    rt.say('滝川一益', `${nm(rt)}、勝頼の一行は田野の民家に柵を結んだ。谷は狭い。前の組に続け`, 5);
    rt.after(7, () => rt.say('河尻秀隆', '川へ下りるな。谷道を上れ。敵が打って出たら、槍をそろえて止めよ', 4));
    rt.after(15, () => this.valley(rt));
  },
  valley(rt) {
    if (rt.flags.started) return;
    const F = rt.flags; F.started = true;
    const ctx = { faction: 'takeda', flag: 'takeda', armor: KIT.ARMOR.takeda, dmg: 0.58, scale: 1, mass: 0, look: (l) => dress(l, TAKEDA), friends: () => F.oda.filter((g) => !gone(g)) };
    const enter = (phase, text) => { rt.setPhase(phase); rt.obj('main', text, 'main'); };
    const valley = hold({ at: { x: -62, z: 2 }, dur: 65, r: 14, title: '谷道の押し合い', sub: '大軍も、狭い道では一度に進めない', obj: '谷道の先手につき、打って出る武田勢を止めよ', label: '谷道の先手',
      waves: [{ t: 32, say: ['河尻秀隆', '後ろから押すな！　前の槍が開いた所へ続け！'], foes: () => [] }], reward: '谷道の先手を支えた' });
    const useGuards = (stage, indices, seconds) => {
      const start = stage.start;
      stage.start = (r, C, m, c) => {
        start(r, C, m, c);
        for (const i of indices) {
          const g = F.defenders[i];
          if (gone(g)) continue;
          C.groups.push(g); C.nTot = (C.nTot || 0) + g.count;
          g.order = 'attack'; g.seekRange = 45; g.anchor = { x: C.at.x, z: C.at.z };
          r.after(seconds, () => { g.noRout = false; });
        }
        C.n0 = C.groups.reduce((n, g) => n + g.count, 0);
      };
    };
    const valleyStart = valley.start;
    valley.start = (r, C, m, c) => { enter('valley', '谷道の先手につき、敵の寄せを止めよ'); valleyStart(r, C, m, c); };
    const narrow = hold({ at: { x: 12, z: 0 }, dur: 75, r: 10, title: '崖道の抵抗', sub: '川と崖にはさまれた道を、少数の侍がふさぐ', obj: '崖道の口を固め、鉄砲の合図のあとに押せ', label: '崖道の口',
      say: [['滝川一益', '鉄砲はここで構えよ。撃つまでは槍で口を固める。煙が流れたら前へ！']],
      waves: [], reward: '崖道を押し開いた' });
    const narrowStart = narrow.start;
    narrow.start = (r, C, m, c) => {
      enter('narrow', '崖道の口で槍をそろえ、鉄砲の合図を待て'); narrowStart(r, C, m, c);
      F.tgun.anchor = { x: 4, z: -2 }; F.tgun.order = 'hold';
      volleyAt(r, { guns: () => [F.tgun], foes: () => C.groups, near: 26, max: 30, drop: 18, who: '滝川一益',
        line: '煙が流れる間に、崖道の前を押せ', onFire: () => { F.volley = true; battleEvent(r, EVENT_VOLLEY, F.tgun.anchor, F.tgun, 0, true, '崖道に鉄砲の音が返る'); r.obj('main', '鉄砲が放たれた。崖道の前を押せ', 'main'); } });
    };
    const fence = fight({ at: { x: 98, z: 0 }, max: 90, title: '田野の柵', sub: '民家を囲む粗い柵。その口から武田勢が打って出る', obj: '柵の口の武田勢を退け、前を固めよ',
      say: [['滝川一益', '中央が柵の口じゃ。脇の柵へ散るな。出て来る者を止めて、口を押さえよ']],
      foes: () => [], reward: '田野の柵の口を押さえた' });
    const fenceStart = fence.start, fenceTick = fence.tick;
    fence.start = (r, C, m, c) => { enter('fence', '田野の柵の口を押さえよ'); fenceStart(r, C, m, c); };
    fence.tick = (r, C, m, c, el, dt) => {
      const clear = fenceTick(r, C, m, c, el, dt);
      if (clear && el < 55) r.objProgress('dp', `柵の口を固める　あと${Math.ceil(55 - el)}秒`);
      return clear && el >= 55;
    };
    const last = hold({ at: { x: 114, z: 0 }, dur: 40, r: 10, title: '柵の内へ', sub: '残る侍が、民家の前から一つに寄せる', obj: '柵の口から入り、最後の寄せを止めよ', label: '柵の内側',
      say: [['滝川一益', '残る侍が来る。列を崩すな。柵の内側を押さえよ']], waves: [], reward: '田野の最後の寄せを止めた' });
    const lastStart = last.start;
    last.start = (r, C, m, c) => { enter('tano', '柵の内側を押さえ、最後の寄せを止めよ'); battleEvent(r, EVENT_UNIT_BREAK, TANO, null, 1, true, '田野の柵の口が開いた'); lastStart(r, C, m, c); };
    useGuards(valley, [0, 1], 30);
    useGuards(narrow, [2], 35);
    useGuards(fence, [3], 25);
    useGuards(last, [4], 25);
    depthStart(rt, ctx, [valley,
      move({ to: { x: 12, z: 0 }, max: 45, r: 9, obj: '谷道を上り、崖道の口へ進め', label: '崖道の口' }),
      narrow,
      rest({ dur: 8, heal: 0.35, fn: (r) => r.obj('main', '崖道の先で組をそろえ、田野へ進む支度をせよ', 'main'), say: [['河尻秀隆', '前が開いた。組をそろえよ。この先の平場が田野じゃ']] }),
      move({ to: { x: 94, z: 0 }, max: 45, r: 8, obj: '崖道を抜け、田野の柵の前へ進め', label: '田野の柵' }),
      fence, last], () => this.win(rt));
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objRemove('dp'); rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '谷道から田野の柵へ攻め込んだ', pts: 20 }; }, '任務達成・田野の柵を押さえた');
    // 最期の言葉・救出・個人の決闘は作らない。史実の結末は知らせで示す。
    rt.banner('田野の戦い、終わる', '武田勝頼と信勝は、この地で命を絶った');
    rt.say('滝川一益', '戦は終わった。組をそろえ、谷道を固めよ', 4);
    rt.player.u.invuln = true; rt.finish({}, 12);
  },
  update(rt, dt) {
    if (rt.flags.ending) return;
    KIT.backTick(rt);
    if (rt.flags.started) depthTick(rt, dt);
  },
  onKill(rt, v) { if (!v.isStruct) { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; } },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t - (rt.flags.routSaidT ?? -99) < 8) return;
    rt.flags.routSaidT = rt.t;
    rt.say('足軽', '武田の前が退いた。谷道を押せ！', 2.5);
  },
};
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n });
// 味方は数千という復元値。敵は信長公記の侍四十一人（非戦闘員は含めない）。
tano.force = (rt) => ({ a: Math.max(0, 4000 - (rt.flags.ak || 0)), a0: 4000, b: Math.max(0, 41 - (rt.flags.ek || 0)), b0: 41 });
tano.sides = { a: { name: '織田軍（滝川一益）', mon: 'oda' }, b: { name: '武田の残る侍', mon: 'takeda' } };
tano.famous = [];
tano.date = () => '天正十年三月十一日　春';
tano.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
tano.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tano.history = '信長公記巻十五によると、三月十一日、滝川一益は険しい山中を捜し、田野の平屋敷に柵を設けた勝頼の一行を見つけた。武田の者は打って出て戦い、土屋昌恒も奮戦した。勝頼と信勝はこの地で命を絶った。同書は侍四十一人、上膳・侍女五十人の最期を記す。甲陽軍鑑では戦死者を四十四人とも伝え、人数や最期の様子には異同がある。織田方の三千から四千という兵数は復元の目安。崖道の片手千人斬りは後の伝えで、ゲームの道幅・段の順・鉄砲の合図は地形を使った遊びのための復元である。景徳院は後に建てられ、当時ここに城や寺の大きな門はない。';
tano.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  if (b.flags.started) depthBot(b, inp, goTo);
  else goTo(b.player, inp, -158, 4, 3);
};
export { tano };
