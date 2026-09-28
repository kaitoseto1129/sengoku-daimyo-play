// 裏で Chrome を動かすための小さな道具（別のプロファイルを使うので、ふだんの保存には触れない）
import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = dirname(fileURLToPath(import.meta.url));

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
  const prof = mkdtempSync(join(tmpdir(), 'sengoku-risshin-'));
  // Mac は手元の Chrome。Linux（GitHub Actions の ubuntu）は入っている google-chrome を、箱の中でも動くよう --no-sandbox で（GPU 無し＝swiftshader）
  const linux = process.platform === 'linux';
  const bin = process.env.CHROME || (linux ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((f) => existsSync(f)) : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  if (!bin) throw new Error('Chrome が見つかりません（CHROME= で場所を渡す）');
  const chrome = spawn(bin, [
    '--headless=new', `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
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
    close() { try { ws.close(); } catch (e) { /* noop */ } chrome.kill(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* 消しきれない一時ファイルは残してよい */ } }, 800); },
  };
}
