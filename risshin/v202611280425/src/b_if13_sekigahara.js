// ======================================================================
// もしも編 十三戦目「関ヶ原、寝返らぬ秀秋」（慶長五年〔1600〕九月十五日・もしも）（K664・K671・docs/chapter_if.md の頭の 13）
//   史実：小早川秀秋が寝返って大谷勢を崩し、南宮山の毛利は動かなかった（『関原軍記大成』ほか）。
//   もしも：秀秋は西軍に踏みとどまり、松尾山を下って東軍の横を突く。南宮山の毛利も動き、東軍は前と後ろから押される。
//   自分：東軍の足軽。元の戦の持ち場（藤堂高虎の手・福島正則の南隣）に居る。
//
// 作り（もしも編①・武田編 d11 と同じ型）：単独の関ヶ原（b_sekigahara.js）の setup・update を丸ごと呼ぶ。
//   出来事①霧の中の押し合い ②霧が晴れて大谷勢の押し返しを凌ぐ は元の戦の段（段1・段A）のまま。
//   元の戦は段A の後に this.turn（小早川の寝返り）を呼ぶ。この写しは turn を差し替え、ここから先はこの紙の四つの段：
//   ③松尾山の旗が下る（元と同じ絵）→法螺貝で小早川が東軍へ ④藤堂の手の横で小早川の先手を受け止める
//   ⑤南宮山の毛利が動いた報せ→家康の本陣（桃配山の下）へ急ぐ ⑥本陣の退き口を守り、東軍を中山道へ落とす。
//   勝ち＝家康が戦場を脱し、東軍を立て直す。負け＝家康の本陣が囲まれる。元の段（2〜4）・島津の退き口・元の勝ちの締めは使わない。
// 布陣は docs/fujin/sekigahara.md（元のまま）。旅の紙 docs/journey/if13_sekigahara.md。
// ======================================================================
import { sekigahara as base } from './b_sekigahara.js';
import { allyGroup, enemyGroup } from './bhelp.js';
import { sfx } from './audio.js';
import { isEn, addEn } from './i18n.js';
import { BATTLE_ASSETS } from './asset_manifest.js';

if (BATTLE_ASSETS.sekigahara) BATTLE_ASSETS.if13_sekigahara = BATTLE_ASSETS.sekigahara;

const TODO = { x: 18, z: 50 };            // 藤堂高虎の手（元の戦の持ち場）
const MATSUO = { x: -40, z: 136 };        // 松尾山
const FLANK = { x: 6, z: 78 };            // 藤堂の手の南の横（小早川を受け止める所）
const KOBA_IN = { x: -30, z: 112 };       // 小早川の先手が下りて来る所（元の戦の寝返りの組と同じ）
const HQ = { x: 128, z: -6 };             // 家康の本陣の前（元の戦で井伊の赤備えが寄る所・桃配山の下）
const MORI_IN = { x: HQ.x + 30, z: HQ.z + 38 };   // 南宮山の毛利の先手（南東から）
const KOBA_CHASE = { x: HQ.x - 34, z: HQ.z + 30 }; // 追って来る小早川の手（南西から）
const KOBA = { flag: 'kobayakawa', armor: 0x2a2622 };
const MORI = { flag: 'mori', armor: 0x2a2826 };
const TOKU = { flag: 'tokugawa', armor: 0x22201e };
const alive = (g) => g && !g.routed && g.count > 0;
const center = (g) => (alive(g) ? g.center?.() : null);
const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 1e9);
const S = 6;   // この戦の段の番（元の update の段1〜4 の処理に当たらない数）

const OBJ = [
  '霧の中、藤堂の手と並んで大谷勢を押しとどめる',
  '霧が晴れた。大谷勢の押し返しを凌ぐ',
  '松尾山の旗を見よ。藤堂の手と南へ向き直れ',
  '藤堂の手の横で、下りて来た小早川の先手を受け止めよ',
  '南宮山の毛利が動いた。家康の本陣へ急げ',
  '家康の本陣の退き口を守り、東軍を中山道へ落とせ',
];
const NOUN = ['大谷勢', '大谷勢', '藤堂の手の横', '小早川の先手', '家康の本陣', '家康の本陣'];

if (isEn()) addEn([
  ['関ヶ原、寝返らぬ秀秋', 'Sekigahara: Hideaki Stays Loyal'],
  ['美濃国 関ヶ原（もしも）', 'Sekigahara, Mino (What if)'],
  ...OBJ.map((t, i) => [t, ['Hold back the Otani troops in the fog beside Todo\'s men', 'The fog has lifted. Withstand the Otani counterattack', 'Watch the banners on Matsuo. Turn south with Todo\'s men', 'Beside Todo\'s men, stop the Kobayakawa vanguard coming down', 'The Mori on Nangu have moved. Hurry to Ieyasu\'s headquarters', 'Guard the retreat from Ieyasu\'s headquarters and get the Eastern army onto the Nakasendo'][i]]),
  ['小早川秀秋、西軍に留まる', 'Kobayakawa Hideaki stays with the West'], ['松尾山を下り、東軍の横へ', 'He comes down Matsuo onto the Eastern flank'],
  ['南宮山の毛利、動く', 'The Mori on Nangu move'], ['東軍は前と後ろから押される', 'The Eastern army is pressed from front and rear'],
  ['家康、関ヶ原を脱す', 'Ieyasu escapes Sekigahara'], ['東軍は中山道で立て直す', 'The Eastern army regroups on the Nakasendo'],
  ['家康の本陣が囲まれた', 'Ieyasu\'s headquarters was surrounded'],
  ['小早川の先手', 'Kobayakawa vanguard'], ['吉川・毛利の先手', 'Kikkawa and Mori vanguard'], ['追い迫る小早川の手', 'Pursuing Kobayakawa men'], ['家康の旗本', 'Ieyasu\'s bannermen'],
  ['松尾山の旗が……こちらへ下りてくる！', 'The banners on Matsuo... they are coming at us!'],
  ['小早川は寝返らぬ！　西軍のまま、我らの横を突く気じゃ！', 'Kobayakawa will not turn! He stays West and strikes our flank!'],
  ['槍を南へ向けよ！　藤堂の手、横を固めよ！', 'Spears south! Todo\'s men, hold the flank!'],
  ['南宮山の毛利勢が山を下った由！　内府様の背が危のうござる！', 'The Mori have come down Nangu! Our lord\'s rear is in danger!'],
  ['本陣へ走れ！　金扇の馬印を倒させるな！', 'Run to headquarters! Do not let the golden fan standard fall!'],
  ['金扇の馬印を支えよ！　内府様が中山道へ出られるまで！', 'Hold up the golden fan standard! Until our lord reaches the Nakasendo!'],
  ['内府様、中山道へ抜けられた！　東軍は立て直せるぞ', 'Our lord is through to the Nakasendo! The East can regroup'],
  ['史実では、小早川秀秋が寝返り、南宮山の毛利は動かなかった。', 'In history, Kobayakawa Hideaki changed sides and the Mori on Nangu never moved.'],
]);

const D = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));

export const if13_sekigahara = Object.assign(D, {
  id: 'if13_sekigahara',
  key: 'if13_sekigahara',
  moshimo: true,
  resumeSteps: [[1, 'open']],   // 戦の途中の保存は霧の段まで（もしもの段は始めから）
  date: (rt) => `${base.date(rt)}（もしも）`,
  history: '史実では、小早川秀秋が寝返り、南宮山の毛利は動かなかった。もしも秀秋が西軍に踏みとどまり、松尾山を下って東軍の横を突いたら――南宮山の毛利も動き、東軍は前と後ろから押される。',
  sides: { a: { name: '東軍', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '西軍', mon: 'ishida', faction: 'ishida' } },
  survives: [...(base.survives || []), '徳川家康', '小早川秀秋', '石田三成', '大谷吉継'],
  victoryCaption: '家康、関ヶ原を脱す',
  force: (rt) => {
    const f = base.force(rt), F = rt.flags;
    if ((F.step ?? 0) < S) return f;
    const lost = Math.min(30000, (rt.t - (F.ifAt0 ?? rt.t)) * 60);   // 小早川・毛利が加わり、東軍が押される
    return { a: Math.max(20000, f.a - lost), a0: f.a0, b: Math.min(110000, f.b + 15600 + 16000), b0: f.b0 };
  },
  goals5() {
    const st = (rt) => rt.flags.ifS ?? -1, won = (rt) => !!rt.flags.ifWon;
    return OBJ.map((text, k) => ({ kind: 'stage', k, text, noun: NOUN[k], sec: 0,
      check: k === 0 ? (rt) => (rt.flags.fog ?? 1) <= 0 || st(rt) >= 2 : k === 1 ? (rt) => st(rt) >= 2 : k === OBJ.length - 1 ? won : (rt) => won(rt) || st(rt) > k }));
  },
  ifPin(rt) {
    const F = rt.flags, s = F.ifS;
    if (s === 2) return FLANK;
    if (s === 3) { const c = center(F.ifKoba); return c && dist(c, FLANK) < 60 ? { ...c, enemy: true } : FLANK; }
    if (s === 4) return HQ;
    if (s === 5) { const c = [F.ifMori, F.ifChase].map(center).find((x) => x && dist(x, HQ) < 30); return c ? { ...c, enemy: true } : HQ; }
    return null;
  },
  // bot：霧と段A は元の頭。この戦の段は金の▼へ歩き、打ち込む敵と、▼が敵の時は近い敵とだけ斬り合う
  botBrain(b, inp, tools) {
    if ((b.flags.ifS ?? -1) < 2) return base.botBrain(b, inp, tools);
    const { goTo, patientStrike, strikeTarget } = tools, p = b.player, u = p.u;
    if (!u?.alive || b.flags.ifEnd) return true;
    inp.k.delete('KeyW'); inp.leftPressed = false; inp.guardHold = false;
    const q = b.flags.ifWon ? null : this.ifPin(b);
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
  botMountAllowed: () => false,

  setup(rt) {
    const army = rt.army;
    const obj0 = rt.obj, ow0 = rt.objDone, aw0 = rt.award, say0 = rt.say, ban0 = rt.banner, fin0 = rt.finish;
    const after = () => (rt.flags.ifS ?? -1) >= 2;
    rt.obj = (id, ...r) => (!after() || rt.flags._ifObj ? obj0.call(rt, id, ...r) : undefined);
    rt.objDone = (id, ...r) => (!after() || rt.flags._ifObj ? ow0.call(rt, id, ...r) : undefined);
    rt.award = (f, ...r) => (!after() || rt.flags._ifObj ? aw0.call(rt, f, ...r) : undefined);
    rt.say = (who, text, ...r) => (!after() || rt.flags._ifSay ? say0.call(rt, who, text, ...r) : undefined);
    rt.banner = (t, s, ...r) => (!after() || rt.flags._ifSay ? ban0.call(rt, t, s, ...r) : undefined);
    rt.finish = (info = {}, ...r) => { if (!info.down && !rt.flags.ifEnd && rt.player?.u?.alive && after()) return; return fin0.call(rt, info, ...r); };
    // 本人の組は藤堂の旗（筋書きの家は織田のままなので、組の旗だけ東軍に）
    const sp0 = army.spawn;
    army.spawn = function (g, list, ...r) { if (g?.isPlayerSquad && Array.isArray(list)) list = list.map((e) => ({ ...e, o: { ...(e.o || {}), flag: 'todo' } })); return sp0.call(this, g, list, ...r); };
    rt.cleanupTasks?.add(() => { rt.obj = obj0; rt.objDone = ow0; rt.award = aw0; rt.say = say0; rt.banner = ban0; rt.finish = fin0; army.spawn = sp0; });
    const r = base.setup.call(this, rt);
    rt.flags.ifS = -1;
    if (rt.player?.u) rt.player.u.faction = 'tokugawa';
    return r;
  },
  ifObj(rt, text) { const F = rt.flags; F._ifObj = true; try { rt.objDone('main'); rt.obj('main', text, 'main', true); } finally { F._ifObj = false; } },
  ifSay(rt, at, who, text, d = 3.4) { rt.after(at, () => { if (rt.flags.ifEnd) return; rt.flags._ifSay = true; try { rt.say(who, text, d); } finally { rt.flags._ifSay = false; } }); },
  ifBanner(rt, t, s) { rt.flags._ifSay = true; try { rt.banner(t, s); } finally { rt.flags._ifSay = false; } },
  // 元の戦の寝返りの段の代わり（段A が済むと元の戦がこれを呼ぶ）
  turn(rt) {
    const F = rt.flags;
    if ((F.ifS ?? -1) >= 2) return;
    F.step = S; F.stepT = rt.t; F.ifAt0 = rt.t;
    try { rt.setPhase('turn'); } catch (e) { /* なし */ }
    // 押し返しの段で退いた大谷方は、西の陣の前に留まる（元の寝返りの段は使わない）
    // 印：元の戦の印（藤堂の旗・大谷の隊）を外し、この戦の行き先の印を一つだけ立てる（元の戦と同じ rt.marker）
    for (const m of [...(rt.markers || [])]) rt.unmark(m.id);
    rt.marker('ifpin', () => (F.ifWon || F.ifEnd ? null : this.ifPin(rt)), () => (F.ifWon || F.ifEnd ? '' : NOUN[F.ifS] || ''), { h: 3 });
    this.ifGo(rt, 2);
    // 見せ場の前ぶれ：松尾山の旗が下る（元の戦と同じ絵）
    rt.after(6, () => { try { F.koba?.[0]?.m?.advance(14, 22); } catch (e) { /* なし */ } sfx('horagai', 0.7); this.ifSay(rt, 0, '足軽', '松尾山の旗が……こちらへ下りてくる！', 3.4); });
    rt.after(16, () => { try { if (F.koba?.[1]?.m) { F.koba[1].m.visible = true; F.koba[1].m.advance(16, 18); } } catch (e) { /* なし */ } });
    rt.after(24, () => {
      sfx('horagai', 1);
      try { F.koba?.[0]?.m?.advance(26, 12, { charge: true }); if (F.koba?.[2]?.m) { F.koba[2].m.visible = true; F.koba[2].m.advance(16, 7, { charge: true }); } } catch (e) { /* なし */ }
      this.ifBanner(rt, '小早川秀秋、西軍に留まる', '松尾山を下り、東軍の横へ');
      this.ifSay(rt, 0.5, '藤堂の侍', '小早川は寝返らぬ！　西軍のまま、我らの横を突く気じゃ！', 3.4);
      this.ifSay(rt, 4, '藤堂高虎', '槍を南へ向けよ！　藤堂の手、横を固めよ！', 3.2);
      this.ifGo(rt, 3);
    });
  },
  // 元の戦の大谷勢の崩れ・島津の段は来ない（turn を差し替えたので呼ばれないが、念のため）
  collapse() {},
  shimazu() {},
  ifGo(rt, n) {
    const F = rt.flags; if (F.ifEnd || (F.ifS ?? -1) >= n) return;
    F.ifS = n; F.ifAt = rt.t; F.ifK0 = rt.stats?.kills ?? 0;
    if (n >= 4) for (const g of [F.ifKoba]) this.ifBack(rt, g);
    this.ifObj(rt, OBJ[n]);
    if (n === 3) this.ifSpawn(rt, 'ifKoba', '小早川の先手', KOBA_IN, KOBA, [{ type: 'samurai', n: 1, o: { name: '松野主馬', horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
    else if (n === 4) {
      this.ifBanner(rt, '南宮山の毛利、動く', '東軍は前と後ろから押される');
      this.ifSay(rt, 0.5, '伝令', '南宮山の毛利勢が山を下った由！　内府様の背が危のうござる！', 3.6);
      this.ifSay(rt, 4.5, '藤堂高虎', '本陣へ走れ！　金扇の馬印を倒させるな！', 3.2);
    } else if (n === 5) {
      this.ifSay(rt, 0.5, '家康の旗本', '金扇の馬印を支えよ！　内府様が中山道へ出られるまで！', 3.4);
    }
  },
  ifBack(rt, g) {
    if (!alive(g) || g._ifBack) return;
    g._ifBack = true; g.order = 'hold'; g.aggro = 0; g.anchor = { ...MATSUO };
    for (const u of g.units) if (u.alive) { u.target = null; u.atk = null; u.bind = null; u.fleeing = true; u.settled = false; }
  },
  ifSpawn(rt, key, name, at, look, list) {
    const F = rt.flags, P = rt.player.u;
    try {
      const g = enemyGroup(rt, { faction: look.flag, name, anchor: { ...at }, facing: Math.atan2(P.pos.x - at.x, P.pos.z - at.z), width: 10, aggro: 18, seekRange: 28, order: 'attack', fixed: true, k712here: true, fullStrength: true },
        list.map((e) => ({ ...e, o: { ...look, ...(e.o || {}) } })));
      if (g) for (const u of g.units) u.target = P;
      F[key] = g;
    } catch (e) { console.warn('if13 ' + name, e); }
  },
  ifWin(rt) {
    const F = rt.flags; if (F.ifEnd) return;
    F.ifEnd = true; F.ifWon = true; F.ending = true;
    F._ifObj = true;
    try { rt.objDone('main'); rt.tracker.main = true; rt.award((t) => { t.main = true; t.special = { label: '金扇の馬印', pts: 25 }; }, '家康の退き口を守り抜いた'); } finally { F._ifObj = false; }
    this.ifBanner(rt, '家康、関ヶ原を脱す', '東軍は中山道で立て直す');
    this.ifSay(rt, 1, '家康の旗本', '内府様、中山道へ抜けられた！　東軍は立て直せるぞ', 3.6);
    if (rt.player?.u) rt.player.u.invuln = true;
    for (const g of [F.ifMori, F.ifChase]) this.ifBack(rt, g);
    rt.after(0.1, () => rt.finish({ scriptedEnd: true }, 7));
  },
  ifLose(rt) {
    const F = rt.flags; if (F.ifEnd) return;
    F.ifEnd = true; F.ending = true; rt.tracker.main = false;
    this.ifBanner(rt, '家康の本陣が囲まれた', '');
    rt.finish({ failureReason: '家康の本陣が囲まれた', scriptedEnd: true }, 6);
  },
  update(rt, dt) {
    base.update.call(this, rt, dt);
    const F = rt.flags, P = rt.player?.u;
    if (F.ifEnd || !P?.alive) return;
    const s = F.ifS ?? -1, since = rt.t - (F.ifAt ?? rt.t), kills = (rt.stats?.kills ?? 0) - (F.ifK0 ?? 0);
    if (s < 2) return;
    if (s === 2) { if (since > 40) this.ifGo(rt, 3); }
    else if (s === 3) {
      if (!alive(F.ifKoba) || F.ifKoba.count <= 4 || kills >= 7 || since > 100) this.ifGo(rt, 4);
    } else if (s === 4) {
      if (!F.ifHata) {
        try {
          F.ifHata = allyGroup(rt, { faction: 'tokugawa', name: '家康の旗本', fixed: true, fullStrength: true, noRetinue: true, noRout: true, anchor: { ...HQ }, facing: Math.PI / 2, width: 8, aggro: 8 },
            [{ type: 'samurai', n: 6, o: { ...TOKU } }, { type: 'ashigaru', n: 6, o: { ...TOKU } }]);
          if (F.ifHata) F.ifHata.defMult = 3;
        } catch (e) { console.warn('if13 旗本', e); }
      }
      if (dist(P.pos, HQ) < 14 || since > 110) this.ifGo(rt, 5);
    } else if (s === 5) {
      if (!F.ifHqAt) {
        F.ifHqAt = rt.t;
        this.ifSpawn(rt, 'ifMori', '吉川・毛利の先手', MORI_IN, MORI, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]);
        this.ifSpawn(rt, 'ifChase', '追い迫る小早川の手', KOBA_CHASE, KOBA, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }]);
      }
      const left = [F.ifMori, F.ifChase].reduce((n, g) => n + (alive(g) ? g.count : 0), 0);
      if (rt.t - F.ifHqAt > 65 || left <= 4) this.ifWin(rt);
      else {
        // 負け：本人が本陣から三十m より離れ、敵が本陣の口（十m の内）に十五秒居座った時
        const foeIn = [F.ifMori, F.ifChase].some((g) => alive(g) && g.units.some((u) => u.alive && !u.fleeing && dist(u.pos, HQ) < 10));
        F.ifFar = foeIn && dist(P.pos, HQ) > 30 ? (F.ifFar || 0) + dt : Math.max(0, (F.ifFar || 0) - dt);
        if (F.ifFar > 15) this.ifLose(rt);
      }
    }
  },
});

export default if13_sekigahara;
