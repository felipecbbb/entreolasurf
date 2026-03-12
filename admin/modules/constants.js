/* ============================================================
   Shared Constants — Admin Panel
   ============================================================ */

export const TYPE_LABELS = {
  grupal: 'Clases Grupales',
  individual: 'Clases Individuales',
  yoga: 'Clases de Yoga',
  paddle: 'Paddle Surf',
  surfskate: 'SurfSkate',
};

export const TYPE_COLORS = {
  grupal: '#0f2f39',
  individual: '#2d6a4f',
  yoga: '#7c3aed',
  paddle: '#0369a1',
  surfskate: '#c2410c',
};

// Pack pricing per activity type: index 0 = unused, index N = price for N sessions per person
export const PACK_PRICING = {
  grupal:     [0, 35, 65, 90, 115, 135, 155, 165],
  individual: [0, 69, 130, 177, 220, 250],
  yoga:       [0, 20, 35, 48, 60, 70, 75],
  paddle:     [0, 49, 95, 135, 170, 205, 240],
  surfskate:  [0, 30, 55, 78, 95, 115, 130],
};

export const PACK_VALIDITY = {
  grupal: 180,
  individual: 180,
  yoga: 365,
  paddle: 365,
  surfskate: 365,
};

export const DEPOSIT = {
  grupal: 15,
  individual: 15,
  yoga: 15,
  paddle: 15,
  surfskate: 15,
};

// Rental duration keys and labels
export const RENTAL_DURATIONS = {
  '1h': '1 hora',
  '2h': '2 horas',
  '1d': '1 día',
  '1w': '1 semana',
};

export const RENTAL_DEPOSIT = 5;
