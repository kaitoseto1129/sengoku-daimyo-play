// 武田編 十四戦目「高遠城の戦い」（天正十年〔1582〕三月二日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：甲州征伐で、勝頼の弟 仁科盛信は三千で高遠城に籠り、織田信忠の五万の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、
//   城は一日で落ち、盛信は討死した。武田方で最後まで戦った城として名を残す（『信長公記』・伊那市の高遠城址の案内）。主人公は仁科の城兵。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

// 11/21 cloud-10（章の通し九回目：組の無い本人が最後の段の大きな組に倒れた）：最後の段の組を今日厚くした（1.6倍）前の数に戻す（d14 は討てない河尻を討てる組頭に）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { takatoField, TAKATO_WORLD, TAKATO_AT } from './b_takato.js';   // K651：織田の高遠城の戦場をそのまま使う（素材は写さない）
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と川）をやめ、
//   織田家編の高遠城（b_takato.js・b_takato_siege.js）の標高・縄張り（三の丸・二の丸・本丸の塀と櫓・主殿）・門・土塀・曲輪の暮らし・大手の寄せ陣・春の地面を takatoField で建てる。
//   遊ぶ側を城兵（仁科盛信の側）に入れ替え、城の塀・櫓の守兵は味方（team 0）。大手から本丸まで、織田の寄せの順に退きながら守る。行き先は元の縄張りの物差し（TAKATO_AT）
//   逸話の段（K652⑥）：諏訪勝右衛門の妻（はな）が刀を抜いて斬って回った（『信長公記』「比類なき働き」）。二の丸で本人がはなと並んで斬る
const TAKEDA = { flag: 'takeda', armor: 0x1d1b1a };   // 元の戦の仁科の城兵（黒い具足。旗は world の armyFlagKinds で黒地に白の割菱）
const ODA = { flag: 'oda', armor: 0x2a2622 };
const T = TAKATO_AT;
const SPAWN = { x: 60, z: -6 };                         // 三の丸（大手門の内の広場の西）
const OTE_IN = { x: 64, z: 0 };                         // 大手門の内
const SAN_N = { x: 46, z: -36 };                        // 三の丸の北の段から上がる口
const NI = { x: 6, z: 8 };                              // 二の丸（二の丸門の内）
const HON_MON = { x: -34, z: -6 };                      // 本丸門の前
const HON = { x: -56, z: 2 };                           // 本丸（主殿の前）
export const d14_takato = lightBattle({
  id: 'd14_takato',
  date: '天正十年（1582）三月二日　春の冷え　信濃国 高遠城',
  intro: '織田信忠の五万が高遠城を囲んだ。仁科盛信は降伏を退けた。城兵三千で、大手から本丸まで守り抜け。',
  history: '天正十年（1582）、甲州征伐で勝頼の弟 仁科盛信は高遠城に三千で籠り、織田信忠の降伏の勧めを退けた。三月二日、信忠は自ら塀に上って攻め、城は一日で落ち、盛信は討死した。諏訪勝右衛門の妻は刀を抜いて斬って回り、比類なき働きと伝えられる。武田方で最後まで戦った城として名を残す。',
  sides: { a: { name: '仁科盛信の城兵', mon: 'takeda', faction: 'takeda' }, b: { name: '織田信忠の寄せ手', mon: 'oda', faction: 'oda' } },
  force: { a: 3000, b: 50000, la: 0.6, lb: 0.03 },   // K652①：城は一日で落ち、城兵は多くが討死（『信長公記』首四百余・残りは散った）。寄せ手の損は五万のうち僅か
  allyLook: TAKEDA, foeLook: ODA,
  minutes: 10,
  playerTaken: 0.45,   // 11/21 cloud-10（章の通し二回目：組の無い足軽の本人が囲まれ50〜131秒で倒れた）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI / 2 },   // 東（大手門）を向く
  world: { seed: 15820302 },   // 下で織田の高遠城の world に置き換える（K651）
  allies: [
    { name: '仁科盛信の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 6 }, dmg: 0.45, list: [busho('仁科盛信', { armor: TAKEDA.armor }), uS(4), uA(16)] },
    { name: '城の鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 14 }, dmg: 0.45, list: [uS(1), uG(10)] },
    { name: '城兵の槍衆', at: { x: SPAWN.x + 2, z: SPAWN.z - 10 }, dmg: 0.45, list: [uS(3), uA(18)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['仁科盛信', '降れと申すか。武田の者に、降る者はおらぬ', 3.2],
      ['組頭', '大手を固めよ。織田は今日、一気に来るぞ', 3]] },
    { kind: 'hold', at: OTE_IN, label: '大手門の内', obj: '大手門の内で、門を破って入る織田勢を押し返す', r: 16, dur: 75,
      title: '大手', sub: '森長可の先手が大手門を破る',
      say: [['物見', '大手門が破られた！', 2.6]],
      waves: [
        { t: 6, say: ['織田の侍', '城へ入れ！　一番乗りじゃ！'], foes: [{ name: '大手の寄せ手', from: { x: T.ote.x + 18, z: 0 }, list: [uS(5), uA(34)] }] },
        { t: 30, say: ['物見', '塀を越えて鉄砲衆！'], foes: [{ name: '塀の上の鉄砲', from: { x: T.ote.x - 6, z: 18 }, list: [uG(8)] }, { name: '大手の新手', from: { x: T.ote.x + 20, z: 6 }, list: [uS(4), uA(24)] }] },
        { t: 52, say: ['織田の侍', '押し込め！'], foes: [{ name: '大手の三の手', from: { x: T.ote.x + 18, z: -6 }, list: [uS(3), uA(20)] }] }],
      reward: '大手門の内で寄せ手を押し返した' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '大手は持たせた。傷を縛れ、北の段の口へ回るぞ', 2.8]] },
    { kind: 'fight', at: SAN_N, obj: '三の丸の北の段から上がって来る織田勢を討つ', title: '北の段', sub: '寄せ手が北の段から回り込む',
      say: [['物見', '北の段に梯子が掛かった！', 2.6], ['仁科盛信', '上がって来る者を一人ずつ落とせ', 2.8]],
      foes: [{ name: '北の段の寄せ手', from: { x: 30, z: -50 }, list: [uS(5), uA(30)] }],
      later: [{ t: 30, say: ['物見', 'まだ上がって来る！'], foes: [{ name: '北の段の二の手', from: { x: 26, z: -48 }, list: [uS(3), uA(22)] }] }],
      reward: '北の段の口を守った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [
      ['仁科盛信', '三の丸は保てぬ。二の丸へ退け', 3],
      ['城兵', '諏訪殿の女房が、刀を取って二の丸へ！', 3]] },
    { kind: 'fight', at: NI, obj: '二の丸で諏訪勝右衛門の妻と並び、門を越えて来る織田勢を斬る', title: '諏訪の妻', sub: '女房、刀を抜いて斬って回る',
      say: [['はな', '夫と共に死ぬ覚悟。ここは一歩も通さぬ', 3.2], ['織田の侍', '女が斬って出たぞ……！', 2.6]],
      foes: [{ name: '二の丸へ入る織田勢', from: { x: T.gateNi.x + 14, z: 12 }, list: [uS(5), uA(30)] }],
      later: [{ t: 26, say: ['物見', '二の丸の門に新手！'], foes: [{ name: '二の丸の新手', from: { x: T.gateNi.x + 16, z: 4 }, list: [uS(3), uA(24)] }] }],
      reward: '諏訪の妻と並んで二の丸で斬った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['仁科盛信', '本丸へ退け。傷を縛れ。最後はここで迎える', 3]] },
    { kind: 'fight', at: HON_MON, obj: '本丸門の前で、信忠の旗本を押し戻す', title: '本丸門', sub: '信忠が自ら塀に上ったと',
      say: [['城兵', '信忠が塀の上に！', 2.6], ['仁科盛信', '本丸の門を渡すな！', 2.6]],
      foes: [{ name: '本丸門へ寄せる織田勢', from: { x: HON_MON.x + 22, z: -6 }, list: [{ type: 'samurai', n: 1, o: { name: '河尻秀隆の組頭' } }, uS(5), uA(26)] }],
      reward: '本丸門の前で戦った' },
    { kind: 'hold', at: HON, label: '本丸', obj: '本丸で仁科盛信と共に、最後まで戦う', r: 16, dur: 70,
      title: '本丸', sub: '城の火の手が上がる',
      say: [['仁科盛信', '残る者、本丸に揃え。ここが武田の意地じゃ', 3.4]],
      waves: [
        { t: 6, say: ['織田の侍', '本丸じゃ！　盛信を討て！'], foes: [{ name: '本丸へ入る織田勢', from: { x: T.gateHon.x + 8, z: -8 }, list: [uS(5), uA(28)] }] },
        { t: 34, say: ['物見', '搦手からも来る！'], foes: [{ name: '搦手の織田勢', from: { x: T.karamete.x + 8, z: 4 }, list: [uS(3), uA(22)] }] }],
      reward: '本丸で最後まで戦った' },
  ],
  update(rt) {
    const F = rt.flags;
    // 逸話の段：二の丸の段（段の札の三つ目）の頭で、はな（諏訪勝右衛門の妻）が本人の脇に立つ（元の戦と同じ衣。刃は城兵と同じ半分）
    if (!F.d14Hana && (F.step || 0) >= 2 && rt.player?.u) {
      F.d14Hana = true;
      try {
        const P = rt.player.u.pos;
        const g = allyGroup(rt, { faction: 'takeda', name: 'はな（諏訪勝右衛門の妻）', anchor: { x: P.x - 2, z: P.z + 2 }, fixed: true, facing: Math.PI / 2, width: 1, aggro: 14, seekRange: 18, order: 'attack', noRout: true },
          [{ type: 'samurai', n: 1, o: { name: 'はな', invuln: true, weapon: 'sword', reach: 1.75, horse: false, kosode: 1, kosodeCol: 0x3a3c46, hat: 'none', flag: null, haori: 0, sode: false, kote: 0, menpo: 0 } }]);
        if (g) g.dmgMult = 0.5;
      } catch (e) { console.warn('d14 はな', e); }
    }
  },
  win: {
    banner: '高遠城 最後まで戦う', sub: '城は一日で落ち、仁科盛信は討死した', award: '本丸で最後まで戦った',
    say: [['城兵', '……仁科様、お討死', 2.8],
      ['組頭', '生き残った者は新府へ走れ。御屋形様に、高遠は最後まで戦ったと伝えよ', 3.6]],
  },
});
// K651：織田の高遠城の地面・川・道・冬の木をそのまま使う（getter も写すため descriptor ごと）
d14_takato.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(TAKATO_WORLD));
// 戦場を建てる（織田の高遠城と同じ所。城は城兵＝本人の側）→ 寄せ手の通る門を開けておく（城は一日で落ちた）→ 軽い型の setup（城兵の組・段）
{ const s0 = d14_takato.setup; d14_takato.setup = function* (rt) {
  const r = yield* takatoField(rt, 0);
  const G = r?.C?.gateObjs || {};
  for (const g of [G.ote?.outer, G.ote?.inner, G.gate_ni, G.gate_hon?.outer, G.gate_hon?.inner, G.karamete]) {
    if (!g?.struct) continue; g.struct.opened = true; try { g.open?.(); } catch (e) { /* 戸の形が無い門 */ }
  }
  s0.call(this, rt);
}; }
export default d14_takato;
