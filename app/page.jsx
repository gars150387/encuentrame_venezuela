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

const initialStats = { total: 0, pending: 0, confirmed: 0, disputed: 0, localized: 0, rejected: 0, withPhotos: 0 };

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
  if (status === 'confirmed') return ['Confirmado', 'text-bg-success'];
  if (status === 'disputed') return ['En disputa', 'text-bg-warning'];
  if (status === 'localized') return ['Localizado', 'text-bg-primary'];
  if (status === 'rejected') return ['Rechazado', 'text-bg-dark'];
  return ['Pendiente', 'text-bg-secondary'];
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

  async function vote(voteValue) {
    if (!selected?.id) return;
    const response = await fetch(`/api/reports/${selected.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: voteValue, voterId: clientId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data?.error || 'No se pudo registrar el voto.');
      return;
    }

    setMessage('Voto registrado.');
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

  return (
    <main className="container py-4 py-md-5">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <span className="badge text-bg-danger-subtle text-danger border border-danger-subtle mb-2">MVP de emergencia</span>
          <h1 className="display-6 fw-bold mb-2">Base comunitaria de reportes</h1>
          <p className="text-secondary mb-0">Registro, validacion por comunidad, fotos en storage externo y auditado desde el inicio.</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={exportData}>Exportar JSON</button>
        </div>
      </div>

      <div className="alert alert-warning border-0 shadow-sm">{message || 'Los datos sensibles se validan por comunidad antes de consolidarse.'}</div>

      <div className="row g-4 mb-4">
        <StatCard title="Reportes" value={stats.total} />
        <StatCard title="Pendientes" value={stats.pending} />
        <StatCard title="Confirmados" value={stats.confirmed} />
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
                <span className="badge text-bg-primary">Paso {step} de 3</span>
              </div>
              <div className="progress mb-4" style={{ height: 8 }}>
                <div className="progress-bar" style={{ width: `${(step / 3) * 100}%` }} />
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
                    <h3 className="h6 text-uppercase text-secondary mb-3">Fotos y confirmacion</h3>
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label">Fotos</label>
                        <input className="form-control" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))} />
                        <div className="form-text">Maximo 3 imagenes por reporte.</div>
                      </div>
                      <div className="col-12 d-flex flex-wrap gap-2">{previewUrls.map((url) => <span key={url} className="photo-pill"><img src={url} alt="preview" /></span>)}</div>
                      <div className="col-12">
                        <div className="form-check">
                          <input className="form-check-input" type="checkbox" id="consent" required />
                          <label className="form-check-label" htmlFor="consent">Confirmo que la informacion es correcta y acepto la revision comunitaria.</label>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <div className="d-flex gap-2 justify-content-between mt-4">
                  <button type="button" className="btn btn-outline-secondary" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>Anterior</button>
                  <div className="d-flex gap-2 flex-wrap justify-content-end">
                    <button type="button" className="btn btn-outline-primary" onClick={() => window.localStorage.setItem('encuentrame_draft_v1', JSON.stringify(form))}>Guardar borrador</button>
                    {step < 3 ? (
                      <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep((value) => Math.min(3, value + 1))}>Siguiente</button>
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
                  <p className="text-secondary mb-0">La comunidad confirma o niega cada caso.</p>
                </div>
                <select className="form-select w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">Todos</option>
                  <option value="pending">Pendientes</option>
                  <option value="confirmed">Confirmados</option>
                  <option value="disputed">En disputa</option>
                  <option value="localized">Localizados</option>
                  <option value="rejected">Rechazados</option>
                </select>
              </div>
              <input className="form-control mb-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, zona o telefono" />
              <div className="list-group">
                {reports.map((report) => {
                  const [label, cls] = statusMeta(report.status);
                  return (
                    <button key={report.id} type="button" className={`list-group-item list-group-item-action report-item ${selected?.id === report.id ? 'active' : ''}`} onClick={() => setSelected(report)}>
                      <div className="d-flex justify-content-between align-items-start gap-3">
                        <div className="min-w-0">
                          <div className="fw-semibold">{report.firstName} {report.lastName}</div>
                          <div className="small text-secondary">{report.address}</div>
                          <div className="small">{report.phone}</div>
                        </div>
                        <span className={`badge ${cls}`}>{label}</span>
                      </div>
                    </button>
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

                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="small text-secondary">Votos comunitarios</div>
                    <div className="small fw-semibold">{selectedReport.voteTally?.confirm || 0} confirmaciones, {selectedReport.voteTally?.deny || 0} negativas</div>
                  </div>

                  <div className="d-flex flex-wrap gap-2 mb-3">{(selectedReport.photos || []).map((photo) => photo.signedUrl ? <span key={photo.path} className="photo-pill"><img src={photo.signedUrl} alt={photo.name || 'foto'} /></span> : null)}</div>

                  <dl className="row mb-0">
                    <dt className="col-5">Telefono</dt><dd className="col-7">{selectedReport.phone}</dd>
                    <dt className="col-5">Relacion</dt><dd className="col-7">{selectedReport.relation}</dd>
                    <dt className="col-5">Direccion</dt><dd className="col-7">{selectedReport.address}</dd>
                    <dt className="col-5">Ultima vez</dt><dd className="col-7">{selectedReport.lastSeenAt ? new Date(selectedReport.lastSeenAt).toLocaleString('es-VE') : '-'}</dd>
                    <dt className="col-5">Señas</dt><dd className="col-7">{[selectedReport.age ? `Edad: ${selectedReport.age}.` : '', selectedReport.documentId ? `ID: ${selectedReport.documentId}.` : '', selectedReport.notes || ''].filter(Boolean).join(' ')}</dd>
                  </dl>

                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <button className="btn btn-success btn-sm" onClick={() => vote('confirm')}>Confirmar</button>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => vote('deny')}>Negar</button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h2 className="h5 mb-3">Proceso</h2>
              <div className="d-flex justify-content-between mb-2"><span>Captura</span><span className="badge text-bg-primary">Lista</span></div>
              <div className="d-flex justify-content-between mb-2"><span>Validacion</span><span className="badge text-bg-warning">Comunitaria</span></div>
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
