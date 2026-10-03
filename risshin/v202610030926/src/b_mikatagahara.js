// ======================================================================
// 織田家編　三方ヶ原の戦い（元亀三年十二月二十二日）
// 西へ攻め上る武田信玄の二万五千が、遠江の三方ヶ原を通り過ぎようとした。徳川家康は浜松城から打って出て、
// 信長が送った援軍（佐久間信盛・平手汎秀・滝川一益ら三千ほど）とともに挑んだが、夕暮れの一刻ほどで大敗した。
// 織田の援軍の平手汎秀は討ち死にし、家康は浜松城へ逃げ帰った。
// 足軽は平手汎秀の手（織田の援軍）。①夕暮れの台地で武田の先手を受け止める ②赤備えの騎馬に崩される
// ③平手の討ち死に。浜松城へ退く（追ってくる武田勢を振り切る）
// 向き：北（-z）から武田勢が来る。南（+z）の台地の下に浜松城
// ======================================================================
import { nobori, hut, tawara, campfire, solidSeg } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { jinchiTick } from "./yasen_jinchi.js";
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { dress, gone, more, applyLook, NIGHT } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold, move } from './b_depth.js';
import { volleyScene } from './b_shiga.js';
import { camp } from './b_mid.js';
import { demSample } from './dem.js';
import { butaiTick } from './butai.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { fieldButai, fieldTick, routButai } from './b_yasen.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const AR = KIT.ARMOR;
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const LINE_Z = -20;                        // 織田の援軍の陣
const HAMA = { x: 20, z: 170 };            // 浜松城の方（退く先）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };
const AKA = { flag: 'akazonae' };
const TOKU = { flag: 'tokugawa' };
// 薄暮（夕刻と夜のあいだ）：赤備えの突撃のころ。灯りが少なく、松明・旗・音が頼りになってくる
const TWILIGHT = { sky: 0x4c4a5c, fog: 0x45465a, sun: 0xd8a070, sunI: 0.9, hs: 0x9a9aae, hg: 0x3a3030, hI: 1.1, top: 0x232a40, glow: 0.12, dir: [0.8, 0.16, -0.4], mount: 0x1a1e28 };

// 国土地理院の標高（三方原の台地。束0 の asset_dem_mikatagahara.js）。ゲームの 1 を実の 4m に縮め、
// 台地の上のゆるい起伏（北が少し高い）だけを手書きの base に足す
let mkDem = null;
import('./asset_dem_mikatagahara.js').then((m) => { mkDem = m.default; }).catch(() => {});
const DEM_XY = 4;
function demRelief(x, z) {
  if (!mkDem) return 0;
  const sx = x * DEM_XY, sz = z * DEM_XY;
  if (Math.abs(sx) > 1580 || Math.abs(sz) > 1580) return 0;
  return (demSample(mkDem, sx, sz) - 30) * 0.7;
}
const sig = (v) => 1 / (1 + Math.exp(-v));
// 犀ヶ崖（台地の南の端に刻まれた深い谷）。東の端は浅く、道はその東を下る（崖は登れず、道を通る）
const SAI = { x0: -130, x1: -24, z: 122, hw: 4 };
function saiDepth(x, z) {
  if (x < SAI.x0 - 6 || x > SAI.x1 + 8) return 0;
  const along = Math.min(1, Math.max(0, (SAI.x1 + 8 - x) / 14)) * Math.min(1, Math.max(0, (x - SAI.x0 + 6) / 10));
  const across = Math.max(0, 1 - Math.abs(z - SAI.z) / (SAI.hw + 2));
  return 7 * along * Math.min(1, across * 1.6);
}
const NEARAI = { x: 44, z: -40 };          // 根洗の松の小高い所（右の森の側。取ると赤備えの寄せが見える）
const MURA = { x: -100, z: 72 };           // 台地の上の小さな集落と畑（本隊の通り道を外れた、台地らしい景）
const OIWAKE = { x: -56, z: -44 };         // 追分（三方原台地と祝田坂方向へ道が分かれる所）
function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.02 + 0.3) * Math.cos(z * 0.018) + 0.35 * Math.sin(z * 0.05 + x * 0.03);
  // 三方ヶ原の台地（南の端で下がる）
  h += 8 / (1 + Math.exp((z - 110) / 10));
  // 北の山並み
  h += Math.max(0, -z - 170) * 0.25 + 30 * gauss(x, z, -160, -200, 9000);
  // 祝田の坂：台地の北西の端が都田の谷へ下る（武田勢が下りようとしていた坂）
  h -= 7 * sig((-x - 100) / 10) * sig((-z - 130) / 10);
  // 根洗の小高い所
  h += 4 * gauss(x, z, NEARAI.x, NEARAI.z, 180);
  h += demRelief(x, z);
  h -= saiDepth(x, z);
  return h;
}


// 部隊の軽い大軍を、向きのまま前へ（負なら後ろへ）
function adv(b, d, secs, charge) { if (b && !b.routedL && b.light) b.light.advance(d, secs, { charge: !!charge }); }
// 武田の頭（F7）：始めに決めた手（F.tPlan）で、どの備から前へ出すかを変える
function takedaMove(rt, stage) {
  const F = rt.flags, T = F.bT, P = F.tPlan;
  if (stage === 'first') {
    adv(T.oyamada, 60, 50); adv(T.naito, 40, 50);
    if (P === 'hidari') { adv(T.baba, 70, 45); adv(T.katsuyori, 80, 50); rt.after(9, () => rt.say('物見', '武田の左の備が動いた！　馬場と勝頼の旗が、徳川の鶴翼の端へ回っていきます', 4)); }
    else if (P === 'migi') { adv(T.yamagata, 34, 30); adv(T.baba, 40, 50); rt.after(9, () => rt.say('物見', '武田の右、森の向こうで赤い旗が前へ出ました！', 3.5)); }
    else { adv(T.baba, 50, 50); adv(T.katsuyori, 40, 50); rt.after(9, () => rt.say('物見', '武田は魚鱗のまま、真っすぐ押してきます！', 3.5)); }
  } else if (stage === 'crash') {
    adv(T.oyamada, 20, 30, true); adv(T.baba, 40, 30, true);
    adv(T.katsuyori, P === 'hidari' ? 30 : 50, 30, true); adv(T.yamagata, P === 'migi' ? 36 : 70, 30, true);
  }
}
// 味方の備が崩れる：退き口（浜松城の口）が味方のままなら、台地の端・城の方へ退いて残る。塞がれていれば散り散りに
function allyFall(rt, b, loss) {
  if (!b || b.routedL || b.fallen) return;
  b.fallen = true;
  b.lost = Math.min(b.nominal, b.lost + b.nominal * loss);
  const H = rt.flags.SZ && rt.flags.SZ.byId.hama;
  if (H && H.owner !== ZONE_STATE.FRIEND) { routButai(b, 40); return; }
  // 犀ヶ崖より西の者は、崖の手前（台地の端）で止まって集まり直す（崖は登り下りできぬ）
  const d = Math.max(20, (b.pos.x < SAI.x1 + 4 ? 104 : HAMA.z - 18) - b.pos.z);
  if (b.light) b.light.retreat(d, d / 2.4);
}

// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, label);
}

const mikatagahara = {
  spawn: { x: 8, z: LINE_Z + 10, heading: Math.PI },
  world: {
    seed: 15722,
    time: 'dusk',
    autumn: true,
    muddy: 0.2,
    paths: [[[-10, -200], [0, -60], [6, LINE_Z], [14, 80], [HAMA.x, HAMA.z]]],
    height,
    tint(x, z, h, c) {
      c.lerp({ r: 0.55, g: 0.5, b: 0.38 }, 0.35);
      const d = saiDepth(x, z); if (d > 0.5) c.multiplyScalar(1 - Math.min(0.35, d * 0.05));
      // 集落の周りの畑（台地の緩い起伏に、耕した色を足す。水田でなく畑なので地形の高さは変えない）
      const vd = Math.hypot(x - MURA.x, z - MURA.z);
      if (vd < 30) c.lerp({ r: 0.5, g: 0.4, b: 0.22 }, 0.3 * Math.max(0, 1 - vd / 30));
    },
    clear: (x, z) => (Math.abs(x) < 110 && z > -120 && z < 150) || Math.hypot(x + 30, z + 152) < 22,
    trees: 300,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 160 ? 0.08 : 0.7),
    groves: [{ x: -80, z: 40, r: 14, n: 18 }, { x: 80, z: -40, r: 14, n: 18 }, { x: 60, z: 100, r: 12, n: 14 }],
    terrainTags: true,   // F1：坂・森・道で速さと疲れが変わる（terrain_tags.js）
    fleeOut: (x, z, team) => team === 1 && z < -160,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { plateau: 'HIST_A', saigagake: 'HIST_A', gyorin: 'HIST_B', kakuyoku: 'HIST_B', hamamatsuFar: 'GAME_C', ifWin: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0;
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 11000, 25000);
    // ---- 織田の援軍：平手汎秀の手（自分の持ち場）、佐久間信盛の手 ----
    F.hirate = allyGroup(rt, { name: '平手汎秀の手', anchor: { x: 0, z: LINE_Z }, facing: Math.PI, width: 16, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '平手汎秀', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 3 }], ODA));
    F.hiraU = F.hirate.units[0];
    F.saku = allyGroup(rt, { name: '佐久間信盛の手', anchor: { x: 30, z: LINE_Z + 20 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.toku = allyGroup(rt, { faction: 'tokugawa', name: '徳川の手', anchor: { x: -40, z: LINE_Z - 4 }, facing: Math.PI, width: 18, aggro: 10, noRout: true, fleeDir: { x: 0.15, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], TOKU));
    // 平手の鉄砲組（元亀三年、まだ数は少ない）：込めたまま待ち、寄せた所で揃えて放つ
    F.teppo = allyGroup(rt, { name: '平手の鉄砲組', anchor: { x: 14, z: LINE_Z - 3 }, facing: Math.PI, width: 12, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 8 }], ODA));
    F.oda = [F.hirate, F.saku, F.toku, F.teppo];
    // 苦しい戦：一万余りで二万五千に当たる。味方は並の強さ
    for (const g of F.oda) { g.defMult = 1.0; g.dmgMult = 0.75; }
    // 苦しい退き戦：足軽の身でも盾になる小さな組を必ず付ける（比叡山の M8 と同じ。一人で魚鱗の寄せに呑まれないように）
    const n = Math.max(RANKS[rt.G.rank].squad || 0, 6);
    if (n) rt.makeSquad({ x: 10, z: LINE_Z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    for (const [x, z, k] of [[-8, LINE_Z + 6, 'oda'], [8, LINE_Z + 6, 'oda'], [-44, LINE_Z + 4, 'tokugawa'], [34, LINE_Z + 26, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 部隊（butai.js・F4）：史実の備を名と数で。名目は史実のおよそ 1/20。軽い作り（遠くで押し合う）が土台 ----
    // 味方の備は本物を出さない（ごちゃごちゃさせない）。武田の備は自分がすぐそばへ寄った時だけ数人を本物にする
    const fb = (o) => fieldButai(rt, o);
    F.bA = {   // 徳川の鶴翼（左から石川・本多、右の端に酒井。真ん中の右は織田の援軍＝台本の隊と、滝川の手の押し合い）
      ishikawa: fb({ name: '石川数正の備', team: 0, faction: 'tokugawa', kind: 'ashigaru', nominal: 160, armor: AR.tokugawa, flag: 'tokugawa', at: { x: -150, z: LINE_Z - 30 }, facing: Math.PI * 0.9 }),
      honda: fb({ name: '本多忠勝の備', team: 0, faction: 'tokugawa', kind: 'ashigaru', nominal: 120, armor: AR.tokugawa, flag: 'tokugawa', at: { x: -92, z: LINE_Z - 10 }, facing: Math.PI }),
      sakai: fb({ name: '酒井忠次の備', team: 0, faction: 'tokugawa', kind: 'ashigaru', nominal: 160, armor: AR.tokugawa, flag: 'tokugawa', at: { x: 134, z: LINE_Z - 4 }, facing: Math.PI }),
    };
    // 滝川一益らの手（台地の東）：押し合いの軽い作り（plainClash）が始まるまでの見せ場
    F.takiDA = W.addDistantArmy({ x: 80, z: LINE_Z - 6, w: 30, d: 10, count: 180, facing: Math.PI, armor: AR.oda, flagTex: flagTexture('oda'), seed: 15723 });
    for (const [dx, dz, c, sd] of [[-40, -215, 170, 15731], [40, -232, 150, 15732], [0, -252, 140, 15733]]) W.addDistantArmy({ x: dx, z: dz, w: 38, d: 14, count: c, facing: 0, armor: AR.takeda, flagTex: flagTexture('takeda'), seed: sd });   // 縦に三列の大軍（A098）
    F.bT = {   // 武田の魚鱗（先手の小山田、右の山県＝赤備え、左の馬場・勝頼、後ろの内藤）
      oyamada: fb({ name: '小山田信茂の備（先手）', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 250, armor: AR.takeda, flag: 'takeda', at: { x: 0, z: -150 }, facing: 0, realMax: 10 }),
      yamagata: fb({ name: '山県昌景の赤備え', team: 1, faction: 'akazonae', kind: 'cavalry', nominal: 200, armor: AR.akazonae, flag: 'akazonae', at: { x: 70, z: -150 }, facing: -0.05, realMax: 8 }),
      baba: fb({ name: '馬場信春の備', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 220, armor: AR.takeda, flag: 'furin', at: { x: -80, z: -140 }, facing: 0.2, realMax: 10 }),
      katsuyori: fb({ name: '武田勝頼の備', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 260, armor: AR.takeda, flag: 'furin', at: { x: -140, z: -146 }, facing: 0.4, realMax: 10 }),
      naito: fb({ name: '内藤昌豊の備（後詰）', team: 1, faction: 'takeda', kind: 'ashigaru', nominal: 180, armor: AR.takeda, flag: 'takeda', at: { x: 30, z: -178 }, facing: 0, realMax: 10 }),
    };
    F.allB = [...Object.values(F.bA), ...Object.values(F.bT)];
    // 武田の頭（F7）：毎回少し違う手を打つ。正面で押す／左（徳川の鶴翼の端）を回る／右（森の側）から赤備えを先に出す
    F.tPlan = ['naka', 'hidari', 'migi'][Math.floor(Math.random() * 3)];
    // 武田の本陣（北の奥）：武田信玄と旗本。控えは軽い兵
    F.campB = camp(rt, { x: -30, z: -152, facing: 0, team: 1, faction: 'takeda', mon: 'takeda', armor: AR.takeda, general: { name: '武田信玄', hat: 'kabuto_m', haori: 0x8a1a14 }, depth: true, guard: 15, reserve: 300, runTo: { x: 0, z: -70 } });
    // 徳川の本陣（鶴翼の後ろ）：徳川家康と旗本。鶴翼が破れると浜松城へ退く
    F.campA = camp(rt, { x: -64, z: 12, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: AR.tokugawa, general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x6a5a2a }, guard: 15, reserve: 0, runTo: { x: -40, z: LINE_Z - 4 } });
    // 本陣の旗本は、整った陣形のまま静かに待つ（寄ってきた敵にだけ向き直る。前へ出て乱れない）
    for (const H of [F.campA, F.campB]) for (const g of [H.guard, H.general && H.general.group]) if (g && g.count) { g.order = 'hold'; g.formation = 'line'; g.aggro = 6; g.seekRange = 10; }
    // 犀ヶ崖の両の縁（崖は登れぬ。人も馬も東の道へ回る）
    for (let x = SAI.x0; x < SAI.x1; x += 8) { const x2 = Math.min(SAI.x1, x + 8); solidSeg(x, SAI.z - SAI.hw - 1, x2, SAI.z - SAI.hw - 1); solidSeg(x, SAI.z + SAI.hw + 1, x2, SAI.z + SAI.hw + 1); }
    // ---- 場の取り合い（siege_zones.js・F6）：根洗の小高い所（取ると赤備えの寄せが見え、受けやすい）・浜松城の口（退き口） ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'oka', name: '根洗の小高い所', test: (x, z) => Math.hypot(x - NEARAI.x, z - NEARAI.z) < 12, pos: NEARAI, need: 4, hold: 8, start: ZONE_STATE.NEUTRAL },
        // kaito 10/1：hold を 14→10 に詰めた（遊んで10分ほどかかる戦を4〜7分に）
        { id: 'hama', name: '浜松城の口', test: (x, z) => Math.hypot(x - HAMA.x, z - HAMA.z) < 14, pos: HAMA, need: 10, hold: 10, start: ZONE_STATE.FRIEND },
      ],
      links: [['oka', 'hama']],
      friendTeam: 0, enemyTeam: 1,
      onFall: (id) => this.onZoneFall(rt, id),
    });
    // 三方原台地の小さな集落と畑（本隊の通り道を外れた西側。台地が競技場でなく人の暮らす野だと分かるように）
    rt.scene.add(hut(W, MURA.x, MURA.z, 6, 5, 0.2, { h: 2.6 }));
    rt.scene.add(hut(W, MURA.x + 10, MURA.z - 6, 5, 4, 0.5, { h: 2.4 }));
    rt.scene.add(tawara(W, MURA.x - 6, MURA.z + 6, 0.3, 5));
    // 追分（台地へ上る道と、祝田坂方向へ下る道が分かれる所。戦の初めだけ示す）
    rt.marker('oiwake', OIWAKE, '追分（祝田坂方向への分かれ道）', { h: 2 });
    rt.after(20, () => rt.unmark('oiwake'));
    // 浜松城の方（遠く、南）
    rt.scene.add(hut(W, HAMA.x, HAMA.z + 14, 14, 9, 0.1, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[HAMA.x - 8, HAMA.z], [HAMA.x + 8, HAMA.z]]) { rt.scene.add(nobori(W, x, z, 'tokugawa', 6)); rt.scene.add(campfire(W, x, z + 4)); W.addFire(x, z + 4); }

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '平手汎秀の援軍の一手を預かり、陣の右を固めよ' : '平手汎秀のもとで、陣を固めよ', 'main');
    rt.say('平手汎秀', `${nm(rt)}、あれが武田信玄の軍勢じゃ。二万五千。……こちらは徳川と合わせて一万余り`, 5);
    rt.say('平手汎秀', '殿（信長公）の名代として来た以上、背を見せるわけにはゆかぬ。槍を揃えよ', 4);
    rt.marker('hira', unitPos(F.hiraU), '平手汎秀', {});
    rt.after(16, () => this.first(rt));
  },

  // ① 武田の先手を受け止める
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    rt.unmark('hira');
    sfx('taiko', 1); rt.after(1, () => sfx('horagai', 0.8));
    rt.banner('武田の先手', '石を投げつけ、そのあとから槍が来る');
    rt.obj('main', '武田の先手を受け止めよ', 'main');
    takedaMove(rt, 'first');
    F.w1 = enemyGroup(rt, { faction: 'takeda', name: '武田の先手', anchor: { x: 4, z: -66 }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 18, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt, 0.4) }, { type: 'bow', n: 4 }], TAKEDA));
    rt.marker('w1', centerOf(F.w1), () => `武田の先手・${moraleWord(F.w1.morale)}`, { red: true, group: F.w1 });
    rt.say('平手汎秀', '来るぞ！　動くな、槍先を下げよ！', 3);
    // 武田の縦の深さ：第一線（小山田・馬場）→第二線（勝頼・山県）→後詰（内藤）
    rt.after(12, () => rt.say('物見', '武田は三重に縦に連なっております。先手は小山田・馬場、後ろに勝頼・山県', 4.5)); rt.after(17, () => rt.say('物見', 'さらに後詰の内藤。台地の奥まで旗が続いておりまする', 4.5));
    // 勝ち筋：勝てぬ戦。台地の南の坂を下れば浜松城。生きて退く道をはじめに示す
    rt.after(6, () => rt.say('佐久間信盛', '崩れた時は、台地の南の坂を下れ。浜松の城が退き口じゃ', 3.5));
    rt.after(80, () => { if (!rt.over) rt.marker('exit', { x: 14, z: 56 }, '退き口（台地の南）', { h: 2 }); });   // 戦う前から退く場所を示さない（A097）
    rt.after(40, () => rt.unmark('exit'));
    volleyScene(rt, { guns: () => [F.teppo, F.hirate], at: { x: 4, z: LINE_Z - 6 }, r: 30, who: '平手汎秀', shots: 2,
      banner: ['一斉射', '平手の鉄砲が、石を投げる先手の頭を叩く'] });
  },

  // 段を重ねる（b_depth.js）：A 魚鱗の寄せ（先手の後）→ B 平手の最期（赤備えの後）→ C 犀ヶ崖（城へ逃げ込んだ後）
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true; F.dpOn = true;
    for (const k of ['w1', 'aka']) rt.unmark(k);
    if (which === 'A') this.plainClash(rt);
    // 赤備えは駆け抜けて、徳川の鶴翼の方へ去る（平手の手を包むのは武田の本隊）
    // 城へ入れば、追手は篝火を怪しんで退く（門を守る段・夜討ちの段は新しい敵で）
    if (which === 'C') for (const q of F.chase || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    if (which === 'B' && F.aka && !gone(F.aka)) { F.aka.order = 'hold'; F.aka.anchor = { x: -70, z: -60 }; F.aka.aggro = 6; rt.bark('赤備えが駆け抜けていく……徳川の手の方へ'); }
    depthStart(rt, mkCtx(rt), which === 'A' ? mkA() : which === 'B' ? mkB() : mkC(), () => {
      F.dpOn = false;
      if (which === 'A') { if (this.checkIfWin(rt)) this.ifTurn(rt); else this.crash(rt); }
      else if (which === 'B') this.retreat(rt);
      else this.win(rt);
    });
  },

  // IF の勝ち（68・81 章）：史実どおり追い込まれるのでなく、戦い方で武田の前進を止められる。
  // 無理に先手を追わず（F.overchase）・根洗の小高い所を取り側面へ圧力（F.okaHeld）・右を固める軍議（F.strategy）
  // ・武田の先手を着実に崩し（F.ek）・徳川の中央を保つ（F.toku の士気）の内 3 つ以上で、押し返す
  checkIfWin(rt) {
    const F = rt.flags;
    if (F.overchase) return false;
    let score = 0;
    if (F.okaHeld) score++;
    if (F.strategy === 'migi') score++;
    if ((F.ek || 0) >= 22) score++;
    if (F.toku && F.toku.count && F.toku.morale > 45) score++;
    return score >= 3;
  },
  ifTurn(rt) {
    const F = rt.flags;
    if (F.ifOn) return;
    F.ifOn = true;
    rt.setPhase('ifturn');
    sfx('horagai', 0.6);
    rt.banner('武田、足を止める', '側面を突かれ、備を崩されて、魚鱗の寄せが止まった');
    rt.obj('main', '崩れた武田の備へ、なお圧せよ', 'main');
    rt.say('平手汎秀', '……退いていく？　好機ぞ、このまま押し包め！', 3.5);
    for (const k of ['oyamada', 'baba', 'katsuyori']) { const b = F.bT[k]; if (b && !gone(b)) { b.order = 'hold'; b.morale = Math.max(0, b.morale - 40); } }
    if (F.cl) F.cl.rout('B', { hideAfter: 12 });
    rt.after(10, () => this.ifWin(rt));
  },
  ifWin(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('oiwake');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '任務達成・三方ヶ原で武田の前進を止めた');
    rt.award((t) => { t.special = { label: 'IFの勝ち：武田の進撃を止めた', pts: 40 }; }, 'IFの勝ち');
    sfx('horagai', 0.6);
    rt.banner('三方ヶ原、味方の勝ち', '武田の魚鱗が崩れて退いていく');
    rt.say('平手汎秀', `${nm(rt)}の働き、しかと見た。殿（信長公）へ、良きご注進ができるぞ`, 5);
    rt.after(6, () => rt.say('', '――史実では家康は大敗したが、この日の戦い方次第では、違う結末もあり得た', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },
  // 台地の東：滝川一益らの手と武田の大軍が、正面いっぱいに組み合う（軽い作り）。赤備えが来ると崩れる
  plainClash(rt) {
    const F = rt.flags;
    if (F.cl) return;
    if (F.takiDA) F.takiDA.visible = false;
    F.cl = clash(rt, { x: 80, z: -34, facing: Math.PI, w: 56, gap0: 34, closeSpeed: 3.6, seed: 15727, noRout: true, killRate: 0.15,
      surge: { k: 'B', every: 38, count: 160, flank: 0.4 },
      A: { flag: 'oda', armor: AR.oda, count: 380, team: 0, faction: 'oda' },
      B: { flag: 'takeda', armor: AR.takeda, count: 820, team: 1, faction: 'takeda', guns: true, flagRate: 0.5 } });
    F.cl.push('B', 0.35);
    rt.after(1, () => F.cl.go());
  },

  // ② 赤備えの騎馬に崩される
  crash(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('crash');
    rt.unmark('w1');
    sfx('horagai', 1);
    rt.banner('赤備え', '山県昌景の赤い騎馬が、横から突っ込んでくる');
    rt.obj('main', HI(rt) ? '預かった一手を右へ向け直し、赤備えの騎馬を食い止めよ' : '横から来る赤備えの騎馬を食い止めよ', 'main');
    takedaMove(rt, 'crash');
    applyLook(rt, TWILIGHT);   // 夕刻→薄暮→（退き口で）夜
    rt.after(2, () => rt.bark('日が落ちてゆく。見えるのは松明と旗の色、聞こえるのは馬と法螺の音だけだ'));
    F.aka = enemyGroup(rt, { faction: 'akazonae', name: '山県の赤備え', anchor: { x: 70, z: -60 }, facing: -Math.PI * 0.8, order: 'hold', seekRange: 140, aggro: 10, width: 14, morale: 100, noRout: true, fleeDir: { x: 1, z: -1 }, dmgMult: 0.34 },
      dress([{ type: 'busho', n: 1, o: { name: '山県昌景', invuln: true, horse: true } }, { type: 'cavalry', n: 9 + more(rt, 0.2) }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AKA));
    F.aka.units[0].dmg *= 0.4;
    F.aka0 = F.aka.count;
    // 場（根洗の小高い所）と軍議（右を固める）と武田の頭（右から先に出る）で、赤備えの寄せの重さが変わる（F5・F6・F7）
    if (!HI(rt)) F.aka.dmgMult *= 0.75;   // 足軽の身（組は小さい）でも、赤備えの一撃で倒れきらないように
    if (F.okaHeld) { F.aka.dmgMult *= 0.85; rt.after(3, () => rt.bark('小高い所から見えた。赤備えは森の際で馬を揃えておる')); }
    if (F.strategy === 'migi') { F.aka.dmgMult *= 0.8; F.aka.morale = Math.max(40, F.aka.morale - 15); rt.after(24, () => { if (F.step === 2) rt.say('佐久間信盛', '右を固めておいて正解じゃ。赤備えの寄せが鈍いぞ', 3.5); }); }
    // 判断：赤備えをどう受けるか（時間切れは槍衾。受け方で傷と手柄が変わる）。赤備えは森の際で馬を揃えてから駆け出す
    const go = () => { if (F.aka && !gone(F.aka) && F.aka.order === 'hold') { F.aka.order = 'attack'; F.aka.aggro = 18; rt.say('足軽', '駆け出した！　来るぞ！', 2.5); } };
    rt.after(17, go);
    rt.after(1, () => {
      if (F.step !== 2 || F.ending) return;
      rt.choose('赤備えの騎馬が右から来る。どう受ける？', [
        { label: '鉄砲の前で槍衾を組んで受ける', note: '馬を槍先で止める。傷は浅い。鉄砲が馬を撃つ' },
        { label: '森の陰を回り、横腹を突く', note: '騎馬の足が乱れる。手柄は大きい。囲まれやすい' },
      ], (i) => {
        F.mkFlank = i === 1;
        rt.after(i === 1 ? 8 : 3, go);
        if (i === 0) {
          F.aka.dmgMult = 0.26;
          for (const g of [F.hirate, F.saku]) if (g && g.count) { g.order = 'hold'; g.anchor = { x: 14, z: LINE_Z - 2 }; g.aggro = 14; }
          rt.say('平手汎秀', '槍を揃えよ！　馬の胸を狙え。槍の石突きを地に立てよ！', 3.5);
          rt.marker('pike', { x: 14, z: LINE_Z - 2 }, '槍衾の場', { h: 2 });
          rt.after(25, () => rt.unmark('pike'));
        } else {
          rt.say('平手汎秀', '行け！　森の陰から、赤備えの横腹へ回れ！', 3.5);
          rt.marker('pike', { x: 46, z: -44 }, '森の陰（横腹）', { h: 2 });
          rt.after(18, () => { rt.unmark('pike'); if (F.aka && !gone(F.aka)) { F.aka.morale = Math.max(30, F.aka.morale - 30); rt.bark('赤備えの足が乱れた！　横腹を突け！'); } });
        }
      }, 12);
    });
    rt.army.play('gallop', { x: 60, z: -50 }, 1.8);
    rt.marker('aka', centerOf(F.aka), () => `山県の赤備え・${moraleWord(F.aka.morale)}`, { red: true, group: F.aka });
    rt.say('足軽', '赤い騎馬じゃ！　右から来る！', 3);
    // 後ろの赤備えの大軍は、山県の備（部隊の軽い作り）が森の際まで寄せて見せる（takedaMove）
    volleyScene(rt, { guns: () => [F.teppo, F.hirate], at: () => (F.teppo.count ? F.teppo.center() : { x: 4, z: LINE_Z }), r: 34, who: '平手汎秀', shots: 2, hit: 16,
      wait: '騎馬は速い。十分に引きつけよ……', fire: '馬を狙え、放てぇっ！', banner: ['一斉射', '寄せる赤備えの馬を、鉄砲で撃ちすくめる'], clash: () => [F.cl] });
    if (F.cl) { F.cl.cavalry('B', { from: 1, count: 160, flag: 'akazonae', armor: AR.akazonae, delay: 2 }); rt.after(8, () => F.cl.cavalry('B', { from: -1, count: 100, flag: 'takeda', armor: AR.takeda })); rt.after(12, () => F.cl.rout('A', { hideAfter: 20, from: 1 })); rt.after(40, () => F.cl.rout('B', { hideAfter: 8 })); }
    // 鶴翼が破れる早さは、武田の頭の手で変わる（左を回られると早く、右から来ると遅い）
    const tkT = F.tPlan === 'hidari' ? 6 : F.tPlan === 'migi' ? 13 : 10;
    rt.after(tkT, () => { rt.say('足軽', '徳川の手が崩れた……！　鶴翼が破れておる！', 3.5); F.toku.noRout = false; F.toku.morale = 10; allyFall(rt, F.bA.ishikawa, 0.3); allyFall(rt, F.bA.honda, 0.35);
      const H = F.campA; for (const g of [H.general && H.general.group, H.guard]) if (g && g.count) { g.order = 'path'; g.path = [[-30, 60], [HAMA.x - 10, HAMA.z - 8]]; g.pathIdx = 0; g.speed = 3.2; g.noRout = true; g.onArrive = (q) => { q.order = 'hold'; }; } });
  },

  // ③ 平手の討ち死に、浜松城へ退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('retreat');
    rt.unmark('aka');
    if (F.hiraU.alive) { F.hiraU.invuln = false; rt.army.kill(F.hiraU, null); }
    sfx('kane', 0.4);
    rt.banner('平手汎秀、討ち死に', '織田の援軍は崩れ、浜松城へ退く');
    rt.say('佐久間信盛', '退けっ、退けい！　浜松の城まで走れ！　振り返るな！', 4);
    rt.obj('main', HI(rt) ? '崩れた援軍をまとめて殿を務め、浜松城へ退け' : '追ってくる武田勢を振り切り、浜松城へ退け', 'main');
    rt.marker('hama', HAMA, '浜松城', { h: 3 });
    rt.zone('hama', HAMA.x, HAMA.z, 10);
    applyLook(rt, NIGHT);
    for (const g of [F.hirate, F.saku]) { g.order = 'path'; g.path = [[10, 60], [HAMA.x, HAMA.z - 6]]; g.pathIdx = 0; g.speed = 3; g.noRout = true; g.onArrive = (q) => { q.order = 'hold'; }; }
    // 追手
    F.chase = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'takeda', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 3.2 }, dress(list, TAKEDA));
      F.chase.push(g);
      rt.marker('c' + F.chase.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      return g;
    };
    F.mk = mk;
    // 追手は途切れない：足を止めれば、後ろから次々に追いつかれる（城へ入るまで 22 秒ごとに新手）
    rt.after(6, () => mk(-20, 0, '追ってくる武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }]));
    rt.after(34, () => {
      if (F.ending) return;
      const g = mk(30, 40, '回り込んだ武田勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.3) }]);
      // 後ろに武田の本隊（内藤昌豊の後詰の備）が原を埋めて続く（軽い作り）。追手は数人ずつでなく、大軍の先の手として見せる
      adv(F.bT.naito, 160, 60);
      rt.say('足軽', '原いっぱいに武田の旗が……！　振り返るな、走れ！', 3);
    });
    F.chaseT = rt.t + 56; F.chaseN = 0;
    // 家康の逃走：護衛に囲まれて浜松城へ。殿（しんがり）が犀ヶ崖の手前で追手を引き受け、身代わりに討たれる
    const ie = allyGroup(rt, { faction: 'tokugawa', name: '家康と護衛', anchor: { x: -40, z: 30 }, facing: 0, order: 'path', width: 6, noRout: true, speed: 4 },
      dress([{ type: 'samurai', n: 2, o: { name: '徳川家康', horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }], TOKU));
    ie.path = [[-30, 60], [HAMA.x - 10, HAMA.z - 8], [HAMA.x, HAMA.z - 4]]; ie.pathIdx = 0; ie.onArrive = (q) => { q.order = 'hold'; };
    F.ieyasuG = ie;
    const sg = allyGroup(rt, { faction: 'tokugawa', name: '殿の夏目吉信', anchor: { x: -26, z: 20 }, facing: Math.PI, order: 'hold', width: 6, aggro: 14, noRout: false },
      dress([{ type: 'samurai', n: 2, o: { name: '夏目吉信' } }, { type: 'ashigaru', n: 6 }], TOKU));
    F.shingariG = sg;
    rt.after(4, () => rt.say('夏目吉信', '殿を逃がせ！　ここはわしが食い止める！　（身代わりの名乗りを上げる）', 4));
    if (F.aka && !gone(F.aka)) { F.aka.order = 'hold'; F.aka.noRout = false; }
    if (F.w1 && !gone(F.w1)) { F.w1.order = 'hold'; }
    // 右の端の酒井の備も、浜松城へ退く（退き口が塞がれていなければ）
    allyFall(rt, F.bA.sakai, 0.2);
  },

  // 場が動いた時（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags, Z = F.SZ && F.SZ.byId[id];
    if (!Z || F.ending) return;
    if (id === 'oka') {
      F.okaHeld = Z.owner === ZONE_STATE.FRIEND;
      if (F.okaHeld && !F.okaSaid) { F.okaSaid = true; rt.say('佐久間信盛', '根洗の小高い所を取った。ここからなら、森の向こうの武田の動きが見える', 4); }
      else if (!F.okaHeld) rt.bark('根洗の小高い所を、武田に取られた');
    } else if (id === 'hama' && Z.owner === ZONE_STATE.ENEMY) rt.bark('浜松城の口に、武田勢が回り込んだ！');
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= 2; i++) rt.unmark('c' + i);
    for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '任務達成・浜松城へ退いた');
    survival(rt, '三方ヶ原から生きて浜松城へ退いた');
    // 退き戦の勝ち（2 章）：退き口に着いた上で、損の少なさ（味方の備がどれだけ残って城へ入れたか）
    { const al = Object.values(F.bA), n0 = al.reduce((a, b) => a + b.nominal, 0), n1 = al.reduce((a, b) => a + (b.routedL ? 0 : b.aliveNominal()), 0);
      const keep = n0 ? Math.round(n1 / n0 * 100) : 0;
      rt.award((t) => t.side.push(`味方の備が浜松城へ退いた（${keep}% が残る）`), `損の少ない退き（${keep}%）`); }
    sfx('horagai', 0.4);
    rt.banner('浜松城', '城の門は開け放たれ、篝火が焚かれていた');
    rt.say('佐久間信盛', `……生きておったか、${nm(rt)}。平手殿は戻らなんだ。殿（信長公）に、何と申し上げればよいか`, 5);
    rt.after(6, () => rt.say('', '――武田勢はそのまま西へ進んだ。だが翌年、信玄は陣中で病が重くなり、四月、甲斐へ帰る途中で没した', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  // 取り残された：城門が閉じ、闇の原に取り残される
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('取り残された', '浜松城の門は閉じられ、武田の追手が原を埋めていく');
    rt.say('足軽', '門が……門が閉まった……！', 3);
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    jinchiTick(rt, [F.teppo]);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    KIT.backTick(rt);
    butaiTick(rt, dt);
    guardRecover(rt, F.hiraU, dt, { line: ['平手汎秀', '……退くぞ。手傷じゃ、しばし堪えよ'], backLine: ['平手汎秀', 'もう良い、前へ出る'] });
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    // 目を覚ました武田の兵（控えの軽い兵から替わった者）は当たりを弱める：大軍に呑まれて倒れ続けないように
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) { F.wkT = 0.5; for (const g of rt.army.groups) if (g.woke && g.team === 1 && !g.wkDm) { g.wkDm = true; g.dmgMult = (g.dmgMult || 1) * (g.units.some((u) => u.type === 'cavalry') ? 0.35 : 0.5); } }
    if (F.ending) return;
    const p = rt.player.u.pos;
    // 部隊どうしの押し合い（軽い作り）と、崩れかけた武田の備の退き・集まり直し（F4・F7）
    fieldTick(rt, dt, { list: F.allB, reach: 34, regroup: { team: 1, back: 24, wait: 24,
      onBack: (b) => { if (rt.t - (F.rgSaid || -99) > 12) { F.rgSaid = rt.t; rt.bark(`${b.name}が退いて、集まり直しておる`); } } } });
    if (F.SZ) F.SZ.tick(dt);
    // 台本の隊が崩れたら、同じ備の部隊も揺らぐ（先手→小山田の備、赤備え→山県の備）
    if (!F.w1Hit && F.w1 && gone(F.w1)) { F.w1Hit = true; F.bT.oyamada.morale = Math.min(F.bT.oyamada.morale, 20); }
    if (!F.akaHit && F.aka && gone(F.aka)) { F.akaHit = true; F.bT.yamagata.morale = Math.min(F.bT.yamagata.morale, 22); }
    depthTick(rt, dt);
    if (F.dpOn || F.ifOn) return;
    if (F.step === 1) {
      rt.objProgress('main', `武田の先手 ${F.w1.count}人`);
      if (F.w1.count < 6 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 25);
      // 無理に先手を追わず（IF の勝ち筋の一つ）：先手を深追いし、武田の陣の奥まで出てしまうと崩れやすい
      if (!F.overchase && p.z < -85) F.overchase = true;
      if ((gone(F.w1) && rt.t - F.stepT > 30) || rt.t - F.stepT > 55) this.deep(rt, 'A');
    }
    if (F.step === 2) {
      rt.objProgress('main', `赤備え ${F.aka.count}人`);
      if (rt.t - F.stepT > 45 || (F.aka.count < 8 && rt.t - F.stepT > 28)) {
        rt.unmark('pike');
        if (rt.player.u.alive && !F.akaPaid) {
          F.akaPaid = true;
          if (F.mkFlank && F.aka.count <= F.aka0 * 0.6) rt.award((t) => { t.special = { label: '赤備えの横腹を突いた', pts: Math.max(t.special ? t.special.pts : 0, 20) }; }, '赤備えの横腹を突いた');
          else if (!F.mkFlank) rt.award((t) => t.side.push('槍衾で赤備えを受け止めた'), '槍衾で赤備えを受け止めた');
        }
        this.deep(rt, 'B');
      }
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - HAMA.x, p.z - HAMA.z);
      rt.objProgress('main', `浜松城まで ${Math.max(0, Math.round(d))}m`);
      for (const q of F.chase || []) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 後ろの者との間：一番近い追手までの遠さ
      const near = rt.army.nearestEnemy(rt.player.u, 60, (o) => !o.fleeing);
      rt.objProgress('main', `浜松城まで ${Math.max(0, Math.round(d))}m・${near ? `追手まで ${Math.round(Math.hypot(near.pos.x - p.x, near.pos.z - p.z))}m` : '追手は見えぬ'}・城門が閉じるまで ${Math.max(0, Math.ceil(130 - (rt.t - F.stepT)))}秒`);
      if (rt.t > F.chaseT && F.chaseN < 4) {
        F.chaseT = rt.t + 26; F.chaseN++;
        const pu = rt.player.u;
        F.mk(pu.pos.x + (Math.random() - 0.5) * 30, pu.pos.z - 45, ['追いすがる騎馬', '馬場の手', '追手の新手', '内藤の騎馬'][F.chaseN - 1], [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 5 }, { type: 'ashigaru', n: 6 }]);
        rt.bark('後ろから新手の追手！　足を止めるな！', true);
      }
      // 城門の前：逃げ込む味方が入りきるまで、門の前で追手を食い止める（45 秒）
      if (d < 10 && !F.gateHold) {
        F.gateHold = rt.t;
        rt.banner('浜松城の門', '逃げ込む味方が入りきるまで、門の前で追手を止めよ');
        rt.say('佐久間信盛', '門の前で踏みとどまれ！　後ろの者が入りきるまでじゃ！', 3.5);
        rt.obj('main', '浜松城の門の前で、追手を食い止めよ（味方が入りきるまで）', 'main');
        const pu = rt.player.u;
        F.mk(pu.pos.x - 10, pu.pos.z - 30, '門へ迫る武田勢', [{ type: 'samurai', n: 2, o: { horse: true } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 12 }]);
      }
      if (F.gateHold) {
        const left = Math.max(0, 35 - (rt.t - F.gateHold));
        rt.objProgress('main', `味方が入りきるまで ${Math.ceil(left)}秒`);
        if (left <= 0) this.deep(rt, 'C');
      } else if (rt.t - F.stepT > 100) {
        // 城の近くまで来ている者には、門をもう少し開けて待つ（退き口に着けば勝ち）
        if (d < 60 && rt.t - F.stepT < 180) { if (!F.gateWait) { F.gateWait = true; rt.say('徳川の門番', '門を閉めるな！　まだ味方が走ってくる！　急げ！', 3.5); } }
        else this.lose(rt);
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// 両軍の総勢（徳川・織田 一万一千ほど、武田 二万五千ほど。数には諸説ある）
mikatagahara.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 11000 - (F.ak || 0) * 20 - (F.step >= 2 ? 1500 : 0)), a0: 11000, b: Math.max(0, 25000 - (F.ek || 0) * 20), b0: 25000 };
};
mikatagahara.sides = { a: { name: '徳川・織田軍', mon: 'oda' }, b: { name: '武田軍', mon: 'takeda' } };
mikatagahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
// 軍議（gungi.js・F5）：援軍の構えを二つから選ぶ。史実の既定は鶴翼（徳川と並んで正面で迎える）
//   ①kakuyoku（既定）：鶴翼に開いて正面で迎える
//   ②migi：佐久間の手を右（根洗の小高い所・森の側）へ寄せて横を固める。赤備えの寄せが鈍るが、武田が左を回れば鶴翼が早く破れる
// 軍議は侍大将候補（rank 3）から（main.js の canGungi）。それより下は史実の既定で進む
mikatagahara.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: 10, z: -50 }, dist: 130,
    units: [{ id: 'plan', name: '織田の援軍（平手・佐久間）', group: () => F.hirate, nominal: () => (F.hirate ? F.hirate.count + (F.saku ? F.saku.count : 0) : 0) }],
    routes: [
      { id: 'kakuyoku', name: '鶴翼に開いて、正面で迎える' },
      { id: 'migi', name: '右の森の側を固めて、横を守る' },
    ],
    default: { plan: 'kakuyoku' },
    enemy: [
      { name: '小山田信茂の備（先手）', known: true, count: () => F.bT.oyamada.aliveNominal() },
      { name: '山県昌景の赤備え', known: true, count: () => F.bT.yamagata.aliveNominal() },
      { name: '馬場信春・武田勝頼の備', known: false },
    ],
    onStart: (assign) => mikatagahara.onGungiStart(rt, assign),
  };
  const auto = window.__mikataStrategy || (/[?&]bot/.test(location.search) ? 'kakuyoku' : null);
  if (auto) { mikatagahara.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
mikatagahara.onGungiStart = (rt, assign) => {
  const F = rt.flags;
  F.strategy = (assign && assign.plan) || 'kakuyoku';
  // 右を固める：佐久間の手を根洗の小高い所へ（場を取れば、赤備えの寄せが見える）
  if (F.strategy === 'migi' && F.saku) { F.saku.anchor = { x: NEARAI.x, z: NEARAI.z + 4 }; F.saku.facing = Math.PI * 1.1; }
};
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
mikatagahara.famous = [
  { name: '本多忠勝', team: 0, g: /徳川/, line: '本多平八郎忠勝じゃ。殿の退く道は、わしが開く！' },
  { name: '馬場信春', g: /先手/, loose: 1, line: '武田の馬場信春なり！　徳川の小倅、ここが死に場所ぞ！' },
  { name: '小山田信茂', g: /先手/, loose: 1, line: '郡内の小山田信茂なり！　石つぶての礼、存分に受けよ！' },
];
mikatagahara.date = (rt) => `元亀三年十二月二十二日　冬・${rt.flags.step >= 3 ? '夜' : '夕暮れ'}`;
mikatagahara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
mikatagahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
mikatagahara.history = '元亀三年（1572）十月、甲斐の武田信玄は二万五千ほどの兵で西へ攻め上った。遠江の二俣城を落とした武田勢は、十二月二十二日、徳川家康の浜松城の前を通り過ぎて三方ヶ原の台地へ上った。家康は城から打って出て、信長が送った援軍（佐久間信盛・平手汎秀・滝川一益ら三千ほど）とともに鶴翼に開いて挑んだ。しかし、魚鱗に固めた武田勢に夕暮れの一刻ほどで大敗した。織田の援軍の平手汎秀は討ち死にし、家康はわずかな供と浜松城へ逃げ帰った。武田勢の先手が石を投げかけたという話が伝わる。信玄はそのまま西へ進んだが、翌年、陣中で病が重くなり、四月、甲斐へ帰る途中で没した。兵の数には諸説ある。';

// 素直な遊び手：先手を受け、赤備えと戦い、浜松城へ走る
mikatagahara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn && F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 4, (o) => !o.fleeing);
    if (e3 && u.hp > u.maxHp * 0.4) { p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z); if (Math.random() < 0.5) inp.leftPressed = true; return; }
    goTo(p, inp, HAMA.x, HAMA.z, 3);
    return;
  }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 10, LINE_Z + 30, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, 6, LINE_Z + 4, 2);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 苦しい戦：前・左右・後ろから武田の大軍が包み込む。勝つことではなく、生き残ることが勝ち
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n }), uB = (n) => ({ type: 'bow', n });
const aka = (list) => ({ faction: 'akazonae', flag: 'akazonae', armor: AR.akazonae, list: dress(list, AKA) });
// 鉄砲組：鉄砲だけの組は、並んで構え、号令で一斉に撃つ（units.js）
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
function mkCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: AR.takeda, dmg: 0.6, mass: 260, look: (l) => dress(l, TAKEDA),
    friends: () => [F.hirate, F.saku, F.toku].filter((g) => g && g.count && !g.routed) };
}
// A 先手の後：魚鱗の寄せ → 赤備えの気配
function mkA() {
  const at = { x: 0, z: LINE_Z };
  return [
    rest({ dur: 7, heal: 0.3, say: [['平手汎秀', '先手は退いた。……じゃが、あれは先手に過ぎぬ'], ['足軽', '原の向こう一面が、武田の旗じゃ……'], ['平手汎秀', '魚鱗に固めて来るぞ。槍を揃え直せ']] }),
    hold({ at, dur: 62, r: 15, title: '魚鱗の寄せ', sub: '武田の大軍が、一つの塊になって押し寄せる', label: '平手の陣', obj: '平手の陣で、押し寄せる武田の大軍を受けよ',
      say: [['平手汎秀', '一歩も退くな！　ここで崩れれば徳川殿の鶴翼が割れる！']],
      waves: [
        { t: 4, say: ['足軽', '石じゃ！　石を投げてくる！　その後ろから槍が……'], foes: () => [{ name: '武田の魚鱗の先', from: { x: 0, z: LINE_Z - 60 }, list: [uS(3), uA(14)], mass: 400, noRout: 30 }] },
        { t: 20, say: ['平手汎秀', '鉄砲衆が並んだ！　構えを見たら伏せよ！'], foes: () => [gunLine('武田の鉄砲衆', { x: 22, z: LINE_Z - 46 }, 8)] },
        { t: 36, say: ['足軽', '左へ回ってくる！　徳川の手との間を割る気じゃ！'], foes: () => [{ name: '左へ回る武田勢', from: { x: -54, z: LINE_Z - 24 }, off: { x: -8, z: 0 }, list: [uS(2), uA(11)], mass: 280 }] },
        { t: 52, say: ['佐久間信盛', '右からもじゃ！　押し包まれるぞ！'], foes: () => [{ name: '右へ回る武田勢', from: { x: 56, z: LINE_Z - 10 }, off: { x: 8, z: 4 }, list: [uS(2), uA(10), uB(3)], mass: 260 }] },
        { t: 68, say: ['平手汎秀', '二の手じゃ！　息を継ぐ間を与えぬ気か……！'], foes: () => [{ name: '武田の二の手', from: { x: 8, z: LINE_Z - 58 }, list: [uS(2), uA(11)], mass: 320 }] },
      ],
      reward: '魚鱗の寄せを受け止めた', lost: ['平手汎秀', '押し込まれた……！　立て直せ！'] }),
    rest({ dur: 6, heal: 0.35, bark: '立て直し：右へ槍を向け直す（手傷を縛った）', say: [['足軽', '……右の森の向こう、赤いものが動いておる'], ['平手汎秀', '赤備えか……！　右じゃ、右に槍を向けよ！']] }),
  ];
}
// B 赤備えの後：平手殿と残るか、佐久間殿と退くか
function mkB() {
  const at = { x: 2, z: LINE_Z + 4 };
  return [
    rest({ dur: 6, heal: 0.25, bark: '息を整える間もない', say: [['佐久間信盛', '平手殿、もう持たぬ！　退くのじゃ！'], ['平手汎秀', '退かぬ。殿の名代が背を見せては、織田の名折れじゃ'], ['平手汎秀', (rt) => `${nm(rt)}、お主は佐久間殿と退け。……いや、残るも退くも、己で決めよ`]] }),
    pick({ time: 12, title: '平手汎秀は踏みとどまると言う。どうする？',
      options: [{ label: '佐久間殿と共に、南へ退く', note: '台地を南へ走る。途中で回り込んだ武田勢に遭う' }, { label: '平手殿と共に踏みとどまる', note: '四方を囲まれる。生き延びれば大手柄。死ぬかもしれぬ' }],
      on: (rt, m, i) => { m.mkStay = i === 1; rt.say(i === 1 ? '平手汎秀' : '佐久間信盛', i === 1 ? '……馬鹿者め。ならば、共に死に花を咲かせようぞ' : 'ついて来い！　遅れるでないぞ！', 3); } }),
    hold({ skip: (rt, m) => !m.mkStay, at, dur: 61, r: 12, title: '平手の最期', sub: '武田の大軍が、平手の手を四方から押し包む', label: '平手の陣', obj: '平手汎秀のそばで、四方から来る武田勢に耐えよ',
      waves: [
        { t: 3, say: ['足軽', '前も右も武田じゃ……！'], foes: () => [{ name: '押し包む武田勢', from: { x: 0, z: LINE_Z - 56 }, list: [uS(3), uA(13)], mass: 380, noRout: 30 }, { name: '右から押す赤備え', ...aka([uS(1), uC(4), uA(6)]), from: { x: 54, z: LINE_Z - 14 }, mass: 160, kind: 'cavalry' }] },
        { t: 30, say: ['平手汎秀', '鉄砲じゃ、伏せよ！'], foes: () => [gunLine('武田の鉄砲衆', { x: -24, z: LINE_Z - 44 }, 9)] },
        { t: 56, say: ['足軽', '後ろじゃ！　後ろにも回られた！'], foes: () => [{ name: '後ろへ回った武田勢', from: { x: -10, z: LINE_Z + 60 }, list: [uS(2), uA(11)], mass: 280 }, { name: '左から寄る武田勢', from: { x: -56, z: LINE_Z }, list: [uS(1), uA(9)], mass: 220 }] },
        { t: 72, say: ['平手汎秀', '……ここまでか。者ども、まだ槍は折れておらぬぞ！'], foes: () => [{ name: '武田の旗本の一手', from: { x: 12, z: LINE_Z - 60 }, list: [uS(4), uA(12)], mass: 360 }] },
      ],
      reward: (t) => { t.special = { label: '平手汎秀と最後まで踏みとどまった', pts: 35 }; }, lost: ['平手汎秀', '……よう戦うた。行け、生きて殿に伝えよ！'] }),
    move({ skip: (rt, m) => m.mkStay, to: { x: 14, z: 56 }, r: 10, label: '台地の南', obj: '佐久間の手と共に、台地を南へ退け',
      say: [['佐久間信盛', '走れ！　平手殿の死を無駄にするな！']],
      ambush: { d: 30, t: 24, title: '回り込まれた', sub: '武田の一手が、退く道を塞ぐ', say: ['足軽', '前にも武田じゃ！　回り込まれておる！'], foes: () => [{ name: '道を塞ぐ武田勢', from: { x: 40, z: 76 }, list: [uS(2), uA(10)], mass: 260 }, gunLine('道の脇の武田の鉄砲', { x: -20, z: 70 }, 6)] } }),
    // 台地の端で殿：坂を下りる味方の背を守る（織田の援軍の退き口）
    rest({ dur: 6, heal: 0.3, bark: '坂の上で、手傷を縛った', say: [['佐久間信盛', 'ここで一度踏みとどまれ！　後ろの者を先に坂へ下ろすのじゃ']] }),
    hold({ at: { x: 14, z: 62 }, dur: 38, r: 14, title: '台地の端の殿', sub: '坂を下りる味方の背を、武田勢が追う', label: '台地の端',
      obj: (rt) => (HI(rt) ? '預かった一手で殿を務め、坂を下りる味方を守れ' : '坂の上で踏みとどまり、下りる味方の背を守れ'),
      waves: [
        { t: 4, say: ['足軽', '追ってくる！　原いっぱいに武田の旗じゃ！'], foes: () => [{ name: '追いすがる武田勢', from: { x: 4, z: 8 }, list: [uS(2), uA(11)], mass: 300 }] },
        { t: 34, say: ['佐久間信盛', '鉄砲を並べおった！　身を低うせよ、じきに下りられる！'], foes: () => [gunLine('台地の上の武田の鉄砲', { x: 34, z: 22 }, 6)] },
      ],
      reward: '台地の端で殿を務めた', lost: ['佐久間信盛', 'もうよい、下りよ！　城へ走れ！'] }),
  ];
}
// C 浜松城へ逃げ込んだ後：空城の篝火 → 犀ヶ崖の夜討ちに加わるか、門を守るか
function mkC() {
  const gate = { x: HAMA.x, z: HAMA.z - 12 };
  return [
    rest({ dur: 6, heal: 0.4, bark: '城の中で、手傷を縛った', say: [['足軽', '門を……閉めぬのか？'], ['徳川の侍', '殿（家康公）の下知じゃ。門は開け放ち、篝火を焚け。武田は罠を疑うて入って来ぬ'], ['大久保忠世', '武田は犀ヶ崖の北に陣を張った。今宵、鉄砲を撃ちかけて一泡吹かせてやる。……織田の衆も来るか']] }),
    pick({ time: 12, title: '大久保忠世が、犀ヶ崖の武田の陣へ夜討ちをかけると言う。どうする？',
      options: [{ label: '城に残り、開けた門を守る', note: '武田の物見が寄せてくる。門を守り抜けば手堅い手柄' }, { label: '夜討ちに加わる', note: '犀ヶ崖で武田の陣を撃つ。手柄は大きい。追われれば崖に追い詰められる' }],
      on: (rt, m, i) => { m.mkRaid = i === 1; rt.say(i === 1 ? '大久保忠世' : '佐久間信盛', i === 1 ? 'よし、鉄砲を持て。声を立てるなよ' : '門を守れ。ここを抜かれれば、城が落ちる', 3); } }),
    fight({ max: 95, skip: (rt, m) => !m.mkRaid, at: { x: 0, z: 104 }, title: '犀ヶ崖', sub: '闇の中、武田の陣へ鉄砲を撃ちかける', obj: '犀ヶ崖の北の武田の陣を突き崩せ',
      say: [['大久保忠世', '放て！　……よし、槍を入れよ！']],
      foes: () => [{ name: '犀ヶ崖の武田の陣', from: { x: -6, z: 70 }, list: [uS(2), uA(12)], mass: 300, morale: 70 }],
      later: [{ t: 24, title: '武田、立て直す', sub: '陣の奥から鉄砲衆が並ぶ', say: ['足軽', '向こうも鉄砲を並べた！　身を低うせよ！'], foes: () => [gunLine('武田の鉄砲衆', { x: 24, z: 66 }, 8)] },
        { t: 46, title: '追い討ち', sub: '武田の騎馬が回り込む', say: ['大久保忠世', '騎馬が来る！　崖の縁に追い詰められるな！'], foes: () => [{ name: '武田の騎馬', from: { x: -46, z: 80 }, list: [uS(1), uC(5), uA(4)], mass: 120, kind: 'cavalry' }] }],
      max: 70, reward: (t) => { t.special = { label: '犀ヶ崖の夜討ち', pts: 25 }; }, rewardLabel: '犀ヶ崖の夜討ちに加わった' }),
    hold({ skip: (rt, m) => m.mkRaid, at: gate, dur: 34, r: 12, title: '開けた門', sub: '篝火の向こうから、武田の物見が寄せる', label: '浜松城の門', obj: '開け放った門の前で、寄せる武田勢を防げ',
      waves: [
        { t: 6, say: ['足軽', '篝火の向こうに……来たぞ！'], foes: () => [{ name: '武田の物見', from: { x: gate.x, z: gate.z - 60 }, list: [uS(2), uA(10)], mass: 220 }] },
        { t: 40, say: ['佐久間信盛', '鉄砲を並べておる！　門の陰へ！'], foes: () => [gunLine('武田の鉄砲衆', { x: gate.x + 26, z: gate.z - 44 }, 7)] },
        { t: 66, say: ['足軽', '横の堀際からも来る！'], foes: () => [{ name: '堀際を回る武田勢', from: { x: gate.x - 50, z: gate.z - 10 }, list: [uS(1), uA(9)], mass: 200 }] },
        { t: 86, say: ['徳川の侍', 'また来た！　篝火を絶やすな、槍を揃えよ！'], foes: () => [{ name: '門を窺う武田勢', from: { x: gate.x + 40, z: gate.z - 50 }, list: [uS(1), uA(8)], mass: 160, morale: 70 }] },
      ],
      reward: '開けた門を守り抜いた' }),
  ];
}

export { mikatagahara };
