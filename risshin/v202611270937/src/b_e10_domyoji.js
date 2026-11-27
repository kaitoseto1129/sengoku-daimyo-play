// 伊達家編 十戦目「道明寺の戦い（大坂夏の陣）」（慶長二十年〔1615〕五月六日）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e10_domyoji.md
//   徳川編の道明寺（b_k13_domyoji.js・docs/fujin/k13_domyoji.md）の戦場を、伊達の側から遊ぶ物（K651）。濃い霧の朝
//   片倉重綱の鉄砲騎馬隊が、小松山を下った後藤又兵衛の隊と当たる。伊達約1万・後藤約2,800（通説・本の通り）。出所：『貞山公治家記録』（B）・『大坂御陣覚書』（B）
//   仕組み「馬印の勢い」は date_uma.js（共通）。年を取った政宗の最後の戦＝若さの続き（遅れて来た男）：旗は前へ出すが、馬上の鉄砲の足で押す
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { nobori } from './props.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { umaTick as umaT } from './date_uma.js';
import { domyojiField, DOMYOJI_WORLD, DOMYOJI_TIMESLIP, DOMYOJI_AT } from './b_k13_domyoji.js';   // K651：徳川編の道明寺の戦場をそのまま使う（素材は写さない）
// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（b_domyoji.js を手で写した丘と川）をやめ、
//   徳川編 k13 の道明寺（小松山・石川・道明寺の野・誉田八幡・忠輝の陣）を domyojiField で建てる。伊達勢は水野の先手と同じ大和口（東）から寄せる。
//   行き先は道明寺の物差し（DOMYOJI_AT）で置く

const DATE = { flag: 'date', armor: 0x1c1a18 };
const GOTO = { flag: 'toyotomi', armor: 0x2a2624, lace: 0x5a2a1c };
const AT = DOMYOJI_AT;
const SPAWN = { x: AT.start.x + 22, z: AT.start.z + 12 };   // 大和口の伊達勢（水野の先手の後ろ・東）
const KOMA = AT.top;                                        // 小松山の頂（後藤又兵衛）
const FOOT = { x: AT.slope.x + 8, z: AT.slope.z + 6 };      // 小松山の東の麓
const NOGAWA = AT.nogawa;                                    // 道明寺の野（薄田兼相・K652②）
const HONDA = { x: AT.honda.x + 14, z: AT.honda.z - 6 };     // 誉田の手前（真田・毛利が着いた所・K652②）
const WIND = [0.3, 0.1];
const umaTick = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 1 });

export const e10_domyoji = lightBattle({
  id: 'e10_domyoji',
  date: '慶長二十年（1615）五月六日　霧の朝　河内国 道明寺',
  intro: '大坂夏の陣。霧の中、大和口から出た伊達勢の先頭に、片倉重綱の鉄砲騎馬隊が立つ。小松山には後藤又兵衛が待つ。',
  history: '慶長二十年（元和元年）五月六日、河内の道明寺で、後藤又兵衛の隊は濃い霧の朝に小松山へ登った。大和口から進んだ徳川方の先手のうち、伊達政宗の隊では片倉重綱の鉄砲騎馬隊が後藤隊を破った。又兵衛はここで討死した（『貞山公治家記録』・『大坂御陣覚書』）。数は通説で、伊達約一万・後藤約二千八百。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '後藤又兵衛の隊', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 10000, b: 2800 },
  allyLook: DATE, foeLook: GOTO,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: { seed: 1615 },   // 下で徳川編の道明寺の world に置き換える（K651）

  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(10)] },
    { name: '片倉重綱の鉄砲騎馬隊', at: { x: SPAWN.x - 8, z: SPAWN.z - 14 }, list: [busho('片倉重綱'), { type: 'cavalry', n: 6 }, uG(10)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 14 }, list: [busho('伊達成実'), uS(2), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 24 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉重綱', '殿、霧が濃うございます。後藤は小松山に上ったとの知らせ', 3.4],
      ['伊達政宗', '遅れて来た身じゃ。ここで働かねば、いつ働く', 3.4]] },
    { kind: 'move', at: FOOT, label: '小松山の麓', obj: '霧の中を、小松山の東の麓まで進む', r: 14,
      say: [['片倉重綱', '足元に気を付けよ。石川の向こうは見えませぬ', 3.2]] },
    { kind: 'hold', at: FOOT, label: '小松山の麓', obj: '小松山を下る後藤の先手を受け止める', r: 16, dur: 60,
      title: '道明寺', sub: '霧の中、後藤又兵衛の隊が駆け下りる',
      say: [['組頭', '山から来るぞ！　槍を揃えよ！', 3]],
      waves: [
        { t: 6, say: ['後藤の侍', '又兵衛殿に続け！　伊達を押し返せ！'], foes: [{ name: '後藤の先手', from: { x: KOMA.x + 24, z: KOMA.z + 4 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　霧の中でも退くな！'], foes: [{ name: '山田外記の組', from: { x: KOMA.x + 20, z: KOMA.z - 14 }, list: [uS(2), uA(12), uG(2)] }] }],
      reward: '後藤の先手を受け止めた' },
    { kind: 'fight', at: KOMA, limit: 130, obj: '片倉の鉄砲騎馬隊と共に、小松山の後藤又兵衛を崩す', title: '鉄砲騎馬隊', sub: '馬上の鉄砲が霧を割る',
      say: [['片倉重綱', '鉄砲騎馬隊、前へ！　馬上から撃て！', 3.2], ['伊達政宗', '旗を進めよ！　後藤を破る', 3]],
      foes: [{ name: '後藤又兵衛の旗本', from: { x: KOMA.x - 4, z: KOMA.z }, list: [busho('後藤又兵衛', { mustLive: false, invuln: false }), uS(4), uA(16)] },
        { name: '後藤の鉄砲', from: { x: KOMA.x - 6, z: KOMA.z + 14 }, list: [uS(1), uG(5)] }],
      reward: '小松山の後藤隊を崩した' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②（11/25 Sanae・10分）：後藤が討たれた後、石川を渡った道明寺の野で薄田兼相らが戦い、討たれた（『大坂御陣覚書』B）
    { kind: 'fight', at: NOGAWA, limit: 120, obj: '石川を渡り、道明寺の野の薄田兼相の手を崩す', title: '道明寺の野', sub: '遅れて着いた大坂方が、石川の向こうで戦う',
      say: [['片倉重綱', '石川の向こうに薄田の旗！　遅れて着いた大坂方じゃ', 3.2], ['伊達政宗', '浅瀬を渡れ。勢いのあるうちに押せ', 3]],
      foes: [{ name: '薄田兼相の手', from: { x: NOGAWA.x - 8, z: NOGAWA.z + 6 }, list: [busho('薄田兼相', { mustLive: false, invuln: false }), uS(3), uA(14)] }, { name: '大坂方の鉄砲', from: { x: NOGAWA.x - 14, z: NOGAWA.z - 12 }, list: [uS(1), uG(5)] }],
      reward: '道明寺の野で薄田兼相の手を崩した' },
    // K652②：誉田の辺りで真田信繁の手が着き、片倉の手を押し返した。伊達勢は追えず、真田は殿を務めて退いた（『大坂御陣覚書』B）
    { kind: 'hold', at: HONDA, label: '誉田の手前', obj: '誉田から押し返して来る真田信繁の手を受け止める', r: 16, dur: 60, limit: 110,
      title: '真田の手', sub: '赤い具足の真田勢が、誉田から寄せる',
      say: [['片倉重綱', '赤備えじゃ！　真田が着いたぞ！', 3.2], ['伊達政宗', '真田か。これは手強い。馬印のそばで受けよ', 3.2]],
      waves: [{ t: 6, say: ['真田信繁', '伊達の鉄砲騎馬、ここで止める！'], foes: [{ name: '真田信繁の手', from: { x: HONDA.x - 30, z: HONDA.z + 20 }, list: [busho('真田信繁'), uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '毛利勝永の手も来る！'], foes: [{ name: '毛利勝永の手', from: { x: HONDA.x - 34, z: HONDA.z - 10 }, list: [uS(2), uA(12), uG(3)] }] }],
      reward: '誉田の手前で真田の押し返しを受け止めた' },
    // K674（11/26・一戦10任務）：真田・毛利の押し返しの後、伊達勢は石川の西で立て直し、追う大坂方を止めつつ退いた（『大坂御陣覚書』B）
    fightS({ x: HONDA.x + 10, z: HONDA.z + 24 }, '誉田の八幡の前で、毛利勝永の鉄砲衆を討つ', '誉田の鉄砲', '八幡の前に大坂方の鉄砲が並ぶ', [['片倉重綱', '八幡の前じゃ。鉄砲が並んでおる。散って寄れ', 3.2]],
      [foe('毛利の鉄砲衆', HONDA.x - 6, HONDA.z + 40, [uS(1), uG(8)]), foe('毛利の足軽', HONDA.x - 20, HONDA.z + 30, [uS(2), uA(10)])], { reward: '誉田の鉄砲衆を討った', limit: 100 }),
    restS([['組頭', '真田の手が追って来る。石川の渡しまで退いて立て直す', 3.2]]),
    holdS({ x: AT.ishiX + 14, z: 4 }, '石川の渡し', '石川の渡しで、追って来る大坂方を受け止める', '石川の渡し', '大坂方が浅瀬を追う', [['伊達政宗', '渡しで止めよ。足を取られるな', 3]],
      [wave(2, '大坂方の侍', '伊達を逃がすな！　浅瀬で討て！', [foe('追う大坂方', AT.ishiX - 20, -10, [uS(2), uA(12)])]), wave(30, '大坂方の侍', '騎馬も渡れ！', [foe('追う大坂の騎馬', AT.ishiX - 26, 16, [{ type: 'cavalry', n: 4 }, uS(1), uA(6)])])], { dur: 55, limit: 100, reward: '石川の渡しで追手を受け止めた' }),
    moveS({ x: SPAWN.x - 40, z: SPAWN.z - 6 }, '大和口', '大和口まで退き、水野の備の後ろへ付く', [['片倉重綱', '殿、大和口まで退きましょう。水野殿の備が待っておる', 3.2]]),
    fightS({ x: SPAWN.x - 30, z: SPAWN.z + 10 }, '大和口で、退く伊達勢に追いすがる大坂方の先手を討つ', '大和口の殿', '大坂方が退く伊達勢を追う', [['組頭', '追いついて来た！　殿をつとめよ！', 3]],
      [foe('大坂方の先手', SPAWN.x - 70, SPAWN.z + 8, [uS(2), uA(12), uG(2)])], { reward: '大和口で追いすがる先手を討った', limit: 100 }),
    holdS({ x: SPAWN.x - 6, z: SPAWN.z - 2 }, '大和口の陣', '大和口の陣で、日の暮れまで備えを固める', '大和口の陣', '陣を固めて夜を迎える', [['伊達政宗', '今日はここまでじゃ。陣を固めよ', 3]],
      [wave(2, '大坂方の侍', '最後に一太刀！', [foe('大坂方の殿', SPAWN.x - 60, SPAWN.z - 14, [uS(2), uA(10)])])], { dur: 40, limit: 90, reward: '大和口の陣を固めた' }),
  ],
  // K651：徳川編の道明寺の濃い霧（見通し五十歩）を晴らす（徳川編の update と同じ速さ）
  // K718（11/27 クラウドす・紙 date15_spec ⑦⑧と見せ場「霧が薄れる。山の向こうから赤い真田勢の旗が現れる」）：
  //   前は rt.world.fogFar（無い値）を見ていて霧が一度も晴れなかった（霧は rt.world.def.fogFar・world_update.js）。
  //   ①〜⑥（麓の受け・小松山の後藤）は濃い霧のまま、後藤を崩した後（段3 道明寺の野から）に晴らす。
  //   誉田の段（段4）に入ったら、誉田の向こうの丘の陰から真田の赤い幟の列が十二本、八秒かけてせり上がる（形は props.js の幟の束）
  update(rt, dt) {
    umaTick(rt, dt);
    const W = rt.world.def, F = rt.flags, st = F.step ?? 0;
    if (st >= 3 && W.fogFar < 230) { W.fogFar = Math.min(230, W.fogFar + dt * 10); W.mistFar = Math.min(95, (W.mistFar ?? 40) + dt * 3); }
    if (st >= 4 && !F._sanadaNb && rt.scene) {
      F._sanadaNb = { t: 0, list: [] };
      for (let i = 0; i < 12; i++) {
        const x = HONDA.x - 52 - (i % 2) * 4 + Math.sin(i * 2.7) * 1.5, z = HONDA.z - 22 + i * 4.2;
        try { const nb = nobori(rt.world, x, z, 'sanada', 5.2); nb.userData.y0 = nb.position.y; nb.position.y -= 7; rt.scene.add(nb); F._sanadaNb.list.push(nb); } catch (e) { break; }
      }
    }
    const S = F._sanadaNb;
    if (S && S.t < 1) {
      S.t = Math.min(1, S.t + dt / 8);
      S.list.forEach((nb, i) => { const k = Math.max(0, Math.min(1, S.t * 1.6 - (i % 4) * 0.15)), e = k * k * (3 - 2 * k); nb.position.y = nb.userData.y0 - 7 * (1 - e); });
    }
  },
  win: {
    banner: '道明寺、後藤隊を破る', sub: '片倉の鉄砲騎馬隊が霧の小松山を抜いた。遅れて来た男の最後の戦', award: '道明寺で後藤又兵衛の隊を破った',
    say: [['片倉重綱', '又兵衛殿、討死とのこと', 3.2],
      ['伊達政宗', '若い頃の勢いは、まだ消えておらぬな', 3.4]],
  },
});
e10_domyoji.camPull = 1.6;
// K651：徳川編の道明寺の地面・小松山・石川・野と道をそのまま使う（getter も写すため descriptor ごと）
e10_domyoji.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(DOMYOJI_WORLD));
e10_domyoji.timeslip = DOMYOJI_TIMESLIP;
// 戦場を建てる（徳川編の道明寺と同じ所）→ 軽い型の setup（伊達の組・段）
{ const s0 = e10_domyoji.setup; e10_domyoji.setup = function* (rt) { yield* domyojiField(rt); s0.call(this, rt); }; }
export default e10_domyoji;
