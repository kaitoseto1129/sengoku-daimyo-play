// 高天神城（遠江・鶴翁山）。手本と出所は docs/battle_refs/takatenjin.md（K563 武田編・11/21 クラウド35）。
// 一城別郭：東峰（本丸・的場曲輪・御前曲輪・三の丸）と西峰（西の丸・二の丸・馬場平・堂の尾曲輪）を鞍部の井戸曲輪がつなぐ。
// 石垣の無い土の城（土塁と堀切）。大手は南、搦手は北（井戸曲輪の下の谷）。北が -z、東が +x。平面は実長の約0.5倍、寸法と段の高さは推定。
export const OTE = { x: 38, z: 34, name: '追手門' };
export const KARAMETE = { x: 3, z: -14, name: '搦手門' };
export const GATE_HON = { x: 38, z: 6, name: '本丸の口' };
export const ROAD_OTE = [[38, 90], [40, 64], [34, 48], [38, 34], [38, 22], [38, 6], [38, -9]];
export const ROAD_KARAMETE = [[3, -70], [6, -44], [3, -24], [3, -14], [3, -7]];
export const ROAD_NISHI = [[-130, -8], [-100, -10], [-90, -10]];   // 西の尾根の落ちる道
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
export const TAKATENJIN_PLAN = {
  mon: 'tokugawa', name: '高天神城', type: 'yama', year: 1574, stone: false, lifeDense: 1.8, lifeNoFlags: true,
  kuruwa: [
    { id: 'san', name: '三の丸', level: -8, wall: 'saku', hp: 460, kind: 'san', capacity: 100, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(24, 52, 6, 34), gapAt: [[38, 34], [38, 6]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 0, wall: 'dobei', stone: false, hp: 900, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(20, 56, -24, 6), gapAt: [[38, 6], [20, -7], [56, -9], [38, -24]] },
    { id: 'mato', name: '的場曲輪', level: -4, wall: 'saku', hp: 380, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(56, 80, -20, 2), gapAt: [[56, -9]], gapW: 4 },
    { id: 'gozen', name: '御前曲輪', level: -2, wall: 'saku', hp: 400, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(28, 50, -44, -24), gapAt: [[38, -24]], gapW: 4 },
    { id: 'ido', name: '井戸曲輪', level: -14, wall: 'saku', hp: 420, kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(-14, 20, -14, 0), gapAt: [[20, -7], [-14, -7], [3, -14]], gapW: 4.5 },
    { id: 'nishi', name: '西の丸', level: -2, wall: 'dobei', stone: false, hp: 700, kind: 'ni', capacity: 100, fallbackTo: 'ido', defenseValue: .8,
      poly: rect(-50, -14, -24, -2), gapAt: [[-14, -7], [-32, -2], [-50, -12], [-32, -24]], gapW: 4.5 },
    { id: 'ni', name: '二の丸', level: -6, wall: 'saku', hp: 500, kind: 'ni', capacity: 80, fallbackTo: 'nishi', defenseValue: .6,
      poly: rect(-44, -20, -2, 18), gapAt: [[-32, -2]], gapW: 4.5 },
    { id: 'baba', name: '馬場平', level: -8, wall: 'saku', hp: 400, kind: 'koshi', capacity: 60, fallbackTo: 'nishi', defenseValue: .45,
      poly: rect(-90, -54, -20, 2), gapAt: [[-54, -12], [-90, -10]], gapW: 4 },
    { id: 'donoo', name: '堂の尾曲輪', level: -16, wall: 'saku', hp: 420, kind: 'koshi', capacity: 60, fallbackTo: 'nishi', defenseValue: .5,
      poly: rect(-46, -18, -60, -28), gapAt: [[-32, -28]], gapW: 4 },
  ],
  koguchi: [
    { id: 'ote', name: OTE.name, from: 'out', to: 'san', kind: 'kuichigai', gate: 'kabuki', at: [38, 34], rot: 0, w: 4.6, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'gate_hon', name: GATE_HON.name, from: 'san', to: 'hon', kind: 'hira', gate: 'yagura', at: [38, 6], rot: 0, w: 4.4, maxFlow: 6, fireResistance: .5 },
    { id: 'hon_ido', name: '本丸の西の口', from: 'ido', to: 'hon', kind: 'hira', gate: 'kabuki', at: [20, -7], rot: Math.PI / 2, w: 4, maxFlow: 5, fireResistance: .4 },
    { id: 'karamete', name: KARAMETE.name, from: 'out', to: 'ido', kind: 'hira', gate: 'kabuki', at: [3, -14], rot: Math.PI, w: 4, role: 'karamete', maxFlow: 5, fireResistance: .3 },
    { id: 'nishi_ido', name: '西の丸の口', from: 'ido', to: 'nishi', kind: 'hira', gate: 'kabuki', at: [-14, -7], rot: -Math.PI / 2, w: 4, maxFlow: 5, fireResistance: .4 },
  ],
  paths: [
    { id: 'ote', kind: 'ote', pts: ROAD_OTE },
    { id: 'karamete', kind: 'karamete', pts: ROAD_KARAMETE },
    { id: 'nishi', kind: 'nishi', pts: ROAD_NISHI },
    { id: 'ridge', kind: 'koshi', pts: [[38, -9], [20, -7], [3, -7], [-14, -7], [-32, -12], [-50, -12], [-54, -12], [-72, -10], [-90, -10]] },
    { id: 'ni', kind: 'koshi', pts: [[-32, -12], [-32, -2], [-32, 8]] },
    { id: 'donoo', kind: 'koshi', pts: [[-32, -12], [-32, -24], [-32, -28], [-32, -44]] },
    { id: 'gozen', kind: 'koshi', pts: [[38, -9], [38, -24], [38, -34]] },
    { id: 'mato', kind: 'koshi', pts: [[38, -9], [56, -9], [68, -9]] },
  ],
  // 堀切と横堀（土の城の守りの芯）。歩く高さだけ道幅で掘り残す
  hori: [
    { kind: 'horikiri', pts: [[-52, -26], [-52, 6]], w: 4, deep: 4 },          // 西の丸と馬場平の間
    { kind: 'horikiri', pts: [[-50, -26], [-14, -26]], w: 4, deep: 4 },        // 西の丸と堂の尾曲輪の間
    { kind: 'karabori', pts: [[-50, -62], [-50, -28]], w: 5, deep: 3 },        // 堂の尾曲輪の西の横堀
    { kind: 'tatebori', pts: [[60, 10], [60, 30]], w: 3, deep: 3 },
    { kind: 'tatebori', pts: [[16, 4], [16, 24]], w: 3, deep: 3 },
  ],
  yagura: [
    { id: 'monomi_hon', kind: 'monomi', at: [50, -18], rot: 0 },
    { id: 'monomi_san', kind: 'monomi', at: [30, 28], rot: Math.PI },
    { id: 'monomi_nishi', kind: 'monomi', at: [-44, -18], rot: -Math.PI / 2 },
  ],
  yokoya: [
    { id: 'ote_waki', at: [32, 30], dir: Math.PI },
    { id: 'ido_waki', at: [-6, -12], dir: Math.PI },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [44, -10], w: 11, d: 7, rot: 0, door: 1, name: '主殿', where: '主殿の奥の間' },
  taba: [[34, 52], [42, 52]],
};

// ---- 武田編の戦の地形に合わせた置き方（11/21 クラウド35・K563 ③の質） ----
// d09（天正二年・勝頼が攻める）・d12（天正九年・城兵が打って出る）は、戦の地形（丘）と段の場所が上の史実の縄張りと向きが違う
// （どちらも寄せ手が北の +z から来る）。曲輪の名と並び（西峰に西の丸・二の丸・堂の尾、東峰に本丸・御前・的場、鞍部に井戸曲輪）は
// 史実のまま、戦の座標（at: { x: 0, z: 0 }）へ直に描いた。段の高さはその戦の丘の高さ（old(0,0)）からの差。寸法は推定。
// d09：大手の口 (6,96)＝大手曲輪の北の口の外／井楼の下 (-26,58)＝堂の尾曲輪の東の下／西の丸 (-14,18)＝西の丸の中／本丸 (18,-18)＝本丸の北の口の外
export const TAKATENJIN_D09 = {
  mon: 'tokugawa', name: '高天神城', type: 'yama', year: 1574, lifeDense: 1.4, lifeNoFlags: true,
  kuruwa: [
    { id: 'ote', name: '大手曲輪', level: -28, wall: 'saku', hp: 460, kind: 'san', capacity: 60, fallbackTo: 'ni', defenseValue: .45,
      poly: rect(-6, 18, 76, 92), gapAt: [[6, 92], [6, 76]], gapW: 6 },
    { id: 'donoo', name: '堂の尾曲輪', level: -22, wall: 'saku', hp: 420, kind: 'koshi', capacity: 60, fallbackTo: 'ni', defenseValue: .5,
      poly: rect(-72, -38, 44, 70) },
    { id: 'ni', name: '二の丸', level: -18, wall: 'saku', hp: 520, kind: 'ni', capacity: 80, fallbackTo: 'nishi', defenseValue: .6,
      poly: rect(-36, 0, 32, 50), gapAt: [[-18, 50], [-14, 32]], gapW: 6 },
    { id: 'nishi', name: '西の丸', level: -6, wall: 'saku', hp: 700, kind: 'ni', capacity: 100, fallbackTo: 'ido', defenseValue: .8,
      poly: rect(-30, 2, 0, 28), gapAt: [[-14, 28], [2, 8]], gapW: 6 },
    { id: 'ido', name: '井戸曲輪', level: -4, wall: null, hp: 420, kind: 'koshi', capacity: 60, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(4, 22, -18, 6) },
    { id: 'hon', name: '本丸', level: -9, wall: 'dobei', hp: 1000, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(6, 40, -46, -24), gapAt: [[18, -24]], gapW: 5 },
    { id: 'gozen', name: '御前曲輪', level: -13, wall: 'saku', hp: 400, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(10, 36, -66, -50) },
    { id: 'mato', name: '的場曲輪', level: -20, wall: 'saku', hp: 380, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(44, 64, -40, -24) },
  ],
  koguchi: [
    { id: 'ote', name: '追手門', from: 'out', to: 'ote', kind: 'hira', gate: 'kabuki', at: [6, 92], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'nishi', name: '西の丸の口', from: 'ni', to: 'nishi', kind: 'hira', gate: 'kabuki', at: [-14, 28], rot: 0, w: 5, maxFlow: 6, fireResistance: .4 },
    { id: 'hon', name: '本丸の口', from: 'ido', to: 'hon', kind: 'hira', gate: 'kabuki', at: [18, -24], rot: 0, w: 4.6, maxFlow: 6, fireResistance: .5 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 150], [6, 96], [6, 76], [-26, 58], [-18, 50], [-14, 28], [-14, 18], [2, 8], [12, -6], [18, -18], [18, -30]] }],
  hori: [
    { kind: 'horikiri', pts: [[-38, 30], [2, 30]], w: 3, deep: 3 },        // 二の丸と西の丸の間（道の所は掘り残す）
    { kind: 'karabori', pts: [[-74, 42], [-74, 72]], w: 4, deep: 3 },     // 堂の尾曲輪の西の横堀
    { kind: 'tatebori', pts: [[42, -20], [56, -10]], w: 3, deep: 3 },
  ],
  yagura: [
    { id: 'hon', kind: 'monomi', at: [34, -40], rot: 0 },
    { id: 'nishi', kind: 'monomi', at: [-26, 4], rot: 0 },
    { id: 'donoo', kind: 'monomi', at: [-44, 64], rot: 0 },
  ],
  lordSeat: { profile: 'takato', kind: 'goten', at: [24, -38], w: 11, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
// d12：城兵の本人は本丸（(0,-40)）から北の木戸 (4,10) へ打って出て、囲みの柵・砦を抜ける。本丸と大手の曲輪だけ近く、西峰は遠景
export const TAKATENJIN_D12 = {
  mon: 'takeda', name: '高天神城', type: 'yama', year: 1581, lifeDense: 1.2, lifeNoFlags: true,
  kuruwa: [
    { id: 'hon', name: '本丸', level: 18, wall: 'dobei', hp: 1000, kind: 'hon', capacity: 120, fallbackTo: null, defenseValue: 1,
      poly: rect(-22, 22, -64, -22), gapAt: [[0, -22]], gapW: 5 },
    { id: 'ote', name: '大手の曲輪', level: 2, wall: 'saku', hp: 520, kind: 'san', capacity: 80, fallbackTo: 'hon', defenseValue: .5,
      poly: rect(-20, 28, -16, 6), gapAt: [[4, 6], [0, -16]], gapW: 6 },
    { id: 'ido', name: '井戸曲輪', level: 4, wall: 'saku', hp: 420, kind: 'koshi', capacity: 40, fallbackTo: 'hon', defenseValue: .45,
      poly: rect(-48, -28, -56, -36) },
    { id: 'nishi', name: '西の丸', level: 4, wall: 'saku', hp: 600, kind: 'ni', capacity: 60, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-86, -52, -70, -40) },
  ],
  koguchi: [
    { id: 'kido', name: '大手の木戸', from: 'out', to: 'ote', kind: 'hira', gate: 'kabuki', at: [4, 6], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 },
    { id: 'hon', name: '本丸の口', from: 'ote', to: 'hon', kind: 'hira', gate: 'kabuki', at: [0, -22], rot: 0, w: 4.6, maxFlow: 6, fireResistance: .5 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, -40], [0, -22], [0, -16], [4, 6], [4, 10], [-24, 64], [30, 104], [0, 150]] }],
  hori: [{ kind: 'horikiri', pts: [[-26, -19], [-4, -19]], w: 3, deep: 3 }, { kind: 'horikiri', pts: [[4, -19], [26, -19]], w: 3, deep: 3 }],
  yagura: [{ id: 'hon', kind: 'monomi', at: [16, -58], rot: 0 }, { id: 'nishi', kind: 'monomi', at: [-80, -44], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [-6, -48], w: 11, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
