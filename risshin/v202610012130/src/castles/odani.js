// ======================================================================
// castles/odani.js … 小谷城の縄張り（docs/late6-1573-1575-spec.md 14〜37章・束7）
// castle_plan.js の形（kuruwa・koguchi・paths・hori・yagura）で書く。尾根は南北一直線
// （南 +z が山麓・番所、北 -z が山王丸・詰の城。真ん中が京極丸）なので、道は鎖になっていて、
// 京極丸を敵に押さえられれば本丸（長政）と小丸（久政）はこの縄張りの上では行き来できない
// （区域の網そのものが、京極丸を「切る場所」にしている）。地形・兵の配置・戦い方は b_odani.js 側。
// 向き：北（-z）が高い。東（+x）の谷から、京極丸の東の口へ登る（羽柴秀吉の夜討ちの道）。
// 本丸・京極丸・小丸・山王丸・大広間は b_odani.js が自分で塀を建てる（口の幅が辺一つ分しか開かないと
// 隊列が詰まるので、手で広めの弧に結う）。番所〜桜馬場の前衛の曲輪は、ここの wall 指定のまま
// castle_plan.js に建てさせる（背景・見た目の作りで、隊列の詰まりは気にしなくてよい）。
// ======================================================================

function circlePoly(x, z, r, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x + Math.sin(a) * r, z + Math.cos(a) * r]); }
  return pts;
}
// 口の幅：一点だけだと塀の一辺（16角で約5m）しか開かず、隊列が詰まって動けなくなる（確かめで見つけた）ので、
// 角度を振った何点かを渡して、隣り合う辺を続けて開ける（0 = 南、π/2 = 東、π = 北。circlePoly と同じ向き）
function gateArc(x, z, r, angle, spread = 1) {
  const pts = [];
  for (let k = -spread; k <= spread; k++) { const a = angle + k * (Math.PI / 9); pts.push([x + Math.sin(a) * r, z + Math.cos(a) * r]); }
  return pts;
}

export const HON = { x: 0, z: 0, r: 16 };              // 本丸（長政）
export const KYOGOKU = { x: 0, z: -55, r: 13 };        // 京極丸（分断の要）
export const KOMARU = { x: 0, z: -100, r: 12 };        // 小丸（久政）
export const SANNOMARU = { x: 0, z: -128, r: 11 };     // 山王丸（詰の城。四段・石垣・桝形）
export const OOHIROMA = { x: 0, z: 38, r: 14 };        // 大広間・桜馬場の前衛（最大の平場）
export const SAKURABABA = { x: 0, z: 70, r: 15 };      // 桜馬場（主郭前の長めの曲輪）
export const ONMAYA = { x: 0, z: 98, r: 12 };          // 御馬屋（土塁・馬洗池）
export const OCHAYA = { x: 0, z: 122, r: 10 };         // 御茶屋（再編地点）
export const BANSHO = { x: 0, z: 144, r: 9 };          // 番所（登城口の管理・最初の守り）
// 馬洗池（御馬屋の目印の水場）
export const UMAARAI = { x: ONMAYA.x - 5, z: ONMAYA.z + 3, r: 2.6 };
// 大堀切（本丸の北。ここで城が前後に分かれる。本丸を取っても戦を終わらせない）
export const OHORIKIRI = { x: 0, z: -20, w: 9, deep: 3.2 };
// 中丸（本丸の後ろ。枡形虎口で、前が落ちても後ろが独立して守れる・見た目だけの札）
export const NAKAMARU = { x: 9, z: -28 };

export const GATE_KURO = { x: 0, z: 53, name: '黒金御門' };               // 桜馬場→大広間（門＋石垣＋狭い道）
export const GATE_OOHIROMA_HON = { x: 0, z: 22, name: '大広間の木戸' };    // 大広間→本丸
export const GATE_HON_KYO = { x: 0, z: -40, name: '本丸の北の木戸' };      // 本丸→（中丸）→京極丸
export const GATE_KYO_KOMA = { x: 0, z: -68, name: '京極丸の北の木戸' };   // 京極丸→小丸
export const GATE_KOMA_SANNO = { x: 0, z: -112, name: '小丸の木戸' };      // 小丸→山王丸
// 東の谷からの登り口（京極丸の東の縁。羽柴秀吉はここから夜に登る）
export const GATE_EAST = { x: KYOGOKU.x + KYOGOKU.r + 2, z: KYOGOKU.z, name: '谷からの登り口' };

// 尾根の鎖（南の番所から北の山王丸まで）。CLIMB（b_odani.js）は途中から GATE_EAST へ合流する
export const ROAD_RIDGE = [
  [BANSHO.x, BANSHO.z + 10], [OCHAYA.x, OCHAYA.z], [ONMAYA.x, ONMAYA.z], [SAKURABABA.x, SAKURABABA.z],
  [GATE_KURO.x, GATE_KURO.z], [OOHIROMA.x, OOHIROMA.z + 12], [GATE_OOHIROMA_HON.x, GATE_OOHIROMA_HON.z], [HON.x, HON.z],
  [GATE_HON_KYO.x, GATE_HON_KYO.z], [KYOGOKU.x, KYOGOKU.z],
  [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], [KOMARU.x, KOMARU.z],
  [GATE_KOMA_SANNO.x, GATE_KOMA_SANNO.z], [SANNOMARU.x, SANNOMARU.z],
];
export const ROAD_EAST = [[GATE_EAST.x + 18, GATE_EAST.z + 1], [GATE_EAST.x, GATE_EAST.z], [KYOGOKU.x, KYOGOKU.z]];

export const ODANI_PLAN = {
  name: '小谷城', type: 'yama', year: 1573, stone: 'nozura',
  kuruwa: [
    { id: 'bansho', name: '番所', level: 0.02, wall: 'dobei', hp: 140, kind: 'koshi', capacity: 16, fallbackTo: 'ochaya', defenseValue: 0.1, poly: circlePoly(BANSHO.x, BANSHO.z, BANSHO.r), gapAt: [BANSHO.x, BANSHO.z - BANSHO.r] },
    { id: 'ochaya', name: '御茶屋', level: 0.08, wall: 'dobei', hp: 150, kind: 'koshi', capacity: 16, fallbackTo: 'onmaya', defenseValue: 0.12, poly: circlePoly(OCHAYA.x, OCHAYA.z, OCHAYA.r), gapAt: [OCHAYA.x, OCHAYA.z - OCHAYA.r] },
    { id: 'onmaya', name: '御馬屋', level: 0.12, wall: 'dobei', hp: 160, kind: 'koshi', capacity: 18, fallbackTo: 'sakurababa', defenseValue: 0.15, poly: circlePoly(ONMAYA.x, ONMAYA.z, ONMAYA.r), gapAt: [ONMAYA.x, ONMAYA.z - ONMAYA.r] },
    { id: 'sakurababa', name: '桜馬場', level: 0.16, wall: 'dobei', hp: 160, kind: 'koshi', capacity: 24, fallbackTo: 'oohiroma', defenseValue: 0.2, poly: circlePoly(SAKURABABA.x, SAKURABABA.z, SAKURABABA.r), gapAt: [SAKURABABA.x, SAKURABABA.z - SAKURABABA.r] },
    // 大広間・本丸・京極丸・小丸・山王丸は b_odani.js が自分で塀を建てる（skipWalls）
    { id: 'oohiroma', name: '大広間・桜馬場前衛', level: 0.2, wall: null, kind: 'koshi', capacity: 100, fallbackTo: 'hon', defenseValue: 0.3, poly: circlePoly(OOHIROMA.x, OOHIROMA.z, OOHIROMA.r), gapAt: [...gateArc(OOHIROMA.x, OOHIROMA.z, OOHIROMA.r, 0), ...gateArc(OOHIROMA.x, OOHIROMA.z, OOHIROMA.r, Math.PI)] },
    { id: 'hon', name: '本丸', level: 0.6, wall: 'dobei', hp: 520, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 0.9, poly: circlePoly(HON.x, HON.z, HON.r), gapAt: [...gateArc(HON.x, HON.z, HON.r, 0), ...gateArc(HON.x, HON.z, HON.r, Math.PI)] },
    { id: 'kyogoku', name: '京極丸', level: 0.45, wall: 'dobei', hp: 400, kind: 'ni', capacity: 90, fallbackTo: null, defenseValue: 0.6, poly: circlePoly(KYOGOKU.x, KYOGOKU.z, KYOGOKU.r), gapAt: [...gateArc(KYOGOKU.x, KYOGOKU.z, KYOGOKU.r, 0), ...gateArc(KYOGOKU.x, KYOGOKU.z, KYOGOKU.r, Math.PI), ...gateArc(KYOGOKU.x, KYOGOKU.z, KYOGOKU.r, Math.PI / 2)] },
    { id: 'koma', name: '小丸', level: 0.3, wall: 'dobei', hp: 380, kind: 'san', capacity: 80, fallbackTo: null, defenseValue: 0.55, poly: circlePoly(KOMARU.x, KOMARU.z, KOMARU.r), gapAt: [...gateArc(KOMARU.x, KOMARU.z, KOMARU.r, 0), ...gateArc(KOMARU.x, KOMARU.z, KOMARU.r, Math.PI)] },
    { id: 'sannomaru', name: '山王丸', level: 0.1, wall: 'dobei', hp: 300, kind: 'koshi', capacity: 60, fallbackTo: 'koma', defenseValue: 0.4, poly: circlePoly(SANNOMARU.x, SANNOMARU.z, SANNOMARU.r), gapAt: gateArc(SANNOMARU.x, SANNOMARU.z, SANNOMARU.r, 0) },
  ],
  koguchi: [
    { id: 'gate_bansho_ochaya', name: '番所と御茶屋の木戸', from: 'bansho', to: 'ochaya', kind: 'hira', at: [(BANSHO.x + OCHAYA.x) / 2, (BANSHO.z - BANSHO.r + OCHAYA.z + OCHAYA.r) / 2], rot: 0, w: 3.2 },
    { id: 'gate_ochaya_onmaya', name: '御茶屋と御馬屋の木戸', from: 'ochaya', to: 'onmaya', kind: 'hira', at: [(OCHAYA.x + ONMAYA.x) / 2, (OCHAYA.z - OCHAYA.r + ONMAYA.z + ONMAYA.r) / 2], rot: 0, w: 3.2 },
    { id: 'gate_onmaya_sakura', name: '御馬屋と桜馬場の木戸', from: 'onmaya', to: 'sakurababa', kind: 'hira', at: [(ONMAYA.x + SAKURABABA.x) / 2, (ONMAYA.z - ONMAYA.r + SAKURABABA.z + SAKURABABA.r) / 2], rot: 0, w: 3.4 },
    { id: 'gate_kuro', name: GATE_KURO.name, from: 'sakurababa', to: 'oohiroma', kind: 'hira', gate: 'yagura', at: [GATE_KURO.x, GATE_KURO.z], rot: 0, w: 3, role: 'ote', maxFlow: 5, fireResistance: 0.3 },
    { id: 'gate_oh', name: GATE_OOHIROMA_HON.name, from: 'oohiroma', to: 'hon', kind: 'hira', gate: 'kabuki', at: [GATE_OOHIROMA_HON.x, GATE_OOHIROMA_HON.z], rot: 0, w: 4.2, role: 'ote', maxFlow: 6, fireResistance: 0.3 },
    { id: 'gate_hk', name: GATE_HON_KYO.name, from: 'hon', to: 'kyogoku', kind: 'hira', gate: 'kabuki', at: [GATE_HON_KYO.x, GATE_HON_KYO.z], rot: 0, w: 4, maxFlow: 5, fireResistance: 0.3 },
    { id: 'gate_kk', name: GATE_KYO_KOMA.name, from: 'kyogoku', to: 'koma', kind: 'hira', gate: 'kabuki', at: [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], rot: 0, w: 4, maxFlow: 5, fireResistance: 0.3 },
    { id: 'gate_ks', name: GATE_KOMA_SANNO.name, from: 'koma', to: 'sannomaru', kind: 'hira', gate: 'kabuki', at: [GATE_KOMA_SANNO.x, GATE_KOMA_SANNO.z], rot: 0, w: 3.6, maxFlow: 4, fireResistance: 0.2 },
    { id: 'east', name: GATE_EAST.name, from: 'out', to: 'kyogoku', kind: 'hira', gate: 'kabuki', at: [GATE_EAST.x, GATE_EAST.z], rot: Math.PI / 2, w: 3.6, role: 'karamete', maxFlow: 5, fireResistance: 0.2 },
  ],
  paths: [
    { id: 'ridge', kind: 'ote', pts: ROAD_RIDGE },
    { id: 'east', kind: 'karamete', pts: ROAD_EAST },
  ],
  hori: [],
  yagura: [
    { id: 'monomi_kyo', kind: 'monomi', at: [KYOGOKU.x + 6, KYOGOKU.z - 7] },
    { id: 'monomi_koma', kind: 'monomi', at: [KOMARU.x - 6, KOMARU.z + 4] },
    { id: 'sumi_sanno', kind: 'sumi', at: [SANNOMARU.x - 2, SANNOMARU.z - 6], rot: Math.PI },
  ],
};
