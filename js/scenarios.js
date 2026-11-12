// Modelo financiero: cartera de inversión media-varianza sin restricciones (Markowitz).
//
//   maximizar   μᵀx − (γ/2) xᵀΣx      ⇒   Σ x = μ / γ        (A = Σ,  b = μ/γ)
//
// x_i  : fracción del capital asignada al activo i (negativo = venta en corto).
// A_ij : covarianza anual entre los activos i y j (matriz simétrica y definida positiva).
// b_i  : rendimiento esperado en exceso, μ_i, escalado por la aversión al riesgo γ.
//
// Estructura de covarianza (modelo de un índice): A_ii = σ_i², A_ij = (σ_i β_i)(σ_j β_j) con 0 < β < 1,
// lo que equivale a correlaciones ρ_ij = β_i β_j. Con β_i < 1 la matriz es SPD por construcción.

export const ASSETS = [
  { id: 'x1', short: 'Bonos', name: 'Bonos soberanos / renta fija', note: 'Activo defensivo, baja volatilidad.' },
  { id: 'x2', short: 'Banca', name: 'Acciones del sector bancario', note: 'Sensible a tasas y mora.' },
  { id: 'x3', short: 'Consumo', name: 'Acciones de consumo masivo', note: 'Demanda relativamente estable.' },
  { id: 'x4', short: 'Industria', name: 'Acciones industriales / manufactura', note: 'Ligada al ciclo económico.' },
  { id: 'x5', short: 'Energía', name: 'Energía e hidrocarburos', note: 'Expuesta a precios de materias primas.' },
  { id: 'x6', short: 'Minería', name: 'Minería (commodities)', note: 'Alta volatilidad, ciclo de precios.' },
];

export const GAMMA_NOTE = 'γ = coeficiente de aversión al riesgo del inversionista.';

export const SCENARIO_DEFS = {
  ideal: {
    id: 'ideal',
    name: 'Ideal',
    badge: 'Mercado estable',
    sigma: [0.08, 0.10, 0.11, 0.12, 0.14, 0.15],
    beta: [0.30, 0.40, 0.40, 0.45, 0.40, 0.35],
    mu: [0.020, 0.040, 0.035, 0.045, 0.055, 0.050],
    gamma: 10,
    precond: 'jacobi',
    justification:
      'Mercado estable: volatilidades del mismo orden de magnitud (8 %–15 %) y correlaciones bajas (≈ 0,12–0,20), por lo que ' +
      'la diversificación funciona y la covarianza está bien escalada. Resulta una matriz bien condicionada (κ(A) pequeño).',
  },
  stress: {
    id: 'stress',
    name: 'Bajo estrés financiero',
    badge: 'Inflación + shock de mercado',
    sigma: [0.10, 0.18, 0.17, 0.20, 0.26, 0.28],
    beta: [0.40, 0.70, 0.65, 0.70, 0.65, 0.60],
    mu: [0.015, 0.010, 0.020, 0.010, 0.030, 0.035],
    gamma: 12,
    precond: 'jacobi',
    justification:
      'Shock de inflación y costos: las volatilidades suben entre 25 % y 90 % y las correlaciones aumentan (en las crisis los activos ' +
      'se mueven juntos, β más alto). Además los rendimientos en exceso caen y la aversión al riesgo sube de γ = 10 a γ = 12. ' +
      'Cambian tanto A como b: se estudia si solo se desplaza el punto de equilibrio o si también empeora el condicionamiento.',
  },
  ill: {
    id: 'ill',
    name: 'Mal condicionado',
    badge: 'Mal escalamiento + contagio',
    sigma: [0.02, 0.06, 0.12, 0.25, 0.50, 0.90],
    beta: [0.93, 0.95, 0.90, 0.96, 0.94, 0.92],
    mu: [0.003, 0.020, 0.040, 0.060, 0.080, 0.100],
    gamma: 10,
    precond: 'jacobi',
    justification:
      'Mercado fragmentado: la volatilidad de los activos difiere en más de un orden de magnitud (2 % para bonos frente a 90 % para minería en ' +
      'episodios extremos) y existe fuerte contagio (ρ ≈ 0,90). El mal escalamiento diagonal hace κ(A) ≫ 1. Como el problema principal es la ' +
      'escala diagonal, se usa Jacobi por defecto; SSOR e IC(0) se comparan como alternativas.',
  },
};

export const SCENARIO_ORDER = ['ideal', 'stress', 'ill'];

const r8 = (v) => Number(v.toPrecision(8));

/** Construye A (simétrica exacta) y b a partir de los parámetros financieros. */
export function buildScenario(def) {
  const n = def.sigma.length;
  const s = def.sigma.map((sg, i) => sg * def.beta[i]);
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? r8(def.sigma[i] ** 2) : r8(s[i] * s[j]))),
  );
  const b = def.mu.map((m) => r8(m / def.gamma));
  return { A, b };
}

export function correlationMatrix(def) {
  const n = def.sigma.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : def.beta[i] * def.beta[j])));
}
