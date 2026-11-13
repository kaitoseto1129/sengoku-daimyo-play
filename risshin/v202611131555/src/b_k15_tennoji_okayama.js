// ======================================================================
// 徳川編 15　天王寺・岡山の戦い（慶長二十年 1615・五月七日）　徳川編とゲーム全体の最終決戦
// 手本と出所：docs/battle_refs/k15_tennoji_okayama.md（Wikipedia・史跡の解説・YouTube の解説）。筋書きの正は docs/chapter3_tokugawa.md の「15」。
// 史実：毛利勝永（木村・後藤の残兵を合わせ約六千五百）が四天王寺の南門の前から本多忠朝・小笠原秀政の先手を破り、忠朝は討死。
//   茶臼山の真田信繁（約三千五百）は家康の本陣を目がけて突き掛かり、本陣は崩れて金扇の馬印が倒れ、家康も退いた。
//   松平忠直の越前勢が横から押し、疲れた真田隊は崩れ、信繁は安居の天神の辺りで越前の西尾宗次に討たれた。大坂城は炎上した。
// 主人公は徳川方の侍。本多忠朝の先手の後ろに付き、先手が崩れた後は大御所の本陣の前で真田の突撃を正面から食い止める。
// 段（段ごとに時間の限り。kaito AP の8）：
// 布陣（11/5 直し・史料は battle_learn）：茶臼山の真田の正面（南）に松平忠直の越前勢（一万五千）が陣し、越前勢は真田の陣を抜けて城へ進み、入れ違いに真田は家康の本陣へ寄せる。
//   本陣は天王寺口の後ろ（南）で旗本一万五千。安居の天神は茶臼山の北（実の三百三十メートルほど・歩いて五分）。
//   ①四天王寺の南で毛利勝永の先手を食い止める ②本陣の前で真田と毛利の突撃を止める（二筋で本陣へ） ③倒れた馬印のもとで二の突撃を止める
//   ④越前勢と真田信繁の旗本を討つ ⑤安居の天神で真田信繁を討つ
// kaito AP〜AV：見せかけの軍勢は置かない、だったが、11/8 kaito「軍勢の厚み・陣立てが無い・戦場が空っぽになる」で、陣ごとの後ろに軽い大軍（addDistantArmy）を重ね、
//   本陣に至るまでに 先手→二陣→旗本の二の備→本陣 の陣を置く（docs/army_depth_1106.md）。敵は全員が家康の首を目がける。家康か秀忠が討たれたら負け。
//   真田の兵は主人公ではなく家康の本陣を目がけて走る（近い者とだけ斬り合う）。家康は本陣の旗本（侍）に囲まれ、前に出ない。
//   旗は徳川・本多・真田・豊臣だけ。岡山口（秀忠・大野治房）は遠くの話として使番が知らせるだけ（遊ぶ所に置かない）。
// 向き：北が -z（大坂城）、東が +x。ゲームの 1 は実の 8m（国土地理院の標高・上町台地）。家康の本陣は遊びのため北へ縮めた。
// 重さ：本物の兵は同時に二百五十ほどまで（真田の二番手は先手が崩れてから茶臼山に出す）。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import * as THREE from 'three';
import { nobori, jinmaku, kagaribi, umajirushi, dou, solidCircle, bridgeWoodMaterial } from './props.js';
import { osakaFar } from './osaka_far.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, centerOf, nm } from './bhelp.js';
import { frontFill } from './depth_reserve.js';
import { tetherHorse } from './horse_more.js';
import { distToPolyline } from './world.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut, STAGES } from './stages.js';
import { revealName } from './battle_intel.js';
import { clash } from './b_sekigahara.js';
import { isTouch } from './touch.js';
import { install as chausuyama } from './k15/chausuyama.js';   // 始まりの段：茶臼山の布陣と物見
import { k15SoundSetup, k15SoundTick } from './k15/sound.js';
import { install as rakujo } from './k15/rakujo.js';   // 終幕：天守の炎上・勝鬨・余韻
import * as tennojiguchi from './k15/tennojiguchi.js';   // ①天王寺口の段（毛利勝永・本多忠朝の乱戦と主人公の手柄）
import * as sanadaEnd from './k15/sanada_end.js';   // 信繁の最期（安居の天神の近習・六文銭の幟）
import { install as installUma } from './k15/umajirushi.js';
import { install as installEchizen } from './k15/echizen.js';
import { install as installOkayama } from './k15/okayamaguchi.js';   // 岡山口の段
import { freeRoom, markRecyclable } from './battle_army_kit.js';
import * as jindate from './k15/jindate.js';   // 陣立ての厚み（陣ごとの後ろの軽い大軍と、段ごとに崩れる様子）
import { K15_KACCHU } from './kacchu_data.js';
import { layout as fujinLayout, draw as fujinDraw } from './k15/fujinzu.js';

BATTLE_ASSETS.k15_tennoji_okayama = Object.freeze([...assetsForBattle('k15_tennoji_okayama'), 'dem_tennoji_okayama']);
let dem = null;
useTerrain('dem_tennoji_okayama', (data) => { dem = data; });

// ---- 場所（ゲームの座標） ----
const START = { x: -46, z: 64 };          // 本多忠朝の先手の後ろ
const FRONT = { x: -46, z: 40 };          // 天王寺口の先手（本多忠朝・小笠原秀政）
const SHITENNO = { x: -46, z: -14 };      // 四天王寺の南門の前（毛利勝永）
const CHAUSU = { x: -106, z: 4 };         // 茶臼山（真田の陣）
const YASUI = { x: -89, z: -37 };         // 安居の天神（茶臼山の北、少し東。実の三百三十メートル・歩いて五分）
const ECHI = { x: -98, z: 54 };           // 茶臼山の正面（南）の越前勢（鉄砲の届く外で向き合う）
const HON = { x: -40, z: 130 };           // 大御所（家康）の本陣
const HONF = { x: -50, z: 112 };          // 本陣の前の持ち場（真田の寄せ道を正面で受ける）
const HON2 = { x: -32, z: 168 };          // 馬印が倒れて家康が退く先
const NIJIN = { x: -44, z: 80 };          // 二陣（榊原康勝）。先手と本陣の間の陣（11/8 陣の厚み）
// 大坂城（遠景）。四天王寺から北へ実の二キロ半ほど。前は台地のすぐ先に見え、何の建物か分からなかった（critic60）ので遠くへ
const CASTLE = { x: 60, z: -470 };
// 段ごとの時間の限り（秒）。11/8 kaito「天王寺は一戦20〜30分の濃い戦」で延ばし、⑥茶臼山の旗を足す（docs/atsumi_k15.md）
const LIMIT = [0, 400, 400, 380, 380, 360, 300, 240];   // 11/8 陣ごとの新手で段が厚くなった分を延ばす（段の進みの時の保険は、この限りより前）。11/9 一戦は15〜18分で最後まで（docs/k15_crisis_spec_1108.md）
const TOP = { x: -106, z: 4 };
const SHINGARI = { x: -40, z: -46 };
const MIRU = { x: -80, z: 28 };   // 0.7 茶臼山の麓の畦（真田の鉄砲の届く所）   // ⑥毛利勝永の殿（四天王寺の北の道。城への退き口）   // 茶臼山の丘の上（⑥葵の旗を立てる。CHAUSU と同じ所）
// 名のある将（甲冑は MacBook の係が差し替える。名と配置はここで持つ）
const NAMES = { ieyasu: '徳川家康', masazumi: '本多正純', tadatomo: '本多忠朝', ogasawara: '小笠原秀政', tadanao: '松平忠直', nishio: '西尾宗次', katsunaga: '毛利勝永', nobushige: '真田信繁', otani: '大谷吉治', hidetada: '徳川秀忠', harufusa: '大野治房' };
// 本物の兵の数（二百五十ほどまで。新手はこの内で出す）
const REAL_CAP = isTouch ? 300 : 340;   // 11/13 K285：見せかけの兵を無くした分、本物の上限を上げる（携帯 33ms の中で）
const realN = (rt) => { let n = 0; for (const u of rt.army.units) if (u.alive) n++; return n; };
// 本物の兵の枠（二百五十）に収める：新しく出す組の数を、今の生きた兵に合わせて削る（武将は削らない。半分まで）
// 自分の隊に十人を越す兵がいる武将は、大将の旗本の輪（taisho_guard.js）を別に足さない（隊がそのまま輪。本物の兵の枠を食わない）
const selfGuard = (...gs) => { for (const g of gs) if (g && g.units.length >= 12) for (const u of g.units) if (u.type === 'busho' && u.name) u.keep = true; };
const fit = (rt, sqs, cap = 246) => {
  const room = cap - realN(rt), tot = sqs.reduce((a, q) => a + (q.type === 'busho' ? 0 : q.n), 0);
  if (tot <= room || tot <= 0) return sqs;
  const f = Math.max(0.5, room / tot);
  return sqs.map((q) => (q.type === 'busho' ? q : { ...q, n: Math.max(1, Math.round(q.n * f)) }));
};
// 段ごとの行き先（地図の場所で固定。人や隊を追って動かさない。三2）
const DEST = {
  oka: () => ({ x: 14, z: 72, label: '秀忠本陣の西口' }),
  1: (rt) => { const g = rt.flags.mori, c = alive(g) && g.center ? g.center() : null; return c && near(c, FRONT, 50) ? { x: c.x, z: c.z, label: '毛利の先鋒' } : { x: FRONT.x, z: FRONT.z - 4, label: '天王寺口の先手' }; },   // 11/13 K278：着いても敵が来ず6秒無動作→毛利の先鋒が先手の50m内に来たら印がその群れについて行く   // 11/13 K177：毛利は開戦すぐ本陣へ突き進み、四天王寺の南（z12）は敵の塊の向こうになって歩いて着けなかった（bot 180秒で37mまで）→ 先手が受ける所に立てる
  2: () => ({ x: HONF.x, z: HONF.z, label: '本陣の前' }),
  3: (rt) => ({ x: rt.flags.uma.position.x, z: rt.flags.uma.position.z, label: '大御所の馬印' }),
  4: () => ({ x: HONF.x, z: HONF.z, label: '本陣の前' }),   // 信繁の三の突撃は本陣の前でぶつかる（charge の行き先も同じ所）
  0.7: (rt) => (rt.flags.seen ? { x: FRONT.x - 4, z: FRONT.z + 6, label: '本多忠朝の陣' } : { x: MIRU.x, z: MIRU.z, label: '麓の畦' }),
  5: () => ({ x: YASUI.x, z: YASUI.z, label: '安居の天神' }),
  6: (rt) => { const a = rt?.flags?.shAt || SHINGARI; return { x: a.x, z: a.z + 6, label: '毛利の殿' }; },   // 殿は退く毛利の手の後ろ（主人公の目の前）に出る
  7: () => ({ x: TOP.x, z: TOP.z, label: '茶臼山の丘の上' }),
};
const GOAL_LIMIT = { 1: '毛利勝永の先手に押し切られた', 2: '真田と毛利の突撃を止められなかった', 3: '真田の二の突撃に本陣を破られた', 4: '真田信繁の旗本を討ちきれなかった', 5: '真田信繁を取り逃がした', 6: '毛利の殿を崩せなかった', 7: '茶臼山に旗を立てられなかった' };

const ROADS = [
  [[-38, 230], [-40, HON.z], [-46, 90], [-46, FRONT.z], [-46, 0], [-26, -6], [-24, -60], [10, -180], [CASTLE.x, CASTLE.z + 30]],
  [[-46, 0], [-68, -26], [YASUI.x, YASUI.z], [CHAUSU.x, CHAUSU.z]],
  [[CHAUSU.x, CHAUSU.z], [-104, 50], [-84, 92], [HONF.x, HONF.z]],   // 茶臼山から本陣への真田の寄せ道
];

const TOYO = { armor: 0x4a4036, flag: 'toyotomi' };   // 11/9 kaito 四12：黒すぎた（0x221f1c）→ 漆の褐色が見える明るさに                    // 毛利勝永の隊（豊臣の旗）
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };     // 真田の赤備え（全員赤）
const TOKU = { armor: 0x48443e, flag: 'tokugawa' };
const HONDA = { armor: 0x46403a, flag: 'honda' };
const kit = (side, o = {}) => ({ flag: side.flag, armor: side.armor, ...(side.lace ? { lace: side.lace } : {}), ...o });
const sq = (side, type, n, o) => ({ type, n, o: { ...kit(side, o), ...((type === 'ashigaru' || type === 'gun') && !o?.name && o?.flag !== null && o?.flagScale == null ? { flagScale: 1.5 } : {}) } });   // 11/9 kaito 四11：旗を高く立てる（どの家の隊か遠くから分かる）
const alive = (g) => g && !g.routed && g.count > 0;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const sum = (gs) => (gs || []).reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
// 味方の隊は持ち場（anchor）を移すだけ。兵は走って付いてくる
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
// 道の点を順に歩かせ、終わりの点で構える
const march = (g, pts) => { if (!alive(g) || !pts.length) return; const [p, ...rest] = pts; g.order = 'move'; g.anchor = { x: p.x, z: p.z }; g.dest = { x: p.x, z: p.z }; g.onArrive = (q) => { q.onArrive = null; if (rest.length) march(q, rest); else hold(q, p.x, p.z); }; };
const flee = (gs) => { for (const g of gs) if (alive(g)) { g.noRout = false; g.routed = true; g.order = 'flee'; g.allOutRun = true; } };   // 退く隊は走る（11/9 kaito 四8「散歩に見える」）

// ---- 地形：国土地理院の標高（上町台地の西の崖・茶臼山・東の低い田）を縦に少し強めて写す ----
// 標高の茶臼山の丘の上（実の二十六メートル。格子の (-99,-25)）をゲームの茶臼山に重ねる（DX・DZ）。安居の天神・四天王寺との向きと距離は史跡の地図どおり
const XY = 8, VZ = 0.36, DX = 7, DZ = -29;
function demAt(x, z) {
  const sx = (x + DX) * XY, sz = (z + DZ) * XY;
  return (demSample(dem, sx, sz) * 2 + demSample(dem, sx + 24, sz) + demSample(dem, sx - 24, sz) + demSample(dem, sx, sz + 24) + demSample(dem, sx, sz - 24)) / 6;
}
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.043) + 0.15 * Math.sin(z * 0.09 - x * 0.03);
  if (dem) h += Math.max(0, demAt(x, z) - 3) * VZ;
  // 茶臼山（古墳の丘。高さは実の二十六メートルほど）。標高の丘に、人の背の倍ほどの盛り上がりを足す（標高が読めない時は丘ごと）
  const dc = Math.hypot(x - CHAUSU.x, z - CHAUSU.z);
  if (dc < 16) { const t = 1 - dc / 16; h += (dem ? 1.8 : 3.2) * t * t * (3 - 2 * t); }
  return h;
}

// ---- 陣の見た目：家康の本陣（陣幕・金扇の馬印・葵の幟）・本多の先手・茶臼山の六文銭・四天王寺の前の豊臣の旗・大坂城 ----
function scenery(rt) {
  const W = rt.world, F = rt.flags;
  rt.scene.add(jinmaku(W, HON.x, HON.z + 6, 16, 12, 6, { mon: 'tokugawa', noUma: true, gapNorth: 6 })   /* K074：前にも口（x -43〜-37）。閉じた前の幕に兵が詰まった */);
  F.uma = umajirushi(W, HON.x + 3, HON.z - 2, 0, 'ogi');
  rt.scene.add(F.uma);
  // 本陣のまわりの旗本の葵の幟（数千の旗本の旗が並ぶ）
  F.honNobori = []; for (let i = 0; i < 14; i++) { const a = -1.2 + (i / 13) * 2.4, r = 15 + (i % 2) * 5, n = nobori(W, HON.x + Math.sin(a) * r, HON.z + 4 - Math.cos(a) * r * 0.8, 'tokugawa', 6); F.honNobori.push(n); rt.scene.add(n); }   // 本陣の危機で一本ずつ倒れる（k15/jindate.js）
  for (const [x, z] of [[HON.x - 5, HON.z - 6], [HON.x + 6, HON.z - 6]]) rt.scene.add(kagaribi(W, x, z));
  for (const [x, z] of [[FRONT.x - 10, FRONT.z + 5], [FRONT.x, FRONT.z + 7], [FRONT.x + 10, FRONT.z + 5]]) rt.scene.add(nobori(W, x, z, 'honda', 6));
  for (const [x, z] of [[CHAUSU.x - 5, CHAUSU.z - 3], [CHAUSU.x + 5, CHAUSU.z - 2], [CHAUSU.x, CHAUSU.z + 6], [CHAUSU.x + 9, CHAUSU.z + 7], [CHAUSU.x - 8, CHAUSU.z + 6]]) rt.scene.add(nobori(W, x, z, 'sanada', 6));
  for (const [x, z] of [[SHITENNO.x - 10, SHITENNO.z - 4], [SHITENNO.x + 6, SHITENNO.z - 6], [SHITENNO.x + 16, SHITENNO.z - 4]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  garanAto(rt);
  yasuiSha(rt);
  // 大坂城（遠景。兵は置かない）：冬の陣の和議で二の丸・惣構えを壊され堀を埋められた「裸城」（osaka_far.js）
  osakaFar(rt, { x: CASTLE.x - 26, z: CASTLE.z + 28, s: 2, era: 'summer', land: [[-200, -700, 300, -301]] });
}

// 四天王寺の伽藍の焼け跡：前の年の冬の陣で焼け、建て直しは元和九年（1623）。南大門から北へ中門・塔・金堂・講堂が一直線（四天王寺式）。
// 基壇と礎石・焦げた柱の根だけが残る
const GARAN = [{ z: -20, nx: 3, nz: 2, s: 2.2, base: 0.12 }, { z: -25.5, nx: 4, nz: 4, s: 1.8, base: 0.22 }, { z: -32.5, nx: 5, nz: 4, s: 2.4, base: 0.25 }, { z: -41, nx: 7, nz: 4, s: 2.5, base: 0.2 }];
let charMat = null, earthMat = null, stoneMat = null;
function garanAto(rt) {
  // 礎石は白っぽい花崗岩（城の石の材質では黒い塊に見えた）・基壇は台地の乾いた土の色で低く（のっぺりした灰色の板に見えた・11/8 通し⑥）
  const W = rt.world, stone = (stoneMat ||= new THREE.MeshStandardMaterial({ color: 0xa39d90, roughness: 0.95, metalness: 0 }));
  charMat ||= new THREE.MeshStandardMaterial({ color: 0x75685a, roughness: 1, metalness: 0 });   // 一年雨に晒された炭の灰茶（橋の古材の材質や濃い焦げ色では、黒い筒の列に見えた）
  earthMat ||= new THREE.MeshStandardMaterial({ color: 0x8e7d5f, roughness: 1, metalness: 0 });
  const rock = new THREE.DodecahedronGeometry(0.42, 0), stub = new THREE.CylinderGeometry(0.2, 0.24, 1, 7);
  const spots = [];
  for (const b of GARAN) for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.nz; j++) spots.push({ b, x: SHITENNO.x + (i - (b.nx - 1) / 2) * b.s, z: SHITENNO.z + b.z + (j - (b.nz - 1) / 2) * b.s });
  const stones = new THREE.InstancedMesh(rock, stone, spots.length), posts = new THREE.InstancedMesh(stub, charMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let np = 0;
  spots.forEach((p, k) => {
    const y = W.heightAt(p.x, p.z) + p.b.base;
    m.compose(v.set(p.x, y + 0.08, p.z), q.setFromEuler(e.set(0, k * 1.7, 0)), sc.set(1.1, 0.45, 1.1)); stones.setMatrixAt(k, m);
    // 焼け残った低い柱の根は小さな杭と同じく踏み越える（当たりを置くと伽藍跡で兵が詰まる）。
    // 真っ黒で人の背より高い柱が礎石ごとに並び、黒い墓標の列に見えた（11/8 通し・⑥）→ 低い焦げ茶の根に
    if (k % 4 === 0) { const hh = 0.25 + ((k * 13) % 5) * 0.15; m.compose(v.set(p.x, y + 0.2 + hh / 2, p.z), q.setFromEuler(e.set(((k % 4) - 1.5) * 0.08, 0, ((k % 3) - 1) * 0.1)), sc.set(1, hh, 1)); posts.setMatrixAt(np++, m); }
  });
  posts.count = np;
  for (const o of [stones, posts]) { o.castShadow = true; o.receiveShadow = true; rt.scene.add(o); }
  // 基壇（土を突き固めた低い台。焼けて縁の石が崩れ、角は丸く崩れている）
  for (const b of GARAN) {
    const w = (b.nx - 1) * b.s + 2.4, d = (b.nz - 1) * b.s + 2.4, cz = SHITENNO.z + b.z, hh = b.base + 0.6;
    const geo = new THREE.CylinderGeometry(0.5, 0.62, hh, 8, 1); geo.rotateY(Math.PI / 8); geo.scale(w * 1.08, 1, d * 1.08);
    const g = new THREE.Mesh(geo, earthMat);
    g.position.set(SHITENNO.x, W.heightAt(SHITENNO.x, cz) + b.base - hh / 2, cz); g.receiveShadow = true; rt.scene.add(g);
  }
}
// 安居の天神（菅原道真を祀る小さな社と、白木の鳥居）
let shiraki = null;
function yasuiSha(rt) {
  // 白木の鳥居は黒くしない（橋の古材は頂点の色で塗る材質で、色の無い箱では黒い鳥居に見えた）
  shiraki ||= Object.assign(bridgeWoodMaterial().clone(), { vertexColors: false, color: new THREE.Color(0xd8c4a0) });
  const W = rt.world, wood = shiraki, x = YASUI.x - 7, z = YASUI.z - 10;
  rt.scene.add(dou(W, x, z, 4.2, 3.4, 0, { h: 2.4 }));
  const tz = z + 6.5, y = W.heightAt(x, tz), T = new THREE.Group();
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.6, 10), wood); p.position.set(sx * 1.5, 1.8, 0); T.add(p); solidCircle(x + sx * 1.5, tz, 0.22); }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.26, 0.36), wood); kasagi.position.y = 3.7; T.add(kasagi);
  const shimaki = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 0.3), wood); shimaki.position.y = 3.47; T.add(shimaki);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.16), wood); nuki.position.y = 2.75; T.add(nuki);
  const gaku = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), wood); gaku.position.y = 3.12; T.add(gaku);
  T.position.set(x, y, tz); T.traverse((o) => { o.castShadow = true; }); rt.scene.add(T);
}

const k15_tennoji_okayama = {
  introMapLayout: fujinLayout,
  introMapGround: fujinDraw,
  // 身の回りの合戦の跡（timeslip_field.js）。五月七日（今の六月）の昼。乾いた台地の土埃、最後の野戦の倒れた槍と旗
  timeslip: {
    wet: 0.1, dust: 0.7, trample: 0.45, debris: 1.5, arrows: 1, maxSlope: 0.3,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  // 開戦の溜めは置かない（戦の前の話と合わせて三十五秒待たされた。五4「待ちは15秒まで」・critic60）。前の話だけ十秒
  prelude: false,
  // 始まりの札：味方対敵の人数と二三行（五4・critic60）。日付は一行に収める
  //   札は戦の名・年・味方対敵・二三行・始める釦だけ（五4）。人物の欄は置かない（本文が欄に押されて見えなかった）
  introPeople: [],
  introText: () => '家康の本陣の前で真田の突撃を止め、退く信繁を安居の天神で討て。',   // 札の二行に収める。人数は上の行に出るので本文に重ねない
  // 行き先は段ごとに地図の場所で固定（三2・critic60「▼の距離が動く」）。頭上の▼は場所の一つだけで、名のある味方（西尾宗次）へ金の▼を付けない（五3）
  actionGuideTarget: () => null,
  routeGuidePriority: () => true,   // 行き先の印を優先し、画面の端の敵将への矢印を出さない
  goalSignTarget: (rt) => (rt.flags.ending ? null : DEST[rt.flags.step] ? { ...DEST[rt.flags.step](rt), hideAfterArrival: true, arrivalId: rt.flags.step } : null),
  pacingCap: 2100,   // 全戦共通の十八分の打ち切りを、この戦は三十五分に（一戦20〜30分。battle_pacing.js）
  playerRegen: 0.012,   // 一戦が二十分を超えるので、退いて息を整える間の戻りを全戦の上限まで（11/8）
  gunFloor: 0.7,   // 鉄砲・矢の傷も少し軽く（毛利の鉄砲に止まったまま十秒で討たれた）
  cutFloor: 0.42,   // 長い戦なので刃の一太刀を少し軽く（11/8）
  meleeGrace: { rate: 0.35, burst: 0.32, interval: 3 },   // 11/8：敵が本陣へ一直線に寄せ、行く手の主人公が四人に一度に斬られて一瞬で倒れた → 一度に受ける刃は命の三割ほどまで   // 刃を受けた後の3秒は次の刃を通さない
  // 見せかけの軍勢・遠くの作り物の戦い・見えない所から湧く小勢は置かない（kaito AA・AF・AV の4・AW の6）
  noReserve: true, noWake: true, noTaishoRaid: true, noFrontFill: true, noDistantBattle: true, noFarFill: true, noAheadFill: true,
  frontlineDensity: false,
  stageGoalsOnly: true,   // 目標は五つの段だけ
  // 戦の途中の保存（battle_checkpoint.js・kaito 11/8）：段の始まりを、段の関数を順に流して作り直す。前の段の声・見出しは出さない
  resumeSteps: [
    [1, function (rt) { const F = rt.flags; F.told = true; F.seen = true; this.stage1(rt); }],
    ['oka', function (rt) { this.tadatomo(rt); this.stage2(rt); }],
    [2, function (rt) { const F = rt.flags; if (!F.tadaDone) this.tadatomo(rt); F.oka = { ...(F.oka || {}), s: F.oka?.s || [], n: F.oka?.n || 0, done: true, passed: true }; this.stage2(rt); }],
    [3, function (rt) { this.stage3(rt); }],
    [4, function (rt) { rt.flags.umaUp = true; this.stage4(rt); }],
    [5, function (rt) { this.stage5(rt); }],
    [6, function (rt) { const F = rt.flags; if (F.nobuU?.alive) { try { Object.defineProperty(F.nobuU, 'invuln', { configurable: true, writable: true, value: false }); } catch (e) { /* そのまま */ } rt.army.kill(F.nobuU, null); } if (F.step !== 6) this.stage6(rt, false, YASUI); }],
    [7, function (rt) { this.stage7(rt); }],
  ],
  // 続ける所：段の行き先の十四メートル手前（本陣の側＝南）
  resumeAt: (rt, step) => { const d = step === 'oka' ? null : DEST[step]?.(rt); return d ? { x: d.x, z: d.z + 14, heading: Math.PI } : null; },
  // 戦の前の話の間は、近くの名のある味方（小笠原秀政）へ「ついて行く」印を出さない。人の頭の▼に字を添えない（物差し 五-1）
  goalSignOff: (rt) => !rt.flags.step,
  goalSignUnitNoLabel: true,
  // 11/9 kaito 四4：小さな隊が崩れただけで「敵は総崩れじゃ」と出た（大軍が来る前・真田の突撃の前）。この戦の崩れの声は一手の崩れとして言う
  battleVoices: { lines: { ally: { rout: ['一手が崩れた！', '敵の一手が退くぞ！', 'あの手は崩れた。次が来るぞ！'] } } },
  sides: { a: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' } },
  realCap: REAL_CAP,
  taisho: { a: { name: '徳川家康', def: true }, b: { name: '真田信繁', def: true } },
  // 11/12 kaito 遊び5-29：伝令の騎馬が徳川の陣（本陣・旗本・二陣・先手の後ろ）を駆け巡る。大坂城への一本道でなく陣の中の輪を走る
  courierPath: [[HON.x + 6, HON.z + 14], [HON.x + 22, HON.z - 6], [HONF.x + 24, HONF.z - 22], [FRONT.x + 12, FRONT.z + 36], [FRONT.x - 14, FRONT.z + 44], [HONF.x - 16, HONF.z - 6], [HON.x - 18, HON.z + 10], [HON.x + 6, HON.z + 14]],
  courierN: 4,
  // K019：bot の記録に旗本の鉄砲の一斉射撃の回数と落とした騎馬の数を出す（playbot.js rep.botStat）
  botStat(rt) { const F = rt.flags; return `旗本の一斉射撃${F.volN || 0}回・落とした騎馬${F.volKill || 0}騎`; },
  world: {
    seed: 1615507,
    drawLow: true,   // 携帯の描く解像度を .7/.6 に（実機 46→34ms。K073）
    noFake: true,   // 11/13 K285：見せかけの兵（addDistantArmy・addClash）を一人も出さない。映る兵は全員 戦の中の本物
    fakeNear: 25, fakeNearOk: true,   // 11/12 司令塔：軽い大軍を本物の兵の 25m 後ろから描き、陣の厚みを見せる（台帳 K001。world.js）
    time: 'day',
    dayBounce: 1.3, bounceGround: 0x6a5a44,   // 11/13 MB二（台帳 K033・司令塔「兵が黒い塊」）：五月の昼の地面の照り返しを強め、兵の陰の面（具足の胴・顔）に光を回す。影の数は増やさない
    groundHalf: 300,
    // 上町台地は大坂の南の平らな台地。地図の外を丘にせず、山並みは生駒・葛城が遠くに低く霞むだけ（四5・critic60「すぐ脇に高い山並み」）
    farReliefScale: 0.12,
    mountainScale: 0.14, mountainHaze: 0.88,
    height,
    paths: ROADS,
    tint(x, z, h, c) {
      for (const r of ROADS) if (distToPolyline(x, z, r) < 2.6) { c.setRGB(c.r * 0.5 + 0.21, c.g * 0.5 + 0.18, c.b * 0.5 + 0.12); return; }
      if (h < 1.4) { c.setRGB(c.r * 0.55 + 0.08, c.g * 0.62 + 0.12, c.b * 0.6 + 0.08); return; }
      const p = 0.5 + 0.5 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06);
      c.setRGB(c.r * (0.8 + p * 0.2) + 0.05 * p, c.g * (0.84 + p * 0.16), c.b * 0.8);
    },
    clear: (x, z) => ROADS.some((r) => distToPolyline(x, z, r) < 6) || near({ x, z }, HON, 24) || near({ x, z }, HONF, 24) || near({ x, z }, HON2, 16) || near({ x, z }, YASUI, 14) || near({ x, z }, CHAUSU, 18) || near({ x, z }, ECHI, 16) || near({ x, z }, FRONT, 26) || (Math.abs(x - SHITENNO.x) < 12 && z < SHITENNO.z - 15 && z > SHITENNO.z - 47) || near({ x, z }, { x: YASUI.x - 7, z: YASUI.z - 6 }, 7),
    trees: isTouch ? 110 : 320,   // 11/13 K073：実機の三角形の約三分の二は野の木（一本 約650 三角形）。携帯は本数を三分の一に
    // 11/8 critic60 八1・九5：野の木に杉を混ぜない（遠くの杉が白く透けたお化けに見えた）。松と楠（雑木）だけ
    treeMix: { sugi: 0.04, matsu: 0.66 },
    // 11/8 critic60 八1・四1：逆光の近い味方の足軽が真っ黒な影の人形に見えた。兵の面の補光を少し上げる
    unitCloudFill: 0.75,   // 11/9 kaito 四12「兵の色が暗すぎて黒い」
    tufts: 2600,
    treeDensity: (x, z) => {
      if (near({ x, z }, SHITENNO, 26)) return 1.2;     // 四天王寺の森
      if (near({ x, z }, YASUI, 22)) return 1;           // 安居の天神の杜
      if (x < -70 && z > -60 && z < 160) return 0.05;   // 真田の寄せ道
      return x > -130 && x < 190 && z > -120 && z < 200 ? 0.08 : 0.5;
    },
    // 四天王寺の森は焼けた伽藍の東西に残る。安居の天神の杜は社の後ろ（北）
    //   上町台地の寺社の杜は松と楠（杉の山の森ではない）。遠くの杉が白く透けたお化けに見えた（critic60。透けは共通の木の作り＝real_common へ）
    groves: [{ x: SHITENNO.x - 22, z: SHITENNO.z - 28, r: 10, n: 12, kind: 'matsu' }, { x: SHITENNO.x + 38, z: SHITENNO.z - 28, r: 8, n: 10, kind: 'matsu' }, { x: YASUI.x - 8, z: YASUI.z - 20, r: 8, n: 12, kind: 'broad' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -200 : z > 240),
  },

  setup(rt) {
    timeslipField(rt);
    // 段が変わる時の中央の青い札は右上の任務と同じ字で、874×402 では任務の札の下の端（y≒180）と左下の命の札に重なっていた（11/11 見回り）。
    // 青い札は出さず、残る中央の知らせは任務の札の左の細い帯（上の方）に置く。この戦だけに効かせる。
    if (typeof document !== 'undefined' && !document.getElementById('k15-cc-style')) {
      const st = document.createElement('style'); st.id = 'k15-cc-style';
      st.textContent = `
html:root body #hud:has(#h-prog[data-battle="k15_tennoji_okayama"]) #center-call { left:30vw; right:auto; top:calc(48px + env(safe-area-inset-top,0px)); width:32vw; }
html:root body #hud:has(#h-prog[data-battle="k15_tennoji_okayama"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="k15_tennoji_okayama"]) #center-call .cc { max-width:100%; box-sizing:border-box; padding:4px 6px; font-size:16px; line-height:1.35; letter-spacing:0; }`;
      document.head.appendChild(st);
    }
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor, kg = rt.def.gunFloor || 1; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; if (s && !s.isStruct && a > 0) { const cap = (this.u.maxHp || 100) * 0.3; if (this._k15T !== rt.t) { this._k15T = rt.t; this._k15A = 0; } a = Math.max(0, Math.min(a * (m ? kg : k), cap, cap - this._k15A)); this._k15A += a; if (!a) { this.u.hitKind = null; return 0; } } return td.call(this, a, s); }; }   // 11/9：三方から寄せる敵に囲まれ、同じ一瞬に六人の刃で五十二から零に → 一瞬に受ける傷の合わせも命の三割まで   // 11/8：真田の騎馬が増え、馬の当たりと刃の重なりで一息に討たれた → 一つの傷は命の三割まで   // 受ける量そのものを減らす（11/8：前は減らした値を返すだけで、命には効いていなかった）   // 刃の一太刀を def.cutFloor 倍に（この戦だけ）
    const F = rt.flags, S = Math.PI;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 11/9 kaito 四22：馬が隣にあるなら、馬に乗った状態で始める（前は乗っていても降ろしていた）
    { const P = rt.player, L = P.loose; if (P.canRide && !P.mounted && L && L.mode !== 'fled' && P.u && Math.hypot(L.x - P.u.pos.x, L.z - P.u.pos.z) < 3.2) P.toggleMount(); }
    scenery(rt);
    installOkayama(rt, this);   // 岡山口の段（k15/okayamaguchi.js）：毛利の先手の後、真田の突撃の前に入る
    k15SoundSetup(rt);   // 音と声（k15/sound.js）
    jindate.install(rt, { FRONT, NIJIN, HON, HONF, SHITENNO, CHAUSU, ECHI });

    // ---- 徳川方：大御所の本陣（旗本の侍に囲まれて床几に座る。床几の主の前で近臣の正純は馬を下りる）・旗本の二の備・本多忠朝の先手・自分の手勢 ----
    F.hon = allyGroup(rt, { faction: 'tokugawa', name: '大御所の旗本', anchor: { x: HON.x, z: HON.z }, facing: S, width: 9, aggro: 16, seekRange: 20, order: 'hold', fixed: true, noRout: true, fullStrength: true, morale: 100 },
      [sq(TOKU, 'busho', 1, { name: '徳川家康', invuln: true, horse: true }), sq(TOKU, 'busho', 1, { name: '本多正純', invuln: true, horse: false, hat: 'kabuto_m', flag: 'honda' }),
        sq(TOKU, 'samurai', 20), sq(TOKU, 'gun', 8)]);   // 本物の兵の枠（二百五十）の内で二陣を置くため少し減らし、厚みは後ろの軽い大軍で見せる
    F.ieyasu = F.hon.units.find((u) => u.name === '徳川家康');
    if (F.ieyasu) F.ieyasu._crouch = true;   // 床几に腰を下ろす
    // 馬は後ろに引かせておき（降りて床几へ）、本陣が危うくなったら乗って退く（docs/k15_crisis_spec_1108.md「家康が実際に馬で退く」）
    if (F.ieyasu?.mounted && rt.army.setMounted) { try { rt.army.setMounted(F.ieyasu, false); } catch (e) { /* 馬が無くても戦は進む */ } }
    // 11/8 kaito：家康が討たれたら負け（本陣が破られた数で負けにしない）。旗本に守られ、厚い具足で討たれにくい
    if (F.ieyasu) { F.ieyasu.invuln = false; F.ieyasu.hp = F.ieyasu.maxHp = Math.round((F.ieyasu.maxHp || 190) * 9); }
    F.hata2 = allyGroup(rt, { faction: 'tokugawa', name: '旗本の二の備', anchor: { x: HON.x - 8, z: HON.z - 24 }, facing: S, width: 10, aggro: 16, seekRange: 20, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'samurai', 8), sq(TOKU, 'ashigaru', 7), sq(TOKU, 'gun', 3)]);
    // 二陣（榊原康勝・仙石忠政ら）：先手と本陣の間に陣し、先手を破った敵を受け止める（11/8 陣の厚み。本陣まで陣が何重にも）。敵が二十m 先まで来たら二陣も槍を合わせる（11/11 見回り：敵を前に突っ立つ・kaito 四5）
    F.nijin = allyGroup(rt, { faction: 'tokugawa', name: '榊原康勝の二陣', anchor: { x: NIJIN.x, z: NIJIN.z }, facing: S, width: 12, aggro: 22, seekRange: 28, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      [sq({ armor: TOKU.armor, flag: 'sakakibara' }, 'busho', 1, { name: '榊原康勝', hat: 'kabuto_m', horse: true }), sq({ armor: TOKU.armor, flag: 'sakakibara' }, 'samurai', 4), sq({ armor: TOKU.armor, flag: 'sakakibara' }, 'ashigaru', 10), sq({ armor: TOKU.armor, flag: 'sakakibara' }, 'gun', 3)]);
    F.nijin.defMult = 1.2; F.nijin.dmgMult = 0.6;
    // 二陣は後詰の構え（g.reserve）：本人が先手で斬り合うと「一緒に突っ込む」（ally_charge.js）が二陣まで attack にし、四十六m 先の敵へ届かず持ち場で二十秒ずつ立ち尽くした（11/11 act bot 18回）。
    // 前の備が崩れる・減るまでは持ち場で槍を構え、二十二m に来た敵とだけ槍を合わせる。助け（本陣へ戻れ）・追い討ちはこれまでどおり筋書きが動かす
    F.nijin.reserve = true;
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠朝の先手', anchor: { x: FRONT.x, z: FRONT.z }, facing: S, width: 12, aggro: 14, seekRange: 30, morale: 95, noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      [sq(HONDA, 'busho', 1, { name: '本多忠朝', hat: 'kabuto_m', horse: true }), sq(HONDA, 'busho', 1, { name: '小笠原秀政', hat: 'kabuto_m', horse: true, flag: null }),   // 小笠原は三階菱の家。大将は背に旗を差さず、葵の旗は持たせない

        sq(HONDA, 'samurai', 5), sq(HONDA, 'ashigaru', 14), sq(HONDA, 'gun', 5)]);
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: START.x + 4, z: START.z - 2 }, facing: S, width: 10, aggro: 14, seekRange: 20, noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'samurai', 4), sq(TOKU, 'ashigaru', 12), sq(TOKU, 'gun', 3)]);
    // 松平忠直の越前勢：初めから茶臼山の正面（南）に陣し、真田と向き合う（史実の布陣。忠直と西尾宗次は馬上）
    F.echizen = allyGroup(rt, { faction: 'tokugawa', name: '松平忠直の越前勢', anchor: { x: ECHI.x, z: ECHI.z }, facing: S, width: 12, aggro: 12, seekRange: 16, order: 'hold', noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'busho', 1, { name: '松平忠直', invuln: true, hat: 'kabuto_shika', horse: true }), sq(TOKU, 'busho', 1, { name: '西尾宗次', invuln: true, hat: 'kabuto_m', horse: true }),
        sq(TOKU, 'samurai', 5), sq(TOKU, 'ashigaru', 8), sq(TOKU, 'gun', 4)]);
    F.echizen.dmgMult = 0.45;
    F.echizen.stay = true;   // 物見の主人公が茶臼山に寄っても、越前勢は持ち場を離れて真田へ掛からない（一緒に突っ込む ally_charge が正午前に越前と真田をぶつけた）
    for (const g of [F.mine, F.honda, F.hata2]) { g.defMult = 1.15; g.dmgMult = 0.6; }
    F.hon.dmgMult = 0.6; F.hon.defMult = 1.5;   // 旗本は厚い具足の侍。崩れにくい
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 4 }, S, [{ kind: 'spear', n }]);

    // ---- 豊臣方：四天王寺の南門の前の毛利勝永の先手・茶臼山の真田（初めは丘の上で待つ） ----
    F.mori = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利勝永の先手', anchor: { x: SHITENNO.x, z: SHITENNO.z + 8 }, facing: 0, width: 10, aggro: 10, seekRange: 20, order: 'hold', morale: 95, formation: 'yari' },
      [sq(TOYO, 'busho', 1, { name: NAMES.katsunaga, invuln: true, horse: true }), sq(TOYO, 'cavalry', 6), sq(TOYO, 'samurai', 8), sq(TOYO, 'ashigaru', 21), sq(TOYO, 'gun', 9)]);   // 11/9 kaito 四2・10：勝永の騎馬が先に立ち、鉄砲も厚く   // 11/8 kaito：勝永が前線に立ち、大勢がまとまって中央を突破してくる
    F.sanada = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の赤備え', anchor: { x: CHAUSU.x + 2, z: CHAUSU.z - 8 }, facing: 0.6, width: 12, aggro: 4, seekRange: 6, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'busho', 1, { name: NAMES.otani, horse: true, hat: 'kabuto_m' }), sq(SANADA, 'cavalry', 12), sq(SANADA, 'samurai', 5), sq(SANADA, 'ashigaru', 10), sq(SANADA, 'gun', 6)]);   // 11/9 kaito 四3・5・10：騎馬と鉄砲を増やし、大谷吉治は馬で隊と駆ける（徒で取り残され突っ立った）   // 11/8 kaito：真田は騎馬を増やす
    // 大谷吉治（大谷吉継の子）は真田の手に加わり、この日討死した（史実）。②で主人公が首を狙う将。家臣が必死に守る
    F.otaniU = F.sanada.units.find((u) => u.name === NAMES.otani);
    if (F.otaniU) F.otaniU.hp = F.otaniU.maxHp = Math.round((F.otaniU.maxHp || 100) * 1.6);
    F.nobu = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田信繁の旗本', anchor: { x: CHAUSU.x - 4, z: CHAUSU.z - 14 }, facing: 0.6, width: 8, aggro: 4, seekRange: 6, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'busho', 1, { name: '真田信繁', invuln: true, horse: true, hat: 'kabuto_sanada' }), sq(SANADA, 'cavalry', 18), sq(SANADA, 'samurai', 8)]);   // 11/9 kaito 四3：信繁の率いる最初の隊が少なすぎた（騎馬10→18）
    F.nobuU = F.nobu.units.find((u) => u.name === '真田信繁');
    // 11/9 kaito 四7「信繁の HP が多すぎる（攻撃されても死なない）」：命を三割減らし、深手（命の三割五分）を負えば、④なら安居の天神へ退く。②③はよろめいて「浅手じゃ」と踏み止まる
    if (F.nobuU) {
      const D = this, N = F.nobuU;
      N.hp = N.maxHp = Math.round((N.maxHp || 190) * 0.7);
      N.onWound = () => {
        if (F.ending || !N.alive) return;
        if (F.step === 4) { rt.say('真田信繁', '……深手じゃ。天神の杜まで退け', 3); D.stage5(rt); return; }
        N.hp = N.maxHp * 0.55; N.stagger = 0.8;
        if (!(F.nwT > rt.t)) { F.nwT = rt.t + 10; rt.say('真田信繁', '浅手じゃ。まだ退かぬ！', 2.6); }
      };
    }
    for (const g of [F.sanada, F.nobu]) g.noFrontline = true;
    // 物見の主人公が寄っても、茶臼山の備えは持ち場を離れない（一緒に突っ込む ally_charge が隊ごと攻めに出した）
    for (const g of [F.sanada, F.nobu, F.mori]) g.stay = true;
    selfGuard(F.hon, F.hata2, F.nijin, F.honda, F.echizen, F.mori, F.sanada, F.nobu);

    // 目標に名を挙げた敵将と真田の旗本は、初めから分かっている（伏せ字で目標が「見えぬ敵の陣を物見する」に化けた。三1・十1・critic60）
    for (const n of ['真田信繁', '毛利勝永']) revealName(rt, n);
    rt.enemyIntel.camp = true;
    // 戦の前の話（大御所の本陣）。待ちは十秒（五4）
    rt.setPhase('brief');
    rt.after(0.3, () => rt.say('徳川家康', '秀頼が城を出ぬなら、今日で終いじゃ。天王寺口はわしが受け持つ', 3.4));
    rt.after(3.8, () => rt.say('本多正純', '岡山口は将軍様。井伊・藤堂・前田が付いておりまする', 3));
    rt.after(6.9, () => rt.say('本多忠朝', '先手はこの忠朝が承る。冬の陣の恥を、今日の槍で雪ぐ', 3));
    chausuyama(rt, { DEST, next: () => this.stage1(rt) });   // 茶臼山の布陣・物見（十秒の話の後、物見の場へ。着くか時が来れば①へ）
  },

  // 0.7 物見の続き：茶臼山の麓の畦まで出て赤備えの数を見届け、本多忠朝の陣へ戻って知らせる（真田の物見の鉄砲組が追い払いに下りて来る）
  scoutRun(rt) {
    const F = rt.flags;
    if (F.ending || F.step === 0.7 || F.step >= 1) return;
    F.step = 0.7; F.tS = rt.t; F.seeT = 0;
    rt.unmark('k15');
    rt.obj('main', '茶臼山の麓の畦で赤備えを見届け、本多忠朝へ知らせる', 'main');
    rt.marker('k15', () => DEST[0.7](rt), () => DEST[0.7](rt).label);
    rt.say(NAMES.tadatomo, '赤備えの数が知れぬ。麓の畦まで寄って、しかと数えて参れ', 3.2);
    rt.after(6, () => {
      if (F.step !== 0.7 || F.ending) return;
      F.scout = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の物見', anchor: { x: CHAUSU.x + 14, z: CHAUSU.z + 14 }, facing: 2.2, width: 6, aggro: 16, seekRange: 22, order: 'attack', morale: 90 },
        [sq(SANADA, 'samurai', 3), sq(SANADA, 'ashigaru', 5), sq(SANADA, 'gun', 3)]);
      F.scout.anchor = { x: MIRU.x - 2, z: MIRU.z - 2 }; F.scout.noFrontline = true;
    });
  },
  tick07(rt, dt, P) {
    const F = rt.flags;
    if (!F.seen) {
      if (near(P, MIRU, 7)) F.seeT += dt;
      if (F.seeT > 3) { F.seen = true; rt.say(nm(rt), '赤備えはおよそ三千五百、丘の裏に馬を伏せておる……', 3.2); rt.after(3.4, () => rt.say(nm(rt), '本多の陣へ知らせに戻る！', 2.4)); sfx('taiko', 0.4); }
    } else if (!F.told && near(P, DEST[0.7](rt), 7)) {
      F.told = true;
      rt.award((t) => t.side.push('茶臼山の麓で赤備えの数を見届けた'), '赤備えの数を知らせた');
      rt.say(NAMES.tadatomo, '三千五百か。よう見た。……毛利の手が動いたぞ、構えよ！', 3.4);
      if (F.scout && !F.scout.routed) flee([F.scout]);
      rt.after(3.6, () => { if (F.step === 0.7 && !F.ending) this.stage1(rt); });
    }
    // 畦へ出なくても、正午には毛利の手が撃ちかけて戦が始まる（二5）
    if (!F.told && rt.t - F.tS > 90) { F.told = true; if (F.scout && !F.scout.routed) flee([F.scout]); this.stage1(rt); }
  },
  // ① 四天王寺の南で毛利勝永の先手を食い止める（途中で本多忠朝が討たれ、勝永の本隊が出る）
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.tS = rt.t;
    rt.setPhase('battle');
    sfx('horagai', 0.8); rt.after(1.2, () => sfx('taiko', 0.8));
    rt.banner('豊臣方の総出撃', '慶長二十年五月七日　正午　天王寺口');
    rt.obj('main', '四天王寺の南で毛利勝永の先手を食い止める', 'main');
    F.s1 = [F.mori]; F.n1 = F.mori.count; F.hondaN0 = F.honda?.count || 0;
    rt.marker('k15', () => DEST[1](rt), () => DEST[1](rt).label);   // 行き先は場所で固定（三2）
    if (!rt.markers.some((m) => m.id === 'moriMark')) rt.marker('moriMark', () => { const g = F.mori; if (!g || !g.units.some((q) => q.alive)) return null; const c = g.center(); return { x: c.x, z: c.z }; }, '毛利の先手', { red: true, h: 3 });   // 相手は頭上の赤い印（真田ではなく毛利）
    tennojiguchi.install(rt, { F, sq, FRONT, SHITENNO, HONDA, TOYO });
    F.mori.defMult = 1.7; F.mori.dmgMult = 1.1;   // 勢いのある塊。先手に当たってすぐ溶けず、押し込んで中央を破る
    F.mori.noRout = true;   // 崩れて逃げず、斬り減らすまで押す（崩れで段がすぐ済んだ）
    // 11/8 kaito：敵は全員が一直線に家康の首を狙う。勝永を先頭に、まとまって本陣へ走り、道を塞ぐ先手・二陣・旗本と斬り合う
    this.charge(rt, F.mori, 12);
    hold(F.honda, FRONT.x, FRONT.z - 6); F.honda.aggro = 22;
    hold(F.mine, FRONT.x + 10, FRONT.z - 2); F.mine.aggro = 22;
    rt.say('使番', '毛利の手が、物見に出た本多の先手へ鉄砲を撃ちかけた！', 3.2);
    rt.after(3.6, () => rt.say('毛利勝永', '狙うは本多の先手じゃ。一息に突き崩せ！', 3.4));
    // 使番の報告がだんだん悪くなる（k15_crisis_spec 5）
    rt.after(22, () => { if (F.step === 1 && !F.ending) rt.say('使番', '前衛、押されております！', 2.8); });
    rt.after(46, () => { if (F.step === 1 && !F.ending) rt.say('使番', F.honda && sum([F.honda]) < (F.hondaN0 || 99) * 0.6 ? '毛利勢、止まりませぬ！　第一陣、破られました！' : '毛利勢、止まりませぬ！', 3); });
  },
  // 本多忠朝の討死と、勝永の本隊（勝永は馬上で後ろに付く。討てない）
  tadatomo(rt) {
    const F = rt.flags;
    if (F.tadaDone) return;
    F.tq?.fall();
    F.tadaDone = true;
    const u = F.honda?.units.find((q) => q.name === '本多忠朝' && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u, null); }
    rt.banner('本多忠朝、討死', '小笠原秀政も深手。先手が崩れる');
    rt.say('本多の侍', '殿が……出雲守様が討たれた！', 3.2);
    if (alive(F.honda)) F.honda.morale = Math.min(F.honda.morale, 45);
    // 小笠原秀政は深手を負って戦場を去る（のちに死ぬ。史実）。討ち取らせず、南へ退かせる
    const og = F.honda?.units.find((q) => q.name === '小笠原秀政' && q.alive);
    if (og) { og.moraleFleeDir = { x: 0.2, z: 1 }; og.fleeing = true; og.fleeT = rt.army.time; og.target = null; og.atk = null; og.swing = null; }
    F.katsu = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利勝永の本隊', anchor: { x: SHITENNO.x - 6, z: SHITENNO.z }, facing: 0, width: 10, aggro: 22, seekRange: 50, order: 'attack', morale: 95, noRout: true },
      fit(rt, [sq(TOYO, 'cavalry', 4), sq(TOYO, 'samurai', 10), sq(TOYO, 'ashigaru', 12), sq(TOYO, 'gun', 5)]));
    // 毛利に付いた木村宗明の備（木村重成の残兵）が四天王寺の西から小笠原の横を突く（史実）
    F.kimura = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '木村宗明の備', anchor: { x: SHITENNO.x - 22, z: SHITENNO.z + 10 }, facing: 0, width: 8, aggro: 22, seekRange: 40, order: 'attack', morale: 95, formation: 'yari' },
      fit(rt, [sq(TOYO, 'busho', 1, { name: '木村宗明', invuln: true, horse: false }), sq(TOYO, 'samurai', 3), sq(TOYO, 'ashigaru', 10), sq(TOYO, 'gun', 3)]));
    selfGuard(F.katsu, F.kimura);
    F.s1.push(F.katsu, F.kimura); F.n1 += F.katsu.count - 1 + F.kimura.count - 1;
    rt.after(3.6, () => rt.say('毛利勝永', '本多は崩れた。続けて押せ！', 3));
    rt.after(7.4, () => rt.say('使番', '木村の手が西から小笠原様の横を突いた！', 3.2));
    rt.after(11.2, () => rt.say('使番', '小笠原様父子、横を突かれた！　若殿は討死、殿は深手を負うて退かれる', 3.4));
    // 毛利の手は厚い（味方の先手だけで斬り減らして段がすぐ済んだ）。主人公の槍が要る
    for (const g of [F.mori, F.katsu, F.kimura]) if (g) { g.noRout = true; g.defMult = 1.4; }
    for (const g of [F.katsu, F.kimura]) this.charge(rt, g, 12);   // 本隊も木村の備も家康の本陣を目がける（足軽一人を追い回さない）
    // 崩れた本多の先手は斬る力が落ちる（味方だけで毛利を斬り減らし、主人公の槍が要らなかった）
    if (F.honda) F.honda.dmgMult = 0.55;
    // 毛利の手はおよそ六千五百。四天王寺の北から二の手が続けて寄せる（本物の兵の枠の内で）
    const wave2 = () => {
      if (F.step !== 1 || F.ending) return;
      if (sum(F.s1) > F.n1 * 0.6 || realN(rt) > 240) { rt.after(5, wave2); return; }   // 先の手が減ってから（重ねると先手の持ち場が百人に囲まれた）
      F.mori2 = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利の二の手', anchor: { x: SHITENNO.x + 10, z: SHITENNO.z - 6 }, facing: 0, width: 10, aggro: 22, seekRange: 46, order: 'attack', morale: 100, noRout: true, formation: 'yari' },
        [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 13), sq(TOYO, 'gun', 6)]);
      F.mori2.defMult = 1.6; this.charge(rt, F.mori2, 12);
      F.s1.push(F.mori2); F.n1 += F.mori2.count; this.allyWave(rt);
      rt.say('使番', '四天王寺の北から毛利の二の手！　まだ来るぞ！', 3);
    };
    rt.after(40, wave2);
    // 後藤又兵衛の残兵（前の日の道明寺の生き残り）が毛利に付いて西から寄せる（史実：毛利の手は木村・後藤の残兵を合わせた）
    const wave3 = () => {
      if (F.step !== 1 || F.ending) return;
      if (!F.mori2 || sum(F.s1) > F.n1 * 0.55 || realN(rt) > 242) { rt.after(5, wave3); return; }
      F.goto = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '後藤の残兵', anchor: { x: SHITENNO.x - 26, z: SHITENNO.z + 4 }, facing: 0, width: 8, aggro: 22, seekRange: 46, order: 'attack', morale: 100, noRout: true },
        [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 10), sq(TOYO, 'gun', 2)]);
      F.goto.defMult = 1.4; this.charge(rt, F.goto, 12);
      F.s1.push(F.goto); F.n1 += F.goto.count; this.allyWave(rt);
      rt.say('使番', '西から後藤又兵衛の残兵！　道明寺の生き残りじゃ！', 3);
    };
    rt.after(80, wave3);
  },
  // ② 先手が崩れ、茶臼山の真田が家康の本陣を目がけて走る（主人公は本陣の前へ）
  stage2(rt) {
    const F = rt.flags;
    F.step = 2; F.tS = rt.t;
    rt.award((t) => t.side.push('毛利勝永の先手を食い止めた'), '毛利勝永の先手を食い止めた');
    rt.unmark('k15'); rt.unmark('moriMark');
    flee([F.kimura, F.mori2, F.goto, F.okaNew].filter(Boolean));
    // 越前勢は真田の陣の横を抜けて城（北）へ進み、入れ違いに真田が本陣へ走る（史実）。茶臼山の西を通り、真田の寄せ道を空ける
    if (alive(F.echizen)) { F.echizen.stay = true; F.echizen.aggro = 3; F.echizen.seekRange = 4; F.echizen.defMult = 2; march(F.echizen, [{ x: CHAUSU.x - 30, z: CHAUSU.z + 30 }, { x: CHAUSU.x - 26, z: CHAUSU.z - 26 }]); }
    // 勝永の手は本多を破った勢いのまま、四天王寺の道を真っすぐ家康の本陣へ寄せる（真田と二筋で）。崩れた本多の先手は本陣の後ろへ退く
    for (const g of [F.mori, F.katsu]) if (alive(g)) { g.noRout = true; g.morale = 100; g.routed = false; }
    // 道を本陣の前まで走り（move）、着いたら家康の居所へ寄せる（hold のままでは四天王寺の前に留まった）
    // 11/13 クラウドわ K002：流しで、道の途中の斬り合いに兵が残って隊が 35m に散り、着いた合図（六割が持ち場）が来ず本陣の 50m 手前で止まった。
    //   走る間は目の前の者とだけ組み（aggro を絞る）、三割が持ち場（6m の内）へ着けば塊のまま家康の居所へ寄せる（hold へ早く替えると四天王寺の前で止まった）
    for (const g of [F.mori, F.katsu]) if (alive(g)) {
      g.order = 'move'; g.stay = true; g._apCharge = false; g.allOutRun = true; g.aggro = 5; g.seekRange = 8; g.arriveCount = Math.max(2, Math.ceil(g.count * 0.3)); g.arriveRadius = 6;
      g.dest = { x: HONF.x + 6, z: HONF.z - 10 }; g.onArrive = (q) => { q.onArrive = null; this.charge(rt, q, 6); };
      // 鉄砲足軽は四天王寺の前に残って越前勢・本多へ撃ち続け、隊が 40m に散った（流し）。撃ち尽くした体で刀を抜き、隊と一緒に駆ける
      for (const u of g.units) if (u.alive && u.type === 'gun' && !u.sidearm) { u.gunAmmo = 0; u.target = null; u.atk = null; }
    }
    // 11/13 クラウドわ K002「先手が一気に中央突破し本陣へ」：流しで毛利の手は二陣（榊原・崩れない）の前で 100 秒以上止まり、本陣の 50m 手前で散った。
    //   二陣は一度ぶつかった後、押し割られて東へ退き（後の段でまた使うので崩しはしない）、毛利の手が塊のまま本陣の前へ抜ける
    rt.after(16, () => {
      if (F.step !== 2 || F.ending || !alive(F.nijin) || ![F.mori, F.katsu].some(alive)) return;
      F.nijin.stay = true; F.nijin._apCharge = false; hold(F.nijin, NIJIN.x + 22, NIJIN.z + 16); F.nijin.aggro = 4; F.nijin.seekRange = 6;
      rt.after(14, () => { if (alive(F.nijin) && F.step >= 2) { F.nijin.aggro = 22; F.nijin.seekRange = 28; } });
      rt.say('使番', '二陣、押し割られました！　毛利勢が本陣へ抜けまする！', 3.2);
    });
    if (alive(F.honda)) { F.honda.noRout = false; F.honda.order = 'move'; F.honda.dest = { x: HON.x + 14, z: HON.z + 30 }; F.honda.onArrive = (q) => flee([q]); }
    // 手勢は斬り合いを切り上げて本陣の前へ走る（stay：一緒に突っ込む ally_charge に引かれて毛利の手と組み合ったまま残らない）
    if (alive(F.mine)) { F.mine.stay = true; F.mine._apCharge = false; hold(F.mine, HONF.x + 4, HONF.z - 4); F.mine.aggro = 12; }
    hold(F.hata2, HONF.x - 8, HONF.z + 2);
    rt.obj('main', '第二線まで退き、本陣の前で赤備えを止める', 'main');   // 11/13 K034「脇を固める」：家康の本陣の脇（左右）に付いて受ける
    rt.banner('真田と毛利の突撃', '茶臼山の赤備えと毛利の手が本陣へ');
    rt.say('使番', alive(F.nijin) && F.nijin.count >= 9 ? '本多の先手が崩れました！　二陣が支えております！' : '第二陣も崩れました！　中央が破られました！', 3);   // 11/9 kaito 四4：起きている事だけを言う
    rt.after(3.2, () => rt.say('使番', '毛利勢、大御所の本陣へ向かっております！　本陣の前へ戻れ！', 3.4));
    rt.after(7, () => rt.say('使番', '真田左衛門佐、動きました！', 2.8));
    rt.after(10, () => rt.say('真田信繁', '狙うは家康の首、ただ一つ！　者ども、続け！', 3.4));
    rt.after(8, () => rt.say('使番', '越前勢は城へ向かい、真田と入れ違った！　赤備えが本陣へ来るぞ！', 3.4));
    // 真田の流した偽りの噂（史実）
    rt.after(12, () => rt.say('旗本', '浅野但馬守殿が寝返ったと！？　後ろを突かれるぞ！', 3.2));
    rt.after(15.6, () => rt.say('本多正純', '偽りの噂じゃ！　浅野は寝返っておらぬ。持ち場を離れるな！', 3.4));
    rt.after(5, () => { this.charge(rt, F.sanada, 6); this.charge(rt, F.nobu, 4); rt.army.play?.('toki', { x: CHAUSU.x, z: CHAUSU.z }, 1.5); });
    // 11/12 kaito 遊び5-27「騎馬の軍勢が少ない。一気にもっと押し寄せさせる」：本物の兵は上限（250）の内なので、本陣へ向かう寄せ道の西に
    // 軽い作り（addClash）の赤備えの騎馬の大軍と、それを受ける旗本の列を足す。遊ぶ道（ROADS[2]）から外し、主人公が遠のいたら片付ける
    rt.after(7, () => {
      const W = rt.world; if (!W.addClash || F.k15cav) return;
      const touch = isTouch;
      try {
        const C = F.k15cav = W.addClash({ rt, play: (k, p, v) => rt.army.play?.(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke?.(x, y, z, fx, fz),
          x: HONF.x - 34, z: HONF.z - 18, facing: 0, w: 30, gap0: 14, seed: 1527, noRout: true, noWake: true,
          A: { flag: 'sanada', armor: 0x8e1f16, count: touch ? 90 : 200 }, B: { flag: 'tokugawa', armor: 0x1f1e1c, count: touch ? 110 : 260 } });
        rt.after(1, () => C.go());
        rt.after(3, () => C.cavalry?.('A', { from: 1, count: touch ? 24 : 48, flag: 'sanada', armor: 0x8e1f16 }));
        rt.after(5, () => { C.push('A', 0.9); C.shake('B', 30); rt.army.play?.('hooves', { x: HONF.x - 30, z: HONF.z - 18 }, 1.4); });
        rt.after(12, () => C.cavalry?.('A', { from: 1, count: touch ? 16 : 36, flag: 'sanada', armor: 0x8e1f16 }));
        const tidy = () => { if (!C.mesh) return; const p = rt.player?.u?.pos; if (F.step === 2 || (p && Math.hypot(p.x - C.x, p.z - C.z) < 70)) { rt.after(6, tidy); return; } C.mesh.visible = false; };
        rt.after(70, tidy);
      } catch (e) { console.warn('k15 騎馬の大軍', e); }
    });
    F.s2 = [F.sanada, F.mori, F.katsu].filter(alive); F.n2 = sum(F.s2);
    if (F.otaniU?.alive) { revealName(rt, NAMES.otani); rt.after(20, () => { if (F.step === 2 && F.otaniU?.alive) rt.say(NAMES.otani, '父刑部の名にかけて、ここは通さぬ！', 3.2); }); }
    rt.marker('k15', DEST[2](), DEST[2]().label);
    installEchizen(rt, { CHAUSU, HON, back: DEST[2]() });   // 真田が越前勢を突き抜ける見せ場と伝令の手柄（k15/echizen.js）
  },
  // 真田の兵は主人公ではなく家康のいる所を目がける（近い者とだけ斬り合う）
  charge(rt, g, aggro, to) {
    const F = rt.flags;
    if (!alive(g)) return;
    const at = to || (F.ieyasu?.alive ? F.ieyasu.pos : HON);
    // 'attack' は逃げる兵を追って横へ逸れる（11/3 の流しで真田の二番手が東へ流れた）。持ち場を家康の居所に置き、走って寄せ、近い者とだけ斬り合う
    // stay：持ち場（家康の居所）から逸れて主人公や逃げる兵を追わない（ally_charge・army_think）。目の前を塞ぐ者とだけ斬り合う
    g._chA = aggro; g.allOutRun = true; g.order = 'hold'; g._charge = true; g.stay = true; g._apCharge = false; g.dest = null; g.path = null; g.focus = null; g.anchor = { x: at.x, z: at.z }; g.aggro = aggro; g.seekRange = aggro + 4; g.morale = 100; g.routed = false;
  },
  // ③ 二の突撃：金扇の馬印が倒れ、家康は南へ退く。主人公は倒れた馬印のもとで支える
  stage3(rt) {
    const F = rt.flags;
    F.step = 3; F.tS = rt.t;
    rt.award((t) => t.side.push('真田と毛利の突撃を止めた'), '真田と毛利の突撃を止めた');
    rt.unmark('k15');
    flee([F.sanada, F.mori, ...(F.newE || [])]);
    // 毛利勝永は崩れず、手をまとめて城の方へ退く（史実）
    flee([F.katsu]);
    // 茶臼山から真田の二番手（先手の残りと新手。重さのため、先の赤備えが退いてから出す）
    F.sanada2 = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の二番手', anchor: { x: CHAUSU.x + 4, z: CHAUSU.z + 16 }, facing: 0.6, width: 12, aggro: 6, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'cavalry', 10), sq(SANADA, 'samurai', 5), sq(SANADA, 'ashigaru', 13), sq(SANADA, 'gun', 3)]);
    F.sanada2.noFrontline = true; F.sanada2.defMult = 1.3;   // 二の突撃は騎馬を先に立てて厚く（すぐ済んだ）
    this.charge(rt, F.sanada2, 6); this.charge(rt, F.nobu, 6);
    F.s3 = [F.sanada2]; F.n3 = F.sanada2.count;
    // 二の突撃は波で来る：五十秒後に茶臼山から赤備えの新手（真田信昌・信倍ら一族の手）。本物の兵の枠の内で
    const w3 = () => {
      if (F.step !== 3 || F.ending) return;
      if (realN(rt) > 238) { rt.after(6, w3); return; }
      F.sanada3 = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の新手', anchor: { x: CHAUSU.x + 6, z: CHAUSU.z + 18 }, facing: 0.6, width: 10, aggro: 6, order: 'hold', morale: 100, noRout: true },
        [sq(SANADA, 'cavalry', 6), sq(SANADA, 'samurai', 4), sq(SANADA, 'ashigaru', 10)]);
      F.sanada3.noFrontline = true; F.sanada3.defMult = 1.3;
      this.charge(rt, F.sanada3, 6);
      F.s3.push(F.sanada3); F.n3 += F.sanada3.count; (F.newE ||= []).push(F.sanada3);
      rt.say('使番', '茶臼山から赤備えの新手！　二の突撃はまだ終わらぬ！', 3);
      F.w3N = (F.w3N || 0) + 1; this.allyWave(rt); if (F.w3N < 2) rt.after(70, w3);   // 新手は二度（11/8 陣ごとに新手が来る）
    };
    rt.after(50, w3);
    F.umaDown = true; F.umaT = 0;
    F.umaSt = installUma(rt, { hon: F.hon, hata2: F.hata2 });   // 馬印が倒れ、旗本が逃げ散る。起こすと立て直す（k15/umajirushi.js）
    rt.obj('main', '倒れた馬印のもとで真田の二の突撃を止める', 'main');
    rt.banner('大御所の馬印が倒れた', '本陣が乱れる');
    rt.say('使番', '上様！　ここは危のうございます！', 2.6);
    rt.after(2.8, () => rt.say('本多正純', '大御所様、お退きくだされ！', 3));
    rt.after(3.4, () => rt.say('徳川家康', '退かぬ……いや、ここは退く。旗本、支えよ！', 3.4));
    rt.after(7.2, () => rt.say(nm(rt), '本陣を空けるな！　馬印を起こせ！', 3));
    if (F.ieyasu) { F.ieyasu._crouch = false; if (!F.ieyasu.mounted && F.ieyasu.horse && rt.army.setMounted) { try { rt.army.setMounted(F.ieyasu, true); } catch (e) { /* そのまま */ } } }   // 家康が馬に乗り、旗本に囲まれて退く
    hold(F.hon, HON2.x, HON2.z);
    hold(F.mine, HON.x - 4, HON.z - 6); hold(F.hata2, HON.x - 12, HON.z);
    // 本陣の崩れを知った越前勢が城の手前から引き返し、真田の後ろへ迫る
    // 真田の寄せ道（茶臼山→本陣）の西を下り、道の横で構える（道を塞いで二番手と組み合ったまま残らない）
    if (alive(F.echizen)) { F.echizen.aggro = 3; march(F.echizen, [{ x: CHAUSU.x - 30, z: CHAUSU.z + 30 }, { x: -128, z: 64 }]); }
    rt.after(10, () => rt.say('使番', '越前勢が城の手前から引き返して来る！', 3));
    // 旗奉行が馬印を倒し、旗本には三里も逃げた者がいた（三方ヶ原の後で初めて馬印が倒れた。史実）
    rt.after(13.4, () => rt.say('旗奉行', '馬印を倒してしもうた……大御所様のお姿が見えぬ！', 3.2));
    rt.after(17, () => rt.say('本多正純', '逃げた旗本は三里も先じゃ。残る者で支えよ！', 3.2));
    rt.marker('k15', DEST[3](rt), DEST[3](rt).label, { h: 3 });
  },
  // ④ 三の突撃：松平忠直の越前勢が横から突く。真田信繁の旗本を討つ
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.tS = rt.t;
    rt.award((t) => t.side.push('馬印のもとで本陣を支えた'), '馬印が倒れても本陣を支えた');
    rt.unmark('k15');
    flee([F.sanada2, F.sanada3, ...(F.newE || [])].filter(Boolean));
    if (F.umaUp !== true) { F.umaUp = true; }
    if (F.nobuU) F.nobuU.invuln = true;
    this.charge(rt, F.nobu, 10, HONF);   // 三の突撃は本陣の前（④の行き先）でぶつかる
    // 引き返した越前勢が真田の横へ掛かる（見えない所から湧かせない）
    if (alive(F.echizen)) { F.echizen.order = 'attack'; F.echizen.aggro = 26; F.echizen.seekRange = 50; F.echizen.dmgMult = 0.7; F.echizen.anchor = { x: HONF.x - 14, z: HONF.z - 6 }; }   // 持ち場は信繁の旗本の居所を追う（update）
    hold(F.mine, HONF.x, HONF.z); F.mine.aggro = 22;
    // 茶臼山に残した真田の馬廻が信繁のもとへ駆け付ける（一と二の突撃で旗本が減っていても、信繁は馬廻に守られる）
    F.nobu2 = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の馬廻', anchor: { x: CHAUSU.x + 2, z: CHAUSU.z + 12 }, facing: 0.6, width: 8, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'cavalry', 8), sq(SANADA, 'samurai', 8)]);
    F.nobu2.noFrontline = true; F.nobu2.defMult = 1.3; if (F.nobu) F.nobu.defMult = 1.3;   // 信繁の旗本は必死に守る
    this.charge(rt, F.nobu2, 10, HONF);
    // 一と二の突撃で信繁の旗本が減っていても、三の突撃の守りは厚い（守りが一人で、三の突撃がすぐ済んだ）。足りない分を馬廻に足す
    { const want = 30 - this.guards(rt) - F.nobu2.count; if (want > 4 && realN(rt) < 236) { const add = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の旗本衆', anchor: { x: CHAUSU.x + 6, z: CHAUSU.z + 8 }, facing: 0.6, width: 8, order: 'hold', morale: 100, noRout: true }, [sq(SANADA, 'samurai', Math.min(14, want))]); add.noFrontline = true; add.defMult = 1.3; this.charge(rt, add, 10, HONF); F.nobu3 = add; } }
    F.s4 = [F.nobu, F.nobu2, F.nobu3].filter(Boolean); F.n4 = this.guards(rt);
    sanadaEnd.install(rt, { YASUI, sq, SANADA });
    rt.obj('main', '本陣の前で真田信繁の旗本を討つ', 'main');
    // 引き返した越前勢が赤備えの横を突く（軽い大軍。こんどは越前の側が押し、真田の側が崩れる）
    try {
      F.clEchi2 = clash(rt, { x: -96, z: 66, facing: Math.PI + 0.35, w: 30, gap0: 10, seed: 15074, bw: 5.2, gap: 2.4, host: false, noRout: true, noWake: true, killRate: 0.006, maxDrift: 2, corpses: 10, nearHide: 0,
        A: { flag: 'tokugawa', armor: TOKU.armor, count: isTouch ? 120 : 260, flagRate: 0.22 }, B: { flag: 'sanada', armor: SANADA.armor, count: isTouch ? 80 : 150, flagRate: 0.3 } });
      if (F.clEchi2) { F.clEchi2.go?.(); F.clEchi2.push?.('A', 1); rt.after(40, () => F.clEchi2?.rout?.('B', { from: 0, minFight: 8 })); }
    } catch (e) { /* 軽い大軍が作れなくても段は進む */ }
    rt.banner('真田の三の突撃', '越前勢が横から突く');
    rt.say('真田信繁', 'あと一息じゃ！　家康は目の前ぞ！', 3.2);
    rt.after(3.6, () => rt.say('松平忠直', '越前勢、真田の横へかかれ！　遅れを取り返せ！', 3.4));
    // 水野勝成が自ら一番槍で崩れた天王寺口を立て直す（史実。遊ぶ所の外の話として使番が知らせる）
    rt.after(7.6, () => rt.say('使番', '水野日向守殿が自ら一番槍！　崩れた天王寺口の諸隊が立て直した', 3.4));
    rt.marker('k15', DEST[4](), DEST[4]().label);
  },
  // 越前勢は相手の隊を追う：離れていれば走って寄り（move）、近ければ斬り合う（attack）。持ち場だけ移すと元の所に留まった
  chase(g, tg) {
    const c = centerOf(tg)(), e = centerOf(g)();
    g.stay = false; g.anchor = { x: c.x, z: c.z };
    if (!near(e, c, 14)) { g.order = 'move'; g.dest = { x: c.x, z: c.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; }; } else { g.order = 'attack'; g.dest = null; }
  },
  // 陣ごとの新手（11/8 kaito「長い戦で兵が死に、戦場が空っぽになる。陣ごとに兵がいて、新手が来る形に」）
  //   二陣・旗本の二の備が尽きかけたら、本陣の後ろ（南）から新手が駆け付けて同じ陣に入る。
  //   敵も、②の赤備えと毛利の手が半ばに減ったら、四天王寺の北から毛利の新手（家康を目がける）。本物の兵の枠（二百五十）の内で
  refill(rt) {
    const F = rt.flags;
    if (F.rfT > rt.t) return;
    F.rfT = rt.t + 4;
    const n = realN(rt);
    F.rfN ||= 0;
    // 11/13 司令塔 K075：敵の二陣（毛利の新手）は本人の前 35〜55m で横に並んで止まって待ち、前の斬り合いが薄くなった所へ一組ずつ出す（30〜60m に人の壁が残る）
    if (n < REAL_CAP - 18 && (F.step === 1 || F.step === 2)) {
      const me = rt.player?.u;
      if (me?.alive) {
        const R = F.rsv || (F.rsv = []);
        for (let i = R.length - 1; i >= 0; i--) if (!alive(R[i])) R.splice(i, 1);
        let foe30 = 0, foe70 = 0;
        for (const u of rt.army.units) if (u.alive && u.team !== me.team && !u.fleeing) { const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (d < 70) foe70++; if (d < 30) foe30++; }
        // 待つ備を本人の前 46m に置き直す（本人が動いても 35〜60m に居る）
        R.forEach((g, i) => { const c = centerOf(g)(), d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d > 60 || d < 32) hold(g, me.pos.x + (i - 1) * 24, me.pos.z - 46); });
        if (foe30 < 14 && R.length) { const g = R.shift(); g.stay = false; g.aggro = 14; g.seekRange = 26; this.charge(rt, g, 12); }
        else if (R.length < 3 && (F.rfE || 0) < 10 && foe70 < 60) {
          F.rfE = (F.rfE || 0) + 1;
          const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利の新手', anchor: { x: me.pos.x + (R.length - 1) * 24, z: me.pos.z - 46 }, facing: 0, width: 22, aggro: 3, seekRange: 5, order: 'hold', morale: 100, noRout: true },
            [sq(TOYO, 'samurai', isTouch ? 4 : 8), sq(TOYO, 'ashigaru', isTouch ? 14 : 28), sq(TOYO, 'gun', isTouch ? 3 : 6)]);   // 携帯は半分（実機で待つ備が増やした重さ）
          g.defMult = 1.2; g.stay = true; R.push(g);
          (F.newE ||= []).push(g); if (F.s2) { F.s2.push(g); F.n2 += g.count; } else if (F.s1) { F.s1.push(g); F.n1 += g.count; }
          return;
        }
      }
    }
    // 11/12 kaito「陣の厚み」（台帳 K001）：本人の五十m の内の味方が薄くなったら（150 秒の写真は十数人だった）、新手の備が本人の後ろから前へ重なって入る（本物の上限の内で）
    if (n < REAL_CAP - 14 && F.rfN < 26 && F.step >= 1 && F.step <= 5) {
      const me = rt.player?.u, tm = me?.team;
      if (me?.alive) {
        let near = 0; for (const u of rt.army.units) if (u.alive && u.team === tm && !u.isPlayer && Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 50) near++;
        if (near < 40) {
          const bx = me.pos.x + 4, bz = me.pos.z + 34, kt = { armor: HONDA.armor, flag: 'honda' };
          const ng = allyGroup(rt, { faction: 'tokugawa', name: '徳川の新手', anchor: { x: bx, z: bz }, facing: Math.PI, width: 14, aggro: 18, seekRange: 26, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
            [sq(kt, 'samurai', 4), sq(kt, 'ashigaru', 14), sq(kt, 'gun', 4)]);
          ng.defMult = 1.15; ng.dmgMult = 0.6;
          march(ng, [{ x: me.pos.x + 2, z: me.pos.z + 8 }]);
          F.rfN++; return;
        }
      }
    }
    // 11/12 kaito「陣が幾重にも重なる・時間がたつと小隊対小隊になる」（台帳 K001）：先手の備も崩れたら、二陣・旗本と同じく新手が後ろから入る（先手→二陣→旗本の三重を最後まで保つ）
    for (const [k, name, x, z, flag] of [['honda', '本多の新手', FRONT.x, FRONT.z + 6, 'honda'], ['nijin', '榊原の新手', NIJIN.x, NIJIN.z, 'sakakibara'], ['hata2', '旗本の新手', HON.x - 8, HON.z - 24, 'tokugawa']]) {
      if (n > REAL_CAP - 10 || F.rfN >= 20) break;
      const g = F[k];
      if (alive(g) && g.count >= 9) continue;
      const kt = k === 'honda' ? { armor: HONDA.armor, flag } : { armor: TOKU.armor, flag };
      const ng = allyGroup(rt, { faction: 'tokugawa', name, anchor: { x: HON.x + 18, z: HON.z + 38 }, facing: Math.PI, width: 10, aggro: 16, seekRange: 22, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
        [sq(kt, 'samurai', 3), sq(kt, 'ashigaru', 10), sq(kt, 'gun', 3)]);
      ng.defMult = 1.15; ng.dmgMult = 0.6;
      // 陣幕（x -48〜-32・z 130〜142）の東の脇を回る（幕の東の角をかすめる線で、榊原の新手が幕の後ろ (-34,143) に二十秒張り付いた・11/11 act bot）
      march(ng, [{ x: HON.x + 22, z: HON.z + 14 }, { x: HON.x + 22, z: HON.z - 6 }, { x, z }]);
      F[k] = ng; F.rfN++;
      if (F.rfN <= 3) rt.say('使番', k === 'honda' ? '先手へ新手が入る！　押し返せ！' : k === 'nijin' ? '二陣へ新手が入る！　陣を空けるな！' : '旗本の新手、本陣の前へ！', 2.8);
      return;
    }
    if (F.step === 2 && F.s2 && (F.e2N || 0) < 4 && sum(F.s2) <= F.n2 * 0.55 && n < 236) {
      F.e2N = (F.e2N || 0) + 1; this.allyWave(rt);
      const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利の新手', anchor: [{ x: SHITENNO.x, z: SHITENNO.z - 4 }, { x: 14, z: -6 }, { x: -86, z: -14 }][(F.e2N - 1) % 3]   /* 11/9 kaito「城の方から三方面」：北の道・北東・北西から順に */, facing: 0, width: 10, aggro: 12, seekRange: 20, order: 'hold', morale: 100, noRout: true, formation: 'yari' },
        [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 14), sq(TOYO, 'gun', 3)]);
      g.defMult = 1.3; this.charge(rt, g, 12);
      (F.newE ||= []).push(g); F.s2.push(g); F.n2 += g.count;
      rt.say('使番', ['四天王寺の北から毛利の新手！　本陣を目がけて来るぞ！', '北東から大野の手！　横から本陣へ！', '北西から明石の手！　三方から来るぞ！'][(F.e2N - 1) % 3], 3);
    }
    // ④の三の突撃も、信繁の守りが減ったら茶臼山から騎馬の新手が駆け付ける（二度まで）
    if (F.step === 4 && F.n4 && (F.e4N || 0) < 2 && rt.t - F.tS > 40 && this.guards(rt) <= F.n4 * 0.45 && n < 236) {
      F.e4N = (F.e4N || 0) + 1; this.allyWave(rt);
      const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の騎馬の新手', anchor: { x: CHAUSU.x + 6, z: CHAUSU.z + 14 }, facing: 0.6, width: 8, order: 'hold', morale: 100, noRout: true },
        [sq(SANADA, 'cavalry', 6), sq(SANADA, 'samurai', 6), sq(SANADA, 'ashigaru', 6)]);
      g.noFrontline = true; g.defMult = 1.3; this.charge(rt, g, 10, HONF);
      (F.nobuX ||= []).push(g); F.n4 += g.count;
      rt.say('使番', '茶臼山から真田の騎馬がまた来る！', 3);
    }
  },
  // 前線の厚み（台帳 K001 の①・11/13 クラウドわ）：携帯の見える野（百五十 m の内）は本物の兵しか描かない（軽い兵は禁止）のに、
  //   本物の二百五十の枠を遠くの持ち場に置いたままの味方（岡山口が済んだ後の将軍の旗本・前田・井伊）が食い、
  //   本人の六十 m の内の敵が零〜二人になっていた（描かずの計測・②の三百二十秒で敵の本物は四十二人、味方は百六十人）。
  //   →岡山口が済んだら、その脇の備の名の無い兵を遠景へ戻して枠を空け、本人の前の敵が薄い間は、敵の側（四天王寺・茶臼山）の
  //     七十 m 先から十二人の新手を家康を目がけて寄せる（本人の前を通る）。段の討ち取りの数には入れない。一戦に十まで
  thick(rt) {
    const F = rt.flags, O = F.oka;
    if (F.thT > rt.t) return;
    F.thT = rt.t + 5;
    if (O?.done && !F.thRec) { F.thRec = true; markRecyclable(O.hon, O.maeda, O.ii); }
    // 11/13 クラウドわ（台帳 K013「戦場が空にならない」）：②の後半に敵の本物が五十人まで減り、本人の前が空いた（描かずの流し）→ 一戦に十四まで
    if ((F.thN || 0) >= 14 || F.step === 'oka' || F.step === 0.7) return;
    const P = rt.player.u.pos;
    let eN = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 60) eN++;
    if (eN >= 26) return;   // 18 だと②で本人の六十 m の内が十八〜二十四人の間ずっと足さず、敵の本物が三十人まで減った（K013・11/13 クラウドわ）
    // 本人が持ち場（段の行き先）から遠い間は足さない（後ろで休む・馬を取りに行く間に新手が湧かない）
    const d = DEST[F.step]?.(rt);
    // 持ち場の脇で斬り合う間も足す（45m だと本陣の前の脇の斬り合いで②の二分間一度も足さず、本人の八十 m の内の敵が十人を切った・K013）。後ろで休む間（七十 m の外）は足さない
    if (!d || !near(P, d, 70)) return;
    const N = 12;
    if (realN(rt) + N > 240) {
      // 本物の枠を、本人から百十 m より遠い味方の備（越前勢・岡山口の残りなど）が食い、敵の本物が三十人まで減っても足せなかった（K013・11/13 クラウドわ）
      //   →遠い味方の名の無い兵を遠景へ戻せる印を付けてから枠を空ける（名のある将・本人の手勢は残る）
      for (const g of rt.army.groups) if (g.team === 0 && !g.recyclable && g !== F.mine && alive(g)) { const c = centerOf(g)(); if (Math.hypot(c.x - P.x, c.z - P.z) > 110) markRecyclable(g); }
      freeRoom(rt, realN(rt) + N - 240);
    }
    if (realN(rt) + N > 244) return;
    const src = F.step === 1 ? SHITENNO : CHAUSU, dx = src.x - P.x, dz = src.z - P.z, L = Math.hypot(dx, dz) || 1, k = Math.min(1, 70 / L);
    const x = Math.max(-160, Math.min(160, P.x + dx * k)), z = Math.max(-160, Math.min(160, P.z + dz * k));
    const side = F.step === 1 ? TOYO : SANADA;
    const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: F.step === 1 ? '毛利の後備' : '真田の後備', anchor: { x, z }, facing: Math.atan2(-dx, -dz), width: 8, aggro: 12, order: 'hold', morale: 100, noRout: true, formation: 'yari' },
      [sq(side, 'samurai', 3), sq(side, 'ashigaru', 7), sq(side, 'gun', 2)]);
    g.defMult = 1.1; this.charge(rt, g, 12);
    g._thStep = F.step; (F.thG ||= []).push(g);
    (F.newE ||= []).push(g); F.thN = (F.thN || 0) + 1;
  },
  // 11/9 kaito 二回目：敵の大将が突っ立つ・回るだけにしない／味方も大将に掛かる／旗本の鉄砲が真田の騎馬を撃つ／本陣が襲われたら他の陣が助けに来る
  pressure(rt, dt) {
    const F = rt.flags, I = F.ieyasu;
    // 勝永と信繁は隊の先頭へ出て、家康の方へ駆ける（後ろで馬に乗ったまま止まらない）。序盤は討てないが、味方は斬り掛かれる（命は六割より下がらない）
    F.katsuU ||= F.mori?.units.find((u) => u.name === NAMES.katsunaga);
    for (const [L, g] of [[F.katsuU, F.mori], [F.step >= 2 ? F.nobuU : null, F.nobu]]) {
      if (!L || !L.alive || !g || g.routed) continue;
      // 周りの隊が三割を切ったら、大将の命の底上げも外す（一人だけ残らない。kaito 遊び5-24）
      const left = g.units.filter((q) => q.alive && !q.fleeing).length, lone = left <= Math.max(3, (g._n0 || (g._n0 = g.units.length)) * 0.3);
      if (L === F.nobuU && lone && F.step < 4 && !F.nbRet) { F.nbRet = true; g.order = 'move'; g.dest = { x: CHAUSU.x, z: CHAUSU.z }; g.anchor = { ...g.dest }; rt.say('真田信繁', '兵が尽きた。一度退け！', 2.6); }   // 遊び5-24：周りが三割を切ったら信繁も一度茶臼山へ引く（一人だけ暴れ残らない）
      if (L !== F.nobuU) { L.invuln = false; if (!lone) L.hp = Math.max(L.hp, (L.maxHp || 190) * 0.6); }
      // 真田の隊が崩れたら、信繁は一人で立ち続けず、残る旗本とともに安居の天神へ退く（史実の最期の地。kaito 遊び5-24）
      if (L === F.nobuU && lone && !F.nobuRetreat && F.step >= 2 && F.step <= 4) {
        F.nobuRetreat = true;
        g.order = 'move'; g.stay = true; g._charge = false; g.allOutRun = true; g.dest = { x: YASUI.x, z: YASUI.z }; g.path = null; g.focus = null;
        rt.say('真田信繁', '運の末か。安居の天神へ退く。続け！', 3.2);
      }   // 信繁は安居の天神まで討たれない（ここで討たれると④の途中で終幕へ飛んだ・11/9 通し）
      // 11/12 kaito 遊び5-21：勝永が前線の手前（隊の後ろ）で突っ立っていた。突撃の間だけでなく、構え（hold）・本陣へ走る間（move）も隊の先頭に立つ
      const lead = L === F.katsuU && (g.order === 'hold' || g.order === 'move');
      if (!I || !I.alive || !(g.order === 'hold' && g._charge || lead)) continue;
      let cx = 0, cz = 0, k = 0; for (const u of g.units) if (u !== L && u.alive && !u.fleeing) { cx += u.pos.x; cz += u.pos.z; k++; }
      if (!k) continue; cx /= k; cz /= k;
      const aim = g.order === 'move' && g.dest ? g.dest : I.pos;
      const dx = aim.x - cx, dz = aim.z - cz, dl = Math.hypot(dx, dz) || 1, tx = cx + dx / dl * 3, tz = cz + dz / dl * 3;
      const ex = tx - L.pos.x, ez = tz - L.pos.z, ed = Math.hypot(ex, ez);
      if (ed > 2.5 && !(L.target && L.target.alive && Math.hypot(L.target.pos.x - L.pos.x, L.target.pos.z - L.pos.z) < 3)) { const st = Math.min(ed, 4 * dt); L.pos.x += ex / ed * st; L.pos.z += ez / ed * st; if (rt.world.heightAt) L.pos.y = rt.world.heightAt(L.pos.x, L.pos.z); }
    }
    // 遊び5-25：本人へ向き直った敵は六秒まで本人を狙い続ける（共通のとどめ・寄せ・加勢の決まりが一秒の内に味方の足軽へ戻していた・印で 80 回/10 秒）
    if (F.pL?.length) { const P = rt.player.u; F.pL = F.pL.filter((e) => { const u = e.u; if (!u.alive || u.fleeing || !P.alive || P.noTarget || rt.t > e.until || Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 5.5) return false; if (u.target !== P && !u.atk && !u.swing) u.target = P; return true; }); }
    if (!I || !I.alive || F.pT > rt.t) return;
    F.pT = rt.t + 1;
    // kaito 11/11 遊び5-23・25：兵は目の前の本人と有名な武将に掛かる（家康へ走るだけで、そばの本人を見逃さない）
    {
      const P = rt.player.u, gens = [F.katsuU, F.nobuU].filter((q) => q && q.alive && !q.fleeing);
      // 11/12 遊び5-25：家康へ寄せる真田・毛利の兵（突撃の hold・stay）は、すでに相手がいると本人が二m 横に立っても見向きもしなかった（act bot の段2で、本人の七m 内の敵五人のうち本人を狙う者0）
      //   → 本人が三・二m の内（手の届く所）か、今の相手より一m 以上近く五m の内なら本人へ向き直る（本人へ掛かるのは四人まで・六秒は狙いを保つ。一度の傷の上限は上の三割の決まりのまま）
      F.pL ||= []; let onP = F.pL.length;
      for (const u of rt.army.units) {
        // 使番（noTarget・civ）は命を運ぶだけ。将へ掛からせると、将が討たれた後も倒れた将を狙い続けていた（act bot 681秒・1125回）
        if (!u.alive || u.fleeing || u.isPlayer || u.type === 'gun' || u.isCourier || u.civ) continue;
        if (u.target?.alive) {
          if (u.team !== 1 || u.target === P || onP >= 4 || F.pL.some((e) => e.u === u) || !P.alive || P.noTarget || u === F.nobuU || u.target.isStruct) continue;
          const dp = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
          if (dp > 5 || dp > 3.2 && dp > Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) - 1 || Math.abs(P.pos.y - u.pos.y) > 2 || rt.army.wallBetween(u.pos, u.team, P.pos)) continue;
          u.target = P; u.watch = null; u.moveTo = null; onP++; F.pL.push({ u, until: rt.t + 6 }); continue;
        }
        let t = null;
        if (u.team === 1 && P.alive && !P.noTarget && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 9) t = P;
        else if (u.team === 0) { for (const q of gens) if (Math.hypot(u.pos.x - q.pos.x, u.pos.z - q.pos.z) < 12) { t = q; break; } }
        if (t && Math.abs(t.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, u.team, t.pos)) u.target = t;
      }
      // 11/12 遊び5-22：敵の騎馬は目の前の足軽に目もくれず本陣へ突っ込んでいた→本陣へ駆ける道の前（家康の側）三m 内に徳川の兵がいれば、まずそれに掛かる
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.team !== 1 || !u.mounted || u.name || F.pL.some((e) => e.u === u)) continue;
        const tg = u.target, dI = Math.hypot(I.pos.x - u.pos.x, I.pos.z - u.pos.z);
        if (tg?.alive && tg !== I && Math.hypot(tg.pos.x - u.pos.x, tg.pos.z - u.pos.z) < 4) continue;
        if (dI < 3) continue;
        let best = null, bd = 3;
        for (const q of rt.army.units) {
          if (!q.alive || q.team !== 0 || q.isPlayer || q.fleeing || q.noTarget || q === I) continue;
          const dx = q.pos.x - u.pos.x, dz = q.pos.z - u.pos.z, d = Math.hypot(dx, dz);
          if (d >= bd || (dx * (I.pos.x - u.pos.x) + dz * (I.pos.z - u.pos.z)) < 0 || Math.abs(q.pos.y - u.pos.y) > 2) continue;
          best = q; bd = d;
        }
        if (best) { u.target = best; u.moveTo = null; }
      }
    }
    // 旗本の鉄砲の一斉射撃：本陣へ駆けて来る敵の騎馬を、近い者から二騎ずつ落とす（七秒ごと）
    const guns = (F.hon?.units || []).filter((u) => u.alive && u.type === 'gun' && !u.fleeing);
    if (guns.length && F.step >= 2 && !(F.volT > rt.t)) {
      const rid = rt.army.units.filter((u) => u.alive && u.team === 1 && u.mounted && !u.name && !u.fleeing && Math.hypot(u.pos.x - I.pos.x, u.pos.z - I.pos.z) < 34)
        .sort((a, b) => Math.hypot(a.pos.x - I.pos.x, a.pos.z - I.pos.z) - Math.hypot(b.pos.x - I.pos.x, b.pos.z - I.pos.z));
      if (rid.length) {
        F.volT = rt.t + 7; F.volN = (F.volN || 0) + 1;
        if (!F.volSaid) { F.volSaid = true; rt.say('鉄砲頭', '騎馬が来るぞ。鉄砲、放て！', 2.6); }
        sfx('volley', 0.9); rt.volN = F.volN;   // 確かめ用の数（K019）
        for (const u of rid.slice(0, 2)) rt.army.kill(u, guns[0]);
        F.volKill = (F.volKill || 0) + Math.min(2, rid.length);
      }
    }
    // 本陣が襲われたら、二陣・旗本の二の備・残った先手が助けに走る（本陣の後ろでくすぶらない）
    let near = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && Math.hypot(u.pos.x - I.pos.x, u.pos.z - I.pos.z) < 22) near++;
    if (near >= 3) {   // 11/9 kaito 四5：本陣が襲われているのに後ろで兵が突っ立っていた（六人まで待った）
      if (alive(F.hon)) { F.hon.aggro = 24; F.hon.seekRange = 28; }
      // 寄る先が陣幕（x -48〜-32・z 130〜142）の内に入ると、幕に当たって七人が一点に重なり動かなかった（11/11 act bot・榊原の新手 (-44,133)）→ 幕の前（北）へ出す
      // 幕の内に居る隊を南（幕の前）の持ち場へ向けると、閉じた前の幕に十五人が押し合って止まった（11/13 act bot・榊原の新手 (-47,131)・重なり24組）
      //   → 幕の内に居る隊は、まず後ろ（北）の口から出て西の脇を回ってから持ち場へ
      [F.nijin, F.hata2, F.honda].forEach((g, i) => {
        if (!alive(g) || g === F.mine) return;
        g._apCharge = false; let hx = I.pos.x + (i - 1) * 8, hz = I.pos.z - 8;
        if (hx > -62 && hx < -29 && hz > 117 && hz < 145) hz = 118;   // 11/13 クラウドれ：隊の幅(10)と深さが幕の北の縁にかかり、榊原の新手13人が (-47,132) で重なった→幕から余裕を取る
        const c = centerOf(g)();
        if (c.x > -52 && c.x < -28 && c.z > 124 && c.z < 144 && hz < 129) {
          if (!g._outMaku) {
            g._outMaku = true; g.stay = false; g.order = 'move'; g.dest = { x: -58, z: c.z }; g.anchor = { ...g.dest };   // 11/13 クラウドこ：幕の内の西の縁(-46,141)で20秒止まった→まず真横の西へ出る
            g.onArrive = (q) => { q.dest = { x: -56, z: 134 }; q.anchor = { ...q.dest }; q.onArrive = (r) => { r.onArrive = null; r._outMaku = false; hold(r, hx, hz); r.aggro = 22; r.seekRange = 26; }; };
            g.aggro = 22; g.seekRange = 26;
          }
          return;
        }
        // 幕の北に居る隊を幕の南の持ち場へまっすぐ向けると、幕の角をかすめて止まった（11/13 act bot・本多の新手 (-31,142) 二十秒）
        //   → 幕の東（または西）の脇を回ってから持ち場へ（allyWave と同じ回り方）
        if (c.z > 144 && hz < 128 && hx > -54 && hx < -26) {
          if (!g._outMaku) {
            const sx = c.x < HON.x ? -16 : 16;
            g._outMaku = true; g.stay = false; g.order = 'move'; g.dest = { x: HON.x + sx, z: HON.z + 14 }; g.anchor = { ...g.dest };
            g.onArrive = (q) => { q.dest = { x: HON.x + sx, z: HON.z - 6 }; q.anchor = { ...q.dest }; q.onArrive = (r) => { r.onArrive = null; r._outMaku = false; hold(r, hx, hz); r.aggro = 22; r.seekRange = 26; }; };
            g.aggro = 22; g.seekRange = 26;
          }
          return;
        }
        g._outMaku = false; hold(g, hx, hz); g.aggro = 22; g.seekRange = 26;
      });
      // 11/13 K020（act bot：本陣の敵 30〜48 人の間、本陣へ寄る味方の組は 13 組のうち 0〜2 組だけだった）：
      //   ほかの味方の備（新手・残った先手の隊など。本陣・手勢・越前勢・上の三組を除く）も、本陣の前（幕の北 z−20）へ寄せて敵に掛かる（十二秒に一度・隊ごと）
      if (near >= 12) {
        // 本陣に敵が 十二人以上：残る味方の備は（本陣の旗本・手勢の前の備も含め）ほぼ全部が本陣の前へ駆けて掛かる（六秒に一度・隊ごと）。越前勢・手勢の「持ち場」の決めもこの間は解く
        let k = 0;
        for (const g of rt.army.groups) {
          if (g.team !== 0 || !alive(g) || g.isPlayerSquad || g === F.hon) continue;
          if (g.units.filter((q) => q.alive).length < 4 || (g._helpT || 0) > rt.t) continue;
          const c = centerOf(g)(); if (!c || Math.hypot(c.x - I.pos.x, c.z - I.pos.z) > 260) continue;
          g._helpT = rt.t + 6; g._apCharge = false; g.stay = false; g.allOutRun = true; hold(g, I.pos.x + ((k++ % 5) - 2) * 10, I.pos.z - 18); g.aggro = 24; g.seekRange = 34;
        }
      }
      if (!F.helpSaid) { F.helpSaid = true; rt.say('使番', '本陣が襲われておる！　二陣、旗本、本陣へ戻れ！', 3); }
      const M = F._jin?.M; if (M && !F.helpMass) { F.helpMass = true; try { M.waki?.moveTo(I.pos.x + 12, I.pos.z + 2, 20); M.hata?.moveTo(HON.x, HON.z + 12, 24); } catch (e) { /* そのまま */ } }
    }
  },
  // 真田を破ったら味方は追う（追撃が無いと殿の意味が無い）。⑤は退く赤備えを、⑥は毛利の殿を
  pursue(rt) {
    const F = rt.flags;
    if (F.puT > rt.t) return;
    F.puT = rt.t + 2;
    const to = F.step === 6 && alive(F.shin) ? centerOf(F.shin)() : { x: -66, z: -16 };
    [F.nijin, F.hata2].forEach((g, i) => { if (alive(g)) { g.stay = false; g._apCharge = false; g.order = 'attack'; g.anchor = { x: to.x + (i ? 8 : -8), z: to.z + 12 }; g.aggro = 24; g.seekRange = 34; } });
    if (!F.puSaid) { F.puSaid = true; rt.say('使番', '赤備えが崩れた！　追え、追え！', 2.8); try { F._jin?.M?.ni?.reform?.(); F._jin?.M?.mizu?.moveTo(-50, 10, 60); } catch (e) { /* そのまま */ } }
  },
  // 敵の新手が来たら、味方の援軍も同じだけ来て、前へ出て戦う（11/9 kaito「味方が圧倒的に少ない・後ろで待たない」）
  allyWave(rt) {
    const F = rt.flags;
    if (realN(rt) > 238 || (F.awN || 0) >= 10) return;
    F.awN = (F.awN || 0) + 1;
    const NM = ['水野勝成の手', '本多忠政の手', '藤堂高虎の手', '伊達政宗の手', '浅野長晟の手', '黒田長政の手', '酒井家次の手', '細川忠興の手', '片倉重長の手', '榊原の後詰'];
    const FL = ['mizuno', 'honda', 'todo', 'date', 'asano', 'kuroda', 'tokugawa', 'tokugawa', 'date', 'sakakibara'];
    const k = (F.awN - 1) % NM.length, kt = { armor: TOKU.armor, flag: FL[k] };
    const from = { x: HON.x + (F.awN % 2 ? 34 : -30), z: HON.z + 40 };
    const g = allyGroup(rt, { faction: 'tokugawa', name: NM[k], anchor: from, facing: Math.PI, width: 10, aggro: 22, seekRange: 34, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(kt, 'samurai', 3), sq(kt, 'ashigaru', 11), sq(kt, 'gun', 3)]);
    g.defMult = 1.15; g.dmgMult = 0.7; (F.aw ||= []).push(g);
    // 今の戦いの真ん中（主人公の居所の少し前）へ駆けて、着いたら攻める
    //   行き先は主人公の居所ではなく敵の真ん中（主人公の周りに五十人が固まり、主人公が十五分動けなかった・11/9 通し）
    let ex = 0, ez = 0, en = 0; const I = F.ieyasu?.alive ? F.ieyasu.pos : HON;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && Math.hypot(u.pos.x - I.x, u.pos.z - I.z) < 90) { ex += u.pos.x; ez += u.pos.z; en++; }
    const t = en ? { x: ex / en, z: ez / en } : { x: NIJIN.x, z: NIJIN.z - 20 };
    const go = (q) => { q.order = 'move'; q.dest = { x: t.x, z: t.z }; q.anchor = { x: t.x, z: t.z }; q.onArrive = (r) => { r.onArrive = null; r.order = 'attack'; r.stay = false; r.aggro = Math.max(r.aggro || 0, 40); r.seekRange = Math.max(r.seekRange || 0, 60); }; };   // 着いた時には敵が動いていて三十四歩の外に居り、伊達政宗の手が (-50,117) で攻めのまま二十秒立った（11/11 act bot）→ 着いたら広く探す
    // 陣幕（x -48〜-32・z 130〜142）を挟む時は、来た側の脇を回ってから（幕の後ろに当たり、本多忠政の手が (-45,143) で二十秒止まった・11/11 act bot）
    const sx = from.x < HON.x ? -14 : 14, cross = t.z < HON.z + 2 && Math.abs(from.x + (t.x - from.x) * (from.z - HON.z - 12) / ((from.z - t.z) || 1) - HON.x) < 13;
    if (cross) { g.order = 'move'; g.dest = { x: HON.x + sx, z: HON.z + 14 }; g.anchor = { ...g.dest }; g.onArrive = (q) => { q.dest = { x: HON.x + sx, z: HON.z - 6 }; q.anchor = { ...q.dest }; q.onArrive = go; }; }
    else go(g);
    if (F.awN <= 4) rt.after(2, () => rt.say('使番', NM[k] + '、駆け付けた！', 2.4));
  },
  // 死ぬ間際に味方が駆け付ける（11/9 夕 kaito K031「死ぬギリギリで味方が駆けつける軍勢の入れ混じり」）
  //   主人公の命が三割を切り、三人より多くの敵に寄られたら、後ろ（敵と逆の側）から新手が駆け込み、主人公の周りで斬り合う。
  //   本物の兵の枠に空きが無ければ、近くの味方の隊を主人公の所へ走らせる。四十五秒に一度・五度まで。
  rescue(rt, dt) {
    const F = rt.flags, P = rt.player.u;
    if (!P.alive || (F.rsN || 0) >= 5 || F.rsT > rt.t) return;
    if ((F.rsC = (F.rsC || 0) + dt) < 0.5) return; F.rsC = 0;
    if (P.hp > (P.maxHp || 100) * 0.3) return;
    let n = 0, ex = 0, ez = 0;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing) { const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z); if (d < 10) { n++; ex += u.pos.x; ez += u.pos.z; } }
    if (n < 3) return;
    F.rsN = (F.rsN || 0) + 1; F.rsT = rt.t + 45;
    // 敵の塊と逆の側、二十二歩の所から
    let dx = P.pos.x - ex / n, dz = P.pos.z - ez / n; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const at = { x: P.pos.x, z: P.pos.z };
    const rush = (g) => { g.stay = false; g._apCharge = false; g.order = 'move'; g.dest = { ...at }; g.anchor = { ...at }; g.aggro = Math.max(g.aggro || 0, 30); g.seekRange = Math.max(g.seekRange || 0, 40); g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 40; q.seekRange = 50; }; };
    const NM = ['水野の手', '本多の後詰', '藤堂の手', '井伊の手', '旗本の若党'], FL = ['mizuno', 'honda', 'todo', 'ii', 'tokugawa'];
    const k = (F.rsN - 1) % NM.length;
    let name = NM[k];
    if (realN(rt) <= 240) {
      const kt = { armor: TOKU.armor, flag: FL[k] };
      const g = allyGroup(rt, { faction: 'tokugawa', name: NM[k], anchor: { x: P.pos.x + dx * 22, z: P.pos.z + dz * 22 }, facing: Math.atan2(-dx, -dz), width: 7, aggro: 30, seekRange: 40, order: 'hold', fixed: true, noRout: true, fullStrength: true },
        [sq(kt, 'samurai', 3), sq(kt, 'ashigaru', 6)]);
      g.defMult = 1.15; g.dmgMult = 0.8; (F.aw ||= []).push(g); rush(g);
    } else {
      let best = null, bd = 80;
      for (const g of [...(F.aw || []), F.nijin, F.hata2]) if (alive(g) && g.name) { const c = centerOf(g)(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); if (d < bd) { bd = d; best = g; } }
      if (!best) return;
      rush(best); name = best.name;
    }
    rt.say('使番', name + '、助太刀に参った！', 2.4);
  },
  // 信繁の守り（旗本と馬廻）の生きている数。信繁本人は数えない
  guards(rt) {
    const F = rt.flags;
    let n = 0;
    for (const g of [F.nobu, F.nobu2, F.nobu3, ...(F.nobuX || [])]) if (g) for (const u of g.units) if (u.alive && !u.fleeing && u !== F.nobuU) n++;
    return n;
  },
  // ⑤ 疲れ果てた信繁は安居の天神へ退く。追って討つ
  stage5(rt) {
    const F = rt.flags;
    F.step = 5; F.tS = rt.t;
    rt.award((t) => t.side.push('真田信繁の旗本を討った'), '真田信繁の旗本を討った');
    rt.unmark('k15');
    flee([F.nobu2, F.nobu3, ...(F.nobuX || [])].filter(Boolean));
    if (F.nobuU) F.nobuU.onWound = null;   // 安居の天神では討てる（onWound が残ると遊び手の止めが通らない）
    const g = F.nobu;
    // 信繁は安居の天神の杜まで退いてから討てる（途中で討てると、天神へ一度も行かずに勝ちになった。三3・九2・critic60）
    // 旗本が崩れて（routed）いても、信繁と残りの者は一つの隊として天神の杜へ退く（崩れたままでは動かず、本陣の前で討たれた）
    //   残った旗本は討ち散らされて城（北）へ落ちる。信繁だけが天神の杜へ退く（旗本と組み合ったまま本陣の前で四十秒止まった）
    if (g) {
      // noRetinue：供回りの侍を見えない所で足す仕組み（lord_retinue）が、散らした旗本の代わりを足し続け、隊が百七十人に膨らんだ
      g.routed = false; g.noRout = true; g.morale = 100; g.noRetinue = true;
      for (const u of g.units) if (u.alive) { u.target = null; u.atk = null; u.swing = null; if (u === F.nobuU) u.fleeing = false; else { u.moraleFleeDir = { x: 0.3, z: -1 }; u.fleeing = true; u.fleeT = rt.army.time; } }
    }
    // 退きは駆け足（歩きでは天神まで百秒かかり、先に着いた主人公が杜で待たされた）
    if (g) { g._charge = false; g.stay = true; g.speed = Math.max(g.speed || 0, 5.2); g.order = 'move'; g.dest = { x: YASUI.x, z: YASUI.z }; g.anchor = { x: YASUI.x, z: YASUI.z }; g.aggro = 0; g.seekRange = 0; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: YASUI.x, z: YASUI.z }; q.aggro = 8; q.seekRange = 12; }; }
    // 信繁の足も駆け足に（隊の要だけ速めても本人が毎秒 2.6m で歩き、馬の主人公が杜で七十秒待たされた）
    if (F.nobuU) { F.nobuU.invuln = true; F.nobuU.run = Math.max(F.nobuU.run || 0, 5); F.nobuU.speed = Math.max(F.nobuU.speed || 0, 3); }
    // 越前勢は天神の前に先回りせず、信繁の後ろから追う（先回りして道の途中で組み合い、信繁が茶臼山の脇で止まった）。杜に着いてから寄せる（update）
    if (alive(F.echizen)) { const c = centerOf(F.echizen)(); F.echizen.stay = true; F.echizen.anchor = { x: c.x, z: c.z }; F.echizen.order = 'hold'; F.echizen.aggro = 3; F.echizen.seekRange = 4; F.echizen.dmgMult = 0.25; }
    rt.obj('main', '安居の天神へ追い、真田信繁を討つ', 'main');
    rt.say('真田信繁', '……ここまでか。天神の杜まで退け', 3.4);
    rt.after(3.8, () => rt.say('西尾宗次', '真田は疲れ果てておる。天神の杜へ追え！', 3.2));
    rt.marker('k15', () => { const u = F.nobuU; if (u && u.alive && u.pos && !near(u.pos, YASUI, 12)) return { x: u.pos.x, z: u.pos.z, label: '安居の天神' }; return DEST[5](); }, () => DEST[5]().label);   // 退く信繁について行く（着いても何も起きない待ちをなくす）
  },

  // 大坂城の炎上
  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk');
    for (const [dx, dz, s, h] of [[0, 0, 4.5, 14], [-14, 10, 3, 4], [16, 8, 3.2, 4], [-30, 24, 2.4, 1], [28, 24, 2.4, 1], [0, 30, 2.8, 1]]) {
      if (rt.world.addFire) rt.world.addFire(CASTLE.x + dx, CASTLE.z + dz, { size: s, h, blackSmoke: true });
    }
    // 天守と御殿から立つ黒い煙の柱（遠くの天王寺口からも見える。critic60「北の空に煙が無い」）
    const W = rt.world;
    if (W.addSmokeColumn) for (const [dx, dz, s] of [[0, 0, 5], [-22, 18, 3.6], [24, 20, 3.6]]) { const x = CASTLE.x + dx, z = CASTLE.z + dz; W.addSmokeColumn(x, (W.farH ? W.farH(x, z) : W.heightAt(x, z)) + 10, z, { size: s }); }
  },

  // ⑥ 追撃：信繁の討死の後、毛利勝永は殿をして城へ退く（史実）。四天王寺の北の道で殿を崩す（夕刻・大坂城に火の手）
  stage6(rt, mine, at) {
    const F = rt.flags;
    if (F.step === 6 || F.step === 7 || F.ending) return;
    F.step = 6; F.tS = rt.t; F.byMe = !!mine; F.endAt = at ? { x: Math.round(at.x), z: Math.round(at.z) } : null;
    rt.unmark('k15');
    rt.award((t) => { t.special = { label: mine ? '安居の天神で真田信繁を討ち取った' : '真田信繁を安居の天神へ追い詰めた', pts: mine ? 60 : 30 }; }, mine ? '真田信繁を討ち取った' : '真田信繁を追い詰めた');
    flee([F.nobu, F.nobu2, F.nobu3, F.mori, F.mori2, F.kimura, F.goto].filter(Boolean));
    sfx('horagai', 0.9);
    // 討たれた所で書き分ける。「日本一の兵」は島津家の者の書状の言葉なので札には書かない
    rt.banner('真田信繁、討死', at && !near(at, YASUI, 30) ? '天王寺口にて' : '安居の天神にて');
    // 大坂城の炎は、毛利の殿を破って退かせた後（⑦）に見せる（信繁を討った途端に落城・滅亡へ飛んだ・11/9 kaito）
    // 毛利勝永の殿（勝永は馬廻に守られて討てない。史実で城へ退く）。鉄砲を並べて追手を止める
    // 11/9 kaito 四8：殿の所までわざわざ行かせない。城（北東）へ退く毛利の手の一部が、主人公の目の前（城の側へ二十四歩）で振り返って歯向かう
    { const P = rt.player.u?.pos || rt.player.pos || SHINGARI, dx = SHINGARI.x - P.x, dz = SHINGARI.z - P.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, 24 / d); F.shAt = d > 40 ? { x: P.x + dx * k, z: P.z + dz * k } : { x: SHINGARI.x, z: SHINGARI.z }; }
    F.shin = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '毛利勝永の殿', anchor: { x: F.shAt.x, z: F.shAt.z }, facing: 0, width: 12, aggro: 14, seekRange: 22, order: 'hold', morale: 100, noRout: true, formation: 'yari' },
      [sq(TOYO, 'busho', 1, { name: NAMES.katsunaga, invuln: true, horse: true }), sq(TOYO, 'samurai', 8), sq(TOYO, 'ashigaru', 14), sq(TOYO, 'gun', 8)]);
    F.shin.noFrontline = true; F.shin.stay = true; F.shin.defMult = 1.4;
    F.s6 = [F.shin]; F.n6 = F.shin.count - 1;
    revealName(rt, NAMES.katsunaga);
    if (alive(F.mine)) { F.mine.stay = false; hold(F.mine, F.shAt.x + 4, F.shAt.z + 20); F.mine.aggro = 22; }
    if (alive(F.echizen)) { F.echizen.order = 'move'; F.echizen.dest = { x: F.shAt.x - 12, z: F.shAt.z + 18 }; F.echizen.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 24; q.seekRange = 40; }; }
    rt.obj('main', '四天王寺の北で毛利勝永の殿を打ち破る', 'main');   // 「崩す」は使わない（物差し 三1）
    rt.after(7.5, () => rt.say(NAMES.katsunaga, '殿はこの豊前が務める。城へ退け、一人も討たせるな！', 3.4));
    rt.after(12, () => rt.say(NAMES.ieyasu, '毛利を追え。城へ入れるな', 3));
    rt.marker('k15', () => { const g = F.shin; if (g && alive(g)) { const c = centerOf(g)(); return { x: c.x, z: c.z + 6, label: '毛利の殿' }; } return DEST[6](rt); }, () => DEST[6](rt).label);   // 殿は北へ退くので、印も殿について行く（固定だと着いた時に敵が20m外で何も起きず・クラウドた 11/13）
  },
  tick6s(rt, P) {
    const F = rt.flags;
    // 殿は少しずつ北（城）へ退きながら撃つ。三割まで崩すか、時が経てば勝永は城へ入り、茶臼山へ
    if (!(F.shT > rt.t) && alive(F.shin)) { F.shT = rt.t + 20; const c = centerOf(F.shin)(); if (c.z > (F.shAt || SHINGARI).z - 30) hold(F.shin, c.x + (SHINGARI.x - c.x) * 0.2, c.z - 3); }
    const left = sum(F.s6);
    // 残り一割ほどの鉄砲が退きながら撃ち続け、討ち切れず百秒ほど止まった（11/8 通し）→ 三分の一で城へ入る
    if (left <= F.n6 * 0.34 || F.nearDone || (rt.t - F.tS > 90 && left <= F.n6 * 0.6) || rt.t - F.tS > 140) {   // 殿の鉄砲が退きながら撃ち、「討った 14／31」のまま百秒止まった（11/8 夜の通し）
      rt.award((t) => t.side.push('毛利勝永の殿を打ち破った'), '毛利の殿を打ち破った');
      rt.say(NAMES.katsunaga, '……ここまでじゃ。城へ入る', 3);
      flee([F.shin]);
      this.stage7(rt);
    }
  },
  // ⑦ 終幕：大坂城が燃える。茶臼山の丘の上へ上り、葵の旗を立てる（夕刻）
  stage7(rt) {
    const F = rt.flags;
    if (F.step === 7 || F.ending) return;
    F.step = 7; F.tS = rt.t;
    rt.unmark('k15');
    this.burn(rt);
    rt.after(0.3, () => rt.say('使番', '大坂城の台所から火の手！　天守にも燃え移った！', 3.4));
    flee([F.katsu]);
    // 茶臼山の丘の上には、最後まで残った赤備えの者が踏み止まる（本物の兵。家臣が真田の陣を守る）
    F.last = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '茶臼山の残兵', anchor: { x: TOP.x, z: TOP.z + 2 }, facing: 2.6, width: 6, aggro: 10, seekRange: 14, order: 'hold', morale: 100, noRout: true },
      [sq(SANADA, 'samurai', 3), sq(SANADA, 'ashigaru', 4), sq(SANADA, 'gun', 1)]);
    F.last.noFrontline = true; F.last.stay = true; F.last.dmgMult = 0.6;   // 疲れ果てた残兵。それでも丘の上で鉄砲を構えて踏み止まる
    // 手勢と越前勢も茶臼山へ上る（主人公一人で丘の上の残兵に囲まれて討たれた）
    if (alive(F.mine)) { F.mine.stay = false; hold(F.mine, TOP.x + 6, TOP.z + 10); F.mine.aggro = 16; }
    if (alive(F.echizen)) { F.echizen.stay = false; F.echizen.order = 'move'; F.echizen.dest = { x: TOP.x - 8, z: TOP.z + 14 }; F.echizen.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 18; q.seekRange = 24; }; }
    rt.obj('main', '茶臼山の丘の上に上り、葵の旗を立てる', 'main');
    rt.after(1, () => rt.say(nm(rt), '天守が……燃えておりまする', 3));
    rt.after(4.5, () => rt.say(NAMES.ieyasu, '茶臼山に葵の旗を立てよ。真田の陣を取ったと、城に見せてやれ', 3.6));
    rt.marker('k15', DEST[7](), DEST[7]().label);
  },
  tick7(rt, P, dt = 0.05) {
    const F = rt.flags;
    // 頂に立ち、残兵を半ばまで退けて八秒踏み止まれば旗を立てる（逃げ回る鉄砲の者を一人残らず追わせない）
    // 11/9 kaito「頂に着いても何も起きない」：頂（六メートル）に着いて四秒で、残兵が二割減っていれば旗を立てる。十秒立てばそのまま立てる
    if (near(P, TOP, 6)) F.topT = (F.topT || 0) + dt; else F.topT = 0;
    if (F.topT > 4 && (sum([F.last]) <= 3 || sum([F.last]) <= F.last.initial * 0.8 || F.topT > 10)) this.win(rt);
    else if (near(P, TOP, 8) && !F.lastSaid) { F.lastSaid = true; rt.say('真田の侍', '殿の陣は渡さぬ！', 2.6); }
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending || F.step !== 7) return;
    F.ending = true;
    rt.unmark('k15');
    rakujo(rt, { CASTLE });
    rt.setPhase('end');
    rt.objDone('main');
    F.topFlag = nobori(rt.world, TOP.x + 1.2, TOP.z + 1.2, 'tokugawa', 7); rt.scene.add(F.topFlag);
    rt.award((t) => { t.main = true; t.side.push('茶臼山に葵の旗を立てた'); }, '天王寺・岡山の戦いに勝った');
    flee(rt.army.groups.filter((g) => g.team === 1));
    rt.banner('茶臼山に葵の旗', '豊臣方は総崩れ、城へ落ちる');
    rt.player.u.invuln = true;
    rt.after(3, () => rt.say('使番', '毛利豊前は殿をして城へ退く。明石掃部は水野勢へ突き掛かり、姿を消した', 4.4));
    rt.after(8, () => rt.banner('大坂城、炎上', '岡山口も大野治房が崩れ、豊臣方は総崩れ'));
    // 新しい本陣で家康が馬を降り、息を整える。大げさに喜ばない（docs/k15_crisis_spec_1108.md の終わり）
    rt.after(9.5, () => { if (F.ieyasu?.alive && F.ieyasu.mounted && rt.army.setMounted) { try { rt.army.setMounted(F.ieyasu, false); } catch (e) { /* そのまま */ } } rt.say('旗本', '上様、ご無事で……！', 2.6); });
    rt.after(12.4, () => rt.say('使番', '真田左衛門佐、討ち取りましてござる！', 2.8));
    rt.after(15.4, () => rt.say(NAMES.ieyasu, '……そうか。', 2.6));
    // 秀頼の自害は翌日の事。七日の使番は知り得ないので、語りの札で書く
    rt.after(18.4, () => rt.banner('翌五月八日', '秀頼公と御母君、山里曲輪にて御自害。大野修理も共に'));
    rt.after(22.6, () => rt.banner('豊臣家、滅ぶ', '七月、元号は元和に改まる'));
    rt.after(25, () => rt.say(NAMES.ieyasu, 'これで、戦の世は終わりじゃ', 3.6));
    rt.finish({ scriptedEnd: true }, 29);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false; rt.unmark('k15');
    rt.player.u.invuln = true;
    if (why) rt.banner('負け戦', why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  onKill(rt, v, killer) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    // 11/8 kaito：家康か秀忠が討たれたら負け
    if (!F.ending && (v === F.ieyasu || (F.oka && v === F.oka.hide))) { rt.banner(v === F.ieyasu ? '大御所、討たれる' : '将軍、討たれる', v === F.ieyasu ? '金扇の馬印が地に落ちた' : '岡山口の本陣が破られた'); this.lose(rt, v === F.ieyasu ? '徳川家康が討たれた' : '徳川秀忠が討たれた'); return; }
    if (v === F.nobuU && !F.ending) {
      const mine = killer ? (killer === rt.player.u || killer.group?.isPlayerSquad) : false;
      // 西尾は名を知らずに首を取り、後で真田左衛門佐と知れた（福井の松平文庫の伝え）。名乗りは通称の久作で
      if (!mine) { rt.say('西尾宗次', '名のある武者と見た。越前の西尾久作が討ち取った！', 3.6); rt.after(4, () => rt.say('使番', '西尾久作の取った首は、真田左衛門佐と知れた！', 3.4)); }
      else rt.say(nm(rt), '真田左衛門佐、討ち取ったり！', 3.6);   // 名乗りは官途名で呼ぶ（諱は口にしない）
      this.stage6(rt, mine, v.pos);
    }
    if (v === F.otaniU && !F.otaniDone) {
      F.otaniDone = true;
      const mine = killer ? (killer === rt.player.u || killer.group?.isPlayerSquad) : false;
      if (mine) { rt.say(nm(rt), '大谷大学、討ち取ったり！', 3.2); rt.award((t) => t.side.push('大谷吉治の首を取った'), '大谷吉治を討ち取った', v.pos); }
      else rt.say('使番', '大谷大学殿、討死！', 3);
    }
  },

  // 陣幕（x -48〜-32・z 130〜142、口は前と後ろ x -43〜-37）の布に向かって二秒止まった味方の兵は、布に沿って横へ歩かせ、角か口から回らせる
  //   （隊ごとの回り道を何度足しても、斬り合いへ向かう一人ずつが布の前 (-45,129)・(-34,129)・後ろ (-45,143) で二十秒止まった・11/13 act bot 三回）
  makuSlide(rt, dt) {
    const X0 = HON.x - 8.6, X1 = HON.x + 8.6, Z0 = HON.z, Z1 = HON.z + 12, sp = 2.4 * dt;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isPlayer || u.fleeing || !u.moveTo || u.mounted || u.atk) continue;
      const x = u.pos.x, z = u.pos.z, m = u.moveTo;
      if (x < X0 - 3 || x > X1 + 3 || z < Z0 - 3.4 || z > Z1 + 3.4) { u._mkT = 0; continue; }
      const inX = x > X0 && x < X1, inside = inX && z > Z0 && z < Z1;
      let dx = 0, dz = 0;
      const mIn = m.x > X0 && m.x < X1 && m.z > Z0 && m.z < Z1;
      if (inX && z <= Z0 && m.z > Z0 + 0.5) { if (Math.abs(x - HON.x) > 2.6) dx = x < HON.x ? 1 : -1; }   // 前の布の外：前の口へ（K074 で前にも口 x -43〜-37）
      else if (inX && z >= Z1 && m.z < Z1 - 0.5) {                                                       // 後ろの布の外：内へは口へ、前へは近い角へ
        if (mIn) { if (Math.abs(x - HON.x) > 2.6) dx = x < HON.x ? 1 : -1; } else dx = x < HON.x ? -1 : 1;
      } else if (inside && !mIn) { if (Math.abs(x - HON.x) > 2.6) dx = x < HON.x ? 1 : -1; else dz = m.z < Z0 ? -1 : 1; }   // 内から外へ：先に布沿いに口の前まで横へ、口の前なら行き先の側へ出る（斜めに押すと布に止められ、内の角 (-32,130) で二十秒止まった・11/13 クラウドし act bot）
      else if (!inX && z > Z0 - 0.6 && z < Z1 + 0.6 && (x <= X0 ? m.x > X0 : m.x < X1)) dz = m.z < Z0 ? -1 : 1;   // 横の布の外：前へは前の角、内へは後ろの角へ
      // 四つの角（布の端を少し切った隙間）に挟まった兵は、幕の外へ斜めに押し出す（11/13 クラウドし：角 (-32,130) で attack の新手が二十秒止まった）
      if (!dx && !dz && !mIn) for (const cx of [X0, X1]) for (const cz of [Z0, Z1]) if (Math.abs(x - cx) < 1 && Math.abs(z - cz) < 1) { dx = cx < HON.x ? -1 : 1; dz = cz === Z0 ? -1 : 1; }
      if (!dx && !dz) { u._mkT = 0; continue; }
      if (Math.hypot(u.vel.x, u.vel.z) > 0.3) { u._mkT = 0; continue; }
      if ((u._mkT = (u._mkT || 0) + dt) < 2) continue;
      const l = Math.hypot(dx, dz); u.pos.x += dx / l * sp; u.pos.z += dz / l * sp;
    }
  },
  update(rt, dt) {
    const F = rt.flags;
    k15SoundTick(rt, dt);
    jindate.tick(rt, { FRONT, NIJIN, HON, HONF, SHITENNO });
    // 11/13 K285：歩いて近づく間ずっと、本人の前 60m に本物が 40 人以上（足りなければ前 45m に新手を置く。depth_reserve.js frontFill）
    frontFill(rt, { active: () => (F.step >= 1 || F.step === 'oka') && !F.ending,
      enemy: (r, at, face) => enemyGroup(r, { fixed: true, faction: 'toyotomi', name: '毛利の新手', anchor: at, facing: face, width: 18, aggro: 3, seekRange: 5, order: 'hold', morale: 100, noRout: true }, [sq(TOYO, 'samurai', isTouch ? 4 : 8), sq(TOYO, 'ashigaru', isTouch ? 14 : 28), sq(TOYO, 'gun', isTouch ? 3 : 6)]),
      ally: (r, at, face) => allyGroup(r, { fixed: true, faction: 'tokugawa', name: '徳川の新手', anchor: at, facing: face, width: 14, aggro: 3, seekRange: 5, order: 'hold', noRout: true, fullStrength: true, formation: 'yari' }, [sq(HONDA, 'samurai', isTouch ? 3 : 5), sq(HONDA, 'ashigaru', isTouch ? 10 : 20), sq(HONDA, 'gun', isTouch ? 2 : 4)]) });
    this.makuSlide(rt, dt);
    // 前線の後備は、出た段が替わったら退く（主人公が岡山口へ走る間に家康の本陣へ寄せ続けない）
    if (F.thG?.length && F.thG.some((g) => g._thStep !== F.step || F.ending)) { flee(F.thG.filter((g) => g._thStep !== F.step || F.ending)); F.thG = F.thG.filter((g) => g._thStep === F.step && !F.ending); }
    if (F.step >= 1 && F.step <= 4 && !F.ending) { this.refill(rt); this.thick(rt); this.pressure(rt, dt); }
    if ((F.step === 5 || F.step === 6) && !F.ending) this.pursue(rt);
    if (F.step >= 1 && F.step <= 6 && !F.ending) this.rescue(rt, dt);
    // ⑦ 追手の二陣・旗本は茶臼山へ上る道の脇へ退く（道の上に四十人が固まり、主人公が頂へ上れず二百秒止まった・11/9 通し）
    if (F.step === 7 && !F.puOff) { F.puOff = true; [F.nijin, F.hata2, ...(F.aw || [])].forEach((g, i) => { if (alive(g)) { g.stay = true; hold(g, -40 + (i % 6) * 10, 34 + Math.floor(i / 6) * 10); g.aggro = 4; g.seekRange = 6; } }); }
    // 倒れる馬印（一秒ほどで横へ）と、主人公が寄ると起こし直す
    if (F.uma) {
      if (F.umaDown && !F.umaUp && F.umaT < 1) F.umaT = Math.min(1, F.umaT + dt * 1.2);
      if (F.umaUp && F.umaT > 0) F.umaT = Math.max(0, F.umaT - dt * 0.6);
      F.uma.rotation.z = 1.45 * F.umaT * F.umaT;
    }
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    if (F.step === 0.7) { this.tick07(rt, dt, P); return; }
    // 数の札が「あと一、二人」のまま十二秒続いたら、その段は果たしたとみなす（残りが遠くの斬り合いに散り「討った 27／28」で五十秒止まった・11/8 夜の通し）
    { let kv = F.step !== F.ndStep ? null : KILLS.k15_tennoji_okayama(rt); if (kv && F.kvM?.s === F.step && F.kvM.raw) kv = F.kvM.raw; if (F.step !== F.ndStep) { F.ndStep = F.step; F.ndT = 0; }
      F.ndT = kv && kv[1] - kv[0] <= Math.max(1, Math.round(kv[1] * 0.07)) ? (F.ndT || 0) + dt : 0; F.nearDone = F.ndT > 12; }
    // 岡山口の間、本多を破った毛利の手は四天王寺の前まで引いてひと息つく（天王寺口に留まり、岡山口へ走る主人公を道で押し包んだ）
    if (F.step === 'oka' && !F.okaPull) {
      F.okaPull = true;
      [F.mori, F.katsu, F.kimura, F.mori2, F.goto].forEach((g, i) => { if (alive(g)) { g._charge = false; hold(g, SHITENNO.x - 16 + i * 8, SHITENNO.z + 6); g.aggro = 6; g.seekRange = 8; g.stay = true; } });
      // 手勢も岡山口の脇へ走る（主人公一人で治房の先手三十人に当たって討たれた）。治房の先手の刃は少し鈍く（前田勢と押し合って疲れている）
      if (alive(F.mine)) { F.mine.stay = false; F.mine._apCharge = false; hold(F.mine, 10, 80); F.mine.aggro = 16; F.mine.seekRange = 20; }
      for (const g of F.oka?.s || []) if (g) g.dmgMult = Math.min(g.dmgMult || 1, 0.75);
    }
    // 岡山口は波で来る：先の手が半ばに減ったら大野治房の新手（本物の兵の枠の内で）
    if (F.step === 'oka' && F.oka && !F.oka.done && !F.okaWave && rt.t - F.tS > 40 && sum(F.oka.s) <= F.oka.n * 0.5 && realN(rt) < 228) {   // 先の敵が半ばに減ってから（重ねると脇の持ち場が三十人に囲まれた）
      F.okaWave = true;
      const g = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '大野治房の新手', anchor: { x: 6, z: 34 }, facing: 0, width: 10, aggro: 22, seekRange: 46, order: 'attack', morale: 100, noRout: true, formation: 'yari' },
        [sq(TOYO, 'samurai', 4), sq(TOYO, 'ashigaru', 12), sq(TOYO, 'gun', 3)]);
      g.anchor = { x: 14, z: 66 }; g.defMult = 1.3; F.oka.s.push(g); F.oka.n += g.count; F.okaNew = g;
      rt.say('使番', '前田勢の脇を抜けて、治房の新手が来る！', 3);
    }
    if (F.step === 6) { this.tick6s(rt, P); return; }
    if (F.step === 7) { this.tick7(rt, P, dt); if (rt.t - F.tS > LIMIT[7]) this.lose(rt, GOAL_LIMIT[7]); return; }
    // 主人公も天神へ追い着いてから討つ。離れた野に立ったまま味方だけで勝たせない。
    // 信繁が討たれたのに締めが始まらないまま（杜の外で討たれ win が弾かれた時）二分待たされた → 討たれたらその場で締める
    if (F.step === 5 && F.nobuU && !F.nobuU.alive) { F.atYasui = true; F.yasuiReached = true; this.stage6(rt, near(P, F.nobuU.pos, 6), F.nobuU.pos); return; }
    if (F.step === 5 && F.nobuU?.alive) {
      // 杜の前で斬り合いに引かれて信繁が杜から離れても、そばへ追い着けば討てる（主人公が信繁の隣で四分斬り続けても無敵のまま、時切れで負けた・11/8 通し）
      if (F.atYasui && (near(P, YASUI, 20) || near(P, F.nobuU.pos, 10))) F.yasuiReached = true;
      F.nobuU.invuln = !F.atYasui || !F.yasuiReached;
    }
    // 主を討たれた馬は、その場に突っ立たせず戦場の外（南東の田）へ駆け去らせ、離れたら消す（BL7・一3・critic60）
    if (!(F.horseT > rt.t)) {
      F.horseT = rt.t + 1;
      const LH = rt.army.looseHorses;
      if (LH) for (let i = LH.length - 1; i >= 0; i--) {
        const o = LH[i], hp = o.h && o.h.position;
        // 主人公の乗る馬・手綱を取った馬は動かさない（乗った馬まで南東へ駆け去った）
        // 11/9 kaito 13：討った敵将の馬・主人公のそば（20m）で落ち着いた馬は残す（R で乗れる）
        if (o.tame && o.calm && (o.from?.name || Math.hypot(hp.x - P.x, hp.z - P.z) < 20) && o.t < 60) continue;
        if (!hp || o.kept || o.held > 0 || o.h === rt.player.horse || o === rt.player.loose || rt.player.u.horse === o.h || Math.hypot(hp.x - P.x, hp.z - P.z) < 2.5) continue;
        o.calm = false; o.tame = false; o.shyT = 2; o.shyDir = Math.atan2(160 - hp.x, 260 - hp.z);
        if (o.t > 14 && Math.hypot(hp.x - P.x, hp.z - P.z) > 45) { rt.scene.remove(o.h); LH.splice(i, 1); }
      }
    }
    // ⑤で時が過ぎたら、史実どおり越前の西尾宗次が信繁を討つ（主人公の手柄にはならない。負けにはせず⑥へ。二5）
    if (F.step === 5 && rt.t - F.tS > LIMIT[5] && F.nobuU?.alive) {
      const ni = F.echizen?.units.find((q) => q.name === NAMES.nishio && q.alive) || null;
      try { Object.defineProperty(F.nobuU, 'invuln', { configurable: true, writable: true, value: false }); } catch (e) { /* そのまま */ }
      rt.army.kill(F.nobuU, ni);
      if (F.step === 5) this.stage6(rt, false, F.nobuU.pos);
      return;
    }
    if (rt.t - F.tS > LIMIT[F.step]) { this.lose(rt, GOAL_LIMIT[F.step]); return; }
    // 真田の兵が家康のすぐそばまで多く入ったら、本陣が破られて負け
    if (F.step >= 2 && F.step <= 4 && F.ieyasu) {
      let k = 0;
      for (const g of [F.sanada, F.sanada2, F.sanada3, F.nobu, F.mori, F.katsu, F.kimura, F.mori2, F.goto, ...(F.newE || [])]) if (alive(g) && g._charge && g.order === 'hold') for (const u of g.units) if (u.alive && !u.fleeing && near(u.pos, F.ieyasu.pos, 7)) k++;
      F.breachT = k >= 20 ?(F.breachT || 0) + dt : 0;
      // 一の突撃で本陣へ斬り込まれたら、史実どおり馬印が倒れて家康が退く（三の段へ。負けにしない）。二の突撃からは負け
      if (F.breachT > 15 && F.step === 2) { F.breachT = 0; rt.say('使番', '真田が本陣へ斬り込んだ！　大御所様をお守りせよ！', 3.2); this.stage3(rt); return; }
      // 二の突撃で斬り込まれたら、一度は越前勢がすぐ真田の後ろを突き、残った旗本が踏み止まる（史実の立て直し）。二度目は負け
      if (F.breachT > 15 && F.step === 3 && !F.rally) {
        F.breachT = 0; F.rally = true; F.hon.defMult = 2.4; if (alive(F.hata2)) F.hata2.defMult = 1.8;
        if (!F.echi3 && alive(F.echizen)) { F.echi3 = true; F.echizen.order = 'attack'; F.echizen.aggro = 26; F.echizen.seekRange = 50; F.echizen.dmgMult = 0.7; }
        rt.say('本多正純', '旗本、踏み止まれ！　越前勢が真田の後ろへ掛かったぞ！', 3.4); return;
      }
      // 二度目からは、斬り込んだ兵が家康を討てば負け（onKill）。数で負けにしない（11/8 kaito「家康か秀忠が討たれたら負け」）
    }
    // 真田の兵は走りながら目当て（家康の居所）を追い直す
    if (!(F.reT > rt.t)) { F.reT = rt.t + 2; for (const g of [F.sanada, F.sanada2, F.sanada3, F.mori, F.katsu, F.kimura, F.mori2, F.goto, ...(F.newE || [])]) if (alive(g) && g._charge && g.order === 'hold') this.charge(rt, g, g._chA || 6); const tg = F.step === 4 ? F.nobu : F.step === 3 && F.echi3 ? F.sanada2 : null; if (alive(F.echizen) && alive(tg)) this.chase(F.echizen, tg); }
    // ⑤の間、崩れた旗本は信繁のもとへ戻らず城へ落ちる（隊の持ち場へ戻って杜で信繁を囲み、主人公が近寄れなかった）
    if (F.step === 5 && F.nobu && !(F.gT > rt.t)) {
      F.gT = rt.t + 1;
      for (const u of F.nobu.units) if (u.alive && u !== F.nobuU && !u.fleeing) { u.moraleFleeDir = { x: 0.3, z: -1 }; u.fleeing = true; u.fleeT = rt.army.time; u.target = null; }
      // 杜に着いた信繁は逃げ散らず、杜の前に踏み止まる（一人になって崩れ、西の田へ流れて杜の外で討たれた）
      if (F.atYasui && F.nobuU?.alive) { F.nobuU.fleeing = false; F.nobu.routed = false; if (!near(F.nobuU.pos, YASUI, 8) || F.nobu.order !== 'hold') hold(F.nobu, YASUI.x, YASUI.z);
        // 杜から十四メートルより離れたら相手を放して杜へ戻る（杜の外の主人公を追って四十メートル離れ、天王寺口の側で討たれた）
        //   追手に押されて離れた時は駆けて戻る（疲れ果てた足のままでは押し負けて、杜から五十メートル北へ流された）
        //   ただし主人公が間近（八メートル）で斬り合う間は放さず、討たれる的のままにする（杜の外で noTarget のまま主人公の槍が三分素通りし、時切れで負けた・11/8 通し）
        //   杜では足を止める（毎秒 0.8m の足で主人公を追って杜から四十五メートル流れ、退く主人公を追って本陣の前まで戻った）
        //   主人公と斬り合いながらでも杜から二十二メートルより外へは出ない（退く主人公を追って杜から六十メートル北へ流れた・11/8 通し）
        const away = !near(F.nobuU.pos, YASUI, 14) && (!near(P, F.nobuU.pos, 8) || !near(F.nobuU.pos, YASUI, 22));
        if (away) { F.nobuU.target = null; F.nobuU.atk = null; F.nobuU.swing = null; }
        F.nobuU.noTarget = away && !near(P, F.nobuU.pos, 10); F.nobuU.run = away ? 4 : 0.2; F.nobuU.speed = away ? 2.5 : 0.15; }
    }
    F.tq?.update(dt);
    if (F.step === 1) {
      if (!F.tadaDone && (rt.t - F.tS > 70 || sum([F.mori]) <= F.n1 * 0.55)) this.tadatomo(rt);
      // 段の長さは一つの戦が 4〜7 分に収まるように（二5。⑤の天神への追いの分を前の段から詰めた）
      // 11/8：一戦20〜30分。毛利・木村・二の手を三割まで斬り減らすまで（動かない人には時の保険）
      // 本多の先手と手勢が尽きたら、史実どおり天王寺口の先手は崩れ、毛利はひと息ついて次の段へ（一人で五十人に囲まれて討たれた）
      const wiped = rt.t - F.tS > 120 && sum([F.honda, F.mine]) <= 8;
      if (F.tadaDone && (((sum(F.s1) <= F.n1 * 0.3 || F.nearDone) && rt.t - F.tS > 120) || wiped || (rt.t - F.tS > 170 && sum(F.s1) <= F.n1 * 0.5) || rt.t - F.tS > 250)) this.stage2(rt);
    } else if (F.step === 2) {
      // 赤備えと毛利の手を四割五分まで減らし、大谷吉治が討たれたら。大谷が残っても時が経てば二の突撃へ
      const od = !F.otaniU?.alive;
      // 大谷吉治は隊の大将として赤備えの後ろに残り、茶臼山の北（本陣から八十メートル）で止まって、本陣の前へ来ないまま段が百五十秒進まなかった（11/8 通し）。
      //   主人公が間近（十二メートル）に来るまでは、本陣の前の斬り合いの後ろまで駆けさせる（追うと茶臼山の東の崖際へ下がり、主人公が届かなかった）
      const O = F.otaniU;
      if (O?.alive && !(F.oT > rt.t)) {
        F.oT = rt.t + 0.5;
        const to = { x: HONF.x - 6, z: HONF.z - 16 }, d = Math.hypot(to.x - O.pos.x, to.z - O.pos.z);
        // 赤備えが大谷一人ほどになったら、大谷が自ら主人公へ掛かってくる（「討った 35／36」のまま、十八メートル先に立つ大谷に届かず百四十秒止まった・11/8 通し）
        //   段の始まりから九十秒経っても大谷が残っていれば、残りの赤備えを連れて主人公へ掛かる（本陣の前の二十メートル北に六人と立ち止まり、「討った 18／30」のまま百二十秒進まなかった・11/8 夜の通し）
        const come = (sum([F.sanada]) <= 3 || rt.t - F.tS > 90) && near(P, O.pos, 60) && !near(P, O.pos, 3);
        if (!come && d > 12 && !near(P, O.pos, 12)) { const k = Math.min(1, 1.6 / d); O.pos.x += (to.x - O.pos.x) * k; O.pos.z += (to.z - O.pos.z) * k; if (rt.world.heightAt) O.pos.y = rt.world.heightAt(O.pos.x, O.pos.z); O.target = null; O.atk = null; O.swing = null; }
        else if (come) { if (rt.t - F.tS > 90 && alive(F.sanada) && !F.otaniGo) { F.otaniGo = true; F.sanada.stay = false; F.sanada.order = 'attack'; F.sanada.aggro = 30; F.sanada.seekRange = 40; rt.say(NAMES.otani, '者ども、あの者を討て！', 2.8); } const dx = P.x - O.pos.x, dz = P.z - O.pos.z, dd = Math.hypot(dx, dz), k = Math.min(1, 1.4 / dd); O.pos.x += dx * k; O.pos.z += dz * k; if (rt.world.heightAt) O.pos.y = rt.world.heightAt(O.pos.x, O.pos.z); O.target = rt.player.u; }
      }
      // 目標の数（赤備え）を討ち尽くし大谷も討ったら、毛利の手が残っていても進む（数の札と進みを合わせる）
      if ((od && rt.t - F.tS > 140 && (sum(F.s2) <= F.n2 * 0.4 || sum([F.sanada]) <= 2 || F.nearDone)) || (rt.t - F.tS > 170 && sum(F.s2) <= F.n2 * 0.55) || rt.t - F.tS > 240) this.stage3(rt);
    } else if (F.step === 3) {
      if (!F.umaUp && near(P, F.uma.position, 10)) { F.umaUp = true; rt.say(nm(rt), '馬印を起こした！　大御所はご無事ぞ！', 3); sfx('taiko', 0.6); }
      F.umaSt?.update(dt);
      // 引き返した越前勢が真田の二番手の後ろを突く（史実。主人公が動かなくても段が進む）
      if (!F.echi3 && rt.t - F.tS > 55 && alive(F.echizen) && alive(F.sanada2)) {
        F.echi3 = true; F.echizen.order = 'attack'; F.echizen.aggro = 26; F.echizen.seekRange = 50; F.echizen.dmgMult = 0.7;
        rt.say('使番', '越前勢が真田の二番手の後ろを突いた！', 3);
      }
      if ((F.umaUp && (sum(F.s3) <= F.n3 * 0.3 || F.nearDone) && rt.t - F.tS > 130) || (rt.t - F.tS > 160 && sum(F.s3) <= F.n3 * 0.5) || rt.t - F.tS > 230) this.stage4(rt);
    } else if (F.step === 4) {
      const left = this.guards(rt);
      // 一つの戦は 4〜7 分（二5）：天神への追いの分、三の突撃は短めに切り上げる
      if (((left <= F.n4 * 0.3 || F.nearDone) && rt.t - F.tS > 120) || (rt.t - F.tS > 150 && left <= F.n4 * 0.55) || rt.t - F.tS > 220) this.stage5(rt);
    } else if (F.step === 5 && !F.atYasui && F.nobuU?.alive && !near(F.nobuU.pos, YASUI, 16)) {
      // 天神の杜へ退く道を外れないように、二秒ごとに行き先を言い直す
      const g = F.nobu;
      // 退く道で越前勢と組み合わない（無敵のまま斬り合って茶臼山の脇で九十秒止まり、主人公が杜で待たされた）
      // 11/13 クラウドさ（台帳 K029「攻撃できない敵がいる」）：退く信繁を追って斬っても刃が素通りしていた。主人公が十メートルの内に追い付いた時だけは討てる的に戻す（命は onWound で五割五分に戻り、杜までは討たれない）
      F.nobuU.noTarget = !near(P, F.nobuU.pos, 10); F.nobuU.target = null; F.nobuU.atk = null; F.nobuU.swing = null;
      // 本陣の旗本の脇を回る（まっすぐ天神へ向けると旗本の人垣と陣幕に馬ごと挟まれ、百四十秒止まった）。要は信繁の二十メートル先までしか出さない
      if (g && !(F.yT > rt.t)) {
        F.yT = rt.t + 1; g.routed = false; F.nobuU.fleeing = false;
        const N = F.nobuU.pos, west = N.x < HON.x;
        // 陣幕の内（幕は前が閉じ、口は後ろ）に斬り込んでいた時は、まず後ろの口から出る
        const inMaku = Math.abs(N.x - HON.x) < 9 && N.z > HON.z - 1 && N.z < HON.z + 13;
        const way = [[west ? -72 : -22, HON.z - 4], [west ? -64 : -30, 80], [-46, 40], [-46, 0], [-68, -26], [YASUI.x, YASUI.z]];
        if (inMaku) way.unshift([HON.x, HON.z + 17], [west ? -60 : -20, HON.z + 17]);
        const w = inMaku ? (Math.abs(N.x - HON.x) < 3 ? way[0] : [HON.x, N.z + 4]) : (way.find((q) => q[1] < N.z - 6) || way[way.length - 1]);
        g.order = 'move'; g.dest = { x: w[0], z: w[1] };
        if (!g.anchor || Math.hypot(g.anchor.x - N.x, g.anchor.z - N.z) > 20) g.anchor = { x: N.x, z: N.z };
        // 人垣に挟まって三秒で六メートルも進まない時は、人の間をすり抜ける（足りない分の半ばを行き先へ）
        const last = F.yLast || (F.yLast = { x: N.x, z: N.z, t: rt.t });
        if (rt.t - last.t >= 3) {
          const moved = Math.hypot(N.x - last.x, N.z - last.z);
          if (moved < 6) { const dx = w[0] - N.x, dz = w[1] - N.z, d = Math.hypot(dx, dz) || 1, k = Math.min(d, (6 - moved) * 0.5); N.x += dx / d * k; N.z += dz / d * k; }
          last.x = N.x; last.z = N.z; last.t = rt.t;
        }
        // それでも遅れる時（退きから四十五秒で杜の六十メートルの外）は、主人公から見えない所で天神への道の口（四天王寺の西）へ移し、そこから杜へ駆けさせる
        const R0 = { x: -46, z: 0 };
        if (rt.t - F.tS > 45 && !near(N, YASUI, 60) && !near(P, N, 35) && !near(P, R0, 35) && !F.nWarp) {
          F.nWarp = true; N.x = R0.x; N.z = R0.z; F.nobuU.target = null; F.nobuU.atk = null; F.nobuU.swing = null;
          g.anchor = { x: R0.x, z: R0.z }; g.order = 'move'; g.dest = { x: -68, z: -26 }; last.x = N.x; last.z = N.z; last.t = rt.t;
        }
      }
    } else if (F.step === 5 && !F.atYasui && F.nobuU?.alive) {
      // 天神の杜に着いた信繁は、疲れ果てて腰を下ろす（ここで討てる）
      F.atYasui = true; F.tY = rt.t; F.nobuU.noTarget = false;
      // 杜の前で踏み止まる（着いた後に追手を追って杜から離れ、天王寺口の側で討たれた）
      if (F.nobu) { hold(F.nobu, YASUI.x, YASUI.z); F.nobu.stay = true; F.nobu.aggro = 2; F.nobu.seekRange = 2.5; }   // 寄った者だけと斬り合う（近習と斬り合う主人公を追って杜から北へ六十メートル離れた）
      // 疲れ果てて足が止まる（斬り合いで主人公を追って杜から離れ、外で討たれた）
      F.nobuU.speed = 0.15; F.nobuU.run = 0.2;
      // 馬を下り、馬は杜の脇の木に繋ぐ（史実：疲れ果てて杜で休んでいた所を討たれた）。
      //   馬上のままでは騎馬の持ち場の動きで杜から北へ百五十メートル流れ、本陣の前まで戻った（11/8 通し）
      const NU = F.nobuU, NH = NU.horse;
      if (NU.mounted && rt.army.setMounted) {
        rt.army.setMounted(NU, false);
        if (NH) { NH.position.set(YASUI.x - 3.5, rt.world.heightAt ? rt.world.heightAt(YASUI.x - 3.5, YASUI.z - 2) : NU.pos.y, YASUI.z - 2); NH.rotation.set(0, 0.6, 0); rt.scene.add(NH); NU.horse = null; tetherHorse(rt.army, NH, YASUI.x - 3.5, YASUI.z - 2, 0.6, 1, '真田の馬'); }   // 繋いだ馬は乗れる（11/9 kaito 13）
      }
      if (alive(F.echizen)) { F.echizen.stay = false; F.echizen.order = 'move'; F.echizen.dest = { x: YASUI.x + 6, z: YASUI.z + 12 }; F.echizen.onArrive = (q) => { q.onArrive = null; hold(q, YASUI.x + 6, YASUI.z + 12); q.aggro = 14; }; }
      F.yasuiReached = near(P, YASUI, 20);
      F.nobuU.invuln = !F.yasuiReached; F.nobuU.hp = Math.min(F.nobuU.hp, F.nobuU.maxHp * 0.25);   // 疲れ果てている（史実）
      rt.say('真田信繁', '……もはやこれまで。わしの首を手柄にされよ', 3.4);
    }
  },
};

k15_tennoji_okayama.force = (rt) => ({ a: Math.round(150000 - (rt.flags.ak || 0) * 40), a0: 150000, b: Math.max(0, 55000 - (rt.flags.ek || 0) * 60), b0: 55000 });
// 始まりの札の日付は一行に収める（「初夏・」で切れて「昼」が次の行に落ちた。五4・critic60）
k15_tennoji_okayama.date = (rt) => (rt.flags.burned ? '慶長二十年（1615）五月七日　夕　摂津 天王寺口' : '慶長二十年（1615）五月七日　正午　摂津 天王寺口');
k15_tennoji_okayama.history = '慶長二十年（1615）五月七日、大坂夏の陣の最後の野戦。徳川方はおよそ十五万で、天王寺口を家康、岡山口を秀忠が受け持った。豊臣方はおよそ五万五千が城の南に打って出た。天王寺口では四天王寺の南門の前に陣した毛利勝永（木村・後藤の残兵を合わせおよそ六千五百）が本多忠朝・小笠原秀政の先手を破り、忠朝は討死した。茶臼山に陣した真田信繁（およそ三千五百）は、正面の松平忠直の越前勢（およそ一万五千）が城へ向かって真田の陣を抜けると、入れ違いに家康の本陣（旗本およそ一万五千）を目がけて突き掛かり、本陣は崩れて馬印が倒れ、家康も一時退いたと伝わる。やがて引き返した松平忠直の越前勢らに横から押され、疲れ果てた真田隊は崩れ、信繁は安居の天神の辺り（生玉と勝鬘の間の高台とも）で越前の西尾宗次に討たれた。勝永は城へ退き、岡山口でも大野治房らが前田・井伊・藤堂の手に崩された。大坂城は火に包まれ、翌八日、秀頼と淀殿は山里曲輪で自害し、豊臣家は滅んだ。\n開戦の引き金は、毛利の寄騎が物見の本多勢を撃ったとも、本多勢が先に撃ったとも言い、時刻も十時・正午・十三時と記録が分かれる（ここは毛利から始まる説）。真田は「浅野長晟が寝返った」と偽りの噂を流して幕府方を揺らし、本陣へ二度とも三度とも突き掛かった。旗奉行は馬印を倒し、旗本には三里も逃げた者がいたと言う。小笠原秀政は深手を負って戦場を去り、のちに死んだ。子の忠脩は討死した。崩れた天王寺口は水野勝成が自ら一番槍で立て直し、明石全登は水野勢に突き掛かって姿を消した。\n四天王寺は、秀頼が建て直した五重塔ともども前の年の冬の陣で焼け、この日は焼け跡の礎石が並ぶだけだった（建て直しは元和の頃）。「真田日本一の兵」は、島津家の者が国元へ書き送った言葉として伝わる。\n茶臼山の後ろには前の日に戦った大和路勢と浅野長晟の手が控えていた。天王寺口の戦いの布陣は日本語版ウィキペディア「天王寺・岡山の戦い」と史跡の解説を手本に、地形は国土地理院の標高（上町台地）によった。';
k15_tennoji_okayama.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '毛利勝永', g: /勝永/ }, { name: '徳川家康', g: /家康/ }];

// bot の頭：近い敵を突き、段の行き先へ
k15_tennoji_okayama.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  // 岡山口の陣幕（将軍の本陣）の内に入ったまま天王寺口へ戻れず、②〜④の間ずっと止まった（11/8 通し）→ 後ろの口から出る
  if (F.step !== 'oka' && F.step >= 2 && Math.abs(u.pos.x - 30) < 8.5 && u.pos.z > 83 && u.pos.z < 98) { goTo(p, inp, 30, 101, 1); return; }
  // 命が四割を切ったら、味方の後ろの退き場まで下がって息を整え（八秒当たらずにいると戻る）、八割五分で戻る（人の遊び方と同じ）
  const R = b._k15 || (b._k15 = { rest: false });
  // 囲まれた時（十メートルの内に敵が五人より多い）は早めに退く
  let mob = 0; if (!R.rest) for (const o of b.army.units) if (o.alive && o.team !== u.team && !o.fleeing && Math.abs(o.pos.x - u.pos.x) < 9 && Math.abs(o.pos.z - u.pos.z) < 9 && ++mob > 7) break;
  if (!R.rest && (u.hp < u.maxHp * 0.65 || (mob > 5 && u.hp < u.maxHp * 0.8) || mob > 7)) R.rest = true;   // 八人より多く寄られたら、命があっても輪の外へ   // 杜では信繁を前に退かない
  if (R.rest && ((u.hp > u.maxHp * 0.8 && !b.army.nearestEnemy(u, 6, (o) => !o.fleeing)) || ((R.restT = (R.restT || 0) + 1) > 1200 && u.hp > u.maxHp * 0.5 && !b.army.nearestEnemy(u, 15, (o) => !o.fleeing)))) { R.rest = false; R.restT = 0; }   // 傷の浅いうちは追手が居る間は戻らない
  if (R.rest) {
    const back = F.step === 'oka' ? { x: 40, z: 120 } : F.step <= 1 ? { x: FRONT.x + 6, z: FRONT.z + 44 } : F.step >= 5 ? { x: YASUI.x + 40, z: YASUI.z + 50 } : { x: HON.x + 44, z: HON.z - 28 };   // 本陣の東の前（真田は北西から家康を目がけるので、東の脇は空く）
    // 陣幕の内に居たら、まず後ろの口から出る（幕の前は閉じている）
    const mx = u.pos.x - HON.x, mz = u.pos.z - HON.z;
    if (Math.abs(mx) < 9 && mz > -1 && mz < 13) { goTo(p, inp, HON.x, HON.z + 17, 1.5); return; }
    // 後ろの口から出た所で退き場（幕の南）へまっすぐ向けると、また口から幕の内へ入り前の布に当たって、内と口を行き来して百八十秒止まった（11/13 act bot・段6）→ 幕の西の脇を回る
    if (Math.abs(mx) < 12 && mz >= 13 && mz < 22 && back.z < HON.z) { goTo(p, inp, HON.x - 18, HON.z + 14, 1.5); return; }
    goTo(p, inp, back.x, back.z, 2); return;
  }
  // 受けてから突く（打ち込んで来る者を先に受ける。共通の bot の手。槍の一突きで命の半ばを失うので、打ち合いにしない）
  const hit = (e, r = 2.6) => {
    const a = strikeTarget ? strikeTarget(b, 4) : null, t = a && a !== e && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 3.5 ? a : e;
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (d > r) { goTo(p, inp, t.pos.x, t.pos.z, 2); return; }
    p.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (patientStrike) patientStrike(p, inp, t, d); else if (Math.random() < 0.5) inp.leftPressed = true;
  };
  // 0.7 麓の畦：近い物見を払い、畦で見届けてから本多の陣へ
  if (F.step === 0.7) { const e0 = b.army.nearestEnemy(u, 6, (o) => !o.fleeing && !o.invuln); if (e0) { hit(e0); return; } goTo(p, inp, DEST[0.7](b).x, DEST[0.7](b).z, 2); return; }
  // ⑤からは陣幕の内に入り込んでいたら、後ろの口から西へ出てから行き先へ（幕の前へまっすぐ歩いて幕に当たり、⑤の間ずっと本陣の内に留まった・11/8 通し）
  //   幕の外（西の際 x -49）まで内と見なすと、後ろの口へ向かって幕の西の壁に当たり、茶臼山へ行けず百八十秒止まった（11/11 act bot (-49,138)）→ 幕の布の内（x -48〜-32）だけ
  if (F.step >= 5 && Math.abs(u.pos.x - HON.x) < 8 && u.pos.z > HON.z - 2 && u.pos.z < HON.z + 16) { goTo(p, inp, u.pos.z > HON.z + 13 ? HON.x - 18 : HON.x, HON.z + 17, 1.5); return; }
  // ⑥ 茶臼山の丘の上：残兵を退けて頂へ
  if (F.step === 6) { const e6 = b.army.nearestEnemy(u, 14, (o) => !o.fleeing && !o.invuln); if (e6) { hit(e6); return; } const c6 = alive(F.shin) ? centerOf(F.shin)() : null; if (c6) { goTo(p, inp, c6.x, c6.z, 3); return; } goTo(p, inp, SHINGARI.x, SHINGARI.z + 8, 3); return; }   // 北へ退く殿を追う（行き先に立ったまま、三十八メートル先の殿を三分見ていた・11/8 通し）
  // ⑦ 殿を追って四天王寺の北に出ていたら、焼け跡と寺の森（茶臼山へまっすぐの線の上）を避け、東から回って南の道へ出てから頂へ（森の木に挟まって百秒止まった・11/9 通し）
  if (F.step === 7 && u.pos.z < -8 && u.pos.x > -80) { goTo(p, inp, -24, -4, 3); return; }
  if (F.step === 7) { const g = F.last; if (alive(g) && near(u.pos, TOP, 14)) { let q = null, qd = 1e9; for (const x of g.units) if (x.alive && !x.fleeing) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < qd) { qd = d; q = x; } } if (q && qd < 8) { hit(q); return; } } goTo(p, inp, TOP.x, TOP.z, 1.5); return; }
  // ② 大谷吉治の首を狙う（近ければ）
  if (F.step === 2 && F.otaniU?.alive && near(F.otaniU.pos, u.pos, 45)) { hit(F.otaniU); return; }
  // 天神の杜に着いた信繁を討つ（ほかの落ちる兵を追って杜を離れない）
  const N = F.nobuU;
  // 本陣の陣幕の内（幕は前が閉じ、口は後ろ）で止まったまま天神へ行けない時は、まず後ろの口から出て西へ回る（bot だけが幕に向かって百五十秒以上震えていた）
  if (F.step === 5 && u.pos.x > -49 && u.pos.x < -31 && u.pos.z > 130.5 && u.pos.z < 152) { goTo(p, inp, u.pos.z < 143 ? HON.x : -62, 148, 2); return; }
  // 信繁は主人公が天神の二十メートル内へ来るまで討てない：杜を離れた信繁を追って野に出たまま、討てずに百五十秒以上並んでいた
  if (F.step === 5 && F.atYasui && !F.yasuiReached && N?.alive && !near(u.pos, YASUI, 16)) { goTo(p, inp, YASUI.x, YASUI.z, 2); return; }
  if (sanadaEnd.bot(b, inp, goTo)) return;
  if (F.step === 5 && F.atYasui && N?.alive) {
    const d = Math.hypot(N.pos.x - u.pos.x, N.pos.z - u.pos.z);
    if (d > 2.6) { goTo(p, inp, N.pos.x, N.pos.z, 2); return; }
    p.yaw = Math.atan2(N.pos.x - u.pos.x, N.pos.z - u.pos.z);
    if (Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  // 信繁の旗本（騎馬の馬廻）は④まで手を出さない（②で馬廻に突っ込み、十秒で討たれた）
  const e = b.army.nearestEnemy(u, 12, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.invuln && o.type !== 'dummy' && (F.step === 4 || o.group !== F.nobu));
  // 二・三の段は本陣を守る：本陣から遠い敵は追わず、まず本陣の前へ戻る
  if (e && F.step >= 1 && !(F.step >= 2 && F.step <= 3 && !near(u.pos, HON, 46)) && !(F.step === 1 && !near(u.pos, FRONT, 28)) && !(Math.abs(e.pos.x - HON.x) < 11 && e.pos.z > HON.z - 2 && e.pos.z < HON.z + 15)) {   // 陣幕の内の敵は旗本に任せる（幕の内で押し包まれた）   // ①は先手の持ち場から離れて敵の只中へ追わない
    hit(e, 2.4);
    return;
  }
  // 陣幕（前が閉じ、口は後ろ）の内に入った時は後ろの口から出て、幕の西を回る（信繁を追って幕の内に入り、出られず五分止まった）
  const at = (q, r = 3) => {
    const x = u.pos.x - HON.x, z = u.pos.z - HON.z;
    if (Math.abs(x) < 9 && z > -1 && z < 13 && !(Math.abs(q.x - u.pos.x) < 8 && Math.abs(q.z - u.pos.z) < 8)) { goTo(p, inp, HON.x, HON.z + 17, 1.5); return; }
    if (Math.abs(x) < 14 && z >= 13 && z < 21 && q.z < HON.z) { goTo(p, inp, HON.x - 18, HON.z + 17, 2); return; }
    if (x > -14 && x < 0 && z > -2 && z < 21 && q.z < HON.z) { goTo(p, inp, HON.x - 18, HON.z - 4, 2); return; }
    goTo(p, inp, q.x, q.z, r);
  };
  if (F.step <= 1) { const g = (F.s1 || []).find(alive); at(g && near(g.center(), FRONT, 30) ? g.center() : FRONT, 4); return; }   // 先手の持ち場から離れた敵の群れを追って西の茶臼山の前まで流れた
  if (F.step === 2) { const g = F.s2.find(alive); at(alive(g) && near(g.center(), HONF, 30) ? g.center() : HONF, 4); return; }
  // 本陣（HON）は陣幕の内。幕の前（HONF）で受ける（幕に向かって立ち止まっていた）
  if (F.step === 3) { if (!F.umaUp) { let c = 0; for (const o of b.army.units) if (o.alive && o.team !== u.team && !o.fleeing && Math.hypot(o.pos.x - F.uma.position.x, o.pos.z - F.uma.position.z) < 8) c++; at(c > 4 ? HONF : F.uma.position, 2); return; } /* 群がる真田の只中へ飛び込まず、寄せが薄れてから起こす */ const g = F.sanada2; at(alive(g) && near(g.center(), HON, 34) ? g.center() : HONF, 4); return; }
  // ④ 守りの残り（馬廻の散った者）へ寄る（信繁の傍に立ったまま、離れた三人が残って七十秒進まなかった）
  if (F.step === 4) { let q = null, qd = 1e9; for (const g of [F.nobu, F.nobu2]) if (g) for (const o of g.units) if (o.alive && !o.fleeing && o !== F.nobuU) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < qd) { qd = d; q = o; } } if (q) { hit(q); return; } at(F.nobu.center(), 3); return; }
  at(F.atYasui && F.nobuU?.alive ? F.nobuU.pos : YASUI, 2);
};

// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方
// 討った数は戻さない（崩れて退いた兵が立ち直ると「討った 20／30」が 16 に戻った・11/8 夜の通し）。新手で数が増えた時だけ数え直す
// 11/13 K186 kaito 11/9「分母（何人中）が増えない・決めたら変えない」：段の初めに見せた分母 d を段の間は変えない。
//   新手で倒す数が増えた時は、討った割合（r0／r1）を d に掛けて見せる（段が進む時に d／d に届く）。見せる数は戻さない
KILLS.k15_tennoji_okayama = (rt) => {
  const F = rt.flags, r = killsRaw(rt);
  if (!r) return r;
  let M = F.kvM;
  if (!M || M.s !== F.step) M = F.kvM = { s: F.step, d: r[1], k: 0 };
  const k = r[0] >= r[1] ? M.d : Math.min(M.d - 1, Math.floor(r[0] * M.d / r[1]));
  M.k = Math.max(M.k, k); M.raw = r;   // 「あと一、二人」の判定（nearDone）は見せる数でなく本当の数で
  return [M.k, M.d];
};
const killsRaw = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.n1, sum(F.s1), F.n1 * 0.3);
  if (F.step === 2) return cut(F.n2, sum(F.s2), F.n2 * 0.45);   // 段の進みと同じ割（0.3 だと 34／36 まで討っても進まず、止まって見えた）
  if (F.step === 3) return cut(F.n3, sum(F.s3), F.n3 * 0.3);
  if (F.step === 4) return cut(F.n4, k15_tennoji_okayama.guards(rt), F.n4 * 0.3);
  if (F.step === 6) return cut(F.n6, sum(F.s6), F.n6 * 0.25);
  return null;
};
// 段の並び（右上の目標の一覧）。段の名は数と岡山口（'oka'）が混じるので、順の番号に直して比べる
const RANK = { 0: 0, 0.5: 0, 0.7: 0, 1: 0, oka: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7 };   // 11/13 物見の段を消した（kaito 4回「やめる」）
const atLeast = (k) => (rt) => (RANK[rt.flags.step] ?? 0) >= k;
STAGES.k15_tennoji_okayama = [['四天王寺の南で毛利勝永の先手を食い止める'], ['秀忠本陣の西口で大野治房の兵を押し返す', atLeast(1)], ['本陣の前で赤備えを止め、大谷吉治を討つ', atLeast(2)],
  ['倒れた馬印のもとで真田の二の突撃を止める', atLeast(3)], ['本陣の前で真田信繁の旗本を討つ', atLeast(4)], ['安居の天神へ追い、真田信繁を討つ', atLeast(5)], ['四天王寺の北で毛利勝永の殿を打ち破る', atLeast(6)], ['茶臼山の丘の上に上り、葵の旗を立てる', atLeast(7)]];

// 家康は歯朶具足（docs/kacchu_k15_tokugawa.md）
k15_tennoji_okayama.namedKacchu = K15_KACCHU;
// 支度の画面の布陣図の大将（敵は真田信繁。隊の並びの先頭の毛利勝永ではなく。11/9 kaito 朝の声）
k15_tennoji_okayama.introLords = ['徳川家康', '真田信繁'];
k15_tennoji_okayama.introYou = true;
// 開戦前の布陣図（docs/k15_fujinzu_ref_1109.md・docs/fujin/k15_tennoji_okayama.md）：北に大坂城、南に阿倍野。team 0＝徳川・1＝豊臣
k15_tennoji_okayama.introFujin = [
  { team: 1, name: '真田信繁', x: -106, z: 4, men: 3500 }, { team: 1, name: '毛利勝永', x: -46, z: -14, men: 6500 },
  { team: 1, name: '木村宗明', x: -84, z: -46, men: 1500 }, { team: 1, name: '大野治長', x: -30, z: -104, men: 13000 }, { team: 1, name: '大野治房', x: 40, z: -84, men: 10000 },
  { team: 0, name: '伊達政宗', x: -156, z: 54, men: 10000 }, { team: 0, name: '松平忠輝', x: -156, z: 112, men: 12000 },
  { team: 0, name: '本多忠朝', x: -46, z: 34, men: 3000 }, { team: 0, name: '浅野長重', x: -46, z: 76, men: 3000 }, { team: 0, name: '松平忠直', x: -98, z: 70, men: 15000 },
  { team: 0, name: '徳川家康', x: -40, z: 132, men: 15000 },
  { team: 0, name: '前田利常', x: 44, z: 40, men: 15000 }, { team: 0, name: '藤堂高虎', x: 92, z: 54, men: 5000 }, { team: 0, name: '細川忠興', x: 66, z: 80, men: 2000 },
  { team: 0, name: '井伊直孝', x: 26, z: 80, men: 3200 }, { team: 0, name: '徳川秀忠', x: 46, z: 124, men: 20000 },
];
k15_tennoji_okayama.introMapPlaces = [{ name: '大坂城', x: -10, z: -150 }, { name: '茶臼山', x: -150, z: 12 }, { name: '四天王寺', x: 4, z: -30 }, { name: '阿倍野', x: -78, z: 150 }];
k15_tennoji_okayama.introMapLines = [
  { kind: 'road', pts: [[-176, -150], [-150, 0], [-156, 176]] },   // 紀州街道
  { kind: 'road', pts: [[-40, -150], [-60, -20], [-46, 60], [-42, 176]] },   // 谷町口の道（左）
  { kind: 'road', pts: [[0, -150], [-20, -20], [-10, 80], [0, 176]] },   // 谷町口の道（右）
  { kind: 'river', pts: [[70, -170], [74, 0], [80, 176]] },   // 平野川
  { kind: 'road', pts: [[100, -40], [120, 80], [176, 176]] },   // 奈良街道
];
export { k15_tennoji_okayama };
export default k15_tennoji_okayama;
