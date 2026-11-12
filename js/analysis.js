// Pipeline numérico completo, independiente de la interfaz (lo usan la web, el QA y los tests de Node).
import { validateSPD, cholesky, solveCholesky, luSolve, cond2SPD, norm2, matVec, subV } from './linalg.js';
import { makePreconditioner, precondCondition, pcg } from './pcg.js';

/** Errores por componente y residuo relativo global. */
export function errorTable(xref, x, A, b) {
  const rows = xref.map((xr, i) => {
    const ea = Math.abs(xr - x[i]);
    const defined = Math.abs(xr) > 1e-300;
    const er = defined ? ea / Math.abs(xr) : null;
    return { i, xref: xr, x: x[i], ea, er, ep: er === null ? null : er * 100 };
  });
  const nb = norm2(b);
  const residual = nb === 0 ? null : norm2(subV(b, matVec(A, x))) / nb;
  return { rows, residual };
}

/** Ejecuta todo el análisis para un sistema Ax = b. Nunca lanza: devuelve { ok:false, errors } si hay problema. */
export function analyze(inp) {
  const out = { ok: false, errors: [], input: inp };
  const { A, b, tol = 1e-6, maxIter = 1000, precond = 'jacobi', omega = 1 } = inp;
  const n = A?.length ?? 0;
  const x0 = inp.x0 ?? new Array(n).fill(0);

  try {
    if (!Array.isArray(b) || b.length !== n || !b.every(Number.isFinite)) {
      out.errors.push('El vector b debe tener n valores numéricos.');
      return out;
    }
    if (!x0.every(Number.isFinite) || x0.length !== n) { out.errors.push('El vector inicial x0 debe tener n valores numéricos.'); return out; }
    if (!(tol > 0) || !Number.isFinite(tol)) { out.errors.push('La tolerancia debe ser un número positivo.'); return out; }
    if (!(maxIter >= 1)) { out.errors.push('El máximo de iteraciones debe ser ≥ 1.'); return out; }

    const validation = validateSPD(A);
    out.validation = validation;
    if (!validation.ok) { out.errors.push(...validation.messages); return out; }

    // Solución numérica de referencia (método directo)
    const L = cholesky(A);
    const xChol = solveCholesky(L, b);
    const xLU = luSolve(A, b);
    out.ref = { x: xChol, xLU, L, name: 'Cholesky (A = L·Lᵀ)', diffLU: norm2(subV(xChol, xLU)) };

    // GCP y GC simple
    const P = makePreconditioner(A, precond, { omega });
    const P0 = makePreconditioner(A, 'none');
    out.precond = P;
    out.gcp = pcg(A, b, { x0, P, tol, maxIter });
    out.gc = pcg(A, b, { x0, P: P0, tol, maxIter });

    // Condicionamiento
    out.kappaA = cond2SPD(A);
    out.kappaMA = precondCondition(A, P);

    // Errores
    out.errGCP = errorTable(xChol, out.gcp.x, A, b);
    out.errGC = errorTable(xChol, out.gc.x, A, b);
    out.errRef = errorTable(xChol, xChol, A, b);

    // Comparación de todos los precondicionadores sobre el mismo sistema
    out.compare = ['none', 'jacobi', 'ssor', 'ic0'].map((t) => {
      try {
        const Pt = makePreconditioner(A, t, { omega });
        const r = pcg(A, b, { x0, P: Pt, tol, maxIter });
        return { type: t, name: Pt.name, iterations: r.iterations, converged: r.converged, residual: r.finalResidual, kappa: precondCondition(A, Pt).kappa };
      } catch (e) {
        return { type: t, name: t, error: e.message };
      }
    });

    out.ok = true;
    return out;
  } catch (e) {
    out.errors.push(`Error numérico: ${e.message}`);
    return out;
  }
}
