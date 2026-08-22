// ─── Elementos ────────────────────────────────────────────────────────────────
const packName       = document.getElementById('pack-name');
const badgeMc        = document.getElementById('badge-mc');
const badgeFabric    = document.getElementById('badge-fabric');
const badgePack      = document.getElementById('badge-pack');
const statusText     = document.getElementById('status-text');
const changelogList  = document.getElementById('changelog-list');
const downloadOverlay= document.getElementById('download-overlay');
const downloadLabel  = document.getElementById('download-status-text');
const downloadFill   = document.getElementById('download-progress-fill');
const btnAction      = document.getElementById('btn-action');
const btnIcon        = document.getElementById('btn-icon');
const btnText        = document.getElementById('btn-text');
const btnMods        = document.getElementById('btn-mods-folder');
const titlebarDot    = document.querySelector('#changelog-title .dot');
let serverStatusInterval = null;

// Autenticação e Configurações
const nicknameInput    = document.getElementById('nickname-input');
const userAvatar       = document.getElementById('user-avatar');

const btnSettings      = document.getElementById('btn-settings');
const settingsOverlay  = document.getElementById('settings-overlay');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnRepair        = document.getElementById('btn-repair');
const ramSelect        = document.getElementById('ram-select');
const resWidth         = document.getElementById('res-width');
const resHeight        = document.getElementById('res-height');
const resFullscreen    = document.getElementById('res-fullscreen');
const installPathInput = document.getElementById('install-path-input');
const btnChangePath    = document.getElementById('btn-change-path');
const javaPathInput    = document.getElementById('java-path-input');
const btnChangeJava    = document.getElementById('btn-change-java');

// First-time Setup
const setupOverlay       = document.getElementById('setup-overlay');
const setupPathInput     = document.getElementById('setup-path-input');
const btnSetupChangePath = document.getElementById('btn-setup-change-path');
const btnFinishSetup     = document.getElementById('btn-finish-setup');

// Estado
let currentManifest  = null;
let isUpdating       = false;
let isGameRunning    = false; // [SEC] Pausa requisições desnecessárias ao rodar o jogo

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-close').addEventListener('click', () => {
    if (isUpdating) {
      alert("⚠️ Atualização em andamento!\n\nPor favor, aguarde o fim do download e extração para não corromper o seu jogo.");
      return;
    }
    window.launcher.closeWindow();
  });
  document.getElementById('btn-minimize').addEventListener('click', () => window.launcher.minimizeWindow());
  btnMods.addEventListener('click',           () => window.launcher.openModsFolder());
  btnAction.addEventListener('click',         handleAction);
  
  // Configurações
  const openSettings = () => settingsOverlay.classList.remove('hidden');
  btnSettings.addEventListener('click', openSettings);

  btnCloseSettings.addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
    saveSettings();
  });
  
  // Botão de reparar
  btnRepair.addEventListener('click', async () => {
    if (!currentManifest) return alert('Carregando informações do servidor, aguarde...');
    const confirmReparo = confirm('Atenção: A instalação do Minecraft, Fabric e do Modpack será refeita para garantir a integridade. Seus mods extras não serão deletados.\n\nDeseja prosseguir com o Reparo?');
    if (confirmReparo) {
      await doUpdate();
    }
  });
  
  // Atualizar avatar e salvar nick offline
  const handleNickSave = () => {
    let nick = nicknameInput.value.replace(/[^a-zA-Z0-9_]/g, '');
    nicknameInput.value = nick;
    
    if (nick) {
      userAvatar.src = `https://minotar.net/helm/${nick}/32.png`;
    } else {
      userAvatar.src = `https://minotar.net/helm/Steve/32.png`;
    }

    if (nick.length >= 3 && statusText.textContent.includes('Nickname')) {
      if (currentManifest) {
        const local = currentManifest.version;
        setStatus(`Pronto para jogar v${local}`, 'ok');
      } else {
        setStatus('', '');
      }
    }

    saveSettings();
  };

  nicknameInput.addEventListener('blur', handleNickSave);
  nicknameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') nicknameInput.blur();
  });

  window.launcher.onDownloadProgress(handleDownloadProgress);
  window.launcher.onFabricStatus(handleFabricStatus);
  window.launcher.onGameState((state) => {
    if (state === 'starting') {
      isGameRunning = true;
      setStatus('Minecraft em execução!', 'ok');
      setButtonStop('Parar Jogo');
      showProgress('O jogo foi iniciado com sucesso!', 100);
      downloadFill.style.background = '#10b981'; // Verde indicando sucesso
      setTimeout(() => hideProgress(), 2000); // Fecha a tela após 2 segundos
      nicknameInput.disabled = true;
      btnSettings.disabled = true;
    } else if (state === 'closed') {
      isGameRunning = false;
      setStatus(`Pronto para jogar v${currentManifest.version}`, 'ok');
      setButtonPlay();
      hideProgress();
      downloadFill.style.background = ''; // Restaura gradiente padrão
      nicknameInput.disabled = false;
      btnSettings.disabled = false;
    }
  });

  // Pickers de diretório
  const handleChangePath = async (inputElement) => {
    let newPath = await window.launcher.selectDirectory();
    if (newPath) {
      // Força a criação da pasta .cobblesas dentro do diretório escolhido, caso não exista
      if (!newPath.endsWith('.cobblesas') && !newPath.endsWith('.cobblesas\\') && !newPath.endsWith('.cobblesas/')) {
        // Usa o separador do sistema (vamos assumir \ para Windows, ou lidar com path nativo no main.js. 
        // Como renderer.js não tem acesso ao `path`, fazemos na string)
        const separator = newPath.includes('\\') ? '\\' : '/';
        newPath = newPath.endsWith(separator) ? newPath + '.cobblesas' : newPath + separator + '.cobblesas';
      }
      
      inputElement.value = newPath;
      if (inputElement === setupPathInput) installPathInput.value = newPath;
      if (inputElement === installPathInput) setupPathInput.value = newPath;
      saveSettings();
    }
  };

  btnChangePath.addEventListener('click', () => handleChangePath(installPathInput));
  btnSetupChangePath.addEventListener('click', () => handleChangePath(setupPathInput));

  btnChangeJava.addEventListener('click', async () => {
    const newJavaPath = await window.launcher.selectJava();
    if (newJavaPath) {
      javaPathInput.value = newJavaPath;
      saveSettings();
    }
  });

  btnFinishSetup.addEventListener('click', async () => {
    setupOverlay.classList.add('hidden');
    await window.launcher.saveSettings({ setupDone: true });
    init(); // Agora sim inicia o launcher
  });

  await loadSettings();
  init();
});

async function populateRamSelect() {
  const totalGB = await window.launcher.getSystemRam();
  // Limpa o select (Sem opção AUTO)
  ramSelect.innerHTML = '';
  
  // O MCLC aceita sufixos como 'G' ou 'M'
  // Começamos em 512M, depois vamos de 512M em 512M (0.5G)
  const options = ['512M', '1G', '1.5G', '2G', '2.5G', '3G', '3.5G', '4G', '4.5G', '5G', '6G', '7G', '8G', '10G', '12G', '16G', '24G', '32G'];
  
  for (const opt of options) {
    let valInGB = 0;
    if (opt.endsWith('M')) valInGB = parseInt(opt) / 1024;
    if (opt.endsWith('G')) valInGB = parseFloat(opt);
    
    // Mostra até o máximo seguro da máquina (não passa do limite)
    if (valInGB <= totalGB) {
      let label = valInGB < 1 ? '512 MB' : `${valInGB.toFixed(1)} GB`;
      ramSelect.innerHTML += `<option value="${opt}">${label}</option>`;
    }
  }
}

async function loadSettings() {
  await populateRamSelect();

  const settings = await window.launcher.getSettings();
  if (settings.nickname) {
    nicknameInput.value = settings.nickname;
    userAvatar.src = `https://minotar.net/helm/${settings.nickname}/32.png`;
  }
  
  if (settings.recentNicks && settings.recentNicks.length > 0) {
    const datalist = document.getElementById('recent-nicks');
    datalist.innerHTML = '';
    settings.recentNicks.forEach(nick => {
      const option = document.createElement('option');
      option.value = nick;
      datalist.appendChild(option);
    });
  }

  if (settings.ram && settings.ram !== 'AUTO') {
    ramSelect.value = settings.ram;
  } else {
    // Se o PC tiver mais de 4GB, usa 4G como padrão. Se não tiver, usa o máximo que o PC aguenta.
    const totalGB = await window.launcher.getSystemRam();
    ramSelect.value = totalGB >= 4 ? '4G' : (totalGB >= 2 ? '2G' : '1G');
  }

  if (settings.width) resWidth.value = settings.width;
  if (settings.height) resHeight.value = settings.height;
  if (settings.fullscreen !== undefined) resFullscreen.checked = settings.fullscreen;
  
  if (settings.installPath) {
    installPathInput.value = settings.installPath;
    if (setupPathInput) setupPathInput.value = settings.installPath;
  }
  
  if (settings.javaPath) {
    javaPathInput.value = settings.javaPath;
  }
}

async function saveSettings() {
  const nickname = nicknameInput.value.trim();
  const ram = ramSelect.value;
  const width = resWidth.value || '854';
  const height = resHeight.value || '480';
  const fullscreen = resFullscreen.checked;
  const installPath = installPathInput.value;
  const javaPath = javaPathInput.value || null;
  resWidth.value = width;
  resHeight.value = height;
  await window.launcher.saveSettings({ nickname, ram, width, height, fullscreen, installPath, javaPath });
}

// ─── Lógica principal ─────────────────────────────────────────────────────────
async function init() {
  const settings = await window.launcher.getSettings();
  if (!settings.setupDone) {
    setupOverlay.classList.remove('hidden');
    return; // Aguarda o jogador confirmar o setup
  }

  setStatus('Verificando atualizações...', '');
  setButtonLoading('Verificando...');

  try {
    const result = await window.launcher.checkUpdate();
    if (result.error) { setStatus('Erro: ' + result.error, 'error'); setButtonDisabled('Sem conexão'); return; }

    currentManifest = result.manifest;
    packName.textContent    = result.manifest.name || 'CobbleSaS';
    
    // Atualiza Links Sociais Dinamicamente
    const discordLink = document.getElementById('discord-link');
    const storeLink = document.getElementById('store-link');
    if (discordLink) discordLink.href = currentManifest.discord_url || 'https://discord.gg/cobblesas';
    if (storeLink) storeLink.href = currentManifest.store_url || 'https://loja.cobblesas.com.br/';
    
    let displayVersion = result.manifest.version;
    if (result.action_state === 'update') displayVersion = result.localVersion;
    else if (result.action_state === 'install') displayVersion = 'Pendente';
    
    let displayChangelog = result.manifest.changelog;
    if (result.action_state === 'install') {
      displayChangelog = ['Instalação pendente... Atualize para ver as novidades!'];
    }
    
    badgeMc.textContent     = 'MC '     + (result.manifest.minecraft_version   || '1.21.1');
    badgeFabric.textContent = 'Fabric ' + (result.manifest.fabric_loader_version || '');
    badgePack.textContent   = displayVersion === 'Pendente' ? 'Pendente' : 'v' + displayVersion;
    renderChangelog(displayChangelog);
    fetchServerStatus();
    if (!serverStatusInterval) {
      serverStatusInterval = setInterval(() => {
        if (!isGameRunning) fetchServerStatus();
      }, 15000); // Atualiza a cada 15s
    }
    
    // Verificação de background a cada 60s
    if (!window.updateCheckInterval) {
      window.updateCheckInterval = setInterval(async () => {
        if (isUpdating || isGameRunning || btnAction.className.includes('play') === false) return; // Só checa se estiver no estado de "Jogar" e não estiver atualizando
        try {
          const recheck = await window.launcher.checkUpdate();
          if (recheck.action_state !== 'play') {
            currentManifest = recheck.manifest;
            packName.textContent = recheck.manifest.name || 'CobbleSaS';
            let displayVersion = recheck.manifest.version;
            if (recheck.action_state === 'update') displayVersion = recheck.localVersion;
            else if (recheck.action_state === 'install') displayVersion = 'Pendente';
            let displayChangelog = recheck.manifest.changelog;
            if (recheck.action_state === 'install') {
              displayChangelog = ['Instalação pendente... Atualize para ver as novidades!'];
            }
            
            badgeMc.textContent = 'MC ' + (recheck.manifest.minecraft_version || '1.21.1');
            badgeFabric.textContent = 'Fabric ' + (recheck.manifest.fabric_loader_version || '');
            badgePack.textContent = displayVersion === 'Pendente' ? 'Pendente' : 'v' + displayVersion;
            renderChangelog(displayChangelog);

            const local = recheck.localVersion === '0.0.0' ? 'não instalado' : 'v' + recheck.localVersion;
            setStatus(`Atualização lançada! (${local} → v${recheck.manifest.version})`, 'warn');
            if (recheck.action_state === 'install') setButtonInstall();
            else setButtonUpdate();
            if (titlebarDot) titlebarDot.className = 'dot dot-orange';
          }
        } catch(e) {}
      }, 60000);
    }

    if (result.action_state === 'install') {
      setStatus(`Bem-vindo! Clique em Instalar para baixar o modpack e o motor do jogo (v${result.manifest.version})`, 'warn');
      setButtonInstall();
      if (titlebarDot) titlebarDot.className = 'dot dot-cyan';
    } else if (result.action_state === 'update') {
      const local = result.localVersion === '0.0.0' ? 'não instalado' : 'v' + result.localVersion;
      setStatus(`Atualização ou Reparo necessário! (${local} → v${result.manifest.version})`, 'warn');
      setButtonUpdate();
      if (titlebarDot) titlebarDot.className = 'dot dot-orange';
    } else {
      setStatus(`Tudo íntegro e atualizado — versão ${result.manifest.version}`, 'ok');
      setButtonPlay();
      if (titlebarDot) titlebarDot.className = 'dot dot-green';
    }
  } catch (err) {
    setStatus('Falha ao conectar', 'error');
    setButtonDisabled('Erro');
  }
}

// ─── Ação ─────────────────────────────────────────────────────────────────────
async function handleAction() {
  if (!currentManifest || isUpdating) return;

  const btnIsPlay = btnAction.className.includes('play');
  
  if (btnIsPlay) {
    const nick = nicknameInput.value.trim();
    if (!nick || nick.length < 3) {
      setStatus('Você precisa de um Nickname válido (Mín. 3 letras) para jogar!', 'error');
      nicknameInput.focus();
      return;
    }
  }

  if (btnAction.className.includes('update') || btnAction.className.includes('install')) await doUpdate();
  else if (btnIsPlay) await doPlay();
  else if (btnAction.className.includes('stop')) window.launcher.killGame();
}

async function doUpdate() {
  isUpdating = true;
  setButtonLoading('Preparando...');
  try {
    showProgress('Iniciando instalação do Minecraft...', 0);
    const pName = (currentManifest.name || 'CobbleSaS').replace(/[^a-zA-Z0-9_\-]/g, '');
    const dlRes = await window.launcher.downloadUpdate(
      currentManifest.version,
      pName,
      currentManifest.minecraft_version,
      currentManifest.fabric_loader_version
    );
    if (dlRes && dlRes.error) {
      alert('Erro ao baixar modpack:\n' + dlRes.error);
      isUpdating = false; setButtonUpdate(); hideProgress(); return;
    }

    hideProgress();
    setStatus(`Atualizado para v${currentManifest.version}! Clique em Jogar.`, 'ok');
    setButtonPlay();
    badgePack.textContent = 'v' + currentManifest.version;
    renderChangelog(currentManifest.changelog);
    localStorage.setItem('localChangelog', JSON.stringify(currentManifest.changelog));
    if (titlebarDot) titlebarDot.className = 'dot dot-green';
  } catch (err) {
    alert('Erro:\n' + err.message);
    setButtonUpdate(); hideProgress();
  }
  isUpdating = false;
}

async function doPlay() {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('Por favor, digite seu Nickname antes de jogar!');
    nicknameInput.focus();
    return;
  }

  // Verifica integridade silenciosamente antes de abrir o jogo
  const recheck = await window.launcher.checkUpdate();
  if (recheck.action_state !== 'play') {
    // Atualiza a UI em tempo real com o novo manifest encontrado
    currentManifest = recheck.manifest;
    packName.textContent    = recheck.manifest.name || 'CobbleSaS';
    
    let displayVersion = recheck.manifest.version;
    if (recheck.action_state === 'update') displayVersion = recheck.localVersion;
    else if (recheck.action_state === 'install') displayVersion = 'Pendente';
    
    let displayChangelog = recheck.manifest.changelog;
    if (recheck.action_state === 'install') {
      displayChangelog = ['Instalação pendente... Atualize para ver as novidades!'];
    }
    
    badgeMc.textContent     = 'MC '     + (recheck.manifest.minecraft_version   || '1.21.1');
    badgeFabric.textContent = 'Fabric ' + (recheck.manifest.fabric_loader_version || '');
    badgePack.textContent   = displayVersion === 'Pendente' ? 'Pendente' : 'v' + displayVersion;
    renderChangelog(displayChangelog);

    setStatus(`Atualização necessária: ${recheck.reason}.`, 'warn');
    if (recheck.action_state === 'install') setButtonInstall();
    else setButtonUpdate();
    return;
  }

  setButtonLoading('Iniciando o Minecraft...');
  
  // Salva o nickname atualizado (com AWAIT para garantir que grave no HD antes de abrir o jogo)
  await saveSettings();

  const res = await window.launcher.launchGame(
    currentManifest.minecraft_version,
    currentManifest.fabric_loader_version
  );
  
  if (res && res.error) {
    alert('Não foi possível iniciar o jogo:\n\n' + res.error);
    setTimeout(() => setButtonPlay(), 1000);
  }
}

// ─── Progresso ────────────────────────────────────────────────────────────────
function handleDownloadProgress(data) {
  if (data.phase === 'download') {
    const sz = formatBytes(data.downloaded);
    if (data.percent >= 0) {
      showProgress(`Baixando... ${sz} / ${formatBytes(data.total)}`, data.percent);
      setButtonLoading(`Baixando ${data.percent}%`);
    } else {
      showProgress(`Baixando... ${sz}`, 50);
      setButtonLoading(`Baixando... ${sz}`);
    }
  } else if (data.phase === 'extract') {
    showProgress(data.message || 'Extraindo...', data.percent || 50);
    setButtonLoading('Extraindo...');
  } else if (data.phase === 'done') {
    showProgress('Concluído!', 100);
  } else if (data.phase === 'native-download') {
    // Eventos do minecraft-launcher-core
    showProgress(data.task || 'Baixando bibliotecas...', data.percent || 0);
    setButtonLoading(`Preparando: ${Math.round(data.percent || 0)}%`);
  }
}
function handleFabricStatus(msg) { showProgress(msg, -1); setButtonLoading('Iniciando Fabric...'); }

function showProgress(label, percent) {
  downloadOverlay.classList.remove('hidden');
  downloadLabel.textContent = label;
  if (percent >= 0) { 
    downloadFill.style.width = percent + '%'; 
  }
}
function hideProgress() { 
  downloadOverlay.classList.add('hidden'); 
}

// ─── Changelog & Server Status ────────────────────────────────────────────────
function renderChangelog(changelog) {
  changelogList.innerHTML = '';
  const items = Array.isArray(changelog) ? changelog : [String(changelog || '')];
  items.forEach((line) => { const li = document.createElement('li'); li.textContent = line; changelogList.appendChild(li); });
}

async function fetchServerStatus() {
  const statusBox = document.getElementById('server-status-box');
  const indicator = document.getElementById('status-indicator');
  const playersText = document.getElementById('status-players');
  const ip = (currentManifest && currentManifest.server_ip) ? currentManifest.server_ip : 'jogar.cobblesas.com.br';

  statusBox.classList.remove('hidden');

  let isOnline = false;
  let onlinePlayers = 0;
  let maxPlayers = 0;

  try {
    const res1 = await fetch(`https://api.mcstatus.io/v2/status/java/${ip}?t=${Date.now()}`);
    const data1 = await res1.json();
    if (data1 && data1.online) {
      isOnline = true;
      onlinePlayers = Number(data1.players?.online) || 0;
      maxPlayers = Number(data1.players?.max) || 0;
    }
  } catch (e) {}

  if (!isOnline) {
    try {
      const res2 = await fetch(`https://api.mcsrvstat.us/2/${ip}`);
      const data2 = await res2.json();
      if (data2 && data2.online) {
        isOnline = true;
        onlinePlayers = Number(data2.players?.online) || 0;
        maxPlayers = Number(data2.players?.max) || 0;
      }
    } catch (e) {}
  }

  indicator.className = 'dot-pulse';

  if (isOnline) {
    indicator.classList.add('online');
    playersText.innerHTML = `Online — <span class="highlight">${onlinePlayers}/${maxPlayers}</span> jogadores`;
  } else {
    indicator.classList.add('offline');
    playersText.textContent = 'Offline — Servidor em manutenção';
  }
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function setStatus(msg, type)  { statusText.textContent = msg; statusText.className = type || ''; }
function setButtonPlay()       { btnAction.className = 'play';    btnAction.disabled = false; btnIcon.textContent = ''; btnText.textContent = 'Jogar'; }
function setButtonInstall()    { btnAction.className = 'install'; btnAction.disabled = false; btnIcon.textContent = ''; btnText.textContent = 'Instalar'; }
function setButtonUpdate()     { btnAction.className = 'update';  btnAction.disabled = false; btnIcon.textContent = ''; btnText.textContent = 'Atualizar'; }
function setButtonStop(m)      { btnAction.className = 'stop';    btnAction.disabled = false; btnIcon.textContent = ''; btnText.textContent = m; }
function setButtonLoading(m)   { btnAction.className = 'loading'; btnAction.disabled = true;  btnIcon.innerHTML = '<span class="spin">⟳</span>'; btnText.textContent = m; }
function setButtonDisabled(m)  { btnAction.className = 'disabled';btnAction.disabled = true;  btnIcon.textContent = ''; btnText.textContent = m; }
function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'], i = Math.floor(Math.log(b)/Math.log(k));
  return parseFloat((b/Math.pow(k,i)).toFixed(1)) + ' ' + s[i];
}
