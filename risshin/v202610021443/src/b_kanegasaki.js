// ======================================================================
// 信長包囲網　金ヶ崎の退き口（元亀元年四月二十八日〜晦日）
// 越前の金ヶ崎。朝倉を攻めていた織田勢は、北近江の浅井長政の裏切りで前後を挟まれた。
// 信長はわずかな供で朽木越えに京へ逃れ、殿（しんがり）に木下藤吉郎・明智光秀・池田勝正が残る。
// 足軽は木下の手。①一の備（金ヶ崎の麓）で朝倉の先手を食い止める ②笙の川まで繰り引き、騎馬の追手を川で受ける
// ③狭路まで退き、朝倉景鏡の本隊を、主力が退ききるまで食い止める（退き口成る）
// 向き：北が -z（木ノ芽峠から朝倉が来る）。東（+x）が敦賀の海。退き口は南西（朽木へ）
// ======================================================================
import { nobori, jinmaku, tawara, hut, carryTorches, palisade, tobira, yagura } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { applyLook, NIGHT } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, rest, pick, fight, hold, move, depthBot } from './b_depth.js';
import { volleyScene } from './b_shiga.js';
import { camp } from './b_mid.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 日が落ちきる前の、薄暮の色（夕暮れと夜の間）
const DUSK2 = { sky: 0x4a4658, fog: 0x3e3c4c, sun: 0xc88a6a, sunI: 0.8, hs: 0x8a86a0, hg: 0x2a2624, hI: 1.1, top: 0x262c44, glow: 0.12, dir: [-0.9, 0.08, 0.3], mount: 0x1a1c22 };

const SHO = [[-180, 34], [-100, 22], [-30, 14], [30, 10], [90, 6], [130, 2]];   // 笙の川（西から海へ）
const ROAD = [[-6, -176], [2, -110], [8, -50], [8, 12], [-10, 60], [-26, 104], [-54, 150], [-70, 176]];
const CASTLE = { x: 96, z: -128 };       // 金ヶ崎城（海に突き出た岬の山・主郭＝月見御殿跡の候補）
const KAZ2 = { x: 74, z: -112 };         // 金ヶ崎城・尾根続きの二の曲輪（主郭との間が堀切の鞍部）
const TEZUTSU = { x: 48, z: -98 };       // 天筒山（標高約170mの山頂曲輪）
const NAKAIKEMI = { x: 78, z: -66, r: 26 };   // 中池見湿地（天筒山の東南、天然の防御線）
// 殿の三つの備（持ち場）と、そこで向く向き（北 = Math.PI）
const LINES = [
  { x: 8, z: -46, r: 12, name: '一の備（金ヶ崎の麓）' },
  { x: 6, z: 24, r: 12, name: '二の備（笙の川の南）' },
  { x: -22, z: 102, r: 11, name: '三の備（狭路）' },
];
const RETREAT_T = 340;    // 主力が退ききるまでの秒（5〜6分の基準に合わせてさらに詰めた）
const KUTSUKI = { x: -56, z: 150, r: 14 };    // 朽木越えの道の口（信長で遊ぶ時の退き先）                   // 主力が退ききるまでの秒（はじめから）

const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
// 苦しい戦：寄せ手の打ち込みを手加減しすぎない（鉄砲も七割の強さ）。寄せの人数は少しずつ厚く
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.7; if ((g.dmgMult || 1) < 0.75) g.dmgMult = Math.min(0.8, (g.dmgMult || 1) + 0.2); return g; };
// 生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
}

// 遠くの軍勢を動かす（world の揺らしと取り合わないよう、揺れの基点 x0 を動かす）
function moveDA(rt, fa, x, z) {
  fa.x = x; fa.z = z;
  const e = (rt.world.armies || []).find((a) => a.mesh === fa.m);
  if (e) e.x0 = x - fa.x0;
  fa.m.position.z = z - fa.z0;
  fa.m.position.y = rt.world.heightAt(x, z) - rt.world.heightAt(fa.x0, fa.z0);
}

function height(x, z) {
  let h = 0.6 * Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.027) + 0.35 * Math.sin(z * 0.06 + x * 0.025);
  // 金ヶ崎の岬・天筒山・西の山並み・狭路の両側の山（二の曲輪・竪堀は見た目の柵だけに留め、
  // 地形（歩きの当たり）はいじらない。兵の経路が切れて固まる事があったため）
  h += 22 * gauss(x, z, CASTLE.x, CASTLE.z, 900) + 26 * gauss(x, z, TEZUTSU.x, TEZUTSU.z, 1500);
  h += Math.max(0, -x - 90) * 0.28 + 18 * gauss(x, z, -96, -70, 2600);
  h += 30 * gauss(x, z, -82, 104, 1500) + 26 * gauss(x, z, 36, 122, 1400) + 14 * gauss(x, z, 90, 150, 2000);
  // 狭路：道の両脇に崖のような尾根が迫る細い谷
  h += 16 * gauss(x, z, -52, 96, 500) + 15 * gauss(x, z, 10, 112, 520) + 12 * gauss(x, z, -64, 132, 450) + 10 * gauss(x, z, -14, 146, 420);
  // 東は敦賀の浜から海へ
  if (x > 92) h -= Math.min(9, (x - 92) * 0.34);
  return h;
}

const kanegasaki = {
  // 敵の打ち込みの重さ（bot が楽に勝ちすぎたので締める。player.js の takeDamage）
  foeHit: 1,
  spawn: { x: LINES[0].x + 3, z: LINES[0].z + 6, heading: Math.PI },
  world: {
    seed: 1570,
    wind: [0.3, 0.95],   // 北の峠から吹き下ろす風（朝倉の側から）
    time: 'after',
    young: true,     // 四月の越前：若葉の草
    muddy: 0.25,
    water: { x: 118, level: -2.2 },
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      // 浜の砂
      if (x > 96) { const k = Math.min(1, (x - 96) / 14); c.lerp({ r: 0.62, g: 0.58, b: 0.48 }, k * 0.8); }
      // 山の緑は濃く
      if (h > 7) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.8);
    },
    clear: (x, z) => (Math.abs(x) < 70 && z > -90 && z < 80) || Math.hypot(x - 24, z + 150) < 22,
    paddy(x, z) {
      // 中池見湿地：田の升目でなく、不揃いに水をたたえた湿地（天筒山の東南、天然の防御線）
      const dw = Math.hypot(x - NAKAIKEMI.x, z - NAKAIKEMI.z);
      if (dw < NAKAIKEMI.r) {
        const n = Math.sin(x * 0.17 + z * 0.13) * 0.5 + Math.sin(x * 0.31 - z * 0.22 + 1.7) * 0.3;
        return Math.max(0, Math.min(1, (NAKAIKEMI.r - dw) / NAKAIKEMI.r * 1.4 + n * 0.3 - 0.2));
      }
      if (x < -60 || x > 80 || z < -30 || z > 70 || Math.abs(z - 20) < 12) return 0;
      if (Math.abs(x - 6) < 7) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    streams: [{ pts: SHO, w: 4.5, depth: 1.2 }],
    trees: 460,
    tufts: 4200,
    treeDensity: (x, z) => (Math.hypot(x - NAKAIKEMI.x, z - NAKAIKEMI.z) < NAKAIKEMI.r + 6 ? 0.08 : Math.abs(x) < 60 && z > -90 && z < 90 ? 0.2 : 1),
    groves: [{ x: -40, z: -20, r: 12, n: 18 }, { x: 50, z: 50, r: 12, n: 16 }, { x: -50, z: 70, r: 10, n: 14 }, { x: -52, z: 98, r: 10, n: 22 }, { x: 10, z: 112, r: 10, n: 20 }],
    // 退く朝倉の兵は、北の峠道で消す
    fleeOut: (x, z, team) => team === 1 && z < -130,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.line = 0;
    const L = LINES[0];
    // ---- 殿：木下藤吉郎の手（自分の持ち場）、池田勝正の手、明智光秀の鉄砲 ----
    F.kino = allyGroup(rt, { faction: 'oda', name: '木下藤吉郎の手', anchor: { x: L.x, z: L.z }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.kinoU = F.kino.units[0];
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田勝正の手', anchor: { x: L.x - 22, z: L.z + 2 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '池田勝正', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a3a4a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.akechi = allyGroup(rt, { faction: 'oda', name: '明智光秀の鉄砲', anchor: { x: L.x + 20, z: L.z + 6 }, facing: Math.PI, width: 12, aggro: 30, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '明智光秀', invuln: true, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'gun', n: 12 }], ODA));
    F.akeU = F.akechi.units[0];
    F.tono = [F.kino, F.ikeda, F.akechi];
    for (const g of F.tono) { g.defMult = 1.05; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: L.x + 4, z: L.z + 8 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗：金ヶ崎城と天筒山に織田の旗、麓に陣幕 ----
    for (const [x, z, k] of [[CASTLE.x - 4, CASTLE.z + 6, 'oda'], [CASTLE.x + 4, CASTLE.z + 4, 'eiraku'], [TEZUTSU.x, TEZUTSU.z + 8, 'oda'], [L.x - 6, L.z + 10, 'oda'], [L.x + 8, L.z + 10, 'oda'], [L.x + 22, L.z + 12, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 金ヶ崎城：尾根の上の主郭（木戸・柵の曲輪）と、堀切の鞍部を挟んだ二の曲輪。大型天守はなし ----
    rt.scene.add(palisade(W, [CASTLE.x - 7, CASTLE.z - 6, CASTLE.x + 7, CASTLE.z - 6]));
    rt.scene.add(palisade(W, [CASTLE.x + 7, CASTLE.z - 6, CASTLE.x + 9, CASTLE.z + 5]));
    rt.scene.add(palisade(W, [CASTLE.x - 7, CASTLE.z - 6, CASTLE.x - 9, CASTLE.z + 5]));
    rt.scene.add(tobira(W, CASTLE.x, CASTLE.z + 5, 5.4, 0), yagura(W, CASTLE.x - 8, CASTLE.z - 6), hut(W, CASTLE.x + 3, CASTLE.z - 2, 6, 4, 0.2, { roof: 0x5a4c38 }));
    rt.scene.add(palisade(W, [KAZ2.x - 6, KAZ2.z - 5, KAZ2.x + 6, KAZ2.z - 5]));
    rt.scene.add(palisade(W, [KAZ2.x + 6, KAZ2.z - 5, KAZ2.x + 4, KAZ2.z + 4]));
    rt.scene.add(tobira(W, KAZ2.x, KAZ2.z + 4, 4.6, 0));
    // ---- 天筒山城：山頂曲輪の柵（東南は竪堀・中池見湿地が守る） ----
    rt.scene.add(palisade(W, [TEZUTSU.x - 6, TEZUTSU.z - 5, TEZUTSU.x + 6, TEZUTSU.z - 5]));
    rt.scene.add(palisade(W, [TEZUTSU.x - 6, TEZUTSU.z - 5, TEZUTSU.x - 6, TEZUTSU.z + 4]));
    rt.scene.add(yagura(W, TEZUTSU.x + 5, TEZUTSU.z + 3));
    // 殿の陣は置かない（信長はもう朽木越えに発った。殿の大将・藤吉郎は一の備にいる）。捨てた俵と小屋だけ残る
    rt.scene.add(tawara(W, 20, -2, 0.4, 5), hut(W, 34, 2, 6, 4, 0.3, { roof: 0x6a5c44 }));
    // 退く道の乱れ：崩れた俵、倒れた旗、捨てた荷
    for (const [x, z, r, n2] of [[2, 40, 0.8, 2], [-14, 78, -0.6, 3], [-30, 116, 1.2, 2], [-44, 138, 0.3, 1]]) rt.scene.add(tawara(W, x + 3, z, r, n2));
    for (const [x, z, r] of [[-4, 52, 0.4], [-20, 92, -1.1], [-36, 124, 2.2]]) { const fl = nobori(W, x, z, 'oda', 5); fl.rotation.set(0, r, 1.45); fl.position.y += 0.15; rt.scene.add(fl); }

    // ---- 大軍（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => {
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
      return { m, x0: x, z0: z, x, z };
    };
    const OD = 0x2b3140;
    // 織田の主力：南の道を朽木の方へ退いていく（時とともに消える）
    F.main = [[-6, 46, 'oda'], [-20, 84, 'eiraku'], [-40, 128, 'oda'], [20, 64, 'oda'], [-4, 110, 'oda'], [-58, 158, 'eiraku']]
      .map(([x, z, f], i) => ({ ...DA(x, z, 14, 26, 200, Math.PI * 0.85, OD, f, 1571 + i), t: 0 }));
    // 金ヶ崎城と天筒山に残る兵
    DA(CASTLE.x, CASTLE.z + 8, 20, 8, 90, Math.PI, OD, 'oda', 1580);
    // 朝倉の大軍：北の峠道から押し寄せ、少しずつ南へ
    F.host = [[-4, -168, 60, 'asakura'], [-60, -150, 40, 'asakura'], [50, -160, 40, 'asakura']]
      .map(([x, z, w, f], i) => DA(x, z, w, 14, 300, 0, ASAKURA.armor, f, 1590 + i));
    // 浅井：南東の山の向こう（近江の方）に旗。背後を断たれる怖さ
    F.azai = [DA(92, 168, 40, 12, 220, Math.PI * 1.15, 0x2e2a26, 'azai', 1600), DA(130, 150, 30, 12, 180, Math.PI * 1.2, 0x2e2a26, 'azai', 1601)];
    for (const [x, z] of [[84, 160], [104, 158]]) rt.scene.add(nobori(W, x, z, 'azai', 7));
    // 朝倉の本陣（北の峠道の奥）：朝倉義景と旗本。見に行けば大将がいる（控えは軽い兵）
    F.camp = camp(rt, { x: 24, z: -150, facing: 0, team: 1, faction: 'saito', mon: 'asakura', armor: ASAKURA.armor, general: { name: '朝倉義景', hat: 'kabuto_m', haori: 0x6a4a1c }, depth: true, guard: 15, reserve: 300, runTo: { x: 8, z: -110 } });

    rt.world.setTime('after');
    rt.setPhase('brief');
    // 信長で遊ぶ時：殿を藤吉郎に任せ、旗本と朽木越えの道の口まで退く
    if (rt.G.lord) {
      rt.obj('main', '旗本を連れ、朽木越えの道の口まで退け', 'main');
      rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '朽木越えの道', { h: 2 });
      rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
      rt.say('木下藤吉郎', '殿！　浅井長政殿、朝倉方につきましたぞ。前に朝倉、後ろに浅井――袋の鼠にござる', 5);
      rt.say('木下藤吉郎', '殿（しんがり）はこの藤吉郎が務めまする。殿は一刻も早う、朽木越えに京へ！', 4.5);
      rt.say('織田信長', '猿、しんがりは任せた。……生きて戻れ', 3.5);
      rt.after(9, () => this.wave1(rt));
      F.t0 = 0;
      return;
    }
    rt.obj('main', HI(rt) ? '殿の一の備の一手を預かり、朝倉勢を食い止めて主力の退き口を開けよ' : '殿として朝倉勢を食い止め、主力の退き口を開けよ', 'main');
    rt.obj('stay', HI(rt) ? '預かった手を持ち場から動かすな。退く時は組をまとめて退け' : '下知があるまで持ち場を守れ。深追いするな', 'order');
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎', { h: 3.2 });
    rt.after(14, () => rt.unmark('kino'));
    rt.say('木下藤吉郎', `${nm(rt)}、聞いたか。北近江の浅井長政殿が、朝倉方についた。前に朝倉、後ろに浅井――袋の鼠じゃ`, 5.5);
    rt.say('木下藤吉郎', '殿はもう、わずかな供を連れて朽木越えに京へ発たれた。わしらは殿（しんがり）じゃ', 4.5);
    rt.say('木下藤吉郎', '主力が退ききるまで、ここで朝倉を食い止める。退けと言うまで、一歩も退くな。追うな', 4.5);
    rt.after(9, () => this.wave1(rt));
    F.t0 = 0;
  },

  // 主力の退き（はじめからの割合）
  // 自分たちの働きで速まる：寄せを早く崩せば主力は楽に退け、殿の備が崩されれば遅れる
  retreatPct(rt) { return Math.min(100, Math.round((rt.flags.prog ?? rt.t) / RETREAT_T * 100)); },
  tickProg(rt, dt) {
    const F = rt.flags;
    F.prog = F.prog ?? 0;
    const cur = F.step === 1 ? F.w1 : F.step === 3 ? F.w2 : F.step === 5 ? F.w3 : null;
    const live = cur ? cur.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0) : 0;
    let k = 1;
    if (cur && !live) k += 0.4;                       // 寄せが途切れた間は、主力がはかどる
    if (F.kino.count < F.kino.initial * 0.45) k -= 0.35;   // 殿の備が崩されかけると、主力の退きが遅れる
    F.prog += dt * k;
  },

  // ① 一の備：朝倉の先手
  wave1(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('l1');
    sfx('taiko', 1);
    rt.after(0.6, () => sfx('horagai', 0.8));
    rt.banner('朝倉勢、寄せ来る', '木ノ芽峠の道から、朝倉の先手');
    rt.say('足軽', '来たぞ！　三つ盛木瓜の旗じゃ！', 2.5);
    rt.say('明智光秀', '鉄砲、込めたまま待て。引きつけてから一度に放つ', 3);
    rt.after(6, () => rt.say('木下藤吉郎', '峠の道は細い。出口を槍で塞げば、大勢でも一度には来られぬ', 3.5));
    // 一斉射：明智の鉄砲が、先手の前が寄せきった所で揃えて放つ
    volleyScene(rt, { guns: () => [F.akechi, F.kino], at: () => ({ x: LINES[0].x + 6, z: LINES[0].z - 8 }), r: 36, who: '明智光秀', shots: 3,
      banner: ['一斉射', '明智の鉄砲が、朝倉の先手の頭を叩く'] });
    F.w1 = [
      soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の先手', anchor: { x: 6, z: -120 }, facing: 0, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 3 }], ASAKURA))),
    ];
    rt.marker('w0', centerOf(F.w1[0]), () => `朝倉の先手・${moraleWord(F.w1[0].morale)}`, { red: true, group: F.w1[0] });
    rt.after(14, () => {
      if (F.step !== 1) return;
      const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉景健の隊', anchor: { x: -20, z: -126 }, facing: 0, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'busho', n: 1, o: { name: '朝倉景健', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x5a4020 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 2 }], ASAKURA)));
      for (const u of g.units) if (u.type === 'busho') { u.dmg *= 0.5; u.announced = true; }
      F.w1.push(g);
      rt.say('足軽', '西からも来る！　朝倉景健の旗じゃ！', 3);
      rt.marker('w1', centerOf(g), () => `朝倉景健の隊・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // 段を重ねる（b_depth.js）：A 一の備の総掛かり → B 笙の川の渡り → C 夜の狭路（前後を挟まれる）
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true; F.dpOn = true;
    for (const k of ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']) rt.unmark(k);
    const L = which === 'A' ? LINES[0] : which === 'B' ? LINES[1] : LINES[2];
    const after = () => {
      F.dpOn = false;
      if (which === 'A') {
        if (F.cl) { F.cl.rout('A', { hideAfter: 14, from: -1 }); rt.after(24, () => F.cl.rout('B', { hideAfter: 6 })); }
        this.fallBack(rt, 1);
      } else if (which === 'B') this.fallBack(rt, 2);
      else this.win(rt, (F.dpMem || {}).kgStay ? '明智の鉄砲と最後の寄せを退け、殿も闇にまぎれて退く' : '松明を消し、闇にまぎれて朽木の方へ抜けた');
    };
    if (which === 'A') this.lineClash(rt);
    depthStart(rt, kgCtx(rt), which === 'A' ? kgA() : which === 'B' ? kgB() : kgC(), after);
  },
  // 一の備の西の田で、殿の他の手と朝倉の大軍が組み合う（軽い作り）。寄せの厚みを見せる
  lineClash(rt) {
    const F = rt.flags;
    if (F.cl) return;
    F.cl = clash(rt, { x: -40, z: -58, facing: Math.PI, w: 44, gap0: 30, closeSpeed: 3.4, seed: 1577, noRout: true, killRate: 0.14,
      surge: { k: 'B', every: 40, count: 140, flank: 0.35 },
      A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 320, team: 0, faction: 'oda' },
      B: { flag: 'asakura', armor: ASAKURA.armor, count: 620, team: 1, faction: 'saito', guns: true, flagRate: 0.5 } });
    F.cl.push('B', 0.3);
    rt.after(1, () => F.cl.go());
  },

  // 繰り引き：次の備まで退く（残った者が追ってくる）
  fallBack(rt, k) {
    const F = rt.flags;
    if (F.line >= k) return;
    F.line = k;
    F.step = k * 2;            // 2：二の備へ ／ 4：三の備へ
    F.stepT = rt.t;
    rt.setPhase('back' + k);
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2'); rt.unmark('w3');
    const L = LINES[k];
    sfx('kane', 0.9);
    rt.banner('退け！', `${L.name}まで繰り引き`);
    rt.say('木下藤吉郎', k === 1 ? `退けぇっ！　笙の川の南まで下がる！　${rt.G.lord ? '者ども' : nm(rt)}、遅れるな！` : '次の備じゃ！　狭路まで退け！　あそこなら大勢でも横に広がれぬ', 4);
    if (!rt.G.lord) {
      // 下知と同時に、自分の組にも「ついて来い」
      for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
      rt.obj('back', rt.squad.length ? `組を連れて${L.name}まで退け` : `${L.name}まで退け`, 'order');
      rt.zone('line', L.x, L.z, L.r);
      rt.marker('line', { x: L.x, z: L.z }, L.name, { h: 2 });
    }
    // 明智の鉄砲が先に下がって、次の備で待ち受ける
    const put = (g, dx, dz, f = Math.PI) => { g.order = 'move'; g.dest = { x: L.x + dx, z: L.z + dz }; g.speed = 3.4; g.formation = 'column'; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: L.x + dx, z: L.z + dz }; gg.facing = f; gg.formation = gg === F.akechi ? 'line' : 'yari'; }; };
    put(F.akechi, 18, 8);
    rt.after(3, () => { put(F.ikeda, -18, 2); put(F.kino, 0, 0); });
    // 残っている寄せ手は崩れて峠へ戻る
    for (const g of [...(F.w1 || []), ...(F.w2 || [])]) if (!gone(g)) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
    rt.after(k === 1 ? 4 : 3, () => (k === 1 ? this.wave2(rt) : this.wave3(rt)));
  },

  // ② 二の備：騎馬の追手が笙の川を渡ってくる
  wave2(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.ending) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('l2');
    sfx('taiko', 1);
    rt.banner('追い討ち', '朝倉の騎馬が追ってくる');
    rt.say('足軽', '騎馬じゃ！　川を渡ってくるぞ！', 2.5);
    rt.say('木下藤吉郎', '槍を揃えよ！　川を渡りきる所を突け！', 3);
    const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の騎馬の追手', anchor: { x: 4, z: -70 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 3.6 },
      dress([{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 10 }], ASAKURA)));
    for (const u of g.units) if (u.type === 'cavalry') u.dmg *= 0.6;
    const g2 = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の追手', anchor: { x: -30, z: -84 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 12, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 2.8 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASAKURA)));
    F.w2 = [g, g2];
    rt.marker('w2', centerOf(g), () => `騎馬の追手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.marker('w3', centerOf(g2), () => `朝倉の追手・${moraleWord(g2.morale)}`, { red: true, group: g2 });
  },

  // ③ 三の備：朝倉景鏡の本隊
  wave3(rt) {
    const F = rt.flags;
    if (F.step !== 4 || F.ending) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('l3');
    rt.world.setTime('dusk');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 1));
    rt.banner('朝倉の本隊', '日が傾く。主力が退ききるまで、狭路を守れ');
    rt.say('足軽', 'また来た……！　今度は大勢じゃ！', 2.5);
    rt.say('木下藤吉郎', 'ここが最後の踏ん張りどころじゃ。主力が朽木へ抜けきるまで、この狭路は通さぬ！', 4.5);
    rt.say('池田勝正', '池田の者ども、木下殿に遅れを取るな！', 3);
    const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の本隊', anchor: { x: -6, z: -10 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 16, morale: 100, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.4, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, invuln: true, hat: 'kabuto_w', haori: 0x4a3a1a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 2 }], ASAKURA)));
    for (const u of g.units) if (u.type === 'busho') { u.dmg *= 0.5; u.announced = true; }
    F.w3 = [g];
    // 苦しい戦：本隊の後ろから、もう一つの備が続いて狭路へ押し込む（大軍の厚み）
    rt.after(10, () => { if (F.ending || F.step !== 5) return;
    const g1b = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の二の備', anchor: { x: 14, z: -30 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 14, morale: 95, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.6, speed: 2.6 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], ASAKURA)));
    F.w3.push(g1b);
    rt.say('足軽', '後ろからもう一つ備が来る……！', 2.5);
    rt.after(16, () => { if (!F.ending) g1b.noRout = false; });
    });
    rt.after(13, () => {
      if (F.step !== 5 || F.ending) return;
      const g2 = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の新手', anchor: { x: 30, z: 0 }, facing: -0.3, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.42, speed: 2.8 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ASAKURA)));
      F.w3.push(g2);
      rt.say('足軽', '東の畦からも回り込んでくる！', 2.5);
      rt.marker('w5', centerOf(g2), () => `朝倉の新手・${moraleWord(g2.morale)}`, { red: true, group: g2 });
    });
    rt.after(20, () => { if (!F.ending) g.noRout = false; });
    rt.marker('w4', centerOf(g), () => `朝倉の本隊・${moraleWord(g.morale)}`, { red: true, group: g });
    // 日が落ちていく：薄暮から夜へ。道の脇に松明が灯り、闇にまぎれて退く
    rt.after(12, () => { if (!F.ending) applyLook(rt, DUSK2); });
    rt.after(23, () => {
      if (F.ending) return;
      F.night = true;
      applyLook(rt, NIGHT);
      for (const [x, z] of [[-26, 112], [-18, 96], [-36, 128], [-6, 86]]) rt.world.addFire(x, z, { torch: true, h: 1.5 });
      rt.say('木下藤吉郎', '日が暮れた。松明は道の脇と、先を行く者だけにせよ。闇にまぎれて退くぞ', 3.5);
      // 殿の兵の何人かだけが松明を持つ
      F.torches = carryTorches(rt.world, [...F.kino.units.filter((u) => u.type === 'ashigaru').slice(0, 3), ...F.ikeda.units.filter((u) => u.type === 'ashigaru').slice(0, 2)]);
    });
  },

  // しんがり崩れる：狭路を抜かれかけたら、負けにせず朽木の道の口への退き口を開ける（着けば生き延びて任務達成）
  collapse(rt) {
    const F = rt.flags;
    if (F.ending || F.fleeing) return;
    F.fleeing = rt.t;
    rt.setPhase('flee');
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    sfx('kane', 1);
    rt.banner('しんがり、崩れかける', '狭路はもう持たぬ。朽木の道の口へ退け');
    rt.say('木下藤吉郎', `もう持たぬ！　${nm(rt)}、狭路を捨てよ！　朽木の道の口まで走れ、生きて戻るのも殿の役目じゃ！`, 4.5);
    rt.obj('main', '狭路を捨て、朽木越えの道の口まで退け（生き延びれば殿の役目は果たせる）', 'main');
    rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '朽木越えの道', { h: 2 });
    rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
    for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
    for (const g of [F.kino, F.ikeda, F.akechi]) if (g && g.count) { g.order = 'move'; g.dest = { x: KUTSUKI.x + 6, z: KUTSUKI.z - 6 }; g.speed = 3.4; g.formation = 'column'; }
  },
  fleeTick(rt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    rt.objProgress('main', `朽木の道の口まで ${Math.max(0, Math.round(d - KUTSUKI.r))}m`);
    if (d < KUTSUKI.r) { rt.unmark('kutsuki'); rt.unzone('kutsuki'); this.win(rt, '散り散りになりながらも、朽木の道へ退いた'); return; }
    if (rt.t - F.fleeing > 60) this.lose(rt);
  },
  // 退き口に着けぬまま、朝倉に呑まれた
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('しんがり、崩れる', '朝倉勢が狭路を抜け、退く主力の背に追いすがった');
    rt.say('木下藤吉郎', '……ここまでか。散れ、散って生き延びよ！', 4);
    rt.finish({}, 9);
  },

  // 退き口成る
  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    rt.objDone('main');
    if (!F.strayed) rt.objDone('stay');
    rt.tracker.main = true;
    F.prog = RETREAT_T;
    rt.award((t) => { t.main = true; t.special = { label: '金ヶ崎の殿を務めた', pts: 25 }; }, '任務達成・退き口成る');
    survival(rt, '金ヶ崎のしんがりを生き延びた');
    for (const g of [...(F.w3 || []), ...(F.w2 || [])]) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    sfx('horagai', 0.8);
    rt.banner('退き口成る', how);
    rt.say('伝令', '申し上げます！　殿は朽木谷へ抜けられた由！', 4);
    rt.say('木下藤吉郎', `${nm(rt)}、生き延びたな。……しんがりの役目、しかと果たしたぞ。さあ、わしらも退くぞ！`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    KIT.backTick(rt);
    if (!F.ending) this.tickProg(rt, dt);
    if (F.torches) F.torches.update();
    const pct = this.retreatPct(rt);
    // 織田の主力：道を南西へ退き、朽木の方で見えなくなる
    const k = pct / 100;
    F.main.forEach((a, i) => {
      const t = Math.min(1, Math.max(0, k * 1.4 - i * 0.07));
      moveDA(rt, a, a.x0 + (-70 - a.x0) * t, a.z0 + (176 - a.z0) * t);
      a.m.visible = t < 0.97;
    });
    // 朝倉の大軍：少しずつ南へ
    F.host.forEach((a, i) => { const t = Math.min(1, rt.t / 260); moveDA(rt, a, a.x0, a.z0 + 40 * t + i * 4 * t); });
    if (F.ending) return;
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    if (F.fleeing) { this.fleeTick(rt); return; }
    depthTick(rt, dt);
    if (F.dpOn) {
      // 段の間は、しんがりが減っても任務は失わない（段は時間切れでも必ず次へ進む決まり）。減れば知らせるだけ
      const tono = F.kino.count + F.ikeda.count, tono0 = F.kino.initial + F.ikeda.initial;
      if (tono <= Math.round(tono0 * 0.4) && !F.tonoWarn) { F.tonoWarn = true; rt.bark('しんがりが崩れかけている！　踏みとどまれ！', true); }
      rt.objProgress('main', `主力の退き ${pct}%・しんがり ${tono}人`);
      return;
    }
    rt.objProgress('main', `主力の退き ${pct}%`);
    // 持ち場を離れて北へ深追いしたか
    const L = LINES[F.line];
    const ahead = L.z - p.z;
    if ((F.step === 1 || F.step === 3 || F.step === 5) && ahead > 38 && !F.strayed) {
      F.strayT = (F.strayT || 0) + dt;
      if (F.strayT > 4) { F.strayed = true; rt.violation('殿の持ち場を離れて深追いした', ['木下藤吉郎', '戻れ！　殿は勝つための戦ではない、退くための戦じゃ！']); rt.objFail('stay'); }
    } else F.strayT = 0;
    // 退く途中：自分が次の備に着いたか
    if (F.step === 2 || F.step === 4) {
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      rt.objProgress('back', d < L.r ? '着いた' : `あと ${Math.round(d - L.r)}m`);
      if (d < L.r && !F['in' + F.line]) {
        F['in' + F.line] = true;
        rt.objDone('back'); rt.objRemove('back'); rt.unzone('line'); rt.unmark('line');
        rt.award((t) => t.side.push(`${L.name}へ退いた`), `${L.name}へ退いた`);
        rt.say('木下藤吉郎', 'よし、揃ったな。槍を立てよ！', 2.5);
      }
      if (rt.t - F.stepT > 30 && d > L.r + 20 && !(F.lateT > rt.t)) {
        F.lateT = rt.t + 12;
        rt.bark(`${L.name}へ急げ！　取り残されるぞ`, true);
        // 取り残されると組の士気が落ち、藤吉郎が使番をよこして呼び戻す
        for (const g of rt.squadGroups || []) g.morale = Math.max(10, (g.morale || 0) - 8);
        if (!F['late' + F.line]) { F['late' + F.line] = true; rt.say('使番', `木下様より！　${nm(rt)}殿、早う退けとの仰せにござる！`, 3); }
      }
    }
    if (F.step === 1) {
      const all = F.w1.filter((g) => !gone(g));
      if ((F.w1.length >= 2 && !all.length) || rt.t - F.stepT > 28) this.deep(rt, 'A');
      // 朝倉景健は討たれない（この後も生きる）。隊が弱れば崩れて退く
      if (F.w1[1] && F.w1[1].count < 7) { F.w1[1].noRout = false; F.w1[1].morale = Math.min(F.w1[1].morale, 20); }
    }
    if (F.step === 3) {
      if (F.w2.every(gone) || rt.t - F.stepT > 22) this.deep(rt, 'B');
    }
    if (F.step === 5) {
      const live = F.w3.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `主力の退き ${pct}%・朝倉 ${live}人`);
      // 朝倉景鏡も討たれない（のちに義景を裏切る）。隊が弱れば崩れて退く
      if (F.w3[0].count < 8) { F.w3[0].noRout = false; F.w3[0].morale = Math.min(F.w3[0].morale, 20); }
      // 主力が退ききり、寄せが一息ついたら（あるいは長く持ちこたえたら）退き口成る
      // 藤吉郎の手（しんがり）が尽きかけたら崩れる
      // しんがり（藤吉郎の手と池田の手）の合わせて二割を切ったら崩れる
      //   （段で減った分は数えない：この備に着いた時の数から数える）
      const tono = F.kino.count + F.ikeda.count;
      if (F.tono5 === undefined) F.tono5 = tono;
      const tono0 = Math.max(F.tono5, 1);
      if (tono <= Math.min(Math.max(5, Math.round(tono0 * 0.2)), Math.floor(tono0 / 2)) && pct < 100) { this.collapse(rt); return; }
      if (tono <= Math.round(tono0 * 0.4) && !F.tonoWarn) { F.tonoWarn = true; rt.bark('しんがりが崩れかけている！　踏みとどまれ！', true); }
      // 本隊の寄せを凌いだら（あるいは長く持ちこたえたら）、夜の狭路の段へ。済めば退き口成る
      if ((F.w3more && F.w3.every(gone)) || rt.t - F.stepT > 40) this.deep(rt, 'C');
      else if (F.w3.length >= 2 && F.w3.every(gone) && !F.w3more) {
        // 早く崩しすぎたら、もう一押しが来る
        F.w3more = true;
        rt.after(6, () => {
          if (F.ending) return;
          const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の後続', anchor: { x: 0, z: -20 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, speed: 2.8 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }], ASAKURA)));
          F.w3.push(g);
          rt.say('木下藤吉郎', 'まだ来るか。主力が抜けるまで、あと少しじゃ！', 3);
        });
      }
    }
  },

  // 信長で遊ぶ時：殿の戦いは後ろで続き、信長は旗本と朽木越えの道の口へ退く。追手の騎馬が道を追ってくる
  lordTick(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 殿の備は、もとの流れのまま繰り引く（寄せが尽きるか、時が経てば次の備へ）
    if (F.step === 1 && ((F.w1.length >= 2 && F.w1.every(gone)) || rt.t - F.stepT > 40)) this.fallBack(rt, 1);
    if (F.step === 3 && (F.w2.every(gone) || rt.t - F.stepT > 32)) this.fallBack(rt, 2);
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    const sq = rt.squad.filter((u) => u.alive), near = sq.filter((u) => Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 40).length;
    const PASS = 70;   // 松永久秀が朽木元綱を説くあいだ、谷の口で持ちこたえる秒
    if (F.pass) rt.objProgress('main', `朽木の返事まで あと${Math.max(0, Math.ceil(F.pass + PASS - rt.t))}秒・旗本 ${near}/${sq.length}人`);
    else rt.objProgress('main', `朽木口まで ${Math.max(0, Math.round(d - KUTSUKI.r))}m・付いて来る旗本 ${near}/${sq.length}人`);
    // 谷の口に着いたら、朽木元綱が通すかどうか。松永久秀が説く間、追手を防ぐ
    if (!F.pass && d < KUTSUKI.r) {
      F.pass = rt.t;
      sfx('kane', 0.8);
      rt.banner('朽木谷の口', '朽木元綱は通すか、討つか');
      rt.say('松永久秀', '殿、朽木元綱はわしが説いてまいりまする。しばし、ここでお待ちを', 4);
      rt.say('織田信長', '急げ。……旗本は谷の口を固めよ。追手を通すな', 3.5);
      rt.after(14, () => {
        if (F.ending) return;
        const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の追手', anchor: { x: -6, z: 80 }, facing: 0, aggro: 12, width: 12, morale: 80, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.5, speed: 3 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }], ASAKURA)));
        g.order = 'move'; g.dest = { x: KUTSUKI.x + 8, z: KUTSUKI.z - 14 };
        g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; };
        rt.say('足軽', '朝倉の追手、谷の口へ寄せてまいる！', 3);
        rt.marker('chase2', centerOf(g), () => `朝倉の追手・${moraleWord(g.morale)}`, { red: true, group: g });
        F.chaser2 = g;
      });
    }
    if (F.chaser2 && gone(F.chaser2)) rt.unmark('chase2');
    // 陣を離れたら、朝倉の騎馬が追ってくる
    if (!F.chase && p.z > 20) {
      F.chase = true;
      rt.after(6, () => {
        if (F.ending) return;
        const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の騎馬の追手', anchor: { x: 10, z: -30 }, facing: 0, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55, speed: 3.8 },
          dress([{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 8 }], ASAKURA)));
        g.order = 'move'; g.dest = { x: KUTSUKI.x + 10, z: KUTSUKI.z - 20 };
        g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; };
        F.chaser = g;
        rt.say('足軽', '朝倉の騎馬が追うて来る！　殿をお守りせよ！', 3);
        rt.marker('chase', centerOf(g), () => `騎馬の追手・${moraleWord(g.morale)}`, { red: true, group: g });
      });
    }
    if (F.chaser && gone(F.chaser)) { rt.unmark('chase'); }
    // 旗本が揃わないまま長く待たせない（40秒過ぎれば、遅れた旗本は後から来るものとして通る）
    if (F.pass && rt.t - F.pass >= PASS && d < KUTSUKI.r + 20 && (near >= Math.ceil(sq.length * 0.5) || rt.t - F.pass >= PASS + 40)) {
      F.ending = true;
      rt.setPhase('end');
      rt.unmark('kutsuki'); rt.unzone('kutsuki'); rt.unmark('chase'); rt.unmark('chase2');
      rt.say('松永久秀', '殿、朽木は通すと申しておりまする！', 3);
      rt.objDone('main');
      rt.tracker.main = true;
      rt.award((t) => { t.main = true; t.special = { label: '朽木越えに京へ退いた', pts: 25 }; }, '任務達成・京へ退く');
      sfx('horagai', 0.8);
      rt.banner('朽木越え', '信長、わずかな供と京へ退く');
      rt.say('伝令', '申し上げます！　殿（しんがり）の木下殿、朝倉を食い止めておりまする！', 4);
      rt.say('織田信長', '生きて帰れば、また戦える。……京へ急ぐぞ', 4);
      rt.player.u.invuln = true;
      rt.finish({}, 10);
    } else if (F.pass && rt.t - F.pass >= PASS && !(F.waitSq > rt.t)) { F.waitSq = rt.t + 10; rt.bark(d > KUTSUKI.r + 20 ? '朽木谷の口へ戻れ（印の輪の中へ）' : '旗本が遅れている。「ついて来い」の号令で呼び寄せよ', true); }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1) {
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、退く`, '深手を負い、峠へ担ぎ込まれた');
      if (v.group) { v.group.noRout = false; v.group.morale -= 35; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、織田 一万二千、朝倉・浅井 二万五千）。殿は三千ほど
kanegasaki.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(2000, 12000 - (F.ak || 0) * 30), a0: 12000, b: Math.max(5000, 25000 - (F.ek || 0) * 40), b0: 25000 };
};
kanegasaki.sides = { a: { name: '織田軍（しんがり）', mon: 'oda' }, b: { name: '朝倉軍（背に浅井）', mon: 'asakura' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
kanegasaki.famous = [
  { name: '朝倉景鏡', g: /本隊|追手|新手/, loose: 1, line: '朝倉景鏡なり！　織田の殿など、一人も生きて返すな！' },
];
kanegasaki.date = (rt) => `元亀元年四月二十八日　夏・晴・${rt.flags.night ? '夜' : rt.world.timeKey === 'dusk' ? '夕暮れ' : '昼下がり'}`;
kanegasaki.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '朝倉の寄せまで待つ' : '');
kanegasaki.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
kanegasaki.history = '元亀元年四月、織田信長は越前の朝倉義景を攻め、手筒山城と金ヶ崎城を落とした。ところが妹・お市の夫である北近江の浅井長政が朝倉方につき、織田勢は前後を挟まれる形になった。信長はわずかな供で朽木越えに京へ逃れ、金ヶ崎には木下藤吉郎（のちの羽柴秀吉）・明智光秀・池田勝正らが殿として残り、朝倉の追撃を防ぎながら退いたと伝わる（金ヶ崎の退き口）。お市が両端を縛った小豆の袋を送って危うさを知らせたという話は、後の書物に出るもので確かではない。この戦の後、信長は兵を立て直し、六月に姉川で浅井・朝倉と戦った。追いすがった朝倉の将の名は伝えによって違い、この戦では「朝倉の本隊」としている。信長は朽木谷を越えて、二日後の晦日に京へ入った。';

// 素直な遊び手：持ち場の備のそばで寄せ手を突き、「退け」の下知が出たら次の備へ走る
kanegasaki.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  const L = LINES[F.line];
  // 退く途中は、まず次の備へ
  if ((F.step === 2 || F.step === 4) && !F['in' + F.line]) {
    const e = b.army.nearestEnemy(u, 2.6, (o) => !o.fleeing);
    if (e) { p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); inp.leftPressed = Math.random() < 0.5; return; }
    goTo(p, inp, L.x, L.z, 3);
    return;
  }
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, L.x, L.z + 14, 2); return; }
  const e = b.army.nearestEnemy(u, 14, (o) => !o.fleeing && !o.invuln && L.z - o.pos.z < 30);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, L.x + 3, L.z + 3, 3);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 敵は小勢をぽつぽつ出さない：一つの波は、近くの本物の兵＋後ろに数百の控え。前・左右・後ろから同時に来て、殿を包み込む
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n }), uB = (n) => ({ type: 'bow', n });
const AZAI = { armor: 0x2e2a26, lace: 0x3c5a48, flag: 'azai' };
const az = (list) => ({ flag: 'azai', armor: AZAI.armor, list: dress(list, AZAI) });
// 鉄砲組：鉄砲だけの組（六割より多くが鉄砲）は、並んで構え、号令で一斉に撃つ（units.js）
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
function kgCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'asakura', armor: ASAKURA.armor, dmg: 0.55, mass: 240, look: (l) => dress(l, ASAKURA),
    aid: { name: '殿の新手', faction: 'oda', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }] }, aidSaid: '殿の新手が駆けつけた。組の横に付け',
    friends: () => [F.kino, F.ikeda, F.akechi, F.tez].filter((g) => g && g.count && !g.routed) };
}
// A 一の備：朝倉の総掛かり → 天筒山の城兵を救うか
function kgA() {
  const L = LINES[0];
  return [
    rest({ dur: 4, heal: 0.3, say: [['木下藤吉郎', '先手は凌いだ。……じゃが見よ、峠の道一面が三つ盛木瓜じゃ'], ['足軽', 'あれが全部、こっちへ来るのか……'], ['木下藤吉郎', '主力はまだ半ばも退いておらぬ。ここで踏ん張らねば、皆死ぬぞ']] }),
    hold({ at: { x: L.x, z: L.z }, dur: 24, r: 14, title: '朝倉の総掛かり', sub: '峠の道から、前にも左右にも朝倉の旗', label: '一の備', obj: '一の備で、前と左右から押し寄せる朝倉の総掛かりを受けよ',
      say: [['木下藤吉郎', '槍を揃えよ！　横へ回られても備を崩すな！']],
      waves: [
        { t: 2, say: ['足軽', '来たぞ、一面じゃ！'], foes: () => [{ name: '朝倉の総掛かり', from: { x: L.x, z: L.z - 60 }, list: [uS(3), uA(13)], mass: 340, noRout: 30 }] },
        { t: 10, say: ['明智光秀', '天筒山の麓に鉄砲衆が並んだ。伏せよ、構えを見たら味方の陰へ！'], foes: () => [gunLine('朝倉の鉄砲衆', { x: L.x + 34, z: L.z - 40 }, 7)] },
        { t: 17, say: ['足軽', '西の田を回ってくる！　横を突かれるぞ！'], foes: () => [{ name: '西へ回る朝倉勢', from: { x: L.x - 50, z: L.z - 20 }, off: { x: -8, z: 0 }, list: [uS(2), uA(10)], mass: 240 }] },
        { t: 23, say: ['池田勝正', '東の浜からもじゃ！　囲まれるぞ、背を合わせよ！'], foes: () => [{ name: '浜を回る朝倉勢', from: { x: L.x + 54, z: L.z + 6 }, off: { x: 8, z: 4 }, list: [uS(2), uA(9), uB(3)], mass: 220 }] },
      ],
      reward: '一の備で朝倉の総掛かりを受け止めた', lost: ['木下藤吉郎', '備が押し込まれた……！　立て直せ！'] }),
    rest({ dur: 4, bark: '息を整え、組を寄せ直せ', say: [['伝令', '天筒山に残った味方が、朝倉に囲まれておりまする！　麓へ下りられぬと！']] }),
    pick({ time: 10, title: '天筒山の味方が朝倉に囲まれた。どうする？',
      options: [{ label: '組を連れて、天筒山の味方を救い出す', note: '救えば城兵が殿に加わる。一の備は薄くなり、主力の退きが遅れる' }, { label: '見捨てて、一の備を固める', note: '主力は早く退ける。城兵は討たれ、朝倉の勢いが増す' }],
      on: (rt, m, i) => {
        m.kgSave = i === 0;
        if (i === 1) { rt.flags.prog = (rt.flags.prog || 0) + 40; rt.say('木下藤吉郎', '……すまぬ。一の備を崩すわけにはいかぬ', 3); rt.after(4, () => rt.say('足軽', '天筒山の旗が……倒れていく', 3)); }
        else rt.say('木下藤吉郎', 'よし、行け！　深入りはするな、救い出したらすぐ戻れ', 3);
      } }),
    fight({ skip: (rt, m) => !m.kgSave, at: { x: 34, z: -76 }, title: '天筒山の麓', sub: '取り残された城兵を、朝倉が取り巻いている', obj: '天筒山の麓で、城兵を取り巻く朝倉勢を崩せ',
      foes: () => [{ name: '天筒山を囲む朝倉勢', from: { x: 58, z: -96 }, list: [uS(2), uA(9)], mass: 260 }, gunLine('山腹の朝倉の鉄砲', { x: 20, z: -104 }, 6)],
      later: [{ t: 16, title: '横槍', sub: '朝倉の騎馬が浜から', say: ['足軽', '浜から騎馬じゃ！　帰り道を断つ気じゃ！'], foes: () => [{ name: '朝倉の騎馬', from: { x: 80, z: -40 }, list: [uS(1), uC(4), uA(4)], mass: 120, kind: 'cavalry' }] }],
      max: 32,
      reward: '天筒山の城兵を救い出した',
      onEnd: (rt, m, won) => {
        const F = rt.flags;
        F.tez = allyGroup(rt, { faction: 'oda', name: '天筒山の城兵', anchor: { x: 34, z: -70 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, dmgMult: 0.75 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: won ? 9 : 5 }, { type: 'gun', n: 2 }], ODA));
        rt.say('城兵', won ? 'かたじけない！　この命、殿（しんがり）に預けまする' : '……生き残ったのはこれだけじゃ。共に退かせてくだされ', 3.5);
      } }),
  ];
}
// B 二の備（笙の川の南）：渡りをどう受けるか → 川の攻防（四方から）→ 浅井の旗、背後の尾根
function kgB() {
  const L = LINES[1];
  return [
    rest({ dur: 4, heal: 0.3, say: [['木下藤吉郎', '騎馬は追い払うた。……川向こうに朝倉の本隊が揃うておる'], ['明智光秀', '藤吉郎殿、川を渡る所を撃てば、数を削れまする']] }),
    pick({ time: 10, title: '朝倉の本隊が笙の川を渡ろうとしている。どう受ける？',
      options: [{ label: '明智の鉄砲を前に出し、渡る所を撃つ', note: '正面の寄せは薄くなる。槍が薄い分、西の浅瀬から回られやすい' }, { label: '槍を揃えて、川岸で受け止める', note: '横は固い。正面から大勢がぶつかってくる' }],
      on: (rt, m, i) => {
        m.kgGun = i === 0;
        const F = rt.flags;
        if (i === 0 && F.akechi.count) { F.akechi.anchor = { x: L.x + 6, z: L.z - 6 }; F.akechi.formation = 'line'; rt.say('明智光秀', '鉄砲、前へ。……渡りきる前に放て！', 3);
          volleyScene(rt, { guns: () => [F.akechi], at: { x: L.x + 4, z: L.z - 14 }, r: 30, who: '明智光秀', shots: 2, wait: '川に入るまで待て……', fire: '川の中じゃ、放てぇっ！', hit: 18 }); }
        else rt.say('木下藤吉郎', '槍衾じゃ！　川から上がる所を突け！', 3);
      } }),
    hold({ at: { x: L.x, z: L.z }, dur: 26, r: 14, title: '笙の川の攻防', sub: '朝倉の本隊が、川を押し渡ってくる', label: '二の備', obj: '笙の川の南で、川を押し渡る朝倉勢を受けよ',
      waves: [
        { t: 2, say: ['足軽', '川へ入ったぞ！　すごい数じゃ……'], foes: (rt, m) => [{ name: '川を渡る朝倉の本隊', from: { x: L.x, z: L.z - 50 }, list: [uS(3), uA(m.kgGun ? 9 : 14)], mass: m.kgGun ? 240 : 380, noRout: 25 }] },
        { t: 9, say: ['明智光秀', '向こう岸に鉄砲衆が並んだ！　伏せよ！'], foes: () => [gunLine('向こう岸の朝倉の鉄砲衆', { x: L.x + 20, z: L.z - 36 }, 8)] },
        { t: 16, say: ['足軽', '西の浅瀬を渡ってくる！　横じゃ！'], foes: (rt, m) => [{ name: '西の浅瀬を渡る朝倉勢', from: { x: L.x - 56, z: L.z - 16 }, off: { x: -8, z: 2 }, list: [uS(2), uA(m.kgGun ? 13 : 9)], mass: m.kgGun ? 320 : 220 }] },
        { t: 23, say: ['池田勝正', '東もじゃ！　河口を渡って回り込んできた！'], foes: () => [{ name: '河口を渡る朝倉勢', from: { x: L.x + 56, z: L.z - 8 }, off: { x: 8, z: 4 }, list: [uS(2), uA(9)], mass: 240 }] },
      ],
      reward: '笙の川で朝倉の本隊を受け止めた', lost: ['木下藤吉郎', '押し込まれた……！　じゃが、まだ崩れてはおらぬ！'] }),
    rest({ dur: 4, bark: '川を離れ、組をまとめ直せ', say: [['足軽', '南東の山に……あれは浅井の旗じゃ！'], ['木下藤吉郎', '後ろにも回られたか。狭路の口を塞がれたら、逃げ場はないぞ']] }),
    pick({ time: 10, title: '南東の尾根に浅井の物見が出た。狭路の口に回り込まれる。どうする？',
      options: [{ label: '尾根へ上がり、浅井の物見を追い払う', note: '狭路で後ろから挟まれにくくなる。手柄。主力の退きは遅れる' }, { label: '構わず、狭路へ急ぐ', note: '主力が早く退ける。狭路で浅井に後ろを突かれる' }],
      on: (rt, m, i) => { m.kgRidge = i === 0; if (i === 1) rt.flags.prog = (rt.flags.prog || 0) + 60; rt.say('木下藤吉郎', i === 0 ? 'よし、尾根じゃ！　浅井に狭路の口を渡すな' : '……急げ。狭路で前後を受けるほかない', 3); } }),
    fight({ skip: (rt, m) => !m.kgRidge, at: { x: 26, z: 64 }, title: '南東の尾根', sub: '浅井の物見が、狭路の口へ下りてくる', obj: '南東の尾根で、浅井の物見を追い払え',
      foes: () => [{ name: '浅井の物見', from: { x: 70, z: 110 }, ...az([uS(2), uA(10), uG(2)]), mass: 200 }],
      later: [{ t: 15, title: '新手', sub: '浅井の騎馬が山を下る', say: ['足軽', '浅井の騎馬じゃ！'], foes: () => [{ name: '浅井の騎馬', from: { x: 84, z: 90 }, ...az([uS(1), uC(4), uA(3)]), mass: 100, kind: 'cavalry' }] }],
      max: 28,
      reward: (t) => { t.special = { label: '浅井の物見を追い払った', pts: 20 }; }, rewardLabel: '浅井の物見を追い払った' }),
  ];
}
// C 夜の狭路：前に朝倉、後ろに浅井。最後に残るか、闇にまぎれて退くか
function kgC() {
  const L = LINES[2];
  return [
    rest({ dur: 4, heal: 0.25, say: [['木下藤吉郎', '……ようここまで生きておる。じゃが、まだじゃ'], ['足軽', '（松明の向こうに、またあの旗が……）'], ['木下藤吉郎', '主力が朽木へ抜けきるまで、あと少し。この狭路で、前も後ろも受ける']] }),
    hold({ at: { x: L.x, z: L.z }, dur: 25, r: 12, title: '夜の狭路', sub: '前に朝倉、後ろに浅井。尾根からも', label: '三の備（狭路）', obj: '夜の狭路で、前と後ろと尾根から来る敵を受けよ',
      say: [['木下藤吉郎', '背を合わせよ！　前の者は前を、後ろの者は後ろを見よ！']],
      waves: [
        { t: 2, say: ['足軽', '闇の中から、松明が……数えきれぬ！'], foes: () => [{ name: '夜の朝倉勢', from: { x: L.x + 16, z: L.z - 56 }, list: [uS(3), uA(13)], mass: 360, noRout: 30 }] },
        { t: 8, say: ['明智光秀', '火縄の火が並んでおる……鉄砲衆じゃ、伏せよ！'], foes: () => [gunLine('闇の中の朝倉の鉄砲衆', { x: L.x + 6, z: L.z - 40 }, 8)] },
        { t: 14, say: ['足軽', '後ろじゃ！　浅井が後ろから来た！'], foes: (rt, m) => [{ name: '後ろから来る浅井勢', from: { x: L.x - 26, z: L.z + 52 }, ...az([uS(2), uA(m.kgRidge ? 7 : 12), uG(m.kgRidge ? 0 : 2)]), mass: m.kgRidge ? 160 : 300 }] },
        { t: 20, say: ['池田勝正', '尾根からも下りてくる！　四方じゃ！'], foes: () => [{ name: '西の尾根の朝倉勢', from: { x: L.x - 36, z: L.z - 10 }, list: [uS(1), uA(8)], mass: 180 }, { name: '東の尾根の朝倉勢', from: { x: L.x + 34, z: L.z + 4 }, list: [uS(1), uA(8)], mass: 180 }] },
        { t: 25, say: ['木下藤吉郎', '最後の大波じゃ！　これを凌げ！'], foes: () => [{ name: '朝倉の最後の寄せ', from: { x: L.x + 10, z: L.z - 60 }, list: [uS(3), uA(14), uG(2)], mass: 400 }] },
      ],
      reward: '夜の狭路を前後から守り抜いた', lost: ['木下藤吉郎', '……まだ立っておるか。それで十分じゃ！'] }),
    rest({ dur: 4, bark: '闇の中で、組の者を呼び集めよ', say: [['伝令', '主力はほぼ朽木谷へ入りました！'], ['明智光秀', '藤吉郎殿、鉄砲の者は最後まで残ります。貴殿らは先に']] }),
    pick({ time: 10, title: '主力はほぼ抜けた。明智の鉄砲が最後まで残ると言う。どうする？',
      options: [{ label: '明智殿と共に残り、最後の寄せを受ける', note: '大手柄。ただし、もう一度朝倉の大波を受ける' }, { label: '松明を消し、闇にまぎれて先に退く', note: '朽木の方へ走る。途中で待ち伏せに遭うかもしれぬ' }],
      on: (rt, m, i) => { m.kgStay = i === 0; rt.say('木下藤吉郎', i === 0 ? 'よし、明智殿一人に手柄はやらぬぞ。……残る！' : '松明を消せ。声を立てるな。……走れ', 3); } }),
    hold({ skip: (rt, m) => !m.kgStay, at: { x: L.x, z: L.z + 6 }, dur: 16, r: 12, title: '殿の殿', sub: '明智の鉄砲と、最後まで狭路に残る', label: '狭路', obj: '明智の鉄砲と共に、最後の寄せを退けよ',
      waves: [
        { t: 2, say: ['明智光秀', '引きつけよ……放て！'], foes: () => [{ name: '朝倉の追い討ち', from: { x: L.x + 14, z: L.z - 56 }, list: [uS(3), uA(12)], mass: 340 }] },
        { t: 12, say: ['足軽', '騎馬じゃ！　狭路へ突っ込んでくる！'], foes: () => [{ name: '朝倉の騎馬', from: { x: L.x + 8, z: L.z - 60 }, list: [uS(1), uC(5), uA(4)], mass: 120, kind: 'cavalry' }] },
      ],
      reward: '明智の鉄砲と最後まで殿に残った' }),
    move({ skip: (rt, m) => m.kgStay, to: { x: KUTSUKI.x, z: KUTSUKI.z - 6 }, r: 10, label: '朽木の方へ', obj: '松明を消し、闇にまぎれて朽木の方へ退け',
      say: [['木下藤吉郎', '走れ！　振り向くな！']],
      ambush: { d: 26, t: 13, title: '待ち伏せ', sub: '浅井の手が道を塞ぐ', say: ['足軽', '道の先に浅井の手じゃ！　斬り抜けろ！'], foes: () => [{ name: '道を塞ぐ浅井勢', from: { x: KUTSUKI.x + 20, z: KUTSUKI.z + 10 }, ...az([uS(1), uA(8)]), mass: 160 }] } }),
  ];
}

export { kanegasaki };
