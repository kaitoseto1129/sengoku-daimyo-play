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
import { nobori, hut, tawara, campfire, solidSeg, palisade, kabukimon } from './props.js';
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
  for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) room--;
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

// 布陣資料の本陣を原点にする。既存の縮尺と浜松までの距離を保つ。
const LINE_Z = -260 / 16;                        // 織田の援軍の陣
const TAKEDA_HQ_Z = -1700 / 16;                  // 信玄は魚鱗の最奥、中央
const OYAMADA_FRONT = (1700 - 1085) / 16;
const TAKEDA_SECOND = (1700 - 1300) / 16;
const TAKEDA_THIRD = (1700 - 1500) / 16;
const TAKIGAWA_X = 380 / 16;
const HAMA = { x: 0, z: 2800 / 16 };            // 浜松城の方（退く先）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };
const AKA = { flag: 'akazonae' };
const TOKU = { flag: 'tokugawa' };
const MIKATA_FALLEN_CLOTH = new WeakMap();
// 手持ちの幟は縦の竿。槍用の落下姿勢のままだと、布が兵の頭上に残る。
function fallenStandard(army, u) {
  const w = u.dropped, cloth = u.standardFlag;
  if (!w || !cloth || cloth.parent !== w || w.userData.mikataFallen) return;
  w.userData.mikataFallen = true;
  const pole = w.children.find((c) => c !== cloth && c.geometry);
  if (!pole) return;
  if (!pole.geometry.boundingBox) pole.geometry.computeBoundingBox();
  const box = pole.geometry.boundingBox, butt = box.min.y, tip = box.max.y, len = tip - butt;
  const a = w.rotation.y, sx = Math.sin(a), cz = Math.cos(a), x = w.position.x, z = w.position.z;
  const y0 = army.world.heightAt(x - sx * butt, z - cz * butt);
  const y1 = army.world.heightAt(x - sx * tip, z - cz * tip);
  const slope = Math.atan2(y1 - y0, len);
  w.rotation.set(-Math.PI / 2 + slope, a, 0, 'YXZ');
  w.position.y = y0 - Math.sin(slope) * butt + 0.035;
  // 上端と竿側を留め、裾を地へ垂らす。同じ布の形は使い回す。
  const source = cloth.geometry;
  if (!MIKATA_FALLEN_CLOTH.has(source)) {
    const geo = source.clone(), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const free = (1 - uv.getY(i)) * uv.getX(i);
      pos.setZ(i, -0.025 * free + Math.sin(pos.getX(i) * 32 + pos.getY(i) * 18) * 0.008 * free);
    }
    geo.computeVertexNormals();
    MIKATA_FALLEN_CLOTH.set(source, geo);
  }
  cloth.geometry = MIKATA_FALLEN_CLOTH.get(source);
  cloth.rotation.set(0, 0, 0);
  cloth.visible = true;
}
// 本人へ寄せる先頭は四人。馬の押し合いで囲まれぬよう、退き口では三人に絞る。
function mikataCombatSpace(army, u) {
  const p = army.playerUnit, front = army.mikataFront;
  if (!front || !p?.alive || u.team === p.team || u.isStruct || u.noTarget || u.type === 'bow' || u.type === 'gun' && !u.sidearm) return null;
  if (army.mikataFrontAt !== army.time) {
    army.mikataFrontAt = army.time; front.length = 0;
    const cap = army.mikataCap || 4;
    for (const o of army.units) {
      if (!o.alive || o.gone || o.fleeing || o.woundOut || o.downed || o.noTarget || o.isStruct || o.team === p.team || o.group?.routed ||
          o.type === 'bow' || o.type === 'gun' && !o.sidearm) continue;
      o._mkPlayerD = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (o._mkPlayerD > 32 || o._mkPlayerD > 8 && o.target?.alive && o.target !== p) continue;
      let i = 0;
      while (i < front.length && front[i]._mkPlayerD <= o._mkPlayerD) i++;
      if (i >= cap) continue;
      for (let j = Math.min(cap - 1, front.length); j > i; j--) front[j] = front[j - 1];
      front[i] = o;
    }
  }
  const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
  if (d > 32 || front.includes(u)) { u._mkWaiting = false; return null; }
  if (d >= 12 && !u._mkWaiting && u.target !== p && u.atk?.target !== p && u.swing?.target !== p) return null;
  // 味方と戦っている後続はその列を保つ。本人の刃の届く所へは押し込まない。
  if (d >= 8 && u.target?.alive && u.target !== p) { u._mkWaiting = false; return null; }
  u._mkWaiting = true;
  const q = u._mkWait || (u._mkWait = { x: 0, z: 0 });
  const a = d > 0.1 ? Math.atan2(dx, dz) : u.heading;
  q.x = p.pos.x + Math.sin(a) * 14; q.z = p.pos.z + Math.cos(a) * 14;
  return q;
}
// 薄暮（夕刻と夜のあいだ）：赤備えの突撃のころ。灯りが少なく、松明・旗・音が頼りになってくる
const WINTER_DUSK = { sky: 0x626b80, fog: 0x687080, sun: 0xe8ad8d, sunI: 1.1, hs: 0xb4bdce, hg: 0x655e49, hI: 1.5, top: 0x35455f, glow: 0.3, dir: [-1, 0.12, -0.2], mount: 0x293243 };
const TWILIGHT = { sky: 0x4c4a5c, fog: 0x55586b, sun: 0xe6a082, sunI: 1, hs: 0xaeb7cc, hg: 0x585347, hI: 1.5, top: 0x232a40, glow: 0.25, dir: [-1, 0.06, -0.2], mount: 0x1a1e28 };

// 草の割合を残し、霜と轍は既存の地面に描く。面・素材・兵の数を増やさない。
function winterGround(W) {
  const mat = W.terrain.material, compile = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => '三方ヶ原の冬の地面';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
      float roadX = wuv.y < 80.0 ? mix(6.0, 14.0, clamp((wuv.y + 16.25) / 96.25, 0.0, 1.0))
        : mix(14.0, 0.0, clamp((wuv.y - 136.0) / 39.0, 0.0, 1.0));
      float rutD = abs(abs(wuv.x - roadX) - 0.95);
      float rut = (1.0 - smoothstep(0.09, 0.28, rutD)) * smoothstep(0.22, 0.48, macro2);
      col *= 1.0 - rut * 0.42;
      float frost = smoothstep(0.57, 0.74, macro2) * smoothstep(0.42, 0.67, macro)
        * (0.3 + 0.7 * w.x) * (1.0 - rut);
      col = mix(col, vec3(0.72, 0.76, 0.73), frost * 0.7);
      diffuseColor.rgb *= col;`);
  };
  mat.needsUpdate = true;
  // 夜へ移る間も西の地平に残照を残す。月の向きとは別にする。
  const sky = W.skyMat;
  sky.uniforms.mikataSunset = { value: 1 };
  sky.fragmentShader = 'uniform float mikataSunset;\n' + sky.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', `
    float west = pow(max(0.0, -d.x), 3.0) * exp(-abs(d.y - 0.035) * 11.0);
    c += vec3(0.55, 0.1, 0.055) * west * mikataSunset;
    gl_FragColor = vec4(c, 1.0);`);
  sky.needsUpdate = true;
}

// 共通の褒め言葉・叱責も、この戦では生きている上役へ引き継ぐ。
function livingVoice(rt, speaker) {
  const F = rt.flags;
  let dead = speaker === '平手汎秀' && F.hiraU && !F.hiraU.alive;
  if (!dead && (speaker === '佐脇藤八' || speaker === '長谷川橋介')) {
    for (const u of rt.army.units) if (u.name === speaker && !u.alive) { dead = true; break; }
  }
  if (!dead) return speaker;
  return F.sakuU?.alive ? '佐久間信盛' : '組頭';
}
function retreatDistant(rt) {
  const F = rt.flags;
  if (F.pursuit) return;
  F.pursuitSound = { x: -6, y: rt.world.heightAt(-6, 20), z: 20 };
  F.retreatShotSound = { x: 34, y: rt.world.heightAt(34, 22), z: 22 };
  F.pursuit = rt.world.addDistantArmy({ x: -6, z: 20, w: 9, d: 8, count: 12, kind: 'cavalry',
    team: 1, armor: AR.takeda, flag: 'takeda', facing: 0, seed: 15729, host: false });
  F.pursuit.army.noWake = true;
  F.pursuit.moveTo(-6, 48, 24, { charge: true });
  rt.army.play('gallop', F.pursuitSound, 1.1);
  F.pursuitSoundT = rt.t + 5.5;
}

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
// 先に下った隊を、坂の上へ呼び戻さない。下知の時だけ道を作る。
function retreatGroup(g, speed = 3) {
  if (!g || !g.count || g.routed) return;
  if (g.order !== 'path') {
    const c = g.center();
    g.path = RETREAT_ROAD.map((q) => q.slice()); g.pathIdx = 0;
    while (g.pathIdx < g.path.length - 1 && c.z > g.path[g.pathIdx][1]) g.pathIdx++;
  }
  g.order = 'path'; g.speed = speed; g.noRout = true;
  g.retreatOnly = g.team === 0; // 味方は遠い追手へ引き返さず、手の届く敵だけ受ける。
  g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
}
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
  for (const id of ['yamagata', 'oyamada', 'baba', 'obata', 'katsuyori', 'naito']) adv(T[id], distance, seconds, stage === 'crash');
  if (stage !== 'first') return;
  if (P === 'hidari') {
    for (const id of ['baba', 'katsuyori']) {
      const b = T[id]; if (!b || b.routedL) continue;
      b.light.moveTo(b.pos.x - 14, b.pos.z + distance, seconds);
    }
    rt.after(9, () => rt.say('物見', '武田の左が動いた！　馬場と勝頼の旗、我らの端へ寄せる構えにござる！', 4));
  } else if (P === 'migi') {
    const b = T.yamagata;
    if (!b.routedL) b.light.moveTo(b.pos.x + 14, b.pos.z + distance, seconds);
    rt.after(9, () => rt.say('物見', '武田の右に赤い旗！　列を崩さず寄せてまいりまする！', 3.5));
  } else rt.after(9, () => rt.say('物見', '武田の中ほどが厚うござる！　正面へ押し寄せてまいりまする！', 3.5));
}
// 崩れた備は崖の手前で東の道へ寄り、浜松へ退く。
function allyFall(rt, b) {
  if (!b || b.routedL || b.fallen) return;
  b.fallen = true;
  if (!b.light) return;
  const secs = Math.max(8, Math.hypot(14 - b.pos.x, 104 - b.pos.z) / 2.4);
  b.light.moveTo(14, 104, secs);
  rt.after(secs, () => { if (!rt.over && !b.routedL) b.light.moveTo(HAMA.x, HAMA.z - 4, 30); });
}

// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const returned = sq.filter((x) => x.alive).length;
  const ready = sq.filter((x) => x.alive && !x.woundOut && !x.rearWound && !x.gone && !x.fleeing).length;
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? returned / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（生還 ${returned}／${sq.length}人）`), label);
  rt.bark(`戻った組の者 ${returned}人、うち働ける者 ${ready}人`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, `${label}・特別戦功 ${Math.max(rt.tracker.special?.pts || 0, pts)}点`);
}

// 三河物語・甲陽軍鑑に伝わる陣名。各備の人数と細かな位置は遊びの復元。
// 右・前は本陣から敵へ向いた時の向き。旗は既存の家の旗を使う。
const TAKEDA_JIN = {
  name: '魚鱗', team: 1, honjin: { x: 0, z: TAKEDA_HQ_Z }, facing: 0,
  head: (rt) => rt.flags.campB?.general,
  sonae: [
    ['yamagata', '第二陣右翼', '山県昌景', 4000, 300 / 16, TAKEDA_SECOND, 'akazonae'],
    ['oyamada', '先鋒', '小山田信茂', 2000, 0, OYAMADA_FRONT, 'takeda'],
    ['baba', '第三陣左翼', '馬場信春', 4000, -350 / 16, TAKEDA_THIRD, 'furin', 'naito'],
    ['obata', '第二陣左翼', '小幡信貞', 3000, -450 / 16, TAKEDA_SECOND, 'takeda', 'oyamada'],
    ['katsuyori', '第三陣右翼', '武田勝頼', 3000, 300 / 16, TAKEDA_THIRD, 'furin', 'yamagata'],
    ['naito', '第二陣中翼', '内藤昌豊', 3000, -250 / 16, TAKEDA_SECOND, 'takeda', 'oyamada'],
    ['nobutoyo', '旗本衆', '武田信豊（典厩）', 2500, -10, 5, 'takeda'],
    ['anayama', '旗本衆', '穴山信君', 2500, 10, 5, 'takeda'],
    ['nobukado', '本陣左脇備え', '武田信廉（逍遥軒）', 2000, -36, 5, 'takeda'],
    ['hatamoto', '本陣右脇備え', '武田の旗本', 2000, 36, 5, 'takeda'],
    ['shingen', '本陣', '武田信玄', 2000, 0, 0, 'takeda'],
  ].map(([id, role, general, soldiers, right, front, flag, relief]) => ({
    id, role, general, soldiers, at: { right, front }, flag, mon: 'takeda', relief,
    bind: (rt) => rt.flags.bT?.[id],
  })),
};
const TOKUGAWA_JIN = {
  name: '鶴翼', team: 0, honjin: { x: 0, z: 0 }, facing: Math.PI,
  sonae: [
    ['ishikawa', '左翼', '石川数正', 2000, 550 / 16, -LINE_Z, 'tokugawa'],
    ['honda', '左翼', '本多忠勝', 1000, 400 / 16, -LINE_Z, 'tokugawa'],
    ['matsudaira', '左翼', '松平家忠', 1000, 280 / 16, -LINE_Z, 'tokugawa'],
    ['ogasawara', '左翼', '小笠原長忠', 1000, 125 / 16, -LINE_Z, 'tokugawa'],
    ['sakai', '右翼', '酒井忠次', 1500, -500 / 16, -LINE_Z, 'tokugawa'],
    ['sakuma', '織田の加勢', '佐久間信盛', 1000, -150 / 16, -LINE_Z, 'oda'],
    ['hirate', '織田の加勢', '平手汎秀', 1000, -260 / 16, -LINE_Z, 'oda'],
    ['takigawa', '織田の加勢', '水野信元', 1000, -TAKIGAWA_X, -LINE_Z, 'oda'],
    ['ieyasu', '本陣', '徳川家康', 1500, 0, 0, 'tokugawa'],
  ].map(([id, role, general, soldiers, right, front, flag]) => ({
    id, role, general, soldiers, at: { right, front }, flag, mon: flag,
    bindOnly: ['ogasawara', 'sakuma', 'hirate', 'takigawa'].includes(id),
    bind: (rt) => rt.flags.bA?.[id],
  })),
};

const mikatagahara = {
  noticeOnce: true,
  guideMarker: () => null, // 地面に黄色の道案内を描かず、旗・退き口の札で示す。
  noAllyReports: true, // 近くの武将の声だけ聞く。遠い名乗りを使番に運ばせない。
  // 負け戦では、局地の働きを全軍の勝ちや追撃の下知にしない。
  battleVoices: { lines: { ally: {
    rout: ['深追いするな！　列を保て！', '今のうちに退き口を空けよ！'],
    regroup: ['敵が列を組み直すぞ！　備えよ！'],
    leader: ['敵の頭を討った！　列を離れるな！'],
    reload: ['弾込めの間に、味方へ戻れ！'],
    praise: ['よう支えた！', '列を保て！'],
    praiseLord: ['殿、退き口は某が支えまする！'],
  } } },
  jinkei: [TOKUGAWA_JIN, TAKEDA_JIN],
  jinkeiActive: (rt) => rt.flags.step > 0 && !rt.flags.ending && rt.flags.step < 3,
  wakeOK: (rt) => rt.flags.step > 0,
  // 槍列の右の端から前を見る。何列もの味方の背で寄せ手を隠さない。
  spawn: { x: 260 / 16 + 6, z: LINE_Z + 2, heading: Math.PI },
  world: {
    combatSpace: mikataCombatSpace,
    noticeRepeatGap: Infinity, // 同じ台詞や知らせは、この戦で一度だけ。
    seed: 15722,
    time: 'dusk',
    winter: true,      // 冬でも降雪の根拠がないので、雪を降らせない
    fogFar: 210,
    wind: [0.8, 0.6],
    autumn: true,
    muddy: 0.2,
    paths: [[[-10, -200], [0, -60], [6, LINE_Z], [14, 80], [HAMA.x, HAMA.z]],
      [[6, LINE_Z], [OIWAKE.x, OIWAKE.z], [-100, -110], [-125, -150]]],
    height,
    tint(x, z, h, c) {
      // 枯れ草の斑でも草の割合を残す。一色にすると草むらまで消えてしまう。
      const patch = 0.5 + 0.5 * Math.sin(x * 0.075 + Math.cos(z * 0.09)) * Math.cos(z * 0.065);
      c.r = 0.35 + patch * 0.09; c.g = 0.38 + patch * 0.13; c.b = 0.23 + patch * 0.06;
      const d = saiDepth(x, z); if (d > 0.5) c.multiplyScalar(1 - Math.min(0.35, d * 0.05));
      // 集落の周りの畑（台地の緩い起伏に、耕した色を足す。水田でなく畑なので地形の高さは変えない）
      const vd = Math.hypot(x - MURA.x, z - MURA.z);
      if (vd < 30) c.lerp({ r: 0.5, g: 0.4, b: 0.22 }, 0.3 * Math.max(0, 1 - vd / 30));
    },
    // 坂から城口まで道を空ける。最後の曲がり角に木を生やさない。
    clear: (x, z) => (Math.abs(x) < 130 && z > -220 && z < 150) ||
      (Math.abs(x) < 26 && z >= 150 && z < HAMA.z + 12) || Math.hypot(x, z - TAKEDA_JIN.honjin.z) < 22,
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
    const dropWeapon = rt.army.dropWeapon;
    rt.army.dropWeapon = function (u) {
      dropWeapon.call(this, u);
      fallenStandard(this, u);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { plateau: 'HIST_A', saigagake: 'HIST_A', gyorin: 'HIST_B', kakuyoku: 'HIST_B', hamamatsuFar: 'GAME_C', ifWin: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.routSaid = new Set();
    const say = rt.say;
    rt.say = function (speaker, text, dur) { return say.call(this, livingVoice(this, speaker), text, dur); };
    const hudSay = rt.hud.say;
    rt.hud.say = function (speaker, text, ...args) { return hudSay.call(this, livingVoice(rt, speaker), text, ...args); };
    // 城門の前で六秒間、帰着の絵を見せる。視点の設定や動きを減らす設定でも静止画で見せる。
    const cameraTick = rt.player.updateCamera, playerTick = rt.player.update;
    rt.player.update = function (dt, input) {
      if (F.returnedT !== undefined) return;
      return playerTick.call(this, dt, input);
    };
    rt.player.updateCamera = function (dt, camera) {
      cameraTick.call(this, dt, camera);
      if (F.returnedT === undefined || rt.t - F.returnedT >= 6) return;
      camera.position.set(-12, W.heightAt(-12, HAMA.z - 23) + 3.2, HAMA.z - 23);
      camera.lookAt(HAMA.x, W.heightAt(HAMA.x, HAMA.z - 12) + 2.1, HAMA.z - 8);
    };
    rt.army.mikataFront = []; rt.army.mikataCap = 4;
    rt._rfN = 3; // 敗走中に共通の救済援兵を湧かせない
    strengthBanner(rt, 11000, 30000);
    // ---- 織田の援軍：平手汎秀の手（自分の持ち場）、佐久間信盛の手 ----
    F.hirate = allyGroup(rt, { fixed: true, name: '平手汎秀の手', anchor: { x: 260 / 16, z: LINE_Z }, facing: Math.PI, width: 8, spacing: 1, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '平手汎秀', invuln: false, horse: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 3 }], ODA));
    F.hiraU = F.hirate.units[0];
    F.saku = allyGroup(rt, { fixed: true, name: '佐久間信盛の手', anchor: { x: 150 / 16, z: LINE_Z }, facing: Math.PI, width: 6, spacing: 1, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.sakuU = F.saku.units[0];
    F.toku = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '徳川の手', anchor: { x: -125 / 16, z: LINE_Z }, facing: Math.PI, width: 8, spacing: 1, aggro: 10, noRout: true, formation: 'yari', fleeDir: { x: 0.15, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], TOKU));
    // 平手の鉄砲組（元亀三年、まだ数は少ない）：込めたまま待ち、寄せた所で揃えて放つ
    F.teppo = allyGroup(rt, { fixed: true, name: '平手の鉄砲組', anchor: { x: 260 / 16, z: LINE_Z + 8 }, facing: Math.PI, width: 8, aggro: 4, noRout: true, formation: 'line' },
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
    // 図の各段を保つ。後詰めは段の間へ収め、本陣のさらに北へ伸ばさない。
    // 小幡の横位置は図の西側からの推定。徳川の八隊は同じ前線に並べる。
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
      return fb({ name: s.general + 'の備', general: s.general, team: plan.team, faction,
        kind: 'ashigaru', nominal: Math.round(s.soldiers / 15), armor: AR[faction], flag: s.flag, mon: s.mon,
        at, facing: plan.facing }, plan.team
          ? { ...jinkeiDistantLayout(plan, s), w: s.id === 'oyamada' ? 18 : s.at.front === TAKEDA_SECOND ? 12 : 14, d: 10,
            host: s.at.front > TAKEDA_THIRD ? 40 : false }
          : { w: 7, d: 14, host: 40 });
    });
    F.bA = build(TOKUGAWA_JIN);
    F.bT = build(TAKEDA_JIN);
    F.flank = [F.bA.ishikawa, F.bA.honda, F.bA.matsudaira];
    // 東の援軍は平手の手と組の持ち場から離す。後の押し合いも同じ所で行う。
    F.takiDA = W.addDistantArmy({ x: TAKIGAWA_X, z: LINE_Z, w: 7, d: 10, count: 180, facing: Math.PI, armor: AR.oda, flagTex: flagTexture('oda'), seed: 15723 });
    F.takiDA.army.team = 0;
    F.takiDA.army.noWake = true; // 押し合いの遠景へ引き継ぐまで実兵と重ねない
    F.allB = [...Object.values(F.bA), ...Object.values(F.bT)];
    F.fieldOpts.list = F.allB;
    // 武田の頭（F7）：毎回少し違う手を打つ。正面で押す／左（徳川の鶴翼の端）を回る／右（森の側）から赤備えを先に出す
    F.tPlan = ['naka', 'hidari', 'migi'][Math.floor(Math.random() * 3)];
    // 武田の本陣（北の奥）：武田信玄と旗本。控えは軽い兵
    F.campB = camp(rt, { x: 0, z: TAKEDA_JIN.honjin.z, facing: 0, team: 1, faction: 'takeda', mon: 'takeda', armor: AR.takeda, general: { name: '武田信玄', hat: 'kabuto_m', haori: 0x8a1a14 }, depth: false, guard: 15, reserve: 0, runTo: { x: 0, z: TAKEDA_HQ_Z - 20 } });
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
    rt.scene.add(kabukimon(W, HAMA.x, HAMA.z - 12, 10, Math.PI, { doors: false }));
    // 浜松城の方（遠く、南）
    rt.scene.add(hut(W, HAMA.x, HAMA.z + 14, 14, 9, 0.1, { h: 3.6, ita: true, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[HAMA.x - 8, HAMA.z], [HAMA.x + 8, HAMA.z]]) { rt.scene.add(nobori(W, x, z, 'tokugawa', 6)); rt.scene.add(campfire(W, x, z + 4)); W.addFire(x, z + 4); }

    winterGround(W);
    applyLook(rt, WINTER_DUSK);
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '平手の陣で一手の槍をそろえよ' : '平手の陣で味方の槍列に続け', 'main');
    rt.say('物見', '武田は浜松を攻めず、西へ進んでおりまする。祝田の坂へ向かう構えにござる', 4.5);
    rt.say('組頭', `${nm(rt)}、徳川殿が打って出られたぞ。平手の旗に続け！`, 4.5);
    rt.after(7, () => rt.say('組頭', '信玄の勢、原の果てまでおるわ。こちらより多いぞ。手がかじかんでも槍を離すな！', 4.5));
    rt.marker('hira', unitPos(F.hiraU), '平手汎秀', {});
    rt.after(6, () => { if (rt.phase === 'brief') this.first(rt); });
  },

  // ① 武田の先手を受け止める
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    rt.marker('hira', { x: 260 / 16, z: LINE_Z }, '平手の槍の持ち場', { h: 2 });
    sfx('taiko', 1); rt.after(1, () => sfx('horagai', 0.8));
    rt.banner('武田の備え', '坂の手前で、武田がこちらへ向き直る');
    rt.after(3, () => rt.say('物見', '武田が止まりましたぞ！　坂の上で、こちらへ槍を向けておりまする！', 4));
    rt.after(10, () => rt.say('物見', '敵の中ほどに旗が重なっておりまする！　左右の手もこちらへ向きましたぞ！', 4.5));
    rt.obj('main', '平手の陣で先手を受け止めよ', 'main');
    takedaMove(rt, 'first');
    // 先手の待ち時間にも東の備えが寄せ合う。後の押し合いと同じ遠景を使う。
    this.plainClash(rt);
    // 本隊の布陣は動かさず、先に出た物見が平手の列の東へ寄せる。
    F.scout = enemyGroup(rt, { fixed: true, faction: 'takeda', name: '武田の物見の騎馬', anchor: { x: 28, z: LINE_Z - 24 }, facing: 0, order: 'attack', seekRange: 50, aggro: 10, width: 6, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      depthLook(rt, [{ type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 2 }], TAKEDA));
    // 開始六秒で騎馬の土煙。粒は共通の使い回す枠へ、一度だけ足す。
    for (const u of F.scout.units) if (u.mounted) rt.world.dustCloud(u.pos.x, u.pos.z, true, true);
    rt.after(2, () => {
      if (F.ending || F.step !== 1) return;
      rt.say('組頭', '騎馬が来るぞ！　前の者は膝をつけ、槍先をそろえよ！', 3.5);
      for (const g of [F.hirate, F.saku, F.toku]) if (!gone(g)) {
        g.order = 'hold'; g.formation = 'yari'; g.yariKneel = true;
      }
    });
    rt.after(4, () => { if (!F.ending && F.step === 1) F.cl.volley('B'); });
    rt.after(9, () => {
      if (F.ending || F.step !== 1) return;
      rt.say('組頭', '弓の合図じゃ！　矢が来るぞ、列を離れるな！', 3.5);
      F.cl.arrows('B');
    });
    // 小山田の先手の位置から寄せる。
    F.w1 = enemyGroup(rt, { fixed: true, faction: 'takeda', name: '武田の先手', anchor: { x: 0, z: TAKEDA_HQ_Z + OYAMADA_FRONT }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 18, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1, formation: 'yari' },
      depthLook(rt, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt, 0.4) }, { type: 'bow', n: 4 }], TAKEDA));
    rt.marker('w1', centerOf(F.w1), '武田の先手', { red: true, group: F.w1 });
    rt.after(14, () => rt.say('組頭', '誘われたか……！　じゃが、もう引けぬ。動くな、槍先を下げよ！', 3.5));
    // 小山田を先に、東の山県と後続の備を厚く置く。各備の位置は推定。
    rt.after(20, () => rt.say('物見', '先手に小山田の旗と見えまする！　右にも一手、寄せてまいりまする！', 5)); rt.after(26, () => rt.say('物見', '原の奥まで旗が続いておりまする。後詰も大勢にござる！', 4));
    // 勝ち筋：勝てぬ戦。台地の南の坂を下れば浜松城。生きて退く道をはじめに示す
    rt.after(6, () => { if (F.step === 1 && !F.ending) rt.say('組頭', '崩れた時は、台地の南の坂を下れ。浜松の城が退き口じゃ', 3.5); });
    // 退く下知の時に、南の道を順に示す。

  },

  // 段を重ねる（b_depth.js）：A 魚鱗の寄せ（先手の後）→ B 台地の退き口（赤備えの後）
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true; F.dpOn = true;
    // 主な下知は同じ札に残す。段の細かな札が済んでも退き先を失わせない。
    rt.obj('main', which === 'A' ? '平手の陣を守り、右に備えよ' : '南の坂へ退き、退き口を守れ', 'main', true);
    for (const k of ['hira', 'w1', 'aka']) rt.unmark(k);
    if (which === 'A') this.plainClash(rt);
    // 赤備えは駆け抜けて、徳川の鶴翼の方へ去る（平手の手を包むのは武田の本隊）
    if (which === 'B' && F.aka && !gone(F.aka)) { F.aka.anchor = { x: -36, z: 12 }; F.aka.order = 'move'; F.aka.dest = F.aka.anchor; F.aka.aggro = 6; rt.bark('赤備え、徳川の備えへ駆け抜ける'); }
    if (which === 'B') retreatDistant(rt);
    const steps = which === 'A' ? mkA() : mkB();
    const orders = which === 'A'
      ? ['味方の槍の列をそろえ直せ', null, '右の森へ槍を向け直せ']
      : ['味方と南の坂へ退け', null, '坂の上で味方と列をそろえよ', null];
    depthStart(rt, mkCtx(rt), missionSteps(steps, orders), () => {
      F.dpOn = false; rt.objRemove('dp');
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
    F.cl = clash(rt, { x: TAKIGAWA_X, z: LINE_Z - 14, facing: Math.PI, w: 12, gap0: 34, closeSpeed: 3.6, seed: 15727, noRout: true, killRate: 0.15,
      surge: { k: 'B', every: 38, count: 160, flank: 0.4 },
      A: { flag: 'oda', armor: AR.oda, count: 380, team: 0, faction: 'oda' },
      B: { flag: 'takeda', armor: AR.takeda, count: 820, team: 1, faction: 'takeda', guns: true, bows: true, flagRate: 0.5 } });
    F.cl.push('B', 0.35);
    rt.after(1, () => F.cl.go());
  },

  // ② 赤備えの騎馬に崩される
  crash(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.army.mikataCap = 4;
    rt.setPhase('crash');
    rt.unmark('w1');
    sfx('horagai', 1);
    rt.banner('赤備え', '山県の赤備え、横合いから寄せる');
    rt.obj('main', HI(rt) ? '一手を右へ向け、赤備えを支えよ' : '右から来る赤備えを支えよ', 'main');
    takedaMove(rt, 'crash');
    applyLook(rt, TWILIGHT);   // 夕刻→薄暮→（退き口で）夜
    rt.after(2, () => rt.bark('暮れゆく原に、馬の足音と法螺が響く'));
    F.aka = enemyGroup(rt, { fixed: true, faction: 'akazonae', name: '山県の赤備え', anchor: { x: 300 / 16, z: TAKEDA_HQ_Z + TAKEDA_SECOND + 34 }, facing: -Math.PI * 0.8, order: 'hold', seekRange: 140, aggro: 10, width: 14, morale: 100, noRout: true, fleeDir: { x: 1, z: -1 }, dmgMult: 1 },
      depthLook(rt, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 9 + more(rt, 0.2) }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AKA));
    // 備えの主将は遠景からの実体化だけで置き、突撃隊に複製しない。
    F.aka0 = F.aka.count;
    // 判断：赤備えをどう受けるか（時間切れは槍衾。受け方で傷と手柄が変わる）。赤備えは森の際で馬を揃えてから駆け出す
    const go = () => {
      if (F.ending || F.step !== 2 || F.dpOn || gone(F.aka) || F.aka.order !== 'hold') return;
      if (!F.mkFlank) for (const [i, g] of [F.hirate, F.saku].entries()) if (g && g.count && !g.routed) {
        g.order = 'hold'; g.anchor = { x: 14 - i * 8, z: LINE_Z - 2 };
        g.facing = Math.atan2(300 / 16 - g.anchor.x, TAKEDA_HQ_Z + TAKEDA_SECOND + 34 - g.anchor.z);
        g.formation = 'yari'; g.aggro = 14;
      }
      F.aka.order = 'attack'; F.aka.aggro = 18;
      rt.say('足軽', '馬が駆け出したで！　来るぞ！', 2.5);
    };
    rt.after(17, go);
    rt.after(1, () => {
      if (F.step !== 2 || F.ending) return;
      if (!HI(rt)) {
        F.mkFlank = false;
        rt.marker('pike', { x: 14, z: LINE_Z - 2 }, '味方と馬を受ける持ち場', { h: 2 });
        rt.say('組頭', '右へ向け！　隣の槍と隙間を空けるな！', 3);
        return;
      }
      rt.choose('右の馬をどう受ける？', [
        { label: '持ち場で槍を揃える', note: '馬の胸へ槍を向ける' },
        { label: '森から横へ回る', note: '列を離れると囲まれる' },
      ], (i) => {
        F.mkFlank = i === 1;
        rt.after(i === 1 ? 8 : 3, go);
        if (i === 0) {
          rt.say('組頭', '槍衾を作れ！　石突きを地に据え、馬の胸へ向けよ！', 3.5);
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
    rt.marker('aka', centerOf(F.aka), '右の赤備え・槍を向けよ', { red: true, group: F.aka });
    rt.say('足軽', '赤い具足の騎馬だがや！　右におるぞ！', 3);
    // 後ろの赤備えの大軍は、山県の備（部隊の軽い作り）が森の際まで寄せて見せる（takedaMove）
    if (F.cl) { F.cl.cavalry('B', { from: 1, count: 160, flag: 'akazonae', armor: AR.akazonae, delay: 2 }); rt.after(8, () => F.cl.cavalry('B', { from: -1, count: 100, flag: 'takeda', armor: AR.takeda })); }
    // 横の列の崩れは、更新時に接触後の損害と士気で確かめる。
  },

  // ③ 平手の討ち死に、浜松城へ退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.army.mikataCap = 3; // 追手が一度に重なって退く足を止めない。
    F.retreating = true;
    rt.setPhase('retreat');
    rt.world.setTime('night');
    rt.unmark('aka'); rt.unmark('exit'); rt.unmark('pike'); rt.unmark('oiwake');
    // 目の前の汎秀は既存の敵の攻撃で倒れる。史実の討死は戦場全体の後報として伝える。
    sfx('kane', 0.4);
    rt.banner('織田の援軍、退く', F.flankBroken ? '隣の備えが崩れ、浜松城へ退く' : '武田の寄せを受け、浜松城へ退く');
    rt.after(8, () => { if (!F.ending) rt.say('組頭', '散るな！　組の者と連れ立って下れ！', 3); });
    rt.say('組頭', '浜松へ退け！　息を切らすな。追手が詰めたら、槍を返せ！', 4);
    rt.obj('main', HI(rt) ? '一手を率い、浜松城へ退け' : '追手を振り切り、浜松城へ退け', 'main');
    F.retreatPoint = { x: 10, z: 60 }; F.retreatIdx = 0;
    while (F.retreatIdx < RETREAT_ROAD.length - 1 && rt.player.u.pos.z > RETREAT_ROAD[F.retreatIdx][1]) F.retreatIdx++;
    F.retreatPoint.x = RETREAT_ROAD[F.retreatIdx][0]; F.retreatPoint.z = RETREAT_ROAD[F.retreatIdx][1];
    rt.marker('hama', () => F.retreatPoint, () => F.retreatIdx === RETREAT_ROAD.length - 1 ? '浜松城の口へ' : '犀ヶ崖の東の道へ', { h: 3 });
    rt.zone('hama', HAMA.x, HAMA.z, 10);
    applyLook(rt, NIGHT, false);
    // 月明かりを残し、枯れ草・霜・道の凹凸を夜でも読める明るさにする。
    rt.world.hemi.intensity = rt.world.baseHemi = 1.7;
    rt.world.hemi.groundColor.set(0x59616d);
    rt.world.updateEnv();
    retreatDistant(rt);
    F.pursuit.moveTo(8, 104, 32, { charge: true });
    rt.after(32, () => { if (!F.ending) F.pursuit.moveTo(14, 136, 22, { charge: true }); });
    for (const g of [F.hirate, F.saku, F.teppo]) retreatGroup(g);
    // 追手
    F.chase = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { fixed: true, faction: 'takeda', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1, speed: 3.2 }, depthLook(rt, list, TAKEDA));
      // 追手も崖の東を下る。遠い味方を追って台地に留まらせない。
      retreatGroup(g, 3.6);
      g.noRout = false; // 道順の指定で追手まで不退転にしない。
      g.onArrive = (q) => { q.order = 'attack'; q.noRout = false; };
      F.chase.push(g);
      rt.marker('c' + F.chase.length, centerOf(g), name, { red: true, group: g });
      return g;
    };
    // 追手は台地の既定の入口から来る。本人の位置に合わせて湧かせない。
    rt.after(2, () => { if (!F.ending && F.step === 3 && !F.dpOn) mk(4, 38, '追ってくる武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }]); });
    rt.after(18, () => {
      if (F.ending || F.step !== 3 || F.dpOn) return;
      mk(30, 80, '回り込んだ武田勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.3) }]);
      // 後ろに武田の本隊（内藤昌豊の後詰の備）が原を埋めて続く（軽い作り）。追手は数人ずつでなく、大軍の先の手として見せる
      adv(F.bT.naito, 160, 60);
      rt.say('足軽', '後ろは武田の旗ばっかりだわ！　城まで走れ！', 3);
    });

    // 家康と護衛は東の道を下る。身代わりの名乗りは確定した出来事として演じない。
    const ie = F.campA.general ? F.campA.general.group : null;
    retreatGroup(ie, 4);
    retreatGroup(F.campA.guard);
    F.ieyasuG = ie;
    const sg = F.shingariG;
    sg.order = 'path'; sg.path = [[10, 60], [14, 104]]; sg.pathIdx = 0;
    sg.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    if (F.aka && !gone(F.aka)) { F.aka.order = 'hold'; F.aka.noRout = false; }
    if (F.w1 && !gone(F.w1)) { F.w1.order = 'hold'; }
    // 東の酒井の備も、崖の東を通って浜松へ退く。
    allyFall(rt, F.bA.sakai);
    // 下知で退く備に、架空の死傷者を加えない。
    for (const b of F.flank) allyFall(rt, b);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    F.ending = true;
    rt.setPhase('end'); F.returnedT = rt.t;
    if (F.pursuit) { F.pursuit.halt(); F.pursuit.visible = false; }
    rt.player.lock = null; rt.player.inCombatT = 0; rt.player.camShot = null;
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= (F.chase || []).length; i++) rt.unmark('c' + i);
    for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '浜松城へ生きて退いた');
    survival(rt, '三方ヶ原から生きて浜松城へ退いた');
    sfx('horagai', 0.4);
    rt.banner('浜松城へ帰着', '徳川・織田勢は敗れた。生きて城へ戻った');
    rt.say('組頭', `${nm(rt)}、よう戻った。組の者を数えよ。深手の者には手当てをせよ`, 5);
    rt.after(6, () => rt.say('', '浜松城へ戻っても、武田の脅威は去らなかった', 5));
    rt.player.u.invuln = true;
    rt.after(13, () => { if (!rt.over) { rt.finish({}, 0.2); rt.endT = 0.2; } });
  },

  // 実際の退路の断絶による終了。門の時間切れでは負けない。
  lose(rt) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= (F.chase || []).length; i++) rt.unmark('c' + i);
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('取り残された', '浜松城へたどり着けず、武田の追手に退く道を断たれた');
    rt.say('足軽', '道が塞がっとる……！　追手に先を越されたわ！', 3);
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 話す前に討たれた待ち列の上役も差し替える。既に話し終えた記録は変えない。
    for (const line of rt.hud.subQ) line.speaker = livingVoice(rt, line.speaker);
    rt.world.skyMat.uniforms.mikataSunset.value = F.step >= 3 ? Math.max(0, 0.6 - (rt.t - F.stepT) / 65) : 1;
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    butaiTick(rt, dt);
    if (F.ending || !rt.player.u.alive) return;
    if (F.pursuit && rt.t >= (F.pursuitSoundT || 0)) {
      F.pursuitSoundT = rt.t + 5.5;
      const at = F.pursuitSound, a = F.pursuit.army;
      at.x = a.cx + a.off.x; at.z = a.cz + a.off.z; at.y = rt.world.heightAt(at.x, at.z);
      rt.army.play('gallop', at, 1.1);
      // 坂の上の射手が見えない間も遠くの発砲を聞かせる。弾や新たな実兵は足さない。
      if (rt.t >= (F.retreatGunT || 0)) {
        F.retreatGunT = rt.t + 11;
        rt.army.play('gunScatter', F.retreatShotSound, 0.65);
      }
    }
    // 手ほどきは一度きりなので、深手になる前に原因と退き方を字幕でも知らせる。
    const hit = rt.player.lastHit;
    if (F.step > 0 && rt.player.u.hp < rt.player.u.maxHp * 0.55 && hit && rt.t - hit.t < 8 && !(F.woundWarnT > rt.t)) {
      F.woundWarnT = rt.t + 32;
      const cause = hit.ranged ? (hit.type === 'bow' ? '矢が当たった！' : '鉄砲で撃たれた！') : hit.back ? '背中を突かれた！' : hit.side ? '横から打たれた！' : '正面から打たれた！';
      rt.bark(cause + (hit.ranged ? '射手の正面を外れ、味方の陰へ退け' : '敵へ槍を向け、味方の後ろへ退け'), true);
    }
    const p = rt.player.u.pos;
    // 備えの足元が接した所で押し合う。離れた備えに損害を与えない。
    fieldTick(rt, dt, F.fieldOpts);
    // 接触した備が傷を受けて列を保てなくなった時に退く。秒数では死傷を増やさない。
    if (F.step === 2 && !F.flankBroken) {
      for (const b of F.flank) {
        if (!b.routedL && !(b.engagedT !== undefined && (b.lost >= b.nominal * 0.15 || b.morale < 45))) continue;
        F.flankBroken = true;
        rt.say('足軽', '徳川の列が崩れたがや！　横から来るぞ、道を塞がせるな！', 3.5);
        for (const q of F.flank) allyFall(rt, q);
        const H = F.campA;
        retreatGroup(H.general && H.general.group, 3.2); retreatGroup(H.guard, 3.2);
        break;
      }
    }
    // 東の押し合いも、実際に残った兵と士気で崩れる。武田の強制敗走はしない。
    if (F.step >= 2 && F.cl && !F.cl.A.routed && F.cl.phase === 'fight' &&
        (F.cl.A.alive <= F.cl.A.n0 * 0.6 || F.cl.A.m < 35)) F.cl.rout('A', { hideAfter: 20, from: 1 });
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
      if (!F.dpOn) rt.objProgress('main', '槍列を保て。射手の正面を避けよ');
      if (F.w1.count < 6 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 25);
      // 武田の奥へ出たことを記録する。別の勝ち筋にはしない。
      if (!F.overchase && p.z < -85) F.overchase = true;
      if ((gone(F.w1) && rt.t - F.stepT > 18) || rt.t - F.stepT > 55) this.deep(rt, 'A');
    }
    if (F.step === 2) {
      if (!F.akaEngaged) for (const q of F.aka.units) {
        const target = q.swing?.target || q.atk?.target;
        if (q.alive && !q.fleeing && target?.alive && target.team === 0 &&
            Math.hypot(q.pos.x - 14, q.pos.z - (LINE_Z - 2)) < 18) { F.akaEngaged = true; break; }
      }
      if (F.mkFlank && Math.hypot(p.x - 46, p.z + 44) < 5) { F.mkFlankArrived = true; rt.unmark('pike'); }
      if (F.mkFlankArrived && !F.mkFlankFought) {
        if (rt.player.u.swing?.target?.group === F.aka && rt.player.u.swing.res != null) F.mkFlankFought = true;
        for (const q of rt.squad) if (q.alive && !q.fleeing && !q.woundOut && q.atk && q.target?.group === F.aka && Math.hypot(q.pos.x - 46, q.pos.z + 44) < 18) F.mkFlankFought = true;
      }
      if (!F.dpOn) rt.objProgress('main', F.mkFlank ? (F.mkFlankArrived ? '味方と赤備えの横腹へ当たれ' : '森の陰へ進め。味方から離れるな') : '右へ槍を向け、味方と列を保て');
      if (rt.t - F.stepT > 45 || ((F.flankBroken || F.aka.count < 8) && rt.t - F.stepT > 28)) {
        rt.unmark('pike');
        if (rt.player.u.alive && !F.akaPaid) {
          F.akaPaid = true;
          if (F.mkFlank && F.mkFlankArrived && F.mkFlankFought && F.aka.count <= F.aka0 * 0.6) rt.award((t) => { t.special = { label: '赤備えの横腹を突いた', pts: Math.max(t.special ? t.special.pts : 0, 20) }; }, '赤備えの横腹を突いた');
          else if (!F.mkFlank && F.akaEngaged && Math.hypot(p.x - 14, p.z - (LINE_Z - 2)) < 18 && !gone(F.hirate)) rt.award((t) => t.side.push('槍衾で赤備えを受け止めた'), '槍衾で赤備えを受け止めた');
        }
        rt.say('組頭', F.flankBroken ? '隣の備えが割れたぞ！　南の道を空けよ！' : '後詰まで寄せてきおった！　南へ退くぞ、組を離れるな！', 4);
        this.deep(rt, 'B');
      }
    }
    if (F.step === 3) {
      while (F.retreatIdx < RETREAT_ROAD.length - 1 &&
        (Math.hypot(p.x - RETREAT_ROAD[F.retreatIdx][0], p.z - RETREAT_ROAD[F.retreatIdx][1]) < 6 ||
          (p.x > -16 && p.z > RETREAT_ROAD[F.retreatIdx][1] + 4))) F.retreatIdx++;
      F.retreatPoint.x = RETREAT_ROAD[F.retreatIdx][0]; F.retreatPoint.z = RETREAT_ROAD[F.retreatIdx][1];
      const d = Math.hypot(p.x - HAMA.x, p.z - HAMA.z);
      for (const q of F.chase || []) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      rt.objProgress('main', F.retreatIdx === RETREAT_ROAD.length - 1 ? '浜松城の口へ入れ' : '犀ヶ崖の東の道を下れ');
      // 城へ入ったら退き口は終わる。開いた門で新たな総攻めを受ける筋にはしない。
      if (d < 8 && p.z > HAMA.z - 8) {
        for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.seekRange = 0; q.aggro = 0; }
        this.win(rt);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v === F.hiraU && !F.hirateFallSaid) {
      F.hirateFallSaid = true;
      F.bossName = '佐久間信盛';
      rt.say('足軽', '平手の殿が討たれたがや！　退く道を塞がせるな！', 3);
    }
    if (F.mkFlankArrived && v.group === F.aka && k && (k.isPlayer || rt.squad.includes(k))) F.mkFlankFought = true;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.flags.routSaid.has(g.name) || rt.t < (rt.flags.routSayT || 0)) return;
    // 遠景から替え直された同じ名の隊も、一度知らせたら繰り返さない。
    g._routSaid = true; rt.flags.routSaid.add(g.name); rt.flags.routSayT = rt.t + 8;
    const n = rt.flags.routVoiceN || 0;
    rt.flags.routVoiceN = n + 1;
    const lines = [
      `${g.name}が引いていくぞ。列を離れるな！`,
      `${g.name}の槍が下がった。次の手に備えよ！`,
      `${g.name}に隙間ができたぞ。味方を通せ！`,
      `${g.name}の足が乱れた。追わずに構えよ！`,
      `${g.name}が後ろへ下がるぞ。退き口を空けよ！`,
      `${g.name}の旗が遠ざかった。組へ戻れ！`,
      `${g.name}は列を立て直す気か。油断するな！`,
      `${g.name}が離れたぞ。槍をそろえ直せ！`,
    ];
    rt.say('足軽', lines[n % lines.length], 2.5);
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
    units: [{ id: 'plan', name: '織田の加勢（平手・佐久間）', group: () => F.hirate, nominal: () => (F.hirate ? F.hirate.count + (F.saku ? F.saku.count : 0) : 0) }],
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
  ...HISTORICAL_GENERALS.mikatagahara.map((g) => ({ ...g, line: {
    '水野信元': '浜松へ退く道を守れ！',
    '佐脇藤八': '槍先を下げよ！　隣の者とそろえよ！',
    '長谷川橋介': 'ここで受け止める！　列を空けるな！',
  }[g.name] || g.line })),
];
mikatagahara.date = (rt) => `元亀三年十二月二十二日　冬・${rt.flags.step >= 3 ? '夜' : '夕暮れ'}`;
mikatagahara.canSkip = (rt) => rt.flags.returnedT !== undefined && !rt.over && rt.t - rt.flags.returnedT >= 5 ? '結果へ進む' : rt.phase === 'brief' && rt.t > 3 ? '先手の下知まで待つ' : '';
mikatagahara.skip = (rt) => { if (rt.flags.returnedT !== undefined && !rt.over && rt.t - rt.flags.returnedT >= 5) { rt.finish({}, 0.2); rt.endT = 0.2; } else if (rt.phase === 'brief') mikatagahara.first(rt); };
mikatagahara.history = '元亀三年十二月二十二日（西暦1573年1月25日）、遠江の三方ヶ原で徳川・織田勢と武田勢が戦った。『信長公記』巻五は、信長が佐久間信盛・平手汎秀・水野信元を大将として浜松へ遣わしたと記す。同書にこの援軍の総数や滝川一益の名はない。二俣城を落とした信玄は堀江城へ向かって動き、浜松を出た家康の勢と三方ヶ原で戦った。先頭の約三百人に石を投げさせ、太鼓を打って寄せたとも記される。平手汎秀とその家臣、徳川家臣の成瀬藤蔵らが討ち死にし、家康は敵中を抜けて浜松城へ退いた。会戦を夕刻とする解説があり、魚鱗・鶴翼の陣や祝田坂での反転は『三河物語』『甲陽軍鑑』などに伝わる。各備の寄せる順、城門を開けて追手を惑わせた話、犀ヶ崖の夜討ちは、確定した出来事としては扱わない。兵数には諸説あり、武田三万、徳川・織田一万一千は一つの見積もりで、各備の人数・配置は遊びの復元である。降雪を伝える浜松市の解説もあるが、当日の天候は断定しない。地形・時間・浜松の城口は遊びのために縮めている。武田勢はその後も西へ進んだが、元亀四年、信玄が病を重くすると帰国の途につき、信玄は四月にその途中で没した。';

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
    const next = F.retreatPoint || HAMA;
    goTo(p, inp, next.x, next.z, F.retreatIdx === RETREAT_ROAD.length - 1 ? 3 : 1.8);
    for (const e of b.army.threats || []) {
      if (!e.alive || e.fleeing || e.gone || e.woundOut || e.noTarget || e.isStruct || e.team === u.team ||
          Math.abs(e.pos.y - u.pos.y) >= 3 || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 4 ||
          b.army.wallBetween(u.pos, -1, e.pos)) continue;
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.guardHold = true; inp.runHeld = false;
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      const dx = next.x - u.pos.x, dz = next.z - u.pos.z;
      const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
      const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
      if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
      break;
    }
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
  let attacker = null, ad = 10, impact = Infinity, threatN = 0;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.gone || o.woundOut || o.noTarget || o.isStruct || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d >= 10) continue;
    threatN++;
    const soon = o.swing && !o.swing.done ? 0 : o.atk ? o.atk.t : d / Math.max(1, o.run);
    if (soon < impact || (soon === impact && d < ad)) { attacker = o; ad = d; impact = soon; }
  }
  const candidate = attacker || strikeTarget(b, F.step > 0 ? 12 : 6);
  const e = candidate && candidate.alive && !candidate.fleeing && !candidate.gone && !candidate.woundOut && !candidate.noTarget && !candidate.isStruct ? candidate : null;
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
    // 一人だけの長い振りかぶりには、突きが先に届く間だけ割り込む。
    patientStrike(p, inp, e, d, threatN === 1);
    // 届かない相手を見たまま止まらず、持ち場の中だけで間合いを詰める。
    // 届かない振りかぶりには構えたまま詰める。馬の突進と振り出した刃は追わない。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (!e.charging && !(e.swing && !e.swing.done) && d >= reach && F.step > 0) {
      const dx = e.pos.x - postX, dz = e.pos.z - postZ;
      const scale = Math.min(1, 5 / (Math.hypot(dx, dz) || 1));
      const next = b._mkBotPoint || (b._mkBotPoint = { x: 0, z: 0 });
      next.x = postX + dx * scale;
      next.z = postZ + dz * scale;
      if (F.step === 1) next.z = Math.max(F.hirate.anchor.z - 1, next.z);
      if (!b.army.wallBetween(u.pos, -1, next)) {
        const face = p.yaw;
        goTo(p, inp, next.x, next.z, 0.5);
        // 構えは正面だけ。列の端を目指して横を向き、迫る槍を受け損ねない。
        if (inp.guardHold) {
          const walking = inp.k.has('KeyW');
          p.yaw = face; inp.k.delete('KeyW');
          if (walking) {
            const dx = next.x - u.pos.x, dz = next.z - u.pos.z;
            const fw = dx * Math.sin(face) + dz * Math.cos(face);
            const side = -dx * Math.cos(face) + dz * Math.sin(face);
            if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
            if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
          }
        }
      }
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
// 持ち場を支えたら次の下知へ。敵の全滅を待たず、敵の士気も一斉には落とさない。
function withstand(o) {
  const s = hold(o), tick = s.tick;
  s.tick = (rt, C, m, ctx, el, dt) => {
    // 共通の「刻限後に敵の士気を落とす」処理へ入る前に下知を出す。
    const held = C.inT;
    tick(rt, C, m, ctx, Math.min(el, o.dur - 0.001), dt);
    // 広い近似範囲にいるだけでは、持ち場を守った手柄にしない。
    if (!C.metEnemy) for (const g of C.groups) {
      if (g.routed) continue;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut &&
          Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (o.r || 14) + 8) { C.metEnemy = true; break; }
      if (C.metEnemy) break;
    }
    const p = rt.player.u.pos;
    const inPost = Math.hypot(p.x - C.at.x, p.z - C.at.z) < (o.r || 14);
    C.inT = held + (inPost && C.metEnemy ? dt : 0);
    rt.objProgress('main', inPost ? '槍列を保ち、退く下知を待て' : '持ち場へ戻れ。列を離れるな');
    return el >= o.dur && C.waves.length === 0;
  };
  s.end = (rt, C, m) => {
    rt.unmark('dp'); rt.unzone('dp');
    const won = C.inT >= o.dur * 0.45;
    if (won) { rt.objDone('dp'); if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward); }
    else { rt.objFail('dp'); if (o.lost) rt.say(o.lost[0], o.lost[1], 3); }
    if (o.onEnd) o.onEnd(rt, m, won);
  };
  return s;
}
// 退く段では、待ち伏せを追わせず、残った敵も時間だけで敗走させない。
function withdraw(o) {
  const s = move(o), start = s.start, tick = s.tick;
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    for (const g of ctx.friends(rt)) {
      g.path = [[g.anchor.x, g.anchor.z]]; g.pathIdx = 0;
      const c = g.center(); g.anchor.x = c.x; g.anchor.z = c.z;
      g.retreatOnly = true; g.order = 'path'; g.speed = 3;
      g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    }
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    const done = tick(rt, C, m, ctx, el, dt);
    C.goal = C.at;
    rt.objProgress('main', C.arr ? '追手へ構え、味方を先に通せ' : '追手を深追いせず、南の坂へ退け');
    return done;
  };
  s.end = (rt, C) => {
    rt.unmark('dp'); rt.unzone('dp');
    if (C.arr) rt.objDone('dp'); else rt.objFail('dp');
  };
  return s;
}
// 共通の段が作る細かな札を主の札へ移す。表示する任務は一つにする。
function missionSteps(steps, orders) {
  return steps.map((s, i) => {
    const start = s.start;
    s.start = (rt, C, m, ctx) => {
      start(rt, C, m, ctx);
      const task = rt.orderObjectives?.get('dp') || rt.objectives.find((q) => q.id === 'dp');
      const text = orders[i] || task?.text;
      if (text) {
        rt.obj('main', text, 'main', true);
        rt.objProgress('main', '');
      }
      rt.objRemove('dp');
    };
    return s;
  });
}
function mkCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', flag: 'takeda', armor: AR.takeda, dmg: 1, calmRest: false, fixedSpawn: true, backing: false, scale: 1, mass: 260, look: (l) => depthLook(rt, l, TAKEDA),
    friends: () => [F.hirate, F.saku, F.toku].filter((g) => g && g.count && !g.routed) };
}
// A 先手の後：魚鱗の寄せ → 赤備えの気配
function mkA() {
  const at = { x: 260 / 16, z: LINE_Z };
  return [
    rest({ dur: 3, heal: 0, say: [['組頭', (rt) => gone(rt.flags.w1) ? '先手は退いたぞ。息をつけ、次の備えが来る！' : '先手の後ろにも旗があるぞ。まだ緩めるな！'], ['組頭', '倒れた者の隙間を詰めよ！']] }),
    withstand({ at, dur: 62, r: 15, title: '魚鱗の寄せ', sub: '武田の各隊が、続けて押し寄せる', label: '平手の陣', obj: '平手の陣を守り、下知を待て',
      say: [['組頭', '踏みとどまれ！　ここを破らせれば徳川殿の脇が空くぞ！']],
      waves: [
        { t: 0, say: ['足軽', '小山田の旗がまた来たで！　槍先が揃っとる！'], foes: () => [{ name: '小山田信茂の先手', from: { x: 20, z: LINE_Z - 32 }, list: [uS(3), uA(14)], formation: 'yari', mass: 400, noRout: 0 }] },
        { t: 20, say: ['組頭', '鉄砲じゃ！　銃口の前を外せ、槍列の陰へ寄れ！'], foes: () => [gunLine('武田の鉄砲衆', { x: 22, z: LINE_Z - 46 }, 8)] },
        { t: 36, say: ['足軽', '馬場の旗だわ！　左へ回っとるぞ！'], foes: () => [{ name: '馬場信春の手（左へ回る）', from: { x: -54, z: LINE_Z - 24 }, off: { x: -8, z: 0 }, list: [uS(2), uA(11)], formation: 'yari', mass: 280 }] },
        { t: 52, say: ['組頭', '山県の手が右から来た！　囲まれるぞ！'], foes: () => [{ name: '山県昌景の手（右へ回る）', from: { x: 56, z: LINE_Z - 10 }, off: { x: 8, z: 4 }, list: [uS(2), uA(10), uB(3)], formation: 'yari', mass: 260 }] },
        { t: 56, say: ['組頭', '勝頼の旗も寄せてきたぞ！　槍先を落とすな！'], foes: () => [{ name: '武田勝頼の二の手', from: { x: 8, z: LINE_Z - 58 }, list: [uS(2), uA(11)], formation: 'yari', mass: 320 }] },
      ],
      reward: '平手の陣で武田の寄せを支えた', lost: ['組頭', '押し込まれた……！　立て直せ！'] }),
    rest({ dur: 6, heal: 0, fn: (rt) => rt.obj('dp', '右の森へ槍を向け直せ', 'main'), bark: '右へ槍を向け直す', say: [['足軽', '森の際に赤い旗が見えるで！'], ['組頭', '山県の赤備えじゃ！　槍ごと右へ向き直れ！']] }),
  ];
}
// B 赤備えの後：佐久間の下知で台地の南へ退き、坂の上で味方を通す。
function mkB() {
  return [
    rest({ dur: 6, heal: 0, fn: (rt) => rt.obj('dp', '味方と南の坂へ退け', 'side', true), bark: '援軍、南へ退く', say: [['組頭', '南の坂へ退くぞ！　下りる味方の道を空けよ！']] }),
    withdraw({ to: { x: 14, z: 56 }, r: 10, label: '台地の南', obj: '佐久間の手と南の坂へ退け',
      say: [['組頭', '急げ！　坂の上まで、佐久間の旗を追え！']],
      ambush: { d: 30, t: 12, title: '回り込まれた', sub: '武田の一手が、退く道を塞ぐ', say: ['足軽', '前にも武田がおるがや！　先を越されとる！'], foes: () => [{ name: '道を塞ぐ武田勢', from: { x: 40, z: 76 }, list: [uS(2), uA(10)], mass: 260 }, gunLine('道の脇の武田の鉄砲', { x: -20, z: 70 }, 6)] } }),
    // 台地の端で殿：坂を下りる味方の背を守る（織田の援軍の退き口）
    rest({ dur: 6, heal: 0, fn: (rt) => rt.obj('dp', '坂の上で味方と列をそろえよ', 'main'), bark: '坂の上で組をそろえる', say: [['組頭', 'ここで殿じゃ！　下りる味方の背を守れ！']] }),
    withstand({ at: { x: 14, z: 62 }, dur: 38, r: 14, title: '坂の上で味方を守る', sub: '下りる味方を守り、退く下知を待つ', label: '台地の端',
      obj: (rt) => (HI(rt) ? '一手で殿を務め、味方を坂へ通せ' : '坂の上で下りる味方を守れ'),
      waves: [
        { t: 0, say: ['足軽', '坂へ追ってきよる！　後ろの者がまだ下りとらん！'], foes: () => [{ name: '追いすがる武田勢', from: { x: 4, z: 28 }, list: [uS(2), uA(11)], formation: 'yari', mass: 300 }] },
        { t: 22, say: ['組頭', '追手の鉄砲じゃ！　射手の前を外せ、味方は下りたか！'], foes: () => [gunLine('台地の上の武田の鉄砲', { x: 34, z: 22 }, 6)] },
      ],
      reward: '台地の端で殿を務めた', lost: ['組頭', 'もうよい、下りよ！　城へ走れ！'] }),
  ];
}
export { mikatagahara };
