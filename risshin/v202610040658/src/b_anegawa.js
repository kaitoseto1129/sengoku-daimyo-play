import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
import { HISTORICAL_GENERALS } from './b_historical_generals.js';
// ======================================================================
// 信長包囲網　姉川の戦い（元亀元年六月二十八日）
// 近江の姉川を挟んで、南に織田・徳川、北に浅井・朝倉。西の瀬では徳川が朝倉に、東では織田が浅井に当たる。
// 足軽は織田の備（森可成の手）の中に立つ。浅井の磯野員昌が川を渡って織田の段を次々に破って来る。
// ①幾重もの備を抜く磯野の先手を受ける ②東の回り込みを読み、先に備える ③横から押し返す ④川を渡って追う
// 向き：北が -z。川は x の向きに流れ、z ≒ 0。西（-x）が徳川と朝倉、東が織田と浅井
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, tawara, hut, dorui, kabukimon } from './props.js';
import { stoneTex } from './nature.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup as spawnAlly, centerOf } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { battleEvent, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { camp } from './b_mid.js';
import { demRelief } from './dem.js';
import { jinchiTick } from "./yasen_jinchi.js";
let aneDem = null;
import('./asset_dem_anegawa.js').then((m) => { aneDem = m.default; }).catch(() => {});

// 布陣図の座標を八分の一に縮め、両軍の本陣と西南の別手を地面の範囲に収める。川の原点と南北の向きはそのまま。
const ANE = [[-180, 8], [-120, -2], [-60, 5], [0, -1], [60, 4], [120, -3], [180, 5]];   // 姉川
const MORI = { x: -50 / 8, z: 570 / 8 };     // 森可成の備（自分の持ち場）
const HQ = { x: -100 / 8, z: 830 / 8 };     // 信長の本陣（陣杭の柳）
const DEM_RELIEF = { xy: 4, cx: 0, cz: 30, inner: 130, fade: 50, scale: 0.22, ax: 0.9 };
const BANK_N = -8;                 // これより北は向こう岸
const MITAMURA = { x: -860 / 8, z: -76 };   // 朝倉景健の本陣：三田村氏館（土塁・溝・屋敷・門の中世の館。天守にしない）

// 三田村氏館の溝（水堀）の輪：土塁のすぐ外を浅く掘り下げる。0〜1（1 が溝の底）
function mitamuraMoat(x, z) {
  const hw = 19.5, hd = 15.5, dx = Math.abs(x - MITAMURA.x), dz = Math.abs(z - MITAMURA.z);
  if (dx > hw + 2.5 || dz > hd + 2.5) return 0;
  const edge = Math.max(dx - hw, dz - hd);
  if (edge < -1) return 0;   // 土塁の内側
  return Math.max(0, 1 - Math.abs(edge) / 2.2);
}

// 三田村氏館：土塁の四辺＋門＋屋敷。溝（水堀）は周りの地形を少し掘り下げて見せる（height/tint で使う）
function mitamuraYakata(rt) {
  const W = rt.world;
  const cx = MITAMURA.x, cz = MITAMURA.z, hw = 17, hd = 13;
  const seg = [[cx - hw, cz - hd, cx + hw, cz - hd], [cx + hw, cz - hd, cx + hw, cz + hd], [cx + hw, cz + hd, cx - hw, cz + hd], [cx - hw, cz + hd, cx - hw, cz - hd]];
  const nrm = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  for (let i = 0; i < seg.length; i++) if (i !== 2) W.scene.add(dorui(W, seg[i], nrm[i][0], nrm[i][1], { w: 2.6, h: 1.1 }));   // 南辺は門の分あけておく
  for (const [ax, az, bx, bz] of [[cx - hw, cz + hd, cx - 3, cz + hd], [cx + 3, cz + hd, cx + hw, cz + hd]]) W.scene.add(dorui(W, [ax, az, bx, bz], 0, 1, { w: 2.6, h: 1.1 }));
  W.scene.add(kabukimon(W, cx, cz + hd, 5.2, 0));
  W.scene.add(hut(W, cx, cz - 2, 13, 9, Math.PI, { wall: 0x6a5a44 }));
  W.scene.add(hut(W, cx - 10, cz + 4, 6, 5, Math.PI * 0.5, { wall: 0x6a5a44 }));
}

// 浅井・朝倉の兵の見た目（家ごとに甲冑の色と旗を変える）
const AZAI = { armor: 0x2e2a26, lace: 0x3c5a48, flag: 'azai' };
const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const INABA = { flag: 'inaba', armor: 0x33302a, lace: 0x5a4a2a };   // 稲葉一鉄ら西美濃の衆は、もと斎藤の家臣
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || (!g.anePending && g.count === 0) || g.routed;
function cappedList(rt, list) {
  let room = 225; // 新手を出す時だけ数え、味方の追いつく分を空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.farSim && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
// 台本の新手は、開戦時から置いた控えの兵を同じ場所で本物に替える。
// カメラの裏へ動かさず、軽い兵から抜いた人数だけを出す。名前付きの将も重ねない。
function deploy(rt, team, o, list) {
  const F = rt.flags;
  const sources = {
    '磯野員昌の隊': F.jinIso, '浅井の二の手': F.jinMasazumi,
    '浅井の三の手': F.azDA?.[0], '東へ回る浅井の別手': F.jinFlank,
    '浅井のしんがり': F.jinShinjo, '柴田勝家の段': F.jinShiba,
    '稲葉一鉄の隊': F.jinInaba,
  };
  const source = sources[o.name];
  if (!source) return (team ? spawnEnemy : spawnAlly)(rt, { fixed: true, formation: 'yari', ...o }, cappedList(rt, list));
  const g = (team ? spawnEnemy : spawnAlly)(rt, { fixed: true, noGuard: true, fullStrength: true, formation: 'yari', ...o }, []);
  g.aneSource = source; g.anePending = true;
  source.real = g;
  const fill = () => {
    if (rt.over || F.ending) return;
    KIT.freeRoom(rt, list.reduce((v, q) => v + q.n, 0));
    const limited = cappedList(rt, list);
    const n = limited.reduce((v, q) => v + q.n, 0);
    // 空の隊を「撃退した」と数えない。枠が足りなければ控えのまま待つ。
    if (n < 8) { rt.after(1, fill); return; }
    // 中央から抜くと実兵が残りの控えに囲まれる。前の列から出し、控えは後ろに残す。
    const front = source.d / 2 + 12;
    const pts = source.m.take(source.x + Math.sin(o.facing) * front, source.z + Math.cos(o.facing) * front,
      n, 1e9, null, (x, z) => rt.world.walkable(x, z));
    if (!pts.length) { rt.after(1, fill); return; }
    const actual = [];
    let i = 0;
    for (const q of limited) for (let j = 0; j < q.n && i < pts.length; j++, i++) {
      const at = pts[i];
      actual.push({ type: q.type, n: 1, o: { ...q.o, x: at.x, z: at.z, heading: o.facing } });
    }
    rt.army.spawn(g, actual); g.anePending = false;
    if (o.name === '浅井のしんがり') F.rearAt = rt.t;
    g.leader = g.units.find((u) => u.type === 'busho' || u.name) || g.units.find((u) => u.type === 'samurai');
    g.historicalOrders = g.units.some((u) => u.name);
    if (o.name === '磯野員昌の隊') { F.isoU = g.leader; if (F.isoU) F.isoU.invuln = true; }
  };
  fill();
  // 備えの表も今の実兵を指す。軽い控えは同じ備えの残りとして留まる。
  for (const bound of Object.values(F.earlyJin || {})) if (bound?.source === source) bound.real = g;
  return g;
}
const enemyGroup = (rt, o, list) => deploy(rt, 1, o, list);
const allyGroup = (rt, o, list) => deploy(rt, 0, o, list);
const returnLine = (g) => { g.order = 'hold'; g.anchor.x = g.center().x; g.anchor.z = g.center().z; g.formation = 'yari'; };

// 川原の石（見た目だけ）：川の両岸の帯に、大小の丸い石を散らす
function kawara(W) {
  const parts = [];
  let s = 70;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 420; i++) {
    const x = -170 + R() * 340;
    let zc = 0;
    for (let k = 0; k < ANE.length - 1; k++) { const [ax, az] = ANE[k], [bx, bz] = ANE[k + 1]; if (x >= ax && x <= bx) zc = az + (bz - az) * (x - ax) / (bx - ax); }
    const z = zc + (R() < 0.5 ? -1 : 1) * (3.2 + R() * 7);
    const r = 0.12 + R() * R() * 0.45;
    // 角の立った十二面体のままだと、低い目線で近くに来た時に白い多面体の塊に見えた（10/2）。一段細かくして角を崩し、石の絵を貼る
    const g = new THREE.DodecahedronGeometry(r, 1);
    { const P = g.attributes.position, ph = R() * 50; for (let q = 0; q < P.count; q++) { const X = P.getX(q), Y = P.getY(q), Z = P.getZ(q); const h = Math.sin((X * 12.9898 + Y * 78.233 + Z * 37.719) / r + ph) * 43758.5453; const k = 0.84 + (h - Math.floor(h)) * 0.26; P.setXYZ(q, X * k, Y * k, Z * k); } }   // 同じ角は同じだけ（面の間に隙間を作らない）
    g.scale(1.2, 0.5, 1);
    g.rotateY(R() * 6);
    g.translate(x, W.heightAt(x, z) + r * 0.2, z);
    const c = new THREE.Color().setHSL(0.09, 0.08, 0.5 + R() * 0.25);
    const gg = g.toNonIndexed();
    const col = new Float32Array(gg.attributes.position.count * 3);
    for (let q = 0; q < col.length; q += 3) { col[q] = c.r; col[q + 1] = c.g; col[q + 2] = c.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(gg);
  }
  const geo = mergeGeometries(parts); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTex() }));
  m.receiveShadow = true;
  return m;
}

// 信長公記巻三の二正面。縦の段の将の順は後世の布陣図による復元で、十三段を確定しない。
// 東の野村＝織田と浅井、西の三田村＝徳川と朝倉。史料の兵数には大きな幅がある。
const ANEGAWA_JIN = [
  battleJin('縦に重ねる備え', 0, HQ, Math.PI, [
    ['agSakai', '一の段', '坂井政尚', 2000, 30 / 8, 160 / 8, 'sakai', 'oda'],
    ['agIkeda', '二の段', '池田恒興', 2000, 10 / 8, 260 / 8, 'ikeda', 'oda', 'ageha'],
    ['agShiba', '中の段', '柴田勝家', 3000, -30 / 8, 480 / 8, 'jinShiba', 'oda', 'kari'],
    ['agMori', '中の段', '森可成', 3000, MORI.x, MORI.z, 'mori', 'oda', 'tsuru'],
    ['agSaku', '後ろの段', '佐久間信盛', 3000, -80 / 8, 680 / 8, 'kino', 'oda'],
    ['agNobu', '本陣', '織田信長', 5000, HQ.x, HQ.z, 'hqCamp', 'eiraku', 'oda'],
    ['agYokoyama', '横山城の囲み', '木下藤吉郎・丹羽長秀・西美濃三人衆', 5000, 510 / 8, 1350 / 8, 'jinYokoyama', 'inaba'],
  ], '織田二万三千は遊びの目安。藤吉郎は横山城の囲み説を採り、川前の段には重ねない。'),
  battleJin('西の縦備え', 0, { x: -1030 / 8, z: 700 / 8 }, Math.PI, [
    ['agTKSakai', '先手', '酒井忠次', 1400, -960 / 8, 360 / 8, 'tk.0', 'tokugawa'],
    ['agOgasawara', '二の手', '小笠原長忠', 800, -970 / 8, 460 / 8, 'jinOgasawara', 'tokugawa'],
    ['agIshikawa', '三の手', '石川数正', 1000, -1000 / 8, 560 / 8, 'jinIshikawa', 'tokugawa'],
    ['agIeyasu', '本陣', '徳川家康', 1300, -1030 / 8, 700 / 8, 'tk.1', 'tokugawa'],
    ['agSakaki', '西南の別手', '榊原康政', 500, -1220 / 8, 790 / 8, 'sakaki', 'tokugawa'],
  ], '徳川三千とも五千とも。ここでは五千を各手に分けた目安。'),
  battleJin('浅井の縦備え', 1, { x: 150 / 8, z: -690 / 8 }, 0, [
    ['agIso', '先手', '磯野員昌', 1000, 80 / 8, -125 / 8, 'jinIso', 'azai'],
    ['agMasazumi', '二の手', '浅井政澄', 800, 90 / 8, -230 / 8, 'jinMasazumi', 'azai'],
    ['agAtsuji', '三の手', '阿閉貞征', 800, 120 / 8, -340 / 8, 'azDA.0', 'azai'],
    ['agShinjo', '四の手', '新庄直頼', 800, 120 / 8, -450 / 8, 'jinShinjo', 'azai'],
    ['agEndo', '五の手', '遠藤直経', 800, 140 / 8, -560 / 8, 'azDA.2', 'azai'],
    ['agNagamasa', '本陣', '浅井長政', 800, 150 / 8, -690 / 8, 'azDA.1', 'azai'],
  ], '浅井五千は信長公記の目安。段の将・割り振りは後世の伝えによる。'),
  battleJin('朝倉の縦備え', 1, MITAMURA, 0, [
    ['agKagenori', '先手', '名は伝わらない', 2500, -880 / 8, -16, 'jinKagenori', 'asakura'],
    ['agMaeba', '二の手', '前波新八郎', 2500, -880 / 8, -45, 'akDA.0', 'asakura'],
    ['agKagetake', '本陣', '朝倉景健', 3000, MITAMURA.x, MITAMURA.z, 'akDA.1', 'asakura'],
  ], '朝倉八千は信長公記の目安。三田村氏館と各手の配分は復元。'),
];

const anegawa = {
  jinkei: ANEGAWA_JIN,
  softOpen: 0,   // 開戦直後も傷を軽くしない
  phaseBanners: true,
  latestPhaseBanner: true,
  botOrders: true, // 持ち場と反撃の判断を、性格の突進・構え直しで上書きしない。
  spawn: { x: MORI.x, z: MORI.z + 5, heading: Math.PI },
  // 重さ対策（kaito 10/1、原因を測って直す）：姉川は西・中・東の三方で大軍がぶつかり、本物の兵（写実の人）が同時に一番増える戦。
  // wakeRoom で本物の兵の上限を少し控えめに、humQ で写実の人へ替える数の上限を少し控えめにする（近さ・質はそのまま。見た目は大きく変えない）
  wakeRoom: 150,
  humQ: { max: 56, mustMax: 72 },
  world: {
    seed: 70,
    wind: [0.6, -0.8],   // 南東からの夏の風
    time: 'day',
    mood: 'morning',     // 卯の刻（早朝）に始まった戦：川面に朝の靄
    mist: true,          // 初めの朝靄は、今ある仕組みでしだいに晴れる
    muddy: 0.2,
    waterSlow: true,   // 姉川を渡る間は遅く、馬は岸へ上がる時に弱る（terrain_tags.js の 'water'）
    paths: [[[HQ.x, HQ.z], [MORI.x, MORI.z], [-30 / 8, 480 / 8], [10 / 8, 260 / 8], [30 / 8, 160 / 8], [10, 4]], [[-1030 / 8, 700 / 8], [-1000 / 8, 560 / 8], [-960 / 8, 360 / 8], [-110, 4]]],
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.3 * Math.sin(z * 0.05 + x * 0.02);
      // 北の山並み（小谷山・大依山）と、南東の横山（横山城）、信長の陣杭の柳
      h += Math.max(0, -z - 115) * 0.3 + 26 * gauss(x, z, 70, -175, 1800) + 12 * gauss(x, z, -40, -150, 1600);
      h += 16 * gauss(x, z, 600 / 8, 1560 / 8, 1500) + 5 * gauss(x, z, HQ.x, HQ.z + 8, 900);
      // 三田村氏館の溝（水堀）：館の縁をひと回り、浅く掘り下げる
      const mr = mitamuraMoat(x, z); if (mr > 0) h -= 0.7 * mr;
      // 国土地理院の標高：戦場（清めた所）の外の遠い丘にだけ、実際の起伏を足す（ゲームの 1 を実の 4m に縮める）
      if (aneDem) h += demRelief(aneDem, x, z, DEM_RELIEF);
      return h;
    },
    tint(x, z, h, c) {
      // 川原の石と砂
      let d = Infinity;
      for (let i = 0; i < ANE.length - 1; i++) {
        const [ax, az] = ANE[i], [bx, bz] = ANE[i + 1];
        if (x >= ax && x <= bx) d = Math.abs(z - (az + (bz - az) * (x - ax) / (bx - ax)));
      }
      if (d < 11) { const k = 1 - d / 11; c.setRGB(c.r * (1 - 0.5 * k) + 0.28 * k, c.g * (1 - 0.5 * k) + 0.26 * k, c.b * (1 - 0.5 * k) + 0.22 * k); }
      // 三田村氏館の溝：水を張った暗い色に
      const mr = mitamuraMoat(x, z); if (mr > 0.3) c.setRGB(c.r * 0.3, c.g * 0.32, c.b * 0.3);
    },
    clear: (x, z) => x > -170 && x < 100 && z > -110 && z < 120,
    fieldStage: 'growing',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 50 || z > 128 || x < -30 || x > 100) return 0;
      if (Math.abs(x - 30) < 5) return 0;
      if ((Math.floor(x / 12) + Math.floor(z / 15)) % 3 === 0) return 0;
      const ex = Math.min(((x % 12) + 12) % 12, 12 - ((x % 12) + 12) % 12), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    // 浅瀬の位置と深さは遊び用の復元。史実の測量値ではない。
    riverCross: true,
    streams: [{ pts: ANE, w: 9, depth: 1.7, fords: [{ x: -120, w: 24 }, { x: 0, w: 25 }, { x: 100, w: 20 }] }],   // 川は飾りでない：開戦の視界にも見える幅（A080）
    trees: 230,   // 重さ対策：姉川は大軍の描く数が多いので、木は控えめに（kaito 10/1）
    tufts: 2600,
    treeDensity: (x, z) => (z < -80 || z > 130 || Math.abs(x) > 120 ? 1 : 0.25),
    groves: [{ x: -60, z: 60, r: 12, n: 18 }, { x: 90, z: 40, r: 12, n: 16 }, { x: -30, z: -60, r: 14, n: 22 }, { x: 80, z: -50, r: 12, n: 18 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 総大将として遊ぶ時も、この戦の本陣から始める。
    if (rt.G.lord) { rt.player.u.pos.set(HQ.x, W.heightAt(HQ.x, HQ.z), HQ.z); rt.player.u.heading = Math.PI; rt.player.yaw = Math.PI; }
    // 信長公記巻三は渡河・押し合い・追撃を記す。磯野の突破、段の並び、個別の横槍と別手の進路は遊びの補い。
    F.hist = { river: 'HIST_A', honjinOda: 'HIST_A', honjinAsai: 'HIST_A', mitamura: 'HIST_B', isoAttack: 'GAME_C', tokugawaFlank: 'GAME_C', inabaFlank: 'GAME_C', quietFlank: 'GAME_C', gravel: 'GAME_C', linkedFronts: 'GAME_C' };
    F.step = 0; F.breach = 0; F.holdAt = { ...MORI };
    // 全軍の数や敵の傷は、持ち場の足軽には分からない。
    // ---- 味方：織田の段。前に坂井政尚の一段、その後ろに森可成の備（自分の持ち場） ----
    F.sakai = allyGroup(rt, { faction: 'oda', name: '坂井政尚の段', anchor: { x: 30 / 8, z: 160 / 8 }, facing: Math.PI, width: 14, aggro: 7, morale: 70, dmgMult: 1, fleeDir: { x: 0.1, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '坂井政尚', invuln: true, hat: 'kabuto_m', haori: 0x3a3a44 } }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }]);
    const mori = allyGroup(rt, { faction: 'oda', name: '森可成の備', anchor: { ...MORI }, facing: Math.PI, width: 16, aggro: 7, noRout: false, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2e2e38 } }, { type: 'ashigaru', n: 13 }]);
    F.mori = mori; F.moriU = mori.units[0]; F.mori0 = mori.count;
    mori.defMult = 1; mori.dmgMult = 1;
    // 段は縦に重ねる：坂井 → 池田 → 柴田 → 森（磯野が一段ずつ破って来る）
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田恒興の段', anchor: { x: 10 / 8, z: 260 / 8 }, facing: Math.PI, width: 12, aggro: 7, morale: 80, formation: 'yari', order: 'hold', fleeDir: { x: -0.3, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '池田恒興', invuln: true, hat: 'kabuto_m', haori: 0x4a2a22 } }, { type: 'ashigaru', n: 9 }]);
    F.ikeda.defMult = 1; F.ikeda.dmgMult = 1;
    // 木下藤吉郎は横山城の押さえに回っている（城下の話と同じ）。森の備の後ろは佐久間信盛の段
    F.kino = allyGroup(rt, { faction: 'oda', name: '佐久間信盛の段', anchor: { x: -80 / 8, z: 680 / 8 }, facing: Math.PI, width: 12, aggro: 7, noRout: false, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 2 }]);
    F.kino.defMult = 1; F.kino.dmgMult = 1;
    // 森の備の鉄砲（元亀のころは数が少ない）：磯野が川の中ほどまで来たら一斉に放つ（kaito 0929）
    F.guns = [allyGroup(rt, { faction: 'oda', name: '森の備の鉄砲', anchor: { x: MORI.x + 16, z: MORI.z + 4 }, facing: Math.PI, width: 10, spacing: 1.6, aggro: 30, noRout: false, holdFire: true, dmgMult: 1 },
      [{ type: 'gun', n: 6 }])];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MORI.x + 3, z: MORI.z + 5 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗 ----
    // 信長の本陣（陣杭の柳）：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.hqCamp = camp(rt, { x: HQ.x, z: HQ.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 220, runTo: { x: MORI.x, z: MORI.z + 20 } });
    rt.marker('campExit', rt.G.lord ? { x: HQ.x, z: HQ.z + 10 } : { x: MORI.x + 22, z: MORI.z + 5 }, rt.G.lord ? '本陣の幕の口・ここから回って北へ' : '備えの右の脇・ここから川へ', { h: 2 });
    F.hqCamp.guard.anchor.z = HQ.z - 14;
    for (const u of F.hqCamp.guard.units) { u.pos.z -= 25; u.pos.y = W.heightAt(u.pos.x, u.pos.z); }
    rt.scene.add(nobori(W, HQ.x - 12, HQ.z + 4, 'eiraku', 7));
    for (const [x, z] of [[8, 38], [34, 38], [-14, 36], [56, 36], [16, 18], [28, 18]]) rt.scene.add(nobori(W, x, z, z < 25 ? 'oda' : (x > 40 ? 'eiraku' : 'oda'), 5));
    rt.scene.add(tawara(W, 30, 60, 0.3, 5), hut(W, 60, 96, 7, 5, 0.2));
    // 向こう岸の浅井の旗
    for (const [x, z] of [[4, -30], [26, -34], [44, -28], [60, -40]]) rt.scene.add(nobori(W, x, z, 'azai', 5.5));
    for (const [x, z] of [[-98, -18], [-112, -22], [-126, -18]]) rt.scene.add(nobori(W, x, z, 'asakura', 5.5));
    mitamuraYakata(rt);
    for (const [x, z] of [[MITAMURA.x - 18, MITAMURA.z - 2], [MITAMURA.x + 20, MITAMURA.z + 10]]) rt.scene.add(nobori(W, x, z, 'asakura', 5));
    // 遠景の村（川の南の田の中）
    KIT.farVillage(rt, -80, 112, { rot: Math.PI, n: 6, fields: 10, seed: 41 });

    // ---- 大軍（軽い作り）：織田の縦備え、徳川は西の瀬、北に浅井と朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      // 縦の備えはすでに並べてある。自動の後詰めを足すと次の段の実兵に重なる。
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, seed, kind, host: false });
      return { m, x0: x, z0: z, x, z, d };
    };
    const OD = 0x2b3140, TK = 0x24221f;
    // 柴田の段を池田と森の間へ置く。匿名の七列を足さず、縦の備えの間を空ける。
    F.jinShiba = DA(-30 / 8, 480 / 8, 20, 14, 75, Math.PI, OD, 'oda', 11, 'spear');
    F.jinShiba.m.army.noWake = true;
    F.odaLayers = [F.jinShiba];
    // 森の備の後ろの控え（本物の組はその前にいる）。
    DA(MORI.x, MORI.z + 16, 22, 12, 60, Math.PI, 0x2e2a26, 'oda', 19, 'spear');
    // 川原の石：川の両岸に丸い石が出ている
    rt.scene.add(kawara(W));
    // 地名の目印：野村（織田と浅井が当たる東の岸）・三田村（朝倉の本陣の館）
    rt.marker('nomura', { x: 58, z: -30 }, '野村', { h: 3 });
    rt.marker('mitamura', { x: MITAMURA.x, z: MITAMURA.z - 14 }, '三田村', { h: 5 });
    // 横山城を囲む織田の兵
    F.jinYokoyama = DA(510 / 8, 1350 / 8, 30, 10, 100, 0.9, OD, 'inaba', 21, 'spear');
    // 徳川：西の瀬で朝倉と向き合う。奥に家康の本陣
    F.tk = [DA(-960 / 8, 360 / 8, 40, 16, 160, Math.PI, TK, 'tokugawa', 31, 'mixed'), camp(rt, { x: -1030 / 8, z: 700 / 8, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 200, runTo: { x: -960 / 8, z: 360 / 8 } })];
    F.tk[1].guard.anchor.z = 700 / 8 - 14;
    for (const u of F.tk[1].guard.units) { u.pos.z -= 25; u.pos.y = W.heightAt(u.pos.x, u.pos.z); }
    F.jinOgasawara = DA(-970 / 8, 460 / 8, 18, 6, 60, Math.PI, TK, 'tokugawa', 34, 'spear');
    F.jinIshikawa = DA(-1000 / 8, 560 / 8, 18, 6, 60, Math.PI, TK, 'tokugawa', 35, 'spear');
    for (const q of [F.jinOgasawara, F.jinIshikawa]) q.m.army.noWake = true;
    // 榊原康政の別手（のちに朝倉の横を突く）：家康の西南から北の瀬へ向いて控える
    F.sakaki = DA(-1220 / 8, 790 / 8, 18, 16, 50, Math.PI, TK, 'tokugawa', 33, 'cavalry');
    // 朝倉：西の対岸、浅井：北の対岸と大依山（長政の本陣）
    F.akDA = [DA(-880 / 8, -45, 36, 14, 125, 0, ASAKURA.armor, 'asakura', 41, 'mixed'), DA(MITAMURA.x, MITAMURA.z, 30, 20, 110, 0, ASAKURA.armor, 'asakura', 42, 'honjin')];
    F.akDA[1].m.army.lord = '朝倉景健';   // 本陣へ寄れば旗本が迎え撃つ（b_nagashinojo.js の wake）
    F.azDA = [DA(120 / 8, -340 / 8, 50, 16, 160, 0, AZAI.armor, 'azai', 51, 'spear'), DA(150 / 8, -690 / 8, 30, 24, 125, 0, AZAI.armor, 'azai', 52, 'honjin'), DA(140 / 8, -560 / 8, 30, 14, 100, 0, AZAI.armor, 'azai', 53, 'cavalry')]
    F.azDA[1].m.army.lord = '浅井長政';
    // 前の各備が本陣を守る。重複する九百人の固定層は置かない。
    // 浅井の縦列は、川に近い磯野から長政へ。朝倉の先手は西の瀬に分ける。
    F.jinIso = DA(80 / 8, -125 / 8, 16, 10, 40, 0, AZAI.armor, 'azai', 54, 'spear');
    F.jinMasazumi = DA(90 / 8, -230 / 8, 16, 10, 40, 0, AZAI.armor, 'azai', 55, 'spear');
    F.jinShinjo = DA(120 / 8, -450 / 8, 16, 10, 40, 0, AZAI.armor, 'azai', 56, 'spear');
    F.jinKagenori = DA(-880 / 8, -16, 20, 10, 50, 0, ASAKURA.armor, 'asakura', 43, 'spear');
    F.jinFlank = DA(108, -24, 12, 10, 24, 0, AZAI.armor, 'azai', 57, 'spear');
    F.jinInaba = DA(120 / 8, 1260 / 8, 16, 12, 30, Math.PI, OD, 'inaba', 58, 'spear');
    F.jinFlank.m.army.team = 1; F.jinInaba.m.army.team = 0;
    F.jinFlank.m.army.noWake = true; F.jinInaba.m.army.noWake = true;
    F.azDA[0].m.army.noWake = true; F.jinShiba.m.army.team = 0;
    F.jinAzai = [F.jinIso, F.jinMasazumi, F.jinShinjo];
    for (const q of [...F.jinAzai, F.jinKagenori]) q.m.army.noWake = true;
    // ---- 大軍どうしの合戦（軽い作り・world.addClash）：川の中で組み合う。西の瀬は徳川と朝倉、森の備の左右は織田と浅井 ----
    // 織田と浅井の前線の、森の備に近い端は、本物の兵の押し引きにつながる（link）
    const side = (flag, armor, count, team, faction, x = {}) => ({ flag, armor, count, team, faction, ...x });
    const front = { x: 0, z: 0 };
    let frontT = -1, frontValid = false;
    const realFront = () => {
      // 左右の前線から同じコマに呼ばれるので、隊の中心は一度だけ拾う。
      if (frontT === rt.world.time) return frontValid ? front : null;
      frontT = rt.world.time; frontValid = false;
      if (F.step !== 1 || !F.mori.count) return null;
      const e = !gone(F.iso) ? F.iso : !gone(F.third) ? F.third : !gone(F.second) ? F.second : null;
      if (!e) return null;
      const c = e.center(); front.x = c.x; front.z = (c.z + F.mori.center().z) / 2;
      frontValid = true;
      return front;
    };
    // 両軍とも同じ割合で近くの兵を本物へ替える。
    const WK = { allyWake: 1, foeWake: 1 };
    F.clash = [
      // 正面いっぱい（西の瀬の -158 から東の 120 まで。森の備の前の -12〜60 だけは本物の兵が受け持つ）
      // 三つの合戦がいつも同時に見えて重いので、描く数（count）は史実の総勢（force）とは別に2〜3割落とす（迫力の並びはそのまま）
      clash(rt, { x: -115, z: 2, facing: Math.PI, w: 76, gap0: 30, seed: 181, noRout: false, ...WK, A: side('tokugawa', TK, 240, 0, 'tokugawa', { guns: true }), B: side('asakura', ASAKURA.armor, 250, 1, 'saito', { bows: true }) }),
      clash(rt, { x: -44, z: 3, facing: Math.PI, w: 64, gap0: 26, seed: 182, noRout: false, ...WK, A: side('oda', OD, 240, 0, 'oda'), B: side('azai', AZAI.armor, 180, 1, 'saito'), link: realFront }),
      clash(rt, { x: 90, z: 3, facing: Math.PI, w: 60, gap0: 26, seed: 183, noRout: false, ...WK, A: side('oda', OD, 260, 0, 'oda', { guns: true }), B: side('azai', AZAI.armor, 180, 1, 'saito'), link: realFront }),
    ];

    buildBattleJin(rt);
    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ' : ((rt.G.rank || 0) >= 3 ? '森の備の先手の一手を預かり、浅井の寄せを受け止めよ' : '森可成の備に立ち、浅井の寄せを受け止めよ'), 'main');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで姉川を渡るな', 'order');
    rt.obj('mori', '森の備の兵を半分より多く残し、槍の列を保て', 'side');
    // 信長で遊ぶ時：本陣の前で、家臣の言上を聞く
    if (rt.G.lord) {
      rt.say('森可成', '殿、川向こうの旗が浅井、西の瀬の向こうが朝倉にございます', 4);
      rt.say('森可成', '徳川殿は西の瀬で朝倉に当たられます。浅井は我ら織田の段が受けまする', 4);
      rt.say('織田信長', '段を幾重破られようと、本陣は退かぬ。崩れた所へ旗本を回せ', 4);
      F.farT = 0;
      rt.after(18, () => this.charge(rt));
      return;
    }
    rt.say('組頭', '夜が明けたぞ。川向こうの旗が浅井、西の瀬の向こうが朝倉じゃ', 4.5);
    rt.say('森可成', '徳川殿は西の瀬で朝倉に当たる。我ら織田は、この川で浅井を受ける', 4.5);
    rt.say('組頭', '森殿の備の中に立て。抜けた敵をここで止めよ', 5);
    rt.after(3, () => { if (!F.ending && F.step < 2) rt.bark('下知まで川を渡るな。渡る時は浅い瀬へ'); });
    rt.after(7, () => rt.say('森可成', '前の段が抜かれたら、後ろの段へ槍を揃え直せ。東の瀬にも気を配れ', 4.5));
    F.farT = 0;
    // 磯野の渡河まで（出会うまでが長すぎるとの声で、少し早めた分、太鼓・喊声・遠くの合戦は濃く残す）
    rt.after(11, () => this.charge(rt));
  },

  // ① 磯野員昌の突撃：川を渡り、坂井の段を破って森の備へ
  charge(rt) {
    const F = rt.flags;
    if (F.step >= 1 || rt.over || F.ending) return;
    F.step = 1; F.stepT = rt.t;
    rt.unmark('campExit');
    rt.setPhase('charge');
    sfx('taiko', 1);
    rt.army.play('eshout', { x: 20, z: -20 }, 2);
    rt.banner('浅井勢、姉川を渡る', '磯野員昌の突撃');
    rt.say('足軽', '浅井が川へ入ったぞ！　先頭は磯野の旗じゃ！', 3);
    const g = enemyGroup(rt, { faction: 'saito', name: '磯野員昌の隊', anchor: { x: 80 / 8, z: -125 / 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 12, width: 16, morale: 100, noRout: false, speed: 3.0, dmgMult: 1 },
      dress([{ type: 'busho', n: 1, o: { name: '磯野員昌', horse: true, hat: 'kabuto_r', haori: 0x4a3a22 } }, { type: 'cavalry', n: 7 }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }], AZAI));
    F.iso = g; F.isoU = g.units[0];
    // 磯野の後ろに浅井の騎馬と足軽が続き、対岸の先の備も川べりへ押し出す
    // 西の瀬でも、森の備の左右でも、大軍どうしが川へ入って組み合う
    F.clash.forEach((c, i) => rt.after(i * 4, () => c.go()));
    if (F.isoU) { F.isoU.invuln = true; F.isoU.announced = false; }   // 磯野はこの戦を生き延びて佐和山へ退いた
    g.order = 'move'; g.dest = { x: 20, z: 4 };   // 味方の列に頭から突っ込まないよう、手前の岸で止める（A078）
    g.onArrive = (gg) => {
      gg.order = 'attack'; gg.seekRange = 34; gg.aggro = 16;
      // 渡河した先手が、前の段へ取り付く。
      if (F.isoU?.alive && !F.isoU.announced) {
        F.isoU.announced = true; F.isoU.cheer = 1.5;
        rt.army.play('eshout', F.isoU.pos, 1.6);
        rt.banner('浅井の先手、岸へ上がる', '前の段が押されている');
        rt.say('森可成', F.sakai.routed || F.sakai.count < 6 ? '坂井殿の段がもう抜かれたか……！　池田殿の段の後ろで槍を揃えよ！' : '坂井殿の段が押されておる……！　槍を揃えよ、抜けてきた者はここで止める！', 3.5);
      }
    };
    rt.marker('iso', centerOf(g), '浅井の先手', { red: true, group: g });
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ（磯野員昌の突撃）' : '磯野員昌の突撃を受け止めよ', 'main');
    // 二の手：少し遅れて、東の瀬から（出会うまでが長すぎるとの声で、こちらも間合いを詰めた）
    rt.after(14, () => {
      if (F.step !== 1 || rt.over || F.ending) return;
      const g2 = enemyGroup(rt, { faction: 'saito', name: '浅井の二の手', anchor: { x: 90 / 8, z: -230 / 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 10, width: 14, morale: 90, speed: 3.8 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 17 }, { type: 'gun', n: 5 }], AZAI));
      g2.dmgMult = 1;
      g2.order = 'path'; g2.path = [[10, -14], [10, 14], [40, 18]]; g2.pathIdx = 0;
      g2.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; };
      F.second = g2;
      rt.say('足軽', '東の瀬からも来るぞ！', 2.5);
    });
    // 大声を上げず、東の浅瀬から後ろへ回る別手。正面の突破と同時に進む。
    rt.after(28, () => this.flank(rt));
    // 後ろの段（柴田勝家）が前へ詰めてくる
    rt.after(62, () => this.shibata(rt));
    // 徳川の横槍・稲葉の横槍
    rt.after(130, () => this.tokugawa(rt));
  },

  shibata(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.shibata || F.ending || rt.over) return;
    const g = allyGroup(rt, { faction: 'oda', name: '柴田勝家の段', anchor: { x: -30 / 8, z: 480 / 8 }, facing: Math.PI, width: 14, aggro: 9, noRout: false, speed: 2.8 },
      [{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_b', haori: 0x3a2a1c } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
    g.defMult = 1; g.dmgMult = 1;
    g.order = 'move'; g.dest = { x: MORI.x, z: F.holdAt.z - 12 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: MORI.x, z: F.holdAt.z - 12 }; gg.aggro = 12; };
    F.shibata = g;
    rt.say('伝令', '柴田勝家殿の段が前へ詰めまする！　持ちこたえよとの仰せ！', 3.5);
  },

  // 正面の圧力が続く時だけ段が抜かれる。早く敵を減らせば、深く入られる前に止められる。
  breakthrough(rt) {
    const F = rt.flags, g = F.iso;
    if (gone(g) || g.count <= 8 || F.breach >= 3 || F.inaba) return;
    const c = g.center(), elapsed = rt.t - F.stepT;
    const z = F.breach === 0 ? 13 : F.breach === 1 ? 26 : MORI.z - 5;
    const wait = F.breach === 0 ? 22 : F.breach === 1 ? 38 : 56;
    if (c.z < z || elapsed < wait) return;
    const row = F.breach === 0 ? F.sakai : F.breach === 1 ? F.ikeda : (F.shibata || { count: 75, routed: false });
    if (row && !gone(row) && row.count > 3) return;
    F.breach++;
    if (F.breach < 3) {
      g.order = 'move'; g.dest = { x: MORI.x, z: F.breach === 1 ? 260 / 8 : MORI.z + 4 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
      rt.bark(F.breach === 1 ? '前の段が破られた。磯野の先手が、さらに奥へ' : '次の段も破られた。磯野の先手が、さらに奥へ', true);
    } else {
      // 本物の兵を増やさず、後ろの軽い二段も押し下げて、深い入り込みを見せる。
      for (const q of F.odaLayers) q.m.retreat(34, 12);
      F.holdAt.z = MORI.z + 20;
      for (const q of [F.mori, F.guns[0], F.shibata]) if (q && !gone(q)) {
        q.order = 'move'; q.dest = { x: q.anchor.x, z: q === F.guns[0] ? F.holdAt.z + 6 : F.holdAt.z };
        q.onArrive = (r) => { r.order = 'hold'; r.facing = Math.PI; r.aggro = 12; };
      }
      for (const q of [F.second, F.third]) if (q && !gone(q)) { q.order = 'attack'; q.seekRange = 75; }
      g.order = 'move'; g.dest = { x: MORI.x, z: F.holdAt.z - 13 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
      rt.banner('後ろの段まで押し込まれた', '本陣の手前で、槍の列を揃え直せ');
      rt.obj('main', '後ろの段で磯野の先手を受け止めよ', 'main');
      rt.marker('stop', F.holdAt, '槍を揃える所');
    }
  },

  flank(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.flankG || F.ending || rt.over) return;
    const g = enemyGroup(rt, { faction: 'saito', name: '東へ回る浅井の別手', anchor: { x: 108, z: -16 }, facing: 0, width: 8, aggro: 2, morale: 85, speed: 2.2, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AZAI));
    F.flankG = g;
    rt.objRemove('mori');
    rt.obj('flank', '東から後ろへ回る浅井の別手を止めよ', 'side');
    g.order = 'path'; g.path = [[108, 16], [96, 70], [60, 96]]; g.pathIdx = 0;
    g.onArrive = (q) => {
      q.order = 'attack'; q.seekRange = 32;
      if (!F.flankDone) {
        F.flankDone = true; rt.objFail('flank'); rt.unmark('flank'); rt.unmark('eastPost');
        rt.obj('mori', '森の備の兵を半分より多く残し、槍の列を保て', 'side');
        F.mori.morale = Math.max(25, F.mori.morale - 15);
        rt.say('伝令', '東の別手が背後へ！　鉄砲組を守られよ！', 3);
      }
    };
    rt.say('伝令', '東の浅瀬に浅井の旗！　横へ回る構えにござる', 3);
    // 味方が崩れてからの救出でなく、進路を読んで先に一手を置く判断。
    rt.choose('正面が押される中、東の旗が横へ動く。どう備える？', [
      { label: rt.G.lord ? '佐久間の一手を東へ回す' : '組頭に知らせ、東の持ち場へ回る', note: '東の浅瀬の出口を守る。正面は味方の備に任せる' },
      { label: '正面の槍の列に残る', note: '組頭に東の旗を知らせ、正面の敵を受ける' },
    ], (i) => {
      if (F.step !== 1 || F.flankDone) return;
      F.flankPick = i;
      if (i === 0) {
        const q = rt.G.lord ? F.kino : rt.squadGroups?.[0];
        if (q && !gone(q)) {
          q.order = 'move'; q.dest = { x: 92, z: 70 };
          q.onArrive = (r) => { returnLine(r); r.facing = Math.PI; r.aggro = 18; };
        }
        rt.marker('eastPost', { x: 92, z: 70 }, '東の持ち場');
        if (!rt.G.lord) rt.say('組頭', 'よし、東の瀬の出口を守れ。深みへ入るな！', 3);
      }
      rt.marker('flank', centerOf(g), '後ろへ回る浅井の別手', { red: true, group: g });
    }, 12);
  },

  // ② 西の瀬で徳川が朝倉を破り、稲葉一鉄が浅井の横腹を突く
  tokugawa(rt) {
    const F = rt.flags;
    if (F.tkDone || F.ending || rt.over) return;
    F.tkDone = true;
    sfx('horagai', 0.7);
    rt.banner('西の別手が動く', '榊原康政の手が浅瀬へ');
    rt.say('伝令', '西からの知らせ！　榊原康政殿の別手が、朝倉の横へ向かいまする！', 4);
    F.sakakiGo = rt.t;
    // 最初からある別手が浅瀬を渡り、西へ回る。横槍の騎馬を別に湧かせない。
    F.sakaki.m.moveTo(-120, 14, 36);
    rt.after(36, () => { if (!rt.over) F.sakaki.m.moveTo(-120, -16, 14); });
    rt.after(50, () => { if (!rt.over) F.sakaki.m.moveTo(-144, -32, 12); });
    rt.after(62, () => {
      if (rt.over || F.ending) return;
      F.clash[0].shake('B', 20); F.clash[0].push('A', 0.25);
    });
    // 浅井は朝倉の崩れを見る前に、残る旗本を押し出す（三の手）
    rt.after(4, () => {
      if (F.step !== 1 || rt.over || F.ending) return;
      const g3 = enemyGroup(rt, { faction: 'saito', name: '浅井の三の手', anchor: { x: 120 / 8, z: -340 / 8 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 12, width: 16, morale: 95, noRout: false, speed: 2.9 },
        dress([{ type: 'samurai', n: 5 }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], AZAI));
      g3.dmgMult = 1;
      g3.order = 'path'; g3.path = [[10, -14], [10, 14], [26, F.holdAt.z - 14]]; g3.pathIdx = 0;
      g3.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; };
      F.third = g3;
      sfx('taiko', 0.9);
      rt.say('足軽', '川向こうから浅井の新手じゃ！', 3);
      rt.obj('main', '浅井の新手を受け止めよ', 'main');
      rt.marker('third', centerOf(g3), '浅井の新手', { red: true, group: g3 });
    });
    rt.after(24, () => { if (F.westBroken) this.inaba(rt); });
  },
  inaba(rt) {
    const F = rt.flags;
    if (F.inaba || F.step !== 1 || !F.westBroken || rt.over) return;
    const tg = [F.third, F.iso, F.second].find((e) => e && e.count);
    const c = tg ? tg.center() : { x: 20, z: 20 };
    const g = allyGroup(rt, { faction: 'saito', name: '稲葉一鉄の隊', anchor: { x: 120 / 8, z: 1260 / 8 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: false, speed: 3.2 },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉一鉄', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x3a3022 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }], INABA));
    g.order = 'path'; g.path = [[96, 70], [96, 26], [c.x + 10, c.z]]; g.pathIdx = 0;
    g.onArrive = (gg) => {
      gg.order = 'attack'; gg.seekRange = 50; F.inabaT = rt.t;
      rt.say('組頭', '東の味方が取り付いた！　槍を揃え、押せ！', 3);
      for (const e of [F.iso, F.second, F.third]) if (e && !gone(e)) e.morale = Math.max(0, e.morale - 12);
      F.clash[2].push('A', 0.25);
      for (let i = 1; i < F.clash.length; i++) F.clash[i].shake('B', 15);
    };
    F.inaba = g;
    battleEvent(rt, EVENT_REINFORCEMENT, c, g, 0, true, '横山の囲みから稲葉の手が向かう');
    sfx('taiko', 1);
    rt.banner('東から味方の旗', '稲葉の手が、浅井の横へ進む');
    rt.say('森可成', '稲葉殿が東へ回る。取り付くまで列を保て！', 3.5);
    // 横を突かれて浅井は揺らぐ（稲葉が取り付いたら崩れうる）
  },

  // ③ 浅井が崩れた：川を渡って追い落とす
  counter(rt) {
    const F = rt.flags;
    if (F.step >= 2 || rt.over || F.ending) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('counter');
    rt.unmark('iso'); rt.unmark('third'); rt.unmark('stop'); rt.unmark('eastPost'); rt.unmark('hqGuard');
    if (F.flankG && !F.flankDone) {
      F.flankDone = true; rt.objFail('flank'); rt.unmark('flank'); rt.unmark('eastPost');
      // 未撃退の別手は、追撃開始だけでは消さない。
    }
    rt.objDone('main');
    rt.award((t) => t.side.push('浅井の寄せを受け止めた'), '浅井の寄せを受け止めた');
    if (!F.mori.routed && F.mori.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget ? 1 : 0), 0) > F.mori0 / 2) { rt.objDone('mori'); rt.award((t) => t.side.push('森の備を保った'), '副任務：森の備を保った'); } else rt.objFail('mori');
    if (!F.crossed && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    sfx('horagai', 1);
    // 朝から戦い続け、日は高く昇った
    rt.world.setTime('afternoon');
    rt.banner('浅井勢、崩れる', '姉川を渡り、追い落とせ');
    battleEvent(rt, EVENT_RETREAT, { x: 24, z: -36 }, F.iso, 1, true, '浅井が川向こうへ退き始めた');
    rt.say('森可成', '浅井が退く！　川を渡り、向こう岸のしんがりを崩せ！', 4.5);
    rt.obj('pursue', '姉川を渡り、向こう岸で踏みとどまる浅井の殿（しんがり）を崩せ', 'main');
    rt.marker('ford', { x: 10, z: 4 }, '森の備が渡る浅い瀬');
    F.fordMarked = true;
    rt.say('組頭', '徒歩の者は森の備について渡れ。列を離れて追うな！', 3);
    for (const g of [F.ikeda, F.kino, F.inaba, F.shibata]) if (g && g.count) { g.order = 'attack'; g.seekRange = 70; g.formation = 'yari'; }
    // 後ろの段からも川を渡れるよう、向こう岸へ移ってから追撃に替える。
    for (const g of [F.mori, F.kino, F.inaba, F.shibata]) if (g && !gone(g)) {
      g.order = 'path'; g.path = [[10, 14], [10, -18], [24, -36]]; g.pathIdx = 0; g.formation = 'yari';
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 70; };
    }
    const R = enemyGroup(rt, { faction: 'saito', name: '浅井のしんがり', anchor: { x: 24, z: -36 }, facing: 0, fleeDir: { x: 0.1, z: -1 }, aggro: 12, width: 16, morale: 85 },
      dress([{ type: 'busho', n: 1, o: { hat: 'kabuto_m', haori: 0x3a4a3a } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 5 }], AZAI));
    F.rear = R;
    R.dmgMult = 1;   // 傷の重さは他の兵と同じ。
    if (F.flankStopped) { R.morale -= 20; rt.after(6, () => rt.say('森可成', '東の別手を止めたので、横から押せるぞ！', 3)); }
    rt.marker('rear', centerOf(R), '浅井のしんがり', { red: true, group: R });
    // 浅井の先の備は崩れ、長政の本陣と後ろの騎馬は北の山へ引いていく
    F.retreat = rt.t;
    // 崩れた控えは逃げる姿を残す。殿の控えは一緒に崩さない。
    F.azDA[0].m.rout({ hideAfter: 0 });
    for (const q of [F.jinIso, F.jinMasazumi]) q.m.rout({ hideAfter: 0 });
    // 川の中の浅井の前線も崩れて向こう岸へ逃げる
    F.clash.slice(1).forEach((c, i) => rt.after(1 + i * 4, () => c.rout('B', { from: i ? -1 : 1, hideAfter: Infinity })));
    rt.after(4, () => F.azDA[1].m.retreat(60, 45));
    rt.after(7, () => F.azDA[2].m.retreat(60, 40));
  },

  update(rt, dt) {
    const F = rt.flags;
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    const p = rt.player.u.pos;
    // 西の瀬の撃ち合い（遠くの音と煙）
    if (!F.ending && F.step >= 1) {
      F.farT -= dt;
      if (F.farT <= 0) {
        F.farT = 3 + Math.random() * 4;
        const x = -115 + (Math.random() - 0.5) * 40;
        rt.army.smoke(x, rt.world.heightAt(x, 6) + 1.4, 6, 0, -1);
        rt.army.play('gun', { x, z: 4 }, 0.9);
      }
    }
    KIT.backTick(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const player = rt.player, u = player.u;
    if (u.alive && F.step === 1 && (u.mobbed || u.hp < u.maxHp * 0.55) &&
        (F.guardWarnT ?? -99) + 12 < rt.t) {
      F.guardWarnT = rt.t;
      rt.bark(player.sta < player.maxSta * 0.22 ? '息が切れたぞ。敵を向いたまま、味方の列へ下がれ！' :
        '敵を向いて「構え」を押せ。囲まれる前に、味方の列へ下がれ！', true);
    }
    // 一斉射：先手が森の鉄砲に届く距離へ寄せたら放つ（一度だけ）。
    if (!F.vol1 && F.iso && !gone(F.iso) && Math.hypot(F.iso.center().x - F.guns[0].anchor.x, F.iso.center().z - F.guns[0].anchor.z) < 65) {
      F.vol1 = true;
      volley(rt, F.guns, { who: '森可成', wait: 2.2, line: '森の鉄砲、浅井の先手へ放て！', hit: 0 });
    }
    // 川を渡ったか（下知の前）
    if (F.step < 2 && p.z < BANK_N && !rt.G.lord) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.crossed) {
        F.crossed = true;
        rt.violation('下知なく姉川を渡った', ['森可成', '戻れ！　川を渡るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else F.outT = 0;
    if (F.step === 1) {
      const iso = F.iso;
      // 西の勝敗も、軽い合戦の実際の崩れを待つ。秒数だけで朝倉を敗走させない。
      if (!F.westBroken && F.clash[0].B.routed) {
        F.westBroken = true;
        F.akDA[0].m.rout({ hideAfter: 0 }); F.jinKagenori.m.rout({ hideAfter: 0 });
        F.akDA[1].m.retreat(60, 40);
        rt.say('伝令', '西の朝倉が退き始めた、との知らせ！', 3);
        for (const g of [F.iso, F.second, F.third]) if (g && !gone(g)) g.morale = Math.max(0, g.morale - 12);
      }
      if (F.westBroken && F.tkDone && !F.inaba) this.inaba(rt);
      this.breakthrough(rt);
      if (F.flankG && !F.flankDone && gone(F.flankG)) {
        F.flankDone = true; F.flankStopped = true;
        rt.objDone('flank'); rt.unmark('flank'); rt.unmark('eastPost');
        rt.after(4, () => rt.objRemove('flank'));
        rt.obj('mori', '森の備の兵を半分より多く残し、槍の列を保て', 'side');
        rt.award((t) => t.side.push('東の回り込みを止めた'), '東の回り込みを止めた');
        F.clash[2].push('A', 0.5);
      }
      rt.objProgress('main', '味方の槍の列を離れるな');
      // 森の備が危うければ、稲葉の横槍を早める
      if (!F.inaba && F.mori.count < F.mori0 * 0.25 && F.tkDone) this.inaba(rt);
      if (!F.tkDone && F.mori.count < F.mori0 * 0.25) this.tokugawa(rt);
      // 坂井の段が押し負けていく様子を印で見せる（崩れたら消す）
      if (!F.sakaiMk && F.iso && F.iso.order === 'attack') { F.sakaiMk = true; rt.marker('sakai', centerOf(F.sakai), '坂井の段', { group: F.sakai }); }
      if (F.sakaiMk && (F.sakai.routed || !F.sakai.count)) rt.unmark('sakai');
      // 東の二段の崩れが、西の徳川の備の士気にも響く。
      if (!F.linkW && F.sakai.routed && F.ikeda.routed && !F.tkDone) {
        F.linkW = true; F.clash[0].shake('A', 14);
        rt.say('伝令', '東の織田勢が押されている、と西の徳川の陣にも知らせが！', 3);
      }
      // 坂井の段が崩れたら知らせる
      if (F.sakai.routed && !F.sakaiSaid) { F.sakaiSaid = true; rt.say('森可成', '坂井殿の段が破られた！　次は池田殿の段じゃ……', 3); }
      if ((F.ikeda.routed || F.ikeda.count < 4) && !F.ikedaSaid) { F.ikedaSaid = true; rt.say('森可成', '池田殿の段も抜かれた！　来るぞ、槍を揃えよ！', 3); }
      const waves = [iso, F.second, F.third, F.flankG];
      const spent = waves.every((e) => !e || (!e.anePending && (gone(e) || e.count <= 3)));
      // 浅井の寄せを早く退けたら、その間に西の瀬の徳川が朝倉を破る
      if (spent && !F.tkDone && !F.tkSoon) { F.tkSoon = true; rt.say('森可成', '浅井め、川向こうで立て直しておる。息を整えよ、また来るぞ', 3.5); rt.after(6, () => this.tokugawa(rt)); }
      if (F.third && gone(F.third)) rt.unmark('third');
      if (!iso.anePending && !iso.routed && iso.count <= 3 && !iso.fled) { iso.fled = true; iso.noRout = false; iso.morale = 0; rt.unmark('iso'); rt.banner('磯野員昌、退く', '浅井の先手、川向こうへ'); }
      // 三の手を含む正面の備えが実際に崩れ、味方の横槍が届いてから追撃へ。
      if (F.third && F.inabaT && F.westBroken && [iso, F.second, F.third].every(gone)) { this.counter(rt); return; }
      // 持ち場を失って本陣前まで敵が抜ければ、この組の任務は失敗。
      let threat = false;
      for (const g of waves) if (g && !gone(g)) {
        const c = g.center();
        if (Math.hypot(c.x - HQ.x, c.z - HQ.z) < 22) threat = true;
      }
      F.hqThreat = threat && gone(F.mori) ? (F.hqThreat || 0) + dt : 0;
      if (F.hqThreat > 0 && !(F.hqWarnAt > rt.t)) {
        F.hqWarnAt = rt.t + 8; F.hqGuardMarked = true; rt.marker('hqGuard', { x: HQ.x, z: HQ.z - 16 }, '本陣前を守れ');
        rt.bark('敵が本陣前へ！　味方と槍をそろえ、奥へ通すな！', true);
      }
      if (!F.hqThreat && F.hqGuardMarked) { F.hqGuardMarked = false; rt.unmark('hqGuard'); }
      if (F.hqThreat > 8 || rt.t - F.stepT > 330) { this.lose(rt, F.hqThreat > 8 ? '森の備が崩れ、敵を本陣前へ通してしまった' : '押し合いが長引き、浅井の寄せを退けられなかった'); return; }
    }
    if (F.step === 2) {
      const R = F.rear;
      if (F.fordMarked && p.z < BANK_N) { F.fordMarked = false; rt.unmark('ford'); }
      rt.objProgress('pursue', gone(R) ? 'しんがりは崩れた。森の備と川向こうへ進めば任務達成じゃ' : '浅い瀬で森の備と渡れ。川向こうのしんがりを組で崩せ');
      // 敵が崩れたうえで本人も渡河する。時間切れで敵を逃がして勝ちにしない。
      if (gone(R) && p.z < BANK_N && !gone(F.mori)) {
        rt.objDone('pursue'); rt.unmark('rear');
        rt.tracker.main = true;
        rt.award((t) => { t.main = true; t.special = { label: '追い討ち', pts: 25 }; }, '浅井のしんがりを崩した');
        this.ending(rt);
      } else if (gone(F.mori) || (!R.anePending && rt.t - (F.rearAt ?? F.stepT) > 150)) this.lose(rt, gone(F.mori) ? '追う途中で森の備が崩れ、組で川向こうを押せなくなった' : gone(R) ? '敵のしんがりは崩れたが、組と川を渡れなかった' : '敵のしんがりを崩せず、追う下知が終わった');
    }
  },
  lose(rt, reason = '味方の槍の列を保てず、これ以上は進めぬ') {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true; rt.tracker.main = false;
    rt.objFail(F.step < 2 ? 'main' : 'pursue');
    for (const id of ['iso', 'flank', 'eastPost', 'third', 'rear', 'stop', 'sakai', 'hqGuard', 'ford']) rt.unmark(id);
    rt.objRemove('mori'); rt.objRemove('flank');
    if (!F.crossed && !rt.G.lord) rt.objFail('stay');
    rt.objRemove('stay');
    rt.banner('この組は持ち場を失った', reason);
    rt.say('組頭', 'これ以上は進めぬ。傷ついた者を連れ、後ろへ下がれ！', 4);
    rt.finish({}, 8);
  },
  ending(rt) {
    const F = rt.flags;
    F.ending = true;
    rt.objDone('main'); rt.objRemove('mori'); rt.objRemove('stay');
    for (const id of ['flank', 'eastPost', 'third', 'stop', 'sakai', 'ford']) rt.unmark(id);
    rt.banner('浅井・朝倉、退く', '姉川の戦、終わる');
    rt.say('森可成', '浅井・朝倉を押し返した。槍の列を保ち、組を集めよ', 4);
    rt.say('', '――織田・徳川勢は小谷の麓へ追った。山へは攻め上がらず、横山へ戻った。横山城は降った。', 6);
    sfx('horagai', 0.8);
    rt.finish({}, 10);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g._aneRoutSaid) return;
    g._aneRoutSaid = true;
    if (g.aneSource) g.aneSource.m.rout({ hideAfter: 0 });
    if (rt.over || F.ending || !sightPoint(rt, g.center())) return;
    if (g === F.iso) rt.say('足軽', '磯野の隊が崩れたぞ！　川へ逃げていく！', 3);
    if (g === F.rear) rt.say('足軽', 'しんがりが崩れた！　浅井は総崩れじゃ！', 3);
  },
};

// 織田・徳川は概数。浅井五千・朝倉八千は信長公記巻三の記述による。
anegawa.force = () => ({ a: 28000, a0: 28000, b: 13000, b0: 13000 });
anegawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '浅井の寄せまで待つ' : '');
anegawa.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) anegawa.charge(rt); };
anegawa.famous = HISTORICAL_GENERALS.anegawa;
anegawa.sides = { a: { name: '織田・徳川軍', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'azai' } };
anegawa.date = () => '元亀元年六月二十八日　空模様と時刻は復元';
anegawa.history = '信長公記巻三では、元亀元年六月二十八日、浅井・朝倉勢が野村と三田村の二手に分かれ、西に徳川勢、東に信長の馬廻りと美濃三人衆が当たったと記す。敵は姉川を越え、織田勢と押しつ押されつ入り乱れた。織田・徳川勢は敵を崩して小谷の麓まで追い、横山城は降った。磯野員昌が何段も破ったという細かな戦いぶりは後の軍記に伝わる話で、信長公記には段数の記述はない。森可成の持ち場、川幅・深さと三田村氏館を後方に置く位置、寄せの順、磯野の突破と東の別手の進路は復元である。朝の霧と晴れの空は、当日の天気を確定したものではない。兵数は浅井五千・朝倉八千を採り、織田・徳川二万八千は諸説ある概数としている。';

// 素直な遊び手：移った槍の列を保ち、東の別手を読み、下知が出たら川を渡る
anegawa.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  inp.runHeld = false;
  if (!u.alive || F.ending) return;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  const approach = reach * 0.85;
  // 目の前の敵と、実際に打ち込む敵は別の事がある。横からの一撃を先に受ける。
  let attacker = null, attackDist = 10;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 脅威の表は前の更新のもの。振り終えた敵への構えを持ち越さない。
    if (!((o.atk && o.atk.target === u && !o.atk.bow) ||
        (o.swing && !o.swing.done && o.swing.target === u) ||
        (o.charging && o.cv === 'in' && o.target === u))) continue;
    if (d < attackDist) { attacker = o; attackDist = d; }
  }
  if (attacker) {
    if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
    p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
    inp.guardHold = true; inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  // 下知の前は川のこちら側だけ
  const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && !o.isStruct &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
    (F.step >= 2 || o.pos.z > BANK_N + 2);
  const flank = F.flankG;
  if (F.step === 1 && F.flankPick === 0 && !F.flankDone && flank && !gone(flank)) {
    const c = flank.center();
    goTo(p, inp, c.x, Math.max(BANK_N + 3, c.z), approach);
    const e = b.army.nearestEnemy(u, 3.2, ok);
    if (e) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > approach) goTo(p, inp, e.pos.x, e.pos.z, approach);
      else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d);
    }
    return;
  }
  inp.runHeld = false;
  // 傷は自然には癒えない。共通の survive が構えて味方へ退き、傷を縛る。
  // 固定の退き先で回復を待つと、構えずに打たれ続け、斬り合いにも戻れない。
  // 下知の前は、備の前に出すぎず、槍の届く所の敵だけを突く
  const home = F.step >= 2 ? u.pos : F.holdAt;
  const previous = p.botStrikeFoe;
  // 構えを解く間に近い兵が入れ替わっても、届く相手への反撃を続ける。
  const keep = p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team &&
    ok(previous) && Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < reach &&
    Math.hypot(previous.pos.x - home.x, previous.pos.z - home.z) < (F.step >= 2 ? 99 : 12);
  const e = keep ? previous : b.army.nearestEnemy(u, F.step >= 2 ? 16 : 9, (o) => ok(o) && Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < (F.step >= 2 ? 99 : 12));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀は槍より短い。槍の間合いで止まると、刀では一度も斬れない。
    if (d > approach) goTo(p, inp, e.pos.x, e.pos.z, approach);
    // 構えを毎コマ解き直すと、槍を突ける半秒の待ちが終わらない。
    // 打ち込みは受け、敵の隙には構えを解いて突き返す。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step >= 2 && F.rear && F.rear.count) { const c = F.rear.center(); goTo(p, inp, c.x, c.z, 2); }
  else goTo(p, inp, F.holdAt.x, F.holdAt.z - 3, 2.5);
};

export { anegawa };
