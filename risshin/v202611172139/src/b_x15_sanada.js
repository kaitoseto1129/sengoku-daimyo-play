// ======================================================================
// 番外　天王寺（真田幸村）　慶長二十年（1615）五月七日（台帳 K295 番外・kaito 11/17「真田として交換するだけ。ミッションも徳川の首をゲットするだけでいい」）
// 作り：b_k15_tennoji_okayama.js（天王寺・岡山）を丸ごと写す（11/18 kaito「天王寺を丸ごとコピーして、自分が真田になる、それだけ変えて」）。
//   兵の数・備の並び・野の作り・突撃・徳川の新手・本陣の守り・時間・難しさは天王寺のまま。側だけ入れ替える（徳川方＝敵・豊臣方＝味方）。
//   本人は真田信繁（赤備え・鹿角の兜・六文銭の旗・騎馬。units_data.js の「真田信繁」の具足の色と同じ）。
//   任務は一つ「家康を討つ」。家康の本陣にピン、家康を討てば勝ち。
// 本編の筋・位・セーブとは切り離す：徳川編の戦の並びの一番下の「番外」の札から、侍大将で出陣と同じ試し（G.practice）で始める。
// 史実：真田信繁は茶臼山から越前勢を突き抜け、家康の本陣へ三度突き掛かり、金扇の馬印を倒した（docs/battle_refs/k15_tennoji_okayama.md）。
// 向き：北が -z（大坂城）、南が +z（家康の本陣）。座標は天王寺の戦と同じ。
// ======================================================================
import { BATTLE_ASSETS } from './asset_manifest.js';
import { STAGES } from './stages.js';
import { GENERALS } from './units_data.js';
import base from './b_k15_tennoji_okayama.js';

BATTLE_ASSETS.x15_sanada = BATTLE_ASSETS.k15_tennoji_okayama;

const CHAUSU = { x: -106, z: 4 };    // 茶臼山（真田の陣・本人の出る所）
const HON = { x: -40, z: 165 };      // 家康の本陣
const START = { x: -104, z: 16 };
const N2S = Math.atan2(HON.x - START.x, HON.z - START.z);   // 茶臼山から本陣への向き

const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const TR = [];   // act bot の跡（戦の終わりに flags が消えても残す）
const alive = (g) => g && !g.routed && g.count > 0;
// 11/18 kaito K295「天王寺を丸ごとコピーして、自分が真田になる、それだけ変えて」：天王寺の def を丸ごと写す（兵の数・備の並び・野の作り・景色・毛利と真田の突撃・徳川の新手・本陣の守り・時間・難しさ）。
//   変えるのは二つ：①本人＝真田信繁で真田の旗本の中から始まり、側は豊臣方 ②任務＝家康を討つ。
//   側の入れ替え：天王寺の setup が作る隊は、徳川方→team 1（敵）・豊臣方→team 0（味方）に（rt.army.addGroup をこの戦の間だけ包む）。
//   天王寺の段の筋（徳川方の本人向けの任務・行き先・台詞）は動かさず、段の兵の動き（stage1・tadatomo・stage2・stage3）だけを時で呼ぶ。
const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
for (const k of ['introMapLayout', 'introMapGround', 'resumeSteps', 'resumeAt', 'botStat', 'courierPath', 'botEvacuating']) delete D[k];
const PLAYER_SAY = new Set(['使番']);   // 徳川方の本人へ向けた使番の指図（「本陣の前へ戻れ」など）は出さない

const x15_sanada = Object.assign(D, {
  sideFlip: true,
  spawn: { x: START.x, z: START.z, heading: N2S },
  courierN: 0,
  // 両軍の人数（豊臣方 五万五千・徳川方 十五万。天王寺の force の側を入れ替える）
  force: (rt) => ({ a: Math.max(0, 55000 - (rt.flags.ak || 0) * 60), a0: 55000, b: Math.max(0, 150000 - (rt.flags.ek || 0) * 40), b0: 150000 }),
  introPeople: [],
  introText: () => '茶臼山から家康の本陣へ駆け、家康を討て。',
  introLords: ['真田信繁', '徳川家康'],
  introYou: false,
  introFujin: base.introFujin.map((e) => ({ ...e, team: 1 - e.team })),
  sides: { a: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' }, b: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' } },
  taisho: { a: null, b: { name: '徳川家康', def: true } },   // a は置かない：本人の名が真田信繁なので、総大将の仕組み（taisho.js）が本人を総大将として扱わないように
  nameTagVisible: () => true,
  // 本人の見た目：真田信繁（赤備え・鹿角の兜・六文銭の旗。player.js の def.playerLook）
  playerLook: { ...GENERALS['真田信繁'], face: 'player', hero9: 0, real: 1, sode: true, hatColor: SANADA.armor, shu: 1, flag: 'sanada', mon: 'sanada', menpo: 0x7a1c14, menpoStyle: 'hanbo' },
  world: { ...base.world, playerHorse: true, fleeOut: (x, z, team) => (team === 1 ? z > 240 : z < -200) },   // 逃げる先も入れ替える（徳川方は南・豊臣方は城の北）
  botStat(rt) { try { const F = rt.flags, I = F.ieyasu; let a = 0, e = 0; for (const o of rt.army?.units || []) if (o.alive && !o.isStruct) { if (o.team === 0) a++; else if (o.team === 1) e++; } return `${TR.join(' ')}｜段${F.xs || 0}・家康 ${I ? (I.alive ? '生' + Math.round(I.hp) + '/' + Math.round(I.maxHp) : '討') : '無'}・本物 味方${a} 敵${e}・跡 ${(F._tr || []).join(' ')}`; } catch (e) { return 'botStat ' + e.message; } },
  goalSignTarget: (rt) => { const F = rt.flags; if (F.ending) return null; const u = F.ieyasu; return u?.alive ? { x: u.pos.x, z: u.pos.z, label: '徳川家康' } : { x: HON.x, z: HON.z, label: '徳川家康' }; },
  goalSignOff: () => false,
  scoutRun() {},
  tick07() {},

  setup(rt) {
    const army = rt.army, add0 = army.addGroup;
    // 側の入れ替え：本人の隊（player）と本人の組（follow）のほかは、徳川方を敵（1）・豊臣方を味方（0）に
    army.addGroup = function (o) { if (o && o.name !== 'player' && o.order !== 'follow') { const t = o.faction === 'tokugawa' ? 1 : o.faction === 'toyotomi' ? 0 : (o.team === 1 ? 0 : 1); o = { ...o, team: t }; } return add0.call(this, o); };
    // 徳川方の本人へ向けた任務・行き先・褒美・台詞は出さない（任務は「家康を討つ」一つ）
    const obj0 = rt.obj, mk0 = rt.marker, aw0 = rt.award, say0 = rt.say;
    rt.obj = (id, t, k) => (t === '家康を討つ' ? obj0.call(rt, id, t, k) : undefined);
    rt.marker = () => undefined;
    rt.award = (f, label, ...r) => (label === '家康を討ち取った' ? aw0.call(rt, f, label, ...r) : undefined);
    rt.say = (who, text, ...r) => { if (!rt.flags._mySay && (PLAYER_SAY.has(who) || who === rt.G?.name || who === '真田信繁')) return undefined; return say0.call(rt, who, text, ...r); };
    base.setup.call(this, rt);
    const F = rt.flags;
    // 本人が真田信繁：天王寺の信繁（真田の旗本の将）の座に本人が入る（二人の信繁を並べない）
    { const N = F.nobuU; if (N) { try { N.invuln = false; army.despawn ? army.despawn(N) : (N.alive = false); } catch (e) { N.alive = false; } } F.nobuU = null; }
    if (rt.G?.practice) rt.G.name = '真田信繁';
    if (rt.player?.u) { rt.player.u.name = '真田信繁'; rt.player.u.faction = 'toyotomi'; }
    // 家康は天王寺と同じ床几・旗本の守り。命だけは天王寺の九倍（討たれない為の厚さ）を四分の一に（任務が「家康を討つ」なので。act bot 0125：命4104で、赤備えが本陣へ届いても減らなかった）
    if (F.ieyasu) F.ieyasu.hp = F.ieyasu.maxHp = Math.round(F.ieyasu.maxHp / 4);
    F.xs = 0; F.xT0 = rt.t;
    rt.obj('main', '家康を討つ', 'main');
    this.mySay(rt, 1.5, '狙うは家康の首ただ一つ！', 3);
    rt.after(10, () => this.xStage(rt, 1));
  },
  mySay(rt, at, text, d) { rt.after(at, () => { if (rt.flags.ending) return; rt.flags._mySay = true; try { rt.say('真田信繁', text, d); } finally { rt.flags._mySay = false; } }); },
  stage1() {},   // 茶臼山の物見の後の呼び出し（天王寺の①）は下の xStage が時で呼ぶ

  // 天王寺の段の兵の動きを時で呼ぶ（①毛利の先手の突撃 → 本多忠朝の討死と勝永の本隊・木村・二の手・後藤 → ②毛利と真田の本陣への突撃 → ③真田の二番手と新手・馬印が倒れる）
  xStage(rt, n) {
    const F = rt.flags;
    if (F.ending || F.xs >= n) return;
    F.xs = n;
    const run = (f) => { try { f(); } catch (e) { console.warn('x15 段', n, e); } };
    if (n === 1) { run(() => base.stage1.call(this, rt)); this.mySay(rt, 12, '大助、城へ戻り殿をお守りせよ。ここは父が引き受ける。', 3.2); rt.after(35, () => this.xStage(rt, 2)); }
    if (n === 2) { run(() => base.tadatomo.call(this, rt)); rt.after(120, () => this.xStage(rt, 3)); }
    if (n === 3) { run(() => base.stage2.call(this, rt)); this.goNobu(rt); this.mySay(rt, 4, '赤備え、続け！　家康の本陣へ駆け入る！', 3); rt.after(150, () => this.xStage(rt, 4)); }
    if (n === 4) { run(() => base.stage3.call(this, rt)); F.step = 2; this.mySay(rt, 8, 'あと一押しじゃ。金扇の馬印は倒れたぞ！', 3); }
  },
  // 本人の旗本（天王寺の「真田信繁の旗本」）は本人と共に家康の本陣へ
  goNobu(rt) { const F = rt.flags; if (F.nobuGo) return; F.nobuGo = true; for (const g of [F.nobu, F.sanada]) if (alive(g)) { g.stay = false; base.charge.call(this, rt, g, 8); } },

  update(rt, dt) {
    base.update.call(this, rt, dt);   // 天王寺の野の動き（音・霧・枠・柵・陣・旗）。sideFlip で段の筋の手前まで
    const F = rt.flags;
    if (F.ending) return;
    this.makuSlide(rt, dt); this.fenceSlide(rt, dt); this.unstick(rt, dt);
    const P = rt.player?.u, I = F.ieyasu;
    if (P && (F._trT = (F._trT || 0) + dt) > 60) { F._trT = 0; if (rt.t < 61) TR.length = 0; TR.push(`${Math.round(rt.t)}:${F.xs}:(${Math.round(P.pos.x)},${Math.round(P.pos.z)})${Math.round(P.hp)}/I(${I ? Math.round(I.pos.x) + ',' + Math.round(I.pos.z) + ':' + Math.round(I.hp) : '-'})L(${(() => { const g = [F.nobu, F.sanada, F.sanada2].find(alive); const c = g?.center?.(); return c ? Math.round(c.x) + ',' + Math.round(c.z) + ':' + g.count : '-'; })()})`); }
    // 天王寺の新手（refill）：豊臣方の新手は本人の後ろから家康へ突き掛かり、徳川方の新手は本人の前へ重なり、先手・二陣・旗本の崩れも埋める（天王寺と同じ・側だけ入れ替わる）
    if (F.step >= 1 && F.step <= 4) { try { this.refill(rt); } catch (e) { console.warn('x15 refill', e); } }
    // 家康は本陣の陣幕の内（床几の場の奥の幕 z177 の手前）から外へ退かない（act bot 0125：z238 の縁まで退いた。0141：幕の後ろ z195 へ退き、本人は幕の内で幕に阻まれ五分届かなかった）
    if (I?.alive && I.pos.z > HON.z + 9) { I.pos.z = HON.z + 9; if (I.moveTo && I.moveTo.z > HON.z + 9) I.moveTo = null; }
    // 本人が茶臼山を下りたら、旗本も共に駆ける（待たせない）
    if (P && !F.nobuGo && F.xs >= 1 && Math.hypot(P.pos.x - START.x, P.pos.z - START.z) > 30) this.goNobu(rt);
    // 突撃の隊は家康の居所へ付いていく（三秒ごと）
    if (F.nobuGo && (F._reT = (F._reT || 0) + dt) > 3) { F._reT = 0; for (const g of [F.nobu, F.sanada, F.sanada2, F.sanada3]) if (alive(g) && g._charge) { const at = I?.alive ? I.pos : HON; g.anchor = { x: at.x, z: at.z }; } }
    // 本人が本陣に迫ったら段を早める（待たせない）
    if (P && I?.alive && F.xs >= 1 && F.xs < 3 && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 60) { F.xs = 2; this.xStage(rt, 3); }
    // 迫られた家康は自ら太刀を取る。本陣から四十m より離れたら旗本の持ち場へ戻す
    if (I?.alive) { if (I.fleeing) { I.fleeing = false; I.moraleFleeDir = null; } if (alive(F.hon) && Math.hypot(I.pos.x - HON.x, I.pos.z - HON.z) > 40) { I.target = null; I.atk = null; } else if (P?.alive && !I.target && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 4) { I._crouch = false; I.target = P; } }
    if (!F.flee && P && I?.alive && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 30) {
      F.flee = true;
      if (alive(F.hon)) F.hon.anchor = { x: HON.x, z: HON.z + 6 };   // 旗本は幕の内で家康を囲む（幕の外の後ろへ退くと、本人も旗本も幕に阻まれる）
      rt.say('旗本', '上様、お退きを！', 2.6);
    }
  },

  onKill(rt, v, killer) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v === F.ieyasu && !F.ending) this.win(rt);
  },
  lose() {},

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.side.push('徳川家康を討った'); }, '家康を討ち取った');
    for (const g of rt.army.groups) if (g.team === 1 && alive(g)) { g.fleeing = true; g.routed = true; for (const u of g.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: 1 }; u.target = null; u.atk = null; } }
    rt.player.u.invuln = true;
    F._mySay = true; rt.after(2.5, () => { F._mySay = true; rt.say('真田信繁', '日の本一の兵、ここにあり！', 3.2); });
    rt.finish({ scriptedEnd: true }, 9);
  },
});
// bot の頭（act bot で確かめる）：家康へまっすぐ駆け、行く手を塞ぐ者だけ払う。命が三割五分を切ったら茶臼山の側へ退いて息を整える
x15_sanada.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  const R = b._x15 || (b._x15 = { rest: false, t: b.t, x: u.pos.x, z: u.pos.z, until: 0, wx: 0, wz: 0, n: 0 });
  if (b.t < R.until) { goTo(p, inp, R.wx, R.wz, 2); return; }
  if (b.t - R.t >= 15) { if (Math.hypot(u.pos.x - R.x, u.pos.z - R.z) < 3 && !u.hit) { R.n++; R.wx = u.pos.x + (R.n % 2 ? 14 : -14); R.wz = u.pos.z + 4; R.until = b.t + 5; } R.t = b.t; R.x = u.pos.x; R.z = u.pos.z; }
  // 退く時は、味方の赤備えの後ろ（無ければ茶臼山の麓）へ。三十秒か命六割で戻る（act bot 0120：一騎で越前勢の前を退いて囲まれ256秒で倒れた）
  const lead = () => { const I0 = F.ieyasu, at = I0?.alive ? I0.pos : HON; let best = null, bd = 1e9; for (const g of [F.nobu, F.sanada, F.sanada2, F.sanada3, F.katsu, F.mori]) { if (!alive(g) || !g._charge) continue; const c = g.center ? g.center() : null; if (!c) continue; const d = Math.hypot(c.x - at.x, c.z - at.z); if (d < bd) { bd = d; best = c; } } return best; };
  if (!R.rest && u.hp < u.maxHp * 0.35) { R.rest = true; R.restT = b.t; R.restN = (R.restN || 0) + 1; }
  if (R.rest) { if (u.hp > u.maxHp * 0.6 || b.t - R.restT > 30) R.rest = false; else { const c = lead(); const I1 = F.ieyasu, at = I1?.alive ? I1.pos : HON; if (c) { const dx = c.x - at.x, dz = c.z - at.z, l = Math.hypot(dx, dz) || 1; goTo(p, inp, c.x + dx / l * 16, c.z + dz / l * 16, 3); } else goTo(p, inp, START.x, START.z - 10, 3); return; } }
  const I = F.ieyasu;
  const hit = (t, r = 2.6) => {
    const a = strikeTarget ? strikeTarget(b, 4) : null, e = a && a !== t && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 3.5 ? a : t;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > r) { goTo(p, inp, e.pos.x, e.pos.z, 2); return; }
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (patientStrike) patientStrike(p, inp, e, d); else if (Math.random() < 0.5) inp.leftPressed = true;
  };
  if (I?.alive && Math.hypot(I.pos.x - u.pos.x, I.pos.z - u.pos.z) < 14) { hit(I, p.mounted ? 3.2 : 2.6); return; }
  const e0 = b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.invuln);
  if (e0) { hit(e0); return; }
  // 天王寺と同じ順：毛利の突撃（段1・2）の間は茶臼山の陰で待ち（麓の前は越前勢の鉄砲が届いた・act bot 0120 の123秒）、②の真田の突撃（段3）で赤備えと共に駆け出す
  if ((F.xs || 0) < 3) { goTo(p, inp, START.x, START.z - 24, 4); return; }
  // 隊が本人より後ろ（四天王寺の前で止まった毛利など）なら付かずに家康へ（act bot 0150：四天王寺の前で三分待った）
  // 駆ける時は、家康に一番近い味方の突撃の隊の少し後ろに付く（一騎で先に敵の列へ入ると囲まれる）。隊が家康の三十m に入ったら、家康へ
  const at = I?.alive ? I.pos : HON, c = lead();
  if (c && Math.hypot(c.x - at.x, c.z - at.z) > 30 && Math.hypot(c.x - at.x, c.z - at.z) < Math.hypot(u.pos.x - at.x, u.pos.z - at.z) + 10 && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 30) { const dx = c.x - at.x, dz = c.z - at.z, l = Math.hypot(dx, dz) || 1; goTo(p, inp, c.x + dx / l * 5, c.z + dz / l * 5, 3); return; }
  goTo(p, inp, at.x, at.z, 2);
};
STAGES.x15_sanada = [['家康を討つ']];

export { x15_sanada };
export default x15_sanada;
