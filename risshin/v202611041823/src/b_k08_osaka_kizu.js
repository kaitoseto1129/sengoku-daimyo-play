// ======================================================================
// 徳川編 8. 大坂冬の陣・木津川口の戦い（慶長十九年十一月十九日の夜明け前・1614）
// 手本と出所：docs/battle_refs/k08_osaka_kizu.md（Wikipedia・大坂の陣絵巻・城跡の記録・YouTube の解説）。
// 史実：蜂須賀の物見が「砦の炊ぎの煙が少ない」と知らせ、家康の許しを得て、蜂須賀至鎮（約三千）が南と東から、
//   石川忠総（約二千三百）が舟で木津川を渡って西から、明石全登の砦（約八百）を襲った。全登は大坂城の評定に出ていて留守で、
//   砦はその日のうちに落ちた。戻った全登は間に合わず退いた。冬の陣の最初の戦。
// 主人公は蜂須賀勢の侍大将。家康・秀忠・秀頼はこの場にいない（総大将は遠くの本陣と城の中）。大坂城は北東に遠く見えるだけ。
// 段（段ごとに夜明けまでの時間の限り。kaito AP の8）：
//   ①入り江を渡り、岸の鉄砲組を討つ ②砦の大手門を味方と打ち破る ③砦の内の守兵を討つ（石川勢が西の柵を破る）④明石勢の後詰を北の口で止める ⑤全登の新手を退ける
// kaito AP〜AV：見せかけの軍勢（addDistantArmy・addClash・前の埋め）は置かない。兵の比は徳川方が六倍ほど（本物の兵は三倍ほど）。
//   旗は蜂須賀の卍・石川の丸・豊臣だけ（徳川・織田の旗を立てない）。明石全登は後詰の後ろで馬上（討てない・退く）。
// 地形：大坂の低い平野と木津川の河口を手で復元（平らな低地。川筋・砦の置き場は推定）。
// 座標：南が +z（蜂須賀勢）、北が −z（砦の北の口と船場・大坂城）、東が +x（大坂城の方）、西が −x（木津川・大坂湾）。
// ======================================================================
import * as THREE from 'three';
import { enemyGroup, allyGroup, centerOf, nm, wallLine } from './bhelp.js';
import { nobori, yagura, kabukimon, kagaribi, kobune } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { farSight } from './far_sight.js';
import { osakaFar } from './osaka_far.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut } from './stages.js';
import { setStages } from './b_k_help.js';

const HACHI = { flag: 'hachisuka', armor: 0x1c1b1a };   // 蜂須賀（卍）
const ISHI = { flag: 'maru', armor: 0x1f1e1c };         // 石川忠総（家紋の型が無いので丸）
const TOYO = { flag: 'toyotomi', armor: 0x22201d };     // 明石全登の砦の兵（豊臣方）

// 置き場（x=東+、z=南+）
const FORT = { x: 0, z: -34 };                 // 砦の中ほど
const GATE = { x: 0, z: -10 };                 // 南の大手門
const NGATE = { x: 0, z: -58 };                // 北の口（城の方へ抜ける口。門扉は無い）
const WALL_X = 24, WALL_N = -58;               // 砦の東西の柵・北の柵
const SPAWN = { x: -4, z: 96 };
const SHORE = { x: 0, z: 30 };                 // 入り江の北の岸（鉄砲組の持ち場）
const INSIDE = { x: 0, z: -30 };
const KIZU = [[-74, -240], [-70, -90], [-66, 40], [-72, 220]];   // 木津川（西の縁）
const OSAKA = { x: 260, z: -260 };             // 大坂城の方角（遠く）
const LIMIT = [0, 200, 220, 260, 200, 240];         // 段ごとの時間の限り（秒）
const GOAL_LIMIT = { 1: '夜が明け、入り江を渡れなかった', 2: '夜が明け、大手門を破れなかった', 3: '夜が明け、砦を落とせなかった', 4: '明石全登の後詰に砦を取り返された', 5: '明石全登の新手に砦を取り返された' };

const alive = (g) => g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const sum = (gs) => gs.reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
// 味方の隊は持ち場（anchor）を移すだけ。兵は走って付いてくる（名のある武将の隊は order の move で動かない）
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);

// 低い平野。砦は少し盛り上がった土の上。木津川の東の堤と西の湿地だけ起伏を付ける
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.04);
  h += 1.5 * gauss(x, z, FORT.x, FORT.z - 4, 2600);
  h += 0.9 * Math.exp(-(((x + 50) / 6) ** 2));            // 木津川の東の堤
  h -= 0.7 * Math.max(0, Math.min(1, (-x - 100) / 60));   // 川の西の湿地は低い
  return h;
}

const kit = (side, o = {}) => ({ flag: side.flag, armor: side.armor, ...o });
const sq = (side, type, n, o) => ({ type, n, o: kit(side, o) });
// 豊臣方の組（明石全登の砦の兵）
const foe = (rt, name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: at, facing: 0, order: 'hold', aggro: 12, width: 8, ...o }, list);
// 段の途中で出る豊臣方の新手（本物の兵。数える組に足し、倒す数も増やす）
function wave(rt, list, key, name, at, units, o = {}) {
  const F = rt.flags;
  const g = foe(rt, name, at, units, { order: 'attack', aggro: 26, seekRange: 60, ...o });
  F[list].push(g); F[key] += g.count;
  return g;
}

const k08_osaka_kizu = {
  // 身の回りの合戦の跡（timeslip_field.js）。木津川口：十一月半ば（今の十二月）の夜の湿地。枯れ葦・ぬかるみ・暗い土
  timeslip: {
    wet: 0.55, dust: 0.1, trample: 0.2, debris: 1, arrows: 1, reeds: 0.5, mudColor: 0x5e5446, hazeColor: 0x6a6660, poolDim: 0.5, grassLift: 0.12, grassShape: 'blade',
    grass: 0x8c8456, grassTints: [0xffffff, 0xe0d4a8, 0xbcb890], grassH: 1.25, tallGrass: 1, grassCap: 420,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  prelude: 12,
  // 見せかけの軍勢・遠くの作り物の戦いは置かない（kaito AA・AF・AV の4）
  noReserve: true, noWake: true, noTaishoRaid: true, noFrontFill: true, noDistantBattle: true, noFarFill: true, noAheadFill: true,
  frontlineDensity: false,   // 見えない所から湧く「味方の小勢・敵の小勢」も出さない（kaito AW の6）
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を何人討つ」を足さない。goals5.js）
  sides: { a: { name: '徳川勢', mon: 'hachisuka', faction: 'hachisuka' }, b: { name: '豊臣勢', mon: 'toyotomi', faction: 'toyotomi' } },
  taisho: { a: { name: '蜂須賀至鎮', def: true }, b: { name: '明石全登', def: true, fate: 'flee', survives: true } },   // 全登は討てない（後ろで馬上・最後に退く）
  date: () => '慶長十九年（1614）十一月十九日　夜明け前　摂津国 木津川口',
  history: '慶長十九年（1614）十月、徳川家康は大坂城に集まった浪人を討つため二十万ほどの大軍で大坂を囲んだ。豊臣方は秀頼のもと、真田信繁・毛利勝永・後藤又兵衛・明石全登・長宗我部盛親ら浪人衆と大野治長らが籠城の備えを固め、城の外には木津川口・博労淵・野田・福島・鴫野・今福などの砦を置いた。\n木津川口の砦は大坂湾から城へ入る舟の道を押さえる砦で、明石全登の兵およそ八百が守っていた。蜂須賀至鎮の物見が「砦の炊ぎの煙が少ない」と知らせ、家康の許しを得て、十一月十九日の夜明け前、蜂須賀至鎮およそ三千が南と東から、石川忠総およそ二千三百が舟で木津川を渡って西から攻めた。浅野長晟・池田忠雄も加わったと伝わる。\n全登は大坂城の評定に出ていて留守で、砦はその日のうちに落ちた。これが冬の陣の最初の戦となり、豊臣方は外の砦を次々に失って城に籠ることになる。\n砦の縄張り・入り江・後詰の戦いの細かい所は遊びのための推定と復元である。',
  force(rt) {
    const F = rt.flags;
    return { a: Math.max(0, 5300 - (F.ak || 0) * 20), a0: 5300, b: Math.max(0, 800 - (F.ek || 0) * 7), b0: 800 };
  },
  world: {
    seed: 1614,
    time: 'dusk',
    muddy: 0.35,
    height,
    waterSlow: true,
    streams: [{ pts: KIZU, w: 30, depth: 2.6 }, { pts: [[-66, 52], [0, 50], [80, 54], [220, 60]], w: 16, depth: 0.7 }],   // 砦の前を横切る入り江（膝までの浅瀬を渡って寄せる）
    paths: [[[SPAWN.x, SPAWN.z], [-2, 70], [0, 50], [SHORE.x, SHORE.z], [GATE.x, GATE.z + 4]]],
    tint(x, z, h, c) {
      // 低い田と葦の湿地。西ほど濡れた暗い緑、砦の土は褐色
      const w = Math.max(0, Math.min(1, (-x - 40) / 120));
      c.setRGB(c.r * (1 - 0.3 * w), c.g * (1 - 0.2 * w), c.b * (1 - 0.3 * w));
      const d = Math.hypot(x - FORT.x, (z - FORT.z) * 0.8);
      if (d < 36) { const k = 1 - d / 36; c.setRGB(c.r * (1 - 0.5 * k) + 0.2 * k, c.g * (1 - 0.5 * k) + 0.15 * k, c.b * (1 - 0.5 * k) + 0.08 * k); }
      c.multiplyScalar(0.84 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05)));
    },
    clear: (x, z) => (Math.abs(x - FORT.x) < 36 && z > -130 && z < 130) || (x < -30 && x > -60 && z > -50 && z < 0),
    trees: 60,
    tufts: 2400,
    treeDensity: (x, z) => (x > 70 || z < -140 ? 0.6 : 0.12),
    fleeOut: (x, z, team) => (team === 1 ? z < -150 || x > 120 : z > 170),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const faceN = Math.PI;

    // ---- 砦：柵の囲み・南の大手門・北の口・櫓・篝火 ----
    const fort0 = rt.scene.children.length;
    const fence = (a, b) => wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    fence([-WALL_X, GATE.z], [-3.4, GATE.z]); fence([3.4, GATE.z], [WALL_X, GATE.z]);
    fence([-WALL_X, GATE.z], [-WALL_X, WALL_N]); fence([WALL_X, GATE.z], [WALL_X, WALL_N]);
    fence([-WALL_X, WALL_N], [-3.4, WALL_N]); fence([3.4, WALL_N], [WALL_X, WALL_N]);
    rt.scene.add(kabukimon(W, GATE.x, GATE.z + 1.5, 7, 0));
    rt.scene.add(kabukimon(W, NGATE.x, NGATE.z - 1.5, 7, Math.PI));
    F.gate = rt.army.addStruct({ seg: [-3.4, GATE.z, 3.4, GATE.z], nx: 0, nz: 1, hp: 300, maxHp: 300, team: 1, name: '砦の大手門' });
    F.gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.6, 0.35), new THREE.MeshLambertMaterial({ color: 0x4a3626 }));
    F.gateMesh.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 1.8, GATE.z + 0.2);
    F.gateMesh.castShadow = true; rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    for (const [x, z] of [[-18, GATE.z - 3], [18, GATE.z - 3], [-18, WALL_N + 4], [18, WALL_N + 4]]) rt.scene.add(yagura(W, x, z, { mon: 'toyotomi', team: 1 }));
    for (const [x, z] of [[-9, GATE.z + 4], [9, GATE.z + 4], [-14, -30], [14, -30], [-7, WALL_N + 3], [7, WALL_N + 3]]) { try { rt.scene.add(kagaribi(W, x, z)); } catch (e) { console.warn(e); } }
    for (const [x, z] of [[-12, -16], [12, -16], [-14, -48], [14, -48]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 7));
    // 石川勢が木津川を渡って来た舟（東の岸に寄せてある）と、砦の舟入りの舟。同じ形を使い回す
    for (const [x, z, rot] of [[-56, -16, 0.1], [-57, -30, 0.05], [-56, -44, -0.06], [-60, 12, 0.12], [-62, -70, 0.02]]) {
      try { rt.scene.add(kobune(x, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.05, z, rot, 7)); } catch (e) { console.warn(e); }
    }
    // 砦と舟は平野の霧に沈めない（入り江の岸から砦の柵・櫓・門が見える）
    farSight(rt.scene.children.slice(fort0), { W, ground: { x: FORT.x, z: FORT.z, r: 48 } });
    // 蜂須賀の陣の卍の幟（至鎮の旗本の後ろ）
    for (const [x, z] of [[-14, SPAWN.z + 16], [0, SPAWN.z + 18], [14, SPAWN.z + 16]]) rt.scene.add(nobori(W, x, z, 'hachisuka', 7));
    // 大坂城（遠景。兵は置かない）：本丸・二の丸と、こちらを向く惣構えの西と南。osaka_far.js
    try {
      osakaFar(rt, { x: OSAKA.x + 10, z: OSAKA.z - 70, s: 1.4, big: 2.8, land: [[-200, -800, 700, -181]],
        sogamae: [{ pts: [[120, -180], [440, -180]], side: 1, water: false, s: 1.4 }, { pts: [[120, -440], [120, -180]], side: 1, water: true, s: 1.4 }] });
    } catch (e) { console.warn(e); }

    // ---- 味方：蜂須賀至鎮の旗本（馬上・後ろ）、蜂須賀の先手（主人公が率いて前へ）、舟で渡った石川忠総の手 ----
    F.lord = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀至鎮の旗本', anchor: { x: SPAWN.x, z: SPAWN.z + 12 }, facing: faceN, width: 8, aggro: 4, morale: 100, noRout: true, fullStrength: true },
      [sq(HACHI, 'busho', 1, { name: '蜂須賀至鎮', invuln: true, horse: true }), sq(HACHI, 'samurai', 16)]);
    F.saki = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の先手', anchor: { x: SPAWN.x - 2, z: SPAWN.z - 8 }, facing: faceN, width: 12, aggro: 14, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(HACHI, 'samurai', 5), sq(HACHI, 'ashigaru', 30), sq(HACHI, 'gun', 9), sq(HACHI, 'bow', 3)]);
    F.ishi = allyGroup(rt, { faction: 'ishikawa', name: '石川忠総の手', anchor: { x: -44, z: -30 }, facing: Math.PI / 2, width: 8, aggro: 12, morale: 95, noRout: true, fullStrength: true },
      [sq(ISHI, 'busho', 1, { name: '石川忠総', invuln: true, horse: true }), sq(ISHI, 'samurai', 4), sq(ISHI, 'ashigaru', 20), sq(ISHI, 'gun', 6)]);
    F.allies = [F.saki, F.ishi];
    for (const g of F.allies) g.dmgMult = 0.6;   // 味方だけで砦が落ちない（主人公の槍が要る）
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: SPAWN.x - 2, z: SPAWN.z - 3 }, faceN, [{ kind: 'spear', n }]);

    // ---- 豊臣方：明石全登の砦の兵（全登は留守。留守居が指図する） ----
    F.front = foe(rt, '入り江の岸の鉄砲組', SHORE, [sq(TOYO, 'samurai', 2), sq(TOYO, 'gun', 9), sq(TOYO, 'ashigaru', 13)], { aggro: 16, width: 12 });
    F.wallG = foe(rt, '大手門の守り', { x: 0, z: GATE.z - 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'bow', 3), sq(TOYO, 'gun', 3), sq(TOYO, 'ashigaru', 5)], { aggro: 14 });
    F.garrison = foe(rt, '明石の守兵', { x: 0, z: -40 }, [sq(TOYO, 'samurai', 6), sq(TOYO, 'ashigaru', 17), sq(TOYO, 'gun', 5), sq(TOYO, 'bow', 2)], { aggro: 3, width: 10 });   // 門が破れるまでは砦の奥に控える（門越しに槍を出さない）
    for (const g of [F.wallG, F.garrison]) g.noFrontline = true;
    F.garrison.noAI = true;   // 門が破れるまで動かない（stage3 で放つ）
    F.foes = [F.front, F.wallG, F.garrison];
    F.s1 = [F.front]; F.fN = F.front.count;

    // 戦の前の話（蜂須賀の陣・砦の中）。家康は茶臼山の本陣にいて、この場にはいない
    rt.setPhase('brief');
    // 会話の二十秒も、行き先（岸の鉄砲組）のピンを先に出す。目当て無しで立たせない（newbie60）
    rt.obj('main', '入り江を渡り、岸の鉄砲組を討つ', 'main');
    rt.marker('k08', SHORE, '岸の鉄砲組', { h: 3 });
    rt.after(0.5, () => rt.say('蜂須賀の物見', '砦の炊ぎの煙が少のうございます。守りは手薄かと', 3.8));
    rt.after(4.6, () => rt.say('蜂須賀至鎮', '大御所のお許しは出た。夜が明ける前に木津川口の砦を取る', 4));
    rt.after(9, () => rt.say('石川忠総', '我らは舟で川を渡った。西の柵から攻め入る', 3.6));
    rt.after(13, () => rt.say('蜂須賀至鎮', `${nm(rt)}、先手を率いて入り江を渡れ。岸の鉄砲組から払え`, 4));
    rt.after(17.2, () => rt.say(nm(rt), '承知。先手、続け', 2.6));
    rt.after(20, () => rt.say('砦の留守居', '明石様は城の評定でお留守じゃ。持ちこたえよ', 3.4));
    rt.after(20.2, () => this.stage1(rt));
  },

  // ① 入り江を渡り、岸の鉄砲組を討つ
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.tS = rt.t;
    rt.setPhase('assault');
    rt.obj('main', '入り江を渡り、岸の鉄砲組を討つ', 'main');
    rt.marker('k08', () => { const g = F.s1.find(alive); return g ? centerOf(g)() : SHORE; }, '岸の鉄砲組', { red: true, group: F.front });
    hold(F.saki, SHORE.x - 2, SHORE.z + 4); F.saki.aggro = 22;
    hold(F.lord, SPAWN.x, SPAWN.z - 10);
    F.front.order = 'attack'; F.front.aggro = 20;
  },
  // ② 砦の大手門を味方と打ち破る
  stage2(rt) {
    const F = rt.flags;
    F.step = 2; F.tS = rt.t;
    rt.award((t) => t.side.push('入り江を渡り、岸の鉄砲組を討った'), '岸の鉄砲組を討った');
    rt.unmark('k08');
    for (const g of F.s1) if (alive(g)) { g.routed = true; g.order = 'flee'; }
    rt.obj('main', '砦の大手門を味方と打ち破る', 'main');
    rt.marker('k08', { x: GATE.x, z: GATE.z + 4 }, '砦の大手門', { h: 3, red: true });
    hold(F.saki, GATE.x, GATE.z + 9); F.saki.aggro = 24;
    hold(F.ishi, -WALL_X - 7, -30); F.ishi.aggro = 18;
    hold(F.lord, 0, 44);
    rt.say('蜂須賀至鎮', '門に取り付け！　鉄砲は櫓を撃て', 3.4);
    rt.after(4, () => { if (F.step === 2) rt.say('砦の留守居', '夜襲じゃ！　柵の内から撃て撃て', 3); });
  },
  // ③ 砦の内の守兵を討つ
  stage3(rt) {
    const F = rt.flags;
    F.step = 3; F.tS = rt.t;
    rt.award((t) => t.side.push('砦の大手門を破った'), '砦の大手門を破った');
    rt.unmark('k08');
    rt.obj('main', '砦の内へ入り、明石の守兵を討つ', 'main');
    // 門の脇の柵を押し倒し、石川勢も西の柵を破る（味方が詰まらず流れ込む）
    for (const s of rt.army.structs || []) {
      if (s.team !== 1 || !s.seg) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const southGap = s.seg[1] === GATE.z && s.seg[3] === GATE.z && Math.abs(mx) < 12;
      const westGap = s.seg[0] === -WALL_X && s.seg[2] === -WALL_X && mz > -42 && mz < -20;
      if (southGap || westGap) { s.hp = 0; s.alive = false; if (s.mesh) s.mesh.visible = false; }
    }
    hold(F.saki, INSIDE.x + 4, INSIDE.z); F.saki.aggro = 24;
    hold(F.ishi, INSIDE.x - 10, INSIDE.z - 6); F.ishi.aggro = 22;
    hold(F.lord, 0, 14);
    F.garrison.noAI = false;
    for (const g of [F.wallG, F.garrison]) { g.order = 'attack'; g.aggro = 16; }
    F.s3 = [F.garrison, F.wallG]; F.gN = sum(F.s3);
    rt.marker('k08', () => { const g = F.s3.find(alive); return g ? centerOf(g)() : INSIDE; }, '明石の守兵', { red: true, group: F.garrison });
    rt.say('蜂須賀至鎮', '門が開いた！　内へ攻め入れ', 3.2);
    rt.after(3.6, () => { if (F.step === 3) rt.say('石川忠総', '西の柵も破った！　挟み込め', 3); });
  },
  // ④ 明石勢の後詰を北の口で止める（後詰が減ると全登が新手を出し、⑤になる）
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.tS = rt.t;
    rt.award((t) => t.side.push('砦の内の明石の守兵を討った'), '砦の守兵を討った');
    rt.unmark('k08');
    for (const g of [...F.foes, ...F.s3]) if (alive(g)) { g.routed = true; g.order = 'flee'; }
    rt.obj('main', '明石勢の後詰を北の口で止める', 'main');
    rt.banner('木津川口の砦、落ちる', '明石全登が城から戻って来る');
    // 全登は旗本と後ろで馬上（討てない）。前の兵が北の口へ押し寄せる
    F.akashi = enemyGroup(rt, { fixed: true, name: '明石全登の旗本', faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: { x: 12, z: -122 }, facing: 0, order: 'hold', aggro: 0, width: 8, noRout: true, morale: 100 },
      [sq(TOYO, 'busho', 1, { name: '明石全登', invuln: true, horse: true }), sq(TOYO, 'samurai', 8)]);
    F.akashi.noFrontline = true;
    F.relief = [
      enemyGroup(rt, { fixed: true, name: '明石勢の後詰', faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: { x: -6, z: -108 }, facing: 0, order: 'attack', aggro: 30, seekRange: 70, width: 12, morale: 88 },
        [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 18), sq(TOYO, 'gun', 6)]),
      enemyGroup(rt, { fixed: true, name: '大坂方の鉄砲衆', faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: { x: 22, z: -104 }, facing: 0, order: 'attack', aggro: 30, seekRange: 70, width: 8, morale: 85 },
        [sq(TOYO, 'samurai', 1), sq(TOYO, 'gun', 6), sq(TOYO, 'ashigaru', 5)]),
    ];
    F.rN = sum(F.relief);
    for (const g of F.relief) { g.order = 'move'; g.dest = { x: NGATE.x, z: NGATE.z - 6 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; }; }
    hold(F.saki, NGATE.x + 3, NGATE.z + 6); F.saki.aggro = 24;
    hold(F.ishi, NGATE.x - 8, NGATE.z + 8); F.ishi.aggro = 22;
    hold(F.lord, 0, -20);
    rt.marker('k08', { x: NGATE.x, z: NGATE.z + 2 }, '砦の北の口', { h: 3, red: true });
    rt.say('明石全登', '留守の間に砦を取られたか。取り返せ！', 3.4);
    rt.after(4, () => rt.say('蜂須賀至鎮', '北の口を固めよ。後詰を押し返せば、この砦は我らのもの', 3.8));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main'); rt.unmark('k08');
    rt.award((t) => { t.main = true; t.special = { label: '木津川口の砦を奪い、明石全登の後詰を退けた', pts: 20 }; }, '明石全登の後詰を退けた');
    rt.banner('木津川口の戦い　勝ち', '大坂の外の砦が一つ落ちた');
    rt.player.u.invuln = true;
    for (const g of [...(F.relief || []), F.akashi]) if (alive(g)) { g.noRout = false; g.routed = true; g.order = 'flee'; }
    rt.say('明石全登', '間に合わなんだ。城へ引け', 3);
    rt.after(3.6, () => rt.say('蜂須賀至鎮', '木津川口は落ちた。海から城への舟の道はこれで絶えた', 3.8));
    rt.after(8, () => rt.say('石川忠総', '大御所へ知らせを。次は博労淵の砦じゃ', 3.4));
    rt.finish({ scriptedEnd: true }, 13);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objFail('main'); rt.tracker.main = false; rt.unmark('k08');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  onStructDestroyed(rt, s) {
    if (s === rt.flags.gate) { sfx('wood', 0.8); rt.bark('大手門が破れた'); }
  },
  onKill(rt, v) { const F = rt.flags; if (v.team === 1) F.ek++; else F.ak++; },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    // 砦の兵は手薄で浮き足立っている（史実）。豊臣方の組は傷を軽めにそろえる（夜襲の一人が数突きで倒れない）
    // 門を打つ間は柵と櫓の陰から撃たれるだけなので、さらに軽く（門の前で数発で倒れない）
    if (!(F.lightT > rt.t)) { F.lightT = rt.t + 1; const m = F.step <= 2 ? 0.3 : 0.5; for (const g of rt.army.groups) if (g.team === 1) g.dmgMult = m; }
    if (rt.t - F.tS > LIMIT[F.step]) { this.lose(rt, GOAL_LIMIT[F.step]); return; }
    if (broken(F.saki) && broken(F.ishi)) { this.lose(rt, '蜂須賀の先手と石川勢がともに崩れた'); return; }
    if (F.step === 1) {
      const n = sum(F.s1);
      if (!F.w1 && n <= F.fN * 0.6) {
        F.w1 = wave(rt, 's1', 'fN', '砦から出た鉄砲組', { x: 0, z: GATE.z + 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'gun', 5), sq(TOYO, 'ashigaru', 8)]);
        rt.say('砦の留守居', '岸の者を見捨てるな。門から出て撃ちかけよ', 3.2);
        return;
      }
      if (F.w1 && n <= F.fN * 0.15 && near(P, SHORE, 34)) this.stage2(rt);
    } else if (F.step === 2) {
      const st = F.gate;
      if (!st || !st.alive || st.hp <= 0) { this.stage3(rt); return; }
      rt.objProgress('main', `${Math.round(100 - (100 * st.hp) / st.maxHp)}／100`);
      // 寄せた味方が門を打つ（門の前に味方が多いほど早い。主人公がそばで打てばさらに早い）
      let n = 0;
      for (const u of F.saki.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 16) n++;
      if (near(P, GATE, 6)) n += 4;
      if (alive(F.wallG) && F.wallG.count > 6) n = Math.floor(n * 0.6);
      if (n) { st.hp -= dt * 0.9 * Math.min(n, 14); if (st.hp <= 0) { st.hp = 0; st.alive = false; if (st.mesh) st.mesh.visible = false; this.onStructDestroyed(rt, st); } }
    } else if (F.step === 3) {
      const n = sum(F.s3);
      if (!F.w3 && n <= F.gN * 0.5) {
        F.w3 = wave(rt, 's3', 'gN', '砦の奥の守兵', { x: 0, z: WALL_N + 6 }, [sq(TOYO, 'samurai', 3), sq(TOYO, 'ashigaru', 12), sq(TOYO, 'gun', 3)]);
        rt.say('砦の留守居', '奥の者も出よ。ここで退いては明石様に顔向けできぬ', 3.4);
        return;
      }
      if (F.w3 && n <= F.gN * 0.15) this.stage4(rt);
    } else if (F.step >= 4) {
      const n = sum(F.relief);
      if (!F.w4 && n <= F.rN * 0.55) {
        // ⑤ 全登が新手を出す（段を一つ進め、北の口の守りを続ける）
        F.step = 5; F.tS = rt.t;
        rt.award((t) => t.side.push('北の口で明石勢の後詰を止めた'), '明石勢の後詰を止めた');
        rt.obj('main', '明石全登の新手を北の口で退ける', 'main');
        F.w4 = wave(rt, 'relief', 'rN', '明石勢の新手', { x: -12, z: -118 }, [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 14), sq(TOYO, 'gun', 4)]);
        F.w4.order = 'move'; F.w4.dest = { x: NGATE.x, z: NGATE.z - 6 }; F.w4.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; };
        rt.say('明石全登', '新手を出せ。北の口を押し破れ', 3);
        return;
      }
      if (F.w4 && n <= F.rN * 0.2) this.win(rt);
    }
  },
};

// bot の頭：近い敵を突き、段の行き先へ。門の段は門を打つ
k08_osaka_kizu.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  const gc = F.saki.center();
  if (u.hp < u.maxHp * 0.35 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.invuln && o.type !== 'dummy' && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e && F.step >= 1) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const at = (q, r = 3) => goTo(p, inp, q.x, q.z, r);
  if (F.step <= 1) { const g = F.s1.find(alive); at(g ? g.center() : SHORE, 4); return; }
  if (F.step === 2) {
    if (Math.hypot(u.pos.x - GATE.x, u.pos.z - (GATE.z + 3)) > 3) { at({ x: GATE.x, z: GATE.z + 3 }, 2); return; }
    p.yaw = Math.atan2(GATE.x - u.pos.x, GATE.z - u.pos.z);
    inp.leftPressed = Math.random() < 0.6;
    return;
  }
  if (F.step === 3) { const g = F.s3.find(alive); at(g ? g.center() : INSIDE, 3); return; }
  at({ x: NGATE.x, z: NGATE.z + 4 }, 4);
};

// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.k08_osaka_kizu = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.fN, sum(F.s1), F.fN * 0.15);
  if (F.step === 3) return cut(F.gN, sum(F.s3), F.gN * 0.15);
  return F.step >= 4 ? cut(F.rN, sum(F.relief), F.rN * 0.2) : null;
};
// 戦の進行の札（段）：F.step の 1〜5（五つ。goals5.js が「敵を何人討つ」で埋めない）
setStages('k08_osaka_kizu', [['入り江を渡り、岸の鉄砲組を討つ', 1], ['砦の大手門を味方と打ち破る', 2], ['砦の内へ入り、明石の守兵を討つ', 3], ['明石勢の後詰を北の口で止める', 4], ['明石全登の新手を北の口で退ける', 5]]);

export { k08_osaka_kizu };
export default k08_osaka_kizu;
