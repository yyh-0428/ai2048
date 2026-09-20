(()=>{
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const {moveBoardPlain,moveBoardDetailed,legalRootBranches}=Game2048;
  const els={score:$('#score'),best:$('#best'),maxTile:$('#maxTile'),tiles:$('#tiles'),motion:$('#motionLayer'),wrap:$('#boardWrap'),undo:$('#undoBtn'),newBtn:$('#newBtn'),overlay:$('#gameOverlay'),overlayNew:$('#overlayNew'),gameOverText:$('#gameOverText'),hint:$('#hintArrow'),hintBtn:$('#hintBtn'),autoBtn:$('#autoplayBtn'),speed:$('#speed'),speedText:$('#speedText'),dot:$('#aiDot'),status:$('#aiStatusText'),sub:$('#aiSubText'),mMove:$('#mMove'),mDepth:$('#mDepth'),mNodes:$('#mNodes'),mTime:$('#mTime'),strengthCaption:$('#strengthCaption'),soundBtn:$('#soundBtn'),soundIcon:$('#soundIcon'),toast:$('#toast'),live:$('#liveStatus'),analysisCaption:$('#analysisCaption'),analysisNote:$('#analysisNote')};
  const arrows={up:'↑',down:'↓',left:'←',right:'→'},names={up:'上',down:'下',left:'左',right:'右'};
  const captions={fast:'轻快 · 优先速度',strong:'深入 · 均衡思考',extreme:'极致 · 更多残局复核'};
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  function storageGet(k,fallback=null){try{return localStorage.getItem(k)??fallback;}catch(_){return fallback;}}
  function storageSet(k,v){try{localStorage.setItem(k,v);return true;}catch(_){return false;}}
  let board=Array(16).fill(0),score=0,history=[],moveCount=0,revision=0;
  let best=Number(storageGet('refined2048-best',storageGet('ai2048-best','0')))||0;
  if(!Number.isFinite(best)||best<0)best=0;
  let gameOver=false,animating=false,autoplay=false,aiBusy=false,queuedAutoResult=null;
  let strength=storageGet('refined2048-strength','extreme');if(!captions[strength])strength='extreme';
  let soundOn=storageGet('refined2048-sound','on')!=='off',audioCtx=null;
  let reqId=0,activeReq=0,coordinator=null,workers=[],workerURLs=[],watchdog=0,autoTimer=0;
  let animationTimer=0,animationFrame=0,visualEpoch=0,paintTimer=0,paintFrame=0,lastPaint=0;
  let hintTimer=0,toastTimer=0,lastSaved=0,lastStatsPaint=0,lastStatusPaint=0,lastSound=0,wakeLock=null,wakePending=false;
  let newIndex=-1,mergedIndices=[];
  const nodes=Array.from({length:16},(_,i)=>{const el=document.createElement('div');el.hidden=true;el.dataset.index=String(i);els.tiles.appendChild(el);return el;});
  const cells=$$('.cell'),bars=$$('.move-row').map(row=>({row,bar:row.querySelector('i'),label:row.querySelector('span')}));
  const compact=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(n);
  const maxTile=()=>Math.max(2,...board);
  const snapshot=()=>({board:board.slice(),score,moveCount});
  const canMove=()=>legalRootBranches(board).length>0;
  const position=i=>`translate(calc(${(i%4)*100}% + ${i%4} * var(--gap)), calc(${Math.floor(i/4)*100}% + ${Math.floor(i/4)} * var(--gap)))`;
  const tileClass=v=>v<=2048?'v'+v:'super';
  const fontFor=v=>String(v).length<=2?'clamp(30px,7vw,52px)':String(v).length===3?'clamp(27px,6.5vw,47px)':String(v).length===4?'clamp(22px,5.7vw,40px)':'clamp(17px,4.8vw,31px)';
  function addRandom(){const empty=board.map((v,i)=>v?-1:i).filter(i=>i>=0);if(!empty.length)return -1;const i=empty[Math.floor(Math.random()*empty.length)];board[i]=Math.random()<.9?2:4;return i;}
  function announce(text){els.live.textContent=text;}
  function save(force=false){const now=performance.now();if(!force&&now-lastSaved<1000)return;lastSaved=now;storageSet('refined2048-best',String(best));storageSet('refined2048-session',JSON.stringify(snapshot()));}
  function readSession(){
    try{const s=JSON.parse(storageGet('refined2048-session','null'));
      if(!s||!Array.isArray(s.board)||s.board.length!==16||!s.board.some(Boolean)||!s.board.every(v=>Number.isSafeInteger(v)&&v>=0&&(v===0||(v>=2&&Number.isInteger(Math.log2(v)))))||!Number.isSafeInteger(s.score)||s.score<0)return null;
      return {...s,moveCount:Number.isSafeInteger(s.moveCount)&&s.moveCount>=0?s.moveCount:0};
    }catch(_){return null;}
  }
  function render(){
    const turbo=autoplay&&+els.speed.value===0;
    for(let i=0;i<16;i++){
      const el=nodes[i],v=board[i];el.hidden=!v;
      cells[i].setAttribute('aria-label',`第 ${Math.floor(i/4)+1} 行，第 ${i%4+1} 列：${v||'空'}`);
      if(!v)continue;
      el.className='tile '+tileClass(v)+(!turbo&&i===newIndex?' spawn':!turbo&&mergedIndices.includes(i)?' merged':'');
      const text=String(v);if(el.textContent!==text)el.textContent=text;
      el.style.fontSize=fontFor(v);el.style.setProperty('--pos',position(i));el.style.transform=position(i);
    }
    newIndex=-1;mergedIndices=[];
    els.score.textContent=score.toLocaleString();els.best.textContent=best.toLocaleString();els.maxTile.textContent=maxTile().toLocaleString();
    els.undo.disabled=!history.length||autoplay||animating;
    const wasHidden=els.overlay.hidden;els.overlay.hidden=!gameOver;els.overlay.classList.toggle('show',gameOver);
    if(gameOver){els.gameOverText.textContent=`${score.toLocaleString()} 分 · 最大数字 ${maxTile().toLocaleString()}`;if(wasHidden)announce('游戏结束。'+els.gameOverText.textContent);}
    save();
  }
  function flushRender(){clearTimeout(paintTimer);cancelAnimationFrame(paintFrame);paintTimer=paintFrame=0;lastPaint=performance.now();render();}
  function schedulePaint(){if(paintTimer||paintFrame)return;paintTimer=setTimeout(()=>{paintTimer=0;paintFrame=requestAnimationFrame(()=>{paintFrame=0;lastPaint=performance.now();render();});},Math.max(0,40-(performance.now()-lastPaint)));}
  function cancelVisuals(){visualEpoch++;clearTimeout(animationTimer);cancelAnimationFrame(animationFrame);animationTimer=animationFrame=0;animating=false;els.motion.replaceChildren();els.tiles.classList.remove('is-moving');}
  function animate(motions,duration){
    if(!duration){flushRender();return;}
    const epoch=++visualEpoch;animating=true;els.undo.disabled=true;els.tiles.classList.add('is-moving');els.motion.replaceChildren();
    const fragment=document.createDocumentFragment(),ghosts=[];
    for(const m of motions){const el=document.createElement('div');el.className='motion-tile '+tileClass(m.value);el.textContent=m.value;el.style.fontSize=fontFor(m.value);el.style.transitionDuration=duration+'ms';el.style.transform=position(m.from);fragment.appendChild(el);ghosts.push([el,m.to]);}
    els.motion.appendChild(fragment);
    // Start on the following frame without a synchronous layout read.
    animationFrame=requestAnimationFrame(()=>{animationFrame=requestAnimationFrame(()=>{
      if(epoch!==visualEpoch)return;
      for(const [el,to]of ghosts)el.style.transform=position(to);
      animationTimer=setTimeout(()=>{if(epoch!==visualEpoch)return;cancelVisuals();flushRender();if(queuedAutoResult&&autoplay){const r=queuedAutoResult;queuedAutoResult=null;consumeAutoResult(r);}},duration+16);
    });});
  }
  function syncControls(){
    els.autoBtn.classList.toggle('on',autoplay);els.autoBtn.textContent=autoplay?'暂停 AI':'自动玩';els.autoBtn.setAttribute('aria-pressed',String(autoplay));
    els.hintBtn.disabled=autoplay||aiBusy||gameOver;els.hintBtn.textContent=aiBusy&&!autoplay?'思考中…':'提示一步';
    els.undo.disabled=!history.length||autoplay||animating;
    for(const b of $$('.seg')){b.disabled=autoplay;b.classList.toggle('on',b.dataset.strength===strength);b.setAttribute('aria-pressed',String(b.dataset.strength===strength));}
    els.strengthCaption.textContent=captions[strength];els.wrap.classList.toggle('autoplay',autoplay);
  }
  function invalidateAI(){
    activeReq=++reqId;clearTimeout(autoTimer);clearTimeout(watchdog);autoTimer=watchdog=0;
    aiBusy=false;queuedAutoResult=null;coordinator?.postMessage({type:'cancel'});
    clearTimeout(hintTimer);els.hint.classList.remove('show');syncControls();
  }
  function destroyPool(){coordinator?.terminate();coordinator=null;for(const w of workers)w.terminate();workers=[];for(const u of workerURLs)URL.revokeObjectURL(u);workerURLs=[];}
  function ensurePool(){
    if(coordinator)return true;
    try{
      const blobURL=id=>{const u=URL.createObjectURL(new Blob([$(id).textContent],{type:'text/javascript'}));workerURLs.push(u);return u;};
      coordinator=new Worker(blobURL('#ai-coordinator-source'));
      coordinator.onmessage=e=>{
        const r=e.data;if(r.id!==activeReq)return;
        if(r.type==='error'){reportAIError(r.message);return;}
        if(r.type==='result')finishAI(r);
      };
      coordinator.onerror=e=>reportAIError(e.message||'无法启动搜索调度线程');
      const computeURL=blobURL('#ai-worker-source'),count=Math.min(4,Math.max(1,navigator.hardwareConcurrency||4)),ports=[];
      for(let i=0;i<count;i++){
        const w=new Worker(computeURL),channel=new MessageChannel();workers.push(w);ports.push(channel.port1);
        w.onerror=e=>reportAIError(e.message||'计算线程异常');
        w.postMessage({type:'connect',port:channel.port2},[channel.port2]);
      }
      coordinator.postMessage({type:'init',ports},ports);return true;
    }catch(e){destroyPool();reportAIError(e.message||'当前浏览器无法启动 AI');return false;}
  }
  function askAI(kind='hint'){
    if(aiBusy||queuedAutoResult||gameOver||(kind==='auto'&&!autoplay)||(animating&&kind!=='auto'))return;
    const legal=legalRootBranches(board);
    if(!legal.length){endGame();return;}
    if(legal.length===1){
      aiBusy=true;activeReq=++reqId;const id=activeReq,rev=revision;syncControls();
      queueMicrotask(()=>finishAI({id,revision:rev,best:legal[0].dir,scores:{[legal[0].dir]:0},depth:0,nodes:0,time:0,parallel:0,engine:'forced'}));return;
    }
    if(!ensurePool())return;
    aiBusy=true;activeReq=++reqId;const id=activeReq;if(!autoplay)syncControls();
    if(!autoplay)setStatus('think','正在分析','正在比较所有可移动方向…');
    // A failed worker must not leave the interface permanently busy.
    clearTimeout(watchdog);watchdog=setTimeout(()=>{if(id===activeReq&&aiBusy)reportAIError('本次搜索未响应，请重新点击提示或自动玩。');},15000);
    coordinator.postMessage({type:'analyze',id,revision,board:board.slice(),strength});
  }
  function finishAI(r){
    if(r.id!==activeReq||r.revision!==revision)return;
    clearTimeout(watchdog);watchdog=0;aiBusy=false;
    if(!r.best){if(!canMove())endGame();syncControls();return;}
    updateStats(r);if(!autoplay)syncControls();
    if(autoplay){
      const now=performance.now();if(now-lastStatusPaint>=100){lastStatusPaint=now;setStatus('active','自动玩中',`第 ${moveCount+1} 步 · ${r.verified?'已复核危险方向':r.engine.startsWith('js')?'大数字兼容搜索':'持续思考，随时可以暂停'}`);}
      if(animating)queuedAutoResult=r;else consumeAutoResult(r);
    }else{
      setStatus('',`建议 ${arrows[r.best]} ${names[r.best]}`,r.engine==='forced'?'当前只有这一个可移动方向。':r.cached?'复用同一棋盘的完整分析结果。':r.recovered?'本次深搜超时，已返回完整的浅层分析。':r.verified?'已对危险方向做额外复核。':'留出空间，让相同数字更容易合并。');
      showHint(r.best);announce(`建议向${names[r.best]}移动。`);soundHint();
    }
  }
  function scheduleAuto(){
    clearTimeout(autoTimer);if(!autoplay||gameOver)return;
    const rev=revision;autoTimer=setTimeout(()=>{autoTimer=0;if(autoplay&&rev===revision)askAI('auto');},+els.speed.value);
  }
  function consumeAutoResult(r){
    if(!autoplay||gameOver||r.revision!==revision)return;
    if(!doMove(r.best,true)){reportAIError('AI 返回了不可移动的方向。');return;}
    if(autoplay)scheduleAuto();
  }
  function doMove(dir,autoMode=false){
    if(gameOver||animating||(!autoMode&&autoplay))return false;
    const turbo=autoMode&&+els.speed.value===0,m=turbo?moveBoardPlain(board,dir):moveBoardDetailed(board,dir);
    if(!m.moved)return false;
    if(!autoMode){invalidateAI();clearStats();}
    history.push(snapshot());if(history.length>60)history.shift();const before=maxTile();
    board=m.board;score+=m.gain;best=Math.max(score,best);moveCount++;revision++;newIndex=addRandom();mergedIndices=m.merged||[];
    const after=maxTile(),now=performance.now();
    if(!turbo||now-lastSound>180){lastSound=now;soundMove();}
    if(m.gain&&!turbo)soundMerges((m.merged||[]).map(i=>m.board[i]));
    if(after>=2048&&after>before){soundMilestone(after);if(!autoMode)announce(`合并出了 ${after}！`);}
    if(!canMove()){cancelVisuals();endGame();flushRender();return true;}
    if(turbo){schedulePaint();return true;}
    const duration=motionPreference.matches||document.visibilityState!=='visible'?0:autoMode?Math.min(78,Math.max(28,+els.speed.value*.6)):(innerWidth<=620?135:145);
    animate(m.motions,duration);return true;
  }
  function endGame(){gameOver=true;autoplay=false;invalidateAI();releaseWake();setStatus('','本局结束','可以撤销最后一步，或开始新的一局。');flushRender();save(true);soundGameOver();}
  function newGame(silent=false){
    autoplay=false;invalidateAI();releaseWake();cancelVisuals();history=[];score=0;moveCount=0;revision++;gameOver=false;board=Array(16).fill(0);addRandom();newIndex=addRandom();mergedIndices=[];
    clearStats();flushRender();syncControls();save(true);if(!silent){toast('新的一局');announce('新的一局，棋盘已重置。');}
  }
  function undo(){
    if(!history.length||autoplay||animating)return;
    invalidateAI();cancelVisuals();const s=history.pop();board=s.board;score=s.score;moveCount=s.moveCount;revision++;gameOver=false;newIndex=-1;mergedIndices=[];
    clearStats();flushRender();syncControls();save(true);soundSoft(150,.025);announce('已撤销一步。');
  }
  function toggleAuto(){
    if(autoplay){autoplay=false;invalidateAI();cancelVisuals();releaseWake();flushRender();save(true);setStatus('','已暂停','你可以手动继续，或再次让 AI 接手。');syncControls();announce('AI 已暂停。');return;}
    if(gameOver)newGame(true);
    invalidateAI();cancelVisuals();autoplay=true;flushRender();syncControls();holdWake();setStatus('active','自动玩中','正在思考，随时可以暂停。');askAI('auto');
  }
  function setStrength(v){if(autoplay||!captions[v])return;invalidateAI();strength=v;storageSet('refined2048-strength',v);clearStats();syncControls();}
  function setStatus(mode,title,sub){els.dot.className='status-dot'+(mode?' '+mode:'');els.status.textContent=title;els.sub.textContent=sub;}
  function clearStats(){
    els.mMove.textContent=els.mDepth.textContent=els.mNodes.textContent=els.mTime.textContent='—';
    for(const {row,bar,label}of bars){bar.style.width='0';label.textContent='—';row.style.opacity='1';row.classList.remove('best');}
    els.analysisCaption.textContent='方向评估';els.analysisNote.textContent='分数越高，AI 越倾向选择该方向；不是获胜概率。';
    setStatus('','随时可以接手','自己玩，也可以让 AI 帮你想下一步。');
  }
  function updateStats(r){
    const now=performance.now();if(autoplay&&now-lastStatsPaint<100)return;lastStatsPaint=now;
    els.mMove.textContent=arrows[r.best]+' '+names[r.best];els.mDepth.textContent=r.engine==='forced'?'唯一方向':r.depth;
    els.mNodes.textContent=compact(r.nodes);els.mTime.textContent=(r.cached?'复用 · ':'')+Math.round(r.time)+' ms';
    els.analysisCaption.textContent=autoplay?'上一步的方向评估':'当前棋盘的方向评估';
    els.analysisNote.textContent=r.verified?'推荐方向已通过额外的生存复核；条形显示常规搜索评分。':r.recovered?'深层搜索超时，显示已完整完成的浅层结果。':r.riskAborted?'生存复核达到计算上限，保留完整的常规搜索结果。':'相对评分用于比较方向，不代表获胜概率。';
    const vals=Object.values(r.scores).filter(Number.isFinite),min=Math.min(...vals),max=Math.max(...vals),range=max-min;
    for(const {row,bar,label}of bars){const d=row.dataset.dir,v=r.scores[d],valid=Number.isFinite(v);row.classList.toggle('best',d===r.best);row.style.opacity=valid?'1':'.5';bar.style.width=valid?(range<1e-9?100:12+88*(v-min)/range)+'%':'0';label.textContent=!valid?'不可移':d===r.best?'推荐':range<1e-9?'并列':Math.round((v-min)/range*100)+' 分';}
  }
  function showHint(dir){clearTimeout(hintTimer);els.hint.textContent=arrows[dir];els.hint.classList.add('show');hintTimer=setTimeout(()=>els.hint.classList.remove('show'),1200);}
  function toast(text){clearTimeout(toastTimer);els.toast.textContent=text;els.toast.classList.add('show');toastTimer=setTimeout(()=>els.toast.classList.remove('show'),1500);}
  function reportAIError(reason){autoplay=false;invalidateAI();destroyPool();releaseWake();cancelVisuals();flushRender();syncControls();setStatus('','AI 已暂停',String(reason?.message||reason||'未知错误').slice(0,160));announce('AI 已暂停，仍可手动继续。');}
  async function holdWake(){
    if(wakePending||wakeLock||!autoplay||!('wakeLock' in navigator)||document.visibilityState!=='visible')return;
    wakePending=true;try{const lock=await navigator.wakeLock.request('screen');if(!autoplay||document.visibilityState!=='visible'){await lock.release();return;}wakeLock=lock;lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;});}catch(_){}finally{wakePending=false;}
  }
  function releaseWake(){const lock=wakeLock;wakeLock=null;lock?.release().catch(()=>{});}
  function ensureAudio(){if(!soundOn)return null;if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;audioCtx=new AC();}if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});return audioCtx;}
  function tone(freq,dur=.05,vol=.025,type='sine',delay=0){const c=ensureAudio();if(!c)return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.02);}
  function soundMove(){tone(118,.035,.012,'triangle');}
  function soundSoft(f=180,v=.018){tone(f,.045,v,'sine');}
  function soundMerges(values){values.slice(0,3).forEach((v,i)=>tone(155*Math.pow(2,(Math.log2(v)-2)/16),.075,.018,'sine',i*.018));}
  function soundHint(){tone(430,.045,.012,'sine');tone(610,.06,.009,'sine',.045);}
  function soundMilestone(v){const b=v>=4096?330:294;tone(b,.16,.025);tone(b*1.25,.18,.018,'sine',.055);tone(b*1.5,.2,.014,'sine',.11);}
  function soundGameOver(){tone(180,.12,.018,'triangle');tone(135,.16,.014,'triangle',.09);}
  function syncSound(){els.soundBtn.setAttribute('aria-pressed',String(soundOn));els.soundBtn.title=soundOn?'关闭声音':'打开声音';els.soundIcon.style.opacity=soundOn?'1':'.45';}
  function toggleSound(){soundOn=!soundOn;storageSet('refined2048-sound',soundOn?'on':'off');syncSound();if(soundOn)soundSoft(360,.016);toast(soundOn?'声音已开启':'声音已关闭');}
  function syncSpeed(){const v=+els.speed.value;els.speedText.textContent=v===0?'极速':v+' ms';els.speed.setAttribute('aria-valuetext',v===0?'极速，无额外等待':`每步等待 ${v} 毫秒`);storageSet('refined2048-speed',String(v));}
  els.newBtn.onclick=()=>newGame();els.overlayNew.onclick=()=>newGame();els.undo.onclick=undo;els.hintBtn.onclick=()=>askAI('hint');els.autoBtn.onclick=toggleAuto;els.soundBtn.onclick=toggleSound;
  els.speed.oninput=()=>{syncSpeed();if(autoplay&&!aiBusy&&!queuedAutoResult)scheduleAuto();};
  for(const b of $$('.seg'))b.onclick=()=>setStrength(b.dataset.strength);
  document.addEventListener('pointerdown',()=>ensureAudio(),{once:true});
  document.addEventListener('keydown',e=>{
    const target=e.target;if(e.isComposing||e.altKey||e.metaKey||e.ctrlKey||target?.isContentEditable||target?.closest?.('input,textarea,select'))return;
    const dir={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',W:'up',s:'down',S:'down',a:'left',A:'left',d:'right',D:'right'}[e.key];
    if(dir){e.preventDefault();ensureAudio();if(!autoplay)doMove(dir);}
    else if(e.key===' '&&!target?.closest?.('button,summary,a')){e.preventDefault();ensureAudio();if(!e.repeat)toggleAuto();}
    else if((e.key==='h'||e.key==='H')&&!e.repeat&&!autoplay)askAI('hint');
    else if((e.key==='m'||e.key==='M')&&!e.repeat)toggleSound();
    else if(e.key==='Escape'&&autoplay)toggleAuto();
  });
  let pointer=null;
  els.wrap.addEventListener('pointerdown',e=>{if(autoplay||gameOver||e.target?.closest?.('button')||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};els.wrap.setPointerCapture?.(e.pointerId);});
  els.wrap.addEventListener('pointerup',e=>{const p=pointer;pointer=null;if(!p||p.id!==e.pointerId||autoplay||animating)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.max(Math.abs(dx),Math.abs(dy))>=24)doMove(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});
  els.wrap.addEventListener('pointercancel',()=>{pointer=null;});els.wrap.addEventListener('lostpointercapture',()=>{pointer=null;});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){save(true);releaseWake();if(animating)cancelVisuals();if(queuedAutoResult&&autoplay){const r=queuedAutoResult;queuedAutoResult=null;consumeAutoResult(r);}}else{if(autoplay)holdWake();if(!animating)flushRender();}});
  window.addEventListener('pagehide',()=>{save(true);autoplay=false;invalidateAI();destroyPool();releaseWake();cancelVisuals();});
  window.addEventListener('pageshow',e=>{if(e.persisted){syncControls();flushRender();setStatus('','已暂停','你可以继续手动玩，或再次让 AI 接手。');}});
  window.addEventListener('resize',()=>{if(animating){cancelVisuals();flushRender();if(queuedAutoResult&&autoplay){const r=queuedAutoResult;queuedAutoResult=null;consumeAutoResult(r);}}});
  window.addEventListener('error',e=>{if(aiBusy||autoplay)reportAIError(e.error||e.message);});
  window.addEventListener('unhandledrejection',e=>{if(aiBusy||autoplay)reportAIError(e.reason);});
  const savedSpeed=Number(storageGet('refined2048-speed','0'));els.speed.value=String(Number.isFinite(savedSpeed)?Math.min(520,Math.max(0,Math.round(savedSpeed/10)*10)):0);syncSpeed();syncSound();
  const saved=readSession();if(saved){board=saved.board;score=saved.score;moveCount=saved.moveCount;best=Math.max(best,score);gameOver=!canMove();clearStats();flushRender();syncControls();setStatus('',gameOver?'本局结束':'继续上次的棋局',gameOver?'可以开始新的一局。':'进度已保存，点击自动玩即可继续。');}else newGame(true);
})();
