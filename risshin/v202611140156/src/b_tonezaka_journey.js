import { S } from './settings.js';

// 刀根坂だけの道中。戦の時計を使うので、一時停止中は進まない。
export function toneJourney(rt) {
  const panel = document.createElement('div');
  // 道中の札は下三分の一まで。戦場を見渡せるまま、いつでも先へ進める。
  panel.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:min(900px,100vw);height:33vh;max-height:124px;box-sizing:border-box;padding:8px;z-index:40;background:#14120f;color:#ece4d2;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:22px minmax(0,1fr) 22px;column-gap:8px;font-size:16px;line-height:22px;pointer-events:auto';
  const title = document.createElement('div'); title.textContent = '越前への追撃';
  const route = document.createElement('div');
  route.style.cssText = 'grid-column:1;grid-row:2;display:grid;grid-template-rows:minmax(0,1fr) 20px;min-height:0';
  const canvas = document.createElement('canvas'); canvas.width = 680; canvas.height = 28;
  canvas.style.cssText = 'width:100%;height:100%;min-height:0';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '刀根坂から敦賀、木ノ芽峠、府中を経て一乗谷へ向かう略図');
  const note = document.createElement('div'); note.style.cssText = 'grid-column:1;grid-row:3;text-align:center;font-size:14px';
  const advance = document.createElement('button'); advance.type = 'button';
  advance.textContent = '城下へ進む';
  advance.style.cssText = 'grid-column:2;grid-row:1 / 4;align-self:center;min-height:44px;padding:8px 16px;background:#ece4d2;color:#14120f;border:2px solid #c2a25a;font:inherit;cursor:pointer';
  // 略図と通常の任務・台詞を重ねず、道中の一枚だけにまとめる。
  const style = document.createElement('style');
  style.textContent = '#hud[data-tonezaka-journey] :is(#battle-notices,#boss,#target,#markers){display:none !important}';
  rt.hud.root.dataset.tonezakaJourney = '';
  const places = document.createElement('div');
  places.style.cssText = 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));text-align:center;font-size:14px;line-height:20px';
  route.append(canvas, places);
  // 11/6 fixc2220（五1・二6）：秒を数える字と押す釦をやめた。日付を追う略図だけを見せて進む。
  panel.append(style, title, route, note); document.body.append(panel);
  const ctx = canvas.getContext('2d');
  const points = [[68, 14], [204, 14], [340, 14], [476, 14], [612, 14]];
  const labels = ['刀根坂', '敦賀', '木ノ芽峠', '府中', '一乗谷'];
  // 地名は縮む絵から分け、狭い画面でも十四の字の大きさを保つ。
  for (const label of labels) {
    const place = document.createElement('span'); place.textContent = label; places.append(place);
  }
  const dates = ['八月十三日朝、刀根坂で追い討ち', '八月十四〜十六日、敦賀で三日留まる', '八月十七日、木ノ芽峠を越える', '八月十八日、信長公は府中へ', '八月十八日以後、柴田の先手は一乗谷へ'];
  // 略図の間は兵の更新も止まる。直前に倒れた相手への狙いを十一秒間残さない。
  const staleTarget = (target) => target && !target.isStruct &&
    (!target.alive || target.dying || target.gone || target.noTarget);
  for (const u of rt.army.units) {
    if (!u.alive) continue;
    // 通常の狙いが既に外れていても、振りや組み打ちは別に相手を覚えている。
    let cleared = false;
    if (staleTarget(u.target)) { u.target = null; cleared = true; }
    if (staleTarget(u.atk?.target)) { u.atk = null; cleared = true; }
    if (staleTarget(u.swing?.target) && !u.swing.done) { u.swing = null; cleared = true; }
    if (staleTarget(u.bind?.o)) { u.bind = null; cleared = true; }
    if (cleared) u.aiT = 0;
  }
  const playerUpdate = rt.player.update, armyUpdate = rt.army.update;
  const invuln = rt.player.u.invuln;
  rt.player.update = () => {}; rt.army.update = () => {}; rt.player.u.invuln = true;
  const start = rt.t; let last = -1, remaining = 11, closed = false, dated = false;
  let advanceAt = null;
  advance.onclick = () => {
    if (closed || advanceAt !== null) return;
    advanceAt = rt.t; advance.disabled = true;
  };
  const draw = (stage) => {
    if (ctx) {
      ctx.fillStyle = '#ece4d2'; ctx.fillRect(0, 0, 680, 28);
      ctx.strokeStyle = '#9a9282'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < points.length; i++) { const [x, y] = points[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.strokeStyle = '#a52e20'; ctx.lineWidth = 6; ctx.beginPath();
      const end = S.reduceMotion ? 4 : stage;
      for (let i = 0; i <= end; i++) { const [x, y] = points[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i]; ctx.fillStyle = '#14120f';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    note.textContent = dates[stage];
  };
  const close = () => {
    if (closed) return;
    closed = true; panel.remove(); delete rt.hud.root.dataset.tonezakaJourney;
    rt.player.update = playerUpdate; rt.army.update = armyUpdate; rt.player.u.invuln = invuln;
  };
  const dispose = rt.world.dispose.bind(rt.world);
  rt.world.dispose = () => { close(); dispose(); };
  draw(0);
  return { close, tick() {
    const elapsed = Math.max(rt.t - start, advanceAt === null ? 0 : 10 + rt.t - advanceAt);
    const stage = Math.min(4, Math.floor(elapsed / 2));
    if (elapsed >= 10) {
      if (!dated) {
        dated = true; route.style.display = 'none'; note.hidden = true;
        title.textContent = '八月十八日以後　一乗谷';
        // 府中着陣の日と城下への進出を同日と断定しない。昼の景色は演出。
        // 自動進行では日付を一秒見せる。押した時は待たせない。
        rt.world.setTime('day');
      }
      return advanceAt !== null || elapsed >= 11;
    }
    const seconds = Math.max(0, Math.ceil(11 - elapsed));
    if (seconds !== remaining) remaining = seconds;
    if (stage !== last) { last = stage; draw(stage); }
    return false;
  } };
}

// 坂に残る兵は生存枠からも下ろす。別組の旗本を城下へ持ち越さない。
export function toneJourneyRetire(rt, groups) {
  const retired = new Set(groups.filter(Boolean));
  for (const g of rt.army.groups) if (g.taishoGuard && retired.has(g.taishoGuard.group)) retired.add(g);
  for (const g of retired) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
}

// 道中の切り替えで既存の兵だけを移す。人数・体力・戦功は増やさない。
export function toneJourneyGroup(rt, g, p, facing) {
  if (!g || g.routed) return;
  g.anchor.x = p.x; g.anchor.z = p.z; g.facing = g._face = facing;
  g.order = 'hold'; g.path = null; g.onArrive = null; g.formation = 'column'; g.colW = 2;
  g._slotFit = null; g._routeCols = 0;
  for (const u of g.units) if (u.alive && !u.gone && !u.woundOut && !u.fleeing) {
    const q = g.slotPos(u.slot, g.initial);
    u.pos.set(q.x, rt.world.heightAt(q.x, q.z), q.z);
    u.target = null; u.moveTo = null; u.vel.x = u.vel.z = 0;
  }
  // 将の本隊だけ移すと、別の組になっている旗本が峠から城下へ走って飛ぶ。
  // 同じ場面替えの中で供も移し、次の更新から将の周りを守らせる。
  for (const guard of rt.army.groups) {
    if (guard === g || !guard.taishoGuard || guard.taishoGuard.group !== g) continue;
    toneJourneyGroup(rt, guard, guard.taishoGuard.pos, facing);
  }
}
