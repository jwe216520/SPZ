// 執行：設定 PLAYWRIGHT_MODULE_PATH 為 Playwright 套件路徑，並先啟動本機 HTTP 伺服器。
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5500/';
const output = process.env.PREVIEW_OUTPUT || path.join(process.cwd(), '.preview');
(async () => {
  fs.mkdirSync(output,{recursive:true});
  const autoplayOnly=process.env.AUTOPLAY_ONLY==='1';
  const desktopOnly=process.env.DESKTOP_ONLY==='1';
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:autoplayOnly?['--autoplay-policy=no-user-gesture-required']:[]});
  try {
    const page=await browser.newPage({viewport:{width:desktopOnly?1280:390,height:844},hasTouch:!desktopOnly});
    const touch=await page.context().newCDPSession(page);
    async function swipe(direction, distance=110, vertical=false) {
      await page.waitForTimeout(160);
      const rect=await page.locator('#scene').boundingBox();
      const x=rect.x+rect.width/2;
      const y=Math.min(rect.y+160,600);
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let step=1;step<=5;step++) {
        await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(vertical?0:direction*distance*step/5),y:y+(vertical?distance*step/5:0)}]});
        await page.waitForTimeout(30);
      }
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(100);
    }
    async function tapSide(direction) {
      const rect=await page.locator('.letter').boundingBox();
      await page.mouse.click(rect.x+rect.width*(direction>0?.8:.2),Math.max(100,rect.y+110));
    }
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    if(process.env.OFFLINE_PREVIEW==='1'){
      // 在限制網路的環境中，以本地檔案回應 HTTP 請求；仍驗證瀏覽器資源解析與相對路徑。
      await page.route(`${new URL(base).origin}/**`,route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/(?:project\/)?/,'')||'index.html';
        const filename=path.resolve(relative);
        if(!filename.startsWith(process.cwd()+path.sep)||!fs.existsSync(filename))return route.fulfill({status:404,body:'Not found'});
        const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg','.mp3':'audio/mpeg'}[path.extname(filename)]||'application/octet-stream';
        const body=fs.readFileSync(filename);
        const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
        if(range){
          const start=Number(range[1]);const end=Math.min(range[2]?Number(range[2]):body.length-1,body.length-1);
          if(start> end)return route.fulfill({status:416,headers:{'Content-Range':`bytes */${body.length}`}});
          return route.fulfill({status:206,contentType:type,headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${body.length}`},body:body.subarray(start,end+1)});
        }
        return route.fulfill({contentType:type,headers:{'Accept-Ranges':'bytes'},body});
      });
    }
    
    await page.goto(process.env.DIRECT_FILE==='1'?require('node:url').pathToFileURL(path.join(process.cwd(),'index.html')).href:base);
    if(desktopOnly){
      await page.waitForTimeout(700);
      await page.screenshot({path:path.join(output,`${process.env.BROWSER_CHANNEL||'chrome'}-desktop-opening.png`),fullPage:true});
      await page.getByRole('button',{name:'打開這封信'}).click();
      assert.match(await page.locator('.scene-date').textContent(),/2025/);
      console.log('PASS: desktop mouse click opens letter.');
      await tapSide(1);
      assert.match(await page.locator('.scene-date').textContent(),/2026/);
      await tapSide(-1);
      assert.match(await page.locator('.scene-date').textContent(),/2025/);
      await page.keyboard.press('ArrowRight');
      assert.match(await page.locator('.scene-date').textContent(),/2026/);
      await page.keyboard.press('ArrowLeft');
      assert.match(await page.locator('.scene-date').textContent(),/2025/);
      const rect=await page.locator('#scene').boundingBox();
      await page.mouse.move(rect.x+300,rect.y+170);
      await page.mouse.down();
      await page.mouse.move(rect.x+150,rect.y+170,{steps:8});
      await page.mouse.up();
      assert.match(await page.locator('.scene-date').textContent(),/2026/);
      console.log('PASS: desktop arrow keys and mouse drag change pages.');
      assert.deepEqual(errors,[]);
      if(process.env.DIRECT_FILE==='1')return;
      await page.route('**/assets/music.mp3',route=>route.fulfill({status:404,body:'Not found'}));
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('audio').error!==null);
      await page.getByRole('button',{name:'打開這封信'}).click();
      assert.match(await page.locator('.scene-date').textContent(),/2025/);
      assert.deepEqual(errors,[]);
      console.log('PASS: desktop opening works even when MP3 fails.');
      return;
    }
    if(autoplayOnly){
      await page.waitForFunction(()=>{const a=document.querySelector('audio');return !a.paused&&!a.muted&&a.currentTime>0;});
      assert(await page.locator('audio').evaluate(a=>a.autoplay&&!a.defaultMuted&&a.volume===1));
      assert.equal(await page.locator('#sound-toggle').getAttribute('aria-label'),'靜音');
      assert.equal(await page.getByRole('button',{name:'打開這封信'}).count(),1);
      console.log('PASS: actual MP3 starts with sound on page load, before any user interaction, when browser autoplay policy permits.');
      return;
    }
    await page.waitForTimeout(700);
    await page.screenshot({path:path.join(output,'mobile-opening.png'),fullPage:true});
    assert.equal(await page.locator('#scene img').count(),0);
    await swipe(-1);
    assert.equal(await page.getByRole('button',{name:'打開這封信'}).count(),1);
    await page.getByRole('button',{name:'打開這封信'}).click();
    assert.match(await page.locator('h1').textContent(),/故事/);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H1');
    await page.waitForFunction(()=>{const a=document.querySelector('audio');return !a.paused&&a.currentTime>0&&a.duration>0;});
    assert.equal(await page.locator('audio').evaluate(a=>a.volume),1);
    assert.equal(await page.locator('#sound-waves').getAttribute('hidden'),null);
    assert.notEqual(await page.locator('#sound-off').getAttribute('hidden'),null);
    assert.equal(await page.locator('iframe,input[type=range],.music-card').count(),0);
    await page.getByRole('button',{name:'靜音',exact:true}).click();
    const mutedTime=await page.locator('audio').evaluate(a=>a.currentTime);
    await page.waitForTimeout(300);
    assert(await page.locator('audio').evaluate((a,t)=>a.muted&&!a.paused&&a.currentTime>t,mutedTime));
    assert.equal(await page.getByRole('button',{name:/上一頁|下一頁/}).count(),0);
    await tapSide(1);
    assert.equal(await page.locator('#page-number').textContent(),'02 / 06');
    await tapSide(-1);
    assert.equal(await page.locator('#page-number').textContent(),'01 / 06');
    await page.locator('.prose p').first().evaluate(node=>{
      const range=document.createRange();range.selectNodeContents(node);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    });
    await tapSide(1);
    assert.equal(await page.locator('#page-number').textContent(),'01 / 06');
    await page.evaluate(()=>window.getSelection().removeAllRanges());
    await swipe(-1,25);
    assert.match(await page.locator('.scene-date').textContent(),/2025/);
    await swipe(-1,80,true);
    assert.match(await page.locator('.scene-date').textContent(),/2025/);
    await swipe(-1);
    assert.match(await page.locator('.scene-date').textContent(),/2026/);
    await swipe(1);
    assert.match(await page.locator('.scene-date').textContent(),/2025/);
    await swipe(1);
    assert.equal(await page.getByRole('button',{name:'打開這封信'}).count(),1);
    await page.getByRole('button',{name:'打開這封信'}).click();
    assert(await page.locator('audio').evaluate(a=>a.muted&&!a.paused));
    await page.getByRole('button',{name:'開啟聲音'}).click();
    assert.equal(await page.locator('audio').evaluate(a=>a.muted),false);
    await page.locator('h1').focus();
    await page.keyboard.press('ArrowRight');
    assert.match(await page.locator('.scene-date').textContent(),/2026/);
    await page.keyboard.press('ArrowLeft');
    for(let i=0;i<5;i++)await swipe(-1);
    assert.equal(await page.getByRole('button',{name:'下一頁'}).count(),0);
    await swipe(-1);
    assert.equal(await page.locator('#scene img').count(),0);
    assert.equal(await page.getByRole('button',{name:'我同意'}).count(),1);
    assert.equal(await page.locator('.response').isVisible(),false);
    const buttonsBox=await page.locator('.answer-buttons').boundingBox();
    const noteBox=await page.locator('.invitation-note').boundingBox();
    assert(noteBox.y-buttonsBox.y-buttonsBox.height<=12);
    await tapSide(1);
    assert.equal(await page.getByRole('button',{name:'我同意'}).count(),1);
    const responses=await page.evaluate(()=>window.LETTER_CONTENT.noResponses);
    const expected=[...responses,responses.at(-1)];
    let priorWidth=Infinity;
    for(const response of expected){
      await page.getByRole('button',{name:'不同意',exact:true}).click();
      assert.equal(await page.locator('.response').textContent(),response);
      await page.waitForTimeout(230);
      const bounds=await page.locator('.no-button').boundingBox();
      assert(bounds.width>=44&&bounds.height>=44);
      assert(bounds.width<=priorWidth);priorWidth=bounds.width;
      assert.equal(await page.locator('#scene img').count(),0);
    }
    await page.screenshot({path:path.join(output,'mobile-question.png'),fullPage:true});
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:900});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
    }
    await page.screenshot({path:path.join(output,'desktop-question.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'我同意'}).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#scene img').count(),3);
    const sources=await page.locator('#scene img').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')));
    assert.deepEqual(sources,await page.evaluate(()=>window.LETTER_CONTENT.photos.map(photo=>photo.src)));
    assert.equal(await page.locator('.photo-card[aria-pressed="false"]').count(),3);
    const cards=page.locator('.photo-card');
    for(let i=0;i<3;i++){
      const card=cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const before=await card.boundingBox();
      await card.click();
      assert.equal(await card.getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('.ending').count(),1);
      const after=await card.boundingBox();
      assert(Math.abs(before.height-after.height)<1);
      assert.equal(await cards.filter({has:page.locator('.photo-front[aria-hidden="true"]')}).count(),1);
      await card.click();
      assert.equal(await card.getAttribute('aria-pressed'),'false');
    }
    await cards.first().focus();await page.keyboard.press('Enter');
    assert.equal(await cards.first().getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Space');
    assert.equal(await cards.first().getAttribute('aria-pressed'),'false');
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:900});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`card overflow at ${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    for(const img of await page.locator('#scene img').all()){
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(node=>node.decode());
      assert(await img.evaluate(node=>node.naturalWidth>0&&getComputedStyle(node).height!=='0px'));
    }
    await page.screenshot({path:path.join(output,'mobile-ending.png'),fullPage:true});
    for(const card of await cards.all())await card.click();
    assert.equal(await page.locator('.photo-card[aria-pressed="true"]').count(),3);
    await page.waitForTimeout(800);
    await page.screenshot({path:path.join(output,'mobile-ending-photos.png'),fullPage:true});
    await page.locator('h1').scrollIntoViewIfNeeded();
    await swipe(1);
    assert.equal(await page.getByRole('button',{name:'我同意'}).count(),1);
    assert.equal(await page.locator('#scene img').count(),0);
    assert.equal(await page.locator('.response').textContent(),responses.at(-1));
    await page.getByRole('button',{name:'我同意'}).click();
    assert.equal(await page.locator('#scene img').count(),3);
    assert.equal(await page.locator('.photo-card[aria-pressed="false"]').count(),3);
    const toggle=page.locator('#sound-toggle');
    const bounds=await toggle.boundingBox();assert(bounds.width>=44&&bounds.height>=44);
    await toggle.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('audio').evaluate(a=>a.muted),true);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('audio').evaluate(a=>a.muted),false);
    await page.locator('audio').evaluate(a=>{a.currentTime=a.duration-0.1;});
    console.log('Checking real MP3 end/replay…');
    await page.waitForFunction(()=>document.querySelector('audio').ended);
    assert.equal(await toggle.getAttribute('aria-label'),'重新播放音樂');
    await toggle.click();
    await page.waitForFunction(()=>{const a=document.querySelector('audio');return !a.paused&&!a.ended&&a.currentTime<3;});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.ending').evaluate(node=>getComputedStyle(node).animationName),'none');
    await cards.first().click();
    assert.equal(await cards.first().locator('.photo-front').evaluate(node=>getComputedStyle(node).visibility),'hidden');
    assert.equal(await cards.first().locator('.photo-back').evaluate(node=>getComputedStyle(node).visibility),'visible');
    await cards.first().click();
    await page.route('**/assets/seaside.jpg',route=>route.fulfill({status:404,body:'Not found'}));
    await page.reload();
    await page.getByRole('button',{name:'打開這封信'}).click();
    for(let i=0;i<5;i++)await swipe(-1);
    await page.getByRole('button',{name:'我同意'}).click();
    await cards.first().click();
    await page.locator('.photo-error').waitFor({state:'visible'});
    await cards.first().click();
    assert.equal(await cards.first().getAttribute('aria-pressed'),'false');
    await page.unroute('**/assets/seaside.jpg');
    await page.reload();assert.equal(await page.locator('#scene img').count(),0);
    // 真實 MP3 載入失敗及恢復，閱讀仍可完成。
    await page.route('**/assets/music.mp3',route=>route.fulfill({status:404,body:'Not found'}));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('audio').error!==null);
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-label'),'重試播放音樂');
    await page.getByRole('button',{name:'打開這封信'}).click();
    for(let i=0;i<5;i++)await swipe(-1);
    await page.getByRole('button',{name:'我同意'}).click();
    assert.equal(await page.locator('#scene img').count(),3);
    await page.unroute('**/assets/music.mp3');
    await page.locator('#sound-toggle').click();
    await page.waitForFunction(()=>!document.querySelector('audio').paused&&document.querySelector('audio').currentTime>0);
    // 模擬一次瀏覽器拒絕自動播放，之後仍使用原生解碼與播放。
    await page.addInitScript(()=>{
      const nativePlay=HTMLMediaElement.prototype.play;
      let first=true;
      HTMLMediaElement.prototype.play=function(){
        if(first){first=false;return Promise.reject(new DOMException('Autoplay blocked','NotAllowedError'));}
        return nativePlay.call(this);
      };
    });
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#sound-status').textContent.includes('點一下'));
    await page.getByRole('button',{name:'打開這封信'}).click();
    await page.waitForFunction(()=>!document.querySelector('audio').paused&&document.querySelector('audio').currentTime>0);
    if(process.env.OFFLINE_PREVIEW==='1'){
      await page.goto(new URL('project/',base).href);
      await page.getByRole('button',{name:'打開這封信'}).click();
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
      assert.match(await page.locator('audio').evaluate(a=>a.currentSrc),/project\/assets\/music.mp3$/);
      assert(await page.locator('audio').evaluate(a=>a.duration>0));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: real MP3 decoding/playback, mute continues progress, muted preference survives opening/navigation, native volume unchanged, ended/replay, keyboard icon controls, failed load/retry, autoplay fallback; touch swipe, photo reveal and 320–1280px layout.');
    if(process.env.OFFLINE_PREVIEW==='1')console.log('File-backed HTTP responses verified including project subpath. Device volume buttons and deployed HTTP hosting require a real phone check.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
