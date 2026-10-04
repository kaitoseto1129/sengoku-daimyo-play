// ======================================================================
// siege_zones.js … 城・砦の「場（曲輪・本陣）」の制圧と、城主の降伏・逃亡
// docs/siege-plan.md F3（要件：fort-spec 28・29／siege-spec 48・58・59・60）
// docs/siege-plan.md M3（山33／砦19・城58／山22・城60）：区域の網（links）・勝ちの組み合わせ（win）・
// 退路と封鎖の手（escape）を追加。既存の呼び出し（zones・commander・onFall 等）は今までどおり動く
// （M3 の物はどれも o に足さなければ何もしない・作り足しだけ）。
// docs/siege-plan.md C4（城6・25・37・59〜61）：場が落ちて退く時「門を閉める→置き直す→撃つ用意」の
// 静かな間（quietRange、既定 20〜40 秒）と、予備（reserves）を破られた口へ回す。o に足さなければ
// quietRange は既定値のまま働き、reserves は無ければ何も回さない（作り足しだけ）。
// ほかの筋（siege_ai.js など）は、この形を触らず makeSiegeZones と SZ.tick・SZ.zones
// だけを使う（F3 の持ち場）。
//
// 使い方（戦の定義から）：
//   import { makeSiegeZones, ZONE_STATE, WIN } from './siege_zones.js';
//   const SZ = makeSiegeZones(rt, {
//     zones: [
//       { id: 'san', name: '三の丸', test: (x, z) => C.kuruwa.san.test(x, z), pos: C.kuruwa.san.centroid,
//         need: 8, hold: 15, gate: '大手門', next: 'ni' },
//       { id: 'ni',  name: '二の丸', test: (x, z) => C.kuruwa.ni.test(x, z), pos: C.kuruwa.ni.centroid,
//         need: 10, hold: 15, next: 'hon' },
//       { id: 'hon', name: '本丸',   test: (x, z) => C.kuruwa.hon.test(x, z), pos: C.kuruwa.hon.centroid,
//         need: 15, hold: 20, honmaru: true },
//     ],
//     links: [['san', 'ni'], ['ni', 'hon']],   // 区域のつながり（網）。省けば next の鎖だけ
//     friendTeam: 0, enemyTeam: 1,
//     commander: () => rt.army.units.find((u) => u.name === '武田勝頼' && u.alive),
//     backGate: { x: -40, z: -80 },     // 搦手（逃げ道）の先。無ければ逃げない
//     noReinforce: () => true,          // 援軍が来ない戦は常に true（無ければ「援軍なし」とみなす）
//     // 勝ちの組み合わせ【山23・砦19・城58】：OR（配列）の中に AND（配列）を組む。WIN の作り方を使う
//     winWhen: [ [WIN.zone('hon')], [WIN.commanderDown()], [WIN.percent(0.7)], [WIN.allEnemyFled()] ],
//     // 退路と封鎖の手【山22・城60】：escape 区域を味方が塞げば、退く敵は捕らえるか降る。
//     // 塞いでいなければ、退く敵は rally（奥）へ集まり直す
//     escape: { zoneId: 'ura', rally: { x: 0, z: -40 } },
//     // C4【城6・25・37】：場が落ちて次の場へ退く時、門を閉め、20〜40 秒（quietRange）は取られない
//     // 置き直しの間を作る。その間に予備（reserves）を一人、破られた口（次の場）へ回す
//     quietRange: [20, 40], reserves: [butai, …],
//     onFall(id) {}, onHonmaru() {}, onSurrender() {}, onFlee() {}, onCommanderDown() {}, onWin(reason) {},
//   });
//   // update の中で毎コマ
//   SZ.tick(dt);
//   // 敵の部隊が崩れて退く時（siege_ai.js などから）
//   SZ.retreatFate(butai);   // 'captured' | 'regroup' | null（escape 未設定）
// ======================================================================

export const ZONE_STATE = { NEUTRAL: 'neutral', CONTESTED: 'contested', FRIEND: 'friend', ENEMY: 'enemy' };
// 任務の札に出す言葉（英字を画面に出さない）
const ZONE_WORD = { neutral: '空き', contested: '奪い合い', friend: '味方が取った', enemy: '敵が守る' };
export const zoneWord = (z) => (z && ZONE_WORD[z.state]) || '';

// 知らせの決まった文【城70】。要る物だけ、ここから選んで出す（自由な文は作らない）
const MSG = {
  gateBroken: (name) => `${name}が破られた`,
  zoneFallFriend: (name) => `${name}が落ちた`,
  zoneFallEnemy: (name) => `${name}を取り返された`,
  retreat: (name) => `城兵が${name}へ退く`,
  honmaruOpen: () => '本丸への道が開いた',
  honmaruFall: () => '本丸が落ちた',
  surrender: () => '城主が降伏を申し出た',
  commanderDown: () => '守将が討たれた',
  flee: () => '城主が搦手へ逃げた',
  gateClose: (name) => `${name}を閉めた`,
  redeployed: (name) => `${name}の備えが整った`,
  reinforce: (name) => `${name}へ援軍が到着する`,
};

function countIn(units, test, team) {
  let n = 0;
  for (const u of units) {
    if (!u.alive || u.isStruct || u.team !== team) continue;
    if (test(u.pos.x, u.pos.z)) n++;
  }
  return n;
}

function sumTeam(units, team) {
  let n = 0;
  for (const u of units) if (u.alive && !u.isStruct && u.team === team) n++;
  return n;
}

function findGate(rt, key) {
  if (!key) return null;
  if (typeof key !== 'string') return key;   // すでに struct を渡された
  return (rt.army.structs || []).find((s) => s.name === key) || null;
}

class Zone {
  constructor(o) {
    Object.assign(this, {
      id: o.id, name: o.name, test: o.test, pos: o.pos || null,
      need: o.need ?? 6, hold: o.hold ?? 12, next: o.next || null,
      honmaru: !!o.honmaru, gate: o.gate || null,
    });
    this.owner = o.start || ZONE_STATE.ENEMY;   // 城・砦は、初めはどこも守り方が持つ
    this.state = this.owner;
    this.holdT = 0;
    this.fallen = false;
    this.retreated = false;
    this.gateBroke = false;
    this.friendHeldT = 0;   // M3：味方が持ち続けた秒数（WIN.timeHeld で使う）
    this.links = [];        // M3：区域のつながり（網）。makeSiegeZones で埋める
    // C4：前の場が落ちて退いて来た時の「門を閉める→置き直す→撃つ用意」の静かな間【城6・37】
    this.quietUntil = 0;     // rt.t がこれを超えるまでは、ここへ寄せても取られない（置き直し中）
    this.gateClosed = false;
    this.redeployed = false;
    this.retreatCount = 0;   // 確かめ用：ここへ退いて来た部隊の数
  }
}

// ---- M3：勝ちの組み合わせ。WIN.* は ctx を受けて真偽を返す関数を作る「型紙」 ----
// ctx = { byId, zones, friendTeam, enemyTeam, commanderDown, enemyInZones, enemyAliveTotal }
export const WIN = {
  zone: (id) => (ctx) => !!ctx.byId[id] && ctx.byId[id].owner === ZONE_STATE.FRIEND,
  percent: (p) => (ctx) => {
    if (!ctx.zones.length) return false;
    const got = ctx.zones.filter((z) => z.owner === ZONE_STATE.FRIEND).length;
    return got / ctx.zones.length >= p;
  },
  commanderDown: () => (ctx) => !!ctx.commanderDown,
  allEnemyFled: () => (ctx) => ctx.enemyAliveTotal > 0 && ctx.enemyInZones === 0,
  supplyCut: (id) => (ctx) => !!ctx.byId[id] && ctx.byId[id].owner === ZONE_STATE.FRIEND,
  timeHeld: (id, sec) => (ctx) => !!ctx.byId[id] && ctx.byId[id].owner === ZONE_STATE.FRIEND && ctx.byId[id].friendHeldT >= sec,
};

export function makeSiegeZones(rt, o = {}) {
  // o.msg：決まった文の差し替え（寺を攻める戦では「本丸」「城主」を「本堂」「衆徒」に。見回り 10/2）
  const M = { ...MSG, ...(o.msg || {}) };
  const friendTeam = o.friendTeam ?? 0, enemyTeam = o.enemyTeam ?? 1;
  const zones = (o.zones || []).map((z) => new Zone(z));
  const byId = {}; for (const z of zones) byId[z.id] = z;
  const honmaru = zones.find((z) => z.honmaru) || null;
  // 「本丸への道が開いた」を出す相手：本丸の一つ手前（next が本丸の場）
  const preHonIds = honmaru ? zones.filter((z) => z.next === honmaru.id).map((z) => z.id) : [];

  // M3：区域のつながり（網）。links は next の鎖とは別に、複数の道を BFS で辿れるようにする
  for (const [a, b] of (o.links || [])) {
    if (byId[a] && byId[b]) { byId[a].links.push(b); byId[b].links.push(a); }
  }
  function reachable(fromId, ownerFilter) {
    const start = byId[fromId]; if (!start) return [];
    const seen = new Set([fromId]), out = [], stack = [fromId];
    while (stack.length) {
      const id = stack.pop(); const z = byId[id];
      if (ownerFilter && id !== fromId && z.owner !== ownerFilter) continue;
      out.push(id);
      for (const nb of z.links) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    return out;
  }

  // M3：退路と封鎖の手。escape 区域を味方が塞げば、退く敵は捕らえるか降る。塞いでいなければ奥（rally）で集まり直す
  const escapeCfg = o.escape || null;

  // C4：静かな置き直しの間（20〜40 秒、既定）と、予備を破られた口へ回す面々【城6・25・37】
  const quietMin = (o.quietRange && o.quietRange[0]) ?? 20;
  const quietMax = (o.quietRange && o.quietRange[1]) ?? 40;
  const reserves = (o.reserves || []).slice();

  // M4：守る砦（fort-spec 18・19）「一定の時を守る→援軍」。reinforceAt: { zoneId, sec }。
  // その区域を味方が sec 秒持ち続けたら、一度だけ知らせて o.onReinforce(rt) を呼ぶ（援軍の出し方は戦の定義の側）
  const reinforceCfg = o.reinforceAt || null;
  let reinforceFired = false;

  const initialDefenders = o.totalDefenders ?? (sumTeam(rt.army.units, enemyTeam) || 1);
  let commanderWasAlive = true;
  let surrendered = false, fled = false, commanderDownFired = false;
  let tickAcc = 0;
  let winReason = null, winWhen = o.winWhen || null;

  const fire = (text, banner) => { if (banner) rt.banner(text, ''); else rt.bark(text); };

  // 場が落ちた（friend が取った／enemy が取り返した）時の、士気・知らせ・退き
  function onOwnerChange(z, to) {
    z.owner = to;
    if (to === ZONE_STATE.FRIEND) {
      z.fallen = true;
      fire(z.honmaru ? M.honmaruFall() : M.zoneFallFriend(z.name), z.honmaru);
      // 守り方の士気を大きく下げ、攻め方は上がる【城40】
      for (const g of rt.army.groups) {
        if (g.team === enemyTeam) g.morale = Math.max(5, g.morale - 14);
        else if (g.team === friendTeam) g.morale = Math.min(100, g.morale + 6);
      }
      // 退き先があれば、その場に残る守り方の隊を退かせる→門を閉める→置き直す→撃つ用意【城6・37】
      if (z.next && byId[z.next] && !z.retreated) {
        z.retreated = true;
        const nz = byId[z.next];
        fire(M.retreat(nz.name));
        const retreaters = [];
        if (nz.pos) {
          for (const g of rt.army.groups) {
            // 崩れて逃げている隊の号令は上書きしない（また戦わせない）
            if (g.team !== enemyTeam || !g.count || g.order === 'flee' || g.routed) continue;
            const c = g.center();
            // 次の場の持ち場（例えば本丸の備え）が、境のゆらぎで元の場の判定にも触れて拾われることがある
            // （z.test と nz.test の両方に当たる境目）。すでに次の場の内にいる隊は、そこの備えそのものなので
            // 「退け」と言わない（さもないと自分の持ち場で「行き先はあるのに動けない」まま足踏みし続ける）
            if (z.test(c.x, c.z) && !nz.test(c.x, c.z) && Math.hypot(c.x - nz.pos.x, c.z - nz.pos.z) > 3) {
              g.order = 'move'; g.dest = { x: nz.pos.x, z: nz.pos.z }; nz.retreatCount++; retreaters.push(g);
            }
          }
        }
        // 門を閉める（壊れていなければ）【城37】。退く隊が通り切るまで待つ
        // （先に閉めると、今まさに退かせた自分の隊が門の前で詰まって動けなくなる）
        if (retreaters.length) nz._pendingGate = { groups: retreaters, since: rt.t || 0 };
        else if (nz.gate && !nz.gateClosed) {
          const st = findGate(rt, nz.gate);
          if (st && st.alive) { nz.gateClosed = true; fire(M.gateClose(st.name || nz.gate)); }
        }
        // 静かな置き直しの間（20〜40 秒）。この間は次の場を取られない
        nz.quietUntil = (rt.t || 0) + quietMin + Math.random() * (quietMax - quietMin);
        nz.redeployed = false;
        // 予備を、破られた口（次の場）へ回す【城25】
        const avail = reserves.filter((b) => b && b.aliveNominal && b.aliveNominal() > 0 && !b._siegeReserveSpent);
        if (avail.length && nz.pos) {
          const r = avail[0];
          r._siegeReserveSpent = true;
          if (r.order) r.order({ id: 'move', to: nz.pos });
        }
      }
      if (preHonIds.includes(z.id)) fire(M.honmaruOpen());
      if (o.onFall) o.onFall(z.id, rt);
      if (z.honmaru && o.onHonmaru) o.onHonmaru(rt);
    } else if (to === ZONE_STATE.ENEMY) {
      fire(M.zoneFallEnemy(z.name));
      for (const g of rt.army.groups) {
        if (g.team === friendTeam) g.morale = Math.max(5, g.morale - 10);
      }
      if (o.onFall) o.onFall(z.id, rt);
    }
  }

  function tickZone(z, dt, units) {
    const fN = countIn(units, z.test, friendTeam);
    const eN = countIn(units, z.test, enemyTeam);
    z.friends = fN; z.enemies = eN;
    // 表の状態【城48】：両方いれば交戦中、そうでなければ持ち主なり
    z.state = (fN > 0 && eN > 0) ? ZONE_STATE.CONTESTED : z.owner;
    // 門：壊れたら一度だけ知らせる【城30】
    if (z.gate && !z.gateBroke) {
      const st = findGate(rt, z.gate);
      if (st && !st.alive) { z.gateBroke = true; z.gateClosed = false; fire(M.gateBroken(st.name || z.gate)); }
    }
    // 退く隊が門を通り切った（着いた・崩れた・討たれた）ら、そこで門を閉める。最長 15 秒待てば閉める
    if (z._pendingGate) {
      const { groups, since } = z._pendingGate;
      const done = groups.every((g) => !g.count || g.order !== 'move' || g.routed
        || (z.pos && Math.hypot(g.center().x - z.pos.x, g.center().z - z.pos.z) < 4));
      if (done || (rt.t || 0) - since > 15) {
        z._pendingGate = null;
        if (z.gate && !z.gateClosed) {
          const st = findGate(rt, z.gate);
          if (st && st.alive) { z.gateClosed = true; fire(M.gateClose(st.name || z.gate)); }
        }
      }
    }
    // C4：静かな置き直しの間が終わったら「備えが整った」を一度だけ【城6・37】
    const quiet = (rt.t || 0) < z.quietUntil;
    if (!quiet && z.quietUntil > 0 && !z.redeployed) { z.redeployed = true; fire(M.redeployed(z.name)); }
    // 「味方 N 人・敵 0 を T 秒」で取る【砦28】。攻守どちらの側からも同じ決まりで数える
    // 置き直し中（quiet）はまだ取られない＝守りが立て直す間を確かに作る
    const toward = quiet ? null : (fN >= z.need && eN === 0) ? ZONE_STATE.FRIEND
      : (eN >= z.need && fN === 0 && z.owner === ZONE_STATE.FRIEND) ? ZONE_STATE.ENEMY : null;
    if (toward && toward !== z.owner) {
      z.holdT += dt;
      if (z.holdT >= z.hold) { z.holdT = 0; onOwnerChange(z, toward); }
    } else {
      z.holdT = Math.max(0, z.holdT - dt * 2);
    }
    // M3：WIN.timeHeld 用に、味方が持ち続けた秒数を数える
    z.friendHeldT = (z.owner === ZONE_STATE.FRIEND) ? z.friendHeldT + dt : 0;
  }

  // M3：勝ちの組み合わせを見る。winWhen が無ければ何もしない（今までどおり onHonmaru・onSurrender で勝つ）
  function tickWin(units) {
    if (winReason || !winWhen || !winWhen.length) return;
    let enemyInZones = 0;
    for (const z of zones) enemyInZones += countIn(units, z.test, enemyTeam);
    const ctx = {
      byId, zones, friendTeam, enemyTeam,
      commanderDown: commanderDownFired,
      enemyInZones, enemyAliveTotal: sumTeam(units, enemyTeam),
    };
    for (const group of winWhen) {
      if (group.every((cond) => cond(ctx))) { winReason = true; break; }
    }
    if (winReason && o.onWin) o.onWin('win', rt);
  }

  // 城主・守将：討死・降伏・逃亡【城59・60／砦29】
  function tickCommander() {
    if (surrendered || !honmaru) return;
    const cmd = o.commander ? o.commander() : null;
    const alive = !!(cmd && cmd.alive);
    if (commanderWasAlive && !alive && !commanderDownFired) {
      commanderDownFired = true;
      fire(M.commanderDown());
      for (const g of rt.army.groups) if (g.team === enemyTeam) g.morale = Math.max(5, g.morale - 25);
      if (o.onCommanderDown) o.onCommanderDown(rt);
    }
    commanderWasAlive = alive;

    const units = rt.army.units;
    const nowDefenders = sumTeam(units, enemyTeam);
    const ratio = nowDefenders / initialDefenders;
    const besieged = honmaru.state === ZONE_STATE.CONTESTED || honmaru.owner === ZONE_STATE.FRIEND;
    const noReinforce = o.noReinforce ? !!o.noReinforce() : true;

    // 降伏：本丸包囲・兵力 20%・援軍なし【城59・砦29】
    if (!surrendered && besieged && ratio <= 0.2 && noReinforce) {
      surrendered = true;
      fire(M.surrender(), true);
      for (const g of rt.army.groups) if (g.team === enemyTeam) g.order = 'hold';
      if (o.onSurrender) o.onSurrender(rt);
      return;
    }
    // 逃亡：降伏しない城主が、追い詰められて搦手へ走る【城60】
    if (!fled && alive && o.backGate && ratio <= 0.35 && besieged) {
      fled = true;
      fire(M.flee());
      if (cmd.group) { cmd.group.order = 'move'; cmd.group.dest = { x: o.backGate.x, z: o.backGate.z }; cmd.group.noRout = true; }
      if (o.onFlee) o.onFlee(rt);
    }
  }

  // M4：援軍の一度きりの判定（毎 tick、WIN と同じ所から呼ぶ）
  function tickReinforce() {
    if (reinforceFired || !reinforceCfg) return;
    const z = byId[reinforceCfg.zoneId];
    if (!z || z.owner !== ZONE_STATE.FRIEND || z.friendHeldT < reinforceCfg.sec) return;
    reinforceFired = true;
    fire(M.reinforce(z.name), true);
    if (o.onReinforce) o.onReinforce(rt);
  }

  // M3：退路が味方に塞がれているか【山22・城60】
  function escapeBlocked() {
    if (!escapeCfg || !byId[escapeCfg.zoneId]) return false;
    return byId[escapeCfg.zoneId].owner === ZONE_STATE.FRIEND;
  }

  // M3：崩れて退く敵の部隊の行き先を決める。呼ぶのは siege_ai.js など（このファイルは決めるだけで押し付けない）
  // 戻り値：'captured'（塞がれていて捕らえ・降る）｜'regroup'（塞がれておらず奥で集まり直す）｜null（escape 未設定）
  function retreatFate(butai) {
    if (!escapeCfg || !butai) return null;
    if (escapeBlocked()) {
      fire(`${butai.name || ''}が退路を断たれ、降った`, false);
      if (butai.order) butai.order({ id: 'hold' });
      butai.captured = true;
      return 'captured';
    }
    if (escapeCfg.rally && butai.order) butai.order({ id: 'retreat', to: escapeCfg.rally });
    butai.regrouping = true;
    return 'regroup';
  }

  return {
    zones, byId, honmaru,
    get surrendered() { return surrendered; },
    get fled() { return fled; },
    get win() { return winReason; },
    get reinforced() { return reinforceFired; },
    reachable,
    escapeBlocked,
    retreatFate,
    tick(dt0) {
      // 区域の数え直しは兵の数×区域の数で重い（携帯で一コマの数 ms）。0.1 秒ごとにまとめて（経った秒はそのまま渡す）
      tickAcc += dt0; if (tickAcc < 0.1) return;
      const dt = tickAcc; tickAcc = 0;
      const units = rt.army.units;
      for (const z of zones) {
        if (o.farInterval && z.pos) {
          z.scanT = (z.scanT || 0) + dt;
          const p = rt.player.u.pos;
          if (z.scanT < (Math.hypot(p.x - z.pos.x, p.z - z.pos.z) > 100 ? o.farInterval : 0.1)) continue;
          const span = z.scanT; z.scanT = 0; tickZone(z, span, units);
        } else tickZone(z, dt, units);
      }
      tickCommander();
      tickReinforce();
      tickWin(units);
    },
    // 記録・確かめ用：今の状態を一覧で
    stat() {
      const out = {};
      for (const z of zones) {
        out[z.id] = {
          name: z.name, owner: z.owner, state: z.state, holdT: Math.round(z.holdT * 10) / 10,
          retreatCount: z.retreatCount, gateClosed: z.gateClosed, redeployed: z.redeployed,
          quietSec: z.quietUntil > 0 ? Math.round(z.quietUntil * 10) / 10 : 0,
        };
      }
      return out;
    },
  };
}

// ======================================================================
// 一番乗り（kaito 10/1「城に登ったら一番乗りだと思ったのに味方がいるのが嫌」）
// 門・木戸が破れても、自分がその曲輪・本丸へ踏み込むまで（または wait 秒）、味方は門の外の脇で待つ。
// 門の真ん前は空けておくので、自分が先に入れる（b_castle.js の F.gateWaitReg・gateWait と同じ考え）。
// 使い方（縄張り版の戦から）：
//   F.FI = makeFirstIn(rt, { from: 寄せ手の出だし, gates: [{ gate: F.gates.oteInner, zone: C.kuruwa.san.test }, { gate: F.gateTodo }] });
//   update で毎コマ F.FI.tick()（部隊を動かす処理＝tickRoutes などの後に呼ぶ）
// gate は siege_gate.js の門（opened を持つ）・castle_parts.js の門（{ struct }）・struct のどれでもよい。
// zone（曲輪の内か）を渡さなければ、門の線を内へ越えたかで見る。
// ======================================================================

// 隊を一時その場に留める（留めている間に戦の側が下知を変えたら、それを覚えて放す時に戻す）
function saveOrder(g) {
  return { order: g.order, dest: g.dest, anchor: g.anchor ? { x: g.anchor.x, z: g.anchor.z } : null, aggro: g.aggro,
    seekRange: g.seekRange, onArrive: g.onArrive, path: g.path, pathIdx: g.pathIdx };
}
function applyPin(g) {
  const P = g._pinH;
  P.anchor = { x: P.spot.x, z: P.spot.z };
  g.order = 'hold'; g.dest = null; g.onArrive = null; g.anchor = P.anchor; g.aggro = P.aggro; g.noAI = true;
  if (P.face != null) g.facing = P.face;
  const L = g.butai && g.butai.light;
  if (L && L.halt) L.halt();
}
export function pinGroup(g, spot, face, o = {}) {
  if (!g || g._pinH) return;
  g._pinH = { save: saveOrder(g), noAI: g.noAI, spot: { x: spot.x, z: spot.z }, face, aggro: o.aggro ?? 6, by: o.by || null };
  applyPin(g);
}
// 毎コマ：戦の側（tickRoutes・ai など）が下知を変えていれば覚え直して、また留める
export function keepPinned(g) {
  const P = g && g._pinH;
  if (!P) return;
  if (g.order !== 'hold' || g.anchor !== P.anchor) {
    const s = saveOrder(g);
    if (s.aggro === P.aggro) s.aggro = P.save.aggro;
    P.save = s;
    applyPin(g);
  }
}
export function unpinGroup(g) {
  const P = g && g._pinH;
  if (!P) return;
  g._pinH = null;
  const s = P.save;
  g.order = s.order; g.dest = s.dest; g.onArrive = s.onArrive; g.aggro = s.aggro; g.seekRange = s.seekRange;
  g.path = s.path; g.pathIdx = s.pathIdx; g.noAI = P.noAI;
  g.anchor = s.order === 'hold' && s.anchor ? s.anchor : { x: P.anchor.x, z: P.anchor.z };
  // 部隊（butai.js）の軽い大軍も、今の下知で歩き直す
  const b = g.butai;
  if (b && b.cmd && b.cmd.id !== 'hold' && b.order) b.order(b.cmd);
}

function gateGeom(e, from) {
  const s = e.gate.struct || e.gate;
  const seg = s.seg || [s.x - 1.5, s.z, s.x + 1.5, s.z];
  const mid = { x: (seg[0] + seg[2]) / 2, z: (seg[1] + seg[3]) / 2 };
  let tx = seg[2] - seg[0], tz = seg[3] - seg[1];
  const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
  let nx = s.nx ?? -tz, nz = s.nz ?? tx;
  // 外向き：曲輪の内でない側（zone が無ければ、寄せ手の出だしのある側）
  const zA = e.zone && e.zone(mid.x + nx * 4, mid.z + nz * 4), zB = e.zone && e.zone(mid.x - nx * 4, mid.z - nz * 4);
  const out = zA !== zB ? !zA : (from.x - mid.x) * nx + (from.z - mid.z) * nz > 0;
  if (!out) { nx = -nx; nz = -nz; }
  e.s = s; e.mid = mid; e.n = { x: nx, z: nz }; e.t = { x: tx, z: tz }; e.half = L / 2;
}

export function makeFirstIn(rt, o = {}) {
  const team = o.team ?? 0, WAIT = o.wait ?? 15, R = o.radius ?? 45;
  const from = o.from || (rt.def && rt.def.spawn) || { x: 0, z: 0 };
  const list = [];
  const isOpen = (e) => {
    if (e.isOpen) return e.isOpen();
    const G = e.gate;
    if (typeof G.tick === 'function' && 'opened' in G) return G.opened;
    return e.s.hp <= 0 || e.s.alive === false;
  };
  const inside = (e, x, z) => {
    if (e.zone && e.zone(x, z)) return true;
    const dx = x - e.mid.x, dz = z - e.mid.z;
    const depth = -(dx * e.n.x + dz * e.n.z), lat = Math.abs(dx * e.t.x + dz * e.t.z);
    return depth > 1.5 && depth < 30 && lat < e.half + 8;
  };
  const release = (e) => { for (const g of e.held) if (g._pinH && g._pinH.by === e) unpinGroup(g); e.held.length = 0; };
  const S = {
    list,
    add(gate, zone, extra = {}) {
      if (!gate) return null;
      const e = { gate, zone: zone || null, st: 'shut', t0: 0, held: [], side: [0, 0], isOpen: extra.isOpen,
        name: extra.name || gate.name || (gate.struct && gate.struct.name) || '門' };
      gateGeom(e, from);
      list.push(e);
      return e;
    },
    // いま門の外で待たせているか（確かめ用）
    waiting() { return list.some((e) => e.st === 'wait'); },
    heldCount() { return list.reduce((n, e) => n + e.held.length, 0); },
    tick() {
      const pu = rt.player && rt.player.u;
      if (!pu) return;
      for (const e of list) {
        if (e.st === 'done') continue;
        if (e.st === 'shut') {
          if (!isOpen(e)) continue;
          if (inside(e, pu.pos.x, pu.pos.z)) { e.st = 'done'; continue; }
          e.st = 'wait'; e.t0 = rt.t;
          if (rt.bark && Math.hypot(pu.pos.x - e.mid.x, pu.pos.z - e.mid.z) < 90) rt.bark(`${e.name}が破れた。味方は門の外で待つ。一番乗りを`);
        }
        if (inside(e, pu.pos.x, pu.pos.z) || rt.t - e.t0 > WAIT) { release(e); e.st = 'done'; continue; }
        for (const g of rt.army.groups) {
          if (g.team !== team || g.isPlayerSquad || g.civ || g === pu.group || !g.count) continue;
          if (g._pinH) { if (g._pinH.by === e) keepPinned(g); continue; }
          const c = g.center();
          if (Math.hypot(c.x - e.mid.x, c.z - e.mid.z) > R || inside(e, c.x, c.z)) continue;
          // 門の真ん前を空け、左右の脇へ寄せる（同じ側の二つ目からは、さらに外へ）
          const sd = (c.x - e.mid.x) * e.t.x + (c.z - e.mid.z) * e.t.z;
          const si = sd >= 0 ? 0 : 1, sign = si ? -1 : 1, k = e.side[si]++;
          const lat = e.half + 5 + k * 3, out = 6 + k * 4;
          const spot = { x: e.mid.x + e.n.x * out + e.t.x * lat * sign, z: e.mid.z + e.n.z * out + e.t.z * lat * sign };
          pinGroup(g, spot, Math.atan2(-e.n.x, -e.n.z), { by: e, aggro: 6 });
          e.held.push(g);
        }
      }
    },
  };
  for (const gg of o.gates || []) S.add(gg.gate, gg.zone, gg);
  return S;
}
