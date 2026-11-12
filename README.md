# GCP en Finanzas · Cartera de inversión

Desafío académico de **Métodos Numéricos** (UMSA · Carrera de Informática):
aplicación del **Método de Gradientes Conjugados Precondicionado (GCP)** a un problema financiero.

- **Mención:** Inteligencia Artificial y Ciencia de Datos
- **Caso:** cartera de inversión de **n = 6 activos** y análisis de riesgo (media-varianza de Markowitz)
- **Página web:** `[PEGA AQUÍ EL ENLACE PÚBLICO]`
- **Referencia del algoritmo:** Suñagua S., P. (2020). *Método de Gradientes Conjugados Precondicionado*. Revista Boliviana de Matemática – UMSA, 04, 2–7.

## Modelo matemático

El inversionista maximiza `μᵀx − (γ/2)·xᵀΣx`. La condición de optimalidad es el sistema lineal

```
Σ x = μ / γ      ⇒      A x = b,   A = Σ (covarianzas),   b = μ/γ
```

- `x_i`: fracción del capital invertida en el activo *i* (negativa = venta en corto).
- `A` es simétrica (Cov(i,j) = Cov(j,i)) y definida positiva (la varianza de toda cartera no nula es > 0).
- Estructura de covarianza de un índice: `A_ii = σ_i²`, `A_ij = (σ_i β_i)(σ_j β_j)` con `0 < β_i < 1` (SPD por construcción).

| Escenario | Qué cambia | Qué se espera |
|---|---|---|
| **Ideal** | σ similares (8–15 %), correlaciones bajas | κ(A) ≈ 4,7; convergencia rápida |
| **Bajo estrés** | σ ↑, β ↑ (contagio), μ ↓, γ ↑ (cambian A y b) | se desplaza el equilibrio; κ(A) ≈ 16 |
| **Mal condicionado** | σ de 2 % a 90 %, β ≈ 0,93 | κ(A) ≈ 1,7·10⁴; Jacobi lo reduce a ≈ 63 |

> **Los datos (σ, β, μ, γ) son ilustrativos**, calibrados a órdenes de magnitud típicos; no provienen de una serie histórica real. Están en `js/scenarios.js`.

## Estructura del repositorio

```
index.html            Página con los 10 módulos del desafío
css/styles.css        Estilos
js/linalg.js          Cholesky, LU, autovalores (Jacobi), validación SPD (Sylvester), κ(A)
js/pcg.js             GC y GCP; precondicionadores Jacobi, SSOR, IC(0); κ(M⁻¹A)
js/analysis.js        Pipeline completo: referencia, GC, GCP, errores, condicionamiento
js/scenarios.js       Variables, parámetros financieros y construcción de A y b
js/qa.js              Casos de prueba (se ejecutan en el navegador y en Node)
js/chart.js           Gráfico de convergencia en <canvas> (sin librerías)
js/app.js             Interfaz reactiva
js/config.js          Datos del estudiante (editar)
tests/run.mjs         Ejecuta el módulo QA en consola
.github/workflows/    Despliegue automático a GitHub Pages
```

Arquitectura: el núcleo numérico (`linalg`, `pcg`, `analysis`) no depende del DOM; la interfaz solo lee/escribe el estado y llama a `analyze()`. Por eso las mismas pruebas corren en el navegador (editando celdas reales) y en Node.

## Ejecución local

No requiere instalar dependencias. Los módulos ES necesitan servirse por HTTP (no abrir `index.html` con doble clic):

```bash
python3 -m http.server 8080     # o: npm start
# abrir http://localhost:8080
```

Pruebas en consola (Node ≥ 18): `npm test`

## Publicar (GitHub Pages)

1. Edita `js/config.js` con tu nombre y registro.
2. Sube el repositorio a GitHub (rama `main`).
3. *Settings → Pages → Source: GitHub Actions*. El workflow `pages.yml` corre las pruebas y publica el sitio.

## Módulo QA

Pruebas incluidas (sección 9 de la web): carga de los 3 escenarios, matriz no simétrica / no definida positiva / entrada no numérica, edición dinámica de coeficientes, comparación GCP vs GC en el escenario mal condicionado, coincidencia Cholesky–LU, criterio de parada, casos límite (x₀ ≠ 0, b = 0) y desplazamiento del equilibrio por estrés.

## Notas

- Criterio de parada: `‖r_k‖₂/‖b‖₂ < 10⁻⁶`, con `N_máx` configurable.
- En una matriz densa, IC(0) no descarta elementos y equivale a Cholesky completo (converge en 1 iteración); se incluye para comparar, pero solo es útil en matrices dispersas.
- Con n = 6, el GC simple también termina en pocos pasos (terminación finita); la mejora del precondicionamiento se ve sobre todo en κ(M⁻¹A).
