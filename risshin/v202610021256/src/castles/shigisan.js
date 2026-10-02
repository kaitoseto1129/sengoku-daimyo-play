// ======================================================================
// castles/shigisan.js … 信貴山城の縄張り（docs/late6b-1575-1578-spec.md 60〜74章）
// 土の大きな山城。雄嶽の主郭（高櫓）を頂に、北の尾根へ曲輪を連ねる（五段ほど。石垣は使わない）。
// 地形の造成（terrace）・壁（wallLine・ringWall）・建物は b_shigisan.js 側が今まで通り手組みで作る。
// ここでは castle_plan.js の形（kuruwa の多角形だけ）を持ち、siege_zones.js の区域（曲輪ごとの
// 守り・取ると次が開く流れ）に使う。buildCastlePlan は skipWalls を全曲輪に渡し、壁を二重に作らない。
// ======================================================================
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

export const TOP = { x: 0, z: -110, r: 20 };            // 雄嶽の主郭（高櫓）
export const GATE = { x: 0, z: -66 };                   // 門（本丸の手前の曲輪の口。主な登城道の口）
export const TOWER = { x: 12, z: -70 };                 // 門の脇の物見櫓
export const RIDGE1 = { x: 0, z: -78, r: 10 };          // 北尾根の曲輪（下の段。門を抜けてすぐ）
export const RIDGE2 = { x: -2, z: TOP.z + 8, r: 9 };    // 北尾根の曲輪（上の段。主郭の手前・尾根道の先）
export const YASHIKI = { x: 30, z: TOP.z + 4, r: 11 };  // 松永屋敷（北尾根のさらに奥の郭。裏道の先）
export const TEMPLE = { x: 58, z: 14, r: 9 };           // 朝護孫子寺の区域（軍事の区域と離す。装飾のみ）
export const ROAD = [[0, 150], [6, 90], [-10, 40], [4, -10], [0, -40], [GATE.x, GATE.z + 6], [0, TOP.z]];

export const SHIGISAN_PLAN = {
  name: '信貴山城', type: 'yama', year: 1577,
  kuruwa: [
    // 北尾根の曲輪群（それぞれ独立して守る）。門を抜けた先が下の段、尾根道の先に上の段、裏道の先に屋敷
    { id: 'ridge1', name: '北尾根の曲輪（下）', poly: circle(RIDGE1.x, RIDGE1.z, RIDGE1.r), level: (bf) => bf(RIDGE1.x, RIDGE1.z) + 1 },
    { id: 'ridge2', name: '北尾根の曲輪（上）', poly: circle(RIDGE2.x, RIDGE2.z, RIDGE2.r), level: (bf) => bf(RIDGE2.x, RIDGE2.z) + 2 },
    { id: 'yashiki', name: '松永屋敷', poly: circle(YASHIKI.x, YASHIKI.z, YASHIKI.r), level: (bf) => bf(YASHIKI.x, YASHIKI.z) + 2 },
    { id: 'shu', name: '主郭（高櫓）', poly: circle(TOP.x, TOP.z, TOP.r), level: (bf) => bf(TOP.x, TOP.z) + 3 },
  ],
  // nawabari.js（束19）の表に使うだけの口・櫓・道の束（b_shigisan.js の壁・門・櫓は今まで通り手組み。
  // buildGates・buildTowers は渡さないので、ここに書いても建物は増えない＝読むだけで戦いは変わらない）
  koguchi: [
    { id: 'gate', name: '門', from: 'out', to: 'ridge1', kind: 'hira', gate: 'kabuki', at: [GATE.x, GATE.z], role: 'ote', maxFlow: 5, fireResistance: 0.3 },
  ],
  yagura: [
    { id: 'monomi_gate', kind: 'monomi', at: [TOWER.x, TOWER.z] },
  ],
  paths: [
    { id: 'tozan', kind: 'ote', pts: ROAD },
  ],
};
