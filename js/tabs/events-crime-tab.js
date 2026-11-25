(function () {
    'use strict';
    var SCOPE = 'events';
    var TAB_ID = 'crime';
    function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v == null ? '' : String(v)) : ''; }
    function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type || 'info'); }
    function refresh() { if (window.TabManager && typeof window.TabManager.renderActive === 'function') window.TabManager.renderActive(SCOPE); }
    function locationName(id) {
        var p = window.LocationQueries && window.LocationQueries.getPlaceById ? window.LocationQueries.getPlaceById(id) : null;
        return p && (p.name || p.displayName) || id;
    }
    function render(container, context) {
        if (!container) return;
        var scopedId = context && context.locationId || '';
        var selectedId = scopedId;
        if (!selectedId && typeof window.getCurrentLocationId === 'function') {
            try { selectedId = window.getCurrentLocationId() || ''; } catch (e) {}
        }
        var options = typeof window.buildLocationDropdown === 'function'
            ? window.buildLocationDropdown(selectedId || '', null, true)
            : '<option value="">Select a location</option>';
        var locationControl = scopedId
            ? '<div class="events-crime__scope">Location: <strong>' + esc(locationName(scopedId)) + '</strong></div>'
            : '<label class="events-crime__field">Location <select data-crime-location>' + options + '</select></label>';
        var locationId = scopedId || selectedId;
        var crimes = locationId && window.CrimeQueries && window.CrimeQueries.getCrimesByLocation
            ? window.CrimeQueries.getCrimesByLocation(locationId) || [] : [];
        crimes = crimes.slice().sort(function(a,b) { return (b.year || 0) - (a.year || 0); });
        var html = '<style>.events-crime{display:flex;flex-direction:column;gap:.75rem;color:var(--text)}.events-crime__toolbar{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.events-crime__field{display:flex;gap:.5rem;align-items:center}.events-crime select,.events-crime input,.events-crime button{font:inherit;padding:.4rem .6rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);color:var(--text)}.events-crime__scope{color:var(--dim)}.events-crime__list{display:flex;flex-direction:column;gap:.5rem}.events-crime__row{padding:.65rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2)}.events-crime__muted{color:var(--dim)}</style>' +
            '<section class="events-crime"><div class="events-crime__toolbar">' + locationControl +
            '<button type="button" data-crime-action="create" ' + (!locationId ? 'disabled' : '') + '>Record Crime</button>' +
            '<button type="button" data-crime-action="refresh">Refresh</button></div>' +
            (!locationId ? '<p class="events-crime__muted">Select a location to view or record crimes.</p>' :
            '<p class="events-crime__muted">' + crimes.length + ' recorded crime(s) in this location.</p>' +
            '<div class="events-crime__list">' + (crimes.length ? crimes.map(function(c) {
                return '<article class="events-crime__row"><strong>' + esc(window.CrimeViewModels && window.CrimeViewModels.formatCrimeType ? window.CrimeViewModels.formatCrimeType(c.type) : c.type) +
                    '</strong> · ' + esc(c.year) + ' · ' + (c.solved ? 'Solved' : 'Unsolved') +
                    (c.perpetratorId && window.getCharacterById ? ' · ' + esc((window.getCharacterById(c.perpetratorId) || {}).name || 'Unknown perpetrator') : '') +
                    (c.victimId && window.getCharacterById ? ' → ' + esc((window.getCharacterById(c.victimId) || {}).name || 'Unknown victim') : '') +
                    (c.reason ? '<div>' + esc(c.reason) + '</div>' : '') + '</article>';
            }).join('') : '<p class="events-crime__muted">No crimes recorded here.</p>') + '</div>') + '</section>';
        container.innerHTML = html;
        if (container.__crimeWired) return;
        container.__crimeWired = true;
        container.addEventListener('change', function(e) {
            if (e.target.matches('[data-crime-location]')) {
                container.__crimeSelectedLocation = e.target.value;
                refresh();
            }
        });
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-crime-action]');
            if (!btn) return;
            if (btn.dataset.crimeAction === 'refresh') { refresh(); return; }
            if (btn.dataset.crimeAction === 'create') {
                var id = scopedId || container.__crimeSelectedLocation || selectedId;
                if (!id) { toast('Select a location first.', 'warning'); return; }
                if (!window.CrimeModals || typeof window.CrimeModals.openCreateCrimeModal !== 'function') {
                    toast('Crime creation modal is unavailable.', 'error'); return;
                }
                window.CrimeModals.openCreateCrimeModal({ locationId: id, onComplete: refresh });
            }
        });
        container.__crimeSelectedLocation = selectedId;
    }
    if (window.TabManager && typeof window.TabManager.register === 'function') window.TabManager.register(SCOPE, TAB_ID, render);
    window.EventsCrimeTab = { id: TAB_ID, render: render };
})();
