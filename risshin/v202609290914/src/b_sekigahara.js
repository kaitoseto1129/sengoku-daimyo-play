// ======================================================================
// 関ヶ原　関ヶ原の戦い（慶長五年九月十五日）
// 美濃の関ヶ原。西の山すそに西軍（石田・宇喜多・小西・大谷）、東の野に東軍。南の松尾山に小早川秀秋。
// 足軽は東軍・藤堂高虎の手。朝霧の中で大谷方（平塚為広・戸田勝成）と押し合い、
// 小早川の寝返りで大谷勢が崩れると西軍は総崩れ。最後に島津が敵中を突っ切って退く（島津の退き口）
// 向き：西が -x、北が -z。松尾山は南西（-x, +z）
// ======================================================================
import { nobori, jinmaku, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, rest, pick, fight, hold } from './b_depth.js';

const FUJI = [[-66, -180], [-60, -80], [-68, 20], [-62, 100], [-70, 180]];   // 藤古川
const TODO = { x: 18, z: 50 };          // 藤堂高虎の手（はじめの持ち場）
const FRONT = { x: -16, z: 52 };        // 霧の中で押し出す先
const MATSUO = { x: -40, z: 136 };      // 松尾山
const SHIMA_PATH = [{ x: -70, z: -24 }, { x: -24, z: 22 }, { x: 18, z: 62 }, { x: 70, z: 96 }, { x: 170, z: 120 }];   // 島津の退き口（伊勢街道へ）
const FOG_T0 = 30, FOG_T1 = 105;        // 霧の晴れはじめと晴れきり（秒）

// 西軍の家ごとの見た目（大谷方の旗は、豊臣の五七桐で代える）
const OTANI = { armor: 0x2c2a2a, lace: 0x6a5a3a, flag: 'otani' };
const SHIMAZU = { armor: 0x1e1c1c, lace: 0x3a3a3a, flag: 'shimazu' };
const KOBA = { armor: 0x2a2622, lace: 0x5a3a2a, flag: 'kobayakawa' };
const TODO_LK = { flag: 'todo' };
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
// 西軍の鉄砲は、当たれば痛いが一発では倒れない強さに（霧の中で一人の足軽が撃ち抜かれて終わらないように）
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4; return g; };
const lerp = (a, b, t) => a + (b - a) * t;
const MIST = { r: 0.8, g: 0.82, b: 0.81 };   // 朝霧の色

// 軽い大軍の合戦（world.addClash）を置く。音と硝煙は戦の側のもの。A・B に team と faction を渡すと、プレイヤーが寄った所は本物の兵に替わる
export function clash(rt, o) {
  return rt.world.addClash({ rt, play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke(x, y, z, fx, fz), ...o });
}

// 一斉射：味方の鉄砲組（guns。isGun の組）を込めたまま待たせ、敵の隊（foe）が r まで寄ったら「放て」で一度に撃たせる。
// 撃った時に敵の気（morale）を hit だけ落とし、崩れやすくする。clash を渡すとその軽い大軍も撃つ。update で毎コマ volleyTick を呼ぶ
export function volleyTick(rt, dt, V) {
  if (!V || V.st === 2) return;
  const guns = V.guns().filter((g) => g && g.count && !g.routed);
  const foe = V.foe();
  if (!guns.length || !foe || !foe.count || foe.routed) { for (const g of guns) g.holdFire = false; if (V.st === 1) V.st = 2; return; }
  if (!V.st) { V.st = 1; V.t = 0; for (const g of guns) g.holdFire = true; if (V.wait) rt.say(V.who, V.wait, 2.5); }
  V.t += dt;
  const a = guns[0].center();
  let d = Infinity;
  for (const u of foe.units) if (u.alive) d = Math.min(d, Math.hypot(u.pos.x - a.x, u.pos.z - a.z));
  if (d > (V.r || 30) && V.t < (V.max || 50)) return;
  V.st = 2;
  for (const g of guns) g.holdFire = false;
  rt.say(V.who, V.line || '引きつけた……放てぇっ！', 2);
  rt.banner('一斉射', V.sub || '敵の前が崩れる');
  sfx('volley', 0.9);
  rt.army.play('gun', a, 1.5);
  if (V.clash) V.clash.volley(V.side || 'A');
  foe.morale = Math.max(0, foe.morale - (V.hit || 30));
  if (V.then) rt.after(1.5, () => V.then(rt));
}

const sekigahara = {
  // 敵の打ち込みの重さ（bot が楽に勝ちすぎたので締める。player.js の takeDamage）
  foeHit: 1.1,
  spawn: { x: TODO.x + 4, z: TODO.z + 3, heading: -Math.PI / 2 },
  world: {
    seed: 160,
    time: 'day',
    mood: 'morning',   // 朝霧の中で始まった戦（朝の光）
    muddy: 0.45,   // 夜来の雨で足もとがぬかるむ
    paths: [[[178, 4], [90, 8], [30, 16], [-20, 14], [-70, 6], [-178, -4]], [[-20, 14], [-60, -60], [-100, -150]], [[20, 20], [60, 78], [110, 104], [178, 122]]],
    height(x, z) {
      let h = 0.6 * Math.sin(x * 0.03) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.05 + x * 0.03);
      // 松尾山（南西）・天満山・笹尾山（西）・南宮山（南東）・桃配山（東）
      h += 32 * gauss(x, z, MATSUO.x, MATSUO.z + 8, 2200) + 14 * gauss(x, z, -122, 8, 1400) + 18 * gauss(x, z, -122, -122, 1300);
      h += 30 * gauss(x, z, 160, 160, 3000) + 9 * gauss(x, z, 150, -6, 900);
      // まわりの山並み（盆地）
      h += Math.max(0, Math.abs(z) - 150) * 0.35 + Math.max(0, -x - 150) * 0.3;
      return h;
    },
    tint(x, z, h, c) {
      // 雨上がりの田は湿って黒ずむ
      if (Math.abs(x) < 70 && Math.abs(z) < 110) c.setRGB(c.r * 0.9, c.g * 0.92, c.b * 0.86);
      if (h > 8) c.setRGB(c.r * 0.85, c.g * 0.95, c.b * 0.85);
    },
    clear: (x, z) => Math.abs(x) < 80 && Math.abs(z) < 100,
    paddy(x, z) {
      if (x < -50 || x > 90 || z < -90 || z > 96) return 0;
      if (Math.abs(z - 14) < 6) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 11)) % 3 === 1) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 11) + 11) % 11, 11 - ((z % 11) + 11) % 11);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    streams: [{ pts: FUJI, w: 2.6, depth: 1.2 }],
    trees: 360,
    tufts: 4000,
    treeDensity: (x, z) => (Math.abs(x) > 90 || Math.abs(z) > 110 ? 1 : 0.2),
    groves: [{ x: MATSUO.x, z: MATSUO.z, r: 22, n: 40 }, { x: -100, z: 60, r: 12, n: 18 }, { x: 60, z: -60, r: 12, n: 16 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0;
    F.fog = 1;
    // ---- 東軍：藤堂高虎の手（自分の持ち場）と、京極高知の手 ----
    const todo = allyGroup(rt, { faction: 'tokugawa', name: '藤堂高虎の手', anchor: { ...TODO }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      dress([{ type: 'samurai', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true, hat: 'kabuto_t', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], TODO_LK));
    todo.defMult = 1.3; todo.dmgMult = 0.8;
    F.todo = todo; F.todoU = todo.units[0];
    F.kyo = allyGroup(rt, { faction: 'tokugawa', name: '京極高知の手', anchor: { x: 18, z: 78 }, facing: -Math.PI / 2, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      dress([{ type: 'samurai', n: 1, o: { name: '京極高知', hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], { flag: 'kyogoku' }));
    F.kyo.defMult = 1.3; F.kyo.dmgMult = 0.8;
    F.todo2 = allyGroup(rt, { faction: 'tokugawa', name: '藤堂の二陣', anchor: { x: 30, z: 38 }, facing: -Math.PI / 2, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], TODO_LK));
    F.tera = allyGroup(rt, { faction: 'tokugawa', name: '寺沢広高の手', anchor: { x: 28, z: 94 }, facing: -Math.PI / 2, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '寺沢広高', hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]);
    for (const g of [F.todo2, F.tera]) { g.defMult = 1.3; g.dmgMult = 0.8; }
    // 藤堂の鉄砲組：霧の中、平塚の隊が寄せきった所で一斉に放つ（open の後の volleyTick）
    F.gunG = allyGroup(rt, { faction: 'tokugawa', name: '藤堂の鉄砲組', anchor: { x: TODO.x + 2, z: TODO.z - 10 }, facing: -Math.PI / 2, width: 10, aggro: 30, noRout: true, formation: 'line', order: 'hold' },
      dress([{ type: 'samurai', n: 1, o: { hat: 'kabuto_m' } }, { type: 'gun', n: 8 }], TODO_LK));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: TODO.x + 4, z: TODO.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n }]);

    // ---- 西軍：大谷方の平塚為広・戸田勝成（霧の向こう、藤古川の手前） ----
    F.hira = enemyGroup(rt, { faction: 'saito', name: '平塚為広の隊', anchor: { x: -44, z: 46 }, facing: Math.PI / 2, fleeDir: { x: -1, z: -0.2 }, aggro: 9, width: 16, noRout: true, dmgMult: 0.62 },
      dress([{ type: 'busho', n: 1, o: { name: '平塚為広', horse: true, invuln: true, hat: 'kabuto_w', haori: 0x4a3a2a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }, { type: 'gun', n: 5 }], OTANI));
    soften(F.hira);
    F.toda = enemyGroup(rt, { faction: 'saito', name: '戸田勝成の隊', anchor: { x: -46, z: 80 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0.1 }, aggro: 9, width: 14, noRout: true, dmgMult: 0.62 },
      dress([{ type: 'busho', n: 1, o: { name: '戸田勝成', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x3a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 4 }], OTANI));

    soften(F.toda);
    // 大谷方の平塚の隊の後ろに、同じ旗の控え
    KIT.backOf(rt, F.hira, { flag: 'otani', armor: OTANI.armor, kind: 'spear', w: 18, depth: 10, count: 130, seed: 153 });
    // ---- 陣と旗 ----
    // 本陣：大谷吉継（藤川台）と家康（桃配山）。陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    // 見に行けば大将と旗本がいる（camp：大将・旗本・控え・使番）
    F.otaniH = camp(rt, { x: -104, z: 62, facing: Math.PI / 2, team: 1, faction: 'saito', mon: 'otani', armor: OTANI.armor, uma: 'fukube',
      general: { name: '大谷吉継', hat: 'kabuto_w', haori: 0xd8d2c0 }, guard: 15, reserve: 160, runTo: { x: -60, z: 60 } });
    camp(rt, { x: 150, z: -6, facing: -Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f,
      general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 15, reserve: 200, runTo: { x: 60, z: 20 } });
    for (const [x, z, k] of [[-96, 50, 'toyotomi'], [-112, 50, 'toyotomi'], [-122, -116, 'ishida'], [-116, -126, 'ishida'], [-86, -58, 'shimazu'], [-116, 4, 'ukita']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z, k] of [[140, -16, 'onri'], [160, -16, 'tokugawa'], [8, 44, 'todo'], [8, 58, 'todo'], [8, 72, 'kyogoku'], [8, 86, 'kyogoku']]) rt.scene.add(nobori(W, x, z, k, x > 100 ? 7 : 5));
    for (const [x, z] of [[-46, 126], [-34, 130], [-40, 144]]) rt.scene.add(nobori(W, x, z, 'kobayakawa', 6));
    rt.scene.add(tawara(W, 40, 60, 0.4, 5));
    // 遠景の村（関ヶ原の宿のはずれ）
    KIT.farVillage(rt, 40, -142, { rot: 0, n: 6, fields: 8, seed: 31, autumn: true });

    // ---- 大軍（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => ({ m: KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind), x0: x, z0: z });
    const TK = 0x24221f, WS = 0x2c2a2a;
    // 東軍：福島・井伊の赤備え・黒田・細川、藤堂の後ろ、家康の本隊（旗本の騎馬）、南宮山の押さえ
    [[-14, -8, 'maru', TK, 'gun'], [4, -40, 'ii', 0x8e1f16, 'cavalry'], [-30, -100, 'kuroda', TK, 'spear'], [0, -76, 'kuroda', TK, 'gun'], [66, 44, 'todo', TK, 'spear'], [50, 16, 'tokugawa', TK, 'gun'], [70, -30, 'tokugawa', TK, 'spear'], [132, 16, 'tokugawa', TK, 'spear'], [150, -30, 'tokugawa', TK, 'cavalry'], [100, 120, 'tokugawa', TK, 'mixed']]
      .forEach(([x, z, f, c, kind], i) => DA(x, z, 26, kind === 'gun' ? 6 : 14, kind === 'cavalry' ? 130 : 200, -Math.PI / 2, c, f, 101 + i, kind));
    // 西軍：笹尾山の石田の本陣、島津、小西の鉄砲、天満山の宇喜多、大谷の本隊
    F.west = [[-118, -110, 'ishida', 30, 'honjin'], [-88, -60, 'shimazu', 18, 'mixed'], [-96, -26, 'toyotomi', 26, 'gun'], [-112, 10, 'ukita', 36, 'spear'], [-80, 72, 'otani', 24, 'spear']]
      .map(([x, z, f, w, kind], i) => DA(x, z, w, kind === 'gun' ? 6 : (kind === 'honjin' ? 24 : 14), 240, Math.PI / 2, f === 'shimazu' ? SHIMAZU.armor : WS, f, 121 + i, kind));
    F.west[0].m.army.lord = '石田三成';   // 笹尾山へ寄れば旗本が迎え撃つ（b_nagashinojo.js の wake）
    // 南宮山の毛利（動かない）
    DA(152, 150, 36, 16, 260, -Math.PI * 0.75, WS, 'mori', 131, 'spear');
    // 松尾山の小早川。寝返ると山を下って大谷の横へ駆ける（山の上の本隊・中腹の先手・麓の先駆け）
    F.koba = [DA(MATSUO.x, MATSUO.z, 30, 16, 300, -Math.PI * 0.93, KOBA.armor, 'kobayakawa', 141, 'mixed'), DA(-60, 118, 24, 12, 200, -Math.PI * 0.85, KOBA.armor, 'kobayakawa', 142, 'spear'), DA(-58, 96, 22, 12, 160, -Math.PI * 0.62, KOBA.armor, 'kobayakawa', 143, 'cavalry')];
    F.koba[1].m.visible = false; F.koba[2].m.visible = false;
    // ---- 大軍どうしの合戦（軽い作り・world.addClash）：北の野で福島・井伊と宇喜多、その奥で黒田と石田が組み合う ----
    // 南の端は、藤堂と平塚の本物の押し合いにつながる（link）
    const east = (flag, armor, count, x = {}) => ({ flag, armor, count, team: 0, faction: 'tokugawa', ...x });
    const west = (flag, armor, count, x = {}) => ({ flag, armor, count, team: 1, faction: 'saito', ...x });
    F.clash = [
      clash(rt, { x: -26, z: -22, facing: -Math.PI / 2, w: 88, gap0: 36, seed: 171, noRout: true, surge: { k: 'B', every: 50, count: 180, flank: 0.30 }, A: east('maru', TK, 760, { guns: true }), B: west('ukita', WS, 1000, { bows: true }),
        link: () => (F.step >= 1 && F.step < 3 && !gone(F.hira) && F.todo2.count ? { x: (F.todo2.center().x + F.hira.center().x) / 2, z: 30 } : null) }),
      clash(rt, { x: -72, z: -98, facing: -Math.PI / 2, w: 60, gap0: 30, seed: 172, noRout: true, surge: { k: 'B', every: 55, count: 150, flank: 0.30 }, A: east('kuroda', TK, 520, { guns: true }), B: west('ishida', WS, 680, { guns: true }) }),   // 正面いっぱい：北の端（-128）から南の藤堂の押し合い（22）まで切れ目なく
    ];

    rt.world.setTime('day');
    rt.setPhase('fog');
    rt.obj('main', '藤堂の手に加わり、霧の向こうの大谷勢に備えよ', 'main');
    rt.obj('stay', '霧が晴れるまで、藤堂の旗を離れるな', 'order');
    rt.say('藤堂高虎', `${nm(rt)}、霧で一町先も見えぬ。だが、あの向こうには大谷刑部の兵がおる`, 4.5);
    rt.say('藤堂高虎', '霧の中ではぐれた者は、敵か味方かも分からずに討たれる。旗から離れるな', 4.5);
    rt.say('藤堂の侍', '南の山が松尾山じゃ。小早川秀秋の一万五千が、まだどちらにもつかずに見下ろしておる', 5);
    rt.after(15, () => this.open(rt));
  },

  // 開戦：北で井伊・松平の抜け駆け。藤堂の手も押し出す
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('fight');
    sfx('volley', 0.8);
    rt.army.play('gun', { x: -10, z: -30 }, 1.5);
    rt.banner('開戦', '井伊直政・松平忠吉、宇喜多勢へ撃ちかける');
    rt.say('足軽', '北で鉄砲の音じゃ！　始まったぞ！', 3);
    rt.after(6, () => {
      sfx('taiko', 1);
      rt.say('藤堂高虎', '我らも出る。前へ！　槍を揃えて、霧の中を押せ！', 3.5);
      // 北の野の大軍どうしも寄せ合って組み合う。井伊の赤備えの騎馬は宇喜多の北の端へ
      for (const c of F.clash) c.go();
      F.clash[0].cavalry('A', { from: -1, flag: 'ii', armor: II.armor, count: 80, delay: 22 });
      rt.obj('main', '霧の中、大谷方の平塚為広・戸田勝成の隊を押しとどめよ', 'main');
      const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.0; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
      go(F.todo, FRONT.x, FRONT.z); go(F.kyo, FRONT.x - 2, FRONT.z + 28); go(F.todo2, FRONT.x + 6, FRONT.z - 16); go(F.tera, FRONT.x + 4, FRONT.z + 44);
      go(F.gunG, FRONT.x + 4, FRONT.z - 6);
      F.vol = { guns: () => [F.gunG], foe: () => F.hira, r: 26, max: 70, clash: F.clash[0], side: 'A', hit: 35, who: '藤堂高虎',
        wait: '鉄砲組、まだ撃つな。霧の中から槍が見えるまで引きつけよ', line: '見えた！　鉄砲組、放てぇっ！', sub: '平塚の隊の前が崩れる',
        then: (rt) => rt.say('藤堂高虎', '平塚の前が乱れた！　今じゃ、槍を入れよ！', 3) };
      for (const [g, x, z] of [[F.hira, -26, 50], [F.toda, -28, 80]]) {
        g.order = 'move'; g.dest = { x, z }; g.speed = 2.4;
        // 大谷勢は備を崩さず押し合う（近づいた者にだけ槍を入れる）
        g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 11; gg.formation = 'yari'; };
      }
      rt.marker('hira', centerOf(F.hira), () => `平塚為広の隊・${moraleWord(F.hira.morale)}`, { red: true, group: F.hira });
    });
    rt.after(26, () => { if (F.step === 1) rt.say('足軽', '霧の中から大谷の旗が！　近いぞ！', 2.5); });
    // 勝ち筋：南の松尾山（小早川）が動けば、大谷勢の横腹が空く
    rt.after(44, () => { if (F.step === 1) rt.say('藤堂高虎', '崩れずに持ちこたえよ。南の松尾山が動けば、大谷の横腹が空く', 4); });
  },

  // 大谷の本陣から出る次の隊（木下頼継・大谷吉勝）
  //   二つの隊は一度にまとめて出る（ぽつぽつ出さず、一つの大きな波に）。後ろに大谷の控えが続く
  reinforce(rt) {
    const F = rt.flags;
    F.extra = F.extra || [];
    for (const [name, z] of [['木下頼継', 60], ['大谷吉勝', 72]]) this.reinforceOne(rt, name, z);
    KIT.backOf(rt, F.extra[0], { flag: 'otani', armor: OTANI.armor, kind: 'spear', w: 18, depth: 10, count: 110, seed: 156 });
    sfx('taiko', 0.8);
    rt.say('足軽', '大谷の陣から新手じゃ！　木下と大谷吉勝の旗が一度に来るぞ！', 3);
  },
  reinforceOne(rt, name, z) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'saito', name: `${name}の隊`, anchor: { x: -74, z }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 12, width: 14, noRout: true, dmgMult: 0.62, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name, horse: true, invuln: true, hat: 'kabuto_m', haori: 0x3a2a22 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], OTANI));
    g.order = 'move'; g.dest = { x: -30, z: z - 8 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: -30, z: z - 8 }; gg.aggro = 11; gg.formation = 'yari'; };
    soften(g);
    F.extra.push(g);
  },

  // 小早川の寝返り：問鉄砲 → 松尾山を下って大谷の横へ
  turn(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('turn');
    rt.banner('問鉄砲', '家康、松尾山へ鉄砲を撃ちかけて催促したと伝わる');
    rt.say('伝令', '小早川はまだ動きませぬ！　内府様は松尾山へ鉄砲を撃ちかけよと……', 4);
    for (let i = 0; i < 5; i++) rt.army.smoke(-20 + i * 3, rt.world.heightAt(-20, 110) + 1.5, 110 - i * 2, -1, 0.5);
    rt.army.play('gun', { x: -20, z: 110 }, 1.4);
    rt.after(9, () => {
      F.flipT = rt.t;
      sfx('horagai', 1);
      rt.army.play('eshout', { x: MATSUO.x, z: MATSUO.z - 20 }, 2.5);
      rt.banner('小早川秀秋、寝返る', '松尾山を下り、大谷勢の横腹へ');
      for (const c of F.clash) c.shake('B', 15);
      // 松尾山の旗が一斉に山を駆け下る
      F.koba[0].m.advance(40, 16, { charge: true });
      rt.after(3, () => { F.koba[1].m.visible = true; F.koba[1].m.advance(34, 12, { charge: true }); });
      rt.after(8, () => { F.koba[2].m.visible = true; F.koba[2].m.advance(28, 9, { charge: true }); });
      rt.say('足軽', '松尾山が動いた！　小早川が……大谷の方へ駆け下りていくぞ！', 4);
      rt.say('藤堂高虎', '今じゃ！　大谷勢は横を突かれる。押せ、押し崩せ！', 3.5);
      rt.obj('main', '小早川の寝返りに合わせ、大谷勢を崩せ', 'main');
      const k = allyGroup(rt, { faction: 'tokugawa', name: '小早川秀秋の兵', anchor: { x: -30, z: 112 }, facing: 0, width: 16, aggro: 12, noRout: true, speed: 3.2 },
        dress([{ type: 'samurai', n: 1, o: { name: '平岡頼勝', horse: true, hat: 'kabuto_m', haori: 0x4a2a1c } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 4 }], KOBA));
      k.order = 'move'; k.dest = { x: -40, z: 86 };
      k.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; };
      F.kobaG = k;
      KIT.backOf(rt, k, { flag: 'kobayakawa', armor: KOBA.armor, kind: 'spear', w: 18, depth: 12, count: 130, seed: 151 });
      // 大谷勢の将は、ここから討たれうる（平塚・戸田はこの日討ち死にした）
      // 名乗りは一人ずつ間をあけて（寝返りの大見出しと重ならないように）
      [F.hira, F.toda, ...(F.extra || [])].forEach((g, k) => {
        for (const u of g.units) if (u.type === 'busho') { u.invuln = false; u.announced = true; rt.after(8 + k * 9, () => { if (u.alive) u.announced = false; }); }
        if (g.count) g.morale -= 18;
      });
    });
    rt.after(24, () => {
      rt.banner('脇坂・朽木・小川・赤座も東軍へ', '松尾山の麓の四家が続いて寝返る');
      // 四家の兵も実際に駆け込んでくる（大谷勢が小勢に崩されたように見えないように、数で押し包む）
      const w4 = allyGroup(rt, { faction: 'tokugawa', name: '脇坂・朽木の兵', anchor: { x: -8, z: 128 }, facing: -Math.PI * 0.8, width: 16, aggro: 12, noRout: true, speed: 3.4 },
        [{ type: 'samurai', n: 1, o: { name: '脇坂安治', horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }]);
      w4.order = 'move'; w4.dest = { x: -34, z: 70 };
      w4.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; };
      F.w4 = w4;
      rt.after(3, () => rt.say('足軽', '南からも味方が……いや、さっきまで西軍だった脇坂の旗じゃ！', 3.5));
      for (const g of [F.hira, F.toda, ...(F.extra || [])]) if (g.count) { g.noRout = false; g.morale -= 15; }
      for (const g of [F.todo, F.kyo, F.todo2, F.tera]) { g.order = 'attack'; g.seekRange = 50; g.formation = 'line'; }
    });
  },

  // 西軍、総崩れ。そして島津の退き口
  collapse(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('collapse');
    // 大谷勢が崩れた後の味方の手・寝返った兵は任務に数えない：遠くの者から外して、西軍の本隊へ踏み込んだ時に近くの軽い兵を本物に替える枠へ回す
    KIT.markRecyclable(F.kyo, F.todo2, F.tera, F.kobaG, F.w4);
    rt.unmark('hira');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '大谷勢を崩した');
    if (!F.strayed) rt.objDone('stay');
    rt.objRemove('stay');
    sfx('horagai', 0.9);
    // 最後の将が討たれた大見出しと重ならないよう、少し間をおいて知らせる
    rt.after(2.5, () => {
      rt.banner('大谷吉継、自刃', '西軍、総崩れ');
      const og = F.otaniH && F.otaniH.general;
      if (og && og.alive) rt.army.despawn(og);
      rt.say('伝令', '大谷刑部殿、自害！　小西・宇喜多の陣も崩れ、石田の旗が伊吹山へ退いていきまする！', 4.5);
    });
    F.westT = rt.t;
    // 北の野の西軍も、南の端（大谷の崩れた方）から次々に崩れる
    F.clash.forEach((c, i) => rt.after(2 + i * 7, () => c.rout('B', { from: 1, hideAfter: 50 })));
    // 西軍の備が次々に崩れて西の山へ散る。石田の本陣はしばらく踏みとどまってから退く。島津はまだ動かない
    F.west.forEach((a, i) => {
      if (i === 1) return;
      if (i === 0) { rt.after(14, () => a.m.retreat(40, 26)); rt.after(34, () => a.m.rout({ hideAfter: 40 })); return; }
      rt.after(1 + i * 3, () => a.m.rout({ hideAfter: 50 }));
    });
    for (const q of F.koba) if (q.m.visible) rt.after(6, () => q.m.halt());
    for (const g of [F.todo, F.kyo, F.todo2, F.tera, F.kobaG, F.w4]) if (g && g.count) { g.order = 'hold'; g.anchor = g.center(); g.aggro = 12; g.formation = 'yari'; g.facing = -Math.PI / 2; }
    // 戦を長くしすぎないよう、B（西軍の崩れの中の段）は省き、そのまま島津の退き口へ（skB は残しておく）
    rt.after(10, () => this.shimazu(rt));
  },

  // 段を重ねる（b_depth.js）：A 大谷勢の押し返し（霧が晴れた後、寝返りの前）→ B 西軍の崩れの中で（島津の前）→ C 捨て奸（豊久の殿の後）
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, skCtx(rt, which), which === 'A' ? skA() : which === 'B' ? skB() : skC(), () => { F.dpOn = false; then(); });
  },
  shimazu(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('shimazu');
    sfx('taiko', 1);
    rt.army.play('eshout', { x: -70, z: -24 }, 2.5);
    rt.banner('島津の退き口', '島津義弘、敵中を突っ切って退く');
    // 遠くの島津の備も、前へ（東へ）一斉に駆け出す
    F.west[1].m.advance(70, 22, { charge: true });
    rt.after(30, () => F.west[1].m.rout({ hideAfter: 30 }));
    rt.say('足軽', '島津じゃ！　島津が逃げずに、こっちへ突っ込んでくる！', 3.5);
    rt.say('藤堂高虎', '前へ逃げる気か……！　捨て奸に気をつけよ。止まった鉄砲が、命と引きかえに撃ってくるぞ', 5);
    // 義弘の本隊：道すじに沿って、東軍の中を南東へ抜ける
    const g = enemyGroup(rt, { faction: 'saito', name: '島津義弘の隊', anchor: { ...SHIMA_PATH[0] }, facing: Math.PI * 0.75, aggro: 4, width: 8, noRout: true, speed: 3.6, dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '島津義弘', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2626 } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], SHIMAZU));
    g.dmgMult = 0.5;   // 義弘の隊は戦うより抜けることを急ぐ
    g.order = 'path'; g.path = SHIMA_PATH.slice(1).map((q) => [q.x, q.z]); g.pathIdx = 0; g.march = false;
    soften(g);
    F.yoshi = g; F.yoshiU = g.units[0];
    rt.marker('yoshi', unitPos(F.yoshiU), '島津義弘', { red: true });
    // 島津豊久の殿：義弘が抜けたあとの道に残り、追う者を食い止める（捨て奸）
    const R = enemyGroup(rt, { faction: 'saito', name: '島津豊久の殿', anchor: { x: -30, z: 14 }, facing: Math.PI * 0.75, fleeDir: { x: 1, z: 0.5 }, aggro: 10, width: 10, noRout: true, speed: 3.4, dmgMult: 0.65 },
      dress([{ type: 'busho', n: 1, o: { name: '島津豊久', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x3a2a22 } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 8 }], SHIMAZU));
    // 豊久は捨て奸の間しばらく討たれない（殿が一瞬で崩れないように）
    rt.after(40, () => { for (const u of R.units) if (u.type === 'busho') { u.invuln = false; u.announced = false; } });
    R.order = 'path'; R.path = [[-10, 30], [16, 58]]; R.pathIdx = 0; R.march = false;
    R.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 16, z: 58 }; gg.facing = -Math.PI * 0.6; gg.aggro = 16; };
    soften(R);
    F.toyo = R;
    KIT.backOf(rt, R, { flag: 'shimazu', armor: SHIMAZU.armor, kind: 'gun', w: 14, depth: 6, count: 70, seed: 154 });
    rt.obj('toyo', '島津の殿（島津豊久）を崩し、退き口を追え', 'main');
    rt.marker('toyo', centerOf(R), () => `島津豊久の殿・${moraleWord(R.morale)}`, { red: true, group: R });
    // 井伊直政が追う
    rt.after(26, () => {
      if (F.ending) return;
      const ii = allyGroup(rt, { faction: 'akazonae', name: '井伊直政の赤備え', anchor: { x: 22, z: -18 }, facing: Math.PI, width: 8, aggro: 12, noRout: true, speed: 4 },
        dress([{ type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: true, hat: 'kabuto_r', haori: 0x7a1a12 } }, { type: 'cavalry', n: 6 }, { type: 'samurai', n: 4 }], II));
      ii.order = 'move'; ii.dest = { x: 10, z: 50 };
      ii.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; };
      F.ii = ii;
      // 赤備えの騎馬が土煙を上げて続く
      KIT.backOf(rt, ii, { flag: 'ii', armor: II.armor, kind: 'cavalry', w: 18, depth: 14, count: 90, gap: 3, seed: 155 });
      rt.say('伝令', '井伊直政殿の赤備えが、島津を追って駆けてまいります！', 3.5);
      rt.after(22, () => { if (!F.ending) { rt.banner('井伊直政、鉄砲に撃たれる', '島津の捨て奸に、馬上で傷を負う'); rt.say('足軽', '赤備えの大将が撃たれた！', 2.5); } });
    });
  },

  finishWin(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('toyo'); rt.unmark('yoshi');
    rt.banner('関ヶ原の戦、終わる', how);
    rt.say('藤堂高虎', `${nm(rt)}、生き延びたな。天下の分かれ目に立ったこと、忘れるでないぞ`, 4.5);
    rt.say('伝令', '島津義弘、伊勢路へ抜けた由。討ち取った首は、数え切れませぬ', 3.5);
    sfx('horagai', 0.8);
    rt.player.u.invuln = true;   // 戦が終わったあとの流れ弾で重傷にならないように
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 朝霧：はじめは一町先も見えず、しだいに晴れる（world の霧の距離を上から書きかえる）
    // 霧の間に大谷勢を押し崩したら、霧の晴れを早める（待つだけの間を作らない）
    const ft = rt.t + (F.fogOff || 0);
    F.fog = ft < FOG_T0 ? 1 : Math.max(0, 1 - (ft - FOG_T0) / (FOG_T1 - FOG_T0));
    if (F.fog > 0) {
      const f = rt.scene.fog, k = F.fog;
      f.near = Math.min(f.near, lerp(40, 3, k));
      f.far = Math.min(f.far, lerp(230, 34, k));
      if (!F.fogCol) F.fogCol = f.color.clone();
      f.color.copy(F.fogCol).lerp(MIST, k);
      // 空と遠くの山も霧に沈める（霧の上に青空が抜けて見えないように）
      const W = rt.world, U = W.skyMat && W.skyMat.uniforms;
      if (U && U.top && U.bottom) {
        if (!F.skyCol) F.skyCol = { top: U.top.value.clone(), bottom: U.bottom.value.clone() };
        U.top.value.copy(F.skyCol.top).lerp(MIST, k * 0.9);
        U.bottom.value.copy(F.skyCol.bottom).lerp(MIST, k);
      }
      if (W.mountU) { W.mountU.mist.value = Math.max(W.mountU.mist.value, k); W.mountU.hazeCol.value.copy(f.color); }
      for (const m of (W.mountains && W.mountains.children) || []) if (m.material.uniforms && m.material.uniforms.haze) m.material.uniforms.haze.value = Math.max(m.material.uniforms.haze.value, k);
    } else if (F.fogCol && !F.fogClear) {
      F.fogClear = true;
      rt.scene.fog.color.copy(F.fogCol);
      const U = rt.world.skyMat && rt.world.skyMat.uniforms;
      if (U && F.skyCol) { U.top.value.copy(F.skyCol.top); U.bottom.value.copy(F.skyCol.bottom); }
      rt.banner('霧が晴れた', '関ヶ原の全体が見える');
      if (!F.strayed) rt.objDone('stay');
      rt.say('足軽', '霧が晴れた……！　見ろ、山という山に旗が並んでおる', 3.5);
    }
    KIT.backTick(rt);
    if (F.ending) return;
    // 霧の間、藤堂の旗から離れたか
    if (F.step >= 1 && F.fog > 0.25 && !F.strayed) {
      const d = Math.hypot(p.x - F.todoU.pos.x, p.z - F.todoU.pos.z);
      F.strayT = d > 24 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 4) {
        F.strayed = true;
        rt.violation('霧の中で持ち場を離れた', ['藤堂高虎', '戻れ！　霧の中ではぐれるなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    }
    volleyTick(rt, dt, F.vol);
    depthTick(rt, dt);
    if (F.dpOn) return;
    if (F.step === 1) {
      rt.objProgress('main', `平塚の隊 ${F.hira.count}人・戸田の隊 ${F.toda.count}人`);
      // 霧が晴れて押し合いが続いたころ、あるいは平塚が弱ったら問鉄砲
      // 大谷勢は粘る：崩れかけたら、大谷の本陣から次の隊が出てくる（小早川が動くまで）
      const weak = [F.hira, F.toda, ...(F.extra || [])].filter((g) => !gone(g)).reduce((a, g) => a + g.count, 0);
      if (weak < 26 && (F.extra || []).length < 2 && !(F.reinT > rt.t - 25)) { F.reinT = rt.t; this.reinforce(rt); }
      if ((F.extra || []).length >= 2 && [F.hira, F.toda, ...F.extra].every(gone)) {
        if (!F.fogFast) { F.fogFast = true; rt.say('藤堂高虎', '大谷の先手は崩れた。霧が晴れるまで、旗の下で備を直せ', 3.5); }
        F.fogOff = (F.fogOff || 0) + dt * 4;
      }
      if (F.fog <= 0 && rt.t + (F.fogOff || 0) > FOG_T1 + 14) this.deep(rt, 'A', () => this.turn(rt));
    }
    if (F.step === 2) {
      const all = [F.hira, F.toda, ...(F.extra || [])];
      rt.objProgress('main', `大谷勢 ${all.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0)}人`);
      if (all.every(gone)) this.collapse(rt);
      else if (rt.t - F.stepT > 150) { for (const g of all) { g.noRout = false; g.morale = 0; } }
    }
    if (F.step === 4) {
      const R = F.toyo;
      rt.objProgress('toyo', `豊久の殿 ${R.count}人`);
      const Y = F.yoshiU;
      if (Y && Y.alive && Y.pos.x > 150 && !F.yoshiOut) {
        F.yoshiOut = true;
        rt.unmark('yoshi');
        rt.banner('島津義弘、戦場を脱す', '敵中を突っ切り、伊勢街道へ');
        for (const u of F.yoshi.units) { u.alive = false; u.mesh.visible = false; }
      }
      if (gone(R)) {
        rt.objDone('toyo'); rt.unmark('toyo');
        rt.award((t) => { t.special = { label: '退き口の追い討ち', pts: 25 }; }, '島津の殿を崩した');
        this.deep(rt, 'C', () => this.finishWin(rt, '島津の殿を崩した。西軍は散った'));
      } else if (rt.t - F.stepT > 170) {
        rt.objFail('toyo'); rt.unmark('toyo');
        R.noRout = false; R.morale = 0;
        this.deep(rt, 'C', () => this.finishWin(rt, '島津の殿は崩れぬまま退いた'));
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      // 自分で討った時は「討ち取ったり」の大見出しが出るので、重ねない
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、討死`, v.name === '島津豊久' ? '島津の殿、崩れる' : '大谷勢の将');
      if (v.group) v.group.morale -= 30;
      if (v.group === F.toyo) { F.toyo.noRout = false; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.hira) rt.say('足軽', '平塚の隊が崩れたぞ！', 2.5);
    if (g === F.toda) rt.say('足軽', '戸田の隊も崩れた！', 2.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、東軍 七万八千、西軍 八万四千）。小早川と四家が寝返ると、西軍から二万が抜ける
sekigahara.force = (rt) => {
  const F = rt.flags;
  const turned = F.flipT ? 15600 + (rt.t - F.flipT > 15 ? 4200 : 0) : 0;
  const b = Math.max(1500, 84000 - (F.ek || 0) * 90 - turned - (F.step >= 3 ? 30000 : 0));
  return { a: 78000 - (F.ak || 0) * 45, a0: 78000, b, b0: 84000 };
};
sekigahara.canSkip = (rt) => (rt.phase === 'fog' && rt.t > 3 ? '開戦まで待つ' : '');
sekigahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
sekigahara.sides = { a: { name: '東軍', mon: 'tokugawa' }, b: { name: '西軍', mon: 'ishida' } };
sekigahara.date = (rt) => {
  const F = rt.flags;
  const w = F.fog > 0.6 ? '朝霧' : F.fog > 0 ? '霧が晴れていく' : '晴';
  const time = rt.t < 120 ? '朝' : '昼';
  return `慶長五年九月十五日　秋・${w}・${time}`;
};
sekigahara.history = '慶長五年九月十五日、徳川家康の東軍と、石田三成らの西軍が美濃の関ヶ原で戦った。朝は深い霧で、霧が晴れかけたころ、井伊直政・松平忠吉の抜け駆けで戦が始まったと伝わる。大谷吉継の隊は藤堂高虎・京極高知らとよく戦ったが、松尾山の小早川秀秋が東軍に寝返って大谷勢の横を突き、脇坂・朽木・小川・赤座の四家も続いた。大谷吉継は自害し、西軍は崩れた。島津義弘は敵中を突破して退き（島津の退き口）、甥の島津豊久はその殿で討ち死にした。追った井伊直政は鉄砲で傷を負った。家康が松尾山へ撃ちかけたという「問鉄砲」の話は、後の書物に出るもので確かではない。';

// 素直な遊び手：霧の間は藤堂の旗のそばで戦い、寝返りのあとは大谷勢へ、最後は島津の殿へ
sekigahara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.todoU.pos;
  if (b.botRest) { inp.guardHold = false; if (F.step >= 3) goTo(p, inp, 40, 26, 2); else goTo(p, inp, lead.x + 14, lead.z, 2); return; }
  const range = F.step >= 2 ? 12 : 7;
  // 島津が抜ける間は、義弘の本隊には自分からかからず、殿（豊久）を狙う
  const e = b.army.nearestEnemy(u, range, (o) => !o.fleeing && !o.invuln && (F.fog < 0.25 || Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < 20) && (o.group !== F.yoshi || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 4 && F.toyo && F.toyo.count) { const c = F.toyo.center(); goTo(p, inp, c.x, c.z, 2); return; }
  if (F.step === 2 && F.fog <= 0) { const t = [F.hira, F.toda, ...(F.extra || [])].find((g) => !gone(g)); if (t) { const c = t.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  goTo(p, inp, lead.x + (F.step >= 2 ? 3 : 5), lead.z + 2, 3);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 大谷勢は寡兵でも粘り強く、藤堂・京極の手を何度も押し返したと伝わる。霧が晴れると、天満山の鉄砲も並んで撃ちかける
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
const shima = (list) => ({ flag: 'shimazu', armor: SHIMAZU.armor, list: dress(list, SHIMAZU) });
function skCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'otani', armor: OTANI.armor, dmg: 0.64, mass: 280, look: (l) => dress(l, OTANI),
    friends: () => [F.todo, F.kyo, F.todo2, F.tera, F.kobaG, F.w4].filter((g) => g && g.count && !g.routed) };
}
// A 霧が晴れた後：大谷勢の押し返し → 京極の手を助けるか → 天満山の鉄砲
function skA() {
  const at = { x: FRONT.x + 4, z: FRONT.z };
  return [
    rest({ dur: 7, heal: 0.3, say: [['藤堂高虎', '霧が晴れた。……大谷の備が、まるで崩れておらぬ'], ['足軽', '大谷刑部は病で目も見えぬと聞いたが……']] }),
    hold({ at, dur: 90, r: 15, title: '大谷勢の押し返し', sub: '寡兵の大谷勢が、藤堂の手を押し返しに来る', label: '藤堂の旗', obj: '藤堂の旗の前で、押し返しに来る大谷勢を受けよ',
      say: [['藤堂高虎', '押し返されるな！　一度下がれば、二度と前へは出られぬぞ！']],
      waves: [
        { t: 4, say: ['足軽', '大谷の旗が、一斉に押し出してきた！'], foes: () => [{ name: '押し返す大谷勢', from: { x: -60, z: 52 }, list: [uS(3), uA(14)], mass: 380, noRout: 30 }] },
        { t: 20, say: ['藤堂高虎', '天満山の麓に鉄砲衆が並んだ！　伏せよ！'], foes: () => [gunLine('天満山の鉄砲衆', { x: -54, z: 24 }, 9)] },
        { t: 38, say: ['足軽', '北の畦から回り込んでくる！'], foes: () => [{ name: '北へ回る大谷勢', from: { x: -40, z: 14 }, off: { x: 0, z: -12 }, list: [uS(2), uA(11)], mass: 280 }] },
        { t: 56, say: ['足軽', '南からもじゃ！　京極の手の間を割ってくる！'], foes: () => [{ name: '南へ回る大谷勢', from: { x: -44, z: 96 }, off: { x: 0, z: 12 }, list: [uS(2), uA(11)], mass: 280 }] },
        { t: 72, say: ['藤堂高虎', '三度目の押し返しじゃ！　凌げ！'], foes: () => [{ name: '大谷の三度目の押し返し', from: { x: -64, z: 60 }, list: [uS(3), uA(13), uG(2)], mass: 360 }] },
      ],
      reward: '大谷勢の押し返しを三度凌いだ', lost: ['藤堂高虎', '押し下げられた……！　旗を立て直せ！'] }),
    rest({ dur: 7, bark: '立て直し：藤堂の旗の下に組を集める', say: [['伝令', '京極高知殿の手が、戸田勝成の隊に押されておりまする！']] }),
    pick({ title: '南の京極の手が、戸田勝成の隊に押されている。どうする？',
      options: [{ label: '組を連れて南へ回り、京極の手を助ける', note: '戸田の隊の横を突けば、後で大谷勢が崩れやすい。藤堂の旗から離れる' }, { label: '藤堂の旗の前を固める', note: '持ち場は固い。京極の手は押され、後で南から回られる' }],
      on: (rt, m, i) => { m.skKyo = i === 0; rt.say('藤堂高虎', i === 0 ? 'よし、行け。戸田の横を突け' : 'よし、旗を守れ', 3); } }),
    fight({ skip: (rt, m) => !m.skKyo, at: { x: -24, z: 84 }, title: '戸田の横', sub: '京極の手を押す戸田勝成の隊の横腹', obj: '京極の手を押す大谷方の兵を、横から崩せ',
      foes: () => [{ name: '京極の手を押す大谷方', from: { x: -50, z: 92 }, list: [uS(2), uA(12)], mass: 300 }, gunLine('戸田の鉄砲', { x: -52, z: 76 }, 7)],
      later: [{ t: 40, title: '新手', sub: '大谷の本陣から新手', say: ['足軽', '大谷の本陣から、また新手じゃ！'], foes: () => [{ name: '大谷の本陣の新手', from: { x: -74, z: 88 }, list: [uS(2), uA(11)], mass: 300 }] }],
      max: 140, reward: (t) => { t.special = { label: '京極の手を助けた', pts: 20 }; }, rewardLabel: '京極の手を助けた' }),
    hold({ skip: (rt, m) => m.skKyo, at, dur: 60, r: 14, title: '藤堂の旗', sub: '南の京極の手が押され、南から回られる', label: '藤堂の旗', obj: '藤堂の旗の前を守れ（南から回られる）',
      waves: [
        { t: 4, foes: () => [{ name: '大谷勢の寄せ', from: { x: -60, z: 48 }, list: [uS(2), uA(12)], mass: 320 }] },
        { t: 28, say: ['足軽', '南の京極の手が崩れた……！　南から来る！'], foes: () => [{ name: '南から回る戸田の隊', from: { x: -20, z: 100 }, list: [uS(2), uA(11)], mass: 300 }] },
      ],
      reward: '藤堂の旗を守った' }),
  ];
}
// B 西軍の崩れ：宇喜多の敗兵を追うか、大谷の陣の跡か
function skB() {
  return [
    rest({ dur: 8, heal: 0.3, say: [['足軽', '勝った……のか'], ['藤堂高虎', 'まだじゃ。崩れた者は、死にものぐるいで斬りかかってくる']] }),
    pick({ title: '西軍が崩れていく。どこへ向かう？',
      options: [{ label: '北へ、崩れた宇喜多勢を追う', note: '大勢の中へ踏み込む。首は多い。宇喜多の旗本が向き直る' }, { label: '西へ、大谷の陣の跡を掃う', note: '大谷刑部の首を隠す者がいると聞く。見つければ大手柄' }],
      on: (rt, m, i) => { m.skUki = i === 0; rt.say('藤堂高虎', i === 0 ? '行け。深入りするな' : '大谷の陣じゃ。……刑部の首を探せ', 3); } }),
    fight({ skip: (rt, m) => !m.skUki, at: { x: -30, z: -20 }, title: '宇喜多の崩れ', sub: '崩れた宇喜多勢の中で、旗本が向き直る', obj: '崩れた宇喜多勢の中で、向き直る旗本を崩せ',
      foes: () => [{ name: '向き直る宇喜多の旗本', from: { x: -60, z: -30 }, list: [uS(4), uA(12)], mass: 400, noRout: 20 }],
      later: [{ t: 30, title: '鉄砲', sub: '天満山の麓の鉄砲が、最後に撃ちかける', say: ['足軽', '天満山の麓に鉄砲が！'], foes: () => [gunLine('宇喜多の鉄砲衆', { x: -56, z: -10 }, 9)] },
        { t: 60, title: '囲まれる', sub: '左右から崩れた兵が斬りかかる', say: ['足軽', '崩れた兵が、両脇から斬りかかってくる！'], foes: () => [{ name: '左の崩れ兵', from: { x: -40, z: -52 }, list: [uS(1), uA(10)], mass: 200 }, { name: '右の崩れ兵', from: { x: -10, z: -46 }, list: [uS(1), uA(10)], mass: 200 }] }],
      max: 160, reward: (t) => { t.special = { label: '宇喜多の旗本を崩した', pts: 20 }; }, rewardLabel: '宇喜多の旗本を崩した' }),
    fight({ skip: (rt, m) => m.skUki, at: { x: -70, z: 70 }, title: '大谷の陣の跡', sub: '大谷刑部の首を隠す者たちが、最後の槍を構える', obj: '大谷の陣の跡で、最後の大谷勢を崩せ',
      say: [['足軽', 'あそこじゃ！　土を掘っておる者がおる！']],
      foes: () => [{ name: '大谷の最後の者', from: { x: -90, z: 66 }, list: [uS(4), uA(8)], mass: 160, noRout: 25 }],
      later: [{ t: 36, title: '鉄砲', sub: '陣の跡の鉄砲', say: ['足軽', '陣の柵の陰から撃ってくる！'], foes: () => [gunLine('大谷の最後の鉄砲', { x: -92, z: 80 }, 7)] }],
      max: 140, reward: (t) => { t.special = { label: '大谷の陣の跡を掃った', pts: 20 }; }, rewardLabel: '大谷の陣の跡を掃った',
      onEnd: (rt) => rt.say('藤堂高虎', '……刑部の首は、見つからぬか。湯浅五助が埋めたとも聞く。それでよい', 4) }),
  ];
}
// C 豊久の殿の後：捨て奸 → 伊勢街道まで追うか、止まるか
function skC() {
  return [
    rest({ dur: 7, heal: 0.3, say: [['足軽', '島津の者が、道に座り込んで鉄砲を構えておる……'], ['藤堂高虎', '捨て奸じゃ。死ぬ気で撃ってくる。……どうする']] }),
    pick({ title: '島津の捨て奸が道に残っている。どうする？',
      options: [{ label: '捨て奸を斬り抜け、伊勢街道まで追う', note: '島津の鉄砲が次々に撃ってくる。義弘に追いつけば大手柄' }, { label: '追うのをやめ、道を塞いで捨て奸を受ける', note: '無理に追わない。捨て奸は向こうから斬りかかってくる' }],
      on: (rt, m, i) => { m.skChase = i === 0; rt.say('藤堂高虎', i === 0 ? '行け。構えを見たら伏せよ' : 'よし、道を塞げ。追うのは井伊殿に任せよ', 3); } }),
    fight({ skip: (rt, m) => !m.skChase, at: { x: 70, z: 96 }, title: '捨て奸', sub: '道に座り込んだ島津の鉄砲が、次々に撃つ', obj: '伊勢街道への道で、島津の捨て奸を崩せ',
      foes: () => [gunLine('捨て奸の鉄砲', { x: 90, z: 104 }, 8, shima([uS(1), uG(8)])), { name: '捨て奸の槍', from: { x: 96, z: 110 }, ...shima([uS(3), uA(8)]), mass: 120 }],
      later: [{ t: 34, title: '二の捨て奸', sub: 'その先の道にも', say: ['足軽', 'また座り込んでおる！'], foes: () => [gunLine('二の捨て奸', { x: 120, z: 112 }, 8, shima([uS(1), uG(8)]))] }],
      max: 140, reward: (t) => { t.special = { label: '島津の捨て奸を斬り抜けた', pts: 25 }; }, rewardLabel: '島津の捨て奸を斬り抜けた' }),
    hold({ skip: (rt, m) => m.skChase, at: { x: 18, z: 62 }, dur: 55, r: 12, title: '道を塞ぐ', sub: '捨て奸の島津の者が、向こうから斬りかかる', label: '島津の退き口', obj: '島津の退き口を塞ぎ、斬りかかる捨て奸を受けよ',
      waves: [
        { t: 4, foes: () => [{ name: '斬りかかる島津の者', from: { x: 50, z: 84 }, ...shima([uS(3), uA(8)]), mass: 120 }] },
        { t: 24, say: ['足軽', '座り込んだ鉄砲が、こちらへ筒を向けた！'], foes: () => [gunLine('捨て奸の鉄砲', { x: 44, z: 90 }, 7, shima([uS(1), uG(7)]))] },
      ],
      reward: '島津の退き口を塞いだ' }),
  ];
}

export { sekigahara };
