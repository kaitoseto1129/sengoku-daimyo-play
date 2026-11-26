// K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：家の編の軽い型（light_battle.js）の戦に、史実の流れの段を足すための短い書き方。
//   中身は light_battle.js の段の表（fight・hold・move・rest）と同じ物を返すだけ。待つ秒（hold の dur）を延ばして稼がず、寄せる敵の手と段を足す。
//   say は [[話し手, 台詞, 秒], ...]。foes は [敵(名, x, z, 兵の並び), ...]。waves・later は [波(秒, 話し手, 叫び, foes), ...]
export const foe = (name, x, z, list) => ({ name, from: { x, z }, list });
export const wave = (t, who, cry, foes) => ({ t, say: [who, cry], foes });
export const fightS = (at, obj, title, sub, say, foes, o = {}) => ({ kind: 'fight', at, obj, title, sub, say, foes, max: 130, ...o });
export const holdS = (at, label, obj, title, sub, say, waves, o = {}) => ({ kind: 'hold', at, label, obj, r: 16, dur: 70, title, sub, say, waves, ...o });
export const moveS = (at, label, obj, say, o = {}) => ({ kind: 'move', at, label, obj, r: 10, max: 100, say, ...o });
export const restS = (say, heal = 0.4) => ({ kind: 'rest', dur: 8, heal, say });
export const boss = (name, horse = true) => ({ type: 'samurai', n: 1, o: { name, horse } });   // 敵の名のある将（討てる）
