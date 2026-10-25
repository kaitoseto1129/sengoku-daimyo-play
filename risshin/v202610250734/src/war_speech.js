// 従来の素材は合成の台詞と、日本語と確認できない群声の録音。
// 日本語の肉声の掛け声を用意するまでは、読み込み・再生とも行わない。
// 戦と読み込み画面の呼び出し口は保ち、音源・定期処理は作らない。
export function loadWarSpeech() { return Promise.resolve(); }
export function releaseWarSpeech() {}
const SILENT_SPEECH = Object.freeze({
  ready: false,
  at() {},
  canName() { return false; },
  line() { return false; },
  bark() {},
  crowd() {},
  dispose() {},
});
export function createWarSpeech() { return SILENT_SPEECH; }
