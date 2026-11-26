// 毛利家編 十四戦目「鳥取城救援の戦い」（天正九年〔1581〕七〜十月・因幡国 鳥取城）。軽い型（light_battle.js）・K647（docs/house_mori.md ⑥）
//   史実：吉川経家が入った鳥取城を、羽柴秀吉は米を買い占め（因幡の米を高く買う）、周りを柵で囲んで飢えさせた。毛利は救援の兵を出したが、
//   羽柴方の水軍と柵に阻まれて城へ兵糧を入れられず、城は飢えて開き、経家は自害した（『信長公記』A・『陰徳太平記』B・鳥取市の解説C。兵数は毛利約八千・羽柴約二万で推）。
//   仕組み：毛利が「負ける側」の戦（第二次木津川口・第一次月山と同じ）。海から着いて城へ荷駄を通そうとする→羽柴の囲みに阻まれ→荷駄を守り→退く。勝ちは「生きて退く」。字・札・ボタンは足さない
import { lightBattle, uS, uA, uB, busho } from './light_battle.js';
import { tottoriField, TOTTORI_WORLD, TOTTORI_TIMESLIP, TOTTORI_AT, TOTTORI_HF } from './b_tottori.js';   // K651：織田家編の鳥取城の戦場をそのまま使う（素材は写さない）

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と柵一本）をやめ、織田家編の鳥取城
//   （千代川・岸の兵糧舟・囲みの柵と付城・久松山の木戸と曲輪・太閤ヶ平・秋の夜の色）を tottoriField で建てる。同じ天正九年秋・同じ因幡の鳥取城。
//   遊ぶ側は千代川の岸に着いた毛利の兵糧舟の番。織田家編で羽柴の足軽が焼きに来る舟を、ここでは守る側（−x が川、−z が城、柵は z=FENCE_Z）。
//   K652⑥（逸話の段）：囲みの網を抜けた米舟も、羽柴の手に火をかけられて燃え、城へ米は届かない（鳥取の渇え殺し）。字は足さず、舟の火で見せる
const MORI = { flag: 'mori', armor: 0x49332b };
const HASHIBA = { flag: TOTTORI_HF, armor: 0x292520 };   // 羽柴の五三桐（織田家編の鳥取と同じ旗）
const AT = TOTTORI_AT, B0 = AT.boats[0], B1 = AT.boats[1];
const SPAWN = { x: B1.x + 8, z: B1.z - 10 };              // 岸に着いた兵糧舟の脇（舟の番の持ち場）
const KAKOMI = { x: -30, z: AT.fenceZ - 8 };               // 岸から柵へ寄る所（羽柴の川岸の組の前）
const NIDAI = { x: -6, z: -2 };                            // 荷駄を城の木戸の道へ通す所（柵の口の手前）
const EXIT = { x: B0.x + 8, z: B0.z - 22 };                // 川上の岸（舟へ退く）
const GAP = { x: 10, z: AT.fenceZ + 12 };                  // 囲みの柵の口（羽柴が出てくる所）
const FUNE = { x: B1.x + 10, z: B1.z - 4 };                // 燃える米舟の脇（俵を担ぎ出す・K652②）

export const m14_tottori = lightBattle({
  id: 'm14_tottori',
  date: '天正九年（1581）十月　夜　因幡国 鳥取城',
  intro: '吉川経家が入った鳥取城は、羽柴秀吉の囲みで飢えている。毛利は荷駄を運んで城を救おうとする。しくじれば城が飢え死ぬ。',
  history: '天正九年（1581）、羽柴秀吉は因幡の米を買い占め、鳥取城の周りを柵で囲んで飢えさせた。城には吉川経家が入っていた。毛利は救援の兵を出して兵糧を運ぼうとしたが、羽柴方の囲みと水軍に阻まれて城へ入れなかった。城は飢えて開き、経家は自害した。補給の道を断たれた城の悲しい戦である（『信長公記』・鳥取市の解説。兵数は推）。',
  sides: { a: { name: '毛利の救援の軍', mon: 'mori', faction: 'mori' }, b: { name: '羽柴の軍', mon: 'oda', faction: 'oda' } },
  force: { a: 8000, b: 20000, la: 0.2, lb: 0.03 },   // K652①：囲みは破れず毛利が退く。羽柴の損は少ない（討ち取りに合わせて少しずつ）
  allyLook: MORI, foeLook: HASHIBA,
  thick: true,
  allyDmg: 0.3,
  foeDmg: 0.8,
  minutes: 6,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0.4 },   // 柵（+z）と柵の口を向く
  world: { seed: 1581, time: 'night' },   // 下で織田家編の鳥取城の world に置き換える（K651）
  allies: [
    { name: '吉川元春の旗本', at: { x: SPAWN.x + 6, z: SPAWN.z + 4 }, fixed: true, list: [busho('吉川元春'), uS(5), uA(8)] },
    { name: '荷駄隊', at: { x: SPAWN.x - 12, z: SPAWN.z + 8 }, list: [uS(2), uA(10)] },
    { name: '弓衆', at: { x: SPAWN.x + 14, z: SPAWN.z + 10 }, list: [uS(1), uB(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['吉川元春', '経家殿の城は、米が尽きかけておる。荷駄を一つでも多く通さねばならぬ', 3.6],
      ['小早川隆景', '羽柴は戦わぬ。柵と海で、城を飢えさせる。力で破れる囲みではない', 3.6],
      ['組頭', '柵の切れ目を探す。荷駄を離すな', 3.2]] },
    { kind: 'fight', at: KAKOMI, obj: '羽柴の柵の囲みを攻め、荷駄の道を開く', title: '柵の囲み', sub: '羽柴は柵の中から、弓と鉄砲で待つ',
      say: [['吉川元春', '柵の守りを崩せ。道が開けば荷駄が通る', 3.2]],
      foes: [{ name: '羽柴の柵の備', from: { x: KAKOMI.x - 6, z: KAKOMI.z + 10 }, list: [uS(3), uA(14)] }, { name: '羽柴の弓・鉄砲', from: { x: KAKOMI.x + 14, z: KAKOMI.z + 16 }, list: [uS(1), uB(10)] }],
      later: [{ t: 40, say: ['組頭', '柵の奥から新手が出るぞ！'], foes: [{ name: '羽柴の新手', from: { x: GAP.x, z: GAP.z }, list: [uS(2), uA(12)] }] }],
      reward: '羽柴の柵の囲みを一か所破った' },
    { kind: 'hold', at: NIDAI, label: '荷駄の道', obj: '荷駄を通す間、羽柴の押し返しを受け止める', r: 18, dur: 65,
      title: '荷駄', sub: '羽柴は囲みを締め直しに来る',
      say: [['吉川元春', '荷駄が通る！　道を空けるな！', 3.2]],
      waves: [
        { t: 6, say: ['羽柴の侍', '兵糧を城へ入れさせるな！　押し返せ！'], foes: [{ name: '羽柴の押し返し', from: { x: GAP.x, z: GAP.z + 4 }, list: [uS(3), uA(14)] }] },
        { t: 34, say: ['組頭', '横から新手じゃ！　荷駄を守れ！'], foes: [{ name: '羽柴の横手の備', from: { x: NIDAI.x + 40, z: NIDAI.z + 8 }, list: [uS(2), uA(12), uB(4)] }] }],
      reward: '荷駄の道を守り、押し返しを受け止めた' },
    // K652②（11/25 Sanae）：段を足して長くなった分、中ほどに立て直しを一つ（八秒・傷の手当て。act bot が後の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K652②：米舟に羽柴の火がかかる（K652⑥）。燃える舟から一俵でも多く担ぎ出す間、焼き手を受け止める
    { kind: 'hold', at: FUNE, label: '燃える米舟', obj: '燃える米舟から俵を担ぎ出す間、羽柴の焼き手を受け止める', r: 16, dur: 55, limit: 110,
      title: '米舟の火', sub: '囲みを抜けた米舟にも、羽柴の火がかかった',
      say: [['吉川元春', '舟が燃える！　一俵でも多く担ぎ出せ！', 3.2]],
      waves: [{ t: 6, say: ['羽柴の侍', '舟も俵も燃やせ！　一粒も城へ入れるな！'], foes: [{ name: '羽柴の焼き手', from: { x: FUNE.x + 34, z: FUNE.z + 20 }, list: [uS(3), uA(12)] }] },
        { t: 30, say: ['組頭', '柵の方からも来る！'], foes: [{ name: '羽柴の柵の手', from: { x: FUNE.x + 40, z: FUNE.z - 10 }, list: [uS(2), uA(10), uB(3)] }] }],
      reward: '燃える米舟から俵を担ぎ出した' },
    { kind: 'move', at: EXIT, label: '退き口', obj: '羽柴の新手が来る前に、浜へ退く', r: 14, max: 140,
      say: [['小早川隆景', '城へ届いた米は、いくらもあるまい。これ以上は無理じゃ。退くぞ', 3.4], ['組頭', '羽柴の大軍が後ろから来る！　走れ！', 3]] },
    { kind: 'fight', at: EXIT, limit: 130, obj: '追ってくる羽柴の手を払い、舟へ退く', title: '殿',   // K652②：段を足した後の act bot で、この殿の段が二百二十七秒に延びた（上限を置く）
      sub: '城を救えなかった軍の殿',
      say: [['吉川元春', '経家殿に申し訳が立たぬ。だが兵を無駄に失ってはならぬ', 3.4]],
      foes: [{ name: '羽柴の追手', from: { x: EXIT.x + 24, z: EXIT.z + 34 }, list: [uS(3), uA(14)] }],
      reward: '追手を払って浜へ退いた' },
  ],
  win: {
    banner: '鳥取城救援の負け', sub: '兵糧は届かず、毛利は浜へ退いた', award: '鳥取城救援の負け戦を生き延びて退いた',
    say: [['吉川元春', '囲まれた城は、戦わずに落ちる。補給の道を断たれる怖さを知った', 3.4],
      ['小早川隆景', '経家殿は城兵の命と引き換えに腹を召された。忘れてはならぬ', 3.4],
      ['組頭 与三左', 'よう生きて戻った。この悔しさが、次の戦で効くのじゃ', 3.2]],
  },
});
// K651：織田家編の鳥取城の地面・千代川・久松山・道をそのまま使う（getter も写すため descriptor ごと）
m14_tottori.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(TOTTORI_WORLD));
m14_tottori.timeslip = TOTTORI_TIMESLIP;
// 戦場を建てる（織田家編の鳥取城と同じ所）→ 軽い型の setup（毛利の組・段）
{ const s0 = m14_tottori.setup; m14_tottori.setup = function* (rt) { const f = yield* tottoriField(rt); rt.flags.m14Boats = f.boats; s0.call(this, rt); }; }
// K652⑥：荷駄の段が尽きたら、岸の米舟二艘に羽柴の火がかかる（織田家編で羽柴の足軽が焼いた舟と同じ舟）
{ const u0 = m14_tottori.update; m14_tottori.update = function (rt, dt) {
  u0?.call(this, rt, dt);
  const F = rt.flags, W = rt.world;
  if (F.m14Burnt || !F.m14Boats || (F.step || 0) < 2) return;
  F.m14Burnt = true;
  for (const b of F.m14Boats) {
    const p = b.m.position;
    W.addFire(p.x, p.z, { size: 3.4, smoke: false, lightRadius: 26, lightColor: 0xff7a2a, lightStrength: 3, lightDecay: 0, waterReflection: true, h: p.y - W.heightAt(p.x, p.z) + 0.6 });
    W.addSmokeColumn(p.x, p.y + 3, p.z, { size: 3.8 });
  }
}; }
export default m14_tottori;
