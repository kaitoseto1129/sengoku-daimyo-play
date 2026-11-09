// ======================================================================
// 高遠城　曲輪突破の段（6〜11分・docs/oda15_plan_1108.md 30「曲輪突破・激しい近接戦」）
// 三の丸を取った後：①西の搦手で中将信忠が自ら塀に上がる知らせ（この戦の一番有名な場面）
// ②二の丸の門から城兵の新手が斬って出る知らせ（元の二の丸の守りと土橋の前で斬り合う）。
// 二の丸を取った後：本丸の門の前の近習の知らせ。元の本丸・はな・盛信の最期へつなぐ。
// 入れ方：b_takato.js で wrap(takato, K) を一度。def.onZoneFall を包む。K は GATE_NI・GATE_HON。
// ======================================================================
import { k15Off, k15Scenes, k15Wave } from '../oda15_kit.js';
import { enemyGroup } from '../bhelp.js';
import { start as honStart } from './honmaru.js';   // 本丸の段
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const fall = def.onZoneFall;
  def.onZoneFall = function (r, id) {
    const F = r.flags, was = { san: F.sanFell, ni: F.niFell };
    const out = fall.call(this, r, id);
    if (k15Off(r) || F.ending) return out;
    if (id === 'san' && !was.san && F.sanFell && !F.k15san) { F.k15san = true; sanStage(r, K); }
    if (id === 'ni' && !was.ni && F.niFell && !F.k15ni) { F.k15ni = true; niStage(r, K); }
    return out;
  };
}

function sanStage(rt, K) {
  const F = rt.flags, NI = K.GATE_NI;
  k15Scenes(rt, [
    [6, () => { rt.banner('中将信忠、自ら塀に上がる', '西の搦手で、信忠が塀に取り付き「続け」と下知した'); sfx('horagai', 0.6); }],
    [4, () => rt.say('使番', '中将様が自ら塀に上がられた！　大手も遅れを取るな！', 4.5)],
    [5, () => rt.say('森長可', '総大将に先を越されては、森の名折れじゃ。二の丸へ押せ！', 4.5)],
    [8, () => {
      // 11/8 bot：元の二の丸の守りだけで三分余り斬り合う。新手の一手は足さず、門の開く知らせだけ（時間を敵の数で伸ばさない）
      rt.banner('二の丸の門が開く', '城兵の新手が、土橋を渡って斬って出る');
      rt.say('足軽', '二の丸から新手じゃ！　仁科の旗本が出たぞ！', 3.5);
      // 土橋の前の乱戦：新手は本人だけを狙わず、味方の列へ斬り込む（傷は軽め）
      k15Wave(rt, { make: enemyGroup, name: '仁科の旗本の新手', faction: 'takeda', at: { x: K.GATE_NI.x + 8, z: K.GATE_NI.z }, to: { x: 46, z: 6 },
        list: [{ type: 'samurai', n: 2, o: { name: '仁科の旗本' } }, { type: 'ashigaru', n: 7 }], label: '二の丸の新手', sec: 80,
        flee: { x: K.GATE_NI.x - 10, z: K.GATE_NI.z }, reward: '土橋の前で仁科の新手を退けた', look: (g) => { g.dmgMult = 0.6; } });
    }],
  ], null, () => F.niFell);
}

function niStage(rt, K) {
  const F = rt.flags, HON = K.GATE_HON;
  k15Scenes(rt, [
    [5, () => rt.say('使番', '本丸の仁科五郎、近習を集めて門を固めた。女子供まで刀を取ったと', 4.5)],
    [6, () => rt.banner('本丸の逆寄せ', '仁科の近習が、本丸の門の前で最後の槍をそろえる')],
  ], () => honStart(rt, K), () => F.ending);
}
