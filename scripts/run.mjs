import { spawn } from 'node:child_process';
const mode = process.argv[2];
if (!['development', 'production'].includes(mode)) throw new Error('Modo inválido');
const child = spawn(process.execPath, mode === 'production' ? ['dist/index.js'] : ['--import','tsx','--watch','server/_core/index.ts'], {stdio:'inherit', env:{...process.env, NODE_ENV:mode}});
child.on('exit',code=>{process.exitCode=code ?? 1;});
