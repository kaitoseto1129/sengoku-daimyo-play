// ======================================================================
// castles/shigisan.js … 信貴山城の縄張り（docs/late6b-1575-1578-spec.md 60〜74章）
// 資料：docs/layout-ref/castles.md「信貴山」。平群町の文化財解説では城域は南北約700m×東西約550m。北へ居館の尾根が延びる。
// 1が約2mの戦場では全域（約350×275）を再現せず、主郭と北尾根の一部だけを扱う。
// 大手・搦手の方角と各曲輪の寸法は未確認。攻め口は従来の筋、北尾根の段数と屋敷の方角は県の解説に合わせる。
// 土の大きな山城。雄嶽の主郭（高櫓）を頂に、北の尾根へ曲輪を連ねる（五段ほど。石垣は使わない）。
// 奈良県・平群町の解説：雄嶽北側は五段の削平地、松永屋敷は北端。寸法・輪郭・門・建物配置は推定。
// 曲輪の切岸・土塁と柵は共通の縄張りから作り、歩く地面と段を一致させる。
// ======================================================================
import { switchback } from '../yamalift.js';
function circle(cx, cz, r, n = 12) { return Array.from({ length: n }, (_, i) => { const a = ((i + 0.5) / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; }); }

export const TOP = { x: 0, z: -110, r: 20 };            // 雄嶽の主郭（高櫓）
export const GATE = { x: 0, z: -66 };                   // 門（本丸の手前の曲輪の口。主な登城道の口）
export const TOWER = { x: 14, z: GATE.z + 3 };                 // 門の脇の物見櫓
export const RIDGE1 = { x: -24, z: TOP.z - 52, r: 10 }; // 北尾根の曲輪（下の段。門から主郭の西を回る）
export const RIDGE2 = { x: -2, z: TOP.z - 32, r: 9 };    // 北尾根の曲輪（上の段。主郭の手前・尾根道の先）
export const RIDGE3 = { x: -8, z: -188, r: 11 };       // 北尾根の中段（位置と広さは推定）
export const RIDGE4 = { x: -10, z: -212, r: 10 };      // 北尾根の奥の段（位置と広さは推定）
export const YASHIKI = { x: -10, z: -242, r: 18 };  // 松永屋敷（北尾根のさらに奥の郭。裏道の先）
export const TEMPLE = { x: 58, z: 14, r: 9 };           // 朝護孫子寺の区域（軍事の区域と離す。装飾のみ）
// 九十九折り（kaito 10/3：比高を上げたので、道は左右に振って長く登る）
export const ROAD = [
  [0, 150], ...switchback([6, 90], [GATE.x, GATE.z + 6], 10, 32), [GATE.x, GATE.z],
  // 主郭の柵の西を回り、北尾根の下・上の曲輪を経て、主郭の南の口へ戻る。
  [-36, -94], [-36, -132], [RIDGE1.x, RIDGE1.z + 14], [RIDGE1.x, RIDGE1.z],
  [RIDGE1.x, RIDGE1.z + 14], [RIDGE2.x, RIDGE2.z - 14], [RIDGE2.x, RIDGE2.z],
  [RIDGE2.x, RIDGE2.z + 10], [-30, -132], [-30, -96], [0, TOP.z + TOP.r + 4], [0, TOP.z + 8],
];
// 下の曲輪から屋敷へ分かれる道。南の口を通り、主殿の東を抜けて主郭の南の口に合流する。
const YASHIKI_ROAD = [
  [RIDGE1.x, RIDGE1.z], [RIDGE1.x, RIDGE1.z - RIDGE1.r],
  [-30, -178], [RIDGE3.x, RIDGE3.z], [RIDGE4.x, RIDGE4.z],
  [YASHIKI.x, YASHIKI.z + YASHIKI.r], [YASHIKI.x, YASHIKI.z + 7],
  // 主殿の東を通り、通った五段を戻って西の帯道へ。
  [YASHIKI.x + 8, YASHIKI.z + 7], [YASHIKI.x + 8, YASHIKI.z + 13],
  [YASHIKI.x, YASHIKI.z + YASHIKI.r], [RIDGE4.x, RIDGE4.z], [RIDGE3.x, RIDGE3.z],
  [-30, -178], [RIDGE1.x, RIDGE1.z - RIDGE1.r], [RIDGE1.x, RIDGE1.z], [RIDGE1.x, RIDGE1.z + RIDGE1.r], [-36, -148], [-36, -132], [-30, -96], [0, TOP.z + TOP.r + 4],
];
// 朝護孫子寺の区域（城の曲輪とは別の区域。戦いの的にしない。山門が北の登城道へ向き、築地で囲む）
export const TEMPLE_ZONE = {
  id: 'temple', name: '朝護孫子寺', poly: circle(TEMPLE.x, TEMPLE.z, TEMPLE.r + 3, 8), kind: 'temple', combat: false,
  sanmon: { x: TEMPLE.x - TEMPLE.r, z: TEMPLE.z }, hondo: { x: TEMPLE.x, z: TEMPLE.z },
};
// 登る道が複数：①大手の登城道（ROAD）②西の尾根道（明智の備が押さえる）③寺の側の道（東の尾根。羽柴の備が押さえる）④裏道（屋敷の背へ回る）
export const ROUTES = [
  { id: 'ote', name: '大手の登城道', pts: ROAD, who: '筒井順慶・織田信忠の本隊' },
  { id: 'nishi', name: '西の尾根道', pts: [...switchback([-70, 20], [-24, -60], 4, 14), [-8, GATE.z + 8], [0, GATE.z + 6]], who: '明智光秀の備' },
  { id: 'tera', name: '寺の側の道', pts: [[70, 30], [46, 30], [46, 14], [49, 14], [46, 14], [44, 14], [26, 2], [44, -10], [24, -22], ...switchback([44, -30], [34, -52], 2, 8), [24, GATE.z + 9], [0, GATE.z + 6]], who: '羽柴秀吉の備' },
  { id: 'ura', name: '裏道', pts: [[70, 30], [76, 0], ...switchback([66, -60], [48, -172], 5, 18), [40, -220], [YASHIKI.x + YASHIKI.r + 6, YASHIKI.z], [YASHIKI.x + YASHIKI.r, YASHIKI.z], [YASHIKI.x + 12, YASHIKI.z]], who: '筒井の別手' },
  { id: 'yashiki', name: '屋敷への尾根道', pts: YASHIKI_ROAD, who: '筒井の別手' },
];

export const SHIGISAN_PLAN = {
  mon: 'todo',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '信貴山城', type: 'yama', year: 1577,
  // 大将の居場所（kaito 10/2）：雄嶽の主郭の四重の天守（寸法・内部は推定復元）の上階に松永久秀（戸口は南）
  lordSeat: { profile: 'shigisan', kind: 'tenshu', at: [TOP.x - 2, TOP.z - 8], floors: 4, b: 10, base: 0.6, old: true, name: '天守', where: '天守の最上階' },
  kuruwa: [
    // 北尾根の曲輪群（それぞれ独立して守る）。門を抜けた先が下の段、尾根道の先に上の段、裏道の先に屋敷
    { id: 'ridge1', name: '北尾根の曲輪（下）', wall: 'saku', gapW: 6, gapAt: [[RIDGE1.x, RIDGE1.z + RIDGE1.r], [RIDGE1.x, RIDGE1.z - RIDGE1.r], [RIDGE1.x - RIDGE1.r, RIDGE1.z], [RIDGE1.x + RIDGE1.r, RIDGE1.z]], poly: circle(RIDGE1.x, RIDGE1.z, RIDGE1.r), level: (bf) => bf(RIDGE1.x, RIDGE1.z) + 1 },
    { id: 'ridge2', name: '北尾根の曲輪（上）', wall: 'saku', gapW: 7, gapAt: [[RIDGE2.x, RIDGE2.z - RIDGE2.r], [RIDGE2.x, RIDGE2.z + RIDGE2.r]], poly: circle(RIDGE2.x, RIDGE2.z, RIDGE2.r), level: (bf) => bf(RIDGE2.x, RIDGE2.z) + 2 },
    ...[RIDGE3, RIDGE4].map((c, i) => ({ id: 'ridge' + (i + 3), name: i ? '北尾根の奥の曲輪' : '北尾根の中の曲輪', wall: 'saku', gapW: 7, gapAt: [[c.x, c.z - c.r], [c.x, c.z + c.r], ...(i ? [] : [[c.x - c.r, c.z + 4]])], poly: circle(c.x, c.z, c.r), level: (bf) => bf(c.x, c.z) + 1 })),
    { id: 'yashiki', name: '松永屋敷', wall: 'saku', gapW: 6, gapAt: [[YASHIKI.x - YASHIKI.r, YASHIKI.z], [YASHIKI.x, YASHIKI.z - YASHIKI.r], [YASHIKI.x, YASHIKI.z + YASHIKI.r], [YASHIKI.x + YASHIKI.r, YASHIKI.z]], poly: circle(YASHIKI.x, YASHIKI.z, YASHIKI.r), level: (bf) => bf(YASHIKI.x, YASHIKI.z) + 2 },
    { id: 'shu', name: '主郭（高櫓）', wall: 'saku', gapW: 8, gapAt: [[0, TOP.z + TOP.r]], poly: circle(TOP.x, TOP.z, TOP.r), level: (bf) => bf(TOP.x, TOP.z) + 3 },
  ],
  // 大手の閉門は戦の側で作る。尾根の木戸・物見は同じ座標から手置きする。
  koguchi: [
    { id: 'gate', name: '門', from: 'out', to: 'ridge1', kind: 'hira', gate: 'kabuki', at: [GATE.x, GATE.z], role: 'ote', maxFlow: 5, fireResistance: 0.3 },
  ],
  // 堀の存在は史料にある。西斜面の横堀の位置・寸法は大和の土の山城として推定。既存の空堀・堀切：門の前（ふもと側）の尾根を横に断つ。道の幅だけ掘り残して土橋にする（深さ 1m ほど・歩ける）
  hori: [
    { kind: 'karabori', pts: [[-46, -130], [-50, -150], [-44, -178], [-34, -210]], w: 4.5, deep: 2 },
    { kind: 'horikiri', pts: [[-26, -57], [-7, -57]], w: 3.4, deep: 2.4 },
    { kind: 'horikiri', pts: [[7, -57], [26, -57]], w: 3.4, deep: 2.4 },
  ],
  yagura: [
    { id: 'monomi_gate', kind: 'monomi', at: [TOWER.x, TOWER.z] },
    { id: 'monomi_ridge1', kind: 'monomi', at: [RIDGE1.x - 7, RIDGE1.z - 4] },
    { id: 'monomi_ridge4', kind: 'monomi', at: [RIDGE4.x - 5, RIDGE4.z + 1.5] },
    { id: 'monomi_yashiki', kind: 'monomi', at: [YASHIKI.x - 6, YASHIKI.z + 7] },
  ],
  paths: ROUTES.map((r) => ({ id: r.id, kind: r.id === 'ote' ? 'ote' : 'waki', pts: r.pts })),
};
