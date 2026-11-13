// ======================================================================
// 本能寺の変　静かな本能寺（0〜2分・docs/oda15_plan_1108.md 32「夜明け前・静かな本能寺」）
// 襲われる前の、夜明け前の境内で上様のそばに控える（歩かせる見回りはやめた・kaito 11/9）。
// 済むと、元の「物音・鬨の声」（p1）が始まる。
// 入れ方：b_honnoji.js で wrap(honnoji) を一度。def.p1 を包む（信長で遊ぶ時は元のまま）。
// ======================================================================
import { k15Off, k15Scenes } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { evPerson } from '../b_ev6.js';
import { sfx } from '../audio.js';

export function wrap(def) {
  const p1 = def.p1;
  def.p1 = function (r) {
    const F = r.flags;
    if (F.ending || r.over || !r.player.u.alive) return;
    if (k15Off(r) || F.shizukaDone || F.hp) return p1.call(this, r);
    if (F.k15stage === 'shizuka') return;
    start(r, () => {
      // 静かな場面の間だけ控える。襲撃後まで攻撃対象外のまま残さない。
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
  const stop = () => F.k15stage !== 'shizuka' || F.ending || !rt.player.u.alive;
  rt.banner('天正十年六月二日　夜明け前', '京の本能寺。上様の供は、わずか百ほど');
  // 御殿の近臣（docs/generals_oda_1108.md 32：湯浅直宗）。広間の縁に控える
  F.templeCourtiers = [evPerson(rt, 0, '湯浅直宗', { x: PT.hiroma.x + 2, z: PT.hiroma.z - 3 }, Math.PI, { calm: true, mortal: true, u: { kosode: 1, honnoCloth: true, kosodeCol: 0x3e4652, obi: 0x30251c } })];
  // 11/9 二巡（徳川D）：ほかの近臣も縁に控える（docs/generals_oda_1108.md 32：小倉松寿・金森長則。本能寺で討死）
  F.templeCourtiers.push(evPerson(rt, 0, '小倉松寿', { x: PT.hiroma.x - 2, z: PT.hiroma.z - 3 }, Math.PI, { calm: true, mortal: true, u: { kosode: 1, honnoCloth: true, kosodeCol: 0x5a4636, obi: 0x30251c } }));
  F.templeCourtiers.push(evPerson(rt, 0, '金森長則', { x: PT.hiroma.x + 5, z: PT.hiroma.z - 1 }, Math.PI, { calm: true, mortal: true, u: { kosode: 1, honnoCloth: true, kosodeCol: 0x4a3a2c, obi: 0x30251c } }));
  // 11/9 kaito 試し遊び5：「見回り」「中庭を点検」は歩くだけで意味が無い。歩かせる任務はやめ、
  // 上様のそばで夜明け前の静けさを聞く短い場面にする（docs/honnoji_spec_1109.md 0:00〜1:00：BGMなし・いつもの信長）。
  rt.obj('main', '上様のおそばに控えよ', 'main', true);
  if (F.nb) rt.marker('k15', () => F.nb?.pos, '信長', { h: 2.3, person: true, guidePerson: () => F.nb, guideName: '信長' });
  k15Scenes(rt, [
    // 11/13 クラウドし（K116「中庭に行っても何も起きない」・docs/kaito_honnoji_scene_1110.md「もう寺の中で応戦」）：
    //   静けさは三十六秒から十八秒ほどに縮め、門番の「兵が通る」を早めて、包囲から門の段へすぐ移す。
    [1.5, () => rt.say('森蘭丸', '上様は、まだお目覚めじゃ。足音を立てるな', 3)],
    [3.5, () => rt.say('織田信長', '蘭丸か。……夜が明ければ中国じゃ。猿めの顔を見に行くか', 4)],
    [4.5, () => { rt.banner('東の空が、わずかに白み始めた', '寺の外を、多くの兵が囲んでいく'); sfx('neigh', 0.3); rt.say('門番', '夜明け前に、ずいぶん多くの兵が通りまする', 3.2); }],
    [3.5, () => rt.say('小姓', '中国へ向かう明智殿の兵であろう', 2.8)],
    [3, () => rt.say('門番', '……それにしては、こちらへ来るような', 2.8)],
    [2.5, () => { rt.unmark('k15'); }],
  ], done, stop);
}
