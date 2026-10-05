// 執行：設定 PLAYWRIGHT_MODULE_PATH 為 Playwright 套件路徑，並先啟動本機 HTTP 伺服器。
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5500/';
const output = process.env.PREVIEW_OUTPUT || path.join(process.cwd(), '.preview');
const mockAPI = `window.YT={Player:class {
  constructor(id,options){this.options=options;this.state=-1;this.volume=30;const iframe=document.createElement('iframe');iframe.title='YouTube 測試播放器';document.getElementById(id).replaceWith(iframe);setTimeout(()=>options.events.onReady({target:this}),0);}
  setVolume(v){this.volume=v;}getPlayerState(){return this.state;}
  playVideo(){this.state=1;this.options.events.onStateChange({data:1});}
  pauseVideo(){this.state=2;this.options.events.onStateChange({data:2});}
  mute(){this.muted=true;}unMute(){this.muted=false;}destroy(){document.querySelector('.player-frame iframe')?.remove();}
}};window.onYouTubeIframeAPIReady();`;
(async () => {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    if(process.env.OFFLINE_PREVIEW==='1'){
      // 在限制網路的環境中，以本地檔案回應 HTTP 請求；仍驗證瀏覽器資源解析與相對路徑。
      await page.route(`${new URL(base).origin}/**`,route=>{
        const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'')||'index.html';
        const filename=path.resolve(relative);
        if(!filename.startsWith(process.cwd()+path.sep)||!fs.existsSync(filename))return route.fulfill({status:404,body:'Not found'});
        const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg'}[path.extname(filename)]||'application/octet-stream';
        return route.fulfill({contentType:type,body:fs.readFileSync(filename)});
      });
    }
    await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:mockAPI}));
    await page.goto(base);
    await page.waitForTimeout(700);
    await page.screenshot({path:path.join(output,'mobile-opening.png'),fullPage:true});
    assert.equal(await page.locator('#scene img').count(),0);
    await page.getByRole('button',{name:'打開這封信'}).click();
    assert.match(await page.locator('h1').textContent(),/故事/);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H1');
    await page.getByRole('button',{name:'下一頁'}).click();
    await page.getByRole('button',{name:'上一頁'}).click();
    assert.match(await page.locator('.scene-date').textContent(),/2025/);
    for(let i=0;i<5;i++)await page.getByRole('button',{name:'下一頁'}).click();
    assert.equal(await page.getByRole('button',{name:'下一頁'}).count(),0);
    const expected=['真的不再考慮一下嗎 🥺','那我再認真說一次，我喜歡妳。','我會有耐心，我們慢慢來。','我會有耐心，我們慢慢來。'];
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
    assert.deepEqual(sources,['./assets/seaside.jpg','./assets/evening.jpg','./assets/walking.jpg']);
    for(const img of await page.locator('#scene img').all()){
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(node=>node.decode());
      assert(await img.evaluate(node=>node.naturalWidth>0&&getComputedStyle(node).height!=='0px'));
    }
    await page.screenshot({path:path.join(output,'mobile-ending.png'),fullPage:true});
    await page.getByRole('button',{name:'暫停音樂'}).click();
    await page.getByRole('button',{name:'播放音樂'}).click();
    await page.getByRole('button',{name:'靜音',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'取消靜音'}).getAttribute('aria-pressed'),'true');
    await page.locator('#volume').fill('55');
    assert.equal(await page.locator('#volume-value').textContent(),'55%');
    await page.getByRole('button',{name:'重新載入'}).click();
    await page.waitForFunction(()=>document.querySelector('#music-status').textContent.includes('播放中'));
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.ending').evaluate(node=>getComputedStyle(node).animationName),'none');
    await page.reload();assert.equal(await page.locator('#scene img').count(),0);
    await page.unroute('https://www.youtube.com/iframe_api');
    await page.route('https://www.youtube.com/iframe_api',route=>route.abort());
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#music-status').textContent.includes('連線失敗'));
    await page.getByRole('button',{name:'打開這封信'}).click();
    for(let i=0;i<5;i++)await page.getByRole('button',{name:'下一頁'}).click();
    await page.getByRole('button',{name:'我同意'}).click();
    assert.equal(await page.locator('#scene img').count(),3);
    await page.unroute('https://www.youtube.com/iframe_api');
    const blockedAPI=mockAPI.replace('playVideo(){this.state=1;', 'playVideo(){if(!this.attempted){this.attempted=true;this.options.events.onAutoplayBlocked();return;}this.state=1;');
    await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:blockedAPI}));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#music-status').textContent.includes('瀏覽器需要'));
    await page.getByRole('button',{name:'打開這封信'}).click();
    await page.waitForFunction(()=>document.querySelector('#music-status').textContent.includes('播放中'));
    assert.deepEqual(errors,[]);
    console.log('PASS: navigation, keyboard, refusal steps and hit area, photo reveal, image loading, 320–1280px layout, audio controls/retry, autoplay blocked fallback, reduced motion, reset, API failure.');
    if(process.env.OFFLINE_PREVIEW==='1'){console.log('Offline file-backed HTTP responses: real server connectivity and live YouTube playback remain unverified.');return;}
    // 真實 YouTube 連線另行觀察，不把外部連線限制當成互動測試失敗。
    await page.unroute('https://www.youtube.com/iframe_api');
    await page.goto(base);
    await page.waitForTimeout(14000);
    console.log('Live YouTube status:',await page.locator('#music-status').textContent());
    console.log('Live iframe count:',await page.locator('.player-frame iframe').count());
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
