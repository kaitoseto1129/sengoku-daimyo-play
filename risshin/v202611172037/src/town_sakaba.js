// ======================================================================
// 酒場（K308 要件27〜28）：酒屋の土間で兵が飲んでいる。二十文で一杯飲むと、兵の噂が聞ける。
//   噂は正式な知らせではなく、中には間違いもある（三つに一つほど、外れの噂が混じる。どれが外れかは言わない）。
//   回復の場ではない（息は戻さない）。
// ======================================================================
import { allyGroup } from './bhelp.js';

// 外れの噂（その戦で本当には起きない・言い過ぎ・取り違え）。無い戦は下の「どこでも」から
const FALSE = {
  okehazama: ['今川は十万の兵で来るそうな。尾張は一日で呑まれるぞ', '殿はもう今川に下る使いを出したらしい'],
  moribe: ['斎藤の兵は皆、鉄砲を持っておるそうじゃ'],
  sunomata: ['墨俣の砦は、もう出来上がっておるらしいぞ'],
  inabayama: ['稲葉山の城には、抜け道が十もあるそうな'],
  kanegasaki: ['朝倉はもう一乗谷を捨てて逃げたそうじゃ'],
  anegawa: ['浅井は川を渡らず、城に籠もるらしい'],
  mikatagahara: ['武田は甲斐へ引き揚げるそうな。戦は無いと聞いたぞ'],
  shitaragahara: ['武田の騎馬は、鉄砲の玉をはじく鎧を着ておるそうじゃ'],
  honnoji: ['明智様は中国へ向かうと聞いたぞ'],
};
const ANY_FALSE = ['武田の騎馬は一騎で十人を蹴散らすそうな', '柴田様が北へ向かうらしい', '敵の大将は病でもう死んだという話じゃ', '次の戦は和睦で終わるそうな。槍は要らんとさ'];
const ANY_TRUE = ['槍は揃えて突くもんじゃ。一人で前へ出た者から死ぬ', '鉄砲は雨に弱い。火縄が湿ると撃てんそうな'];

// door：酒屋の表の戸口（町の通り側）。face：店の表の x（ここより -x が店の中）
export function sakabaSetup(rt, { door, face, rumors = [], battleId = '' }) {
  if (!door) return;
  const inX = face - 0.9;   // 酒の土間（表から一間ほど。奥は襖の座敷）
  for (const [dz, h] of [[-2.2, 0.4], [2.4, Math.PI - 0.4]]) {
    const g = allyGroup(rt, { name: '飲む足軽', anchor: { x: inX - 0.2, z: door.z + dz }, facing: h, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type: 'ashigaru', n: 1, o: { flag: null, invuln: true, weapon: 'none', hat: dz < 0 ? 'hachimaki' : 'none' } }]);
    if (g.units[0]) { g.units[0].name = '飲む足軽'; g.units[0].civ = true; }
  }
  const trueL = rumors.length ? rumors : ANY_TRUE;
  const falseL = FALSE[battleId] || ANY_FALSE;
  const S = rt.flags.sakaba = { n: 0, readyAt: 0, heard: [] };
  // 噂は札で出す（店の中は戸口の「外へ出る」の札が出ていて、字幕が待たされるため）。待って一番上が選ばれても銭は減らない
  const drink = () => {
    if (rt.flags.heat || rt.t < S.readyAt) return;
    S.readyAt = rt.t + 1;
    const G = rt.G, coins = Math.max(0, Math.round((G.kan || 0) * 1000));
    if (coins < 20) { rt.choose(`酒屋の主「一杯二十文じゃ。あと${20 - coins}文足りん」`, [{ label: '店を出る' }], () => {}, 20); return; }
    G.kan = (coins - 20) / 1000;
    const lie = S.n % 3 === 1;   // 三つに一つは外れの噂
    const L = lie ? falseL : trueL;
    const text = L[Math.floor(S.n / (lie ? 3 : 1.5)) % L.length];
    S.n++; S.heard.push({ text, lie });
    rt.choose(`飲む足軽「${text}」`, [{ label: '杯を置く' }, { label: 'もう一杯飲む（20文）' }], (k) => { if (k === 1) rt.after(0.2, drink); }, 30);
  };
  rt.addInteract('sakaba-drink', { x: inX, z: door.z }, '飲む　酒一杯（20文）　兵の噂を聞く', () => { if (!rt.choice) drink(); }, { r: 2.4 });
}
