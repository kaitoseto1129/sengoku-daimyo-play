(function(){
  'use strict';
  var items=[],visible=new Set();
  function covered(){return !document.getElementById('player').hidden||!document.getElementById('pvModal').hidden;}
  function update(v){
    if(document.hidden||SDPage.limited()||covered()||!visible.has(v)){v.pause();return;}
    if(!v.getAttribute('src'))v.src=v.dataset.src;
    var p=v.play();if(p&&p.catch)p.catch(function(){if(v.id!=='heroVideo')v.style.visibility='hidden';});
  }
  // 本文の画像・背景・書体は、画面に入るまで取得しない。
  function load(el){
    if(el.dataset.src&&el.tagName==='IMG'){el.src=el.dataset.src;delete el.dataset.src;}
    if(el.dataset.background){
      el.dataset.background.split(',').forEach(function(key){el.style.setProperty('--bg-'+key,'url("img/'+key+'.jpg")');});
      delete el.dataset.background;
    }
    if(el.id==='intro'){
      var font=document.createElement('link');font.rel='stylesheet';
      font.href='https://fonts.googleapis.com/css2?family=Yuji+Syuku&family=Shippori+Mincho:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap';
      document.head.appendChild(font);
    }
  }
  var lazy='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){load(e.target);lazy.unobserve(e.target);}});},{rootMargin:'0px'}):null;
  function watch(el){if(lazy)lazy.observe(el);else load(el);}
  document.querySelectorAll('img[data-src]').forEach(watch);
  var backgrounds={
    '#ch1 .kochizu':'map','#ch2 .stage .ban.l':'battle_wide','#ch2 .stage .ban.r':'bg_melee',
    '#ch2 .stage .full':'bg_melee','#ch3 .senjo .bg':'battle_wide',
    '#ch5 .tenka .bg':'siege_map','#musubi .last .bg':'bg_melee','#musubi .last .map':'siege_map'
  };
  Object.keys(backgrounds).forEach(function(selector){document.querySelectorAll(selector).forEach(function(el){if(!el.dataset.mov){el.dataset.background=backgrounds[selector];watch(el);}});});
  watch(document.getElementById('intro'));
  var observer='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)visible.add(e.target);else visible.delete(e.target);update(e.target);});},{rootMargin:'0px'}):null;
  function observeVideo(v){items.push(v);if(observer)observer.observe(v);else{visible.add(v);update(v);}}
  // 最初の一本はＨＴＭＬから直接読み、本文の映像は表示時に初めて取得元を渡す。
  observeVideo(document.getElementById('heroVideo'));
  if(!SDPage.limited())document.querySelectorAll('[data-mov]').forEach(function(b){
    var v=document.createElement('video');v.className='mv';v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.setAttribute('aria-hidden','true');v.tabIndex=-1;v.style.visibility='hidden';
    v.dataset.src='mov/'+b.dataset.mov+'.mp4';
    v.addEventListener('playing',function(){v.style.visibility='visible';});
    v.addEventListener('error',function(){v.pause();v.style.visibility='hidden';if(observer)observer.unobserve(v);visible.delete(v);});
    b.appendChild(v);observeVideo(v);
  });
  function all(){items.forEach(update);}
  document.addEventListener('visibilitychange',all);
  var mo=new MutationObserver(all);['player','pvModal'].forEach(function(id){mo.observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden']});});
  if(window.matchMedia){var mq=matchMedia('(prefers-reduced-motion: reduce)');if(mq.addEventListener)mq.addEventListener('change',all);}
  if(navigator.connection&&navigator.connection.addEventListener)navigator.connection.addEventListener('change',all);
})();
