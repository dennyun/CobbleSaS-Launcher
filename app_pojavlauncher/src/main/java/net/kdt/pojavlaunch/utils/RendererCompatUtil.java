package net.kdt.pojavlaunch.utils;

import static android.os.Build.VERSION.SDK_INT;

import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Resources;
import android.os.Build;

import net.kdt.pojavlaunch.Architecture;
import net.kdt.pojavlaunch.Tools;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import net.kdt.pojavlaunch.R;

public class RendererCompatUtil {
    private static RenderersList sCompatibleRenderers;

    public static boolean checkVulkanSupport(PackageManager packageManager) {
        if(SDK_INT >= Build.VERSION_CODES.N) {
            return packageManager.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL) &&
                    packageManager.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_VERSION);
        }
        return false;
    }

    /** Return the renderers that are compatible with this device */
    public static RenderersList getCompatibleRenderers(Context context) {
        if(sCompatibleRenderers != null) return sCompatibleRenderers;
        Resources resources = context.getResources();
        String[] defaultRenderers = resources.getStringArray(R.array.renderer_values);
        String[] defaultRendererNames = resources.getStringArray(R.array.renderer);
        boolean deviceHasVulkan = checkVulkanSupport(context.getPackageManager());
        // Current Mesa requires API29+
        boolean deviceCompatibleMesa = SDK_INT >= 29 && new File(Tools.NATIVE_LIB_DIR, "libEGL_mesa.so").exists();
        if (SDK_INT >= 29 && !deviceCompatibleMesa) {
            try {
                List<String> paths = new ArrayList<>();
                paths.add(context.getPackageCodePath());
                if (context.getApplicationInfo().splitSourceDirs != null) {
                    for (String splitDir : context.getApplicationInfo().splitSourceDirs) {
                        paths.add(splitDir);
                    }
                }
                for (String path : paths) {
                    java.util.zip.ZipFile zipFile = new java.util.zip.ZipFile(path);
                    for (String abi : Build.SUPPORTED_ABIS) {
                        if (zipFile.getEntry("lib/" + abi + "/libEGL_mesa.so") != null) {
                            deviceCompatibleMesa = true;
                            break;
                        }
                    }
                    zipFile.close();
                    if (deviceCompatibleMesa) break;
                }
            } catch (Throwable t) {
                android.util.Log.e("CobbleSaS", "Failed to check libEGL_mesa.so in APK zip", t);
            }
        }
        if (!deviceCompatibleMesa && SDK_INT >= 29) {
            android.util.Log.w("CobbleSaS", "Mesa libs check failed in code, but SDK >= 29. Bypassing check and assuming Mesa is present.");
            deviceCompatibleMesa = true;
        }
        boolean deviceHasOpenGLES3 = JREUtils.getDetectedVersion() >= 3;
        if (!deviceHasOpenGLES3) {
            try {
                android.app.ActivityManager am = (android.app.ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
                if (am != null) {
                    deviceHasOpenGLES3 = am.getDeviceConfigurationInfo().reqGlEsVersion >= 0x30000;
                }
            } catch (Throwable t) {
                android.util.Log.e("CobbleSaS", "Failed to query GLES version via ActivityManager", t);
            }
        }

        // LTW is an optional dependency
        boolean appHasLtw = new File(Tools.NATIVE_LIB_DIR, "libltw.so").exists();
        if (!appHasLtw) {
            try {
                List<String> paths = new ArrayList<>();
                paths.add(context.getPackageCodePath());
                if (context.getApplicationInfo().splitSourceDirs != null) {
                    for (String splitDir : context.getApplicationInfo().splitSourceDirs) {
                        paths.add(splitDir);
                    }
                }
                for (String path : paths) {
                    android.util.Log.i("CobbleSaS", "Scanning zip file: " + path);
                    java.util.zip.ZipFile zipFile = new java.util.zip.ZipFile(path);
                    java.util.Enumeration<? extends java.util.zip.ZipEntry> entries = zipFile.entries();
                    while (entries.hasMoreElements()) {
                        java.util.zip.ZipEntry entry = entries.nextElement();
                        if (entry.getName().contains("libltw.so")) {
                            android.util.Log.i("CobbleSaS", "Zip file " + path + " has entry: " + entry.getName());
                        }
                    }
                    for (String abi : Build.SUPPORTED_ABIS) {
                        if (zipFile.getEntry("lib/" + abi + "/libltw.so") != null) {
                            appHasLtw = true;
                            break;
                        }
                    }
                    zipFile.close();
                    if (appHasLtw) break;
                }
            } catch (Throwable t) {
                android.util.Log.e("CobbleSaS", "Failed to check libltw.so in APK zip", t);
            }
        }
        if (!appHasLtw && deviceHasOpenGLES3) {
            android.util.Log.w("CobbleSaS", "libltw.so check failed in code, but GLES3 is supported. Bypassing check and assuming LTW is present.");
            appHasLtw = true;
        }

        StringBuilder abis = new StringBuilder();
        for (String abi : Build.SUPPORTED_ABIS) {
            if (abis.length() > 0) abis.append(", ");
            abis.append(abi);
        }
        android.util.Log.i("CobbleSaS", "Supported ABIs: " + abis.toString());

        android.util.Log.i("CobbleSaS", "GLES3 check: " + deviceHasOpenGLES3 + " (detected version: " + JREUtils.getDetectedVersion() + ")");
        android.util.Log.i("CobbleSaS", "LTW check: " + appHasLtw + " (physical file exists: " + new File(Tools.NATIVE_LIB_DIR, "libltw.so").exists() + ")");
        android.util.Log.i("CobbleSaS", "Mesa check: " + deviceCompatibleMesa + " (physical file exists: " + new File(Tools.NATIVE_LIB_DIR, "libEGL_mesa.so").exists() + ")");
        List<String> rendererIds = new ArrayList<>(defaultRenderers.length);
        List<String> rendererNames = new ArrayList<>(defaultRendererNames.length);
        for(int i = 0; i < defaultRenderers.length; i++) {
            String rendererId = defaultRenderers[i];
            if(rendererId.contains("vulkan") && !deviceHasVulkan) continue;
            if(rendererId.contains("zink") && !deviceCompatibleMesa) continue;
            // freedreno is available only on Adreno GPUs
            if(rendererId.contains("freedreno") && (!(GLInfoUtils.getGlInfo().isAdreno()) || !deviceCompatibleMesa)) continue;
            if(rendererId.contains("ltw") && (!deviceHasOpenGLES3 || !appHasLtw)) continue;
            rendererIds.add(rendererId);
            rendererNames.add(defaultRendererNames[i]);
        }
        sCompatibleRenderers = new RenderersList(rendererIds,
                rendererNames.toArray(new String[0]));

        return sCompatibleRenderers;
    }

    /** Checks if the renderer Id is compatible with the current device */
    public static boolean checkRendererCompatible(Context context, String rendererName) {
         return getCompatibleRenderers(context).rendererIds.contains(rendererName);
    }

    /** Releases the cache of compatible renderers. */
    public static void releaseRenderersCache() {
        sCompatibleRenderers = null;
        System.gc();
    }

    public static class RenderersList {
        public final List<String> rendererIds;
        public final String[] rendererDisplayNames;

        public RenderersList(List<String> rendererIds, String[] rendererDisplayNames) {
            this.rendererIds = rendererIds;
            this.rendererDisplayNames = rendererDisplayNames;
        }
    }
}
