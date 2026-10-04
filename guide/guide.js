(function(){
  'use strict';
  var ui=window.SDPage,chips=[].slice.call(document.querySelectorAll('#chips .chip')),secs=[].slice.call(document.querySelectorAll('section.scen'));
  function show(k,push){
    if(!secs.some(function(s){return s.id==='sc-'+k;})) return false;
    chips.forEach(function(c){var on=c.dataset.sc===k;c.classList.toggle('on',on);c.setAttribute('aria-pressed',String(on));});
    secs.forEach(function(s){s.hidden=s.id!=='sc-'+k;});
    try{localStorage.setItem('sd_guide_sc',k);}catch(_){}
    if(push){try{history.pushState(null,'','#sc='+k);}catch(_){} }
    return true;
  }
  function hash(){var m=location.hash.match(/^#sc=([a-z0-9_]+)$/);if(m)show(m[1],false);}
  chips.forEach(function(c){c.addEventListener('click',function(){show(c.dataset.sc,true);document.getElementById('sc-'+c.dataset.sc).scrollIntoView({behavior:ui.limited()?'auto':'smooth',block:'start'});});});
  var k='';try{k=localStorage.getItem('sd_guide_sc');}catch(_){}
  if(!show(k,false))show(chips[0].dataset.sc,false);hash();window.addEventListener('hashchange',hash);window.addEventListener('popstate',hash);
  var lb=document.getElementById('lightbox'),im=lb.querySelector('img'),cap=lb.querySelector('.lb-cap'),sub=lb.querySelector('.lb-sub'),current=null;
  var dialog=ui.modal(lb,lb.querySelector('button'),function(){if(current)current.stop();current=null;im.removeAttribute('src');});
  var players=[], visible=new Set(), byCard=new Map();
  var io='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){var p=byCard.get(e.target);if(!p)return;if(e.isIntersecting){visible.add(p);if(lb.hidden)p.play();}else{visible.delete(p);p.stop();}});},{rootMargin:'0px'}):null;
  [].slice.call(document.querySelectorAll('.dcard,.fig img,.nagashino-detail img')).forEach(function(el){
    if(el.tagName==='IMG'&&el.closest('.dcard'))return;
    var image=el.tagName==='IMG'?el:el.querySelector('img');if(!image)return;
    var h=el.querySelector('h4'),s=el.querySelector('.s');
    ui.button(el,(h?h.textContent:image.alt||'ゲーム画面')+'を拡大',function(){
      if(current)current.stop();im.src=image.src;im.alt=image.alt;cap.textContent=h?h.textContent:image.alt;sub.textContent=s?s.textContent+' ── 実際のゲーム画面':'';
      dialog.open(el);if(el.dataset.seq){current=ui.sequence(im,el.dataset.seq,window.SD_SEQ[el.dataset.seq]||0,'img/seq/');current.play();}
    });
    if(el.dataset.seq&&'IntersectionObserver'in window){
      var p=ui.sequence(image,el.dataset.seq,window.SD_SEQ[el.dataset.seq]||0,'img/seq/');players.push(p);
      byCard.set(el,p);io.observe(el);
    }
  });
  document.addEventListener('visibilitychange',function(){players.forEach(function(p){p.stop();});if(document.hidden){if(current)current.stop();}else{if(!lb.hidden){if(current)current.play();}else visible.forEach(function(p){p.play();});}});
  new MutationObserver(function(){players.forEach(function(p){p.stop();});if(lb.hidden)visible.forEach(function(p){p.play();});}).observe(lb,{attributes:true,attributeFilter:['hidden']});
  im.addEventListener('error',function(){sub.textContent='画像を読み込めませんでした。閉じて本文をご覧ください。';});
  var text=document.getElementById('meyasuText'),status=document.getElementById('meyasuStatus');
  try{text.value=sessionStorage.getItem('sd_draft_攻略サイト')||'';}catch(_){}
  text.addEventListener('input',function(){try{sessionStorage.setItem('sd_draft_攻略サイト',text.value);}catch(_){} });
  document.getElementById('meyasuGo').addEventListener('click',function(){ui.email(text,'攻略サイト',status);});
})();
