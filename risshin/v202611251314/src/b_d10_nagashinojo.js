// 武田編 十戦目「長篠城攻め」（天正三年〔1575〕五月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：勝頼は奥平信昌が五百で籠る長篠城を一万五千で囲んだ。城は寒狭川（豊川）と大野川の合わさる崖の上。武田は瓢郭・野牛郭へ寄せ、
//   金掘りで塀を崩し、竹束で鉄砲を防いで攻めた。城の鳥居強右衛門は囲みを抜けて岡崎へ援軍を頼み、戻って捕らえられ、城へ「援軍は来る」と叫んで磔にされた
//   （『信長公記』『三河物語』・新城市の長篠城址史跡保存館の案内）。主人公は寄せ手の足軽。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

// 11/21 cloud-10（章の通し九回目：組の無い本人が最後の段の大きな組に倒れた）：最後の段の組を今日厚くした（1.6倍）前の数に戻す（d14 は討てない河尻を討てる組頭に）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { nagaField, NAGA_FIELD, NAGA_WORLD, NAGA_AT } from './b_nagashinojo.js';   // K651：徳川（奥平）の長篠城の戦場をそのまま使う（素材は写さない）
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と castles/nagashino の縄張り）をやめ、
//   織田家編（徳川・奥平の籠城）の長篠城（b_nagashinojo.js）の地形・崖・寒狭川と宇連川・塀と大手門・館・櫓・竹束・井楼・金掘りの穴・鳴子の綱を nagaField で建てる。
//   遊ぶ側を城の外の寄せ手（北の大手の坂から）に入れ替え、行き先は元の戦場の物差し（NAGA_AT）で置く。
//   逸話の段（K652⑥）：宇連川の鳴子の綱で、岡崎から戻る鳥居強右衛門を捕らえる（『信長公記』『三河物語』）。強右衛門は城の対岸で「援軍は来る」と叫んで磔にされた
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'okudaira', armor: 0x2a2622 };
const A = NAGA_AT, GX = A.GATE.x, NZ = A.N_Z;
const SPAWN = { x: GX - 8, z: -76 };                    // 北の坂の下（竹束の列の三十m 手前。遠いと本人だけ先に着いて囲まれた・act bot 11/25）
// 11/25：段の行き先は台地の上の平ら（塀から竹束の列までの十m 余り・高さ十四）に置く。北の坂（二十m で八m 上る）で斬り合わせると、act bot の突きが上下の差で当たらず討ち取り0のまま倒れた
const TAKETABA = { x: GX - 6, z: NZ - 10 };             // 竹束の列を抜けた所（大手道の脇・塀の前）
const KANAHORI = { x: A.kanahori.x - 6, z: A.kanahori.z + 3 };   // 北東の角の外の金掘りの穴の口（台地の東の肩の手前）
// 打って出の組は塀に沿って二十m 余り離れた所（塀の東西の端の前）から寄せる（門の前に出すと本人の四m 先に湧き、act bot が一息に囲まれた）
const OTEMON = { x: GX, z: NZ - 7 };                    // 大手門の前
const KAWA = { x: 68, z: 40 };                          // 城の東の崖下（宇連川へ下りる所）
const NARUKO = { x: 60, z: 57 };                        // 宇連川の鳴子の綱の岸
const CROSS = { x: 16, z: 76.5 };                       // 城の対岸（元の戦で強右衛門の磔の立つ所）
const TAIGAN = { x: 30, z: 58 };                        // 磔の見える岸
export const d10_nagashinojo = lightBattle({
  id: 'd10_nagashinojo',
  date: '天正三年（1575）五月　梅雨の晴れ間　三河国 長篠城',
  intro: '奥平の城兵五百が、川の崖の上の長篠城に籠っている。竹束で鉄砲を防ぎ、北の塀と大手門へ寄せよ。',
  history: '天正三年（1575）五月、武田勝頼は奥平信昌の籠る長篠城を一万五千で囲んだ。武田は北の大手と塀へ寄せ、金掘りで塀の下を崩したが、城は持ちこたえた。城の鳥居強右衛門は囲みを抜けて岡崎へ援軍を頼み、戻る所を捕らえられ、城の対岸で援軍の来ることを叫んで磔にされた。数日の後、織田・徳川の大軍が設楽原に着く。',
  sides: { a: { name: '武田勝頼の寄せ手', mon: 'takeda', faction: 'takeda' }, b: { name: '奥平信昌の城兵', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 15000, b: 500, la: 0.04, lb: 0.3 },   // K652①：城は落ちず、城兵の損は二、三割（寄せ手の損は一万五千のうち数百）
  allyLook: TAKEDA, foeLook: TOKU,
  minutes: 10,
  playerTaken: 0.28,   // 11/25 K651：二度目の act bot も金掘りの段で侍の馬に囲まれ倒れた→その段の組を小さく（倍率は player_hurt.js で八割より下がらない）。塀の狭間の鉄砲と弓が坂の寄せ手を始終撃つので 0.45→0.35（act bot：金掘りの段で倒れた）。11/21 cloud-10（章の通し：組の無い足軽の本人が倒れる回があった）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },   // 南（城）を向く
  foeDmg: 0.35,   // 11/25 K651：塀の前の平らな台地で、打って出る城兵に act bot が八度倒れた（討ち取り0〜12。前の別の戦場の d10 も今日の bot で214秒に倒れる）。城兵の刃を軽い型の既定 0.6→0.35（数と段は変えない）
  world: { seed: 1575 },   // 下で徳川の長篠城の world に置き換える（K651）
  allies: [
    { name: '武田信豊の手', at: { x: SPAWN.x - 12, z: SPAWN.z - 8 }, dmg: 0.6, list: [busho('武田信豊'), uS(4), uA(16)] },
    { name: '小山田信茂の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, dmg: 0.6, list: [busho('小山田信茂'), uS(3), uA(14)] },
    { name: '竹束の鉄砲衆', at: { x: SPAWN.x, z: SPAWN.z - 10 }, dmg: 0.6, list: [uS(1), uG(10)] },
    // 11/25 K651：act bot が竹束の段で大手の打って出に囲まれ三度倒れた（本人の受ける傷の倍率は八割より下げられない K360⑦）。高遠 d14 と同じく本人の脇に槍衆を一組
    { name: '武田の槍衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 8 }, dmg: 0.6, list: [uS(3), uA(18)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田信豊', '城の鉄砲は塀の狭間から撃ってくる。竹束を楯に寄せよ', 3.2],
      ['組頭', '南と西は崖じゃ。攻め口は北の大手しかない', 3]] },
    { kind: 'hold', at: TAKETABA, label: '竹束の列', obj: '竹束の列を抜けて塀の前へ寄せ、打って出る城兵を押し返す', r: 14, dur: 70,
      title: '竹束', sub: '城兵が大手から打って出る',
      say: [['組頭', '竹束の陰を離れるな！', 2.8]],
      waves: [
        { t: 16, say: ['奥平の侍', '寄せ手を追い払え！'], foes: [{ name: '大手の打って出', from: { x: GX + 24, z: NZ - 6 }, list: [uS(2), uA(12)] }] },
        { t: 24, say: ['物見', '大手の脇から鉄砲衆が出た！'], foes: [{ name: '大手の脇の打って出', from: { x: GX - 26, z: NZ - 6 }, list: [uS(1), uA(10), uG(3)] }] },
        { t: 44, say: ['奥平の侍', 'もう一度押し出せ！'], foes: [{ name: '大手の二の打って出', from: { x: GX + 24, z: NZ - 8 }, list: [uS(1), uA(12)] }] }],
      reward: '竹束の列を保った' },
    { kind: 'rest', dur: 8, heal: 0.6, say: [['組頭', '息を継げ、傷を縛れ。次が来るぞ', 2.8]] },
    { kind: 'fight', at: KANAHORI, obj: '北東の角の金掘りの穴を守り、打って出た城兵を討つ', title: '金掘り', sub: '金掘りが塀の下を掘り進む',
      say: [['金掘りの頭', 'あと少しで塀の下じゃ！　城兵を寄せつけるな！', 3], ['奥平の侍', '穴を埋めよ！　掘り手を討て！', 2.6]],
      foes: [
        { name: '北東の角の打って出', from: { x: KANAHORI.x - 26, z: NZ - 6 }, list: [uS(2), uA(16)] }],
      later: [{ t: 30, say: ['物見', '搦手から回って来る！'], foes: [{ name: '搦手の手', from: { x: KANAHORI.x + 18, z: KANAHORI.z + 16 }, list: [uS(2), uA(12)] }] }],
      reward: '金掘りの穴を守った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['小山田信茂', '金掘りは守った。次は大手門じゃ、息を整えよ', 3]] },
    { kind: 'fight', at: OTEMON, obj: '大手門へ寄せ、門の前に出た奥平の手を押し戻す', title: '大手門', sub: '門の内から槍が出る',
      say: [['小山田信茂', '大手門じゃ！　門の前の城兵を追い込め！', 3], ['奥平信昌', '門を破らせるな！', 2.6]],
      foes: [
        { name: '大手門の守り', from: { x: GX - 26, z: NZ - 6 }, list: [uS(4), uA(24)] }],
      later: [{ t: 28, say: ['奥平の侍', '押し返せ！'], foes: [{ name: '大手の新手', from: { x: GX + 26, z: NZ - 6 }, list: [uS(2), uA(16)] }] }],
      reward: '大手門の前で戦った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['物見', '城から一人、宇連川を潜って抜けた者があったと！　岡崎へ援けを求めに行ったに違いない', 3.6],
      ['武田勝頼', '戻る所を捕らえよ。川の鳴子の綱を見張れ', 3]] },
    { kind: 'move', at: KAWA, label: '城の東の崖下', obj: '城の東の崖下を回り、宇連川の岸へ下りる', r: 12, max: 120,
      say: [['組頭', '崖の下を回るぞ。城の上から見られるな', 2.8]] },
    { kind: 'fight', at: NARUKO, obj: '鳴子が鳴った。川を渡って城へ戻る鳥居強右衛門を捕らえよ', title: '鳴子の綱', sub: '夜明け前、宇連川',
      say: [['足軽', '鳴子が鳴った！　川の中に人影じゃ！', 2.8], ['鳥居強右衛門', '城へ……城へ知らせねば！', 2.8]],
      foes: [
        { name: '鳥居強右衛門', from: { x: 64, z: 66 }, list: [{ type: 'samurai', n: 1, o: { name: '鳥居強右衛門', armor: 0x3a3228 } }] },
        { name: '崖の細道の迎え', from: { x: 48, z: 50 }, list: [uS(2), uA(12)] }],
      reward: '鳥居強右衛門を捕らえた' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['武田勝頼', '強右衛門を城の対岸へ引き出せ。城へ「援軍は来ぬ」と言わせよ', 3.4]] },
    { kind: 'hold', at: TAIGAN, label: '磔の前', obj: '城の対岸の磔の前で、怒って打って出る城兵を受ける', r: 16, dur: 70,
      title: '磔', sub: '強右衛門は城へ「援軍は来る」と叫んだ',
      say: [['鳥居強右衛門', '城の衆、聞け！　援軍は来るぞ！　あと二、三日の辛抱じゃ！', 3.8], ['武田勝頼', '……見事な者よ。城の気は、かえって上がったか', 3.2]],
      waves: [
        { t: 8, say: ['奥平の侍', '強右衛門の仇じゃ！'], foes: [{ name: '搦手の打って出', from: { x: 48, z: 46 }, list: [uS(3), uA(18)] }] },
        { t: 34, say: ['奥平信昌', '寄せ手を一人も帰すな！'], foes: [{ name: '奥平信昌の手', from: { x: 50, z: 54 }, list: [uS(2), uA(14)] }] }],
      reward: '長篠城の囲みを保った' },
  ],
  // 狭間の鉄砲の組は置かない：塀の内に据えた城兵の鉄砲は、動かない的（竹束の段の本人）へ一発九の決まりで撃ち続け、描かずの試しで二十秒に命百が尽きた（11/25。
  //   号令待ち holdFire でも止まらず）。城の鉄砲は台詞と打って出の組の中の鉄砲で見せる。強右衛門を捕らえたら対岸に磔を立てる
  update(rt, dt) {
    const F = rt.flags;
    // 打って出る城兵の侍は馬で坂を駆け下り、本人を踏んで一息に八十余の傷を与えた（act bot 11/25：命88から一コマで倒れた）。
    //   本人を踏む時だけの倍を戸次川と同じ形で和らげる（army_think.js の dmgMultPlayer。斬り合いの傷は変えない）
    if ((F.d10HorseT = (F.d10HorseT || 0) - dt) <= 0) { F.d10HorseT = 1; for (const g of rt.army.groups) if (g.team === 1 && g.dmgMultPlayer == null) g.dmgMultPlayer = 0.35; }
    if (!F.d10Cross && (F.step || 0) >= 5) { F.d10Cross = true; try { NAGA_FIELD.haritsuke(rt, CROSS.x, CROSS.z); } catch (e) { console.warn('d10 磔', e); } }
  },
  win: {
    banner: '長篠城 囲みを保つ', sub: '城は落ちぬまま、織田・徳川の大軍が設楽原に着いた', award: '長篠城の囲みを保った',
    say: [['使番', '織田・徳川の大軍が、設楽原の連吾川の向こうに柵を結んでおりますと', 3.4],
      ['武田勝頼', '城は後じゃ。設楽原で信長と家康を討てば、この戦は終わる', 3.4]],
  },
});
// K651：徳川の長篠城の地面・崖・川・道をそのまま使う（getter も写すため descriptor ごと）
d10_nagashinojo.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(NAGA_WORLD));
// 寄せ手の本人は塀の外の坂で打って出る城兵に四方から囲まれ、act bot が五度続けて倒れた（設楽原 d11・高遠 d14 の戦場の決まりは二人）。本人へ同時に打ち込む数だけ設楽原・高遠と同じに（共通の下限で三人）
d10_nagashinojo.world.playerAtkMax = 2;
// 戦場を建てる（徳川の長篠城と同じ所。城は城兵＝敵の側）→ 軽い型の setup（武田の組・段）
{ const s0 = d10_nagashinojo.setup; d10_nagashinojo.setup = function* (rt) { nagaField(rt, 1); yield; s0.call(this, rt); }; }
export default d10_nagashinojo;
