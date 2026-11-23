// 武田編 十戦目「長篠城攻め」（天正三年〔1575〕五月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：勝頼は奥平信昌が五百で籠る長篠城を一万五千で囲んだ。城は寒狭川（豊川）と大野川の合わさる崖の上。武田は瓢郭・野牛郭へ寄せ、
//   金掘りで塀を崩し、竹束で鉄砲を防いで攻めた。城の鳥居強右衛門は囲みを抜けて岡崎へ援軍を頼み、戻って捕らえられ、城へ「援軍は来る」と叫んで磔にされた
//   （『信長公記』『三河物語』・新城市の長篠城址史跡保存館の案内）。主人公は寄せ手の足軽。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

// 11/21 cloud-10（章の通し九回目：組の無い本人が最後の段の大きな組に倒れた）：最後の段の組を今日厚くした（1.6倍）前の数に戻す（d14 は討てない河尻を討てる組頭に）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { withCastle } from './light_castle.js';
import { NAGASHINO_PLAN } from './castles/nagashino.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 150 };
const RIVER = [[-220, -110], [-90, -104], [0, -112], [90, -102], [220, -108]];   // 寒狭川と大野川の合わさる所（城の南の崖の下）
const TAKETABA = { x: 6, z: 82 };    // 竹束を並べる所（大手の前の野）
const HYOTAN = { x: -46, z: 30 };    // 瓢郭の塀
const YAGYU = { x: 50, z: 26 };      // 野牛郭の口
const HONMARU = { x: 0, z: -40 };    // 本丸の前（打って出の口）

// 11/21 クラウド35（K563 ③の質）：長篠城の縄張りを置く（castles/nagashino.js・出所 docs/battle_refs/nagashino.md）。門は本物、櫓・館は遠景の軽い形
export const d10_nagashinojo = withCastle(lightBattle({
  id: 'd10_nagashinojo',
  date: '天正三年（1575）五月　梅雨の晴れ間　三河国 長篠城',
  intro: '奥平の城兵五百が、川の崖の上の長篠城に籠っている。竹束で鉄砲を防ぎ、瓢郭と野牛郭の塀へ寄せよ。',
  history: '天正三年（1575）五月、武田勝頼は奥平信昌の籠る長篠城を一万五千で囲んだ。武田は瓢郭・野牛郭へ寄せて金掘りで塀を崩したが、城は持ちこたえた。城の鳥居強右衛門は囲みを抜けて岡崎へ援軍を頼み、戻って捕らえられ、城へ援軍の来ることを叫んで討たれた。数日の後、織田・徳川の大軍が設楽原に着く。',
  sides: { a: { name: '武田勝頼の寄せ手', mon: 'takeda', faction: 'takeda' }, b: { name: '奥平信昌の城兵', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 15000, b: 500 },
  allyLook: TAKEDA, foeLook: TOKU,
  minutes: 6,
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し：組の無い足軽の本人が倒れる回があった）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1575, time: 'day', wetStart: 0.55, fogFar: 420,
    river: RIVER, riverW: 24, riverDepth: 1.1,
    hills: [[0, -50, 52, 22], [-120, 10, 70, 18], [120, 0, 70, 16], [0, 130, 50, 6]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：竹束を並べる所・瓢郭の塀・野牛郭の口・本丸の前 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, 150], [6, 82], [-46, 30], [50, 26], [0, -40]], w: 3 }],
    groves: [{ x: -120, z: 10, r: 30, n: 30 }, { x: 120, z: 0, r: 30, n: 30 }],
    trees: 460, tufts: 1700,
  },
  allies: [
    { name: '武田信豊の手', at: { x: SPAWN.x - 12, z: SPAWN.z - 8 }, dmg: 0.25, list: [busho('武田信豊'), uS(4), uA(16)] },
    { name: '小山田信茂の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, dmg: 0.25, list: [busho('小山田信茂'), uS(3), uA(14)] },
    { name: '竹束の鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z + 8 }, dmg: 0.25, list: [uS(1), uG(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田信豊', '城の鉄砲は塀の狭間から撃ってくる。竹束を楯に寄せよ', 3.2],
      ['組頭', '瓢郭の塀を崩せば、本丸は裸じゃ', 3]] },
    { kind: 'hold', at: TAKETABA, label: '竹束の列', obj: '竹束の列で城の鉄砲を受け、打って出る城兵を押し返す', r: 16, dur: 65,
      title: '竹束', sub: '城の狭間から鉄砲が鳴る',
      say: [['組頭', '竹束の陰を離れるな！', 2.8]],
      waves: [
        { t: 6, say: ['奥平の侍', '寄せ手を追い払え！'], foes: [{ name: '大手の打って出', from: { x: TAKETABA.x, z: TAKETABA.z - 28 }, list: [uS(5), uA(35)] }] },
        { t: 30, say: ['物見', '塀の上に鉄砲衆！'], foes: [{ name: '塀の上の鉄砲', from: { x: TAKETABA.x - 14, z: TAKETABA.z - 34 }, list: [uG(7)] }] }],
      reward: '竹束の列を保った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を継げ、傷を縛れ。次が来るぞ', 2.8]] },   // 11/21 cloud-10（章の通し）：段の間の手当ての一息（41 の d13 と同じ形）
    { kind: 'fight', at: HYOTAN, obj: '瓢郭の塀へ寄せ、塀の内の城兵を討つ', title: '瓢郭', sub: '金掘りが塀の下を崩した',
      say: [['金掘りの頭', '塀の下を掘り抜いた！　今ぞ！', 3], ['奥平の侍', '瓢郭を渡すな！', 2.6]],
      foes: [
        { name: '瓢郭の守り', from: { x: HYOTAN.x + 6, z: HYOTAN.z - 12 }, list: [uS(5), uA(35)] },
        { name: '瓢郭の弓', from: { x: HYOTAN.x - 10, z: HYOTAN.z - 18 }, list: [uB(6)] }],
      reward: '瓢郭の塀を破った' },
    { kind: 'fight', at: YAGYU, obj: '野牛郭の口で、打って出た奥平の手を押し戻す', title: '野牛郭', sub: '城兵が野牛郭の口から打って出る',
      say: [['小山田信茂', '野牛郭の口が開いた！　付け入れ！', 3]],
      foes: [{ name: '野牛郭の打って出', from: { x: YAGYU.x, z: YAGYU.z - 14 }, list: [uS(6), uA(35)] }],
      reward: '野牛郭の打って出を押し戻した' },
    { kind: 'hold', at: HONMARU, label: '本丸の前', obj: '本丸の前で囲みを保ち、城兵の最後の打って出を受ける', r: 16, dur: 60,
      title: '囲み', sub: '城の兵糧は尽きかけている',
      say: [['物見', '城から一人、川を潜って抜けた者があったと！', 3.2]],
      waves: [{ t: 8, say: ['奥平信昌', '援軍は来る！　持ちこたえよ！'], foes: [{ name: '奥平信昌の手', from: { x: HONMARU.x, z: HONMARU.z - 20 }, list: [uS(5), uA(20)] }] }],
      reward: '長篠城の囲みを保った' },
  ],
  win: {
    banner: '長篠城 囲みを保つ', sub: '城は落ちぬまま、織田・徳川の大軍が設楽原に着いた', award: '長篠城の囲みを保った',
    say: [['使番', '織田・徳川の大軍が、設楽原の連吾川の向こうに柵を結んでおりますと', 3.4],
      ['武田勝頼', '城は後じゃ。設楽原で信長と家康を討てば、この戦は終わる', 3.4]],
  },
}), { plan: NAGASHINO_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, realGates: true });
export default d10_nagashinojo;
