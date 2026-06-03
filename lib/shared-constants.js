export const ADMIN_EMAIL = 'entreolasurf@gmail.com';

// Orden único de tallas: niño (numérico, ascendente) → adulto por letra.
// Dentro de cada letra: S (small) < normal < T (tall). Ej: S < MS < M < MT.
export const WETSUIT_SIZES = [
  '6 años','8 años','10 años','12 años','14','16',
  'XXS','XS','S','MS','M','MT','LS','L','LT','XL','XXL'
];

// Rango por letra (mismo criterio en toda la app)
const LETTER_SIZE_RANK = { XXS:1, XS:2, S:3, MS:4, M:5, MT:6, LS:7, L:8, LT:9, XL:10, XXL:11, XXXL:12 };

// Clave de ordenación para una talla cualquiera (niño numérico, letra, o pies de tabla).
// Grupos: 0 = numérica (niño/cm) asc · 1 = letra (rango) · 2 = pies de tabla (7'0) · 3 = otra (alfabética)
export function sizeSortKey(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const age = /^(\d+)\s*años?$/i.exec(s);
  if (age) return [0, parseInt(age[1], 10), ''];
  const feet = /^(\d+)'(\d+)$/.exec(s);
  if (feet) return [2, parseInt(feet[1], 10) * 10 + parseInt(feet[2], 10), ''];
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return [0, parseFloat(s.replace(',', '.')), ''];
  const up = s.toUpperCase();
  if (LETTER_SIZE_RANK[up] != null) return [1, LETTER_SIZE_RANK[up], ''];
  return [3, 0, up];
}

export function compareSizes(a, b) {
  const ka = sizeSortKey(a), kb = sizeSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2], 'es');
}

export const LEVEL_OPTIONS = [
  { value: 'principiante', label: 'Principiante', desc: 'No sé nada o he dado muy pocas clases' },
  { value: 'intermedio', label: 'Intermedio', desc: 'Controlo lo básico y quiero mejorar' },
  { value: 'avanzado', label: 'Avanzado', desc: 'Tengo experiencia y busco perfeccionar' },
];

export const AUDIENCE_OPTIONS = [
  { value: 'adultos', label: 'Adultos' },
  { value: 'ninos', label: 'Niños' },
  { value: 'mixto', label: 'Mixto' },
];

export function wetsuitOptionsHtml(selected = '') {
  return '<option value="">Sin definir</option>' +
    WETSUIT_SIZES.map(s => `<option value="${s}" ${selected === s ? 'selected' : ''}>${s}</option>`).join('');
}

export function levelOptionsHtml(selected = '', withDesc = false) {
  return '<option value="">Sin definir</option>' +
    LEVEL_OPTIONS.map(l => {
      const label = withDesc ? `${l.label} (${l.desc})` : l.label;
      return `<option value="${l.value}" ${selected === l.value ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

export function audienceOptionsHtml(selected = '') {
  return '<option value="">Sin definir</option>' +
    AUDIENCE_OPTIONS.map(a => `<option value="${a.value}" ${selected === a.value ? 'selected' : ''}>${a.label}</option>`).join('');
}
