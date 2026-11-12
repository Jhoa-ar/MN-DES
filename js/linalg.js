// Álgebra lineal densa mínima (sin dependencias). Matrices = arreglos de filas.

export const zeros = (n) => new Array(n).fill(0);
export const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const copyM = (A) => A.map((r) => r.slice());
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const norm2 = (a) => Math.sqrt(dot(a, a));
export const matVec = (A, x) => A.map((r) => dot(r, x));
export const axpy = (alpha, x, y) => y.map((v, i) => v + alpha * x[i]);
export const subV = (a, b) => a.map((v, i) => v - b[i]);
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
export const maxAbs = (A) => Math.max(...A.flat().map(Math.abs));

/** Factorización de Cholesky A = L Lᵀ (L triangular inferior). Lanza error si A no es DP. */
export function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => zeros(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0) || !Number.isFinite(s)) throw new Error(`Cholesky: pivote no positivo en la fila ${i + 1} (A no es definida positiva).`);
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

/** Resuelve L y = b (L triangular inferior). */
export function forwardSub(L, b) {
  const n = L.length, y = zeros(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  return y;
}

/** Resuelve Lᵀ x = y. */
export function backSubT(L, y) {
  const n = L.length, x = zeros(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/** Resuelve (L Lᵀ) x = b. */
export const solveCholesky = (L, b) => backSubT(L, forwardSub(L, b));

/** Método directo alterno: eliminación de Gauss con pivoteo parcial (factorización LU). */
export function luSolve(A, b) {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) throw new Error('LU: matriz singular.');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = zeros(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}

/** Autovalores de una matriz simétrica (método de Jacobi cíclico). Devuelve arreglo ascendente. */
export function eigenSym(A) {
  const n = A.length;
  const a = copyM(A);
  let frob = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) frob += a[i][j] ** 2;
  frob = Math.sqrt(frob) || 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (Math.sqrt(off) < 1e-15 * frob) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => x - y);
}

/** Número de condición espectral de una matriz simétrica definida positiva: λmax/λmin = ‖A‖₂‖A⁻¹‖₂. */
export function cond2SPD(A) {
  const ev = eigenSym(A);
  return { eigenvalues: ev, lmin: ev[0], lmax: ev[ev.length - 1], kappa: ev[ev.length - 1] / ev[0] };
}

/**
 * Validación de A: cuadrada, finita, simétrica y definida positiva.
 * DP se verifica con el criterio de Sylvester (menores principales líderes > 0)
 * y con los autovalores (todos > 0).
 */
export function validateSPD(A, { symTol = 1e-10 } = {}) {
  const res = { ok: false, square: true, finite: true, symmetric: false, symError: 0, minors: [], eigenvalues: [], posdef: false, messages: [] };
  const n = Array.isArray(A) ? A.length : 0;
  if (n < 4) { res.messages.push('La matriz debe ser de al menos 4×4 (n ≥ 4).'); return res; }
  if (!A.every((r) => Array.isArray(r) && r.length === n)) { res.square = false; res.messages.push('La matriz A debe ser cuadrada (n×n).'); return res; }
  if (!A.flat().every(Number.isFinite)) { res.finite = false; res.messages.push('A contiene valores no numéricos o infinitos.'); return res; }

  let worst = 0, wi = 0, wj = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const scale = Math.max(Math.abs(A[i][j]), Math.abs(A[j][i]), 1e-300);
    const rel = Math.abs(A[i][j] - A[j][i]) / scale;
    if (rel > worst) { worst = rel; wi = i; wj = j; }
  }
  res.symError = worst;
  res.symmetric = worst <= symTol;
  if (!res.symmetric) {
    res.messages.push(`A no es simétrica: a${wi + 1}${wj + 1} = ${A[wi][wj]} ≠ a${wj + 1}${wi + 1} = ${A[wj][wi]}.`);
  }

  // Menores principales líderes por eliminación gaussiana sin pivoteo (producto de pivotes).
  const M = copyM(A);
  let minor = 1, minorsOK = true;
  for (let k = 0; k < n; k++) {
    const piv = M[k][k];
    minor *= piv;
    res.minors.push(minor);
    if (!(minor > 0)) minorsOK = false;
    if (Math.abs(piv) < 1e-300) { for (let r = k + 1; r < n; r++) res.minors.push(NaN); break; }
    for (let r = k + 1; r < n; r++) {
      const f = M[r][k] / piv;
      for (let c = k; c < n; c++) M[r][c] -= f * M[k][c];
    }
  }
  if (res.symmetric) {
    res.eigenvalues = eigenSym(A);
    const eigOK = res.eigenvalues[0] > 0;
    res.posdef = minorsOK && eigOK;
    if (!res.posdef) res.messages.push(`A no es definida positiva (λmín = ${res.eigenvalues[0].toExponential(3)}, menores de Sylvester ${minorsOK ? 'positivos' : 'con al menos uno ≤ 0'}).`);
  } else {
    res.posdef = false;
  }
  res.ok = res.symmetric && res.posdef;
  return res;
}
