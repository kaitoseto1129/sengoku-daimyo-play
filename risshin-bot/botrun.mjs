// 自動テストプレイ：裏の Chrome で bot（index.html?bot）を何回か走らせ、日本語の報告書にまとめる
// 使い方: node prototype/tools/botrun.mjs [回数=3] [--only=nagashinojo,castle]
//   --only：遊ぶ戦を鍵で絞る（okehazama moribe sunomata nagashinojo tobinosu shitaragahara suwahara anegawa sekigahara sanadamaru castle dojo town kinome mikatagahara）。絞ったときの報告は bot-日時-only.md
//   kinome（攻城 MVP・木ノ芽峠の砦）は「信長で遊ぶ」側の戦なので --only=kinome と一緒に --q=mode=lord も渡す
//   --render：3D も描く（ふだんは描かない＝速い。描画の不具合も見たい時だけ付ける）。--norender：明に描かないと指定する（既定と同じ。--render と両方あれば描かない方を勝たせる）
//   --speed=N：描かない時、1コマに戦の計算を N 回回して早送りする（既定 1・最大 8。当たり判定の刻みは細かいままで、回す回数だけ増える）
//   日本地図の城攻めは、回ごとに地図の筋書き（長篠・保井・関ヶ原・大坂）を替えて、攻められる城から一つを選ぶ
// 正体は「不満を持ちまくる遊び手」：落ちた・辻褄・使いづらい・数と文の粗 の四つの目で見る（src/audit.js）
// 画面の広さを回ごとに変える（1600×900 → 1280×720 → 1920×1080）
// 報告は sengoku-risshin/reports/bot-YYYY-MM-DD-HH.md
//   --mobile：iPhone の横向き（874×402・倍率3・触る操作・携帯の UA）で遊ぶ
//   --persona=chu|reki|act|sen|sek：五人のテストプレイヤーの一人として 1 回だけ遊ぶ（画面は携帯）。--n=1〜3 で戦の数（無ければ ばらばら）
//     感想は reports/players/日時_性格.md、写真は reports/players/shots/、五人のまとめは reports/players/まとめ.md（毎回書き直す）
//     一回の上限は20分（--limit=分 で変えられる）。tools/players.sh が五人を順に回し続ける
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer, openChrome, sleep, PORT } from './cdp.mjs';
// 機械が混んでいると node の中の通信の部品（undici）が assert(!this.paused) で落ちることがある。その時だけは落とさずに続ける
process.on('uncaughtException', (e) => { if (String(e && e.stack).includes('undici')) { console.error('（通信の部品の一時的な誤りを無視）'); return; } console.error(e); process.exit(1); });

const args = process.argv.slice(2);
// --row=番号：1000人の表（players-table.mjs）のその人として遊ぶ（性格・戦の数・画面・変わり目を表から足す）
{ const ra = args.find((a) => a.startsWith('--row=')); if (ra) { const m = await import('./players-table.mjs'); args.push(...m.argsOf(m.ROWS[+ra.slice(6) % m.TOTAL])); } }
const N = +(args.find((a) => /^\d+$/.test(a)) || 3);
const RENDER = args.includes('--render') && !args.includes('--norender');
const SPEED = Math.min(8, Math.max(1, Math.round(+((args.find((a) => a.startsWith('--speed=')) || '').slice(8) || 1)) || 1));
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const BRIEF = args.includes('--brief');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const now = new Date();
const day = now.toLocaleDateString('sv-SE');
const stamp = `${day}-${String(now.getHours()).padStart(2, '0')}${ONLY ? '-only' : ''}`;
const SIZES = [[1600, 900], [1280, 720], [1920, 1080]];
const MOBILE = args.includes('--mobile');
const PERSONA = (args.find((a) => a.startsWith('--persona=')) || '').slice(10);
const NBAT = (args.find((a) => a.startsWith('--n=')) || '').slice(4);
const LIMIT_MIN = +((args.find((a) => a.startsWith('--limit=')) || '').slice(8) || 20);
// 1000人の表（tools/players-table.mjs）から：--size=844x390（1280x720 はパソコン＝指でなく鍵盤とマウス）・--id=番号・--q=ページへ渡す変わり目
//   --out=置き場（GitHub Actions で。まとめ・管理画面の書き出しはせず、感想・写真（jpg・小さく）・history.jsonl だけ書く）
const arg = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const SIZE = arg('size') ? arg('size').split('x').map(Number) : null;
const PC = !!SIZE && SIZE[0] >= 1024;
const PID = arg('id');
const VQ = arg('q');
const OUT = arg('out');
const MAXSHOTS = +(arg('maxshots') || (OUT ? 3 : 7));
const VL = PID ? await import('./players-table.mjs').then((m) => m.labelOf(m.ROWS[+PID % m.TOTAL])).catch(() => '') : '';
const PNAME = { chu: ['中学生', 'はじめての中学生', 'ハルト（13歳・中学一年）'], reki: ['歴史好き', '歴史好きの大人', 'ミチオ（62歳・郷土史の会）'], act: ['アクション好き', 'アクション好き', 'ソウタ（24歳・アクションゲーム好き）'], sen: ['戦略家', '指揮好きの戦略家', 'ケイコ（45歳・将棋と戦略ゲーム好き）'], sek: ['せっかち', 'せっかちな社会人', 'ユウキ（35歳・昼休みに遊ぶ会社員）'] };
const SEV = { 3: '★★★ やめたくなった', 2: '★★ かなり困った', 1: '★ 少し気になった' };
await ensureServer();

// iPhone の横向き（iPhone 16 Pro 相当：874×402・倍率3）にして、指で触る端末のふりをする
const PHONE = SIZE && !PC ? { width: SIZE[0], height: SIZE[1] } : { width: 874, height: 402 };
async function toPhone(c) {
  await c.send('Emulation.setDeviceMetricsOverride', { width: PHONE.width, height: PHONE.height, deviceScaleFactor: 3, mobile: true, screenWidth: PHONE.width, screenHeight: PHONE.height, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
}
if (PERSONA) { await playOnce(); await sleep(1200); if (OUT) process.exit(0); try { (await import('node:child_process')).execFileSync(process.execPath, [new URL('./mkadmin.mjs', import.meta.url).pathname], { stdio: 'ignore' }); } catch (e) { /* 管理画面の書き出しに失敗しても感想はそのまま */ } process.exit(0); }

const runs = [];
for (let i = 0; i < N; i++) {
  const t0 = Date.now();
  const [width, height] = MOBILE ? [PHONE.width, PHONE.height] : SIZES[i % SIZES.length];
  const c = await openChrome({ width, height });
  try {
    if (MOBILE) await toPhone(c);
    await c.goto(`http://localhost:${PORT}/?bot&k=${i + Math.floor(Math.random() * 4)}${ONLY ? '&only=' + ONLY : ''}${RENDER ? '' : '&norender' + (SPEED > 1 ? '&speed=' + SPEED : '')}${VQ ? '&' + VQ : ''}&r=${Date.now()}`, 3000);
    await c.ev('Storage.prototype.setItem = function () {}; return 1;');
    let data = null;
    // 一回に長くて40分（戦が増えたので）。途中で落ちたら（ページのエラー）そのことも拾う
    let last = '';
    for (let k = 0; k < 480 && !data; k++) {
      await sleep(5000);
      data = await c.ev('return window.__botData || null;');
      // 進み具合を一行ずつ出す（どの戦で止まっているかが分かるように）
      const now = await c.ev('const el = document.getElementById("bot-log"); const b = window.__game && window.__game.battle; return (el ? el.lastElementChild?.textContent || "" : "") + (b ? `（戦 ${Math.round(b.t)}秒・${b.phase || ""}）` : "");').catch(() => '');
      if (now && now.replace(/（戦.*$/, '') !== last.replace(/（戦.*$/, '') || k % 12 === 0) { if (now !== last) console.log(`  ${Math.round((Date.now() - t0) / 1000)}秒：${now}`); last = now; }
    }
    if (!data) { const where = await c.ev('return document.getElementById("bot-log")?.innerText.split("\\n").slice(-2).join(" ／ ") || "";').catch(() => ''); throw new Error(`40分たっても終わらなかった（最後の記録：${where}）`); }
    runs.push({ ok: true, data, sec: Math.round((Date.now() - t0) / 1000) });
    console.log(`${i + 1}/${N} 回目 おわり（${Math.round((Date.now() - t0) / 1000)}秒）`);
  } catch (e) {
    runs.push({ ok: false, err: String(e.message || e) });
    console.log(`${i + 1}/${N} 回目 失敗：${e.message || e}`);
  } finally { c.close(); }
}

// ---- まとめ ----
const done = runs.filter((r) => r.ok);
// 戦の名は報告から拾う（長篠編の戦が増えても並ぶように）
const names = [...new Set(done.flatMap((r) => r.data.battles.map((b) => b.battle)))];
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

// --brief：戦ごと一行「id 秒数 勝ち負け 倒れた回数 エラーの数」を出力
if (BRIEF) {
  for (const battle of names) {
    const rs = done.map((r) => r.data.battles.find((b) => b.battle === battle)).filter(Boolean);
    if (!rs.length) continue;
    const wins = rs.filter((r) => r.main === true).length;
    const falls = rs.filter((r) => r.down).length;
    const errors = rs.reduce((acc, r) => acc + (r.errors ? r.errors.length : 0), 0);
    const avgTime = Math.round(rs.reduce((x, r) => x + r.time, 0) / rs.length);
    console.log(`${battle} ${avgTime} ${wins}/${rs.length} ${falls} ${errors}`);
  }
  await sleep(1200);
  process.exit(0);
}

const lines = [`# 戦国立身3D　自動テストプレイの報告（${stamp}時）`, '', `bot を ${N} 回走らせ、${done.length} 回おわった。`, ''];
const warn = [];
lines.push('| 戦 | 任務達成 | 重傷 | 平均の時間 | 平均の戦功 | 組の生き残り（平均） | 1コマの計算 |', '|---|---|---|---|---|---|---|');
names.forEach((nm, i) => {
  const rs = done.map((r) => r.data.battles.find((b) => b.battle === nm)).filter(Boolean);
  const win = rs.filter((r) => r.main === true).length;
  const down = rs.filter((r) => r.down).length;
  const sq = rs.map((r) => r.squad).filter((s) => s && s !== '—').map((s) => { const [a, b] = s.split('/').map(Number); return b ? a / b : 0; });
  lines.push(`| ${nm} | ${win}/${rs.length} | ${down} | ${avg(rs.map((r) => r.time))}秒 | ${avg(rs.map((r) => r.merit))} | ${sq.length ? Math.round(avg(sq.map((x) => x * 100))) + '%' : '—'} | ${rs.length ? (rs.reduce((x, r) => x + r.msPerFrame, 0) / rs.length).toFixed(2) : '—'}ms |`);
  if (rs.length && win < rs.length) warn.push(`${nm}：任務を落とした回がある（${rs.length - win}/${rs.length}）`);
  if (sq.length && avg(sq.map((x) => x * 100)) < 30) warn.push(`${nm}：組がほとんど生き残らない（平均 ${Math.round(avg(sq.map((x) => x * 100)))}%）`);
  if (rs.some((r) => r.time >= 890 || r.timeout)) warn.push(`${nm}：900秒まで終わらなかった回がある（進行が止まっている疑い）`);
  rs.forEach((r) => { r.errors.forEach((e) => warn.push(`${nm}：不具合 ${e}`)); r.stuck.forEach((e) => warn.push(`${nm}：動けない ${e}`)); r.waits.forEach((e) => warn.push(`${nm}：待たされる ${e}`)); });
});
const dj = done.map((r) => r.data.dojo).filter(Boolean);
if (dj.length) lines.push('', `稽古場（90秒）：平均 ${avg(dj.map((d) => d.kills))}人討ち取り、第${avg(dj.map((d) => d.wave))}陣まで。倒れた回 ${dj.filter((d) => d.down).length}/${dj.length}`);
dj.forEach((d) => d.errors.forEach((e) => warn.push(`稽古場：不具合 ${e}`)));
runs.filter((r) => !r.ok).forEach((r) => warn.push(`bot が最後まで走らなかった：${r.err}`));
lines.push('', '## 気になること', '', ...(warn.length ? [...new Set(warn)].map((w) => `- ${w}`) : ['- とくになし']));
// ---- 四つの目：種類ごとに多い順 ----
const merged = new Map();
for (const r of done) for (const it of (r.data.audit || [])) {
  const k = it.cat + '|' + it.key;
  const m = merged.get(k) || { ...it, count: 0, samples: [], sizes: new Set() };
  m.count += it.count; m.sizes.add(r.data.size);
  for (const smp of it.samples) if (m.samples.length < 3) m.samples.push(smp);
  merged.set(k, m);
}
const CATS = ['落ちた', '辻褄', '使いづらい', '数と文'];
const byTitle = new Map();
for (const m of merged.values()) { const k = m.cat + '|' + m.title; if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(m); }
lines.push('', '## 不満の記録（四つの目）', '');
lines.push(CATS.map((c) => `${c} ${[...merged.values()].filter((m) => m.cat === c).length}件`).join('　／　'), '');
for (const cat of CATS) {
  const groups = [...byTitle.entries()].filter(([k]) => k.startsWith(cat + '|')).map(([, v]) => v).sort((a, b) => b.reduce((x, m) => x + m.count, 0) - a.reduce((x, m) => x + m.count, 0));
  for (const g of groups) {
    const total = g.reduce((x, m) => x + m.count, 0);
    lines.push(`### 【${cat}】${g[0].title}（${g.length}件・のべ${total}回）`);
    for (const m of g.slice(0, 8)) {
      const s0 = m.samples[0] || {};
      lines.push(`- ${s0.where || '—'}／${s0.who || '―'}　${s0.what || ''}${m.count > 1 ? `（${m.count}回）` : ''}${m.sizes.size ? `　[${[...m.sizes].join('・')}]` : ''}`);
    }
    if (g.length > 8) lines.push(`- ほか ${g.length - 8} 件`);
    lines.push(`  → ${g[0].fix}`, '');
  }
}
lines.push('', '## 一回ずつの報告', '');
done.forEach((r, i) => {
  lines.push(`### ${i + 1}回目（${r.sec}秒かかった）`, '');
  r.data.battles.forEach((b) => {
    lines.push(`- ${b.battle}${b.note ? `（${b.note}）` : ''}：${b.time}秒・戦功${b.merit}・任務${b.main === true ? '達成' : '失敗'}${b.down ? '（重傷）' : ''}${b.timeout ? '（時間切れ）' : ''}・組${b.squad}　内訳：${b.lines || 'なし'}`);
    if (b.flow && b.flow.length) lines.push(`  - 任務の流れ：${b.flow.join(' → ')}`);
    if (b.ally) lines.push(`  - 味方の隊：${b.ally}`);
    if (b.named && b.named.length) lines.push(`  - 名のある武将：${b.named.join('／')}`);
    if (b.hurt) lines.push(`  - 受けた傷：${b.hurt}`);
  });
  lines.push('');
});
mkdirSync(join(ROOT, 'reports'), { recursive: true });
// 同じ時の報告があれば、分を足して上書きしない
let out = join(ROOT, 'reports', `bot-${stamp}.md`);
if (existsSync(out)) out = join(ROOT, 'reports', `bot-${stamp}${String(new Date().getMinutes()).padStart(2, '0')}.md`);
writeFileSync(out, lines.join('\n'));
console.log('報告：' + out);
await sleep(1200);  // Chrome の後片付けを待つ
// 管理画面のデータも新しくする
try { (await import('node:child_process')).execFileSync(process.execPath, [new URL('./mkadmin.mjs', import.meta.url).pathname], { stdio: 'ignore' }); } catch (e) { /* 管理画面の書き出しに失敗しても bot の報告はそのまま */ }
process.exit(0);

// ======================================================================
// テストプレイヤー（性格）で一回遊ぶ：感想・写真・まとめを書く
// ======================================================================
async function playOnce() {
  const PD = OUT || join(ROOT, 'reports', 'players');
  mkdirSync(join(PD, 'shots'), { recursive: true });
  const [short, pname, who] = PNAME[PERSONA] || [PERSONA, PERSONA, ''];
  const d = new Date();
  const st = PID ? `p${PID}` : `${d.toLocaleDateString('sv-SE')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const t0 = Date.now();
  // GitHub Actions（--out）は機械が空いていて後片付けも速いので、余りを短く（一人5〜6分の枠を遊びに使う）
  const deadline = t0 + LIMIT_MIN * 60e3 - (OUT ? 45e3 : 150e3);
  // 画面の中の遊びは、上限から4分引いた持ち時間で切り上げさせる（読み込み・後片付け・写真の分）
  const budget = Math.max(120, LIMIT_MIN * 60 - (OUT ? 80 : 240));
  // 混んだ機械では一回の問い合わせが返らないことがあるので、待つのは60秒まで
  const ev = (x) => Promise.race([c.ev(x), sleep(45e3).then(() => { throw new Error('ページが60秒答えない'); })]);
  let data = null, cut = '', c = null;
  const shots = {};
  try {
    const W = PC ? SIZE : [PHONE.width, PHONE.height];
    c = await openChrome({ width: W[0], height: W[1] });
    if (!PC) await toPhone(c);
    await c.goto(`http://localhost:${PORT}/?bot&persona=${PERSONA}&shots=${loadavg()[0] > 110 ? 0 : 1}&maxshots=${MAXSHOTS}&budget=${budget}${NBAT ? '&n=' + NBAT : ''}${ONLY ? '&only=' + ONLY : ''}${args.includes('--norender') ? '&norender' + (SPEED > 1 ? '&speed=' + SPEED : '') : ''}${VQ ? '&' + VQ : ''}&r=${Date.now()}`, OUT ? 6000 : 3000);
    await c.ev('Storage.prototype.setItem = function () {}; return 1;');
    let last = '', lastT = 0, keep = null, keepT = 0, slow = 0, frozeAt = '';
    while (!data) {
      if (Date.now() > deadline) { cut = `${LIMIT_MIN}分で打ち切った`; break; }
      await sleep(700);
      // 一回の問い合わせで、写真の頼み・終わり・進み具合をまとめて聞く（混んだ機械では問い合わせ一つが重い）
      const tq = Date.now();
      const st0 = await ev(`const b = window.__game && window.__game.battle; return { want: window.__shotWant || null, data: window.__botData || null, log: (window.__botLog || '') + (b ? '（戦 ' + Math.round(b.t) + '秒・' + (b.phase || '') + '）' : ''), part: ${Date.now() - keepT > 60e3 ? '(window.__botFlush && window.__botFlush(), window.__botPartial || null)' : 'null'} };`).catch(() => null);
      if (!st0) { slow++; if (slow === 1) frozeAt = last; console.log(`  ${Math.round((Date.now() - t0) / 1000)}秒：ページが答えない（${slow}回目）`); continue; }
      if (Date.now() - tq > 20e3) console.log(`  ページの返事が遅い（${Math.round((Date.now() - tq) / 1000)}秒）`);
      slow = 0;
      if (st0.part) { keep = st0.part; keepT = Date.now(); }
      data = st0.data;
      if (st0.log !== last && Date.now() - lastT > 30e3) { console.log(`  ${Math.round((Date.now() - t0) / 1000)}秒：${st0.log}`); last = st0.log; lastT = Date.now(); }
      const want = st0.want;
      if (want && !shots[want.id]) {
        const n = Object.keys(shots).length + 1;
        const file = `shots/${st}_${short}_${n}.${process.platform === 'darwin' ? 'png' : 'jpg'}`;
        try {
          if (process.platform !== 'darwin') {
            // Mac でない時（GitHub Actions）：小さい jpg をそのまま置く（横 900px ほど）
            const lm = await c.ev('return [innerWidth, innerHeight, devicePixelRatio];');
            const sc = Math.min(1, 900 / (lm[0] * lm[2]));
            const r = await Promise.race([c.send('Page.captureScreenshot', { format: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: lm[0], height: lm[1], scale: sc } }), sleep(90e3).then(() => { throw new Error('写真が撮れない'); })]);
            writeFileSync(join(PD, file), Buffer.from(r.result.data, 'base64'));
            shots[want.id] = file;
            await ev(`window.__shotDone = window.__shotDone || {}; window.__shotDone[${want.id}] = ${JSON.stringify(file)}; return 1;`).catch(() => {});
            continue;
          }
          // PNG で撮らせると、混んだ機械では一枚2分かかる。JPEG で撮って、手元で PNG に直す（sips。横 1311 に縮める）
          const r = await Promise.race([c.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }), sleep(90e3).then(() => { throw new Error('写真が撮れない'); })]);
          const jp = join(PD, 'shots', `.tmp_${want.id}.jpg`);
          writeFileSync(jp, Buffer.from(r.result.data, 'base64'));
          execFileSync('sips', ['-s', 'format', 'png', '-Z', '1311', jp, '--out', join(PD, file)], { stdio: 'ignore' });
          rmSync(jp, { force: true });
          shots[want.id] = file;
        } catch (e) { shots[want.id] = ''; }
        await ev(`window.__shotDone = window.__shotDone || {}; window.__shotDone[${want.id}] = ${JSON.stringify(shots[want.id])}; return 1;`).catch(() => {});
      }
    }
    if (!data) data = await ev('if (window.__botFlush) window.__botFlush(); return window.__botPartial || null;').catch(() => null);
    // ページが固まって答えない時は、最後に聞けた途中の記録を使い、「固まった」ことも問題として残す
    if (!data && keep) data = keep;
    if (!data) data = { persona: PERSONA, size: PC ? `${SIZE[0]}×${SIZE[1]}` : `${PHONE.width}×${PHONE.height}`, dpr: PC ? 1 : 3, touch: !PC, quality: 'low', battles: [], problems: [], feel: '' };
    if (slow >= 3) { data.problems = [...(data.problems || []), { key: 'page-frozen', cat: '落ちた', title: '遊んでいる途中で画面が固まった（長く答えない）', what: `${slow}回続けて60秒以上返事が無い。最後の様子：${frozeAt || last || '—'}`, where: frozeAt || last || '', sev: 3, count: 1, battles: [], fix: '固まった戦の読み込み・描画（初めての描画での影や素材の組み立て）を見る' }]; }
    if (!data) data = await ev('if (window.__botFlush) window.__botFlush(); return window.__botPartial || null;').catch(() => null);
  } catch (e) { cut = `途中で止まった：${String(e.message || e).slice(0, 160)}`; }
  finally { if (c) c.close(); }
  const sec = Math.round((Date.now() - t0) / 1000);
  if (!data) { appendFileSync(join(PD, 'loop.log'), `${new Date().toISOString()} ${pname}：データが取れなかった（${cut}）\n`); console.log('データが取れなかった：' + cut); return; }
  // ---- その人の感想 ----
  const probs = (data.problems || []).map((p) => ({ ...p, shot: p.shot || p.shotNear || '' }));
  probs.sort((a, b) => b.sev - a.sev || b.count - a.count);
  const bats = data.battles || [];
  const L = [`# テストプレイヤーの感想：${pname}`, '', `- 人：${who}${PID ? `（${+PID}番）` : ''}`, ...(VL ? [`- 変わり目：${VL}`] : []), `- 時：${d.toLocaleString('ja-JP')}（${sec}秒かかった${cut ? '・' + cut : ''}）`, `- 画面：${PC ? `パソコン ${data.size}・鍵盤とマウス` : `iPhone の横向き ${data.size}・倍率${data.dpr}・${data.touch ? '指で触る操作（touch.js の釦・棒・なぞり）' : '指の操作に切り替わらなかった'}`}・画質 ${({ low: '低', mid: '中', high: '高' })[data.quality] || data.quality}`, `- 遊んだ戦：${bats.map((b) => `${b.battle}（${b.main === true ? '達成' : '失敗'}${b.down ? '・倒れた' : ''}${b.timeout ? '・切り上げ' : ''}）`).join('、') || 'なし'}`, `- 機械の混み具合：${loadavg()[0].toFixed(0)}（load average）`, '', '## ひとこと', '', `> ${data.feel || '（感想を書く前に止まった）'}`, '', `## 見つけた問題（${probs.length}件・困った順）`, ''];
  probs.forEach((p, i) => {
    L.push(`### ${i + 1}. ${p.title}`, `- どこで：${p.where || p.battles.join('・') || '—'}`, `- 何が：${p.what || '—'}`, `- どれくらい困ったか：${SEV[p.sev] || p.sev}（${p.count}回）`);
    if (p.fix) L.push(`- 直し方の目安：${p.fix}`);
    if (p.shot) L.push(`- 画面：![${p.title}](${p.shot})${p.shotNear && !data.problems.find((q) => q.key === p.key).shot ? '（その戦の山場の一枚）' : ''}`);
    L.push('');
  });
  L.push('## 遊んだ記録', '');
  for (const b of bats) {
    L.push(`- ${b.battle}${b.note ? `（${b.note}）` : ''}：${b.time}秒・任務${b.main === true ? '達成' : '失敗'}${b.down ? '（倒れた）' : ''}・戦功${b.merit}・組${b.squad}・討ち取り${b.kills ?? '—'}・突き${b.attacks ?? '—'}/当たり${b.hits ?? '—'}・号令${b.cmds ?? 0}回・指で押した数${b.taps ?? '—'}・読み込み${((b.loadMs || 0) / 1000).toFixed(1)}秒・戦の前の札${b.storyLen || 0}字${b.stepMs != null ? `・1コマ${b.stepMs}ms（実時間${b.realSec}秒・内訳 ${b.prof || '—'}）` : ''}`);
    if (b.flow && b.flow.length) L.push(`  - 任務の流れ：${b.flow.join(' → ')}`);
    if (b.ally) L.push(`  - 味方の隊：${b.ally}`);
    if (b.hurt) L.push(`  - 受けた傷：${b.hurt}`);
    (b.errors || []).forEach((e) => L.push(`  - 不具合：${e}`));
    (b.shots || []).forEach((s) => L.push(`  - ${s.label}：![${s.label}](${s.file})`));
  }
  const out = join(PD, `${st}_${short}.md`);
  writeFileSync(out, L.join('\n') + '\n');
  // ---- 積み重ね（まとめの元） ----
  const rec = { at: d.toISOString(), file: `${st}_${short}.md`, id: PID ? +PID : null, v: VQ || '', label: VL, size: PC ? `${SIZE[0]}x${SIZE[1]}` : `${PHONE.width}x${PHONE.height}`, ver: process.env.RISSHIN_VER || '', persona: PERSONA, name: pname, battles: bats.map((b) => b.battle.replace(/（途中で打ち切り）$/, '')), won: bats.filter((b) => b.main === true).length, down: bats.filter((b) => b.down).length, feel: data.feel || '', cut, issues: probs.map((p) => ({ key: p.key, cat: p.cat, title: p.title, what: p.what, where: p.where, sev: p.sev, count: p.count, battles: p.battles, fix: p.fix, shot: p.shot })) };
  appendFileSync(join(PD, 'history.jsonl'), JSON.stringify(rec) + '\n');
  if (!OUT) writeSummary(PD);
  console.log(`感想：${out}（問題 ${probs.length}件）`);
}

// 五人の問題を合わせて「多くの人が困った順」に。同じ問題は束ねて数え、直ったら消える
function writeSummary(PD) {
  const lines = existsSync(join(PD, 'history.jsonl')) ? readFileSync(join(PD, 'history.jsonl'), 'utf8').trim().split('\n').filter(Boolean) : [];
  const runs = lines.slice(-400).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const M = new Map();
  runs.forEach((r, ri) => {
    for (const it of r.issues) {
      // 同じ問題：鍵の数字を均して束ねる
      const k = it.key.replace(/\d+(\.\d+)?/g, '#');
      const m = M.get(k) || { key: k, title: it.title, cat: it.cat, fix: it.fix, who: new Set(), times: 0, runs: 0, sev: 0, battles: new Set(), last: -1, lastAt: '', what: it.what, where: it.where, shot: '' };
      m.who.add(r.persona); m.times += it.count; m.runs++; m.sev = Math.max(m.sev, it.sev);
      (it.battles || []).forEach((b) => m.battles.add(b));
      if (ri >= m.last) { m.last = ri; m.lastAt = r.at; m.what = it.what; m.where = it.where; m.title = it.title; if (it.shot) m.shot = it.shot; }
      M.set(k, m);
    }
  });
  // 直ったか：最後に出たあと、同じ戦（戦に結ばない物は どの回でも）を3回遊んで一度も出ていなければ「直った」とみなす
  const live = [], gone = [];
  for (const m of M.values()) {
    const after = runs.slice(m.last + 1).filter((r) => !m.battles.size || r.battles.some((b) => m.battles.has(b)));
    (after.length >= 3 ? gone : live).push(m);
  }
  const score = (m) => m.who.size * 100 + m.sev * 10 + Math.log2(1 + m.times);
  live.sort((a, b) => score(b) - score(a));
  gone.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const whoName = (s) => [...s].map((k) => (PNAME[k] || [k])[0]).join('・');
  const byP = {};
  for (const r of runs) byP[r.persona] = r;
  const L = ['# テストプレイヤーのまとめ：改善候補（多くの人が困った順）', '', `更新 ${new Date().toLocaleString('ja-JP')}　／　数えた回 ${runs.length}回　／　残っている問題 ${live.length}件　／　直ったらしい物 ${gone.length}件`, '', '並べ方：困った人の数 → 困り具合（★3＝やめたくなった）→ 回数。同じ問題は一つに束ねる。最後に出たあと同じ戦を3回遊んで出なければ「直った」として下へ移す。', '', '| 順 | 改善候補 | 困った人 | 困り具合 | のべ回数 | どこで | 直し方の目安 |', '|---|---|---|---|---|---|---|'];
  live.slice(0, 40).forEach((m, i) => L.push(`| ${i + 1} | ${m.title.replace(/\|/g, '／')}${m.shot ? ` [画面](${m.shot})` : ''} | ${m.who.size}人（${whoName(m.who)}） | ${'★'.repeat(m.sev)} | ${m.times} | ${[...m.battles].slice(0, 3).join('・').replace(/\|/g, '／') || '—'} | ${(m.fix || '—').replace(/\|/g, '／')} |`));
  if (live.length > 40) L.push('', `ほか ${live.length - 40} 件（一人だけ・少し気になった物）`);
  L.push('', '## 上位の中身', '');
  live.slice(0, 10).forEach((m, i) => L.push(`${i + 1}. **${m.title}**（${whoName(m.who)}）`, `   - 何が：${m.what || '—'}`, `   - どこで：${m.where || '—'}`, ''));
  L.push('## 人ごとの最新の感想', '');
  for (const k of ['chu', 'reki', 'act', 'sen', 'sek']) { const r = byP[k]; if (!r) continue; L.push(`- **${(PNAME[k] || [k])[1]}**（${new Date(r.at).toLocaleString('ja-JP')}・${r.battles.join('、')}）[感想](${r.file})`, `  > ${r.feel}`); }
  if (gone.length) { L.push('', '## 直ったらしい物（最近出ていない）', ''); gone.slice(0, 20).forEach((m) => L.push(`- ${m.title}（最後は ${new Date(m.lastAt).toLocaleString('ja-JP')}・${whoName(m.who)}）`)); }
  writeFileSync(join(PD, 'まとめ.md'), L.join('\n') + '\n');
  // 管理画面が読む形
  writeFileSync(join(PD, 'summary.json'), JSON.stringify({ made: new Date().toISOString(), runs: runs.length, live: live.slice(0, 40).map((m) => ({ title: m.title, cat: m.cat, who: [...m.who], sev: m.sev, times: m.times, battles: [...m.battles].slice(0, 4), fix: m.fix, what: m.what, shot: m.shot })), liveN: live.length, gone: gone.slice(0, 20).map((m) => ({ title: m.title, lastAt: m.lastAt, who: [...m.who] })), latest: Object.values(byP).map((r) => ({ persona: r.persona, name: r.name, at: r.at, file: r.file, battles: r.battles, won: r.won, down: r.down, feel: r.feel, n: r.issues.length })) }, null, 1));
}
