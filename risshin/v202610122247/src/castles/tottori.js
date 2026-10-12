// ======================================================================
// castles/tottori.js … 鳥取城を囲む太閤ヶ平砦（陣城）のデータだけ（docs/fort-spec.md 35・36）。
// 天正九年、羽柴秀吉が鳥取城を兵糧攻めする間に布陣した本陣の付城。
// ======================================================================
// 東は +x、北は -z。南に大手、東に搦手。鳥取市の遺構説明と配置資料に合わせる。
export const TAIKOGAHIRA = { w: 47, d: 36, bankH: 5, bankW: 8, gateW: 8, moatW: 5.2, moatD: 2.4 };
const X = TAIKOGAHIRA.w / 2, Z = TAIKOGAHIRA.d / 2, B = TAIKOGAHIRA.bankW / 2;
const MX = X + TAIKOGAHIRA.bankW + 3, MZ = Z + TAIKOGAHIRA.bankW + 3;
export const TOTTORI_TAIKOGANARA_PLAN = {
  name: '太閤ヶ平',
  kuruwa: [{ id: 'honjin', name: '内陣', poly: [[-X, -Z], [X, -Z], [X, Z], [-X, Z]], level: 0.6, wall: 'saku', dorui: TAIKOGAHIRA.bankH, gapAt: [[0, Z], [X, 0]] }],
  koguchi: [{ id: 'ote', name: '大手口', at: [0, Z], w: TAIKOGAHIRA.gateW }, { id: 'karamete', name: '搦手口', at: [X, 0], w: TAIKOGAHIRA.gateW }],
  paths: [{ pts: [[0, Z + 24], [0, Z], [0, 0], [X, 0], [X + 24, 0]] }],
  hori: [[[-7, MZ], [-MX, MZ], [-MX, -MZ], [MX, -MZ], [MX, -7]], [[7, MZ], [MX, MZ], [MX, 7]]].map((pts) => ({ kind: 'karabori', pts, w: TAIKOGAHIRA.moatW, deep: TAIKOGAHIRA.moatD })),
  // 西の土塁の両端が櫓台（縄張り参照の出所 https://cmeg.jp/w/castles/6987）。
  // 木の櫓・台の幅・登り口は推定。梯子を柵の内に収めるため端から4m控える。
  yagura: [{ id: 'monomi_nw', at: [-X - B, -Z] }, { id: 'monomi_sw', at: [-X - B, Z] }],
};

// 久松山の戦国期の細かな曲輪寸法・建物は未確定。
// 後世の山下ノ丸・巻石垣・天守を写さず、因幡の土の山城として推定。
// 横の距離は局地用。高さは山城の比高資料の約133mの復元を維持する。
export const TOTTORI_SEATS = [
  { id: 'sanjo', name: '山上の曲輪', x: 10, z: -164, w: 22, d: 26, y: 140, team: 1 },
  { id: 'obi', name: '山腹の曲輪', x: 8, z: -126, w: 27, d: 9, y: 122, team: 1 },
  { id: 'kido', name: '木戸内の曲輪', x: 0, z: -100, w: 22, d: 14, y: 104, team: 1 },
  { id: 'east', name: '東の控え', x: 40, z: -102, w: 10, d: 12, y: 113, team: 1 },
  { id: 'maruyama', name: '丸山城', x: -28, z: -222, w: 18, d: 16, y: 94, team: 1 },
  { id: 'karigane', name: '雁金山城', x: 28, z: -210, w: 15, d: 12, y: 120, team: 1 },
  { id: 'hidenaga', name: '本陣前の付城', x: 112, z: -82, w: 20, d: 17, y: 88, team: 0 },
  { id: 'kuridani', name: '栗谷側の付城', x: -14, z: -12, w: 12, d: 10, y: 12, team: 0 },
  { id: 'engoji', name: '円護寺側の付城', x: -36, z: -182, w: 14, d: 11, y: 85, team: 0 },
  { id: 'hamasaka', name: '浜坂側の付城', x: -132, z: -210, w: 14, d: 10, y: 72, team: 0 },
];
// 全棟の戸口は南。位置・規模・用途・板葺きは天正九年の因幡として推定。
export const TOTTORI_HOUSES = [
  { seat: 'sanjo', name: '山上の主殿', x: 10, z: -176, w: 9, d: 6 },
  { seat: 'sanjo', name: '山上の長屋', x: -4, z: -171, w: 8, d: 4 },
  { seat: 'sanjo', name: '山上の空蔵', x: 24, z: -177, w: 5, d: 4, kind: 'kura' },
  { seat: 'sanjo', name: '山上の小祠', x: -4, z: -181, w: 3, d: 3, kind: 'shrine' },
  { seat: 'obi', name: '山道の番所', x: -12, z: -126, w: 5, d: 4 },
  { seat: 'kido', name: '木戸の詰所', x: -10, z: -93, w: 6, d: 4 },
  { seat: 'east', name: '東の長屋', x: 45, z: -102, w: 7, d: 4 },
  ...['maruyama', 'karigane', 'hidenaga', 'kuridani', 'engoji', 'hamasaka'].map(id => {
    const k = TOTTORI_SEATS.find(s => s.id === id);
    return { seat: id, name: `${k.name}の番所`, x: k.x - k.w + 6, z: k.z - 4, w: 5, d: 4 };
  }),
  { seat: 'taiko', name: '本陣の控えの間', x: 167, z: -153, w: 7, d: 4 },
];
// 道を避けた北の堀切と東斜面の竪堀。種類・位置・深さは推定。
export const TOTTORI_DITCHES = [
  { pts: [[-13, -197], [5, -197]], w: 5, deep: 2.4 },
  { pts: [[48, -178], [54, -155], [62, -135]], w: 3, deep: 1.8 },
  { pts: [[-51, -240], [-51, -221]], w: 4, deep: 1.8 },
  { pts: [[45, -224], [45, -208]], w: 4, deep: 1.8 },
];
