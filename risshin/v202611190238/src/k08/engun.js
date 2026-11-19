// k08/engun.js … 木津川口の 9〜12 分「城から加勢が来て一時押され、味方の新手で押し返す」（docs/toku15_plan_1108.md の 8）
// 新手は湧かせない（kaito AW の6）：城の方の加勢は始めから砦の北の葦原の奥（博労淵へ通う道）に控え、
//   浅野の後備は始めから浅野の陣の後ろに控える。④（北の口）に入ってから放つ。
// 流れ：④の始めに北で法螺と旗（足軽の一声）→ 三十秒後に加勢が出撃し、北の口へ駆け込んで味方を押す →
//   四十秒ほど後に浅野の後備が南から来て押し返す。④は北の口の守兵と加勢の両方が崩れるまで終わらない。
// 加勢に史料の名のある将は当てない（隊の名だけ）。字の札は足さない（台詞だけ）。
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { retreatNorth } from './retreat.js';

const alive = (g) => g && !g.routed && g.count > 0;

export function install(rt, K) {
  const F = rt.flags;
  const t = (side, type, n, o) => ({ type, n, o: { flag: side.flag, armor: side.armor, lace: side.lace, ...o } });
  // 城の方からの加勢：砦の北の口の先、博労淵へ通う道に控える（遠く、動かない）
  F.engun = enemyGroup(rt, { fixed: true, name: '城からの加勢', faction: 'toyotomi', flag: K.TOYO.flag, armor: K.TOYO.armor, anchor: { x: 6, z: -122 }, facing: 0,   // 11/18 夜50-14：-150 から寄せた（act bot で北の口まで八十五秒歩き、④が二百四十秒に延びた）

    order: 'hold', aggro: 0, width: 10, noRout: true },
    [t(K.TOYO, 'samurai', 3), t(K.TOYO, 'ashigaru', 12), t(K.TOYO, 'gun', 2)]);
  F.engun.noAI = true; F.engun.noFrontline = true;
  F.engun.dmgMult = 0.45;   // 押されるのは隊の位置で見せる。本人が一息で撃ち倒されないように
  for (const u of F.engun.units) u.noTarget = true;
  // 浅野の後備：浅野の陣の後ろに控える
  F.asano2 = allyGroup(rt, { faction: 'asano', name: '浅野の後備', anchor: { x: K.ASANO_AT.x + 6, z: K.ASANO_AT.z + 18 }, facing: Math.PI, width: 10, aggro: 4, morale: 95, noRout: true, fullStrength: true },
    [t(K.ASANO, 'samurai', 3), t(K.ASANO, 'ashigaru', 8), t(K.ASANO, 'gun', 4)]);
  F.asano2.noAI = true;
}

export function start(rt, K) {
  const F = rt.flags;
  F.engunGateZ = K.GATE.z;   // 後備が砦に入ったかを update で見る
  // 合流中の浅野勢は入口までの道を保ち、最後の持ち場だけ変える。
  // 経路の途中で anchor を砦内へ移すと、残った塀を横切ってしまう。
  const holdAt = (g, x, z) => {
    if (g.order === 'path' && g.path?.length) {
      const last = g.path[g.path.length - 1]; last[0] = x; last[1] = z;
      // 終点で後列を待っていても、新しい持ち場へ向かい直す。
      g.pathIdx = Math.min(g.pathIdx, g.path.length - 1);
    } else { g.anchor.x = x; g.anchor.z = z; }
  };
  F.engunPushedBack = false;
  F.engunN = F.engun ? F.engun.count : 0;
  const S = (t, fn) => rt.after(t, () => { if (F.step === 4 && !F.ending) fn(); });
  S(0, () => {
    // 出撃前に崩れた加勢を、これから来る敵として知らせない。
    if (!remaining(rt)) return;
    sfx('horagai', 0.45); rt.say('足軽', '北に桐の旗！　城の方から加勢が来るぞ！', 3);
  });
  // 旗と法螺で知らせてから三十秒待つ（全戦共通の援軍の予告）。
  // 11/18 夜50-14（せっかち bot 259秒：北の口の守兵を早く崩すと、加勢の出まで62秒敵がいない）：出を30→14秒に。
  //   控えの z-122 から北の口まで六十四歩を駆けて二十秒余り＝法螺から刃が交わるまでは今も三十秒を超える（援軍の予告）
  S(14, () => {
    // 出撃の時刻までに加勢が崩れていても、迎える段を済ませる。
    // 生存確認の後に立てると、残兵が零でも④が終わらない。
    F.engunOn = true;
    if (!alive(F.engun)) return;
    F.engun.noAI = false; F.engun.order = 'path'; F.engun.aggro = 4; F.engun.seekRange = 12;
    F.engun.speed = Math.max(F.engun.speed || 0, 3.2);   // 砦の急を聞いて駆けつける（歩きのままだと④が延びる）
    // 北の塀へ斜めに寄せず、扉の外で中央へ揃えてから開いた北門を通す。
    F.engun.path = [[K.NGATE.x, K.NGATE.z - 14], [K.NGATE.x, K.NGATE.z + 8]];
    F.engun.pathIdx = 0;
    F.engun.onArrive = (g) => { g.order = 'attack'; g.aggro = 20; g.seekRange = 40; };
    for (const u of F.engun.units) u.noTarget = false;
    if (Array.isArray(F.s4) && !F.s4.includes(F.engun)) F.s4.push(F.engun);   // 印と bot の行き先に入れる
  });
  // 北の口へ加勢が届いてから味方を下げる。行軍が遅れても時刻だけで押された事にしない。
  const push = () => {
    // 加勢を先に退けた時は、押されていない味方を時刻だけで下げない。
    // 後備が先に押し返した後にも、遅れて退く下知を出さない。
    if (F.engunPushedBack || !alive(F.engun) || remaining(rt) <= Math.ceil((F.engunN || 1) * 0.3)) return;
    const arrived = F.engun.units.some(u => u.alive && !u.gone && !u.noTarget && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.evacuatedWound && !u.fleeing &&
      Math.hypot(u.pos.x - K.NGATE.x, u.pos.z - K.NGATE.z) < 18);
    if (!arrived) { S(2, push); return; }
    rt.say('蜂須賀の侍', '押される！　門の内まで下がって組を立て直せ！', 3);
    // 11/18 クラウド11：本人が北の口で斬り合っている時に三隊とも門の内へ下げると、本人一人が加勢・守兵・鉄砲に囲まれて倒れた
    //   （main の act bot 3回中1回・421秒 段4）。本人の20m内で戦う隊は本人の脇に残す（敵の数・強さは同じ）
    const P = rt.player?.u?.pos;
    for (const g of [F.saki, F.asano, F.ikeda]) if (alive(g)) {
      if (P && rt.player.u.alive) { const c = g.center(); if (Math.hypot(c.x - P.x, c.z - P.z) < 20) continue; }
      const x = g.order === 'path' && g.path?.length ? g.path[g.path.length - 1][0] : g.anchor.x;
      holdAt(g, (x || 0) * 0.6, K.GATE.z - 18);
    }
  };
  S(50, push);
  // 浅野の後備が来て押し返す
  S(56, () => {   // 11/18 夜50-14：68→56（後備の着きが④の百八十秒過ぎで、④が長かった）
    const g = F.asano2;
    if (!alive(g)) return;
    g.noAI = false; g.order = 'path'; g.aggro = 4; g.seekRange = 12; g.speed = 4.2;
    // 南東の陣から北の口へ直進すると東の塀を横切る。破れた南の塀から砦の内へ。
    // 11/19 クラウド持ち主（act bot 341秒「隊が一点に重なって止まる」浅野の後備15人 (12,1)）：x=12 を真っ直ぐ北へ下ると竹束（x=10.4）の脇と門の東の塀に詰まった。
    //   竹束の真ん中の通り道から大手門をくぐる（③の新手と同じ道）
    g.path = [[12, K.GATE.z + 24], [0, K.GATE.z + 20], [0, K.GATE.z - 6], [K.NGATE.x + 8, K.NGATE.z + 12]];
    g.pathIdx = 0;
    g.onArrive = (q) => {
      if (F.step !== 4 || F.ending) return;
      q.order = 'attack'; q.aggro = 24; q.seekRange = 40;
      // 陣から出た十秒後では、後備はまだ南の入り江。北の口へ届いてから押し返す。
      for (const q of [F.saki, F.asano, F.ikeda]) if (alive(q)) holdAt(q, K.NGATE.x + (q === F.ikeda ? -10 : q === F.asano ? 12 : 3), K.NGATE.z + 10);
      F.engunPushedBack = true;
    };
    sfx('taiko', 0.6);
    // 長晟は遠い搦手の陣。北の口へは使番が下知を運ぶ。
    rt.say('浅野の使番', '長晟様の下知。後備が参る、北の口へ押し返せ、と', 3);
  });
}

// 最後の区間に入り、先頭が戦場に届けば合流する。
// 全員が指定の持ち場へ揃うのを待つと、交戦中の後備が押し返しの下知を出せない。
// 門を通る途中の経路は飛ばさず、倒れた兵や退場中の兵は到着に数えない。
export function update(rt) {
  const F = rt.flags;
  if (F.step !== 4 || F.ending) return;
  if (F.engunArrivalAt > rt.t) return;
  F.engunArrivalAt = rt.t + 0.5;
  // 11/19 クラウド持ち主（act bot POSLOG 374〜416秒：城からの加勢が砦を縦に抜けて大手門の外 (-5,6) まで追い、竹束の陰で傷を縛る本人を斬った・命三割半）。
  //   加勢は北の口から砦へ押し入る兵。大手門より南へは出ず、門の内（十二歩奥）へ戻る。全延の組・北の口の守兵も同じ（11/19 02:12 act bot 292秒の倒れ：全延の組の侍が竹束の陰まで追って背から斬った）
  if (F.engunGateZ != null) {
    // 11/19 04:50 クラウド持ち主：本人が門の外で傷を縛る間（命七割未満）だけ、砦の敵の組は皆（櫓の上を除く）門の外へ追わない。
    //   いつも戻すと中学生 bot が門の外をうろつく間に④の相手がいなくなり時切れになった（04:32 に戻した形）
    const pu = rt.player?.u;
    const resting = pu && pu.alive && pu.pos.z > F.engunGateZ && pu.hp < pu.maxHp * 0.7;
    const gs = F.k08GateGs || (F.k08GateGs = []); gs.length = 0;
    gs.push(F.engun, F.w3, F.zen);
    if (resting) for (const g of rt.army.groups) if (g.team === 1 && !g.routed && !gs.includes(g) && !(F.towers || []).includes(g)) gs.push(g);
    for (const g of gs) for (const u of g?.units || []) {
      if (!u.alive || u.fleeing || u.invuln || u.isStruct || u.pos.z < F.engunGateZ + 2) continue;
      u.target = null; u.atk = null; u.moveTo = { x: Math.max(-14, Math.min(14, u.pos.x)), z: F.engunGateZ - 12 }; u.aiT = 2;
    }
  }
  const target = F.engunArrivalProbe || (F.engunArrivalProbe = { x: 0, z: 0 });
  for (const g of [F.engun, F.asano2, F.asano, F.ikeda]) {
    if (!alive(g) || g.order !== 'path' || !g.onArrive || !g.path?.length || g.pathIdx < g.path.length - 1) continue;
    const last = g.path[g.path.length - 1];
    target.x = last[0]; target.z = last[1];
    let ready = 0, arrived = 0;
    for (const u of g.units) {
      if (!u.alive || u.gone || u.noTarget || u.dying || u.woundOut || u.rearWound || u.downed || u.evacuatedWound || u.fleeing) continue;
      ready++;
      if (Math.hypot(u.pos.x - target.x, u.pos.z - target.z) < 12 && !rt.army.wallBetween(u.pos, -1, target)) arrived++;
      // 11/18 クラウド持ち主：浅野の後備は砦の内（大手門の八歩奥）へ入れば着いたと見る。北の口まで歩き切るのを待つと④が三分延びた
      else if (g === F.asano2 && F.engunGateZ != null && u.pos.z < F.engunGateZ - 8) arrived++;
    }
    if (ready && arrived >= Math.min(3, ready)) {
      const arrivedAt = g.onArrive;
      g.onArrive = null;
      arrivedAt(g);
    }
  }
}

// ④を終えてよいか：加勢を放った後は、加勢が三割まで減るか崩れるまで待つ（放つ前なら待つ）
export function remaining(rt) {
  const g = rt.flags.engun;
  if (!alive(g)) return 0;
  let n = 0;
  // 出撃前の控えは狙わせないだけで、まだ退けた兵ではない。
  for (const u of g.units) if (u.alive && !u.gone && (!u.noTarget || !rt.flags.engunOn) && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.evacuatedWound && !u.fleeing && !u.invuln) n++;
  return n;
}

export function cleared(rt, secured = false) {
  const F = rt.flags;
  if (!F.engun) return true;
  // 戦える加勢が残る間は、後備の前進と味方の押し返しを待つ。
  // 加勢を全員退けた後まで後備の到着を条件にすると、敵のいない口で待ち続ける。
  // 北の口の守兵を崩す条件・本人の参加・四十五秒の交戦は呼び出し元で確かめる。
  if (!F.engunOn) return false;
  const left = remaining(rt);
  if (!left) return true;
  // 後備が既に倒れている時は、残る味方だけで押し返せる。
  // 後備が全員負傷しても止めない。合流が詰まった場合も、本人が両軍の守りを
  // 半数まで崩して北の口を保った時（secured）は、残る先手で押し返せる。
  const rearReady = alive(F.asano2) && F.asano2.units.some(u => u.alive && !u.gone && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.evacuatedWound && !u.fleeing);
  if (!F.engunPushedBack && rearReady && !secured) return false;
  return left <= Math.ceil((F.engunN || 1) * 0.3) || (secured && left <= (F.engunN || 1) * 0.5);
}
// ⑤へ移る時：残る加勢も博労淵へ退く
export function fleeAll(rt) {
  const g = rt.flags.engun;
  // 先に士気が崩れた組にも退路を渡す。敗走中でも北の塀の内に残る事がある。
  if (!g || g.count <= 0) return;
  // 東西の塀に突き当たらず、開いた北の口から博労淵へ退く。
  g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true;
  retreatNorth(g);
  g.noRout = false; g.noAI = false; g.routed = true; g.order = 'flee';
}
