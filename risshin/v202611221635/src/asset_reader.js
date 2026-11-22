// 素材のモジュールは使い捨ての作業場所で開く。終了時にモジュールの記憶ごと返す。
// アプリ専用の配信方式でも読めるよう、取得は画面側、動的読み込みは一時の住所で行う。
let queue = Promise.resolve();
const jobs = new Set();
async function unpack(source, mode) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const m = await import(url);
    const bytes = (s) => {
      const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
      const out = new Uint8Array(s.length / 4 * 3 - pad);
      for (let start = 0, offset = 0; start < s.length; start += 65536) {
        const part = atob(s.slice(start, start + 65536));
        for (let i = 0; i < part.length; i++) out[offset++] = part.charCodeAt(i);
      }
      return out;
    };
    let value;
    if (mode === 'bytes') value = bytes(m.default);
    else if (mode === 'dem') value = { ...m.default, data: new Int16Array(bytes(m.default.data).buffer) };
    else if (mode === 'voice') value = { ...m, CLIPS: m.CLIPS.map(bytes) };
    else if (mode === 'weapons') {
      value = { default: {} };
      for (const [name, part] of Object.entries(m.default)) {
        const copy = { ...part };
        for (const key of ['P', 'N', 'C', 'K', 'I']) if (typeof copy[key] === 'string') copy[key] = bytes(copy[key]);
        value.default[name] = copy;
      }
    } else if (mode === 'images') {
      value = { default: {} };
      for (const [name, image] of Object.entries(m.default)) {
        const comma = image.indexOf(',');
        value.default[name] = new Blob([bytes(image.slice(comma + 1))], { type: image.slice(5, image.indexOf(';')) });
      }
    }
    else value = { ...m };
    const transfers = new Set();
    const collect = (item) => {
      if (ArrayBuffer.isView(item)) transfers.add(item.buffer);
      else if (item && typeof item === 'object') for (const child of Object.values(item)) collect(child);
    };
    collect(value);
    self.postMessage({ value }, [...transfers]);
  } finally { URL.revokeObjectURL(url); }
}
export function readAsset(name, mode = 'module') {
  if (!/^[a-z0-9_]+$/.test(name)) return Promise.reject(new Error('素材の名前が不正です'));
  const task = { name, cancelled: false, cancel: null };
  jobs.add(task);
  const result = queue.catch(() => {}).then(async () => {
    if (task.cancelled) throw new Error('素材の支度を取り消しました');
    const controller = new AbortController();
    // 11/21 K581（比叡山の読み込みが1〜2割で止まる）：アプリの配り手が答えない素材は、fetch が abort を聞かずに待ち続けると
    //   読み手の列（queue）ごと止まり、後の素材も読めなくなる。abort とは別に、時が来たら・取り消されたら必ず断る
    let failNow = () => {};
    const hard = new Promise((_, reject) => { failNow = reject; });
    hard.catch(() => {});
    const timer = setTimeout(() => { controller.abort(); failNow(new Error('素材の読みが時間切れです')); }, mode === 'dem' ? 15000 : 30000);
    task.cancel = () => { controller.abort(); failNow(new Error('素材の支度を取り消しました')); };
    let worker, address;
    try {
      const response = await Promise.race([fetch(new URL('./asset_' + name + '.js', import.meta.url), { signal: controller.signal }), hard]);
      if (!response.ok) throw new Error('素材を読めませんでした');
      // K581：素材の字（最大5MB・UTF-16 で倍）を画面側の文字列にせず、受けた束のまま作業場所へ渡す（写さずに手放す）。
      //   アプリ（WKWebView）の記憶の上限に、同じ素材の写しが画面側と作業場所の両方に乗るのを避ける
      const source = await Promise.race([response.arrayBuffer(), hard]);
      if (task.cancelled) throw new Error('素材の支度を取り消しました');
      address = URL.createObjectURL(new Blob([
        'self.onmessage = async ({data}) => { try { await (' + unpack.toString() + ')(data.source, data.mode); } catch (e) { self.postMessage({error: String(e.message || e)}); } };',
      ], { type: 'text/javascript' }));
      worker = new Worker(address);
      return await new Promise((resolve, reject) => {
        const fail = () => reject(new Error('素材を展開できませんでした'));
        hard.catch(fail);
        task.cancel = fail;
        controller.signal.addEventListener('abort', fail, { once: true });
        worker.onerror = fail;
        worker.onmessageerror = fail;
        worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.value);
        worker.postMessage({ source, mode }, [source]);
      });
    } finally {
      clearTimeout(timer); worker?.terminate();
      if (address) URL.revokeObjectURL(address);
      jobs.delete(task);
    }
  });
  queue = result.then(() => undefined, () => undefined);
  return result.finally(() => jobs.delete(task));
}
// K581：支度が止まった時に、読みかけの素材の名を記録へ残す（実機で何を読んでいたかを見る）
export const pendingAssetReads = () => [...jobs].map((task) => task.name);
export function cancelAssetReads(select = () => true) {
  for (const task of jobs) {
    if (!select(task.name)) continue;
    task.cancelled = true; task.cancel?.(); jobs.delete(task);
  }
}
