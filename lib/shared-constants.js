export const WETSUIT_SIZES = [
  '6 años','8 años','10 años','12 años','14',
  'XXS','XS','MS','S','MT','M','LS','L','LT','XL','XXL'
];

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
