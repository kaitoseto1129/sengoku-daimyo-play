// 裏で Chrome を動かすための小さな道具（別のプロファイルを使うので、ふだんの保存には触れない）
// 同時に開く数は openChrome の「席取り」で絞る（既定2・env CHROME_SLOTS で変えられる。Linux は既定で絞らない）
import { spawn, execSync } from 'node:child_process';
import { rmSync, mkdtempSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------- 同時に開く Chrome の数を絞る（席取り） ----------------
// os.tmpdir() に鍵のファイルを置いて数える（早い者勝ちで掴む＝mkdir/open の wx は他のプロセスとも安全）
const SLOT_DIR = join(tmpdir(), 'sengoku-risshin-chrome-slots');
function slotCount() {
  const env = process.env.CHROME_SLOTS;
  if (env != null && env !== '') { const n = parseInt(env, 10); if (Number.isFinite(n) && n > 0) return n; }
  // Linux（GitHub Actions）は既定で絞らない。Mac は既定 2（裏の Chrome が並ぶと機械が重くなるので）
  return process.platform === 'linux' ? 0 : 2;
}
const heldSlots = new Set();
function releaseSlot(i) {
  if (i == null) return;
  try { unlinkSync(join(SLOT_DIR, `slot-${i}.lock`)); } catch (e) { /* もう無ければよい */ }
  heldSlots.delete(i);
}
function releaseAllSlots() { for (const i of [...heldSlots]) releaseSlot(i); }
let hooked = false;
function hookRelease() {
  if (hooked) return; hooked = true;
  // 閉じた時・プロセスが終わった時に席を返す（持ち主が死んでいる鍵は、他のプロセスが奪ってよい）
  process.on('exit', releaseAllSlots);
  process.on('SIGINT', () => { releaseAllSlots(); process.exit(130); });
  process.on('SIGTERM', () => { releaseAllSlots(); process.exit(143); });
}
// 機械全体の関所（11/2 mini が裏の Chrome 40個で記憶が尽き、6度パニックで再起動した）：
// 見張り（.local-tools/mem_guard.sh）が重い時に置く /tmp/risshin_mem_heavy がある間と、裏の Chrome が CHROME_HARD（既定8）個ある間は開かずに待つ（最大20分）
function cftCount() {
  try { return +execSync("ps -Ao command= | grep -c '[G]oogle Chrome for Testing.app/Contents/MacOS/[G]oogle Chrome for Testing '", { encoding: 'utf8' }).trim() || 0; } catch (e) { return 0; }
}
async function waitMachine() {
  if (process.platform !== 'darwin') return;
  const hard = +process.env.CHROME_HARD || 8, t0 = Date.now();
  while (Date.now() - t0 < 20 * 60e3 && (existsSync('/tmp/risshin_mem_heavy') || cftCount() >= hard)) await sleep(5000 + Math.random() * 5000);
}
async function acquireSlot() {
  const n = slotCount();
  await waitMachine();
  if (n <= 0) return null;  // 絞らない
  try { mkdirSync(SLOT_DIR, { recursive: true }); } catch (e) { /* あればよい */ }
  hookRelease();
  for (;;) {
    for (let i = 0; i < n; i++) {
      const f = join(SLOT_DIR, `slot-${i}.lock`);
      try {
        const fd = openSync(f, 'wx');  // 無い時だけ作れる（他のプロセスと取り合っても安全）
        writeFileSync(fd, String(process.pid));
        closeSync(fd);
        heldSlots.add(i);
        return i;
      } catch (e) {
        // 埋まっている：持ち主の PID が死んでいれば、消して奪う（他のプロセスと同時でも wx で守られる）
        let pid = NaN;
        try { pid = parseInt(readFileSync(f, 'utf8').trim(), 10); } catch (e2) { /* 読めない＝取り合い中。次へ */ }
        let alive = true;
        if (Number.isFinite(pid)) { try { process.kill(pid, 0); } catch (e2) { alive = false; } } else { alive = false; }
        if (!alive) {
          try { unlinkSync(f); } catch (e2) { /* 他のプロセスが先に消したならよい */ }
          try {
            const fd = openSync(f, 'wx');
            writeFileSync(fd, String(process.pid));
            closeSync(fd);
            heldSlots.add(i);
            return i;
          } catch (e3) { /* 取り合いで負けた。次の席へ */ }
        }
      }
    }
    await sleep(300 + Math.random() * 400);  // 席が空くまで待つ
  }
}

// 開発用サーバーが動いていなければ起こす
// 開発用サーバーのポート。RISSHIN_PORT で変えられる（git worktree で別の係が自分の置き場を見る時）
// 前置きの環境変数を付けずに打てるよう、引数の --port=8766 でも変えられる
const PORT_ARG = process.argv.find((a) => /^--port=\d+$/.test(a));
export const PORT = +(PORT_ARG && PORT_ARG.slice(7)) || +process.env.RISSHIN_PORT || 8765;
export async function ensureServer(port = PORT) {
  let up = false;
  try { await fetch(`http://localhost:${port}/`); up = true; } catch (e) { /* 起こす */ }
  if (up) {
    // 公開先では道具と本編が別の置き場にあり、部品は index.html が指す版の下にある。
    const localRoot = join(HERE, '..');
    const root = existsSync(join(localRoot, 'src', 'main.js')) ? localRoot : join(localRoot, 'risshin');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const source = html.match(/(?:src=["']|import\(\s*["'])\.\/((?:v\d+\/)?src\/)main\.js/);
    if (!source) throw new Error('本編の読み込み先が見つかりません。題のページを確かめてください');
    // そのポートに別の置き場（古い worktree）のサーバーが残っていると、直す前の絵を撮ってしまう（10/9 桶狭間の雨）。中身を比べて止める
    for (const name of ['world.js', 'main.js']) {
      const f = source[1] + name;
      const served = await fetch(`http://localhost:${port}/${f}`).then((r) => r.text()).catch(() => null);
      if (served != null && served !== readFileSync(join(root, f), 'utf8')) {
        throw new Error(`ポート ${port} のサーバーは別の置き場を見ています（${f} が違う）。RISSHIN_PORT で別のポートを使ってください`);
      }
    }
    return null;
  }
  const p = spawn('python3', [join(HERE, '..', 'serve.py'), String(port)], { stdio: 'ignore', detached: true });
  p.unref();
  for (let i = 0; i < 30; i++) { await sleep(200); try { await fetch(`http://localhost:${port}/`); return p; } catch (e) { /* 待つ */ } }
  throw new Error('開発用サーバーが起きませんでした');
}

// ポートは回ごとに変える（1時間ごとの bot と手元の bot が同じ Chrome につながらないように）
export async function openChrome({ width = 1600, height = 900, port = 9400 + Math.floor(Math.random() * 500) } = {}) {
  // 同時に開く数を絞る（席が空くまでここで待つ）
  const slot = await acquireSlot();
  const prof = mkdtempSync(join(tmpdir(), process.env.CDP_PREFIX || 'sengoku-risshin-'));   // 録画など止めたくない物は CDP_PREFIX=rec- で見張りの外に
  let chrome;
  try {
    // Mac は手元の Chrome。Linux（GitHub Actions の ubuntu）は入っている google-chrome を、箱の中でも動くよう --no-sandbox で（GPU 無し＝swiftshader）
    const linux = process.platform === 'linux';
    // Mac は Chrome for Testing を先に使う。普段の Chrome を裏で使うと、kaito が開く Chrome やサインインの頁が裏の Chrome に吸い込まれて開けなかった（10/16）
    const cft = `${process.env.HOME}/.local/cft/chrome/mac_arm-155.0.8059.79/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
    const bin = process.env.CHROME || (!linux && existsSync(cft) ? cft : null) || (linux ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((f) => existsSync(f)) : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    if (!bin) throw new Error('Chrome が見つかりません（CHROME= で場所を渡す）');
    chrome = spawn(bin, [
      '--headless=new', `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
      // Mac は GPU（metal）で描く。swiftshader は CPU で描くので、裏の Chrome が並ぶと機械がとても重くなる（CHROME_GL=swiftshader で元に戻せる）
      ...(linux || process.env.CHROME_GL === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu']), '--ignore-gpu-blocklist',
      ...(linux ? ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'] : []),
      '--hide-scrollbars', '--mute-audio', 'about:blank',
    ], { stdio: 'ignore' });
    // node が止められた時に Chrome だけが置き去りにならないように（置き去りが十数個たまって機械が重くなった。10/6）
    const reap = () => { try { chrome.kill('SIGKILL'); } catch (e) { /* noop */ } };
    process.once('exit', reap);
    // SIGALRM：perl -e 'alarm N; exec node …' の時間切れで node が死に、Chrome が置き去りになっていた（11/2）
    for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGALRM']) process.once(s, () => { reap(); process.exit(1); });
    let ws;
    for (let i = 0; i < 150 && !ws; i++) {
      try {
        const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((p) => p.type === 'page');
        if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
      } catch (e) { /* 起動待ち */ }
      if (!ws) await sleep(200);
    }
    if (!ws) throw new Error('Chrome が起きませんでした');
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const pend = new Map();
    const evs = new Set();   // 知らせ（method のある便り）を受ける（Tracing など）
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) for (const f of evs) f(d); });
    // Chrome の頁が答えなくなると（描画側の固まり・落ち）、前は永遠に待って 0% のまま何時間も止まった（11/12 桶狭間の PV で三度）。
    //   決まった時（CDP_TIMEOUT 秒・既定 20 分）で諦めて投げ、呼び手に「固まった」と分かるようにする。知らせ（method のある便り）はこの限りでない
    const LIMIT = (+process.env.CDP_TIMEOUT || 1200) * 1000;
    const send = (method, params = {}) => new Promise((r, j) => {
      const i = ++id;
      const tm = setTimeout(() => { if (pend.has(i)) { pend.delete(i); j(new Error(`Chrome が ${Math.round(LIMIT / 60000)} 分答えません（${method}）。頁が固まったか落ちた疑い`)); } }, LIMIT);
      pend.set(i, (d) => { clearTimeout(tm); r(d); });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    // THREE_LOCAL=<three の npm 展開先（package/）>：外へ出られない箱で、jsdelivr の three を手元の物で返す
    if (process.env.THREE_LOCAL) {
      const base = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
      evs.add(async (d) => {
        if (d.method !== 'Fetch.requestPaused') return;
        const { requestId, request } = d.params;
        try { const body = readFileSync(join(process.env.THREE_LOCAL, request.url.slice(base.length)));
          await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: body.toString('base64') });
        } catch (e) { await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); }
      });
      await send('Fetch.enable', { patterns: [{ urlPattern: base + '*' }] });
    }
    await send('Page.enable');
    // THREE_LOCAL=three の package 置き場：外へ出られない箱で、CDN の three を手元の物に差し替える（確かめ専用）
    if (process.env.THREE_LOCAL) {
      await send('Fetch.enable', { patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/npm/three@*' }] });
      evs.add(async (d) => {
        if (d.method !== 'Fetch.requestPaused') return;
        const u = new URL(d.params.request.url); const rel = u.pathname.replace(/^\/npm\/three@[^/]+\//, '');
        try { const body = readFileSync(join(process.env.THREE_LOCAL, rel)).toString('base64');
          send('Fetch.fulfillRequest', { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body });
        } catch (e) { send('Fetch.failRequest', { requestId: d.params.requestId, errorReason: 'Failed' }); }
      });
    }
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    return {
      send,
      on(f) { evs.add(f); return () => evs.delete(f); },
      async goto(url, wait = 6000) { await send('Page.navigate', { url }); await sleep(wait); },
      async ev(expr) {
        const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 300));
        return r.result?.result?.value;
      },
      async png() {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        // 撮影側の失敗応答には result が無い。画像を読む前に確かめる。
        if (r.error || typeof r.result?.data !== 'string' || !r.result.data.length) {
          throw new Error(`画面を撮れませんでした（撮影側の応答番号：${r.error?.code ?? '不明'}）。撮影できる状態でやり直してください`);
        }
        return Buffer.from(r.result.data, 'base64');
      },
      close() { try { ws.close(); } catch (e) { /* noop */ } chrome.kill(); releaseSlot(slot); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* 消しきれない一時ファイルは残してよい */ } }, 800); },
    };
  } catch (e) {
    // 起こせなかった時は、掴んだ席とプロセスをちゃんと片付けてから投げる
    try { chrome && chrome.kill(); } catch (e2) { /* noop */ }
    releaseSlot(slot);
    try { rmSync(prof, { recursive: true, force: true, maxRetries: 3 }); } catch (e2) { /* 消しきれない一時ファイルは残してよい */ }
    throw e;
  }
}
