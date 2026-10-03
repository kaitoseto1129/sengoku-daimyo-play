// ======================================================================
// 織田家編　岩村城の戦い・水晶山の夜討ち（天正三年十一月十日）
// 長篠の戦いの後、織田信忠は東美濃の岩村城（武田の秋山虎繁が守る）を囲んだ。
// 十一月十日の夜、城から武田勢が打って出て、織田方の水晶山の陣を襲ったが、河尻秀隆・毛利長秀らがこれを退け、
// 多くの武田の者が討たれた。後詰の来ない城はまもなく開かれた。
// 足軽は河尻秀隆の手（信忠の軍）。①夕暮れ、水晶山の陣の柵の守りにつく ②夜、城から打って出た武田勢の夜討ちを柵で受け止める
// ③退く武田勢を、城の麓まで追う
// 向き：北（-z）の山の上に岩村城。南（+z）の水晶山に信忠の陣
// ======================================================================
import { nobori, hut, yagura, campfire, jinmaku, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt, horseHost } from './b_tano.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold, move } from './b_depth.js';
import { camp } from './b_mid.js';
import { yamaLift, switchback } from './yamalift.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { IWAMURA_SUISHOZAN_PLAN, IWAMURA_CASTLE_PLAN, HON as IWA_HON, SHU as IWA_SHU, ROAD as IWA_ROAD, SIDE_ROADS as IWA_SIDE_ROADS } from './castles/iwamura.js';
import { chooseRoute } from './siege_ai.js';
import { nightAccuracyMult } from './siege_vis.js';
import { makeKakoi, kakoiEvent, kakoiGaugeText } from './kakoi.js';

import { demDetail } from './dem.js';
// 国土地理院の標高（asset_dem_iwamura.js。山頂は格子の中心から z+70m）は、そのまま混ぜると桁違いに急だった。
// そこで山の形（高さ）は手書きのままにし、尾根と谷の凹凸（まわり平均との差）だけを 0.3 倍で足す。本丸（z=-258）が山頂に合う。
let dem = null;
import('./asset_dem_iwamura.js').then((m) => { dem = m.default; }).catch(() => {});
// 夜討ちが来る口（castles/iwamura.js の水晶山砦の縄張りに合わせた三つの道）。毎回同じ口にならないよう chooseRoute で選ぶ
const RAID_ROUTES = [
  { id: 'center', x: -10, defThickness: 2, pathLen: 1, chokeWidth: 1.4 },
  { id: 'west', x: -46, defThickness: 1.1, pathLen: 1.3, chokeWidth: 1 },
  { id: 'east', x: 46, defThickness: 1.1, pathLen: 1.3, chokeWidth: 1 },
];
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const FENCE_Z = -6;                         // 陣の柵
const CASTLE = { x: IWA_HON.x, z: IWA_HON.z };   // 岩村城・本丸（最高所。本丸約717m・山麓との差約180mの高い山城）
const FOOT = { x: 0, z: -90 };              // 城の麓（追う先。登城道はここから主郭・本丸へ折れながら登る）
const POSTS = [{ x: -16, z: FENCE_Z + 5 }, { x: 18, z: FENCE_Z + 5 }];   // 柵の持ち場（篝火を焚く所）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.03 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 水晶山（南の陣）と、岩村城の山（北。本丸と山麓の差約180mに合わせ、幅広く高い尾根にする）
  h += 10 * gauss(x, z, 0, 50, 3000) + 92 * gauss(x, z, CASTLE.x, CASTLE.z + 40, 11000);
  if (dem) h += demDetail(dem, x, z, { xy: 1, ox: CASTLE.x, oz: CASTLE.z, cz: 70, win: 25, scale: 0.3 });
  return h;
}
// 水晶山砦（織田の陣）の段と、岩村城（曲輪の段）の二つを下地に重ねる（castles/iwamura.js）
let CASTLE_HEIGHT = null;
function heightRaw(x, z) {
  if (!CASTLE_HEIGHT) {
    const campHeight = heightOf(IWAMURA_SUISHOZAN_PLAN, baseTerrain, 3);
    CASTLE_HEIGHT = heightOf(IWAMURA_CASTLE_PLAN, campHeight, 3);
  }
  return CASTLE_HEIGHT(x, z) + yamaLift(x, z, LIFT);
}

const iwamura = {
  noWake: true,
  spawn: { x: 6, z: 14, heading: Math.PI },
  world: {
    seed: 15755,
    moveLim: 280,   // 岩村城の本丸は z≈-258。既定の 176 だと城の上の兵が城の麓まで一息に引き戻されていた（見回り 10/2）
    time: 'dusk',
    nightLift: 4.5,
    autumn: true,
    muddy: 0.3,
    mist: true,   // 霧が出やすい山城。戦の始めは霧が深く、しだいに晴れる（夜討ちの間は別に、ときどきまた出す＝update）
    paths: [[[0, 120], [0, FENCE_Z], ...switchback([0, FENCE_Z], [0, FOOT.z], 3, 20), ...IWA_ROAD], ...IWA_SIDE_ROADS],
    height,
    clear: (x, z) => Math.abs(x) < 80 && z > -110 && z < 80,
    trees: 520,
    tufts: 3000,
    treeDensity: (x, z) => (Math.abs(x) < 80 && z > -110 && z < 80 ? 0.12 : 1),
    groves: [{ x: -50, z: -40, r: 12, n: 16 }, { x: 50, z: -60, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && z < -130,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0;
    F.kakoi = makeKakoi({ day: 1, foodDays: 1, morale: 60 });   // 岩村城の籠城（kakoi.js。夜襲を退けると城が弱る）
    // ---- 水晶山砦（castles/iwamura.js。陣の柵・木戸は下の wallLine で手組みのまま＝場と地形の段だけ借りる） ----
    F.C = buildCastlePlan(rt, IWAMURA_SUISHOZAN_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['honjin'] });
    // ---- 岩村城（外側曲輪→八幡曲輪→二の丸→主郭→本丸。土塁・切岸・木柵・木戸。石積みは本丸の足元だけ） ----
    F.castleC = buildCastlePlan(rt, IWAMURA_CASTLE_PLAN, { baseHeight: baseTerrain, edgeW: 3, buildGates: true, buildTowers: true, gateTeam: 1, towerTeam: 1 });
    // ---- 水晶山の陣：柵（口が二つ）、陣幕、小屋 ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.fenceSegs = [   // F.fence とは名付けない（playbot は F.fence がある戦を設楽原の柵とみなす）
      ...wallLine(rt, [[-60, FENCE_Z + 4], [-8, FENCE_Z]], { team: 0, hp: 900, name: '陣の柵', segLen: 6 }),
      ...wallLine(rt, [[8, FENCE_Z], [60, FENCE_Z + 4]], { team: 0, hp: 900, name: '陣の柵', segLen: 6 }),
    ];
    rt.scene.add(tawara(W, -18, 30, 0.3, 6), hut(W, 22, 28, 7, 5, -0.2));
    // 水晶山の本陣（総大将 織田信忠）と、岩村城の城将 秋山虎繁の陣所
    F.honjin = camp(rt, { x: 0, z: 44, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信忠', hat: 'kabuto_m', haori: 0x7a1d14 }, guard: 15, reserve: 200, runTo: { x: 0, z: FENCE_Z + 8 } });
    F.ehon = camp(rt, { x: -40, z: CASTLE.z + 6, facing: 0, team: 1, faction: 'takeda', mon: 'takeda', general: { name: '秋山虎繁', hat: 'kabuto_m', haori: 0x7a2a1c }, guard: 15, reserve: 150, runTo: { x: CASTLE.x, z: CASTLE.z + 30 } });
    rt.scene.add(yagura(W, -30, FENCE_Z + 8), yagura(W, 30, FENCE_Z + 8));
    for (const [x, z, k] of [[-8, 36, 'oda'], [8, 36, 'eiraku'], [-40, FENCE_Z + 8, 'oda'], [40, FENCE_Z + 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 包囲する織田の陣は水晶山一つに集めず、尾根・登城道の途中に散らす（見張り・兵糧所。大きな戦闘は置かない） ----
    rt.scene.add(yagura(W, 24, -64), nobori(W, 24, -70, 'oda', 6));              // 見張り：登城道の折れを見張る物見
    rt.scene.add(tawara(W, -24, 60, 0.3, 8), hut(W, -30, 66, 6, 4, -0.2));       // 兵糧所：本陣の裏に兵糧の俵と番小屋
    // ---- 岩村城の曲輪の建物（主殿・倉・番所くらい。大天守は置かない） ----
    // 本丸の主殿は縄張り（castles/iwamura.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に秋山虎繁（kaito 10/2）
    rt.scene.add(hut(W, IWA_SHU.x - 7, IWA_SHU.z + 3, 7, 5, 0.1, { h: 2.8, wall: 0x6a5a48, roof: 0x362e28 }));  // 主郭：倉
    rt.scene.add(hut(W, IWA_SHU.x + 6, IWA_SHU.z - 2, 5, 4, 0.1, { h: 2.4, wall: 0x6a5a48, roof: 0x362e28 }));  // 主郭：番所
    for (const [x, z] of [[CASTLE.x - 8, CASTLE.z + 6], [CASTLE.x + 8, CASTLE.z + 6]]) rt.scene.add(nobori(W, x, z, 'takeda', 7));
    // ---- 河尻秀隆の手（自分の持ち場）、毛利長秀の手 ----
    F.kawa = allyGroup(rt, { name: '河尻秀隆の手', anchor: { x: -14, z: FENCE_Z + 8 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      battleLook(rt, [{ type: 'samurai', n: 1, o: { name: '河尻秀隆', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.kawaU = F.kawa.units[0];
    F.mouri = allyGroup(rt, { name: '毛利長秀の手', anchor: { x: 20, z: FENCE_Z + 8 }, facing: Math.PI, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      battleLook(rt, [{ type: 'samurai', n: 1, o: { name: '毛利長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], ODA));
    F.oda = [F.kawa, F.mouri];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 4, z: FENCE_Z + 14 }, Math.PI, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-60, 50, 40, 12, 260, Math.PI, 0x2b3140, 'oda', 15751);
    DA(60, 50, 40, 12, 260, Math.PI, 0x2b3140, 'eiraku', 15752);
    F.castleDA = DA(CASTLE.x, CASTLE.z + 34, 40, 10, 200, 0, 0x3a2622, 'takeda', 15753);
    for (const [x, z] of [[-10, 40], [14, 42]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 城の坂の松明の列（遠くからも城の道筋が見える。B028・B030）
    for (let i = 2; i < IWA_ROAD.length; i += 3) { const [rx, rz] = IWA_ROAD[i]; W.addFire(rx + 3.5, rz, { torch: true, h: 1.6 }); }

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '足軽の一手を預かり、河尻秀隆の柵の持ち場につけ' : '河尻秀隆のもとで、陣の柵の守りにつけ', 'main');
    rt.say('河尻秀隆', `${nm(rt)}、秋山は後詰を待っておる。長篠に敗れた勝頼は来られまい`, 5);
    rt.say('河尻秀隆', '飢えた城兵は夜に来る。柵の持ち場に篝火を焚け。闇にまぎれさせるな', 5.5);
    rt.marker('kawa', unitPos(F.kawaU), '河尻秀隆', {});
    rt.after(14, () => this.prepare(rt));
  },

  // ① 篝火を焚く
  prepare(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('prepare');
    rt.unmark('kawa');
    rt.obj('main', rt.G.rank >= 3 ? `組の者を連れ、柵の持ち場に篝火を焚け（${POSTS.length}か所）` : `柵の持ち場に篝火を焚け（${POSTS.length}か所）`, 'main');
    POSTS.forEach((q, i) => {
      rt.marker('p' + i, q, '篝火', { h: 2 });
      rt.addInteract('p' + i, q, '篝火を焚く', () => this.light(rt, i), { r: 3, hold: 1.4 });
    });
  },
  light(rt, i) {
    const F = rt.flags;
    const q = POSTS[i];
    rt.uninteract('p' + i); rt.unmark('p' + i);
    rt.scene.add(campfire(rt.world, q.x, q.z)); rt.world.addFire(q.x, q.z);
    F.lit++;
    if (F.lit >= POSTS.length) {
      rt.award((t) => t.side.push('篝火を焚いた'), '柵の篝火をそろえた');
      rt.obj('main', '篝火のそばで槍をそろえ、夜討ちに備えよ', 'main');
      rt.objProgress('main', '');
      rt.after(8, () => this.raid(rt));
    }
    else rt.objProgress('main', `${F.lit}／${POSTS.length}`);
  },

  // ② 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('raid');
    for (let i = 0; i < POSTS.length; i++) { rt.uninteract('p' + i); rt.unmark('p' + i); }
    rt.world.setTime('night');
    rt.obj('main', HI(rt) ? '預かった柵の一手で、武田勢の夜討ちを受け止めよ' : '柵で武田勢の夜討ちを受け止めよ', 'main');
    // 静けさ→森から敵→見張りが気づく→警報→混乱、の順で始める（鐘や大音でいきなり始めない）
    rt.say('足軽', '……静かじゃの', 2.5);
    rt.after(3, () => rt.say('見張りの者', '……森が、動いた……気がする', 2.5));
    rt.after(5.5, () => {
      sfx('horagai', 0.8);
      rt.banner('夜討ち', '城から武田勢が打って出た。水晶山の陣へ押し寄せる');
      rt.say('足軽', '篝火の向こうに人影……武田じゃ！', 3);
      rt.say('河尻秀隆', '来たか！　柵を背に、槍を揃えよ。一人も柵を越えさせるな！', 3.5);
    });
    rt.after(9.5, () => rt.say('河尻秀隆', '柵を出るな。鉄砲で崩した所を、槍で突け', 4.5));
    // 柵の内に鉄砲組を並べ、寄せた所で一斉に放たせる
    F.fgun = allyGroup(rt, { name: '柵の内の鉄砲組', anchor: { x: 4, z: FENCE_Z + 5 }, facing: Math.PI, width: 18, aggro: 4, noRout: true, formation: 'line' },
      battleLook(rt, [{ type: 'gun', n: 10 }], ODA));
    volleyAt(rt, { guns: () => [F.fgun], foes: () => F.waves, who: '河尻秀隆', near: 26, drop: 28, max: 70, line: '柵の内の鉄砲がそろって火を吹いた。武田勢の足が止まる' });
    // 城の坂の下に、武田の騎馬が固まっている（軽い作り）
    F.horseDA = horseHost(rt, 46, -84, 34, 14, 180, 0, 15779);
    for (const [g, x] of [[F.kawa, -14], [F.mouri, 18]]) { g.order = 'hold'; g.anchor = { x, z: FENCE_Z + 4 }; g.aggro = 14; }
    // 柵の真ん中の口は、信忠の本陣から下りてきた馬廻の一手が槍で塞ぐ（口を空けておかない）
    F.gate = allyGroup(rt, { name: '信忠の馬廻の一手', anchor: { x: 0, z: FENCE_Z + 3 }, facing: Math.PI, width: 12, aggro: 12, noRout: true, formation: 'yari' },
      battleLook(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], ODA));
    F.gate.order = 'hold'; F.gate.defMult = 1.2; F.gate.dmgMult = 0.8;
    F.oda.push(F.gate);
    F.waves = [];
    const mk = (x, name, list) => {
      const g = enemyGroup(rt, { faction: 'takeda', name, anchor: { x, z: -70 }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 14, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, battleLook(rt, list, TAKEDA));
      // 夜討ちは闇の中（siege_vis.js のnightAccuracyMult）：撃つ側も討つ側も当たりが鈍る
      const nmul = nightAccuracyMult(rt.world);
      for (const u of g.units) { u.dmg *= nmul; if (u.type === 'gun') u.dmg *= 0.45; }
      F.waves.push(g);
      battleEvent(rt, EVENT_REINFORCEMENT, g.anchor, g, 1, false, '城から武田の新手が打って出る');
      rt.marker('w' + F.waves.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z: -60 }, 1.6);
      for (let k = 0; k < 3; k++) rt.world.addFire(x - 6 + k * 6, -64, { torch: true, h: 1.5 });
      return g;
    };
    // 初めの寄せは二手が一度にどっと来る（後ろに城兵の控えを付けて、大きな塊に見せる）
    rt.after(6, () => {
      const g1 = mk(-10, '打って出た武田勢', [{ type: 'busho', n: 1, o: { name: '座光寺為清', hat: 'kabuto_w', haori: 0x8a1a14 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 + more(rt, 0.4) }, { type: 'gun', n: 2 }]);
      const g2 = mk(24, '武田の新手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 + more(rt, 0.4) }, { type: 'bow', n: 6 }]);
      KIT.backOf(rt, g1, { flag: 'takeda', armor: KIT.ARMOR.takeda, kind: 'spear', w: 18, depth: 10, count: 120, seed: 15771, stop: () => g1.center().z > FENCE_Z - 14 });
      KIT.backOf(rt, g2, { flag: 'takeda', armor: KIT.ARMOR.takeda, kind: 'spear', w: 14, depth: 8, count: 80, seed: 15772, stop: () => g2.center().z > FENCE_Z - 14 });
    });
    // 騎馬の寄せ口は、守りの厚さ・道の長さ・口の狭さで毎回変える（siege_ai.js の chooseRoute。口の狭い西・東は薄いが遠い）
    rt.after(56, () => {
      if (F.step !== 2) return;
      const route = chooseRoute(RAID_ROUTES);
      const hg = mk(route.x, '武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }, { type: 'ashigaru', n: 6 }]);
      for (const u of hg.units) if (u.type === 'cavalry') u.dmg *= 0.5;
      rt.say('足軽', route.id === 'center' ? '騎馬も来るぞ！　真ん中の口を破らせるな！' : `騎馬じゃ！　柵の${route.id === 'west' ? '西' : '東'}の端を回らせるな！`, 2.5);
      rt.after(3, () => rt.say('河尻秀隆', '馬は柵を越えられぬ。柵の内から、馬の脚を槍で払え', 3.5));
    });
  },

  // ③ 城の麓まで追う
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('chase');
    for (let i = 1; i <= 3; i++) rt.unmark('w' + i);
    rt.award((t) => t.side.push('夜討ちを受け止めた'), '夜討ちを受け止めた');
    sfx('taiko', 1);
    rt.world.distMul = 1; F.fogOn = false;
    battleEvent(rt, EVENT_RETREAT, FOOT, null, 1, true, '夜討ちの武田勢が城の麓へ退く');
    rt.banner('追い討ち', '崩れた武田勢を、城の麓まで追う');
    rt.say('河尻秀隆', '追え！　城の麓までじゃ。城の上から撃たれる所までは入るな', 3.5);
    rt.obj('main', '退く武田勢を、城の麓まで追え', 'main');
    rt.marker('foot', FOOT, '城の麓', { h: 2 });
    rt.zone('foot', FOOT.x, FOOT.z, 8);
    for (const g of F.oda) { g.order = 'move'; g.dest = { x: g === F.kawa ? -8 : 8, z: FOOT.z + 10 }; g.speed = 2.8; g.onArrive = (q) => { q.order = 'hold'; }; }
    F.rear = enemyGroup(rt, { faction: 'takeda', name: '武田の殿', anchor: { x: 0, z: -60 }, facing: 0, order: 'attack', seekRange: 40, aggro: 14, width: 10, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 0.58 },
      battleLook(rt, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], TAKEDA));
    rt.marker('rear', centerOf(F.rear), () => `武田の殿・${moraleWord(F.rear.morale)}`, { red: true, group: F.rear });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('foot'); rt.unzone('foot'); rt.unmark('rear');
    if (F.rear && !gone(F.rear)) F.rear.morale = 0;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '水晶山の夜討ちを退け、城の麓まで追った', pts: 20 }; }, '任務達成・夜討ちを退けた');
    kakoiEvent.nightRaidWon(F.kakoi);   // 夜襲を退けると城が弱る（kakoi.js）
    sfx('horagai', 0.6);
    rt.world.setTime('day');
    rt.banner('夜が明ける', `岩村城の上の旗が、一本、また一本と下ろされていく（${kakoiGaugeText({ foodDays: F.kakoi.morale, foodMax: F.kakoi.moraleMax }, '城方の力')}）`);
    rt.say('河尻秀隆', `……城は、もう持つまい。${nm(rt)}、よう支えた`, 4.5);
    rt.after(5, () => rt.say('', '――後詰の来ない岩村城は開かれた。城将の秋山虎繁と、城主だった信長の叔母おつやの方は、岐阜で処刑されたと伝わる', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    if (F.ending) return;
    const p = rt.player.u.pos;
    depthTick(rt, dt);
    if (F.dpOn) return;
    if (F.step === 1 && rt.t - F.stepT > 22 && !F.litCall) { F.litCall = true; rt.say('河尻秀隆', `${nm(rt)}、日が落ちる！　印の持ち場に篝火を焚け。……城の坂で、もう松明が動いておる`, 4); }
    if (F.step === 1 && rt.t - F.stepT > 45) { for (let i = 0; i < POSTS.length; i++) if (rt.interacts.some((q) => q.id === 'p' + i)) this.light(rt, i); }
    // 夜討ちの間、ときどき霧が出る（いつも霧にはしない）。出ている間は見通しが縮み、鉄砲も当たりが鈍る
    if (F.step === 2 && !F.fogT) { F.fogT = rt.t + 34; }
    if (F.step === 2 && !F.fogOn && rt.t > F.fogT) { F.fogOn = true; rt.world.distMul = 0.4; rt.say('足軽', '霧が出てきた……足元に気をつけよ', 2.5); }
    if (F.fogOn && rt.t > F.fogT + 24) { F.fogOn = false; rt.world.distMul = 1; F.fogT = rt.t + 60; }
    if (F.step === 2) {
      const L = F.waves || [];
      rt.objProgress('main', `武田勢 ${L.reduce((a, q) => a + (gone(q) ? 0 : q.count), 0)}人`);
      for (const q of L) if (q.count < 5 && !gone(q)) q.morale = Math.min(q.morale, 20);
      if ((L.length >= 3 && L.every(gone)) || rt.t - F.stepT > 110) {
        for (let i = 1; i <= 3; i++) rt.unmark('w' + i);
        for (const q of L) if (!gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
        this.deep(rt, 'A', () => this.chase(rt));
      }
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - FOOT.x, p.z - FOOT.z);
      rt.objProgress('main', gone(F.rear) ? `麓まで ${Math.round(d)}m` : `武田の殿 ${F.rear.count}人`);
      if (F.rear.count < 4 && !gone(F.rear)) F.rear.morale = Math.min(F.rear.morale, 20);
      if ((d < 8 && gone(F.rear)) || rt.t - F.stepT > 90) {
        rt.unmark('foot'); rt.unzone('foot'); rt.unmark('rear');
        if (F.rear && !gone(F.rear)) F.rear.morale = 0;
        this.deep(rt, 'B', () => this.win(rt));
      }
    }
  },

  // 段を重ねる（b_depth.js）：A 夜討ちの本波（初めの寄せの後）→ B 城の麓（追い討ちの後）
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    rt.obj('main', which === 'A' ? '組を集め、下知に従って夜討ちを防げ' : '組を集め、城の麓で次の下知を聞け', 'main');
    rt.objProgress('main', '');
    depthStart(rt, iwCtx(rt), which === 'A' ? iwA() : iwB(), () => { F.dpOn = false; then(); });
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    const F = rt.flags;
    if (rt.t - (F.routSaidT ?? -99) < 8 || g.iwRoutSaid) return;
    g.iwRoutSaid = true; F.routSaidT = rt.t;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が城へ逃げていく！`, 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fenceSegs || []).includes(s)) rt.bark('陣の柵が破られた！', true);
  },
};

// 両軍の総勢（織田信忠の軍 三万ほど、岩村城の武田勢 三千ほど。数には諸説ある）
iwamura.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 20), a0: 30000, b: Math.max(500, 3000 - (F.ek || 0) * 10), b0: 3000 };
};
iwamura.sides = { a: { name: '織田軍（信忠）', mon: 'oda' }, b: { name: '武田軍（岩村城）', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
iwamura.famous = [
  { name: '座光寺為清', loose: 1, line: '伊那の座光寺為清なり！　水晶山の陣、踏み破れ！' },
];
iwamura.date = (rt) => `天正三年十一月十日　冬・${rt.flags.ending ? '明け方' : rt.flags.step >= 2 ? '夜' : '夕暮れ'}`;
iwamura.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
iwamura.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
iwamura.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
iwamura.history = '東美濃の岩村城は、城主の遠山景任が亡くなった後、その妻で信長の叔母にあたるおつやの方が治めていた。元亀三年（1572）、武田の秋山虎繁（信友）に攻められ、おつやの方は虎繁の妻となって、城は武田のものとなった。天正三年（1575）、長篠の戦いの後、織田信忠は岩村城を囲んだ。十一月十日の夜、城から武田勢が打って出て水晶山の織田の陣を襲った。河尻秀隆・毛利長秀らがこれを退け、多くの武田の者を討ったと『信長公記』は伝える。後詰の来ない城はまもなく開かれ、秋山虎繁とおつやの方は岐阜へ送られて処刑された。兵の数には諸説ある。';

// 素直な遊び手：篝火を焚き、柵の前で夜討ちを受け、城の麓まで追う
iwamura.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.dpOn) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 4, 26, 2); return; }
  // 夜討ちの間は、河尻の言う勝ち筋どおり柵の外へ出て追わない（柵に取り付いた者だけ突く）
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing && (F.step !== 2 || o.pos.z > FENCE_Z - 7));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    const it = b.interacts.find((q) => q.id.startsWith('p'));
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  // 柵の外へ出るときは、真ん中の口を通る
  const via = (x, z) => { if (u.pos.z > FENCE_Z - 1 && z < FENCE_Z - 1 && Math.abs(u.pos.x) > 5) { goTo(p, inp, 0, FENCE_Z + 3, 1); return; } goTo(p, inp, x, z, 2); };
  if (F.step === 2) { goTo(p, inp, -4, FENCE_Z + 10, 2); return; }
  if (F.step === 3) { if (!gone(F.rear)) { const c = F.rear.center(); via(c.x, c.z); return; } via(FOOT.x, FOOT.z); }
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 追いつめられた城兵の夜討ち：柵の前だけでなく、柵の両端を回り、陣の裏からも松明が湧く。城の鉄砲組が並んで撃ちかける
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 80, kind: 'gun', ...o });
// 波を出す時だけ人数を数える。加勢の余地を残し、厚みは後ろの軽い軍勢に任せる。
function battleLook(rt, list, look) {
  let room = 225;
  for (const u of rt.army.units) if (u.alive) room--;
  room = Math.max(0, room);
  return dress(list.map((q) => { const n = Math.min(q.n, room); room -= n; return { ...q, n }; }), look);
}
function iwCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: KIT.ARMOR.takeda, dmg: 0.6, mass: 260, look: (l) => battleLook(rt, l, TAKEDA),
    aid: { name: '信忠の本陣から来た加勢', faction: 'oda', flag: 'oda', list: [uS(2), uA(6)] }, aidSaid: '信忠の本陣から加勢が来た',
    friends: () => [F.kawa, F.mouri, F.gate, F.hosp].filter((g) => g && g.count && !g.routed) };
}
// A 初めの寄せの後：夜討ちの本波（柵の両端と陣の裏から）→ 打って出るか、柵で待つか
function iwA() {
  const at = { x: 0, z: FENCE_Z + 6 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['河尻秀隆', '初めの寄せは退けた。……じゃが、城の者はまだ半ばも出ておらぬ'], ['足軽', '城の坂に、松明が次々と……'], ['毛利長秀', '柵の西の端は、まだ柵が短い。回られるなら、あそこじゃ']] }),
    pick({ title: '夜討ちの本波が来る。組をどこに置く？',
      options: [{ label: '真ん中の口を固める', note: '口は一番の寄せ所。西の端は手薄になり、回り込まれる' }, { label: '柵の西の端を固める', note: '西の端を回らせない。口の寄せは味方だけで受ける' }],
      on: (rt, m, i) => { m.iwWest = i === 1; rt.say('河尻秀隆', i === 1 ? 'よし、西の端じゃ。回ってくる者を柵の外で叩け' : '口じゃ。柵の口で槍を揃えよ。口さえ持てば負けぬ', 3.5); } }),
    hold({ at: (rt, m) => (m.iwWest ? { x: -46, z: FENCE_Z + 6 } : at), dur: 92, r: 16, title: '夜討ちの本波', sub: '松明が、柵の前にも両端にも、陣の裏にも', label: '陣の柵', obj: (rt) => (HI(rt) ? '預かった一手で持ち場の柵を守り、武田の夜討ちを防げ' : '陣の柵を背に、四方から来る武田の夜討ちを防げ'),
      say: [['河尻秀隆', '本波じゃ！　柵を背に、前だけを見るな！'], ['河尻秀隆', '柵に取り付いた所を槍で突け。鉄砲が撃つ間は、柵の内へ下がれ']],
      waves: [
        { t: 4, say: ['足軽', '真ん中の口へ押し寄せてくる！'], foes: (rt, m) => [{ name: '口へ押し寄せる武田勢', from: { x: 0, z: -60 }, list: [uS(3), uA(m.iwWest ? 11 : 14)], mass: 360, noRout: 25 }] },
        { t: 20, say: ['河尻秀隆', '城の坂に鉄砲衆が並んだ！　篝火から離れよ、狙われるぞ！'], foes: () => [gunLine('城の鉄砲衆', { x: 20, z: -50 }, 8)] },
        { t: 38, say: ['足軽', '柵の西の端を回り込んだ！'], foes: (rt, m) => [{ name: '西の端を回る武田勢', from: { x: -80, z: -10 }, off: m.iwWest ? { x: -20, z: -12 } : { x: -14, z: 10 }, list: [uS(2), uA(m.iwWest ? 8 : 13)], mass: m.iwWest ? 160 : 300 }] },
        { t: 56, say: ['毛利長秀', '東の端もじゃ！　囲まれるぞ！'], foes: () => [{ name: '東の端を回る武田の騎馬', from: { x: 80, z: -6 }, off: { x: 14, z: 10 }, list: [uS(1), uC(7), uA(3)], mass: 220, kind: 'cavalry' }] },
        { t: 74, say: ['河尻秀隆', '城の者が総出じゃ……！　これを退ければ、城にはもう兵が残らぬ'], foes: () => [{ name: '総出の武田勢', from: { x: -8, z: -64 }, list: [uS(4), uA(13)], mass: 380 }] },
      ],
      reward: '夜討ちの本波を防ぎきった', lost: ['河尻秀隆', '柵の内へ入られた……！　押し出せ！'] }),
    fight({ at: { x: -14, z: 22 }, title: '陣の裏の火', sub: '闇にまぎれて山を回った武田勢が、陣の裏の小屋に火をかける',
      obj: (rt) => (HI(rt) ? '預かった一手を率いて陣の裏へ回り、火をかけた武田勢を討て' : '陣の裏へ回り、火をかけた武田勢を討て'),
      say: [['足軽', '陣の裏が燃えておる！　山を回られたぞ！'], ['河尻秀隆', '裏の者は少ない。柵の者は動くな。組の者だけで叩け']],
      foes: () => [{ name: '陣の裏に回った武田勢', from: { x: -46, z: 40 }, list: [uS(2), uA(10)], mass: 160 }],
      later: [{ t: 30, say: ['足軽', '東の山からも下りてくる！　信忠様の本陣の方じゃ！'], foes: () => [{ name: '本陣を狙う武田勢', from: { x: 40, z: 46 }, list: [uS(2), uA(9)], mass: 140 }] }],
      max: 110, reward: '陣の裏に回った武田勢を討った',
      onEnd: (rt) => { rt.world.addFire(-24, 30, { h: 1.4 }); } }),
    rest({ dur: 7, bark: '立て直し：組を寄せ直す', say: [['毛利長秀', '河尻殿、武田の足が止まった。今、打って出れば崩せる'], ['河尻秀隆', '……闇の中へ出るのは危うい。どうする']] }),
    pick({ title: '夜討ちの武田勢の足が止まった。どうする？',
      options: [{ label: '柵の口を開けて打って出る', note: '崩れかけた武田勢を突けば大手柄。闇の中で左右から挟まれるかもしれぬ' }, { label: '柵の内で、夜明けまで受け続ける', note: '柵は固い。武田はもう一度だけ寄せてくる' }],
      on: (rt, m, i) => { m.iwOut = i === 0; rt.say('河尻秀隆', i === 0 ? 'よし、口を開けよ！　松明を持つ者は前へ出すな' : 'よし、柵を固めよ。夜明けまでじゃ', 3); } }),
    fight({ skip: (rt, m) => !m.iwOut, at: { x: 0, z: -34 }, title: '打って出る', sub: '柵の口から、闇の中の武田勢へ', obj: (rt) => (HI(rt) ? '預かった一手を率いて柵の口から打って出、足の止まった武田勢を崩せ' : '柵の前の闇の中で、足の止まった武田勢を崩せ'),
      foes: () => [{ name: '足の止まった武田勢', from: { x: -6, z: -60 }, list: [uS(3), uA(12)], mass: 300, morale: 70 }],
      later: [{ t: 36, title: '挟まれる', sub: '闇の左右から武田勢', say: ['足軽', '左右の闇から出てきた！'], foes: () => [{ name: '左の闇の武田勢', from: { x: -46, z: -40 }, list: [uS(1), uA(9)], mass: 180 }, { name: '右の闇の武田勢', from: { x: 46, z: -36 }, list: [uS(1), uA(9)], mass: 180 }] }],
      max: 140, reward: (t) => { t.special = { label: '夜の柵から打って出て武田勢を崩した', pts: 20 }; }, rewardLabel: '夜の柵から打って出た' }),
    hold({ skip: (rt, m) => m.iwOut, at, dur: 80, r: 16, title: '最後の寄せ', sub: '武田が、もう一度だけ柵に取り付く', label: '陣の柵', obj: '柵の内で、武田の最後の寄せを受けよ',
      waves: [
        { t: 4, foes: () => [{ name: '最後の武田勢', from: { x: 10, z: -62 }, list: [uS(3), uA(13)], mass: 340 }] },
        { t: 36, say: ['足軽', 'また鉄砲が並んだ！'], foes: () => [gunLine('城の鉄砲衆', { x: -24, z: -52 }, 8)] },
        { t: 60, say: ['毛利長秀', '東の端に、また松明じゃ！'], foes: () => [{ name: '東の端の武田勢', from: { x: 70, z: -20 }, off: { x: 14, z: 8 }, list: [uS(2), uA(11)], mass: 240 }] },
      ],
      reward: '柵で夜討ちを受けきった' }),
  ];
}
// B 城の麓：城の口の鉄砲 → 降る使い → 夜明け
function iwB() {
  const at = { x: FOOT.x, z: FOOT.z + 6 };
  return [
    rest({ dur: 7, heal: 0.3, say: [['河尻秀隆', 'ここまでじゃ。これより上は、城の鉄砲が届く'], ['足軽', '城の口に……まだ兵が集まっておる']] }),
    pick({ title: '城の口に、逃げ込めなかった武田勢が集まっている。どうする？',
      options: [{ label: '城の口まで攻め寄せ、逃げ遅れた者を討つ', note: '首を挙げられる。城の上から鉄砲組が並んで撃ち下ろす' }, { label: '麓に陣を張り、城から出る者を受ける', note: '鉄砲の届かぬ所で待つ。城兵は打って出るほかなくなる' }],
      on: (rt, m, i) => { m.iwGate = i === 0; rt.say('河尻秀隆', i === 0 ? '行け。鉄砲の構えを見たら伏せよ' : '陣を張れ。夜明けまで待つぞ', 3); } }),
    fight({ skip: (rt, m) => !m.iwGate, at: { x: 0, z: FOOT.z - 22 }, title: '城の口', sub: '城の上から鉄砲衆が撃ち下ろす', obj: (rt) => (HI(rt) ? '一手を率いて城の口の前の武田勢を崩せ（城の鉄砲に気をつけよ）' : '城の口の前の武田勢を崩せ（城の鉄砲に気をつけよ）'),
      foes: () => [{ name: '城の口の武田勢', from: { x: 0, z: FOOT.z - 50 }, list: [uS(3), uA(12)], mass: 260, noRout: 20 }, gunLine('城の上の鉄砲衆', { x: 16, z: FOOT.z - 56 }, 10, { mass: 0 })],
      later: [{ t: 40, title: '城兵の突き出し', sub: '城の門から新手', say: ['足軽', '城の門が開いた！　新手じゃ！'], foes: () => [{ name: '城の門から出た新手', from: { x: -14, z: FOOT.z - 60 }, list: [uS(2), uA(11)], mass: 200 }] },
        { t: 70, say: ['足軽', '城の坂から、また一手下りてくる！'], foes: () => [{ name: '城の坂の武田勢', from: { x: 20, z: FOOT.z - 58 }, list: [uS(2), uA(10)], mass: 220 }] }],
      max: 150, reward: (t) => { t.special = { label: '岩村城の口まで攻め寄せた', pts: 20 }; }, rewardLabel: '岩村城の口まで攻め寄せた' }),
    hold({ skip: (rt, m) => m.iwGate, at, dur: 100, r: 14, title: '麓の陣', sub: '追いつめられた城兵が、麓の陣へ打って出る', label: '城の麓', obj: (rt) => (HI(rt) ? '預かった一手で麓の陣を固め、打って出る城兵を受けよ' : '城の麓の陣で、打って出る城兵を受けよ'),
      waves: [
        { t: 6, say: ['足軽', '城から打って出てきた！'], foes: () => [{ name: '打って出る城兵', from: { x: -4, z: FOOT.z - 56 }, list: [uS(3), uA(12)], mass: 300 }] },
        { t: 40, say: ['足軽', '坂の上に鉄砲衆が構えた！　身を低くせよ！'], foes: () => [gunLine('城の坂の鉄砲衆', { x: 18, z: FOOT.z - 40 }, 8)] },
        { t: 62, say: ['河尻秀隆', '騎馬が横から！'], foes: () => [{ name: '城の騎馬', from: { x: 50, z: FOOT.z - 20 }, list: [uS(1), uC(5), uA(3)], mass: 100, kind: 'cavalry' }] },
        { t: 84, say: ['河尻秀隆', '城兵が打って出た！　柵を守り抜け！'], foes: () => [{ name: '城兵の最後の突き出し', from: { x: -10, z: FOOT.z - 56 }, list: [uS(3), uA(12)], mass: 300 }] },
      ],
      reward: '麓の陣で城兵を受けきった' }),
  ];
}

export { iwamura };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 0, z: -258, tx: 0, tz: -172, w: 32, R: 150, rise: 60 };

let ROAD_HEIGHTS = null;
function height(x, z) {
  // 本丸までと枝道の全てをならす。道の高さを点の間でつなぎ、切岸の急な段差を登れる坂にする。
  if (!ROAD_HEIGHTS) ROAD_HEIGHTS = [[...switchback([0, FENCE_Z], [0, FOOT.z], 3, 20), ...IWA_ROAD], ...IWA_SIDE_ROADS]
    .map((pts) => pts.map(([px, pz]) => [px, pz, heightRaw(px, pz)]));
  const raw = heightRaw(x, z);
  let nearest = 6.3, roadH = raw;
  for (const pts of ROAD_HEIGHTS) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < nearest) { nearest = d; roadH = a[2] + (b[2] - a[2]) * t; }
  }
  const blend = Math.max(0, Math.min(1, (6.3 - nearest) / 3.5));
  return raw + (roadH - raw) * blend * blend * (3 - 2 * blend);
}
