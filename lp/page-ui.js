/* 攻略・紹介共通。低速回線と横持ちを優先する。 */
(function () {
  'use strict';
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
  function limited() { var c=navigator.connection; return motion.matches || (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType))); }
  function modal(el, closeButton, onClose) {
    var previous, overflow, siblings=[];
    el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
    function close() {
      if(el.hidden) return;
      el.hidden=true; el.style.display='none'; document.body.style.overflow=overflow;
      siblings.forEach(function(s){ s[0].inert=s[1]; }); siblings=[];
      if(onClose) onClose();
      if(previous && previous.isConnected) previous.focus();
    }
    closeButton.addEventListener('click',close);
    el.addEventListener('click',function(e){ if(e.target===el) close(); });
    el.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.preventDefault();close();return;}
      if(e.key!=='Tab') return;
      var nodes=[].slice.call(el.querySelectorAll('button,a[href],input,select,textarea,video[controls],[tabindex="0"]')).filter(function(n){return !n.disabled&&!n.hidden;});
      var first=nodes[0],last=nodes[nodes.length-1]; if(!first) return;
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    el.hidden=true;
    return {open:function(opener){
      if(!el.hidden) return;
      previous=opener||document.activeElement; overflow=document.body.style.overflow;
      [].slice.call(document.body.children).forEach(function(s){ if(s!==el&&!s.contains(el)&&s.tagName!=='SCRIPT'){siblings.push([s,s.inert]);s.inert=true;} });
      document.body.style.overflow='hidden';el.hidden=false;el.style.display='flex';closeButton.focus();
    },close:close};
  }
  function button(el,label,action) {
    el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-label',label);el.setAttribute('aria-haspopup','dialog');
    el.addEventListener('click',function(e){ if(e.target.closest('a,button')&&e.target!==el) return;action(); });
    el.addEventListener('keydown',function(e){ if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();action();} });
  }
  // 二枚ずつ先読み。全写真の一括取得を避け、欠けた写真を飛ばす。
  function sequence(im,key,n,base) {
    var index=0,timer=null,cache=new Map(),visible=false;
    function frame(i){ if(cache.has(i)) return cache.get(i);var f=new Image();f.src=base+key+'/'+String(i).padStart(3,'0')+'.jpg';cache.set(i,f);return f; }
    function step(){
      if(document.hidden||limited()||!visible) return;
      var next=(index+1)%n,f=frame(next);frame((next+1)%n);
      if(f.complete){if(f.naturalWidth) im.src=f.src;index=next;cache.forEach(function(_,i){if(i!==index&&i!==(index+1)%n&&i!==(index+2)%n)cache.delete(i);});}
    }
    function stop(){visible=false;clearInterval(timer);timer=null;}
    function play(){visible=true;if(timer||limited()||document.hidden||n<2)return;timer=setInterval(step,300);step();}
    return {play:play,stop:stop};
  }
  function email(text,context,status) {
    var t=text.value.trim(); if(!t){status.textContent='内容を書いてから送ってください。';text.focus();return;}
    if(t.length>1500){status.textContent='手紙は1500文字以内にしてください。';text.focus();return;}
    try{sessionStorage.setItem('sd_draft_'+context,t);}catch(_){}
    location.href='mailto:kaitoseto1129@gmail.com?subject='+encodeURIComponent('【戦国大名 目安箱】')+'&body='+encodeURIComponent(t+'\n\n――\n'+context);
    status.textContent='メールの作成画面で送信してください。開かない場合は下の宛先へ送れます。';
  }
  window.SDPage={limited:limited,modal:modal,button:button,sequence:sequence,email:email};
})();
