const DRAFT_KEY = 'encuentrame_draft_v1';
const CLIENT_ID_KEY = 'encuentrame_client_id_v1';

const form = document.getElementById('reportForm');
const steps = Array.from(document.querySelectorAll('.step-panel'));
const stepLabel = document.getElementById('stepLabel');
const stepProgress = document.getElementById('stepProgress');
const backBtn = document.getElementById('backBtn');
const nextBtn = document.getElementById('nextBtn');
const submitBtn = document.getElementById('submitBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const exportBtn = document.getElementById('exportBtn');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const results = document.getElementById('results');
const template = document.getElementById('resultTemplate');
const photoTemplate = document.getElementById('photoTemplate');
const photoInput = document.getElementById('fotos');
const photoPreview = document.getElementById('photoPreview');
const detailEmpty = document.getElementById('detailEmpty');
const detailPanel = document.getElementById('detailPanel');
const detailName = document.getElementById('detailName');
const detailMeta = document.getElementById('detailMeta');
const detailStatus = document.getElementById('detailStatus');
const detailVotes = document.getElementById('detailVotes');
const detailPhotos = document.getElementById('detailPhotos');
const detailPhone = document.getElementById('detailPhone');
const detailRelation = document.getElementById('detailRelation');
const detailAddress = document.getElementById('detailAddress');
const detailLastSeen = document.getElementById('detailLastSeen');
const detailNotes = document.getElementById('detailNotes');
const statTotal = document.getElementById('statTotal');
const statPending = document.getElementById('statPending');
const statVerified = document.getElementById('statVerified');
const statPhotos = document.getElementById('statPhotos');
const systemAlert = document.getElementById('systemAlert');
const voteConfirmBtn = document.getElementById('voteConfirmBtn');
const voteDenyBtn = document.getElementById('voteDenyBtn');

let currentStep = 1;
let selectedReportId = null;
let pendingPhotos = [];
let reports = [];
let stats = { total: 0, pending: 0, confirmed: 0, disputed: 0, localized: 0, rejected: 0, withPhotos: 0 };
let totalMatches = 0;
let currentOffset = 0;
let currentLimit = 25;
let hasMore = false;
let searchTimer = null;

function getClientId() {
  let value = localStorage.getItem(CLIENT_ID_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, value);
  }
  return value;
}

const clientId = getClientId();

function setAlert(message, tone = 'warning') {
  systemAlert.className = `alert alert-${tone} border-0 shadow-sm`;
  systemAlert.textContent = message;
}

function statusLabel(status) {
  if (status === 'confirmed') return { text: 'Confirmado', cls: 'text-bg-success' };
  if (status === 'disputed') return { text: 'En disputa', cls: 'text-bg-warning' };
  if (status === 'localized') return { text: 'Localizado', cls: 'text-bg-primary' };
  if (status === 'rejected') return { text: 'Rechazado', cls: 'text-bg-dark' };
  return { text: 'Pendiente', cls: 'text-bg-secondary' };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = new Error(body?.error || 'request_failed');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

function normalize(value = '') {
  return value.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function updateStats() {
  statTotal.textContent = String(stats.total || 0);
  statPending.textContent = String(stats.pending || 0);
  statVerified.textContent = String(stats.confirmed || 0);
  statPhotos.textContent = String(stats.withPhotos || 0);
}

function updateStepView() {
  steps.forEach((step) => step.classList.toggle('d-none', Number(step.dataset.step) !== currentStep));
  stepLabel.textContent = `Paso ${currentStep} de ${steps.length}`;
  stepProgress.style.width = `${(currentStep / steps.length) * 100}%`;
  backBtn.disabled = currentStep === 1;
  nextBtn.classList.toggle('d-none', currentStep === steps.length);
  submitBtn.classList.toggle('d-none', currentStep !== steps.length);
}

function renderPhotoPreview() {
  photoPreview.innerHTML = '';
  pendingPhotos.slice(0, 3).forEach((photo) => {
    const node = photoTemplate.content.cloneNode(true);
    node.querySelector('img').src = photo.dataUrl;
    photoPreview.appendChild(node);
  });
}

function renderResults() {
  results.innerHTML = '';

  if (!reports.length) {
    results.innerHTML = '<div class="text-secondary small">No hay resultados.</div>';
    detailEmpty.classList.remove('d-none');
    detailPanel.classList.add('d-none');
    loadMoreBtn.classList.add('d-none');
    return;
  }

  reports.forEach((report) => {
    const node = template.content.cloneNode(true);
    const title = `${report.firstName} ${report.lastName}`;
    const badge = statusLabel(report.status);

    node.querySelector('.js-name').textContent = title;
    node.querySelector('.js-zone').textContent = report.address;
    node.querySelector('.js-phone').textContent = report.phone;
    const badgeEl = node.querySelector('.js-badge');
    badgeEl.textContent = badge.text;
    badgeEl.className = `badge js-badge ${badge.cls}`;

    const button = node.querySelector('button');
    button.dataset.id = report.id;
    if (report.id === selectedReportId) button.classList.add('active');
    button.addEventListener('click', () => {
      selectedReportId = report.id;
      renderResults();
      loadDetail(report.id);
    });

    results.appendChild(node);
  });

  loadMoreBtn.classList.toggle('d-none', !hasMore);
  loadMoreBtn.textContent = hasMore ? 'Cargar más' : 'Sin más resultados';
}

function renderDetail(report) {
  if (!report) {
    detailEmpty.classList.remove('d-none');
    detailPanel.classList.add('d-none');
    return;
  }

  const badge = statusLabel(report.status);
  detailEmpty.classList.add('d-none');
  detailPanel.classList.remove('d-none');
  detailName.textContent = `${report.firstName} ${report.lastName}`;
  detailMeta.textContent = `Creado el ${new Date(report.createdAt).toLocaleString('es-VE')}`;
  detailStatus.textContent = badge.text;
  detailStatus.className = `badge ${badge.cls}`;
  detailVotes.textContent = `${report.voteTally?.confirm || 0} confirmaciones, ${report.voteTally?.deny || 0} negativas`;
  detailPhone.textContent = report.phone;
  detailRelation.textContent = report.relation;
  detailAddress.textContent = report.address;
  detailLastSeen.textContent = report.lastSeenAt ? new Date(report.lastSeenAt).toLocaleString('es-VE') : '-';
  detailNotes.textContent = [report.age ? `Edad: ${report.age}.` : '', report.documentId ? `ID: ${report.documentId}.` : '', report.notes || ''].filter(Boolean).join(' ');

  detailPhotos.innerHTML = '';
  if (!report.photos?.length) {
    detailPhotos.innerHTML = '<span class="text-secondary small">Sin fotos cargadas.</span>';
  } else {
    report.photos.forEach((photo) => {
      const node = photoTemplate.content.cloneNode(true);
      node.querySelector('img').src = photo.dataUrl;
      detailPhotos.appendChild(node);
    });
  }
}

async function loadDetail(id) {
  try {
    const report = await apiRequest(`/api/reports/${id}`);
    renderDetail(report);
  } catch {
    renderDetail(null);
  }
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    ['nombre', 'apellidos', 'telefono', 'relacion', 'ultimaVez', 'direccion', 'edad', 'documento', 'señas'].forEach((field) => {
      const input = document.getElementById(field);
      if (input && draft[field]) input.value = draft[field];
    });
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function saveDraft() {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      nombre: document.getElementById('nombre').value,
      apellidos: document.getElementById('apellidos').value,
      telefono: document.getElementById('telefono').value,
      relacion: document.getElementById('relacion').value,
      ultimaVez: document.getElementById('ultimaVez').value,
      direccion: document.getElementById('direccion').value,
      edad: document.getElementById('edad').value,
      documento: document.getElementById('documento').value,
      señas: document.getElementById('señas').value,
    }),
  );
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function buildPayloadFromForm() {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    nombre: data.nombre.trim(),
    apellidos: data.apellidos.trim(),
    telefono: data.telefono.trim(),
    relacion: data.relacion,
    ultimaVez: data.ultimaVez,
    direccion: data.direccion.trim(),
    edad: data.edad?.trim() || '',
    documento: data.documento?.trim() || '',
    señas: data.señas?.trim() || '',
    photos: pendingPhotos.slice(0, 3),
  };
}

function resetFormState() {
  form.reset();
  pendingPhotos = [];
  renderPhotoPreview();
  currentStep = 1;
  updateStepView();
}

function getFilters() {
  return {
    q: searchInput.value.trim(),
    status: statusFilter.value,
  };
}

async function loadReports({ reset = true } = {}) {
  if (reset) currentOffset = 0;

  const { q, status } = getFilters();
  const url = new URL('/api/reports', window.location.origin);
  url.searchParams.set('limit', String(currentLimit));
  url.searchParams.set('offset', String(currentOffset));
  url.searchParams.set('q', q);
  url.searchParams.set('status', status);

  try {
    const payload = await apiRequest(url.pathname + url.search);
    reports = payload.items || [];
    stats = payload.stats || stats;
    totalMatches = payload.total || 0;
    hasMore = Boolean(payload.hasMore);
    updateStats();
    renderResults();
    if (selectedReportId && !reports.some((report) => report.id === selectedReportId)) {
      selectedReportId = reports[0]?.id ?? null;
    }
    if (selectedReportId) {
      await loadDetail(selectedReportId);
    } else {
      renderDetail(null);
    }
    setAlert(`Base activa. ${totalMatches} resultados visibles de ${stats.total} reportes.`, 'success');
  } catch {
    reports = [];
    stats = { total: 0, pending: 0, confirmed: 0, disputed: 0, localized: 0, rejected: 0, withPhotos: 0 };
    hasMore = false;
    updateStats();
    renderResults();
    renderDetail(null);
    setAlert('No se pudo conectar con el backend. Ejecuta `npm start` para cargar la API.', 'danger');
  }
}

async function voteOnSelected(vote) {
  if (!selectedReportId) return;

  try {
    await apiRequest(`/api/reports/${selectedReportId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote, clientId }),
    });
    await loadReports({ reset: false });
  } catch {
    alert('No se pudo registrar tu voto.');
  }
}

backBtn.addEventListener('click', () => {
  currentStep = Math.max(1, currentStep - 1);
  updateStepView();
});

nextBtn.addEventListener('click', () => {
  const requiredFields = steps[currentStep - 1].querySelectorAll('[required]');
  const allValid = Array.from(requiredFields).every((field) => field.checkValidity());
  if (!allValid) {
    form.reportValidity();
    return;
  }

  currentStep = Math.min(steps.length, currentStep + 1);
  updateStepView();
});

saveDraftBtn.addEventListener('click', () => {
  saveDraft();
  saveDraftBtn.textContent = 'Borrador guardado';
  setTimeout(() => (saveDraftBtn.textContent = 'Guardar borrador'), 1200);
});

photoInput.addEventListener('change', async () => {
  const files = Array.from(photoInput.files || []).slice(0, 3);
  pendingPhotos = [];

  for (const file of files) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });

    pendingPhotos.push({ name: file.name, type: file.type, dataUrl });
  }

  renderPhotoPreview();
  photoInput.value = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = buildPayloadFromForm();

  try {
    const created = await apiRequest('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    selectedReportId = created.id;
    clearDraft();
    alert('Reporte enviado a la base comunitaria.');
    resetFormState();
    await loadReports({ reset: true });
  } catch (error) {
    if (error.status === 400) {
      alert('Faltan campos obligatorios.');
      return;
    }

    if (error.status === 409) {
      alert('El backend detectó un duplicado.');
      return;
    }

    alert('No se pudo enviar el reporte.');
  }
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadReports({ reset: true }), 250);
});

statusFilter.addEventListener('change', () => loadReports({ reset: true }));

loadMoreBtn.addEventListener('click', async () => {
  currentOffset += currentLimit;
  const { q, status } = getFilters();
  const url = new URL('/api/reports', window.location.origin);
  url.searchParams.set('limit', String(currentLimit));
  url.searchParams.set('offset', String(currentOffset));
  url.searchParams.set('q', q);
  url.searchParams.set('status', status);

  try {
    const payload = await apiRequest(url.pathname + url.search);
    reports = [...reports, ...(payload.items || [])];
    hasMore = Boolean(payload.hasMore);
    renderResults();
  } catch {
    alert('No se pudieron cargar mas resultados.');
  }
});

voteConfirmBtn.addEventListener('click', (event) => {
  event.preventDefault();
  voteOnSelected('confirm');
});

voteDenyBtn.addEventListener('click', (event) => {
  event.preventDefault();
  voteOnSelected('deny');
});

exportBtn.addEventListener('click', async () => {
  try {
    const payload = await apiRequest('/api/reports/export');
    const blob = new Blob([JSON.stringify(payload.items || payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'encuentrame-reportes.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('No se pudo exportar la base.');
  }
});

async function init() {
  restoreDraft();
  updateStepView();
  renderPhotoPreview();
  await loadReports({ reset: true });
}

init();
