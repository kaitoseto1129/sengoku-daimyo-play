// ======================================================================
// 比叡山（元亀二年・1571 九月十二日）… docs/hiei-1571-spec.md（kaito 10/1）の第一〜第二段階（61章）
// 坂本（日吉社・里）→ 本坂（狭い山道・つづら折り・杉林・石段）→ 文殊楼 → 東塔（根本中堂・廻廊・中門・大講堂・僧坊の群れ）
// → 西塔（浄土院・にない堂・釈迦堂の前身）→ 横川（横川中堂）。筋書きは 46〜53章の P1〜P7（kaito 10/1：横川も掃討する区域に）。
//   ・横川（第三段階・26〜32章）は西塔から長い山道の先。西塔と同じく山道を掃討する。移動範囲はこの戦だけ moveLim で広げる
//   ・山麓から始める。根本中堂の前には出さない（46章）
//   ・全員を倒す戦にしない（mid6 49〜52章）：燃える山道を進む・手向かう者を退ける・次の区域への道を押さえる
//   ・城にしない（36〜39章）：天守・櫓・石垣・枡形・堀を置かない。守りは地形（急坂・狭い道・石段）と門と建物。
//     一時の逆茂木だけ少し（GAME_C）
//   ・人は僧兵だけにしない（54章）：僧兵・武装した神人や里の者・浅井朝倉の残党・逃げる僧・里の者・避難する人
//   ・火は建物ごと＋風向きで、一棟→一群→地区へ（temple1571.js）。鐘が鳴ると守りが警戒する（57章）
// 地形：terrain_hiei.js（国土地理院の標高。宇佐山の志賀の陣と同じ広域の切り出し）。建物と道：castles/hiei1571.js。
// ======================================================================
import * as THREE from 'three';
import { sakamogi, paintGeo } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { Garan, makeTempleFire, ringBell } from './temple1571.js';
import { P, PATHS, BUILDINGS, pathById, pathPoint, height, onFlat } from './castles/hiei1571.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 姿：僧兵（裹頭・袈裟・薙刀）／武装した神人・里の者／浅井・朝倉の残党／織田
const SOHEI = { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null };
const LAY = { flag: null, hat: 'hachimaki', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x5a4a38, haori: null, mon: null };
const REM = { flag: null, armor: 0x3a3428, lace: 0x5a4a3a };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const near = (u, p, r) => u && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r;
const standing = (g) => g && !g.routed ? g.count : 0;
// 道の一部（i0〜i1 の折れ点）を、隊の歩く道筋にする
const pts = (id, i0 = 0, i1) => pathById(id).pts.slice(i0, i1 === undefined ? undefined : i1 + 1).map(([x, z]) => [x, z]);
function walk(g, path, speed, onArrive) {
  if (!g || !g.count) return;
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.speed = speed || 2.4; g.formation = 'column';
  const [x, z] = path[path.length - 1];
  g.onArrive = onArrive || ((q) => { q.order = 'hold'; q.anchor = { x, z }; q.formation = 'line'; });
}
const attackFrom = (q, r = 30) => { q.order = 'attack'; q.seekRange = r; q.formation = 'line'; };

const hiei_mtn = {
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: -Math.PI / 2 },
  world: {
    seed: 15710,
    moveLim: 250,           // この戦だけ：横川（z≈-228）まで歩けるよう移動範囲を広げる（ほかの戦は既定の176）
    time: 'day',
    mist: true,            // 朝靄：山の上は森と霞に隠れて見えない（P1）
    autumn: true,          // 旧暦九月
    wind: [-0.86, -0.4],   // 湖から山へ吹き上げる風（火は西・北西へ広がる）
    muddy: 0.15,
    terrainTags: true,     // 急斜面・石段・細道・森で速さと疲れが変わる（terrain_tags.js）
    climbTan: 1.4,         // 山の斜面は遅く疲れるが、道の外も登れる（崖ほどの所だけ登れない。法面や森に閉じ込めない）
    paths: PATHS.map((p) => p.pts),
    treePadMul: 0.42,      // 細い山道は、杉が道の際まで迫る
    height,
    clear: onFlat,
    water: { x: 198, level: 0.4 },   // 琵琶湖（坂本の東）
    tint(x, z, h, c) {
      if (x > 128 && Math.abs(z) < 34) return;                        // 坂本の里と田畑
      if (x < -24 && x > -66 && z > -24 && z < 13) { c.lerp({ r: 0.56, g: 0.53, b: 0.46 }, 0.5); return; }   // 中庭の白い砂
      c.setRGB(c.r * 0.8, c.g * 0.88, c.b * 0.78);                    // 杉の山は暗く
    },
    trees: 1500,
    tufts: 2600,
    treeDensity: (x, z) => (x > 128 && Math.abs(z) < 40 ? 0.04 : x < -10 && x > -90 && z > -45 && z < 25 ? 0.3 : 1),
    sugiAt: (x, z) => (x > -12 && x < 118 && Math.abs(z) < 40 ? 0.9 : x < -10 ? 0.55 : 0.2),
    groves: [{ x: 60, z: -28, r: 16, n: 30 }, { x: 18, z: 18, r: 16, n: 30 }, { x: 100, z: 22, r: 14, n: 22 }, { x: -2, z: -40, r: 12, n: 18 }],
    // 逃げる僧兵と人々は、山の奥（西）や谷、横川より先の山中へ消える
    fleeOut: (x, z, team) => team === 1 && (x < -150 || Math.abs(z) > 240),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.civ = []; F.foes = [];
    F.t0 = rt.t; F._gp = { x: P.spawn.x, z: P.spawn.z };

    // ---- 伽藍・坂本・本坂の建物（まとめて描く。史実の確度の札つき） ----
    const G = F.G = new Garan(rt);
    for (const b of BUILDINGS) G.build(b);
    G.stairs(pathById('honzaka'), pathPoint, { minG: 0.32, dist: 'path' });
    G.stairs(pathById('todo'), pathPoint, { minG: 0.25, dist: 'todo' });
    for (const [x, z] of [[-6, -9.5], [-6, -2.5], [-23, -8.5], [-23, -1.5], [-34, -8.5], [-34, -1.5], [144, -2], [144, 8]]) G.lantern(x, z, x > 100 ? 'sakamoto' : 'todo');
    // 『耶蘇会士日本通信』所収のフロイスの焼き討ち報告：戦乱で僧坊が減り、谷々に残ったという。
    // 紹介：https://nihonsizatugaku.net/hieizan/
    // 旧跡との照合：https://www.jstage.jst.go.jp/article/aija/91/841/91_646/_pdf
    // 数と位置は確定できない。本道脇の礎石は、この戦より前の荒廃を表す推定の景色。
    const stone = new THREE.BoxGeometry(0.55, 0.24, 0.55);
    for (const [i, x, z] of [[0, 82, -9], [1, 68, -13], [2, 54, -10]]) {
      const rec = G.build({ id: 'old_sobo_' + i, kind: 'sobo_ato', x, z, w: 4, d: 3, dist: 'path', lite: true, noBurn: true, hist: 'HIST_B' });
      rec.top = 0.3;
      for (const dx of [-1.8, 0, 1.8]) for (const dz of [-1.2, 1.2]) {
        const g = stone.clone(); g.translate(dx, W.heightAt(x + dx, z + dz) - rec.y0 + 0.05, dz);
        G.add(rec, 'plain', paintGeo(g, 0x77746b));
      }
    }
    stone.dispose();
    G.finish();
    F.fire = makeTempleFire(rt, G, {
      onIgnite: (r) => { if (r.kind === 'chudo') F.chudoFire = true; },
      onBurnt: (r) => { if (r.kind === 'shoro') rt.bark(`${r.name}が焼け落ちた`); },
    });
    // 一時の逆茂木（戦の時だけの物。GAME_C）：文殊楼の石段の上に二つ。真ん中は道
    for (const [x, z, r] of [[-10, -10.2, 0.25], [-10, -1.8, -0.25]]) rt.scene.add(sakamogi(W, x, z, r, 3.2));

    // ---- 織田勢：明智光秀の手（自分の持ち場）と鉄砲。坂本のまわりに大軍（軽い作り） ----
    F.akechi = allyGroup(rt, { faction: 'oda', name: '明智光秀の手', anchor: { x: 158, z: 1 }, facing: -Math.PI / 2, width: 8, aggro: 9, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.akeU = F.akechi.units[0];
    F.teppo = allyGroup(rt, { faction: 'oda', name: '明智の鉄砲組', anchor: { x: 160, z: 9 }, facing: -Math.PI / 2, width: 6, aggro: 5, noRout: true }, dress([{ type: 'gun', n: 6 }], ODA));
    F.oda = [F.akechi, F.teppo];
    for (const g of F.oda) { g.defMult = 1.25; g.dmgMult = 0.85; }
    const n = Math.max(RANKS[rt.G.rank].squad || 0, 6);
    rt.makeSquad({ x: P.spawn.x - 3, z: P.spawn.z + 3 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing: -Math.PI / 2, armor: 0x2b3140, flagTex: flagTexture(flag), seed });
    [[176, -26, 'oda'], [178, 30, 'eiraku'], [186, 2, 'oda']].forEach(([x, z, f], i) => DA(x, z, 22, 10, 160, f, 1571 + i));

    // ---- P1 山麓：日吉社の鳥居の前の神人と僧兵、里坊の弓 ----
    F.hiyoshiG = this.foe(rt, { name: '日吉社の神人と僧兵', anchor: { x: 146, z: -7 }, facing: Math.PI / 2, width: 7, aggro: 12, morale: 75, fleeDir: { x: -1, z: -0.6 } },
      [...dress([{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 3 }], LAY)]);
    F.satoboBow = this.foe(rt, { name: '里坊の僧兵（弓）', anchor: { x: 134, z: -5 }, facing: Math.PI / 2, width: 4, aggro: 10, morale: 60, fleeDir: { x: -1, z: -0.3 } }, dress([{ type: 'bow', n: 3 }], SOHEI));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '明智光秀の先手の一隊を預かり、坂本から山へ登れ' : '明智光秀のもとで、坂本から山へ登れ', 'main');
    rt.obj('civ', '刃向かわぬ者（僧・里の者）は討つな', 'side');
    rt.say('明智光秀', `${nm(rt)}、まず日吉社の前を抜け、本坂の登り口を押さえる`, 5);
    rt.say('明智光秀', '刃向かう者とは戦え。逃げる者、手向かわぬ者は追うな', 4.5);
    rt.marker('ake', unitPos(F.akeU), '明智光秀', {});
    rt.after(12, () => this.p1(rt));
  },

  foe(rt, o, list) {
    const g = enemyGroup(rt, { faction: 'saito', order: 'hold', dmgMult: 0.6, ...o }, list);
    rt.flags.foes.push(g);
    return g;
  },
  // 逃げる僧・里の者・避難する人（戦わない。誰にも狙われない。自分で討てば下知違反）
  civ(rt, x, z, n2, name, dir) {
    const F = rt.flags;
    const monk = name.includes('僧');
    const c = enemyGroup(rt, { faction: 'imagawa', name, anchor: { x, z }, facing: Math.atan2(dir.x, dir.z), width: 4, aggro: 0, morale: 0, fleeDir: dir, speed: 2.5 },
      [{ type: 'porter', n: n2, o: monk ? { sohei: 1, flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    c.routed = true; c.order = 'flee';
    for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.dmg = 0; }
    c.civ = true;
    F.civ.push(c);
    return c;
  },

  // ===== P1 山麓：坂本の里に火がかかる。日吉社の前を抜け、本坂の登り口へ =====
  p1(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.t1 = rt.t;
    rt.setPhase('climb');
    sfx('horagai', 0.85);
    rt.unmark('ake');
    rt.obj('main', '日吉社の鳥居の前の僧兵を退け、本坂の登り口へ', 'main');
    rt.marker('hiyoshi', centerOf(F.hiyoshiG), () => `日吉社の前・${moraleWord(F.hiyoshiG.morale)}`, { red: true });
    walk(F.akechi, [[150, 4], [147, 2]], 2.6, (q) => attackFrom(q, 26));
    walk(F.teppo, [[154, 8], [152, 7]], 2.4);
    this.civ(rt, 150, 14, 5, '逃げる里の者', { x: 0.25, z: 1 });
    this.civ(rt, 151, -13, 3, '逃げる僧', { x: -1, z: -0.5 });
    rt.after(8, () => { if (F.fire.ignite('minka_5')) rt.bark('坂本の家に火がかかった'); });
    rt.after(30, () => { if (F.fire.ignite('hiyoshi_honden')) rt.say('足軽', '……日吉の社にまで火を', 3); });
    rt.after(3, () => rt.bark('手向かわずに逃げる僧や里の者は追うな。討てば下知に背くぞ'));
  },

  // ===== P2 登山：狭い山道・つづら折り・杉林。小さな抵抗。鐘・叫び・前の煙 =====
  p2(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.unmark('hiyoshi');
    rt.banner('本坂', '狭い山道を登る。上から射られるぞ');
    rt.obj('main', '煙の上がる本坂を、手向かう者を退けながら登れ', 'main');
    rt.marker('stairs', () => F._gp || P.stairsFoot, '本坂（道なりに文殊楼へ）', { h: 3 });
    walk(F.akechi, [[134, 3], ...pts('honzaka', 0, 13)], 2.5, (q) => { q.order = 'hold'; q.anchor = { x: 40, z: -4 }; q.aggro = 12; });
    walk(F.teppo, [[138, 4], ...pts('honzaka', 0, 12)], 2.4);
    // つづら折りの下の道に僧兵、上の折れに弓（上から射る）
    F.sw1 = this.foe(rt, { name: 'つづら折りの僧兵', anchor: { x: 83, z: 9 }, facing: Math.PI / 2, width: 4, aggro: 10, morale: 70, formation: 'yari', fleeDir: { x: -1, z: -0.4 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'ashigaru', n: 1 }], LAY)]);
    F.sw1Bow = this.foe(rt, { name: '折れの上の僧兵（弓）', anchor: { x: 74, z: -13 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 60, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    // 中腹の小堂：僧兵・神人・浅井朝倉の残党の鉄砲が混じる
    F.midG = this.foe(rt, { name: '中腹の小堂の衆', anchor: { x: 42, z: -8 }, facing: Math.PI / 2, width: 6, aggro: 12, morale: 75, fleeDir: { x: -1, z: -0.2 } },
      [...dress([{ type: 'ashigaru', n: 3 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 2 }], LAY), ...dress([{ type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM)]);
    // 文殊楼の守り（石段の上）と、門の内の浅井・朝倉の残党。鐘が鳴ると集まる
    F.monjuG = this.foe(rt, { name: '文殊楼の僧兵', anchor: { x: -9, z: -6 }, facing: Math.PI / 2, width: 5, aggro: 8, morale: 85, formation: 'yari', fleeDir: { x: -1, z: 0.2 } },
      dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI));
    F.monjuBow = this.foe(rt, { name: '文殊楼の上の弓', anchor: { x: -16, z: -11 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 70, fleeDir: { x: -1, z: -0.2 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    F.remG = this.foe(rt, { name: '浅井・朝倉の残党', anchor: { x: -22, z: -3 }, facing: Math.PI / 2, width: 4, aggro: 8, morale: 90, fleeDir: { x: -1, z: 0.3 } },
      dress([{ type: 'samurai', n: 3, o: { hat: 'kabuto' } }, { type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM));
    // 無動寺谷への分かれ道（別ルート・退き道・伏兵の谷）：本道を外れて谷へ下りれば、僧兵の伏兵が待つ
    rt.marker('mudoji', P.branch, '無動寺谷への道（分かれ道）', { h: 2 });
    F.mudojiG = this.foe(rt, { name: '無動寺谷の伏兵', anchor: { x: 46, z: 20 }, facing: -Math.PI / 2, width: 4, aggro: 14, morale: 70, fleeDir: { x: 0.2, z: 1 } }, dress([{ type: 'ashigaru', n: 4 }, { type: 'bow', n: 2 }], SOHEI));
    rt.after(14, () => rt.say('明智光秀', '無動寺の谷道は退き口にもなる。伏兵に気をつけよ', 4));
    this.civ(rt, 30, 8, 6, '逃げる僧', { x: 0.2, z: 1 });
    this.civ(rt, 38, -14, 6, '山へ逃れていた里の者', { x: 0.3, z: 1 });
    rt.say('明智光秀', '細道じゃ。一人ずつ、前を詰めて登れ', 4);
    rt.after(7, () => { if (F.step === 2) rt.say('宣教師の見聞', 'フロイスの手紙では、谷々の僧坊は、長い戦乱で数を減らしていたという', 5.5); });
  },

  // 中腹の平場に着いた：東塔の鐘が鳴り、前に煙が上がる（佐久間の手が東谷に火をかけた）
  bellTodo(rt) {
    const F = rt.flags;
    if (F.bell1) return;
    F.bell1 = true;
    ringBell(rt, F.G.byId.todo_shoro);
    rt.banner('東塔の鐘が鳴る', '山の上の僧兵が集まってくる');
    rt.army.play('eshout', { x: -10, z: -6 }, 1.2);
    for (const g of [F.monjuG, F.monjuBow, F.remG]) if (g) { g.aggro = 13; g.morale = Math.min(100, g.morale + 10); }
    rt.after(6, () => {
      const r = F.G.recs.find((q) => q.cl === 'higashidani' && q.state === 0 && q.kind === 'sobo');
      if (r && F.fire.ignite(r)) rt.say('足軽', '上に煙が……佐久間様の手が、東の谷に火をかけたか', 3.5);
    });
  },

  // 杉林の伏せ：狭い道の両側の木の間から
  ambush(rt) {
    const F = rt.flags;
    if (F.amb) return;
    F.amb = true;
    for (const [x, z] of [[12, -19], [16, 4]]) {
      const g = this.foe(rt, { name: '杉林の僧兵', anchor: { x, z }, facing: Math.PI / 2, order: 'attack', seekRange: 30, width: 3, aggro: 12, morale: 70, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'ashigaru', n: 3 }], SOHEI));
      F.ambG = (F.ambG || []).concat(g);
    }
    rt.army.play('eshout', { x: 12, z: -8 }, 1.4);
    rt.bark('杉林から僧兵が！', true);
  },

  // ===== P3 文殊楼：石段の上の楼門。ここで初めて東塔の大伽藍が見える =====
  p3(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    rt.unmark('mudoji');
    F.step = 3; F.stepT = rt.t;
    rt.unmark('stairs');
    this.bellTodo(rt);
    rt.banner('文殊楼', '石段の上の楼門。東塔の入口');
    rt.obj('main', '文殊楼を抜け、燃える堂の間の山道へ進め', 'main');
    rt.marker('monju', P.monjuro, () => `文殊楼・${moraleWord(F.monjuG.morale)}`, { red: true, h: 9 });
    walk(F.akechi, pts('honzaka', 13, 19), 2.5, (q) => attackFrom(q, 30));
    walk(F.teppo, [...pts('honzaka', 12, 18)], 2.4, (q) => { q.order = 'hold'; q.anchor = { x: 6, z: -10 }; });
    // 東塔の中の守り（先に置いておく。鐘で集まった衆）
    F.chudoG = this.foe(rt, { name: '根本中堂の前の僧兵', anchor: { x: -40, z: -7 }, facing: Math.PI / 2, width: 6, aggro: 12, morale: 95, fleeDir: { x: -1, z: -0.4 } },
      dress([{ type: 'samurai', n: 1, o: { weapon: 'spear' } }, { type: 'ashigaru', n: 6 }], SOHEI));
    F.courtBow = this.foe(rt, { name: '廻廊の弓', anchor: { x: -36, z: -14 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 70, fleeDir: { x: -1, z: -0.4 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    F.kodoG = this.foe(rt, { name: '大講堂の僧兵', anchor: { x: -46, z: -27 }, facing: Math.PI / 2, width: 6, aggro: 10, morale: 85, fleeDir: { x: -1, z: -0.6 } },
      [...dress([{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 2 }], LAY)]);
    rt.after(6, () => { if (!F.ending) F.fire.ignite('konponchudo_1571'); });
    rt.army.play('eshout', P.monjuro, 1.5);
    rt.say('僧兵', '仏敵じゃ！　この御山に一歩も入れるな！', 3);
  },

  // ===== P4 根本中堂の周り：燃える堂の間を掃討。逃げ惑う人々と煙に混乱する味方 =====
  p4(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.unmark('monju');
    rt.banner('東塔へ入る', '根本中堂の火。堂の間を逃げる人々');
    rt.obj('main', '燃える根本中堂の前を抜け、山道を西塔へ掃討せよ', 'main');
    rt.objProgress('main', '根本中堂の前へ');
    rt.marker('court', () => F._gp, () => F.courtDone ? '西塔への山道' : '根本中堂', { h: 3 });
    walk(F.akechi, [...pts('honzaka', 19, 22), ...pts('todo', 1, 3)], 2.5, (q) => attackFrom(q, 30));
    walk(F.teppo, pts('honzaka', 18, 22), 2.4, (q) => { q.order = 'hold'; q.anchor = { x: -18, z: -8 }; });
    // 煙で道を見失った味方。救い出しの任務にはしない
    F.akechi2 = allyGroup(rt, { faction: 'oda', name: '煙に迷う明智の兵', anchor: { x: -22, z: -24 }, facing: -Math.PI / 2, width: 6, aggro: 10, noRout: true, order: 'hold', seekRange: 12 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ODA));
    F.akechi2.defMult = 1.2; F.akechi2.dmgMult = 0.85;
    F.oda.push(F.akechi2);
    F.lostT = rt.t + 8; F.lostN = 0;
    rt.say('明智光秀', '堂が燃えておる。手向かう者だけを退け、山道を先へ進め。逃げる者は追うな', 4.5);
    rt.after(8, () => { if (!F.ending) F.fire.ignite('daikodo_old'); });
    this.civ(rt, -44, -8, 7, '逃げる僧', { x: -1, z: 0.25 });
    this.civ(rt, -52, -30, 7, '大講堂に逃れていた人々', { x: -0.4, z: -1 });
    this.civ(rt, -30, 18, 6, '南谷の僧', { x: -0.3, z: 1 });
    // 火が地区へ広がりはじめる：南谷と西谷の僧坊
    rt.after(10, () => { const r = F.G.recs.find((q) => q.cl === 'minamidani' && q.state === 0); if (r) F.fire.ignite(r); });
    rt.after(24, () => { const r = F.G.recs.find((q) => q.cl === 'nishidani' && q.state === 0); if (r) F.fire.ignite(r); });
  },

  // 西塔の鐘：別の地区が警戒し、西塔から加勢が来る（P5 の入口）
  bellSaito(rt) {
    const F = rt.flags;
    if (F.bell2) return;
    F.bell2 = true; F.westT = rt.t;
    ringBell(rt, F.G.byId.saito_shoro, { rapid: true });
    rt.banner('西塔の鐘が鳴る', '西の山道から加勢が来る');
    rt.unmark('court');
    rt.obj('main', '燃える東塔を抜け、西塔へ続く山道を掃討せよ', 'main');
    rt.marker('west', () => F._gp || P.westGate, '西塔への山道', { h: 3 });
    F.saitoG = this.foe(rt, { name: '西塔からの加勢', anchor: { x: -100, z: -31 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 85, fleeDir: { x: -1, z: -0.3 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto' } }], REM)]);
    walk(F.saitoG, [[-96, -30], [-86, -27], [-76, -21]], 2.6, (q) => attackFrom(q, 28));
    rt.say('明智光秀', '西塔の鐘か。煙の中で味方が乱れておる。組を離すな、山道を先へ押し上げよ', 4.5);
  },

  // ===== P6 西塔：浄土院を抜け、にない堂の森を経て釈迦堂へ。密林・建物間の狭い戦い（19〜25章） =====
  p6(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.unmark('west');
    rt.banner('西塔へ', '浄土院を過ぎ、森の深い谷間へ入る');
    rt.obj('main', '浄土院を荒らさず抜け、燃える西塔の山道を掃討せよ', 'main');
    rt.marker('west', () => F._gp, '西塔の山道', { h: 3 });
    rt.marker('jodoin', P.jodoin, '浄土院（最澄の御廟・荒らすな）', { h: 3 });
    walk(F.akechi, pts('saito', 4), 2.3, (q) => attackFrom(q, 24));
    walk(F.teppo, pts('saito', 4, 7), 2.1);
    // にない堂（常行堂・法華堂）周辺の森の伏せ。東塔より道が狭く、森が深い（25章）
    F.ninaidoG = this.foe(rt, { name: 'にない堂の僧兵', anchor: { x: -112, z: -44 }, facing: Math.PI / 2, width: 4, aggro: 11, morale: 78, fleeDir: { x: -1, z: -0.3 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI)]);
    // 釈迦堂の守り（西塔の中心）
    F.shakadoG = this.foe(rt, { name: '西塔・釈迦堂の僧兵', anchor: { x: -133, z: -40 }, facing: Math.PI / 2, width: 5, aggro: 12, morale: 92, formation: 'yari', fleeDir: { x: -1, z: -0.4 } },
      [...dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM)]);
    F.saitoBow2 = this.foe(rt, { name: '西塔の弓', anchor: { x: -128, z: -50 }, facing: Math.PI / 2, width: 3, aggro: 11, morale: 65, fleeDir: { x: -1, z: -0.3 } }, dress([{ type: 'bow', n: 2 }], SOHEI));
    this.civ(rt, -118, -56, 7, '西塔の僧坊に逃れていた人々', { x: -1, z: -0.4 });
    this.civ(rt, -130, -32, 6, '逃げる僧', { x: -1, z: -0.4 });
    rt.after(8, () => { if (!F.ending) F.fire.ignite('shakado_old'); });
    rt.say('明智光秀', '木立を抜けよ。前の者に続き、列を切らすな', 4);
    rt.after(16, () => rt.bark('北の山の奥、横川のあたりにも煙が見える……この山はどこまでも寺が続く'));
  },

  // ===== P7 横川：西塔からさらに北へ長い山道。燃える横川中堂への山道を掃討する（26〜32章） =====
  p7(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.stepT = rt.t;
    rt.unmark('shakado'); rt.unmark('jodoin'); rt.unmark('west');
    rt.banner('横川へ', '長い山道の先、北の山中へ入る');
    rt.obj('main', '逃げ惑う人々を追わず、横川への山道を掃討せよ', 'main');
    rt.marker('yokawa', () => F._gp, '横川への山道', { h: 3 });
    walk(F.akechi, pts('yokawa'), 2.2, (q) => attackFrom(q, 24));
    F.yokawaG = this.foe(rt, { name: '横川中堂の僧兵', anchor: { x: -94, z: -222 }, facing: Math.PI, width: 5, aggro: 12, morale: 90, formation: 'yari', fleeDir: { x: 0, z: -1 } },
      [...dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'bow', n: 2 }], SOHEI)]);
    this.civ(rt, -108, -236, 7, '横川の僧坊に逃れていた人々', { x: 0, z: -1 });
    this.civ(rt, -96, -207, 5, '逃げる僧', { x: 0, z: -1 });
    rt.after(8, () => { if (!F.ending) F.fire.ignite('yokawa_chudo_1571'); });
    rt.say('明智光秀', '横川まではなお長い。逃げる者を追わず、本道を進め', 4);
  },

  win(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('mudoji');
    for (const id of ['hiyoshi', 'stairs', 'monju', 'court', 'kodo', 'chudoG', 'west', 'jodoin', 'shakado', 'yokawa']) rt.unmark(id);
    rt.objDone('main');
    if (!F.civHurt) rt.objDone('civ');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '燃える山道を掃討した', pts: 22 }; }, '任務達成・山道を掃討した');
    sfx('kane', 0.5);
    rt.banner('比叡の山、煙に包まれる', why || '燃える山道の掃討を終え、味方が後を引き継いだ');
    rt.say('明智光秀', `${nm(rt)}、ようやった。……この山の煙は、京からも見えよう`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.fire) F.fire.tick(dt);
    if (F.ending || F.step < 1) return;
    const u = rt.player.u;
    // 道しるべ：任務の印は、道筋（本坂・東塔の小道）の少し先の点に置く（斜面や森へまっすぐ向かわせない）
    {
      const R = routeFor(F), key = F._routeKey;
      if (F._gKey !== key) {
        F._gKey = key;
        let bi = 0, bd = Infinity;
        R.forEach(([x, z], i) => { const d = Math.hypot(x - u.pos.x, z - u.pos.z); if (d < bd) { bd = d; bi = i; } });
        F._gI = bi;
      }
      while (F._gI < R.length - 1 && Math.hypot(R[F._gI][0] - u.pos.x, R[F._gI][1] - u.pos.z) < 7) F._gI++;
      F._gp.x = R[F._gI][0]; F._gp.z = R[F._gI][1];
    }
    const T = rt.t - (F.t1 || 0);
    if (F.step === 1) {
      const cleared = gone(F.hiyoshiG) || F.hiyoshiG.count <= 1;
      if (cleared && !F.hiyoDone) { F.hiyoDone = true; rt.unmark('hiyoshi'); rt.bark('日吉社の前が開いた。登り口へ'); rt.marker('trail', P.trailhead, '本坂の登り口', { h: 3 }); }
      if ((cleared && near(u, P.trailhead, 16)) || u.pos.x < 118 || rt.t - F.stepT > 110) { rt.unmark('trail'); this.p2(rt); }
    } else if (F.step === 2) {
      if (u.pos.x < 64) this.bellTodo(rt);
      if (u.pos.x < 30) this.ambush(rt);
      if (near(u, P.stairsFoot, 9) || u.pos.x < 0) this.p3(rt);
      rt.objProgress('main', `のこり ${Math.max(0, Math.round((u.pos.x - P.stairsFoot.x) * 10))}m ほど`);
    } else if (F.step === 3) {
      const left = standing(F.monjuG) + standing(F.monjuBow) + standing(F.remG);
      rt.objProgress('main', '門を抜け、根本中堂の見える山道へ');
      if (near(u, P.monjuro, 6) || u.pos.x < -20 || (left <= 2 && u.pos.x < -2) || rt.t - F.stepT > 35) this.p4(rt);
    } else if (F.step === 4) {
      if (!F.courtDone && (near(u, P.court, 9) || u.pos.x < -34)) {
        F.courtDone = true;
        rt.objProgress('main', '堂の間を抜け、西の山道へ');
        rt.bark('根本中堂の前へ出た。煙の中を西の山道へ');
      }
      if ((F.courtDone && rt.t - F.stepT > 25) || rt.t - F.stepT > 100) this.bellSaito(rt);
      if (F.bell2) {
        rt.objProgress('main', `西塔への道まで ${Math.round(Math.hypot(u.pos.x - P.westGate.x, u.pos.z - P.westGate.z))}m`);
        if (near(u, P.westGate, 18) || rt.t - F.westT > 90) this.p6(rt);
      }
    } else if (F.step === 5) {
      rt.objProgress('main', `西塔の山道の先まで ${Math.round(Math.hypot(u.pos.x - P.saito.x, u.pos.z - P.saito.z))}m`);
      if ((near(u, P.saito, 18) && rt.t - F.stepT > 20) || rt.t - F.stepT > 150) this.p7(rt);
    } else if (F.step === 6) {
      rt.objProgress('main', `横川中堂まで ${Math.round(Math.hypot(u.pos.x - P.yokawa.x, u.pos.z - P.yokawa.z))}m`);
      if ((near(u, P.yokawa, 18) && rt.t - F.stepT > 20) || rt.t - F.stepT > 180) this.win(rt, '燃える堂の間を抜け、横川への山道の掃討を終えた');
    }
    // 煙で道を見失う味方。移動先は使い回し、下知を出す時だけ更新する。
    if (F.step === 4 && F.akechi2 && !gone(F.akechi2) && rt.t >= F.lostT) {
      F.lostT = rt.t + 8;
      const g = F.akechi2, at = LOST_POINTS[F.lostN % LOST_POINTS.length];
      g.order = 'move'; g.speed = 2; g.dest = at; g.onArrive = holdLost;
      if (F.lostN % 3 === 0) rt.say('足軽', LOST_LINES[(F.lostN / 3 | 0) % LOST_LINES.length], 3);
      F.lostN++;
    }
    // 長くかかりすぎたら、確かめを止めない保険で決着させる（4〜7分の戦）
    if (T > 410 && !F.ending) this.win(rt, F.step >= 6 ? '横川への山道は長い。味方が後を引き継いだ' : F.step >= 5 ? '西塔の森は深い。味方が後を引き継いだ' : '東塔は焼け落ち、守りは西へ退いた');
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('逃げる非戦の者を討った', ['明智光秀', '追うなと申したはずじゃ。刃向かわぬ者を討って、何の手柄か']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || g.civ || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    F.routSaidT = rt.t;
    const V = [`${g.name}が崩れた`, `${g.name}の弓の音が止んだ`, `${g.name}、石が落ちてこぬ。退いたぞ`, `${g.name}が山の奥へ逃げていく`];
    rt.say('足軽', V[(F.routN = (F.routN || 0) + 1) % V.length], 2.5);
  },
};

hiei_mtn.noWake = true;       // 軽い遠景の大軍を本物の兵へ増やさず、携帯向けの人数を守る
hiei_mtn.noTaishoRaid = true;   // 山では、殿を狙う別手を崖や谷の向こうに湧かせない（本坂を登る筋に絞る）
hiei_mtn.sides = { a: { name: '織田軍（明智光秀の手）', mon: 'oda' }, b: { name: '延暦寺の僧兵・浅井朝倉の残党', mon: 'namu' } };
hiei_mtn.famous = [
  { name: '明智光秀', team: 0, line: '刃向かう者とだけ戦え。逃げる者は追うな' },
];
hiei_mtn.date = () => '元亀二年（1571）九月十二日　朝・霧';
hiei_mtn.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '登りの下知まで待つ' : '');
hiei_mtn.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
hiei_mtn.history = '元亀二年九月十二日、織田信長は比叡山延暦寺を攻めた。延暦寺は前年の志賀の陣で浅井・朝倉を山にかくまい、信長の求めに応じなかった。信長公記は、坂本の町から山上の堂塔に火が放たれ、僧も俗も区別なく多くが討たれたと記す。兼見卿記・多聞院日記も焼き討ちと大きな犠牲を伝える。死者は数百とも数千とも言われ、焼けた広さにも諸説がある。正覚院豪盛は山を逃れ、のちに武田信玄を頼ったという。山には東塔・西塔・横川の三地区があり、堂と僧坊が谷々に散らばっていた。この戦の建物は、焼ける前の姿を推し量って作った。この遊びでは、燃える堂と坂本の町の間の山道を上へ掃討し、刃向かう者とだけ戦い、逃げ惑う者を討たない形にしている。この下知は遊びのためのもので、史実の焼き討ちを非戦の者が守られた出来事として描くものではない。 『耶蘇会士日本通信』に収められたフロイスの焼き討ち報告は、谷々にあった僧坊が長い戦乱で減っていたと伝える。本道脇の礎石は、その荒廃を表す推定の景色であり、史料がこの場所の建物跡を示したわけではない。手紙は僧や女性、子どもも犠牲になったと伝えるが、人数や全ての経過が確定したわけではない。宣教師は布教の立場から仏教を厳しく評しており、その評価を山の人々すべての姿としては使わない。台詞は自分の言葉で短く言い直した。『武功夜話』は後の時代の作で、成立や内容に疑いがあるため、今回の根拠には使っていない。';

// 素直な遊び手：その段の道筋（castles/hiei1571.js の道）をたどり、近い敵とは戦う。深手なら味方の中へ下がる
const ROUTE = {
  1: () => [[160, 5], [150, 3], [146, -4], [140, 3], [128, 2], [120, 2]],
  2: () => [...pathById('honzaka').pts.slice(0, 20)],
  3: () => [...pathById('honzaka').pts.slice(17), [-20, -6]],
  4: (F) => (!F.courtDone && !F.bell2 ? [[-8, -6], [-12, -6], [-17, -6], [-22, -5.5], [-26, -5], [-30, -5], [-38, -5]]
    : [[-30, -5], [-24, -5], [-19, -9], [-21, -18], [-28, -25], [-38, -29], [-50, -24], [-60, -22], [-70, -20], [-76, -21]]),
  5: () => [...pts('saito', 4)],
  6: () => [...pts('yokawa')],
};
// 段や目的地が変わった時だけ道筋を作る。毎コマ配列を作らない。
function routeFor(F) {
  const key = F.step * 4 + (F.courtDone ? 1 : 0) + (F.bell2 ? 2 : 0);
  if (F._routeKey !== key) { F._routeKey = key; F._route = (ROUTE[F.step] || ROUTE[4])(F); }
  return F._route;
}
const LOST_POINTS = [{ x: -22, z: -24 }, { x: -28, z: -25 }, { x: -21, z: -18 }];
const LOST_LINES = ['煙で前が見えぬ！　道はどちらじゃ', '堂が崩れるぞ！　下がれ、下がれ', '味方はどこじゃ、声を出せ！'];
const canFight = (o) => !o.fleeing && !o.noTarget;
const holdLost = (g) => { g.order = 'hold'; g.anchor = g.dest; };
hiei_mtn.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending || !F.step) return;
  if (u.hp < u.maxHp * 0.4) {
    const back = F.akechi && F.akechi.count ? F.akechi.center() : u.pos;
    inp.guardHold = (b.army.threats?.length || 0) > 0;
    goTo(p, inp, back.x, back.z, 4);
    return;
  }
  // 段の上（法面の上）の敵へ向かって詰まった時は、しばらく道筋へ戻る（石段から回り込む）
  const moved = F._fLast ? Math.hypot(F._fLast.x - u.pos.x, F._fLast.z - u.pos.z) : 1;
  if (!F._fLast) F._fLast = { x: 0, z: 0 };
  F._fLast.x = u.pos.x; F._fLast.z = u.pos.z;
  const e = b.t < (F._ignoreT || 0) ? null : b.army.nearestEnemy(u, 11, canFight);
  if (e) {
    F._fStuck = moved < 0.03 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3 ? (F._fStuck || 0) + 1 : 0;
    if (F._fStuck > 50) { F._fStuck = 0; F._ignoreT = b.t + 7; }
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    const press = (b.army.threats?.length || 0);
    inp.guardHold = press > 0 && Math.random() < Math.min(0.95, 0.6 + press * 0.15);
    return;
  }
  inp.guardHold = false;
  // 道筋をたどる：いちばん近い点から始め、着いたら次の点へ（戻らない）。詰まったら次の点へ飛ばす
  const R = routeFor(F);
  const key = F._routeKey;
  if (F._botKey !== key) {
    F._botKey = key;
    let bi = 0, bd = Infinity;
    R.forEach(([x, z], i) => { const d = Math.hypot(x - u.pos.x, z - u.pos.z); if (d < bd) { bd = d; bi = i; } });
    F._botI = bi;
  }
  while (F._botI < R.length - 1 && Math.hypot(R[F._botI][0] - u.pos.x, R[F._botI][1] - u.pos.z) < 3.5) F._botI++;
  F._botStuck = F._botLast && Math.hypot(F._botLast.x - u.pos.x, F._botLast.z - u.pos.z) < 0.05 ? (F._botStuck || 0) + 1 : 0;
  if (!F._botLast) F._botLast = { x: 0, z: 0 };
  F._botLast.x = u.pos.x; F._botLast.z = u.pos.z;
  // 詰まったら（崖・建物）、少し脇へ逃げてから、道筋のいちばん近い点を探し直す
  if (b.t < (F._rescueT || 0)) { p.yaw = F._rescueYaw; inp.k.add('KeyW'); return; }
  if (F._botStuck > 40) { F._botStuck = 0; F._rescueT = b.t + 1.5 + Math.random() * 1.5; F._rescueYaw = p.yaw + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.4); F._botKey = null; return; }
  const k = F._botI;
  goTo(p, inp, R[k][0], R[k][1], 2);
};

export { hiei_mtn };
