// K635①：武者絵の肖像（assets/portrait/<id>.webp・512×768）の置き場。ある人の一覧は index.json（一度だけ読む）。軽い読み物なので札・図鑑のどこからでも読める
import { BUSHOU_ONLINE } from './bushou_online.js';
let PORT = null;
export const portraits = () => PORT || (PORT = fetch('assets/portrait/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((a) => new Set(a)));
export const portraitSrc = (id) => `assets/portrait/${id}.webp`;
const BY_NAME = new Map(BUSHOU_ONLINE.map((b) => [b.name, b.id]));
export const portraitIdOf = (name) => BY_NAME.get(name) || null;
