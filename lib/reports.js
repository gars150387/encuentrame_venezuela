const allowedStatuses = ['pending', 'confirmed', 'disputed', 'localized', 'rejected'];

const legacyStatusMap = {
  reviewed: 'confirmed',
  verified: 'localized',
  closed: 'rejected',
};

const seedReports = [
  {
    id: 'seed-1',
    firstName: 'Maria',
    lastName: 'Perez',
    phone: '04120000001',
    relation: 'Familiar',
    lastSeenAt: '2026-06-20T11:30',
    address: 'Los Teques, Miranda',
    age: '34',
    documentId: 'V-12345678',
    notes: 'Cicatriz pequena en la ceja izquierda.',
    photos: [],
    status: 'pending',
    hasPhotos: false,
    createdAt: '2026-06-20T12:00:00.000Z',
    updatedAt: '2026-06-20T12:00:00.000Z',
  },
  {
    id: 'seed-2',
    firstName: 'Jose',
    lastName: 'Ramirez',
    phone: '04120000002',
    relation: 'Vecindario',
    lastSeenAt: '2026-06-19T18:15',
    address: 'Valencia, Carabobo',
    age: '52',
    documentId: 'V-87654321',
    notes: 'Llevaba camisa azul y gorra negra.',
    photos: [],
    status: 'confirmed',
    hasPhotos: false,
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
    hasPhotos: false,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-18T11:00:00.000Z',
  },
];

function normalize(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizedName(firstName, lastName) {
  return normalize(`${firstName} ${lastName}`);
}

function normalizeStatus(status) {
  return allowedStatuses.includes(status) ? status : legacyStatusMap[status] || 'pending';
}

function mapReport(row, photoResolver = (photos) => photos) {
  if (!row) return null;

  const photos = Array.isArray(row.photos) ? row.photos : [];
  return {
    id: row.id,
    firstName: row.first_name ?? row.firstName ?? '',
    lastName: row.last_name ?? row.lastName ?? '',
    phone: row.phone ?? '',
    relation: row.relation ?? '',
    lastSeenAt: row.last_seen_at ?? row.lastSeenAt ?? '',
    address: row.address ?? '',
    age: row.age ?? '',
    documentId: row.document_id ?? row.documentId ?? '',
    notes: row.notes ?? '',
    status: normalizeStatus(row.status),
    localizedByName: row.localized_by_name ?? row.localizedByName ?? '',
    localizedByPhone: row.localized_by_phone ?? row.localizedByPhone ?? '',
    localizedNote: row.localized_note ?? row.localizedNote ?? '',
    localizedAt: row.localized_at ?? row.localizedAt ?? '',
    localizedReportedBy: row.localized_reported_by ?? row.localizedReportedBy ?? '',
    photos: photoResolver(photos),
    hasPhotos: Boolean(row.has_photos ?? row.hasPhotos ?? photos.length > 0),
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? '',
  };
}

function toDbPayload(input = {}) {
  const firstName = String(input.nombre || input.firstName || '').trim();
  const lastName = String(input.apellidos || input.lastName || '').trim();
  const phone = String(input.telefono || input.phone || '').trim();
  const relation = String(input.relacion || input.relation || '').trim();
  const lastSeenAt = String(input.ultimaVez || input.lastSeenAt || '').trim();
  const address = String(input.direccion || input.address || '').trim();
  const age = String(input.edad || input.age || '').trim();
  const documentId = String(input.documento || input.documentId || '').trim();
  const notes = String(input.señas || input.señasParticulares || input.notes || '').trim();

  return {
    first_name: firstName,
    last_name: lastName,
    normalized_name: normalizedName(firstName, lastName),
    phone,
    normalized_phone: normalize(phone),
    relation,
    last_seen_at: lastSeenAt,
    address,
    age,
    document_id: documentId,
    notes,
    status: 'pending',
    has_photos: false,
    photos: [],
  };
}

function validatePayload(input = {}) {
  const required = ['nombre', 'apellidos', 'telefono', 'relacion', 'ultimaVez', 'direccion'];
  const errors = required.filter((field) => !String(input[field] || '').trim());
  const photos = Array.isArray(input.photos) ? input.photos : [];

  if (photos.length > 3) errors.push('photos');
  if (photos.some((photo) => photo && photo.dataUrl && !String(photo.dataUrl).startsWith('data:image/'))) errors.push('photos');

  return { valid: errors.length === 0, errors };
}

function buildStats(rows = []) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      const status = normalizeStatus(row.status);
      if (['pending', 'confirmed', 'disputed'].includes(status)) acc.unresolved += 1;
      if (acc[status] !== undefined) acc[status] += 1;
      if ((row.photos || []).length > 0 || row.has_photos || row.hasPhotos) acc.withPhotos += 1;
      return acc;
    },
    { total: 0, unresolved: 0, pending: 0, confirmed: 0, disputed: 0, localized: 0, rejected: 0, withPhotos: 0 },
  );
}

function filterRows(rows = [], { q = '', status = 'all' } = {}) {
  const query = normalize(q);
  return rows.filter((row) => {
    const normalizedStatus = normalizeStatus(row.status);
    const matchesStatus = status === 'all' || normalizedStatus === status;
    const matchesQuery =
      !query ||
      [row.first_name ?? row.firstName ?? '', row.last_name ?? row.lastName ?? '', row.phone ?? '', row.address ?? '', row.document_id ?? row.documentId ?? '']
        .map(normalize)
        .some((value) => value.includes(query));
    return matchesStatus && matchesQuery;
  });
}

module.exports = {
  allowedStatuses,
  seedReports,
  normalize,
  normalizedName,
  normalizeStatus,
  mapReport,
  toDbPayload,
  validatePayload,
  buildStats,
  filterRows,
};
