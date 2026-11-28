// ======================================================================
// 小牧の対陣　①の段「楽田から二重堀へ」（0〜3分。いちばん「軍勢の厚み」を見せる段。斬り合いはしない）
//   楽田城の秀吉の本陣から大手門を出て、陣の間（柵・土塁・備・旗本・後詰）を抜け、最前線の二重堀の砦の物見櫓へ。
//   北に羽柴の備が幾重にも並び、南の小牧山の麓には徳川・信雄の陣と柵が並ぶ（軽い作り）。両軍とも動かない。
//   道すがら使番が別の砦の様子を知らせる。物見櫓に着くと、日根野弘就が小牧山の陣を指して説き、徳川の物見が田へ出て来る。
// ======================================================================
import { kagaribiBatch, nobori, tawara } from '../props.js';
import { enemyGroup, allyGroup } from '../bhelp.js';
import { KIT } from '../b_nagashinojo.js';
import { dobeiLine, yaguraGate, monomi } from '../castle_parts.js';
import { MEM_BUDGET } from '../device_tier.js';
// 11/22 クラウド 小牧の持ち主（K564 落ちない）：記憶の少ない携帯（?mem=4 の予算205）では、遠い本陣の討てない旗本（invuln・keep で外せない）が本物の兵の53人を占め、
//   b_t03_komaki.js の三秒ごとの外しの後も 211〜234 人で予算を越えた。記憶の少ない端末だけ旗本を 22→14・30→20 にする（パソコンと記憶の多い端末は今まで通り）
const LOWMEM = !!MEM_BUDGET.real;

function say(rt, who, s, t, sec = 3) {
  const stage = rt.flags.stage;
  rt.after(t, () => { if (!rt.over && rt.player?.u?.alive !== false && !rt.flags.ending && !rt.flags.transitioning && rt.flags.stage === stage) rt.say(who, s, sec); });
}
// 道すがらの声：砦に着いた後は出さない（11/18 k41：速く着くと着陣の知らせと並び、字幕が25秒遅れた）
function walkSay(rt, who, s, t, sec = 3) {
  const stage = rt.flags.stage;
  rt.after(t, () => { if (!rt.over && rt.player?.u?.alive !== false && !rt.flags.ending && !rt.flags.transitioning && !rt.flags.campAt && rt.flags.stage === stage) rt.say(who, s, sec); });
}

// 床几の将も名前のある本人にする。旗本とは別の一人の組で、幕の内から動かさない。
function commander(rt, K, team, name, at, flag, faction) {
  const make = team ? enemyGroup : allyGroup;
  const list = K.fl([{ type: 'busho', n: 1, o: { name, horse: false, invuln: true } }], flag);
  // 旗本は別の組で置く。供回りの補充で幅一人の列が伸び、幕の裏に重なって止まるのを防ぐ。
  const g = make(rt, { name: name + 'の床几', fullStrength: true, noRetinue: true, faction, anchor: { ...at }, facing: team ? Math.PI : 0, width: 1,   // 11/19 cloud-05（布陣図の照らし）：小牧山の家康・信雄の床几は羽柴（楽田）の方へ。前は 0 で敵と逆を向いた
    order: 'hold', fixed: true, noRout: true, aggro: 0, seekRange: 0 },
  team ? K.dressT(list) : list);
  // 11/18 クラウド 小牧の持ち主：床几の大将が全力・一緒に突っ込むの下知で「かかれ」に替わらないよう外す
  g.honjin = true; g.campGuard = true; g.stay = true;
  seatCommander(rt, g, at);
  return g;
}

export function seatCommander(rt, g, at) {
  g.anchor = { ...at };
  g.dest = null;
  for (const u of g.units) {
    u.pos.x = at.x; u.pos.z = at.z; u.pos.y = rt.world.heightAt(at.x, at.z);
    u.target = null; u.moveTo = null; u.invuln = true; u.noTarget = true; u._crouch = true; u.heading = g.facing ?? u.heading;
  }
}

// 対陣の陣立て（始めから。昼も夜も同じ）：楽田城・両軍の本陣・陣の間の備・小牧山の柵と幟
export function* campSetup(rt, K) {
  const F = rt.flags, W = rt.world;
  const { RAKUDA, RK, HONJIN, FORT, GATE, MORIJIN } = K;
  // 11/19 K365 馬印の照らし（cloud-05・docs/uma_check_1119.md）：楽田の秀吉の本陣に千成瓢箪（山崎の宝寺の本陣と同じ形）。前は家の既定に無く馬印が立たなかった
  KIT.honjin(rt, RAKUDA.x, RAKUDA.z, { mon: 'toyotomi', uma: 'sennari', fire: false, people: false });
  F.hideyoshi = commander(rt, K, 0, '羽柴秀吉', { x: RAKUDA.x, z: RAKUDA.z - 4 }, 'toyotomi', 'oda');
  // 下知の届け先を旗本だけの野原にしない。森家の幕・床几・陣太鼓を残す。
  KIT.honjin(rt, MORIJIN.x, MORIJIN.z, { mon: 'tsuru', fire: false, yoroi: false, people: false });
  // 楽田城：陣幕の本陣を土塀で囲み、南の大手に櫓門、北西の隅に櫓
  yield;   // K626：段の間で一コマ返す（yield* で回す）
  const rw = dobeiLine(rt, [[RAKUDA.x - 4, RK.z1], [RK.x0, RK.z1], [RK.x0, RK.z0], [RK.x1, RK.z0], [RK.x1, RK.z1], [RAKUDA.x + 4, RK.z1]], { team: 0, name: '楽田城の塀', hp: 99999 });
  for (const w of rw.structs) { w.noTarget = true; w.wall = true; }
  // 土塁の陣城に合わせ、板壁と格子窓のある土の門を使う。白壁の部品を重ねた無地の箱にしない。
  F.rkGate = yaguraGate(rt, RAKUDA.x, RK.z1, 5, 0, { team: 0, hp: 99999, name: '楽田城の大手門', inside: false, earth: true });
  if (F.rkGate?.struct) F.rkGate.struct.noTarget = true;
  monomi(rt, RK.x0 + 6, RK.z0 + 6, { team: 0, name: '楽田城の櫓', mon: 'toyotomi' });
  // 二重堀の砦の物見櫓（①の行き先）
  F.fortTower = monomi(rt, FORT.x + 22, GATE.z - 14, { team: 0, name: '二重堀の物見櫓', mon: 'toyotomi' });
  // 羽柴の大軍：楽田の東西・陣の間の備・後詰（軽い作り・本物に替えない）
  yield;   // K626：段の間で一コマ返す（yield* で回す）
  F.farHashiba = [
    K.farArmy(rt, -100, -96, 30, 16, 240, 0, 'toyotomi', 0, 15911), K.farArmy(rt, 22, -100, 30, 16, 240, 0, 'toyotomi', 0, 15912),
    // 秀長・堀・池田・森・秀次の備は軍勢の厚みの表（depth.js）が描く
  ];
  // 陣の間の備（本物の兵。軽い兵は本人の六十 m 内では描かないので、道の脇の陣の厚みは本物で見せる。⑥の夜に帰す）
  // 対陣中は持ち場を守る。近くの斬り合いへの自動加勢で砦の柵へ寄せ、重なって止まらせない。
  F.campBi = [[-66, -60, 'toyotomi', 0.2], [-12, -54, 'hori', -0.3], [-94, -30, 'toyotomi', 0.4], [-20, -30, 'ageha', -0.2]].map(([x, z, flag, f], i) =>
    allyGroup(rt, { name: ['羽柴の備', '堀秀政の備', '羽柴の後詰', '池田の備'][i], fullStrength: true, anchor: { x, z }, facing: f, width: 8, formation: 'line', aggro: 6, seekRange: 10, order: 'hold', fixed: true, stay: true, noRout: true, dmgMult: 0.5 },
      K.fl([{ type: 'ashigaru', n: 9, o: { flagScale: 1 } }, { type: 'gun', n: 3 }, { type: 'samurai', n: 2 }], flag)));
  // 11/18 夜50-35（874×402 の20秒の写真）：楽田から砦への道すがら、兵が一人も写らず乾いた野を一人で歩いた。
  //   台詞「槍より鍬じゃ。もっこで土を運べ」の通り、道の東脇に砦の裏の土塁へ土を運ぶ人夫の列（本物・十人）と土俵の山を置く。⑥の夜に帰す
  {
    const a = [-37, -50], b = [-39, -28];   // 本人の道（x≈-46）の右脇九 m。物見櫓（-48,-18）の手前で、本人が着く二十〜三十秒に横を通る
    F.kmPorters = allyGroup(rt, { name: '砦の普請の人夫', anchor: { x: a[0], z: a[1] }, facing: 0, width: 4, formation: 'column', aggro: 0, seekRange: 0, noRout: true, fullStrength: true,
      order: 'path', path: [a, b], pathIdx: 0, speed: 1.6, arriveNoncombat: true },
    [{ type: 'porter', n: 10, o: { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    for (const u of F.kmPorters.units) u.noTarget = true;
    F.kmPorters.onArrive = (q) => { q.path = q.path.slice().reverse(); q.pathIdx = 0; q.order = 'path'; };
    for (const [x, z, r] of [[a[0] + 3, a[1] - 2, 0.3], [b[0] + 3, b[1] + 1, -0.4]]) rt.scene.add(tawara(W, x, z, r, 6, { solid: false }));
  }
  // 小牧山の麓の徳川・信雄の陣（柵の後ろに備。動かない）
  F.farToku = [
    K.farArmy(rt, -132, 109, 28, 12, 200, Math.PI, 'tokugawa', 1, 15913), K.farArmy(rt, -68, 116, 28, 12, 180, Math.PI, 'tokugawa', 1, 15914),
    // 酒井・本多・榊原・井伊の備は軍勢の厚みの表（depth.js）が描く
  ];
  // 小牧山の陣の前の柵の幟（徳川が堀と土塁を固めた。旗の列で見せる）
  yield;   // K626：段の間で一コマ返す（yield* で回す）
  for (let x = -150; x <= 60; x += 14) rt.scene.add(nobori(W, x, 92 + Math.sin(x * 0.07) * 3, Math.abs(x - (HONJIN.x + 22)) < 14 ? 'oda' : 'tokugawa', 6));
  // 陣の間の羽柴の幟
  for (const [x, z, m] of [[-60, -72, 'toyotomi'], [-24, -70, 'toyotomi'], [-84, -40, 'hori'], [-30, -40, 'toyotomi'], [40, -70, 'ageha'], [80, -60, 'tsuru']]) rt.scene.add(nobori(W, x, z, m, 6));
  // 両陣の本陣の篝火
  const camps = [[RAKUDA.x - 12, RAKUDA.z + 20], [RAKUDA.x + 12, RAKUDA.z + 20], [RAKUDA.x - 19, RAKUDA.z + 8], [RAKUDA.x + 19, RAKUDA.z + 8],
    [HONJIN.x - 14, HONJIN.z - 16], [HONJIN.x + 10, HONJIN.z - 16], [HONJIN.x + 34, HONJIN.z - 8], [HONJIN.x - 30, HONJIN.z - 4]];
  rt.scene.add(kagaribiBatch(W, camps));
  F.campFires = camps;
  F.rakuda = K.campGuard(rt, 0, { x: RAKUDA.x, z: RAKUDA.z + 12 }, 0, '羽柴秀吉の旗本', 'toyotomi', LOWMEM ? 14 : 22);
  yield;   // K626：段の間で一コマ返す（yield* で回す）
  KIT.honjin(rt, HONJIN.x, HONJIN.z + 6, { mon: 'tokugawa', uma: 'ogi', fire: false, yoroi: false, people: false });
  F.ieyasu = commander(rt, K, 1, '徳川家康', { x: HONJIN.x, z: HONJIN.z + 2 }, 'tokugawa', 'tokugawa');
  KIT.honjin(rt, HONJIN.x + 22, HONJIN.z + 10, { mon: 'oda', uma: false, fire: false, yoroi: false, people: false });
  F.nobukatsu = commander(rt, K, 1, '織田信雄', { x: HONJIN.x + 22, z: HONJIN.z + 6 }, 'nobukatsu', 'nobukatsu');
  F.honjin = [K.campGuard(rt, 1, { x: HONJIN.x, z: HONJIN.z - 8 }, Math.PI, '徳川家康の旗本', 'tokugawa', LOWMEM ? 20 : 30, 'tokugawa'),
    K.campGuard(rt, 1, { x: HONJIN.x + 22, z: HONJIN.z }, Math.PI, '織田信雄の旗本', 'nobukatsu', 10, 'nobukatsu')];   // 信雄は織田の木瓜（前は noOda の置き換えで柴田の雁金になっていた。K365 11/19）
}

export function startCamp(rt, K) {
  say(rt, '羽柴秀吉', '小牧山は徳川殿に先を越された。こちらも砦を並べて睨むぞ', 0.4, 3.4);
  say(rt, '羽柴秀吉', 'その方、二重堀の砦へ下り、日根野に加勢せよ', 4.2, 3);
  say(rt, '使番', '小松寺山の堀秀政様、砦の普請を終えられました', 18, 3);
  say(rt, '使番', '岩崎山の池田様の砦、柵を二重に結い申した', 34, 3);
  // 11/18 K306・K355（センゴク一統記14巻 VOL.117・121・戦の作法）：平野の村が焼かれる煙の列。
  // 両軍は村に火を掛け、敵を陣から誘い出そうとした。秀吉は挑発に乗らない。煙の柱は一度だけ立てる（描く回数は一つのまま）。
  const W = rt.world;
  if (!rt.kmSmoke && W?.addSmokeColumn) {
    rt.kmSmoke = [[-160, 40, 3.4], [-28, 96, 3], [36, 66, 2.6]].map(([x, z, size]) => W.addSmokeColumn(x, W.heightAt(x, z) + 4, z, { size, black: true })).filter((v) => v != null);
  }
  walkSay(rt, '足軽', '南の村から煙が上がっておる。民はどこへ逃げたのじゃ', 8.4, 3);
  walkSay(rt, '羽柴の侍', '徳川の焼き働きよ。こちらを砦から誘い出す気じゃ', 12, 3);
  walkSay(rt, '使番', '筑前様より。誘いに乗って打って出るな。乱取りした者は斬る', 21.6, 3.2);
  // 11/17 K355 の二つ（櫓に着いた後では次の段へ移って流れなかったので、道すがらへ移した）
  walkSay(rt, '使番', '羽黒で負けた武蔵守殿を、筑前様は咎められなんだ。次で取り返せとの仰せ', 25.4, 3.4);
  walkSay(rt, '足軽', '槍より鍬じゃ。もっこで土を運べ。この戦は掘った方が勝つぞ', 29.4, 3);
  say(rt, '足軽', '見ろ、小牧山まで旗が続いておる。あれが徳川の陣か', 62, 3);
  say(rt, '使番', '田楽の砦より。小牧山の南、蟹清水に徳川の新しい砦', 78, 3.2);
  say(rt, '日根野弘就', '二重堀の物見櫓の下へ参れ。小牧山の陣を見よ', 92, 3);
}
export function tickCamp(rt, K) {
  const F = rt.flags, P = rt.player.u.pos, el = rt.t - F.st0;
  // 陣の間の道に、徳川の騎馬の物見が紛れ込む（陣の間を探りに来た。斬り合いは小さく）
  if (!F.campScout && (P.z > -60 || el > 30)) {
    F.campScout = rt.t;
    F.cScout = enemyGroup(rt, { faction: 'tokugawa', name: '徳川の騎馬の物見', anchor: { x: -96, z: -40 }, facing: Math.PI / 2, width: 4, formation: 'line', morale: 70, dmgMult: 0.3,
      order: 'attack', seekRange: 40, aggro: 24, speed: 4 }, K.dressT([{ type: 'samurai', n: 3, o: { horse: true } }, { type: 'ashigaru', n: 3 }]));
    K.pushWave(F.cScout);
    rt.say('足軽', '陣の間に桔梗……いや、葵の物見じゃ！　討ち取れ！', 2.8);
  }
  if (F.campScout && !F.cScoutDone && (K.resistingN(F.cScout) <= 1 || rt.t - F.campScout > 50)) {
    F.cScoutDone = true;
    if (K.live(F.cScout)) { F.cScout.order = 'retreat'; F.cScout.dest = { x: K.HONJIN.x, z: 140 }; F.cScout.speed = 5; F.cScout.aggro = 0; F.cScout.seekRange = 0; }
    rt.say('羽柴の侍', F.cScout.units.some((u) => u.alive && !u.gone && !u.woundOut)
      ? '陣の厚さを見に来たか。小牧山へ逃げ帰って、十万と申せ'
      : F.cScout.units.every((u) => !u.alive && u.hp <= 0)
        ? '徳川の物見を討ち取った。陣の間を固めよ'
        : '徳川の物見は退いた。陣の間を固めよ', 3);
  }
  const T = F.fortTower?.foot || { x: K.FORT.x + 22, z: K.GATE.z - 14 };
  // 物見への対処と到着が済めば報告を始める。開戦からの秒数だけで櫓の下に待たせない。
  // 11/18 cloud-06（中学生の bot：櫓の足もとから十余歩の柵の外 (-52,-4) を行き来して1080秒の時切れ）：二分を過ぎたら十八歩の内で着いた事にする
  if (!F.campAt && F.cScoutDone && Math.hypot(P.x - T.x, P.z - T.z) < (el > 120 ? 18 : 10)) {
    F.campAt = rt.t;
    rt.award((t) => t.side.push('楽田から二重堀の砦まで陣立てを見て回った'), '二重堀の砦に着いた');
    rt.say('日根野弘就', 'よう参った。あれが小牧山。堀を穿ち、土塁を盛り、柵を三重に結うておる', 3.6);
    say(rt, '稲葉一鉄', '徳川殿は動かぬ。こちらも動かぬ。根比べよ', 4, 3);
    // 次は鉄砲二列への出撃ではなく、夜討ちの先手から木戸を守る段。
    say(rt, '物見', '小牧山の柵の前に徳川の先手。田へ出る支度をしておりまする', 8, 3);
    // 11/17 K355（センゴク一統記14巻）：羽黒で負けた森・池田を秀吉は咎めず「次で取り返せ」と使った。両軍は戦わずに鍬ともっこで土を掘り、平野に砦を並べた。森は民家に火を掛けて家臣に止められた

  }
  // 到着時刻は途中の保存にも残る。再開で台詞の予約が無くなっても待ち続けない。
  if (F.campAt && rt.t - F.campAt >= 10.5) K.next();
}
// 11/18 クラウド持ち主：行き先が梯子の足（櫓の脚の内）だと、着いた本人が櫓の腰板に挟まれて画面が板で塞がる（40秒の 874×402 の写真）。
// 行き先は櫓の外、梯子の口の前五 m に置く（着いた判定は梯子の足から十 m のまま）
export function towerAt(rt, K) {
  const T = rt.flags.fortTower;
  if (!T?.foot) return { x: K.FORT.x + 22, z: K.GATE.z - 14 };
  const dx = T.foot.x - T.x, dz = T.foot.z - T.z, d = Math.hypot(dx, dz) || 1;
  return { x: T.foot.x + dx / d * 5, z: T.foot.z + dz / d * 5 };
}
