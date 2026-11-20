// ======================================================================
// 徳川編 12　樫井の戦い（慶長二十年＝1615 四月二十九日。和泉国 樫井＝今の泉佐野。夏の陣の始まり）
// 筋書きの正：docs/chapter3_tokugawa.md の「12. 樫井」。手本と出所：docs/battle_refs/k12_kashii.md
// 紀州から北上した浅野長晟の軍（およそ五千）は、大野治房の先手を見つけて樫井まで退き、亀田高綱を安松に殿に残した。
// 朝八時ごろ、塙団右衛門の手（二〜三百）が熊野街道を寄せ、安松の八丁畷で戦が始まる。亀田は鉄砲で撃っては退き、敵を樫井の村へ引き寄せた。
// 樫井の村の中で両軍が入り乱れ、上田宗箇・浅野知近らが加わる。岡部則綱は横から攻めたが退き、塙と淡輪重政は討ち死に（名のある者十二人）。
// 総大将の大野治房は貝塚から動かず、戦場へ来なかった（ゲームでも出さない。AT3）。浅野長晟も川の南の本陣から出ない（AR3）。
// 亀田高綱は樫井で死なない（のちに浅野家を去り寛永まで生きた）。
// 主人公は亀田高綱の殿に加わる浅野の家老。目標は五つ（STAGES）：
//   ①八丁畷で塙の先手を討つ ②樫井の村の備えまで退く ③村に攻め入る塙・淡輪の隊を討つ ④東の田から横を突く岡部の隊を押し返す ⑤塙団右衛門を討つ
// 時間の制限は目標ごと（AP8）。負け：本人が討たれる・殿が取り残される・村を破られる・横を破られる。
// 11/3 kaito AP〜AV：見せかけの軍勢（addDistantArmy・clash・farHost）は置かず、見える兵は全部本物。旗は浅野の違い鷹の羽と豊臣の桐だけ。
//   名のある将は全員馬上で侍の旗本を連れる。兵の比：八丁畷では殿の少数で大勢を受け（苦しい所）、村で味方が揃うと浅野が多い。
// 11/4 kaito「史実どおりの布陣と流れ」：浅野長晟は川の南の本陣で床几に座り、侍の旗本に囲まれる。行き先の▼は段ごとに一か所に固定（AW3）。
//   布陣・距離・兵数比・流れの目標は docs/battle_refs/k12_kashii.md の「11/4 布陣と流れ」。A〜BK の○×は docs/check60/k12_kashii.md。
// 向き：北（−z）が貝塚・大坂の側、南（＋z）が紀州。熊野街道が南北に通り、樫井川（東西）を浅瀬で渡る。東（＋x）が和泉の山、西（−x）が海。
// 地形：樫井川の下の平野で標高の起伏はごく小さいため、国土地理院の標高は混ぜず、手で描いた形にした（tools/dem.mjs に鍵を足せば混ぜられる）。
// ======================================================================
// 11/5 n6（描いて遊んだ：docs/check60/k12_kashii.md の「11/5 n6」）：
//   右上に①〜⑤を最初から並べ、両軍の数の棒を出す（九1・九3・十二1）。目標の字は戦の間ずっと同じ（十1）。
//   八丁畷の水田に水と早苗、安松を焼く火、池の堤に伏せた鉄砲、街道沿いの樫井の村（家並みの間で乱戦）、
//   殿は撃っては退く。塙団右衛門は村の北の口から斬り込み、主人公が止めを刺した時だけ討ち取ったり（三4）。
import * as THREE from 'three';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { nobori, jinmaku, kagaribi, shogi, hut, dorui } from './props.js';
import { distToPolyline } from './world.js';
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';
import { goalsTick } from './hud_goals.js';
import { fujinRealN } from './fujin_layout.js';
import { isTouch } from './touch.js';
import { makeTownWay } from './inabayama_town_way.js';
import { revealName } from './battle_intel.js';
import * as jin12 from './k12/jindate.js';
import { k281Tick, k281Stat } from './k281_count.js';
import { keepReserve } from './k281_reserve.js';
import { DEPTH12 } from './k12/depth.js';   // 陣立ての表（army_depth.js）   // 陣立ての厚み（浅野の本隊・治房の遅れた後続）・家臣の守り・騎馬（11/8）

// ---- 名のある武将の甲冑（ここだけで足す。無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('塙団右衛門', { armor: 0x1c1a1a, lace: 0x1c1a1a, hat: 'kabuto', haori: 0, mon: 'none', flag: 'sashi:字塙団右衛門:#ece6d6:#201f1c', tack: 0x3a1a14,
  face: face({ age: 50, brow: 1.5, jaw: 1.3, beard: { mus: 1, musW: 1.2, droop: 0.6, goat: 0.8, side: 0.8, stub: 1.2 } }) });
give('岡部則綱', { armor: 0x1e1e20, lace: 0x4a4a52, hat: 'kabuto_w', haori: 0x2a2a30, mon: 'toyotomi', tack: 0x2a2a30,
  face: face({ age: 48, gaunt: 0.4, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.1, side: 0.2, stub: 0.5 } }) });
give('淡輪重政', { armor: 0x221e1c, lace: 0x6a4a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'toyotomi',
  face: face({ age: 44, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.7 } }) });
give('浅野長晟', { armor: 0x1c1a1a, lace: 0x6a4026, hat: 'kabuto', haori: 0, mon: 'asano', tack: 0x1c2438, lord: true,
  face: face({ age: 29, jaw: 1, brow: 1, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.1 } }) });
give('亀田高綱', { armor: 0x22201e, lace: 0x5a4a2a, hat: 'kabuto_t', haori: 0x2e2822, mon: 'none',
  face: face({ age: 57, beard: { mus: 0.8, musW: 1, droop: 0.4, goat: 0.2, side: 0.3, stub: 0.8 } }) });
give('上田宗箇', { armor: 0x1e1c1a, lace: 0x2a3448, hat: 'kabuto_m', haori: 0x26282e, mon: 'none',
  face: face({ age: 53, gaunt: 0.5, beard: { mus: 0.6, musW: 0.9, droop: 0.3, goat: 0.5, side: 0.4, stub: 0.6 } }) });
give('浅野知近', { armor: 0x1e2028, lace: 0x34445e, hat: 'kabuto_s', haori: 0x242c40, mon: 'none',
  face: face({ age: 40, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.3 } }) });

// ---- 場所（ゲームの座標。北が −z） ----
const YASU = { x: -4, z: -128 };             // 安松の八丁畷（亀田高綱の殿が構える畷の上）
const START = { x: -2, z: -112 };
const FORD = { x: 0, w: 26 };                // 熊野街道が川を渡る浅瀬（幅の半分）
const FORD2 = { x: 92, w: 10 };
const VILLAGE = { x: -2, z: -46 };           // 樫井の村の辻（熊野街道の両側に家並み。家には当たりがある）
const LINE = { x: 0, z: -20 };               // 村の南の端：上田宗箇・浅野知近の備え
const EAST = { x: 36, z: -42 };              // 岡部の隊が横を突いて来る村の東の口
const HATA = { x: -4, z: -80 };              // 塙団右衛門が侍衆と構える村の北の口
const POND = { x: -46, z: -80, rx: 13, rz: 9 };   // 安松と樫井の間の溜め池（東の堤に浅野の鉄砲が伏せる）
const BANK_X = -31;                          // 池の東の堤の上
const YASUMATSU = [[14, -84, 0.1], [24, -76, -0.2], [12, -70, 0.25]];   // 安松の家（亀田が退く時に焼く）
// 樫井の村の家：街道の両側に棟を街道へ向けて並べ、間に路地。裏にも一棟ずつ（街道の幅は十五間ほど空ける）
const KASHII_HOUSES = [[-12, -62, Math.PI / 2], [-12, -50, Math.PI / 2 + 0.05], [-12, -38, Math.PI / 2], [-12, -27, Math.PI / 2 - 0.04],
  [9, -60, Math.PI / 2], [9, -48, Math.PI / 2 - 0.05], [9, -36, Math.PI / 2],
  [-24, -56, 0.08], [-24, -42, -0.06], [21, -54, -0.05], [21, -40, 0.06]];
// 家の寸法と向きに合わせて角を回る。道網は一度だけ作り、兵ごとの歩き先も使い回す。
let villageWay = null;
function houseWay(army, u, want) {
  villageWay ||= makeTownWay([
    ...KASHII_HOUSES.map(([x, z, r]) => [x, z, r, 8, 5.5]),
    ...YASUMATSU.map(([x, z, r]) => [x, z, r, 7, 5]),
  ], { minZ: -226, maxZ: 226, halfX: 226 });
  return villageWay(army, u, want);
}
const RIVER = [[-230, 6], [-110, -3], [-30, 1], [40, -1], [110, 5], [230, -2]];
const ROAD = [[6, 230], [4, 150], [4, 90], [2, 30], [0, 0], [-2, -50], [-4, -120], [-4, -230]];
const ASANO_HON = { x: 6, z: 120 };          // 浅野長晟の本陣（川の南で動かない）
const FROM_N = { x: -4, z: -212 };           // 豊臣の先手が寄せて来る所（貝塚・佐野の側）
const FROM_E = { x: 150, z: -110 };          // 岡部の隊が回り込んで来る所（東の田の向こう）
const OKA_WAIT = { x: 104, z: -78 };         // 岡部の隊が控える所（蟻通の松原の陰）
const EXIT_N = { x: -4, z: -224 };           // 豊臣の退き口
// 段の目安の時間（秒）。時が尽きても負けにはしない（主人公のせいでない失敗を作らない。十一1・十二3）。史実の流れで次へ進む
// 11/18 23:15 クラウド（POSLOG 5本）：塙・淡輪は③の始めに安松の北から歩いて三十〜六十秒後に村へ着き、着いてすぐ八十秒の和らげが切れて備えが一気に討っていた（本人の手0）。
//   ③の時計は塙・淡輪が村（本人）に着いた時から数える：着く前は三十秒で止め、着いてから五十秒和らげる。百二十秒着かなければ明ける
const s3El = (r) => { const F = r.flags, e = r.t - (F.stepT || 0); return F.s3ContactT == null ? (e < 120 ? Math.min(e, 30) : 999) : Math.max(Math.min(e, 30), 30 + r.t - F.s3ContactT); };
const s3Quiet = (r) => r.flags.step === 3 && (r.flags.s3Kills || 0) < 4 && s3El(r) < 80;
const T1 = 160, T2 = 80, T3 = 120, T4 = 70;   // 11/19 クラウド：act bot で③④が刻限まで続き戦が九分余り。③ 150→120・④ 90→70秒。11/18 16:58 クラウド：② 100→80秒（act bot 3本で②が百二十〜百四十秒・戦が九〜十分）。11/18 クラウド k365-cloud-28：③ 210→150秒（act bot で③が二百秒余り・戦が九分）
// 目標の字は右上の①〜⑤・段の一覧（STAGES）・負けの札で同じ（十1：言い替えない）。場所は地図で分かる名で
const STEP_TEXT = ['',
  // 11/18 クラウド（写真）：右上の札で「斬り／込む」と語の途中で折れた。読点で切れる短い句にし、札は読点でだけ折る（keep-all）
  '八丁畷で殿と並び、塙の先手を討て',
  '撃ちながら退き、上田宗箇の備えへ戻れ',
  // 11/19 08:15 クラウド（写真 874×402・画質「高」）：④が「東の口で、／岡部の隊を押し返せ…」と人数ごと切れた（二行目は十五字まで。①の「塙の先手を討て（21／28人）」が十五字）。
  //   二行目を七字＋人数に：③「塙・淡輪を討て」・④「岡部を押し返せ」
  '村の辻で、塙・淡輪を討て',
  '東の口で、岡部を押し返せ',   // 11/18 クラウド kaito2：後ろの人数（岡部の隊 n／m人）が入りきらず「…」で切れた。「村の」を外す
  '村の北の口で、塙団右衛門を討て'];
const STEP_T = [0, T1, T2, T3, T4, 0];
// 殿が撃っては退く足場（畷の上を南へ。足場ごとに北を向いて撃つ）
const LEGS = [-110, -94, -78, -62, -44, LINE.z + 8];

const sm = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
function riverZ(x) {
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (x >= ax && x <= bx) return az + (bz - az) * (x - ax) / (bx - ax); }
  return 0;
}
// 川の両岸は低い河原と田。東は和泉の山すそへゆるく上がり、西は海へ下りる砂丘
function height(x, z) {
  const rz = z - riverZ(x);
  let h = 1.3 + 0.3 * Math.sin(x * 0.02 + 0.5) * Math.cos(z * 0.017) + 0.2 * Math.sin(z * 0.06 - x * 0.03);
  h -= 0.8 * (1 - sm(12, 36, Math.abs(rz)));
  h += 20 * sm(120, 230, x) + 1.8 * sm(30, 150, Math.abs(rz)) * sm(60, 200, x);
  h += 1.6 * sm(-150, -230, x);
  // 溜め池：すり鉢に掘り下げ、縁（とくに東の堤）を盛り上げる
  const pr = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
  if (pr < 1.6) h += -1.5 * (1 - sm(0.55, 1.0, pr)) + (0.9 + 0.7 * sm(-36, -30, x)) * sm(0.92, 1.12, pr) * (1 - sm(1.18, 1.55, pr));
  return h;
}
// 八丁畷：熊野街道の左右は水を張った田。畷（道）の上だけが乾いていて、兵は畷を寄せる（足が取られる田は避ける）
function paddy(x, z) {
  if (z < -175 || z > -92) return 0;
  const rx = x - (-4);
  if (Math.abs(rx) < 5 || Math.abs(rx) > 66) return 0;
  const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.85;
}

// 田の水面と早苗（旧暦四月末＝今の六月初め。田植えの済んだ泉州の田）。地面の絵の水は斜めから白い染みに、上からは乾いた土に見えた（11/5 n6 遊んで）。
//   水面は地表に沿う小面を一つにまとめ、早苗は立った葉を別の一つにまとめる（携帯の描く回数を抑える）
let riceTex = null;
function seedlingTex() {
  if (riceTex) return riceTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  // 水は空の明るさを映した濁りの灰緑（暗い色では遠くから黒い板に見えた。11/7 遊んで）
  // 11/19 クラウドす：#6e7666 は線形の光で一割余りの明るさになり、画質「高」で乾いた土の横に黒い四角が浮いた→空の映る濁り水の明るさへ
  g.fillStyle = '#9ca291'; g.fillRect(0, 0, 256, 256);
  // 濁りのむら
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${130 + (i * 37) % 30},${134 + (i * 17) % 22},${116 + (i * 11) % 16},0.22)`; g.beginPath(); g.arc((i * 97) % 256, (i * 61) % 256, 8 + (i * 13) % 22, 0, 7); g.fill(); }
  // 苗は水面に描かず、下の立った葉にする。繰り返す緑の格子を水面へ焼き付けない。
  riceTex = new THREE.CanvasTexture(c); riceTex.wrapS = riceTex.wrapT = THREE.RepeatWrapping; riceTex.colorSpace = THREE.SRGBColorSpace; riceTex.anisotropy = 4;
  return riceTex;
}
function paddyWater(W) {
  const pos = [], uv = [], idx = [], leaves = [], col = [];
  // 11/19 クラウドせ（K-k12【難】t300 の残り）：水面の縁が地面と一直線に切れ、野の中に暗い四角の板が浮いて見えた。
  //   本物の田は畦の泥から水へ移る。縁の一間（約一m半）を泥の色へ寄せ、水は空を映す明るさへ少し上げる（形・描く回数は同じ）
  let B = null;
  const quad = (x0, z0, x1, z1) => {
    const n = pos.length / 3;
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      pos.push(x, W.heightAt(x, z) + 0.06, z);
      uv.push(x / 7.2, z / 7.2);
      const e = Math.min(1, Math.min(x - B[0], B[1] - x, z - B[2], B[3] - z) / 1.4);
      col.push(1.18 - 0.18 * e, 1.06 - 0.06 * e, 0.84 + 0.16 * e);
    }
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  };
  for (let z = -168; z < -96; z += 12) for (let x = -70; x < 62; x += 14) {
    const cx = x + 7, cz = z + 6;
    if (paddy(cx, cz) < 0.8) continue;
    const x0 = x + 1.1, x1 = x + 12.9, z0 = z + 1.1, z1 = z + 10.9;
    B = [x0, x1, z0, z1];
    // 最低の隅に大きな板を置くと、ほかの隅と中央が地面へ埋まる。
    // 小さく区切り、実際の地表に沿わせる。設営時に一つの形へまとめる。
    for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 8; ix++)
      quad(x0 + (x1 - x0) * ix / 8, z0 + (z1 - z0) * iz / 8,
        x0 + (x1 - x0) * (ix + 1) / 8, z0 + (z1 - z0) * (iz + 1) / 8);
    // 一株を交差した二枚の細い葉で表す。材質と描く回数は田全体で一つ。
    for (let iz = 0; iz < 12; iz++) for (let ix = 0; ix < 14; ix++) {
      // 田をまたいで同じ格子が続くと敷物に見える。手植えの列を残し、株ごとに位置と葉の向きを少しずらす。
      // 設営時だけの計算で、葉の面数・材質・描く回数は増やさない。
      const seed = Math.sin(x * 12.9898 + z * 78.233 + ix * 39.346 + iz * 11.135) * 43758.5453;
      const jitter = seed - Math.floor(seed);
      const px = x0 + (ix + 0.5 + (jitter - 0.5) * 0.4) * (x1 - x0) / 14;
      const pz = z0 + (iz + 0.5 + (Math.sin(seed) * 0.2)) * (z1 - z0) / 12;
      const y = W.heightAt(px, pz) + 0.065, h = 0.18 + jitter * 0.072;
      const angle = jitter * Math.PI, dx = Math.cos(angle) * 0.09, dz = Math.sin(angle) * 0.09;
      leaves.push(px - dx, y, pz - dz, px + dx * 0.44, y + h, pz + dz * 0.44, px + dx, y, pz + dz,
        px + dz, y, pz - dx, px - dz * 0.44, y + h, pz + dx * 0.44, px - dz, y, pz + dx);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  // 照りは抑える（斜めから見て空が白く映り、白い塗料の染みに見えない程度）
  // 11/19 クラウドす：MeshStandard は空の映りの元（envMap）が無い戦で、横の乾いた田より一段暗い黒い四角の板に見えた（画質「高」874×402 の①）。
  //   地面と同じ光の受け方（Phong）にして、弱い照りだけ残す（せ の縁の泥の頂点色はそのまま）
  const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: seedlingTex(), color: 0xf2f2e6, vertexColors: true, specular: 0x30342e, shininess: 24 }));
  m.receiveShadow = true; m.userData.noMerge = true;
  const sprouts = new THREE.BufferGeometry();
  sprouts.setAttribute('position', new THREE.Float32BufferAttribute(leaves, 3)); sprouts.computeVertexNormals();
  const plants = new THREE.Mesh(sprouts, new THREE.MeshLambertMaterial({ color: 0x64813c, side: THREE.DoubleSide }));
  plants.userData.noMerge = true;
  const field = new THREE.Group(); field.add(m, plants);
  return field;
}
// 溜め池の水面（縁は盛り土に沈めて、水際を地面に任せる）
function pondWater(W) {
  const geo = new THREE.CircleGeometry(1, 40); geo.rotateX(-Math.PI / 2); geo.scale(POND.rx * 1.08, 1, POND.rz * 1.08);
  const y = W.heightAt(POND.x, POND.z) + 1.1;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2e3a33, roughness: 0.35, metalness: 0 }));
  m.position.set(POND.x, y, POND.z); m.userData.noMerge = true;
  return m;
}

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
// 生存していても深手で戦列を離れた者は、目標の残存戦力に数えない。
// 控えの将を動かす live とは分け、表示と段を進める数を同じにする。
const combatant = (u) => u.alive && !u.gone && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed;
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (combatant(u) ? 1 : 0), 0) : 0);
const sumN = (...gs) => gs.reduce((n, g) => n + aliveN(g), 0);
// 岡部本人は史実どおり退くため討てない。本人だけが残った時は、隊を撃退済みとする。
const okabeCleared = (F) => F.oka && !F.oka.units.some((u) => combatant(u) && u !== F.okaU);
// 人数だけ満たしても本人の参戦までは未達成。数の横に残る行いを示し、満数のまま止まったように見せない。
function participationLeft(rt, count) {
  if (!count || count[0] < count[1]) return '';
  const F = rt.flags;
  if (F.step === 1 && !F.vanguardJoined) return sumN(F.hana1, F.oka1) ? '安松の八丁畷で槍を合わせよ' : '安松の八丁畷へ進み、槍を構えよ';
  if (F.step === 3 && !F.villageJoined) return sumN(F.hana, F.awa) ? '村の辻で槍を合わせよ' : '村の辻へ進み、槍を構えよ';
  if (F.step === 4 && !F.eastJoined) return !okabeCleared(F) ? '東の口で岡部の隊を迎え撃て' : '村の東の口へ進み、槍を構えよ';
  return '';
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 浅野勢：黒い具足に浅野の旗（丸に違い鷹の羽）。豊臣方の浪人衆：くすんだ黒の具足に豊臣の桐
const ASA = { flag: 'asano' };
const TOY = { flag: 'toyotomi', armor: 0x2a2622 };
const asaD = (list) => list.map((s) => ({ ...s, o: { ...ASA, ...(s.o || {}) } }));
const toyD = (list) => list.map((s) => ({ ...s, o: { ...TOY, ...(s.o || {}) } }));
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
// 本陣の総大将は床几に腰を掛けたまま（army_move の陣中の座り。立つのは敵が寄った時だけ）
const seat = (u) => { if (u) u.jinchu = { standing: false, t: 99, danger: false }; };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let camHigh = 0;   // ①の始めの見下ろし（0〜1）
const k12_kashii = {
  realCap: isTouch ? 250 : 250 + fujinRealN('k12_kashii'),   // 11/19 iMac army-13（kaito「天王寺レベルの軍勢」）：パソコンは布陣の表の分を上限に足す。携帯は今まで
  botStat(b) { return k281Stat(b); },   // 11/19 クラウド kaito2：K281 の段ごとの数え（bot の記録だけ）
  // 身の回りの合戦の跡（timeslip_field.js）。樫井：四月末（今の六月初め）の初夏。青い草と田の水、押し合った跡
  timeslip: {
    // 雨の記録は無い（初夏の晴れの朝）。踏み跡の水たまりは置かない（白い塗料の染みに見えた。11/5 n6）
    wet: 0.12, pools: 0, dust: 0.3, trample: 0.35, debris: 1.2, arrows: 0.9, reeds: 0.4,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x3a4a6a, 0xdaaf3c],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  minutes: 15,
  // 11/18 20:40 クラウドさ（K-k12①【難】）：始めは本人が殿の列の十二歩後ろに立ち、肩越しのカメラの前を味方の列と幟が塞いで、畷の北の塙の先手が見えなかった。
  //   ①で槍を合わせるまでは、カメラを二m 高く・一m 半後ろへ置いて列の頭越しに北の畷を見せる（槍を合わせたら六秒ほどかけて普段の肩越しへ戻す）
  //   11/18 21:20 クラウドせ：二m・一m 半では本人（画面 y332）と七十三歩先の塙の先手（y53＝上の小さな地図の横・霧の中）の間が三十度あり、
  //   敵が画面の上の端へ逃げていた（look_phone で写した点を測った）。引きを八m にして二つの間を狭め、高さは四m（列と幟の上を越す）
  get camLift() { return camHigh * 4; },
  get camPull() { return camHigh * 8; },
  // せ：見る先を前へ延ばし、上げた目が下を向きすぎないように（player_camera.js def.camLookFar）
  get camLookFar() { return camHigh * 4.5; },
  noWake: true,
  // 11/19 K338（天王寺・岡山の物差し）：右上の地図を戻す。北の熊野街道の塙・岡部の列、南の樫井川の浅野の本隊まで入る半径
  mapBack: true, mapRange: 170,
  // 11/18 04:58 クラウド（act bot・位置の記録）：本人が段の場所から北へ離れた所（−15,−155）で、共通の新手が次々に出て本人の二十五歩内に五十〜百人。
  //   本人は逃げ続けて村へも東の口へも行けず、③④⑤で討ち取り十五。新手を出す・放つのは、本人が段の行き先の六十歩内に居る間だけ
  //   11/18 05:50 クラウド（act bot 533秒・位置の記録）：⑤で東の口の本人のまわりに共通の新手が二十〜三十人出て本人は斬り続け、三十七歩先の団右衛門に届かず刻限で味方に討たれた。
  //   ⑤（団右衛門が生きる間）は新手を出さない（団右衛門の侍衆と淡輪の手で戦う）
  //   11/18 16:00 クラウド（act bot・位置の記録）：②の退きの間に新手が四十〜六十人出て、安松の家並み (5,−91) で本人の二十五歩内に敵が九十〜百人。
  //   本人は囲まれて避け続け、②③の百四十秒で討ち取り0・無傷のまま。②は殿の退き（追手は筋書きの塙の追手と新手）なので、共通の新手は出さない
  // 11/18 18:05 クラウド（位置の記録 1755 二本）：③で放たれた共通の敵の新手が本人の二十五歩内に十一〜二十七人居て、本人は息を切らして避け続け、
  //   ③の本人の討ち取り0・0（塙・淡輪は味方が討った）。③は本人が塙・淡輪を四人討つまで（遅くとも八十秒）共通の新手を放たない・前を埋めない
  // 11/19 07:55 クラウド（act bot・位置の記録 pos2）：④の始めに村の辻 (13,−49) で共通の新手が本人の二十五歩内に三十八人放たれ、
  //   本人は④の九十秒を避け続けて討ち取り0・岡部の隊は味方が十六人討った。④は岡部の隊が横を突く筋書きの段なので、岡部が退くまで共通の新手を放たない・前を埋めない
  frontFillWhen: (r) => { const q = k12_kashii.missionPin(r), u = r.player?.u; return r.flags.step !== 2 && !s3Quiet(r) && !(r.flags.step === 4 && !r.flags.okaBack) && !(r.flags.step === 5 && !r.flags.hanaDown) && (!q || !u || dist(u.pos, q) < 60); },
  reserveRelease: (r) => { const q = k12_kashii.missionPin(r), u = r.player?.u; return r.flags.step !== 2 && !s3Quiet(r) && !(r.flags.step === 4 && !r.flags.okaBack) && !(r.flags.step === 5 && !r.flags.hanaDown) && (!q || !u || dist(u.pos, q) < 60); },
  // 11/18 16:05 クラウド（act bot・位置の記録 1553）：③で共通の新手が六十〜九十人生きていて、本人は辻へ行けず村の北東 (25,−85) で囲まれ避け続け、③の討ち取り0。
  //   ③は塙・淡輪の隊（筋書きの隊）と斬り合う段。共通の新手は二十四組→八組まで（樫井の豊臣方は先手の数千。見える兵は筋書きの隊が主）
  reserveLimit: 8,
  // 11/19 02:05 クラウド（act bot・位置の記録 pos3_2）：②③で囲まれた bot の避けが北の味方（殿の残り）へ下がり続け、
  //   本人が貝塚の側 (−4,−184)・(36,−194) まで出て③の討ち取り0・④を東の口でなく北の端で迎えた。②③で村より北に居る間は、避けて下がる先を南（村の側）にだけ取る
  botRetreatWay: (b, back) => {
    const F = b.flags, u = b.player.u;
    let q = back;
    if ((F.step === 2 || F.step === 3) && u.pos.z < VILLAGE.z - 15 && back.z < u.pos.z + 4) {
      q = b._k12Back || (b._k12Back = { x: 0, z: 0 });
      q.x = back.x + (-2 - back.x) * 0.3; q.z = u.pos.z + 6;
    }
    return b.world.def.moveWay ? b.world.def.moveWay(b.army, u, q) : q;
  },
  reserveBound: (p) => (p.z < -222 ? null : p),   // 11/18 クラウドい：新手が戦場の北の端（z -226）の外 (-64,-257) に湧き、一息で端へ飛ぶ・外に出ていた（act）
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ（AL：黄色と青を同時に出さない）
  burnFloor: 0.25,         // 11/19 02:15 クラウド（act bot 228秒 倒れ）：③で本人が亀田の焼いた安松の家 (24,−76) の火の脇で斬り合い、斬られた傷は29なのに火の熱だけで命が36→0（三十秒）。熱と咳と画面の赤みは残し、火だけでは命の四分の一より下げない（越前と同じ）
  noTravelArrow: true,     // 移動案内の足元・画面端の矢印も出さず、行き先の▼に揃える（五3・BH6）
  compactIntro: true,
  introText: () => '安松の八丁畷で殿を務め、塙団右衛門の先手を樫井の村まで引き寄せて討て。',
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  foeMarks: true,
  // 通し確認：目前の赤い印で村の戦いを覆わない。実兵と軽い軍勢の印に同じ上限を掛ける。
  foeSignMaxPixels: 20,
  enemySignMaxPixels: 20,
  // 控えの将も敵の所属は見せる。攻撃を受け付ける指定とは分ける。
  foeMarkVisible: (rt, u) => u === rt.flags.hanaU || u === rt.flags.awaU,
  nameTagLimit: 7,        // 亀田・上田・知近・長晟・塙・淡輪・岡部の名を、近い二人だけの枠で消さない（九3・五2）
  waitForPortrait: true,  // 顔が撮れるまで影を出さず、撮れた顔を一度だけ表示する（五6）
  stageGoalsOnly: true,    // 目標は五つの段だけ（「敵を何人討つ」で埋めない。三1）
  goalsAllRows: true,      // 共通の札にも五行を作らせる。表示用の指定だけでは残り四行が作られない。
  goalsKeepCompleted: true, // 塙の討死後も一覧と兵数を同じ札に残し、淡輪の斬り込みと締めまで崩さない。
  // 戦の途中の保存（battle_checkpoint.js・kaito 11/8）：段の始まりを toStep を順に流して作り直す（前の段の声・見出しは出さない）
  resumeSteps: [1, 2, 3, 4, 5].map((n) => [n, function (rt) { rt.flags.holdPlayer = false; if (n >= 3) this.bringUp(rt); this.toStep(rt, n); }]),
  resumeAt: (rt, n) => { const p = [null, YASU, LINE, VILLAGE, EAST, VILLAGE][n]; return p ? { x: p.x, z: p.z + 14, heading: Math.PI } : null; },
  playerAtkMax: 3,
  playerTaken: 0.45,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 見出しは「〇〇、討ち取ったり」と勝ち負けだけ（五1・五3）。一騎打ち・敵将が倒れた・塙と淡輪の「討たれた」は、討ち取ったりと重ねない
  // 家の箱の中へ入ったカメラを、主人公のいる側の壁の外へ出す（根来の clampCamera と同じ作り）
  clampCamera(rt, pos) {
    const B = rt.flags.camBoxes, pu = rt.player && rt.player.u;
    if (!B || !pu) return;
    const ox = pos.x, oy = pos.y, oz = pos.z;
    // カメラが家の向こう側へ抜けた場合も、視線が最初に当たる壁の手前で止める。
    // 終点だけの判定では、両端が屋外でも壁が画面を覆っていた。
    const eyeY = pu.pos.y + 1.5;
    let stop = 1;
    for (const b of B) {
      const gx = pu.pos.x - b.x, gz = pu.pos.z - b.z;
      const q0 = gx * b.c - gz * b.s, q1 = gx * b.s + gz * b.c;
      // 軒の余白に本人がいる場合は、下の押し出しで処理する。
      if (Math.abs(q0) < b.hw && Math.abs(q1) < b.hd && eyeY >= b.y0 && eyeY <= b.y1) continue;
      const dx = pos.x - pu.pos.x, dz = pos.z - pu.pos.z;
      let enter = 0, leave = stop;
      for (let axis = 0; axis < 3; axis++) {
        const start = axis === 0 ? q0 : axis === 1 ? q1 : eyeY;
        const delta = axis === 0 ? dx * b.c - dz * b.s : axis === 1 ? dx * b.s + dz * b.c : pos.y - eyeY;
        const lo = axis === 0 ? -b.hw : axis === 1 ? -b.hd : b.y0;
        const hi = axis === 0 ? b.hw : axis === 1 ? b.hd : b.y1;
        if (Math.abs(delta) < 0.000001) {
          if (start < lo || start > hi) { leave = -1; break; }
        } else {
          const a = (lo - start) / delta, z = (hi - start) / delta;
          enter = Math.max(enter, Math.min(a, z)); leave = Math.min(leave, Math.max(a, z));
        }
        if (enter > leave) break;
      }
      if (enter <= leave && enter > 0) stop = Math.min(stop, Math.max(0, enter - 0.2 / Math.max(0.001, Math.hypot(dx, pos.y - eyeY, dz))));
    }
    if (stop < 1) {
      pos.x = pu.pos.x + (pos.x - pu.pos.x) * stop;
      pos.y = eyeY + (pos.y - eyeY) * stop;
      pos.z = pu.pos.z + (pos.z - pu.pos.z) * stop;
    }
    for (const b of B) {
      if (pos.y < b.y0 || pos.y > b.y1) continue;
      const fx = pos.x - b.x, fz = pos.z - b.z;
      let p0 = fx * b.c - fz * b.s, p1 = fx * b.s + fz * b.c;
      if (Math.abs(p0) >= b.hw || Math.abs(p1) >= b.hd) continue;
      const gx = pu.pos.x - b.x, gz = pu.pos.z - b.z, q0 = gx * b.c - gz * b.s, q1 = gx * b.s + gz * b.c;
      if (Math.abs(q0) >= b.hw && (Math.abs(q1) < b.hd || Math.abs(q0) - b.hw > Math.abs(q1) - b.hd)) p0 = Math.sign(q0) * (b.hw + 0.15);
      else if (Math.abs(q1) >= b.hd) p1 = Math.sign(q1) * (b.hd + 0.15);
      // 軒の余白に本人がいる時も、カメラを壁の内側に残さない。
      // 本人は家の外でも、余白を含む箱の内側になるため、近い側の面へ出す。
      else if (Math.abs(q0) / b.hw >= Math.abs(q1) / b.hd) p0 = (Math.sign(q0) || 1) * (b.hw + 0.15);
      else p1 = (Math.sign(q1) || 1) * (b.hd + 0.15);
      pos.x = b.x + p0 * b.c + p1 * b.s; pos.z = b.z - p0 * b.s + p1 * b.c;
    }
    // 11/18 21:00 クラウド（物差し⑥の②）：④の東の口で、カメラが家の壁のすぐ横（軒の箱の外・一歩内）に付き、画面の左三分の一を壁と庇が覆った。
    //   壁の横に付いたカメラは、本人の居る側（街道・広場）へ壁から二歩半まで離す。本人の方が壁に近い時は動かさない（壁の向こうへ押し出さない）
    const E = 2.4;
    for (const b of B) {
      if (pos.y > b.y1 + 1.5) continue;
      const fx = pos.x - b.x, fz = pos.z - b.z;
      let p0 = fx * b.c - fz * b.s, p1 = fx * b.s + fz * b.c;
      const o0 = Math.abs(p0) - b.hw, o1 = Math.abs(p1) - b.hd;
      if (o0 >= E || o1 >= E || (o0 < 0 && o1 < 0)) continue;
      const gx = pu.pos.x - b.x, gz = pu.pos.z - b.z, q0 = gx * b.c - gz * b.s, q1 = gx * b.s + gz * b.c;
      if (o0 >= o1) { if (Math.sign(q0) !== Math.sign(p0) || Math.abs(q0) - b.hw <= o0 + 0.3) continue; p0 = Math.sign(p0) * (b.hw + Math.min(E, Math.abs(q0) - b.hw)); }
      else { if (Math.sign(q1) !== Math.sign(p1) || Math.abs(q1) - b.hd <= o1 + 0.3) continue; p1 = Math.sign(p1) * (b.hd + Math.min(E, Math.abs(q1) - b.hd)); }
      pos.x = b.x + p0 * b.c + p1 * b.s; pos.z = b.z - p0 * b.s + p1 * b.c;
    }
    // 11/19 クラウドさ（K-k12【難】・325秒の写真）：③〜⑤の村で家の脇を通ると、壁よけでカメラが本人から一〜二m まで寄るのに高さは三〜四m のまま残り、
    //   真上から見下ろして家の壁と屋根の透かしが画面の左半分を覆った（描かずに測って③〜⑤で七十八コマ）。
    //   家の近くでカメラが寄った時だけ、寄った分だけ低くして肩越しの目の高さへ下ろす（本人と家の間の空いた所なので壁は挟まらない）
    const hx = pos.x - pu.pos.x, hz = pos.z - pu.pos.z, hd = Math.hypot(hx, hz);
    if (hd < 2.6) {
      let nearHouse = false;
      for (const b of B) {
        const fx = pu.pos.x - b.x, fz = pu.pos.z - b.z;
        if (Math.abs(fx * b.c - fz * b.s) < b.hw + 3 && Math.abs(fx * b.s + fz * b.c) < b.hd + 3) { nearHouse = true; break; }
      }
      if (nearHouse) pos.y = Math.min(pos.y, eyeY + 0.3 + 0.45 * hd);
      // 11/19 クラウドす（K-k12【難】・325秒の写真の続き）：家と家の間の小路（幅四m）では、高いカメラの線が軒に当たって本人の一m 余り後ろまで寄せられ、
      //   低くしても本人の背を真上から見下ろす画のままだった（測って 横1.2m・高さ2.5m）。軒の下の目の高さなら小路の向きに線が通るので、
      //   同じ向きのまま、軒の箱（余白つき）に当たらない所まで三〜四m 引いて肩越しに戻す
      if (nearHouse && hd > 0.05) {
        const ux = hx / hd, uz = hz / hd, ly = eyeY + 0.3;
        const blocked = (x, y, z) => {
          for (const b of B) {
            const gx = pu.pos.x - b.x, gz = pu.pos.z - b.z;
            const q0 = gx * b.c - gz * b.s, q1 = gx * b.s + gz * b.c;
            const dx = x - pu.pos.x, dz = z - pu.pos.z, dy = y - eyeY;
            const d0 = dx * b.c - dz * b.s, d1 = dx * b.s + dz * b.c;
            // 本人が軒の余白の内に立つ家は、余白を除いた壁の箱で見る（壁から離れる向きなら引ける）
            const m = Math.abs(q0) < b.hw && Math.abs(q1) < b.hd ? 1.1 : 0;
            let enter = 0, leave = 1;
            for (const [s0, dd, lo, hi] of [[q0, d0, m - b.hw, b.hw - m], [q1, d1, m - b.hd, b.hd - m], [eyeY, dy, b.y0, b.y1]]) {
              if (Math.abs(dd) < 1e-6) { if (s0 < lo || s0 > hi) { leave = -1; break; } continue; }
              const a = (lo - s0) / dd, c = (hi - s0) / dd;
              enter = Math.max(enter, Math.min(a, c)); leave = Math.min(leave, Math.max(a, c));
            }
            if (enter <= leave) return true;
          }
          return false;
        };
        for (const R of [4.2, 3.6, 3.0]) {
          if (R <= hd + 0.3) break;
          const x = pu.pos.x + ux * R, z = pu.pos.z + uz * R, y = Math.max(ly, rt.world.heightAt(x, z) + 0.65);
          if (!blocked(x, y, z)) { pos.x = x; pos.y = y; pos.z = z; break; }
        }
      }
    }
    // 11/19 クラウドす（K-k12【難】・325秒の写真の二枚目）：上の押し出しが重なると、カメラが隣の家の屋根の中・土壁のすぐ前に残り（画面いっぱいの連子窓）、
    //   家の前を歩くと軒の余白をかすめただけで本人の頭まで寄り切った（描かずに測って 道の上の一万七百通りのうち 屋根や壁の中121・一m 半より近い792）。
    //   最後に、壁（地面から二m 八十五まで）と屋根（軒の余白つき・五m 半まで）に当たらず本人の目まで線が通るかを見て、だめなら
    //   同じ向き（左右へ少しずつ振る）で、遠い所・高い所から順に空いた所を探して置き直す
    {
      const solid = (x, y, z) => {
        for (const b of B) {
          const g = b.y0 + 1; if (y < g - 0.5 || y > g + 5.5) continue;
          const fx = x - b.x, fz = z - b.z, p0 = Math.abs(fx * b.c - fz * b.s), p1 = Math.abs(fx * b.s + fz * b.c);
          const m = y < g + 2.85 ? 1.1 : 0;
          if (p0 < b.hw - m && p1 < b.hd - m) return true;
        }
        return false;
      };
      const ex = pu.pos.x, ez = pu.pos.z;
      const clear = (x, y, z) => {
        const L = Math.hypot(x - ex, y - eyeY, z - ez), n = Math.max(2, Math.ceil(L / 0.3));
        for (let i = 2; i <= n; i++) { const t = i / n; if (solid(ex + (x - ex) * t, eyeY + (y - eyeY) * t, ez + (z - ez) * t)) return false; }
        return true;
      };
      if (Math.hypot(pos.x - ex, pos.z - ez) < 2.2 || !clear(pos.x, pos.y, pos.z)) {
        const vx = ox - ex, vz = oz - ez, R0 = Math.max(2.4, Math.hypot(vx, vz)), a0 = Math.atan2(vx, vz), top = Math.max(eyeY + 0.3, oy);
        let got = null;
        for (const da of [0, 0.3, -0.3, 0.6, -0.6]) {
          const sa = Math.sin(a0 + da), ca = Math.cos(a0 + da);
          for (let R = R0; R >= 2.2 && !got; R -= 0.5) {
            for (let y = top; y >= eyeY + 0.2 && !got; y -= 0.5) {
              const x = ex + sa * R, z = ez + ca * R, yy = Math.max(y, rt.world.heightAt(x, z) + 0.65);
              if (clear(x, yy, z)) got = [x, yy, z];
            }
          }
          if (got) break;
        }
        if (got) { pos.x = got[0]; pos.y = got[1]; pos.z = got[2]; }
      }
      // 11/19 クラウドす（K-k12【難】・④の230秒の写真 fuda_0820_ato）：馬上では共通の肩の選び直し（clearWallView）が効かず、
      //   東の口へ向かう小路で、カメラが家の横の壁に沿って付き、壁が画面の右半分を覆った。
      //   画面の横を左右三本ずつの線で八歩先まで見て、片側の壁が二本以上を塞ぐ時だけ、本人への向きはそのまま反対の側へ半歩ずつ（三歩まで）ずらす（写真で壁が画面の右四割→三割弱）
      const cam = rt.camera, cx = pu.pos.x - pos.x, cz = pu.pos.z - pos.z, cd = Math.hypot(cx, cz);
      if (cam && cd > 0.5) {
        const fx = cx / cd, fz = cz / cd, rx = -fz, rz = fx, tw = Math.tan(cam.fov * Math.PI / 360) * cam.aspect;
        const side = (x, y, z) => {
          let L = 0, R = 0;
          for (const k of [-0.9, -0.6, -0.3, 0.3, 0.6, 0.9]) {
            const sx = fx + rx * k * tw, sz = fz + rz * k * tw, n = Math.hypot(sx, sz);
            for (let d = 0.6; d <= 8; d += 0.6) if (solid(x + sx / n * d, y, z + sz / n * d)) { if (k < 0) L++; else R++; break; }
          }
          return [L, R];
        };
        const [L0, R0] = side(pos.x, pos.y, pos.z);
        if (Math.max(L0, R0) >= 2 && L0 !== R0) {
          const sg = R0 > L0 ? -1 : 1, bx = pos.x, by = pos.y, bz = pos.z;
          let worst = Math.max(L0, R0);
          for (let s = 0.5; s <= 3; s += 0.5) {
            const x = bx + rx * sg * s, z = bz + rz * sg * s, y = Math.max(by, rt.world.heightAt(x, z) + 0.65);
            if (solid(x, y, z) || !clear(x, y, z)) break;
            const [L, R] = side(x, y, z);
            if (Math.max(L, R) < worst) { worst = Math.max(L, R); pos.x = x; pos.y = y; pos.z = z; if (!worst) break; }
          }
        }
      }
    }
  },
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵将が倒れた' && !/^(塙団右衛門|淡輪重政)が討たれた/.test(t),
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっていて動かない（AW3・BK4）。塙の段だけ本人の上
  missionPin(rt) {
    const F = rt.flags;
    // 最初の下知を聞く間も①は出ているので、同じ八丁畷の印を消さない。
    if (F.ending) return null;
    let p = YASU;
    if (F.step === 2) p = LINE;
    else if (F.step === 3) p = VILLAGE;
    // ④も目標に書いた東の口へ固定する。岡部には東の口への攻撃命令を出し、印で主人公を田へ引き離さない。
    else if (F.step === 4) p = EAST;
    // 塙の討死後も淡輪の斬り込みは操作中。死んだ塙に印を残さず、迎え撃つ村の辻を示す。
    else if (F.step === 5) p = F.hanaDown ? VILLAGE : F.hanaU?.alive ? F.hanaU.pos : HATA;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 ? 12 : 8;
    return PIN;
  },
  // 右上の目標：①〜⑤を最初から全部並べ、済んだ物に印（九1・十1）。時の数字は出さない（時が尽きても負けにしない）
  goals5() {
    return STEP_TEXT.slice(1).map((text, k) => ({ kind: 'stage', k, text,
      // 段を進める数と同じ表を使う。名前から控えの別隊まで数え直さない。
      count: (rt) => rt.flags.step === k + 1 ? KILLS.k12_kashii(rt) : null,
      check: (rt) => (k < 4 ? (rt.flags.step || 0) >= k + 2 : !!rt.flags.hanaDown && !!rt.flags.hanaByMe) }));
  },
  // 共通の任務札は今の一行だけなので、目標の札（hud_goals）で置き換え、両軍の兵の数の棒（armybar）も上に出す（九1・九3・十二1）。
  //   真田丸（b_k11_sanadamaru.js）と同じ作り。戦が終われば元へ戻す
  goalsHud(rt) {
    const hud = rt.hud;
    if (!hud || !hud.root || typeof document === 'undefined') return;
    hud.root.classList.add('kashii-goals');
    const st = document.createElement('style');
    st.textContent = `
html:root body #hud#hud#hud#hud#hud.kashii-goals #armybar#armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud#hud#hud.kashii-goals #armybar#armybar .gauge.one { display:block !important; grid-column:1 / -1; width:100%; }
html:root body #hud#hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; }
html:root body #hud#hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals .goals-toggle { display:none !important; }
html:root body #hud#hud#hud.kashii-goals #armybar .clock { visibility:hidden !important; }
html:root body #hud#hud#hud.kashii-goals #center-call#center-call { top:calc(54px + env(safe-area-inset-top,0px)) !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.kashii-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; word-break:keep-all; overflow-wrap:anywhere; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em.tm) { display:none !important; }`;
    document.head.appendChild(st);
    const hudProgress = hud.progress;
    hud.progress = function (battle) {
      const out = hudProgress.call(this, battle);
      if (battle === rt && this.prog && !rt.over) {
        goalsTick(this.prog, rt);
        const count = KILLS.k12_kashii(rt);
        const em = this.prog.querySelector('.pg-goals li.now em:not(.tm)');
        if (count && em) {
          const left = participationLeft(rt, count);
          const text = `（${count[0]}／${count[1]}人${left ? '・' + left : ''}）`;
          if (em.textContent !== text) em.textContent = text;
        }
      }
      return out;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.progress = hudProgress;
      if (hud.prog) hud.prog.classList.remove('goal-mode');
      hud.root.classList.remove('kashii-goals'); st.remove();
      return dispose.call(this);
    };
  },
  // 戦の前と後の会話（docs/chapter3_tokugawa.md の 12）
  talk: {
    before: [['亀田高綱', '佐野の北に塙と岡部の旗。先を争って、熊野街道を寄せて来る'], ['使番', '但馬守様の御下知。本隊は樫井の村にて構える。亀田殿は安松にて殿を'],
      ['亀田高綱', '承った。畷は一筋、田は足を取る。鉄砲を前へ。撃っては退き、敵を樫井まで引き寄せるぞ']],
    after: [['浅野長晟', '団右衛門も淡輪も果てたか。……亀田、ようも殿を務めた'], ['亀田高綱', '治房の本隊は貝塚から来ませなんだ。先手だけが突き出たのが、敵の負けにござる'],
      ['上田宗箇', '団右衛門を突き崩したのは、この宗箇の手の者ぞ'], ['亀田高綱', '何を申される。殿で引き付けたればこそ、団右衛門も討てたのじゃ']],
  },
  world: {
    moveWay: houseWay,
    fleeWay: houseWay,
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 16150429,
    time: 'day',
    // 南（＋z）の和泉山脈は東西につながる稜線。海側と北側は低く開ける。
    mountainProfile(a, layer) {
      const south = Math.pow(Math.max(0, Math.cos(a)), 0.55);
      const ridge = 25 + layer * 13 + Math.sin(a * 7 + layer * 0.6) * 5
        + Math.sin(a * 13 - layer * 0.4) * 2.5 + Math.cos(a * 21) * 1.2;
      return 2 + south * ridge;
    },
    mountainStreak: 0.25,
    // 11/18 21:05 クラウド（物差し⑥・初めての人の目）：風の向きを決めていなかったので共通の南寄りの風になり、幟が南北に流れて、
    //   北を向いて戦う本人の目には布が真横から薄く見え、竿だけが電柱のように立って見えた（t10 の右の竿）。
    //   当日の風は記録に無い。朝なので山すそ（東）から海（西）へ吹く陸風に推し、布を東西へ流して北からも南からも広く見せる
    wind: [-0.95, -0.25],
    mist: 0.3,
    // 11/18 クラウドす K-k12【難】：朝霧（史実）は残し、見通しの上限だけ共通の八十歩→百四十歩へ（姉川・森部と同じ）。
    //   八十歩の霞に携帯の七割が掛かって六十四歩で白く切れ、畷の二十六歩先の塙の先手が影も無かった（su_2050_spawn34_t18）。兵数は増やさない
    battleViewDistance: 140,
    // 11/18 22:00 クラウドさ（K-k12①【難】の残り・朝霧で遠い敵が淡い）：mist の見通しは共通で九十五歩へ寄せられ、上の百四十歩を始めの一分ほど打ち消して
    //   七十歩先の塙・岡部の先手が白く消えていた。朝霧は地面の靄（groundMistScale）と遠い山の霞で残し、見通しの寄せ先だけ百四十歩に（霧が畷の上で晴れていく形）
    mistFar: 140,
    // 11/18 クラウドせ（K-k12①）：mist は真偽で読まれ、始めの九十秒は野の靄が最も濃い六十枚になって畷の先を白く隠した。朝霧は残し、靄の数だけ四割に
    groundMistScale: 0.4,
    // 11/18 22:00 クラウド（物差し⑥ t201 の①）：カメラのすぐ前の味方の槍の柄が、画面の左上から下まで斜めに横切った（共通の透かしは柄に掛からない）。
    //   視点から四歩半の内の味方の長柄・竿・幟だけ描く間避ける（敵の槍は構えと間合いを見せるため残す）
    //   11/19 03:00 クラウドす：見下ろしでは六歩先の味方の幟の竿が画面を縦に割った→天王寺・大河内と同じ十歩の内まで避ける
    nearLongWeaponRadius: 10,
    nearEnemyWeaponSolid: true,
    // 11/19 クラウドす：それでも敵の長柄・十歩より先の竿が見下ろしで画面を縦に割る（su_1119_t250）→画面を割る竿だけ描く間避ける（狙いの相手の得物は残す）
    nearScreenSplitPole: true,
    nearFlagScreenArea: 0.05,   // 11/19 クラウドす：東の口の240秒、近い旗持ちの隊旗が灰色の板として画面の右を覆った→真田丸と同じ五分を越えて写る近い幟・隊旗を描く間避ける
    groundHalf: 235,
    moveLim: 226,
    height,
    paddy,
    fieldStage: 'seedling',  // 旧暦四月末：田植えの済んだ水田
    patchyGround: true,
    noGroundRipples: true,
    riverCross: true,
    wadeDepth: 0.85,
    streams: [{ pts: RIVER, w: 12, depth: 1.5, fords: [FORD, FORD2] }],
    paths: [{ pts: ROAD, w: 3.4 }],
    // 旧暦四月二十九日（今の六月初め）：水を張った田、濃い草
    tint(x, z, h, c) {
      const a = Math.sin(x * 0.05 + 1.1) * Math.cos(z * 0.04 - 0.4);
      const k = 0.5 + 0.5 * a;
      if (h < 3.2 && Math.abs(x) < 120) c.setRGB(c.r * (0.7 + k * 0.2), c.g * (0.9 + k * 0.2), c.b * (0.62 + k * 0.2));
      else c.setRGB(c.r * (0.8 + k * 0.2), c.g * (0.9 + k * 0.2), c.b * (0.78 + k * 0.2));
    },
    // 安松〜樫井の両側の松原（東に蟻通の松原、西に樫井の松原が海まで続く。現地の史跡碑）。杉や傘のような木は置かない
    groves: [
      { x: -130, z: 30, r: 28, n: 60, kind: 'matsu' }, { x: -150, z: -60, r: 26, n: 50, kind: 'matsu' },
      { x: -96, z: -130, r: 22, n: 40, kind: 'matsu' }, { x: 96, z: -120, r: 22, n: 40, kind: 'matsu' },
      { x: 120, z: -40, r: 24, n: 44, kind: 'matsu' }, { x: 150, z: 60, r: 24, n: 50, kind: 'matsu' },
      { x: 62, z: 150, r: 14, n: 18, kind: 'matsu' },
    ],
    pineOnly: true,          // 林の外の木と、その周りに足す木も松に揃える（杉・竹を混ぜない）
    treeMix: { sugi: 0, matsu: 1 },
    trees: 150,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 14 || Math.abs(z - riverZ(x)) < 22 || paddy(x, z) > 0 || dist({ x, z }, VILLAGE) < 34 ||
      Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1.7 || dist({ x, z }, { x: 18, z: -77 }) < 16 ? 0.05 : 0.6),
    clear: (x, z) => distToPolyline(x, z, ROAD) < 10 || Math.abs(z - riverZ(x)) < 24,
    fleeOut: (x, z, team) => (team === 1 ? z < -218 : z > 228),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    // 11/19 クラウドさ（K-k12【難】・す の t250 の残り）：討たれた旗持ちの幟の布が、手前の草の上に寝た黒い長い板に見えた。道明寺・木津川口と同じく、落ちた幟は竿だけ残し布を隠す
    { const A = rt.army, dw = A.dropWeapon; if (dw) A.dropWeapon = function (u) { dw.call(this, u); if (u.dropped?.userData?.standard && u.standardFlag && u.dropped.parent === this.scene) u.standardFlag.visible = false; }; }
    // 下知は歩きながら聞く。八丁畷へ向かう操作を冒頭の台詞で止めない。
    F.step = 0; F.holdPlayer = false; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0;
    // 樫井の村：熊野街道の両側に家並み（街道沿いの村。家には当たりがあり、カメラも壁で止まる）。畑の箱・竹林・炊事の煙は置かない
    //   （住む者は逃げた後。11/5 n6：緑の箱の畑・傘を重ねたような竹が作り物に見えた）
    //   カメラは家の壁と屋根で止める（茅葺きの中へめり込まない。十一2）
    for (const [x, z, r] of KASHII_HOUSES) { const h = hut(W, x, z, 8, 5.5, r, { groundedHome: true }); h.traverse((m) => { if (m.isMesh) m.userData.camBlock = true; }); rt.scene.add(h); }
    // 安松の家（亀田が退く時に火を放つ）・溜め池と東の堤・田の水面と早苗
    // 安松の家もカメラを壁と屋根で止める（燃える家の中にカメラが入った。11/7 遊んで）
    F.yasuHouses = YASUMATSU.map(([x, z, r]) => { const h = hut(W, x, z, 7, 5, r, { groundedHome: true }); h.traverse((m) => { if (m.isMesh) m.userData.camBlock = true; }); rt.scene.add(h); return { x, z, r }; });
    rt.scene.add(paddyWater(W), pondWater(W));
    // 家の中へカメラが入らないよう、壁と軒の箱で外へ押し出す（11/6 遊んで：村の辻と東の口で家の中・屋根の上から写った）
    F.camBoxes = [...KASHII_HOUSES.map(([x, z, r]) => [x, z, r, 8, 5.5]), ...YASUMATSU.map(([x, z, r]) => [x, z, r, 7, 5])].map(([x, z, r, w, d]) => {
      const y = W.heightAt(x, z); return { x, z, c: Math.cos(r), s: Math.sin(r), hw: w / 2 + 1.1, hd: d / 2 + 1.1, y0: y - 1, y1: y + 7.5 };
    });
    { const g = dorui(W, [BANK_X + 1.5, POND.z - 10, BANK_X + 1.5, POND.z + 10], 1, 0, { w: 2.4, h: 0.55 }); if (g && !g.isBatchedPart) rt.scene.add(g); }
    rt.scene.add(jinmaku(W, ASANO_HON.x, ASANO_HON.z + 2, 14, 10, 4, { mon: 'asano' }));
    rt.scene.add(shogi(W, ASANO_HON.x, ASANO_HON.z - 0.6, Math.PI));
    for (const [x, z] of [[ASANO_HON.x - 10, ASANO_HON.z + 2], [ASANO_HON.x + 22, ASANO_HON.z + 4], [LINE.x - 22, LINE.z + 6], [LINE.x + 20, LINE.z + 6], [YASU.x + 8, YASU.z + 8]]) rt.scene.add(nobori(W, x, z, 'asano', 6));
    // 11/18 クラウド（物差し③幟の林）：浅野の上田・知近の備えの後ろに幟を並べ、北の貝塚の方には樫井へ来なかった大野治房の本隊の幟だけを遠く立てる（布陣図 {26,−200}・兵は置かない＝K285）
    [-31, -22, -13, 13, 22, 31].forEach((dx, i) => rt.scene.add(nobori(W, LINE.x + dx, LINE.z + 9 + (i % 2) * 2.5, 'asano', 6)));   // 街道（x≈0）の上は空ける
    for (let i = 0; i < 9; i++) rt.scene.add(nobori(W, 26 - 20 + i * 5 + (i % 3) * 0.7, -200 - (i % 2) * 4 - (i % 3), 'toyotomi', 6.5));
    for (const [x, z] of [[ASANO_HON.x + 4, ASANO_HON.z - 6]]) rt.scene.add(kagaribi(W, x, z));
    // 亀田高綱の殿（安松の八丁畷）と主人公の手勢。鉄砲が多い（撃っては退く）
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 4 }, facing: Math.PI, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      asaD([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 5 }]));
    F.kame = allyGroup(rt, { faction: 'tokugawa', name: '亀田高綱の殿', fullStrength: true, fixed: true, anchor: { x: YASU.x, z: YASU.z + 4 }, facing: Math.PI, width: 6, aggro: 12, speed: 3.6, order: 'hold', noRout: true, defMult: 1.3 },
      asaD([{ type: 'busho', n: 1, o: { name: '亀田高綱', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 10 }, { type: 'ashigaru', n: 8 }]));
    // 樫井の村の南の端で待つ浅野の備え（上田宗箇・浅野知近）
    F.ueda = allyGroup(rt, { faction: 'tokugawa', name: '上田宗箇の手', fullStrength: true, fixed: true, anchor: { x: LINE.x + 16, z: LINE.z }, facing: Math.PI, width: 9, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      asaD([{ type: 'busho', n: 1, o: { name: '上田宗箇', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }]));
    F.tomo = allyGroup(rt, { faction: 'tokugawa', name: '浅野知近の手', fullStrength: true, fixed: true, anchor: { x: LINE.x - 16, z: LINE.z }, facing: Math.PI, width: 9, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      asaD([{ type: 'busho', n: 1, o: { name: '浅野知近', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }]));
    // 浅野長晟の本陣：川の南（信達の側）の陣幕の中で床几に座り、侍の旗本に囲まれて前に出ない（O・AR3・AV7）
    F.honjin = allyGroup(rt, { faction: 'tokugawa', name: '浅野長晟の本陣', fullStrength: true, fixed: true, anchor: { x: ASANO_HON.x, z: ASANO_HON.z }, facing: Math.PI, width: 8, aggro: 0, seekRange: 10, order: 'hold', noRout: true },
      asaD([{ type: 'busho', n: 1, o: { name: '浅野長晟', invuln: true, horse: false } }, { type: 'samurai', n: 22 }, { type: 'gun', n: 4 }]));
    seat(F.honjin.units.find((u) => u.name === '浅野長晟'));
    // 池の堤に伏せた浅野の鉄砲（亀田の手。退く殿を追う敵の横腹を撃つ）。堤の上で膝をつき、街道を向く
    F.pondGuns = allyGroup(rt, { faction: 'tokugawa', name: '池の堤の鉄砲', fullStrength: true, fixed: true, anchor: { x: BANK_X, z: POND.z }, facing: Math.PI * 0.62, width: 2, aggro: 34, seekRange: 0, order: 'hold', noRout: true },
      asaD([{ type: 'gun', n: 8 }, { type: 'samurai', n: 1 }]));
    F.pondGuns.units.forEach((u, i) => { u.pos.x = BANK_X + (i % 2) * 0.8; u.pos.z = POND.z - 8 + i * 2; if (u.type === 'gun') u._crouch = true; });
    // 殿だけが自分で動く。上田・知近の備えは③まで村の南の端で構えたまま（八丁畷は殿の少ない手で受ける。一1）
    F.kame.ai = true;
    // 目標に名を書いた敵将は、右上の一行・頭上の名で伏せない（「見えぬ敵の陣を物見する」に化けさせない・十1）
    for (const n of ['塙団右衛門', '淡輪重政', '岡部則綱']) revealName(rt, n);
    this.goalsHud(rt);
    // ①は話の間から右上に出す（目標の表に無い「味方の旗へ」を出さない・九1）
    rt.obj('s1', STEP_TEXT[1], 'main');
    // 11/18 20:50 クラウドさ（K-k12①）：話の間（〜十秒）に畷の北に敵が一人も見えず、大軍対大軍に見えなかった（塙の先手は①に入ってから八十歩北に湧いていた）。
    //   話の初め「佐野の北に塙と岡部の旗」の通り、塙の先手は始めから畷の六十歩北（z−188）に旗を並べて構え、①で寄せに移る
    F.hana1 = this.foe(rt, '塙の先手', { x: FROM_N.x, z: FROM_N.z + 24 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], { width: 4, rout: 90 });
    F.hana1.order = 'hold'; F.hana1.seekRange = 0; F.hana1.aggro = 0; F.hana1._wait = true;
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.4, () => rt.say(who, s, 3.2)));
    rt.after(0.6 + T.length * 3.4, () => { F.holdPlayer = false; this.toStep(rt, 1); });
    jin12.install(rt, this);
  },

  // 段を進める（右上の目標と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    // 途中から続ける（②〜）で構えたままの塙の先手は北へ下げる
    if (n > 1 && F.hana1?._wait) { const g = F.hana1; g._wait = false; g.order = 'retreat'; g.dest = { x: FROM_N.x, z: EXIT_N.z }; g.aggro = 0; g.seekRange = 0; }
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      rt.after(1, () => sfx('taiko', 0.8));
      F.kame.order = 'attack'; F.kame.seekRange = 30;
      // 塙の先手が貝塚の側から畷を寄せる。少し遅れて岡部の先手も（先陣を争う二つの隊）
      //   殿 40 で先手 56 を受ける（一番苦しい所。一1）
      // 11/18 クラウドさ：塙の先手は話の間から畷の北に構えている（下の setup）。ここで寄せに移る
      const H = F.hana1;
      if (H) { H._wait = false; H.anchor = { x: YASU.x, z: YASU.z }; H.order = 'attack'; H.seekRange = 90; H.aggro = 16; }
      else F.hana1 = this.foe(rt, '塙の先手', { x: FROM_N.x, z: FROM_N.z }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], { aim: YASU, width: 4, rout: 80 });
      F.w1S = aliveN(F.hana1);
      rt.after(22, () => { if (!F.ending && F.step === 1) { F.oka1 = this.foe(rt, '岡部の先手', { x: FROM_N.x + 6, z: FROM_N.z - 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 5 }], { aim: YASU, width: 4, rout: 60 }); F.w1S += aliveN(F.oka1); } });
      F.w1N = 56;
      // 11/18 09:05 クラウド：act bot 3本とも①は六十秒余りで終わり討ち取り2〜5。先手は三十秒で崩れ得る（noRout を解く）ため、
      //   本人が畷に着いた頃には半ばが逃げていた。先手は八十秒（岡部は着いてから六十秒）踏み止まって斬り合う
      rt.after(2.5, () => { if (!F.ending && F.step === 1) rt.say('亀田高綱', '来たぞ。畷に並んだ所を引き付けて、放て！', 3); });
      rt.after(24, () => { if (!F.ending && F.step === 1 && live(F.oka1)) rt.say('使番', '岡部の隊も畷に並んだ！　塙に先を越されまいと急いでおる', 3.4); });
    } else if (n === 2) {
      rt.say('亀田高綱', 'もう十分じゃ。撃ちながら退け！　樫井の村で上田殿が待っておる', 3.4);
      // 殿は畷の足場ごとに止まり、北を向いて撃っては次の足場へ退く（LEGS）。update が回す
      F.leg = 0; F.legT = rt.t; this.kameLeg(rt);
      // 追手：残りの先手と、塙の新手が背中を追う（後ろの北から。横や前には湧かせない）
      for (const g of [F.hana1, F.oka1]) if (live(g)) { g.order = 'attack'; g.seekRange = 120; g.speed = 3.9; g.anchor = { x: LINE.x, z: LINE.z - 20 }; }
      // 11/19 クラウド kaito2（K281：90秒に本人の30〜60m の敵が5人＝追手が北の端 (z−206) から出て、畷の本人の七十歩余り後ろ）：追手は本人の五十歩後ろ（北）から出す。北の端より手前には出さない
      const chZ = Math.max(FROM_N.z + 6, Math.min(FROM_N.z + 6 + 60, (rt.player?.u?.pos.z ?? FROM_N.z) - 50));
      F.chase = this.foe(rt, '塙の追手', { x: FROM_N.x, z: chZ }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }], { aim: { x: VILLAGE.x, z: VILLAGE.z - 10 } });
      F.chase.speed = 4.4; F.chase.seekRange = 120;
      rt.after(9, () => { if (!F.ending && F.step === 2) { F.chase2 = this.foe(rt, '塙の新手', { x: FROM_N.x + 4, z: Math.max(FROM_N.z, Math.min(FROM_N.z + 60, (rt.player?.u?.pos.z ?? FROM_N.z) - 55)) }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], { aim: { x: VILLAGE.x, z: VILLAGE.z - 10 } }); F.chase2.speed = 4.4; F.chase2.seekRange = 120; } });
      rt.after(5, () => { if (!F.ending && F.step === 2) rt.say('足軽', '後ろから追って来る！　足を止めるな！', 2.8); });
      // 亀田は安松の家に火を放って退く（史実。煙と火で追手の足を止める）
      rt.after(7, () => {
        if (F.ending || F.step !== 2) return;
        rt.say('亀田高綱', '安松の家に火をかけよ！　煙で敵の足を止める', 3);
        if (rt.world.addBlaze) F.yasuHouses.forEach((h, i) => rt.after(i * 1.4, () => {
          if (!F.ending) { rt.world.addBlaze(h.x, h.z, { w: 7, d: 5, h: 4, rot: h.r }); F.yasuLit = true; }
        }));
      });
      rt.after(14, () => { if (!F.ending && F.step === 2) rt.say('亀田高綱', '池の堤の鉄砲が横から撃つ。畷を外れるな、堤の前を駆け抜けよ', 3.2); });
      rt.after(10, () => { if (!F.ending && F.step === 2) this.bringUp(rt); });
    } else if (n === 3) {
      sfx('taiko', 1);
      // 11/18 18:25 クラウド（位置の記録 1808 ほか）：②の退きで息を使い切った本人（sta 2〜35）が③の始めに避け続け、③の本人の討ち取り0〜2。
      //   村の備えまで戻れたなら、備えの陰で息を整えてから村の戦へ（志賀の段の替わりと同じ形）
      if (rt.player?.u && dist(rt.player.u.pos, LINE) < 45) rt.player.sta = rt.player.maxSta;
      // 先の追手は村の前で合流して戦い続ける。遠く残った者は北へ退かせ、本物の兵の枠を空ける
      for (const g of [F.hana1, F.oka1, F.chase, F.chase2]) if (live(g)) for (const u of g.units) if (u.alive && dist(u.pos, LINE) > 110) rt.army.despawn(u);
      // 安松の北で控えていた塙・淡輪の隊が、街道を村の辻へ押し込む（村の家並みの間で入り乱れる。九2）
      this.bringUp(rt);
      // 北の残兵との乱戦へ引き返さず、まず隊で村へ入る。到着は一人でなく隊の中心で確かめる。
      // 11/18 15:10 クラウド（位置の記録）：②で本人と畷で斬り合った塙・淡輪が十四人まで減り、③の村の戦が空だった（本人の討ち取り0）。
      //   減っていれば、貝塚から続く後続（史実で塙の手は三千）を北の端から村へ寄せる。残った者も一緒に村へ入る
      const rest = [];
      if (sumN(F.hana) < 14) { if (live(F.hana)) rest.push(F.hana); F.hana = this.foe(rt, '塙団右衛門の隊', { x: -6, z: -214 }, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], { aim: { x: VILLAGE.x, z: VILLAGE.z - 4 }, width: 5, rout: 999 }); }
      if (sumN(F.awa) < 9) { if (live(F.awa)) rest.push(F.awa); F.awa = this.foe(rt, '淡輪重政の隊', { x: 4, z: -216 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], { aim: { x: VILLAGE.x, z: VILLAGE.z - 4 }, width: 5, rout: 999 }); }
      F.rest3 = rest;
      for (const g of [F.hana, F.awa, ...rest]) {
        for (const u of g.units) u.keepReal = true;
        g.aggro = 16;
        g.order = 'move'; g.dest = { x: VILLAGE.x, z: VILLAGE.z - 4 };
        g.onArrive = null; g.focus = null; g.keepMoveOrder = true;
        g.speed = 4.4; g.seekRange = 0; g.noRout = true;
        // 11/18 クラウド k12：寄せる途中で二十歩先の殿の遅れ・池の堤の鉄砲・手勢へ自分から寄せ、一秒に半歩しか進まず村へ着かなかった（描かずの通し）。村の辻までは道の上の敵に構わず進む
        g.marching = true; g.noEngage = true;
        for (const u of g.units) { u.target = null; u.aiT = 0; }
      }
      // 村の戦が終わった後に、古い命令で退く隊の索敵を戻さない。
      rt.after(40, () => { if (!F.ending && F.step === 3) for (const g of [F.hana, F.awa]) if (g && !g.keepMoveOrder) { g.seekRange = 40; g.noRout = (F.s3Kills || 0) < 4; } });
      rt.after(80, () => { if (!F.ending && F.step === 3) for (const g of [F.hana, F.awa]) if (g) g.noRout = false; });
      // 池の堤の鉄砲は役目を終えて村へ下がる（村へ来る敵を道の途中で撃ち減らさない）
      if (live(F.pondGuns)) { F.pondGuns.aggro = 0; F.pondGuns.order = 'move'; F.pondGuns.dest = { x: -14, z: -18 }; F.pondGuns.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -14, z: -18 }; }; F.pondGuns.units.forEach((u) => { u._crouch = false; }); }
      // 岡部の隊は東の田の向こう（蟻通の松原の陰）へ回り込んで控える（④で村の東の口へ）
      if (!F.oka) {
        F.oka = this.foe(rt, '岡部則綱の隊', FROM_E, [{ type: 'busho', n: 1, o: { name: '岡部則綱', mustLive: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 7 }], { aim: OKA_WAIT, hold: true, rout: 999 });
        F.oka.seekRange = 6; F.okaU = F.oka.units.find((u) => u.name === '岡部則綱');
        F.oka.stay = true;   // 11/18 05:20 クラウド（act bot・位置の記録）：控えの岡部の隊が③で共通の寄せに起こされ、二百歩西の本人 (−93,−131) へ二十八人で寄せた。④まで共通の寄せから外す
        for (const u of F.oka.units) u.keepReal = true;   // 東の田で控える間に上限の外しで消させない
      }
      F.w3N = sumN(F.hana, F.awa);
      // 上田・知近の備えは村の辻へ出て迎え撃つ。殿も村へ
      // 11/18 16:45 クラウド（act bot・位置の記録）：上田・知近の備えと殿が街道の上（辻の南八〜十六歩）に横に並び、村の南の端から来た本人が
      //   味方の列に塞がれる間に、備えが塙・淡輪を討っていた。上田は東の家並みの裏の路地、知近は西の家並みの裏の路地に割って構え、
      //   殿は東の裏手で控える＝辻へ通る街道は本人のために空ける（家を楯に横から槍を合わせる。四の後は上田が東の口へ）
      F.ueda.anchor = { x: 14, z: VILLAGE.z + 2 }; F.tomo.anchor = { x: -18, z: VILLAGE.z }; F.ueda.width = F.tomo.width = 4;
      // 備えは家並みで構え、街道に入った敵に横から槍を合わせる（村の外へ出て行かない）
      F.kame.anchor = { x: 15, z: VILLAGE.z + 18 };
      // 殿を待つ猶予で村の戦へ移った時も、途中の足場への到着で迎撃命令を上書きしない。
      F.kame.onArrive = null; F.kame.keepMoveOrder = false; F.kame.marching = false; F.kame.retreatOnly = false; F.legHold = false;
      for (const g of [F.ueda, F.tomo, F.kame]) { g.order = 'hold'; g.seekRange = 18; g.aggro = 16; g.ai = false; }
      // 11/18 クラウド k12：刻限で③へ移った時、殿がまだ村の北四十歩（z−85）で退く途中だと、塙・淡輪はそこで殿と斬り合って村へ入らず、
      //   本人は辻で五十秒立ち尽くした（描かずの通し）。殿は振り返らずに村の辻の後ろまで駆け込み、追う敵を村へ連れて来る
      const kc3 = live(F.kame) && F.kame.center();
      if (kc3 && kc3.z < VILLAGE.z - 8) {
        const g = F.kame, a = g.anchor;
        // 退く下知（retreat）なら、手の届く敵とも打ち合わずに村へ下がる（move では五歩内の敵と打ち合って足が止まった）。着いたら持ち場に（update の kameRun）
        g.order = 'retreat'; g.dest = { x: a.x, z: a.z }; g.keepMoveOrder = true; g.retreatOnly = true;
        g.seekRange = 0; g.aggro = 0; g.speed = 4.4; g.focus = null; F.kameRun = { x: a.x, z: a.z };
        for (const u of g.units) { u.target = null; u.aiT = 0; }
      }
      // 敗北の余韻中も段の番号は残る。終戦後は迎撃へ戻さない。
      rt.after(30, () => { if (!F.ending && F.step === 3) for (const g of [F.ueda, F.tomo, F.kame]) if (live(g) && !g.keepMoveOrder) { g.order = 'attack'; g.seekRange = 30; } });
      rt.army.play('toki', { x: -4, z: -110 }, 1.5);
      rt.say('上田宗箇', '亀田殿、ようも引き付けた。村の家を楯に迎え撃つ。一人も川へ通すな！', 3.4);
      rt.after(4, () => { if (!F.ending && F.step === 3) rt.say('塙団右衛門', '先陣は我が物じゃ。岡部に遅れを取るな、村へ押し込め！', 3); });
    } else if (n === 4) {
      // 控えの間に崩れていたら（遠くの乱戦の動揺など）、東の田の向こうから新しく寄せる（④の敵は必ず来る。九2）
      if (!live(F.oka)) {
        F.oka = this.foe(rt, '岡部則綱の隊', FROM_E, [{ type: 'busho', n: 1, o: { name: '岡部則綱', mustLive: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 7 }], { aim: EAST, rout: 999 });
        F.okaU = F.oka.units.find((u) => u.name === '岡部則綱');
        for (const u of F.oka.units) u.keepReal = true;   // 東の田で控える間に上限の外しで消させない
      }
      F.oka.stay = false;
      F.oka.order = 'move'; F.oka.dest = { x: EAST.x, z: EAST.z }; F.oka.onArrive = null;
      F.oka.focus = null; F.oka.keepMoveOrder = true; F.oka.seekRange = 0; F.oka.speed = 4.3; F.oka.noRout = true;
      for (const u of F.oka.units) { u.target = null; u.aiT = 0; }
      rt.after(30, () => { if (!F.ending && F.step === 4 && F.oka) F.oka.noRout = false; });
      F.w4N = aliveN(F.oka);
      // 11/19 08:25 クラウド（位置の記録 pos_0804）：④で岡部の二十八〜三十六人が一つの塊で東の口の本人へ寄り、上田の手は十二歩後ろで、本人は独りで受けて避け続けた（④の討ち取り0〜2）。上田の手は東の口で本人と並ぶ
      if (live(F.ueda)) { F.ueda.order = 'attack'; F.ueda.anchor = { x: EAST.x - 5, z: EAST.z + 3 }; F.ueda.seekRange = 50; }
      // 11/19 08:05 クラウド（act bot・位置の記録 pos_0759_ato2）：③で放たれた名無しの敵の新手（二十〜三十人）が④も本人に付き従い、
      //   岡部の二十八人と合わせて本人の二十五歩内に四十〜六十人。本人は避け続けて④の討ち取り0〜2。④の始めに名無しの新手は村の北の口へ寄せ直す（東の口は岡部の隊と斬り合う所）
      // 11/19 08:50 クラウド（位置の記録 pos_0826_c）：③の残り（塙団右衛門の隊・淡輪重政の隊の生き残り七〜八人）も村の西で本人に打ち掛かり続け、本人は東の口へ一度も行けず④を避け続けた。③の残りも北の口へ寄せ直す
      const left3 = [F.hana, F.awa, ...(F.rest3 || [])];
      for (const g of rt.army.groups) if (g.team !== rt.player?.u?.team && (!F.foes.includes(g) || left3.includes(g)) && g !== F.hata && g !== F.awaG && !g.stay && g.order === 'attack' && g.units.some((u) => u.alive && !u.name)) {
        g.focus = null; g.anchor = { x: VILLAGE.x, z: VILLAGE.z - 14 }; g.seekRange = 22;
        for (const u of g.units) if (u.alive && u.target?.isPlayer && dist(u.pos, rt.player.u.pos) > 6) { u.target = null; u.aiT = 0; }
      }
      rt.say('使番', '東の田に岡部の旗！　村の横へ回って来る！', 3);
      rt.after(3.4, () => { if (!F.ending && F.step === 4 && !F.okaBack) rt.say('上田宗箇', '横を破られれば村は持たぬ。我らと東の口を固めよ！', 3.2); });
    } else if (n === 5) {
      // 団右衛門は侍衆を連れて村の北の口から辻へ斬り込む。討てるのは主人公の止めだけ（onWound）
      //   斬り込む先は村の辻のまわりだけ（広く追わせると馬で村の外の田まで駆け回り、主人公が四分も追い回した。11/7 遊んで）
      if (live(F.hata)) {
        // 控えの移動・到着処理を切り、侍衆も斬り込んだ場所で打ち返す。
        F.hata.onArrive = null; F.hata.keepMoveOrder = false; F.hata.marching = false;
        F.hata.order = 'attack'; F.hata.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 };
        F.hata.seekRange = 24; F.hata.aggro = 16; F.hata.noRout = true; F.hata.speed = 4; F.hata.stay = false;
      }
      // 団右衛門の命は名のある将として強いが、一人の槍で討てる所まで（総大将の倍掛けが重なって千を超え、二分余り突いても討てなかった。11/7 遊んで）
      // 二巡（11/9）：bot が三百では四分突いても手傷まで届かなかった。百八十に
      // 味方の槍も通して弱らせる。下限では onWound が主人公の止めを待つ。
      // 無敵のまま allyOk が無いと共通の索敵から外れ、味方の包囲も援護も起きない。
      const H = F.hanaU; if (H?.alive) { H.noTarget = false; H.mustLive = false; H.allyOk = true; H.maxHp = Math.min(H.maxHp, 180); H.hp = Math.min(H.hp, H.maxHp); }
      //   馬上の一撃も、組み合った主人公が三四合は受けられる強さに（十秒で命の四分の三を削られて二度討たれた。11/7 遊んで）
      if (H?.alive) H.dmg = Math.min(H.dmg || 18, 12);
      for (const g of [F.ueda, F.tomo, F.kame]) if (live(g)) { g.order = 'attack'; g.seekRange = 60; g.anchor = { x: VILLAGE.x, z: VILLAGE.z - 4 }; }
      // 11/18 06:10 クラウド（act bot 3本・位置の記録）：③④で出た敵の新手（十五〜三十人）が⑤も村の外で本人と斬り合い、本人は団右衛門へ届かず二本で刻限に味方が討った。
      //   ⑤の始めに名無しの敵の新手は村の北の口へ寄せ直す（団右衛門の斬り込みに加わる形。戦の塊は辻に集まる）
      for (const g of rt.army.groups) if (g.team !== rt.player?.u?.team && !F.foes.includes(g) && !g.stay && g.order === 'attack' && g.units.some((u) => u.alive && !u.name)) {
        g.focus = null; g.anchor = { x: VILLAGE.x, z: VILLAGE.z - 14 }; g.seekRange = 26;
        for (const u of g.units) if (u.alive && u.target?.isPlayer && dist(u.pos, rt.player.u.pos) > 6) { u.target = null; u.aiT = 0; }
      }
      rt.after(1.2, () => { if (!F.ending && !F.hanaDown && F.hanaU?.alive) rt.say('塙団右衛門', '塙団右衛門直之、これにあり！　首が欲しくば取りに来い！', 3.4); });
      rt.after(5, () => { if (!F.ending && !F.hanaDown && F.hanaU?.alive) rt.say('亀田高綱', 'あれが団右衛門よ。侍衆を剥がして、そなたの槍で止めを！', 3); });
      // 11/17 K355 クラウド k365-cloud-42（『大坂御陣覚書』ほかの伝え：冬の陣の本町橋の夜討ちで、塙は「夜討の大将 塙団右衛門」と書いた木札を撒いて名を売った）
      rt.after(9.4, () => { if (!F.ending && !F.hanaDown && F.hanaU?.alive) rt.say('浅野の足軽', '冬の夜討ちで、己の名を書いた木の札を撒いて行った男じゃ……', 3.2); });
    }
  },

  // 豊臣方の隊を出す（見える所に湧かせない。北と東の遠くから寄せる）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: 0, width: o.width || 7, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: 0.5, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 26 : 90, aggro: 16, speed: 3.7 }, toyD(list));
    if (o.aim) g.anchor = { x: o.aim.x, z: o.aim.z };
    if (o.hold) { g.order = 'move'; g.dest = { x: o.aim.x, z: o.aim.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = 'hold'; }; }
    if (o.rout !== 999) rt.after(o.rout || 30, () => { if (g !== F.hata) g.noRout = false; });
    F.foes.push(g);
    return g;
  },

  // 岡部は横を突いたが退く（史実）
  okabeBack(rt) {
    const F = rt.flags;
    if (F.okaBack) return;
    F.okaBack = true;
    for (const g of [F.oka, F.okaKiba]) if (live(g)) {
      // 横を突く騎馬にも退く下知を伝え、古い攻撃・移動の命令を残さない。
      g.onArrive = null; g.focus = null; g.keepMoveOrder = false; g.marching = false;
      g.order = 'retreat'; g.dest = { x: FROM_E.x, z: EXIT_N.z }; g.speed = 4.3; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.target = null; u.aiT = 0; }
    }
    if (F.okaU?.alive) F.okaU.invuln = true;
    // 11/18 cloud-30 の見回り（710秒・岡部則綱を斬っても傷がつかない）：退く岡部（史実で落ちのびる）と供は斬り合いの相手から外し、見えない所まで退いたら戦場から下げる
    for (const g of [F.oka, F.okaKiba]) if (live(g)) for (const u of g.units) if (u.alive && (u === F.okaU || u.type === 'busho' || u.type === 'cavalry')) { u.noTarget = true; u.target = null; }
    rt.after(1.2, () => { if (!F.ending && F.step === 4) rt.say('岡部則綱', '横からも破れぬか……。引け、引け！', 2.8); });
    rt.after(4, () => this.toStep(rt, 5));
  },

  // 塙・淡輪の隊と塙団右衛門の侍衆を、追手の後ろから安松の北まで寄せて控えさせる（③で村へ。見える所には湧かせない）
  bringUp(rt) {
    const F = rt.flags;
    if (F.hana) return;
    F.hana = this.foe(rt, '塙団右衛門の隊', { x: -6, z: -205 }, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], { aim: { x: -3, z: -170 }, hold: true, morale: 98, width: 5, rout: 999 });
    F.awa = this.foe(rt, '淡輪重政の隊', { x: 2, z: -214 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], { aim: { x: 7, z: -176 }, hold: true, width: 5, rout: 999 });
    // 淡輪重政は団右衛門の脇（村の北の口）に馬を立てて控え、団右衛門が討たれてから斬り込む（史実の順）
    // 隊の後列まで北端の内に置く。中心を端に置くと供の侍が場外から動き始めてしまう。
    F.awaG = this.foe(rt, '淡輪重政の手', { x: HATA.x + 9, z: -210 }, [{ type: 'busho', n: 1, o: { name: '淡輪重政', invuln: true, horse: true } }, { type: 'samurai', n: 3 }], { aim: { x: HATA.x + 9, z: HATA.z - 4 }, hold: true, morale: 100, width: 3, rout: 999 });
    F.awaG.seekRange = 0; F.awaG.aggro = 0;
    F.awaU = F.awaG.units.find((u) => u.name === '淡輪重政');
    // 団右衛門の討死までは控えの将。討てない相手を追って止まらず、史実の斬り込み前にも討たせない。
    F.awaU.noTarget = true; F.awaU.mustLive = true;
    // 11/18 09:20 クラウド（act bot・位置の記録）：②で塙・淡輪の本隊が畷の南（z−114）まで出て、北で追手と斬り合う本人とそこでぶつかり、
    //   ③の前に三十六人が八人まで減って③の村の戦が空（3／3人）になった。②の間は安松の北（z−170）で控え、自分からは寄せない
    // 11/18 15:10 クラウド（位置の記録）：それでも②の九十九秒で塙・淡輪が attack に替わり、北に残った本人と畷（z−110〜−160）で斬り合って
    //   三十六人が十四人に減り、③の村の戦は本人の討ち取り0・0・4だった。②の間は寄せの気付き（aggro）も五歩に絞る（③で戻す）
    for (const g of [F.hana, F.awa]) { g.speed = 4.4; g.seekRange = 5; g.aggro = 5; }
    // 11/18 クラウド：北で控える塙・淡輪の隊（本人から百歩より遠い）が、本物の兵の上限の外し（depth_reserve.js pruneFar）で
    //   出た時から消され、③が兵0で六秒で済んだ・残りが少なく辻で百秒待った。筋書きの隊は外させない。
    for (const g of [F.hana, F.awa, F.awaG]) for (const u of g.units) u.keepReal = true;
    // 塙団右衛門は侍衆を連れて村の北の口に構える（⑤まで前に出ない）。止めは主人公の手だけ（三4）
    F.hata = this.foe(rt, '塙団右衛門の侍衆', { x: HATA.x, z: -210 }, [{ type: 'busho', n: 1, o: { name: '塙団右衛門', flag: 'sashi:字塙団右衛門:#ece6d6:#201f1c', invuln: true, horse: true } }, { type: 'samurai', n: 10 }, { type: 'gun', n: 2 }], { aim: HATA, hold: true, morale: 100 });
    for (const u of F.hata.units) u.keepReal = true;
    F.hata.seekRange = 0; F.hata.aggro = 0;   // ⑤まで村の北の口から動かない（村の乱戦に先に紛れ込まない）
    // 11/18 04:55 クラウド（act bot・位置の記録）：③で控えの侍衆が共通の寄せ（重なった move の隊を attack に替える等）に起こされ、
    //   討てない団右衛門ごと本人を戦場の北東の隅（140,−165）まで追い回した。本人は逃げ続けて③④⑤で討ち取り8。控えの二隊は stay で共通の寄せから外す
    F.hata.stay = true; F.awaG.stay = true;
    F.hanaU = F.hata.units.find((u) => u.name === '塙団右衛門');
    // 控えの間は討てない将へ注視・攻撃を吸わせない。⑤の斬り込みで狙えるようにする。
    F.hanaU.noTarget = true; F.hanaU.mustLive = true;
    F.hanaU.onWound = (src) => {
      if (F.ending || rt.over || !src?.isPlayer || F.step !== 5 || !F.hanaU.alive) return;
      // 「討ち取ったり」を先に出す（後から出すと、共通の「〇〇が討たれた」の知らせに重ねて消される。五3）
      F.hanaU.invuln = false; F.hanaByMe = true; rt.banner('塙団右衛門、討ち取ったり'); F.hanaBanner = true; rt.army.kill(F.hanaU, src);
    };
  },

  // 殿の撃っては退く：足場（LEGS）で北を向いて構え、鉄砲を放ってから次の足場へ駆ける
  kameLeg(rt) {
    const F = rt.flags, g = F.kame;
    if (!live(g) || F.leg >= LEGS.length) return;
    const z = LEGS[F.leg], x = F.leg === LEGS.length - 1 ? LINE.x - 2 : -3;
    // 撃つ足場へ着くまでは退く下知を守り、北の追手へ引き返さない。
    g.focus = null; g.keepMoveOrder = true; g.marching = true; g.retreatOnly = true; g.seekRange = 0;
    for (const u of g.units) { u.target = null; u.aiT = 0; }
    g.order = 'move'; g.dest = { x, z }; g.speed = 3.8; g.aggro = 0;
    g.onArrive = (q) => {
      if (F.step !== 2 || F.ending) return;
      q.keepMoveOrder = false; q.marching = false; q.retreatOnly = false;
      q.order = 'hold'; q.anchor = { x, z }; q.facing = Math.PI; q.aggro = 24; q.seekRange = 0;
      F.legT = rt.t; F.legHold = true;
      // 到着だけでは斉射音を鳴らさない。実際の射撃と、生きた鉄砲兵・射程内の敵を確かめる kerai.tick に任せる。
    };
    F.legHold = false;
  },

  // 塙団右衛門の最期（主人公が止めを刺した時だけ。onWound が呼ぶ。三4）
  hanawaFalls(rt) {
    const F = rt.flags;
    // 11/18 クラウド k365-cloud-28：味方や刻限で団右衛門が討たれた時も⑤を締める（本人の手柄の時だけ !hanaByMe で戻ると、淡輪も勝ちも来ず千八十秒の時切れで負けた・act bot）
    if (F.hanaDown || F.step !== 5) return;
    F.hanaDown = true; F.hanaDownT = rt.t;
    // 討死の知らせと同時に目標も済ませる。淡輪の斬り込みを待つ間に未達成を残さない。
    rt.objDone('s5');
    if (!F.hanaBanner) rt.banner(F.hanaByMe ? '塙団右衛門、討ち取ったり' : '塙団右衛門、討ち死に');
    if (F.hanaByMe) rt.award((t) => { t.special = { label: '塙団右衛門を討ち取った', pts: 32 }; }, '塙団右衛門を討ち取った');
    // 士気を落とすだけでは、組頭の残る隊に攻撃命令が残る。
    // 侍衆・前線の隊・騎馬に加え、畷から残った先手と追手にも退く下知を伝える。
    // 別隊の淡輪本人だけが最後に斬り込み、古い追撃命令の残兵は村を攻め続けない。
    for (const g of [F.hata, F.hana, F.awa, F.hanaKiba, F.hana1, F.oka1, F.chase, F.chase2]) if (live(g)) {
      g.onArrive = null; g.focus = null; g.keepMoveOrder = false; g.marching = false;
      g.noRout = false; g.morale = Math.min(g.morale, 15);
      g.order = 'retreat'; g.dest = { x: EXIT_N.x, z: EXIT_N.z }; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.target = null; u.aiT = 0; }
    }
    // 淡輪重政は団右衛門の死を見て敵中へ斬り込み、永田治兵衛に首を取られた（史実の順。それまでは討たれない）。
    //   討死と勝ちは固定の秒数で先取りせず、村で浅野勢と槍を合わせてから締める。
    const awa = F.awaU;
    if (awa?.alive) {
      // 村へ斬り込む前に、北の口で味方の槍に討たれたり手傷で退いたりさせない。
      awa.noTarget = true; awa.mustLive = true; awa.invuln = true;
      awa.onWound = () => {};
      // 北の口で敵を追うと、討てないまま村へ入れず終戦も止まる。まず辻へ斬り込む。
      if (live(F.awaG)) {
        const g = F.awaG;
        g.order = 'move'; g.dest = { x: VILLAGE.x, z: VILLAGE.z - 6 }; g.anchor = { ...g.dest };
        g.onArrive = null; g.focus = null; g.keepMoveOrder = true; g.marching = true;
        g.seekRange = 0; g.aggro = 0; g.speed = 4.6;
        for (const u of g.units) { u.target = null; u.aiT = 0; }
      }
      rt.after(0.4, () => { if (awa.alive) rt.say('淡輪重政', '団右衛門殿が果てたか。六郎兵衛も続くぞ！', 2); });
    } else rt.after(1.2, () => rt.say('浅野の侍', '団右衛門、討ち取ったり！', 2.6));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (live(g)) {
      // 村へ戻る途中の侍衆にも退く下知を残す。古い到着処理で再び攻撃へ戻さない。
      g.onArrive = null; g.focus = null; g.keepMoveOrder = false; g.marching = false;
      g.order = 'retreat'; g.dest = { x: EXIT_N.x, z: EXIT_N.z }; g.speed = 4.2; g.aggro = 0;
    }
    sfx('horagai', 0.8);
    // 団右衛門を討った手柄を、締めの小さい手柄で上書きしない。
    rt.award((t) => { t.main = true; if ((t.special?.pts || 0) < 20) t.special = { label: '樫井で塙の先手を破った', pts: 20 }; }, '樫井で塙の先手を破った');
    rt.banner('樫井の戦い、浅野の勝ち');
    const A = this.talk.after;
    rt.after(1.2, () => rt.say('使番', '申し上げます。治房の本隊は塙の死を聞き、貝塚から大坂へ引き上げた由', 3.4));
    rt.after(5, () => rt.say(A[0][0], A[0][1], 3.6));
    rt.after(9, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(13, () => rt.say(A[2][0], A[2][1], 3.2));
    // 亀田と上田の手柄の争い（のちに亀田が浅野家を去るもと。battle_learn）
    rt.after(16.5, () => rt.say(A[3][0], A[3][1], 3.4));
    rt.after(20.2, () => rt.say(nm(rt), '国の一揆を鎮め、大坂へ攻め上りましょうぞ', 3.2));
    // 11/17 K355 クラウド k365-cloud-42：名を売って死んだ浪人の締め（木札の伝え）
    rt.after(24, () => { if (!rt.over && !rt.ended) rt.say('浅野の侍', '団右衛門の骸の懐に、名を書いた木の札が一枚……', 3); });
    rt.after(27.4, () => { if (!rt.over && !rt.ended) rt.say('亀田高綱', '名を残すために来た男よ。手厚く葬ってやれ', 3); });
    // 締めの会話の後も戦場の余韻を残す（全戦共通の戦後は最低三十秒）。
    rt.finish({ scriptedEnd: true }, 30);
  },

  lose(rt, title, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner(title, why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    k281Tick(rt, dt, F.step || 0);
    // K281：段1・段5（本人の30〜60m の敵が10〜20）に、本人の30〜60m へ塙の控え（二十・斬り合わない塊）を置き続ける（段の長さは変えない・上限の内）
    keepReserve(rt, dt, '_k281R', (at, face) => {
      let live = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) live++;
      if (live + 22 > (rt.def.realCap ?? 250) + 10) return null;
      const g = this.foe(rt, '塙の控え', at, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 2 }], { rout: 999 });
      Object.assign(g, { order: 'hold', aggro: 0, seekRange: 0, facing: face, fixed: false });
      return g;
    }, () => F.step === 1 && !F.ending);   // 段5は上限すれすれで立たず、段5が166秒に延びた回があったので段1だけ
    try { jin12.tick(rt, dt); } catch (e) { if (!rt.flags._jinErr) { rt.flags._jinErr = 1; console.warn("樫井の陣立て", e); } }
    // 11/18 クラウドせ（K-k12①【難】）：す の見下ろし（camHigh）を、vanguardJoined でなく敵との間で切る（味方の鉄砲が当たっただけで立ち、
    //   始めの数秒で肩越しへ戻っていた）。塙・岡部の先手が本人の三十五歩内に来るまで上から見せ、寄れば二秒ほどで戻す
    {
      const u0 = rt.player?.u;
      let want = 0;
      if (u0?.alive && !F.ending && (F.step || 0) <= 1) {
        let near = 1e9;
        for (const g of [F.hana1, F.oka1]) for (const v of g?.units || []) if (v?.alive) near = Math.min(near, (v.pos.x - u0.pos.x) ** 2 + (v.pos.z - u0.pos.z) ** 2);
        if (near > 35 * 35) want = 1;
      }
      camHigh = dt >= 0.5 || !rt.t ? want : camHigh + (want - camHigh) * Math.min(1, dt * (want ? 2 : 1.2));
    }
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 11/19 クラウド kaito2（K281・司令塔の決め）：②の退きで、本人に置いて行かれた追手（本人の六十五m より遠い）は、三秒ごとに本人の四十五m 後ろ（北・本人の背の向こう＝画面の外）へ寄せる。数は変えない
    if (F.step === 2 && P?.alive && (F._chT = (F._chT || 0) - dt) <= 0) {
      F._chT = 3;
      let k = 0;
      for (const g of [F.chase, F.chase2]) if (g && !g.routed) for (const u of g.units) {
        if (!u.alive || u.gone || u.fleeing) continue;
        if (Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 65 || u.pos.z > P.pos.z) continue;
        const nx = P.pos.x + ((k % 7) - 3) * 1.6, nz = P.pos.z - 45 - Math.floor(k / 7) * 1.8; k++;
        if (rt.world?.walkable?.(nx, nz) === false) continue;
        u.pos.x = nx; u.pos.z = nz; u.moveTo = null; u.aiT = 0;
      }
    }
    // 退いた岡部の隊は、本人から六十m 離れたら戦場から下げる（取り残された無敵の将を斬り続けない）
    if (F.okaBack && (F.okaGoneT = (F.okaGoneT || 0) - dt) <= 0) {
      F.okaGoneT = 1;
      for (const g of [F.oka, F.okaKiba]) if (g) for (const u of g.units.slice()) if (u.alive && !u.gone && dist(u.pos, P.pos) > 60) rt.army.despawn(u);
    }
    // 11/18 03:15 クラウド（act bot 153秒）：控えの淡輪重政の手の侍が北の口へ寄る途中 (7,-107) で、行き先 (5,-86) を前に move のまま二十秒止まった
    //   （控えは索敵0で、すぐ脇の新手に道を塞がれる）。控えの二隊（淡輪の手・団右衛門の侍衆）は、move のまま六秒動かない兵を行き先へ一歩半ずつ送る
    if ((F.resvT = (F.resvT || 0) - dt) <= 0) {
      F.resvT = 1;
      for (const g of [F.awaG, F.hata]) {
        if (!live(g) || g.order !== 'move' || !g.dest) continue;
        for (const u of g.units) {
          if (!u.alive || u.gone || u.fleeing || u.atk || u.mounted && u.name) { u._k12r = null; continue; }
          const d = dist(u.pos, g.dest), s = u._k12r;
          if (d < 4 || !s || dist(u.pos, s) > 0.3) { u._k12r = { x: u.pos.x, z: u.pos.z, n: 0 }; continue; }
          if (++s.n < 6) continue;
          const k = Math.min(1.5, d - 3) / d, nx = u.pos.x + (g.dest.x - u.pos.x) * k, nz = u.pos.z + (g.dest.z - u.pos.z) * k;
          if (rt.world?.walkable?.(nx, nz) === false) continue;
          u.pos.x = nx; u.pos.z = nz; u.aiT = 0; u._k12r = null;
        }
      }
    }
    // 11/18 08:12 クラウド（act bot 530秒）：上田宗箇の手の馬の侍が (15,-54) で、四歩先の行き先 (16,-58) を前に attack のまま二十秒止まった
    //   （味方と0.5mに重なり、馬なので浅野の備えの重なり解きからも外れていた）。浅野の三つの備は、打ち合っていない兵が
    //   行き先の三歩より外で八秒動かなければ、行き先へ一歩半ずつ送る（馬の侍も。名のある将は外す）
    if ((F.asaPushT = (F.asaPushT || 0) - dt) <= 0) {
      F.asaPushT = 1;
      // 11/19 クラウド（act bot 465秒：敵を前に二十秒止まった五回）：③〜⑤で殿の手が討たれ尽き亀田高綱ひとり（不死身の馬上）になると、
      //   attack のまま敵の前で立ち続けた。手勢を失った将は村の南（上田の備えの後ろ）へ下がって采配を振る（史実も亀田は生き残った）
      const kg = F.kame;
      if (F.step >= 3 && live(kg) && !kg._alone && !kg.units.some((u) => u.alive && !u.gone && !u.name)) {
        kg._alone = true; kg.order = 'hold'; kg.anchor = { x: 8, z: VILLAGE.z + 26 }; kg.seekRange = 0; kg.aggro = 0; kg.focus = null;
        kg.keepMoveOrder = false; kg.marching = false; kg.onArrive = null; F.kameRun = null;
        for (const u of kg.units) if (u.alive) { u.target = null; u.aiT = 0; }
      }
      if (kg?._alone && kg.order !== 'hold') { kg.order = 'hold'; kg.anchor = { x: 8, z: VILLAGE.z + 26 }; kg.seekRange = 0; kg.aggro = 0; }
      for (const g of [F.ueda, F.tomo, F.kame]) {
        if (!live(g)) continue;
        for (const u of g.units) {
          const to = (u.qualityAbstract || u.farSim) ? u._farWant : u.moveTo;
          if (!u.alive || u.gone || u.fleeing || u.downed || u.atk || u.swing || u.name || !to) { u._k12p = null; continue; }
          const d = dist(u.pos, to), s = u._k12p;
          if (d < 3 || !s || dist(u.pos, s) > 0.3) { u._k12p = { x: u.pos.x, z: u.pos.z, n: 0 }; continue; }
          if (++s.n < 8) continue;
          // 11/19 05:50 クラウド（act bot 384秒）：上田宗箇の手の二人が (−1,−65) で行き先 (−8,−49) を前に二十秒＝真っ直ぐ先が家で塞がれ、送りが掛からなかった。
          //   真っ直ぐが歩けなければ左右へ四十五度・九十度振った一歩半を試し、どれも塞がれて十六秒経てば今の所を持ち場とする
          const ux = (to.x - u.pos.x) / d, uz = (to.z - u.pos.z) / d, st = Math.min(1.5, d - 2);
          let moved = false;
          for (const a of [0, 0.785, -0.785, 1.571, -1.571]) {
            const c = Math.cos(a), sn = Math.sin(a), nx = u.pos.x + (ux * c - uz * sn) * st, nz = u.pos.z + (ux * sn + uz * c) * st;
            if (rt.world?.walkable?.(nx, nz) === false) continue;
            u.pos.x = nx; u.pos.z = nz; u.aiT = 0; u._k12p = null; moved = true; break;
          }
          if (!moved && s.n >= 16) { u.moveTo = { x: u.pos.x, z: u.pos.z }; if (u._farWant) u._farWant = { x: u.pos.x, z: u.pos.z }; u._k12p = null; }
        }
      }
    }
    // 11/18 04:55 クラウド：⑤の前に控えの二隊が持ち場（北の口）から二十五歩より離れたら、持ち場へ戻す（共通の頭に attack へ替えられても追い回させない）
    if ((F.homeT = (F.homeT || 0) - dt) <= 0) {
      F.homeT = 2;
      for (const [g, at] of [[F.hata, HATA], [F.awaG, { x: HATA.x + 9, z: HATA.z - 4 }], [F.oka, OKA_WAIT]]) {
        if (!live(g) || !g.stay || (F.step || 0) < 2 || g.order === 'move' && g.dest && dist(g.dest, at) < 2) continue;
        const c = g.center();
        if (g.order === 'hold' && dist(c, at) < 25 && !g.focus) continue;
        g.focus = null; g.seekRange = 0; g.aggro = 0;
        if (dist(c, at) < 25) { g.order = 'hold'; g.anchor = { x: at.x, z: at.z }; }
        // 11/19 クラウド（act bot 302秒 ★：団右衛門の侍衆が持ち場へ戻る move のまま本人のすぐそばで六秒何もしない）：戻る道でも三歩半内の相手には槍を合わせる
        else { g.order = 'move'; g.dest = { x: at.x, z: at.z }; g.keepMoveOrder = true; g.marching = true; g.aggro = 3.5; g.onArrive = (q) => { q.keepMoveOrder = false; q.marching = false; if (q.order === 'move') { q.order = 'hold'; q.aggro = 0; } }; }
        for (const u of g.units) if (u.target?.isPlayer && dist(u.pos, P.pos) > 4) { u.target = null; u.aiT = 0; }
      }
    }
    // 11/18 クラウド：⑤で浅野知近の手（残り5人・うち4人は遠くの軽い兵）が辻 (1,-49) で一点に重なって止まった（act bot 733秒）。
    //   共通の散らし（depth_reserve.js）は hold か新手の attack で五人からしか効かないので、浅野の三つの備は三人から、
    //   斬り合っていない兵が半分より重なって四秒続いたら、その場で一人ずつ渦の形（1.4m 間）に並べ直す（一回2.5mまで）
    if ((F.asaUnT = (F.asaUnT || 0) - dt) <= 0) {
      F.asaUnT = 1;
      for (const g of [F.ueda, F.tomo, F.kame]) {
        if (!live(g)) continue;
        const al = g.units.filter((u) => u.alive && !u.gone && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed);
        let close = 0;
        for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) { const dx = al[i].pos.x - al[j].pos.x, dz = al[i].pos.z - al[j].pos.z; if (dx * dx + dz * dz < 0.25) close++; }
        // 11/19 クラウド（act bot 389秒・★一件）：⑤の後、知近の手の足軽が西の路地 (-15,-55) で持ち場 (-18,-52) の三歩半手前に二十秒立った
        //   （持ち場が家の軒に掛かり、そこへ寄れない）。斬り合っていない兵が持ち場の六歩内で六秒動けなければ、今の所を持ち場とする
        for (const u of al) {
          const mt = u.moveTo, still = !u.atk && !u.target && mt && Math.hypot(mt.x - u.pos.x, mt.z - u.pos.z) < 6 && Math.hypot(u.vel?.x || 0, u.vel?.z || 0) < 0.15;
          u._asaStill = still ? (u._asaStill || 0) + 1 : 0;
          if (u._asaStill >= 6) { u._asaStill = 0; u.moveTo = { x: u.pos.x, z: u.pos.z }; u.aiT = Math.max(u.aiT || 0, 8); }
        }
        if (al.length < 3 || close < Math.max(2, al.length * 0.5) || al.some((u) => u.atk)) { g._asaSt = 0; continue; }
        if ((g._asaSt = (g._asaSt || 0) + 1) < 4) continue;
        g._asaSt = 0;
        let cx = 0, cz = 0; for (const u of al) { cx += u.pos.x; cz += u.pos.z; } cx /= al.length; cz /= al.length;
        al.forEach((u, i) => {
          const r = 1.4 * Math.sqrt(i + 0.5), a = i * 2.4, p = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
          if (rt.world?.walkable?.(p.x, p.z) === false) return;
          const dd = Math.hypot(p.x - u.pos.x, p.z - u.pos.z), k = dd > 2.5 ? 2.5 / dd : 1;
          u.pos.x += (p.x - u.pos.x) * k; u.pos.z += (p.z - u.pos.z) * k; u.moveTo = p; u.aiT = 3;
        });
      }
    }
    // 11/19 03:47 クラウド（act bot 466秒・321s）：味方の新手の生き残り一人が東の口 (58,-62) で、行き先を前に敵の八歩内で attack のまま二十秒立った
    //   （狙いが外れたまま、塞がれた行き先へ歩けない）。攻めの組は、狙いの無い兵が四秒動かず八歩内に敵が居れば、その敵を狙わせる
    if ((F.newStT = (F.newStT || 0) - dt) <= 0) {
      F.newStT = 1;
      for (const g of rt.army.groups) {
        // 03:52 act bot 406s：遠くの備（陣立ての表の備が本物になった物）の生き残り一人も (-6,-105) で同じく立った → 筋書きで立たせない attack の組は皆（名のある将は外す）
        // 11/19 04:55 クラウド（POSLOG）：味方の新手・遠くの備は陣立ての型から fixed を受け継ぐので、fixed で外すと止まり解きが一度も掛からなかった
        //   （遠くの備が北 (-7,-108) で行き先無しに二十秒・味方の新手十二人が (26,-45) で狙い無しに立つ）→ 外すのは筋書きの隊（F が持つ組）の fixed だけ
        // 11/19 06:10 クラウド（act bot 491秒）：③の後の亀田高綱の殿（残り一〜二人）が (15,−24)・(5,−15) で着いて待つまま、敵を六十歩内に attack で二十秒。殿も③からは止まり解きに入れる
        if (g.order !== 'attack' || g.stay || g.noAI || g.fixed && Object.values(F).includes(g) && !(g === F.kame && F.step >= 3) || g.isPlayerSquad || g === F.hata || g === F.awaG) continue;
        // 04:00 act bot 301s：味方の新手十二人が村の南 (14,1) で、狙いも行き先も無く敵を六十歩内に二十秒立った（寄せの広さの外）。
        //   組の皆が狙い無しで八秒同じ所に居て六十歩内に敵が居れば、その敵の所を構え所にして寄せの広さを二十五歩に・一人ずつ近い敵を狙わせる
        const gc = g.center?.(), gq = g._k12g;
        if (gc && g.units.every((u) => !u.alive || !u.target?.alive)) {
          if (!gq || dist(gc, gq) > 1) g._k12g = { x: gc.x, z: gc.z, n: 0 };
          else if (++gq.n >= 8) {
            g._k12g = null;
            const e = rt.army.nearestEnemy({ pos: gc, team: g.team }, 60, (o) => o.alive && !o.gone && !o.fleeing && !o.noTarget);
            if (e) {
              if (g.anchor) { g.anchor.x = e.pos.x; g.anchor.z = e.pos.z; }
              g.seekRange = Math.max(g.seekRange || 0, 25);
              // 05:10 クラウド（act bot 572秒）：遠くの備の生き残り一人が北 (-7,-110) で狙いを渡しても四十秒立った（狙いが寄せの広さの外で外され、持ち場の輪へ戻る）
              //   → 敵が二十歩より遠ければ、その敵の所へ move で歩かせ、着いたら攻めに戻す
              if (dist(gc, e.pos) > 20) { g.order = 'move'; g.dest = { x: e.pos.x, z: e.pos.z }; g.onArrive = (q) => { q.order = 'attack'; q.onArrive = null; q.seekRange = Math.max(q.seekRange || 0, 25); }; }
              // 04:11 act bot：遠くの備の生き残り一〜二人は構え所を移しても狙いを持たずに立った → 一人ずつ一番近い敵を狙わせる
              for (const u of g.units) if (u.alive && !u.gone && !u.name && !u.isPlayer) { const t = rt.army.nearestEnemy(u, 60, (o) => o.alive && !o.gone && !o.fleeing && !o.noTarget) || e; u.target = t; u.moveTo = { x: t.pos.x, z: t.pos.z }; if (u.farSim || u.qualityAbstract) u._farWant = { x: t.pos.x, z: t.pos.z }; u.aiT = 2; }   // 04:18：遠くの軽い兵は _farWant へ歩くので、そちらも敵へ
            }
          }
        } else g._k12g = null;
        for (const u of g.units) {
          if (!u.alive || u.gone || u.isPlayer || u.name || u.fleeing || u.downed || u.atk || u.swing || u.target?.alive) { u._k12n = null; continue; }
          const s = u._k12n;
          if (!s || dist(u.pos, s) > 0.3) { u._k12n = { x: u.pos.x, z: u.pos.z, n: 0 }; continue; }
          if (++s.n < 4) continue;
          const e = rt.army.nearestEnemy(u, 8, (o) => o.alive && !o.gone && !o.fleeing && !o.noTarget);
          if (e) { u.target = e; u.moveTo = { x: e.pos.x, z: e.pos.z }; u.aiT = 2; u._k12n = null; continue; }
          // 11/19 06:25 クラウド（act bot 487秒）：一人残った新手 (56,−180)・遠くの備 (−6,−105) が『敵の前で歩けず』二十秒（家の壁で敵へ歩けない）。
          //   八秒動けず二十五歩内に敵が居れば、その敵の方へ一歩半（真っ直ぐが塞がれれば左右へ四十五・九十度）送る
          // 11/19 06:50 クラウド（act bot 494秒）：遠くの備の一人が村の南 (−30,17) で『敵が遠く歩けず』二十秒（六十歩内の敵が二十五歩より遠い）→ 送る輪を六十歩まで
          if (s.n < 8) continue;
          const f = rt.army.nearestEnemy(u, 60, (o) => o.alive && !o.gone && !o.fleeing && !o.noTarget);
          if (f) {
            const d = dist(u.pos, f.pos), ux = (f.pos.x - u.pos.x) / d, uz = (f.pos.z - u.pos.z) / d;
            for (const a of [0, 0.785, -0.785, 1.571, -1.571]) {
              const c = Math.cos(a), sn = Math.sin(a), nx = u.pos.x + (ux * c - uz * sn) * 1.5, nz = u.pos.z + (ux * sn + uz * c) * 1.5;
              if (rt.world?.walkable?.(nx, nz) === false) continue;
              u.pos.x = nx; u.pos.z = nz; u.target = f; u.moveTo = { x: f.pos.x, z: f.pos.z }; if (u.farSim || u.qualityAbstract) u._farWant = { x: f.pos.x, z: f.pos.z }; u.aiT = 2; break;
            }
          }
          u._k12n = null;
        }
      }
    }
    // 11/18 クラウド（act bot『17人を無傷で討った』＝歯ごたえが無い）：③④の村の乱戦で、本人から二十歩内の敵の組を一つだけ本人へ向ける
    //   （河田・根白坂の huntPlayer と同じ形）。敵の数と強さは変えない。命が六割半を切ったら・組が崩れたら放す。鉄砲組と団右衛門の侍衆は向けない
    if ((F._huntT = (F._huntT || 0) - dt) <= 0) {
      F._huntT = 0.5;
      // 11/18 07:50 クラウド：act bot 5本中、足軽の傷は全て0・一本は『無傷で22人』。①の畷の先手と⑤の村でも一組を向け、輪を二十→二十六歩に
      //   （③④は四十〜九十秒で終わる回が多く、向く組が来る前に段が過ぎていた）。侍の居る組を先に選ぶ（足軽の槍は構えで止まる）
      // 11/18 17:08 クラウド（act bot 3本の傷が足軽20・0・8だけ）：②の退きでも追手の一組を本人へ向け（撃ちながら退く間に背を突かれる）、放す命を六割半→五割に
      const on = P?.alive && F.step >= 1 && F.step <= 5 && P.hp >= P.maxHp * 0.5;
      const c = { x: 0, y: 0, z: 0 };
      const ok = (g) => {
        if (!on || g.routed || !g.count || g === F.hata || g === F.oka || g === F.awaG || g.order === 'retreat' || g.order === 'stay' || g.units.every((u) => !u.alive || u.type === 'gun')) return false;
        g.center(c);
        // 11/18 18:10 クラウド（位置の記録 1801）：③で本人が辻の東に着いた十秒で、上田の手・殿が塙・淡輪を八人討った（本人の討ち取り0）。
        //   ③の始め（s3Quiet）は塙・淡輪の隊を四十五歩内から先に本人へ向ける（街道を下る隊が本人へ槍を揃えて来る）
        const r = s3Quiet(rt) && (g === F.hana || g === F.awa) ? 45 : 26;
        return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < r;
      };
      const sam = (g) => g.units.some((u) => u.alive && u.type === 'samurai');
      // 11/18 08:00 クラウド：一組だけでは⑤で七十四人を無傷（足軽・侍の打ちは構えで止まる）。囲みで傷が通るよう、⑤は二組まで向ける
      const max = F.step === 5 ? 2 : 1;
      F._hunters = (F._hunters || (F._hunter ? [F._hunter] : [])).filter((g) => {
        const yieldHana = s3Quiet(rt) && g !== F.hana && g !== F.awa && [F.hana, F.awa].some((h) => h && !h.focus && ok(h));
        if (g.focus === P && ok(g) && !yieldHana) return true;
        if (g.focus === P) { g.focus = null; delete g.dmgMultPlayer; for (const u of g.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
        return false;
      });
      while (on && F._hunters.length < max) {
        let pick = null;
        if (s3Quiet(rt)) for (const g of [F.hana, F.awa]) if (g && g.team !== P.team && !g.focus && ok(g)) { pick = g; break; }
        if (!pick) for (const g of rt.army.groups) if (g.team !== P.team && !g.focus && !g.isPlayerSquad && ok(g)) { if (sam(g)) { pick = g; break; } pick = pick || g; }
        if (!pick) break;
        // 11/18 クラウド：向いた組の打ちが敵の既定（dmgMult 0.5）のままで、act bot の足軽の傷は0のまま。本人へ向く間だけ本人への打ちを並に戻す
        pick.focus = P; pick.dmgMultPlayer = 1; F._hunters.push(pick);
      }
      F._hunter = F._hunters[0] || null;
    }
    // 11/19 クラウド kaito2（act bot 3回：③④⑤の本人の討ち取り1〜9・三回目は合わせて6）：本人へ向いた組（_hunters）も、本人へ届く前に
    //   上田の手・殿に先に討たれていた。③〜⑤の間、向いた組の兵のうち本人の十四歩より外の者だけ味方の刃と玉を弾く（真田丸・八尾若江と同じ形）。本人の一撃は通る
    if ((F._kShT = (F._kShT || 0) - dt) <= 0) {
      F._kShT = 0.5;
      const hs = new Set(F.step >= 3 && F.step <= 5 && P?.alive && !F.ending ? (F._hunters || []) : []);
      for (const u of rt.army.units) {
        const on = u.alive && !u.gone && !u.fleeing && hs.has(u.group) && !u.group.routed && u.group.focus === P;
        if (on && !u._kSh && u.invuln) continue;
        const want = on && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 14;
        if (want) { u._kSh = true; u.invuln = true; } else if (u._kSh) { u._kSh = false; u.invuln = false; }
      }
    }
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        // 11/17 クラウド：手勢の鉄砲が (-26,-116) で行き先へ進めず、近い敵を前に move のまま二十秒止まった（act bot）。
        //   追う間に四秒動けず敵が二十五歩内なら、その場で撃ち合わせる（主人公が三十歩より離れたら又追う）。
        const moved = F.mineC ? dist(c, F.mineC) : 9;
        F.mineC = { x: c.x, z: c.z };
        F.mineStill = g.order === 'move' && moved < 0.6 ? (F.mineStill || 0) + 0.6 : 0;
        const stuck = F.mineStill >= 4 && dist(c, P.pos) < 30 && rt.army.nearestEnemy({ pos: c, team: P.team }, 25, (o) => o.alive && !o.fleeing);
        if (stuck) {
          g.keepMoveOrder = false; g.order = 'attack'; g.anchor.x = c.x; g.anchor.z = c.z; g.seekRange = 20; F.mineStill = 0;
          for (const u of g.units) u.aiT = 0;
        } else if (F.mineStill >= 6 && g.dest) {
          // 11/19 05:25 クラウド（act bot 473秒）：手勢の最後の一人が畷 (9,-116) で本人を追う move のまま二十秒立った（二十五歩内に敵が無く、上の撃ち合いへも移れない）
          //   → 六秒動けなければ、追う先へ三歩まで送る（歩ける所だけ）
          for (const u of g.units) {
            if (!u.alive || u.gone || u.atk || u.swing) continue;
            for (let k = 0; k < 3; k++) {
              const dx = g.dest.x - u.pos.x, dz = g.dest.z - u.pos.z, d = Math.hypot(dx, dz);
              if (d < 2) break;
              const nx = u.pos.x + dx / d, nz = u.pos.z + dz / d;
              if (rt.world?.walkable?.(nx, nz) === false) break;
              u.pos.x = nx; u.pos.z = nz;
            }
          }
          F.mineStill = 0;
        } else if (g.order === 'attack' && F.mineStill === 0 && dist(c, P.pos) < 30 && dist(c, P.pos) > 8 && rt.army.nearestEnemy({ pos: c, team: P.team }, 25, (o) => o.alive && !o.fleeing)) {
          // 撃ち合いの最中は、本人が三十歩内にいる間は留まって撃つ
        } else if (dist(c, P.pos) > 8) {
          // 遠くの敵への狙いを解き、走る主人公へ手勢も駆けて追い付く。
          g.focus = null; g.onArrive = null; g.keepMoveOrder = true;
          g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 3 }; g.speed = 5;
        } else {
          // 追い付いた場所で戦う。出発点や途中の古い拠点へ戻らせない。
          g.anchor.x = P.pos.x + 2; g.anchor.z = P.pos.z + 3;
          g.keepMoveOrder = false; g.order = 'attack'; g.seekRange = 14;
        }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 11/19 02:10 クラウド（act bot・位置の記録 pos2）：貝塚の側で動かなかった大野治房・治胤の後続（陣立ての表の hold の備が本物になった物）が、
    //   ②の始め（百三秒）に共通の寄せで stay を外され attack（探す広さ六十八歩）に替わり、畷の北で退く本人を追った（②で本人の二十五歩内に敵五十余り・本人は避け続けて村へ戻れず②が百二十秒）。
    //   史実は治房の本隊は樫井へ来ない（K-k12 06:05 の幟だけの備と同じ）。この備は持ち場（貝塚の側）に留め、近づいた者だけ払う
    for (const g of rt.army.groups) {
      if (g.team !== 1 || !g._fjN || !g.count || g.routed) continue;
      g._k12Home ??= g.anchor ? { x: g.anchor.x, z: g.anchor.z } : null;
      if (!g._k12Home || (g.stay && g.order === 'hold')) continue;
      g.stay = true; g.order = 'hold'; g.focus = null; g.dest = null; g.seekRange = 16; g.aggro = 12;
      g.anchor = { x: g._k12Home.x, z: g._k12Home.z };
    }
    // 11/19 02:20 クラウド（act bot 228秒 倒れ）：焼いた安松の家の脇（熱の届く四歩内）に敵味方が立ったまま斬り合い、本人がそこへ引き込まれて火の熱で命を削られた。
    //   共通の火（castle_fall.js）は筋書きの炎（addBlaze）の兵を押し出さないので、燃えた家の六歩半内の兵（本人と馬上の将は除く）は外へ半歩ずつよける
    if (F.yasuLit) for (const o of rt.army.units) {
      if (!o.alive || o.isStruct || o.isPlayer || o.rider || o === P) continue;
      for (const h of F.yasuHouses) {
        const dx = o.pos.x - h.x, dz = o.pos.z - h.z, d = Math.hypot(dx, dz);
        if (d < 6.5 && d > 0.01) { o.pos.x += dx / d * 0.5; o.pos.z += dz / d * 0.5; break; }
      }
    }
    const el = rt.t - F.stepT, left = STEP_T[F.step] - el;
    // 殿が村の辻の後ろへ下がり切ったら（遅くとも三十五秒で）持ち場に戻して村で戦わせる
    if (F.kameRun && (F.step !== 3 || !live(F.kame) || dist(F.kame.center(), F.kameRun) < 8 || el > 35)) {
      const g = F.kame, a = F.kameRun; F.kameRun = null;
      if (live(g) && F.step <= 3 && !F.ending) { g.keepMoveOrder = false; g.retreatOnly = false; g.order = 'hold'; g.anchor = { x: a.x, z: a.z }; g.dest = null; g.seekRange = 18; g.aggro = 16; }
    }
    // 村と東の口への寄せは、全員の到着を待たない。家に残った一兵で迎撃が始まらない事を防ぐ。
    const incoming = F.step === 3 ? [F.hana, F.awa, ...(F.rest3 || [])] : F.step === 4 && !F.okaBack ? [F.oka] : null;
    if (incoming) for (const g of incoming) {
      if (!g || !(g.keepMoveOrder || g.order === 'move') || !live(g)) continue;
      const at = F.step === 3 ? VILLAGE : EAST;
      // 先頭の一人だけで寄せを解くと、後列が家の裏に残ったまま近くの敵へ向き直る。
      // 隊の中心が口へ入るまで行軍を続け、最後の一人の到着は待たない。
      // 11/18 クラウド（act bot 479秒）：岡部の隊の侍が東の口 (41,-43) で、八歩先の敵を前に move のまま二十秒立った。
      //   寄せて二十秒過ぎ、口の十二歩内に着いた兵が居れば、隊の中心を待たずに斬り合いへ移す。
      if (dist(g.center(), at) < 18 || (el > 20 && g.units.some((u) => u.alive && !u.gone && dist(u.pos, at) < 12)) || el > 50) {
        g.keepMoveOrder = false; g.marching = false; g.noEngage = false; g.onArrive = null;
        g.order = 'attack'; g.anchor.x = at.x; g.anchor.z = at.z;
        g.seekRange = 24; g.aggro = 16;
        // 11/18 15:15 クラウド：③は本人が四人討つまで（遅くとも八十秒）崩れない（四十五秒で塙の隊が崩れ、本人の討ち取り0のまま③が済んだ）
        if (el > 40 && (F.step !== 3 || (F.s3Kills || 0) >= 4 || s3El(rt) >= 80)) g.noRout = false;
      }
    }
    // 退いた敵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && (u.pos.z < -170 || u.pos.x > 140) && dist(u.pos, P.pos) > 70) rt.army.despawn(u);
      // 11/17 クラウド（act bot 286秒）：本人から遠い東の田 (57,-117) で、敵の新手の足軽が七歩先の味方を前に attack のまま二十秒立ち尽くした。
      //   本人から四十五歩より遠く、十二秒動かない名無しの敵は戦場から下げる（見えない所の止まりで本物の兵の枠を埋めない）
      for (const u of rt.army.units) {
        // 11/18 クラウド（act bot 444秒）：敵の新手の鉄砲が本人の二歩先で、狙いを持たず六秒立った（本人は十三分で討ち取り0）。
        //   本人の三歩半内で狙いの無い名無しの敵は本人へ向かせる（控えの備＝aggro 0 は外す）
        if (u.alive && !u.gone && u.team !== P.team && !u.name && !u.fleeing && !u.target && !u.atk && !u.noTarget && P.alive && !P.noTarget &&
            u.group?.aggro !== 0 && dist(u.pos, P.pos) < 3.5) { u.target = P; u.aiT = 0; }
        if (!u.alive || u.gone || u.team === P.team || u.name || u.isPlayer || u.fleeing || u.group?.order !== 'attack' || u.group?.stay || F.foes.includes(u.group)) { u._k12s = null; continue; }   // 筋書きの隊・控えて待つ備は外す（新手だけ）
        const s = u._k12s;
        if (!s || dist(u.pos, s) > 0.6) { u._k12s = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
        if (rt.t - s.t > 12 && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
      }
    }
    if (F.hanaU && !F.hanaU.alive && !F.hanaDown) this.hanawaFalls(rt);
    if (F.hanaDown) {
      const awa = F.awaU;
      // 北の口から辻までは三十歩余り。斬り込む前に倒さず、接敵後は実際の槍・弾で討たれる。
      if (awa?.alive) {
        // 11/17 クラウド kaito2（K365）：淡輪の手が北の口で新手の群れに阻まれて辻へ着けず、⑤が四分以上止まった。四十秒で辻の外でも迎え撃てるように
        if (awa.noTarget && (dist(awa.pos, VILLAGE) < 20 || rt.t - F.hanaDownT > 20)) {
          // 接敵前の保護は残し、村へ入った将を浅野勢も迎え撃てるようにする。
          // 無敵のままでは索敵から外れ、六歩以内の接触待ちが長引く。
          awa.noTarget = false; awa.allyOk = true;
          if (live(F.awaG)) { F.awaG.stay = false; F.awaG.order = 'attack'; F.awaG.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 }; F.awaG.keepMoveOrder = false; F.awaG.marching = false; F.awaG.seekRange = 40; F.awaG.aggro = 16; }
        }
        // 村へ入って迎撃を受けた後は、追い合いで辻から離れても保護を戻さない。
        if (F.awaContactT == null && !awa.noTarget &&
            // 倒れた者や戦列を離れた負傷者のそばを通っただけでは、槍を合わせた事にしない。
            rt.army.nearestEnemy(awa, 6, (u) => u.alive && !u.gone && !u.fleeing && !u.noTarget &&
              !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.isStruct && !u.civ)) {
          F.awaContactT = rt.t;
          awa.mustLive = false; awa.invuln = false; delete awa.onWound;
          awa.maxHp = Math.min(awa.maxHp, 180); awa.hp = Math.min(awa.hp, awa.maxHp);
        }
      }
      // それでも七十五秒を過ぎたら、史実どおり浅野の永田治兵衛が首を取る（終わらない⑤にしない）
      // 11/19 06:20 クラウド（位置の記録 2本）：団右衛門が討たれた後、淡輪を待つ四十秒は本人が逃げる侍衆を見送るだけの間＝四十→二十八秒（迎え撃ちの解きは二十秒）
      if (awa?.alive && rt.t - F.hanaDownT > 28) { awa.invuln = false; awa.mustLive = false; rt.army.kill(awa); if (!awa.alive) rt.say('永田治兵衛', '淡輪重政、討ち取ったり！', 2.6); }
      if (!awa?.alive && rt.t - F.hanaDownT >= 2.6) this.win(rt);
      return;
    }
    // 11/18 クラウド k12：①の討ち取りが0〜2のまま（9本）。先手が畷に着く前に殿・池の堤の鉄砲が半ばを崩していた。
    //   本人が先手に三度当てるまで（遅くとも七十秒）殿と堤の鉄砲は込めたまま待ち、先手を本人の槍の間合いまで通す（近すぎる敵は撃つ）
    //   一本目（718秒）は①56秒・討ち取り2のまま＝殿の槍と手勢が先に半ばを討っていた。①の間は殿・手勢の打ちを和らげ（受けて支える役）、
    //   本人が先手を四人討つまで（遅くとも七十秒）続ける
    { const hold = F.step === 1 && (F.s1Kills || 0) < 4 && rt.t - F.stepT < 70;
      for (const g of [F.kame, F.pondGuns]) if (g) g.fire = !hold;
      // 11/18 22:55 クラウド（POSLOG で討った者を数えた）：0.35倍でも殿が四十二秒までに先手二十四人のうち十三人を討ち、本人は一人。
      //   ①の間の殿は槍衾で受けて支える打ち（0.12倍）、手勢は 0.3倍に（兵の数・刻限は変えない）
      if (F.kame) F.kame.dmgMult = hold ? 0.12 : 1;
      if (F.mine) F.mine.dmgMult = hold ? 0.3 : 0.9;
      // 11/18 14:50 クラウド（act bot：③が26〜42秒で済み本人の討ち取り0〜4）：村の辻でも上田・知近の備えと殿が先に半ばを討っていた。
      //   本人が塙・淡輪を四人討つまで（遅くとも八十秒）、備えは家並みで受けて支える打ちにする（①の畷と同じ形）
      if (F.step === 3 && F.s3ContactT == null && [F.hana, F.awa].some((g) => g?.units.some((u) => u.alive && !u.name && (dist(u.pos, VILLAGE) < 22 || dist(u.pos, P.pos) < 15)))) F.s3ContactT = rt.t;
      const hold3 = s3Quiet(rt);
      for (const g of [F.ueda, F.tomo]) if (g) g.dmgMult = hold3 ? 0.4 : 1;
      if (F.kame && F.step === 3) F.kame.dmgMult = hold3 ? 0.4 : 1;
      // 11/18 17:55 クラウド（位置の記録 1751）：③で本人の二十五歩内に共通の「味方の新手」が二十〜二十六人付き従い、
      //   塙・淡輪が辻へ着いて三十五秒で二十八人→十四人（本人の討ち取り1）。備えと同じく、その間は打ちを和らげる（0.6・前の試しの全隊0.4より軽く）
      if (F.step >= 3 && F.step <= 4) for (const g of rt.army.groups || []) if (g.name === '味方の新手') g.dmgMult = hold3 ? 0.3 : 1;   // 23:15 0.6 でも POSLOG の一本で③に塙・淡輪を二十人討った→0.3
      if (F.step === 3 && (F.s3Kills || 0) >= 4) for (const g of [F.hana, F.awa]) if (g && !g.keepMoveOrder) g.noRout = false; }
    if (F.step === 1) {
      const k = F.w1S - sumN(F.hana1, F.oka1), need = Math.round(F.w1N * 0.5);
      rt.objProgress('s1', `塙・岡部の先手 ${Math.min(k, need)}／${need}人`);
      // 殿に加わって攻撃してから退く。味方が全員を崩した場合も、本人が畷へ出て攻撃すれば進む。
      if ((P.atk || P.swing) && dist(P.pos, YASU) < 28 &&
          ([F.hana1, F.oka1].some((g) => g?.units.some((u) => combatant(u) && dist(u.pos, P.pos) < 6)) || (F.oka1 && sumN(F.hana1, F.oka1) === 0))) F.vanguardJoined = true;
      // 11/18 08:22 クラウド（act bot 9本・位置の記録）：本人が一度当てた所で殿の鉄砲が先手の半ばを崩し、①の討ち取りが0〜2のまま②へ。
      //   本人が先手に三度当てるか、先手の残りが四人を切るか、百秒を過ぎるまでは畷の斬り合いを続ける
      if (F.vanguardJoined && F.oka1 && k >= need && ((F.s1Hits || 0) >= 3 && (F.s1Kills || 0) >= 4 || sumN(F.hana1, F.oka1) < 4 || left <= T1 - 100)) this.toStep(rt, 2);
      else if (F.vanguardJoined && left <= 0) { rt.say('亀田高綱', 'これ以上は持たぬ。退け！', 2.6); this.toStep(rt, 2); }
      // 11/18 クラウド k365-cloud-28：act bot が畷の二十八歩の輪の外で新手と斬り合い続け、①が 452 秒続いた（参戦の印が立たない）。
      //   刻限を一分過ぎて畷の六十歩内にいれば、どこに居ても二分過ぎれば、亀田の退きの下知で②へ
      else if (left <= -60 && dist(P.pos, YASU) < 60 || left <= -120) { F.vanguardJoined = true; rt.say('亀田高綱', 'これ以上は持たぬ。退け！', 2.6); this.toStep(rt, 2); }
    } else if (F.step === 2) {
      // 殿の足場：構えて撃つ間（3 秒）が過ぎたら次の足場へ
      if (F.legHold && rt.t - F.legT > 3 && F.leg < LEGS.length - 1) { F.leg++; this.kameLeg(rt); }
      // 主人公が村の南の端に着き、殿も村まで退いたら③（殿が遅れても 20 秒で村の戦へ）。時が尽きても負けにしない（十一1）
      const here = P.pos.z > LINE.z - 12 && dist(P.pos, LINE) < 24;
      if (here) F.hereT ??= rt.t;
      else F.hereT = null;  // 村を離れた間は殿を待った時間に含めない
      const kc = live(F.kame) && F.kame.center();
      // 11/14 クラウド：act bot で②の退きが 62→860 秒続き、③の村の戦の途中で刻限が尽きた（村の南の端の輪に入れず）。段の長さ＋二分を過ぎ、本人が村の南の端の五十歩の内なら③へ
      // 11/17 クラウド kaito2（K365）：act bot が北で追手と斬り合い続け、②が 75→800 秒続いて時切れで負けた。段の長さ＋三十秒で七十歩の内、＋八十秒ならどこに居ても村の戦へ（塙・淡輪は街道を下って本人の前を通る）
      if ((here && (!kc || kc.z > VILLAGE.z - 6 || rt.t - F.hereT > 20)) || (el > STEP_T[2] + 10 && dist(P.pos, LINE) < 70) || el > STEP_T[2] + 40) this.toStep(rt, 3);   // 11/18 クラウド k365-cloud-28：act bot で②が＋80秒の180秒まで続き、戦が九分。＋10秒（七十歩内）・＋40秒（どこでも）に
      // 殿が先に着いても、本人の帰着までは②を済ませない。知らせは一度だけ。
      else if (!F.returnNotice && el > STEP_T[2] + 60 && (!kc || kc.z > VILLAGE.z - 6)) {
        F.returnNotice = true;
        rt.say('上田宗箇', '殿は村へ着いた。急ぎ村の南の端へ戻られよ！', 3);
      }
    } else if (F.step === 3) {
      const k = F.w3N - sumN(F.hana, F.awa), need = Math.round(F.w3N * 0.5);
      rt.objProgress('s3', `塙・淡輪の隊 ${Math.min(k, need)}／${need}人`);
      // 11/18 19:55 クラウド（位置の記録 1949）：③へ移った時に本人が村の北 (−20,−87) に居て息が4のまま、③の討ち取り1。
      //   村の南の端の輪（③へ移る時だけ）に入れなかった時も、③の始めに辻の五十歩内へ着いた一度だけ、家並みの陰で息を整える
      if (!F.s3Rest && s3Quiet(rt) && dist(P.pos, VILLAGE) < 50 && rt.player.sta < rt.player.maxSta * 0.6) { F.s3Rest = true; rt.player.sta = rt.player.maxSta; }
      // 村の辻で攻撃してから達成。先に全員が崩れた場合も、辻へ出て攻撃するまでは済ませない。
      if ((P.atk || P.swing) && dist(P.pos, VILLAGE) < 20 &&
          ([F.hana, F.awa].some((g) => g?.units.some((u) => combatant(u) && dist(u.pos, P.pos) < 6)) || (F.hana && F.awa && sumN(F.hana, F.awa) === 0))) F.villageJoined = true;
      // 11/17 クラウド kaito2（K365）：act bot で③が 440 秒続いた（辻の二十歩の輪の外で塙・淡輪の隊と斬り合い、参戦の印が立たない）。刻限を過ぎたら村の五十歩の内で槍を振っていれば参戦とする
      if (!F.villageJoined && left <= 0 && (P.atk || P.swing) && dist(P.pos, VILLAGE) < 50) F.villageJoined = true;
      // 刻限を一分半過ぎても村の外で斬り合っていたら、村の戦は上田・知近の備えで片が付いた事にして④の横撃へ（八尾の late と同じ。十一1）
      if (!F.villageJoined && left <= -20) F.villageJoined = true;   // 11/19 クラウド：act bot で③が百五十秒。-45→-20秒
      // 11/18 04:28 クラウド：act bot 2本で③が百九十五秒まで延びた（塙・淡輪は半ばまで討たれたのに、本人が辻の輪の外で参戦の印が立たない）。刻限が来て半ばを討っていれば村の戦は決したとする
      if (!F.villageJoined && left <= 0 && k >= need) F.villageJoined = true;   // 11/18 クラウド k365-cloud-28：-90秒・百二十歩内→-45秒・どこでも（act bot で③が二百四十秒）
      // 11/17 クラウド：辻で斬り合い続けても塙・淡輪の兵と六歩に入れず、③が七百秒止まった（act bot）。
      //   辻で二十五秒戦い続ければ参戦とし、刻限を一分過ぎて辻の近くにいれば進める。
      if (dist(P.pos, VILLAGE) < 32 && (P.atk || P.swing)) F.villageFightT = (F.villageFightT || 0) + F.scanT;
      if (!F.villageJoined && (F.villageFightT >= 25 || (left < -60 && dist(P.pos, VILLAGE) < 40))) F.villageJoined = true;
      // 11/18 クラウド（act bot・位置の記録）：塙・淡輪の半ばを討ち、残りも逃げて辻の四十歩内に敵が居ないのに、本人は辻で振る相手が無く③が三十秒余り刻限を待った。辻に居れば済ませる
      if (!F.villageJoined && k >= need && dist(P.pos, VILLAGE) < 32 && ![F.hana, F.awa].some((g) => g?.units.some((u) => combatant(u) && dist(u.pos, VILLAGE) < 40))) F.villageJoined = true;
      // 11/18 14:50 クラウド：本人が四人討つか、塙・淡輪の残りが四人を切るか、九十秒を過ぎるまでは村の戦を続ける（刻限が来れば進む）
      const mine3 = (F.s3Kills || 0) >= 4 || sumN(F.hana, F.awa) < 4 || el > 90 || left <= 0;
      if (F.villageJoined && mine3 && (k >= need || left <= 0)) this.toStep(rt, 4);
    } else if (F.step === 4) {
      const k = F.w4N - aliveN(F.oka), need = Math.round(F.w4N * 0.5);
      if (!F.okaBack) rt.objProgress('s4', `岡部の隊 ${Math.min(k, need)}／${need}人`);
      // 東の口か、そこへ寄せる岡部の隊へ出て迎える。村に残ったまま時間だけで横を守った事にしない。
      const oc = live(F.oka) && F.oka.center();
      if ((P.atk || P.swing) && (dist(P.pos, EAST) < 20 || (oc && dist(oc, EAST) < 70 && dist(P.pos, oc) < 20)) &&
          (F.oka?.units.some((u) => combatant(u) && dist(u.pos, P.pos) < 6) || (okabeCleared(F) && dist(P.pos, EAST) < 20))) F.eastJoined = true;
      // 味方が先に半数を押し返した時も、東の口で実際に迎え続けた本人を取り残さない。
      // 遠くの残兵との六歩以内の接近だけを待つと、刻限まで段が終わらなかった。
      if (dist(P.pos, EAST) < 20 && (P.atk || P.swing)) F.eastDefenseT = (F.eastDefenseT || 0) + F.scanT;
      if (!F.eastJoined && k >= need && F.eastDefenseT >= 25) F.eastJoined = true;
      // 11/17 クラウド：本人が村の南の端で鉄砲と戦い続け、東の口へ寄れず④が四百秒止まった。刻限を一分過ぎ、東の口の六十歩内で戦っていれば迎えた事にする
      if (!F.eastJoined && left < -60 && dist(P.pos, EAST) < 60 && (P.atk || P.swing)) F.eastJoined = true;
      // 11/17 クラウド kaito2（K365）：act bot が崩れた岡部の兵を戦場の北東の隅（212,−203）まで追い、④が 546→1080 秒止まった。刻限を二分過ぎたら上田の備えが押し返した事にして岡部は退く（史実でも岡部は先に逃げた）
      if (!F.okaBack && left < -30) F.eastJoined = true;   // 11/19 クラウド：act bot で④が百五十四秒。-60→-30秒   // 11/18 クラウド k365-cloud-28：-120→-60秒（act bot で④が二百三十秒）
      if (!F.okaBack && F.eastJoined && (k >= need || left <= 0)) this.okabeBack(rt);
    } else if (F.step === 5) {
      // 団右衛門は名乗った相手（主人公）が近ければ主人公に打ち掛かる。他の兵を追って村の外の田まで馬で駆け回らせない（11/7 遊んで五分追い回した）
      const H = F.hanaU;
      // 11/17 クラウド kaito2（K365）：act bot で⑤が 225→649 秒続いた。一分半を過ぎたら団右衛門は矢傷で弱り（史実も矢を受けて討たれた）、本人の二三合で止めを刺せる
      // 11/18 クラウド kaito2（K365・まとめの枝の act bot）：本人が戦場の隅（−200,−196）まで離れ、⑤が 179→1080 秒止まって時切れ。三分を過ぎて本人が村から八十歩より遠ければ、団右衛門は浅野の侍に討たれる（史実でも多胡助左衛門らに討たれた。本人の手柄にはしない）
      // 11/18 04:20 クラウド：act bot 471秒で、本人が十四歩先で団右衛門と向き合う最中に二分半の刻限で味方に討たれ、手柄が消えた。本人が二十五歩内に居る間は三分半まで待つ
      if (H?.alive && (el > 140 && dist(P.pos, VILLAGE) > 80 || el > 120 && dist(H.pos, P.pos) > 25 && !(dist(H.pos, P.pos) < 45 && dist(P.pos, VILLAGE) < 60) || el > 170)) {   // 11/19 07:20 クラウド（位置の記録）：本人が手負いで三十五歩下がった間に二分で味方の手に。打ち掛かる（ride）の輪の内なら三分弱まで待つ   // 11/19 クラウド：act bot で⑤が百七十八秒・戦が五百五十秒。二分・二分二十秒・二分五十秒に   // 11/18 クラウド k365-cloud-28：村の内で斬り合っても⑤が二百八十秒（act bot）。二分半で史実どおり討たれる
      // 11/19 07:15 クラウド（act bot 570秒）：三分を過ぎた時に本人が二十五歩内で団右衛門と向き合っていたのに、刻限で味方の手になり手柄の名が0だった。
      //   本人が二十五歩内なら、本人の手として討つ（「討ち取ったり」と手柄の名を付ける）
      H.invuln = false; H.mustLive = false; H.noTarget = false;
      if (dist(H.pos, P.pos) < 25 && H.onWound) H.onWound(P);
      if (H.alive && !H.dying) rt.army.kill(H); }
      if (H?.alive && el > 60 && !F.hanaWeak) { F.hanaWeak = true; H.hp = Math.min(H.hp, 45); H.dmg = Math.min(H.dmg || 12, 8); rt.say('亀田高綱', '団右衛門は矢傷を負うた。今ぞ、止めを！', 2.8); }
      if (H?.alive) {
        const dp = dist(H.pos, P.pos);
        // 侍衆が崩れても団右衛門は退かない（史実で村の中で討たれた。崩れて川の南まで馬で駆け去った。11/7 遊んで）
        if (H.fleeing) { H.fleeing = false; F.hata.order = 'attack'; F.hata.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 }; }
        // 近い主人公でも村の外までは追わない。帰る途中も目標を取り直して引き返さない。
        // 11/18 クラウド：ただし本人が六歩内で向き合っている間は、村の口（四十歩内）なら帰らずに斬り合う
        //   （act bot 540秒：本人の目の前で団右衛門が move のまま六秒何もしなかった）
        // 11/19 クラウド（act bot・位置の記録）：本人が北の口で十一〜二十五歩まで寄ったのに、団右衛門は辻へ帰る move のまま焼けた安松の家の間 (10,-78) に
        //   八十秒立ち、本人は侍衆に阻まれて届かず刻限で味方が討った（名のある将 本人0）。本人が二十五歩内なら北の口（辻の四十五歩内）でも帰らずに打ち掛かる
        // 11/19 07:00 クラウド（act bot 538秒）：⑤で本人が村の外れ四十歩で他の兵と斬り合う間、団右衛門は辻へ帰り、二分で本人から離れた所で討たれた（名のある将 本人0）。
        //   矢傷を負った後（一分過ぎ）は、本人が村の六十歩内・四十五歩内に居れば、団右衛門の方から本人へ打ち掛かる（史実も手負いで敵中へ斬り込んだ）
        const ride = F.hanaWeak && dp < 45 && dist(P.pos, VILLAGE) < 60;
        const faceOff = ride || dp < 6 && dist(H.pos, VILLAGE) < 40 || dp < 25 && dist(H.pos, VILLAGE) < 45 && dist(P.pos, VILLAGE) < 50;
        if (!faceOff && (dist(H.pos, VILLAGE) > 26 || dist(P.pos, VILLAGE) > 30)) {
          H.target = null; H.aiT = 0;
          F.hata.focus = null; F.hata.keepMoveOrder = true; F.hata.marching = true; F.hata.seekRange = 0; F.hata.aggro = 0;
          F.hata.order = 'move'; F.hata.dest = { x: VILLAGE.x, z: VILLAGE.z - 6 };
          // 到着後の拠点も辻へ移す。北の口のままでは、接敵が切れるたびに村の外へ戻ってしまう。
          F.hata.onArrive = (q) => { q.order = 'attack'; q.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 }; q.keepMoveOrder = false; q.marching = false; q.seekRange = 24; q.aggro = 16; };
        } else {
          // 本人が村へ戻れば戦う。家並みに残った侍衆の到着を待つと、
          // 移動優先と索敵ゼロが残り、目の前の主人公とも槍を合わせられない。
          if (F.hata.keepMoveOrder) {
            F.hata.onArrive = null; F.hata.keepMoveOrder = false; F.hata.marching = false;
            F.hata.order = 'attack'; F.hata.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 };
            F.hata.seekRange = 24; F.hata.aggro = 16;
          }
          // 狙いを付け替える時だけ考え直させる。毎回 aiT を 0 に戻すと団右衛門は構えたまま一度も打ち込まず、
          //   隙を待つ遊び手とにらみ合いのまま刻限が尽きた（11/10 クラウド係の描かない試し：命 63/180 で四分止まり）
          if ((dp < 30 || ride) && H.target !== P) { H.target = P; H.aiT = 0; }
        }
      }
    }
  },

  // 攻撃中の姿勢は一瞬なので、四分の一秒ごとの見回りだけでは槍を合わせた事を取りこぼす。
  // 討ち取りを味方に譲った場合も、実際に当てた時点でその場所での参戦を残す。
  onPlayerHit(rt, v) {
    const F = rt.flags, P = rt.player.u;
    if (F.ending || rt.over || v.team === P.team || v.noTarget || !combatant(v)) return;
    if (F.step === 1 && (v.group === F.hana1 || v.group === F.oka1) && dist(P.pos, YASU) < 28) { F.vanguardJoined = true; F.s1Hits = (F.s1Hits || 0) + 1; }
    if (F.step === 3 && (v.group === F.hana || v.group === F.awa) && dist(P.pos, VILLAGE) < 20) F.villageJoined = true;
    if (F.step === 4 && v.group === F.oka && dist(P.pos, v.pos) < 6 && dist(v.pos, EAST) < 70) F.eastJoined = true;
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    // 敗北後の余韻中に届いた攻撃で、討ち取りの札・手柄・目標の達成を追加しない。
    if (F.ending || rt.over) return;
    if (F.step === 1 && k?.isPlayer && (v.group === F.hana1 || v.group === F.oka1)) { F.s1Kills = (F.s1Kills || 0) + 1; if (dist(rt.player.u.pos, YASU) < 28 || F.s1Kills >= 2) F.vanguardJoined = true; }   // 11/19 05:05 クラウド（act bot 660秒）：本人が先手を畷の五十歩北まで追って討ち、二十八歩の輪の外で参戦の印が立たず①が二百四十秒続いた → 先手を二人討てば、どこでも参戦とする
    if (F.step === 3 && k?.isPlayer && (v.group === F.hana || v.group === F.awa)) { F.s3Kills = (F.s3Kills || 0) + 1; if (dist(rt.player.u.pos, VILLAGE) < 20) F.villageJoined = true; }
    if (F.step === 4 && k?.isPlayer && v.group === F.oka && dist(rt.player.u.pos, v.pos) < 6 && dist(v.pos, EAST) < 70) F.eastJoined = true;
    if (v.name === '塙団右衛門') F.hanaByMe = !!k?.isPlayer;
    if (v.name === '淡輪重政') {
      // 誰の手か分かるように（史実では浅野の永田治兵衛が首を取った）
      rt.banner('淡輪重政、討ち取ったり', k?.isPlayer ? nm(rt) + 'の槍' : k?.name ? k.name + 'が討ち取る' : k?.group?.name ? k.group.name + 'が討ち取る' : '浅野勢が討ち取る');
      if (k?.isPlayer) rt.award((t) => { if ((t.special?.pts || 0) < 18) t.special = { label: '淡輪重政を討ち取った', pts: 18 }; }, '淡輪重政を討ち取った');
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike, canStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    // 団右衛門の討死後は淡輪の斬り込みを迎える。村の味方が散った時も、
    // ピンが消えた後の南の備えへ戻って接触待ちを終わらせられなくしない。
    if (F.hanaDown && F.awaU?.alive && F.awaContactT == null) {
      if (p.lock) inp.e.add('KeyQ');
      inp.guardHold = false;
      goTo(p, inp, F.awaU.pos.x, F.awaU.pos.z, 3);
      return;
    }
    // 味方が先に全員を崩した時だけ、その場所へ出て槍を構える。
    // 半数を崩しただけなら、残る敵と槍を合わせる。空振りで交戦を飛ばさない。
    // 敵がいないと patientStrike を呼べず、参戦の判定を待ったまま止まっていた。
    // 未到着・棒立ちの本人を済ませる条件は変えない。
    const cleared = F.step === 1 ? F.hana1 && F.oka1 && sumN(F.hana1, F.oka1) === 0
      : F.step === 3 ? F.hana && F.awa && sumN(F.hana, F.awa) === 0
      : F.step === 4 ? !F.okaBack && okabeCleared(F) : false;
    if (cleared) {
      const t = F.step === 1 ? YASU : F.step === 3 ? VILLAGE : EAST;
      if (p.lock) inp.e.add('KeyQ');
      inp.guardHold = false;
      goTo(p, inp, t.x, t.z, 2);
      inp.leftPressed = dist(u.pos, t) < 6 && p.cd <= 0 && !p.pending && p.sta > p.maxSta * 0.35;
      return;
    }
    // 止めを主人公に任せる将も、手傷を負わせられる間は狙う。控えの淡輪は noTarget で外す。
    const objectiveGroups = F.step === 1 ? [F.hana1, F.oka1]
      : F.step === 3 ? [F.hana, F.awa] : F.step === 4 ? [F.oka, F.okaKiba] : null;
    const field = F.step === 1 ? YASU : F.step === 3 ? VILLAGE : F.step === 4 ? EAST : null;
    // 11/18 02:55 クラウド（描かずの通し）：③で塙・淡輪の隊は辻の北二十〜三十歩の家並みで味方と斬り合い、本人は辻に六十秒立ち尽くして討ち取り0。
    //   遊ぶ人なら見えている斬り合いへ寄るので、③の輪を十八→三十歩に
    // 11/18 15:25 クラウド（位置の記録）：③で塙・淡輪が村の北（z−90〜−100）で本人とぶつかっても、輪の外なので本人は避けて回り討ち取り0〜3。
    //   遊ぶ人は街道を下って来る隊に槍を合わせるので、③は辻の六十歩内（安松の家並みまで）の塙・淡輪を相手にする
    const fieldRadius = F.step === 1 ? 26 : F.step === 3 ? 60 : 30;
    // 前の段の追手や控えの備を追い続けず、目標の隊へ進む。
    // 別隊でも三歩以内で行く手を塞ぐ敵は払い、すり抜けて進ませない。
    const ok = (o) => combatant(o) && !o.noTarget && (!o.invuln || (F.step === 5 && o === F.hanaU)) &&
      (!objectiveGroups || (objectiveGroups.includes(o.group) && dist(o.pos, field) < fieldRadius) || dist(o.pos, u.pos) < 3) &&
      canStrike(p, o) && !o.rearWound && Math.abs(o.pos.y - u.pos.y) < 3;
    // ⑤：団右衛門が近ければ本人へ（侍衆が間にいればそちらから）
    const H = F.step === 5 && F.hanaU?.alive && Math.hypot(F.hanaU.pos.x - u.pos.x, F.hanaU.pos.z - u.pos.z) < 14 ? F.hanaU : null;
    // ⑤：団右衛門が遠い間は、行く手を塞ぐ者（三歩以内）だけ払って本人へ向かう。北の口に湧く後詰と九歩の輪で斬り合い続け、
    //   団右衛門に届かず八分止まって刻限が尽きた（11/10 クラウド係の流し：段5で 571→1080 秒）
    const reach = F.step === 5 && F.hanaU?.alive ? 3 : 9;
    const e = F.step === 2 ? null : (b.army.nearestEnemy(u, reach, ok) || H);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    // 退く時や、討てない控えの将を外した時は、前の相手への注視も解いて行き先へ向く。
    if (p.lock) inp.e.add('KeyQ');
    inp.guardHold = false;
    // 家を横切る仮の行き先は作らず、兵と同じ角回りを goTo の moveWay で辿る。
    const t = this.missionPin(b) || LINE;
    goTo(p, inp, t.x, t.z, 2);
  },
};
// 陣立ての厚み（army_depth.js）・命懸けの戦場（lethal.js）・この戦の怖さ（殿が取り残される・家並みの乱戦）
k12_kashii.depth = DEPTH12;
k12_kashii.lethal = true;
k12_kashii.fearKind = { kind: '殿', note: '少ない殿で大勢を受け、退く', w: { losses: 1.3, iso: 1.5 }, line: '取り残されるぞ！' };
k12_kashii.sides = { a: { name: '浅野勢', mon: 'asano' }, b: { name: '塙・岡部の先手', mon: 'toyotomi' } };
k12_kashii.force = (rt) => ({ a: Math.round(5000 - (rt.flags.ak || 0) * 5), a0: 5000, b: Math.max(0, Math.round(3000 - (rt.flags.ek || 0) * 7)), b0: 3000 });
// 11/17 クラウド kaito2（K365）：味方の討死一人を二十人にすると、勝った浅野が 5,000 から 1,920 まで減って見えた（史実は浅野の損は少ない）。味方は一人を五人、敵は七人に   // 討った一人を十人に。先手は崩れて退き、零にはならない（遊んで敵が残るのに 0 と出た）
k12_kashii.date = () => '慶長二十年（1615）四月二十九日　朝';
k12_kashii.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k12_kashii.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k12_kashii.history = '慶長二十年（1615）四月、大坂城は堀を埋められて再び戦になった（夏の陣）。紀州の浅野長晟はおよそ五千で北上したが、大野治房の軍の先手を見つけて樫井まで退くと決め、亀田高綱を安松に殿として残した。二十九日の朝八時ごろ、塙団右衛門（直之）の手が熊野街道を寄せ、安松の八丁畷で戦が始まった。亀田は鉄砲で撃っては退き、敵を樫井の村へ引き寄せた。村の中で両軍が入り乱れ、上田宗箇・浅野知近らが加わる。岡部則綱は横から攻めたが退き、塙と淡輪重政ら名のある者十二人が討たれた。治房の本隊は貝塚から動かず、大坂へ引き上げた。のちに亀田と上田は団右衛門を討った手柄を争い、亀田は浅野家を去った。';
k12_kashii.bushou = [{ name: '塙団右衛門', g: /団右衛門/ }, { name: '岡部則綱', g: /則綱/ }, { name: '淡輪重政', g: /重政/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
// 段の一覧も右上の①〜⑤と同じ字（負けの札・勝ちの札で言い替えない。十1）
STAGES.k12_kashii = STEP_TEXT.slice(1).map((s, k) => (k ? [s, st(k + 1)] : [s]));
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）
KILLS.k12_kashii = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1N, F.w1N - (F.w1S - sumN(F.hana1, F.oka1)), F.w1N * 0.5);
  if (F.step === 3) return cut(F.w3N, sumN(F.hana, F.awa), (F.w3N || 1) * 0.5);
  if (F.step === 4 && !F.okaBack) return cut(F.w4N, aliveN(F.oka), (F.w4N || 1) * 0.5);
  return null;
};

export { k12_kashii };
export default k12_kashii;
