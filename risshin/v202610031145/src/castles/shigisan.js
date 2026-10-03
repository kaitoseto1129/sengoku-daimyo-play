// ======================================================================
// castles/shigisan.js … 信貴山城の縄張り（docs/late6b-1575-1578-spec.md 60〜74章）
// 土の大きな山城。雄嶽の主郭（高櫓）を頂に、北の尾根へ曲輪を連ねる（五段ほど。石垣は使わない）。
// 地形の造成（terrace）・壁（wallLine・ringWall）・建物は b_shigisan.js 側が今まで通り手組みで作る。
// ここでは castle_plan.js の形（kuruwa の多角形だけ）を持ち、siege_zones.js の区域（曲輪ごとの
// 守り・取ると次が開く流れ）に使う。buildCastlePlan は skipWalls を全曲輪に渡し、壁を二重に作らない。
// ======================================================================
import { switchback } from '../yamalift.js';
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

export const TOP = { x: 0, z: -110, r: 20 };            // 雄嶽の主郭（高櫓）
export const GATE = { x: 0, z: -66 };                   // 門（本丸の手前の曲輪の口。主な登城道の口）
export const TOWER = { x: 12, z: -70 };                 // 門の脇の物見櫓
export const RIDGE1 = { x: 0, z: -78, r: 10 };          // 北尾根の曲輪（下の段。門を抜けてすぐ）
export const RIDGE2 = { x: -2, z: TOP.z + 8, r: 9 };    // 北尾根の曲輪（上の段。主郭の手前・尾根道の先）
export const YASHIKI = { x: 30, z: TOP.z + 4, r: 11 };  // 松永屋敷（北尾根のさらに奥の郭。裏道の先）
export const TEMPLE = { x: 58, z: 14, r: 9 };           // 朝護孫子寺の区域（軍事の区域と離す。装飾のみ）
// 九十九折り（kaito 10/3：比高を上げたので、道は左右に振って長く登る）
export const ROAD = [[0, 150], ...switchback([6, 90], [GATE.x, GATE.z + 6], 10, 32), [0, TOP.z]];
// 朝護孫子寺の区域（城の曲輪とは別の区域。戦いの的にしない。山門が北の登城道へ向き、築地で囲む）
export const TEMPLE_ZONE = {
  id: 'temple', name: '朝護孫子寺', poly: circle(TEMPLE.x, TEMPLE.z, TEMPLE.r + 3, 8), kind: 'temple', combat: false,
  sanmon: { x: TEMPLE.x - TEMPLE.r, z: TEMPLE.z }, hondo: { x: TEMPLE.x, z: TEMPLE.z },
};
// 登る道が複数：①大手の登城道（ROAD）②西の尾根道（明智の備が押さえる）③寺の側の道（東の尾根。羽柴の備が押さえる）④裏道（屋敷の背へ回る）
export const ROUTES = [
  { id: 'ote', name: '大手の登城道', pts: ROAD, who: '筒井順慶・織田信忠の本隊' },
  { id: 'nishi', name: '西の尾根道', pts: [...switchback([-70, 20], [-24, -60], 4, 14), [-8, GATE.z - 4]], who: '明智光秀の備' },
  { id: 'tera', name: '寺の側の道', pts: [[70, 10], [TEMPLE.x, TEMPLE.z + 4], ...switchback([44, -30], [34, -52], 2, 8), [24, GATE.z - 2]], who: '羽柴秀吉の備' },
  { id: 'ura', name: '裏道', pts: [[TEMPLE.x + 8, TEMPLE.z - 10], [66, -60], [YASHIKI.x + 14, YASHIKI.z + 12]], who: '筒井の別手' },
];

export const SHIGISAN_PLAN = {
  mon: 'todo',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '信貴山城', type: 'yama', year: 1577,
  // 大将の居場所（kaito 10/2）：雄嶽の主郭の高櫓（小さな二重）の最上階に松永久秀（戸口は南）
  lordSeat: { kind: 'tenshu', at: [TOP.x - 2, TOP.z - 8], floors: 3, b: 11, base: 4.5, old: true, name: '高櫓', where: '高櫓の最上階' },
  kuruwa: [
    // 北尾根の曲輪群（それぞれ独立して守る）。門を抜けた先が下の段、尾根道の先に上の段、裏道の先に屋敷
    { id: 'ridge1', name: '北尾根の曲輪（下）', wall: 'saku', gapW: 6, gapAt: [[RIDGE1.x, RIDGE1.z + RIDGE1.r], [RIDGE1.x, RIDGE1.z - RIDGE1.r], [RIDGE1.x - RIDGE1.r, RIDGE1.z], [RIDGE1.x + RIDGE1.r, RIDGE1.z]], poly: circle(RIDGE1.x, RIDGE1.z, RIDGE1.r), level: (bf) => bf(RIDGE1.x, RIDGE1.z) + 1 },
    { id: 'ridge2', name: '北尾根の曲輪（上）', poly: circle(RIDGE2.x, RIDGE2.z, RIDGE2.r), level: (bf) => bf(RIDGE2.x, RIDGE2.z) + 2 },
    { id: 'yashiki', name: '松永屋敷', wall: 'saku', gapW: 6, gapAt: [[YASHIKI.x - YASHIKI.r, YASHIKI.z], [YASHIKI.x, YASHIKI.z + YASHIKI.r], [YASHIKI.x + YASHIKI.r, YASHIKI.z]], poly: circle(YASHIKI.x, YASHIKI.z, YASHIKI.r), level: (bf) => bf(YASHIKI.x, YASHIKI.z) + 2 },
    { id: 'shu', name: '主郭（高櫓）', poly: circle(TOP.x, TOP.z, TOP.r), level: (bf) => bf(TOP.x, TOP.z) + 3 },
  ],
  // nawabari.js（束19）の表に使うだけの口・櫓・道の束（b_shigisan.js の壁・門・櫓は今まで通り手組み。
  // buildGates・buildTowers は渡さないので、ここに書いても建物は増えない＝読むだけで戦いは変わらない）
  koguchi: [
    { id: 'gate', name: '門', from: 'out', to: 'ridge1', kind: 'hira', gate: 'kabuki', at: [GATE.x, GATE.z], role: 'ote', maxFlow: 5, fireResistance: 0.3 },
  ],
  // 空堀・堀切：門の前（ふもと側）の尾根を横に断つ。道の幅だけ掘り残して土橋にする（深さ 1m ほど・歩ける）
  hori: [
    { kind: 'horikiri', pts: [[-26, -57], [-7, -57]], w: 3.4, deep: 2.4 },
    { kind: 'horikiri', pts: [[7, -57], [26, -57]], w: 3.4, deep: 2.4 },
  ],
  yagura: [
    { id: 'monomi_gate', kind: 'monomi', at: [TOWER.x, TOWER.z] },
    { id: 'monomi_ridge1', kind: 'monomi', at: [RIDGE1.x - 7, RIDGE1.z - 4] },
    { id: 'monomi_yashiki', kind: 'monomi', at: [YASHIKI.x - 6, YASHIKI.z + 7] },
  ],
  paths: [
    { id: 'tozan', kind: 'ote', pts: ROAD },
  ],
};
