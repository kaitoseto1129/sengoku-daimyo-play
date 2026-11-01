// GRID の升目 c,r（japan_data.js の座標。元升=1037x1080、GRID.gc/gr はその /3）→ 実の経緯度への当てはめ。
// prototype/tools/fit_japan_grid.mjs が、城十数か所の既知の経緯度から二次式で作った（手で直さない）。
// 当てはめの誤差：RMS 12.88km（城十数か所、docs/map.md 参照）。
const LON_C = [5.653654810493843e-7,0.000002084675949178627,0.000003688907811431163,0.013655471763783929,-0.0056714227131830055,131.5861806570134];
const LAT_C = [0.0000027016179176123114,0.0000019414419410705584,0.000005102729062546139,-0.0064567257703686196,-0.019900064736260232,49.52711901197525];
export function gridToLatLon(c, r) {
  const c2=c*c, r2=r*r, cr=c*r;
  const lon = LON_C[0]*c2 + LON_C[1]*r2 + LON_C[2]*cr + LON_C[3]*c + LON_C[4]*r + LON_C[5];
  const lat = LAT_C[0]*c2 + LAT_C[1]*r2 + LAT_C[2]*cr + LAT_C[3]*c + LAT_C[4]*r + LAT_C[5];
  return [lon, lat];
}
