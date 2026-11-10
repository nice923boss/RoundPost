# 串門子 RoundPost

社群貼文管理工具：用行事曆規劃貼文、編輯文案、追蹤各平台發佈狀態。Windows 桌面 App（Electron）。

版本 1.1.0，開啟即可使用，不需要序號。

## 安裝（一般使用者）

從 [Releases](https://github.com/nice923boss/RoundPost/releases) 下載 `RoundPost-Setup-1.1.0.exe`，執行後依畫面完成安裝。安裝檔沒有程式碼簽章，Windows SmartScreen 會跳警告，按「其他資訊」→「仍要執行」。

資料存在 `%APPDATA%\roundpost\`：

- 每個專案一個 SQLite 資料庫
- `logs/`：執行紀錄，回報問題時附上這個資料夾

## 主要功能

| 頁面 | 功能 |
|---|---|
| 儀表板 | 今日待辦、各狀態（草稿、已確認、已發佈）貼文數、一鍵標記今日貼文為已發佈 |
| 行事曆 | 月曆檢視，拖曳改日期，點日期新增貼文 |
| 平台管理 | 管理發佈平台，每篇貼文可分別追蹤各平台狀態 |
| 範本 | 常用文案範本，新增貼文時套用 |
| 搜尋 | 全文搜尋標題與內文 |
| 設定 | 外觀、同步資料夾、匯入貼文（含範本下載）、清除所有排程 |

側欄可以建立、切換、刪除專案，每個專案的貼文分開存放。

### 從 HoloTeam 發文準備師同步

在「設定」選擇發文準備師的資料夾（裡面有 `sync/` 子資料夾，選 `sync/` 本身也可以）。App 會監看 `sync/` 裡的 `.md` 檔，新增或修改時自動匯入。

檔案格式：

```markdown
---
title: 貼文標題（必填）
date: 2026-10-20
time: "09:00"
status: draft
platforms: [Facebook, Instagram]
source_skill: 發文準備師
---

貼文內容（Markdown）
```

日期或時間無法辨識時，仍會匯入，但該欄位清空，並在同步紀錄顯示警告。

### 匯入試算表

支援 `.xlsx`、`.csv`、`.tsv`、`.txt`（逗號或 Tab 分隔）。不支援舊版 `.xls`，請先在 Excel 另存為 `.xlsx`。

在「設定 > 匯入貼文」按「下載範本」可以存一份 `貼文匯入範本.xlsx`：

- 「貼文」工作表：欄位依序是標題、內容、日期、時間、平台、狀態，附 3 列範例（標題開頭是「【範例】」，匯入前請刪除）。
- 「填寫說明」工作表：每個欄位的格式，以及目前平台管理裡的平台名稱。
- 狀態欄有下拉選單（草稿、已確認、已發佈）；日期留空會變成未排程的草稿。

照範本填好後，用「選擇檔案」匯入，欄位會自動對應。標題與日期都相同的貼文會略過，不會重複建立。

### 清除所有排程

「設定 > 清除所有排程」會刪除目前專案的全部貼文（含未排程的草稿），讓行事曆回到空白。平台、範本與其他專案不受影響。

- 執行前要在確認框輸入「清除所有排程」，按鈕才會啟用。
- 專案有連結同步資料夾時，會一併停止同步，避免貼文從 `.md` 檔重新建立；資料夾裡的檔案不會被刪除。
- 刪除後無法復原。要保留資料，請先備份 `%APPDATA%\roundpost`。

## 開發

需求：Node.js 22.12 以上（`node:sqlite` 需要）。

```bash
npm install
```

```bash
npm run dev
```

也可以雙擊 `start.bat`（背景啟動開發模式，不顯示命令列視窗），用 `stop.bat` 結束。

### npm 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發模式（熱重載） |
| `npm run build` | 編譯到 `out/` |
| `npm start` | 執行 `out/` 的編譯結果 |
| `npm run typecheck` | 檢查 main 與 renderer 兩邊的型別 |
| `npm test` | 執行 `tests/` 的自動測試（Node 內建 test runner） |
| `npm run pack` | 打包成免安裝資料夾 `release/win-unpacked/`（測試用） |
| `npm run dist` | 產生 Windows 安裝檔 `release/RoundPost Setup x.y.z.exe` |

`build-win.bat` 與 `npm run dist` 效果相同。`build-mac.sh` 產生 mac 版，但尚未驗證（見 GAPS.md）。

### 目錄

```
electron/          main 行程
  db/              SQLite 連線、schema 與遷移、repositories
  ipc/             IPC handler（全部經過 zod 驗證）
  services/        同步監看、匯入、剪貼簿、log
  preload.ts       暴露給畫面的 API
shared/            main 與畫面共用的型別
src/               畫面（React）
  components/      各頁面元件
  stores/          zustand 狀態
tests/             自動測試
resources/         App 圖示
```

### 打包容量

所有套件都放在 devDependencies，由 Vite 打包進 `out/`，所以安裝檔不含 `node_modules`。App 自身程式約 1.6 MB，其餘都是 Electron 執行環境。

打包時 `scripts/afterPack.cjs` 會刪掉只給 WebGPU 用的 dxcompiler.dll 與 dxil.dll（約 26 MB）。升級 Electron 後要重新確認畫面與 GPU 功能狀態沒有變化（GAPS #16）。

## 相關文件

- `CHANGELOG.md`：1.1.0 升級內容
- `GAPS.md`：已知限制與未完成項目

## 授權

[MIT](LICENSE)

製作者：黃政文
