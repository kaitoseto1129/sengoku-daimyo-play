// K652②（kaito 11/25「全部の戦を10分ぐらいに。15分楽しめる質」）：徳川編の短い戦に、史実の流れの続きの段（追い・新手・殿・逸話）を足す。
//   待つ秒（hold の dur）は延ばさない。字とボタンは足さない（任務の一行と台詞だけ。英語の字はこの紙の EN）。
//   使い方：戦の紙の終わりで  moreSteps(def, MORE.<id>)  を呼ぶ。戦の win(rt) が初めて呼ばれた時に、ここの段（b_depth.js の段）を
//   本人の今いる所で始め、段が尽きたら元の win を呼ぶ。元の戦の段・地面・敵の手は変えない（K651 で他家が呼ぶ戦場の関数も触らない）。
//   段の敵の出所は、その戦で敵の兵が立っていた所（歩ける地面）のうち、本人から 30〜90 歩の、戦ごとの向き（dir）に一番近い所。
import { depthStart, depthTick, depthBot } from './b_depth.js';
import * as DP from './b_depth.js';
import { isEn, addEn } from './i18n.js';

// 敵の出所：その戦で敵の兵が立っていた所（死んだ兵の足元も含む）から選ぶ。無ければ本人から dir の向きへ四十歩
function foeFrom(rt, P, dir, near = 30, far = 90) {
  const want = { x: Math.sin(dir), z: Math.cos(dir) };
  let best = null, bs = -9;
  const wd = rt.world?.waterDepthAt?.bind(rt.world);
  for (const u of rt.army.units) {
    if (u.team !== 1 || u.isStruct || u.civ || !u.pos) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d = Math.hypot(dx, dz);
    if (d < near || d > far) continue;
    if (wd && wd(u.pos.x, u.pos.z) > 0.3) continue;
    const s = (dx * want.x + dz * want.z) / d - Math.abs(d - 50) / 200;
    if (s > bs) { bs = s; best = { x: u.pos.x, z: u.pos.z }; }
  }
  if (best && bs > 0.2) return best;
  return { x: P.x + want.x * 40, z: P.z + want.z * 40 };
}

// 敵のいた向き：敵の兵（倒れた兵も）の真ん中の向き（向きを書かない戦）
function foeSide(rt, P) {
  let x = 0, z = 0, n = 0;
  for (const u of rt.army.units) if (u.team === 1 && !u.isStruct && !u.civ && u.pos) { x += u.pos.x; z += u.pos.z; n++; }
  return n ? Math.atan2(x / n - P.x, z / n - P.z) : 0;
}
// 本人の近くの味方の組（三つまで）を段の味方にする
const friendsNear = (rt) => {
  const P = rt.player?.u?.pos;
  if (!P) return [];
  return rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.isRunner && g.count > 2 && !g.routed && g.center)
    .map((g) => ({ g, d: (() => { const c = g.center(); return Math.hypot(c.x - P.x, c.z - P.z); })() }))
    .filter((o) => o.d < 80).sort((a, b) => a.d - b.d).slice(0, 3).map((o) => o.g);
};

const S = (n) => ({ type: 'samurai', n }), A = (n) => ({ type: 'ashigaru', n }), G = (n) => ({ type: 'gun', n }), B = (n) => ({ type: 'bow', n }), C = (n) => ({ type: 'cavalry', n });
const NAMED = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, horse: true, ...o } });

// 段の表から b_depth の段を作る。row = { rest: [[誰, 字]…] } か { fight: { title, sub, obj, say, foes: [{ name, list, dir }], later: [{ t, say, foes }] } }
function build(rt, spec, P) {
  const out = [];
  for (const row of spec.rows) {
    if (row.rest) { out.push(DP.rest({ dur: row.dur || (out.length ? 6 : 3), heal: 0.9, say: row.rest })); continue; }
    const d0 = spec.toward ? Math.atan2(spec.toward.x - P.x, spec.toward.z - P.z) : spec.dir != null ? spec.dir : foeSide(rt, P);
    const f = row.fight, mk = (q) => ({ name: q.name, list: q.list, ...(q.faction ? { faction: q.faction, flag: q.faction } : {}), from: foeFrom(rt, P, d0 + (q.dir || 0)), seek: 70, ...(q.mass != null ? { mass: q.mass } : {}) });
    out.push(DP.fight({ at: () => ({ x: P.x, z: P.z }), title: f.title, sub: f.sub || '', obj: f.obj, max: f.max || 200, limit: f.limit || 240,
      say: f.say || [], foes: () => f.foes.map(mk),
      later: (f.later || []).map((w) => ({ t: w.t, say: w.say, foes: () => (w.foes || []).map(mk) })),
      reward: f.reward || f.title }));
  }
  return out;
}

export function moreSteps(def, spec) {
  if (!def || !spec || def._k652more) return;
  def._k652more = true;
  const win0 = def.win;
  def.win = function (rt, ...a) {
    const F = rt.flags;
    if (F.k652m === 'done' || rt.over || rt.def?.sideFlip) return win0.call(this, rt, ...a);   // K661：側を入れ替えた他家の戦（c15 八尾）は徳川の本人の続きの段を出さない
    if (F.k652m === 'on' || F.ending) return;
    const P0 = rt.player?.u?.pos;
    if (!P0 || !rt.player.u.alive) return win0.call(this, rt, ...a);
    F.k652m = 'on';
    const P = { x: P0.x, z: P0.z };
    const self = this;
    // 元の戦の敵は勝った所で退く（元の win と同じ）。続きの段は新しく寄せる組だけ（残った組が本人に重ならない）
    // 前に立って待つ備（depth_reserve）は、続きの段の寄せに起こさない（本人の周りに数が重なって倒れた・樫井）
    if (F._dr?.E) F._dr.E.length = 0;
    // 後ろの控え（backOf）は踏み込むと本物の兵に替わり、本人の周りに重なって倒れた（樫井）ので、既定は付けない（backing: false）
    if (spec.onStart) spec.onStart(rt);
    else if (spec.calm !== false) for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) { g.noRout = false; g.focus = null; g.order = 'flee'; g.routed = true; g.morale = 0; }
    depthStart(rt, { faction: spec.faction, flag: spec.flag || spec.faction, look: spec.look, friends: friendsNear, scale: 1, backing: spec.backing ?? false, fixedSpawn: true, dmg: spec.dmg ?? 0.22, botSeek: 40, restHp: 1 },
      build(rt, spec, P), () => { F.k652m = 'done'; rt.objRemove?.('dp'); def.win.call(self, rt, ...a); });
  };
  const up0 = def.update;
  def.update = function (rt, dt) {
    const r = up0 ? up0.call(this, rt, dt) : undefined;
    if (rt.flags.k652m === 'on' && !spec.ownTick && !rt.over) depthTick(rt, dt);
    // 続きの段の間に、元の戦の仕組み（布陣の備・控え・本人へ向ける組）が起こした敵の組は、本人の六十歩内に来たら退かせる（樫井：豊臣の先手の備が重なって倒れた）
    const F = rt.flags;
    if (F.k652m === 'on' && spec.calm !== false && (F._k652T = (F._k652T || 0) - dt) <= 0) {
      F._k652T = 1;
      const mine = F._k652g || (F._k652g = new Set());
      for (const g of F.dp?.cur?.groups || []) mine.add(g);
      const P = rt.player?.u?.pos;
      if (P) for (const g of rt.army.groups) {
        if (g.team !== 1 || !g.count || g.routed || mine.has(g) || !g.center) continue;
        const c = g.center();
        if (Math.hypot(c.x - P.x, c.z - P.z) < 60) { g.noRout = false; g.noEngage = true; g.focus = null; g.order = 'flee'; g.routed = true; g.morale = 0; delete g.dmgMultPlayer; }
      }
    }
    return r;
  };
  // 戦ごとの bot の頭（段を自分で見る戦）は、足した段の間は段の的へ
  if (def.botBrain) {
    const bb0 = def.botBrain;
    def.botBrain = function (b, inp, o) {
      if (b.flags.k652m === 'on' && b.flags.dp?.on) { inp.quickCmd = null; depthBot(b, inp, o.goTo); return; }
      return bb0.call(this, b, inp, o);
    };
  }
  if (isEn() && spec.en) addEn(spec.en);
}

// ---------------- 戦ごとの続きの段（史実の流れ） ----------------
export const MORE = {
  // 河田・米野（1600/8/22）：新加納の後、川手の閻魔堂にいた織田秀信は岐阜城へ退いた。退く本陣の殿と、岐阜から出た後詰を払う
  k02_kawada: { faction: 'oda', flag: 'oda', dir: Math.PI, ownTick: true, rows: [
    { rest: [['池田照政', '中納言は閻魔堂の本陣を払うたぞ。殿が道を塞いでおる']] },
    { fight: { title: '閻魔堂の殿', sub: '岐阜へ退く秀信の本陣の後ろ', obj: '岐阜へ退く秀信の本陣の殿を追い払え',
      say: [['秀信の旗本', '殿様を城へお入れするまで、ここは退かぬ！']],
      foes: [{ name: '秀信の旗本の殿', list: [S(2), A(10), G(3)] }],
      later: [{ t: 30, say: ['浅野の侍', '左の田の畦からも来るぞ！'], foes: [{ name: '閻魔堂の槍組', list: [S(2), A(10)], dir: 0.7 }] }] } },
    { rest: [['浅野幸長', '息を継げ。岐阜の方から鬨の声じゃ']] },
    { fight: { title: '岐阜の後詰', sub: '城から出た織田の新手', obj: '岐阜の城から出た新手を押し返せ',
      say: [['織田の侍', '米野の仇じゃ。東の者を川へ追い落とせ！']],
      foes: [{ name: '岐阜の後詰', list: [S(2), A(12)] }],
      later: [{ t: 35, say: ['一柳直盛', '新手の鉄砲じゃ。散って間を詰めよ'], foes: [{ name: '後詰の鉄砲組', list: [S(1), A(4), G(5)], dir: -0.6 }] }] } },
  ], en: [
    ['中納言は閻魔堂の本陣を払うたぞ。殿が道を塞いでおる', 'Lord Hidenobu has left his camp at Enmado. His rearguard blocks the road.'],
    ['閻魔堂の殿', 'Enmado rearguard'], ['岐阜へ退く秀信の本陣の後ろ', "Behind Hidenobu's camp, falling back to Gifu"],
    ['岐阜へ退く秀信の本陣の殿を追い払え', "Drive off the rearguard of Hidenobu's retreating camp"],
    ['殿様を城へお入れするまで、ここは退かぬ！', 'We will not fall back until our lord is inside the castle!'],
    ['秀信の旗本の殿', "Hidenobu's guard rearguard"], ['閻魔堂の槍組', 'Enmado spearmen'],
    ['左の田の畦からも来るぞ！', 'More coming along the paddy banks on the left!'],
    ['息を継げ。岐阜の方から鬨の声じゃ', 'Catch your breath. War cries from the direction of Gifu.'],
    ['岐阜の後詰', 'Gifu relief force'], ['城から出た織田の新手', 'Fresh Oda troops out of the castle'],
    ['岐阜の城から出た新手を押し返せ', 'Push back the fresh troops from Gifu Castle'],
    ['米野の仇じゃ。東の者を川へ追い落とせ！', 'Revenge for Yoneno! Drive the Eastern men into the river!'],
    ['新手の鉄砲じゃ。散って間を詰めよ', 'Fresh guns. Spread out and close the distance.'], ['後詰の鉄砲組', 'Relief gunners'],
  ] },
  // 岐阜城（1600/8/23）：秀信が降った後も、降りを肯んぜぬ城兵が残り、瑞龍寺山から落ちた石田の加勢が麓へ退いた
  k03_gifu: { faction: 'oda', flag: 'oda', rows: [
    { rest: [['池田輝政', '中納言は降った。だが二の丸の櫓に、まだ降りを聞かぬ者がおる']] },
    { fight: { title: '降りを聞かぬ城兵', sub: '二の丸の櫓から討って出る', obj: '降りを聞かぬ城兵を追い払え',
      say: [['城方の侍', '殿が降っても、わしらは降らぬ。信長公の城じゃ！']],
      foes: [{ name: '二の丸の残兵', list: [S(2), A(8), G(2)] }],
      later: [{ t: 30, say: ['池田長吉', '櫓の下からも来るぞ。囲まれるな'], foes: [{ name: '櫓の下の槍組', list: [S(2), A(8)], dir: 0.8 }] }] } },
    { rest: [['浅野幸長', '瑞龍寺山の石田の加勢が、麓を抜けて大垣へ逃げる']] },
    { fight: { title: '石田の加勢', sub: '瑞龍寺山から落ちた西軍', obj: '瑞龍寺山から落ちた石田の加勢を討て',
      say: [['石田の侍', '大垣へ戻るのじゃ。道を開けい！']],
      foes: [{ name: '石田の加勢', list: [S(2), A(12)], dir: -0.5 }],
      later: [{ t: 35, say: ['足軽', '後ろの組が鉄砲を構えたぞ！'], foes: [{ name: '加勢の鉄砲組', list: [S(1), A(4), G(4)], dir: 0.4 }] }] } },
  ], en: [
    ['中納言は降った。だが二の丸の櫓に、まだ降りを聞かぬ者がおる', 'Lord Hidenobu has surrendered. But men in the second bailey tower refuse to yield.'],
    ['降りを聞かぬ城兵', 'Holdouts'], ['二の丸の櫓から討って出る', 'Sallying from the second bailey tower'],
    ['降りを聞かぬ城兵を追い払え', 'Drive off the holdouts who refuse to surrender'],
    ['殿が降っても、わしらは降らぬ。信長公の城じゃ！', "Our lord may yield, but we won't. This is Lord Nobunaga's castle!"],
    ['二の丸の残兵', 'Second bailey holdouts'], ['櫓の下の槍組', 'Spearmen below the tower'],
    ['櫓の下からも来るぞ。囲まれるな', "More from below the tower. Don't get surrounded."],
    ['瑞龍寺山の石田の加勢が、麓を抜けて大垣へ逃げる', "Ishida's men from Zuiryuji Hill are fleeing past the foot of the hill to Ogaki."],
    ['石田の加勢', "Ishida's reinforcements"], ['瑞龍寺山から落ちた西軍', 'Western men driven from Zuiryuji Hill'],
    ['瑞龍寺山から落ちた石田の加勢を討て', "Cut down Ishida's men fleeing Zuiryuji Hill"],
    ['大垣へ戻るのじゃ。道を開けい！', 'Back to Ogaki. Clear the way!'], ['加勢の鉄砲組', 'Reinforcement gunners'],
    ['後ろの組が鉄砲を構えたぞ！', 'The rear squad is raising guns!'],
  ] },
  // 杭瀬川（1600/9/14）：伏兵に崩れた東軍が陣へ戻ると、島左近と明石全登の手が陣の前まで追って来た（家康が本多・井伊を出して引かせた）
  k04_kuisegawa: { faction: 'ukita', flag: 'ukita', rows: [
    { rest: [['有馬豊氏', '陣の柵を固めよ。明石の手がまだ追うて来る']] },
    { fight: { title: '陣の前の追手', sub: '明石全登の手が陣の柵へ寄せる', obj: '陣の前まで追って来た明石の手を払え',
      say: [['明石の侍', '逃げる者を陣ごと崩せ！']],
      foes: [{ name: '明石の追手', list: [S(2), A(10)] }],
      later: [{ t: 30, say: ['中村の侍', '葦の方からも来るぞ！'], foes: [{ name: '明石の槍組', list: [S(2), A(10)], dir: 0.7 }] }] } },
    { rest: [['有馬豊氏', '息を継げ。島左近の旗が川を越えたぞ']] },
    { fight: { title: '島左近の押し', sub: '左近の旗本が最後に押して来る', obj: '島左近の旗本の押しを受け止めよ',
      say: [['島左近の侍', '内府の陣の前で、もう一度鬨を上げよ！']],
      foes: [{ name: '左近の旗本の先手', list: [S(2), A(10)], faction: 'ishida' }],
      later: [{ t: 30, say: ['有馬の侍', '鉄砲を並べて来た。間を詰めよ！'], foes: [{ name: '左近の鉄砲組', list: [S(1), A(4), G(5)], dir: -0.6, faction: 'ishida' }] },
        { t: 70, say: ['使番', '内府様の下知！　本多・井伊が出る。もう少し持ちこたえよ'], foes: [] }] } },
  ], en: [
    ['陣の柵を固めよ。明石の手がまだ追うて来る', "Secure the camp fence. Akashi's men are still coming."],
    ['陣の前の追手', 'Pursuers at the camp'], ['明石全登の手が陣の柵へ寄せる', "Akashi Takenori's men press on the camp fence"],
    ['陣の前まで追って来た明石の手を払え', "Drive off Akashi's men who chased you to the camp"],
    ['逃げる者を陣ごと崩せ！', 'Break the runners, camp and all!'], ['明石の追手', "Akashi's pursuers"], ['明石の槍組', "Akashi's spearmen"],
    ['葦の方からも来るぞ！', 'More from the reeds!'],
    ['息を継げ。島左近の旗が川を越えたぞ', "Catch your breath. Shima Sakon's banners have crossed the river."],
    ['島左近の押し', "Shima Sakon's push"], ['左近の旗本が最後に押して来る', "Sakon's guards make a last push"],
    ['島左近の旗本の押しを受け止めよ', "Hold against Shima Sakon's guards"],
    ['内府の陣の前で、もう一度鬨を上げよ！', "Raise the war cry once more before the Lord's camp!"],
    ['左近の旗本の先手', "Sakon's guard vanguard"], ['左近の鉄砲組', "Sakon's gunners"],
    ['鉄砲を並べて来た。間を詰めよ！', 'They are lining up guns. Close in!'],
    ['内府様の下知！　本多・井伊が出る。もう少し持ちこたえよ', "Orders from the Lord! Honda and Ii are coming out. Hold a little longer."],
  ] },
  // 第二次上田（1600/9）：退く徳川勢を、真田は神川の岸まで追い、虚空蔵山の方の伏兵が本陣の横を突いた
  k05_ueda: { faction: 'toyotomi', flag: 'sanada1600', look: (list) => list.map((q) => ({ ...q, o: { flag: 'sanada1600', mon: 'sanada', armor: 0x221e1b, ...(q.o || {}) } })), rows: [
    { rest: [['大久保忠隣', '真田の追手が神川の岸まで来る。兵をまとめて受けよ']] },
    { fight: { title: '神川の岸の追手', sub: '信繁の手が退く者を追う', obj: '神川の岸まで追って来た真田の手を払え',
      say: [['真田の侍', '退く者の背を討て。六文銭の旗を見せよ！']],
      foes: [{ name: '信繁の追手', list: [S(2), A(10)] }],
      later: [{ t: 30, say: ['徳川の足軽', '町屋の陰からも来るぞ！'], foes: [{ name: '町屋の伏兵', list: [S(2), A(8), G(2)], dir: 0.8 }] }] } },
    { rest: [['榊原康政', '北の林に旗が動いた。虚空蔵山の伏兵じゃ']] },
    { fight: { title: '北の林の伏兵', sub: '虚空蔵山の方から本陣の横を突く', obj: '本陣の横を突く真田の伏兵を防げ',
      say: [['真田の侍', '今じゃ。徳川の横腹を突け！']],
      foes: [{ name: '林の伏兵', list: [S(2), A(12)], dir: -0.9 }],
      later: [{ t: 35, say: ['大久保忠隣', '鉄砲の伏せもおる。散って寄れ'], foes: [{ name: '林の鉄砲組', list: [S(1), A(4), G(4)], dir: -0.4 }] }] } },
  ], en: [
    ['真田の追手が神川の岸まで来る。兵をまとめて受けよ', "Sanada's pursuers are reaching the Kangawa bank. Gather the men and hold."],
    ['神川の岸の追手', 'Pursuers at the Kangawa bank'], ['信繁の手が退く者を追う', "Nobushige's men chase the retreat"],
    ['神川の岸まで追って来た真田の手を払え', "Drive off the Sanada men chasing to the Kangawa bank"],
    ['退く者の背を討て。六文銭の旗を見せよ！', 'Strike their backs. Show them the six coins!'],
    ['信繁の追手', "Nobushige's pursuers"], ['町屋の伏兵', 'Ambush in the town'], ['町屋の陰からも来るぞ！', 'More from behind the houses!'],
    ['北の林に旗が動いた。虚空蔵山の伏兵じゃ', 'Banners moving in the north woods. An ambush from Kokuzo Hill!'],
    ['北の林の伏兵', 'Ambush from the north woods'], ['虚空蔵山の方から本陣の横を突く', 'Striking the main camp flank from Kokuzo Hill'],
    ['本陣の横を突く真田の伏兵を防げ', 'Stop the Sanada ambush hitting the camp flank'],
    ['今じゃ。徳川の横腹を突け！', "Now! Hit the Tokugawa flank!"], ['林の伏兵', 'Woodland ambush'], ['林の鉄砲組', 'Woodland gunners'],
    ['鉄砲の伏せもおる。散って寄れ', 'Hidden guns too. Spread out and close in.'],
  ] },
  // 鴫野（1614/11/26）：上杉は来援の豊臣勢を押し返し、堀尾・榊原に替わるのを断って持ち場を守り抜いた。大野治長は日暮れに城へ退いた
  k10_shigino: { faction: 'toyotomi', flag: 'toyotomi', look: (list) => list.map((q) => ({ ...q, o: { armor: 0x2a2622, ...(q.o || {}) } })), rows: [
    { rest: [['上杉景勝', '先手は譲らぬ。柵の跡で構え直せ']] },
    { fight: { title: '堤の上の新手', sub: '城から出た豊臣の新手が堤を寄せる', obj: '堤を寄せて来た豊臣の新手を押し返せ',
      say: [['豊臣の侍', '上杉を堤から追い落とせ。城の目の前ぞ！']],
      foes: [{ name: '堤の新手', list: [S(2), A(12)] }],
      later: [{ t: 30, say: ['水原親憲', '鉄砲、堤の下へ撃ち掛けよ。槍の者は前へ'], foes: [{ name: '堤の下の槍組', list: [S(2), A(10)], dir: 0.6 }] }] } },
    { rest: [['須田長義', '日が傾く。大野の旗本がもう一度押して来るぞ']] },
    { fight: { title: '大野治長の旗本', sub: '日暮れ前の最後の押し', obj: '大野治長の旗本の最後の押しを退けよ',
      say: [['大野の侍', '鴫野を取り返せ。修理様の前ぞ！']],
      foes: [{ name: '大野の旗本の先手', list: [S(2), A(10)] }],
      later: [{ t: 35, say: ['上杉の足軽', '鉄砲を並べて来た！'], foes: [{ name: '大野の鉄砲組', list: [S(1), A(4), G(5)], dir: -0.5 }] }] } },
  ], en: [
    ['先手は譲らぬ。柵の跡で構え直せ', "We won't give up the vanguard. Re-form at the old fence line."],
    ['堤の上の新手', 'Fresh troops on the embankment'], ['城から出た豊臣の新手が堤を寄せる', 'Fresh Toyotomi troops from the castle push along the embankment'],
    ['堤を寄せて来た豊臣の新手を押し返せ', 'Push back the fresh Toyotomi troops on the embankment'],
    ['上杉を堤から追い落とせ。城の目の前ぞ！', "Knock the Uesugi off the embankment. The castle is right there!"],
    ['堤の新手', 'Embankment reinforcements'], ['堤の下の槍組', 'Spearmen below the embankment'],
    ['鉄砲、堤の下へ撃ち掛けよ。槍の者は前へ', 'Guns, fire below the embankment. Spears, forward.'],
    ['日が傾く。大野の旗本がもう一度押して来るぞ', "The sun is sinking. Ono's guards are pushing again."],
    ['大野治長の旗本', "Ono Harunaga's guards"], ['日暮れ前の最後の押し', 'The last push before dusk'],
    ['大野治長の旗本の最後の押しを退けよ', "Repel the last push of Ono Harunaga's guards"],
    ['鴫野を取り返せ。修理様の前ぞ！', 'Take back Shigino. Our lord is watching!'],
    ['大野の旗本の先手', "Ono's guard vanguard"], ['大野の鉄砲組', "Ono's gunners"], ['鉄砲を並べて来た！', 'They are lining up guns!'],
  ] },
  // 樫井（k12）は書いて試したが、続きの段で本人が豊臣の殿の槍に囲まれて倒れる回が多く（act bot 7回に5回・敵の打ちの倍を下げても本人への一突き13のまま）、足さずに今のまま
  // 道明寺（1615/5/6）：真田・毛利は誉田の村に火を掛けて退いた。煙の中に殿の後の手が残り、追う者を斬り払った（伊達は深追いせず）
  k13_domyoji: { faction: 'toyotomi', flag: 'toyotomi', ownTick: true, dmg: 0.18, rows: [
    { rest: [['片倉重綱', '深追いはならぬ。だが村の火の中に、まだ殿の手が残っておる']] },
    { fight: { title: '煙の中の殿', sub: '誉田の村の火の中に残る豊臣の手', obj: '村の火の中に残った殿の手を払え',
      say: [['豊臣の侍', '煙に紛れて斬り返せ。追う者を一人も通すな！']],
      foes: [{ name: '村に残った殿', list: [S(2), A(10), G(2)] }],
      later: [{ t: 30, say: ['伊達の足軽', '焼けた家の陰からも来るぞ！'], foes: [{ name: '家の陰の槍組', list: [S(2), A(9)], dir: 0.7 }] }] } },
  ], en: [
    ['深追いはならぬ。だが村の火の中に、まだ殿の手が残っておる', "No deep pursuit. But their rearguard is still in the burning village."],
    ['煙の中の殿', 'Rearguard in the smoke'], ['誉田の村の火の中に残る豊臣の手', 'Toyotomi men left in the burning Konda village'],
    ['村の火の中に残った殿の手を払え', 'Drive off the rearguard left in the burning village'],
    ['煙に紛れて斬り返せ。追う者を一人も通すな！', 'Strike back under the smoke. Let no pursuer through!'],
    ['村に残った殿', 'Village rearguard'], ['家の陰の槍組', 'Spearmen behind the houses'], ['焼けた家の陰からも来るぞ！', 'More from behind the burnt houses!'],
  ] },
  // 八尾・若江（1615/5/6）：木村重成が討たれた後も、若江の堤では木村の家来が首を取らせまいと斬り返した。若江の崩れを聞いた長宗我部盛親は八尾から大坂へ退き、殿を残した
  k14_yao_wakae: { faction: 'toyotomi', flag: 'toyotomi', rows: [
    { rest: [['井伊直孝', '首を取らせまいと、木村の家来がまだ堤に残っておる']] },
    { fight: { title: '若江の堤の残り', sub: '主の首を守る木村の家来', obj: '堤に残った木村の家来を追い払え',
      say: [['木村の侍', '長門守様の首、渡しはせぬ！']],
      foes: [{ name: '木村の家来', list: [S(2), A(9)] }],
      later: [{ t: 30, say: ['井伊の足軽', '深田の向こうからも来るぞ！'], foes: [{ name: '深田の槍組', list: [S(2), A(9)], dir: 0.7 }] }] } },
    { rest: [['井伊直孝', '八尾の長宗我部が退くぞ。殿が若江の方へ回って来る']] },
    { fight: { title: '長宗我部の殿', sub: '八尾から大坂へ退く盛親の殿', obj: '八尾から退く長宗我部の殿を崩せ',
      say: [['長宗我部の侍', '殿は一領具足の役目ぞ。ここで止めよ！']],
      foes: [{ name: '長宗我部の殿', list: [S(2), A(12)], faction: 'chosokabe' }],
      later: [{ t: 35, say: ['井伊の侍', '鉄砲を並べて来た。間を詰めよ'], foes: [{ name: '殿の鉄砲組', list: [S(1), A(4), G(5)], dir: -0.5, faction: 'chosokabe' }] }] } },
  ], en: [
    ['首を取らせまいと、木村の家来がまだ堤に残っておる', "Kimura's retainers are still on the levee, guarding his head."],
    ['若江の堤の残り', 'Holdouts on the Wakae levee'], ['主の首を守る木村の家来', "Kimura's retainers guarding their lord's head"],
    ['堤に残った木村の家来を追い払え', "Drive off Kimura's retainers left on the levee"],
    ['長門守様の首、渡しはせぬ！', "We won't hand over our lord's head!"],
    ['木村の家来', "Kimura's retainers"], ['深田の槍組', 'Spearmen in the deep paddies'], ['深田の向こうからも来るぞ！', 'More from beyond the deep paddies!'],
    ['八尾の長宗我部が退くぞ。殿が若江の方へ回って来る', 'The Chosokabe at Yao are falling back. Their rearguard is swinging toward Wakae.'],
    ['長宗我部の殿', 'Chosokabe rearguard'], ['八尾から大坂へ退く盛親の殿', "Morichika's rearguard falling back from Yao to Osaka"],
    ['八尾から退く長宗我部の殿を崩せ', 'Break the Chosokabe rearguard falling back from Yao'],
    ['殿は一領具足の役目ぞ。ここで止めよ！', 'The rearguard is the ichiryo gusoku\'s duty. Stop them here!'],
    ['殿の鉄砲組', 'Rearguard gunners'], ['鉄砲を並べて来た。間を詰めよ', 'They are lining up guns. Close in.'],
  ] },
  // 木津川口（1614/11/19）：砦の守兵は博労淵へ退いた。博労淵の薄田兼相の手が様子を見に出、城から戻った明石全登の手も砦の北まで来たが、取り返せずに退いた
  k08_osaka_kizu: { faction: 'toyotomi', flag: 'toyotomi', dmg: 0.18, look: (list) => list.map((q) => ({ ...q, o: { armor: 0x2e1c16, lace: 0x2c2622, ...(q.o || {}) } })), rows: [
    { rest: [['蜂須賀至鎮', '幟は立てた。博労淵の方から新手が来るぞ。砦を固めよ']] },
    { fight: { title: '博労淵の手', sub: '薄田兼相の砦から出た豊臣の新手', obj: '博労淵から寄せた豊臣の新手を押し返せ',
      say: [['豊臣の侍', '木津川口を取り返せ。蜂須賀の幟を倒せ！']],
      foes: [{ name: '博労淵の新手', list: [S(2), A(12)] }],
      later: [{ t: 30, say: ['蜂須賀の足軽', '葦の中から鉄砲じゃ！'], foes: [{ name: '葦の鉄砲組', list: [S(1), A(4), G(4)], dir: 0.7 }] }] } },
    { rest: [['蜂須賀至鎮', '明石全登が城から戻ったと。北の口を固めよ']] },
    { fight: { title: '明石全登の戻り', sub: '城の評定から戻った明石の手', obj: '砦の北の口へ戻った明石の手を退けよ',
      say: [['明石の侍', '留守を突くとは卑怯なり。砦を返せ！']],
      foes: [{ name: '明石の手', list: [S(2), A(8)], dir: -0.4 }],
      later: [{ t: 35, say: ['使番', '明石の手は博労淵へ引くぞ。もう一押し！'], foes: [{ name: '明石の殿', list: [S(1), A(7)], dir: 0.3 }] }] } },
  ], en: [
    ['幟は立てた。博労淵の方から新手が来るぞ。砦を固めよ', 'The banner is up. Fresh troops are coming from Bakurobuchi. Secure the fort.'],
    ['博労淵の手', 'Bakurobuchi force'], ['薄田兼相の砦から出た豊臣の新手', "Fresh Toyotomi troops from Susukida Kanesuke's fort"],
    ['博労淵から寄せた豊臣の新手を押し返せ', 'Push back the fresh Toyotomi troops from Bakurobuchi'],
    ['木津川口を取り返せ。蜂須賀の幟を倒せ！', "Retake Kizugawaguchi. Tear down Hachisuka's banner!"],
    ['博労淵の新手', 'Bakurobuchi reinforcements'], ['葦の鉄砲組', 'Gunners in the reeds'], ['葦の中から鉄砲じゃ！', 'Guns from the reeds!'],
    ['明石全登が城から戻ったと。北の口を固めよ', 'Akashi Takenori is back from the castle. Secure the north gate.'],
    ['明石全登の戻り', "Akashi Takenori's return"], ['城の評定から戻った明石の手', "Akashi's men, back from the council at the castle"],
    ['砦の北の口へ戻った明石の手を退けよ', "Repel Akashi's men at the north gate of the fort"],
    ['留守を突くとは卑怯なり。砦を返せ！', 'Striking while we were away? Cowards! Give back the fort!'],
    ['明石の手', "Akashi's men"], ['明石の殿', "Akashi's rearguard"], ['明石の手は博労淵へ引くぞ。もう一押し！', "Akashi's men are pulling back to Bakurobuchi. One more push!"],
  ] },
  // 今福（1614/11/26）：上杉の横撃で木村・後藤は退いたが、堤の西に退き遅れた組が残って撃ち続けた
  k09_imafuku: { faction: 'toyotomi', flag: 'toyotomi', ownTick: true, rows: [
    { rest: [['佐竹義宣', '木村と後藤は退いた。堤の西に退き遅れた組がまだ撃っておる']] },
    { fight: { title: '堤の西の残り', sub: '退き遅れた豊臣の組', obj: '堤の西に残った豊臣の組を追い落とせ',
      say: [['豊臣の侍', '殿の退くまで、ここで撃ち続けよ！']],
      foes: [{ name: '退き遅れた鉄砲組', list: [S(2), A(4), G(5)] }, { name: '退き遅れた槍組', list: [S(2), A(10)], dir: 0.5}],
      later: [{ t: 40, say: ['渋江政光', '佐竹の面目じゃ。堤を取り切れ！'], foes: [] }] } },
    { rest: [['佐竹義宣', '後藤又兵衛が自ら槍を取って戻って来るぞ。構えよ']] },
    { fight: { title: '後藤又兵衛の槍', sub: '退く前に後藤の旗本が一度だけ返す', obj: '後藤の旗本の返しを受け止めよ',
      say: [['後藤の侍', '又兵衛様の前で退く背は見せぬ。もう一度押せ！']],
      foes: [{ name: '後藤の旗本', list: [S(2), A(10)] }],
      later: [{ t: 30, say: ['佐竹の足軽', '又兵衛が腕を撃たれたぞ！　後藤の手が退く！'], foes: [{ name: '後藤の殿', list: [S(1), A(7)], dir: 0.6 }] }] } },
  ], en: [
    ['後藤又兵衛が自ら槍を取って戻って来るぞ。構えよ', 'Goto Matabei himself is coming back with a spear. Ready yourselves.'],
    ['後藤又兵衛の槍', "Goto Matabei's spear"], ['退く前に後藤の旗本が一度だけ返す', "Goto's guards turn back once before withdrawing"],
    ['後藤の旗本の返しを受け止めよ', "Hold against the counterattack of Goto's guards"],
    ['又兵衛様の前で退く背は見せぬ。もう一度押せ！', "We won't show our backs before Lord Matabei. Push once more!"],
    ['後藤の旗本', "Goto's guards"], ['後藤の殿', "Goto's rearguard"], ['又兵衛が腕を撃たれたぞ！　後藤の手が退く！', "Matabei is shot in the arm! Goto's men are falling back!"],
    ['木村と後藤は退いた。堤の西に退き遅れた組がまだ撃っておる', 'Kimura and Goto have fallen back. A squad left behind west on the levee is still firing.'],
    ['堤の西の残り', 'Stragglers west on the levee'], ['退き遅れた豊臣の組', 'Toyotomi squads left behind'],
    ['堤の西に残った豊臣の組を追い落とせ', 'Drive the Toyotomi squads off the west levee'],
    ['殿の退くまで、ここで撃ち続けよ！', 'Keep firing here until the rearguard is clear!'],
    ['退き遅れた鉄砲組', 'Straggling gunners'], ['退き遅れた槍組', 'Straggling spearmen'], ['佐竹の面目じゃ。堤を取り切れ！', 'For the honor of the Satake. Take the whole levee!'],
  ] },
};
export { S, A, G, B, C, NAMED };
