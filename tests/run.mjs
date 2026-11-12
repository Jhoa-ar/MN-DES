// Ejecuta el módulo QA en Node: `npm test`
import { runTests, nodeDriver } from '../js/qa.js';

const results = runTests(nodeDriver());
let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? '✔' : '✘'} ${r.id}  ${r.name}\n    obtenido: ${r.obtained}`);
}
console.log(`\n${results.length - fails}/${results.length} pruebas aprobadas`);
process.exit(fails ? 1 : 0);
