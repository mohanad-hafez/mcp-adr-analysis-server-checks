import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {scanRepository} from './esm_check.mjs';
const scenario=process.env.ESM_SCENARIO;
if(!['baseline','controlled'].includes(scenario))throw Error('Unexpected scenario');
const fixture="import { getCurrentDirCompat } from './utils/directory-compat';\nexport const directory = getCurrentDirCompat;\nexport const legacyRequire = () => require('node:fs');\nexport const legacyModule = () => module.exports;\nexport const legacyDirectory = () => __dirname;\n";
if(scenario==='controlled')fs.writeFileSync('src/esm-validation-controlled.ts',fixture);
fs.mkdirSync('esm-evidence',{recursive:true});
const staticResult=scanRepository(), gates=[];
function run(name,command,args,timeout) {
  const start=Date.now(),result=spawnSync(command,args,{encoding:'utf8',timeout,maxBuffer:20*1024*1024,env:{...process.env,EXECUTION_MODE:'prompt-only',OPENAI_API_KEY:'',OPENROUTER_API_KEY:''}});
  fs.writeFileSync(`esm-evidence/${name}.log`,(result.stdout||'')+(result.stderr||''));
  gates.push({name,command:[command,...args],exit_code:result.status,signal:result.signal,error:result.error?.code||null,elapsed_ms:Date.now()-start});
}
run('build','npm',['run','build'],240000);
run('compiled-import','node',['--input-type=module','-e',"import {promises as fs} from 'node:fs'; await fs.readdir('./dist/src'); await import('./dist/src/index.js'); console.log('Main entry imports successfully');"],60000);
run('utility-tests','npx',['--no-install','vitest','run','tests/utils','--maxWorkers=2'],360000);
run('directory-helper','node',['--input-type=module','-e',"import path from 'node:path'; import {getCurrentDirCompat} from './dist/src/utils/directory-compat.js'; const dir=getCurrentDirCompat(import.meta.url); if(!dir||!path.isAbsolute(dir))process.exit(1); console.log('Absolute helper directory verified');"],60000);
const expectedTypes=['Missing .js extension','require() usage','module.exports usage','__dirname usage'];
const controlledMatches=scenario!=='controlled'||(staticResult.findings.length===4&&expectedTypes.every(type=>staticResult.findings.some(x=>x.type===type&&x.file==='src/esm-validation-controlled.ts')));
const result={schema:1,scenario,input_origin:scenario==='baseline'?'unmodified frozen original source':'explicit controlled source violation fixture',static:staticResult,gates,controlled_expectation_matched:controlledMatches,passed:staticResult.findings.length===0&&gates.every(x=>x.exit_code===0),model_calls:0};
fs.writeFileSync('esm-evidence/result.json',JSON.stringify(result,null,2)+'\n');
if(!controlledMatches)throw Error('Controlled findings disagree with frozen expectation; suppress publication');
console.log(JSON.stringify({scenario,findings:staticResult.findings.length,gates:gates.map(x=>({name:x.name,exit_code:x.exit_code}))}));
