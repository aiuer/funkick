const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const url = pathToFileURL(path.resolve(__dirname, '../puzzle-game.html')).href;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-check-'));
const errors = [];

async function ready(page) {
  await page.waitForFunction(() => __game.phase === 'playing' && !__game.paused);
}

async function capture(page, name) {
  await page.waitForTimeout(520);
  await page.screenshot({ path: path.join(output, name + '.png') });
}

async function completeAt(page, row, col) {
  const before = await page.evaluate(({ row, col }) => {
    const pic = __game.pieces[0].pic;
    const cells = blockCells(row, col);
    for (let q = 0; q < 4; q++) {
      const piece = __game.pieces.find(p => samePic(p.pic, pic) && p.q === q);
      if (piece.cell !== cells[q]) __swap(piece.cell, cells[q]);
    }
    const state = { cleared: __game.cleared, score: __game.score,
      expected: scoreFor(pic).gain + (regionAt(row, col) === __game.regionTarget ? CONFIG.REGION_SCORE : 0) };
    __resolve();
    return state;
  }, { row, col });
  await page.waitForFunction(n => __game.cleared > n && ['playing', 'over'].includes(__game.phase), before.cleared);
  return before;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForSelector('#goBtn');
    await capture(page, 'mobile-menu');
    await page.click('#goBtn');
    await ready(page);
    assert.equal(await page.evaluate(() => __game.mode), 'tutorial');
    assert.equal(await page.locator('.playbar svg').count(), 6);
    assert.equal(await page.locator('.queue .qcard').count(), 4);
    await capture(page, 'mobile-tutorial');
    await page.evaluate(() => { progress.preferences.motion = false; });
    await page.locator('.pc').nth(4).click();
    await page.locator('.pc').nth(5).click();
    await page.waitForFunction(() => __game.cleared === 1 && __game.phase === 'playing');
    assert.equal(await page.evaluate(() => __game.pieces.length), 8);
    assert.equal(await page.evaluate(() => curMul()), 1);
    await completeAt(page, 0, 0);
    assert.equal(await page.evaluate(() => !!progress.achievements.tutorial), true);
    await page.getByRole('button', { name: '进入休闲', exact: true }).click();
    await ready(page);
    assert.equal(await page.evaluate(() => __game.mode), 'relax');
    assert.equal(await page.locator('#timeCard').isVisible(), false);
    assert.equal(await page.locator('#livesCard').isVisible(), false);

    await page.evaluate(() => __start('normal'));
    const original = await page.evaluate(() => __game.occ.map(p => p.pic.key + ':' + p.q));
    await page.evaluate(() => { __swap(0, 1); undoSwap(); });
    assert.deepEqual(await page.evaluate(() => __game.occ.map(p => p.pic.key + ':' + p.q)), original);
    assert.equal(await page.evaluate(() => __game.steps), 0);
    await page.evaluate(() => __swap(0, 1));
    assert.equal(await page.evaluate(() => __game.occ[0].pic.steps), 1);
    await page.click('#btnPause');
    const paused = await page.evaluate(() => [__game.timeLeft, __game.comboRemaining]);
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => [__game.timeLeft, __game.comboRemaining]), paused);
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await page.waitForTimeout(220);
    assert.ok(await page.evaluate(() => __game.timeLeft) < paused[0]);

    await page.evaluate(() => __start('normal'));
    const first = await completeAt(page, 0, 0);
    assert.equal(await page.evaluate(() => __game.score), first.expected);
    assert.equal(await page.evaluate(() => __game.regionWins), 1);
    assert.equal(await page.evaluate(() => __game.regionTarget), 1);
    assert.equal(await page.evaluate(() => curMul()), 1);
    await page.locator('#gall div').first().click();
    const galleryTime = await page.evaluate(() => __game.timeLeft);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => __game.timeLeft), galleryTime);
    await page.getByRole('button', { name: '返回', exact: true }).click();

    // Background and modal pause reasons must be released independently.
    await page.evaluate(() => { pauseGame('background'); showHelp(); resumeGame('background'); });
    assert.equal(await page.evaluate(() => __game.paused), true);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    assert.equal(await page.evaluate(() => __game.paused), false);
    const anchors = [[0, 2], [2, 0], [2, 2], [0, 0], [0, 2], [2, 0], [2, 2]];
    for (const [row, col] of anchors) await completeAt(page, row, col);
    assert.equal(await page.evaluate(() => __game.phase), 'over');
    assert.equal(await page.evaluate(() => __game.gallery.length), 8);
    assert.equal(await page.evaluate(() => curMul()), 2);
    for (const key of ['first', 'clean', 'explorer', 'combo']) {
      assert.equal(await page.evaluate(k => !!progress.achievements[k], key), true);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(SAVE_KEY)));
    assert.ok(Object.keys(saved.collection).length >= 8);
    assert.ok(saved.best['classic:normal'].score > 0);
    await page.getByRole('button', { name: '查看收藏', exact: true }).click();
    await page.locator('[data-photo]:not(:disabled)').first().click();
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-album]');
    await capture(page, 'collection-unlocked');
    await page.getByRole('button', { name: '成就', exact: true }).click();
    await capture(page, 'achievements');
    await page.reload();
    assert.deepEqual(await page.evaluate(() => progress.collection), saved.collection);
    assert.equal(await page.evaluate(() => __game.mode), 'normal');

    // Start immediately after choosing a file to exercise the pending upload read.
    await page.setInputFiles('#fileInput', path.join(output, 'mobile-tutorial.png'));
    await page.click('#goBtn');
    await ready(page);
    assert.ok(await page.evaluate(() => __game.pieces.some(p => p.pic.kind === 'upload')));
    await page.setInputFiles('#fileInput', path.join(output, 'mobile-menu.png'));
    await page.waitForFunction(() => __game.queue[0].kind === 'upload');
    const uploadKey = await page.evaluate(() => __game.queue[0].key);
    await completeAt(page, 0, 0);
    assert.ok(await page.evaluate(key => __game.pieces.some(p => p.pic.key === key), uploadKey));

    await page.evaluate(() => { __game.timeLeft = .01; });
    await page.waitForSelector('#sheet h2:text("时间到")');
    assert.equal(await page.evaluate(() => __game.lives), 2);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#overlay').isVisible(), true);
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await ready(page);
    assert.equal(await page.evaluate(() => __game.pieces.length), 16);
    await page.click('#btnInspect');
    await page.locator('.pc').first().click();
    assert.equal(await page.evaluate(() => __game.paused), true);
    await page.getByRole('button', { name: '返回棋盘', exact: true }).click();
    assert.equal(await page.evaluate(() => __game.paused), false);

    await page.evaluate(() => { __game.theme='yuanxin'; return __start('hard'); });
    await capture(page, 'yuanxin-hard');
    for(let i=0;i<16;i++){
      const [row,col]=[[0,0],[0,3],[4,0],[4,3]][i%4];
      await completeAt(page,row,col);
    }
    assert.equal(await page.evaluate(()=>__game.gallery.length),16);
    assert.equal(await page.locator('#gall div').count(),16);
    await page.evaluate(()=>{__game.theme='classic';});

    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 },
      { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ['normal', 'hard']) {
        await page.evaluate(mode => __start(mode), mode);
        await capture(page, `${viewport.width}-${viewport.height}-${mode}`);
        const layout = await page.evaluate(() => {
          const board = $('board').getBoundingClientRect(), toolbar = document.querySelector('.playbar').getBoundingClientRect();
          const canvas = document.querySelector('.pc-cv'), context = canvas.getContext('2d');
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const colors = new Set();
          for (let i = 0; i < data.length; i += 400) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
          return { overflow: document.documentElement.scrollWidth > innerWidth,
            overlap: board.bottom > toolbar.top, canvasColors: colors.size,
            toolbarVisible: toolbar.top>=0 && toolbar.bottom<=innerHeight,
            pieces: __game.pieces.length, cells: __game.ncells };
        });
        assert.equal(layout.overflow, false, JSON.stringify({ viewport, mode, layout }));
        if(viewport.width<=viewport.height) assert.equal(layout.overlap,false);
        assert.equal(layout.toolbarVisible,true,JSON.stringify({viewport,mode,layout}));
        assert.ok(layout.canvasColors > 10);
        assert.equal(layout.pieces, layout.cells);
      }
    }

    // Old asynchronous work must not mutate a newly started game.
    await page.evaluate(() => Promise.all([__start('hard'), __start('relax')]));
    assert.equal(await page.evaluate(() => __game.mode), 'relax');
    assert.equal(await page.evaluate(() => __game.pieces.length), 16);
    await page.evaluate(async()=>{
      const pic=__game.pieces[0].pic,cells=blockCells(0,0);
      for(let q=0;q<4;q++){
        const p=__game.pieces.find(p=>p.pic===pic && p.q===q);
        if(p.cell!==cells[q]) __swap(p.cell,cells[q]);
      }
      __resolve();
      await __start('hard');
    });
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.complete-preview').count(),0);
    assert.equal(await page.evaluate(()=>__game.pieces.length),48);
    await page.evaluate(()=>{progress.preferences.motion=true;showCelebrate('fx-celebrate-1.gif','');});
    await page.waitForFunction(()=>$('fxpop').classList.contains('on') && $('fximg').naturalWidth>0);
    await page.click('#btnPause');
    assert.equal(await page.locator('#fxpop').isVisible(),false);
    await page.getByRole('button',{name:'继续游戏',exact:true}).click();
    assert.deepEqual(errors, []);
    console.log('PASS: both themes, complete games, scoring, regions, combo, undo, pause, gallery, achievements, storage, uploads, timeout, restart during animations, GIF assets, responsive layout and canvas rendering.');
    console.log('Screenshots:', output);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
