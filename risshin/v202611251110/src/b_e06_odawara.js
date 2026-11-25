// 伊達家編「小田原の陣（参陣と白装束）」（天正十八年〔1590〕五月・相模国 小田原）。軽い型（light_battle.js）を戦なしの「場面」に使う。紙は docs/house_date.md ①②④・docs/fujin/e06_odawara.md
//   史実：政宗は秀吉の小田原参陣の催促に遅れ、白装束（死に装束）で参陣して許された逸話（『伊達治家記録』B・『貞山公治家記録』B。白装束は逸話）。字は出さない
//   馬印は進めず（勢いは使わない）、静かに歩いて秀吉の前へ。豊臣編 t12_odawara の城下・陣の絵（豊臣の旗・北条の幟）を使い回す考え。敵はいない・斬り合いは無い
import { lightBattle, uS, uA, busho } from './light_battle.js';
import { odawaraField, ODAWARA_WORLD, ODAWARA_AT } from './b_t12_odawara.js';   // K651：豊臣編の小田原の戦場をそのまま使う（素材は写さない）
import { BATTLE_ASSETS } from './asset_manifest.js';
// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：前の別の戦場（手書きの丘と道）をやめ、
//   豊臣編 t12 の小田原（総構えの土塁と堀・城下・早川・石垣山の林・囲みの陣の帯・海）を odawaraField で建てる。
//   政宗は箱根の底倉に留め置かれた後、石垣山の秀吉の陣へ召された（『伊達治家記録』）＝西の囲みの陣から早川を渡り、石垣山へ登る。
//   石垣山の城はまだ林の中（城が姿を見せるのは六月二十六日）。行き先は小田原の物差し（ODAWARA_AT）で置く

const SHIRO = { flag: 'date', armor: 0xe6e2d6 };      // 白装束（死に装束）
const TOYO = { flag: 'toyotomi', armor: 0x2a2620 };
const AT = ODAWARA_AT;
const SPAWN = { x: -150, z: -40 };                       // 西の山あい（底倉から下りて来た所）
const MON = { x: -82, z: -12 };                          // 総構えの西の囲みの陣（豊臣の陣幕）の入口
const TEA = { x: AT.ishi.x - 16, z: AT.ishi.z - 48 };    // 早川を渡った石垣山の登り口
const HIDE = { x: AT.ishi.x, z: AT.ishi.z - 12 };        // 石垣山の秀吉の陣

export const e06_odawara = lightBattle({
  id: 'e06_odawara',
  date: '天正十八年（1590）五月　晩春・薄曇り　相模国 小田原',
  intro: '政宗は秀吉の呼び出しに遅れた。小田原の陣へ、白装束で参る。戦ではない。静かに歩いて、秀吉の前へ。',
  history: '天正十八年（1590）五月、秀吉の小田原攻めに、政宗は遅れて参陣した。白装束で現れ、許されたと伝わる（逸話）。若い政宗が、一代の賭けに出た日である。',
  sides: { a: { name: '伊達政宗の一行', mon: 'date', faction: 'date' }, b: { name: '豊臣秀吉の陣', mon: 'toyotomi', faction: 'toyotomi' } },
  force: { a: 30, b: 100 },
  allyLook: SHIRO, foeLook: TOYO,
  playerTaken: 0.6,
  friendsSend: 0,
  minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.atan2(MON.x - SPAWN.x, MON.z - SPAWN.z) },   // 囲みの陣を向く
  world: { seed: 1590 },   // 下で豊臣編の小田原の world に置き換える（K651）
  allies: [
    { name: '白装束の政宗', at: { x: SPAWN.x + 6, z: SPAWN.z - 6 }, fixed: true, list: [busho('伊達政宗'), uS(2)] },
    { name: '片倉景綱の供', at: { x: SPAWN.x - 6, z: SPAWN.z + 8 }, list: [busho('片倉景綱'), uS(1), uA(6)] },
    { name: '豊臣の陣', at: { x: HIDE.x - 8, z: HIDE.z }, fixed: true, flag: 'toyotomi', list: [busho('豊臣秀吉'), uS(6), uA(16)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['片倉景綱', '殿、白の装束にございます。……誰も斬り合いませぬ。ただ歩くのみ', 3.6],
      ['伊達政宗', '遅れた者の賭けじゃ。馬印は進めぬ。静かに参る', 3.4]] },
    { kind: 'move', at: MON, label: '陣の入口', obj: '白装束のまま、陣の入口まで歩く', r: 12, max: 90,
      say: [['豊臣の足軽', '白の装束……あれが奥州の伊達か', 3.2]] },
    { kind: 'move', at: TEA, label: '石垣山の道', obj: '石垣山の道を、静かに登る', r: 12, max: 90,
      say: [['豊臣の侍', '遅れて来て、死に装束とは。肝が据わっておる', 3.2]] },
    { kind: 'move', at: HIDE, label: '秀吉の陣', obj: '秀吉の前まで歩いて、膝をつく', r: 10, max: 90,
      say: [['片倉景綱', '殿、秀吉公の前でございます', 3.2]] },
  ],
  win: {
    banner: '参陣、許される', sub: '遅れた政宗は、白装束のまま秀吉の前に立った', award: '白装束で秀吉の陣へ参った',
    say: [['豊臣秀吉', '遅かったな。……面白い。許そう', 3.4],
      ['伊達政宗', 'ありがたく。伊達は、これより太閤殿下に従いまする', 3.4]],
  },
});
e06_odawara.camPull = 1.6;
// K651：豊臣編の小田原の地面（国土地理院の標高）・海・早川・総構えの堀をそのまま使う（getter も写すため descriptor ごと）。参陣は昼なので時刻だけ昼に
e06_odawara.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(ODAWARA_WORLD));
e06_odawara.world.time = 'day';
BATTLE_ASSETS.e06_odawara = BATTLE_ASSETS.t12_odawara;   // 小田原の標高（dem_odawara）を同じく読む
// 戦場を建てる（豊臣編の小田原と同じ所・北条編 h10 と同じ odawaraField）→ 軽い型の setup（伊達の一行・段）
{ const s0 = e06_odawara.setup; e06_odawara.setup = function* (rt) {
  yield* odawaraField(rt);   // 陣幕・総構え・城下・石垣山・船・囲みの陣（見張りの兵は置かない）
  // 参陣は昼：豊臣編の支度が雨夜のために隠す山並みを戻す（豊臣編も昼の段で戻す）
  if (rt.world.mountains) rt.world.mountains.visible = true;
  rt.world.setRainTarget?.(0); rt.world.rainLevel = 0;
  s0.call(this, rt);
}; }
export default e06_odawara;
