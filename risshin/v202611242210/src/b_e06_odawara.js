// 伊達家編「小田原の陣（参陣と白装束）」（天正十八年〔1590〕五月・相模国 小田原）。軽い型（light_battle.js）を戦なしの「場面」に使う。紙は docs/house_date.md ①②④・docs/fujin/e06_odawara.md
//   史実：政宗は秀吉の小田原参陣の催促に遅れ、白装束（死に装束）で参陣して許された逸話（『伊達治家記録』B・『貞山公治家記録』B。白装束は逸話）。字は出さない
//   馬印は進めず（勢いは使わない）、静かに歩いて秀吉の前へ。豊臣編 t12_odawara の城下・陣の絵（豊臣の旗・北条の幟）を使い回す考え。敵はいない・斬り合いは無い
import { lightBattle, uS, uA, busho } from './light_battle.js';

const SHIRO = { flag: 'date', armor: 0xe6e2d6 };      // 白装束（死に装束）
const TOYO = { flag: 'toyotomi', armor: 0x2a2620 };
const SPAWN = { x: 150, z: 20 };
const WIND = [0.3, 0.2];
const MON = { x: 60, z: 10 };      // 陣の入口
const TEA = { x: -30, z: 0 };      // 石垣山の道
const HIDE = { x: -90, z: -10 };   // 秀吉の陣

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
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1590, time: 'day', fogFar: 380, sky: { wind: WIND, windStrength: 0.5, overcast: 0.3 },
    hills: [[HIDE.x - 30, HIDE.z - 10, 50, 14], [160, -90, 60, 10], [20, 120, 60, 8]],
    paths: [{ pts: [[150, 20], [60, 10], [-30, 0], [-90, -10]], w: 4 }],
    groves: [{ x: 40, z: 60, r: 30, n: 24 }, { x: -40, z: -60, r: 34, n: 28 }],
    trees: 320, tufts: 2000,
  },
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
export default e06_odawara;
