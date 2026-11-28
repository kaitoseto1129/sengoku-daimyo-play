// ======================================================================
// shiro.js … 束8：城の備の置き方と城主の判断（docs/battle-system-plan.md 396〜407行）
// 「最小で動く形」：役（門・塀・櫓・曲輪・予備・本丸）から posts を読み、makeSonae（城の備）と
// makeDefenseAI の posts・reserves をまとめて作る。予備と本丸は必ず残す（無ければ console に警告）。
// 本丸（lord）の城主の判断（lordState）は最小の形だけ（士気か兵力が崩れたら 'fallback'→'surrender'）。
//
// 使い方：
//   const G = castleGarrison(rt, C, {
//     team, faction, armor, flag,
//     posts: [{ id, kuruwa, gate, kind, nominal, mix, role: '門'|'塀'|'櫓'|'曲輪'|'予備'|'本丸', at, facing, next }],
//     lord: { name, kuruwa: 'hon' },
//   });
//   // 毎コマ： G.tick(dt)
// ======================================================================
import { makeSonae, sonaeById } from './sonae.js';
import { makeDefenseAI } from './siege_ai.js';
import { logEvent } from './senkyo.js';

export function castleGarrison(rt, C, o = {}) {
  const team = o.team ?? 1;
  const faction = o.faction || 'takeda';
  const armor = o.armor ?? 0x3a2622;
  const flag = o.flag || faction;
  const posts = o.posts || [];

  const hasReserve = posts.some((p) => p.role === '予備');
  const honPost = posts.find((p) => p.role === '本丸');
  if (!hasReserve) console.warn('[castleGarrison] 予備の役が無い（最低一つは残す決まり）');
  if (!honPost) console.warn('[castleGarrison] 本丸の役が無い');

  const sonae = {}, atOf = {};
  for (const p of posts) {
    const at = p.at || (p.kuruwa && C && C.kuruwa[p.kuruwa] ? C.kuruwa[p.kuruwa].centroid : { x: 0, z: 0 });
    atOf[p.id] = at;
    const isHon = p.role === '本丸';
    const isReserve = p.role === '予備';
    const S = makeSonae(rt, {
      id: p.id,
      name: p.name || p.id,
      team, faction, armor, flag,
      // 本丸は line を 'honjin' にしない：gunsei.js は team ごとに line==='honjin' の備を
      // 「本陣（攻め手の旗本）」として憑りtsume・本陣危機の下がりの的にする（確かめで見つけた：
      // 城主の備がすぐ遠くへ「後退」し、本丸がいつまでも奪われない原因）。城方の本丸は last-line の 2 にする
      line: isReserve ? 'gotsume' : (isHon ? 2 : 1),
      slot: p.slot || 'center',
      taisho: isHon ? (o.lord && o.lord.name) || '城主' : (p.taisho ?? null),
      nominal: p.nominal ?? 0,
      mix: p.mix || { ashigaru: 0.7, samurai: 0.3 },
      at, facing: p.facing ?? Math.PI,
      major: isHon || !!p.major,
    });
    sonae[p.id] = S;
  }

  // makeDefenseAI の posts（門・塀・櫓・曲輪。予備は reserves へ）
  const daPosts = posts.filter((p) => p.role !== '予備').map((p) => ({
    id: p.id, butai: sonae[p.id].b, at: atOf[p.id],
    facing: p.facing ?? Math.PI, gate: p.gate || null, next: p.next || null, honjin: p.role === '本丸',
  }));
  const reserves = posts.filter((p) => p.role === '予備').map((p) => sonae[p.id].b);

  const DA = makeDefenseAI(rt, { team, posts: daPosts, reserves, nawabari: o.nawabari || null, fallback: o.fallback || null });

  // 城主の判断（最小の形）：lordState = 'defend'|'fallback'|'surrender'（escape は束8のこの先の形で足す）
  const lord = { state: 'defend', name: (o.lord && o.lord.name) || '城主' };
  function lordTick() {
    if (!honPost) return;
    const S = sonae[honPost.id]; if (!S) return;
    const alive = S.b.aliveNominal ? S.b.aliveNominal() : 0;
    const nominal = honPost.nominal || 1;
    if (lord.state !== 'surrender' && alive <= nominal * 0.15 && S.morale < 25) {
      lord.state = 'surrender';
      logEvent(rt, 'lordState', { team, who: lord.name, v: 'surrender' });
    } else if (lord.state === 'defend' && alive <= nominal * 0.5) {
      lord.state = 'fallback';
      logEvent(rt, 'lordState', { team, who: lord.name, v: 'fallback' });
    }
  }

  let lordT = 0;
  return {
    sonae, DA, lord,
    tick(dt) {
      DA.tick(dt);
      lordT -= dt;
      if (lordT <= 0) { lordT = 1; lordTick(); }
    },
  };
}
