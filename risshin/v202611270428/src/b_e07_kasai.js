// 伊達家編「葛西・大崎一揆の戦い」（天正十八年〜十九年〔1590〜91〕・陸奥国 大崎・葛西領）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e07_kasai.md
//   史実：秀吉の奥州仕置で葛西・大崎の旧領に木村氏が入り、一揆が起きた。政宗は鎮圧に出たが、一揆を煽ったと疑われた（関与は諸説・『伊達治家記録』B・宮城県の解説 C）。数は推
//   仕組み「馬印の勢い」（date_uma.js）が裏目に出る：勢いが乗りすぎる（押し込みすぎ）と、味方が深追いして刃が鈍る。馬印を抑えて、暴れる側を静める。字・札・釦は足さない
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';
import { withCastle } from './light_castle.js';
import { palisade, kabukimon, nobori, yagura, village } from './props.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };
const IKKI = { flag: 'ashina', armor: 0x3a342c };
const SPAWN = { x: 150, z: 10 };
const WIND = [0.6, -0.2];
const MURA = { x: 40, z: 0 };       // 村
const SHIRO = { x: -80, z: -10 };   // 宮崎城
const SAKU = { x: -10, z: 14 };      // 一揆が道に組んだ柵（K652②）
const ATO = { x: -104, z: 30 };     // 佐沼から来る一揆の後詰を受ける所（K652②）
const SANUMA = { x: -146, z: 4 };   // 佐沼城の大手（K652②）
const KIMURA = { x: -126, z: -22 }; // 一揆に囲まれた木村吉清の手（K652⑥）
// K718/K655 11/27 クラウドか：場に城が一つも無く、曇りの野と林だけだった→宮崎城（SHIRO の北の丘の裾・大手は南の伊達を向く）と佐沼城の柵・門・櫓・村の家並みを足す
const MIYA = { x: -84, z: -52 };
function rect(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
// 宮崎城（加美町宮崎の城跡・笹谷の山城。一揆勢が籠もり、伊達勢が攻め落とした）。手本：加美町の解説（C）・同じ頃の奥州の土の城の型（土塁と柵・空堀・館）。
//   天守・石垣は出さない。曲輪の広さは推。+z が伊達の寄せる側。段の行き先（SHIRO・門の前）は城の外に残す
const MIYAZAKI_PLAN = {
  mon: 'ashina', name: '宮崎城', type: 'yamajiro', year: 1590, lifeDense: 0.8, lifeNoFlags: true,
  gateSlope: 4,
  kuruwa: [
    { id: 'ni', name: '二の丸', level: -2, wall: 'saku', hp: 600, kind: 'ni', capacity: 80, fallbackTo: 'hon', defenseValue: .6,
      poly: rect(-20, 20, 2, 20), gapAt: [[0, 20], [-12, 20], [12, 20], [-20, 10], [20, 10], [0, 2], [-10, 2], [10, 2]], gapW: 8 },
    { id: 'hon', name: '本丸', level: 0, wall: 'dobei', hp: 900, kind: 'hon', capacity: 90, fallbackTo: null, defenseValue: 1,
      poly: rect(-14, 14, -22, -2), gapAt: [[0, -2], [-8, -2], [8, -2], [-14, -12], [14, -12]], gapW: 7 },
  ],
  koguchi: [{ id: 'ote', name: '大手門', from: 'out', to: 'ni', kind: 'hira', gate: 'kabuki', at: [0, 20], rot: 0, w: 5, role: 'ote', maxFlow: 7, fireResistance: .35 }],
  paths: [{ id: 'ote', kind: 'ote', pts: [[0, 34], [0, 20], [0, 2], [0, -2], [0, -10]] }],
  hori: [{ kind: 'karabori', pts: [[-20, 24], [-5, 24]], w: 3, deep: 2.5 }, { kind: 'karabori', pts: [[5, 24], [20, 24]], w: 3, deep: 2.5 }],
  yagura: [{ id: 'ote', kind: 'monomi', at: [16, 16], rot: 0 }, { id: 'ote2', kind: 'monomi', at: [-16, 16], rot: 0 }, { id: 'hon', kind: 'monomi', at: [10, -18], rot: 0 }],
  lordSeat: { profile: 'takato', kind: 'goten', at: [0, -14], w: 10, d: 6, rot: 0, door: 1, name: '本丸の館', where: '本丸の館の奥' },
};
// 宮崎城の一揆の幟・佐沼城（一揆の最後の城）の柵と大手の門と櫓と幟・一揆の籠もる村の家並み
function scene(rt) {
  const W = rt.world;
  try { for (const [dx, dz] of [[-6, 22], [6, 22], [-18, 4], [18, 4], [-6, -6], [6, -6]]) rt.scene.add(nobori(W, MIYA.x + dx, MIYA.z + dz, 'ashina', 5.5)); } catch (e) { /* 幟が無くても戦は続ける */ }
  try {
    const x0 = SANUMA.x - 28, x1 = SANUMA.x - 10, z0 = SANUMA.z - 14, z1 = SANUMA.z + 14;
    for (const seg of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, SANUMA.z - 3], [x1, SANUMA.z + 3, x1, z1]]) rt.scene.add(palisade(W, seg, { solid: false, h: 2.8 }));
    rt.scene.add(kabukimon(W, x1, SANUMA.z, 5.2, -Math.PI / 2, { doors: false }));
    for (const [dx, dz] of [[x1 - SANUMA.x - 2, -9], [x1 - SANUMA.x - 2, 9]]) rt.scene.add(yagura(W, SANUMA.x + dx, SANUMA.z + dz, { kind: 'ro', rot: -Math.PI / 2 }));
    for (const [dx, dz] of [[-14, -6], [-14, 6], [-24, 0], [-20, 10]]) rt.scene.add(nobori(W, SANUMA.x + dx, SANUMA.z + dz, 'ashina', 5.5));
  } catch (e) { /* 佐沼城が無くても戦は続ける */ }
  try { rt.scene.add(village(W, MURA.x - 6, MURA.z - 26, { n: 5, r: 14, fields: 4, smoke: 1, seed: 1590 })); } catch (e) { /* 村が無くても戦は続ける */ }
}
const base = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 0.6, windStep: 99 });
// 裏目：勢いが五割を超えると（押し込みすぎ）、付いてくる備の刃が鈍り、旗が荒れる。勢いは五割に抑えて戦うのが良い
const umaTick = (rt, dt) => {
  base(rt, dt);
  const F = rt.flags;
  if (F.ending || (F.mo || 0) <= 0.5) return;
  for (const g of F.allies || []) if (g && g.count && !g.fixed && g !== F.umaG) g.dmgMult = Math.min(g.dmgMult || 0.3, 0.14);
  F.ura = (F.ura || 0) + dt;
};

export const e07_kasai = withCastle(lightBattle({
  id: 'e07_kasai',
  date: '天正十八年（1590）十月　秋・曇り　陸奥国 葛西・大崎領',
  intro: '奥州仕置の後、葛西・大崎の旧領で一揆が起きた。政宗は鎮めに出るが、都では「政宗が煽った」と囁かれている。',
  history: '天正十八年（1590）、豊臣秀吉の奥州仕置の後、葛西・大崎の旧領で木村氏に対する一揆が起きた。政宗は鎮圧に出たが、一揆を煽ったと疑われた。関与の有無には諸説がある（『伊達治家記録』）。勢いのままに押し込めば、裏目に出る戦である。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '葛西・大崎の一揆勢', mon: 'ashina', faction: 'ashina' } },
  force: { a: 3000, b: 5000 },
  allyLook: DATE, foeLook: IKKI,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1590, time: 'day', fogFar: 380, autumn: 0.7, sky: { wind: WIND, windStrength: 0.9, overcast: 0.6, mist: 0.2 },
    hills: [[SHIRO.x - 20, SHIRO.z, 40, 12], [150, -100, 60, 9], [0, 130, 60, 8]],
    paths: [{ pts: [[150, 10], [90, 6], [40, 0], [-30, -6], [-80, -10]], w: 3 }],
    groves: [{ x: 70, z: 60, r: 34, n: 30 }, { x: 70, z: -60, r: 30, n: 26 }],
    trees: 340, tufts: 2200,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: SPAWN.x + 12, z: SPAWN.z - 10 }, fixed: true, list: [busho('伊達政宗'), uS(6), uA(8)] },
    { name: '片倉景綱の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 12 }, list: [busho('片倉景綱'), uS(2), uA(12)] },
    { name: '伊達成実の手', at: { x: SPAWN.x - 10, z: SPAWN.z + 12 }, list: [busho('伊達成実'), uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 4, z: SPAWN.z + 22 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、都の目がございます。一揆を煽ったと疑われてはなりませぬ', 3.4],
      ['伊達政宗', '分かっておる。旗は急がず進める。村を焼くな', 3.4]] },
    { kind: 'hold', at: MURA, label: '村の入口', obj: '村の入口で、打って出た一揆勢を受け止める', r: 16, dur: 60,
      title: '葛西・大崎', sub: '曇りの村道に、一揆の鬨の声が上がる',
      say: [['組頭', '百姓も多い！　槍の穂先を揃えて受けよ！', 3]],
      waves: [
        { t: 6, say: ['一揆の頭', '伊達も敵じゃ！　一歩も通すな！'], foes: [{ name: '一揆の先手', from: { x: MURA.x - 38, z: MURA.z }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['組頭', '新手じゃ！　固まれ！'], foes: [{ name: '一揆の二の手', from: { x: MURA.x - 34, z: MURA.z + 16 }, list: [uS(2), uA(10)] }] }],
      reward: '一揆の先手を受け止めた' },
    // K652②（11/25 Sanae・10分）：一揆勢は道に柵を組み、城と村に籠もった（『貞山公治家記録』B）
    { kind: 'fight', at: SAKU, limit: 120, obj: '一揆が道に組んだ柵を払う', title: '道の柵', sub: '村道を、一揆の柵が塞ぐ',
      say: [['組頭', '柵の陰に鉄砲がおるぞ！　固まって押せ！', 3.2]],
      foes: [{ name: '柵の一揆勢', from: { x: SAKU.x - 12, z: SAKU.z - 6 }, list: [uS(2), uA(14)] }, { name: '柵の鉄砲', from: { x: SAKU.x - 18, z: SAKU.z + 10 }, list: [uS(1), uG(4)] }],
      reward: '道の柵を払った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    { kind: 'fight', at: SHIRO, limit: 140, obj: '馬印を急がせず、宮崎城の一揆勢を静める', title: '宮崎城', sub: '押し込みすぎれば、味方が鈍る',
      say: [['片倉景綱', '殿、馬印を出しすぎてはなりませぬ。味方が付いてこられぬ', 3.2], ['伊達成実', '深追いは禁物じゃ！', 3]],
      foes: [{ name: '宮崎城の一揆勢', from: { x: SHIRO.x - 6, z: SHIRO.z }, list: [busho('一揆の頭', { mustLive: false, invuln: false }), uS(4), uA(18)] },
        { name: '一揆の鉄砲', from: { x: SHIRO.x - 12, z: SHIRO.z + 16 }, list: [uS(1), uG(6)] }],
      reward: '宮崎城の一揆勢を静めた' },
    // K652②：宮崎城が落ちると、一揆勢は佐沼城に集まった。伊達勢は佐沼城を攻めた（『貞山公治家記録』B）
    { kind: 'hold', at: ATO, label: '佐沼への道', obj: '佐沼城から出て来た一揆の後詰を、道で受け止める', r: 16, dur: 60, limit: 110,
      title: '佐沼の後詰', sub: '一揆は佐沼城に集まっている',
      say: [['伊達成実', '佐沼から一揆が出て来たぞ！　道を塞がせるな', 3.2]],
      waves: [{ t: 6, say: ['一揆の頭', '佐沼を落とさせるな！'], foes: [{ name: '佐沼の一揆の手', from: { x: ATO.x - 36, z: ATO.z }, list: [uS(2), uA(14)] }] },
        { t: 30, say: ['組頭', '横の田からも来る！'], foes: [{ name: '田の一揆勢', from: { x: ATO.x - 10, z: ATO.z + 36 }, list: [uS(1), uA(12), uG(3)] }] }],
      reward: '佐沼から出た一揆の後詰を受け止めた' },
    // K652⑥（11/26 クラウドわ）逸話の段：一揆に囲まれた木村吉清・清久の父子を、政宗と蒲生氏郷が救い出した（天正十八年十一月・『伊達治家記録』B）。本人が囲みを斬り破る所は推
    { kind: 'fight', at: KIMURA, limit: 100, obj: '一揆に囲まれた木村の手へ斬り込み、囲みを破る', title: '木村父子の救い出し', sub: '新しい領主の木村が、一揆に囲まれている',
      say: [['木村吉清', '伊達殿か！　かたじけない、囲みが解けぬ！', 3], ['伊達政宗', '疑いを晴らすは、この槍じゃ。囲みを破れ！', 3.2], ['組頭', '木村の旗を守れ！　一揆を寄せるな！', 3]],
      foes: [{ name: '木村を囲む一揆勢', from: { x: KIMURA.x - 10, z: KIMURA.z - 8 }, list: [uS(2), uA(10)] }],
      reward: '木村父子の囲みを斬り破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKU.x - 30, z: SAKU.z - 14 }, obj: '村の外れの田で、鎌と槍の一揆の百姓を追い散らす', max: 100, limit: 90,
      say: [['組頭', '百姓じゃが容赦はするな', 3.2]],
      foes: [{ name: '一揆の百姓', from: { x: SAKU.x - 18, z: SAKU.z - 26 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '村の外れの一揆を追い散らした' },
    { kind: 'hold', at: { x: SAKU.x + 20, z: SAKU.z + 20 }, label: '柵の道で、火', obj: '柵の道で、火を掛けに来る一揆の手を受け止める', r: 16, dur: 45, limit: 110,   // 11/27 クラウドか：上限が無く act bot がこの段で380秒止まり1080秒の失敗。ほかの受けの段と同じ110秒に
      say: [['見張り', '火を掛けに来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '火を掛ける一揆', from: { x: SAKU.x + 32, z: SAKU.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '火を掛ける一揆', from: { x: SAKU.x + 6, z: SAKU.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '柵の道を守った' },
    { kind: 'fight', at: { x: MIYA.x, z: MIYA.z + 28 }, obj: '宮崎城の門で、籠る一揆の侍を討つ', max: 100, limit: 90,
      say: [['伊達政宗', '門を破れ', 3.2]],
      foes: [{ name: '宮崎城の一揆の侍', from: { x: MIYA.x + 6, z: MIYA.z + 34 }, list: [uS(2), uA(9), uB(2)] }],   // 11/27 クラウドか：門の段が城の無い南の野（-80,34）だった→大手門の前へ
      reward: '宮崎城の門を破った' },
    { kind: 'fight', at: SANUMA, limit: 130, obj: '佐沼城の大手に籠もる一揆勢を静める', title: '佐沼城', sub: '一揆の最後の城',
      say: [['片倉景綱', '佐沼が一揆の最後の拠り所。ここを静めれば、葛西も大崎も静まりまする', 3.4]],
      foes: [{ name: '佐沼城の一揆勢', from: { x: SANUMA.x + 8, z: SANUMA.z }, list: [uS(3), uA(16)] }, { name: '佐沼の鉄砲', from: { x: SANUMA.x - 6, z: SANUMA.z + 16 }, list: [uS(1), uG(5)] }],
      reward: '佐沼城の一揆勢を静めた' },
    // K718（11/26）流れ⑨⑩：勝った直後、秀吉の使者が来て「米沢を離れよ」と転封を告げる（勝って領地を失う）
    { kind: 'rest', dur: 18, heal: 0, say: [
      ['秀吉の使者', '関白殿下の仰せじゃ。一揆の騒ぎは伊達の仕業との疑いあり。米沢・長井・信夫・伊達の旧領を召し上げ、葛西・大崎の地へ移られよ', 4],
      ['伊達成実', '勝ったばかりで、旧領を取り上げられるのか……', 3.2],
      ['伊達政宗', '……承った。米沢を離れる', 3.2]] },
  ],
  setup: scene,
  update: umaTick,
  win: {
    banner: '勝って、米沢を失う', sub: '一揆は静まった。だが秀吉の使者は、米沢を離れて岩出山へ移れと命じた', award: '馬印を抑えて、一揆を静めた',
    say: [['伊達成実', '一揆勢、降ってまいります', 3.2],
      ['伊達政宗', '……都へ釈明に行かねばならぬな', 3.4]],
  },
}), { plan: MIYAZAKI_PLAN, at: MIYA, lift: 4, team: 1, life: false });
e07_kasai.camPull = 1.6;
export default e07_kasai;
