// ======================================================================
// 戸次川　①の段（0〜3分）：鏡城の下の陣の軍議 → 土手の道を浅瀬まで進む → 皆で渡る
// 15分の構成（docs/toyo15_plan_1108.md の 9）。渡る前に「同じ時に別の所でも戦っている」を見せる：
//   川向こうの鶴賀城の坂で島津の囲みと大友の城兵が組み合う（軽い作り addClash。本物にはならない）、使番が豊前の戦を知らせる。
// 呼び方：setup で install(rt, K)、toStep(1) で march(rt, K)、update の①の間で update(rt, K, dt)。
// ======================================================================
import { clash } from '../b_sekigahara.js';
import { sfx } from '../audio.js';

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
  S.st = 1; S.t0 = rt.t;
  K.go(B.sen, { x: 32, z: 30 }, 2.0);
  K.go(B.nobu, { x: 12, z: 46 }, 2.0);
  K.go(B.sogo, { x: 30, z: 62 }, 1.9);
  K.go(B.moto, { x: -4, z: 96 }, 1.8);
  for (const g of [F.nobu, F.sen, F.sogo, F.tsune, F.moto]) if (live(g)) g.speed = 3.6;
  sfx('taiko', 0.6);
  const say = (t, who, s) => rt.after(t, () => { if (F.step === 1) rt.say(who, s, 3); });
  say(6, '使番', '鶴賀城より狼煙！　二の丸まで攻め込まれております');
  say(22, '長宗我部元親', '弥三郎、深追いはならぬぞ');
  say(26, '長宗我部信親', '父上、ご案じなさいますな');
  say(33, '使番', '鶴賀の城主、利光宗魚様は矢に当たって討死なされた由。城はなお持ちこたえております');
  say(44, '使番', '豊前では黒田様・毛利の衆が宇留津の城を落とされた由');
  say(56, '使番', '日向からは島津義弘の大軍も豊後へ入ったと聞こえまする');
  say(50, '物見', '川向こうの林は静か。島津の伏せは見えませぬ');
  say(62, '仙石秀久', '見よ、川向こうは伊集院の先手だけじゃ。一押しで崩れる');
}

// 南の岸に揃ったら渡る（物見の知らせの後）
function cross(rt, K) {
  const F = rt.flags, B = F.blk, S = F.s1;
  if (S.st >= 2) return;
  S.st = 2; S.t2 = rt.t;
  rt.say('物見', '川向こう、伊集院の先手およそ二千。鶴賀の囲みは家久の本隊にござる', 3);
  rt.after(3.4, () => { if (F.step === 1) rt.say('仙石秀久', '皆、川を渡れ！　鶴賀を救うのじゃ', 2.8); });
  rt.after(4, () => {
    if (F.step !== 1) return;
    sfx('taiko', 0.9);
    K.go(B.sen, { x: 32, z: -36 }, 3.4);
    S.crossLeg = 1;
    S.legT = rt.t;
    for (const g of [F.nobu, F.sen, F.sogo, F.tsune, F.mine]) if (live(g)) g.speed = 4.6;
    for (const g of F.allyBands || []) if (live(g)) g.speed = 4.4;
    // 川の中ほどで対岸の鉄砲が鳴る（渡る所を撃たれる）
    rt.after(9, () => { if (F.step === 1) { rt.army.play('volley', { x: 30, z: -50 }, 1.2); rt.say('長宗我部の侍', '撃ってくるぞ！　止まるな、渡り切れ！', 2.6); } });
  });
}

// ①の行き先：渡るまでは南の岸の浅瀬の口、渡れの後は北の岸
export function pin(rt) {
  const S = rt.flags.s1;
  return !S || S.st < 2 ? { x: 20, z: 36 } : { x: 20, z: -22 };
}
export function crossing(rt) { return (rt.flags.s1?.st || 0) >= 2; }

// 本人の渡河は必須。後続一組の足止めだけでは北岸で待ち続けさせない。
export function ready(rt, K) {
  const F = rt.flags, S = F.s1, P = rt.player.u.pos;
  // 対岸ならどこでもよいとはしない。指定した浅瀬の出口まで本人が渡る。
  if (!crossing(rt) || P.z >= -14 || Math.hypot(P.x - K.FORD.x, P.z + 22) >= 26) return false;
  const arrived = K.lightPos(F.blk.nobu).z < -20 && (!live(F.nobu) || F.nobu.center().z < -16);
  return arrived || (S.crossLeg === 3 && rt.t - S.legT > 90);
}

export function update(rt, K) {
  const F = rt.flags, S = F.s1, B = F.blk;
  // 仙石→十河→長宗我部の順で渡る。三備を同時に動かすと、岸に近い信親が十河を追い越していた。
  if (S?.st === 2) {
    if (S.crossLeg === 1 && (K.lightPos(B.sen).z < -14 || rt.t - S.legT > 60)) {
      S.crossLeg = 2;
      S.legT = rt.t;
      K.go(B.sogo, { x: 28, z: -28 }, 3.2);
    } else if (S.crossLeg === 2 && (K.lightPos(B.sogo).z < -14 || rt.t - S.legT > 60)) {
      S.crossLeg = 3;
      S.legT = rt.t;
      K.go(B.nobu, { x: 16, z: -34 }, 3.6);
    }
    return;
  }
  if (!S || S.st !== 1) return;
  const el = rt.t - S.t0, n = K.lightPos(B.nobu), P = rt.player.u.pos;
  // 信親の備が浅瀬の口に着き、本人も来たら渡る（遅れても九十秒で渡り始める）
  if ((el > 70 && Math.hypot(n.x - 12, n.z - 46) < 14 && Math.hypot(P.x - 20, P.z - 36) < 26) || el > 100) cross(rt, K);
}
