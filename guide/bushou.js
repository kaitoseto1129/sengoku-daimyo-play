(function(){
  'use strict';
  var L=window.pcList().filter(function(r){return Object.prototype.hasOwnProperty.call(window.SD_HISTORICAL,r[0]);}),grid=document.getElementById('g'),q=document.getElementById('q'),cl=document.getElementById('cl'),cnt=document.getElementById('cnt'),none=document.getElementById('none'),more=document.getElementById('more'),list=[],end=0,timer;
  document.getElementById('total').textContent=L.length;
  var clans=Array.from(new Set(L.map(function(r){return r[1];}))).sort(function(a,b){return a.localeCompare(b,'ja');});
  clans.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;cl.appendChild(o);});
  function paint(el){var svg=window.pcCardSVG(el.dataset.n);if(svg){var ph=el.querySelector('.ph');if(ph)ph.outerHTML=svg;} }
  var io='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);paint(e.target);}});},{rootMargin:'100px'}):null;
  function normalize(s){return s.normalize('NFKC').replace(/[\s　]+/g,'').replace(/[ァ-ヶ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-96);});}
  function append(){
    var frag=document.createDocumentFragment(),batch=list.slice(end,end+60);end+=batch.length;
    batch.forEach(function(r){var d=document.createElement('div');d.className='card';d.dataset.n=r[0];var ph=document.createElement('div');ph.className='ph';ph.setAttribute('aria-hidden','true');var cap=document.createElement('div');cap.className='cap';var b=document.createElement('b');b.textContent=r[0];var s=document.createElement('span');s.textContent=r[1]+'　'+r[2];cap.append(b,s);d.append(ph,cap);frag.appendChild(d);});grid.appendChild(frag);
    batch.forEach(function(_,i){var el=grid.children[end-batch.length+i];if(io)io.observe(el);else paint(el);});
    more.hidden=end>=list.length;cnt.textContent=list.length+'人中 '+end+'人を表示';
  }
  function draw(){
    clearTimeout(timer);if(io)io.disconnect();var t=normalize(q.value),c=cl.value;
    list=L.filter(function(r){return (!t||normalize(r[0]).includes(t)||normalize(window.SD_HISTORICAL[r[0]]).includes(t))&&(!c||r[1]===c);});
    grid.replaceChildren();end=0;none.hidden=list.length>0;append();
    try{sessionStorage.setItem('sd_bushou_search',JSON.stringify([q.value,cl.value]));}catch(_){}
  }
  try{var saved=JSON.parse(sessionStorage.getItem('sd_bushou_search')||'null');if(saved){q.value=saved[0];cl.value=saved[1];}}catch(_){}
  q.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(draw,140);});cl.addEventListener('change',draw);more.addEventListener('click',append);
  document.getElementById('clear').addEventListener('click',function(){q.value='';cl.value='';draw();q.focus();});draw();
})();
