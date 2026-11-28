// 武田編 九戦目「高天神城の戦い（一）」（天正二年〔1574〕五月〜六月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-41）
//   史実：信玄の死の翌年、勝頼は二万余で遠江の高天神城を囲んだ。城は東西二つの峰に曲輪を並べた堅い山城で、信玄も落とせなかった。
//   武田は井楼を組み、堂の尾曲輪・西の丸へ攻め上がって水の手と曲輪を一つずつ奪った。家康の後詰は来ず（信長の援軍は間に合わず）、
//   城将 小笠原信興（長忠）は六月十七日に開城した。勝頼は「父の落とせなかった城を落とした」と名を上げた（『信長公記』『三河物語』・掛川市の高天神城跡の案内）。
//   主人公は勝頼の寄せ手の足軽。高天神（二）d12 と同じ城（攻めと守りが入れ替わる）。
// 11/21 cloud-41：cloud-08 が 07:45 に取り札に書いたが、どの枝にも作りが無かったので司令塔の頼みで作った（連絡帳に一行）
import { withCastle } from './light_castle.js';
import { TAKATENJIN_D09 } from './castles/takatenjin.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
import { nobori, noboriInScene } from './props.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const SPAWN = { x: 0, z: 150 };                   // 寄せ手の陣（城の北の麓）
const OTE = { x: 6, z: 96 };                      // 大手の口（追手門の下）
const SEIRO = { x: -26, z: 58 };                  // 井楼を組んだ堂の尾曲輪の下
const NISHI = { x: -14, z: 18 };                  // 西の丸（西の峰）
const HONMARU = { x: 18, z: -18 };
const KANE = { x: -22, z: 38 };                   // 金掘り衆が水の手へ掘った坑道の口（K652⑥）                // 本丸（東の峰）

// 11/21 クラウド35（K563 ③の質）：高天神城の縄張りを置く（castles/takatenjin.js の TAKATENJIN_D09・出所 docs/battle_refs/takatenjin.md）。門・櫓・館は遠景の軽い形（本物の門は閉じて寄せ手と城兵の行き来を塞いだので使わない）
export const d09_takatenjin1 = withCastle(lightBattle({
  id: 'd09_takatenjin1',
  date: '天正二年（1574）六月　遠江国 高天神城',
  intro: '信玄公も落とせなかった高天神城。勝頼様の二万が囲んで一月。井楼を組み、曲輪を一つずつ奪い、徳川の後詰が来る前に落とす。',
  history: '天正二年（1574）、武田勝頼は二万余で遠江の高天神城を囲んだ。父の信玄も落とせなかった堅い山城である。武田は井楼を組んで曲輪を一つずつ奪い、家康の後詰は間に合わなかった。城将の小笠原信興は六月十七日に城を明け渡し、勝頼は名を上げた。',
  sides: { a: { name: '武田勝頼の寄せ手', mon: 'takeda', faction: 'takeda' }, b: { name: '小笠原信興の城兵', mon: 'tokugawa', faction: 'tokugawa' } },
  force: { a: 20000, b: 1000 },
  allyLook: TAKEDA, foeLook: TOKU,
  friendsSend: 2,   // 段の始めに攻めに出す味方の組は本人に近い二組（全部出すと本人より先に討ち切る・一組では章の通しで本人が囲まれて倒れた回があった 11/21）
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },   // 南（−z）の城を向く
  world: {
    seed: 1574, time: 'day', fogFar: 320,
    hills: [[-14, 14, 46, 22], [20, -20, 44, 26], [-60, 80, 60, 10], [80, 60, 60, 12], [0, -110, 80, 16]],
    trees: 620, tufts: 2000,
  },
  allies: [
    { name: '武田勝頼の旗本', at: { x: SPAWN.x + 14, z: SPAWN.z + 18 }, fixed: true, list: [busho('武田勝頼'), uS(6), uA(12)] },
    { name: '穴山信君の手', at: { x: SPAWN.x - 14, z: SPAWN.z - 4 }, list: [uS(3), uA(16)] },
    { name: '寄せ手の組', at: { x: SPAWN.x + 10, z: SPAWN.z - 6 }, list: [uS(2), uA(16)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 4, z: SPAWN.z + 6 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['勝頼の側近', '御屋形様が落とせなんだ城ぞ', 3],
      ['武田勝頼', '父上の落とせなかった城じゃ。わしが落とす', 3.2],
      ['組頭', '井楼から城の中が見える。曲輪を一つずつ取るぞ', 3]] },
    { kind: 'fight', at: OTE, obj: '大手の口の城兵を崩し、坂の下を取る', title: '大手の口', sub: '追手門の下に城兵が槍を揃える',
      say: [['城兵', '武田を坂へ寄せるな！', 2.6]],
      foes: [{ name: '大手の守り', from: { x: OTE.x, z: OTE.z - 12 }, list: [uS(3), uA(22), uB(4)] }],
      reward: '大手の口を取った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OTE.x + 12, z: OTE.z - 14 }, obj: '追手門の脇の土塁で、鉄砲を構える徳川の兵を討つ', limit: 90,
      say: [['組頭', '土塁の上に鉄砲じゃ。伏せて寄れ', 3.2]],
      foes: [{ name: '土塁の徳川の鉄砲', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: OTE.x + 12, z: OTE.z - 14 }), list: [uS(1), uA(6), uG(5)] }],
      reward: '土塁の鉄砲を討った' },
    // 11/21 cloud-41（章の通し）：大手の口で命三割になったまま井楼の受けへ入り92秒で倒れた回がある。段の間に手当て（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '大手の口は取った。傷を縛れ、井楼の下へ回るぞ', 2.8]] },
    { kind: 'hold', at: SEIRO, label: '井楼の下', obj: '井楼の下で、打って出た城兵から井楼を守る', r: 14, dur: 70,
      title: '井楼', sub: '城兵が井楼を焼きに打って出る',
      say: [['組頭', '井楼を焼かれるな！　ここで受けよ！', 3]],
      waves: [
        { t: 6, say: ['城兵', '井楼に火をかけよ！'], foes: [{ name: '堂の尾の打って出', from: { x: SEIRO.x + 4, z: SEIRO.z - 26 }, list: [uS(4), uA(19)] }] },
        { t: 32, say: ['物見', '横の谷から弓！'], foes: [{ name: '谷の弓', from: { x: SEIRO.x - 18, z: SEIRO.z - 20 }, list: [uB(8)] }] },
        { t: 52, say: ['組頭', '二の手が来る！　槍を下ろすな！'], foes: [{ name: '堂の尾の二の手', from: { x: SEIRO.x + 14, z: SEIRO.z - 24 }, list: [uS(3), uA(16)] }] }],
      reward: '井楼を守り抜いた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SEIRO.x - 10, z: SEIRO.z - 14 }, obj: '井楼の下の堂の尾曲輪で、打って出た徳川の侍を討つ', limit: 90,
      say: [['組頭', '尾曲輪から侍が出た。井楼へ近づけるな', 3.2]],
      foes: [{ name: '尾曲輪の徳川の侍', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: SEIRO.x - 10, z: SEIRO.z - 14 }), list: [uS(3), uA(10)] }],
      reward: '尾曲輪の侍を討った' },
    // 11/21 cloud-41（章の通し）：通しの本人が井楼の受けで深手を負い、西の丸の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.7, say: [['組頭', '井楼は守った。傷を縛れ、西の丸へかかるぞ', 2.8]] },
    // K652⑥（逸話の段・11/25 ヤ三）：武田の金掘り衆が坑道を掘って城の水の手を断った（『甲陽軍鑑』B）。本人が坑道の口で、掘り手を襲う城兵を斬って守る
    { kind: 'fight', at: KANE, limit: 100, obj: '坑道の口で、金掘り衆を襲う城兵を斬り払う', title: '金掘り衆の坑道', sub: '水の手へ掘り進む坑道に城兵が打って出る',
      say: [['金掘り衆の頭', '水の手まであと少し！　掘り手を守ってくだされ！', 3], ['城兵', '坑道じゃ！　水を断たれるぞ、掘り手を討て！', 3]],
      foes: [{ name: '坑道へ打って出る城兵', from: { x: KANE.x + 6, z: KANE.z - 14 }, list: [uS(2), uA(9)] }],
      later: [{ t: 30, say: ['金掘り衆の頭', '水脈に当たった！　城の水は細るぞ！', 3], foes: [{ name: '城の鉄砲', from: { x: KANE.x - 10, z: KANE.z - 20 }, list: [uG(4)] }] }],
      reward: '金掘り衆の坑道を守った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KANE.x + 10, z: KANE.z - 12 }, obj: '水の手の井戸の前で、水を守る城兵を斬り払う', limit: 90,
      say: [['組頭', '井戸を守る兵がおる。斬り払え', 3.2]],
      foes: [{ name: '井戸を守る城兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: KANE.x + 10, z: KANE.z - 12 }), list: [uS(2), uA(10)] }],
      reward: '井戸の守りを斬り払った' },
    { kind: 'rest', dur: 8, heal: 0.6, say: [['組頭', '水の手は細った。傷を縛れ、西の丸へかかるぞ', 2.8]] },
    // 11/27 クラウドせ（K722/K582）：足軽の act bot で西の丸の段が420秒続き（守りの兵が塀の向こうへ回って詰まる）十八分の打ち切りに当たった→上限150秒（着いてから）
    { kind: 'fight', at: NISHI, limit: 150, obj: '西の丸へ攻め上がり、曲輪を奪う', title: '西の丸', sub: '水の手を断たれた城兵が最後の槍を揃える',
      say: [['武田勝頼', '西の丸を取れば水の手は武田の物じゃ', 3]],
      foes: [
        { name: '西の丸の守り', from: { x: NISHI.x, z: NISHI.z - 10 }, list: [uS(4), uA(22)] },
        { name: '西の丸の鉄砲', from: { x: NISHI.x + 10, z: NISHI.z - 16 }, list: [uG(6)] }],
      reward: '西の丸を奪った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: NISHI.x + 14, z: NISHI.z - 14 }, obj: '西の丸と本丸の間の堀切で、退く城兵を追い崩す', limit: 90,
      say: [['組頭', '堀切で止めよ。本丸へ入れるな', 3.2]],
      foes: [{ name: '堀切へ退く城兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: NISHI.x + 14, z: NISHI.z - 14 }), list: [uS(2), uA(12)] }],
      reward: '退く城兵を追い崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: HONMARU.x - 10, z: HONMARU.z + 14 }, obj: '本丸の門の前で、馬を引き出す小笠原の旗本を討つ', limit: 90,
      say: [['物見', '旗本が馬を引き出す！　門の前で討て', 3.2]],
      foes: [{ name: '門の前の小笠原の旗本', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: HONMARU.x - 10, z: HONMARU.z + 14 }), list: [uS(4), uA(8)] }],
      reward: '門の前の旗本を討った' },
    { kind: 'rest', dur: 6, heal: 0.4, say: [['物見', '別の尾根からも味方が上がった！　本丸は孤立しておる', 2.8]] },
    { kind: 'fight', at: HONMARU, limit: 150, obj: '本丸の前の城兵を降す', title: '本丸', sub: '小笠原信興の旗本が本丸の前に出る',
      say: [['小笠原信興', '後詰は来ぬか……', 2.8]],
      foes: [{ name: '小笠原信興の旗本', from: { x: HONMARU.x, z: HONMARU.z - 6 }, list: [busho('小笠原信興'), uS(5), uA(16)] }],
      reward: '高天神城を開城させた' },
  ],
  // K722②⑩（11/27 クラウドし）：要件書の「⑩武田旗を立てる」が台詞だけだった（使番「本丸に武田の旗を立てよ！」の時に何も起きない）。
  //   開城の締めで、本丸の中の徳川の幟を倒し、使番の声に合わせて本丸の口の奥に武田菱の幟を三本、寝た所から起こして立てる。
  //   字は足さない。幟は当たりを持たない（形・材質は共用）。締めの時に初めて作る（城の地ならしの後の高さで立つ）。d15 天目山の一本の旗と対に
  update(rt) {
    const F = rt.flags;
    if (!F.ending || F.d09Hata) return;
    F.d09Hata = true;
    const inHon = (x, z) => x > 4 && x < 42 && z > -48 && z < -22;   // 本丸（TAKATENJIN_D09 の hon・城は (0,0) に置く）
    for (const g of noboriInScene(rt.scene)) {
      if (g.userData.kind !== 'tokugawa' || !inHon(g.position.x, g.position.z)) continue;
      const z0 = g.rotation.z, s = g.position.x > 23 ? 1 : -1;
      for (let k = 1; k <= 12; k++) rt.after(6.4 + k * 0.1, () => { g.rotation.z = z0 + s * 1.45 * (k / 12) ** 2; });
    }
    [[12, -29, 5.5], [18, -31, 6.5], [24, -29, 5.5]].forEach(([x, z, h], i) => {
      const n = nobori(rt.world, x, z, 'takeda', h);
      n.userData.noFreeze = true; n.visible = false; rt.scene.add(n);
      const z0 = n.rotation.z, z1 = z0 + 1.45;
      rt.after(8.6 + i * 0.5, () => { n.rotation.z = z1; n.visible = true; });
      for (let k = 1; k <= 16; k++) rt.after(8.6 + i * 0.5 + k * 0.08, () => { n.rotation.z = z1 + (z0 - z1) * (1 - (1 - k / 16) ** 2); });
    });
  },
  win: {
    banner: '高天神城 開城', sub: '小笠原信興は城を明け渡した。父の落とせなかった城を勝頼が落とした', award: '高天神城を開城させた',
    say: [['使番', '小笠原殿、城を明け渡すと申しておりまする', 3],
      ['武田勝頼', '父上にも落とせなかった城を、わしが落とした', 3.2],
      ['使番', '本丸に武田の旗を立てよ！', 2.8],
      ['組頭', '……この勢いが、どこまで続くかのう', 3]],
  },
}), { plan: TAKATENJIN_D09, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
// K657②（11/25）：尾根の城と分かるように。乾いた赤土・崖の砂ぼこり・松の濃い緑（timeslip_field.js・数は増やさず色だけ・K643）
d09_takatenjin1.timeslip = {
  wet: 0.05, dust: 0.45, trample: 0.3, debris: 0.4, arrows: 0.5, mudColor: 0x8a6244, hazeColor: 0xb8a888, grassLift: 0.05,
  grass: 0x6e7a46, grassTints: [0xffffff, 0xcfc08e, 0x9aa468], grassH: 0.9, grassCap: 380,
  flagColors: [0x1c1a1a, 0xc23a2a, 0xe6dfcc],
};
export default d09_takatenjin1;
