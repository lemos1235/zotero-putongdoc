startup-begin = Addon is loading
startup-finish = Addon is ready
menuitem-translate = Translate with PutongDoc
menuView-tasks = View PutongDoc tasks
pref-test-success = Test successfully
pref-test-failed = Test failed
pref-test-failed-description = Please check your API token

prefs-title = PutongDoc
item-filed-status = Translation Status

translateMode-all = Bilingual mode & Translation only
translateMode-dua = Bilingual mode
translateMode-translation = Translation only

attachment-title-compare = { $title } (Bilingual)
attachment-title-translated = { $title } (Translation)

translateModel-qwen = Qwen
translateModel-kimi-qwen = Kimi + Qwen(Limited Test)
translateModel-kimi-deepseek = Kimi + DeepSeek(Limited Test)
translateModel-deepseek = DeepSeek
translateModel-doubao = Doubao
translateModel-glm-4-plus = GLM 4.7
translateModel-OpenAI = OpenAI
translateModel-Gemini = Gemini
translateModel-glm-4-flash = GLM-4-Flash

auto = Auto
ocr_workaround_enable = Enable
ocr_workaround_disable = Disable

font_family_serif = Serif
font_family_sans-serif = Sans-serif
font_family_script = Script

dual_mode_lort = Side-by-side: Original | Translation
dual_mode_ltro = Side-by-side: Translation | Original
dual_mode_uodt = Page Alternation: Original Text First
dual_mode_utdo = Page Alternation: Translation First

layoutModel-version-2 = Version 2
layoutModel-version-3 = Version 3

confirm-title = Translate Confirm
confirm-options = Options
confirm-article-single = Selected article
confirm-article-multiple = { $count } selected items. First item shown below.
confirm-article-unknown = Untitled article
confirm-article-metadata-unknown = Author/year unavailable
confirm-enable-compatibility = Enable compatibility mode
confirm-enable-compatibility-description = Enabling this will improve PDF compatibility, but will increase the output file size.
confirm-translate-model = Translation model
confirm-translate-mode = Translation mode
confirm-target-language = Target language
confirm-yes = Confirm
confirm-cancel = Cancel

task-no-pdf = No PDF found for translation

column-item = Item
column-attachment = Attachment
column-target-language = Target Language
column-translate-model = Translation Model
column-translate-mode = Translation Mode
column-pdfId =  Task ID
column-stage = Current Stage
column-progress = Translate Progress
column-error = Error Message

task-uncomplete = Task not completed
task-select-tip = Please select a task
task-copy-success = Task ID Copied!
task-cancel-success = Task canceled successfully
task-cancel-tip = Only queued tasks can be canceled
task-cancel-running = The task has started processing and cannot be canceled
task-cancel-failed = Failed to cancel the task

task-status-queued = Pending start
task-status-uploading = Uploading
task-status-translating = Translating
task-status-success = Success
task-status-failed = Failed
task-status-canceled = Canceled

task-stage-queued = Queuing
task-stage-uploading = Uploading PDF
task-stage-parse-pdf = Parsing PDF
task-stage-DetectScannedFile= Checking if it is a scanned version
task-stage-ParseLayout= Parsing page layout
task-stage-ParseParagraphs= Parsing paragraphs
task-stage-ParseFormulasAndStyles = Parsing formulas & styles
task-stage-RemoveCharDescent = Correcting character offset
task-stage-TranslateParagraphs = Translating paragraphs
task-stage-Typesetting = Typesetting
task-stage-AddFonts = Adding fonts
task-stage-GenerateDrawingInstructions = Exporting PDF
task-stage-SubsetFont = Subsetting font
task-stage-SavePDF = Generating PDF
task-stage-prepareFileDownload = Processing file
task-stage-ParseTable = Parsing table
task-stage-WaitingInLine = Queuing
task-stage-CreateTask = Creating task
task-stage-downloading = Downloading
task-stage-completed = Translate completed

task-retry-success = Task retry queued successfully
task-retry-tip = Only failed tasks can be retried
task-retry-failed = Failed to retry the task
task-retry-uncertain = Retry result is uncertain; the task status will be queried again

# Network and download related strings
network-slow-title = Slow Network Access
network-slow-message = The download is slow. Please check your network connection and try again.
network-slow-dont-remind = Don't remind again
download-failed = Download failed

api-token-required = Enter a complete API token starting with pt_ in settings.
api-token-saved = Token configured
api-token-placeholder-empty = pt_…
api-token-placeholder-saved = Enter a new token to replace
api-request-failed = PutongDoc request failed
api-operation-quota = Check quota
api-operation-languages = List target languages
api-operation-upload-url = Request upload URL
api-operation-upload = Upload PDF to storage
api-operation-create = Create translation task
api-operation-query = Query translation status
api-operation-cancel = Cancel translation task
api-operation-retry = Retry translation task
api-operation-download-url = Request download URL
api-operation-download = Download PDF
task-debug-empty = No diagnostic information available. Try with the updated plugin; check uncertain submissions on the website first.
task-debug-copied = Diagnostic information copied
api-untrusted-url = Request to an untrusted address blocked.
api-quota = Files remaining today: { $files }; pages: { $pages }.
api-language-invalid = Invalid target language. Please select one from the list.
api-options-invalid = Invalid translation options. Please select them again in settings.
api-pdf-invalid = Select a valid local PDF.
api-file-size = The file is empty or exceeds your account's file-size limit.
api-file-changed = The local PDF changed. Please submit again.
api-quota-exhausted = Daily file or page quota exhausted. Please wait for reset.
api-submission-uncertain = Submission result is uncertain. Check https://putongdoc.com before resubmitting. The plugin will not recreate this task automatically.
api-wait-timeout = Waited 30 minutes; the server may still be processing. Task ID saved. Retry resumes querying without creating another task.
api-task-failed = Translation failed on the server.
api-persistence-failed = Could not safely save submission state to disk. Submission stopped. Check disk space and Zotero profile permissions.
extract-native = Default
extract-mineru = MinerU
extract-zhipu = Z.AI
confirm-extract-backend = PDF extraction engine
column-extract-backend = Extraction engine
task-status-paused = Paused (can resume)
task-status-uncertain = Submission uncertain
task-stage-preparing = Preparing
task-stage-extracting = Extracting
task-stage-translating = Translating
task-stage-rendering = Rendering
task-stage-archiving = Archiving files
