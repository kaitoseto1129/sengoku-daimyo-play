// 武田編 十五戦目「天目山（田野）の戦い」（天正十年〔1582〕三月十一日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：新府城を焼いて逃れた勝頼は、小山田信茂にも背かれ、天目山を目指して田野の里に至った。滝川一益の兵に追い付かれ、
//   土屋昌恒は狭い道で片手で藤の蔓をつかみ、一人で多くの敵を斬った（片手千人斬りの伝え）。勝頼・信勝は自刃し、武田は滅んだ
//   （『信長公記』『甲陽軍鑑』・甲州市の景徳院の案内）。主人公は土屋昌恒の手の足軽。勝頼の最期の間を稼ぐ（負ける側の物語・K509）。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
import { nobori } from './props.js';
import { stopMusic } from './audio.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const ODA = { flag: 'oda', armor: 0x2a2622 };
const SPAWN = { x: 0, z: -40 };
const RIVER = [[-60, -220], [-50, -100], [-56, 0], [-48, 100], [-58, 220]];   // 日川（道の西の谷川）
const MICHI = { x: -4, z: 30 };     // 狭い道（崖と谷川の間）
const KATAGE = { x: 2, z: 70 };     // 片手千人斬りの道の口
const TANO = { x: 6, z: -20 };      // 田野の里（勝頼の最期の陣）
// K658（11/25 クラウドか）：十五分と出来事。布陣図 docs/fujin/tano.md・旅 docs/journey/tano.md の並び（四郎作の崖道＝小宮山 → 鳥居畑＝安倍・勝頼 → 平屋敷）を武田の側から段に
const SHIROSAKU = { x: -12, z: 50 }; // 四郎作の崖道（小宮山友晴が討死した所）
const TORII = { x: 4, z: 8 };        // 鳥居畑（平屋敷の柵の前の畑。勝頼が自ら打って出たと伝える・景徳院の案内）

export const d15_tenmokuzan = lightBattle({
  id: 'd15_tenmokuzan',
  date: '天正十年（1582）三月十一日　曇り　甲斐国 田野',
  intro: '小山田にも背かれ、御屋形様の供は四十余り。滝川一益の兵が追って来る。土屋昌恒と共に、狭い道で追手を止めよ。',
  history: '天正十年（1582）三月、新府城を焼いて逃れた武田勝頼は、小山田信茂にも背かれ、天目山を目指して田野の里に至った。滝川一益の兵に追い付かれ、土屋昌恒は狭い道で多くの敵を斬った。勝頼と子の信勝は自刃し、武田は滅んだ。',
  sides: { a: { name: '土屋昌恒の手', mon: 'takeda', faction: 'takeda' }, b: { name: '滝川一益の追手', mon: 'oda', faction: 'oda' } },
  force: { a: 40, b: 4000, la: 0.6, lb: 0.15 },   // K652：史実は四十余りが討死して敵の損害は小さい（負ける側）
  allyLook: TAKEDA, foeLook: ODA,
  minutes: 12,   // K658：段を足して人の速さで十二〜十五分
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し二回目：組の無い足軽の本人が囲まれ50〜131秒で倒れた）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 15820311, time: 'morning', overcast: true, fogFar: 320,
    river: RIVER, riverW: 10, riverDepth: 0.6,
    hills: [[40, 20, 40, 26], [40, 120, 40, 24], [-110, 40, 50, 20],
      // K655（11/26 クラウドさ）：サムネで「崖と谷川の間の狭い道」と分かるよう、道の東に急な尾根（崖の上の鉄砲が立つ）、西に谷川へ落ちる崖（崖の上の弓）を足した。
      //   布陣図 docs/fujin/tano.md・旅 docs/journey/tano.md（田野は日川の谷の狭い道）。道・段の場所は尾根の裾の外（高さ1m 未満）
      [20, 14, 10, 12], [18, 30, 10, 14], [17, 46, 10, 15], [17, 62, 10, 14], [19, 78, 10, 13], [21, 94, 10, 12], [-28, 30, 8, 9], [-28, 46, 8, 10], [-27, 62, 8, 10]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：狭い道・片手千人斬りの道の口・田野の里 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, -40], [6, -20], [-4, 30], [2, 70]], w: 3 }],
    groves: [{ x: 40, z: 20, r: 20, n: 30, kind: 'sugi' }, { x: 40, z: 120, r: 20, n: 30, kind: 'sugi' },
      { x: 19, z: 54, r: 16, n: 40, kind: 'sugi' }, { x: 20, z: 20, r: 11, n: 18, kind: 'sugi' }, { x: -28, z: 46, r: 12, n: 24, kind: 'sugi' }],   // K655：崖の尾根の杉（木の数は同じ 640 の内）
    trees: 640, tufts: 1200,
  },
  // 11/21 cloud-41（章の通し）：通しの足軽が囲まれて十数秒で倒れる回が残った（受けの段・数十の槍）。敵は変えず、味方の刃を 0.25→0.45 に上げて味方が囲みを削る（本人の討ち取りは減ってもよい）
  allies: [
    { name: '土屋昌恒の手', at: { x: SPAWN.x - 8, z: SPAWN.z + 6 }, dmg: 0.45, list: [busho('土屋昌恒'), uS(3), uA(8)] },
    { name: '勝頼の旗本', at: { x: TANO.x + 4, z: TANO.z - 8 }, dmg: 0.45, list: [busho('武田勝頼'), busho('武田信勝'), uS(4)] },
    // 11/21 cloud-41（章の通し）：通しの本人が道の口で滝川勢に囲まれ107秒で倒れた回がある。敵は変えず、天目山で最後まで従った小宮山友晴の手を本人の脇に（『甲陽軍鑑』）
    { name: '小宮山友晴の手', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, dmg: 0.45, list: [busho('小宮山友晴', { mustLive: false, invuln: false }), uS(2), uA(10)] },
  ],
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['武田勝頼', '小山田までも背いたか……。ここまでじゃ', 3],
      ['物見', '岩殿山への道は、小山田の兵が塞いだ！　行く先がござらぬ', 3.2],
      ['土屋昌恒', '御屋形様が御心を定められるまで、一人も通さぬ', 3.4]] },
    { kind: 'hold', at: MICHI, label: '狭い道', obj: '崖と谷川の間の狭い道で、追手を止める', r: 14, dur: 90,
      title: '狭い道', sub: '滝川一益の兵が追って来る',
      say: [['土屋昌恒', '道は一人しか通れぬ。ここなら千人でも止められる', 3.2]],
      waves: [
        { t: 6, say: ['滝川の侍', '武田の残りじゃ！　逃がすな！'], foes: [{ name: '追手の先駆け', from: { x: MICHI.x, z: MICHI.z + 30 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 篠岡' } }, uS(5), uA(32)] }] },
        { t: 30, say: ['物見', '崖の上に鉄砲！'], foes: [{ name: '崖の上の鉄砲', from: { x: MICHI.x + 16, z: MICHI.z + 24 }, list: [uG(7)] }] },
        { t: 50, say: ['滝川の侍', '数で押し通せ！'], foes: [{ name: '追手の二の手', from: { x: MICHI.x - 6, z: MICHI.z + 34 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 稲田' } }, uS(2), uA(20)] }] }],
      reward: '狭い道で追手を止めた' },
    // 11/21 cloud-41（章の通し）：通しの本人が狭い道の受けで深手を負い、道の口の段の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.5, say: [['土屋昌恒', '追手は止めた。傷を縛れ。崖の下で小宮山が持ちこたえておる', 3]] },
    // K658（11/25 クラウドか）：小宮山友晴は勝頼の勘気を受けて退けられていたが、最期と聞いて駆け戻り、四郎作の崖道で討死した（『甲陽軍鑑』・『信長公記』巻十五）
    { kind: 'fight', at: SHIROSAKU, limit: 120, obj: '四郎作の崖道で、小宮山友晴と共に滝川の先手を斬る', title: '四郎作の崖道', sub: '勘気を受けた小宮山友晴が、最期の供に駆け戻った',
      say: [['小宮山友晴', '勘気を受けた身なれど、御最期の供はこの小宮山が仕る', 3.4], ['土屋昌恒', '戻って来たか、内膳。ならば共に斬ろう', 3]],
      foes: [
        { name: '崖道の滝川の先手', from: { x: SHIROSAKU.x - 4, z: SHIROSAKU.z + 20 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 篠田' } }, uS(3), uA(20)] },
        { name: '崖の上の弓', from: { x: SHIROSAKU.x - 16, z: SHIROSAKU.z + 12 }, list: [uB(6)] }],
      later: [{ t: 26, say: ['小宮山友晴', 'お屋形様へ伝えよ。小宮山、ここで果てたと', 3.2], foes: [{ name: '崖道の二の手', from: { x: SHIROSAKU.x + 4, z: SHIROSAKU.z + 28 }, list: [uS(2), uA(16)] }] }],
      reward: '小宮山と共に崖道を守った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['使番', '小宮山殿、討死！　道の口へ滝川の本手が寄せる！', 3]] },
    { kind: 'fight', at: KATAGE, obj: '道の口へ出て、押し寄せる滝川勢を斬る', title: '片手千人斬り', sub: '土屋昌恒が藤の蔓をつかみ、片手で斬る',
      say: [['土屋昌恒', '来い！　この土屋が相手じゃ！', 2.8], ['滝川の侍', '化け物か……！', 2.4]],
      foes: [
        { name: '滝川勢', from: { x: KATAGE.x, z: KATAGE.z + 14 }, list: [uS(5), uA(24)] },
        { name: '滝川の新手', from: { x: KATAGE.x + 10, z: KATAGE.z + 24 }, list: [uS(4), uA(26)] }],
      later: [{ t: 30, say: ['滝川の侍', 'まだ斬られに来るか……いや、押せ！'], foes: [{ name: '道の口の新手', from: { x: KATAGE.x - 8, z: KATAGE.z + 30 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 日比野' } }, uS(2), uA(22)] }] }],
      reward: '道の口で滝川勢を斬った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['組頭', '道の口も破られる。鳥居畑の柵まで退け！', 2.8]] },
    // K658（11/25 クラウドか）：鳥居畑は平屋敷の柵の前の畑で、最も激しく斬り合った所。勝頼も自ら打って出たと伝える（甲州市 景徳院の案内・『甲陽軍鑑』）
    { kind: 'fight', at: TORII, limit: 130, obj: '鳥居畑の柵の前で、打って出る御屋形様と共に滝川勢を押し返す', title: '鳥居畑', sub: '武田勝頼が自ら太刀を取って柵から打って出る',
      say: [['武田勝頼', '父の家を、ただで渡すものか。続け！', 3], ['安倍宗貞', '御屋形様の前に出よ！　安倍が先じゃ', 3]],
      foes: [
        { name: '鳥居畑の滝川勢', from: { x: TORII.x + 6, z: TORII.z + 26 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 岡田' } }, uS(4), uA(24)] },
        { name: '畑の脇の鉄砲', from: { x: TORII.x + 22, z: TORII.z + 20 }, list: [uG(6)] }],
      later: [{ t: 28, say: ['滝川の侍', 'あれが勝頼じゃ！　囲め！'], foes: [{ name: '鳥居畑の新手', from: { x: TORII.x - 14, z: TORII.z + 30 }, list: [uS(3), uA(18)] }] }],
      reward: '鳥居畑で滝川勢を押し返した' },
    // K658：信勝は田野で、家の重宝の楯無の鎧を着けて元服したと伝える（『甲陽軍鑑』）。最期の間の一息
    { kind: 'rest', dur: 10, heal: 0.3, say: [
      ['武田勝頼', '太郎、楯無を着けよ。今日がそなたの元服じゃ', 3.2],
      ['武田信勝', '……はい。武田の名に恥じぬよう', 2.8],
      ['土屋昌恒', '最期の間は、我らが稼ぐ', 2.6]] },
    { kind: 'hold', at: TANO, label: '田野の里', obj: '田野の里で、御屋形様の最期の間を守る', r: 14, dur: 70,
      title: '田野', sub: '御屋形様が御心を定められた',
      say: [['土屋昌恒', '……御屋形様。土屋も、すぐに参ります', 3.2]],
      waves: [{ t: 8, say: ['滝川一益', '勝頼の首を取れ！'], foes: [{ name: '滝川一益の手', from: { x: TANO.x, z: TANO.z + 40 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 津田' } }, uS(6), uA(32)] }] },
        { t: 26, say: ['組頭', '里の裏の山からも来る！'], foes: [{ name: '里の裏の手', from: { x: TANO.x - 24, z: TANO.z + 30 }, list: [uS(2), uA(16)] }] },
        { t: 46, say: ['滝川の侍', '武田の最後の者どもじゃ！　残らず討て！'], foes: [{ name: '田野の三の手', from: { x: TANO.x + 20, z: TANO.z + 36 }, list: [{ type: 'samurai', n: 1, o: { name: '滝川の組頭 滝川益重' } }, uS(2), uA(20)] }] }],
      reward: '御屋形様の最期を守った' },
  ],
  // K722③（11/27 クラウドし）：要件書の見せ場「同じ武田の赤い旗が一本しか残っていない」「最後：勝鬨なし。風の音。倒れた旗」を絵と音に。
  //   田野の里の勝頼の旗本の後ろに武田菱の幟を一本だけ立て、勝ちの後に曲を止めて（風の音だけが残る）、締めの台詞「赤い旗が一本、倒れた」に合わせて地へ倒す。
  //   字は足さない。幟は当たりを持たない一本（形・材質は共用）。織田編 田野（b_tano.js lastNobori）と同じ倒し方
  setup(rt) {
    const n = nobori(rt.world, TANO.x + 9, TANO.z - 14, 'takeda', 6);
    n.userData.noFreeze = true; rt.scene.add(n); rt.flags.d15Hata = n;
  },
  update(rt) {
    const F = rt.flags, n = F.d15Hata;
    if (!F.ending || !n || n.userData.fallen) return;
    n.userData.fallen = true;
    rt.after(1, () => { try { stopMusic(4); } catch (e) { /* 音の無い時も続ける */ } });
    const z0 = n.rotation.z;
    for (let k = 1; k <= 14; k++) rt.after(11.4 + k * 0.1, () => { n.rotation.z = z0 + 1.42 * (k / 14) ** 2; });
  },
  win: {
    banner: '天目山 武田、滅ぶ', sub: '勝頼・信勝は田野で自刃した', award: '御屋形様の最期を守った',
    say: [['武田の侍', '御屋形様、御自害……', 2.8],
      ['土屋昌恒', '武田は滅んでも、甲斐の者の戦いぶりは語り継がれよう', 3.6],
      ['物見', '……勝鬨は上がらぬ。風の音ばかりじゃ', 3.2],
      ['武田の侍', '武田の赤い旗が、一本、倒れた……', 3.2]],
  },
});
export default d15_tenmokuzan;
