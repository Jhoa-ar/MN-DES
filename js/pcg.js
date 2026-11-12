// Gradientes Conjugados (GC) y Gradientes Conjugados Precondicionado (GCP).
// Algoritmo según Suñagua (2020): resolver M z_k = r_k, direcciones conjugadas p_k,
// paso α_k y actualización de x_k.
import { zeros, identity, dot, norm2, matVec, subV, forwardSub, backSubT, solveCholesky, cholesky, copyM, transpose, eigenSym } from './linalg.js';

export const PRECONDITIONERS = {
  none: 'Sin precondicionar (M = I)',
  jacobi: 'Jacobi (M = diag(A))',
  ssor: 'SSOR (simétrico, parámetro ω)',
  ic0: 'Cholesky incompleto IC(0)',
};

/**
 * Construye el precondicionador M = K Kᵀ (K triangular inferior), de modo que
 * resolver M z = r se reduce a dos sustituciones triangulares.
 * Devuelve { type, name, M, K, solve(r) }.
 */
export function makePreconditioner(A, type = 'jacobi', { omega = 1 } = {}) {
  const n = A.length;
  let K;
  let name;
  if (type === 'none') {
    K = identity(n);
    name = PRECONDITIONERS.none;
  } else if (type === 'jacobi') {
    K = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Math.sqrt(A[i][i]) : 0)));
    name = PRECONDITIONERS.jacobi;
  } else if (type === 'ssor') {
    if (!(omega > 0 && omega < 2)) throw new Error('SSOR requiere 0 < ω < 2.');
    // M = 1/(ω(2−ω)) (D + ωL) D⁻¹ (D + ωLᵀ)  ⇒  K = (D + ωL) D^{-1/2} / √(ω(2−ω))
    const c = 1 / Math.sqrt(omega * (2 - omega));
    K = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        if (j > i) return 0;
        const v = i === j ? A[i][i] : omega * A[i][j];
        return (c * v) / Math.sqrt(A[j][j]);
      }),
    );
    name = `SSOR (ω = ${omega})`;
  } else if (type === 'ic0') {
    // Cholesky incompleto sin relleno: se conserva solo el patrón de ceros de A.
    K = Array.from({ length: n }, () => zeros(n));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        if (A[i][j] === 0) continue;
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= K[i][k] * K[j][k];
        if (i === j) {
          if (!(s > 0)) throw new Error('IC(0): pivote no positivo (la factorización incompleta falló).');
          K[i][j] = Math.sqrt(s);
        } else {
          K[i][j] = s / K[j][j];
        }
      }
    }
    name = PRECONDITIONERS.ic0;
  } else {
    throw new Error(`Precondicionador desconocido: ${type}`);
  }
  const M = K.map((row) => K.map((_, j) => dot(row, K[j])));
  return { type, name, M, K, solve: (r) => solveCholesky(K, r) };
}

/** κ(M⁻¹A): autovalores de K⁻¹ A K⁻ᵀ (similar a M⁻¹A y simétrica). */
export function precondCondition(A, P) {
  const n = A.length;
  // Y = K⁻¹ A (columna a columna)
  const cols = [];
  for (let j = 0; j < n; j++) cols.push(forwardSub(P.K, A.map((r) => r[j])));
  const Y = transpose(cols);
  // B = Y K⁻ᵀ = (K⁻¹ Yᵀ)ᵀ
  const Yt = transpose(Y);
  const zcols = [];
  for (let j = 0; j < n; j++) zcols.push(forwardSub(P.K, Yt.map((r) => r[j])));
  const B = transpose(transpose(zcols));
  const S = B.map((r, i) => r.map((_, j) => (B[i][j] + B[j][i]) / 2));
  const ev = eigenSym(S);
  return { eigenvalues: ev, lmin: ev[0], lmax: ev[n - 1], kappa: ev[n - 1] / ev[0] };
}

/**
 * GCP (o GC simple si P es 'none'). Criterio de parada: ‖r_k‖₂/‖b‖₂ < tol.
 * Devuelve x, iteraciones, historial de residuos relativos y pasos (α, β).
 */
export function pcg(A, b, { x0, P, tol = 1e-6, maxIter = 1000 } = {}) {
  const n = A.length;
  const M = P ?? makePreconditioner(A, 'none');
  let x = x0 ? x0.slice() : zeros(n);
  let r = subV(b, matVec(A, x));
  const normb = norm2(b);
  const out = { x, iterations: 0, converged: false, history: [], steps: [], finalResidual: NaN, reason: '' };

  if (normb === 0) {
    // b = 0 ⇒ solución exacta x = 0; el residuo relativo no está definido.
    out.x = zeros(n);
    out.converged = true;
    out.reason = 'b = 0: la solución es x = 0 (residuo relativo no definido).';
    out.history.push({ k: 0, res: 0 });
    out.finalResidual = NaN;
    return out;
  }

  let res = norm2(r) / normb;
  out.history.push({ k: 0, res });
  if (res < tol) { out.converged = true; out.finalResidual = res; out.reason = 'x0 ya cumple la tolerancia.'; return out; }

  let z = M.solve(r);
  let p = z.slice();
  let rz = dot(r, z);

  for (let k = 1; k <= maxIter; k++) {
    const Ap = matVec(A, p);
    const pAp = dot(p, Ap);
    if (!(pAp > 0)) { out.reason = 'pᵀAp ≤ 0: A no es definida positiva.'; out.iterations = k - 1; break; }
    const alpha = rz / pAp;
    x = x.map((v, i) => v + alpha * p[i]);
    r = r.map((v, i) => v - alpha * Ap[i]);
    res = norm2(r) / normb;
    out.iterations = k;
    const step = { k, alpha, beta: null, res, x: x.slice() };
    out.steps.push(step);
    out.history.push({ k, res });
    if (res < tol) { out.converged = true; out.reason = 'Tolerancia alcanzada.'; break; }
    z = M.solve(r);
    const rzNew = dot(r, z);
    const beta = rzNew / rz;
    step.beta = beta;
    p = z.map((v, i) => v + beta * p[i]);
    rz = rzNew;
    if (k === maxIter) out.reason = 'Se alcanzó el máximo de iteraciones sin cumplir la tolerancia.';
  }
  out.x = x;
  out.finalResidual = norm2(subV(b, matVec(A, x))) / normb; // residuo verdadero ‖b − Ax‖/‖b‖
  return out;
}
