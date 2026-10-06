import {spawnSync} from 'node:child_process';

const files=[
  'tests/regression.cjs',
  'tests/coordinator.cjs',
  'tests/upgrades-v9.3.cjs',
  'tests/upgrades-v9.4.cjs',
  'tests/proof-v10.cjs',
  'tests/proof-tristate-v10.cjs',
  'tests/session-proof-v10.cjs',
  'tests/integration-v10.cjs',
  'tests/v102.cjs',
  'tests/v103.cjs',
  'tests/v104.cjs',
  'tests/v105.cjs',
  'tests/v106.cjs',
  'tests/v107.cjs',
  'tests/v113.cjs',
  'tests/v114.cjs',
  'tests/v115.cjs',
  'tests/v116.cjs',
  'tests/v117.cjs',
  'tests/v118.cjs',
  'tests/learned-v118.cjs'
];
let total=0;
for(const file of files){
  console.log(`\n=== ${file} ===`);
  const r=spawnSync(process.execPath,['--test','--test-concurrency=1',file],{stdio:'inherit'});
  if(r.error)throw r.error;
  if(r.status!==0)process.exit(r.status??1);
  total++;
}
console.log(`\nV11.8 test groups passed: ${total}/${files.length}.`);
