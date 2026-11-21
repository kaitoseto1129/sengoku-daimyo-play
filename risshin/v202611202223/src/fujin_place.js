// 布陣の表（fujin_table.js）を並べる共通の仕組み（11/14 束A）。battle.js が毎コマ呼ぶ。表のある戦だけ働く。
//   見せかけの兵は作らず、備ごとに「本物の備」を置く（同じ名は一つ・兵の装束はその戦の兵から・旗と具足は表のとおり）。
import { hiddenSpot } from './spawn_sight.js';
import { FUJIN } from './fujin_layout.js';
import { realFromLight } from './depth_reserve.js';
import { isTouch } from './touch.js';
import { nobori } from './props.js';
import * as THREE from 'three';
import { drawMon } from './textures.js';
import { idleFarTick } from './idle_far.js';
import { realCapOf } from './device_tier.js';   // 11/20 記憶の予算
// 11/19 係（天王寺レベルの軍勢・携帯の重さ）：表が idleFar の戦は、表が立てた備（_fjR）のうち本人から遠く持ち場で待つだけの組を休ませる（idle_far.js・天王寺と同じ手。携帯だけ）
export function fujinIdleFar(rt) { const T = fujinFor(rt); if (T && T.idleFar && rt.flags._fj) idleFarTick(rt, { only: (g) => !!g._fjR || !!g._idleOk }); }   // _idleOk：戦の筋の組でも、持ち場で待つだけの組は休ませてよい印（設楽原の柵の後ろの将の旗本 11/19）

export function fujinFor(rt) {
  const id = rt.def && (rt.def.key || rt.def.id);
  return id && FUJIN[id] ? FUJIN[id] : null;
}
export function fujinTick(rt, enemyGroup, allyGroup) {
  const T = fujinFor(rt); if (!T || rt.def.ownFujin) return;
  // 11/15 クラウドわ（K315「行けばいる」）：表が lazy の戦は、初めに遠かった備を取っておき、本人が近づいたら（1秒ごとに見る）その時に出す
  if (rt.flags._fj) {
    if (rt.player?.u && (rt.t || 0) >= (rt.flags._fjPendT || 0)) {
      rt.flags._fjPendT = (rt.t || 0) + 1;
      // 11/16 MacBook天王寺-広さ（K315「行けばいる」・携帯）：携帯は本物の兵が上限を超えると近づいた備を立てられず、城の側へ歩いても空だった。
      //   本人から遠く（175m 超＝立てる 140m の外）離れて持ち場で待つだけの備（斬り合っていない・崩れていない）は片付けて取っておきの列へ戻し、近づけばまた立てる
      if (isTouch && (T.lazy || T.tRoom != null)) releaseFar(rt, T.reachK || 1);
      if (rt.flags._fjPend && rt.flags._fjPend.length) { const P = rt.flags._fjPend; rt.flags._fjPend = []; placeRows(rt, T, P, rt.flags._fj, enemyGroup, allyGroup); }
    }
    fujinMoves(rt, T);
    fujinAdvance(rt, T);
    return;
  }
  if (!rt._tpl || !rt._tpl.E || !rt._tpl.A || !rt.player?.u) return;   // 兵の装束が覚えられてから（戦の始めの数コマ後）
  const me = rt.player.u.pos, list = rt.flags._fj = [];
  // 11/14 クラウドさ（K287②・K292「備は細い一本線で図鑑の厚い列・旗の林に遠い」）：表の行に blocks があれば、その列を大名・将ごとの塊に分ける
  //   （塊ごとに家の旗・ranks の段の厚み・nobori で塊の後ろに家の幟を林のように立てる。本物の兵と立てた幟だけ）。携帯は一列に二塊まで
  const rows = [];
  const R0 = attachRows(rt, T, T.rows);   // 11/20 K456：家ごとの塊を、その家の名のある武将の備の前・周り・後ろへ（布陣を一つに）
  for (const r of R0) {
    if (!r.blocks || !r.blocks.length) { rows.push(r); continue; }
    const B = isTouch ? r.blocks.slice(0, 2) : r.blocks, K = B.length, c = Math.cos(r.facing || 0), s = Math.sin(r.facing || 0);
    B.forEach((b, k) => {
      // 11/16 MacBook天王寺-厚み（広さの係の頼み：携帯の塊が10〜12人で薄い）：携帯の deep の表は、一列の二つの塊を列の幅いっぱいに離さず、肩を並べて一つの厚い塊に寄せる（中心の間 5m・兵の数は同じ）
      const off = K > 1 ? ((k + 0.5) / K - 0.5) * (isTouch && T.deep ? Math.min(r.w * 0.92, K * 5) : r.w * 0.92) : 0;   // 列の横（向きに直角）に並べる
      rows.push({ ...r, _off: off, x: r.x + c * off, z: r.z - s * off, w: r.blockW || 10, count: r.blockCount || 480, name: b.name || b.lead + 'の備', leaders: b.lead && (!b.onField || !rt.army.units.some((u) => u.alive && u.name === b.lead)) ? [b.lead] : null, standIn: b.onField ? b.lead : null, flag: b.flag || r.flag, block: true });
    });
  }
  placeRows(rt, T, rows, list, enemyGroup, allyGroup);
}
function placeRows(rt, T, rows, list, enemyGroup, allyGroup) {
  const me = rt.player.u.pos;
  // 11/15 iMac三十四（K210・K315 kaito「この人数ならパソコンは良い。携帯はやばい」）：携帯で lazy の表（天王寺）は、本物の兵が上限＋30 を超える間は備を立てず取っておく
  //   （NORENDER 150秒の最大 473・iPhone の真似で一コマ 120ms だった）。数が減れば一秒ごとに見直して立てる。パソコンは今のまま（布陣の表の厚み K287）
  let live = -1;
  // 11/20 K285（司令塔：大軍にした長久手・千石堀・根来・太田・八王子・小田原・伏見が携帯で本物 266〜358）：表の tRoom＝携帯で上限に足してよい数（既定 30）。tRoom のある表は lazy でなくても携帯は同じ見張りを使う
  const room = T.tRoom ?? 30;
  const roomFull = () => { if (!isTouch || !(T.lazy || T.tRoom != null)) return false; if (live < 0) { live = 0; for (const u of rt.army.units) if (u.alive && !u.gone) live++; } return live >= (realCapOf(rt.def)) + room; };
  for (let r of rows) {
    r = movedRow(rt, slotRow(r));   // 11/19 係（kaito 戸次川「増えた兵は動かずついて来ない」）：段ごとの行き先が満ちた後に立つ備は、その行き先に立てる
    // 11/16 MacBook天王寺-広さ（K315「行けばいる」）：本人の 80m 内まで来た備は、携帯の数の上限を 12 人まで越えても立てる（それより多い時は待つ。遠い備は releaseFar が片付ける）。始まりの陣の周りで一斉に立って 408 人になった（11/16 測り）ので越える幅を絞った
    // 11/20 K458：戦場を広げた戦（三方ヶ原 reachK 2.5）は、備を立てる遠さも同じ倍率で測る（広げる前と同じ時に同じ備が立つ・数と重さは前と同じ）
    const dR = Math.hypot(r.x - me.x, r.z - me.z) / (r.reachK || T.reachK || 1);   // r.reachK：広げた備の行だけの倍率（八尾・若江の大坂の奥）
    // 11/19 クラウドさ：r.tLazy＝携帯だけ、その行を本人の 140m 内に来た時に立てる（表が lazy でなくても）。r.tN＝携帯の塊の人数（既定の 5〜6 より厚く）
    if (dR > (r.far ? 260 : isTouch ? 140 : 190) || (isTouch && r.tLazy && dR > 140) || (dR > 80 ? roomFull() : (roomFull() && live >= (realCapOf(rt.def)) + room + 12))) { if (T.lazy || (isTouch && (r.tLazy || T.tRoom != null))) (rt.flags._fjPend || (rt.flags._fjPend = [])).push(r); continue; }   // far：本人の先の山場に立つ備（関ヶ原の宇喜多の二の備）
    // 11/16 MacBook天王寺-広さ（K315「近づいた時にしっかり軍勢がいる」）：携帯で lazy の表は、遠い備を片付けて空きがある間（roomFull と同じ 上限＋30 の内に収まる時）、近くに立てる塊を 6→12 人に
    const tb = isTouch && (T.lazy || T.tRoom != null) && r.block && (roomFull(), live >= 0) && live + 12 < (realCapOf(rt.def)) + room ? 12 : 6;
    // 11/16 MacBook天王寺-厚み：lazy で後から立つ塊は、その時に本物の大将（onField）が出ていれば代わりの名を付けない（同じ名が二つ）
    if (r.standIn && rt.army.units.some((u) => u.alive && !u._standIn && u.name === r.standIn)) r = { ...r, leaders: null, standIn: null };
    // 11/20 K470（spawn_sight.js）：戦の途中（20秒より後）に立つ備は、見えている所なら画面の外（横・奥）に立てて持ち場へ歩かせる。置けなければ次の見直しまで待つ
    let hid = null;
    if ((rt.t || 0) > 20 && !r.fixedPos && !T.stayPut && !r.stayPut) {   // 柵の内・付城・出丸の持ち場（stayPut）の戦は横へ回すと柵に掛かるので今まで通り
      const lim = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 24;
      const q = hiddenSpot(rt, r, (p) => Math.abs(p.x) < lim && Math.abs(p.z) < lim && rt.world.walkable?.(p.x, p.z) !== false);
      if (!q) { (rt.flags._fjPend || (rt.flags._fjPend = [])).push(r); continue; }
      if (q !== r) hid = q;
    }
    try {
      const g = realFromLight(rt, { x: hid ? hid.x : r.x, z: hid ? hid.z : r.z, w: r.w, d: r.d, count: r.count, facing: r.facing, team: r.side, look: { flag: r.flag, armor: r.armor }, cav: r.cav, cavKeep: r.cavKeep, min: isTouch ? (r.tN || (r.block ? tb : 5)) : (r.block ? 32 : 8) },
        enemyGroup, allyGroup, isTouch ? 0.02 : 0.12, isTouch ? (r.tN || (r.block ? tb : 9)) : (r.block ? (r.blockMax || 44) : 36), r.name, r.leaders && r.leaders.length ? r.leaders : null);
      // 11/14 クラウドす（K127「振り返ると何も無い」）：表の keep の戦は、本人が先へ出ても frontFill の上限の刈り込みで後ろの備を消さない（u.keepReal）
      if (g && T.keep) for (const u of g.units || []) u.keepReal = true;
      // 11/14 クラウドわ（K287「岡山口の秀忠の札が出ない」）：段の途中で本物が作られる大将（onField・秀忠）は、まだいない間は塊の頭に名だけの代わりを立てる（討たれない）。本物が出たら段の側が代わりの名を外す
      if (g && r.standIn) for (const u of g.units || []) if (u.name === r.standIn) { u._standIn = true; u.invuln = true; }
      // 11/19 係（天王寺レベルの軍勢）：r.noEngage＝持ち場で待つだけの備（本能寺の通りの明智）。共通の engageNear が遠くの備の印（_far）を見て
      //   十八m 内の相手へ待ちを解かないよう印を外す（塀の内の織田へ寄せない。寄せは台本の波が出す）
      if (g && r.noEngage) g._far = false;
      if (g && hid) { g._fjR = r; g._fjHid = true; marchTo(rt, T, g, { x: r.x, z: r.z, facing: r.facing }, 3.6); }   // K470：画面の外から持ち場へ
      // K442（真田丸の目標の画）：r.stay＝戦の筋の全軍の寄せ（all_out）にも拾わせず、持ち場に立ち続ける備（堀の前の野を埋める寄せ手）
      if (g && r.stay) g.stay = true;
      if (g && live >= 0) live += g.count || 0;
      if (g) { g._fujinRow = r.row; g._fjR = r; g._mvK = r._mvK0 ?? -1; list.push(g); if (r.block) blockLook(rt, g, r); if (!isTouch) overheadPlate(rt, g, r); }
    } catch (e) { window.__fujinErr = String(e && e.stack || e).slice(0, 300); }
  }
}

// 11/19 係（kaito 11/19 戸次川「増えた兵は動かず何もしていない。川を渡っても元の場所にいて、ついて来なかった」・全戦に共通の根）：
//   表の備は realFromLight が stay・fixed・hold で立てるので、段が進んでも持ち場に立ったままだった。
//   ① 行の moves：[{ when: (rt) => 条件, x, z, facing, speed }]。満ちた一番後ろの行き先へ、隊列を保って歩いて移る（'move' を浅瀬の口ごとに繋ぐ）。
//      塊（blocks）は列の中の横のずれ（_off）を行き先の向きで保つ。
//   ② moves の無い味方の備は、本人が備の中心から 120m より離れたら、本人の 55m 後ろ（備のいた側）へついて来る（六秒ごとに見直す）。
//      表の stayPut（設楽原の柵の内・付城・囲みの陣）か行の stayPut・noEngage（持ち場で待つだけと決めた備）は動かさない。
//   ③ 表の cross（{ at: 川の z, mouth: 岸の口の z の幅, fords: [{ x, w }] }）があれば、川の向こうへ移る時は近い浅瀬の中を通る。
function moveAt(r, m) {
  const f = m.facing ?? r.facing ?? 0, off = r._off || 0;
  return { x: m.x + Math.cos(f) * off, z: m.z - Math.sin(f) * off, facing: f };
}
function movedRow(rt, r) {
  const mv = r.moves; if (!mv || !mv.length) return r;
  let k = -1; for (let i = mv.length - 1; i >= 0; i--) { let ok = false; try { ok = !!mv[i].when(rt); } catch (e) { ok = false; } if (ok) { k = i; break; } }
  if (k < 0) return r;
  const p = moveAt(r, mv[k]);
  return { ...r, x: p.x, z: p.z, facing: p.facing, _mvK0: k };
}
function fordPath(T, g, from, to) {
  const C = T.cross; if (!C || !C.fords || !C.fords.length) return [[to.x, to.z]];
  const a = C.at || 0, m = C.mouth || 28;
  if ((from.z - a) * (to.z - a) >= 0) return [[to.x, to.z]];
  let f = C.fords[0], best = 1e9;
  for (const q of C.fords) { const c = Math.abs(from.x - q.x) + Math.abs(to.x - q.x); if (c < best) { best = c; f = q; } }
  const half = Math.max(1, (f.w || 10) - 6), h = ((g.id ?? 0) * 7919 + (g.units?.length || 0) * 31) % 1000 / 1000;
  const lx = f.x + (h * 2 - 1) * half, s = from.z > a ? 1 : -1;
  return [[lx, a + s * m], [lx, a - s * m], [to.x, to.z]];
}
function marchTo(rt, T, g, p, speed) {
  const lim = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 16;
  const x = Math.max(-lim, Math.min(lim, p.x)), z = Math.max(-lim, Math.min(lim, p.z));
  const from = g.anchor || g.center(), pts = fordPath(T, g, from, { x, z });
  g.speed = speed || 3.6; g.keepMoveOrder = true; g.focus = null; g.path = null; g._fjMoving = true;
  g._fjR = { ...g._fjR, x, z, facing: p.facing ?? g._fjR.facing };   // 片付け（releaseFar）と立て直しも新しい持ち場で
  // 'path' は列の後ろの遅れを待って先頭が止まり、浅瀬の中で二十秒余り足踏みした（描かずの数え）。一つずつの 'move' を繋ぐ（遅れた者は駆けて持ち場へ）
  let i = 0;
  const next = (q) => {
    if (i >= pts.length) { q.order = 'hold'; q.anchor = { x, z }; q.dest = null; if (p.facing != null) q.facing = p.facing; q.onArrive = null; q._fjMoving = false; return; }
    const w = pts[i++]; q.order = 'move'; q.dest = { x: w[0], z: w[1] }; q.onArrive = next;
  };
  next(g);
}
function fujinMoves(rt, T) {
  const F = rt.flags, list = F._fj; if (!list || !list.length) return;
  if ((F._fjMvT || 0) > rt.t) return; F._fjMvT = (rt.t || 0) + 0.5;
  const me = rt.player?.u; if (!me || rt.over) return;
  for (const g of list) {
    const r = g && g._fjR; if (!r || g.routed || !(g.count > 0) || g._fjGo) continue;   // K457：前へ出た備は持ち場へ戻さない
    if (r.moves && r.moves.length) {
      const q = movedRow(rt, r), k = q._mvK0 ?? -1;
      if (k > (g._mvK ?? -1)) { g._mvK = k; marchTo(rt, T, g, { x: q.x, z: q.z, facing: q.facing }, r.moves[k].speed); }
      continue;
    }
    // 11/20 K456：武将に付けた塊は、武将が動けば同じ並び（前・周り・後ろ）のまま付いて行く（武将と別に立たない）。武将が討たれたら前のまま
    // 11/20 K466（kaito 三方ヶ原「内藤隊が行くなら隊の全部が内藤を守って一緒に行く。武将と数人だけ前に出て討たれる・後ろで突っ立つ塊を無くす」）：
    //   描かずの act bot で、勝頼の旗本6人が寄せて討たれる間、付けた塊32人は60m 後ろで持ち場に立ったままだった（八秒ごと・30m 離れた時だけ追い、斬り合いには入らない）。
    //   ① 一秒ごとに武将の今の所からの持ち場へ、離れていれば駆けて寄る（10m を超えたら・武将の歩みより速く）
    //   ② 武将の隊が「かかれ」・斬り合い・四十m 内に敵の時は、塊も持ち場を解いて武将の周りの敵へかかる（武将を守って一緒に戦う）
    //   ③ 塊が三十m より遅れている間は、斬り合っていない武将の隊の歩みを塊に合わせて抑える（武将だけが先へ出ない）
    if (r._gu && r._gu.alive && !r._gu.gone && typeof window !== 'undefined' && window.__k466off) {   // 前後の比べの動画だけ（直す前の動き）
      if (T.stayPut || g._fjMoving || (g._flT || 0) > rt.t || g.units.some((u) => u.alive && u.target && u.target.alive)) continue;
      const p = slotRow({ ...r, _off: r._off || 0 }), c = g.anchor || g.center();
      if (Math.hypot(p.x - c.x, p.z - c.z) < 30) continue;
      g._flT = rt.t + 8; marchTo(rt, T, g, { x: p.x, z: p.z, facing: r.facing }, 3.8); continue;
    }
    if (r._gu && r._gu.alive && !r._gu.gone) {
      if (r.stayPut) continue;   // 表の noEngage（持ち場で待つ備）でも、武将に付けた塊は武将と一緒に動く（三方ヶ原の武田の後備えは noEngage で、勝頼から百m 後ろに残った）
      const gu = r._gu, G = gu.group;
      // 11/20 K466 クラウド kaito2（設楽原 act bot：付いた兵が終始一割ほど・521秒 0/52、原昌胤・馬場信春・本多忠勝が単騎）：表の stayPut（柵の内で待つ戦）は
      //   武将に付けた塊まで丸ごと止めていた。武将が持ち場に居る間は今のまま待ち、武将が持ち場から三十m 動いたら（寄せ・追い討ち・退き）塊も一緒に動く
      if (T.stayPut) { if (!gu._k466H) gu._k466H = { x: gu.pos.x, z: gu.pos.z }; if (Math.hypot(gu.pos.x - gu._k466H.x, gu.pos.z - gu._k466H.z) < 30 && !g._k466Lv) continue; g._k466Lv = true; }
      const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing); if (!al.length) continue;
      let cx = 0, cz = 0; for (const u of al) { cx += u.pos.x; cz += u.pos.z; } cx /= al.length; cz /= al.length;
      const busy = al.some((u) => u.target && u.target.alive);
      const gFight = !!G && !G.routed && (G.order === 'attack' || G.order === 'assault' || G.units.some((u) => u.alive && (u.atk || u.target && u.target.alive)))
        && !!rt.army.nearestEnemy?.({ pos: gu.pos, team: gu.team }, 40, (o) => !o.fleeing && !o.noTarget && !o.isStruct && !o.civ);
      const p = slotRow({ ...r, _off: r._off || 0 }), lag = Math.hypot(cx - gu.pos.x, cz - gu.pos.z);
      // 11/20 夜 K466（司令塔・cloud-22：筋書きの組の武将は5〜7人の旗本だけで寄せ、旗本が討たれると一人で立つ）：武将の組（筋書き）が八人を切れば、
      //   付けた塊から武将の近い順に兵を移して十二人まで満たす（筋書きの下知は武将の組に出るので、移った兵は武将と一緒に動く）。塊は四人以上残す
      if (G && !G.routed && !G._fjR && !G.isPlayerSquad && !G.honjin && !G.interiorHold && !busy && !(typeof window !== 'undefined' && window.__k466off)) {
        const gn = G.units.filter((o) => o.alive && !o.gone && !o.fleeing).length;
        if (gn < 8) {
          const give = al.filter((o) => !o.name && o.type !== 'busho' && !o.stdHeld && !o.mounted).sort((a, b) => Math.hypot(a.pos.x - gu.pos.x, a.pos.z - gu.pos.z) - Math.hypot(b.pos.x - gu.pos.x, b.pos.z - gu.pos.z)).slice(0, Math.max(0, Math.min(12 - gn, al.length - 4)));
          for (const v of give) {
            g.units = g.units.filter((o) => o !== v); v.group = G; G.units.push(v);
            const used = new Set(G.units.filter((o) => o !== v && o.alive && !o.gone).map((o) => o.slot)); let s2 = 0; while (used.has(s2)) s2++; v.slot = s2;
            v.target = null; v.atk = null; v.aiT = 0; v.moveTo = null;
          }
          if (give.length) { G.initial = Math.max(G.initial || 0, G.units.filter((o) => o.alive).length); G._slotChkAt = 0; G._fitAt = 0; }
        }
      }
      if (G && !G.routed) {
        if (lag > 30 && !gFight && (G.order === 'move' || G.order === 'path' || G.order === 'attack')) { if (G._k466Sp == null) G._k466Sp = G.speed; G.speed = Math.min(G.speed || 3.6, 2.6); G._k466Who = g; }
        else if (G._k466Sp != null && G._k466Who === g && lag < 18) { G.speed = G._k466Sp; G._k466Sp = null; G._k466Who = null; }
      }
      if (gFight) {
        // 武将の二十m 内（持ち場の向き）を寄る所にし、四十m 内の敵へかかる
        const k = Math.min(1, 20 / Math.max(1, Math.hypot(p.x - gu.pos.x, p.z - gu.pos.z)));
        g._fjFord = 0;
        if (g.order !== 'attack' || !g._k466A) { g._k466A = true; g.stay = false; g.order = 'attack'; g.retreatOnly = false; g.dest = null; g.path = null; g.onArrive = null; g._fjMoving = false; }
        g.aggro = Math.max(g.aggro || 0, 18); g.seekRange = Math.max(g.seekRange || 0, 40);
        if (!busy) g.anchor = { x: gu.pos.x + (p.x - gu.pos.x) * k, z: gu.pos.z + (p.z - gu.pos.z) * k };
        continue;
      }
      if (busy) continue;   // 斬り合いの最中は離さない
      if (g._k466A) { g._k466A = false; g.order = 'hold'; g.stay = true; }
      const off = Math.hypot(p.x - cx, p.z - cz);
      if (off < 10) { if (g._fjMoving && g.order === 'move') { g.order = 'hold'; g.anchor = { x: p.x, z: p.z }; g.dest = null; g.onArrive = null; g._fjMoving = false; g.facing = r.facing ?? g.facing; } continue; }
      const gs = (G && G.anchorSpeed) || 0;
      // 川を渡る時だけ浅瀬を通す（渡らない移りまで浅瀬の道を待つと、戸次川で元親の塊24人が武将の25m 内へ一度も来なかった）。浅瀬の道は四十五秒で見切る
      if (g._fjFord && g._fjMoving && rt.t - g._fjFord < 45) continue;
      g._fjFord = 0;
      if (T.cross && fordPath(T, g, { x: cx, z: cz }, p).length > 1) { g._fjFord = rt.t; marchTo(rt, T, g, { x: p.x, z: p.z, facing: r.facing }, Math.max(3.8, gs + 1.4)); continue; }
      g.speed = off > 30 ? Math.max(4.6, gs + 1.6) : Math.max(3.8, gs + 1); g.keepMoveOrder = true; g.focus = null; g.path = null; g._fjMoving = true;
      g.order = 'move'; g.dest = { x: p.x, z: p.z }; g._fjR = { ...g._fjR, x: p.x, z: p.z };
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; q.dest = null; q.onArrive = null; q._fjMoving = false; if (r.facing != null) q.facing = r.facing; };
      continue;
    }
    if (r.side !== 0 || T.stayPut || r.stayPut || r.noEngage || g._fjMoving || (g._flT || 0) > rt.t) continue;
    const c = g.anchor || g.center(), dx = c.x - me.pos.x, dz = c.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d <= 120) continue;
    if (g.units.some((u) => u.alive && u.target && u.target.alive)) continue;   // 斬り合いの最中は離さない
    g._flT = rt.t + 6;
    // 11/20 クラウドせ（稲葉山 401秒：丹羽の後ろの備が本人を追って鹿垣の口を抜け、山裾の切岸 (3,35) に突き当たって重なり止まる）：
    //   表の followMinZ＝ついて来る行き先の北の限り（山や切岸の手前）。元から北にいた備は元の z まで
    if (g._fjZ0 == null) g._fjZ0 = r.z;
    let fz = me.pos.z + dz / d * 55;
    let fx = me.pos.x + dx / d * 55;
    if (T.followMinZ != null) {
      fz = Math.max(fz, Math.min(T.followMinZ, g._fjZ0));
      // 11/20 稲葉山（371・481秒：池田恒興の東の備が本人を追って (−7,42) の切岸の根へ寄り重なる。左右45mに絞ると今度は隣の備の持ち場 (100,85) へ重なった）：
      //   元から followMinZ より北の持ち場の備は、本人を追わず持ち場で待つ（持ち場どおりに並ぶ）
      if (g._fjZ0 < T.followMinZ) { g._flT = rt.t + 6; continue; }
    }
    // 11/20 稲葉山（341秒：織田の後詰 南の7人が (1,65) の同じ口へ、ほかの備と同じ行き先で重なる）：ついて来る行き先を備ごとに横と奥へずらす（備の間は 18m 以上）
    const hi = ((list.indexOf(g) * 7 + 3) % 9);
    fx += (hi % 3 - 1) * 20; fz += (Math.floor(hi / 3) - 1) * 14 + 14;
    marchTo(rt, T, g, { x: fx, z: fz }, 3.8);
  }
}

// 11/20 K470（kaito「旗だけ立つ所を無くす」・K391 の続き）：表の備の幟は立てた所に置いたままで、備が動くと（ついて来る・武将に付く・前へ出る）
//   元の所に旗だけが残った（orphan_flags は三十 m 内に誰か一人いれば出したまま）。半秒ごとに、備の生きた兵の真ん中から立てた時の並び（横・後ろ）で付いて行かせ、
//   兵が減れば本数も減らす（兵二人に一本まで・前の列から残す）。備が討たれ尽くす・崩れる・片付けられたら幟も下ろす。depth_real の備（r.dr）は depth_real.js が動かす
//   11/20 続き：depth_real の備（r.dr）も、攻めに出る・崩れると幟が元の所に残った（パソコン 200秒で兵のいない幟 99/931）→ blockLook の幟を持つ全部の組で。battle.js が毎コマ呼ぶ
export function blockFlagsTick(rt) {
  const F = rt.flags; if (!F || !rt.army || (typeof window !== 'undefined' && (window.__k470off || /[?&]k470off=1\b/.test(location.search)))) return;   // __k470off：前後の比べだけ
  if ((F._fjFlT || 0) > rt.t) return; F._fjFlT = (rt.t || 0) + 0.5;
  const P = rt.player?.u?.pos;
  const G = F._nbG; if (!G || !G.size) return;
  // 7m の升に生きた兵を入れておき、幟ごとに周り九升だけを見る（毎回全員を見ない）
  const cell = new Map(), key = (i, j) => i * 100003 + j;
  for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) { const k = key(Math.floor(u.pos.x / 7), Math.floor(u.pos.z / 7)); const a = cell.get(k); if (a) a.push(u); else cell.set(k, [u]); }
  const nearMan = (x, z) => { const i0 = Math.floor(x / 7), j0 = Math.floor(z / 7); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = cell.get(key(i, j)); if (a) for (const u of a) if (Math.abs(u.pos.x - x) < 7 && Math.abs(u.pos.z - z) < 7) return true; } return false; };
  for (const g of G) {
    const N = g && g._nobs; if (!N || !N.length || g._nbFace == null) { G.delete(g); continue; }
    const r = g._fjR || { facing: g._nbFace };
    let n = 0, cx = 0, cz = 0;
    if (!g.routed) for (const u of g.units || []) if (u.alive && !u.gone && !u.fleeing) { n++; cx += u.pos.x; cz += u.pos.z; }
    // 立てた時の兵の数に対する残りの割合で減らす（始めは全部・兵が半分なら幟も半分。天王寺の幟の林を始めから間引かない）。少なくとも兵二人に一本
    if (g._nb0 == null && n) g._nb0 = n;
    const keepN = Math.min(N.length, Math.max(Math.ceil(n / 2), Math.round(N.length * n / Math.max(1, g._nb0 || n))));
    if (n) { cx /= n; cz /= n; }
    const f = g._nbFace ?? r.facing ?? 0, fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f);   // 表の向き（斬り合いで向きが揺れても旗の並びは揺らさない）
    for (let i = 0; i < N.length; i++) {
      const nb = N[i], o = nb.userData.fjOff;
      let v = i < keepN;
      if (v && o) {
        const x = cx + lx * o.side - fx * o.dep, z = cz + lz * o.side - fz * o.dep;
        if (Math.abs(x - nb.position.x) > 0.6 || Math.abs(z - nb.position.z) > 0.6) {
          nb.position.x = x; nb.position.z = z; nb.position.y = rt.world.heightAt(x, z); nb.rotation.y = f + Math.PI + Math.sin(i * 1.9) * 0.4;
          nb.userData.foot = { x, z }; nb.updateMatrixWorld?.(true);
        }
        if (P && Math.hypot(x - P.x, z - P.z) < 9) v = false;   // 本人の間近の布は画面いっぱいの板になる（depth_real と同じ）
        // 斬り合いで備の兵が散ると、真ん中が誰もいない所になる：その幟の 7m 内に生きた兵がいなければ下ろす（備の兵でなくても、味方・敵の誰かが横にいれば旗だけには見えない）
        if (v && !nearMan(x, z)) v = false;
      }
      if (nb.visible !== v) { nb.visible = v; nb.userData.orphanHid = false; }
    }
  }
}

// 11/20 K457（kaito「大軍は戦いに来る：後ろで待つだけの塊を無くす。段に合わせて前へ出て斬り合う」・全戦・docs/kaito_army_merge_1120.md）：
//   表の備は realFromLight が stay・hold で立て、共通の engageNear は十八 m 内に敵が来た時しか解かず、後ろの塊は戦の終わりまで立ったままだった。
//   三秒ごとに今の斬り合いの所（本物どうしが四 m 内で打ち合う所）を拾い、その 90m 内（広げた戦は reachK 倍）で待つ表の備を、近い順に三秒に二つまで
//   （波で）斬り合いの所の手前へ歩かせ、着いたら攻めに替える。段が進んで斬り合いの所が動けば、そこの近くの備が次の波になる。
//   表の stayPut（柵の内・付城・出丸）・noAttach の側（縄張りに沿う城方）・行の stayPut・noEngage（本能寺の通りの明智）は今のまま待つ
function fujinAdvance(rt, T) {
  const F = rt.flags, list = F._fj; if (!list || !list.length || T.stayPut || T.noAdvance || (typeof window !== "undefined" && window.__k457off)) return;   // __k457off：前後の比べの写真だけ
  if ((F._fjAdvT || 0) > rt.t) return; F._fjAdvT = (rt.t || 0) + 3;
  if (rt.over || !rt.player?.u) return;
  // 前へ出した備・画面の外から歩かせた備で、歩けの号令のまま行き先が消えた物（ほかの見直しが dest を外した）は、その場で攻めに替える（関ヶ原 116秒：宇喜多の二の備が行き先無しの move で一点に重なり止まった）
  for (const g of list) if (g && (g._fjGo || g._fjHid) && g.order === 'move' && !g.dest && g.count > 0 && !g.routed) {
    if (g._fjGo) { g.order = 'attack'; g.aggro = 18; g.seekRange = 30; g.onArrive = null; g.keepMoveOrder = false; }
    else { g.order = 'hold'; g.onArrive = null; g._fjMoving = false; g.keepMoveOrder = false; }
  }
  const pts = [];
  for (const u of rt.army.units) {
    const o = u.target;
    if (!o || !o.alive || o.gone || !u.alive || u.gone || u.team === o.team || u.civ || o.civ || u.isStruct || o.isStruct || u.fleeing) continue;
    if (Math.abs(u.pos.x - o.pos.x) > 4 || Math.abs(u.pos.z - o.pos.z) > 4) continue;
    if (pts.some((p) => Math.abs(p.x - u.pos.x) < 12 && Math.abs(p.z - u.pos.z) < 12)) continue;
    pts.push({ x: u.pos.x, z: u.pos.z }); if (pts.length >= 24) break;
  }
  if (!pts.length) return;
  const R = 90 * (T.reachK || 1), cand = [];
  for (const g of list) {
    const r = g && g._fjR;
    if (!r || g._fjGo || g.routed || !(g.count > 0) || !g.stay || g.order !== 'hold' || g._fjMoving || r.stayPut || r.noEngage || (T.noAttach && T.noAttach.includes(r.side))) continue;
    if (rt.def?.fujinWakeHold?.(rt, g)) continue;   // 11/20 cloud-41（戸次川の主）：筋書きが「まだ伏せて待つ」塊は寄せない（fujin_wake.js と同じ口）
    const c = g.center(); if (!c) continue;
    let best = null, bd = R;
    for (const p of pts) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd) { bd = d; best = p; } }
    if (best) cand.push([bd, g, best, c]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [d, g, p, c] of cand.slice(0, 2)) {
    g._fjGo = true; g.stay = false; g.fixed = false; g._far = false; g.keepMoveOrder = true; g.focus = null; g.path = null;
    const go = (q) => { q.order = 'attack'; q.aggro = 18; q.seekRange = 30; q.dest = null; q.onArrive = null; q.keepMoveOrder = false; };
    if (d < 14) { go(g); continue; }
    const k = (d - 8) / d;   // 斬り合いの所の八 m 手前（味方の背に重ならず、前の列から当たる）
    g.speed = Math.max(g.speed || 0, 3.8); g.order = 'move'; g.dest = { x: c.x + (p.x - c.x) * k, z: c.z + (p.z - c.z) * k }; g.onArrive = go;
  }
}

// 11/20 K456（kaito 三方ヶ原「新しい大軍と昔の布陣がくっついている」・全戦・docs/kaito_army_merge_1120.md）：
//   表の塊（blk）は武将と別の所に立ち、名のある武将の周りと前は昔の名残の少しの兵だけ、後ろに兵だけの大きな塊がいた。
//   戦の始めに、表の行ごとにその家の名のある武将（同じ側の busho。名の頭二字か旗が合う者、無ければ一番近い同じ側の武将）を決め、
//   行の中心をその武将の備の外側（前→左→右→後ろ→斜め→二重目）に、表の向き（布陣図の向き）で並べ直す。武将の備（昔の名残）とは重ねない。
//   表の stayPut（柵の内・付城）は前へ出さない（周りと後ろだけ）。同じ側の武将が 160m 内に一人もいない行は前のまま。r.fixedPos の行は動かさない。
const SLOTS = [[1, 0], [0, -1], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [2, 0], [0, -2], [0, 2], [-2, 0], [2, -1], [2, 1], [-2, -1], [-2, 1], [1, -2], [1, 2], [-1, -2], [-1, 2]];
function attachRows(rt, T, rows) {
  if (typeof window !== 'undefined' && window.__k456off) return rows;   // 前後の比べの写真だけ（道具が前の並びを撮る印）
  const gens = [], seen = new Set();
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.isPlayer || u.type !== 'busho' || !u.name || u._fjLeader || u._standIn || seen.has(u.name)) continue;
    seen.add(u.name); gens.push(u);
  }
  if (!gens.length) return rows;
  const fam = (r, u) => { const t = (r.name || '') + '|' + (r.row || ''), nm = u.name; if (t.includes(nm) || (nm.length >= 3 && t.includes(nm.slice(0, 2)))) return 1; const fl = u.look && u.look.flag; return fl && r.flag && fl === r.flag ? 1 : 0; };
  // 塊を一人に寄せず同じ側の武将に散らす（近さ＋既に付いた行の数×70m。三方ヶ原で信玄と勝頼だけに付き、先鋒の小山田の前が空いた）
  const per = new Map(), out = [];
  for (const r of rows) {
    if (r.fixedPos || !r.blocks || r.blocks.some((b) => b.lead) || (r.leaders && r.leaders.length)) { out.push(r); continue; }
    // 11/20 クラウドせ（稲葉山：山の東西の斜面・尾根に道から離して置いた斎藤の塊九つ 315人が、160m 内の斎藤龍興（山頂）の横へ全部寄せられ、西の斜面が空き本丸の崖の上で重なり止まった）：
    //   表の noAttach に挙げた側（城方など、縄張りに沿って置いた側）は付け直さず表の持ち場のまま
    if (T.noAttach && T.noAttach.includes(r.side)) { out.push(r); continue; }   // 将の名を持つ行は自分が備（天王寺の表）
    let best = null, bd = 1e9;
    for (const u of gens) {
      if (u.team !== r.side || Math.hypot(u.pos.x - r.x, u.pos.z - r.z) > 160 * (T.reachK || 1)) continue;   // K458：広げた戦は同じ倍率で   // 遠い武将（天王寺の本願寺の侍大将は 1100m 先）には付けない（塊が戦場の外へ飛び、立たずに兵が減った）
      const d = Math.hypot(u.pos.x - r.x, u.pos.z - r.z) + 70 * ((per.get(u) || { k: 0 }).k) - 90 * fam(r, u);   // 同じ家を先に（名・旗が合えば 90m 近い扱い）
      if (d < bd) { best = u; bd = d; }
    }
    if (!best) { out.push(r); continue; }
    const f = r.facing || 0, fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f);
    // 武将の備（昔の名残）の広がりを表の向きで測る（重ねないため。35m で頭打ち）
    let e = per.get(best);
    if (!e) {
      let f0 = -6, f1 = 6, l0 = -6, l1 = 6; const g0 = best.group;
      for (const v of (g0 && g0.units) || []) { if (!v.alive || v.gone) continue; const dx = v.pos.x - best.pos.x, dz = v.pos.z - best.pos.z, a = dx * fx + dz * fz, b = dx * lx + dz * lz; if (Math.abs(a) > 35 || Math.abs(b) > 35) continue; f0 = Math.min(f0, a); f1 = Math.max(f1, a); l0 = Math.min(l0, b); l1 = Math.max(l1, b); }
      e = { k: 0, f0, f1, l0, l1 }; per.set(best, e);
    }
    let sl;
    do { sl = SLOTS[e.k % SLOTS.length]; e.k++; } while (T.stayPut && sl[0] > 0 && e.k < SLOTS.length * 2);
    const ring = e.k > SLOTS.length ? 1 : 0, W = Math.max(26, r.w || 39) + 6, D = 20;
    const sf = sl[0] > 0 ? e.f1 + 12 + (sl[0] - 1 + ring) * D : sl[0] < 0 ? e.f0 - 12 + (sl[0] + 1 - ring) * D : 0;
    const sL = sl[1] > 0 ? e.l1 + W / 2 + 4 + (sl[1] - 1 + ring) * W : sl[1] < 0 ? e.l0 - W / 2 - 4 + (sl[1] + 1 - ring) * W : 0;
    const q = { ...r, _gu: best, _sf: sf, _sl: sL, moves: null };
    const p = slotRow(q); q.x = p.x; q.z = p.z; out.push(q);
  }
  return out;
}
// 武将に付けた行（とその中の塊 _off）の今の置き場：武将の今の所から、表の向きで前 _sf・横 _sl（＋塊のずれ _off）
function slotRow(r) {
  const u = r._gu; if (!u || !u.alive || u.gone) return r;
  const f = r.facing || 0, L = (r._sl || 0) + (r._off || 0);
  return { ...r, x: u.pos.x + Math.sin(f) * (r._sf || 0) + Math.cos(f) * L, z: u.pos.z + Math.cos(f) * (r._sf || 0) - Math.sin(f) * L };
}

function releaseFar(rt, K = 1) {   // K：戦場を広げた倍率（K458）
  const me = rt.player.u.pos, list = rt.flags._fj, pend = rt.flags._fjPend || (rt.flags._fjPend = []);
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i], r = g && g._fjR; if (!r || g.routed || g.order !== 'hold') continue;
    const us = (g.units || []).filter((u) => u.alive && !u.gone); if (!us.length) { list.splice(i, 1); continue; }
    let cx = 0, cz = 0, busy = false;
    for (const u of us) { cx += u.pos.x; cz += u.pos.z; if (u.target || u.atk || u.hp < (u.maxHp || u.hp)) busy = true; }
    cx /= us.length; cz /= us.length;
    if (busy || Math.hypot(cx - r.x, cz - r.z) > 18 || Math.hypot(cx - me.x, cz - me.z) < 175 * K) continue;
    for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* 外せなければそのまま */ } }
    if (rt._farNames && r.name) rt._farNames.delete(r.name);
    list.splice(i, 1); pend.push(r);
  }
}

// 塊の厚みと旗の林（表の行の ranks・nobori）。幟は塊の後ろに二重（前は五本・後ろは四本。携帯は前の三本だけ）。
//   布は向きに直角（寄せる側から布の面が見える）。天王寺では豊臣方が根元に寄れば倒れる（hata_taore.js の一覧へ入れる）
export function blockLook(rt, g, r) {   // depth_real.js も使う（11/17 n-atsumi K358：全戦の備を天王寺と同じ太い塊と幟の林に）
  // 11/14 MB一 K297（関ヶ原の見開き＝備は幅より奥行きのある厚い塊）：塊の段は表の ranks か、人数からほぼ四角になる段数の大きい方。間隔も詰める（1.5→1.15）
  const n0u = (g.units || []).length || g.initial || 30;
  g.yariRanks = isTouch ? Math.min(3, r.ranks || 3) : Math.max(r.ranks || 4, Math.ceil(Math.sqrt(n0u / 1.6)));
  g.spacing = isTouch ? 1.35 : 1.15;
  // 11/14 クラウドわ（K287①司令塔「真上から見て陣が点の格子。幅より奥行きのある厚い塊に」）：表が deep の戦は、段を人数の√1.4 倍（45人で八段×六列）にして
  //   幅より奥行きを深くし、間隔を肩の触れる 0.92m に詰める（人数は同じ＝重さは変わらない）。携帯は四段・1.1m
  const T = fujinFor(rt);
  if ((T && T.deep) || r.deep) { g.yariRanks = isTouch ? Math.max(4, g.yariRanks) : Math.max(g.yariRanks, Math.ceil(Math.sqrt(n0u * 1.4))); g.spacing = isTouch ? 1.0 : 0.92; }   // 11/16 携帯は 1.1→1.0（肩が触れる詰め方で塊を濃く）
  // 11/19 クラウド k365-cloud-37：携帯の depth_real の備（兵 5〜9人）は四段だと横二人の細い縦列に見えた。ほぼ四角に（9人で三段×三列・6人で二段×三列）。人数は同じ
  if (isTouch && r.dr) g.yariRanks = Math.max(2, Math.round(Math.sqrt(n0u)));
  if (!(r.nobori || (T && T.noboriAll)) || r._nob) return;   // noboriAll：表の全部の行に幟の林（11/17 関ヶ原・遠い備を幟の林で厚く）
  r._nob = true;   // 片付けて立て直した時に幟を二重に立てない
  (rt.flags._nbG || (rt.flags._nbG = new Set())).add(g);   // K470：組が尽きて army.groups から外れても幟を下ろせるよう覚えておく
  g._nbFace = r.facing || 0;   // K470：幟が付いて行く時の並びの向き（blockFlagsTick）
  const f = r.facing || 0, fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f), hs = rt.flags._hata;
  // 11/18 クラウド k365-cloud-37（K365）：r.nbN＝大きな備（depth_real の史料 1000 以上）は携帯も前五・後ろ三本（束で描くので描く回数は増えない）
  let n0 = isTouch ? (T && T.nbTouch ? T.nbTouch[0] : r.nbN ? 5 : 3) : 10, n1 = isTouch ? (T && T.nbTouch ? T.nbTouch[1] : r.nbN ? 3 : 2) : 8;
  // 11/19 クラウド k365-cloud-37（遠景の大軍の見た目）：depth_real の備（r.dr）は、携帯で兵が 5〜9人なのに幟が最大 8本立ち、兵より旗が多い板の並びに見えた。
  //   携帯は前の列を兵の半分・後ろの列を三割まで（兵 6人なら 3＋1 本）。パソコンと布陣の表の行はそのまま
  if (isTouch && r.dr) { const nu = n0u; n0 = Math.min(n0, Math.max(2, Math.ceil(nu * 0.5))); n1 = Math.min(n1, Math.max(1, Math.floor(nu * 0.3))); }   // nbTouch：表ごとの携帯の本数（束で描くので描く回数は増えない）   // 11/16 携帯も後ろに二本（塊の上に旗の林。兵は増やさない）   // 11/14 MB一 K297：見開きは塊の上に旗が林（5→8・4→6）
  for (let j = 0; j < n0 + n1; j++) {
    const back = j >= n0, m = back ? n1 : n0, jj = back ? j - n0 : j;
    const side = ((jj + 0.5) / m - 0.5) * (back ? 9 : 11) + Math.sin(j * 3.1 + r.z) * 1.1, dep = (back ? 8.2 : 5.6) + Math.sin(j * 2.7 + r.x) * 1.2;   // 11/17 クラウド kaito2：同じ間・同じ向きの並びが遠目に白い板の格子に見えた（上田の220秒・n-allgate の検品）。横と奥に揺らぎ
    const x = r.x + lx * side - fx * dep, z = r.z + lz * side - fz * dep;
    try {
      const nb = nobori(rt.world, x, z, r.flag, back ? 6.2 : 5.2);
      nb.userData.foot = { x, z };
      nb.userData.fjOff = { side, dep };   // K470：備の兵の今の所から、この並び（横・後ろ）で付いて行く（blockFlagsTick）
      nb.rotation.y = f + Math.PI + Math.sin(j * 1.9 + r.x) * 0.4;
      rt.scene.add(nb);
      (g._nobs || (g._nobs = [])).push(nb);   // 備が動けば depth_real.js が幟も同じだけ動かす
      if (hs && hs.line && r.side !== 1) hs.line.push(nb);   // 11/14 クラウドか：豊臣方（敵）の幟は自分の兵で倒れないよう、倒れる一覧へ入れない
    } catch (e) { /* 幟が作れない時は省く */ }
  }
}

// 11/14 クラウドせ（K287②「真上から見ると兵は細かい点で、陣の塊・旗が見えない」）：真上（本人より 40m 以上高い視点）の時だけ、
//   備の兵が今いる所に、その備の広さの色の塊（味方は藍・敵は赤）と家の旗の紋を地に重ねる（布陣図の札の見え方）。
//   遊ぶ時の肩越しの視点では透明（描かない）。塊の広さと所は 1 秒ごとに兵の今の散らばりから取り直す（動く備にも付いていく）。携帯は作らない
const PLATE_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const PLATE_MON = new Map();
// 旗の紋の絵（布の汚しは要らない。縁は味方の藍・敵の赤）。家ごとに一枚
function plateMon(kind, foe) {
  const key = kind + (foe ? '|e' : '|a'); if (PLATE_MON.has(key)) return PLATE_MON.get(key);
  let t = null;
  try {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    drawMon(g, kind, 64, 128, false, false);
    g.strokeStyle = foe ? '#c23a2c' : '#2f58b0'; g.lineWidth = 10; g.strokeRect(5, 5, 54, 118);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  } catch (e) { t = null; }
  PLATE_MON.set(key, t); return t;
}
function overheadPlate(rt, g, r) {
  const foe = r.side === 1, mk = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0, ...o });
  const fill = new THREE.Mesh(PLATE_GEO, mk({ color: foe ? 0xc23a2c : 0x2f58b0 }));
  const tex = plateMon(r.flag, foe);
  const mon = tex ? new THREE.Mesh(PLATE_GEO, mk({ map: tex })) : null;
  fill.renderOrder = 30; if (mon) mon.renderOrder = 31;
  fill.frustumCulled = false; if (mon) mon.frustumCulled = false;
  const f = r.facing || 0, ca = Math.cos(f), sa = Math.sin(f);
  let next = -1, alive = 0;
  const fit = () => {
    let sx = 0, sz = 0, n = 0;
    for (const u of g.units) if (u.alive && !u.gone) { sx += u.pos.x; sz += u.pos.z; n++; }
    alive = n; if (!n) return;
    const cx = sx / n, cz = sz / n; let hw = 2, hd = 2;
    for (const u of g.units) if (u.alive && !u.gone) { const dx = u.pos.x - cx, dz = u.pos.z - cz; hw = Math.max(hw, Math.abs(dx * ca - dz * sa)); hd = Math.max(hd, Math.abs(dx * sa + dz * ca)); }
    hw = Math.min(24, hw + 1.5); hd = Math.min(16, hd + 1.5);
    const y = (rt.world?.heightAt?.(cx, cz) ?? 0) + 0.5;
    fill.position.set(cx, y, cz); fill.rotation.y = f; fill.scale.set(hw * 2, 1, hd * 2);
    if (mon) { const m = Math.max(10, Math.min(hw * 2, hd * 2.4)); mon.position.set(cx, y + 0.05, cz); mon.scale.set(m * 0.5, 1, m); }
  };
  fill.onBeforeRender = (ren, sc, cam) => {
    const me = rt.player?.u?.pos, k = me ? Math.max(0, Math.min(1, (cam.position.y - me.y - 40) / 40)) : 0;
    if (k > 0 && (rt.t ?? 0) >= next) { next = (rt.t ?? 0) + 1; fit(); }
    const a = alive ? k : 0; fill.material.opacity = a * 0.04;   // 11/14 クラウドと（K287①司令塔）：塗りの四角を薄く（0.42→0.16）。兵の厚みを隠さない
    if (mon) mon.material.opacity = a * 0.95;
  };
  rt.scene.add(fill); if (mon) rt.scene.add(mon);
}
