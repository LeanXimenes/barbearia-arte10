# Modelos serializados com kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class br.com.barbeariaarte10.admin.** {
    *** Companion;
}
-keepclasseswithmembers class br.com.barbeariaarte10.admin.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor / OkHttp
-dontwarn org.slf4j.**
-dontwarn okhttp3.**
-dontwarn io.ktor.**
