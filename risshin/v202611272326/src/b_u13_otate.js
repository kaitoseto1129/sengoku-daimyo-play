// 上杉編 十三戦目「御館の乱」（天正六年〔1578〕三月〜天正七年〔1579〕三月・越後 春日山・御館）。軽い型（light_battle.js）
//   史実：上杉謙信が跡継ぎを決めずに亡くなり、養子の上杉景勝（長尾政景の子）と上杉景虎（北条氏康の子）が家督を争った。
//   景勝は先に春日山城の本丸と金蔵を押さえ、景虎は府内の御館（前の関東管領 上杉憲政の館）に入って戦った。
//   景勝は武田勝頼と和を結んで北条の援けを断ち、翌年三月、御館を攻め落とした。景虎は鮫ヶ尾城へ逃れて自害した。
//   出所：Wikipedia「御館の乱」・上越市の春日山城跡と御館跡の案内。くわしくは docs/chapter_uesugi.md
//   景虎方の旗は北条の紋（hojo）を当てた（景虎は北条氏康の子・北条の援けを受けた）
import { withCastle } from './light_castle.js';
import { KASUGAYAMA_PLAN } from './castles/kasugayama.js';
import { isTouch } from './touch.js';
import { fujinRealN } from './fujin_layout.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const KAGETORA = { flag: 'hojo', armor: 0x3c3226 };
const SPAWN = { x: 0, z: -150 };
const HONMARU = { x: 10, z: -110 };     // 春日山城の本丸の下（景虎方の寄せを受ける所）
const SLOPE = { x: -10, z: -50 };       // 春日山の麓（府内への道）
const TOWN = { x: 10, z: 10 };          // 府内の町（御館の前）
const KAIDO = { x: 58, z: 44 };         // K723 二回目：府内へ入る東の街道（景虎方の援軍が来る道）
const OTATE = { x: -10, z: 70 };        // 御館の門
// K652②（11/25 Sanae・家の編を10分前後に）：逸話の段（K652⑥）＝謙信が倒れた直後、景勝方は誰より先に本丸と金蔵を押さえた（『上杉家御年譜』）。
//   本人が金蔵の口へ走り、景虎方の番を払う。御館が落ちた後、景虎は鮫ヶ尾城へ落ちた＝その供の手を北の道で追う
const KANAGURA = { x: -6, z: -124 };    // 本丸の金蔵の口
const SAMEGAO = { x: 36, z: 118 };      // 鮫ヶ尾へ落ちる北の道

// 11/27 クラウドし（K723② 要件書の見せ場「第12戦まで一緒に戦っていた武将たちが、それぞれ別方向に立っている」）：
//   前は「あちらにも立っておる」の台詞だけで、姿は無かった。始めの一息で、これまでの戦で共に戦った将を本人の前に二つに分けて立たせる。
//   景勝方（斎藤朝信・甘粕景持・本庄繁長）は本丸の方を向いて本人の左に並び、景虎方（上杉景虎・北条高広）は北条の旗で右手に離れて背を向けて立つ。
//   台詞の後、景虎方は府内の方へ馬を返して去り、景勝方は旗本の後ろへ下がる（どちらも着いた所で消す＝戦の兵の数と重さは増やさない）。
//   兵は将五騎だけ（当たらず・討たれず・段の寄せに出されない）。字は足さない
function splitBusho(rt) {
  const F = rt.flags, P = rt.player?.u?.pos;
  if (!P || F.u13Split) return;
  F.u13Split = true;
  const gone = (g) => { for (const u of g.units) if (u.alive && !u.isPlayer) rt.army.despawn(u); };
  const ride = (g, to, sp) => { g.order = 'move'; g.dest = to; g.speed = sp; g.onArrive = gone; };
  const one = (name) => ({ type: 'busho', n: 1, o: { name, horse: true, forceHorse: true, invuln: true, mustLive: true } });
  const base = { fixed: true, noAI: true, aggro: 0, noRout: true, order: 'hold', morale: 100, fullStrength: true, width: 9 };
  const kage = allyGroup(rt, { ...base, name: '景勝方の将', anchor: { x: P.x - 9, z: P.z + 10 }, facing: 0 },
    [one('斎藤朝信'), one('甘粕景持'), one('本庄繁長')]);
  const tora = allyGroup(rt, { ...base, faction: 'hojo', name: '景虎方の将', anchor: { x: P.x + 16, z: P.z + 16 }, facing: Math.PI / 2 },
    [one('上杉景虎'), one('北条高広')]);
  rt.after(9.5, () => { if (tora.count) ride(tora, { x: P.x + 70, z: P.z + 40 }, 7); });
  rt.after(11.5, () => { if (kage.count) ride(kage, { x: P.x - 30, z: P.z - 20 }, 4); });
}

// 11/21 クラウド42（司令塔の振り）：本人の陣の西の山に春日山城（castles/kasugayama.js）を置く。景勝方の城なので味方（team 0）。大手を府内の側（+z）へ向ける（flip）。城の兵が戦場の枠（176）の外に出ないよう西へ寄せた
export const u13_otate = withCastle(lightBattle({
  id: 'u13_otate',
  date: '天正六年（1578）五月　夏・曇り　越後国 春日山・御館',
  intro: '上杉謙信が跡継ぎを決めずに亡くなった。上杉景勝は春日山の本丸を押さえ、上杉景虎は府内の御館に入った。家を割る戦が始まる。',
  history: '天正六年（1578）、上杉謙信が亡くなると、養子の上杉景勝と上杉景虎が家督を争った。景勝は春日山城の本丸を押さえ、景虎は府内の御館に入った。景勝は武田勝頼と和を結び、翌年三月に御館を落とした。景虎は鮫ヶ尾城で自害した。',
  sides: { a: { name: '上杉景勝の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '上杉景虎の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 8000, b: 7000 },   // 11/22 要件書15番（8,000vs7,000）に合わせた
  allyLook: UESUGI, foeLook: KAGETORA,
  minutes: 10,
  playerTaken: 0.5,   // K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  allyDmg: 0.3,   // 11/21 cloud-07 の見つけ「斬り合う相手が少ない」：味方が先に討ち切らないよう味方の刃を 0.4→0.3（42 の u01〜u08 と同じ）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1578, overcast: true, time: 'day', fogFar: 420,
    hills: [[0, -200, 70, 30], [-120, -120, 60, 16], [140, -80, 60, 12], [0, 160, 80, 6]],
    trees: 520, tufts: 2000,
  },
  allies: [
    { name: '上杉景勝の旗本', at: { x: SPAWN.x - 18, z: SPAWN.z - 12 }, fixed: true, list: [busho('上杉景勝'), uS(6), uA(10)] },
    { name: '先手の足軽', at: { x: SPAWN.x + 12, z: SPAWN.z + 6 }, list: [uS(2), uA(20)] },
    { name: '鉄砲衆', at: { x: SPAWN.x - 10, z: SPAWN.z + 10 }, list: [uS(1), uG(8)] },
    { name: '弓衆', at: { x: SPAWN.x + 24, z: SPAWN.z }, list: [uS(1), { type: 'bow', n: 8 }] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, fn: splitBusho, say: [   // K723②：共に戦った将が二つに割れて立つ
      ['上杉景勝', '叔父上が倒れられた。景虎より先に、本丸と金蔵を押さえる', 3.4],
      ['上杉景勝', '金蔵の口に景虎方の番がおる。払え', 3.2],
      ['組頭', '昨日まで同じ毘の旗の下で戦うた者が、あちらにも立っておる……', 3.4]] },
    { kind: 'fight', at: KANAGURA, obj: '本丸の金蔵の口へ走り、景虎方の番を払う', title: '金蔵', sub: '謙信が残した金。先に押さえた者が家を継ぐ',
      say: [['組頭', '金蔵を取れば、兵も米も我らのものじゃ！　走れ！', 3.2]],
      foes: [{ name: '金蔵の番', from: { x: KANAGURA.x + 4, z: KANAGURA.z + 10 }, list: [uS(3), uA(16)] },
        { name: '金蔵の番の弓', from: { x: KANAGURA.x - 12, z: KANAGURA.z + 12 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 35, say: ['見張り', '景虎方の加勢が三の丸から上ってくる！'], foes: [{ name: '三の丸の景虎方', from: { x: KANAGURA.x + 26, z: KANAGURA.z + 26 }, list: [uS(2), uA(14)] }] }],
      reward: '本丸と金蔵を押さえた（景虎は御館に入った）' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KANAGURA.x + 14, z: KANAGURA.z + 12 }, obj: '金蔵の口の石段で、守る景虎方の足軽を討て', limit: 90,
      say: [['組頭', '金蔵を守る景虎方の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '金蔵を守る景虎方の足軽', from: { x: KANAGURA.x + 22, z: KANAGURA.z + 24 }, list: [uS(2), uA(10)] }],
      reward: '金蔵を守る景虎方の足軽を破った' },
    { kind: 'hold', at: HONMARU, label: '本丸の下', obj: '春日山の本丸の下で、景虎方の寄せを受け止める', r: 18, dur: 100,
      title: '春日山', sub: '景虎方が本丸を奪いに山を上ってくる',
      say: [['組頭', '昨日までの味方じゃ。だが手加減すれば本丸を失う！', 3.2]],
      waves: [
        { t: 6, say: ['見張り', '御館の方から兵が上ってくる！'], foes: [{ name: '景虎方の先手', from: { x: HONMARU.x - 6, z: HONMARU.z + 40 }, list: [uS(3), uA(27)] }] },
        { t: 34, say: ['組頭', '脇の谷からも来る！'], foes: [{ name: '景虎方の二の手', from: { x: HONMARU.x + 30, z: HONMARU.z + 34 }, list: [uS(2), uA(18)] }] },
        { t: 70, say: ['見張り', 'まだ来る！　三の手じゃ！'], foes: [{ name: '三の手', from: { x: HONMARU.x - 30, z: HONMARU.z + 36 }, list: [uS(3), uA(18)] }] }],
      reward: '春日山の本丸を守り抜いた' },
    { kind: 'fight', at: SLOPE, obj: '春日山の麓で、景虎方の陣を崩す', title: '麓の陣', sub: '景虎方が麓に陣を張って本丸を囲む',
      say: [['上杉景勝の使番', '御屋形様より。麓の囲みを破り、府内への道を開け', 3.2]],
      foes: [{ name: '景虎方の麓の陣', from: { x: SLOPE.x, z: SLOPE.z + 12 }, list: [uS(3), uA(30)] },
        { name: '景虎方の鉄砲', from: { x: SLOPE.x + 18, z: SLOPE.z + 18 }, list: [uS(1), uG(5)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: SLOPE.x + 30, z: SLOPE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '春日山の麓の囲みを破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SLOPE.x + -14, z: SLOPE.z + 10 }, obj: '麓の道の木戸で、塞ぐ景虎方の足軽を払え', limit: 90,
      say: [['組頭', '木戸を塞ぐ景虎方が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '木戸を塞ぐ景虎方', from: { x: SLOPE.x + -6, z: SLOPE.z + 22 }, list: [uS(2), uA(10)] }],
      reward: '木戸を塞ぐ景虎方を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    { kind: 'fight', at: TOWN, obj: '府内の町で、御館を守る兵を払う', title: '府内', sub: '年が明け、北条の援けは雪で来られない',
      say: [['上杉景勝', '武田とは和を結んだ。北条の兵は峠を越えられぬ。今が攻め時じゃ', 3.4]],
      foes: [{ name: '御館の前の守り', from: { x: TOWN.x, z: TOWN.z + 12 }, list: [uS(3), uA(27)] }],
      later: [{ t: 30, say: ['組頭', '御館から新手が出たぞ！'], foes: [{ name: '御館の新手', from: { x: TOWN.x - 30, z: TOWN.z + 30 }, list: [uS(2), uA(18)] }] }],
      reward: '府内の町を取った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TOWN.x + 14, z: TOWN.z + -12 }, obj: '府内の町屋の陰で、伏せた景虎方の弓を討て', limit: 90,
      say: [['組頭', '伏せた景虎方の弓が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '伏せた景虎方の弓', from: { x: TOWN.x + 22, z: TOWN.z + 0 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '伏せた景虎方の弓を破った' },
    // K723 二回目（要件書⑥景虎方の援軍接近・⑦景勝方が道を抑える）：北条から景虎を助けに来る手を、府内へ入る前の街道で止める
    { kind: 'fight', at: KAIDO, obj: '府内へ入る東の街道で、景虎方の援軍を止めて道を抑えよ', title: '街道', sub: '景虎を助けに来る援軍が近づく。道を抑えられるかが家の行方を決める',
      say: [['見張り', '東の街道に旗が続きます！　景虎方の援軍です！', 3.2], ['上杉景勝', '道を抑えよ。援軍を館へ入れるな', 3.2]],
      foes: [{ name: '景虎方の援軍の先手', from: { x: KAIDO.x + 8, z: KAIDO.z + 24 }, list: [uS(2), uA(22)] },
        { name: '援軍の弓', from: { x: KAIDO.x + 24, z: KAIDO.z + 30 }, list: [uS(1), { type: 'bow', n: 5 }] }],
      later: [{ t: 35, say: ['組頭', '雪の道に後ろ備えが続く！'], foes: [{ name: '援軍の後ろ備え', from: { x: KAIDO.x + 30, z: KAIDO.z + 38 }, list: [uS(2), uA(12)] }] }],
      reward: '景虎方の援軍を街道で止めた' },
    { kind: 'fight', at: OTATE, obj: '御館の門を破り、景虎の旗本を崩す', title: '御館', sub: '景虎の旗本が館を守る',
      say: [['上杉景勝の使番', '館に火が回ります！　景虎殿を逃がすな！', 3.2]],
      foes: [{ name: '上杉景虎の旗本', from: { x: OTATE.x, z: OTATE.z + 8 }, list: [uS(4), uA(21)] }],
      later: [{ t: 40, say: ['組頭', '新手が来るぞ！　構え直せ！'], foes: [{ name: '新手', from: { x: OTATE.x + 30, z: OTATE.z + 30 }, list: [uS(2), uA(15)] }] }],
      reward: '御館の門を破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OTATE.x + -14, z: OTATE.z + 12 }, obj: '御館の堀端で、門を守る景虎方の鉄砲を討て', limit: 90,
      say: [['組頭', '門を守る景虎方の鉄砲が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '門を守る景虎方の鉄砲', from: { x: OTATE.x + -6, z: OTATE.z + 24 }, list: [uS(1), uA(6), uG(4)] }],
      reward: '門を守る景虎方の鉄砲を破った' },
    { kind: 'fight', at: SAMEGAO, obj: '北の道で、鮫ヶ尾へ落ちる景虎の供の手を追う', title: '鮫ヶ尾への道', sub: '景虎は燃える御館を抜け、鮫ヶ尾城へ落ちる',
      say: [['上杉景勝の使番', '景虎殿は北の道を鮫ヶ尾へ！　供の者が道を塞いでおります', 3.4], ['上杉景勝', '……追え。ここで終わらせる', 3]],
      foes: [{ name: '景虎の供の手', from: { x: SAMEGAO.x - 4, z: SAMEGAO.z + 12 }, list: [uS(3), uA(18)] },
        { name: '北条から来た侍', from: { x: SAMEGAO.x + 16, z: SAMEGAO.z + 14 }, list: [uS(3), uA(8)] }],
      later: [{ t: 35, say: ['組頭', '殿を残して先へ逃げたぞ！'], foes: [{ name: '景虎の殿', from: { x: SAMEGAO.x - 24, z: SAMEGAO.z + 22 }, list: [uS(2), uA(12)] }] }],
      reward: '景虎の供の手を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAMEGAO.x + -12, z: SAMEGAO.z + 10 }, obj: '鮫ヶ尾への道で、景虎の供の足軽を追え', limit: 90,
      say: [['組頭', '景虎の供の足軽が出た。槍を揃えよ', 3.2]],
      foes: [{ name: '景虎の供の足軽', from: { x: SAMEGAO.x + -4, z: SAMEGAO.z + 22 }, list: [uS(2), uA(10)] }],
      reward: '景虎の供の足軽を破った' },
  ],
  win: {
    banner: '御館落つ', sub: '御館は落ち、景虎は鮫ヶ尾城へ逃れて自害した。上杉の家は景勝が継いだ', award: '御館の乱を制した',
    say: [['上杉景勝の使番', '景虎殿は鮫ヶ尾へ逃れ、そこで果てられたとのこと', 3.2],
      ['上杉景勝', '兄弟で争うた傷は深い。越後を立て直すぞ', 3.4]],
  },
}), { plan: KASUGAYAMA_PLAN, at: { x: -110, z: -145 }, lift: 10, scale: 0.7, flip: true, team: 0 });
u13_otate.realCap = isTouch ? 250 : 250 + fujinRealN('u13_otate');   // 11/22 K563：パソコンは布陣の表（fujin_layout.js）の分を上限に足す。携帯は250のまま
export default u13_otate;
