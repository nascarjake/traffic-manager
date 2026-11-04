import {mkdir,cp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of ['index.html','src','licenses','credits.json'])await cp(f,`dist/${f}`,{recursive:true});
await cp('public','dist',{recursive:true});
// Version the application's module graph so a release cannot mix cached physics/UI modules.
const {createHash}=await import('node:crypto'),files=(await readdir('src')).filter(f=>/\.(js|css)$/.test(f)).sort(),hash=createHash('sha256');
for(const file of files)hash.update(await readFile(`src/${file}`));
const version=hash.digest('hex').slice(0,12);
for(const file of files.filter(f=>f.endsWith('.js'))){const path=`dist/src/${file}`,source=await readFile(path,'utf8');await writeFile(path,source.replace(/((?:from\s*|import\s*\()\s*['"])(\.{1,2}\/[^'"]+\.js)(['"])/g,`$1$2?v=${version}$3`));}
const html=await readFile('dist/index.html','utf8');await writeFile('dist/index.html',html.replace('./src/main.js',`./src/main.js?v=${version}`).replace('./src/style.css',`./src/style.css?v=${version}`));
console.log(`Built self-contained WebGL game to dist/ (${version})`);
