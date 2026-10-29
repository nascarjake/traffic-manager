import {mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of ['index.html','src','licenses','credits.json'])await cp(f,`dist/${f}`,{recursive:true});
await cp('public','dist',{recursive:true});console.log('Built self-contained WebGL game to dist/');
