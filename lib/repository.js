const { getSupabaseAdmin, getPhotosBucket } = require('./supabase');
const {
  buildStats,
  filterRows,
  mapReport,
  normalize,
  normalizedName,
  seedReports,
  toDbPayload,
  validatePayload,
} = require('./reports');
const { logAudit } = require('./audit');

let memoryReports = seedReports.map((report) => ({
  ...report,
  hasPhotos: Boolean(report.hasPhotos),
}));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function memoryMap(report) {
  return mapReport(report, (photos) => photos);
}

function memoryWithLocalized(report, { localizedByName = '', localizedByPhone = '', localizedNote = '', localizedReportedBy = '' } = {}) {
  return {
    ...report,
    status: 'localized',
    localizedByName,
    localizedByPhone,
    localizedNote,
    localizedReportedBy,
    localizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function memoryListReports({ q = '', status = 'all', limit = 25, offset = 0 } = {}) {
  const filtered = filterRows(memoryReports, { q, status });
  const page = filtered.slice(offset, offset + limit);
  return {
    items: page.map(memoryMap),
    total: filtered.length,
    hasMore: offset + limit < filtered.length,
    stats: buildStats(memoryReports),
  };
}

async function memoryGetReportById(id) {
  const report = memoryReports.find((item) => item.id === id);
  return report ? memoryMap(report) : null;
}

async function memoryCreateReport({ fields = {}, photos = [], clientId } = {}) {
  const validation = validatePayload(fields);
  if (!validation.valid) {
    const error = new Error('validation_error');
    error.status = 400;
    error.details = validation.errors;
    throw error;
  }

  const payload = toDbPayload(fields);
  if (memoryReports.some((report) => report.normalized_name === payload.normalized_name && report.normalized_phone === payload.normalized_phone)) {
    const error = new Error('duplicate');
    error.status = 409;
    throw error;
  }

  const uploadedPhotos = [];
  for (const photo of photos.slice(0, 3)) {
    if (!(photo instanceof File)) continue;
    const buffer = Buffer.from(await photo.arrayBuffer());
    uploadedPhotos.push({
      path: `memory/${Date.now()}-${photo.name}`,
      name: photo.name,
      contentType: photo.type || 'image/jpeg',
      dataUrl: `data:${photo.type || 'image/jpeg'};base64,${buffer.toString('base64')}`,
    });
  }

  const now = new Date().toISOString();
  const report = {
    id: require('node:crypto').randomUUID(),
    firstName: payload.first_name,
    lastName: payload.last_name,
    phone: payload.phone,
    relation: payload.relation,
    lastSeenAt: payload.last_seen_at,
    address: payload.address,
    age: payload.age,
    documentId: payload.document_id,
    notes: payload.notes,
    status: 'pending',
    hasPhotos: uploadedPhotos.length > 0,
    photos: uploadedPhotos,
    createdAt: now,
    updatedAt: now,
  };

  memoryReports = [report, ...memoryReports];
  return memoryMap(report);
}

async function memorySetReportStatus({ reportId, status }) {
  const index = memoryReports.findIndex((report) => report.id === reportId);
  if (index === -1) return null;

  memoryReports[index] = { ...memoryReports[index], status, updatedAt: new Date().toISOString() };
  return memoryMap(memoryReports[index]);
}

async function memoryLocalizeReport({ reportId, localizedByName = '', localizedByPhone = '', localizedNote = '', localizedReportedBy = '' }) {
  const index = memoryReports.findIndex((report) => report.id === reportId);
  if (index === -1) return null;

  memoryReports[index] = memoryWithLocalized(memoryReports[index], { localizedByName, localizedByPhone, localizedNote, localizedReportedBy });
  return memoryMap(memoryReports[index]);
}

async function memoryExportReports() {
  return memoryReports.map(memoryMap);
}

async function memoryResetReports() {
  memoryReports = seedReports.map((report) => ({
    ...report,
    hasPhotos: Boolean(report.hasPhotos),
  }));
  return memoryReports.map(memoryMap);
}

function useMemoryFallback(error) {
  return !getSupabaseAdmin() || error?.message === 'supabase_not_configured' || error?.code === '42P01';
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('supabase_not_configured');
  return supabase;
}

function toLikeQuery(value) {
  return `%${normalize(value).replace(/[\\%_]/g, '')}%`;
}

async function signPhotos(supabase, photos = []) {
  const bucket = getPhotosBucket();
  const resolved = [];

  for (const photo of photos) {
    if (!photo?.path) continue;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(photo.path, 60 * 60);
    resolved.push({ ...photo, signedUrl: error ? null : data?.signedUrl || null });
  }

  return resolved;
}

async function mapRowsWithPhotos(supabase, rows = []) {
  const mapped = [];
  for (const row of rows) {
    const report = mapReport(row, (photos) => photos);
    report.photos = await signPhotos(supabase, report.photos);
    mapped.push(report);
  }
  return mapped;
}

async function countStatus(supabase, status) {
  const { count, error } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', status);
  if (error) throw error;
  return count || 0;
}

async function countWithPhotos(supabase) {
  const { count, error } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('has_photos', true);
  if (error) throw error;
  return count || 0;
}

async function listReports({ q = '', status = 'all', limit = 25, offset = 0 } = {}) {
  if (!getSupabaseAdmin()) return memoryListReports({ q, status, limit, offset });

  const supabase = requireSupabase();
  const likeQuery = toLikeQuery(q);

  let query = supabase.from('reports').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (status !== 'all') query = query.eq('status', status);
  if (normalize(q)) {
    query = query.or(`normalized_name.ilike.${likeQuery},normalized_phone.ilike.${likeQuery},address.ilike.${likeQuery},document_id.ilike.${likeQuery}`);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const { count: totalCount } = await supabase.from('reports').select('id', { count: 'exact', head: true });
  const stats = {
    total: totalCount || 0,
    unresolved: (await countStatus(supabase, 'pending')) + (await countStatus(supabase, 'confirmed')) + (await countStatus(supabase, 'disputed')),
    pending: await countStatus(supabase, 'pending'),
    confirmed: await countStatus(supabase, 'confirmed'),
    disputed: await countStatus(supabase, 'disputed'),
    localized: await countStatus(supabase, 'localized'),
    rejected: await countStatus(supabase, 'rejected'),
    withPhotos: await countWithPhotos(supabase),
  };

  return {
    items: await mapRowsWithPhotos(supabase, data || []),
    total: count || 0,
    hasMore: offset + limit < (count || 0),
    stats,
  };
}

async function getReportById(id) {
  if (!getSupabaseAdmin()) return memoryGetReportById(id);

  const supabase = requireSupabase();
  const { data, error } = await supabase.from('reports').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const report = mapReport(data, (photos) => photos);
  report.photos = await signPhotos(supabase, report.photos);
  return report;
}

async function createReport({ fields = {}, photos = [], clientId, sourceIp, userAgent, allowDuplicate = false }) {
  if (!getSupabaseAdmin()) return memoryCreateReport({ fields, photos, clientId, allowDuplicate });

  const validation = validatePayload(fields);
  if (!validation.valid) {
    const error = new Error('validation_error');
    error.status = 400;
    error.details = validation.errors;
    throw error;
  }

  const supabase = requireSupabase();
  const payload = toDbPayload(fields);

  const { data: duplicateRows, error: duplicateError } = await supabase
    .from('reports')
    .select('id', { head: false })
    .eq('normalized_name', payload.normalized_name)
    .eq('normalized_phone', payload.normalized_phone)
    .limit(1);
  if (duplicateError) throw duplicateError;
  if (!allowDuplicate && duplicateRows?.length) {
    const error = new Error('duplicate');
    error.status = 409;
    throw error;
  }

  const { data: inserted, error: insertError } = await supabase.from('reports').insert(payload).select('*').single();
  if (insertError) throw insertError;

  const bucket = getPhotosBucket();
  const uploadedPhotos = [];
  for (let index = 0; index < Math.min(3, photos.length); index += 1) {
    const photo = photos[index];
    if (!(photo instanceof File)) continue;

    const fileName = `${inserted.id}/${Date.now()}-${index}-${photo.name}`.replace(/\s+/g, '_');
    const buffer = await photo.arrayBuffer();
    const uploadResult = await supabase.storage.from(bucket).upload(fileName, buffer, {
      contentType: photo.type || 'image/jpeg',
      upsert: false,
    });
    if (uploadResult.error) throw uploadResult.error;
    uploadedPhotos.push({ path: fileName, name: photo.name, contentType: photo.type || 'image/jpeg' });
  }

  const nextHasPhotos = uploadedPhotos.length > 0;
  const { data: updated, error: updateError } = await supabase
    .from('reports')
    .update({ photos: uploadedPhotos, has_photos: nextHasPhotos })
    .eq('id', inserted.id)
    .select('*')
    .single();
  if (updateError) throw updateError;

  await logAudit(supabase, {
    reportId: updated.id,
    action: 'report_created',
    actorId: clientId || null,
    sourceIp,
    userAgent,
    payload: { hasPhotos: nextHasPhotos },
  });

  const report = mapReport(updated, (photosToSign) => photosToSign);
  report.photos = await signPhotos(supabase, report.photos);
  return report;
}

async function setReportStatus({ reportId, status, actorId, sourceIp, userAgent }) {
  if (!getSupabaseAdmin()) return memorySetReportStatus({ reportId, status });

  if (!['pending', 'confirmed', 'disputed', 'localized', 'rejected'].includes(status)) {
    const error = new Error('invalid_status');
    error.status = 400;
    throw error;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  await logAudit(supabase, { reportId, action: 'report_status_updated', actorId, sourceIp, userAgent, payload: { status } });

  const report = mapReport(data, (photos) => photos);
  report.photos = await signPhotos(supabase, report.photos);
  return report;
}

async function localizeReport({ reportId, localizedByName, localizedByPhone, localizedNote, localizedReportedBy, sourceIp, userAgent }) {
  if (!getSupabaseAdmin()) return memoryLocalizeReport({ reportId, localizedByName, localizedByPhone, localizedNote, localizedReportedBy });

  const supabase = requireSupabase();
  const updatePayload = {
    status: 'localized',
    localized_by_name: localizedByName || null,
    localized_by_phone: localizedByPhone || null,
    localized_note: localizedNote || null,
    localized_reported_by: localizedReportedBy || null,
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from('reports')
    .update(updatePayload)
    .eq('id', reportId)
    .select('*')
    .maybeSingle();

  if (error?.message?.includes('schema cache')) {
    const retry = await supabase
      .from('reports')
      .update({ status: 'localized', updated_at: updatePayload.updated_at })
      .eq('id', reportId)
      .select('*')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  if (!data) return null;

  await logAudit(supabase, {
    reportId,
    action: 'report_localized',
    actorId: localizedReportedBy || null,
    sourceIp,
    userAgent,
    payload: { localizedByName, localizedByPhone, localizedNote },
  });

  const report = mapReport(data, (photos) => photos);
  report.photos = await signPhotos(supabase, report.photos);
  return report;
}

async function exportReports() {
  if (!getSupabaseAdmin()) return memoryExportReports();

  const supabase = requireSupabase();
  const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
  if (error) throw error;

  return await mapRowsWithPhotos(supabase, data || []);
}

async function resetReports() {
  if (!getSupabaseAdmin()) return memoryResetReports();

  const supabase = requireSupabase();
  await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const rows = seedReports.map((report) => ({
    first_name: report.firstName,
    last_name: report.lastName,
    normalized_name: normalizedName(report.firstName, report.lastName),
    phone: report.phone,
    normalized_phone: normalize(report.phone),
    relation: report.relation,
    last_seen_at: report.lastSeenAt,
    address: report.address,
    age: report.age,
    document_id: report.documentId,
    notes: report.notes,
    status: report.status,
    has_photos: report.hasPhotos,
    photos: report.photos,
  }));

  const { data, error } = await supabase.from('reports').insert(rows).select('*');
  if (error) throw error;

  return await mapRowsWithPhotos(supabase, data || []);
}

module.exports = {
  listReports,
  getReportById,
  createReport,
  setReportStatus,
  localizeReport,
  exportReports,
  resetReports,
};
