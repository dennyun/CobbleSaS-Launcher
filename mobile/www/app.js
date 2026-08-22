// ─── Elementos da UI ──────────────────────────────────────────────────────────
const packName       = document.getElementById('pack-name');
const badgeMc        = document.getElementById('badge-mc');
const badgeFabric    = document.getElementById('badge-fabric');
const badgePack      = document.getElementById('badge-pack');
const changelogList  = document.getElementById('changelog-list');
const downloadOverlay= document.getElementById('download-overlay');
const downloadLabel  = document.getElementById('download-status-text');
const downloadFill   = document.getElementById('download-progress-fill');
const btnAction      = document.getElementById('btn-action');
const nicknameInput    = document.getElementById('nickname-input');
const userAvatar       = document.getElementById('user-avatar');
const btnSettings      = document.getElementById('btn-settings');
const settingsOverlay  = document.getElementById('settings-overlay');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnRepair        = document.getElementById('btn-repair');
const installPathInput = document.getElementById('install-path-input');
const btnChangePath    = document.getElementById('btn-change-path');

// Slider de RAM
const ramSlider      = document.getElementById('ram-slider');
const ramValLabel    = document.getElementById('ram-val-label');

// Setup Overlay
const setupOverlay       = document.getElementById('setup-overlay');
const btnSetupAndroid    = document.getElementById('btn-setup-android');
const btnSetupIos        = document.getElementById('btn-setup-ios');
const setupAndroidArea   = document.getElementById('setup-android-area');
const setupIosArea       = document.getElementById('setup-ios-area');

// ─── Configurações & Estado ──────────────────────────────────────────────────
const MANIFEST_URL = 'https://raw.githubusercontent.com/f4xizzz/cobblesas-modpack/main/manifest.json';
let currentManifest = null;
let isUpdating = false;
let platform = 'web'; // web, android, ios

// Referências aos Plugins do Capacitor
const Plugins = window.Capacitor?.Plugins || {};
const { Filesystem, Share, AppLauncher, Toast } = Plugins;

if (window.Capacitor) {
  platform = window.Capacitor.getPlatform();
}

// ─── Inicialização ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (platform === 'ios') {
    document.getElementById('ios-info-container').style.display = 'block';
    document.getElementById('android-path-container').style.display = 'none';
    setupAndroidArea.style.display = 'none';
    setupIosArea.style.display = 'block';
  }

  // Bind de Eventos
  btnAction.addEventListener('click', handleAction);
  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  btnRepair.addEventListener('click', handleRepair);

  nicknameInput.addEventListener('blur', saveNickname);
  nicknameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') nicknameInput.blur();
  });

  // Configuração RAM e Setup
  setupRamSlider();
  btnSetupAndroid.addEventListener('click', configureAndroidFolder);
  btnSetupIos.addEventListener('click', finishSetup);

  await loadSettings();
  await checkSetup();
  init();
});

// ─── Lógica de Configurações ──────────────────────────────────────────────────
async function loadSettings() {
  const nick = localStorage.getItem('nickname') || '';
  nicknameInput.value = nick;
  updateAvatar(nick);

  if (platform === 'android') {
    const path = localStorage.getItem('install_path') || 'CobbleSaS';
    installPathInput.value = path;
  }
}

async function checkSetup() {
  const setupDone = localStorage.getItem('setup_done') === 'true';
  if (!setupDone) {
    setupOverlay.classList.remove('hidden');
  }
}

// Configuração Inteligente da Memória RAM
function setupRamSlider() {
  let deviceRamGb = navigator.deviceMemory || 8;
  const maxRamMb = Math.min(8192, Math.round(deviceRamGb * 1024));
  if (ramSlider) {
    ramSlider.max = maxRamMb;
    const savedRam = parseInt(localStorage.getItem('ram_max')) || 4096;
    const selectedRam = Math.min(savedRam, maxRamMb);
    ramSlider.value = selectedRam;
    updateRamLabel(selectedRam);

    ramSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      updateRamLabel(val);
      localStorage.setItem('ram_max', val);
    });
  }
}

function updateRamLabel(val) {
  if (ramValLabel) {
    ramValLabel.textContent = `${(val / 1024).toFixed(1)} GB`;
  }
}

// Validação Automática de Armazenamento
async function checkStorageRequirements() {
  let freeSpaceMb = 2000;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const remainingBytes = estimate.quota - estimate.usage;
      freeSpaceMb = Math.round(remainingBytes / (1024 * 1024));
    }
  } catch (e) {
    console.warn('Erro ao estimar espaço:', e);
  }

  const badge = document.getElementById('storage-status-badge');
  if (badge) {
    const freeGb = (freeSpaceMb / 1024).toFixed(1);
    if (freeSpaceMb < 1500) {
      badge.textContent = `${freeGb} GB Livre (Aviso: Pouco Espaço!)`;
      badge.className = 'badge-status-neutral badge-status-warn';
    } else {
      badge.textContent = `${freeGb} GB Livre (OK)`;
      badge.className = 'badge-status-neutral badge-status-ok';
    }
  }
  return freeSpaceMb;
}

async function configureAndroidFolder() {
  try {
    if (Filesystem) {
      const perm = await Filesystem.requestPermissions();
      if (perm.publicStorage !== 'granted') {
        showToast('⚠️ Permissão de armazenamento necessária!');
        return;
      }
      
      // Cria a pasta CobbleSaS na raiz do armazenamento
      await Filesystem.mkdir({
        path: 'CobbleSaS',
        directory: 'EXTERNAL_STORAGE',
        recursive: true
      }).catch(err => {
        if (err.message && err.message.includes('exists')) return;
        throw err;
      });
      
      localStorage.setItem('install_path', 'CobbleSaS');
      installPathInput.value = 'CobbleSaS';
      updateSyncBadge('Configurado (Pasta CobbleSaS)', 'ok');
      showToast('Pasta configurada com sucesso!');
      finishSetup();
    } else {
      localStorage.setItem('install_path', 'CobbleSaS');
      finishSetup();
    }
  } catch (err) {
    showToast('Erro ao configurar pasta: ' + err.message);
  }
}

function finishSetup() {
  localStorage.setItem('setup_done', 'true');
  setupOverlay.classList.add('hidden');
  init();
}

async function openSettings() {
  settingsOverlay.classList.remove('hidden');
  await checkStorageRequirements();
  if (platform === 'android') {
    const isConfigured = localStorage.getItem('install_path');
    if (isConfigured) {
      updateSyncBadge('Configurado (Pasta CobbleSaS)', 'ok');
    } else {
      updateSyncBadge('Não Configurado', 'neutral');
    }
  }
}

function closeSettings() {
  settingsOverlay.classList.add('hidden');
  saveNickname();
}

function updateSyncBadge(text, state) {
  const badge = document.getElementById('sync-status-badge');
  badge.textContent = text;
  badge.className = state === 'ok' ? 'badge-status-neutral badge-status-ok' : 'badge-status-neutral';
}

function saveNickname() {
  const nick = nicknameInput.value.replace(/[^a-zA-Z0-9_]/g, '').trim();
  nicknameInput.value = nick;
  localStorage.setItem('nickname', nick);
  updateAvatar(nick);
}

function updateAvatar(nick) {
  userAvatar.src = nick ? `https://minotar.net/helm/${nick}/32.png` : `https://minotar.net/helm/Steve/32.png`;
}

// ─── Lógica Principal ───
async function init() {
  setStatus('Verificando...', '');
  setButtonLoading('Verificando...');

  try {
    const response = await fetch(MANIFEST_URL + '?t=' + Date.now());
    if (!response.ok) throw new Error();
    
    currentManifest = await response.json();
    packName.textContent = currentManifest.name || 'CobbleSaS';
    
    document.getElementById('discord-link').href = currentManifest.discord_url || 'https://discord.gg/cobblesas';
    document.getElementById('store-link').href = currentManifest.store_url || 'https://loja.cobblesas.com.br/';

    badgeMc.textContent = 'MC ' + (currentManifest.minecraft_version || '1.21.1');
    badgeFabric.textContent = 'Fabric ' + (currentManifest.fabric_loader_version || '');

    const localVersion = localStorage.getItem('modpack_version') || '0.0.0';
    badgePack.textContent = localVersion === '0.0.0' ? 'Pendente' : 'v' + localVersion;
    
    renderChangelog(currentManifest.changelog);
    fetchServerStatus();

    if (localVersion === '0.0.0') {
      setStatus('Instalação Pendente', 'warn');
      setButtonInstall();
    } else if (localVersion !== currentManifest.version) {
      setStatus('Atualização Disponível', 'warn');
      setButtonUpdate();
    } else {
      setStatus('Pronto para Jogar!', 'ok');
      setButtonPlay();
    }
  } catch (err) {
    setStatus('Sem conexão', 'error');
    setButtonDisabled('Sem Conexão');
    renderChangelog(['Verifique sua conexão com a internet.']);
  }
}

// ─── Execução do Download e Extração Anti-Congelamento ───
async function handleAction() {
  if (!currentManifest || isUpdating) return;

  if (btnAction.classList.contains('play')) {
    if (platform === 'android') launchPojavLauncher();
    else if (platform === 'ios') alert("Abra o PojavLauncher e inicie o jogo com o perfil salvo!");
    return;
  }

  const nick = nicknameInput.value.trim();
  if (!nick || nick.length < 3) {
    showToast('⚠️ Nickname inválido (Mín. 3 letras)!');
    nicknameInput.focus();
    return;
  }

  await doUpdate();
}

async function handleRepair() {
  if (!currentManifest) return;
  if (confirm('Deseja reinstalar o modpack?')) {
    await doUpdate();
  }
}

// Lógica de Download Nativo sem uso de memória Base64 no WebView
async function doUpdate() {
  isUpdating = true;
  showProgress('Verificando requisitos...', 0);

  const freeSpace = await checkStorageRequirements();
  if (freeSpace < 1500) {
    const proceed = confirm(`⚠️ Seu celular possui pouco espaço livre (${(freeSpace / 1024).toFixed(1)} GB livre).\n\nPara o Minecraft e mods rodarem bem, é recomendado pelo menos 1.5 GB livres. Deseja tentar instalar mesmo assim?`);
    if (!proceed) {
      hideProgress();
      isUpdating = false;
      init();
      return;
    }
  }

  try {
    const downloadUrl = currentManifest.download_url;
    const version = currentManifest.version;

    if (platform === 'android') {
      showProgress('Baixando modpack...', 5);
      
      // Download nativo e direto no disco (Evita estouro de RAM no WebView)
      const downloadResult = await Filesystem.downloadFile({
        url: downloadUrl,
        path: 'CobbleSaS/modpack.zip',
        directory: 'EXTERNAL_STORAGE'
      });

      showProgress('Limpando mods antigos...', 90);
      await clearOldMods();

      showProgress('Instalando mods (Extração nativa)...', 93);
      
      // Chama o extrator nativo em Java que criamos na MainActivity
      const { UnzipPlugin } = window.Capacitor.Plugins;
      if (!UnzipPlugin) throw new Error('Plugin de extração nativa não carregado!');
      
      await UnzipPlugin.unzip({
        zipPath: downloadResult.path,
        destPath: 'file:///storage/emulated/0/CobbleSaS'
      });

      // Deleta o arquivo zip temporário para poupar armazenamento do celular
      await Filesystem.deleteFile({
        path: 'CobbleSaS/modpack.zip',
        directory: 'EXTERNAL_STORAGE'
      }).catch(() => {});

      // Injeta a configuração do Perfil de forma isolada e segura
      try {
        await writePojavProfile();
      } catch (profileErr) {
        console.warn('Aviso não-crítico ao criar perfil:', profileErr.message);
      }

      localStorage.setItem('modpack_version', version);
      showToast('✨ Modpack updated successfully!');
    } else {
      // Fallback para iOS e Web
      showProgress('Iniciando conexão...', 2);
      const arrayBuffer = await downloadFileWithProgress(downloadUrl, (percent) => {
        showProgress(`Baixando modpack... (${percent}%)`, percent);
      });

      if (platform === 'ios') {
        showProgress('Preparando arquivos...', 95);
        await exportModpackIos(arrayBuffer, version);
        localStorage.setItem('modpack_version', version);
      } else {
        triggerWebDownload(arrayBuffer, `cobblemon-modpack-${version}.zip`);
        localStorage.setItem('modpack_version', version);
      }
    }

    hideProgress();
    init();
  } catch (err) {
    console.error(err);
    alert('Erro ao atualizar: ' + err.message);
    hideProgress();
    init();
  } finally {
    isUpdating = false;
  }
}

async function downloadFileWithProgress(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro HTTP ao baixar: ${response.status}`);
  
  const contentLength = response.headers.get('content-length');
  const total = parseInt(contentLength, 10) || 0;
  
  if (total === 0) return await response.arrayBuffer();

  const reader = response.body.getReader();
  let chunks = [];
  let received = 0;

  while(true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    chunks.push(value);
    received += value.length;
    onProgress(Math.round((received / total) * 100));
  }

  let allChunks = new Uint8Array(received);
  let position = 0;
  for(let chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }
  return allChunks.buffer;
}

async function clearOldMods() {
  if (!Filesystem) return;
  try {
    const modsPath = 'CobbleSaS/mods';
    const result = await Filesystem.readdir({
      path: modsPath,
      directory: 'EXTERNAL_STORAGE'
    });

    const oldOfficialMods = JSON.parse(localStorage.getItem('installed_mods') || '[]');
    for (const file of result.files) {
      const filename = typeof file === 'string' ? file : file.name;
      if (filename.endsWith('.jar')) {
        await Filesystem.deleteFile({
          path: `${modsPath}/${filename}`,
          directory: 'EXTERNAL_STORAGE'
        });
      }
    }
  } catch (err) {
    console.log('Sem mods antigos para limpar:', err.message);
  }
}

function uint8ArrayToBase64(uint8Array) {
  return new Promise((resolve) => {
    if (!uint8Array || uint8Array.length === 0) {
      resolve("");
      return;
    }
    const blob = new Blob([uint8Array]);
    const reader = new FileReader();
    reader.onloadend = () => {
      const parts = reader.result.split(',');
      resolve(parts[1] || "");
    };
    reader.readAsDataURL(blob);
  });
}

// Injeção de Perfil no launcher_profiles.json
async function writePojavProfile() {
  if (!Filesystem) return;
  
  const profileId = "CobbleSaS-Mobile";
  const fabricVersion = `fabric-loader-${currentManifest?.fabric_loader_version}-${currentManifest?.minecraft_version}`;
  const maxRamMb = localStorage.getItem('ram_max') || "4096";

  const profileData = {
    name: "CobbleSaS Mobile",
    lastVersionId: fabricVersion,
    javaArgs: `-Xmx${maxRamMb}M -Xms${maxRamMb}M -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC`,
    type: "custom"
  };

  try {
    const path = "CobbleSaS/launcher_profiles.json";
    let currentProfiles = { profiles: {}, selectedProfile: profileId };

    try {
      const read = await Filesystem.readFile({
        path: path,
        directory: 'EXTERNAL_STORAGE',
        encoding: 'utf8'
      });
      currentProfiles = JSON.parse(read.data);
    } catch (e) {}

    if (!currentProfiles.profiles) currentProfiles.profiles = {};
    currentProfiles.profiles[profileId] = {
      ...currentProfiles.profiles[profileId],
      ...profileData
    };
    currentProfiles.selectedProfile = profileId;

    await Filesystem.writeFile({
      path: path,
      data: JSON.stringify(currentProfiles, null, 2),
      directory: 'EXTERNAL_STORAGE',
      encoding: 'utf8'
    });
    console.log('Perfil de jogo injetado!');
  } catch (err) {
    console.error('Erro ao escrever perfil:', err.message);
  }
}

async function exportModpackIos(arrayBuffer, version) {
  if (!Filesystem || !Share) return;
  const tempFilename = `cobblesas-modpack-v${version}.zip`;
  const base64 = await uint8ArrayToBase64(new Uint8Array(arrayBuffer));

  const fileResult = await Filesystem.writeFile({
    path: tempFilename,
    data: base64,
    directory: 'CACHE'
  });

  await Share.share({
    title: 'CobbleSaS Modpack',
    url: fileResult.uri,
    dialogTitle: 'Exportar para o PojavLauncher'
  });

  setTimeout(async () => {
    await Filesystem.deleteFile({
      path: tempFilename,
      directory: 'CACHE'
    }).catch(() => {});
  }, 10000);
}

function triggerWebDownload(arrayBuffer, filename) {
  const blob = new Blob([arrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function launchPojavLauncher() {
  const { UnzipPlugin } = window.Capacitor.Plugins;
  if (!UnzipPlugin) {
    alert("Erro: Plugin nativo do launcher não carregado.");
    return;
  }
  
  try {
    await UnzipPlugin.launchPojav();
  } catch (err) {
    // Se o PojavLauncher não estiver instalado, oferece o download direto do APK recomendado
    if (err.message && err.message.includes("não encontrado")) {
      const download = confirm("⚠️ O PojavLauncher (motor para rodar o jogo) não foi encontrado no seu celular.\n\nDeseja baixar e instalar a versão recomendada (APK) agora?");
      if (download) {
        try {
          showProgress("Baixando PojavLauncher...", 0);
          
          // Usa a URL do manifest ou fallback padrão do GitHub (Release 1508)
          const apkUrl = currentManifest?.pojav_apk_url || "https://github.com/f4xizzz/cobblesas-modpack/releases/download/1508/pojavlauncher.apk";
          
          // Baixa o APK nativamente para poupar memória RAM
          const downloadResult = await Filesystem.downloadFile({
            url: apkUrl,
            path: 'CobbleSaS/pojavlauncher.apk',
            directory: 'EXTERNAL_STORAGE'
          });

          showProgress("Abrindo instalador nativo...", 100);
          
          // Dispara o instalador nativo
          await UnzipPlugin.installApk({
            apkPath: downloadResult.path
          });

          // Deleta o APK temporário para liberar armazenamento após o disparo
          setTimeout(async () => {
            await Filesystem.deleteFile({
              path: 'CobbleSaS/pojavlauncher.apk',
              directory: 'EXTERNAL_STORAGE'
            }).catch(() => {});
          }, 20000);

        } catch (downloadErr) {
          alert("Erro ao baixar o instalador: " + downloadErr.message);
        } finally {
          hideProgress();
        }
      }
    } else {
      alert(`⚠️ Não foi possível abrir o PojavLauncher:\n${err.message || err}`);
    }
  }
}

async function fetchServerStatus() {
  const statusBox = document.getElementById('server-status-box');
  const playersText = document.getElementById('status-players');
  const indicator = document.getElementById('status-indicator');

  try {
    const ip = currentManifest?.server_ip || 'jogar.cobblesas.com.br';
    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${ip}`);
    if (!response.ok) throw new Error();

    const data = await response.json();
    statusBox.classList.remove('hidden');

    if (data.online) {
      indicator.className = 'dot-pulse';
      playersText.innerHTML = `ONLINE — <strong>${data.players.online}/${data.players.max}</strong> jogando`;
    } else {
      indicator.className = 'dot-pulse';
      indicator.style.backgroundColor = 'var(--red)';
      playersText.textContent = 'OFFLINE — Servidor em manutenção';
    }
  } catch(e) {
    statusBox.classList.remove('hidden');
    indicator.className = 'dot-pulse';
    indicator.style.backgroundColor = 'var(--orange)';
    playersText.textContent = 'Servidor ativo: jogar.cobblesas.com.br';
  }
}

function setStatus(text, stateClass) {
  console.log(`[Status] ${text}`);
  if (stateClass === 'error') btnAction.textContent = '⚠️ Erro de Conexão';
}

function renderChangelog(changelog) {
  changelogList.innerHTML = '';
  if (!changelog || changelog.length === 0) {
    changelogList.innerHTML = '<li>Nenhuma alteração registrada.</li>';
    return;
  }
  changelog.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    changelogList.appendChild(li);
  });
}

function setButtonPlay() {
  btnAction.className = 'play';
  btnAction.disabled = false;
  btnAction.innerHTML = `<span id="btn-icon">🎮</span> <span id="btn-text">JOGAR COBBLEMON</span>`;
}

function setButtonInstall() {
  btnAction.className = 'install';
  btnAction.disabled = false;
  btnAction.innerHTML = `<span id="btn-icon">⚡</span> <span id="btn-text">INSTALAR MODPACK</span>`;
}

function setButtonUpdate() {
  btnAction.className = 'update';
  btnAction.disabled = false;
  btnAction.innerHTML = `<span id="btn-icon">🔄</span> <span id="btn-text">ATUALIZAR MODPACK</span>`;
}

function setButtonLoading(text) {
  btnAction.className = 'disabled';
  btnAction.disabled = true;
  btnAction.innerHTML = `<span id="btn-icon">⏳</span> <span id="btn-text">${text}</span>`;
}

function setButtonDisabled(text) {
  btnAction.className = 'disabled';
  btnAction.disabled = true;
  btnAction.innerHTML = `<span id="btn-icon">❌</span> <span id="btn-text">${text}</span>`;
}

function showProgress(status, percent) {
  downloadOverlay.classList.remove('hidden');
  downloadLabel.textContent = status;
  downloadFill.style.width = percent + '%';
}

function hideProgress() {
  downloadOverlay.classList.add('hidden');
}

async function showToast(message) {
  if (Toast) await Toast.show({ text: message });
  else console.log('[Toast]', message);
}
