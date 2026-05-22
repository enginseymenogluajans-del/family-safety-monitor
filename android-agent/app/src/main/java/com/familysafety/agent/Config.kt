package com.familysafety.agent

object Config {
    // Wi-Fi üzerinden bilgisayarın yerel IP adresi — MainActivity'den SharedPreferences ile güncellenir
    var backendUrl: String = "http://192.168.1.175:8000"
    var profileId: String = "default"

    // Signal server URL'i backend'den otomatik türetilir (port 8000 → 8001)
    val signalServerUrl: String
        get() = backendUrl.replace(":8000", ":8001")

    // Backend REST API kimlik doğrulama
    const val API_KEY: String = "suCi7-_40F_ca1kmd62hsddmBR1fGvorOEPXKxWQJNM"

    // Supabase — doğrudan Storage upload için
    const val SUPABASE_URL: String = "https://vgmybtiqrpboieipqdzy.supabase.co"
    const val SUPABASE_ANON_KEY: String = "sb_publishable_-uMTaYBoI9XPaG7RTZqNAg_ozirI4y3"
    // Service role key — Supabase Dashboard → Settings → API → service_role key
    const val SUPABASE_SERVICE_KEY: String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnbXlidGlxcnBib2llaXBxZHp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTE2ODAzMSwiZXhwIjoyMDk0NzQ0MDMxfQ.Cok3VBhBWeu8gutPN1k4nt4SlpheLf0JbB5GKQIX9mE"

    val watchedPackages = setOf(
        "com.whatsapp",
        "com.whatsapp.w4b",
        "org.telegram.messenger",
        "com.instagram.android",
        "com.snapchat.android",
    )
}
