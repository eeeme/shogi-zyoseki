// Web Speech API での読み上げ（読みはカタカナで渡す）
export function speak(text: string) {
  try {
    const s = window.speechSynthesis
    if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = 1
    s.speak(u)
  } catch {
    /* 非対応環境では何もしない */
  }
}
