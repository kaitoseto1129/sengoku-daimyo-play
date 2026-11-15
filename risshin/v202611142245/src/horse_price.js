// 馬の値（K308 要件43）：城下で暴れ馬を押さえると馬屋の者との仲が上がり（G.townFavor.umaya・town_events.js）、一つにつき一割引き（二割まで）
export function horseOff(G) { return Math.min(2, (G && G.townFavor && G.townFavor.umaya) || 0) * 0.1; }
export function horsePrice(G, h) { return Math.round((h.cost || 0) * (1 - horseOff(G)) * 10) / 10; }
