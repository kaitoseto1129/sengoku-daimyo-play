// 今川家編 十戦目「桶狭間の戦い（今川の側）」（永禄三年〔1560〕五月十九日・尾張国 桶狭間）。軽い型（light_battle.js）・H3（docs/house_imagawa.md ①④⑤）
//   史実：今川義元は約二万五千（通説。『信長公記』A は四万五千）で尾張へ入り、朝に丸根・鷲津の砦を落とした。昼、桶狭間山に本陣を据えて休む所へ、
//   西から急な雨（石氷を投げ打つような雨・楠が東へ倒れた）。雨が晴れると織田信長の手（約二千・通説）が本陣へ打ちかかった。
//   義元は旗本三百騎ほどに丸く囲まれて退いたが、二度三度と打ちかかられて五十騎ほどに減り、服部小平太が槍を付け、毛利新介が首を取った（『信長公記』A）。
//   K651（kaito 11/25「立場を入れ替えるだけでできるやつはそうしよう」）：前の別の戦場（同じ標高の手書きの丘・別の幕と輿）をやめ、織田家編の桶狭間（b_okehazama.js）の戦場を okeField で建てる。
//   地形・西からの雨と雷・田楽狭間の段と水たまり・桶狭間山の本陣の幕と輿・外周の丘と砦は織田の戦と同じ物（写さず import）。遊ぶ側を今川の旗本の足軽に入れ替え、行き先は織田の戦場の物差し（OKE_AT）で置く。
//   この家だけの仕組み「大軍の綻び」：味方の備（前備・旗本・後備）の間に金の細い帯。進むと細り、伝令（本人）が号令を届けると太く戻る。雨の中で切れ、その切れ目から織田が入る。字・札・ボタンは足さない。
//   今川の側の「勝ち」（K514 史実のまま・義元は討たれる）：義元の旗本として最後まで本陣を守り、生き残った者を沓掛の方へ退かせて生き延びること。本物の兵は250人まで。
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { okeField, OKE_WORLD, OKE_AT } from './b_okehazama.js';   // K651：織田の桶狭間の戦場をそのまま使う（素材は写さない）
import { nobori } from './props.js';
import { sfx } from './audio.js';
import { obiTick } from './imagawa_obi.js';
export { obiTick };   // 前からの名で読む所のため

// ---- 場所：織田の戦場の内の座標（OKE_AT.point(x, z)。内の z が負へ行くほど桶狭間山の本陣・その奥が沓掛の方）。織田は谷の出口と馬の道から寄せる ----
const P = OKE_AT.point;
const HONJIN = OKE_AT.honjin;           // 桶狭間山の本陣（陣幕の内）
const MAE = OKE_AT.matsui;              // 前備（松井宗信ら）：本陣から大高の方へ下る坂の上
const ATO = P(20, -165);                // 後備（朝比奈ら）：本陣の奥・沓掛の方
const SPAWN = P(38, -118);              // 本陣の幕の東の外。本人は旗本の足軽
const GAP = P(4, -86);                  // 本陣と前備の間（帯が切れる所）
const GATE = OKE_AT.mouth;              // 本陣の幕の口（輿の前）
const IN = P(18, -110);                 // 幕の内・義元の床几の前
const KUTSU = P(10, -178);              // 沓掛の方へ退く所
const IMAGAWA = { flag: 'imagawa', armor: 0x302e2a };
const ODA = { flag: 'oda', armor: 0x24221f };
const headTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const FACE_W = headTo(HONJIN, OKE_AT.exit);   // 谷の出口（織田の来る方）へ向く

export const i10_okehazama = lightBattle({
  id: 'i10_okehazama',
  date: '永禄三年（1560）五月十九日　午の刻　尾張国 桶狭間',
  intro: '丸根と鷲津の砦は落ちた。義元様は桶狭間山で休んでおられる。大軍の列は長く伸びている。あなたは旗本の足軽。',
  history: '永禄三年（1560）五月、今川義元は約二万五千（通説。『信長公記』は四万五千と書く）で尾張へ入った。十九日の朝、松平元康が丸根、朝比奈泰朝が鷲津の砦を落とし、義元は桶狭間山に本陣を据えて休んだ。昼すぎ、西から石氷を投げ打つような急な雨が降り、雨が晴れると織田信長の手（約二千・通説）が本陣へ打ちかかった。義元は旗本三百騎ほどに丸く囲まれて退いたが、何度も打ちかかられて五十騎ほどに減り、服部小平太が槍を付け、毛利新介が首を取った（『信長公記』）。大軍は長く伸びた列のまま、本陣だけを突かれた。',
  sides: { a: { name: '今川義元の旗本', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田信長の手', mon: 'oda', faction: 'oda' } },
  force: { a: 25000, b: 2000 },
  allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4,
  foeDmg: 0.6,
  friendsSend: 1,
  minutes: 9,
  noMarch: true,   // 本陣で休んでいる所から始める（共通の行軍の入りは使わない）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE_W },
  world: { seed: 1560 },   // 下で織田の桶狭間の world に置き換える（K651）
  allies: [
    { name: '前備（松井宗信の手）', at: MAE, face: FACE_W, list: [busho('松井宗信'), uS(3), uA(8)] },
    { name: '今川義元の旗本', at: IN, face: FACE_W, fixed: true, dmg: 0.5, list: [busho('今川義元', { horse: false }), uS(5), uA(8)] },
    { name: '後備（朝比奈の手）', at: ATO, face: FACE_W, list: [uS(2), uA(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['今川義元', '丸根も鷲津も落ちたか。まことに目出度い。ここで一息入れよ', 3.6],
      ['組頭', '列が長う伸びておる。前備は大高の方へ行き過ぎじゃ', 3.2],
      ['組頭', 'お主が走れ。前備に、本陣へ寄れと伝えよ', 3]] },
    { kind: 'move', at: MAE, label: '前備', obj: '細った帯をたどり、前備へ号令を届ける', r: 14, max: 110,
      say: [['組頭', '金の帯をたどれ。細うなった所が、列の切れかけじゃ', 3.4]] },
    { kind: 'rest', dur: 10, heal: 0.2, say: [
      ['松井宗信', '承った。前備は本陣へ寄せる', 3],
      ['組頭', '西の空が暗い……。雨じゃ！　ひどい雨が来るぞ', 3.2]] },
    { kind: 'fight', at: GAP, obj: '雨の中、列の切れ目から入った織田の手を止める', title: '綻び', sub: '帯が切れた', max: 110, limit: 120,
      say: [['組頭', '帯が切れた！　その切れ目から、敵が入って来るぞ！', 3.2], ['織田の侍', '雨は上がった！　かかれ、かかれ！', 3]],
      foes: [{ name: '織田の先手', from: OKE_AT.horse, list: [uS(3), uA(12)] }],
      later: [{ t: 30, say: ['組頭', '北からも来る！　本陣へ下がって固めよ'], foes: [{ name: '織田の二の手', from: P(-40, -60), list: [uS(2), uA(8), uG(2)] }] }],
      reward: '列の切れ目で織田の先手を止めた' },
    { kind: 'hold', at: GATE, label: '輿の前', obj: '義元様の輿の前で、旗本と共に守る', r: 16, dur: 85, title: '旗本', sub: '義元様を一人にしない',
      say: [['今川義元', '慌てるな。三百騎で丸く囲め。輿は捨てよ、馬を引け', 3.6], ['織田信長', '旗本はあれぞ！　かかれ！', 3]],
      waves: [{ t: 4, foes: [{ name: '信長の馬廻', from: P(-10, -80), list: [uS(3), uA(10)] }] },
        { t: 34, say: ['組頭', '二度、三度と来る！　囲みを崩すな！'], foes: [{ name: '織田の三の手', from: P(40, -80), list: [uS(2), uA(8)] }] }],
      reward: '旗本として本陣の囲みを守った' },
    // K652⑥ 逸話の段（『信長公記』：服部小平太が義元にかかり、膝を切られて倒れ伏す）。本人は義元の脇に立ち、幕の内へ踏み込む服部小平太を共に斬り伏せる。字・札・ボタンは足さない
    { kind: 'fight', at: IN, obj: '幕の内で、義元様と共に服部小平太を斬り伏せる', title: '膝の口', sub: '義元、小平太の膝を斬る', max: 100, limit: 90,
      say: [['服部小平太', '義元公とお見受けいたす！', 2.8], ['今川義元', '推参なり！', 2.4], ['組頭', '御大将の脇を固めよ！　小平太を斬れ！', 3]],
      foes: [{ name: '服部小平太の手', from: GATE, list: [busho('服部小平太', { horse: false }), uS(2), uA(4)] }],
      later: [{ t: 14, say: ['組頭', '御大将が小平太の膝を斬った！　押し返せ！'], foes: [] },
        { t: 34, say: ['毛利新介', '義元はどこじゃ！　首を取れ！'], foes: [{ name: '毛利新介の手', from: P(18, -72), list: [busho('毛利新介', { horse: false }), uS(2), uA(6)] }] }],
      reward: '義元様の脇で服部小平太を退けた' },
    { kind: 'move', at: KUTSU, label: '沓掛', obj: '生き残った者と、沓掛の方へ退く', r: 16, max: 120,
      say: [['組頭', '……御大将が討たれた。旗が倒れた。退け、沓掛へ退け！', 3.6], ['組頭', '振り向くな。生きて駿河へ帰るのじゃ', 3]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'rest', dur: 8, heal: 0.3, say: [['組頭', '振り返るな。御屋形様の御首は、まだ渡しておらぬ', 3.2], ['使番', '織田の追手が沓掛の道へ回りまする！', 3]] },
    { kind: 'hold', at: KUTSU, label: '沓掛の道', obj: '沓掛の道で、追って来る織田の手を止める', r: 16, dur: 70, title: '沓掛の道', sub: '雨が止み、織田の追手が来る',
      say: [['組頭', 'ここで止めねば、皆討たれる', 3]],
      waves: [
        { t: 3, foes: [{ name: '織田の追手', from: { x: KUTSU.x + 10, z: KUTSU.z + 50 }, list: [{ type: 'samurai', n: 1, o: { name: '織田の組頭' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '横の谷からも来る！'], foes: [{ name: '谷の織田', from: { x: KUTSU.x - 30, z: KUTSU.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '沓掛の道で織田の追手を止めた' },
    { kind: 'fight', at: ATO, obj: '後備の陣の跡に入り込んだ織田の手を払い、道を開ける', title: '後備の跡', sub: '朝比奈の後備はもう退いた', max: 120, limit: 120,
      say: [['組頭', '道を開けよ。生きて駿河へ帰る', 3]],
      foes: [{ name: '後備の跡の織田', from: { x: ATO.x + 10, z: ATO.z - 10 }, list: [busho('織田の侍大将', { mustLive: false, invuln: false }), uS(3), uA(12)] }],
      reward: '後備の跡の織田を払った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: GAP.x - 16, z: GAP.z + 22 }, obj: '前備の坂の下で、雨に紛れて来る織田の足軽を討つ', max: 100, limit: 90,
      say: [['旗本', '雨で見えぬ。耳で槍を構えよ', 3.2]],
      foes: [{ name: '雨に紛れた織田の足軽', from: { x: GAP.x - 4, z: GAP.z + 10 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '前備の坂の下を守った' },
    { kind: 'hold', at: { x: GAP.x + 10, z: GAP.z - 34 }, label: '本陣の幕の前', obj: '本陣の幕の前で、輿へ寄る織田の手を、旗本と共に受け止める', r: 16, dur: 45,
      say: [['旗本', '幕へ寄らせるな。輿を守れ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '輿へ寄る織田の手', from: { x: GAP.x + 22, z: GAP.z - 46 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '輿へ寄る織田の手', from: { x: GAP.x - 4, z: GAP.z - 20 }, list: [uS(2), uA(7)] }] }],
      reward: '本陣の幕の前を守った' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'move', at: KUTSU, label: '沓掛の道', obj: '帯をたどり、沓掛の道へ戻って生き残った者をまとめる', r: 16, max: 100,
      say: [['組頭', '生き残った者を集めよ。御首の列を守る', 3]] },
  ],
  win: {
    banner: '桶狭間', sub: '本陣を守り、生き延びた', award: '桶狭間で義元の旗本として最後まで守り、生き延びた',
    say: [['組頭', '三百騎が、五十騎になるまで囲んだ。わしらは最後まで御大将を一人にせなんだ', 3.6],
      ['朝比奈の侍', '後備は沓掛で固める。鳴海の岡部殿は、まだ城を守っておられるそうな', 3.4],
      ['組頭', '生きて駿府へ帰るぞ。この雨を忘れるな', 3.2]],
  },
  setup(rt) {
    const W = rt.world, F = rt.flags;
    // 本陣の幕・輿・幟は織田の戦場（okeField）が建てる。ここは前備と後備の幟だけ（見た目だけ。形は props.js の物を使い回す）
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, MAE.x + dx, MAE.z + dz, 'imagawa', 5));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, ATO.x + dx, ATO.z + dz, 'imagawa', 5));
    F.obi = { a: 1, b: 1, t: 0 };   // a＝旗本⇄前備、b＝旗本⇄後備 の帯の太さ（0〜1）
    F.obiAt = [MAE, HONJIN, ATO];
    // 未の刻の前：曇りの昼から始め、雨の段で石氷まじりの豪雨（空の色は織田の戦と同じ storm の見た目）
    rt.world.setTime?.('after'); rt.world.setRainTarget?.(0);
  },
  update(rt, dt) {
    const F = rt.flags, D = F.dp, O = F.obi;
    if (!O) return;
    const i = D?.on ? D.i : -1;
    // 帯の太さ：前備へ走る間は細っていく（列が伸びる）。号令が届くと戻る。雨の段で切れる。本陣の守りの間に後ろの帯も細る
    if (i === 1) O.a = Math.max(0.28, O.a - dt / 45);
    else if (i === 2) {
      if (!O.back) { O.back = true; O.a = 1; sfx('kakegoe', 0.6); }
      O.rainT = (O.rainT || 0) + dt;
      if (O.rainT > 3 && !F.rain) { F.rain = true; rt.world.setTime?.('storm'); rt.world.setRainTarget?.(1); rt.world.hailT = 22; sfx('thunder', 0.8); }   // 『信長公記』石氷を投げ打つ様に
      if (O.rainT > 4) O.a = Math.max(0, O.a - dt / 4);
    } else if (i >= 3) {
      O.a = 0;
      if (!F.rain) { F.rain = true; rt.world.setTime?.('storm'); rt.world.setRainTarget?.(1); }
      if (i >= 4) O.b = Math.max(0.2, O.b - dt / 70);
      // 雨が上がってから織田が打ちかかった（『信長公記』）。戦いの段に入ったら雨を弱める
      if (!F.rainOff && O.rainT > 0 && i === 3) { F.rainOff = true; rt.after(8, () => { rt.world.setRainTarget?.(0.25); rt.world.addPuddles?.(30); }); }
    }
    obiTick(rt, dt);
    // 退く段：本陣の旗本は残って討たれる（義元は大勢に守られ一人でいない）。本人が離れたら旗本の兵を外す（遠くへ去った兵は数えない）
    if (i >= 6 && !F.i10Gone) {
      const H = F.allies?.[1], P = rt.player?.u?.pos;
      if (H && P && Math.hypot(P.x - HONJIN.x, P.z - HONJIN.z) > 90) {
        F.i10Gone = true;
        for (const u of H.units) { try { rt.army.despawn(u); } catch (e) { /* なし */ } }
      }
    }
  },
});

// K651：織田の桶狭間の地面・雨・田・道・林をそのまま使う（getter も写すため descriptor ごと）。迷った時の一言だけ今川の側に
i10_okehazama.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(OKE_WORLD));
i10_okehazama.world.blockedHint = () => '本陣へは幕の口から入れ';
// 戦場を建てる（織田の桶狭間と同じ所）→ 軽い型の setup（今川の組・段）
{ const s0 = i10_okehazama.setup; i10_okehazama.setup = function* (rt) { yield* okeField(rt); s0.call(this, rt); }; }
export default i10_okehazama;
