// Gráfico de convergencia (residuo relativo vs iteración, eje Y logarítmico) en canvas, sin dependencias.

export function drawConvergence(canvas, series, tol) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 320;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssW, cssH);

  const m = { l: 64, r: 16, t: 16, b: 40 };
  const W = cssW - m.l - m.r, H = cssH - m.t - m.b;
  const lg = (v) => Math.log10(Math.max(v, 1e-12)); // se recorta en 1e-12 para que el eje sea legible
  const maxK = Math.max(1, ...series.map((s) => s.data[s.data.length - 1].k));
  const all = series.flatMap((s) => s.data.map((d) => lg(d.res)));
  all.push(lg(tol));
  let yMax = Math.ceil(Math.max(...all, 0));
  let yMin = Math.floor(Math.min(...all));
  if (yMax === yMin) yMax = yMin + 1;
  const X = (k) => m.l + (k / maxK) * W;
  const Y = (v) => m.t + ((yMax - lg(v)) / (yMax - yMin)) * H;

  g.font = '12px system-ui, sans-serif';
  g.fillStyle = '#475569';
  g.strokeStyle = '#e2e8f0';
  g.lineWidth = 1;
  for (let e = yMin; e <= yMax; e++) {
    const y = m.t + ((yMax - e) / (yMax - yMin)) * H;
    g.beginPath(); g.moveTo(m.l, y); g.lineTo(m.l + W, y); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(`1e${e}`, m.l - 6, y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let k = 0; k <= maxK; k++) {
    if (maxK > 20 && k % Math.ceil(maxK / 10) !== 0) continue;
    g.fillText(String(k), X(k), m.t + H + 6);
  }
  g.fillText('Iteración k', m.l + W / 2, m.t + H + 22);
  g.save();
  g.translate(12, m.t + H / 2); g.rotate(-Math.PI / 2);
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillText('‖r_k‖₂ / ‖b‖₂', 0, 0);
  g.restore();

  // Línea de tolerancia
  g.setLineDash([6, 4]);
  g.strokeStyle = '#16a34a';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(m.l, Y(tol)); g.lineTo(m.l + W, Y(tol)); g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#16a34a';
  g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(`tol = ${Number(tol).toExponential(0)}`, m.l + 6, Y(tol) - 3);

  // Series
  for (const s of series) {
    g.strokeStyle = s.color;
    g.fillStyle = s.color;
    g.lineWidth = 2;
    g.beginPath();
    s.data.forEach((d, i) => (i ? g.lineTo(X(d.k), Y(d.res)) : g.moveTo(X(d.k), Y(d.res))));
    g.stroke();
    for (const d of s.data) { g.beginPath(); g.arc(X(d.k), Y(d.res), 3.2, 0, 2 * Math.PI); g.fill(); }
  }

  // Leyenda
  let lx = m.l + W - 8;
  g.textAlign = 'right'; g.textBaseline = 'top';
  [...series].reverse().forEach((s, idx) => {
    const y = m.t + 4 + idx * 18;
    g.fillStyle = '#0f172a';
    g.fillText(s.label, lx, y);
    const w = g.measureText(s.label).width;
    g.fillStyle = s.color;
    g.fillRect(lx - w - 22, y + 4, 14, 4);
  });
}
