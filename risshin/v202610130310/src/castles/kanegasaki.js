// 金ヶ崎城・天筒山城（元亀元年四月）。月見御殿・曲輪・木戸・堀切は史料に残る。
// 寸法・段差・建物・道の位置は未確定。当時の越前の土の山城として推定復元。
// 天筒山は別の山。全体の方位と距離は退き口の遊びに合わせて縮めている。
export const KG_SHU = { x: 96, z: -128 };
export const KG_NI = { x: 74, z: -112 };
export const KG_TEZ = { x: 48, z: -98 };
const court = (c, w, d) => [[c.x-w,c.z-d+2],[c.x-w+2,c.z-d],[c.x+w-2,c.z-d],[c.x+w,c.z-d+2],[c.x+w,c.z+d],[c.x-w,c.z+d]];
// 木戸は曲輪の縁。門から中の建物の戸口へ、空いた庭を通す。
export const KG_PATHS = [
  [[8,-50],[-36,-58],[30,-68],[-28,-78],[38,-86],[0,-96],[0,-126],[28,-140],[60,-132],[64,-102],[74,-105],[74,-112]],
  [[74,-105],[74,-101],[88,-101],[96,-119],[96,-128]],
  [[0,-126],[32,-124],[30,-108],[24,-96],[30,-86],[36,-86],[36,-98],[38,-98],[48,-98]],
];
export const KANEGASAKI_PLAN = {
  name: '金ヶ崎城', type: 'yama', year: 1570, mon: 'oda',
  kuruwa: [
    { id:'shu', name:'主郭（月見御殿跡）', poly:court(KG_SHU,10,9), level:bf=>bf(96,-128), wall:'saku', dorui:1.1, wallOpt:{mound:false}, sakamogi:[], gapAt:[[96,-119]] },
    { id:'ni', name:'二の曲輪', poly:court(KG_NI,9,7), level:bf=>bf(74,-112), wall:'saku', dorui:1, wallOpt:{mound:false}, sakamogi:[], gapAt:[[74,-105]] },
    { id:'tez', name:'天筒山の山頂曲輪', poly:court(KG_TEZ,10,8), level:bf=>bf(48,-98), wall:'saku', dorui:1.2, wallOpt:{mound:false}, sakamogi:[], gapAt:[[38,-98]] },
  ],
  // 堀切に土橋を残す。竪堀の位置・断面は推定。道と庭を断たない。
  hori: [
    {kind:'horikiri',pts:[[84,-130],[84,-113]],w:4.5,deep:2.5},
    {kind:'horikiri',pts:[[84,-95],[84,-89]],w:4.5,deep:2.5},
    {kind:'horikiri',pts:[[62,-94],[62,-82]],w:4.5,deep:2.5},
    {kind:'tatebori',pts:[[84,-130],[94,-146],[104,-154]],w:4,deep:2},
    {kind:'tatebori',pts:[[38,-106],[30,-124],[24,-138]],w:3.5,deep:2},
  ],
  koguchi: [
    {id:'kido_shu',name:'主郭の木戸',from:'ni',to:'shu',at:[96,-119],gate:'kabuki',w:4.4},
    {id:'kido_ni',name:'二の曲輪の木戸',from:'out',to:'ni',at:[74,-105],gate:'kabuki',w:4.4},
    {id:'kido_tez',name:'天筒山の木戸',from:'out',to:'tez',at:[38,-98],gate:'kabuki',rot:-Math.PI/2,w:4.4},
  ],
  yagura: [
    {id:'shu_monomi',kind:'monomi',at:[90,-131],name:'岬の物見櫓'},
    {id:'tez_monomi',kind:'monomi',at:[42,-100],name:'天筒山の物見櫓'},
  ],
  paths:KG_PATHS.map(pts=>({pts})),
};
