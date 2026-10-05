import { placeGroup } from './b_opening.js';
import { jinkeiBuild } from './jinkei.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { tsuigekiRetreat, tsuigekiStart, tsuigekiTick } from './c20_tsuigeki.js';
// 設楽原：備ごとの寄せ、柵際の乱戦、内側への後退と合図の一斉射。細部は説による復元。
import { gauss, allyGroup, nm, enemyGroup, centerOf } from './bhelp.js';
import { buildBobosaku } from './b_sunomata.js';
import { scenarioKey, RANKS } from './state.js';
import { nagashinojo } from './b_nagashinojo.js';
import { nobori, tawara, stumps } from './props.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_VOLLEY, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { sightPoint } from './battle_sight.js';
import { sendOrder } from './denrei.js';
import { seasonOf, sky } from './b_shared.js';
import * as DP from './b_depth.js';
import { depthTick, depthStart } from './b_depth.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';
import * as THREE from 'three';
import { flagTexture } from './textures.js';
import { doruiLine } from './castle_parts.js';
// 地面を作る前に標高を読み終える。後から届いても地面の格子は作り直されない。
import DEM from './asset_dem_shitaragahara.js';
import { tagZones, gapSize, zoneHp, inArc, assignBands, ceaseBands, kamaeBands, volleyBands, rollBands, bandState, bandPct, bandLabel, losTick, reserveTick } from './yasen_jinchi.js';

// 横・奥行き・高さを同じ二分の一にする。南北だけ十倍以上縮めていた旧配置は使わない。
// 鉄砲は柵の口を通り、内側の道から支援の位置へ移る。
function gunRoad(rt, g, z, x, side) {
  const c = g.center();
  // 一・三列目の口は z〜z+6、二列目は z+3〜z+9。重なる道の中央を通る。
  const gateZ = z + 4.5;
  const path = c.x > SB.x0 - 2 * SB.gap ? [[c.x, c.z], [c.x, gateZ], [x, gateZ], [x, side]] : [[c.x, c.z], [x, c.z], [x, side]];
  const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
  for (let i = 1; i < path.length; i++) {
    a.x = path[i - 1][0]; a.z = path[i - 1][1]; b.x = path[i][0]; b.z = path[i][1];
    if (rt.army.wallBetween(a, -1, b, false)) return null;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3);
    for (let j = 1; j <= n; j++) if (!rt.world.walkable(a.x + (b.x - a.x) * j / n, a.z + (b.z - a.z) * j / n)) return null;
  }
  return path;
}
function readyCount(g) {
  let n = 0;
  for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget) n++;
  return n;
}
function gunsLoaded(gs) {
  let living = false;
  for (const g of gs) if (!g.routed) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && !u.sidearm && u.gunAmmo !== 0 && u.type === 'gun') {
    living = true; if (!u.reload) return true;
  }
  return !living;
}

// 土塁の切れ目から奥の道へ出て、次の虎口へ進む。道筋は下知の時だけ作る。
function postRoad(rt, g, pt) {
  const c = g.center(), route = rt.flags.fenceRoute;
  g.focus = null; g.pending = null; g.aggro = 2;
  const crossesFence = (c.x > SB.x0 - 2 * SB.gap + 2) !== (pt.x > SB.x0 - 2 * SB.gap + 2);
  if (Math.abs(c.z - pt.z) > 24 || crossesFence) {
    let gate = route.gates[0];
    for (const z of route.gates) if (Math.abs(z - c.z) < Math.abs(gate - c.z)) gate = z;
    const gz = gate + route.offset;
    let next = route.gates[0];
    for (const z of route.gates) if (Math.abs(z - pt.z) < Math.abs(next - pt.z)) next = z;
    const nz = next + route.offset;
    g.order = 'path'; g.formation = 'column'; g.colW = 1; g.pathIdx = 0;
    g.path = c.x <= route.rearX + 0.8
      ? [[route.rearX, c.z], [route.rearX, nz], [pt.x, nz], [pt.x, pt.z]]
      : [[c.x, gz], [route.rearX, gz], [route.rearX, nz], [pt.x, nz], [pt.x, pt.z]];
    g.dest = null;
  } else { g.order = 'move'; g.dest = pt; g.path = null; }
  g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI / 2; q.formation = q.kind === 'gun' || q.kind === 'bow' ? 'line' : 'yari'; };
}

// 知らせの発生時だけ使番を出す。到着・討死は共通の実際の移動で判定する。
// 本物の兵の枠は共通の二百五十人を守る。届かなくても戦の流れは止めない。
function shReport(rt, text, dur = 3, source = null) {
  const F = rt.flags;
  if (!source) {
    const z = /南|山県|赤備え/.test(text) ? MOUTHS[2].z
      : /北|真田|丸山/.test(text) ? MOUTHS[0].z : MOUTHS[1].z;
    source = /羽柴/.test(text) ? { x: REAR_POSTS[1][1], z: REAR_POSTS[1][2] }
      : { x: F.fenceRoute.rearX, z };
  }
  sendOrder(rt, source, rt.player.u, { id: 'report', apply() {
    if (!F.ending && !rt.over && rt.player.u.alive) rt.say('使番', text, dur);
  } }, { team: 0, faction: F.oda ? 'oda' : 'tokugawa' });
}
// 使番も三重の柵の口と奥の道を使う。行き先の入れ物は兵ごとに使い回す。
function shRunnerWay(army, u, target) {
  if (!u.group?.isRunner) return target;
  const rearX = SB.x0 - 2 * SB.gap - 6;
  const p = u.pos, out = u.shRunnerPoint || (u.shRunnerPoint = { x: 0, z: 0 });
  out.x = target.x; out.z = target.z;
  const split = SB.x0 - SB.gap;
  const crosses = army.wallBetween(p, -1, target, false);
  if (crosses) {
    let gate = SB.gates[0];
    for (const z of SB.gates) if (Math.abs(z - p.z) < Math.abs(gate - p.z)) gate = z;
    const z = gate + 4.5;
    if (Math.abs(p.z - z) > 1) { out.x = p.x; out.z = z; }
    else { out.x = target.x; out.z = z; }
  } else if (p.x < split && Math.abs(p.z - target.z) > 24) {
    if (Math.abs(p.x - rearX) > 1) { out.x = rearX; out.z = p.z; }
    else { out.x = rearX; out.z = target.z; }
  }
  return out;
}

const METRES = 2;
const DEM_SCALE = 1 / METRES;
const SB = { x0: 14, gap: 7, z0: -500, z1: 500, gates: [-280, 18, 350] };
const MOUTHS = [
  { name: '大宮前', z: SB.gates[0] },
  { name: '柳田前', z: SB.gates[1] },
  { name: '竹広', z: SB.gates[2] },
];
const ZONES = [
  { name: '左翼', z0: SB.z0, z1: -220 },
  { name: '中央左', z0: -220, z1: -60 },
  { name: '中央', z0: -60, z1: 60 },
  { name: '中央右', z0: 60, z1: 260 },
  { name: '右翼', z0: 260, z1: SB.z1 },
];
const zoneOfZ = (z) => (ZONES.find((zz) => z >= zz.z0 && z < zz.z1) || (z < SB.z0 ? ZONES[0] : ZONES[4])).name;
const RENGO = [[22, -760], [20, -500], [22, -280], [24, -20], [20, 180], [22, 350], [24, 500], [22, 760]];
const OMIYA = [[-190, -760], [-170, -400], [-160, 0], [-175, 350], [-190, 760]];
const CHAUSU = { x: -486, z: -100 }; // 柵から実距離約一キロ、西の奥
const KATSUYORI = { x: 430, z: 10 }; // 才ノ神の本陣。東の丘を越えた後方
// 出沢・寒狭川方面の退き口を縮めた遊び用の位置。連吾川と寒狭川を混同しない。
const REARGUARD = { x: 210, z: -320 };
const ESCAPE = { x: 690, z: -420 };
const IEYASU = { x: -80, z: 350 };
const MARUYAMA = { x: -28, z: -440 };
// 名札は実在の家紋と併用。紋が未収録の隊は所属する家の紋で示す。
const ALLIED_POSTS = [
  ['佐久間信盛', -28, -440, 'oda', 'oda', 'spear'],
  ['仙石秀久', -55, -340, 'oda', 'oda', 'spear'],
  ['野々村正成', -55, -200, 'oda', 'oda', 'gun'],
  ['佐々成政', -55, -70, 'oda', 'shuro', 'gun'],
  ['前田利家', -55, 0, 'oda', 'maeda', 'gun'],
  ['塙直政', -55, 70, 'oda', 'oda', 'gun'],
  ['福富貞次', -55, 140, 'oda', 'oda', 'gun'],
  ['榊原康政', -65, 240, 'tokugawa', 'tokugawa', 'spear'],
  ['本多忠勝', -65, 440, 'tokugawa', 'honda', 'spear'],
];
const REAR_POSTS = [
  ['明智光秀', -240, -420, 'oda', 'akechi', 'spear'],
  ['羽柴秀吉', -300, -320, 'oda', 'oda', 'spear'],
  ['丹羽長秀', -240, -230, 'oda', 'sujikai', 'spear'],
];
const TAKEDA_POSTS = [
  ['馬場信春', 250, -440, 'takeda', 'takeda', 'spear'],
  ['土屋昌次', 105, -340, 'takeda', 'takeda', 'mixed'],
  ['真田信綱', 110, -240, 'takeda', 'sanada', 'mixed'],
  ['真田昌輝', 140, -170, 'takeda', 'sanada', 'mixed'],
  ['内藤昌豊', 105, -30, 'takeda', 'takeda', 'mixed'],
  ['原昌胤', 140, 70, 'takeda', 'takeda', 'spear'],
  ['武田逍遥軒信廉', 210, 130, 'takeda', 'takeda', 'mixed'],
  ['小山田信茂', 110, 250, 'takeda', 'takeda', 'spear'],
  ['山県昌景', 45, IEYASU.z, 'akazonae', 'akazonae', 'cavalry'], // 家康と実距離二百五十メートル
];
// 初めにだけ作り、同じ隊の幟では材質を使い回す。
const postMaterials = new Map();
function postFlag(rt, name, x, z, mon) {
  const g = nobori(rt.world, x, z, mon, 6.5), cloth = g.userData.flag;
  let mat = postMaterials.get(name);
  if (!mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.drawImage(flagTexture(mon).image, 0, 0, 256, 512);
    ctx.fillStyle = '#ece4d2'; ctx.fillRect(28, 284, 200, 204);
    ctx.fillStyle = '#14120f'; ctx.font = 'bold 26px serif'; ctx.textAlign = 'center';
    const rows = name.length > 6 ? [name.slice(0, 2), name.slice(2, 5), name.slice(5)] : [name.slice(0, 2), name.slice(2)];
    rows.forEach((row, i) => ctx.fillText(row, 128, 335 + i * 48));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    mat = cloth.material.clone(); mat.map = tex; mat.needsUpdate = true;
    postMaterials.set(name, mat);
  }
  cloth.material = mat;
  rt.scene.add(g);
  return g;
}
const SH_FRONT = SB.x0 + 2;   // これより東へ出たら「柵の外」
const OVERRUN_LIMIT = 30;     // 知らせを見て、組と奥の柵へ戻れる猶予

const shitaragahara = {
  noWake: false, // 近い兵は同じ位置から本物へ替える。通常兵は消さず、空いた枠だけ使う。
  noReinforcements: true, // 休息の間も、人数だけを見て新手を湧かせない。
  wakeFullSize: true, // 遠景の背丈を本物の人物へ掛けて縮めない。
  botOrders: true, // 虎口の道筋・持ち場・反撃を、走る癖や持ち替えで上書きしない。
  spawn: { x: 10, z: SB.gates[1] + 4.5, heading: Math.PI / 2 },
  moveLim: 740, // 南北の虎口・両本陣・東の退路を、歩ける場にも収める
  taisho: { a: { name: '織田信長', use: true }, b: { name: '武田勝頼', def: true } },
  noTaishoRaid: true, // 柵と川を無視して本陣を狙う共通の新手は出さない
  wakeRoom: 245,
  prelude: false, // 霧の寄せをすぐ始める。共通の待機で隊を止めない。
  world: {
    seed: 57,
    moveLim: 740,
    groundHalf: 780, // 地面の頂点数は増やさず、南北二キロの柵と後方の山まで収める
    mood: 'morning',
    muddy: 0.25,
    mist: true,
    wetStart: 0.55,      // 前の雨で湿った地面。朝の戦の間は雨を降らせない
    time: 'day',
    runnerWay: shRunnerWay,
    moveWay: shRunnerWay,
    waterSlow: true,   // 連吾川・水田で騎馬の加速が落ちる（terrain_tags.js の 'water' タグ。長篠・設楽原 統合版 3〜4 章）
    paths: [
      [[-176, 10], [-80, 8], [-55, 8]],
      [[-55, -440], [-55, 440]],
      // 土塁の奥の南北道と三つの虎口。急な岸でも、組が徒歩で移れる道を残す。
      [[-6, SB.z0], [-6, SB.z1]],
      ...SB.gates.map((z) => [[-55, z + 4.5], [-6, z + 4.5], [SB.x0 + 6, z + 4.5]]),
    ],
    height(x, z) {
      let h = 0.8 * Math.sin(x * 0.035) * Math.cos(z * 0.028) + 0.5 * Math.sin(z * 0.06 + x * 0.02);
      // 標高の範囲を出た時だけ使う、低い弾正山・丸山と東の丘の続き
      h += 8 * Math.exp(-((x + 85) ** 2) / 3200) + 6 * gauss(x, z, MARUYAMA.x, MARUYAMA.z, 1600) + 18 * gauss(x, z, CHAUSU.x, CHAUSU.z, 16000);
      h += 18 * Math.exp(-((x - 180) ** 2) / 16000) + 12 * gauss(x, z, KATSUYORI.x, KATSUYORI.z, 16000);
      if (DEM) h = demBlend(DEM, x - 22, z, h, { scale: DEM_SCALE, xyScale: METRES });
      // 標高の粗い格子をそのまま岸へ使うと、浅い川面が斜面に埋まる。
      // 川筋の高さは保ち、岸だけをなだらかにする。地面の頂点数は増やさない。
      for (let i = 1; i < RENGO.length; i++) {
        const a = RENGO[i - 1], b = RENGO[i];
        if (z < a[1] || z > b[1]) continue;
        const rx = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
        const d = Math.abs(x - rx);
        if (d < 12) {
          let bank = 0.8 * Math.sin(rx * 0.035) * Math.cos(z * 0.028) + 0.5 * Math.sin(z * 0.06 + rx * 0.02);
          bank += 8 * Math.exp(-((rx + 85) ** 2) / 3200) + 6 * gauss(rx, z, MARUYAMA.x, MARUYAMA.z, 1600) + 18 * gauss(rx, z, CHAUSU.x, CHAUSU.z, 16000);
          bank += 18 * Math.exp(-((rx - 180) ** 2) / 16000) + 12 * gauss(rx, z, KATSUYORI.x, KATSUYORI.z, 16000);
          if (DEM) bank = demBlend(DEM, rx - 22, z, bank, { scale: DEM_SCALE, xyScale: METRES });
          const k = Math.min(1, Math.max(0, (d - 6) / 6));
          h = bank + (h - bank) * k * k * (3 - 2 * k);
        }
        break;
      }
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
      if (Math.abs(x - 21) < 14) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => x > -45 && x < 95,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (x < 28 || x > 58) return 0;
      if ((Math.floor(x / 11) + Math.floor(z / 16)) % 2) return 0;
      const ex = Math.min(((x % 11) + 11) % 11, 11 - ((x % 11) + 11) % 11), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    // 連吾川の渡渉を扱う浅い流れ。深さは推定で、腰を越す一様な水深にはしない。
    streams: [{ pts: RENGO, w: 3.2, depth: 0.6 }, { pts: OMIYA, w: 2, depth: 0.8 }],
    trees: 300,
    tufts: 4200,
    // 武田の陣の丘は木を疎らに（丘に並ぶ武田の備が柵から見えるように）
    treeDensity: (x, z) => (x < -60 ? (Math.abs(z + 65) < 28 || Math.abs(z - 28) < 65 ? 0.12 : 0.65) : x > 168 ? 1 : x > 60 ? 0.12 : 0.3),
    groves: [{ x: -70, z: -40, r: 14, n: 22 }, { x: 168, z: 20, r: 16, n: 26 }, { x: 150, z: -120, r: 14, n: 20 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.fence = [];
    let edge = SB.z0;
    for (const mouth of MOUTHS) {
      const z0 = mouth.z - 96, z1 = mouth.z + 96;
      // 交戦口は六メートル、間の柵は三十メートル単位でまとめ、壊せる区画の増え方を抑える。
      if (edge < z0) buildBobosaku(rt, { x0: SB.x0, z0: edge, z1: z0, gap: SB.gap, segLen: 30, facing: 1 }).forEach((f) => F.fence.push(f));
      F.fence.push(...buildBobosaku(rt, { x0: SB.x0, z0, z1, gap: SB.gap, gates: [mouth.z], facing: 1 }));
      edge = z1;
    }
    if (edge < SB.z1) F.fence.push(...buildBobosaku(rt, { x0: SB.x0, z0: edge, z1: SB.z1, gap: SB.gap, segLen: 30, facing: 1 }));
    tagZones(F.fence, ZONES);
    // 三列の虎口が重なる所を道筋に使う。遊び手の頭に古い座標を残さない。
    F.fenceRoute = { gates: SB.gates, offset: 4.5, rearX: SB.x0 - 2 * SB.gap - 6, frontX: SB.x0 + 6 };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { fence: 'HIST_A', tripleFence: 'HIST_B', rengoRiver: 'HIST_A', honjinOda: 'HIST_B', honjinTokugawa: 'HIST_B', takedaWaves: 'GAME_C', fenceTrap: 'GAME_C', dorui: 'HIST_B', orderDelay: 'GAME_C', footFirst: 'GAME_C' };
    // 土塁：三重目の柵のすぐ後ろ（鉄砲兵の後ろ）に、虎口を空けて盛る。柵の前の浅い空堀は地形（height）で掘ってある
    {
      const bx = SB.x0 - 2 * SB.gap - 3, gz = SB.gates;
      const cut = [[SB.z0 + 2, gz[0] - 1], [gz[0] + 10, gz[1] - 1], [gz[1] + 10, gz[2] - 1], [gz[2] + 10, SB.z1 - 2]];
      for (const [za, zb] of cut) doruiLine(rt, [[bx, za], [bx, zb]], { w: 2.4, h: 0.6, name: '土塁' });
    }
    F.broken = 0;
    // 総勢は戦後の解説へ。足元の討死から全軍の残数を推定して知らせない。
    // 織田家編では、織田の鉄砲奉行（前田利家）の下の足軽として柵の内に立つ。戦の流れは同じで、上役・家・持ち場の旗だけ替わる
    const oda = scenarioKey() === 'oda' && !rt.G.lord;
    F.oda = oda;
    F.boss = oda ? '前田利家' : '大久保忠世';
    F.canLead = rt.G.lord || rt.G.rank >= 1;
    F.canGun = rt.G.lord || rt.G.rank >= 4;
    F.noticePt = { x: 0, z: 0 };
    F.voice = '組頭';
    const odaZ = 190;   // これより北（-z）は織田の持ち場（通説どおり織田が北寄り、徳川が南）
    // 鉄砲組：一列目の柵のすぐ内。号令があるまで撃たない
    F.guns = [];
    for (const mouth of MOUTHS) for (let i = 0; i < 3; i++) {
      const z = mouth.z + (i - 1) * 12;
      // 各組四挺。傷を人数で割らず、三つの口に本物の射手を残す。
      const gunN = 4;
      F.guns.push(allyGroup(rt, { faction: z < odaZ ? 'oda' : 'tokugawa', name: mouth === MOUTHS[0] ? '野々村の鉄砲組' : mouth === MOUTHS[1] ? ['佐々の鉄砲組', '前田の鉄砲組', '塙の鉄砲組'][i] : mouth.name + 'の鉄砲組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2.4, z }, facing: Math.PI / 2, width: gunN > 4 ? 14 : 8, spacing: gunN > 4 ? 1.4 : 2, ranks: 1, aggro: 44, holdFire: true, dmgMult: 0.8 }, [{ type: 'gun', n: gunN }]));
    }
    // 五人の鉄砲奉行は、自分の備の控えとともに持ち場に残る。
    F.officers = [];
    for (const [name, x, z, fac] of ALLIED_POSTS.slice(2, 7)) {
      const q = allyGroup(rt, { faction: fac, name: name + 'の控え', fixed: true, fullStrength: true, noGuard: true, anchor: { x, z }, facing: Math.PI / 2, width: 6, aggro: 6, formation: 'yari' },
        [{ type: 'busho', n: 1, o: { name, invuln: true } }, { type: 'samurai', n: 2 }]);
      F.officers.push(q);
      if (name === F.boss) F.okubo = q.units[0];
    }
    if (!F.okubo) {
      const q = allyGroup(rt, { faction: 'tokugawa', name: '大久保忠世の控え', fixed: true, fullStrength: true, noGuard: true, anchor: { x: -95, z: 390 }, facing: Math.PI / 2, width: 6, aggro: 6, formation: 'yari' },
        [{ type: 'busho', n: 1, o: { name: '大久保忠世', invuln: true, horse: true } }, { type: 'samurai', n: 2 }]);
      F.officers.push(q); F.okubo = q.units[0];
    }
    // 列を機械的に回さず、別の組が弾込めの間を補う。
    F.bands = assignBands(F.guns);
    for (const q of F.guns) q.fireArc = Math.PI * 80 / 180;
    F.zoneHud = { name: '', pct: 100, breach: false };
    F.bandHud = { A: { state: '', pct: 0 }, B: { state: '', pct: 0 }, C: { state: '', pct: 0 } };
    F.localBands = { A: [], B: [], C: [] };
    // 槍の組：動く一組と、南北の虎口に残る守り。大将本人を連れ回さない。
    const ok = allyGroup(rt, { faction: 'oda', name: '仙石の槍組', fixed: true, fullStrength: true, noGuard: true, yariRanks: 3, anchor: { x: ALLIED_POSTS[1][1], z: ALLIED_POSTS[1][2] }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true, weapon: 'spear' } }, { type: 'ashigaru', n: 8 }]);
    F.sengoku = ok.units[0];
    F.spears = [ok];
    for (const [z, fac] of [[-298, 'oda'], [-22, 'oda'], [42, 'oda'], [368, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2 * SB.gap - 1, z }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: Math.abs(z) < 60 ? 7 : 3 }]));
    }
    // 予備隊（長篠・設楽原 統合版 37・45 章）：柵の後ろに控え、いちばん危ない区画へ自動で動く・向き直る（reserveTick が毎コマ判断）
    F.reserve = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: '予備の槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2 * SB.gap - 5, z: 0 }, facing: Math.PI / 2, width: 14, aggro: 8, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }]);
    F.spears.push(F.reserve);
    // 柵の守りは敗走の連鎖で消えない。傷と討死は残し、援護へ戻る時を作る。
    for (const q of F.spears) { q.defMult = 1.6; q.noRout = true; }
    const n = Math.min(30, (RANKS[rt.G.rank] || RANKS[0]).squad);
    // 設楽原は鉄砲の見せ場：組の中身を城下・出陣前で決めていなければ（makeSquad の側で kumi が優先される）、
    //   既定で三分の一ほどを鉄砲にして持たせる（柵の内で鉄砲隊を率いる役目）
    F.bigGun = n ? Math.max(1, Math.round(n / 3)) : 0;
    if (n) rt.makeSquad({ x: SB.x0 - 2 * SB.gap - 4, z: SB.gates[1] + 8 }, Math.PI / 2, F.bigGun ? [{ kind: 'spear', n: n - F.bigGun }, { kind: 'gun', n: F.bigGun, ranks: 2 }] : [{ kind: 'spear', n }]);
    // 守兵は遠くなっても消さない。新手も初めから置き、枠のための退場を使わない。

    // 本物の列の左右と奥は、同じ向きの軽い鉄砲・槍の列でつなぐ。
    // 開戦時に一度だけ並べる。南北の柵全体を三列でつなぎ、中央の槍だけ奥へ厚くする。
    // 虎口と本物の兵の足もとは空け、兵の判断処理は増やさない。
    const guardUnits = [...F.guns, ...F.spears, ...F.officers].flatMap((g) => g.units);
    for (const fac of ['oda', 'tokugawa']) for (const kind of ['gun', 'spear']) {
      const people = [], rows = kind === 'gun' ? [11.6, 9.6] : [-7, -10, -13, -16, -19, -22, -25, -28, -31, -34];
      for (const x of rows) for (let z = SB.z0 + 2; z <= SB.z1 - 2; z += 2.4) {
        if (kind === 'spear' && x < -13 && Math.abs(z) > 94) continue;
        if ((z < odaZ ? 'oda' : 'tokugawa') !== fac || SB.gates.some((g) => Math.abs(z - g) < 4)) continue;
        if (guardUnits.some((u) => Math.hypot(u.pos.x - x, u.pos.z - z) < 3.2)) continue;
        people.push({ x, z, k: kind, facing: Math.PI / 2, flag: people.length % 3 === 0 ? 1 : 0 });
      }
      const h = W.addDistantArmy({ people, kind, team: 0, mon: fac, flag: fac,
        armor: nagashinojo.kit.ARMOR[fac], facing: Math.PI / 2, host: false, seed: 5750 + (fac === 'oda' ? 0 : 2) + (kind === 'gun' ? 0 : 1) });
      // 柵内の控えも近い者から本物へ替え、列を守ったまま遠い枠を回す。
      h.army.people = false;
      h.army.jinkeiGuard = true;
    }

    // 家康は弾正山の南、信長は西の奥の茶臼山。自分の組は前田・佐々の持ち場を保つ。
    const KT = nagashinojo.kit, A = KT.ARMOR;
    F.reserveHome = { x: SB.x0 - 2 * SB.gap - 5, z: 0 };
    F.reserveOptions = { x: F.reserveHome.x, home: F.reserveHome, facing: Math.PI / 2 };
    F.camps = [
      camp(rt, { x: IEYASU.x, z: IEYASU.z, facing: Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 240, runTo: { x: SB.x0 - 12, z: MOUTHS[2].z } }),
      camp(rt, { x: CHAUSU.x, z: CHAUSU.z, facing: Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 260, runTo: { x: SB.x0 - 12, z: -50 } }),
    ];
    F.katsCamp = camp(rt, { x: KATSUYORI.x, z: KATSUYORI.z, facing: -Math.PI / 2, team: 1, faction: 'takeda', mon: 'takeda', general: { name: '武田勝頼' }, guard: 15, reserve: 0, runTo: { x: 280, z: 10 } });
    // 本陣の旗本は陣を守る。共通の「近い敵へ出る」判断で、柵や川へ追い出さない。
    for (const c of F.camps) {
      c.guard.guard = true; c.guard.stay = true;
      c.guard.guardSight = 22; c.guard.guardLeash = 8;
    }
    F.katsCamp.guard.formation = 'yari';
    F.katsCamp.guard.noRout = true; F.katsCamp.guard.guard = true;
    F.katsCamp.guard.stay = true; F.katsCamp.guard.guardSight = 22; F.katsCamp.guard.guardLeash = 8; // 勝頼の馬廻は退きの下知まで本陣を守る

    for (const [x, z, k, h] of [[IEYASU.x - 10, IEYASU.z + 10, 'onri', 6.5], [CHAUSU.x + 10, CHAUSU.z + 10, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 柵の内の旗（織田が北寄り、徳川が南）
    for (let z = SB.z0 + 12; z <= SB.z1 - 12; z += 44) rt.scene.add(nobori(W, SB.x0 - SB.gap - 3, z + 5, z < odaZ ? (oda && z % 44 === 0 ? 'maeda' : 'oda') : (z % 44 === 0 ? 'okubo' : 'tokugawa'), 5));
    rt.scene.add(tawara(W, -30, 30, 0.3, 6), tawara(W, -34, -20, -0.4, 5));
    // 遠景の村（西の山すそと、南の谷）
    // 村に添える平らな水面は斜面で板に見える。田は地形に沿う world.paddy に任せる。
    KT.farVillage(rt, -18, 160, { rot: Math.PI, n: 6, fields: 0, seed: 21 });
    KT.farVillage(rt, 64, -158, { rot: 0, n: 5, fields: 0, seed: 22 });
    // 大軍：織田・徳川三万八千、武田一万五千。備ごとに名と持ち場を分ける。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 一隊の体・旗・馬をそのまま使い、四つの備えを一度に描く。毎コマの並べ直しはしない。
    const deepHost = (x, z, count, facing, armor, flag, seed, kind, step, width, team = 0, general = null) => {
      const people = [], sx = Math.sin(facing), sz = Math.cos(facing);
      const per = Math.ceil(count / 4), cols = Math.ceil(width / 1.5), rows = Math.ceil(per / cols);
      for (let i = 0; i < per; i++) for (let a = 0; a < 4; a++) {
        if (i * 4 + a >= count) continue;
        const row = Math.floor(i / cols), l = (i % cols - (cols - 1) / 2) * 1.5;
        const back = a * step + row * 1.25;
        const yose = team === 1 && (kind === 'mixed' || kind === 'cavalry');
        const front = yose && a === 0 && row === 0;
        const banner = !front && i % (yose ? 9 : 43) === 0;
        people.push({ x: x - sx * back + sz * (l + (a % 2 ? 3 : -3)),
          z: z - sz * back - sx * (l + (a % 2 ? 3 : -3)), facing,
          general: i === Math.floor(cols / 2) && a === 0 ? general : undefined,
          k: general && i === Math.floor(cols / 2) && a === 0 ? 'rider' : front ? 'rider' : banner ? 'banner' : (kind === 'cavalry' || kind === 'mixed') && i % 8 === 0 ? 'rider' : kind === 'gun' && a === 0 ? 'gun' : i % 19 === 0 ? 'samurai' : 'spear',
          ex: front ? (i === Math.floor(cols / 2) ? 2 : 0) : banner && yose ? (Math.floor(i / 9) + a) % 6 : 1.3, flag: banner ? 0 : front || i % 3 === 0 ? 1 : 0 });
      }
      const g = W.addDistantArmy({ x: x - sx * (step * 1.5 + rows * 0.625), z: z - sz * (step * 1.5 + rows * 0.625),
        people, team, yoseFamily: team === 1 ? 'takeda' : flag, yose: team === 1 && (kind === 'mixed' || kind === 'cavalry'), w: width + 6, d: step * 3 + rows * 1.25, facing, armor, mon: flag, seed, kind, near: false, host: false });
      // 陣幕の人ではなく通常の備えとして、近い十数人だけ本物へ替える。
      // 並びを四段ずつ交互にしたので、低画質で間引いても奥の備えが残る。
      g.army.people = false; g.army.nImp = team === 1 && (kind === 'mixed' || kind === 'cavalry') ? g.army.nImp : 32; g.army.jinkeiGuard = true;
      return g;
    };
    // 陣形の表と描く備えを同じ場所へ結ぶ。遠景を二重に置かず、近い兵を替える仕組みも保つ。
    const buildHost = (p) => jinkeiBuild(rt, { ...p, sonae: p.sonae.filter((s) => s.draw).map((s) => ({ ...s, bindOnly: false })) }, (s, at) => {
      const h = deepHost(at.x, at.z, s.count, p.facing, A[s.flag] || A[p.team ? 'takeda' : 'oda'], s.mon,
        5700 + p.team * 100 + p.sonae.findIndex((q) => q.id === s.id), s.kind || 'spear', p.team ? 18 : 22, p.team ? 30 : 40, p.team, s.named === false || rt.army.units.some((u) => u.name === s.general)
          || ['馬場信春', '山県昌景', '真田信綱', '真田昌輝', '内藤昌豊'].includes(s.general) ? null : s.general);
      h.name = s.general + '隊';
      F.jinkeiBound[s.id] = h;
      h.army.noWake = false; // 元の備の近い兵と将だけを替え、遠い兵を新手として足さない
      if (s.named !== false) {
        h.namedFlag = postFlag(rt, s.general, at.x + (p.team ? -2 : 2), at.z, s.mon);
        h.flagX = h.namedFlag.position.x; h.flagZ = h.namedFlag.position.z;
      }
      return h;
    });
    F.alliedHosts = [...Object.values(buildHost(SHITARA_ODA_JIN)), ...Object.values(buildHost(SHITARA_TOKUGAWA_JIN))];
    F.hill = Object.values(buildHost(SHITARA_TAKEDA_JIN));
    F.namedHosts = [...F.alliedHosts, ...F.hill];
    postFlag(rt, '徳川家康', IEYASU.x, IEYASU.z, 'tokugawa');
    postFlag(rt, '織田信長', CHAUSU.x, CHAUSU.z, 'oda');
    F.katsuyori = DA(KATSUYORI.x, KATSUYORI.z, 38, 30, 300, -Math.PI / 2, A.takeda, 'takeda', 57, 'honjin');
    postFlag(rt, '武田勝頼', KATSUYORI.x, KATSUYORI.z, 'takeda');
    for (const mouth of MOUTHS) postFlag(rt, mouth.name, SB.x0 - SB.gap - 3, mouth.z - 9, mouth.z < 190 ? 'oda' : 'tokugawa');
    // 勝頼本人と馬廻は後方の陣幕へ置いた。共通の大将・新手を重ねない。
    F.katsuyori.noWake = true; F.katsuyori.army.noWake = true;
    // 近接する寄せ手と殿は開戦前からそれぞれの備に置く。
    F.waveGroups = this.WAVES.map((w) => this.makeWave(rt, w));
    F.south = this.makeWave(rt, { name: '山県昌景', hq: 'shitara_yamagata', fac: 'akazonae', z: MOUTHS[2].z, cav: 3, ash: 8, bamboo: true });
    // 後方の高みの旗を、柵の内の合図役が取り次ぐ。旗は開戦時にだけ作る。
    F.signalFlag = nobori(W, -32, MOUTHS[1].z - 12, 'oda', 8);
    F.signalBaseY = F.signalFlag.position.y;
    F.signalFlag.rotation.z = 0.65;
    rt.scene.add(F.signalFlag);
    F.hashibaFlag = nobori(W, REAR_POSTS[1][1], REAR_POSTS[1][2], 'oda', 10);
    F.hashibaFlag.rotation.z = 0.65;
    rt.scene.add(F.hashibaFlag);
    F.rear = enemyGroup(rt, { faction: 'takeda', name: '馬場隊', fixed: true, noGuard: true, anchor: { x: 250, z: -440 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 12, formation: 'yari', morale: 95, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 2 }]);
    // 馬場隊は追撃の退き口で初めて戦う。柵前で先に討死させない。
    for (const u of F.rear.units) { u.invuln = true; u.noTarget = true; }
    nagashinojo.kit.backOf(rt, F.rear, { flag: 'takeda', armor: A.takeda, kind: 'spear', w: 18, depth: 10, count: 120, seed: 79 });
    // 別の備も開戦前から待機し、寄せの下知で前進する。
    F.far = [];
    for (const [z, f, kind] of [[MOUTHS[2].z + 24, 'akazonae', 'mixed'], [MOUTHS[2].z - 24, 'akazonae', 'mixed'], [MOUTHS[1].z + 24, 'takeda', 'mixed'], [MOUTHS[1].z - 24, 'takeda', 'spear'], [MOUTHS[0].z + 24, 'takeda', 'mixed'], [MOUTHS[0].z - 24, 'takeda', 'mixed']]) {
      const m = DA(125, z, kind === 'mixed' ? 20 : 14, 12, kind === 'mixed' ? 80 : 90, -Math.PI / 2, A[f], f, 61 + F.far.length, kind);
      m.army.noWake = true; // 待機中から見える備。合図で前進するだけ。
      F.far.push({ m, z, v: 0 });
    }
    rt.world.setTime('day');
    rt.setPhase('brief');
    F.wave = 0;
    F.prepAt = rt.t;
    F.prepPt = { x: 10, z: SB.gates[1] + 4.5 };
    let row = 0;
    for (const q of rt.squadGroups || []) placeGroup(rt, q, F.prepPt.x - row++ * 4, SB.gates[1] + 8);
    rt.banner('設楽原、柵を守れ', '南北の攻めと囲んで撃つ策は、説をもとにした復元');
    rt.obj('hold', '柵を守れ。奥の柵を三十秒占められると負ける', 'main');
    rt.obj('stay', F.canLead ? '組を揃え、下知があるまで柵の外へ出るな' : '槍組に続け。下知があるまで柵の外へ出るな', 'order');

    rt.marker('prepare', F.prepPt, '槍を揃える持ち場', { hideNear: 7 });
    rt.say(F.voice, 'ここは前田と佐々の持ち場じゃ。槍で柵を守れ', 3.5);
    rt.after(3, () => shReport(rt, '南に赤備え！　備ごとに寄せてくるぞ', 3));
    rt.after(95, () => this.tobigasu(rt));
  },

  // 全軍の確かな攻撃順とはしない。南北は並行し、自分の組は北から中央へ歩く。
  WAVES: [
    { name: '真田信綱・昌輝', hq: 'shitara_sanada', fac: 'takeda', z: MOUTHS[0].z, home: { x: 110, z: -240 }, cav: 3, ash: 12, brother: true, line: '真田の備が来る！　仙石の柵を守れ！' },
    { name: '武田の中央の諸隊', hq: 'shitara_naito', fac: 'takeda', z: MOUTHS[1].z, cav: 3, ash: 12, general: '内藤昌豊', final: true, line: '勝頼の下知！　中央の諸隊が突っ込むぞ！' },
  ],

  makeWave(rt, w) {
    // 本来の備から攻め口へ進む。待機中から柵の正面へ寄せて置かない。
    const frontX = w.bamboo ? 45 : w.home?.x ?? 105, homeZ = w.home?.z ?? (w.final ? -30 : w.z);
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', fixed: true, noGuard: true, anchor: { x: frontX, z: homeZ }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: w.ash > 20 ? 22 : 12, spacing: 1.4, formation: 'yari', morale: 100, speed: 3 },
      [{ type: 'ashigaru', n: w.ash, o: { tatake: !!w.bamboo } }, { type: 'busho', n: 1, o: { name: w.brother ? '真田信綱' : w.general || w.name, horse: true } },
        ...(w.brother ? [{ type: 'busho', n: 1, o: { name: '真田昌輝', horse: true } }] : [])]);
    g.def = w;
    g.cavalry = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の騎馬衆', fixed: true, noGuard: true, anchor: { x: frontX + 26, z: homeZ + 8 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 10, morale: 95, speed: 5 }, [{ type: 'cavalry', n: w.cav }]);
    g.missiles = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', fixed: true, noGuard: true, anchor: { x: frontX + 16, z: homeZ - 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 10, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: w.ash > 20 ? 5 : 2 }, { type: 'bow', n: w.ash > 20 ? 5 : 2 }]);
    g.missiles.holdFire = true;
    nagashinojo.kit.backOf(rt, g, { flag: w.fac, armor: nagashinojo.kit.ARMOR[w.fac], kind: 'mixed', w: 26, depth: 18, count: 120, gap: 6, seed: 71 + this.WAVES.indexOf(w), stop: () => g.center().x < SB.x0 + 45 });   // 後ろの大軍も柵の近くまで押して、寄せの厚みを見せる
    return g;
  },

  // 一の柵の一区画を目標にする。口へ直行せず、取り付いた足軽の打撃で破る。
  attackFence(rt, g) {
    const F = rt.flags;
    let best = null, d = Infinity;
    for (const s of F.fence) if (s.row === 0 && s.alive) {
      const dz = Math.abs((s.seg[1] + s.seg[3]) / 2 - (g.def.z - 3));
      if (dz < d) { d = dz; best = s; }
    }
    g.breach = d < 18 ? best : null;
    g.lane = { x: SB.x0 - SB.gap + 1, z: g.def.z + 4.5 };
    g.formation = 'column'; g.colW = g.count > 14 ? 3 : 2; g.noRout = false;   // 大きな寄せは横に広げ、柵に前の列が並んで取り付く
    g.siegeStallAt = rt.t; g.lastFenceHp = g.breach?.hp;
    g.order = 'move';
    g.dest = g.breach ? { x: Math.max(g.breach.seg[0], g.breach.seg[2]) + 2, z: (g.breach.seg[1] + g.breach.seg[3]) / 2 } : g.lane;
    g.onArrive = (q) => { q.order = 'hold'; q.aggro = 2; };
    g.cavalry.order = 'move'; g.cavalry.dest = { x: SB.x0 + 24, z: g.def.z + 4.5 };
    g.cavalry.onArrive = (q) => { q.order = 'hold'; };
    g.missiles.holdFire = false; g.missiles.order = 'move';
    g.missiles.dest = { x: SB.x0 + 40, z: g.def.z - 14 };
    g.missiles.onArrive = (q) => { q.order = 'hold'; };
  },

  fronts(rt) {
    const F = rt.flags;
    if (F.frontsStarted) return;
    F.frontsStarted = true;
    this.attackFence(rt, F.south);
    sfx('taiko', 1);
    shReport(rt, '山県の赤備え、田を進む！　竹束を立てておる！', 3.5);
    const south = F.jinkeiBound.shitara_yamagata;
    if (south) south.advance(25, 18);
    F.roll = rollBands(rt, F.bands);
    rt.after(8, () => {
      if (F.ending || F.pursuit) return;
      sfx('taiko', 0.8);
      F.jinkeiBound.shitara_naito?.advance(52, 24);
      shReport(rt, '内藤の備も動いた！　中央から寄せるぞ！', 3);
    });
    rt.after(16, () => {
      if (F.ending || F.pursuit) return;
      sfx('taiko', 0.8);
      F.jinkeiBound.shitara_baba?.advance(278, 38);
      F.jinkeiBound.shitara_sakuma?.retreat(36, 16);
      shReport(rt, '北は馬場の備！　佐久間が退く！', 3);
      rt.after(38, () => {
        if (!F.ending && !F.pursuit) shReport(rt, '馬場が丸山を取ったとの知らせじゃ！', 3);
      });
    });
    rt.after(20, () => { if (!F.ending && !F.pursuit) this.wave(rt); });
  },

  wave(rt, ready = false) {
    const F = rt.flags, w = this.WAVES[F.wave];
    if (!w || F.pursuit || F.ending || (F.cur && !F.cur.doneWave)) return;
    if (!ready) {
      if (F.pendingWave) return;
      F.pendingWave = true; F.postWaitAt = rt.t;
      // 自分の移動中も寄せ手は川へ進む。柵への攻めは持ち場に着くか、猶予が尽きてから。
      const incoming = F.waveGroups[F.wave];
      incoming.order = 'move'; incoming.dest = { x: SB.x0 + 46, z: w.z };
      incoming.onArrive = (q) => { q.order = 'hold'; };
      incoming.cavalry.order = 'move'; incoming.cavalry.dest = { x: SB.x0 + 72, z: w.z + 8 };
      incoming.cavalry.onArrive = (q) => { q.order = 'hold'; };
      incoming.missiles.order = 'move'; incoming.missiles.dest = { x: SB.x0 + 62, z: w.z - 14 };
      incoming.missiles.onArrive = (q) => { q.order = 'hold'; };
      F.commandPt = { x: 10, z: w.z + 4.5 };
      F.stageGuns = F.guns.filter((q) => Math.abs(q.anchor.z - w.z) < 25);
      for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
      postRoad(rt, F.spears[0], F.commandPt);
      rt.setPhase('redeploy');
      rt.marker('next_mouth', F.commandPt, w.final ? '柳田前の持ち場' : '大宮前の持ち場', { hideNear: 7 });
      rt.obj('hold', w.final ? '柳田前の印へ歩き、組と中央の寄せに備えよ' : '大宮前の印へ歩き、仙石と北の柵を守れ', 'main');
      rt.obj('stay', '柵の奥の道を進み、印で鉄砲の組と揃えよ', 'order');
      rt.say(F.voice, w.final ? '中央の柳田前へ戻れ。鉄砲の組と揃えて受けるぞ' : '北の大宮前へ歩け。仙石と野々村を助けよ', 3.5);
      return;
    }
    F.pendingWave = false;
    const g = F.waveGroups[F.wave++];
    F.cur = g; F.curMis = g.missiles;
    F.waveAt = rt.t; F.waveRest = false; F.signalPreparing = false; F.close = false; F.trap = false;
    F.flank = false; F.volleys = 0; F.overrunT = 0;
    F.overrunShown = false; F.overrunWarnAt = 0;
    rt.unmark('overrun'); rt.objProgress('stay', '');
    F.commandPt = { x: 10, z: w.z + 4.5 }; F.lane = { x: 8, z: w.z + 4.5 };
    F.focusGuns = F.guns.filter((q) => Math.abs(q.anchor.z - w.z) < 25);
    F.stageGuns = F.focusGuns;
    for (const q of F.focusGuns) {
      q.focus = null; q.fire = true;
      q.order = 'hold'; q.onArrive = null; q.facing = Math.PI / 2;
    }
    if (!F.roll?.active) F.roll = rollBands(rt, F.bands);
    for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
    const spear = F.spears[0];
    postRoad(rt, spear, F.commandPt);
    this.attackFence(rt, g);
    const hq = F.jinkeiBound[w.hq];
    if (hq && !hq.army.rout) hq.moveTo(hq.army.cx - (w.final ? 42 : 34), w.z, 20);
    if (w.brother) F.jinkeiBound.shitara_sanada_masateru?.moveTo(106, w.z + 12, 20);
    // 野々村の控えは北の口を助け、前田の備は中央に残す。
    const nonomura = F.jinkeiBound.shitara_nonomura;
    if (w.brother && nonomura) nonomura.moveTo(nonomura.army.cx, w.z + 24, 20);
    for (const fc of F.far) if (!fc.v && Math.abs(fc.z - w.z) < 50) {
      fc.v = 1; fc.owner = g; fc.m.advance(65, 24);
    }
    // 柵と無関係に死傷する飾りの乱戦は足さない。同じ備の実兵と控えが寄せる。
    sfx('taiko', 1);
    rt.setPhase('defend');
    rt.banner(w.final ? '中央突破の下知' : '真田の備、前へ', w.final ? '内側の柵で受けよ。合図の旗を見よ' : '鉄砲で削り、柵に着いた敵は槍で止めよ');
    shReport(rt, w.line, 3);
    rt.marker('wave', centerOf(g), w.name + 'の旗', { red: true, group: g });
    rt.marker('next_mouth', F.commandPt, w.final ? '柳田前の持ち場' : '仙石・野々村の持ち場', { hideNear: 7 });
    rt.obj('hold', '真田の寄せを受け、仙石の柵を槍で守れ', 'main');
    if (w.final) {
      rt.world.setTime('afternoon');
      F.jinkeiBound.shitara_hara?.advance(50, 22);
      rt.after(4, () => {
        if (!F.ending && !F.pursuit) { sfx('taiko', 0.7); F.jinkeiBound.shitara_shoyoken?.advance(60, 24); }
      });
      rt.obj('hold', '内側の柵へ下がり、中央の突破を止めよ', 'main');
      this.fallBack(rt, g);
    }
  },

  // 打撃は近い足軽だけ。半秒ごとの同じ枠で柵への圧力を調べる。
  siegeTick(rt, g) {
    if (!g || g.doneWave || g.routed || !g.count) return;
    const s = g.breach;
    if (s?.alive) {
      const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      for (const u of g.units) if (s.alive && u.alive && !u.fleeing && !u.woundOut && !u.gone && Math.hypot(u.pos.x - x, u.pos.z - z) < 5.5) {
        u.cheer = 0.5; rt.army.damage(s, 16, u);
      }
      if (s.hp !== g.lastFenceHp) { g.lastFenceHp = s.hp; g.siegeStallAt = rt.t; }
      const c = g.center();
      if (g.siegeX == null || Math.hypot(c.x - g.siegeX, c.z - g.siegeZ) > 1) {
        g.siegeX = c.x; g.siegeZ = c.z; g.siegeStallAt = rt.t;
      }
      if (rt.t - g.siegeStallAt > 24) {
        g.breach = null;
        shReport(rt, '敵が柵の口へ回るぞ！　槍で止めよ！', 3);
      }
      return;
    }
    if (g.opened) return;
    g.opened = true;
    g.order = 'path'; g.pathIdx = 0; g.colW = 2;
    const z = s ? (s.seg[1] + s.seg[3]) / 2 : g.lane.z;
    g.path = [[SB.x0 - 2, z], [SB.x0 - 2, g.lane.z], [SB.x0 - SB.gap - 2, g.lane.z]];
    g.onArrive = (q) => {
      q.order = 'move'; q.dest = { x: -12, z: q.lane.z };
      q.onArrive = (qq) => { qq.order = 'attack'; qq.formation = 'yari'; qq.aggro = 14; qq.seekRange = 22; };
    };
    if (g === rt.flags.south) {
      shReport(rt, s ? '南の一の柵が破れた！　徳川は二の柵で受ける！' : '南の敵が柵の口へ来た！　徳川は二の柵で受ける！', 3.5);
      for (const q of rt.flags.guns) if (q.anchor.z > 250) {
        q.order = 'move'; q.dest = { x: SB.x0 - SB.gap - 2, z: q.anchor.z };
        q.fire = false; q.holdFire = true; q._wantFire = false;
        q.onArrive = (qq) => { qq.order = 'hold'; qq.fire = true; qq.holdFire = true; };
      }
    } else {
      rt.say('組頭', s ? '柵が破れた！　鉄砲だけでは支えきれぬ。槍、前へ！' : '敵が柵の口へ来た！　槍、前へ！', 3.5);
      this.fallBack(rt, g);
      const u = rt.flags.sengoku;
      if (g.def.brother && u.alive && !u.woundOut) {
        if (u.mounted && u.hp > u.maxHp * 0.65) rt.army.horseShot(u, null);
        rt.say('仙石秀久', u.mounted ? 'ここは渡さぬ！　槍で支えよ！' : '馬は失うても、ここは渡さぬ！', 3);
        rt.after(8, () => {
          if (rt.flags.cur === g && !g.doneWave && !rt.flags.ending) shReport(rt, '野々村の鉄砲が横から助けるぞ！', 3);
        });
      }
    }
  },

  fallBack(rt, g) {
    const F = rt.flags;
    if (g.withdrew) return;
    g.withdrew = true;
    F.commandPt = { x: -9, z: g.def.z + 4.5 };
    postRoad(rt, F.spears[0], F.commandPt);
    for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
    // 二の柵の口を通り、三の柵の手前で槍を揃える。射手は両脇から狙う。
    for (const q of F.focusGuns) {
      const path = gunRoad(rt, q, g.def.z, -1, q.anchor.z);
      if (path) {
        q.order = 'path'; q.path = path; q.pathIdx = 0; q.formation = 'column'; q.colW = 1;
        q.fire = false; q.holdFire = true; q._wantFire = false;
        q.onArrive = (qq) => { qq.order = 'hold'; qq.fire = true; qq.holdFire = true; qq.formation = 'line'; qq.facing = Math.PI / 2; };
      }
    }
    rt.obj('stay', '内側の柵へ戻り、鉄砲の前を空けて槍を揃えよ', 'order');
    rt.marker('command', F.commandPt, '内側の柵の持ち場', { hideNear: 7 });
    if (F.canLead) rt.choose('柵が危ない。組をどう動かす？', [
      { label: '内側の柵へ下がり、槍を揃える', note: '敵を正面で止め、鉄砲の前を空ける' },
      { label: '内側の柵の脇で受ける', note: '近い破れ目へ横から槍を入れる' },
    ], (i) => {
      if (F.cur !== g || g.doneWave || F.ending) return;
      F.flank = i === 1;
      F.commandPt = { x: -9, z: g.def.z + (i ? 14 : 0) };
      for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
      rt.marker('command', F.commandPt, '組の槍の持ち場', { hideNear: 7 });
    }, 8);
  },

  signalVolley(rt, g) {
    const F = rt.flags;
    if (F.trap) return;
    F.trap = true; F.fireAt = rt.t; F.volleys = 3;
    F.signalFlag.rotation.z = 0; F.signalFlag.position.y = F.signalBaseY + 3;
    F.hashibaFlag.rotation.z = 0;
    rt.banner('合図の旗、上がる', g && readyCount(g) ? '柵の敵を、まわりから撃て' : '柵を守った。鉄砲衆、退く敵を押さえよ');
    shReport(rt, '羽柴の旗じゃ！　鉄砲衆、一斉に放て！', 3.5);
    // 弾込め・射線を無視して命中を作らない。撃てる射手だけ同時に解禁する。
    ceaseBands(F.bands, F.roll);
    kamaeBands(F.bands);
    for (const q of F.guns) { q.focus = null; q._fieldWait = false; }
    volleyBands(F.bands);
    rt.after(2.5, () => {
      if (F.ending || F.pursuit) return;
      if (F.waveRest) ceaseBands(F.bands, F.roll);
      else F.roll = rollBands(rt, F.bands);
    });
    battleEvent(rt, EVENT_VOLLEY, F.lane, null, 0, true, '旗の合図で、まわりの鉄砲が撃つ');
    g.noRout = false;
    this.lossReport(rt, F.south);
    rt.after(8, () => {
      if (F.ending) return;
      const sanada = F.waveGroups[0];
      // 柵前でなお戦う者を消さない。退いた備の知らせは一度だけにする。
      let departed = true;
      for (const u of sanada.units) if (u.type === 'busho' && u.alive && !u.fleeing && !u.gone && !sanada.routed) departed = false;
      if (departed) {
        this.lossReport(rt, sanada);
      }
    });
  },

  // 討死は実際に倒れた将だけ知らせる。生きた将は退かせ、史実のその後は歴史欄へ。
  lossReport(rt, g) {
    if (!g || g.deathReported || (!g.routed && readyCount(g))) return;
    const F = rt.flags;
    g.deathReported = true;
    if (g === F.south) {
      const fallen = g.units.some((u) => u.type === 'busho' && !u.alive);
      shReport(rt, fallen ? '山県昌景、討死！　南の赤備えが崩れた！' : '南の赤備えが退く！　徳川が押し返したぞ！', 3.5);
    } else {
      let dead = 0;
      for (const u of g.units) if (u.type === 'busho' && !u.alive) dead++;
      shReport(rt, dead >= 2 ? '真田兄弟、討死！　北の備が崩れた！' : dead ? '真田の将が討たれた！　北の備が崩れた！' : '真田の備が退く！　北の旗が乱れておる！', 3.5);
    }
    const h = F.jinkeiBound[g.def.hq];
    if (h) h.retreat(180, 60);
    g.noRout = false; g.morale = 0;
    g.cavalry.noRout = false; g.cavalry.morale = 0;
    g.missiles.noRout = false; g.missiles.morale = 0;
    for (const fc of F.far) if (Math.abs(fc.z - g.def.z) < 50 && fc.v !== 2) {
      fc.v = 2; fc.m.retreat(180, 60);
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    if (F.okubo.woundOut && !F.bossWounded) {
      F.bossWounded = true;
      shReport(rt, `${F.boss}様が手傷で退かれた。持ち場を守れ！`, 3.5, { x: F.okubo.pos.x, z: F.okubo.pos.z });
    }
    const p = rt.player.u.pos;
    if (rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.45 && !(F.woundWarnAt > rt.t)) {
      F.woundWarnAt = rt.t + 30;
      rt.say(F.voice, '傷が深い！　構えて敵の打ちを防げ。組と柵の奥へ下がれ！', 3.5);
    }
    if (F.wave === 0 && !F.prepDone) {
      const here = Math.hypot(p.x - F.prepPt.x, p.z - F.prepPt.z) < 7;
      let together = !F.canLead;
      for (const q of rt.squadGroups || []) for (const u of q.units) {
        if (u.alive && !u.fleeing && !u.woundOut && !u.gone && Math.hypot(u.pos.x - F.prepPt.x, u.pos.z - F.prepPt.z) < 10) together = true;
      }
      F.prepT = here && together ? (F.prepT || 0) + dt : 0;
      rt.objProgress('hold', !here ? '槍を揃える印へ進め' : !together ? '持ち場で組の到着を待て' : F.prepT < 4 ? `槍をそろえる ${Math.min(4, Math.floor(F.prepT))}／4秒` : '槍はそろった。持ち場で下知を待て');
      if ((F.prepT >= 4 && rt.t - F.prepAt >= 6) || rt.t - F.prepAt >= 8) {
        F.prepDone = true;
        // 持ち場を確かめただけで、柵の丈夫さや傷を増減させない。
        rt.unmark('prepare');
        rt.say(F.voice, F.prepT >= 4 ? 'よし、槍が揃った。武田の寄せを受けるぞ' : '槍はまだ揃わぬ。武田が来るぞ、持ち場へ急げ！', 3.5);
        this.fronts(rt);
      }
    }
    // 生きている守兵の到着を待つ。全滅した組や退いた組を待ち続けない。
    if (F.pendingWave && !(F.postCheckAt > rt.t)) {
      F.postCheckAt = rt.t + 0.5;
      let gunsReady = true;
      for (const q of F.stageGuns) if (!q.routed && readyCount(q)) {
        const c = q.center();
        if (q.order !== 'hold' || Math.abs(c.z - F.commandPt.z) > 24) gunsReady = false;
      }
      const here = Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) < 12;
      rt.objProgress('hold', !here ? '柵の奥の道から次の持ち場の印へ歩け' : !gunsReady ? '印で鉄砲の組を待て' : '持ち場に着いた。寄せを受けるぞ');
      if ((here && gunsReady) || rt.t - F.postWaitAt >= 45) {
        rt.objProgress('hold', ''); this.wave(rt, true);
        if (!here) rt.say(F.voice, '敵が柵へ来る！　奥の道から持ち場の印へ急げ！', 3);
      }
    }
    // 替えた兵にも同じ武器の威力を使う。柵の内では控えを勝手に侵入させない。
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) {
      F.wkT = 0.5;
      for (const A of rt.world.armies || []) if (A.team === 1 && !A._autoDistant) {
        // 追撃中も近い控えは同じ兵へ替える。本陣は既存の勝頼と馬廻を使う。
        A.noWake = A === F.katsuyori.army;
        A.jinkeiGuard = true;
      }
    }
    // 名入りの旗も同じ備と前進・後退する。遠方でも、討死後に旗が倒れるのを見せる。
    if ((F.flagAt || 0) <= rt.t) {
      F.flagAt = rt.t + 0.5;
      for (const h of F.namedHosts) if (h.namedFlag) {
        const f = h.namedFlag, a = h.army;
        f.position.x = h.flagX + a.off.x; f.position.z = h.flagZ + a.off.z;
        f.position.y = rt.world.heightAt(f.position.x, f.position.z);
        if (a.rout) f.rotation.z = 1.2;
      }
    }
    // 遠い隊は近接する同じ備が退いた時に後退する。時刻だけで撃ち倒さない。
    for (const fc of F.far || []) if (fc.v === 1 && (fc.owner.routed || !fc.owner.count)) {
      fc.v = 2; fc.m.retreat(180, 60);
    }
    // 背後の軽い控えも、近接する備と同じ場所から戦い始める。
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) {
      q.gone = true; q.b.retreat(180, 60);
    }
    nagashinojo.kit.backTick(rt);
    // 射線の遮り（11〜23 章）：鉄砲組の前で味方の槍組が揉み合っていれば、その鉄砲組は撃てない
    if (F.bands) losTick(F.guns, F.spears);
    // 予備隊、区画ごとに自動で動く（37・45 章）：柵が破られた区画へ入り・向き直る。別の区画が薄くなれば、そちらが次に危なくなる
    if (F.reserve && !F.pursuit) reserveTick(rt, F.reserve, F.fence, ZONES, dt, F.reserveOptions);
    // 近い持ち場だけ、班単位で知らせる。見るための入れ物は開戦時の物を使い回す。
    if ((F.hudT = (F.hudT || 0) - dt) <= 0) {
      F.hudT = 0.5;
      F.reloadNote = '';
      const guns = F.focusGuns || F.stageGuns;
      if (guns) for (let i = 0; i < guns.length; i++) {
        const q = guns[i];
        if (q.routed) continue;
        for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && u.reload && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 28 && sightPoint(rt, u.pos, 28)) {
          F.reloadNote = `${i === 0 ? '一' : i === 1 ? '二' : '三'}の組は弾込め中。槍で近い持ち場を守れ`; break;
        }
        if (F.reloadNote) break;
      }
      F.hudBands = null;
      if (F.canLead && guns && !F.pursuit) {
        for (const k of ['A', 'B', 'C']) F.localBands[k].length = 0;
        let visible = false;
        for (const q of guns) {
          const c = q.center();
          if (Math.hypot(c.x - p.x, c.z - p.z) <= 55 && sightPoint(rt, c, 55)) { F.localBands[q.band].push(q); visible = true; }
        }
        if (visible) {
          for (const k of ['A', 'B', 'C']) {
            const state = bandState(F.localBands, k);
            F.bandHud[k].state = state ? bandLabel(state) : '戦える射手なし';
            F.bandHud[k].pct = bandPct(F.localBands, k);
          }
          F.hudBands = F.bandHud;
        }
      }
      F.hudZone = null;
      if (F.canLead && !F.pursuit && Math.abs(p.x - SB.x0) < 55) {
        const zone = zoneOfZ(p.z);
        if (zone) {
          F.zoneHud.name = zone;
          F.zoneHud.pct = Math.round(100 * zoneHp(F.fence, zone));
          F.zoneHud.breach = gapSize(F.fence, zone).m > 0;
          F.hudZone = F.zoneHud;
        }
      }
      // 隣の突破兵が近づけば組ごと向き直る。向きを直す間は射撃を止める。
      for (const q of F.guns) if (q.order === 'hold' && !q.routed && !(q.gunTurnUntil > rt.army.time)) {
        let threat = null, nearest = 25;
        for (const u of q.units) {
          const t = u.target;
          if (!u.alive || !t?.alive || t.isStruct || t.team === q.team || t.noTarget) continue;
          const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
          if (d < nearest) { nearest = d; threat = t; }
        }
        if (threat && !inArc(q, threat.pos.x, threat.pos.z, q.fireArc / 2)) {
          const c = q.center(), a = Math.atan2(threat.pos.x - c.x, threat.pos.z - c.z);
          const turn = Math.abs(Math.atan2(Math.sin(a - q.facing), Math.cos(a - q.facing)));
          q.facing = a; q.gunTurnUntil = rt.army.time + turn / 1.2;
        }
      }
      if (F.cur && !F.cur.doneWave && !F.waveRest && !F.pursuit && Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) > 48) {
        rt.objProgress('hold', '柵の奥の道を進み、持ち場の印で味方を助けよ');
      } else if (F.trap && F.volleys === 3 && !F.waveRest && !F.pursuit) {
        rt.objProgress('hold', F.reloadNote || '近い鉄砲組の後ろで、槍を揃えよ');
      }
    }
    // 徒歩が柵へ入るか破れ目を作ってから、後ろの騎馬を投入する。
    const cur = F.cur;
    if (cur && !cur.doneWave && !F.pursuit) {
      const cav = cur.cavalry;
      if ((cur.routed || !cur.count) && !cur.escortsRetiring) {
        cur.escortsRetiring = true;
        for (const q of [cav, cur.missiles]) if (q.count && !q.routed) {
          q.order = 'retreat'; q.dest = { x: 690, z: cur.def.z }; q.fleeDir.x = 1;
        }
      } else if (!cur.routed && cur.count && !cur.cavSent && cur.center().x < SB.x0 + 24 && !(cur.cavCheckAt > rt.t)) {
        cur.cavCheckAt = rt.t + 0.5;
        if (!cur.cavApproach) {
          cur.cavApproach = true; cav.order = 'move'; cav.dest = { x: SB.x0 + 24, z: cur.def.z };
        }
        for (const u of cur.units) if (u.alive && !u.fleeing && u.pos.x < SB.x0 - 0.8) { cur.cavSent = true; break; }
        if (gapSize(F.fence, zoneOfZ(cur.def.z)).m >= 7) cur.cavSent = true;
        if (cur.cavSent) {
          // 横隊のまま柵間で攻撃へ切り替えると、口の脇の騎馬が柵へ向かって止まる。
          // 柵の手前で一列に揃え、最後尾まで三重の口を抜けてから敵を追う。
          cav.formation = 'column'; cav.colW = 1; cav.aggro = 2;
          const tail = (cav.initial - 1) * cav.layout(cav.initial).sd * 1.3;
          cav.order = 'path'; cav.pathIdx = 0;
          cav.path = [[SB.x0 + 24, F.lane.z], [F.fenceRoute.rearX - tail - 2, F.lane.z]];
          cav.arriveCount = cav.initial;
          cav.onArrive = (q) => { q.order = 'attack'; q.seekRange = 20; q.aggro = 14; };
        }
      }
    }
    // 敵が槍の守りを押し崩し、奥の持ち場を占め続ければ、この手は敗北する。
    if (!F.pursuit && F.cur && !F.cur.doneWave && (F.lossPoll = (F.lossPoll || 0) - dt) <= 0) {
      F.lossPoll = 0.5;
      let enemy = 0, guards = 0;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && !u.isStruct && Math.abs(u.pos.z - F.cur.def.z) < 24 && u.pos.x < -8 && u.pos.x > -35) {
        if (u.team === 1) enemy++; else guards++;
      }
      // 遊び手が遠くても同じ条件。押し返して敵の優勢を崩せば、占領の時を戻す。
      F.overrunT = rt.canFailMission() && enemy >= 5 && enemy > guards * 2 ? (F.overrunT || 0) + 0.5 : 0;
      if (F.overrunT >= 2 && !(F.overrunWarnAt > rt.t)) {
        F.overrunWarnAt = rt.t + 8;
        rt.bark(`奥の柵が危ない！　あと${Math.max(0, Math.ceil(OVERRUN_LIMIT - F.overrunT))}秒。印へ組と戻り、押し返せ`, true);
      }
      if (F.overrunT >= 2) {
        if (!F.overrunShown) rt.marker('overrun', { x: -21, z: F.cur.def.z }, '押し返す奥の柵', {});
        rt.objProgress('stay', `！奥の印で敵を押し返せ。あと${Math.max(0, Math.ceil(OVERRUN_LIMIT - F.overrunT))}秒で負ける`); F.overrunShown = true;
      } else if (F.overrunShown) {
        rt.objProgress('stay', '奥の柵を取り戻した。槍をそろえて守れ');
        rt.unmark('overrun'); F.overrunShown = false;
      }
      if (F.overrunT >= OVERRUN_LIMIT) {
        F.ending = true; rt.setPhase('end');
        rt.tracker.main = false; rt.objFail('hold'); rt.objRemove('stay');
        for (const id of ['prepare', 'next_mouth', 'wave', 'command', 'overrun']) rt.unmark(id);
        rt.banner('持ち場を破られた', '組とともに西へ退け');
        rt.finish({}, 8); return;
      }
    }
    if (F.frontsStarted && !F.pursuit && (F.siegeAt || 0) <= rt.t) {
      F.siegeAt = rt.t + 0.5;
      this.siegeTick(rt, F.south);
      this.siegeTick(rt, F.cur);
    }
    const g = F.cur;
    if (g && !g.doneWave && !g.routed && g.count && !F.pursuit) {
      // 通常は近づく敵を削り続ける。中央突破の時だけ、旗のために弾を込める。
      let entered = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && u.pos.x < SB.x0 - SB.gap && Math.abs(u.pos.z - g.def.z) < 24) entered++;
      if (g.opened && !F.close && entered) {
        F.close = true;
        for (const q of F.spears) if (Math.abs(q.anchor.z - g.def.z) < 45) {
          q.order = 'attack'; q.seekRange = 18; q.aggro = 12;
        }
        for (const q of rt.squadGroups || []) if (q.kind !== 'gun' && q.kind !== 'bow' && q.order !== 'path') {
          q.order = 'attack'; q.seekRange = 16; q.aggro = 10;
        }
        g.noRout = false;
        rt.obj('hold', '柵のまわりで槍を揃え、入った敵を押し返せ', 'main');
        rt.say('組頭', '敵が内側へ来た！　組とともに踏ん張れ！', 3);
      }
      if (g.def.final && g.opened && !F.signalPreparing) {
        F.signalPreparing = true; F.signalWaitAt = rt.t;
        for (const q of F.focusGuns) { q.holdFire = true; q.fire = false; }
        rt.say('組頭', '鉄砲は弾を込めよ！　槍は旗の合図まで支えよ！', 3);
      }
      let firingPosts = 0;
      for (const q of F.focusGuns) if (!q.routed && q.count && q.order === 'hold' && !q._losBlocked) firingPosts++;
      if (g.def.final && !F.trap && F.signalPreparing && rt.t - F.signalWaitAt >= 6 && ((entered >= 3 && firingPosts) || rt.t - F.signalWaitAt > 16)) {
        // 奥へ入れなかった場合も、侵入成功の文にはせず、柵前の敵への合図にする。
        this.signalVolley(rt, g);
        if (entered < 3) rt.obj('hold', '柵前の敵を撃ち、突破を止めよ', 'main');
      }
      for (const q of F.focusGuns) {
        const waiting = g.def.final && F.signalPreparing && !F.trap;
        q._fieldWait = waiting;
        q.fire = !waiting && !q._losBlocked && q.order === 'hold';
        q.holdFire = !q.fire || !q._wantFire;
      }
    }
    // 届かない残兵や、柵間で止まった備は退く。移動・負傷が続く斬り合いには時間切れを設けない。
    if (g && !g.doneWave && !F.pursuit && !(g.stallCheckAt > rt.t)) {
      g.stallCheckAt = rt.t + 0.5;
      const n = readyCount(g), c = g.center();
      let hp = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone) hp += u.hp;
      if (n !== g._lastRC || hp !== g._lastHP || g._lastX == null || Math.hypot(c.x - g._lastX, c.z - g._lastZ) > 2) {
        g._lastRC = n; g._lastHP = hp; g._lastX = c.x; g._lastZ = c.z; g._rcT = rt.t;
      } else if (n > 0 && (n <= 3 && rt.t - g._rcT > 25 || g.opened && rt.t - g._rcT > 45)) {
        g.noRout = false; g.morale = 0; g.routed = true;
        for (const u of g.units) if (u.alive) u.fleeing = true;
      }
    }
    // 寄せを退けたら、弾を込め直し中央の組をそろえる。
    if (g && !F.pursuit && (g.routed || readyCount(g) === 0) && !g.doneWave && !F.waveRest) {
      F.waveRest = true; F.waveRestAt = rt.t;
      rt.obj('hold', g.def.final ? '組をそろえ、退く敵への下知を待て' : '弾を込め直し、組をそろえて次の寄せに備えよ', 'main');
      rt.objProgress('hold', '');
    }
    if (F.waveRest && g && !g.doneWave) rt.objProgress('hold', F.wave === this.WAVES.length ? '最後の寄せが崩れた。追い討ちの下知を待て' : gunsLoaded(F.focusGuns || []) ? '弾込めが済んだ。次の敵の旗へ備える' : F.reloadNote || '近い鉄砲組の後ろで槍を揃えよ');
    // 弾込めは次の持ち場への移動中も続ける。射手が撃ち続けても十二秒で下知を出す。
    if (g && !F.pursuit && (g.routed || readyCount(g) === 0) && !g.doneWave && (F.wave === this.WAVES.length || gunsLoaded(F.focusGuns || []) || rt.t - F.waveRestAt >= 12)) {
      if (g.def.final && !F.trap) this.signalVolley(rt, g);
      g.doneWave = true;
      F.overrunT = 0; F.overrunShown = false;
      rt.unmark('overrun'); rt.objProgress('stay', '');
      ceaseBands(F.bands, F.roll);
      rt.unmark('command');
      for (const q of rt.squadGroups || []) { q.order = 'follow'; q.focus = null; q.onArrive = null; q.holdFire = false; q.fire = true; }
      for (const q of F.guns) { q.focus = null; q.order = 'hold'; q.onArrive = null; }
      // 敗走は東の退路へ歩く。枠を空けるために守兵を消さない。
      rt.unmark('wave'); rt.unmark('next_mouth');
        rt.obj('hold', '馬防柵を守り、次の下知を待て', 'main');
      if (g.def.brother) {
        shReport(rt, '真田の備が退く！　次の寄せに備えよ！', 3);
        F.jinkeiBound.shitara_sanada?.retreat(35, 20);
        F.jinkeiBound.shitara_sanada_masateru?.retreat(35, 20);
      }
      else shReport(rt, '中央の備が崩れた！　武田の旗が退くぞ！', 3);
      if (g.def.final && !F.south.deathReported) this.lossReport(rt, F.south);
      rt.award((t) => t.side.push(`${g.def.name}隊を退けた`), `${g.def.name}隊を退けた`);
      if (F.wave < this.WAVES.length) {
        rt.after(8, () => { if (!F.ending && !F.pursuit) this.wave(rt); });
      } else this.decide(rt);
    }
    // 柵の外へ出たか（打って出る下知の間は咎めない）
    if (!F.pursuit && p.x > SH_FRONT && !rt.G.lord) {
      if (!(F.outT > 0) && rt.t >= (F.outCallT || 0)) { F.outCallT = rt.t + 8; rt.bark('柵の外へ出た。三秒続ければ違反じゃ。今戻れば防げる！', true); }
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく柵の外へ出た', ['組頭', '戻れ！　柵の外へ出るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else if (!F.pursuit) F.outT = 0;
    // 追い討ち：殿の馬場信春の隊を崩せば勝ち
    if (F.dp?.on) depthTick(rt, dt);
    if (F.pursuit && !F.ending && !F.dpB) {
      const R = F.rear;
      if (!F.rearFlanked && (F.dpMem || {}).shiSide && R && !R.routed && R.count && R.order === 'hold') {
        const c = R.center();
        for (const q of rt.squadGroups || []) if (q.count && !q.routed) {
          const a = q.center();
          if (Math.abs(a.x - c.x) < 14 && Math.abs(a.z - c.z) > 8 && Math.abs(a.z - c.z) < 24) {
            F.rearFlanked = true; R.morale -= 20;
            rt.say('組頭', '馬場隊の横へ回った！　槍を入れよ！', 3);
            rt.award((t) => t.c.flank++, '馬場隊の横へ回った'); break;
          }
        }
      }
      if (tsuigekiTick(rt, dt)) {
        F.dpB = true; F.ending = true; rt.setPhase('end');
        const escaped = F.tsuigeki.timedOut;
        if (escaped) rt.objFail('pursue'); else rt.objDone('pursue');
        rt.award((t) => { t.main = true; if (!escaped) t.special = { label: '追い討ち', pts: 25 }; }, escaped ? '馬防柵を守り抜いた' : '武田を退かせ、殿を崩した');
        for (const id of ['rear', 'pursuit_road', 'wave', 'command', 'next_mouth', 'prepare', 'overrun']) rt.unmark(id);
        rt.banner('武田勢、退却', escaped ? '殿を追い切れなかった。勝頼は逃れた' : '退き口の守りを崩した。勝頼は逃れた');
        rt.say('組頭', '勝ちじゃ。深追いはやめよ。組を揃えて帰るぞ！', 4);
        sfx('horagai', 0.8);
        rt.finish({}, 10);
      }
    }
  },

  // 鳶ヶ巣山（46 章）：主戦場とは別方向、酒井忠次の別働が夜明けに武田の拠点を落とす。主戦場には狼煙・遠い音・伝令の知らせだけ届く
  tobigasu(rt) {
    const F = rt.flags;
    if (F.tobiDone || F.pursuit || F.ending || !rt.player.u.alive) return;
    F.tobiDone = true;
    battleEvent(rt, EVENT_MESSENGER, null, null, 0, true, '酒井忠次の別手から知らせが届いた');
    shReport(rt, '酒井様が鳶ヶ巣山の砦を落とした！　長篠城へ味方が入ったぞ！', 4, IEYASU);
    const groups = [F.cur, ...(F.hill || []), F.katsuyori].filter((g) => g && g.count > 0);
    for (const g of groups) g.morale = Math.max(15, (g.morale ?? 80) - 10);
  },
  decide(rt) {
    const F = rt.flags;
    rt.objDone('hold');
    rt.award((t) => { t.side.push('馬防柵を守り抜いた'); }, '馬防柵を守り抜いた');
    if (!F.outWarned && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    rt.obj('hold', F.canLead ? '組を集め、追い討ちの下知を待て' : '槍組に続き、追い討ちの下知を待て', 'main');
    rt.objProgress('hold', '');

    rt.world.setTime('afternoon');
    sfx('horagai', 1);
    rt.banner('昼すぎ、引揚げの貝', '勝頼の本隊が退く。馬場の備が殿に残る。下知を待て');
    // 本陣は東から出沢・寒狭川方面へ退く。勝頼は史実どおり討てない。
    F.katsuyori.retreat(240, 60);
    F.katsCamp.general.invuln = true;
    for (const q of [F.katsCamp.guard, F.katsCamp.general.group]) {
      q.guard = false; q.stay = false; q.noRout = true; q.retreatOnly = true;
      q.order = 'path'; q.formation = 'column'; q.colW = 2; q.pathIdx = 0;
      q.path = [[520, -100], [ESCAPE.x, ESCAPE.z]]; q.dest = null;
      q.fleeDir = { x: 1, z: -0.2 }; q.onArrive = (g) => { g.order = 'hold'; };
    }
    battleEvent(rt, EVENT_RETREAT, KATSUYORI, null, 1, true, '勝頼の本陣が東へ退き始めた');
    // 馬場の備だけは残る。陣形の同じ備を殿の本物の隊へ結ぶ。
    const baba = F.jinkeiBound.shitara_baba;
    if (baba && !baba.army.rout) baba.advance(40, 25);
    F.hill.forEach((h, i) => { if (h !== baba && !h.army.rout) rt.after(i * 1.5, () => h.retreat(180, 55)); });
    shReport(rt, '勝頼の本陣が退く！　馬場美濃守が殿に残り、退き口を守っております！', 4, CHAUSU);
    const runners = [F.south, ...F.waveGroups].flatMap((g) => [g, g.cavalry, g.missiles]);
    tsuigekiRetreat(rt, runners, F.rear, REARGUARD, ESCAPE);
    // 組を揃え直す間も、本陣と敗兵は退き続ける。
    const go = (fn) => (!F.canLead || rt.G.lord ? rt.after(3, fn) : rt.after(1, () => depthStart(rt, shiCtx(rt), shiA(rt), fn)));
    go(function begin() {
      if (F.ending || !rt.player.u.alive) return;
      F.pursuit = rt.t;
      sfx('horagai', 1);
      rt.say('組頭', '織田も徳川も柵を出よ！　その方の組も虎口を抜け、東へ追え！', 4);
      rt.objRemove('hold');
      ceaseBands(F.bands, F.roll);
      F.close = false;
      // 本物の槍・鉄砲と自分の組が、最寄りの三重の口を通って出る。
      tsuigekiStart(rt, { groups: [...F.spears, ...F.guns, ...(rt.squadGroups || [])], rear: F.rear,
        rearAt: REARGUARD, preserveRear: true, side: !!F.dpMem?.shiSide, ...F.fenceRoute });
      // 追撃も開戦前からいる同じ兵で行う。新しい飾りの両軍は出さない。
    });
  },

  onRout(rt, g) {
    if (g === rt.flags.rear) { rt.unmark('rear'); rt.say('足軽', '殿が崩れたぞ！', 2.5); }
  },
  onKill(rt, v, k) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.group === rt.flags.rear && v.type === 'busho' && rt.flags.pursuit) {
      v.group.morale -= 35;
      if (sightPoint(rt, v.pos, 55) || k?.isPlayer) rt.say('足軽', '退き口で馬場美濃守が討たれた！　殿の槍衾を押し崩せ！', 3.5);
    }
    if (v.type === 'busho' && v.group && v.group.def && !v.shFallSaid) {
      v.shFallSaid = true;
      if (v.group.def.brother && !rt.flags.south.deathReported) this.lossReport(rt, rt.flags.south);
      if (sightPoint(rt, v.pos, 55) || k?.isPlayer) rt.say('足軽', `敵将${v.name || v.group.def.name}が倒れたぞ！`, 3);
      v.group.morale -= 30;
      v.group.noRout = false;
      const host = rt.flags.jinkeiBound[v.group.def.hq];
      if (host) host.retreat(180, 60);
      v.group.cavalry.morale -= 30; v.group.missiles.morale -= 30;
      this.chainCollapse(rt, v.group);
    }
  },
  // 連鎖崩壊（43〜44 章）：侍大将の討死→同じ備の士気は onKill で大きく下がる→隣の備（近くの武田のまとまり）も中くらい下がる。
  //   複数の侍大将が討死すれば、丘の本隊（勝頼の本陣含む）にも薄く効き、全線が崩れやすくなる
  chainCollapse(rt, deadGroup) {
    const F = rt.flags;
    const c = deadGroup.center ? deadGroup.center() : null;
    const near = [F.cur, F.curMis, ...(F.hill || [])].filter((g) => g && g.count > 0 && g !== deadGroup);
    if (c) for (const g of near) {
      const gc = g.center ? g.center() : null; if (!gc) continue;
      if (Math.hypot(gc.x - c.x, gc.z - c.z) < 45) g.morale = Math.max(15, (g.morale ?? 80) - 15);
    }
    F.genDeaths = (F.genDeaths || 0) + 1;
    if (F.genDeaths === 2 && F.katsuyori && F.katsuyori.count) {
      F.katsuyori.morale = Math.max(20, (F.katsuyori.morale ?? 80) - 12);

    }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (!F.fence.includes(s) || !s.seg) return;
    if (s.row === 0) {
      F.broken++;

    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    F.noticePt.x = (s.seg[0] + s.seg[2]) / 2; F.noticePt.z = (s.seg[1] + s.seg[3]) / 2;
    if (sightPoint(rt, F.noticePt, 55) && (F.brokeSaid || -99) + 10 < rt.t) { F.brokeSaid = rt.t; rt.say('組頭', ['柵が破られた！　破れ目を槍で塞げ！', 'また柵が折れた！　鉄砲は破れ目を狙え！', '柵が持たぬ！　控えの槍衆、前へ！'][Math.min(2, (F.brokeN = (F.brokeN || 0) + 1) - 1)], 3); }
    // 足軽大将以上（鉄砲の一手を預かる・侍大将）には、区画の柵の残り（細いゲージ）と突破口の広さを知らせる（60〜62 章）
    if (s.row === 0 && s.zone && (rt.G.lord || rt.G.rank >= 4) && Math.abs(rt.player.u.pos.z - (s.seg[1] + s.seg[3]) / 2) < 40) {
      if (sightPoint(rt, F.noticePt, 55)) rt.bark('柵が破られた。槍で破れ目を塞げ！');
    }
    sfx('wood', 1);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (!F.fence.includes(s) || !s.seg) return;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.noticePt.x = (s.seg[0] + s.seg[2]) / 2; F.noticePt.z = (s.seg[1] + s.seg[3]) / 2;
    if (!sightPoint(rt, F.noticePt, 55)) return;
    F.hitWarn = rt.t;
    const z = (s.seg[1] + s.seg[3]) / 2;
    const who = '敵の兵';
    rt.bark(`${z < -30 ? '北' : z > 30 ? '南' : '正面'}の柵に${who}が取り付いた！`, true);
  },
};
// 総勢は歴史欄だけに置く。個々の討死から全軍の損害へ倍率を掛けない。
shitaragahara.force = () => ({ a: 38000, a0: 38000, b: 15000, b0: 15000 });
shitaragahara.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.wave === 0 && rt.t > 3 ? '武田の寄せまで待つ' : '');
shitaragahara.skip = (rt) => { if (rt.phase === 'brief' && rt.flags.wave === 0) rt.flags.prepAt = rt.t - 8; };
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 奉行は各持ち場へ初めから置く。別名の同一人物や土屋を他将の隊へ追加しない。
shitaragahara.famous = [];
// 出典確認：新城市 https://www.city.shinshiro.lg.jp/kanko/meisyo/nagashino-shitaragah.html
shitaragahara.history = '天正三年五月二十一日、織田・徳川軍は設楽原で柵と多数の鉄砲を用い、武田軍を破った。『信長公記』は鉄砲千挺ほどを奉行に預け、柵の外へ出ず、寄せる武田勢を撃ち退けたと記す。山県昌景の赤備え、真田信綱・昌輝らの奮戦と討死は『甲陽軍鑑』にも伝わる。山県・内藤・真田兄弟ら多くの宿将が討死し、昼すぎに武田勢が崩れ、織田・徳川は柵を出て追撃した。馬場信春は出沢・寒狭川方面の退き口で殿を務め、勝頼を逃がして討死したと伝わる。勝頼本人はこの戦で討たれていない。『信長公記』の寄せの順は山県・武田信廉・小幡・武田信豊・馬場であり、本作の各備の順や場所は確定した再現ではない。山県の竹束と柵破り、徳川の二の柵への後退、馬場の丸山占領、仙石の落馬と槍での奮戦、野々村の援護は伝承や解釈を取り入れた復元である。中央突破を内側の柵へ誘い、羽柴の旗で囲んで撃つ策は漫画『センゴク』にも描かれる説をもとにした演出で、確かな史実とはしない。新城市の解説は、川や田、柵と多数の鉄砲を組み合わせた守りを紹介している。鉄砲は三千挺だったとも伝わるが、数や撃ち方には諸説があり、三段撃ちを確定した史実とはしない。三重の柵、細かな備の兵数・居場所・天気・距離・時間と、追撃の道筋・浅瀬・殿の位置は推定と遊びの補いである。追撃で渡る浅い川は連吾川で、勝頼が逃れたと伝わる寒狭川そのものではない。南の討死の知らせと備の崩れは戦全体の流れの演出で、目の前の武将を討った手柄とは分ける。総勢は織田・徳川三万八千、武田一万五千とも伝わるが、長篠側の別手を含む数であり、決戦場に全員を置いた意味ではない。';
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;
shitaragahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// ---- 設楽原 ----
function shiCtx(rt) {
  const F = rt.flags;
  // 自分の持ち場の槍組を段に引き継ぐ。上官本人は後方の控えに残す。
  return { faction: 'takeda', dmg: 1, friends: () => [F.spears && F.spears[0]].filter((g) => g && g.count && !g.routed) };
}
// 中央突破を退けた後：組を揃え直し、大宮前の虎口から正面か脇から追い討ちへ
function shiA(rt) {
  const B = '組頭';
  return [
    DP.rest({ dur: 4, heal: 0, say: [[B, '弾を込め直せ。破れ目は槍で塞げ。手負いは後ろへ'], [B, '組を集めよ。打って出る口を選び、馬場の殿へ当たる']] }),
    DP.pick({ time: 12, title: '勝頼が退き始めた。追い討ちに、どこから打って出る？',
      options: [{ label: '大宮前の虎口から、東へ追って殿へ当たる', note: '川を渡り、退き口へ進む。正面は槍衾' }, { label: '同じ虎口を出て、野から馬場隊の脇へ回る', note: '川を渡ってから脇へ回る。組が着いて初めて効く' }],
      on: (rt, m, i) => { m.shiSide = i === 1; } }),
  ];
}


// 信長公記巻八・地形参照：西の織田と徳川、東の武田十三の備え。
// 各備の兵数・間隔は復元。酒井の鳶ヶ巣山別働は決戦場の備に重ねない。
const alliedIds = ['sakuma', 'sengoku', 'nonomura', 'sassa', 'maeda', 'ban', 'fukutomi', 'sakakibara', 'honda'];
const rearIds = ['akechi', 'hashiba', 'niwa'];
const takedaIds = ['baba', 'tsuchiya', 'sanada', 'sanada_masateru', 'naito', 'hara', 'shoyoken', 'oyamada', 'yamagata'];
const postRows = (posts, ids, count) => posts.map(([name, x, z, fac, mon, kind], i) =>
  ['shitara_' + ids[i], '持ち場の備え', name, null, { x, z }, fac, mon, null, { draw: true, count, kind }]);
const SHITARA_ODA_JIN = battleJin('柵と土塁に沿う織田の備え', 0, CHAUSU, Math.PI / 2, [
  ['shitara_oda_hq', '本陣・茶臼山', '織田信長', null, CHAUSU, 'eiraku', 'oda', (r) => r.flags.camps?.[1]?.guard],
  ...postRows(ALLIED_POSTS.filter((p) => p[3] === 'oda'), alliedIds, 240),
  ...postRows(REAR_POSTS, rearIds, 240),
], '織田三万の目安。布陣図の並びを使うが、各備の人数は不明。五人の鉄砲奉行を別の大軍として加算しない。');
const SHITARA_TOKUGAWA_JIN = battleJin('弾正山と南の柵の守り', 0, IEYASU, Math.PI / 2, [
  ['shitara_ieyasu', '本陣・弾正山の南', '徳川家康', null, IEYASU, 'onri', 'tokugawa', (r) => r.flags.camps?.[0]?.guard],
  ...postRows(ALLIED_POSTS.slice(7), alliedIds.slice(7), 160),
  ['shitara_okubo', '南の柵の控え', '大久保忠世・大久保忠佐', null, { x: -95, z: 390 }, 'okubo', 'tokugawa', null, { draw: true, count: 100, named: false }],
  ['shitara_ishikawa', '南の丘の控え', '石川数正', null, { x: -145, z: 290 }, 'tokugawa', 'tokugawa', null, { draw: true, count: 100 }],
], '徳川八千の目安。細かな人数と控えの位置は復元。酒井忠次は鳶ヶ巣山の別働へ出ており、南の柵に本人を二重に置かない。');
const SHITARA_TAKEDA_JIN = battleJin('川向こうの十三の備え', 1, KATSUYORI, -Math.PI / 2, [
  ['shitara_katsuyori', '本陣・才ノ神方面', '武田勝頼', null, KATSUYORI, 'takeda', 'takeda', (r) => r.flags.katsCamp?.guard],
  ...postRows(TAKEDA_POSTS, takedaIds, 120).map((row, i) => { if (i === 0) row[7] = (r) => r.flags.rear; return row; }),
  ['shitara_anayama', '中央の親類衆の控え', '穴山信君', null, { x: 280, z: -60 }, 'takeda', 'takeda', null, { draw: true, count: 80 }],
  ['shitara_nobutoyo', '中央の親類衆の控え', '武田信豊', null, { x: 280, z: 70 }, 'takeda', 'takeda', null, { draw: true, count: 80 }],
  ['shitara_south', '南の国衆の控え', '将の名は不明', null, { x: 230, z: 300 }, 'takeda', 'takeda', null, { draw: true, count: 60, named: false }],
], '武田一万五千から鳶ヶ巣山の三千を除き、決戦場は一万二千の目安。十三か所の記述を採用し、全ての備の将や順が確定したとはしない。');
installBattleJinkei(shitaragahara, [SHITARA_ODA_JIN, SHITARA_TOKUGAWA_JIN, SHITARA_TAKEDA_JIN]);

export { shitaragahara };
