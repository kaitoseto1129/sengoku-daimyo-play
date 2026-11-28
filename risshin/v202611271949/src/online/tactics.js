// ② オンライン対戦の武将の固有戦術（docs/online_plan_1121.md の 31・online/tactics.js）（K585 36〜44・kaito 11/20 の要件書 docs/online_final_1120.md）。11/21 cloud-31
//   必殺技にしない。巨大な効果の絵は出さない。条件を満たすと使える「戦術」で、1試合に1〜2回・続けて使えない。
//   使った時は使番の声・法螺・隊列の動き（下知）で見せ、数の上乗せでなく「揃い・反応・粘り」を変える。
//   つなぎ口（対戦の画面・武将の表から呼ぶ）：
//     TACTICS[id]            戦術の表（名・武将・家・条件の説明・1試合の回数・間）
//     tacticReady(rt, team, id, own) → { ok, why, ctx }   今使えるか（使えない訳は短い日本語）。own＝その武将の隊（無ければその陣営の全部）
//     useTactic(rt, team, id, own)   → true／false      使う（回数を減らし、効きを隊へ掛ける）
//     tacticsTick(rt, dt)       毎コマ呼ぶ（続く効き：士気の下限・込めの速さ・崩れにくさ）
//     passiveTactics(rt, team, ids)  常時の小さな効き（N・R・A の得意兵種。例：滝川＝鉄砲の指揮）
//   1試合の残り回数と続く効きは rt.tactics に持つ（戦ごとに作り直される rt に置くので、試合をまたがない）。
//   兵の組（army.groups）の order・dest・morale・holdFire と、army.scriptSalvo（揃えた一斉射）だけを使う。

import { isEn } from '../i18n.js';
import { gunSyncLink, gunSyncTick } from './gun_sync.js';
import { bushouByName } from './bushou_online.js';
import { unitOf } from './unit_type.js';   // K601 の主兵種（army4k.js の隊の兵と同じ元。army4k は重いので読まない）
const UNIT_HEISHU = { kiba: '騎馬', teppo: '鉄砲', yari: '槍', yumi: '弓' };
const heishuOf = (name) => UNIT_HEISHU[unitOf(bushouByName(name))?.id] || '槍';

const alive = (g) => g && !g.routed && g.count > 0;
const center = (g) => (g.center ? g.center() : g.units.reduce((a, u) => (u.alive ? { x: a.x + u.pos.x / g.count, z: a.z + u.pos.z / g.count } : a), { x: 0, z: 0 }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const guns = (g) => g.units.filter((u) => u.alive && u.type === 'gun' && !u.sidearm);
const loaded = (u) => !u.reload && !(u.cd > 0) && (u.gunAmmo ?? 20) > 0 && !u.atk;
const engaged = (g, A) => g.units.some((u) => u.alive && u.target && u.target.alive && !u.target.isStruct && u.target.team !== g.team && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 3.5);
const mine = (A, team) => A.groups.filter((g) => alive(g) && g.team === team && !g.civ);
const foes = (A, team) => A.groups.filter((g) => alive(g) && g.team !== team && !g.civ);
const nearestFoe = (A, team, p, r = Infinity) => { let best = null, bd = r; for (const g of foes(A, team)) { const d = dist(center(g), p); if (d < bd) { bd = d; best = g; } } return best; };
const segDist = (x, z, s) => { const [ax, az, bx, bz] = s, dx = bx - ax, dz = bz - az, f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * f, z - az - dz * f); };
const say = (rt, at, nm, v = 1) => { try { rt.army.play(nm, at, v); } catch (e) { /* 鳴らせなくても戦術は効く */ } };

export const TACTICS = {
  // 信長「鉄砲集中運用」：複数の鉄砲隊が射線の中→一斉射撃の揃いが上がる（ただの威力の上乗せではない）
  teppo_shuchu: { name: '鉄砲集中運用', en: 'Massed guns', desc: '込めた鉄砲が同じ一瞬に放つ。撃った後は皆込め直す', busho: '織田信長', ie: 'oda', uses: 2, gap: 45, needs: '込めた鉄砲隊が二つ以上・七十m 内に敵' },
  // 島津家久「釣り野伏」：自隊が退き・敵が追い・伏兵の隊が横に・士気が一定以上→反転と伏兵の挟み撃ち
  tsurinobuse: { name: '釣り野伏', en: 'Fake retreat ambush', desc: '退く隊が振り向き、伏兵が追う敵の横を突く', busho: '島津家久', ie: 'shimazu', uses: 1, gap: 0, needs: '退く隊を敵が追い・横に伏兵の隊・士気五十以上' },   // 追う敵は三十五m 内・伏兵は筋の横八m 以上・六十m 内
  // 真田信繁「真田の備え」：柵・土塁・城の周りの守り→十字の射撃が揃い・崩れにくく・予備の反応が速い
  sanada_sonae: { name: '真田の備え', en: 'Sanada defense', desc: '柵や塀の際の隊が崩れにくく、込めが少し速い', busho: '真田信繁', ie: 'toyotomi', uses: 1, gap: 0, needs: '柵・塀・土塁の十二m 内で守る隊（45秒・士気の下限30・込め5%速い）' },   // 柵の無い野では「守れ」の下知で構えた隊
  // 武田信玄「予備投入」：押されている備の後ろへ、控えの隊をすぐ出す（戦場全体の指揮型）
  yobi_tonyu: { name: '予備投入', en: 'Send in reserves', desc: '控えの隊がすぐ押された備を助けに出る', busho: '武田信玄', ie: 'takeda', uses: 2, gap: 60, needs: '士気の落ちた備と、まだ戦っていない控えの隊' },
  // 上杉謙信「連続攻勢」：一つの備が当たった後、次の備を間を置かずに当てる（攻めの波を切らさない）
  renzoku_kosei: { name: '連続攻勢', en: 'Rolling attack', desc: '次の備が間を置かずに同じ敵へ当たる', busho: '上杉謙信', ie: 'uesugi', uses: 2, gap: 50, needs: '敵と当たっている備と、八十m 内の空いた備' },
  // K584（online_req 31〜35）の武将の例
  // 柴田勝家「猛攻」：一定時間、前へ進む隊の士気が落ちにくい（正面突破）
  moko: { name: '猛攻', en: 'All-out attack', desc: '進む槍の隊の士気が落ちにくい', busho: '柴田勝家', ie: 'oda', uses: 2, gap: 60, needs: '敵へ進む・当たっている槍の隊' },
  // 山県昌景「赤備突撃」：敵と当たっている敵の隊の横へ、騎馬が突き掛かる（側面の衝撃）
  akazonae: { name: '赤備突撃', en: 'Red Guard charge', desc: '騎馬が戦っている敵の横へ突き掛かる', busho: '山県昌景', ie: 'takeda', uses: 2, gap: 60, needs: '空いた騎馬の隊と、味方と当たっている敵の隊が六十m 内' },
  // 黒田官兵衛「軍師」：しばらく敵の布陣と目標が読める（霧の中の敵を見える扱いに。霧の決まり pvp_rules が tacticReveal を読む）
  gunshi: { name: '軍師', en: 'Strategist', desc: 'しばらく敵の布陣と目標が読める', busho: '黒田官兵衛', ie: 'toyotomi', uses: 1, gap: 0, needs: 'いつでも（1試合1回）' },
  // 11/21 cloud-31（司令塔・cloud-47「模擬合戦で固有戦術が鉄砲集中しか出ない」）：初めの4人の SS・S で戦術の無かった武将へ（S・SS は原則一つ・online_final 36）
  // 徳川家康「堅陣」：当たっている備が、守りの構えのまま崩れにくい（三河武士の粘り）
  kenjin: { name: '堅陣', en: 'Firm line', desc: '当たっている備が守りの構えのまま崩れにくい', busho: '徳川家康', ie: 'tokugawa', uses: 2, gap: 60, needs: '敵と当たっている備' },
  // 毛利元就「三矢の結束」：近くに並ぶ二つ以上の備が互いに支え合い、崩れにくい
  sanbon: { name: '三矢の結束', en: 'Three arrows', desc: '並んだ備が支え合い、崩れにくい', busho: '毛利元就', ie: 'mori', uses: 2, gap: 60, needs: '六十m 内に並ぶ二つ以上の備と、近くの敵' },
  // 島津義久「総掛かり」：まだ戦っていない備をすべて一度に敵へ掛ける（1試合1回）
  sogakari: { name: '総掛かり', en: 'All attack', desc: 'まだ戦っていない備が一度に敵へ掛かる', busho: '島津義久', ie: 'shimazu', uses: 1, gap: 0, needs: 'まだ戦っていない備が二つ以上・九十m 内に敵' },
  // 本多忠勝・柿崎景家「先駆け」：空いた備が真っ先に敵へ掛かり、敵の出鼻をくじく
  sakigake: { name: '先駆け', en: 'Vanguard', desc: '空いた備が真っ先に掛かり、敵の出鼻をくじく', busho: '本多忠勝', ie: 'tokugawa', uses: 2, gap: 60, needs: '空いた備と、七十m 内の敵' },
  // 吉川元春「追い討ち」：崩れかけた敵の備を、空いた備がすぐ追って討つ
  // K601 14・K603 28（11/21 iMac k592-net）：固有戦術の表に無い武将の戦法（bushou_online.js の senpo。名は senpo の名で出す）。主兵種の本物の動きを小さく変える
  // 鉄砲の将「一斉射」：十五秒、隊の斉射の間を半分に詰める（弾は斉射ごとに一つ＝弾が早く減る。一発の重さは同じ）
  g_seisha: { name: '一斉射', en: 'Rapid volleys', desc: '鉄砲隊が間を詰めて続けて斉射する（弾が早く減る）', busho: '', ie: '', uses: 2, gap: 60, needs: '弾が二つ以上・十五〜百m に敵' },
  // 弓の将「援射」：味方と当たっている敵の隊へ矢を集め、その敵の士気を揺らす。弓隊の射る間も十五秒詰める
  g_ensha: { name: '援射', en: 'Covering arrows', desc: '弓隊が味方と当たっている敵へ矢を集める', busho: '', ie: '', uses: 2, gap: 60, needs: '空いた弓隊と、八十m 内の味方と当たっている敵' },
  tsuigeki: { name: '追い討ち', en: 'Hot pursuit', desc: '崩れかけた敵を空いた備がすぐ追う', busho: '吉川元春', ie: 'mori', uses: 2, gap: 45, needs: '士気の落ちた敵の備と、八十m 内の空いた備' },
  // 11/21 cloud-31（司令塔・cloud-33 の照らし：S・SS は原則一つの固有戦術・online_final 36）：残りの S・SS 15人。今の戦術の形（form）を使い回し、名と出所は武将ごと（docs/online_tactics_sources_1121.md）
  akechi_teppo: { name: '惟任の鉄砲', en: 'Akechi musket line', desc: '込めた鉄砲が同じ一瞬に放つ', busho: '明智光秀', ie: 'oda', form: 'teppo_shuchu', uses: 2, gap: 45, needs: '込めた鉄砲の隊・七十m 内に敵' },
  date_kiba: { name: '騎馬鉄砲', en: 'Mounted guns', desc: '騎馬が戦っている敵の横へ突き掛かる', busho: '伊達政宗', ie: 'other', form: 'akazonae', uses: 2, gap: 60, needs: '空いた騎馬の隊と、味方と当たっている敵の隊が六十m 内' },
  niwa_mamori: { name: '米五郎左の備え', en: 'Steady Niwa', desc: '当たっている備が守りの構えのまま崩れにくい', busho: '丹羽長秀', ie: 'oda', form: 'kenjin', uses: 2, gap: 60, needs: '敵と当たっている備' },
  ii_akazonae: { name: '井伊の赤備え', en: 'Ii Red Guard', desc: '騎馬が戦っている敵の横へ突き掛かる', busho: '井伊直政', ie: 'tokugawa', form: 'akazonae', uses: 2, gap: 60, needs: '空いた騎馬の隊と、味方と当たっている敵の隊が六十m 内' },
  katsuyori_kyoshu: { name: '強襲', en: 'Assault', desc: '進む槍の隊の士気が落ちにくい', busho: '武田勝頼', ie: 'takeda', form: 'moko', uses: 2, gap: 60, needs: '敵へ進む・当たっている槍の隊' },
  naoe_shingari: { name: '長谷堂の殿', en: 'Hasedo rearguard', desc: '当たっている備が守りの構えのまま崩れにくい', busho: '直江兼続', ie: 'uesugi', form: 'kenjin', uses: 2, gap: 60, needs: '敵と当たっている備' },
  masayuki_ueda: { name: '上田の誘い', en: 'Ueda lure', desc: '退く隊が振り向き、伏兵が追う敵の横を突く', busho: '真田昌幸', ie: 'toyotomi', form: 'tsurinobuse', uses: 1, gap: 0, needs: '退く隊を敵が追い・横に伏兵の隊・士気五十以上' },
  kiyomasa_rojo: { name: '蔚山の籠城', en: 'Ulsan siege', desc: '柵や塀の際の隊が崩れにくく、込めが少し速い', busho: '加藤清正', ie: 'toyotomi', form: 'sanada_sonae', uses: 1, gap: 0, needs: '柵・塀・土塁の十二m 内で守る隊' },
  kosaka_gozume: { name: '海津の後詰', en: 'Kaizu relief', desc: '控えの隊がすぐ押された備を助けに出る', busho: '高坂昌信', ie: 'takeda', form: 'yobi_tonyu', uses: 2, gap: 60, needs: '士気の落ちた備と、まだ戦っていない控えの隊' },
  gamo_sakigake: { name: '蒲生の先懸け', en: 'Gamo vanguard', desc: '空いた備が真っ先に掛かり、敵の出鼻をくじく', busho: '蒲生氏郷', ie: 'toyotomi', form: 'sakigake', uses: 2, gap: 60, needs: '空いた備と、七十m 内の敵' },
  kagekatsu_jin: { name: '無言の陣', en: 'Silent ranks', desc: '並んだ備が支え合い、崩れにくい', busho: '上杉景勝', ie: 'uesugi', form: 'sanbon', uses: 2, gap: 60, needs: '六十m 内に並ぶ二つ以上の備と、近くの敵' },
  ujiyasu_youchi: { name: '河越の夜討ち', en: 'Kawagoe night raid', desc: 'まだ戦っていない備が一度に敵へ掛かる', busho: '北条氏康', ie: 'other', form: 'sogakari', uses: 1, gap: 0, needs: 'まだ戦っていない備が二つ以上・九十m 内に敵' },
  motochika_ichiryo: { name: '一領具足', en: 'Ichiryo gusoku', desc: '控えの隊がすぐ押された備を助けに出る', busho: '長宗我部元親', ie: 'other', form: 'yobi_tonyu', uses: 2, gap: 60, needs: '士気の落ちた備と、まだ戦っていない控えの隊' },
  tachibana_kake: { name: '立花の寡兵の掛かり', en: 'Tachibana strike', desc: '空いた備が真っ先に掛かり、敵の出鼻をくじく', busho: '立花宗茂', ie: 'other', form: 'sakigake', uses: 2, gap: 60, needs: '空いた備と、七十m 内の敵' },
  sakon_kuisegawa: { name: '杭瀬川の誘い', en: 'Kuisegawa lure', desc: '退く隊が振り向き、伏兵が追う敵の横を突く', busho: '島左近', ie: 'toyotomi', form: 'tsurinobuse', uses: 1, gap: 0, needs: '退く隊を敵が追い・横に伏兵の隊・士気五十以上' },
};

// 武将の名 → 固有戦術（武将の表 docs/online_generals.json に tactic の行が入れば、そちらを先に読む）
export const BUSHO_TACTIC = {
  '織田信長': 'teppo_shuchu', '島津家久': 'tsurinobuse', '真田信繁': 'sanada_sonae', '武田信玄': 'yobi_tonyu', '上杉謙信': 'renzoku_kosei',
  '柴田勝家': 'moko', '山県昌景': 'akazonae', '黒田官兵衛': 'gunshi',
  '徳川家康': 'kenjin', '毛利元就': 'sanbon', '島津義久': 'sogakari', '本多忠勝': 'sakigake', '柿崎景家': 'sakigake', '吉川元春': 'tsuigeki',
  '明智光秀': 'akechi_teppo', '伊達政宗': 'date_kiba', '丹羽長秀': 'niwa_mamori', '井伊直政': 'ii_akazonae', '武田勝頼': 'katsuyori_kyoshu', '直江兼続': 'naoe_shingari', '真田昌幸': 'masayuki_ueda', '加藤清正': 'kiyomasa_rojo', '高坂昌信': 'kosaka_gozume', '蒲生氏郷': 'gamo_sakigake', '上杉景勝': 'kagekatsu_jin', '北条氏康': 'ujiyasu_youchi', '長宗我部元親': 'motochika_ichiryo', '立花宗茂': 'tachibana_kake', '島左近': 'sakon_kuisegawa',
};
export const BUSHO_PASSIVE = { '滝川一益': 'takigawa_teppo', '馬場信春': 'baba_yari' };

// 常時の小さな効き（N・R・A の得意兵種。固有戦術ではない）
export const PASSIVES = {
  takigawa_teppo: { name: '鉄砲の指揮', busho: '滝川一益', ie: 'oda', reload: 0.9 },   // 鉄砲の込めが一割速い
  baba_yari: { name: '槍の備え', busho: '馬場信春', ie: 'takeda', morale: 8 },           // 槍の組の士気の下限が少し高い
};

function state(rt) {
  return rt.tactics || (rt.tactics = { used: {}, last: {}, active: [], passive: {} });
}

// 今使えるか。ctx には使う時に要る隊を入れて返す
export function tacticReady(rt, team, id, own) {
  const T = TACTICS[id], A = rt.army, S = state(rt);
  if (!T || !A) return { ok: false, why: '戦術が無い' };
  const k = team + ':' + id, used = S.used[k] || 0;
  const f = T.form || id;   // 同じ形の戦術（form）は同じ条件と効きを使う（武将ごとの名だけ違う）
  if (used >= T.uses) return { ok: false, why: '使い切った' };
  if (S.last[k] != null && A.time - S.last[k] < T.gap) return { ok: false, why: '間を置く' };
  const my = own ? own.filter(alive) : mine(A, team);
  if (f === 'teppo_shuchu') {
    const gs = my.filter((g) => { const gu = guns(g); return gu.length >= 3 && gu.filter(loaded).length >= 3 && nearestFoe(A, team, center(g), 70); });
    return gs.length >= (own ? 1 : 2) ? { ok: true, ctx: { gs } } : { ok: false, why: '込めた鉄砲隊が足りない' };
  }
  if (f === 'tsurinobuse') {
    // 囮：退け（retreat）の下知で退く隊。試合の備は退く時に組の order が move になるので、備の下知（b.cmd）も見る
    const sonaeOf = (g) => (rt.flags?.match?.sonae || []).find((q) => q.b && q.b.real === g);
    const retreating = (g) => /^(retreat|flee)$/.test(g.order || '') || (g.order === 'move' && sonaeOf(g)?.b?.cmd?.id === 'retreat');
    // 伏兵はその武将の隊に限らない（家久の釣り野伏は他の備を伏せる）。同じ陣営の全部の隊から探す
    const all = mine(A, team);
    for (const bait of my) {
      if (!retreating(bait) || bait.morale < 50) continue;
      const c = center(bait), chaser = foes(A, team).find((f) => (/^(attack|charge|assault|move)$/.test(f.order || '') || engaged(f, A)) && dist(center(f), c) < 35);
      if (!chaser) continue;
      const fc = center(chaser), hx = fc.x - c.x, hz = fc.z - c.z, hl = Math.hypot(hx, hz) || 1;
      // 伏兵：追う敵の進む筋の横（筋から八m 以上離れ・六十m 内）で、まだ戦っていない隊
      const amb = all.find((g) => g !== bait && g.morale >= 50 && !engaged(g, A) && (() => { const p = center(g), side = Math.abs(((p.x - fc.x) * hz - (p.z - fc.z) * hx) / hl); return side > 8 && dist(p, fc) < 60; })());
      if (amb) return { ok: true, ctx: { bait, chaser, amb } };
    }
    return { ok: false, why: '退く隊・追う敵・伏兵がそろわない' };
  }
  if (f === 'sanada_sonae') {
    // 柵・塀・土塁は army.structs（線 seg か点）と army.solids（四角 x0..x1・z0..z1。柵の杭・竹束も）にある
    const near = (c) => (A.structs || []).some((o) => o.alive && !o.opened && (o.seg ? segDist(c.x, c.z, o.seg) < 12 : o.x != null && Math.hypot(o.x - c.x, o.z - c.z) < 12)) ||
      (A.solids || []).some((o) => o.x0 != null && c.x > o.x0 - 12 && c.x < o.x1 + 12 && c.z > o.z0 - 12 && c.z < o.z1 + 12 && /柵|塀|土塁|竹束|垣|堀|門/.test(o.name || o.struct?.name || ''));
    // 柵の無い野（オンラインの平原・川と橋）では「守りの地点」＝その場で守れ（hold）の下知で構え、九十m 内に敵が来た隊も数える
    const gs = my.filter((g) => near(center(g)) || (g.order === 'hold' && !engaged(g, A) && nearestFoe(A, team, center(g), 90)));
    return gs.length ? { ok: true, ctx: { gs } } : { ok: false, why: '柵・塀の近くで守る隊がいない' };
  }
  if (f === 'yobi_tonyu') {
    const weak = my.filter((g) => g.morale < 45 && engaged(g, A)).sort((a, b) => a.morale - b.morale)[0];
    const res = weak && my.filter((g) => g !== weak && g.morale >= 60 && !engaged(g, A)).sort((a, b) => dist(center(a), center(weak)) - dist(center(b), center(weak)))[0];
    return res ? { ok: true, ctx: { weak, res } } : { ok: false, why: '押された備か控えがいない' };
  }
  if (f === 'renzoku_kosei') {
    const front = my.find((g) => engaged(g, A));
    const next = front && my.filter((g) => g !== front && !engaged(g, A) && g.morale >= 50 && dist(center(g), center(front)) < 80).sort((a, b) => dist(center(a), center(front)) - dist(center(b), center(front)))[0];
    return next ? { ok: true, ctx: { front, next } } : { ok: false, why: '当たっている備と空いた備がそろわない' };
  }
  if (f === 'moko') {
    // 槍の隊：試合の備は兵種が混ざった一つの組（足軽 ashigaru・侍 samurai・鉄砲・弓・騎馬）。徒の斬り合いの兵（騎馬・鉄砲・弓でない）がいれば槍の隊とみる
    const foot = (u) => u.alive && !u.mounted && u.type !== 'gun' && u.type !== 'bow';
    const gs = my.filter((g) => g.units.some(foot) && (/^(attack|charge|assault|move)$/.test(g.order || '') && nearestFoe(A, team, center(g), 90) || engaged(g, A)));
    return gs.length ? { ok: true, ctx: { gs } } : { ok: false, why: '進む槍の隊がいない' };
  }
  if (f === 'akazonae') {
    // 騎馬の隊：騎馬が八騎以上いる組（兵種の混ざった備の組も、先に分けた騎馬の塊も）
    // K603（11/21 k592）：『空いた』は組の四分の一より少ない者しか斬り合っていない事（前は一騎でも当たっていれば空いていない扱いで、五十騎の隊では赤備突撃が一度も出なかった）
    const fightFrac = (g) => { let n = 0, f = 0; for (const u of g.units) { if (!u.alive) continue; n++; if (u.target && u.target.alive && !u.target.isStruct && u.target.team !== g.team && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 3.5) f++; } return n ? f / n : 1; };
    const cav = my.filter((g) => fightFrac(g) < 0.25 && g.units.filter((u) => u.alive && u.mounted).length >= 8);
    for (const cg of cav) {
      const tgt = foes(A, team).find((f) => engaged(f, A) && dist(center(f), center(cg)) < 60);
      if (tgt) return { ok: true, ctx: { cg, tgt } };
    }
    return { ok: false, why: '空いた騎馬か、当たっている敵がいない' };
  }
  if (id === 'gunshi') return { ok: true, ctx: {} };
  if (id === 'g_seisha' || id === 'g_ensha') {
    // その武将の備（army4k の S）：own の組を本物に持つ備
    const so = (rt.flags?.match?.sonae || []).find((q) => q.team === team && q.b && my.includes(q.b.real));
    if (!so || so._k603eng || so.state === '敗走') return { ok: false, why: '隊が斬り合っている' };
    const bp = so.b.pos, R = id === 'g_seisha' ? [15, 100] : [12, 80];
    if (id === 'g_seisha') {
      if (!(so.ammoLeft >= 2)) return { ok: false, why: '弾が足りない' };
      const near = (rt.flags.match.sonae || []).some((q) => q.team !== team && q.state !== '敗走' && q.b && (() => { const d = Math.hypot(q.b.pos.x - bp.x, q.b.pos.z - bp.z); return d >= R[0] && d < R[1]; })());
      return near ? { ok: true, ctx: { so } } : { ok: false, why: '間合いに敵がいない' };
    }
    const tgt = foes(A, team).find((f) => engaged(f, A) && dist(center(f), bp) < R[1]);
    return tgt ? { ok: true, ctx: { so, tgt } } : { ok: false, why: '味方と当たっている敵がいない' };
  }
  if (id === 'kenjin') {
    const gs = my.filter((g) => engaged(g, A));
    return gs.length ? { ok: true, ctx: { gs } } : { ok: false, why: '当たっている備がいない' };
  }
  if (f === 'sanbon') {
    const all = mine(A, team), gs = all.filter((g) => nearestFoe(A, team, center(g), 90) && all.some((h) => h !== g && dist(center(h), center(g)) < 60));
    return gs.length >= 2 && gs.some((g) => my.includes(g)) ? { ok: true, ctx: { gs } } : { ok: false, why: '並ぶ備がそろわない' };
  }
  if (f === 'sogakari') {
    const gs = mine(A, team).filter((g) => !engaged(g, A) && g.morale >= 40 && nearestFoe(A, team, center(g), 90));
    return gs.length >= 2 ? { ok: true, ctx: { gs } } : { ok: false, why: '空いた備が足りない' };
  }
  if (f === 'sakigake') {
    const g = my.find((q) => !engaged(q, A) && q.morale >= 60 && nearestFoe(A, team, center(q), 70));
    return g ? { ok: true, ctx: { g, foe: nearestFoe(A, team, center(g), 70) } } : { ok: false, why: '空いた備か近い敵がいない' };
  }
  if (f === 'tsuigeki') {
    for (const g of my) { if (engaged(g, A) || g.morale < 50) continue; const f = foes(A, team).find((e) => e.morale < 35 && dist(center(e), center(g)) < 80); if (f) return { ok: true, ctx: { g, f } }; }
    return { ok: false, why: '崩れかけた敵か空いた備がいない' };
  }
  return { ok: false, why: '戦術が無い' };
}

// 使う。効きは下知（order）・一斉射・続く効き（rt.tactics.active）で掛ける
// K633 ⑤：SS の戦法は S より長く強く効く（続く効きの長さ×1.4・士気の下限＋10・揺らす敵の士気も同じだけ深く）
export const SS_K = 1.4;
const ssOf = (rt, team, own) => { const so = (rt.flags?.match?.sonae || []).find((q) => (q.team ?? 0) === team && own?.length && (own.includes(q.b?.real) || own.includes(q.g))); return so && bushouByName(so.taisho || so.busho || so.name)?.rank === 'SSR' ? so : null; };
export function useTactic(rt, team, id, own) {
  const S0 = state(rt), n0 = S0.active.length, foeMor = rt.army ? new Map(foes(rt.army, team).map((g) => [g, g.morale])) : null;
  const ok = useTactic0(rt, team, id, own);
  const so = ok && ssOf(rt, team, own);
  if (so) {
    const A = rt.army;
    if (so._rapidUntil > A.time) so._rapidUntil = A.time + (so._rapidUntil - A.time) * SS_K;
    for (let i = n0; i < S0.active.length; i++) { const e = S0.active[i]; e.until = A.time + (e.until - A.time) * SS_K; if (e.floor) e.floor = Math.min(60, e.floor + 10); e.ss = 1; }
    if (foeMor) for (const [g, m0] of foeMor) if (g.morale < m0) g.morale = Math.max(0, m0 - (m0 - g.morale) * SS_K);
    if (id === 'gunshi' && S0.reveal?.[team]) S0.reveal[team] = A.time + (S0.reveal[team] - A.time) * SS_K;
    (S0.log[S0.log.length - 1] || {}).ss = 1;
    ssrKoyu(rt, team, own, so, S0, n0);
  }
  return ok;
}
// 11/24 SSR の固有の一手（bushou_online.js の SSR_KOYU）：戦法を使った時だけ、その人の一手を小さく重ねる
function ssrKoyu(rt, team, own, so, S0, n0) {
  const k = bushouByName(so.taisho || so.busho || so.name)?.senpo?.koyu?.k; if (!k) return;
  const A = rt.army, gs = (own || []).filter(alive), cs = gs.map(center);
  if (k.foe && cs.length) for (const f of foes(A, team)) { const fc = center(f); if (cs.some((c) => dist(c, fc) < 90)) f.morale = Math.max(0, f.morale - k.foe); }
  if (k.self) for (const g of gs) g.morale = Math.min(100, g.morale + k.self);
  if (k.hold) for (let i = n0; i < S0.active.length; i++) { const e = S0.active[i]; e.floor = Math.min(65, (e.floor || 25) + k.hold); }
  if (k.reload && gs.length) S0.active.push({ id: 'koyu', team, gs, until: A.time + (k.dur || 15), reload2: k.reload });
  (S0.log[S0.log.length - 1] || {}).koyu = 1;
}
function useTactic0(rt, team, id, own) {
  const r = tacticReady(rt, team, id, own);
  if (!r.ok) return false;
  const T = TACTICS[id], A = rt.army, S = state(rt), k = team + ':' + id, c = r.ctx;
  const f = T.form || id;
  // 二人の対戦：相手（team 1）の戦術は、命令の輪の札（command.js）とこちらの札（{ k:'tac' }）の両方で届く。三秒内の二つ目は捨てる
  if (team === 1 && S.net && S.last[k] != null && A.time - S.last[k] < 3) return false;
  S.used[k] = (S.used[k] || 0) + 1; S.last[k] = A.time;
  (S.log || (S.log = [])).push({ id, team, t: +A.time.toFixed(1) });   // 試合の後の振り返り・確かめの表に使う
  // 二人の対戦：自分の側（team 0）で使ったら相手の画面へ知らせる（相手の画面では team 1 の同じ武将に同じ戦術が掛かる）
  if (team === 0 && S.net?.send && !S.applyingRemote) { const m = (S.match || []).find((q) => q.team === 0 && q.id === id); try { S.net.send({ k: 'tac', who: m?.s?.taisho || null, id, t: +rt.t.toFixed(1) }); } catch (e) { /* 送れなくても自分の画面では効く */ } }
  const until = (sec) => A.time + sec;
  if (f === 'teppo_shuchu') {
    // 11/21 司令塔：その武将の隊（名目 1,000）の込めた者だけを同じ一瞬に放たせる。散らばった撃ちを一つの斉射に揃えるだけで、
    //   撃った者は皆込め直しに入るので次の斉射まで間が空く（合計の弾は増えない・構え holdFire も外さない・続けて撃たせない）
    const tgt = foes(A, team);
    for (const g of c.gs) A.scriptSalvo?.(g, tgt, 99, 80);
    say(rt, center(c.gs[0]), 'volley', 1.2);
  } else if (f === 'tsurinobuse') {
    // 退く隊が反転し、伏兵が追う敵の横を突く。追った敵は不意を突かれて士気が揺らぐ
    const { bait, chaser, amb } = c;
    for (const g of [bait, amb]) { g.order = 'attack'; g.target = chaser; g.dest = { ...center(chaser) }; }
    chaser.morale = Math.max(0, chaser.morale - 15);
    say(rt, center(amb), 'horagai', 1.1); say(rt, center(amb), 'eshout', 1.0);
    S.active.push({ id, team, gs: [bait, amb], until: until(25), floor: 45 });
  } else if (f === 'sanada_sonae') {
    // 柵・塀の近くの隊は崩れにくく（士気の下限）、鉄砲の込めが少し速い（十字の射撃の揃い）
    //   11/21 司令塔（cloud-47 の釣り合いの試しで勝ち35%と強め・ほかは17〜28%）：60秒・下限40・込め0.9 → 45秒・下限30・込め0.95
    for (const g of c.gs) g.holdFire = false;
    say(rt, center(c.gs[0]), 'horagai', 0.9);
    S.active.push({ id, team, gs: c.gs, until: until(45), floor: 30, reload: 0.95 });
  } else if (f === 'yobi_tonyu') {
    // 控えの隊をすぐ押された備の前の敵へ。押された備は控えが来るのを見て少し持ち直す
    const { weak, res } = c, foe = nearestFoe(A, team, center(weak));
    res.order = 'attack'; if (foe) { res.target = foe; res.dest = { ...center(foe) }; }
    weak.morale = Math.min(100, weak.morale + 10);
    say(rt, center(res), 'taiko', 1.0);
    S.active.push({ id, team, gs: [weak], until: until(20), floor: 25 });
  } else if (f === 'renzoku_kosei') {
    // 次の備を間を置かずに同じ敵へ。当たっている備は波が続くので士気の落ちが止まりやすい
    const { front, next } = c, foe = nearestFoe(A, team, center(front));
    next.order = 'attack'; if (foe) { next.target = foe; next.dest = { ...center(foe) }; }
    say(rt, center(next), 'taiko', 1.0);
    S.active.push({ id, team, gs: [front, next], until: until(30), floor: 30 });
  } else if (f === 'moko') {
    // 四十秒、進む槍の隊の士気が落ちにくい（下限45へ持ち直す。強くはしない）
    say(rt, center(c.gs[0]), 'eshout', 1.1);
    S.active.push({ id, team, gs: c.gs, until: until(40), floor: 45 });
  } else if (f === 'akazonae') {
    // 騎馬が当たっている敵の横へ。突き掛かられた敵は横を突かれて士気が揺らぐ（数の上乗せはしない）
    const { cg, tgt } = c, tc = center(tgt), cc = center(cg), ex = tc.x - cc.x, ez = tc.z - cc.z, el = Math.hypot(ex, ez) || 1;
    cg.order = 'charge'; cg.target = tgt; cg.dest = { x: tc.x + (-ez / el) * 6, z: tc.z + (ex / el) * 6 };
    tgt.morale = Math.max(0, tgt.morale - 12);
    say(rt, cc, 'horagai', 1.0); say(rt, cc, 'eshout', 1.0);
    S.active.push({ id, team, gs: [cg], until: until(20), floor: 40 });
  } else if (f === 'kenjin') {
    say(rt, center(c.gs[0]), 'taiko', 0.9);
    S.active.push({ id, team, gs: c.gs, until: until(40), floor: 35 });
  } else if (f === 'sanbon') {
    say(rt, center(c.gs[0]), 'horagai', 0.9);
    S.active.push({ id, team, gs: c.gs, until: until(40), floor: 30 });
  } else if (f === 'sogakari') {
    for (const g of c.gs) { const f = nearestFoe(A, team, center(g), 90); if (f) { g.order = 'attack'; g.target = f; g.dest = { ...center(f) }; } }
    say(rt, center(c.gs[0]), 'horagai', 1.2); say(rt, center(c.gs[0]), 'eshout', 1.1);
  } else if (f === 'sakigake') {
    const { g, foe } = c; g.order = 'charge'; g.target = foe; g.dest = { ...center(foe) };
    foe.morale = Math.max(0, foe.morale - 8);
    say(rt, center(g), 'eshout', 1.1);
    S.active.push({ id, team, gs: [g], until: until(20), floor: 40 });
  } else if (f === 'tsuigeki') {
    const { g, f } = c; g.order = 'attack'; g.target = f; g.dest = { ...center(f) };
    f.morale = Math.max(0, f.morale - 10);
    say(rt, center(g), 'taiko', 1.0);
  } else if (id === 'g_seisha') {
    c.so._rapidUntil = A.time + 15; c.so._volT = 0;   // 今すぐ一度・その後は間を半分に
    say(rt, center(own?.[0] || c.so.b.real || { units: [] }), 'volley', 1.1);
  } else if (id === 'g_ensha') {
    c.so._rapidUntil = A.time + 15; c.so._volT = 0;
    c.tgt.morale = Math.max(0, c.tgt.morale - 10);
    say(rt, center(c.tgt), 'taiko', 0.9);
  } else if (id === 'gunshi') {
    // 九十秒、敵の布陣と目標が読める（霧の決まりが tacticReveal(rt, team) を見る）
    S.reveal = S.reveal || {}; S.reveal[team] = A.time + 90;
  }
  return true;
}

// 常時の効き（得意兵種）。試合の始めに一度、その武将の組を渡す
export function passiveTactics(rt, team, ids, groups) {
  const S = state(rt);
  for (const id of ids) if (PASSIVES[id]) S.passive[team + ':' + id] = { id, team, gs: groups || mine(rt.army, team), ...PASSIVES[id] };
}

// 毎コマ：続く効き（士気の下限・込めの速さ・揃いの次の斉射）
export function tacticsTick(rt, dt) {
  const pt0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try { tacticsTickInner(rt, dt); } finally {
    // 重さの見張り：戦術の部品が一コマに使った時間の最大（rt.tactics.prof・確かめの道具が読む）
    const S = rt.tactics; if (S && pt0) { const ms = performance.now() - pt0; S.prof = S.prof || { max: 0, sum: 0, n: 0 }; S.prof.n++; S.prof.sum += ms; if (ms > S.prof.max) S.prof.max = ms; }
  }
}
function tacticsTickInner(rt, dt) {
  if (rt.tactics?.net) gunSyncTick(rt, dt);
  if (rt.flags?.match) matchTacticsTick(rt, dt);
  const S = rt.tactics, A = rt.army;
  if (!S || !A) return;
  for (let i = S.active.length - 1; i >= 0; i--) {
    const e = S.active[i];
    if (A.time > e.until) { S.active.splice(i, 1); continue; }
    for (const g of e.gs) {
      if (!alive(g)) continue;
      if (e.floor) g.morale = Math.max(g.morale, Math.min(e.floor, g.morale + 2 * dt * 10));   // 下限へ少しずつ持ち直す（いきなり戻さない）
      if (e.reload) for (const u of g.units) if (u.reload && !u._tkR) { u._tkR = 1; u.reload.dur *= e.reload; }
      for (const u of g.units) if (!u.reload && u._tkR) u._tkR = 0;
      if (e.reload2) for (const u of g.units) { if (u.reload && !u._tkK) { u._tkK = 1; u.reload.dur *= e.reload2; } else if (!u.reload && u._tkK) u._tkK = 0; }   // SSR の固有の一手（戦法の込めと重なっても別に効く）
    }
  }
  for (const k in S.passive) {
    const e = S.passive[k];
    for (const g of e.gs) {
      if (!alive(g)) continue;
      if (e.reload) for (const u of g.units) { if (u.type === 'gun' && u.reload && !u._tkP) { u._tkP = 1; u.reload.dur *= e.reload; } if (!u.reload && u._tkP) u._tkP = 0; }
      if (e.morale && g.units.some((u) => u.alive && u.type === 'spear')) g.morale = Math.max(g.morale, Math.min(g.morale + dt, e.morale + 20));
    }
  }
}

// 軍師の読み（霧の決まりが読む）：その陣営が今、敵の布陣を読めるか
export function tacticReveal(rt, team) {
  const r = rt.tactics?.reveal;
  return !!(r && r[team] != null && rt.army && rt.army.time < r[team]);
}

// ---- 試合へのつなぎ（online/match.js が毎コマ tacticsTick を呼ぶだけで動く） ----
//   rt.flags.match.sonae（army4k.js の備・一人一つ）から、武将の名で固有戦術と常時の効きを割り当てる。
//   相手（team 1）は使える時に AI が使う。自分（team 0）は「戦術可能　〇〇」の小さな札を押して使う（自分で決める）。
function sonaeGroups(rt, s) {
  if (s.groups) return s.groups;
  if (s.g) return [s.g];
  // army4k.js の備（sonae.js）：本物は s.b.real の一つの組。騎馬を先に分けた組（『〇〇の騎馬』）も同じ武将の隊に数える
  if (s.b) { const L = []; if (s.b.real && !s.b.real.routed && s.b.real.count) L.push(s.b.real); const nm = s.taisho; if (nm) for (const g of rt.army.groups) if (g !== s.b.real && g.name === nm + 'の騎馬' && !g.routed && g.count) L.push(g); return L; }
  return rt.army.groups.filter((g) => g.general === s.name || g.sonae === s || (g.name && s.name && g.name.includes(s.name)));
}
function matchInit(rt) {
  const S = state(rt), M = rt.flags?.match;
  if (S.match || !M || !M.sonae || !rt.army) return;
  S.match = [];
  // 本人の率いる備：備（sonae.js）は mine を持たないので、自分の側（team 0）の並びの o.me 番（既定 0＝総大将）とみる
  const me = M.o?.me ?? 0, t0 = M.sonae.filter((q) => (q.team ?? 0) === 0);
  for (const q of M.sonae) if (q.mine == null) q.mine = (q.team ?? 0) === 0 && t0.indexOf(q) === me;
  for (const s of M.sonae) {
    const name = s.taisho || s.busho || s.name;
    const b = bushouByName(name), fb = genericTactic(name, b);
    const id = s.tactic || BUSHO_TACTIC[name] || (TACTICS[b?.senpo?.tac] ? b.senpo.tac : fb), pid = BUSHO_PASSIVE[name];
    const own = () => sonaeGroups(rt, s);
    // 戦法の名（K601 14）：固有戦術の表に無い武将は senpo の名で出す（無ければ戦術の名）
    const nm = !BUSHO_TACTIC[name] && b?.senpo?.name ? { ja: b.senpo.name, desc: b.senpo.desc } : null;
    if (id && TACTICS[id]) S.match.push({ s, team: s.team ?? 0, id, own, aiT: 3 + Math.random() * 3, nm, k: b?.rank === 'SSR' ? SS_K : 1 });
    if (pid) passiveTactics(rt, s.team ?? 0, [pid], own());
  }
}
// その武将の戦法の id（固有戦術の表 → 無ければ主兵種から）。AI（general_ai.js aiTactic）も同じ物を使う
export function tacticIdOf(name) { const b = bushouByName(name); return BUSHO_TACTIC[name] || (TACTICS[b?.senpo?.tac] ? b.senpo.tac : genericTactic(name, b)); }
// 固有戦術の表に無い武将の戦法：主兵種と言葉から（鉄砲＝一斉射・騎馬＝赤備突撃の形の横への突き掛け・弓＝援射・槍＝猛攻、守りの将＝堅陣）
function genericTactic(name, b) {
  if (!b) return null;
  const hs = heishuOf(name), kw = b.keywords || [];
  if (hs === '鉄砲') return 'g_seisha';
  if (hs === '騎馬') return 'akazonae';
  if (hs === '弓') return 'g_ensha';
  if (b.fav === 'shubi' || kw.includes('守備')) return 'kenjin';
  return 'moko';
}
function aiUse(rt, dt, onlyMine = false) {
  const S = rt.tactics, o = rt.flags?.match?.o || {};
  // 人のいない試合（AI どうしの試し・o.autoTactics か o.bot）は、本人の備の戦術も AI が使う（南北の釣り合い：北だけ一人少なかった・cloud-47）
  const autoMine = !!(o.autoTactics || o.bot);
  for (const m of S.match || []) {
    // 本人が率いる備（s.mine）だけは本人が札で決める。ほかの備（自分の側の3隊・相手・切断して AI が引き継いだ備）は AI が使う
    const isMine = m.s.mine && !m.s.byAI;
    if (isMine && !autoMine) continue;
    // 人のいない試合では、南の総大将（team 1 の並びの頭）も北の総大将と同じくこちらで使う（北だけ早く使っていた）
    const head1 = autoMine && m.team === 1 && (rt.flags.match.sonae || []).find((q) => q.team === 1) === m.s;
    if (onlyMine && !isMine && !head1) continue;
    if ((m.aiT -= dt) > 0) continue;
    m.aiT = 2;
    const own = m.own();
    if (own.length && tacticReady(rt, m.team, m.id, own).ok) useTactic(rt, m.team, m.id, own);
  }
}
// 「戦術可能」の札：字は少なく（kaito 10/23）。押せる高さ 44px・字 15px。使える物があれば一枚だけ出し、押せば使う
let card = null, cardFor = null;
function cardTick(rt) {
  if (typeof document === 'undefined') return;
  const S = rt.tactics;
  let pick = null;
  for (const m of S.match || []) if (m.team === 0 && (m.s.mine || m.s.mine === undefined)) { const own = m.own(); if (own.length && tacticReady(rt, 0, m.id, own).ok) { pick = m; break; } }
  if (!card) {
    card = document.createElement('button');
    card.className = 'tactic-card';
    card.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:40;min-height:44px;padding:8px 16px;font:600 15px/1.2 sans-serif;color:#fff8e6;background:rgba(40,28,14,.86);border:1px solid #c9a24a;border-radius:6px;display:none';
    card.addEventListener('click', (e) => { e.stopPropagation(); const m = cardFor; if (m && m.rt) { useTactic(m.rt, 0, m.id, m.own()); card.style.display = 'none'; } });
    document.body.appendChild(card);
  }
  if (!pick || rt.over) { card.style.display = 'none'; cardFor = null; return; }
  const T = TACTICS[pick.id];
  pick.rt = rt; cardFor = pick;
  const txt = isEn() ? `Tactic ready: ${T.en}` : `戦術可能　${pick.nm?.ja || T.name}`;
  if (card.textContent !== txt) card.textContent = txt;
  card.style.display = '';
}
// 命令の輪（cloud-36 command_ui.js）の4武将の札から読む口：その武将の固有戦術と、今使えるか。押せば使う
//   command_ui が rt.flags.match.tacticByCmd = true を立てれば、こちらの一枚の札は出さない（画面の物を増やさない）
export function sonaeTactic(rt, s) {
  const S = state(rt); matchInit(rt);
  const m = (S.match || []).find((q) => q.s === s || q.s.taisho === (s && (s.taisho || s)) || q.s.name === (s && (s.name || s)));
  if (!m) return null;
  const T = TACTICS[m.id], own = m.own(), r = own.length ? tacticReady(rt, m.team, m.id, own) : { ok: false, why: '隊がいない' };
  const k = m.team + ':' + m.id;
  return { id: m.id, name: isEn() ? T.en : (m.nm?.ja || T.name), desc: m.nm?.desc || T.desc, ready: r.ok, why: r.why, left: T.uses - (S.used[k] || 0) };
}
export function useSonaeTactic(rt, s) {
  const S = state(rt); matchInit(rt);
  const m = (S.match || []).find((q) => q.s === s || q.s.taisho === (s && (s.taisho || s)) || q.s.name === (s && (s.name || s)));
  return !!(m && useTactic(rt, m.team, m.id, m.own()));
}

export function matchTacticsTick(rt, dt) {
  matchInit(rt);
  const S = rt.tactics;
  if (!S || !S.match) return;
  aiUse(rt, dt, !!rt._gai);   // 47 の性格の AI（general_ai.js matchAiTick）が動いていれば、本人の備（人のいない時）だけをこちらで使う（二重に使わない）
  // 命令の輪（cloud-36 command.js・command_ui.js）が武将の札の金の縁と九つ目の戦術の絵で受け持つ（F.match.cmd がある時）。こちらの仮の札は出さない
  if (rt.flags.match.tacticByCmd || rt.flags.match.cmd) { if (card) card.style.display = 'none'; return; }
  if ((S.cardT = (S.cardT ?? 0) - dt) <= 0) { S.cardT = 0.5; cardTick(rt); }
}

// 釣り合いの数（cloud-47 の k587_ai_sim.mjs が読む・数だけの戦場での効きの重み）。ゲームの効きを変えたらここも合わせる
//   11/21：真田の備えは 45秒・士気の下限30・込め5%速い → 守りの重み 1.04（sim で残りの差 27.0%。ほかは 17〜28%）
export const TACTIC_NUM = {
  yobi_tonyu: { reserveAt: 75 },
  renzoku_kosei: { pow: 1.06 },
  sanada_sonae: { holdPow: 1.04, moraleFloor: 30 },
  teppo_shuchu: { pow: 1.05 },
  baba_yari: { moraleFloor: 8 },
  kenjin: { holdPow: 1.03, moraleFloor: 35 },
  sanbon: { moraleFloor: 30 },
  sogakari: { pow: 1.05 },
  sakigake: { pow: 1.04 },
  tsuigeki: { pow: 1.04 },
};

// ---- 二人の対戦（K580）：相手の画面と戦術を合わせる ----
//   match.js が setup で tacticsLink(rt, net) を一度呼ぶ（net＝onlineMatch の { send, recv }）。
//   自分が使った戦術は { k:'tac', who, id, t } で送り、受けた側は自分の画面の相手（team 1）の同じ武将の備へ同じ戦術を掛ける。
//   相手の画面とは兵の位置が少しずれる（cloud-26 の合わせで数 m〜数十 m）ので、受けた時に条件が揃わなくても、
//   その武将の回数は減らし、続く効き（士気の下限など）だけは掛ける（同じ時に同じ効きを出す）。
export function tacticsLink(rt, net) {
  const S = state(rt);
  if (!net || S.net) return;
  S.net = net;
  gunSyncLink(rt, net);   // 鉄砲の撃ちも両方の画面で合わせる（gun_sync.js）
  if (net.recv) net.recv((m) => { if (m && m.k === 'tac') applyRemoteTactic(rt, m); });
}
export function applyRemoteTactic(rt, m) {
  const S = state(rt); matchInit(rt);
  const q = (S.match || []).find((x) => x.team === 1 && x.id === m.id && (!m.who || x.s.taisho === m.who));
  if (!q || !TACTICS[m.id]) return false;
  // 命令の輪の札（command.js の tactic の命令）でも同じ戦術が届く。三秒内に同じ戦術が掛かっていれば二度掛けない
  if (S.last['1:' + m.id] != null && rt.army.time - S.last['1:' + m.id] < 3) return false;
  const own = q.own();
  S.applyingRemote = true;
  try {
    // 11/21 司令塔（B の画面で写しの位置が数十 m ずれた）：前は届いた戦術を写しにも本当の戦術として掛け（useTactic）、写しの備へ
    //   「攻め・突撃」の下知を入れていた。写しの動きは 26 の毎秒の位置の合わせ（37 の sync_catchup）が受け持つので、下知を入れると
    //   合わせと取り合って位置がずれた。届いた戦術は、下知を入れずに「回数・続く効き（士気の下限）・相手（こちらの本物）の士気の揺れ」だけ掛ける
    const T = TACTICS[m.id], k = '1:' + m.id, A = rt.army;
    // 相手の画面で、その戦術に士気を揺らされたこちらの本物の備（写しの近くの一番近い組）にも同じだけ揺れを掛ける（両方の画面で士気を揃える）
    const fm = T.form || m.id;
    const HIT = { tsurinobuse: 15, akazonae: 12, sakigake: 8, tsuigeki: 10 }[fm];
    if (HIT && own.length) { const c = center(own[0]), f = A.groups.filter((g) => g.team === 0 && g.count && !g.routed).sort((a, b) => dist(center(a), c) - dist(center(b), c))[0]; if (f && dist(center(f), c) < 80) f.morale = Math.max(0, f.morale - HIT); }
    if ((S.used[k] || 0) >= T.uses) return false;
    S.used[k] = (S.used[k] || 0) + 1; S.last[k] = A.time;
    (S.log || (S.log = [])).push({ id: m.id, team: 1, t: +A.time.toFixed(1), remote: 'soft' });
    const FLOOR = { sanada_sonae: [45, 30, 0.95], moko: [40, 45], yobi_tonyu: [20, 25], renzoku_kosei: [30, 30], akazonae: [20, 40], tsurinobuse: [25, 45], kenjin: [40, 35], sanbon: [40, 30], sakigake: [20, 40] }[fm];
    if (fm === 'gunshi') { S.reveal = S.reveal || {}; S.reveal[1] = A.time + 90; }
    else if (FLOOR && own.length) S.active.push({ id: m.id, team: 1, gs: own, until: A.time + FLOOR[0], floor: FLOOR[1], reload: FLOOR[2] });
    // 鉄砲集中の撃ちは gun_sync（{ k:'gun' }）で届く数だけ写しが放つ（ここで撃たせると二重になる）
    S.remote = (S.remote || 0) + 1;
    return true;
  } finally { S.applyingRemote = false; }
}
