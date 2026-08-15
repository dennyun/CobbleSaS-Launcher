package net.kdt.pojavlaunch.utils;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.preference.PreferenceManager;

import com.google.gson.Gson;

import net.kdt.pojavlaunch.Tools;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class CobbleUpdater {

    private static final String MANIFEST_URL = "https://raw.githubusercontent.com/f4xizzz/cobblesas-modpack/main/manifest.json";
    private static final String PREF_VERSION_KEY = "cobblesas_modpack_version";

    public interface UpdateCallback {
        void onProgress(String status, int progress);
        void onFinished(boolean success, String error);
    }

    public static void checkAndUpdate(final Context context, final UpdateCallback callback) {
        new Thread(() -> {
            try {
                callback.onProgress("Verificando atualizações...", 0);
                
                // 1. Baixar o manifest.json
                URL url = new URL(MANIFEST_URL + "?t=" + System.currentTimeMillis());
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                
                if (conn.getResponseCode() != 200) {
                    throw new IOException("Erro de conexão com o servidor (" + conn.getResponseCode() + ")");
                }

                InputStream is = conn.getInputStream();
                Gson gson = new Gson();
                CobbleManifest manifest = gson.fromJson(new InputStreamReader(is, StandardCharsets.UTF_8), CobbleManifest.class);
                is.close();
                conn.disconnect();

                if (manifest == null || manifest.download_url == null) {
                    throw new IOException("Manifesto de atualização inválido!");
                }

                // 2. Comparar versão local com online
                SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
                String localVersion = prefs.getString(PREF_VERSION_KEY, "0.0.0");
                
                String fabricVersion = "fabric-loader-" + manifest.fabric_loader_version + "-" + manifest.minecraft_version;
                File fabricJson = new File(Tools.DIR_GAME_NEW, "versions/" + fabricVersion + "/" + fabricVersion + ".json");
                boolean hasVersions = fabricJson.exists();
                
                File sharedModsDir = new File(Tools.DIR_GAME_HOME, "shared_dir/mods");
                boolean hasMods = sharedModsDir.exists() && sharedModsDir.list() != null && sharedModsDir.list().length > 0;

                if (localVersion.equals(manifest.version) && hasVersions && hasMods) {
                    // Garantir que o perfil do launcher esteja sempre injetado
                    writeLauncherProfile(manifest, context);
                    callback.onProgress("Pronto para jogar!", 100);
                    callback.onFinished(true, null);
                    return;
                }

                // 3. Fazer atualização
                downloadAndInstall(context, manifest, callback);

            } catch (Exception e) {
                callback.onFinished(false, e.getMessage());
            }
        }).start();
    }

    private static void downloadAndInstall(Context context, CobbleManifest manifest, UpdateCallback callback) throws Exception {
        // Garantir diretório de destino (diretório de jogo ativo)
        File destDir = new File(Tools.DIR_GAME_HOME, "shared_dir");
        if (!destDir.exists()) destDir.mkdirs();

        // Pasta temporária para o zip do download
        File tempZip = new File(context.getCacheDir(), "modpack.zip");
        if (tempZip.exists()) tempZip.delete();

        // 1. Baixar o arquivo modpack.zip com progresso
        callback.onProgress("Baixando modpack...", 5);
        URL url = new URL(manifest.download_url);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        
        if (conn.getResponseCode() != 200) {
            throw new IOException("Erro ao conectar ao arquivo de modpack (" + conn.getResponseCode() + ")");
        }

        int fileLength = conn.getContentLength();
        InputStream input = new BufferedInputStream(conn.getInputStream(), 8192);
        OutputStream output = new FileOutputStream(tempZip);

        byte[] data = new byte[8192];
        long total = 0;
        int count;
        int lastProgress = 0;

        while ((count = input.read(data)) != -1) {
            total += count;
            output.write(data, 0, count);
            if (fileLength > 0) {
                int progress = (int) (total * 80 / fileLength) + 5; // 5% a 85% para o download
                if (progress != lastProgress) {
                    callback.onProgress("Baixando modpack... (" + (int)(total * 100 / fileLength) + "%)", progress);
                    lastProgress = progress;
                }
            }
        }

        output.flush();
        output.close();
        input.close();
        conn.disconnect();

        // 2. Limpar os mods antigos do PojavLauncher
        callback.onProgress("Limpando mods antigos...", 88);
        cleanOldMods(destDir);

        // 3. Extrair mods de forma nativa e rápida
        callback.onProgress("Instalando modpack...", 90);
        unzip(tempZip, destDir, callback);

        // Deletar o arquivo temporário
        tempZip.delete();

        // 4. Injetar o perfil do launcher
        callback.onProgress("Configurando perfil...", 98);
        writeLauncherProfile(manifest, context);

        // Salvar a nova versão nas preferências
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        prefs.edit().putString(PREF_VERSION_KEY, manifest.version).apply();

        callback.onProgress("Pronto!", 100);
        callback.onFinished(true, null);
    }

    private static void cleanOldMods(File sharedDir) {
        File modsDir = new File(sharedDir, "mods");
        if (modsDir.exists() && modsDir.isDirectory()) {
            File[] files = modsDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    if (file.isFile() && file.getName().endsWith(".jar")) {
                        file.delete();
                    }
                }
            }
        }
    }

    private static void unzip(File zipFile, File destDir, UpdateCallback callback) throws IOException {
        String rootPrefix = "";
        android.util.Log.i("CobbleSaS", "Detecting ZIP wrapper prefix...");
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                if (name.startsWith("__MACOSX") || name.startsWith(".")) {
                    continue;
                }
                int firstSlash = name.indexOf('/');
                if (firstSlash != -1) {
                    String firstSegment = name.substring(0, firstSlash);
                    if (!firstSegment.equals("versions") && !firstSegment.equals("mods") && 
                        !firstSegment.equals("config") && !firstSegment.equals("saves") && 
                        !firstSegment.equals("resourcepacks") && !firstSegment.equals("shaderpacks") &&
                        !firstSegment.equals("launcher_profiles.json")) {
                        rootPrefix = firstSegment + "/";
                    } else {
                        rootPrefix = "";
                    }
                    break;
                } else {
                    if (name.equals("versions") || name.equals("mods") || 
                        name.equals("config") || name.equals("saves") || 
                        name.equals("resourcepacks") || name.equals("shaderpacks") ||
                        name.equals("launcher_profiles.json") || name.equals("options.txt")) {
                        rootPrefix = "";
                        break;
                    } else {
                        rootPrefix = name + "/";
                    }
                }
            }
        }

        android.util.Log.i("CobbleSaS", "Detected ZIP wrapper prefix: '" + rootPrefix + "'");

        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName();
                if (entryName.startsWith("__MACOSX") || entryName.endsWith(".DS_Store")) {
                    continue;
                }
                
                if (!rootPrefix.isEmpty() && entryName.startsWith(rootPrefix)) {
                    entryName = entryName.substring(rootPrefix.length());
                }
                
                if (entryName.isEmpty()) continue;

                File file = new File(destDir, entryName);
                android.util.Log.d("CobbleSaS", "Extracting entry '" + entry.getName() + "' -> '" + file.getAbsolutePath() + "'");
                
                // Prevenção de Zip Slip Vulnerability
                String canonicalPath = file.getCanonicalPath();
                if (!canonicalPath.startsWith(destDir.getCanonicalPath())) {
                    throw new SecurityException("Tentativa de gravação fora do diretório de destino: " + entry.getName());
                }

                if (entry.isDirectory()) {
                    file.mkdirs();
                } else {
                    File parent = file.getParentFile();
                    if (parent != null && !parent.exists()) {
                        parent.mkdirs();
                    }
                    
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private static void writeLauncherProfile(CobbleManifest manifest, Context context) {
        File profilesFile = new File(Tools.DIR_GAME_NEW, "launcher_profiles.json");
        
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        int ramAllocated = prefs.getInt("allocation", net.kdt.pojavlaunch.prefs.LauncherPreferences.findBestRAMAllocation(context)); // Alocação de RAM

        String profileId = "CobbleSaS-Mobile";
        String fabricVersion = "fabric-loader-" + manifest.fabric_loader_version + "-" + manifest.minecraft_version;

        // Garante que o arquivo JSON do Fabric exista localmente
        try {
            File jsonFile = new File(Tools.DIR_GAME_NEW, "versions/" + fabricVersion + "/" + fabricVersion + ".json");
            if (!jsonFile.exists()) {
                downloadFabricJson(manifest.minecraft_version, manifest.fabric_loader_version);
            }
        } catch (Exception e) {
            android.util.Log.e("CobbleSaS", "Erro ao preparar o JSON do Fabric", e);
        }

        Map<String, Object> profile = new HashMap<>();
        profile.put("name", "CobbleSaS Mobile");
        profile.put("lastVersionId", fabricVersion);
        profile.put("javaArgs", "-Xmx" + ramAllocated + "M -Xms" + ramAllocated + "M -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC");
        profile.put("type", "custom");

        Map<String, Object> profilesJson = new HashMap<>();
        try {
            if (profilesFile.exists()) {
                String content = readFile(profilesFile);
                Gson gson = new Gson();
                profilesJson = gson.fromJson(content, Map.class);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        if (profilesJson == null) {
            profilesJson = new HashMap<>();
        }

        Map<String, Object> profilesList = (Map<String, Object>) profilesJson.get("profiles");
        if (profilesList == null) {
            profilesList = new HashMap<>();
            profilesJson.put("profiles", profilesList);
        }

        profilesList.put(profileId, profile);
        profilesJson.put("selectedProfile", profileId);

        try {
            Gson gson = new Gson();
            String output = gson.toJson(profilesJson);
            writeFile(profilesFile, output);
            
            // Força o launcher preferences a selecionar o perfil que acabamos de criar
            prefs.edit().putString("currentVersion", fabricVersion).apply();
            
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static String readFile(File file) throws IOException {
        try (FileInputStream fis = new FileInputStream(file);
             java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int len;
            while ((len = fis.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            return baos.toString("UTF-8");
        }
    }

    private static void writeFile(File file, String content) throws IOException {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void downloadFabricJson(String mcVersion, String loaderVersion) throws IOException {
        String fabricVersion = "fabric-loader-" + loaderVersion + "-" + mcVersion;
        File versionDir = new File(Tools.DIR_GAME_NEW, "versions/" + fabricVersion);
        if (!versionDir.exists()) {
            versionDir.mkdirs();
        }
        File jsonFile = new File(versionDir, fabricVersion + ".json");
        
        android.util.Log.i("CobbleSaS", "Downloading Fabric JSON profile from meta.fabricmc.net...");
        String urlStr = "https://meta.fabricmc.net/v2/versions/loader/" + mcVersion + "/" + loaderVersion + "/profile/json";
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(15000);
        
        if (conn.getResponseCode() == 200) {
            try (InputStream is = conn.getInputStream();
                 FileOutputStream fos = new FileOutputStream(jsonFile)) {
                byte[] buffer = new byte[4096];
                int len;
                while ((len = is.read(buffer)) != -1) {
                    fos.write(buffer, 0, len);
                }
            }
            android.util.Log.i("CobbleSaS", "Fabric JSON profile downloaded successfully to: " + jsonFile.getAbsolutePath());
        } else {
            conn.disconnect();
            throw new IOException("Failed to download Fabric JSON profile, server returned: " + conn.getResponseCode());
        }
    }
}
