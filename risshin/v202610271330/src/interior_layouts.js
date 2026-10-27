import { S as SETTINGS } from './settings.js';

// 設楽原の入口板戸の引き込み位置。建具と置き畳で同じ寸法を使う。
export function shitaragaharaEntryInset(kind) {
  return kind === 'hondo' ? .64 : .36;
}

// 設楽原の低い民家・小堂は、梁や格天井まで戸を伸ばさない。枠と動く戸で共有する。
export function interiorPartitionHeight(layout, h) {
  if (layout.profile === 'shitaragahara') {
    if (layout.kind === 'minka') return Math.min(1.8, h - .3);
    if (layout.kind === 'hondo') return Math.min(1.95, h - .3);
  }
  return h > 3 ? 2.3 : h;
}

// 小堂の内陣境は鴨居・長押・連子欄間の木がある所だけを塞ぐ。
// 固定建具の上と開く格子戸の上で共用し、設営時だけ当たりを作る。
export function interiorPartitionHeaders(layout, h, ax, bx, fixed = false) {
  const ph = interiorPartitionHeight(layout, h);
  if (SETTINGS.quality === 'high' && layout.profile === 'shitaragahara'
      && layout.kind === 'minka' && fixed) {
    return [{ ax: ax + .09, bx: bx - .09, y0: ph, y1: ph + .1, r: .09 },
      { ax, bx, y0: ph + .1, y1: h, r: .08 }];
  }
  if (SETTINGS.quality !== 'high' || layout.profile !== 'shitaragahara'
      || layout.kind !== 'hondo' || h - ph - .1 <= .18 || bx - ax <= .68)
    return [{ ax, bx, y0: ph, y1: h, r: .08 }];
  const pieces = [], low = ph + .1;
  const add = (a, b, y0, y1, r) => pieces.push({ ax: a, bx: b, y0, y1, r });
  add(ax, bx, ph, low, .06); // 鴨居
  const railY = Math.min(ph + .42, h - .22);
  add(ax, bx, railY - .06, railY + .06, .11); // 長押
  if (fixed) {
    // 固定格子の欄間は柱間ごとに納める。中央の丸柱を連子や小壁で貫かない。
    // 鴨居と長押は通し、欄間だけ下の建具と同じ柱割りにする。
    for (const span of interiorPartitionSpans(ax, bx)) {
      if (span.bx - span.ax <= .68)
        add(span.ax, span.bx, low, h, .03);
      else pieces.push(...interiorPartitionHeaders(layout, h, span.ax, span.bx).slice(2));
    }
    return pieces;
  }
  const left = ax + .24, right = bx - .24;
  // 欄間の上框は格天井の回縁の下へ納め、当たりも見える木部へ揃える。
  const top = h - .08, frameBottom = top - .04;
  add(ax, left, low, top, .03);
  add(right, bx, low, top, .03);
  add(left, right, frameBottom, top, .03);
  add(ax, bx, top, h, .04); // 内陣境を通る格天井の回縁
  const bays = Math.max(2, Math.round((right - left) / .16));
  // 欄間の連子は長押の上下へ分け、絵と同じ木部だけを射線の当たりにする。
  for (const [a, b] of [[low, Math.min(frameBottom, railY - .06)],
    [Math.max(low, railY + .06), frameBottom]]) {
    if (b <= a) continue;
    for (let i = 0; i <= bays; i++) {
      // 端の連子も半幅を内側へ納め、小壁へ木を食い込ませない。
      const x = left + .0125 + (right - left - .025) * i / bays;
      add(x - .0125, x + .0125, a, b, .0175);
    }
  }
  return pieces;
}

// 固定建具の柱の内面。設営時に絵と当たりで共有する。
export function interiorPartitionSpans(ax, bx) {
  const left = Math.min(ax, bx), len = Math.abs(bx - ax);
  const bays = Math.max(1, Math.round(len / 1.8)), spans = [];
  for (let i = 0; i < bays; i++) {
    const a = left + len * i / bays + (i ? .06 : .12);
    const b = left + len * (i + 1) / bays - (i + 1 < bays ? .06 : .12);
    if (b > a) spans.push({ ax: a, bx: b });
  }
  return spans;
}

// 設楽原の民家の固定襖・障子も二本の溝へ納め、召し合わせを三センチ重ねる。
// 柱の内面と戸口は広げず、設営時に見た目と当たりで同じ割りを使う。
export function shitaragaharaHomePanels(ax, bx) {
  const panels = [];
  for (const span of interiorPartitionSpans(ax, bx)) {
    const count = Math.max(1, Math.ceil((span.bx - span.ax) / .9));
    const pitch = (span.bx - span.ax) / count;
    for (let i = 0; i < count; i++) {
      panels.push({ ax: span.ax + i * pitch - (i ? .015 : 0),
        bx: span.ax + (i + 1) * pitch + (i + 1 < count ? .015 : 0),
        offset: i % 2 ? .04 : -.04, right: i % 2 === 1 });
    }
  }
  return panels;
}
// 内陣境の角柱（奥行き十二センチ）と丸柱（半径十四センチ）を重ねない柱芯。
export const HIEI_NAIJIN_POST_SETBACK = .20;

// 館の固定襖・障子は、戸口側の方立（幅十二センチ）の内面で止める。
// 描く割付と木枠の当たりで共用する。開口と動く戸の引きしろは変えない。
export function igaFixedPanelRange(layout, v) {
  const len = Math.hypot(v.bx - v.ax, v.bz - v.az);
  const portal = layout.profile === 'iga' && layout.kind === 'yashiki' && v.paper
    && layout.portals.find(p => Math.abs(p.z - v.az) < .01 && Math.abs(p.z - v.bz) < .01);
  if (!portal) return { start: 0, end: len };
  const trim = Math.min(.12, len / 4);
  return Math.abs(v.ax - portal.x) < Math.abs(v.bx - portal.x)
    ? { start: trim, end: len } : { start: 0, end: len - trim };
}

// 玄関と内戸の溝の間に立てる奥行き。側窓も同じ部屋境界から割り付ける。
export function nodaEntryDepth(kind, w, d, use) {
  // 寺務の長屋にも内戸がある。間仕切りのない物置三棟だけを浅い土間にする。
  const service = ['templeGrain', 'templeUtensils', 'templeFuel'].includes(use);
  const closedRoom = kind === 'goten' && w >= 5.5 && d >= 4.5
    || ['bansho', 'nagaya'].includes(kind) && !service && d >= 3.5;
  return closedRoom ? 1.6 : Math.max(.95, Math.min(1.1, d * .28));
}

// 外壁の内寸から間取りを作る。局所の＋奥行きが戸口。設営時だけ呼ぶ。
export function interiorLayout(kind, w, d, { oku = .4, side = 1, profile = null, entryX = 0, entryDepth = null, use = null, shrineOffering = false, doorClearance = false, boardFinish = .012, entryW = 0, raisedTatami = false, slidingClearance = 0 } = {}) {
  const hw = w / 2, hd = d / 2;
  // 宿は泊まる座敷、問屋は荷を扱う土間、使者の間は応対の座敷を広く取る。
  const hall = kind === 'toiya' ? Math.min(3, w * .34)
    : kind === 'inn' ? Math.min(1.5, w * .18)
    : kind === 'shisha' ? Math.min(1.2, w * .18) : Math.min(1.5, w * .24);
  const rooms = [], walls = [], props = [], portals = [];
  const room = (name, x0, x1, z0, z1, floor = 'tatami') => rooms.push({ name, x0, x1, z0, z1, floor });
  const cross = (z, x0, x1, door, paper = true, openingW = 0, halfGap = null) => {
    // 小祠は戸を引いた端と妻壁の柱の間にも余地を残す。
    const sliding = profile === 'inabayama' && slidingClearance > 0;
    const hieiSliding = profile === 'hieizan' && ['chudo', 'hondo', 'sobo'].includes(kind);
    // 左右へ開いた戸は開口の倍の幅を使う。小さな番所でも戸尻と長い敷居を
    // 妻壁・隅柱へ埋めず、動く戸の当たりまで含めた余白を残す。
    // 高画質の稲葉山は表口から続く障子口・内陣口も同じ幅にする。
    // 引き先と柱際の余白で上限を取り、狭い建物では戸尻を壁へ出さない。
    const compact = w <= 4.2 && ['honnoji_kura', 'honnoji_umagura', 'honnoji_naya', 'honnoji_kyozo', 'honnoji_sobo'].includes(profile);
    const pocket = profile?.startsWith('honnoji_') ? .08 : 0;
    let gap = Math.min(halfGap ?? (!profile?.startsWith('honnoji_') && !sliding && openingW > 0 ? openingW : sliding && openingW > 0 ? openingW / 2 : profile === 'council' ? 2.1 : profile === 'inabayama' && kind === 'shrine' ? .75 : 1.05),
      compact ? (x1 - x0 - .38) / 3 : (x1 - x0 - (sliding ? slidingClearance * 2 : hieiSliding ? .2 : pocket * 2)) * .25);
    const margin = compact ? gap * 1.5 + .19 : pocket ? gap * 2 + pocket : sliding ? gap * 2 + slidingClearance : hieiSliding ? gap * 2 + .05 : gap;
    door = Math.max(x0 + margin, Math.min(x1 - margin, door));
    if (profile === 'anegawa') {
      const reserve = .09;
      gap = Math.min(gap, kind === 'hondo' ? .65 : 1.05, (x1 - x0 - reserve * 2) / 4);
      door = Math.max(x0 + gap * 2 + reserve, Math.min(x1 - gap * 2 - reserve, door));
    }
    if (SETTINGS.quality === 'high' && profile === 'nodafukushima' && ['goten', 'nagaya', 'bansho', 'kura'].includes(kind)) {
      // 全開の戸は開口幅の二倍まで広がる。小さな兵糧蔵でも側壁の柱へ
      // 板戸と敷居を突き込まず、柱・長押の手前に引き代を残す。
      gap = Math.min(gap, (Math.min(door + hw, hw - door) - .35) / 2);
    }
    portals.push({ x: door, z, axis: 'z' });
    if (door - gap > x0) walls.push({ ax: x0, az: z, bx: door - gap, bz: z, paper });
    if (door + gap < x1) walls.push({ ax: door + gap, az: z, bx: x1, bz: z, paper });
  };
  const prop = (part, x, z) => props.push({ part, x, z });
  if (profile === 'miki' && ['goten', 'bansho', 'kura', 'nagaya'].includes(kind)) {
    // 個別の室内図は不明。主殿・番所・蔵・控え小屋を用途別に推定する。
    const entry = hd - Math.min(1, d * .22);
    if (kind === 'goten') {
      const cut = -hd + d * .4;
      room('奥の座敷', -hw, hw, -hd, cut);
      rooms[0].raised = false;
      room('下知を受ける広間', -hw, hw, cut, entry);
      cross(cut, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'fusuma';
      room('板敷きの入口', -hw, hw, entry, hd, 'boards');
      const first = walls.length;
      cross(entry, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'shoji';
      for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
      props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .4 });
      props.push({ part: 'chest', x: hw - .65, z: -hd + .65, w: .8, d: .6, h: .6 });
    } else {
      room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の休む板間', -hw, hw, -hd, entry, 'boards');
      room('入口の土間', -hw, hw, entry, hd, 'earth');
      cross(entry, -hw + .1, hw - .1, entryX, false);
      if (kind === 'kura') for (const x of [-hw + .65, hw - .65]) props.push({ part: 'storage', x, z: -hd + .65, w: .8, d: .7, h: .8 });
      else if (kind === 'bansho') {
        props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .4 });
        props.push({ part: 'ammo', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: .55 });
      } else for (const x of [-hw + .8, hw - .8]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
    }
  } else if (profile === 'miki' && kind === 'hondo') {
    // 小堂の室内図は不明。内陣を深く取り、須弥壇の脇から入る推定の間取り。
    const cut = -hd + d * .55;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, hw * .65);
    prop('altar', 0, -hd + .85);
  } else if (profile === 'kizugawa' && kind === 'shisha') {
    // 船の屋形の個別図は不明。上段・床の間・炉は設けず、控えと下知の座敷を推定する。
    const cut = -hd + d * .36, entry = hd - 1.6;
    room('船将の控え', -hw, hw, -hd, cut);
    room('下知の座敷', -hw, hw, cut, entry);
    room('船の入口の板間', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'fusuma';
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .4 });
    props.push({ part: 'chest', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: .55 });
  } else if (profile === 'shitaragahara' && kind === 'minka') {
    // 集落の民家の推定復元。屋敷の式台・上段・床の間や軍の寝具は持ち込まない。
    const entry = hd - (entryDepth ?? Math.min(1.3, d * .27)), back = -hd + d * .37;
    room('奥の小座敷', -hw, hw, -hd, back);
    room('暮らしの板間', -hw, hw, back, entry, 'boards');
    room('入口の土間', -hw, hw, entry, hd, 'earth');
    // 高画質の民家は土間を板間より低くする。入口側の収納も土の床に据える。
    const earthY = entryDepth != null ? -.12 : 0;
    rooms[rooms.length - 1].y = earthY;
    cross(back, -hw + .1, hw - .1, 0);
    portals[portals.length - 1].kind = 'fusuma';
    for (const v of walls) v.kind = 'fusuma';
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    // 高画質の襖・障子は間仕切りより二十センチ土間側を滑る。
    // 炉もその二本の敷居の中間へ寄せ、浅い民家で炉縁と襖の引き込み端を重ねない。
    // 炉の絵・床の切り欠き・当たりは、この位置を共用する。裏向きは末尾で一緒に反転する。
    const hearthZ = (back + entry) / 2 + (entryDepth != null ? .2 : 0);
    props.push({ part: 'hearth', x: -hw + 1, z: hearthZ, w: .85, d: .7, h: .3 });
    props.push({ part: 'storage', x: hw - .7, z: hd - .65, w: .8, d: .6, h: .7, y: earthY });
    // 高画質の土間に炊事用の竈を補う推定復元。中央の入口と障子の引き込み先は空ける。
    if (entryDepth != null) {
      // 炊事の水甕を竈と壁の間へ据える推定のしつらえ。
      // 二つの外寸を離し、板戸・障子の溝と中央の立ち所へは張り出さない。
      // 側柱の内面（二十四センチ）から四センチ離す。
      // 甕の胴だけでなく、竈との六・五センチの隙間も保って絵と当たりを一緒に寄せる。
      const jarW = .44, stoveW = .85;
      const jarX = -hw + .24 + .04 + jarW / 2;
      const stoveX = jarX + jarW / 2 + .065 + stoveW / 2;
      props.push({ part: 'stove', x: stoveX, z: hd - .65,
        w: .85, d: .7, h: .9, y: earthY, rot: Math.PI });
      props.push({ part: 'waterJar', x: jarX, z: hd - .65,
        w: jarW, d: jarW, h: .62, y: earthY });
    }
  } else if (profile === 'shitaragahara' && kind === 'hondo') {
    // 村外れの小堂の推定。須弥壇の前に立てる内陣を取り、中央の格子戸から拝む。
    // 須弥壇だけで埋めず、前卓と、その前に立って供える場所を内陣に確保する。
    const cut = -hd + d * .58;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0);
    portals[portals.length - 1].kind = 'koshi';
    prop('altar', 0, -hd + .8);
    props.push({ part: 'offering', x: 0, z: -hd + 1.6, w: 1.2, d: .45, h: .65 });
    // 読経のしつらえは推定。須弥壇の脇に経机を置き、中央の参道と格子戸の引き込み先を空ける。
    if (SETTINGS.quality === 'high' && w >= 7 && d >= 5.5) {
      props.push({ part: 'sutraDesk', x: -hw + 1.1, z: -hd + 1.5, w: 1, d: .42, h: .36 });
      // 経巻を湿気から守る蓋付きの経箱を反対側へ据える推定のしつらえ。
      // 須弥壇の脇と背面の窓下へ納め、中央の参道・僧座・格子戸の溝を空ける。
      props.push({ part: 'sutraChest', x: hw - 1.1, z: -hd + 1,
        w: .95, d: .55, h: .52 });
    }
  } else if (profile === 'moribe' && kind === 'hondo') {
    // 小堂の室内図は不明。須弥壇を内陣へ収め、壇の前と格子戸の前後を空けた推定復元。
    // 戸板は入口側へ約二十センチ出る。閉じた二組の戸の間にも立ち所を残す。
    const cut = -hd + d * .55, entry = hd - 1.2;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, entry, 'boards');
    room('堂の入口', -hw, hw, entry, hd, 'boards');
    // 間仕切りの端は側壁の通し柱の芯へそろえ、別の柱を六センチずらして重ねない。
    cross(cut, -hw + .16, hw - .16, entryX);
    // 外陣の手前を板戸で閉じる。内陣の格子戸とは別に開け閉めできる。
    cross(entry, -hw + .16, hw - .16, entryX, false);
    portals[portals.length - 1].kind = 'itado';
    // 須弥壇と手前の前卓を合わせた寸法。格子戸の前の立ち所を残す。
    // 壇の後端は中心から六十五センチ奥。背面の地覆（二十六センチ）へ
    // 食い込ませず、四センチ離す。描画・体と手の当たりはこの位置を共用する。
    props.push({ part: 'altar', x: 0, z: -hd + .95, w: 2.1, d: 1.3, h: 1.5 });
  } else if (profile === 'moribe' && kind === 'yashiki') {
    // 狭い在所の屋敷に大きな床の間を置かず、畳の座敷・取次と板敷きの入口で復元。
    // 障子の二本の溝と外壁の柱を除いても、板間に人が通れる幅を残す。
    const entry = hd - Math.min(1.3, d * .25);
    // 取次側へ張り出す敷居（二十七センチ）を除いて、二室の畳の奥行きをそろえる。
    // 奥の地覆（二十六センチ）も除き、畳寄せの内側で二室の奥行きをそろえる。
    const cut = (-hd + .26 + entry - .27) / 2;
    room('奥の座敷', -hw, hw, -hd, cut);
    room('取次の座敷', -hw, hw, cut, entry);
    room('板敷きの入口', -hw, hw, entry, hd, 'boards');
    // 堂と同じく側壁の通し柱を共用し、固定の建具も柱の内面へ納める。
    cross(cut, -hw + .16, hw - .16, entryX);
    portals[portals.length - 1].kind = 'fusuma';
    for (const v of walls) v.kind = 'fusuma';
    const first = walls.length;
    cross(entry, -hw + .16, hw - .16, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    // 畳の上端へ脚と底を載せる。見た目だけでなく調度の当たりにも同じ高さを渡す。
    // 地覆二十六センチと畳寄せ十センチを避け、畳の端から四センチ離す。
    // 座卓の天板と木櫃の底を畳寄せへまたがせず、絵と当たりを同じ位置へ納める。
    const furnishingInset = .26 + .1 + .04;
    props.push({ part: 'desk', x: -hw + furnishingInset + .6, z: -hd + furnishingInset + .35,
      w: 1.2, d: .7, h: .46, y: .066 });
    props.push({ part: 'storage', x: hw - furnishingInset - .35, z: -hd + furnishingInset + .3,
      w: .7, d: .6, h: .6, y: .066 });
  } else if (profile === 'iga' && ['nagaya', 'bansho', 'yashiki', 'minka'].includes(kind)) {
    // 個別の室内図は不明。陣の宿と番所は板間、城館は畳の取次と奥座敷で復元する。
    // 民家は炊事の土間を深く取る。従来の九十センチほどの土間では、
    // 開け切った板戸が壁際の竈へ食い込む。二本の溝と戸厚の分も離し、
    // 炉のある板間を残したまま、竈の前を土間として使えるようにする。
    const entry = hd - (kind === 'minka' ? Math.min(1.35, d * .36) : Math.min(1.1, d * .24));
    if (kind === 'yashiki') {
      // 文机の座の背後に、襖の鴨居まで通る柱の見込みと人の幅を残す。
      // 従来はむしろの後端から敷居の縁まで約八センチしかなく、座が間仕切りへ詰まっていた。
      const cut = -hd + d * .42 + .2;
      room('奥の座敷', -hw, hw, -hd, cut);
      room('取次の座敷', -hw, hw, cut, entry);
      room('板敷きの入口', -hw, hw, entry, hd, 'boards');
      cross(cut, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'fusuma';
      for (const v of walls) v.kind = 'fusuma';
      const first = walls.length;
      cross(entry, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'shoji';
      for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
      // 館の執務の座は敷きむしろで推定復元する。文机と同じ軸へ置き、
      // 壁際の灯明台から離す。奥座敷の襖と床の間へ続く中央の道は空ける。
      // 机だけを奥へ十二センチ寄せ、むしろとの間に膝を入れる余白を取る。
      // 奥壁の柱面からも四センチ離し、座と机の軸はそろえたままにする。
      props.push({ part: 'desk', x: -hw + 1.1, z: -hd + .58, w: 1, d: .6, h: .4 });
      props.push({ part: 'seatMat', x: -hw + 1.1, z: -hd + 1.4, w: .6, d: .6, h: .02 });
      // 取次で扱う荷の置き場は、蓋付きの木櫃で推定復元する。
      // 奥の執務机・床の間とは分け、襖と障子の中間の壁際へ寄せる。
      // 陣小屋と同じ木櫃を使い、戸の引きしろと中央の通路を空ける。
      props.push({ part: 'chest', x: hw - .85, z: (cut + entry) / 2,
        w: .7, d: .6, h: .6 });
    } else {
      room(kind === 'minka' ? '炉のある板間' : kind === 'bansho' ? '番の控えの板間' : '兵の休む板間', -hw, hw, -hd, entry, 'boards');
      room('入口の土間', -hw, hw, entry, hd, 'earth');
      cross(entry, -hw + .1, hw - .1, entryX, false);
      if (kind === 'minka') {
        props.push({ part: 'hearth', x: -hw + 1, z: -hd + 1, w: .85, d: .8, h: .45 });
        // 炉端の座は推定復元。手前の座を炉と敷居の間へ詰めると、
        // 炉縁との隙間が五センチほどになり、足を置く板間が残らない。
        // 手前の一枚は戸口の通路を空ける処理で消えていた。
        // 二枚とも炉の右側の奥へ横に並べ、炉縁から二十七センチ以上、
        // むしろ同士も十五センチ離す。上がり框と板戸の引きしろは空ける。
        for (const x of [-hw + 2, -hw + 2.75]) props.push({
          part: 'seatMat', x, z: -hd + 1, w: .6, d: .6, h: .02 });
        // 炉のある板間と炊事の土間を使い分ける推定復元。
        // 焚口は土間の中央へ向け、入口・板戸の引きしろ・上がり框を空ける。
        props.push({ part: 'stove', x: -hw + .65, z: hd - .55,
          w: .7, d: .7, h: .8, y: 0, rot: Math.PI / 2 });
        // 炊事の水は土間の甕へ置く推定復元。竈の焚口と中央の戸口を空け、
        // 反対の壁際へ寄せる。板間の収納や引き戸の引きしろとは重ねない。
        props.push({ part: 'waterJar', x: hw - .65, z: hd - .65,
          w: .55, d: .55, h: .65, y: .0255 });
      }
      else if (kind === 'bansho') {
        // 板間で文机に向かう座は敷きむしろで推定復元する。
        // 左壁の槍掛けと座の縁が二・五センチしか離れていなかった。
        // 机と座を同じ軸で四十センチ内側へ寄せ、座の脇と中央の戸口を空ける。
        const deskX = -hw + 1.5;
        props.push({ part: 'desk', x: deskX, z: -hd + .7, w: 1, d: .6, h: .4 });
        props.push({ part: 'seatMat', x: deskX, z: -hd + 1.45, w: .6, d: .6, h: .02 });
      }
      else {
        // 枕を含めて一・五メートルでは兵が横になれない。寝むしろを一・八メートルにし、
        // 奥壁から二十センチ離す。中央の板戸と木櫃の前の通路は空ける推定復元。
        // 奥の槍掛けと寝床の間は従来八十八・五センチで、両側の当たりを
        // 含めると徒歩の幅九十センチを通せない。寝床を壁側へ十五センチ寄せ、
        // 柱の内面を避けながら両脇に一〇三・五センチの通路を残す。
        for (const x of [-hw + .75, hw - .75]) props.push({ part: 'bedding', x,
          z: -hd + 1.1, w: .75, d: 1.8, h: .12 });
        // 陣小屋にも武具の置き場を設ける推定復元。寝床の間の奥壁へ横掛けを寄せる。
        // 窓の敷居より低くし、入口の板戸・木櫃・中央の通路を空ける。
        // 外寸は回した後の幅と奥行き。絵と当たりで同じ範囲を使う。
        props.push({ part: 'spearRack', x: 0, z: -hd + .55,
          w: 2.5, d: .45, h: 1.2, across: true, rot: Math.PI / 2 });
      }
    }
    // 館の奥座敷は小さな床の間、番所は矢の箱にして、民家の収納と用途を分ける。
    // 室内図のない館の床の間は推定。奥の隅へ造り付け、中央の襖と机の前を空ける。
    // 外周柱の室内面は壁際から二十四センチ。床の間の背と脇を
    // 一センチだけ柱面へ掛け、床柱や掛物を外壁の中へ埋めない。
    // 畳・天井の切り欠きと当たりも、この共通の外寸から追従する。
    if (kind === 'yashiki') props.push({ part: 'alcove', x: hw - .83, z: -hd + .48, w: 1.2, d: .5, h: 2 });
    // 矢は短い棒を箱の上に寝かせず、矢櫃へ立てる。羽根まで含む高さを当たりにも渡す。
    else if (kind === 'bansho') {
      props.push({ part: 'ammo', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: 1.1 });
      // 武具置きは反対の壁へ寄せる推定復元。左では文机の角との間が
      // 約五十センチしかなく、人が机の脇へ回れない。
      // 矢櫃の前にも九十センチを残し、上がり框・板戸の引きしろから離す。
      props.push({ part: 'spearRack', x: hw - .55, z: .25, w: .45, d: 2.5, h: 1.2 });
    }
    // 陣小屋の箱は寝床の足元へ離す。奥の隅では右の寝床と絵も当たりも重なっていた。
    // 敷居は境から二十四センチ張り出す。箱の半奥行き三十センチと
    // 余白二十センチを引き、木櫃が上がり框へ食い込まない位置に置く。
    else props.push({ part: kind === 'nagaya' ? 'chest' : 'storage', x: hw - .65,
      z: kind === 'nagaya' ? entry - .24 - .3 - .2 : -hd + .65, w: .7, d: .6, h: .6 });
    // 館も入口から座敷へ上がる。畳下の板床と畳厚を分け、敷居と調度は畳の上端へそろえる。
    if (kind === 'yashiki') {
      const boardY = .12, tatamiTop = boardY + .06, sillThickness = .04;
      rooms[0].y = rooms[1].y = boardY;
      // 戸の基準高は敷居の下面。四センチの敷居を足した上端を畳へ合わせる。
      // 共通の建具・間仕切り・足場もこの高さを使い、座敷の境に余分な段差を作らない。
      for (const p of portals) p.y = tatamiTop - sillThickness;
      for (const p of props) p.y = tatamiTop;
    } else {
      // 小屋の板間は土間より一段上げる。調度も同じ床高に置く。
      const boardY = .12, sillThickness = .04;
      rooms[0].y = boardY;
      // 戸の基準は敷居の下面。厚みを引いて、上端を板間へそろえる。
      // 板戸の下框・溝・歩く足場もこの値を使い、上がり口だけ高くしない。
      portals[0].y = boardY - sillThickness;
      for (const p of props) p.y ??= boardY;
    }
  } else if (profile === 'tottori' && ['kura', 'bansho', 'nagaya', 'tamari'].includes(kind)) {
    // 個別の室内図は不明。空蔵・番所・長屋・本陣の控えを用途で分けた推定復元。
    const cut = hd - Math.min(1, d * .25), tatami = kind === 'tamari';
    room(kind === 'kura' ? '空の板倉' : kind === 'bansho' ? '番の控え' : tatami ? '下知を受ける座敷' : '兵の休む板間', -hw, hw, -hd, cut, tatami ? 'tatami' : 'boards');
    room(tatami ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, tatami ? 'boards' : 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, tatami);
    if (tatami) {
      portals[portals.length - 1].kind = 'shoji';
      for (const v of walls) v.kind = 'shoji';
    }
    // 飢えた城の蔵に米俵や炊事道具を置かず、戸口から奥まで中央を空ける。
    if (kind === 'bansho' || tatami) props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .4 });
    if (kind === 'nagaya') for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
  } else if (profile === 'takato' && ['bansho', 'kura', 'nagaya'].includes(kind)) {
    // 番所を寝室、兵糧蔵を問屋にしない。入口と奥の板間を板戸で分ける。
    const cut = hd - Math.min(1.1, d * .25);
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の休む板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    if (kind === 'kura') {
      for (const x of [-hw + .65, hw - .65]) props.push({ part: 'storage', x, z: -hd + .75, w: .8, d: .9, h: .8 });
    } else if (kind === 'bansho') {
      props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .46 });
      props.push({ part: 'ammo', x: hw - .65, z: -hd + .65, w: .7, d: .6, h: .55 });
    } else {
      for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1.1, w: .75, d: 1.5, h: .12 });
    }
  } else if (['takato', 'inabayama'].includes(profile) && kind === 'hondo') {
    // 堂は炊事の庫裏と分け、須弥壇のある内陣と参拝する外陣を設ける推定の間取り。
    // 中央の格子戸を左右へ引く余地と、本尊の前に立つ奥行きを確保する。
    // 稲葉山の内陣は須弥壇・礼盤・格子戸前の立ち所を納める。
    // 従来の配分では壇と礼盤が九センチほどまで詰まり、足元を置けなかった。
    const inabaHall = profile === 'inabayama' && raisedTatami;
    const cut = -hd + d * (inabaHall ? .53 : .48);
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0, true, entryW);
    prop('altar', 0, -hd + .8);
  } else if (profile === 'nodafukushima' && kind === 'hondo') {
    // 個別の室内図は不明。御影堂の礼拝する畳の外陣と、須弥壇を置く板敷きの内陣を分ける。
    const cut = -hd + d * .4;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd);
    cross(cut, -hw + .1, hw - .1, hw * .5);
    if (SETTINGS.quality === 'high' && w >= 12 && d >= 8) {
      // 御影堂の通り口は左右の脇間へ分ける推定復元。
      // 須弥壇・前卓・礼盤の正面を横切らず、左の脇卓にも回れるようにする。
      // 右と同じ開口幅を固定の格子から抜き、共通の引き戸と当たりへ渡す。
      const right = portals[portals.length - 1];
      const gap = right.x - walls[walls.length - 2].bx;
      const left = -right.x, a = left - gap, b = left + gap;
      const sleeve = walls[walls.length - 2];
      const start = sleeve.ax;
      sleeve.ax = b;
      walls.push({ ax: start, az: cut, bx: a, bz: cut, paper: true });
      portals.push({ x: left, z: cut, axis: 'z', kind: 'koshi' });
    }
    prop('altar', 0, -hd + .85);
    if (SETTINGS.quality === 'high') {
      // 調度の位置は推定。前卓は香炉・花立・燭台まで含む高さ。左右には供物の脇卓。
      // 脇の格子戸から内陣へ入る道と、須弥壇の両脇は空ける。
      props.push({ part: 'maejoku', x: 0, z: -hd + 1.6, w: 1.2, d: .32, h: .95 });
      // 礼盤から須弥壇へ向いて経を読む経卓を補う推定復元。
      // 前卓との間へ卓を納め、礼盤は格子の手前へ出さず内陣内で少し下げる。
      const readingDesk = d >= 8;
      props.push({ part: 'raiban', x: 0, z: -hd + (readingDesk ? 2.8 : 2.3), w: .9, d: .85, h: .3 });
      if (readingDesk) props.push({ part: 'sutraDesk', x: 0, z: -hd + 2.05, w: .85, d: .36, h: .55 });
      // 須弥壇の幅二・一メートルと脇卓の幅一・一メートルの間に、
      // 人と家具の当たりを含めて通れる一・一メートルを残す。
      // 四十センチしかなかった両脇を広げ、格子戸から壇の横へ回れるようにする。
      for (const x of [-2.7, 2.7]) props.push({ part: 'offering', x, z: -hd + .85, w: 1.1, d: .6, h: .55 });
      // 内陣と外陣の同じ柱筋で天井を受ける推定復元。
      // 内陣の柱は脇卓より手前、格子戸より奥へ置き、須弥壇への中央の道を空ける。
      // 柱の高さと当たりは室内側で天井に合わせる。
      if (w >= 10 && d >= 7) for (const x of [-w / 6, w / 6])
        for (const z of [cut - .8, (cut + hd) / 2])
          props.push({ part: 'hallPost', x, z, w: .32, d: .32 });
      // 外陣も柱と畳だけにせず、門徒が本尊へ向いて読経する低い経卓を備える推定復元。
      // 内陣・僧坊と同じ折本付きの部品を共用し、畳へ直接座る場所を卓の手前に残す。
      // 正面の板戸から格子戸へ進む中央と、独立柱・側窓への通りは空ける。
      // 小さな堂へ流用した時は詰め込まず、この戦の広い御影堂だけに置く。
      if (w >= 12 && d >= 8) for (const x of [-w * .28, w * .28])
        props.push({ part: 'sutraDesk', x, z: hd - 1.6, w: .85, d: .4, h: .36 });
    }
  } else if (profile === 'nodafukushima' && kind === 'kuri') {
    // 個別の室内図は不明。炊事の土間と奥の食事の座敷を分ける推定復元。
    // 横向きの間仕切りにして、共通の引き戸と戸口の当たりを使う。
    const cut = -hd + d * .4;
    room('食事の座敷', -hw, hw, -hd, cut);
    room('炊事の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (const v of walls) v.kind = 'shoji';
    // 入口から障子まで中央を空け、竈も薪・米の置き場も土間に収める。
    // 高では焚き口と器棚の正面を土間の中央へ向ける。外壁との狭い隙間へ
    // 向けず、薪をくべる・器を取る場所を確保する。煙抜きと戸の引き代は保つ。
    const kitchenFacing = SETTINGS.quality === 'high' ? Math.PI : 0;
    props.push({ part: 'stove', x: -hw + .9, z: hd - 1, w: .85, d: .7, h: .9, rot: kitchenFacing });
    // 高の庫裏は引き出し箪笥でなく、炊事の器を収める開いた木棚とする推定復元。
    props.push({ part: SETTINGS.quality === 'high' ? 'kitchenShelf' : 'storage', x: hw - .7, z: hd - 1, w: .85, d: .7, h: .8, rot: kitchenFacing });
    // 炊事の作業場を竈・食器棚と分ける推定復元。障子と玄関を結ぶ中央は空ける。
    // 台上の道具も含む寸法を渡し、窓の引き代を避ける時も絵と当たりを一緒に動かす。
    if (SETTINGS.quality === 'high') {
      props.push({ part: 'kitchenBench', x: -hw + 1.6, z: cut + 1.35, w: 1.3, d: .65, h: .7 });
      // 炊事の水と燃料の備えも土間へ置く推定復元。竈の焚き口の前を空け、
      // 水甕は右の調理側、薪は竈の横へ分ける。中央の戸口と障子には寄せない。
      props.push({ part: 'waterJar', x: hw - 2.3, z: cut + 1.35, w: .72, d: .72, h: .75 });
      props.push({ part: 'firewood', x: -hw + 2.4, z: hd - 1, w: .85, d: .65, h: .5 });
      // 炊事用の米と米研ぎの桶を器棚側へ備える推定復元。
      // 米俵は既存の台付き部品を共用。水甕・器棚と離し、中央の出入りを空ける。
      if (w >= 9 && d >= 6) {
        // 米俵を器棚のすぐ手前へ置くと、棚との間が十センチしか残らない。
        // 障子寄りの側壁へ分け、棚の正面と米研ぎ桶へ回る土間を空ける。
        props.push({ part: 'riceBales', x: hw - 1, z: cut + .65, w: .8, d: .7, h: .7 });
        props.push({ part: 'washingTub', x: hw - 2.3, z: hd - 1.1, w: .72, d: .72, h: .55 });
      }
    }
    if (SETTINGS.quality === 'high') {
      // 食事の座敷は文机で済ませず、一人分ずつの膳を左右へ置く推定復元。
      // 中央の障子への道と壁際の内障子の引き代を空け、器まで同じ当たりへ収める。
      for (const x of [-w * .24, w * .24])
        props.push({ part: 'mealTray', x, z: -hd + .8, w: .65, d: .5, h: .32 });
    } else props.push({ part: 'desk', x: -hw + .9, z: -hd + .7, w: 1.2, d: .7, h: .46 });
  } else if (['echizen_ikko', 'honnoji_sobo', 'nodafukushima', 'hieizan'].includes(profile) && kind === 'sobo') {
    // 個別の室内図は不明。僧坊は畳の座敷と板敷きの入口を持つ推定の間取り。
    // 比叡山は正面戸と座敷の障子の間に、人が立てる板間を残す。
    // 本能寺は表障子が壁芯から二十七センチ内を滑る。奥行き三・五メートルの
    // 僧坊でも、座敷の障子との間に人が立てる板間を取る（間取りは推定）。
    // 床・畳・天井・窓・建具の当たりは、この境界をそのまま共有する。
    const nodaEntry = SETTINGS.quality === 'high' && profile === 'nodafukushima';
    const entryDepth = profile === 'honnoji_sobo' ? Math.min(1.35, d * .4)
      : nodaEntry ? Math.min(1.6, d * .3) : profile === 'hieizan' ? Math.min(1.5, d * .3) : Math.min(1, d * .22);
    const entry = hd - entryDepth;
    if (d >= 4.5) {
      const cut = -hd + d * .42;
      room('僧の奥の座敷', -hw, hw, -hd, cut);
      room('僧の控えの座敷', -hw, hw, cut, entry);
      cross(cut, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = profile === 'hieizan' ? 'fusumaPlain' : 'fusuma';
      for (const v of walls) v.kind = portals[portals.length - 1].kind;
    } else room('僧の座敷', -hw, hw, -hd, entry);
    room('板敷きの入口', -hw, hw, entry, hd, 'boards');
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[portals.length - 1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    if (profile !== 'hieizan') {
    // 野田の僧坊は読経・書写の場として補う推定復元。元の家具の範囲と通路を保つ。
    const scripture = SETTINGS.quality === 'high' && profile === 'nodafukushima';
    props.push({ part: scripture ? 'writingDesk' : 'desk', x: -hw + .8, z: -hd + .7, w: 1, d: .6, h: .4 });
    props.push({ part: scripture ? 'documentShelf' : 'storage', x: hw - .65, z: -hd + .7, w: .7, d: .6, h: .65 });
    if (scripture && w >= 8 && d >= 4.5) {
      // 奥座敷は書写だけの部屋にせず、僧の休む筵と巻いた掛け物も備える推定復元。
      // 奥の机・経巻棚より手前、襖より奥に納める。窓障子の滑る壁際と中央は空ける。
      // 砦の寝所と同じく、大人が横になれる一・八メートルの筵にする。
      // 襖側の余白は保ち、延ばした分を奥の座敷へ収める。
      const rest = rooms[0], beddingD = 1.8;
      if (rest.z1 - rest.z0 >= 2.7) for (const x of [-w * .23, w * .23])
        props.push({ part: 'bedding', x, z: rest.z1 - .25 - beddingD / 2, w: .75, d: beddingD, h: .12 });
      // 控えの座敷は書写と読経の場を分ける推定復元。奥の私室だけに調度を集めない。
      // 二つの戸口を結ぶ中央と、左右の窓障子の引き代を空ける。
      // 左は硯・筆・紙の文机、右は御影堂と共通の折本付き経卓。
      // 家具の数と外寸を保ち、開けた襖・障子の前へ調度を増やさない。
      const study = rooms[1];
      // 卓を部屋の中央へ置くと、手前の筵が入口側の余白へ八センチはみ出し、
      // 下の配置検査で書写・読経の席が両方消える。卓と座る場所を一組で納める。
      // 卓の半奥行き・卓との間・筵の半奥行き・部屋端の余白を確保する。
      const studyDeskZ = Math.min((study.z0 + study.z1) / 2,
        study.z1 - .25 - .55 / 2 - .4 - .6 / 2 - .02);
      if (study.z1 - study.z0 >= 2.2) for (const x of [-w * .24, w * .24])
        props.push({ part: x < 0 ? 'writingDesk' : 'sutraDesk', x, z: studyDeskZ, w: 1, d: .6, h: .36 });
    }
    } else {
    // 比叡山の明かり障子は壁の内側三十六センチの二本溝を滑る。
    // 机・経巻棚の背と側面を壁から六十センチ以上離し、開いた戸が
    // 天板や棚を貫かないようにする。間仕切りの脇口は従来どおり空ける。
    // 調度の位置をここで直し、描画と当たりに同じ寸法を渡す。
    const setback = profile === 'hieizan' ? .3 : 0;
    props.push({ part: 'desk', x: -hw + .8 + setback, z: -hd + .7 + setback, w: 1, d: .6, h: .4 });
    props.push({ part: 'storage', x: hw - .65 - setback, z: -hd + .7 + setback, w: .7, d: .6, h: .65 });
    // 畳の厚み六センチの上へ机と経巻棚を載せ、脚を板床まで沈めない。
    if (profile === 'hieizan') for (const p of props) p.y = .06;
    // 閉めた襖の奥でも経巻を扱えるよう、文机の脇に置き灯明を据える。
    // 配置は推定。机から八センチ離し、座る手前・明かり障子の溝を空ける。
    // 畳上の高さと台の当たりを共有し、入口と同じ形・材質を使い回す。
    if (profile === 'hieizan') {
      const desk = props.find(p => p.part === 'desk'), room = rooms[0];
      const x = desk.x + desk.w / 2 + .08 + .16, z = desk.z;
      if (x + .16 < room.x1 - .6 && z - .16 > room.z0 + .6 && z + .16 < room.z1 - .3) {
        props.push({ part: 'tomyo', x, z, y: .06, w: .32, d: .32, h: .97 });
      }
      // 襖と障子を閉めた控えの座敷にも灯明を据える。個別の配置は推定。
      // 畳寄せ・敷居と、間仕切りの手前へ滑る戸の溝を避けた畳上へ納める。
      // 側窓の障子からも離し、奥の座敷と同じ灯具・床高・当たりを使う。
      const waiting = rooms.find(r => r.name === '僧の控えの座敷');
      if (waiting) {
        const front = waiting.z0 + .44 + .16, back = waiting.z1 - .12 - .16;
        const lampX = waiting.x0 + .8, lampZ = (front + back) / 2;
        if (back - front > .42 && lampX + .16 < waiting.x1 - .6
          && portals.every(p => Math.abs(lampX - p.x) >= .61 || Math.abs(lampZ - p.z) >= 1.21)) {
          props.push({ part: 'tomyo', x: lampX, z: lampZ, y: .06, w: .32, d: .32, h: .97 });
        }
        // 控えの座敷にも読経の経机を補う推定のしつらえ。
        // 堂と同じ経巻付きの机を畳へ載せ、右脇に座る奥行きを取る。
        // 襖・障子の引き代、側窓、左の灯明と中央の通路を空ける。
        // 狭い座敷には無理に置かず、絵と当たりを同じ配置で作る。
        const prayer = { part: 'kyozukue', x: waiting.x1 - 1.2,
          z: waiting.z0 + .8, y: .06, w: .8, d: .4, h: .4 };
        if (prayer.x - prayer.w / 2 > .8
          && prayer.x + prayer.w / 2 < waiting.x1 - .6
          && prayer.z - prayer.d / 2 > waiting.z0 + .44
          && prayer.z + prayer.d / 2 + .65 < waiting.z1 - .12
          && portals.every(p => Math.abs(prayer.x - p.x) >= prayer.w / 2 + .45
            || Math.abs(prayer.z - p.z) >= prayer.d / 2 + 1.05)
          && props.every(p => Math.abs(prayer.x - p.x) >= (prayer.w + p.w) / 2 + .15
            || Math.abs(prayer.z - p.z) >= (prayer.d + p.d) / 2 + .15)) {
          props.push(prayer);
        }
      }
    }
    // 入口の置き灯明も調度として登録し、木の台を人がすり抜けないようにする。
    // 板間へ据え、戸口と障子の引き込み先を空ける。油皿・火先まで同じ外寸で扱う。
    if (profile === 'hieizan') for (const x of [-hw + .5, hw - .5]) {
      props.push({ part: 'tomyo', x, z: hd - .75, w: .32, d: .32, h: .97 });
    }
    }
    // 本能寺の僧坊は書写の道具だけにせず、奥の畳へ畳んだ寝具を納める（配置は推定）。
    // 文机と収納の間を使い、狭い南の僧坊でも障子の引き代と入口は空ける。
    if (profile === 'honnoji_sobo')
      props.push({ part: 'foldedBedding', x: 0, z: -hd + .55, w: .85, d: .55, h: .28 });
  } else if (profile === 'echizen_ikko' && kind === 'bansho') {
    // 番所には寝具でなく、板間の控えと戸で区切った入口、矢の箱を置く。
    const cut = hd - Math.min(1, d * .25);
    room('寺の番の控え', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    props.push({ part: 'ammo', x: -hw + .65, z: -hd + .65, w: .7, d: .6, h: .55 });
    props.push({ part: 'desk', x: hw - .8, z: -hd + .65, w: 1, d: .6, h: .4 });
  } else if (profile === 'nagashima' && ['nagaya', 'bansho', 'kura'].includes(kind)) {
    // 輪中の砦の推定内装。番所の畳、長屋の板間、蔵の荷置きを分け、中央の動線を空ける。
    const cut = hd - Math.min(1.1, d * .28);
    room(kind === 'bansho' ? '番の座敷' : kind === 'kura' ? '兵糧の板倉' : '兵の寝る板間', -hw, hw, -hd, cut, kind === 'bansho' ? 'tatami' : 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, kind === 'bansho');
    if (kind === 'bansho') props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .46 });
    else if (kind === 'kura') {
      for (const x of [-hw + .7, hw - .7]) props.push({ part: 'storage', x, z: -hd + .75, w: .9, d: .8, h: .8 });
    } else for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
  } else if (profile === 'nodafukushima' && kind === 'minka') {
    // 河口の小さな民家の推定間取り。武家の座敷や兵舎の寝具で埋めず、土間と炉のある板間を分ける。
    const cut = hd - Math.min(2, d * .42);
    room('炉のある板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    portals[portals.length - 1].kind = 'itado';
    for (const v of walls) v.kind = 'itado';
    props.push({ part: 'hearth', x: -hw + 1, z: -hd + .9, w: .8, d: .7, h: .45 });
    // 高の民家も用途のない箱で済ませず、器の見える低い棚とする推定復元。
    // 庫裏の器棚を使い回し、元の収納と同じ寸法・置き場に収める。
    props.push({ part: SETTINGS.quality === 'high' ? 'kitchenShelf' : 'storage', x: hw - .7, z: -hd + .7, w: .8, d: .6, h: .6 });
    if (SETTINGS.quality === 'high') {
      // 河口の民家も炉だけでなく、炊事の水と薪を土間に備える推定復元。
      // 庫裏と同じ部品を使い、左右の壁際へ寄せる。中央の入口・板戸と、
      // 玄関の戸が滑る溝の手前を空け、板間や炉の上へ荷を置かない。
      const workZ = (cut + hd) / 2 - .15;
      props.push({ part: 'waterJar', x: hw - .9, z: workZ, w: .65, d: .65, h: .7 });
      // 炉と水甕だけでは食材を扱う場所がないため、土間に俎板付きの作業台を補う推定復元。
      // 薪束と台を横に並べると隙間が二・五センチしかない。
      // 台を左の壁際へ寄せ、少量の焚き付けを脚の間・低い貫より下へ収める。
      // 台の内側に収まる同じ薪部品を使い、絵と当たりを揃えて作業する土間を空ける。
      // 小さくて台を置かない民家では、元の独立した薪束を保つ。
      if (w >= 6 && d >= 4.5) {
        const benchX = -hw + .9;
        props.push({ part: 'kitchenBench', x: benchX, z: workZ, w: .6, d: 1, h: .6 });
        props.push({ part: 'firewood', x: benchX, z: workZ, w: .35, d: .45, h: .12 });
      } else props.push({ part: 'firewood', x: -hw + .9, z: workZ, w: .85, d: .65, h: .5 });
      // 炊事だけの小屋にせず、板間の奥に筵と巻いた掛け物の休む場を設ける推定復元。
      // 炉・器棚の間へ寄せ、土間から板戸を通る中央と引き代は空ける。
      // 僧坊と同じ一・八メートルの薄い筵。奥壁から二十五センチ離し、
      // 足元を板間へ収めて、土間との板戸の引き代を保つ。
      if (w >= 6 && d >= 4.5) {
        props.push({ part: 'bedding', x: w * .2, z: -hd + 1.15, w: .75, d: 1.8, h: .12 });
        // 炉を置くだけでなく、火の世話をする側に座る筵を敷く推定復元。
        // 炉の縁から二十センチ離し、板戸の敷居より奥の板間へ収める。
        // 既存の薄い筵を共用し、踏んで通れる指定で中央の動線を保つ。
        const hearthSeatZ = -hd + 1.725;
        if (hearthSeatZ + .275 <= cut - .25)
          props.push({ part: 'sittingMat', x: -hw + 1, z: hearthSeatZ,
            w: .65, d: .55, h: .018, walkable: true });
        // 暮らしの場として、炉の脇に椀と箸を載せた低い膳を置く推定復元。
        // 庫裏の膳を共用し、炉・右の筵・中央の通りと板戸の引き代を空ける。
        // 炉の脇へ寄せすぎると間が約三十五センチになり、人が回れない。
        // 高では炉と膳の間を八十センチ以上取り、右の筵までの通りも残す。
        // 六棟とも内装を作る時だけ束ね、毎コマの処理は増やさない。
        props.push({ part: 'mealTray', x: -w * .12, z: -hd + 1.15, w: .6, d: .45, h: .25 });
      }
    }
  } else if (profile === 'nodafukushima' && ['goten', 'nagaya', 'bansho', 'kura'].includes(kind)) {
    // 河川砦の推定復元。番所・板倉・長屋と、畳で下知を受ける詰所を分ける。
    // 小さな板倉でも玄関と奥の板戸の受け材を重ねない。
    // 玄関の溝の内端（壁から五十七センチ）と間仕切りの溝の間に余白を取る。
    // 二砦の詰所・番所・長屋は玄関戸の溝から内戸の敷居まで八十三センチを残す。
    // 一・一メートルの板間では実際に立てる奥行きが三十三センチしかなく、
    // 横へ回って玄関戸を閉められない。床・天井・襖を同じ部屋境界で広げる。
    const entryDepth = SETTINGS.quality === 'high' ? nodaEntryDepth(kind, w, d, use) : Math.min(1.1, d * .28);
    const cut = hd - entryDepth;
    // 本願寺の裏方は兵舎と分ける。寺務と道具の置き場を持つ推定復元。
    // 外形・板戸・梁は長屋のまま、指定した四棟の高画質だけに適用する。
    const templeService = SETTINGS.quality === 'high' && kind === 'nagaya'
      && ['templeService', 'templeGrain', 'templeUtensils', 'templeFuel'].includes(use);
    const serviceRoom = use === 'templeGrain' ? '兵糧を置く板間'
      : use === 'templeUtensils' ? '器を収める板間' : use === 'templeFuel' ? '薪を置く板間' : '寺務の板間';
    const fortWatch = SETTINGS.quality === 'high' && kind === 'nagaya' && use === 'fortWatch';
    // 二砦の詰所は下知や書状を扱う座敷として補う推定復元。
    // 既存の文机・文書棚を使い、元の家具の寸法と中央の通路を保つ。
    const fortOffice = SETTINGS.quality === 'high' && kind === 'goten';
    room(templeService ? serviceRoom : fortWatch ? '番の控えと休む板間' : kind === 'goten' ? '下知の座敷' : kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の寝る間', -hw, hw, -hd, cut, kind === 'goten' ? 'tatami' : 'boards');
    // 仮設の詰所に御殿の上段を描かず、畳と入口の板床を同じ高さにする。
    rooms[0].raised = false;
    room(kind === 'goten' ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, kind === 'goten' ? 'boards' : 'earth');
    // 小さな兵糧蔵と寺の物置は、入口の土間から荷置きの板間へ開いておく推定復元。
    // 奥行き九十五センチの土間へ内外二組の戸を付けると、玄関の溝の内端と
    // 内戸の敷居の間は十八センチしか残らず、横へ回って戸を閉められない。
    // 床の仕上げと外の引き戸は保ち、内側の壁・戸・敷居の当たりをまとめて省く。
    // 詰所・番所・寝所・寺務の部屋は従来の間仕切りを使う。
    const openStore = SETTINGS.quality === 'high' && (kind === 'kura'
      || templeService && use !== 'templeService');
    // 荷置きの板床は土間より一段上げる推定復元。
    // 間仕切りのない蔵・物置だけに使い、玄関の板戸の溝は動かさない。
    // 床・框・荷物・歩行で同じ高さを共有する。
    if (openStore) rooms[0].y = .16;
    if (!openStore) {
      cross(cut, -hw + .1, hw - .1, entryX, kind === 'goten');
      // 詰所の下知は透ける障子でなく襖で区切る。板間と座敷の高さは揃えたまま。
      const doorKind = kind === 'goten' ? 'fusuma' : 'itado';
      portals[portals.length - 1].kind = doorKind;
      for (const v of walls) v.kind = doorKind;
    }
    // 高では兵糧蔵を米俵、番所を槍掛けで示す。壁際の同じ置き場を使い、入口と板戸の前は空ける。
    if (kind !== 'nagaya') {
      const grain = SETTINGS.quality === 'high' && kind === 'kura', weapons = SETTINGS.quality === 'high' && kind === 'bansho';
      props.push({ part: grain ? 'riceBales' : weapons ? 'spearRack' : fortOffice ? 'documentShelf' : kind === 'kura' ? 'storage' : 'chest',
        // 短槍は梁の下に収め、背の高い槍掛けだけ内障子の二本の溝から離す。
        // 障子の框・当たりと槍掛けの足が重ならない位置を、絵と当たりで共有する。
        x: -hw + (weapons ? 1.25 : .65), z: -hd + .65, w: .8, d: .7, h: weapons ? 1.95 : .7 });
      // 兵糧蔵は片隅の三俵だけにせず、左右の板床へ分けて備える推定復元。
      // 反対側も同じ俵と台を使い、中央の運び道・土間・板戸の引き代を残す。
      if (grain) props.push({ part: 'riceBales', x: hw - .65, z: -hd + .65, w: .8, d: .7, h: .7 });
    }
    // 番所でも出入りや伝令の書付を扱う。高では詰所と同じ硯・筆・紙の文机を使い、
    // 空の台だけにしない。机の寸法・配置と戸口の通り幅は保つ推定復元。
    if (kind === 'goten' || kind === 'bansho') props.push({ part: SETTINGS.quality === 'high' ? 'writingDesk' : 'desk', x: hw - .8, z: -hd + .65, w: 1.2, d: .7, h: .46 });
    if (fortOffice && w >= 5.5 && d >= 4.5) {
      // 二砦の詰所は書状を扱うだけでなく、武具を備える場として補う推定復元。
      // 番所の短槍掛けを共用し、文書棚の手前・襖の溝より奥へ収める。
      // 側壁の内障子から離し、中央の戸口と右の文机への道を空ける。
      // 取り出す面を襖へ向けず、座敷の空いた側へ向ける。外寸と引き代は保つ。
      props.push({ part: 'spearRack', x: -hw + 1.25, z: cut - .7, w: .65, d: .3, h: 1.95, rot: Math.PI });
      // 下知を受ける控えの席も設ける推定復元。文机の席と分け、奥へ向けて左右へ敷く。
      // 中央は一人が通れる幅を残し、槍掛け・文書棚・襖の引き代には重ねない。
      // 既存の薄い筵を共用し、踏んで通れる床のしつらえとして扱う。
      for (const x of [-w * .18, w * .18])
        props.push({ part: 'sittingMat', x, z: cut - 1.7,
          w: .65, d: .55, h: .018, walkable: true });
    }
    if (SETTINGS.quality === 'high' && kind === 'bansho') {
      // 野田砦の番所には槍だけでなく、矢を補う低い箱も備える推定復元。
      // 既存の矢箱を共用し、八十五センチの矢を奥行きに収める。
      // 野田の番所の内寸では、従来の矢箱は戸口の正面に入り、
      // 下の通路整理で丸ごと消えていた。箱の半幅と通路の余白を足した
      // 八十五センチより脇へ寄せ、槍掛けと文机の間へ収める。
      // 奥壁の地覆・板床の框からも離し、箱と矢の寸法は保つ。
      const besideRack = w >= 6.5;
      props.push({ part: 'ammo', x: besideRack ? Math.max(-hw + 3.25, entryX + .95) : -hw + 1.25,
        z: besideRack ? -hd + .8 : cut - .9, w: .8, d: .9, h: .45 });
    }
    if (templeService && use !== 'templeService') {
      // 三棟の用途は推定。既存の俵・器棚・薪束を共用し、奥の左右に分ける。
      // 中央の通路と板戸の引き代を空け、全て同じ配置から絵と当たりを作る。
      const part = use === 'templeGrain' ? 'riceBales' : use === 'templeUtensils' ? 'kitchenShelf' : 'firewood';
      for (const x of [-hw + .9, hw - .9]) {
        // 器棚は側壁を背にして中央の運び道へ向ける推定復元。
        // 椀を正面から取り出せるようにし、棚の前を入口まで続く通路へ向ける。
        // 正方形の外寸へ納め、回しても絵・当たり・経路の寸法を揃える。
        const utensils = use === 'templeUtensils';
        props.push({ part, x, z: -hd + .8, w: utensils ? .8 : 1, d: .8,
          h: part === 'firewood' ? .5 : .8, rot: utensils ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0 });
      }
      // 器置きの水甕は板間へ置かず、入口の土間の端へ収める。
      if (use === 'templeUtensils')
        props.push({ part: 'waterJar', x: hw - .9, z: (cut + hd) / 2, w: .6, d: .5, h: .65 });
    } else if (templeService) {
      // 戸口と板戸の正面を空け、壁際へ低い文机と道具の箱を置く。
      props.push({ part: 'writingDesk', x: -hw + .9, z: -hd + .75, w: 1.2, d: .7, h: .46 });
      props.push({ part: 'documentShelf', x: hw - .7, z: -hd + .65, w: .85, d: .7, h: .65 });
      // 土間を広げても書類棚の正面を箱で塞がない。奥壁に沿って横へ並べる推定復元。
      // 棚と箱は同じ側から扱い、中央の通路・板戸と背面の障子の引き代を空ける。
      // 既存の箱の寸法を保ち、絵・当たり・兵の経路へ同じ配置を渡す。
      props.push({ part: 'chest', x: hw - 2.1, z: -hd + .65, w: .9, d: .3, h: .55 });
    } else if (fortWatch) {
      // 福島の番所兼長屋は、左手を番の控え、右手を休む場所にする推定復元。
      // 既存の短槍掛けと文机を使い、入口・板戸の引き込み先・中央の通路を空ける。
      // 兼用の番所も内障子の引き込み先を空け、槍と紙戸を交差させない。
      // 奥の槍掛けと文机の隙間は実寸で二センチにも満たない。
      // 槍掛けは通常の長屋と同じ薄い形で入口寄りへ分け、
      // 文机を奥壁側へ置く。内障子・板戸の引き代は保つ。
      // 槍の取り出し面と板戸の敷居の間は五センチしかない。控えの板間へ向ける。
      props.push({ part: 'spearRack', x: -hw + 1.25, z: cut - .4, w: .65, d: .3, h: 1.95, rot: Math.PI });
      // 机と座る筵を中央寄りへ分け、槍掛けへの道を空ける。
      // 戸口の正面には寄せず、筵も板間と板戸の敷居の間に収める。
      props.push({ part: 'writingDesk', x: -w * .19, z: -hd + .65, w: 1.2, d: .7, h: .46 });
      // 浅い番所兼長屋も通常の長屋と同じく筵を横へ敷き、内戸と箱の前を空ける。
      // 寝床の長さは保ち、絵と当たりへ同じ向き・外寸を渡す。
      // 奥行き四メートルも、縦敷きでは寝床の足元が木箱へ二十センチ重なる。
      const crosswise = d <= 4 && w >= 4.7;
      props.push({ part: 'bedding', x: hw - (crosswise ? 1.15 : .8),
        z: -hd + (crosswise ? .625 : 1.15), w: crosswise ? 1.8 : .75,
        d: crosswise ? .75 : 1.8, h: .12, crosswise });
      // 休む側にも身の回りの品を収める蓋付き木箱を備える推定復元。
      // 通常の長屋と同じ部品を使い、寝床の足元と板戸の敷居の間へ納める。
      // 側壁の内障子から離し、中央の通路と玄関の引き代は空ける。
      props.push({ part: 'chest', x: hw - 1.25, z: cut - .4, w: .65, d: .3, h: .42 });
    } else if (kind === 'nagaya') {
      const fullBed = SETTINGS.quality === 'high';
      // 短い長屋は筵を奥壁に沿わせ、武具・木箱の前に立つ板間を取る推定復元。
      // 一・八メートルの寝床を縮めず、配置の外寸も横向きにして通路と揃える。
      // 野田の二棟も奥行き四メートル。縦敷きの足元と槍掛け・箱の重なりを避ける。
      const crosswise = fullBed && w >= 4.7 && d <= 4;
      for (const x of crosswise ? [-hw + 1.15, hw - 1.15] : [-hw + .8, hw - .8])
        props.push({ part: 'bedding', x, z: -hd + (crosswise ? .625 : fullBed ? 1.15 : 1),
          w: crosswise ? 1.8 : .75, d: crosswise ? .75 : fullBed ? 1.8 : 1.5, h: .12, crosswise });
      if (SETTINGS.quality === 'high') {
        // 砦の兵の寝所は、左の武具置きと右の身の回りの木箱に用途を分ける推定復元。
        // 番所と同じ槍掛けを木箱一つの範囲へ納め、梁の下に穂先を収める。
        // 寝具の足元・中央の通路・板戸の引き代を保ち、寺務用と番所兼用には重ねない。
        // 横向きの筵の手前に一メートル以上の板間を残し、武具・木箱へ回れるようにする。
        // 奥行き三十センチの武具置き・箱は、敷居の溝からも五センチ離す。
        // 板戸側の狭い隙間から槍を取らせず、寝床との間の板間へ向ける。
        props.push({ part: 'spearRack', x: -hw + 1.25, z: cut - .4, w: .65, d: .3, h: 1.95, rot: Math.PI });
        props.push({ part: 'chest', x: hw - 1.25, z: cut - .4, w: .65, d: .3, h: .42 });
      }
    }
  } else if (profile === 'arioka' && ['kura', 'bansho', 'nagaya'].includes(kind)) {
    // 有岡の小さな兵舎・番所・武具蔵は板敷き。館の上段や床の間を置かない推定復元。
    const cut = hd - Math.min(1, d * .25);
    room(kind === 'kura' ? '武具の板倉' : kind === 'bansho' ? '番の控え' : '兵の休む板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    if (kind === 'nagaya') {
      for (const x of [-hw + .8, hw - .8]) props.push({ part: 'bedding', x, z: -hd + 1, w: .65, d: 1.4, h: .12 });
    } else {
      props.push({ part: 'ammo', x: -hw + .65, z: -hd + .65, w: .7, d: .6, h: .55 });
      props.push({ part: kind === 'bansho' ? 'desk' : 'chest', x: hw - .7, z: -hd + .65, w: .8, d: .6, h: kind === 'bansho' ? .46 : .7 });
    }
  } else if (profile === 'arioka' && kind === 'temple') {
    // 堂内に庫裏を重ねず、須弥壇の内陣と参詣する外陣を格子戸で分ける。姿は推定。
    const cut = -hd + d * .4;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, hw * .5);
    prop('altar', 0, -hd + .85);
  } else if ((profile === 'usayama' || profile === 'iwamura_' + kind) && ['kura', 'bansho', 'nagaya'].includes(kind)) {
    // 宇佐山の蔵・番所・長屋は用途を分けた推定復元。戸口から奥まで中央を空ける。
    // 岩村の入口の板戸は外壁から四十二センチ内へ引いてある。
    // 土間が従来の九十センチほどでは二組の戸の間で立ち止まれないため、
    // 小さな番所でも一・二メートル以上の間隔を取る推定復元。
    const roomyEntry = doorClearance && profile === 'iwamura_' + kind;
    const cut = hd - (roomyEntry ? Math.min(1.8, d * .45) : Math.min(1.1, d * .25));
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : '兵の休む板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    // 岩村の狭い用屋でも、開いた板戸の端を隅柱の内面より手前へ収める。
    const iwamuraGap = doorClearance && profile.startsWith('iwamura_') ? Math.min(1.05, (w - .6) / 4 - Math.abs(entryX) / 2) : null;
    cross(cut, -hw + .1, hw - .1, entryX, kind !== 'kura' && !profile.startsWith('iwamura_'), iwamuraGap);
    if (kind === 'kura') {
      // 岩村の兵糧蔵は奥の二積みだけでなく、板倉の長さに応じて壁沿いに俵を収める推定復元。
      // 俵の端を板戸から二十センチ以上離し、引込み先と中央の通路を空ける。
      // 既存の敷木付きの俵を使い回し、絵と当たりへ同じ配置・寸法を渡す。
      const storageRows = roomyEntry ? Math.max(1, Math.floor((cut - .65 - (-hd + .75)) / 1.2) + 1) : 1;
      for (let row = 0; row < storageRows; row++) for (const x of [-hw + .65, hw - .65]) {
        props.push({ part: 'storage', x, z: -hd + .75 + row * 1.2, w: .8, d: .9, h: .8 });
      }
    } else if (kind === 'bansho') {
      props.push({ part: 'desk', x: -hw + .8, z: -hd + .65, w: 1.1, d: .6, h: .46 });
      // 岩村の番所は槍掛けを推定復元。箱と同じ床面積で、当たりにも実際の高さを渡す。
      // 低い文机に向かう座を筵で推定復元。机と十五センチ、板戸と二十センチ空ける。
      // 狭い板間には無理に敷かず、中央の口と土間を空ける。
      const seatX = -hw + .8, seatZ = -hd + 1.45;
      if (roomyEntry && seatZ + .35 <= cut - .2
        && seatX + .325 <= entryX - iwamuraGap - .1) {
        props.push({ part: 'sittingMat', x: seatX, z: seatZ, w: .65, d: .7, h: .025 });
      }
      const weaponRack = doorClearance && profile === 'iwamura_bansho';
      props.push({ part: weaponRack ? 'yariRack' : 'ammo', x: hw - .65, z: -hd + .65,
        w: .7, d: .6, h: weaponRack ? 2.05 : .55 });
    } else {
      // 岩村の長い長屋は、長持と槍掛けを入口寄りの板間へまとめる推定復元。
      // 板戸の手前を三十五センチ空け、中央に置いた武具で奥の寝所を分断しない。
      // 寝所の除け方と調度の当たりにも、同じ位置を渡す。
      const fittingsZ = roomyEntry ? cut - .65 : 0;
      const chest = { part: 'chest', x: -hw + .65, z: fittingsZ, w: .8, d: .6, h: .65 };
      // 岩村の長屋にも兵の武具置きを設ける推定復元。番所と同じ槍掛けを使う。
      // 長持と向かい合う壁際に納め、中央の通路・土間・板戸の引込み先を空ける。
      const rack = roomyEntry ? { part: 'yariRack', x: hw - .65, z: fittingsZ, w: .7, d: .6, h: 2.05 } : null;
      const fittings = rack ? [chest, rack] : [chest];
      // 岩村の長屋は奥の二人分だけでなく、板間の長さに合わせて筵を敷く推定復元。
      // 左右の壁際に限り、長持の前・中央の通路・板戸の引込み先を空ける。
      const sleepingRows = roomyEntry ? Math.max(1, Math.floor((cut - .35 - (-hd + 1.1 + .75)) / 1.9) + 1) : 1;
      for (let row = 0; row < sleepingRows; row++) for (const x of [-hw + .9, hw - .9]) {
        const z = -hd + 1.1 + row * 1.9;
        if (roomyEntry && fittings.some(p => Math.abs(x - p.x) < (.75 + p.w) / 2 + .15
          && Math.abs(z - p.z) < (1.5 + p.d) / 2 + .15)) continue;
        props.push({ part: 'bedding', x, z, w: .75, d: 1.5, h: .12 });
      }
      props.push(...fittings);
    }
  } else if (profile === 'inabayama' && ['kura', 'bansho', 'tamari', 'nagaya'].includes(kind)) {
    // 稲葉山の実務の板間と遠侍の畳を分ける。中央の戸口と入口を空けた推定の間取り。
    // 浅い板倉は玄関の板戸だけにする。内戸を置くと玄関の溝と重なる。
    const shallowStore = kind === 'kura' && d < 2.3;
    // 玄関の内寄りの溝と内戸の手前の溝の間にも、人が立てる幅を残す。
    // 高画質の戸は壁より室内へ出るため、元の入口幅では両方の戸に体が重なる。
    const cut = hd - (raisedTatami && !shallowStore ? Math.min(1.3, d * .4) : Math.min(1.1, d * .25));
    room(kind === 'kura' ? '兵糧の板倉' : kind === 'bansho' ? '番の控え' : kind === 'nagaya' ? '兵の休む板間' : '侍の控え', -hw, hw, -hd, cut, kind === 'tamari' ? 'tatami' : 'boards');
    room(kind === 'tamari' ? '入口の板間' : '入口の土間', -hw, hw, cut, hd, kind === 'tamari' ? 'boards' : 'earth');
    if (!shallowStore) cross(cut, -hw + .1, hw - .1, entryX, kind === 'tamari');
    // 兵糧蔵も土間から一段上げ、米俵を置く板床と入口を分ける推定復元。
    // 床・荷・引き戸で同じ高さを使う。
    // 遠侍の畳座敷も板敷きの入口から一段上げる推定。高画質の設営だけで指定する。
    const raised = ['kura', 'bansho', 'nagaya'].includes(kind) || kind === 'tamari' && raisedTatami;
    if (raised) {
      rooms[0].y = .16;
      if (!shallowStore) portals[portals.length - 1].sill = .16;
      for (const v of walls) v.sill = .16;
    }
    if (kind === 'tamari') {
      portals[portals.length - 1].kind = 'shoji';
      for (const v of walls) v.kind = 'shoji';
      if (raisedTatami) {
        // 遠侍の文机は推定のしつらえ。蓋箱と反対の右脇へ寄せる。
        // 二室に分ける時は、下で入口側の取次の間へ移す。
        // 既存の硯・紙付きの低い机を使い、畳面と絵・当たりの高さを揃える。
        props.push({ part: 'desk', x: hw - .8, z: -hd + .65,
          w: 1, d: .6, h: .4 });
        // 遠侍で控える侍の武具は奥壁の槍掛けへ納める推定のしつらえ。
        // 左の蓋箱の脇に収め、中央の障子口と裏の連子窓を空ける。
        props.push({ part: 'spearRack', x: -hw + 1.9, z: -hd + .35,
          w: .6, d: .3, h: 2.1 });
      }
      if (raisedTatami && cut + hd >= 3.4) {
        // 遠侍は入口の取次と奥の控えを襖で分ける推定復元。
        // 障子の入口は残し、両室とも同じ高さの畳座敷にする。
        // 等分すると取次が浅く、文机前の座が入口障子の溝へ寄りすぎる。
        // 奥の控えは一・四歩以上残し、取次に二十五センチを回す推定の間取り。
        const split = -hd + Math.max(1.4, (cut + hd) / 2 - .25), back = rooms[0];
        back.name = '奥の控え'; back.z1 = split;
        rooms.splice(1, 0, { ...back, name: '取次の間', z0: split, z1: cut });
        // 取次の文机を奥の控えに取り残さず、入口側の右脇へ納める。
        // 浅い机にして手前に座る余地を残し、前後の戸の溝と中央の通路を空ける。
        // 既存の文机を動かすだけにし、絵と当たりは同じ寸法を使う。
        const receptionDesk = props.find(p => p.part === 'desk');
        if (receptionDesk) {
          receptionDesk.d = .45;
          // 襖の二本の溝と当たりから机の背を三十センチ離す。
          // 手前には七十センチの座と、入口障子を開く余白を残す。
          receptionDesk.z = split + .3 + receptionDesk.d / 2;
        }
        const first = walls.length;
        cross(split, -hw + .1, hw - .1, entryX);
        portals[portals.length - 1].kind = 'fusuma';
        portals[portals.length - 1].sill = .16;
        for (let i = first; i < walls.length; i++) {
          walls[i].kind = 'fusuma'; walls[i].sill = .16;
        }
      }
    }
    if (kind === 'nagaya') {
      // 高画質の寝所は一人が横になれる長さを取り、奥壁から二十センチ控える。
      // 狭い板間では入口側の框まで二十センチ残し、寝具を土間や板戸へ出さない。
      // 敷物・木枕・掛け布と通路の当たりに同じ外寸を渡す。
      const beddingD = raisedTatami ? Math.min(1.8, cut + hd - .4) : 1.5;
      const beddingZ = raisedTatami ? -hd + .2 + beddingD / 2 : -hd + 1;
      for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: beddingZ, w: .75, d: beddingD, h: .12 });
      if (raisedTatami && w >= 8 && cut + hd >= 2.3) {
        // 長屋の私物の置き場は寝所脇の小さな蓋箱とする推定のしつらえ。
        // 寝具・奥壁の武具・中央の板戸から離し、床高と当たりも共有する。
        for (const x of [-hw + 1.95, hw - 1.95]) props.push({ part: 'chest',
          x, z: -hd + 1.25, w: .6, d: .45, h: .4 });
      }
      // 兵の宿の推定配置。矢箱は寝所の脇の奥壁へ寄せ、中央の通路と板戸の引き先を空ける。
      props.push({ part: 'ammo', x: hw - 2, z: -hd + .4, w: .8, d: .45, h: .35 });
    } else if (kind !== 'kura') {
      // 小さな番所は奥壁の矢箱と槍掛けが重なっていた。
      // 高画質では矢箱を左壁へ寄せ、隣の槍掛けと別々に納める。
      const compactAmmo = raisedTatami && kind === 'bansho';
      // 二室に分けた遠侍は蓋箱の前が襖まで五十センチしかない。
      // 浅い箱を奥壁から二十センチ控えて納め、開いた襖の前に立てる幅を取る。
      const compactChest = raisedTatami && kind === 'tamari' && rooms.length === 3;
      props.push({ part: kind === 'bansho' ? 'ammo' : 'chest',
        x: -hw + (compactAmmo ? .5 : .7), z: -hd + (compactChest ? .425 : .65),
        w: compactAmmo ? .6 : .8, d: compactChest ? .45 : .6, h: .65 });
    }
    // 高画質の蔵は米俵も間取りへ登録し、板床・当たり・兵の通路を揃える。
    // 米俵は左右の壁際へ一段ずつ納め、中央を荷運びの通路にする推定配置。
    if (kind === 'kura' && raisedTatami) {
      // 合図の小屋ほど浅い板倉は蓋箱だけにし、俵を戸の溝へはみ出させない。
      // 小屋でも中央と板戸の引き先を空ける。
      if (cut + hd < 2) props.push({ part: 'chest',
        x: hw - .55, z: -hd + .4, w: .65, d: .45, h: .5 });
      else for (const side of [-1, 1]) {
        // 狭い蔵は片側だけにし、俵の間に一・二歩以上の通路を保つ。
        if (side < 0 && w - 2 * (.7 + .75 / 2) < 1.2) continue;
        // 浅い蔵では三俵の列と開いた板戸の間が狭い。俵を潰して縮めず、
        // 二俵（さらに浅ければ一俵）の列にし、奥壁に二十センチ、手前に八十センチ取る。
        const boardDepth = cut + hd;
        const bales = boardDepth >= 2.64 ? 3 : boardDepth >= 2.1 ? 2 : 1;
        const baleDepth = .56 + (bales - 1) * .54;
        // 俵の下に湿気避けの敷木を八センチ取り、絵と当たりへ同じ高さを渡す。
        props.push({ part: 'riceBales',
          x: side * (hw - .7), z: -hd + .2 + baleDepth / 2,
          w: .75, d: baleDepth, h: .62, bales });
      }
    }
    if (kind === 'bansho') {
      // 小番所では大きな文机の前が板戸の溝へ重なり、座る薄縁を置けなかった。
      // 浅い文机を奥壁へ寄せ、座る場所と開いた板戸の間を空ける推定の納まり。
      // 建物全体の奥行きでなく、土間を除いた板間で判断する。
      // 通常の文机の前端から十センチ離して七十センチの座を取り、
      // その先にも板戸を扱う七十五センチを残せない時は浅い机にする。
      const deskFront = .65 + .7 / 2;
      const compactDesk = raisedTatami && cut + hd < deskFront + .1 + .7 + .75;
      // 小番所は奥行き三十五センチの文机へ納める。後ろの二十センチは
      // 保ち、手前に座る薄縁と板戸を扱う場所を取る。
      props.push({ part: 'desk', x: hw - (compactDesk ? .7 : .8),
        z: -hd + (compactDesk ? .375 : .65),
        w: compactDesk ? .9 : 1.2, d: compactDesk ? .35 : .7, h: .46 });
    }
    if (raisedTatami && ['bansho', 'nagaya'].includes(kind)) {
      // 武具は奥壁の浅い槍掛けへ寄せる推定配置。入口・板戸の引き先と寝所を空ける。
      // 同じ寸法を調度の絵と当たりへ渡し、兵が掛け台をすり抜けないようにする。
      // 番所は矢箱との間を空けた小幅の台。裏の連子窓（左右三十九センチ）も避ける。
      // 長屋の台は寝所から離した元の位置と幅を保つ。
      // 小番所では固定位置だと矢箱との隙間が十センチしかない。
      // 裏窓へ台を寄せず、矢箱の幅を詰めて二十五センチの余地を取る。
      // 箱の絵と当たりは同じ寸法を使う。
      const ammo = kind === 'bansho' ? props.find(p => p.part === 'ammo') : null;
      if (ammo) ammo.w = Math.min(ammo.w, Math.max(.3, 2 * (hw - 1.9)));
      props.push({ part: 'spearRack', x: kind === 'bansho' ? -.85 : -1.15,
        z: -hd + .35, w: kind === 'bansho' ? .6 : .8, d: .3, h: 2.1 });
    }
    if (raised) for (const p of props) p.y = .16;
  } else if (profile === 'toride') {
    // 墨俣の細部は推定。急設の兵舎・蔵・番所に屋敷の床の間や櫓の投石を置かない。
    if (kind === 'nagaya') {
      const cut = hd - .8;
      room('兵の休む板間', -hw, hw, -hd, cut, 'boards');
      room('入口の土間', -hw, hw, cut, hd, 'earth');
      cross(cut, -hw + .1, hw - .1, entryX, false);
      for (const x of [-hw + .65, hw - .65]) props.push({ part: 'bedding', x, z: -hd + .9, w: .7, d: 1.4, h: .12 });
    } else {
      room(kind === 'granary' ? '兵糧を置く板間' : kind === 'lumber' ? '材木の土間'
        : kind === 'bansho' ? '番兵の板間' : '普請の道具を置く土間', -hw, hw, -hd, hd,
        kind === 'granary' || kind === 'bansho' ? 'boards' : 'earth');
      props.push({ part: kind === 'granary' ? 'rice' : kind === 'lumber' ? 'timber' : kind === 'bansho' ? 'ammo' : 'desk',
        x: -hw + .65, z: -hd + .55, w: .85, d: .55, h: kind === 'workshop' ? .46 : .55 });
      if (kind === 'workshop') props.push({ part: 'chest', x: hw - .6, z: -hd + .5, w: .7, d: .5, h: .45 });
    }
  } else if (profile === 'okehazama' && kind === 'bansho') {
    // 桶狭間の詰所の室内図は残らない。兵の控えと小さな座敷を推定し、御殿の床の間・台所は置かない。
    const cut = -hd + d * .55;
    room('詰める座敷', -hw, hw, -hd, cut);
    room('板敷きの控え', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, entryX);
    props.push({ part: 'chest', x: -hw + .55, z: -hd + .45, w: .6, d: .4, h: .55 });
  } else if (kind === 'tenshu' || kind === 'yagura' || kind === 'gate') {
    room('武具の間', -hw, hw - hall, -hd, hd, 'boards');
    room('狭い廊下', hw - hall, hw, -hd, hd, 'boards');
    if (profile === 'yagura') {
      // 井楼の床は一間半ほど。箱を小さくし、中央と梯子の上り口を空ける。
      const narrow = w < 4 || d < 3;
      props.push({ part: 'ammo', x: -hw + .55, z: hd * .3, w: narrow ? .5 : .85, d: narrow ? .4 : .7, h: .55 });
      if (!narrow) props.push({ part: 'stones', x: -hw + .55, z: -hd + .6, w: .7, d: .6, h: .75 });
    } else {
      prop('ammo', -hw + .65, hd * .3);
      prop('stones', -hw + .65, -hd + .7);
    }
  } else if (profile === 'honnoji_kodo' && kind === 'hondo') {
    // 講堂の室内図は不明。奥に須弥壇、手前に聴聞の畳敷き、入口に板縁を置く推定復元。
    const cut = -hd + d * .42, entry = hd - 1.35;
    room('須弥壇のある内陣', -hw, hw, -hd, cut, 'boards');
    room('聴聞の外陣', -hw, hw, cut, entry);
    room('入口の板縁', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, hw * .5);
    portals[0].kind = 'koshi';
    for (const v of walls) v.kind = 'koshi';
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    props.push({ part: 'altar', x: 0, z: -hd + 1.1, w: 2.8, d: 1.3, h: 1.5 });
    // 読経の座は須弥壇の正面。礼盤と経机を内陣に納め、右手の格子戸と引き代を空ける（配置は推定）。
    // 礼盤を格子戸の溝から離し、読経の座の左に磬を掛ける台を置く（しつらえは推定）。
    // 内陣右手の戸口と引き込み先は空けたまま、経机との間隔を保つ。
    props.push({ part: 'sutraDesk', x: 0, z: cut - 1.45, w: .8, d: .35, h: .32 });
    props.push({ part: 'raiban', x: 0, z: cut - .7, w: .65, d: .55, h: .24 });
    props.push({ part: 'keiStand', x: -1.1, z: cut - .7, w: .45, d: .35, h: .7 });
  } else if (profile === 'honnoji_umaya' && kind === 'kura') {
    // 馬舎を僧の座敷にしない。馬のいない馬房と飼葉桶を奥へ寄せ、土間の横通路を空ける推定復元。
    const entry = hd - 1.2;
    room('馬房の土間', -hw, hw, -hd, entry, 'earth');
    room('世話をする土間の通路', -hw, hw, entry, hd, 'earth');
    cross(entry, -hw + .1, hw - .1, entryX, false);
    portals[0].kind = 'itado';
    for (const x of [-hw + 2, hw - 2]) props.push({ part: 'stall', x, z: -hd + 1.35, w: 3, d: 2, h: 1.2 });
  } else if (profile === 'honnoji_soshido' && kind === 'hondo') {
    // 祖師堂の室内図は不明。小堂の奥に祖師像、手前に参拝の板間を置く推定復元。
    // 須弥壇の前に立てる奥行きを取り、戸口の通路確保で祖師像が取り除かれないようにする。
    const cut = -hd + d * .56;
    room('祖師を祀る内陣', -hw, hw, -hd, cut, 'boards');
    room('参拝の外陣', -hw, hw, cut, hd, 'boards');
    // 共通の引き戸は開口幅の半分だけ左右へ滑る。小堂でも両脇に戸の引き込みを残す。
    cross(cut, -hw + .1, hw - .1, 0);
    // 内陣の境は格子戸。固定の格子と動く戸をそろえ、開けると祖師像が見える。
    portals[0].kind = 'koshi';
    for (const v of walls) v.kind = 'koshi';
    // 読経のしつらえは推定。須弥壇・経机・礼盤を左の同じ軸へ納め、
    // 中央の戸口と、その表裏を滑る格子戸の引き代を空ける。
    const altarX = -hw + 1.1;
    props.push({ part: 'altar', x: altarX, z: -hd + .65, w: 1.8, d: .75, h: 1.5 });
    props.push({ part: 'sutraDesk', x: altarX, z: cut - .89, w: .6, d: .35, h: .32 });
    props.push({ part: 'raiban', x: altarX, z: cut - .39, w: .5, d: .45, h: .24 });
    // 祖師堂にも読経の磬を備える（配置は推定）。礼盤の左へ小さく納め、
    // 経机・須弥壇と離し、中央の戸口と格子戸の引き代には置かない。
    // 講堂と同じ部品を使い、形と通行の当たりへ同じ寸法を渡す。
    props.push({ part: 'keiStand', x: altarX - .65, z: cut - .39, w: .45, d: .35, h: .7 });
  } else if (profile === 'honnoji_kuri' && kind === 'kuri') {
    // 室内図は不明。炊事は土間、配膳は板間とし、竈を戸口や通路に置かない推定復元。
    const entry = hd - 1.4;
    room('炊事の土間', -hw, hw, -hd, entry, 'earth');
    room('配膳の板間', -hw, hw, entry, hd, 'boards');
    // 土間より板間を上げ、炊事場と配膳の床を分ける（高さは推定）。
    // 床板・歩行面・柱脚はこの高さを共用する。
    rooms[1].y = .18;
    cross(entry, -hw + .1, hw - .1, entryX, false);
    portals[0].kind = 'itado';
    for (const x of [-hw + .9, -hw + 2]) props.push({ part: 'stove', x, z: -hd + .85, w: .85, d: .7, h: .9 });
    // 二基の竈の背後は板壁を露出させず、土塗りの火除け壁で受ける推定のしつらえ。
    // 背面の中央窓・柱の手前へ納め、釜との間と中央の通路を空ける。
    // 厚みも調度の当たりへ渡し、絵だけの壁をすり抜けないようにする。
    props.push({ part: 'hearthBacking', x: -hw + 1.6, z: -hd + .26, w: 2.5, d: .12, h: 1.8 });
    props.push({ part: 'toolbox', x: hw - .85, z: -hd + .8, w: 1.1, d: .65, h: .6 });
    // 水仕事の木の流しを竈と分け、右の壁際へ置く（調度の配置は推定）。
    props.push({ part: 'washbasin', x: hw - .85, z: -.3, w: 1.1, d: .65, h: .65 });
    // 配膳の板間には膳を納める開放棚を置く（しつらえは推定）。
    // 左の壁際へ寄せ、中央の板戸と表口の引き代を空ける。脚は上げた板床へ据える。
    props.push({ part: 'servingShelf', x: -hw + .7, z: entry + .7,
      y: rooms[1].y, w: .9, d: .55, h: 1 });
  } else if (['honnoji_kura', 'honnoji_umagura'].includes(profile) && kind === 'kura') {
    // 蔵の間取りは推定。板戸の手前を空け、奥の両脇に荷を置く。
    const horse = profile === 'honnoji_umagura', entry = hd - 1.1;
    room(horse ? '飼葉と馬具の板倉' : '道具の板倉', -hw, hw, -hd, entry, 'boards');
    room('入口の板間', -hw, hw, entry, hd, 'boards');
    cross(entry, -hw + .1, hw - .1, entryX, false);
    portals[0].kind = 'itado';
    for (const x of [-hw + .5, hw - .5]) props.push({ part: horse && x < 0 ? 'fodder' : 'toolbox', x, z: -hd + .8, w: .6, d: .9, h: .8 });
    // 馬具蔵は荷箱だけにせず、奥の中央に鞍と鐙を掛ける台を置く（推定）。
    if (horse) props.push({ part: 'saddleRack', x: 0, z: -hd + .7, w: 1.1, d: .8, h: 1.2 });
  } else if (profile === 'honnoji_naya' && kind === 'kura') {
    // 納屋を僧の畳座敷にしない。道具箱は奥の両脇に寄せ、入口から中央を通れる推定の間取り。
    const entry = hd - 1.1;
    room('道具を納める板間', -hw, hw, -hd, entry, 'boards');
    room('入口の板間', -hw, hw, entry, hd, 'boards');
    cross(entry, -hw + .1, hw - .1, entryX, false);
    portals[0].kind = 'itado';
    for (const x of [-hw + .45, hw - .45]) props.push({ part: 'storage', x, z: -hd + .55, w: .55, d: .65, h: .65 });
    // 納屋の用途が見えるよう鍬・鋤を壁際の掛け台へ納める（道具と配置は推定）。
    // 奥の木櫃、中央の通路、板戸の引き代から離し、見た目と通行で同じ外寸を使う。
    props.push({ part: 'farmToolRack', x: -hw + .36, z: -.45, w: .32, d: .85, h: 1.55 });
  } else if (profile === 'honnoji_kyozo' && kind === 'kura') {
    // 経蔵の室内図は不明。経巻棚のある板間と入口を板戸で分け、中央を通れる推定の間取り。
    const entry = hd - 1.1;
    room('経巻を納める板間', -hw, hw, -hd, entry, 'boards');
    room('入口の板間', -hw, hw, entry, hd, 'boards');
    cross(entry, -hw + .1, hw - .1, entryX, false);
    portals[0].kind = 'itado';
    for (const x of [-hw + .8, hw - .8]) props.push({ part: 'sutraShelf', x, z: -hd + .6, w: 1.1, d: .5, h: 1.65 });
    // 経蔵は棚だけの物置にせず、取り出した経巻を開く低い机を備える（しつらえは推定）。
    // 二堂と共通の経机・折本を使い、棚の手前と左右の通路、板戸の引き代を空ける。
    props.push({ part: 'sutraDesk', x: 0, z: -hd + 1.45, w: .9, d: .45, h: .36 });
  } else if (profile === 'honnoji_hojo' && kind === 'goten') {
    // 方丈の細かな間取りは推定。住持の座敷と応対の間を同じ床高でつなぎ、板縁の障子から入る。
    const cut = -hd + d * .44, entry = hd - 1.35;
    room('住持の座敷', -hw, hw, -hd, cut);
    // 御殿用の上段と歩行面を作らず、襖・畳・調度を同じ床高へそろえる。
    rooms[0].raised = false;
    room('応対の座敷', -hw, hw, cut, entry);
    room('板縁', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, entryX);
    portals[0].kind = 'fusuma';
    for (const v of walls) v.kind = 'fusuma';
    const first = walls.length;
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[1].kind = 'shoji';
    for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
    prop('alcove', hw - 1.4, -hd + .65);
    prop('desk', -hw + .85, -hd + 1.15);
    prop('storage', hw - .65, cut + .8);
  } else if (profile === 'honnoji_kyakuden' && kind === 'goten') {
    // 小さな客殿を大将の上段の間にしない。板縁から障子を開け、平らな畳の客座へ入る。
    const entry = hd - 1.1;
    room('客座', -hw, hw, -hd, entry);
    // 共通室内の上段で畳を覆わず、障子の敷居から平らな客座へ通す。
    rooms[0].raised = false;
    room('板縁', -hw, hw, entry, hd, 'boards');
    cross(entry, -hw + .1, hw - .1, entryX);
    portals[0].kind = 'shoji';
    for (const v of walls) v.kind = 'shoji';
    prop('alcove', -hw + 1.4, -hd + .65);
    // 客殿は床の間だけの空室にせず、客座の脇に脇息を据える（しつらえは推定）。
    // 床の間と反対の奥へ寄せ、中央の通路・障子の引き代を空ける。
    // 脚と畳の接地高、描く形と通行の当たりは同じ寸法を使う。
    props.push({ part: 'kyosoku', x: hw - .65, z: -hd + .9, w: .45, d: .8, h: .5 });
  } else if (kind === 'goten') {
    const cut = -hd + d * oku;
    // 稲葉山の縁側は玄関と広間の障子の溝の間に立てる幅を取る。
    // 高画質の戸は柱の内側を通るため、奥行きの二割だけでは浅くなる。
    const entryDepth = doorClearance && profile === 'iwamura' ? 1.8 : profile === 'inabayama' && raisedTatami
      ? Math.max(1.3, Math.min(1.5, d * .2)) : Math.min(1.5, d * .2);
    const entry = hd - entryDepth;
    room('上段の間', -hw, hw, -hd, cut);
    rooms[0].y = .16;
    room('広間', -hw, hw, cut, entry);
    room('廊下と縁側', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, profile === 'council' ? 0 : hw * .45);
    if (profile === 'inabayama') {
      // 上段の畳に襖を埋めず、敷居と戸の下端を上段の高さへ揃える。
      portals[portals.length - 1].sill = .16;
      for (const v of walls) v.sill = .16;
      if (raisedTatami) {
        // 主殿・山麓館の個別の襖絵は不明。金砂子の共通絵を復元扱いにせず、
        // 無地の和紙で推定する。固定戸と動く戸へ同じ種類を渡す。
        portals[portals.length - 1].kind = 'fusuma';
        for (const v of walls) v.kind = 'fusuma';
      }
    }
    cross(entry, -hw + .1, hw - .1, entryX, true, entryW);
    // 屋形の縁側から広間へは明かり障子、奥の座敷との境は襖。
    if (['honnoji_nijo', 'mikatagahara', 'arioka', 'nagashima', 'iwamura', 'takato', 'inabayama', 'tottori'].includes(profile)) {
      portals[portals.length - 1].kind = 'shoji';
      if (['honnoji_nijo', 'arioka', 'nagashima', 'takato', 'inabayama', 'tottori', 'iwamura'].includes(profile)) for (const v of walls) if (v.az === entry && v.bz === entry) v.kind = 'shoji';
    }
    // 御所の庭への口も共通の引き戸にする。口の両端は外壁なので幅を明示する。
    if (profile === 'honnoji_nijo') portals.push({ x: entryX, z: hd, axis: 'z', kind: 'shoji', l: entryX - 1.2, r: entryX + 1.2, exterior: true });
    prop('alcove', hw - 1.4, -hd + .55);
    prop('desk', -hw + .85, -hd + 1.15);
    if (profile === 'inabayama' && raisedTatami && w >= 8 && cut + hd >= 2) {
      // 執務の文机の背後に、文書を納める素木の二段棚を補う推定。
      // 引き出し箪笥を流用せず、机の背から三十センチ空け、奥壁際へ納める。
      props.push({ part: 'documentShelf', x: -hw + .85, z: -hd + .35,
        w: 1, d: .3, h: 1.05 });
    }
    if (profile === 'inabayama' && raisedTatami && w >= 8 && cut + hd >= 2) {
      // 主殿・山麓館の執務の場に、文書を納める蓋箱を添える推定のしつらえ。
      // 文机の右脇の奥壁へ寄せ、机前の座と上段への襖口を空ける。
      // 既存の蓋箱を使い、畳面と絵・当たりの高さを揃える。
      props.push({ part: 'chest', x: -hw + 2.1, z: -hd + .55,
        w: .7, d: .6, h: .45 });
    }
    for (const p of props) p.y = .16;
    if (doorClearance && profile === 'iwamura' && entry - cut >= 1.4 && w >= 9) {
      // 主殿の広間にも、控える兵の短槍掛けを推定配置する。
      // 上段の襖口と中央の障子口から離れた左壁へ寄せ、取次の通路を空ける。
      // 番所と同じ形を使い、窓の除け方・当たり・畳上の据付高も共通にする。
      props.push({ part: 'yariRack', x: -hw + .65, z: (cut + entry) / 2,
        w: .7, d: .6, h: 2.05 });
      // 主殿の広間には上段へ向く控えの座を二座だけ推定配置する。
      // 槍掛けとの間、正面の障子口、右手の上段の襖口を空ける。
      // 既存の薄い筵を共有し、下の床合わせと通路除けをそのまま使う。
      for (const x of [-3.1, -1.7]) {
        if (x - .35 < -hw + 1.3 || x + .35 > entryX - 1.05 - .3) continue;
        props.push({ part: 'sittingMat', x, z: (cut + entry) / 2,
          w: .7, d: .7, h: .025 });
      }
    }
  } else if (profile === 'iwamura_shrine' && kind === 'shrine') {
    // 社の内部は推定。住宅の床の間・かまどを置かず、板敷きの拝所と神座を板戸で分ける。
    const cut = -hd + d * .48;
    room('神座の板間', -hw, hw, -hd, cut, 'boards');
    room('拝む板間', -hw, hw, cut, hd, 'boards');
    // 開いた右の板戸も、外周の柱から三十センチ離れた所までに納める。
    cross(cut, -hw + .1, hw - .1, hw - (doorClearance ? 1.5 : 1.4), false, .6);
    props.push({ part: 'shinza', x: -.5, z: -hd + .65, w: 1.2, d: .65, h: 1.55 });
    // 神座の前に供物台を置く推定復元。高画質の社は奥行きも広げ、
    // 台の前端と間仕切りの間に七十センチを取り、右脇の板戸から回れるようにする。
    // 神座との間隔も保ち、絵・当たり・反転した戸口で同じ位置を使う。
    const offeringSetback = doorClearance ? .2 + .7 : .4;
    if (shrineOffering) props.push({ part: 'offering', x: -.5, z: cut - offeringSetback, w: .9, d: .4, h: doorClearance ? .8 : .65 });
  } else if (profile === 'anegawa' && kind === 'kura') {
    // 館の脇屋は物資を納める板倉として補う。兵の寝具や座敷は置かない。
    const cut = hd - Math.min(1.2, d * .3);
    room('物資を納める板間', -hw, hw, -hd, cut, 'boards');
    room('荷を運ぶ土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    // 収納箱だけの部屋にせず、兵糧を納める用途を俵で示す推定復元。
    // 奥の左右へ分け、板戸と荷運びの中央通路は空ける。
    props.push({ part: 'riceBales', x: -hw + .7, z: -hd + .7, w: .9, d: .8, h: .7 });
    // 奥の小荷は床置きの箱だけにせず、木棚の二段へ納める用途からの補い。
    // 元の箱と同じ幅・奥行きに収め、板戸と中央の荷運びの口は広げない。
    props.push({ part: 'supplyShelf', x: hw - .7, z: -hd + .7, w: .9, d: .8, h: 1.65 });
  } else if (profile === 'anegawa' && kind === 'bansho') {
    // 横山城の番小屋は用途からの推定。板敷きの控えと土間を板戸で分ける。
    const cut = hd - Math.min(1.2, d * .3);
    room('番の控えの板間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    props.push({ part: 'desk', x: -hw + .8, z: -hd + .6, w: .9, d: .5, h: .4 });
    // 矢を短い棒へ縮めず納める長箱。奥壁から二十センチ離し、戸の引き込みも空ける。
    props.push({ part: 'ammo', x: hw - .6, z: -hd + .725, w: .65, d: 1.05, h: .55 });
    // 番の弓を奥壁の棚へ納める推定。板戸から控えへ入る中央の通路を空ける。
    props.push({ part: 'bowRack', x: 0, z: -hd + .4, w: 1.35, d: .35, h: 1.9 });
  } else if (profile === 'anegawa' && kind === 'minka') {
    // 村の家は武家の床の間や兵の寝具を置かず、板間と炊事の土間を分ける。
    const cut = hd - Math.min(1.5, d * .32);
    room('家族の板間', -hw, hw, -hd, cut, 'boards');
    room('炊事の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
    props.push({ part: 'stove', x: hw - .7, z: hd - .65, w: .75, d: .65, h: .8 });
    // 炊事の水甕は竈と反対の土間隅へ。壁から二十二・五センチ離して納める。
    // 南の村の狭い家は戸口が左寄り。入口の余白へ甕が掛かると naka.js が
    // 調度ごと消すため、壁際へ十五センチ寄せ、戸口と板戸の引き込みを空ける。
    props.push({ part: 'waterJar', x: -hw + .5, z: hd - .6, w: .55, d: .55, h: .65 });
    props.push({ part: 'storage', x: -hw + .6, z: -hd + .6, w: .7, d: .65, h: .6 });
    // 板間の炉は暮らしの用途からの推定。戸口の正面と土間への上がり口を空ける。
    props.push({ part: 'hearth', x: -hw * .25, z: -hd + 1.2, w: .85, d: .85, h: .45 });
  } else if (profile === 'anegawa' && kind === 'hondo') {
    // 小堂の間取りは推定。須弥壇の前を内陣とし、右脇の口から出入りする。
    const cut = -hd + d * .48;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    // 遺構の実測ではなく用途に合わせた復元。須弥壇のある内陣を一段高くする。
    rooms[rooms.length - 1].y = .16;
    room('外陣', -hw, hw, cut, hd, 'boards');
    // 須弥壇は正面の戸口と同じ中心軸へ納め、拝む場所を左右へずらさない推定復元。
    // 内陣の脇口は右へ寄せる。cross が戸一枚分の引き込みと柱際の余白を保ち、
    // 須弥壇の前と脇口への通路を空ける。壇の寸法・高さと戸口の幅は変えない。
    cross(cut, -hw + .1, hw - .1, Math.min(hw * .5, hw - .1 - 1.3));
    props.push({ part: 'altar', x: 0, z: -hd + .65, y: .16, w: 1.8, d: .85, h: 1.2 });
    // 本尊へ向いて座る礼盤を用途から補う。壇の前卓から八センチ離し、
    // 内陣境にも十四センチを残せる堂だけに置く。脇口の通路は空ける。
    // 上がり床と同じ高さを絵・当たりへ渡し、既存の礼盤の形と材質を共用する。
    const seatDepth = .5, seatBack = -hd + .65 + .85 / 2 + .08;
    if (seatBack + seatDepth <= cut - .14) {
      props.push({ part: 'raiban', x: 0, z: seatBack + seatDepth / 2,
        y: .16, w: .8, d: seatDepth, h: .24 });
    }
  } else if (kind === 'chudo' || kind === 'hondo') {
    // 個別の室内図は残らない。板敷きの外陣と灯明のある内陣を推定し、左右に戦える口を残す。
    // 岩村の堂は須弥壇だけでなく、礼盤の前にも通れる板間を残す推定復元。
    // 高画質では礼盤の中心（一・八メートル）と半奥行き（三十センチ）の前へ
    // 一・一メートルを空ける。人の余白四十五センチを両側に取り、
    // 間仕切りと礼盤の当たりの厚みも除いて、壇の左右へ回れるようにする。
    const iwamura = profile === 'iwamura_hondo';
    const sanctuaryDepth = doorClearance ? 1.8 + .3 + 1.1 : .7 + .5 + 1.05 + .1;
    const cut = -hd + (iwamura ? Math.max(d * .48, sanctuaryDepth) : d * .38);
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    // 右脇の格子戸は二枚で幅一・三メートル。開いた二枚も外壁の内に収める。
    const doorX = iwamura ? Math.min(hw * .55, hw - (doorClearance ? .3 : .1) - 1.3) : hw * .5;
    if (profile === 'hieizan') {
      cross(cut, -hw + .1, 0, -hw * .55);
      cross(cut, 0, hw - .1, hw * .55);
    } else cross(cut, -hw + .1, hw - .1, doorX, true, iwamura ? .65 : null);
    prop('altar', iwamura ? -.35 : 0, -hd + (iwamura ? .7 : .85));
    // 岩村の堂は内陣を一段上げる推定復元。高画質だけで床・須弥壇・格子戸の敷居をそろえる。
    if (iwamura && doorClearance) {
      rooms[0].raised = true;
      rooms[0].y = .12;
      props[props.length - 1].y = rooms[0].y;
      // 堂の勤行の場は推定復元。須弥壇の前に低い礼盤を置き、
      // 右脇の格子戸・引込み先と壇の左右へ回る板間は空ける。
      // 見た目と当たりに同じ寸法・上げ床の高さを渡す。
      props.push({ part: 'raiban', x: -.35, z: -hd + 1.8,
        w: .7, d: .6, h: .22, y: rooms[0].y });
      // 礼盤から須弥壇へ向く小さな経机を推定配置。壇と礼盤の間に納め、
      // 壇の左右・磬子の脇・右の格子戸へ至る板間には張り出さない。
      props.push({ part: 'kyozukue', x: -.35, z: -hd + 1.35,
        w: .8, d: .2, h: .34, y: rooms[0].y });
      // 勤行用の磬子を礼盤の左脇へ置く推定復元。宗派固有の意匠は付けない。
      // 壇前と右脇の格子戸を空け、台も含む寸法を通行の当たりと共有する。
      props.push({ part: 'keisu', x: -1.15, z: -hd + 1.8,
        w: .36, d: .36, h: .48, y: rooms[0].y });
      // 外陣の礼拝座は薄い筵で推定復元。寝具の枕や内陣の礼盤は置かない。
      // 左側へ二座を並べ、正面の入口・右の内陣口・格子戸の引込み先を空ける。
      // 小堂でも筵の右端を中央から四十センチ離し、狭い堂へは無理に二座を置かない。
      // 共通の筵を使い回し、床高と通行の判断へも同じ寸法を渡す。
      for (let seat = 0; seat < 2; seat++) {
        const x = -hw + .65 + seat;
        if (x + .375 > -.4) break;
        props.push({ part: 'prayerMat', x, z: cut + .8,
          w: .75, d: 1, h: .025 });
      }
    }
    if (profile === 'hieizan') {
      // 個別の荘厳は断定せず、須弥壇の手前に供物を供える前卓を置く。
      // 脇口からの通路は空け、寸法を描画と調度の当たりで共有する。
      // 奥行き五・五メートルの小堂では、共通の前卓が内陣境の丸柱へ食い込む。
      // 須弥壇の前に七・五センチ、柱の背面に五センチを空けて奥行きを納める。
      // 香炉と四脚が収まる二十五センチ未満なら卓を置かず、須弥壇は残す。
      // 寸法は見た目と当たりで共有し、開いた脇戸の通路も保つ。
      const pillarBack = cut - HIEI_NAIJIN_POST_SETBACK - .14, raibanDepth = .65, clearance = .05;
      const offeringBack = -hd + 1.425;
      const offeringDepth = Math.min(.45, pillarBack - clearance - offeringBack);
      if (offeringDepth >= .25) props.push({
        part: 'offering', x: 0, z: offeringBack + offeringDepth / 2, w: 1.2, d: offeringDepth, h: .55,
      });
      // 本尊へ向かう僧の礼盤。前卓と内陣境の柱の間に納め、左右の脇口を空ける。
      // 焼失前の配置の復元とは断定せず、収まる奥行きの堂だけに置く。
      // 中央柱の実際の柱芯・半径から、礼盤の前に五センチの余白を残す。
      if (-hd + 2.3 + raibanDepth / 2 + clearance <= pillarBack) {
        // 奥行きのある堂は礼盤の前に経机を納める。前卓との間と左右の脇口を空ける。
        // 個別の配置は推定。狭い堂へ無理に足さず、描画と当たりに同じ寸法を渡す。
        // 固定の礼盤位置では、この戦の中堂にも経机が一つも置かれなかった。
        // 前卓から五センチ、経机と礼盤も五センチ離し、柱前の余白を保って納める。
        const deskDepth = .4, deskZ = -hd + 1.65 + .45 / 2 + .05 + deskDepth / 2;
        const seatZ = deskZ + deskDepth / 2 + .05 + raibanDepth / 2;
        const readingDesk = seatZ + raibanDepth / 2 + clearance <= pillarBack;
        props.push({ part: 'raiban', x: 0, z: readingDesk ? seatZ : -hd + 2.3, w: .8, d: raibanDepth, h: .28 });
        if (readingDesk) props.push({ part: 'kyozukue', x: 0, z: deskZ, w: .8, d: deskDepth, h: .5 });
      }
    }
  } else if (kind === 'kuri') {
    const hx = hw - Math.min(2.6, w * .38);
    room('炊事の土間', -hw, hx, -hd, hd, 'earth');
    room('食事の間', hx, hw, -hd, hd);
    if (d > 4) walls.push({ ax: hx, az: -hd + 1.5, bx: hx, bz: hd - 1.5, paper: false });
    prop('stove', -hw + .8, -hd + .85);
    prop('storage', hw - .65, -hd + .7);
    // 比叡山の庫裏の収納は食事の間の畳上へ載せる。土間の竈は上げない。
    // 描画と調度の当たりで同じ床高を使う。
    if (profile === 'hieizan') {
      props[props.length - 1].y = .06;
      // 灯明を床高・当たりと共有し、畳側の台を六センチ沈めない。
      for (const x of [-hw + .5, hw - .5]) props.push({
        part: 'tomyo', x, z: hd - .75, y: x > hx ? .06 : 0, w: .32, d: .32, h: .97,
      });
    }
  } else if (kind === 'sobo') {
    const cut = hd - Math.min(1.8, d * .3);
    room('僧の座敷', -hw, hw, -hd, cut);
    room('板敷きの入口', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0);
    prop('desk', -hw + .8, -hd + .8);
    prop('storage', hw - .65, -hd + .7);
  } else if (kind === 'temple') {
    const cut = hd - d * .3;
    room('本堂', -hw, hw - hall, -hd, cut, 'boards');
    room('庫裏', -hw, hw - hall, cut, hd, 'earth');
    room('回廊', hw - hall, hw, -hd, hd, 'boards');
    cross(cut, -hw, hw - hall, 0);
    prop('altar', 0, -hd + .75);
    prop('stove', -hw + .7, hd - .65);
  } else if (profile === 'mitsukuri' && (kind === 'bansho' || kind === 'kura')) {
    // 番所は板敷きの詰め場、蔵は荷を置く板床。屋敷の座敷・式台・台所は設けない。
    const cut = hd - Math.min(1.2, d * .3);
    room(kind === 'kura' ? '兵糧を置く間' : '見張りの詰め場', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, false);
  } else if (profile === 'kanegasaki' && ['bansho', 'kura', 'nagaya'].includes(kind)) {
    // 金ヶ崎の小屋は用途別の推定復元。中央の戸と通り道の両側へ荷・寝具を収める。
    const cut = hd - Math.min(.9, d * .3), sleeping = kind === 'nagaya', storage = kind === 'kura';
    room(sleeping ? '兵の寝る間' : storage ? '兵糧を置く間' : '番兵の控え', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    cross(cut, -hw + .1, hw - .1, entryX, sleeping);
    for (const sign of [-1, 1]) {
      const width = sleeping ? .75 : .65, depth = sleeping ? 1.5 : .5;
      props.push({ part: sleeping ? 'bedding' : storage ? 'storage' : sign < 0 ? 'ammo' : 'chest',
        x: sign * (hw - .2 - width / 2), z: -hd + .2 + depth / 2, w: width, d: depth, h: sleeping ? .12 : .65 });
    }
  } else if (kind === 'nagaya') {
    const cut = hd - Math.min(1.4, d * .3);
    room('兵の寝る間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    // 姉川の寝所と土間の板壁・引き戸は、下の共通の処理で一組だけ設ける。
    // ここでも作ると壁と戸が重なり、一組を開けても残りの戸が通路を塞ぐ。
    for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
    // 姉川の休息小屋の武具置き場は用途からの推定。寝所の間の奥壁へ弓掛けを置き、
    // 箱はその手前へ離す。筵・弓・箱を重ねず、板戸から寝所への通路も空ける。
    if (profile === 'anegawa') props.push({ part: 'bowRack', x: 0, z: -hd + .4, w: 1.35, d: .35, h: 1.9 });
    prop('chest', profile === 'anegawa' ? 0 : -hw + .6,
      profile === 'anegawa' ? -hd + 1.2 : cut - .5);
  } else if (kind === 'shrine') {
    const inabaShrine = profile === 'inabayama' && raisedTatami;
    // 小祠の玄関は室内側へ三十四センチ引いた溝を通る。
    // 拝所を深くし、閉じた玄関と神前の格子戸の間にも一人立てる幅を残す。
    const cut = profile === 'inabayama' && !inabaShrine ? .35 : 0;
    room('神前', -hw, hw, -hd, cut, 'boards');
    room('拝む所', -hw, hw, cut, hd, 'boards');
    if (profile === 'inabayama') {
      // 小祠の細かな姿は推定。神前を格子で区切り、中央の引き戸から手入れに入れる。
      cross(cut, -hw + .1, hw - .1, 0);
      portals[portals.length - 1].kind = 'koshi';
      for (const v of walls) v.kind = 'koshi';
    }
    // 小祠の供物台は浅くして奥へ寄せ、格子戸の前に立つ場所を残す。
    props.push({ part: 'offering', x: 0, z: -hd + (inabaShrine ? .35 : profile === 'inabayama' ? .45 : .65),
      w: 1.2, d: inabaShrine ? .3 : profile === 'inabayama' ? .35 : .5, h: inabaShrine ? 1.65 : .65 });
    if (profile === 'inabayama' && raisedTatami) {
      // 神前を拝所より一段上げる推定の納まり。供物台・格子戸・床で同じ高さを使う。
      rooms[0].y = .16;
      props[0].y = .16;
      portals[0].sill = .16;
      for (const v of walls) v.sill = .16;
    }
  } else if (['machiya', 'inn', 'toiya', 'shisha'].includes(kind)) {
    const front = kind === 'inn' ? .24 : kind === 'toiya' ? .55 : kind === 'shisha' ? .2 : .36;
    const cut = hd - d * front, hx = hw - hall;
    room(kind === 'inn' ? '泊まる座敷' : kind === 'toiya' ? '帳場の座敷' : kind === 'shisha' ? '使者の座敷' : '奥の間', -hw, hx, -hd, cut);
    room(kind === 'inn' ? '宿の入口' : kind === 'toiya' ? '荷の土間' : kind === 'shisha' ? '控えの間' : '店の間', -hw, hx, cut, hd, kind === 'toiya' ? 'earth' : 'boards');
    room('通り庭', hx, hw, -hd, hd, 'earth');
    cross(cut, -hw, hx, Math.min(0, hx - 1.1));
    prop('counter', -hw + .7, hd - .75);
    if (kind === 'shisha') prop('desk', -hw + .8, -hd + .8);
    else prop('stove', hw - hall / 2, -hd + .65);
  } else {
    const cut = hd - d * .3, hx = hw - hall;
    room('座敷', -hw, hx, -hd, cut);
    room('玄関と式台', -hw, hx, cut, hd, 'boards');
    room('台所の土間', hx, hw, -hd, hd, 'earth');
    cross(cut, -hw, hx, Math.min(0, hx - 1.1));
    prop('alcove', -hw + 1.4, -hd + .55);
    prop('stove', hw - hall / 2, -hd + .65);
  }
  // 三田村氏館と岩村の侍屋敷は、奥の襖と入口の障子で座敷・取次・板間を分ける推定復元。
  if (profile === 'anegawa' || profile === 'iwamura_yashiki') {
    if (kind === 'yashiki') {
      rooms.length = walls.length = props.length = portals.length = 0;
      // 岩村の侍屋敷も、入口の板戸と取次の障子の間を一・二メートル以上空ける。
      // 奥座敷と床の間は保ち、取次の一部を入口の板間へ充てる推定復元。
      const entryDepth = doorClearance && profile === 'iwamura_yashiki' ? 1.8 : 1.3;
      const cut = -hd + d * .42, entry = hd - entryDepth;
      room('奥の座敷', -hw, hw, -hd, cut);
      room('取次の座敷', -hw, hw, cut, entry);
      room('板敷きの入口', -hw, hw, entry, hd, 'boards');
      cross(cut, -hw + .1, hw - .1, 0);
      for (const v of walls) v.kind = 'fusumaE';
      const first = walls.length;
      cross(entry, -hw + .1, hw - .1, entryX);
      portals[portals.length - 1].kind = 'shoji';
      for (let i = first; i < walls.length; i++) walls[i].kind = 'shoji';
      prop('alcove', -hw + 1.4, -hd + .65);
      // 主屋の内高は二・三五メートル。床柱と落掛を竿縁天井の下に収める。
      if (profile === 'anegawa') props[props.length - 1].h = 2.1;
      prop('desk', hw - .9, -hd + 1.1);
      if (doorClearance && profile === 'iwamura_yashiki') {
        // 奥座敷の衣類・具足を収める長持を推定配置する。
        // 床の間の前を二十センチ、襖の手前を三十五センチ空ける。
        // 狭い座敷には置かず、既存の長持と畳面への床合わせを共有する。
        if (w >= 6 && cut - .95 >= -hd + 1.05) {
          props.push({ part: 'chest', x: -hw + .65, z: cut - .65,
            w: .8, d: .6, h: .65 });
        }
        // 文机の前に座れるよう、机を十センチ奥へ納める。
        // 後段の座の配置で、襖前の余白と畳面を共通に確かめる。
        props.find(p => p.part === 'desk').z = -hd + 1;
      }
      if (doorClearance && profile === 'iwamura_yashiki' && entry - cut >= 1.4 && w >= 5) {
        // 侍屋敷の取次にも武具置きを設ける推定復元。番所と同じ短槍掛けを使う。
        // 奥座敷の襖と入口の障子の引込み先を避け、壁際の畳へ載せる。
        props.push({ part: 'yariRack', x: hw - .65, z: (cut + entry) / 2,
          w: .7, d: .6, h: 2.05 });
        // 取次には客が控える筵の座を一座だけ置く推定復元。
        // 中央の襖・障子口と右の槍掛けを空け、既存の薄い筵を使い回す。
        const seatX = -hw + 1.4;
        if (seatX + .35 <= Math.min(0, entryX) - 1.05 - .3) {
          props.push({ part: 'sittingMat', x: seatX, z: (cut + entry) / 2,
            w: .7, d: .7, h: .025 });
        }
      }
      if (profile === 'anegawa') {
        // 畳の上面を板敷きの入口より一段上げる。足場・敷居・調度も同じ高さを使う。
        for (const r of rooms) if (r.floor === 'tatami') r.y = .16;
        for (const p of props) p.y = .16;
      }
    } else if (kind === 'nagaya') {
      cross(rooms[0].z1, -hw + .1, hw - .1, entryX, false);
    }
  }
  // 土間と回廊を区切る。前後に通れる口を残す。
  if (['temple', 'machiya', 'inn', 'toiya', 'shisha', 'yashiki'].includes(kind) && !['anegawa', 'iwamura_yashiki', 'iga', 'moribe', 'kizugawa'].includes(profile) && !(profile === 'arioka' && kind === 'temple')) {
    if (d > 4) walls.push({ ax: hw - hall, az: -hd + 1.5, bx: hw - hall, bz: hd - 1.5, paper: kind !== 'temple' });
  }
  // 指定の山城の室内は推定復元。土の曲輪に平屋の館を置き、中央を戦える広さに残す。
  if (profile && profile !== 'miki' && profile !== 'council' && profile !== 'nodafukushima' && profile !== 'honnoji_kyakuden' && profile !== 'honnoji_hojo' && profile !== 'honnoji_nijo' && kind === 'goten') {
    // 木ノ芽峠の陣城も板床の詰所。狭い奥の襖口に床の間を置かない。
    const military = profile === 'odani_kyogoku' || profile === 'mitsukuri' || profile === 'kinome' || profile === 'usayama' || profile === 'kanegasaki';
    rooms[0].raised = !military;
    rooms[0].y = military ? 0 : .16;
    rooms[0].name = military ? '控えの間' : '奥の座敷';
    if (military) {
      rooms[1].floor = 'boards'; rooms[1].name = '兵の広間';
      props.length = 0;
      props.push({ part: profile === 'usayama' ? 'desk' : 'ammo', x: -hw + .8, z: -hd + .65 });
      // 小さな詰所でも襖の奥に人一人ぶんの通り道を残す。箱の絵と当たりを同じ幅で縮める。
      const chestW = Math.min(1.1, Math.max(.1, hw - .2 - portals[0].x - .55));
      props.push({ part: 'chest', x: chestW < 1.1 ? hw - .2 - chestW / 2 : hw - .8, z: -hd + .65, w: chestW, d: .6, h: .75 });
    } else {
      for (const p of props) p.y = .16;
      // 大広間は集まる場所。屋敷には壁際の小さな炉と収納を置く。
      if (profile === 'odani_onogi' || profile === 'odani_akao') {
        props.push({ part: 'hearth', x: -hw + 1, z: hd - .75, w: .9, d: .8, h: .45 });
      }
      if (profile === 'inabayama' && raisedTatami) {
        // 主殿・山麓館の蓋箱は玄関障子の内側の溝から離す。
        // 元の奥行き六十センチでは、左右へ引いた戸が箱の前面へ食い込む。
        // 縁側と広間の障子の溝の間へ浅い箱を納め、絵と当たりを揃える。
        const entry = rooms[2];
        const back = entry.z0 + .12 + .06 + .08;
        const front = hd - .34 - .04 - .06 - .08;
        const depth = Math.min(.45, front - back);
        if (depth >= .25) props.push({ part: 'chest', x: hw - .75,
          z: (back + front) / 2, w: 1.1, d: depth, h: .75 });
      } else if (profile !== 'odani_hall') props.push({ part: 'chest', x: hw - .75, z: hd - .7, w: 1.1, d: .6, h: .75 });
    }
  }
  // 箕作の小さな番所と蔵に屋敷の床の間を置くと、襖の奥の通路を塞ぐ。
  // 用途に合う小さな荷を両脇に収め、襖を前後に通れる幅を残す。
  if (profile === 'mitsukuri' && (kind === 'bansho' || kind === 'kura')) {
    props.length = 0;
    props.push({ part: kind === 'kura' ? 'storage' : 'ammo', x: -hw + .65, z: -hd + .65, w: .8, d: .7, h: .7 });
    props.push({ part: 'chest', x: hw - .65, z: -hd + .65, w: .8, d: .7, h: .7 });
  }
  // 対象の城の調度も残す。鳥取には満ちた米俵を置かない。
  if (profile) {
    if (['arioka', 'tottori', 'takato', 'iwamura'].includes(profile) && kind === 'goten' && w >= 9 && d >= 6) prop('chest', -hw + .65, hd - .7);
    if (kind === 'machiya') prop('chest', -hw + .6, -hd + .65);
    if (profile === 'tottori') for (const p of props) if (p.part === 'ammo') p.part = 'chest';
  }
  if (profile === 'inabayama' && raisedTatami && kind === 'goten' && w >= 8) {
    // 主殿・山麓館の広間に、控える者の短槍を預ける場所を補う推定のしつらえ。
    // 奥座敷の執務道具とは分け、襖の手前の左脇へ既存の槍掛けを納める。
    // 玄関と障子口を結ぶ中央・戸の引き先を空け、上段でない畳面へ載せる。
    const hallRoom = rooms[1];
    if (hallRoom.z1 - hallRoom.z0 >= 1.7) props.push({ part: 'spearRack',
      x: -hw + .85, z: hallRoom.z0 + .6,
      w: .8, d: .3, h: 2.1, y: hallRoom.y || 0 });
  }
  // 野田福島の文机と食事の膳には座る敷物も備える推定復元。
  // 庫裏・民家の食事も低い筵を共用し、同じ部屋へ収まる時だけ敷く。
  // 戸口・家具の間を塞がず、室内を組む時だけ配置を決める。
  if (SETTINGS.quality === 'high' && profile === 'nodafukushima') {
    // 長屋・僧坊・民家の寝床も薄い筵。座る筵と同じく踏んで通れ、
    // 人の幅を足した見えない家具の当たりで板間や座敷を塞がない。
    // 描く敷物と巻いた掛け物は残し、歩行・兵の経路・立ち所へ同じ指定を渡す。
    for (const p of props) if (p.part === 'bedding' && ['nagaya', 'sobo', 'minka'].includes(kind)) p.walkable = true;
    const seats = [];
    for (const desk of props) {
      const room = rooms.find(r => desk.x >= r.x0 && desk.x <= r.x1 && desk.z >= r.z0 && desk.z <= r.z1);
      // 御影堂の外陣も僧坊と同じ筵で読経の席を整える推定復元。
      // 内陣の経卓には礼盤があるので重ねず、畳の外陣だけに置く。
      const prayerSeat = desk.part === 'sutraDesk'
        && (kind === 'sobo' || kind === 'hondo' && room?.floor === 'tatami');
      if (desk.part !== 'writingDesk' && desk.part !== 'mealTray'
        && !prayerSeat) continue;
      const seat = { part: 'sittingMat', x: desk.x, z: desk.z + desk.d / 2 + .4,
        w: .65, d: .55, h: .018, walkable: true };
      if (!room || seat.x - seat.w / 2 < room.x0 + .25 || seat.x + seat.w / 2 > room.x1 - .25
        || seat.z + seat.d / 2 > room.z1 - .25) continue;
      if (props.some(p => p !== desk && Math.abs(p.x - seat.x) < (p.w + seat.w) / 2 + .15
        && Math.abs(p.z - seat.z) < (p.d + seat.d) / 2 + .15)) continue;
      seats.push(seat);
    }
    props.push(...seats);
  }
  // 調度の寸法は見た目・当たり・通路の判断で共有する。
  // 姉川の民家・番小屋・兵の宿は土間から板間へ一段上がる推定復元。
  // 床と調度の高さを共有し、足場と板の絵を同じ位置へ置く。
  if (profile === 'anegawa' && ['minka', 'bansho', 'nagaya', 'kura'].includes(kind)) {
    for (const r of rooms) if (r.floor === 'boards') r.y = .16;
    for (const p of props) {
      const r = rooms.find(r => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
      p.y = r?.y || 0;
    }
  }
  for (const p of props) {
    // 比叡山の須弥壇は天蓋までを当たりに含める。描く時もこの高さへ揃える。
    if (profile === 'hieizan' && p.part === 'altar') p.h ??= 2.27;
    p.w ??= p.part === 'alcove' ? 2.3 : p.part === 'altar' ? 2.1 : p.part === 'desk' ? 1.2 : p.part === 'counter' ? 1.1 : .85;
    p.d ??= p.part === 'alcove' ? .85 : p.part === 'altar' ? 1 : .7;
    p.h ??= p.part === 'alcove' ? 2.5 : p.part === 'altar' ? 1.5 : p.part === 'desk' ? .46 : p.part === 'stove' ? .9 : p.part === 'storage' ? .8 : p.part === 'chest' ? .7 : .55;
    if (profile === 'hieizan' && p.part === 'altar') {
      // 瑠璃堂・恵心堂は幅六メートル。共通幅の壇では脇口の立ち所へ
      // 張り出し、下の通路整理で本尊ごと消えていた。左右各五センチの
      // 余白を残す幅へ納め、描く壇・天蓋・当たりにも同じ寸法を渡す。
      for (const v of portals) {
        if (Math.abs(p.z - v.z) >= p.d / 2 + 1.05) continue;
        p.w = Math.min(p.w, Math.max(.1, (Math.abs(p.x - v.x) - .5) * 2));
      }
    }
    // 狭い建物でも家具の外側を壁の中へ収める。寸法は絵と当たりの両方へ渡す。
    p.w = Math.min(p.w, Math.max(.1, w - .4));
    p.d = Math.min(p.d, Math.max(.1, d - .4));
    // 伊賀の床の間は家具の離隔を取らず、外周の内壁へ接続する。
    const margin = profile === 'iga' && p.part === 'alcove' ? .06 : .2;
    p.x = Math.max(-hw + margin + p.w / 2, Math.min(hw - margin - p.w / 2, p.x));
    p.z = Math.max(-hd + margin + p.d / 2, Math.min(hd - margin - p.d / 2, p.z));
    if (profile === 'anegawa' && kind === 'yashiki' && p.part === 'alcove') {
      // 床の間は置き家具にせず、背板と袖壁を座敷の内壁面へ納める。
      // 寸法は変えず、絵・当たり・畳の敷き止めで同じ外寸を使う。
      p.x = -hw + .1 + p.w / 2;
      p.z = -hd + .1 + p.d / 2;
    }
    // 主殿・山麓館の床の間は据え付け。家具用の二十センチの余白を
    // 奥へ残すと床柱と背板が室内に浮くため、背面を奥壁の内面へ合わせる。
    // 奥壁の厚さ六センチの半分だけ控え、絵と当たりを一緒に動かす。
    if (profile === 'inabayama' && raisedTatami && kind === 'goten' && p.part === 'alcove') {
      // 脇も壁へ納め、床柱の外側に家具用の隙間を残さない。
      p.x = hw - .03 - p.w / 2;
      p.z = -hd + .03 + p.d / 2;
    }
    // 本能寺の床の間は置き家具の余白を取らず、奥壁と脇壁へ納める（位置は推定）。
    // 裏や脇に細い畳の隙間を残さず、当たり・床・天井の切り欠きも同じ外形を使う。
    if (p.part === 'alcove' && ['honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo'].includes(profile)) {
      p.x = (p.x < 0 ? -1 : 1) * (hw - p.w / 2);
      p.z = -hd + p.d / 2;
    }
    // 本能寺の座敷・二条御所の調度は、床組でなく畳縁の上面へ据える。
    // 床の間も床框の下部を畳へ埋めない。造り付けの柱・側壁は描く側で
    // 据付高を差し引いて天井へ納め、絵と当たりには同じ床高を渡す。
    if (['honnoji_sobo', 'honnoji_hojo', 'honnoji_kyakuden', 'honnoji_nijo'].includes(profile)
      && ['desk', 'storage', 'alcove', 'foldedBedding', 'kyosoku'].includes(p.part)) {
      const r = rooms.find(r => r.floor === 'tatami'
        && p.x - p.w / 2 >= r.x0 && p.x + p.w / 2 <= r.x1
        && p.z - p.d / 2 >= r.z0 && p.z + p.d / 2 <= r.z1);
      if (r) p.y = (r.y || 0) + .066;
    }
    if (profile === 'honnoji_kuri' || profile === 'honnoji_umaya') {
      // 土間の仕上げは床組より二・五五センチ高い。竈・流し・馬房の脚を埋めない。
      // 調度を全て収められる土間だけを選び、絵と当たりへ同じ据付高を渡す。
      const r = rooms.find(r => r.floor === 'earth'
        && p.x - p.w / 2 >= r.x0 && p.x + p.w / 2 <= r.x1
        && p.z - p.d / 2 >= r.z0 && p.z + p.d / 2 <= r.z1);
      if (r) p.y = (r.y || 0) + .0255;
    }
    if (profile === 'honnoji_umaya' && p.part === 'stall') {
      // 馬房の前は開いている。四辺を一つの箱で塞がず、横桟と飼葉桶だけを避ける。
      // 絵と同じ寸法を設営時に一度作り、通行・経路・立ち所で共有する。
      p.solids = [-1, 1].map(side => ({ x: p.x + side * (p.w / 2 - .06), z: p.z,
        w: .12, d: p.d, h: p.h, y: p.y || 0 }));
      p.solids.push({ x: p.x, z: p.z - p.d / 2 + .3,
        w: p.w - .3, d: .55, h: .6, y: p.y || 0 });
    }
    // 岩村の床の間は置き家具ではなく、奥壁と側壁へ取り付く造作として納める推定復元。
    // 家具用の余白を残すと背後に二十センチ、脇に二十五センチほどの隙間ができる。
    // 天井の切欠き・窓の除外・当たりも、この同じ位置を使う。
    if (doorClearance && p.part === 'alcove'
      && (profile === 'iwamura' && kind === 'goten' || profile === 'iwamura_yashiki' && kind === 'yashiki')) {
      p.x = (p.x < 0 ? -1 : 1) * (hw - p.w / 2);
      p.z = -hd + p.d / 2;
    }
  }
  // 岩村の座敷の文机には薄い筵の座を添える推定復元。
  // 机から十五センチ離し、奥座敷の内に収まる時だけ敷く。
  // 座敷の襖前へ張り出さず、据付高は下で畳の仕上げ面へそろえる。
  if (doorClearance && (profile === 'iwamura' && kind === 'goten'
    || profile === 'iwamura_yashiki' && kind === 'yashiki')) {
    const seats = [];
    for (const p of props) if (p.part === 'desk') {
      const z = p.z + p.d / 2 + .15 + .35;
      const upper = rooms[0];
      if (p.x - .35 < upper.x0 + .2 || p.x + .35 > upper.x1 - .2
        || z + .35 > upper.z1 - .1) continue;
      seats.push({ part: 'sittingMat', x: p.x, z, w: .7, d: .7, h: .025 });
    }
    props.push(...seats);
  }
  // 襖の口と前後の立ち所を全ての建物で空ける。調度の絵と当たりは同じ並びを使う。
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    // 浅い小祠は供物台を奥壁へ寄せた実寸で見る。格子戸の溝と人の幅を
    // 空けた台まで、広い堂用の余白で消さない。絵と当たりは同じ台を使う。
    const clearance = profile === 'inabayama' && raisedTatami && kind === 'hondo' && p.part === 'raiban' ? .7
      : profile === 'inabayama' && raisedTatami && kind === 'shrine' && p.part === 'offering' ? .8 : 1.05;
    if (portals.some(v => Math.abs(p.x - v.x) < p.w / 2 + .45
      && Math.abs(p.z - v.z) < p.d / 2 + clearance)) props.splice(i, 1);
  }
  if (profile?.startsWith('honnoji_') && profile !== 'honnoji_nijo') {
    if (profile === 'honnoji_kuri') {
      // 上がり框の上面と板戸の敷居を板間へそろえる。
      const sill = rooms[1].y - .04;
      for (const v of walls) v.floorY = sill;
      for (const p of portals) p.floorY = sill;
    }
    // 畳縁の上面は床組から六・六センチ。敷居の上面とそろえ、下框を畳へ埋めない。
    // 板間同士の境は元の四センチの敷居を保つ。絵と動く戸・当たりで同じ高さを使う。
    const tatamiEdge = (z, x0, x1) => rooms.some(r => r.floor === 'tatami'
      && (Math.abs(r.z0 - z) < .01 || Math.abs(r.z1 - z) < .01)
      && r.x1 > x0 && r.x0 < x1);
    for (const v of walls) if (Math.abs(v.az - v.bz) < .01
      && tatamiEdge(v.az, Math.min(v.ax, v.bx), Math.max(v.ax, v.bx))) v.floorY = .026;
    for (const p of portals) if (tatamiEdge(p.z, p.x - .01, p.x + .01)) p.floorY = .026;
  }
  if (profile === 'honnoji_nijo') {
    // 御所も畳縁の上面まで敷居を上げる。上段・広間・板縁の境で、
    // 高い側の畳に下框が埋まらない高さを固定の襖と動く戸へ共有する。
    const sillFloor = (z, x0, x1) => rooms.reduce((y, r) => r.floor === 'tatami'
      && (Math.abs(r.z0 - z) < .01 || Math.abs(r.z1 - z) < .01)
      && r.x1 > x0 && r.x0 < x1 ? Math.max(y, (r.y || 0) + .026) : y, 0);
    for (const v of walls) if (Math.abs(v.az - v.bz) < .01)
      v.floorY = sillFloor(v.az, Math.min(v.ax, v.bx), Math.max(v.ax, v.bx));
    for (const p of portals) if (!p.exterior) p.floorY = sillFloor(p.z, p.x - .01, p.x + .01);
  }
  // 岩村の社は拝所から神座へ、用屋は土間から板間へ一段上がる推定復元。
  // 神座・供物台も上の床へ載せ、床と調度・板戸の敷居をそろえる。
  const raisedShrine = doorClearance && profile === 'iwamura_shrine' && kind === 'shrine';
  const raisedUtility = doorClearance && profile === 'iwamura_' + kind && ['kura', 'bansho', 'nagaya'].includes(kind);
  if (raisedUtility || raisedShrine) {
    rooms[0].raised = true;
    rooms[0].y = .12;
    for (const p of props) p.y = rooms[0].y;
  }
  // 岩村の調度は上げ床を決めた後、歩く面と同じ仕上げ厚へ載せる。
  // 須弥壇・礼盤・神座や用屋の荷を床板へ埋めず、土間の荷にも板間の高さを持ち込まない。
  // 床の間は建物の造作なので動かさない。設営時だけ絵と当たりの共通座標を直す。
  const floorAligned = doorClearance && (['iwamura', 'iwamura_yashiki', 'iwamura_hondo'].includes(profile)
    || raisedUtility || raisedShrine);
  if (floorAligned) {
    for (const p of props) if (p.part !== 'alcove') {
      const floor = rooms.find(r => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
      if (floor) p.y = (floor.y || 0)
        + (floor.floor === 'tatami' ? .066 : floor.floor === 'earth' ? .0255 : boardFinish);
    }
  }
  // 岩村の主殿の奥座敷・堂の内陣・社の神座は一段高い。引き戸と敷居にも同じ床高を渡す。
  // 反転前の境を使い、入口側の障子は板間の高さのままにする。
  if ((profile === 'iwamura' && kind === 'goten') || (profile === 'iwamura_hondo' && kind === 'hondo' && doorClearance) || raisedUtility || raisedShrine) {
    const upper = rooms[0];
    for (const v of walls) if (Math.abs(v.az - upper.z1) < .01 && Math.abs(v.bz - upper.z1) < .01) v.sill = upper.y;
    for (const p of portals) if (Math.abs(p.z - upper.z1) < .01) p.sill = upper.y;
  }
  // 岩村の座敷は畳縁の上端（六・六センチ）へ敷居を合わせる。
  // 敷居自体の厚さ四センチを引いた高さを、固定側と滑る戸の両方へ渡す。
  // 上段の床高も含め、板間との境でも下框を畳へ埋めない。
  if (doorClearance && ['iwamura', 'iwamura_yashiki'].includes(profile)) {
    const sillAt = z => {
      let height = 0;
      for (const r of rooms) if (r.floor === 'tatami'
        && (Math.abs(r.z0 - z) < .01 || Math.abs(r.z1 - z) < .01)) {
        height = Math.max(height, (r.y || 0) + .066 - .04);
      }
      return height;
    };
    for (const v of walls) if (Math.abs(v.az - v.bz) < .01) v.sill = Math.max(v.sill || 0, sillAt(v.az));
    for (const p of portals) p.sill = Math.max(p.sill || 0, sillAt(p.z));
  }
  if (side < 0) {
    for (const r of rooms) { const a = r.z0; r.z0 = -r.z1; r.z1 = -a; }
    for (const v of walls) { v.az *= -1; v.bz *= -1; }
    for (const p of props) {
      p.z *= -1; p.rot = profile === 'nodafukushima' ? Math.PI - (p.rot || 0) : (p.rot || 0) + Math.PI;
      if (p.solids) for (const v of p.solids) v.z *= -1;
    }
    for (const p of portals) p.z *= -1;
  }
  return { kind, profile, rooms, walls, props, portals, floorAligned, boardFinish, dim: kind === 'tenshu' || kind === 'yagura' || kind === 'gate' ? .42 : .68 };
}

// 窓の腰高は、畳だけでなく板敷きも歩く仕上げ面から測る。
// 岩村の外観と室内で同じ計算を使い、内陣・神座の上げ床にもそろえる。
export function interiorWindowFloorY(layout, room) {
  return (room?.y || 0) + (room?.floor === 'tatami' ? .066
    : layout.floorAligned && room?.floor === 'boards' ? layout.boardFinish : 0);
}

// 岩村の側面の明かり障子は部屋ごとに納める推定復元。
// 縁側との間仕切りや柱へ窓枠が食い込まないよう、両端に二十五センチ残す。
// 床の間に重なる窓を丸ごと消さず、同じ部屋の空いた壁へ寄せる推定復元。
// 外壁の穴・内壁の穴・滑る障子に同じ割付を渡す。設営時に一度だけ作る。
export function interiorSideShojiWindows(layout) {
  const residence = ['goten', 'yashiki'].includes(layout.kind), wins = [];
  for (const room of layout.rooms) {
    if (residence && room.floor !== 'tatami') continue;
    // 岩村の上段・内陣は、その部屋の床から窓の腰と鴨居を測る推定復元。
    // 座敷は畳の仕上げ面から測る。上段の板床高だけでは腰も鴨居も六・六センチ低くなる。
    // 外壁の開口と可動障子へ同じ高さを渡し、下の床の窓割りを持ち込まない。
    const floorY = interiorWindowFloorY(layout, room);
    const y0 = floorY + .7, y1 = floorY + 1.9;
    for (const side of [-1, 1]) {
      let spans = [[room.z0 + .25, room.z1 - .25]];
      for (const p of layout.props) {
        if (!['alcove', 'altar', 'shinza', 'yariRack'].includes(p.part)) continue;
        const wall = side < 0 ? -room.x0 : room.x1;
        // 槍掛けは壁から三十センチ内の障子の筋にも届く。手を掛ける余白も残す。
        const clearance = p.part === 'yariRack' ? .45 : .3;
        if (wall - (side * p.x + p.w / 2) >= clearance
          || y0 >= (p.y || 0) + p.h + .12 || y1 <= (p.y || 0)) continue;
        // 窓枠の余白も造作から離す。反転した間取りも同じ範囲で切り分ける。
        const low = p.z - p.d / 2 - .14, high = p.z + p.d / 2 + .14;
        spans = spans.flatMap(([a, b]) => high <= a || low >= b ? [[a, b]]
          : [[a, Math.min(b, low)], [Math.max(a, high), b]].filter(([x, z]) => z > x));
      }
      // 一室一面に一窓を保ち、六十センチの内法を取れる壁だけに納める。
      const span = spans.reduce((best, v) => !best || v[1] - v[0] > best[1] - best[0] ? v : best, null);
      if (!span || span[1] - span[0] < .6) continue;
      const width = Math.min(1.4, span[1] - span[0]);
      const center = Math.max(span[0] + width / 2,
        Math.min(span[1] - width / 2, (room.z0 + room.z1) / 2));
      wins.push({ face: 'x', s: side, t: center, w: width, y0, y1, shoji: true });
    }
  }
  return wins;
}

// 床の間・須弥壇・神座の背後は壁で受ける推定復元。窓枠にも余裕を残す。
// 外壁・内壁・動く障子へ渡す前に同じ窓を除き、片側だけ穴が残ることを防ぐ。
export function interiorWindowsClearOfFittings(layout, windows) {
  const hw = Math.max(...layout.rooms.map(r => r.x1));
  const hd = Math.max(...layout.rooms.map(r => r.z1));
  // 八幡の社は神座を窓のない奥の室として推定復元し、拝所だけから採光する。
  // 神座の脇と背後まで住宅用の明かり障子・連子窓にしない。
  // 反転した戸口にも対応し、外壁・内壁・可動障子へ渡す前に同じ開口を除く。
  const sanctuary = layout.profile === 'iwamura_shrine' && layout.kind === 'shrine' ? layout.rooms[0] : null;
  return windows.filter(win => {
    if (sanctuary) {
      const side = win.face === 'x', wall = win.s * (side ? hw : hd);
      const normal0 = side ? sanctuary.x0 : sanctuary.z0;
      const normal1 = side ? sanctuary.x1 : sanctuary.z1;
      const along0 = side ? sanctuary.z0 : sanctuary.x0;
      const along1 = side ? sanctuary.z1 : sanctuary.x1;
      if (wall >= normal0 - .01 && wall <= normal1 + .01
        && win.t + win.w / 2 > along0 && win.t - win.w / 2 < along1) return false;
    }
    return !layout.props.some(p => {
      if (!['alcove', 'altar', 'shinza', 'yariRack'].includes(p.part)) return false;
      const side = win.face === 'x';
      const along = side ? p.z : p.x, width = side ? p.d : p.w;
      const normal = side ? p.x : p.z, depth = side ? p.w : p.d;
      const wall = side ? hw : hd, bottom = p.y || 0;
      // 側面で寄せられない窓や裏窓も、槍掛けと滑る戸が重なる開口を残さない。
      const clearance = p.part === 'yariRack' ? .45 : .3;
      return wall - (win.s * normal + depth / 2) < clearance
        && Math.abs(win.t - along) < (win.w + width) / 2 + .12
        && win.y0 < bottom + p.h + .12 && win.y1 > bottom;
    });
  });
}

// 灯明台は調度・建具・上がり框を避け、元の部屋の中へ納める。室内の設営時だけ探す。
export function interiorLampSpot(layout, x, z, out, doors = []) {
  const room = layout.rooms.find(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  if (!room) return false;
  const clear = (px, pz) => {
    if (px < room.x0 + .24 || px > room.x1 - .24 || pz < room.z0 + .24 || pz > room.z1 - .24) return false;
    if (layout.props.some(p => Math.abs(px - p.x) < p.w / 2 + .24 && Math.abs(pz - p.z) < p.d / 2 + .24)) return false;
    // 戸口と左右の引き込みを一緒に空ける。外戸も同じ局所座標で調べる。
    if (doors.some(d => Math.abs(px - d.lx) < d.W + .26 && Math.abs(pz - d.lz) < .42)) return false;
    return !layout.walls.some(v => {
      const dx = v.bx - v.ax, dz = v.bz - v.az, len = dx * dx + dz * dz;
      const t = len ? Math.max(0, Math.min(1, ((px - v.ax) * dx + (pz - v.az) * dz) / len)) : 0;
      return Math.hypot(px - v.ax - dx * t, pz - v.az - dz * t) < .24;
    });
  };
  out.x = x; out.z = z;
  if (clear(x, z)) return true;
  let best = Infinity;
  const nx = Math.max(1, Math.ceil((room.x1 - room.x0 - .48) / .35));
  const nz = Math.max(1, Math.ceil((room.z1 - room.z0 - .48) / .35));
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const px = room.x0 + .24 + ix * (room.x1 - room.x0 - .48) / nx;
    const pz = room.z0 + .24 + iz * (room.z1 - room.z0 - .48) / nz;
    if (!clear(px, pz)) continue;
    const distance = (px - x) ** 2 + (pz - z) ** 2;
    if (distance < best) { best = distance; out.x = px; out.z = pz; }
  }
  return Number.isFinite(best);
}

// 設楽原の小堂の置き畳。見た目と歩行面で、位置・向き・置けない条件まで共有する。
// 設営時だけ呼び、中央の参道と格子戸の引き込み先を空ける。
export function shitaragaharaTempleMats(layout) {
  const mats = [];
  if (layout.profile !== 'shitaragahara' || layout.kind !== 'hondo') return mats;
  // 回転した置き畳と調度の外寸で判定する。絵と足場は採用した畳だけを共用する。
  const extent = (w, d, rot = 0) => {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    return { x: (w * c + d * s) / 2, z: (w * s + d * c) / 2 };
  };
  const put = (m, room, skip = null) => {
    const e = extent(m.w, m.d, m.rot);
    if (m.x - e.x < room.x0 + .1 || m.x + e.x > room.x1 - .1
        || m.z - e.z < room.z0 + .3 || m.z + e.z > room.z1 - .3) return;
    if (layout.props.some(p => {
      if (p === skip) return false;
      const f = extent(p.w, p.d, p.rot);
      return Math.abs(m.x - p.x) < e.x + f.x + .08
        && Math.abs(m.z - p.z) < e.z + f.z + .08;
    })) return;
    // 格子戸の前と引き込み先には畳を置かず、敷居の脇を板床のまま通れるようにする。
    if ((layout.portals || []).some(p => Math.abs(m.x - p.x) < e.x + 2.1
      && Math.abs(m.z - p.z) < e.z + .31)) return;
    mats.push(m);
  };
  const inner = layout.rooms.find(r => r.name === '内陣');
  const desk = layout.props.find(p => p.part === 'sutraDesk');
  if (inner && desk) {
    const rot = desk.rot || 0, half = .45, offset = desk.d / 2 + .08 + half;
    const x = desk.x + Math.sin(rot) * offset, z = desk.z + Math.cos(rot) * offset;
    put({ x, z, w: half * 2, d: half * 2, rot, y: inner.y || 0, name: '内陣の僧座の畳' }, inner, desk);
  }
  const outer = layout.rooms.find(r => r.name === '外陣');
  if (outer && outer.x1 - outer.x0 >= 6 && outer.z1 - outer.z0 >= 2.2) {
    const cx = (outer.x0 + outer.x1) / 2, centerZ = (outer.z0 + outer.z1) / 2;
    // 入口の板戸は外壁より内側へ引く。中央寄せの畳では、開いた戸と敷居へ
    // 角が食い込むため、溝の見込み十一センチと八センチの余白を空ける。
    // 入口が裏向きでも同じ側へ寄せ、絵と歩行面でこの位置を共用する。
    const side = inner && centerZ < (inner.z0 + inner.z1) / 2 ? -1 : 1;
    const front = side > 0 ? outer.z1 : -outer.z0;
    const cz = side * Math.min(side * centerZ,
      front - shitaragaharaEntryInset(layout.kind) - .11 - .08 - .45);
    for (const side of [-1, 1]) put({ x: cx + side * 1.9, z: cz,
      w: .9, d: 1.8, rot: Math.PI / 2, y: outer.y || 0, name: '外陣の拝礼畳' }, outer);
  }
  return mats;
}

export function interiorFloorAt(layout, x, z) {
  for (const r of layout.rooms) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.floor;
  return 'boards';
}

// 壁と家具の周りの通路を設営時に作る。毎コマは既存の点と距離だけを使う。
function pathClear(rects, x, z, tx, tz) {
  const dx = tx - x, dz = tz - z;
  for (const r of rects) {
    let lo = 0, hi = 1;
    if (Math.abs(dx) < 1e-8) { if (x <= r.x0 || x >= r.x1) continue; }
    else { const a = (r.x0 - x) / dx, b = (r.x1 - x) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (Math.abs(dz) < 1e-8) { if (z <= r.z0 || z >= r.z1) continue; }
    else { const a = (r.z0 - z) / dz, b = (r.z1 - z) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (lo < hi && hi > 0 && lo < 1) return false;
  }
  return true;
}

// 伊賀の薄い敷きむしろ・寝むしろは床として踏める。机や炉と同じ障害物にしない。
// 絵は残し、体の当たり・兵の通路・立ち位置で同じ判断を使う。
export function interiorPropBlocksWalk(layout, p) {
  return !p.walkable && !(layout.profile === 'iga' && (p.part === 'seatMat' && p.h <= .03
    || layout.kind === 'nagaya' && p.part === 'bedding' && p.h <= .12));
}

export function prepareInteriorPaths(layout, w, d) {
  const rects = [], nodes = [], margin = .36;
  for (const prop of layout.props) if (interiorPropBlocksWalk(layout, prop)) for (const p of prop.solids || [prop]) rects.push({ x0: p.x - p.w / 2 - margin, x1: p.x + p.w / 2 + margin, z0: p.z - p.d / 2 - margin, z1: p.z + p.d / 2 + margin });
  for (const v of layout.walls) rects.push({ x0: Math.min(v.ax, v.bx) - margin, x1: Math.max(v.ax, v.bx) + margin, z0: Math.min(v.az, v.bz) - margin, z1: Math.max(v.az, v.bz) + margin });
  for (const r of rects) for (const x of [r.x0 - .08, r.x1 + .08]) for (const z of [r.z0 - .08, r.z1 + .08]) {
    if (Math.abs(x) > w / 2 - .4 || Math.abs(z) > d / 2 - .4 || rects.some(v => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1)) continue;
    nodes.push({ x, z });
  }
  const n = nodes.length, distances = new Float32Array(n * n);
  distances.fill(Infinity);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = nodes[i], b = nodes[j];
    if (i === j || pathClear(rects, a.x, a.z, b.x, b.z)) distances[i * n + j] = Math.hypot(a.x - b.x, a.z - b.z);
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = distances[i * n + k] + distances[k * n + j];
    if (v < distances[i * n + j]) distances[i * n + j] = v;
  }
  layout.paths = { rects, nodes, distances, from: new Float32Array(n), to: new Float32Array(n) };
}

// 廊下の端・襖の開いた口へ回る。行き先の箱は呼び出し側が使い回す。
export function interiorWaypoint(layout, x, z, tx, tz, out) {
  out.x = tx; out.z = tz;
  const nav = layout.paths;
  if (nav) {
    // 家具の中を目的地にしない。同じ部屋で、壁の口を越えない最寄りの縁へ寄せる。
    const room = layout.rooms.find(r => tx >= r.x0 && tx <= r.x1 && tz >= r.z0 && tz <= r.z1);
    for (const r of nav.rects) {
      if (tx <= r.x0 || tx >= r.x1 || tz <= r.z0 || tz >= r.z1) continue;
      let best = Infinity, bx = tx, bz = tz;
      for (let k = 0; k < 4; k++) {
        const px = k === 0 ? r.x0 - .04 : k === 1 ? r.x1 + .04 : tx;
        const pz = k === 2 ? r.z0 - .04 : k === 3 ? r.z1 + .04 : tz;
        if (room && (px < room.x0 + .36 || px > room.x1 - .36 || pz < room.z0 + .36 || pz > room.z1 - .36)) continue;
        if (nav.rects.some(v => px > v.x0 && px < v.x1 && pz > v.z0 && pz < v.z1)) continue;
        const d = Math.hypot(px - tx, pz - tz);
        if (d < best) { best = d; bx = px; bz = pz; }
      }
      tx = bx; tz = bz;
    }
    out.x = tx; out.z = tz;
    if (pathClear(nav.rects, x, z, tx, tz)) return out;
    const n = nav.nodes.length;
    for (let i = 0; i < n; i++) {
      const q = nav.nodes[i];
      nav.from[i] = pathClear(nav.rects, x, z, q.x, q.z) ? Math.hypot(x - q.x, z - q.z) : Infinity;
      nav.to[i] = pathClear(nav.rects, q.x, q.z, tx, tz) ? Math.hypot(tx - q.x, tz - q.z) : Infinity;
    }
    let best = Infinity, first = -1;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(nav.from[i]) || nav.from[i] < .12) continue;
      for (let j = 0; j < n; j++) {
        const cost = nav.from[i] + nav.distances[i * n + j] + nav.to[j];
        if (cost < best) { best = cost; first = i; }
      }
    }
    if (first >= 0) { out.x = nav.nodes[first].x; out.z = nav.nodes[first].z; }
    else { out.x = x; out.z = z; }
    return out;
  }
  let first = 2, wall = null;
  for (const v of layout.walls) {
    const dx = tx - x, dz = tz - z, sx = v.bx - v.ax, sz = v.bz - v.az, den = dx * sz - dz * sx;
    if (Math.abs(den) < .00001) continue;
    const ax = v.ax - x, az = v.az - z;
    const t = (ax * sz - az * sx) / den, u = (ax * dz - az * dx) / den;
    if (t >= 0 && t < first && t <= 1 && u >= 0 && u <= 1) { first = t; wall = v; }
  }
  if (!wall) return out;
  if (Math.abs(wall.az - wall.bz) < .01) {
    const portal = layout.portals.find((p) => Math.abs(p.z - wall.az) < .01);
    if (portal) { out.x = portal.x; out.z = portal.z + (Math.abs(x - portal.x) < .45 ? Math.sign(tz - portal.z) || 1 : Math.sign(z - portal.z) || -Math.sign(tz - portal.z) || 1) * .9; }
    else {
      const left = Math.min(wall.ax, wall.bx) - .85, right = Math.max(wall.ax, wall.bx) + .85;
      out.x = Math.abs(x - left) + Math.abs(tx - left) <= Math.abs(x - right) + Math.abs(tx - right) ? left : right;
      out.z = Math.abs(x - out.x) < .4 ? tz : z;
    }
  } else {
    const front = Math.max(wall.az, wall.bz) + .85, back = Math.min(wall.az, wall.bz) - .85;
    out.z = Math.abs(z - front) + Math.abs(tz - front) <= Math.abs(z - back) + Math.abs(tz - back) ? front : back;
    out.x = Math.abs(z - out.z) < .4 ? tx : x;
  }
  return out;
}
