const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Worker:Thread,MessageChannel}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
const rules=require('../src/rules.js');
const originalPath=process.env.BASELINE_HTML||path.resolve(root,'tests/fixtures/v9.1.html');
const scripts=html=>({worker:html.match(/<script id="ai-worker-source" type="text\/plain">([\s\S]*?)<\/script>/)[1],ui:[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1]});
const prefix=`const {parentPort}=require('node:worker_threads');globalThis.onmessage=null;globalThis.postMessage=x=>parentPort.postMessage(x);parentPort.on('message',data=>Promise.resolve(globalThis.onmessage({data})).catch(e=>{throw e}));\n`;
function thread(source){return new Thread(prefix+source,{eval:true});}
function element(tag='div'){
 const e={tagName:tag.toUpperCase(),textContent:'',className:'',dataset:{},style:{setProperty(k,v){this[k]=v}},children:[],hidden:false,disabled:false,value:'0',attrs:{},listeners:{},isConnected:true,
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);},getAttribute(k){return this.attrs[k]??null;},
  appendChild(c){c.parentNode=this;this.children.push(c);return c;},replaceChildren(...c){this.children=c;},
  addEventListener(k,f){(this.listeners[k]??=[]).push(f)},setPointerCapture(){},
  dispatch(k,data={}){for(const f of this.listeners[k]||[])f({target:this,...data});},
  closest(selectors){const tags=selectors.split(',').map(s=>s.trim().toUpperCase());return tags.includes(this.tagName)?this:this.parentNode?.closest(selectors)||null;},
  querySelector(sel){return this.children.find(c=>c.tagName.toLowerCase()===sel)||null;}
 };
 e.classList={add(...cs){const set=new Set(e.className.split(/\s+/).filter(Boolean));cs.forEach(c=>set.add(c));e.className=[...set].join(' ')},remove(...cs){e.className=e.className.split(/\s+/).filter(c=>!cs.includes(c)).join(' ')},contains(c){return e.className.split(/\s+/).includes(c)},toggle(c,b){b=b??!this.contains(c);b?this.add(c):this.remove(c);return b;}};
 Object.defineProperty(e,'innerHTML',{set(v){e.children=[];},get(){return ''}});return e;
}
function dom(html){
 const ids=new Map();for(const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){const e=element(m[1]);e.className=m[2].match(/class="([^"]+)"/)?.[1]||'';e.hidden=/\bhidden\b/.test(m[2]);ids.set(m[3],e);}
 const segs=['fast','strong','extreme'].map(v=>{const e=element('button');e.dataset.strength=v;return e;});
 const cells=Array.from({length:16},()=>element());
 const rows=['up','left','right','down'].map(d=>{const e=element();e.dataset.dir=d;e.appendChild(element('i'));e.appendChild(element('span'));return e;});
 const d=element('document');d.documentElement=element('html');d.activeElement=element('body');d.visibilityState='visible';
 d.querySelector=s=>s[0]==='#'?ids.get(s.slice(1)):null;d.querySelectorAll=s=>s==='.seg'?segs:s==='.cell'?cells:s==='.move-row'?rows:[];
 d.createElement=element;d.createDocumentFragment=()=>element('fragment');return {document:d,ids,rows,segs,cells};
}
function uiHarness({baseline=false,realWorkers=false,reduced=true,uiDelay=0,session=null}={}){
 const html=fs.readFileSync(baseline?originalPath:path.join(root,'2048-ai.html'),'utf8'),parsed=scripts(html),d=dom(html);
 d.ids.get('ai-worker-source').textContent=parsed.worker;
 if(!baseline)d.ids.get('ai-coordinator-source').textContent=html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];
 const store=new Map([['refined2048-sound','off']]);if(session)store.set('refined2048-session',JSON.stringify(session));
 const workers=[],urls=new Map(),timers=new Map();let serial=0;
 class Worker{
  constructor(url){this.sent=[];workers.push(this);if(realWorkers){this.thread=thread(urls.get(url));this.thread.on('message',data=>{if(uiDelay)setTimeout(()=>this.onmessage?.({data}),uiDelay);else this.onmessage?.({data})});this.thread.on('error',e=>this.onerror?.(e));}}
  postMessage(data,ports){this.sent.push(data);this.thread?.postMessage(data,ports);}
  terminate(){this.terminated=true;return this.thread?.terminate();}
 }
 const setTimer=(f,t)=>{if(realWorkers){const id=setTimeout(f,t);timers.set(id,{f,t});return id;}const id=++serial;timers.set(id,{f,t});return id;};
 const clearTimer=id=>{if(realWorkers)clearTimeout(id);timers.delete(id)};
 const context={console,performance,WebAssembly,atob,MessageChannel,Blob:class{constructor(parts){this.source=parts.join('')}},URL:{createObjectURL(b){const key='blob:'+urls.size;urls.set(key,b.source);return key;},revokeObjectURL(){}},Worker,
  setTimeout:setTimer,clearTimeout:clearTimer,requestAnimationFrame:f=>setTimer(f,16),cancelAnimationFrame:clearTimer,queueMicrotask,Math,
  document:d.document,navigator:{hardwareConcurrency:4},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
  innerWidth:1365,matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({getPropertyValue:()=>11}),addEventListener(){}};
 context.window=context;context.globalThis=context;vm.createContext(context);
 const at=parsed.ui.lastIndexOf('})();');
 const hook=baseline?`globalThis.hook={set(s,mode='fast'){board=s.board.slice();score=s.score||0;moveCount=s.moveCount||0;strength=mode;gameOver=false;},state:()=>({board,score,moveCount,aiBusy,autoplay,animating,revision:0}),askAI,newGame,undo,doMove,toggleAuto,setStrength,ensurePool,destroyPool,render,finishAI, cfg,listen(cb){const original=finishAI;finishAI=(r,k)=>{original(r,k);cb(r)}}};`:
 `globalThis.hook={set(s,mode='fast'){board=s.board.slice();score=s.score||0;moveCount=s.moveCount||0;strength=mode;gameOver=false;revision++;},state:()=>({board,score,moveCount,aiBusy,autoplay,animating,revision,activeReq,queuedAutoResult}),askAI,newGame,undo,doMove,toggleAuto,setStrength,ensurePool,destroyPool,render,finishAI,listen(cb){const original=finishAI;finishAI=r=>{original(r);cb(r)}}};`;
 vm.runInContext(parsed.ui.slice(0,at)+hook+parsed.ui.slice(at),context);
 return {...d,context,hook:context.hook,workers,timers,store,flushOne(){const x=timers.entries().next();if(!x.done){const [id,{f}]=x.value;timers.delete(id);f();}},async close(){for(const id of timers.keys())clearTimer(id);await Promise.all(workers.map(w=>w.terminate()));}};
}
function engine(source){
 const c={console,performance,WebAssembly,atob,onmessage:null,postMessage(){}};vm.createContext(c);
 source=source.replace('return {analyze,analyzeRoot,analyzeExact,clearTT};','return {analyze,analyzeRoot,analyzeExact,clearTT,begin,maxNode,evaluate,rowMove,toRanks,moveBoard};');
 vm.runInContext(source+`\nglobalThis.api={wasmExact,wasmRiskAll,pack4,ready:Promise.all([WASM_READY,SURVIVAL_READY]),legacy:()=>typeof getLegacy==='function'?getLegacy():LEGACY,wasm:()=>WASM};`,c);
 return c.api;
}
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function spawn(board,random){const empty=board.map((v,i)=>v?-1:i).filter(i=>i>=0);if(empty.length)board[empty[Math.floor(random()*empty.length)]]=random()<.9?2:4;}
module.exports={root,originalPath,scripts,thread,dom,uiHarness,engine,rules,rng,spawn};
