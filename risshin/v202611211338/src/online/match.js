// オンライン対戦の試合の本体（K580・12/1・クラウド k365-cloud-18）。工程：docs/online_plan_1121.md。
//   一戦の流れ（online_final 121）：布陣 → 斥候 → 接敵 → 指揮と自分の戦い → 予備 → 本陣の攻め守り → 勝敗。
//   ここが持つ物：地図（模擬合戦の二つ＝平原・川と橋）・毎コマの順・一秒ごとの勝ち負けの判定（40 の pvp_rules.judge を呼ぶ）・降伏の札・二人の口（onlineMatch）。
//   兵・陣形・命令・AI・戦術・霧の中身は各係の部品（index.js の「つなぐ順」⑤）。読めない部品は飛ばして、試合は止めない。
import { dojo } from '../b_dojo.js';
import { syncCatchUp } from './sync_catchup.js';   // 37（11/21）：二人の合わせで写しのずれを詰める
import { FACTION, GENERALS } from '../units_data.js';
import { BUSHOU_ONLINE } from './bushou_online.js';
import { CARD_MON } from '../bushou_card_art.js';
import { isEn } from '../i18n.js';

// 模擬合戦の地図（final 93：地形はランダムにしない。12/1 はまず二つ）。大きさは m（布陣の画面の w・h も同じ数）
export const MATCH_MAPS = {
  heigen: { id: 'heigen', name: '平原', w: 400, h: 300 },
  kawa: { id: 'kawa', name: '川と橋', w: 400, h: 300, river: { z: 0, w: 14, bridges: [-60, 70], fords: [150] } },
};
export const MATCH_LENGTH = 900;   // 15分（final 87）。延長は pvp_rules.judge が返す

const parts = {};
const load = async (k, p) => { try { parts[k] = await import(p); } catch (e) { parts[k] = null; } };

// 二人の口（iMac② の通信が差す）。start(seed) で同じ試合を始め、send(msg)・recv(fn) で命令を交わす
let net = null;
// 勝ち負けは二人で一つ（11/21 司令塔の決め）：判定するのは部屋を開いた側（host）だけ。host は自分の向きの番号（0＝host・1＝客）で
//   { k:'result', winner, why, t, overtime } を送り、客は自分では判定せず、来た札を自分の向き（0⇄1 を入れ替え）に直して締める。
//   host が切れた時（40 の match_link で客の側が引き継ぐ）は host を客へ移す：matchHostTakeover() を呼ぶ。
export function onlineMatch(start, send, recv, o = {}) {
  net = { start, send, recv, host: o.host !== false };
  recv?.((m) => { if (m && m.k === 'result' && (!net.host || m.why === 'surrender')) applyRemoteResult(m); });
}
export function matchHostTakeover() { if (net) net.host = true; }
// 二人の口を外す（iMac② net_match.js の closeMatchLink がホームへ戻る時に呼ぶ）。外さないと、次の模擬合戦が前の客の向きのまま判定しなくなる
export function onlineMatchOff() { net = null; }
let curRt = null;
function applyRemoteResult(m) {
  const rt = curRt, M = rt?.flags?.match;
  if (!M || M.over) return;
  // 札の番号は host の向き。客は 0⇄1 を入れ替え、host（客の降伏を受けた時）はそのまま
  const flip = (w) => (w == null ? null : net?.host ? w : w === 0 ? 1 : 0);
  closeMatch(rt, M, { over: true, winner: flip(m.winner), why: m.why, overtime: !!m.overtime });
}

export async function startMatch(game, o) {
  await Promise.all([
    load('army', './army4k.js'), load('jin', './jinkei6.js'), load('cmd', './command.js'), load('cmdUi', './command_ui.js'),
    load('ai', './general_ai.js'), load('tac', './tactics.js'), load('rules', '../pvp_rules.js'), load('fogv', './fog_view.js'), load('pow', './bushou_power.js'), load('pick', './takeover_ui.js'),
  ]);
  // K592（11/21）：Bot 相手（練習・二人の口が無い時）は、相手を別の家の初めの4人にする（final 124：織田に島津）。前は自分と同じ4人が向かい合った
  if (!o.foe && (o.practice || !net)) o.foe = botFoe(o.generals);
  const def = matchDef(o);
  game.startDojo(null, def);
  return def;
}

// Bot の相手の4人：自分の総大将の家と違う家の、初めの4人（SS・S・A・N の順）。家は日ごとに回す（同じ日は同じ相手）
const RANK_ORDER = ['SS', 'S', 'A', 'R', 'N'];
export function botFoe(generals = [], day = new Date().getDate()) {
  const mine = BUSHOU_ONLINE.find((b) => b.name === generals[0])?.house;
  const houses = [...new Set(BUSHOU_ONLINE.filter((b) => b.start).map((b) => b.house))].filter((h) => h !== mine);
  if (!houses.length) return null;
  const h = houses[day % houses.length];
  const four = BUSHOU_ONLINE.filter((b) => b.start && b.house === h).sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)).map((b) => b.name);
  return four.length >= 4 ? four.slice(0, 4) : null;
}

// 戦の定義（稽古場の形を借りる。筋書きの戦は触らない）
export function matchDef(o) {
  const P = parts;
  return Object.assign({}, dojo, {
    id: 'online_match', name: o.map?.name || '模擬合戦', onlineMatch: true,
    // 二人の試合（練習でない）：アプリが裏に回っても一時停止しない（main.js の visibilitychange・__iosActive が見る。11/21 cloud-26）。止めると戻った時に札の『再開する』まで自分の備が止まり、相手の画面とずれた
    pvpNet: !!net && !o.practice,
    allOut: false,   // 47：一人の戦の全力の寄せ（all_out.js）は北の側だけを走らせ・見える敵へ寄せる（南は寄せない）ので、試合では切る（隊の動きは 47 の性格の AI）
    // 稽古場の寄せ手（next の波）・稽古の段・打ち込み台は出さない。広さと札の形だけ借りる
    next() {}, onKill() {},
    // 一時停止の「ホームへ戻る」で途中で抜けた：二人の試合なら本人が抜けた切断（40 の matchDrop・AI が継ぐ）にしてから、オンラインのホームへ
    onlineQuit(rt) { try { const M = rt?.flags?.match; if (M && !M.over) { M.cmd?.dispose?.(); if (net) import('./match_link.js').then((L) => L.matchDrop?.(rt, 0, true)).catch(() => {}); } } catch (e) { /* 抜けるのは止めない */ } setTimeout(() => (o.back || (() => {}))(), 0); },
    // 右上の目標（final 75「敵本陣を崩せ」）。稽古場の「▼の敵を倒せ」は出さない
    missionHeading: () => (isEn() ? 'Break the enemy HQ' : '敵本陣を崩せ'),
    // 両軍の人数の札は名目（32 の army4kNominal：4武将×1,000 から減った数）。目に入る本物の兵の数ではない
    armyNumbers: (rt) => (parts.army?.army4kNominal ? parts.army.army4kNominal(rt).map((n) => Math.round(n)) : null),
    setup(rt) {
      const F = rt.flags; curRt = rt;
      F.match = { t0: rt.t, judgeAt: 0, over: false, o };
      // 主人公の名は、自分で動かす武将（final 17）。稽古場の『稽古人』は出さない。G は稽古場の写しなので記録には残らない
      const me0 = (o.generals || [])[o.me ?? 0]; if (me0 && rt.G) rt.G.name = me0;
      if (P.army?.army4kSpawn) F.match.sonae = P.army.army4kSpawn(rt, rosterOf(o));
      // 武将の能力（27 の bushou_power.js）：備の押す力・士気の受けと、総大将の COMMAND の使番の速さ。差は約12%まで
      if (F.match.sonae && P.pow?.applyBushouPower) P.pow.applyBushouPower(rt, F.match.sonae, P.cmd);
      if (P.rules?.createFog) F.match.fog = P.rules.createFog({});
      // 命令（36）：輪の画面と相手からの命令の札。試合が終われば片付ける
      F.match.cmd = P.cmd?.matchCmdSetup?.(rt, { ui: P.cmdUi, net }) || null;
      // 二人の時の合わせ（11/21 cloud-26・online_pvp）：自分の備は自分の画面が本物。毎秒、自分の四備の減りと位置と崩れを送り、相手の画面の写しを合わせる
      if (net?.recv) net.recv((m) => { if (m?.k === 'st') syncFoe(rt, F.match, m); else if (m?.k === 'stf') syncOwnFromFoe(rt, F.match, m); });
      if (net) P.tac?.tacticsLink?.(rt, net);   // 11/21 cloud-31：使った固有戦術を相手の画面へ送り、受けた戦術を相手の武将に掛ける
      // 降伏の札と切断の口（40 の online/match_link.js）は index.js・net_session から呼ぶ。切断した側の備は s.byAI で AI が動かす（47 の matchAiTick）
    },
    update(rt, dt) {
      const F = rt.flags, M = F.match;
      if (M?.over && M.picking) { M.picking.close(); M.picking = null; }   // 48：試合が終われば引き継ぎの札を片付ける
      if (!M || M.over) return;
      P.army?.army4kTick?.(rt, dt);
      // 討死の引き継ぎ（final 18・36 の takeOverGeneral）：本人が倒れる手前で、生きている味方の武将の体へ移る（元の隊は副将の AI へ）。
      //   選ぶ画面は 36 の受け持ち（今は一番近い武将へ自動）。移る相手がいなければ、そのまま討死（負けの判定は本陣と士気で決まる）
      //   48（11/21・18 と 36 に断り）：移れる武将が二人以上なら、顔の札（takeover_ui.js）で選ぶ。選ぶ間は本人を倒させない（時は止めない）。
      //   五秒で選ばなければ一番近い武将へ。道具（bot・描かず）は今まで通り一番近い武将へすぐ移る
      const me = rt.player?.u;
      //   11/21 通しで、一太刀で一割余りを飛び越えて倒れ、引き継がずに『訳の無い負け』で締まった（合戦2・586秒）。手前の線を二割半へ上げ、
      //   移る相手がいない時は、判定の訳（taisho＝自分の武将が皆討たれた）を付けて締める（18）
      if (M.picking && me) { me.hp = Math.max(me.hp, 1); rt.player.retryGraceUntil = Math.max(rt.player.retryGraceUntil || 0, rt.t + 0.5); }
      else if (me?.alive && me.hp < me.maxHp * 0.25 && P.cmd?.takeOverGeneral) {
        const list = (M.sonae || []).filter((S) => !S.team && S.b?.taishoU?.alive && S.b.taishoU !== me && S.taisho !== rt.G?.name)   // 今動かしている武将の備（その将の写しの体）は除く（48）
          .sort((a, b) => Math.hypot(a.b.taishoU.pos.x - me.pos.x, a.b.taishoU.pos.z - me.pos.z) - Math.hypot(b.b.taishoU.pos.x - me.pos.x, b.b.taishoU.pos.z - me.pos.z));
        const go = (S) => {
          M.picking = null;
          const from = M.lead || (M.sonae || []).find((x) => !x.team);   // 本人が今まで率いていた備
          if (S?.b?.taishoU?.alive && P.cmd.takeOverGeneral(rt, S.b.taishoU)) {
            M.takeovers = (M.takeovers || 0) + 1; if (rt.G && S.taisho) rt.G.name = S.taisho;
            // 48（11/21・32 の見立て）：本人が離れた元の備は、47 の AI が own0（本人の隊）として飛ばすので止まっていた。
            //   切断の引き継ぎと同じ s.byAI を立てて、性格の AI に渡して動かし続ける
            if (from && from !== S) { from.byAI = true; from.mine = false; }
            S.mine = true;   // 31 の『戦術可能』の札も今率いる備へ
            M.lead = S;
          }
        };
        const tool = typeof location !== 'undefined' && /[?&](bot|norender)/.test(location.search);
        if (list.length > 1 && P.pick?.openTakeoverPick && !tool) {
          M.picking = { close: () => {} };
          M.picking.close = P.pick.openTakeoverPick(list.map((S) => ({ name: S.taisho, S })), (c) => go(c.S));
        } else if (list[0]) go(list[0]);
        else if (me.hp <= me.maxHp * 0.05 && !(net && !net.host)) { closeMatch(rt, M, { over: true, winner: 1, why: 'taisho' }); return; }
      }
      // 3隊の AI（47）：自分の側は本人の隊を除いた三隊、練習の戦（模擬合戦）は相手の四隊も AI
      P.ai?.matchAiTick?.(rt, dt, M.sonae, { both: !!o.practice || !net, jin: P.jin, tac: P.tac });   // 47：陣形（26）と固有戦術（31）も性格で使い分ける
      P.jin?.jinTick?.(rt);
      P.tac?.tacticsTick?.(rt, dt);
      P.tac?.matchTacticsTick?.(rt, dt);   // 31：相手の AI が戦術を使う・自分の「戦術可能」の札（輪が受け持てば輪の札へ）
      if (M.fog) { try { P.fogv?.fogViewTick?.(rt, dt, M, P); } catch (e) { /* 霧の印が出せなくても試合は進む */ } P.rules?.tickFog?.(M.fog, rt.t - M.t0); }   // 33：自分の目で敵を見て（observe）、敵の印を画面へ
      if (rt.t >= M.judgeAt) { M.judgeAt = rt.t + 1; judgeNow(rt, M); if (net?.send && !M.over) sendState(rt, M); surrenderTick(rt, M); }
    },
  });
}

// 自分（0）と相手（1）の4武将の並び（32 の army4kLayout の形：name・side・x・z・facing・type・mine・major・line・slot）。
//   役は 0 総大将（本陣）・1 左翼・2 右翼・3 後詰（online_final 122・house.js の ROLES）。自分は南（−z）で北を向き、相手は北で南を向く。
//   布陣の画面（24）の layout があればその置き場（地図の左上が 0,0 の m）を、地図の真ん中が 0,0 の座標へ直して使う。
//   置き場の形は一つ＝layout[i].pos={x,y}（m・左上が 0,0・y＝世界の z + h/2・自陣は y の小さい側＝世界の −z）。{x,z} では来ない（fujin_ui.js toLayout・tools/online_fujin.test.mjs が見張る）。相手は模擬合戦なら同じ4人（練習の戦）
// K592（11/21）：自分（−z から +z を向く）の左は +x（カメラの右が −x）。前は左翼が −70 で、遊ぶ人の右に出ていた（相手も同じく逆）
const ROLE_AT = [[0, 0.40, 'honjin', 'center'], [70, 0.30, 1, 'left'], [-70, 0.30, 1, 'right'], [0, 0.46, 'gotsume', 'center']];
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
    return { name, side, x, z, facing, ...houseOf(name), type: L?.type || '標準', mine: side === 0 && i === (o.me ?? 0), major: i === 0, line, slot, jin: L?.jin || null };
  };
  return [...(o.generals || []).map((n, i) => one(n, i, 0)), ...(o.foe || o.generals || []).map((n, i) => one(n, i, 1))];
}

// 一秒ごと：両方の側を pvp_rules.judge の形にして呼ぶ。終われば勝ち負けへ
function judgeNow(rt, M) {
  const J = parts.rules?.judge;
  if (!J) return;
  const side = (team) => {
    // 備（sonae.js の Sonae）から：兵＝count()・始め＝b.nominal・士気＝morale()・潰走＝state '敗走'。本陣は総大将の備（line 'honjin'、無ければ一つ目）
    const L = (M.sonae || []).filter((s) => (s.team ? 1 : 0) === team);
    const H = L.find((s) => s.line === 'honjin') || L[0], left = H ? H.count() / Math.max(1, H.b?.nominal || 1000) : 0;
    return {
      // 本陣の四つの印は別々の物から（40 の案・11/21）：陣形の保ち＝本陣の組の integrity（army_morale.js・無ければ兵の残り）・総大将＝討死／退き・
      //   馬印＝本陣の備が『敗走』でない（立てたまま退いていない）・旗本＝本陣の備の兵の残り。前は四つが二つずつ重なり、討死＋兵35%未満で本陣落ちになった
      honjin: H?.honjin || {
        formation: H?.b?.real?.integrity != null ? H.b.real.integrity / 100 : left,
        taisho: H?.taishoDead ? 'dead' : H?.state === '敗走' ? 'retreated' : 'alive',
        umajirushi: !!H && H.state !== '敗走', hatamoto: left,
      },
      units: L.map((s) => ({ strength: s.count(), start: s.b?.nominal || 1000, morale: s.morale(), routed: s.state === '敗走' })),
      front: 0.5, kills: 0,
    };
  };
  if (net && !net.host) return;   // 客は判定しない（host の札を待つ）
  const r = J({ t: rt.t - M.t0, length: MATCH_LENGTH, sides: [side(0), side(1)], memo: (M.judgeMemo ||= {}) });   // memo：潰走が続いた秒を pvp_rules が持ち回す（11/21 40・一時の崩れで決着しない）
  if (!r?.over) return;
  if (net?.send) { try { net.send({ k: 'result', winner: r.winner, why: r.why, overtime: !!r.overtime, t: Math.round(rt.t - M.t0) }); } catch (e) { /* 送れなくても自分の画面は締める */ } }
  closeMatch(rt, M, r);
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

function closeMatch(rt, M, r) {
  if (surBtn) surBtn.style.display = 'none';
  M.over = true; M.result = r;
  parts.fogv?.fogViewDispose?.(M);   // 霧の印を片付ける
  // 毎日の務め（33 tsutome.js）のために、自分の固有戦術の回数を試合の帳へ（数えるのは 40 の matchSettle が一試合に一度だけ）
  try { M.myTactics = Object.entries(rt.tactics?.used || {}).filter(([k]) => k.startsWith('0:')).reduce((a, [, n]) => a + n, 0); } catch (e) { /* 数えられなくても締める */ }
  try { M.cmd?.dispose?.(); } catch (e) { /* 片付けられなくても締める */ }
  const WHY = { honjin: '本陣が崩れた', rout: '全軍が崩れた', time: '時間切れの判定', draw: '引き分け', taisho: '自分の武将が皆討たれた' };
  if (r.winner === 0) { if (rt.tracker) rt.tracker.main = true; rt.finish({ scriptedEnd: true }, 6); }
  else rt.finish({ failureReason: WHY[r.why] || '負け', scriptedEnd: true }, 6);
}

// 二人の時の合わせ：自分の四備を { k:'st', s:[[減り, x, z, 崩れ]] } で送る（自分の画面の座標。相手は裏返して読む）
const packSonae = (S) => [Math.round(S.b.lost || 0), Math.round(S.b.pos.x * 10) / 10, Math.round(S.b.pos.z * 10) / 10, S.state === '敗走' ? 1 : 0, S.b.real?.jin || null, S.taishoDead ? 1 : 0];
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
    if (routed && S.state !== '敗走') S.forceRout = true;
    if (dead && !S.taishoDead) S.taishoDead = true;
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
    if (dead && !S.taishoDead) S.taishoDead = true;
    // 陣形（5つ目）：自分の画面の AI（47 aiJin）が陣形を替えても、相手の画面の写しは布陣の陣形のままだった（online_pvp PVP_ROSTER・11/21 cloud-26）
    const g = S.b.real;
    if (jin && g?.units && g.jin !== jin && parts.jin?.applyJin) { try { parts.jin.applyJin(g, jin); } catch (e) { /* 陣形が替えられなくても合わせは続ける */ } }
    if (Number.isFinite(lost)) S.b.lost = Math.max(0, Math.min(S.b.nominal || lost, lost));
    if (routed && S.state !== '敗走') S.forceRout = true;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const to = { x: -x, z: -z };
    if (syncCatchUp(S, to, rt.t) || S.state === '敗走') return;   // 37：ずれの大きい備は先を読んで速く寄せる（sync_catchup.js）
    // 下知（S.order）は 1.5〜8 秒遅れて届き、毎秒の合わせが前の下知を上書きして動けなかった。合わせは下知でなく写しなので直に歩かせる（行き先が 8m 以上変わった時だけ）
    if (Math.hypot(S.b.pos.x - to.x, S.b.pos.z - to.z) > 15 && !(S._syncTo && Math.hypot(S._syncTo.x - to.x, S._syncTo.z - to.z) < 8)) {
      S._syncTo = to; S.pending = null; S.b.order({ id: 'move', to }); S.moveTo = { x: to.x, z: to.z };
    }
  });
}
