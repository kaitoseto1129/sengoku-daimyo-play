// オンライン対戦と登用（K580・12/1）のつなぎ口。工程：docs/online_plan_1121.md（クラウド k365-cloud-18）。
//   入口は ?online=1 の時だけ（main.js の一行）。ソロ（筋書きの戦）はこのファイルを読まない。
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
const has = (p) => import(p).catch((e) => { console.warn('オンラインの部品がまだ無い', p, e); return null; });

export async function bootOnline(game) {
  const [H, E] = await Promise.all([has('./home_ui.js'), has('./hensei_ui.js')]);
  if (!H) return false;
  const home = () => H.openOnlineHome(hooks);
  const hooks = {
    back: () => { game.title?.(); },
    hensei: E ? () => E.openHensei(null, home, home) : null,
    match: () => toFujin(game, home, { practice: false }),
    practice: () => toFujin(game, home, { practice: true }),
    toyo: () => toToyo(home),
  };
  home();
  return true;
}

// ④ 布陣の画面から試合へ。布陣が無ければ決まった並び（defaultLayout）で始める
async function toFujin(game, back, o) {
  const [F, Ho, M] = await Promise.all([has('./fujin_ui.js'), has('./house.js'), has('./match.js')]);
  const save = Ho?.loadOnline?.();
  if (!save || !M) return back();
  const generals = (save.army || []).filter(Boolean);
  const map = M.MATCH_MAPS[o.map || 'heigen'];
  if (!F) return M.startMatch(game, { generals, layout: null, map, practice: o.practice, back });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:60';
  document.body.appendChild(host);
  F.mountFujin(host, {
    map: { w: map.w, h: map.h }, side: 'south', generals,
    onDone: (layout) => { host.remove(); M.startMatch(game, { generals, layout, map, practice: o.practice, back }); },
  });
}

// ⑥ 登用。持ち物の箱（48）に登用の数（27）を入れて渡す
async function toToyo(back) {
  const [T, R, Ho, Bk, BO] = await Promise.all([has('./toyo_screen.js'), has('./toyo_rules.js'), has('./house.js'), has('./busho_bank.js'), has('./bushou_online.js')]);
  if (!T || !R || !Ho) return back();
  const save = Ho.loadOnline() || {};
  save.toyo = R.newToyoState(save.toyo || {});
  { const d = new Date(); R.dailyReset(save.toyo, `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); }
  // 27（11/21）：手持ちの帳（33 の bank）も同じ箱へ。初めの4人など、もう持っている武将は帳にも入れておく（重なりの判定が合うように）
  if (Bk && BO) {
    save.bank = save.bank || Bk.newBank();
    for (const n of save.owned || []) { const b = BO.BUSHOU_ONLINE.find((q) => q.name === n); if (b && !save.bank.owned[b.id]) save.bank.owned[b.id] = 1; }
    save.toyo.owned = { ...save.bank.owned }; save.toyo.seals = save.bank.seals;
  }
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:60';
  document.body.appendChild(host);
  T.openToyo(host, {
    state: save.toyo, banner: { pickup: 'nobushige', bank: save.bank },
    // 登用した武将を 48 の手持ち（名の並び）と得意の型へも足す（編成で選べるように）
    onSave: (st) => {
      save.toyo = st; save.owned = save.owned || []; save.kata = save.kata || {};
      for (const id of Object.keys(st.owned)) { const b = BO?.BUSHOU_BY_ID?.[id]; if (b && !save.owned.includes(b.name)) { save.owned.push(b.name); save.kata[b.name] = b.fav || 'std'; } }
      Ho.saveOnline(save);
    },
    onClose: () => { host.remove(); back(); },
  });
}
