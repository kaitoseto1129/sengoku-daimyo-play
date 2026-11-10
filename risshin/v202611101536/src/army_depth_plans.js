// ======================================================================
// 軍勢の厚み・陣立ての配置表（army_depth_plans.js）。最初の手本：天王寺・岡山（k15）と関ヶ原（k06）
//   書き方は docs/army_depth_howto.md。新しい戦は、戦のファイルの def に depth: { A, B } を書くか、ここへ一つ足す。
//   人数は史料の目安（諸説の中ほど）。各備の割り振りと置き場は遊びのための復元。旗はその家の物だけ。
//   本物の兵の隊は bind で結ぶ（描かず、場所・人数・崩れを本物の隊から読む）。軽い備は奥の層と翼だけ。
// ======================================================================
const F = (k) => (rt) => rt.flags[k];

// 天王寺・岡山（1615）。北が −z（大坂城）。ゲームの 1 は実の 8m。徳川の本陣は（−40, 130）、移動の限りは ±176。
//   天王寺口：本多忠朝の先手（本物）→ 越前勢（本物）・水野の二の備 → 旗本（本物）。岡山口（東）：前田利常 → 井伊・藤堂 → 秀忠の本陣（予備）。
//   豊臣：毛利勝永（本物）・真田（本物）の後ろに七手組・大野治長。東の岡山口は大野治房。秀頼の旗本は城の前で動かない。
const k15_tennoji_okayama = {
  // 11/9 kaito の布陣図（docs/k15_fujinzu_ref_1109.md・docs/fujin/k15_tennoji_okayama.md）どおりに全部の隊を置く。布陣図の画面（introFujin）と同じ所
  A: { name: '徳川', facing: Math.PI, honjin: { x: -40, z: 130 }, mpu: 8, formation: '鶴翼', flag: 'tokugawa', armor: 0x1f1e1c, openAt: 40, attrition: 0.0025,
    sonae: [
      { id: 'honda', layer: 'sakite', wing: 'center', men: 3000, taisho: '本多忠朝', flag: 'honda', bind: F('honda') },
      { id: 'nijin', layer: 'ichi', wing: 'center', men: 3000, taisho: '浅野長重', bind: F('nijin') },
      { id: 'echizen', layer: 'ichi', wing: 'left', men: 15000, taisho: '松平忠直', bind: F('echizen') },
      { id: 'date', layer: 'ichi', wing: 'left', men: 10000, taisho: '伊達政宗', flag: 'date', at: { x: -156, z: 54 } },
      { id: 'tadateru', layer: 'ni', wing: 'left', men: 12000, taisho: '松平忠輝', at: { x: -156, z: 112 } },
      { id: 'maeda', layer: 'ichi', wing: 'right', men: 15000, taisho: '前田利常', flag: 'maeda', at: { x: 44, z: 40 } },
      { id: 'todo', layer: 'ni', wing: 'right', men: 5000, taisho: '藤堂高虎', flag: 'todo', at: { x: 92, z: 54 } },
      { id: 'hosokawa', layer: 'ni', wing: 'right', men: 2000, taisho: '細川忠興', at: { x: 66, z: 80 } },
      { id: 'ii', layer: 'ni', wing: 'right', men: 3200, taisho: '井伊直孝', flag: 'ii', at: { x: 26, z: 80 } },
      { id: 'mizuno', layer: 'ni', wing: 'center', men: 3000, taisho: '水野勝成', at: { x: -14, z: 100 } },
      { id: 'hidetada', layer: 'yobi', wing: 'right', men: 20000, taisho: '徳川秀忠', at: { x: 46, z: 124 } },
      { id: 'asano', layer: 'yobi', wing: 'left', men: 5000, taisho: '浅野長晟', flag: 'asano', at: { x: -110, z: 140 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 15000, taisho: '徳川家康', bind: F('hon') },
      { id: 'gozume', layer: 'gozume', wing: 'center', men: 5000, taisho: '黒田長政', flag: 'kuroda', at: { x: -72, z: 158 }, from: { x: -72, z: 176 }, arrive: 300 },
      { id: 'konida', layer: 'konida', wing: 'center', men: 800, at: { x: -10, z: 166 } },
    ] },
  B: { name: '豊臣', facing: 0, honjin: { x: 0, z: -150 }, mpu: 8, formation: '魚鱗', flag: 'toyotomi', armor: 0x221f1c, uma: 'fukube', openAt: 40, attrition: 0.004,
    sonae: [
      { id: 'mori', layer: 'sakite', wing: 'center', men: 6500, taisho: '毛利勝永', bind: F('mori') },
      { id: 'sanada', layer: 'sakite', wing: 'right', men: 3500, taisho: '真田信繁', flag: 'sanada', bind: F('sanada') },
      { id: 'kimura', layer: 'ichi', wing: 'right', men: 1500, taisho: '木村宗明', at: { x: -84, z: -46 } },
      { id: 'otani', layer: 'ichi', wing: 'right', men: 2000, taisho: '大谷吉治', at: { x: -132, z: -34 } },
      { id: 'nanate', layer: 'ni', wing: 'center', men: 5000, taisho: '七手組', at: { x: -18, z: -66 } },
      { id: 'harufusa', layer: 'ni', wing: 'left', men: 6000, taisho: '大野治房', at: { x: 40, z: -84 } },
      { id: 'harufusa2', layer: 'ichi', wing: 'left', men: 4000, taisho: '', at: { x: 40, z: -36 } },
      { id: 'harunaga', layer: 'yobi', wing: 'center', men: 8000, taisho: '大野治長', at: { x: -30, z: -104 } },
      { id: 'hideyori', layer: 'hatamoto', wing: 'center', men: 5000, taisho: '', hold: true, at: { x: 24, z: -160 } },
    ] },
  honjinView: { A: false, B: true },   // 家康の本陣は戦のファイルが作る
  byMen: true,   // 軽い兵を兵数の比で配る（家康の旗本・秀忠・越前・前田が大きく、細川・木村は小さく）
};

// 関ヶ原（1600）。西が −x。ゲームの 1 は実の 4m。移動の限りは ±620。島津は退き口まで見せない（表に入れない）。
//   東軍：井伊・福島・黒田・細川・加藤・藤堂・本多（本物）の後ろに各家の二の備、桃配山の旗本と、南宮山へ向く後詰（浅野）。
//   西軍：宇喜多・小西・石田・大谷（本物）の後ろに二の備・予備。
const P = (x, z) => ({ x: x * 2.5, z: z * 2.5 });
const k06_sekigahara = {
  A: { name: '東軍', facing: -Math.PI / 2, honjin: P(130, 60), mpu: 4, formation: '鶴翼', flag: 'tokugawa', armor: 0x24221f, openAt: 60, attrition: 0.003,
    sonae: [
      { id: 'ii', layer: 'sakite', wing: 'center', men: 3600, taisho: '井伊直政', flag: 'ii', bind: F('ii') },
      { id: 'fuku', layer: 'ichi', wing: 'left', men: 6000, taisho: '福島正則', flag: 'maru', bind: F('fuku') },
      { id: 'kuroda', layer: 'ichi', wing: 'right', men: 5400, taisho: '黒田長政', flag: 'kuroda', bind: F('kuroda') },
      { id: 'todo', layer: 'ichi', wing: 'left', men: 2500, taisho: '藤堂高虎', flag: 'todo', bind: F('todo') },
      { id: 'fuku2', layer: 'ni', wing: 'left', men: 2000, taisho: '', flag: 'maru', at: { x: -190, z: 96 } },
      { id: 'kyogoku', layer: 'ni', wing: 'left', men: 3000, taisho: '京極高知', flag: 'kyogoku', at: { x: -160, z: 176 } },
      { id: 'kuroda2', layer: 'ni', wing: 'right', men: 2000, taisho: '', flag: 'kuroda', at: { x: -160, z: -244 } },
      { id: 'honda', layer: 'yobi', wing: 'center', men: 500, taisho: '本多忠勝', flag: 'honda', bind: F('honda') },
      { id: 'honda2', layer: 'yobi', wing: 'center', men: 2500, taisho: '', flag: 'honda', at: { x: 30, z: -24 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 30000, taisho: '徳川家康', at: P(122, 72) },
      { id: 'asano', layer: 'gozume', wing: 'left', men: 6500, taisho: '浅野幸長', flag: 'asano', hold: true, at: P(170, 96) },
      { id: 'konida', layer: 'konida', wing: 'center', men: 1000, at: P(150, 50) },
    ] },
  B: { name: '西軍', facing: Math.PI / 2, honjin: P(-166, -79), mpu: 4, formation: '鶴翼', flag: 'ishida', armor: 0x2c2a2a, openAt: 60, attrition: 0.003,
    sonae: [
      { id: 'akashi', layer: 'sakite', wing: 'center', men: 8000, taisho: '明石全登', flag: 'ukita', bind: F('akashi') },
      { id: 'konishi', layer: 'ichi', wing: 'left', men: 4000, taisho: '小西行長', flag: 'konishi', bind: F('konishi') },
      { id: 'hira', layer: 'ichi', wing: 'right', men: 1500, taisho: '平塚為広', flag: 'otani', bind: F('otani') },
      { id: 'ukita2', layer: 'ni', wing: 'center', men: 5000, taisho: '', flag: 'ukita', at: { x: -372, z: 72 } },
      { id: 'konishi2', layer: 'ni', wing: 'left', men: 2000, taisho: '', flag: 'konishi', at: { x: -440, z: -26 } },
      { id: 'otani2', layer: 'ni', wing: 'right', men: 2000, taisho: '', flag: 'otani', at: { x: -500, z: 168 } },
      { id: 'ukita_h', layer: 'yobi', wing: 'center', men: 4000, taisho: '宇喜多秀家', flag: 'ukita', bind: F('hide') },
      { id: 'gamou', layer: 'yobi', wing: 'left', men: 2000, taisho: '蒲生郷舎', flag: 'ishida', at: { x: -456, z: -156 } },
      { id: 'mitsu', layer: 'hatamoto', wing: 'center', men: 2000, taisho: '石田三成', flag: 'ishida', bind: F('mitsu') },
      { id: 'konida', layer: 'konida', wing: 'center', men: 800, at: { x: -500, z: -40 } },
    ] },
  honjinView: { A: false, B: false },
};

export const DEPTH_PLANS = { k15_tennoji_okayama, k06_sekigahara };
