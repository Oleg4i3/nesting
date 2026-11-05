// node render_example.js  -> examples/*.json + examples/example.png
const fs = require('fs'), N = require('./raster.js'), P = require('./puzzle.js');
const { chromium } = require('playwright');
fs.mkdirSync('examples', { recursive: true });
const pz = P.generate({ width: 300, length: 500, pieces: 10, wiggle: 0.6, waste: 0, seed: 3 });
const gr = P.solveGreedy(pz.pieces, pz.rules, { width: 300, maxLength: 3000 });
const greedyPolys = P.placementsToPolys(pz.pieces, gr.placements);
const save = (n, polys) => fs.writeFileSync('examples/' + n, JSON.stringify({ polygons: polys.map(p => ({ vertices: p.vertices, bezierControls: p.bezierControls })) }, null, 2));
save('puzzle_solution.json', pz.originals);
save('puzzle_greedy.json', greedyPolys);
// вхід: розкласти у ряд, щоб не накладалися (лише для показу)
let x = 0, y = 0, rowH = 0; const shelf = [];
pz.pieces.forEach(p => { const b = N.curveBBox(p), w = b.maxX - b.minX, h = b.maxY - b.minY; if (x + w > 500) { x = 0; y += rowH + 10; rowH = 0; } shelf.push(N.translatePoly(p, x - b.minX, y - b.minY)); x += w + 10; rowH = Math.max(rowH, h); });
save('puzzle_input.json', shelf);

const path = p => { const v = p.vertices; let d = `M${v[0].x},${v[0].y}`; v.forEach((a, i) => { const b = v[(i + 1) % v.length], c = p.bezierControls && p.bezierControls[i]; d += c ? `C${c.x},${c.y} ${c.x},${c.y} ${b.x},${b.y}` : `L${b.x},${b.y}`; }); return d + 'Z'; };
const col = i => `hsl(${(i * 47) % 360},55%,72%)`;
const panel = (polys, title, w, h, ox) => `<g transform="translate(${ox},30)"><text y="-10" font-size="14" font-family="sans-serif">${title}</text><rect width="${w}" height="${h}" fill="#fff" stroke="#999"/>${polys.map((p, i) => `<path d="${path(p)}" fill="${col(i)}" stroke="#333" stroke-width="1"/>`).join('')}</g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="${Math.max(gr.lengthPx, 500) + 50}"><rect width="100%" height="100%" fill="#f4f4f4"/>
${panel(shelf, 'Вхід (деталі довільно повернуті/віддзеркалені)', 500, 500, 10)}
${panel(pz.originals, 'Еталон: 100%, довжина ' + pz.meta.plantedLength, 300, 500, 540)}
${panel(greedyPolys, 'Жадібна евристика: ' + (gr.efficiency * 100).toFixed(1) + '%, довжина ' + gr.lengthPx, 300, gr.lengthPx, 880)}</svg>`;
fs.writeFileSync('examples/example.svg', svg);
(async () => { const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1320, height: Math.max(gr.lengthPx, 500) + 50 } });
  await pg.setContent(svg); await pg.screenshot({ path: 'examples/example.png' }); await b.close(); console.log('ok', gr.lengthPx, gr.efficiency); })();
