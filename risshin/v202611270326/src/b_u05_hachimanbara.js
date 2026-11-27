// 上杉編 五戦目「八幡原の戦い」（第四次川中島・永禄四年〔1561〕九月十日）。軽い型（light_battle.js）
//   史実：上杉政虎（謙信）は妻女山に陣を張った。武田信玄は海津城に入り、別働隊で妻女山を突き、八幡原へ追い出す「啄木鳥」の策をとった。
//   政虎はこれを見抜き、九日の夜に妻女山を下りて雨宮の渡しで千曲川を越え、十日の朝の霧が晴れると八幡原の信玄の本陣の前にいた。
//   上杉は次々に新手を当てて攻め（車懸り）、武田信繁・山本勘助らが討ち死にした。昼前に妻女山の別働隊が戻り、上杉は善光寺へ退いた。
//   出所：『甲陽軍鑑』・Wikipedia「川中島の戦い」（第四次合戦）・八幡原史跡公園の案内。天気は docs/weather_takeda_uesugi.md（朝霧が晴れる）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { jinmaku, nobori, carryTorches } from './props.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';

const UESUGI = { flag: 'uesugi', armor: 0x24221f };
const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
// 11/26 K723（kaito 上杉編の要件書・第5戦）：①妻女山の夜 ②松明を消して山を下る ③千曲川を渡る ④夜明け前の霧 ⑤八幡原へ ⑥武田軍発見（霧が割れ正面に信玄本陣）
//   ⑦車懸り ⑧武田本陣へ迫る ⑨別働隊が背後へ戻る ⑩犀川の方へ退く。始めは妻女山（丘 [-80,-220]）の東の肩の陣、夜
const SPAWN = { x: -40, z: -168 };     // 妻女山の陣（東の肩・高さ十三m ほど）
const FOOT = { x: -8, z: -128 };       // 妻女山の麓（千曲川の南岸）
const FIELD = { x: -4, z: -48 };       // 八幡原の南の端（霧の中を進む先）
const RETREAT = { x: -76, z: 96 };     // 犀川の東の岸（善光寺へ退く渡り）
const RIVER = [[-220, -110], [-100, -104], [0, -112], [110, -102], [220, -108]];   // 千曲川（雨宮の渡し）
const SAIGAWA = [[-95, 185], [-92, 120], [-100, 40], [-115, -40], [-135, -104]];   // 犀川（北から南西へ下り千曲川に合う）
const AMEMIYA = { x: 4, z: -86 };       // 雨宮の渡しの向こう岸
const FRONT = { x: -10, z: -20 };       // 霧の中の武田の先手（鶴翼の右）
const NOBUSHIGE = { x: 30, z: 30 };     // 武田信繁の手
const HONJIN = { x: 10, z: 90 };        // 信玄の本陣の前
// K652②（11/25 Sanae・家の編を10分前後に）：逸話の段（K652⑥）＝政虎が放生月毛に乗って信玄の床几へ駆け込み、三太刀斬りつけ、信玄は軍配で受けた（『甲陽軍鑑』）。
//   本人は殿の馬の後ろで、本陣へ戻る武田の旗本を寄せない。その後、妻女山から戻った武田の別働隊（高坂昌信・馬場信春ら）を、甘粕景持の殿と雨宮の渡しの北で防ぐ
const SHOGI = { x: 4, z: 100 };         // 信玄の床几の前
const AMAKASU = { x: 16, z: -66 };      // 雨宮の渡しの北・甘粕の殿の構え

// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：八幡原の地面（千曲川・雨宮の渡し・妻女山・道と森）。武田編 d01 も同じ戦場を使う
export const HACHIMAN_LAND = {
  seed: 1561, time: 'morning', fogFar: 420, sky: { marchMist: 120, marchMistFar: 60 },
  river: RIVER, riverW: 18, riverDepth: 0.6,
  // 11/25 K657②：二つの川の二つ目＝犀川（西で千曲川に合う。K643：水面一本を足すだけ）
  //   11/26 クラウドす：前は戦場の外（x -220 より西・地面は ±180）で見えなかった。北から西を回って雨宮の渡しの西で千曲川に落ちる＝八幡原が二つの川の間（川中島）に見える
  sea: [{ pts: SAIGAWA, w: 8, depth: 0.5, still: true, levelAt: () => -0.4 }],
  carve: [{ pts: SAIGAWA, w: 8 }],
  hills: [[-80, -220, 70, 30], [160, 160, 80, 22], [-180, 120, 70, 16]],
  // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：雨宮の渡しの向こう岸・霧の中の武田の先手・武田信繁の手・信玄の本陣の前 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
  paths: [{ pts: [[0, -150], [4, -86], [-10, -20], [30, 30], [10, 90]], w: 3 }],
  groves: [{ x: 160, z: 160, r: 30, n: 30 }, { x: -180, z: 120, r: 30, n: 30 }],
  trees: 360, tufts: 2200,
};

// 11/27 クラウドさ（K657② 車懸りの絵）：前は「車懸り」の札が出ても本人の周りに上杉の手が一つも無く、野に一人で立っていた（docs/evidence_now/k657_u05/kuruma/c_kuruma1.png・d_kuruma2.png）。
//   段⑦の始めに上杉の新手（一の手）が本人の後ろから信繁の手へ当たり、⑦の二つ目（入れ替わり）で二の手が西から出て、一の手は後ろへ下がる＝新手が次々に入れ替わる絵にする
function kurumaHand(rt, name, from, to) {
  const F = rt.flags;
  const g = allyGroup(rt, { name, flag: 'uesugi', anchor: from, facing: 0, fullStrength: true, noRout: true, aggro: 24, seekRange: 50, morale: 95, dmgMult: 0.3, order: 'attack' },
    dress([uS(2), uA(12)], UESUGI));
  g.anchor = { ...to };
  (F.allies || (F.allies = [])).push(g);
  return g;
}

export const u05_hachimanbara = lightBattle({
  id: 'u05_hachimanbara',
  date: '永禄四年（1561）九月十日　秋・朝霧　信濃国 八幡原',
  intro: '妻女山の夜。上杉政虎は松明を消して山を下り、千曲川を渡る。霧が晴れれば、信玄の本陣は目の前にある。',
  history: '永禄四年（1561）九月、上杉政虎（のちの謙信）は妻女山に陣を張った。武田信玄は別働隊で妻女山を突く策をとったが、政虎はこれを見抜いて夜のうちに山を下り、十日の朝、霧の晴れた八幡原で信玄の本陣に襲いかかった。武田信繁・山本勘助らが討ち死にする激戦となったが、昼前に武田の別働隊が戻り、上杉は善光寺へ退いた。',
  sides: { a: { name: '上杉政虎の軍', mon: 'uesugi', faction: 'uesugi' }, b: { name: '武田信玄の本隊', mon: 'takeda', faction: 'takeda' } },
  force: { a: 13000, b: 8000 },
  allyLook: UESUGI, foeLook: TAKEDA,
  playerTaken: 0.4,   // 11/26 ヒ三：信長で出陣の一回目が149秒で倒れたので五割→四割。K652②：段を足して長くなった分、本人の受ける傷を六割→五割（信長で出陣の一回目が足した段の前後で倒れた）
  thick: true,   // 型の受けの段の厚み（三の手・新手）を使う
  allyDmg: 0.3,   // 味方の刃（11/21 型の既定 0.4 では味方が先に討ち切り、本人の討ち取りが少なかった）
  minutes: 10,
  restHp: 0.8,   // K652②：途中の立て直しで命を八割まで戻す（長くなった戦の後半で、信長で出陣の一回目が倒れた）
  stepLimit: 160,   // K652②：一つの段は百六十秒で次へ（light_battle.js）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: { ...HACHIMAN_LAND, clearAt: [[-26, -150, 12], [-14, -136, 10]], paths: [{ pts: [[SPAWN.x, SPAWN.z], [FOOT.x, FOOT.z], [AMEMIYA.x, AMEMIYA.z], [FIELD.x, FIELD.z], [FRONT.x, FRONT.z], [30, 30], [10, 90]], w: 3 }] },   // K723：妻女山の陣から下る道（d01 と同じ地面・道だけ足す）
  allies: [
    { name: '上杉政虎の旗本', at: { x: SPAWN.x - 16, z: SPAWN.z - 10 }, fixed: true, list: [busho('上杉政虎'), uS(6), uA(10)] },
    { name: '柿崎景家の手', at: { x: SPAWN.x + 14, z: SPAWN.z + 8 }, list: [busho('柿崎景家'), uS(2), uA(12)] },
    { name: '先手の足軽', at: { x: SPAWN.x - 14, z: SPAWN.z + 8 }, list: [uS(2), uA(12)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 26, z: SPAWN.z - 2 }, list: [uS(1), uG(8)] },
  ],
  // K723：段の番号は要件書の①〜⑩。①の夜の陣は数えない段（rest）、②〜⑩と退きの十が右上の札（十任務・K674 の数は保つ）。
  //   K674 で足した名ばかりの段（待ち構える足軽・囲みに寄る旗本・殿の道の足軽）は外し、要件書の「下る・霧の中を進む・犀川へ退く」に替えた
  steps: [
    // ① 妻女山の夜：海津城の炊煙が多い（『甲陽軍鑑』・謙信が武田の夜討ちを見抜いた逸話）。陣の篝火は焚いたまま残す
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['物見', '海津の城から、炊ぎの煙がいつもより多く上がっております', 3.4],
      ['上杉政虎', '信玄は今夜、この妻女山を突く気じゃ。その前に山を下り、こちらから本陣を突く', 3.6],
      ['上杉政虎', '篝火は焚いたまま残せ。手の松明は消せ。声を立てるな', 3.4]] },
    // ② 松明を消して山を下る
    { kind: 'move', at: FOOT, label: '妻女山の麓', obj: '松明を消し、闇の中で妻女山を下る', r: 12, max: 90,
      say: [['組頭', '松明を消せ。前の者の背だけを見て歩け', 3.2]] },
    // ③ 千曲川を渡る
    { kind: 'move', at: AMEMIYA, label: '雨宮の渡し', obj: '雨宮の渡しで、千曲川を越える', r: 12,
      say: [['組頭', '馬の口を縛れ。音を立てるな', 3]] },
    // ④ 夜明け前の霧 ⑤ 八幡原へ（update が白む空と深い霧にする）
    { kind: 'move', at: FIELD, label: '八幡原', obj: '夜明け前の霧の中、八幡原へ進む', r: 12, max: 90,
      say: [['組頭', '霧が深い。前の旗を見失うな', 3], ['上杉政虎', 'このまま進め。霧が晴れた時、信玄の前におればよい', 3.4]] },
    // ⑥ 武田軍発見：霧が割れる。その正面に信玄本陣（update がこの段の始めに霧を二十秒で晴らす）
    { kind: 'fight', at: FRONT, obj: '霧が割れた。目の前の武田の先手を崩す', title: '霧が割れる', sub: '正面に、信玄の本陣の旗',
      say: [['武田の侍', '霧の中から上杉が！　妻女山におるはずでは！', 3], ['上杉政虎', '見よ、あれが信玄の本陣じゃ。かかれ！', 3.2]],
      foes: [{ name: '武田の先手', from: { x: FRONT.x - 4, z: FRONT.z + 12 }, list: [uS(3), uA(20)] },
        { name: '武田の鉄砲', from: { x: FRONT.x + 16, z: FRONT.z + 18 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['柿崎景家', '次の手、かかれ！　休ませるな！'], foes: [{ name: '武田の脇の備', from: { x: FRONT.x + 30, z: FRONT.z + 8 }, list: [uS(2), uA(14)] }] }],
      reward: '霧の中で武田の先手を崩した' },
    // ⑦ 車懸り：一の手が信繁の手を受け止め、二の手と入れ替わる
    { kind: 'hold', at: NOBUSHIGE, label: '信繁の手の前', obj: '武田信繁の手を、槍で受け止める', r: 16, dur: 85,
      title: '車懸り', sub: '上杉は次々に新手を当てる。武田信繁が身を挺して防ぐ',
      say: [['上杉政虎の使番', '殿より。新手を次々に当てよ。武田に息をつかせるな', 3.2]],
      waves: [
        { t: 2, say: ['武田の侍', '典厩さまを守れ！　ここは通さぬ！'], foes: [{ name: '武田信繁の手', from: { x: NOBUSHIGE.x, z: NOBUSHIGE.z + 28 }, list: [uS(4), uA(20)] }] },
        { t: 40, say: ['組頭', '山本勘助の手じゃ！　押し返せ！'], foes: [{ name: '山本勘助の手', from: { x: NOBUSHIGE.x - 24, z: NOBUSHIGE.z + 38 }, list: [uS(3), uA(14)] }] }],
      reward: '武田信繁の手を受け止めた' },
    { kind: 'fight', at: { x: NOBUSHIGE.x + -16, z: NOBUSHIGE.z + -12 }, obj: '車懸りの次の手と入れ替わり、駆け寄る武田の弓を討つ', limit: 90,
      say: [['柿崎景家', '一の手は退け！　二の手、入れ替われ！', 3.2]],
      foes: [{ name: '駆け寄る武田の弓', from: { x: NOBUSHIGE.x + -8, z: NOBUSHIGE.z + 0 }, list: [uS(2), uA(6), uB(3)] }],
      reward: '車懸りの次の手で武田の弓を破った' },
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '息を整えよ。手負いは後ろへ回せ', 3]] },   // K652②：段が増えた分の立て直し（手当てと組の集め直し。待つ秒で稼ぐためではない）
    // ⑧ 武田本陣へ迫る
    { kind: 'fight', at: HONJIN, obj: '信玄の本陣の前へ斬り込む', title: '本陣', sub: '武田の旗本が本陣を囲む',
      say: [['上杉政虎', '信玄はあそこじゃ。旗本を崩せ！', 3.2]],
      foes: [{ name: '武田の旗本', from: { x: HONJIN.x, z: HONJIN.z + 8 }, list: [uS(5), uA(18)] },
        { name: '本陣の鉄砲', from: { x: HONJIN.x + 14, z: HONJIN.z + 12 }, list: [uS(1), uG(6)] }],
      reward: '信玄の本陣の前まで斬り込んだ' },
    { kind: 'hold', at: SHOGI, label: '信玄の床几', obj: '殿が信玄に斬りかかる間、床几へ戻る武田の旗本を寄せない', r: 14, dur: 70,
      title: '三太刀', sub: '政虎が馬で床几へ駆け込む。信玄は軍配で受ける',
      say: [['上杉政虎', '信玄、そこにおったか！', 3], ['組頭', '殿の馬の後ろを空けるな！　旗本を寄せるな！', 3.2]],
      waves: [
        { t: 6, say: ['武田の侍', 'お屋形さまが！　床几へ戻れ！'], foes: [{ name: '武田の旗本の戻り', from: { x: SHOGI.x + 24, z: SHOGI.z + 20 }, list: [uS(4), uA(14)] }] },
        { t: 34, say: ['見張り', '原大隅の槍が来るぞ！'], foes: [{ name: '原大隅の手', from: { x: SHOGI.x - 26, z: SHOGI.z + 22 }, list: [uS(3), uA(12)] }] }],
      reward: '殿が信玄に斬りかかる間、旗本を寄せなかった' },
    // ⑨ 武田別働隊が背後へ戻る
    { kind: 'fight', at: AMAKASU, obj: '背後の雨宮の渡しで、妻女山から戻る武田の別働隊を防ぐ', title: '別働隊', sub: '空の妻女山から、武田の別働隊が千曲川を渡って戻る',
      say: [['見張り', '南から武田の新手！　妻女山の別働隊が戻りました！', 3.2], ['甘粕景持', '殿は善光寺へ退かれる。ここは我らが殿じゃ。渡しで止めよ', 3.4]],
      foes: [{ name: '高坂昌信の手', from: { x: AMAKASU.x - 6, z: AMAKASU.z - 30 }, list: [uS(3), uA(18)] },
        { name: '馬場信春の鉄砲', from: { x: AMAKASU.x + 18, z: AMAKASU.z - 34 }, list: [uS(1), uG(6)] }],
      later: [{ t: 40, say: ['組頭', '川の下手からも渡ってくる！'], foes: [{ name: '馬場信春の手', from: { x: AMAKASU.x + 34, z: AMAKASU.z - 26 }, list: [uS(2), uA(14)] }] }],
      reward: '渡しで武田の別働隊を防いだ' },
    // ⑩ 犀川の方へ退く（善光寺への道）
    { kind: 'move', at: RETREAT, label: '犀川の渡り', obj: '八幡原を北へ抜け、犀川の渡りへ退く', r: 14, max: 120,
      say: [['甘粕景持', '別働隊の足は止めました。殿は善光寺へ', 3.2], ['組頭', '振り返るな。犀川を越えれば善光寺じゃ', 3.2]] },
  ],
  // K723：①の夜の陣の篝火・手の松明、信玄の本陣（陣幕と幟。霧が割れた時に正面に見える）
  setup(rt) {
    const W = rt.world, F = rt.flags;
    W.setTime('night', true);
    for (const [x, z] of [[-48, -176], [-30, -178], [-52, -160]]) W.addFire(x, z, { h: 1.3, size: 0.6 });   // 残して行く陣の篝火
    const hands = (F.allies || []).flatMap((g) => (g.units || []).filter((u) => u.alive && !u.name).slice(0, 2)).slice(0, 5);
    F.u05Torch = carryTorches(W, hands, { size: 0.5 });
    // 陣幕は床几（SHOGI）より北の奥に置く（前は床几の上に掛かり、三太刀の段の後に本人が幕の内で南へ出られなかった・act bot 557秒）
    rt.scene.add(jinmaku(W, SHOGI.x, SHOGI.z + 24, 14, 10, 6, { mon: 'takeda' }));
    for (const dx of [-12, -4, 4, 12]) rt.scene.add(nobori(W, SHOGI.x + dx, SHOGI.z + 14, 'takeda', 7));   // 風林火山の旗の並び（霧の奥の目印）
  },
  update(rt) {
    const W = rt.world, F = rt.flags, i = F.dp?.i ?? -1;
    const T = F.u05Torch;
    if (T) {
      T.update();
      if (i >= 1 && !F.u05Dark) {   // ② 下り始めで手の松明を一つずつ消す（陣の篝火は残る）
        F.u05Dark = true;
        T.list.forEach((c, k) => rt.after(0.6 + k * 0.7, () => { if (c.f) { W.removeFire(c.f); c.f = null; } }));
      }
    }
    if (i >= 3 && !F.u05Dawn) {   // ④ 夜明け前：空が白み、深い霧（晴れるまで消えない）
      F.u05Dawn = true; W.setTime('morning'); if (W.fade) W.fade.dur = 60;
      W.marchMistAt = W.time; W.marchMistT = 1e5;
    }
    if (i >= 5 && !F.u05Kuruma1) {   // ⑦ 車懸り：一の手が本人の後ろから信繁の手へ
      F.u05Kuruma1 = kurumaHand(rt, '上杉の一の手', { x: NOBUSHIGE.x - 6, z: NOBUSHIGE.z - 34 }, { x: NOBUSHIGE.x + 4, z: NOBUSHIGE.z + 8 });
    }
    if (i >= 6 && !F.u05Kuruma2) {   // ⑦ 入れ替わり：二の手が西から入り、一の手は後ろへ下がって息を整える
      F.u05Kuruma2 = kurumaHand(rt, '上杉の二の手', { x: NOBUSHIGE.x - 40, z: NOBUSHIGE.z - 16 }, { x: NOBUSHIGE.x - 8, z: NOBUSHIGE.z + 6 });
      const g1 = F.u05Kuruma1;
      if (g1 && g1.count) { g1.order = 'hold'; g1.aggro = 6; g1.seekRange = 0; g1.anchor = { x: NOBUSHIGE.x - 4, z: NOBUSHIGE.z - 26 }; }
    }
    if (i >= 4 && !F.u05Clear) {   // ⑥ 霧が割れる：二十秒で晴れ、正面の本陣の幟が見える
      F.u05Clear = true; W.marchMistAt = W.time; W.marchMistT = 20;
    }
  },
  win: {
    banner: '善光寺へ退く', sub: '妻女山の武田の別働隊が戻る。上杉は兵を退いた', award: '八幡原で信玄の本陣まで迫った',
    say: [['上杉政虎', '信繁を討った。ここまでじゃ。犀川を越え、善光寺へ退く', 3.4]],
  },
});
export default u05_hachimanbara;
