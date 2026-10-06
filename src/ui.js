(()=>{
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const {moveBoardPlain,moveBoardDetailed,legalRootBranches}=Game2048;
  const els={score:$('#score'),best:$('#best'),maxTile:$('#maxTile'),tiles:$('#tiles'),motion:$('#motionLayer'),wrap:$('#boardWrap'),undo:$('#undoBtn'),newBtn:$('#newBtn'),overlay:$('#gameOverlay'),overlayNew:$('#overlayNew'),gameOverText:$('#gameOverText'),hint:$('#hintArrow'),hintBtn:$('#hintBtn'),autoBtn:$('#autoplayBtn'),speed:$('#speed'),speedText:$('#speedText'),dot:$('#aiDot'),status:$('#aiStatusText'),sub:$('#aiSubText'),mMove:$('#mMove'),mDepth:$('#mDepth'),mNodes:$('#mNodes'),mTime:$('#mTime'),strengthCaption:$('#strengthCaption'),soundBtn:$('#soundBtn'),soundIcon:$('#soundIcon'),toast:$('#toast'),live:$('#liveStatus'),analysisCaption:$('#analysisCaption'),analysisNote:$('#analysisNote'),exportBtn:$('#exportBtn'),importBtn:$('#importBtn'),saveFile:$('#saveFile'),counterfactual:$('#counterfactualToggle'),learnedSurvival:$('#learnedSurvivalToggle'),learnedGuard:$('#learnedGuardToggle')};
  const arrows={up:'↑',down:'↓',left:'←',right:'→'},names={up:'上',down:'下',left:'左',right:'右'};
  const captions={fast:'轻快 · 优先速度',strong:'深入 · 高速拥挤盘精算',extreme:'极致 · 高速残局深搜',god:'神级 · 高分残局共识复核'};
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  function storageGet(k,fallback=null){try{return localStorage.getItem(k)??fallback;}catch(_){return fallback;}}
  function storageSet(k,v){try{localStorage.setItem(k,v);return true;}catch(_){return false;}}
  let board=Array(16).fill(0),score=0,history=[],moveCount=0,revision=0;
  let best=Number(storageGet('refined2048-best',storageGet('ai2048-best','0')))||0;
  if(!Number.isFinite(best)||best<0)best=0;
  let gameOver=false,animating=false,autoplay=false,aiBusy=false,queuedAutoResult=null;
  let strength=storageGet('refined2048-strength','god');if(!captions[strength])strength='god';
  const COUNTERFACTUAL_DEFAULT=false;
  const LEARNED_GUARD_DEFAULT=false;
  let learnedGuardEnabled=storageGet('refined2048-learned-guard-v118',LEARNED_GUARD_DEFAULT?'on':'off')==='on';
  const LEARNED_TRAJECTORY_DEFAULT=false;
  let learnedTrajectoryEnabled=storageGet('refined2048-learned-trajectory-v118',LEARNED_TRAJECTORY_DEFAULT?'on':'off')==='on';
  const LEARNED_SURVIVAL_DEFAULT=false;
  let learnedSurvivalEnabled=storageGet('refined2048-learned-survival-v118',LEARNED_SURVIVAL_DEFAULT?'on':'off')==='on';
  let counterfactualEnabled=storageGet('refined2048-counterfactual-v118',COUNTERFACTUAL_DEFAULT?'on':'off')==='on';
  let soundOn=storageGet('refined2048-sound','on')!=='off',audioCtx=null;
  let reqId=0,activeReq=0,coordinator=null,workers=[],workerURLs=[],watchdog=0,autoTimer=0,autoReadyAt=0;
  let animationTimer=0,animationFrame=0,visualEpoch=0,paintTimer=0,paintFrame=0,lastPaint=0;
  let hintTimer=0,toastTimer=0,lastSaved=0,lastStatsPaint=0,lastStatusPaint=0,lastSound=0,wakeLock=null,wakePending=false;
  let newIndex=-1,mergedIndices=[],exportURL=null,importToken=0;
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
    try{return Game2048Save.validateGame(JSON.parse(storageGet('refined2048-session','null')),true);}catch{return null;}
  }
  function exportSave(){
    let link=null;
    try{
      const text=Game2048Save.encode(snapshot());
      if(exportURL)URL.revokeObjectURL(exportURL);
      exportURL=URL.createObjectURL(new Blob([text],{type:'application/json'}));
      link=document.createElement('a');link.href=exportURL;link.download=`2048-v11.8-${new Date().toISOString().slice(0,10)}-${score}.json`;
      link.hidden=true;document.body.appendChild(link);link.click();toast('已准备存档下载');
    }catch{toast('无法导出，请稍后重试。');}finally{link?.remove();}
  }
  async function importSave(file){
    if(!file)return false;
    const token=++importToken,rev=revision;
    try{
      if(!Number.isFinite(file.size)||file.size>Game2048Save.MAX_BYTES)throw new Error('存档过大，未替换当前棋局。');
      const game=Game2048Save.decode(await file.text());
      if(token!==importToken||revision!==rev||autoplay){if(token===importToken)toast('棋局已变化，请重新选择要导入的存档。');return false;}
      const before=snapshot();invalidateAI();cancelVisuals();releaseWake();history=[before];
      board=game.board;score=game.score;moveCount=game.moveCount;best=Math.max(best,score);revision++;gameOver=!canMove();newIndex=-1;mergedIndices=[];
      clearStats();flushRender();syncControls();save(true);setStatus('',gameOver?'本局结束':'已恢复存档',gameOver?'可以撤销导入，或开始新的一局。':'可以继续走棋；撤销一步可恢复导入前的棋局。');toast('已恢复存档');announce('已恢复存档。');return true;
    }catch(error){if(token===importToken)toast(error instanceof Error?error.message:'无法读取这个存档文件。');return false;}
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
      animationTimer=setTimeout(()=>{if(epoch!==visualEpoch)return;cancelVisuals();flushRender();tryConsumeQueuedAuto();},duration+16);
    });});
  }
  function syncControls(){
    els.autoBtn.classList.toggle('on',autoplay);els.autoBtn.textContent=autoplay?'暂停 AI':'自动玩';els.autoBtn.setAttribute('aria-pressed',String(autoplay));
    els.hintBtn.disabled=autoplay||aiBusy||gameOver;els.hintBtn.textContent=aiBusy&&!autoplay?'思考中…':'提示一步';
    els.undo.disabled=!history.length||autoplay||animating;
    for(const b of $$('.seg')){b.disabled=autoplay;b.classList.toggle('on',b.dataset.strength===strength);b.setAttribute('aria-pressed',String(b.dataset.strength===strength));}
    els.learnedGuard.checked=learnedGuardEnabled;els.learnedGuard.disabled=autoplay||strength!=='god'||!counterfactualEnabled;
    const trajectory=$('#trajectoryToggle');trajectory.checked=learnedTrajectoryEnabled;trajectory.disabled=autoplay||strength!=='god'||!counterfactualEnabled;
    els.learnedSurvival.checked=learnedSurvivalEnabled;els.learnedSurvival.disabled=autoplay||strength!=='god';
    els.counterfactual.checked=counterfactualEnabled;els.counterfactual.disabled=autoplay||strength!=='god';
    els.strengthCaption.textContent=strength==='god'&&learnedSurvivalEnabled?'神级 · 学习型生存复核':strength==='god'&&counterfactualEnabled&&learnedTrajectoryEnabled?'神级 · 分阶段续命仲裁':strength==='god'&&counterfactualEnabled?'神级 · 反事实续命规划':captions[strength];els.wrap.classList.toggle('autoplay',autoplay);
  }
  function invalidateAI(){
    activeReq=++reqId;clearTimeout(autoTimer);clearTimeout(watchdog);autoTimer=watchdog=0;
    aiBusy=false;queuedAutoResult=null;autoReadyAt=0;coordinator?.postMessage({type:'cancel'});
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
    coordinator.postMessage({type:'analyze',id,revision,board:board.slice(),strength,policyOptions:{counterfactual:counterfactualEnabled,learnedSurvival:learnedSurvivalEnabled,learnedGuard:learnedGuardEnabled,learnedTrajectory:learnedTrajectoryEnabled,trajectoryEscape:learnedTrajectoryEnabled,trajectoryAssetGuard:learnedTrajectoryEnabled}});
  }
  function finishAI(r){
    if(r.id!==activeReq||r.revision!==revision)return;
    clearTimeout(watchdog);watchdog=0;aiBusy=false;
    if(!r.best){if(!canMove())endGame();syncControls();return;}
    updateStats(r);if(!autoplay)syncControls();
    if(autoplay){
      const now=performance.now();if(now-lastStatusPaint>=100){lastStatusPaint=now;setStatus('active','自动玩中',`第 ${moveCount+1} 步 · ${r.trajectoryStageHeld?'长期路线复核保留原方向':r.trajectoryEscaped?'强模拟续命证据支持换招':r.trajectoryPromoted?'长期续命评估支持换招':r.plannerChanged?'已按后续风险调整方向':r.learnedChanged?'学习模型已一致支持换招':r.ceilingConsensus?'高分残局已深度共识':r.verified?'已复核危险方向':r.engine.startsWith('js')?'大数字兼容搜索':'持续思考，随时可以暂停'}`);}
      queuedAutoResult=r;tryConsumeQueuedAuto();
    }else{
      setStatus('',`建议 ${arrows[r.best]} ${names[r.best]}`,r.engine==='forced'?'当前只有这一个可移动方向。':r.cached?'复用同一棋盘的完整分析结果。':r.recovered?'本次深搜超时，已返回完整的浅层分析。':r.trajectoryStageHeld?'长期预测提示换招可能损失后续续命余量，保留原方向。':r.trajectoryEscaped?'两组模拟均出现较强的逃生收益，已在安全约束内采用换招。':r.trajectoryPromoted?'短期模拟存活不降，长期续命优势已由另一组未来确认。':r.plannerChanged?'模拟中尾部存活较好的方向已通过另一组未来复核。':r.learnedChanged?'多个学习模型共同支持存活机会更好的方向。':r.terminalRescued?'残局方向已按完整短期生存复核重新选择。':r.ceilingConsensus?'高分临界局面已通过更深层共识复核。':r.ceilingRejected?'更深层判断未形成共识，保留稳定的原始选择。':r.verified?'已对危险方向做额外复核。':'留出空间，让相同数字更容易合并。');
      showHint(r.best);announce(`建议向${names[r.best]}移动。`);soundHint();
    }
  }
  function tryConsumeQueuedAuto(){
    if(!queuedAutoResult||!autoplay||gameOver||animating)return;
    const wait=autoReadyAt-performance.now();
    if(wait>1){
      clearTimeout(autoTimer);const rev=queuedAutoResult.revision;
      autoTimer=setTimeout(()=>{autoTimer=0;if(autoplay&&queuedAutoResult?.revision===rev)tryConsumeQueuedAuto();},wait);return;
    }
    clearTimeout(autoTimer);autoTimer=0;const r=queuedAutoResult;queuedAutoResult=null;consumeAutoResult(r);
  }
  function scheduleAuto(){
    clearTimeout(autoTimer);autoTimer=0;if(!autoplay||gameOver)return;
    // Start thinking immediately and use the configured move interval only as
    // a presentation gate. Search now overlaps animation/idle time instead of
    // being added after it; turbo (0 ms) retains the old throughput path.
    autoReadyAt=performance.now()+(+els.speed.value);askAI('auto');
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
    if(document.visibilityState!=='visible')save();
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
    els.analysisNote.textContent=r.trajectoryStageHeld?'大块阶段保留长期路线复核的否决，按原有完整搜索选择方向；模型判断仍可能有误。':r.trajectoryEscaped?'两组模拟中，逃生换招的续命收益较强且逐路径损失受限，支持推翻长期模型的否决；仍可能退步。方向条显示原主搜索评分。':r.trajectoryPromoted?'两组模拟均保留短期存活，长期模型支持后续续命余量更好的方向；这不是胜率保证。方向条显示原主搜索评分。':r.plannerChanged?'在两组模拟未来中，推荐方向的尾部存活更好；方向条仍显示原有完整搜索评分。':r.learnedChanged?'多个模型一致支持较好的长程存活机会；这是学习预测，方向条仍显示原有完整搜索评分。':r.proofCertified?(r.projectionApplied?'大数字局面经有限视野投影后，当前方向通过短期安全证明；条形仍显示原棋盘评分。':'当前方向已通过短期安全证明；这不代表整局不会失败。'):r.terminalRescued?'所有方向的常规评分均已降至终局底值，已按完整短期生存复核选择方向；这不保证长期存活。':r.ceilingConsensus?'高分临界局面已通过跨深度共识复核；条形显示最终采用深度的评分。':r.ceilingRejected?'更深层搜索出现排序振荡，已回退完整 d4 结果。':r.verified?'推荐方向已通过额外的生存复核；条形显示常规搜索评分。':r.projectionApplied&&r.riskChecked?'已完成大数字生存复核；条形仍显示原棋盘搜索评分。':r.recovered?'深层搜索超时，显示已完整完成的浅层结果。':r.riskAborted?'生存复核达到计算上限，保留完整的常规搜索结果。':'相对评分用于比较方向，不代表获胜概率。';
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
  els.exportBtn.onclick=exportSave;
  els.importBtn.onclick=()=>{importToken++;if(autoplay)toggleAuto();els.saveFile.value='';els.saveFile.click();};
  els.saveFile.onchange=()=>{const file=els.saveFile.files?.[0];void importSave(file);};
  els.speed.oninput=()=>{syncSpeed();if(autoplay&&!aiBusy&&!queuedAutoResult)scheduleAuto();};
  els.learnedGuard.onchange=()=>{if(autoplay||strength!=='god'||!counterfactualEnabled){syncControls();return;}const enabled=!!els.learnedGuard.checked;invalidateAI();learnedGuardEnabled=enabled;storageSet('refined2048-learned-guard-v118',enabled?'on':'off');clearStats();syncControls();};
  $('#trajectoryToggle').onchange=()=>{if(autoplay||strength!=='god'||!counterfactualEnabled){syncControls();return;}const enabled=!!$('#trajectoryToggle').checked;invalidateAI();learnedTrajectoryEnabled=enabled;storageSet('refined2048-learned-trajectory-v118',enabled?'on':'off');clearStats();syncControls();};
  els.learnedSurvival.onchange=()=>{if(autoplay||strength!=='god'){syncControls();return;}const enabled=!!els.learnedSurvival.checked;invalidateAI();learnedSurvivalEnabled=enabled;storageSet('refined2048-learned-survival-v118',enabled?'on':'off');clearStats();syncControls();};
  els.counterfactual.onchange=()=>{if(autoplay||strength!=='god'){syncControls();return;}const enabled=!!els.counterfactual.checked;invalidateAI();counterfactualEnabled=enabled;storageSet('refined2048-counterfactual-v118',counterfactualEnabled?'on':'off');clearStats();syncControls();};
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
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){save(true);releaseWake();if(animating)cancelVisuals();autoReadyAt=0;tryConsumeQueuedAuto();}else{if(autoplay)holdWake();if(!animating)flushRender();}});
  window.addEventListener('pagehide',()=>{importToken++;if(exportURL)URL.revokeObjectURL(exportURL);exportURL=null;save(true);autoplay=false;invalidateAI();destroyPool();releaseWake();cancelVisuals();});
  window.addEventListener('pageshow',e=>{if(e.persisted){syncControls();flushRender();setStatus('','已暂停','你可以继续手动玩，或再次让 AI 接手。');}});
  window.addEventListener('resize',()=>{if(animating){cancelVisuals();flushRender();tryConsumeQueuedAuto();}});
  window.addEventListener('error',e=>{if(aiBusy||autoplay)reportAIError(e.error||e.message);});
  window.addEventListener('unhandledrejection',e=>{if(aiBusy||autoplay)reportAIError(e.reason);});
  const savedSpeed=Number(storageGet('refined2048-speed','0'));els.speed.value=String(Number.isFinite(savedSpeed)?Math.min(520,Math.max(0,Math.round(savedSpeed/10)*10)):0);syncSpeed();syncSound();
  const saved=readSession();if(saved){board=saved.board;score=saved.score;moveCount=saved.moveCount;best=Math.max(best,score);gameOver=!canMove();clearStats();flushRender();syncControls();setStatus('',gameOver?'本局结束':'继续上次的棋局',gameOver?'可以开始新的一局。':'进度已保存，点击自动玩即可继续。');}else newGame(true);
})();
