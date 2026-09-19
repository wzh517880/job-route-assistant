# 求职航线：下载与安装教程

适用：Windows / macOS 桌面版 Chrome、Microsoft Edge。当前仓库版本为 v0.3.1，采用开发者模式安装，不是浏览器扩展商店版本。

## 1. 下载插件

1. 打开 [求职航线 GitHub 仓库](https://github.com/wzh517880/job-route-assistant)。仓库已公开，无需登录即可下载。
2. 点击文件列表上方的绿色 **Code** 按钮。
3. 点击 **Download ZIP**，等待整个压缩包下载完成。
4. 完整解压 ZIP。Windows 可右键选择“全部解压缩”；macOS 可双击 ZIP。
5. 把解压得到的文件夹放在一个固定位置，例如“文档/浏览器插件”。**安装后不要移动、改名或删除这个文件夹。**

一般解压后文件夹名是 `job-route-assistant-main`。打开后，应能直接看到 `manifest.json`、`background.js`、`content.js`、`dashboard.html`，以及 `ocr`、`pdf` 子文件夹。不要只下载其中一个文件。

## 2. 安装到 Chrome 或 Edge

1. 在浏览器地址栏输入以下地址并回车：
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 开启页面上的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**（英文为 **Load unpacked**）。
4. 选择**直接包含 `manifest.json` 的那层文件夹**。不要选择 ZIP、单独的 `manifest.json`，也不要选择还套着一层文件夹的外层目录。
5. 扩展列表出现“求职航线 · 预览版”，确认开关已打开、版本为 **0.3.1**。

如果浏览器或公司管理策略禁止安装，不要关闭安全防护或绕过管理策略；请联系管理员。

## 3. 打开看板并测试

1. 点击浏览器工具栏的“扩展”菜单，找到“求职航线 · 预览版”。可按需将图标固定到工具栏。
2. 点击插件图标，打开主看板。使用虚构信息测试简历资料、公司/岗位清单、状态排序、截止时间、岗位详情、面试复盘和简历留档。
3. 测试网页填写时，打开普通 HTTP / HTTPS 测试页面；安装前已经打开的页面需要刷新。
4. 点击页面上的悬浮入口，或使用快捷键：Windows 为 **Alt + J**，Mac 为 **Option（⌥）+ J**。
5. 先点击网页输入框，再选择简历版本和具体经历，点击字段后的“填入”。文本已有内容时会追加；下拉框会切换选项。“填写当前页面”仅尝试填写可明确识别的空白字段。插件不会替你点击网站的提交按钮。

浏览器设置页、扩展商店等受保护页面不适合作为填写测试页。v0.3.1 在 Windows Edge 上曾出现悬浮入口不显示的问题，目前尚未定位，不能保证所有环境都正常。

## 4. 常见问题

**提示“清单文件丢失或不可读取”**

先确认 ZIP 已完整解压，并且加载的文件夹中能直接看到 `manifest.json`。若路径是“外层文件夹/另一层文件夹/manifest.json”，应选择里面的那层文件夹。

**看不到悬浮入口**

确认扩展开关已启用，刷新普通测试网页，再尝试快捷键。检查扩展“详细信息”中的站点访问权限是否允许在该测试网站运行；仅按需允许测试网站，不必放宽到所有网站。仍失败时，记录浏览器版本和扩展页面错误，不要发送真实资料或凭证。

**换电脑或更新后，资料还在吗？**

数据保存在当前浏览器本地，不会因为登录同一个 GitHub 账号自动同步。更新、重装、清理数据之前，先在看板“数据安全”中导出 JSON，妥善保存在仓库之外。导入 JSON 会替换而非合并当前数据。

**如何更新？**

开发者模式版本不会通过扩展商店自动更新。先备份，不要先卸载旧版；具体见 [INSTALL.md](INSTALL.md)。安装到不同文件夹可能产生不同扩展 ID，旧数据不一定自动出现。

## 官方操作参考

- [GitHub：从仓库下载文件](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-files-from-github)
- [Chrome：加载已解压的扩展](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [Microsoft Edge：旁加载扩展用于测试](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)
