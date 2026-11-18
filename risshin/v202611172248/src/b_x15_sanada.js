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
import { allyGroup } from './bhelp.js';

BATTLE_ASSETS.x15_sanada = BATTLE_ASSETS.k15_tennoji_okayama;

const CHAUSU = { x: -106, z: 4 };    // 茶臼山（真田の陣・本人の出る所）
const HON = { x: -40, z: 165 };      // 家康の本陣
const START = { x: -104, z: 16 };
const RET = { x: -40, z: 218 };      // ② 家康の退く先（本陣の南・幕の後ろ。徳川方の逃げる縁 z240 の手前）
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
  victoryCaption: '家康を討ち取った',   // 11/18 kaito K295 ⑦：勝ちの字の下（victory_card.js）
  // 本人の見た目：真田信繁（赤備え・鹿角の兜・六文銭の旗。player.js の def.playerLook）
  playerLook: { ...GENERALS['真田信繁'], face: 'player', hero9: 0, real: 1, sode: true, hatColor: SANADA.armor, shu: 1, flag: 'sanada', mon: 'sanada', menpo: 0x7a1c14, menpoStyle: 'hanbo' },
  world: { ...base.world, playerHorse: true, fleeOut: (x, z, team) => (team === 1 ? z > 240 : z < -200) },   // 逃げる先も入れ替える（徳川方は南・豊臣方は城の北）
  botStat(rt) { try { const F = rt.flags, I = F.ieyasu; let a = 0, e = 0; for (const o of rt.army?.units || []) if (o.alive && !o.isStruct) { if (o.team === 0) a++; else if (o.team === 1) e++; } return `${TR.join(' ')}｜段${F.xs || 0}・家康 ${I ? (I.alive ? '生' + Math.round(I.hp) + '/' + Math.round(I.maxHp) : '討') : '無'}・本物 味方${a} 敵${e}・跡 ${(F._tr || []).join(' ')}・号令 ${F.sCmd || '無'}×${F.sCmdN || 0}・真田の備 ${(() => { const P = rt.player?.u; const gs = D.sGroups(rt); let n = 0, m = 0; for (const g of gs) { n += g.count; const c = g.center?.(); if (P && c && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 45) m += g.count; } return gs.length + '備' + n + '人・本人の45m内' + m; })()}・家康退く ${F.ieRet ? Math.round(F.ieRetT) + '秒' : '無'}・守りの新手 ${F.gdN || 0}・毛利の加勢 ${F.moriH ? Math.round(F.moriHT) + '秒' : '無'}`; } catch (e) { return 'botStat ' + e.message; } },
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
    // ⑥ 本人の組（天王寺では徳川方の黒の具足）も真田の赤備え（赤の具足・赤の陣笠・六文銭の旗）に
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), armor: SANADA.armor, lace: SANADA.lace, hatColor: SANADA.armor, helm: SANADA.armor, ...(e.o?.flag !== null ? { flag: SANADA.flag } : {}) } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { army.spawn = sp0; });
    base.setup.call(this, rt);
    const F = rt.flags;
    // 本人が真田信繁：天王寺の信繁（真田の旗本の将）の座に本人が入る（二人の信繁を並べない）
    { const N = F.nobuU; if (N) { try { N.invuln = false; army.despawn ? army.despawn(N) : (N.alive = false); } catch (e) { N.alive = false; } } F.nobuU = null; }
    if (rt.G?.practice) rt.G.name = '真田信繁';
    if (rt.player?.u) { rt.player.u.name = '真田信繁'; rt.player.u.faction = 'toyotomi'; }
    // 家康は天王寺と同じ床几・旗本の守り。命だけは天王寺の九倍（討たれない為の厚さ）を四分の一に（任務が「家康を討つ」なので。act bot 0125：命4104で、赤備えが本陣へ届いても減らなかった）
    if (F.ieyasu) F.ieyasu.hp = F.ieyasu.maxHp = Math.round(F.ieyasu.maxHp / 4);
    F.xs = 0; F.xT0 = rt.t;
    // 11/18 kaito K295 ①：号令（ついて来い・突っ込め・止まれ・退け）は本人の組だけでなく、真田の旗の備（赤備え）すべてに届く。毛利・大野ら他の豊臣方は従わない
    const P0 = rt.player;
    if (P0 && P0.command && !P0._x15cmd) { const c0 = P0.command; P0._x15cmd = true; P0.command = (id) => { this.sCmd(rt, id); return c0.call(P0, id); }; }
    // ⑦ 結果の札の「勝ち：」の訳も「家康を討ち取った」（総大将の仕組みの「敵の大将が討たれた」にしない）。勝った後の右上の空の黒い箱（任務の行の枠）を隠す
    if (!rt._x15fin) { rt._x15fin = true; const f0 = rt.finish; rt.finish = function (info, d) { const r = f0.call(this, info, d); if (this.result && !this.result.down && this.tracker?.main === true) this.result.outcomeReason = '家康を討ち取った'; return r; }; }
    if (typeof document !== 'undefined' && !document.getElementById('x15-style')) { const st = document.createElement('style'); st.id = 'x15-style'; st.textContent = 'html:root body:has(#victory-card) #hud#hud#hud#hud#hud #h-prog#h-prog#h-prog#h-prog .pg-goals{display:none !important}html:root body:has(#victory-card) #hud#hud#hud#hud#hud #h-prog#h-prog#h-prog#h-prog:not(:has(#armybar:not([hidden]))){display:none !important}html:root body:has(#victory-card) #hud#hud#hud#hud#hud #h-prog#h-prog#h-prog#h-prog.goal-mode{display:none !important}'; document.head.appendChild(st); rt.cleanupTasks?.add(() => st.remove()); }
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
    // 11/18 K295「3分で勝ちはおかしい」：段の時は天王寺の通し（act bot・任務の流れ）に合わせる＝①10秒 → 本多忠朝の討死 → ②232秒 真田と毛利の突撃 → ③372秒 二の突撃・馬印が倒れる → ④532秒 残る兵の全てで本陣へ
    const T = { 2: 90, 3: 232, 4: 372, 5: 532 };
    const next = () => { if (T[n + 1]) rt.after(Math.max(1, T[n + 1] - (rt.t - F.xT0)), () => this.xStage(rt, n + 1)); };
    if (n === 1) { run(() => base.stage1.call(this, rt)); this.mySay(rt, 12, '大助、城へ戻り殿をお守りせよ。ここは父が引き受ける。', 3.2); }
    if (n === 2) run(() => base.tadatomo.call(this, rt));
    if (n === 3) { run(() => base.stage2.call(this, rt)); this.goNobu(rt); this.mySay(rt, 4, '赤備え、続け！　家康の本陣へ駆け入る！', 3); }
    if (n === 4) { run(() => base.stage3.call(this, rt)); this.mySay(rt, 8, '金扇の馬印が倒れたぞ！　家康は近い！', 3); }
    if (n === 5) { F.step = 4; this.allIn(rt); this.mySay(rt, 2, '残る者、一人残らず続け！　家康の首ただ一つ！', 3.2); }
    next();
  },
  // ④ 天王寺の「信繁の最後の突撃」（hq_rush.js：真田も毛利も残る兵が皆ひと塊になって家康へ一直線）を、本人が先頭で率いる
  allIn(rt) {
    const F = rt.flags, I = F.ieyasu;
    for (const g of rt.army.groups) {
      if (g.team !== 0 || !alive(g) || g.isPlayerSquad || !/^(真田|毛利|木村|後藤)/.test(g.name || '')) continue;
      g.stay = false; g.noRout = true; g.morale = 100; g.formation = 'gyorin';
      for (const u of g.units) if (u.alive && u.type === 'gun' && !u.sidearm) { u.gunAmmo = 0; u.target = null; u.atk = null; }
      base.charge.call(this, rt, g, 4, I?.alive ? I.pos : HON);
    }
  },
  // 真田の備（真田の旗・赤備え）＝本人の号令の届く備。天王寺の F.sanada・nobu・sanada2・sanada3 と、名に「真田」の付く豊臣方の備
  sGroups(rt) { const F = rt.flags, o = []; if (!rt.army) return o; for (const g of [F.nobu, F.sanada, F.sanada2, F.sanada3]) if (alive(g)) o.push(g); for (const g of rt.army.groups) if (g.team === 0 && alive(g) && !g.isPlayerSquad && !o.includes(g) && /真田/.test(g.name || '')) o.push(g); return o; },
  sCmd(rt, id) {
    const F = rt.flags;
    if (!['follow', 'attack', 'hold', 'retreat'].includes(id)) return;
    F.sCmd = id; F.sCmdT = rt.t; F.nobuGo = true; F.sCmdN = (F.sCmdN || 0) + 1;
    for (const g of this.sGroups(rt)) this.sApply(rt, g, id, true);
  },
  sApply(rt, g, id, now) {
    const P = rt.player?.u; if (!P) return;
    const h = rt.player.travelH ?? P.heading ?? 0;
    if (id === 'attack') { if (!g._charge || now) base.charge.call(this, rt, g, 8); return; }
    g._charge = false; g.allOutRun = true; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; g.routed = false; g.morale = Math.max(g.morale || 0, 90);
    if (id === 'hold') { if (now) { const c = g.center(); g.anchor = { x: c.x, z: c.z }; } g.stay = true; g.aggro = 6; g.seekRange = 8; return; }
    // ついて来い：本人の後ろ（備ごとに左右へずらす）。退け：本人の後ろの遠く（茶臼山の方）
    const k = this.sGroups(rt).indexOf(g), side = (k % 2 ? 1 : -1) * (8 + 6 * (k >> 1)), back = id === 'retreat' ? 30 : 12;
    g.stay = id === 'retreat'; g.aggro = id === 'retreat' ? 3 : 6; g.seekRange = g.aggro + 4;
    g.anchor = { x: P.pos.x - Math.sin(h) * back + Math.cos(h) * side, z: P.pos.z - Math.cos(h) * back - Math.sin(h) * side }; g.facing = h;
  },
  guard(rt) {
    const F = rt.flags; if (F.xs < 2) return;
    let n = 0; for (const o of rt.army.units) if (o.alive) n++;
    const at = F.ieRet && F.ieyasu?.alive ? F.ieyasu.pos : HON;
    const slots = [{ x: at.x, z: at.z - 22 }, { x: at.x - 24, z: at.z - 4 }, { x: at.x + 24, z: at.z - 4 }];
    F.gd ||= [null, null, null];
    slots.forEach((sl, i) => {
      const g = F.gd[i];
      if (alive(g)) { g.anchor = { x: sl.x, z: sl.z }; if (g.order !== 'move') { g.order = 'hold'; g.stay = true; } }
      let k = 0; for (const o of rt.army.units) if (o.alive && o.team === 1 && !o.fleeing && Math.hypot(o.pos.x - sl.x, o.pos.z - sl.z) < 13) k++;
      if (k >= 6 || (alive(g) && g.count >= 5) || (F.gdN || 0) >= 14 || n > (rt.game?.touch ? 290 : 360)) return;
      F.gdN = (F.gdN || 0) + 1;
      const TK = { armor: 0x48443e, flag: 'tokugawa' };
      const ng = allyGroup(rt, { faction: 'tokugawa', name: '旗本の新手', anchor: { x: at.x + (i - 1) * 10, z: Math.min(232, at.z + 30) }, facing: Math.PI, width: 10, aggro: 10, seekRange: 14, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
        [{ type: 'samurai', n: 4, o: { ...TK } }, { type: 'ashigaru', n: 10, o: { ...TK } }]);
      if (!ng) return;
      ng.team = 1; ng.defMult = 1.2; ng.dmgMult = 0.6; ng.stay = true; ng.allOutRun = true; F.gd[i] = ng;
      ng.order = 'move'; ng.anchor = { x: sl.x, z: sl.z }; ng.dest = { x: sl.x, z: sl.z }; ng.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
    });
  },
  moriHelp(rt) {
    const F = rt.flags; if (F.xs < 3) return;
    const gs = this.sGroups(rt); let n = 0, cx = 0, cz = 0;
    for (const g of gs) { n += g.count; const c = g.center?.(); if (c) { cx += c.x * g.count; cz += c.z * g.count; } }
    F.s0 = Math.max(F.s0 || 0, n);
    if (!n) return;
    cx /= n; cz /= n;
    let foe = 0; for (const o of rt.army.units) if (o.alive && o.team === 1 && !o.fleeing && Math.hypot(o.pos.x - cx, o.pos.z - cz) < 30) foe++;
    if (!F.moriH && (n < F.s0 * 0.6 || foe > n)) { F.moriH = true; F.moriHT = rt.t; F.moriHN = (F.moriHN || 0) + 1; rt.say('毛利勝永', '真田殿を見殺しにするな！　毛利勢、続け！', 2.8); }
    if (!F.moriH) return;
    for (const g of [F.katsu, F.mori, F.kimura]) if (alive(g)) { base.charge.call(this, rt, g, 10, { x: cx, z: cz }); g.stay = false; }
  },
  // 本人の旗本（天王寺の「真田信繁の旗本」）は本人と共に家康の本陣へ
  goNobu(rt) { const F = rt.flags; if (F.nobuGo) return; F.nobuGo = true; for (const g of [F.nobu, F.sanada]) if (alive(g)) { g.stay = false; base.charge.call(this, rt, g, 8); } },

  update(rt, dt) {
    base.update.call(this, rt, dt);   // 天王寺の野の動き（音・霧・枠・柵・陣・旗）。sideFlip で段の筋の手前まで
    const F = rt.flags;
    if (F.ending) return;
    this.makuSlide(rt, dt); this.fenceSlide(rt, dt); this.unstick(rt, dt);
    const P = rt.player?.u, I = F.ieyasu;
    // 天王寺の増援（refill：徳川の先手・二陣・旗本の新手、②の毛利の新手、③の明石の別働隊）も天王寺と同じに回す。側は addGroup の包みで入れ替わる。
    //   本人のまわりへ置く二つ（本人の前の「毛利の新手」・後ろの「徳川の新手」）は徳川方の本人向けで、側を入れ替えると本人の味方が減るたびに敵が湧き、
    //   味方12・敵250 で茶臼山に二十分押し込められた（act bot 0207）→ 本人の居所を見ない写し（本人を討たれた者に見せる）で呼ぶ
    if (F.step >= 1 && F.step <= 4) { try { const r2 = Object.create(rt); r2.player = { u: { alive: false, team: 0, pos: { x: 0, y: 0, z: 0 } } }; this.refill(r2); } catch (e) { if (!F._rfErr) { F._rfErr = true; console.warn('x15 refill', e); } } }
    // 天王寺と同じく、家康は③で馬に乗るまで床几に座ったまま（pressure の初めの一行）
    if (I?.alive && I._crouch && !I.mounted && F.seat) { I.pos.x = F.seat.x; I.pos.z = F.seat.z; if (!(P && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 4)) { I.target = null; I.atk = null; } I.moveTo = null; }
    if (P && (F._trT = (F._trT || 0) + dt) > 60) { F._trT = 0; if (rt.t < 61) TR.length = 0; TR.push(`${Math.round(rt.t)}:${F.xs}:(${Math.round(P.pos.x)},${Math.round(P.pos.z)})${Math.round(P.hp)}/I(${I ? Math.round(I.pos.x) + ',' + Math.round(I.pos.z) + ':' + Math.round(I.hp) : '-'})L(${(() => { const g = [F.nobu, F.sanada, F.sanada2].find(alive); const c = g?.center?.(); return c ? Math.round(c.x) + ',' + Math.round(c.z) + ':' + g.count : '-'; })()})`); }
    // 家康は本陣の陣幕の内（床几の場の奥の幕 z177 の手前）から外へ退かない（act bot 0125：z238 の縁まで退いた。0141：幕の後ろ z195 へ退き、本人は幕の内で幕に阻まれ五分届かなかった）
    // ② 11/18 kaito K295：前線が崩れ本陣が危うくなったら（本人が四十m に迫る・本陣の六十m の内の徳川方が三十を割る）、家康は旗本に守られ幕の後ろの口から南へ退く（追わないと討てない）。退く先 RET で止まる
    if (I?.alive && !F.ieRet && P && (F._ieT = (F._ieT || 0) + dt) > 1) { F._ieT = 0; let n = 0; for (const o of rt.army.units) if (o.alive && o.team === 1 && !o.fleeing && Math.hypot(o.pos.x - HON.x, o.pos.z - HON.z) < 60) n++; if (Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 40 || (F.xs >= 3 && n < 30)) { F.ieRet = true; F.ieRetT = rt.t; rt.say('旗本', '上様、お退きを！　ここは我らが！', 2.6); } }
    const IA = F.ieRet ? RET : { x: HON.x, z: HON.z + 6 };
    if (I?.alive && F.ieRet) {
      // 幕の内なら先に後ろの口（HON.x, 幕の後ろ）へ、出たら退く先へ。歩み（馬より遅い）
      const inMaku = Math.abs(I.pos.x - HON.x) < 8.6 && I.pos.z < HON.z + 13;
      const w = inMaku ? (Math.abs(I.pos.x - HON.x) > 1.5 ? { x: HON.x, z: I.pos.z } : { x: HON.x, z: HON.z + 15 }) : RET;
      if (Math.hypot(w.x - I.pos.x, w.z - I.pos.z) > 1.5 && !I.atk) { I.target = null; I.moveTo = { x: w.x, z: w.z }; I.allOutRun = false; }
      if (alive(F.hon)) { F.hon.stay = true; F.hon.anchor = { x: I.pos.x, z: I.pos.z + 3 }; }
    } else if (I?.alive && I.pos.z > HON.z + 9) { I.pos.z = HON.z + 9; if (I.moveTo && I.moveTo.z > HON.z + 9) I.moveTo = null; }
    // 本人が茶臼山を下りたら、旗本も共に駆ける（待たせない）
    if (P && !F.nobuGo && F.xs >= 1 && Math.hypot(P.pos.x - START.x, P.pos.z - START.z) > 30) this.goNobu(rt);
    // ①号令の後は二秒ごとに付け直す（天王寺の段が真田の備を勝手に突撃させても、止まれ・ついて来いを守る）。号令が無い時も、本人が茶臼山を下りたら真田の備は後ろで遊ばず本人の傍の前線へ集まる
    if ((F._sT = (F._sT || 0) + dt) > 2) { F._sT = 0; const id = F.sCmd; for (const g of this.sGroups(rt)) { if (id) this.sApply(rt, g, id, false); else if (F.xs >= 1 && !g._charge && P && Math.hypot(P.pos.x - START.x, P.pos.z - START.z) > 30) this.sApply(rt, g, 'follow', false); } }
    // ③ 徳川方の厚み：本陣の前・左・右の三つの守りの持ち場に、徳川方が六人を割ったら後ろ（本陣の南）から新手の備を繰り出して埋める（最後まで守りが残る・迂回が簡単に通らない）。本物の兵の上限の内で、十四備まで
    if ((F._gdT = (F._gdT || 0) + dt) > 5) { F._gdT = 0; try { this.guard(rt); } catch (e) { console.warn('x15 guard', e); } }
    // ④ 真田隊が押されたら（真田の備が初めの六割を割る・真田の備の傍に徳川方が真田より多い）毛利勢（勝永の本隊・先手・木村）が加勢に来る
    if ((F._mhT = (F._mhT || 0) + dt) > 4) { F._mhT = 0; try { this.moriHelp(rt); } catch (e) { console.warn('x15 mori', e); } }
    // 突撃の隊は家康の居所へ付いていく（三秒ごと）
    if (F.nobuGo && (F._reT = (F._reT || 0) + dt) > 3) { F._reT = 0; for (const g of [F.nobu, F.sanada, F.sanada2, F.sanada3]) if (alive(g) && g._charge && !(F.sCmd && F.sCmd !== 'attack')) { const at = I?.alive ? I.pos : HON; g.anchor = { x: at.x, z: at.z }; } }
    // 11/18 K295「3分で勝ち」：天王寺の家康は②の突撃では討たれない（床几のまま旗本に守られ、③で馬印が倒れて初めて危うくなる）。③までは命を六割より下げない
    if (I?.alive && F.xs < 4) I.hp = Math.max(I.hp, I.maxHp * 0.6);
    // 迫られた家康は自ら太刀を取る。本陣から四十m より離れたら旗本の持ち場へ戻す
    if (I?.alive) { if (I.fleeing) { I.fleeing = false; I.moraleFleeDir = null; } if (alive(F.hon) && Math.hypot(I.pos.x - IA.x, I.pos.z - IA.z) > 40) { I.target = null; I.atk = null; } else if (P?.alive && !I.target && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 4) { I._crouch = false; I.target = P; } }
    if (!F.flee && P && I?.alive && Math.hypot(P.pos.x - I.pos.x, P.pos.z - I.pos.z) < 30) {
      F.flee = true;
      if (alive(F.hon) && !F.ieRet) F.hon.anchor = { x: HON.x, z: HON.z + 6 };
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
  // 茶臼山で待つ間・退いて息を整える間は止まっていてよい（待つ間に十四歩ずつ東へ揺れ、徳川の手勢の前へ出て76秒で倒れた）
  if (b.t - R.t >= 15) { if ((F.xs || 0) >= 3 && !R.rest && Math.hypot(u.pos.x - R.x, u.pos.z - R.z) < 3 && !u.hit) { R.n++; R.wx = u.pos.x + (R.n % 2 ? 14 : -14); R.wz = u.pos.z + 4; R.until = b.t + 5; } R.t = b.t; R.x = u.pos.x; R.z = u.pos.z; }
  // 退く時は、味方の赤備えの後ろ（無ければ茶臼山の麓）へ。三十秒か命六割で戻る（act bot 0120：一騎で越前勢の前を退いて囲まれ256秒で倒れた）
  const lead = () => { const I0 = F.ieyasu, at = I0?.alive ? I0.pos : HON; let best = null, bd = 1e9; for (const g of [F.nobu, F.sanada, F.sanada2, F.sanada3, F.katsu, F.mori]) { if (!alive(g) || !g._charge) continue; const c = g.center ? g.center() : null; if (!c) continue; const d = Math.hypot(c.x - at.x, c.z - at.z); if (d < bd) { bd = d; best = c; } } return best; };
  if (!R.rest && u.hp < u.maxHp * 0.35) { R.rest = true; R.restT = b.t; R.restN = (R.restN || 0) + 1; }
  if (R.rest) { if (u.hp > u.maxHp * 0.6 || b.t - R.restT > 30) R.rest = false; else { const c = lead(); const I1 = F.ieyasu, at = I1?.alive ? I1.pos : HON; if (c) { const dx = c.x - at.x, dz = c.z - at.z, l = Math.hypot(dx, dz) || 1; goTo(p, inp, c.x + dx / l * 16, c.z + dz / l * 16, 3); } else goTo(p, inp, START.x, START.z - 10, 3); return; } }
  // ①の確かめ：茶臼山を下りる時に「ついて来い」、真田の突撃（段3）で「突っ込め」
  if (!R.c1 && (F.xs || 0) >= 1 && b.t > 25) { R.c1 = true; p.command?.('follow'); }
  if (!R.c2 && (F.xs || 0) >= 3) { R.c2 = true; p.command?.('attack'); }
  const I = F.ieyasu;
  const hit = (t, r = 2.6) => {
    const a = strikeTarget ? strikeTarget(b, 4) : null, e = a && a !== t && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 3.5 ? a : t;
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    r = Math.min(r, (p.weapon === 'sword' ? 1.9 : 2.8) - 0.25);   // 11/18：寄る間合いが手の届く間合い（刀1.9・槍2.8）より遠く、798秒のあいだ一度も突かなかった
    if (d > r) { if (e !== I && (b.flags.xs || 0) >= 3) return false; goTo(p, inp, e.pos.x, e.pos.z, 2); return; }   // 突撃の後は、家康のほかは追わない（打ち掛かる者を追って北へ百m 引かれ、家康へ着かず1086秒で倒れた）
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (patientStrike) patientStrike(p, inp, e, d); else if (Math.random() < 0.5) inp.leftPressed = true;
  };
  if (I?.alive && Math.hypot(I.pos.x - u.pos.x, I.pos.z - u.pos.z) < 14) { hit(I, p.mounted ? 3.2 : 2.6); return; }
  // 打ち掛かって来る者と、すぐ前を塞ぐ者だけ払う（城へ向かう越前勢の列を追って西の際へ引かれ、囲まれて286秒で倒れた）
  const e0 = b.army.nearestEnemy(u, 3.5, (o) => !o.fleeing && !o.invuln && (o.target === u || o.atk?.target === u || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 2));
  if (e0 && hit(e0) !== false) return;
  // 天王寺と同じ順：毛利の突撃（段1・2）の間は茶臼山の陰で待ち（麓の前は越前勢の鉄砲が届いた・act bot 0120 の123秒）、②の真田の突撃（段3）で赤備えと共に駆け出す
  if ((F.xs || 0) < 3) { goTo(p, inp, START.x, START.z - 24, 4); return; }
  // 隊が本人より後ろ（四天王寺の前で止まった毛利など）なら付かずに家康へ（act bot 0150：四天王寺の前で三分待った）
  // 駆ける時は、家康に一番近い味方の突撃の隊の少し後ろに付く（一騎で先に敵の列へ入ると囲まれる）。隊が家康の三十m に入ったら、家康へ
  // ②家康が幕の後ろへ退いたら、幕の脇を回って追う（幕の内から布に阻まれない）
  if (I?.alive && I.pos.z > HON.z + 12 && u.pos.z < HON.z + 13 && u.pos.z > HON.z - 14 && Math.abs(u.pos.x - HON.x) < 13) { goTo(p, inp, HON.x + (u.pos.x < HON.x ? -14 : 14), HON.z + 16, 3); return; }
  const at = I?.alive ? I.pos : HON, c = lead();
  if (c && Math.hypot(c.x - at.x, c.z - at.z) > 30 && Math.hypot(c.x - at.x, c.z - at.z) < Math.hypot(u.pos.x - at.x, u.pos.z - at.z) + 10 && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > 30) { const dx = c.x - at.x, dz = c.z - at.z, l = Math.hypot(dx, dz) || 1; goTo(p, inp, c.x + dx / l * 5, c.z + dz / l * 5, 3); return; }
  goTo(p, inp, at.x, at.z, 2);
};
STAGES.x15_sanada = [['家康を討つ']];

export { x15_sanada };
export default x15_sanada;
