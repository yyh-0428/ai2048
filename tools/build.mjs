// No bundler or network dependencies. Ship a double-clickable, self-contained HTML.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const [page,rules,worker,coordinator,ui]=await Promise.all(
  ['src/page.html','src/rules.js','src/worker.js','src/coordinator.js','src/ui.js'].map(read));
const inert=(id,source)=>`<script id="${id}" type="text/plain">\n${source.replace(/<\/script/gi,'<\\/script')}\n</script>`;
const html=page.replace('<!-- WORKER_SOURCE -->',()=>inert('ai-worker-source',worker)+'\n'+inert('ai-coordinator-source',rules+'\n'+coordinator))
  .replace('<!-- UI_SOURCE -->',()=>`<script>\n${rules}\n${ui}\n</script>`);
// 两个文件名写同一份产物：2048-ai.html 供本地 Mac 启动脚本使用，
// index.html 供 GitHub Pages 在仓库根目录直接托管。
await Promise.all(['2048-ai.html','index.html'].map(name=>writeFile(new URL(name,root),html)));
console.log(`Built 2048-ai.html + index.html (${Buffer.byteLength(html)} bytes each)`);
