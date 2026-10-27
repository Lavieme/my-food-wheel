import fs from 'node:fs';
import path from 'node:path';
const local=fs.existsSync('../app.js')?path.resolve('..'):path.resolve('../food-wheel');
const origin='https://food-wheel-lavieme.haivivi-8454.chatgpt.site';
const assets={};
for(const [route,file] of Object.entries({'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/lib/wheel-layout.mjs':'lib/wheel-layout.mjs'})){
 assets[route]={type:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(local,file),'utf8')};
}
assets['/config.js']={type:'text/javascript',body:`window.FOOD_WHEEL_CONFIG=${JSON.stringify({mode:'online',apiOrigin:origin})};`};
fs.writeFileSync('lib/food-wheel-assets.mjs',`// Generated from the GitHub frontend by scripts/sync-food-wheel.mjs.\nexport default ${JSON.stringify(assets)};\n`);
for(const f of ['lib/decision.mjs','lib/room-service.mjs','cloud/api.mjs'])fs.copyFileSync(path.join(local,f),f);
console.log('Synced frontend and room API; no runtime data included.');
