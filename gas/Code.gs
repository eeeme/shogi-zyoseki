/**
 * 定跡帳：応援メッセージの受け口（Google Apps Script）
 * スプレッドシートの「拡張機能 → Apps Script」に貼り、ウェブアプリとしてデプロイする。
 * 届いたメッセージを「応援」シートに1行追加し、スクリプトの持ち主にメールで知らせる。
 */
const SHEET_NAME = '応援'

function doPost(e) {
  let d = {}
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}') } catch (err) { return out_(false) }
  const message = clean_(d.message, 300)
  const name = clean_(d.name, 30)
  if (!message) return out_(false)

  // いたずら対策：10分に30件まで
  const cache = CacheService.getScriptCache()
  const n = Number(cache.get('count') || 0)
  if (n >= 30) return out_(false)
  cache.put('count', String(n + 1), 600)

  const ss = SpreadsheetApp.getActive()
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
  if (sh.getLastRow() === 0) sh.appendRow(['日時', '応援', 'ニックネーム', 'メッセージ', 'アプリ'])
  const tier = clean_(d.tier, 40)
  sh.appendRow([new Date(), tier, name, message, clean_(d.app, 40)])

  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: `【定跡帳】応援メッセージ ${tier}`,
    body: `${name || '（ニックネームなし）'}\n\n${message}\n\n${ss.getUrl()}`,
  })
  return out_(true)
}

// 文字数を切り詰め、数式として解釈されないようにする
function clean_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max).trim()
  return /^[=+\-@]/.test(s) ? "'" + s : s
}

function out_(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok })).setMimeType(ContentService.MimeType.JSON)
}
