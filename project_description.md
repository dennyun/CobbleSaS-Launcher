# 🎮 Cobblemon Launcher — Descrição do Projeto

## O que é

O **Cobblemon Launcher** é um launcher desktop personalizado desenvolvido para o servidor **CobbleSaS**, um servidor de Minecraft com o mod Cobblemon (batalhas de Pokémon no Minecraft). O launcher permite que qualquer jogador — tanto com conta original quanto pirata — instale, atualize e inicie o modpack do servidor com poucos cliques, sem precisar configurar nada manualmente.

---

## ✨ Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| **Verificação de atualizações** | Compara a versão local com o `manifest.json` hospedado no GitHub |
| **Download do modpack** | Baixa o `modpack.zip` da release do GitHub com barra de progresso em tempo real |
| **Extração automática** | Descompacta o modpack em `.minecraft\modpacks\CobbleSaS\mods\` |
| **Instalação do Fabric** | Baixa e executa o Fabric Installer automaticamente (requer Java) |
| **Perfil no launcher** | Cria/atualiza o perfil `CobbleSaS` no `launcher_profiles.json` para aparecer nos launchers |
| **Verificação de integridade** | Compara os mods instalados com a lista salva — detecta arquivos faltando ou extras |
| **Suporte a dois launchers** | Funciona com o **Minecraft Launcher original** (Mojang) e o **SKLauncher** (pirata) |
| **Detecção automática** | Busca o executável do launcher via Registro do Windows, Desktop e varredura de drives |
| **Seleção manual** | File picker via PowerShell caso o diálogo nativo do Electron falhe |
| **Persistência de configuração** | Salva launcher escolhido, caminhos e versões instaladas entre sessões |

---

## 🛠 Tecnologias e Ferramentas

### Runtime / Framework
| Ferramenta | Versão | Função |
|---|---|---|
| **Electron** | `^29.0.0` | Framework principal — cria janela desktop com tecnologias web |
| **Node.js** | (incluso no Electron) | Backend JavaScript — sistema de arquivos, processos, rede |

### Dependências de produção
| Pacote | Versão | Função |
|---|---|---|
| **extract-zip** | `^2.0.1` | Descompacta o `modpack.zip` nos diretórios corretos |
| **electron-store** | `^8.1.0` | Persistência de configurações (launcher escolhido, caminhos, versões) |
| **axios** | `^1.6.0` | Presente no projeto (download feito com `https` nativo para compatibilidade com redirect do GitHub) |

### Ferramentas de desenvolvimento
| Ferramenta | Versão | Função |
|---|---|---|
| **electron-builder** | `^24.9.1` | Empacota o launcher como instalador `.exe` (NSIS) para Windows |

### APIs e serviços externos
| Serviço | Função |
|---|---|
| **GitHub Releases** | Hospeda o `modpack.zip` — download direto via HTTPS |
| **GitHub raw content** | Hospeda o `manifest.json` — verificação de versão e metadados |
| **Fabric Meta API** | `meta.fabricmc.net` — consulta versões disponíveis do Fabric Loader |
| **Fabric Installer** | Download automático e execução via `java -jar` para instalar o Fabric |
| **Windows Registry** (`reg query`) | Localiza o `Minecraft.exe` no PC do usuário via chaves `App Paths` e `Uninstall` |
| **PowerShell** (`System.Windows.Forms`) | File picker alternativo quando o diálogo nativo do Electron falha |

### Frontend (interface)
| Tecnologia | Função |
|---|---|
| **HTML5** | Estrutura da interface (janela, overlay, botões, campos) |
| **CSS3** | Estilização com tema escuro, glassmorphism, animações |
| **JavaScript (Vanilla)** | Lógica da interface — estados, eventos, progresso |
| **Google Fonts** | Tipografia: `Inter` e `JetBrains Mono` |

---

## 📁 Estrutura de arquivos

```
cobblemon-launcher/
├── main.js                    # Processo principal Electron — IPCs, janela, dialogs
├── preload.js                 # Bridge segura entre renderer e main (contextBridge)
├── manifest.json              # Metadados locais do pack (versão, URL de download)
├── renderer/
│   ├── index.html             # Interface da janela
│   ├── renderer.js            # Lógica da UI — estados, fluxo de atualização
│   └── style.css              # Tema visual escuro/premium
├── src/
│   ├── updater.js             # Download, extração do modpack, criação de perfil
│   ├── launcher-manager.js    # Detecção e abertura dos launchers (Vanilla/SK)
│   ├── fabric-installer.js    # Download e instalação do Fabric via Java
│   └── profile-manager.js     # Cria/atualiza perfil no launcher_profiles.json
└── assets/
    └── icon.ico / .icns / .png
```

---

## 🔄 Fluxo de funcionamento

```
Abrir launcher
    ↓
Primeira vez? → Overlay: escolher Vanilla ou SKLauncher
    ↓
check-update → busca manifest.json no GitHub
    ↓
Verifica integridade dos mods em disco
    ↓
┌── Mods OK + versão igual ──→ [JOGAR]
│
└── Faltando mods ou nova versão ──→ [ATUALIZAR]
        ↓
    1. Instala Fabric (via java -jar fabric-installer.jar)
    2. Baixa modpack.zip (GitHub Releases)
    3. Extrai em .minecraft\modpacks\CobbleSaS\mods\
    4. Salva lista de mods instalados (integridade futura)
    5. Cria perfil no launcher_profiles.json
        ↓
    [JOGAR]
        ↓
    Verificação de integridade (pré-launch)
        ↓
    Abre Minecraft.exe ou SKLauncher.jar
    Perfil CobbleSaS já selecionado no launcher
```

---

## 🎯 Compatibilidade

| Sistema | Suporte |
|---|---|
| **Windows 10/11** | ✅ Principal plataforma |
| **macOS** | ⚠️ Build disponível (`electron-builder --mac`) |
| **Linux** | ⚠️ Build disponível (`electron-builder --linux`) |

> A detecção via Registro do Windows e o suporte a `.lnk` são exclusivos do Windows. Em outros sistemas, o usuário precisa localizar o launcher manualmente.
