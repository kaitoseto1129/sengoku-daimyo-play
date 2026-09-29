// 第1戦　桶狭間の戦の定義（battles.js から分けた。中身は元のまま）
import { gauss, allyGroup, enemyGroup, unitPos, nm, centerOf } from './bhelp.js';
import { distToPolyline } from './world.js';
import { palisade, hut, yagura, nobori, tawara, campfire, koshi, umaFollow } from './props.js';
import { nagashinojo } from './b_nagashinojo.js';
import { customFlag } from './b_inabayama.js';
import { farArmy, alongPath, moveFar, gone, seasonOf, sky, uS, uA, uG, uBu, uB, uC } from './b_shared.js';
import { sfx, hush } from './audio.js';
import * as DP from './b_depth.js';
import { depthTick, depthStart } from './b_depth.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { clash } from './b_sekigahara.js';
import { moraleWord } from './hud.js';

// ======================================================================
// 第1戦　桶狭間
// ======================================================================
const P1 = [[0, 172], [4, 140], [6, 118], [-8, 90], [-24, 60], [-30, 30], [-22, 0], [-12, -30], [-8, -46]];
const HONJIN = { x: 18, z: -116 };

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
      const g = allyGroup(rt, { name: sp.name, anchor: { x: sx, z: sz }, facing: Math.PI, formation: 'column', spacing: 1.4, order: 'hold', speed: 3.0, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 } },
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
    rt.obj('talk', '組頭の源八と話せ', 'main');
    rt.marker('genpachi', unitPos(rt.flags.genpachi), '組頭 源八');
    rt.addInteract('talk', unitPos(rt.flags.genpachi), '源八と話す', () => this.brief(rt), { r: 3.5 });
    rt.setPhase('brief');
    rt.world.setTime('day');
    rt.say('弥七', `おう、${nm(rt)}。組頭が呼んでおるぞ`, 3.5);
    // 出陣前の試し突き
    rt.flags.dummies = [rt.dummy(-3, 153, 0), rt.dummy(1, 151.5, 0), rt.dummy(5, 153, 0)];
    rt.obj('practice', '藁人形で試し突きをせよ（任意）', 'side');
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
    rt.say('源八', `${n}、腹ごしらえは済んだか。今朝、今川の大軍が丸根と鷲津の砦を攻め落とした`, 4.5);
    rt.say('源八', '殿はここ中島砦から打って出られる。我らの組も続くぞ', 4);
    rt.say('源八', '殿の下知じゃ。分捕りはならぬ、討ち捨てにせよ。ひたすら敵を突き崩せ', 5);
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
    depthTick(rt, dt);
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
    if (!F.denrei && host.pathIdx >= 3 && !rt.G.lord && F.scoutDone) {   // 物見が済んでから（印と任務を一つずつ）
      F.denrei = 'active';
      F.denreiT = 80;
      rt.say('源八', `${nm(rt)}、この書付を先手の与兵衛殿へ届けよ。急げ！`, 4);
      rt.obj('denrei', '書付を先手の与兵衛に届けよ', 'side');
      rt.marker('yohei', unitPos(F.yohei), '与兵衛');
      rt.addInteract('denrei', unitPos(F.yohei), '書付を渡す', () => {
        F.denrei = 'done';
        rt.uninteract('denrei'); rt.unmark('yohei'); rt.objDone('denrei');
        rt.award((t) => t.c.denrei++, '書付を届けた');
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
    // 豪雨の中の道（歩くだけにしない）：遠くの砦の煙、雷、小声のやりとり
    if (!F.mid1 && host.pathIdx >= 6 && !rt.G.lord) {
      F.mid1 = true;
      sfx('far', 0.7);
      rt.say('弥七', '（小声で）遠くで煙が上がっておる……鷲津の砦か', 3.5);
      rt.after(4, () => rt.say('源八', '（小声で）佐久間様も飯尾様も、あそこで討たれた。仇は本陣で返す', 4));
    }
    if (!F.mid2 && host.pathIdx >= 7 && !rt.G.lord) {
      F.mid2 = true;
      sfx('taiko', 0.35);
      rt.say('源八', '（小声で）足音を殺せ。この尾根の向こうに今川の本陣がある', 3.5);
      rt.after(4, () => rt.bark('雨で足音は消える。今のうちに組の後ろへ寄れ'));
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
      clash(rt, { x: -78, z: -84, facing: Math.PI, w: 84, gap0: 36, closeSpeed: 3.6, seed: 61, noRout: true, killRate: 0.12, surge: { k: 'B', every: 45, count: 150, flank: 0.30 }, A: A(520), B: B(760, { bows: true }) }),
      clash(rt, { x: 93, z: -86, facing: Math.PI, w: 74, gap0: 36, closeSpeed: 3.6, seed: 62, noRout: true, killRate: 0.12, surge: { k: 'B', every: 55, count: 130, flank: 0.35 }, A: A(460), B: B(680) }),
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
    // 足軽の筋では、本陣の札と印は段（stages）が出す（ここで出すと次のコマで消え、印がちらつく）
    if (rt.G.lord) {
      rt.objRemove('honjin0');
      rt.obj('honjin', '今川義元の本陣を突け', 'main');
      rt.marker('honjin', { x: HONJIN.x, z: HONJIN.z }, '今川本陣');
      rt.zone('honjin', HONJIN.x, HONJIN.z, 14);
    }
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
        for (const u of g.units) if (u.alive) u.dmg *= 0.7;
        g.order = 'attack';
        g.seekRange = 26;
      }
    });
  },

  // ---------------- 本戦の段と判断（一戦を長く濃く） ----------------
  // 段一：坂の下の先手 → 判断①（与兵衛を助けるか、本陣へ押すか） → 段三：本陣の前備え → 判断②（口から押し入るか、北へ回って輿の行く手を断つか）
  // → 旗本との攻防（前からの流れ） → 義元討死の後：段五 引き返してくる今川の後詰から本陣の跡を守る
  stages(rt, dt) {
    const F = rt.flags;
    if (rt.G.lord || F.ending) return;
    if (!F.stage) {
      F.stage = 1; F.stageT = rt.t; rt.obj('st', '坂の下の今川の先手を突き崩せ', 'main');
      // 本陣の印は、本陣へ寄れる段（判断②の後）まで出さない。今は目の前の先手へ
      rt.objRemove('honjin'); rt.unmark('honjin'); rt.unzone('honjin');
      const g0 = F.enemies.find((g) => g.count && !g.routed);
      if (g0) rt.marker('st1', centerOf(g0), () => `今川の先手・${moraleWord(g0.morale)}`, { red: true, group: g0 });
    }
    // 義元が討たれた後は、前の段へは進まない（引き返す今川勢の段＝6 を待つ）
    if (F.victory && F.stage < 6) return;
    const el = rt.t - F.stageT;
    const next = (k) => { F.stage = k; F.stageT = rt.t; };
    if (F.stage === 1) {
      const first = F.enemies.slice(0, 3), down = first.filter((g) => !g.count || g.routed).length;
      rt.objProgress('st', `崩した先手 ${down}/3`);
      // 先手を崩したら、段を重ねる（立て直し→畦の押し合い→林の鉄砲の判断）。済んでから与兵衛の判断へ
      if (down >= 2 || el > 110) { rt.unmark('st1'); rt.objDone('st'); F.stage = 1.5; depthStart(rt, okeCtx(rt), okeA(), () => { next(2); this.choiceYohei(rt); }); }
    }
    if (F.stage === 2.5) {
      const g = F.flankE;
      rt.objProgress('st', g ? `横槍の今川勢 ${gone(g) ? 0 : g.count}人` : '');
      if (g && (gone(g) || el > 100)) {
        if (gone(g)) { F.yoheiSaved = true; rt.objDone('st'); rt.award((t) => t.side.push('与兵衛の組を救った'), '与兵衛の組を救った'); rt.say('与兵衛', 'かたじけない！　この組、本陣まで付いて行くぞ', 3.5); }
        else { rt.objFail('st'); g.noRout = false; g.morale = 0; }
        rt.unmark('flankE'); next(3); this.frontGuard(rt);
      }
    }
    if (F.stage === 3) {
      const g = F.front;
      rt.objProgress('st', `本陣の前備え ${gone(g) ? 0 : g.count}人`);
      volleyAt(rt, 'okeFront', F.okeGun, [g], { r: 30, until: F.stageT + 24, hit: 30, then: ['弥七', '前備えが揺れた！　今じゃ！'] });
      if (g.count < 6 && !gone(g)) g.morale = Math.min(g.morale, 20);
      if (gone(g) || el > 120) { rt.unmark('front'); rt.objDone('st'); next(4); this.choiceKoshi(rt); }
    }
    if (F.stage === 4.5 && F.cutPt && !F.entered) {
      const p = rt.player.u.pos;
      const d = Math.hypot(p.x - F.cutPt.x, p.z - F.cutPt.z);
      rt.objProgress('st', `輿の行く手まで ${Math.max(0, Math.round(d - 6))}m`);
      if (d < 6) {
        F.entered = true; F.enterT = rt.t; F.cut = true;
        rt.unmark('cut'); rt.unzone('cut'); rt.objDone('st'); rt.objRemove('honjin'); rt.unmark('honjin'); rt.unzone('honjin');
        rt.banner('輿の行く手を断った', '幔幕の裏で、旗本が向き直る');
        rt.award((t) => { t.special = { label: '輿の行く手を断った', pts: 30 }; }, '輿の行く手を断った');
        // 旗本は幔幕の外へ出た所を捕まり、固い陣を組めない
        F.hatamoto.anchor = { x: F.cutPt.x, z: F.cutPt.z + 4 }; F.hatamoto.defMult = 1.2;
        rt.obj('crush', '旗本を崩し、味方を義元へ通せ', 'main');
        rt.marker('yoshimoto', unitPos(F.yoshimoto), '旗本の奥の義元', { red: true }); F.yoshimoto.allyOk = true;   // ここからは味方の兵も義元へ槍を付ける
        this.bannermen(rt);
        for (const g of [...F.cols, F.nob]) if (g.count) { g.order = 'attack'; g.seekRange = 34; g.anchor = { x: F.cutPt.x, z: F.cutPt.z + 6 }; }
        next(5);
      }
    }
    // 保険：口から押し入る段で、長く本陣に入れない時は、味方がなだれ込んだ事にして旗本との攻防へ
    if (F.stage === 5 && !F.entered && el > 90) {
      F.entered = true; F.enterT = rt.t;
      rt.objDone('honjin'); rt.unmark('honjin'); rt.unzone('honjin');
      rt.banner('味方が幔幕の内へなだれ込んだ', '旗本を崩し、味方を義元へ通せ');
      rt.obj('crush', '旗本を崩し、味方を義元へ通せ', 'main');
      rt.marker('yoshimoto', unitPos(F.yoshimoto), '旗本の奥の義元', { red: true }); F.yoshimoto.allyOk = true;   // ここからは味方の兵も義元へ槍を付ける
      this.bannermen(rt);
    }
    if (F.stage === 6) {
      const g = F.matsui;
      const left = Math.max(0, 70 - el);
      rt.objProgress('st', `引き返す今川勢 ${gone(g) ? 0 : g.count}人・持ちこたえる ${Math.ceil(left)}秒`);
      if (g.count < 6 && !gone(g)) g.morale = Math.min(g.morale, 20);
      if (gone(g) || left <= 0) {
        rt.unmark('matsui');
        if (gone(g)) { rt.objDone('st'); rt.award((t) => t.side.push('引き返した今川勢を退けた'), '引き返した今川勢を退けた'); } else { rt.objDone('st'); g.noRout = false; g.morale = 0; }
        rt.say('源八', 'よう持ちこたえた。……じゃが、まだ終わらぬ', 3);
        // 引き返す今川勢の後にも段を重ねる（追い討ちか手負いか→しんがり）
        F.stage = 7;
        depthStart(rt, okeCtx(rt), okeB(), () => {
          rt.say('源八', '殿の本隊は引き上げた。……勝鬨じゃ！', 3);
          sfx('horagai', 0.8);
          F.ending = true;
          rt.finish({}, 8);
        });
      }
    }
  },
  // 判断①：東の丘の今川勢が、先手・与兵衛の組の横を突いた
  choiceYohei(rt) {
    const F = rt.flags;
    rt.army.play('eshout', { x: 60, z: -70 }, 1.6);
    rt.say('弥七', '東の丘から今川勢じゃ！　与兵衛殿の組が横を突かれておる！', 3.5);
    rt.choose('与兵衛の組が横を突かれた。どうする？', [
      { label: '与兵衛を助けに回る', note: '横槍を崩せば、与兵衛の組が本陣まで付いて来る。本陣へは遅れる' },
      { label: '構わず本陣へ押す', note: '本陣へ早く着く。与兵衛の組は崩れ、後で今川の後詰が厚くなる' },
    ], (i) => {
      if (F.victory) return;
      const Y = F.cols[0];
      const yc = Y.count ? Y.center() : { x: 30, z: -60 };
      if (i === 0) {
        F.stage = 2.5; F.stageT = rt.t;
        F.flankE = enemyGroup(rt, { faction: 'imagawa', name: '横槍の今川勢', anchor: { x: yc.x + 26, z: yc.z - 8 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 1, z: -0.5 } },
          [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }]);
        F.flankE.dmgMult = 0.6;
        // 横槍は小勢でなく、丘から下る数百の塊（近くは本物の兵）
        nagashinojo.kit.backOf(rt, F.flankE, { flag: 'imagawa', armor: nagashinojo.kit.ARMOR.imagawa, kind: 'spear', w: 20, depth: 12, count: 160, seed: 131 });   // 初陣：組と一緒なら崩せる強さ
        F.flankE.focus = Y.units.find((u) => u.alive) || null;
        rt.obj('st', '与兵衛の組を助け、横槍の今川勢を崩せ', 'main');
        rt.marker('flankE', centerOf(F.flankE), () => `横槍の今川勢・${moraleWord(F.flankE.morale)}`, { red: true, group: F.flankE });
        rt.say('源八', 'よし、組を連れて回れ！　与兵衛を見捨てるな', 3);
      } else {
        F.pushed = true;
        Y.noRout = false; Y.morale = 0;
        rt.say('源八', '……振り向くな。本陣だけを見よ', 3);
        rt.after(3, () => rt.say('足軽', '与兵衛殿の組が崩れた……！', 2.5));
        F.stage = 3; F.stageT = rt.t; this.frontGuard(rt);
      }
    }, 20);
  },
  // 段三：本陣の前を固める備え
  frontGuard(rt) {
    const F = rt.flags;
    F.front = enemyGroup(rt, { faction: 'imagawa', name: '本陣の前備え', anchor: { x: HONJIN.x, z: HONJIN.z + 26 }, facing: 0, order: 'hold', aggro: 16, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: F.pushed ? 12 : 14 }, { type: 'bow', n: 2 }, ...((F.dpMem || {}).okeGuns === 'left' ? [{ type: 'gun', n: 3 }] : [])]);
    // 初陣の足軽が一人で当たっても一撃で崩れない強さに（味方の組と囲めば崩せる）
    F.front.dmgMult = 0.6;
    nagashinojo.kit.backOf(rt, F.front, { flag: 'imagawa', armor: nagashinojo.kit.ARMOR.imagawa, kind: 'spear', w: 22, depth: 12, count: 170, seed: 132, stop: () => { const c = F.front.center(); return Math.hypot(c.x - HONJIN.x, c.z - HONJIN.z) < 30; } });
    for (const g of F.cols) if (g.count) { g.order = 'attack'; g.seekRange = 40; g.anchor = { x: HONJIN.x + (Math.random() - 0.5) * 16, z: HONJIN.z + 34 }; }
    // 味方の鉄砲（桶狭間の頃はまだ少ない）。前備えが寄せた所で一斉に放つ
    F.okeGun = allyGroup(rt, { name: '織田の鉄砲', anchor: { x: HONJIN.x - 14, z: HONJIN.z + 52 }, facing: Math.PI, order: 'hold', aggro: 4, width: 6, noRout: true, fleeDir: { x: 0, z: 1 } }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }]);
    rt.after(3, () => rt.say('源八', '鉄砲が寄せを待っておる。放ったら、崩れた所へ横から突け', 3.5));
    F.carried = Math.min(F.carried || 0, 1);   // 初陣：本陣の前でも、もう一度は組頭が引きずって下げてくれる
    rt.obj('st', '本陣の前備えを横から突き崩せ', 'main');
    rt.marker('front', centerOf(F.front), () => `本陣の前備え・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.say('源八', '本陣の前に槍衾じゃ。正面から当たるな、横へ回れ！', 3.5);
    if ((F.dpMem || {}).okeGuns === 'left') rt.after(4, () => rt.say('弥七', '林の鉄砲組が前備えに加わっておる！　込め直しの間に寄れ！', 3));
    rt.after(16, () => { if (F.front && !gone(F.front)) { F.front.order = 'attack'; F.front.seekRange = 30; } });
    // 与兵衛を捨てて押した時は、東から今川の新手が加わる
    if (F.pushed) rt.after(28, () => {
      if (F.ending) return;
      const g = enemyGroup(rt, { faction: 'imagawa', name: '東の今川の新手', anchor: { x: 70, z: -110 }, facing: -Math.PI / 2, order: 'attack', seekRange: 80, aggro: 14, width: 10, morale: 90, fleeDir: { x: 1, z: -1 } }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }]);
      nagashinojo.kit.backOf(rt, g, { flag: 'imagawa', armor: nagashinojo.kit.ARMOR.imagawa, kind: 'spear', w: 20, depth: 12, count: 160, seed: 133 });
      F.enemies.push(g);
      rt.say('足軽', '東から今川の新手！　与兵衛殿の組を崩した者どもじゃ！', 3);
    });
  },
  // 判断②：塗輿が幔幕の裏から北へ動いた
  choiceKoshi(rt) {
    const F = rt.flags;
    rt.say('弥七', '見よ、幔幕の裏で塗輿が動いた！　北へ抜ける気じゃ！', 3.5);
    rt.choose('義元の塗輿が北へ動いた。どうする？', [
      { label: '幔幕の口から正面に押し入る', note: '味方の組と一緒に押し入る。旗本は幔幕の内で固い' },
      { label: '北へ回り込み、輿の行く手を断つ', note: '幔幕の外を走る。着けば旗本は陣を組めない。遅れれば輿は逃げる' },
    ], (i) => {
      // 選ぶ間に、もう本陣へなだれ込んでいたら何もしない（義元が討たれた後も）
      if (F.victory) return;
      if (F.entered) { F.stage = 5; F.stageT = rt.t; return; }
      if (i === 1) {
        F.stage = 4.5; F.stageT = rt.t;
        F.cutPt = { x: HONJIN.x - 4, z: HONJIN.z - 24 };
        rt.obj('st', '北へ回り込み、輿の行く手を断て', 'main');
        rt.marker('cut', F.cutPt, '輿の行く手', { h: 3 }); rt.zone('cut', F.cutPt.x, F.cutPt.z, 6);
        F.hatamoto.anchor = { x: HONJIN.x - 2, z: HONJIN.z - 10 };
        rt.say('源八', 'よし、ついて来い！　幕の外を回るぞ', 3);
        // 遅すぎれば、輿は北の谷へ抜けて前の流れ（口から）に戻る
        rt.after(70, () => { if (F.stage === 4.5 && !F.entered) { rt.unmark('cut'); rt.unzone('cut'); rt.objFail('st'); rt.say('源八', '遅かったか……輿は幕の内へ戻った。口から押し入れ！', 3); F.stage = 5; F.stageT = rt.t; this.honjinMark(rt); } });
      } else { F.stage = 5; F.stageT = rt.t; rt.say('源八', 'よし、口から押し入る。組で固まれ！', 3); this.honjinMark(rt); }
    }, 20);
  },
  honjinMark(rt) {
    if (rt.flags.entered) return;
    rt.obj('honjin', '幔幕の口から今川本陣に突入せよ', 'main');
    rt.marker('honjin', { x: HONJIN.x, z: HONJIN.z + 9 }, '今川本陣の口');
    rt.zone('honjin', HONJIN.x, HONJIN.z, 14);
  },
  // 段五（義元討死の後）：北の谷から今川の後詰が引き返してくる。本陣の跡を守り抜け
  lastStand(rt) {
    const F = rt.flags;
    F.stage = 6; F.stageT = rt.t;
    F.matsui = enemyGroup(rt, { faction: 'imagawa', name: '引き返す今川勢', anchor: { x: HONJIN.x, z: -168 }, facing: 0, order: 'attack', seekRange: 90, aggro: 16, width: 14, morale: 100, noRout: true, fleeDir: { x: 0, z: -1 } },
      [{ type: 'busho', n: 1, o: { name: '松井宗信' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: F.pushed ? 14 : 10 }]);
    F.matsui.dmgMult = 0.6;
    nagashinojo.kit.backOf(rt, F.matsui, { flag: 'imagawa', armor: nagashinojo.kit.ARMOR.imagawa, kind: 'spear', w: 22, depth: 12, count: 200, seed: 134 });
    rt.after(20, () => { if (F.matsui) F.matsui.noRout = false; });
    rt.banner('今川勢、引き返す', '北の谷から、主の仇を討たんと');
    rt.say('足軽', '北から今川勢が引き返してくる！　義元の仇討ちじゃと！', 3.5);
    rt.say('源八', '首は捨てよ。本陣の跡で槍を揃えて受けよ！', 3.5);
    rt.obj('st', '引き返す今川勢から本陣の跡を守れ', 'main');
    rt.marker('matsui', centerOf(F.matsui), () => `引き返す今川勢・${moraleWord(F.matsui.morale)}`, { red: true, group: F.matsui });
    for (const g of [...F.cols, F.nob]) if (g.count) { g.order = 'hold'; g.anchor = { x: HONJIN.x + (g === F.nob ? 8 : -4), z: HONJIN.z - 6 }; g.facing = 0; g.aggro = 14; }
  },

  assault(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    this.stages(rt, dt);
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
    if (!F.rescue && rt.pt > 18 && (rt.G.lord || (F.stage >= 2.5 && rt.t - F.stageT > 20))) {   // 足軽の筋では、与兵衛の判断の後、段の敵と当たって少ししてから（判断の札・段の台詞と重ねない）
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
        rt.award((t) => t.c.rescue++, '味方の侍を救った');
        rt.grantTitle('rescue');
        rt.say('前野長兵衛', 'かたじけない！この恩は忘れぬ', 3);
        F.maeno.group.order = 'attack';
        F.maeno.group.seekRange = 40;
      }
    }
    // 本陣突入
    // 本陣の前備えを崩すまでは、幔幕の口は前備えの槍衾が塞いでいる（段を飛ばして本陣へは入れない）
    if (!F.entered && !rt.G.lord && F.stage && F.stage < 4 && Math.hypot(p.x - HONJIN.x, p.z - HONJIN.z) < 16 && !(F.blockSaid > rt.t)) { F.blockSaid = rt.t + 12; rt.say('源八', '待て！　本陣の前備えを崩さねば、口へは寄れぬ', 3); }
    if (!F.entered && (rt.G.lord || !F.stage || F.stage >= 4) && Math.hypot(p.x - HONJIN.x, p.z - HONJIN.z) < 14) {
      F.entered = true;
      F.enterT = rt.t;
      rt.objDone('honjin');
      rt.unmark('honjin');
      rt.unzone('honjin');
      rt.banner('今川本陣に突入！');
      rt.award((t) => { t.special = { label: '今川本陣突入', pts: 30 }; }, '今川本陣突入');
      rt.obj('crush', '旗本を崩し、味方を義元へ通せ', 'main');
      rt.marker('yoshimoto', unitPos(F.yoshimoto), '旗本の奥の義元', { red: true }); F.yoshimoto.allyOk = true;   // ここからは味方の兵も義元へ槍を付ける
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
    const done = F.yoshiDown || (F.entered && rt.pt > 110 && (hatamotoLeft <= 2 || rt.t - F.enterT > 120)) || rt.pt > (rt.G.lord ? 340 : 900);
    if (done && !F.victory) {
      F.victory = true;
      F.carried = 0;   // 義元を討った後の段でも、二度までは組頭が下げてくれる
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
      rt.say('源八', (F.entered || F.yoshiDown) && !rt.G.lord ? '義元を討ったぞ！　……じゃが、まだ槍を下ろすな' : '勝ったぞ！　勝鬨を上げよ！', 3);
      sfx('horagai', 0.8);
      for (const g of F.enemies) { g.noRout = false; g.morale = 0; }
      if (F.rescueEnemies) { F.rescueEnemies.noRout = false; F.rescueEnemies.morale = 0; }
      // 本陣の崩れが伝わり、谷と丘に休んでいた今川の隊も崩れて散る（奥の大軍は背を向けて退く）
      F.imaDA.forEach((m, i) => rt.after(2 + i * 1.5, () => (i === 0 ? m.retreat(40, 40) : m.rout({ hideAfter: 50 }))));
      // 本陣へ入る前に、自分の槍が義元に届いた（一番槍）：本陣に斬り込んだものとして勝ちへ進む。
      //   途中の段（depth）と段の任務は打ち切り、その敵は崩す（後から前の段へ戻らない）
      if (F.yoshiDown && !F.entered) {
        F.entered = true; F.enterT = rt.t;
        const D = F.dp;
        if (D && D.on) { D.on = false; D.done = null; for (const g of (D.cur && D.cur.groups) || []) if (g && g.count) { g.noRout = false; g.morale = 0; } D.cur = null; rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp'); }
        for (const k of ['st1', 'flankE', 'front', 'cut', 'honjin']) rt.unmark(k);
        rt.unzone('cut'); rt.unzone('honjin');
        rt.objRemove('st'); rt.objRemove('honjin');
        rt.obj('crush', '今川義元を討ち取れ', 'main');
      }
      if (F.entered) { rt.objDone('crush'); rt.tracker.main = true; if (!rt.tracker.c.heads) rt.grantTitle('noHead'); }
      else { rt.tracker.main = false; rt.objFail('honjin'); rt.say('源八', '……お主、どこにおった', 3); }
      if (F.rescue === 'active') { F.rescue = 'fail'; rt.objFail('rescue'); rt.unmark('maeno'); }
      // 足軽の筋では、義元を討った後にもう一段（引き返す今川勢）。信長で遊ぶ時と、本陣に入れなかった時はここで終わる
      if (!rt.G.lord && F.entered) rt.after(10, () => this.lastStand(rt));
      else rt.finish({}, 9);
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
    rt.obj('scout', '今川の物見を討て（正面から一対一）', 'side');
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

// 行軍や待ちを飛ばす（二度目以降の人が、同じ場面を待たされないように）
// 初陣で深手を負ったら、源八が組の後ろ（味方のいる側）へ引きずって下げる
okehazama.carryBack = (rt) => {
  const g = [rt.hostGroup, ...(rt.flags.cols || []), rt.flags.nob].find((x) => x && x.count);
  if (!g) return null;
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
    let c = Math.hypot(c0.x - HONJIN.x, c0.z - HONJIN.z) < 18 ? { x: HONJIN.x, z: HONJIN.z + 26 } : { x: c0.x, z: c0.z + 6 };
    // 囲まれていれば、まず敵の塊の反対へ抜ける
    let ex = 0, ez = 0, en = 0;
    b.army.forNear(u.pos.x, u.pos.z, 10, (o) => { if (o.alive && o.team === 1 && !o.fleeing) { ex += o.pos.x; ez += o.pos.z; en++; } });
    if (en >= 3) { ex = u.pos.x - ex / en; ez = u.pos.z - ez / en; const L = Math.hypot(ex, ez) || 1; c = { x: u.pos.x + (ex / L) * 12, z: u.pos.z + (ez / L) * 12 }; }
    goTo(p, inp, c.x, c.z, 2);
    const e = b.army.nearestEnemy(u, 3);
    inp.guardHold = !!e;
    return;
  }
  // 目の前の敵だけを突く（遠くの敵を追い回さない）。本陣へ入る前は道すがら、入った後は幔幕の内で
  //   （本陣に入る前は、幔幕の奥の旗本と義元には自分から当たらない：素直な遊び手は組と一緒に入るのを待つ）
  const e = b.army.nearestEnemy(u, F.entered ? 10 : 5, (o) => !o.noTarget && !o.fleeing && (F.entered || o.group !== F.hatamoto));
  if (e) {
    const d = dd(e.pos);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    return;
  }
  // 段ごとの的（先手・横槍・前備え・輿の行く手・引き返す今川勢）
  const stT = F.stage === 1 ? F.enemies.find((g) => g.count && !g.routed) : F.stage === 2.5 ? F.flankE : F.stage === 3 ? F.front : F.stage === 6 ? F.matsui : null;
  if (stT && stT.count && !stT.routed) { const q = stT.center(); goTo(p, inp, q.x, q.z, 3); return; }
  if (F.stage === 4.5 && F.cutPt && !F.entered) { goTo(p, inp, F.cutPt.x, F.cutPt.z, 2); return; }
  // 本陣へ：味方の組と一緒に寄せる（組より先へ出すぎない）
  const c = host.center();
  const tgt = F.entered ? HONJIN : Math.hypot(u.pos.x - HONJIN.x, u.pos.z - HONJIN.z) > Math.hypot(c.x - HONJIN.x, c.z - HONJIN.z) + 6 ? c : HONJIN;
  goTo(p, inp, tgt.x, tgt.z, F.entered ? 6 : 3);
};
okehazama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '今川軍', mon: 'imagawa' } };
okehazama.date = (rt) => `永禄三年五月十九日　${seasonOf('五月')}・${sky(rt)}`;

// 両軍の総勢（上の兵数）。討たれた兵一人を、遠くの大勢の損害に見立てる
// 桶狭間：織田 約三千、今川 約二万五千（数は諸説）。義元が討たれると本陣の者が崩れる
okehazama.force = (rt) => {
  const F = rt.flags;
  return { a: 2000 - (F.ak || 0) * 6, a0: 2000, b: 25000 - (F.ek || 0) * 30 - (F.victory ? 3000 : 0), b0: 25000 };
};

// 戦後に添える史実のメモ
okehazama.history = '史実の桶狭間では、豪雨の後に織田勢が今川本陣を急襲し、今川義元は毛利新介に討ち取られた。『信長公記』は、信長が「分捕りはせず、討ち捨てにせよ」と命じたと伝える。織田勢の数は『信長公記』に「二千に足らざる」とあり、この戦では二千とした（今川勢の数にも諸説ある）。義元に一番に槍をつけたのは服部小平太である。小平太は義元に膝を斬られ、続いた毛利新介が首を挙げた。義元は塗輿を捨てて退こうとしたところを討たれたという。戦った場所は、古くから「田楽狭間」と伝える説と、『信長公記』の「おけはざま山」に本陣があったとする説があり、今も定まっていない。';

// ---- 桶狭間 ----
function okeCtx(rt) {
  const F = rt.flags;
  return { faction: 'imagawa', flag: 'imagawa', dmg: 0.58, friends: () => F.cols.filter((g) => g.count), aid: { name: '織田の足軽組', list: [uS(1), uA(8)] }, aidSaid: '後ろから織田の足軽組が追いついた' };
}
// 先手を崩した後：立て直し → 畦の押し合い（西の林から横槍）→ 判断（林の鉄砲組を潰すか、本陣の前へ急ぐか）
function okeA() {
  return [
    DP.rest({ dur: 12, say: [['源八', '息を整えよ。……弥七、傷は浅いか'], ['弥七', 'かすり傷じゃ。まだ槍は振れる'], ['源八', '組を寄せよ。田の畦に今川の足軽が固まっておる。あれを抜かねば本陣へは寄れぬ']] }),
    DP.fight({ at: { x: -22, z: -78 }, title: '畦の押し合い', sub: '田の畦に、今川の足軽組が槍を揃える', obj: '畦の今川足軽組を押し崩せ（味方の組と並んで）',
      say: [['源八', '槍を揃えよ！　押せ、押せ！　畦から落とせ！']],
      foes: () => [{ name: '畦の今川足軽組', from: { x: -30, z: -104 }, list: [uS(1), uA(11)], formation: 'yari', noRout: 20 }],
      later: [{ t: 30, title: '横槍', sub: '西の林から今川の新手', say: ['弥七', '西の林から新手じゃ！　横を突かれるぞ！'], foes: () => [{ name: '西の林の新手', from: { x: -66, z: -64 }, list: [uS(1), uA(7)] }] },
        { t: 65, title: '押し返し', sub: '本陣の方から今川の足軽が駆け下りてくる', say: ['源八', '上からも来るぞ！　畦を渡らせるな！'], foes: () => [{ name: '駆け下りる今川勢', from: { x: 0, z: -110 }, list: [uS(1), uA(8)] }] }],
      reward: '畦の押し合いを制した' }),
    DP.pick({ title: '林の奥で鉄砲の音。今川の鉄砲組が、本陣へ向かう味方を撃っている。どうする？',
      pre: (rt) => rt.say('弥七', '林から鉄砲じゃ！　味方が撃たれておる！', 3),
      options: [{ label: '林へ回り、鉄砲組を潰す', note: '本陣の前で撃たれずに済む。本陣へは少し遅れる' }, { label: '構わず本陣の前へ急ぐ', note: '早く本陣の前へ着く。本陣の前備えに鉄砲が加わる' }],
      on: (rt, m, i) => { m.okeGuns = i === 0 ? 'raid' : 'left'; rt.say('源八', i === 0 ? 'よし、林へ回る。低く駆けよ！' : '……捨て置け。本陣の前へ急げ！', 3); } }),
    DP.fight({ skip: (rt, m) => m.okeGuns !== 'raid', at: { x: -54, z: -92 }, title: '林の鉄砲組', sub: '木の陰から撃つ今川の鉄砲', obj: '林の今川の鉄砲組を潰せ（込め直しの間に寄れ）',
      foes: () => [{ name: '林の鉄砲組', from: { x: -62, z: -100 }, list: [uS(1), uG(4), uA(5)], seek: 40 }],
      reward: '林の鉄砲組を潰した' }),
    DP.move({ skip: (rt, m) => m.okeGuns === 'raid', to: { x: 6, z: -90 }, obj: '本陣の前へ急げ', label: '本陣の前', r: 10,
      say: [['源八', '坂を駆け上がれ！　林の鉄砲は構うな！']],
      ambush: { t: 6, say: ['足軽', '道を塞がれた！　今川の足軽じゃ！'], foes: () => [{ name: '道を塞ぐ今川足軽', from: { x: 20, z: -100 }, list: [uA(6)] }] } }),
  ];
}
// 引き返す今川勢を退けた後：立て直し → 判断（北の谷へ追い討ちか、手負いを運ぶか）→ 判断（しんがりの場所）→ しんがり
function okeB() {
  return [
    DP.rest({ dur: 14, say: [['源八', 'よう戦うた。……皆、生きておるか'], ['足軽', (rt) => (rt.flags.yoheiSaved ? '与兵衛殿の組が、手負いを坂の下へ運んでおりまする' : '与兵衛殿の組は、半分も残っておらぬ……')], ['源八', '北の谷へ、今川の旗本の生き残りが逃げていく。殿の馬廻が追うておる']] }),
    DP.pick({ title: '北の谷へ逃げる今川の侍大将を、馬廻が追っている。どうする？',
      options: [{ label: '馬廻に続いて北の谷へ追い討ち', note: '侍大将を討てれば大手柄。谷は狭く、今川の後備えが待つ' }, { label: '本陣の跡に残り、手負いを運ぶ', note: '倒れた味方を坂の下へ運ぶ。手柄は小さいが、組が減らない' }],
      on: (rt, m, i) => { m.okeChase = i === 0; rt.say('源八', i === 0 ? 'よし、北の谷じゃ！　深入りはするな、侍大将だけを狙え' : 'よし、手負いを運ぶ。落ち武者に気をつけよ', 3); } }),
    DP.fight({ skip: (rt, m) => !m.okeChase, at: { x: 10, z: -148 }, title: '北の谷の追い討ち', sub: '谷の口で今川の後備えが槍を揃える', obj: '北の谷の今川の後備えを崩し、侍大将を討て',
      foes: () => [{ name: '今川の後備え', from: { x: 8, z: -172 }, list: [uS(2), uA(10)], formation: 'yari', noRout: 25 }],
      later: [{ t: 28, say: ['源八', '侍大将じゃ！　あれを討てば大手柄ぞ！'], foes: () => [{ name: '侍大将 蒲原氏徳の旗本', from: { x: -18, z: -168 }, list: [uBu('蒲原氏徳'), uS(2), uA(4)] }] }],
      reward: (t) => { t.special = { label: '北の谷の追い討ち', pts: 25 }; }, rewardLabel: '北の谷の追い討ち' }),
    DP.move({ skip: (rt, m) => m.okeChase, to: { x: -8, z: -58 }, obj: '手負いを坂の下（味方の陣）へ運べ', label: '坂の下の味方', r: 9,
      say: [['弥七', 'しっかりせい、坂の下までじゃ！']],
      ambush: { t: 10, title: '落ち武者', sub: '逃げ遅れた今川の者が、手負いを狙う', foes: () => [{ name: '今川の落ち武者', from: { x: -40, z: -80 }, list: [uS(1), uA(6)] }] },
      onEnd: (rt, m, ok) => { if (ok) rt.award((t) => t.side.push('手負いを運んだ'), '手負いを運んだ'); } }),
    DP.rest({ dur: 10, heal: 0.25, say: [['源八', '殿は清洲へ引き上げられる。我らの組は、殿（しんがり）の手に回る'], ['弥七', 'しんがり……一番最後に退く役か']] }),
    DP.pick({ title: '殿（信長）の本隊が引き上げる。しんがりをどこで受ける？',
      options: [{ label: '狭い谷の口で槍衾を組む', note: '少ない手で受けられる。敵は一度に来ない' }, { label: '開けた坂の下で、味方と並んで受ける', note: '味方の組と並べる。敵も広がって多く来る' }],
      on: (rt, m, i) => { m.okeRear = i; } }),
    // 持ち場まで駆ける（北の谷からは遠い）。道すがら、退く殿の本隊と、追いすがる今川の物見
    DP.move({ to: (rt, m) => (m.okeRear === 0 ? { x: -10, z: -40 } : { x: -24, z: 2 }), obj: 'しんがりの持ち場へ急げ', label: 'しんがりの持ち場', r: 14, max: 60,
      say: [['源八', '退く時に討たれる者が一番多い。持ち場へ急げ、気を抜くな'], ['弥七', '殿の本隊が坂を下っていく……わしらが最後か']],
      ambush: { t: 12, title: '追いすがる物見', sub: '今川の足軽が、退く織田勢の背をうかがう', say: ['足軽', '後ろから今川の者が付いてくる！'], if: (rt) => rt.player.u.pos.z < -70,
        foes: (rt) => { const p = rt.player.u.pos; return [{ name: '今川の物見の組', from: { x: p.x + 14, z: p.z - 26 }, list: [uA(5)], mass: 0 }]; } } }),
    DP.hold({ at: (rt, m) => (m.okeRear === 0 ? { x: -10, z: -40 } : { x: -24, z: 2 }), dur: 75, r: 12, title: 'しんがり', sub: '殿の本隊が退くまで、追いすがる今川勢を受けよ', label: 'しんがりの持ち場',
      obj: '殿の本隊が退くまで持ち場を守れ',
      say: [['源八', '槍を揃えよ！　ここを抜かれたら、殿の背を突かれるぞ！']],
      waves: (rt, m) => [
        { t: 6, say: ['足軽', '今川勢が追いすがってくる！'], foes: () => [{ name: '追いすがる今川勢', from: { x: 10, z: -96 }, list: [uS(1), uA(m.okeRear === 0 ? 7 : 10)] }] },
        { t: 45, say: ['弥七', '馬の音じゃ！　槍を低く構えよ！'], foes: () => [{ name: '今川の騎馬', from: { x: 44, z: -78 }, list: [uC(m.okeRear === 0 ? 2 : 4), uA(5)] }] },
        { t: 55, say: ['源八', 'これが最後の寄せじゃ！　踏みとどまれ！'], foes: () => [{ name: '今川の最後の寄せ', from: { x: -30, z: -100 }, list: [uS(1), uA(m.okeRear === 0 ? 6 : 9)] }] },
      ],
      reward: 'しんがりを務めた', lost: ['源八', '持ち場を離れおって……味方が撃たれたぞ'] }),
  ];
}

// 味方の鉄砲の一斉射：敵の組が鉄砲の前へ寄せた所で一度だけ「放て」。当たった組の士気を落とし、崩れやすくする
export function volleyAt(rt, key, guns, foes, o = {}) {
  const F = rt.flags; F.vol = F.vol || {};
  if (F.vol[key] || gone(guns)) return false;
  const gc = guns.center(), r = o.r || 32;
  const near = foes.filter((g) => !gone(g) && Math.hypot(g.center().x - gc.x, g.center().z - gc.z) < r);
  if (!near.length && !(o.until && rt.t > o.until)) return false;
  F.vol[key] = true;
  const hit = near.length ? near : foes.filter((g) => !gone(g));
  guns.order = 'attack'; guns.seekRange = r + 10;
  rt.say(o.who || '鉄砲頭', o.text || '引きつけたぞ。……放てえっ！', 3);
  rt.banner(o.title || '鉄砲、放て', o.sub || '味方の鉄砲が一斉に火を噴く');
  rt.army.play('volley', gc, 1.8);
  rt.after(0.5, () => rt.army.play('volley', gc, 1.2));
  for (const g of hit) { g.morale -= o.hit || 28; if (o.unpin) g.noRout = false; }
  rt.after(2.5, () => { if (o.then) rt.say(o.then[0], o.then[1], 3); });
  return true;
}

export { okehazama };
