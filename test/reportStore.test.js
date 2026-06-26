const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'encuentrame-'));
process.env.ENCUENTRAME_DATA_FILE = path.join(tempDir, 'reports.json');

const store = require('../reportStore');

test('validateReportInput accepts a complete report', () => {
  const result = store.validateReportInput({
    nombre: 'Luis',
    apellidos: 'Gomez',
    telefono: '04120000010',
    relacion: 'Familiar',
    ultimaVez: '2026-06-25T10:00',
    direccion: 'Caracas',
    photos: [],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateReportInput reports missing fields', () => {
  const result = store.validateReportInput({ telefono: '1' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('nombre'));
  assert.ok(result.errors.includes('apellidos'));
});

test('addReport creates a report and blocks duplicates', () => {
  const reports = store.defaultReports();
  const payload = {
    nombre: 'Maria',
    apellidos: 'Perez',
    telefono: '04120000001',
    relacion: 'Familiar',
    ultimaVez: '2026-06-25T10:00',
    direccion: 'Caracas',
    photos: [],
  };

  const duplicate = store.addReport(reports, payload);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 409);

  const allowed = store.addReport(reports, { ...payload, telefono: '04120000999' }, { allowDuplicate: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.report.status, 'pending');
  assert.equal(allowed.report.firstName, 'Maria');
});

test('addReport allows different name or phone', () => {
  const reports = store.defaultReports();

  const differentPhone = store.addReport(reports, {
    nombre: 'Maria',
    apellidos: 'Perez',
    telefono: '04120000999',
    relacion: 'Familiar',
    ultimaVez: '2026-06-25T10:00',
    direccion: 'Caracas',
    photos: [],
  });

  assert.equal(differentPhone.ok, true);
});

test('updateReportStatus updates the target report', () => {
  const reports = store.defaultReports();
  const result = store.updateReportStatus(reports, 'seed-1', 'localized');

  assert.equal(result.ok, true);
  assert.equal(result.report.status, 'localized');
  assert.notEqual(result.report.updatedAt, '2026-06-20T12:00:00.000Z');
});

test('listReports paginates and returns stats', () => {
  const result = store.listReports(store.defaultReports(), { limit: 2, offset: 0, status: 'all', q: '' });

  assert.equal(result.items.length, 2);
  assert.equal(result.total, 3);
  assert.equal(result.stats.total, 3);
  assert.equal(result.hasMore, true);
});
