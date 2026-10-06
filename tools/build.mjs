// No bundler or network dependencies. Ship a double-clickable, self-contained HTML.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const [page,rules,session,workerSource,coordinator,ui]=await Promise.all(
  ['src/page.html','src/rules.js','src/session.js','src/worker.js','src/coordinator.js','src/ui.js'].map(read));
// Keep embedded and external WASM synchronized on every build.
const [core,survival]=await Promise.all(['v102_ai.wasm','survival_v9_1.wasm'].map(p=>readFile(new URL(p,root))));
if(!/const V102_WASM_B64='[^']+'/.test(workerSource)||!/const SURVIVAL_WASM_B64='[^']+'/.test(workerSource))throw new Error('Missing embedded WASM source');
const counterfactual=await read('src/counterfactual.js');
let model;try{model=await read('models/v118-survival.json');}catch(e){if(e.code!=='ENOENT')throw e;model='null';}
const learned=(await read('src/learned-survival.js')).replace(/\/\/ LEARNED_SURVIVAL_MODEL_START[\s\S]*?\/\/ LEARNED_SURVIVAL_MODEL_END/,()=>'// LEARNED_SURVIVAL_MODEL_START\nconst LEARNED_SURVIVAL_MODEL='+JSON.stringify(JSON.parse(model))+';\n// LEARNED_SURVIVAL_MODEL_END');
await writeFile(new URL('src/learned-survival.js',root),learned);
if(!workerSource.includes('// COUNTERFACTUAL_SOURCE_START'))throw new Error('Missing planner source marker');
const worker=workerSource.replace(/\/\/ COUNTERFACTUAL_SOURCE_START[\s\S]*?\/\/ COUNTERFACTUAL_SOURCE_END/,()=>'// COUNTERFACTUAL_SOURCE_START\n'+counterfactual+'\n// COUNTERFACTUAL_SOURCE_END').replace(/const V102_WASM_B64='[^']+'/,`const V102_WASM_B64='${core.toString('base64')}'`)
  .replace(/const SURVIVAL_WASM_B64='[^']+'/,`const SURVIVAL_WASM_B64='${survival.toString('base64')}'`);
await writeFile(new URL('src/worker.js',root),worker);
const inert=(id,source)=>`<script id="${id}" type="text/plain">\n${source.replace(/<\/script/gi,'<\\/script')}\n</script>`;
const html=page.replace('<!-- WORKER_SOURCE -->',()=>inert('ai-worker-source',worker)+'\n'+inert('ai-coordinator-source',rules+'\n'+counterfactual+'\n'+learned+'\n'+coordinator))
  .replace('<!-- UI_SOURCE -->',()=>`<script>\n${rules}\n${session}\n${ui}\n</script>`);
await writeFile(new URL('2048-ai.html',root),html);
console.log(`Built 2048-ai.html (${Buffer.byteLength(html)} bytes)`);
