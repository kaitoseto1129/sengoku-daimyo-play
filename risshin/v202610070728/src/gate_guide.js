// gate_guide.js … 敵の門を打ち破る手がかり（どの戦でも同じ。kaito 10/2「門の壊し方が分かりづらい」）
//   ・門に寄ると、門の上に「打て」の印と、任務の札に「門を打て（操作）」が出る
//   ・門の前では「打つ」（キー E）の長押しで掛矢を振るう（戦の定義が自分で打つ手を用意していればそちらを使う）
//   ・打つたびに残りを棒で知らせる（▮▮▮▯▯）。門の傷みは army_fx.js の structWear が板・閂で見せる
//   ・破れた時は、戦の定義が知らせを出さなければ、ここで大きく知らせる
// 日本地図の城攻め（def.mapCastle）は自分で段取りを持つので、印・任務・打つ手は足さない（傷みと破れの知らせだけ）
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { sfx } from './audio.js';

const GATE_RE = /門|木戸/;
const NEAR = 20;      // 印と任務を出す遠さ
const FAR = 34;       // 離れたら引っ込める遠さ
const RAM_R = 3.6;    // 打てる遠さ

const midOf = (st) => (st.seg ? { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 } : { x: st.x, z: st.z });
const bar = (k) => { const n = Math.max(0, Math.min(5, Math.ceil(k * 5))); return '▮'.repeat(n) + '▯'.repeat(5 - n); };
const how = () => (isTouch ? '門の前で「打つ」を長押し' : `門の前で ${K('use')} を長押し`);

export function gateGuideTick(rt, dt) {
  const P = rt.player && rt.player.u;
  if (!P || !rt.army || !rt.army.structs) return;
  const S = rt._gg || (rt._gg = { scanT: 0, list: [], cur: null, seen: new Map(), objOn: false, tipped: false });
  // 敵の門の一覧（1 秒ごとに作り直す）
  if ((S.scanT -= dt) <= 0) {
    S.scanT = 1;
    // 門の作り（castle_parts の kido・冠木門など）は gate を持つ。名に「木戸」を含む曲輪の塀（「木戸内の郭」）は門ではない
    //   （見回り 10/2：越前で、木戸を破って中へ入った後も、郭の塀を「打て」と言い続けた）
    const notGate = (st) => st.gate == null && (/郭|曲輪/.test(st.name || '') || (st.seg && Math.hypot(st.seg[2] - st.seg[0], st.seg[3] - st.seg[1]) > 9));
    S.list = rt.army.structs.filter((st) => st.alive && st.team !== P.team && GATE_RE.test(st.name || '') && !notGate(st) && (st.maxHp || 0) <= 1e8 && !st.noTarget && !st.opened);
  }
  // 破れた門：戦の定義が大きな知らせを出していなければ、ここで出す
  for (const [st, hp0] of S.seen) {
    if (st.alive) continue;
    S.seen.delete(st);
    if (st.openGentle) continue;
    { const m = midOf(st); if (Math.hypot(m.x - P.pos.x, m.z - P.pos.z) > 60) continue; }   // 遠くの門は知らせない
    const t0 = rt.t;
    rt.after(0.5, () => {
      if (rt.over || (rt._bannerT ?? -99) >= t0) return;
      rt.banner(`${st.name}、破れる`, '門が開いた。中へ攻め込め');
      sfx('taiko', 0.8);
    });
    void hp0;
  }
  // 一番近い門
  let best = null, bd = Infinity;
  for (const st of S.list) {
    if (!st.alive) continue;
    const m = midOf(st), d = Math.hypot(m.x - P.pos.x, m.z - P.pos.z);
    if (d < bd) { bd = d; best = st; }
    if (!S.seen.has(st)) S.seen.set(st, st.hp);
  }
  const own = !!(rt.def && rt.def.mapCastle);
  // 棒の数が変わった時だけ知らせる。同じ残りを打つたびに再掲しない。
  if (best && S.cur === best && best.hp < (S.lastHp ?? best.hp) - 0.5 && bd < 14) {
    const remain = bar(best.hp / best.maxHp);
    if (remain !== S.lastBar && (S.barT ?? -99) + 2 < rt.t) {
      S.barT = rt.t; S.lastBar = remain; rt.hud.flash(`${best.name}　${remain}`, 'gold');
    }
  }
  S.lastHp = best ? best.hp : null;
  // 近づいた：印・任務・打つ手
  if (best && bd < NEAR && !own) {
    if (S.cur !== best) {
      clear(rt, S);
      S.cur = best;
      S.lastHp = best.hp;
      S.lastBar = bar(best.hp / best.maxHp);
      const m = midOf(best), y = rt.world.heightAt(m.x, m.z);
      const nm = best.name;
      // 戦の定義が自分で門を打つ手（任務・印・打つ手）を持っていれば、ここでは足さない
      const hasOwn = rt.interacts.some((it) => /打つ/.test(it.label || '') && GATE_RE.test(it.label || ''));
      if (!hasOwn) {
        rt.marker('_gate', { x: m.x, z: m.z, y }, () => `${nm}を打て　${bar(best.hp / best.maxHp)}`, { h: 4.2 });
        // 携帯の一行に収まる短さ（組に打たせる号令は、ヒントの札で一度だけ言う）
        rt.obj('_gate', isTouch ? `${nm}を打て（「打つ」長押し）` : `${nm}を打て（${K('use')} 長押し）`, 'order');
        S.objOn = true;
        // 門の外の正面（外向き nx・nz が無い門は、自分のいる側）に、掛矢で打つ手を置く
        let nx = best.nx ?? (P.pos.x - m.x) / (bd || 1), nz = best.nz ?? (P.pos.z - m.z) / (bd || 1);
        // 門の向きの決まりが戦ごとに違う事があるので、寄って来た自分の側を「外」とする
        if ((P.pos.x - m.x) * nx + (P.pos.z - m.z) * nz < 0) { nx = -nx; nz = -nz; }
        rt.addInteract('_gram', { x: m.x + nx * 1.3, z: m.z + nz * 1.3 }, `掛矢で${nm}を打つ`, () => {
          if (!best.alive) return;
          rt.army.damage(best, 42, P);
          rt.army.play('knock', m, 1.2);
          rt.army.burst(m.x, y + 1.3, m.z, 6, 'wood', nx * 0.6, nz * 0.6);
          rt.game.hitstop = Math.max(rt.game.hitstop || 0, 0.06);
          if (rt.player.addShake) rt.player.addShake(0.08);
        }, { r: RAM_R, hold: rt.def?.gateRamHold ?? 0.7 });
      }
      if (!S.tipped) { S.tipped = true; rt.hud.hint(`${nm}は槍では傷まない。${how()}すると掛矢で打てる`, isTouch ? '「号令」から「突撃」で組も門を打つ' : `号令「突撃」（${K('attack')}）で組も門を打つ`, 7000); }
    }
  } else if (S.cur && (!best || bd > FAR || !S.cur.alive || own)) clear(rt, S);
  if (S.cur && (!S.cur.alive || S.cur.opened)) clear(rt, S);
}

function clear(rt, S) {
  if (S.cur) { rt.unmark('_gate'); rt.uninteract('_gram'); }
  if (S.objOn) { rt.objRemove('_gate'); S.objOn = false; }
  S.cur = null;
}
