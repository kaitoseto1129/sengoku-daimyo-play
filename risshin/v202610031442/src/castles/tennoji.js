// ======================================================================
// castles/tennoji.js … 天王寺砦の縄張り（docs/late6b-1575-1578-spec.md 16〜29 章）
// 原田直政が中心に築いた、織田の対本願寺の付城（HIST_B：野戦築城。石垣・天守は無い）。
// 外曲輪（兵の溜まり・兵舎）と、北の奥の主郭（本陣）の二段。周りは土塁の上の木柵、その外を空堀が巡る。
// 口は南（信長が来る側）の一つだけ。空堀は口の前だけ掘り残して土橋にする（GAME_C：細かな形は推定）。
// castle_plan.js の形（kuruwa・hori・yagura）で書く。地形・兵・戦い方は b_tennoji.js 側の仕事。
// 向き：北（-z）が石山本願寺。南（+z）から信長が来る
// ======================================================================

export const T_FORT = { x: 0, z: -62 };
export const T_GATE = { x: 0, z: -43, name: '天王寺砦の門' };       // 外曲輪の南の口
export const T_HONGATE = { x: -4, z: -68, name: '主郭の門' };      // 外曲輪→主郭
// 土塁の上の柵（外に盛る）の辺：[ax, az, bx, bz]。castle_plan の柵の線と同じ所
export const SOTO_POLY = [[-12, -43], [12, -43], [22, -52], [22, -78], [14, -90], [-14, -90], [-22, -78], [-22, -52]];
export const HON_POLY = [[-14, -86], [12, -86], [12, -68], [-14, -68]];

// 曲輪の高さ：下地（台地）の砦の中心の高さから少し上げる（切岸の下り坂は castle_plan が付ける）
const lv = (up) => (base) => base(T_FORT.x, T_FORT.z) + up;

export const TENNOJI_PLAN = {
  mon: 'oda',   // 曲輪の内に立てる幟の紋（castle_plan の autoKuruwaLife）
  name: '天王寺砦', type: 'toride', year: 1576,
  kuruwa: [
    { id: 'soto', name: '外曲輪', level: lv(1.1), wall: 'saku', gapW: 6,
      kind: 'ni', capacity: 120, fallbackTo: 'hon', defenseValue: 0.5,
      poly: SOTO_POLY, gapAt: [[T_GATE.x, T_GATE.z]] },
    { id: 'hon', name: '主郭', level: lv(1.9), wall: 'saku', gapW: 4.5,
      kind: 'hon', capacity: 60, fallbackTo: null, defenseValue: 1,
      poly: HON_POLY, gapAt: [[T_HONGATE.x, T_HONGATE.z]] },
  ],
  koguchi: [],
  hori: [
    // 外の空堀：口の前（x -4〜4）だけ掘り残して土橋
    { kind: 'karabori', pts: [[4, -37], [15, -37], [28, -49], [28, -81], [18, -96], [-18, -96], [-28, -81], [-28, -49], [-15, -37], [-4, -37]], w: 5.5, deep: 2.8 },
    // 主郭の前の堀切（主郭の門の前だけ土橋）
    { kind: 'horikiri', pts: [[-14, -65.5], [-7, -65.5]], w: 3.4, deep: 2.0 },
    { kind: 'horikiri', pts: [[-1, -65.5], [12, -65.5]], w: 3.4, deep: 2.0 },
  ],
  // 物見櫓（見張り）：外曲輪の東南・西北、主郭の北東
  yagura: [
    { id: 'monomi_se', kind: 'monomi', at: [17, -53], name: '物見櫓' },
    { id: 'monomi_nw', kind: 'monomi', at: [-17, -76], name: '物見櫓' },
    { id: 'monomi_hon', kind: 'monomi', at: [8, -82], name: '主郭の櫓' },
  ],
};
