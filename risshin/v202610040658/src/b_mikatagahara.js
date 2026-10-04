import { HISTORICAL_GENERALS } from './b_historical_generals.js';
// ======================================================================
// 織田家編　三方ヶ原の戦い（元亀三年十二月二十二日）
// 西へ攻め上る武田信玄の三万が、遠江の三方ヶ原を通り過ぎようとした。徳川家康は浜松城から打って出て、
// 信長が送った援軍（佐久間信盛・平手汎秀ら三千ほど、滝川の参戦には異説）とともに挑んだが、夕刻の会戦で大敗した。
// 織田の援軍の平手汎秀は討ち死にし、家康は浜松城へ逃げ帰った。
// 足軽は平手汎秀の手（織田の援軍）。①夕暮れの台地で武田の先手を受け止める ②赤備えの騎馬に崩される
// ③平手の討ち死に。浜松城へ退く（追ってくる武田勢を振り切る）
// 向き：北（-z）から武田勢が来る。南（+z）の台地の下に浜松城
// ======================================================================
import { nobori, hut, tawara, campfire, solidSeg, palisade } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { jinchiTick } from "./yasen_jinchi.js";
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, strengthBanner } from './bhelp.js';
import { dress, gone, more, applyLook, NIGHT } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
// 新しい波を出す時だけ数える。武将と供の余地を残し、遠景は本物へ替えない。
function depthLook(rt, list, style) {
  let room = 235;
  for (const u of rt.army.units) if (u.alive && !u.gone) room--;
  return dress(list.map((q) => {
    const n = Math.min(q.n, Math.max(0, room)); room -= n;
    return { ...q, n };
  }).filter((q) => q.n > 0), style);
}

import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot, rest, hold, move } from './b_depth.js';
import { camp } from './b_mid.js';
import { demSample } from './dem.js';
import { butaiTick } from './butai.js';
import { fieldButai, fieldTick } from './b_yasen.js';
import { jinkeiBuild } from './jinkei.js';
import { jinkeiDistantLayout } from './b_jinkei_layout.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const AR = KIT.ARMOR;
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 南北の向きは布陣資料に合わせる。距離は縮め、武田の備えの厚みは復元する。
const LINE_Z = -260 / 16;                        // 織田の援軍の陣
const TAKEDA_HQ_Z = -3000 / 16;                  // 前の三重の控えも、先手の戦う場所より北へ置く
const HAMA = { x: 0, z: 2800 / 16 };            // 浜松城の方（退く先）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };
const AKA = { flag: 'akazonae' };
const TOKU = { flag: 'tokugawa' };
// 薄暮（夕刻と夜のあいだ）：赤備えの突撃のころ。灯りが少なく、松明・旗・音が頼りになってくる
const TWILIGHT = { sky: 0x4c4a5c, fog: 0x45465a, sun: 0xd8a070, sunI: 0.9, hs: 0x9a9aae, hg: 0x3a3030, hI: 1.1, top: 0x232a40, glow: 0.12, dir: [0.8, 0.16, -0.4], mount: 0x1a1e28 };

// 国土地理院の標高（三方原の台地。束0 の asset_dem_mikatagahara.js）。ゲームの 1 を実の 4m に縮め、
// 台地の上のゆるい起伏（北が少し高い）だけを手書きの base に足す
// 地面を作る前に読み終える。当たりの高さだけ後から変えない。
import mkDem from './asset_dem_mikatagahara.js';
const DEM_XY = 4;
function demRelief(x, z) {
  if (!mkDem) return 0;
  const sx = x * DEM_XY, sz = z * DEM_XY;
  if (Math.abs(sx) > 1580 || Math.abs(sz) > 1580) return 0;
  return (demSample(mkDem, sx, sz) - 30) * 0.7;
}
const sig = (v) => 1 / (1 + Math.exp(-v));
// 犀ヶ崖（台地の南の端に刻まれた深い谷）。東の端は浅く、道はその東を下る（崖は登れず、道を通る）
const RETREAT_ROAD = [[10, 60], [14, 104], [14, 136], [0, 171]];
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
  // 台地の備えに急な山を重ねない。遠い北だけ緩く高くする。
  h += Math.max(0, -z - 240) * 0.15;
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
  const distance = stage === 'first' ? 34 : 26, seconds = stage === 'first' ? 50 : 30;
  // 前六備は同じ歩みで、先鋒・二陣・三陣の間を保つ。旗本と脇備えは本陣に残る。
  for (const id of ['yamagata', 'oyamada', 'baba', 'sanada', 'katsuyori', 'naito']) adv(T[id], distance, seconds, stage === 'crash');
  if (stage !== 'first') return;
  if (P === 'hidari') {
    for (const id of ['baba', 'katsuyori']) {
      const b = T[id]; if (!b || b.routedL) continue;
      b.light.moveTo(b.pos.x - 14, b.pos.z + distance, seconds);
    }
    rt.after(9, () => rt.say('物見', '武田の左が動いた！　馬場と勝頼、鶴翼の端へ回りまする！', 4));
  } else if (P === 'migi') {
    const b = T.yamagata;
    if (!b.routedL) b.light.moveTo(b.pos.x + 14, b.pos.z + distance, seconds);
    rt.after(9, () => rt.say('物見', '武田の右、赤い旗！　備えを保って前へ出まする！', 3.5));
  } else rt.after(9, () => rt.say('物見', '武田は魚鱗のまま、真っすぐ押してきます！', 3.5));
}
// 崩れた備は崖の手前で東の道へ寄り、浜松へ退く。
function allyFall(rt, b, loss) {
  if (!b || b.routedL || b.fallen) return;
  b.fallen = true;
  b.lost = Math.min(b.nominal, b.lost + b.nominal * loss);
  if (!b.light) return;
  const secs = Math.max(8, Math.hypot(14 - b.pos.x, 104 - b.pos.z) / 2.4);
  b.light.moveTo(14, 104, secs);
  rt.after(secs, () => { if (!rt.over && !b.routedL) b.light.moveTo(HAMA.x, HAMA.z - 4, 30); });
}

// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, label);
}

// 三河物語・甲陽軍鑑に伝わる陣名。各備の人数と細かな位置は遊びの復元。
// 右・前は本陣から敵へ向いた時の向き。旗は既存の家の旗を使う。
const TAKEDA_JIN = {
  name: '魚鱗', team: 1, honjin: { x: 0, z: TAKEDA_HQ_Z }, facing: 0,
  head: (rt) => rt.flags.campB?.general,
  sonae: [
    ['yamagata', '先陣右翼', '山県昌景', 4000, 22, 88, 'akazonae'],
    ['oyamada', '先鋒', '小山田信茂', 2000, 0, 114, 'takeda'],
    ['baba', '第二陣左翼', '馬場信春', 4000, -24, 62, 'furin', 'oyamada'],
    ['sanada', '第二陣右翼', '真田信綱・真田昌輝', 3000, 24, 62, 'takeda', 'yamagata'],
    ['katsuyori', '第三陣左翼', '武田勝頼', 3000, -46, 36, 'furin', 'baba'],
    ['naito', '第三陣中翼', '内藤昌豊', 3000, 0, 36, 'takeda', 'sanada'],
    ['nobutoyo', '旗本衆', '武田信豊（典厩）', 2500, -24, 14, 'takeda'],
    ['anayama', '旗本衆', '穴山信君', 2500, 24, 14, 'takeda'],
    ['nobukado', '本陣左脇備え', '武田信廉（逍遥軒）', 2000, -48, 0, 'takeda'],
    ['kosaka', '本陣右脇備え', '高坂昌信', 2000, 48, 0, 'takeda'],
    ['shingen', '本陣', '武田信玄', 2000, 0, 0, 'takeda'],
  ].map(([id, role, general, soldiers, right, front, flag, relief]) => ({
    id, role, general, soldiers, at: { right, front }, flag, mon: 'takeda', relief,
    bind: (rt) => rt.flags.bT?.[id],
  })),
};
const TOKUGAWA_JIN = {
  name: '鶴翼', team: 0, honjin: { x: 0, z: 0 }, facing: Math.PI,
  sonae: [
    ['ishikawa', '左翼', '石川数正', 2500, 48, 30, 'tokugawa'],
    ['honda', '左翼', '本多忠勝', 1500, 26, 20, 'tokugawa'],
    ['sakai', '右翼', '酒井忠次', 2500, -48, 30, 'tokugawa'],
    ['oda', '織田の加勢', '佐久間信盛・平手汎秀ら', 3000, -16, 16, 'oda'],
    ['ieyasu', '本陣', '徳川家康', 1500, 0, 0, 'tokugawa'],
  ].map(([id, role, general, soldiers, right, front, flag]) => ({
    id, role, general, soldiers, at: { right, front }, flag, mon: flag,
    bindOnly: id === 'oda',
    bind: (rt) => rt.flags.bA?.[id],
  })),
};

const mikatagahara = {
  jinkei: [TOKUGAWA_JIN, TAKEDA_JIN],
  jinkeiActive: (rt) => rt.flags.step > 0 && !rt.flags.ending && rt.flags.step < 3,
  wakeOK: (rt) => rt.flags.step > 0,
  spawn: { x: 260 / 16 + 8, z: LINE_Z + 10, heading: Math.PI },
  world: {
    seed: 15722,
    time: 'dusk',
    winter: true,      // 冬でも降雪の根拠がないので、雪を降らせない
    fogFar: 210,
    wind: [0.8, 0.6],
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
    clear: (x, z) => (Math.abs(x) < 130 && z > -220 && z < 150) || Math.hypot(x, z - TAKEDA_JIN.honjin.z) < 22,
    trees: 300,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 130 && z > -220 && z < 160 ? 0.08 : 0.7),
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
    rt._rfN = 3; // 敗走中に共通の救済援兵を湧かせない
    strengthBanner(rt, 11000, 30000);
    // ---- 織田の援軍：平手汎秀の手（自分の持ち場）、佐久間信盛の手 ----
    F.hirate = allyGroup(rt, { fixed: true, name: '平手汎秀の手', anchor: { x: 260 / 16, z: LINE_Z }, facing: Math.PI, width: 8, spacing: 1, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '平手汎秀', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 3 }], ODA));
    F.hiraU = F.hirate.units[0];
    F.saku = allyGroup(rt, { fixed: true, name: '佐久間信盛の手', anchor: { x: 150 / 16, z: LINE_Z }, facing: Math.PI, width: 6, spacing: 1, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.toku = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '徳川の手', anchor: { x: -125 / 16, z: LINE_Z }, facing: Math.PI, width: 8, spacing: 1, aggro: 10, noRout: true, fleeDir: { x: 0.15, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], TOKU));
    // 平手の鉄砲組（元亀三年、まだ数は少ない）：込めたまま待ち、寄せた所で揃えて放つ
    F.teppo = allyGroup(rt, { fixed: true, name: '平手の鉄砲組', anchor: { x: 260 / 16 + 14, z: LINE_Z + 6 }, facing: Math.PI, width: 12, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 8 }], ODA));
    F.oda = [F.hirate, F.saku, F.toku, F.teppo];
    F.guns = [F.teppo];
    F.fieldOpts = { list: null, reach: 18 };
    // 苦しい戦：一万余りで三万に当たる。味方は並の強さ
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; g.noRout = false; }
    // 配下は身分に応じた人数。足軽に自分の指揮する組を与えない。
    const n = RANKS[rt.G.rank].squad || 0;
    if (n) rt.makeSquad({ x: 260 / 16 + 3, z: LINE_Z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    for (const [x, z, k] of [[260 / 16 - 4, LINE_Z + 6, 'oda'], [260 / 16 + 4, LINE_Z + 6, 'oda'], [-125 / 16, LINE_Z + 4, 'tokugawa'], [150 / 16, LINE_Z + 6, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 魚鱗は陣形の表から幅と後詰めを決める。先鋒から本陣へ段々に厚く続ける。
    const fb = (o, layout) => {
      const add = W.addDistantArmy;
      W.addDistantArmy = function (p) { return add.call(this, { ...p, ...layout, kind: 'mixed', general: o.general, secondGeneral: o.secondGeneral, mon: o.mon }); };
      let b;
      try { b = fieldButai(rt, { realMax: 8, mix: { ashigaru: 65, gun: 12, bow: 7, samurai: 12, cavalry: 4 }, ...o }); }
      finally { W.addDistantArmy = add; }
      // 共通の六十メートルの切り替えへ渡す。部隊自身は追加で兵を出さない。
      b.noSwitch = true;
      b._autoSwitch = () => {};
      b.light.army.noWake = false;
      b.light.army.team = b.team;
      b.light.army.jinkeiGuard = true;
      return b;
    };
    const build = (plan) => jinkeiBuild(rt, plan, (s, at) => {
      const faction = s.flag === 'akazonae' ? 'akazonae' : plan.team ? 'takeda' : 'tokugawa';
      return fb({ name: s.general + 'の備', general: s.id === 'sanada' ? '真田信綱' : s.general,
        secondGeneral: s.id === 'sanada' ? '真田昌輝' : null, team: plan.team, faction,
        kind: 'ashigaru', nominal: Math.round(s.soldiers / 15), armor: AR[faction], flag: s.flag, mon: s.mon,
        at, facing: plan.facing }, jinkeiDistantLayout(plan, s));
    });
    F.bA = build(TOKUGAWA_JIN);
    F.bT = build(TAKEDA_JIN);
    // 東の援軍は平手の手と組の持ち場から離す。後の押し合いも同じ所で行う。
    F.takiDA = W.addDistantArmy({ x: 60, z: LINE_Z, w: 10, d: 10, count: 180, facing: Math.PI, armor: AR.oda, flagTex: flagTexture('oda'), seed: 15723 });
    F.takiDA.army.team = 0;
    F.takiDA.army.noWake = true; // 押し合いの遠景へ引き継ぐまで実兵と重ねない
    F.allB = [...Object.values(F.bA), ...Object.values(F.bT)];
    F.fieldOpts.list = F.allB;
    // 武田の頭（F7）：毎回少し違う手を打つ。正面で押す／左（徳川の鶴翼の端）を回る／右（森の側）から赤備えを先に出す
    F.tPlan = ['naka', 'hidari', 'migi'][Math.floor(Math.random() * 3)];
    // 武田の本陣（北の奥）：武田信玄と旗本。控えは軽い兵
    F.campB = camp(rt, { x: 0, z: TAKEDA_JIN.honjin.z, facing: 0, team: 1, faction: 'takeda', mon: 'takeda', armor: AR.takeda, general: { name: '武田信玄', hat: 'kabuto_m', haori: 0x8a1a14 }, depth: false, guard: 15, reserve: 0, runTo: { x: 0, z: -70 } });
    // 徳川の本陣（鶴翼の後ろ）：徳川家康と旗本。鶴翼が破れると浜松城へ退く
    F.campA = camp(rt, { x: 0, z: 0, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: AR.tokugawa, general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x6a5a2a }, guard: 15, reserve: 0, runTo: { x: -40, z: LINE_Z - 4 } });
    // 本陣の旗本は、整った陣形のまま静かに待つ（寄ってきた敵にだけ向き直る。前へ出て乱れない）
    for (const H of [F.campA, F.campB]) for (const g of [H.guard, H.general && H.general.group]) if (g && g.count) { g.order = 'hold'; g.formation = 'line'; g.aggro = 6; g.seekRange = 10; }
    // 共通の本陣は護衛を南側に置く。北向きの家康の護衛は敵側へ戻す。
    F.campA.guard.anchor.z = -11;
    for (const u of F.campA.guard.units) { u.pos.z -= 22; u.pos.y = W.heightAt(u.pos.x, u.pos.z); }
    F.shingariG = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '徳川の退き口の守り', anchor: { x: -18, z: 12 }, facing: Math.PI, order: 'hold', width: 6, aggro: 10 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], TOKU));
    // 犀ヶ崖の両の縁（崖は登れぬ。人も馬も東の道へ回る）
    for (let x = SAI.x0; x < SAI.x1; x += 8) { const x2 = Math.min(SAI.x1, x + 8); solidSeg(x, SAI.z - SAI.hw - 1, x2, SAI.z - SAI.hw - 1); solidSeg(x, SAI.z + SAI.hw + 1, x2, SAI.z + SAI.hw + 1); }
    // 三方原台地の小さな集落と畑（本隊の通り道を外れた西側。台地が競技場でなく人の暮らす野だと分かるように）
    rt.scene.add(hut(W, MURA.x, MURA.z, 6, 5, 0.2, { h: 2.6 }));
    rt.scene.add(hut(W, MURA.x + 10, MURA.z - 6, 5, 4, 0.5, { h: 2.4 }));
    rt.scene.add(tawara(W, MURA.x - 6, MURA.z + 6, 0.3, 5));
    // 追分（台地へ上る道と、祝田坂方向へ下る道が分かれる所。戦の初めだけ示す）
    rt.marker('oiwake', OIWAKE, '追分・武田が向かう坂', { h: 2 });
    rt.after(20, () => rt.unmark('oiwake'));
    // 徳川期の城口の復元。後世の天守・石垣は置かず、木柵の口を空ける。
    for (const seg of [[-24, HAMA.z - 12, -5, HAMA.z - 12], [5, HAMA.z - 12, 24, HAMA.z - 12],
      [-24, HAMA.z - 12, -24, HAMA.z + 24], [24, HAMA.z - 12, 24, HAMA.z + 24], [-24, HAMA.z + 24, 24, HAMA.z + 24]])
      rt.scene.add(palisade(W, seg, { solid: true, h: 2.4 }));
    // 浜松城の方（遠く、南）
    rt.scene.add(hut(W, HAMA.x, HAMA.z + 14, 14, 9, 0.1, { h: 3.6, ita: true, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[HAMA.x - 8, HAMA.z], [HAMA.x + 8, HAMA.z]]) { rt.scene.add(nobori(W, x, z, 'tokugawa', 6)); rt.scene.add(campfire(W, x, z + 4)); W.addFire(x, z + 4); }

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '平手の援軍の一手と、槍の列を揃えよ' : '平手の陣で、味方の槍の列に続け', 'main');
    rt.say('物見', '武田は浜松城を素通りし、台地の西、祝田の坂を下りて都田へ向かう構えにござる', 4.5);
    rt.say('組頭', `${nm(rt)}、徳川殿は城を出て、武田の背を追うと決められた。我らもお供する`, 4.5);
    rt.after(7, () => rt.say('組頭', 'あれが信玄の軍勢じゃ。三万ほどと聞く。……こちらは徳川と合わせて一万余り。槍を揃えよ', 4.5));
    rt.marker('hira', unitPos(F.hiraU), '平手汎秀', {});
    rt.after(16, () => { if (rt.phase === 'brief') this.first(rt); });
  },

  // ① 武田の先手を受け止める
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    rt.unmark('hira');
    sfx('taiko', 1); rt.after(1, () => sfx('horagai', 0.8));
    rt.banner('武田の備え', '坂の手前で、武田がこちらへ向き直る');
    rt.after(3, () => rt.say('物見', '武田の足が止まった！　坂を下りず、こちらへ向き直っておりまする', 4));
    rt.after(10, () => rt.say('物見', '備えが組み直される……魚鱗じゃ！　我らは徳川殿と並んで鶴翼に開きまする', 4.5));
    rt.obj('main', '平手の陣で槍をそろえ、寄せる先手を受け止めよ', 'main');
    takedaMove(rt, 'first');
    // 小山田の先手の位置から寄せる。
    F.w1 = enemyGroup(rt, { fixed: true, faction: 'takeda', name: '武田の先手', anchor: { x: 0, z: TAKEDA_HQ_Z + 114 }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 18, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1, formation: 'yari' },
      depthLook(rt, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt, 0.4) }, { type: 'bow', n: 4 }], TAKEDA));
    rt.marker('w1', centerOf(F.w1), '武田の先手', { red: true, group: F.w1 });
    rt.after(14, () => rt.say('組頭', '誘われたか……！　じゃが、もう引けぬ。動くな、槍先を下げよ！', 3.5));
    // 小山田を先に、東の山県と後続の備を厚く置く。各備の位置は推定。
    rt.after(20, () => rt.say('物見', '最前の旗は小山田か！　右には赤い旗も見えまする！', 5)); rt.after(26, () => rt.say('物見', '台地の奥まで旗が続いておりまする。……これは敵わぬ', 4));
    // 勝ち筋：勝てぬ戦。台地の南の坂を下れば浜松城。生きて退く道をはじめに示す
    rt.after(6, () => { if (F.step === 1 && !F.ending) rt.say('組頭', '崩れた時は、台地の南の坂を下れ。浜松の城が退き口じゃ', 3.5); });
    // 退く下知の時に、南の道を順に示す。

  },

  // 段を重ねる（b_depth.js）：A 魚鱗の寄せ（先手の後）→ B 台地の退き口（赤備えの後）
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true; F.dpOn = true;
    for (const k of ['w1', 'aka']) rt.unmark(k);
    if (which === 'A') this.plainClash(rt);
    // 赤備えは駆け抜けて、徳川の鶴翼の方へ去る（平手の手を包むのは武田の本隊）
    if (which === 'B' && F.aka && !gone(F.aka)) { F.aka.anchor = { x: -36, z: 12 }; F.aka.order = 'move'; F.aka.dest = F.aka.anchor; F.aka.aggro = 6; rt.bark('赤備えが駆け抜けていく……徳川の手の方へ'); }
    depthStart(rt, mkCtx(rt), which === 'A' ? mkA() : mkB(), () => {
      F.dpOn = false;
      if (which === 'A') this.crash(rt);
      else this.retreat(rt);
    });
  },

  // 「崩れた武田へなお圧せよ」の IF の勝ちはやめた（10/3）。この戦は勝てぬ戦で、生き延びて浜松へ退くのが芯
  // 台地の東：滝川一益らの手と武田の大軍が、正面いっぱいに組み合う（軽い作り）。赤備えが来ると崩れる
  plainClash(rt) {
    const F = rt.flags;
    if (F.cl) return;
    if (F.takiDA) F.takiDA.visible = false;
    F.cl = clash(rt, { x: 60, z: LINE_Z - 14, facing: Math.PI, w: 56, gap0: 34, closeSpeed: 3.6, seed: 15727, noRout: true, killRate: 0.15,
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
    F.aka = enemyGroup(rt, { fixed: true, faction: 'akazonae', name: '山県の赤備え', anchor: { x: 300 / 16, z: TAKEDA_HQ_Z + 88 + 34 }, facing: -Math.PI * 0.8, order: 'hold', seekRange: 140, aggro: 10, width: 14, morale: 100, noRout: true, fleeDir: { x: 1, z: -1 }, dmgMult: 1 },
      depthLook(rt, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 9 + more(rt, 0.2) }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AKA));
    // 備えの主将は遠景からの実体化だけで置き、突撃隊に複製しない。
    F.aka0 = F.aka.count;
    // 判断：赤備えをどう受けるか（時間切れは槍衾。受け方で傷と手柄が変わる）。赤備えは森の際で馬を揃えてから駆け出す
    const go = () => { if (!F.ending && F.step === 2 && !F.dpOn && F.aka && !gone(F.aka) && F.aka.order === 'hold') { F.aka.order = 'attack'; F.aka.aggro = 18; rt.say('足軽', '駆け出した！　来るぞ！', 2.5); } };
    rt.after(17, go);
    rt.after(1, () => {
      if (F.step !== 2 || F.ending) return;
      if (!HI(rt)) {
        F.mkFlank = false;
        rt.marker('pike', { x: 14, z: LINE_Z - 2 }, '味方と馬を受ける持ち場', { h: 2 });
        rt.say('組頭', '右へ槍を向けよ。持ち場で味方と馬を受けるぞ！', 3);
        return;
      }
      rt.choose('右の馬をどう受ける？', [
        { label: '持ち場で槍を揃える', note: '馬の胸へ槍を向ける' },
        { label: '森から横へ回る', note: '列を離れると囲まれる' },
      ], (i) => {
        F.mkFlank = i === 1;
        rt.after(i === 1 ? 8 : 3, go);
        if (i === 0) {
          for (const g of (HI(rt) ? [F.hirate, F.saku] : [])) if (g && g.count) { g.order = 'hold'; g.anchor = { x: 14, z: LINE_Z - 2 }; g.aggro = 14; }
          rt.say('組頭', '槍を揃えよ！　馬の胸を狙え。槍の石突きを地に立てよ！', 3.5);
          rt.marker('pike', { x: 14, z: LINE_Z - 2 }, '槍衾の場', { h: 2 });
          // 受ける段が終わるまで、持ち場の印を保つ。
        } else {
          rt.say('組頭', '行け！　森の陰から、赤備えの横腹へ回れ！', 3.5);
          rt.marker('pike', { x: 46, z: -44 }, '森の陰（横腹）', { h: 2 });
          // 森への到着か退く下知で印を消す。
          rt.after(18, () => { if (F.step === 2 && !F.dpOn && !F.ending) rt.bark('槍の列から離れすぎるな！'); });
        }
      }, 12);
    });
    rt.army.play('gallop', { x: 60, z: -50 }, 1.8);
    rt.marker('aka', centerOf(F.aka), '赤備え', { red: true, group: F.aka });
    rt.say('足軽', '赤い騎馬じゃ！　右から来る！', 3);
    // 後ろの赤備えの大軍は、山県の備（部隊の軽い作り）が森の際まで寄せて見せる（takedaMove）
    if (F.cl) { F.cl.cavalry('B', { from: 1, count: 160, flag: 'akazonae', armor: AR.akazonae, delay: 2 }); rt.after(8, () => F.cl.cavalry('B', { from: -1, count: 100, flag: 'takeda', armor: AR.takeda })); rt.after(12, () => F.cl.rout('A', { hideAfter: 20, from: 1 }));  }
    // 鶴翼が破れる早さは、武田の頭の手で変わる（左を回られると早く、右から来ると遅い）
    const tkT = F.tPlan === 'hidari' ? 6 : F.tPlan === 'migi' ? 13 : 10;
    rt.after(Math.max(1, tkT - 3), () => {
      if (F.step !== 2 || F.ending) return;
      rt.say('物見', '徳川の旗が後ろへ揺れる！　横の列が押されておりまする！', 3);
      for (const b of [F.bA.ishikawa, F.bA.honda]) if (b?.light) b.light.advance(-4, 3);
    });
    rt.after(tkT, () => { if (F.ending || F.step !== 2) return; rt.say('足軽', '徳川の手が崩れた……！　鶴翼が破れておる！', 3.5); F.toku.noRout = false; F.toku.morale = 10; allyFall(rt, F.bA.ishikawa, 0.3); allyFall(rt, F.bA.honda, 0.35);
      const H = F.campA; for (const g of [H.general && H.general.group, H.guard]) if (g && g.count) { g.order = 'path'; g.path = RETREAT_ROAD.map((q) => q.slice()); g.pathIdx = 0; g.speed = 3.2; g.noRout = true; g.onArrive = (q) => { q.order = 'hold'; }; } });
  },

  // ③ 平手の討ち死に、浜松城へ退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.retreating = true;
    rt.setPhase('retreat');
    rt.world.setTime('night');
    rt.unmark('aka'); rt.unmark('exit'); rt.unmark('pike'); rt.unmark('oiwake');
    if (F.hiraU.alive) { F.hiraU.invuln = false; rt.army.kill(F.hiraU, null); }
    sfx('kane', 0.4);
    rt.banner('平手汎秀、討ち死に', '織田の援軍は崩れ、浜松城へ退く');
    rt.say('組頭', '浜松の城へ退け！　走る気力を残せ。追手が迫ったら向き直って構えよ！', 4);
    rt.obj('main', HI(rt) ? '自分の一手と共に、浜松城へ退け' : '追ってくる武田勢を振り切り、浜松城へ退け', 'main');
    F.retreatPoint = { x: 10, z: 60 }; F.retreatIdx = 0;
    while (F.retreatIdx < RETREAT_ROAD.length - 1 && rt.player.u.pos.z > RETREAT_ROAD[F.retreatIdx][1]) F.retreatIdx++;
    F.retreatPoint.x = RETREAT_ROAD[F.retreatIdx][0]; F.retreatPoint.z = RETREAT_ROAD[F.retreatIdx][1];
    rt.marker('hama', () => F.retreatPoint, () => F.retreatIdx === RETREAT_ROAD.length - 1 ? '浜松城の口へ' : '犀ヶ崖の東を下る・次の曲がり角', { h: 3 });
    rt.zone('hama', HAMA.x, HAMA.z, 10);
    applyLook(rt, NIGHT);
    for (const g of [F.hirate, F.saku]) { g.order = 'path'; g.path = RETREAT_ROAD.map((q) => q.slice()); g.pathIdx = 0; g.speed = 3; g.noRout = true; g.onArrive = (q) => { q.order = 'hold'; }; }
    // 追手
    F.chase = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { fixed: true, faction: 'takeda', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1, speed: 3.2 }, depthLook(rt, list, TAKEDA));
      F.chase.push(g);
      rt.marker('c' + F.chase.length, centerOf(g), name, { red: true, group: g });
      return g;
    };
    // 追手は台地の既定の入口から来る。本人の位置に合わせて湧かせない。
    rt.after(6, () => { if (!F.ending && F.step === 3 && !F.dpOn) mk(-20, 0, '追ってくる武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }]); });
    rt.after(34, () => {
      if (F.ending || F.step !== 3 || F.dpOn) return;
      mk(30, 40, '回り込んだ武田勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.3) }]);
      // 後ろに武田の本隊（内藤昌豊の後詰の備）が原を埋めて続く（軽い作り）。追手は数人ずつでなく、大軍の先の手として見せる
      adv(F.bT.naito, 160, 60);
      rt.say('足軽', '原いっぱいに武田の旗が……！　振り返るな、走れ！', 3);
    });

    // 家康と護衛は東の道を下る。身代わりの名乗りは確定した出来事として演じない。
    const ie = F.campA.general ? F.campA.general.group : null;
    if (ie) {
      ie.noRout = true; ie.speed = 4; ie.order = 'path';
      ie.path = RETREAT_ROAD.map((q) => q.slice()); ie.pathIdx = 0; ie.onArrive = (q) => { q.order = 'hold'; };
    }
    F.ieyasuG = ie;
    const sg = F.shingariG;
    sg.order = 'path'; sg.path = [[10, 60], [14, 104]]; sg.pathIdx = 0;
    sg.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    if (F.aka && !gone(F.aka)) { F.aka.order = 'hold'; F.aka.noRout = false; }
    if (F.w1 && !gone(F.w1)) { F.w1.order = 'hold'; }
    // 東の酒井の備も、崖の東を通って浜松へ退く。
    allyFall(rt, F.bA.sakai, 0.2);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    F.ending = true;
    rt.setPhase('end'); F.returnedT = rt.t;
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= (F.chase || []).length; i++) rt.unmark('c' + i);
    for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '任務達成・浜松城へ退いた');
    survival(rt, '三方ヶ原から生きて浜松城へ退いた');
    sfx('horagai', 0.4);
    rt.banner('浜松城へ帰着', '徳川・織田勢は敗れた。生きて城へ戻った');
    rt.say('組頭', `……生きておったか、${nm(rt)}。平手殿は戻らなんだ。殿（信長公）に、何と申し上げればよいか`, 5);
    rt.after(6, () => rt.say('', '――武田勢はそのまま西へ進んだ。だが翌年、信玄は陣中で病が重くなり、四月、甲斐へ帰る途中で没した', 6));
    rt.player.u.invuln = true;
    rt.after(13, () => { if (!rt.over) { rt.finish({}, 0.2); rt.endT = 0.2; } });
  },

  // 実際の退路の断絶による終了。門の時間切れでは負けない。
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= (F.chase || []).length; i++) rt.unmark('c' + i);
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('取り残された', '浜松城へたどり着けず、武田の追手に退く道を断たれた');
    rt.say('足軽', '退く道が……追手に断たれた……！', 3);
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    butaiTick(rt, dt);
    if (F.ending || !rt.player.u.alive) return;
    // 手ほどきは一度きりなので、深手になる前に原因と退き方を字幕でも知らせる。
    const hit = rt.player.lastHit;
    if (F.step > 0 && rt.player.u.hp < rt.player.u.maxHp * 0.55 && hit && rt.t - hit.t < 8 && !(F.woundWarnT > rt.t)) {
      F.woundWarnT = rt.t + 12;
      const cause = hit.ranged ? (hit.type === 'bow' ? '矢が当たった！' : '鉄砲で撃たれた！') : hit.back ? '背中を突かれた！' : hit.side ? '横から打たれた！' : '正面から打たれた！';
      rt.bark(cause + (hit.ranged ? '横へ歩いて狙いを外し、味方の後ろへ退け' : '敵へ向いて「構え」を押し、味方の後ろへ退け'), true);
    }
    const p = rt.player.u.pos;
    // 備えの足元が接した所で押し合う。離れた備えに損害を与えない。
    fieldTick(rt, dt, F.fieldOpts);
    // 台本の隊が崩れたら、同じ備の部隊も揺らぐ（先手→小山田の備、赤備え→山県の備）
    if (!F.w1Hit && F.w1 && gone(F.w1)) { F.w1Hit = true; F.bT.oyamada.morale = Math.min(F.bT.oyamada.morale, 20); }
    if (!F.akaHit && F.aka && gone(F.aka)) { F.akaHit = true; F.bT.yamagata.morale = Math.min(F.bT.yamagata.morale, 22); }
    depthTick(rt, dt);
    // 家康と供は同じ道を退く。供が遅れた時は大将の歩みを落とす。
    const guard = F.campA.guard, chief = F.campA.general;
    if (chief?.alive && guard?.order === 'path') {
      let rear = 0;
      for (const q of guard.units) if (q.alive && !q.fleeing && !q.woundOut) rear = Math.max(rear, Math.hypot(q.pos.x - chief.pos.x, q.pos.z - chief.pos.z));
      if (chief.group && chief.group !== guard) chief.group.speed = rear > 12 ? 1.8 : 3;
      guard.speed = rear > 18 ? 2.6 : 3;
      for (let i = 0; i < 2; i++) {
        const g = i === 0 ? F.hirate : F.saku;
        if (g.order === 'path') g.speed = Math.hypot(g.anchor.x - guard.anchor.x, g.anchor.z - guard.anchor.z) > 24 ? (g.anchor.z > guard.anchor.z ? 2.4 : 3.2) : 3;
      }
    }
    if (F.dpOn || F.ifOn) return;
    if (F.step === 1) {
      rt.objProgress('main', '敵へ向いて「構え」を押せ。矢は横へ歩いて避けよ');
      if (F.w1.count < 6 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 25);
      // 武田の奥へ出たことを記録する。別の勝ち筋にはしない。
      if (!F.overchase && p.z < -85) F.overchase = true;
      if ((gone(F.w1) && rt.t - F.stepT > 30) || rt.t - F.stepT > 55) this.deep(rt, 'A');
    }
    if (F.step === 2) {
      if (F.mkFlank && Math.hypot(p.x - 46, p.z + 44) < 5) { F.mkFlankArrived = true; rt.unmark('pike'); }
      if (F.mkFlankArrived && !F.mkFlankFought) {
        if (rt.player.u.swing?.target?.group === F.aka && rt.player.u.swing.res != null) F.mkFlankFought = true;
        for (const q of rt.squad) if (q.alive && !q.fleeing && !q.woundOut && q.atk && q.target?.group === F.aka && Math.hypot(q.pos.x - 46, q.pos.z + 44) < 18) F.mkFlankFought = true;
      }
      rt.objProgress('main', F.mkFlank ? (F.mkFlankArrived ? '森の陰に着いた。味方と赤備えの横へ当たれ' : '森の陰の印へ。列を離れすぎるな') : '右から来る馬へ槍を向け、味方と列を保て');
      if (rt.t - F.stepT > 45 || (F.aka.count < 8 && rt.t - F.stepT > 28)) {
        rt.unmark('pike');
        if (rt.player.u.alive && !F.akaPaid) {
          F.akaPaid = true;
          if (F.mkFlank && F.mkFlankArrived && F.mkFlankFought && F.aka.count <= F.aka0 * 0.6) rt.award((t) => { t.special = { label: '赤備えの横腹を突いた', pts: Math.max(t.special ? t.special.pts : 0, 20) }; }, '赤備えの横腹を突いた');
          else if (!F.mkFlank && Math.hypot(p.x - 14, p.z - (LINE_Z - 2)) < 18 && !gone(F.hirate)) rt.award((t) => t.side.push('槍衾で赤備えを受け止めた'), '槍衾で赤備えを受け止めた');
        }
        this.deep(rt, 'B');
      }
    }
    if (F.step === 3) {
      while (F.retreatIdx < RETREAT_ROAD.length - 1 && Math.hypot(p.x - RETREAT_ROAD[F.retreatIdx][0], p.z - RETREAT_ROAD[F.retreatIdx][1]) < 1.8) F.retreatIdx++;
      F.retreatPoint.x = RETREAT_ROAD[F.retreatIdx][0]; F.retreatPoint.z = RETREAT_ROAD[F.retreatIdx][1];
      const d = Math.hypot(p.x - HAMA.x, p.z - HAMA.z);
      for (const q of F.chase || []) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      rt.objProgress('main', F.retreatIdx === RETREAT_ROAD.length - 1 ? '浜松城の口へ入れ。退く働きも戦功になる' : '犀ヶ崖を避け、東の道を下れ。曲がり角の印をたどれ');
      // 城へ入ったら退き口は終わる。開いた門で新たな総攻めを受ける筋にはしない。
      if (d < 8 && p.z > HAMA.z - 8) {
        for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.seekRange = 0; q.aggro = 0; }
        this.win(rt);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (F.mkFlankArrived && v.group === F.aka && k && (k.isPlayer || rt.squad.includes(k))) F.mkFlankFought = true;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// 両軍の総勢（徳川・織田 一万一千ほど、武田 三万ほど。数には諸説ある）
mikatagahara.force = () => ({ a: 11000, a0: 11000, b: 30000, b0: 30000 });
mikatagahara.sides = { a: { name: '徳川・織田軍', mon: 'oda' }, b: { name: '武田軍', mon: 'takeda' } };
mikatagahara.taisho = { b: { name: '武田信玄', use: true }, a: { name: '徳川家康', use: true } };
mikatagahara.wakeRoom = 210; // 台本の新手・武将の余地を残す
mikatagahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
// 軍議（gungi.js・F5）：援軍の構えを二つから選ぶ。史実の既定は鶴翼（徳川と並んで正面で迎える）
//   ①kakuyoku（既定）：鶴翼に開いて正面で迎える
//   ②migi：佐久間の手を右（根洗の小高い所・森の側）へ寄せて横を固める。位置だけ変える。敵の攻撃力は変えない
// 軍議の入口は main.js の総大将の身分制限に従う。足軽は既定の下知で進む。
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
      { name: '小山田信茂の備（先手）', known: false },
      { name: '山県昌景の赤備え', known: false },
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
  // 右を固める：佐久間の手を根洗の小高い所へ（移動と向きだけ変える）
  if (F.strategy === 'migi' && F.saku) { F.saku.anchor = { x: NEARAI.x, z: NEARAI.z + 4 }; F.saku.facing = Math.PI * 1.1; }
};
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
mikatagahara.famous = [
  ...HISTORICAL_GENERALS.mikatagahara,
];
mikatagahara.date = (rt) => `元亀三年十二月二十二日　冬・${rt.flags.step >= 3 ? '夜' : '夕暮れ'}`;
mikatagahara.canSkip = (rt) => rt.flags.returnedT !== undefined && !rt.over && rt.t - rt.flags.returnedT >= 5 ? '結果へ進む' : rt.phase === 'brief' && rt.t > 3 ? '先手の下知まで待つ' : '';
mikatagahara.skip = (rt) => { if (rt.flags.returnedT !== undefined && !rt.over && rt.t - rt.flags.returnedT >= 5) { rt.finish({}, 0.2); rt.endT = 0.2; } else if (rt.phase === 'brief') mikatagahara.first(rt); };
mikatagahara.history = '元亀三年（1572）十月、甲斐の武田信玄は三万ほどの兵で西へ攻め上った。遠江の二俣城を落とした武田勢は、十二月二十二日、徳川家康の浜松城の前を通り過ぎ、三方ヶ原の台地の西、祝田の坂を下りて三河へ向かおうとした。家康は城を出て、信長が送った援軍（佐久間信盛・平手汎秀ら三千ほど、滝川の参戦には異説）とともに、その背を追った。三河物語や甲陽軍鑑には、信玄が追撃を見越して坂の手前で向きを変え、魚鱗の備えで待ち受けたとある（誘いであったとも）。徳川・織田勢は鶴翼に開いたとも伝わるが、小山田・馬場・山県・武田勝頼らの備えが次々に寄せ、夕刻の会戦で大敗した。織田の援軍の平手汎秀は討ち死にし、家康はわずかな供と浜松城へ逃げ帰った。家康は城門を開けて篝火を焚かせ、武田は罠を疑って入らなかったとも伝わる。武田勢の先手が石を投げかけたという話もある。信玄はそのまま西へ進んだが、翌年、陣中で病が重くなり、四月、甲斐へ帰る途中で没した。犀ヶ崖の夜討ちも後の伝えにあるが、この戦では台地から浜松へ退く流れまでを扱う。雪の有無や細かな寄せの順は確かでなく、雪景色は置かない。兵の数には諸説ある。武田は約三万、徳川・織田は約一万一千とも。浜松の城口の木柵と屋敷は徳川期の城の簡略な復元であり、当日の縄張りとはしない。地形と時間は縮めている。降雪を伝える市の解説もあるが、当日の天候を確定しない。この戦の各備の兵数・細かな位置は遊びの復元であり、確かな布陣図とはしない。';

// 素直な遊び手：先手を受け、赤備えと戦い、浜松城へ走る
// 持ち場と退き口への下知を、遊び手の性格による敵への突進で上書きしない。
mikatagahara.botOrders = true;
mikatagahara.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn && F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (F.step === 3) {
    // 追手は次々に来る。近くの敵を倒すまで待つと、いつまでも城へ退けない。
    inp.leftPressed = false; inp.guardHold = false; inp.chargeHold = false;
    inp.runHeld = true;
    goTo(p, inp, HAMA.x, HAMA.z, 3);
    return;
  }
  inp.leftPressed = false; inp.guardHold = false; inp.chargeHold = false;
  inp.runHeld = false;
  // 先手を受ける持ち場は平手の槍列の後ろ。西の隊との隙間へ戻らない。
  // 開戦前も平手の陣に続く。赤備えの段では、選んだ受け方の印へ移る。
  const flank = F.step === 2 && F.mkFlank;
  const postX = F.step === 2 ? (flank ? 46 : 14) : F.hirate.anchor.x + 3;
  const postZ = F.step === 2 ? (flank ? -44 : LINE_Z - 2) : F.hirate.anchor.z + 4;
  // 最寄りの兵を追わず、実際の打ち手へ構える。槍の列から前へ出ない。
  let attacker = null, ad = 10;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < ad) { attacker = o; ad = d; }
  }
  const e = attacker || strikeTarget(b, 6);
  if (Math.hypot(u.pos.x - postX, u.pos.z - postZ) > (flank && !F.mkFlankArrived ? 3 : 6) ||
      (F.step === 1 && u.pos.z < F.hirate.anchor.z - 2)) {
    // 寄せる敵が見えても、列へ戻る足を止めない。敵に正面を向けて下がる。
    if (p.lock) inp.e.add('KeyQ');
    if (e) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.guardHold = !!attacker;
      const dx = postX - u.pos.x, dz = postZ - u.pos.z;
      const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
      const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
      if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
    } else goTo(p, inp, postX, postZ, 2);
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    patientStrike(p, inp, e, d);
    // 届かない相手を見たまま止まらず、持ち場の中だけで間合いを詰める。
    // 振りかぶりと馬の突進は追わず、槍の列より前へも飛び出さない。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (!attacker && !e.charging && d >= reach && F.step > 0) {
      const dx = e.pos.x - postX, dz = e.pos.z - postZ;
      const scale = Math.min(1, 5 / (Math.hypot(dx, dz) || 1));
      const next = b._mkBotPoint || (b._mkBotPoint = { x: 0, z: 0 });
      next.x = postX + dx * scale;
      next.z = postZ + dz * scale;
      if (F.step === 1) next.z = Math.max(F.hirate.anchor.z - 1, next.z);
      if (!b.army.wallBetween(u.pos, -1, next)) goTo(p, inp, next.x, next.z, 0.5);
    }
    return;
  }
  goTo(p, inp, postX, postZ, 2);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 苦しい戦：前・左右・後ろから武田の大軍が包み込む。勝つことではなく、生き残ることが勝ち
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n }), uB = (n) => ({ type: 'bow', n });
const aka = (list) => ({ faction: 'akazonae', flag: 'akazonae', armor: AR.akazonae, list: dress(list, AKA) });
// 鉄砲組：鉄砲だけの組は、並んで構え、号令で一斉に撃つ（units.js）
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
function mkCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: AR.takeda, dmg: 1, calmRest: false, fixedSpawn: true, backing: false, scale: 1, mass: 260, look: (l) => depthLook(rt, l, TAKEDA),
    friends: () => [F.hirate, F.saku, F.toku].filter((g) => g && g.count && !g.routed) };
}
// A 先手の後：魚鱗の寄せ → 赤備えの気配
function mkA() {
  const at = { x: 0, z: LINE_Z };
  return [
    rest({ dur: 7, heal: 0, say: [['組頭', '先手は退いた。……じゃが、あれは先手に過ぎぬ'], ['足軽', '原の向こう一面が、武田の旗じゃ……'], ['組頭', '魚鱗に固めて来るぞ。槍を揃え直せ']] }),
    hold({ at, dur: 62, r: 15, title: '魚鱗の寄せ', sub: '武田の大軍が、一つの塊になって押し寄せる', label: '平手の陣', obj: '平手の陣で、波のように寄せる武田を受け流せ',
      say: [['組頭', '一歩も退くな！　ここで崩れれば徳川殿の鶴翼が割れる！']],
      waves: [
        { t: 4, say: ['足軽', '石じゃ！　石を投げてくる！　その後ろから槍が……'], foes: () => [{ name: '小山田信茂の先手', from: { x: 0, z: LINE_Z - 60 }, list: [uS(3), uA(14)], mass: 400, noRout: 0 }] },
        { t: 20, say: ['組頭', '鉄砲衆が並んだ！　横へ歩いて狙いを外せ。槍では弾を防げぬ！'], foes: () => [gunLine('武田の鉄砲衆', { x: 22, z: LINE_Z - 46 }, 8)] },
        { t: 36, say: ['足軽', '馬場の旗じゃ！　左へ回って、徳川の手との間を割る気じゃ！'], foes: () => [{ name: '馬場信春の手（左へ回る）', from: { x: -54, z: LINE_Z - 24 }, off: { x: -8, z: 0 }, list: [uS(2), uA(11)], mass: 280 }] },
        { t: 52, say: ['組頭', '山県の手が右から来た！　波のように寄せおる、押し包まれるぞ！'], foes: () => [{ name: '山県昌景の手（右へ回る）', from: { x: 56, z: LINE_Z - 10 }, off: { x: 8, z: 4 }, list: [uS(2), uA(10), uB(3)], mass: 260 }] },
        { t: 56, say: ['組頭', '勝頼の二の手じゃ！　息を継ぐ間を与えぬ気か……！'], foes: () => [{ name: '武田勝頼の二の手', from: { x: 8, z: LINE_Z - 58 }, list: [uS(2), uA(11)], mass: 320 }] },
      ],
      reward: '魚鱗の寄せを受け流した', lost: ['組頭', '押し込まれた……！　立て直せ！'] }),
    rest({ dur: 6, heal: 0, bark: '立て直し：右へ槍を向け直す', say: [['足軽', '……右の森の向こう、赤いものが動いておる'], ['組頭', '赤備えか……！　右じゃ、右に槍を向けよ！']] }),
  ];
}
// B 赤備えの後：佐久間の下知で台地の南へ退き、坂の上で味方を通す。
function mkB() {
  return [
    rest({ dur: 6, heal: 0, bark: '援軍が崩れ始めた', say: [['組頭', 'もう持たぬ！　台地の南へ退け。坂を下りる者を先に通せ！']] }),
    move({ to: { x: 14, z: 56 }, r: 10, label: '台地の南', obj: '佐久間の手と共に、台地を南へ退け',
      say: [['組頭', '走れ！　武田に囲まれる前に坂へ退け！']],
      ambush: { d: 30, t: 24, title: '回り込まれた', sub: '武田の一手が、退く道を塞ぐ', say: ['足軽', '前にも武田じゃ！　回り込まれておる！'], foes: () => [{ name: '道を塞ぐ武田勢', from: { x: 40, z: 76 }, list: [uS(2), uA(10)], mass: 260 }, gunLine('道の脇の武田の鉄砲', { x: -20, z: 70 }, 6)] } }),
    // 台地の端で殿：坂を下りる味方の背を守る（織田の援軍の退き口）
    rest({ dur: 6, heal: 0, bark: '坂の上で組をそろえる', say: [['組頭', 'ここで一度踏みとどまれ！　後ろの者を先に坂へ下ろすのじゃ']] }),
    hold({ at: { x: 14, z: 62 }, dur: 38, r: 14, title: '台地の端の殿', sub: '坂を下りる味方の背を、武田勢が追う', label: '台地の端',
      obj: (rt) => (HI(rt) ? '預かった一手で殿を務め、坂を下りる味方を守れ' : '坂の上で踏みとどまり、下りる味方の背を守れ'),
      waves: [
        { t: 4, say: ['足軽', '追ってくる！　原いっぱいに武田の旗じゃ！'], foes: () => [{ name: '追いすがる武田勢', from: { x: 4, z: 8 }, list: [uS(2), uA(11)], mass: 300 }] },
        { t: 34, say: ['組頭', '鉄砲を並べおった！　身を低うせよ、じきに下りられる！'], foes: () => [gunLine('台地の上の武田の鉄砲', { x: 34, z: 22 }, 6)] },
      ],
      reward: '台地の端で殿を務めた', lost: ['組頭', 'もうよい、下りよ！　城へ走れ！'] }),
  ];
}
export { mikatagahara };
