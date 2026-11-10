// 一宮城 ④ 9〜12分「狭い山道の押し戻し」：水脈を断たれた城兵が搦手の門から打って出る。狭い山道で味方は押し戻され、
// いったん下で固める。讃岐から回った黒田・蜂須賀家政の手が上って来て、もう一度上へ押し上げる（段の長さは出来事で決める）。
import { enemyGroup, allyGroup } from '../bhelp.js';

// 水を断たれた城兵への退却命令。士気を下げるだけでは、組頭が生きている隊は退かない。
// 敗走の処理に渡し、塀の脇へ直進せず搦手の門から城の奥へ戻す。
export function withdraw(g) {
  if (!g?.count || g.routed) return;
  const c = g.center();
  g.noRout = false; g.noAI = true; g.focus = null; g.morale = 0;
  g.routed = true; g.order = 'flee'; g.dest = null;
  g.fleeDir = { x: 0, z: 1 }; g.fleeSet = true;
  g.fleePath = [];
  if (c.z < 68) g.fleePath.push([-58, 68]);
  if (c.z < 81) g.fleePath.push([-40, 79], [-16, 81]);
  if (c.z < 93) g.fleePath.push([-16, 94]);
  // 本丸の北の口まで。南の塀には出口がなく、城外へ一直線に逃がすと壁に詰まる。
  g.fleePath.push([-16, 106], [-16, 110], [-16, 114]);
  for (const u of g.units) if (u.alive) {
    u.fleePathIdx = 0; u.routIn = 0.3; u.aiT = 0;
    u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false;
  }
}

export function oshiStep(NG) {
  const { CHOSO, GOALS, MID, LOW, UP, GATE } = NG;
  const foe = (rt, name, at, list) => enemyGroup(rt, { faction: 'oda', flag: 'chosokabe', fixed: true, name, anchor: at, facing: Math.PI, order: 'attack', seekRange: 24, aggro: 10, width: 5, morale: 70, dmgMult: 0.1 },
    list.map(([type, n]) => ({ type, n, o: CHOSO })));
  // 共通の戦闘段と同じく、二人以下の残兵や全員が逃げている組は崩れた扱い。
  // 三組に二人ずつ残ると、戦える組が無いのに合計六人で段が止まっていた。
  const alive = (g) => g && g.count > 2 && !g.routed && g.units.some((u) => u.alive && !u.fleeing);
  const heads = (gs) => gs.reduce((a, g) => a + (alive(g) ? g.count : 0), 0);
  const send = (rt, at) => {
    // 共通の段で追いついた後続も、山道の退却・再進撃の下知に含める。
    const groups = [...(rt.flags.allies || [])];
    const aid = rt.flags.dp?.ctx?.aidG;
    if (aid && !groups.includes(aid)) groups.push(aid);
    groups.forEach((g, i) => {
      if (!g || !g.count) return;
      const C = rt.flags.dp.cur;
      if (!C.orders.has(g)) C.orders.set(g, { noAI: g.noAI, keepMoveOrder: g.keepMoveOrder });
      // 共通の采配で退却・加勢待ちの下知を上書きさせない。
      g.noAI = true;
      // 加勢の知らせまでは、黒田・家政の手を山道の下で待たせる。
      if (C.ph < 3 && (g === rt.flags.kanbei || g === rt.flags.iemasa)) { g.order = 'hold'; return; }
      g.anchor = { x: at.x + (i % 2 ? 5 : -5), z: at.z - 4 - (i % 3) * 2 };
      g.seekRange = 20;
      // 退く時だけでなく再進撃でも、後ろの目付へ付いて戻らず山道の下知を保つ。
      g.keepMoveOrder = true;
      g.order = C.ph === 2 ? 'retreat' : 'attack';
      g.dest = C.ph === 2 ? g.anchor : null;
    });
  };
  return {
    // kind は 'hold'：自動の頭（depthBot）が持ち場（C.at）の輪の内の敵だけを相手にし、門の下まで一人で追わない
    kind: 'hold', max: Infinity, idleAdvance: false, needIn: 55,
    start(rt, C) {
      // 本人は初め山道の下（湧き水の前）。味方の手が山道の中ほどで受け、押し戻されて下へ退いて来る
      C.at = C.goal = LOW; C.groups = []; C.ph = 0; C.botRadius = 14; C.inT = 0; C.orders = new Map();
      rt.obj('dp', GOALS[4], 'main');
      // 湧き水を取り返しに来た組の残りは、水脈を断たれて門へ退く（段の替わり目に敵が重ならない）
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g !== rt.flags.emura && !(rt.flags.cGuns || []).includes(g)) withdraw(g);
      // 秀長の手の後続が谷から上がって来て、山道の下を固める（押し戻される時に本人だけにしない）
      const aid = allyGroup(rt, { name: '秀長の手の後続', flag: 'toyotomi', anchor: { x: LOW.x - 4, z: LOW.z - 10 }, facing: 0, noRout: true, aggro: 12, morale: 95, dmgMult: 0.7, fullStrength: true },
        [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }]);
      rt.flags.allies.push(aid);
      // 小倉丸の鉄砲は、山道の下までは届いても当たりは浅い
      for (const g of rt.flags.cGuns || []) g.dmgMult = 0.1;
      send(rt, MID);
      // 命は共通の非戦闘時の手当てに任せる。段の切り替えだけで四割戻さない。
      rt.say('蜂須賀正勝', '水を断たれた城兵は必ず打って出る。山道は狭い、二人と並べぬぞ', 4);
    },
    tick(rt, C, m, ctx, el) {
      C.inT = el;
      if (C.ph === 0 && el > 14) {
        C.ph = 1;
        C.groups.push(foe(rt, '搦手から打って出た城兵', { x: -46, z: 75 }, [['samurai', 1], ['ashigaru', 5]]));
        rt.after(12, () => { if (!rt.flags.ending) C.groups.push(foe(rt, '搦手から続く城兵', { x: -44, z: 77 }, [['ashigaru', 6]])); });
        rt.say('足軽', '城兵が門から出て来た！　坂の上から押してくるぞ！', 3);
      }
      if (C.ph === 1 && el > 45) {
        C.ph = 2; send(rt, LOW);
        C.groups.push(foe(rt, '江村の新手', { x: -50, z: 73 }, [['ashigaru', 6], ['bow', 3]]));
        rt.say('羽柴秀長の使番', '押し戻される！　いったん湧き水の前まで退いて固めよ！', 3.5);
      }
      if (C.ph === 2 && el > 62) {
        C.ph = 3;
        // 退く組は下で守り、加勢だけが先に上る。
        for (const g of C.orders.keys()) if (g.count) { g.order = 'hold'; g.keepMoveOrder = true; g.dest = null; }
        for (const g of [rt.flags.kanbei, rt.flags.iemasa]) if (g && g.count) { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: MID.x, z: MID.z }; }
        rt.say('黒田官兵衛', '黒田・蜂須賀の手、上るぞ！　狭い道は横から崩せ！', 3.5);
        rt.after(4, () => rt.say('足軽', '加勢じゃ！　もう一度、上へ！', 2.5));
      }
      if (C.ph === 3 && el > 100) { C.ph = 4; C.at = C.goal = MID; send(rt, MID); }
      // 味方の手は門の下まで押し上げる。本人は山道の中ほどで残りを払う（門の下の鉄砲の前に一人で出さない）
      if (C.ph === 4 && el > 135) { C.ph = 5; send(rt, UP); rt.after(18, () => rt.say('足軽', '城兵が門の内へ逃げ込む！　門が閉まる前じゃ！', 3)); rt.after(42, () => rt.say('使番', '大手の本隊、明神丸に取り付きました！　城は三方から囲まれております', 4)); }
      // 行き先は山道の持ち場のまま（門の下の鉄砲の前まで城兵を追わせない）
      const p = rt.player.u.pos;
      // 門まで押し上げた本人を中ほどへ戻させず、山道に来ていない本人は時間だけで達成にしない。
      const dx = GATE.x - MID.x, dz = GATE.z - MID.z;
      const along = Math.max(0, Math.min(1, ((p.x - MID.x) * dx + (p.z - MID.z) * dz) / (dx * dx + dz * dz)));
      const onRoad = Math.hypot(p.x - MID.x - dx * along, p.z - MID.z - dz * along) < 22;
      // 塀や岩に残った一組を全滅させるまで待たない。寄せの上限で門へ退かせる。
      // 本人が山道へ来ていない時は、残兵が退いても次へ進めない。
      if (C.ph >= 5 && el > 230 && !C.withdrawn) {
        C.withdrawn = true;
        for (const g of C.groups) withdraw(g);
      }
      // 共通の戦闘段を使わない山道でも、来た人数と退けた人数を渡す。
      // まだ来ていない新手は数に含めず、目標の達成は山道への到着で判定する。
      C.nTot = C.groups.reduce((n, g) => n + (g.initial || g.units.length), 0);
      const remaining = heads(C.groups);
      rt.objProgress('dp', C.nTot ? `敵 ${Math.max(0, C.nTot - remaining)}／${C.nTot}人` : '');
      return C.ph >= 5 && el > 200 && (remaining <= 5 || C.withdrawn === true) && onRoad;
    },
    end(rt, C) {
      for (const [g, orders] of C.orders) { Object.assign(g, orders); g.dest = null; }
      for (const g of C.groups) withdraw(g);
      rt.flags.step = 5;
      rt.objDone('dp');
      rt.award((t) => t.side.push('狭い山道で押し戻され、また押し上げた'), '山道を押し返した');
      rt.say('足軽', '城兵が門へ逃げ込むぞ！　今なら付いて入れる！', 3);
    },
  };
}
