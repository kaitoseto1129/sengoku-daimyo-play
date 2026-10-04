import { jinkeiBuild } from './jinkei.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// 設楽原：柵間へ引きつけ、集中射撃の後に一隊を率いて受け止める
import { gauss, allyGroup, nm, enemyGroup, centerOf } from './bhelp.js';
import { buildBobosaku } from './b_sunomata.js';
import { scenarioKey, RANKS } from './state.js';
import { nagashinojo } from './b_nagashinojo.js';
import { nobori, tawara, stumps } from './props.js';
import { clash } from './b_sekigahara.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_VOLLEY, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { sightPoint } from './battle_sight.js';
import { seasonOf, sky } from './b_shared.js';
import * as DP from './b_depth.js';
import { depthOn, depthTick, depthStart } from './b_depth.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';
import * as THREE from 'three';
import { flagTexture } from './textures.js';
import { doruiLine } from './castle_parts.js';
// 地面を作る前に標高を読み終える。後から届いても地面の格子は作り直されない。
import DEM from './asset_dem_shitaragahara.js';
import { tagZones, gapSize, assignBands, ceaseBands, losTick, reserveTick } from './yasen_jinchi.js';

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
function gunsLoaded(gs) {
  let living = false;
  for (const g of gs) if (!g.routed) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && !u.sidearm && u.gunAmmo !== 0 && u.type === 'gun') {
    living = true; if (!u.reload) return true;
  }
  return !living;
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
}
const SH_FRONT = SB.x0 + 2;   // これより東へ出たら「柵の外」

const shitaragahara = {
  spawn: { x: 10, z: 4, heading: Math.PI / 2 },
  moveLim: 740, // 南北の虎口・両本陣・東の退路を、歩ける場にも収める
  taisho: { a: { name: '織田信長', use: true }, b: { name: '武田勝頼', def: true } },
  noTaishoRaid: true, // 柵と川を無視して本陣を狙う共通の新手は出さない
  wakeRoom: 245,
  world: {
    seed: 57,
    moveLim: 740,
    groundHalf: 780, // 地面の頂点数は増やさず、南北二キロの柵と後方の山まで収める
    mood: 'morning',
    muddy: 0.25,
    mist: true,
    wetStart: 0.55,      // 前の雨で湿った地面。朝の戦の間は雨を降らせない
    time: 'day',
    waterSlow: true,   // 連吾川・水田で騎馬の加速が落ちる（terrain_tags.js の 'water' タグ。長篠・設楽原 統合版 3〜4 章）
    paths: [[[-176, 10], [-80, 8], [-20, 18], [SB.x0 - 2 * SB.gap - 4, SB.gates[1]]]],
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
      const cut = [[SB.z0 + 2, gz[0] - 5], [gz[0] + 5, gz[1] - 5], [gz[1] + 5, gz[2] - 5], [gz[2] + 5, SB.z1 - 2]];
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
      // 夜の縮小で四人ずつになった中央を、八人ずつの横列へ戻す。
      // 後ろの槍と左右の列で厚くし、射撃の強さは四挺分のままに保つ。
      const gunN = mouth === MOUTHS[1] ? 8 : 4;
      F.guns.push(allyGroup(rt, { faction: z < odaZ ? 'oda' : 'tokugawa', name: mouth.name + 'の鉄砲組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2.4, z }, facing: Math.PI / 2, width: 8, spacing: gunN === 8 ? 1.5 : 2, ranks: 1, aggro: 44, holdFire: true, dmgMult: 0.8 * 4 / gunN }, [{ type: 'gun', n: gunN }]));
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
    // 槍の組：動く一組と、南北の虎口に残る守り。大将本人を連れ回さない。
    const ok = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: oda ? '前田組' : '大久保組', fixed: true, fullStrength: true, noGuard: true, yariRanks: 3, anchor: { x: SB.x0 - 2 * SB.gap - 1, z: 2 }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 17 }]);
    F.spears = [ok];
    for (const [z, fac] of [[-298, 'oda'], [-22, 'oda'], [42, 'oda'], [368, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2 * SB.gap - 1, z }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]));
    }
    // 予備隊（長篠・設楽原 統合版 37・45 章）：柵の後ろに控え、いちばん危ない区画へ自動で動く・向き直る（reserveTick が毎コマ判断）
    F.reserve = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: '予備の槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2 * SB.gap - 5, z: 0 }, facing: Math.PI / 2, width: 14, aggro: 8, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }]);
    F.spears.push(F.reserve);
    const n = Math.min(30, (RANKS[rt.G.rank] || RANKS[0]).squad);
    // 設楽原は鉄砲の見せ場：組の中身を城下・出陣前で決めていなければ（makeSquad の側で kumi が優先される）、
    //   既定で三分の一ほどを鉄砲にして持たせる（柵の内で鉄砲隊を率いる役目）
    F.bigGun = n ? Math.max(1, Math.round(n / 3)) : 0;
    if (n) rt.makeSquad({ x: SB.x0 - 4, z: 8 }, Math.PI / 2, F.bigGun ? [{ kind: 'spear', n: n - F.bigGun }, { kind: 'gun', n: F.bigGun, ranks: 2 }] : [{ kind: 'spear', n }]);
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
      h.army.noWake = true;
      h.army.keepNear = true;
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
    F.katsCamp.guard.noRout = true; F.katsCamp.guard.guard = true; // 勝頼の馬廻は退きの下知まで本陣を守る

    for (const [x, z, k, h] of [[IEYASU.x - 10, IEYASU.z + 10, 'onri', 6.5], [CHAUSU.x + 10, CHAUSU.z + 10, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 柵の内の旗（織田が北寄り、徳川が南）
    for (let z = SB.z0 + 12; z <= SB.z1 - 12; z += 44) rt.scene.add(nobori(W, SB.x0 - SB.gap - 3, z + 5, z < odaZ ? (oda && z % 44 === 0 ? 'maeda' : 'oda') : (z % 44 === 0 ? 'okubo' : 'tokugawa'), 5));
    rt.scene.add(tawara(W, -30, 30, 0.3, 6), tawara(W, -34, -20, -0.4, 5));
    // 遠景の村（西の山すそと、南の谷）
    KT.farVillage(rt, -18, 160, { rot: Math.PI, n: 6, fields: 8, seed: 21 });
    KT.farVillage(rt, 64, -158, { rot: 0, n: 5, fields: 6, seed: 22 });
    // 大軍：織田・徳川三万八千、武田一万五千。備ごとに名と持ち場を分ける。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 一隊の体・旗・馬をそのまま使い、四つの備えを一度に描く。毎コマの並べ直しはしない。
    const deepHost = (x, z, count, facing, armor, flag, seed, kind, step, width, team = 0) => {
      const people = [], sx = Math.sin(facing), sz = Math.cos(facing);
      const per = Math.ceil(count / 4), cols = Math.ceil(width / 1.5), rows = Math.ceil(per / cols);
      for (let i = 0; i < per; i++) for (let a = 0; a < 4; a++) {
        if (i * 4 + a >= count) continue;
        const row = Math.floor(i / cols), l = (i % cols - (cols - 1) / 2) * 1.5;
        const back = a * step + row * 1.25;
        const banner = i % 43 === 0;
        people.push({ x: x - sx * back + sz * (l + (a % 2 ? 3 : -3)),
          z: z - sz * back - sx * (l + (a % 2 ? 3 : -3)), facing,
          k: banner ? 'banner' : (kind === 'cavalry' || kind === 'mixed') && i % 8 === 0 ? 'rider' : kind === 'gun' && a === 0 ? 'gun' : i % 19 === 0 ? 'samurai' : 'spear',
          ex: 1.3, flag: banner ? 0 : i % 3 === 0 ? 1 : 0 });
      }
      const g = W.addDistantArmy({ x: x - sx * (step * 1.5 + rows * 0.625), z: z - sz * (step * 1.5 + rows * 0.625),
        people, team, w: width + 6, d: step * 3 + rows * 1.25, facing, armor, mon: flag, seed, kind, near: false, host: false });
      // 陣幕の人ではなく通常の備えとして、近い十数人だけ本物へ替える。
      // 並びを四段ずつ交互にしたので、低画質で間引いても奥の備えが残る。
      g.army.people = false; g.army.nImp = 32; g.army.keepNear = true; g.army.jinkeiGuard = true;
      return g;
    };
    // 陣形の表と描く備えを同じ場所へ結ぶ。遠景を二重に置かず、近い兵を替える仕組みも保つ。
    const buildHost = (p) => jinkeiBuild(rt, { ...p, sonae: p.sonae.filter((s) => s.draw).map((s) => ({ ...s, bindOnly: false })) }, (s, at) => {
      const h = deepHost(at.x, at.z, s.count, p.facing, A[s.flag] || A[p.team ? 'takeda' : 'oda'], s.mon,
        5700 + p.team * 100 + p.sonae.findIndex((q) => q.id === s.id), s.kind || 'spear', p.team ? 18 : 22, p.team ? 30 : 40, p.team);
      h.name = s.general + '隊';
      F.jinkeiBound[s.id] = h;
      h.army.noWake = true; // 柵の外へ進むまでは、待機備の兵を侵入させない
      if (s.named !== false) postFlag(rt, s.general, at.x + (p.team ? -2 : 2), at.z, s.mon);
      return h;
    });
    buildHost(SHITARA_ODA_JIN);
    buildHost(SHITARA_TOKUGAWA_JIN);
    F.hill = Object.values(buildHost(SHITARA_TAKEDA_JIN));
    postFlag(rt, '徳川家康', IEYASU.x, IEYASU.z, 'tokugawa');
    postFlag(rt, '織田信長', CHAUSU.x, CHAUSU.z, 'oda');
    F.katsuyori = DA(KATSUYORI.x, KATSUYORI.z, 38, 30, 300, -Math.PI / 2, A.takeda, 'takeda', 57, 'honjin');
    postFlag(rt, '武田勝頼', KATSUYORI.x, KATSUYORI.z, 'takeda');
    for (const mouth of MOUTHS) postFlag(rt, mouth.name, SB.x0 - SB.gap - 3, mouth.z - 9, mouth.z < 190 ? 'oda' : 'tokugawa');
    // 勝頼本人と馬廻は後方の陣幕へ置いた。共通の大将・新手を重ねない。
    F.katsuyori.noWake = true; F.katsuyori.army.noWake = true;
    // 近接する寄せ手と殿は開戦前からそれぞれの備に置く。
    F.waveGroups = this.WAVES.map((w) => this.makeWave(rt, w));
    F.rear = enemyGroup(rt, { faction: 'takeda', name: '馬場隊', fixed: true, noGuard: true, anchor: { x: 250, z: -440 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 12, formation: 'yari', morale: 95 },
      [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }]);
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
    F.prepPt = { x: SB.x0 - 2 * SB.gap - 4, z: SB.gates[1] + 2 };
    rt.banner('設楽原、馬防柵の内', '朝霧の向こうに武田の旗。柵を結い、鉄砲と槍を揃える');
    rt.obj('hold', F.canLead ? '組を連れて柳田前の虎口の内へ。柵を固めよ' : '柳田前の槍組に続け。虎口の内で柵を固めよ', 'main');
    rt.obj('stay', F.canLead ? '組を揃え、下知があるまで柵の外へ出るな' : '槍組に続け。下知があるまで柵の外へ出るな', 'order');

    rt.marker('prepare', F.prepPt, '柵を結い直す持ち場');
    rt.say(F.voice, F.canLead ? `${nm(rt)}、組を虎口の内へ連れ、柵を固めよ` : '槍組の後ろに続け。虎口の内で柵を固めよ', 4.5);
    rt.after(5, () => rt.say('伝令', '殿の下知じゃ。柵を出るな。寄せる敵を鉄砲で退けよ', 4));
    rt.after(10, () => rt.say(F.voice, '槍は奥の柵を守れ。先頭が入っても撃つな。後続まで入り込んだ所を狙う', 4.5));
    rt.after(95, () => this.tobigasu(rt));
  },

  // 将の寄せを三つの局面にまとめる。順番・柵間の誘い込みは遊びのための復元。
  WAVES: [
    { name: '山県昌景', fac: 'akazonae', z: MOUTHS[2].z, cav: 4, ash: 12, line: '赤備えじゃ！　山県昌景の騎馬と足軽、竹広の虎口へ突っ込んでくる！' },
    { name: '内藤昌豊', fac: 'takeda', z: MOUTHS[1].z, cav: 4, ash: 12, line: '内藤昌豊の隊が続く！　柳田前へ槍を揃えよ！' },
    { name: '真田信綱・昌輝', fac: 'takeda', z: MOUTHS[0].z, cav: 4, ash: 12, line: '真田信綱と昌輝の隊じゃ！　大宮前の柵へ押し込んでくるぞ！', brother: true },
  ],

  makeWave(rt, w) {
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', fixed: true, noGuard: true, anchor: { x: 110, z: w.z }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 12, spacing: 1.4, formation: 'yari', morale: 100, speed: 3 },
      [{ type: 'ashigaru', n: w.ash }, { type: 'busho', n: 1, o: { name: w.brother ? '真田信綱' : w.name, horse: true } },
        ...(w.brother ? [{ type: 'busho', n: 1, o: { name: '真田昌輝', horse: true } }] : [])]);
    g.def = w;
    g.cavalry = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の騎馬衆', fixed: true, noGuard: true, anchor: { x: 136, z: w.z + 8 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 10, morale: 95 }, [{ type: 'cavalry', n: w.cav }]);
    g.missiles = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', fixed: true, noGuard: true, anchor: { x: 126, z: w.z - 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 10, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 2 }, { type: 'bow', n: 2 }]);
    g.missiles.holdFire = true;
    nagashinojo.kit.backOf(rt, g, { flag: w.fac, armor: nagashinojo.kit.ARMOR[w.fac], kind: 'mixed', w: 26, depth: 18, count: 120, gap: 6, seed: 71 + this.WAVES.indexOf(w), stop: () => g.center().x < SB.x0 + 75 });
    return g;
  },

  wave(rt) {
    const F = rt.flags;
    const W0 = this.WAVES;
    const w = W0[F.wave];
    if (!w || F.pursuit || (F.cur && !F.cur.doneWave)) return;
    // 持ち場へ歩いて移る。敵は守兵の到着を待たない。
    if (F.stageWave !== F.wave) {
      F.stageWave = F.wave;
      const mouth = MOUTHS.find((m) => m.z === w.z);
      const pt = { x: SB.x0 - 2 * SB.gap - 1, z: w.z };
      F.commandPt = pt; // 組を率いない身分にも、寄せごとの持ち場がある。
      ceaseBands(F.bands);
      F.stageGuns = F.guns.filter((q) => q.count > 0 && !q.routed).sort((a, b) => Math.abs(a.center().z - w.z) - Math.abs(b.center().z - w.z));
      const reachable = [];
      for (const q of F.stageGuns) {
        const i = reachable.length, path = gunRoad(rt, q, w.z, pt.x - 1, w.z + (i - 1) * 12);
        if (!path) continue;
        q._supportPath = path; reachable.push(q); if (reachable.length === 3) break;
      }
      F.stageGuns = reachable;
      F.stageGuns.forEach((q, i) => {
        q.order = 'path'; q.path = q._supportPath; q.pathIdx = 0; q.formation = 'column'; q.colW = 1;
        q.onArrive = (gg) => { gg.order = 'hold'; gg.formation = 'line'; gg.facing = Math.PI / 2; };
      });
      for (const q of [F.spears[0], ...(rt.squadGroups || [])]) {
        q.order = 'move'; q.dest = { x: pt.x, z: pt.z }; q.aggro = 2;
        q.onArrive = (gg) => { gg.order = 'hold'; gg.facing = Math.PI / 2; };
      }
      rt.marker('next_mouth', pt, mouth.name + 'の持ち場');
      rt.obj('hold', `${mouth.name}へ進め。鉄砲の後ろへ槍を揃えよ`, 'main');
      rt.say(F.voice, `${mouth.name}に敵の旗！　組を連れて持ち場へ移れ！`, 3.5);
    }
    // 攻め手は主人公や鉄砲の到着を待たない。間に合わなければ薄い守りで受ける。
    // 寄せる敵の印とは別に、移った持ち場の印を残す。
    F.wave++;
    rt.setPhase('defend');
    F.waveAt = rt.t;
    F.blockedT = 0; F.overrunT = 0; F.fireWaitT = 0; F.clearGun = null; F.flank = false; F.waitSaid = false; F.trap = false; F.close = false; F.volleys = 0; F.volT = 99; F.enteredShown = -1; F.waveRest = false;
    F.lane = { x: SB.x0 - SB.gap + 1, z: w.z + 4.5 };
    ceaseBands(F.bands);
    for (const q of F.guns) {
      if (F.stageGuns.includes(q)) continue;
      q.salvoOnly = false; q.focus = null; q.fire = true; q.order = 'move';
      q.dest = { x: SB.x0 - 2 * SB.gap - 2, z: q.anchor.z };
      q.onArrive = (gg) => { gg.order = 'hold'; gg.facing = Math.PI / 2; };
    }
    for (const q of F.spears) { q.order = 'hold'; q.aggro = 2; }
    const screen = F.spears[0];
    screen.order = 'move'; screen.dest = { x: SB.x0 - 2 * SB.gap - 1, z: w.z };
    screen.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI / 2; };
    const g = F.waveGroups[F.wave - 1];
    F.cur = g;
    const mis = g.missiles;
    mis.holdFire = false;
    mis.order = 'move'; mis.dest = { x: SB.x0 + 40, z: w.z - 14 };
    mis.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...q.dest }; q.facing = -Math.PI / 2; };
    F.curMis = mis;
    // 丘の隊も一つ寄せに押し出し、遠くの隊も二つ、同時に柵へ駆け出す
    const hq = F.jinkeiBound[['shitara_yamagata', 'shitara_naito', 'shitara_sanada'][F.wave - 1]];
    if (hq && !hq.army.rout) hq.advance(14, 9);
    for (const fc of F.far.filter((q) => !q.v && Math.abs(q.z - w.z) < 50).slice(0, 2)) {
      fc.v = 1; fc.owner = g;
      const dist = 125 - (SB.x0 + 62);
      fc.m.advance(dist, dist / 3);
    }
    // 柵の他の所へも、武田の大軍（軽い作り）が押し寄せて柵に取り付き、槍を叩き合う（world.addClash）。受ける柵の内は本物の兵なので描かない
    // 柵の前で撃たれて倒れた者は、その場に残る。この波の名のある隊が崩れたら、一緒に崩れて退く
    // どの波でも柵の北と南の両方へ、正面いっぱいに押し寄せる（本物の兵の受ける真ん中の外すべて）
    F.clashW = [[w.z + 58, 56], [w.z - 58, 56]].map(([z, cw], i) => {
      const fac = i || F.wave !== 1 ? 'takeda' : 'akazonae';
      const c = clash(rt, { x: SB.x0 + 1.5, z, facing: Math.PI / 2, w: cw, gap: 3, gap0: 64, closeSpeed: 4, seed: 190 + F.wave * 3 + i, noRout: true, noWake: true, killRate: 0.2, maxDrift: 1.5,
        A: { hidden: true, flag: z < 190 ? 'oda' : 'tokugawa', count: cw * 4 }, B: { flag: fac === 'takeda' && i ? 'furin' : fac, armor: nagashinojo.kit.ARMOR[fac], count: Math.round(cw * 11) } });
      c.push('A', 0.3);
      rt.after(2 + i * 3, () => c.go());
      return c;
    });
    sfx('taiko', 1);
    rt.banner(`武田の寄せ　${['一', '二', '三'][F.wave - 1]}の波`, `${w.name}の隊`);
    rt.say('伝令', w.line, 3);
    // 朝から昼過ぎまで続いた戦：三の波のころには日が高く傾き始める
    if (F.wave === 3) rt.world.setTime('afternoon');
    rt.marker('wave', centerOf(g), w.name + 'の旗', { red: true, group: g });
    // 一列目の虎口を通り、二列目との間へ入る。瞬間移動や柵の強制破壊はしない。
    // 横の槍衾のままでは口の両脇に詰まる。二列で重なる口へ寄せる。
    g.formation = 'column'; g.colW = 2;
    g.order = 'move'; g.dest = { x: SB.x0 + 8, z: F.lane.z };
    g.onArrive = (q) => {
      q.dest = F.lane;
      q.onArrive = (qq) => { qq.order = 'hold'; qq.anchor = F.lane; qq.aggro = 3; };
    };
    // 近い鉄砲三組を柵の奥へ寄せ、同じ虎口へ射線を集める。
    F.focusGuns = F.stageGuns;
    F.focusGuns.forEach((q, i) => {
      q.order = 'path'; q.path = q._supportPath; q.pathIdx = 0; q.formation = 'column'; q.colW = 1;
      q.onArrive = (qq) => { qq.order = 'hold'; qq.formation = 'line'; qq.facing = Math.PI / 2; };
    });
    rt.obj('hold', '柵の内で寄せを受け、鉄砲の後ろで槍を揃えよ', 'main');
    rt.say(F.voice, '鉄砲三組、この虎口へ寄れ！　槍は奥で待て。まだ撃つな', 3.5);
    if (F.canLead) rt.choose('率いる組へ、どう下知する？', [
      { label: '奥の柵に槍を揃え、突破を止める', note: '鉄砲の射線を空け、撃ち漏らしを正面で受ける' },
      { label: '虎口の脇へ組を回し、射撃の後に横から当たる', note: '撃つまでは待ち、柵間の武田勢へ横槍を入れる' },
    ], (i) => {
      if (F.cur !== g || g.doneWave) return;
      F.flank = i === 1;
      const pt = { x: SB.x0 - 2 * SB.gap - 1, z: w.z + (F.flank ? 12 : 0) };
      F.commandPt = pt;
      for (const q of rt.squadGroups || []) {
        q.order = 'move'; q.dest = pt; q.holdFire = true; q.fire = false; q.aggro = 2;
        q.onArrive = (qq) => { qq.order = 'hold'; qq.formation = qq.kind === 'spear' ? 'yari' : 'line'; };
      }
      rt.marker('command', pt, F.flank ? '組の横槍の持ち場' : '組の槍衾の持ち場');
      rt.obj('stay', '組の持ち場へ進め。射撃が済むまで待ち、柵の外へ出るな', 'order');
      rt.say(nm(rt), F.flank ? '組は虎口の脇へ！　鉄砲が撃つまで待て！' : '組は奥の柵へ！　槍を揃え、鉄砲の前を空けよ！', 3);
    }, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    if (F.okubo.woundOut && !F.bossWounded) {
      F.bossWounded = true;
      rt.say('伝令', `${F.boss}様が手傷で退かれた。持ち場を守れ！`, 3.5);
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
      rt.objProgress('hold', !here ? '柵を結い直す印へ進め' : !together ? '持ち場で組の到着を待て' : F.prepT < 4 ? `槍をそろえる ${Math.min(4, Math.floor(F.prepT))}／4秒` : '槍はそろった。持ち場で下知を待て');
      if ((F.prepT >= 4 && rt.t - F.prepAt >= 18) || rt.t - F.prepAt > 35) {
        F.prepDone = true;
        // 持ち場を確かめただけで、柵の丈夫さや傷を増減させない。
        rt.unmark('prepare');
        rt.say(F.voice, F.prepT >= 4 ? 'よし、槍が揃った。武田の寄せを受けるぞ' : '槍はまだ揃わぬ。武田が来るぞ、持ち場へ急げ！', 3.5);
        this.wave(rt);
      }
    }
    // 替えた兵にも同じ武器の威力を使う。柵の内では控えを勝手に侵入させない。
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) {
      F.wkT = 0.5;
      const inside = p.x < SH_FRONT + 4;
      for (const A of rt.world.armies || []) if (A.team === 1) A.noWake = inside || A === F.katsuyori.army;
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
    if (F.close) for (const q of F.focusGuns || []) {
      q.fire = !q._losBlocked && q.order === 'hold'; q.holdFire = !q.fire;
    }
    // 予備隊、区画ごとに自動で動く（37・45 章）：柵が破られた区画へ入り・向き直る。別の区画が薄くなれば、そちらが次に危なくなる
    if (F.reserve) reserveTick(rt, F.reserve, F.fence, ZONES, dt, F.reserveOptions);
    // 柵の様子だけを渡す。英字の班名や状態は画面に出さない
    if ((F.hudT = (F.hudT || 0) - dt) <= 0) {
      F.hudT = 0.5;
      F.hudBands = null;
      F.hudZone = null; // 広い区画の傷みを正確な百分率にはしない
      if (F.trap && F.volleys === 3 && !F.waveRest && !F.pursuit) {
        rt.objProgress('hold', '鉄砲は弾込め。槍で持ち場を守れ');
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
      F.overrunT = enemy >= 3 && enemy > guards * 2 ? (F.overrunT || 0) + 0.5 : 0;
      if (F.overrunT >= 2 && !(F.overrunWarnAt > rt.t)) {
        F.overrunWarnAt = rt.t + 8;
        rt.bark('奥の柵へ敵が入った！　味方と押し返せ', true);
      }
      if (F.overrunT >= 2) {
        rt.objProgress('stay', `奥の柵へ味方と戻れ。あと${Math.max(0, Math.ceil(8 - F.overrunT))}秒で持ち場を失う`); F.overrunShown = true;
      } else if (F.overrunShown) { rt.objProgress('stay', ''); F.overrunShown = false; }
      if (F.overrunT >= 8) {
        F.ending = true; rt.setPhase('end');
        rt.tracker.main = false; rt.objFail('hold'); rt.objRemove('stay');
        for (const id of ['prepare', 'next_mouth', 'wave', 'command']) rt.unmark(id);
        rt.banner('持ち場を破られた', '組とともに西へ退け');
        rt.finish({}, 8); return;
      }
    }
    // 最前列の距離ではなく、実際に柵間へ入った人数で射撃を解禁する。
    const g = F.cur;
    if (g && !g.doneWave && !g.routed && g.count > 0 && !F.pursuit) {
      let entered = 0, alive = 0, target = null;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) {
        alive++;
        if (u.pos.x < SB.x0 - 0.8 && u.pos.x > SB.x0 - SB.gap - 1 && Math.abs(u.pos.z - g.def.z) < 14) { entered++; target = target || u; }
      }
      if (entered && !F.waitSaid) { F.waitSaid = true; rt.say(F.voice, '先頭が入った！　まだ撃つな、後ろまで引きつけよ！', 3); }
      if (!F.trap && entered !== F.enteredShown) { F.enteredShown = entered; rt.objProgress('hold', entered ? '先頭だけが入った。後ろの列を待て。射撃は下知で始まる' : '柵を守り、寄せる敵を待て'); }
      const full = entered >= Math.min(6, alive) && entered >= Math.ceil(alive * 0.6);
      // 詰まった時は、誘い込み成功とせず柵前を撃って守る。次の段へ進める保険。
      F.blockedT = g.center().x < SB.x0 + 20 && !full ? (F.blockedT || 0) + dt : 0;
      const stalled = F.blockedT > 8;
      if (!F.trap && (full || stalled)) {
        F.trap = true; F.fireAt = rt.t; g.noRout = false;
        rt.objProgress('hold', full ? '後ろの列も入った。射撃の下知' : '柵前の列が詰まった。柵前へ撃つ下知');
        rt.obj('hold', full ? '柵の間へ入り込んだ武田勢を、鉄砲で撃ち崩せ' : '柵前で詰まった武田勢を撃ち、突破を止めよ', 'main');
        rt.banner(full ? '柵の間へ入り込んだ' : '武田勢、柵前に詰まる', '鉄砲の組が、順に撃ちかける');
        if (full) rt.award((t) => t.side.push('柵の間へ引きつけた'), '後続まで柵の間へ引きつけた');
      }
      F.volT += dt;
      if (F.trap && !F.close && F.volleys < 3 && F.volT >= 3.4) {
        const q = F.focusGuns[F.volleys];
        // 装填中・移動中・味方に射線を塞がれた組は撃てない。死んだ組を数で補わない。
        let ready = false;
        if (q && !q._losBlocked && q.order === 'hold') for (const u of q.units) {
          if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && u.type === 'gun' && !u.sidearm && u.gunAmmo !== 0 && !u.reload) { ready = true; break; }
        }
        if (q && q.count && !q.routed && !ready) rt.objProgress('hold', q._losBlocked ? '味方が鉄砲の前にいる。槍の列は射線を空けよ' : q.order !== 'hold' ? '鉄砲の組が持ち場へ移っている。槍で守れ' : '鉄砲は弾を込めている。槍で守れ');
        F.fireWaitT = q && q.count && !q.routed && !ready && (q._losBlocked || q.order !== 'hold') ? (F.fireWaitT || 0) + dt : 0;
        if (q?._losBlocked && F.fireWaitT >= 2 && F.clearGun !== q) {
          F.clearGun = q;
          const c = q.center();
          for (const spear of F.spears) if (spear.count && !spear.routed) {
            const sc = spear.center();
            if (Math.hypot(sc.x - c.x, sc.z - c.z) >= 7 || sc.x <= c.x) continue;
            spear.order = 'move'; spear.dest = { x: c.x - 8, z: sc.z }; spear.aggro = 2;
            spear.onArrive = (sp) => { sp.order = 'hold'; sp.facing = Math.PI / 2; };
          }
          rt.say(F.voice, '槍は鉄砲の後ろへ下がれ！　射線を空けよ！', 3);
        }
        const defend = F.fireWaitT >= 8;
        if (!q || !q.count || q.routed || ready || defend) {
          F.fireWaitT = 0;
          if (defend) rt.say(F.voice, 'この組は撃てぬ。槍で持ち場を守れ！', 3);
          F.volT = 0; F.volleys++;
          if (!target) for (const u of g.units) if (u.alive && !u.fleeing) { target = u; break; }
          if (ready) { q.salvoOnly = false; q.fire = true; q.holdFire = false; q._wantFire = true; q.focus = target; }
          for (const q of rt.squadGroups || []) if (q.kind === 'gun' || q.kind === 'bow') { q.fire = true; q.holdFire = false; q.focus = target; }
          if (ready) for (const c of F.clashW || []) c.volley('A');
          if (ready && F.volleys === 1) battleEvent(rt, EVENT_VOLLEY, F.lane, F.focusGuns[0], 0, true, '虎口へ鉄砲の組が撃ちかける');
          if (ready) rt.say(F.voice, F.volleys === 1 ? '一の組、放て！　撃った者は弾を込めよ！' : F.volleys === 2 ? '二の組、放て！' : '三の組、放て！　槍は備えよ！', 2);
          rt.objProgress('hold', !ready ? '撃てない組は控える。槍で持ち場を守れ' : F.volleys === 3 ? '弾込めの間は槍で守れ' : '鉄砲が撃ちかける。槍は備えよ');
          rt.after(1.8, () => { if (!F.ending && F.cur === g && q) { q.holdFire = true; q._wantFire = false; } });
        }
      }
      if (F.trap && !F.close && (F.volleys >= 3 || g.center().x < SB.x0 - SB.gap)) {
        F.close = true;
        ceaseBands(F.bands);
        for (const q of F.focusGuns) q.salvoOnly = false;
        // 柵越しには守兵を狙えない。射撃後も虎口を歩いて抜けてから打ち合う。
        g.order = 'move'; g.dest = { x: SB.x0 - 2 * SB.gap - 6, z: F.lane.z };
        g.seekRange = 18; g.aggro = 14;
        g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; };
        for (const q of rt.squadGroups || []) {
          q.focus = null; q.holdFire = false; q.fire = true; q.onArrive = null;
          q.order = q.kind === 'gun' || q.kind === 'bow' ? 'hold' : 'attack'; q.seekRange = F.flank ? 26 : 16; q.aggro = 10;
        }
        const spear = F.spears[0];
        spear.onArrive = null; spear.order = 'attack'; spear.seekRange = 24; spear.aggro = 12;
        rt.obj('hold', '柵の内で槍を揃え、撃ち漏らしを止めよ', 'main');
        rt.obj('stay', F.canLead ? (F.flank ? '組へ「かかれ」。虎口の脇から当たれ' : '組の槍を揃え、奥の柵を守れ') : '槍組に続き、奥の柵を守れ', 'order');
        rt.say(F.voice, F.flank ? '鉄砲、控えよ！　その方の組、横から当たれ！' : '鉄砲、控えよ！　その方の組、槍を揃えて受け止めよ！', 3);
      }
    }
    // 寄せを早く退けたら、弾を込め直し組をそろえる。三つの波を数分かけて受ける。
    if (g && !F.pursuit && (g.routed || g.count === 0) && !g.doneWave && !F.waveRest) {
      F.waveRest = true;
      rt.obj('hold', '弾を込め直し、組をそろえて次の寄せに備えよ', 'main');
      rt.objProgress('hold', '');
    }
    if (F.waveRest && g && !g.doneWave) rt.objProgress('hold', gunsLoaded(F.focusGuns || []) ? '弾込めが済んだ。次の敵の旗へ備える' : '鉄砲が弾を込めている。槍を揃えて守れ');
    // 波が崩れたら、次の波
    if (g && !F.pursuit && (g.routed || g.count === 0) && !g.doneWave && gunsLoaded(F.focusGuns || [])) {
      g.doneWave = true;
      ceaseBands(F.bands);
      rt.unmark('command');
      for (const q of rt.squadGroups || []) { q.order = 'follow'; q.focus = null; q.onArrive = null; q.holdFire = false; q.fire = true; }
      for (const q of F.guns) { q.focus = null; q.order = 'hold'; q.onArrive = null; }
      // 敗走は東の退路へ歩く。枠を空けるために守兵を消さない。
      rt.unmark('wave'); rt.unmark('next_mouth');
      for (const c of F.clashW || []) rt.after(1 + Math.random() * 3, () => c.rout('B', { hideAfter: 40, minFight: 40 }));
      rt.obj('hold', '馬防柵を守り、次の下知を待て', 'main');
      // 生きて退く将を強制的に殺さない。戦全体での討死は史実札に記す。
      rt.say('伝令', `${g.def.name}の隊、退くぞ！`, 3);
      rt.award((t) => t.side.push(`${g.def.name}隊を退けた`), `${g.def.name}隊を退けた`);
      if (F.wave < this.WAVES.length) {
        rt.say('組頭', 'よう持ちこたえた！　次が来るぞ、槍を立てよ', 3);
        this.wave(rt);
      } else this.decide(rt);
    }
    // 柵の外へ出たか（打って出る下知の間は咎めない）
    if (!F.pursuit && p.x > SH_FRONT && !rt.G.lord && !depthOn(rt)) {
      if (!(F.outT > 0) && rt.t >= (F.outCallT || 0)) { F.outCallT = rt.t + 8; rt.bark('柵の外へ出た。下知がない。すぐ内へ戻れ！', true); }
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく柵の外へ出た', ['組頭', '戻れ！　柵の外へ出るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else if (!F.pursuit) F.outT = 0;
    // 追い討ち：殿の馬場信春の隊を崩せば勝ち
    depthTick(rt, dt);
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
      if ((R && (R.routed || R.count === 0)) || rt.t - F.pursuit > 120) {
        F.dpB = true;
        if (R && (R.routed || R.count === 0)) {
          rt.objDone('pursue');
          rt.award((t) => { t.special = { label: '追い討ち', pts: 25 }; }, '殿を崩した');
        } else {
          rt.objFail('pursue');
          rt.say('組頭', '追い討ちはここまでじゃ。馬場の殿は崩せなんだが、柵を守った働きは残る', 4);
        } // 追い切れなくても殿を強制敗走させない
        const end = () => {
          F.ending = true; rt.setPhase('end');
          for (const id of ['rear', 'wave', 'command', 'next_mouth']) rt.unmark(id);
          rt.banner('武田勢、退却', R && (R.routed || R.count === 0) ? '柵を守り、殿の隊も崩した' : '柵は守った。殿の隊は追い切れず');
          for (const h of [...F.hill, F.katsuyori]) if (!h.army.rout) h.retreat(160, 50);
          rt.say('組頭', '徒歩も騎馬も、柵と鉄砲で受けた。撃ち漏らしは槍で止めた。持ち場を守ったぞ！', 4);
          sfx('horagai', 0.8);
          rt.finish({}, 10);
        };
        end();
      }
    }
  },

  // 鳶ヶ巣山（46 章）：主戦場とは別方向、酒井忠次の別働が夜明けに武田の拠点を落とす。主戦場には狼煙・遠い音・伝令の知らせだけ届く
  tobigasu(rt) {
    const F = rt.flags;
    if (F.tobiDone || F.pursuit || F.ending || !rt.player.u.alive) return;
    F.tobiDone = true;
    battleEvent(rt, EVENT_MESSENGER, null, null, 0, true, '酒井忠次の別手から知らせが届いた');
    rt.say('伝令', '酒井忠次様の別手が鳶ヶ巣山の砦を落とした。長篠城へ兵が入ったとの知らせじゃ！', 4.5);
    const groups = [F.cur, ...(F.hill || []), F.katsuyori].filter((g) => g && g.count > 0);
    for (const g of groups) g.morale = Math.max(15, (g.morale ?? 80) - 10);
  },
  decide(rt) {
    const F = rt.flags;
    rt.objDone('hold');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '馬防柵を守り抜いた');
    if (!F.outWarned && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    rt.obj('hold', F.canLead ? '組を集め、追い討ちの下知を待て' : '槍組に続き、追い討ちの下知を待て', 'main');
    rt.objProgress('hold', '');

    rt.banner('勝頼の決断', '武田勢、退き始める');
    // 丘の上の武田の隊と勝頼の本陣が、背を向けて東へ退いていく
    F.katsuyori.retreat(160, 40);
    const dest = { x: 690, z: -100 };
    for (const q of [F.katsCamp.guard, F.katsCamp.general.group]) {
      q.noRout = false; q.order = 'retreat'; q.dest = dest; q.fleeDir = { x: 1, z: -0.2 };
    }
    battleEvent(rt, EVENT_RETREAT, KATSUYORI, null, 1, true, '勝頼の本陣が退き始めた');
    F.hill.forEach((h, i) => { if (!h.army.rout) rt.after(i * 1.5, () => h.retreat(50, 36)); });
    rt.say('伝令', '武田勝頼、退き陣！　馬場美濃守が殿に残っておりまする！', 4);
    // 組を揃え直し、追い討ちへ出る口を選ぶ
    const go = (fn) => (!F.canLead || rt.G.lord ? rt.after(5, fn) : rt.after(3, () => depthStart(rt, shiCtx(rt), shiA(rt), fn)));
    go(function begin() {
      F.pursuit = rt.t;
      sfx('horagai', 1);
      rt.say('組頭', '柵を出よ！　追い討ちじゃ！　虎口から打って出よ！', 4);
      rt.obj('pursue', '柵を出て、殿の馬場信春の隊を崩せ', 'main');
      rt.objRemove('hold');
      ceaseBands(F.bands);   // 集中射撃を終え、追い討ちでは全員に撃たせる
      for (const gg of F.guns) { gg.salvoOnly = false; gg.fire = true; gg.holdFire = false; }
      for (const sp of F.spears) { sp.order = 'attack'; sp.seekRange = 70; sp.formation = 'line'; }
      const R = F.rear;
      R.order = 'move'; R.dest = { x: 78, z: -280 }; // 丸山側から北の攻め口へ下がって殿を務める
      R.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; q.facing = -Math.PI / 2; };
      F.rear = R;
      // 横槍は実際に組が側面へ届いた時だけ効く。選択後の時間だけでは崩さない。
      rt.marker('rear', centerOf(R), '殿の馬場隊', { red: true, group: R });
    });
  },

  onRout(rt, g) {
    if (g === rt.flags.rear) { rt.unmark('rear'); rt.say('足軽', '殿が崩れたぞ！', 2.5); }
  },
  onKill(rt, v, k) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.group && v.group.def && !v.shFallSaid) {
      v.shFallSaid = true;
      if (sightPoint(rt, v.pos, 55) || k?.isPlayer) rt.say('足軽', `敵将${v.name || v.group.def.name}が倒れたぞ！`, 3);
      v.group.morale -= 30;
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
    if (sightPoint(rt, F.noticePt, 55) && (F.brokeSaid || -99) + 10 < rt.t) { F.brokeSaid = rt.t; rt.say('組頭', ['柵が破られた！　破れ目を槍で塞げ！', 'また一枚折られた！　穴を撃ち抜かせるな、鉄砲を寄せよ！', '柵が持たぬ！　控えの槍衆、前へ！'][Math.min(2, (F.brokeN = (F.brokeN || 0) + 1) - 1)], 3); }
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
shitaragahara.skip = (rt) => { if (rt.phase === 'brief' && rt.flags.wave === 0) rt.flags.prepAt = rt.t - 36; };
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 奉行は各持ち場へ初めから置く。別名の同一人物や土屋を他将の隊へ追加しない。
shitaragahara.famous = [];
shitaragahara.history = '天正三年五月二十一日、織田・徳川軍は設楽原で馬防柵と鉄砲を用い、武田勝頼の軍を破った。『信長公記』は鉄砲千挺ほどを奉行に預け、柵の外へ出ず、寄せる武田勢を撃ち退けたと記す。山県昌景の赤備え、真田信綱・昌輝らの奮戦と討死は『甲陽軍鑑』にも伝わる。山県・内藤・真田兄弟ら多くの宿将が討死し、馬場信春は退却の殿を務めた。鉄砲は三千挺だったとも伝わるが、数や撃ち方には諸説があり、三段撃ちを確定した史実とはしない。『信長公記』の寄せの順は山県・武田信廉・小幡・武田信豊・馬場であり、この戦の山県・内藤・真田という三つの局面は全軍の攻撃順を再現したものではない。三重の柵の間への誘い込み、細かな備の兵数・居場所・天気は推定と遊びの補いである。総勢は織田・徳川三万八千、武田一万五千とも伝わるが、長篠側の別手を含む数であり、決戦場に全員を置いた意味ではない。';
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;
shitaragahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// ---- 設楽原 ----
function shiCtx(rt) {
  const F = rt.flags;
  // 自分の持ち場の槍組を段に引き継ぐ。上官本人は後方の控えに残す。
  return { faction: 'takeda', dmg: 1, friends: () => [F.spears && F.spears[0]].filter((g) => g && g.count && !g.routed) };
}
// 三の寄せの後：組を揃え直し、中央の虎口か南の端から追い討ちへ
function shiA(rt) {
  const B = '組頭';
  return [
    DP.rest({ dur: 8, say: [[B, '弾を込め直せ。柵の破れ目を結え。手負いは後ろへ'], ['伝令', '武田勢が退くとの知らせじゃ！'], [B, '組を集めよ。打って出る口を選び、馬場の殿へ当たる']] }),
    DP.pick({ time: 12, title: '勝頼が退き始めた。追い討ちに、どこから打って出る？',
      options: [{ label: '中央の虎口から、殿の馬場隊へまっすぐ', note: '一番に馬場隊へ当たれる。正面は固い' }, { label: '南の端から回り、馬場隊の横腹を突く', note: '横へ回り込めれば当たりやすい。着くのは遅れる' }],
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
  ...postRows(TAKEDA_POSTS, takedaIds, 120),
  ['shitara_anayama', '中央の親類衆の控え', '穴山信君', null, { x: 280, z: -60 }, 'takeda', 'takeda', null, { draw: true, count: 80 }],
  ['shitara_nobutoyo', '中央の親類衆の控え', '武田信豊', null, { x: 280, z: 70 }, 'takeda', 'takeda', null, { draw: true, count: 80 }],
  ['shitara_south', '南の国衆の控え', '将の名は不明', null, { x: 230, z: 300 }, 'takeda', 'takeda', null, { draw: true, count: 60, named: false }],
], '武田一万五千から鳶ヶ巣山の三千を除き、決戦場は一万二千の目安。十三か所の記述を採用し、全ての備の将や順が確定したとはしない。');
installBattleJinkei(shitaragahara, [SHITARA_ODA_JIN, SHITARA_TOKUGAWA_JIN, SHITARA_TAKEDA_JIN]);

export { shitaragahara };
