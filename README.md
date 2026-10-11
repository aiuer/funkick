# funkick

An offline picture puzzle with art and photo collections.

Open `puzzle-game.html` in a browser. Keep the theme scripts, `lucide.min.js`,
`resource-loader.js`, and the `assets` folder alongside the HTML. No development
server is required. The legacy embedded themes remain available as a fallback.

- Tutorial: a two-picture practice game with a one-swap opening.
- Relax: unlimited time, with free hints.
- Normal / Hard: timed challenges with combo and rotating region rewards.
- After a clear, the next picture is spread across all four board regions.
  Existing pieces stay in place except for up to three pieces moved into the
  cleared cells. Refill placement minimizes broken correct seams before
  minimizing movement. The tutorial uses a simple refill into the cleared cells.
- Completed theme pictures, achievements, preferences, and personal bests are
  stored in the current browser's local storage. Uploaded images stay in memory.
- The toolbar provides hints, undo before a clear, pause, fragment inspection,
  shuffle, and image upload. Gallery and fragment dialogs pause the game.

## Verification

With Node.js and Playwright installed, run:

```sh
node tests/puzzle-game.cjs
```

The test opens the local HTML in Chromium, verifies both themes and the main
game flows, and writes desktop/mobile screenshots to a temporary directory.
If Chromium is not installed for Playwright, run `npx playwright install chromium`.

Lucide icons are bundled locally under the ISC license in `lucide.LICENSE`.

## 沅信图库、彩蛋与发布

原图统一放在 `~/Documents/XINWONPIC`；构建只读取原图，不修改它们。
`resource-config.json` 管理原图目录和「指定照片 → 指定动图」映射，支持按模式
配置彩蛋。当前图库共 62 张，两组新增彩蛋在所有模式生效。彩蛋在中央大图展示，
展示期间暂停计时和连击，可点「继续拼图」提前结束；减少动态效果时显示静态封面。

更新资源后按以下顺序执行（Python 需要 Pillow，测试需要 Playwright Chromium）：

```sh
python3 scripts/build-resources.py
node tests/puzzle-game.cjs
node tests/resources.cjs
python3 scripts/package-release.py --note '本次更新说明'
python3 scripts/publish-release.py --cli /path/to/hsk-cli
```

构建生成 WebP、动画 WebP、缩略图、静态封面和带内容版本的清单，同时保留图库 ID
与本地离线包。HTTP 加载当前版本清单；直接打开 HTML 时使用离线包。

发布按 [.agents/skills/puzzle-publish/SKILL.md](.agents/skills/puzzle-publish/SKILL.md)
执行。发布脚本会先运行花生壳 doctor 和 wizard，再上传白名单打包的站点目录。
凭据通过 `HSK_API_KEY` 环境变量或已有花生壳凭据提供，不写入项目或发布包。
`releases/latest.json` 指向最新 ZIP 与站点；`publication.json` 保存脱敏发布回执。

花生壳文件托管每次内容更新都会产生新链接，旧链接不会原地更新。收藏和成绩按
浏览器站点保存，更换发布地址后不能自动迁移。原图、Skill、测试和内部配置不发布。
