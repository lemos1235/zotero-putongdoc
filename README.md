# Zotero PutongDoc

PutongDoc 的 Zotero 插件，用于 PDF 翻译及结果附件管理。

## 安装

1. 前往 [Releases](https://github.com/lemos1235/zotero-putongdoc/releases) 下载插件安装包 `zotero-putongdoc.xpi`。
2. 打开 Zotero 的「工具 → 插件」，点击齿轮菜单，选择「从文件安装插件」。
3. 选择安装包，按提示完成安装。

## 首次设置

1. 登录 [PutongDoc](https://putongdoc.com)，在 [令牌页面](https://putongdoc.com/tokens) 创建 API 令牌。
2. 打开 Zotero 的「设置 → PutongDoc」，粘贴完整的 `pt_` 开头的令牌，点击「测试」。请勿向他人分享令牌。
3. 按需调整翻译选项：

| 选项                 | 说明                                               |
| -------------------- | -------------------------------------------------- |
| 目标语言             | 默认简体中文，可选择其他语言                       |
| 翻译模式             | 双语对照、仅译文，或同时保存两种结果；默认双语模式 |
| PDF 解析引擎         | 内置、MinerU、智谱；默认 MinerU                    |
| 自动打开翻译后的 PDF | 默认开启，可取消勾选                               |

## 开始翻译

1. 在 Zotero 中选中一个或多个文献条目或 PDF 附件，确认 PDF 已下载到本地。
2. 右键选择「使用 PutongDoc 翻译」。
3. 在确认窗口检查目标语言、翻译模式和解析引擎，点击「确认」。
4. 点击工具栏的 PutongDoc 图标，查看任务进度。

翻译需要联网，会将所选 PDF 上传至 PutongDoc，并使用账号的翻译额度。

## 查看结果

任务完成后，翻译结果会自动添加到 Zotero，作为对应文献的附件。附件以翻译后的标题命名，后缀随 Zotero 界面语言变化：

- **`{标题}（双语对照）`**：双语的 PDF（英文界面为 `{title} (Bilingual)`）
- **`{标题}（译文）`**：译文的 PDF（英文界面为 `{title} (Translation)`）

标题由 PutongDoc 返回（例如 “Attention Is All You Need” 会变为 “注意力就是你需要的一切”）。如果没有返回标题，则使用不含 `.pdf` 扩展名的 PDF 文件名。

可直接打开附件，也可在任务窗口选中任务后点击「查看翻译结果」。

## 常见问题

- **没有找到可翻译的 PDF**：确认条目包含本地 PDF，或直接选中 PDF 附件。已生成的译文会自动跳过。
- **提示进行中的任务已达上限**：账号同时进行中（含排队）的任务数有上限，网页端与插件共用。批量提交超出剩余名额时整批不会提交，请等已有任务完成后再提交，或减少所选文献。
- **任务已暂停**：选中任务点击「重试」，继续查询或下载已有结果。
- **任务已失败**：已提交的任务点「重试」会调用服务端重试接口并重新扣额；未提交的任务会重新上传。
- **提交结果不确定**：先到 [PutongDoc](https://putongdoc.com) 核查，插件不会自动重建任务。
- **测试成功但提交失败**：测试只验证令牌与额度；请查看任务错误，必要时「复制诊断信息」后反馈。
- **取消任务**：仅排队中或准备中的任务可取消并同步到服务端；已开始的任务无法取消，「清空队列」不会终止服务端任务。

## 从源码构建

```sh
npm ci
npm run pack
```

`npm run pack` 会构建插件，并以带版本号的名称将安装包复制到 `dist/`，例如 `dist/zotero-putongdoc-0.1.0.xpi`。更多信息请参阅[开发指南](./CONTRIBUTING.md)。

## 源码来源

本项目基于 [immersive-translate/zotero-immersivetranslate](https://github.com/immersive-translate/zotero-immersivetranslate)，保留了原有的 Git 历史；此后独立维护。

采用 [AGPL-3.0-or-later](./LICENSE) 许可。原作者及贡献者的权利与声明均予以保留。
