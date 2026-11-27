// 今川家編 六戦目「福谷城の戦い」（弘治二年〔1556〕三月・三河国 福谷城）。軽い型・K647（docs/house_imagawa.md ⑥。善徳寺の会盟の替わり）
//   史実：三河の国人が今川に背いた三河忩劇のさなか、尾張の柴田勝家が今川方の福谷城を攻めたが、城方が打って出て押し返した（みよし市の解説 C・『三河物語』B の三河忩劇。年と細部は諸説＝推）。
//   城の外の味方の帯を保ちながら、門の前で柴田を受け止める。
import { uS, uA, uB, busho } from './light_battle.js';
import { gauss } from './bhelp.js';
import { yagura } from './props.js';
import { imagawaBattle, IMAGAWA, ODA } from './b_i_common.js';

const SPAWN = { x: -60, z: 40 }, FUKA = { x: -80, z: 50 }, GATE = { x: -30, z: 22 }, HON = { x: -100, z: 62 }, ATO = { x: -140, z: 80 };
const FACE = (3 * Math.PI) / 4;
const height = (x, z) => 2.5 * Math.sin(x * 0.02 + 2) * Math.cos(z * 0.021) + 12 * gauss(x, z, FUKA.x, FUKA.z, 1400);

export const i06_fukaya = imagawaBattle({
  id: 'i06_fukaya',
  date: '弘治二年（1556）三月　三河国 福谷城',
  intro: '三河の国人が次々に背いた。尾張の柴田勝家が、今川方の福谷城へ攻めて来る。あなたは城を守る足軽。',
  history: '弘治二年（1556）ごろ、三河では今川に背く国人が相次いだ（三河忩劇）。尾張の柴田勝家が今川方の福谷城を攻めたが、城方は打って出て柴田を押し返したと伝わる（みよし市の解説 C。年と細部は諸説）。',
  sides: { a: { name: '福谷城の今川方', mon: 'imagawa', faction: 'imagawa' }, b: { name: '柴田勝家の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 800, b: 2000 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1556, time: 'night', fogFar: 260 },
  allies: [
    { name: '門の前の手', at: { x: GATE.x - 6, z: GATE.z + 6 }, face: FACE, list: [busho('酒井忠次'), uS(3), uA(8)] },
    { name: '城の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  hon: HON, foeFlag: 'oda', foeFlags: [{ x: 60, z: -30 }, { x: 70, z: -20 }],
  thin: [2],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['見張り', '真っ暗じゃ。林の方で、枝の折れる音がする……何も見えぬ', 3.4], ['酒井忠次', '足音だけが近づく。柴田が来る。門の前で受け止め、城を守る', 3.4], ['組頭', '城の本隊と門の手の帯を切らすな', 3.2]] },
    { kind: 'move', at: GATE, label: '門の前', obj: '門の前に出て、柴田を待つ', r: 16, max: 80,
      say: [['組頭', '門の前に槍を並べよ', 3]] },
    { kind: 'hold', at: GATE, label: '門の前', obj: '門の前で、柴田の寄せを受け止める', r: 16, dur: 70,
      title: '柴田の寄せ', sub: '尾張の兵が門へ押し寄せる',
      say: [['酒井忠次', '一歩も退くな。帯が細うなったら、城から寄せさせよ', 3.2]],
      waves: [
        { t: 6, say: ['柴田の侍', '福谷を落とせ！　門を破れ！'], foes: [{ name: '柴田の先手', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [uS(3), uA(12), uB(2)] }] },
        { t: 34, say: ['組頭', '横からも来た！'], foes: [{ name: '柴田の二の手', from: { x: GATE.x + 30, z: GATE.z + 30 }, list: [uS(2), uA(8)] }] },
      ], reward: '門の前で柴田の寄せを受け止めた' },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '打って出て、柴田の旗本を押し返す', title: '打って出る', sub: '柴田勝家の旗本', max: 120, limit: 110,
      say: [['酒井忠次', '今じゃ、打って出よ！', 3]],
      foes: [{ name: '柴田の旗本', from: { x: 40, z: -20 }, list: [busho('柴田勝家', { horse: true }), uS(4), uA(10)] }],
      reward: '打って出て柴田を押し返した' },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '柴田は退かぬ。二の手をまとめて、もう一度門へ寄せまする', 3.2], ['酒井忠次', '門へ戻れ。もう一度だけ受け切れ', 3]] },
    { kind: 'hold', at: GATE, label: '門の前', obj: '門の前へ戻り、柴田の二の寄せを受け止める', r: 16, dur: 70, title: '二の寄せ', sub: '柴田の兵が門へ押し寄せる',
      say: [['組頭', '城の帯を太く保て。門の手が切れれば、城が落ちる', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '柴田の二の手', from: { x: GATE.x + 40, z: GATE.z - 30 }, list: [{ type: 'samurai', n: 1, o: { name: '柴田の組頭' } }, uS(3), uA(14)] }] },
        { t: 32, say: ['見張り', '弓じゃ！　伏せよ'], foes: [{ name: '柴田の弓', from: { x: GATE.x + 50, z: GATE.z - 10 }, list: [uS(1), uB(7), uA(4)] }] }],
      reward: '門の前で柴田の二の寄せを受け止めた' },
    { kind: 'fight', at: { x: 40, z: -20 }, obj: '退く柴田の殿を追い、城から遠ざける', title: '追い', sub: '柴田の殿が退く道を塞ぐ', max: 120, limit: 120,
      say: [['酒井忠次', '追え。じゃが帯が切れたら戻れ', 3]],
      foes: [{ name: '柴田の殿', from: { x: 50, z: -30 }, list: [busho('柴田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }],
      reward: '柴田の殿を追い払った' },
    { kind: 'move', at: { x: GATE.x - 6, z: GATE.z + 6 }, label: '門の前', obj: '帯をたどって門へ戻る', r: 14, max: 90 },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: GATE, label: '門の前', obj: '門の前で、夜に忍び寄る柴田の乱破を払う', r: 16, dur: 60, title: '夜の門', sub: '日が暮れた',
      say: [['組頭', '篝火の外に目を凝らせ', 3]],
      waves: [
        { t: 3, foes: [{ name: '柴田の乱破', from: { x: GATE.x + 30, z: GATE.z - 40 }, list: [uS(2), uA(10)] }] },
        { t: 28, say: ['見張り', '堀の脇からも！'], foes: [{ name: '堀の乱破', from: { x: GATE.x - 30, z: GATE.z - 30 }, list: [uS(2), uA(8)] }] }],
      reward: '夜の門を守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'hold', at: { x: GATE.x - 20, z: GATE.z + 24 }, label: '門の前で、昼', obj: '門の前で、昼の間の柴田の物見の手を受け止める', r: 16, dur: 45,
      say: [['見張り', '柴田の物見が寄る！　門を閉ざせ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '柴田の物見の手', from: { x: GATE.x - 8, z: GATE.z + 12 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '柴田の物見の手', from: { x: GATE.x - 34, z: GATE.z + 38 }, list: [uS(2), uA(7)] }] }],
      reward: '昼の門の前を守った' },
    { kind: 'fight', at: { x: GATE.x + 30, z: GATE.z - 10 }, obj: '田の中で、刈り入れを襲う柴田の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '百姓の刈り入れを守れ。追い払え', 3.2]],
      foes: [{ name: '田を襲う柴田の足軽', from: { x: GATE.x + 42, z: GATE.z - 22 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '田の刈り入れを守った' },
    { kind: 'fight', at: { x: GATE.x - 10, z: GATE.z + 30 }, obj: '裏の山道で、回り込む柴田の弓を討つ', max: 100, limit: 90,
      say: [['組頭', '裏へ回る弓がいる。道を塞げ', 3.2]],
      foes: [{ name: '山道の柴田の弓', from: { x: GATE.x + 2, z: GATE.z + 18 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '裏の山道を塞いだ' },
    // K656 K652⑥ 逸話の段（柴田勝家が福谷城を攻めたが、城方の押し返しにあったと伝わる（みよし市の解説 C・諸説））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: { x: GATE.x + 6, z: GATE.z - 8 }, obj: '打って出て柴田勝家の先手を押し返す', title: '福谷城の門', sub: '柴田勝家、門に寄せる', max: 100, limit: 100,
      say: [['柴田勝家', '福谷の城、ひと揉みに落とせ！', 3], ['組頭', '勝家の槍を、門の前で止めよ！', 3], ['見張り', '東の空が白んで来た。柴田の兵が、林へ退き始めた', 3.2]],
      foes: [{ name: '柴田勝家', from: { x: GATE.x + 6 + 12, z: GATE.z - 8 + -14 }, list: [busho('柴田勝家', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '柴田勝家を押し返した' },
  ],
  win: { banner: '福谷城', sub: '城を守り抜いた', award: '福谷城を守り、柴田勝家を押し返した', say: [['酒井忠次', '柴田が退いた。城は守れた', 3.4]] },
  props(rt) { rt.scene.add(yagura(rt.world, FUKA.x - 4, FUKA.z + 4)); },
  land: {
    height, muddy: 0.15, groundHalf: 400, moveLim: 360,
    paths: [[[-200, 110], [-80, 50], [-30, 22], [70, -30]]],
    treeDensity: () => 0.8, clear: (x, z) => [SPAWN, FUKA, GATE, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 22), trees: 420, tufts: 1700,
  },
});
export default i06_fukaya;
