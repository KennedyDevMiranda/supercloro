const statusEl = document.getElementById('status');
const lista = document.getElementById('lista');
const inputManual = document.getElementById('codigoManual');
const serverInput = document.getElementById('serverInput');
const conexaoOk = document.getElementById('conexaoOk');
const conexaoErr = document.getElementById('conexaoErr');
const avisoCert = document.getElementById('avisoCert');
const linkCert = document.getElementById('linkCert');

let ultimoCodigo = '';
let cooldown = false;
let serverUrl = '';
let servidorConectado = false;

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

// ══════════════════════════════════════════
// 🔌 CONEXÃO COM O SERVIDOR PDV
// ══════════════════════════════════════════

// Lê parâmetro ?pdv=IP:PORTA da URL
(function lerParametro() {
  const params = new URLSearchParams(window.location.search);
  const pdv = params.get('pdv');
  if (pdv) {
    serverInput.value = pdv;
    conectarServidor();
  }
})();

async function conectarServidor() {
  const valor = serverInput.value.trim();
  if (!valor) return;

  conexaoOk.style.display = 'none';
  conexaoErr.style.display = 'none';
  avisoCert.style.display = 'none';

  // Monta a URL base (assume HTTPS se não especificado)
  let base = valor;
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'https://' + base;
  }
  serverUrl = base;

  // Testa a conexão com PING
  try {
    const resp = await fetch(serverUrl + '/scan', {
      method: 'POST',
      body: 'PING',
      signal: AbortSignal.timeout(5000)
    });
    const texto = await resp.text();
    servidorConectado = true;
    conexaoOk.style.display = 'block';
    statusEl.textContent = 'Carregando scanner...';
    statusEl.className = 'status';
    iniciar();
  } catch (e) {
    servidorConectado = false;
    conexaoErr.style.display = 'block';
    avisoCert.style.display = 'block';
    linkCert.href = serverUrl;
    statusEl.textContent = '⚠️ Aceite o certificado do servidor primeiro';
    statusEl.className = 'status warn';
  }
}

// ══════════════════════════════════════════
// 📤 ENVIAR CÓDIGO AO SERVIDOR
// ══════════════════════════════════════════

async function enviarCodigo(codigo) {
  if (!codigo || cooldown) return;
  if (codigo === ultimoCodigo) return;
  if (!serverUrl) {
    statusEl.textContent = '⚠️ Configure o endereço do servidor primeiro';
    statusEl.className = 'status warn';
    return;
  }
  ultimoCodigo = codigo;
  cooldown = true;
  setTimeout(() => { cooldown = false; ultimoCodigo = ''; }, 2000);

  try {
    const resp = await fetch(serverUrl + '/scan', { method: 'POST', body: codigo });
    const texto = await resp.text();

    if (texto.startsWith('OK:')) {
      statusEl.textContent = '✅ ' + texto.substring(3);
      statusEl.className = 'status ok';
      adicionarHistorico(codigo);
      if (navigator.vibrate) navigator.vibrate(200);
    } else if (texto.startsWith('NAO_ENCONTRADO:')) {
      statusEl.textContent = '⚠ Produto não encontrado: ' + texto.substring(15);
      statusEl.className = 'status warn';
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else if (texto.startsWith('SEM_ESTOQUE:')) {
      statusEl.textContent = '⚠ Sem estoque: ' + texto.substring(12);
      statusEl.className = 'status warn';
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else if (texto.startsWith('ERRO:')) {
      statusEl.textContent = '❌ ' + texto.substring(5);
      statusEl.className = 'status err';
    } else {
      statusEl.textContent = '✅ Enviado: ' + codigo;
      statusEl.className = 'status ok';
      adicionarHistorico(codigo);
    }
  } catch (e) {
    statusEl.textContent = '❌ Erro: ' + (e.message || 'Conexão falhou');
    statusEl.className = 'status err';
  }
}

function enviarManual() {
  const c = inputManual.value.trim();
  if (c) {
    ultimoCodigo = '';
    cooldown = false;
    enviarCodigo(c);
    inputManual.value = '';
    inputManual.focus();
  }
}

inputManual.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') enviarManual();
});

// ══════════════════════════════════════════
// 📋 HISTÓRICO
// ══════════════════════════════════════════

function adicionarHistorico(codigo) {
  const li = document.createElement('li');
  const now = new Date().toLocaleTimeString('pt-BR');
  li.innerHTML = '<span>' + codigo + '<span class="badge">✓</span></span><span class="time">' + now + '</span>';
  lista.insertBefore(li, lista.firstChild);
  if (lista.children.length > 20) lista.removeChild(lista.lastChild);
}

// ══════════════════════════════════════════
// 📸 ANÁLISE DE FOTO (mais confiável)
// ══════════════════════════════════════════

document.getElementById('fotoInput').addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;
  statusEl.textContent = '🔍 Analisando foto...';
  statusEl.className = 'status';

  try {
    const bmp = await createImageBitmap(file);

    // Tenta BarcodeDetector nativo (Google ML Kit — mais potente)
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({ formats: FORMATOS });
      const res = await det.detect(bmp);
      if (res.length > 0) {
        ultimoCodigo = '';
        cooldown = false;
        enviarCodigo(res[0].rawValue);
        e.target.value = '';
        return;
      }
    }

    // Tenta html5-qrcode (ZXing) se disponível
    if (typeof Html5Qrcode !== 'undefined') {
      const tmp = new Html5Qrcode('foto-temp');
      try {
        const r = await tmp.scanFileV2(file, false);
        ultimoCodigo = '';
        cooldown = false;
        enviarCodigo(r.decodedText);
        e.target.value = '';
        tmp.clear();
        return;
      } catch { tmp.clear(); }
    }

    statusEl.textContent = '⚠ Nenhum código encontrado. Tente com boa luz e mais perto.';
    statusEl.className = 'status warn';
  } catch {
    statusEl.textContent = '⚠ Erro ao analisar foto. Tente novamente.';
    statusEl.className = 'status warn';
  }
  e.target.value = '';
});

// ══════════════════════════════════════════
// 📷 SCANNER EM TEMPO REAL
// ══════════════════════════════════════════

function loadScript(url, timeout) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    let done = false;
    s.src = url;
    s.onload = () => { if (!done) { done = true; resolve(true); } };
    s.onerror = () => { if (!done) { done = true; resolve(false); } };
    setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeout);
    document.head.appendChild(s);
  });
}

async function iniciarBarcodeDetector() {
  const readerDiv = document.getElementById('reader');
  const video = document.createElement('video');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');
  video.style.width = '100%';
  video.style.display = 'block';
  readerDiv.appendChild(video);

  // Linha de scan animada
  const line = document.createElement('div');
  line.className = 'scan-line';
  readerDiv.appendChild(line);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { min: 640, ideal: 1920 },
      height: { min: 480, ideal: 1080 }
    }
  });
  video.srcObject = stream;
  await video.play();

  const detector = new BarcodeDetector({ formats: FORMATOS });
  let scanning = false;

  async function scanLoop() {
    if (!scanning && video.readyState >= 2) {
      scanning = true;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) enviarCodigo(barcodes[0].rawValue);
      } catch { }
      scanning = false;
    }
    requestAnimationFrame(scanLoop);
  }
  requestAnimationFrame(scanLoop);

  statusEl.textContent = '📷 Câmera ativa — aponte para o código de barras';
  statusEl.className = 'status';
}

async function iniciarHtml5Qrcode() {
  const scanner = new Html5Qrcode('reader', {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.QR_CODE
    ],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  });

  await scanner.start(
    {
      facingMode: { ideal: 'environment' },
      width: { min: 640, ideal: 1920 },
      height: { min: 480, ideal: 1080 }
    },
    {
      fps: 20,
      qrbox: function (vw, vh) {
        const w = Math.floor(vw * 0.9);
        const h = Math.max(Math.floor(vh * 0.2), 80);
        return { width: w, height: h };
      },
      disableFlip: false
    },
    (text) => enviarCodigo(text),
    () => { }
  );

  statusEl.textContent = '📷 Câmera ativa — aponte para o código de barras';
  statusEl.className = 'status';
}

async function iniciar() {
  // 1. BarcodeDetector nativo (Google ML Kit — mais rápido e preciso no Chrome Android)
  if ('BarcodeDetector' in window) {
    try { await iniciarBarcodeDetector(); return; }
    catch (e) { console.warn('BarcodeDetector falhou:', e); }
  }

  // 2. html5-qrcode do CDN (funciona em outros navegadores)
  const loaded = await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', 5000);
  if (loaded && typeof Html5Qrcode !== 'undefined') {
    try { await iniciarHtml5Qrcode(); return; }
    catch (e) { console.warn('html5-qrcode falhou:', e); }
  }

  // 3. Somente foto + entrada manual
  statusEl.textContent = '📸 Use o botão TIRAR FOTO ou digite o código manualmente.';
  statusEl.className = 'status warn';
  document.getElementById('reader').style.display = 'none';
}