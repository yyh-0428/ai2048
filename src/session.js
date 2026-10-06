// Portable game saves. Validation is shared by local restore and file import.
const Game2048Save=(()=>{
  'use strict';
  const MAX_BYTES=65536;
  function validateGame(s,legacy=false){
    if(!s||!Array.isArray(s.board)||s.board.length!==16||!s.board.some(Boolean))return null;
    if(!s.board.every(v=>Number.isSafeInteger(v)&&v>=0&&(v===0||(v>=2&&2**Math.round(Math.log2(v))===v))))return null;
    if(!Number.isSafeInteger(s.score)||s.score<0)return null;
    const moves=legacy&&(!Number.isSafeInteger(s.moveCount)||s.moveCount<0)?0:s.moveCount;
    if(!Number.isSafeInteger(moves)||moves<0)return null;
    return {board:s.board.slice(),score:s.score,moveCount:moves};
  }
  function encode(game){
    const clean=validateGame(game);if(!clean)throw new Error('当前棋局无法导出。');
    return JSON.stringify({format:'2048-ai-save',version:1,createdAt:new Date().toISOString(),game:clean},null,2)+'\n';
  }
  function decode(text){
    if(typeof text!=='string'||text.length>MAX_BYTES)throw new Error('存档过大，未替换当前棋局。');
    let s;try{s=JSON.parse(text);}catch{throw new Error('这不是有效的 JSON 存档。');}
    if(s?.format!=='2048-ai-save'||s.version!==1)throw new Error('不支持这个存档格式或版本。');
    const clean=validateGame(s.game);if(!clean)throw new Error('存档中的棋盘、分数或步数不合法。');
    return clean;
  }
  return {MAX_BYTES,validateGame,encode,decode};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Game2048Save;
