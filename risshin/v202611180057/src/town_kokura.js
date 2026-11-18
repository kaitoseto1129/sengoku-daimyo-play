// ======================================================================
// K364⑤ 要件書65-17 九州征伐の海上輸送：岩石城の前の陣中「豊前 小倉の湊」（1〜3分歩ける場）。
//   town_jinchu.js の JINCHU（t07_ganjaku・drama 'kokura'）から呼ぶ。字は出さず、目の前の動き（船・荷・兵の列）と台詞で。
//   見えるもの：沖の大船（関船）・岸の小舟（はしけ）に米俵を担いで積む人足の行き来・小舟が大船へ漕ぎ出して戻る・乗る順を待つ兵の列。
//   史実の分け（docs/journey/t07_ganjaku.md の K364 65-17 の節）：
//     A＝天正十五年三月、秀吉は赤間関から豊前小倉へ渡った／九州へ渡る大軍の兵糧を船で運んだ／岩石城が九州で最初に攻める城（四月一日）。
//     B＝湊の形・船の数と形・荷の積み方・人の言葉（ゲームの再構成）。誰が船を差配したかは兵の「と聞く」にとどめる。
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, tawara, kagaribi, kobune } from './props.js';
import { allyGroup } from './bhelp.js';
import { ladderStep } from './state.js';
import { buildHorse } from './units_model.js';

const SHORE = 10.5;                       // 波打ち際（x）。東が海
const LAND = (x, z) => 0.35 * Math.sin(x * 0.05) + 0.3 * Math.cos(z * 0.04);
const SEA_Y = -0.45;
const BOARD = { x: 9.6, z: -20 };       // 兵の乗る小舟（波打ち際に半ば揚げる）
const UMABUNE = { x: 15.5, z: -9 };     // 馬船
const SPOT = {
  kura: { x: -10, z: 2, n: '米蔵' }, hama: { x: 8, z: 2, n: '船着き' }, retsu: { x: 2, z: -12, n: '乗る順を待つ列' },
  bugyo: { x: 4, z: 12, n: '船の差配' }, gate: { x: 6, z: -24, n: '乗る小舟' },
};

// 地形：西は低い台地、波打ち際から東は浅い砂の底（海の下）
function height(x, z) {
  const base = LAND(x, z) + Math.max(0, -x - 30) * 0.08;
  if (x < SHORE - 3) return base;
  const k = Math.min(1, (x - (SHORE - 3)) / 9);
  return base * (1 - k) + (-2.6) * k;
}

// 関船（沖に泊まる大船）：基本形の組み合わせ。形は一つを作って使い回す
let SHIP = null;
function shipModel() {
  if (SHIP) return SHIP.clone();
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.9 });
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#d8cfb8'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(90,80,60,.45)'; x.lineWidth = 2; for (let i = 8; i < 64; i += 10) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); }
  const sailTex = new THREE.CanvasTexture(c); sailTex.colorSpace = THREE.SRGBColorSpace;
  const sail = new THREE.MeshStandardMaterial({ map: sailTex, roughness: 0.95, side: THREE.DoubleSide });
  // 船体：舳先と艫を絞った箱（長さ 16・幅 4.4）
  const hull = new THREE.BoxGeometry(4.4, 1.6, 16, 1, 1, 4);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const zz = p.getZ(i), t = Math.abs(zz) / 8, y = p.getY(i);
    p.setX(i, p.getX(i) * (1 - 0.55 * t * t) * (y < 0 ? 0.8 : 1));
    if (zz > 6) p.setY(i, y + (zz - 6) * 0.35);
  }
  hull.computeVertexNormals();
  const hm = new THREE.Mesh(hull, wood); hm.position.y = 0.4; g.add(hm);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 12), dark); deck.position.y = 1.22; g.add(deck);
  // 矢倉（屋形）：船の中ほどの板囲い
  const yk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6), wood); yk.position.set(0, 1.95, -1); g.add(yk);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 6.6), dark); roof.position.set(0, 2.72, -1); g.add(roof);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 6), dark); mast.position.set(0, 6.6, 2.2); g.add(mast);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 6.4), sail); s.position.set(0, 6.8, 2.05); g.add(s);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.6, 5), dark); yard.rotation.z = Math.PI / 2; yard.position.set(0, 10, 2.1); g.add(yard);
  // 櫓（ろ）：舷から海へ斜めに下りる棒
  for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 4), dark);
    o.position.set(sd * 2.7, 0.6, -4 + k * 2); o.rotation.z = sd * 1.0; g.add(o);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  SHIP = g;
  return g.clone();
}

// 小舟に載せる米俵（増える）
const BALE_GEO = new THREE.CylinderGeometry(0.28, 0.28, 0.7, 8); BALE_GEO.rotateZ(Math.PI / 2);
const BALE_MAT = new THREE.MeshStandardMaterial({ color: 0xb59a62, roughness: 0.95 });
const CARRY_GEO = BALE_GEO.clone().translate(0, 1.45, -0.3);   // 人足の肩の俵（units.js の荷の位置）

export function kokuraDef(game, J, def) {
  def.spawn = { x: -14, z: -6, heading: Math.PI / 2 };
  def.world = {
    seed: 1587, time: 'day', clearAir: true, mood: 'plain', seaSound: 0.7,
    height, water: { x: SHORE, level: SEA_Y },
    clear: (x, z) => x > -34 && z > -34 && z < 30,
    trees: 90, tufts: 900, rocks: 30, paths: [[[-30, 2], [SHORE - 1, 2]], [[6, -30], [6, 20]]],
    young: true, muddy: 0.15,
    groves: [[-60, 30, 22], [-62, -36, 20], [-40, 48, 18]].map(([x, z, r]) => ({ x, z, r, n: 12 })),
  };
  def.setup = (rt) => {
    rt.army.hideBlood = true;
    for (const t of [0.2, 2, 6]) rt.after(t, () => { try { rt.army.disposeStains?.(); } catch (e) { /* 跡が無い時はそのまま */ } });
    buildKokura(rt, J);
    const dl = document.getElementById('dateline'); if (dl) dl.textContent = J.when;
  };
  def.update = (rt, dt) => kokuraTick(rt, dt);
  def.guideTo = (rt) => { rt.marker('mk-go', SPOT.gate, SPOT.gate.n); };
  return def;
}

function buildKokura(rt, J) {
  const W = rt.world, game = rt.game, G = rt.G, F = rt.flags;
  const MON = 'toyotomi';
  const one = (name, x, z, facing, type = 'ashigaru', o = {}) => {
    const g = allyGroup(rt, { name: name || '兵', anchor: { x, z }, facing, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type, n: 1, o: { name, flag: null, invuln: true, ...o } }]);
    return g.units[0];
  };
  // 米蔵（板屋根の仮の蔵）と俵の山
  rt.scene.add(hut(W, -14, 8, 8, 5, 0, { ita: true }));
  rt.scene.add(hut(W, -14, -4, 8, 5, 0, { ita: true }));
  for (const [x, z, r, n] of [[-8, 9, 0, 8], [-8, -3, 0.2, 8], [-6, 3, 1.4, 6], [-11, 14, 0.4, 7], [4, -2, 1.6, 4]]) rt.scene.add(tawara(W, x, z, r, n));
  for (const z of [-16, -8, 16]) rt.scene.add(nobori(W, 0, z, MON, 5));
  for (const [x, z] of [[-4, 12], [-4, -8]]) rt.scene.add(kagaribi(W, x, z));
  // 沖の大船（関船）三艘：舳先を北へ。波で少し揺れる
  F.ships = [[27, 4, 0], [34, -16, 0.15], [40, 24, -0.1]].map(([x, z, r], i) => {
    const s = shipModel(); s.position.set(x, SEA_Y - 0.2, z); s.rotation.y = r; rt.scene.add(s);
    return { m: s, ph: i * 1.7, y0: SEA_Y - 0.2 };
  });
  // 岸の小舟（はしけ）二艘：波打ち際で荷を積み、満ちたら大船へ漕ぎ出して戻る
  F.tenders = [{ z: 1, ship: 0 }, { z: 7, ship: 0 }].map((T, i) => {
    const m = kobune(SHORE + 0.6, SEA_Y + 0.05, T.z, Math.PI / 2, 7) || new THREE.Group(); rt.scene.add(m);
    return { m, z: T.z, x0: SHORE + 0.6, x1: 23.5, state: 'load', t: i * 9, bales: [], need: 4, rower: null };
  });
  // 人足：蔵から船着きへ俵を担ぎ、戻る（行き来を続ける）。二組を互い違いに
  F.carriers = [0, 1].map((k) => {
    const g = allyGroup(rt, { name: '人足', noRetinue: true, anchor: { x: -8, z: 4 + k * 2 }, facing: Math.PI / 2, order: 'hold', noRout: true, width: 1, formation: 'column', aggro: 0, seekRange: 0, speed: 1.15 },
      [{ type: 'porter', n: 3, o: { name: '人足', invuln: true, weapon: 'none', porterLoad: CARRY_GEO } }]);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; }
    return { g, go: k === 0, wait: k * 6, tender: k };
  });
  // 乗る順を待つ兵の列（槍を立て、旗を負う）。順に一人ずつ小舟の方へ進む
  const retsu = allyGroup(rt, { name: '乗る順を待つ兵', noRetinue: true, anchor: { x: 3, z: -12 }, facing: Math.PI / 2, order: 'hold', noRout: true, width: 2, formation: 'column', aggro: 0, seekRange: 0, fixed: true },
    [{ type: 'ashigaru', n: 10, o: { invuln: true, flag: MON } }, { type: 'samurai', n: 1, o: { invuln: true, flag: MON, name: '組頭' } }]);
  for (const u of retsu.units) { u.noTarget = true; }
  F.retsu = retsu;
  // 乗り込みの小舟（主人公の乗る舟）：列の先、南の船着き
  //   兵は一人ずつ列を離れて波打ち際の小舟へ歩いて乗り込み、五人で満ちたら沖の大船へ漕ぎ出す（戻ると次の五人）
  { const b = kobune(BOARD.x, SEA_Y + 0.05, BOARD.z, Math.PI / 2, 7) || new THREE.Group(); rt.scene.add(b);
    F.board = { m: b, state: 'load', t: 0, n: 0, x0: BOARD.x, x1: 30, riders: [] };
    F.boarders = [];
    for (let i = 0; i < 6; i++) {
      const g = allyGroup(rt, { name: '乗り込む兵', noRetinue: true, anchor: { x: 4 + (i % 2) * 1.2, z: -17 - Math.floor(i / 2) * 1.4 }, facing: Math.PI / 2, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, speed: 1.3 },
        [{ type: 'ashigaru', n: 1, o: { invuln: true, flag: MON } }]);
      g.units[0].noTarget = true;
      F.boarders.push({ g, state: 'wait', wait: 3 + i * 4.5, home: { ...g.anchor } });
    }
  }
  // 馬を船に乗せる：馬船（平たい船）を波打ち際に着け、渡り板を渡す。馬方が一頭ずつ口を取って板を上がらせる（船を嫌がって首を振る）
  { const deckM = new THREE.MeshStandardMaterial({ color: 0x5f4a34, roughness: 0.9 }), railM = new THREE.MeshStandardMaterial({ color: 0x3e3226, roughness: 0.9 });
    const barge = new THREE.Group();
    const hullG = new THREE.BoxGeometry(3.6, 0.9, 7.5); const hull = new THREE.Mesh(hullG, deckM); hull.position.y = 0.05; barge.add(hull);
    for (const sd of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 7.5), railM); r.position.set(sd * 1.75, 0.85, 0); barge.add(r); }
    for (const sz of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 0.12), railM); r.position.set(0, 0.85, sz * 3.7); barge.add(r); }
    barge.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    barge.position.set(UMABUNE.x, SEA_Y + 0.05, UMABUNE.z); rt.scene.add(barge);
    // 渡り板：岸から馬船の舷へ
    const top = SEA_Y + 0.55, foot = { x: UMABUNE.x - 6.9, z: UMABUNE.z }, fy = height(foot.x, foot.z) + 0.05;
    const len = Math.hypot(UMABUNE.x - 1.6 - foot.x, top - fy);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 1.2), railM);
    plank.position.set((UMABUNE.x - 1.6 + foot.x) / 2, (top + fy) / 2, foot.z); plank.rotation.z = Math.atan2(top - fy, UMABUNE.x - 1.6 - foot.x); rt.scene.add(plank);
    F.uma = { barge, plank, top, foot, fy, state: 'load', t: 0, horses: [], made: 0 };
    F.umakata = one('馬方', foot.x - 1.5, foot.z + 1.4, Math.PI / 2, 'porter', { weapon: 'none' });
  }
  // 沖の船団：大船を並べて泊め、二艘は帆を上げて南へ出ていく（形は一つを使い回す）
  F.fleet = [];
  for (const [x, z, r] of [[58, -40, 0.1], [66, 10, -0.05], [74, 40, 0.2], [88, -20, 0], [96, 22, 0.1], [110, -50, -0.1], [118, 0, 0.05], [132, 34, 0], [140, -24, 0.15]]) {
    const s = shipModel(); s.position.set(x, SEA_Y - 0.2, z); s.rotation.y = r; rt.scene.add(s); F.ships.push({ m: s, ph: x * 0.07, y0: SEA_Y - 0.2 });
  }
  for (const [x, z] of [[48, 30], [80, 60]]) { const s = shipModel(); s.position.set(x, SEA_Y - 0.2, z); s.rotation.y = Math.PI; rt.scene.add(s); F.fleet.push({ m: s, z0: z, sp: 1.1 }); }
  // 人：船の差配の侍・船頭・湊の者
  one('船奉行の侍', SPOT.bugyo.x, SPOT.bugyo.z, Math.PI / 2 + 0.6, 'samurai', { flag: MON });
  one('書き役', SPOT.bugyo.x - 1.6, SPOT.bugyo.z + 0.6, Math.PI / 2, 'porter', { weapon: 'none' });
  one('船頭', SHORE - 0.8, 4, -Math.PI / 2, 'porter', { weapon: 'none' });
  one('水夫', SHORE - 0.6, -18, Math.PI, 'porter', { weapon: 'none' });
  one('湊の者', -18, 0, Math.PI / 2, 'porter', { weapon: 'none' });

  const L = (t, who, text, sec = 3.6) => rt.after(t, () => { if (rt.flags === F && !rt.over) rt.say(who, text, sec); });
  const hi = ladderStep(G || {}) >= 2;
  // 着いて少し歩く間に、湊のざわめきが聞こえる（30〜90秒）
  L(1.5, '組頭', '小倉の湊じゃ。赤間関から渡って来た船が、まだ次々と着いておる', 4);
  L(9, '船頭', '俵は舳から積め！　片舷に寄せると舟が傾くぞ', 3.4);
  L(17, '人足', '一俵で四斗じゃ。肩が抜けるわい', 3);
  L(26, '足軽', '海を渡るのは初めてじゃ……舟は好かん', 3);
  L(31, '組の者', '関白様の御座船も、昨日のうちに着かれたと聞く', 3.4);
  // 用：差配の侍・俵・列・船頭
  rt.addInteract('ko-bugyo', SPOT.bugyo, hi ? '聞く　船の差配' : '見る　船の差配', () => {
    const k = F.bugyoI = ((F.bugyoI ?? -1) + 1) % 3;
    const LS = hi
      ? [[['船奉行の侍', '米は先の湊へ船で回す。兵は陸を南へ。九州の最初は岩石の城よ'], ['船奉行の侍', '城を一つ落とすのに、米は兵の数の何倍も要る']],
        [['船奉行の侍', '風が変わる前に、今日の分は積み終えねばならぬ'], ['書き役', '三番の舟、俵四十。……合うておりまする']],
        [['船奉行の侍', '船の差配は小西様の手の者じゃ、と聞いておろう。遅れれば首が飛ぶ']]]
      : [[['書き役', '控えよ。俵の数を数えておるところじゃ']], [['船奉行の侍', '足軽は列に戻れ。乗る順は組頭が呼ぶ']], [['書き役', '三番の舟、俵四十……']]];
    LS[k].forEach(([who, text], i) => L(i * 3.8, who, text, 3.4));
  }, { r: 3 });
  rt.addInteract('ko-kura', SPOT.kura, '見る　米蔵', () => {
    const k = F.kuraI = ((F.kuraI ?? -1) + 1) % 3;
    const LS = [['湊の者', '蔵には入りきらん。俵は外に積んで、筵を掛けておく'], ['人足', '担げるだけ担げと言われても、俵は一つが限りよ'], ['湊の者', '雨が来たら俵が腐る。早う船へ']];
    L(0, LS[k][0], LS[k][1], 3.6);
  }, { r: 3.5 });
  rt.addInteract('ko-hama', SPOT.hama, '見る　船着き', () => {
    const k = F.hamaI = ((F.hamaI ?? -1) + 1) % 3;
    const LS = [['船頭', '満ちたら沖の大船へ漕ぎ出す。空いたら戻って、また積む'], ['水夫', '沖の大船は関船じゃ。櫓を揃えて漕ぐ'], ['船頭', '潮が引けば、ここまで舟が寄せられん']];
    L(0, LS[k][0], LS[k][1], 3.6);
  }, { r: 3.5 });
  rt.addInteract('ko-retsu', SPOT.retsu, '並ぶ　乗る順の列', () => {
    L(0, '組頭', 'わしらの組は次の舟じゃ。南の船着きへ行け', 3.4);
    rt.marker('mk-gate', SPOT.gate, SPOT.gate.n);
  }, { r: 3.5 });
  // 出陣：南の船着きの小舟に乗る（出立の場面＝town_depart.js の SORTIE t07_ganjaku へ続く）
  rt.addInteract('door-gate', SPOT.gate, '小舟に乗って出陣する', () => game.townSortie(), { r: 3.5 });
  rt.marker('mk-hama', SPOT.hama, SPOT.hama.n);
  rt.after(40, () => { if (rt.flags === F && !rt.over) { rt.marker('mk-gate', SPOT.gate, SPOT.gate.n); rt.say('組頭', '支度ができたら、南の船着きへ来い。わしらの組も乗るぞ', 4); } });
  F.doors = { boss: SPOT.bugyo, shop: SPOT.kura, squad: SPOT.retsu, stable: SPOT.hama, gate: SPOT.gate };
}

function kokuraTick(rt, dt) {
  const F = rt.flags; if (!F.ships) return;
  const t = rt.t;
  // 沖の船団：二艘が帆を上げて南へ。遠くへ出たら北の端から入り直す
  for (const f of F.fleet || []) { f.m.position.z -= f.sp * dt; if (f.m.position.z < -160) f.m.position.z = 160; f.m.position.y = SEA_Y - 0.2 + Math.sin(t * 0.6 + f.z0) * 0.12; }
  boardTick(rt, dt); umaTick(rt, dt);
  // 大船の揺れ（波）
  for (const s of F.ships) { s.m.position.y = s.y0 + Math.sin(t * 0.7 + s.ph) * 0.12; s.m.rotation.z = Math.sin(t * 0.55 + s.ph) * 0.025; }
  // 小舟：積む → 漕ぎ出す → 下ろす（大船の脇で待つ）→ 戻る
  for (const T of F.tenders) {
    T.t += dt;
    const m = T.m;
    if (T.state === 'out' || T.state === 'back') {
      const k = Math.min(1, T.t / 14), e = k * k * (3 - 2 * k);
      m.position.x = T.state === 'out' ? T.x0 + (T.x1 - T.x0) * e : T.x1 + (T.x0 - T.x1) * e;
      m.position.y = SEA_Y + 0.05 + Math.sin(t * 1.3 + T.z) * 0.05;
      if (k >= 1) { T.t = 0; T.state = T.state === 'out' ? 'unload' : 'load'; }
    } else if (T.state === 'unload') {
      if (T.t > 3 && T.bales.length) { const b = T.bales.pop(); m.remove(b); T.t = 2.2; }
      if (!T.bales.length && T.t > 3) { T.t = 0; T.state = 'back'; }
    } else if (T.state === 'load' && T.bales.length >= T.need && T.t > 2) { T.t = 0; T.state = 'out'; }
  }
  // 人足の行き来：蔵 → 船着き（俵を負う）→ 蔵（空身）。着いたら小舟に俵が一つずつ増える
  //   着いたかは自分で見る（組の着き＝onArrive は列の詰まりで来ない事がある）：先頭が行き先の 2.5m 内か、4 秒動かない
  for (const C of F.carriers) {
    const g = C.g; if (!g || !g.units.length) continue;
    if ((C.wait -= dt) > 0) continue;
    const T = F.tenders[C.tender];
    if (!C.dest) {
      if (C.go && T.state !== 'load') { C.wait = 1.5; continue; }   // 小舟が出ている間は、蔵の前で待つ
      C.dest = C.go ? { x: SHORE - 2.4, z: T.z } : { x: -8, z: 3 + C.tender * 2 };
      g.fixed = false; g.order = 'move'; g.dest = { ...C.dest }; C.moveT = 0; C.last = null;
      for (const u of g.units) { const ld = u.mesh?.children?.[u.mesh.children.length - 1]; if (ld && ld.geometry === CARRY_GEO) ld.visible = C.go; }
      continue;
    }
    C.moveT += dt;
    const u = g.units[0], d = Math.hypot(u.pos.x - C.dest.x, u.pos.z - C.dest.z);
    if (!C.last || Math.hypot(u.pos.x - C.last.x, u.pos.z - C.last.z) > 0.3) { C.last = { x: u.pos.x, z: u.pos.z }; C.still = 0; } else C.still = (C.still || 0) + dt;
    if (d > 2.5 && C.still < 4 && C.moveT < 40) continue;
    g.order = 'hold'; g.dest = null; g.anchor = { x: u.pos.x, z: u.pos.z };
    if (C.go) for (let i = 0; i < g.units.length && T.bales.length < T.need + 2; i++) {
      const b = new THREE.Mesh(BALE_GEO, BALE_MAT);
      const n = T.bales.length; b.position.set(((n % 2) - 0.5) * 0.7, 0.55 + Math.floor(n / 4) * 0.5, ((Math.floor(n / 2) % 2) - 0.5) * 1.2);
      T.m.add(b); T.bales.push(b);
    }
    C.go = !C.go; C.dest = null; C.wait = 1.2;
  }
}

// 兵の乗り込み：列から一人ずつ小舟へ。五人で満ちたら沖へ漕ぎ出し、戻ると次の者が乗る
function boardTick(rt, dt) {
  const F = rt.flags, B = F.board; if (!B) return;
  B.t += dt;
  for (const P of F.boarders) {
    const g = P.g, u = g.units[0]; if (!u) continue;
    if (P.state === 'wait') {
      if ((P.wait -= dt) > 0 || B.state !== 'load' || B.n >= 5) continue;
      P.state = 'walk'; g.order = 'move'; g.dest = { x: B.x0 - 1.4, z: BOARD.z + (B.n % 2 ? 0.7 : -0.7) }; P.walkT = 0;
    } else if (P.state === 'walk') {
      P.walkT += dt;
      if (Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) > 1.2 && P.walkT < 25) continue;
      // 舟へ乗る：舟の中に立つ（舟が漕ぎ出したら、腰を下ろして見えなくなる）
      const k = B.n++; const x = B.x0 + 0.1, z = BOARD.z - 2 + k * 0.9;
      g.order = 'hold'; g.dest = null; g.anchor = { x, z }; u.pos.set(x, Math.max(rt.world.heightAt(x, z), SEA_Y + 0.25), z); u.mesh?.position.copy(u.pos);
      P.state = 'in'; B.riders.push(P);
    }
  }
  if (B.state === 'load' && B.n >= 5 && B.t > 3) { B.state = 'out'; B.t = 0; for (const P of B.riders) { const u = P.g.units[0]; if (u?.mesh) u.mesh.visible = false; } }
  if (B.state === 'out' || B.state === 'back') {
    const k = Math.min(1, B.t / 16), e = k * k * (3 - 2 * k);
    B.m.position.x = B.state === 'out' ? B.x0 + (B.x1 - B.x0) * e : B.x1 + (B.x0 - B.x1) * e;
    B.m.position.y = SEA_Y + 0.05 + Math.sin(rt.t * 1.2) * 0.05;
    if (k >= 1 && B.state === 'out') { B.state = 'back'; B.t = 0; }
    else if (k >= 1) {
      B.state = 'load'; B.t = 0; B.n = 0;
      // 乗った者は沖の大船へ移った。列の後ろへ新しく来た者として戻す（見えない所＝蔵の陰から歩いて来る）
      for (const P of B.riders) {
        const g = P.g, u = g.units[0]; if (!u) continue;
        const x = -18, z = -22 + Math.random() * 3; u.pos.set(x, rt.world.heightAt(x, z), z); u.mesh?.position.copy(u.pos); if (u.mesh) u.mesh.visible = true;
        g.order = 'move'; g.dest = { ...P.home }; g.onArrive = (q) => { q.order = 'hold'; q.dest = null; };
        P.state = 'wait'; P.wait = 14 + Math.random() * 10;
      }
      B.riders = [];
    }
  }
}

// 馬を馬船へ：厩（蔵の南）から馬方が口を取って波打ち際へ。渡り板を上がり、船の上で止まる。二頭で満ちたら沖へ
function umaTick(rt, dt) {
  const F = rt.flags, M = F.uma; if (!M) return;
  M.t += dt;
  const W = rt.world, bx = M.barge.position.x;
  if (M.state === 'load' && M.horses.length < 2 && M.t > (M.horses.length ? 9 : 2) && !M.horses.some((h) => h.st !== 'on')) {
    const h = buildHorse(); const x = -2, z = -26;   // 南の道から引いて来る（主人公の入る所の後ろに湧かせない）
    h.position.set(x, W.heightAt(x, z), z); h.rotation.y = Math.PI / 2; rt.scene.add(h);
    M.horses.push({ m: h, st: 'lead', slot: M.horses.length, balk: 0, ph: Math.random() * 6 });
  }
  for (const H of M.horses) {
    const h = H.m, hh = h.userData.horse;
    let moving = false;
    if (H.st === 'lead') {
      // 岸を渡り板の足元へ
      const tx = M.foot.x - 0.6, tz = M.foot.z, d = tx - h.position.x;
      const dz0 = tz - h.position.z, dd0 = Math.hypot(d, dz0);
      if (dd0 > 0.1) { const st = Math.min(dd0, 1.4 * dt); h.position.x += d / dd0 * st; h.position.z += dz0 / dd0 * st; h.position.y = W.heightAt(h.position.x, h.position.z); h.rotation.y = Math.atan2(d, dz0); moving = true; }
      else { H.st = 'balk'; H.balk = 0; h.rotation.y = Math.PI / 2; }
    } else if (H.st === 'balk') {
      // 板の前で首を振って嫌がる（二秒ほど）
      H.balk += dt; if (hh?.neck) hh.neck.rotation.y = Math.sin(H.balk * 7) * 0.35;
      if (H.balk === dt) rt.say?.('馬方', H.slot ? 'どう、どう……もう一頭じゃ' : 'どう、どう……船は揺れん。上がれ', 2.6);
      if (H.balk > 2.4) { H.st = 'plank'; if (hh?.neck) hh.neck.rotation.y = 0; }
    } else if (H.st === 'plank' || H.st === 'deck') {
      // 渡り板を上がり、船の上の持ち場へ
      const tx = H.st === 'plank' ? bx - 1.6 : bx + (H.slot ? 0.8 : -0.8), tz = M.barge.position.z + (H.st === 'deck' ? (H.slot ? 1.6 : -1.6) : 0);
      const dx = tx - h.position.x, dz = tz - h.position.z, dd = Math.hypot(dx, dz);
      if (dd > 0.05) {
        const s = Math.min(dd, 1.0 * dt); h.position.x += dx / dd * s; h.position.z += dz / dd * s; moving = true;
        if (H.st === 'plank') { const k = (h.position.x - M.foot.x) / (bx - 1.6 - M.foot.x); h.position.y = M.fy + (M.top - M.fy) * Math.max(0, Math.min(1, k)); }
        else h.position.y = M.top;
      } else if (H.st === 'plank') H.st = 'deck';
      else { H.st = 'on'; h.rotation.y = 0; }
    } else if (H.st === 'on') { h.position.y = M.barge.position.y + 0.5; }
    // 脚の振り（歩く間だけ）
    if (hh?.legs) for (let i = 0; i < hh.legs.length; i++) hh.legs[i].rotation.x = moving ? Math.sin(rt.t * 6 + i * Math.PI / 2 + H.ph) * 0.35 : 0;
    if (H.st === 'on' && M.state !== 'load') h.position.x = M.barge.position.x + (H.slot ? 0.8 : -0.8);
  }
  // 馬方も馬の脇を歩く
  const u = F.umakata, lead = M.horses.find((H) => H.st !== 'on');
  if (u && lead) { const x = lead.m.position.x + (lead.st === 'lead' ? 1.0 : 0.2), z = lead.m.position.z + 1.1; if (x < M.foot.x + 0.4) { u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.heading = Math.PI / 2; } }
  if (M.state === 'load' && M.horses.length >= 2 && M.horses.every((H) => H.st === 'on') && M.t > 4) { M.state = 'out'; M.t = 0; M.plank.visible = false; }
  if (M.state === 'out' || M.state === 'back') {
    const k = Math.min(1, M.t / 18), e = k * k * (3 - 2 * k);
    M.barge.position.x = M.state === 'out' ? UMABUNE.x + 18 * e : UMABUNE.x + 18 * (1 - e);
    M.barge.position.y = SEA_Y + 0.05 + Math.sin(rt.t * 1.1) * 0.05;
    if (k >= 1 && M.state === 'out') { M.state = 'back'; M.t = 0; for (const H of M.horses) rt.scene.remove(H.m); M.horses = []; }
    else if (k >= 1) { M.state = 'load'; M.t = 0; M.plank.visible = true; }
  }
}
