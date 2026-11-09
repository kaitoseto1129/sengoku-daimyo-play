// ======================================================================
// 関ヶ原の陣立て表（共通の軍勢の厚み army_depth.js に渡す。書き方は docs/army_depth_howto.md）
//   army_depth_plans.js の手本（k06_sekigahara）を元に、docs/generals_toyo_toku_1108.md の必須・出したい武将を各自の備付きで持ち場に散らした。
//   戦のファイルの def.depth に入れる（共通の表より先に読まれる）。人数は史料の目安の中ほど、備の割り振りと置き場は遊びのための復元。
//   西が −x。ゲームの 1 は実の 4m。島津は退き口まで見せない（表に入れない）。小早川・脇坂は寝返りで側が替わるので表に入れず k06/jindate.js が動かす。
//   南宮山（東の奥）の毛利秀元・吉川広家・安国寺恵瓊・長束正家・長宗我部盛親は hold（一日動かない）。押さえに浅野・池田・山内（hold）。
// ======================================================================
const F = (k) => (rt) => rt.flags[k];
const P = (x, z) => ({ x: x * 2.5, z: z * 2.5 });

export const DEPTH = {
  A: { name: '東軍', facing: -Math.PI / 2, honjin: P(130, 60), mpu: 4, formation: '鶴翼', flag: 'tokugawa', armor: 0x24221f, uma: 'ogi', openAt: 60, attrition: 0.003,
    sonae: [
      { id: 'ii', layer: 'sakite', wing: 'center', men: 3600, taisho: '井伊直政', flag: 'ii', bind: F('ii') },
      { id: 'fuku', layer: 'ichi', wing: 'left', men: 6000, taisho: '福島正則', flag: 'mizuno', bind: F('fuku') },
      { id: 'kuroda', layer: 'ichi', wing: 'right', men: 5400, taisho: '黒田長政', flag: 'kuroda', bind: F('kuroda') },
      { id: 'hoso', layer: 'ichi', wing: 'right', men: 5000, taisho: '細川忠興', flag: 'kuyo', bind: F('hoso') },
      { id: 'kato', layer: 'ichi', wing: 'right', men: 3000, taisho: '加藤嘉明', flag: 'sagarifuji', bind: F('kato') },
      { id: 'todo', layer: 'ichi', wing: 'left', men: 2500, taisho: '藤堂高虎', flag: 'todo', bind: F('todo') },
      { id: 'fuku2', layer: 'ni', wing: 'left', men: 2000, taisho: '', flag: 'mizuno', at: { x: -190, z: 96 } },
      { id: 'kyogoku', layer: 'ni', wing: 'left', men: 3000, taisho: '京極高知', flag: 'kyogoku', at: { x: -160, z: 176 } },
      { id: 'kuroda2', layer: 'ni', wing: 'right', men: 2000, taisho: '', flag: 'kuroda', at: { x: -160, z: -244 } },
      { id: 'tanaka', layer: 'ni', wing: 'right', men: 3000, taisho: '田中吉政', flag: 'maru', at: { x: -186, z: -150 } },
      { id: 'kanamori', layer: 'ni', wing: 'center', men: 1100, taisho: '金森長近', flag: 'kanamori', bind: F('kanamori') },
      { id: 'tadayoshi', layer: 'yobi', wing: 'center', men: 3000, taisho: '松平忠吉', flag: 'tokugawa', at: { x: -110, z: -6 } },
      { id: 'honda', layer: 'yobi', wing: 'center', men: 500, taisho: '本多忠勝', flag: 'honda', bind: F('honda') },
      { id: 'honda2', layer: 'yobi', wing: 'center', men: 2500, taisho: '', flag: 'honda', at: { x: 30, z: -24 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 30000, taisho: '徳川家康', at: P(122, 72) },
      // 南宮山の押さえ（毛利が動けば東軍の背を守る。動かないので戦わない）
      { id: 'asano', layer: 'gozume', wing: 'left', men: 6500, taisho: '浅野幸長', flag: 'asano', hold: true, at: P(170, 96) },
      { id: 'ikeda', layer: 'gozume', wing: 'left', men: 4500, taisho: '池田輝政', flag: 'ageha', hold: true, at: P(196, 112) },
      { id: 'yamauchi', layer: 'gozume', wing: 'left', men: 2000, taisho: '山内一豊', flag: 'kashiwa', hold: true, at: P(150, 110) },
      { id: 'konida', layer: 'konida', wing: 'center', men: 1000, at: P(150, 50) },
    ] },
  B: { name: '西軍', facing: Math.PI / 2, honjin: P(-166, -79), mpu: 4, formation: '鶴翼', flag: 'ishida', armor: 0x2c2a2a, openAt: 60, attrition: 0.003,
    sonae: [
      { id: 'akashi', layer: 'sakite', wing: 'center', men: 8000, taisho: '明石全登', flag: 'ukita', bind: F('akashi') },
      { id: 'konishi', layer: 'ichi', wing: 'left', men: 4000, taisho: '小西行長', flag: 'konishi', bind: F('konishi') },
      { id: 'sakon', layer: 'ichi', wing: 'left', men: 1000, taisho: '島左近', flag: 'ishida', bind: F('sakon') },
      { id: 'hira', layer: 'ichi', wing: 'right', men: 1500, taisho: '平塚為広', flag: 'otani', bind: F('otani') },
      { id: 'ukita2', layer: 'ni', wing: 'center', men: 5000, taisho: '', flag: 'ukita', at: { x: -372, z: 72 } },
      { id: 'konishi2', layer: 'ni', wing: 'left', men: 2000, taisho: '', flag: 'konishi', at: { x: -440, z: -26 } },
      { id: 'otani2', layer: 'ni', wing: 'right', men: 2000, taisho: '大谷吉治', flag: 'otani', at: { x: -500, z: 168 } },
      { id: 'ukita_h', layer: 'yobi', wing: 'center', men: 4000, taisho: '宇喜多秀家', flag: 'ukita', bind: F('hide') },
      { id: 'gamou', layer: 'yobi', wing: 'left', men: 2000, taisho: '蒲生郷舎', flag: 'ishida', at: { x: -456, z: -156 } },
      { id: 'mitsu', layer: 'hatamoto', wing: 'center', men: 2000, taisho: '石田三成', flag: 'ishida', bind: F('mitsu') },
      { id: 'konida', layer: 'konida', wing: 'center', men: 800, at: { x: -500, z: -40 } },
      // 南宮山（東の奥・家康の本陣の背）：一日、山の上から動かない（「毛利がいるのに動かない」）
      { id: 'hidemoto', layer: 'gozume', wing: 'right', men: 15000, taisho: '毛利秀元', flag: 'mori', hold: true, at: { x: 566, z: 220 } },
      { id: 'kikkawa', layer: 'gozume', wing: 'right', men: 3000, taisho: '吉川広家', flag: 'mori', hold: true, at: { x: 512, z: 186 } },
      { id: 'ankokuji', layer: 'gozume', wing: 'right', men: 1800, taisho: '安国寺恵瓊', flag: 'mori', hold: true, at: { x: 540, z: 268 } },
      { id: 'natsuka', layer: 'gozume', wing: 'right', men: 1500, taisho: '長束正家', flag: 'maru', hold: true, at: { x: 506, z: 300 } },
      { id: 'chosokabe', layer: 'gozume', wing: 'right', men: 6600, taisho: '長宗我部盛親', flag: 'chosokabe', hold: true, at: { x: 478, z: 330 } },
    ] },
  honjinView: { A: false, B: false },   // 本陣の幕と総大将は戦のファイルが作る
};
