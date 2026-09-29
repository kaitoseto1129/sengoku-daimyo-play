// 裏で Chrome を動かすための小さな道具（別のプロファイルを使うので、ふだんの保存には触れない）
// 同時に開く数は openChrome の「席取り」で絞る（既定2・env CHROME_SLOTS で変えられる。Linux は既定で絞らない）
import { spawn } from 'node:child_process';
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
async function acquireSlot() {
  const n = slotCount();
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
export async function ensureServer(port = 8765) {
  try { await fetch(`http://localhost:${port}/`); return null; } catch (e) { /* 起こす */ }
  const p = spawn('python3', [join(HERE, '..', 'serve.py'), String(port)], { stdio: 'ignore', detached: true });
  p.unref();
  for (let i = 0; i < 30; i++) { await sleep(200); try { await fetch(`http://localhost:${port}/`); return p; } catch (e) { /* 待つ */ } }
  throw new Error('開発用サーバーが起きませんでした');
}

// ポートは回ごとに変える（1時間ごとの bot と手元の bot が同じ Chrome につながらないように）
export async function openChrome({ width = 1600, height = 900, port = 9400 + Math.floor(Math.random() * 500) } = {}) {
  // 同時に開く数を絞る（席が空くまでここで待つ）
  const slot = await acquireSlot();
  const prof = mkdtempSync(join(tmpdir(), 'sengoku-risshin-'));
  let chrome;
  try {
    // Mac は手元の Chrome。Linux（GitHub Actions の ubuntu）は入っている google-chrome を、箱の中でも動くよう --no-sandbox で（GPU 無し＝swiftshader）
    const linux = process.platform === 'linux';
    const bin = process.env.CHROME || (linux ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((f) => existsSync(f)) : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    if (!bin) throw new Error('Chrome が見つかりません（CHROME= で場所を渡す）');
    chrome = spawn(bin, [
      '--headless=new', `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
      // Mac は GPU（metal）で描く。swiftshader は CPU で描くので、裏の Chrome が並ぶと機械がとても重くなる（CHROME_GL=swiftshader で元に戻せる）
      ...(linux || process.env.CHROME_GL === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu']), '--ignore-gpu-blocklist',
      ...(linux ? ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'] : []),
      '--hide-scrollbars', '--mute-audio', 'about:blank',
    ], { stdio: 'ignore' });
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
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    return {
      send,
      async goto(url, wait = 6000) { await send('Page.navigate', { url }); await sleep(wait); },
      async ev(expr) {
        const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 300));
        return r.result?.result?.value;
      },
      async png() { const r = await send('Page.captureScreenshot', { format: 'png' }); return Buffer.from(r.result.data, 'base64'); },
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
