// オンライン対戦の試合の本体（K580・12/1・クラウド k365-cloud-18）。工程：docs/online_plan_1121.md。
//   一戦の流れ（online_final 121）：布陣 → 斥候 → 接敵 → 指揮と自分の戦い → 予備 → 本陣の攻め守り → 勝敗。
//   ここが持つ物：地図（模擬合戦の二つ＝平原・川と橋）・毎コマの順・一秒ごとの勝ち負けの判定（40 の pvp_rules.judge を呼ぶ）・降伏の札・二人の口（onlineMatch）。
//   兵・陣形・命令・AI・戦術・霧の中身は各係の部品（index.js の「つなぐ順」⑤）。読めない部品は飛ばして、試合は止めない。
import { dojo } from '../b_dojo.js';
import { syncCatchUp } from './sync_catchup.js';   // 37（11/21）：二人の合わせで写しのずれを詰める
import { FACTION, GENERALS } from '../units_data.js';
import { BUSHOU_ONLINE } from './bushou_online.js';
import { troopsOf } from './unit_type.js';
import { RANKED_TROOPS } from './rank_tier.js';   // K624⑤：格で率いる兵（N600〜SS2000）
import { CARD_MON } from '../bushou_card_art.js';
import { isEn } from '../i18n.js';
import { matchWorld, hillsOf, terrainOf } from './match_terrain.js';
import { tickKeys, frontValue, keysView } from './front_line.js';   // K603 47〜49：見えない戦線と地形の取り合い   // K601（11/21 k592）：布陣の絵図と同じ地形の戦場
import { hut } from '../props.js';
import * as THREE from 'three';
import { jinmakuTexture } from '../textures.js';   // K639 ⑧：本陣の陣幕

// 模擬合戦の地図（final 93：地形はランダムにしない。12/1 はまず二つ）。大きさは m（布陣の画面の w・h も同じ数）
export const MATCH_MAPS = {
  heigen: { id: 'heigen', name: '平原', w: 400, h: 300 },
  kawa: { id: 'kawa', name: '川と橋', w: 400, h: 300, river: { z: 0, w: 14, bridges: [-60, 70], fords: [150] } },
  // K605（11/21 k592）：筋書きの戦の地形から作った戦場（地形・地名・置ける範囲は match_terrain.js の TERRAIN）
  tennoji: { id: 'tennoji', name: '天王寺・岡山', w: 400, h: 300 },
  sekigahara: { id: 'sekigahara', name: '関ヶ原', w: 400, h: 300 },
  shitara: { id: 'shitara', name: '設楽原', w: 400, h: 300 },
  kawanaka: { id: 'kawanaka', name: '川中島', w: 400, h: 300 },
};
// K628 ④（kaito 11/22「対戦で長篠・天王寺を選んでも、その地になっていない」）：筋書きの戦の世界（標高・川・柵）をそのまま借りる戦場。
//   盤（400×300・自軍 −z）を筋書きの地へ回して置く（frame：盤の真ん中が地の x,z・rot は『守る側を選んだ時』の回り＝盤の +z が地のどの向きか）。
//   攻める側を選べば百八十度回す（どの家でもどちらの側でも）。defName／atkName は選ぶ札の一言。props(rt, defTeam, P) はその地の柵など（守る側の物）
export const STORY_FIELDS = {
  shitara: {
    battle: 'shitaragahara', mod: '../b_shitaragahara.js', key: 'shitaragahara', defName: '織田・徳川（馬防柵の内）', atkName: '武田（連吾川を渡る）',
    frame: { x: 80, z: 18, rot: Math.PI / 2 },
    // K634 ②：守り手は三重の馬防柵（x −2〜16）の一番内の列の西で受ける。敵が外の列（x 16）から push m 内に取り付けば槍で押し返す。柵の端は z 18±175（攻め手の回り込みの先）
    ai: { line: -2, outer: 16, inSign: -1, push: 6, ends: [18 - 175, 18 + 175] },
    // 馬防柵三重（筋書きと同じ x 14・七 m 置き・口は二つ）。設楽原の柵の線（b_shitaragahara.js SB）と同じ所
    props(rt, defTeam, P) { const B = P.suno?.buildBobosaku; if (!B) return; for (const f of B(rt, { x0: 14, z0: 18 - 175, z1: 18 + 175, gap: 7, gates: [18 - 55, 18 + 55], sealSeams: true })) if (f) f.team = defTeam; },
  },
  // 天王寺・岡山（b_k15_tennoji_okayama.js）：守る＝茶臼山（真田・豊臣の側・北）、攻める＝南から（徳川の側・家康の本陣は南）
  tennoji: { battle: 'k15_tennoji_okayama', mod: '../b_k15_tennoji_okayama.js', key: 'k15_tennoji_okayama', frame: { x: -70, z: 110, rot: 0 } },
  // 関ヶ原（b_k06_sekigahara.js）：守る＝笹尾山の麓の柵（西軍・西）、攻める＝陣場野から（東軍・東）。柵は筋書きと同じ線（口つき）
  sekigahara: {
    battle: 'k06_sekigahara', mod: '../b_k06_sekigahara.js', key: 'k06_sekigahara', frame: { x: -270, z: -160, rot: Math.PI / 2 },
    // K634 ②：西軍は笹尾山の麓（柵 x −354 の西）で受け、東軍は柵の両端（z −206・−136）からも回り込む
    ai: { line: -357, outer: -351, inSign: -1, push: 10, ends: [-206, -136] },
    props(rt, defTeam, P) { const W = P.bhelp?.wallLine; if (W) W(rt, [[-354, -206], [-356, -182], [-354, -160], [-351, -136]], { team: defTeam, hp: 900, gaps: [5, 6], name: '柵' }); },
  },
  // 川中島・八幡原（b_d01_kawanakajima.js）：守る＝八幡原の鶴翼（武田の側・南）、攻める＝霧の北から（上杉の側）
  // K634 ②：上杉（攻める側）は車懸り＝四十秒斬り合った隊は退き、空いた隊が同じ敵へ替わって当たる
  kawanaka: { battle: 'd01_kawanakajima', mod: '../b_d01_kawanakajima.js', key: 'd01_kawanakajima', frame: { x: 0, z: 5, rot: Math.PI }, ai: { kuruma: true } },
};
/** 盤（自軍 −z）の x,z を地の x,z へ（K628 ④）。fr＝{ x, z, rot }。無ければそのまま */
export function toWorldXZ(fr, x, z) { if (!fr) return { x, z }; const c = Math.cos(fr.rot), s = Math.sin(fr.rot); return { x: fr.x + x * c + z * s, z: fr.z + z * c - x * s }; }
/** 地の x,z を盤へ（地図の駒・押した地点） */
export function toMatchXZ(fr, x, z) { if (!fr) return { x, z }; const c = Math.cos(fr.rot), s = Math.sin(fr.rot), dx = x - fr.x, dz = z - fr.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; }
export const MATCH_LENGTH = 900;   // 15分（final 87）。延長は pvp_rules.judge が返す

const parts = {};
const load = async (k, p) => { try { parts[k] = await import(p); } catch (e) { parts[k] = null; } };

// 二人の口（iMac② の通信が差す）。start(seed) で同じ試合を始め、send(msg)・recv(fn) で命令を交わす
let net = null;
// 勝ち負けは二人で一つ（11/21 司令塔の決め）：判定するのは部屋を開いた側（host）だけ。host は自分の向きの番号（0＝host・1＝客）で
//   { k:'result', winner, why, t, overtime } を送り、客は自分では判定せず、来た札を自分の向き（0⇄1 を入れ替え）に直して締める。
//   host が切れた時（40 の match_link で客の側が引き継ぐ）は host を客へ移す：matchHostTakeover() を呼ぶ。
// K628 ⑤（kaito 11/22「敗走と出ても戦場に残る。四割を切ったら全員が退き、散り散りに逃げる」）：諸大名戦・対人戦の決まり。
//   隊（備）の兵が名目の四割を切ったら、その隊は立て直さず（再編しない）全員が背を向けて自陣の側へ散って逃げ、十二秒か地図の端で戦場から消える（討たれた数には入れない）。
//   消えた後は人数の棒・地図から外す（名目の残りを 0 に）。本陣（総大将の備）は勝ち負けの決まり（本陣陥落）に任せて外す
// K641 ①（kaito 11/22「敗走はその隊の大将が討たれた時か、兵が三割を切った時だけ。それ以外は敗走しない」）：四割を三割に改め、大将の討死でも崩す。
//   士気の低さだけの潰走（備の士気 15 未満・退きの中の 22 未満・組の士気 22 未満・一人ずつの逃げ）は止める（S.hardRoutOnly・組の noRout）。
//   士気はそのまま下がり、押す力・下知の受けには効く（崩れて逃げないだけ）
// K645 ①（kaito 11/23「兵が半分ほど残っていそうなのに敗走する。二割を切ったら敗走でいい」）：三割を二割に。崩れた時の残りの割合を S._k645left に残し、戦の記録（logEvent の rout）にも載せる
const K641_ROUT_AT = 0.2;
// K641 の続き（11/23 rush_honjin：開戦三十秒ほどで本人が斬られて別の武将へ移った時、本陣の大将の体は無傷なのに『味方の総大将討死』で負けた）：
//   本人が移る時（K639 ⑪・K640）、元の隊に討死の印（taishoDead・K603 の士気の下げと下知の遅れ）を立てるが、本人の体はその隊の大将の体とは別のことがある。
//   決着（総大将の討死）と K641 ① の敗走では、大将の体（taishoU）を持つ隊は、その体が本当に倒れた時だけ討死と数える（体の無い隊は今まで通り印で）
//   対人戦で相手の画面から来た討死（packSonae の六つ目＝相手の画面の k641ChiefGone）は、そのまま討死と数える（_k641remoteDead）
function k641ChiefGone(S) { if (S?._k641remoteDead) return true; const u = S?.b?.taishoU; return u ? !u.alive && !u.gone : !!S?.taishoDead; }
function k628Rout(rt, M) {
  const mp = M.o?.map || { w: 400, h: 300 }, A = rt.army;
  for (const S of M.sonae || []) {
    const B = S.b; if (!B || !(B.nominal > 0)) continue;
    if (!S._out) {
      if (S.line === 'honjin' || S.major || B.aliveNominal() <= 0) continue;
      if (!k641ChiefGone(S) && B.aliveNominal() >= B.nominal * K641_ROUT_AT) continue;
      S._k641why = k641ChiefGone(S) ? 'taisho' : 'few'; S._k645left = +(B.aliveNominal() / B.nominal).toFixed(3);
      if (B.real) B.real.noRout = false;
    if (!S._out && !M.ending && !M.over) {
      S.hardRoutOnly = true;
      const g0 = B.real; if (g0 && !g0.noRout && !g0.routed) g0.noRout = true;
      if (S.forceRout && S.state !== '敗走' && !S._k641remote) S.forceRout = false;   // 士気の退きで立った崩しは外す（相手の画面の崩し＝syncFoe は残す）
    }
      S._out = rt.t; S.forceRout = true; S._tryRally = () => {};   // 立て直さない
      const g = B.real, home = S.team ? 1 : -1;   // 自陣の側（自軍は −z・敵は +z）
      if (g) {
        { const a = (Math.random() - 0.5) * 1.1; g.routed = true; g.noRally = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: Math.sin(a) * 0.8, z: home * Math.cos(a) }; }   // K639 ⑩：真後ろ一筋でなく、斜めにばらけて逃げる
        for (const u of g.units) if (u.alive && !u.isPlayer) { u.routIn = 0.2 + Math.random() * 3.5; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; }
      }
      if (B.light?.retreat) B.light.retreat(80);
      continue;
    }
    // 逃げた者を消す：一人ずつ十〜二十五秒の内の別々の時か、地図の端へ着いた時（討たれていない＝despawn）。
    //   K639 ⑩（kaito 11/22「自分の隊の潰走が早すぎ、一兵残らず消える」）：前は十二秒で全員を一度に消していた。散り散りに逃げる姿を見せてから、少しずつ消える
    const late = rt.t - S._out > 25, g = B.real;
    if (g && A?.despawn) for (const u of g.units) {
      if (!u.alive || u.gone || u.isPlayer) continue;
      u._k639out ??= S._out + 10 + Math.random() * 15;
      if (rt.t > u._k639out || Math.abs(u.pos.z) > mp.h / 2 - 6 || Math.abs(u.pos.x) > mp.w / 2 - 6) A.despawn(u);
    }
    if (late && !S._gone) { S._gone = true; B.lost = B.nominal; }
  }
}

export function onlineMatch(start, send, recv, o = {}) {
  net = { start, send, recv, host: o.host !== false };
  recv?.((m) => { if (m && m.k === 'result' && (!net.host || m.why === 'surrender')) applyRemoteResult(m); });
}
export function matchHostTakeover() { if (net) net.host = true; }
// 二人の口を外す（iMac② net_match.js の closeMatchLink がホームへ戻る時に呼ぶ）。外さないと、次の模擬合戦が前の客の向きのまま判定しなくなる
export function onlineMatchOff() { net = null; }
let lookOff = null;   // 合戦の間だけ置いた武将の姿を戻す（installOnlineLooks の戻り）
let curRt = null;
function applyRemoteResult(m) {
  const rt = curRt, M = rt?.flags?.match;
  if (!M || M.over) return;
  // 札の番号は host の向き。客は 0⇄1 を入れ替え、host（客の降伏を受けた時）はそのまま
  const flip = (w) => (w == null ? null : net?.host ? w : w === 0 ? 1 : 0);
  const sw = (v) => (Array.isArray(v) && !net?.host ? [v[1], v[0]] : v || undefined);   // K641 ②：討たれた兵の数も自分の向きへ
  closeMatch(rt, M, { over: true, winner: flip(m.winner), why: m.why, sub: m.sub || undefined, lead: m.lead || undefined, loss: sw(m.loss), start: sw(m.start), overtime: !!m.overtime });
}

export async function startMatch(game, o) {
  await Promise.all([
    load('army', './army4k.js'), load('jin', './jinkei6.js'), load('cmd', './command.js'), load('cmdUi', './command_ui.js'),
    load('ai', './general_ai.js'), load('tac', './tactics.js'), load('rules', '../pvp_rules.js'), load('fogv', './fog_view.js'), load('pow', './bushou_power.js'), load('pick', './takeover_ui.js'), load('kmk', './kachimake.js'), load('hud', './match_hud.js'), load('lv', './lord_voice.js'), load('rec', './match_record.js'),
  ]);
  // K592（11/21）：Bot 相手（練習・二人の口が無い時）は、相手を別の家の初めの4人にする（final 124：織田に島津）。前は自分と同じ4人が向かい合った
  if (!o.foe && (o.practice || !net)) o.foe = botFoe(o.generals);
  // K628 ④：筋書きの地の戦場。その戦の作り（世界の定義）と標高を読み、盤の回しを決める（o.side＝'atk' 攻める・それ以外は守る）
  parts.story = null; o._frame = null;
  const SF = STORY_FIELDS[o.map?.id];
  if (SF) {
    try {
      const [mod, A] = await Promise.all([import(SF.mod), import('../asset_manifest.js'), load('suno', '../b_sunomata.js'), load('bhelp', '../bhelp.js')]);
      const sd = mod[SF.key] || mod.default;
      if (sd?.world && await A.prepareBattleAssets(SF.battle).catch(() => false) !== false) {
        parts.story = { SF, def: sd, release: A.releaseBattleAssets };
        o._frame = { x: SF.frame.x, z: SF.frame.z, rot: SF.frame.rot + (o.side === 'atk' ? Math.PI : 0) };
      }
    } catch (e) { console.warn('筋書きの地を読めず、絵図の地で続けます', e); parts.story = null; o._frame = null; }
  }
  const def = matchDef(o);
  // K601 54・68（k600-engi）：表に無い武将も、登用・編成の3Dと同じ具足と顔で（online_look.js）。合戦の間だけ置き、締める時に戻す
  lookOff?.(); lookOff = await import('./online_look.js').then((L) => L.installOnlineLooks()).catch(() => null);
  game.startDojo(null, def);
  // K602：稽古場は筋書きの保存（足軽の弥五郎など）を写して本人にする。オンラインでは大名本人：名を大名に、位は大名（段4＝最初から馬に乗れる身分）
  const lord = (o.generals || [])[o.me ?? 0];
  if (game.G && LORDS.has(lord)) { game.G.name = lord; game.G.tegaraShown = 4; }
  return def;
}

// Bot の相手の4人：自分の総大将の家と違う家の、初めの4人（SS・S・A・N の順）。家は日ごとに回す（同じ日は同じ相手）
const RANK_ORDER = ['SSR', 'SR', 'R', 'N'];
export function botFoe(generals = [], day = new Date().getDate()) {
  const mine = BUSHOU_ONLINE.find((b) => b.name === generals[0])?.house;
  const houses = [...new Set(BUSHOU_ONLINE.filter((b) => b.start).map((b) => b.house))].filter((h) => h !== mine);
  if (!houses.length) return null;
  const h = houses[day % houses.length];
  // K601 25〜28：相手も同じ人数（4将戦・5将戦・6将戦）。初めの者を先に、足りなければ同じ家の者を位の順に
  const n = Math.max(4, Math.min(16, generals.filter(Boolean).length || 4)), rk = (a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  const four = [...BUSHOU_ONLINE.filter((b) => b.start && b.house === h).sort(rk), ...BUSHOU_ONLINE.filter((b) => !b.start && b.house === h).sort(rk)].map((b) => b.name);
  return four.length >= n ? four.slice(0, n) : null;
}

// K602（kaito 11/21）：オンラインの合戦で自分が操る体は、家選びで選んだ家の大名本人（筋書きの主人公は出さない）。
//   編成で大名は総大将に固定（hensei_ui）。index.js の toFujin が o.me をその並びの番にする。見た目（具足・兜・陣羽織）・名・旗は大名のもの（player.js の def.playerLook）
export const HOUSE_LORD = { oda: '織田信長', takeda: '武田信玄', uesugi: '上杉謙信', tokugawa: '徳川家康', mori: '毛利元就', shimazu: '島津義久' };
const LORDS = new Set(Object.values(HOUSE_LORD));
function lordLook(name) {
  if (!LORDS.has(name)) return null;
  const g = GENERALS[name], h = houseOf(name);
  return { ...(g || {}), face: 'player', real: 1, sode: true, flag: h.flag, mon: g?.mon && g.mon !== 'none' ? g.mon : h.flag };
}

// 戦の定義（稽古場の形を借りる。筋書きの戦は触らない）
export function matchDef(o) {
  const P = parts;
  return Object.assign({}, dojo, {
    id: 'online_match', name: o.map?.name || '模擬合戦', onlineMatch: true,
    // 長 11/21：携帯の記憶の守りで頁を読み込み直した後、同じ合戦から始め直すための控え（関数は持たない。対人戦は控えない＝ホームへ）
    resumeOpts: o.practice || o.npc ? (() => { try { return JSON.parse(JSON.stringify({ generals: o.generals, me: o.me, layout: o.layout, map: o.map, practice: !!o.practice, foe: o.foe, foeLayout: o.foeLayout, npc: o.npc, foeNominal: o.foeNominal, foeHeishu: o.foeHeishu, side: o.side || null })); } catch (e) { return null; } })() : null,
    playerLook: lordLook((o.generals || [])[o.me ?? 0]) || undefined,   // K602：大名本人の姿
    // K609（kaito『信玄で遊んでいるのに時々足軽の体になる』）：本人の姿の下地は筋書きの保存の身分（手柄）の装備で、大名の具足が覆わない所（汚れ・格・面頬・陣笠の型など）が
    //   保存の身分のまま残っていた（足軽の保存の人ほど足軽に見える）。オンラインでは装備の段を一番上に固める（保存は読まない）
    playerGearStep: 99,
    // K602：騎馬の大名（信玄・謙信など主兵種が騎馬）は馬に乗って騎馬隊を率いる。ほかの大名は徒歩で隊の中に立つ
    // 11/22 K639 ②（kaito「初めから馬に乗れる」）：主兵種を問わず、本人（大名も家臣も）は馬に乗って始める（player.js が onlineMatch を見て身分を問わない）。
    //   前（K602）は騎馬の大名だけ馬・ほかの大名は徒歩（playerOnFoot）だった
    playerHorse: true,
    // K601 82『布陣の地図と3Dの戦場が関係ない』の禁止：稽古場の擂り鉢の野ではなく、布陣の絵図と同じ表（match_terrain.js）の丘・林・川と浅瀬・道で戦場を作る。
    //   森で騎馬の足が落ちる・坂の登り・川は浅瀬でしか渡れない、は兵の動き（army_move.js の地形の効き目）がそのまま出す
    world: parts.story && o._frame ? parts.story.def.world : matchWorld(o.map?.id || 'heigen'),
    ...(parts.story && o._frame ? { moveLim: parts.story.def.moveLim ?? parts.story.def.world.moveLim ?? 260 } : {}),   // K628 ④：兵の歩ける枠は筋書きの地のまま
    spawn: (() => { const q = toWorldXZ(o._frame, 0, -130); return { x: q.x, z: q.z, heading: o._frame ? o._frame.rot : 0 }; })(),
    // 二人の試合（練習でない）：アプリが裏に回っても一時停止しない（main.js の visibilitychange・__iosActive が見る。11/21 cloud-26）。止めると戻った時に札の『再開する』まで自分の備が止まり、相手の画面とずれた
    pvpNet: !!net && !o.practice,
    allOut: false,   // 47：一人の戦の全力の寄せ（all_out.js）は北の側だけを走らせ・見える敵へ寄せる（南は寄せない）ので、試合では切る（隊の動きは 47 の性格の AI）
    // 稽古場の寄せ手（next の波）・稽古の段・打ち込み台は出さない。広さと札の形だけ借りる
    next() {}, onKill() {},
    // 一時停止の「ホームへ戻る」で途中で抜けた：二人の試合なら本人が抜けた切断（40 の matchDrop・AI が継ぐ）にしてから、オンラインのホームへ
    onlineQuit(rt) { lookOff?.(); lookOff = null; try { const M = rt?.flags?.match; if (M && !M.over) { M.cmd?.dispose?.(); if (net) import('./match_link.js').then((L) => L.matchDrop?.(rt, 0, true)).catch(() => {}); } } catch (e) { /* 抜けるのは止めない */ } setTimeout(() => (o.back || (() => {}))(), 0); },
    // 右上の目標（final 75「敵本陣を崩せ」）。稽古場の「▼の敵を倒せ」は出さない
    missionHeading: () => (isEn() ? 'Break the enemy HQ' : '敵本陣を崩せ'),
    // 両軍の人数の札は名目（32 の army4kNominal：4武将×1,000 から減った数）。目に入る本物の兵の数ではない
    armyNumbers: (rt) => (parts.army?.army4kNominal ? parts.army.army4kNominal(rt).map((n) => Math.round(n)) : null),
    // K601 67（11/21 k592）：布陣が終わったら、和紙の地図の真上から自軍の中央へカメラが降り、紙の駒が本物の1000人隊になる。
    //   いつものカメラ（player_camera）が決めた位置へ、真上の高い所から三秒で寄せる。和紙の色の幕が薄れて本物の隊が見えてくる。
    //   『動きを減らす』の設定では battle.js が camSway を呼ばない（降りずに始まる）。描かない道具・二人の試合の写しには関わらない（見た目だけ）
    camSway(rt, camera) {
      const M = rt.flags.match; if (!M || o.noDescent) return;
      const D = M.descent || (M.descent = { t0: performance.now(), dur: 3000 });
      // 読み込みの札（戦いの準備中）が出ている間は真上で待ち、札が消えてから降り始める
      const ld = typeof document !== 'undefined' && document.getElementById('loading');
      if (ld && !ld.hidden && getComputedStyle(ld).display !== 'none' && +getComputedStyle(ld).opacity > 0.05) D.t0 = performance.now();
      // K626（星1「合戦が始まるとすぐ落ちた」・11/22 iMac 立身の係）：開戦の一〜二秒は兵の体がまだ束ねられず部品ごとに描かれ、真上 165m から全軍を
      //   見下ろすと一コマ約1700回描いていた（一般の戦の山の四倍。docs/evidence_now/k626_start/）。束ねが整うまで（開戦から三秒半・描く回数が十コマ続けて 500 未満・長くて六秒）は、細かい形を近い三人までにして（units.js の low）、
      //   和紙の幕を濃いまま本人の目の高さで待ち（カメラは動かさない）、それから降りる
      if (!D.ready && typeof window !== 'undefined') {
        const calls = window.__renderer?.info?.render?.calls ?? 0;
        D.okN = calls > 0 && calls < 500 ? (D.okN || 0) + 1 : 0;
        D.w0 = D.w0 || performance.now();
        const held = performance.now() - D.w0;
        globalThis.__k626low = performance.now() + 500;
        if ((D.okN < 10 || held < 3500) && held < 6000) {
          if (!D.veil && typeof document !== 'undefined') { D.veil = document.createElement('div'); D.veil.setAttribute('aria-hidden', 'true'); D.veil.style.cssText = 'position:fixed;inset:0;z-index:35;pointer-events:none;background:radial-gradient(ellipse at 50% 60%,rgba(236,223,192,.55),rgba(217,200,162,.95));transition:none'; document.body.appendChild(D.veil); }
          D.t0 = performance.now(); return;
        }
        D.ready = true; D.t0 = performance.now(); globalThis.__k626low = performance.now() + 10000;   // K626 続き：降りる間と開戦から十秒は近い三人までのまま（幕を上げた所で細かい形が一度に千近く出て山 811 だった）。その間に骨の人が出来ていく
      }
      const k = Math.min(1, (performance.now() - D.t0) / D.dur);
      if (k >= 1) { if (D.veil) { D.veil.remove(); D.veil = null; } return; }
      if (!D.from) {
        const own = (M.sonae || []).filter((S) => S.team === 0); if (!own.length) return;
        const c = own.reduce((a, S) => ({ x: a.x + S.b.pos.x / own.length, z: a.z + S.b.pos.z / own.length }), { x: 0, z: 0 });
        const y = rt.world.heightAt(c.x, c.z);
        D.from = { p: camera.position.clone().set(c.x, y + 165, c.z - 70), q: camera.quaternion.clone() };
        const look = camera.position.clone().set(c.x, y, c.z + 25), save = camera.position.clone(), sq = camera.quaternion.clone();
        camera.position.copy(D.from.p); camera.lookAt(look); D.from.q.copy(camera.quaternion); camera.position.copy(save); camera.quaternion.copy(sq);
        // 和紙の幕：布陣の絵図の色から、本物の戦場へ薄れていく
        if (typeof document !== 'undefined' && !D.veil) { D.veil = document.createElement('div'); D.veil.setAttribute('aria-hidden', 'true'); D.veil.style.cssText = 'position:fixed;inset:0;z-index:35;pointer-events:none;background:radial-gradient(ellipse at 50% 60%,rgba(236,223,192,.55),rgba(217,200,162,.95));transition:none'; document.body.appendChild(D.veil); const v = D.veil; setTimeout(() => v.remove(), 30000); }   // 途中で抜けても幕を残さない（読み込みが長くても三十秒で外す）
      }
      const e = 1 - (1 - k) ** 3;   // 早く寄って、終わりはゆっくり
      camera.position.lerpVectors(D.from.p, camera.position.clone(), e);
      camera.quaternion.slerpQuaternions(D.from.q, camera.quaternion.clone(), e);
      if (D.veil) D.veil.style.opacity = String(Math.max(0, 1 - k * 2.2));
    },
    setup(rt) {
      const F = rt.flags; curRt = rt;
      F.match = { t0: rt.t, judgeAt: 0, over: false, o };
      // K564×K592（11/21 k592）：オンラインに入った時に裏で始まる武将の肖像の前撮り（index.js・127人を 3D で撮って toDataURL）を、合戦の間は止める。
      //   止めないと乱戦の一コマの約二割がこの撮り（drawImage・顔の絵・toDataURL）だった（6将戦の写し）。続きは試合が締まってから撮る
      import('../busho_portrait.js').then((P) => P.portraitStop?.()).catch(() => {});
      // 村（絵図の村と同じ所）：小さな家を三つ（hut）
      // K628 ④：筋書きの地の柵など（守る側の物）。守る側＝自分が守りを選んだら 0
      if (o._frame && parts.story?.SF.props) { try { parts.story.SF.props(rt, o.side === 'atk' ? 1 : 0, parts); } catch (e) { console.warn('筋書きの地の柵を置けず', e); } }
      if (o._frame) { const rel = parts.story?.release; rt.cleanupTasks?.add?.(() => { try { rel?.(); } catch (e) { /* 次の戦の読み込みで入れ替わる */ } }); }
      if (!o._frame) try { for (const v of terrainOf(o.map?.id || 'heigen').villages) [[-9, -4, 0.3], [8, 3, -0.2], [-1, 11, 1.4]].forEach(([dx, dz, r]) => rt.scene.add(hut(rt.world, v.x + dx, v.z + dz, 8, 5, r, { minka: true }))); } catch (e) { /* 家が建てられなくても試合は進む */ }
      // 主人公の名は、自分で動かす武将（final 17）。稽古場の『稽古人』は出さない。G は稽古場の写しなので記録には残らない
      // K609：本人が討たれる一太刀は、命を一つ残して止め、武将の引き継ぎ（下の update）へ回す。移る相手がいなければ、その時は討死として締める
      { const pl = rt.player, td = pl?.takeDamage?.bind(pl);
        if (td) pl.takeDamage = (amount, src) => { const u = pl.u, M2 = rt.flags.match; if (!M2 || M2.over || !u?.alive || !(amount > 0)) return td(amount, src);
          const r = td(amount, src); if (r > 0 && u.hp - r < 1) { M2.lethal = true; return Math.max(0, u.hp - 1); } return r; }; }   // 戻す数＝呼ぶ側（army_combat）が命から引く数
      // 踏まれる・深手・矢玉の甲冑など takeDamage を通らない傷もあるので、本人の倒れ（battle の playerDown・兵の kill）も、試合の間は命を一つ残して引き継ぎへ回す
      { const pd = rt.playerDown?.bind(rt); if (pd) rt.playerDown = (...a) => { const M2 = rt.flags.match, u = rt.player?.u; if (M2 && !M2.over && u) { u.hp = Math.max(1, u.hp); M2.lethal = true; return; } return pd(...a); };
        const kl = rt.army?.kill?.bind(rt.army); if (kl) rt.army.kill = (t, ...a) => { const M2 = rt.flags.match; if (t && t === rt.player?.u && M2 && !M2.over) { t.hp = Math.max(1, t.hp); M2.lethal = true; return; } return kl(t, ...a); }; }
      const me0 = (o.generals || [])[o.me ?? 0]; if (me0 && rt.G) rt.G.name = me0; if (me0 && rt.player?.u) rt.player.u.name = me0;   // K602：体の名も大名（稽古場の『稽古人』を残さない）
      if (P.army?.army4kSpawn) F.match.sonae = P.army.army4kSpawn(rt, rosterOf(o));
      if (o._frame && F.match.sonae) for (const S of F.match.sonae) S._fr = o._frame;   // K628 ④：地図の駒は盤へ戻して描く（match_hud.js）
      // K639 ⑧：本陣の陣幕と床几（読み込みの間に置く）
      if (F.match.sonae) F.match.camps = [0, 1].map((tm) => { try { return honjinCamp(rt, F.match.sonae.find((S) => (S.team ? 1 : 0) === tm && (S.line === 'honjin' || S.major)), tm); } catch (e) { return null; } });
      // 武将の能力（27 の bushou_power.js）：備の押す力・士気の受けと、総大将の COMMAND の使番の速さ。差は約12%まで
      if (F.match.sonae && P.pow?.applyBushouPower) P.pow.applyBushouPower(rt, F.match.sonae, P.cmd);
      // K627 ⑥（kaito 11/22「修羅が修羅でない」）：上級・修羅の相手の備に強さを掛ける（押す力・守り・始めの士気。general_ai.js NPC_LEVEL の power）。初級・中級は今まで通り
      { const Lv = o.npc ? P.ai?.NPC_LEVEL?.[o.npc.level] : null, pw = Lv?.power;
        if (pw && F.match.sonae) for (const S of F.match.sonae) { if (!S.team) continue; const B = S.b; if (!B) continue;
          B.powK = (B.powK || 1) * pw.pow; B.guardK = (B.guardK || 1) * pw.guard; B.morale = Math.min(100, (B.morale ?? 70) + (pw.morale || 0));
          const G = B.real; if (G) { G.dmgMult = (G.dmgMult || 1) * pw.pow; G.defMult = (G.defMult || 1) * pw.guard; G.morale = Math.min(100, (G.morale ?? 70) + (pw.morale || 0)); }
          // K629 ⑨：兵の数（名目）を上げる（本物の兵の数は変えない＝重さは同じ。名目が多いほど崩れにくく、人数の棒も多い）
          if (pw.troops && pw.troops !== 1) B.nominal = Math.round(B.nominal * pw.troops);
          // K629 ⑪：敵将の命と守り（taishoU の命を倍・受ける傷を割合で減らす）
          const L = B.taishoU; if (L && pw.lordHp) { L.maxHp = Math.round((L.maxHp || 100) * pw.lordHp); L.hp = L.maxHp; if (pw.lordGuard) L.dmgTakenK = (L.dmgTakenK || 1) * pw.lordGuard; } } }
      if (P.rules?.createFog) F.match.fog = P.rules.createFog({});
      // 命令（36）：輪の画面と相手からの命令の札。試合が終われば片付ける
      F.match.cmd = P.cmd?.matchCmdSetup?.(rt, { ui: P.cmdUi, net }) || null;
      // K602：大名本人の声（開戦と、命令の輪で下知を出した時の短い号令。lord_voice.js）
      if (P.lv && me0) { P.lv.loadLordVoice(me0); F.match.onCmd = () => P.lv.lordCall(rt, me0, 'cmd'); }
      // 二人の時の合わせ（11/21 cloud-26・online_pvp）：自分の備は自分の画面が本物。毎秒、自分の四備の減りと位置と崩れを送り、相手の画面の写しを合わせる
      if (net?.recv) net.recv((m) => { if (m?.k === 'st') syncFoe(rt, F.match, m); else if (m?.k === 'stf') syncOwnFromFoe(rt, F.match, m); });
      if (net) P.tac?.tacticsLink?.(rt, net);   // 11/21 cloud-31：使った固有戦術を相手の画面へ送り、受けた戦術を相手の武将に掛ける
      // 降伏の札と切断の口（40 の online/match_link.js）は index.js・net_session から呼ぶ。切断した側の備は s.byAI で AI が動かす（47 の matchAiTick）
    },
    update(rt, dt) {
      const F = rt.flags, M = F.match;
      if (M?.over && M.picking) { M.picking.close(); M.picking = null; }   // 48：試合が終われば引き継ぎの札を片付ける
      if (!M || M.over) return;
      if (M.npc === undefined) M.npc = o.npc || null;   // K613：本陣の厳しさ（hqTick の k613Strict）
      P.army?.army4kTick?.(rt, dt);
      M._k628T = (M._k628T || 0) + dt; if (M._k628T >= 0.5) { M._k628T = 0; k628Rout(rt, M); }
      // 討死の引き継ぎ（final 18・36 の takeOverGeneral）：本人が倒れる手前で、生きている味方の武将の体へ移る（元の隊は副将の AI へ）。
      //   選ぶ画面は 36 の受け持ち（今は一番近い武将へ自動）。移る相手がいなければ、そのまま討死（負けの判定は本陣と士気で決まる）
      //   48（11/21・18 と 36 に断り）：移れる武将が二人以上なら、顔の札（takeover_ui.js）で選ぶ。選ぶ間は本人を倒させない（時は止めない）。
      //   五秒で選ばなければ一番近い武将へ。道具（bot・描かず）は今まで通り一番近い武将へすぐ移る
      const me = rt.player?.u;
      //   11/21 通しで、一太刀で一割余りを飛び越えて倒れ、引き継がずに『訳の無い負け』で締まった（合戦2・586秒）。手前の線を二割半へ上げ、
      //   移る相手がいない時は、判定の訳（taisho＝自分の武将が皆討たれた）を付けて締める（18）
      // K639 ⑦（kaito 11/22「諸大名戦で自分が無敵」）：引き継ぎの札が出ている間ずっと命を一つ残していた（札を押さなければ討たれない＝無敵）。
      //   守るのは札が出てから八秒だけ。その後は普通に傷を負い、もう一度討たれる一太刀を受けたら、一番近い武将へ移る（移れる者がいなければ討死で締める）
      if (M.picking && me && rt.t - (M.pickAt ?? rt.t) < 8) { me.hp = Math.max(me.hp, 1); rt.player.retryGraceUntil = Math.max(rt.player.retryGraceUntil || 0, rt.t + 0.5); }
      else if (M.picking && me && M.lethal) { M.lethal = false; const pk = M.picking; M.picking = null; try { pk.close?.(); } catch (e) { /* 札が無くても進む */ } M.pickForce = true; M.lethal = true; }
      // K609（kaito 11/21『討たれていないのに勝手に他の武将へ飛ぶ』）：前は命が二割半を切った所で移っていた。今は討たれる一太刀を受けた時だけ
      //   （下の takeDamage の包みが、命を一つ残して M.lethal を立てる＝一太刀で飛び越えて倒れる事も無い）
      // K640（kaito 11/22「自分自身が無敵。命が0.1%ほど残った所から、ずっと減らない」）：討たれる一太刀は命を一つ残して止める（K609）が、
      //   移る仕組みが無い・移れなかった・何度も続く時は、命1のまま止まり続けていた。二十秒の内に四回より多く止まったら・移る仕組みが無ければ、討死で締める
      else if (me?.alive && M.lethal && (!P.cmd?.takeOverGeneral || ((M.lethalLog = (M.lethalLog || []).filter((x) => rt.t - x < 20)).length >= 4))) {
        M.lethal = false; if (!(net && !net.host)) { closeMatch(rt, M, { over: true, winner: 1, why: 'taisho', src: 'player' }); return; }
      }
      else if (me?.alive && M.lethal && P.cmd?.takeOverGeneral) {
        M.lethal = false; M.lethalLog.push(rt.t);
        // K603（11/21 k598-tonya の通し：『武将が皆討たれた』で負けた5戦のうち4戦は総大将が生きていた）：遠い備は将の体がまだ本物になっておらず
        //   （butai の軽い間は taishoU が無い）、取り代われる者がいないと見て即負けにしていた（要件書86『自分が死ぬと即負け』は禁止）。
        //   将の体が無い備も、将が生きていて崩れていなければ移れる者に数える（移る時は、その備の後ろへ本人を置く＝その将として率いる）
        //   潰走中の備も、将が生きていれば移れる（移った将が兵をまとめ直す）。崩れていない備を先に、近い順に
        const alive = (S) => !S.team && S !== M.lead && S.taisho !== rt.G?.name && !S.taishoDead && S.b?.aliveNominal?.() > 0;
        const posOf = (S) => (S.b?.taishoU?.alive ? S.b.taishoU.pos : S.b.pos);
        const list = (M.sonae || []).filter((S) => alive(S) && S.b.taishoU !== me)   // 今動かしている武将の備（その将の写しの体）は除く（48）
          .sort((a, b) => ((a.state === '敗走') - (b.state === '敗走')) || (Math.hypot(posOf(a).x - me.pos.x, posOf(a).z - me.pos.z) - Math.hypot(posOf(b).x - me.pos.x, posOf(b).z - me.pos.z)));
        // 将の体が無い備へ移る時の仮の体（その備の組の真ん中から五 m 後ろ。兵の中に立つ）
        const bodyOf = (S) => {
          if (S.b?.taishoU?.alive && !S.b.taishoU.gone && S.b.taishoU !== me) return S.b.taishoU;
          const c = S.b.real?.count ? S.b.real.center() : S.b.pos, f = S.b.facing || 0;
          return { alive: true, gone: false, team: me.team, hp: me.maxHp, heading: f, pos: me.pos.clone().set(c.x - Math.sin(f) * 5, me.pos.y, c.z - Math.cos(f) * 5) };
        };
        const go = (S) => {
          M.picking = null;
          const from = M.lead || (M.sonae || []).find((x) => !x.team);   // 本人が今まで率いていた備
          const ok = S && P.cmd.takeOverGeneral(rt, bodyOf(S));
          // K640：移れなかったら（体が作れない等）、命1のまま止め続けず討死で締める
          if (!ok && !(net && !net.host)) { closeMatch(rt, M, { over: true, winner: 1, why: 'taisho', src: 'player' }); return; }
          if (ok) {
            M.takeovers = (M.takeovers || 0) + 1; if (rt.G && S.taisho) rt.G.name = S.taisho;
            // 48（11/21・32 の見立て）：本人が離れた元の備は、47 の AI が own0（本人の隊）として飛ばすので止まっていた。
            //   切断の引き継ぎと同じ s.byAI を立てて、性格の AI に渡して動かし続ける
            if (from && from !== S) { from.byAI = true; from.mine = false; if (!from.taishoDead) import('../sonae.js').then((m) => m.sonaeTaishoDown?.(from, null)).catch(() => {}); }   // K603：本人だった将は討たれた（総大将なら全軍の士気と下知の遅れ・副将が継ぐ）
            S.mine = true;   // 31 の『戦術可能』の札も今率いる備へ
            M.lead = S;
          }
        };
        const tool = typeof location !== 'undefined' && /[?&](bot|norender)/.test(location.search);
        // K627 ④（kaito 11/22「命が0になると勝手に別の陣へ飛ぶ（ループ）」）：移れる武将が一人でも、札を出して押すまで待つ（輪で自動に移さない）。道具だけ今まで通り
        if (list.length && P.pick?.openTakeoverPick && !tool && !M.pickForce) {
          M.picking = { close: () => {} }; M.pickAt = rt.t;
          // K639 ⑪（kaito 11/22「下の札が数字の棒から急にアイコンに替わる→一つに揃える」）：顔の札の列（takeover_ui）は出さず、
          //   下の武将の札（match_hud の数字と棒の札）のうち移れる者を金の縁で光らせ、押して選ぶ（札は一つの形のまま）。HUD が無い時だけ前の顔の札
          if (M.hud?.cards) { M.picking.list = list; M.picking.choose = (S) => go(S); }
          else M.picking.close = P.pick.openTakeoverPick(list.map((S) => ({ name: S.taisho, S })), (c) => go(c.S));
        } else if (list[0]) { M.pickForce = false; go(list[0]); }
        else if (me.hp <= me.maxHp * 0.05 && !(net && !net.host)) { closeMatch(rt, M, { over: true, winner: 1, why: 'taisho', src: 'player' }); return; }
      }
      // 3隊の AI（47）：自分の側は本人の隊を除いた三隊、練習の戦（模擬合戦）は相手の四隊も AI
      P.ai?.matchAiTick?.(rt, dt, M.sonae, { both: !!o.practice || !net, jin: P.jin, tac: P.tac, hills: o._frame ? [] : hillsOf(o.map?.id || 'heigen'), keysFor: (tm) => keysView(M, tm), field: o._frame && STORY_FIELDS[o.map?.id]?.ai ? { ...STORY_FIELDS[o.map.id].ai, defTeam: o.side === 'atk' ? 1 : 0 } : null, npc: o.npc || null });   // 47：陣形（26）と固有戦術（31）も性格で使い分ける
      P.jin?.jinTick?.(rt);
      P.tac?.tacticsTick?.(rt, dt);
      P.tac?.matchTacticsTick?.(rt, dt);   // 31：相手の AI が戦術を使う・自分の「戦術可能」の札（輪が受け持てば輪の札へ）
      if (M.fog) { try { P.fogv?.fogViewTick?.(rt, dt, M, P); } catch (e) { /* 霧の印が出せなくても試合は進む */ } P.rules?.tickFog?.(M.fog, rt.t - M.t0); }   // 33：自分の目で敵を見て（observe）、敵の印を画面へ
      try { parts.kmk?.flagTick?.(rt, M, dt); } catch (e) { /* 旗が動かせなくても続ける */ }   // K613：崩れた隊の旗を倒す
      if (M.ending) { for (const U of M.uma || []) if (U?.obj && U.down) { U.tilt += (1.45 - U.tilt) * 0.08; U.obj.rotation.z = U.tilt; }   // 倒れていく馬印
        if (rt.t >= M.ending.at) { const r = M.ending.r; M.ending = null; sendResult(rt, M, r); closeMatch(rt, M, r); } return; }   // K603：本陣陥落の後、敵全軍の崩れを数秒見せてから締める
      if (!M.lordStart && rt.t - M.t0 > 2.5 && P.lv) { M.lordStart = true; P.lv.lordCall(rt, (o.generals || [])[o.me ?? 0], 'start'); }   // K602：開戦の号令
      try { P.hud?.tickMatchHud?.(rt, M, P); } catch (e) { /* 札が出せなくても試合は進む（K603） */ }
      // K564×K592（11/21 k592）：名のある武将の顔の絵（一人 1024 四方を CPU で描く）を、ぶつかる前の行軍の間に一人ずつ前描きする。
      //   前は乱戦で初めて近くへ来た時に描き、6将戦の写しで一コマの重さの一番（drawImage・headMaterial・toDataURL で約二割）だった。
      //   humans の prefetchFaces（あったが誰も呼んでいなかった）を、その将の所に置いた見なしのカメラで一度に百二十ミリ秒まで
      faceWarmTick(rt, M);
      if (rt.t >= M.judgeAt) { M.judgeAt = rt.t + 1; hqTick(rt, M); try { P.rec?.recTick?.(rt, M); } catch (e) { /* 記録が取れなくても試合は進む（K603 P1） */ } if (!o._frame) tickKeys(M, o.map?.id || 'heigen', rt.t - M.t0); foeEstimateTick(rt, M); judgeNow(rt, M); if (net?.send && !M.over) sendState(rt, M); surrenderTick(rt, M); }
    },
  });
}

// 自分（0）と相手（1）の4武将の並び（32 の army4kLayout の形：name・side・x・z・facing・type・mine・major・line・slot）。
//   役は 0 総大将（本陣）・1 左翼・2 右翼・3 後詰（online_final 122・house.js の ROLES）。自分は南（−z）で北を向き、相手は北で南を向く。
//   布陣の画面（24）の layout があればその置き場（地図の左上が 0,0 の m）を、地図の真ん中が 0,0 の座標へ直して使う。
//   置き場の形は一つ＝layout[i].pos={x,y}（m・左上が 0,0・y＝世界の z + h/2・自陣は y の小さい側＝世界の −z）。{x,z} では来ない（fujin_ui.js toLayout・tools/online_fujin.test.mjs が見張る）。相手は模擬合戦なら同じ4人（練習の戦）
// K592（11/21）：自分（−z から +z を向く）の左は +x（カメラの右が −x）。前は左翼が −70 で、遊ぶ人の右に出ていた（相手も同じく逆）
const ROLE_AT = [[0, 0.40, 'honjin', 'center'], [70, 0.30, 1, 'left'], [-70, 0.30, 1, 'right'], [0, 0.46, 'gotsume', 'center'],
  [35, 0.33, 1, 'left'], [-35, 0.33, 1, 'right']];   // K601 25〜28：5将戦の左中・6将戦の右中（相手探しは同じ人数どうしだけ＝server/online core.js pairUp）
// 11/21 K586（cloud-38）：武将の家と旗を備へ渡す。前は渡さず、相手の側（team 1）は既定の武田の家になり、同じ織田どうしの模擬合戦で相手の騎馬だけ武田の赤い旗と赤備えになった。
//   家＝登用の表（bushou_online.js）の house、旗＝その人の家の旗（named_gear の個人の旗印ではなく、隊の家紋の旗）。敵の旗は赤い縁で見分ける（units_look.js）
function houseOf(name) {
  const b = BUSHOU_ONLINE.find((r) => r.name === name), g = GENERALS[name] || {};
  // 11/21 K586：旗は登用の札と同じ家紋（CARD_MON が先）。前は蒲生＝織田の木瓜・景勝＝豊臣の桐・宗茂＝相印の蛇の目・高坂＝無地（mon 無し）で、札と戦場で家が違って見えた
  const mon = CARD_MON[name] || (g.mon && g.mon !== 'none' ? g.mon : null);
  const faction = b && FACTION[b.house] ? b.house : mon && FACTION[mon] ? mon : 'oda';
  // 旗印が家紋と別に名高い者は、備の旗をその旗印に（榊原の『無』の旗。札の家紋は源氏車）
  const FIELD_FLAG = { 榊原康政: 'sakakibara' };
  return { faction, flag: FIELD_FLAG[name] || mon || FACTION[faction]?.flag || (FACTION[faction] ? faction : 'oda') };
}
// K629 ⑦（kaito 11/22「武田だから全員赤、のように家で全部同じ色にしなくてよい」）：足軽の具足は家の色を残しつつ、隊ごとに少し変える（明るさと色味をわずかに）。
//   武将は本人の具足（GENERALS）のまま（butai.js は名のある将に色を渡さない）。敵味方は旗の赤い縁で見分ける（units_look.js）ので色は家のまま
const SHADE = [[1, 1, 1], [1.18, 1.05, 0.95], [0.84, 0.92, 1.08], [1.08, 1.12, 0.9], [0.9, 0.86, 0.94], [1.12, 0.96, 1.1]];
export function shadeArmor(hex, k) {
  if (hex == null) return undefined;
  const m = SHADE[((k % 6) + 6) % 6], f = (sh, mul) => Math.max(0, Math.min(255, Math.round(((hex >> sh) & 255) * mul)));
  return (f(16, m[0]) << 16) | (f(8, m[1]) << 8) | f(0, m[2]);
}
const HS_TYPE = { 鉄砲: '鉄砲重視', 騎馬: '騎馬重視', 槍: '槍重視', 弓: '標準' };
const FAV_TYPE = { std: '標準', yari: '槍重視', teppo: '鉄砲重視', kiba: '騎馬重視', shubi: '守備重視' };
function rosterOf(o) {
  const map = o.map || MATCH_MAPS.heigen;
  const one = (name, i, side) => {
    // 布陣の画面（24 の fujin_ui.js）の置き場は「地図の真ん中が原点の m・{x, z}・自陣（side 'south'）は +z」。試合は自分が −z で北（+z）を向く。
    //   前は {x, y}（左上が原点）として読み、x が 200m 西へずれ z が NaN になり、隊が場の端（moveLim 176m）の外に出て、兵が持ち場へ歩けなかった
    //   （33 11/21：陣形六つの確かめで、本陣の兵が持ち場の 25m 手前の場の端で止まり、柴田の隊は x −287）。z を裏返して自分を −z に、向きも裏返す。場の内（±170m）へ収める
    // 相手の布陣（二人の時 o.foeLayout）は相手の画面の置き場なので、真ん中を軸に裏返して北へ（11/21 cloud-26）：相手の画面の自分の置き場を百八十度回す
    const [dx, dz, line, slot] = ROLE_AT[i] || ROLE_AT[1], L = side === 0 ? o.layout?.[i] : o.foeLayout?.[i], sg = side ? -1 : 1;
    const LIM = 170, cl = (v) => Math.max(-LIM, Math.min(LIM, v));
    const centered = L?.pos && Number.isFinite(L.pos.z);
    const x = centered ? cl(sg * L.pos.x) : L?.pos ? sg * (L.pos.x - map.w / 2) : side ? -dx : dx;
    const z = centered ? cl(-sg * L.pos.z) : L?.pos ? sg * (L.pos.y - map.h / 2) : (side ? 1 : -1) * dz * map.h;
    const facing = centered && Number.isFinite(L.facing) ? (side ? -L.facing : Math.PI - L.facing) : side ? Math.PI : 0;
    // K603：本陣の備には馬廻衆の頭を副将に置く（総大将が討たれても本陣は退かず、頭が旗本をまとめ直す。kaito 11/21 45「副将が継げる」）
    // K601（11/21 k592）：布陣の枠（L.role）を備の役へ（後詰＝予備・本陣）。兵の型は布陣が渡す型、無ければその武将の得意（相手の Bot も兵種が読める）
    const ln = L?.role === '後詰' ? 'gotsume' : L?.role === '本陣' ? 'honjin' : L?.role ? 1 : line;
    const sl = L?.role ? ({ 左翼: 'left', 左中: 'left', 中央: 'center', 右中: 'right', 右翼: 'right' }[L.role] || 'center') : slot;
    const bo = BUSHOU_ONLINE.find((r) => r.name === name), fav = bo?.fav;
    // K608：登用の表に居ない家臣（伊達・北条・豊臣の名だけの者）は、その家の大名（相手の総大将）の家と旗に倣う
    const hz = side && !BUSHOU_ONLINE.some((r) => r.name === name) && !GENERALS[name] && (o.foe || [])[0] ? houseOf(o.foe[0]) : houseOf(name);
    // K611 ③（自由な戦）：相手の一隊の兵力（名目）と兵種を決められる（o.foeNominal・o.foeHeishu）
    const fN = side && o.foeNominal > 0 ? Math.min(10000, Math.round(o.foeNominal)) : null, fH = side && o.foeHeishu ? o.foeHeishu : null;
    const w = toWorldXZ(o._frame, x, z);   // K628 ④：筋書きの地へ回して置く（向きも同じだけ回す）
    return { name, side, x: w.x, z: w.z, facing: o._frame ? facing + o._frame.rot : facing, ...hz, armor: shadeArmor(FACTION[hz.faction]?.armor, i * 2 + side + 1), nominal: fN || (o.ranked ? RANKED_TROOPS : troopsOf(bo)),   // K580：ランク戦は全員同じ兵力（格の差は Cost の上限で釣り合わせる）
       ...(fH ? { heishu: fH } : {}), type: (fH && HS_TYPE[fH]) || L?.type || FAV_TYPE[fav] || '標準', mine: side === 0 && i === (o.me ?? 0), major: i === 0, line: ln, slot: sl, jin: L?.jin || null, fuku: ln === 'honjin' ? '馬廻衆頭' : null };
  };
  return [...(o.generals || []).map((n, i) => one(n, i, 0)), ...(o.foe || o.generals || []).map((n, i) => one(n, i, 1))];
}

// 一秒ごと：両方の側を pvp_rules.judge の形にして呼ぶ。終われば勝ち負けへ
function judgeNow(rt, M) {
  const J = parts.rules?.judge;
  if (!J) return;
  if (net && !net.host) return;   // 客は判定しない（host の札を待つ）
  const r = J({ t: rt.t - M.t0, length: MATCH_LENGTH, sides: [judgeSide(M, 0), judgeSide(M, 1)], memo: (M.judgeMemo ||= {}) });   // memo：潰走が続いた秒を pvp_rules が持ち回す（11/21 40・一時の崩れで決着しない）
  if (!r?.over) return;
  // K603（kaito 11/21 37「すぐ終わらず数秒 敵全軍の士気崩れを見せてから」）：本陣陥落は、負けた側の全隊を崩し（旗が下がり退く）、数秒の後に締める
  // K613（kaito 11/22「勝ち負けが分かりづらい」）：本陣陥落だけでなく、全軍潰走・時間切れ・武将が皆討たれた時も、決着の札（勝利／敗北と訳）を出し、
  //   負けた側の旗が倒れ兵が背を向けて逃げるのを数秒見せてから締める（kachimake.js）
  if (r.winner != null) {
    const loser = 1 - r.winner;
    for (const S of M.sonae || []) if ((S.team ? 1 : 0) === loser) { try { if (S.state !== '敗走') { S.addMorale(-40); S.forceRout = true; } parts.kmk?.routShow?.(rt, S, true); } catch (e) { /* 崩せなくても締める */ } }
    const H = honjinOf(M, loser); if (H && M.uma?.[loser]) M.uma[loser].down = true;
    try { import('../audio.js').then((A) => A.sfx?.('horagai', 0.9)).catch(() => {}); } catch (e) { /* 音が無くても進む */ }
    try { parts.kmk?.verdictShow?.(rt, M, r); crisisShow(rt, false); if (senEl) senEl.style.display = 'none'; } catch (e) { /* 札が出せなくても締める */ }
    M.ending = { r, at: rt.t + (parts.rules?.JUDGE?.fallShow ?? 4) };
    return;
  }
  sendResult(rt, M, r);
  closeMatch(rt, M, r);
}
function sendResult(rt, M, r) {
  if (net?.send) { try { net.send({ k: 'result', winner: r.winner, why: r.why, sub: r.sub || null, lead: r.lead || null, loss: r.loss || null, start: r.start || null, overtime: !!r.overtime, t: Math.round(rt.t - M.t0) }); } catch (e) { /* 送れなくても自分の画面は締める */ } }
}

// ---- K603 本陣（docs/kaito_online_battle_1121.md 29〜36・40〜46）----
//   本陣＝総大将の備（line 'honjin'）。中に総大将・旗本（侍）・槍・鉄砲・騎馬（馬廻）が本物でいる（army4k の MIX4K）。ここで足す物：
//   ①馬印（props.umajirushi）を本陣の後ろに立てる。HQ が崩れかけると傾き、陥落で倒れる ②毎秒 HQ_INTEGRITY と状態（pvp_rules.hqState）
//   ③危ない時：旗本前進（本陣の構えは army4k の honjinGuardTick）・方円（槍衾の輪）・後詰を本陣へ・自分の側だけ小さな「本陣危機」と法螺
//   ④総大将の討死：全軍の士気 −30・下知の遅れ（備の succeeded＝4秒）を三十秒・次の武将が総大将を継ぐ（報告に出す）
// K603 20〜22（11/21 k592）：敵の兵力は推定。見えている隊は今の数、見えない隊は最後に見た数（見た事が無ければ始めの数）を足し、
//   ゆっくり揺れる誤りを掛ける。情報の武将（元就・官兵衛・隆景）が自分の側に生きていれば誤りが小さい（推定が正確になる）。
//   M.foeEstimate＝{ q: 0〜6 の■の数, ratio: 0〜1, mood: 'up'|'even'|'down'（自軍から見て）, info: 情報の武将がいるか, seenEver }。HUD（match_hud.js）が読む
function faceWarmTick(rt, M) {
  const W = M.faceWarm || (M.faceWarm = { i: 0, at: rt.t + 2, busy: false });
  if (W.busy || rt.t < W.at || W.i >= (M.sonae || []).length || typeof document === 'undefined' || /[?&]norender/.test(location.search)) return;
  const S = M.sonae[W.i++], u = S?.b?.taishoU;
  if (!u?.pos) return;
  W.busy = true;
  const cam = { position: { x: u.pos.x, y: 0, z: u.pos.z } };
  import('../humans.js').then((H) => H.prefetchFaces?.(rt, cam, 120, () => !rt.disposed)).catch(() => 0).finally(() => { W.busy = false; W.at = rt.t + 1.5; });
}
const INFO_GENERALS = ['毛利元就', '黒田官兵衛', '小早川隆景'];
function foeEstimateTick(rt, M) {
  const foe = (M.sonae || []).filter((S) => S.team), mine = (M.sonae || []).filter((S) => !S.team);
  const fv = parts.rules?.fogView, seenMap = M.foeSeen || (M.foeSeen = {});
  let sum = 0, nom = 0, seenNow = 0;
  for (const S of foe) {
    const n0 = S.b?.nominal || 1000, live = S.state === '敗走' ? S.b.aliveNominal() * 0.3 : S.b.aliveNominal();
    const vis = fv ? !!fv(M.fog, S.id) : true;
    if (vis) { seenMap[S.id] = live; seenNow++; }
    sum += seenMap[S.id] ?? n0; nom += n0;
  }
  const info = mine.some((S) => INFO_GENERALS.includes(S.taisho) && !S.taishoDead && S.state !== '敗走');
  const t = rt.t - M.t0, amp = info ? 0.04 : 0.2;
  const noise = amp * Math.sin(t / 23 + 1.7) * (0.6 + 0.4 * Math.sin(t / 61));
  let ratio = Math.max(0, Math.min(1, (sum / Math.max(1, nom)) * (1 + noise)));
  // K615：敵の数は一度減ったら戻らない（揺れで 6000→5000→6000 と見えない）。推定は下にだけ動く
  if (M.foeEstimate && M.foeEstimate.ratio < ratio) ratio = M.foeEstimate.ratio;
  const myR = mine.reduce((a, S) => a + S.b.aliveNominal(), 0) / Math.max(1, mine.reduce((a, S) => a + (S.b?.nominal || 1000), 0));
  const k = myR / Math.max(0.05, ratio);
  M.foeEstimate = { q: Math.round(ratio * 6), ratio, mood: k > 1.25 ? 'up' : k < 0.8 ? 'down' : 'even', info, seenEver: Object.keys(seenMap).length > 0, seenNow };
}
const honjinOf = (M, team) => { const L = (M.sonae || []).filter((S) => (S.team ? 1 : 0) === team); return L.find((S) => S.line === 'honjin') || L[0] || null; };
function intrusionOf(M, H, team) {
  const home = H._home || H.b.pos; let v = 0;
  for (const E of M.sonae || []) {
    if ((E.team ? 1 : 0) === team || E.state === '敗走') continue;
    const d = Math.hypot(E.b.pos.x - home.x, E.b.pos.z - home.z);
    if (d < 45) v += (E.b.aliveNominal() / 1000) * (1 - d / 45) * 1.6;
  }
  return Math.min(1, v);
}
function hqInput(M, team) {
  const H = honjinOf(M, team); if (!H) return {};
  if (H.honjin) return H.honjin;   // 外から渡す時（試し）
  const hat = H.count() / Math.max(1, H.b?.nominal || 1000), inn = intrusionOf(M, H, team), u = H.b?.taishoU;
  const tai = k641ChiefGone(H) ? 'dead' : H.state === '敗走' ? 'retreated' : 'alive';
  const umaUp = !(M.uma?.[team]?.down) && H.state !== '敗走' && !(hat < 0.4 && inn >= 0.5) && tai === 'alive';
  if (H.state === '敗走') H._routSince ??= M.t ?? 0; else H._routSince = null;   // 本陣の潰走が十五秒続いた時だけ（一時の崩れで落とさない）
  return { strict: k613Strict(M, team), routed: H._routSince != null && (M.t ?? 0) - H._routSince >= 15, hatamoto: hat, umajirushi: umaUp, taisho: tai, taishoHp: u && u.maxHp ? Math.max(0, u.hp / u.maxHp) : 1, intrusion: inn, guardMorale: H.morale() };
}
// 戦線：自陣から敵陣へどれだけ押したか（0〜1）。両軍の始めの本陣の間で量る
function advanceOf(M, team) {
  const mine = honjinOf(M, team), foe = honjinOf(M, 1 - team); if (!mine || !foe) return 0;
  const a = mine._home || mine.b.pos, b = foe._home || foe.b.pos, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  let best = 0;
  for (const S of M.sonae || []) { if ((S.team ? 1 : 0) !== team || S.state === '敗走' || S.b.aliveNominal() <= 0) continue; const k = ((S.b.pos.x - a.x) * dx + (S.b.pos.z - a.z) * dz) / L2; if (k > best) best = k; }
  return Math.max(0, Math.min(1, best));
}
function judgeSide(M, team) {
  const L = (M.sonae || []).filter((s) => (s.team ? 1 : 0) === team);
  const adv = [advanceOf(M, team), advanceOf(M, 1 - team)];
  return {
    honjin: hqInput(M, team),
    units: L.map((s) => ({ strength: s.count(), start: s.b?.nominal || 1000, morale: s.morale(), routed: s.state === '敗走' })),
    // K603 47〜49：見えない戦線（兵の重みの押しの平均）と取り合う所（丘・橋・浅瀬・村・街道）。前は一番突き出た一隊だけで量った
    front: M.keyPts ? frontValue(M, team, [0, 1].map((tm) => { const h = honjinOf(M, tm); return h ? (h._home || h.b.pos) : null; })) : Math.max(0, Math.min(1, 0.5 + (adv[0] - adv[1]) / 2)),
    generals: { alive: L.filter((s) => !k641ChiefGone(s)).length, total: L.length },   // K641 の続き：本人が移った印だけでは数えない
    kills: (M.kills || [0, 0])[team],
  };
}
// 戦況の一行（kaito_online_battle_1121 48：上中央に小さく「戦況 拮抗」。変わった時だけ「自軍優勢」「右翼崩壊」などを少し強く出す。点や HP の棒は出さない）
//   自軍の兵×士気と、相手の推定（同じ量）を比べる。翼が崩れた時は翼の名で知らせる。字は短い一語だけ
let senEl = null;
function senkyoTick(rt, M) {
  if (typeof document === 'undefined') return;
  const pow = (team) => (M.sonae || []).filter((S) => (S.team ? 1 : 0) === team && S.state !== '敗走').reduce((n, S) => n + Math.max(0, S.b.aliveNominal()) * Math.max(0, S.morale()) / 100, 0);
  const a = pow(0), b = pow(1), r = b > 0 ? a / b : 9;
  const en = isEn();
  let word = r > 1.25 ? (en ? 'Advantage' : '自軍優勢') : r > 1.08 ? (en ? 'Slight edge' : '自軍やや優勢') : r < 0.8 ? (en ? 'Enemy advantage' : '敵軍優勢') : r < 0.93 ? (en ? 'Slightly behind' : '自軍やや劣勢') : (en ? 'Even' : '拮抗');
  // 翼の崩れ（自分の向きの左右。敵の翼は相手の向きで呼ぶ）
  M._wingSeen ||= {};
  for (const S of M.sonae || []) {
    // K613（kaito 11/22「敗走とかも分かりづらい」）：どの隊でも、崩れた時に「山県昌景隊 敗走」と短く出し、その隊の旗を倒す（kachimake.js）。立ち直れば次の崩れでまた出す
    if (S.state !== '敗走') { if (S._kmkRout) S._kmkRout = false; continue; }
    if (S._kmkRout) continue; S._kmkRout = true;
    try { parts.kmk?.routShow?.(rt, S); } catch (e) { /* 旗が倒せなくても続ける */ }
    M._senFlash = { text: parts.kmk?.routWord ? parts.kmk.routWord(S) : `${S.taisho}${en ? ' routed' : '隊 敗走'}`, until: rt.t + 5 };
  }
  if (!senEl) {
    senEl = document.createElement('div'); senEl.id = 'online-senkyo'; senEl.setAttribute('role', 'status');
    senEl.style.cssText = 'position:fixed;left:50%;top:calc(62px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:42;padding:2px 10px;border-radius:4px;background:rgba(14,11,8,.55);color:#e9dfc8;font:500 13px/1.4 "Noto Serif JP",serif;letter-spacing:.08em;pointer-events:none;transition:background .3s';
    document.body.appendChild(senEl);
    const dispose = rt.dispose.bind(rt); rt.dispose = (...x) => { senEl?.remove(); senEl = null; return dispose(...x); };
  }
  if (M._senWord && M._senWord !== word && !(M._senFlash?.until > rt.t)) M._senFlash = { text: word, until: rt.t + 4 };
  M._senWord = word;
  const fl = M._senFlash?.until > rt.t ? M._senFlash.text : null;
  senEl.textContent = fl || `${en ? 'Battle' : '戦況'}　${word}`;
  senEl.style.background = fl ? 'rgba(90,31,23,.85)' : 'rgba(14,11,8,.55)';
  senEl.style.fontWeight = fl ? '700' : '500';
  // K613：普段の「戦況 拮抗」は HUD（match_hud.js）の上のゲージの下に出る。ここは崩れ・敗走の知らせの時だけ、ゲージと本陣の目の下に出す（前は上のゲージの裏に隠れていた）
  senEl.style.display = M.over || M.ending || !fl ? 'none' : '';
}
let crisisEl = null;
function crisisShow(rt, on) {
  if (typeof document === 'undefined') return;
  if (!crisisEl) {
    crisisEl = document.createElement('div'); crisisEl.id = 'online-hq-crisis'; crisisEl.setAttribute('role', 'status');
    crisisEl.style.cssText = 'position:fixed;left:50%;top:calc(46px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:40;padding:3px 12px;border:1px solid #e0503a;border-radius:4px;background:rgba(40,10,6,.78);color:#ffe2cf;font:600 14px/1.4 "Noto Serif JP",serif;letter-spacing:.12em;pointer-events:none;display:none';
    document.body.appendChild(crisisEl);
    const dispose = rt.dispose.bind(rt); rt.dispose = (...a) => { crisisEl?.remove(); crisisEl = null; return dispose(...a); };
  }
  crisisEl.textContent = isEn() ? 'HQ in danger' : '本陣危機';
  crisisEl.style.display = on ? '' : 'none';
}
// K613（kaito 11/22「全然修羅じゃない。本陣も信長も一瞬で討ち取れた。修羅なら総大将は旗本・馬廻に守られ前へ出ず、本陣へ簡単に入れない・HP のずるは無しで動きと守りで」）
//   厳しい本陣（strict）＝諸大名戦の上級・修羅の相手（team 1）と、自分の本陣・対戦・練習の両軍。初級・中級の相手は今まで通り（初心者が勝てる）
//   ①総大将を『本陣の将』にする（u.isTaisho）：army_think の決まりで床几（本陣の後ろ六 m）から十 m より前へ出ない。
//     敵が三十 m 内（本人は四十 m）へ来れば、本陣の組の兵十八人が内の輪と槍衾で総大将を囲む（honjinWall） ②馬廻：本陣の騎馬（無ければ侍）六騎を総大将の脇に置き、
//     本人が二十八 m 内へ来たら本人へ、他の敵が総大将の十八 m 内へ来たらその者へ掛ける ③陥落は旗本を崩してから（pvp_rules の h.strict）
//   命・強さの数は触らない
// K613 の続き（11/22「難易度に関わらず総大将が狙われたら旗本・馬廻・近くの隊が必ず守る。初級は少し遅いだけ・HP は触らない」）：
//   どの難しさでも本陣を厳しく（陥落は旗本を崩してから）。難しさの差は、守りが気づく間合い（R0）と近くの隊の駆けつけの間隔だけ
function k613Strict() { return true; }
const UMA_N = 6, RING_IN = 8, RING_OUT = 18;
// 守りの者は officerHold（officer.js：行き先 to・相手 tgt。相手がいなければ持ち場で間合いの内の敵を斬る）で動かす。
//   一人用の本陣の構え（honjin_guard.js）は鉄砲・弓を輪に入れないが、オンラインの総大将の備は主兵種一つ（信長は鉄砲）なので、ここで兵種を問わず組む
function honjinWall(rt, M, H, team) {
  const u = H.b?.taishoU, g = H.b?.real, P = rt.player?.u, A = rt.army;
  const W = (M._wall613 ||= [{ uma: [], ring: [] }, { uma: [], ring: [] }])[team];
  const free = (v) => { v._k613Uma = false; if (v.officerHold?.k613) v.officerHold = null; };
  const release = () => { for (const v of W.uma) free(v); for (const v of W.ring) free(v); W.uma = []; W.ring = []; if (u?.officerHold?.k613) u.officerHold = null; };
  if (!u?.alive || u.gone || u === P || u.isPlayer || !g || g !== u.group || H.state === '敗走' || !A) { release(); return; }
  if (!u.isTaisho) u.isTaisho = 'k613';
  const f = H.b.facing || 0, hm = H._home;
  if (!u._seat613) { u._seat613 = true; u._seat = { x: hm.x - Math.sin(f) * 6, y: u.pos.y, z: hm.z - Math.cos(f) * 6 }; }
  W.seat = u._seat;
  const ok = (v) => v.alive && !v.gone && !v.fleeing && !v.woundOut && v.group === g;
  W.uma = W.uma.filter(ok); W.ring = W.ring.filter(ok);
  const taken = (v) => v._k613Uma || W.ring.includes(v);
  const can = (v) => ok(v) && v !== u && !v.isPlayer && !v.name && !v.isStandard && !v.stdHeld && !v.banner && !taken(v);
  // 馬廻：騎馬・侍を先に（足りなければ足軽）
  for (const type of ['cavalry', 'samurai', 'ashigaru']) for (const v of g.units) { if (W.uma.length >= UMA_N) break; if (v.type === type && can(v)) { v._k613Uma = true; W.uma.push(v); } }
  // 迫る敵：本人が四十 m 内か、ほかの敵が総大将の三十 m 内
  const pl = P?.alive && P.team !== u.team && !P.noTarget ? P : null, dP = pl ? Math.hypot(pl.pos.x - u.pos.x, pl.pos.z - u.pos.z) : 1e9;
  const lv = team === 1 && M.npc ? M.npc.level : 'shura', R0 = lv === 'shokyu' ? 24 : lv === 'chukyu' ? 32 : 40;
  // 近くの隊の駆けつけ：本人が総大将の R0 内へ来たら、近い味方の備（本陣でない・自分の備でない・敗走でない・百二十 m 内）を本人へ掛からせる（初級は十二秒・ほかは八秒ごと）
  if (pl && dP < R0 && !(W.helpT > rt.t)) {
    W.helpT = rt.t + (lv === 'shokyu' ? 12 : 8);
    const near = (M.sonae || []).filter((S) => S !== H && (S.team ? 1 : 0) === team && !S._mine && S.state !== '敗走' && S.b?.aliveNominal?.() > 0 && S.order && !(M.net && team === 0 && !S.ai))
      .map((S) => ({ S, d: Math.hypot(S.b.pos.x - u.pos.x, S.b.pos.z - u.pos.z) })).filter((o) => o.d < 120).sort((a, b) => a.d - b.d).slice(0, lv === 'shokyu' ? 1 : 2);
    for (const { S } of near) { try { S.order({ id: 'charge', to: { x: pl.pos.x, z: pl.pos.z }, target: null }); M.help613 = (M.help613 || 0) + 1; } catch (e) { /* 掛けられなくても進む */ } }
  }
  const foe = dP < R0 ? pl : A.nearestEnemy?.(u, 30, (o) => !o.fleeing && !o.isStruct && !o.civ) || null;
  const hold = (v, x, z, tgt) => { const oh = v.officerHold?.k613 ? v.officerHold : (v.officerHold = { k613: true, to: { x: 0, z: 0 }, tgt: null }); oh.to.x = x; oh.to.z = z; oh.tgt = tgt; };
  // 馬廻は総大将の脇に。本人が二十八 m 内、ほかの敵が十八 m 内へ来たらその者へ掛ける
  const umaT = dP < R0 - 12 ? pl : foe && Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) < 18 ? foe : null;
  W.uma.forEach((v, i) => { const side = i % 2 ? 1 : -1, k = 2.6 + 1.8 * (i >> 1); hold(v, u.pos.x + Math.cos(f) * side * k - Math.sin(f) * 1.2, u.pos.z - Math.sin(f) * side * k - Math.cos(f) * 1.2, umaT); });
  // 総大将は迫る敵から退き、輪の奥に立つ（床几から八 m まで。間近の二歩へ追い詰められた時だけ刀を振るう）
  if (foe) { const ax = W.seat.x - foe.pos.x, az = W.seat.z - foe.pos.z, ad = Math.hypot(ax, az) || 1; hold(u, W.seat.x + ax / ad * 8, W.seat.z + az / ad * 8, null); }
  else if (u.officerHold?.k613) u.officerHold = null;
  if (!foe) { for (const v of W.ring) free(v); W.ring = []; return; }
  H._k613Threat = rt.t + 4;   // 迫られた本陣：名目の兵を本物に替える（army4k の wantReal。描かれていなかった旗本が出て輪を厚くする）   // 敵がいない間は隊の並び（鉄砲は撃てる）
  // 旗本の輪：内の輪（総大将を四方から 3.2 m）と、敵の来る側の槍衾（7 m の弧）。輪の者は総大将へ寄る本人へ斬りかかる
  for (const v of g.units) { if (W.ring.length >= RING_IN + RING_OUT) break; if (can(v) && v.type !== 'gun' && v.type !== 'bow') W.ring.push(v); }
  for (const v of g.units) { if (W.ring.length >= RING_IN + RING_OUT) break; if (can(v)) W.ring.push(v); }
  const th = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  W.ring.forEach((v, i) => {
    const inner = i < RING_IN, a = inner ? th + (i / RING_IN) * Math.PI * 2 : th + ((i - RING_IN) / Math.max(1, RING_OUT - 1) - 0.5) * 2.1, r = inner ? 3.2 : 7;
    const x = u.pos.x + Math.sin(a) * r, z = u.pos.z + Math.cos(a) * r;
    const rush = pl && dP < (inner ? 6 : 16) && Math.hypot(pl.pos.x - v.pos.x, pl.pos.z - v.pos.z) < (inner ? 5 : 12) ? pl : null;
    hold(v, x, z, rush);
  });
  M.wall613 = M.wall613 || [0, 0]; M.wall613[team] = W.ring.length;
}
function hqTick(rt, M) {
  const R = parts.rules; if (!R?.hqIntegrity) return;
  const t = rt.t - M.t0; M.t = t;
  M.hq ||= [{}, {}]; M.uma ||= [null, null]; M.kills ||= [0, 0]; M.reserveUsed ||= [false, false]; M.maxAdv ||= [0, 0];
  for (const team of [0, 1]) {
    const H = honjinOf(M, team); if (!H) continue;
    H._home ||= { x: H.b.pos.x, z: H.b.pos.z };
    H._k613Strict = true;
    try { honjinWall(rt, M, H, team); } catch (e) { /* 守りが組めなくても試合は進む */ }
    const h = hqInput(M, team), v = R.hqIntegrity(h), st = R.hqState(h), q = M.hq[team];
    q.v = v; q.state = st; q.min = Math.min(q.min ?? 100, v);
    M.maxAdv[team] = Math.max(M.maxAdv[team], advanceOf(M, team));
    umaTick(rt, M, team, H, v, st);
    const bad = st === 'UNDER_ATTACK' || st === 'COLLAPSING';
    // 旗本前進・槍衾：本陣の組を方円（将を囲む輪）へ。後詰を本陣へ入れる（両軍とも。AI の側も同じ決まり）
    if (bad && !(q.guardT > t)) {
      q.guardT = t + 20;
      try { if (H.b.real && parts.jin?.applyJin && H.b.real.jin !== '方円') parts.jin.applyJin(H.b.real, '方円'); } catch (e) { /* 陣形が替えられなくても進む */ }
      const G = (M.sonae || []).find((S) => (S.team ? 1 : 0) === team && S.line === 'gotsume' && S.state !== '敗走' && S.b.aliveNominal() > 0 && !S._mine);
      let foe = null, fd = 1e9;
      for (const E of M.sonae || []) { if ((E.team ? 1 : 0) === team || E.state === '敗走') continue; const d = Math.hypot(E.b.pos.x - H._home.x, E.b.pos.z - H._home.z); if (d < fd) { fd = d; foe = E; } }
      if (G && foe && fd < 60) { G.order({ id: 'charge', to: { x: foe.b.pos.x, z: foe.b.pos.z }, target: foe.b }); M.reserveUsed[team] = true; }
    }
    if (team === 1) { try { parts.kmk?.hqTick?.(rt, M); } catch (e) { /* 本陣の目が出せなくても続ける */ } }   // K613：両本陣の守りの残り（ゲージの下）
    if (team === 0) {
      if (bad && !(q.hornT > t)) { q.hornT = t + 30; try { import('../audio.js').then((A) => A.sfx?.('horagai', 0.6)).catch(() => {}); } catch (e) { /* 音が無くても進む */ } }
      crisisShow(rt, bad && !M.over);
      try { senkyoTick(rt, M); } catch (e) { /* 戦況の一行が出せなくても試合は進む */ }
    }
    // 総大将の討死（一度だけ）：全軍の士気 −30・下知の遅れ・次の武将が総大将を継ぐ
    if (H.taishoDead && !q.chiefDown) {
      q.chiefDown = true; M.kills[1 - team] += 0;   // 討ち取りの数は下の見張りで数える
      const L = (M.sonae || []).filter((S) => (S.team ? 1 : 0) === team);
      for (const S of L) { try { S.addMorale(R.JUDGE?.taishoMorale ?? -30); if (!S.succeeded) { S.succeeded = true; S._lagK603 = true; } } catch (e) { /* 一つ崩せなくても続ける */ } }
      q.lagEnd = t + (R.JUDGE?.taishoLagFor ?? 30);
      const heir = L.find((S) => S !== H && !S.taishoDead && S.state !== '敗走');
      q.chiefName = H.taisho; q.heir = heir ? heir.taisho : null;
    }
    if (q.lagEnd && t >= q.lagEnd) { q.lagEnd = 0; for (const S of M.sonae || []) if ((S.team ? 1 : 0) === team && S._lagK603) { S._lagK603 = false; S.succeeded = false; } }
    // 討ち取った敵の武将の数（相手の備の大将が討たれた数）
    let k = 0; for (const S of M.sonae || []) if ((S.team ? 1 : 0) !== team && (S.taishoDead || S._k603Dead)) { S._k603Dead = true; k++; }
    M.kills[team] = k;
  }
}
// K639 ⑧（kaito 11/22「本陣を本陣らしく（陣幕・旗・馬印・床几）」）：本陣の備の出た所の後ろ十六m に陣幕の囲い（家紋を染め抜く）と大将の床几。
//   読み込みの間（setup）に置く＝形と shader は開戦の前の支度で作られ、開戦の一コマを重くしない。
//   描く物は幕（一枚の形・一つの材質）と床几（三つの箱を一つの形）だけ。筋書きの陣一式（柱・張り縄・篝火・小道具・人・楯）と場の幟は置かない
//   （場に足した幟は同じ家の旗の束ね描きを崩し、描く回数が百ほど増えた。筋書きの床几は軍配・毛皮まで持ち、形と絵が七十余り増えた）
function honjinCamp(rt, H, team) {
  const W = rt.world; if (!W?.heightAt || !rt.scene || !H?.b) return null;
  const fx = Math.sin(H.b.facing || 0), fz = Math.cos(H.b.facing || 0), cx = H.b.pos.x - fx * 16, cz = H.b.pos.z - fz * 16;
  const mon = H.flag || H.b?.flag || (team === 0 ? 'oda' : 'takeda');
  const hw = 7, hd = 5, gp = 2.5, H0 = 1.9, segs = [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-hw, hd, -gp, hd], [gp, hd, hw, hd]];
  const pos = [], uv = [], idx = [];
  for (const [ax, az, bx, bz] of segs) {
    const n = pos.length / 3, L = Math.hypot(bx - ax, bz - az), ya = W.heightAt(cx + ax, cz + az) + 0.15, yb = W.heightAt(cx + bx, cz + bz) + 0.15;
    pos.push(cx + ax, ya, cz + az, cx + bx, yb, cz + bz, cx + bx, yb + H0, cz + bz, cx + ax, ya + H0, cz + az);
    uv.push(0, 0, L / 4, 0, L / 4, 1, 0, 1); idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = jinmakuTexture(mon); tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
  const maku = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  const sy = W.heightAt(cx, cz - 2), sp = [], si = [];
  for (const [w, h, d, x, y, rz] of [[0.62, 0.05, 0.42, 0, 0.46, 0], [0.05, 0.62, 0.05, -0.22, 0.23, 0.55], [0.05, 0.62, 0.05, 0.22, 0.23, -0.55]]) {
    const b = new THREE.BoxGeometry(w, h, d); b.rotateZ(rz); b.translate(cx + x, sy + y, cz - 2);
    const n = sp.length / 3; sp.push(...b.attributes.position.array); si.push(...Array.from(b.index.array, (i) => i + n)); b.dispose();
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
  const stool = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0x5a1a14 }));
  for (const o of [maku, stool]) { o.userData.k603 = 1; rt.scene.add(o); }
  return { at: { x: cx, z: cz }, objs: [maku, stool] };
}
// 馬印：本陣の備の後ろ八 m に立て、崩れかけると傾き、陥落・退きで倒れる
function umaTick(rt, M, team, H, v, st) {
  let U = M.uma[team];
  if (!U) {
    if (!rt.world || !rt.scene) return;
    M.uma[team] = U = { obj: null, down: false, tilt: 0 };
    import('../props.js').then((P) => {
      if (!P.umajirushi || M.over) return;
      const kind = team === 0 ? 'ogi' : 'kinKarakasa';
      try { U.obj = P.umajirushi(rt.world, H.b.pos.x, H.b.pos.z, H.b.facing || 0, kind); U.obj.userData.k603 = 1; rt.scene.add(U.obj); } catch (e) { U.obj = null; }
    }).catch(() => {});
    return;
  }
  if (!U.obj) return;
  const fx = Math.sin(H.b.facing || 0), fz = Math.cos(H.b.facing || 0), x = H.b.pos.x - fx * 8, z = H.b.pos.z - fz * 8;
  U.obj.position.set(x, rt.world.heightAt ? rt.world.heightAt(x, z) : U.obj.position.y, z);
  if (st === 'FALLEN' || H.state === '敗走') U.down = true;
  const want = U.down ? 1.45 : st === 'COLLAPSING' ? 0.25 : 0;
  U.tilt += (want - U.tilt) * (U.down ? 0.5 : 0.3);
  U.obj.rotation.z = U.tilt;
}
// 報告（kaito 11/21 74：残存兵力・総大将・討取武将・本陣・最大戦線・段位、勝因・敗因を必ず）
function matchReport(rt, M, r) {
  const R = parts.rules, mine = (M.sonae || []).filter((S) => !S.team), now = mine.reduce((n, S) => n + Math.max(0, S.b.aliveNominal()), 0);
  const start = mine.reduce((n, S) => n + (S.b.nominal || 1000), 0), q = (M.hq || [])[0] || {}, H = honjinOf(M, 0);
  const chief = q.chiefDown ? (q.heir ? `討死（${q.heir}が継いだ）` : '討死') : H?.state === '敗走' ? '退却' : '生存';
  const hj = r.why === 'honjin' && r.winner === 1 ? '陥落' : q.state === 'COLLAPSING' ? '崩れかけ' : q.state === 'UNDER_ATTACK' ? '攻められた' : '健在';
  const wing = (team, slot) => { const S = (M.sonae || []).find((x) => (x.team ? 1 : 0) === team && x.slot === slot && x.line !== 'honjin' && x.line !== 'gotsume'); return S ? (S.state === '敗走' ? 0 : S.b.aliveNominal() / (S.b.nominal || 1000)) : null; };
  const ev = { foeTaishoDead: !!M.hq?.[1]?.chiefDown, myTaishoDead: !!q.chiefDown, reserveUsed: !!M.reserveUsed?.[0],
    wings: { left: wing(0, 'left'), right: wing(0, 'right') }, foeWings: { left: wing(1, 'left'), right: wing(1, 'right') } };
  let reasons = [];
  try { reasons = R?.matchReasons ? R.matchReasons(r, judgeSide(M, 0), judgeSide(M, 1), ev) : []; } catch (e) { reasons = []; }
  return { left: Math.round(now), start: Math.round(start), chief, kills: (M.kills || [0, 0])[0], honjin: hj, front: Math.round(100 * ((M.maxAdv || [0])[0] || 0)),
    rank: M.o?.practice ? null : (r.rankDelta ?? null), practice: !!M.o?.practice, ranked: !!M.o?.ranked, reasons, win: r.winner === 0,
    // K603 P1：勝因・敗因を戦の中の出来事の早い順から・流れ（年表）・見返しの写し（match_record.js）
    ...(() => { try { return parts.rec?.reportExtra ? parts.rec.reportExtra(M, r, reasons, isEn()) : {}; } catch (e) { return {}; } })() };
}
// 降伏の札（final 24〜27・40 の match_link.matchSurrender）。出来る時（始めの三分の後で、残り五分か兵力が相手の四割五分未満）だけ右上の目標の下に出す。
//   取り消せないので、一度目で『本当に降伏する』に替え、四秒の内にもう一度押した時だけ降伏する。二人の時は host の向きの番号で結果の札を送る
let surBtn = null;
// 札は白旗の絵が主（字は一語だけ）。二度目を待つ間は旗が赤い縁で揺れ、字が『本当に』に替わる
const FLAG = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M5 3v21" stroke="#e8dcc2" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h14l-3 4.5 3 4.5H6z" fill="#fbf8f0" stroke="#c9b48a" stroke-width="1"/></svg>';
function setSur(sure) {
  if (!surBtn) return;
  const t = sure ? (isEn() ? 'Really?' : '本当に') : (isEn() ? 'Surrender' : '降伏');
  surBtn.innerHTML = FLAG + '<span style="font-size:13px">' + t + '</span>';
  surBtn.setAttribute('aria-label', sure ? (isEn() ? 'Tap again to surrender' : 'もう一度押すと降伏する') : (isEn() ? 'Surrender' : '降伏する'));
  surBtn.style.borderColor = sure ? '#e0503a' : '#c9a46a';
}
function surrenderTick(rt, M) {
  if (typeof document === 'undefined') return;
  const can = !M.over && parts.rules?.canSurrender && parts.rules.canSurrender(surrenderState(rt, M)).ok;
  if (!can) { if (surBtn) surBtn.style.display = 'none'; return; }
  if (!surBtn) {
    surBtn = document.createElement('button'); surBtn.type = 'button'; surBtn.id = 'online-surrender';
    surBtn.style.cssText = 'position:fixed;right:calc(12px + env(safe-area-inset-right,0px));top:64px;z-index:41;min-height:44px;min-width:64px;padding:6px 10px;display:flex;align-items:center;gap:6px;font:600 13px/1.2 sans-serif;color:#fff4e0;background:rgba(40,30,22,.82);border:2px solid #c9a46a;border-radius:6px';
    surBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const rt2 = curRt, M2 = rt2?.flags?.match; if (!M2 || M2.over) return;
      if (!surBtn.dataset.sure) { surBtn.dataset.sure = '1'; setSur(true); setTimeout(() => { if (surBtn) { delete surBtn.dataset.sure; setSur(false); } }, 4000); return; }
      try {
        const L = await import('./match_link.js'), r = L.matchSurrender(rt2, 0);
        if (r?.ok) { surBtn.style.display = 'none'; try { M2.cmd?.dispose?.(); } catch (er) { /* 締めは match_link がする */ }
          if (net?.send) { const meHost = net.host; net.send({ k: 'result', winner: meHost ? 1 : 0, why: 'surrender', overtime: false, t: Math.round(rt2.t - M2.t0) }); } }
      } catch (er) { /* 降伏できなくても試合は続く */ }
    });
    document.body.appendChild(surBtn);
    const dispose = rt.dispose.bind(rt); rt.dispose = (...a) => { surBtn?.remove(); surBtn = null; return dispose(...a); };
  }
  if (!surBtn.dataset.sure) setSur(false);
  surBtn.style.display = '';
}
function surrenderState(rt, M) {
  const sum = (team) => (M.sonae || []).filter((s) => (s.team ? 1 : 0) === team).reduce((n, s) => n + Math.max(0, s.count()), 0);
  return { t: rt.t - M.t0, length: MATCH_LENGTH, myStrength: sum(0), foeStrength: sum(1) };
}

// 最後に締めた試合の帳（index.js が戦の後に初心者の道・誘いを数える。試合を片付けた後も読める）
let lastM = null;
export const lastMatch = () => lastM;
function closeMatch(rt, M, r) {
  lastM = M;
  // 合戦の間だけ置いた武将の姿（online_look.js）は、戦場を片付ける時に戻す（締めの数秒はまだ兵が立っている）
  if (lookOff && rt && !rt._lookOffWrap) { rt._lookOffWrap = 1; const d0 = rt.dispose.bind(rt); rt.dispose = (...a) => { lookOff?.(); lookOff = null; return d0(...a); }; }
  // 止めていた肖像の前撮りを、締まった後に続ける（撮れた人は飛ばす）
  setTimeout(() => import('../busho_portrait.js').then((P) => P.portraitPrewarm?.(BUSHOU_ONLINE.slice().sort((a, b) => 'SSANR'.indexOf(a.rank) - 'SSANR'.indexOf(b.rank)).map((b) => b.name))).catch(() => {}), 8000);
  if (surBtn) surBtn.style.display = 'none';
  M.over = true; M.result = r;
  try { parts.kmk?.verdictShow?.(rt, M, r); } catch (e) { /* 札が出せなくても締める */ }   // K613：降伏・引き分け・客の画面（見せの無い締め）も決着の札
  crisisShow(rt, false);
  if (senEl) senEl.style.display = 'none';
  try { r.report = matchReport(rt, M, r); } catch (e) { /* 報告が作れなくても締める */ }
  parts.hud?.unmountMatchHud?.(M);   // K603：画面の札を片付ける
  parts.fogv?.fogViewDispose?.(M);   // 霧の印を片付ける
  // 毎日の務め（33 tsutome.js）のために、自分の固有戦術の回数を試合の帳へ（数えるのは 40 の matchSettle が一試合に一度だけ）
  try { M.tacUsed = { ...(rt.tactics?.used || {}) }; } catch (e) { /* K603 島津の挑戦（釣り野伏を受けずに）の判定に（npc_reward.js） */ }
  try { M.myTactics = Object.entries(rt.tactics?.used || {}).filter(([k]) => k.startsWith('0:')).reduce((a, [, n]) => a + n, 0); } catch (e) { /* 数えられなくても締める */ }
  try { M.cmd?.dispose?.(); } catch (e) { /* 片付けられなくても締める */ }
  const WHY = { surrender: '降伏した', honjin: '本陣が崩れた', rout: '全軍が崩れた', time: '時間切れの判定', draw: '引き分け', taisho: '自分の武将が皆討たれた' };
  if (r.winner === 0) { if (rt.tracker) rt.tracker.main = true; rt.finish({ scriptedEnd: true }, 6); }
  else rt.finish({ failureReason: (parts.rules?.verdictLine ? parts.rules.verdictLine(r, isEn()) : null) || WHY[r.why] || '負け', scriptedEnd: true }, 6);   // K641 ②：負けの訳の一行
}

// 二人の時の合わせ：自分の四備を { k:'st', s:[[減り, x, z, 崩れ]] } で送る（自分の画面の座標。相手は裏返して読む）
const packSonae = (S) => [Math.round(S.b.lost || 0), Math.round(S.b.pos.x * 10) / 10, Math.round(S.b.pos.z * 10) / 10, S.state === '敗走' ? 1 : 0, S.b.real?.jin || null, k641ChiefGone(S) ? 1 : 0];   // K641 の続き：本当に倒れた時だけ
function sendState(rt, M) {
  const own = (M.sonae || []).filter((S) => S.team === 0);
  // mt：試合の秒（客はホストの試合の秒にそろえる。裏に回った間は時計が止まり、戻ると遅れていた）
  try { net.send({ k: 'st', t: Math.round(rt.t * 10) / 10, mt: Math.round((rt.t - M.t0) * 10) / 10, s: own.map(packSonae) }); } catch (e) { /* 切れた時は手元だけ進める */ }
  // 相手が切れて AI が継いでいる間（相手の備に byAI）は、この画面が相手の備の本物。戻った相手が自分の備をこの画面の様子へ合わせられるよう送る（stf）
  const foe = (M.sonae || []).filter((S) => S.team === 1);
  if (foe.some((S) => S.byAI)) { try { net.send({ k: 'stf', mt: Math.round((rt.t - M.t0) * 10) / 10, s: foe.map(packSonae) }); } catch (e) { /* 同じ */ } }
}
// 裏に回って（切れて）戻った側：相手の画面で AI が動かした自分の備の様子（stf）へ、自分の備を合わせる。減りは多い方・位置は寄せる（37 の syncCatchUp）・崩れ・討死も写す
function syncOwnFromFoe(rt, M, m) {
  if (!M || M.over || !Array.isArray(m.s)) return;
  const own = (M.sonae || []).filter((S) => S.team === 0);
  m.s.forEach((q, i) => {
    const S = own[i];
    if (!S || !Array.isArray(q)) return;
    const [lost, x, z, routed, , dead] = q;
    if (Number.isFinite(lost)) S.b.lost = Math.max(S.b.lost || 0, Math.min(S.b.nominal || lost, lost));
    if (routed && S.state !== '敗走') { S.forceRout = true; S._k641remote = true; }
    if (dead) { S._k641remoteDead = true; if (!S.taishoDead) S.taishoDead = true; }
    if (Number.isFinite(x) && Number.isFinite(z) && S.state !== '敗走') { const to = { x: -x, z: -z }; if (!syncCatchUp(S, to, rt.t) && Math.hypot(S.b.pos.x - to.x, S.b.pos.z - to.z) > 15) S.b.order({ id: 'move', to }); }
  });
}
// 相手の写し（team 1）を相手の本物に合わせる：減りはそのまま写し、15m 以上離れたら本物の所へ歩かせ、崩れたら崩す。切断して AI が継いだ備は触らない
function syncFoe(rt, M, m) {
  if (!M || M.over || !Array.isArray(m.s)) return;
  // 試合の時計：客はホストの試合の秒にそろえる（2 秒より離れたら。裏に回って戻った時・読み込みの遅れ）
  if (net && !net.host && Number.isFinite(m.mt)) { const d = m.mt - (rt.t - M.t0); if (Math.abs(d) > 2) M.t0 -= d; }
  const foe = (M.sonae || []).filter((S) => S.team === 1);
  m.s.forEach((q, i) => {
    const S = foe[i];
    if (!S || S.byAI || !Array.isArray(q)) return;
    const [lost, x, z, routed, jin, dead] = q;
    // 総大将の討死（6つ目）：本陣の落ち（pvp_rules honjinFallen）はホストの画面で決めるのに、写しの総大将は生きたままで、客の本陣が崩れてもホストが決着しなかった（11/21 cloud-26）
    if (dead) { S._k641remoteDead = true; if (!S.taishoDead) S.taishoDead = true; }
    // 陣形（5つ目）：自分の画面の AI（47 aiJin）が陣形を替えても、相手の画面の写しは布陣の陣形のままだった（online_pvp PVP_ROSTER・11/21 cloud-26）
    const g = S.b.real;
    if (jin && g?.units && g.jin !== jin && parts.jin?.applyJin) { try { parts.jin.applyJin(g, jin); } catch (e) { /* 陣形が替えられなくても合わせは続ける */ } }
    if (Number.isFinite(lost)) S.b.lost = Math.max(0, Math.min(S.b.nominal || lost, lost));
    if (routed && S.state !== '敗走') { S.forceRout = true; S._k641remote = true; }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const to = { x: -x, z: -z };
    if (syncCatchUp(S, to, rt.t) || S.state === '敗走') return;   // 37：ずれの大きい備は先を読んで速く寄せる（sync_catchup.js）
    // 下知（S.order）は 1.5〜8 秒遅れて届き、毎秒の合わせが前の下知を上書きして動けなかった。合わせは下知でなく写しなので直に歩かせる（行き先が 8m 以上変わった時だけ）
    if (Math.hypot(S.b.pos.x - to.x, S.b.pos.z - to.z) > 15 && !(S._syncTo && Math.hypot(S._syncTo.x - to.x, S._syncTo.z - to.z) < 8)) {
      S._syncTo = to; S.pending = null; S.b.order({ id: 'move', to }); S.moveTo = { x: to.x, z: to.z };
    }
  });
}
