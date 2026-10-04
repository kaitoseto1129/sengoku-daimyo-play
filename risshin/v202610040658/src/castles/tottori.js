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
  yagura: [{ id: 'monomi_w', at: [-X - B, -Z - B] }, { id: 'monomi_e', at: [X + B, Z + B] }],
};
