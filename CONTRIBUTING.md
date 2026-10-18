# 开发指南

本项目为 PutongDoc 的 Zotero 插件，源码来源与许可证见 [README](./README.md)。

## 环境

- Zotero 7 或更新版本，建议使用单独的开发配置文件。
- Node.js 22.13 或更新的 Node.js 22 LTS 版本。
- npm（随 Node.js 安装）。

## 常用命令

```sh
npm ci
npm run build
npm run lint:check
```

需要在 Zotero 中调试时，复制 `.env.example` 为 `.env`，填写本机 Zotero 与开发配置文件路径，然后运行 `npm start`。

## 当前范围

目前仅完成初步迁移。API 层默认拒绝所有请求，不读取或发送令牌。
翻译设置仍是迁移占位，不能视为 PutongDoc 已支持的接口参数。

修改用户界面时，请同时更新 `addon/locale/zh-CN` 和 `addon/locale/en-US` 中的文案。
问题反馈与贡献请前往 [本仓库](https://github.com/lemos1235/zotero-putongdoc)。
