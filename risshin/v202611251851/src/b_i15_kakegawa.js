// 今川家編 十五戦目「掛川城の戦い」（永禄十二年〔1569〕・遠江国 掛川城）。軽い型・K647（docs/house_imagawa.md ⑥）
//   史実：駿府を追われた今川氏真は掛川城に籠った。徳川家康が城を囲んだが、城主の朝比奈泰朝はおよそ五か月持ちこたえた。五月、和睦で城を明け渡し、氏真は北条を頼って去った。戦国大名の今川はここで終わる（『三河物語』B・掛川市の解説 C）。
//   籠城の戦。大手で徳川の寄せを受け、打って出て押し返し、城へ戻る。
import { uS, uA, uB, uG, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, TOKU } from './b_i_common.js';

const SPAWN = { x: -60, z: 40 }, KAKE = { x: -85, z: 52 }, GATE = { x: -30, z: 22 }, HON = { x: -100, z: 62 }, ATO = { x: -140, z: 80 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2.4 * Math.sin(x * 0.021 + 1.2) * Math.cos(z * 0.02 + 0.6) + 14 * gauss(x, z, KAKE.x, KAKE.z, 1400) + 8 * gauss(x, z, 50, -30, 900);

export const i15_kakegawa = imagawaBattle({
  id: 'i15_kakegawa',
  date: '永禄十二年（1569）　遠江国 掛川城',
  intro: '若殿の氏真様は、掛川城に籠られた。徳川家康が城を囲む。あなたは朝比奈泰朝様の足軽。',
  history: '永禄十二年（1569）、駿府を追われた今川氏真は掛川城に籠った。徳川家康が城を囲んだが、城主の朝比奈泰朝はおよそ五か月持ちこたえた。五月、和睦で城を明け渡し、氏真は北条を頼って去った。戦国大名としての今川家は、ここで終わった（『三河物語』B・掛川市の解説 C）。',
  sides: { a: { name: '掛川城の今川方', mon: 'imagawa', faction: 'imagawa' }, b: { name: '徳川家康の軍', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 3000, b: 8000 }, allyLook: IMAGAWA, foeLook: TOKU,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1569, time: 'day', fogFar: 360 },
  allies: [
    { name: '大手の手', at: { x: GATE.x - 6, z: GATE.z + 6 }, face: FACE, list: [busho('朝比奈泰朝'), uS(3), uA(8)] },
    { name: '氏真様の本丸', at: HON, face: FACE, list: [busho('今川氏真', { horse: false }), uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'tokugawa', foeFlags: [{ x: 50, z: -30 }, { x: 62, z: -22 }],
  thin: [2],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['朝比奈泰朝', '若殿はこの城に籠られた。徳川を一歩も入れるな', 3.4], ['組頭', '大手と本丸の帯を切らすな', 3.2]] },
    { kind: 'move', at: GATE, label: '大手', obj: '大手の前に出て、徳川を待つ', r: 16, max: 80,
      say: [['組頭', '向こうの山に、葵の旗が並んでおる', 3.2]] },
    { kind: 'hold', at: GATE, label: '大手', obj: '大手の前で、徳川の寄せを受け止める', r: 16, dur: 70,
      title: '徳川の寄せ', sub: '囲みは厚い。大手へ押し寄せる',
      say: [['朝比奈泰朝', '持ちこたえよ。帯が細うなったら、本丸から寄せさせよ', 3.2]],
      waves: [
        { t: 6, say: ['徳川の侍', '掛川を落とせ！　大手を破れ！'], foes: [{ name: '徳川の先手', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [uS(3), uA(12), uG(3)] }] },
        { t: 34, say: ['組頭', '堀の脇からも来た！'], foes: [{ name: '徳川の二の手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(8), uB(2)] }] },
      ], reward: '大手で徳川の寄せを受け止めた' },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '打って出て、徳川の陣を押し返す', title: '打って出る', sub: '徳川の付け城の手', max: 120, limit: 110,
      say: [['朝比奈泰朝', '今じゃ、打って出よ！　付け城を焼け！', 3]],
      foes: [{ name: '徳川の付け城の手', from: { x: 40, z: -20 }, list: [busho('石川数正', { horse: true }), uS(4), uA(10)] }],
      reward: '打って出て徳川の陣を押し返した' },
    { kind: 'move', at: { x: GATE.x - 10, z: GATE.z + 10 }, label: '大手', obj: '城へ戻り、若殿のもとへ帰る', r: 14, max: 90,
      say: [['朝比奈泰朝', '戻れ。若殿をお守りするのが我らの役目じゃ', 3.2]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '徳川が天王山に付け城を立て、大手へ大寄せの支度！', 3.2], ['朝比奈泰朝', '大手へ。若殿の城じゃ。渡さぬ', 3]] },
    { kind: 'hold', at: GATE, label: '大手', obj: '大手へ戻り、徳川の大寄せを受け止める', r: 16, dur: 70, title: '大寄せ', sub: '徳川の兵が大手へ押し寄せる',
      say: [['組頭', '大手と本丸の帯を太く保て', 3]],
      waves: [
        { t: 3, foes: [{ name: '徳川の大寄せ', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [{ type: 'samurai', n: 1, o: { name: '徳川の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '鉄砲じゃ！'], foes: [{ name: '徳川の鉄砲', from: { x: GATE.x + 50, z: GATE.z - 10 }, list: [uS(1), uG(5), uA(6)] }] }],
      reward: '大手で徳川の大寄せを受け止めた' },
    { kind: 'fight', at: { x: 50, z: -30 }, obj: '夜に打って出て、天王山の付け城の手を崩す', title: '天王山', sub: '付け城の柵の前', max: 120, limit: 120,
      say: [['朝比奈泰朝', '付け城を崩せば、寄せは遠のく', 3]],
      foes: [{ name: '天王山の付け城の手', from: { x: 50, z: -40 }, list: [busho('徳川の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12), uB(3)] }],
      reward: '天王山の付け城の手を崩した' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: GATE, label: '大手', obj: '大手へ戻り、付け城を崩された徳川の押し返しを受け止める', r: 16, dur: 70, title: '押し返し', sub: '徳川の兵が大手へ戻る',
      say: [['朝比奈泰朝', '五月持てば、徳川も和睦を言い出す', 3]],
      waves: [
        { t: 3, foes: [{ name: '徳川の押し返し', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [{ type: 'samurai', n: 1, o: { name: '徳川の侍' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '騎馬じゃ！'], foes: [{ name: '徳川の騎馬', from: { x: GATE.x + 50, z: GATE.z + 10 }, list: [{ type: 'cavalry', n: 4 }, uS(1), uA(6)] }] }],
      reward: '徳川の押し返しを受け止めた' },
    // K656 K652⑥ 逸話の段（徳川は天王山に陣を築いて掛川城を囲んだ（『三河物語』B））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: { x: GATE.x + 14, z: GATE.z - 10 }, obj: '天王山から夜討ちをかける徳川の酒井忠次を受け止める', title: '掛川城の外', sub: '夜討ち', max: 100, limit: 100,
      say: [['酒井忠次', '掛川の城、夜のうちに揺さぶれ！', 3], ['組頭', '夜討ちじゃ！　門を守れ！', 3]],
      foes: [{ name: '酒井忠次の夜討ち', from: { x: GATE.x + 14 + 12, z: GATE.z - 10 + -14 }, list: [busho('酒井忠次', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '徳川の夜討ちを城の外で退けた' },
  ],
  win: { banner: '掛川城', sub: '城を明け渡し、若殿を守った', award: '掛川城を五か月守り、和睦で若殿を無事に落とした', say: [['朝比奈泰朝', '和睦じゃ。城は明け渡す。若殿は小田原へ。今川の旗は、ここで下ろす', 3.6]] },
  props(rt) { rt.scene.add(yagura(rt.world, KAKE.x - 4, KAKE.z + 4)); },
  land: {
    height, muddy: 0.2, groundHalf: 400, moveLim: 360,
    paths: [[[-200, 110], [-85, 52], [-30, 22], [70, -30]]],
    treeDensity: () => 0.8, clear: (x, z) => [SPAWN, KAKE, GATE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 420, tufts: 1700,
  },
});
export default i15_kakegawa;
