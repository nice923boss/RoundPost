# CHANGELOG

## 1.1.0（2026-10-18）

從 1.0.0 全面升級，共 131 項。仍未完成或未驗證的項目集中在 [GAPS.md](GAPS.md)。

### 容量結果

| 項目 | 1.0.0 | 1.1.0 | 說明 |
|---|---|---|---|
| App 自身程式（resources/app.asar 與解開的檔案） | 77 MB | 1.6 MB | 不再把 node_modules 整包裝進去 |
| 安裝後資料夾 | 349 MB | 298 MB | 其餘是 Electron 執行環境本身；已移除只給 WebGPU 用的 dxcompiler.dll、dxil.dll（第 131 項） |
| 開發用 node_modules | 708 MB | 510 MB | 移除原生模組與重複套件 |
| 安裝檔 | 87.5 MB | 92.2 MB | **仍大約 4.7 MB**：Electron 44 執行環境比 34 大（見 GAPS #6） |

### 標記說明

- **[實作]**：程式已完成，型別檢查 0 錯誤、58 項自動測試通過，打包成功。
- **[Doc]**：純文件，沒有程式碼。
- 註明「實機」的項目，另外在開發版或打包版實際操作確認過，詳見文末「實機驗證紀錄」。
- 註明「未驗證」的項目，程式已改但沒有實際跑過，已登記在 GAPS.md。

---

### 錯誤修正（25）

1. [實作] 「今天」改用本地日期，修正台灣早上 8 點前日期少一天；SQLite 的 UTC 時間字串也正確轉成本地時間（`src/lib/date.ts`）
2. [實作] 行事曆繁中語系實際生效，改為匯入語系物件（舊版只傳 "zh-tw" 字串，沒有載入語系檔，畫面仍是英文）（`src/components/calendar/CalendarView.tsx`）
3. [實作] 點行事曆日期改開「新增貼文」對話框，不再直接建立空標題貼文；拖曳改期失敗時還原位置並提示（`CalendarView.tsx`）
4. [實作] 新增平台到貼文時回傳真正的資料，重複加入不再回傳不存在的 id（`electron/db/repositories/postRepository.ts`）
5. [實作] 搜尋字詞含引號或運算子時不再讓全文搜尋報錯（`postRepository.ts`）
6. [實作] 1 至 2 字的搜尋會跳脫 % 與 _（`postRepository.ts`）
7. [實作] 實機：新貼文搜得到了。全文索引改由 trigger 隨寫入更新（舊版的重建方式讓新貼文永遠不進索引，而且每次寫入都整個重建）（`electron/db/schema.ts`）
8. [實作] 同步檔更新時不再重設使用者改過的狀態，只會從草稿升為已確認（`postRepository.ts`）
9. [實作] 同步檔更新時保留已發佈的平台，只移除未發佈且檔案已不再列出的平台（`postRepository.ts`）
10. [實作] 「標記今日貼文為已發佈」只處理已確認的貼文，保留原發佈時間；不再逐筆覆寫剪貼簿、一次開一堆分頁（`posts:markPublishedByDate`）
11. [實作] 搜尋索引改以 post_id 為鍵，修正資料庫整理（VACUUM）後搜尋結果對錯貼文（`schema.ts`）
12. [實作] 1.0.0 的內容欄混存 HTML、Markdown、純文字，遷移時統一轉成 HTML，另存一份純文字（`schema.ts`）
13. [實作] 同步檔的日期與時間保持原字串，不會被解析成其他格式；前置資料支援 BOM、CRLF 與 `...` 結尾（`electron/services/syncFile.ts`）
14. [實作] 同步檔中無法辨識的日期或時間改列為警告並清空該欄，其餘內容照常寫入（`syncFile.ts`）
15. [實作] 平台預設圖示取前 2 個字時以字元為單位，不會切壞 emoji（`platformRepository.ts`）
16. [實作] 複製成 RTF 時，emoji 與罕用字不再遺失（`electron/services/rtf.ts`）
17. [實作] 專案資料庫路徑在這台電腦不存在時（例如從別台電腦搬來），改用本機資料夾裡的同名檔（`electron/db/connection.ts`）
18. [實作] 切換專案後，舊專案的監看事件不會再寫進新專案（`fileWatcherService.ts`）
19. [實作] 刪除專案前先關閉資料庫，避免 Windows 檔案被鎖住而刪除失敗（`projectRepository.ts`）
20. [實作] 設定讀寫的 IPC 在 1.0.0 引用了沒有匯入的函式，一呼叫就報錯；改為主題設定專用的 `settings:getTheme`、`settings:setTheme`（`electron/ipc/appHandlers.ts`）
21. [實作] 範本變數支援中文名稱，有自動測試涵蓋（舊版只認英數字，連範例裡的 `{{客戶名}}` 都無法替換）（`shared/template.ts`）
22. [實作] 匯入完成提示顯示正確筆數（舊版讀錯欄位，顯示「undefined 筆」）（`ImportSection.tsx`）
23. [實作] 設定頁的版本號改讀程式版本（舊版寫死 v1.0.0）（`SettingsPage.tsx`）
24. [實作] 實機：側欄 logo 改由 Vite 匯入，打包版也能顯示（舊版用 `/icon.png`，在打包版的 file:// 下失效）（`AppShell.tsx`）
25. [實作] 視窗與工作列圖示改用 Vite 匯入並打包，打包後路徑不再失效（`electron/main.ts`）

### 安全性（11）

26. [實作] 視窗啟用 sandbox 與 contextIsolation，關閉 nodeIntegration；打包版停用開發者工具，選單也隱藏該項（`electron/main.ts`）
27. [實作] 頁面不能導向 App 以外的網址，開新視窗一律拒絕，只有 http、https 連結交給預設瀏覽器（`main.ts`）
28. [實作] 所有 IPC 統一經過 `handle()`，只接受 App 自身頁面的呼叫（`electron/ipc/handle.ts`）
29. [實作] 所有 IPC 參數用 zod 驗證，錯誤訊息為繁中（`handle.ts`）
30. [實作] 參數規則：日期必須真實存在、時間為 HH:mm、標題上限 500 字、內容上限 2 MB、物件不接受多餘欄位（舊版可改任意欄位）（`electron/ipc/schemas.ts`）
31. [實作] 匯入只能讀取使用者在對話框選的檔案，頁面無法自行指定路徑（`importHandlers.ts`）
32. [實作] 開啟平台網址改由主程序依平台 id 查表，並限定 http、https（舊版直接開頁面傳來的任意網址）（`clipboardHandlers.ts`）
33. [實作] HTML 以白名單清理，連結只允許 http、https、mailto，並補齊未閉合標籤；Markdown 轉換結果同樣經過清理（`html.ts`、`markdown.ts`）
34. [實作] 打包版注入 CSP（default-src 'self'、script-src 'self'、object-src 'none'、base-uri 'none'、form-action 'none'），已確認寫入打包後的 index.html（`electron.vite.config.ts`）
35. [實作] 啟用 Electron Fuses：關閉 RunAsNode、NODE_OPTIONS、inspect 參數；開啟 asar 完整性驗證、只從 asar 載入、Cookie 加密。建置紀錄顯示已套用，未逐項讀回確認（`package.json`）
36. [實作] 平台網址在畫面端也檢查必須以 http 或 https 開頭，各欄位設長度上限（`PlatformManager.tsx`）

### 效能（8）

37. [實作] 貼文列表用 json_each 一次帶出所有平台，取代逐筆查詢（`postRepository.ts`）
38. [實作] SQL statement 快取；資料庫採 WAL、synchronous=NORMAL、5 秒鎖等待，關閉時執行 PRAGMA optimize（`electron/db/db.ts`）
39. [實作] 3 字以上的搜尋改走 FTS5 trigram，依相關度排序（`postRepository.ts`）
40. [實作] 新增 post_platforms.platform_id 索引，平台篩選改用 EXISTS 子查詢（`schema.ts`）
41. [實作] 同步事件每 800ms 彙整一批，再一次刷新畫面（`src/stores/postStore.ts`）
42. [實作] 同步檔內容雜湊相同就略過，不寫資料庫也不通知畫面（`fileWatcherService.ts`）
43. [實作] 監看器只看一層，並等檔案寫完才處理（`fileWatcherService.ts`）
44. [實作] 標記發佈、整批匯入、同步寫入各自在單一交易內完成（`importService.ts` 等）

### 容量縮減（10）

45. [實作] 以 Node 內建 node:sqlite 取代 better-sqlite3 原生模組，不再需要 asarUnpack 與原生模組重編（`electron/db/db.ts`）
46. [實作] 自寫 xlsx 讀取器（ZIP 加 XML，含大小與欄列上限防護），取代已停止更新且有已知弱點的 xlsx 套件（`xlsxReader.ts`）
47. [實作] 以 yaml 取代 gray-matter（`syncFile.ts`）
48. [實作] 以 node:crypto 的 randomUUID 取代 uuid 套件
49. [實作] 以自寫日期工具取代 date-fns（`src/lib/date.ts`）
50. [實作] 所有套件改列 devDependencies 交給 Vite 打包；安裝檔只收 out、256x256 圖示與 package.json，不再帶入 node_modules 和整個 resources 資料夾（`package.json`）
51. [實作] asar 改用最高壓縮，Electron 語系只保留 zh-TW 和 en-US（`package.json`）
52. [實作] 畫面程式開啟壓縮，主要 JS 從 1832 KB 降到 871 KB（`electron.vite.config.ts`）
53. [實作] 移除沒有用到的 `public/icon.png`
54. [Doc] 實測容量比較（見本檔開頭「容量結果」）

### 套件升級與建置（11）

55. [實作] Electron 34.2 升到 44.9.0（`package.json`）
56. [實作] electron-vite 3 升到 6，Vite 6 升到 8，@vitejs/plugin-react 4.3 升到 6.1（`electron.vite.config.ts`）
57. [實作] electron-builder 改為 npx 固定 26.15.3，不再裝在 node_modules（`package.json`）
58. [實作] marked 15 升到 18，改用 Marked 實例（`markdown.ts`）
59. [實作] chokidar 4 升到 5（`fileWatcherService.ts`）
60. [實作] TipTap 2.11.5 升到 2.27.3、FullCalendar 6.1.17 升到 6.1.22、papaparse 5.5 升到 5.7；React、react-router-dom、zustand、TypeScript 小版本升級（`package.json`）
61. [實作] node:sqlite 設為 external，移除 externalizeDepsPlugin（`electron.vite.config.ts`）
62. [實作] postinstall 改為只安裝 Electron 執行檔，不再重編原生模組；宣告需要 Node 22.12 以上（`package.json`）
63. [實作] Windows 安裝程式改為繁中介面、只建 x64；移除 `signAndEditExecutable: false`，exe 能寫入圖示與版本資訊（`package.json`）
64. [實作] 重製 Windows 圖示，含 7 種尺寸（舊檔只有單一尺寸）（`resources/icon.ico`）
65. [實作] 實機：版本升為 1.1.0，已產出 `release/RoundPost Setup 1.1.0.exe`（2026-10-18 12:05，含本版所有修改，包括第 130、131 項）

### 功能新增（18）

66. [實作] 新增貼文對話框：標題必填，可先選好平台（`NewPostDialog.tsx`）
67. [實作] 範本變數 `{{名稱}}` 即時預覽，可「複製結果」或「用結果建立草稿」（`TemplateManager.tsx`）
68. [實作] 搜尋可加上狀態與平台篩選，結果可點開貼文詳情（`SearchPanel.tsx`）
69. [實作] 儀表板新增「已過排程日但未發佈」與「尚未排程」區塊，以及四格統計（`StatusDashboard.tsx`）
70. [實作] 儀表板可直接新增貼文，點貼文會開側邊詳情（`StatusDashboard.tsx`）
71. [實作] 匯入 CSV、TSV、TXT、XLSX：預覽前 5 列，欄位對應自動帶入建議，最後顯示結果報告（`ImportSection.tsx`）
72. [實作] 匯入認得民國年、星期標記、Excel 日期序號、上午下午與中文狀態詞（`importService.ts`）
73. [實作] 匯入時辨識 UTF-8、UTF-16、Big5 編碼（舊版 Big5 檔案會變亂碼）（`textDecode.ts`）
74. [實作] 編輯器加入 H2、編號清單、程式碼區塊；連結可插入、編輯、移除，並補上 https；支援 Ctrl+S 儲存（`PostDetailPanel.tsx`）
75. [實作] 全部平台都已發佈時，可一鍵把貼文狀態改為已發佈（`PostDetailPanel.tsx`）
76. [實作] 貼文可移除平台，平台列顯示發佈時間（`PlatformRow.tsx`）
77. [實作] 複製貼文時同時寫入 HTML、RTF、純文字三種格式，貼到 Word 會保留格式（`clipboardService.ts`）
78. [實作] 主題可選跟隨系統、淺色、深色（`SettingsPage.tsx`）
79. [實作] 每個專案各自設定同步資料夾，可停止同步，並顯示最後同步的時間與檔名（`workspace.ts`）
80. [實作] 選到 sync 資料夾本身或「輸出\發文準備師」，都會對應到正確位置（`fileWatcherService.ts`）
81. [實作] 記錄檔每天一個檔、保留 14 天，可從選單或設定頁開啟資料夾（`logger.ts`）
82. [實作] 「關於」對話框顯示版本與製作者（`main.ts`）
83. [實作] 繁中應用程式選單（檔案、編輯、檢視、視窗、說明），另有 mac 專用選單（`main.ts`）

### 介面與體驗（17）

84. [實作] 實機：移除註冊碼機制，開啟即用；舊的 `#/activation` 等未知路由會導回儀表板（`src/App.tsx`）
85. [實作] 全面以提示訊息（toast）和自訂確認框取代瀏覽器的 alert 與 confirm（`ConfirmDialog.tsx`）
86. [實作] 切換專案不再整頁重新載入，頁面重新掛載並清除舊專案資料（`projectStore.ts`）
87. [實作] 專案面板可按 Esc 或點外部關閉；刪除專案時說明資料庫會移到資源回收筒、不影響同步檔（`AppShell.tsx`）
88. [實作] 深色模式由主題設定控制，並支援鍵盤焦點外框與減少動態效果（`App.css`）
89. [實作] 視窗準備好才顯示，背景色依深淺色決定，開啟時不閃白（`main.ts`）
90. [實作] 無障礙標記：aria-invalid、aria-pressed、aria-modal、alertdialog（`PostDetailPanel.tsx` 等）
91. [實作] 同步來的貼文會標示來源，說明檔案更新會覆蓋此處的修改；刪除時說明同步檔還在就會重建（`PostDetailPanel.tsx`）
92. [實作] 移除已發佈平台、刪除平台、刪除範本、停止同步之前都會先確認（`PlatformManager.tsx` 等）
93. [實作] 平台沒有網址時「前往」按鈕停用並說明原因；複製成功顯示「已複製」（`PlatformRow.tsx`）
94. [實作] 行事曆依狀態上色，每格最多顯示 4 則，按鈕文字為繁中（`CalendarView.tsx`）
95. [實作] 排程顯示格式為「10/18（六）09:00」（`src/lib/date.ts`）
96. [實作] 實機：沒有已確認的貼文時，「標記今日貼文為已發佈」按鈕停用並說明原因；完成後詳情重新載入（`StatusDashboard.tsx`）
97. [實作] 同步完成時提示「已同步 N 個檔案」，錯誤最多顯示 3 則（`postStore.ts`）
98. [實作] 頁面出錯時顯示錯誤畫面，可「返回」或「重新載入」（`ErrorBoundary.tsx`）
99. [實作] 啟動或開啟資料庫失敗時，用對話框說明原因與記錄檔位置（`main.ts`）
100. [實作] 只允許開一個視窗，再次開啟時改為切到現有視窗（`main.ts`）

### 資料與同步（14）

101. [實作] 實機：關閉視窗或選單「結束」前，先儲存編輯中的貼文；3 秒沒回應視為完成；儲存失敗時跳出對話框詢問是否仍要關閉（`main.ts`、`preload.ts`、`src/main.tsx`）
102. [實作] 實機：範本編輯中的內容，在關閉視窗或切換專案前也會先儲存（`TemplateManager.tsx`）
103. [實作] 換頁、切換專案、建立或刪除專案、批次發佈前，先存下未儲存的編輯（`editorGuard.ts`）
104. [實作] 同步更新時，如果畫面上有未儲存的修改，不自動覆蓋，改為提示（`PostDetailPanel.tsx`）
105. [實作] 資料庫結構版本化遷移，升級前用 VACUUM INTO 備份成 `.v{n}.bak`；遇到較新版本的資料庫只警告（`schema.ts`）
106. [實作] 同步資料夾從全域設定改為每個專案一欄，舊設定移到上次使用的專案（`schema.ts`）
107. [實作] 同步來源改存相對路徑 `sync/...`，專案搬到別台電腦仍能對應，不會重複匯入（`schema.ts`）
108. [實作] 刪除專案時，把資料庫與 -wal、-shm、.bak 移到資源回收筒（舊版永久刪除），同步資料夾不動（`projectHandlers.ts`）
109. [實作] 移除舊版「登出專案會刪除同步貼文」的行為（`AppShell.tsx`）
110. [實作] 同步檔被刪除時保留貼文並提示（`fileWatcherService.ts`）
111. [實作] 同步資料夾不存在時只回報錯誤，不會自行建出整條路徑（`fileWatcherService.ts`）
112. [實作] 啟動時開上次使用的專案；沒有就開最舊的；都沒有才建立「預設專案」（`projectRepository.ts`）
113. [實作] 匯入時同標題、同日期的列視為重複並略過；錯誤附試算表列號；未知平台只回報，不自行建立（`importService.ts`）
114. [實作] 匯入讀檔錯誤分類說明（檔案不存在、被 Excel 鎖住等）；.xls 會提示另存為 .xlsx；檔案上限 20 MB（`importService.ts`）

### 程式品質與測試（10）

115. [實作] 新增 58 項自動測試（7 個測試檔，加上 Big5 與 xlsx 範例檔），使用 Node 內建測試工具（`tests/`）
116. [實作] typecheck 腳本對主程序與畫面兩組設定各跑一次 tsc（`scripts/typecheck.mjs`）
117. [實作] TypeScript 設定加嚴：noUnusedLocals、noUnusedParameters、noFallthroughCasesInSwitch、verbatimModuleSyntax、erasableSyntaxOnly（`tsconfig.node.json`、`tsconfig.web.json`）
118. [實作] 主程序與畫面之間改用有型別的 ElectronAPI 介面（`shared/api.ts`）
119. [實作] 狀態常數與中文標籤集中定義，三端共用（`shared/types.ts`）
120. [實作] 資料庫連線、workspace、IPC 參數規則不依賴 electron，可以直接測試（`workspace.ts` 等）
121. [實作] 統一記錄工具（INFO、WARN、ERROR，含堆疊），畫面端的錯誤也寫進同一個記錄檔（`appHandlers.ts`）
122. [實作] 主程序未捕捉的例外和 Promise 拒絕都會記錄（`main.ts`）
123. [實作] 範本替換改用函式，內容含 `$` 不會出錯，未知變數保留原樣（`shared/template.ts`）
124. [實作] 移除殘留的 console.log，改用記錄工具

### 文件與腳本（5）

125. [Doc] 新增 README.md：安裝、功能、同步檔格式、匯入、開發指令、打包容量
126. [Doc] 新增 GAPS.md 落差登記簿，共 15 條已知限制
127. [實作] 打包腳本改用固定版本的 electron-builder（`build-win.bat`；`build-mac.sh` 未驗證，見 GAPS #11）
128. [實作] `.gitignore` 移除已不需要的註冊碼項目
129. [實作] 實機：桌面捷徑「串門子 RoundPost - 捷徑」的工作目錄從舊電腦路徑（C:\Users\Clare）改成本機路徑

### 後續處理（2）

130. [實作] 實機：圖示去除白色方底。只把與畫面邊緣相連的白色轉成透明，圓臉內部保持不透明，外圍的藍色光暈保留為半透明陰影；重製 8 種尺寸 PNG 與 icon.ico（`resources/`）。原圖備份在 `舊版原始碼備份_v1.0.0.zip`
131. [實作] 實機：打包後刪除 dxcompiler.dll 與 dxil.dll（Chromium 只在 WebGPU 走 D3D12 時用到，RoundPost 沒用 WebGPU），安裝後資料夾省 25 MB、安裝檔省 6.6 MB（`scripts/afterPack.cjs`）

---

### 實機驗證紀錄

實機測試都用暫存資料夾（`--user-data-dir`）執行，沒有動到 `%APPDATA%\roundpost` 的既有資料。測試方式是 Chrome DevTools Protocol 腳本，沒有寫成可重跑的測試檔（GAPS #12）。

| 項目 | 版本 | 方式 | 結果 |
|---|---|---|---|
| 開啟即用（無註冊畫面） | 打包版 | 開啟後截圖 | 直接進儀表板，版本 1.1.0 |
| 側欄 logo、深色模式、製作者標示 | 打包版 | 截圖 | 正常 |
| 搜尋找得到新貼文 | 開發版 | 新增後搜尋 | 找得到 |
| 關閉視窗前儲存貼文（X 鈕） | 開發版 | 從主程序呼叫 win.close()，重開確認 | 已儲存 |
| 選單「結束」前儲存貼文 | 開發版 | 從主程序呼叫 app.quit()，重開確認 | 已儲存，記錄檔沒有警告 |
| 儲存失敗時的關閉確認 | 開發版 | 清空標題後關閉 | 視窗不關，跳出確認對話框 |
| 關閉前儲存範本 | 開發版 | 從主程序呼叫 win.close()，重開確認 | 已儲存 |
| 關閉前儲存範本 | 打包版 | taskkill（不加 /F，等同按 X），重開確認 | 已儲存，記錄檔沒有警告 |
| 沒有已確認貼文時停用批次發佈鈕 | 打包版 | 讀取按鈕狀態 | 停用，滑鼠提示「今日沒有「已確認」的貼文」 |
| 捷徑工作目錄 | 本機 | PowerShell 讀取 .lnk | 指向本機專案資料夾 |
| 圖示去背 | 原始檔、打包版 | 疊在深色與紅色底上目視 1024、256、32 px；讀出 exe 內嵌圖示 | 四角透明、圓臉完整、沒有白邊 |
| 移除 dxcompiler.dll、dxil.dll | 打包版 | 與保留 DLL 的版本比較 GPU 功能狀態、4 頁截圖、編輯器輸入、記錄檔 | GPU 狀態相同，儀表板、行事曆、範本截圖逐像素一致，設定頁只差資料夾名稱；編輯器可輸入；記錄檔沒有警告。WebGPU 無法建立裝置（App 沒用到） |
