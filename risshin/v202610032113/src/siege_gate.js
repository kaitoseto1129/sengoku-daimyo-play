// siege_gate.js … 城門の外と内（docs/siege-plan.md C5／docs/siege-spec.md 29・30章）
// castle_parts.js の門（kabukiGate・yaguraGate・ironGate。masugata は二つの門を作るので、
// 外の門・内の門にそれぞれ使う）を受けて、「外」と「内」の両方の壊し方をまとめる薄い層。
//   外：兵で打つ・掛矢や破城槌・火（siege_fire.js）。どれも今まで通り army.damage が struct.hp を
//       減らすので、ここでは struct.hp<=0 を見るだけ（壊れると扉が倒れ、口が広がる。閉め直せない）。
//   内：梯子（この門の物見梯子。C3 の siege_ladder.js の登り降りへ格上げする）か、
//       城壁の上（隣の場から回り込んだ兵）から入った兵が、内の門兵（guardTeam）を全て倒すと
//       閂を外して開く（口が広がる。まだ壊れていないので、守りは門兵を置き直して閉め直せる＝C4）。
// door の前は口が狭く（barredWidth）、開くと門の本来の幅（choke）まで広がる＝S4 の army.chokes。
//
// 使い方（戦の定義から。他のファイルはこの二つの export だけを使う）：
//   import { makeGate, updateGates, resetGates } from './siege_gate.js';
//   const y = yaguraGate(rt, x, z, w, rot, { team: 1 });
//   const otemon = makeGate(rt, y, { name: '大手門', guardTeam: 1 });
//   // 毎コマ一度（門がいくつあってもまとめて進む）
//   updateGates(rt);
//   // 守りが場を退いて次の門を閉める時（C4 の siege_zones から）
//   otemon.close();
//   if (otemon.opened) { ... }   // 開いていれば口が広い
// ======================================================================
import { FL } from './floors.js';

const REG = [];   // makeGate で作った門の記録（updateGates・resetGates で使う）

function segMid(seg) { return { x: (seg[0] + seg[2]) / 2, z: (seg[1] + seg[3]) / 2 }; }

// 扉を見た目にも閉め直す：tobira() は「開く」「壊れて倒れる」しか持たないので、
// 閉め直す（C5 の役目）はここで葉の向きと閂を直に戻す（door の子は [左の葉, 右の葉, 閂] の順）
function closeDoorVisual(door) {
  if (!door || !door.userData || !door.userData.leaves) return;
  door.visible = true;
  door.userData.leaves.forEach((pv) => pv.rotation.set(0, 0, 0));
  const bar = door.children[2];
  if (bar) bar.visible = true;
}

// gateObj：kabukiGate・yaguraGate・ironGate の戻り値（{ struct, door, choke, open, fall, ladderId? }）。
// o: { name, guardTeam（既定は門の team）, innerR（門兵を数える間合い、既定5m）,
//      barredWidth（閉じている間の口の幅、既定0.8）, fireResistance（束29：火の損に(1-これ)を掛ける。既定0） }
export function makeGate(rt, gateObj, o = {}) {
  const struct = gateObj.struct;
  const mid = segMid(struct.seg);
  const inner = { x: mid.x - struct.nx * 2.2, z: mid.z - struct.nz * 2.2 };   // nx・nz は外向き（props.js の作法）
  const outer = { x: mid.x + struct.nx * 2.2, z: mid.z + struct.nz * 2.2 };
  const guardTeam = o.guardTeam ?? struct.team;
  const innerR = o.innerR ?? 5;
  const fullW = gateObj.choke ?? 4;
  const barredW = o.barredWidth ?? 0.8;
  const name = o.name || struct.name;
  // 束29：火の損に (1 − fireResistance) を掛ける（army_fx.js の burning tick が読む）
  struct.fireResistance = o.fireResistance ?? 0;

  // 門の物見梯子（yaguraGate が floors.js の addLadder で置いた物）を、siege_ladder.js の
  // 登り降り（一人ずつ・押し倒せる）で使える梯子へ格上げする。castle_parts.js は直さない
  if (gateObj.ladderId != null && FL.ladders[gateObj.ladderId]) {
    const l = FL.ladders[gateObj.ladderId];
    if (!l.placed) { l.placed = true; l.maxHp = l.maxHp ?? l.hp; l.topX = l.x; l.topZ = l.z; }
  }

  // 口の幅（S4 の army.chokes）。門の両端を口の両端にする。閉じている間は狭く、開くと choke まで広がる
  // team＝guardTeam：閉じた口の狭さは「攻め手が破ろうとして詰まる」ためのもの。守り手（自分の門）は
  // 次の場へ退く時にここを通っても、自分の門には詰まらない（army_move.js の gateFactor が team を見て外す）
  const chEntry = { a: { x: struct.seg[0], z: struct.seg[1] }, b: { x: struct.seg[2], z: struct.seg[3] }, w: barredW, team: guardTeam };
  rt.army.chokes = rt.army.chokes || [];
  rt.army.chokes.push(chEntry);

  const G = {
    name, gateObj, struct, guardTeam, inner, innerR,
    opened: false, breached: false, occupied: false,
    _flowEntry: chEntry,   // army.chokes の口そのもの（束20：tsumari.js が曲輪の capacity で maxFlow を絞る用）

    // 毎コマ：外から壊れていないか・内から開けられていないかを見る
    tick() {
      // 束29：occupied＝門の外 5m に攻め手（guardTeam と違う team）がいる
      let near = false;
      rt.army.forNear(outer.x, outer.z, 5, (u) => { if (u.alive && !u.isStruct && u.team !== guardTeam) near = true; });
      this.occupied = near;
      if (!this.breached && struct.hp <= 0) { this.breached = true; this._openNow(true); return; }
      if (this.breached || this.opened) return;
      // 梯子か城壁の上から入った兵（guardTeam と違う team）が、門兵（guardTeam）を全て倒したか【城30】
      let guards = 0, foes = 0;
      rt.army.forNear(inner.x, inner.z, innerR, (u) => {
        if (!u.alive || u.isStruct) return;
        if (u.team === guardTeam) guards++; else foes++;
      });
      if (guards === 0 && foes > 0) this._openNow(false);
    },

    _openNow(byForce) {
      this.opened = true;
      struct.opened = true;   // gate_guide.js：開いた門には「打て」を出さない
      chEntry.w = fullW;
      if (byForce && gateObj.fall) gateObj.fall();     // 壊れて倒れる
      else if (gateObj.open) gateObj.open();           // 閂を外して開く
      // 打ち破った時は gate_guide.js が大きな知らせ（○○、破れる）を出すので、近くでは「開いた」を重ねない
      const P = rt.player && rt.player.u;
      const near = byForce && P && mid && Math.hypot(mid.x - P.pos.x, mid.z - P.pos.z) <= 60;
      if (rt.bark && !near) rt.bark(`${name}が開いた`);
    },

    // 守りが門兵を置き直して閉め直す（C4：場が落ちて退く時の「置き直し」に合わせて呼ぶ）。
    // 壊れて倒れた門（breached）は閉め直せない
    close() {
      if (this.breached) return false;
      this.opened = false;
      struct.opened = false;
      chEntry.w = barredW;
      closeDoorVisual(gateObj.door);
      return true;
    },
  };
  REG.push(G);
  return G;
}

// 毎コマ一度：makeGate で作った門をまとめて進める
export function updateGates() {
  for (const g of REG) g.tick();
}

export function resetGates() { REG.length = 0; }
