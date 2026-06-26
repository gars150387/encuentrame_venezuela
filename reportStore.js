const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const allowedStatuses = ['pending', 'confirmed', 'disputed', 'localized', 'rejected'];

const legacyStatusMap = {
  reviewed: 'confirmed',
  verified: 'localized',
  closed: 'rejected',
};

const seedReports = [
  {
    id: 'seed-1',
    firstName: 'María',
    lastName: 'Pérez',
    phone: '04120000001',
    relation: 'Familiar',
    lastSeenAt: '2026-06-20T11:30',
    address: 'Los Teques, Miranda',
    age: '34',
    documentId: 'V-12345678',
    notes: 'Cicatriz pequeña en la ceja izquierda.',
    photos: [],
    status: 'pending',
    createdAt: '2026-06-20T12:00:00.000Z',
    updatedAt: '2026-06-20T12:00:00.000Z',
  },
  {
    id: 'seed-2',
    firstName: 'José',
    lastName: 'Ramírez',
    phone: '04120000002',
    relation: 'Vecindario',
    lastSeenAt: '2026-06-19T18:15',
    address: 'Valencia, Carabobo',
    age: '52',
    documentId: 'V-87654321',
    notes: 'Llevaba camisa azul y gorra negra.',
    photos: [],
    status: 'confirmed',
    createdAt: '2026-06-19T19:00:00.000Z',
    updatedAt: '2026-06-19T19:45:00.000Z',
  },
  {
    id: 'seed-3',
    firstName: 'Ana',
    lastName: 'Torres',
    phone: '04120000003',
    relation: 'Amistad',
    lastSeenAt: '2026-06-18T09:00',
    address: 'Maracaibo, Zulia',
    age: '27',
    documentId: '',
    notes: 'Tatuaje en antebrazo derecho.',
    photos: [],
    status: 'localized',
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T11:00:00.000Z',
  },
];

function getDataFile() {
  return process.env.ENCUENTRAME_DATA_FILE || path.join(__dirname, 'data', 'reports.json');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function ensureDir() {
  fs.mkdirSync(path.dirname(getDataFile()), { recursive: true });
}

function defaultReports() {
  return clone(seedReports);
}

function normalizeReport(report) {
  const status = allowedStatuses.includes(report.status) ? report.status : legacyStatusMap[report.status] || 'pending';
  return {
    ...report,
    status,
  };
}

function loadReports() {
  const file = getDataFile();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeReport);
  } catch {
    return defaultReports();
  }

  return defaultReports();
}

function saveReports(reports) {
  ensureDir();
  fs.writeFileSync(getDataFile(), JSON.stringify(reports, null, 2));
}

function validateReportInput(input = {}) {
  const errors = [];
  const requiredFields = ['nombre', 'apellidos', 'telefono', 'relacion', 'ultimaVez', 'direccion'];

  for (const field of requiredFields) {
    if (!String(input[field] || '').trim()) errors.push(field);
  }

  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length > 3) errors.push('photos');

  if (photos.some((photo) => photo && photo.dataUrl && !String(photo.dataUrl).startsWith('data:image/'))) {
    errors.push('photos');
  }

  return { valid: errors.length === 0, errors };
}

function createReport(input = {}) {
  const now = new Date().toISOString();
  const photos = Array.isArray(input.photos)
    ? input.photos.slice(0, 3).map((photo) => ({
        name: String(photo?.name || ''),
        type: String(photo?.type || ''),
        dataUrl: String(photo?.dataUrl || ''),
      }))
    : [];

  return {
    id: crypto.randomUUID(),
    firstName: String(input.nombre || '').trim(),
    lastName: String(input.apellidos || '').trim(),
    phone: String(input.telefono || '').trim(),
    relation: String(input.relacion || '').trim(),
    lastSeenAt: String(input.ultimaVez || '').trim(),
    address: String(input.direccion || '').trim(),
    age: String(input.edad || '').trim(),
    documentId: String(input.documento || '').trim(),
    notes: String(input.señas || '').trim(),
    photos,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

function isDuplicate(reports, report) {
  const reportName = normalize(`${report.firstName} ${report.lastName}`);
  const reportPhone = normalize(report.phone);

  return reports.some((entry) => {
    const entryName = normalize(`${entry.firstName} ${entry.lastName}`);
    return entryName === reportName || normalize(entry.phone) === reportPhone;
  });
}

function addReport(reports, input, options = {}) {
  const validation = validateReportInput(input);
  if (!validation.valid) {
    return { ok: false, status: 400, errors: validation.errors };
  }

  const report = createReport(input);
  if (!options.allowDuplicate && isDuplicate(reports, report)) {
    return { ok: false, status: 409, duplicate: true, report };
  }

  return { ok: true, reports: [report, ...reports], report };
}

function updateReportStatus(reports, id, status) {
  if (!allowedStatuses.includes(status)) {
    return { ok: false, status: 400, error: 'invalid_status' };
  }

  const index = reports.findIndex((report) => report.id === id);
  if (index === -1) {
    return { ok: false, status: 404, error: 'not_found' };
  }

  const next = reports.slice();
  next[index] = {
    ...normalizeReport(next[index]),
    status,
    updatedAt: new Date().toISOString(),
  };

  return { ok: true, reports: next, report: next[index] };
}

function listReports(reports, query = {}) {
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const offset = Math.max(0, Number(query.offset || 0));
  const status = String(query.status || 'all');
  const q = normalize(query.q || '');

  const filtered = reports.filter((report) => {
    const matchesStatus = status === 'all' || report.status === status;
    const matchesQuery = !q || [report.firstName, report.lastName, report.phone, report.address, report.documentId].some((field) => normalize(field).includes(q));
    return matchesStatus && matchesQuery;
  });

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);
  const stats = reports.reduce(
    (acc, report) => {
      acc.total += 1;
      if (acc[report.status] !== undefined) acc[report.status] += 1;
      if ((report.photos || []).length > 0) acc.withPhotos += 1;
      return acc;
    },
    { total: 0, pending: 0, confirmed: 0, disputed: 0, localized: 0, rejected: 0, withPhotos: 0 },
  );

  return { items, total, limit, offset, hasMore: offset + limit < total, stats };
}

module.exports = {
  allowedStatuses,
  seedReports,
  loadReports,
  saveReports,
  validateReportInput,
  createReport,
  isDuplicate,
  addReport,
  updateReportStatus,
  listReports,
  normalizeReport,
  normalize,
  defaultReports,
  getDataFile,
};
