import { TYPES } from './units_data.js';
import { horseThreatTick } from './horse_reality.js';

// 騎乗・下馬の両方を残す。三河物語は下馬を基本とし、伊達日記などには馬上の戦いもある。
// 参考：中部大学「戦国時代における騎馬戦闘について―騎乗戦闘の再検討―」
// https://www.chubu.ac.jp/documents/digibook/glocal/glocal016/pageindices/index8.html
// 武田の無名の馬乗りは三人中二人が下馬する復元。史料で確定した割合ではない。
// 戦の定義の horseBattle: 'foot' / 'mounted' で個別に選べる。足軽を馬乗りにはしない。
export function cavalryRole(u, g, o, messenger) {
  if (u.type !== 'cavalry' && u.type !== 'samurai' && u.type !== 'busho') return;
  if (o.horseBattle === 'foot' || o.horseBattle === 'mounted') u.horseBattle = o.horseBattle;
  else if (u.type === 'cavalry') {
    if (u.name || messenger) { u.horseBattle = 'mounted'; return; }
    const k = g._horseBattleN || 0;
    g._horseBattleN = k + 1;
    u.horseBattle = g.faction === 'takeda' && k % 3 !== 0 ? 'foot' : 'mounted';
  }
}

function onFoot(army, u) {
  const h = u.horse, g = u.group;
  army.setMounted(u, false);
  u.horse = null; u.autoHorse = false; u.charging = false;
  u.cv = null; u.cvT = 0; u.atk = null; u.swing = null; u.bind = null;
  u.dismounted = true; u.aiT = 0; u.horseBattle = 'foot';
  // 槍・具足・負傷はそのまま。馬の走力だけを徒歩の値に戻す。
  if (u.type === 'cavalry') u.type = 'samurai';
  const foot = u.type === 'busho' ? TYPES.busho : TYPES.samurai;
  u.speed = foot.speed; u.run = foot.run; u.windup = foot.windup;
  u.cdBase = foot.cd; u.cd = Math.max(u.cd, 0.6);
  if (g?._slotTypes) {
    g._slotTypes[u.slot] = u.type;
    let riders = 0;
    for (const t of g._slotTypes) if (t === 'cavalry' || t === 'horse') riders++;
    g.cavShare = riders / Math.max(1, g._slotTypes.length);
    g.cav = g._slotTypes.length >= 3 && g.cavShare >= 0.6;
    g._mix = null; // 次の持ち場計算から徒歩の段へ加わる。
  }
  if (!h) return;
  // 既にある馬を後ろに残す。銃声や火に驚けば、既存の空馬の処理で逃げる。
  h.position.copy(u.mesh.position); h.rotation.set(0, u.heading, 0);
  army.scene.add(h);
  const horses = army.looseHorses || (army.looseHorses = []);
  horses.push({ h, heading: u.heading, spd: 0, t: 0, calm: true,
    from: { team: u.team, house: '', name: u.name || '', speed: 1,
      hp: u.horseHp ?? 143, maxHp: u.horseMax ?? 143, hfat: u.hfat || 0, dismounted: true } });
  // 下馬で空馬の上限を増やさない。本人が置いた馬は片付けない。
  if (horses.length > 20) {
    let far = -1, distance = -1;
    const p = army.playerUnit?.pos || u.pos;
    for (let i = 0; i < horses.length; i++) {
      if (!horses[i].from?.dismounted) continue;
      const q = horses[i].h.position, d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > distance) { far = i; distance = d; }
    }
    if (far >= 0) army.scene.remove(horses.splice(far, 1)[0].h);
  }
}

// 接敵する前に減速し、足を止めて下馬する。無敵にはせず、怯え・負傷で支度が遅れる。
// 判断は半秒ごと。毎コマ、馬や行き先の入れ物を作らない。
export function cavalryDismountTick(army, u, dt) {
  if (u.isPlayer || !u.alive || u.fleeing || u.group?.routed) { u.dismountLeft = 0; return false; }
  if (!u.mounted) {
    if (u.type === 'cavalry') onFoot(army, u);
    return false;
  }
  if (u.horseBattle !== 'foot') return false;
  if (!(u.dismountLeft > 0)) {
    if (u.dismountSenseAt > army.time) return false;
    u.dismountSenseAt = army.time + 0.5;
    const t = u.target?.alive ? u.target : army.nearestEnemy(u, 24);
    if (!t || Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) > 24 || Math.abs(t.pos.y - u.pos.y) > 3) return false;
    u.dismountLeft = 1.4;
  }
  // 下馬の支度中も、銃声・柵・槍への怯えと落馬は止めない。
  if (horseThreatTick(army, u, dt) || !u.mounted) return true;
  u.charging = false; u.atk = null; u.swing = null;
  const brake = Math.max(0, 1 - dt * 5);
  u.mv.x *= brake; u.mv.z *= brake; u.vel.x *= brake; u.vel.z *= brake;
  u.moving *= brake;
  if (Math.hypot(u.mv.x, u.mv.z) < 0.3 && !(u.stagger > 0) && !u.hit) u.dismountLeft -= dt;
  if (u.dismountLeft <= 0) {
    onFoot(army, u);
    u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
    u.moving = 0;
  }
  return true;
}
