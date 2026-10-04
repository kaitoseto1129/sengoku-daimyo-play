// ======================================================================
// 織田家編　天正伊賀の乱・比自山城（天正九年九月）
// 信長公記巻十四は九月三日の諸口侵攻を記す。比自山の夜討ち・攻めあぐね・退去は伊乱記の伝承で補う。
// 丹羽の一組で、夜討ちを退ける→南の土橋を押さえる→攻めあぐねて包囲へ→夜の出撃を止める→空城の曲輪を調べる。
// 比自山の退去日を佐奈具の九月十一日と混同しない。数・各隊の位置・時間配分は遊びの復元。
// 北（-z）に尾根の曲輪、南（+z）に大手と織田の陣。南北約350m・比高約150mの城を縮めて使う。
// ======================================================================
import { yamaLift, benchRoads, switchback } from './yamalift.js';
import { nobori, hut, yagura, campfire, kabukimon, tawara, tobira, dorui } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, ringWall } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, rest, hold, move, depthBot } from './b_depth.js';
import { uS, uA, lines, camp } from './b_mid.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { HIJIYAMA_PLAN, SHU, KITA, KITASOTO, HIGASHI } from './castles/hijiyama.js';
import { demRelief } from './dem.js';
import { doruiLine, monomi } from './castle_parts.js';
import { battleEvent, EVENT_FIRE_START, EVENT_RETREAT, EVENT_UNIT_BREAK, EVENT_MESSENGER } from './battle_events.js';
let igDem = null;
import('./asset_dem_hijiyama.js').then((m) => { igDem = m.default; }).catch(() => {});
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const CAMP = { x: 0, z: 40 };                     // 丹羽の陣
const FORT = { x: SHU.x, z: SHU.z, r: 18 };       // 比自山城・主郭（観音寺跡。口は南）
const NAGATA = { x: -150, z: -60 };               // 長田丸（伊賀衆を支える小城館・丘の上）
const ASAYA = { x: 160, z: -40 };                 // 朝屋丸（同上。山から下りた伊賀衆の連絡先）
import { jinkeiBuild } from './jinkei.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記は侵攻の口、伊乱記・伊賀市の城跡資料は蒲生・堀・筒井の囲みを根拠とする。
// 北伊賀の土豪の曲輪別の将名・旗紋は確定せず、丸は見分けるための代用。
const IGA_ATTACK = sonaePlan('比自山の囲み', 0, { x: CAMP.x + 6, z: CAMP.z + 18 }, Math.PI, [
  ['honjin', '本陣', '堀秀政', 5000, CAMP.x + 6, CAMP.z + 18, Math.PI, 'oda', 'none'],
  ['niwa', '南の仕寄り', '丹羽長秀', 2000, -70, 70, Math.PI, 'sujikai', 'sujikai', 160, 28, 10],
  ['gamo', '東の包囲陣', '蒲生氏郷', 4000, 70, -40, -Math.PI / 2, 'oda', 'none', 160, 24, 10],
  ['tsutsui', '西の包囲陣', '筒井順慶', 4000, -90, -40, Math.PI / 2, 'igeta', 'igeta', 160, 24, 10],
]);
const IGA_DEFEND = sonaePlan('曲輪と尾根の守り', 1, SHU, 0, [
  ['shu', '主郭の南辺', '名は伝わらない', 1500, SHU.x - 8, SHU.z, 0, 'maru', 'none', 48, 8, 8],
  ['kita', '北の尾根曲輪', '名は伝わらない', 800, KITA.x, KITA.z, Math.PI, 'maru', 'none', 32, 8, 6],
  ['kitasoto', '北外郭の退き口', '名は伝わらない', 500, KITASOTO.x, KITASOTO.z, Math.PI, 'maru', 'none', 24, 7, 6],
  ['higashi', '東の脇曲輪', '名は伝わらない', 700, HIGASHI.x, HIGASHI.z, Math.PI / 2, 'maru', 'none', 32, 7, 6],
]);

const ODA = { flag: 'oda' };
// 伊賀の地侍と足軽。装いと指物の省略は、両軍を見分けるための復元。
const IGA = { armor: 0x343a42, lace: 0x8a9098, cloth: 0x3a4048, hat: 'hachimaki', flag: null };   // 闇でも見分けがつくよう、鈍い青灰と薄い金属の光（B091）

// 地山（曲輪の段・堀切は heightOf が castles/hijiyama.js の縄張りから被せる）。長田丸・朝屋丸は丘の上
function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += 22 * gauss(x, z, FORT.x, FORT.z - 30, 5200) + 16 * gauss(x, z, NAGATA.x, NAGATA.z, 8000) + 16 * gauss(x, z, ASAYA.x, ASAYA.z, 8000);
  // 国土地理院の標高：戦場の外の遠い山並みにだけ、実際の起伏を足す（1 が実の 5m）
  if (igDem) h += demRelief(igDem, x, z, { xy: 5, cx: 0, cz: 0, inner: 230, fade: 60, scale: 0.18 });
  return h;
}
let CASTLE_HEIGHT = null;
function heightRaw(x, z) {
  if (!CASTLE_HEIGHT) CASTLE_HEIGHT = heightOf(HIJIYAMA_PLAN, baseTerrain, 3);
  return CASTLE_HEIGHT(x, z) + yamaLift(x, z, LIFT);
}

const iga = {
  jinkei: [IGA_ATTACK, IGA_DEFEND],
  noWake: true, // 遠景は本物に替えず、夜討ちの波だけを実兵にする。
  noReserve: true,
  botOrders: true, // 山へ追わず、消火・土橋・陣の口の下知を守る。
  // 通常は五〜七分を目安。陣を離れたり曲輪で迷った時は、各段の時間切れで先へ進む。
  taisho: { a: null, b: null }, // この城で百地丹波を討つ筋にはしない。
  spawn: { x: 6, z: 50, heading: Math.PI },
  world: {
    seed: 15819,
    time: 'night',
    wind: [0.5, 1],
    autumn: true,
    muddy: 0.25,
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    // 大手道（南）＋北の搦手・柏原方面（KITA→KITASOTO）に加え、犬走り（斜面沿いの細道。主郭の周り→北・東の曲輪へ）
    paths: [[[0, 150], ...switchback([CAMP.x, CAMP.z], [FORT.x, FORT.z + FORT.r], 6, 28), [0, KITA.z], [0, KITASOTO.z]],
      [[0, FORT.z + 13], [13, FORT.z], [0, FORT.z - 13], [0, KITA.z + 11], [0, KITA.z - 11], [HIGASHI.x - 10, HIGASHI.z]]],
    height,
    clear: (x, z) => (Math.abs(x) < 50 && z > -10 && z < 90) || Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 8
      || Math.hypot(x - KITA.x, z - KITA.z) < 14 || Math.hypot(x - KITASOTO.x, z - KITASOTO.z) < 13 || Math.hypot(x - HIGASHI.x, z - HIGASHI.z) < 13
      || (Math.abs(x) < 14 && z < 0 && z > -185) || Math.hypot(x - NAGATA.x, z - NAGATA.z) < 16 || Math.hypot(x - ASAYA.x, z - ASAYA.z) < 16,
    trees: 680,
    tufts: 3000,
    treeDensity: (x, z) => ((Math.abs(x) < 50 && z > -10 && z < 90) || (Math.abs(x) < 20 && z < -80 && z > -185) || Math.hypot(x - HIGASHI.x, z - HIGASHI.z) < 16) ? 0.1 : 1,
    // 盆地・丘陵・森の伊賀。山城だけでなく、山麓の集落（小屋二つ）と、長田丸・朝屋丸の小城館の森
    groves: [{ x: -60, z: 30, r: 14, n: 22 }, { x: 60, z: 10, r: 14, n: 22 }, { x: NAGATA.x, z: NAGATA.z, r: 16, n: 18 }, { x: ASAYA.x, z: ASAYA.z, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && (z < -195 || Math.abs(x) > 90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_A', nightRaid: 'HIST_B', emptyCastle: 'HIST_B', nagata: 'HIST_B', asaya: 'HIST_B', approach: 'GAME_C', distantFires: 'GAME_C', ridgeHq: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.doused = 0;
    // ---- 丹羽の陣：陣幕と小屋 ----
    // 比自山を囲む堀秀政の陣。信雄の総本陣とは分ける。
    F.honjin = camp(rt, { x: CAMP.x + 6, z: CAMP.z + 18, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '堀秀政', hat: 'kabuto_m', haori: 0x6a1d2a }, guard: 15, reserve: 260, runTo: { x: 0, z: 36 } });
    F.huts = [[-20, 30, 0.1], [18, 26, -0.2], [-8, 60, 0.2], [26, 56, 0]].map(([x, z, r]) => { const m = hut(W, x, z, 7, 5, r, { wall: 0x6e5a40 }); rt.scene.add(m); return { x, z, m }; });
    rt.scene.add(tawara(W, 4, 34, 0.3, 6), tawara(W, -30, 46, -0.2, 5));
    for (const [x, z, k] of [[-10, 20, 'oda'], [10, 20, 'eiraku'], [-34, 30, 'oda'], [34, 34, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[-4, 44], [14, 40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 比自山城：主郭→北の尾根曲輪→堀切→北外郭、主郭→堀切→東の脇曲輪（一本道でない）。南の大手だけ手組みの木戸 ----
    F.castleC = buildCastlePlan(rt, HIJIYAMA_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['shu'] });
    for (const s of F.castleC.walls) { s.noTarget = true; s.wall = true; rt.scene.add(dorui(W, s.seg, s.nx, s.nz, { h: 0.6, w: 2.6 })); }
    // 主郭の四周の土塁（南の木戸の口だけ空ける。登れる床つき）と、高い区画の指揮所（物見）
    {
      const arc = []; const R0 = FORT.r + 2.6;
      for (let i = 1; i <= 17; i++) { const a = (i / 18) * Math.PI * 2; arc.push([FORT.x + Math.sin(a) * R0, FORT.z + Math.cos(a) * R0]); }
      doruiLine(rt, arc, { w: 2.6, h: 0.7, name: '主郭の土塁' });
      F.shikisho = monomi(rt, FORT.x - 9, FORT.z - 12, { team: 1, name: '主郭の指揮所' });
    }
    // 遠くの別方向の戦い・火・狼煙：長田丸・朝屋丸のあたり、山の向こう
    for (const [x, z, s2] of [[NAGATA.x, NAGATA.z - 30, 2.4], [ASAYA.x, ASAYA.z - 24, 3.2], [-120, -170, 2.0], [140, -150, 2.2]]) { W.addSmokeColumn(x, W.heightAt(x, z) + 4, z, { size: s2 }); }
    for (const [x, z] of [[-150, -100], [165, -80]]) W.addFire(x, z, { h: 1.2 });
    F.ring = ringWall(rt, FORT.x, FORT.z, FORT.r, { gapAt: 0, gapW: 0.3, team: 1, hp: 1e9, name: '柵', segLen: 5 });
    for (const s of F.ring) { s.noTarget = true; s.wall = true; rt.scene.add(dorui(W, s.seg, s.nx, s.nz, { h: 0.6, w: 2.6 })); }
    const n0 = Math.max(6, Math.round((2 * Math.PI * FORT.r) / 5)), a1 = (2 * Math.PI) / n0;
    const seg = [FORT.x - FORT.r * Math.sin(a1), FORT.z + FORT.r * Math.cos(a1), FORT.x + FORT.r * Math.sin(a1), FORT.z + FORT.r * Math.cos(a1)];
    F.gate = rt.army.addStruct({ seg, nx: 0, nz: 1, hp: 1e9, maxHp: 1e9, armor: 0.2, team: 1, name: '木戸' });
    F.gz = seg[1];
    const dm = tobira(W, FORT.x, F.gz, seg[2] - seg[0] - 0.2, 0, { h: 2.8 });   // 閉じた扉（破られると根元から倒れる）
    F.gate.mesh = dm;
    // 観音寺跡の主郭。名のある城主・最後の一騎打ちは置かない。
    rt.scene.add(dm, kabukimon(W, FORT.x, F.gz, seg[2] - seg[0] + 0.8, 0, { doors: false }), yagura(W, FORT.x + 10, FORT.z + 8));
    // ---- 周りの小城館：長田丸・朝屋丸（遠景・連絡の拠点。柵の囲いと物見・旗だけの軽い作り） ----
    for (const [S, nm2] of [[NAGATA, '長田丸'], [ASAYA, '朝屋丸']]) {
      const rr = ringWall(rt, S.x, S.z, 9, { gapAt: Math.PI, gapW: 0.5, team: 1, hp: 1e9, name: nm2 + 'の柵', segLen: 5 });
      for (const s of rr) s.noTarget = true;
      rt.scene.add(hut(W, S.x, S.z, 7, 5, 0, { wall: 0x5a4a38 }), yagura(W, S.x + 6, S.z - 6), nobori(W, S.x - 6, S.z + 6, 'maru', 6));
    }
    // ---- 丹羽長秀の手（自分の持ち場）、筒井の手、木戸を破る組 ----
    F.niwa = allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: 0, z: 36 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.niwaU = F.niwa.units[0];
    F.tsutsui = allyGroup(rt, { name: '筒井順慶の手', anchor: { x: -26, z: 40 }, facing: Math.PI, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '筒井順慶', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { name: '木戸を破る組', anchor: { x: 20, z: 44 }, facing: Math.PI, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.niwa, F.tsutsui, F.ram];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.78; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 48 }, Math.PI, [{ kind: 'spear', n }]);
    F.jinHosts = buildSonae(rt, this.jinkei);
    // 陣の中で寝ずの番をする織田の兵：焚き火を囲んで座る者・立つ番の者。夜でも火に照らされて見える
    {
      const ppl = [];
      for (const [fx, fz] of [[-8, 24], [12, 18]]) for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + fx * 0.1, r = k % 3 === 2 ? 3.2 : 2.1;
        ppl.push({ x: fx + Math.sin(a) * r, z: fz + Math.cos(a) * r, k: k % 3 === 2 ? 'spear' : 'seated', facing: a + Math.PI, flag: 0 });
      }
      W.addDistantArmy({ people: ppl, armor: 0x2b3140, team: 0, flagTex: flagTexture('oda'), seed: 15814 });   // 見張りの姿は軽い遠景のまま
      for (const [x, z] of [[-8, 24], [12, 18]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    }

    applyLook(rt, { ...NIGHT, hI: NIGHT.hI * 1.55, sunI: NIGHT.sunI * 1.4, hg: 0x3a3a3c }); rt.world.lookDark = true;   // 月明かりを強めた夜（柵の陰がほぼ黒だった。見回り 10/2）
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '陣の見張りの一手を預かれ' : '陣の見張りにつけ', 'main');
    rt.say('丹羽長秀', `${nm(rt)}、伊賀の者は夜に来る。山と林は敵の陣じゃ。火を消し、陣の口を守れ`, 5);
    rt.marker('niwa', unitPos(F.niwaU), '丹羽長秀', {});
    rt.after(16, () => this.raid(rt));
  },

  // ① 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('raid');
    rt.unmark('niwa');
    sfx('kane', 0.6);
    rt.banner('夜討ち', '陣の中に伊賀の者が忍び込み、小屋に火をつけた');
    rt.obj('main', '小屋の火を消し、忍び込んだ伊賀衆を討て', 'main');
    rt.say('足軽', '火じゃ！　小屋が燃えておる！', 2.5);
    rt.say('丹羽長秀', '慌てるな！　火を消せ。火の明かりに浮かぶ者を討て！', 3.5);
    const W = rt.world;
    battleEvent(rt, EVENT_FIRE_START, CAMP, F.niwa, 1, true, '夜討ちで陣に火の手が上がった');
    F.fires = [];
    F.huts.slice(0, 3).forEach((h, i) => {
      const f = W.addFire(h.x, h.z, { h: 1.8, size: 2.6 });
      F.fires.push(f);
      rt.marker('f' + i, { x: h.x, z: h.z }, '火を消す', { h: 3 });
      rt.addInteract('f' + i, { x: h.x, z: h.z + 3 }, '水を掛けて火を消す', () => this.douse(rt, i), { r: 3.4, hold: 1.8 });
    });
    const mk = (x, z, n2, name) => {
      const g = enemyGroup(rt, { faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 6, morale: 80, fleeDir: { x: Math.sign(x) || 1, z: -1 }, dmgMult: 0.66, speed: 2.8 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', flag: null } }, { type: 'ashigaru', n: n2 }], IGA));
      return g;
    };
    F.raiders = [mk(-30, 20, 7, '忍び込んだ伊賀衆'), mk(30, 50, 6, '忍び込んだ伊賀衆')];
    F.raiders.forEach((g, i) => rt.marker('r' + i, centerOf(g), () => `伊賀衆・${moraleWord(g.morale)}`, { red: true, group: g }));
    rt.after(40, () => { if (F.step === 1) { const g = mk(-10, 70, 6, '裏から来た伊賀衆'); F.raiders.push(g); rt.marker('r2', centerOf(g), () => `伊賀衆・${moraleWord(g.morale)}`, { red: true, group: g }); rt.say('足軽', '陣の裏からも！', 2); } });
  },
  douse(rt, i) {
    const F = rt.flags;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fires[i]);
    sfx('wood', 0.4);
    F.doused++;
    rt.award((t) => t.side.push('夜討ちの火を消した'), '火を消した');
  },

  // 夜討ちを退けても追い散らさない。山道へ進む前に、陣の口を固める。
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 1.5) return;
    F.step = 1.5;
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); rt.unmark('r' + i); if (F.fires[i]) rt.world.removeFire(F.fires[i]); }
    retireRaid(rt, F.raiders);
    rt.obj('main', '陣の口で組をそろえ、次の夜討ちに備えよ', 'main');
    depthStart(rt, igaCtx(rt), igaA(), () => { rt.objRemove('dp'); this.assault(rt); });
  },

  // 南の守りへ取り付く。強い土塁と空堀が、正面攻めを押し返す。
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('gate');
    applyLook(rt, DAWN); rt.world.lookDark = false;
    rt.world.setTime('morning');
    sfx('horagai', 1);
    rt.banner('南の土橋へ', '空堀の間の道を押さえ、木戸の組を守る');
    rt.obj('main', HI(rt) ? '組を率い、南の土橋で木戸の組を守れ' : '南の土橋で木戸の組を守れ', 'main');
    rt.say('丹羽長秀', '南は堀と土塁が深い。道の印へ進め。木戸の組を、林からの敵に渡すな', 5);
    F.gate.noTarget = true;
    F.bridge = { x: 0, z: -48 };
    rt.marker('bridge', F.bridge, '南の土橋', { h: 3 });
    rt.zone('bridge', 0, -48, 12);
    F.bridgeT = 0;
    for (const [g, x] of [[F.ram, 0], [F.niwa, 7], [F.tsutsui, -10]]) {
      g.order = 'move'; g.dest = { x, z: -42 }; g.speed = 2.3;
      g.onArrive = (q) => { q.order = 'hold'; q.aggro = 16; };
    }
    F.wallBow = enemyGroup(rt, { faction: 'saito', name: '土塁の伊賀衆', anchor: { x: FORT.x, z: F.gz - 4 }, facing: 0, width: 14, aggro: 34, noRout: true, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5 },
      dress([{ type: 'bow', n: 6 }, { type: 'gun', n: 2 }], IGA));
    for (const u of F.wallBow.units) if (u.type === 'gun') u.dmg *= 0.4;
    F.lines = lines(rt, [
      { x: -48, z: -55, facing: Math.PI, w: 28, seed: 15821, A: ['oda', 0x2b3140, 1200, 'oda'], B: ['maru', IGA.armor, 350, 'saito'], flagRateB: 0, bowsB: true, surge: false },
      { x: 48, z: -55, facing: Math.PI, w: 28, seed: 15822, A: ['eiraku', 0x2b3140, 1200, 'oda'], B: ['maru', IGA.armor, 350, 'saito'], flagRateB: 0, gunsB: true, surge: false },
    ]);
    for (const c of F.lines) { c.go(); c.push('B', 0.55); }
    F.igun = allyGroup(rt, { name: '丹羽の鉄砲組', anchor: { x: 14, z: -32 }, facing: Math.PI / 2, width: 10, aggro: 4, noRout: true }, dress([{ type: 'gun', n: 6 }], ODA));
    volleyAt(rt, { guns: () => [F.igun], foes: () => [F.sally], who: '丹羽長秀', near: 26, drop: 22, max: 55, line: '林の口へ放て！　土橋から敵を押し返せ' });
    rt.after(20, () => {
      if (F.step !== 2) return;
      F.sally = enemyGroup(rt, { faction: 'saito', name: '林から出た伊賀衆', anchor: { x: 32, z: -46 }, facing: -Math.PI / 2, order: 'attack', seekRange: 50, aggro: 14, width: 10, morale: 85, fleeDir: { x: 1, z: -1 }, dmgMult: 0.64 }, dress([uS(2), uA(10)], IGA));
      F.sally.focus = F.ram.units.find((u) => u.alive) || null;
      KIT.backOf(rt, F.sally, { flag: 'maru', armor: IGA.armor, w: 18, depth: 10, count: 180, seed: 15823 });
      rt.say('足軽', '東の林から出た！　土橋の組を守れ！', 3);
    });
    rt.after(45, () => { if (F.step === 2) { for (const c of F.lines) c.volley('B'); rt.say('丹羽長秀', '土塁の上から撃ち下ろすぞ。堀へ降りるな。土橋を保て', 4); } });
  },

  // 攻めあぐねた正面を離れ、麓を囲む。撤退と敗走は共通の仕掛けに任せる。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    rt.unmark('bridge'); rt.unzone('bridge');
    rt.obj('main', '陣の口へ退き、組をそろえて山の麓を囲め', 'main');
    if (F.bridgeT >= 20 && F.ram.count > 0) rt.award((t) => t.side.push('南の土橋で木戸の組を守った'), '南の土橋を保った');
    for (const g of F.oda) { g.order = 'retreat'; g.anchor = { x: CAMP.x, z: CAMP.z }; g.dest = null; g.onArrive = null; }
    for (const c of F.lines) { c.push('A', -0.5); c.shake('A', 12); }
    battleEvent(rt, EVENT_RETREAT, F.bridge, F.niwa, 0, true, '正面攻めをやめ、山の麓を囲む');
    if (F.sally) retireRaid(rt, [F.sally]);
    F.igun.order = 'retreat'; F.igun.anchor = { x: 14, z: 30 }; F.igun.holdFire = false;
    rt.say('丹羽長秀', '土塁は破れぬ。下がって麓を囲め。陣の口を守るぞ', 5);
    depthStart(rt, igaCtx(rt), igaB(), () => { rt.objRemove('dp'); this.withdraw(rt); });
  },

  withdraw(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('withdraw');
    // 北は裏の尾根への出口。柏原そのものを北に置くわけではない。
    for (const q of [...F.ring, ...F.castleC.walls]) if ((q.seg[1] + q.seg[3]) / 2 < FORT.z - FORT.r * 0.8 && q.alive) { q.alive = false; q.hp = 0; rt.army.structFall(q); }
    F.wallBow.noRout = false; F.wallBow.order = 'retreat'; F.wallBow.anchor = { x: KITASOTO.x, z: KITASOTO.z - 25 }; F.wallBow.dest = null; F.wallBow.morale = 38;
    for (const c of F.lines) c.rout('B', { hideAfter: 24, minFight: 0 });
    battleEvent(rt, EVENT_RETREAT, FORT, F.wallBow, 1, true, '城の守り手が、夜の尾根へ退いていく');
    rt.world.addSmokeColumn(FORT.x + 10, rt.world.heightAt(FORT.x + 10, FORT.z) + 3, FORT.z, { size: 1.4 });
    rt.obj('main', '夜明けまで陣の口を守れ。山中へ追うな', 'main');
    rt.say('伝令', '城の裏へ人影が続いておりまする。木戸の鉄砲も止み申した', 4);
    rt.after(24, () => { if (F.step !== 3) return; for (const u of F.wallBow.units) if (u.alive) rt.army.despawn(u); this.inside(rt); });
  },

  // 無人になった木戸を開け、複数の曲輪を調べる。最後の衆・奪回軍は作らない。
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5;
    // 夜の退去で曲輪が空く。遠景の守りも残さない。
    for (const h of F.jinHosts) if (h.army.team === 1) h.visible = false;
    rt.setPhase('inside');
    applyLook(rt, DAWN); rt.world.lookDark = false; rt.world.setTime('morning');
    F.gate.hp = F.gate.maxHp = 1500;
    rt.army.damage(F.gate, 99999, null);
    rt.obj('main', '開いた木戸から、主郭と北の曲輪を調べよ', 'main');
    rt.banner('城の射撃が止んだ', '木戸を開き、空いた曲輪を確かめる');
    rt.say('丹羽長秀', '夜のうちに城を捨てたか。主郭から北の曲輪へ進め。伏兵がいないか確かめよ', 5);
    depthStart(rt, igaCtx(rt), [
      move({ to: { x: 0, z: F.gz + 5 }, r: 7, max: 60, label: '南の木戸', obj: '山道を上り、開いた南の木戸へ進め' }),
      move({ to: SHU, r: 9, max: 45, label: '主郭', obj: '木戸をくぐり、寺跡の主郭を調べよ' }),
      move({ to: KITA, r: 9, max: 45, label: '北の曲輪', obj: '空堀の道を越え、北の曲輪を調べよ', say: [['足軽', '堂も空じゃ。北の曲輪へ、足跡が続いておる', 4]] }),
      rest({ dur: 8, fn: (r) => r.obj('main', '北の曲輪で組をそろえ、物見の報せを待て', 'main'), say: [['伝令', '比自山に敵影なし。柏原へ移ったとの報せにござる', 4]] }),
    ], () => { rt.objRemove('dp'); this.win(rt); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.obj('main', '比自山城の曲輪を押さえた', 'main'); rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '比自山城を押さえた', pts: 20 }; }, '任務達成・比自山城を押さえた');
    sfx('horagai', 0.6);
    rt.banner('比自山城を押さえた', '幾度も攻めを退けた伊賀衆は、夜のうちに城を離れた');
    rt.say('丹羽長秀', `${nm(rt)}、山の守りと夜討ちを侮るな。城の口へ組を置け`, 4);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 山麓の集落→森→外郭→堀切→主尾根→主郭、と進む流れの呼び名（足軽のいる所で変わる）
  stageOf(z) { return z > 30 ? '山麓の集落' : z > 5 ? '森の道' : z > -40 ? '外郭' : z > -62 ? '堀切' : z > FORT.z + FORT.r ? '主尾根' : '主郭'; },
  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    // 印を調べるための毎コマの配列コピーは作らない。
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    if (F.step === 1) {
      const L = F.raiders || [];
      rt.objProgress('main', `火 ${3 - F.doused}か所・伊賀衆 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 火が残ったまま待たせきりにしない：丹羽が場所とやり方を言い、それでも来なければ足軽が消す
      const w = rt.t - F.stepT, foes = L.length >= 3 && L.every(gone);
      if (F.doused < 3 && w > 55 && !F.nudge) { F.nudge = true; rt.say('丹羽長秀', `${nm(rt)}、火がまだ残っておる！　燃える小屋の前で「水を掛けて火を消す」を長く押せ`, 4); }
      if (F.doused < 3 && foes && w > 100 && !F.helped) { F.helped = true; rt.say('足軽', '残りの火は、我らが桶で消しまする！', 3); for (let i = 0; i < 3; i++) if (rt.interacts.some((q) => q.id === 'f' + i)) { rt.uninteract('f' + i); rt.unmark('f' + i); rt.world.removeFire(F.fires[i]); F.doused++; } }
      if ((w >= 60 && F.doused >= 3 && foes) || w > 105) this.midA(rt);
    }
    if (F.step === 2) {
      const p = rt.player.u.pos, left = Math.max(0, Math.ceil(75 - (rt.t - F.stepT)));
      if (Math.hypot(p.x - F.bridge.x, p.z - F.bridge.z) < 24) F.bridgeT += dt;
      rt.objProgress('main', `土橋を保つ あと${left}秒・木戸の組 ${F.ram.count}人`);
      if (!F.ram.count && !F.ramLost) { F.ramLost = true; rt.say('丹羽長秀', '木戸の組が崩れた！　その方は土橋を保ち、味方が退く道を空けよ', 4); }
      if (F.sally && F.sally.count < 4 && !gone(F.sally)) { F.sally.noRout = false; F.sally.morale = Math.min(F.sally.morale, 20); }
      if (rt.t - F.stepT >= 75) this.midB(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    // 同じ名の隊がいくつも崩れる時に、同じ台詞を続けて言わない（20秒に一度）
    const F = rt.flags;
    if (F.routSayT != null && rt.t - F.routSayT < 20) return;
    F.routSayT = rt.t;
    rt.say('足軽', rt.flags.step >= 2 ? `${g.name}が山へ退いた` : `${g.name}が闇に消えた`, 2.5);
  },
  onStructHit(rt, s) {
    if (s === rt.flags.gate && rt.flags.step < 3.5) s.hp = s.maxHp;
  },
  onStructDestroyed(rt, s) {
    if (s !== rt.flags.gate) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();
    sfx('wood', 1.2);
  },
};

// 上の札は比自山周辺の推定兵力。伊賀全土の四万余を、この一城の兵と混ぜない。
iga.force = (rt) => ({ a: Math.max(0, 15000 - (rt.flags.ak || 0)), a0: 15000, b: rt.flags.step >= 3.5 ? 0 : Math.max(0, 3500 - (rt.flags.ek || 0)), b0: 3500 });
iga.sides = { a: { name: '織田の包囲勢（推定）', mon: 'oda' }, b: { name: '比自山の伊賀衆（推定）', mon: 'maru' } };
iga.famous = [{ name: '蒲生氏郷', team: 0, g: /木戸/, loose: 1, line: '蒲生氏郷じゃ。南の土橋を固めよ！' }];
iga.date = (rt) => `天正九年九月　秋・${rt.flags.step === 2 || rt.flags.step >= 3.5 ? '朝' : '夜'}`;
iga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '見張りを始める' : '');
iga.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
iga.history = '信長公記巻十四は、天正九年九月三日、信雄らが甲賀・信楽・加太・大和などの口から伊賀へ入ったと記す。九月十一日の夜間退去は佐奈具の城の記録で、比自山の落城日とは別である。比自山の詳しい攻防は後世の伊乱記で補い、蒲生氏郷・堀秀政・筒井順慶らの包囲、繰り返す攻めへの抵抗、夜討ち、夜の城の放棄を描いた。守り手は柏原へ移ったとも伝わる。城跡は寺跡を使い、比高約百五十メートル、南北約三百五十メートルに曲輪と空堀が続く。南辺の土塁と空堀が強く、守りの正面と考えられる。丹羽の一組の役割、各隊の場所、陣の小屋の消火、土橋の鉄砲、時間配分は遊びのための復元。兵数には諸説あり、札の味方一万五千・守り三千五百は比自山周辺の推定で、伊賀全土の総勢でも、城に逃れた非戦の者を含む数でもない。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。 曲輪の守将の名と家紋は確定せず、丸の旗を代用した。';

// 任務の印へ向かう自動の遊び手。
iga.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) {
    depthBot(b, inp, goTo);
    // 中央で待つだけでは、味方の列の外で始まった打ち合いに届かない。
    if (F.dp.cur?.s.kind === 'hold' && !F.dpBack) igaFightBot(b, inp, goTo, F.dp.cur.at, 30);
    return;
  }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, CAMP.x, CAMP.z + 8, 2); return; }
  const post = F.step === 2 ? F.bridge : CAMP;
  if ((F.step === 1 || F.step === 2) && igaFightBot(b, inp, goTo, post, F.step === 2 ? 24 : 44)) return;
  inp.guardHold = false;
  if (F.step === 1) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('f')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); return; }
  }
  if (F.step === 2) { goTo(p, inp, 0, -48, 4); return; }
  goTo(p, inp, CAMP.x + 4, CAMP.z, 3);
};

// 持ち場の周りの、同じ高さで道が通る敵だけを迎える。敗走や城内の守り手は追わない。
function igaFightBot(b, inp, goTo, post, radius) {
  const p = b.player, u = p.u;
  const e = b.army.nearestEnemy(u, 30, (o) => !o.fleeing && !o.noTarget && !o.invuln && o.type !== 'dummy' &&
    o.pos.z > b.flags.gz + 0.8 && Math.hypot(o.pos.x - post.x, o.pos.z - post.z) <= radius &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false));
  if (!e) return false;
  const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  inp.k.delete('KeyE');
  goTo(p, inp, e.pos.x, e.pos.z, 2.4);
  p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
  inp.leftPressed = !inp.guardHold && d < 3.2 && Math.random() < 0.5;
  return true;
}

// 陣の口は自分の組が守り、ほかの手は後ろを支える。三隊が中央に重なると、
// 小勢の夜討ちが自分の槍へ届く前に片付いてしまう。兵を増やさず、守る列を分ける。
function igaHold(o) {
  const s = hold(o), start = s.start;
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    for (let i = 0; i < rt.flags.oda.length; i++) {
      const g = rt.flags.oda[i];
      g.anchor = { x: C.at.x + (i - 1) * 14, z: C.at.z + 18 };
      g.aggro = 8;
    }
  };
  return s;
}

// 段を終えた夜討ちの隊は闇へ退く。八秒だけ敗走を見せて、次の波の実兵枠を空ける。
function retireRaid(rt, groups) {
  for (const g of groups || []) {
    g.noRout = false; g.morale = 0; g.focus = null;
    rt.after(8, () => { for (const u of g.units) if (u.alive) rt.army.despawn(u); });
  }
}

function igaCtx(rt) {
  const F = rt.flags;
  // 波は最大二十人前後。遠景の実兵化・自動の増援を止め、旗本百人がいる遊び方でも約250人以内。
  return { faction: 'saito', flag: 'maru', armor: IGA.armor, dmg: 0.64, scale: 1, look: (l) => dress(l, IGA), friends: () => F.oda };
}
function igaA() {
  return [
    rest({ dur: 8, say: [['丹羽長秀', '火を消したら陣の口を固めよ。闇の林へ追い出すな', 4]] }),
    igaHold({ at: CAMP, dur: 70, r: 16, title: '陣の口を守れ', sub: '山から下りた伊賀衆が、左右の林へ回る', label: '陣の口', obj: '陣の口を守り、左右からの夜討ちを退けよ',
      waves: [
        { t: 5, say: ['足軽', '右の林から！　陣の火を背に、槍を向けよ'], foes: () => [{ name: '東の林の伊賀衆', from: { x: 48, z: 30 }, list: [uS(1), uA(8)], mass: 180 }] },
        { t: 30, say: ['足軽', '左からも来る！　山道へ追うな'], foes: () => [{ name: '西の林の伊賀衆', from: { x: -48, z: 50 }, list: [uS(1), uA(8)], mass: 180 }] },
        { t: 52, say: ['丹羽長秀', '後ろの道にも槍を向けよ。陣の口を空けるな'], foes: () => [{ name: '陣の裏の伊賀衆', from: { x: 0, z: 85 }, list: [uA(8)], mass: 120 }] },
      ], reward: '陣の口で夜討ちを退けた', onEnd: (rt) => retireRaid(rt, rt.flags.dp.cur.groups) }),
  ];
}
function igaB() {
  return [
    rest({ dur: 8, banner: ['山の麓を囲む', '正面攻めから、陣の口を守る戦へ'], fn: (rt) => {
      applyLook(rt, NIGHT); rt.world.lookDark = true; rt.world.setTime('night');
      battleEvent(rt, EVENT_MESSENGER, CAMP, null, 0, true, '蒲生・堀・筒井の手が山の麓を囲んだ');
      for (const c of rt.flags.lines) c.push('A', 0.25);
    } }),
    igaHold({ at: CAMP, dur: 70, r: 16, title: '包囲の夜', sub: '城から出た伊賀衆が、麓の陣へ切り込む', label: '陣の口', obj: '陣の口を守れ。城から出る伊賀衆を押し返せ',
      say: [['丹羽長秀', '蒲生・堀・筒井の手も山を囲む。陣の口を保ち、城から出る敵を止めよ', 5]],
      waves: [
        { t: 8, say: ['足軽', '城の道から来る！'], foes: () => [{ name: '城から出た伊賀衆', from: { x: 0, z: -6 }, list: [uS(2), uA(8)], mass: 240 }] },
        { t: 36, say: ['足軽', '西へ回った敵が、陣の横を突くぞ！'], foes: () => [{ name: '林を回った伊賀衆', from: { x: -46, z: 32 }, list: [uS(1), uA(9)], mass: 200 }] },
      ], reward: '包囲の陣を夜討ちから守った', onEnd: (rt) => {
        retireRaid(rt, rt.flags.dp.cur.groups);
        battleEvent(rt, EVENT_UNIT_BREAK, CAMP, null, 1, true, '夜討ちの隊が、山へ退いた');
      } }),
  ];
}

export { iga };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: -130, tx: 0, tz: -80, w: 45, R: 110, rise: 55 };

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(heightRaw, [switchback([CAMP.x, CAMP.z], [FORT.x, FORT.z + FORT.r], 6, 28)]);
  return BENCHED(x, z);
}
