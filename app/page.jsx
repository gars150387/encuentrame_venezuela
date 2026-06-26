'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const emptyForm = {
  nombre: '',
  apellidos: '',
  telefono: '',
  relacion: '',
  ultimaVez: '',
  direccion: '',
  edad: '',
  documento: '',
  señas: '',
};

const emptyLocalizeForm = {
  localizedByName: '',
  localizedByPhone: '',
  localizedNote: '',
};

const initialStats = { total: 0, unresolved: 0, pending: 0, confirmed: 0, disputed: 0, localized: 0, rejected: 0, withPhotos: 0 };
const totalReportSteps = 4;

function getClientId() {
  if (typeof window === 'undefined') return '';
  const key = 'encuentrame_client_id_v1';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

function statusMeta(status) {
  if (status === 'localized') return ['Localizado', 'text-bg-primary'];
  return ['Reportada', 'text-bg-secondary'];
}

function downloadJson(items) {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'encuentrame-reportes.json';
  a.click();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const formRef = useRef(null);
  const [clientId, setClientId] = useState('');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [localizeForm, setLocalizeForm] = useState(emptyLocalizeForm);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState('');

  const canNext = useMemo(() => {
    if (step === 1) return form.nombre && form.apellidos && form.telefono && form.relacion;
    if (step === 2) return form.ultimaVez && form.direccion;
    return true;
  }, [form, step]);

  useEffect(() => {
    setClientId(getClientId());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem('encuentrame_draft_v1');
    if (!raw) return;

    try {
      setForm((current) => ({ ...current, ...JSON.parse(raw) }));
      setMessage('Borrador restaurado.');
    } catch {
      window.localStorage.removeItem('encuentrame_draft_v1');
    }
  }, []);

  useEffect(() => {
    const nextUrls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(nextUrls);
    return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  async function fetchReports({ reset = true } = {}) {
    const currentOffset = reset ? 0 : offset;
    const params = new URLSearchParams({ limit: '25', offset: String(currentOffset), q: query, status });
    const response = await fetch(`/api/reports?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'load_failed');

    const nextReports = data.items || [];
    setStats(data.stats || initialStats);
    setHasMore(Boolean(data.hasMore));
    setOffset(currentOffset);

    if (reset) {
      setReports(nextReports);
      setSelected(nextReports[0] || null);
    } else {
      setReports((current) => [...current, ...nextReports]);
    }

    setMessage(`Base activa. ${data.total || 0} resultados.`);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (clientId) fetchReports({ reset: true }).catch(() => setMessage('No se pudo conectar con la API.'));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, clientId]);

  async function loadMore() {
    const nextOffset = offset + 25;
    const params = new URLSearchParams({ limit: '25', offset: String(nextOffset), q: query, status });
    const response = await fetch(`/api/reports?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) return setMessage(data?.error || 'No se pudieron cargar mas resultados.');

    setReports((current) => [...current, ...(data.items || [])]);
    setOffset(nextOffset);
    setHasMore(Boolean(data.hasMore));
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!form.nombre || !form.apellidos || !form.telefono || !form.relacion || !form.ultimaVez || !form.direccion) {
      setMessage('Completa los campos obligatorios.');
      return;
    }

    if (step < totalReportSteps) {
      setMessage('Completa todos los pasos antes de enviar el reporte.');
      return;
    }

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append('clientId', clientId);
    payload.append('allowDuplicate', 'false');
    files.forEach((file) => payload.append('photos', file));

    const response = await fetch('/api/reports', { method: 'POST', body: payload });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data?.error || 'No se pudo enviar el reporte.');
      return;
    }

    setMessage('Reporte enviado a la base comunitaria.');
    setForm(emptyForm);
    setFiles([]);
    setStep(1);
    await fetchReports({ reset: true });
    setSelected(data);
  }

  async function exportData() {
    const response = await fetch('/api/reports/export');
    const data = await response.json();
    downloadJson(data.items || []);
  }

  const selectedReport = reports.find((report) => report.id === selected?.id) || selected;
  const [statusLabel, statusClass] = statusMeta(selectedReport?.status);

  async function markLocalized(event) {
    event.preventDefault();
    if (!selected?.id) return;

    if (!localizeForm.localizedByName || !localizeForm.localizedByPhone) {
      setMessage('Completa nombre y telefono de quien localizo.');
      return;
    }

    const response = await fetch(`/api/reports/${selected.id}/localize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localizedByName: localizeForm.localizedByName,
        localizedByPhone: localizeForm.localizedByPhone,
        localizedNote: localizeForm.localizedNote,
        localizedReportedBy: clientId,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data?.error || 'No se pudo marcar como localizada.');
      return;
    }

    setMessage('Reporte marcado como localizada.');
    await fetchReports({ reset: true });
    setSelected(data);
    setLocalizeForm(emptyLocalizeForm);
  }

  return (
    <main className="container py-4 py-md-5">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <span className="badge text-bg-danger-subtle text-danger border border-danger-subtle mb-2">MVP de emergencia</span>
          <h1 className="display-6 fw-bold mb-2">Base comunitaria de reportes</h1>
          <p className="text-secondary mb-0">Registro de reportes y marcado de localizacion, con fotos en storage externo y auditoria activa.</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={exportData}>Exportar JSON</button>
        </div>
      </div>

      <div className="alert alert-warning border-0 shadow-sm">{message || 'Los reportes se publican como reportada o localizada.'}</div>

      <div className="row g-4 mb-4">
        <StatCard title="Registrados" value={stats.total} />
        <StatCard title="Por localizar" value={stats.unresolved} />
        <StatCard title="Localizados" value={stats.localized} />
        <StatCard title="Con foto" value={stats.withPhotos} />
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-7">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                <div>
                  <h2 className="h4 mb-1">Nuevo reporte</h2>
                  <p className="text-secondary mb-0">Completa el flujo rapido de 3 pasos.</p>
                </div>
                <span className="badge text-bg-primary">Paso {step} de {totalReportSteps}</span>
              </div>
              <div className="progress mb-4" style={{ height: 8 }}>
                <div className="progress-bar" style={{ width: `${(step / totalReportSteps) * 100}%` }} />
              </div>

              <form ref={formRef} onSubmit={submitReport}>
                {step === 1 && (
                  <section className="mb-3">
                    <h3 className="h6 text-uppercase text-secondary mb-3">Datos básicos</h3>
                    <div className="row g-3">
                      <Field label="Nombre" value={form.nombre} onChange={(value) => setForm({ ...form, nombre: value })} />
                      <Field label="Apellidos" value={form.apellidos} onChange={(value) => setForm({ ...form, apellidos: value })} />
                      <Field label="Telefono" value={form.telefono} onChange={(value) => setForm({ ...form, telefono: value })} />
                      <Field label="Relacion" value={form.relacion} onChange={(value) => setForm({ ...form, relacion: value })} as="select" options={['Familiar', 'Amistad', 'Vecindario', 'Autoridad', 'Otro']} />
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <section className="mb-3">
                    <h3 className="h6 text-uppercase text-secondary mb-3">Ultima vez visto/a</h3>
                    <div className="row g-3">
                      <Field label="Fecha y hora" type="datetime-local" value={form.ultimaVez} onChange={(value) => setForm({ ...form, ultimaVez: value })} />
                      <Field label="Direccion / zona" value={form.direccion} onChange={(value) => setForm({ ...form, direccion: value })} />
                      <Field label="Edad aproximada" value={form.edad} onChange={(value) => setForm({ ...form, edad: value })} />
                      <Field label="Documento / ID" value={form.documento} onChange={(value) => setForm({ ...form, documento: value })} />
                      <div className="col-12">
                        <label className="form-label">Señas particulares</label>
                        <textarea className="form-control" rows="3" value={form.señas} onChange={(e) => setForm({ ...form, señas: e.target.value })} />
                      </div>
                    </div>
                  </section>
                )}

                {step === 3 && (
                  <section className="mb-3">
                    <h3 className="h6 text-uppercase text-secondary mb-3">Fotos del reporte</h3>
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label">Fotos</label>
                        <input className="form-control" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))} />
                        <div className="form-text">Maximo 3 imagenes por reporte.</div>
                      </div>
                      <div className="col-12 d-flex flex-wrap gap-2">{previewUrls.map((url) => <span key={url} className="photo-pill"><img src={url} alt="preview" /></span>)}</div>
                    </div>
                  </section>
                )}

                {step === 4 && (
                  <section className="mb-3">
                    <h3 className="h6 text-uppercase text-secondary mb-3">Revisar y enviar</h3>
                    <div className="alert alert-light border mb-0">
                      <div className="fw-semibold">{form.nombre} {form.apellidos}</div>
                      <div className="small text-secondary">{form.direccion}</div>
                      <div className="small">{files.length ? `${files.length} foto(s) agregada(s).` : 'Sin fotos agregadas.'}</div>
                    </div>
                  </section>
                )}

                <div className="d-flex gap-2 justify-content-between mt-4">
                  <button type="button" className="btn btn-outline-secondary" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>Anterior</button>
                  <div className="d-flex gap-2 flex-wrap justify-content-end">
                    <button type="button" className="btn btn-outline-primary" onClick={() => window.localStorage.setItem('encuentrame_draft_v1', JSON.stringify(form))}>Guardar borrador</button>
                    {step < totalReportSteps ? (
                      <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep((value) => Math.min(totalReportSteps, value + 1))}>Siguiente</button>
                    ) : (
                      <button type="submit" className="btn btn-success">Enviar reporte</button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                <div>
                  <h2 className="h4 mb-1">Listado y busqueda</h2>
                  <p className="text-secondary mb-0">Solo reportada o localizada.</p>
                </div>
                <select className="form-select w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">Todos</option>
                  <option value="pending">Reportadas</option>
                  <option value="localized">Localizadas</option>
                </select>
              </div>
              <input className="form-control mb-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, zona o telefono" />
                <div className="reports-list">
                  {reports.map((report) => {
                    const [label, cls] = statusMeta(report.status);
                    return (
                      <div
                        key={report.id}
                        role="button"
                        tabIndex={0}
                        className={`report-item p-0 overflow-hidden ${selected?.id === report.id ? 'active' : ''}`}
                        onClick={() => setSelected(report)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setSelected(report);
                        }}
                    >
                      <ReportCardMedia report={report} />
                      <div className="p-3 d-flex justify-content-between align-items-start gap-3">
                        <div className="min-w-0">
                          <div className="fw-semibold">{report.firstName} {report.lastName}</div>
                          <div className="small text-secondary">{report.address}</div>
                          <div className="small">{report.phone}</div>
                        </div>
                        <span className={`badge ${cls}`}>{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="d-grid mt-3">
                <button type="button" className="btn btn-outline-primary" disabled={!hasMore} onClick={loadMore}>{hasMore ? 'Cargar mas' : 'Sin mas resultados'}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-body p-4">
              <h2 className="h5 mb-3">Detalle del reporte</h2>
              {!selectedReport ? (
                <div className="text-secondary">Selecciona un reporte para revisarlo.</div>
              ) : (
                <>
                  <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                    <div>
                      <div className="h4 mb-1">{selectedReport.firstName} {selectedReport.lastName}</div>
                      <div className="text-secondary small">Creado el {new Date(selectedReport.createdAt).toLocaleString('es-VE')}</div>
                    </div>
                    <span className={`badge ${statusMeta(selectedReport.status)[1]}`}>{statusMeta(selectedReport.status)[0]}</span>
                  </div>

                  <div className="d-flex flex-wrap gap-2 mb-3">{(selectedReport.photos || []).map((photo) => photo.signedUrl ? <span key={photo.path} className="photo-pill"><img src={photo.signedUrl} alt={photo.name || 'foto'} /></span> : null)}</div>

                  <dl className="row mb-0">
                    <dt className="col-5">Telefono</dt><dd className="col-7">{selectedReport.phone}</dd>
                    <dt className="col-5">Relacion</dt><dd className="col-7">{selectedReport.relation}</dd>
                    <dt className="col-5">Direccion</dt><dd className="col-7">{selectedReport.address}</dd>
                    <dt className="col-5">Ultima vez</dt><dd className="col-7">{selectedReport.lastSeenAt ? new Date(selectedReport.lastSeenAt).toLocaleString('es-VE') : '-'}</dd>
                    <dt className="col-5">Señas</dt><dd className="col-7">{[selectedReport.age ? `Edad: ${selectedReport.age}.` : '', selectedReport.documentId ? `ID: ${selectedReport.documentId}.` : '', selectedReport.notes || ''].filter(Boolean).join(' ')}</dd>
                  </dl>

                  <section className="mt-4 border-top pt-3 action-panel">
                    <h3 className="h6 text-uppercase text-secondary mb-3">Reportar como localizada</h3>
                    <p className="text-secondary small mb-3">Completa estos datos solo si ya encontraste a la persona.</p>
                    <div className="row g-3">
                      <Field label="Nombre" value={localizeForm.localizedByName} onChange={(value) => setLocalizeForm({ ...localizeForm, localizedByName: value })} />
                      <Field label="Telefono" value={localizeForm.localizedByPhone} onChange={(value) => setLocalizeForm({ ...localizeForm, localizedByPhone: value })} />
                      <div className="col-12">
                        <label className="form-label">Nota del hallazgo</label>
                        <textarea className="form-control" rows="3" value={localizeForm.localizedNote} onChange={(e) => setLocalizeForm({ ...localizeForm, localizedNote: e.target.value })} />
                      </div>
                      <div className="col-12 d-grid">
                        <button type="button" className="btn btn-primary" onClick={markLocalized}>Marcar localizada</button>
                      </div>
                    </div>
                  </section>

                  {selectedReport.localizedByName ? (
                    <div className="alert alert-light border mt-3 mb-0">
                      <div className="small text-secondary">Localizado por</div>
                      <div className="fw-semibold">{selectedReport.localizedByName}</div>
                      <div className="small">{selectedReport.localizedByPhone}</div>
                      {selectedReport.localizedNote ? <div className="small mt-1">{selectedReport.localizedNote}</div> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h2 className="h5 mb-3">Proceso</h2>
              <div className="d-flex justify-content-between mb-2"><span>Captura</span><span className="badge text-bg-primary">Lista</span></div>
              <div className="d-flex justify-content-between mb-2"><span>Localizacion</span><span className="badge text-bg-primary">Manual</span></div>
              <div className="d-flex justify-content-between mb-2"><span>Auditoria</span><span className="badge text-bg-info">Activa</span></div>
              <div className="d-flex justify-content-between"><span>Escala</span><span className="badge text-bg-secondary">100K+ lista</span></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card stat-card shadow-sm border-0">
        <div className="card-body">
          <div className="text-secondary small">{title}</div>
          <div className="fs-3 fw-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, as = 'input', type = 'text', options = [] }) {
  return (
    <div className="col-md-6">
      <label className="form-label">{label}</label>
      {as === 'select' ? (
        <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input className="form-control" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ReportCardMedia({ report }) {
  const photos = (report.photos || []).filter((photo) => photo?.signedUrl);

  if (!photos.length) {
    return (
      <div className="report-media-fallback d-flex align-items-end p-3">
        <div>
          <div className="small text-white-50">Sin foto</div>
          <div className="fw-semibold text-white">Falta imagen de referencia</div>
        </div>
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className="report-media-wrap">
        <img className="report-media-img" src={photos[0].signedUrl} alt={photos[0].name || 'foto del reporte'} />
      </div>
    );
  }

  const carouselId = `carousel-${report.id}`;

  return (
    <div id={carouselId} className="carousel slide report-media-wrap" data-bs-ride="false">
      <div className="carousel-indicators mb-0">
        {photos.map((photo, index) => (
          <button
            key={photo.path || index}
            type="button"
            data-bs-target={`#${carouselId}`}
            data-bs-slide-to={index}
            className={index === 0 ? 'active' : ''}
            aria-current={index === 0 ? 'true' : undefined}
            aria-label={`Foto ${index + 1}`}
          />
        ))}
      </div>
      <div className="carousel-inner">
        {photos.map((photo, index) => (
          <div key={photo.path || index} className={`carousel-item ${index === 0 ? 'active' : ''}`}>
            <img className="report-media-img" src={photo.signedUrl} alt={photo.name || `foto ${index + 1}`} />
          </div>
        ))}
      </div>
      <button className="carousel-control-prev" type="button" data-bs-target={`#${carouselId}`} data-bs-slide="prev">
        <span className="carousel-control-prev-icon" aria-hidden="true" />
        <span className="visually-hidden">Anterior</span>
      </button>
      <button className="carousel-control-next" type="button" data-bs-target={`#${carouselId}`} data-bs-slide="next">
        <span className="carousel-control-next-icon" aria-hidden="true" />
        <span className="visually-hidden">Siguiente</span>
      </button>
    </div>
  );
}
