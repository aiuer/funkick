---
name: puzzle-publish
description: 更新拼图消消乐沅信图库与彩蛋，校验打包，并按用户发布提示用花生壳创建静态文件托管资源。
---

# 拼图游戏资源与发布

用于 GAME 项目。用户只要求讨论方案时不修改或发布。普通代码更新不自行触发公网发布；按用户当次或本会话的明确发布指令执行。

## 资源准备

- 原图目录由 `resource-config.json` 指定，默认 `~/Documents/XINWONPIC`。不修改原图。
- 彩蛋映射写在该配置的 `effects`：`photo`、`file` 为原始文件名，`modes` 为生效模式，`caption` 为文案。
- 保留 `assets/yuanxin/photo-ids.json` 旧 ID，避免收藏失效。
- 运行 `python3 scripts/build-resources.py`。需要 Pillow；macOS sips 自动解码伪装成 JPG 的 HEIC。沙箱内若只产生无效图片，按权限流程在沙箱外执行构建。
- 构建包含内容哈希版本、WebP 图片/缩略图、动画 WebP/静态封面、JSON 清单及离线包。`current.json` / `current.js` 指向当前版本。
- 检查指定触发图片与动图真实存在；任何构建失败均不发布不完整资源。

## 测试与打包

1. 运行 `node tests/puzzle-game.cjs`；资源或庆祝层更新再运行 `node tests/resources.cjs`。需要 Playwright Chromium。
2. 验证绑定、显示尺寸、计时/连击暂停、最后一张的奖励、减少动态效果、动画缺失封面降级、HTTP 与 file://。
3. 根据用户更新提示运行 `python3 scripts/package-release.py --note '<简短版本说明>'`。不要复制含密钥的用户原文到说明。
4. 仅发布 `releases/latest.json` 返回的 `site`。ZIP 用于交付下载，禁止直接发布项目根目录。
5. 包内不包含 `.git`、Skill、测试、原图、历史压缩包、API Key 或配置目录，打包器扫描 `ph_key_`。

## 花生壳准备

首次使用或协议变化时读取 https://hsk.oray.com/doc/cli-setup.md 并按最新指引执行；排障再读 `~/.hsk/AGENTS.md`。

- `node -v` 确认 Node >=16，再安装 CLI；优先现有 `hsk-cli`，不便全局安装时可用 `npx @aweray/hsk-cli`。
- `hsk-cli doctor --format json` 必须返回 `success:true`。fail 按 `next_actions` 或 `doctor --fix --format json` 修复并复查。
- 业务命令前先 `hsk-cli context wizard --format json`，按当次 `ask.options` 回填 `schema_version` 和 `answers`，不得用旧问题集猜值。
- 全部 CLI 命令带 `--format json`；业务结果以 stdout 首行 JSON 为准，stderr 过程日志不代表失败。
- 静态游戏使用文件托管；不安装引擎，不创建隧道，不暴露其他本机文件。
- 使用 wizard 推荐的 `file-hosting <site> --entry-file index.html --format json --context task_goal=share_file,agent_channel=rich`。
- `python3 scripts/publish-release.py --cli <hsk-cli路径>` 会自检、建立画像并发布，保存脱敏结果。
- Key 仅来自 `HSK_API_KEY` 或 HSK 凭据存储。用户允许长期保存时可加 `--save-key`，保存到 `~/.hsk`。密钥不进 Git、Skill 或发布包，不运行会显示密钥的 `api-key get`。
- Key 缺失时检查现有凭据；都没有则询问认证方式，不匿名重复建资源。
- `needs_input` 按 `resolution_order` 处理，不绕过认领步骤。
- 文件托管不能原地更新。内容变化新建资源得到新链接；不得用 `--reuse` 代替更新或承诺旧链接内容改变。

## 发布验证

`claimed:true` / `claim_via` 确认资源归属；否则交付原样激活链接并说明待认领。取得 URL 后检查 HTML、`release.json`、当前清单、指定动画，浏览器验证主题开局和指定彩蛋。

最终交付原样公网链接、ZIP 路径、资源版本、图片数量、绑定摘要和测试结果。失败则保留包、说明阻塞，不声称成功。

`current.json` 仅在该发布地址内指向资源版本。HSK 新发布会产生不同链接，浏览器收藏按站点存储，不能承诺跨发布地址自动迁移。
