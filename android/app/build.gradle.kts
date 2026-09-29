import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// O push (Firebase) só é ligado quando o google-services.json existe.
// Sem ele o app compila e funciona normalmente — apenas não recebe push.
val temFirebase = file("google-services.json").exists()
if (temFirebase) {
    apply(plugin = "com.google.gms.google-services")
}

// A versão que vai para o celular do barbeiro PRECISA avisar de novos
// agendamentos: gerar o APK de release sem o Firebase é quase sempre engano.
gradle.taskGraph.whenReady {
    val geraRelease = allTasks.any { tarefa ->
        tarefa.project == project &&
            (tarefa.name == "assembleRelease" || tarefa.name == "bundleRelease")
    }
    if (geraRelease && !temFirebase) {
        throw GradleException(
            "Falta android/app/google-services.json: sem ele o app não recebe push " +
                "de novos agendamentos. Veja docs/APLICATIVO.md (Notificações push)."
        )
    }
}

// Credenciais vêm de local.properties (fora do git) ou de variáveis de
// ambiente — nunca escritas no código-fonte.
val propriedadesLocais = Properties().apply {
    val arquivo = rootProject.file("local.properties")
    if (arquivo.exists()) arquivo.inputStream().use { load(it) }
}

fun segredo(chave: String): String =
    (propriedadesLocais.getProperty(chave) ?: System.getenv(chave) ?: "").trim()

/** Gera um literal Java seguro mesmo se a senha tiver aspas ou barras. */
fun literal(valor: String): String =
    "\"" + valor.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "br.com.barbeariaarte10.admin"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.barbeariaarte10.admin"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.1.0"

        buildConfigField("String", "SUPABASE_URL", literal(segredo("SUPABASE_URL")))
        buildConfigField("String", "SUPABASE_ANON_KEY", literal(segredo("SUPABASE_ANON_KEY")))
        // Conta dedicada do app: ele entra sozinho, sem tela de login.
        buildConfigField("String", "BARBEIRO_EMAIL", literal(segredo("BARBEIRO_EMAIL")))
        buildConfigField("String", "BARBEIRO_SENHA", literal(segredo("BARBEIRO_SENHA")))
        buildConfigField("boolean", "PUSH_CONFIGURADO", temFirebase.toString())

        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.fragment.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)

    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.ktor.client.okhttp)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
}
