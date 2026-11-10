// ======================================================================
// 本能寺の変　夜明け前の短い静けさ（docs/kaito_honnoji_play_1109.md）
// 見回りを課さず、信長と蘭丸の短い会話から「物音・鬨の声」（p1）へつなぐ。
// 入れ方：b_honnoji.js で wrap(honnoji) を一度。def.p1 を包む（信長で遊ぶ時は元のまま）。
// ======================================================================
import { k15Off, k15Scenes } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { evPerson } from '../b_ev6.js';

export function wrap(def) {
  const p1 = def.p1;
  def.p1 = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.shizukaDone || F.hp) return p1.call(this, r);
    if (F.k15stage === 'shizuka') return;
    start(r, () => {
      // 会話の間だけ静かに控える。襲撃後まで攻撃対象外のまま残さない。
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
  // 11/9 の試し遊び：見回りの任務は廃止。近臣のそばで始め、短い静けさから敵襲へつなぐ。
  // 場所へ着かなくても務めを果たした扱いにする巡回と、その褒美は置かない。
  k15Scenes(rt, [
    [2, () => rt.say('織田信長', '蘭丸か。……夜が明ければ中国じゃ。猿めの顔を見に行くか', 4.5)],
    [5, () => rt.say('森蘭丸', 'はっ。お休みなされませ', 3)],
    [3, () => {}],
  ], done, stop);
}
