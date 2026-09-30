// ======================================================================
// 織田家編　手取川の戦い（天正五年九月二十三日）
// 能登の七尾城を助けに、柴田勝家を大将とする織田勢が加賀へ入り、手取川を越えた。
// だが七尾城はすでに上杉謙信の手に落ちていた。それを知った織田勢は退き始め、夜、手取川を渡るところを上杉勢に追われた。
// 足軽は柴田勝家の手。①七尾城の落ちた知らせ。川の浅瀬まで退く ②追ってくる上杉の騎馬と先手を、岸で食い止める（殿）
// ③味方が渡り終えたら、増えた川を渡って南の岸へ ④南の岸で、取り残された組と、川を押し渡る追手（段）
// ②は段（b_depth.js）で濃くする：殿の槍衾→判断（丹羽の手を助けるか）→囲まれる／西の浅瀬→判断（押し返すか、かがり火で欺くか）→総掛かり
// 浅瀬の口の左右では、味方と上杉の大軍が押し合う（軽い作り）。上杉の鉄砲組は並んで一斉に撃つ
// 戦の大きさには諸説あり、ここでは退き口として描く
// 向き：南（+z）の岸が味方の退く先。川は東西に流れる。北（-z）から上杉勢が来る
// ======================================================================
import { nobori, hut, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { more, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, rest, pick, fight, hold } from './b_depth.js';
import { uS, uA, uC, uG, round, gunLine, lines, leanAll, volleyAll, camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-240, 4], [-120, -2], [0, 2], [120, -4], [240, 2]];
const FORD = { x: 0, z: -14 };              // 北の岸の浅瀬の口
const SOUTH = { x: 4, z: 34 };              // 南の岸（退く先）
const ODA = { flag: 'oda' };
const UESUGI = { flag: 'uesugi' };

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 川原は低く、両岸に土手
  h += 1.4 * Math.exp(-((z + 16) ** 2) / 20) + 1.4 * Math.exp(-((z - 22) ** 2) / 20);
  // 北の加賀の山並みと、南の白山のすそ
  h += Math.max(0, -z - 140) * 0.25 + 40 * gauss(x, z, 160, 220, 12000);
  return h;
}

const tedorigawa = {
  spawn: { x: 6, z: -60, heading: 0 },
  world: {
    seed: 15777,
    time: 'storm',
    muddy: 1,
    streams: [{ pts: RIVER, w: 24, depth: 1.3 }],
    paths: [[[0, -200], [2, -60], [FORD.x, FORD.z], [SOUTH.x, SOUTH.z], [6, 160]]],
    height,
    tint(x, z, h, c) { if (z > -14 && z < 20) c.lerp({ r: 0.42, g: 0.42, b: 0.36 }, 0.4); },
    clear: (x, z) => (Math.abs(x) < 110 && z > -120 && z < 80) || Math.hypot(x - 34, z - 104) < 20,
    trees: 320,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 90 ? 0.1 : 0.8),
    groves: [{ x: -60, z: -60, r: 12, n: 16 }, { x: 70, z: -40, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -150,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 北の岸の陣（払いかけ） ----
    for (const [x, z, r] of [[-30, -70, 0.2], [34, -74, -0.1]]) rt.scene.add(hut(W, x, z, 6, 4, r, { wall: 0x5a4a38 }));
    rt.scene.add(tawara(W, -14, -64, 0.3, 5), tawara(W, 20, -60, -0.2, 4));
    for (const [x, z] of [[-8, -52], [10, -54], [-40, -58], [44, -60]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 柴田勝家の手（自分の持ち場）、佐久間盛政の手、丹羽の手 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 0, z: -66 }, facing: 0, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.others = [
      allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: -30, z: -60 }, facing: 0, width: 12, aggro: 10, noRout: true }, dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }], ODA)),
      allyGroup(rt, { name: '前田利家の手', anchor: { x: 32, z: -62 }, facing: 0, width: 12, aggro: 10, noRout: true }, dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], ODA)),
    ];
    for (const g of [F.shiba, ...F.others]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: -58 }, 0, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：南の岸へ渡っていく織田の本隊、北から来る上杉の大軍 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.main = [DA(-50, -40, 30, 14, 260, 0, 0x2b3140, 'oda', 15771), DA(50, -44, 30, 14, 240, 0, 0x2b3140, 'oda', 15772)];
    F.host = [DA(0, -190, 60, 16, 340, 0, 0x2a2a2a, 'uesugi', 15773), DA(-70, -180, 30, 14, 220, 0.3, 0x2a2a2a, 'uesugi', 15774)];
    for (const [x, z] of [[-20, -80], [24, -84]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 北の上杉謙信の本陣（遠く。見に行けば謙信と旗本がいる）
    // 南の岸の織田の本陣（滝川一益が退く列を受け取る）
    F.honjin = camp(rt, { x: 34, z: 104, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '滝川一益', hat: 'kabuto_m', haori: 0x2a3440 }, guard: 15, reserve: 200, runTo: { x: SOUTH.x, z: SOUTH.z + 10 } });
    F.ehon = camp(rt, { x: 64, z: -206, facing: 0, team: 1, faction: 'saito', mon: 'uesugi', armor: 0x2a2a2a, general: { name: '上杉謙信', hat: 'hachimaki', haori: 0xd8d2c0 }, guard: 15, reserve: 300, runTo: { x: 0, z: -150 } });

    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '柴田勝家の手で足軽の一手を預かり、下知を待て' : '柴田勝家のもとで、下知を待て', 'main');
    rt.say('足軽', '……使いの者が。七尾の城は、もう上杉の手に落ちたそうな！', 3.5);
    rt.say('柴田勝家', 'なんと……。助ける城が無ければ、ここにおる理由はない。雨で川が増えぬうちに、南へ渡る', 4.5);
    rt.say('柴田勝家', `${nm(rt)}、わしの手は殿（しんがり）じゃ。皆が渡りきるまで、北の岸を支えよ`, 4.5);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(18, () => this.retreat(rt));
  },

  // ① 浅瀬まで退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('retreat');
    rt.unmark('shiba');
    sfx('taiko', 0.6);
    rt.obj('main', '北の岸の浅瀬の口まで退け', 'main');
    rt.marker('ford', FORD, '浅瀬の口', { h: 2 });
    rt.zone('ford', FORD.x, FORD.z - 10, 7);
    F.shiba.order = 'move'; F.shiba.dest = { x: FORD.x, z: FORD.z - 12 }; F.shiba.speed = 2.6; F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; g.aggro = 14; };
    // ほかの手は先に渡る
    F.others.forEach((g, i) => { g.order = 'path'; g.path = [[FORD.x + (i ? 10 : -10), FORD.z], [SOUTH.x + (i ? 16 : -16), SOUTH.z + 20], [SOUTH.x + (i ? 20 : -20), 90]]; g.pathIdx = 0; g.speed = 2.4; g.onArrive = (q) => { q.order = 'hold'; }; });
    for (const m of F.main) m.advance(90, 70);
    for (const h of F.host) h.advance(60, 60);
  },

  // ② 殿：追手を食い止める
  rearguard(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('rear');
    rt.unmark('ford'); rt.unzone('ford');
    sfx('horagai', 0.8);
    rt.banner('上杉の追手', '雨の闇の中から、竹に雀の旗が迫る');
    rt.obj('main', HI(rt) ? '殿の一手を預かり、上杉の追手を食い止めよ（味方が渡りきるまで）' : '北の岸で、上杉の追手を食い止めよ（味方が渡りきるまで）', 'main');
    rt.say('柴田勝家', '来たぞ！　槍衾を作れ！　ここで崩れれば、川で皆死ぬぞ', 4);
    F.waves = [];
    // 浅瀬の口の左右では、渡りかけの味方の大軍と上杉の大軍が押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -76, z: -46, facing: Math.PI, w: 50, seed: 1571, A: ['oda', 0x2b3140, 420, 'oda'], B: ['uesugi', 0x2a2a2a, 620, 'saito'], gunsB: true, surge: { every: 45, flank: 0.4 } },
      { x: 76, z: -48, facing: Math.PI, w: 50, seed: 1572, A: ['oda', 0x2b3140, 400, 'oda'], B: ['uesugi', 0x2a2a2a, 600, 'saito'], surge: { every: 55, flank: 0.4 } },
    ]);
    F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
    leanAll(F.lines, 'B', 0.2);
    // 勝ち筋：浅瀬の口は狭い。口の前で槍を揃え、寄せた所を鉄砲で崩す
    rt.after(3, () => rt.say('柴田勝家', '浅瀬の口は狭い。口の前で槍を揃えれば、上杉の数は生きぬ。鉄砲組は、寄せるまで撃つな', 4.5));
    F.rgun = allyGroup(rt, { name: '柴田の鉄砲組', anchor: { x: RG.x, z: RG.z + 7 }, facing: Math.PI, width: 16, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    volleyAt(rt, { guns: () => [F.rgun], foes: () => rt.army.groups.filter((g) => g.team === 1 && g.count > 0), who: '柴田勝家', near: 30, drop: 28, max: 50, say: '引きつけたぞ……鉄砲組、放てぇっ！', line: '柴田の鉄砲組がそろって火を吹いた。上杉の先が崩れる' });
    depthStart(rt, tedoCtx(rt), tedoA(), () => this.cross(rt));
  },

  // ③ 川を渡る
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('cross');
    for (let i = 0; i < 3; i++) rt.unmark('w' + i);
    for (const q of F.waves || []) if (!gone(q)) q.morale = Math.min(q.morale, 25);
    rt.award((t) => t.side.push('殿を務め、追手を食い止めた'), '殿を務めた');
    rt.banner('皆、渡った', '殿も川へ。水はもう腰の上まで来ている');
    rt.obj('main', '増えた手取川を渡り、南の岸へ', 'main');
    rt.say('柴田勝家', 'よう支えた！　殿、退けっ！　流されるな、隣の者の腕をつかめ！', 4);
    rt.marker('south', SOUTH, '南の岸', { h: 2 });
    rt.zone('south', SOUTH.x, SOUTH.z, 8);
    F.shiba.order = 'path'; F.shiba.path = [[FORD.x, FORD.z], [SOUTH.x, SOUTH.z + 6]]; F.shiba.pathIdx = 0; F.shiba.speed = 2; F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    for (const h of F.host) h.advance(40, 30);
    if (F.rgun && F.rgun.count) { const g = F.rgun; g.order = 'path'; g.path = [[FORD.x + 4, FORD.z], [SOUTH.x + 8, SOUTH.z + 4]]; g.pathIdx = 0; g.speed = 2; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
    // 左右の味方の大軍は、川へ崩れて渡っていく
    for (const c of F.lines || []) c.rout('A', { from: 0, hideAfter: 20, minFight: 0 });
  },

  // 南の岸に着いたら：取り残された組・川を渡ってくる追手（段）
  south(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4;
    rt.unmark('south'); rt.unzone('south');
    rt.obj('main', '南の岸を守り、手取川を渡りきれ', 'main');
    F.shiba.order = 'hold'; F.shiba.anchor = { x: SOUTH.x, z: SOUTH.z + 4 }; F.shiba.facing = Math.PI;
    depthStart(rt, tedoCtx(rt), tedoB(), () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('south'); rt.unzone('south');
    for (const q of F.waves || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '手取川の殿を務め、生きて渡った', pts: 20 }; }, '任務達成・手取川を渡った');
    sfx('horagai', 0.5);
    rt.banner('手取川を渡った', '上杉勢は北の岸で止まった');
    rt.say('柴田勝家', `……生きて渡ったか、${nm(rt)}。負け戦じゃ。じゃが、負け戦で生きて帰る者が、次の戦に勝つ`, 5.5);
    rt.after(6, () => rt.say('', '――謙信は翌年三月、春日山城で急死した。上杉の南への動きは、それで止まった', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - FORD.x, p.z - (FORD.z - 10));
      rt.objProgress('main', `浅瀬の口まで ${Math.max(0, Math.round(d))}m`);
      if (d < 7 || rt.t - F.stepT > 60) this.rearguard(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - SOUTH.x, p.z - SOUTH.z);
      rt.objProgress('main', `南の岸まで ${Math.max(0, Math.round(d))}m`);
      // 渡り出さない時は、柴田が呼ぶ（上杉が迫るので長くは待たない）
      if (d >= 8 && rt.t - F.stepT > 20 && !F.crossCall) { F.crossCall = true; rt.say('柴田勝家', `${nm(rt)}、何を立ち止まる！　印の南の岸へ渡れ。上杉が来るぞ`, 3.5); }
      if (d >= 8 && rt.t - F.stepT > 40 && !F.crossCall2) { F.crossCall2 = true; rt.say('足軽', 'お頭、わしの腕につかまりなされ！　流れは今のうちじゃ', 3); }
      if (d < 8 || rt.t - F.stepT > 70) this.south(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// ---------------- 殿の段（北の岸）と、南の岸の段 ----------------
const RG = { x: 0, z: -30 };                 // 殿の持ち場（浅瀬の口の前）
const RR = round(RG, Math.PI, 56);           // 北から来る上杉の寄せ口（左右と、上流の浅瀬を渡った後ろ）
function tedoCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'uesugi', armor: 0x2a2a2a, dmg: 0.6, look: (l) => dress(l, UESUGI), friends: () => [F.shiba].filter((g) => g && g.count), aid: { name: '柴田の手の一組', list: [uS(1), uA(8)] }, aidSaid: '柴田の手から一組が加わった' };
}
function tedoA() {
  return [
    hold({ at: RG, dur: 90, r: 14, title: '殿の槍衾', sub: '浅瀬の口の前に、槍を揃えて立つ', label: '殿の持ち場', obj: '浅瀬の口の前で、上杉の追手を食い止めよ（殿）',
      say: [['柴田勝家', '腰を落とせ。渡る味方の背を、一人も突かせるな！']],
      waves: [
        { t: 4, say: ['足軽', '騎馬じゃ！　槍を下ろせ、馬を止めよ！'], foes: () => [{ name: '上杉の騎馬', from: RR.front, list: [uS(1, { horse: true }), uC(8)], mass: 120 }] },
        { t: 36, say: ['柴田勝家', '柿崎の旗じゃ……上杉の先手の総掛かりぞ！'], foes: () => [{ name: '上杉の先手（柿崎景家の手）', from: RR.fl, list: [uS(3), uA(14), uG(2)], mass: 260, noRout: 30 }] },
        { t: 72, say: ['足軽', '土手の上に鉄砲が並んだ……！　伏せろ！'], foes: () => [gunLine('上杉の鉄砲組', RR.fr, RG, 8)] },
      ],
      reward: '殿の槍衾で追手を受け止めた', lost: ['柴田勝家', '持ち場を離れるな！　殿が崩れれば皆が川で死ぬ'] }),
    pick({ title: '上杉の別手が西の浅瀬を渡り、丹羽の手の横へ回った。どうする？',
      pre: (rt) => rt.say('伝令', '西の浅瀬を上杉の別手が渡りました！　丹羽殿の手が横を突かれておりまする！', 3.5),
      options: [{ label: '西へ走り、丹羽殿の手を助ける', note: '丹羽の手が残り、後の総掛かりで味方が厚い。持ち場の後ろが空く' }, { label: '浅瀬の口を離れない', note: '持ち場は固い。丹羽の手は崩れ、後ろへ回る上杉勢が増える' }],
      on: (rt, m, i) => { m.tdNiwa = i === 0; rt.say('柴田勝家', i === 0 ? 'よし、組を連れて西へ！　すぐ戻れよ' : '……よし。ここを一歩も退くな', 3); } }),
    fight({ skip: (rt, m) => !m.tdNiwa, at: { x: -44, z: -24 }, title: '西の浅瀬', sub: '渡ってきた上杉の別手が、丹羽の手を川へ押し込む', obj: '丹羽殿の手の横を突く上杉の別手を崩せ',
      foes: () => [{ name: '西の浅瀬を渡った上杉勢', from: { x: -104, z: -20 }, list: [uS(2), uA(12)], mass: 200 }],
      later: [{ t: 34, title: '後ろから', sub: '上杉の騎馬が浅瀬を渡り、背へ回る', say: ['足軽', '後ろじゃ！　川の中から騎馬が来る！'], foes: () => [{ name: '背へ回る上杉の騎馬', from: { x: -60, z: 16 }, list: [uC(6), uA(4)], mass: 90 }] }],
      reward: '丹羽殿の手を助けた' }),
    hold({ skip: (rt, m) => m.tdNiwa, at: RG, dur: 65, r: 14, title: '囲まれる', sub: '左右から、上杉勢が浅瀬の口へ回り込む', label: '浅瀬の口', obj: '左右から回り込む上杉勢に、浅瀬の口を渡すな',
      waves: [
        { t: 5, say: ['足軽', '左からも来る……囲まれるぞ！'], foes: () => [{ name: '左へ回る上杉勢', from: RR.left, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 30, say: ['足軽', '右じゃ！　右からも！'], foes: () => [{ name: '右へ回る上杉勢', from: RR.right, list: [uS(1), uA(10), uG(2)], mass: 180 }] },
        { t: 55, say: ['柴田勝家', '後ろの川から……！　丹羽の手を崩した者どもが回ってきたか'], foes: () => [{ name: '背の上杉勢', from: RR.back, list: [uS(1), uA(9), uC(3)], mass: 140 }] },
      ],
      reward: '浅瀬の口を守りぬいた' }),
    rest({ dur: 12, banner: ['雨が強まる', '川の音が大きくなった'], say: [['柴田勝家', '手負いを先に渡せ。……川が増えてきおった'], ['足軽', '北の闇に、まだかがり火が続いておる……上杉の本隊じゃ']] }),
    pick({ title: '上杉の本隊が押し寄せる。殿はどう退く？',
      pre: (rt) => rt.say('柴田勝家', 'このまま退けば背を突かれる。……その方、どう見る', 3.5),
      options: [{ label: '柴田殿の手と一つになり、一度押し返してから退く', note: '総掛かりを受け止めれば大手柄。敵は多い' }, { label: 'かがり火を焚き残し、陣にいると見せて退く', note: '寄せは少なくなる。見破られれば囲まれる' }],
      on: (rt, m, i) => { m.tdPush = i === 0; rt.say('柴田勝家', i === 0 ? 'よう言うた！　一度叩いてから渡るぞ！' : 'よし、火を増やせ。静かに下がるぞ', 3); } }),
    fight({ skip: (rt, m) => !m.tdPush, at: RG, max: 130, title: '上杉の総掛かり', sub: '毘の旗の下、上杉の本隊が浅瀬の口へなだれ込む', obj: '上杉の総掛かりを押し返せ（押し返したら退く）',
      say: [['柴田勝家', '正面を受けよ！　鉄砲の込め直しの間に突け！']],
      foes: () => [{ name: '上杉の本隊の先', from: RR.front, list: [uS(3), uA(16)], mass: 320, noRout: 30 }, gunLine('上杉の鉄砲衆', RR.fl, RG, 10)],
      later: [
        { t: 30, title: '横槍', sub: '左右から上杉の新手', say: ['足軽', '左右から新手じゃ……！　囲まれた！'], foes: () => [{ name: '左の上杉の新手', from: RR.left, list: [uS(1), uA(9)], mass: 180 }, { name: '右の上杉の新手', from: RR.right, list: [uS(1), uA(9)], mass: 180 }] },
        { t: 70, title: '騎馬', sub: '上杉の騎馬が背へ回る', say: ['柴田勝家', '騎馬を通すな！　槍を後ろへも向けよ！'], foes: () => [{ name: '背へ回る上杉の騎馬', from: RR.back, list: [uS(1, { horse: true }), uC(8)], mass: 100 }] },
      ],
      reward: (t) => { t.special = { label: '上杉の総掛かりを押し返した', pts: 25 }; }, rewardLabel: '上杉の総掛かりを押し返した' }),
    hold({ skip: (rt, m) => m.tdPush, at: { x: 0, z: -20 }, dur: 70, r: 12, title: '見せかけのかがり火', sub: '火を焚き残し、闇の中を静かに下がる', label: '浅瀬の口', obj: '静かに下がり、嗅ぎつけた上杉勢を払え',
      waves: [
        { t: 20, say: ['足軽', '……見破られたか！　右から来る！'], foes: () => [{ name: '嗅ぎつけた上杉勢', from: RR.right, list: [uS(1), uA(10)], mass: 140 }] },
        { t: 45, say: ['足軽', '鉄砲の火縄の火が並んでおる……！'], foes: () => [gunLine('上杉の鉄砲組', RR.front, RG, 7, { mass: 60 })] },
      ],
      reward: 'かがり火で上杉を欺いた' }),
  ];
}
function tedoB() {
  const S = { x: SOUTH.x, z: SOUTH.z - 2 };
  const RS = round(S, Math.PI, 50);
  return [
    rest({ dur: 12, say: [['足軽', '……流された者がおる。あちこちで叫んでおる'], ['柴田勝家', '振り返るな、とは言わぬ。……じゃが、まだ上杉が来る']] }),
    pick({ title: '川の中ほどで、取り残された味方の組が囲まれている。どうする？',
      pre: (rt) => rt.say('足軽', '見よ、川の中ほど！　前田殿の手の者が囲まれておる！', 3.5),
      options: [{ label: '川へ戻って、取り残された組を助ける', note: '助ければ手柄。その間に上杉勢が多く渡ってくる' }, { label: '南の岸で槍を揃えて待つ', note: '岸は固い。取り残された組は討たれる' }],
      on: (rt, m, i) => { m.tdSave = i === 0; rt.say('柴田勝家', i === 0 ? '行け！　じゃが深みへは入るな！' : '……南の岸で待て。渡ってくる者を叩くぞ', 3); } }),
    fight({ skip: (rt, m) => !m.tdSave, at: { x: -18, z: 2 }, max: 130, title: '川の中の斬り合い', sub: '腰まで水に浸かり、取り残された組を囲む上杉勢', obj: '川の中で、取り残された組を囲む上杉勢を崩せ',
      foes: () => [{ name: '川の中の上杉勢', from: { x: -26, z: -40 }, list: [uS(2), uA(12)], mass: 160 }, { name: '瀬を下る上杉勢', from: { x: -70, z: -6 }, list: [uS(1), uA(8)], mass: 100 }],
      later: [{ t: 40, say: ['足軽', '北の岸から鉄砲じゃ！　川の中では伏せられぬ！'], foes: () => [gunLine('北の岸の鉄砲組', { x: 0, z: -40 }, { x: -18, z: 2 }, 8, { mass: 80 })] }],
      reward: (t) => { t.special = { label: '川の中で取り残された組を救った', pts: 20 }; }, rewardLabel: '取り残された組を救った' }),
    hold({ at: S, dur: 75, r: 14, title: '南の岸', sub: '増えた川を、上杉勢が押し渡ってくる', label: '南の岸', obj: '南の岸で、川を渡ってくる上杉勢を叩け',
      say: [['柴田勝家', '渡ってくる所を叩け！　水から上がる前が一番弱い！']],
      waves: [
        { t: 5, say: ['足軽', '来たぞ、川を渡ってくる！'], foes: (rt, m) => [{ name: '渡ってくる上杉勢', from: { x: -10, z: -24 }, list: [uS(2), uA(m.tdSave ? 14 : 10)], mass: 220 }] },
        { t: 38, say: ['足軽', '向こう岸に鉄砲が並んだ……！'], foes: () => [gunLine('北の岸の鉄砲衆', { x: 10, z: -34 }, S, 10, { off: { x: 6, z: -48 }, mass: 100 })] },
        { t: 60, if: (rt, m) => m.tdSave, say: ['足軽', '上の浅瀬からも……横へ回られる！'], foes: () => [{ name: '上の浅瀬を渡った上杉勢', from: RS.left, list: [uS(1), uA(10), uC(3)], mass: 140 }] },
      ],
      reward: '南の岸を守りぬいた' }),
    // 南の岸の後ろ：上杉の騎馬が上の浅瀬を渡り、退く味方の列（手負いと荷駄）へ回り込む
    rest({ dur: 8, heal: 0.3, say: [['伝令', '上の浅瀬を、上杉の騎馬が渡りました！　退く列の手負いと荷駄を狙っておりまする'], ['柴田勝家', 'しつこい……謙信め、一人も帰さぬ気か']] }),
    pick({ title: '上杉の騎馬が、退く列の後ろへ回る。どう防ぐ？',
      options: [{ label: '列の後ろに付き、手負いと荷駄を守って退く', note: '手負いが助かる。騎馬の寄せを受け続ける' }, { label: '土手の上の竹藪に伏せ、騎馬の横を突く', note: '当たれば騎馬は二度と来ない。遅れれば列が崩れる' }],
      on: (rt, m, i) => { m.tdAmb = i === 1; rt.say('柴田勝家', i === 0 ? 'よし、列の尻に付け。手負いを一人も置いていくな' : '藪に伏せよ。馬が通り過ぎる所を、横から槍を入れよ', 3.5); } }),
    hold({ skip: (rt, m) => m.tdAmb, at: { x: 14, z: 56 }, dur: 80, r: 14, title: '退く列の後ろ', sub: '手負いと荷駄を背に、上杉の騎馬を受ける', label: '列の後ろ', obj: '退く列の後ろに付き、上杉の騎馬から手負いを守れ',
      waves: [
        { t: 4, say: ['足軽', '騎馬じゃ！　槍を下ろせ！'], foes: () => [{ name: '上の浅瀬を渡った上杉の騎馬', from: { x: -60, z: 40 }, list: [uS(1, { horse: true }), uC(8), uA(6)], mass: 140, noRout: 20 }] },
        { t: 34, say: ['足軽', '川からも、歩きの者が上がってくる！'], foes: () => [{ name: '川を渡った上杉勢', from: { x: -20, z: 10 }, list: [uS(2), uA(12)], mass: 200 }] },
        { t: 60, say: ['柴田勝家', 'これが最後の寄せじゃ。凌げば、上杉は川を越えては来ぬ！'], foes: () => [{ name: '上杉の騎馬の新手', from: { x: 60, z: 30 }, list: [uC(6), uA(8)], mass: 120 }] },
      ],
      reward: '退く列の後ろで、手負いと荷駄を守りぬいた', lost: ['柴田勝家', '列が乱れた……じゃが、まだ崩れてはおらぬ'] }),
    fight({ skip: (rt, m) => !m.tdAmb, at: { x: -20, z: 52 }, max: 130, title: '竹藪の横槍', sub: '通り過ぎる上杉の騎馬の横腹へ', obj: '竹藪から躍り出て、上杉の騎馬を崩せ',
      say: [['柴田勝家', '今じゃ、突けっ！']],
      foes: () => [{ name: '上の浅瀬を渡った上杉の騎馬', from: { x: -60, z: 44 }, list: [uS(1, { horse: true }), uC(8), uA(6)], mass: 140, morale: 70 }],
      later: [{ t: 40, title: '新手', sub: '川から上杉の歩きの者が上がる', say: ['足軽', '川から上がってくる……挟まれるぞ！'], foes: () => [{ name: '川を渡った上杉勢', from: { x: -20, z: 10 }, list: [uS(2), uA(12)], mass: 200 }] }],
      reward: (t) => { t.special = { label: '竹藪に伏せ、上杉の騎馬の横を突いた', pts: 20 }; }, rewardLabel: '上杉の騎馬の横を突いた' }),
    rest({ dur: 6, say: [['足軽', '……騎馬が、川の向こうへ引いていく'], ['柴田勝家', '雨がやんだら、川はもう渡れぬ。……わしらの勝ちよ、生きて帰ればな']] }),
  ];
}

// 両軍の総勢（柴田勝家の軍 三万ほど、上杉勢 二万ほど。数と戦の大きさには諸説ある）
tedorigawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 20000 - (F.ek || 0) * 30), b0: 20000 };
};
tedorigawa.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '上杉軍', mon: 'uesugi' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
tedorigawa.famous = [
  { name: '丹羽長秀', team: 0 },
  { name: '柿崎景家', g: /柿崎|先手/, loose: 1, line: '上杉の先手、柿崎和泉守景家なり！　川に沈めてくれる！' },
  { name: '河田長親', g: /上杉/, loose: 1, line: '上杉の河田長親なり！　退く者を一人も逃がすな！' },
];
tedorigawa.date = () => '天正五年九月二十三日　秋・雨・夜';
tedorigawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '退きの下知まで待つ' : '');
tedorigawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tedorigawa.history = '天正五年（1577）、上杉謙信は能登の七尾城を囲んだ。城を助けるため、信長は柴田勝家を大将に、丹羽長秀・前田利家・羽柴秀吉らを加賀へ向かわせた（秀吉は勝家と争って途中で陣を引き払ったという）。織田勢は手取川を越えたが、七尾城は九月十五日にすでに落ちていた。それを知った織田勢は退き始め、九月二十三日の夜、手取川のあたりで上杉勢に追われ、雨で増えた川に多くの者が流されたと伝わる。ただし、この戦の大きさについては確かな記録が少なく、小さな戦いだったとする説もある。謙信は翌年三月に急死し、上杉の南への動きは止まった。兵の数には諸説ある。';

// 素直な遊び手：浅瀬の口まで退き、岸で追手と戦い、川を渡る
tedorigawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (F.step === 3) { goTo(p, inp, SOUTH.x, SOUTH.z, 2); return; }
  const c = F.shiba.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e && F.step >= 2) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { goTo(p, inp, FORD.x, FORD.z - 10, 2); return; }
  if (F.step === 2) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const t = q.center(); if (t.z > -60) { goTo(p, inp, t.x, t.z, 2); return; } } goTo(p, inp, FORD.x + 2, FORD.z - 16, 2); return; }
  goTo(p, inp, c.x + 2, c.z - 4, 3);
};

export { tedorigawa };
