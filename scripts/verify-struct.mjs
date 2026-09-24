import { execFileSync } from 'node:child_process';
const run = (sql) =>
  execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', '-e', sql], { encoding: 'utf8' });

const t = 'events';
const out = run(`SELECT column_name FROM information_schema.columns WHERE table_schema='bonplaninfos' AND table_name='${t}'`);
console.log('len:', out.length);
console.log(JSON.stringify(out.slice(0, 80)));
console.log('split:', JSON.stringify(out.trim().split('\n').filter(Boolean).slice(0, 3)));