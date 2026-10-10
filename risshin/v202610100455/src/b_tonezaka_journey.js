import { S } from './settings.js';

// 刀根坂だけの道中。戦の時計を使うので、一時停止中は進まない。
export function toneJourney(rt) {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;inset:0;z-index:40;background:#14120f;color:#ece4d2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:16px;line-height:1.6;pointer-events:auto';
  const title = document.createElement('div'); title.textContent = '越前への追撃　数日の道のり';
  const canvas = document.createElement('canvas'); canvas.width = 680; canvas.height = 180;
  canvas.style.cssText = 'width:min(680px,90vw);height:auto;max-height:48vh';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '刀根坂から敦賀、木ノ芽峠、府中を経て一乗谷へ向かう略図');
  const note = document.createElement('div'); note.style.textAlign = 'center';
  panel.append(title, canvas, note); document.body.append(panel);
  const ctx = canvas.getContext('2d');
  const points = [[50, 125], [180, 90], [310, 55], [450, 95], [620, 50]];
  const labels = ['刀根坂', '敦賀', '木ノ芽峠', '府中', '一乗谷'];
  const dates = ['八月十三日夜、刀根坂で追い討ち', '八月十四〜十六日、敦賀で三日留まる', '八月十七日、木ノ芽峠を越える', '八月十八日、信長公は府中へ', '八月十八日以後、柴田の先手は一乗谷へ'];
  const playerUpdate = rt.player.update, armyUpdate = rt.army.update;
  const invuln = rt.player.u.invuln;
  rt.player.update = () => {}; rt.army.update = () => {}; rt.player.u.invuln = true;
  const start = rt.t; let last = -1, closed = false, dated = false;
  const draw = (stage) => {
    if (ctx) {
      ctx.fillStyle = '#ece4d2'; ctx.fillRect(0, 0, 680, 180);
      ctx.strokeStyle = '#9a9282'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < points.length; i++) { const [x, y] = points[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.strokeStyle = '#a52e20'; ctx.lineWidth = 6; ctx.beginPath();
      const end = S.reduceMotion ? 4 : stage;
      for (let i = 0; i <= end; i++) { const [x, y] = points[i]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke(); ctx.font = '20px serif'; ctx.textAlign = 'center';
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i]; ctx.fillStyle = '#14120f';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillText(labels[i], x, y + 30);
      }
    }
    note.textContent = dates[stage];
  };
  const close = () => {
    if (closed) return;
    closed = true; panel.remove(); rt.player.update = playerUpdate; rt.army.update = armyUpdate; rt.player.u.invuln = invuln;
  };
  const dispose = rt.world.dispose.bind(rt.world);
  rt.world.dispose = () => { close(); dispose(); };
  draw(0);
  return { close, tick() {
    const elapsed = rt.t - start, stage = Math.min(4, Math.floor(elapsed / 2));
    if (elapsed >= 10) {
      if (!dated) {
        dated = true; canvas.hidden = true; note.hidden = true;
        title.textContent = '八月十八日'; title.style.fontSize = '24px';
        // 日付の幕の内で夜から昼へ替え、二秒半置いて城下を見せる。
        rt.world.setTime('day');
      }
      return elapsed >= 12.5;
    }
    if (stage !== last) { last = stage; draw(stage); }
    return false;
  } };
}

// 暗転中に既存の兵だけを移す。人数・体力・戦功は増やさない。
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
}
