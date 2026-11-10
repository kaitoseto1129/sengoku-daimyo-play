// ======================================================================
// 本能寺の変　静かな本能寺（0〜2分・docs/oda15_plan_1108.md 32「夜明け前・静かな本能寺」）
// 襲われる前の、夜明け前の境内を森蘭丸と見回る。着いた所で必ず何かが起きる：
//   中庭＝昨夜の茶会と碁の話・灯を消して回る僧／表庭＝門の外の通りに、遠く松明の列（中国へ向かう明智の兵かと思う）。
// 見回りが済むと、元の「物音・鬨の声」（p1）が始まる。
// 入れ方：b_honnoji.js で wrap(honnoji) を一度。def.p1 を包む（信長で遊ぶ時は元のまま）。
// ======================================================================
import { k15Off, k15Go, k15Scenes } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { evPerson } from '../b_ev6.js';
import { sfx } from '../audio.js';

export function wrap(def) {
  const p1 = def.p1;
  def.p1 = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.shizukaDone || F.hp) return p1.call(this, r);
    if (F.k15stage === 'shizuka') return;
    start(r, () => {
      // 見回りの間だけ静かに控える。襲撃後まで攻撃対象外のまま残さない。
      for (const g of F.templeCourtiers || []) {
        // 近臣は御殿の戸口を守る。隊の判断で門外の敵へ直進させない。
        g.order = 'hold'; g.noAI = true; g.noPursue = true;
        g.aggro = 6;
        for (const u of g.units) u.noTarget = false;
      }
      F.shizukaDone = true; F.k15on = false; F.k15stage = null; p1.call(this, r);
    });
  };
}

function start(rt, done) {
  const F = rt.flags;
  F.k15stage = 'shizuka'; F.k15on = true;
  // 11/9 bot：長くした戦では、御殿の侍の一太刀（六十余り）が段を重ねるほど効き、最後まで持たない。本人の受ける傷だけを四割に
  if (!rt.player.k15soft) {
    const P = rt.player, td = P.takeDamage;
    P.k15soft = true;
    P.takeDamage = function (a, s) { return td.call(this, a * 0.4, s); };
  }
  const stop = () => F.k15stage !== 'shizuka';
  rt.banner('天正十年六月二日　夜明け前', '京の本能寺。上様の供は、わずか百ほど');
  // 御殿の近臣（docs/generals_oda_1108.md 32：湯浅直宗）。広間の縁に控える
  F.templeCourtiers = [evPerson(rt, 0, '湯浅直宗', { x: PT.hiroma.x + 2, z: PT.hiroma.z - 3 }, Math.PI, { calm: true, mortal: true, u: { kosode: 1, honnoCloth: true } })];
  // 11/9 二巡（徳川D）：ほかの近臣も縁に控える（docs/generals_oda_1108.md 32：小倉松寿・金森長則。本能寺で討死）
  F.templeCourtiers.push(evPerson(rt, 0, '小倉松寿', { x: PT.hiroma.x - 2, z: PT.hiroma.z - 3 }, Math.PI, { calm: true, mortal: true, u: { kosode: 1, honnoCloth: true } }));
  F.templeCourtiers.push(evPerson(rt, 0, '金森長則', { x: PT.hiroma.x + 5, z: PT.hiroma.z - 1 }, Math.PI, { calm: true, mortal: true, u: { kosode: 1, honnoCloth: true } }));
  k15Scenes(rt, [
    [2, () => rt.say('森蘭丸', '見回りじゃ。まず広間の戸締まりを見よ', 4)],
  ], () => k15Go(rt, 'sz-hiroma', PT.hiroma, 4, '御殿の広間の戸締まりを見よ', '広間', () => {
    // 着いたら：奥の居室から上様の声
    k15Scenes(rt, [
      [0.5, () => rt.banner('御殿の広間', '奥の居室に、まだ灯りがともっている')],
      [3, () => rt.say('織田信長', '蘭丸か。……夜が明ければ中国じゃ。猿めの顔を見に行くか', 4.5)],
      [5, () => rt.say('森蘭丸', 'はっ。お休みなされませ', 3)],
      [3.5, () => rt.say('森蘭丸', '足音を立てるな。上様は、ようやくお休みになる', 4)],
    ], () => k15Go(rt, 'sz-niwa', PT.niwa, 4, '中庭を見回れ', '中庭', () => {
    rt.banner('中庭', '茶会の客は帰り、灯が一つずつ消えていく');
    rt.award((t) => t.side.push('夜明け前の境内を見回った'), '夜明け前の境内を見回った');
    k15Scenes(rt, [
      [2.5, () => rt.say('森蘭丸', '昨夜は茶会に碁まで。上様は、たいそうご機嫌であられた', 4.5)],
      [4.5, () => rt.say('小姓', '明日は中国へ。羽柴殿の高松の陣へ、ご出馬と聞きまする', 4.5)],
      [4.5, () => rt.say('森蘭丸', '鐘楼の脇を回り、表庭を見て参れ', 4)],
    ], () => k15Go(rt, 'sz-shoro', { x: -54, z: 36 }, 4, '鐘楼の脇を見回れ', '鐘楼', () => k15Scenes(rt, [
      [0.5, () => rt.banner('鐘楼', '東の空が、わずかに白み始めた')],
      [3, () => rt.say('小姓', '明けの鐘には、まだ早うござるな', 3.5)],
      [4, () => rt.say('森蘭丸', '表庭を見て参れ。門番に、異なき事を確かめよ', 4)],
    ], () => k15Go(rt, 'sz-omote', PT.omote, 4, '表庭から表門を見回れ', '表庭', () => {
      // 着いたら：門の外の通りに、遠く松明の列
      rt.banner('門の外の通り', '遠くに松明の列。馬のいななきが聞こえる');
      sfx('neigh', 0.35);
      k15Scenes(rt, [
        [3, () => rt.say('門番', '夜明け前に、ずいぶん多くの兵が通りまする', 4)],
        [4, () => rt.say('小姓', '中国へ向かう明智殿の兵であろう。西へ出る道じゃ', 4)],
        [4, () => rt.say('門番', '……それにしては、こちらへ来るような', 3.5)],
        [3.5, () => {}],
      ], done, stop);
    }, { limit: 50 }), stop), { limit: 40 }), stop);
  }, { limit: 50 }), stop);
  }, { limit: 50 }), stop);
}
