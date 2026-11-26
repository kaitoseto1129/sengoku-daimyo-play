// 伊達家編「葛西・大崎一揆の戦い」（天正十八年〜十九年〔1590〜91〕・陸奥国 大崎・葛西領）。軽い型（light_battle.js）。紙は docs/house_date.md ①②④・docs/fujin/e07_kasai.md
//   史実：秀吉の奥州仕置で葛西・大崎の旧領に木村氏が入り、一揆が起きた。政宗は鎮圧に出たが、一揆を煽ったと疑われた（関与は諸説・『伊達治家記録』B・宮城県の解説 C）。数は推
//   仕組み「馬印の勢い」（date_uma.js）が裏目に出る：勢いが乗りすぎる（押し込みすぎ）と、味方が深追いして刃が鈍る。馬印を抑えて、暴れる側を静める。字・札・釦は足さない
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { umaTick as umaT } from './date_uma.js';

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
const base = (rt, dt) => umaT(rt, dt, { wIn: WIND, wOut: WIND, cap0: 0.6, windStep: 99 });
// 裏目：勢いが五割を超えると（押し込みすぎ）、付いてくる備の刃が鈍り、旗が荒れる。勢いは五割に抑えて戦うのが良い
const umaTick = (rt, dt) => {
  base(rt, dt);
  const F = rt.flags;
  if (F.ending || (F.mo || 0) <= 0.5) return;
  for (const g of F.allies || []) if (g && g.count && !g.fixed && g !== F.umaG) g.dmgMult = Math.min(g.dmgMult || 0.3, 0.14);
  F.ura = (F.ura || 0) + dt;
};

export const e07_kasai = lightBattle({
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
    { kind: 'hold', at: { x: SAKU.x + 20, z: SAKU.z + 20 }, label: '柵の道で、火', obj: '柵の道で、火を掛けに来る一揆の手を受け止める', r: 16, dur: 45,
      say: [['見張り', '火を掛けに来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '火を掛ける一揆', from: { x: SAKU.x + 32, z: SAKU.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '火を掛ける一揆', from: { x: SAKU.x + 6, z: SAKU.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '柵の道を守った' },
    { kind: 'fight', at: { x: SAKU.x - 70, z: SAKU.z + 20 }, obj: '宮崎城の門で、籠る一揆の侍を討つ', max: 100, limit: 90,
      say: [['伊達政宗', '門を破れ', 3.2]],
      foes: [{ name: '宮崎城の一揆の侍', from: { x: SAKU.x - 58, z: SAKU.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '宮崎城の門を破った' },
    { kind: 'fight', at: SANUMA, limit: 130, obj: '佐沼城の大手に籠もる一揆勢を静める', title: '佐沼城', sub: '一揆の最後の城',
      say: [['片倉景綱', '佐沼が一揆の最後の拠り所。ここを静めれば、葛西も大崎も静まりまする', 3.4]],
      foes: [{ name: '佐沼城の一揆勢', from: { x: SANUMA.x + 8, z: SANUMA.z }, list: [uS(3), uA(16)] }, { name: '佐沼の鉄砲', from: { x: SANUMA.x - 6, z: SANUMA.z + 16 }, list: [uS(1), uG(5)] }],
      reward: '佐沼城の一揆勢を静めた' },
  ],
  update: umaTick,
  win: {
    banner: '一揆を静める', sub: '宮崎城は静まった。されど政宗への疑いは消えない', award: '馬印を抑えて、一揆を静めた',
    say: [['伊達成実', '一揆勢、降ってまいります', 3.2],
      ['伊達政宗', '……都へ釈明に行かねばならぬな', 3.4]],
  },
});
e07_kasai.camPull = 1.6;
export default e07_kasai;
