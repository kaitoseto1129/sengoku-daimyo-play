// ======================================================================
// 戸次川　①の段（0〜3分）：鏡城の下の陣の軍議 → 土手の道を浅瀬まで進む → 皆で渡る
// 15分の構成（docs/toyo15_plan_1108.md の 9）。渡る前に「同じ時に別の所でも戦っている」を見せる：
//   川向こうの鶴賀城の坂で島津の囲みと大友の城兵が組み合う（軽い作り addClash。本物にはならない）、使番が豊前の戦を知らせる。
// 呼び方：setup で install(rt, K)、toStep(1) で march(rt, K)、update の①の間で update(rt, K, dt)。
// ======================================================================
import { clash } from '../b_sekigahara.js';
import { sfx } from '../audio.js';
import { jinmaku, nobori } from '../props.js';

const live = (g) => g && g.count > 0;

// 鶴賀城の坂の囲み（軽い大軍）。⑤の追う段で島津が囲みを解いて退く（tsuigeki.js が rout する）
export function install(rt, K) {
  const F = rt.flags, gate = { x: K.CASTLE.x + Math.sin(K.GATE_A) * (K.FORT_R + 12), z: K.CASTLE.z + Math.cos(K.GATE_A) * (K.FORT_R + 12) };
  try {
    F.siegeC = clash(rt, { x: gate.x, z: gate.z, facing: K.GATE_A, w: 26, gap0: 0, seed: 15862, noWake: true, noRout: true,
      A: { flag: 'otomo', armor: 0x2a2420, count: 70, flagRate: 0.4, guns: true },
      B: { flag: 'shimazu', armor: K.ARM.shimazu, count: 200, flagRate: 0.5, guns: true, bows: true } });
    rt.after(1, () => F.siegeC?.go?.());
  } catch (e) { F.siegeC = null; }
  // 城の外曲輪が燃えている（攻められて三日目）
  try { rt.world.addFire(K.CASTLE.x + 12, K.CASTLE.z + 14, { size: 3.4, h: 0.3, blackSmoke: true }); } catch (e) { /* 火は飾り */ }
  F.s1 = { st: 0 };
}

// 軍議の後、四国の衆が土手の道を浅瀬の南の岸まで進む（渡るのは皆が揃ってから）
export function march(rt, K) {
  const F = rt.flags, B = F.blk, S = F.s1;
  if ((S.st || 0) >= 1) return;   // 飛ばして先に進軍・渡りへ移った後に、十三秒の下知で戻さない
  S.st = 1; S.t0 = rt.t;
  // 11/19 クラウドし（kaito_now 3：描かずの数え 携帯 30秒で本人は浅瀬の口に着き、四国の衆は二 m/秒で百 m 後ろ＝本人の周りは手勢だけ）：
  //   土手の道の行軍を早足に（信親の備が浅瀬の口へ五十六秒→三十五秒）。本人が口で待つ十五秒の間に備が追い付く
  // 11/20 クラウド02（司令塔の頼み・描かずの数え：本人が浅瀬の口へ約5m/秒で歩くと 24〜36秒の約12秒、20m内の味方が0〜23人）：仙石の先陣は本人より先に浅瀬の口へ着く速さに（3.8→5.4）。信親・十河も一割増し
  K.go(B.sen, { x: 32, z: 30 }, 5.4);
  K.go(B.nobu, { x: 12, z: 46 }, 4.4);
  K.go(B.sogo, { x: 30, z: 62 }, 4.0);
  K.go(B.moto, { x: -4, z: 96 }, 2.4);
  for (const g of [F.nobu, F.sogo, F.tsune, F.moto, ...(F.allyBands || [])]) if (live(g)) g.speed = 4.2;
  if (live(F.sen)) F.sen.speed = 5.4;
  sfx('taiko', 0.6);
  const say = (t, who, s) => rt.after(t, () => { if (F.step === 1 && (S.st || 0) < 2) rt.say(who, s, 3); });   // 渡りが始まったら軍議の声は止める（渡りの声と重ねない）
  say(6, '使番', '鶴賀城より狼煙！　二の丸まで攻め込まれております');
  say(22, '長宗我部元親', '弥三郎、深追いはならぬぞ');
  say(26, '長宗我部信親', '父上、ご案じなさいますな');
  say(33, '使番', '鶴賀の城主、利光宗魚様は矢に当たって討死なされた由。城はなお持ちこたえております');
  say(44, '使番', '豊前では黒田様・毛利の衆が宇留津の城を落とされた由');
  say(56, '使番', '日向からは島津義弘の大軍も豊後へ入ったと聞こえまする');
  say(50, '物見', '川向こうの林は静か。島津の伏せは見えませぬ');
  say(62, '仙石秀久', '見よ、川向こうは伊集院の先手だけじゃ。一押しで崩れる');
  // docs/hetsugigawa_spec_1109.md：島津は「思ったより少ない」。仙石は攻め、元親は待つ（どちらも馬鹿にしない）
  say(14, '長宗我部の足軽', '島津というても……思ったより少ないの');
  say(17.5, '仙石秀久', '鶴賀は今日にも落ちる。待てば城を見殺しじゃ');
  say(29.5, '長宗我部元親', '殿下の本隊を待つべきじゃ。川を背にして戦うは危うい');
}

// 11/18 22:35 持ち主（せっかち bot 35秒：軍議の声が二十五秒続いて「飛ばす」が出ない）：渡りの下知の前は飛ばせる。飛ばすと進軍と渡りの下知へ
export function canSkip(rt) { const S = rt.flags.s1; return rt.flags.step === 1 && S && (S.st || 0) < 2 && rt.t > 3 && !rt.over ? '渡りの下知まで待つ' : ''; }
export function skipWait(rt, K) { const S = rt.flags.s1; if (!S || (S.st || 0) >= 2) return; if (!S.st) march(rt, K); cross(rt, K); }

// 南の岸に揃ったら渡る（物見の知らせの後）
function cross(rt, K) {
  const F = rt.flags, B = F.blk, S = F.s1;
  if (S.st >= 2) return;
  S.st = 2; S.t2 = rt.t;
  F.mText = '戸次川の浅瀬を渡れ'; rt.obj('main', F.mText, 'main', true);
  rt.say('物見', '川向こう、伊集院の先手およそ二千。鶴賀の囲みは家久の本隊にござる', 3);
  rt.after(3.4, () => { if (F.step === 1) rt.say('仙石秀久', '皆、川を渡れ！　鶴賀を救うのじゃ', 2.8); });
  rt.after(4, () => {
    if (F.step !== 1) return;
    sfx('taiko', 0.9);
    K.go(B.sen, { x: 32, z: -36 }, 4.2);   // 11/20 cloud-41（戸次川の主・cloud-02 の案）：仙石の先陣の渡りを早める（3.4→4.2）
    S.crossLeg = 1;
    S.legT = rt.t;
    for (const g of [F.nobu, F.sen, F.sogo, F.tsune, F.mine]) if (live(g)) g.speed = 4.6;
    for (const g of F.allyBands || []) if (live(g)) g.speed = 4.4;
    // 11/9 夜 kaito：渡る所こそ危ういのに、島津は強く攻めて来ない（遠くで一度鳴るだけ）
    rt.after(9, () => { if (F.step === 1) { rt.army.play('volley', { x: 40, z: -78 }, 0.5); rt.say('長宗我部の侍', '……来ないぞ。', 2.2); } });
    rt.after(15, () => { if (F.step === 1) rt.say('土佐の足軽', '島津は弱気か？', 2.2); });
  });
  // K404（kaito 11/20「まだ誰も渡っていないのに向こう岸に陣幕が張られている。渡ってから陣を張る」）：陣幕と幟は信親の備が渡り切ってから pitchCamp で立てる
}
// 渡った先の岸に陣幕と四国の衆の幟を立てる（当たりの無い幕。一度だけ）
function pitchCamp(rt) {
  const S = rt.flags.s1;
  if (!S || S.campAt != null) return;
  S.campAt = rt.t;
  const W = rt.world;
  try {
    rt.scene.add(jinmaku(W, CAMP2.x, CAMP2.z, 12, 8, 4, { mon: 'chosokabe', solid: false, gapNorth: 4 }));
    for (const [dx, dz, k] of [[-9, 6, 'chosokabe'], [-3, 7, 'chosokabe'], [3, 7, 'chosokabe'], [9, 6, 'chosokabe'], [-9, -6, 'miyoshi'], [9, -6, 'toyotomi']]) rt.scene.add(nobori(W, CAMP2.x + dx, CAMP2.z + dz, k, 5.5));
    for (const [x, z, k] of [[-56, -42, 'otomo'], [-12, -52, 'chosokabe'], [64, -36, 'miyoshi'], [88, -52, 'toyotomi']]) for (const dx of [-8, 0, 8]) rt.scene.add(nobori(W, x + dx, z - 4, k, 5));
  } catch (e) { /* 飾り */ }
  sfx('taiko', 0.5);
  rt.say('長宗我部信親', '陣幕を張れ！　旗を立てよ！　列を整えて島津の先手を迎えるぞ', 3);
}
// 渡った先の岸の陣（元親・信親の陣幕。浅瀬の出口 (20,−24) の西四十 m・表の備の列の後ろ）
export const CAMP2 = { x: -26, z: -32 };

// ①の行き先：渡るまでは南の岸の浅瀬の口、渡れの後は北の岸
export function pin(rt) {
  const S = rt.flags.s1;
  return !S || S.st < 2 ? { x: 20, z: 36 } : { x: 20, z: -22 };
}
export function crossing(rt) { return (rt.flags.s1?.st || 0) >= 2; }

// 11/17 K352 kaito：川を渡ったのに「浅瀬を渡れ」の札が残り、渡っても任務が済まなかった（浅瀬の出口の 26m の輪の外、下の瀬や斜めに上がった所では北岸と認めなかった）。
//   北の岸（z<-14）へ上がっていれば、どちらの瀬から渡っても渡り切った事にする
const onNorth = (K, P) => P.z < -14 && P.z > -70 && (Math.abs(P.x - K.FORD.x) < 70 || Math.abs(P.x - K.FORD2.x) < 40);
// 本人の渡河は必須。後続一組の足止めだけでは北岸で待ち続けさせない。
export function ready(rt, K) {
  const F = rt.flags, S = F.s1, P = rt.player.u.pos;
  // 対岸ならどこでもよいとはしない。指定した浅瀬の出口まで本人が渡る。
  if (!crossing(rt) || !onNorth(K, P)) return false;
  const arrived = K.lightPos(F.blk.nobu).z < -20 && (!live(F.nobu) || F.nobu.center().z < -16);
  // 元親への渡河の下知を出し、本人が北岸で列を整えたら進む。後続の到着だけを待ち続けない。
  // 渡った先で伊集院の先手と目の前（十八 m）で向き合ったら、待たせずに「先手を攻めろ」へ（攻めてよいか迷わせない。K352）
  const facing = !!rt.army.nearestEnemy(rt.player.u, 18, (o) => !o.fleeing && !o.noTarget);
  // K403（kaito 11/20「渡ってから陣形を整える段を入れる。整えずに大軍で渡ると先手を一気に蹴散らせてしまう」）：備が渡り切ったら陣を張り、八秒は列を整えてから先手へ
  const formed = S.campAt != null && rt.t - S.campAt >= 8;
  // 11/20 cloud-41（K403 の続き）：北岸に上がった途端に先手と向き合うと、陣を張る前に「先手を攻めろ」へ飛んでいた（描かずの通しで61秒に同じ秒）。向き合った時も陣を張ってからにする
  return (facing && S.campAt != null && rt.t - S.campAt >= 5) || ((arrived || (S.crossLeg >= 4 && S.northAt != null && rt.t - S.northAt > 6)) && formed);
}

export function update(rt, K) {
  const F = rt.flags, S = F.s1, B = F.blk;
  // 11/19 クラウドせ（kaito_now 3：描かずの数え 携帯 30秒で本人の六十 m 内の味方 38人。本人は始めから浅瀬へ歩き出すのに、備と旗本は軍議の十三秒の下知まで陣に立ち、百 m 後ろに残った）：
  //   本人が始まりの陣から二十五 m 出たら、下知を待たずに四国の衆も土手の道を進む（軍議の声は進みながら続く）
  if (S && !S.st && rt.t > 1.5) { const P0 = rt.player.u.pos; if (Math.hypot(P0.x - K.START.x, P0.z - K.START.z) > 12) march(rt, K); }
  // 11/18 持ち主（中学生 bot：西の土手 (-248,22) へ迷い出て、浅瀬の印が百八十 m 先のまま十分余り渡れなかった）：
  //   始まりの陣（浅瀬の口から百五十七 m）より三十 m 余り遠く迷い出て、まだ北岸にいない間は、二十秒ごとに手勢の声で浅瀬の向きを言う（字の札は足さない。軍議の声の間は出さない）
  if (S && rt.t > 30) {
    const P1 = rt.player.u.pos;
    if (Math.hypot(P1.x - 20, P1.z - 36) > 190 && !onNorth(K, P1) && rt.t - (S.strayT ?? -99) > 20) {
      S.strayT = rt.t;
      rt.say(F.mine?.leader?.name || '手勢の侍', P1.x < 20 ? '浅瀬は南じゃ！　仙石様の旗の方へ戻られよ' : '浅瀬は北じゃ！　仙石様の旗の方へ戻られよ', 2.6);
    }
    // 11/19 08:25 持ち主（中学生 bot 四戦に二度、「浅瀬を渡れ」のまま印が七十三〜百十四 m 先で三十秒寄れず、一戦は渡るまで二百十秒）：
    //   百九十 m の内で迷う間は声が無かった。渡れの間、印へ二十秒で五 m も寄れなければ、手勢の声で浅瀬の向きを言う（二十秒に一度・字の札は足さない）
    if (S.st === 2 && !onNorth(K, P1)) {
      const q = pin(rt), d = Math.hypot(P1.x - q.x, P1.z - q.z);
      if (S.pinD == null || d < S.pinD - 5) { S.pinD = d; S.pinT = rt.t; }
      else if (d > 25 && rt.t - S.pinT > 20 && rt.t - (S.strayT ?? -99) > 20) {
        S.strayT = rt.t; S.pinT = rt.t; S.pinD = d;
        const dx = q.x - P1.x, dz = q.z - P1.z;
        // 向きは実の向き（小地図の北＝−x・実の東＝−z。b_t06_hetsugi.js の座標の注）
        const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? '南' : '北') : (dz < 0 ? '東' : '西');
        rt.say(F.mine?.leader?.name || '手勢の侍', `浅瀬は${dir}じゃ！　旗の列に続いて渡られよ`, 2.6);
      }
    }
  }
  // 仙石→十河→長宗我部の順で渡る。三備を同時に動かすと、岸に近い信親が十河を追い越していた。
  if (S?.st === 2) {
    const P = rt.player.u.pos;
    if (!S.northHailed && onNorth(K, P)) {
      S.northHailed = true;
      S.northAt = rt.t;
      F.mText = '北岸に陣を敷け'; rt.obj('main', F.mText, 'main', true);
      rt.say('長宗我部信親', '北岸に陣を敷け！　旗を立て、後続の備を迎えよ！', 2.8);
      rt.after(3.4, () => { if (F.step === 1) rt.say('長宗我部の侍', '陣幕を張れ！　島津の先手が来るぞ、列を整えよ！', 2.8); });
    }
    // 11/20 cloud-41：後続の渡りを早めた分、陣を張るのも北岸に着いて十八秒で（三十秒→十八秒）
    if (S.campAt == null && (S.crossLeg >= 4 || (S.northAt != null && rt.t - S.northAt > 18))) pitchCamp(rt);
    // 11/20 cloud-41（戸次川の主・cloud-02 の案「仙石先陣の march を早める」）：後続の備は前の備を二十五秒待っていた→十二秒
    if (S.crossLeg === 1 && (K.lightPos(B.sen).z < -14 || rt.t - S.legT > 12)) {
      S.crossLeg = 2;
      S.legT = rt.t;
      K.go(B.sogo, { x: 28, z: -28 }, 3.2);
      rt.say('十河存保', '仙石の備に続け！　十河の衆、浅瀬を渡るぞ！', 2.8);
    } else if (S.crossLeg === 2 && (K.lightPos(B.sogo).z < -14 || rt.t - S.legT > 12)) {
      S.crossLeg = 3;
      S.legT = rt.t;
      K.go(B.nobu, { x: 16, z: -34 }, 3.6);
      rt.say('長宗我部信親', '次は我らじゃ。北岸で備を整えよ！', 2.8);
    } else if (S.crossLeg === 3 && (K.lightPos(B.nobu).z < -14 || rt.t - S.legT > 12)) {
      // 元親の本隊も最後に渡り、北の岸の浅瀬の口の後ろに控える（11/9 夜：後ろはまだ川の近く）
      S.crossLeg = 4;
      K.go(B.moto, { x: 4, z: -30 }, 2.6);
    }
    return;
  }
  if (S && S.st <= 1) {
    // 11/13 K136・bot：本人が浅瀬の口に四十七秒で着いても七十秒まで何も起きなかった。着いたら手勢の声を一つ、渡りも仙石の下知（六十二秒）の直後へ早める
    const P0 = rt.player.u.pos, dF = Math.hypot(P0.x - 20, P0.z - 36);
    if (dF < 26 && !S.arrived) { S.arrived = true; S.arrivedAt = rt.t; }
    // 到着を数える範囲と声を掛ける範囲を揃える。印の手前で止まっても無言で待たせない。
    // 11/15 モ三 bot：声は26mで出るので、印の近く（16m）に着いた時は6秒無言だった。真上でもう一声。
    if (dF < 16 && S.hailed && !S.near) { S.near = true; S.nearAt = rt.t; rt.say('仙石秀久', '来たか。ここで信親殿を待て。川は深いぞ', 2.6); }
    if (S.near && !S.near2 && rt.t - S.nearAt > 4) { S.near2 = true; rt.say('物見', '川向こうに旗が動く。まだ渡るな', 2.4); }
    if (dF < 26 && !S.hailed) {
      S.hailed = true;
      F.mText = '浅瀬の南口で下知を待て'; rt.obj('main', F.mText, 'main', true);
      rt.say(F.mine?.leader?.name || '手勢の侍', '浅瀬の口じゃ。信親様の備が揃い次第、渡るぞ', 2.6);
    }
  }
  if (!S || S.st !== 1) return;
  const el = rt.t - S.t0, n = K.lightPos(B.nobu), P = rt.player.u.pos;
  // 軍議の後、口へ着いた本人を十五秒より長く待たせない。後続の渡る順は保つ。
  if (S.arrived && el > 35 && (Math.hypot(n.x - 12, n.z - 46) < 20 || rt.t - S.arrivedAt >= 15)) { cross(rt, K); return; }
  // 11/16 クラウドさ bot：戦の声は字幕を出さないので、印の真上に着いても見た目は六秒何も変わらなかった。印の上に着いたら四秒で渡りの下知（後続の渡る順は cross のまま）
  if (S.near && el > 20 && rt.t - S.nearAt >= 4) { cross(rt, K); return; }
  // 信親の備が浅瀬の口に着き、本人も来たら渡る（遅れても九十秒で渡り始める）
  if ((el > 70 && Math.hypot(n.x - 12, n.z - 46) < 14 && Math.hypot(P.x - 20, P.z - 36) < 26) || el > 80) cross(rt, K);
}
