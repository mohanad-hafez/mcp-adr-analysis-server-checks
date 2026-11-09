import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';

export function scanText(file, text) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const lines=text.split(/\r?\n/), findings=[];
  function add(type,node) {
    const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line;
    findings.push({type,file,line:line+1,code:lines[line].trim()});
  }
  function relativeImport(node) {
    const value=node?.text;
    if(typeof value==='string' && value.startsWith('.') && !value.endsWith('.js') && !value.endsWith('.json'))add('Missing .js extension',node);
  }
  function visit(node) {
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))relativeImport(node.moduleSpecifier);
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require') {
      const line=lines[source.getLineAndCharacterOfPosition(node.getStart(source)).line];
      // Retain the source's explicit mock/Jest exclusion; comments are absent from AST expressions.
      if(!line.includes('mock')&&!line.includes('jest'))add('require() usage',node);
    }
    if(ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='module'&&node.name.text==='exports')add('module.exports usage',node);
    if(ts.isIdentifier(node)&&node.text==='__dirname') {
      const propertyName=ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node;
      if(!propertyName)add('__dirname usage',node);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  return findings;
}
export function scanRepository(root='.') {
  const findings=[];
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(pkg.type!=='module')findings.push({type:'package.json type',file:'package.json',line:1,code:'type must be module'});
  let files=0;
  function walk(dir) {
    for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=path.posix.join(dir,entry.name);
      if(entry.isDirectory())walk(file);
      else if(entry.isFile()&&file.endsWith('.ts')) {files++;findings.push(...scanText(file,fs.readFileSync(path.join(root,file),'utf8')))}
    }
  }
  walk('src');return {files,findings};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const result=scanRepository();fs.writeFileSync('esm-static.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({files:result.files,findings:result.findings.length}));
}
