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
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1568, time: 'day', overcast: true, fogFar: 320 },
  allies: [
    { name: '今川の先手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('庵原忠胤'), uS(3), uA(8)] },
    { name: '氏真様の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'takeda', foeFlags: [{ x: TOGE.x + 40, z: TOGE.z - 40 }, { x: TOGE.x + 52, z: TOGE.z - 30 }],
  thin: [1, 2],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['庵原忠胤', '峠で武田を止める。ここを抜かれれば、駿府じゃ', 3.4], ['組頭', '帯を見よ。今日は細る。走れ', 3.2]] },
    { kind: 'move', at: TOGE, label: '薩埵峠', obj: '細った帯をたどり、本隊を寄せながら峠へ上る', r: 16, max: 100,
      say: [['組頭', '本隊が来ぬ。走って寄せと伝えよ', 3.2]] },
    { kind: 'hold', at: TOGE, label: '薩埵峠', obj: '峠で武田の先手を受け止める', r: 16, dur: 70,
      title: '武田の先手', sub: '味方の重臣が次々に寝返る',
      say: [['庵原忠胤', '後ろの備が動かぬ……寝返ったか。我らだけでも止めよ', 3.4]],
      waves: [
        { t: 6, say: ['武田の侍', '今川は崩れたぞ！　峠を越えよ！'], foes: [{ name: '武田の先手', from: { x: TOGE.x + 36, z: TOGE.z - 30 }, list: [busho('山県昌景', { horse: true }), uS(4), uA(12)] }] },
        { t: 36, say: ['組頭', '横の尾根からも来た！'], foes: [{ name: '武田の別手', from: { x: TOGE.x + 30, z: TOGE.z + 30 }, list: [uS(2), uA(8), uG(3)] }] },
      ], reward: '峠で武田の先手を止めた' },
    { kind: 'move', at: { x: -120, z: 70 }, label: '駿府の方', obj: '崩れた軍の殿として、駿府の方へ退く', r: 18, max: 110,
      say: [['庵原忠胤', '軍は崩れた。退け。若殿を掛川へ落とす時を稼ぐ', 3.4]] },
  ],
  win: { banner: '薩埵峠', sub: '殿として退いた', award: '薩埵峠で武田を止め、崩れた軍の殿として退いた', say: [['庵原忠胤', '生きて退いた。若殿は掛川へ向かわれた。我らも追う', 3.4]] },
  land: {
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-260, 120], [-170, 90], [0, 20], [70, -40]]],
    treeDensity: () => 1.1, clear: (x, z) => [SPAWN, TOGE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 500, tufts: 1600,
  },
});
export default i14_satta;
