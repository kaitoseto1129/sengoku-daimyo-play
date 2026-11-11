// ======================================================================
// 徳川編 16　秘密の戦「天下分け目の淀の野」（もしもの戦・元和元年 1615 五月）
// 筋書きの正：docs/chapter3_tokugawa.md の「出世と軍勢・秘密の最後の戦（kaito 11/1 夜）」。手本の調べ：docs/battle_refs/k16_secret.md
// 徳川編の15戦にすべて勝つと開く（tokugawa_secret.js）。史実ではない。
// 大坂の陣の後、大名になった主人公が二万を率いて、京へ戻る家康の三万と淀の野で戦う。家康の本陣へ届き、家康を降して戦を終わらせる（docs/finale_spec_1109.md：家康を HP の大将にしない）。
// 見せかけの軍勢は置かない（AA・AF・AP9・AQ6・AT4）。見える兵は全部本物で、初めから持ち場に並ぶ（段で湧かせない。AT17）。
//   本物の兵：自分の側およそ八十・徳川方およそ百五十（二万対三万の二対三）
// 徳川方は五重：京街道の藤堂の先手（渡辺勘兵衛）→東の井伊の赤備え→丘の下の鉄砲衆→本多正純の旗本→丘の上の家康の本陣（床几）
//   総大将の家康と藤堂高虎は後ろの本陣で座ったまま動かない（AR3・AT3）。高虎は討てない
// 段（目標ごとの刻限）：①勘兵衛の先手 ②直孝の赤備え ③鉄砲衆 ④正純の旗本 ⑤陣幕の内の家康
// 勝った後：金扇の馬印が倒れ、勝鬨。京の御所へ将軍宣下を願う早馬を立て、出世の道（足軽→…→天下人→征夷大将軍）を一段ずつ灯して締める。
// 向き：北が -z（家康の本陣・京の方）。自分の軍は南（+z）から北へ。
// ======================================================================
import * as THREE from 'three';
import { nobori, tawara, umajirushi, bobosaku } from './props.js';
import { stopMusic, setScene } from './audio.js';
import { RANKS } from './state.js';
import { STAGES, KILLS, cut, standing } from './stages.js';
import { GENERALS } from './units_data.js';
import { sfx } from './audio.js';
import { victoryMoment } from './victory_moment.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { timeslipField } from './timeslip_field.js';
import { distToPolyline } from './world.js';
import { revealName } from './battle_intel.js';
import { goalsTick } from './hud_goals.js';
import { sightUnit } from './battle_sight.js';
import { allAdvance } from './command_rank.js';

const ID = 'k16_secret';
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
// 井伊は朱漆の具足と金の天衝（井伊家伝来の具足）。ほかは黒の具足
give('井伊直孝', { armor: 0x8e1f16, lace: 0xb8342a, hat: 'kabuto_tentsuki', haori: 0x7a1a12, mon: 'ii', tack: 0x6a1a12,
  face: face({ age: 25, jaw: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.1, goat: 0, side: 0, stub: 0.3 } }) });
give('渡辺勘兵衛', { armor: 0x1e1c1a, lace: 0x4a3a2a, hat: 'kabuto_m', haori: 0x2a241e, mon: 'todo',
  face: face({ age: 50, gaunt: 0.35, brow: 1.4, beard: { mus: 0.8, musW: 1.1, droop: 0.5, goat: 0.4, side: 0.4, stub: 0.9 } }) });
give('本多正純', { armor: 0x1c1a18, lace: 0x2a2a3a, hat: 'kabuto_m', haori: 0x2a2a30, mon: 'honda',
  face: face({ age: 50, beard: { mus: 0.5, musW: 1, droop: 0.3, goat: 0.2, side: 0, stub: 0.5 } }) });
give('藤堂高虎', { armor: 0x1a1816, lace: 0x3a2a1a, hat: 'kabuto_s', haori: 0x2a2018, mon: 'todo', lord: true,
  face: face({ age: 59, gaunt: 0.3, brow: 1.3, jaw: 1.2, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.4, side: 0.3, stub: 0.8 } }) });

// 11/8 if_final_genna：kaito CB「馬で十秒で本陣に着く・本陣は遠く柵の構えで固く」。本陣を四十七 m 奥へ下げ、鉄砲衆の前と本陣の前に馬防柵（口は京街道の上だけ）
const HQ = { x: 0, z: -165 };            // 家康の本陣（微高地・陣幕と金扇）
const START = { x: 4, z: 64 };           // 自分の軍の持ち場（京街道の南）
const SAKITE = { x: 0, z: -4 };          // 京街道の藤堂の先手（渡辺勘兵衛）
const TODO_HQ = { x: -44, z: -44 };      // 藤堂高虎の本陣（先手の後ろの西の林の脇）
const II_AT = { x: 96, z: -50 };         // 井伊の赤備え（東の巨椋池の縁の林の奥に隠れて待つ。土手からは見えない）
const YOKO = { x: 8, z: -26 };           // 赤備えが横から突っ込む所（土手の東の畑）
const TEPPO = { x: 0, z: -96 };          // 高みの下の徳川の鉄砲衆
const HONDA_AT = { x: 0, z: -134 };       // 本陣の前の本多正純の旗本
const MOUTH = { x: HQ.x, z: HQ.z + 9 };  // 陣幕の口（jinCamp の決まりで南 +z に開く。幅六 m）の外
const HIDE = { x: 58, z: HQ.z - 30 };    // 秀忠の陣（本陣の後ろ東。家康が討たれた後「まだ終わらぬ」と踏みとどまる。docs/if_final_genna.md 最終局面）
const ADV = '明石全登';                  // 主人公の参謀（docs/if_final_genna.md：大坂から生還した明石全登）
// 筋書きの締め：今まで戦った場所が順に光る（docs/if_final_genna.md「最後の演出」）
const PLACES = ['稲生', '桶狭間', '森部', '稲葉山', '金ヶ崎', '姉川', '比叡山', '小谷', '長篠', '本能寺', '山崎', '賤ヶ岳', '小牧長久手', '小田原', '関ヶ原', '大坂', '淀'];
const STEP_T = [0, 190, 200, 220, 200, 300];   // 目標ごとの刻限（AP8：全体ではなく一つ一つに）
// 目標の言い方は場所と行いだけ（kaito_standard 三1：「崩す」「攻める」「討つ（将でない隊）」は使わない）。地図で分かる場所の名で（十1）
const STEP_TEXT = ['', '京街道の土手で、渡辺勘兵衛の先手を北へ退かせる', '土手の東の畑で、井伊の赤備えを食い止める', '馬防柵の向こうで、徳川の鉄砲衆へ斬り込む', '金扇の前で、本多正純の旗本を斬り抜ける', '陣幕の口から入り、床几の家康のもとへ届く'];
// ⑤は「徳川家康」と書かない：共通の victory_flow.js が討った将の名を含む目標を即座に済ませ、goalsDoneTick が二秒半で結果へ締めて、締めの場面（倒れる金扇・勝鬨・出世の道）を切った
const STEP_PLACE = ['', '京街道の土手', '土手の東の畑', '馬防柵の向こう', '金扇の前'];
const STEP_AT = [null, SAKITE, YOKO, TEPPO, HONDA_AT, MOUTH];
const FENCE_Z = [TEPPO.z + 7, HONDA_AT.z + 9];   // 馬防柵の並び（口は京街道の上 |x|<4 だけ）
// 柵を越える時は南北どちらへ進む場合も、手前の柵から京街道の口へ寄る。
const viaGap = (from, to) => {
  const dir = Math.sign(to.z - from.z);
  for (let i = 0; i < FENCE_Z.length; i++) {
    const fz = FENCE_Z[dir < 0 ? i : FENCE_Z.length - 1 - i];
    if ((from.z - fz) * dir >= 0 || (to.z - fz) * dir <= 0) continue;
    // 出発点が街道の中央でも、斜めの道は柵の口を外れる。柵を横切る位置で確かめる。
    const x = from.x + (to.x - from.x) * (from.z - fz) / (from.z - to.z);
    if (Math.abs(x) > 3) {
      // 口の手前まで来たら向こう側へ抜ける。同じ手前の点を指して止まらせない。
      const through = Math.abs(from.x) <= 3 && Math.abs(from.z - fz) <= 5;
      return { x: 0, z: fz + (through ? dir : -dir) * 2.5 };
    }
  }
  return null;
};
const inCamp = (p) => Math.abs(p.x - HQ.x) < 7 && p.z < HQ.z + 5.5 && p.z > HQ.z - 6;   // 幕の際（角）は外と見る（11/8：角で幕越しに止まった）   // 陣幕の内（16×12 の幕）
// 幕の横・裏からは外の角を回り、南の口の正面へ寄る。案内と自動操作で同じ道を使う。
const campRoute = (p, to) => {
  if (inCamp(p)) return to;
  // 会話の境目と幕の際の間では、まず内側の中央へ入る。
  if (Math.abs(p.x - HQ.x) < 8 && p.z > HQ.z - 6 && p.z < HQ.z + 6) return HQ;
  // 後ろの幕に接したまま横へ進むと布の当たりに捕まる。先に北へ離れて角を回る。
  if (p.z <= HQ.z - 6 && p.z > HQ.z - 9 && Math.abs(p.x - HQ.x) < 14) return { x: p.x, z: HQ.z - 11 };
  // 家康が左右へ寄っていても、口を抜けるまでは中央へ進む。
  // 外から本人へ斜めに寄せると、六 m の口を外れて南の幕に当たる。
  if (p.z >= HQ.z + 6 && Math.abs(p.x - MOUTH.x) <= 1.5) return HQ;
  // 正面の幕際では横へ回らず、先に布から離れる。横移動は幕の当たりに沿って詰まり、
  // 角を回った直後に口へ向き直す道とも切り替わり続けていた。
  if (p.z >= HQ.z + 6 && p.z < MOUTH.z && Math.abs(p.x - HQ.x) < 14) return { x: p.x, z: MOUTH.z + 3 };
  if (p.z < HQ.z + 6.5) {
    // 角の外の道は判定の帯（14 m）より三 m 外。15 では 14 m の際で行き先が着いた扱いの半径に入り、bot が幕の横で止まった（11/9）
    const x = HQ.x + (p.x >= HQ.x ? 17 : -17);
    return Math.abs(p.x - HQ.x) < 14 ? { x, z: p.z } : { x, z: MOUTH.z + 3 };
  }
  if (Math.abs(p.x - MOUTH.x) > 1.5) return { x: MOUTH.x, z: MOUTH.z + 1.5 };
  return HQ;
};
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OWN = { armor: 0x2a2420, lace: 0xb8342a, flag: 'maru' };   // 主人公の軍（丸の旗・朱の威）
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };      // 井伊の赤備え（全員朱）
const TODO = { armor: 0x24221f, flag: 'todo' };
const TK = { armor: 0x1f1e1c, flag: 'tokugawa' };
const HONDA = { armor: 0x1c1a18, flag: 'honda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const busho = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, horse: true, ...o } });
// 負傷して戦列を離れた兵は、達成判定・人数・行き先のどれにも残さない。
const live = (g) => g && g.units.some(standing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (standing(u) ? 1 : 0), 0) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const KEEP = 0.4;
// 刻限後半の緩和も、目標札と段の達成判定で同じ人数を使う。
// 残兵が一人でも必要人数を零に丸めない。待つだけで達成させない。
const stepNeed = (F, t) => Math.max(1, Math.round(F.stepN * (F.stepSeen && F.engagedT != null && t - F.engagedT > STEP_T[F.step] * 0.6 ? 0.4 : 1 - KEEP)));
const ROAD = [[0, 190], [2, 80], [0, 0], [0, -146]];
// 旧暦五月（今の六月）の淀の野は田植えの済んだ水田（若江・八尾の深田と同じ）。京街道の土手道と畦の外は水の張った田で、降りれば足を取られる
//   本陣の微高地・藤堂の本陣・東の林と赤備えの駆ける道・自分の陣の持ち場は乾いた畑と野に残す
function paddy(x, z) {
  if (Math.abs(x) > 112 || z < -140 || z > 160) return 0;
  if (distToPolyline(x, z, ROAD) < 6) return 0;
  if (dist({ x, z }, HQ) < 34 || dist({ x, z }, TODO_HQ) < 22 || dist({ x, z }, START) < 30 || dist({ x, z }, { x: -16, z: 52 }) < 14 || dist({ x, z }, { x: 22, z: 52 }) < 14) return 0;
  if (x > 4 && z > -64 && z < -14) return 0;
  if (Math.abs(x) < 40 && z < -84 && z > -112) return 0;   // 鉄砲衆の立つ乾いた畑と馬防柵の並び   // 東の林から土手へ、赤備えが駆ける乾いた畑（横槍を受ける土手の東の脇も）
  if ((Math.floor(x / 14) + Math.floor(z / 12)) % 4 === 1) return 0;   // ところどころ畑と畦の空き
  const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.95;
}   // 段の隊は四割まで減れば崩れて退く（倒す数＝六割）

// 水を張った田の面（11/6 遊んで見た：地図では田なのに、三次元の地面は一面の草の野で水が一つも見えなかった。二1・八3）。
//   田の一枚ごとに、畦の内側へ浅い水の面を一枚。濁った水に空が映り、植えたばかりの苗の列が並ぶ（絵はキャンバスで描く）。全部で一つの形・一つの材質
function paddyWater(rt) {
  if (typeof document === 'undefined') return;
  const W = rt.world, pos = [], uv = [], col = [], idx = [];
  for (let cx = -112; cx < 112; cx += 14) for (let cz = -144; cz < 160; cz += 12) {
    // 外の輪（畦の際・水が薄れて消える）と内の輪（水の深い所）の二重の四角。縁をぼかして板の四角に見せない
    const ring = (k) => [[cx + k, cz + k], [cx + 14 - k, cz + k], [cx + 14 - k, cz + 12 - k], [cx + k, cz + 12 - k]];
    const out = ring(1.1), inn = ring(2.2);
    if ([...ring(1.6), [cx + 7, cz + 6]].some(([x, z]) => paddy(x, z) < 0.55)) continue;   // 畦の際（1.4 m 内）は paddy が薄いので少し内で見る
    let y = -1e9;
    for (const [x, z] of [...inn, [cx + 7, cz + 6]]) y = Math.max(y, W.heightAt(x, z));
    y += 0.03;
    const b = pos.length / 3;
    for (const [x, z] of out) { pos.push(x, y - 0.06, z); uv.push(x / 4, z / 4); col.push(0.62, 0.55, 0.42); }   // 際は泥の透ける浅瀬
    for (const [x, z] of inn) { pos.push(x, y, z); uv.push(x / 4, z / 4); col.push(1, 1, 1); }
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(b + k, b + 4 + k, b + k2, b + k2, b + 4 + k, b + 4 + k2); }
    idx.push(b + 4, b + 6, b + 5, b + 4, b + 7, b + 6);
  }
  if (!idx.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  // 濁った水に映る空と、まばらな苗（三十 cm ほどの間の株）：一枚の小さな絵を繰り返す
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 256, 256); sky.addColorStop(0, '#6c7770'); sky.addColorStop(0.5, '#606a60'); sky.addColorStop(1, '#6a7468');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
  let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${84 + R() * 30 | 0},${86 + R() * 20 | 0},${66 + R() * 16 | 0},${0.1 + R() * 0.12})`; g.beginPath(); g.arc(R() * 256, R() * 256, 10 + R() * 30, 0, 6.29); g.fill(); }
  for (let gy = 0; gy < 256; gy += 19.7) for (let gx = 0; gx < 256; gx += 19.7) {
    if (R() < 0.12) continue;   // 欠けた株
    const px = gx + 9 + (R() - 0.5) * 3, py = gy + 9 + (R() - 0.5) * 3;
    for (let k = 0; k < 3; k++) { g.strokeStyle = `rgba(${86 + R() * 30 | 0},${118 + R() * 26 | 0},${48 + R() * 14 | 0},0.85)`; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 5, py - 2 - R() * 3); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // 空の映り：明るい灰青を少し自ら光らせる（遠くほど空と馴染む）。照り返しはぎらつかせない
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xa8ac9c, emissive: 0x3a4246, emissiveIntensity: 0.08, roughness: 0.16, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // 水は見下ろせば濁りと苗が透け、浅く見るほど空が映る（板の灰色に見せない）
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      { float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.58, 0.6, 0.52), vec3(0.4, 0.45, 0.47), clamp(fr * 0.6, 0.0, 0.5)); }`);
  };
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true; m.name = 'k16_paddy_water';
  rt.scene.add(m);
}

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.05 + x * 0.02);
  // 淀は標高およそ十 m の平らな野で丘は無い（docs/battle_learn/k16_secret.md）。本陣は川沿いの微高地（自然堤防の高まり。二 m ほど）に置く
  h += 2.2 * gauss(x, z, HQ.x, HQ.z - 6, 700);
  h += 1.2 * gauss(x, z, -120, 40, 1400) + 1.2 * gauss(x, z, 130, -30, 1600);
  // 京街道は田の中を通る土手道（文禄堤の上の道。高さ一 m 余り）。堤の上が戦いの縄張りになる（若江の玉串川・八尾の長瀬川）
  const rx = z > 80 ? 2 * (190 - z) / 110 : z > 0 ? 2 * z / 80 : 0;
  h += 1.3 * Math.exp(-((x - rx) ** 2) / 16) * Math.min(1, Math.max(0, (z + 146) / 14));
  h -= 1.6 * Math.exp(-((x + 150) ** 2) / 300);        // 西の淀川の低み
  h += 1.8 * Math.exp(-((x + 122) ** 2) / 30);         // 淀川の川岸の堤（川除け）
  h -= 1.2 * Math.exp(-((x - 190) ** 2) / 900);        // 東の巨椋池の縁の湿りの低み
  return h;
}

// 右上の目標の札：①〜⑤を最初から全部並べ、済んだ物に印（九1・十1）。両軍の兵の数の棒（armybar）も上に常に出す（九3・十二1）。
//   見える敵の兵には一人残らず頭上に赤い▼（距離で省かず、見通しのある者。九3）。道明寺（b_k13_domyoji.js）と同じ作り。戦が終われば元へ戻す
const BOARD_CSS = `
html:root body #hud#hud#hud.k16-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.k16-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.k16-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode {
 /* 行き先の印（重なり順三・四）と敵の▼より手前に置き、目標の字を覆わせない。 */
 z-index:5 !important;
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
/* 残り時間だけを隠す。討った人数まで隠すと、何人中何人か分からなくなる。 */
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em.tm) { display:none !important; }`;
function goalBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('k16-goals');
  const style = document.createElement('style');
  style.textContent = BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
    return out;
  };
  const foeMarks = hud.foeMarks, tris = [], box = document.createElement('div'), v = new THREE.Vector3();
  box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none';
  box.setAttribute('aria-hidden', 'true');
  hud.root.appendChild(box);
  hud.foeMarks = function (battle) {
    const out = foeMarks.call(this, battle);
    if (battle !== rt) return out;
    const me = rt.player.u;
    const on = me.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    const rects = on ? this.hudRects() : null;
    let n = 0;
    if (on) for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget || u.isStruct || u.civ || u.team === me.team || u.team > 1 || u._nearSignOn ||
          u.mesh?.visible === false || u.camHidden) continue;
      if (!(u._k16SeenAt > rt.t - .34 && u._k16SeenAt <= rt.t)) { u._k16Seen = sightUnit(rt, u); u._k16SeenAt = rt.t; }
      if (!u._k16Seen) continue;
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      const x = (v.x + 1) * innerWidth / 2, y = (1 - v.y) * innerHeight / 2;
      // 共通の札の範囲を使い、追加した敵の▼も目標・兵数・台詞を覆わない。
      let covered = false;
      for (const r of rects) if (x + 11 > r.left && x - 11 < r.right && y + 2 > r.top && y - 20 < r.bottom) { covered = true; break; }
      if (covered) continue;
      let el = tris[n];
      if (!el) {
        el = tris[n] = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff4a2e;font-size:18px;line-height:1;-webkit-text-stroke:1px #2a0d06;text-shadow:0 1px 2px #000;pointer-events:none';
        box.appendChild(el);
      }
      n++;
      el.hidden = false;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (let i = n; i < tris.length; i++) tris[i].hidden = true;
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    // 締めの途中でホームや再開へ移った時も、天下人の表示を次の画面へ残さない。
    if (rt.flags.endEl) { rt.flags.endEl.remove(); rt.flags.endEl = null; }
    hud.foeMarks = foeMarks; box.remove();
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('k16-goals'); style.remove();
    return dispose.call(this);
  };
}

const k16_secret = {
  resumeSteps: 5,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜5) を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。淀の野（もしもの戦）：大坂の陣の後の初夏。土埃と踏み荒らした草、倒れた槍と旗
  timeslip: {
    wet: 0.15, dust: 0.65, trample: 0.4, debris: 1.3, arrows: 0.9,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a3a],
  },
  spawn: { x: START.x, z: START.z + 6, heading: Math.PI },
  minutes: 14,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  frontlineDensity: false,
  compactIntro: true,
  waitForPortrait: true,  // 覚えた顔が無い時も黒い人影を出さず、撮れた本人の顔だけを一度出す（五6）
  // 総大将の主人公が自ら前に出る訳を一行で（天王寺口の真田信繁と同じ、旗本を率いた本陣への決死の突き）
  // 騎馬の隊旗は筒の吹流しにせず幟に（固い円錐が宙に横に突き出たまま揺れなかった。11/8 critic60 八1・三方ヶ原と同じ）
  standardKinds: { cavalry: 'spear' },
  introText: () => '大坂落城の後、毛利・島津・上杉が起った。旗本と全軍の先頭に立ち、淀の野で家康の本陣へ届いて、戦を終わらせよ。',
  hideGuideSteps: true,
  goalsAllRows: true,      // 共通の一件表示に隠されず、五つを始めから並べる
  goalVisibleRows: 5,     // 共通の目標札は表示件数も指定しないと、今の一件だけを作る
  stageGoalsOnly: true,    // 目標は段の五つだけ（「敵を何人討つ」で埋めない。結果の札にも①〜⑤）
  noGoalCount: true,       // 画面の端の赤い矢印を出さない（五3：印は真上の▼一つ）
  avoidMarkerNotices: true, // 行き先の印も右上の五つの目標と兵数の札を避ける
  distanceUnit: 'metres',
  // 途中の共通の見出し（「一騎打ち」「敵の隊が崩れた」「敵将が倒れた」）は説明の字なので出さない（五1）。大きく出すのは「家康、討ち取ったり」と負けの見出しだけ
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵の隊が崩れた' && t !== '敵将が倒れた' && t !== '敵の大将が討たれた',
  noCouriers: true,
  allowAmbientBattleCalls: (rt) => !rt.flags.quiet,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  // 共通の大将の輪（taisho_guard.js）を出さない：家康・秀忠・高虎の守りはこの戦の本物の旗本と近習で組む（11/8 流し：名の無い輪の隊が湧き、家康の段で主人公が引きずられた）
  noTaishoGuard: true,
  noHatamotoMass: true,
  foeMarks: true,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  // 行き先のピン：段ごとに一つ。場所名を明示し、終幕でも前の目標の名を引き継がない。
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    // 開戦直後も①の目標は出ている。最初の下知まで行き先の印を消さない。
    if (!F.step) {
      PIN.x = SAKITE.x; PIN.z = SAKITE.z; PIN.label = STEP_PLACE[1];
      PIN.destinationName = PIN.label;
      PIN.destinationDistance = Math.ceil(dist(PIN, rt.player.u.pos));
      return PIN;
    }
    const g = F.stepG, P = rt.player.u;
    // 家康の段：陣幕の外では口を指し、内に入れば床几の家康の頭上（陣幕の向こうの野を指さない）
    // ほかの段：段の隊が立っている間は、その隊の自分に一番近い兵（隊の真ん中が空の野に落ちない）
    let p = STEP_AT[F.step];
    if (F.step === 5) p = campRoute(P.pos, F.ieyasu && F.ieyasu.alive ? F.ieyasu.pos : MOUTH);
    else if (live(g)) {
      let bd = 1e9;
      for (const u of g.units) if (standing(u)) { const d = dist(u.pos, P.pos); if (d < bd) { bd = d; p = u.pos; } }
      // 味方が先に隊を減らし、残兵が遠くへ散った時は、未到着の目標へ導く。
      // 残兵を追って目標の場所から離れ続けると、到着の判定に入れなくなる。
      if (!F.stepSeen && F.stepN > 0 && F.stepN - aliveN(g) >= F.stepN * 0.3 && bd >= 35) p = STEP_AT[F.step];
    }
    // 柵越しの敵へ直進させず、実際に抜けられる京街道の口を指す。
    p = viaGap(P.pos, p) || p;
    PIN.x = p.x; PIN.z = p.z;
    PIN.label = F.step === 5 ? (inCamp(P.pos) ? '床几の家康' : '陣幕の口') : STEP_PLACE[F.step];
    // 共通の画面内の▼と画面外のピンは label ではなく、この二つを読む。
    PIN.destinationName = PIN.label;
    PIN.destinationDistance = Math.ceil(dist(PIN, P.pos));
    return PIN;
  },
  world: {
    seed: 1615516,
    time: 'morning',
    groundHalf: 260,
    moveLim: 230,   // 秀忠の陣（z -195）と本陣の裏まで兵が動ける（既定の 176 では陣の兵が端へ引き戻され、一息で飛んだ。11/9 bot）
    paths: [ROAD],
    height,
    paddy,
    fieldStage: 'seedling',   // 植えたばかりの稲と水の張った田
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.7 + 0.08, c.g * 0.8 + 0.1, c.b * 0.6 + 0.04);   // 初夏の青田と野
      if (x < -140 || x > 175) c.setRGB(c.r * 0.7, c.g * 0.75, c.b * 0.8);   // 西の川・東の巨椋池の縁の湿り
    },
    clear: (x, z) => Math.abs(x) < 200 && z > -215 && z < 240,
    trees: 240,
    tufts: 2600,
    // 遠い縁の木は薄く（遠くの木は板の絵になり、近づくと本物に替わる。九5）。淀の野は田の広がる平らな野
    treeDensity: (x, z) => (Math.abs(x) > 205 || z < -220 || z > 245 ? 0.3 : 0.1),
    // 遠くの林を近くの木と同じ初夏の深い緑に（灰色の切り絵の林が七十秒で急に緑の林へ替わって見えた。11/8 critic60 九5）
    farTreeTint: new THREE.Color(0.8, 0.95, 0.7),
    // 赤備えが待つ東の林・藤堂高虎の本陣の脇の林・本陣の丘の後ろの林
    groves: [{ x: -62, z: -54, r: 10, n: 12 }, { x: 92, z: -46, r: 13, n: 16 }, { x: -30, z: HQ.z - 26, r: 10, n: 10 }],
    fleeOut: (x, z, team) => (team === 1 ? z < -238 : z > 200),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    paddyWater(rt);      // 土手道の左右の水を張った田
    const W = rt.world, F = rt.flags, S = Math.PI;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ek = 0; F.ak = 0; F.ending = false;
    const foe = (name, at, list, o = {}) => {
      const g = enemyGroup(rt, { faction: 'tokugawa', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: o.facing ?? 0, width: o.width || 8, noRout: true, formation: o.formation || 'yari',
        morale: o.morale || 95, dmgMult: o.dmg || 0.45, order: 'hold', seekRange: o.seek || 14, aggro: o.aggro || 12, speed: o.speed || 3.7, ...(o.fire ? { fire: true } : {}) }, list);
      // 隊旗（battle.js の scanStandards）は隊の家の紋で（藤堂・井伊・本多の隊に葵の隊旗を立てない）
      g.mon = list.find((s) => s.o && s.o.flag)?.o.flag || 'tokugawa';
      F.foes.push(g);
      return g;
    };

    // ---- 徳川方：丘の上の家康の本陣（陣幕・金扇の馬印・床几）。旗本が陣幕の口を固める ----
    // 口の外の置楯の列（tate）は野の本陣に見えない穴の並ぶ板なので置かない。陣幕の口は南（自分の軍の来る方）に開く
    F.camp = camp(rt, { x: HQ.x, z: HQ.z, facing: 0, team: 1, faction: 'tokugawa', mon: 'tokugawa', armor: TK.armor, uma: 'ogi', guard: 20, guardFlag: 'tokugawa', guardTroops: dress([uS(15), uC(5)], TK), reserve: 0, noUma: true, tate: false, runTo: { x: 0, z: -240 } });
    if (F.camp.guard) { F.camp.guard.noRout = true; F.camp.guard.name = '本陣の旗本'; F.foes.push(F.camp.guard); }
    // 陣幕の内は床几の家康と近習の侍だけ（多すぎると家康が見えない）
    F.hon = foe('徳川家康の本陣', { x: HQ.x, z: HQ.z - 1 }, dress([busho('徳川家康', { horse: false, invuln: true }), uS(9), uG(2)], TK), { width: 6, morale: 100, seek: 6, aggro: 6, dmg: 0.6 });
    F.ieyasu = F.hon.units.find((u) => u.name === '徳川家康');
    // 家康の金扇は陣幕の後ろに据えた一本（討てば倒れる）だけ。named_gear.js の馬印持ちが背負う二本目の扇は置かない
    for (const u of F.hon.units) if (u.isUma) rt.army.despawn(u);
    // 床几に腰を下ろす。元和元年の家康は七十四歳：太刀は振るうが、若い将のように一騎打ちで押し勝ちはしない
    if (F.ieyasu) { F.ieyasu._crouch = true; F.ieyasu.dmg *= 0.4; F.ieyasu.maxHp *= 0.15; F.ieyasu.hp = F.ieyasu.maxHp; }
    F.hon.defMult = 1.1; F.hon.fire = false;   // 陣幕の内の供の鉄砲は野へ追って出ない
    // 本陣の丘を葵の幟で囲む（Q：旗がぶわっと並ぶ。旗は動かない陣にだけ立て、隊が去った後に旗だけ残さない AR5）
    for (const [x, z, h] of [[-18, HQ.z + 10, 7], [18, HQ.z + 10, 7], [-34, HQ.z - 4, 6], [34, HQ.z - 4, 6], [-9, HQ.z + 13, 7], [9, HQ.z + 13, 7], [-28, HQ.z + 4, 6], [28, HQ.z + 4, 6], [-24, HQ.z - 16, 6], [24, HQ.z - 16, 6]]) rt.scene.add(nobori(W, x, z, 'tokugawa', h));
    // 金扇の馬印（自分で立てて、討ち取った時に倒す）と、家康の「厭離穢土欣求浄土」の旗（named_gear.js の家康の旗）
    F.uma = umajirushi(W, HQ.x + 0.6, HQ.z - 7.2, 0, 'ogi'); rt.scene.add(F.uma);
    for (const x of [-5, 5]) rt.scene.add(nobori(W, x, HQ.z + 9, 'onri', 7));
    rt.scene.add(tawara(W, 40, HQ.z - 20, 0.2, 5));   // 小荷駄の俵（野の本陣に小屋は建てない）
    // 本陣の前の本多正純の旗本・丘の下の鉄砲衆
    F.honda = foe('本多正純の旗本', HONDA_AT, dress([busho('本多正純', { hat: 'kabuto_m' }), uS(20), uC(3)], HONDA), { width: 9, morale: 98 });
    for (const [x, z] of [[-14, HONDA_AT.z - 8], [0, HONDA_AT.z - 10], [14, HONDA_AT.z - 8]]) rt.scene.add(nobori(W, x, z, 'honda', 6));
    // 秀忠の陣：本陣の後ろ東に二代将軍と旗本。家康が討たれるまで動かない（docs/if_final_genna.md 最終局面「秀忠 まだ終わらぬ」）
    give('徳川秀忠', { armor: 0x1c1a18, lace: 0x3a3a48, hat: 'kabuto_m', haori: 0x24242a, mon: 'tokugawa', lord: true,
      face: face({ age: 36, beard: { mus: 0.5, musW: 1, droop: 0.2, goat: 0.2, side: 0, stub: 0.4 } }) });
    F.hide = foe('徳川秀忠の陣', HIDE, dress([busho('徳川秀忠', { horse: false, invuln: true }), uS(8), uG(2)], TK), { width: 6, morale: 100, seek: 6, aggro: 6 });
    F.hide.fire = false;
    F.hidetada = F.hide.units.find((u) => u.name === '徳川秀忠');
    if (F.hidetada) F.hidetada._crouch = true;
    for (const u of F.hide.units) if (u.isUma) rt.army.despawn(u);
    for (const [x, z] of [[HIDE.x - 8, HIDE.z + 6], [HIDE.x + 8, HIDE.z + 6], [HIDE.x, HIDE.z - 8]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    // 藤堂高虎の縄張りの馬防柵（docs/if_final_genna.md：高虎が作った柵を最後まで攻める）。鉄砲衆の前と本陣の旗本の前の二重。口は京街道の上の八 m だけ
    for (const z of [TEPPO.z + 7, HONDA_AT.z + 9]) for (const [a, b] of [[-36, -4], [4, 36]]) rt.scene.add(bobosaku(W, [a, z, b, z], { noTrench: true }));
    // 鉄砲衆は前に槍の足軽を立てて撃つ（寄せる間ずっと撃たれ、槍の前で足が止まる。斬り込みが五秒で終わらない）
    F.teppo = foe('徳川の鉄砲衆', TEPPO, dress([uS(2), uA(8), uG(14)], TK), { width: 12, formation: 'line', fire: true, seek: 30, dmg: 0.8 });
    // 東の林の陰の井伊の赤備え（騎馬を厚く。直孝は自ら前に出る将）
    F.ii = foe('井伊直孝の赤備え', II_AT, dress([busho('井伊直孝', { hat: 'kabuto_tentsuki' }), uC(7), uS(4), uA(12)], II), { facing: -1.2, width: 9, morale: 100, seek: 8, aggro: 8, speed: 4.2 });
    // 京街道の藤堂の先手と、後ろの林の脇の藤堂高虎の本陣（高虎は座ったまま動かない）
    F.todo = foe('藤堂の先手', SAKITE, dress([busho('渡辺勘兵衛'), uS(6), uA(22), uG(6)], TODO), { width: 12, morale: 92, seek: 18 });
    F.takatora = foe('藤堂高虎の本陣', TODO_HQ, dress([busho('藤堂高虎', { horse: false, invuln: true }), uS(8)], TODO), { width: 5, morale: 100, seek: 6, aggro: 4 });
    F.takatora.fire = false;   // 高虎の本陣は座ったまま。供の鉄砲が獲物を追って野へ出ない
    const tk = F.takatora.units.find((u) => u.name === '藤堂高虎');
    if (tk) tk._crouch = true;
    // invuln だけでは共通の深手処理で本人に討たれる。筋書きで生かす間は退去も討死もさせない。
    // 共通の武将の応戦は stay より先に床几から立たせる。筋書きで動くまでは挑ませない。
    for (const u of [F.ieyasu, tk, F.hidetada]) if (u) {
      u.mustLive = true;
      u.onWound = () => { u.hp = u.maxHp; };
    }
    for (const [x, z] of [[-52, -38], [-36, -38], [-56, -48], [-32, -48], [-44, -54]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // 徳川方の備は段ごとの下知だけで動く（共通の敵の頭 ai.js に任せると、家康の本陣・旗本・高虎の本陣まで持ち場を出て前線へ来る。一2）
    //   後ろの備は自分の段まで持ち場を動かない（stay：本人を見て一人ずつ駆け出さない）。本陣・旗本・高虎の本陣は最後まで動かない
    for (const g of F.foes) { g.noAI = true; if (g !== F.todo) g.stay = true; }
    // 目標に名を書いた将は、右上の目標・頭上の名で伏せない（「見えぬ敵の陣を物見する」に化けさせない。十1）。家臣が始めに名を告げている
    for (const nmx of ['渡辺勘兵衛', '井伊直孝', '本多正純', '徳川家康', '藤堂高虎', '徳川秀忠']) revealName(rt, nmx);

    // ---- 自分の軍：左右の備と、自分の組（大将の旗本） ----
    // 呼びかけに応じた大名の備（docs/if_final_genna.md 味方陣営）。隊旗はその家の紋（faction の既定の織田の木瓜の大幟を立てない。一6）
    const ally = (name, at, list, o = {}) => {
      const flag = o.flag || OWN.flag;
      // 味方も段ごとの下知を保つ。共通の隊判断が前の戦線へ行き先を戻し、後詰が止まるのを防ぐ。
      const g = allyGroup(rt, { faction: 'oda', flag, name, anchor: at, facing: S, width: 12, aggro: 12, seekRange: 18, speed: 3.8, order: 'hold', fixed: true, noAI: true, noRout: true, fullStrength: true, formation: 'yari', ...o }, dress(list, { ...OWN, flag }));
      g.defMult = 1.6; g.dmgMult = 0.85;
      g.mon = flag;
      return g;
    };
    F.ally = ally;
    F.left = ally('毛利秀元の備', { x: -16, z: 52 }, [uS(4), uA(20), uG(6)], { flag: 'mori' });
    F.right = ally('島津家久の備', { x: 22, z: 52 }, [uS(4), uA(18), uC(6)], { flag: 'shimazu' });
    for (const [x, z, k] of [[-30, 60, 'mori'], [-24, 66, 'mori'], [36, 60, 'shimazu'], [30, 66, 'shimazu']]) rt.scene.add(nobori(W, x, z, k, 6));
    const n = RANKS[rt.G.rank].squad;
    // 主人公の馬印は立てない（共通の金扇は家康の金扇と見分けがつかず、白の吹貫は遠目に白い柱に見えた）。自分の軍の目印は丸の幟
    if (rt.player.u.look && rt.player.u.look.uma) rt.player.u.look.uma = null;
    rt.makeSquad({ x: START.x, z: START.z }, S, [{ kind: 'spear', n: Math.max(12, Math.min(n || 12, 16)) }]);
    for (const [x, z, h] of [[-10, 70, 7], [12, 70, 7], [-22, 76, 6], [24, 76, 6], [-8, 90, 6], [10, 90, 6]]) rt.scene.add(nobori(W, x, z, OWN.flag, h));
    // 主人公自身の大旗（docs/finale_spec_1109.md）：一生ずっと誰かの旗の下で戦ってきた者の旗が、初めて本陣の真ん中に立つ。印は自分の合印
    F.ownFlag = nobori(W, 0, 84, rt.G.aijirushi || OWN.flag, 11); F.ownFlag.scale.multiplyScalar(1.35); rt.scene.add(F.ownFlag);

    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('s1', STEP_TEXT[1], 'main');   // 采配までの間も右上は①（共通の「味方の旗へ」を出さない。三3）
    goalBoard(rt);
    // 采配を待つ間も両軍は動く（突っ立つ兵を出さない。一3）：藤堂の先手は土手道をじりじり南へ押し出し、左右の備は槍を揃えて前へ詰める
    if (live(F.todo)) { F.todo.order = 'attack'; F.todo.anchor = { x: SAKITE.x, z: SAKITE.z + 8 }; F.todo.speed = 1.5; F.todo.seekRange = 8; }
    for (const [g, x] of [[F.left, -16], [F.right, 22]]) { g.order = 'attack'; g.anchor = { x, z: 42 }; g.speed = 1.6; g.seekRange = 8; }
    // 始まりから動ける（kaito CB：十秒兵が動かないとバグに見える）。家臣の知らせは駆けながら聞く
    F.holdPlayer = false;
    rt.say(ADV, '殿の旗が、初めて本陣の真ん中に立ちましたな。遠くの金扇が家康の本陣。京街道の先手は藤堂、井伊の赤備えは東の林に潜んでおりましょう', 3.6);
    rt.after(2.5, () => this.toStep(rt, 1));
  },

  // 段の隊が崩れた：生き残りは名のある将ごと北へ退く（討ち死にさせ尽くさない）
  fall(rt, g) {
    if (!live(g)) return;
    g.order = 'retreat'; g.dest = { x: g.center().x * 0.5, z: -250 }; g.speed = 4.2; g.aggro = 0; g.noRout = false;
  },

  // 段を進める（右上の目標と行き先のピン）。味方の備は段の場所へ一緒に走る（AP5・AQ7）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step && !F.failed) rt.objDone('s' + F.step);
    F.failed = false;
    F.step = n; F.stepT = rt.t; F.stepN = 0; F.stepSeen = false; F.engagedT = null; F.farT = 0;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    const mine = [null, null, F.ii, F.teppo, F.honda][n];
    if (mine) mine.stay = false;   // 自分の段の備だけ持ち場を出る
    const go = (g, p, seek = 30) => { if (!live(g)) return; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g.speed = 3.9; };
    const atk = (g, p, seek = 40) => { if (!live(g)) return; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g.aggro = 18; };
    // 左右の備は横に並んだ一つの前線として押す（真ん中の一点に団子にならない。九4）。後詰めは真ん中の後ろ
    const both = (p) => { for (const [g, dx, dz] of [[F.left, -12, 6], [F.right, 12, 6], [F.aid, 0, 12]]) go(g, { x: p.x + dx, z: p.z + dz }); };
    // 後ろの二の備が京街道を駆け上がって来る（二万の後続。見えない遠さの南から本物の兵で。倒れた分を埋める）
    const aid = (name, list, flag) => {
      if (F.aidPending || (live(F.aid) && aliveN(F.aid) > 8)) return;
      F.aidPending = true;
      rt.say(ADV, `${name}が京街道を駆け上がって参ります！`, 2.6);
      sfx('horagai', 0.7);
      rt.after(3, () => {
        F.aidPending = false;
        if (F.ending) return;
        // 前線が北へ進んでも、後詰を出発点へ置き去りにしない。
        F.aid = F.ally(name, { x: 2, z: rt.player.u.pos.z + 90 }, list, { speed: 4.2, flag });
        const p = STEP_AT[F.step];
        if (p) go(F.aid, { x: p.x, z: p.z + 12 });
      });
    };
    if (n === 1) {
      // 最後の号令（docs/if_final_genna.md）。稲生で隊長の背を追った足軽が、今は全軍に下知する。
      // 常設のボタンでなく、この戦だけのイベントの手（戸を開ける・火をつけると同じ）。押すと通常の下知の仕組みで全備へ前進（command_rank.js）。
      // 押さずにいても八秒で下知する（流れを止めない）
      const zengun = () => {
        if (F.zengun || F.ending) return;
        F.zengun = true;
        rt.uninteract('zengun');
        rt.setPhase('battle');
        sfx('horagai', 0.9); rt.after(1.2, () => sfx('taiko', 0.9));
        F.stepG = F.todo;
        allAdvance(rt, SAKITE);
        both(SAKITE);
        atk(F.todo, { x: SAKITE.x, z: SAKITE.z + 20 }, 30); if (live(F.todo)) F.todo.speed = 3.7;
        rt.army.play('toki', START, 1.4);
        rt.say(nm(rt), '全軍、進め。', 2.4);
        rt.after(2.6, () => rt.say(nm(rt), '稲生では、隊長の背を追うだけの足軽だった。……行くぞ', 3));
        rt.after(6, () => rt.say('渡辺勘兵衛', '藤堂の先手、一歩も退くな！', 3));
      };
      rt.addInteract('zengun', () => rt.player.u.pos, '全軍、進め', zengun, { r: 99, hold: 0.5, prio: 9 });
      rt.after(8, zengun);
    } else if (n === 2) {
      // 先手を割った所へ、東の林から赤備えが横槍に出る（言った隊は初めから林の陰にいた）
      F.stepG = F.ii;
      aid('長宗我部盛親の備', [uS(5), uA(20), uG(4)], 'chosokabe');
      atk(F.ii, YOKO, 50); F.ii.speed = 4.6;
      both(YOKO);
      rt.army.play('eshout', F.ii.center(), 1.6);
      rt.say(ADV, '東から赤備え！　井伊の騎馬にござる！　槍を揃えて受けよ！', 3.4);
      rt.after(4, () => rt.say('井伊直孝', '井伊の赤備え、掛かれ！　横腹を突け！', 3.2));
    } else if (n === 3) {
      F.stepG = F.teppo;
      both(TEPPO);
      F.teppo.seekRange = 40;
      rt.say(ADV, '柵の向こうに鉄砲が並んでおる！　京街道の口から一息に寄せよ！', 3.2);
      rt.after(3, () => sfx('taiko', 0.7));
    } else if (n === 4) {
      F.stepG = F.honda;
      aid('上杉の備', [uS(5), uA(14), uC(4)], 'uesugi');
      both(HONDA_AT);
      atk(F.honda, { x: HONDA_AT.x, z: HONDA_AT.z + 14 }, 30);
      rt.after(1, () => rt.say('本多正純', '大御所様の御前ぞ！　一人も通すな！', 3));
      rt.after(5, () => rt.say(nm(rt), '家康の本陣へ！　この戦を終わらせる！', 2.8));
    } else if (n === 5) {
      F.stepG = F.hon;
      if (F.ieyasu) F.ieyasu.invuln = false;
      both({ x: HQ.x, z: HQ.z + 10 });
      aid('上杉の備', [uS(5), uA(14), uC(4)], 'uesugi');
      // 天王寺口の手本：前の備が崩れると本陣の旗本も浮き足立って散り、金扇の周りが手薄になった（docs/battle_learn/k16_secret.md）。
      //   陣幕の内の侍（家康の本陣）は最後まで床几の家康を囲む
      if (live(F.camp.guard)) { this.fall(rt, F.camp.guard); rt.after(2, () => rt.say(ADV, '旗本が散ったぞ！　金扇の周りが手薄にござる！', 3)); }
      if (live(F.hon)) { F.hon.noRout = true; F.hon.morale = 100; F.hon.aggro = 10; F.hon.seekRange = 7; }
      if (F.ieyasu) F.ieyasu.invuln = true;   // 陣幕の内で言葉を交わし終えるまで（「数合だけ戦う」）
      // ここから曲が消え、遠くの戦の音だけ（docs/if_final_genna.md 最終局面）。名将を見た時の曲（battle_encounter.js）も鳴らさない
      stopMusic(4);
      const enc = rt.encounter || (rt.encounter = { seen: new Set(), scan: 0, left: 0, gap: 0, label: null });
      for (const k of ['徳川家康', '徳川秀忠', '藤堂高虎']) enc.seen.add(k);
      rt.after(1, () => rt.say(ADV, '厭離穢土欣求浄土の旗……あれが家康の本陣にござる', 3));
      rt.after(4.4, () => rt.say(ADV, '陣幕の口は正面！　口から斬り込め！', 2.8));
    }
  },

  // 家康の降伏から締めまで（docs/finale_spec_1109.md・kaito 11/9 夜）：家康が刀を置く → 金扇が下がり、秀忠の陣も止まる →
  //   主人公は首を取らず終戦を命じる → 敵味方が少しずつ得物を下ろす → 各方面から「戦闘停止！」→ 風と旗だけ → 「勝った……」→ 勝鬨 →
  //   「天下静謐」→ 主人公の名 → 「天下人」。大きな字はすぐ出さない
  win(rt) {
    const F = rt.flags;
    // 古い討死通知から、未達の段や最後の返事を飛ばして勝ちにしない。
    if (F.ending || F.step !== 5 || F.talk == null || rt.t - F.talk < 10.4 || !F.ieyasu?.alive || !rt.player.u.alive || rt.player.u.hp <= 0) return;
    F.ending = true; F.endPhase = 'quiet'; F.winT = rt.t;
    rt.setPhase('end');
    rt.player.u.invuln = true;
    stopMusic(2);
    const ie = F.ieyasu;
    if (ie && ie.alive) { ie.invuln = true; ie.mustLive = true; ie.noTarget = true; ie.target = null; ie.atk = null; ie.swing = null; }
    // 家康の金扇の馬印がゆっくり下がる（倒れるのでなく、下ろす）
    if (F.uma) { let a = 0; const lower = () => { a = Math.min(1, a + 0.04); F.uma.rotation.z = -1.2 * a * a; if (a < 1 && !rt.ended) rt.after(0.05, lower); }; rt.after(1.2, lower); }
    rt.say('徳川家康', 'この首はくれてやる。だが兵は、国へ帰してやってくれ', 3.4);
    rt.after(0.6, () => { if (ie && ie.alive) ie._crouch = true; });
    rt.after(3.8, () => rt.say(nm(rt), '首は要らぬ。戦は、ここで終いだ', 2.8));
    // 主人公が全軍に終戦を命じる：敵も味方も手を止め、徳川方は膝をつく
    rt.after(6.8, () => { rt.say(nm(rt), '全軍、槍を下ろせ', 2.4); sfx('horagai', 0.8); this.ceasefire(rt, 0.5); });
    rt.after(9.4, () => { this.ceasefire(rt, 1); rt.say('使番', '戦闘停止！　戦闘停止！', 2.4); });
    rt.after(12.2, () => rt.say('島津の使番', '島津勢も槍を伏せました！　戦闘停止！', 2.8));
    rt.after(15.2, () => rt.say(ADV, '秀忠公の陣も動きませぬ。……井伊も、藤堂も', 2.8));
    // 静けさ：しばらく風と旗の音だけ
    rt.after(18.4, () => { try { setScene({ wind: 1 }); } catch (e) { /* 音が無くても締めは続ける */ } sfx('bell', 0.3); });
    rt.after(22.6, () => rt.say('足軽', '……勝った、のか', 2.2));
    rt.after(25.2, () => rt.say('足軽', '勝った……！', 1.8));
    for (const [t, v] of [[26.6, 0.55], [29.4, 0.8], [32.2, 1]]) rt.after(t, () => { if (rt.ended) return; try { rt.army.celebrate(0); } catch (e) { /* なし */ } sfx('sig_eiei', v); });
    rt.after(35.5, () => victoryMoment(rt, '天下静謐'));
    rt.after(38.5, () => this.tenka(rt));
    // ⑤の済み・勝ちの印は締めの後（全部の目標が済むと共通の goalsDoneTick が二秒半で結果へ締め、締めの場面を切る）
    rt.after(48, () => {
      rt.tracker.main = true;
      rt.award((t) => { t.main = true; t.special = { label: '徳川家康を降した', pts: 100 }; }, '徳川家康を降した');
      rt.objDone('s5');
      rt.finish({ scriptedEnd: true }, 4);
    });
  },

  // 終戦：敵味方の隊の手を止める。k は止める割合（少しずつ得物を下ろす）。徳川方は膝をつく
  ceasefire(rt, k = 1) {
    const F = rt.flags;
    // 全軍が槍を下ろした後は、遠い兵の戦闘音と戦中の呟きも止める。
    // この戦の締めの台詞・勝鬨は、下の約束どおり別に鳴らす。
    if (k >= 1) F.quiet = true;
    for (const g of rt.army.groups || []) {
      if (g.isPlayerSquad && k < 1) continue;
      g.order = 'hold'; g.aggro = 0; g.seekRange = 0; g.fire = false; g.peaceful = true; g.keepMoveOrder = true;
      if (g.team === 1) g.noRout = true;
      g.units.forEach((u, i) => {
        if (!u.alive) return;
        if (k < 1 && (i % 2)) return;
        u.target = null; u.atk = null; u.swing = null; u.bind = null;
        // 槍を下ろした味方も、飛来中の弾や残る斬撃で討たせない。
        // 主人公も振りかけの攻撃を消し、終戦後の鍔迫り合いを残さない。
        u.noTarget = true; u.invuln = true;
        if (g.team === 1 && u !== rt.player.u && u.name !== '徳川家康') u._crouch = (i % 3) !== 0;
      });
    }
    F.cease = k;
  },

  // 締めの場面：「身分：足軽」が消えて「身分：天下人」へ。その下で今まで戦った地が順に光る（docs/if_final_genna.md「最後の画面・最後の演出」）
  tenka(rt) {
    if (typeof document === 'undefined' || rt.ended) return;
    const rm = document.body.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.createElement('div');
    el.id = 'tenka-end';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `身分、天下人。${PLACES.join('、')}`);
    const an = (name, d, dur = 0.6) => (rm ? '' : `animation:${name} ${dur}s ease-out ${d.toFixed(2)}s both;`);
    el.innerHTML = `<style>
      #tenka-end { position: fixed; inset: 0; z-index: 40; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 34vh 4vw 0; background: radial-gradient(ellipse at 50% 62%, rgba(10,8,6,.78) 0%, rgba(10,8,6,.5) 45%, rgba(0,0,0,0) 80%); }
      #tenka-end .mibun { position: relative; height: 40px; width: 16em; text-align: center; font: 700 26px/40px serif; letter-spacing: .1em; }
      #tenka-end .mibun span { position: absolute; inset: 0; }
      #tenka-end .old { color: #ece4d2; ${rm ? 'opacity:0;' : an('tkOut', 1.6, 0.8)} }
      #tenka-end .new { color: #f3d98a; text-shadow: 0 0 14px rgba(240,200,110,.7), 0 2px 3px #000; ${rm ? '' : an('tkIn', 2.4, 0.9)} }
      #tenka-end ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 92vw; }
      #tenka-end li { font: 600 13px/1.2 serif; color: #8a8274; background: rgba(28,22,16,.82); border: 1px solid rgba(236,228,210,.2); padding: 5px 7px; }
      #tenka-end li.on { ${rm ? 'color:#2a1c08;background:#e3c675;' : ''} }
      @keyframes tkOut { from { opacity: 1; } to { opacity: 0; transform: translateY(-6px); } }
      @keyframes tkIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes tkOn { to { color: #2a1c08; background: #e3c675; border-color: #fff3c4; box-shadow: 0 0 10px rgba(240,200,110,.6); } }
    </style><div class="tk-name" style="font:700 30px/1.2 serif;letter-spacing:.2em;color:#ece4d2;text-shadow:0 2px 4px #000;${an('tkIn', 0.4, 1.2)}">${esc(nm(rt))}</div><div class="mibun"><span class="old">身分：足軽</span><span class="new">身分：天下人</span></div>
    <ol>${PLACES.map((p, i) => `<li class="on" style="${an('tkOn', 3.4 + i * 0.28, 0.4)}">${p}</li>`).join('')}</ol>`;
    document.body.appendChild(el);
    rt.flags.endEl = el;
  },

  lose(rt, title, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner(title, why);
    rt.say(ADV, '殿、退きましょう！　天下は、また次に……', 4);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  onFinish(rt) {
    const el = rt.flags.endEl;
    if (el) { el.remove(); rt.flags.endEl = null; }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.endPhase === 'quiet') {
      // 止んだ後に寄って来る者がいても、もう斬り合わせない（止めた後に湧く狙いを毎回消す）
      if (F.cease >= 1 && (F.ceT = (F.ceT || 0) - dt) <= 0) { F.ceT = 1; this.ceasefire(rt, 1); }
      return;
    }
    // 家康は床几の辺り（幕の真ん中）から離れない：奥の幕際へ下がって近習の列の陰に隠れない・幕の外へ出ない（11/8 描いて遊んだ）
    const ie0 = F.ieyasu;
    if (ie0 && ie0.alive && !F.ending && (Math.abs(ie0.pos.x - HQ.x) > 4 || ie0.pos.z < HQ.z - 3.5 || ie0.pos.z > HQ.z + 2.5)) {
      ie0.pos.x = Math.max(HQ.x - 4, Math.min(HQ.x + 4, ie0.pos.x)); ie0.pos.z = Math.max(HQ.z - 3.5, Math.min(HQ.z + 2.5, ie0.pos.z)); ie0.target = null;
    }
    if (F.ending || !F.step) return;
    // 討死の処理より先にこの判定が走る事もある。命が尽きた本人で達成や降伏を進めない。
    if (!rt.player.u.alive || rt.player.u.hp <= 0) return;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const P = rt.player.u;
    // 目標の相手に寄ってから刻限を数える。未到着の目標を勝手に失敗にしない
    const left = STEP_T[F.step] - (F.engagedT == null ? 0 : rt.t - F.engagedT);
    // 退いた徳川方は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
      // 本陣・旗本・高虎の本陣の者は持ち場から三十 m より先へ追わない（一2）
      for (const g of [F.hon, F.camp.guard, F.takatora, F.hide]) if (g && g.order !== 'retreat') for (const u of g.units) if (u.alive && u.target && dist(u.pos, g.anchor) > 30) u.target = null;
    }
    if (left > 0) rt.objProgress('s' + F.step, `あと${mmss(left)}`);
    // 内の近習だけでなく、外の味方も幕越しに狙わない。双方の攻撃と鍔迫り合いを消す。
    for (const u of rt.army.units) if (u.alive) {
      const inside = inCamp(u.pos);
      // 構え・振り始めた刃は target と別に相手を覚えている。狙いだけ消しても攻撃が残る。
      if (u.target && inside !== inCamp(u.target.pos)) u.target = null;
      if (u.atk?.target && inside !== inCamp(u.atk.target.pos)) u.atk = null;
      if (u.swing?.target && inside !== inCamp(u.swing.target.pos)) u.swing = null;
      // 鍔迫り合いも相手を別に覚える。幕で隔てられた後の押し倒しを残さない。
      if (u.bind?.o && inside !== inCamp(u.bind.o.pos)) u.bind = null;
    }
    // 家康の段：家康が倒れれば勝ち（旗本が減っても家康は床几から逃げない）
    if (F.step === 5) {
      // 陣幕の内で家康が床几から立ち、太刀を抜いて言葉を交わす。言い終えるまで数合は討てない（docs/if_final_genna.md 最後の会話）
      const ie = F.ieyasu;
      // 家康を HP の大将にしない（docs/finale_spec_1109.md）：陣幕の内で家康のもとへ届いた事が勝ち。言葉を交わし終えると家康が刀を置く
      // 最後の「……そうか」（8.6秒後から1.8秒）を聞き終えてから降伏へ進む。
      if (F.talk && ie && ie.alive && rt.t - F.talk >= 10.4) { this.win(rt); return; }
      if (!F.talk && ie && ie.alive && inCamp(P.pos) && dist(ie.pos, P.pos) < 13) {
        F.talk = rt.t; F.engagedT = rt.t; ie._crouch = false;
        // 会話の間は本陣が狙い直さない。一度刃を消すだけでは次の思考で斬り始める。
        if (F.hon) {
          F.hon.peaceful = true; F.hon.fire = false;
          for (const u of F.hon.units) if (u.alive) {
            u.noTarget = true; u.invuln = true;
            u.target = null; u.atk = null; u.swing = null; u.bind = null;
          }
        }
        // 相手側だけ止めても、主人公が覚えた鍔迫り合いで会話中に押される。
        P.target = null; P.atk = null; P.swing = null; P.bind = null;
        P.invuln = true;
        rt.say('徳川家康', '信長公も、秀吉公も、天下を取った。だが天下とは、取るものではない', 3.4);
        rt.after(3.6, () => rt.say('徳川家康', '治めるものよ', 2));
        rt.after(5.8, () => rt.say(nm(rt), 'ならば、俺が戦を終わらせる。もう誰も死なせぬ', 2.6));
        rt.after(8.6, () => rt.say('徳川家康', '……そうか', 1.8));
      }
      if (live(F.hon)) { F.hon.noRout = true; F.hon.morale = Math.max(F.hon.morale, 60); }
      if (F.ieyasu && !F.ieyasu.alive) { this.win(rt); return; }
      if (left <= 0 && !F.talk) this.lose(rt, '家康に届かなんだ', '刻限のうちに家康の本陣へ届かず、徳川の軍勢が持ち直した');
      return;
    }
    const g = F.stepG;
    // 最初の号令前は相手の隊がまだ決まっていない。空の隊を全滅と数えない。
    if (!g) return;
    if (!F.stepN || F.stepNg !== g) { F.stepNg = g; F.stepN = Math.max(1, aliveN(g)); }   // 数えるのは段の始めに立っていた兵（前の段で味方が削った分は数えない）
    const gone = F.stepN - aliveN(g);
    // 段の隊の残りが散って、自分の周り三十五 m に一人もいないまま十秒（その場の戦いが済んだ）：崩れたとみなして次へ（空の野で立ち尽くさない。三2）
    let near = false;
    if (live(g)) for (const u of g.units) if (standing(u) && dist(u.pos, P.pos) < 35) { near = true; break; }
    if (!live(g) && dist(P.pos, STEP_AT[F.step]) < 35) near = true;
    // 敵だけが出発点まで寄ってきても刻限を始めない。主人公が目標の場所へ寄って接敵してから。
    // 味方が先に三割以上を退けた後なら、残兵が遠くても本人の到着を認める。
    // この印が無いと、下の「十秒待って次へ」が永久に働かない。
    if (!F.stepSeen && dist(P.pos, STEP_AT[F.step]) < 35 && (near || gone >= F.stepN * 0.3)) { F.stepSeen = true; F.engagedT = rt.t; }
    // 主人公が戦場から離れただけでは「敵が散った」にしない。目標の場所で残兵が来ない時だけ数える。
    F.farT = near || dist(P.pos, STEP_AT[F.step]) >= 35 || rt.t - F.stepT < 25 || gone < F.stepN * 0.3 ? 0 : (F.farT || 0) + 0.25;
    // 刻限の六割を過ぎて段の隊の四割を討っていれば、崩れたとみなす（11/9 bot：本多の旗本の散り残りを追い回して刻限が尽きた）
    if (!F.next && F.stepSeen && (gone >= stepNeed(F, rt.t) || F.farT > 10)) {
      F.farT = 0;
      F.next = true;
      this.fall(rt, g);
      const kanbei = F.step === 1 && g.units.find((u) => u.name === '渡辺勘兵衛');
      rt.say(ADV, F.step === 1 ? (kanbei && standing(kanbei) ? '藤堂の先手が崩れた！　勘兵衛が退いていく！' : '藤堂の先手が崩れた！') : `${g.name}が崩れた！`, 2.6);
      rt.after(3, () => { F.next = false; this.toStep(rt, F.step + 1); });
    } else if (!F.next && left <= 0) {
      // 一つでも果たせなければ勝ちには進めない。失敗した隊を自動で退かせない
      const why = ['', '京街道で押し返された', '赤備えに横腹を破られた', '鉄砲衆の前で足が止まった', '本多の旗本を抜けなんだ'][F.step];
      this.lose(rt, why, '刻限のうちに果たせず、徳川の軍勢が持ち直した');
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.team === 1 && v.name === '徳川家康') { this.win(rt); return; }
    if (v.type === 'busho' && v.team === 1 && v.name) {
      rt.say(ADV, `${v.name}、討ち取ったり！`, 2.8);
      rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 30 }; }, `${v.name}を討ち取った`);
    }
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    inp.quickCmd = null;
    if (F.holdPlayer || !F.step || F.ending || !u.alive) return;
    // 陣幕の外から幕越しに内の者を狙わない（布の前で止まらない）
    const ok = (o) => standing(o) && !o.invuln && Math.abs(o.pos.y - u.pos.y) < 3 && !(o.group && (o.group.order === 'retreat' || o.group === F.takatora || o.group === F.hide)) && inCamp(o.pos) === inCamp(u.pos) &&
      // 家康の段は本陣の近くの敵だけ（後ろの野へ追って戻らない）
      (F.step !== 5 || dist(o.pos, HQ) < 34 || dist(o.pos, u.pos) < 3);
    // 陣幕の内では、まわりの近習より床几の家康を狙う（奥の樽や太鼓の脇で近習を追い回さない）
    // 口を入った所（幕の内の広め）からは、近習に構わず床几の家康へ真っすぐ（11/8：口の際で近習と押し合って刻限が尽きた）
    const inside = inCamp(u.pos);
    const ie = F.step === 5 && F.ieyasu && F.ieyasu.alive && inside ? F.ieyasu : null;
    // 口の外で近習への間合いを保つと、会話が始まる幕の内へ入れない。まず口を通る。
    const entering = F.step === 5 && !inside;
    const e0 = entering ? null : (ie && b.army.nearestEnemy(u, 2.6, ok)) || ie || b.army.nearestEnemy(u, 9, ok);
    const gap = e0 && Math.hypot(e0.pos.x - u.pos.x, e0.pos.z - u.pos.z) > 2.6 ? viaGap(u.pos, e0.pos) : null;
    if (gap) { goTo(p, inp, gap.x, gap.z, 1); return; }
    const e = e0;
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      if (patientStrike) patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    // 家康の段：陣幕の外なら、まず口の前へ回り（幕の脇・裏から寄らない）、口から真っすぐ入って床几の家康へ
    let t = this.missionPin(b) || STEP_AT[F.step];
    if (F.step === 5 && F.ieyasu && F.ieyasu.alive) {
      t = campRoute(u.pos, F.ieyasu.pos);
    }
    t = viaGap(u.pos, t) || t;
    goTo(p, inp, t.x, t.z, 1.2);
    if (entering && patientStrike) {
      const threat = b.army.nearestEnemy(u, 2.6, ok);
      if (threat) patientStrike(p, inp, threat, Math.hypot(threat.pos.x - u.pos.x, threat.pos.z - u.pos.z), true);
    }
  },
};

// 両軍の総勢（もしもの数）：自分の二万、家康の三万。段の隊が崩れるたびに大きく減る
k16_secret.force = (rt) => {
  const F = rt.flags, st = Math.max(0, (F.step || 1) - 1);
  return { a: Math.max(40000, Math.round(87420 - (F.ak || 0) * 90 - st * 2600)), a0: 87420, b: Math.max(20000, Math.round(143650 - (F.ek || 0) * 140 - st * 17000)), b0: 143650 };
};
// bot の跡に家康の段の様子を足す（試し役の report。遊びには出ない）
k16_secret.botDbg = (b) => { const F = b.flags, u = b.player.u; if (F.step !== 5) return ''; const t = campRoute(u.pos, F.ieyasu?.alive ? F.ieyasu.pos : MOUTH); return `r${t.x.toFixed(0)},${t.z.toFixed(0)}${inCamp(u.pos) ? 'I' : ''}${F.talk ? 'T' : ''}${F.holdPlayer ? 'H' : ''}${b.botRest ? 'R' : ''}${u.moveTo ? 'M' : ''}`; };
k16_secret.ownEnding = true;   // 家康の降伏・戦の止み・天下静謐は win/tenka が流す（castle_fall_data の落城の流れと重ねない）
k16_secret.winWord = '天下静謐';
k16_secret.victoryCaption = '家康が刀を置き、戦が終わった';   // 勝ちの札は「勝利」でなく天下静謐（docs/if_final_genna.md 戦闘終了）
k16_secret.sides = { a: { name: '自分の軍', mon: 'maru' }, b: { name: '徳川軍', mon: 'tokugawa' } };
// 時刻は始まりの札と同じ「朝」で通す（光も同じ一つ。途中で昼に言い替えない。二2）
k16_secret.date = () => '元和元年（1615）五月末　夏・晴・朝　もしもの戦';
k16_secret.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '采配を振るまで待つ' : '');
k16_secret.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k16_secret.history = 'この戦は史実ではない、もしもの戦「元和天下返し」の最後の戦である。元和元年（1615）五月、大坂夏の陣で豊臣家は滅び、徳川家康は天下の主となった。家康は翌年に世を去り、征夷大将軍の位は慶長十年（1605）からすでに子の秀忠が継いでいた。徳川の世は、この後二百六十年ほど続く。\n淀は桂川・宇治川・木津川が寄り合う所で、秀吉が淀川の左岸に築いた堤の上を、伏見と大坂を結ぶ京街道が通っていた。東には巨椋池が広がっていた。\n大坂の落城を生き延びた明石全登、関ヶ原で領地を削られた毛利・島津・上杉、長宗我部盛親が主人公の呼びかけに応じ、淀の野で家康の本陣へ届き、家康が刀を置いて主人公が天下人になる筋は、足軽から出世してきた道の締めとして作った物語である。徳川方の五重の構え（先手・横槍・鉄砲・旗本・本陣）と、本陣へ切り込む流れは、夏の陣の天王寺口で真田信繁が先手を割って家康の本陣に迫った戦いを手本にした。';
k16_secret.bushou = [{ name: '徳川家康', g: /家康/ }, { name: '井伊直孝', g: /井伊/ }, { name: '渡辺勘兵衛', g: /藤堂の先手|勘兵衛/ }, { name: '本多正純', g: /本多/ }, { name: '藤堂高虎', g: /高虎/ }, { name: '徳川秀忠', g: /秀忠/ }];

const st = (k) => (rt) => (rt.flags.step || 0) >= k;
STAGES[ID] = [[STEP_TEXT[1]], [STEP_TEXT[2], st(2)], [STEP_TEXT[3], st(3)], [STEP_TEXT[4], st(4)], [STEP_TEXT[5], st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）。家康の段は家康一人
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending || !F.stepG || !F.stepN || F.step === 5) return null;
  return cut(F.stepN, aliveN(F.stepG), F.stepN - stepNeed(F, rt.t));
};

// 命懸けの戦場（lethal.js・docs/lethal_howto.md。11/9 係A：家康の本陣へ迫る短い戦なので soft）
k16_secret.lethal = k16_secret.lethal ?? { soft: true };
export { k16_secret };
export default k16_secret;
