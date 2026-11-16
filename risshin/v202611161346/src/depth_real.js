// 陣立ての表（army_depth.js の def.depth）の備に本物の兵を立てる共通の手（11/16 iMac n-atsumi・台帳 K341⑤ 厚み・K324・K338・K297）。battle.js が fujinTick の隣で毎コマ呼ぶ。
//   K285（noFake）で陣立ての軽い兵は空の入れ物になり、備は幟と名札だけで兵が一人もいなかった（設楽原・関ヶ原・長篠城・稲葉山・金ヶ崎・箕作・伏見・岐阜…）。
//   布陣の表（fujin_place.js）と同じ数の決まりで、本人の近くに来た備から一つずつ本物の備を置く（パソコン 史料の 12%・8〜36 人／携帯 2%・5〜9 人）。
//   本物の兵の上限（def.realCap・既定 250）より 40 人手前（def.depthRealRoom）で止める＝前を埋める新手（frontFill）と筋書きの寄せの枠を食わない（設楽原で先に越えて 30〜60m の敵が 56→35 に減った）。携帯は本人から遠く離れた待つだけの備を片付けて、近づけばまた立てる。
//   備が考え（depthTick）で動けば持ち場を付いて動かす。援軍（来る前 AWAY）・崩れた備・荷駄・本物の隊に結んだ備（bind）・川の中には立てない。
//   止める：戦の定義に depthReal: false（その戦が自分で本物を並べる時）。備ごとに o.real: false。
import { realFromLight } from './depth_reserve.js';
import { ST } from './army_depth.js';
import { noFakeOn } from './world_army_scene.js';
import { isTouch } from './touch.js';

export function depthRealTick(rt, enemyGroup, allyGroup) {
  const V = rt.flags.depth;
  if (!V || !rt.def || rt.def.depthReal === false || !noFakeOn(rt.def)) return;
  if (typeof location !== 'undefined' && location.search.includes('nodreal')) return;   // 前後の比べ用（遊ぶ人の画面では使わない）
  if (!rt._tpl || !rt._tpl.E || !rt._tpl.A) return;   // 兵の装束が覚えられてから
  const me = rt.player?.u; if (!me?.alive) return;
  const S = rt.flags._dReal || (rt.flags._dReal = { t: 0, m: new Map() });
  if ((rt.t || 0) < S.t) return;
  S.t = (rt.t || 0) + 1;
  const cap = (rt.def.realCap ?? 250) - (rt.def.depthRealRoom ?? 40), R = isTouch ? 140 : 190, P = me.pos, W = rt.world;
  let live = 0; for (const u of rt.army.units) if (u.alive && !u.gone) live++;
  for (const D of [V.A, V.B]) {
    if (!D) continue;
    for (const s of D.sonae) {
      if (!s.o || s.o.show === false || s.o.bind || s.o.real === false || s.layer === 'konida') continue;
      const g = S.m.get(s);
      if (g) { keep(rt, S, s, g, P); continue; }
      if (s.state === ST.AWAY || s.state === ST.ROUTING || s.gone || s.men <= 0) continue;
      if (Math.hypot(s.x - P.x, s.z - P.z) > R || W.waterDepthAt?.(s.x, s.z) > 0.25) continue;
      const team = D.team === 1 ? 1 : 0;
      // 味方の備はさらに40人手前で止める（金ヶ崎で味方の備が枠を取り、90秒の30〜60mの敵が 39→30 に減った。敵の厚みを先に）
      if (live >= cap - (team === 1 ? 0 : 40)) continue;
      const name = s.taisho ? s.taisho + 'の備' : (s.o.name || '遠くの備');
      try {
        const n = realFromLight(rt, { x: s.x, z: s.z, w: Math.max(10, Math.min(30, Math.sqrt(s.men) * 1.2)), count: s.men, facing: D.facing, team,
          look: { flag: s.flag, armor: s.armor }, min: isTouch ? 5 : 8 }, enemyGroup, allyGroup, isTouch ? 0.02 : 0.12, isTouch ? 9 : 36, name, null);
        if (!n) { S.m.set(s, null); continue; }
        n._depthSonae = s; n._fjN = name;
        S.m.set(s, n); live += n.count || 0;
      } catch (e) { S.m.set(s, null); if (typeof window !== 'undefined') window.__depthRealErr = String(e && e.stack || e).slice(0, 300); }
    }
  }
}

// 立てた備：考えの側の持ち場へ付いて動く。携帯は遠く離れた待つだけの備を片付ける
function keep(rt, S, s, g, P) {
  if (g.routed || g.order === 'flee') return;
  const us = (g.units || []).filter((u) => u.alive && !u.gone);
  if (!us.length) return;
  if (s.state !== ST.ROUTING && g.anchor && Math.hypot(s.x - g.anchor.x, s.z - g.anchor.z) > 6 && !(rt.world.waterDepthAt?.(s.x, s.z) > 0.25)) {
    g.anchor.x = s.x; g.anchor.z = s.z;
  }
  if (!isTouch || g.order !== 'hold') return;
  let cx = 0, cz = 0, busy = false;
  for (const u of us) { cx += u.pos.x; cz += u.pos.z; if (u.target || u.atk || u.hp < (u.maxHp || u.hp)) busy = true; }
  cx /= us.length; cz /= us.length;
  if (busy || Math.hypot(cx - P.x, cz - P.z) < 175) return;
  for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* 外せなければそのまま */ } }
  if (rt._farNames && g._fjN) rt._farNames.delete(g._fjN);
  S.m.delete(s);
}
