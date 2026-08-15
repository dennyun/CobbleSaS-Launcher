package net.kdt.pojavlaunch;

import static android.content.res.Configuration.ORIENTATION_PORTRAIT;
import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.system.Os;
import android.view.View;
import android.widget.ImageButton;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentContainerView;
import androidx.fragment.app.FragmentManager;

import com.kdt.mcgui.ProgressLayout;

import net.kdt.pojavlaunch.authenticator.accounts.Accounts;
import net.kdt.pojavlaunch.extra.ExtraConstants;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.extra.ExtraListener;
import net.kdt.pojavlaunch.instances.Instance;
import net.kdt.pojavlaunch.instances.InstanceInstaller;
import net.kdt.pojavlaunch.instances.Instances;
import net.kdt.pojavlaunch.lifecycle.ContextAwareDoneListener;
import net.kdt.pojavlaunch.lifecycle.ContextExecutor;
import net.kdt.pojavlaunch.modloaders.modpacks.imagecache.IconCacheJanitor;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.progresskeeper.ProgressKeeper;
import net.kdt.pojavlaunch.progresskeeper.TaskCountListener;
import net.kdt.pojavlaunch.services.ProgressServiceKeeper;
import net.kdt.pojavlaunch.tasks.MoJsonExtras;
import net.kdt.pojavlaunch.tasks.AsyncVersionList;
import net.kdt.pojavlaunch.tasks.MoJsonDownloader;
import net.kdt.pojavlaunch.utils.NotificationUtils;
import java.util.List;
import java.io.IOException;
import android.util.Log;
import net.kdt.pojavlaunch.authenticator.accounts.Account;
import net.kdt.pojavlaunch.utils.CobbleUpdater;
import net.kdt.pojavlaunch.utils.RendererCompatUtil;
import androidx.preference.PreferenceManager;

import net.kdt.pojavlaunch.R;

public class LauncherActivity extends BaseActivity {
    public static final String SETTING_FRAGMENT_TAG = "SETTINGS_FRAGMENT";
    private static final int MIN_RAM_ALLOCATION = LauncherPreferences.MIN_RAM_ALLOCATION;
    private static final String PREFERRED_RENDERER = "vulkan_zink";

    private com.kdt.mcgui.MineEditText mNicknameInput;
    private com.kdt.mcgui.MineButton mBtnPlay;
    private android.widget.ImageButton mBtnSettings;
    private android.widget.LinearLayout mProgressPanel;
    private android.widget.TextView mProgressStatus;
    private android.widget.ProgressBar mProgressBar;

    private ProgressServiceKeeper mProgressServiceKeeper;
    private NotificationManager mNotificationManager;
    private static ActivityResultLauncher<String> mRequestPermissionLauncher;

    /* Listener for the game launch event trigger */
    private final ExtraListener<Boolean> mLaunchGameListener = (key, value) -> {
        if(ProgressKeeper.getTaskCount() > 0){
            Toast.makeText(this, R.string.tasks_ongoing, Toast.LENGTH_LONG).show();
            return false;
        }

        Instance selectedInstance = Instances.loadSelectedInstance();

        if(selectedInstance == null) {
            Toast.makeText(this, R.string.no_instance, Toast.LENGTH_LONG).show();
            return false;
        }

        if(selectedInstance.installer != null) {
            selectedInstance.installer.start();
            return false;
        }

        if (!Tools.isValidString(selectedInstance.versionId)){
            Toast.makeText(this, R.string.error_no_version, Toast.LENGTH_LONG).show();
            return false;
        }

        if(Accounts.getCurrent() == null){
            Toast.makeText(this, R.string.no_saved_accounts, Toast.LENGTH_LONG).show();
            return false;
        }
        String normalizedVersionId = MoJsonExtras.normalizeVersionId(selectedInstance.versionId);
        JVersionList.Version mcVersion = MoJsonExtras.getListedVersion(normalizedVersionId);
        new MoJsonDownloader().start(
                this.getAssets(),
                mcVersion,
                normalizedVersionId,
                new ContextAwareDoneListener(this, normalizedVersionId)
        );
        return false;
    };

    private final TaskCountListener mDoubleLaunchPreventionListener = taskCount -> {
        if(taskCount > 0) {
            Tools.runOnUiThread(() ->
                    mNotificationManager.cancel(NotificationUtils.NOTIFICATION_ID_GAME_START)
            );
        }
        return false;
    };

    @Override
    protected boolean shouldIgnoreNotch() {
        return getResources().getConfiguration().orientation == ORIENTATION_PORTRAIT;
    }

    @Override
    public boolean setFullscreen() {
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Garante a inicialização das constantes de armazenamento
        Tools.initStorageConstants(this);

        setContentView(R.layout.activity_cobble_launcher);

        try {
            Os.setenv("TMPDIR", Tools.DIR_CACHE.getAbsolutePath(), true);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        IconCacheJanitor.runJanitor();
        getWindow().setBackgroundDrawable(null);

        // Bind das views da UI
        mNicknameInput = findViewById(R.id.nickname_input);
        mBtnPlay = findViewById(R.id.btn_play);
        mBtnSettings = findViewById(R.id.btn_settings);
        mProgressPanel = findViewById(R.id.progress_panel);
        mProgressStatus = findViewById(R.id.progress_status);
        mProgressBar = findViewById(R.id.progress_bar);

        // Auto-carrega o nickname se houver conta salva
        Account currentAcc = Accounts.getCurrent();
        if (currentAcc != null) {
            mNicknameInput.setText(currentAcc.username);
        }

        mRequestPermissionLauncher = this.registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                isAllowed -> {
                    if(!isAllowed) Tools.runOnUiThread(() -> Toast.makeText(this, R.string.notification_permission_toast, Toast.LENGTH_LONG).show());
                }
        );
        checkNotificationPermission();
        if(LauncherPreferences.PREF_MIGRATION_NOTICE)
            PojavApplication.sExecutorService.submit(this::checkPreviousInstalls);

        mNotificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ProgressKeeper.addTaskCountListener(mDoubleLaunchPreventionListener);
        ProgressKeeper.addTaskCountListener((mProgressServiceKeeper = new ProgressServiceKeeper(this)));

        ExtraCore.addExtraListener(ExtraConstants.LAUNCH_GAME, mLaunchGameListener);

        new AsyncVersionList().getVersionList(versions -> ExtraCore.setValue(ExtraConstants.RELEASE_TABLE, versions));

        // Click listeners
        mBtnSettings.setOnClickListener(v -> showRamDialog());
        mBtnPlay.setOnClickListener(v -> handlePlayClick());
    }

    private void showRamDialog() {
        final android.content.SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);

        // O heap não pode passar do que o aparelho consegue entregar agora: acima disso o
        // Android mata o processo do jogo durante o carregamento do modpack.
        final int maxRAM = Math.max(MIN_RAM_ALLOCATION, LauncherPreferences.findMaxSafeRAMAllocation(this));
        final int autoRAM = Math.max(MIN_RAM_ALLOCATION, LauncherPreferences.findAutoRAMAllocation(this));
        int savedRam = prefs.getInt("allocation", LauncherPreferences.findBestRAMAllocation(this));
        final int currentSelectedRam = Math.max(MIN_RAM_ALLOCATION, Math.min(savedRam, maxRAM));

        android.view.View dialogView = getLayoutInflater().inflate(R.layout.dialog_cobble_ram, null);
        final android.widget.TextView txtVal = dialogView.findViewById(R.id.dialog_ram_val);
        final android.widget.TextView txtHint = dialogView.findViewById(R.id.dialog_ram_hint);
        final android.widget.SeekBar seekBar = dialogView.findViewById(R.id.dialog_ram_seekbar);
        final android.widget.Switch swAuto = dialogView.findViewById(R.id.dialog_ram_auto);

        seekBar.setMax(maxRAM - MIN_RAM_ALLOCATION);
        seekBar.setProgress(currentSelectedRam - MIN_RAM_ALLOCATION);
        txtHint.setText(buildRamHint(maxRAM, autoRAM));

        seekBar.setOnSeekBarChangeListener(new android.widget.SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(android.widget.SeekBar sb, int progress, boolean fromUser) {
                if (fromUser) swAuto.setChecked(false);
                txtVal.setText(formatRamLabel(progress + MIN_RAM_ALLOCATION, swAuto.isChecked()));
            }

            @Override
            public void onStartTrackingTouch(android.widget.SeekBar sb) {}

            @Override
            public void onStopTrackingTouch(android.widget.SeekBar sb) {}
        });

        swAuto.setOnCheckedChangeListener((button, checked) -> {
            seekBar.setEnabled(!checked);
            if (checked) seekBar.setProgress(autoRAM - MIN_RAM_ALLOCATION);
            txtVal.setText(formatRamLabel(seekBar.getProgress() + MIN_RAM_ALLOCATION, checked));
        });
        swAuto.setChecked(LauncherPreferences.isAutoRAMEnabled());
        seekBar.setEnabled(!swAuto.isChecked());
        txtVal.setText(formatRamLabel(seekBar.getProgress() + MIN_RAM_ALLOCATION, swAuto.isChecked()));

        new AlertDialog.Builder(this)
                .setView(dialogView)
                .setPositiveButton("Salvar", (dialog, which) -> {
                    LauncherPreferences.setAutoRAMEnabled(swAuto.isChecked());
                    if (!swAuto.isChecked()) {
                        prefs.edit().putInt("allocation", seekBar.getProgress() + MIN_RAM_ALLOCATION).apply();
                    }
                    int finalRam = LauncherPreferences.resolveRAMAllocation(this);
                    Toast.makeText(this, "RAM configurada: " + finalRam + " MB"
                            + (swAuto.isChecked() ? " (automático)" : ""), Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private String formatRamLabel(int ram, boolean auto) {
        return "Memória: " + String.format("%.1f GB", ram / 1024f) + " (" + ram + " MB)"
                + (auto ? " — automático" : "");
    }

    private String buildRamHint(int maxRAM, int autoRAM) {
        String hint = "Aparelho: " + Tools.getTotalDeviceMemory(this) + " MB no total, "
                + Tools.getFreeDeviceMemory(this) + " MB livres agora. Máximo seguro: " + maxRAM + " MB.";
        if (autoRAM < LauncherPreferences.RECOMMENDED_RAM_ALLOCATION) {
            hint += "\nO modpack recomenda " + LauncherPreferences.RECOMMENDED_RAM_ALLOCATION
                    + " MB, mas este aparelho não tem essa memória livre — pedir mais do que ele aguenta"
                    + " faz o Android encerrar o jogo durante o carregamento. Feche outros apps para liberar RAM.";
        }
        return hint;
    }

    private void handlePlayClick() {
        final String nickname = mNicknameInput.getText().toString().trim();
        if (nickname.isEmpty() || nickname.length() < 3 || nickname.length() > 16 || !nickname.matches("^[a-zA-Z0-9_]*$")) {
            Toast.makeText(this, "⚠️ Nickname inválido (3-16 caracteres, sem símbolos)!", Toast.LENGTH_LONG).show();
            return;
        }

        mBtnPlay.setEnabled(false);
        mNicknameInput.setEnabled(false);
        mProgressPanel.setVisibility(View.VISIBLE);

        int ramAllocation = LauncherPreferences.resolveRAMAllocation(this);
        Log.i("CobbleLauncher", "RAM alocada: " + ramAllocation + " MB (livre: " + Tools.getFreeDeviceMemory(this)
                + " MB, total: " + Tools.getTotalDeviceMemory(this) + " MB)");

        // 1. Logar localmente (Salvar usuário)
        try {
            Account account = Accounts.create(acc -> acc.username = nickname);
            Accounts.setCurrent(account);
        } catch (IOException e) {
            Log.e("CobbleLauncher", "Erro ao salvar conta local", e);
        }

        // 2. Executar atualização do Modpack
        CobbleUpdater.checkAndUpdate(this, new CobbleUpdater.UpdateCallback() {
            @Override
            public void onProgress(final String status, final int progress) {
                Tools.runOnUiThread(() -> {
                    mProgressStatus.setText(status);
                    mProgressBar.setProgress(progress);
                });
            }

            @Override
            public void onFinished(final boolean success, final String error) {
                Tools.runOnUiThread(() -> {
                    mBtnPlay.setEnabled(true);
                    mNicknameInput.setEnabled(true);
                    mProgressPanel.setVisibility(View.GONE);

                    if (success) {
                        // 3. Modpack atualizado e perfil injetado! Iniciar o jogo
                        launchMinecraft();
                    } else {
                        Toast.makeText(LauncherActivity.this, "⚠️ Erro ao atualizar modpack: " + error, Toast.LENGTH_LONG).show();
                    }
                });
            }
        });
    }

    private void launchMinecraft() {
        try {
            String selectedVersion = PreferenceManager.getDefaultSharedPreferences(this).getString("currentVersion", "fabric-loader-0.19.2-1.21.1");

            // Garante que exista uma instância selecionada
            Instance selectedInstance = Instances.loadSelectedInstance();
            if (selectedInstance == null) {
                // Cria a instância padrão para o CobbleSaS
                List<Instance> all = Instances.loadAllInstances();
                if (all.isEmpty()) {
                    selectedInstance = Instances.createInstance(inst -> {
                        inst.sharedData = true;
                        inst.versionId = selectedVersion;
                    }, "CobbleSaS-Mobile");
                } else {
                    selectedInstance = all.get(0);
                }
                Instances.setSelectedInstance(selectedInstance);
            }

            // Atualiza a versão ID da instância para condizer com o Modpack instalado e define o renderizador Vulkan/Zink
            selectedInstance.versionId = selectedVersion;
            selectedInstance.renderer = pickRenderer(selectedInstance.renderer);
            selectedInstance.write();

            // Dispara o listener do PojavLauncher para iniciar o jogo
            ExtraCore.setValue(ExtraConstants.LAUNCH_GAME, true);
        } catch (Exception e) {
            Toast.makeText(this, "Erro ao iniciar o jogo: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    /** Zink só é usado quando o aparelho realmente suporta; senão mantém um renderizador compatível. */
    private String pickRenderer(String currentRenderer) {
        if (RendererCompatUtil.checkRendererCompatible(this, PREFERRED_RENDERER)) return PREFERRED_RENDERER;
        if (Tools.isValidString(currentRenderer) && RendererCompatUtil.checkRendererCompatible(this, currentRenderer)) {
            return currentRenderer;
        }
        List<String> compatibleRenderers = RendererCompatUtil.getCompatibleRenderers(this).rendererIds;
        return compatibleRenderers.isEmpty() ? LauncherPreferences.PREF_RENDERER : compatibleRenderers.get(0);
    }

    @Override
    protected void onResume() {
        super.onResume();
        ContextExecutor.setActivity(this);
        InstanceInstaller.postInstallCheck(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        ContextExecutor.clearActivity();
    }

    @Override
    protected void onStart() {
        super.onStart();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        ProgressKeeper.removeTaskCountListener(mProgressServiceKeeper);
        ExtraCore.removeExtraListenerFromValue(ExtraConstants.LAUNCH_GAME, mLaunchGameListener);
    }



    public void askForPermission(int minApi, final String permission) {
        if(Build.VERSION.SDK_INT < minApi) return;
        mRequestPermissionLauncher.launch(permission);
    }
    public boolean checkForPermission(int minApi, final String permission) {
        return Build.VERSION.SDK_INT < minApi ||
                ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_DENIED;
    }
    public boolean checkForPermissionRationale(int minApi, final String permission) {
        return checkForPermission(minApi, permission) || ActivityCompat.shouldShowRequestPermissionRationale(this, permission);
    }

    private void checkNotificationPermission() {
        if(LauncherPreferences.PREF_SKIP_NOTIFICATION_PERMISSION_CHECK ||
            this.checkForPermission(33, Manifest.permission.POST_NOTIFICATIONS)) {
            return;
        }
        showNotificationPermissionReasoning();
    }

    // Call async
    private void checkPreviousInstalls(){
        final String[] packages = {"net.kdt.pojavlaunch", "net.kdt.pojavlaunch.debug", "net.kdt.pojavlaunch.pub"};
        for(String s : packages){
            Intent i = getPackageManager().getLaunchIntentForPackage(s);
            if(i == null) continue;
            Tools.runOnUiThread(() ->
                    new AlertDialog.Builder(this)
                        .setTitle(R.string.migration_progress_warning_title)
                        .setMessage(R.string.migration_notice)
                        .setPositiveButton(android.R.string.ok, (d, button) -> LauncherPreferences.DEFAULT_PREF.edit().putBoolean("migrationNotice", false).apply())
                        .setOnDismissListener(d -> LauncherPreferences.PREF_MIGRATION_NOTICE = false)
                        .show());
            break;
        }
    }

    private void showNotificationPermissionReasoning() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.notification_permission_dialog_title)
                .setMessage(R.string.notification_permission_dialog_text)
                .setPositiveButton(android.R.string.ok, (d, w) ->
                        askForPermission(33, Manifest.permission.POST_NOTIFICATIONS))
                .setNegativeButton(android.R.string.cancel, (d, w)-> handleNoNotificationPermission())
                .show();
    }

    private void handleNoNotificationPermission() {
        LauncherPreferences.PREF_SKIP_NOTIFICATION_PERMISSION_CHECK = true;
        LauncherPreferences.DEFAULT_PREF.edit()
                .putBoolean(LauncherPreferences.PREF_KEY_SKIP_NOTIFICATION_CHECK, true)
                .apply();
    }

}
