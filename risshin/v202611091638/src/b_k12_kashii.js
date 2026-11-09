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
import { revealName } from './battle_intel.js';
import * as jin12 from './k12/jindate.js';
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
const RIVER = [[-230, 6], [-110, -3], [-30, 1], [40, -1], [110, 5], [230, -2]];
const ROAD = [[6, 230], [4, 150], [4, 90], [2, 30], [0, 0], [-2, -50], [-4, -120], [-4, -230]];
const ASANO_HON = { x: 6, z: 120 };          // 浅野長晟の本陣（川の南で動かない）
const FROM_N = { x: -4, z: -212 };           // 豊臣の先手が寄せて来る所（貝塚・佐野の側）
const FROM_E = { x: 150, z: -110 };          // 岡部の隊が回り込んで来る所（東の田の向こう）
const OKA_WAIT = { x: 104, z: -78 };         // 岡部の隊が控える所（蟻通の松原の陰）
const EXIT_N = { x: -4, z: -224 };           // 豊臣の退き口
// 段の目安の時間（秒）。時が尽きても負けにはしない（主人公のせいでない失敗を作らない。十一1・十二3）。史実の流れで次へ進む
const T1 = 160, T2 = 100, T3 = 210, T4 = 110;
// 目標の字は右上の①〜⑤・段の一覧（STAGES）・負けの札で同じ（十1：言い替えない）。場所は地図で分かる名で
const STEP_TEXT = ['',
  '安松の八丁畷で亀田高綱と並び、畷を寄せる塙の先手を討て',
  '撃ちながら畷を退き、樫井の村の南の端の上田宗箇の備えまで戻れ',
  '樫井の村の辻で、攻め入る塙・淡輪の隊を討て',
  '村の東の口で、横を突く岡部則綱の隊を押し返せ',
  '村の北の口から斬り込む塙団右衛門を討て'];
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
//   田一枚ごとに平らな水の面を一枚。早苗の列を描いた一枚の絵を使い回し、面は全部を一つにまとめる（携帯の重さを増やさない）
let riceTex = null;
function seedlingTex() {
  if (riceTex) return riceTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  // 水は空の明るさを映した濁りの灰緑（暗い色では遠くから黒い板に見えた。11/7 遊んで）
  g.fillStyle = '#6e7666'; g.fillRect(0, 0, 256, 256);
  // 濁りのむら
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${96 + (i * 37) % 30},${100 + (i * 17) % 22},${84 + (i * 11) % 16},0.22)`; g.beginPath(); g.arc((i * 97) % 256, (i * 61) % 256, 8 + (i * 13) % 22, 0, 7); g.fill(); }
  // 早苗の株：30cm おきの列（一枚の田 14m に 46 列のうち、絵一枚に 12 列を繰り返す）。遠くからは緑の筋に見える太さ
  for (let r = 0; r < 12; r++) for (let k = 0; k < 12; k++) {
    const x = r * 21.3 + 10 + ((k * 7) % 3), y = k * 21.3 + 10 + ((r * 5) % 3);
    g.fillStyle = (r + k) % 3 ? '#86a648' : '#74963c';
    for (let b = 0; b < 6; b++) g.fillRect(x + (b - 2.5) * 1.7, y - 4 + (b % 2), 1.6, 8);
  }
  riceTex = new THREE.CanvasTexture(c); riceTex.wrapS = riceTex.wrapT = THREE.RepeatWrapping; riceTex.colorSpace = THREE.SRGBColorSpace; riceTex.anisotropy = 4;
  return riceTex;
}
function paddyWater(W) {
  const pos = [], uv = [], idx = [];
  const quad = (x0, z0, x1, z1, y, rep) => {
    const n = pos.length / 3;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    uv.push(0, 0, (x1 - x0) / rep, 0, (x1 - x0) / rep, (z1 - z0) / rep, 0, (z1 - z0) / rep);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  };
  for (let z = -168; z < -96; z += 12) for (let x = -70; x < 62; x += 14) {
    const cx = x + 7, cz = z + 6;
    if (paddy(cx, cz) < 0.8) continue;
    const x0 = x + 1.1, x1 = x + 12.9, z0 = z + 1.1, z1 = z + 10.9;
    let y = Infinity;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [cx, cz]]) y = Math.min(y, W.heightAt(px, pz));
    quad(x0, z0, x1, z1, y + 0.1, 3.6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // 照りは抑える（斜めから見て空が白く映り、白い塗料の染みに見えない程度）
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: seedlingTex(), color: 0xe2e4da, roughness: 0.55, metalness: 0 }));
  m.receiveShadow = true; m.userData.noMerge = true;
  return m;
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
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const sumN = (...gs) => gs.reduce((n, g) => n + aliveN(g), 0);
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

const k12_kashii = {
  // 身の回りの合戦の跡（timeslip_field.js）。樫井：四月末（今の六月初め）の初夏。青い草と田の水、押し合った跡
  timeslip: {
    // 雨の記録は無い（初夏の晴れの朝）。踏み跡の水たまりは置かない（白い塗料の染みに見えた。11/5 n6）
    wet: 0.12, pools: 0, dust: 0.3, trample: 0.35, debris: 1.2, arrows: 0.9, reeds: 0.4,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x3a4a6a, 0xdaaf3c],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  minutes: 15,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ（AL：黄色と青を同時に出さない）
  compactIntro: true,
  introText: () => '安松の八丁畷で殿を務め、塙団右衛門の先手を樫井の村まで引き寄せて討て。',
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  foeMarks: true,
  waitForPortrait: true,  // 顔が撮れるまで影を出さず、撮れた顔を一度だけ表示する（五6）
  stageGoalsOnly: true,    // 目標は五つの段だけ（「敵を何人討つ」で埋めない。三1）
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
    for (const b of B) {
      if (pos.y < b.y0 || pos.y > b.y1) continue;
      const fx = pos.x - b.x, fz = pos.z - b.z;
      let p0 = fx * b.c - fz * b.s, p1 = fx * b.s + fz * b.c;
      if (Math.abs(p0) >= b.hw || Math.abs(p1) >= b.hd) continue;
      const gx = pu.pos.x - b.x, gz = pu.pos.z - b.z, q0 = gx * b.c - gz * b.s, q1 = gx * b.s + gz * b.c;
      if (Math.abs(q0) >= b.hw && (Math.abs(q1) < b.hd || Math.abs(q0) - b.hw > Math.abs(q1) - b.hd)) p0 = Math.sign(q0) * (b.hw + 0.15);
      else if (Math.abs(q1) >= b.hd) p1 = Math.sign(q1) * (b.hd + 0.15);
      else continue;
      pos.x = b.x + p0 * b.c + p1 * b.s; pos.z = b.z - p0 * b.s + p1 * b.c;
    }
  },
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵将が倒れた' && !/^(塙団右衛門|淡輪重政)が討たれた/.test(t),
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっていて動かない（AW3・BK4）。塙の段だけ本人の上
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending || (F.step === 5 && (F.hanaDown || !F.hanaU?.alive))) return null;
    let p = YASU;
    if (F.step === 2) p = LINE;
    else if (F.step === 3) p = VILLAGE;
    // ④は岡部の隊が見えたらその隊へ（東の口で待つだけで敵が来ず、二分余り立ち尽くした。11/7 遊んで）
    else if (F.step === 4) { const c = !F.okaBack && live(F.oka) && F.oka.center(); p = c && dist(c, EAST) < 70 ? c : EAST; }
    else if (F.step === 5) p = F.hanaU?.alive ? F.hanaU.pos : HATA;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 ? 12 : 8;
    return PIN;
  },
  // 右上の目標：①〜⑤を最初から全部並べ、済んだ物に印（九1・十1）。時の数字は出さない（時が尽きても負けにしない）
  goals5() {
    return STEP_TEXT.slice(1).map((text, k) => ({ kind: 'stage', k, text,
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
html:root body #hud#hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; }
html:root body #hud#hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals .goals-toggle { display:none !important; }
html:root body #hud#hud#hud.kashii-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.kashii-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.kashii-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em) { display:none !important; }`;
    document.head.appendChild(st);
    const hudProgress = hud.progress;
    hud.progress = function (battle) {
      const out = hudProgress.call(this, battle);
      if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
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
    mist: 0.3,
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
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0;
    // 樫井の村：熊野街道の両側に家並み（街道沿いの村。家には当たりがあり、カメラも壁で止まる）。畑の箱・竹林・炊事の煙は置かない
    //   （住む者は逃げた後。11/5 n6：緑の箱の畑・傘を重ねたような竹が作り物に見えた）
    //   カメラは家の壁と屋根で止める（茅葺きの中へめり込まない。十一2）
    for (const [x, z, r] of KASHII_HOUSES) { const h = hut(W, x, z, 8, 5.5, r); h.traverse((m) => { if (m.isMesh) m.userData.camBlock = true; }); rt.scene.add(h); }
    // 安松の家（亀田が退く時に火を放つ）・溜め池と東の堤・田の水面と早苗
    // 安松の家もカメラを壁と屋根で止める（燃える家の中にカメラが入った。11/7 遊んで）
    F.yasuHouses = YASUMATSU.map(([x, z, r]) => { const h = hut(W, x, z, 7, 5, r); h.traverse((m) => { if (m.isMesh) m.userData.camBlock = true; }); rt.scene.add(h); return { x, z, r }; });
    rt.scene.add(paddyWater(W), pondWater(W));
    // 家の中へカメラが入らないよう、壁と軒の箱で外へ押し出す（11/6 遊んで：村の辻と東の口で家の中・屋根の上から写った）
    F.camBoxes = [...KASHII_HOUSES.map(([x, z, r]) => [x, z, r, 8, 5.5]), ...YASUMATSU.map(([x, z, r]) => [x, z, r, 7, 5])].map(([x, z, r, w, d]) => {
      const y = W.heightAt(x, z); return { x, z, c: Math.cos(r), s: Math.sin(r), hw: w / 2 + 1.1, hd: d / 2 + 1.1, y0: y - 1, y1: y + 7.5 };
    });
    { const g = dorui(W, [BANK_X + 1.5, POND.z - 10, BANK_X + 1.5, POND.z + 10], 1, 0, { w: 2.4, h: 0.55 }); if (g && !g.isBatchedPart) rt.scene.add(g); }
    rt.scene.add(jinmaku(W, ASANO_HON.x, ASANO_HON.z + 2, 14, 10, 4, { mon: 'asano' }));
    rt.scene.add(shogi(W, ASANO_HON.x, ASANO_HON.z - 0.6, Math.PI));
    for (const [x, z] of [[ASANO_HON.x - 10, ASANO_HON.z + 2], [ASANO_HON.x + 22, ASANO_HON.z + 4], [LINE.x - 22, LINE.z + 6], [LINE.x + 20, LINE.z + 6], [YASU.x + 8, YASU.z + 8]]) rt.scene.add(nobori(W, x, z, 'asano', 6));
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
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      rt.after(1, () => sfx('taiko', 0.8));
      F.kame.order = 'attack'; F.kame.seekRange = 30;
      // 塙の先手が貝塚の側から畷を寄せる。少し遅れて岡部の先手も（先陣を争う二つの隊）
      //   殿 40 で先手 56 を受ける（一番苦しい所。一1）
      F.hana1 = this.foe(rt, '塙の先手', { x: FROM_N.x, z: FROM_N.z }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 6 }], { aim: YASU, width: 4 });
      F.w1S = aliveN(F.hana1);
      rt.after(22, () => { if (F.step === 1) { F.oka1 = this.foe(rt, '岡部の先手', { x: FROM_N.x + 6, z: FROM_N.z - 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 5 }], { aim: YASU, width: 4 }); F.w1S += aliveN(F.oka1); } });
      F.w1N = 56;
      rt.after(2.5, () => rt.say('亀田高綱', '来たぞ。畷に並んだ所を引き付けて、放て！', 3));
      rt.after(24, () => rt.say('使番', '岡部の隊も畷に並んだ！　塙に先を越されまいと急いでおる', 3.4));
    } else if (n === 2) {
      rt.say('亀田高綱', 'もう十分じゃ。撃ちながら退け！　樫井の村で上田殿が待っておる', 3.4);
      // 殿は畷の足場ごとに止まり、北を向いて撃っては次の足場へ退く（LEGS）。update が回す
      F.leg = 0; F.legT = rt.t; this.kameLeg(rt);
      // 追手：残りの先手と、塙の新手が背中を追う（後ろの北から。横や前には湧かせない）
      for (const g of [F.hana1, F.oka1]) if (live(g)) { g.order = 'attack'; g.seekRange = 120; g.speed = 3.9; g.anchor = { x: LINE.x, z: LINE.z - 20 }; }
      F.chase = this.foe(rt, '塙の追手', { x: FROM_N.x, z: FROM_N.z + 6 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }], { aim: { x: VILLAGE.x, z: VILLAGE.z - 10 } });
      F.chase.speed = 4.4; F.chase.seekRange = 120;
      rt.after(9, () => { if (F.step === 2) { F.chase2 = this.foe(rt, '塙の新手', { x: FROM_N.x + 4, z: FROM_N.z }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }], { aim: { x: VILLAGE.x, z: VILLAGE.z - 10 } }); F.chase2.speed = 4.4; F.chase2.seekRange = 120; } });
      rt.after(5, () => rt.say('足軽', '後ろから追って来る！　足を止めるな！', 2.8));
      // 亀田は安松の家に火を放って退く（史実。煙と火で追手の足を止める）
      rt.after(7, () => {
        rt.say('亀田高綱', '安松の家に火をかけよ！　煙で敵の足を止める', 3);
        if (rt.world.addBlaze) F.yasuHouses.forEach((h, i) => rt.after(i * 1.4, () => rt.world.addBlaze(h.x, h.z, { w: 7, d: 5, h: 4, rot: h.r })));
      });
      rt.after(14, () => rt.say('亀田高綱', '池の堤の鉄砲が横から撃つ。畷を外れるな、堤の前を駆け抜けよ', 3.2));
      rt.after(10, () => { if (F.step === 2) this.bringUp(rt); });
    } else if (n === 3) {
      sfx('taiko', 1);
      // 先の追手は村の前で合流して戦い続ける。遠く残った者は北へ退かせ、本物の兵の枠を空ける
      for (const g of [F.hana1, F.oka1, F.chase, F.chase2]) if (live(g)) for (const u of g.units) if (u.alive && dist(u.pos, LINE) > 110) rt.army.despawn(u);
      // 安松の北で控えていた塙・淡輪の隊が、街道を村の辻へ押し込む（村の家並みの間で入り乱れる。九2）
      this.bringUp(rt);
      F.hana.anchor = { x: VILLAGE.x, z: VILLAGE.z + 4 }; F.awa.anchor = { x: VILLAGE.x + 2, z: VILLAGE.z - 4 };
      // 村に入るまでは崩れず、横の敵にも逸れない
      for (const g of [F.hana, F.awa]) { g.order = 'attack'; g.onArrive = null; g.speed = 4.4; g.seekRange = 14; g.noRout = true; }
      rt.after(40, () => { for (const g of [F.hana, F.awa]) if (g) { g.seekRange = 40; g.noRout = false; } });
      // 池の堤の鉄砲は役目を終えて村へ下がる（村へ来る敵を道の途中で撃ち減らさない）
      if (live(F.pondGuns)) { F.pondGuns.aggro = 0; F.pondGuns.order = 'move'; F.pondGuns.dest = { x: -14, z: -18 }; F.pondGuns.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: -14, z: -18 }; }; F.pondGuns.units.forEach((u) => { u._crouch = false; }); }
      // 岡部の隊は東の田の向こう（蟻通の松原の陰）へ回り込んで控える（④で村の東の口へ）
      if (!F.oka) {
        F.oka = this.foe(rt, '岡部則綱の隊', FROM_E, [{ type: 'busho', n: 1, o: { name: '岡部則綱', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], { aim: OKA_WAIT, hold: true, rout: 999 });
        F.oka.seekRange = 6; F.okaU = F.oka.units.find((u) => u.name === '岡部則綱');
      }
      F.w3N = sumN(F.hana, F.awa);
      // 上田・知近の備えは村の辻へ出て迎え撃つ。殿も村へ
      F.ueda.anchor = { x: VILLAGE.x + 3, z: VILLAGE.z + 8 }; F.tomo.anchor = { x: VILLAGE.x - 3, z: VILLAGE.z + 12 };
      // 備えは辻で構え、家並みに入った敵に槍を合わせる（村の外へ出て行かない）
      F.kame.anchor = { x: VILLAGE.x, z: VILLAGE.z + 16 };
      for (const g of [F.ueda, F.tomo, F.kame]) { g.order = 'hold'; g.seekRange = 18; g.aggro = 16; g.ai = false; }
      rt.after(30, () => { if (F.step === 3) for (const g of [F.ueda, F.tomo, F.kame]) if (live(g)) { g.order = 'attack'; g.seekRange = 30; } });
      rt.army.play('toki', { x: -4, z: -110 }, 1.5);
      rt.say('上田宗箇', '亀田殿、ようも引き付けた。村の家を楯に迎え撃つ。一人も川へ通すな！', 3.4);
      rt.after(4, () => rt.say('塙団右衛門', '先陣は我が物じゃ。岡部に遅れを取るな、村へ押し込め！', 3));
    } else if (n === 4) {
      // 控えの間に崩れていたら（遠くの乱戦の動揺など）、東の田の向こうから新しく寄せる（④の敵は必ず来る。九2）
      if (!live(F.oka)) {
        F.oka = this.foe(rt, '岡部則綱の隊', FROM_E, [{ type: 'busho', n: 1, o: { name: '岡部則綱', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], { aim: EAST, rout: 999 });
        F.okaU = F.oka.units.find((u) => u.name === '岡部則綱');
      }
      F.oka.order = 'attack'; F.oka.onArrive = null; F.oka.anchor = { x: EAST.x, z: EAST.z }; F.oka.seekRange = 40; F.oka.speed = 4.3; F.oka.noRout = true;
      rt.after(30, () => { if (F.oka) F.oka.noRout = false; });
      F.w4N = aliveN(F.oka);
      if (live(F.ueda)) { F.ueda.order = 'attack'; F.ueda.anchor = { x: EAST.x - 12, z: EAST.z + 8 }; F.ueda.seekRange = 50; }
      rt.say('使番', '東の田に岡部の旗！　村の横へ回って来る！', 3);
      rt.after(3.4, () => rt.say('上田宗箇', '横を破られれば村は持たぬ。我らと東の口を固めよ！', 3.2));
    } else if (n === 5) {
      // 団右衛門は侍衆を連れて村の北の口から辻へ斬り込む。討てるのは主人公の止めだけ（onWound）
      //   斬り込む先は村の辻のまわりだけ（広く追わせると馬で村の外の田まで駆け回り、主人公が四分も追い回した。11/7 遊んで）
      if (live(F.hata)) { F.hata.order = 'attack'; F.hata.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 }; F.hata.seekRange = 24; F.hata.noRout = true; F.hata.speed = 4; }
      // 団右衛門の命は名のある将として強いが、一人の槍で討てる所まで（総大将の倍掛けが重なって千を超え、二分余り突いても討てなかった。11/7 遊んで）
      // 二巡（11/9）：bot が三百では四分突いても手傷まで届かなかった。百八十に
      const H = F.hanaU; if (H?.alive) { H.maxHp = Math.min(H.maxHp, 180); H.hp = Math.min(H.hp, H.maxHp); }
      //   馬上の一撃も、組み合った主人公が三四合は受けられる強さに（十秒で命の四分の三を削られて二度討たれた。11/7 遊んで）
      if (H?.alive) H.dmg = Math.min(H.dmg || 18, 12);
      for (const g of [F.ueda, F.tomo, F.kame]) if (live(g)) { g.order = 'attack'; g.seekRange = 60; g.anchor = { x: VILLAGE.x, z: VILLAGE.z - 4 }; }
      rt.after(1.2, () => rt.say('塙団右衛門', '塙団右衛門直之、これにあり！　首が欲しくば取りに来い！', 3.4));
      rt.after(5, () => rt.say('亀田高綱', 'あれが団右衛門よ。侍衆を剥がして、そなたの槍で止めを！', 3));
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
    if (live(F.oka)) { F.oka.order = 'retreat'; F.oka.dest = { x: FROM_E.x, z: EXIT_N.z }; F.oka.speed = 4.3; F.oka.aggro = 0; }
    if (F.okaU?.alive) F.okaU.invuln = true;
    rt.after(1.2, () => rt.say('岡部則綱', '横からも破れぬか……。引け、引け！', 2.8));
    rt.after(4, () => this.toStep(rt, 5));
  },

  // 塙・淡輪の隊と塙団右衛門の侍衆を、追手の後ろから安松の北まで寄せて控えさせる（③で村へ。見える所には湧かせない）
  bringUp(rt) {
    const F = rt.flags;
    if (F.hana) return;
    F.hana = this.foe(rt, '塙団右衛門の隊', { x: -6, z: -205 }, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 6 }], { aim: { x: -3, z: -114 }, hold: true, morale: 98, width: 5, rout: 999 });
    F.awa = this.foe(rt, '淡輪重政の隊', { x: 2, z: -214 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], { aim: { x: 7, z: -120 }, hold: true, width: 5, rout: 999 });
    // 淡輪重政は団右衛門の脇（村の北の口）に馬を立てて控え、団右衛門が討たれてから斬り込む（史実の順）
    F.awaG = this.foe(rt, '淡輪重政の手', { x: HATA.x + 9, z: -226 }, [{ type: 'busho', n: 1, o: { name: '淡輪重政', invuln: true, horse: true } }, { type: 'samurai', n: 3 }], { aim: { x: HATA.x + 9, z: HATA.z - 4 }, hold: true, morale: 100, width: 3, rout: 999 });
    F.awaG.seekRange = 0; F.awaG.aggro = 0;
    F.awaU = F.awaG.units.find((u) => u.name === '淡輪重政');
    // 団右衛門の討死までは控えの将。討てない相手を追って止まらず、史実の斬り込み前にも討たせない。
    F.awaU.noTarget = true; F.awaU.mustLive = true;
    for (const g of [F.hana, F.awa]) { g.speed = 4.4; g.seekRange = 12; }
    // 塙団右衛門は侍衆を連れて村の北の口に構える（⑤まで前に出ない）。止めは主人公の手だけ（三4）
    F.hata = this.foe(rt, '塙団右衛門の侍衆', { x: HATA.x, z: -220 }, [{ type: 'busho', n: 1, o: { name: '塙団右衛門', flag: 'sashi:字塙団右衛門:#ece6d6:#201f1c', invuln: true, horse: true } }, { type: 'samurai', n: 10 }, { type: 'gun', n: 2 }], { aim: HATA, hold: true, morale: 100 });
    F.hata.seekRange = 0; F.hata.aggro = 0;   // ⑤まで村の北の口から動かない（村の乱戦に先に紛れ込まない）
    F.hanaU = F.hata.units.find((u) => u.name === '塙団右衛門');
    F.hanaU.onWound = (src) => {
      if (!src?.isPlayer || F.step !== 5 || !F.hanaU.alive) return;
      // 「討ち取ったり」を先に出す（後から出すと、共通の「〇〇が討たれた」の知らせに重ねて消される。五3）
      F.hanaU.invuln = false; F.hanaByMe = true; rt.banner('塙団右衛門、討ち取ったり'); F.hanaBanner = true; rt.army.kill(F.hanaU, src);
    };
  },

  // 殿の撃っては退く：足場（LEGS）で北を向いて構え、鉄砲を放ってから次の足場へ駆ける
  kameLeg(rt) {
    const F = rt.flags, g = F.kame;
    if (!live(g) || F.leg >= LEGS.length) return;
    const z = LEGS[F.leg], x = F.leg === LEGS.length - 1 ? LINE.x - 2 : -3;
    g.order = 'move'; g.dest = { x, z }; g.speed = 3.8; g.aggro = 0;
    g.onArrive = (q) => {
      q.order = 'hold'; q.anchor = { x, z }; q.facing = Math.PI; q.aggro = 24; q.seekRange = 0;
      F.legT = rt.t; F.legHold = true;
      if (F.leg < LEGS.length - 1) rt.army.play('volley', { x, z: z - 6 }, 1.2);
    };
    F.legHold = false;
  },

  // 塙団右衛門の最期（主人公が止めを刺した時だけ。onWound が呼ぶ。三4）
  hanawaFalls(rt) {
    const F = rt.flags;
    if (F.hanaDown || !F.hanaByMe || F.step !== 5) return;
    F.hanaDown = true;
    if (!F.hanaBanner) rt.banner('塙団右衛門、討ち取ったり');
    rt.award((t) => { t.special = { label: '塙団右衛門を討ち取った', pts: 32 }; }, '塙団右衛門を討ち取った');
    for (const g of [F.hata, F.hana, F.awa]) if (live(g)) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
    // 淡輪重政は団右衛門の死を見て敵中へ斬り込み、永田治兵衛に首を取られた（史実の順。それまでは討たれない）。
    //   目標が全部済むと数秒で締まるので、その間に収める
    const awa = F.awaU;
    if (awa?.alive) {
      awa.noTarget = false; awa.mustLive = false; awa.invuln = false;
      if (live(F.awaG)) { F.awaG.order = 'attack'; F.awaG.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 }; F.awaG.seekRange = 40; F.awaG.aggro = 16; F.awaG.speed = 4.6; }
      rt.after(0.4, () => { if (awa.alive) rt.say('淡輪重政', '団右衛門殿が果てたか。六郎兵衛も続くぞ！', 2); });
      rt.after(1.9, () => { if (awa.alive) { awa.hp = 0; rt.army.kill(awa, null); } });
    } else rt.after(1.2, () => rt.say('浅野の侍', '団右衛門、討ち取ったり！', 2.6));
    rt.after(2.6, () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (live(g)) { g.order = 'retreat'; g.dest = { x: EXIT_N.x, z: EXIT_N.z }; g.speed = 4.2; g.aggro = 0; }
    sfx('horagai', 0.8);
    rt.award((t) => { t.main = true; t.special = { label: '樫井で塙の先手を破った', pts: 20 }; }, '樫井で塙の先手を破った');
    rt.banner('樫井の戦い、浅野の勝ち');
    const A = this.talk.after;
    rt.after(1.2, () => rt.say('使番', '申し上げます。治房の本隊は塙の死を聞き、貝塚から大坂へ引き上げた由', 3.4));
    rt.after(5, () => rt.say(A[0][0], A[0][1], 3.6));
    rt.after(9, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(13, () => rt.say(A[2][0], A[2][1], 3.2));
    // 亀田と上田の手柄の争い（のちに亀田が浅野家を去るもと。battle_learn）
    rt.after(16.5, () => rt.say(A[3][0], A[3][1], 3.4));
    rt.after(20.2, () => rt.say(nm(rt), '国の一揆を鎮め、大坂へ攻め上りましょうぞ', 3.2));
    rt.finish({ scriptedEnd: true }, 23.5);
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
    try { jin12.tick(rt, dt); } catch (e) { if (!rt.flags._jinErr) { rt.flags._jinErr = 1; console.warn("樫井の陣立て", e); } }
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 3 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const el = rt.t - F.stepT, left = STEP_T[F.step] - el;
    // 退いた敵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && (u.pos.z < -170 || u.pos.x > 140) && dist(u.pos, P.pos) > 70) rt.army.despawn(u);
    }
    if (F.hanaU && !F.hanaU.alive && !F.hanaDown) this.hanawaFalls(rt);
    if (F.step === 1) {
      const k = F.w1S - sumN(F.hana1, F.oka1), need = Math.round(F.w1N * 0.5);
      rt.objProgress('s1', `塙・岡部の先手 ${Math.min(k, need)}／${need}人`);
      // 殿に加わって槍を合わせてから退く。立っているだけで味方の戦果や時間によって①を済ませない。
      if ((P.atk || P.swing) && dist(P.pos, YASU) < 28 &&
          [F.hana1, F.oka1].some((g) => g?.units.some((u) => u.alive && !u.gone && !u.fleeing && dist(u.pos, P.pos) < 6))) F.vanguardJoined = true;
      // 11/9 徳川C：味方（厚みの備えを含む）が先に先手を討ち尽くすと、本人が槍を合わせる相手がおらず①が刻限まで止まった（bot）。
      //   殿の場（YASU の二十八歩の内）に二十五秒いれば加わったとみなす。それでも済まなければ刻を九十秒過ぎて退く
      if (dist(P.pos, YASU) < 28) F.near1 = (F.near1 || 0) + 0.25;
      if (!F.vanguardJoined && F.near1 > 25) F.vanguardJoined = true;
      if (F.vanguardJoined && F.oka1 && k >= need) this.toStep(rt, 2);
      else if ((F.vanguardJoined && left <= 0) || left <= -90) { rt.say('亀田高綱', 'これ以上は持たぬ。退け！', 2.6); this.toStep(rt, 2); }
    } else if (F.step === 2) {
      // 殿の足場：構えて撃つ間（3 秒）が過ぎたら次の足場へ
      if (F.legHold && rt.t - F.legT > 3 && F.leg < LEGS.length - 1) { F.leg++; this.kameLeg(rt); }
      // 主人公が村の南の端に着き、殿も村まで退いたら③（殿が遅れても 20 秒で村の戦へ）。時が尽きても負けにしない（十一1）
      const here = P.pos.z > LINE.z - 12 && dist(P.pos, LINE) < 24;
      if (here) F.hereT ??= rt.t;
      const kc = live(F.kame) && F.kame.center();
      if (here && (!kc || kc.z > VILLAGE.z - 6 || rt.t - F.hereT > 20)) this.toStep(rt, 3);
      // 殿が先に着いても、本人の帰着までは②を済ませない。知らせは一度だけ。
      else if (!F.returnNotice && el > STEP_T[2] + 60 && (!kc || kc.z > VILLAGE.z - 6)) {
        F.returnNotice = true;
        rt.say('上田宗箇', '殿は村へ着いた。急ぎ村の南の端へ戻られよ！', 3);
      }
    } else if (F.step === 3) {
      const k = F.w3N - sumN(F.hana, F.awa), need = Math.round(F.w3N * 0.5);
      rt.objProgress('s3', `塙・淡輪の隊 ${Math.min(k, need)}／${need}人`);
      // 村の辻で実際に敵へ槍を合わせてから達成。立っているだけでは時間や味方の戦果で済ませない。
      if ((P.atk || P.swing) && dist(P.pos, VILLAGE) < 20 &&
          [F.hana, F.awa].some((g) => g?.units.some((u) => u.alive && !u.gone && !u.fleeing && dist(u.pos, P.pos) < 6))) F.villageJoined = true;
      if (F.villageJoined && (k >= need || left <= 0)) this.toStep(rt, 4);
      // 11/9：村へ寄れないまま一分半過ぎても、上田・知近の備えが辻を押さえて次へ（bot が辻の手前で十分止まった）
      else if (left <= -90) { rt.say('上田宗箇', '辻は押さえた！　東の口へ回れ！', 3); this.toStep(rt, 4); }
    } else if (F.step === 4) {
      const k = F.w4N - aliveN(F.oka), need = Math.round(F.w4N * 0.5);
      if (!F.okaBack) rt.objProgress('s4', `岡部の隊 ${Math.min(k, need)}／${need}人`);
      // 東の口か、そこへ寄せる岡部の隊へ出て迎える。村に残ったまま時間だけで横を守った事にしない。
      const oc = live(F.oka) && F.oka.center();
      if ((P.atk || P.swing) && (dist(P.pos, EAST) < 20 || (oc && dist(oc, EAST) < 70 && dist(P.pos, oc) < 20)) &&
          F.oka?.units.some((u) => u.alive && !u.gone && !u.fleeing && dist(u.pos, P.pos) < 6)) F.eastJoined = true;
      // 11/9 徳川C：①と同じく、東の口か岡部の隊の近くに二十五秒いれば加わったとみなす。刻を九十秒過ぎたら岡部は退く
      if (dist(P.pos, EAST) < 20 || (oc && dist(P.pos, oc) < 20)) F.near4 = (F.near4 || 0) + 0.25;
      if (!F.eastJoined && F.near4 > 25) F.eastJoined = true;
      if (!F.okaBack && ((F.eastJoined && (k >= need || left <= 0)) || left <= -90)) this.okabeBack(rt);
      // 11/9：東の口へ寄れないまま二分過ぎても、浅野の騎馬と上田の手で岡部は退く（史実でも横は破れなかった）
      else if (!F.okaBack && left <= -120) this.okabeBack(rt);
    } else if (F.step === 5) {
      // 団右衛門は名乗った相手（主人公）が近ければ主人公に打ち掛かる。他の兵を追って村の外の田まで馬で駆け回らせない（11/7 遊んで五分追い回した）
      const H = F.hanaU;
      if (H?.alive) {
        const dp = dist(H.pos, P.pos);
        // 侍衆が崩れても団右衛門は退かない（史実で村の中で討たれた。崩れて川の南まで馬で駆け去った。11/7 遊んで）
        if (H.fleeing) { H.fleeing = false; F.hata.order = 'attack'; F.hata.anchor = { x: VILLAGE.x, z: VILLAGE.z - 6 }; }
        // 近い主人公でも村の外までは追わない。帰る途中も目標を取り直して引き返さない。
        if (dist(H.pos, VILLAGE) > 26 || dist(P.pos, VILLAGE) > 30) { H.target = null; H.aiT = 0; F.hata.order = 'move'; F.hata.dest = { x: VILLAGE.x, z: VILLAGE.z - 6 }; F.hata.onArrive = (q) => { q.order = 'attack'; }; }
        else if (dp < 30) { H.target = P; H.aiT = 0; }
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (F.step === 1 && k?.isPlayer && (v.group === F.hana1 || v.group === F.oka1)) F.vanguardJoined = true;
    if (F.step === 3 && k?.isPlayer && (v.group === F.hana || v.group === F.awa) && dist(rt.player.u.pos, VILLAGE) < 20) F.villageJoined = true;
    if (F.step === 4 && k?.isPlayer && v.group === F.oka && dist(rt.player.u.pos, v.pos) < 6 && dist(v.pos, EAST) < 70) F.eastJoined = true;
    if (v.name === '塙団右衛門') F.hanaByMe = !!k?.isPlayer;
    if (v.name === '淡輪重政') {
      // 誰の手か分かるように（史実では浅野の永田治兵衛が首を取った）
      rt.banner('淡輪重政、討ち取ったり', k?.isPlayer ? nm(rt) + 'の槍' : '永田治兵衛が首を取る');
      if (k?.isPlayer) rt.award((t) => { t.special = { label: '淡輪重政を討ち取った', pts: 18 }; }, '淡輪重政を討ち取った');
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && !o.woundOut && !o.rearWound && Math.abs(o.pos.y - u.pos.y) < 3;
    // ⑤：団右衛門が近ければ本人へ（侍衆が間にいればそちらから）
    const H = F.step === 5 && F.hanaU?.alive && Math.hypot(F.hanaU.pos.x - u.pos.x, F.hanaU.pos.z - u.pos.z) < 14 ? F.hanaU : null;
    const e = F.step === 2 ? null : (b.army.nearestEnemy(u, H ? 3 : 9, ok) || H);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = this.missionPin(b) || LINE;
    // 安松の家並みの間に入ったら、まず西の街道へ出てから行き先へ（家の壁に押し付けて詰まった。11/7 遊んで）
    if (u.pos.x > 5 && YASUMATSU.some(([x, z]) => Math.hypot(x - u.pos.x, z - u.pos.z) < 9) && Math.abs(t.x - u.pos.x) + Math.abs(t.z - u.pos.z) > 12) t = { x: 1, z: u.pos.z > -77 ? -60 : -92 };
    // ②：樫井の村を南へ抜ける時は、家並みの間でなく熊野街道（村の辻の筋）を通る（11/9：critic60 が②の段飛ばしを外した後、bot が村の家に詰まって八百秒止まった）
    if (F.step === 2 && u.pos.z < LINE.z - 6 && u.pos.z > VILLAGE.z - 24 && Math.abs(u.pos.x - VILLAGE.x) > 3) t = { x: VILLAGE.x, z: Math.min(u.pos.z + 6, LINE.z) };
    goTo(p, inp, t.x, t.z, 2);
  },
};
// 陣立ての厚み（army_depth.js）・命懸けの戦場（lethal.js）・この戦の怖さ（殿が取り残される・家並みの乱戦）
k12_kashii.depth = DEPTH12;
k12_kashii.lethal = true;
k12_kashii.fearKind = { kind: '殿', note: '少ない殿で大勢を受け、退く', w: { losses: 1.3, iso: 1.5 }, line: '取り残されるぞ！' };
k12_kashii.sides = { a: { name: '浅野勢', mon: 'asano' }, b: { name: '塙・岡部の先手', mon: 'toyotomi' } };
k12_kashii.force = (rt) => ({ a: Math.round(5000 - (rt.flags.ak || 0) * 20), a0: 5000, b: Math.max(0, Math.round(3000 - (rt.flags.ek || 0) * 10)), b0: 3000 });   // 討った一人を十人に。先手は崩れて退き、零にはならない（遊んで敵が残るのに 0 と出た）
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
