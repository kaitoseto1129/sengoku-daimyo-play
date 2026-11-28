// ======================================================================
// もしも編 一戦目「長篠、家康の裏切り」（天正三年〔1575〕五月二十一日・もしも）（K664・K671・docs/chapter_if.md の頭の 1）
//   史実：織田と徳川は設楽原に馬防柵を三重に結び、鉄砲で武田勝頼を破った（『信長公記』『甲陽軍鑑』）。
//   もしも：柵の南を守る徳川勢が、前もって武田と通じていた。南の空に狼煙が上がると旗を返し、柵の内から織田へ攻めかかる。
//   自分：織田の足軽。徳川の加勢の隣の柵の持ち場（大宮前）に居る。
//
// 作り（武田編 d11 と同じ型・K661）：織田家編の設楽原（b_shitaragahara.js）の setup・update を丸ごと呼ぶ。側は入れ替えない（odaPost で織田の持ち場）。
//   出来事①夜明けの物見を撃ち退ける ②真田の第一波を柵で止める は元の戦の段のまま（元の任務の札・印・台詞・bot の手）。
//   真田が崩れた所（元の段 2）で狼煙が上がり、ここから先はこの紙の四つの段：
//   ③隣の徳川の加勢が槍を向ける ④柵の内の切れ目で徳川の突破を止める ⑤野々村の鉄砲組を南へ向け直し退く道を開ける
//   ⑥茶臼山へ退く道で、追う本多忠勝・大久保の手から信長の馬廻を守る。勝ち＝信長が極楽寺山へ退く。負け＝馬廻が崩れ本陣が落ちる。
//   裏切りの後は、元の戦の織田・徳川の本人への任務・印・褒美・台詞・bot の手を出さない（d11 と同じ漉し）。武田の寄せは元のまま続く。
// 布陣は docs/fujin/shitaragahara.md（徳川の加勢一組だけ足した）。旅の紙 docs/journey/if01_nagashino.md。
// ======================================================================
import { BATTLE_ASSETS } from './asset_manifest.js';
import { shitaragahara as base, SHITARA_AT } from './b_shitaragahara.js';
import { allyGroup, enemyGroup } from './bhelp.js';
import { isEn, addEn } from './i18n.js';

if (BATTLE_ASSETS.shitaragahara) BATTLE_ASSETS.if01_nagashino = BATTLE_ASSETS.shitaragahara;

const FX = SHITARA_AT.fenceX, GAP = SHITARA_AT.gap, OMIYA = SHITARA_AT.gates[0];
const IN_X = FX - 2 * GAP;                                  // 三の柵（一番内）の線
const KASE = { x: IN_X - 12, z: OMIYA + 30 };               // 徳川の加勢の持ち場（本人の南・三の柵の内）
const KIRE = { x: IN_X - 4, z: OMIYA + 4.5 };               // 大宮前の三の柵の口（内から崩された切れ目）
const OKUBO_IN = { x: IN_X - 16, z: OMIYA + 75 };           // 切れ目へ来る徳川の手の出所（柵の内を南から）
const ISHI_IN = { x: IN_X - 22, z: OMIYA + 95 };            // 鉄砲を向け直した後に来る石川の手
const HQ = { x: -110, z: OMIYA + 30 };                      // 茶臼山へ退く道の口（信長の馬廻が待つ所）
const HONDA_IN = { x: HQ.x + 26, z: HQ.z + 34 };           // 本多・大久保の追い手の出所（本陣の口の南東。離れると本人が追って本陣を空けた・act bot 0524）
const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
const ODA = { flag: 'oda', armor: 0x3a3028 };
const alive = (g) => g && !g.routed && g.count > 0;
const center = (g) => (alive(g) ? g.center?.() : null);
// ⑤の行き先：大宮前の鉄砲組のうち一番内（三の柵）の組。一の柵の口の組を指すと、本人が柵の口で武田と斬り合い続けて退く道へ行けなかった（act bot 0528）
const innerGuns = (F) => (F.guns || []).filter((g) => alive(g) && g.team === 0 && g.anchor && Math.abs(g.anchor.z - OMIYA) < 60).sort((a, b) => a.anchor.x - b.anchor.x)[0] || null;
const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 1e9);

const OBJ = [
  '柵の内で武田の物見を撃ち退ける',
  '大宮前の柵で真田の第一波を止める',
  '旗を返した徳川の加勢を討て',
  '内から崩された柵の切れ目で、徳川の突破を止めよ',
  '野々村の鉄砲組を南へ向け直し、退く道を開けよ',
  '茶臼山へ退く道で、本多忠勝・大久保の手から信長の馬廻を守れ',
];
const NOUN = ['武田の物見', '大宮前の柵', '徳川の加勢', '柵の切れ目', '野々村の鉄砲組', '信長の馬廻'];

if (isEn()) addEn([
  ['天正三年（1575）五月二十一日　雨上がりの朝　三河国 設楽原（もしも）', 'Tensho 3 (1575), 21st day of the 5th month. Morning after rain. Shitaragahara, Mikawa (What if)'],
  ['長篠、家康の裏切り', 'Nagashino: Ieyasu Betrays'],
  ['三河国 設楽原（もしも）', 'Shitaragahara, Mikawa (What if)'], ['設楽原（もしも）', 'Shitaragahara (What if)'],
  ['もしも編', 'What-If Campaign'],
  ['織田軍', 'Oda army'], ['武田・徳川軍', 'Takeda & Tokugawa army'],
  ...OBJ.map((t, i) => [t, ['Drive off the Takeda scouts from inside the fence', 'Stop the first Sanada wave at the Omiya-mae fence', 'Defeat the Tokugawa men who turned their banners', 'Stop the Tokugawa breakthrough at the broken fence', 'Turn the Nonomura gunners south and open the way back', 'On the road to Chausuyama, guard Nobunaga\'s horse guard from Honda Tadakatsu and Okubo'][i]]),
  ['柵の内で、武田の物見を撃ち退けよ。隣の柵には徳川の加勢が並ぶ。', 'Drive off the Takeda scouts from inside the fence. Tokugawa men stand at the next fence.'],
  ['南の空に狼煙', 'Smoke rises in the southern sky'], ['徳川勢が旗を返す', 'The Tokugawa turn their banners'],
  ['信長、極楽寺山へ退く', 'Nobunaga falls back to Gokurakuji-yama'], ['岐阜からの後詰を待つ', 'He waits for reinforcements from Gifu'],
  ['信長の本陣が落ちた', 'Nobunaga\'s headquarters fell'],
  ['徳川の加勢', 'Tokugawa reinforcements'], ['大久保忠佐の手', 'Okubo Tadasuke\'s men'], ['石川数正の手', 'Ishikawa Kazumasa\'s men'],
  ['本多忠勝の手', 'Honda Tadakatsu\'s men'], ['大久保忠世の手', 'Okubo Tadayo\'s men'], ['信長の馬廻', 'Nobunaga\'s horse guard'],
  ['南の空に狼煙じゃ……何の合図じゃ？', 'Smoke in the southern sky... what signal is that?'],
  ['徳川勢、旗を返したぞ！　槍がこちらを向いておる！', 'The Tokugawa have turned! Their spears face us!'],
  ['家康め、武田と通じておったか！　柵の内で討て！', 'Ieyasu was in league with Takeda! Cut them down inside the fence!'],
  ['柵の口が内から破られた！　徳川の手が来るぞ！', 'The fence gate is broken from inside! Tokugawa men are coming!'],
  ['切れ目を塞げ！　ここを抜かれれば挟まれる！', 'Close the gap! If they break through, we are trapped!'],
  ['鉄砲、南へ向けよ！　徳川の手を撃て！', 'Guns, face south! Fire on the Tokugawa!'],
  ['退く道は開いた。殿、茶臼山へ！', 'The way back is open. To Chausuyama!'],
  ['本多平八郎じゃ！　信長の首、もらい受ける！', 'I am Honda Heihachiro! Nobunaga\'s head is mine!'],
  ['馬廻を守れ！　殿が退かれるまで、一歩も引くな！', 'Guard the horse guard! Not one step back until our lord withdraws!'],
  ['殿は極楽寺山へ退かれた。岐阜の後詰を待つぞ', 'Our lord has reached Gokurakuji-yama. We wait for Gifu.'],
  ['史実では、織田と徳川は馬防柵と鉄砲で武田勝頼を破った。', 'In history, Oda and Tokugawa defeated Takeda Katsuyori with palisades and guns.'],
]);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
// 裏切りの後は、元の本人の bot の手・退き道を使わない（行き先の印へ歩く共通の手）
for (const k of ['botRetreatWay', 'botDuel', 'botDbg', 'botStat']) {
  const f = base[k]; if (typeof f !== 'function') continue;
  D[k] = k === 'botRetreatWay' ? (b, back) => (b.flags.ifS >= 2 ? b.world.def.moveWay(b.army, b.player.u, back) : f(b, back)) : (b, ...r) => (b.flags.ifS >= 2 ? (k === 'botDbg' || k === 'botStat' ? '' : false) : f(b, ...r));
}

export const if01_nagashino = Object.assign(D, {
  id: 'if01_nagashino',
  key: 'if01_nagashino',
  odaPost: true,    // b_shitaragahara.js：織田家編でなくても織田の柵の持ち場に置く
  moshimo: true,    // もしもの戦（史実と混ぜない印）
  date: () => '天正三年（1575）五月二十一日　雨上がりの朝　三河国 設楽原（もしも）',
  intro: '柵の内で、武田の物見を撃ち退けよ。隣の柵には徳川の加勢が並ぶ。',
  introText: '柵の内で、武田の物見を撃ち退けよ。隣の柵には徳川の加勢が並ぶ。',
  introLords: ['織田信長', '武田勝頼'],
  history: '史実では、織田と徳川は馬防柵と鉄砲で武田勝頼を破った。もしも、柵の南を守る徳川勢が前もって武田と通じていたら――狼煙を合図に旗を返し、柵の内から織田へ攻めかかる。',
  sides: { a: { name: '織田軍', mon: 'oda', faction: 'oda' }, b: { name: '武田・徳川軍', mon: 'takeda', faction: 'takeda' } },
  taisho: { a: { name: '織田信長', use: true }, b: { name: '武田勝頼', def: true } },
  survives: [...(base.survives || []), '織田信長', '徳川家康', '武田勝頼', '本多忠勝'],
  victoryCaption: '信長、極楽寺山へ退く',
  missions: OBJ,
  missionOf(rt) { const s = rt.flags.ifS ?? -1; return s >= 2 ? s : base.missionOf.call(this, rt) <= 0 ? 0 : 1; },
  missionHeading(rt) { return OBJ[this.missionOf(rt)]; },
  goals5(rt0) {
    const S = (rt) => rt.flags.ifS ?? -1, won = (rt) => !!rt.flags.ifWon;
    return OBJ.map((text, k) => ({ kind: 'stage', k, text, noun: NOUN[k], sec: 0,
      check: k === 0 ? (rt) => !!rt.flags.nf?.t0 || S(rt) >= 2 : k === 1 ? (rt) => !!rt.flags.nf?.done?.[0] || S(rt) >= 2 : k === OBJ.length - 1 ? won : (rt) => won(rt) || S(rt) > k }));
  },
  missionPin(rt) {
    const F = rt.flags;
    if ((F.ifS ?? -1) < 2) return base.missionPin.call(this, rt);
    if (rt.over || !rt.player.u.alive || F.ifWon) return null;
    const pt = this.ifPin(rt); if (!pt) return null;
    const q = F.ifPinQ || (F.ifPinQ = { x: 0, z: 0, r: 6, hide: 4, hideDistance: 4 });
    q.x = pt.x; q.z = pt.z; q.enemy = !!pt.enemy;
    return q;
  },
  // bot（遊び手の代わり）：裏切りの前は元の戦の頭。後は金の▼へ歩き（柵の口は moveWay で回る）、打ち込む敵と、▼が敵の時は近い敵とだけ斬り合う。
  //   false を返すと playbot の設楽原の頭（shitaraBrain）が元の持ち場へ引き戻し、柵の口で動かなくなった（act bot 0528・0533）
  botBrain(b, inp, tools) {
    if ((b.flags.ifS ?? -1) < 2) return base.botBrain(b, inp, tools);
    const { goTo, patientStrike, strikeTarget } = tools, p = b.player, u = p.u;
    if (!u?.alive || b.flags.ifEnd) return true;
    inp.k.delete('KeyW'); inp.leftPressed = false;
    const q = this.missionPin(b);
    const e = strikeTarget?.(b, q?.enemy ? 9 : 3.5);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.6) goTo(p, inp, e.pos.x, e.pos.z, 2.2);
      else { p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); patientStrike(p, inp, e, d); }
      return true;
    }
    if (q) goTo(p, inp, q.x, q.z, 3);
    return true;
  },
  ifPin(rt) {
    const F = rt.flags, s = F.ifS;
    if (s === 2) return center(F.ifKase) ? { ...center(F.ifKase), enemy: true } : KASE;
    if (s === 3) return F.ifKireAt && center(F.ifOkubo) ? { ...center(F.ifOkubo), enemy: true } : KIRE;
    if (s === 4) return F.ifGunsAt && center(F.ifIshi) ? { ...center(F.ifIshi), enemy: true } : (center(innerGuns(F)) || { x: IN_X - 4, z: OMIYA - 10 });
    if (s === 5) { const c = F.ifHqAt && (center(F.ifHonda) || center(F.ifOkubo2)); return c && dist(c, HQ) < 30 ? { ...c, enemy: true } : HQ; }
    return null;
  },

  *setup(rt) {
    const army = rt.army;
    const obj0 = rt.obj, ow0 = rt.objDone, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner, fin0 = rt.finish;
    const after = () => (rt.flags.ifS ?? -1) >= 2;
    // 裏切りの後は元の筋の任務・褒美・台詞・見出しを出さない（この戦の物だけ）
    rt.obj = (id, ...r) => (!after() || rt.flags._ifObj ? obj0.call(rt, id, ...r) : undefined);
    rt.objDone = (id, ...r) => (!after() || rt.flags._ifObj ? ow0.call(rt, id, ...r) : undefined);
    rt.award = (f, ...r) => (!after() || rt.flags._ifObj ? aw0.call(rt, f, ...r) : undefined);
    rt.say = (who, text, ...r) => (!after() || rt.flags._ifSay ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (!after() || rt.flags._ifSay ? ban0.call(rt, t, s, ...r) : undefined);
    // 元の終わり（nfEnd）は織田・徳川の勝ちの締め。この戦は自分の段で締める
    rt.finish = (info = {}, ...r) => { if (info.scriptedEnd && !rt.flags.ifEnd && rt.player?.u?.alive) return; return fin0.call(rt, info, ...r); };
    rt.cleanupTasks?.add(() => { rt.obj = obj0; rt.objDone = ow0; rt.award = aw0; rt.say = say0; rt.banner = ban0; rt.finish = fin0; });
    { const r = base.setup.call(this, rt); if (r && typeof r.next === 'function') yield* r; }
    const F = rt.flags;
    F.ifS = -1;
    // 徳川の加勢：本人の南の三の柵の内に、東（柵）を向いて並ぶ。狼煙までは味方
    try {
      F.ifKase = allyGroup(rt, { faction: 'tokugawa', name: '徳川の加勢', fixed: true, fullStrength: true, noGuard: true, noRetinue: true, anchor: { ...KASE }, facing: Math.PI / 2, width: 8, aggro: 6, formation: 'yari' },
        [{ type: 'samurai', n: 2, o: { ...TOKU } }, { type: 'ashigaru', n: 9, o: { ...TOKU } }]);
    } catch (e) { console.warn('if01 加勢', e); }
  },
  ifObj(rt, text) { const F = rt.flags; F._ifObj = true; try { rt.objDone('pursue'); rt.obj('pursue', text, 'main', true); } finally { F._ifObj = false; } },
  ifSay(rt, at, who, text, d = 3.2) { rt.after(at, () => { if (rt.flags.ifEnd) return; rt.flags._ifSay = true; try { rt.say(who, text, d); } finally { rt.flags._ifSay = false; } }); },
  ifBanner(rt, t, s) { rt.flags._ifSay = true; try { rt.banner(t, s); } finally { rt.flags._ifSay = false; } },
  ifGo(rt, n) {
    const F = rt.flags; if (F.ifEnd || (F.ifS ?? -1) >= n) return;
    F.ifS = n; F.ifAt = rt.t; F.ifK0 = rt.stats?.kills ?? 0;
    // 前の段の徳川の手は南へ退く（残りが本人を引き止めて次の行き先へ着けなかった・act bot 0517）
    if (n >= 3) for (const g of [F.ifKase, F.ifOkubo, F.ifIshi]) this.ifBack(rt, g);
    this.ifObj(rt, OBJ[n]);
    if (n === 2) this.ifTurn(rt);
    else if (n === 3) { this.ifSay(rt, 0.5, '組頭', '柵の口が内から破られた！　徳川の手が来るぞ！'); this.ifSay(rt, 4, '組頭', '切れ目を塞げ！　ここを抜かれれば挟まれる！'); }
    else if (n === 4) this.ifSay(rt, 0.5, '野々村正成', '鉄砲、南へ向けよ！　徳川の手を撃て！', 3);
    else if (n === 5) { this.ifSay(rt, 0.5, '組頭', '退く道は開いた。殿、茶臼山へ！', 3); }
  },
  // 見せ場：狼煙。隣の徳川の加勢と、柵の南の徳川の組がみな旗を返す（側だけを変える。数・強さは変えない）
  ifTurn(rt) {
    const F = rt.flags, P = rt.player.u;
    this.ifBanner(rt, '南の空に狼煙', '徳川勢が旗を返す');
    this.ifSay(rt, 0.3, '足軽', '南の空に狼煙じゃ……何の合図じゃ？', 2.6);
    rt.after(3, () => {
      for (const g of rt.army.groups) {
        if (!g || g.team !== 0 || g.isPlayerSquad || g.faction !== 'tokugawa' || !g.count) continue;
        g.team = 1;
        const near = g === F.ifKase;
        if (near) { g.order = 'attack'; g.aggro = 22; g.seekRange = 30; g.noGuard = false; }
        for (const u of g.units) { if (!u.alive) continue; u.team = 1; u.target = near ? P : null; u.atk = null; u.bind = null; u.settled = false; }
      }
      this.ifSay(rt, 0, '組頭', '徳川勢、旗を返したぞ！　槍がこちらを向いておる！', 3);
      this.ifSay(rt, 3.5, '前田利家', '家康め、武田と通じておったか！　柵の内で討て！', 3.2);
    });
  },
  ifBack(rt, g) {
    if (!alive(g) || g._ifBack) return;
    g._ifBack = true; g.order = 'hold'; g.aggro = 0; g.anchor = { x: IN_X - 30, z: OMIYA + 170 };
    for (const u of g.units) if (u.alive) { u.target = null; u.atk = null; u.bind = null; u.fleeing = true; u.settled = false; }
  },
  ifSpawn(rt, key, name, at, lead, n) {
    const F = rt.flags, P = rt.player.u;
    try {
      const list = [...(lead ? [{ type: 'busho', n: 1, o: { name: lead, invuln: true, ...TOKU } }] : []), { type: 'samurai', n: 2, o: { ...TOKU } }, { type: 'ashigaru', n, o: { ...TOKU } }];
      const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: { ...at }, facing: Math.atan2(P.pos.x - at.x, P.pos.z - at.z), width: 8, aggro: 18, seekRange: 26, order: 'attack', fixed: true, k712here: true, fullStrength: true }, list);
      if (g) { g.team = 1; for (const u of g.units) { u.team = 1; u.target = P; } }
      F[key] = g;
    } catch (e) { console.warn('if01 ' + name, e); }
  },
  ifWin(rt) {
    const F = rt.flags; if (F.ifEnd) return;
    F.ifEnd = true; F.ifWon = true;
    F._ifObj = true;
    try { rt.objDone('pursue'); rt.tracker.main = true; rt.award((t) => { t.main = true; t.special = { label: '信長の退き口', pts: 25 }; }, '信長の馬廻を守り抜いた'); } finally { F._ifObj = false; }
    this.ifBanner(rt, '信長、極楽寺山へ退く', '岐阜からの後詰を待つ');
    this.ifSay(rt, 1, '使番', '殿は極楽寺山へ退かれた。岐阜の後詰を待つぞ', 3.4);
    if (rt.player?.u) rt.player.u.invuln = true;
    for (const g of [F.ifHonda, F.ifOkubo2]) if (alive(g)) { g.order = 'hold'; g.anchor = { ...HONDA_IN }; for (const u of g.units) { u.target = null; u.settled = false; } }
    rt.after(0.1, () => rt.finish({ scriptedEnd: true }, 7));
  },
  ifLose(rt) {
    const F = rt.flags; if (F.ifEnd) return;
    F.ifEnd = true; rt.tracker.main = false;
    this.ifBanner(rt, '信長の本陣が落ちた', '');
    rt.finish({ failureReason: '信長の本陣が落ちた', scriptedEnd: true }, 6);
  },
  win() {},
  lose() {},
  update(rt, dt) {
    base.update.call(this, rt, dt);
    const F = rt.flags, P = rt.player?.u;
    if (F.ifEnd || !P?.alive) return;
    const s = F.ifS ?? -1, since = rt.t - (F.ifAt ?? rt.t), kills = (rt.stats?.kills ?? 0) - (F.ifK0 ?? 0);
    // 狼煙：真田の第一波が崩れた所（元の段 2）。崩れずに長引いた時も四分半で上げる
    if (s < 2) { if ((F.nf?.step ?? 0) >= 2 || rt.t > 270) this.ifGo(rt, 2); return; }
    if (s === 2) {
      if (!alive(F.ifKase) || (F.ifKase.count ?? 0) <= 3 || kills >= 6 || since > 80) this.ifGo(rt, 3);
    } else if (s === 3) {
      if (!F.ifKireAt && dist(P.pos, KIRE) < 9) { F.ifKireAt = rt.t; this.ifSpawn(rt, 'ifOkubo', '大久保忠佐の手', OKUBO_IN, null, 8); }
      else if (!F.ifKireAt && since > 60) { F.ifKireAt = rt.t; this.ifSpawn(rt, 'ifOkubo', '大久保忠佐の手', OKUBO_IN, null, 8); }
      if (F.ifKireAt && (!alive(F.ifOkubo) || F.ifOkubo.count <= 3 || rt.t - F.ifKireAt > 90)) this.ifGo(rt, 4);
    } else if (s === 4) {
      const gp = center(innerGuns(F)) || { x: IN_X - 4, z: OMIYA - 10 };
      if (!F.ifGunsAt && (dist(P.pos, gp) < 12 || since > 50)) {
        F.ifGunsAt = rt.t;
        for (const g of F.guns || []) if (g && g.team === 0 && g.anchor && Math.abs(g.anchor.z - OMIYA) < 60) { g.facing = 0; for (const u of g.units) if (u.alive) u.settled = false; }
        this.ifSpawn(rt, 'ifIshi', '石川数正の手', ISHI_IN, null, 8);
      }
      if (F.ifGunsAt && (!alive(F.ifIshi) || F.ifIshi.count <= 3 || kills >= 4 || rt.t - F.ifGunsAt > 70)) this.ifGo(rt, 5);
    } else if (s === 5) {
      if (!F.ifUma) {
        try { F.ifUma = allyGroup(rt, { faction: 'oda', name: '信長の馬廻', fixed: true, fullStrength: true, noRetinue: true, noRout: true, anchor: { ...HQ }, facing: Math.atan2(HONDA_IN.x - HQ.x, HONDA_IN.z - HQ.z), width: 6, aggro: 8 },
          [{ type: 'samurai', n: 6, o: { ...ODA } }, { type: 'ashigaru', n: 6, o: { ...ODA } }]); } catch (e) { console.warn('if01 馬廻', e); }
        // 信長の旗本の馬廻は固い（受ける傷を三分の一）。本人が本陣の口に居ても一分で討ち尽くされて負けた（act bot・中学生 0542）
        if (F.ifUma) F.ifUma.defMult = 3;
      }
      if (!F.ifHqAt && (dist(P.pos, HQ) < 14 || since > 110)) {
        F.ifHqAt = rt.t;
        this.ifSpawn(rt, 'ifHonda', '本多忠勝の手', HONDA_IN, '本多忠勝', 8);
        this.ifSpawn(rt, 'ifOkubo2', '大久保忠世の手', { x: HONDA_IN.x - 14, z: HONDA_IN.z - 8 }, null, 4);
        this.ifSay(rt, 2, '本多忠勝', '本多平八郎じゃ！　信長の首、もらい受ける！', 3);
        this.ifSay(rt, 5.5, '組頭', '馬廻を守れ！　殿が退かれるまで、一歩も引くな！', 3);
      }
      if (F.ifHqAt) {
        const left = [F.ifHonda, F.ifOkubo2].reduce((n, g) => n + (alive(g) ? g.count : 0), 0);
        if (rt.t - F.ifHqAt > 65 || left <= 4) this.ifWin(rt);
        else {
          // 負け：本人が本陣の口から三十m より離れ、追い手が本陣の口（十m の内）に十五秒居座った時（馬廻の数では決めない。
          //   遠くの組は作り替えで数が0に見え、本人が口に居ても負けた・act bot 0546）
          const foeIn = [F.ifHonda, F.ifOkubo2].some((g) => alive(g) && g.units.some((u) => u.alive && !u.fleeing && dist(u.pos, HQ) < 10));
          F.ifFar = foeIn && dist(P.pos, HQ) > 30 ? (F.ifFar || 0) + dt : Math.max(0, (F.ifFar || 0) - dt);
          if (F.ifFar > 15) this.ifLose(rt);
        }
      }
    }
  },
});

export default if01_nagashino;
