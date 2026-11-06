// ======================================================================
// 徳川編 16　秘密の戦「天下分け目の淀の野」（もしもの戦・元和元年 1615 五月）
// 筋書きの正：docs/chapter3_tokugawa.md の「出世と軍勢・秘密の最後の戦（kaito 11/1 夜）」。手本の調べ：docs/battle_refs/k16_secret.md
// 徳川編の15戦にすべて勝つと開く（tokugawa_secret.js）。史実ではない。
// 大坂の陣の後、大名になった主人公が二万を率いて、京へ戻る家康の三万と淀の野で戦う。家康を討ち、征夷大将軍に任じられる。
// 見せかけの軍勢は置かない（AA・AF・AP9・AQ6・AT4）。見える兵は全部本物で、初めから持ち場に並ぶ（段で湧かせない。AT17）。
//   本物の兵：自分の側およそ八十・徳川方およそ百五十（二万対三万の二対三）
// 徳川方は五重：京街道の藤堂の先手（渡辺勘兵衛）→東の井伊の赤備え→丘の下の鉄砲衆→本多正純の旗本→丘の上の家康の本陣（床几）
//   総大将の家康と藤堂高虎は後ろの本陣で座ったまま動かない（AR3・AT3）。高虎は討てない
// 段（目標ごとの刻限）：①勘兵衛の先手 ②直孝の赤備え ③鉄砲衆 ④正純の旗本 ⑤陣幕の内の家康
// 勝った後：金扇の馬印が倒れ、勝鬨。京の御所へ将軍宣下を願う早馬を立て、出世の道（足軽→…→天下人→征夷大将軍）を一段ずつ灯して締める。
// 向き：北が -z（家康の本陣・京の方）。自分の軍は南（+z）から北へ。
// ======================================================================
import * as THREE from 'three';
import { nobori, tawara, umajirushi } from './props.js';
import { RANKS, LADDER } from './state.js';
import { STAGES, KILLS, cut } from './stages.js';
import { GENERALS } from './units_data.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { timeslipField } from './timeslip_field.js';
import { distToPolyline } from './world.js';
import { revealName } from './battle_intel.js';
import { goalsTick } from './hud_goals.js';
import { sightUnit } from './battle_sight.js';

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

const HQ = { x: 0, z: -118 };            // 家康の本陣（小高い丘・陣幕と金扇）
const START = { x: 4, z: 64 };           // 自分の軍の持ち場（京街道の南）
const SAKITE = { x: 0, z: -4 };          // 京街道の藤堂の先手（渡辺勘兵衛）
const TODO_HQ = { x: -44, z: -44 };      // 藤堂高虎の本陣（先手の後ろの西の林の脇）
const II_AT = { x: 96, z: -50 };         // 井伊の赤備え（東の巨椋池の縁の林の奥に隠れて待つ。土手からは見えない）
const YOKO = { x: 8, z: -26 };           // 赤備えが横から突っ込む所（土手の東の畑）
const TEPPO = { x: 0, z: -62 };          // 高みの下の徳川の鉄砲衆
const HONDA_AT = { x: 0, z: -92 };       // 本陣の前の本多正純の旗本
const MOUTH = { x: HQ.x, z: HQ.z + 9 };  // 陣幕の口（jinCamp の決まりで南 +z に開く。幅六 m）の外
const STEP_T = [0, 190, 200, 160, 180, 300];   // 目標ごとの刻限（AP8：全体ではなく一つ一つに）
// 目標の言い方は場所と行いだけ（kaito_standard 三1：「崩す」「攻める」「討つ（将でない隊）」は使わない）。地図で分かる場所の名で（十1）
const STEP_TEXT = ['', '京街道の土手で、渡辺勘兵衛の先手を北へ退かせる', '土手の東の畑で、井伊の赤備えを食い止める', '高みの下で、徳川の鉄砲衆へ斬り込む', '金扇の前で、本多正純の旗本を斬り抜ける', '陣幕の口から入り、床几の家康を討つ'];
// ⑤は「徳川家康」と書かない：共通の victory_flow.js が討った将の名を含む目標を即座に済ませ、goalsDoneTick が二秒半で結果へ締めて、締めの場面（倒れる金扇・勝鬨・出世の道）を切った
const STEP_AT = [null, SAKITE, YOKO, TEPPO, HONDA_AT, MOUTH];
const inCamp = (p) => Math.abs(p.x - HQ.x) < 7.5 && p.z < HQ.z + 5.5 && p.z > HQ.z - 6;   // 陣幕の内（16×12 の幕）
const OWN = { armor: 0x2a2420, lace: 0xb8342a, flag: 'maru' };   // 主人公の軍（丸の旗・朱の威）
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };      // 井伊の赤備え（全員朱）
const TODO = { armor: 0x24221f, flag: 'todo' };
const TK = { armor: 0x1f1e1c, flag: 'tokugawa' };
const HONDA = { armor: 0x1c1a18, flag: 'honda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const busho = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, horse: true, ...o } });
const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const KEEP = 0.4;
const ROAD = [[0, 190], [2, 80], [0, 0], [0, -98]];
// 旧暦五月（今の六月）の淀の野は田植えの済んだ水田（若江・八尾の深田と同じ）。京街道の土手道と畦の外は水の張った田で、降りれば足を取られる
//   本陣の微高地・藤堂の本陣・東の林と赤備えの駆ける道・自分の陣の持ち場は乾いた畑と野に残す
function paddy(x, z) {
  if (Math.abs(x) > 112 || z < -104 || z > 160) return 0;
  if (distToPolyline(x, z, ROAD) < 6) return 0;
  if (dist({ x, z }, HQ) < 34 || dist({ x, z }, TODO_HQ) < 22 || dist({ x, z }, START) < 30 || dist({ x, z }, { x: -16, z: 52 }) < 14 || dist({ x, z }, { x: 22, z: 52 }) < 14) return 0;
  if (x > 4 && z > -64 && z < -14) return 0;   // 東の林から土手へ、赤備えが駆ける乾いた畑（横槍を受ける土手の東の脇も）
  if ((Math.floor(x / 14) + Math.floor(z / 12)) % 4 === 1) return 0;   // ところどころ畑と畦の空き
  const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.95;
}   // 段の隊は四割まで減れば崩れて退く（倒す数＝六割）

// 水を張った田の面（11/6 遊んで見た：地図では田なのに、三次元の地面は一面の草の野で水が一つも見えなかった。二1・八3）。
//   田の一枚ごとに、畦の内側へ浅い水の面を一枚。濁った水に空が映り、植えたばかりの苗の列が並ぶ（絵はキャンバスで描く）。全部で一つの形・一つの材質
function paddyWater(rt) {
  if (typeof document === 'undefined') return;
  const W = rt.world, pos = [], uv = [], col = [], idx = [];
  for (let cx = -112; cx < 112; cx += 14) for (let cz = -108; cz < 160; cz += 12) {
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
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xd8dccf, emissive: 0x6f7c84, emissiveIntensity: 0.2, roughness: 0.16, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // 水は見下ろせば濁りと苗が透け、浅く見るほど空が映る（板の灰色に見せない）
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      { float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.78, 0.8, 0.72), vec3(0.6, 0.66, 0.7), clamp(fr * 0.85, 0.0, 0.8)); }`);
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
  h += 1.3 * Math.exp(-((x - rx) ** 2) / 16) * Math.min(1, Math.max(0, (z + 100) / 14));
  h -= 1.6 * Math.exp(-((x + 150) ** 2) / 300);        // 西の淀川の低み
  h += 1.8 * Math.exp(-((x + 122) ** 2) / 30);         // 淀川の川岸の堤（川除け）
  h -= 1.2 * Math.exp(-((x - 190) ** 2) / 900);        // 東の巨椋池の縁の湿りの低み
  return h;
}

// 右上の目標の札：①〜⑤を最初から全部並べ、済んだ物に印（九1・十1）。両軍の兵の数の棒（armybar）も上に常に出す（九3・十二1）。
//   見える敵の兵には一人残らず頭上に赤い▼（四十 m 内・見通しのある者。九3）。道明寺（b_k13_domyoji.js）と同じ作り。戦が終われば元へ戻す
const BOARD_CSS = `
html:root body #hud#hud#hud.k16-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.k16-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.k16-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.k16-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em) { display:none !important; }`;
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
    let n = 0;
    if (on) for (const u of rt.army.units) {
      if (n >= 80) break;
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget || u.isStruct || u.civ || u.team === me.team || u.team > 1 || u._nearSignOn ||
          u.mesh?.visible === false || u.camHidden || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 1600) continue;
      if (!(u._k16SeenAt > rt.t - .34 && u._k16SeenAt <= rt.t)) { u._k16Seen = sightUnit(rt, u); u._k16SeenAt = rt.t; }
      if (!u._k16Seen) continue;
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      let el = tris[n];
      if (!el) {
        el = tris[n] = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff4a2e;font-size:18px;line-height:1;-webkit-text-stroke:1px #2a0d06;text-shadow:0 1px 2px #000;pointer-events:none';
        box.appendChild(el);
      }
      n++;
      el.hidden = false;
      el.style.transform = `translate(${((v.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - v.y) * innerHeight / 2).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (let i = n; i < tris.length; i++) tris[i].hidden = true;
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.foeMarks = foeMarks; box.remove();
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('k16-goals'); style.remove();
    return dispose.call(this);
  };
}

const k16_secret = {
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
  // 総大将の主人公が自ら前に出る訳を一行で（天王寺口の真田信繁と同じ、旗本を率いた本陣への決死の突き）
  introText: () => '大坂の陣の後、京へ戻る徳川家康の三万が淀の野に陣を敷いた。二万の先頭に立ち、旗本と京街道を北へ押し、金扇の下の家康を討て。',
  hideGuideSteps: true,
  stageGoalsOnly: true,    // 目標は段の五つだけ（「敵を何人討つ」で埋めない。結果の札にも①〜⑤）
  noGoalCount: true,       // 画面の端の赤い矢印を出さない（五3：印は真上の▼一つ）
  // 途中の共通の見出し（「一騎打ち」「敵の隊が崩れた」「敵将が倒れた」）は説明の字なので出さない（五1）。大きく出すのは「家康、討ち取ったり」と負けの見出しだけ
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵の隊が崩れた' && t !== '敵将が倒れた' && t !== '敵の大将が討たれた',
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    const g = F.stepG, P = rt.player.u;
    // 家康の段：陣幕の外では口を指し、内に入れば床几の家康の頭上（陣幕の向こうの野を指さない）
    // ほかの段：段の隊が立っている間は、その隊の自分に一番近い兵（隊の真ん中が空の野に落ちない）
    let p = STEP_AT[F.step];
    if (F.step === 5) { if (F.ieyasu && F.ieyasu.alive && inCamp(P.pos)) p = F.ieyasu.pos; }
    else if (live(g)) { let bd = 1e9; for (const u of g.units) if (u.alive && !u.gone && !u.fleeing) { const d = dist(u.pos, P.pos); if (d < bd) { bd = d; p = u.pos; } } }
    PIN.x = p.x; PIN.z = p.z;
    return PIN;
  },
  world: {
    seed: 1615516,
    time: 'day',
    groundHalf: 260,
    paths: [ROAD],
    height,
    paddy,
    fieldStage: 'seedling',   // 植えたばかりの稲と水の張った田
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.7 + 0.08, c.g * 0.8 + 0.1, c.b * 0.6 + 0.04);   // 初夏の青田と野
      if (x < -140 || x > 175) c.setRGB(c.r * 0.7, c.g * 0.75, c.b * 0.8);   // 西の川・東の巨椋池の縁の湿り
    },
    clear: (x, z) => Math.abs(x) < 200 && z > -170 && z < 240,
    trees: 240,
    tufts: 2600,
    // 遠い縁の木は薄く（遠くの木は板の絵になり、近づくと本物に替わる。九5）。淀の野は田の広がる平らな野
    treeDensity: (x, z) => (Math.abs(x) > 205 || z < -175 || z > 245 ? 0.3 : 0.1),
    // 赤備えが待つ東の林・藤堂高虎の本陣の脇の林・本陣の丘の後ろの林
    groves: [{ x: -62, z: -54, r: 10, n: 12 }, { x: 92, z: -46, r: 13, n: 16 }, { x: 30, z: HQ.z - 26, r: 10, n: 10 }],
    fleeOut: (x, z, team) => (team === 1 ? z < -190 : z > 200),
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
    F.camp = camp(rt, { x: HQ.x, z: HQ.z, facing: 0, team: 1, faction: 'tokugawa', mon: 'tokugawa', armor: TK.armor, uma: 'ogi', guard: 20, guardFlag: 'tokugawa', reserve: 0, noUma: true, tate: false, runTo: { x: 0, z: -60 } });
    if (F.camp.guard) { F.camp.guard.noRout = true; F.camp.guard.name = '本陣の旗本'; F.foes.push(F.camp.guard); }
    // 陣幕の内は床几の家康と近習の侍だけ（多すぎると家康が見えない）
    F.hon = foe('徳川家康の本陣', { x: HQ.x, z: HQ.z - 3 }, dress([busho('徳川家康', { horse: false, invuln: true }), uS(9), uG(2)], TK), { width: 6, morale: 100, seek: 6, aggro: 6, dmg: 0.6 });
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
    F.honda = foe('本多正純の旗本', HONDA_AT, dress([busho('本多正純', { hat: 'kabuto_m' }), uS(12), uA(8), uC(3)], HONDA), { width: 9, morale: 98 });
    for (const [x, z] of [[-14, HONDA_AT.z - 8], [0, HONDA_AT.z - 10], [14, HONDA_AT.z - 8]]) rt.scene.add(nobori(W, x, z, 'honda', 6));
    // 鉄砲衆は前に槍の足軽を立てて撃つ（寄せる間ずっと撃たれ、槍の前で足が止まる。斬り込みが五秒で終わらない）
    F.teppo = foe('徳川の鉄砲衆', TEPPO, dress([uS(2), uA(8), uG(14)], TK), { width: 12, formation: 'line', fire: true, seek: 30 });
    // 東の林の陰の井伊の赤備え（騎馬を厚く。直孝は自ら前に出る将）
    F.ii = foe('井伊直孝の赤備え', II_AT, dress([busho('井伊直孝', { hat: 'kabuto_tentsuki' }), uC(7), uS(4), uA(12)], II), { facing: -1.2, width: 9, morale: 100, seek: 8, aggro: 8, speed: 4.2 });
    // 京街道の藤堂の先手と、後ろの林の脇の藤堂高虎の本陣（高虎は座ったまま動かない）
    F.todo = foe('藤堂の先手', SAKITE, dress([busho('渡辺勘兵衛'), uS(6), uA(22), uG(6)], TODO), { width: 12, morale: 92, seek: 18 });
    F.takatora = foe('藤堂高虎の本陣', TODO_HQ, dress([busho('藤堂高虎', { horse: false, invuln: true }), uS(8)], TODO), { width: 5, morale: 100, seek: 6, aggro: 4 });
    F.takatora.fire = false;   // 高虎の本陣は座ったまま。供の鉄砲が獲物を追って野へ出ない
    const tk = F.takatora.units.find((u) => u.name === '藤堂高虎');
    if (tk) tk._crouch = true;
    for (const [x, z] of [[-52, -38], [-36, -38], [-56, -48], [-32, -48], [-44, -54]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    // 徳川方の備は段ごとの下知だけで動く（共通の敵の頭 ai.js に任せると、家康の本陣・旗本・高虎の本陣まで持ち場を出て前線へ来る。一2）
    //   後ろの備は自分の段まで持ち場を動かない（stay：本人を見て一人ずつ駆け出さない）。本陣・旗本・高虎の本陣は最後まで動かない
    for (const g of F.foes) { g.noAI = true; if (g !== F.todo) g.stay = true; }
    // 目標に名を書いた将は、右上の目標・頭上の名で伏せない（「見えぬ敵の陣を物見する」に化けさせない。十1）。家臣が始めに名を告げている
    for (const nmx of ['渡辺勘兵衛', '井伊直孝', '本多正純', '徳川家康', '藤堂高虎']) revealName(rt, nmx);

    // ---- 自分の軍：左右の備と、自分の組（大将の旗本） ----
    const ally = (name, at, list, o = {}) => {
      const g = allyGroup(rt, { faction: 'oda', flag: OWN.flag, name, anchor: at, facing: S, width: 12, aggro: 12, seekRange: 18, speed: 3.8, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari', ...o }, dress(list, OWN));
      g.defMult = 1.6; g.dmgMult = 0.85;
      // 隊旗は自分の家の丸（faction の既定の織田の木瓜の大幟を立てない。一6）
      g.mon = OWN.flag;
      return g;
    };
    F.ally = ally;
    F.left = ally('左の備', { x: -16, z: 52 }, [uS(4), uA(20), uG(6)]);
    F.right = ally('右の備', { x: 22, z: 52 }, [uS(4), uA(18), uC(6)]);
    const n = RANKS[rt.G.rank].squad;
    // 主人公の馬印は立てない（共通の金扇は家康の金扇と見分けがつかず、白の吹貫は遠目に白い柱に見えた）。自分の軍の目印は丸の幟
    if (rt.player.u.look && rt.player.u.look.uma) rt.player.u.look.uma = null;
    rt.makeSquad({ x: START.x, z: START.z }, S, [{ kind: 'spear', n: Math.max(12, Math.min(n || 12, 16)) }]);
    for (const [x, z, h] of [[-10, 70, 7], [12, 70, 7], [0, 84, 8], [-22, 76, 6], [24, 76, 6], [-8, 90, 6], [10, 90, 6]]) rt.scene.add(nobori(W, x, z, OWN.flag, h));

    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('s1', STEP_TEXT[1], 'main');   // 采配までの間も右上は①（共通の「味方の旗へ」を出さない。三3）
    goalBoard(rt);
    // 采配を待つ間も両軍は動く（突っ立つ兵を出さない。一3）：藤堂の先手は土手道をじりじり南へ押し出し、左右の備は槍を揃えて前へ詰める
    if (live(F.todo)) { F.todo.order = 'attack'; F.todo.anchor = { x: SAKITE.x, z: SAKITE.z + 8 }; F.todo.speed = 1.5; F.todo.seekRange = 8; }
    for (const [g, x] of [[F.left, -16], [F.right, 22]]) { g.order = 'attack'; g.anchor = { x, z: 42 }; g.speed = 1.6; g.seekRange = 8; }
    rt.say('家臣', '殿、あの高みの金扇が家康の本陣にござる。三万', 3);
    rt.after(3.2, () => rt.say('家臣', '京街道の先手は藤堂、後ろの林に高虎。井伊の赤備えは東の林の奥に隠れておりましょう', 3.4));
    rt.after(6.8, () => rt.say(nm(rt), '足軽から槍一本で上がってきた。今日、天下を取る', 3));
    rt.after(10, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 段の隊が崩れた：生き残りは名のある将ごと北へ退く（討ち死にさせ尽くさない）
  fall(rt, g) {
    if (!live(g)) return;
    g.order = 'retreat'; g.dest = { x: g.center().x * 0.5, z: -200 }; g.speed = 4.2; g.aggro = 0; g.noRout = false;
  },

  // 段を進める（右上の目標と行き先のピン）。味方の備は段の場所へ一緒に走る（AP5・AQ7）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step && !F.failed) rt.objDone('s' + F.step);
    F.failed = false;
    F.step = n; F.stepT = rt.t; F.stepN = 0;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    const mine = [null, null, F.ii, F.teppo, F.honda][n];
    if (mine) mine.stay = false;   // 自分の段の備だけ持ち場を出る
    const go = (g, p, seek = 30) => { if (!live(g)) return; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g.speed = 3.9; };
    const atk = (g, p, seek = 40) => { if (!live(g)) return; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g.aggro = 18; };
    // 左右の備は横に並んだ一つの前線として押す（真ん中の一点に団子にならない。九4）。後詰めは真ん中の後ろ
    const both = (p) => { for (const [g, dx, dz] of [[F.left, -12, 6], [F.right, 12, 6], [F.aid, 0, 12]]) go(g, { x: p.x + dx, z: p.z + dz }); };
    // 後ろの二の備が京街道を駆け上がって来る（二万の後続。見えない遠さの南から本物の兵で。倒れた分を埋める）
    const aid = (name, list) => {
      if (live(F.aid) && aliveN(F.aid) > 8) return;
      F.aid = F.ally(name, { x: 2, z: Math.max(rt.player.u.pos.z + 90, 120) }, list, { speed: 4.2 });
      rt.after(6, () => rt.say('家臣', `${name}が追いついた！`, 2.6));
    };
    if (n === 1) {
      rt.setPhase('battle');
      sfx('horagai', 0.9); rt.after(1.2, () => sfx('taiko', 0.9));
      F.stepG = F.todo;
      both(SAKITE);
      atk(F.todo, { x: SAKITE.x, z: SAKITE.z + 20 }, 30); if (live(F.todo)) F.todo.speed = 3.7;
      rt.army.play('toki', START, 1.4);
      rt.say(nm(rt), '者ども、かかれっ！　京街道を押し通る！', 3.2);
      rt.after(4, () => rt.say('渡辺勘兵衛', '藤堂の先手、一歩も退くな！', 3));
    } else if (n === 2) {
      // 先手を割った所へ、東の林から赤備えが横槍に出る（言った隊は初めから林の陰にいた）
      F.stepG = F.ii;
      aid('二の備', [uS(5), uA(20), uG(4)]);
      atk(F.ii, YOKO, 50); F.ii.speed = 4.6;
      both(YOKO);
      rt.army.play('eshout', F.ii.center(), 1.6);
      rt.say('家臣', '東から赤備え！　井伊の騎馬じゃ！　槍を揃えて受けよ！', 3.4);
      rt.after(4, () => rt.say('井伊直孝', '井伊の赤備え、掛かれ！　横腹を突け！', 3.2));
    } else if (n === 3) {
      F.stepG = F.teppo;
      both(TEPPO);
      F.teppo.seekRange = 40;
      rt.say('家臣', '高みの下に鉄砲が並んでおる！　固まって一息に寄せよ！', 3.2);
      rt.after(3, () => sfx('taiko', 0.7));
    } else if (n === 4) {
      F.stepG = F.honda;
      aid('三の備', [uS(5), uA(14), uC(4)]);
      both(HONDA_AT);
      atk(F.honda, { x: HONDA_AT.x, z: HONDA_AT.z + 14 }, 30);
      rt.after(1, () => rt.say('本多正純', '大御所様の御前ぞ！　一人も通すな！', 3));
      rt.after(5, () => rt.say(nm(rt), '狙うは家康の首ひとつ！', 2.8));
    } else if (n === 5) {
      F.stepG = F.hon;
      if (F.ieyasu) F.ieyasu.invuln = false;
      both({ x: HQ.x, z: HQ.z + 10 });
      aid('三の備', [uS(5), uA(14), uC(4)]);
      // 天王寺口の手本：前の備が崩れると本陣の旗本も浮き足立って散り、金扇の周りが手薄になった（docs/battle_learn/k16_secret.md）。
      //   陣幕の内の侍（家康の本陣）は最後まで床几の家康を囲む
      if (live(F.camp.guard)) { this.fall(rt, F.camp.guard); rt.after(2, () => rt.say('家臣', '旗本が散ったぞ！　金扇の周りが手薄じゃ！', 3)); }
      if (live(F.hon)) { F.hon.noRout = true; F.hon.morale = 100; F.hon.aggro = 14; F.hon.seekRange = 12; }
      rt.after(1, () => rt.say('徳川家康', '……来たか。わしの首、取れるものなら取ってみよ', 3.6));
      rt.after(5.2, () => rt.say('家臣', '陣幕の口は正面じゃ！　口から斬り込め！', 2.8));
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    // ⑤の済みは締めの場面の後に付ける（全部の目標が済むと共通の goalsDoneTick が二秒半で結果へ締め、締めの場面を切る）
    // 勝ちの印（tracker.main）も締めの場面の後に立てる（立てると共通の goalsDoneTick が目標を済みと見て二秒半で結果へ締める）
    const award = () => { rt.tracker.main = true; rt.award((t) => { t.main = true; t.special = { label: '徳川家康を討ち取った', pts: 100 }; }, '徳川家康を討ち取った'); };
    rt.player.u.invuln = true;
    if (F.ieyasu && F.ieyasu.alive) { F.ieyasu.invuln = false; rt.army.damage(F.ieyasu, F.ieyasu.maxHp * 9, rt.player.u, { pierce: true }); }
    for (const g of F.foes) if (g !== F.takatora) this.fall(rt, g);
    if (live(F.takatora)) { F.takatora.order = 'hold'; F.takatora.aggro = 0; F.takatora.seekRange = 0; }
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    // 金扇の馬印が倒れる（主の討たれた本陣の印）
    if (F.uma) { let a = 0; const fallUma = () => { a = Math.min(1, a + 0.08); F.uma.rotation.z = -1.42 * a * a; if (a < 1 && !rt.ended) rt.after(0.05, fallUma); }; rt.after(0.6, fallUma); }
    // 大きな「徳川家康 討ち取ったり」は共通の victory_flow.js の筆の字が出す（見出しを二つ重ねない。五3）
    rt.say('家臣', '金扇が倒れた！　徳川の軍勢が退いていく！', 3.6);
    // 勝鬨の儀。将軍宣下は朝廷の陣儀で後日なので、戦場では京の御所へ願いの早馬を立てるまで（勅使が戦場に来る事は無い）。締めは短く（三3）
    //   共通の finish は勝ちの待ちを四秒半に縮めるので、締めの場面（倒れる金扇・退く徳川勢・勝鬨・出世の道）を見せてから finish を呼ぶ（11/6 遊んで見た：19 秒の締めが切られて結果の札へ飛んだ）
    rt.after(3.4, () => { rt.say('家臣', '勝鬨を挙げよ！　えい、えい！', 2.6); rt.army.celebrate(0); });
    rt.after(6.2, () => rt.say('家臣', '京の御所へ早馬を立てまする。将軍宣下を願い奉りましょう', 3.2));
    rt.after(4.5, () => this.shogun(rt));
    rt.after(9.6, () => rt.say(nm(rt), '……槍一本で始めた道が、ここまで来たか', 3));
    rt.after(9.5, () => { award(); rt.objDone('s5'); rt.finish({ scriptedEnd: true }, 4.5); });
  },

  // 終わりの場面：出世の道を下から一段ずつ灯し、最後に金の「征夷大将軍」（字は位の名だけ）
  shogun(rt) {
    if (typeof document === 'undefined' || rt.ended) return;
    const rm = document.body.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = [...LADDER.map((L) => L.name), '征夷大将軍'];
    const el = document.createElement('div');
    el.id = 'shogun-end';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `出世の道。${steps.join('、')}`);
    el.innerHTML = `<style>
      #shogun-end { position: fixed; inset: 0; z-index: 40; pointer-events: none; display: flex; align-items: flex-end; justify-content: center; padding: 0 4vw 9vh; background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(10,8,6,.72) 100%); }
      #shogun-end ol { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-end; gap: 6px; }
      #shogun-end li { font: 600 13px/1.2 serif; color: #ece4d2; background: rgba(28,22,16,.82); border: 1px solid rgba(236,228,210,.3); padding: 6px 7px; writing-mode: vertical-rl; opacity: ${rm ? 1 : 0}; ${rm ? '' : 'animation: shgUp .5s ease-out forwards;'} }
      #shogun-end li.top { font-size: 18px; color: #2a1c08; background: linear-gradient(160deg, #f6e3a1, #c9a24a 60%, #f3d98a); border-color: #fff3c4; box-shadow: 0 0 18px rgba(240,200,110,.7); }
      @keyframes shgUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    </style><ol>${steps.map((s, i) => `<li class="${i === steps.length - 1 ? 'top' : ''}" style="margin-bottom:${i * 9}px;animation-delay:${(i * 0.45).toFixed(2)}s">${s}</li>`).join('')}</ol>`;
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
    rt.say('家臣', '殿、退きましょう！　天下は、また次に……', 4);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  onFinish(rt) {
    const el = rt.flags.endEl;
    if (el) { el.remove(); rt.flags.endEl = null; }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const P = rt.player.u;
    const left = STEP_T[F.step] - (rt.t - F.stepT);
    // 退いた徳川方は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
      // 本陣・旗本・高虎の本陣の者は持ち場から三十 m より先へ追わない（一2）
      for (const g of [F.hon, F.camp.guard, F.takatora]) if (g && g.order !== 'retreat') for (const u of g.units) if (u.alive && u.target && dist(u.pos, g.anchor) > 30) u.target = null;
    }
    if (left > 0) rt.objProgress('s' + F.step, `あと${mmss(left)}`);
    // 家康の段：家康が倒れれば勝ち（旗本が減っても家康は床几から逃げない）
    if (F.step === 5) {
      if (live(F.hon)) { F.hon.noRout = true; F.hon.morale = Math.max(F.hon.morale, 60); }
      if (F.ieyasu && !F.ieyasu.alive) { this.win(rt); return; }
      if (left <= 0) this.lose(rt, '家康を討ち漏らした', '刻限のうちに家康に届かず、徳川の軍勢が持ち直した');
      return;
    }
    const g = F.stepG;
    if (!F.stepN || F.stepNg !== g) { F.stepNg = g; F.stepN = Math.max(1, aliveN(g)); }   // 数えるのは段の始めに立っていた兵（前の段で味方が削った分は数えない）
    const gone = F.stepN - aliveN(g);
    // 段の隊の残りが散って、自分の周り三十五 m に一人もいないまま十秒（その場の戦いが済んだ）：崩れたとみなして次へ（空の野で立ち尽くさない。三2）
    let near = false;
    if (live(g)) for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && dist(u.pos, P.pos) < 35) { near = true; break; }
    F.farT = near || rt.t - F.stepT < 25 || gone < F.stepN * 0.3 ? 0 : (F.farT || 0) + 0.25;
    if (!F.next && (gone >= Math.round(F.stepN * (1 - KEEP)) || F.farT > 10)) {
      F.farT = 0;
      F.next = true;
      this.fall(rt, g);
      rt.say('家臣', F.step === 1 ? '藤堂の先手が崩れた！　勘兵衛が退いていく！' : `${g.name}が崩れた！`, 2.6);
      rt.after(3, () => { F.next = false; this.toStep(rt, F.step + 1); });
    } else if (!F.next && left <= 0) {
      // 刻限を過ぎた目標は果たせなかった印を付け、隊は退いて次の目標へ（二つ果たせなければ負け）
      const why = ['', '京街道で押し返された', '赤備えに横腹を破られた', '鉄砲衆の前で足が止まった', '本多の旗本を抜けなんだ'][F.step];
      F.miss = (F.miss || 0) + 1;
      if (F.miss >= 2) { this.lose(rt, why, '刻限のうちに果たせず、徳川の軍勢が持ち直した'); return; }
      F.next = true;
      rt.objFail('s' + F.step); F.failed = true;
      this.fall(rt, g);
      rt.say('家臣', '時を食い過ぎた！　次でしくじれば天下は無いぞ！', 3);
      rt.after(3, () => { F.next = false; this.toStep(rt, F.step + 1); });
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.team === 1 && v.name === '徳川家康') { this.win(rt); return; }
    if (v.type === 'busho' && v.team === 1 && v.name) {
      rt.say('家臣', `${v.name}、討ち取ったり！`, 2.8);
      rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 30 }; }, `${v.name}を討ち取った`);
    }
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    inp.quickCmd = null;
    if (F.holdPlayer || !F.step || F.ending || !u.alive) return;
    // 陣幕の外から幕越しに内の者を狙わない（布の前で止まらない）
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && !(o.group && (o.group.order === 'retreat' || o.group === F.takatora)) && inCamp(o.pos) === inCamp(u.pos);
    // 陣幕の内では、まわりの近習より床几の家康を狙う（奥の樽や太鼓の脇で近習を追い回さない）
    const ie = F.step === 5 && F.ieyasu && F.ieyasu.alive && inCamp(u.pos) && dist(F.ieyasu.pos, u.pos) < 12 ? F.ieyasu : null;
    const e = ie || b.army.nearestEnemy(u, 9, ok);
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
      if (inCamp(u.pos)) t = F.ieyasu.pos;
      // 幕の脇・裏（前の幕 HQ.z+6 より北で、口の幅の外）にいる時は外を回って正面へ
      else if (u.pos.z < HQ.z + 6.5 && Math.abs(u.pos.x - HQ.x) >= 2.5) { const sx = u.pos.x >= HQ.x ? 1 : -1; t = Math.abs(u.pos.x - HQ.x) < 14 ? { x: HQ.x + sx * 15, z: u.pos.z } : { x: HQ.x + sx * 15, z: MOUTH.z + 3 }; }
      else if (u.pos.z > HQ.z + 6.5 && Math.abs(u.pos.x - MOUTH.x) > 1.5) t = { x: MOUTH.x, z: MOUTH.z + 1.5 };   // 口の正面へ寄る
      else t = { x: HQ.x, z: HQ.z };   // 口から真っすぐ入る
    }
    goTo(p, inp, t.x, t.z, 1.2);
  },
};

// 両軍の総勢（もしもの数）：自分の二万、家康の三万。段の隊が崩れるたびに大きく減る
k16_secret.force = (rt) => {
  const F = rt.flags, st = Math.max(0, (F.step || 1) - 1);
  return { a: Math.max(8000, Math.round(20000 - (F.ak || 0) * 25 - st * 600)), a0: 20000, b: Math.max(4000, Math.round(30000 - (F.ek || 0) * 30 - st * 3500)), b0: 30000 };
};
k16_secret.sides = { a: { name: '自分の軍', mon: 'maru' }, b: { name: '徳川軍', mon: 'tokugawa' } };
// 時刻は始まりの札と同じ「朝」で通す（光も同じ一つ。途中で昼に言い替えない。二2）
k16_secret.date = () => '元和元年（1615）五月　夏・晴・朝　もしもの戦';
k16_secret.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '采配を振るまで待つ' : '');
k16_secret.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k16_secret.history = 'この戦は史実ではない、もしもの戦である。元和元年（1615）五月、大坂夏の陣で豊臣家は滅び、徳川家康は天下の主となった。家康は翌年に世を去り、征夷大将軍の位は慶長十年（1605）からすでに子の秀忠が継いでいた。徳川の世は、この後二百六十年ほど続く。\n淀は桂川・宇治川・木津川が寄り合う所で、秀吉が淀川の左岸に築いた堤の上を、伏見と大坂を結ぶ京街道が通っていた。東には巨椋池が広がっていた。\n淀の野で家康を討ち、主人公が征夷大将軍になる筋は、足軽から出世してきた道の締めとして作った物語である。徳川方の五重の構え（先手・横槍・鉄砲・旗本・本陣）と、本陣へ切り込む流れは、夏の陣の天王寺口で真田信繁が先手を割って家康の本陣に迫った戦いを手本にした。';
k16_secret.bushou = [{ name: '徳川家康', g: /家康/ }, { name: '井伊直孝', g: /井伊/ }, { name: '渡辺勘兵衛', g: /藤堂の先手|勘兵衛/ }, { name: '本多正純', g: /本多/ }, { name: '藤堂高虎', g: /高虎/ }];

const st = (k) => (rt) => (rt.flags.step || 0) >= k;
STAGES[ID] = [[STEP_TEXT[1]], [STEP_TEXT[2], st(2)], [STEP_TEXT[3], st(3)], [STEP_TEXT[4], st(4)], [STEP_TEXT[5], st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）。家康の段は家康一人
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending || !F.stepG || !F.stepN || F.step === 5) return null;
  return cut(F.stepN, aliveN(F.stepG), Math.round(F.stepN * KEEP));
};

export { k16_secret };
export default k16_secret;
