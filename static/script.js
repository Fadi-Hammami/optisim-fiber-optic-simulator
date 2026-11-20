/* ══════════════════════════════════════════════════════════════
   OPTISIM — script.js
   Canvas rendering + API calls + fiber type auto-fill
   ══════════════════════════════════════════════════════════════ */

/* ─── COLOUR PALETTE ─── */
const C = {
  bg:       '#050d12',
  panel:    '#080f16',
  border:   '#1a3a50',
  glow:     '#0e6a8a',
  green:    '#00e5a0',
  greenDim: '#007a55',
  cyan:     '#3a9fff',
  cyanBrt:  '#00cfff',
  amber:    '#ffb800',
  red:      '#ff3b5c',
  redDim:   '#7a1a2a',
  text:     '#c8dde8',
  textDim:  '#4a6a7a',
  white:    '#e8f4fa',
};

/* ─── HELPERS ─── */
const $ = id => document.getElementById(id);

function showLoading() {
  let d = document.createElement('div');
  d.className = 'loading-overlay'; d.id = 'loadingOverlay';
  d.innerHTML = '<div class="loading-box"><div class="spinner"></div>SIMULATION EN COURS…</div>';
  document.body.appendChild(d);
}
function hideLoading() { const d = $('loadingOverlay'); if (d) d.remove(); }
function setStatus(state, label) {
  const dot = $('statusDot'), lbl = $('statusLabel');
  dot.className = 'dot ' + state;
  lbl.textContent = label;
}
function showError(msg) {
  const b = $('errorBox');
  b.style.display = 'block';
  b.textContent = '⚠ ' + msg;
}
function clearError() { $('errorBox').style.display = 'none'; }

/* ──────────────────────────────────────────────────────────────
   FIBER TYPE AUTO-FILL
   ────────────────────────────────────────────────────────────── */
function onFibreTypeChange() {
  const type   = $('type_fibre').value;
  const lambda = parseFloat($('lambda_nm').value) || 1310;
  const dField = $('D');
  const hint   = $('D_hint');
  const alphaF = $('alpha');
  const intermodalFields = $('intermodal_fields');
  const intermodalHint   = $('intermodal_hint');

  if (type.includes('Monomode')) {
    if (lambda < 1400) {
      dField.value = 17;
      alphaF.value = 0.35;
      hint.textContent = 'SMF G.652 — valeur typique à 1310 nm';
    } else {
      dField.value = 18;
      alphaF.value = 0.20;
      hint.textContent = 'SMF G.652 — valeur typique à 1550 nm';
    }
    dField.classList.remove('manual-entry');
    intermodalFields.style.display = 'none';
  } else if (type.includes('FSI')) {
    dField.value = 0;
    alphaF.value = 0.25;
    dField.classList.add('manual-entry');
    hint.textContent = '⚡ FSI G.653 — entrez la dispersion réelle de votre fibre';
    intermodalFields.style.display = 'block';
    $('n_fibre').value = 1.46;
    $('delta_relative').value = 0.01;
    intermodalHint.textContent = 'FSI : Δτim = (n / c) × Δ × L';
  } else if (type.includes('FGI')) {
    dField.value = 4;
    alphaF.value = 0.22;
    dField.classList.add('manual-entry');
    hint.textContent = '⚡ FGI G.655 — entrez la dispersion réelle de votre fibre';
    intermodalFields.style.display = 'block';
    $('n_fibre').value = 1.46;
    $('delta_relative').value = 0.01;
    intermodalHint.textContent = 'FGI : Δτim = (n / 8c) × Δ² × L';
  }
}

function onLambdaChange() {
  if ($('type_fibre').value.includes('Monomode')) {
    onFibreTypeChange();
  }
}

/* ──────────────────────────────────────────────────────────────
   MAIN SIMULATE FUNCTION
   ────────────────────────────────────────────────────────────── */
async function simulate() {
  clearError();
  setStatus('wait', 'CALCUL…');
  showLoading();
  const btn = $('simBtn');
  btn.disabled = true;

  const type = $('type_fibre').value;
  const isMultimode = type.includes('FSI') || type.includes('FGI');

  const payload = {
    lambda_nm     : +$('lambda_nm').value,
    P_tx          : +$('P_tx').value,
    delta_lambda  : +$('delta_lambda').value,
    type_codage   : $('type_codage').value,
    type_fibre    : type,
    L             : +$('L').value,
    nb_ep         : +$('nb_ep').value,
    alpha         : +$('alpha').value,
    D             : +$('D').value,
    perte_ep      : +$('perte_ep').value,
    perte_conn    : +$('perte_conn').value,
    sensibilite   : +$('sensibilite').value,
    P_min         : +$('P_min').value,
    debit         : +$('debit').value,
    n_fibre       : isMultimode ? +$('n_fibre').value : 1.46,
    delta_relative: isMultimode ? +$('delta_relative').value : 0.0,
  };

  try {
    const resp = await fetch('/simulate', {
      method : 'POST',
      headers: {'Content-Type': 'application/json'},
      body   : JSON.stringify(payload),
    });
    const res = await resp.json();
    if (res.error) {
      showError(res.error);
      setStatus('', 'ERREUR');
      return;
    }
    renderAll(res);
    setStatus(res.liaison_ok ? 'ok' : 'fail',
              res.liaison_ok ? 'FONCTIONNELLE' : 'NON FONCTIONNELLE');
  } catch (e) {
    showError('Erreur de connexion au serveur : ' + e.message);
    setStatus('', 'ERREUR');
  } finally {
    hideLoading();
    btn.disabled = false;
  }
}

/* ──────────────────────────────────────────────────────────────
   RENDER ALL RESULTS
   ────────────────────────────────────────────────────────────── */
function renderAll(r) {
  renderVerdict(r);
  renderSchema(r);
  renderTemporalCurve(r);
  renderBilanPuissance(r);
  renderBilanDispersion(r);
  renderPieChart(r);
}

/* ──────────────────────────────────────────────────────────────
   VERDICT  (fonctionnalité = bilan puissance uniquement)
   ────────────────────────────────────────────────────────────── */
function renderVerdict(r) {
  const panel = $('verdictPanel');
  const ok    = r.liaison_ok;
  const icon  = ok ? '✓' : '✗';
  const cls   = ok ? 'verdict-ok' : 'verdict-fail';
  const txt   = ok ? 'LIAISON FONCTIONNELLE' : 'LIAISON NON FONCTIONNELLE';

  const pOk = r.puissance_ok
    ? `<span class="vstat-val ok">OK ✓</span>`
    : `<span class="vstat-val fail">NON ✗</span>`;

  panel.innerHTML = `
    <div class="verdict-content ${cls}">
      <div class="verdict-icon">${icon}</div>
      <div>
        <div class="verdict-title">${txt}</div>
        <div class="verdict-stats">
          <div class="vstat"><span class="vstat-label">P reçue</span>
            <span class="vstat-val ${r.P_rx >= r.sensibilite ? 'ok' : 'fail'}">${r.P_rx.toFixed(2)} dBm</span></div>
          <div class="vstat"><span class="vstat-label">Sensibilité</span>
            <span class="vstat-val">${r.sensibilite.toFixed(2)} dBm</span></div>
          <div class="vstat"><span class="vstat-label">Marge</span>
            <span class="vstat-val ${r.marge >= 0 ? 'ok' : 'fail'}">${r.marge >= 0 ? '+' : ''}${r.marge.toFixed(2)} dB</span></div>
          <div class="vstat"><span class="vstat-label">Bilan puissance</span>${pOk}</div>
        </div>
      </div>
    </div>`;
}

/* ──────────────────────────────────────────────────────────────
   SCHEMA DE LIAISON
   ────────────────────────────────────────────────────────────── */
function renderSchema(r) {
  const canvas = $('schemaCanvas');
  const W = canvas.offsetWidth || 880;
  canvas.width  = W;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, canvas.height);
  const H = canvas.height;
  const midY = H / 2;

  // Grid background
  ctx.strokeStyle = '#0a1e2a'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  const fiberX1 = 185, fiberX2 = W - 185;

  // Fibre line (glow)
  ctx.beginPath();
  ctx.strokeStyle = C.green; ctx.lineWidth = 4;
  ctx.shadowColor = C.green; ctx.shadowBlur = 8;
  ctx.moveTo(fiberX1, midY); ctx.lineTo(fiberX2, midY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  function drawBlock(x, y, w, h, fill, stroke, glow, label, sub) {
    ctx.shadowColor = glow; ctx.shadowBlur = 14;
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
    roundRect(ctx, x - w/2, y - h/2, w, h, 6);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Exo 2", sans-serif';
    ctx.fillText(label, x, sub ? y - 6 : y);
    if (sub) {
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(sub, x, y + 8);
    }
  }

  // Émetteur
  drawBlock(90, midY, 140, 60, '#0d2a2f', C.cyanBrt, C.cyanBrt,
            'ÉMETTEUR', `P_tx = ${r.P_tx} dBm`);
  // Connecteur 1
  drawBlock(fiberX1, midY, 48, 34, '#0a1e3a', '#2980B9', '#2980B9', 'C₁', '');
  // Connecteur 2
  drawBlock(fiberX2, midY, 48, 34, '#0a1e3a', '#2980B9', '#2980B9', 'C₂', '');
  // Récepteur
  drawBlock(W - 90, midY, 140, 60, '#1a0d2a', '#8E44AD', '#8E44AD',
            'RÉCEPTEUR', `P_rx = ${r.P_rx.toFixed(2)} dBm`);

  // Épissures
  if (r.nb_ep > 0) {
    const positions = linspace(fiberX1 + 80, fiberX2 - 80, r.nb_ep);
    positions.forEach((sx) => {
      drawBlock(sx, midY, 26, 26, '#1e1200', C.amber, C.amber, 'É', '');
    });
  }

  // Label fibre
  ctx.fillStyle = C.cyanBrt; ctx.textAlign = 'center';
  ctx.font = '11px "Share Tech Mono", monospace';
  ctx.fillText(`${r.type_fibre}  |  L = ${r.L} km  |  α = ${r.bilan.perte_fibre.toFixed(2)} dB`, W / 2, midY - 28);

  // Boîte cable plant
  ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.rect(fiberX1 - 28, midY - 46, fiberX2 - fiberX1 + 56, 92); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.textDim; ctx.font = '10px "Share Tech Mono", monospace';
  ctx.fillText('— Cable Plant —', W / 2, midY + 40);
}

/* ──────────────────────────────────────────────────────────────
   COURBE TEMPORELLE — ÉLARGISSEMENT GAUSSIEN
   ────────────────────────────────────────────────────────────── */
function renderTemporalCurve(r) {
  const canvas = $('temporalCanvas');
  const W = canvas.offsetWidth || 880;
  canvas.width  = W;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, canvas.height);

  const td = r.temporal;
  if (!td || !td.curves || td.curves.length === 0) return;

  const pad = { top: 36, right: 172, bottom: 50, left: 72 };
  const plotW = W - pad.left - pad.right;
  const plotH = canvas.height - pad.top - pad.bottom;

  const t    = td.t_ns;
  const tMin = t[0], tMax = t[t.length - 1];
  const yMax = Math.max(...td.curves.map(c => c.peak_uW)) * 1.18;
  const yMin = 0;

  function toX(v) { return pad.left + (v - tMin) / (tMax - tMin) * plotW; }
  function toY(p) { return pad.top  + (1 - (p - yMin) / (yMax - yMin)) * plotH; }

  // Plot background
  ctx.fillStyle = '#020c12';
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  // Grid
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1;
  const ySteps = 6, xSteps = 8;

  for (let i = 0; i <= ySteps; i++) {
    const yy = pad.top + i * plotH / ySteps;
    const val = yMax * (1 - i / ySteps);
    ctx.strokeStyle = '#0d2535';
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + plotW, yy); ctx.stroke();
    ctx.fillStyle = C.textDim; ctx.textAlign = 'right'; ctx.font = '10px "Share Tech Mono"';
    ctx.fillText(fmtPowerUW(val), pad.left - 5, yy + 4);
  }

  for (let i = 0; i <= xSteps; i++) {
    const xx  = pad.left + i * plotW / xSteps;
    const val = tMin + i * (tMax - tMin) / xSteps;
    ctx.strokeStyle = '#0d2535';
    ctx.beginPath(); ctx.moveTo(xx, pad.top); ctx.lineTo(xx, pad.top + plotH); ctx.stroke();
    ctx.fillStyle = C.textDim; ctx.textAlign = 'center'; ctx.font = '10px "Share Tech Mono"';
    ctx.fillText(val.toFixed(1) + 'n', xx, pad.top + plotH + 16);
  }
  ctx.setLineDash([]);

  // Bit period indicator (Tb)
  const tbX = toX(td.T_bit_ns + (t[0]));
  if (tbX > pad.left && tbX < pad.left + plotW) {
    ctx.strokeStyle = 'rgba(255,184,0,0.25)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(toX(t[0] + td.T_bit_ns * 0.5), pad.top);
    ctx.lineTo(toX(t[0] + td.T_bit_ns * 0.5), pad.top + plotH); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Gaussian curves
  const n = td.curves.length;
  function curveColor(idx) {
    if (idx === 0)     return '#3a9fff';
    if (idx === n - 1) return '#00e5a0';
    const grays = ['#d8d8d8', '#b8b8b8', '#989898', '#787878'];
    return grays[Math.min(idx - 1, grays.length - 1)];
  }

  td.curves.forEach((curve, idx) => {
    const color = curveColor(idx);
    const isFirst = idx === 0;
    const isLast  = idx === n - 1;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = (isFirst || isLast) ? 2.4 : 1.8;

    if (isFirst)       { ctx.shadowColor = '#3a9fff'; ctx.shadowBlur = 6; }
    else if (isLast)   { ctx.shadowColor = '#00e5a0'; ctx.shadowBlur = 5; }
    else               { ctx.shadowBlur = 0; }

    curve.points_y.forEach((py, i) => {
      const px = toX(t[i]), pp = toY(py);
      i === 0 ? ctx.moveTo(px, pp) : ctx.lineTo(px, pp);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    const lx = pad.left + plotW + 8;
    const ly = pad.top + 14 + idx * 16;
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 8, 10, 10);
    ctx.fillStyle = color;
    ctx.font      = '10px "Share Tech Mono"';
    ctx.textAlign = 'left';
    ctx.fillText(curve.label, lx + 14, ly);
  });

  // Axis labels
  ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.font = '11px "Exo 2"';
  ctx.fillText('Time (s)', pad.left + plotW / 2, canvas.height - 6);
  ctx.save();
  ctx.translate(13, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Power (W)', 0, 0);
  ctx.restore();

  // Dispersion info box
  const infoX = pad.left + 6, infoY = pad.top + 10;
  ctx.fillStyle = 'rgba(0,12,20,0.7)';
  ctx.fillRect(infoX - 2, infoY - 10, 210, 46);
  ctx.fillStyle = C.textDim; ctx.textAlign = 'left'; ctx.font = '9px "Share Tech Mono"';
  const s0ps   = (td.sigma0_ns * 1000).toFixed(1);
  const soutps = (td.sigma_out_ns * 1000).toFixed(1);
  const sDps   = td.sigma_D_ps.toFixed(1);
  ctx.fillText(`σ₀ = ${s0ps} ps  (largeur initiale)`, infoX, infoY);
  ctx.fillText(`σD = ${sDps} ps  (élargissement)`, infoX, infoY + 13);
  ctx.fillText(`σout = ${soutps} ps  (largeur finale)`, infoX, infoY + 26);

  // Border
  ctx.strokeStyle = C.border; ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);
}

/* Formate une valeur en µW */
function fmtPowerUW(uW) {
  if (uW <= 0) return '0';
  if (uW >= 1e6)  return (uW / 1e6).toFixed(2) + 'W';
  if (uW >= 1000) return (uW / 1000).toFixed(2) + 'm';
  if (uW >= 1)    return uW.toFixed(2) + 'µ';
  if (uW >= 0.001) return (uW * 1000).toFixed(2) + 'n';
  return uW.toExponential(1);
}

/* ──────────────────────────────────────────────────────────────
   BILAN DE PUISSANCE
   Vérification : P_tx - P_rx = Σ pertes
   ────────────────────────────────────────────────────────────── */
function renderBilanPuissance(r) {
  const b = r.bilan, m = r.marge;
  const verif = (r.P_tx - r.P_rx).toFixed(2);
  $('bilanPuissance').innerHTML = `
    <div class="row"><span class="key">P émise (P<sub>tx</sub>)</span><span class="val">${r.P_tx.toFixed(2)} dBm</span></div>
    <hr class="sep">
    <div class="row"><span class="key">Perte fibre (α·L)</span><span class="val warn">+${b.perte_fibre.toFixed(2)} dB</span></div>
    <div class="row"><span class="key">Perte épissures</span><span class="val warn">+${b.perte_epissures.toFixed(2)} dB</span></div>
    <div class="row"><span class="key">Perte connecteurs (×2)</span><span class="val warn">+${b.perte_connecteurs.toFixed(2)} dB</span></div>
    <hr class="sep">
    <div class="row"><span class="key">Σ Pertes totales</span><span class="val fail">${b.perte_totale.toFixed(2)} dB</span></div>
    <div class="row hint-row"><span class="key">P<sub>tx</sub> − P<sub>rx</sub> = Σ pertes</span><span class="val ${Math.abs(parseFloat(verif) - b.perte_totale) < 0.01 ? 'ok' : 'fail'}">${verif} dB ✓</span></div>
    <hr class="sep">
    <div class="row"><span class="key">P reçue (P<sub>rx</sub>)</span><span class="val ${r.P_rx >= r.sensibilite ? 'ok' : 'fail'}">${r.P_rx.toFixed(2)} dBm</span></div>
    <div class="row"><span class="key">P<sub>min</sub> récepteur</span><span class="val">${r.P_min.toFixed(2)} dBm</span></div>
    <div class="row"><span class="key">Sensibilité</span><span class="val">${r.sensibilite.toFixed(2)} dBm</span></div>
    <hr class="sep">
    <div class="row"><span class="key">MARGE</span><span class="val ${m >= 0 ? 'ok' : 'fail'}">${m >= 0 ? '+' : ''}${m.toFixed(2)} dB</span></div>`;
}

/* ──────────────────────────────────────────────────────────────
   BILAN DE DISPERSION
   ────────────────────────────────────────────────────────────── */
function renderBilanDispersion(r) {
  const d = r.dispersion;
  const isMultimode = r.type_fibre.includes('FSI') || r.type_fibre.includes('FGI');

  let intermodalRow = '';
  if (isMultimode) {
    const formula = r.type_fibre.includes('FSI')
      ? 'Δτim = (n/c)·Δ·L'
      : 'Δτim = (n/8c)·Δ²·L';
    intermodalRow = `
      <div class="row"><span class="key">Disp. intermodale (${formula})</span><span class="val">${d.delta_tau_im_ns.toFixed(4)} ns</span></div>`;
  } else {
    intermodalRow = `
      <div class="row"><span class="key">Disp. intermodale</span><span class="val dim">0 ns (monomode)</span></div>`;
  }

  const bpVal = d.bande_passante_ghz !== null
    ? `${d.bande_passante_ghz.toFixed(3)} GHz`
    : '∞ (disp. nulle)';

  $('bilanDispersion').innerHTML = `
    <div class="row"><span class="key">Disp. chromatique (D·L·Δλ)</span><span class="val">${d.sigma_chrom_ps.toFixed(2)} ps = ${d.sigma_chrom_ns.toFixed(4)} ns</span></div>
    ${intermodalRow}
    <hr class="sep">
    <div class="row"><span class="key">Disp. totale = √(σ²chrom + Δτ²im)</span><span class="val amber">${d.dispersion_totale_ns.toFixed(4)} ns</span></div>
    <hr class="sep">
    <div class="row"><span class="key">Type de codage</span><span class="val">${d.type_codage} (k = ${d.coding_val})</span></div>
    <div class="row"><span class="key">Bande passante = k / disp. totale</span><span class="val ok">${bpVal}</span></div>`;
}

/* ──────────────────────────────────────────────────────────────
   DIAGRAMME CIRCULAIRE (pertes)
   ────────────────────────────────────────────────────────────── */
function renderPieChart(r) {
  const canvas = $('pieCanvas');
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const data = [
    { label: 'Fibre',       val: r.bilan.perte_fibre,       color: C.green },
    { label: 'Épissures',   val: r.bilan.perte_epissures,   color: C.amber },
    { label: 'Connecteurs', val: r.bilan.perte_connecteurs, color: C.cyanBrt },
  ].filter(d => d.val > 0);

  const total = data.reduce((s, d) => s + d.val, 0);
  if (total === 0) return;

  const cx = W / 2, cy = H / 2 - 14, rad = 68;
  let angle = -Math.PI / 2;

  data.forEach(seg => {
    const slice = (seg.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle   = seg.color + 'cc'; ctx.fill();
    ctx.strokeStyle = C.bg; ctx.lineWidth = 2; ctx.stroke();

    const mid = angle + slice / 2;
    const lx  = cx + Math.cos(mid) * rad * 0.62;
    const ly  = cy + Math.sin(mid) * rad * 0.62;
    ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.font = 'bold 11px "Exo 2"';
    ctx.fillText(((seg.val / total) * 100).toFixed(0) + '%', lx, ly + 4);
    angle += slice;
  });

  // Legend
  let legendY = cy + rad + 14;
  data.forEach(seg => {
    ctx.fillStyle = seg.color; ctx.fillRect(cx - 62, legendY - 7, 10, 10);
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.font = '10px "Share Tech Mono"';
    ctx.fillText(`${seg.label} (${seg.val.toFixed(2)} dB)`, cx - 48, legendY + 3);
    legendY += 16;
  });
}

/* ──────────────────────────────────────────────────────────────
   CANVAS UTILITY FUNCTIONS
   ────────────────────────────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r);  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);    ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r);      ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function linspace(start, end, n) {
  if (n === 1) return [(start + end) / 2];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + i * step);
}

/* ──────────────────────────────────────────────────────────────
   INIT
   ────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  onFibreTypeChange();
});
