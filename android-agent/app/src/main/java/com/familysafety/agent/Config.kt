package com.familysafety.agent

object Config {
    // Wi-Fi üzerinden bilgisayarın yerel IP adresi (örn. 192.168.1.100)
    var backendUrl: String = "http://192.168.1.100:8000"
    var profileId: String = "default"

    val watchedPackages = setOf(
        "com.whatsapp",
        "com.whatsapp.w4b",
        "org.telegram.messenger",
        "com.instagram.android",
        "com.snapchat.android",
    )
}
