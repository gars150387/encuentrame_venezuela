async function logAudit(supabase, payload = {}) {
  if (!supabase) return;

  const { error } = await supabase.from('audit_logs').insert({
    report_id: payload.reportId || null,
    action: payload.action,
    actor_id: payload.actorId || null,
    source_ip: payload.sourceIp || null,
    user_agent: payload.userAgent || null,
    payload: payload.payload || {},
  });

  if (error) {
    console.error('audit_log_failed', error.message);
  }
}

module.exports = { logAudit };
