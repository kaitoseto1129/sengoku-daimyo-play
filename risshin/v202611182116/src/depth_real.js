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
import { blockLook } from './fujin_place.js';

export function depthRealTick(rt, enemyGroup, allyGroup) {
  const V = rt.flags.depth, E = rt.world?.emptyArmies;
  // noFake は戦の定義か世界の定義（戸次川は世界の側だけ）のどちらかに付く
  if ((!V && !E) || !rt.def || (typeof rt.def.depthReal === 'function' ? rt.def.depthReal(rt) === false : rt.def.depthReal === false) || !(noFakeOn(rt.def) || noFakeOn(rt.world?.def))) return;
  if (typeof location !== 'undefined' && location.search.includes('nodreal')) return;   // 前後の比べ用（遊ぶ人の画面では使わない）
  if (!rt._tpl || !rt._tpl.E || !rt._tpl.A) return;   // 兵の装束が覚えられてから
  const me = rt.player?.u; if (!me?.alive) return;
  const S = rt.flags._dReal || (rt.flags._dReal = { t: 0, m: new Map() });
  if ((rt.t || 0) < S.t) return;
  S.t = (rt.t || 0) + 1;
  const cap = (rt.def.realCap ?? 250) - (rt.def.depthRealRoom ?? 40), R = isTouch ? 140 : 190, P = me.pos, W = rt.world;
  let live = 0; for (const u of rt.army.units) if (u.alive && !u.gone) live++;
  // 11/18 クラウド k365-cloud-37（K374 始めの止まり）：一秒ごとの見回りで、近づいた備を一コマに幾つも作っていた（始めに五つ六つが一度に立ち、兵の形作りで一コマ止まる）。
  //   一度に作る備は携帯一つ・パソコン二つまで。残りは次の秒に回す（立つ数と場所は同じ）
  let made = 0; const budget = isTouch ? 1 : 2;
  const place = (key, x, z, men, facing, team, flag, armor, name) => {
    if (made >= budget) return false;
    // 11/18 クラウド（山中城）：動ける所（moveLim）の外の陣（出陣の段の麓の陣 z=280）に立てると、兵が端へ一息で引き戻された（bot「戦場の外」「6m 飛んだ」55回）。外の陣には立てない
    // K365 樫井：戦場の端から三十歩の内にも立てない（二つの枝を合わせ、狭い方の三十歩に）
    const lim = (rt.world?.def?.moveLim || rt.def.moveLim || 176) - 30;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return true;
    // 細い道・切岸・曲輪の口には立てない（11/17 小谷：立てた備が山道と北木戸の口に立ち、小丸へ攻め入る筋を塞いで時間切れ。depth_real を切ると達成）。
    //   真ん中から 8m の周り八方がどれも歩けて、高さの差が 3m 内の平らな所だけ（だめなら次の秒にまた見る）
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, qx = x + Math.cos(a) * 8, qz = z + Math.sin(a) * 8;
      if (W.walkable?.(qx, qz) === false || Math.abs((W.heightAt?.(qx, qz) ?? 0) - (W.heightAt?.(x, z) ?? 0)) > 3) return true;
    }
    // 味方の備はさらに40人手前で止める（金ヶ崎で味方の備が枠を取り、90秒の30〜60mの敵が 39→30 に減った。敵の厚みを先に）
    if (live >= cap - (team === 1 ? 0 : 40)) return false;
    try {
      const n = realFromLight(rt, { x, z, w: Math.max(10, Math.min(30, Math.sqrt(men) * 1.2)), count: men, facing, team,
        look: { flag, armor }, min: isTouch ? 5 : 8 }, enemyGroup, allyGroup, isTouch ? 0.02 : 0.12, isTouch ? 9 : 36, name, null);
      if (!n) { S.m.set(key, null); return true; }
      n._fjN = name; S.m.set(key, n); live += n.count || 0; made++;
      if (team === 1 && rt.def.depthRealDmgMult != null) n.dmgMult = rt.def.depthRealDmgMult;   // 11/17 K358 iMac n-kiba：戦ごとに本物にした遠くの敵の備の打ち込みを、共通の待つ備（新手 0.45〜0.5）と揃えられる
      // 11/17 n-atsumi（台帳 K358・物差し3「太い塊と幟の林・大軍対大軍」）：天王寺・岡山の布陣の表の備と同じ見た目＝段の深い密な塊と、塊の後ろに家の幟の林。
      //   幟は大きな備（史料の兵 300 以上）だけ（幟の数で重くしない）。兵の数は変えない
      // 11/18 クラウド k365-cloud-37（K365「まばらな列・白い旗の板の格子を無くし、太い塊と幟の林に」）：deep＝肩の触れる奥へ深い塊（人数は同じ）。
      //   幟は史料の兵 150 以上の備に（300→150）。旗の無い備は軍の旗（呼び手が D.flag を渡す）。それでも家が分からない備は幟を立てない（白い板にしない）
      try { blockLook(rt, n, { x, z, facing, flag: flag || (team === 1 ? 'enemy' : 'oda'), ranks: 4, deep: true, nbN: men >= 1000 ? 1 : 0, nobori: men >= 150 && !!flag && !(typeof location !== 'undefined' && location.search.includes('nonob')), side: team }); } catch (e) { /* 見た目だけ。作れなければ省く */ }
    } catch (e) { S.m.set(key, null); if (typeof window !== 'undefined') window.__depthRealErr = String(e && e.stack || e).slice(0, 300); }
    return true;
  };
  if (V) for (const D of [V.A, V.B]) {
    if (!D) continue;
    for (const s of D.sonae) {
      if (!s.o || s.o.show === false || s.o.bind || s.o.real === false || s.layer === 'konida') continue;
      const g = S.m.get(s);
      if (g) { keep(rt, S, s, g, P, s.x, s.z, s.state === ST.ROUTING); continue; }
      if (S.m.has(s) || s.state === ST.AWAY || s.state === ST.ROUTING || s.gone || s.men <= 0) continue;
      if (Math.hypot(s.x - P.x, s.z - P.z) > R || W.waterDepthAt?.(s.x, s.z) > 0.25) continue;
      const team = D.team === 1 ? 1 : 0;
      if (!place(s, s.x, s.z, s.men, D.facing, team, s.flag || D.flag, s.armor || D.armor, s.taisho ? s.taisho + 'の備' : (s.o.name || '遠くの備'))) continue;
    }
  }
  // 11/16 iMac n-atsumi（K341⑤ 全戦へ）：陣立ての表の無い戦も、絵だけの禁止（noFake）で空になった軽い大軍（world_army_scene.js emptyDistantArmy）に、
  //   本人が近づいたら同じ数の決まりで本物の備を立てる。布陣の表の戦（fujin_place が並べる）・def.emptyReal:false の戦は除く。
  //   除く入れ物：40人未満・人を名指しした物（本陣・使番 people）・本陣・隠した物（visible=false の伏兵）・崩れた物・台本が本物に替え始めた物（take で減った）・
  //   自分で本物を出す備（fieldButai の realMax・本物がいる備）・敵味方の分からない物
  const why = {};   // 確かめ用（thickness.mjs の dbg.dreal）：入れ物を除いた訳の数
  if (typeof window !== 'undefined') window.__dRealDbg = { n: E ? E.length : 0, fj: !!rt.flags._fj, why };
  if (E && rt.def.emptyReal !== false && !rt.def.fujinOwn && !(rt.flags._fj)) for (const e of E) {
    const { g, A, o } = e;
    const x = (A.cx || 0) + (A.off?.x || 0), z = (A.cz || 0) + (A.off?.z || 0);
    const r = S.m.get(e);
    if (r) { keep(rt, S, e, r, P, x, z, !!A.rout); continue; }
    const skip = (k) => { why[k] = (why[k] || 0) + 1; return true; };
    if (S.m.has(e) && skip('done') || A.rout && skip('rout') || g.visible === false && skip('hide') || (o.people || o.kind === 'honjin') && skip('people') || (o.count || 0) < 40 && skip('small')) continue;
    const team = o.team ?? A.team; if (team !== 0 && team !== 1) { skip('team'); continue; }
    const B = A.butaiRef; if (B && (B.realMax > 0 || (B.real && B.real.count > 0))) { skip('butai'); continue; }
    if (typeof g.left === 'function' && g.left() < e.n0) { skip('taken'); continue; }
    if (Math.hypot(x - P.x, z - P.z) > R) { skip('far'); continue; }
    if (W.waterDepthAt?.(x, z) > 0.25) { skip('wet'); continue; }
    const nm = o.name || (o.general && o.general.name ? o.general.name + 'の備' : '遠くの備');
    if (!place(e, x, z, o.count, A.facing ?? o.facing ?? 0, team, o.flag || o.mon || o.flagTex?.userData?.mon, o.armor, nm)) continue;
  }
  // 11/18 クラウド 賤ヶ岳の持ち主：立てた備は戦の update の後にここで数が変わる（遠くの間引きで初めの数が下がり、後で戻った兵で「丹羽長秀の備 11/9 初めより多い」）。初めの数を今の数より下げない
  for (const g of S.m.values()) if (g && g.initial && g.initial < g.count) g.initial = g.count;
}

// 立てた備：考えの側の持ち場へ付いて動く。携帯は遠く離れた待つだけの備を片付ける
function keep(rt, S, s, g, P, sx, sz, routing) {
  // 本人（とすぐ後ろのカメラ）から 9m 内の幟は隠す：間近の布が画面いっぱいの黒い板に見えた（11/17 稲葉山の四方の写真）
  if (g._nobs) for (const nb of g._nobs) { const v = Math.hypot(nb.position.x - P.x, nb.position.z - P.z) > 9; if (nb.visible !== v) nb.visible = v; }
  // 11/18 クラウドせ（金ヶ崎 act bot・probe：東の平地の『遠くの備』が kgEastRoad の道行き path のまま (86,-15) で百秒立ち尽くした）：
  //   戦の台本が道（path・move）を渡した備の持ち場を、考えの側の位置へ引き戻さない（六m 歩くたびに元へ戻され、兵が一歩も進まなかった）
  // 11/18 夜50-03：g.depthFree＝戦の台本が持ち場を受け取った備（金ヶ崎の先鋒を峠から下ろした後の hold も引き戻さない）
  if (g.routed || g.order === 'flee' || g.order === 'path' || g.order === 'move' || g.depthFree) return;
  const us = (g.units || []).filter((u) => u.alive && !u.gone);
  if (!us.length) return;
  // 11/17 クラウド kaito2（K365 樫井）：備が北へ下がると、付いて動く本物の兵が戦場の端（moveLim）の外へ出て端へ一息で飛んでいた。持ち場は端の三十歩内（塊の後ろの列の分）に収める
  { const lim = (rt.world.def?.moveLim || 176) - 30; sx = Math.max(-lim, Math.min(lim, sx)); sz = Math.max(-lim, Math.min(lim, sz)); }
  if (!routing && g.anchor && Math.hypot(sx - g.anchor.x, sz - g.anchor.z) > 6 && !(rt.world.waterDepthAt?.(sx, sz) > 0.25)) {
    const dx = sx - g.anchor.x, dz = sz - g.anchor.z;
    g.anchor.x = sx; g.anchor.z = sz;
    // 塊の後ろの幟も同じだけ動かす（K358）
    if (g._nobs) for (const nb of g._nobs) { nb.position.x += dx; nb.position.z += dz; nb.position.y = rt.world.heightAt(nb.position.x, nb.position.z); if (nb.userData.foot) { nb.userData.foot.x += dx; nb.userData.foot.z += dz; } }
  }
  if (!isTouch || g.order !== 'hold') return;
  let cx = 0, cz = 0, busy = false;
  for (const u of us) { cx += u.pos.x; cz += u.pos.z; if (u.target || u.atk || u.hp < (u.maxHp || u.hp)) busy = true; }
  cx /= us.length; cz /= us.length;
  if (busy || Math.hypot(cx - P.x, cz - P.z) < 175) return;
  for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* 外せなければそのまま */ } }
  if (rt._farNames && g._fjN) rt._farNames.delete(g._fjN);
  if (g._nobs) { for (const nb of g._nobs) nb.parent?.remove(nb); g._nobs = null; }   // 立て直す時に幟を二重にしない
  S.m.delete(s);
}
