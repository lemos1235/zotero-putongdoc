startup-begin = 插件加载中
startup-finish = 插件已就绪
menuitem-translate = 使用 PutongDoc 翻译
menuView-tasks = 查看 PutongDoc 翻译任务
pref-test-success = 测试成功
pref-test-failed = 测试失败
pref-test-failed-description = 请检查 API 令牌是否正确

prefs-title = PutongDoc
item-filed-status = 翻译状态

translateMode-all = 双语模式 & 译文模式
translateMode-dua = 双语模式
translateMode-translation = 仅译文

translateModel-qwen = Qwen
translateModel-kimi-qwen = Kimi + Qwen(限时测试)
translateModel-kimi-deepseek = Kimi + DeepSeek(限时测试)
translateModel-deepseek = DeepSeek
translateModel-doubao = 豆包
translateModel-glm-4-plus = GLM 4.7
translateModel-OpenAI = OpenAI
translateModel-Gemini = Gemini
translateModel-glm-4-flash = 智谱 4 Flash

auto = 自动
ocr_workaround_enable = 开启
ocr_workaround_disable = 关闭

font_family_serif = 宋体
font_family_sans-serif = 黑体
font_family_script = 楷体

dual_mode_lort = 左右对照：原文｜译文
dual_mode_ltro = 左右对照：译文｜原文
dual_mode_uodt = 页面交替：原文在前
dual_mode_utdo = 页面交替：译文在前

layoutModel-version-2 = 版本 2
layoutModel-version-3 = 版本 3

confirm-title = 翻译确认
confirm-options = 选项
confirm-article-single = 当前选择的文章
confirm-article-multiple = 已选择 { $count } 个条目。下方显示第一项。
confirm-article-unknown = 未命名文章
confirm-article-metadata-unknown = 作者/年份不可用
confirm-enable-compatibility = 是否启用兼容模式
confirm-enable-compatibility-description = 启用后将会改善 PDF 兼容性，但是会增大输出文件大小
confirm-translate-model = 翻译模型
confirm-translate-mode = 翻译模式
confirm-target-language = 目标语言
confirm-yes = 确认
confirm-cancel = 取消

task-no-pdf = 没有找到可以翻译的 PDF

column-item = 条目
column-attachment = 附件
column-target-language = 目标语言
column-translate-model = 翻译模型
column-translate-mode = 翻译模式
column-pdfId =  任务 ID
column-status = 任务状态
column-stage = 当前阶段
column-progress = 翻译进度
column-error = 错误信息
column-resultAttachmentId = 结果附件 ID

task-uncomplete = 任务未完成
task-select-tip = 请选择一个任务
task-copy-success = 复制任务 ID 成功！
task-cancel-success = 取消任务成功
task-cancel-tip = 只能取消未开始的任务

task-status-queued = 未开始
task-status-uploading = 上传中
task-status-translating = 翻译中
task-status-success = 成功
task-status-failed = 失败
task-status-canceled = 已取消

task-stage-queued = 排队中
task-stage-uploading = 正在上传 PDF
task-stage-parse-pdf = 正在解析 PDF
task-stage-DetectScannedFile= 正在检测是否为扫描版
task-stage-ParseLayout= 正在解析页面布局
task-stage-ParseParagraphs= 正在解析段落
task-stage-ParseFormulasAndStyles = 正在解析公式&样式
task-stage-RemoveCharDescent = 正在修正字符偏移量
task-stage-TranslateParagraphs = 正在翻译段落
task-stage-Typesetting = 正在排版
task-stage-AddFonts = 正在添加字体
task-stage-GenerateDrawingInstructions = 正在导出 PDF 页面
task-stage-SubsetFont = 正在子集化字体
task-stage-SavePDF = 正在生成 PDF 文件
task-stage-prepareFileDownload = 正在处理文件
task-stage-ParseTable = 正在解析表格
task-stage-WaitingInLine = 正在排队
task-stage-CreateTask = 正在创建任务
task-stage-downloading = 下载中
task-stage-completed = 翻译完成

task-retry-success = 重试任务已成功加入队列
task-retry-tip = 只能重试失败的任务

# Network and download related strings
network-slow-title = 当前网络访问较慢
network-slow-message = 下载较慢，请检查网络连接后重试。
network-slow-dont-remind = 不再提醒
download-failed = 下载失败

api-token-required = 请在设置中填写 pt_ 开头的完整 API 令牌。
api-token-saved = 令牌已配置
api-token-placeholder-empty = pt_…
api-token-placeholder-saved = 输入新令牌可替换
api-request-failed = PutongDoc 请求失败
api-operation-quota = 检查额度
api-operation-languages = 查询目标语言
api-operation-upload-url = 申请上传链接
api-operation-upload = 上传 PDF 到对象存储
api-operation-create = 创建翻译任务
api-operation-query = 查询翻译状态
api-operation-download-url = 申请下载链接
api-operation-download = 下载 PDF
task-debug-empty = 暂无诊断信息。请使用新版插件重新尝试；提交结果不确定的任务请先在网站核查。
task-debug-copied = 诊断信息已复制
api-untrusted-url = 已阻止向不可信地址发送请求。
api-quota = 今日剩余文件：{ $files }；页数：{ $pages }。
api-language-invalid = 目标语言无效，请从列表中重新选择。
api-options-invalid = 翻译选项无效，请在设置中重新选择。
api-pdf-invalid = 请选择有效的本地 PDF 文件。
api-file-size = 文件为空或超过账号单文件大小上限。
api-file-changed = 本地 PDF 已变化，请重新提交。
api-quota-exhausted = 今日文件或页数额度已用尽，请等待重置。
api-submission-uncertain = 提交结果不确定。请在 https://putongdoc.com 核查后决定是否重新提交；插件不会自动重建任务。
api-wait-timeout = 等待已达 30 分钟，服务端可能仍在处理。已保留任务 ID，可点击重试继续查询，不会重建任务。
attachment-title-translated = 译文（{ $language }）
attachment-title-compare = 双语对照（{ $language }）
api-task-failed = 服务端翻译失败。
api-persistence-failed = 无法将提交状态安全保存到磁盘，已停止提交。请检查磁盘和 Zotero 配置目录权限。
extract-native = 内置
extract-mineru = Mineru
extract-zhipu = 智谱
confirm-extract-backend = PDF 解析引擎
column-extract-backend = 解析引擎
task-status-paused = 已暂停（可继续查询）
task-status-uncertain = 提交结果不确定
task-stage-preparing = 准备中
task-stage-extracting = 解析中
task-stage-translating = 翻译中
task-stage-rendering = 排版中
task-stage-archiving = 文件归档中
