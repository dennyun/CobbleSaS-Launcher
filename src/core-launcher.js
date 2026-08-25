const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Store = require('electron-store');
const { exec } = require('child_process');
const https = require('https');
const extractZip = require('extract-zip');

// Função auxiliar para checar a versão do Java do PC
function getJavaVersion(javaPath) {
  const exe = javaPath ? `"${javaPath}"` : 'java';
  return new Promise((resolve) => {
    exec(`${exe} -version`, (err, stdout, stderr) => {
      if (err) return resolve(0);
      const output = stderr.toString();
      // Regex para capturar a versão (ex: "1.8.0_301" ou "21.0.1")
      const match = output.match(/version "(\d+)/);
      if (match) {
        let major = parseInt(match[1]);
        // Se for "1.8", o major é 8
        if (major === 1) {
          const match2 = output.match(/version "1\.(\d+)/);
          if (match2) major = parseInt(match2[1]);
        }
        resolve(major);
      } else {
        resolve(0);
      }
    });
  });
}

// Procura por instalações do Java 21 automaticamente
async function autoFindJava21() {
  const isWindows = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';

  const commonPaths = isWindows ? [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Eclipse Adoptium'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Java'),
    path.join(getRootDir(), 'runtime', 'java-21'),
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Amazon Corretto',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files (x86)\\Eclipse Adoptium',
    'C:\\Program Files (x86)\\Java'
  ] : (isMac ? [
    '/Library/Java/JavaVirtualMachines',
    path.join(getRootDir(), 'runtime', 'java-21')
  ] : [
    '/usr/lib/jvm',
    '/usr/java',
    '/opt/java',
    path.join(getRootDir(), 'runtime', 'java-21')
  ]);

  let possibleJavas = [];

  // Tenta o Java do próprio Minecraft Oficial (se estiver instalado)
  if (isWindows) {
    const mcJava = path.join(os.homedir(), 'AppData', 'Local', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime', 'java-runtime-gamma', 'windows-x64', 'java-runtime-gamma', 'bin', 'javaw.exe');
    if (fs.existsSync(mcJava)) possibleJavas.push(mcJava);
  }

  for (const baseDir of commonPaths) {
    if (fs.existsSync(baseDir)) {
      try {
        const subDirs = fs.readdirSync(baseDir);
        for (const subDir of subDirs) {
          const subPath = path.join(baseDir, subDir);
          if (isWindows) {
            const javaPath = path.join(subPath, 'bin', 'javaw.exe');
            const javaExePath = path.join(subPath, 'bin', 'java.exe');
            if (fs.existsSync(javaPath)) possibleJavas.push(javaPath);
            else if (fs.existsSync(javaExePath)) possibleJavas.push(javaExePath);
          } else if (isMac) {
            const javaPath = path.join(subPath, 'Contents', 'Home', 'bin', 'java');
            if (fs.existsSync(javaPath)) possibleJavas.push(javaPath);
          } else {
            const javaPath = path.join(subPath, 'bin', 'java');
            if (fs.existsSync(javaPath)) possibleJavas.push(javaPath);
          }
        }
      } catch(e) {}
    }
  }

  // Testa cada executável encontrado para ver se é ESTRITAMENTE a versão 21
  for (const jPath of possibleJavas) {
    const version = await getJavaVersion(jPath);
    if (version === 21) {
      return jPath;
    }
  }

  return null;
}

// ─── Auto-Download e Instalação do Java 21 ───────────────────────────────────
async function downloadAndInstallJava21(onProgress) {
  return new Promise((resolve, reject) => {
    const platform = os.platform() === 'win32' ? 'windows' : (os.platform() === 'darwin' ? 'mac' : 'linux');
    const isWindows = platform === 'windows';
    const ext = isWindows ? '.zip' : '.tar.gz';
    const arch = os.arch() === 'arm64' ? 'aarch64' : 'x64';
    const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${platform}/${arch}/jre/hotspot/normal/eclipse?project=jdk`;
    const rootDir = getRootDir();
    const javaFolder = path.join(rootDir, 'runtime', 'java-21');
    const zipPath = path.join(os.tmpdir(), `java-21-adoptium${ext}`);

    try {
      if (fs.existsSync(javaFolder)) {
        fs.rmSync(javaFolder, { recursive: true, force: true });
      }
    } catch (err) {
      return reject(new Error("O Java antigo está bloqueado pelo Windows.\nIsso geralmente acontece se o jogo travou em segundo plano. Por favor, reinicie o PC e tente novamente."));
    }
    fs.mkdirSync(javaFolder, { recursive: true });

    let downloaded = 0;
    let totalLength = 0;

    function doRequest(reqUrl, redirectCount = 0) {
      if (redirectCount > 5) return reject(new Error('Muitos redirecionamentos ao baixar o Java.'));
      
      https.get(reqUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Falha ao baixar o Java: Erro HTTP ${res.statusCode}`));
        }

        totalLength = parseInt(res.headers['content-length'], 10) || 45000000;
        const fileStream = fs.createWriteStream(zipPath);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          const percent = ((downloaded / totalLength) * 100).toFixed(1);
          if (onProgress) onProgress(percent);
        });

        res.pipe(fileStream);

        fileStream.on('finish', async () => {
          fileStream.close();
          let extractionSuccess = false;
          
          try {
            if (onProgress) onProgress('EXTRAINDO');
            
            if (isWindows) {
              await extractZip(zipPath, { dir: javaFolder });
            } else {
              // Uso do extrator nativo tar no Linux/Mac com limite de buffer estendido (evita crash silencioso)
              await new Promise((resolveExt, rejectExt) => {
                exec(`tar -xzf "${zipPath}" -C "${javaFolder}"`, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                  if (error) rejectExt(new Error(stderr || error.message));
                  else resolveExt();
                });
              });
            }
            extractionSuccess = true;
          } catch (e) {
            let msg = e.message;
            if (isWindows && msg.includes('EPERM')) {
              try {
                if (onProgress) onProgress('EXTRAÇÃO SEGURA');
                if (fs.existsSync(javaFolder)) fs.rmSync(javaFolder, { recursive: true, force: true });
                fs.mkdirSync(javaFolder, { recursive: true });
                
                const Zip = require('adm-zip');
                const zip = new Zip(zipPath);
                zip.getEntries().forEach((entry) => {
                  if (!entry.isDirectory && !entry.entryName.endsWith('.jsa')) {
                    zip.extractEntryTo(entry, javaFolder, true, true);
                  }
                });
                extractionSuccess = true;
              } catch (fallbackError) {
                msg = "O Windows ou o Antivírus bloqueou a extração do Java permanentemente.\nPor favor, reinicie o computador, desative temporariamente o seu Antivírus e tente clicar em Jogar novamente.";
                reject(new Error("Falha Crítica ao extrair o Java: " + msg));
                return;
              }
            } else {
              reject(new Error("Falha ao extrair o Java: " + msg));
              return;
            }
          }

          if (extractionSuccess) {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); // Limpeza

            // O zip da Adoptium extrai uma pasta dinâmica tipo 'jdk-21.0.1-jre'.
            // Vamos procurar o java.exe lá dentro.
            let javaExe = null;
            function searchJava(dir) {
              const files = fs.readdirSync(dir);
              for (const f of files) {
                const fullPath = path.join(dir, f);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                  searchJava(fullPath);
                } else if (f.toLowerCase() === 'javaw.exe' || f.toLowerCase() === 'java.exe' || (!isWindows && f === 'java')) {
                  javaExe = fullPath;
                }
              }
            }
            searchJava(javaFolder);

            if (javaExe) {
              if (!isWindows) {
                try { fs.chmodSync(javaExe, 0o755); } catch (e) {} // Permissão de execução no Linux
              }
              store.set('javaPath', javaExe);
              resolve(javaExe);
            } else {
              reject(new Error("Java baixado, mas executável não encontrado!"));
            }
          }
        });
      }).on('error', (err) => {
        reject(new Error("Erro de rede ao baixar o Java: " + err.message));
      });
    }

    doRequest(url);
  });
}

const store = new Store();
const launcher = new Client();

// Diretório oficial e isolado do projeto
function getRootDir() {
  const defaultPath = os.platform() === 'win32' 
    ? path.join(os.homedir(), 'AppData', 'Roaming', '.cobblesas')
    : path.join(os.homedir(), '.cobblesas');
  return store.get('install_path', defaultPath);
}

class CoreLauncher {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
  }

  // Envia eventos para a barra verde de download da UI
  sendProgress(data) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('download-progress', data);
    }
  }

  async ensureJava21() {
    let javaPath = store.get('javaPath', null);
    let javaVersion = javaPath ? await getJavaVersion(javaPath) : 0;
    
    // Se o javaPath configurado não for EXATAMENTE a versão 21, procura ou baixa
    if (javaVersion !== 21) {
      const autoFoundPath = await autoFindJava21();
      if (autoFoundPath) {
        javaPath = autoFoundPath;
        javaVersion = await getJavaVersion(javaPath);
        store.set('javaPath', javaPath);
      }
    }

    if (javaVersion !== 21) {
      try {
        this.sendProgress({ task: 'Baixando Java 21 LTS... Por favor, aguarde.', current: 0, total: 100 });
        const downloadedPath = await downloadAndInstallJava21((p) => {
          if (p === 'EXTRAINDO') {
            this.sendProgress({ task: 'Instalando Java 21 LTS...', current: 99, total: 100 });
          } else {
            this.sendProgress({ task: `Baixando Java 21 LTS... (${p}%)`, current: parseFloat(p), total: 100 });
          }
        });
        javaPath = downloadedPath;
        javaVersion = await getJavaVersion(javaPath);
        store.set('javaPath', javaPath);
      } catch(err) {
         throw new Error(`Tentamos instalar o Java 21 automaticamente, mas houve um erro.\nErro: ${err.message}\nPor favor, instale o Java 21 manualmente (Eclipse Adoptium Temurin 21) ou aponte o caminho nas Configurações.`);
      }
    }

    if (javaVersion !== 21) {
      throw new Error(`O Java detectado é a versão ${javaVersion}.\n\nO Cobblemon e o Minecraft 1.21.1 exigem estritamente o Java 21 LTS.\nPor favor, instale o Eclipse Adoptium Temurin 21.`);
    }

    return javaPath;
  }

  async launch(mcVersion, loaderVersion) {
    return new Promise(async (resolve, reject) => {
      try {
        let javaPath = await this.ensureJava21();
        let javaVersion = await getJavaVersion(javaPath);

        const rootDir = getRootDir();
        if (!fs.existsSync(rootDir)) {
          fs.mkdirSync(rootDir, { recursive: true });
        }
        const nickname = store.get('nickname', 'Player');
        const ramChoice = store.get('ram', 'AUTO');
        const width = store.get('width', '854');
        const height = store.get('height', '480');
        const fullscreen = store.get('fullscreen', false);
        
        // Prepara diretórios
        const root = getRootDir();
        if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

        // Sincronização de perfil (Isola as configurações do jogo por Nickname preservando o padrão)
        const syncFiles = ['options.txt', 'servers.dat', 'hotbar.nbt', 'optionsof.txt', 'optionsshaders.txt'];
        const lastPlayerFile = path.join(root, 'last_player.txt');
        const defaultProfileDir = path.join(root, 'default_profile');
        const safeNickname = nickname.trim();
        const nicknameHex = Buffer.from(safeNickname).toString('hex'); // Transforma o nick em um código único para diferenciar Maiúsculas de Minúsculas no Windows
        
        // Função para evitar corrupção por queda de energia na hora da cópia
        const atomicCopy = (src, dest) => {
          const tmpDest = dest + '.tmp';
          fs.copyFileSync(src, tmpDest);
          fs.renameSync(tmpDest, dest);
        };

        // 1. FAZER BACKUP DO ESTADO ATUAL DA RAIZ PARA O ÚLTIMO JOGADOR QUE JOGOU
        let lastPlayer = '';
        if (fs.existsSync(lastPlayerFile)) {
          lastPlayer = fs.readFileSync(lastPlayerFile, 'utf-8').trim();
        }
        
        if (lastPlayer) {
          const lastPlayerHex = Buffer.from(lastPlayer).toString('hex');
          const lastProfileDir = path.join(root, 'profiles', lastPlayerHex);
          if (!fs.existsSync(lastProfileDir)) fs.mkdirSync(lastProfileDir, { recursive: true });
          
          for (const file of syncFiles) {
            const rootFile = path.join(root, file);
            if (fs.existsSync(rootFile)) {
              atomicCopy(rootFile, path.join(lastProfileDir, file)); // Backup garantido
            }
          }
        } else {
          // Se lastPlayerFile não existe, NINGUÉM jogou ainda. A raiz é a configuração "padrão/pristine".
          if (!fs.existsSync(defaultProfileDir)) fs.mkdirSync(defaultProfileDir, { recursive: true });
          for (const file of syncFiles) {
            const rootFile = path.join(root, file);
            if (fs.existsSync(rootFile)) atomicCopy(rootFile, path.join(defaultProfileDir, file));
          }
        }

        // 2. CARREGAR O ESTADO DO JOGADOR ATUAL PARA A RAIZ
        const currentProfileDir = path.join(root, 'profiles', nicknameHex);
        
        if (!fs.existsSync(currentProfileDir)) {
          // JOGADOR NOVO (Cria a pasta e injeta os arquivos default)
          fs.mkdirSync(currentProfileDir, { recursive: true });
          if (fs.existsSync(defaultProfileDir)) {
            for (const file of syncFiles) {
              const defaultFile = path.join(defaultProfileDir, file);
              const rootFile = path.join(root, file);
              if (fs.existsSync(defaultFile)) {
                atomicCopy(defaultFile, rootFile);
              } else if (fs.existsSync(rootFile)) {
                fs.unlinkSync(rootFile); // Segurança: limpa se não tiver default
              }
            }
          } else {
            // Sem default profile: apaga as configs da raiz para ele não herdar de ninguem
            for (const file of syncFiles) {
              const rootFile = path.join(root, file);
              if (fs.existsSync(rootFile)) fs.unlinkSync(rootFile);
            }
          }
        } else {
          // JOGADOR VETERANO (Carrega os arquivos dele para a raiz)
          for (const file of syncFiles) {
            const profileFile = path.join(currentProfileDir, file);
            const rootFile = path.join(root, file);
            if (fs.existsSync(profileFile)) {
              atomicCopy(profileFile, rootFile); // Injeta o save dele
            } else if (fs.existsSync(rootFile)) {
              fs.unlinkSync(rootFile); // Segurança: se o arquivo dele sumiu, não deixa ele usar o da raiz
            }
          }
        }
        
        // Registra que este jogador é o atual dono da raiz
        fs.writeFileSync(lastPlayerFile, safeNickname, 'utf-8');

        // A versão do Minecraft modificada pelo Fabric fica com este nome:
        const versionStr = `fabric-loader-${loaderVersion}-${mcVersion}`;

        // ─── [SEC] Prevenir a Tela Preta do CMD no Windows ─────────────────────
        if (os.platform() === 'win32') {
          if (!javaPath) {
            javaPath = 'javaw'; // O Windows esconde o CMD se usar javaw
          } else if (javaPath.toLowerCase().endsWith('java.exe')) {
            const javawPath = javaPath.substring(0, javaPath.length - 8) + 'javaw.exe';
            if (fs.existsSync(javawPath)) {
              javaPath = javawPath;
            }
          }
        }

        // Converte sufixos como 1.5G para Megabytes corretos (1536M). O Java não aceita "-Xmx1.5G".
        let maxRamStr = ramChoice === 'AUTO' ? '4G' : ramChoice;
        if (maxRamStr.includes('.') && maxRamStr.toUpperCase().endsWith('G')) {
          const gbValue = parseFloat(maxRamStr);
          maxRamStr = Math.floor(gbValue * 1024) + 'M';
        }
        
        let minRamStr = maxRamStr; // Igualar Xms e Xmx é a melhor prática para performance

        let opts = {
          clientPackage: null,
          authorization: Authenticator.getAuth(nickname),
          root: root,
          version: {
            number: mcVersion,
            type: "release",
          },
          memory: {
            max: maxRamStr,
            min: minRamStr
          },
          window: {
            width: width,
            height: height,
            fullscreen: fullscreen
          },
          javaPath: javaPath,
          overrides: {
            maxSockets: 8 // Modo Turbo: baixa 8 arquivos simultâneos (Limite máximo recomendado)
          },
          // Custom Fabric Loader arguments
          forge: false // we are using fabric
          // Wait, minecraft-launcher-core handles fabric if we set custom version!
        };

        // Se tiver fabricLoader, o minecraft-launcher-core precisa saber a versão customizada.
        // O Fabric cria uma pasta em versions/ chamada 'fabric-loader-VERSION-mcVERSION'
        if (loaderVersion) {
            // Se o Updater já baixou os mods na pasta do ROOT_DIR e o profile do Fabric já está lá...
            // O Updater deve instalar o Fabric no ROOT_DIR para o core pegar
            opts.version.custom = `fabric-loader-${loaderVersion}-${mcVersion}`;
        }

        // Limpa os listeners anteriores para evitar vazamento de eventos se o launcher ficar aberto
        launcher.removeAllListeners();

        // ─── [LOGS] Sistema de Rotação e Gravação ──────────────────────────────
        const logDir = path.join(rootDir, 'logs', 'launcher');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        
        const logFile = path.join(logDir, 'log.txt');
        const lastLogFile = path.join(logDir, 'lastlog.txt');
        
        try {
          if (fs.existsSync(logFile)) {
            if (fs.existsSync(lastLogFile)) fs.unlinkSync(lastLogFile);
            fs.renameSync(logFile, lastLogFile);
          }
        } catch(e) {
          console.error("Erro ao rotacionar logs: ", e);
        }
        
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });
        
        const writeLog = (msg) => {
          const timestamp = new Date().toISOString();
          const line = `[${timestamp}] ${String(msg).trim()}\n`;
          logStream.write(line);
          console.log(line.trim());
        };

        writeLog('=== INICIANDO SESSÃO DE JOGO ===');
        writeLog(`Nickname: ${nickname}`);
        writeLog(`RAM Configurada: ${maxRamStr}`);
        writeLog(`Java Path: ${javaPath || 'Padrão do Sistema (java)'}`);
        writeLog(`Java Version Detectada: ${javaVersion}`);

        launcher.on('debug', (e) => writeLog(`[DEBUG] ${e}`));
        launcher.on('data', (e) => writeLog(`[DATA] ${e}`));
        
        let globalNativePercent = 0;

        launcher.on('progress', (e) => {
          // e = { type: 'assets', task: 1, total: 3000 }
          globalNativePercent = (e.total > 0) ? Math.min(100, Math.max(0, (e.task / e.total) * 100)) : 0;
          
          const tipos = {
             'assets': 'Recursos e Texturas',
             'natives': 'Nativos do Sistema',
             'classes': 'Bibliotecas Java',
             'classes-custom': 'Componentes Extra',
             'classes-maven-custom': 'Dependências'
          };
          const nomeTipo = tipos[e.type] || e.type;
          
          this.sendProgress({
            phase: 'native-download',
            task: `Carregando ${nomeTipo}... (${e.task}/${e.total})`,
            percent: globalNativePercent
          });
        });

        launcher.on('download-status', (e) => {
          // O Minecraft.jar é 1 arquivo muito pesado (20MB+), então nele queremos ver a porcentagem de bytes.
          if (e.type === 'version-jar') {
            const pct = (e.total > 0) ? Math.min(100, Math.max(0, (e.current / e.total) * 100)) : 0;
            this.sendProgress({
              phase: 'native-download',
              task: `Baixando Motor Principal... (${Math.round(pct)}%)`,
              percent: pct
            });
            globalNativePercent = pct;
          } else {
            // Nos outros (que são milhares de arquivos pequenos), a barra verde obedece o evento de cima (progress global). 
            // Nós apenas mudamos o texto pra ele não ficar com cara de "travado".
            let safeName = (e.name || '').substring(0, 30);
            this.sendProgress({
              phase: 'native-download',
              task: `Processando: ${safeName}...`,
              percent: globalNativePercent
            });
          }
        });

        launcher.on('arguments', (e) => {
          if (this.mainWindow) this.mainWindow.webContents.send('game-state', 'starting');
        });

        launcher.on('close', (e) => {
          writeLog(`=== SESSÃO ENCERRADA ===`);
          writeLog(`Minecraft fechou com código: ${e}`);
          logStream.end();
          const store = new Store();
          const ram = store.get('ram', 'AUTO');
          console.log(`[CoreLauncher] Minecraft fechado. RAM: ${ram} Nick: ${nickname}`);
          
          // Sincronizar ao fechar o jogo
          const safeNicknameEnd = nickname.trim();
          const nicknameHexEnd = Buffer.from(safeNicknameEnd).toString('hex');
          const currentProfileDir = path.join(root, 'profiles', nicknameHexEnd);
          if (!fs.existsSync(currentProfileDir)) fs.mkdirSync(currentProfileDir, { recursive: true });
          for (const file of syncFiles) {
            const rootFile = path.join(root, file);
            if (fs.existsSync(rootFile)) fs.copyFileSync(rootFile, path.join(currentProfileDir, file));
          }

          if (this.mainWindow) this.mainWindow.webContents.send('game-state', 'closed');
          resolve({ code: e });
        });

        // A função launch baixa TUDO (Vanilla assets, java se configurado, etc) e roda.
        this.gameProcess = await launcher.launch(opts);
        
        // Se a promise do launch resolver, significa que o comando foi disparado. 
        // O jogo está rodando em background.
        resolve({ success: true });

      } catch (err) {
        console.error('[CoreLauncher] Falha crítica:', err);
        if (typeof writeLog !== 'undefined') {
          writeLog(`[FATAL ERROR] ${err.message || String(err)}`);
          logStream.end();
        }
        resolve({ error: err.message || String(err) });
      }
    });
  }

  kill() {
    if (this.gameProcess) {
      this.gameProcess.kill('SIGKILL');
      this.gameProcess = null;
    }
  }
}

module.exports = CoreLauncher;
