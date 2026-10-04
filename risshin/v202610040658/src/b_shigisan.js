import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　信貴山城の戦い（天正五年十月）
// 石山本願寺攻めの陣を勝手に払い、信長に背いた松永久秀は、大和の信貴山城に籠もった。
// 織田信忠を大将に、明智光秀・羽柴秀吉・筒井順慶らが城を囲み、十月十日、久秀は天守に火を放って自害した。
// 足軽は信忠の軍の筒井順慶の手に付く。①筒井の者の案内で、尾根道を登る（横から伏兵）
// ②門脇の物見櫓に火を放つ ③実際に門を破り、北尾根の曲輪を押さえる ④本丸の守りを崩し、味方と確保する
// 向き：北（-z）の山の上に城。南（+z）の麓に織田の陣
// ======================================================================
import { yamaLift, benchRoads } from './yamalift.js';
import { nobori, hut, yagura, campfire, kabukimon, tawara, tobira, tsuiji, dorui, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { monomi, horiboriHeight } from './castle_parts.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, centerOf, unitPos, wallLine, ringWall } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { steerRing } from './b_depth.js';
import { sightPoint } from './battle_sight.js';
import { camp } from './b_mid.js';
import { buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';

import { SHIGISAN_PLAN, TOP, GATE, TOWER, RIDGE1, RIDGE2, YASHIKI, TEMPLE, ROAD, TEMPLE_ZONE, ROUTES } from './castles/shigisan.js';
import { demRelief } from './dem.js';
let sgDem = null;
import('./asset_dem_shigisan.js').then((m) => { sgDem = m.default; }).catch(() => {});
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const ODA = { flag: 'oda' };
const TSUTSUI = { flag: 'igeta', flagScale: 1.5, hachi: 0x3f7a52 };   // 筒井の手：井筒の旗を大きく・緑の鉢巻
const MATSU = { flag: 'todo' };            // 松永の蔦（藤堂蔦の紋で代える）
// 陣幕は南にしか口がない。登城道・遊び手・組の出発地点を囲わぬよう、道の東へ置く。
const TSUTSUI_CAMP = { x: 26, z: 104 };
// 火掛けは柵の外から。空堀の上を横切らず、土橋から櫓の足元へ寄る。
const TOWER_FIRE = { x: TOWER.x + 2, z: GATE.z + 7 };
const TOWER_APPROACH = [[GATE.x, GATE.z + 6], [TOWER_FIRE.x, TOWER_FIRE.z]];
const CLIMB_END = ROAD.findIndex((q) => q[1] === GATE.z) - 1;
const AMBUSH_APPROACH = [[-30, 10], ROAD.slice(1, CLIMB_END + 1).reduce((a, p) => Math.hypot(p[0] + 30, p[1] - 10) < Math.hypot(a[0] + 30, a[1] - 10) ? p : a)];

// 山城の高さ（kaito 10/3）：比高約300m に近づける持ち上げ（yamalift.js）
const LIFT = { x: 0, z: -110, tx: 0, tz: -60, w: 40, R: 150, rise: 120 };
function base(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 信貴山（北が高い）。kaito 10/3：比高約300m に近づける持ち上げ
  h += yamaLift(x, z, LIFT);
  h += 46 * gauss(x, z, 0, -110, 4200) + 10 * gauss(x, z, -60, -80, 2000) + 12 * gauss(x, z, 70, -120, 2400);
  // 生駒の山並み
  h += 30 * gauss(x, z, -200, -140, 10000);
  return h;
}
const HT = base(TOP.x, TOP.z), HG = base(GATE.x, GATE.z - 12);
const HR1 = base(RIDGE1.x, RIDGE1.z), HR2 = base(RIDGE2.x, RIDGE2.z), HY = base(YASHIKI.x, YASHIKI.z);
// 平場（曲輪）をならす：半径内をその曲輪の高さへ寄せる（土を削って造成した段。docs 60〜74「五段ほどの平場」）
function terrace(h, x, z, c, hc, r) {
  const k = Math.max(0, Math.min(1, (r - Math.hypot(x - c.x, z - c.z)) / 6));
  return h * (1 - k) + hc * k;
}
// 堀の形は読み込み時に一度だけ作り、地形と城の区域で同じ寸法を使う。
const HORI_HEIGHTS = SHIGISAN_PLAN.hori.map((h) => horiboriHeight(h.pts, { width: h.w, depth: h.deep }));
function heightRaw(x, z) {
  let h = base(x, z);
  for (const dip of HORI_HEIGHTS) h += dip(x, z);
  // 本丸と、その手前の曲輪をならす
  const k1 = Math.max(0, Math.min(1, (TOP.r + 5 - Math.hypot(x - TOP.x, z - TOP.z)) / 6));
  h = h * (1 - k1) + HT * k1;
  const k2 = Math.max(0, Math.min(1, (18 - Math.hypot(x - GATE.x, (z - (GATE.z - 12)) * 1.3)) / 6));
  h = h * (1 - k2) + Math.max(h, HG) * k2;
  // 北尾根の曲輪群と松永屋敷。山全体を平らにせず、曲輪の分だけ段を造る
  h = terrace(h, x, z, RIDGE1, HR1, RIDGE1.r);
  h = terrace(h, x, z, RIDGE2, HR2, RIDGE2.r);
  h = terrace(h, x, z, YASHIKI, HY, YASHIKI.r);
  // 国土地理院の標高：城の外の遠い山肌にだけ、実際の起伏を足す（1 が実の約 2m）
  if (sgDem) h += demRelief(sgDem, x, z, { xy: 2, cx: 0, cz: 0, inner: 150, fade: 40, scale: 0.16, az: 0.8 });
  return h;
}

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(heightRaw, [ROAD, TOWER_APPROACH, AMBUSH_APPROACH, ...ROUTES.slice(1).map((r) => r.pts)]);
  return BENCHED(x, z);
}

// 信長公記巻十の信忠・明智・羽柴・筒井・細川による包囲。
// 城の参照表と既存の尾根道に合わせる。曲輪の守将・人数・仕寄りの位置は補完。
// 松永の蔦は既存の近い蔦の紋で代える。
const JIN = [
  rosterPlan('山麓の包囲', 0, { x: 0, z: 142 }, Math.PI, [
    ['nobutada', '本陣', '織田信忠', 8000, 0, 142, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['tsutsui', '大手の仕寄り', '筒井順慶', 3000, TSUTSUI_CAMP.x, TSUTSUI_CAMP.z, 'igeta', 'igeta', 0, { bind: 'tsuCamp' }],
    ['akechi', '西尾根の仕寄り', '明智光秀', 5000, -70, 20, 'akechi', 'akechi', 200, { w: 24, d: 25 }],
    ['hashiba', '寺側の道の囲み', '羽柴秀吉', 5000, 70, 10, 'oda', 'oda', 200, { w: 24, d: 25 }],
    ['hosokawa', '東の後備え', '細川藤孝', 3000, 60, 120, 'oda', 'oda', 220, { w: 26, d: 25 }],
    ['sakuma', '西の攻め口', '佐久間信盛', 5000, -106, -12, 'oda', 'oda', 160, { w: 22, d: 24 }],
    ['niwa', '東の攻め口', '丹羽長秀', 5000, 106, -12, 'oda', 'oda', 160, { w: 22, d: 24 }],
    ['reserve', '西の後備え', '織田信忠の配下（名は不明）', 6000, -60, 120, 'eiraku', 'oda', 220, { w: 26, d: 25 }],
  ], '信長公記巻十、城の参照表の信貴山'),
  rosterPlan('尾根と曲輪の守り', 1, TOP, 0, [
    ['hisahide', '本陣', '松永久秀', 2400, TOP.x, TOP.z, 'todo', 'todo', 0, { bind: 'ehon.lord' }],
    ['gate', '大手の木戸', '松永久秀の配下（名は不明）', 1600, GATE.x + 8, GATE.z - 5, 'todo', 'todo', 0, { bind: 'arch' }],
    ['lower', '北尾根の下の曲輪', '松永久秀の配下（名は不明）', 1600, RIDGE1.x, RIDGE1.z, 'todo', 'todo', 0, { bind: 'rg1' }],
    ['upper', '北尾根の上の曲輪', '松永久秀の配下（名は不明）', 800, RIDGE2.x, RIDGE2.z, 'todo', 'todo', 0, { bind: 'rg2' }],
    ['yashiki', '松永屋敷', '松永久秀の配下（名は不明）', 1600, YASHIKI.x, YASHIKI.z, 'todo', 'todo', 0, { bind: 'ryk' }],
  ], '信長公記巻十、信貴山城の曲輪資料。朝護孫子寺に守備隊は置かない'),
];
const shigisan = {
  jinkei: JIN,
  noDistantBattle: true, // 固有の備え表だけを使い、別の本陣や押し合いを自動で重ねない。
  noTaisho: true, // 自害の戦を、共通の城主討取り勝利にしない。両将はこの戦で置く。
  noWake: true, // 守備は開戦前に置き、包囲の控えは軽いまま保つ。
  enemyTactics: { advance: false, withdraw: false, flank: false, reinforce: false },
  botOrders: true, // 柵の口への回り道・門の外の持ち場を、遊び手の突進で上書きしない。
  spawn: { x: 6, z: 100, heading: Math.PI },
  world: {
    seed: 15770,
    time: 'night',
    winter: true,
    muddy: 0.3,
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    paths: [ROAD, ...ROUTES.slice(1).map((r) => r.pts)],   // 大手のほか、西の尾根道・寺の側の道・裏道
    height,
    blockedHint: (rt) => rt.flags.step < 2 ? '尾根道の曲がり角の印へ戻れ。急な山肌は登れない' : rt.flags.step < 3.5 ? '空堀は門前の土橋を渡れ。門が開くまで先手を守れ' : '曲輪へは柵の口と尾根道を進め。本丸へは西を回り南の口へ',
    tint(x, z, h, c) { if (h > 14) c.setRGB(c.r * 0.84, c.g * 0.88, c.b * 0.8); },
    clear: (x, z) => Math.abs(x) < 40 && z > RIDGE1.z - 20 && z < 130,
    trees: 640,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 44 && z > RIDGE1.z - 20 ? 0.15 : 1),
    groves: [{ x: -40, z: 20, r: 14, n: 22 }, { x: 40, z: -30, r: 14, n: 22 }],
    fleeOut: (x, z, team) => team === 1 && (z < RIDGE1.z - 32 || Math.abs(x) > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', mainKeep: 'HIST_B', ridgeKuruwa: 'HIST_B', templeArea: 'HIST_B', matsunagaEnd: 'HIST_A', tsutsuiRidge: 'HIST_B', routes: 'GAME_C', sally: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0;
    // 縄張り（castle_plan.js）：壁は今まで通り手組み（下で skipWalls）。曲輪の多角形だけ、区域（siege_zones.js）に使う
    F.C = buildCastlePlan(rt, SHIGISAN_PLAN, { ladders: true, baseHeight: base, edgeW: 3, skipWalls: ['ridge2', 'shu'] });
    // 下の曲輪・屋敷の柵（castle_plan の塀）は味方でも敵でもない飾りの壁：壊れず、的にしない
    for (const s of F.C.walls) if (s && s.seg) { s.hp = s.maxHp = 1e9; s.noTarget = true; s.wall = true; }
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // ---- 門の曲輪：柵と門、脇の物見櫓 ----
    noT(wallLine(rt, [[-28, GATE.z + 4], [-3.5, GATE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[3.5, GATE.z], [28, GATE.z + 4]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.gate = rt.army.addStruct({ seg: [-3.5, GATE.z, 3.5, GATE.z], nx: 0, nz: 1, hp: 1800, maxHp: 1800, armor: 0.22, team: 1, name: '門' });
    const dm = tobira(W, GATE.x, GATE.z, 7.0, 0);   // 閉じた扉（破られると根元から倒れる）
    F.gate.mesh = dm;
    rt.scene.add(dm, kabukimon(W, GATE.x, GATE.z, 7.4, 0, { doors: false }));
    F.tower = yagura(W, TOWER.x, TOWER.z);
    rt.scene.add(F.tower, yagura(W, -12, GATE.z - 6));
    // ---- 本丸（雄嶽の主郭）：柵の囲い（南に口）と、木造の高櫓（近世の大天守にしない。docs 60〜74） ----
    noT(ringWall(rt, TOP.x, TOP.z, TOP.r, { gapAt: 0, gapW: 0.45, team: 1, hp: 1e9, name: '本丸の柵', segLen: 5 }));
    // 松永の小さな高櫓は縄張りの lordSeat から建てる。資料に合わせ、曲輪の縁に石垣は置かない。
    // 高櫓の戸口の灯（場所を知らせる印は攻めの下知が届いてから）。
    for (const sd of [-3.6, 3.6]) W.addFire(TOP.x - 2 + sd, TOP.z - 1.5, { torch: true, h: 1.8 });
    rt.scene.add(hut(W, TOP.x + 10, TOP.z + 2, 7, 5, -0.3, { wall: 0x6a5238 }), hut(W, -14, GATE.z - 16, 8, 5, 0.2, { wall: 0x6a5238 }), hut(W, 16, GATE.z - 20, 7, 5, -0.1));
    for (const [x, z] of [[-6, GATE.z - 4], [6, GATE.z - 4], [TOP.x - 16, TOP.z + 6], [TOP.x + 14, TOP.z + 10]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // ---- 北尾根の曲輪群（土塁・切岸・平場。それぞれ独立して守る。石垣は使わない。道は南北に抜けるので両脇だけ柵を置く） ----
    noT(wallLine(rt, [[RIDGE2.x - RIDGE2.r, RIDGE2.z - 5], [RIDGE2.x - RIDGE2.r, RIDGE2.z + 5]], { team: 1, hp: 1e9, name: '尾根の曲輪の柵', segLen: 5 }));
    noT(wallLine(rt, [[RIDGE2.x + RIDGE2.r, RIDGE2.z - 5], [RIDGE2.x + RIDGE2.r, RIDGE2.z + 5]], { team: 1, hp: 1e9, name: '尾根の曲輪の柵', segLen: 5 }));
    // 土塁（曲輪の柵の外へ盛る。一つの形にまとめる）・櫓（登れる物見）・曲輪の口の冠木門
    {
      const db = makeSimpleBatch();
      for (const poly of [F.C.kuruwa.ridge1.poly, F.C.kuruwa.yashiki.poly]) {
        const cx = poly.reduce((q, p) => q + p[0], 0) / poly.length, cz = poly.reduce((q, p) => q + p[1], 0) / poly.length;
        for (let i = 0; i < poly.length; i++) {
          const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
          const mx = (ax + bx) / 2, mz = (az + bz) / 2, nl = Math.hypot(mx - cx, mz - cz) || 1;
          if (Math.abs(mx - cx) < 3.2 && Math.abs(mz - cz) > nl * 0.8) continue;   // 道の口の前は盛らない
          if (Math.abs(mz - cz) < 3.2 && Math.abs(mx - cx) > nl * 0.8) continue;
          const d = dorui(W, [ax, az, bx, bz], (mx - cx) / nl, (mz - cz) / nl, { batch: db, w: 2.4, h: 0.7 });
          if (!d.isBatchedPart) rt.scene.add(d);
        }
      }
      finalizeSimpleBatch(rt, db);
      F.monomi = SHIGISAN_PLAN.yagura.filter((y) => y.id !== 'monomi_gate').map((y) => monomi(rt, y.at[0], y.at[1], { team: 1, name: '物見櫓' }));
      rt.scene.add(kabukimon(W, RIDGE1.x, RIDGE1.z - RIDGE1.r, 5.2, 0, { doors: false }));
    }
    rt.scene.add(hut(W, RIDGE1.x - 8, RIDGE1.z + 2, 6, 4, 0.2), hut(W, RIDGE2.x + 7, RIDGE2.z - 2, 6, 4, -0.2));
    for (const [x, z] of [[RIDGE1.x + 7, RIDGE1.z - 1], [RIDGE2.x - 6, RIDGE2.z + 1]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // ---- 松永屋敷（北尾根のさらに奥の郭。主殿・家臣の詰所・倉。暮らしと政治の区域。通り抜けを塞がぬよう、壁は装飾の低い塀だけ） ----
    noT(wallLine(rt, [[YASHIKI.x + 3.5, YASHIKI.z - 9], [YASHIKI.x + YASHIKI.r - 2, YASHIKI.z - 9]], { team: 1, hp: 1e9, name: '屋敷の土塀', segLen: 5 }));
    rt.scene.add(hut(W, YASHIKI.x, YASHIKI.z, 11, 7, 0, { wall: 0x7a5f3e }));       // 主殿
    rt.scene.add(hut(W, YASHIKI.x + 8, YASHIKI.z - 6, 6, 4, 0.3));                 // 家臣の詰所
    rt.scene.add(hut(W, YASHIKI.x + 9, YASHIKI.z + 5, 5, 4, -0.2));                // 倉
    rt.scene.add(tawara(W, YASHIKI.x + 8, YASHIKI.z + 1, 0.2, 5));
    rt.scene.add(nobori(W, YASHIKI.x - YASHIKI.r + 1, YASHIKI.z, 'todo', 6));
    // ---- 朝護孫子寺の区域（今の建物は写さない。寺と軍事の区域を分ける。装飾のみ・戦いの的にしない） ----
    rt.scene.add(tsuiji(W, [TEMPLE.x - TEMPLE.r, TEMPLE.z - TEMPLE.r, TEMPLE.x + TEMPLE.r, TEMPLE.z - TEMPLE.r], { h: 2.2 }));
    rt.scene.add(hut(W, TEMPLE.x, TEMPLE.z, 9, 7, 0, { wall: 0xa8321c }));
    // 寺の区域は城の区域と分ける：四方を築地で囲み、山門を西（城の登城道の側）へ向け、境内の灯と僧の姿を置く。戦いの的にしない
    {
      const P = TEMPLE_ZONE.poly, R = TEMPLE.r;
      for (const seg of [[TEMPLE.x - R, TEMPLE.z + R, TEMPLE.x + R, TEMPLE.z + R], [TEMPLE.x + R, TEMPLE.z - R, TEMPLE.x + R, TEMPLE.z + R]]) rt.scene.add(tsuiji(W, seg, { h: 2.2 }));
      rt.scene.add(tsuiji(W, [TEMPLE.x - R, TEMPLE.z - R, TEMPLE.x - R, TEMPLE.z - 2], { h: 2.2 }), tsuiji(W, [TEMPLE.x - R, TEMPLE.z + 2, TEMPLE.x - R, TEMPLE.z + R], { h: 2.2 }));
      rt.scene.add(kabukimon(W, TEMPLE_ZONE.sanmon.x, TEMPLE_ZONE.sanmon.z, 4.4, Math.PI / 2, { doors: false }));
      rt.marker('tera', { x: TEMPLE.x, z: TEMPLE.z }, '朝護孫子寺（戦の外）', { h: 5, noGuide: true });
      F.templeZone = TEMPLE_ZONE;
    }
    // ---- 筒井の先手・鉄砲組・門を破る組 ----
    F.tsutsui = allyGroup(rt, { name: '筒井順慶の手', anchor: { x: 2, z: 92 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], TSUTSUI));
    F.tsuU = F.tsutsui.units[0]; // 尾根道の先導。順慶本人は麓の陣に置く。
    F.ake = allyGroup(rt, { name: '筒井の鉄砲組', anchor: { x: -20, z: 100 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 6 }], TSUTSUI));
    F.ram = allyGroup(rt, { name: '門を破る組', anchor: { x: 14, z: 108 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.tsutsui, F.ake, F.ram];
    for (const g of F.oda) { g.noRout = false; g.formation = 'column'; g.width = 5; g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 110 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 木戸の内の弓と鉄砲 ----
    F.arch = enemyGroup(rt, { fixed: true, faction: 'saito', name: '木戸の弓', anchor: { x: 8, z: GATE.z - 3 }, facing: 0, width: 14, aggro: 40, noRout: false, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'bow', n: 7 }, { type: 'gun', n: 2 }], MATSU));
    // ---- 麓の織田の陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, -16, 132, 0.3, 6));
    // 麓の総大将 織田信忠の本陣と、本丸の松永久秀の陣所（旗本は本丸の内に控える）
    F.honjin = camp(rt, { x: 0, z: 142, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 2, z: 92 } });
    F.honjin.guard.anchor.z = 127; F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 12;
    F.tsuCamp = camp(rt, { ...TSUTSUI_CAMP, facing: Math.PI, team: 0, mon: 'igeta', general: { name: '筒井順慶' }, guard: 15, reserve: 0, runTo: { x: 2, z: 80 } });
    // 旗本は南の口を守る。閉じた北の幕を横切る持ち場へ動かさない。
    F.tsuCamp.guard.guard = true; F.tsuCamp.guard.guardLeash = 12;
    F.ehon = makeLordKeep(rt, { name: '松永久秀', naka: F.C.seat.naka, faction: 'saito', flag: 'todo', guardN: 4 });
    rt.army.spawn(F.ehon.lord.group, [{ type: 'busho', n: 1, o: { name: '松永久通', x: F.ehon.spot.x + 1.5, z: F.ehon.spot.z, invuln: true } }]);
    F.hisamichi = F.ehon.lord.group.units[1];
    F.hisamichi.keep = true; F.hisamichi.noTarget = true; F.hisamichi.pos.y = F.ehon.spot.y;
    F.ehon.lord.invuln = true; F.ehon.lord.noTarget = true; F.ehon.lord.group.noAI = true;
    for (const u of [F.ehon.lord, F.hisamichi]) { u.aiT = Infinity; u.perch = { x: u.pos.x, z: u.pos.z }; }
    // 史料の最期は自害。室内の共通の一騎打ち案内は使わない。
    F.C.seat.naka.onEnter = null; F.C.seat.naka.onLevel = null;
    F.amb = enemyGroup(rt, { fixed: true, ambush: true, faction: 'saito', name: '尾根の松永勢', anchor: { x: -30, z: 10 }, facing: Math.PI / 2, formation: 'yari', order: 'hold', aggro: 16, width: 7, morale: 90, fleeDir: { x: -1, z: -0.5 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], MATSU));
    F.sally = enemyGroup(rt, { fixed: true, faction: 'saito', name: '木戸脇の控え', anchor: { x: 22, z: GATE.z - 10 }, facing: 0, formation: 'yari', order: 'hold', aggro: 8, width: 6, morale: 90, fleeDir: { x: 0.5, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], MATSU));
    F.rg1 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '下の曲輪の松永勢', anchor: { x: RIDGE1.x - 3, z: RIDGE1.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], MATSU));
    F.rg2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '上の曲輪の松永勢', anchor: { x: RIDGE2.x, z: RIDGE2.z }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 9, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 3 }], MATSU));
    F.ryk = enemyGroup(rt, { fixed: true, faction: 'saito', name: '松永屋敷の守り', anchor: { x: YASHIKI.x, z: YASHIKI.z - 4 }, facing: Math.PI, formation: 'yari', order: 'hold', aggro: 14, width: 10, morale: 85, fleeDir: { x: 1, z: 0 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], MATSU));
    const mk = (x, z, name, list) => enemyGroup(rt, { fixed: true, faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'hold', seekRange: 20, aggro: 16, width: 7, formation: 'yari', morale: 100, noRout: false, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(list, MATSU));
    F.last = [mk(TOP.x, TOP.z + TOP.r - 4, '松永の旗本', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }])];
    F.last.push(mk(TOP.x + 12, TOP.z + 4, '本丸の控え', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]));
    for (const [x, z, k] of [[-8, 130, 'oda'], [8, 130, 'eiraku'], [-30, 110, 'akechi'], [30, 110, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const g of [F.arch, F.amb, F.sally, F.rg1, F.rg2, F.ryk, ...F.last, F.ehon.guard, ...F.ehon.kin]) { g.noAI = true; g.noRout = false; }
    F.amb.noAI = false; // 共通の伏兵の見張りだけを使う。
    for (const g of F.oda) g.noAI = true;
    // 傷ついた守りは同じ兵のまま次の曲輪へ歩いて下がる。
    F.withdraw = [
      { g: F.sally, path: ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1) },
      { g: F.rg1, path: ROAD.slice(ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z), ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z) + 1) },
      { g: F.rg2, path: ROAD.slice(ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z)) },
    ];
    rosterBuild(rt, JIN);
    for (const [x, z] of [[-20, 124], [20, 126]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('night');
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、筒井順慶の城攻めの下知を待て' : '筒井の手で、城攻めの下知を待て', 'main');
    rt.say('組頭', '信忠様の下知じゃ。諸口から夜攻めする。わしらは筒井の手で、尾根道を登る', 5);
    rt.after(6, () => { if (F.step === 0 && !F.ending) rt.say('組頭', '列を離れるな。門を破る組を守り、曲輪を一つずつ押さえよ', 4); });
    rt.marker('tsu', unitPos(F.tsuU), '先手の持ち場', {});
    rt.after(16, () => this.climb(rt));
    F.climbTimer = rt.timers[rt.timers.length - 1];
  },

  // ① 尾根道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb'); rt.objProgress('main', '');
    rt.unmark('tsu');
    sfx('horagai', 1);
    rt.banner('かかれ', '筒井の案内で、尾根道を登る');
    rt.obj('main', '先手について尾根道を登れ', 'main');
    F.guideI = 1; F.guidePoint = { x: ROAD[1][0], z: ROAD[1][1] };
    rt.marker('climb', () => F.guidePoint, '尾根道・次の曲がり角');
    const road = ROAD.slice(0, ROAD.findIndex((p) => p[1] === GATE.z));
    F.gateGather = { x: GATE.x, z: GATE.z + 6 };
    for (const g of F.oda) march(g, road.slice(1));

  },

  // ② 物見櫓に火を放つ
  tower(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('tower'); rt.objProgress('main', '');
    rt.unmark('amb'); rt.unmark('climb');
    if (F.amb && !gone(F.amb)) F.amb.morale = Math.min(F.amb.morale, 15);
    rt.award((t) => t.side.push('尾根の伏兵を退けた'), '伏兵を退けた');
    rt.banner('門の前', '木戸の内から矢が降ってくる');
    rt.obj('main', HI(rt) ? '手の者と門脇の物見櫓に火を放ち、守りを乱せ' : '門脇の物見櫓に火を放ち、守りを乱せ', 'main');
    rt.say('組頭', '門脇の櫓に火をかけ、守りを乱せ。矢に気をつけよ！', 4);
    const P = TOWER_FIRE;
    F.tp = P;
    rt.marker('tower', P, '火をかける所', { h: 3 });
    rt.addInteract('tower', P, '櫓に火をかける（二秒押す）', () => this.fireTower(rt), { r: 3.2, hold: 2 });
    rt.zone('tower', P.x, P.z, 3.2);
    // 打ち手は登城道の最後まで進める。門脇へ下げると、空堀と壊せない柵へ向かってしまう。
    F.ram.onArrive = (q) => { q.order = 'hold'; q.formation = 'column'; q.facing = Math.PI; };
    for (const [g, x] of [[F.tsutsui, 0], [F.ake, -16]]) { g.order = 'move'; g.dest = { x, z: GATE.z + 20 }; g.onArrive = (q) => { q.order = 'hold'; }; }
  },
  fireTower(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 2 || F.towerLit) return;
    F.towerLit = true;
    rt.uninteract('tower'); rt.unmark('tower'); rt.unzone('tower');
    const W = rt.world;
    W.addFire(TOWER.x, TOWER.z, { h: 3 }); W.addFire(TOWER.x + 0.6, TOWER.z + 0.6, { h: 5 });
    W.addSmokeColumn(TOWER.x, W.heightAt(TOWER.x, TOWER.z) + 8, TOWER.z, { size: 2.6 });
    F.tower.rotation.z = 0.12;
    F.arch.noRout = false; F.arch.morale = 10;
    rt.award((t) => t.side.push('物見櫓に火を放った'), '物見櫓に火を放った');
    rt.say('組頭', '櫓が燃えた！　門を破る組、今じゃ！', 3);
    this.gateFight(rt);
  },

  // ③ 門を破る
  gateFight(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '一手を率いて門を破る組を守り、門を破れ' : '門を破る組を守り、門を破れ', 'main');
    const R = F.ram;
    // 遅れた打ち手も九十九折りを登り切り、土橋の正面から門へ取り付く。
    const approach = R.order === 'path' && R.path ? R.path.slice(R.pathIdx) : [];
    approach.push([GATE.x, GATE.z + 6]);
    march(R, approach);
    R.aggro = 2;
    R.onArrive = (q) => {
      q.order = 'assault'; q.formation = 'column'; q.facing = Math.PI;
      q.assault = () => (F.gate.alive ? F.gate : null);
    };
    for (const g of [F.tsutsui, F.ake]) { g.order = 'hold'; g.formation = 'yari'; g.seekRange = 20; }
    const hitPoint = { x: GATE.x, z: GATE.z + 1.4 };
    rt.marker('gate', hitPoint, '門を打つ所', { h: 4 });
    rt.addInteract('ramgate', hitPoint, '掛矢で門を打つ（押し続ける）', () => {
      if (F.step !== 3 || F.ending || rt.over || !rt.player.u.alive || !F.gate.alive) return;
      rt.army.damage(F.gate, 55, rt.player.u);
      rt.army.play('wood', GATE, 1.1);
      rt.game.hitstop = 0.05;
    }, { r: 3.4, hold: 0.6 });
    F.sally.aggro = 16; // 木戸の内で構え、攻め手を受ける。
    if (!F.gate.alive) this.interior(rt);

  },

  // ③.5 北尾根の曲輪群（castle_plan.js の縄張り・siege_zones.js の区域：それぞれ独立して守る。
  // 下の曲輪を取れば、正面（上の曲輪）と裏（松永屋敷）の二手に分かれる。どちらかを抜ければ主郭へ）
  interior(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t;
    rt.setPhase('interior'); rt.objProgress('main', '');
    rt.uninteract('ramgate');
    rt.award((t) => t.side.push('門を破った'), '門を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('門、破れる', '先手に続き、北尾根の下の曲輪へ進む');
    rt.obj('main', HI(rt) ? '一手を率いて北尾根の曲輪を取り、主郭への道を開け' : '北尾根の曲輪を取り、主郭への道を開け', 'main');
    rt.say('組頭', '北の曲輪を取れ！　尾根から押し戻されるな！', 4);
    for (const q of F.oda) march(q, ROAD.slice(ROAD.findIndex((p) => p[1] === GATE.z), ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z) + 1));
    F.ram.assault = null;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'ridge1', name: '北尾根の曲輪（下）', test: F.C.kuruwa.ridge1.test, pos: F.C.kuruwa.ridge1.centroid, need: 5, hold: 10 },
        { id: 'ridge2', name: '北尾根の曲輪（上）', test: F.C.kuruwa.ridge2.test, pos: F.C.kuruwa.ridge2.centroid, need: 5, hold: 10 },
        { id: 'yashiki', name: '松永屋敷', test: F.C.kuruwa.yashiki.test, pos: F.C.kuruwa.yashiki.centroid, need: 5, hold: 10 },
        { id: 'shu', name: '主郭（高櫓）', test: (x, z) => F.C.kuruwa.shu.test(x, z) && z > TOP.z - 1, pos: F.C.kuruwa.shu.centroid, need: 6, hold: 14 },
      ],
      links: [['ridge1', 'ridge2'], ['ridge1', 'yashiki'], ['ridge2', 'shu'], ['yashiki', 'shu']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => this.onZoneFall(rt, id),
    });
    rt.marker('rg1', RIDGE1, '北尾根の下の曲輪');

  },
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.SZ.byId[id].owner !== ZONE_STATE.FRIEND) return;
    if (id === 'ridge1') {
      if (F.lowerTaken) return;
      F.lowerTaken = true;
      rt.award((t) => t.side.push('北尾根の下の曲輪を取った'), '下の曲輪を取った');
      rt.say('組頭', '曲輪は取った！　次は正面の高みか、東の松永屋敷の脇じゃ', 4.5);
      rt.unmark('rg1'); rt.marker('rg2', RIDGE2, '正面・上の曲輪');
      rt.marker('yashiki', YASHIKI, '別の道・松永屋敷');
      const branch = ROUTES.find((q) => q.id === 'yashiki').pts;
      rt.addInteract('yashikiRoute', { x: branch[1][0], z: branch[1][1] }, '屋敷の道へ先手を進ませる', () => {
        if (F.innerDone || F.ending) return;
        F.innerRoute = 'yashiki';
        for (const q of F.oda) march(q, branch.slice(1, 7));
        rt.uninteract('yashikiRoute');
        rt.say('組頭', '屋敷の道へ回る。先手と進み、五人で十秒押さえよ', 4);
      }, { r: 8 });
      const a = ROAD.findIndex((p) => p[0] === RIDGE1.x && p[1] === RIDGE1.z), b = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
      for (const q of F.oda) march(q, ROAD.slice(a, b + 1));
    } else if ((id === 'ridge2' || id === 'yashiki') && F.SZ.byId.ridge1.owner === ZONE_STATE.FRIEND && !F.innerDone) {
      F.innerDone = true; F.innerRoute = id;
      rt.award((t) => t.side.push(id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ'), id === 'ridge2' ? '正面の曲輪を抜けた' : '松永屋敷から回り込んだ');
      this.honmaru(rt);
    }
  },

  // ④ 天守の前
  honmaru(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru'); rt.objProgress('main', '');
    rt.unmark('gate'); rt.unmark('sally');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner('本丸へ', '木戸の内で、松永の衆が槍をそろえる');
    rt.obj('main', '天守の前の守りを崩し、味方と本丸を押さえよ', 'main');
    rt.marker('l1', centerOf(F.last[0]), '本丸の守り', { red: true, group: F.last[0] });
    rt.unmark('rg2'); rt.unmark('yashiki'); rt.uninteract('yashikiRoute'); rt.marker('honmaru', { x: TOP.x, z: TOP.z + 8 }, '本丸の持ち場');
    const a = ROAD.findIndex((p) => p[0] === RIDGE2.x && p[1] === RIDGE2.z);
    const route = F.innerRoute === 'yashiki' ? ROUTES.find((q) => q.id === 'yashiki').pts.slice(6).concat([[0, TOP.z + 8]]) : ROAD.slice(a);
    for (const q of F.oda) march(q, route);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    rt.unmark('l1'); rt.unmark('l2'); rt.unmark('honmaru'); rt.unmark('gather');
    // 落城を見聞きできる本丸の兵だけに伝える。離れた曲輪の守りは残す。
    for (const q of F.last || []) if (!gone(q) && Math.hypot(q.center().x - TOP.x, q.center().z - TOP.z) < TOP.r + 12) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '信貴山城の天守の前まで攻め入った', pts: 20 }; }, '任務達成・信貴山城を落とした');
    sfx('horagai', 0.8);
    rt.banner('信貴山城、落ちる', '松永久秀は天守に火を放ち、自害した');
    const W = rt.world;
    F.castleFire = W.addFire(TOP.x - 2, TOP.z - 8, { size: 0.8 });
    F.castleFireAt = rt.t;
    // 城内の自害は戦後の語りで知らせ、足軽による討取りにしない。
    for (const u of [F.ehon.lord, F.hisamichi]) { u.alive = false; u.noTarget = true; if (u.mesh) u.mesh.visible = false; }
    rt.after(2, () => rt.say('', '――信貴山城は落ち、久秀・久通父子は城で最期を迎えた', 5));
    rt.after(7, () => rt.say('', '――大和では、この後、筒井順慶が力を強めていく', 4.5));
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.watchT = (F.watchT || 0) - dt;
    if (F.watchT <= 0) {
      F.watchT = 0.5;
      for (const w of F.withdraw) if (!w.sent && !gone(w.g) && (w.g.count <= w.g.initial * 0.55 || w.g.morale < 55)) {
        w.sent = true; march(w.g, w.path); w.g.facing = 0; w.g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.width = 7; q.facing = 0; q.aggro = 14; };
      }
    }
    if (F.step === 1) {
      const p = rt.player.u.pos, end = CLIMB_END;
      while (F.guideI < end) {
        const a = ROAD[F.guideI], b = ROAD[F.guideI + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1);
        const nearRoad = t >= 0 && t <= 1 && Math.hypot(p.x - (a[0] + dx * t), p.z - (a[1] + dz * t)) < 8;
        if (Math.hypot(p.x - a[0], p.z - a[1]) >= 8 && !nearRoad) break;
        F.guideI++;
      }
      F.guidePoint.x = ROAD[F.guideI][0]; F.guidePoint.z = ROAD[F.guideI][1];
      if (!F.ambSeen && F.amb.units.some((u) => u.alive && (u.target || !u._crouch))) {
        F.ambSeen = true;
        rt.say('足軽', '横の藪から松永勢じゃ！', 3);
        rt.obj('main', '尾根の松永勢を退け、門の前へ進め', 'main');
        rt.marker('amb', centerOf(F.amb), '尾根の松永勢', { red: true, group: F.amb });
      }
      // 伏兵は先手を見て尾根の接触点へ出る。遠い藪に一人残るだけで全軍を待たせない。
      if (!F.ambCommitted && !gone(F.amb)) {
        let seen = false;
        for (const u of F.tsutsui.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - F.amb.anchor.x, u.pos.z - F.amb.anchor.z) < 35 && !rt.army.wallBetween(u.pos, -1, F.amb.anchor)) seen = true;
        if (seen) {
          let at = null, best = Infinity;
          for (let i = 1; i <= CLIMB_END; i++) { const q = ROAD[i], d = Math.hypot(q[0] - F.amb.anchor.x, q[1] - F.amb.anchor.z); if (d < best && rt.world.walkable(q[0], q[1])) { best = d; at = q; } }
          if (at) { F.ambCommitted = true; F.amb.ambush = false; march(F.amb, [at]); F.amb.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.seekRange = 35; }; }
        }
      }
      let available = 0, arrived = 0;
      for (const u of F.tsutsui.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (Math.hypot(u.pos.x - F.gateGather.x, u.pos.z - F.gateGather.z) < 18) arrived++; }
      const need = Math.min(5, Math.ceil(available / 2));
      if (gone(F.amb) && need > 0 && arrived >= need) this.tower(rt);
    }
    F.guideT = (F.guideT || 0) - dt;
    if (F.guideT <= 0) {
      F.guideT = 1;
      if (F.step === 1) {
        const c = F.tsutsui.center();
        rt.objProgress('main', gone(F.amb) ? `尾根の敵は退いた。先手と門前へ（先手から門まで${Math.round(Math.hypot(c.x - GATE.x, c.z - (GATE.z + 6)))}歩）` : sightPoint(rt, F.amb.anchor) ? `尾根に松永勢が残る。味方と押し返せ（${F.amb.count}人）` : '尾根道の印へ。先手の列を離れるな');
      }
      if (F.step === 2) rt.objProgress('main', '門から右の櫓へ。印で二秒押して火をかけよ');
      if (F.step === 3.5 || F.step === 4) {
        const id = F.step === 4 ? 'shu' : F.SZ.byId.ridge1.owner !== ZONE_STATE.FRIEND ? 'ridge1' : F.innerRoute === 'yashiki' ? 'yashiki' : 'ridge2';
        const zone = F.SZ.byId[id];
        rt.objProgress('main', !sightPoint(rt, zone.pos) ? `${zone.name}へ先手と進め` : zone.enemies > 0 ? `${zone.name}に敵${zone.enemies}人が見える。味方と押し返せ` : zone.friends < zone.need ? `${zone.name}へ味方を集めよ（${zone.friends}／${zone.need}人）` : `${zone.name}を守る あと${Math.max(0, Math.ceil(zone.hold - zone.holdT))}秒`);
      }
      if (F.step === 3) {
        let hitters = 0, near = 0;
        for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut) { if (Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 10) near++; if (u.target === F.gate || u.atk?.target === F.gate) hitters++; }
        rt.objProgress('main', sightPoint(rt, GATE) ? `${gateWord(F.gate)}（強さ${Math.ceil(F.gate.hp / F.gate.maxHp * 100)}％）。${hitters ? `打ち手${hitters}人を守れ` : near ? '打ち手は門前。印で押し続けて打て' : '打ち手を土橋へ集めよ'}` : '門の正面の印へ。押し続けて門を打て');
      }
    }
    if (F.step >= 3.5 && F.SZ) {
      F.SZ.tick(dt);
      const s = F.SZ.byId;
      // 上の郭を先に取っていた時も、下の郭からの道の確保を待つ。
      if (!F.innerDone && s.ridge1.owner === ZONE_STATE.FRIEND && (s.ridge2.owner === ZONE_STATE.FRIEND || s.yashiki.owner === ZONE_STATE.FRIEND)) {
        F.innerDone = true; F.innerRoute = s.yashiki.owner === ZONE_STATE.FRIEND ? 'yashiki' : 'ridge2'; this.honmaru(rt);
      }
      if (F.step === 4 && s.ridge1.owner === ZONE_STATE.FRIEND && (s.ridge2.owner === ZONE_STATE.FRIEND || s.yashiki.owner === ZONE_STATE.FRIEND) && s.shu.owner === ZONE_STATE.FRIEND && F.last.every(gone)) this.win(rt);
    }
    // 十五秒ごとに先手の移動を比べる。詰まった隊を勝手に運ばず、集合を促す。
    if (!F.ending && F.step >= 1 && rt.t >= (F.stallCheckT || 0)) {
      F.stallCheckT = rt.t + 15;
      for (const q of F.oda) {
        if (gone(q)) continue;
        const c = q.center();
        const stopped = q.sgStep === F.step && Math.hypot(c.x - q.sgX, c.z - q.sgZ) < 2;
        q.sgStall = stopped ? (q.sgStall || 0) + 15 : 0;
        q.sgStep = F.step; q.sgX = c.x; q.sgZ = c.z;
        if (q.sgStall >= 45 && rt.t >= (F.stallSayT || 0) && sightPoint(rt, c)) {
          F.stallSayT = rt.t + 45;
          const waypoint = q.order === 'path' ? q.path?.[q.pathIdx] : null;
          const blocked = waypoint && rt.army.wallBetween(c, -1, { x: waypoint[0], z: waypoint[1] });
          rt.say('組頭', q.order === 'assault' || blocked ? '門か柵が道を塞いでおる。先手へ戻り、口を開ける組を守れ' : q.order === 'path' ? '先手の列が道で止まっておる。尾根道へ戻り、列と進め' : '先手が持ち場で待っておる。集まり、敵を崩して味方と押さえよ', 5);
          const stalledStep = F.step;
          rt.marker('gather', () => gone(q) || F.ending || F.step !== stalledStep || q.sgStall < 45 ? null : q.center(), '止まった先手・ここへ集まれ', { group: q });
          break;
        }
      }
    }
    // 攻め口の兵が崩れれば、時間で勝たせず寄せを打ち切る。
    if (!F.ending && F.step >= 1 && F.oda.every(gone)) {
      F.ending = true; rt.objFail('main'); rt.say('組頭', '寄せは崩れた。麓へ退け！', 4); rt.tracker.main = false; rt.setPhase('end'); rt.objProgress('main', '');
      for (const id of ['climb', 'gate', 'gather', 'rg1', 'rg2', 'yashiki', 'honmaru', 'l1', 'l2', 'tower']) rt.unmark(id);
      rt.uninteract('yashikiRoute'); rt.uninteract('tower'); rt.uninteract('ramgate'); rt.unzone('tower'); rt.finish({}, 6);
    }

  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || !sightPoint(rt, g.anchor) || rt.t < (F.routSayT || 0)) return;   // 同じ知らせを続けて出さない
    F.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が退いていく！`, 2.5);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    if (!F.gateCreek && s.hp < s.maxHp * 0.5) { F.gateCreek = true; rt.bark('門の板が割れてきた'); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();   // 扉が内へ倒れる
    sfx('wood', 1.2);
    rt.unmark('gate'); rt.unmark('sally');
    if (!F.ending && !rt.over && rt.player.u.alive && F.step === 3) this.interior(rt);
  },

};

// 総勢は諸説ある。見える一人の死から全軍の死者を作らない。
shigisan.force = () => ({ a: 40000, a0: 40000, b: 8000, b0: 8000 });
shigisan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '松永軍', mon: 'todo' } };
// 父子は高櫓の内。架空の名乗り・討取りの段は設けない。
shigisan.famous = []; // 海老名は片岡城の討死記事。久通を木戸外の討取り役にしない。
shigisan.date = () => '天正五年十月十日　冬・夜攻め';
shigisan.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '城攻めの下知まで待つ' : '');
shigisan.skip = (rt) => {
  const F = rt.flags;
  if (F.step === 0 && !F.ending && F.climbTimer) F.climbTimer.t = Math.min(F.climbTimer.t, 0.2);
};
shigisan.history = '天正五年（1577）八月、石山本願寺を囲む陣にいた松永久秀は、勝手に陣を払って大和の信貴山城に籠もり、再び信長に背いた。信長は嫡男の織田信忠を大将に、佐久間信盛・羽柴秀吉・明智光秀・丹羽長秀らを諸口へ向かわせ、筒井順慶・細川藤孝らも攻めに加わり、支城の片岡城を落としてから信貴山城を囲んだ。十月十日の晩、諸口から夜攻めが行われ、城は落ち、久秀は天守に火を放って自害した。この日は、十年前に東大寺の大仏殿が焼けた日と同じで、人々は因果と噂したと『信長公記』は伝える。久秀が名物の茶釜「平蜘蛛」を打ち砕いて死んだという話は、のちの伝えである。大和はその後、筒井順慶が治めた（大和一国を正式に任されたのは天正八年）。松永の紋は蔦で、ここでは近い形の蔦の紋で旗を描いている。兵の数には諸説ある。織田四万・松永八千という従来の目安を保つが、当夜に籠もった兵の確かな数は不明。各将の攻め口・北尾根の細かな攻め順・伏兵・櫓の放火・天守の形は推定で、当夜の天気は確定していない。';

function march(g, pts) {
  if (gone(g)) return;
  g.order = 'path'; g.path = pts; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.width = 5; g.speed = 2.3; g.guard = false;
  g.onArrive = (q) => { q.order = 'hold'; q.formation = 'yari'; q.width = 7; q.aggro = 14; };
}
function gateWord(g) {
  return g.hp > g.maxHp * 0.65 ? '門はまだ堅い' : g.hp > g.maxHp * 0.3 ? '門の板が割れてきた' : '門が大きくきしむ';
}

// 素直な遊び手：筒井について登り、伏兵と戦い、櫓に火をかけ、門を破る組を守り、天守の前で戦う
shigisan.botBrain = (b, inp, o) => { sgBot(b, inp, o); steerRing(b, inp, HONMARU); gateSteer(b, inp); };
function sgBot(b, inp, { goTo, patientStrike }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然に戻らず、手当ても五％まで。処置を済ませたら任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (u.hp < u.maxHp * 0.5 && canTreat) b.botRest = true;
  if (!canTreat || u.hp >= u.maxHp * 0.5) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    // 麓の定点で待つと味方から離れ、傷を縛れない。近い味方へ戻って止まる。
    let mate = null, md = Infinity;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.type === 'dummy' || o.noTarget ||
          Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < md) { mate = o; md = d; }
    }
    if (mate) { goTo(p, inp, mate.pos.x, mate.pos.z, 4); return; }
    b.botRest = false;
  }
  // 門が破れた後の曲輪の守りも、城内の相手として選ぶ。
  const inside = F.step >= 3.5;
  const e = b.army.nearestEnemy(u, F.step === 2 ? 6 : 12, (o) => !o.noTarget && !o.invuln && !o.fleeing && o.type !== 'dummy' &&
    Math.abs(o.pos.y - u.pos.y) < 3 &&
    (inside || o.pos.z > GATE.z + 0.8) && !b.army.wallBetween(u.pos, u.team, o.pos, false));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    // 山の別の段の敵を追わず、通れる相手へ寄る。詰まった時は共通の回り道を使う。
    if (d > reach * 0.85 && !e.charging) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    // 構えたままの連打は槍の払いになり、気力を失う。受けた後に構えを解いて突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    // 先手も伏兵も、別の折り返しから直線で追うと切岸へ出てしまう。
    // 人が見ている道の印をたどり、伏兵へ戻る時も同じ道で戻る。
    const goal = F.ambSeen && !gone(F.amb) ? F.amb.center() : F.guidePoint;
    climbBotWay(p, inp, goal.x, goal.z, 2, goTo);
    return;
  }
  if (F.step === 2) { const it = b.interacts.find((q) => q.id === 'tower'); if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); } return; }
  if (F.step === 3) {
    const it = b.interacts.find((q) => q.id === 'ramgate');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1);
      else { p.yaw = Math.PI; inp.k.add('KeyE'); }
    }
    return;
  }
  if (F.step === 3.5) { const q = [F.rg1, F.rg2, F.ryk].find((g) => g && !gone(g)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); return; } goTo(p, inp, RIDGE1.x, RIDGE1.z, 2); return; }
  if (F.step === 4) {
    if (u.pos.z > GATE.z + 0.5) { if (Math.abs(u.pos.x) > 2.5) { goTo(p, inp, 0, GATE.z + 3, 1); return; } goTo(p, inp, 0, GATE.z - 4, 1); return; }
    const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, c.z, 2); } else goTo(p, inp, TOP.x, TOP.z + 8, 2);
    return;
  }
  const a = F.tsuU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3);
}

// 登城道上の位置を、折り返しの番号と割合で表す。結果の入れ物は使い回す。
function climbRoadPoint(x, z, out) {
  out.d = Infinity;
  for (let i = 0; i < CLIMB_END; i++) {
    const a = ROAD[i], b = ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d >= out.d) continue;
    out.x = qx; out.z = qz; out.s = i + t; out.d = d;
  }
}
function climbBotWay(p, inp, x, z, r, goTo) {
  const from = p._sgRoadFrom || (p._sgRoadFrom = {}), to = p._sgRoadTo || (p._sgRoadTo = {});
  climbRoadPoint(p.u.pos.x, p.u.pos.z, from);
  climbRoadPoint(x, z, to);
  // 最後は道の脇の伏兵へ寄る。道から離れた事だけで引き戻さない。
  if (Math.abs(from.s - to.s) < 0.08 && Math.hypot(x - p.u.pos.x, z - p.u.pos.z) < 12) {
    goTo(p, inp, x, z, r); return;
  }
  if (from.d > 2.8) { goTo(p, inp, from.x, from.z, 1); return; }
  const forward = to.s > from.s;
  let i = forward ? Math.floor(from.s) + 1 : Math.ceil(from.s) - 1;
  if (i >= 0 && i <= CLIMB_END && Math.hypot(ROAD[i][0] - p.u.pos.x, ROAD[i][1] - p.u.pos.z) < 1.2) i += forward ? 1 : -1;
  if (i >= 0 && i <= CLIMB_END && (forward ? i <= to.s : i >= to.s)) {
    goTo(p, inp, ROAD[i][0], ROAD[i][1], 1);
  } else if (Math.hypot(to.x - p.u.pos.x, to.z - p.u.pos.z) > 1.2) {
    goTo(p, inp, to.x, to.z, 1);
  } else goTo(p, inp, x, z, r);
}

const HONMARU = { x: TOP.x, z: TOP.z, r: TOP.r, gap: 0 };
function gateSteer(b, inp) {
  if (!inp.k.has('KeyW') || (b.flags.gate && b.flags.gate.alive)) return;
  const p = b.player, u = p.u, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const az = u.pos.z + fz * 3, ax = u.pos.x + fx * 3;
  if (Math.abs(u.pos.x) < 2.5 || Math.abs(u.pos.x) > 30 || Math.abs(ax) < 2.5) return;
  const wz = GATE.z + (Math.min(28, Math.abs(u.pos.x)) - 3.5) / 24.5 * 4;   // その x での柵の z
  if (u.pos.z > wz + 0.3 && az < wz + 1.5) p.yaw = Math.atan2(-u.pos.x, GATE.z + 4 - u.pos.z);
  else if (u.pos.z < wz - 0.3 && az > wz - 1.5) p.yaw = Math.atan2(-u.pos.x, GATE.z - 3 - u.pos.z);
}

shigisan.withdrawTick = (rt) => {
  const F = rt.flags, f = F.castleFire;
  if (!f) return;
  const t = Math.min(1, (rt.t - F.castleFireAt) / 12);
  f.size = 0.8 + t * 3.2;
  f.base = rt.world.heightAt(f.x, f.z) + 0.3 + t * 5;
  f.glow?.scale.setScalar(7 * Math.max(1, f.size / 1.3));
  if (rt.t >= (F.castleSmokeAt || 0) && f.smoke != null && rt.world.smokeCol) {
    F.castleSmokeAt = rt.t + 0.5;
    const smoke = rt.world.smokeCol;
    for (let k = 0; k < smoke.PER; k++) { const i = f.smoke * smoke.PER + k; smoke.pos[i * 3 + 1] = f.base + f.size * 0.5; smoke.seed[i * 2 + 1] = Math.min(4, f.size * 0.9); }
    smoke.pts.geometry.attributes.position.needsUpdate = smoke.pts.geometry.attributes.seed.needsUpdate = true;
  }
};
export { shigisan };
