// オンライン対戦と登用（K580・12/1）のつなぎ口。工程：docs/online_plan_1121.md（クラウド k365-cloud-18）。
//   入口（K595・K598 11/21）：メインのホーム（hub.js）の［武将登用］［オンライン対戦］が openOnline(game, 'toyo'|'match', back) を呼ぶ。
//   初めて押した時は 家選び → 大名＋家臣3人 → 初回の一行 → 元の所（登用か対戦）へ。オンライン専用のホームは人には出さない。
//   ?online=1 は試しの入口（tools/online_flow.mjs の模擬合戦の通し）として、元のオンラインのホームを開く。ソロの戦はこのファイルを読まない。
//   各係の部品は、ここから「つなぐ順」の通りに読む。まだ main に入っていない部品は読めなくても止めない（その画面を飛ばして、ホームへ戻る）。
//
// つなぐ順（11/21 決め。前が出来ないと後が試せない順）：
//   ① 表（一つにする）：武将の表は 27 の bushou_online.js が一つだけの元。48 の house.js の ROSTER・33 の busho_bank.js はそこから読む。
//      重複の武将印は 33（busho_bank.js の DUP_SEALS）が持ち主。27 の toyo_rules.js の DUP_SEAL はそれを読む（二つ持たない）。
//   ② 持ち物の保存：48 の house.js の loadOnline/saveOnline の一つの箱に、手持ち（33 の bank）と登用の数（27 の toyo state）も入れる。
//   ③ ホーム → 家を選ぶ → 編成（48 home_ui.js・hensei_ui.js）
//   ④ 布陣（24 fujin_ui.js の mountFujin）→ 試合（18 match.js）
//   ⑤ 試合の中身（match.js が順に呼ぶ）：兵（32 army4k.js ＋ 37 pvp_army.js の遠い塊）→ 陣形（26 jinkei6.js）→ 命令と総大将（36 command.js・command_ui.js）
//      → 動かさない3隊の AI（47 general_ai.js）→ 固有戦術（31 tactics.js）→ 霧・降伏・切断・勝ち負け（40 pvp_rules.js）
//   ⑥ 登用（27 toyo_screen.js）と交換所（33）。ホームの「登用」から
//   ⑦ 二人で（iMac② の通信）：match.js の onlineMatch(start, send, recv) の口に差す
import { addEn } from '../i18n.js';
let toTrialHook = null;
let henseiHook = null;   // K598：登用の後の［軍団に編成］で開く編成の画面
let TBL = null;  // 27 の表（試用で id から名を引く）
const loadTable = async () => (TBL = TBL || await has('./bushou_online.js'));
const has = (p) => import(p).catch((e) => { console.warn('オンラインの部品がまだ無い', p, e); return null; });

export async function bootOnline(game) {
  gameRef = game;
  const [H, E] = await Promise.all([has('./home_ui.js'), has('./hensei_ui.js')]);
  if (!H) return false;
  // 11/21 K586（cloud-38）：オンラインに入った時から、武将の顔を裏で先に撮って端末に残す（登用の書状・編成の札を開いて1秒内に顔が出るように。一度撮れば次から撮らない）
  Promise.all([import('../busho_portrait.js'), import('./bushou_online.js')]).then(([M, B]) => { M.addPortraitRows(B.BUSHOU_ONLINE.map((b) => [b.name, b.house])); M.portraitPrewarm(B.BUSHOU_ONLINE.slice().sort((a, b) => 'SSANR'.indexOf(a.rank) - 'SSANR'.indexOf(b.rank)).map((b) => b.name)); }).catch(() => {});
  // 毎日の務め（33）：数えは 40 の matchSettle（一試合に一度）。受け取れる務めが新しく出来ていたら、ホームへ戻った時に一度だけ札を出す
  const olHome = () => !game.battle && !!document.querySelector('.olh .olm-tile');   // オンラインのホームが出ている時だけ（K600）
  const home = () => { H.openOnlineHome(hooks); tsuShowIfReady(); tojoIfReady(home, olHome).then((shown) => { if (!shown && olHome()) dailyBonusIfReady(); }); };
  const hooks = {
    back: () => { game.title?.(); },
    hensei: E ? () => E.openHensei(null, home, home) : null,
    match: () => toFujin(game, home, { practice: false }),
    practice: () => toFujin(game, home, { practice: true }),
    toyo: () => toToyo(home),
    tsutome: () => toTsutome(home),
    kin: (done) => toToyo(done, { startAt: 'kin' }),   // 48 のホームの金の『＋』：買い場を開き、閉じたら done（ホームはそのまま）   // 48 へ：ホームに「務め」の札を置く時はこの口
  };
  henseiHook = hooks.hensei;
  // 武将の試用（33）：持っていない武将も、模擬合戦で総大将に据えて試せる（手持ちにも武将印にも触らない）
  toTrialHook = async (id) => {
    await loadTable();
    const Ho = await has('./house.js'); const save = Ho?.loadOnline?.();
    const n = TBL?.BUSHOU_BY_ID[id]?.name;
    if (!save || !n) return home();
    toFujin(game, home, { practice: true, trial: n });
  };
  // K583 金の買い物：閉じて終わらなかった取引の届き直しを、持ち物の箱へ足して保存してから終える（kin_store.js の④）
  linkKinStore();
  home();
  return true;
}

// K600 登城帳（tojo.js・tojo_ui.js）：ホームを開いたその日の最初に、今月の登城を一つ数えて札を出す。家を選ぶ前・自動の道具では出さない。
//   受け取った後は「本日の無料登用 5回［登用へ］［あとで］」（toyo_screen の openDailyBonus・同じ日に二度は出さない）。back＝登用から戻る所
//   返り値：札を出したら true（出さない日は false。その時は呼び手が今までの dailyBonusIfReady を出してよい）
//   isHome＝ホームが今出ているか（11/21 k592-fujin の気づき：ホームを飛ばして戦に入ると札が戦の上に出た）。出ていない時は数えずに待ち、次にホームへ戻った時に出す。
//   同じ日に二度は出さない（tojoDay）。読み込みを待つ間にホームを離れても出さない（開く直前にもう一度見る）
let tojoDay = '', tojoOpen = false;
export async function tojoIfReady(back = () => {}, isHome = () => true) {
  try { if (navigator.webdriver || window.__autoplay || /[?&](snap|norender|bot)/.test(location.search)) return false; } catch (e) { return false; }
  const d0 = new Date(), today = `${d0.getFullYear()}-${d0.getMonth() + 1}-${d0.getDate()}`;
  if (tojoDay === today || tojoOpen || !isHome()) return false;
  const [J, U, T, R, Ho] = await Promise.all([has('./tojo.js'), has('./tojo_ui.js'), has('./toyo_screen.js'), has('./toyo_rules.js'), has('./house.js')]);
  if (!isHome() || tojoOpen) return false;
  const save = Ho?.loadOnline?.(); if (!J || !U || !save || !save.house) return false;
  const n = J.checkIn(save);
  const v = J.view(save);
  tojoDay = today;
  if (!n && (!v.today || v.todayGot)) { Ho.saveOnline(save); return false; }
  Ho.saveOnline(save);
  tojoOpen = true;
  U.openTojo(document.body, {
    save, onSave: (s) => Ho.saveOnline(s),
    onDone: () => {
      tojoOpen = false;
      if (!T || !R || !isHome()) return;
      const s2 = Ho.loadOnline() || save, d = new Date(), key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      s2.toyo = R.newToyoState(s2.toyo || {}); R.dailyReset(s2.toyo, key);
      if (s2.toyo.bonusShown === key || !(s2.toyo.free > 0)) { Ho.saveOnline(s2); return; }
      s2.toyo.bonusShown = key; Ho.saveOnline(s2);
      T.openDailyBonus(document.body, { free: s2.toyo.free, onGo: () => toToyo(back) });
    },
  });
  return true;
}
// K598：ログイン時「本日の褒美 武将登用 無料5回［登用へ］［あとで］」。一日一度だけ・強制しない
async function dailyBonusIfReady() {
  const [T, R, Ho] = await Promise.all([has('./toyo_screen.js'), has('./toyo_rules.js'), has('./house.js')]);
  const save = Ho?.loadOnline?.(); if (!T || !R || !save || !save.house) return;
  const d = new Date(), key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  save.toyo = R.newToyoState(save.toyo || {}); R.dailyReset(save.toyo, key);
  if (save.toyo.bonusShown === key || !(save.toyo.free > 0)) { Ho.saveOnline(save); return; }
  save.toyo.bonusShown = key; Ho.saveOnline(save);
  T.openDailyBonus(document.body, { free: save.toyo.free, onGo: () => toToyo(() => {}) });
}
async function tsuShowIfReady() {
  const [Ts, Ho] = await Promise.all([has('./tsutome.js'), has('./house.js')]);
  const save = Ho?.loadOnline?.(); if (!Ts || !save) return;
  const fresh = Ts.today(save).filter((x) => x.done && !x.got && !save.tsutome.shown?.[x.id]);
  if (!fresh.length) return;
  save.tsutome.shown = { ...(save.tsutome.shown || {}), ...Object.fromEntries(fresh.map((x) => [x.id, 1])) };
  Ho.saveOnline(save);
  toTsutome(() => {});
}
// ---- メインのホームから（K595・K598）：what＝'toyo'（武将登用）か 'match'（オンライン対戦）。back＝ホームへ戻る ----
//   対戦：ホーム → 軍団編成（一度決めたら飛ばす）→ 布陣 → 相手探し → 合戦（toFujin → match.js）
export async function openOnline(game, what, back) {
  gameRef = game;
  const [H, Ho, E] = await Promise.all([has('./home_ui.js'), has('./house.js'), has('./hensei_ui.js')]);
  if (!H || !Ho) return back();
  linkKinStore();
  // 登用の結果の［軍団に編成］［模擬合戦で試す］：ホームから入った時も口を渡す（決めたら・試したらホームへ）
  henseiHook = E ? () => gundanFlow(game, E, Ho, back) : null;   // 長 11/21（kaito）：ホームの［軍団］と同じ道（組み替え→布陣）
  toTrialHook = async (id) => { await loadTable(); const n = TBL?.BUSHOU_BY_ID[id]?.name; if (!n || !Ho.loadOnline()) return back(); toFujin(game, back, { practice: true, trial: n }); };
  const go = () => {
    if (what === 'toyo') return toToyo(back);
    const o = Ho.loadOnline();
    if (E && !o?.guide?.hensei) return E.openHensei(o, (x) => { x.guide = { ...(x.guide || {}), hensei: 1 }; Ho.saveOnline(x); toFujin(game, back, { practice: false }); }, back);
    return toFujin(game, back, { practice: false });
  };
  if (Ho.loadOnline()) return go();
  H.openHouseSelect(() => firstNote(go), back);
}
// ---- ホームの［軍団］（長 11/21・kaito「組み替える所がどこか分からない」）：家が無ければ家選び → 軍団編成（組み替え・枠）→［この軍で決める］→ 布陣（布陣帳）。戻るはホームへ ----
export async function openGundan(game, back) {
  const [H, Ho, E] = await Promise.all([has('./home_ui.js'), has('./house.js'), has('./hensei_ui.js')]);
  if (!Ho || !E) return back();
  linkKinStore();
  henseiHook = () => gundanFlow(game, E, Ho, back);
  toTrialHook = async (id) => { await loadTable(); const n = TBL?.BUSHOU_BY_ID[id]?.name; if (!n || !Ho.loadOnline()) return back(); toFujin(game, back, { practice: true, trial: n }); };
  const go = () => gundanFlow(game, E, Ho, back);
  if (Ho.loadOnline()) return go();
  if (H) H.openHouseSelect(() => firstNote(go), back); else back();
}
function gundanFlow(game, E, Ho, back) {
  return E.openHensei(Ho.loadOnline(), (x) => { x.guide = { ...(x.guide || {}), hensei: 1 }; Ho.saveOnline(x); toFujin(game, back, { practice: true }); }, back);
}
// 初回だけの一行（家を選んだすぐ後に一度）。英語の時は i18n.js が画面の字を訳す（下の addEn）
function firstNote(next) {
  const el = document.createElement('div');
  el.className = 'ol-first'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px';
  el.innerHTML = `<div style="max-width:520px;background:#17130e;border:1px solid #d9b45a;border-radius:6px;padding:18px 18px 14px;color:#ece4d2;font-size:16px;line-height:1.6;text-align:center"><p style="margin:0 0 14px">ここで登用した武将は、オンライン対戦の軍団に編成できます</p><button type="button" style="min-height:44px;min-width:160px;padding:0 18px;border:1px solid #e0a070;border-radius:4px;background:linear-gradient(180deg,#a8402a,#6e2016);color:#fff;font-size:16px;letter-spacing:.1em">進む</button></div>`;
  document.body.appendChild(el);
  const b = el.querySelector('button'); b.focus({ preventScroll: true });
  b.addEventListener('click', () => { el.remove(); next(); });
}
addEn([['北条氏康', 'Hōjō Ujiyasu'], ['長宗我部元親', 'Chōsokabe Motochika'], ['立花宗茂', 'Tachibana Muneshige'], ['島左近', 'Shima Sakon'], ['ここで登用した武将は、オンライン対戦の軍団に編成できます', 'Warlords you recruit here can join your army for online battles.'], ['進む', 'Continue']]);

// 毎日の務めの札（33 tsutome_ui.js）
async function toTsutome(back) {
  const [U, Ho] = await Promise.all([has('./tsutome_ui.js'), has('./house.js')]);
  const save = Ho?.loadOnline?.(); if (!U || !save) return back();
  U.openTsutome(document.body, { save, onSave: (s) => Ho.saveOnline(s), onClose: back });
}

// 登用の間が開いている時はその箱へ（開いている画面の保存で上書きされないように）、閉じている時は端末の箱へ足す
let liveToyo = null;
let gameRef = null;   // K608：登用の画面から［オンライン対戦］へ直に行く口（openTaisen に game が要る）
async function linkKinStore() {
  const [KS, R, Ho] = await Promise.all([has('./kin_store.js'), has('./toyo_rules.js'), has('./house.js')]);
  if (!KS || !R || !Ho) return;
  KS.setKinSink((pack, txId) => {
    if (liveToyo) { R.creditPurchase(liveToyo.save.toyo, pack, txId); liveToyo.keep(liveToyo.save.toyo); return true; }
    const save = Ho.loadOnline(); if (!save) return false;   // 家を選ぶ前は終えない（次の起動でまた届く）
    save.toyo = R.newToyoState(save.toyo || {});
    R.creditPurchase(save.toyo, pack, txId); Ho.saveOnline(save); return true;
  });
}

// ④ 布陣の画面から試合へ。布陣が無ければ決まった並び（defaultLayout）で始める
async function toFujin(game, back, o) {
  const [F, Ho, M] = await Promise.all([has('./fujin_ui.js'), has('./house.js'), has('./match.js')]);
  const save = Ho?.loadOnline?.();
  if (!save || !M) return back();
  // K601：編成は第五・第六陣まで持てるが、試合（match.js・相手の bot）はまだ4将戦だけ。5将戦・6将戦が出来るまで先頭の4人で（人数差の戦はしない）
  // K601 25〜28：出陣は編成の枠の数（4・5・6人）のまま。相手探しは同じ人数どうし（server/online）、Bot の相手も同じ人数（match.js botFoe）
  const generals = (save.army || []).filter(Boolean).slice(0, 6);
  if (o.trial) { const i = generals.indexOf(o.trial); if (i >= 0) generals.splice(i, 1); generals.unshift(o.trial); generals.length = Math.min(generals.length, 6); }
  // K602：自分が操るのは家の大名本人（編成で総大将に固定。居なければ先頭に入れる）
  const lord = M.HOUSE_LORD?.[save.house];
  if (lord && !generals.includes(lord)) { generals.unshift(lord); generals.length = Math.min(generals.length, Math.max(4, (save.army || []).filter(Boolean).length)); }
  const me = Math.max(0, generals.indexOf(lord));
  const map = M.MATCH_MAPS[o.map || 'heigen'];
  // K603・K601 25〜28（11/21 k592）：諸大名戦・模擬合戦の相手も同じ人数（4将戦・5将戦・6将戦）。家の編成が四人なら、同じ家の者を位の順に足す（多ければ切る）
  // K608：初級・中級は自分と同じ出陣の数、上級は一隊・修羅は二隊多い（taisen_ui の nFoe）。足りない時は家臣団（o.retainers）から足す
  const nFoe = Math.min(6, o.nFoe || generals.length);
  if (o.foe?.length && o.foe.length !== nFoe) {
    const BO = await has('./bushou_online.js'), RK = ['SS', 'S', 'A', 'R', 'N'];
    const house = o.npc?.house || BO?.BUSHOU_ONLINE.find((b) => b.name === o.foe[0])?.house;
    const more = (BO?.BUSHOU_ONLINE || []).filter((b) => b.house === house && !o.foe.includes(b.name) && !generals.includes(b.name)).sort((a, b) => RK.indexOf(a.rank) - RK.indexOf(b.rank)).map((b) => b.name);
    o = { ...o, foe: [...o.foe, ...(o.retainers || []).filter((n) => !o.foe.includes(n) && !generals.includes(n)), ...more].filter((n, i, a) => a.indexOf(n) === i).slice(0, nFoe) };
  }
  // 長の決め（11/21・釣り合い）：NPC の軍団も自分と同じ Cost の上限（4将 65・5将 80・6将 95）。初級だけは 10 下げる（55・70・85）。
  //   上限を越える時は、総大将（大名）を残し、Cost の高い家臣から同じ家の安い者へ入れ替える（HP・兵力は触らない）。中級は同じ・上級と修羅は同じ Cost で AI だけ賢い
  if (o.npc && o.foe?.length) o = { ...o, foe: await capFoe(o.foe, o.npc.house, o.npc.level, generals) };
  // ⑦ 二人で（iMac② net_match.js）：本当の合戦で、受け渡し所の在り処がある時だけ相手を探す。見つからない・やめた・無い時は今まで通り相手も AI
  let npcLay = null;   // K605：NPC の相手の布陣（布陣の画面で作る）
  const go = async (layout) => {
    const NM = await has('./net_match.js');
    NM?.closeMatchLink?.(M); M.onlineMatchOff?.();   // 前の二人の試合の口は、次の試合の前に必ず外す
    if (o.practice) return M.startMatch(game, { generals, me, layout, map, practice: true, back, foe: o.foe || undefined, foeLayout: npcLay, npc: o.npc || null });
    // K603 諸大名と戦う：相手を探さず、選んだ家の軍と戦う（褒美は少なめ・段位なし＝match_reward の npc）
    if (o.npc) return M.startMatch(game, { generals, me, layout, map, practice: false, back, foe: o.foe, foeLayout: npcLay, npc: o.npc });
    // K598 相手探しの画面（sagashi_ui.js）：待ち時間・段位の幅・［探すのをやめる］→ 見つかったら相手の名・段位・家 → 合戦。
    //   見つからない（受け渡し所がまだ無い時も）→［模擬合戦へ］［もう一度探す］［ホームへ］
    const Sg = await has('./sagashi_ui.js');
    let stopWait = null;
    const ui = Sg?.openSagashi({ onCancel: () => stopWait?.() });
    const found = NM?.serverUrl?.() ? await NM.findMatch({ name: generals[0] || '', map: map.id, deck: { generals, layout, house: save.house }, waitCard: ui?.waitCard }) : (ui && await new Promise((r) => { stopWait = r; setTimeout(r, 1500); }), null);   // 受け渡し所がまだ無い時は少し探す画面を見せて「見つかりませんでした」へ
    if (ui?.cancelled) { ui.close(); return back(); }
    if (!found) {
      if (!ui) return M.startMatch(game, { generals, me, layout, map, practice: false, back });
      return ui.notFound({ practice: () => M.startMatch(game, { generals, me, layout, map, practice: true, back }), retry: () => { ui.close(); go(layout); }, home: back });
    }
    if (ui) { await ui.found(found.foe); ui.close(); }
    const L = await has('./match_link.js');
    NM.linkMatch(game, found, M, L);
    const fd = found.foe?.deck || {};
    const foe = Array.isArray(fd.generals) && fd.generals.length ? fd.generals.slice(0, 6) : null;
    return M.startMatch(game, { generals, me, layout, foe, foeLayout: fd.layout || null, map: M.MATCH_MAPS[found.map] || map, practice: false, back: () => { NM.closeMatchLink(M); has('./michi.js').then((Mi) => { const s = Ho.loadOnline(); if (Mi && s && !s.michi?.pvp) { Mi.michiWin(s, { kind: 'pvp' }); Ho.saveOnline(s); } }).finally(back); } });   // 対人戦を一度遊んだら初心者の道を終える（michi.js）
  };
  if (!F) return go(null);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:60';
  document.body.appendChild(host);
  // K605（11/21 k592）：NPC（諸大名・模擬合戦）は家ごとの布陣の AI で相手を置き、布陣の地図に全部見せる。対人は名だけ・置き場は隠す。
  //   布陣の時間：NPC は無し・対人 60秒（段位戦 45秒は o.ranked）
  const Bo = o.foe?.length && (o.npc || o.practice) ? await has('./bushou_online.js') : null;
  npcLay = Bo && F.npcLayout ? F.npcLayout(o.foe, o.npc?.house || Bo.BUSHOU_ONLINE.find((b) => b.name === o.foe[0])?.house, map.id, (n) => { const f = Bo.BUSHOU_ONLINE.find((b) => b.name === n)?.fav; return f === 'kiba' ? '騎馬' : f === 'teppo' ? '鉄砲' : f === 'yumi' ? '弓' : '槍'; }) : null;
  // K607（kaito 11/21）：軍団で決めた既定の布陣があれば、布陣の画面は出さず、始まる前の確かめの札（［出陣］［布陣を変える］）から。
  //   既定の置き場（左翼〜後詰）はこの戦場の枠へ写す（fujin_ui.js placeDefault）。［布陣を変える］の時だけ今の布陣の画面（既定から始める）
  const Hz = await has('./hensei_ui.js'), dflt = Hz?.defaultFujinOf?.(save);
  const BOw = (await has('./bushou_online.js'))?.BUSHOU_ONLINE || [];
  const kataOf = (n) => save.kata?.[n] || BOw.find((b) => b.name === n)?.fav || 'std';
  const hsOf = (n) => { const k = kataOf(n); return k === 'kiba' ? '騎馬' : k === 'teppo' ? '鉄砲' : k === 'yumi' ? '弓' : '槍'; };
  const typeOf = (n) => ({ std: '標準', yari: '槍重視', teppo: '鉄砲重視', kiba: '騎馬重視', shubi: '守備重視' })[kataOf(n)] || '標準';
  const def = dflt && F.placeDefault ? generals.map((n) => dflt.pieces.find((q) => q.name === n) || { name: n, slot: null, formation: '横陣' }) : null;
  const LANG0 = (await import('../i18n.js')).LANG;
  const mount = (initial) => F.mountFujin(host, {
    initial,
    foeLayout: npcLay, showFoe: !!npcLay, timeLimit: o.npc || o.practice ? 0 : o.ranked ? 45 : 60,
    map: { w: map.w, h: map.h, id: map.id, name: map.name }, side: 'south', generals, foe: o.foe || null, lang: LANG0,   // 11/21 cloud-26：日本語の画面で端末が英語だと布陣だけ英語になった（online_flow）
    onDone: (layout) => { host.remove(); go(layout); },
    onBack: () => { host.remove(); back(); },   // 布陣から戻る（fujin_ui.js が釦を出したら効く・K598 一通し）
  });
  // 道具（描かずの通し・bot）は今まで通り布陣の画面から（npc_run・online_flow が布陣の釦を押す）
  const tool = /[?&](norender|bot)\b/.test(location.search) || globalThis.__fujinNoConfirm;
  if (!def || tool) return mount(null);
  const placed = F.placeDefault(def, map.id, hsOf);
  F.openStartCard({ pieces: placed, mapId: map.id, mapName: map.name, foe: o.foe || null, lang: LANG0,
    onGo: () => { host.remove(); go(F.layoutFromDefault(def, map.id, map, hsOf, typeOf)); },
    onEdit: () => mount(placed.map((p) => ({ name: p.name, slot: p.slot, pos: p.pos, formation: p.formation }))),
    onBack: () => { host.remove(); back(); } });
}

const COST_CAP_N = { 4: 65, 5: 80, 6: 95 };
async function capFoe(foe, house, level, mine = []) {
  const BO = await has('./bushou_online.js'); if (!BO) return foe;
  const cost = (n) => BO.COST[BO.BUSHOU_ONLINE.find((b) => b.name === n)?.rank] || 10;
  const cap = (COST_CAP_N[foe.length] || 65) - (level === 'shokyu' ? 10 : 0);
  const out = foe.slice();
  const pool = BO.BUSHOU_ONLINE.filter((b) => b.house === (house || BO.BUSHOU_ONLINE.find((q) => q.name === foe[0])?.house) && !out.includes(b.name) && !mine.includes(b.name));
  for (let guard = 0; guard < 12 && out.reduce((a, n) => a + cost(n), 0) > cap; guard++) {
    // 一番高い家臣（総大将の 0 番は残す）を、その次に高くて上限に近づける安い者へ
    let hi = 1; for (let i = 2; i < out.length; i++) if (cost(out[i]) > cost(out[hi])) hi = i;
    const over = out.reduce((a, n) => a + cost(n), 0) - cap, c0 = cost(out[hi]);
    const cand = pool.filter((b) => !out.includes(b.name) && BO.COST[b.rank] < c0).sort((a, b) => Math.abs((c0 - BO.COST[a.rank]) - over) - Math.abs((c0 - BO.COST[b.rank]) - over) || BO.COST[b.rank] - BO.COST[a.rank])[0];
    if (!cand) break;
    out[hi] = cand.name;
  }
  return out;
}

// K603（11/21 k592）：ホームの［対戦］→［オンライン対戦］［諸大名と戦う］［模擬合戦］。back＝ホームへ戻る
//   家がまだなら家選び→元の所。オンライン対戦は今の openOnline(game,'match') と同じ道（編成→布陣→相手探し）
export async function openTaisen(game, back) {
  const [Tz, Ho, H] = await Promise.all([has('./taisen_ui.js'), has('./house.js'), has('./home_ui.js')]);
  if (!Tz || !Ho) return back();
  // 戦の後（勝ち負けの札から戻った時）：初心者の道（k598-home の michi.js）を数え、NPC 中級に初めて勝った時は対人戦へ誘う（強制しない）
  const after = (c, prev) => async () => {
    try { const sc = document.getElementById('screen'); if (sc && sc.querySelector('.story')) sc.innerHTML = ''; } catch (e) { /* 片付けられなくても進む */ }   // 勝ち負けの札（#screen）を［対戦］の入口の裏に残さない（一通しの二重の札）
    const [Mi, Mt] = await Promise.all([has('./michi.js'), has('./match.js')]);
    const M = Mt?.lastMatch?.(), s = Ho.loadOnline();
    if (!Mi || !s || !M?.over || M === prev) return show();   // 布陣から戻った時（試合をしていない）は数えない
    const won = M.result?.winner === 0;
    if (c.practice) Mi.michiWin(s, { kind: 'practice' });
    else if (won) Mi.michiWin(s, { kind: 'npc', house: c.house, level: c.level });
    if (Mi.shouldInvite(s)) { Mi.openPvpInvite({ save: s, onPvp: () => openOnline(game, 'match', back), onNpc: show }); Ho.saveOnline(s); return; }
    Ho.saveOnline(s); show();
  };
  const show = () => Tz.openTaisen({
    onBack: back,
    onOnline: () => openOnline(game, 'match', back),
    onGundan: () => openGundan(game, back),
    onNpc: async (c) => { const prev = (await has('./match.js'))?.lastMatch?.(); toFujin(game, after(c, prev), { practice: !!c.practice, map: c.map, foe: c.foe, retainers: c.retainers || null, nFoe: c.nFoe || 0, npc: c.practice ? { house: c.house, level: c.level, ai: c.ai } : { house: c.house, level: c.level, variant: c.variant, ai: c.ai } }); },
  });
  if (Ho.loadOnline()) return show();
  if (H) H.openHouseSelect(() => firstNote(show), back); else back();
}

// K598：問屋の［銭を追加］で小判が足りない時の［小判を購入］。登用の買い場（小判の札）だけを開き、閉じたら done
export const openKinShop = (done = () => {}) => toToyo(done, { startAt: 'kin' });
// ⑥ 登用。持ち物の箱（48）に登用の数（27）を入れて渡す
async function toToyo(back, opt = {}) {
  const [T, R, Ho, Bk, BO] = await Promise.all([has('./toyo_screen.js'), has('./toyo_rules.js'), has('./house.js'), has('./busho_bank.js'), has('./bushou_online.js')]);
  if (!T || !R || !Ho) return back();
  const save = Ho.loadOnline() || {};
  save.toyo = R.newToyoState(save.toyo || {});
  { const d = new Date(); R.dailyReset(save.toyo, `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); }
  R.passTick?.(save.toyo);   // 月次の軍資金：その日はじめて開いた時に金100（33）
  // 27（11/21）：手持ちの帳（33 の bank）も同じ箱へ。初めの4人など、もう持っている武将は帳にも入れておく（重なりの判定が合うように）
  if (Bk && BO) {
    save.bank = save.bank || Bk.newBank();
    for (const n of save.owned || []) { const b = BO.BUSHOU_ONLINE.find((q) => q.name === n); if (b && !save.bank.owned[b.id]) save.bank.owned[b.id] = 1; }
    save.toyo.owned = { ...save.bank.owned }; save.toyo.seals = save.bank.seals;
  }
  // 登用した武将を 48 の手持ち（名の並び）と得意の型へも足す（編成で選べるように）
  const keep = (st) => {
    save.toyo = st; save.owned = save.owned || []; save.kata = save.kata || {};
    for (const id of Object.keys(st.owned)) { const b = BO?.BUSHOU_BY_ID?.[id]; if (b && !save.owned.includes(b.name)) { save.owned.push(b.name); save.kata[b.name] = b.fav || 'std'; } }
    Ho.saveOnline(save);
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:60';
  document.body.appendChild(host);
  if (opt.replaceHost) { const oh = opt.replaceHost; opt = { ...opt, replaceHost: null }; setTimeout(() => oh.remove(), 150); }
  const [KS, P] = await Promise.all([has('./kin_store.js'), has('./pickup.js')]);
  liveToyo = { save, keep };
  // K600 注目登用（pickup.js）：今の注目（甲斐の虎など）・週末の家・催し、無ければ常設。天井の数は登用の箱に一つで、期間が替わっても引き継ぐ
  const bn = P ? P.currentBanner(opt.bannerId) : null;
  const banners = P ? [...P.activeBanners(), P.JOSETSU].map((x) => ({ id: x.id, name: x.name, kind: x.kind, until: P.endOf(x)?.label || null })) : [];
  if (P && bn) requestAnimationFrame(() => P.applyBg(host, bn));   // 注目の種類で背景を替える（操作の位置は替えない）
  T.openToyo(host, {
    banners, onBanner: P ? (id) => { liveToyo = null; toToyo(back, { ...opt, bannerId: id, replaceHost: host }); } : null,   // 古い画面は新しい画面が出てから外す（一瞬ホームに戻って見えない）   // 枠を替える（登用の画面が［常設］［甲斐の虎］…の札を出す時）
    startAt: opt.startAt,
    state: save.toyo, banner: bn ? P.bannerOpts(bn, save.toyo, { bank: save.bank }) : { pickup: save.toyo.target || 'nobushige', focus: ['nobushige', 'nobunaga', 'shingen', 'kenshin'], bank: save.bank },
    onTrial: toTrialHook ? (id) => { liveToyo = null; host.remove(); toTrialHook(id); } : null,   // 引いた後の［模擬合戦で試す］
    onSave: keep,
    webFree: !(window.webkit?.messageHandlers?.iap || (window.__androidApp && window.AndroidIap)),   // web の版（購入の口が無い）：無料で何回でも
    onTaisen: gameRef ? () => { liveToyo = null; host.remove(); openTaisen(gameRef, back); } : null,   // 登用の画面・取った後の札から［オンライン対戦］へ
    onFormArmy: henseiHook ? () => { liveToyo = null; host.remove(); henseiHook(); } : null,   // 引いた後の［軍団に編成］
    buyKin: KS && KS.canBuyKin() ? (p) => KS.buyKin(p) : null,
    priceOf: KS ? KS.priceOf : null,
    kinState: KS && KS.canBuyKin() ? KS.kinState : null, refreshPrices: KS ? KS.refreshPrices : null,   // 値段が届かない時の札（33）
    kinError: KS ? () => KS.lastKinError : null,   // 買えなかった訳（'cancel' は字を出さない）
    // 購入の復元（自動で更新しない購読＝月次の軍資金）。戻した数か false
    restoreKin: KS && KS.canBuyKin() ? async () => {
      const r = await KS.restoreKin(); if (r === false) return false;
      let n = 0; for (const x of r) if (R.restorePass(save.toyo, KS.packOfPid(x.pid), x.txId, x.date)) n++;
      keep(save.toyo); return n;
    } : null,
    onClose: () => { liveToyo = null; host.remove(); back(); },
    // ⑥ 交換所（33）。登用の間の「交換所」から開き、閉じたら登用の間へ戻る（武将印の数を描き直す）。帳は 33 の bank（無ければ登用の数の箱）
    onKoukan: async (redraw) => {
      const K = await has('./koukan_ui.js');
      if (!K) return redraw();
      const book = save.bank || save.toyo;
      K.openKoukan(host, {
        state: book, onClose: redraw,
        onSave: (bk) => { if (bk !== save.toyo) { save.toyo.owned = { ...bk.owned }; save.toyo.seals = bk.seals; } keep(save.toyo); },
        onTrial: toTrialHook ? (id) => { liveToyo = null; host.remove(); toTrialHook(id); } : null,
      });
    },
  });
}

// K600 武将図鑑のオンラインの頁の［模擬合戦で試す］：持っていない武将も総大将に据えて模擬合戦で試す（手持ちには触らない）。家を選ぶ前なら先に家選び
export async function tryBusho(game, name, back) {
  const [H, Ho] = await Promise.all([has('./home_ui.js'), has('./house.js')]);
  if (!Ho) return back();
  const go = () => toFujin(game, back, { practice: true, trial: name });
  if (Ho.loadOnline()) return go();
  if (!H) return back();
  H.openHouseSelect(() => firstNote(go), back);
}
