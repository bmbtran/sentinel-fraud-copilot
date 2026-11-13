const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
export function renderIncidentSummary(incident) {
  return `<article class="incident-summary"><div class="incident-head"><div><p class="eyebrow">INCIDENT SUMMARY · DEMO ONLY</p><h2>Everything you need to explain this charge</h2><p>${escapeHtml(incident.charge.merchant)} · ${money(incident.charge.amount)} · ${escapeHtml(incident.charge.date)}</p></div><span class="prepared">Prepared</span></div><div class="incident-columns"><section><b>Why it was surfaced</b><ul>${incident.evidence.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("")}</ul></section><section><b>Linked activity</b><ul>${incident.related.map((item) => `<li><strong>${escapeHtml(item.merchant)} · ${money(item.amount)}</strong><span>${escapeHtml(item.note)}</span></li>`).join("") || "<li><span>No nearby linked activity</span></li>"}</ul></section></div><div class="incident-footer"><div><b>Next:</b> ${escapeHtml(incident.nextSteps[1])}</div><button class="outline" data-copy-incident>Copy summary</button></div></article>`;
}
