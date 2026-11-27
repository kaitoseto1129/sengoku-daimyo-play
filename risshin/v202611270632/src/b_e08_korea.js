// 伊達家編 八戦目「朝鮮出兵（伊達者の行列）」（文禄元年〔1592〕）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e08_korea.md
//   出所：『貞山公治家記録』（B）。政宗は肥前名護屋から三千の兵で出陣し、道中の派手な装束が評判になった（伊達者の語り・逸話 B）。伊達約3千は通説※・敵の数は推
//   前半は名護屋の浜への行列（金糸の飾りの具足・長い列の味方）、後半は朝鮮の山道の短い戦。馬印の勢いは date_uma.js（共通）。相手の色は蘆名の具足・紋を使い回す
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';
import * as THREE from 'three';
import { village, nobori, kobune } from './props.js';
import { funeJirushi } from './house_gear.js';
import { personGeo, tintMat } from './town_crowd.js';
import { kzAtake, kzShipCachesDispose } from './b_kizugawa.js';

const DATE = { flag: 'date', armor: 0x1c1a18, lace: 0xc8a448, lace2: 0xb83a30, lace3: 0xd8c070 };   // 派手な装束：金と朱の縅
const FOE = { flag: 'ashina', armor: 0x3a4a5a };
const SPAWN = { x: 125, z: 10 };
const WIND = [0.6, 0.2];
const HAMA = { x: 70, z: 8 };         // 名護屋の浜への道
const PASS = { x: 10, z: 0 };         // 朝鮮の山道の入口
const FAR = { x: -90, z: -6 };        // 谷の向こうの敵の陣
const MURA = { x: -36, z: 22 };       // 山あいの村（伏せた兵・K652②）
const KAESHI = { x: -116, z: 24 };    // 取った陣（取り返しに来る敵を受ける所・K652②）
const SAKU = { x: -150, z: -10 };     // 城の外の柵（K652②）
// K718/K655 11/27 クラウドす：道は霧の野だけで、町も見物の人垣も名護屋の浜も無かった（紙 date15_spec ⑪「町を通る・他大名の兵が見る・民衆がざわめく」）
//   →北に玄界灘の海（浜の北・沖に渡海の安宅二艘と小早の列）、町の段の両側に家並み、町〜街道の道の両脇に見物の人垣（一つの InstancedMesh）、浜に諸大名の陣の幟。見た目だけ（段・兵・手柄には触れない）
const coast = (x) => -22 - Math.max(0, x + 10) * 0.35;   // sea の pts は coast(x)-80 の線・片幅 79（水際から沖へ）   // 浜の北が海（名護屋の浦）。西の浜の終わりほど道に近い
const SEA_Y = -0.5;
const CLOTH = [0x5a6a7a, 0x7a5a3a, 0x8a8070, 0x4a5a48, 0x9a6a50, 0x6a4a5a, 0xb0a080, 0x3a4a6a, 0x806848, 0xa89070];
function onlookers(rt) {
  const W = rt.world, geo = personGeo(), mat = tintMat(), N = 150, im = new THREE.InstancedMesh(geo, mat, N), D = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  const roadZ = (x) => (x > HAMA.x ? 10 + (x - 125) / (HAMA.x - 125) * (HAMA.z - 10) : HAMA.z + (x - HAMA.x) / (PASS.x - HAMA.x) * (PASS.z - HAMA.z));
  for (let i = 0; i < N * 2 && n < N; i++) {
    const x = 18 + ((i * 23.7) % 80), side = i % 2 ? 1 : -1, z = roadZ(x) + side * (3.6 + ((i * 5.3) % 2.6));
    D.position.set(x, W.heightAt(x, z), z); D.rotation.set(0, side > 0 ? Math.PI : 0, 0); D.rotation.y += ((i * 7) % 9 - 4) * 0.12;   // 道の方を向いて立つ
    D.scale.setScalar(0.86 + (i % 5) * 0.04); D.updateMatrix(); im.setMatrixAt(n, D.matrix); im.setColorAt(n, col.setHex(CLOTH[(i * 7) % CLOTH.length])); n++;
  }
  im.count = n; im.castShadow = true; rt.scene.add(im);
  return () => { rt.scene.remove(im); im.dispose(); geo.dispose(); mat.dispose(); };
}
function scene(rt) {
  const W = rt.world, ships = [], list = [];
  try { list.push(onlookers(rt)); } catch (e) { /* 人垣が無くても戦は続ける */ }
  // 町の家並み（町の段の両側・煙）
  try { for (const [x, z, sd] of [[66, 24, 1592], [44, 20, 1593], [70, -14, 1594], [40, -16, 1595]]) rt.scene.add(village(W, x, z, { n: 3, r: 12, rot: 0, fields: 0, smoke: sd % 2, seed: sd, groundedHomes: true })); } catch (e) { /* 家が無くても戦は続ける */ }
  // 名護屋の浦：沖に渡海の安宅二艘、浜の沖に小早の列（諸大名の船印）
  try { for (const [x, d, r] of [[-60, 46, 0.2], [-10, 58, -0.15]]) { const m = kzAtake(W, true); m.position.set(x, SEA_Y, coast(x) - d); m.rotation.y = Math.PI / 2 + r; rt.scene.add(m); ships.push(m); } } catch (e) { /* 舟が無くても戦は続ける */ }
  const KINDS = ['date', 'toyotomi', 'date', 'maeda', 'date'];
  for (let i = 0; i < 12; i++) {
    const x = -120 + i * 16 + ((i * 13) % 7), z = coast(x) - 10 - (i % 3) * 8, len = 11 + (i % 3);
    try { const b = funeJirushi(kobune(x, -0.45, z, Math.PI * 0.5 + ((i * 11) % 7 - 3) * 0.1, len), len, KINDS[i % KINDS.length], 5); if (b) rt.scene.add(b); } catch (e) { /* 同上 */ }
  }
  // 浜の諸大名の陣の幟（他家の兵が見る）
  try { for (const [x, z, k] of [[-40, -10, 'toyotomi'], [-48, -4, 'toyotomi'], [-20, -12, 'maeda'], [-14, -6, 'maeda'], [-56, 8, 'toyotomi']]) rt.scene.add(nobori(W, x, z, k, 5.5)); } catch (e) { /* 幟が無くても戦は続ける */ }
  const dispose = rt.dispose;
  rt.dispose = function () {
    for (const f of list) try { f(); } catch (e) { /* 片付けは続ける */ }
    try { dispose.call(this); } finally { try { kzShipCachesDispose(); } catch (e) { /* 同上 */ } }
  };
}
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 1 });

export const e08_korea = lightBattle({
  calm: true,   // K711③：敵のいない場面（大きな地図に敵の駒が無くてよい・関所の「敵の駒0」から外す）
  id: 'e08_korea',
  date: '文禄元年（1592）　春　肥前国 名護屋→朝鮮',
  intro: '豊臣の大軍が朝鮮へ渡る。伊達政宗は三千の兵を、金と朱で飾った装束で名護屋の浜へ進めた。',
  history: '文禄元年（1592）、豊臣秀吉の朝鮮出兵で、伊達政宗は三千の兵を率いて肥前名護屋に着き、海を渡った。道中の兵の派手な装束は人々の目を引き、「伊達者」の語りのもとになったと伝わる（『貞山公治家記録』・逸話）。戦そのものは短く、数の多さと装いが見せ場となった。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '朝鮮・明の軍', mon: 'ashina', faction: 'ashina' } },
  force: { a: 3000, b: 4000 },
  allyLook: DATE, foeLook: FOE,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1592, time: 'day', fogFar: 420, sky: { wind: WIND, windStrength: 0.8 },
    coast,
    sea: [{ pts: [[-320, -102], [-10, -102], [125, -149], [320, -217]], w: 79, depth: 3, still: true, levelAt: () => SEA_Y }],
    hills: [[-40, 150, 80, 22], [PASS.x + 40, 0, 50, 7]],   // 南の山と丘（北は名護屋の浦の海）
    paths: [{ pts: [[125, 10], [HAMA.x, HAMA.z], [PASS.x, PASS.z], [-90, -6]], w: 3.4 }],
    groves: [{ x: 40, z: 60, r: 30, n: 30 }, { x: -60, z: 60, r: 34, n: 34 }],
    trees: 320, tufts: 1900,
    tint(x, z, h, c) {   // 名護屋の浦の水際は濡れた砂、その手前は白い浜
      const cz = coast(x);
      if (z < cz + 1) { const k = Math.min(1, (cz + 1 - z) / 5); c.setRGB(c.r * (1 - k) + 0.16 * k, c.g * (1 - k) + 0.19 * k, c.b * (1 - k) + 0.2 * k); return; }
      if (z < cz + 9) { const k = 0.65; c.setRGB(c.r * (1 - k) + 0.62 * k, c.g * (1 - k) + 0.58 * k, c.b * (1 - k) + 0.5 * k); }
    },
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(10)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 6, z: SPAWN.z - 14 }, list: [busho('片倉景綱'), uS(2), uA(14)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 6, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 6, z: SPAWN.z + 24 }, list: [uS(1), uG(10)] },
    { name: '後備の列', at: { x: SPAWN.x + 30, z: SPAWN.z }, list: [uS(3), uA(18)] },
  ],
  steps: [
    // K718（11/26）：朝鮮出兵は戦わない行列の場面（伊達者の派手さを見せる）。具足を整え、馬を飾り、旗指物を揃え、隊列を組んで町を通り、丘を越えて名護屋の浜へ。敵はいない
    { kind: 'rest', dur: 16, heal: 0, say: [
      ['伊達成実', '殿、具足の金の縅が朝日に映えまする。馬の飾りも整いました', 3.4],
      ['伊達政宗', '旗指物を揃えよ。三千の列、一人も乱すな。見せてやれ、伊達の行列を', 3.4],
      ['組頭', '槍は肩に。足並みを揃えよ。諸国の衆が見ておるぞ', 3.2]] },
    { kind: 'move', at: { x: 100, z: 10 }, label: '隊列', obj: '隊列を組んで、道へ出る', r: 12, max: 90,
      say: [['組頭', '列を崩すな！　前の者の背を見て歩け', 3.2]] },
    { kind: 'move', at: { x: 62, z: 6 }, label: '町', obj: '隊列を崩さず、町の通りを進む', r: 12, max: 90,
      say: [['町の者', 'あれが奥州の伊達衆か。金と朱じゃ、目が眩む', 3.2], ['他家の兵', '派手な連中よ……だが、列に一分の乱れも無い', 3.4], ['子供', '見て！　きらきらの鎧！', 2.6]] },
    { kind: 'move', at: { x: 30, z: 2 }, label: '街道', obj: '見物の人垣の間を、列を崩さず歩く', r: 12, max: 90,
      say: [['民衆', '伊達者じゃ、伊達者じゃ！', 2.8], ['片倉景綱', '殿、皆が殿の列を見ております', 3]] },
    { kind: 'move', at: { x: PASS.x + 40, z: 0 }, label: '丘', obj: '丘を越えて、伊達隊の列全体を振り返る', r: 12, max: 100,
      say: [['伊達成実', '殿、丘の上から振り返られよ。三千の金と朱が、道いっぱいに続いておりまする', 3.6], ['伊達政宗', '見事じゃ。戦わずとも、伊達の名は伝わる', 3.4]] },
    { kind: 'rest', dur: 10, heal: 0, say: [['組頭', '息を整えよ。浜はもうすぐじゃ', 3]] },
    { kind: 'move', at: { x: PASS.x - 40, z: PASS.z }, label: '名護屋の浜', obj: '名護屋の浜まで、隊列を保って進む', r: 14, max: 100,
      say: [['他家の大名', '奥州の伊達か。見事な軍装……', 3.2], ['伊達政宗', '浜が見えた。渡海の船へ。列は崩すな', 3.2]] },
  ],
  setup: scene,
  update: umaTick,
  win: {
    banner: '伊達者の行列', sub: '金と朱の列は、一人も乱れず名護屋の浜に着いた。戦わずに、伊達の名が伝わった', award: '隊列を崩さず、伊達者の行列を進めた',
    say: [['伊達成実', '殿の装束、諸国の衆も目を見張りました', 3.2],
      ['伊達政宗', '派手に出て、乱れず歩く。それが伊達じゃ', 3.2]],
  },
});
e08_korea.camPull = 1.6;
export default e08_korea;
