// 討ち取りと、その証を別々に持つ。名乗りと最期の両方を見た者だけが証人になる。
import * as THREE from 'three';
import { sightPoint } from './battle_sight.js';
import { interiorBlocked } from './shironaka.js';
import { DEATH_END } from './units.js';

const rearDuty = /(?:しんがり|殿軍).*(?:務め|守|果た|生き延び)|殿を務め/;
const eligible = (u) => u && !u.civ && !u.isStruct && u.type !== 'dummy';
const near = (rt, a, b, r) => Math.abs(a.pos.y - b.pos.y) <= 1.8 && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) <= r && !rt.army.wallBetween(a.pos, 0, b.pos);
const returned = (u) => u.alive && !u.fled && !u.fleeing;

export function hearName(rt, foe) {
  if (rt.def.dojo || rt.def.town) return;
  foe.meritHearers = rt.army.units.filter((u) => eligible(u) && u.team === rt.player.u.team && !u.isPlayer && near(rt, u, foe, 24));
}

export function meritHit(rt, foe, src, kind, amount) {
  if (rt.over || rt.def.dojo || rt.def.town || rt.meritFirstSpear || !(amount > 0) || !eligible(foe) || foe.noHead || !eligible(src) || src.team !== rt.player.u.team || foe.team === src.team) return;
  const spear = src.isPlayer ? rt.player.weapon === 'spear' : kind === 'thrust' || src.weapon === 'spear';
  if (!spear || kind === 'gun' || kind === 'arrow' || kind === 'butt') return;
  // 他の味方が先なら、主人公へ一番槍を渡さない。証人がいなくても順番は変えない。
  rt.meritFirstSpear = { src, witnesses: rt.army.units.filter((u) => eligible(u) && !u.isPlayer && u !== src && u.team === src.team && near(rt, u, foe, 18)) };
}

// 倒れ切った亡骸だけを選ぶ。別の階・壁の向こう・救助中の兵には札を出さない。
function headPos(rt, record) {
  const foe = record.foe, u = rt.player.u;
  if (record.head || foe.alive || foe.gone || foe.death?.aid || !u.alive || rt.over || rt.player.mounted || (rt.meritBagCount || 0) >= 2) return null;
  if (foe.mounted ? foe.deadT < 4 : foe.death ? foe.death.t < DEATH_END : !(foe.deadT >= 1)) return null;
  // 袋に納める間のぼかしだけは、亡骸が隠れていても続けられる。
  if (!foe.mesh?.parent || (foe.mesh.visible === false && rt.meritHidden !== foe.mesh)) return null;
  const p = foe.mesh?.position || foe.pos;
  if (Math.abs(u.pos.y - p.y) > .8 || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) >= 2.6 ||
    rt.army.wallBetween(u.pos, -1, p) || interiorBlocked(rt.army.solids, u.pos, p, false, 1.6, .3) ||
    !sightPoint(rt, p, 2.6, false, .3)) return null;
  return p;
}

export function meritKill(rt, foe, src) {
  if (rt.over || rt.def.dojo || rt.def.town || !eligible(foe) || foe.alive || foe.gone || foe.noHead || !src || foe.team === src.team || src.team !== rt.player.u.team) return;
  // 味方の首取りも同じ長押しで扱う。誰の手柄かは最後の一撃を入れた者から変えない。
  const record = { foe, src, head: false, carrier: null, witnesses: (foe.meritHearers || []).filter((u) => returned(u) && u !== src && near(rt, u, foe, 18)) };
  (rt.meritKills || (rt.meritKills = [])).push(record);
  // 味方も、倒した場を動かず三秒守れた時だけ証を納める。戦い続ける者へ自動で首は渡さない。
  if (!src.isPlayer && !src.mounted && !src.target?.alive) rt.after(3, () => {
    if (rt.over || record.head || foe.alive || foe.gone || foe.death?.aid || (foe.death && foe.death.t < DEATH_END) || !returned(src) || src.mounted || src.target?.alive || src.atk || src.stagger > 0 || src.lastHitT < 3 || !near(rt, src, foe, 2.6)) return;
    if (rt.army.units.some((u) => u.alive && eligible(u) && u.team !== src.team && near(rt, src, u, 6))) return;
    record.head = true; record.carrier = src;
    if (!rt.meritFirstHead) rt.meritFirstHead = record;
    rt.uninteract('head' + foe.id);
  });
  if (!src.isPlayer && !src.isSub && !src.isTomo) return;
  if ((rt.meritBagCount || 0) >= 2) {
    if (!record.witnesses.length) rt.bark('袋はいっぱい。証人がいなければ手柄にならない');
    return;
  }
  rt.hint('head');
  const id = 'head' + foe.id;
  rt.addInteract(id, () => headPos(rt, record), `首を袋に納める（${foe.name || '敵の兵'}）`, () => {
    const p = headPos(rt, record);
    if (!p || Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) >= 2.6) return;
    rt.uninteract(id);
    record.head = true;
    record.carrier = rt.player.u;
    rt.meritBagCount = (rt.meritBagCount || 0) + 1;
    if (rt.meritBagCount >= 2) {
      for (const r of rt.meritKills) rt.uninteract('head' + r.foe.id);
      rt.bark('袋は二つでいっぱい。これ以上は持てない');
    }
    if (!rt.meritFirstHead) rt.meritFirstHead = record;
    if (src.isPlayer) rt.award((t) => t.c.heads++, '討ち取りの証を得た');
    rt.bark('袋に納めた。討ち取りの証になる');
    if (rt.def.onHead) rt.def.onHead(rt, foe);
  }, { r: 2.6, hold: 3 });
  if (!record.witnesses.length && !rt.def.uchisute) rt.bark('証がない。近くで首を袋に納めよ');
}

export function finishMerit(rt, info) {
  if (rt.def.dojo || rt.def.town) return;
  const t = rt.tracker;
  const scriptedLast = t.special;
  // 証人が討死・敗走していれば証言は届かない。首袋は本人が帰った時だけ届く。
  t.c.ashigaru = t.c.samurai = t.c.subKills = t.c.heads = 0;
  t.busho.length = 0;
  let bagProofs = 0, spokenProofs = 0;
  for (const r of rt.meritKills || []) if (r.src.isSub || r.src.isTomo) r.src.kills = 0;
  for (const r of rt.meritKills || []) {
    const witness = r.witnesses.find(returned);
    const bag = r.head && returned(r.carrier) && (!r.carrier.isPlayer || !info.down);
    r.proven = !!(bag || witness);
    if (!bag && !witness) continue;
    if (r.src.isPlayer) {
      if (r.foe.type === 'busho') { t.busho.push(r.foe.name || '敵武将'); rt.grantTitle('busho'); }
      else if (r.foe.type === 'samurai') t.c.samurai++;
      else t.c.ashigaru++;
      if (bag) { t.c.heads++; bagProofs++; } else spokenProofs++;
      rt.grantTitle('firstBlood');
      if (r.foe.type === 'busho') t.special = { label: `討ち取りの証：${r.foe.name || '敵武将'}。${bag ? '首袋を差し出した' : `${witness.name || '味方の兵'}が名乗りと討ち取りを証言した`}`, pts: 0 };
    } else {
      if (r.src.isSub || r.src.isTomo) r.src.kills++;
      if (r.src.isSub) t.c.subKills++;
    }
  }
  // 戦固有の「城将を討った」なども、倒しただけでは褒美にしない。追撃・制圧の任務は別の働き。
  t.specials = t.specials.filter((s) => {
    if (!(s.pts > 0) || /追い討/.test(s.label) || !/討ち取|を討った|を討つ/.test(s.label)) return true;
    return (rt.meritKills || []).some((r) => r.proven && (r.src.isPlayer || r.src.isSub) &&
      ((r.foe.name && s.label.includes(r.foe.name)) || (/城将|侍大将|一騎打ち/.test(s.label) && r.foe.type === 'busho')));
  });
  if (bagProofs || spokenProofs) t.special = { label: `討ち取りの証：首袋で${bagProofs}人分、味方の証言で${spokenProofs}人分を確かめた`, pts: 0 };
  const first = rt.meritFirstSpear;
  if (first?.src.isPlayer && first.witnesses.some(returned)) t.special = { label: '一番槍。味方が先駆けを証言した', pts: 30 };
  if (rt.meritFirstHead?.src.isPlayer && rt.player.u.alive && !info.down) t.special = { label: '一番首。最初の首袋を差し出した', pts: 30 };
  if (!info.down && t.main === true) for (const s of t.specials) if (rearDuty.test(s.label)) s.pts = Math.max(s.pts, 40);
  // 戦固有の働きを最後に残し、一騎打ちなど既存の実績の判定も保つ。
  const lastIndex = t.specials.indexOf(scriptedLast);
  if (lastIndex >= 0) { t.specials.splice(lastIndex, 1); t.specials.push(scriptedLast); }
  hideMerit(rt);
}

// 一つの閉じた布袋を使い回す。首や切断の絵は作らず、足元をぼかす。
export function meritPose(rt) {
  const u = rt.player.u;
  const collecting = !rt.over && u.alive && rt.holdId?.startsWith('head');
  if (!collecting) { hideMerit(rt); return; }
  if (!rt.meritBag) {
    rt.meritBag = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), new THREE.MeshLambertMaterial({ color: 0x79684e }));
    rt.meritBag.scale.set(1, 1.3, 0.8);
    u.mesh.add(rt.meritBag);
    rt.meritBlur = document.createElement('div');
    rt.meritBlur.style.cssText = 'position:fixed;width:180px;height:180px;transform:translate(-50%,-50%);border-radius:50%;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);background:rgba(70,60,45,.5);pointer-events:none;z-index:2';
    rt.meritBlurPoint = new THREE.Vector3();
    rt.meritBlur.setAttribute('aria-hidden', 'true');
    document.body.appendChild(rt.meritBlur);
  }
  rt.meritBag.visible = true;
  rt.meritBlur.hidden = false;
  const record = rt.meritKills.find((r) => rt.holdId === 'head' + r.foe.id);
  if (record) {
    if (rt.meritHidden && rt.meritHidden !== record.foe.mesh) {
      rt.meritHidden.visible = rt.meritHiddenVisible;
      rt.meritHidden = null;
    }
    if (!rt.meritHidden) rt.meritHiddenVisible = record.foe.mesh.visible;
    rt.meritHidden = record.foe.mesh;
    rt.meritHidden.visible = false;
    const p = rt.meritBlurPoint.set(record.foe.pos.x, record.foe.pos.y + 0.3, record.foe.pos.z).project(rt.camera);
    rt.meritBlur.style.left = `${(p.x + 1) * window.innerWidth * 0.5}px`;
    rt.meritBlur.style.top = `${(1 - p.y) * window.innerHeight * 0.5}px`;
  }
  const bend = Math.sin(rt.holdPct * Math.PI);
  rt.meritBag.position.set(0.22, 0.85 - bend * 0.35, 0.35);
  u.body.rotation.x = 0.55 * bend;
  if (u.armL) u.armL.rotation.x = -0.7;
  if (u.armR) u.armR.rotation.x = -0.9;
}

function hideMerit(rt) {
  if (rt.meritHidden) { rt.meritHidden.visible = rt.meritHiddenVisible; rt.meritHidden = null; }
  if (rt.meritBag) rt.meritBag.visible = false;
  if (rt.meritBlur) rt.meritBlur.hidden = true;
}

export function disposeMerit(rt) {
  hideMerit(rt);
  rt.meritBlur?.remove();
  if (rt.meritBag) { rt.meritBag.removeFromParent(); rt.meritBag.geometry.dispose(); rt.meritBag.material.dispose(); }
}
