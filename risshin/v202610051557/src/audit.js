// 不満を持ちまくる遊び手の「目」。bot（playbot.js）が戦の間じゅう付けて回る。
// 見ている目は四つ：
//   一．落ちた（例外）　二．辻褄（戦の整合）　三．使いづらい（画面を一つずつ測る）　四．数と文の粗
// 見つけた事は items に { cat, key, title, where, who, what, fix } で溜める。key が同じものは一件に束ねて数える。
import * as THREE from 'three';
import { GENERALS } from './units.js';

// ---- 誤検知への手当て：意図してそうしている所は数えない ----
// ・持ち場を守るのが役目の者（待て・守り・砦の守兵・本陣の武将・稽古の相手・藁人形・荷駄）は、突っ立っていてよい
// ・遠景の軍勢は描き物で、兵ではない（数えない）
// ・敗走する兵は、戦わずに走り去ってよい
// ・自分（遊び手）は一騎当千でよい（小勢が大勢を削っても、そばに自分がいれば数えない）
// ・戦の始めの一時停止と手ほどきの間は、敵が動かなくてよい
const IDLE_OK_ORDERS = new Set(['hold', 'guard', 'yari', 'flee']);
const IDLE_OK_TYPES = new Set(['dummy', 'porter', 'player']);
// 画面の部品で、重なっていてよい物（全面の飾り・浮かぶ字・印）
const OVERLAP_OK = new Set(['vignette', 'overlay', 'floats', 'killmark', 'combo', 'banner', 'hurt', 'dirhit', 'target', 'wipe', 'staring', 'bigmap', 'radial', 'photoui', 'crosshair', 'reticle', 'compass-marks', 'dmgdir', 'prompt']);
// 遊び手を責める言い回し
const BLAME = /(何をしておる|何をしている|愚か|たわけ|馬鹿|役立たず|だめだ|ダメだ|下手|失格|情けない|しっかりせい)/;
// 断るだけで、どうすればいいかを言わない言い回し
const REFUSE = /(できない|できぬ|使えない|足りない|届かない)$/;

// 札の面積は重なった所を一度だけ数える。画面の点検時だけ使う。
function panelArea(panels) {
  const edges = [...new Set(panels.flatMap(({ r }) => [r.left, r.right]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < edges.length; i++) {
    const left = edges[i - 1], right = edges[i];
    const spans = panels.filter(({ r }) => r.left < right && r.right > left)
      .map(({ r }) => [r.top, r.bottom]).sort((a, b) => a[0] - b[0]);
    let height = 0, end = -Infinity;
    for (const [top, bottom] of spans) {
      height += Math.max(0, bottom - Math.max(top, end));
      end = Math.max(end, bottom);
    }
    area += (right - left) * height;
  }
  return area;
}

export class Auditor {
  constructor() {
    this.items = [];
    this.byKey = new Map();
    this.where = '';
    this.install();
  }

  add(cat, key, title, what, fix, who = '') {
    const k = cat + '|' + key;
    if (this.byKey.has(k)) { const it = this.byKey.get(k); it.count++; if (it.samples.length < 3) it.samples.push({ where: this.where, who, what }); return; }
    const it = { cat, key, title, fix, count: 1, samples: [{ where: this.where, who, what }] };
    this.byKey.set(k, it);
    this.items.push(it);
  }

  // ---------------- 一．落ちた ----------------
  install() {
    if (window.__auditInstalled) { window.__auditCur = this; return; }
    window.__auditInstalled = true;
    window.__auditCur = this;
    const me = () => window.__auditCur;
    addEventListener('error', (e) => me().add('落ちた', `err:${e.message}`, `例外：${e.message}`, `${(e.filename || '').split('/').pop()}:${e.lineno}`, 'この行の前提（値が無い・死んだ兵など）を確かめる'));
    addEventListener('unhandledrejection', (e) => me().add('落ちた', `rej:${e.reason}`, `待ちの失敗：${String(e.reason).slice(0, 80)}`, String(e.reason && e.reason.stack || '').split('\n')[1] || '', '失敗したときの受け手を置く'));
    const ce = console.error.bind(console);
    console.error = (...a) => { me().add('落ちた', `console:${String(a[0]).slice(0, 60)}`, `console.error：${String(a[0]).slice(0, 80)}`, '', '出どころを突き止める'); ce(...a); };
  }

  // ---------------- 戦に付ける ----------------
  attach(b, label) {
    this.b = b;
    this.label = label || (b.def && b.def.dojo ? '稽古場' : `第${b.index + 1}戦`);
    // 新しい戦の辻褄を見るための入れ物
    this.lastEventT = 0;      // 最後に何かが起きた時（討ち死に・知らせ・柵や門の傷・段の変わり目）
    this.objKey = ''; this.objT = 0;
    this.phase0 = b.phase;
    this.structHp = new Map(); // 柵・門ごとの前の hp と、最後に傷ついた時
    this.structZero = new Map();
    this.named = new Map();   // 名のある武将ごとの記録
    this.objTexts = new Set(); // この戦で出た任務の文（名のある武将を「討て」と言ったか）
    this.far = null; this.farAcc = 99; this.farN = 0;
    this.last = new Map();      // 兵ごとの前の位置
    this.idle = new Map();      // 兵ごとの止まっている時間
    this.msgs = [];             // 知らせ・台詞の記録（しつこさを見る）
    this.tickAcc = 0;
    this.domAcc = 0;
    const self = this;
    const log = (kind, text, sp) => self.onMsg(kind, String(text || ''), sp);
    this.lordSeen = false;
    // HUD は戦をまたいで同じ物なので、元の関数を一度だけ覚えて包み直す
    const wrap = (obj, name, kind, pick) => { const f = obj['__o_' + name] || (obj['__o_' + name] = obj[name].bind(obj)); obj[name] = (...a) => { log(kind, pick(a)); return f(...a); }; };
    { const f = b.hud.__o_say || (b.hud.__o_say = b.hud.say.bind(b.hud)); b.hud.say = (...a) => { log('台詞', a[1], a[0]); return f(...a); }; }
    // 間引いて画面へ出さなかった声は、遊び手が聞いた知らせに数えない。
    { const f = b.hud.__o_bark || (b.hud.__o_bark = b.hud.bark.bind(b.hud)); b.hud.bark = (...a) => { if (b.hud.barkOk(...a)) log('報せ', a[0]); return f(...a); }; }
    wrap(b.hud, 'flash', '字幕', (a) => a[0]);
    // 待ち直しや間引きを除き、実際に札を出した時だけ記録する。
    { const f = b.hud.__o_showHint || (b.hud.__o_showHint = b.hud.showHint.bind(b.hud)); b.hud.showHint = (...a) => { const shown = f(...a); if (shown) log('ヒント', a[0]); return shown; }; }
    wrap(b.hud, 'banner', '見出し', (a) => a[0] + (a[1] ? '　' + a[1] : ''));
    // 同士討ち・おかしな傷
    const army = b.army;
    const dmg = army.damage.bind(army);
    army.damage = (t, amount, src, opts) => {
      if (!Number.isFinite(amount)) self.add('数と文', 'dmgNaN', '傷の値が数でない', `${who(src)} → ${who(t)}：${amount}`, 'damage に渡す値の計算を見直す', who(src));
      // 防いだ一撃や、意図して打った馬の傷を、人への同士討ちと取り違えない。
      const hp = t && t.hp;
      const result = dmg(t, amount, src, opts);
      if (Number.isFinite(amount) && src && t && !t.isStruct && !src.isStruct && src.team === t.team && src !== t && t.hp < hp) self.add('辻褄', 'friendly:' + (src.type || '?'), '味方が味方を傷つけている', `${who(src)} → ${who(t)}（${Math.round(hp - t.hp)}）`, '狙いの相手を選ぶときに、同じ側を外す', who(src));
      return result;
    };
    // 討ち死には「何かが起きた」に数える
    const kill = army.kill.bind(army);
    // 崩れた後の残敵ではなく、損害が出た時の敵味方を残す。
    this.losses = new Map();
    army.kill = (t, src) => {
      self.lastEventT = b.t;
      if (t.alive && t.group && src && src.team !== t.team) {
        const g = t.group;
        let record = self.losses.get(g);
        if (!record) { record = { own: g.count, foes: 0, lost: 0, player: false }; self.losses.set(g, record); }
        let foes = 0;
        for (const o of army.units) if (o.alive && !o.noTarget && !o.fleeing && o.team !== g.team
          && (Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < 25 || o.group === src.group)) foes++;
        record.foes = Math.max(record.foes, foes); record.lost++;
        const P = b.player.u;
        if (src === P || P.alive && Math.hypot(P.pos.x - t.pos.x, P.pos.z - t.pos.z) < 25) record.player = true;
      }
      return kill(t, src);
    };
    // 崩れた部隊：大勢が小勢に削られていないか
    this.routSeen = new Set();
  }

  // ---------------- 知らせの記録（しつこさ・言葉） ----------------
  onMsg(kind, text, sp = '') {
    const b = this.b;
    if (!b || !text) return;
    if (b.G && b.G.lord) this.lordMsg(b, kind, text, sp);
    const t = b.t;
    this.lastEventT = t;
    this.msgs.push({ t, kind, text });
    if (this.msgs.length > 200) this.msgs.shift();
    const same = this.msgs.filter((m) => m.text === text && t - m.t < 20);
    // 字幕（受け流し・反撃など）は遊び手の手応えなので数えない
    if (same.length >= 4 && kind !== '字幕') this.add('使いづらい', 'nag:' + text, '同じ知らせが20秒に4回以上', `「${text}」（${kind}）`, '一度出したら、しばらく同じ物を出さない');
    // 大見出しは順番待ちで一つずつ出るので、待ちが溜まりすぎた時だけ数える
    if (kind === '見出し' && b.hud.bannerQ && b.hud.bannerQ.length >= 3) this.add('使いづらい', 'bannerQ:' + text, '大見出しが3つ以上たまっている（出るのが遅れる）', `「${text}」`, '重要でない見出しを字幕や報せに回す');
    if (BLAME.test(text)) this.add('使いづらい', 'blame:' + text, '遊び手を責める言い回し', `「${text}」（${kind}）`, '責めずに、次にどうすればよいかを言う');
    if (kind === '字幕' && REFUSE.test(text) && !/（|：|で |を押/.test(text)) this.add('使いづらい', 'refuse:' + text, '断られたのに、どうすればいいか書いていない', `「${text}」`, '「〜すれば〜できる」と一言添える');
    if (kind === '台詞' && text.length > 70) this.add('使いづらい', 'long:' + text.slice(0, 20), '字幕の台詞が長すぎる（70字超）', `${text.length}字：「${text.slice(0, 30)}…」`, '二つに分けるか、短くする');
    if (/undefined|NaN|\[object|null(年|人|貫|秒)|Infinity/.test(text)) this.add('数と文', 'msg:' + text.slice(0, 30), '知らせの文に値の抜け', `「${text}」（${kind}）`, '文を組み立てる所で値の有無を確かめる');
  }

  // ---------------- 二．辻褄（毎コマ呼ぶ。重い所は1秒ごと） ----------------
  tick(dt) {
    const b = this.b;
    if (!b) return;
    this.where = `${this.label}・${Math.round(b.t)}秒・${b.phase || ''}`;
    const army = b.army;
    // 一息で飛ぶ兵（毎コマ）
    for (const u of army.units) {
      if (!u.alive) { this.last.delete(u); continue; }
      const p = this.last.get(u);
      if (!Number.isFinite(u.pos.x) || !Number.isFinite(u.pos.z)) { this.add('数と文', 'posNaN:' + u.type, '兵の位置が数でない', who(u), '動きの計算で 0 で割っていないか見る', who(u)); continue; }
      if (p && p.appearance === u.appearance && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 6 && !u.isPlayer) this.add('辻褄', 'jump:' + u.type, '兵が一息で飛んだ（6m 超）', `${who(u)}：(${Math.round(p.x)},${Math.round(p.z)}) → (${Math.round(u.pos.x)},${Math.round(u.pos.z)})`, '位置を直接書き換えている所を探す（出し直し・押し出し）', who(u));
      const lim = b.world.def.moveLim || 176;
      if (Math.abs(u.pos.x) > lim + 0.5 || Math.abs(u.pos.z) > lim + 0.5) this.add('辻褄', 'out:' + u.type, '兵が戦場の外に出た', `${who(u)}：(${Math.round(u.pos.x)},${Math.round(u.pos.z)})`, '行き先を戦場の内側に収める', who(u));
      if (p) { p.x = u.pos.x; p.z = u.pos.z; p.appearance = u.appearance; }
      else this.last.set(u, { x: u.pos.x, z: u.pos.z, appearance: u.appearance });
    }
    this.tickAcc += dt;
    if (this.tickAcc < 1) return;
    const step = this.tickAcc; this.tickAcc = 0;
    const P = b.player.u;
    for (const u of army.units) {
      if (!u.alive) {
        // 死んだ相手を狙い続けている
        continue;
      }
      if (u.hp > (u.maxHp || 1e9) + 0.5) this.add('数と文', 'hpOver:' + u.type, '体力が最大を超えている', `${who(u)}：${Math.round(u.hp)}/${u.maxHp}`, '回復の所で上限を掛ける', who(u));
      if (u.target && u.target.alive === false && !u.target.isStruct) {
        u.__deadT = (u.__deadT || 0) + step;
        if (u.__deadT > 3) this.add('辻褄', 'deadTarget:' + u.type, '死んだ相手を3秒以上狙い続けている', who(u), '相手が倒れたら狙いを外す', who(u));
      } else u.__deadT = 0;
      // 動けなくなった兵（行き先があるのに20秒動かない。持ち場を守る者は除く）
      const g = u.group;
      // ついて来いの兵は、組頭（遊び手）が止まっている間・すぐそばに着いている間は立って待ってよい
      const leaderStill = g && g.order === 'follow' && (Math.hypot(P.vel ? P.vel.x : 0, P.vel ? P.vel.z : 0) < 0.3 || Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 12);
      // 旗持ち・押し合いの後ろの者も、指定の立ち位置に着けば待ってよい。
      // 遠くの行き先へ向かう途中で詰まった者は、これまでどおり調べる。
      const arrived = u.moveTo && Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 1.2;
      const mayIdle = IDLE_OK_TYPES.has(u.type) || u.noTarget || u.fleeing || !g || IDLE_OK_ORDERS.has(g.order) || g.holdFire || u.target || u.atk || (g.leader === u && g.order === 'hold') || leaderStill || arrived;
      const moved = Math.hypot(u.vel.x, u.vel.z) > 0.15;
      const hasDestination = u.moveTo && Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) > 1.6;
      // （120m 内に敵のいない兵が立って待つのは、困り事に数えない）
      if (!mayIdle && hasDestination && !moved && b.t > 20 && !b.paused && b.army.nearestEnemy(u, 120, (o) => !o.fleeing)) {
        const n = (this.idle.get(u) || 0) + step;
        this.idle.set(u, n);
        if (n > 20) { this.add('辻褄', 'stuck:' + (g.name || g.label || u.type), '行き先があるのに20秒動かない兵', `${who(u)}（号令：${g.order}・${g.name || '名なし'}・頭：${g._ai ? (g._ai.ctl || '無') + '/' + (g._ai.mode || '―') : '無'}${g.guard ? '・守り' : ''}${g.focus ? '・的あり' : ''}・近い敵${(() => { const e = b.army.nearestEnemy(u, 200); return e ? Math.round(Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z)) + 'm' + (e.fleeing ? '逃' : '') : 'なし'; })()}）at (${Math.round(u.pos.x)},${Math.round(u.pos.z)})`, '道が塞がれていないか、行き先に着いたと見なせているかを見る', who(u)); this.idle.set(u, -60); }
      } else this.idle.set(u, 0);
      // 自分のすぐそばで何もしない敵（持ち場の者・敗走中は除く）。
      // 勝敗後など、敵の狙いに入らない本人は nearestEnemy と同じ条件で除く。
      if (P.alive && !P.noTarget && (!P.invuln || P.allyOk) && u.team !== P.team && !u.fleeing && !IDLE_OK_TYPES.has(u.type) && !u.noTarget && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 3.5 && !u.target && !u.atk && !(g && g.order === 'hold')) {
        u.__besideT = (u.__besideT || 0) + step;
        if (u.__besideT > 6) { this.add('辻褄', 'passive:' + u.type, '自分のすぐそばの敵が6秒以上なにもしない', who(u), '近くの敵（遊び手）を狙いに入れる', who(u)); u.__besideT = -60; }
      } else u.__besideT = 0;
    }
    // 部隊
    for (const g of army.groups) {
      const n = g.count;
      if (g.initial && n > g.initial) this.add('数と文', 'grpOver:' + (g.name || g.id), '部隊の人数が初めより多い', `${g.name || g.label || '部隊'}：${n}/${g.initial}`, '兵を足す所で initial も足す');
      if (g.routed && !this.routSeen.has(g)) {
        this.routSeen.add(g);
        // 大勢が小勢に削られて崩れた（そばに自分がいれば数えない：遊び手は一騎当千でよい）
        const record = this.losses.get(g);
        if (record && !record.player && record.own >= 10 && record.foes > 0 && record.own >= record.foes * 2.5
          && record.lost >= record.own * 0.4) this.add('辻褄', 'outnumbered:' + (g.name || g.label || g.id), '数で勝る隊が、小勢に一方的に削られて崩れた', `${g.name || g.label || '部隊'} 損害が出始めた時${record.own} 対 戦った敵は最多${record.foes}（${record.lost}を失った）`, '兵の数の差が、削り合いと士気に効くようにする');
      }
      // 号令だけでなく、兵が本当に戦っている時だけ（units.js は崩れた隊を毎コマ flee に戻すので、号令は一瞬ずれることがある）
      if (g.routed && n > 0 && g.units.some((u) => u.alive && !u.fleeing && (u.target || u.atk))) this.add('辻褄', 'routFight:' + (g.name || g.id), '崩れた部隊が、また戦っている', `${g.name || g.label || '部隊'}（号令：${g.order}）`, '崩れた部隊の号令を上書きしない');
    }
    // 任務の札：果たした任務が失敗に変わる
    for (const o of b.objectives) {
      const prev = (this.objPrev || {})[o.id];
      if (prev === 'done' && o.state === 'fail') this.add('辻褄', 'objFlip:' + o.id, '果たした任務が、後から失敗になった', o.text, '一度果たした任務は失敗にしない');
    }
    this.objPrev = Object.fromEntries(b.objectives.map((o) => [o.id, o.state]));
    this.checkFlow(b, step);
    this.checkSelf(b);
    // 戦功
    const tot = b.tracker.total();
    if (!Number.isFinite(tot)) this.add('数と文', 'meritNaN', '戦功が数でない', String(tot), '戦功の内訳の pts を見直す');
    // 画面は5秒ごとに測る
    this.domAcc += step;
    if (this.domAcc >= 5) { this.domAcc = 0; this.scanDom(); }
  }

  // ---------------- 二の続き：新しい戦の辻褄（1秒ごと） ----------------
  // ・任務札が長く変わらないのに何も起きない
  // ・門・柵を破れと言うのに、だれも傷つけていない／壊れたはずの物が残る
  // ・名のある武将の出どころと最期を記録する（戦の終わりに endCheck で見る）
  // ・遠景の大軍（addDistantArmy）の影に、戦う兵が埋もれていないか
  checkFlow(b, step) {
    const t = b.t, P = b.player.u, army = b.army;
    if (b.phase !== this.phase0) { this.phase0 = b.phase; this.lastEventT = t; }
    // 果たした（落とした）任務の進み具合が、あとで動いている（別の任務の数字が紛れ込んでいる疑い）
    this.doneProg = this.doneProg || new Map();
    for (const o of b.objectives) {
      if (!o.state) { this.doneProg.delete(o); continue; }
      const prev = this.doneProg.get(o);
      if (prev === undefined) this.doneProg.set(o, o.progress || '');
      else if (prev !== (o.progress || '') && o.progress) { this.add('数と文', 'doneProg:' + o.text.slice(0, 16), '済んだ任務の下の進み具合が、まだ動いている', `「${o.text}」〔${o.state === 'done' ? '済' : '失'}〕の下に「${o.progress}」`, 'objDone のあとは objProgress(id, \'\') で消し、次の任務の id に進み具合を書く'); this.doneProg.set(o, o.progress); }
    }
    const live = b.objectives.filter((o) => o.kind !== 'order');
    for (const o of live) if (o.kind === 'main') this.objTexts.add(o.text);
    if (b.G && b.G.lord) this.lordObjCheck(b);
    const key = live.map((o) => o.text + o.state + (o.progress || '')).join('|');
    if (key !== this.objKey) { this.objKey = key; this.objT = t; }
    // 柵・門
    const structs = army.structs || [];
    for (const s of structs) {
      const nm = s.name || (s.seg ? '柵' : '小屋');
      if (!Number.isFinite(s.hp)) this.add('数と文', 'structNaN:' + nm, '柵・門の hp が数でない', `${nm}：${s.hp}`, 'hp を減らす所の計算を見直す');
      const prev = this.structHp.get(s);
      if (!prev || prev.hp !== s.hp) { if (prev) this.lastEventT = t; this.structHp.set(s, { hp: s.hp, t }); }
      // 壊れたはずの物が残っている（hp が 0 以下なのに立っている）
      if (s.alive && s.hp <= 0) {
        const z = (this.structZero.get(s) || 0) + step;
        this.structZero.set(s, z);
        if (z > 2) { this.add('辻褄', 'structZombie:' + nm, '壊れたはずの柵・門が立ったまま（hp 0 以下なのに残っている）', `${nm}：hp ${Math.round(s.hp)}/${s.maxHp}`, 'hp を減らしたら 0 以下で alive=false・見た目を消す（army.damage を通すか、同じ後始末をする）'); this.structZero.set(s, -60); }
      }
    }
    // 門・柵を破れと言うのに、90秒だれも傷つけていない（「破らせるな」等の守る任務は誤検知なので外す）
    // 建物に続く動詞を見る。「柵の一手で、打って出た城兵を止めよ」は門破りではない。
    const breakObj = live.find((o) => !o.state && /(門|柵|塀)(?:[（(][^）)]*[）)])?(?:を|に|へ)(?:打ち|突き)?(?:破|壊|崩|打)/.test(o.text) && !/(せるな|すな|れるな)/.test(o.text));
    const foeStructs = structs.filter((s) => s.alive && s.team !== P.team);
    if (breakObj && foeStructs.length) {
      const lastHit = Math.max(...foeStructs.map((s) => (this.structHp.get(s) || { t: 0 }).t));
      if (t - lastHit > 90 && t - this.objT > 30) {
        const o = breakObj;
        this.add('辻褄', 'gateIdle:' + (o ? o.text.slice(0, 16) : ''), '門・柵を破れと言うのに、90秒だれも傷つけていない', `「${o ? o.text : ''}」（${b.phase}）`, '門を打つ組（g.assault）が門まで行けているか、遊び手が E で打てる所に印があるかを見る');
        for (const s of foeStructs) this.structHp.set(s, { hp: s.hp, t });
      }
    }
    // 任務札が長く変わらないのに何も起きない
    if (!b.over && live.length && t - this.objT > 90 && t - this.lastEventT > 45) {
      const o = live.find((q) => !q.state) || live[0];
      this.add('辻褄', 'idleObj:' + b.phase + ':' + o.text.slice(0, 16), '任務札が長く変わらないのに、何も起きない', `${Math.round(t - this.objT)}秒「${o.text}」のまま、${Math.round(t - this.lastEventT)}秒なにも起きない（段：${b.phase || '―'}）`, 'この段で待たせるなら、飛ばせる（canSkip）か、進み具合（objProgress）や台詞で先を見せる');
      this.objT = t;
    }
    // 名のある武将
    for (const u of army.units) {
      if (u.isSub || u.isPlayer || !u.name) continue;
      const base = u.name.replace(/^.* /, '');
      if (!(u.type === 'busho' || GENERALS[base])) continue;
      let r = this.named.get(u);
      if (!r) { r = { name: u.name, team: u.team, t0: t, minD: 1e9, hurt: false, dead: false, deadT: 0, killer: '', invuln: false }; this.named.set(u, r); }
      // 戦場から退いて消えた（u.gone）将は、討たれたとは数えない
      if (!u.alive && u.gone) { r.gone = true; continue; }
      if (!u.alive) { if (!r.dead) { r.dead = true; r.deadT = t; r.diedInvuln = !!u.invuln; } continue; }
      r.invuln = !!u.invuln;   // いまの姿（討たれる前に不死身を解くのは正しい流れ）
      if (u.hp < u.maxHp - 0.5) r.hurt = true;
      if (P.alive) r.minD = Math.min(r.minD, Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z));
      if (!Number.isFinite(u.hp)) this.add('数と文', 'namedNaN:' + u.name, '名のある武将の体力が数でない', u.name, '体力の計算を見直す');
    }
    // 遠景の大軍に、戦う兵が埋もれていないか（5秒ごと。大軍を動かす戦もあるので点は測り直す）
    this.farAcc += step;
    if (this.farAcc >= 5) {
      this.farAcc = 0;
      this.far = farPoints(b.world);
      if (this.far) {
        const hits = new Map();
        for (const u of army.units) {
          if (!u.alive || u.type === 'dummy') continue;
          const k = this.far.near(u.pos.x, u.pos.z, 0.9);
          if (k < 0) continue;
          const h = hits.get(k) || { n: 0, me: false, who: who(u), x: u.pos.x, z: u.pos.z, team: new Set() };
          h.n++; h.team.add(u.team === 0 ? '味方' : '敵');
          if (u.isPlayer) h.me = true;
          hits.set(k, h);
        }
        for (const [k, h] of hits) {
          if (h.n < (h.me ? 1 : 4)) continue;
          const a = this.far.info[k];
          this.add('辻褄', 'farBury:' + k + (h.me ? ':me' : ''), h.me ? '自分が遠景の大軍（影の兵）の中に立っている' : '戦う兵が遠景の大軍（影の兵）の中に埋もれている', `${[...h.team].join('・')}の兵 ${h.n}人が、遠景の大軍 #${k}（中心 ${a.x},${a.z}・${a.n}人）の中（${Math.round(h.x)}, ${Math.round(h.z)}）`, '遠景の大軍を戦う場所から離す（addDistantArmy の x,z,w,d を見直す）か、兵の行き先を大軍の外にする');
        }
      }
    }
  }

  // ---------------- 二の続き：自分の役目と史実の食い違い（1秒ごと） ----------------
  // ・始まりの場所：戦の定義の lordAt（信長の居場所の目安 { x, z, r, why }）の外に立っていたら
  // ・信長で遊ぶ戦に、居場所の目安も「もしも」の札も無い
  // ・自分と同じ名の者が戦場にいる（脇役の信長と、遊び手の信長が二人）
  // ・味方の家の武将（家紋が自分の家と同じ）が、敵の側にいる
  checkSelf(b) {
    const P = b.player.u, G = b.G || {};
    if (!this.lordSeen && b.t > 0.5) {
      this.lordSeen = true;
      const at = b.def && b.def.lordAt;
      if (G.lord && at) {
        const d = Math.hypot(P.pos.x - at.x, P.pos.z - at.z);
        if (d > (at.r || 15)) this.add('辻褄', 'lordAt:' + this.label, `始まりの場所がおかしい（${at.why || '信長の居場所'}のはず）`, `自分は (${Math.round(P.pos.x)}, ${Math.round(P.pos.z)})。目安 (${at.x}, ${at.z}) から ${Math.round(d)}m（${at.r || 15}m の内のはず）`, '戦の定義の lordSpawn を lordAt の内に置く（または筋を替えて lordAt を直す）');
      } else if (G.lord && !(b.def && (b.def.lordIf || b.def.dojo || b.def.mapCastle))) this.add('辻褄', 'lordAtNone:' + this.label, '信長で遊ぶ戦に、信長の居場所の目安（lordAt）が無い', `${this.label}：始まりは (${Math.round(P.pos.x)}, ${Math.round(P.pos.z)})`, '戦の定義に lordAt { x, z, r, why } を書く。信長がいなかった戦なら lord.js の LORD_FIX に if（史実で率いた者）を書いて「もしも」の札にする');
    }
    const me = String(P.name || G.name || '');
    const fac = G.lordFaction || (P.group && P.group.faction) || '';
    for (const u of b.army.units) {
      if (!u.alive || u.isPlayer || !u.name) continue;
      const base = u.name.replace(/^.* /, '');
      if (me && (u.name === me || base === me)) this.add('辻褄', 'twin:' + me, '自分と同じ名の者が戦場にいる', `${who(u)}（自分も ${me}）`, '遊び手がその人の時は、脇役を出さないか別の者にする（lord.js の lordWrap）', who(u));
      const gen = GENERALS[base];
      if (gen && fac && gen.mon === fac && u.team !== P.team) this.add('辻褄', 'turncoat:' + base, '味方の家の武将が、敵の側にいる', `${who(u)}（家紋は自分と同じ ${fac}）`, '敵の組に入れる武将の名を見直す（寝返りなら、その筋を台詞で見せる）', who(u));
    }
  }
  // 信長で遊ぶ時の台詞・任務の文：家来が主君を呼び捨て・自分がその場にいない者として語られる・任務が家来の下につく形
  lordMsg(b, kind, text, sp) {
    const me = String(b.G.name || '');
    if (!me) return;
    if (kind === '台詞' && sp && sp !== me && new RegExp(me + '(、|！|か|よ|。)').test(text) && !new RegExp(me + '(様|殿|公)').test(text)) this.add('辻褄', 'yobisute:' + text.slice(0, 16), '家来が自分（主君）を呼び捨てにしている', `${sp}「${text}」`, '信長で遊ぶ時は「殿」と呼ばせる（bhelp.js の nm）', sp);
    if (kind === '台詞' && sp && sp !== me && /(信長公|上様|殿（信長公）)(は|が).{0,16}(おられる|おいでじゃ|戻られ|待っておられ|発たれ)/.test(text)) this.add('辻褄', 'absent:' + text.slice(0, 16), '自分（信長）が、その場にいない者として語られている', `${sp}「${text}」`, 'lord.js の LORD_FIX の rep で、この台詞を信長の前で言う形に替える', sp);
    if (kind === '台詞' && sp === me && this.b && this.b.army.units.some((u) => u.alive && !u.isPlayer && u.name === me)) this.add('辻褄', 'twinSay:' + text.slice(0, 12), '自分と同じ名の脇役が話している', `${sp}「${text}」`, '脇役の信長を出さず、台詞を遊び手のものにする', sp);
  }
  lordObjCheck(b) {
    for (const o of b.objectives) if (o.kind === 'main' && /(のもとで|の供をせよ|信長公(に|の|について)|の手について)/.test(o.text)) this.add('辻褄', 'lordObj:' + o.text.slice(0, 16), '当主（信長）の任務が、家来の下につく形になっている', `「${o.text}」`, 'lord.js の REP_OBJ か LORD_FIX の rep で任務の文を替える');
  }

  // 戦の終わりに一度だけ（playbot が呼ぶ）。名のある武将・門・柵の最後の姿を見る
  endCheck(b, timedOut) {
    const P = b.player.u;
    this.where = `${this.label}・終わり（${Math.round(b.t)}秒）`;
    const out = [];
    for (const [u, r] of this.named) {
      const side = r.team === P.team ? '味方' : '敵';
      out.push(`${side}の${r.name}：${r.dead ? `${Math.round(r.deadT)}秒に討死` : '生きて終わる'}・自分との近さ ${r.minD < 1e8 ? Math.round(r.minD) + 'm' : '—'}${r.invuln ? '・不死身' : ''}`);
      if (r.team === P.team) continue;
      const short = r.name.replace(/^.* /, '');
      const texts = [...this.objTexts].filter((x) => x.includes(short));
      const named = texts.length > 0;
      // 「討て」と言った任務があり、しかも「崩しても勝ち」のような逃げ道が書かれていない時だけ
      const mustKill = texts.some((x) => /(討|首)/.test(x) && !/ても勝ち|でもよい/.test(x));
      if (!r.dead && mustKill && b.tracker.main === true) this.add('辻褄', 'namedAlive:' + r.name, '任務で名を挙げた敵の武将が、討たれないまま戦が終わった', `${r.name}（${r.invuln ? '不死身のまま' : r.hurt ? '傷は負った' : '無傷'}・自分との近さ ${Math.round(r.minD)}m）`, '討たせるなら不死身を解き、遊び手の前に出す。討たせないなら任務の文から外す');
      if (named && r.minD > 60 && !r.dead) this.add('辻褄', 'namedAway:' + r.name, '任務で名を挙げた敵の武将が、一度も遊び手の前に出てこない', `${r.name}：いちばん近くて ${Math.round(r.minD)}m`, '武将の居場所に印を付けるか、寄せてくる道を遊び手の通り道に合わせる');
      if (r.diedInvuln) this.add('辻褄', 'invulnDead:' + r.name, '不死身のはずの武将が討たれた', r.name, 'invuln を外した時と、討たれた所の順番を見る');
    }
    const gateAttack = [...this.objTexts].some((text) => /(門|柵|塀)(?:[（(][^）)]*[）)])?(?:を|に|へ)(?:打ち|突き)?(?:破|壊|崩|打)/.test(text) && !/(せるな|すな|れるな)/.test(text));
    const foeGate = gateAttack ? (b.army.structs || []).filter((s) => s.alive && s.team !== P.team && /門/.test(s.name || '')) : [];
    if (foeGate.length && (b.tracker.main !== true || timedOut)) this.add('辻褄', 'gateLeft:' + foeGate.map((s) => s.name).join('・'), timedOut ? '門が壊れないまま時間切れ' : '門が壊れないまま戦が終わった（任務は落とした）', foeGate.map((s) => `${s.name} hp ${Math.round(s.hp)}/${s.maxHp}`).join('、'), '門を打つ組の行き先と、門の hp（掛矢・味方の打ち手の傷の大きさ）を見直す');
    if (timedOut) this.add('辻褄', 'timeout:' + this.label, '15分たっても戦が終わらない', `段：${b.phase || '―'}・任務「${(b.objectives.find((o) => !o.state && o.kind === 'main') || {}).text || '―'}」`, '進みが止まる条件（待つ相手が死んでいる・着いたと見なせない など）を探す');
    return out;
  }

  // ---------------- 三・四．画面を測る ----------------
  scanDom(label) {
    if (label) this.where = label;
    const W = innerWidth, H = innerHeight;
    const roots = ['hud', 'screen', 'pause'].map((id) => document.getElementById(id)).filter((el) => el && !el.hidden && getComputedStyle(el).display !== 'none');
    // 巻物の外へ送った釦や、閉じた「もっと読む」の中は押せない。
    // 生の座標だけで比べると、下の操作帯と重なったと誤って数える。
    const visibleRect = (el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return null;
      let left = Math.max(0, r.left), right = Math.min(W, r.right), top = Math.max(0, r.top), bottom = Math.min(H, r.bottom);
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (p.hidden || s.visibility === 'hidden' || s.visibility === 'collapse' || s.display === 'none' || +s.opacity <= 0.05) return null;
        if (p.tagName === 'DETAILS' && !p.open && !p.querySelector(':scope > summary')?.contains(el)) return null;
        if (p === el) continue;
        const b = p.getBoundingClientRect();
        if (/^(auto|scroll|hidden|clip)$/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/^(auto|scroll|hidden|clip)$/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      return right > left && bottom > top ? { left, right, top, bottom, width: right - left, height: bottom - top } : null;
    };
    // 枠外の釦の検査は元の座標で続け、重なりだけを見える範囲で比べる。
    const visible = (el) => {
      // 閉じた「もっと読む」の中には、字の位置だけ残る端末がある。押せる見出しだけを調べる。
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.tagName === 'DETAILS' && !p.open && !p.querySelector(':scope > summary')?.contains(el)) return false;
        const cs = getComputedStyle(p);
        if (p.hidden || cs.visibility === 'hidden' || cs.visibility === 'collapse' || cs.display === 'none' || +cs.opacity <= 0.05) return false;
      }
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.visibility !== 'collapse' && +cs.opacity > 0.05 && cs.display !== 'none';
    };
    const name = (el) => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '') || el.tagName.toLowerCase();
    const path = (el) => { const a = []; let e = el; for (let i = 0; e && i < 3 && e !== document.body; i++, e = e.parentElement) a.unshift(name(e)); return a.join(' > '); };
    for (const root of roots) {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join('');
        if (own) {
          const fs = parseFloat(cs.fontSize);
          if (fs < 11) this.add('使いづらい', 'tiny:' + path(el), '字が小さい（11px 未満）', `${path(el)}：${fs}px「${own.slice(0, 16)}」`, '11px 以上にする（飾りの字なら外す）');
          // 明暗の比（背景の色が決まる所だけ）
          const bg = bgColor(el);
          const fg = parseColor(cs.color);
          // 字に金の grad を塗っている所（background-clip:text）は色が透明なので測らない
          if (fg && fg.a < 0.1) { /* 測らない */ } else if (bg) {
            const cr = contrast(parseColor(cs.color), bg);
            if (cr < 3) this.add('使いづらい', 'contrast:' + path(el), '字と背景の明暗の比が低い（3 未満）', `${path(el)}：${cr.toFixed(1)}「${own.slice(0, 16)}」`, '字を明るく、または背景を暗く');
          } else if (root.id === 'hud' && cs.textShadow === 'none' && !hasBgUp(el)) {
            this.add('使いづらい', 'noshadow:' + path(el), '3Dの上の字に下地も影も無い（景色に溶ける恐れ）', `${path(el)}「${own.slice(0, 16)}」`, '字に影をつけるか、半透明の下地を敷く');
          }
          // 枠から切れている（data-clamp は押すと全部出る、わざと畳んだ説明なので数えない）
          if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && !el.hasAttribute('data-clamp') && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) this.add('使いづらい', 'clip:' + path(el), '字が枠から切れている', `${path(el)}「${own.slice(0, 16)}」`, '枠を広げるか、字を折り返す');
          // 値の抜け
          if (/undefined|NaN|\[object|null(年|人|貫|秒)|Infinity/.test(own)) this.add('数と文', 'txt:' + path(el), '画面の字に値の抜け', `${path(el)}「${own.slice(0, 30)}」`, '字を組み立てる所で値の有無を確かめる');
          if (/(^|[^0-9])-\d+\s*(人|貫)/.test(own)) this.add('数と文', 'neg:' + path(el), '人数・お金が負になっている', `${path(el)}「${own.slice(0, 30)}」`, '0 を下回らないように掛ける');
        }
        // 押せる所
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.dataset.tab) {
          const r = el.getBoundingClientRect();
          if ((r.height < 28 || r.width < 28) && !el.disabled) this.add('使いづらい', 'small:' + path(el), '押せる所が小さい（28px 未満）', `${path(el)}：${Math.round(r.width)}×${Math.round(r.height)}「${el.textContent.trim().slice(0, 12)}」`, '押せる大きさを 28px 以上に');
          if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) {
            // スクロールできる画面の中なら構わない
            if (!scrollable(el)) this.add('使いづらい', 'offscreen:' + path(el), '押せる所が画面の外にある', `${path(el)}「${el.textContent.trim().slice(0, 12)}」 at ${Math.round(r.left)},${Math.round(r.top)}`, '画面の内に収めるか、スクロールできるようにする');
          }
        }
      }
      // 押せる所どうしの重なり
      const btns = [...root.querySelectorAll('button')].map((el) => ({ el, r: visibleRect(el) })).filter((b) => b.r);
      for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
        const a = btns[i], c = btns[j];
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
        const ov = inter(a.r, c.r);
        if (ov > 16) this.add('使いづらい', 'btnover:' + path(a.el) + '|' + path(c.el), '押せる所どうしが重なっている', `「${a.el.textContent.trim().slice(0, 10)}」と「${c.el.textContent.trim().slice(0, 10)}」`, '間を空ける');
      }
    }
    // HUD の札どうしの重なり・戦場が札に食われていないか
    const hud = document.getElementById('hud');
    if (hud && !hud.hidden && getComputedStyle(hud).display !== 'none') {
      // 左右の欄・知らせ欄・道しるべの欄は透明な入れ物。小地図の横や札・印の間の空白まで覆いと数えない。
      // 印そのものを測り、実際の重なりは検査する。
      // 中の札を個別に測り、親の送りで隠れた部分と画面外も除く。
      const panels = [];
      for (const el of hud.children) {
        if (!visible(el) || OVERLAP_OK.has(el.id) || getComputedStyle(el).position === 'static') continue;
        // 道しるべの親は画面全体に広がる透明な入れ物。印そのものの重なりと面積を調べる。
        const cards = el.matches('.tl, .tr, #battle-notices, #markers') ? el.children : [el];
        for (const card of cards) {
          const r = visibleRect(card);
          if (r) panels.push({ el: card, r });
        }
      }
      const covered = panelArea(panels);
      for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
        const a = panels[i], c = panels[j];
        const ov = inter(a.r, c.r);
        const small = Math.min(a.r.width * a.r.height, c.r.width * c.r.height);
        const nm2 = (el) => (el.id ? '#' + el.id : name(el));
        if (ov > small * 0.15 && ov > 400) this.add('使いづらい', 'hudover:' + nm2(a.el) + '|' + nm2(c.el), 'HUD の札どうしが重なって読めない', `${nm2(a.el)} と ${nm2(c.el)}（${W}×${H}）`, '置き場所をずらすか、片方を出している間はもう片方を隠す');
      }
      if (covered > W * H * 0.34) this.add('使いづらい', 'covered:' + W, '戦場が札に食われている（画面の3分の1超）', `${W}×${H} で ${Math.round(covered / (W * H) * 100)}%`, '札を小さくするか、平時は薄く・畳む');
    }
    // 選択の札：説明が無い・一つしかない
    const ch = document.getElementById('choice');
    if (ch && !ch.hidden) {
      const opts = ch.querySelectorAll('.opt');
      if (opts.length === 1) this.add('使いづらい', 'choice1', '選べる手が一つしかない', ch.textContent.trim().slice(0, 30), '二つ以上にするか、選択の札にしない');
      opts.forEach((o) => { if (!o.querySelector('small') || !o.querySelector('small').textContent.trim()) this.add('使いづらい', 'choiceNoDesc:' + o.textContent.trim().slice(0, 10), '選べる手に説明が無い', o.textContent.trim().slice(0, 30), '何が起きるかを一行添える'); });
      const q = ch.querySelector('.q, p, b');
      if (q && q.textContent.trim().length > 60) this.add('使いづらい', 'choiceLong', '問いの本文が長すぎる（60字超）', q.textContent.trim().slice(0, 30) + '…', '問いを短くする');
    }
  }

  // 押しても何も起きない釦を探す（壊さない釦だけ試す）
  async tryButtons(root, label) {
    this.where = label;
    const SAFE_NG = /(消す|削除|出陣|始め|出発|再開|やり直|タイトル|戻る|閉じ|買う|売る|着ける|身につけ|改名|振る舞|稽古|休む|話す|次へ|わかった|飛ばす|写す|書き出|読み込|最終|評価|進む|決め)/;
    const btns = [...root.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent && !SAFE_NG.test(b.textContent));
    for (const btn of btns.slice(0, 30)) {
      if (!btn.isConnected) continue;
      const before = document.body.innerHTML.length + '|' + (document.activeElement && document.activeElement.id);
      let changed = false;
      const mo = new MutationObserver(() => { changed = true; });
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      btn.click();
      await new Promise((r) => setTimeout(r, 250));
      mo.disconnect();
      const after = document.body.innerHTML.length + '|' + (document.activeElement && document.activeElement.id);
      if (!changed && before === after) this.add('使いづらい', 'dead:' + btn.textContent.trim().slice(0, 16), '押しても何も起きない釦', `${label}：「${btn.textContent.trim().slice(0, 16)}」`, '押したら何かが変わる（または押せない見た目にする）');
    }
  }
}

// ---------------- 下回り ----------------
// 遠景の大軍の兵の立ち位置（世界の座標）を、升目に入れて近さを引けるようにする
const _m4 = new THREE.Matrix4(), _v = new THREE.Vector3();
function farPoints(world) {
  const list = world.armies || [];
  if (!list.length) return null;
  const grid = new Map(), info = [];
  const C = 2;
  list.forEach((a, k) => {
    const grp = a.mesh; if (!grp || !grp.parent || !grp.children || !grp.children[0] || !grp.visible || a._near) { info.push({ x: 0, z: 0, n: 0 }); return; }
    grp.updateMatrixWorld(true);
    const body = grp.children[0];
    const n = body.count || 0;
    let sx = 0, sz = 0, vn = 0;
    for (let i = 0; i < n; i++) {
      body.getMatrixAt(i, _m4);
      // 道を譲って隠した兵（yieldArmies）・本物に替えた兵（take）は大きさ 0。見えないので数えない
      const e = _m4.elements;
      if (!(e[0] * e[0] + e[1] * e[1] + e[2] * e[2] >= 1e-4)) continue;
      _v.setFromMatrixPosition(_m4).applyMatrix4(body.matrixWorld);
      // 描画側も、替えられない大軍は戦場とその周囲40mに出さない（world.js の armyShader）。
      // 行列に残っているだけの、見えない兵を重なりに数えない。
      if (a.unavailable && Math.max(Math.abs(_v.x), Math.abs(_v.z)) < (world.def.moveLim || 176) + 40) continue;
      sx += _v.x; sz += _v.z; vn++;
      const key = Math.floor(_v.x / C) + ',' + Math.floor(_v.z / C);
      let c = grid.get(key); if (!c) grid.set(key, (c = []));
      c.push(_v.x, _v.z, k);
    }
    info.push({ x: Math.round(sx / Math.max(1, vn)), z: Math.round(sz / Math.max(1, vn)), n: vn });
  });
  return {
    info,
    near(x, z, r) {
      const cx = Math.floor(x / C), cz = Math.floor(z / C);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const c = grid.get((cx + i) + ',' + (cz + j)); if (!c) continue;
        for (let q = 0; q < c.length; q += 3) if (Math.hypot(c[q] - x, c[q + 1] - z) < r) return c[q + 2];
      }
      return -1;
    },
  };
}

function who(u) {
  if (!u) return '?';
  if (u.isStruct) return '柵・小屋';
  if (u.isPlayer) return '自分';
  const side = u.team === 0 ? '味方' : '敵';
  const T = { ashigaru: '足軽', samurai: '侍', busho: '武将', bow: '弓', gun: '鉄砲', cavalry: '騎馬', porter: '人足', dummy: '藁人形' }[u.type] || u.type;
  return `${side}の${u.name || T}`;
}
function inter(a, b) { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left); const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 ? w * h : 0; }
function parseColor(s) { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
function contrast(a, b) { if (!a || !b) return 21; const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
// 背景が「ほぼ塗りつぶし」の祖先があれば、その色を背景とみなす
function bgColor(el) {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const c = parseColor(getComputedStyle(e).backgroundColor);
    if (c && c.a >= 0.85) return c;
    if (e.id === 'hud') return null;
  }
  return null;
}
function hasBgUp(el) {
  for (let e = el; e && e.id !== 'hud'; e = e.parentElement) {
    const cs = getComputedStyle(e);
    const c = parseColor(cs.backgroundColor);
    if ((c && c.a > 0.25) || cs.backgroundImage !== 'none' || cs.textShadow !== 'none') return true;
  }
  return false;
}
function scrollable(el) {
  for (let e = el.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && e.scrollHeight > e.clientHeight) return true; }
  const se = document.scrollingElement || document.documentElement; return !!se && se.scrollHeight > innerHeight;
}
