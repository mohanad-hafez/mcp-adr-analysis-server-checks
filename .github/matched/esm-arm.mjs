import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const mode = process.argv[2];
const result = JSON.parse(fs.readFileSync('esm-evidence/result.json','utf8'));
const evidence = 'esm-evidence';
if (mode==='fixture') {
  const candidates = [];
  function scan(directory) {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const file=path.posix.join(directory,entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile()&&file.endsWith('.ts')) {
        const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
        for (const [index,code] of lines.entries()) {
          const relative=code.match(/(?:\bfrom\s*|^\s*import\s*)['"](?<target>\.[^'"]+)['"]/);
          const suspicious=relative&&!/\.(?:js|json)$/.test(relative.groups.target) ||
            /\brequire\s*\(|\bmodule\s*\.\s*exports\b|\b__dirname\b/.test(code);
          if (suspicious) candidates.push({file,line:index+1,code});
        }
      }
    }
  }
  scan('src');
  const config = {
    inputs:{
      project:{package_type:JSON.parse(fs.readFileSync('package.json','utf8')).type,scanned_typescript_files:result.static.files},
      candidates,
      gates:result.gates.map(({name,exit_code})=>({name,exit_code})),
    },
    output_description:'Submit JSON with passed boolean and findings array. Each finding has type, file, and numeric line.',
  };
  const bytes=JSON.stringify(config,null,2)+'\n';
  assert(Buffer.byteLength(bytes)<46000,'Candidate workload exceeds review budget');
  fs.writeFileSync(evidence+'/fixture.json',bytes);
} else {
  const ordered = rows=>rows.map(({type,file,line})=>({type,file,line}))
    .sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.type.localeCompare(b.type));
  const expected={passed:result.passed,findings:ordered(result.static.findings)};
  if (process.env.ARM==='agent') {
    const calls=fs.readFileSync(evidence+'/tools.jsonl','utf8').trim().split('\n').map(JSON.parse);
    assert(calls.every(call=>!call.error));
    assert.deepEqual([...new Set(calls.slice(0,-1).map(call=>call.args.name))].sort(),['candidates','gates','project']);
    assert.equal(calls.at(-1).name,'publish_result');
    const proposal=JSON.parse(calls.at(-1).args.body);
    assert.deepEqual({passed:proposal.passed,findings:ordered(proposal.findings)},expected);
  }
  fs.writeFileSync(evidence+'/verified.json',JSON.stringify(expected));
}
