// ======================================================================
// 本能寺の変　表庭の踏み止まり（4〜7分・docs/oda15_plan_1108.md 32「門前戦・森蘭丸ら防戦・信長が軽装で戦闘」）
// 表門が破られた後、すぐ本堂へ退かず：表庭で森蘭丸と踏み止まり、上様が本堂へ退く時を稼ぐ。
// 塀を越えた明智勢と、門から入る明智勢の二つの波。信長は縁から弓を射る（『信長公記』：初めは弓、弦が切れて槍）。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.p4 を包む。K は本体の akechi・uS・uA。
// ======================================================================
import { k15Freeze, k15Heal, k15Off, k15Go, k15Scenes, k15Track } from '../oda15_kit.js';
import { PT, GATES } from '../honno_tera.js';
import { evPerson } from '../b_ev6.js';

export function wrap(def, K) {
  const p4 = def.p4;
  def.p4 = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.omoteDone || (F.hp || 0) >= 4) return p4.call(this, r);
    if (F.k15stage === 'omote') return;
    start(r, K, () => { k15Heal(r); F.omoteDone = true; F.k15on = false; F.k15stage = null; p4.call(this, r); });
  };
}

function start(rt, K, done) {
  const F = rt.flags;
  F.k15stage = 'omote'; F.k15on = true;
  k15Freeze(rt, 'omote');   // 前の段の時計を止める
  const stop = () => F.k15stage !== 'omote' || F.ending;
  const at = { x: PT.omote.x - 2, z: PT.omote.z + 2 }, gx = GATES.main.x, gz = GATES.main.z;
  rt.banner('表庭で踏み止まる', '上様が本堂へ退く時を、蘭丸と稼げ');
  // 明智は光秀一人の軍にしない（docs/generals_oda_1108.md 32）：門の外の通りに、明智光忠・藤田伝五・溝尾茂朝がそれぞれの備で構える
  if (!F.k15akechiGen) {
    F.k15akechiGen = true;
    [['明智光忠', -12], ['藤田伝五', 0], ['溝尾茂朝', 12]].forEach(([n, dz]) =>
      evPerson(rt, 1, n, { x: gx + 10, z: gz + dz }, -Math.PI / 2, { guard: 3, ash: 4, aggro: 0, calm: true, g: { faction: 'akechi', flag: 'akechi' } }));
    K.say(rt, '小姓', '門の外に桔梗の旗がいくつも……　光秀の一門衆じゃ', 3.5);
  }
  k15Scenes(rt, [
    [1, () => K.say(rt, '森蘭丸', '上様が退かれるまで、この庭を一歩も通すな！', 3.5)],
  ], () => k15Go(rt, 'om-niwa', at, 5, '表庭で、森蘭丸と踏み止まれ', '表庭', () => {
    const w1 = K.akechi(rt, '塀を越えた明智勢', [[gx - 2, gz - 10], [at.x + 4, at.z]], [K.uS(1), K.uA(3)], { entered: true, player: true, dmg: 0.5 });
    K.say(rt, '小姓', '塀を越えて来たぞ！', 3);
    k15Track(rt, w1, '塀を越えた明智勢', { sec: 60, reward: '表庭で塀を越えた明智勢を討った' }, () => k15Scenes(rt, [
      [1.5, () => {
        // 門の守りで既に弦が切れた時は、再び弓を取ったと知らせない。
        const bow = F.nb?.wpnKind === 'bow';
        rt.banner(bow ? '上様、弓で迎え撃つ' : '上様、槍で迎え撃つ',
          bow ? '小袖のまま縁に立ち、寄せ手へ矢を放つ' : '小袖のまま縁に立ち、槍で寄せ手を迎え撃つ');
      }],
      [3.5, () => K.say(rt, '織田信長', '寄せよ、明智が者ども。この信長が相手じゃ', 4)],
      [3, () => {
        const w2 = K.akechi(rt, '門から入る明智勢', [[gx + 2, gz], [at.x + 3, at.z - 1]], [K.uS(2), K.uA(3)], { entered: true, player: true, dmg: 0.5 });
        K.say(rt, '森蘭丸', '門から次が来る！　槍をそろえよ！', 3);
        k15Track(rt, w2, '門から入る明智勢', { sec: 70, reward: '表庭で上様の退く時を稼いだ' }, () => k15Scenes(rt, [
          [1, () => {
            if (F.nb?.alive && F.nb.wpnKind === 'bow') {
              K.nbWeapon(rt, 'spear');
              K.say(rt, '織田信長', '弦が切れた。……槍を持て！', 3.5);
            } else K.say(rt, '織田信長', '槍をそろえよ。寄せ手を奥へ通すな！', 3.5);
          }],
          [3.5, () => {
            // 三の波：鉄砲の煙の向こうから、門の口を破った明智の侍衆
            const w3 = K.akechi(rt, '門を押し破る明智の侍', [[gx + 1, gz + 3], [at.x + 3, at.z + 1]], [K.uS(3), K.uA(1)], { entered: true, player: true, dmg: 0.5 });
            K.say(rt, '小姓', '侍衆が押し入ったぞ！', 3);
            k15Track(rt, w3, '明智の侍衆', { sec: 60, reward: '表庭で明智の侍衆を押し返した' }, () => k15Scenes(rt, [
              [1, () => K.say(rt, '森蘭丸', '上様、本堂へ！　ここは我らが', 3.5)],
              [3.5, () => {}],
            ], done, stop));
          }],
        ], null, stop));
      }],
    ], null, stop));
  }, { limit: 40 }), stop);
}
