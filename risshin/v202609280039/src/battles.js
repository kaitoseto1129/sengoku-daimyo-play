import { distToPolyline } from './world.js';
import { palisade, stumps, jinmaku, nobori, hut, lumber, yagura, campfire, scaffold, kabukimon, tawara, bobosaku, umatsunagi, kobune, hasa, koshi, umaFollow, kagaribi, sakamogi, takataba } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS, BATTLES, onScenario, markReady, scenarioKey } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { hush } from './audio.js';
// 長篠編の戦は一つずつ別のファイル（中身がまだなら null）
import { nagashinojo } from './b_nagashinojo.js';
import { tobinosu } from './b_tobinosu.js';
import { suwahara } from './b_suwahara.js';
import { anegawa } from './b_anegawa.js';
import { sekigahara, clash } from './b_sekigahara.js';
import { sanadamaru } from './b_osaka.js';
import { sune } from './b_sune.js';
import { kanegasaki } from './b_kanegasaki.js';
import { domyoji } from './b_domyoji.js';
import { hieizan } from './b_hieizan.js';
// 織田家編で足した戦（一つの戦を一つのファイルに）
import { inabayama, customFlag } from './b_inabayama.js';
import { mitsukuri } from './b_mitsukuri.js';
import { nodafukushima } from './b_nodafukushima.js';
import { odani } from './b_odani.js';
import { nagashima } from './b_nagashima.js';
import { takato } from './b_takato.js';
import { honnoji } from './b_honnoji.js';
import { shiga } from './b_shiga.js';
import { tonezaka } from './b_tonezaka.js';
import { tennoji } from './b_tennoji.js';
import { shigisan } from './b_shigisan.js';
import { arioka } from './b_arioka.js';
import { miki } from './b_miki.js';
import { tedorigawa } from './b_tedorigawa.js';
import { iga } from './b_iga.js';
import { echizen } from './b_echizen.js';
import { kizugawa } from './b_kizugawa.js';
import { saika } from './b_saika.js';
import { tano } from './b_tano.js';
import { mikatagahara } from './b_mikatagahara.js';
import { tottori } from './b_tottori.js';
import { iwamura } from './b_iwamura.js';
import { okawachi } from './b_okawachi.js';


// ======================================================================
// 第1戦　桶狭間
// ======================================================================
const P1 = [[0, 172], [4, 140], [6, 118], [-8, 90], [-24, 60], [-30, 30], [-22, 0], [-12, -30], [-8, -46]];
const HONJIN = { x: 18, z: -116 };

// 動かせる遠景の軍勢（桶狭間・森部・墨俣で使う）：原点で作って、その場へ置き直す。
// 坂で浮かないように、塊は小さめにする。world の「ゆっくり揺れる」は x0 を動かして合わせる
function farArmy(rt, x, z, w, d, count, facing, armor, flag, seed) {
  const W = rt.world;
  const m = W.addDistantArmy({ x: 0, z: 0, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
  const q = { m, a: W.armies.find((e) => e.mesh === m), h0: W.heightAt(0, 0) };
  moveFar(rt, q, x, z);
  return q;
}
function moveFar(rt, q, x, z, rot) {
  q.x = x; q.z = z; q.a.x0 = x;
  q.m.position.set(x, rt.world.heightAt(x, z) - q.h0, z);
  if (rot !== undefined) q.m.rotation.y = rot;
}
// 道（点の並び）に沿って s だけ進んだ所と、その向き
function alongPath(path, s) {
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === path.length - 1) {
      const k = Math.max(0, Math.min(1, s / L));
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, h: Math.atan2(bx - ax, bz - az), end: s >= L && i === path.length - 1 };
    }
    s -= L;
  }
}

const okehazama = {
  spawn: { x: 3, z: 162, heading: Math.PI },
  world: {
    seed: 3,
    muddy: 0.85,     // 豪雨の後の山道はぬかるむ
    paths: [P1],
    height(x, z) {
      let h = 6 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.018) + 3 * Math.sin(x * 0.05) * Math.sin(z * 0.043 + 1);
      h += 16 * gauss(x, z, -85, -10, 2600) + 12 * gauss(x, z, 80, 40, 3000) + 10 * gauss(x, z, 75, -60, 2200) + 9 * gauss(x, z, -70, 110, 2400);
      h += 6 * gauss(x, z, HONJIN.x, HONJIN.z, 1400) + 5 * gauss(x, z, -46, -34, 500);
      // 本陣の東西に迫る尾根：田楽狭間の狭い谷あい
      h += 9 * gauss(x, z, HONJIN.x - 58, HONJIN.z - 6, 900) + 10 * gauss(x, z, HONJIN.x + 60, HONJIN.z + 4, 1000);
      // 中島砦：柵の外に土塁、その外に空堀（北の口は切る）
      const fr = Math.hypot(x, z - 162);
      if (fr > 12 && fr < 24 && !(z < 150 && Math.abs(x) < 4)) h += 1.1 * Math.exp(-((fr - 15.8) ** 2) / 2) - 1.3 * Math.exp(-((fr - 19.5) ** 2) / 1.6);
      const d = distToPolyline(x, z, P1);
      h -= 4 * Math.exp(-(d * d) / 300);
      return h;
    },
    clear: (x, z) =>
      Math.hypot(x - HONJIN.x, z - HONJIN.z) < 28 || Math.hypot(x, z + 96) < 16 || Math.hypot(x - 40, z + 92) < 14 ||
      Math.hypot(x + 22, z + 118) < 16 || Math.hypot(x, z - 162) < 20 || (z < -30 && z > -66 && x > -50 && x < 36) || Math.hypot(x + 46, z + 34) < 10 ||
      Math.hypot(x - 124, z - 110) < 34,   // 東の谷の村
    trees: 520,
    lightning: true,
    rainDir: [0.18, -0.98],   // 雨は南から北へ：織田の背を押し、今川の顔に吹きつける（信長公記）
    // 崩れて北へ逃げた今川の兵は、後ろの大軍の手前で見えなくなる（遠景の大軍に紛れ込まない）
    fleeOut: (x, z, team) => team === 1 && (z < -150 || Math.abs(x) > 120),
    groves: [{ x: -60, z: -70, r: 16, n: 26 }, { x: 55, z: -20, r: 18, n: 30 }, { x: -50, z: 20, r: 14, n: 18 }, { x: HONJIN.x - 58, z: HONJIN.z - 6, r: 16, n: 30 }, { x: HONJIN.x + 62, z: HONJIN.z + 6, r: 16, n: 30 }],
    // 本陣のまわりは踏み荒らされて泥（雨の後）
    tint(x, z, h, c) {
      const d = Math.hypot(x - HONJIN.x, z - HONJIN.z);
      if (d < 34) c.lerp({ r: 0.3, g: 0.26, b: 0.2 }, 0.45 * Math.min(1, (34 - d) / 12));
    },
  },
  setup(rt) {
    const W = rt.world;
    // 中島砦
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      if (i === 5) continue;
      rt.scene.add(palisade(W, [Math.sin(a0) * 15, 162 + Math.cos(a0) * 15, Math.sin(a1) * 15, 162 + Math.cos(a1) * 15], { h: 2.2 }));
    }
    rt.scene.add(hut(W, -6, 166, 6, 4, 0.2));
    rt.scene.add(yagura(W, 8, 170));
    for (const [x, z] of [[-10, 150], [10, 150], [-4, 176]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    // 今川本陣：陣幕の内に床几と馬印、脇に旗竿・兵糧・馬の杭（義元と旗本は戦う兵で置く）
    const KT = nagashinojo.kit;
    KT.honjin(rt, HONJIN.x, HONJIN.z, { mon: 'imagawa', w: 26, d: 18, gap: 10, people: false });
    // 遠景の村（東の谷。雨の中に茅葺きの屋根）
    KT.farVillage(rt, 124, 110, { rot: Math.PI / 2, n: 6, fields: 8, seed: 3 });
    // 本陣の脇に兵糧の俵
    rt.scene.add(tawara(W, HONJIN.x - 16, HONJIN.z + 4, 0.3, 6), tawara(W, HONJIN.x + 16, HONJIN.z - 3, -0.5, 5));
    for (const [x, z] of [[6, -106], [30, -106], [4, -128], [32, -128]]) rt.scene.add(nobori(W, x, z, 'imagawa', 6));
    // 今川の赤鳥の幟：白地に朱の赤鳥（櫛の形）。本陣の奥に混ぜる
    customFlag('akadori', (g) => {
      g.save(); g.fillStyle = g.strokeStyle = '#a8281c';
      g.translate(64, 84);
      g.beginPath(); g.ellipse(0, -8, 34, 16, 0, Math.PI, 0); g.lineTo(34, 2); g.lineTo(-34, 2); g.closePath(); g.fill();
      for (let i = 0; i < 15; i++) { const x = -31 + i * 4.4; g.fillRect(x, 2, 2.4, 26); }
      g.fillStyle = '#e8e2d2'; g.beginPath(); g.ellipse(0, -8, 22, 8, 0, Math.PI, 0); g.fill();
      g.restore();
    });
    for (const [x, z] of [[12, -132], [26, -132], [-2, -118]]) rt.scene.add(nobori(W, x, z, 'akadori', 6.5));
    for (const [x, z] of [[0, -96], [40, -92], [-22, -118], [18, -114]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    rt.scene.add(hut(W, -2, -104, 5, 3.5, 0.4, { wall: 0x857058 }));
    // 義元の塗輿：本陣の幕の内、床几の脇に据えてある
    rt.flags.koshi = koshi(W, HONJIN.x + 5, HONJIN.z - 3, 0.3);
    rt.scene.add(rt.flags.koshi);

    // 味方の行軍（前から 先手・一の組・源八組・後備）
    const starts = [120, 138, 156, 172];
    const finals = [[-28, -52], [12, -52], [-8, -46], [-22, -38]];
    const specs = [
      { name: '先手・与兵衛組', n: 13 },
      { name: '一の組', n: 15 },
      { name: '源八組', n: 9 },
      { name: '後備', n: 15 },
    ];
    rt.flags.cols = [];
    specs.forEach((sp, i) => {
      const sz = starts[i];
      const sx = sz > 140 ? 2 : 5;
      const path = [[sx, sz], ...P1.filter(([, z]) => z < sz - 2), finals[i]];
      const g = allyGroup(rt, { name: sp.name, anchor: { x: sx, z: sz }, facing: Math.PI, formation: 'column', spacing: 1.4, order: 'hold', speed: 2.6, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 } },
        [{ type: 'samurai', n: 1, o: { name: i === 0 ? '先手の組頭 与兵衛' : i === 2 ? '組頭 源八' : '', invuln: i === 0 || i === 2 } }, { type: 'ashigaru', n: sp.n }]);
      g.path = path;
      g.leader = g.units[0];
      if (i === 2) {
        rt.flags.genpachi = g.units[0];
        rt.flags.yashichi = g.units[1];
        g.units[1].name = '弥七'; g.units[1].invuln = true;
        rt.hostGroup = g;
      }
      if (i === 0) rt.flags.yohei = g.units[0];
      g.onArrive = (gg) => { gg.arrived = true; gg.order = 'hold'; gg.formation = 'line'; gg.facing = Math.PI; };
      rt.flags.cols.push(g);
    });
    // 信長の馬廻
    const nob = allyGroup(rt, { name: '馬廻', anchor: { x: 14, z: 176 }, facing: Math.PI, formation: 'column', order: 'hold', speed: 3.3, noRout: true },
      [...(rt.G.lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, flag: 'eiraku', horse: true, haori: 0x7a1d14 } }]), { type: 'samurai', n: 11, o: { flag: 'eiraku', invuln: true } }]);
    nob.path = [[14, 176], [18, 130], [14, 100], [2, 70], [-12, 40], [-30, 0], [-44, -30]];
    nob.onArrive = (g) => { g.order = 'hold'; g.formation = 'line'; g.facing = Math.PI; };
    rt.flags.nob = nob;
    // 信長の馬印（金の扇）は、馬印持ちが信長の後ろについて運ぶ
    if (!rt.G.lord && nob.units[0]) rt.flags.uma = umaFollow(W, rt.scene, nob.units[0], 'ogi');

    // 今川勢（休息中）
    const E = rt.flags.enemies = [];
    E.push(enemyGroup(rt, { faction: 'imagawa', anchor: { x: 0, z: -96 }, facing: 0, morale: 85, fleeDir: { x: 0.2, z: -1 }, aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 13 }]));
    E.push(enemyGroup(rt, { faction: 'imagawa', anchor: { x: 40, z: -92 }, facing: -0.4, morale: 85, fleeDir: { x: 0.6, z: -1 }, aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 3 }]));
    E.push(enemyGroup(rt, { faction: 'imagawa', anchor: { x: -22, z: -118 }, facing: 0.3, morale: 85, fleeDir: { x: -0.5, z: -1 }, aggro: 7 }, [{ type: 'busho', n: 1, o: { name: '今川方の侍大将' } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }]));
    // 本陣の東と北で休む組（かかれの後、本陣を守りに寄ってくる）
    E.push(enemyGroup(rt, { faction: 'imagawa', anchor: { x: 40, z: -124 }, facing: -0.8, morale: 85, fleeDir: { x: 0.6, z: -1 }, aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }]));
    E.push(enemyGroup(rt, { faction: 'imagawa', anchor: { x: -4, z: -134 }, facing: 0.2, morale: 85, fleeDir: { x: -0.2, z: -1 }, aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 1 }]));
    const H = enemyGroup(rt, { faction: 'imagawa', anchor: { x: HONJIN.x, z: HONJIN.z + 2 }, facing: 0, morale: 100, fleeDir: { x: 0, z: -1 }, aggro: 6, noRout: true, spacing: 1.8 },
      [{ type: 'busho', n: 1, o: { name: '今川義元', invuln: true, noHead: true, flagScale: 1.4 } }, { type: 'samurai', n: 8 }]);
    rt.flags.yoshimoto = H.units[0];
    // 義元にも槍をつけられる。深手を負わせれば、その場で毛利新介が首を挙げる（本人が一番槍）
    H.units[0].onWound = (src) => {
      const F2 = rt.flags; if (F2.yoshiDown) return;
      F2.yoshiDown = true; F2.yoshiByPlayer = !!(src && src.isPlayer);
      if (F2.yoshiByPlayer) { rt.bark('義元に一番槍！'); rt.award((t) => { t.special = { label: '今川義元に一番槍', pts: 40 }; }, '義元に一番槍'); }
    };
    // 義元は旗本の奥で太刀を振るうが、足軽ひとりを斬り伏せる役ではない（討つのは旗本を崩した後の筋書き）
    H.units[0].dmg *= 0.45;
    rt.flags.hatamoto = H;
    H.guard = true;   // 本陣の旗本：寄る敵に気づけば向き直って迎え撃つ（ai.js。義元は旗本の後ろへ下がる）
    H.defMult = 1.7;
    for (const u of H.units) if (u.type === 'samurai') u.dmg *= 0.75;
    E.push(H);

    // 信長で遊ぶ時：家臣の言上を聞いて出陣（源八・稽古・手ほどきは無し）
    if (rt.G.lord) {
      rt.flags.nobSeen = true;
      rt.setPhase('brief');
      rt.world.setTime('day');
      rt.obj('honjin0', '今川義元の本陣を突け', 'main');
      rt.say('簗田政綱', '殿、今川の本陣は桶狭間の山あいにて休んでおりまする。義元の塗輿も見えたと', 4.5);
      rt.say('柴田勝家', '手勢は二千。敵は二万五千……。されど、狙うは義元ただ一人にござる', 4);
      rt.say('織田信長', '首は取るな、討ち捨てにせよ。狙うは義元の本陣のみ。――出るぞ', 4);
      rt.after(13, () => this.brief(rt));
    } else {
    rt.obj('talk', '組頭の源八に話しかける', 'main');
    rt.marker('genpachi', unitPos(rt.flags.genpachi), '組頭 源八');
    rt.addInteract('talk', unitPos(rt.flags.genpachi), '源八と話す', () => this.brief(rt), { r: 3.5 });
    rt.setPhase('brief');
    rt.world.setTime('day');
    rt.say('弥七', `おう、${nm(rt)}。組頭が呼んでおるぞ`, 3.5);
    // 出陣前の試し突き
    rt.flags.dummies = [rt.dummy(-3, 153, 0), rt.dummy(1, 151.5, 0), rt.dummy(5, 153, 0)];
    rt.obj('practice', '藁人形で試し突き（任意）', 'side');
    rt.after(4, () => rt.hint('practice'));
    // 手ほどき：稽古相手を相手に一通りの動きを覚える（任意。行軍が始まれば終わる）
    rt.flags.spar = rt.sparring(9, 151);
    rt.tutStart('手ほどき（任意）', [['move', '歩く（W A S D）'], ['run', '走る（Shift）'], ['thrust', '突く（左クリック）'], ['combo', '三段突き（素早く3回）'], ['charged', '溜め突き（押し続けて離す）'], ['guard', '構える（右クリック）'], ['sweep', '薙ぎ払う（構え＋左）'], ['parry', '受け流す（八助の「！」の直前に構える）'], ['dodge', '回避（Space）']], () => rt.grantTitle('drill'));
    }
    // 大軍：今川は二万五千。本陣のまわりの谷と、東西の丘に隊ごとに休む（雨の間は霞んで見えない）
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    rt.flags.imaDA = [DA(-40, -178, 110, 16, 480, 0, 0x3f2a24, 'imagawa', 3, 'mixed')];
    [[82, -160, 32, 16, 220, -0.3, 'spear'], [70, -104, 18, 30, 160, -0.7, 'spear'], [-72, -132, 30, 20, 200, 0.4, 'mixed'], [88, -62, 26, 18, 170, -1.1, 'spear'], [-102, -92, 22, 24, 150, 0.8, 'cavalry'], [46, -176, 50, 10, 200, -0.2, 'gun']]
      .forEach(([x, z, w, d, n, f, kind], i) => rt.flags.imaDA.push(DA(x, z, w, d, kind === 'cavalry' ? 110 : n, f, i % 2 ? 0x3a3026 : 0x3f2a24, 'imagawa', 11 + i, kind)));
    // 織田の後詰（善照寺砦の方）
    DA(-70, 60, 30, 40, 160, Math.PI, 0x2b3140, 'oda', 4, 'spear');
    // 織田の本隊（二千ほど）：行軍が始まると、組の後ろから山あいの道を続いてくる
    rt.flags.far = [];
    for (let i = 0; i < 8; i++) {
      const q = farArmy(rt, 0, 200, 5, 12, 36, 0, 0x2b3140, i % 3 === 1 ? 'eiraku' : 'oda', 70 + i);
      const side = i % 2 ? 3 : -3;
      // 道の途中（組が待つ谷の手前）で止まる。組の待つ所を通り抜けて、戦う兵と重ならないように
      q.path = [[side, 200], ...P1.filter(([, z]) => z > -20).map(([x, z]) => [x + side, z]), [-36 + (i % 4) * 14, -18 + Math.floor(i / 4) * 12]];
      q.s = -i * 14;   // 間をあけて続く
      q.m.visible = false;
      rt.flags.far.push(q);
    }
  },

  // 織田の本隊（見た目だけ）：道を進み、組の後ろに控え、「かかれ」で本陣の手前まで押し出す
  moveFar(rt, dt) {
    const F = rt.flags;
    if (rt.phase === 'brief') return;
    for (const q of F.far) {
      // 「かかれ」で本陣の左右まで広がって押し出す（坂を駆け下りる大勢に見せる）
      if (rt.phase === 'assault' && !q.push) { q.push = true; q.done = false; const k = F.far.indexOf(q); q.path.push([HONJIN.x + (k - 3.5) * 11, HONJIN.z + 34 + (k % 2) * 6]); }
      if (!q.done) q.s += dt * (rt.phase === 'march' ? 2.5 : 4.2);
      const p = alongPath(q.path, Math.max(0, q.s));
      q.done = p.end;
      q.m.visible = q.s > 0;
      moveFar(rt, q, p.x, p.z, p.end ? Math.PI : p.h);
    }
  },

  brief(rt) {
    if (rt.flags.briefed) return;
    rt.flags.briefed = true;
    if (rt.G.lord) { rt.after(1, () => this.startMarch(rt)); return; }
    rt.uninteract('talk');
    rt.unmark('genpachi');
    rt.objDone('talk');
    const n = nm(rt);
    rt.say('源八', `${n}、よう眠れたか。今川の大軍が大高・鳴海の砦を囲んでおる`, 4.5);
    rt.say('源八', '殿はここ中島砦から打って出られる。我らの組も続くぞ', 4);
    rt.say('源八', '殿の下知だ。首は取るな、討ち捨てにせよ。ひたすら敵を突き崩すのだ', 5);
    rt.say('源八', '列から離れるなよ。さあ、行くぞ', 3.5);
    rt.after(3, () => this.startMarch(rt));
  },

  startMarch(rt) {
    if (rt.phase === 'march') return;
    rt.setPhase('march');
    rt.objRemove('talk');
    if (!rt.G.lord) rt.obj('col', '隊列について進め', 'order');
    rt.obj('nohead', '首は取るな（討ち捨ての下知）', 'order');
    for (const g of rt.flags.cols) g.order = 'path';
    if (rt.flags.dummies) { for (const d of rt.flags.dummies) rt.army.despawn(d); rt.flags.dummies = null; }
    if (rt.flags.spar) { rt.army.despawn(rt.flags.spar); rt.flags.spar = null; }
    rt.tutEnd();
    rt.objRemove('practice');
    // 馬廻は少し遅れて出る（行軍を飛ばして既に着いていれば、もう道を歩かせない＝着いた所で立ち尽くさない）
    rt.after(6, () => { const nb = rt.flags.nob; if (nb.order === 'hold' && !((nb.pathIdx || 0) >= nb.path.length)) nb.order = 'path'; });
    rt.after(4, () => { sfx('taiko', 0.6); });
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    nagashinojo.kit.backTick(rt);
    if (F.uma) F.uma.update(dt);
    if (rt.phase === 'brief' && rt.t > 60) this.brief(rt);
    if (F.dummies && !F.practiced) {
      rt.objProgress('practice', `${Math.min(3, F.dummyHits || 0)}/3`);
      if ((F.dummyHits || 0) >= 3) { F.practiced = true; rt.objDone('practice'); rt.say('弥七', 'ほう、なかなかの腕じゃ', 2.5); }
    }
    // 信長が通り過ぎる
    if (!F.nobSeen && F.nob.order === 'path') {
      const c = F.nob.center();
      if (Math.hypot(c.x - p.x, c.z - p.z) < 26) {
        F.nobSeen = true;
        const nobu = F.nob.units[0];
        rt.marker('nobu', () => ({ x: nobu.pos.x, z: nobu.pos.z, y: nobu.pos.y }), '織田信長', { h: 4 });
        rt.after(9, () => rt.unmark('nobu'));
        rt.army.play('neigh', nobu.pos, 1.4);
        rt.say('弥七', '信長様だ！信長様が来たぞ！', 3);
        rt.say('', '――馬上の信長は、こちらを見ることもなく駆け抜けていった', 4);
      }
    }
    this.moveFar(rt, dt);
    if (rt.phase === 'march') this.march(rt, dt);
    if (rt.phase === 'wait') this.wait(rt, dt);
    if (rt.phase === 'assault') this.assault(rt, dt);
  },

  march(rt, dt) {
    const F = rt.flags;
    const host = rt.hostGroup;
    const p = rt.player.u.pos;
    // 伝令
    if (!F.denrei && host.pathIdx >= 3 && !rt.G.lord) {
      F.denrei = 'active';
      F.denreiT = 80;
      rt.say('源八', `${nm(rt)}、この書付を先手の与兵衛殿へ届けよ。急げ！`, 4);
      rt.obj('denrei', '書付を先手の与兵衛に届ける', 'side');
      rt.marker('yohei', unitPos(F.yohei), '与兵衛');
      rt.addInteract('denrei', unitPos(F.yohei), '書付を渡す', () => {
        F.denrei = 'done';
        rt.uninteract('denrei'); rt.unmark('yohei'); rt.objDone('denrei');
        rt.award((t) => t.c.denrei++, '伝令成功');
        rt.say('与兵衛', 'おう、確かに。源八に「承知」と伝えよ', 3.5);
      }, { r: 3.5 });
    }
    if (F.denrei === 'active') {
      F.denreiT -= dt;
      rt.objProgress('denrei', `残り${Math.max(0, Math.ceil(F.denreiT))}秒`);
      if (F.denreiT <= 0) {
        F.denrei = 'fail';
        rt.uninteract('denrei'); rt.unmark('yohei'); rt.objFail('denrei'); rt.objProgress('denrei', '');
        rt.say('源八', '遅い！もうよい、列に戻れ', 3);
      }
    }
    // 今川の物見と出会う：正面から一対一で、初めての本物の一突き
    if (!F.scoutOn && host.pathIdx >= 2 && !rt.G.lord) this.scout(rt);
    if (F.scoutG && !F.scoutDone && (F.scoutG.count === 0 || F.scoutG.routed || rt.t - F.scoutT > 40)) {
      F.scoutDone = true; rt.unmark('scout');
      if (F.scoutG.count === 0) { rt.objDone('scout'); rt.say('源八', 'ようやった。……それが初めての一突きじゃな。震えは戦が終わってからにせよ', 4); }
      else { rt.objFail('scout'); F.scoutG.noRout = false; F.scoutG.morale = 0; rt.say('源八', '物見を逃したか。……まあよい、列に戻れ', 3); }
    }
    // 豪雨の前ぶれ：風が強まり、空が暗くなる
    if (!F.preRain && host.pathIdx >= 4) {
      F.preRain = true;
      rt.world.setRainTarget(0.12);
      rt.say('弥七', '風が出てきたのう……西の空が真っ黒じゃ', 3);
    }
    // 豪雨
    if (!F.rain && host.pathIdx >= 5) {
      F.rain = true;
      rt.world.setRainTarget(1);
      rt.world.setTime('storm');
      rt.banner('豪雨', '石まじりの雨が、今川勢の方へ吹きつける');
      rt.say('弥七', 'なんちゅう雨じゃ……前がよう見えん', 3.5);
    }
    // 列を離れていないか
    let nearest = Infinity;
    for (const u of host.units) if (u.alive) nearest = Math.min(nearest, Math.hypot(u.pos.x - p.x, u.pos.z - p.z));
    // 伝令の間は、どれだけ離れても咎めない
    const onErrand = F.denrei === 'active';
    if (nearest > 30 && !onErrand && !rt.G.lord) {
      F.leaveT = (F.leaveT || 0) + dt;
      if (F.leaveT > 5 && !F.warned) { F.warned = true; rt.say('源八', `${nm(rt)}！列を離れるな！`, 3); }
      if (F.leaveT > 11) {
        F.leaveT = -25; F.warned = false;
        rt.violation('隊列を離れた', ['源八', '勝手な真似をするな！']);
      }
    } else if ((F.leaveT || 0) > 0) { F.leaveT = 0; F.warned = false; }
    if (host.arrived) {
      rt.setPhase('wait');
      this.mainLines(rt);
      if (!rt.G.lord) rt.objDone('col');
      rt.obj('wait', '雨が上がるまで待て', 'order');
      rt.say('源八', 'ここで待て。雨が上がったら一気にかかる', 4);
      rt.say('弥七', 'あの先が今川の本陣か……', 3);
    }
  },

  wait(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    rt.objProgress('wait', rt.pt < 16 ? '雨はまだ強い' : 'まもなく合図');
    // 待ちの間：源八と弥七の小声、一人称の案内（一度だけ）
    if (!F.w1 && rt.pt > 3) { F.w1 = true; rt.say('弥七', '（小声で）……源八殿、今川の者ども、飯を炊いておるようじゃ。煙が見える', 3.5); rt.after(4, () => rt.say('源八', '（小声で）黙っておれ。この雨が、殿の味方じゃ', 3)); }
    if (!F.w2 && rt.pt > 9) { F.w2 = true; rt.bark(isTouch ? '視点を替えて、雨の中を見てみよ（右上の「視点」）' : `視点を替えて、雨の中を見てみよ（${K('view')}）`); }
    if (!F.w3 && rt.pt > 12) { F.w3 = true; rt.say('弥七', '（小声で）手が震えるわ……', 2.5); rt.after(3, () => rt.say('源八', '（小声で）震えてよい。震えぬ奴から死ぬ', 3)); }
    if (rt.G.lord && p.z < -74 && rt.pt < 22) rt.pt = 22;
    if (!F.early && p.z < -74 && !rt.G.lord) {
      F.early = true;
      rt.violation('合図を待たずに突出', ['源八', '戻れ！まだだと言うておる！']);
    }
    if (rt.pt > 16 && !F.clear) {
      F.clear = true;
      rt.world.setRainTarget(0);
      rt.world.setTime('after');
      rt.world.addPuddles(30);
      rt.banner('雨が上がった');
    }
    // 雨が上がる → 静けさ → 信長の「かかれ」→ 法螺と鬨 → 一斉に駆け下りる（6 秒ほど）
    if (rt.pt > 19 && !F.hushed) { F.hushed = true; hush(3); }
    if (rt.pt > 22 && !F.kakare) {
      F.kakare = true;
      const nobu = F.nob.units[0];
      if (nobu && nobu.alive && !rt.G.lord) rt.player.cine = { x: nobu.pos.x, z: nobu.pos.z, t: 2 };
      rt.say('織田信長', 'かかれ、かかれ！　首は取るな、ただ討ち捨てにせよ！', 3.5);
      rt.after(1.6, () => {
        sfx('horagai', 1);
        rt.after(0.3, () => sfx('taiko', 1));
        for (const g of F.cols) rt.army.play('shout', g.center(), 1.3);
        rt.say('遠くの声', '殿の下知だ！　かかれぇーっ！', 3);
      });
      rt.after(3, () => {
        rt.say('源八', '行くぞ！　続けぇ！', 2.5);
        rt.banner('かかれ', '今川本陣へ');
        this.startAssault(rt);
        // 坂の下の低い所から、駆け下りてくる味方を見上げる 2 秒の絵（戦っている時は撮らない）
        rt.after(0.4, () => {
          const u = rt.player.u, dx = HONJIN.x - u.pos.x, dz = HONJIN.z - u.pos.z, l = Math.hypot(dx, dz) || 1;
          rt.player.showShot({ x: u.pos.x + dx / l * 9, z: u.pos.z + dz / l * 9 }, () => ({ x: u.pos.x, z: u.pos.z }), 2.2, { h: 0.6, lookH: 1.8, ang: Math.atan2(dx, -dz), drift: 0.8 });
        });
      });
    }
  },

  // 本戦の両翼：本陣へ向かう真ん中（x -36〜56。本物の兵が受け持つ）の東西に、織田の本隊と今川の休む大軍が正面いっぱいに並ぶ（軽い作り・addClash）。
  //   「かかれ」で両翼も一斉にぶつかり、本人が寄った所は本物の兵の乱戦に替わる。義元が討たれると今川の側が崩れる
  mainLines(rt) {
    const F = rt.flags;
    if (F.lines) return;
    const KT = nagashinojo.kit;
    const A = (n, x = {}) => ({ flag: 'oda', armor: KT.ARMOR.oda, count: n, team: 0, faction: 'oda', ...x });
    const B = (n, x = {}) => ({ flag: 'imagawa', armor: KT.ARMOR.imagawa, count: n, team: 1, faction: 'imagawa', flagRate: 0.5, ...x });
    F.lines = [
      clash(rt, { x: -78, z: -84, facing: Math.PI, w: 84, gap0: 36, closeSpeed: 3.6, seed: 61, noRout: true, killRate: 0.12, A: A(520), B: B(700, { bows: true }) }),
      clash(rt, { x: 93, z: -86, facing: Math.PI, w: 74, gap0: 36, closeSpeed: 3.6, seed: 62, noRout: true, killRate: 0.12, A: A(460), B: B(620) }),
    ];
    // 休んでいた所を突かれた今川は押される
    for (const c of F.lines) c.push('A', 0.25);
  },

  startAssault(rt) {
    const F = rt.flags;
    this.mainLines(rt);
    F.lines.forEach((c, i) => rt.after(1 + i * 1.5, () => c.go()));
    rt.setPhase('assault');
    rt.objDone('wait');
    rt.objRemove('col');
    rt.objRemove('wait');
    if (rt.G.lord) rt.objRemove('honjin0');
    rt.obj('honjin', rt.G.lord ? '今川義元の本陣を突け' : '今川本陣に突入せよ', 'main');
    rt.marker('honjin', { x: HONJIN.x, z: HONJIN.z }, '今川本陣');
    rt.zone('honjin', HONJIN.x, HONJIN.z, 14);
    // 一の組と後備は任務に数えない：遠くに残った者から外して、今川の大軍の中の軽い兵を本物に替える枠へ回す
    nagashinojo.kit.markRecyclable(F.cols[1], F.cols[3]);
    const offs = [[-24, -2], [22, 6], [0, 0], [-10, 12]];
    F.cols.forEach((g, i) => {
      g.order = 'attack';
      g.seekRange = 55;
      g.formation = 'loose';
      g.anchor = { x: HONJIN.x + offs[i][0], z: HONJIN.z + 20 + offs[i][1] };
      g.facing = Math.PI;
    });
    rt.after(4, () => {
      rt.army.play('eshout', { x: 10, z: -100 }, 2);
      for (const g of F.enemies) {
        if (g === F.hatamoto) { g.aggro = 12; continue; }
        // 休んでいた所を突かれた今川勢は浮き足立つ：崩れやすく、打ち込みも鈍い（具足を解いた者も多い）
        g.morale -= 22;
        for (const u of g.units) if (u.alive) u.dmg *= 0.8;
        g.order = 'attack';
        g.seekRange = 26;
      }
    });
  },

  assault(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 休んでいた今川の組は、近くに織田の兵がいなければ本陣を守りに寄っていく（その場で立ち尽くさない）
    F.guardT = (F.guardT || 0) - dt;
    if (F.guardT <= 0 && rt.pt > 4) {
      F.guardT = 1;
      for (const g of F.enemies) {
        if (g === F.hatamoto || !g.count || g.routed || g.order !== 'attack') continue;
        const c = g.center();
        const foe = rt.army.nearestEnemy(g.leader && g.leader.alive ? g.leader : g.units.find((u) => u.alive), g.seekRange);
        if (foe) continue;
        const tx = HONJIN.x + (c.x - HONJIN.x) * 0.3, tz = HONJIN.z + 16;
        const d = Math.hypot(tx - g.anchor.x, tz - g.anchor.z);
        if (d > 3) { const s = Math.min(d, 3); g.anchor = { x: g.anchor.x + (tx - g.anchor.x) / d * s, z: g.anchor.z + (tz - g.anchor.z) / d * s }; g.facing = 0; }
      }
    }
    // 近くに討てる敵がいなくなった味方の組は、持ち場で構えて待つ（行き先に着いたのに「かかれ」のまま立ち尽くさない）。敵が寄れば、またかかる
    F.calmT = (F.calmT || 0) - dt;
    if (F.calmT <= 0 && rt.pt > 10) {
      F.calmT = 1;
      for (const g of [...F.cols, F.nob]) {
        if (!g.count || (g.order !== 'attack' && !g.calm)) continue;
        const foe = rt.army.nearestEnemy({ pos: g.center(), team: 0 }, (g.seekRange || 30) + 6);
        if (g.order === 'attack' && !foe) { g.calm = true; g.order = 'hold'; }
        else if (g.calm && foe) { g.calm = false; g.order = 'attack'; }
      }
    }
    // 足軽の初陣：本人が囲まれかけたら、近くの味方の組が寄ってきて、本人に斬りかかる敵を先に突く（ひとりで倒れさせない）
    F.coverT = (F.coverT || 0) - dt;
    if (F.coverT <= 0 && !rt.G.lord && rt.player.u.alive) {
      F.coverT = 0.5;
      const pu = rt.player.u;
      const foes = [];
      rt.army.forNear(p.x, p.z, 6, (o) => { if (o.alive && o.team === 1 && o.target === pu) foes.push(o); });
      if (foes.length >= 2 || (foes.length && pu.hp < pu.maxHp * 0.6)) {
        foes.sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
        const near = [...F.cols].filter((g) => g.count).sort((a, b) => { const ca = a.center(), cb = b.center(); return Math.hypot(ca.x - p.x, ca.z - p.z) - Math.hypot(cb.x - p.x, cb.z - p.z); });
        const cover = [rt.hostGroup, near[0]].filter((g, i, a) => g && g.count && a.indexOf(g) === i);
        cover.forEach((g, i) => {
          const c = g.center();
          if (Math.hypot(c.x - p.x, c.z - p.z) > 45) return;
          g.focus = foes[Math.min(i, foes.length - 1)];
          g.calm = false; g.order = 'attack';
          g.anchor = { x: p.x, z: p.z };
        });
        if (!F.coverSaid) { F.coverSaid = true; rt.say('弥七', `${nm(rt)}、下がれ！　わしらが前に出る！`, 3); }
      }
    }
    // 味方救援
    if (!F.rescue && rt.pt > 18) {
      F.rescue = 'active';
      const R = allyGroup(rt, { name: '救援', anchor: { x: -8, z: -84 }, facing: Math.PI, noRout: true, aggro: 3 }, [{ type: 'samurai', n: 1, o: { name: '前野長兵衛' } }]);
      const m = R.units[0];
      m.hp = m.maxHp = 340;
      R.defMult = 1.8;
      F.maeno = m;
      const RE = enemyGroup(rt, { faction: 'imagawa', anchor: { x: -8, z: -88 }, facing: 0, order: 'attack', seekRange: 40, noRout: true, fleeDir: { x: -0.4, z: -1 } }, [{ type: 'ashigaru', n: 4 }]);
      for (const u of RE.units) { const a = Math.random() * 6.28; u.pos.x = -8 + Math.cos(a) * 3; u.pos.z = -84 + Math.sin(a) * 3; }
      RE.focus = m;
      F.rescueEnemies = RE;
      rt.obj('rescue', '囲まれた味方の侍を救え', 'side');
      rt.marker('maeno', unitPos(m), '救援');
      rt.say('前野長兵衛', '誰か、手を貸してくれ！囲まれた！', 3);
    }
    if (F.rescue === 'active') {
      if (!F.maeno.alive) {
        F.rescue = 'fail'; rt.objFail('rescue'); rt.unmark('maeno');
      } else if (F.rescueEnemies.count === 0) {
        F.rescue = 'done'; rt.objDone('rescue'); rt.unmark('maeno');
        rt.award((t) => t.c.rescue++, '味方救援');
        rt.grantTitle('rescue');
        rt.say('前野長兵衛', 'かたじけない！この恩は忘れぬ', 3);
        F.maeno.group.order = 'attack';
        F.maeno.group.seekRange = 40;
      }
    }
    // 本陣突入
    if (!F.entered && Math.hypot(p.x - HONJIN.x, p.z - HONJIN.z) < 14) {
      F.entered = true;
      F.enterT = rt.t;
      rt.objDone('honjin');
      rt.unmark('honjin');
      rt.unzone('honjin');
      rt.banner('今川本陣に突入！');
      rt.award((t) => { t.special = { label: '今川本陣突入', pts: 30 }; }, '今川本陣突入');
      rt.obj('crush', '旗本を崩し、味方を義元へ通せ', 'main');
      rt.marker('yoshimoto', unitPos(F.yoshimoto), '旗本の奥の義元', { red: true });
      this.bannermen(rt);
      // 味方の組も幔幕の内へなだれ込む（ひとりで旗本に囲まれないように）
      // 幔幕の南の半分を、組ごとに違う所から囲む（一か所に固まらないように）
      // 幔幕の口（南）の前へ組ごとに詰め、口から押し入る（幕は抜けられない）
      [...F.cols, F.nob].forEach((g, i, all) => {
        if (!g.count) return;
        const k = -1 + (2 * i) / Math.max(1, all.length - 1);
        g.order = 'attack'; g.seekRange = 30; g.formation = 'loose';
        g.anchor = { x: HONJIN.x + k * 4, z: HONJIN.z + 4 + Math.abs(k) * 3 };
      });
      rt.say('源八', '旗本は固いぞ！　ひとりで斬り込むな、皆で囲んで突き崩せ！', 3.5);
    }
    // 本陣の後詰が駆けつける
    if (!F.reinf && rt.pt > 55) {
      F.reinf = true;
      const R = enemyGroup(rt, { faction: 'imagawa', anchor: { x: 30, z: -150 }, facing: 0, order: 'attack', seekRange: 60, fleeDir: { x: 0.3, z: -1 }, morale: 90 },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }]);
      R.anchor = { x: HONJIN.x, z: HONJIN.z };
      F.enemies.push(R);
      nagashinojo.kit.backOf(rt, R, { flag: 'imagawa', armor: nagashinojo.kit.ARMOR.imagawa, kind: 'spear', w: 16, depth: 10, count: 110, seed: 93, stop: () => { const c = R.center(); return Math.hypot(c.x - HONJIN.x, c.z - HONJIN.z) < 30; } });
      rt.say('足軽', '北から今川の後詰が来るぞ！', 3);
    }
    const H = F.hatamoto;
    const hatamotoLeft = H.units.filter((u) => u.alive && u !== F.yoshimoto).length;
    if (F.entered) rt.objProgress('crush', `旗本 残り ${hatamotoLeft}人`);
    // 旗本が崩れかけたら、義元は輿を捨てて北へ退く
    if (F.entered && !F.koshiLeft && hatamotoLeft <= 4) {
      F.koshiLeft = true;
      rt.say('今川の旗本', '御輿を捨てよ！　御屋形様、こちらへ！', 3);
      H.anchor = { x: HONJIN.x - 4, z: HONJIN.z - 14 };
      if (F.koshi) { F.koshi.rotation.z = 0.12; F.koshi.position.y -= 0.4; }
    }
    const done = F.yoshiDown || (F.entered && rt.pt > 110 && (hatamotoLeft <= 2 || rt.t - F.enterT > 120)) || rt.pt > 340;
    if (done && !F.victory) {
      F.victory = true;
      // 義元が討たれた：両翼の今川も崩れて北へ
      (F.lines || []).forEach((c, i) => rt.after(2 + i * 2, () => c.rout('B', { hideAfter: 40, minFight: 20 })));
      const y = F.yoshimoto;
      y.invuln = false;
      // 服部小平太が一番に槍をつけ、毛利新介が組み伏せて首を挙げる（プレイヤーの目の前で）
      const [hat, mor] = F.nobKill || [];
      // （すでにそばにいる時だけ半歩寄せる。遠くから一息に飛ばさない：遠ければ駆け寄る）
      for (const u of [hat, mor]) if (u && u.alive) {
        const tx = y.pos.x + (u === hat ? 1.6 : -1.4), tz = y.pos.z + 1.4;
        if (Math.hypot(tx - u.pos.x, tz - u.pos.z) < 4) { u.pos.x = tx; u.pos.z = tz; } else { u.target = null; u.moveTo = { x: tx, z: tz }; }
      }
      rt.army.kill(y, mor && mor.alive ? mor : null);
      rt.unmark('yoshimoto');
      rt.banner('今川義元、討ち取ったり', F.yoshiByPlayer ? 'そなたが一番槍、毛利新介が首を挙げた' : '服部小平太が一番槍、毛利新介が首を挙げた');
      rt.player.cine = { x: y.pos.x, z: y.pos.z, t: 2.2 };
      rt.say('遠くの声', '義元公、討ち取ったりぃーっ！', 3);
      rt.say('源八', '勝ったぞ！　勝鬨を上げよ！', 3);
      sfx('horagai', 0.8);
      for (const g of F.enemies) { g.noRout = false; g.morale = 0; }
      if (F.rescueEnemies) { F.rescueEnemies.noRout = false; F.rescueEnemies.morale = 0; }
      // 本陣の崩れが伝わり、谷と丘に休んでいた今川の隊も崩れて散る（奥の大軍は背を向けて退く）
      F.imaDA.forEach((m, i) => rt.after(2 + i * 1.5, () => (i === 0 ? m.retreat(40, 40) : m.rout({ hideAfter: 50 }))));
      if (F.entered) { rt.objDone('crush'); rt.tracker.main = true; if (!rt.tracker.c.heads) rt.grantTitle('noHead'); }
      else { rt.tracker.main = false; rt.objFail('honjin'); rt.say('源八', '……お主、どこにおった', 3); }
      if (F.rescue === 'active') { F.rescue = 'fail'; rt.objFail('rescue'); rt.unmark('maeno'); }
      rt.finish({}, 9);
    }
  },

  // 馬廻の服部小平太と毛利新介：本陣に入ると、旗本の奥の義元を目指す
  bannermen(rt) {
    const F = rt.flags;
    if (F.nobKill) return;
    const c = F.nob.count ? F.nob.center() : { x: HONJIN.x, z: HONJIN.z + 20 };
    const g = allyGroup(rt, { name: '馬廻', anchor: { x: c.x, z: c.z }, facing: Math.PI, order: 'attack', seekRange: 30, noRout: true, aggro: 10 },
      [{ type: 'samurai', n: 1, o: { name: '服部小平太', invuln: true, flag: 'eiraku' } }, { type: 'samurai', n: 1, o: { name: '毛利新介', invuln: true, flag: 'eiraku' } }]);
    g.anchor = { x: HONJIN.x, z: HONJIN.z + 6 };
    F.nobKill = g.units;
  },
  // 行軍の途中で出会う今川の物見（一人）
  scout(rt) {
    const F = rt.flags;
    F.scoutOn = true; F.scoutT = rt.t;
    const p = rt.player.u.pos, h = rt.player.u.heading || Math.PI;
    const x = p.x + Math.sin(h) * 14 + 6, z = p.z + Math.cos(h) * 14;
    F.scoutG = enemyGroup(rt, { faction: 'imagawa', name: '今川の物見', anchor: { x, z }, facing: h + Math.PI, order: 'attack', seekRange: 30, aggro: 10, morale: 70, fleeDir: { x: 0, z: -1 } }, [{ type: 'ashigaru', n: 1, o: { hat: 'jingasa_n' } }]);
    const u = F.scoutG.units[0];
    u.focus = rt.player.u; F.scoutG.focus = rt.player.u;
    u.hp = u.maxHp = Math.min(u.maxHp, 90); u.dmg *= 0.5;
    rt.say('源八', `物見じゃ！　${nm(rt)}、声を上げられる前に突け！`, 3);
    rt.obj('scout', '今川の物見を討つ（正面から一対一）', 'side');
    rt.marker('scout', unitPos(u), '今川の物見', { red: true });
  },
  onKill(rt, v) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
  },
  onHead(rt) {
    if (rt.G.lord) return;
    rt.violation('首を取った（討ち捨ての下知に背く）', ['源八', '首は捨てよと言うたはずだ！']);
  },
  onPlayerHit(rt, t) {
    if (rt.phase === 'march' || rt.phase === 'wait' || rt.phase === 'brief') {
      if (!rt.flags.earlyHit && t.team === 1 && !rt.G.lord && t.group !== rt.flags.scoutG) { rt.flags.earlyHit = true; rt.violation('合図の前に仕掛けた', ['源八', '待て、まだ早い！　合図があるまで伏せておれ']); }
    }
  },
};

// ======================================================================
// 第2戦　森部
// ======================================================================
const ROAD2 = [[-40, 176], [-28, 100], [-14, 40], [-6, -40], [4, -176]];
const POINT2 = { x: 50, z: -6 };
const LINE2 = -58;

const moribe = {
  spawn: { x: 46, z: 74, heading: Math.PI },
  world: {
    seed: 21,
    muddy: 0.3,
    paths: [ROAD2],
    height(x, z) {
      return 1.4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.9 * Math.sin(x * 0.07 + z * 0.05) + 10 * gauss(x, z, 130, 60, 3000) + 8 * gauss(x, z, -130, -90, 3200) + 2 * gauss(x, z, 58, -8, 300);
    },
    tint(x, z, h, c) {
      // 田の畦
      if (Math.abs(x) < 120 && (Math.floor(x / 22) + Math.floor(z / 18)) % 3 === 0 && Math.abs(x - 50) > 18) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.95 + 0.02, c.b * 0.8);
      if (z < LINE2 && z > LINE2 - 1.5 && Math.abs(x) < 110) c.setRGB(0.38, 0.33, 0.22);
    },
    clear: (x, z) => (Math.abs(x) < 42 && Math.abs(z) < 100) || Math.hypot(x - 45, z - 70) < 12 || Math.hypot(x + 126, z + 30) < 34,
    // 五月の田：水を張り、苗を植えたばかり（畦を残す）
    paddy(x, z) {
      if (Math.abs(x) > 120 || Math.abs(x - 50) < 18) return 0;
      if ((Math.floor(x / 22) + Math.floor(z / 18)) % 3 !== 0) return 0;
      const ex = Math.min(((x % 22) + 22) % 22, 22 - ((x % 22) + 22) % 22), ez = Math.min(((z % 18) + 18) % 18, 18 - ((z % 18) + 18) % 18);
      if (distToPolyline(x, z, ROAD2) < 5) return 0;
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    // 東の林の脇を流れる小川
    streams: [{ pts: [[96, -176], [88, -90], [80, -20], [92, 60], [104, 176]], w: 2.2, depth: 1.3 }],
    mist: true,
    trees: 320,
    treeDensity: (x, z) => (Math.abs(x) > 90 ? 1 : 0.35),
    groves: [{ x: 60, z: -8, r: 12, n: 34 }, { x: 70, z: 20, r: 10, n: 14 }],
  },
  setup(rt) {
    const W = rt.world;
    // 開戦の引きの後、斎藤勢の横陣を正面の低い所から 3 秒見せる（向こうに構える大軍の圧）
    rt.after(4.6, () => {
      const M = rt.flags.M;
      if (!M) return;
      const c = centerOf(M);
      rt.player.showShot({ x: c.x - 6, z: c.z + 22 }, () => centerOf(M), 3, { h: 0.8, lookH: 2.2, ang: 0, drift: 1.2 });
    });
    // 倒れる寸前に仲間が割って入る手当ては、最初の桶狭間だけ（森部からは構えと回避で凌ぐ）。
    //   組頭見習いの戦なので、同時に本人へ打ちかかる敵は二人まで
    rt.firstFights = false;
    if (!rt.G.lord && (rt.G.rank || 0) <= 1) rt.army.maxAttackers = Math.min(rt.army.maxAttackers || 3, 2);
    const n = RANKS[rt.G.rank].squad || 5;
    rt.makeSquad({ x: 46, z: 77 }, Math.PI, [{ kind: 'spear', n }]);
    const oz = allyGroup(rt, { name: '大沢組', anchor: { x: 38, z: 70 }, facing: Math.PI, noRout: true }, [{ type: 'samurai', n: 1, o: { name: '足軽大将 大沢勘兵衛', invuln: true, horse: true } }, { type: 'ashigaru', n: 3, o: { invuln: true } }]);
    rt.flags.osawa = oz.units[0];
    rt.flags.A = allyGroup(rt, { name: '前備', anchor: { x: 8, z: 12 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, dmgMult: 0.55 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }]);
    rt.flags.B = allyGroup(rt, { name: '本備', anchor: { x: -22, z: 34 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 26 }]);
    // 西の横備え：合図で長井の備えに当たる
    rt.flags.Y = allyGroup(rt, { name: '横備え', anchor: { x: -52, z: 22 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }]);
    rt.flags.V = enemyGroup(rt, { faction: 'saito', anchor: { x: 16, z: -104 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, speed: 2.1, aggro: 5, noRout: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }]);
    rt.flags.M = enemyGroup(rt, { faction: 'saito', anchor: { x: -14, z: -82 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, width: 8, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '日比野下野守' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }, { type: 'gun', n: 2 }]);
    // 長井甲斐守の備え：日比野の西に並ぶ
    rt.flags.N = enemyGroup(rt, { faction: 'saito', anchor: { x: -54, z: -92 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 8, width: 7, morale: 90 },
      [{ type: 'busho', n: 1, o: { name: '長井甲斐守' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 2 }]);
    for (const [x, z] of [[30, 64], [-30, 44], [0, 24]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    for (const [x, z] of [[-20, -92], [0, -96], [-34, -90], [-60, -100], [-46, -100]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.scene.add(hut(W, -60, 60, 6, 4, 0.3, { roof: 0x6a5c44 }));
    rt.scene.add(hut(W, -70, 70, 5, 4, -0.2, { roof: 0x6a5c44 }));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('point', '部下を連れて林の端を押さえる', 'main');
    rt.obj('wait', '法螺貝の合図まで仕掛けるな', 'order');
    rt.marker('point', POINT2, '指示地点（林の端）');
    rt.zone('point', POINT2.x, POINT2.z, 10);
    rt.say('大沢勘兵衛', `${nm(rt)}、源八から五人を預かったそうじゃな。今日は組頭の見習いとして、わしの手で働け`, 4.5);
    rt.say('大沢勘兵衛', 'あの林の端を押さえよ。敵の先手が来ても、法螺貝が鳴るまで動くでない', 5);
    rt.say('大沢勘兵衛', '合図があれば、横合いから先手を突き崩せ。よいな', 4);
    // 号令の手ほどきは下の札に。字幕は戦の中の声だけにする（鼓舞と地図は、台詞の後に短い知らせで）
    rt.after(26, () => rt.bark(isTouch ? '「鼓舞」で組の士気を上げる。左上の「地図」で戦術地図' : `${K('rally')} で鼓舞（組の士気を上げる）。${K('map')} で戦術地図`));
    rt.flags.point = POINT2;
    // 大沢の手（足軽大将の手らしく二十人ほど。見た目だけ）
    nagashinojo.kit.farHost(rt, 32, 80, 10, 5, 20, Math.PI, nagashinojo.kit.ARMOR.oda, 'oda', 29, 'spear');
    // 攻め口を選ぶ（大沢の台詞が済んでから。選ばなければ近い方）
    rt.after(15, () => rt.choose('大沢「どこから攻めるか、その方に任せる」', [
      { label: '前備の横に並び、正面から当たる', note: '味方の近くで戦える。横腹は突きにくい' },
      { label: '林の端から、敵の先手の横腹を突く', note: '指示地点は遠いが、側面攻撃を狙える' },
    ], (j) => {
      const i = 1 - j;   // 下の決め事は「0 = 林の端、1 = 前備の横」のまま
      // もう林の端を押さえ終えていれば、持ち場は変えない（済んだ任務を「まだ」に戻さない）
      if (i === 1 && rt.flags.pointDone) { rt.say('大沢勘兵衛', 'もう林の端を押さえたか。ならば、そのまま待て', 3); rt.G.rel.osawa.trust += 1; return; }
      if (i === 1) {
        rt.flags.point = { x: 26, z: 12 };
        rt.marker('point', rt.flags.point, '指示地点（前備の横）');
        rt.zone('point', rt.flags.point.x, rt.flags.point.z, 10);
        rt.obj('point', '部下を連れて前備の横を押さえる', 'main');
        rt.say('大沢勘兵衛', '手堅いのう。よかろう、前備の横で待て', 3);
      } else rt.say('大沢勘兵衛', 'よし、林の端じゃ。横腹を突け', 3);
      rt.G.rel.osawa.trust += i === 0 ? 3 : 1;
    }, 30));
    // 号令の手ほどき
    rt.tutStart('号令の手ほどき', [['cmd_follow', `ついて来い（${K('follow')}）`], ['cmd_hold', `待て（${K('hold')}）`], ['cmd_retreat', `退け（${K('retreat')}）`], ['radial', '号令の輪（Tab 長押し）']]);
    // 大軍：北に斎藤の本隊（隊ごとに並ぶ。崩れたら北へ退いていく）、南に織田の本隊
    const F = rt.flags;
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const KS = ['spear', 'gun', 'mixed', 'spear', 'cavalry', 'spear', 'gun', 'honjin', 'spear'];
    F.farS = [[-112, -116], [-70, -128], [-24, -134], [22, -130], [68, -120], [-90, -98], [50, -104], [-2, -154], [-50, -148]]
      .map(([x, z], i) => DA(x, z, 26, KS[i] === 'gun' ? 6 : (KS[i] === 'honjin' ? 22 : 12), KS[i] === 'cavalry' ? 100 : 150, 0, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 5 + i, KS[i]));
    const KO = ['spear', 'gun', 'cavalry', 'spear', 'mixed'];
    F.farO = [[-96, 120], [-50, 130], [0, 136], [-20, 104], [-110, 88]]
      .map(([x, z], i) => DA(x, z, 22, KO[i] === 'gun' ? 6 : 12, KO[i] === 'cavalry' ? 90 : 120, Math.PI, KT.ARMOR.oda, i === 2 ? 'eiraku' : 'oda', 20 + i, KO[i]));
    // 信長の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    KT.honjin(rt, 0, 162, { mon: 'oda', w: 16, d: 10, armor: KT.ARMOR.oda });
    rt.scene.add(nobori(W, -12, 156, 'eiraku', 6));
    // 遠景の村（西の在所）
    KT.farVillage(rt, -126, -30, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 4 });
    // 西の端では、合図とともに両軍の隊がぶつかり合う（見た目だけ）
    F.clash = [DA(-84, 40, 14, 8, 70, Math.PI, KT.ARMOR.oda, 'oda', 31, 'spear'), DA(-84, -60, 14, 8, 70, 0, 0x35382c, 'saito', 32, 'spear')];
    // 名のある備の後ろに、同じ旗の控え（斎藤の日比野・長井の備と、織田の本備）
    // 控えは戦う場所（北の畦 z -70 から織田の陣 z 28 の間）へは入らず、その手前で止まって待つ（戦う兵が軽い兵の中に埋もれないように）
    const beyond = (g, z, north) => () => { const c = g.center(); return north ? c.z > z : c.z < z; };
    KT.backOf(rt, F.M, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 16, depth: 10, count: 110, seed: 33, stop: beyond(F.M, -72, true) });
    KT.backOf(rt, F.N, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 34, stop: beyond(F.N, -76, true) });
    KT.backOf(rt, F.B, { flag: 'oda', armor: KT.ARMOR.oda, kind: 'spear', w: 18, depth: 10, count: 110, seed: 35, stop: beyond(F.B, 30, false) });
    KT.backOf(rt, F.V, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 70, seed: 36, stop: beyond(F.V, -86, true) });
    rt.after(18, () => {
      const V = rt.flags.V;
      V.order = 'move'; V.dest = { x: 14, z: -4 };
      V.onArrive = (g) => { rt.flags.vArrived = rt.t; g.order = 'attack'; g.seekRange = 18; g.anchor = { x: 14, z: -4 }; };
      rt.say('足軽', '敵の先手が出てきたぞ！', 3);
    });
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    this.moveFar(rt, dt);
    // 指示地点の確保（合図が鳴った後は、落とした任務の進み具合を動かさない）
    if (!F.pointDone && !F.signal) {
      const alive = rt.squad.filter((s) => s.alive);
      const near = alive.filter((s) => Math.hypot(s.pos.x - (F.point || POINT2).x, s.pos.z - (F.point || POINT2).z) < 14).length;
      const pt = F.point || POINT2;
      const pd = Math.hypot(p.x - pt.x, p.z - pt.z);
      if (pd < 10 && near >= Math.ceil(alive.length * 0.6)) F.holdT = (F.holdT || 0) + dt;
      rt.objProgress('point', F.holdT ? `確保 ${Math.min(20, Math.floor(F.holdT))}/20秒` : pd < 10 ? `組 ${near}/${alive.length} 着いた` : `指示地点まで ${Math.max(10, Math.round(pd / 5) * 5)}m`);
      // 着かないまま長い時は、大沢が行き方を言う（一度だけ）
      if (!F.pointNudge && rt.t > 70 && pd >= 10) { F.pointNudge = true; rt.say('大沢勘兵衛', `${nm(rt)}、持ち場はあちらじゃ。組を連れて旗の印の所へ行き、輪の中で待て`, 4); }
      if ((F.holdT || 0) >= 20) {
        F.pointDone = true;
        rt.objDone('point'); rt.objProgress('point', ''); rt.unmark('point'); rt.unzone('point');
        rt.award((t) => { t.c.point = 1; }, '指示地点の確保');
        rt.say('伝令', '大沢様より「よし、そのまま待て」とのこと！', 3);
      }
    }
    // 合図を待つ間：敵の先手が畦を渡って来る残りの遠さと、合図までの見通し
    if (F.pointDone && !F.signal) {
      const vc = F.V.center(), pt = F.point || POINT2;
      rt.objProgress('wait', F.vArrived ? `まもなく合図（あと ${Math.max(0, Math.ceil(12 - (rt.t - F.vArrived)))}秒）` : `敵の先手まで ${Math.round(Math.hypot(vc.x - pt.x, vc.z - pt.z))}m`);
    }
    // 合図
    if (!F.signal && ((F.pointDone && F.vArrived && rt.t - F.vArrived > 12) || rt.t > 175)) {
      F.signal = rt.t;
      sfx('horagai', 1);
      rt.banner('法螺貝の合図');
      rt.say('大沢勘兵衛', '今ぞ！　横合いから先手を突き崩せ！', 3.5);
      rt.objDone('wait'); rt.objRemove('wait');
      rt.tutEnd();
      if (!F.pointDone) { rt.objFail('point'); rt.objProgress('point', ''); rt.unmark('point'); rt.unzone('point'); }
      rt.obj('break', '敵の先手を崩せ', 'main');
      rt.marker('V', centerOf(F.V), () => `敵の先手・${moraleWord(F.V.morale)}`, { red: true, group: F.V });
      F.M.order = 'move'; F.M.dest = { x: -12, z: -14 }; F.M.speed = 2.2;
      F.M.onArrive = (g) => { g.order = 'attack'; g.seekRange = 30; rt.army.play('eshout', g.center(), 2); };
      F.B.order = 'attack'; F.B.seekRange = 40; F.B.anchor = { x: -12, z: -8 };
      F.A.order = 'attack'; F.A.seekRange = 30;
      F.N.order = 'move'; F.N.dest = { x: -44, z: -24 }; F.N.speed = 2.2;
      F.N.onArrive = (g) => { g.order = 'attack'; g.seekRange = 30; };
      F.Y.order = 'attack'; F.Y.seekRange = 40; F.Y.anchor = { x: -44, z: -18 };
      rt.obj('nagai', '横備えと共に、長井の備を横から突け', 'side');
    }
    if (F.signal && !F.nagaiDone && F.N && (F.N.routed || F.N.count === 0)) { F.nagaiDone = true; rt.objDone('nagai'); }
    // 合図から 40 秒たっても先手を一度も突けていない時（深手で下がっていた等）も、前備に押されて先手は崩れうる（任務が止まらないように）
    if (F.signal && !F.vBroken && F.V.noRout && rt.t - F.signal > 40) { F.V.noRout = false; F.V.morale = Math.min(F.V.morale, 45); }
    // 合図の後、近くに討つ敵のいなくなった味方の備は、持ち場で構えて待つ（「かかれ」のまま立ち尽くさない）。敵が寄れば、またかかる
    if (F.signal) {
      F.calmT = (F.calmT || 0) - dt;
      if (F.calmT <= 0) {
        F.calmT = 1;
        for (const g of [F.A, F.B, F.Y]) {
          if (!g || !g.count || g.routed || (g.order !== 'attack' && !g.calm)) continue;
          const foe = rt.army.nearestEnemy({ pos: g.center(), team: g.team }, (g.seekRange || 30) + 6);
          if (g.order === 'attack' && !foe) { g.calm = true; g.order = 'hold'; }
          else if (g.calm && foe && g.order === 'hold') { g.calm = false; g.order = 'attack'; }
        }
      }
    }
    // 深追いの監視
    if (F.vBroken) {
      if (p.z < LINE2) {
        F.pursT = (F.pursT || 0) + dt;
        if (F.pursT > 2.5 && (F.pursCd || 0) <= 0 && (F.pursN || 0) < 2) {
          F.pursN = (F.pursN || 0) + 1;
          F.pursCd = 15;
          rt.award((t) => t.pursuits++, '勝手な追撃');
          rt.say('大沢勘兵衛', '深追いするなと申したであろう！戻れ！', 3);
        }
      } else F.pursT = 0;
      F.pursCd = (F.pursCd || 0) - dt;
    }
    // 新手
    if (F.Rz && !F.rzDone && (F.Rz.routed || F.Rz.count === 0)) {
      F.rzDone = true;
      rt.objDone('rz'); rt.unmark('rz');
      rt.award((t) => t.side.push('新手を食い止めた'), '副任務：新手を食い止めた');
      rt.say('大沢勘兵衛', 'よう持ちこたえた！', 3);
    }
    // 勝敗
    if (F.signal && !F.ending) {
      const mDone = F.vBroken && (F.M.routed || F.M.count === 0) && F.Rz && (F.rzDone || rt.t - F.rzT > 150);
      if (mDone || rt.t - F.signal > 330) {
        if (F.Rz && !F.rzDone) { rt.objFail('rz'); rt.unmark('rz'); }
        F.ending = true;
        if (!F.vBroken) { rt.tracker.main = false; rt.objFail('break'); }
        rt.banner('斎藤勢、退いていく');
        rt.say('大沢勘兵衛', '勝ち戦じゃ！　皆、ようやった', 3.5);
        sfx('horagai', 0.7);
        rt.finish({}, 10);
      }
    }
  },

  // 遠くの両軍（見た目だけ）：合図で織田が押し出し、西の端で駆け寄ってぶつかる。日比野が崩れたら斎藤は崩れ、北へ退く
  moveFar(rt, dt) {
    const F = rt.flags;
    nagashinojo.kit.backTick(rt);
    if (!F.signal) return;
    if (!F.farGo) {
      F.farGo = true;
      F.farO.forEach((m, i) => rt.after(i * 1.2, () => m.advance(30, 14)));
      for (const m of F.clash) m.advance(44, 14, { charge: true });
    }
    if (F.sBack && !F.farBack) {
      F.farBack = true;
      F.clash[1].rout({ hideAfter: 40 });
      // 前の備は崩れて散り、後ろの備と本陣は背を向けて退く
      F.farS.forEach((m, i) => rt.after(1 + i * 1.3, () => (m.army.cz > -125 || i % 3 === 0 ? m.rout({ hideAfter: 50 }) : m.retreat(50, 30))));
    }
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.M || g === F.N) {
      F.sBack = true;
      if (g === F.M && F.N.count > 0) F.N.morale -= 40;
    }
    if (g === F.V && !F.vBroken) {
      F.vBroken = true;
      rt.unmark('V');
      rt.objDone('break');
      rt.banner('敵の先手、崩れたり');
      rt.award((t) => { t.special = { label: '敵先手崩し', pts: 25 }; t.main = true; }, '敵先手崩し・任務達成');
      F.M.morale = Math.min(F.M.morale, 85) - 10;
      F.M.noRout = false;
      F.B.noRout = false;
      // 東から新手（組で受け止める場面）
      rt.after(22, () => {
        const Rz = enemyGroup(rt, { faction: 'saito', anchor: { x: 95, z: -70 }, facing: -2.3, order: 'attack', seekRange: 90, fleeDir: { x: 1, z: -0.6 }, morale: 95 },
          // 組が五人の見習いの時は、新手も小勢に（組で受け止められる数）
          (rt.squad.length < 10 ? [{ type: 'samurai', n: 1 }, { type: 'cavalry', n: 1 }, { type: 'ashigaru', n: 7 }] : [{ type: 'samurai', n: 1 }, { type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 10 }]));
        Rz.anchor = { x: (F.point || POINT2).x, z: (F.point || POINT2).z + 8 };
        // 見習いの組が受け止める新手は、長駆してきて息が上がっている（打ち込みを少し弱く）
        if (rt.squad.length < 10) for (const u of Rz.units) u.dmg *= u.type === 'cavalry' ? 0.6 : 0.8;
        F.Rz = Rz;
        F.rzT = rt.t;
        rt.banner('新手', '東の林から');
        rt.say('大沢勘兵衛', `東から新手じゃ！　${nm(rt)}、組をまとめて食い止めよ！`, 4);
        nagashinojo.kit.backOf(rt, Rz, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 12, depth: 8, count: 70, seed: 37, stop: () => { const c = Rz.center(); return c.x < 80; } });
        rt.bark('「待て」で踏みとどまるか、「退け」で下がって味方と合うか。組頭が決める');
        rt.obj('rz', '東からの新手を食い止める', 'side');
        rt.marker('rz', centerOf(Rz), () => `新手・${moraleWord(Rz.morale)}`, { red: true, group: Rz });
      });
      rt.say('大沢勘兵衛', '見事じゃ！　だが深追いはするな。北の畦より先へは出るでない', 4);
      rt.obj('purs', '深追いするな（北の畦を越えない）', 'order');
    }
    if (g === F.M) rt.say('足軽', '日比野の備えが崩れたぞ！', 2.5);
    // 崩れた後、名のある将の討死が伝わる（史実では日比野下野守・長井甲斐守ともにこの戦で討たれた）
    if ((g === F.M || g === F.N) && !g.deathSaid) {
      g.deathSaid = true;
      const b = g.units.find((u) => u.type === 'busho');
      rt.after(g === F.M ? 7 : 9, () => {
        if (b && b.alive && rt.distTo(b.pos) > 35) rt.army.kill(b, null);
        rt.say('伝令', g === F.M ? '日比野下野守、討ち取られたり！' : '長井甲斐守も討たれたとのこと！', 3);
      });
    }
  },

  onKill(rt, v, k) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (rt.flags.signal && v.group === rt.flags.V && k && (k.isPlayer || k.isSub)) rt.flags.V.noRout = false;
  },
  onPlayerHit(rt, t) {
    if (rt.flags.signal && t.group === rt.flags.V) rt.flags.V.noRout = false;
    // こちらを狙って斬りかかってきた相手を受け返しただけなら咎めない
    if (!rt.flags.signal && !rt.flags.early && t.team === 1 && t.target !== rt.player.u) {
      rt.flags.early = true;
      rt.violation('合図の前に仕掛けた', ['大沢勘兵衛', '待てと申したはずじゃ！']);
    }
  },
  onSquadCommand(rt, id) {
    if (!rt.flags.signal && !rt.flags.early && (id === 'attack' || id === 'focus')) {
      rt.flags.early = true;
      rt.violation('合図の前に突撃を命じた', ['大沢勘兵衛', '待てと申したはずじゃ！']);
    }
  },
};

// ======================================================================
// 第3戦　墨俣
// ======================================================================
const FORT = 18;
const ROAD3 = [[-176, 120], [-90, 86], [-36, 44], [0, 24]];
const ROAD3N = [[0, -176], [0, -24]];

function buildFort(rt) {
  const W = rt.world;
  const segs = [];
  const add = (ax, az, bx, bz, side, nx, nz) => {
    const s = rt.army.addStruct({ seg: [ax, az, bx, bz], side, nx, nz, hp: 240, maxHp: 240, team: 0, name: '柵' });
    s.mesh = palisade(W, s.seg);
    rt.scene.add(s.mesh);
    segs.push(s);
  };
  const st = (FORT * 2) / 8;
  for (let i = 0; i < 8; i++) {
    const a = -FORT + i * st, b = a + st;
    add(a, -FORT, b, -FORT, 'n', 0, -1);
    add(-FORT, a, -FORT, b, 'w', -1, 0);
    add(FORT, a, FORT, b, 'e', 1, 0);
  }
  for (const [a, b] of [[-18, -13], [-13, -8], [-8, -3], [3, 8], [8, 13], [13, 18]]) add(a, FORT, b, FORT, 's', 0, 1);
  return segs;
}

// 馬防柵：南北に長い柵を三重に。列の間は数メートル、ところどころに虎口（出入りの口）を空ける
// x0 が一列目（敵に近い側）、facing が敵の方向（+1 = x の正の向き）
export function buildBobosaku(rt, o) {
  const { x0, z0, z1, rows = 3, gap = 7, segLen = 6, gates = [], facing = 1, hp = 520 } = o;
  const W = rt.world, out = [];
  for (let r = 0; r < rows; r++) {
    const x = x0 - facing * r * gap;
    const off = (r % 2) * segLen * 0.5;   // 列ごとに口の位置をずらす
    for (let z = z0 + off; z < z1 - 0.5; z += segLen) {
      const a = z, b = Math.min(z1, z + segLen);
      const mid = (a + b) / 2;
      // 虎口：口の位置（列ごとに半区画ずらす）を含む区画は結わない
      if (gates.some((g) => { const gz = g + (r % 2) * segLen * 0.5; return gz >= a && gz < b; })) continue;
      const bend = Math.sin(mid * 0.05 + r) * 0.8;   // まっすぐすぎない
      const s = rt.army.addStruct({ seg: [x + bend, a, x + bend, b - 0.9], side: 'baboo', nx: facing, nz: 0, hp, maxHp: hp, team: 0, name: '馬防柵', row: r });
      s.mesh = bobosaku(W, s.seg);
      rt.scene.add(s.mesh);
      out.push(s);
    }
  }
  return out;
}

// 波の合間に人足が柵を直す
function repairFort(rt) {
  let n = 0;
  for (const s of rt.flags.segs) {
    if (s.alive) continue;
    s.alive = true; s.hp = s.maxHp; s.mesh.visible = true;
    if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
    n++;
  }
  if (n) rt.say('木下藤吉郎', `今のうちじゃ、破れた柵を直せ！　……よし、${n}か所塞いだぞ`, 4);
  // 普請小屋も、人足が板を打ち直す（襲来ごとの傷が積もって、三の手の前に尽きないように）
  const h = rt.flags.hut;
  if (h && h.alive && h.hp < h.maxHp * 0.95) {
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.4);
    rt.say('人足', '小屋の板も打ち直しましたぞ', 2.5);
  }
}

function assaultFn(rt, side) {
  return (u) => {
    const F = rt.flags;
    const inside = Math.abs(u.pos.x) < FORT - 0.4 && Math.abs(u.pos.z) < FORT - 0.4;
    if (inside) {
      if (!F.hut.alive) return null;
      // 小屋を一度に打てるのは6人まで。あぶれた者は小屋のまわりで守り手と斬り合う（一息に焼け落ちないように）
      const hit = F.hutHit = (F.hutHit || []).filter((q) => q.alive && q.group && !q.group.routed);
      if (hit.includes(u)) return F.hut;
      if (hit.length < 6) { hit.push(u); return F.hut; }
      const foe = rt.army.nearestEnemy(u, 16);
      if (foe) return { x: foe.pos.x, z: foe.pos.z };
      const a = u.id * 2.4;
      return { x: F.hut.x + Math.sin(a) * 7.5, z: F.hut.z + Math.cos(a) * 7.5 };
    }
    // 破れ目があればそこから入る
    let gap = null, gd = 50;
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < gd) { gd = d; gap = s; }
    }
    if (gap) {
      const mx = (gap.seg[0] + gap.seg[2]) / 2, mz = (gap.seg[1] + gap.seg[3]) / 2;
      const out = (u.pos.x - mx) * gap.nx + (u.pos.z - mz) * gap.nz;
      const lat = Math.abs((u.pos.x - mx) * gap.nz - (u.pos.z - mz) * gap.nx);
      if (out < 3 && lat < 2) return { x: mx - gap.nx * 5, z: mz - gap.nz * 5 };
      return { x: mx + gap.nx * 2.5, z: mz + gap.nz * 2.5 };
    }
    if (!u.segTarget || !u.segTarget.alive) {
      const cands = F.segs.filter((s) => s.alive && s.side === side);
      if (!cands.length) return F.hut;
      let best = null, bd = Infinity;
      for (const s of cands) {
        const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
        const d = Math.hypot(u.pos.x - mx, u.pos.z - mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      u.segTarget = best;
    }
    return u.segTarget;
  };
}

const sunomata = {
  spawn: { x: 0, z: 6, heading: Math.PI },
  world: {
    seed: 33,
    muddy: 0.45,     // 川辺の砦は湿っている
    paths: [ROAD3, ROAD3N],
    water: { x: 62, x2: 112, level: -0.7 },   // 長良川：向こう岸は 112 から
    time: 'day',
    autumn: true,
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.08 + x * 0.02);
      h += 9 * gauss(x, z, -140, -140, 3000) + 7 * gauss(x, z, -150, 60, 2600);
      if (x > 48) h -= Math.min(2.6, (x - 48) * 0.22);
      // 向こう岸：川を渡れば再び陸
      if (x > 106) h += Math.min(3.6, (x - 106) * 0.35);
      if (Math.abs(x) < FORT + 2 && Math.abs(z) < FORT + 2) h = h * 0.2 + 0.3;
      return h;
    },
    tint(x, z, h, c) {
      if (x > 50 && x < 118) c.setRGB(0.42, 0.38, 0.28);
      if (Math.abs(x) < FORT && Math.abs(z) < FORT) c.setRGB(0.4, 0.34, 0.24);
    },
    clear: (x, z) => (Math.abs(x) < 70 && Math.abs(z) < 70) || x > 45 || Math.hypot(x + 100, z - 150) < 34,
    trees: 260,
    tufts: 3500,
    groves: [{ x: -95, z: -30, r: 14, n: 20 }, { x: -60, z: 100, r: 12, n: 14 }, { x: 30, z: -110, r: 14, n: 18 }],
  },
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.segs = buildFort(rt);
    // 南の冠木門と、兵糧の俵
    rt.scene.add(kabukimon(W, 0, FORT, 6.4));
    rt.scene.add(tawara(W, 9, -11, 0.4, 6), tawara(W, -10, 7, -0.3, 5), tawara(W, 6, 8, 1.2, 3));
    F.hut = rt.army.addStruct({ x: 0, z: -4, r: 3.8, solidR: 4.0, hp: 1500, maxHp: 1500, armor: 0.4, team: 0, name: '普請小屋' });
    F.hut.mesh = hut(W, 0, -4, 7, 4.5, 0);
    rt.scene.add(F.hut.mesh);
    rt.scene.add(yagura(W, -13, -13));
    rt.scene.add(lumber(W, 9, -10, 0.2));
    rt.scene.add(lumber(W, 10, 4, -0.1));
    rt.scene.add(lumber(W, -9, 7, 1.4));
    rt.scene.add(scaffold(W, -6, -4, 0.3));
    // 普請の途中：北東の隅は櫓の足場だけ、縄を張った杭で次に結う柵の線を示す
    F.scaf = scaffold(W, 13, -13, 0.1);
    rt.scene.add(F.scaf);
    rt.scene.add(umatsunagi(W, -4, -14.5, 0, 9), umatsunagi(W, 14.5, 4, Math.PI / 2, 8));
    // 大軍：川向こうの岸に斎藤の本隊が隊ごとに並ぶ。北と西の丘にも斎藤の備え（襲来はそこから来る）
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 岸の前に鉄砲と槍、後ろに騎馬の備と斎藤の本陣
    const KS = ['gun', 'spear', 'gun', 'spear', 'mixed', 'cavalry', 'honjin', 'cavalry', 'spear'];
    [[128, -118], [126, -62], [130, -8], [128, 50], [134, 110], [156, -88], [160, -30], [156, 34], [160, 92]]
      .forEach(([x, z], i) => DA(x, z, KS[i] === 'gun' ? 28 : (KS[i] === 'honjin' ? 30 : 16), KS[i] === 'gun' ? 6 : (KS[i] === 'honjin' ? 24 : 28), KS[i] === 'cavalry' ? 100 : 150, -Math.PI / 2, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 7 + i, KS[i]));
    for (const [x, z] of [[132, -90], [134, 20], [136, 80], [150, -40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    DA(-30, -150, 60, 12, 200, 0.1, 0x35382c, 'saito', 17, 'mixed');
    DA(-120, -106, 24, 30, 160, 0.8, 0x3a3a30, 'saito', 18, 'spear');
    DA(-150, -12, 12, 40, 140, Math.PI / 2, 0x35382c, 'saito', 19, 'spear');
    // 味方：南に控える織田の備え
    DA(-64, 112, 34, 14, 170, Math.PI, KT.ARMOR.oda, 'oda', 21, 'spear');
    DA(34, 104, 28, 6, 130, Math.PI, KT.ARMOR.oda, 'oda', 22, 'gun');
    DA(-128, 90, 20, 14, 110, 2.0, KT.ARMOR.oda, 'oda', 23, 'cavalry');
    // 遠景の村（南西の在所。秋の柿）
    KT.farVillage(rt, -100, 150, { rot: Math.PI, n: 6, fields: 8, seed: 5, autumn: true });
    // 九月の刈田：畦に稲架を立て、刈った稲を干す
    for (const [x, z, r] of [[-70, 128, 0.1], [-52, 140, 0.05], [-88, 122, -0.1], [-30, 132, 0.2]]) rt.scene.add(hasa(W, x, z, r, 9));
    for (const [x, z] of [[-64, 100], [34, 94]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    // 砦の南：これから運び込む材木
    rt.scene.add(lumber(W, -14, 34, 0.5), lumber(W, 12, 44, -0.3), lumber(W, -36, 34, 1.2));
    // 襲来のたびに、川向こうの隊が岸まで押し出してくる（見た目だけ）
    F.far = [[150, -60], [150, 60], [150, -120], [150, 0], [150, 120], [150, -30]].map(([x, z], i) => ({ m: DA(x, z, 10, 8, 60, -Math.PI / 2, 0x35382c, 'saito', 40 + i, i % 2 ? 'gun' : 'spear'), v: 0 }));
    for (const [x, z] of [[-15, 15], [15, 15], [0, -15]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    // 篝火（夕暮れに灯る）
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) W.addFire(x, z, { torch: true, h: 1.5 });
    // 城の見栄え（A4）：篝火の火の下に鉄の籠の台、砦の外（北と西の寄せ口の間）に逆茂木、川の岸に竹束
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) rt.scene.add(kagaribi(W, x, z - 0.02));
    for (const [x, z, r] of [[-12, -25, Math.PI], [12, -25, Math.PI], [-25, -10, -Math.PI / 2], [-25, 10, -Math.PI / 2]]) rt.scene.add(sakamogi(W, x, z, r, 6));
    for (const [x, z] of [[40, -30], [42, -26], [40, 26], [42, 30]]) rt.scene.add(takataba(W, x, z, Math.PI / 2));
    F.perfect = true;

    const n = RANKS[rt.G.rank].squad || 15;
    // 組の小さい見習い（五人）の時は、寄せ手を少なめに。同時に本人へ打ちかかる敵は二人まで
    F.few = !rt.G.lord && n < 10;
    if (!rt.G.lord && (rt.G.rank || 0) <= 2) rt.army.maxAttackers = Math.min(rt.army.maxAttackers || 3, 2);
    const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
    rt.makeSquad({ x: 0, z: 10 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    const tk = allyGroup(rt, { name: '藤吉郎', anchor: { x: 4, z: -9 }, facing: Math.PI, noRout: true }, [{ type: 'samurai', n: 1, o: { name: '木下藤吉郎', invuln: true, hat: 'jingasa_n' } }]);
    F.tokichiro = tk.units[0];
    const wk = allyGroup(rt, { name: '人足', anchor: { x: -6, z: -10 }, facing: 0, noRout: true, width: 4, aggro: 0 }, [{ type: 'porter', n: 10, o: { invuln: true } }]);
    F.wk = wk;
    F.ally = allyGroup(rt, { name: '別組', anchor: { x: -14, z: 2 }, facing: -Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: F.few ? 13 : 10 }]);
    // 川並衆：東の柵（川の側）を受け持つ
    F.ally2 = allyGroup(rt, { name: '川並衆', anchor: { x: 13, z: 2 }, facing: Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '蜂須賀小六', hat: 'jingasa_n' } }, { type: 'ashigaru', n: F.few ? 12 : 9 }]);
    F.koroku = F.ally2.units[0];

    rt.setPhase('brief');
    rt.obj('defend', '砦を守りきる（襲来 0/3）', 'main');
    rt.obj('perfect', '柵を一本も破らせない', 'side');
    rt.say('木下藤吉郎', `おお、お主が噂の${nm(rt)}か！　わしが木下藤吉郎じゃ。この砦の普請を任されておる`, 5);
    rt.say('木下藤吉郎', '斎藤の者ども、必ず邪魔しに来おる。柵が建つまで、なんとしても守り抜け', 4.5);
    rt.say('木下藤吉郎', '柵を破られれば小屋を焼かれる。東の川の側は、川並衆の蜂須賀小六が受け持つ。……頼りにしておるぞ', 4);
    // 操作の案内は字幕に積まず、短い知らせで（弓の人数も書く）
    rt.after(2, () => rt.bark(bows ? `弓 ${bows}人が組に加わった（号令の相手を「弓隊」に替えられる）` : '組は槍だけ。柵の内から突け'));
    rt.after(20, () => rt.bark('柵の内から槍で突ける。南の門から打って出て、横腹を突くこともできる'));
    rt.after(34, () => this.wave1(rt));
    // 藤吉郎の策（名乗りの台詞が終わってから）
    rt.after(14, () => rt.choose('藤吉郎「材木が少し余った。どう使うかの？」', [
      { label: '柵を補強する', note: '柵の強さが4割増す（人足が北の柵を二重に結う）' },
      { label: '弓組を増やす', note: '弓兵が二人、組に加わる' },
    ], (i) => {
      if (i === 0) { for (const sg of F.segs) { sg.maxHp *= 1.4; sg.hp *= 1.4; } rt.say('木下藤吉郎', '心得た、柵を二重に結わせよう', 3); this.doubleFence(rt); }
      else {
        const bg = rt.squadGroups.find((g) => g.kind === 'bow');
        if (bg) {
          for (let k = 0; k < 2; k++) {
            const c = bg.center();
            const u = rt.army.addUnit(bg, { type: 'bow', x: c.x + k, z: c.z + 1, flag: rt.G.aijirushi || 'ichimonji' });
            u.isSub = true; u.hp = u.maxHp = u.maxHp * 1.15; u.kills = 0; u.name = ['市助', '仁吉'][k];
            rt.squad.push(u);
          }
          rt.tracker.subsInit = rt.squad.length;
        }
        rt.say('木下藤吉郎', 'わしの手の者から弓の上手を二人貸そう', 3);
      }
      rt.G.rel.tokichiro.like += 3;
    }));
    // 普請小屋で手当てを受けられる（襲来の合間の立て直し）
    F.healCd = 0;
    rt.addInteract('heal', { x: 0, z: 0.5 }, '手当てを受ける（体力6割回復・45秒に一度）', () => {
      if (F.healCd > rt.t) { rt.hud.flash(`手当てはあと${Math.ceil(F.healCd - rt.t)}秒`, 'dim'); return; }
      const u = rt.player.u;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.6);
      F.healCd = rt.t + 45;
      rt.say('人足', '傷を縛りまする。ご無理なさいますな', 2.5);
      sfx('ui');
    }, { r: 4 });
    rt.after(50, () => rt.bark(isTouch ? '深手を負ったら、普請小屋で手当てを受けられる（「取る」）' : `深手を負ったら、普請小屋で手当てを受けられる（${K('use')}）`));
    rt.tutStart('組頭の手ほどき', [['radial', '号令の輪（Tab 長押し）'], ['cmd_yari', '槍衾（輪か Tab → 7）'], ['cmd_fire', '弓の射撃の切替（Tab → 8）'], ['group', '号令先の切替（Tab → G）']]);
    rt.flags.nextWaveAt = 34;
  },

  wave1(rt) {
    const F = rt.flags;
    F.wave = 1;
    rt.setPhase('w1');
    F.W1 = enemyGroup(rt, { faction: 'saito', anchor: { x: 2, z: -118 }, facing: 0, order: 'assault', fleeDir: { x: 0, z: -1 }, width: 7 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: F.few ? 16 : 20 }]);
    nagashinojo.kit.backOf(rt, F.W1, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 44, stop: () => { const c = F.W1.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W1.assault = assaultFn(rt, 'n');
    rt.banner('斎藤勢、来襲', '北より');
    rt.army.play('eshout', { x: 0, z: -60 }, 2);
    rt.say('木下藤吉郎', '来おったぞ！　北じゃ、柵に取り付かせるな！', 3.5);
    rt.marker('w', centerOf(F.W1), () => `敵勢・${moraleWord(F.W1.morale)}`, { red: true, group: F.W1 });
    rt.objProgress('defend', '');
    rt.obj('defend', '砦を守りきる（襲来 1/3）', 'main');
  },

  wave2(rt) {
    const F = rt.flags;
    F.wave = 2; F.waveT = 0;
    rt.setPhase('w2');
    // 波ごとに日が傾く：二の手は昼下がり、三の手で夕焼け
    rt.world.setTime('after');
    F.W2 = enemyGroup(rt, { faction: 'saito', anchor: { x: -122, z: 2 }, facing: Math.PI / 2, order: 'assault', fleeDir: { x: -1, z: 0 }, width: 8 }, [{ type: 'samurai', n: F.few ? 2 : 3 }, { type: 'ashigaru', n: F.few ? 16 : 20 }, { type: 'gun', n: 3 }]);
    nagashinojo.kit.backOf(rt, F.W2, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 14, depth: 8, count: 80, seed: 45, stop: () => { const c = F.W2.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W2.assault = assaultFn(rt, 'w');
    rt.banner('二の手', '西より');
    rt.say('木下藤吉郎', '西からも来たぞ！　……いかん、南西から荷駄が着く頃じゃ！', 4);
    rt.marker('w', centerOf(F.W2), () => `敵勢・${moraleWord(F.W2.morale)}`, { red: true, group: F.W2 });
    rt.obj('defend', '砦を守りきる（襲来 2/3）', 'main');
    // 荷駄
    const ND = allyGroup(rt, { name: '荷駄', anchor: { x: -112, z: 104 }, facing: 1.2, formation: 'column', order: 'path', speed: 2.3, noRout: true, aggro: 3 },
      [{ type: 'porter', n: 4 }, { type: 'ashigaru', n: 2 }]);
    ND.path = [[-112, 104], [-90, 86], [-36, 44], [0, 26], [0, 8]];
    ND.onArrive = (g) => { g.order = 'hold'; };
    F.K = ND;
    F.saved = 0;
    rt.obj('nida', '材木の荷駄を守る（2人以上を砦へ）', 'side');
    rt.marker('gate', { x: 0, z: FORT + 1 }, '南の門（打って出られる）', { h: 2.5 });
    rt.after(25, () => rt.unmark('gate'));
    rt.marker('nida', centerOf(ND), '荷駄');
    // 荷駄を狙う斎藤の組は、少し遅れて西の林から出る（砦から駆けつければ間に合う間をおく）
    rt.after(4, () => rt.say('木下藤吉郎', '南の門から打って出て、荷駄を迎えよ！　西の林に斎藤の者が潜んでおるやもしれん', 4));
    F.KE = null; F.KEwait = true;
    rt.after(18, () => {
      F.KEwait = false;
      if (F.nidaDone) return;
      const KE = enemyGroup(rt, { faction: 'saito', anchor: { x: -150, z: 28 }, facing: 1.0, order: 'attack', seekRange: 90, fleeDir: { x: -1, z: 0 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
      KE.focus = ND.units.find((u) => u.alive && u.type === 'porter') || null;
      F.KE = KE;
      rt.say('足軽', '西の林から斎藤の者が出たぞ！　荷駄を狙っておる！', 3);
      rt.marker('ke', centerOf(KE), '荷駄を狙う敵', { red: true, group: KE });
    });
  },

  wave3(rt) {
    const F = rt.flags;
    F.wave = 3; F.waveT = 0;
    rt.setPhase('w3');
    rt.world.setTime('dusk');
    F.W3a = enemyGroup(rt, { faction: 'saito', anchor: { x: -54, z: -122 }, facing: 0.45, order: 'assault', fleeDir: { x: -0.4, z: -1 }, width: 7 },
      [{ type: 'samurai', n: 1, o: { name: '斎藤方の旗持ち', flag: 'saito', flagScale: 1.8, tag: 'flag' } }, { type: 'samurai', n: F.few ? 1 : 2 }, { type: 'ashigaru', n: F.few ? 9 : 13 }]);
    nagashinojo.kit.backOf(rt, F.W3a, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 46, stop: () => { const c = F.W3a.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W3a.assault = assaultFn(rt, 'n');
    F.W3b = enemyGroup(rt, { faction: 'saito', anchor: F.few ? { x: -162, z: -66 } : { x: -150, z: -60 }, facing: 1.2, order: 'assault', fleeDir: { x: -1, z: -0.3 }, width: 7 },
      [{ type: 'busho', n: 1, o: { name: '斎藤方 侍大将 稲田弾正' } }, { type: 'samurai', n: F.few ? 1 : 2 }, { type: 'cavalry', n: F.few ? 2 : 3 }, { type: 'ashigaru', n: F.few ? 5 : 8 }, { type: 'bow', n: F.few ? 2 : 3 }]);
    nagashinojo.kit.backOf(rt, F.W3b, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 14, depth: 8, count: 80, seed: 47, stop: () => { const c = F.W3b.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W3b.assault = assaultFn(rt, 'w');
    // 川沿いの東から回り込む一隊（守りの手薄な側）。北と西の寄せと重ならないよう、少し遅れて来る
    // 長良川を舟で渡り、東の岸から上がって来る一隊（守りの手薄な側）
    rt.after(F.few ? 44 : 32, () => {
      rt.say('足軽', '川に舟が出たぞ！　斎藤の者が川を渡ってくる！', 3.5);
      this.boats(rt, () => {
        F.W3c = enemyGroup(rt, { faction: 'saito', anchor: { x: 54, z: -6 }, facing: -Math.PI / 2, order: 'assault', fleeDir: { x: 1, z: 0 }, width: 5 },
          [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: F.few ? 7 : 9 }]);
        F.W3c.assault = assaultFn(rt, 'e');
        rt.army.play('eshout', { x: 54, z: -6 }, 1.4);
        rt.say('足軽', '舟の者が岸に上がった！　東の柵じゃ！', 3);
        rt.marker('w3', centerOf(F.W3c), () => `敵勢（東）・${moraleWord(F.W3c.morale)}`, { red: true, group: F.W3c });
      });
    });
    F.flagbearer = F.W3a.units[0];
    // 伏兵：西の林から不意に
    rt.after(22, () => {
      F.W3d = enemyGroup(rt, { faction: 'saito', anchor: { x: -92, z: -26 }, facing: Math.PI / 2, order: 'assault', fleeDir: { x: -1, z: 0 }, width: 3 }, [{ type: 'ashigaru', n: F.few ? 3 : 5 }]);
      F.W3d.assault = assaultFn(rt, 'w');
      rt.banner('伏兵', '西の林から');
      rt.say('足軽', '伏兵だ！　西の林から出てきたぞ！', 3);
      rt.marker('w4', centerOf(F.W3d), () => `伏兵・${moraleWord(F.W3d.morale)}`, { red: true, group: F.W3d });
    });
    // 騎馬と侍大将の一撃は、柵の内の組頭を一度で崩さない強さに（駆け抜けて何度も当たるので）
    for (const u of F.W3b.units) if (u.type === 'cavalry' || u.type === 'busho') u.dmg *= 0.75;
    rt.banner('三の手', '夕暮れ、北西より大軍');
    rt.say('木下藤吉郎', 'これが最後の押しじゃ！　ここを凌げば砦は建つ！', 4);
    rt.marker('w', centerOf(F.W3a), () => `敵勢（北）・${moraleWord(F.W3a.morale)}`, { red: true, group: F.W3a });
    rt.marker('w2', centerOf(F.W3b), () => `敵勢（西）・${moraleWord(F.W3b.morale)}`, { red: true, group: F.W3b });
    rt.marker('flag', unitPos(F.flagbearer), '敵の旗', { red: true });
    rt.obj('defend', '砦を守りきる（襲来 3/3）', 'main');
    rt.obj('flag', '敵の旗を奪う', 'side');
  },

  // 材木で柵を補強：人足が材木を担いで北の柵へ運び、内側に一本ずつ二重の柵が組まれていく
  doubleFence(rt) {
    const F = rt.flags, W = rt.world;
    const wk = F.wk;
    if (wk) { wk.order = 'move'; wk.dest = { x: 0, z: -FORT + 3 }; wk.speed = 1.6; wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: -FORT + 3 }; }; }
    const st = (FORT * 2) / 8;
    for (let i = 0; i < 8; i++) {
      rt.after(6 + i * 1.6, () => {
        const a = -FORT + i * st;
        rt.scene.add(palisade(W, [a + 0.2, -FORT + 1.3, a + st - 0.2, -FORT + 1.3]));
        rt.army.play('knock', { x: a + st / 2, z: -FORT + 1.3 }, 0.8);
      });
    }
    rt.after(6 + 8 * 1.6 + 2, () => { if (wk) { wk.order = 'move'; wk.dest = { x: -6, z: -10 }; wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; }; } });
  },
  // 勝った時：足場だった隅に櫓が立ち、柵と櫓の並んだ砦を見せる
  fortDone(rt) {
    const F = rt.flags, W = rt.world;
    if (F.scaf) { rt.scene.remove(F.scaf); F.scaf = null; }
    rt.scene.add(yagura(W, 13, -13), yagura(W, 13, 13));
    for (const [x, z] of [[13, -9], [9, 13]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    rt.army.play('wood', { x: 13, z: -13 }, 1);
    if (!rt.player.lock) rt.player.cine = { x: 13, z: -13, t: 3 };
  },
  // 舟で長良川を渡って来る一隊：向こう岸から舟が漕ぎ寄せ、岸に着くと兵が上がる
  boats(rt, onLand) {
    const F = rt.flags, W = rt.world;
    const y = -0.7 + 0.05;
    F.boats = [[108, -20], [110, -6], [106, 8]].map(([x, z], i) => { const m = kobune(x, y, z, -Math.PI / 2 + (i - 1) * 0.08); rt.scene.add(m); return { m, x, z, x1: 58 + i * 0.8 }; });
    rt.marker('boats', () => ({ x: F.boats[1].m.position.x, z: F.boats[1].m.position.z }), '川を渡る舟', { red: true, h: 2.5 });
    F.boatT = 0; F.onLand = onLand;
  },
  moveBoats(rt, dt) {
    const F = rt.flags;
    if (!F.boats || F.landed) return;
    F.boatT += dt;
    const k = Math.min(1, F.boatT / 16);
    for (const b of F.boats) { b.m.position.x = b.x + (b.x1 - b.x) * k; b.m.rotation.z = Math.sin(F.boatT * 1.7 + b.z) * 0.03; }
    if (k >= 1) { F.landed = true; rt.unmark('boats'); F.onLand(); }
  },

  // 川向こうの押し出し：襲来ごとに二隊が岸まで出て、しばらく睨んでから戻る
  moveFar(rt, dt) {
    const F = rt.flags;
    if (F.wave && F.farWave !== F.wave) {
      F.farWave = F.wave;
      for (const q of F.far.slice((F.wave - 1) * 2, F.wave * 2)) { q.v = 1; q.t = 0; }
    }
    for (const q of F.far) {
      if (!q.v) continue;
      q.t += dt;
      if (q.v === 1 && !q.go) { q.go = true; q.m.advance(33, 8); }
      if (q.v === 1 && q.t > 34) { q.v = -1; q.m.retreat(33, 13); }
      if (q.v === -1 && q.t > 48) { q.v = 0; q.go = false; }
    }
    nagashinojo.kit.backTick(rt);
  },

  update(rt, dt) {
    const F = rt.flags;
    const gone = (g) => !g || g.count === 0 || g.routed;
    this.moveFar(rt, dt);
    this.moveBoats(rt, dt);
    // 深手のときだけ、手当ての場所を示す
    const low = rt.player.u.hp < rt.player.u.maxHp * 0.4 && !(F.healCd > rt.t);
    if (low && !F.healMarked) { F.healMarked = true; rt.marker('heal', { x: 0, z: 0.5 }, isTouch ? '手当て' : `手当て（${K('use')}）`, { h: 2.5 }); }
    if (!low && F.healMarked) { F.healMarked = false; rt.unmark('heal'); }
    // 普請小屋の具合と、次の襲来までの時間
    const hutPct = Math.round(F.hut.hp / F.hut.maxHp * 100);
    const wait = F.nextWaveAt ? Math.ceil(F.nextWaveAt - rt.t) : 0;
    rt.objProgress('defend', wait > 0 ? `次の襲来まで ${wait}秒 ・ 普請小屋 ${hutPct}%` : `普請小屋 ${hutPct}%`);
    // 小屋が打たれ始めたら早めに知らせ、印を立てる（気づいた時には手遅れ、にならないように）
    const hw = [85, 50, 25].find((q) => hutPct <= q && !(F.hutSaid || []).includes(q));
    if (hw) {
      F.hutSaid = [...(F.hutSaid || []), hw];
      // 小屋が傷むほど、屋根から上がる煙が太くなる（遠くからでも小屋の具合が分かる）
      if (hw <= 50) rt.world.addSmokeColumn(hw === 50 ? 1.5 : -1.5, rt.world.heightAt(0, -4) + 3.2, -4, { size: hw === 50 ? 1.4 : 2.4 });
      if (hw === 85) { rt.say('木下藤吉郎', '小屋に敵が取り付いた！　組を連れて戻れ、小屋を守れ！', 3.5); rt.marker('hut', { x: 0, z: -4 }, () => `普請小屋 ${Math.round(F.hut.hp / F.hut.maxHp * 100)}%`, { h: 5 }); rt.after(30, () => rt.unmark('hut')); }
      else rt.bark(`普請小屋が危ない！（残り ${hutPct}%）　中に入った敵を討て`, true);
    }
    // 取り残された少数の敵・鉄砲だけの敵は、しばらくすると退く（襲来が止まらないように）
    if (F.wave) {
      F.waveT = (F.waveT || 0) + dt;
      for (const g of [F.W1, F.W2, F.KE, F.W3a, F.W3b, F.W3c, F.W3d]) {
        if (!g || g.routed || g.count === 0) continue;
        const live = g.units.filter((u) => u.alive);
        const gunsOnly = live.every((u) => u.type === 'gun' || u.type === 'bow');
        // 150秒を過ぎた襲来は、残りがどれだけでも退く（どこかで詰まっても先へ進めるように。三の手だけは山場なので 200 秒）
        if ((F.waveT > 100 && live.length <= 3) || (F.waveT > 60 && gunsOnly) || F.waveT > (F.wave === 3 ? 200 : 150)) { g.noRout = false; g.morale = 0; }
      }
    }
    if (F.wave === 1 && gone(F.W1) && !F.next2) {
      F.next2 = true;
      rt.unmark('w');
      rt.say('木下藤吉郎', 'ようやった！　じゃが、まだ来るぞ。今のうちに備えを直せ', 4);
      rt.after(12, () => rt.say('木下藤吉郎', '世間では一夜で城が建つなどと言うておるらしい。大げさじゃ。一夜では柵も結えぬわ', 4.5));
      rt.after(8, () => repairFort(rt));
      rt.after(22, () => this.wave2(rt));
      F.nextWaveAt = rt.t + 22;
    }
    if (F.wave === 2) {
      // 荷駄
      if (F.K && !F.nidaDone) {
        for (const u of F.K.units) {
          if (u.alive && u.type === 'porter' && !u.saved && Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        }
        const alivePorters = F.K.units.filter((u) => u.alive && u.type === 'porter' && !u.saved).length;
        rt.objProgress('nida', `砦へ ${F.saved}/4`);
        if (F.saved >= 2 && (alivePorters === 0 || F.saved >= 3 || F.K.pathIdx >= F.K.path.length)) {
          F.nidaDone = true; rt.objDone('nida'); rt.unmark('nida');
          rt.award((t) => t.side.push('荷駄を守った'), '副任務：荷駄を守った');
          rt.say('木下藤吉郎', '材木が届いた！　これで柵が増やせる、恩に着るぞ', 3.5);
        } else if (F.saved + alivePorters < 2) {
          F.nidaDone = true; rt.objFail('nida'); rt.unmark('nida');
          rt.say('木下藤吉郎', '荷駄がやられたか……痛いのう', 3);
        }
      }
      // 荷駄を狙う組：狙った人足が倒れたか砦へ入ったら次の人足へ。狙う荷駄がもう無ければ西の林へ退く（林の口で立ち尽くさない）
      if (F.KE && !gone(F.KE) && !F.KE.routed) {
        const fo = F.KE.focus;
        if (!fo || !fo.alive || fo.saved) {
          const next = F.nidaDone ? null : F.K && F.K.units.find((u) => u.alive && u.type === 'porter' && !u.saved);
          if (next) F.KE.focus = next;
          else { F.KE.focus = null; F.KE.noRout = false; F.KE.morale = 0; }
        }
      }
      if (F.KE && gone(F.KE)) rt.unmark('ke');
      if (gone(F.W2) && gone(F.KE) && !F.KEwait && !F.next3) {
        F.next3 = true;
        rt.unmark('w');
        rt.say('木下藤吉郎', '日が傾いてきた。次が正念場じゃ', 3.5);
        rt.after(8, () => repairFort(rt));
        rt.after(24, () => this.wave3(rt));
        F.nextWaveAt = rt.t + 24;
      }
    }
    if (F.wave === 3 && F.W3c && F.W3d && gone(F.W3a) && gone(F.W3b) && gone(F.W3c) && gone(F.W3d) && !F.won) {
      rt.unmark('w4');
      F.won = true;
      rt.unmark('w'); rt.unmark('w2'); rt.unmark('w3'); rt.unmark('flag');
      rt.objDone('defend');
      rt.award((t) => { t.main = true; if (F.perfect) t.special = { label: '砦の完全防衛', pts: 30 }; }, F.perfect ? '任務達成・砦の完全防衛' : '任務達成');
      if (F.perfect) { rt.objDone('perfect'); rt.grantTitle('perfect'); }
      if (!F.flagTaken) rt.objFail('flag');
      rt.banner('守りきった', '墨俣に砦が建つ');
      rt.say('木下藤吉郎', `守りきったぞ！　${nm(rt)}、お主のおかげじゃ！`, 4);
      this.fortDone(rt);
      sfx('horagai', 0.8);
      rt.finish({}, 10);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v === F.flagbearer && k && (k.isPlayer || k.isSub)) {
      rt.unmark('flag');
      const pos = { x: v.pos.x, z: v.pos.z };
      rt.marker('flagdrop', pos, '敵の旗');
      rt.addInteract('flag', pos, '敵の旗を奪う', () => {
        rt.uninteract('flag'); rt.unmark('flagdrop');
        F.flagTaken = true;
        rt.objDone('flag');
        rt.award((t) => t.c.flag++, '敵旗奪取');
        rt.say('木下藤吉郎', '斎藤の旗を奪ったか！　あっぱれじゃ！', 3);
      }, { r: 3, ttl: 30, hold: 1.0 });
    } else if (v === F.flagbearer) {
      rt.unmark('flag');
      rt.objFail('flag');
    }
  },

  onStructHit(rt, s) {
    if (!s.side) return;
    const F = rt.flags;
    F.sideWarn = F.sideWarn || {};
    if ((F.sideWarn[s.side] || -99) + 12 > rt.t) return;
    F.sideWarn[s.side] = rt.t;
    rt.bark(`${{ n: '北', w: '西', e: '東', s: '南' }[s.side]}の柵が攻められている！`, true);
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s === F.hut) {
      rt.banner('普請小屋が破られた');
      rt.say('木下藤吉郎', 'いかん……小屋をやられた。これでは砦が建たぬ', 4);
      rt.tracker.main = false;
      rt.objFail('defend');
      rt.finish({}, 7);
      return;
    }
    if (F.perfect) { F.perfect = false; rt.objFail('perfect'); }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    rt.say('木下藤吉郎', '柵が破られたぞ！　破れ目を塞げ！', 3);
    sfx('wood', 1);
  },

  onFinish(rt) {
    const R = rt.G.rel.tokichiro;
    if (rt.tracker.main) { R.trust += 10; R.like += 10; }
    if (rt.flags.perfect && rt.tracker.main) R.like += 5;
  },
};

// 墨俣の bot：砦の内に留まり、柵の内から槍で突く。柵を越えた敵を先に討つ。荷駄を狙う敵だけは南の門から打って出て討つ
// （柵の外の敵へまっすぐ歩くと柵に当たって動けなくなるので、柵の手前で止まって待つ）
sunomata.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const inF = (q, m = 0) => Math.abs(q.x) < FORT - m && Math.abs(q.z) < FORT - m;
  const GATE_IN = { x: 0, z: FORT - 3 }, GATE_OUT = { x: 0, z: FORT + 3 };
  // 歩く：柵の内と外を行き来する時は南の門を通る。砦の内では普請小屋（真ん中の solid）を回り込む
  const walk = (x, z, r) => {
    const me = inF(u.pos, 0.3), to = inF({ x, z }, 0.3);
    if (me !== to) {
      const a = me ? GATE_IN : GATE_OUT, c = me ? GATE_OUT : GATE_IN;
      // 外から戻る時は、柵に沿って南へ回ってから門へ
      if (!me && u.pos.z < FORT + 2) {
        const sx = u.pos.x < 0 ? -1 : 1;
        if (Math.abs(u.pos.x) < FORT + 2.5) return goTo(p, inp, sx * (FORT + 4), u.pos.z, 1);
        return goTo(p, inp, sx * (FORT + 4), FORT + 4, 1.5);
      }
      if (Math.abs(u.pos.x - a.x) > 1.4 || Math.abs(u.pos.z - a.z) > 2) return walk2(a.x, a.z, 0.8);
      return goTo(p, inp, c.x, c.z, 0.5);
    }
    return walk2(x, z, r);
  };
  const walk2 = (x, z, r) => {
    const hx = F.hut.x, hz = F.hut.z;
    if (F.hut.alive && inF(u.pos)) {
      const hd = Math.hypot(u.pos.x - hx, u.pos.z - hz);
      if (hd < 5 && Math.hypot(x - hx, z - hz) > 5.4) {
        // 小屋に張り付いている：まず小屋から離れる（回り込みと小屋の押し返しで行き来しないように）
        const ox = (u.pos.x - hx) / (hd || 1), oz = (u.pos.z - hz) / (hd || 1);
        if (ox * (x - hx) + oz * (z - hz) < 0) return goTo(p, inp, hx + ox * 6.5 - oz * 3, hz + oz * 6.5 + ox * 3, 0.8);
      }
      const dx = x - u.pos.x, dz = z - u.pos.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((hx - u.pos.x) * dx + (hz - u.pos.z) * dz) / l2));
      if (Math.hypot(u.pos.x + dx * t - hx, u.pos.z + dz * t - hz) < 5.4 && Math.hypot(x - hx, z - hz) > 5.4) {
        const sx = (u.pos.x - hx) * dz - (u.pos.z - hz) * dx > 0 ? 1 : -1;
        const len = Math.sqrt(l2);
        return goTo(p, inp, hx + (-dz / len) * 7 * sx, hz + (dx / len) * 7 * sx, 1.5);
      }
    }
    return goTo(p, inp, x, z, r);
  };
  const strike = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 4) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
  };
  const fight = (e) => {
    const eIn = inF(e.pos), meIn = inF(u.pos, 0.3);
    // 柵の外の敵：柵の手前（内側）の近い所で待って突く
    if (meIn && !eIn) {
      const m = FORT - 1.1;
      walk(Math.max(-m, Math.min(m, e.pos.x)), Math.max(-m, Math.min(m, e.pos.z)), 0.5);
    } else if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 2.4) walk(e.pos.x, e.pos.z, 2.2);
    strike(e);
    // 組にも突かせる（号令は2秒に一度まで）
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 2; }
  };
  // 深手なら、敵から離れて構えたまま下がり、敵が寄っていなければ小屋で手当て（人ならそうする）
  if (u.hp < u.maxHp * 0.45) {
    const near = b.army.nearestEnemy(u, 8);
    const heal = b.interacts.find((x) => x.id === 'heal');
    if (!near && heal && !(F.healCd > b.t)) {
      walk(0, 1, 1.5);
      if (Math.hypot(u.pos.x, u.pos.z - 0.5) < 3.5) inp.e.add('KeyE');
      return;
    }
    if (near) {
      const m = FORT - 2;
      const d = Math.hypot(u.pos.x - near.pos.x, u.pos.z - near.pos.z) || 1;
      goTo(p, inp, Math.max(-m, Math.min(m, u.pos.x + (u.pos.x - near.pos.x) / d * 6)), Math.max(-m, Math.min(m, u.pos.z + (u.pos.z - near.pos.z) / d * 6)), 0.5);
      p.yaw = Math.atan2(near.pos.x - u.pos.x, near.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.k.add('KeyS');
      inp.guardHold = true;
      if (d < 3 && Math.random() < 0.3) inp.leftPressed = true;
      return;
    }
  }
  // 落ちた敵の旗を拾う（砦の近くだけ）
  const fl = b.interacts.find((x) => x.id === 'flag');
  if (fl && Math.hypot(fl.pos.x, fl.pos.z) < 45 && !b.army.nearestEnemy(u, 3)) {
    if (Math.hypot(fl.pos.x - u.pos.x, fl.pos.z - u.pos.z) > 2) walk(fl.pos.x, fl.pos.z, 1.5);
    else { inp.e.add('KeyE'); inp.k.add('KeyE'); }
    return;
  }
  // 柵を越えた敵が最優先（小屋を焼かれる）
  const inside = b.army.nearestEnemy(u, 60, (o) => inF(o.pos, -0.5));
  if (inside) { fight(inside); return; }
  // 荷駄を狙う敵は打って出て討つ
  if (F.KE && F.KE.count && !F.KE.routed && !F.nidaDone) {
    const e = b.army.nearestEnemy(u, 200, (o) => o.group === F.KE);
    if (e) { fight(e); return; }
  }
  // 柵の外に出ていれば、近くの敵を討ちながら砦へ戻る
  if (!inF(u.pos, 0.3)) {
    const foe = b.army.nearestEnemy(u, 3.5);
    if (foe) { fight(foe); return; }
    walk(0, FORT - 5, 1.5);
    return;
  }
  // 柵に寄ってくる敵：柵の内側から突く
  const e = b.army.nearestEnemy(u, 30, (o) => Math.abs(o.pos.x) < FORT + 8 && Math.abs(o.pos.z) < FORT + 8);
  if (e) { fight(e); return; }
  if (b.squad.length && b.squadGroups[0].order === 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 2; }
  // 寄せ手の来る側の柵の内へ
  const far = b.army.nearestEnemy(u, 220);
  if (far) { const m = FORT - 2.5; walk(Math.max(-m, Math.min(m, far.pos.x)), Math.max(-m, Math.min(m, far.pos.z)), 2); }
  else walk(0, -10, 3);
};

// ======================================================================
// 長篠編　設楽原の決戦（天正三年五月二十一日）
// 連吾川を挟んだ南北に長い原。織田・徳川は川の西に三重の馬防柵を結い、鉄砲をその内に並べた。
// 東の丘から武田の騎馬と足軽が波のように寄せる。足軽の役目は、柵の内から槍で突き落とすこと
// ======================================================================
const SB = { x0: 14, gap: 7, z0: -96, z1: 96, gates: [-42, 18, 66] };   // 馬防柵：一列目の x、列の間、南北の端、虎口
const RENGO = [[42, -176], [38, -90], [44, -20], [40, 50], [46, 120], [42, 176]];   // 連吾川
const SH_FRONT = SB.x0 + 2;   // これより東へ出たら「柵の外」

const shitaragahara = {
  spawn: { x: 10, z: 4, heading: Math.PI / 2 },
  world: {
    seed: 57,
    mood: 'morning',
    muddy: 0.25,
    time: 'day',
    paths: [[[-176, 10], [-80, 8], [-20, 18], [SB.x0 - 2 * SB.gap - 4, SB.gates[1]]]],
    height(x, z) {
      let h = 0.8 * Math.sin(x * 0.035) * Math.cos(z * 0.028) + 0.5 * Math.sin(z * 0.06 + x * 0.02);
      // 西：弾正山（家康の陣）と、信長の茶臼山。東：武田の陣の丘
      h += 7 * gauss(x, z, -85, 12, 2400) + 6 * gauss(x, z, -110, -90, 2600);
      h += Math.max(0, x - 70) * 0.09 + 5 * gauss(x, z, 150, -40, 3600) + 4 * gauss(x, z, 140, 80, 3000);
      // 柵の前の浅い空堀と、柵の後ろの土盛り
      const fx = SB.x0 + 2.6;
      h -= 0.9 * Math.exp(-((x - fx) ** 2) / 1.6) * (Math.abs(z) < SB.z1 ? 1 : 0);
      const bx = SB.x0 - 2 * SB.gap - 3;
      h += 0.75 * Math.exp(-((x - bx) ** 2) / 3) * (Math.abs(z) < SB.z1 ? 1 : 0);
      return h;
    },
    tint(x, z, h, c) {
      // 柵の並ぶ所は踏み固められて土が出ている
      if (x > SB.x0 - 2 * SB.gap - 5 && x < SB.x0 + 4 && Math.abs(z) < SB.z1) c.setRGB(c.r * 0.8 + 0.08, c.g * 0.78 + 0.06, c.b * 0.7 + 0.03);
      // 川沿いの湿った田
      if (Math.abs(x - 40) < 14) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => x > -45 && x < 95,
    paddy(x, z) {
      if (x < 24 || x > 58 || Math.abs(x - 41) < 4) return 0;
      if ((Math.floor(x / 11) + Math.floor(z / 16)) % 2) return 0;
      const ex = Math.min(((x % 11) + 11) % 11, 11 - ((x % 11) + 11) % 11), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    streams: [{ pts: RENGO, w: 2.4, depth: 1.2 }],
    trees: 300,
    tufts: 4200,
    // 武田の陣の丘は木を疎らに（丘に並ぶ武田の備が柵から見えるように）
    treeDensity: (x, z) => (x < -60 || x > 168 ? 1 : x > 100 ? 0.12 : 0.3),
    groves: [{ x: -70, z: -40, r: 14, n: 22 }, { x: 168, z: 20, r: 16, n: 26 }, { x: 150, z: -120, r: 14, n: 20 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.fence = buildBobosaku(rt, { x0: SB.x0, z0: SB.z0, z1: SB.z1, gap: SB.gap, gates: SB.gates, facing: 1 });
    F.broken = 0;
    // 織田家編では、織田の鉄砲奉行（前田利家）の下の足軽として柵の内に立つ。戦の流れは同じで、上役・家・持ち場の旗だけ替わる
    const oda = scenarioKey() === 'oda' && !rt.G.lord;
    F.oda = oda;
    F.boss = oda ? '前田利家' : '大久保忠世';
    const odaZ = oda ? 20 : -20;   // これより北（-z）は織田の持ち場（通説どおり織田が北寄り、徳川が南）
    // 鉄砲組：一列目の柵のすぐ内。号令があるまで撃たない
    F.guns = [];
    for (const z of [-84, -56, -28, 0, 28, 56, 84]) {
      // 織田家編では、自分の前の鉄砲組の頭が鉄砲奉行の佐々成政
      const sassa = oda && z === 0;
      F.guns.push(allyGroup(rt, { faction: z < odaZ ? 'oda' : 'tokugawa', name: sassa ? '佐々成政の鉄砲組' : '鉄砲組', anchor: { x: SB.x0 - 2.4, z }, facing: Math.PI / 2, width: 16, spacing: 1.6, aggro: 44, noRout: true, holdFire: true, dmgMult: 0.8 },
        [...(sassa ? [{ type: 'samurai', n: 1, o: { name: '佐々成政', invuln: true } }] : []), { type: 'gun', n: 16 }]));
    }
    // 槍の組：自分の組（大久保忠世の手）と、南北の組
    const ok = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: oda ? '前田組' : '大久保組', anchor: { x: SB.x0 - 4.5, z: 2 }, facing: Math.PI / 2, width: 16, aggro: 6, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: F.boss, invuln: true, horse: true } }, { type: 'ashigaru', n: 16 }]);
    F.okubo = ok.units[0];
    F.spears = [ok];
    for (const [z, fac] of [[-70, 'oda'], [-38, 'oda'], [36, oda ? 'oda' : 'tokugawa'], [68, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', anchor: { x: SB.x0 - 4.5, z }, facing: Math.PI / 2, width: 16, aggro: 6, noRout: true, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }]));
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SB.x0 - 4, z: 8 }, Math.PI / 2, [{ kind: 'spear', n }]);

    // 本陣：家康は弾正山、信長は茶臼山（陣幕の内に床几の大将と諸将、後ろに馬印と旗本）
    const KT = nagashinojo.kit, A = KT.ARMOR;
    KT.honjin(rt, -84, 12, { mon: 'tokugawa', w: 16, d: 12, armor: A.tokugawa });
    KT.honjin(rt, -110, -90, { mon: 'oda', w: 16, d: 12, armor: A.oda });
    for (const [x, z, k, h] of [[-94, 22, 'onri', 6.5], [-100, -80, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 柵の内の旗（織田が北寄り、徳川が南）
    for (let z = -88; z <= 88; z += 22) rt.scene.add(nobori(W, SB.x0 - SB.gap - 3, z + 5, z < odaZ ? (oda && z % 44 === 0 ? 'maeda' : 'oda') : (z % 44 === 0 ? 'okubo' : 'tokugawa'), 5));
    rt.scene.add(tawara(W, -30, 30, 0.3, 6), tawara(W, -34, -20, -0.4, 5));
    // 遠景の村（西の山すそと、南の谷）
    KT.farVillage(rt, -18, 160, { rot: Math.PI, n: 6, fields: 8, seed: 21 });
    KT.farVillage(rt, 64, -158, { rot: 0, n: 5, fields: 6, seed: 22 });
    // 大軍：戦う兵の周りを、軽い作りの兵で埋める（織田・徳川は三万、武田は一万五千）
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 柵の二列目の後ろ：南北いっぱいに控えの列（どこを見ても柵が人で埋まって見える）
    for (const [z0, z1, flag] of [[-96, -8, 'oda'], [-8, 96, 'tokugawa']]) DA(SB.x0 - 2 * SB.gap - 7, (z0 + z1) / 2, z1 - z0, 4, 300, Math.PI / 2, A[flag], flag, z0 < 0 ? 31 : 32);
    // 後ろの控え（備）：鉄砲の替えの組・槍の備・旗本の騎馬
    [[-40, -70, 'oda', 'spear'], [-40, -20, 'eiraku', 'gun'], [-40, 30, 'tokugawa', 'spear'], [-40, 75, 'okubo', 'gun'], [-66, 0, 'onri', 'cavalry'], [-75, -62, 'oda', 'spear']]
      .forEach(([x, z, f, kind], i) => DA(x, z, kind === 'gun' ? 26 : 16, kind === 'gun' ? 6 : 24, kind === 'cavalry' ? 120 : 180, Math.PI / 2, f === 'oda' || f === 'eiraku' ? A.oda : A.tokugawa, f, 41 + i, kind));
    // 武田の本隊：川向こうの丘に、隊ごとに旗を立てて並ぶ。赤備えは赤。奥に勝頼の本陣
    F.hill = [[118, -80, 'takeda', 'spear'], [124, -40, 'akazonae', 'cavalry'], [116, 0, 'takeda', 'cavalry'], [124, 40, 'takeda', 'mixed'], [118, 80, 'takeda', 'spear'], [150, 50, 'takeda', 'cavalry']]
      .map(([x, z, f, kind], i) => DA(x, z, kind === 'cavalry' ? 22 : 14, kind === 'cavalry' ? 16 : 28, kind === 'cavalry' ? 130 : 200, -Math.PI / 2, A[f], f, 51 + i, kind));
    F.katsuyori = DA(156, -12, 30, 26, 220, -Math.PI / 2, A.takeda, 'takeda', 57, 'honjin');
    F.katsuyori.army.lord = '武田勝頼';   // 近づけば旗本が本物の兵になって迎え撃ち、勝頼は奥へ下がる（b_nagashinojo.js の wake）
    // 寄せの波ごとに、遠くでも別の隊が柵へ駆けていく（見た目だけ）。四十間ほどで鉄砲に撃ち崩されて散る
    F.far = [];
    for (const [z, f, kind] of [[-80, 'akazonae', 'cavalry'], [-58, 'akazonae', 'cavalry'], [72, 'takeda', 'cavalry'], [52, 'takeda', 'spear'], [-66, 'takeda', 'cavalry'], [60, 'takeda', 'cavalry']]) {
      const m = DA(125, z, kind === 'cavalry' ? 20 : 14, 12, kind === 'cavalry' ? 80 : 90, -Math.PI / 2, A[f], f, 61 + F.far.length, kind);
      m.visible = false;
      F.far.push({ m, z, v: 0 });
    }
    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : '馬防柵を守り抜け'}（武田の寄せ 0/3）`, 'main');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで柵の外へ出るな', 'order');
    rt.obj('fence', '一列目の柵を三か所より多く破らせない', 'side');
    // 信長で遊ぶ時：柵の南（織田の持ち場）で、家臣の言上を聞く
    if (rt.G.lord) {
      rt.say('滝川一益', '殿、柵は三重に結い終えました。鉄砲は柵の内に並べてございます', 4.5);
      rt.say('佐久間信盛', '武田の騎馬、丘の上に揃うております。勝頼は退かぬ構えと見えまする', 4.5);
      rt.say('織田信長', '騎馬は柵で止めよ。止まった所を撃て。柵の外へは出るな――勝頼が背を向けるまでじゃ', 5);
      F.wave = 0;
      rt.after(16, () => this.wave(rt));
      return;
    }
    if (oda) {
      rt.say('前田利家', `${nm(rt)}、桶狭間の雨から十五年か。あの日のわしは出仕を止められた身で、勝手に駆けつけておった。……よう生き残ったのう`, 5.5);
      rt.say('佐々成政', '鉄砲は柵の内に並べ終えた。千挺と言うが、ここに見えるはその一部よ。騎馬が柵で止まった所を、われら奉行の下知で撃つ', 5.5);
      rt.say('前田利家', '柵の外へは出るな。誘いに乗って出た者から死ぬ。その方の組は前田組の一手じゃ。撃ち漏らしを槍で突き落とせ', 5);
      rt.after(22, () => rt.bark('柵の隙間から槍で突ける。鉄砲は前田利家の「放て」で一斉に撃つ'));
    } else {
      rt.say('大久保忠世', `${nm(rt)}、よう見ておけ。あの丘の向こうに武田の本隊がおる`, 4.5);
      rt.say('大久保忠世', '騎馬は柵で止める。止まった所を鉄砲で撃ち、柵に取り付いた者を槍で突き落とせ', 5);
      rt.say('大久保忠世', '柵の外へは出るな。誘いに乗って出た者から死ぬ', 4);
      rt.after(20, () => rt.bark('柵の隙間から槍で突ける。鉄砲は大久保の「放て」で一斉に撃つ'));
    }
    F.wave = 0;
    rt.after(16, () => this.wave(rt));
  },

  // 武田の寄せ：一の波から三の波。名のある将が率い、騎馬が先に駆け、足軽が続く
  WAVES: [
    { name: '山県昌景', fac: 'akazonae', z: -36, cav: 12, ash: 22, line: '赤備えじゃ！　山県の騎馬が来るぞ！', hist: '山県昌景、討死',
      fall: '山県昌景、柵の前で鉄砲に撃たれ、馬から落ちたぞ！' },
    { name: '内藤昌豊', fac: 'takeda', z: 34, cav: 10, ash: 24, line: '二の波！　内藤の旗じゃ！', hist: '内藤昌豊、討死',
      fall: '内藤昌豊、退く兵を背に踏みとどまって討たれたぞ！' },
    { name: '真田信綱', fac: 'takeda', z: -6, cav: 12, ash: 24, line: '三の波！　真田の騎馬、正面から！', hist: '真田信綱、討死',
      fall: '真田信綱、柵を越えられぬまま討死！　弟の昌輝も続いたと！' },
  ],
  // 織田家編：織田の持ち場の前に来たのは真田・土屋・馬場。山県・内藤は北の徳川の柵へ（知らせで聞く）
  WAVES_ODA: [
    { name: '真田信綱', fac: 'takeda', z: -36, cav: 12, ash: 22, line: '六文銭の旗じゃ！　真田の騎馬が来るぞ！', hist: '真田信綱、討死',
      fall: '真田信綱、柵を越えられぬまま討死！　弟の昌輝も続いたと！', news: '北の徳川殿の柵に、山県昌景の赤備えが取り付いたとのこと！' },
    { name: '土屋昌続', fac: 'takeda', z: 34, cav: 10, ash: 24, line: '二の波！　土屋の旗じゃ！', hist: '土屋昌続、討死',
      fall: '土屋昌続、柵に取り付いたところを撃たれて討死！', news: '山県昌景、徳川殿の柵の前で討死！　内藤昌豊の隊が代わって寄せておるそうな' },
    { name: '馬場信春', fac: 'takeda', z: -6, cav: 12, ash: 24, line: '三の波！　馬場の騎馬、正面から！', hist: '馬場信春、殿に残る', sub: '武田の退き口',
      fall: '馬場信春、殿（しんがり）となって退いていく！', news: '内藤昌豊も討たれたと！　武田の寄せはこれが最後じゃ' },
  ],
  wave(rt) {
    const F = rt.flags;
    const W0 = F.oda ? this.WAVES_ODA : this.WAVES;
    const w = W0[F.wave];
    if (!w) return;
    F.wave++;
    F.waveAt = rt.t;
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', anchor: { x: 98, z: w.z }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 10, width: 20, morale: 100, speed: 3 },
      [{ type: 'busho', n: 1, o: { name: w.name, horse: true } }, { type: 'cavalry', n: w.cav }, { type: 'ashigaru', n: w.ash }]);
    g.def = w;
    F.cur = g;
    // 寄せの後ろから、武田の鉄砲と弓の組が川の手前まで出て、柵の内へ撃ちかける（騎馬の突っ込みを援ける）。
    //   柵に取り付かず、寄せの隊が崩れれば一緒に退く
    const mis = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', anchor: { x: 112, z: w.z + 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 14, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }, { type: 'bow', n: 7 }]);
    for (const u of mis.units) if (u.type === 'gun' || u.type === 'bow') u.dmg *= 0.5;
    mis.order = 'move'; mis.dest = { x: SB.x0 + 40, z: w.z + 14 };
    mis.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...q.dest }; q.facing = -Math.PI / 2; };
    F.curMis = mis;
    // 丘の隊も一つ寄せに押し出し、遠くの隊も二つ、同時に柵へ駆け出す
    const hq = F.hill[(F.wave * 2) % F.hill.length];
    if (hq && !hq.army.rout) hq.advance(14, 9);
    for (const fc of F.far.filter((q) => !q.v).slice(0, 2)) {
      fc.v = 1; fc.m.visible = true;
      const dist = 125 - (SB.x0 + 62);
      fc.m.advance(dist, dist / 7, { charge: true });
      fc.hitAt = rt.t + dist / 7;
    }
    // 柵の他の所へも、武田の大軍（軽い作り）が押し寄せて柵に取り付き、槍を叩き合う（world.addClash）。受ける柵の内は本物の兵なので描かない
    // 柵の前で撃たれて倒れた者は、その場に残る。この波の名のある隊が崩れたら、一緒に崩れて退く
    // どの波でも柵の北と南の両方へ、正面いっぱいに押し寄せる（本物の兵の受ける真ん中の外すべて）
    F.clashW = [[F.wave === 2 ? 68 : 64, 56], [F.wave === 2 ? -70 : -66, 56]].map(([z, cw], i) => {
      const fac = i || F.wave !== 1 ? 'takeda' : 'akazonae';
      const c = clash(rt, { x: SB.x0 + 1.5, z, facing: Math.PI / 2, w: cw, gap: 3, gap0: 64, closeSpeed: 4, seed: 190 + F.wave * 3 + i, noRout: true, noWake: true, killRate: 0.2, maxDrift: 1.5,
        A: { hidden: true, flag: 'tokugawa', count: cw * 4 }, B: { flag: fac === 'takeda' && i ? 'furin' : fac, armor: nagashinojo.kit.ARMOR[fac], count: Math.round(cw * 11) } });
      c.push('A', 0.3);
      rt.after(2 + i * 3, () => c.go());
      return c;
    });
    // 名のある寄せ手の後ろに、同じ旗の騎馬と足軽が続く（寄せの厚み）
    nagashinojo.kit.backOf(rt, g, { flag: w.fac, armor: nagashinojo.kit.ARMOR[w.fac], kind: 'cavalry', w: 22, depth: 14, count: 110, gap: 4, seed: 71 + F.wave, stop: () => g.center().x < SB.x0 + 75 });
    sfx('taiko', 1);
    rt.banner(`武田の寄せ　${['一', '二', '三'][F.wave - 1]}の波`, `${w.name}の隊`);
    rt.say('足軽', w.line, 3);
    if (w.news) rt.after(14, () => rt.say('伝令', w.news, 4));
    // 朝から昼過ぎまで続いた戦：三の波のころには日が高く傾き始める
    if (F.wave === 3) rt.world.setTime('after');
    rt.marker('wave', centerOf(g), () => `${w.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    // 丘を下り、川を越えて一気に柵へ（戦国大名の「七秒・十四秒」）
    g.order = 'move'; g.dest = { x: SB.x0 + 8, z: w.z };
    g.onArrive = (gg) => { gg.order = 'assault'; gg.seekRange = 14; gg.aggro = 14; };
    g.assault = (u) => {
      // 柵のどこかに取り付く。口が空いていれば入り込もうとする
      if (!u.segTarget || !u.segTarget.alive) {
        let best = null, bd = Infinity;
        for (const s of F.fence) {
          if (!s.alive || s.row !== 0) continue;
          const d = Math.abs((s.seg[1] + s.seg[3]) / 2 - u.pos.z) + Math.random() * 10;
          if (d < bd) { bd = d; best = s; }
        }
        u.segTarget = best;
      }
      return u.segTarget || { x: SB.x0 - SB.gap * 2 - 6, z: u.pos.z };
    };
    rt.objProgress('hold', '');
    rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : '馬防柵を守り抜け'}（武田の寄せ ${F.wave - 1}/3）`, 'main');
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 遠くの寄せ：丘を下って柵へ駆け、四十間（七十m）ほどで撃ち崩されて散る
    for (const fc of F.far || []) {
      if (fc.v !== 1 || rt.t < fc.hitAt) continue;
      fc.v = 2;
      for (let i = 0; i < 6; i++) rt.army.smoke(SB.x0 - 1, rt.world.heightAt(SB.x0, fc.z) + 1.4, fc.z + (i - 2.5) * 5, 1, 0);
      rt.army.play('gun', { x: SB.x0, z: fc.z }, 1.2);
      fc.m.rout({ hideAfter: 45 });
      for (let i = 0; i < 4; i++) rt.world.addCarrion(SB.x0 + 60 + Math.random() * 10, fc.z + (Math.random() - 0.5) * 16);
    }
    nagashinojo.kit.backTick(rt);
    // 寄せの隊が崩れたか尽きたら、後ろの鉄砲・弓の組も退く
    if (F.curMis && F.cur && (F.cur.routed || F.cur.count === 0) && !F.curMis.routed && F.curMis.count) { F.curMis.noRout = false; F.curMis.morale = 0; }
    // 一斉射撃：寄せ手が柵から四十間ほどに入ったら「放て」。込め直しの間は待ち、揃ったらまた放つ
    const g = F.cur;
    if (g && !g.routed && g.count > 0 && !F.pursuit) {
      let nearX = Infinity;
      for (const u of g.units) if (u.alive) nearX = Math.min(nearX, u.pos.x);
      const dist = nearX - SB.x0;
      if (dist < 70 && !F.waitSaid) { F.waitSaid = true; rt.say((rt.flags.boss || '大久保忠世'), 'まだじゃ……まだ撃つな。引きつけよ', 2.5); }
      F.volT = (F.volT ?? 99) + dt;
      if (dist < 40 && F.volT > 7.5) {
        F.volT = 0; F.volleys = (F.volleys || 0) + 1;
        for (const gg of F.guns) gg.holdFire = false;
        if (F.volleys <= 2 || F.volleys % 4 === 0) rt.say((rt.flags.boss || '大久保忠世'), F.volleys === 1 ? '放てぇっ！' : '次の組、放て！', 1.5);
        rt.after(1.6, () => { for (const gg of F.guns) gg.holdFire = true; });
      }
    }
    // 波が崩れたら、次の波
    if (g && !F.pursuit && (g.routed || g.count === 0) && !g.doneWave) {
      g.doneWave = true;
      rt.unmark('wave');
      for (const c of F.clashW || []) rt.after(1 + Math.random() * 3, () => c.rout('B', { hideAfter: 40, minFight: 40 }));
      rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : '馬防柵を守り抜け'}（武田の寄せ ${F.wave}/3）`, 'main');
      // 率いた宿将が崩れの中でまだ生きていれば、史実のとおりこの寄せで討死する（知らせで伝える）
      const gen = g.units.find((u) => u.type === 'busho');
      if (gen && gen.alive) rt.after(2.5, () => {
        if (!gen.alive) return;
        if (!g.fallSaid) { g.fallSaid = true; rt.banner(g.def.hist, g.def.sub || '宿将の討死'); rt.say('伝令', g.def.fall, 4); }
        gen.invuln = false;
        rt.army.kill(gen, null);
      });
      rt.award((t) => t.side.push(`${g.def.name}隊を退けた`), `${g.def.name}隊を退けた`);
      if (F.wave < (F.oda ? this.WAVES_ODA : this.WAVES).length) {
        rt.say((rt.flags.boss || '大久保忠世'), 'よう持ちこたえた！　次が来るぞ、槍を立てよ', 3);
        rt.after(14, () => this.wave(rt));
      } else this.decide(rt);
    }
    // 柵の外へ出たか
    if (!F.pursuit && p.x > SH_FRONT && !rt.G.lord) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく柵の外へ出た', [(rt.flags.boss || '大久保忠世'), '戻れ！　柵の外へ出るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else if (!F.pursuit) F.outT = 0;
    // 追い討ち：殿の馬場信春の隊を崩せば勝ち
    if (F.pursuit && !F.ending) {
      const R = F.rear;
      if ((R && (R.routed || R.count === 0)) || rt.t - F.pursuit > 170) {
        F.ending = true;
        if (R && (R.routed || R.count === 0)) {
          rt.objDone('pursue');
          rt.award((t) => { t.special = { label: '追い討ち', pts: 25 }; }, '殿を崩した');
        } else rt.objFail('pursue');
        rt.banner('武田勢、総崩れ', '設楽原の戦、終わる');
        for (const h of [...F.hill, F.katsuyori]) h.rout({ hideAfter: 60 });
        rt.say((rt.flags.boss || '大久保忠世'), '勝ったぞ！　武田の騎馬を、柵と鉄砲で破ったのじゃ', 4);
        sfx('horagai', 0.8);
        rt.finish({}, 10);
      }
    }
  },

  decide(rt) {
    const F = rt.flags;
    rt.objDone('hold');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '馬防柵を守り抜いた');
    if (!F.outWarned && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    if (F.broken <= 3) { rt.objDone('fence'); rt.award((t) => t.side.push('柵を守った'), '副任務：柵を守った'); }
    rt.banner('勝頼の決断', '武田勢、退き始める');
    // 丘の上の武田の隊と勝頼の本陣が、背を向けて東へ退いていく
    F.katsuyori.retreat(60, 40);
    F.hill.forEach((h, i) => { if (!h.army.rout) rt.after(i * 1.5, () => h.retreat(50, 36)); });
    rt.say('伝令', '武田勝頼、退き陣！　馬場美濃守が殿に残っておりまする！', 4);
    rt.after(5, () => {
      F.pursuit = rt.t;
      sfx('horagai', 1);
      rt.say((rt.flags.boss || '大久保忠世'), '柵を出よ！　追い討ちじゃ！　虎口から打って出よ！', 4);
      rt.obj('pursue', '柵を出て、殿の馬場信春の隊を崩せ', 'main');
      for (const gg of F.guns) gg.holdFire = false;
      for (const sp of F.spears) { sp.order = 'attack'; sp.seekRange = 70; sp.formation = 'line'; }
      // 柵の内に残る鉄砲組と、南北の槍組は任務に数えない：遊び手が武田の本隊へ踏み込んだ時、遠くの者から外して、
      // 本隊の中の軽い兵を本物の兵に替える枠に回す（本隊の真ん中が空き地にならないように）
      nagashinojo.kit.markRecyclable(...F.guns, ...F.spears.slice(1));
      const R = enemyGroup(rt, { faction: 'takeda', name: '馬場隊', anchor: { x: 78, z: 10 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0.2 }, aggro: 12, width: 18, morale: 90 },
        [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]);
      F.rear = R;
      nagashinojo.kit.backOf(rt, R, { flag: 'takeda', armor: nagashinojo.kit.ARMOR.takeda, kind: 'spear', w: 18, depth: 10, count: 120, seed: 79 });
      rt.marker('rear', centerOf(R), () => `殿・馬場信春・${moraleWord(R.morale)}`, { red: true, group: R });
    });
  },

  onRout(rt, g) {
    if (g === rt.flags.rear) { rt.unmark('rear'); rt.say('足軽', '殿が崩れたぞ！', 2.5); }
  },
  onKill(rt, v, k) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.group && v.group.def && !v.group.def.fallSaid) {
      v.group.def.fallSaid = true;
      if (!(k && k.isPlayer)) rt.banner(v.group.def.hist, '宿将の討死');
      rt.say('足軽', `${v.group.def.name}様、討ち取ったりぃ！`, 3);
      v.group.morale -= 30;
    }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s.row === 0) {
      F.broken++;
      if (F.broken === 4) rt.objFail('fence');
    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    rt.say((rt.flags.boss || '大久保忠世'), '柵が破られた！　破れ目を槍で塞げ！', 3);
    sfx('wood', 1);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.hitWarn = rt.t;
    const z = (s.seg[1] + s.seg[3]) / 2;
    rt.bark(`${z < -30 ? '南' : z > 30 ? '北' : '正面'}の柵に取り付かれている！`, true);
  },
};
// 両軍の総勢（織田・徳川 三万八千、武田 一万五千）。討たれた兵一人を、遠くの大勢の損害に見立てる
shitaragahara.force = (rt) => {
  const F = rt.flags;
  const b = 15000 - (F.ek || 0) * 95 - (F.ending ? 1500 : 0);
  return { a: 38000 - (F.ak || 0) * 40, a0: 38000, b, b0: 15000 };
};
shitaragahara.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.wave === 0 && rt.t > 3 ? '武田の寄せまで待つ' : '');
shitaragahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
shitaragahara.history = '天正三年五月二十一日、織田・徳川の連合軍（織田三万・徳川八千ほど）は設楽原に馬防柵を結い、多くの鉄砲を並べて武田勝頼の軍を迎え撃った。『信長公記』は鉄砲を「千挺ばかり」と記し、画面の鉄砲組はその一部にあたる。山県昌景・内藤昌豊・真田信綱・馬場信春ら武田の宿将の多くが討ち死にした。「三千挺の三段撃ち」の話は後の軍記に出るもので、数や撃ち方には諸説がある。';

// 行軍や待ちを飛ばす（二度目以降の人が、同じ場面を待たされないように）
// 初陣で深手を負ったら、源八が組の後ろ（味方のいる側）へ引きずって下げる
okehazama.carryBack = (rt) => {
  const g = rt.hostGroup;
  if (!g || !g.count) return null;
  const c = g.center(), p = rt.player.u.pos;
  // 今川本陣と反対の側へ 12m
  const dx = c.x - HONJIN.x, dz = c.z - HONJIN.z, d = Math.hypot(dx, dz) || 1;
  return { x: c.x + dx / d * 12 + (p.x - c.x) * 0.1, z: c.z + dz / d * 12 };
};
okehazama.canSkip = (rt) => (rt.phase === 'march' ? '行軍を飛ばす' : rt.phase === 'wait' && rt.pt < 20 ? '合図まで待つ' : '');
okehazama.skip = (rt) => {
  const F = rt.flags;
  if (rt.phase === 'march') {
    for (const g of [...F.cols, F.nob]) {
      const end = g.path[g.path.length - 1];
      g.anchor = { x: end[0], z: end[1] };
      g.pathIdx = g.path.length;
      g.formation = 'line'; g.facing = Math.PI;
      g.units.forEach((u, i) => { const q = g.slotPos(i, g.initial); u.pos.x = q.x; u.pos.z = q.z; });
      if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
    }
    if (F.denrei === 'active') { F.denrei = 'fail'; rt.uninteract('denrei'); rt.unmark('yohei'); rt.objFail('denrei'); }
    if (!F.rain) { F.rain = true; rt.world.setRainTarget(1); rt.world.setTime('storm'); }
    const c = rt.hostGroup.center();
    rt.player.u.pos.x = c.x + 2; rt.player.u.pos.z = c.z + 3;
    rt.player.camInit = false;
    rt.say('', '――豪雨の中、一刻ほど山あいを進んだ', 3);
  } else if (rt.phase === 'wait') rt.pt = 20;
};
// bot（素直な初めての遊び手）：列について行き、「かかれ」で本陣へ。深手になったら構えて味方の列へ下がり、息を整えてからまた出る
okehazama.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const dd = (q) => Math.hypot(q.x - u.pos.x, q.z - u.pos.z);
  if (b.phase === 'brief' && F.genpachi && !F.briefed) { goTo(p, inp, F.genpachi.pos.x, F.genpachi.pos.z, 2.5); if (dd(F.genpachi.pos) < 3) inp.e.add('KeyE'); return; }
  if (b.phase !== 'assault') {
    if (F.denrei === 'active' && F.yohei) { goTo(p, inp, F.yohei.pos.x, F.yohei.pos.z, 2); if (dd(F.yohei.pos) < 3) inp.e.add('KeyE'); return; }
    const c = b.hostGroup.center();
    goTo(p, inp, c.x + 2, c.z + 2, 4);
    return;
  }
  // 深手：構えたまま、味方の組の後ろへ下がる（息が戻るまで）
  if (u.hp < u.maxHp * 0.5) F.botBack = true;
  if (F.botBack && u.hp > u.maxHp * 0.8) F.botBack = false;
  const host = b.hostGroup.count ? b.hostGroup : F.cols.find((g) => g.count) || b.hostGroup;
  if (F.botBack) {
    const c0 = host.center();
    // 組が幔幕の内にいれば、幔幕の外（南）の味方の後ろまで下がる
    const c = Math.hypot(c0.x - HONJIN.x, c0.z - HONJIN.z) < 18 ? { x: HONJIN.x, z: HONJIN.z + 26 } : { x: c0.x, z: c0.z + 6 };
    goTo(p, inp, c.x, c.z, 2);
    const e = b.army.nearestEnemy(u, 3);
    inp.guardHold = !!e;
    return;
  }
  // 目の前の敵だけを突く（遠くの敵を追い回さない）。本陣へ入る前は道すがら、入った後は幔幕の内で
  const e = b.army.nearestEnemy(u, F.entered ? 10 : 5, (o) => !o.noTarget && !o.fleeing);
  if (e) {
    const d = dd(e.pos);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    return;
  }
  // 本陣へ：味方の組と一緒に寄せる（組より先へ出すぎない）
  const c = host.center();
  const tgt = F.entered ? HONJIN : Math.hypot(u.pos.x - HONJIN.x, u.pos.z - HONJIN.z) > Math.hypot(c.x - HONJIN.x, c.z - HONJIN.z) + 6 ? c : HONJIN;
  goTo(p, inp, tgt.x, tgt.z, F.entered ? 6 : 3);
};
// 森部の bot（素直な遊び手）：組を連れて指示地点へ。合図までは目の前の敵だけ。合図の後は先手を突き、深手なら組の後ろへ下がる。
// 大沢の「北の畦より先へは出るな」を守る（逃げる敵を追って斎藤の本隊へ一人で入らない）
moribe.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const pt = F.point || POINT2;
  if (u.hp < u.maxHp * 0.45) F.botBack = true;
  if (F.botBack && u.hp > u.maxHp * 0.75) F.botBack = false;
  // 組がついて来るように、初めに一度「ついて来い」
  if (b.squadGroups[0] && b.squadGroups[0].order !== 'follow' && !F.signal && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 3; }
  const sq = b.squadGroups[0];
  if (F.botBack) {
    const c = F.B && F.B.count ? F.B.center() : { x: 20, z: 30 };
    goTo(p, inp, c.x, c.z + 8, 3);
    inp.guardHold = !!b.army.nearestEnemy(u, 3);
    return;
  }
  const reach = F.signal ? 14 : 4;
  const e = b.army.nearestEnemy(u, reach, (o) => !o.noTarget && !o.fleeing && o.pos.z > LINE2 - 4);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    if (F.signal && sq && sq.order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 3; }
    return;
  }
  // 行き先：合図の前は指示地点、合図の後は先手（崩れた後は新手、それも無ければ前備の横）
  let q = pt;
  if (F.signal) {
    const tg = !F.vBroken && F.V.count ? F.V : F.Rz && F.Rz.count && !F.Rz.routed ? F.Rz : null;
    q = tg ? tg.center() : { x: 20, z: -20 };
  }
  if (q.z < LINE2 + 4) q = { x: q.x, z: LINE2 + 4 };
  goTo(p, inp, q.x, q.z, F.signal ? 4 : 5);
};
moribe.canSkip = (rt) => (rt.flags.pointDone && rt.flags.vArrived && !rt.flags.signal ? '合図まで待つ' : '');
moribe.skip = (rt) => { rt.flags.vArrived = rt.t - 13; };
sunomata.canSkip = (rt) => (rt.flags.nextWaveAt && rt.flags.nextWaveAt - rt.t > 3 ? '次の襲来まで待つ' : '');
sunomata.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); rt.flags.nextWaveAt = rt.t; };

// 両軍の名と紋、その日の暦（画面上部の表示に使う）
const sky = (rt) => {
  const w = rt.world;
  const weather = w.rainLevel > 0.5 ? '雨' : w.timeKey === 'storm' ? '曇' : w.timeKey === 'after' ? '雨上がり' : '晴';
  const time = { day: '昼', storm: '昼', after: '昼下がり', dusk: '夕暮れ' }[w.timeKey] || '昼';
  return `${weather}・${time}`;
};
// 旧暦の月から季節を出す（一〜三月は春、四〜六月は夏、七〜九月は秋、十〜十二月は冬）
const seasonOf = (m) => { const n = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'].indexOf(m.replace('月', '')) + 1; return n <= 3 ? '春' : n <= 6 ? '夏' : n <= 9 ? '秋' : '冬'; };
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;
okehazama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '今川軍', mon: 'imagawa' } };
okehazama.date = (rt) => `永禄三年五月十九日　${seasonOf('五月')}・${sky(rt)}`;
moribe.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
moribe.date = (rt) => `永禄四年五月十四日　${seasonOf('五月')}・${sky(rt)}`;
sunomata.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
sunomata.date = (rt) => `永禄九年九月　${seasonOf('九月')}・${sky(rt)}`;

// 両軍の総勢（上の兵数）。討たれた兵一人を、遠くの大勢の損害に見立てる
// 桶狭間：織田 約三千、今川 約二万五千（数は諸説）。義元が討たれると本陣の者が崩れる
okehazama.force = (rt) => {
  const F = rt.flags;
  return { a: 2000 - (F.ak || 0) * 6, a0: 2000, b: 25000 - (F.ek || 0) * 30 - (F.victory ? 3000 : 0), b0: 25000 };
};
// 森部：はっきりした数は伝わらない。控えめに、織田 約千五百、斎藤 約六千とする
moribe.force = (rt) => {
  const F = rt.flags;
  return { a: 1500 - (F.ak || 0) * 6, a0: 1500, b: 6000 - (F.ek || 0) * 20 - (F.ending ? 800 : 0), b0: 6000 };
};
// 墨俣：数は伝わらない。砦の守りと人足で千五百、斎藤は川向こうも合わせて四千ほどに見せる
sunomata.force = (rt) => {
  const F = rt.flags;
  return { a: 1500 - (F.ak || 0) * 5, a0: 1500, b: 4000 - (F.ek || 0) * 15, b0: 4000 };
};

// 戦後に添える史実のメモ
okehazama.history = '史実の桶狭間では、豪雨の後に織田勢が今川本陣を急襲し、今川義元は毛利新介に討ち取られた。信長公記は、信長が「分捕りはせず、討ち捨てにせよ」と命じたと伝える。織田勢の数は『信長公記』に「二千に足らざる」とあり、この戦では二千とした（今川勢の数にも諸説ある）。義元に一番に槍をつけたのは服部小平太で、膝を斬られながらも、続いた毛利新介が首を挙げた。義元は塗輿を捨てて退こうとしたところを討たれたという。戦った場所は、古くから「田楽狭間」と伝える説と、『信長公記』の「おけはざま山」に本陣があったとする説があり、今も定まっていない。';
moribe.history = '永禄四年五月、斎藤義龍の急死の直後に信長は美濃へ攻め入り、森部で斎藤勢を破った。この戦いで斎藤方の日比野下野守・長井甲斐守が討ち死にしている。斎藤家の紋は「撫子」（二頭立波とする伝えもある）。道三の頃から撫子を使ったと伝わるが、義龍・龍興の頃の旗の形ははっきりしない。この戦では撫子の旗にしている。';
sunomata.history = '墨俣に砦を築いて美濃攻めの足場としたことは確かだが、「一夜城」の話は後世の伝承の色が濃い。翌永禄十年、信長は稲葉山城を落とし、岐阜と改めた。';

// ======================================================================
// 稽古場（腕試し）：押し寄せる敵を何人討てるか
// ======================================================================
export const dojo = {
  dojo: true,
  trackerIndex: 0,
  spawn: { x: 0, z: 8, heading: Math.PI },
  world: {
    seed: 41,
    paths: [],
    height: (x, z) => 0.6 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 6 * gauss(x, z, 0, 0, 90000) * 0 + (Math.hypot(x, z) > 45 ? (Math.hypot(x, z) - 45) * 0.12 : 0),
    clear: (x, z) => Math.hypot(x, z) < 48,
    trees: 260,
    tufts: 2500,
    time: 'after',
  },
  sides: { a: { name: '稽古の者', mon: 'maru' }, b: { name: '寄せ手', mon: 'saito' } },
  date: () => '清洲の稽古場　腕試し',
  setup(rt) {
    const W = rt.world;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      if (i % 4 === 0) continue;
      rt.scene.add(palisade(W, [Math.sin(a0) * 40, Math.cos(a0) * 40, Math.sin(a1) * 40, Math.cos(a1) * 40], { h: 1.8 }));
    }
    for (const [x, z] of [[-10, 36], [10, 36], [0, -38]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    rt.flags.wave = 0; rt.flags.kills = 0;
    rt.obj('dojo', '押し寄せる寄せ手を討ち続けよ', 'main');
    rt.say('師範', '腕試しじゃ。寄せ手は波のように来る。倒れるまで、何人討てるか見せてみよ', 4.5);
    rt.say('', isTouch ? '左上の「止める」から「タイトルへ戻る」で、いつでも終えられます' : 'Esc で一時停止し、「タイトルへ戻る」でいつでも終えられます', 4);
    rt.after(5, () => this.next(rt));
  },
  next(rt) {
    const F = rt.flags;
    F.wave++;
    const n = F.wave;
    const list = [{ type: 'ashigaru', n: 2 + n * 2 }];
    if (n >= 3) list.push({ type: 'samurai', n: Math.floor(n / 2) });
    if (n >= 5) list.push({ type: 'cavalry', n: 1 + Math.floor((n - 5) / 2) });
    if (n >= 4) list.push({ type: 'gun', n: 1 });
    if (n % 5 === 0) list.push({ type: 'busho', n: 1, o: { name: `寄せ手の頭 第${n}陣` } });
    const a = Math.random() * Math.PI * 2;
    const g = enemyGroup(rt, { faction: 'saito', anchor: { x: Math.sin(a) * 34, z: Math.cos(a) * 34 }, facing: a + Math.PI, order: 'attack', seekRange: 90, noRout: true, width: 5 }, list);
    F.cur = g;
    rt.banner(`第${n}陣`, `${g.units.length}人が寄せてくる`);
    rt.obj('dojo', `押し寄せる寄せ手を討ち続けよ（第${n}陣）`, 'main');
  },
  update(rt) {
    const F = rt.flags;
    rt.objProgress('dojo', `討ち取り ${F.kills}人`);
    if (F.cur && F.cur.count === 0 && !F.waiting) {
      F.waiting = true;
      rt.say('師範', F.wave % 3 === 0 ? 'ほう、やるのう。次はもう少し手ごわいぞ' : '次じゃ！', 2);
      rt.player.u.hp = Math.min(rt.player.u.maxHp, rt.player.u.hp + rt.player.u.maxHp * 0.25);
      rt.after(4, () => { F.waiting = false; this.next(rt); });
    }
  },
  onKill(rt, v, k) { if (k && k.isPlayer) rt.flags.kills++; },
};

// 筋書きごとの戦。BATTLE_DEFS は、いま遊んでいる筋書きの中身に入れ替わる（state.js の BATTLES と同じ並び）
const DEF_BY_ID = { okehazama, moribe, sunomata, shitaragahara };
for (const [id, d] of Object.entries({ inabayama, mitsukuri, nodafukushima, odani, nagashima, takato, honnoji, shiga, tonezaka, tennoji, shigisan, arioka, miki, tedorigawa, iga, echizen, kizugawa, saika, tano, mikatagahara, tottori, iwamura, okawachi })) if (d) DEF_BY_ID[id] = d;
for (const [id, d] of Object.entries({ nagashinojo, tobinosu, suwahara, anegawa, sekigahara, sanadamaru, sune, kanegasaki, domyoji, hieizan })) if (d) DEF_BY_ID[id] = d;
for (const [id, d] of Object.entries(DEF_BY_ID)) d.key = id;
export const BATTLE_DEFS = [];
onScenario(() => BATTLE_DEFS.splice(0, BATTLE_DEFS.length, ...BATTLES.map((b) => DEF_BY_ID[b.id])));
markReady(Object.keys(DEF_BY_ID));
