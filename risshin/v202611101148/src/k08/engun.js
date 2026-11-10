// k08/engun.js … 木津川口の 9〜12 分「城から加勢が来て一時押され、味方の新手で押し返す」（docs/toku15_plan_1108.md の 8）
// 新手は湧かせない（kaito AW の6）：城の方の加勢は始めから砦の北の葦原の奥（博労淵へ通う道）に控え、
//   浅野の後備は始めから浅野の陣の後ろに控える。④（北の口）に入ってから放つ。
// 流れ：④の始めに北で法螺と旗（足軽の一声）→ 三十秒後に加勢が出撃し、北の口へ駆け込んで味方を押す →
//   四十秒ほど後に浅野の後備が南から来て押し返す。④は北の口の守兵と加勢の両方が崩れるまで終わらない。
// 加勢に史料の名のある将は当てない（隊の名だけ）。字の札は足さない（台詞だけ）。
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

const alive = (g) => g && !g.routed && g.count > 0;

export function install(rt, K) {
  const F = rt.flags;
  const t = (side, type, n, o) => ({ type, n, o: { flag: side.flag, armor: side.armor, ...o } });
  // 城の方からの加勢：砦の北の口の先、博労淵へ通う道に控える（遠く、動かない）
  F.engun = enemyGroup(rt, { fixed: true, name: '城からの加勢', faction: 'toyotomi', flag: K.TOYO.flag, armor: K.TOYO.armor, anchor: { x: 6, z: -150 }, facing: 0,
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
  // 合流中の浅野勢は入口までの道を保ち、最後の持ち場だけ変える。
  // 経路の途中で anchor を砦内へ移すと、残った塀を横切ってしまう。
  const holdAt = (g, x, z) => {
    if (g.order === 'path' && g.path?.length) {
      const last = g.path[g.path.length - 1]; last[0] = x; last[1] = z;
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
  S(30, () => {
    // 出撃の時刻までに加勢が崩れていても、迎える段を済ませる。
    // 生存確認の後に立てると、残兵が零でも④が終わらない。
    F.engunOn = true;
    if (!alive(F.engun)) return;
    F.engun.noAI = false; F.engun.order = 'path'; F.engun.aggro = 4; F.engun.seekRange = 12;
    // 北の塀へ斜めに寄せず、扉の外で中央へ揃えてから開いた北門を通す。
    F.engun.path = [[K.NGATE.x, K.NGATE.z - 14], [K.NGATE.x, K.NGATE.z + 8]];
    F.engun.pathIdx = 0;
    F.engun.onArrive = (g) => { g.order = 'attack'; g.aggro = 20; g.seekRange = 40; };
    for (const u of F.engun.units) u.noTarget = false;
    if (Array.isArray(F.s4) && !F.s4.includes(F.engun)) F.s4.push(F.engun);   // 印と bot の行き先に入れる
  });
  // 加勢が北の口へ着く頃：味方が押される（隊を門の内の半ばまで下げる）
  S(50, () => {
    // 加勢を先に退けた時は、押されていない味方を時刻だけで下げない。
    if (!alive(F.engun) || remaining(rt) <= Math.ceil((F.engunN || 1) * 0.3)) return;
    rt.say('蜂須賀の侍', '押される！　門の内まで下がって組を立て直せ！', 3);
    for (const g of [F.saki, F.asano, F.ikeda]) if (alive(g)) {
      const x = g.order === 'path' && g.path?.length ? g.path[g.path.length - 1][0] : g.anchor.x;
      holdAt(g, (x || 0) * 0.6, K.GATE.z - 18);
    }
  });
  // 浅野の後備が来て押し返す
  S(68, () => {
    const g = F.asano2;
    if (!alive(g)) return;
    g.noAI = false; g.order = 'path'; g.aggro = 4; g.seekRange = 12; g.speed = 4.2;
    // 南東の陣から北の口へ直進すると東の塀を横切る。破れた南の塀から砦の内へ。
    g.path = [[12, K.GATE.z + 24], [12, K.GATE.z - 8], [K.NGATE.x + 8, K.NGATE.z + 12]];
    g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'attack'; q.aggro = 24; q.seekRange = 40; };
    sfx('taiko', 0.6);
    // 長晟は遠い搦手の陣。北の口へは使番が下知を運ぶ。
    rt.say('浅野の使番', '長晟様の下知。後備が参る、北の口へ押し返せ、と', 3);
    S(10, () => {
      for (const q of [F.saki, F.asano, F.ikeda]) if (alive(q)) holdAt(q, K.NGATE.x + (q === F.ikeda ? -10 : q === F.asano ? 12 : 3), K.NGATE.z + 10);
      F.engunPushedBack = true;
    });
  });
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
  // 加勢が早く倒れても、後備の前進と味方の押し返しを飛ばさない。
  // 後備が既に倒れている時は、残る味方だけで押し返せる。
  if (!F.engunOn || (!F.engunPushedBack && alive(F.asano2))) return false;
  return remaining(rt) <= Math.ceil((F.engunN || 1) * 0.3) || (secured && remaining(rt) <= (F.engunN || 1) * 0.5);
}
// ⑤へ移る時：残る加勢も博労淵へ退く
export function fleeAll(rt) {
  const g = rt.flags.engun;
  // 先に士気が崩れた組にも退路を渡す。敗走中でも北の塀の内に残る事がある。
  if (!g || g.count <= 0) return;
  // 東西の塀に突き当たらず、開いた北の口から博労淵へ退く。
  g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true;
  const c = g.center();
  g.fleePath = c.z < -62 ? [[0, -164]] : [[0, -54], [0, -66], [0, -164]];
  // 塀の外へ押し出された加勢は、開いた横塀の切れ目から北門へ戻る。
  if (Math.abs(c.x) > 24 && c.z >= -62) {
    const side = Math.sign(c.x);
    g.fleePath.unshift([side * 28, -30], [side * 20, -30]);
  }
  for (const u of g.units) u.fleePathIdx = 0;
  g.noRout = false; g.noAI = false; g.routed = true; g.order = 'flee';
}
