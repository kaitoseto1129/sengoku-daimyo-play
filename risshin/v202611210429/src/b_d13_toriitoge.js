// 武田編 十三戦目「鳥居峠の戦い」（天正十年〔1582〕二月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：木曽義昌が織田へ寝返ると、勝頼は今福昌和らを木曽へ送った。木曽勢は織田の援けを得て、雪の鳥居峠で武田勢を破った。
//   これを合図に織田の甲州征伐が始まる（『信長公記』・塩尻市・木祖村の鳥居峠の案内）。主人公は今福の手の足軽。峠を登って木曽勢と戦い、敗れて退く。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const KISO = { flag: 'kiso', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: 160 };
const FUMOTO = { x: 4, z: 96 };      // 峠の上り口
const TOGE = { x: -6, z: 20 };       // 鳥居峠の頂（木曽勢の柵）
const YOKO = { x: 46, z: 40 };       // 峠の脇の尾根（伏せ）
const NOKI = { x: 0, z: 140 };       // 退き口

export const d13_toriitoge = lightBattle({
  id: 'd13_toriitoge',
  date: '天正十年（1582）二月　雪　信濃国 鳥居峠',
  intro: '木曽義昌が織田に寝返った。今福昌和の手と共に雪の鳥居峠を登り、木曽勢を討て。',
  history: '天正十年（1582）二月、木曽義昌が織田へ寝返ると、勝頼は今福昌和らを木曽へ送った。木曽勢は織田の援けを得て、雪の鳥居峠で武田勢を破った。これを合図に、織田信長の甲州征伐が始まる。',
  sides: { a: { name: '今福昌和の手', mon: 'takeda', faction: 'takeda' }, b: { name: '木曽義昌の手', mon: 'kiso', faction: 'kiso' } },
  force: { a: 3000, b: 3000 },
  allyLook: TAKEDA, foeLook: KISO,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1582, time: 'day', snow: 0.5, winter: true, overcast: true, fogFar: 320,
    hills: [[0, 10, 60, 30], [60, 40, 40, 22], [-70, 40, 50, 20], [0, 160, 40, 6]],
    trees: 640, tufts: 900,
  },
  allies: [
    { name: '今福昌和の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 8 }, dmg: 0.25, list: [busho('今福昌和'), uS(4), uA(16)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 12, z: SPAWN.z - 4 }, dmg: 0.25, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['今福昌和', '木曽の裏切り者を討ち、峠を押さえる', 3],
      ['組頭', '雪で足が取られる。列を乱すな', 2.8]] },
    { kind: 'move', at: FUMOTO, label: '峠の上り口', obj: '雪の道を峠の上り口まで進む', r: 12,
      say: [['物見', '峠の上に木曽の旗！', 2.6]] },
    { kind: 'fight', at: TOGE, obj: '峠の頂へ攻め上り、木曽勢の柵の前の兵を討つ', title: '鳥居峠', sub: '峠の上から木曽勢が槍を揃える',
      say: [['木曽の侍', '甲斐の者を峠から落とせ！', 2.6]],
      foes: [
        { name: '木曽の柵の兵', from: { x: TOGE.x, z: TOGE.z - 12 }, list: [uS(5), uA(35)] },
        { name: '木曽の鉄砲', from: { x: TOGE.x + 12, z: TOGE.z - 18 }, list: [uG(7)] }],
      reward: '峠の柵の前で戦った' },
    { kind: 'fight', at: YOKO, obj: '脇の尾根から下りて来た伏せを押し返す', title: '伏せ', sub: '織田の援けの兵が尾根の陰から',
      say: [['物見', '横の尾根から織田の旗！', 2.8], ['今福昌和', '囲まれる前に押し返せ！', 2.8]],
      foes: [{ name: '尾根の伏せ', from: { x: YOKO.x + 10, z: YOKO.z - 10 }, list: [uS(6), uA(35)] }],
      reward: '尾根の伏せを押し返した' },
    { kind: 'hold', at: NOKI, label: '退き口', obj: '退き口で追う木曽勢を食い止め、味方を峠から下ろす', r: 18, dur: 60,
      title: '退き', sub: '峠は落とせなかった',
      say: [['今福昌和', '退け！　この雪では峠は取れぬ', 3]],
      waves: [{ t: 8, say: ['木曽義昌', '追え！　甲斐へ追い落とせ！'], foes: [{ name: '追う木曽勢', from: { x: NOKI.x, z: NOKI.z - 40 }, list: [busho('木曽義昌'), uS(5), uA(32)] }] }],
      reward: '退き口で味方を下ろした' },
  ],
  win: {
    banner: '鳥居峠 退き口を守る', sub: '峠は木曽勢の手に。織田の甲州征伐が始まる', award: '退き口で味方を下ろした',
    say: [['使番', '織田信忠の大軍が、伊那口から攻め入ったと！', 3.2],
      ['組頭', '甲斐が、攻められる番か', 3]],
  },
});
export default d13_toriitoge;
