import assert from 'node:assert/strict';
import {scanText} from './esm_check.mjs';
const cases=[
 ['valid static import',"import {x} from './x.js';",[]],
 ['JSON exception',"import x from './x.json';",[]],
 ['missing extension',"import {x} from './x';",['Missing .js extension']],
 ['reexport',"export {x} from './x.ts';",['Missing .js extension']],
 ['comment and string',"// require('x'); __dirname; module.exports\nconst x = \"require('x')\";",[]],
 ['actual require',"const x = require('node:fs');",['require() usage']],
 ['module export',"module.exports = {};",['module.exports usage']],
 ['directory usage',"const x = __dirname;",['__dirname usage']],
 ['mock exclusion',"const mock = require('test');",[]],
 ['side effect import',"import './setup';",['Missing .js extension']],
];
for(const [name,input,expected]of cases)assert.deepEqual(scanText('case.ts',input).map(x=>x.type),expected,name);
console.log(`${cases.length} explicit syntax cases passed`);
