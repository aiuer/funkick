const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const current = JSON.parse(fs.readFileSync(path.join(root, 'assets/yuanxin/current.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/yuanxin', current.manifest)));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-resources-'));
const pairs = [
  ['Camera_1040g3k831kjujm602u705p3b5123oj18bg7r3q8.jpg', 'img-1758200674074007VIUwNly1i5i4b5p93og30in0b4kjn.gif'],
  ['img-176190274814781f2086cb27e79cd9eab6fadc1c7a2ca74b747b086fafad30274c5cacecf95c6.jpg', '008tfVllly1ianvt36tg5g30qy0hye8b.gif']
];

async function checkReward(page, source, screenshot, reduced = false) {
  await page.evaluate(async source => {
    const photo = themePack('yuanxin').photos.find(photo => photo.source === source);
    __game.theme='yuanxin';
    await __start('relax');
    const pic = {id:'yuanxin:'+photo.id,key:'yuanxin:'+photo.id,kind:'pack',url:photo.data,
      title:photo.title,effects:photo.effects,src:null,cvs:{},thumb:null,steps:0};
    await ensureSrc(pic);
    const cells = blockCells(0,0);
    for(const [q,cell] of cells.entries()) {
      const old = __game.occ[cell];
      __game.pieces.splice(__game.pieces.indexOf(old),1);old.el.remove();
      const piece=newPiece(pic,q,cell);__game.pieces.push(piece);place(piece,cell,false);$('board').appendChild(piece.el);
    }
    // Make this the final clear to check the reward is shown before the win dialog.
    __game.cleared=__game.M.target-1;__game.combo=2;__game.comboRemaining=8000;
    __resolve();
  }, source);
  await page.waitForFunction(()=>$('fxpop').classList.contains('on') && $('fximg').naturalWidth>0);
  await page.waitForTimeout(380);
  const before=await page.evaluate(()=>({remaining:__game.comboRemaining,paused:__game.paused,
    width:$('fximg').getBoundingClientRect().width,src:$('fximg').src,phase:__game.phase}));
  assert.equal(before.paused,true);
  assert.equal(before.phase,'resolving');
  assert.ok(before.width>=280);
  assert.equal(before.src.includes('-poster.webp'),reduced);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>__game.comboRemaining),before.remaining);
  assert.equal(await page.locator('#overlay').isVisible(),false);
  await page.screenshot({path:path.join(output,screenshot+'.png')});
  await page.click('#btnCelebrateClose');
  await page.waitForFunction(()=>__game.phase==='over');
  assert.equal(await page.locator('#fxpop').isVisible(),false);
  assert.match(await page.locator('#sheet h2').innerText(),/通关/);
}

(async()=>{
  for(const [source,effect] of pairs){
    const photo=manifest.photos.find(photo=>photo.source===source);
    assert.ok(photo,'Missing specified photo');
    for(const mode of ['tutorial','relax','normal','hard'])assert.equal(photo.effects[mode].source,effect);
  }
  const legacy=fs.readFileSync(path.join(root,'theme-yuanxin.js'),'utf8');
  for(const match of legacy.matchAll(/id:'([^']+)'.*?src:'([^']+)'/g)){
    assert.equal(manifest.photos.find(photo=>photo.source===match[2]).id,match[1]);
  }
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{
      if(error){response.writeHead(404).end();return;}
      const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.webp':'image/webp','.gif':'image/gif'};
      response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const errors=[];
  try{
    for(const url of [pathToFileURL(path.join(root,'puzzle-game.html')).href,
      `http://127.0.0.1:${server.address().port}/puzzle-game.html`]){
      const page=await browser.newPage({viewport:{width:390,height:844}});
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url);await page.waitForSelector('#goBtn');
      assert.equal(await page.evaluate(()=>themePack('yuanxin').count),manifest.count);
      await page.evaluate(()=>{progress.preferences.motion=true;});
      for(const [index,[source]] of pairs.entries())await checkReward(page,source,`${url.startsWith('file:')?'file':'http'}-reward-${index}`);
      await page.emulateMedia({reducedMotion:'reduce'});
      await checkReward(page,pairs[0][0],'reduced-reward',true);
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(async()=>{
        await __start('normal');
        const effect=themePack('yuanxin').photos.find(photo=>photo.effects.normal).effects.normal;
        void showCelebrate('missing-animation.webp','静态奖励',3000,effect.poster);
      });
      await page.waitForFunction(()=>$('fxpop').classList.contains('on') && $('fximg').src.includes('-poster.webp'));
      const time=await page.evaluate(()=>__game.timeLeft);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>__game.timeLeft),time);
      await page.click('#btnCelebrateClose');
      await page.close();
    }
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/assets/yuanxin/current.json',route=>route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/puzzle-game.html`);
    await page.waitForSelector('#goBtn');
    assert.equal(await page.evaluate(()=>themePack('yuanxin').count),manifest.count);
    await page.close();
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${manifest.count} pictures, stable IDs, exact effect bindings, file/HTTP loading, large rewards, final clear, reduced motion, failed animation poster, timer pause and offline fallback.`);
    console.log('Screenshots:',output);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
