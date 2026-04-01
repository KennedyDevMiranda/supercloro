

// ===== Read ?pdv= parameter =====
(function() {
    var params = new URLSearchParams(window.location.search);
    var pdv = params.get('pdv');
    if (pdv) {
        serverInput.value = pdv;
        setTimeout(conectarServidor, 500);
    }
})();

// ===== Server Connection =====
async function conectarServidor() {
    var addr = serverInput.value.trim();
    if (!addr) return;

    var base = addr.includes('://') ? addr : 'https://' + addr;
    base = base.replace(/\/+$/, '');

    conexaoOk.style.display = 'none';
    conexaoErr.style.display = 'none';
    avisoCert.style.display = 'none';
    statusEl.textContent = 'Conectando...';
    statusEl.className = 'status';

    try {
        var resp = await fetch(base + '/scan', {
            method: 'POST',
            body: 'PING',
            signal: AbortSignal.timeout(5000)
        });
        var txt = await resp.text();
        if (txt.includes('OK') || txt.includes('Conectado')) {
            serverUrl = base;
            conexaoOk.style.display = 'block';
            statusEl.textContent = 'Conectado! Iniciando camera...';
            statusEl.className = 'status ok';
            iniciar();
            return;
        }
    } catch (e) {
        if (base.startsWith('https://')) {
            var httpBase = base.replace('https://', 'http://').replace(':5556', ':5555');
            try {
                var resp2 = await fetch(httpBase + '/scan', {
                    method: 'POST',
                    body: 'PING',
                    signal: AbortSignal.timeout(5000)
                });
                var txt2 = await resp2.text();
                if (txt2.includes('OK') || txt2.includes('Conectado')) {
                    serverUrl = httpBase;
                    conexaoOk.style.display = 'block';
                    statusEl.textContent = 'Conectado (HTTP)! Iniciando camera...';
                    statusEl.className = 'status ok';
                    iniciar();
                    return;
                }
            } catch (e2) { }
        }
    }

    conexaoErr.style.display = 'block';
    avisoCert.style.display = 'block';
    linkCert.href = base + '/';
    statusEl.textContent = 'Falha na conexao. Aceite o certificado e tente novamente.';
    statusEl.className = 'status err';
}