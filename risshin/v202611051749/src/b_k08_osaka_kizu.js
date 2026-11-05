// ======================================================================
// 徳川編 8. 大坂冬の陣・木津川口の戦い（慶長十九年十一月十九日の未明・1614）
// 手本と出所：docs/battle_refs/k08_osaka_kizu.md・docs/battle_learn/k08_osaka_kizu.md（Wikipedia・大坂の陣絵巻・城跡の記録）。
// 史実：蜂須賀の物見（森村重）が「砦の炊ぎの煙が少ない」と知らせ、家康の許しを得て、蜂須賀至鎮・浅野長晟・池田忠雄の約三千が
//   明石全登の砦（約八百）を攻めた。出陣は明け六つの約束だったが、蜂須賀勢は午前三時ごろ抜け駆けで出た。
//   舟手（軍船）が木津川から、陸の別手が砦の背へ回って民家に火をかけ、水と陸で挟み撃ちにした。
//   遅れた浅野勢は急いで川を渡り、溺れる者を多く出した。全登は大坂城の評定に出ていて留守で、一族の明石全延が守ったが
//   指図がまとまらず、砦はその日のうちに落ち、守兵は博労淵の方へ退いた。冬の陣の最初の戦。
// 主人公は蜂須賀勢の侍大将。家康・秀忠・秀頼・全登はこの場にいない。大坂城は北東に遠く見えるだけ。
// 段（史実の時刻の順。段ごとに夜明けまでの時間の限り）：
//   ①入り江を渡り、岸の鉄砲組を討つ（抜け駆け）②砦の大手門を味方と打ち破る（舟手が川から撃ち、別手が背の民家に火・浅野が遅れて渡る）
//   ③砦の内へ入り、明石の守兵を討つ（挟み撃ち）④砦の北の口で明石全延の組を追い払う ⑤北の口に卍の幟を立てる（守兵は博労淵へ退く）
// 兵の比（一の1）：史実は三千対八百（約四対一）。場の本物の兵は味方約 186 対 豊臣方約 64（約三対一。重さの上限 250 ほど）。見せかけの軍勢は置かない。
//   旗は蜂須賀の卍・浅野・池田の揚羽蝶・豊臣だけ（徳川・織田の旗を立てない）。家康の定め：蜂須賀が追手・浅野が搦手・池田が遊撃。
//   この場の大将の至鎮は入り江の南の陣幕の内で床几に座り、旗本に囲まれて動かない。浅野長晟は馬上で搦手を率いる。
// 地形：大坂の低い平野と木津川の河口を手で復元（平らな低地。川筋・砦の置き場は推定）。
// 座標：南が +z（蜂須賀勢）、北が −z（砦の北の口と博労淵・大坂城）、東が +x（大坂城の方）、西が −x（木津川・大坂湾）。
// ======================================================================
import { enemyGroup, allyGroup, centerOf, nm, wallLine } from './bhelp.js';
import { nobori, yagura, kabukimon, tobira, kagaribi, kobune, jinmaku, shogi, hut, takataba } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { farSight } from './far_sight.js';
import { osakaFar } from './osaka_far.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut } from './stages.js';
import { setStages } from './b_k_help.js';

const HACHI = { flag: 'hachisuka', armor: 0x1c1b1a };   // 蜂須賀（卍）
const ASANO = { flag: 'asano', armor: 0x1f1e1c };       // 浅野長晟（搦手）
const IKEDA = { flag: 'ageha', armor: 0x1d1c1b };       // 池田忠雄（遊撃。揚羽蝶。忠雄は十三歳で、家老が手を率いる）
const TOYO = { flag: 'toyotomi', armor: 0x22201d };     // 明石の砦の兵（豊臣方）

// 置き場（x=東+、z=南+）
const FORT = { x: 0, z: -34 };                 // 砦の中ほど
const GATE = { x: 0, z: -10 };                 // 南の大手門
const NGATE = { x: 0, z: -58 };                // 北の口（博労淵・城の方へ抜ける口。門扉は無い）
const WALL_X = 24, WALL_N = -58;               // 砦の東西の柵・北の柵
const SPAWN = { x: -4, z: 96 };
const HONJIN = { x: -4, z: 116 };             // 至鎮の本陣（入り江の南。陣幕）
const SEAT = { x: HONJIN.x, z: HONJIN.z - 1.5 };   // 至鎮の床几
const IKEDA_AT = { x: -30, z: 96 };            // 池田の手（遊撃。木津川寄りの南西）
const SHORE = { x: 0, z: 30 };                 // 入り江の北の岸（鉄砲組の持ち場）
const INSIDE = { x: 0, z: -30 };
const VILLAGE = [[-22, -82, 0.1], [-6, -88, 0], [12, -84, -0.08], [30, -78, 0.12]];   // 砦の背の民家（別手が火をかける）
const ASANO_AT = { x: 52, z: 150 };            // 浅野勢（約束の明け六つに出る。抜け駆けを知って急ぐ）
const KIZU = [[-74, -240], [-70, -90], [-66, 40], [-72, 220]];   // 木津川（西の縁）
const BOATS = [[-60, -14, 0.1], [-61, -28, 0.04], [-60, -42, -0.05], [-62, -56, 0.02], [-59, 2, 0.12], [-63, -70, -0.03]];   // 蜂須賀の舟手の軍船
const OSAKA = { x: 260, z: -260 };             // 大坂城の方角（遠く）
const LIMIT = [0, 200, 220, 240, 200, 120];         // 段ごとの時間の限り（秒）
const GOAL_LIMIT = { 1: '夜が明け、入り江を渡れなかった', 2: '夜が明け、大手門を破れなかった', 3: '夜が明け、砦を落とせなかった', 4: '北の口を破れず、砦を落とし切れなかった', 5: '北の口に幟を立てられなかった' };

const alive = (g) => g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const sum = (gs) => gs.reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
// 味方の隊は持ち場（anchor）を移すだけ。兵は走って付いてくる（名のある武将の隊は order の move で動かない）
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);
// 北の口の守りに残る数（柵の外へ押し出された者は守りから外れた者として数えない。追えずに④が止まらないように）
const northLeft = (F) => F.w3.units.filter((u) => u.alive && Math.abs(u.pos.x) < WALL_X - 0.5 && u.pos.z < GATE.z && u.pos.z > WALL_N - 4).length;
const flee = (g) => { if (!alive(g)) return; g.noRout = false; g.noAI = false; g.routed = true; g.order = 'flee'; for (const u of g.units) u.perch = null; };

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
// 豊臣方の組（明石の砦の兵）
const foe = (rt, name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: at, facing: 0, order: 'hold', aggro: 12, width: 8, ...o }, list);
// 持ち場に控えていた豊臣方の新手を放つ（本物の兵。数える組に足し、倒す数も増やす）
function join(rt, list, key, g) {
  const F = rt.flags;
  if (!alive(g)) return;
  g.noAI = false; g.order = 'attack'; g.aggro = 26; g.seekRange = 60;
  F[list].push(g); F[key] += g.count;
}
// 高い所（櫓・舟の上）に兵を据える
function perch(g, x, y, z, f) {
  g.units.forEach((u, i) => {
    const px = x + (i ? 0.7 : -0.7);
    u.pos.set(px, y, z); u.perch = { x: px, y, z }; u.mesh.position.copy(u.pos);
    u.heading = f; u.mesh.rotation.y = f; u.gunAmmo = 60;
  });
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
  allyReports: false,     // 使番の「〇〇殿の隊は北西で持ち場を守る」を三十秒ごとに出さない（五の1：字を足さない）
  sides: { a: { name: '徳川勢', mon: 'hachisuka', faction: 'hachisuka' }, b: { name: '豊臣勢', mon: 'toyotomi', faction: 'toyotomi' } },
  taisho: { a: { name: '蜂須賀至鎮', def: true }, b: { name: '明石全延', def: true, fate: 'flee', survives: true } },   // 全登は留守。代わりに守った全延は博労淵へ退く（討てない）
  date: () => '慶長十九年（1614）十一月十九日　未明　摂津国 木津川口',
  history: '慶長十九年（1614）十月、徳川家康は大坂城に集まった浪人を討つため二十万ほどの大軍で大坂を囲んだ。豊臣方は城の外に木津川口・博労淵・野田・福島・鴫野・今福などの砦を置いた。\n木津川口の砦は大坂湾から城へ入る舟の道を押さえる砦で、明石全登の兵およそ八百が守っていた。蜂須賀至鎮の物見が「砦の炊ぎの煙が少ない」と知らせ、家康は蜂須賀・浅野長晟・池田忠雄のおよそ三千に攻めを命じた。出陣は明け六つの約束だったが、蜂須賀勢は十九日の午前三時ごろ抜け駆けで出た。\n舟手は木津川から、陸の別手は砦の背へ回って民家に火をかけ、水と陸で挟み撃ちにした。遅れた浅野勢は急いで川を渡り、溺れる者を多く出した。全登は城の評定に出ていて留守で、一族の明石全延が守ったが指図がまとまらず、砦はその日のうちに落ち、守兵は博労淵の方へ退いた。',
  force(rt) {
    const F = rt.flags;
    return { a: Math.max(0, 3000 - (F.ak || 0) * 15), a0: 3000, b: Math.max(0, 800 - (F.ek || 0) * 13), b0: 800 };
  },
  world: {
    seed: 1614,
    time: 'night',   // 午前三時の抜け駆け。夜の戦は夜に（四の6）
    muddy: 0.35,
    height,
    waterSlow: true,
    streams: [{ pts: KIZU, w: 30, depth: 2.6 }, { pts: [[-66, 52], [0, 50], [30, 51]], w: 16, depth: 0.7 }, { pts: [[24, 51], [80, 54], [220, 60]], w: 16, depth: 2.0 }],   // 砦の前を横切る入り江。西は膝までの浅瀬（先手が渡る）、東は胸までの深み（浅野勢が急いで渡り溺れる）
    paths: [[[SPAWN.x, SPAWN.z], [-2, 70], [0, 50], [SHORE.x, SHORE.z], [GATE.x, GATE.z + 4]], [[0, NGATE.z], [2, -100], [6, -150]]],
    tint(x, z, h, c) {
      // 低い田と葦の湿地。西ほど濡れた暗い緑、砦の土は褐色
      const w = Math.max(0, Math.min(1, (-x - 40) / 120));
      c.setRGB(c.r * (1 - 0.3 * w), c.g * (1 - 0.2 * w), c.b * (1 - 0.3 * w));
      const d = Math.hypot(x - FORT.x, (z - FORT.z) * 0.8);
      if (d < 36) { const k = 1 - d / 36; c.setRGB(c.r * (1 - 0.5 * k) + 0.2 * k, c.g * (1 - 0.5 * k) + 0.15 * k, c.b * (1 - 0.5 * k) + 0.08 * k); }
      c.multiplyScalar(0.84 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05)));
    },
    clear: (x, z) => (Math.abs(x - FORT.x) < 36 && z > -100 && z < 130) || (x < -30 && x > -60 && z > -50 && z < 0) || (x > 30 && x < 70 && z > -100 && z < 170),
    trees: 60,
    tufts: 2400,
    treeDensity: (x, z) => (x > 70 || z < -140 ? 0.6 : 0.12),
    fleeOut: (x, z, team) => (team === 1 ? z < -150 || x > 120 : z > 190),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.drown = 0;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const faceN = Math.PI;

    // ---- 砦：柵の囲み・南の大手門・北の口・櫓・篝火 ----
    const fort0 = rt.scene.children.length;
    const fence = (a, b) => wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    fence([-WALL_X, GATE.z], [-3.4, GATE.z]); fence([3.4, GATE.z], [WALL_X, GATE.z]);
    fence([-WALL_X, GATE.z], [-WALL_X, WALL_N]); fence([WALL_X, GATE.z], [WALL_X, WALL_N]);
    fence([-WALL_X, WALL_N], [-3.4, WALL_N]); fence([3.4, WALL_N], [WALL_X, WALL_N]);
    rt.scene.add(kabukimon(W, GATE.x, GATE.z + 1.5, 7, 0, { doors: false }));
    rt.scene.add(kabukimon(W, NGATE.x, NGATE.z - 1.5, 7, Math.PI));
    F.gate = rt.army.addStruct({ seg: [-3.4, GATE.z, 3.4, GATE.z], nx: 0, nz: 1, hp: 300, maxHp: 300, team: 1, name: '砦の大手門' });
    // 扉は板を矧ぎ、貫と乳金物を打った二枚の扉（props の tobira）。破れると内へ倒れる（army の structFall）
    F.gateMesh = tobira(W, GATE.x, GATE.z + 1.5, 6.9, 0, { h: 3.1 });
    F.gateMesh.userData.noFreeze = true;
    F.gateMesh.traverse((o) => { if (o.isMesh) o.userData.noBatch = true; });
    rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    for (const [x, z] of [[-18, GATE.z - 3], [18, GATE.z - 3], [-18, WALL_N + 4], [18, WALL_N + 4]]) rt.scene.add(yagura(W, x, z, { mon: 'toyotomi', team: 1 }));
    for (const [x, z] of [[-9, GATE.z + 4], [9, GATE.z + 4], [-14, -30], [14, -30], [-7, WALL_N + 3], [7, WALL_N + 3]]) { try { rt.scene.add(kagaribi(W, x, z)); } catch (e) { console.warn(e); } }
    for (const [x, z] of [[-12, -16], [12, -16], [-14, -48], [14, -48]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 7));
    // 砦の背（北）の民家。②で蜂須賀の別手が火をかける
    for (const [x, z, r] of VILLAGE) { try { rt.scene.add(hut(W, x, z, 7, 5, r, { h: 2.6 })); } catch (e) { console.warn(e); } }
    // 蜂須賀の舟手の軍船（木津川に浮かべ、川から砦を撃つ。同じ形を使い回す）
    for (const [x, z, rot] of BOATS) {
      try { rt.scene.add(kobune(x, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.05, z, rot, 7)); } catch (e) { console.warn(e); }
    }
    // 砦と舟は平野の霧に沈めない（入り江の岸から砦の柵・櫓・門が見える）
    farSight(rt.scene.children.slice(fort0), { W, ground: { x: FORT.x, z: FORT.z, r: 48 } });
    // 至鎮の本陣（陣幕の内に至鎮と旗本が本当にいる。kaito AV18・BH1）
    rt.scene.add(jinmaku(W, HONJIN.x, HONJIN.z, 14, 10, 5, { mon: 'hachisuka' }));
    for (const [x, z] of [[HONJIN.x - 10, HONJIN.z + 4], [HONJIN.x, HONJIN.z + 8], [HONJIN.x + 10, HONJIN.z + 4], [HONJIN.x - 10, HONJIN.z - 6], [HONJIN.x + 10, HONJIN.z - 6]]) rt.scene.add(nobori(W, x, z, 'hachisuka', 7));
    rt.scene.add(kagaribi(W, HONJIN.x + 4, HONJIN.z - 7));
    // 浅野勢の幟（約束の刻を待つ陣。南東）
    for (const [x, z] of [[ASANO_AT.x - 8, ASANO_AT.z + 6], [ASANO_AT.x + 8, ASANO_AT.z + 6]]) rt.scene.add(nobori(W, x, z, 'asano', 6));
    // 大坂城（遠景。兵は置かない）：本丸・二の丸と、こちらを向く惣構えの西と南。osaka_far.js
    try {
      osakaFar(rt, { x: OSAKA.x + 10, z: OSAKA.z - 70, s: 1.4, big: 2.8, land: [[-200, -800, 700, -181]],
        sogamae: [{ pts: [[120, -180], [440, -180]], side: 1, water: false, s: 1.4 }, { pts: [[120, -440], [120, -180]], side: 1, water: true, s: 1.4 }] });
    } catch (e) { console.warn(e); }

    // ---- 味方：至鎮の旗本（陣幕の内）、先手（主人公が率いる）、別手（砦の背へ回る）、舟手（川から撃つ）、浅野の搦手（遅れて渡る） ----
    // この場の大将は陣幕の内の床几に腰を下ろして動かない（kaito AV7）。旗本は陣幕の内と前を固める
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, faceN, { gunbai: true, color: 0x2a2622 }));
    F.seat = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀至鎮', anchor: SEAT, facing: faceN, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq(HACHI, 'busho', 1, { name: '蜂須賀至鎮', invuln: true, horse: false, keep: true })]);
    F.seat.stay = true; F.seat.noAI = true; F.seat.noFrontline = true;
    for (const u of F.seat.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z - 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };
    }
    F.lord = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀至鎮の旗本', fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z - 6 }, facing: faceN, width: 10, aggro: 4, seekRange: 12, order: 'hold', morale: 100, noRout: true, fullStrength: true },
      [sq(HACHI, 'samurai', 16), sq(HACHI, 'cavalry', 4)]);
    F.lord.stay = true; F.lord.noFrontline = true;
    F.saki = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の先手', anchor: { x: SPAWN.x - 2, z: SPAWN.z - 8 }, facing: faceN, width: 12, aggro: 14, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(HACHI, 'samurai', 6), sq(HACHI, 'ashigaru', 32), sq(HACHI, 'gun', 12), sq(HACHI, 'bow', 3)]);
    // 蜂須賀の別手（陸から砦の背へ回り、民家に火をかける）
    F.east = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の別手', anchor: { x: 46, z: 74 }, facing: faceN, width: 10, aggro: 10, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(HACHI, 'samurai', 4), sq(HACHI, 'ashigaru', 18), sq(HACHI, 'gun', 6)]);
    // 浅野長晟の搦手（約束の明け六つまで南東の陣で待つ。②で抜け駆けを知り、入り江を急いで渡る）
    F.asano = allyGroup(rt, { faction: 'asano', name: '浅野長晟の手', anchor: { x: ASANO_AT.x, z: ASANO_AT.z }, facing: faceN, width: 10, aggro: 4, morale: 95, noRout: true, fullStrength: true },
      [sq(ASANO, 'busho', 1, { name: '浅野長晟', invuln: true, horse: true }), sq(ASANO, 'samurai', 6), sq(ASANO, 'ashigaru', 17), sq(ASANO, 'gun', 6)]);
    F.asano.noAI = true;
    // 池田忠雄の手（家康の定めた遊撃。木津川寄りを進み、③で砦の西の柵を破る）
    F.ikeda = allyGroup(rt, { faction: 'ikeda', name: '池田忠雄の手', anchor: IKEDA_AT, facing: faceN, width: 8, aggro: 10, morale: 95, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(IKEDA, 'samurai', 3), sq(IKEDA, 'ashigaru', 8), sq(IKEDA, 'gun', 4)]);
    for (const [x, z] of [[IKEDA_AT.x - 6, IKEDA_AT.z + 5], [IKEDA_AT.x + 6, IKEDA_AT.z + 5]]) rt.scene.add(nobori(W, x, z, 'ageha', 6));
    // 舟手の鉄砲（軍船の上から砦の西の柵を撃つ）
    F.fune = [];
    for (const [x, z, rot] of BOATS) {
      const g = allyGroup(rt, { faction: 'hachisuka', name: '蜂須賀の舟手', fixed: true, anchor: { x, z }, facing: Math.PI / 2, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100, fullStrength: true },
        [sq(HACHI, 'gun', 2)]);
      g.noFrontline = true;
      perch(g, x, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.9, z, Math.PI / 2 + rot);
      F.fune.push(g);
    }
    F.allies = [F.saki, F.east, F.asano, F.ikeda];
    for (const g of [...F.allies, ...F.fune]) g.dmgMult = 0.6;   // 味方だけでは時がかかる（主人公の槍で早まる。何もしなくても段は進む＝二の5）
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: SPAWN.x - 2, z: SPAWN.z - 3 }, faceN, [{ kind: 'spear', n }]);

    // ---- 豊臣方：明石の砦の兵（全登は留守。一族の全延が指図する） ----
    F.front = foe(rt, '入り江の岸の鉄砲組', SHORE, [sq(TOYO, 'samurai', 2), sq(TOYO, 'gun', 4), sq(TOYO, 'ashigaru', 4)], { aggro: 16, width: 12 });
    F.wallG = foe(rt, '大手門の守り', { x: 0, z: GATE.z - 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'bow', 2), sq(TOYO, 'gun', 2), sq(TOYO, 'ashigaru', 2)], { aggro: 14 });
    F.garrison = foe(rt, '明石の守兵', { x: 0, z: -40 }, [sq(TOYO, 'samurai', 3), sq(TOYO, 'ashigaru', 5), sq(TOYO, 'gun', 2), sq(TOYO, 'bow', 1)], { aggro: 3, width: 10 });   // 門が破れるまでは砦の奥に控える
    // 砦の内の組は逃げ場が無く、門が破れる前に崩れない（崩れると③が一瞬で済んでしまう）
    for (const g of [F.wallG, F.garrison]) { g.noFrontline = true; g.noRout = true; }
    F.garrison.noAI = true;   // 門が破れるまで動かない（stage3 で放つ）
    // 新手は始めから持ち場にいる（湧かせない。kaito AW の6）。門の前の鉄砲組と、北の口の守兵・全延の組
    F.w1 = foe(rt, '門の前の鉄砲組', { x: 0, z: GATE.z + 6 }, [sq(TOYO, 'samurai', 1), sq(TOYO, 'gun', 3), sq(TOYO, 'ashigaru', 2)], { aggro: 6 });
    F.w3 = foe(rt, '北の口の守兵', { x: 0, z: WALL_N + 6 }, [sq(TOYO, 'samurai', 2), sq(TOYO, 'ashigaru', 3), sq(TOYO, 'gun', 2)], { aggro: 3, width: 10 });
    F.zen = foe(rt, '明石全延の組', { x: 4, z: WALL_N + 10 }, [sq(TOYO, 'busho', 1, { name: '明石全延', invuln: true, horse: true }), sq(TOYO, 'samurai', 3)], { aggro: 0, width: 6, morale: 100 });
    for (const g of [F.w3, F.zen]) { g.noFrontline = true; g.noAI = true; g.noRout = true; }
    // 北の口の守兵は④まで奥に控える。③で砦の内へ流れ込んだ味方に先に討ち尽くされると④が一瞬で済むので、④まで狙わせない
    for (const u of F.w3.units) u.noTarget = true;
    F.foes = [F.front, F.w1, F.wallG, F.garrison, F.w3];
    // 櫓の上の鉄砲・弓（二の3・二の7：砦に近づくほど上から撃たれる）。南の櫓は入り江と大手門、北の櫓は北の道を向く
    F.towers = [];
    for (const [x, z] of [[-18, GATE.z - 3], [18, GATE.z - 3], [-18, WALL_N + 4], [18, WALL_N + 4]]) {
      const f = z > FORT.z ? 0 : Math.PI;
      const g = enemyGroup(rt, { fixed: true, name: '砦の櫓の守り', faction: 'toyotomi', flag: TOYO.flag, armor: TOYO.armor, anchor: { x, z }, facing: f, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100 },
        [sq(TOYO, 'gun', 1), sq(TOYO, 'bow', 1)]);
      g.noFrontline = true;
      perch(g, x, W.heightAt(x, z) + 6.7, z, f);
      F.towers.push(g);
    }
    F.s1 = [F.front]; F.fN = F.front.count;

    // 戦の前の話（蜂須賀の陣）。家康は茶臼山の本陣、全登は城の評定にいて、この場にはいない
    rt.setPhase('brief');
    // 会話の二十秒も、行き先（岸の鉄砲組）のピンを先に出す。目当て無しで立たせない（newbie60）
    rt.obj('main', '入り江を渡り、岸の鉄砲組を討つ', 'main');
    rt.marker('k08', SHORE, '岸の鉄砲組', { h: 3 });
    rt.after(0.5, () => rt.say('物見の森村重', '砦の炊ぎの煙が少のうございます。守りは手薄かと', 3.8));
    rt.after(4.6, () => rt.say('蜂須賀至鎮', '浅野殿との約束は明け六つ。待たぬ。今、出る', 4));
    rt.after(9, () => rt.say('蜂須賀至鎮', '舟手は川から撃て。別手は砦の背へ回り、火をかけよ', 4));
    rt.after(13.4, () => rt.say('蜂須賀至鎮', `${nm(rt)}、先手を率いて入り江を渡れ。岸の鉄砲組から払え`, 4));
    rt.after(17.6, () => rt.say(nm(rt), '承知。先手、続け', 2.4));
    rt.after(20, () => rt.say('明石全延', '全登様は城の評定でお留守じゃ。持ちこたえよ', 3.4));
    rt.after(20.2, () => this.stage1(rt));
  },

  // ① 入り江を渡り、岸の鉄砲組を討つ（午前三時の抜け駆け）
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.tS = rt.t;
    rt.setPhase('assault');
    rt.obj('main', '入り江を渡り、岸の鉄砲組を討つ', 'main');
    rt.marker('k08', () => { const g = F.s1.find(alive); return g ? centerOf(g)() : SHORE; }, '岸の鉄砲組', { red: true, group: F.front });
    hold(F.saki, SHORE.x - 2, SHORE.z + 4); F.saki.aggro = 22;
    hold(F.east, 48, 40);
    hold(F.ikeda, -28, 30);
    F.front.order = 'attack'; F.front.aggro = 20;
  },
  // ② 砦の大手門を味方と打ち破る（舟手が川から撃ち、別手が背の民家に火・浅野が遅れて渡る）
  stage2(rt) {
    const F = rt.flags;
    F.step = 2; F.tS = rt.t;
    rt.award((t) => t.side.push('入り江を渡り、岸の鉄砲組を討った'), '岸の鉄砲組を討った');
    rt.unmark('k08');
    for (const g of F.s1) flee(g);
    rt.obj('main', '砦の大手門を味方と打ち破る', 'main');
    rt.marker('k08', { x: GATE.x, z: GATE.z + 4 }, '砦の大手門', { h: 3, red: true });
    hold(F.saki, GATE.x, GATE.z + 9); F.saki.aggro = 24;
    hold(F.east, 44, -82); F.east.aggro = 8;   // 東の柵の外を回って砦の背の民家へ
    hold(F.ikeda, -32, -30); F.ikeda.aggro = 12;   // 木津川の岸を進み、砦の西の柵の外へ
    // 浅野勢が抜け駆けを知って動き出す（入り江を急いで渡る）
    F.asano.noAI = false; F.asano.aggro = 12;
    hold(F.asano, 42, 20);
    rt.say('蜂須賀至鎮', '門に取り付け！　鉄砲は櫓を撃て', 3.4);
    // 先手が門の前に竹束を据える（門の前の鉄砲と櫓の弾を受けて寄る。真ん中は空けて門へ通す）
    if (!F.taba) { F.taba = true; for (const x of [-10.4, -8.2, -6, 6, 8.2, 10.4]) { try { rt.scene.add(takataba(rt.world, x, GATE.z + 15, 0)); } catch (e) { console.warn(e); } } }
    rt.after(4, () => { if (F.step === 2) rt.say('蜂須賀の舟手', '樋口の舟五艘、捕らえた。川から砦を撃つ', 3.4); });
    rt.after(9, () => rt.say('浅野長晟', '蜂須賀殿が抜け駆けか。遅れるな、川を渡れ', 3.4));
  },
  // 砦の背の民家に火（別手が着いた時か、②の四十秒後）
  burn(rt) {
    const F = rt.flags, W = rt.world;
    if (F.burned) return;
    F.burned = true;
    F.blazes = [];
    for (const [x, z, r] of VILLAGE) { try { if (W.addBlaze) F.blazes.push(W.addBlaze(x, z, { w: 7, d: 5, h: 2.6, rot: r })); } catch (e) { console.warn(e); } }
    rt.say('蜂須賀の別手', '砦の背の家に火をかけた！', 3);
    rt.after(3.4, () => rt.say('明石全延', '背に火が！　川からも撃たれる。挟まれたぞ', 3.4));
  },
  // ③ 砦の内の守兵を討つ（挟み撃ち）
  stage3(rt) {
    const F = rt.flags;
    F.step = 3; F.tS = rt.t;
    this.burn(rt);
    rt.award((t) => t.side.push('砦の大手門を破った'), '砦の大手門を破った');
    rt.unmark('k08');
    rt.obj('main', '砦の内へ入り、明石の守兵を討つ', 'main');
    // 門の脇の柵を押し倒し、浅野勢が東の柵を、池田の手が西の柵を破る（味方が詰まらず流れ込む）
    for (const s of rt.army.structs || []) {
      if (s.team !== 1 || !s.seg || s === F.gate) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const southGap = s.seg[1] === GATE.z && s.seg[3] === GATE.z && Math.abs(mx) < 12;
      const westGap = s.seg[0] === -WALL_X && s.seg[2] === -WALL_X && mz > -42 && mz < -20;
      const eastGap = s.seg[0] === WALL_X && s.seg[2] === WALL_X && mz > -38 && mz < -20;
      if (southGap || westGap || eastGap) { s.hp = 0; s.alive = false; if (s.mesh) s.mesh.visible = false; }
    }
    hold(F.saki, INSIDE.x + 4, INSIDE.z); F.saki.aggro = 24;
    hold(F.asano, INSIDE.x + 12, INSIDE.z - 4); F.asano.aggro = 22;
    hold(F.east, 20, -72); F.east.aggro = 18;   // 背から北の口を塞ぐ
    hold(F.ikeda, INSIDE.x - 12, INSIDE.z - 2); F.ikeda.aggro = 20;
    F.garrison.noAI = false;
    for (const g of [F.wallG, F.garrison]) { g.order = 'attack'; g.aggro = 16; }
    F.s3 = [F.garrison, F.wallG]; F.gN = sum(F.s3);
    rt.marker('k08', () => { const g = F.s3.find(alive); return g ? centerOf(g)() : INSIDE; }, '明石の守兵', { red: true, group: F.garrison });
    rt.say('蜂須賀至鎮', '門が開いた！　内へ攻め入れ', 3.2);
    rt.after(3.6, () => { if (F.step === 3) rt.say('浅野長晟', '浅野も着いた。東から挟み込め', 3); });
    rt.after(7.4, () => { if (F.step === 3) rt.say('池田の物頭', '池田の手、西の柵を破った。乗り込め', 3); });
  },
  // ④ 砦の北の口で明石全延の組を追い払う
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.tS = rt.t;
    rt.award((t) => t.side.push('砦の内の明石の守兵を討った'), '砦の守兵を討った');
    rt.unmark('k08');
    for (const g of [F.front, F.w1, ...F.s3]) flee(g);
    for (const g of F.towers.slice(0, 2)) flee(g);   // 南の櫓の兵は降りて逃げる
    rt.obj('main', '砦の北の口で明石全延の組を追い払う', 'main');
    F.w3.noAI = false; F.zen.noAI = false;
    for (const u of F.w3.units) u.noTarget = false;
    for (const g of [F.w3]) { g.order = 'attack'; g.aggro = 18; }
    F.s4 = [F.w3]; F.nN = sum(F.s4);   // 北の櫓の上の兵は数えない（⑤で降りて逃げる）
    hold(F.saki, NGATE.x + 3, NGATE.z + 10); F.saki.aggro = 24;
    hold(F.asano, NGATE.x + 12, NGATE.z + 10); F.asano.aggro = 22;
    hold(F.ikeda, NGATE.x - 10, NGATE.z + 10); F.ikeda.aggro = 22;
    rt.marker('k08', () => { const g = F.s4.find(alive); return g ? centerOf(g)() : NGATE; }, '明石全延の組', { red: true, group: F.w3 });
    rt.say('明石全延', '北の口を固めよ！　退き口を守れ', 3.2);
  },
  // ⑤ 北の口に卍の幟を立てる（守兵は博労淵へ退く）
  stage5(rt) {
    const F = rt.flags;
    F.step = 5; F.tS = rt.t;
    rt.award((t) => t.side.push('北の口の守兵を追い払った'), '北の口の守兵を追い払った');
    rt.unmark('k08');
    for (const g of [...F.s4, ...F.towers, F.zen]) flee(g);
    rt.say('明石全延', 'もはや持たぬ。博労淵へ引け', 3);
    rt.obj('main', '砦の北の口に卍の幟を立てる', 'main');
    F.flagAt = { x: NGATE.x, z: NGATE.z + 3 };
    rt.marker('k08', F.flagAt, '北の口', { h: 3 });
    hold(F.saki, F.flagAt.x, F.flagAt.z + 2);
    hold(F.east, 14, -66);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main'); rt.unmark('k08');
    rt.scene.add(nobori(rt.world, F.flagAt.x + 2, F.flagAt.z, 'hachisuka', 7));
    rt.award((t) => { t.main = true; t.special = { label: '抜け駆けで木津川口の砦を一日で奪った', pts: 20 }; }, '木津川口の砦を奪った');
    rt.banner('木津川口の戦い　勝ち', '大坂の外の砦が一つ落ちた');
    rt.player.u.invuln = true;
    for (const g of rt.army.groups) if (g.team === 1) flee(g);
    rt.say('蜂須賀至鎮', '木津川口は落ちた。海から城への舟の道はこれで絶えた', 3.8);
    rt.after(4.4, () => rt.say('浅野長晟', '一番乗りは蜂須賀殿か。抜け駆けの申し開きは大御所の前でなされよ', 4));
    rt.after(8.8, () => rt.say('蜂須賀至鎮', '覚悟の上じゃ。次は博労淵の砦よ', 3));
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
    if (!(F.lightT > rt.t)) { F.lightT = rt.t + 1; const m = F.step <= 2 ? 0.3 : 0.5; for (const g of rt.army.groups) if (g.team === 1) g.dmgMult = m; }
    if (rt.t - F.tS > LIMIT[F.step]) { this.lose(rt, GOAL_LIMIT[F.step]); return; }
    if (broken(F.saki) && broken(F.asano)) { this.lose(rt, '蜂須賀の先手と浅野勢がともに崩れた'); return; }
    // 浅野勢は急いで入り江の東の深み（胸まで）を渡り、溺れる者を出す（史実。三人まで。膝までの浅瀬では溺れない）
    if (F.step >= 2 && F.drown < 3 && !(F.drownT > rt.t)) {
      F.drownT = rt.t + 2.5;
      const W = rt.world;
      const u = F.asano.units.find((v) => v.alive && (v.type === 'ashigaru' || v.type === 'samurai') && W.waterDepthAt(v.pos.x, v.pos.z) > 0.8);
      if (u) {
        F.drown++; rt.army.kill(u, null);
        if (F.drown === 1) rt.say('浅野の足軽', '深みに足を取られた！', 2.4);
      }
    }
    if (F.step === 1) {
      const n = sum(F.s1);
      if (!F.w1on && n <= F.fN * 0.6) {
        F.w1on = true; join(rt, 's1', 'fN', F.w1);
        rt.say('明石全延', '岸の者を見捨てるな。門から出て撃ちかけよ', 3.2);
        return;
      }
      // 主人公が岸に来なくても、先手が岸を払えば次へ（二の5：何もしなくても物語は進む）
      if (F.w1on && n <= F.fN * 0.15) this.stage2(rt);
    } else if (F.step === 2) {
      // 別手が砦の背に着くか、四十秒経てば民家に火
      if (!F.burned && (rt.t - F.tS > 40 || near(F.east.center(), { x: 44, z: -82 }, 14))) this.burn(rt);
      const st = F.gate;
      if (!st || !st.alive || st.hp <= 0) { this.stage3(rt); return; }
      rt.objProgress('main', `${Math.round(100 - (100 * st.hp) / st.maxHp)}／100`);
      // 寄せた味方が門を打つ（門の前に味方が多いほど早い。主人公がそばで打てばさらに早い）
      let n = 0;
      for (const u of F.saki.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 16) n++;
      if (near(P, GATE, 6)) n += 4;
      if (alive(F.wallG) && F.wallG.count > 6) n = Math.floor(n * 0.6);
      if (F.burned) n += 2;   // 背の火で守りが浮き足立つ
      if (n) { st.hp -= dt * 0.9 * Math.min(n, 14); if (st.hp <= 0) { st.hp = 0; st.alive = false; rt.army.structFall(st); this.onStructDestroyed(rt, st); } }
    } else if (F.step === 3) {
      if (sum(F.s3) <= F.gN * 0.15) this.stage4(rt);
    } else if (F.step === 4) {
      // 柵の外へ押し出された守兵は北の口の守りから外れた者（博労淵へ逃げる）。残りが追えずに④が止まらないように
      if (northLeft(F) <= Math.floor(F.nN * 0.2) || rt.t - F.tS > 90) this.stage5(rt);
    } else if (F.step === 5) {
      // 主人公が北の口に立てば幟を立てる。来なければ先手の誰かが北の口に着き、十五秒で立てる（二の5）
      if (near(P, F.flagAt, 4) || (rt.t - F.tS > 15 && F.saki.units.some((u) => u.alive && near(u.pos, F.flagAt, 6)))) this.win(rt);
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
  if (e && F.step >= 1 && F.step < 5) {
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
  if (F.step === 4) { const g = F.s4.find(alive); at(g ? g.center() : NGATE, 3); return; }
  at(F.flagAt || NGATE, 2);
};

// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.k08_osaka_kizu = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.fN, sum(F.s1), F.fN * 0.15);
  if (F.step === 3) return cut(F.gN, sum(F.s3), F.gN * 0.15);
  if (F.step === 4) return cut(F.nN, northLeft(F), Math.floor(F.nN * 0.2));
  return null;
};
// 戦の進行の札（段）：F.step の 1〜5（五つ。史実の時刻の順。goals5.js が「敵を何人討つ」で埋めない）
setStages('k08_osaka_kizu', [['入り江を渡り、岸の鉄砲組を討つ', 1], ['砦の大手門を味方と打ち破る', 2], ['砦の内へ入り、明石の守兵を討つ', 3], ['砦の北の口で明石全延の組を追い払う', 4], ['砦の北の口に卍の幟を立てる', 5]]);

export { k08_osaka_kizu };
export default k08_osaka_kizu;

