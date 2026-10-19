# 开发指南

这是 PutongDoc 的 Zotero 插件。源码来源与许可信息请参阅 [README](./README.md)。

## 环境要求

- Zotero 7 或更高版本；建议使用独立的开发配置文件。
- Node.js 22.13 或更新的 Node.js 22 LTS 版本。
- npm（随 Node.js 附带）。

## 常用命令

```sh
npm ci
npm run build
npm run lint:check
npm run pack
```

要在 Zotero 中调试，请将 `.env.example` 复制为 `.env`，填入本地 Zotero 和开发配置文件的路径，然后运行 `npm start`。

## 发布

在 `main` 分支上运行：

```sh
GITHUB_TOKEN=$(gh auth token) npm run release
```

也可以把 `GITHUB_TOKEN` 写入 `.env`。发布前请确保工作区干净：发版提交会包含所有已修改的文件。

命令会交互式选择新版本号，构建后把生成的 `update.json`、`update-beta.json` 复制到仓库根目录，与版本号一起提交并打 `v{版本号}` 标签、推送，再创建 GitHub Release 并上传 `zotero-putongdoc.xpi`。

已安装的插件从 `main` 分支的 `update.json`（经 raw.githubusercontent.com）检查更新，请勿手动修改这两个文件。推送后到 XPI 上传完成前，检查更新会短暂下载失败；如果上传失败，请尽快重新上传 XPI 到对应 Release。

## 当前范围

已接入 PutongDoc API：令牌认证、PDF 上传、提交翻译、轮询进度及下载结果。目标语言、翻译模式和解析引擎会影响请求参数及导入的附件。

修改界面时，请同时更新 `addon/locale/zh-CN` 和 `addon/locale/en-US` 中的文案。
反馈与贡献请参阅[本仓库](https://github.com/lemos1235/zotero-putongdoc)。
