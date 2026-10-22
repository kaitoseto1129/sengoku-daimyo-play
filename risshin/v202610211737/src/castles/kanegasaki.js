// 金ヶ崎城・天筒山城（元亀元年四月）。北は -z、東は +x。
// 出所：docs/layout-ref/nawabari-measured.md「金ヶ崎（二回目）」、敦賀市の赤色測量図・200m の棒。
// 城間の距離だけ実距離の三分の一。平場の大きさは図読み、堀の断面・段差・建物は従来の推定。
export const KG_SCALE = 1 / 3;
export const KG_SHU = { x: 48, z: -160 };
export const KG_NI = { x: 84, z: -139 }; // 焼米出土地の尾根の平場群
export const KG_TEZ = { x: KG_SHU.x + 410 * KG_SCALE, z: KG_SHU.z + 90 * KG_SCALE };
// 南南東へ約160m。図読みの各区間は概数なので、天筒山は主郭からの東410m・南90mを優先。
const SAN = [KG_SHU.x + 61.2 * KG_SCALE, KG_SHU.z + 147.9 * KG_SCALE];
const NI = [SAN[0] + 100 * KG_SCALE, SAN[1]];
const ICHI = [NI[0] + 50 * KG_SCALE, SAN[1]];
const SHU_GATE = [KG_SHU.x, KG_SHU.z + 37.5];
export const KG_NI_GATE = [KG_NI.x - 15, SAN[1]];
const NI_EAST = [KG_NI.x + 15, SAN[1]];
const TEZ_GATE = [KG_TEZ.x - 10, KG_TEZ.z];
const court = (c, w, d) => [[c.x-w,c.z-d+2],[c.x-w+2,c.z-d],[c.x+w-2,c.z-d],[c.x+w,c.z-d+2],[c.x+w,c.z+d],[c.x-w,c.z+d]];
// 麓の九十九折りは残す。木戸の前後と土橋を同じ道で結び、曲輪内は空いた庭を通す。
export const KG_PATHS = [
  [[8,-50],[-36,-58],[30,-68],[-28,-78],[38,-86],[0,-96],[0,-126],[16,-108],[30,-92],[48,-100],KG_NI_GATE,[84,SAN[1]],[84,-139]],
  [KG_NI_GATE,SAN,[56,-116],SHU_GATE,[48,-146],[48,-160]],
  [[84,SAN[1]],NI_EAST,NI,ICHI,[145,-114],TEZ_GATE,[KG_TEZ.x,KG_TEZ.z]],
];
// 東斜面の朝倉期の畝状竪堀。七本を読み込み時だけ作る。幅と深さは推定。
const UNE = Array.from({length:7}, (_, i) => {
  const z = -185 + i * 10;
  return {kind:'tatebori',pts:[[102,z],[109,z+2],[116,z+4]],w:3.5,deep:2};
});
// 尾根を断つ堀切に幅12mの土橋を残す。既存の幅4.5m・深さ2.5mは据え置き。
const cut = (name, at) => [
  {name,kind:'horikiri',pts:[[at[0],at[1]-14],[at[0],at[1]-6]],w:4.5,deep:2.5},
  {name,kind:'horikiri',pts:[[at[0],at[1]+6],[at[0],at[1]+14]],w:4.5,deep:2.5},
];
export const KANEGASAKI_PLAN = {
  name: '金ヶ崎城', type: 'yama', year: 1570, mon: 'oda',
  continuousEdges: true, // 平場の縁で高さを跳ばさず、土の斜面へつなぐ。
  kuruwa: [
    { id:'shu', name:'主郭（月見御殿跡・古墳を含む平場群）', poly:court(KG_SHU,16,37.5), level:bf=>bf(KG_SHU.x,KG_SHU.z), wall:'saku', dorui:1.1, wallOpt:{mound:false}, sakamogi:[], gapAt:[SHU_GATE] },
    { id:'ni', name:'焼米出土地の尾根の曲輪群', poly:court(KG_NI,15,55), level:bf=>bf(KG_NI.x,KG_NI.z), wall:'saku', dorui:1, wallOpt:{mound:false}, sakamogi:[], gapAt:[KG_NI_GATE,NI_EAST] },
    { id:'tez', name:'天筒山の山頂曲輪', poly:court(KG_TEZ,10,8), level:bf=>bf(KG_TEZ.x,KG_TEZ.z), wall:'saku', dorui:1.2, wallOpt:{mound:false}, sakamogi:[], gapAt:[TEZ_GATE] },
  ],
  hori: [
    ...cut('三の城戸',SAN), ...cut('二の城戸',NI),
    ...cut('一の城戸・西の堀切',ICHI), ...cut('一の城戸・東の堀切',[ICHI[0]+6,ICHI[1]]),
    {kind:'tatebori',pts:[[SAN[0]-4,SAN[1]+15],[SAN[0]-14,SAN[1]+23],[SAN[0]-20,SAN[1]+29]],w:4,deep:2},
    {kind:'tatebori',pts:[[KG_SHU.x-18,-154],[KG_SHU.x-26,-168],[KG_SHU.x-30,-182]],w:3.5,deep:2},
    ...UNE,
  ],
  koguchi: [
    {id:'kido_shu',name:'主郭の木戸',from:'ni',to:'shu',at:SHU_GATE,gate:'kabuki',w:4.4},
    {id:'kido_ni',name:'焼米出土地の木戸',from:'out',to:'ni',at:KG_NI_GATE,gate:'kabuki',rot:-Math.PI/2,w:4.4},
    {id:'kido_ni_east',name:'焼米出土地の東木戸',from:'ni',to:'out',at:NI_EAST,gate:'kabuki',rot:-Math.PI/2,w:4.4},
    {id:'kido_tez',name:'天筒山の木戸',from:'out',to:'tez',at:TEZ_GATE,gate:'kabuki',rot:-Math.PI/2,w:4.4},
  ],
  yagura: [
    {id:'shu_monomi',kind:'monomi',at:[KG_SHU.x-6,KG_SHU.z-3],name:'岬の物見櫓'},
    {id:'tez_monomi',kind:'monomi',at:[KG_TEZ.x-6,KG_TEZ.z-2],name:'天筒山の物見櫓'},
  ],
  paths:KG_PATHS.map(pts=>({pts})),
};

// 高画質の段々の平場。測量図の外周・城間・堀切は保ち、長い尾根の内側を分ける。
// 段差・建物・柵の配置は推定。春日山の姿を金ヶ崎の実測縄張りへ丸ごと移さない。
const niStep = (id, z, d, rise, mouths) => ({
  id, name:'尾根の段曲輪', poly:court({x:KG_NI.x,z},15,d),
  level:bf=>bf(KG_NI.x,KG_NI.z)+rise, wall:'saku', dorui:.8,
  // 北の段は細杭の透ける柵。主郭と中・南段の板塀を残し、囲いを一様にしない。
  wallOpt:{mound:false,h:2.1,...(id === 'ni_north' ? {openFence:true,lightFence:true,noBrace:true} : {boardCap:true,boardRailsSide:1,plainBoards:id === 'ni_south'})}, sakamogi:[], gapAt:mouths,
});
export const KANEGASAKI_HIGH_PLAN = {
  ...KANEGASAKI_PLAN, gateSlope:5, continuousEdges:true,
  kuruwa:[
    // 写真の屋敷囲いは狭間を連ねない板塀。中段の番所の防御塀には狭間を残す。
    // 外周は内側が進行方向の右手。写真の板塀のように内面だけ二段の横桟を通す。
    {...KANEGASAKI_PLAN.kuruwa[0],wallOpt:{...KANEGASAKI_PLAN.kuruwa[0].wallOpt,boardCap:true,plainBoards:true,boardRailsSide:1}},
    niStep('ni_north',-179,15,4,[[84,-164]]),
    niStep('ni',-150,12,0,[[84,-162],[84,-138]]),
    niStep('ni_south',-110,26,-5,[KG_NI_GATE,NI_EAST,[84,-136]]),
    // 板塀で固めた主郭・尾根の屋敷と、簡素な天筒山の木柵を描き分ける。
    // 高画質だけの指定。外周・木戸・切岸の寸法は測量図のまま。
    {...KANEGASAKI_PLAN.kuruwa[2],wallOpt:{mound:false,openFence:true,noBrace:true,h:1.8}},
  ],
};
