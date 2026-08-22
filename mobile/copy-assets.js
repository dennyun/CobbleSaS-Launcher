const fs = require('fs');
const path = require('path');
const https = require('https');

const srcDir = path.join(__dirname, '..', 'assets');
const destDir = path.join(__dirname, 'www', 'assets');
const wwwDir = path.join(__dirname, 'www');

// Garante os diretórios de destino
if (!fs.existsSync(wwwDir)) {
  fs.mkdirSync(wwwDir, { recursive: true });
}
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log('Diretório mobile/www/assets criado.');
}

// 1. Copiar assets locais
const filesToCopy = ['icon.png', 'bg.png'];

filesToCopy.forEach((file) => {
  const srcFile = path.join(srcDir, file);
  const destFile = path.join(destDir, file);

  if (fs.existsSync(srcFile)) {
    try {
      fs.copyFileSync(srcFile, destFile);
      console.log(`Sucesso: ${file} copiado para mobile/www/assets/`);
    } catch (err) {
      console.error(`Erro ao copiar ${file}:`, err.message);
    }
  } else {
    console.warn(`Aviso: Arquivo de origem não encontrado em: ${srcFile}`);
  }
});

// 2. Baixar JSZip do CDN
const jszipDest = path.join(wwwDir, 'jszip.min.js');
const jszipUrl = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

console.log('Baixando JSZip...');
const file = fs.createWriteStream(jszipDest);
https.get(jszipUrl, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Falha ao baixar JSZip: HTTP ${response.statusCode}`);
    return;
  }
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Sucesso: JSZip baixado e salvo em mobile/www/jszip.min.js');
  });
}).on('error', (err) => {
  fs.unlink(jszipDest, () => {});
  console.error('Erro de rede ao baixar JSZip:', err.message);
});
