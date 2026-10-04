(function(){
  'use strict';
  var items=[],visible=new Set(),observer='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)visible.add(e.target);else visible.delete(e.target);update(e.target);});},{rootMargin:'0px'}):null;
  function covered(){return !document.getElementById('player').hidden||!document.getElementById('pvModal').hidden;}
  function update(v){
    if(document.hidden||SDPage.limited()||covered()||!visible.has(v)){v.pause();return;}
    if(!v.src)v.src=v.dataset.src;
    var p=v.play();if(p&&p.catch)p.catch(function(){v.style.visibility='hidden';});
  }
  if(!SDPage.limited())document.querySelectorAll('[data-mov]').forEach(function(b){
    var im=b.querySelector('img'),v=document.createElement('video');v.className='mv';v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.setAttribute('aria-hidden','true');v.tabIndex=-1;v.style.visibility='hidden';
    // 横持ちでも大容量の高解像度映像を選ばない。
    v.dataset.src='mov/'+b.dataset.mov+'.mp4';
    if(im)v.poster=im.currentSrc||im.src;
    v.addEventListener('playing',function(){v.style.visibility='visible';});
    v.addEventListener('error',function(){v.pause();v.style.visibility='hidden';if(observer)observer.unobserve(v);visible.delete(v);});
    b.appendChild(v);items.push(v);if(observer)observer.observe(v);
  });
  function all(){items.forEach(update);}
  document.addEventListener('visibilitychange',all);
  var mo=new MutationObserver(all);['player','pvModal'].forEach(function(id){mo.observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden']});});
  if(window.matchMedia){var mq=matchMedia('(prefers-reduced-motion: reduce)');if(mq.addEventListener)mq.addEventListener('change',all);}
  if(navigator.connection&&navigator.connection.addEventListener)navigator.connection.addEventListener('change',all);
})();
