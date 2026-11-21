// K516 英語：オンラインの模擬合戦で出る、戦の共通の札（HUD・持ち替え・稽古場の勝ち負けの札）の英訳（k365-cloud-48・11/21）。
//   online/*.js の字は i18n_online.js（cloud-15）が持つ。ここは online の通し（online_flow.mjs en）で残った共通の字だけ。
//   英語の時だけ house.js から addEn する（日本語の時は読まない）。
export default [
  ['▼の敵を倒せ', 'Defeat the ▼ enemies'], ['稽古人', 'Training dummy'], ['持替', 'Swap'], ['槍へ', 'To spear'],
  ['武器を持ち替える', 'Switch weapons'], ['やりに持ち替える', 'Switch to spear'], ['刀に持ち替える', 'Switch to sword'],
  ['鉄砲に持ち替える', 'Switch to gun'], ['弓に持ち替える', 'Switch to bow'],
  ['戦を止めずに保存する', 'Save without stopping the battle'], ['設定を開く', 'Open settings'],
  ['務め', 'Tasks'], ['毎日の務め', 'Daily tasks'], ['受け取れる', 'Ready to claim'], ['受け取る', 'Claim'],
  ['稽古場　腕試し', 'Training ground: skill test'], ['もう一度稽古する', 'Train again'],
  [/^体力 残り(\d+)パーセント$/, (m) => `Health ${m[1]}% left`],
  [/^疲れの棒 残り(\d+)パーセント$/, (m) => `Stamina ${m[1]}% left`],
  [/^視点を替える（今は(.+)の視点）$/, (m) => `Change view (now: ${({ 普通: 'normal', 近い: 'close', 遠い: 'far', 高い: 'high', 本人: 'first-person' })[m[1]] || 'other'})`],
  [/^討ち取り (\d+)人$/, (m) => `Kills: ${m[1]}`],
  [/^第(\d+)陣まで耐えた。\s*(\d+)分(\d+)秒$/, (m) => `Held through wave ${m[1]}. ${m[2]} min ${m[3]} s`],
  [/^これまでの最高 (\d+) 人$/, (m) => `Best so far: ${m[1]}`],
];
