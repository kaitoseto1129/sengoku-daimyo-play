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
  const [H, E] = await Promise.all([has('./home_ui.js'), has('./hensei_ui.js')]);
  if (!H) return false;
  // 11/21 K586（cloud-38）：オンラインに入った時から、武将の顔を裏で先に撮って端末に残す（登用の書状・編成の札を開いて1秒内に顔が出るように。一度撮れば次から撮らない）
  Promise.all([import('../busho_portrait.js'), import('./bushou_online.js')]).then(([M, B]) => { M.addPortraitRows(B.BUSHOU_ONLINE.map((b) => [b.name, b.house])); M.portraitPrewarm(B.BUSHOU_ONLINE.slice().sort((a, b) => 'SSANR'.indexOf(a.rank) - 'SSANR'.indexOf(b.rank)).map((b) => b.name)); }).catch(() => {});
  // 毎日の務め（33）：数えは 40 の matchSettle（一試合に一度）。受け取れる務めが新しく出来ていたら、ホームへ戻った時に一度だけ札を出す
  const home = () => { H.openOnlineHome(hooks); tsuShowIfReady(); dailyBonusIfReady(); };
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
  const [H, Ho, E] = await Promise.all([has('./home_ui.js'), has('./house.js'), has('./hensei_ui.js')]);
  if (!H || !Ho) return back();
  linkKinStore();
  const go = () => {
    if (what === 'toyo') return toToyo(back);
    const o = Ho.loadOnline();
    if (E && !o?.guide?.hensei) return E.openHensei(o, (x) => { x.guide = { ...(x.guide || {}), hensei: 1 }; Ho.saveOnline(x); toFujin(game, back, { practice: false }); }, back);
    return toFujin(game, back, { practice: false });
  };
  if (Ho.loadOnline()) return go();
  H.openHouseSelect(() => firstNote(go), back);
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
addEn([['ここで登用した武将は、オンライン対戦の軍団に編成できます', 'Warlords you recruit here can join your army for online battles.'], ['進む', 'Continue']]);

// 毎日の務めの札（33 tsutome_ui.js）
async function toTsutome(back) {
  const [U, Ho] = await Promise.all([has('./tsutome_ui.js'), has('./house.js')]);
  const save = Ho?.loadOnline?.(); if (!U || !save) return back();
  U.openTsutome(document.body, { save, onSave: (s) => Ho.saveOnline(s), onClose: back });
}

// 登用の間が開いている時はその箱へ（開いている画面の保存で上書きされないように）、閉じている時は端末の箱へ足す
let liveToyo = null;
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
  const generals = (save.army || []).filter(Boolean);
  if (o.trial) { const i = generals.indexOf(o.trial); if (i >= 0) generals.splice(i, 1); generals.unshift(o.trial); generals.length = Math.min(generals.length, 4); }
  const map = M.MATCH_MAPS[o.map || 'heigen'];
  // ⑦ 二人で（iMac② net_match.js）：本当の合戦で、受け渡し所の在り処がある時だけ相手を探す。見つからない・やめた・無い時は今まで通り相手も AI
  const go = async (layout) => {
    const NM = await has('./net_match.js');
    NM?.closeMatchLink?.(M); M.onlineMatchOff?.();   // 前の二人の試合の口は、次の試合の前に必ず外す
    const found = !o.practice && NM?.serverUrl?.() ? await NM.findMatch({ name: generals[0] || '', map: map.id, deck: { generals, layout, house: save.house } }) : null;
    if (!found) return M.startMatch(game, { generals, layout, map, practice: o.practice, back });
    const L = await has('./match_link.js');
    NM.linkMatch(game, found, M, L);
    const fd = found.foe?.deck || {};
    const foe = Array.isArray(fd.generals) && fd.generals.length ? fd.generals.slice(0, 4) : null;
    return M.startMatch(game, { generals, layout, foe, foeLayout: fd.layout || null, map: M.MATCH_MAPS[found.map] || map, practice: false, back: () => { NM.closeMatchLink(M); back(); } });
  };
  if (!F) return go(null);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:60';
  document.body.appendChild(host);
  F.mountFujin(host, {
    map: { w: map.w, h: map.h }, side: 'south', generals, lang: (await import('../i18n.js')).LANG,   // 11/21 cloud-26：日本語の画面で端末が英語だと布陣だけ英語になった（online_flow）
    onDone: (layout) => { host.remove(); go(layout); },
    onBack: () => { host.remove(); back(); },   // 布陣から戻る（fujin_ui.js が釦を出したら効く・K598 一通し）
  });
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
  const KS = await has('./kin_store.js');
  liveToyo = { save, keep };
  T.openToyo(host, {
    startAt: opt.startAt,
    state: save.toyo, banner: { pickup: 'nobushige', bank: save.bank },
    onSave: keep,
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
