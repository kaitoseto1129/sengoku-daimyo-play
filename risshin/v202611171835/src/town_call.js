// ======================================================================
// 殿のお召し（K308 要件40）：序盤は殿を遠くで見るだけ（town_procession.js）。出世して城の門が開くと（足軽大将から）、
//   城下に入って少しすると使番が「殿がお呼びじゃ」と知らせ、城の奥の柵の前に殿が立っている。参上すると殿が直に声を掛ける。
//   身分が上がるたびに一度ずつ（G.nobuCalled に呼ばれた身分を覚える）。
// ======================================================================
import { allyGroup } from './bhelp.js';
import { RANKS, BATTLES } from './state.js';

export function callSetup(rt, { at }) {
  const G = rt.G;
  if (G.lord || (G.nobuCalled || 0) >= (G.rank || 0)) return null;
  const C = rt.flags.nobuCall = { at, g: null, told: false, met: false, tellAt: 8 };
  rt.addInteract('nobu-call', () => (C.told && !C.met ? { x: at.x, z: at.z - 3 } : null), '参上する　殿の御前', () => meet(rt), { r: 2.6 });
  return C;
}

export function callTick(rt) {
  const C = rt.flags.nobuCall;
  if (!C) return;
  // 殿と近習は、町を組み終えた後に立たせる（組む途中で作ると、町の形の間引きで隠れたままになった）
  if (!C.g && rt.t > 0.5) {
    const guard = rt.army.spawnGuard; rt.army.spawnGuard = null;
    try { C.g = allyGroup(rt, { name: '殿', anchor: { x: C.at.x + 2.4, z: C.at.z - 0.6 }, facing: Math.PI, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type: 'samurai', n: 1, o: { invuln: true, flag: 'eiraku', haori: 0x7a1d14 } }, { type: 'samurai', n: 2, o: { invuln: true, flag: null, weapon: 'none' } }]); } finally { rt.army.spawnGuard = guard; }
    for (const u of C.g.units) u.noTarget = true;
    // 名の武将の姿（実写の顔・本物の胴丸）は城下では読み込まず、名の付いた侍は描けずに隠れた。名を付けずに並の侍の形（赤い羽織）で作り、
    //   後から名を付ける（vatNameOk＝軽い立体の姿のまま描いてよい印）
    C.g.units.forEach((u, i) => { u.name = i ? '近習' : '織田信長'; u.vatNameOk = true; });
  }
  if (C.told || rt.t < C.tellAt || rt.choice) return;
  C.told = true;
  rt.say('使番', `${rt.G.name}殿！　殿がお呼びじゃ。城へ参られよ`, 4);
  rt.marker('mk-call', { x: C.at.x, z: C.at.z - 3 }, '殿の御前');
  if (rt.objectives.length < 3) rt.obj('call', '殿のお召しじゃ。城へ参上せよ', 'side');
}

function meet(rt) {
  const C = rt.flags.nobuCall, G = rt.G;
  if (!C || C.met || rt.choice) return;
  C.met = true;
  G.nobuCalled = G.rank || 0;
  rt.unmark('mk-call'); rt.objRemove('call');
  const prev = BATTLES[Math.max(0, (G.battle || 1) - 1)];
  const rank = RANKS[G.rank || 0]?.name || '';
  const L = (G.rank || 0) >= 4
    ? `${G.name}、侍大将の働き、しかと見た。次の戦では一手を任せる。軍議にも顔を出せ`
    : `${G.name}か。${prev ? prev.name.replace(/の戦い?$/, '') + 'での' : ''}働き、聞いておる。${rank}になったからには、わしの目の届く所で励め`;
  rt.choose(`織田信長「${L}」`, [{ label: 'ははっ（深く頭を下げる）' }], () => rt.say('', '殿が直に名を呼んだ。足軽の頃は、遠くで馬上の姿を見るだけだった', 4), 30);
}
