// 今川家編 十四戦目「薩埵峠の戦い」（永禄十一年〔1568〕十二月・駿河国 薩埵峠）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：武田信玄が駿河へ攻め入り、今川氏真は薩埵峠で迎え撃とうとした。だが今川の重臣が次々に武田へ寝返り、軍は戦わずに崩れ、氏真は駿府を捨てて掛川城へ逃れた（『甲陽軍鑑』B・静岡市の解説 C）。
//   帯が切れる戦。峠で武田の先手を止め、崩れた軍の殿として駿府の方へ退く。
import { uS, uA, uB, uG, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { imagawaBattle, IMAGAWA, TAKEDA } from './b_i_common.js';

const SPAWN = { x: -170, z: 90 }, TOGE = { x: 0, z: 20 }, HON = { x: -100, z: 60 }, ATO = { x: -150, z: 82 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 3 * Math.sin(x * 0.02 + 2) * Math.cos(z * 0.02) + 20 * gauss(x, z, TOGE.x + 20, TOGE.z - 30, 1800) + 12 * gauss(x, z, TOGE.x - 20, TOGE.z + 40, 1400);

export const i14_satta = imagawaBattle({
  id: 'i14_satta',
  date: '永禄十一年（1568）十二月　駿河国 薩埵峠',
  intro: '甲斐の武田信玄が、駿河へ攻め込んで来た。薩埵峠で迎え撃つ。あなたは今川の先手の足軽。',
  history: '永禄十一年（1568）十二月、武田信玄が駿河へ攻め入った。今川氏真は薩埵峠で迎え撃とうとしたが、重臣たちが次々に武田へ寝返り、軍は戦う前に崩れた。氏真は駿府を捨て、遠江の掛川城へ逃れた（『甲陽軍鑑』B・静岡市の解説 C）。',
  sides: { a: { name: '今川の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' } },
  force: { a: 15000, b: 12000 }, allyLook: IMAGAWA, foeLook: TAKEDA,
  allyDmg: 0.5, foeDmg: 0.35, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1568, time: 'day', overcast: true, fogFar: 320 },
  allies: [
    { name: '今川の先手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('庵原忠胤'), uS(3), uA(8)] },
    { name: '氏真様の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  fade: [{ i: 2, names: ['後ろの備'] }],
  hon: HON, foeFlag: 'takeda', foeFlags: [{ x: TOGE.x + 40, z: TOGE.z - 40 }, { x: TOGE.x + 52, z: TOGE.z - 30 }],
  thin: [1, 2],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['庵原忠胤', '峠で武田を止める。ここを抜かれれば、駿府じゃ', 3.4], ['組頭', '帯を見よ。今日は細る。走れ', 3.2]] },
    { kind: 'move', at: TOGE, label: '薩埵峠', obj: '細った帯をたどり、本隊を寄せながら峠へ上る', r: 16, max: 100,
      say: [['組頭', '本隊が来ぬ。走って寄せと伝えよ', 3.2]] },
    { kind: 'hold', at: TOGE, label: '薩埵峠', obj: '峠で武田の先手を受け止める', r: 16, dur: 70,
      title: '武田の先手', sub: '味方の重臣が次々に寝返る',
      say: [['庵原忠胤', '後ろの備が動かぬ……寝返ったか。我らだけでも止めよ', 3.4], ['組頭', '旗が……一本、また一本と消えていく。敵に負けたのではない', 3.6]],
      waves: [
        { t: 6, say: ['武田の侍', '今川は崩れたぞ！　峠を越えよ！'], foes: [{ name: '武田の先手', from: { x: TOGE.x + 36, z: TOGE.z - 30 }, list: [busho('山県昌景', { horse: true }), uS(2), uA(6)] }] },
        { t: 36, say: ['組頭', '横の尾根からも来た！'], foes: [{ name: '武田の別手', from: { x: TOGE.x + 30, z: TOGE.z + 30 }, list: [uS(1), uA(4), uG(1)] }] },
      ], reward: '峠で武田の先手を止めた' },
    { kind: 'move', at: { x: -120, z: 70 }, label: '駿府の方', obj: '崩れた軍の殿として、駿府の方へ退く', r: 18, max: 110,
      say: [['庵原忠胤', '軍は崩れた。退け。若殿を掛川へ落とす時を稼ぐ', 3.4]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '瀬名・葛山の衆が武田に寝返った！　軍は総崩れじゃ', 3.2], ['庵原忠胤', 'わしらが殿じゃ。若殿の落ちる間を稼ぐ', 3]] },
    { kind: 'hold', at: { x: -120, z: 70 }, label: '退く道', obj: '退く道で、武田の追手と寝返った兵を受け止める', r: 16, dur: 70, title: '殿', sub: '寝返った兵が背から来る',
      say: [['組頭', '帯は切れておる。ここで固まれ', 3]],
      waves: [
        { t: 3, foes: [{ name: '武田の追手', from: { x: -60, z: 30 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の組頭' } }, uS(2), uA(8)] }] },
        { t: 32, say: ['見張り', '寝返った兵じゃ！　背から来る！'], foes: [{ name: '寝返った兵', from: { x: -170, z: 40 }, list: [uS(1), uA(6)] }] }],
      reward: '退く道で追手を受け止めた' },
    { kind: 'fight', at: { x: -90, z: 40 }, obj: '追手の組頭の手を崩し、追手の足を止める', title: '追手の足', sub: '武田の騎馬が先を行く', max: 120, limit: 120,
      say: [['庵原忠胤', '頭を叩けば、追手は止まる', 3]],
      foes: [{ name: '武田の騎馬', from: { x: -70, z: 20 }, list: [busho('武田の侍大将', { mustLive: false, invuln: false }), { type: 'cavalry', n: 4 }, uS(2), uA(8)] }],
      reward: '武田の追手の足を止めた' },
    { kind: 'move', at: { x: SPAWN.x + 10, z: SPAWN.z - 6 }, label: '駿府への道', obj: '帯をたどり、駿府への道を退く', r: 18, max: 110 },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: { x: SPAWN.x + 10, z: SPAWN.z - 6 }, label: '駿府への道', obj: '駿府への道で、最後に追って来る武田の手を受け止める', r: 16, dur: 60, title: '最後の追手', sub: '駿府はもう近い',
      say: [['庵原忠胤', 'ここを持てば、若殿は掛川へ落ちられる', 3]],
      waves: [
        { t: 3, foes: [{ name: '武田の最後の追手', from: { x: SPAWN.x + 60, z: SPAWN.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '武田の侍' } }, uS(3), uA(12)] }] },
        { t: 30, say: ['見張り', '騎馬じゃ！'], foes: [{ name: '武田の騎馬', from: { x: SPAWN.x + 40, z: SPAWN.z - 60 }, list: [{ type: 'cavalry', n: 4 }, uS(1), uA(6)] }] }],
      reward: '最後の追手を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'rest', dur: 8, heal: 0.8, say: [['組頭', '傷を縛れ。息を整えよ', 3]] },
    { kind: 'fight', at: { x: TOGE.x - 30, z: TOGE.z + 20 }, obj: '峠の道で、寝返りを叫ぶ今川の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '寝返った者がいる。道を開けるな', 3.2]],
      foes: [{ name: '寝返った足軽', from: { x: TOGE.x - 18, z: TOGE.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '寝返った足軽を討った' },
    { kind: 'hold', at: { x: TOGE.x - 60, z: TOGE.z + 40 }, label: '崖の道で、先', obj: '崖の道で、先回りする武田の先手を受け止める', r: 16, dur: 45,
      say: [['見張り', '崖の下を武田が回る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '先回りの武田の先手', from: { x: TOGE.x - 48, z: TOGE.z + 28 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '先回りの武田の先手', from: { x: TOGE.x - 74, z: TOGE.z + 54 }, list: [uS(2), uA(7)] }] }],
      reward: '崖の道を守った' },
    { kind: 'rest', dur: 8, heal: 0.8, say: [['組頭', '傷を縛れ。息を整えよ', 3]] },
    { kind: 'fight', at: { x: TOGE.x - 80, z: TOGE.z + 60 }, obj: '麓の川端で、追って来る武田の弓を討つ', max: 100, limit: 90,
      say: [['組頭', '川端の弓を黙らせよ', 3.2]],
      foes: [{ name: '追う武田の弓', from: { x: TOGE.x - 68, z: TOGE.z + 48 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '麓の川端を押さえた' },
    // K656 K652⑥ 逸話の段（氏真の重臣・葛山氏元ら二十一人が武田に寝返った（『甲陽軍鑑』B））。本人が斬る。字・札・ボタンは足さない
    { kind: 'rest', dur: 8, heal: 0.8, say: [['組頭', '傷を縛れ。息を整えよ', 3]] },
    { kind: 'fight', at: TOGE, obj: '寝返って武田に付いた今川の重臣の手を斬り伏せる', title: '薩埵峠', sub: '重臣の寝返り', max: 100, limit: 100,
      say: [['葛山氏元', '今川の世は終わりじゃ。武田に付く！', 3], ['組頭', '裏切り者を斬れ。若殿を逃がせ！', 3]],
      foes: [{ name: '寝返った家臣', from: { x: TOGE.x + 12, z: TOGE.z + -14 }, list: [busho('葛山氏元', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '寝返った重臣の手を斬り伏せた' },
  ],
  win: { banner: '薩埵峠', sub: '殿として退いた', award: '薩埵峠で武田を止め、崩れた軍の殿として退いた', say: [['庵原忠胤', '生きて退いた。若殿は掛川へ向かわれた。我らも追う', 3.4]] },
  land: {
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [0, 20], [70, -40]]],
    treeDensity: () => 1.1, clear: (x, z) => [SPAWN, TOGE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 500, tufts: 1600,
  },
});
export default i14_satta;
