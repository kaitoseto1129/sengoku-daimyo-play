// 居場所は見た旗か、届いた知らせで知る。物理的な旗は隠さない。
import { weatherSees } from './weather_gameplay.js';

function intel(rt) { return rt.enemyIntel || (rt.enemyIntel = { names: new Set(), camp: false, next: 0, version: 0 }); }
export function enemyKnown(rt, u) { return u.team === 0 || intel(rt).names.has(u.name); }
export function campKnown(rt) { return intel(rt).camp; }
function seenFlag(rt, u) {
  const p = rt.player.u.pos, q = u.pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
  const yaw = (rt.player.yaw || 0) + (rt.player.camYawOff || 0);
  if (d > 42 || !weatherSees(rt.world, p, q) || (dx * Math.sin(yaw) + dz * Math.cos(yaw)) < d * 0.55 || rt.army.wallBetween(p, 0, q)) return false;
  const y0 = p.y + 1.7, y1 = q.y + 2.8;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    if (rt.world.heightAt(p.x + dx * t, p.z + dz * t) > y0 + (y1 - y0) * t) return false;
  }
  return true;
}
function concealed(rt, text, group) {
  const I = intel(rt), b = rt.taisho?.b;
  if (group?.team === 0) return false;
  if (b && (text.includes(b.name) || (text.includes('本陣') && text.includes(b.name.slice(-2)))) && !I.names.has(b.name)) return true;
  if (/敵の本陣|敵本陣|敵の大将|敵の総大将/.test(text) && !I.camp) return true;
  for (const u of rt.army.units) {
    if (u.team !== 0 && u.name && u.isOfficer && (text.includes(u.name) || group === u.group) && !I.names.has(u.name)) return true;
  }
  return !!(group && group.team !== 0 && /本陣|旗本|馬廻/.test(group.name || '') && !I.camp);
}
export function intelText(rt, text) {
  return concealed(rt, String(text || '')) ? '敵の備えを崩せ。大きな旗の場所はまだ分からぬ' : text;
}
export function intelMarker(rt, m) {
  const label = String(typeof m.label === 'function' ? m.label() : m.label || '');
  const q = typeof m.intelPos === 'function' ? m.intelPos() : m.intelPos;
  const b = rt.taisho?.b;
  const campMark = /本陣|大将|旗本/.test(label) && q && b?.u && Math.hypot(q.x - b.u.pos.x, q.z - b.u.pos.z) < 28;
  m.intelHidden = !!((campMark && !campKnown(rt)) || concealed(rt, label, m.group) || (m.red && /本陣|総大将/.test(label) && !campKnown(rt)));
}
export function intelReport(rt, who, text) {
  if (!/物見|伝令|使番|捕らえた兵/.test(who) || /あの辺|方に|大きな.*見え|らしい|かもしれ/.test(text)) return;
  if (!/本陣|籠|退き|殿に|隊|旗|居|おります|おる/.test(text)) return;
  const I = intel(rt), b = rt.taisho?.b, n = I.names.size, camp = I.camp;
  for (const u of rt.army.units) if (u.team !== 0 && u.isOfficer && u.name && text.includes(u.name)) I.names.add(u.name);
  if ((b && text.includes(b.name)) || /敵の本陣|敵本陣/.test(text)) {
    I.camp = true; if (b) I.names.add(b.name);
  }
  if (n !== I.names.size || camp !== I.camp) I.version++;
}
export function intelTick(rt) {
  const I = intel(rt);
  if (rt.t < I.next) return;
  I.next = rt.t + 0.5;
  const n = I.names.size, camp = I.camp;
  for (const u of rt.army.units) {
    if (u.team === 0 || !u.alive || !u.isOfficer || !u.name || I.names.has(u.name)) continue;
    if (seenFlag(rt, u)) { I.names.add(u.name); if (u.isTaisho === 'b') I.camp = true; }
  }
  if (n !== I.names.size || camp !== I.camp) I.version++;
  for (const m of rt.markers) intelMarker(rt, m);
}
