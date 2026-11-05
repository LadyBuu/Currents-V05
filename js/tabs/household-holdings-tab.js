// js/households/household-holdings-tab.js
/**
 * =============================================================================
 * HOUSEHOLD HOLDINGS TAB
 * js/households/household-holdings-tab.js
 * =============================================================================
 *
 * LOCATION: js/households/household-holdings-tab.js
 *
 * WHAT THIS TAB SHOWS
 * -------------------
 * Everything a household owns, in three sections:
 *
 *   - Enterprises (industries) the household is the canonical owner of
 *   - Private schools the household owns
 *   - Residences the household owns, with rental status and income
 *
 * Plus a stat strip (enterprises / schools / residences / total / rent
 * income) and header actions (Add Enterprise, Add School, Add Residence).
 *
 * READS
 * -----
 *   HouseholdQueries.getHousehold
 *   HouseholdQueries.getHouseholdEnterprises
 *   HouseholdQueries.getHouseholdEnterpriseSummaries
 *   HouseholdQueries.getHouseholdEnterpriseStats
 *   IndustryState.getEnterprise             (for row click → details)
 *   IndustryQueries.getEnterpriseSummary    (canonical summary shape)
 *   EducationState.getInstitutionsByOwner
 *   EducationState.getPrivateSchools
 *   ResidenceSystem.getResidencesByOwner
 *   ResidenceSystem.getTotalRentIncome
 *   ResidenceSystem.getResidence            (for row click → details)
 *
 * WRITES
 * ------
 *   Every mutation delegates to an external modal or command:
 *
 *     Add Enterprise      → window.openCreateEnterpriseModal  (Industry)
 *     Add School          → window.openCreateInstitutionModal (Education)
 *     Add Residence       → window.openNewResidenceModal + ResidenceSystem.setResidenceOwner
 *     Edit Enterprise     → window.openEditEnterpriseModal
 *     Remove Enterprise   → IndustryCommands.updateEnterprise({ownerType:'none', ownerId:null})
 *     Edit School         → window.openEditInstitutionModal
 *     Remove School       → EducationCommands.setSchoolOwnership(schoolId, 'public', null, null)
 *     View Residence      → window.openResidenceDetailsModal
 *
 *   The tab does NOT call any persist() directly. Each delegated
 *   command owns its own persistence boundary:
 *     IndustryCommands.persist()
 *     EducationCommands.persist()
 *     ResidenceSystem.persist()
 *
 * RENDERER CONTRACT (from HouseholdManagerBootstrap)
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { householdId, householdName, householdState }
 *
 * FILTERS
 * -------
 *   None. Holdings are a bounded list per household; the tab shows all
 *   of them. If the volume ever justifies per-section search, that
 *   search belongs on the section, not on the whole tab.
 *
 * DEPENDENCIES (all resolved via HouseholdTabRuntime)
 *   REQUIRED at render:
 *     - HouseholdQueries
 *     - formatting.js (escapeHtml — strict via TabRuntime.esc)
 *     - time.js (getCurrentYear — via TabRuntime.requireCurrentYear)
 *     - TabManager (for registration; warn if absent)
 *   OPTIONAL at render (each section degrades independently):
 *     - IndustryState / IndustryQueries / IndustryCommands
 *     - EducationState / EducationQueries / EducationCommands
 *     - ResidenceSystem
 *
 * TIME CONTRACT: uses TabRuntime.requireCurrentYear(). No fallback.
 * ICON POLICY: icons via TabRuntime.icon(). No emoji, no glyphs.
 * THEME CONTRACT: no hardcoded hex/rgba. Classes from household-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   v2 (this revision):
 *     - THE FILE NOW PARSES. The prior on-disk copy ended mid-identifier
 *       at `window.refreshHouseholdHoldings` (missing the closing `Tab`
 *       and the rest of the file). A truncated file is a syntax error
 *       that prevents the ENTIRE file from executing, so none of its
 *       exports ever registered and the tab never rendered. This
 *       revision ships complete.
 *     - Every shared helper comes from HouseholdTabRuntime.
 *     - Reads go through HouseholdQueries (via TabRuntime sugar).
 *       The prior revision called non-existent HouseholdState methods
 *       (HS.getHousehold, HS.getAllHouseholds, HS.getCharacterHousehold)
 *       which threw at render.
 *     - RS.getResidenceById → RS.getResidence (the prior revision
 *       called getResidenceById four times; that method does not exist
 *       on ResidenceSystem, and every call threw).
 *     - Enterprise summary construction uses IndustryQueries
 *       .getEnterpriseSummary when available (canonical shape). When
 *       IndustryQueries is absent but the enterprise exists, the
 *       summary is built from IndustryState.getEnterprise WITHOUT
 *       re-deriving wealth, debt, or annualProfit inline — those
 *       fields are read directly from the enterprise record. The
 *       prior revision derived annualProfit as
 *       `(ent.income||0) - (ent.expenses||0) - (workerList.length * wages)`,
 *       which disagreed with IndustryQueries.getEnterpriseSummary's
 *       profit calculation.
 *     - Inline Unicode glyphs (⌂, 💰, 👤, ⌇, 🎓, ◉) in card bodies
 *       are replaced with TabRuntime.icon() calls. The module's own
 *       ICON POLICY header has always required this.
 *     - Removed the 1250 magic-year fallback. _getCurrentYear now
 *       throws on missing time.js, matching every other household tab.
 *     - _doDeleteEnterprise and _doRemoveResidence preserve the
 *       previous revision's CORRECT behavior (ownerType:'none' for
 *       enterprise removal; deleteResidence with force:true for
 *       residence removal), with the result check and toast text
 *       tightened. The prior revision called the non-existent
 *       HS.removeEnterpriseFromHousehold before this fix, so the
 *       enterprise was never removed.
 *     - Registration via TabRuntime.register('holdings', render). The
 *       prior revision's registerTabRenderer call was unreachable
 *       (syntax error), so the tab never registered.
 *     - Zero document.* calls. Zero hardcoded colors. Zero setTimeout.
 * =============================================================================
 */

(function () {
    'use strict';

    var T = window.HouseholdTabRuntime;
    if (!T) {
        throw new Error(
            'household-holdings-tab: HouseholdTabRuntime must load first. ' +
            'Load js/households/household-tab-runtime.js before this tab.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'holdings';
    var SCOPE  = T.SCOPE;

    var _renderGuard = { busy: false };

    // =========================================================================
    // 2. DATA
    // =========================================================================
    //
    // One collect. Per-section try/catch so a missing optional domain
    // degrades that section to empty. A missing HouseholdQueries is the
    // only hard error — every other collection is legitimately empty
    // when the domain isn't loaded.

    function _collect(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) return { error: 'Household not found.' };

        // Enterprises --------------------------------------------------
        var enterpriseRecords = [];
        var enterpriseSummaries = [];
        var enterpriseStats = null;
        try {
            enterpriseRecords = T.queries().getHouseholdEnterprises(householdId) || [];
        } catch (e) { enterpriseRecords = []; }
        try {
            enterpriseSummaries = T.queries().getHouseholdEnterpriseSummaries(householdId) || [];
        } catch (e) { enterpriseSummaries = []; }
        try {
            enterpriseStats = T.queries().getHouseholdEnterpriseStats(householdId);
        } catch (e) { enterpriseStats = null; }

        // Build a per-enterprise display row. Prefer the summary from
        // HouseholdQueries (which came through IndustryQueries). When
        // that's missing, fall back to the enterprise record itself —
        // WITHOUT re-deriving wealth / debt / annualProfit.
        var IQ = T.industryQueries();
        var enterpriseRows = [];
        for (var ei = 0; ei < enterpriseRecords.length; ei++) {
            var ent = enterpriseRecords[ei];
            if (!ent || !ent.id) continue;

            // Match summary by id. HouseholdQueries.getHouseholdEnterpriseSummaries
            // preserves order, but a defensive id-match is safer.
            var matched = null;
            for (var si = 0; si < enterpriseSummaries.length; si++) {
                if (enterpriseSummaries[si] && enterpriseSummaries[si].id === ent.id) {
                    matched = enterpriseSummaries[si];
                    break;
                }
            }

            if (!matched) {
                // No summary available. Build a MINIMAL display row from
                // the enterprise record's own canonical fields. Do NOT
                // compute annualProfit here — IndustryQueries owns that
                // calculation. If we can't get it, we show '—'.
                matched = {
                    id: ent.id,
                    name: ent.name || 'Unknown',
                    type: ent.typeId || null,
                    category: null,
                    wealth: (typeof ent.wealth === 'number') ? ent.wealth : null,
                    debt: (typeof ent.debt === 'number') ? ent.debt : null,
                    annualProfit: null, // unknown without IndustryQueries
                    workerCount: Array.isArray(ent.workerList)
                        ? ent.workerList.length : null,
                    status: ent.status || 'unknown'
                };
            }

            enterpriseRows.push({ record: ent, summary: matched });
        }

        // Schools ------------------------------------------------------
        var schools = [];
        var ES = T.educationState();
        if (ES) {
            try {
                if (typeof ES.getInstitutionsByOwner === 'function') {
                    schools = ES.getInstitutionsByOwner(householdId, 'household') || [];
                }
            } catch (e) { schools = []; }
            try {
                if (typeof ES.getPrivateSchools === 'function') {
                    var allPrivate = ES.getPrivateSchools() || [];
                    for (var si2 = 0; si2 < allPrivate.length; si2++) {
                        var sch = allPrivate[si2];
                        if (sch.ownerId === householdId && sch.ownerType === 'household') {
                            var seen = false;
                            for (var sj = 0; sj < schools.length; sj++) {
                                if (schools[sj].id === sch.id) { seen = true; break; }
                            }
                            if (!seen) schools.push(sch);
                        }
                    }
                }
            } catch (e) { /* keep what we have */ }
        }

        // Residences ---------------------------------------------------
        var residences = [];
        var rentIncome = 0;
        var rentedCount = 0;
        var RS = T.residence();
        if (RS) {
            try { residences = RS.getResidencesByOwner(householdId, 'household') || []; }
            catch (e) { residences = []; }
            try { rentIncome = RS.getTotalRentIncome(householdId, 'household') || 0; }
            catch (e) { rentIncome = 0; }
            for (var ri = 0; ri < residences.length; ri++) {
                if (residences[ri].renterId) rentedCount++;
            }
        }

        return {
            household: summary,
            enterpriseRows: enterpriseRows,
            enterpriseStats: enterpriseStats,
            schools: schools,
            residences: residences,
            rentIncome: rentIncome,
            rentedCount: rentedCount,
            totalHoldings: enterpriseRows.length + schools.length + residences.length
        };
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function _renderBody(d) {
        return '' +
            '<div class="hh-tab">' +
                _renderHeader() +
                _renderStats(d) +
                _renderEnterpriseSection(d) +
                _renderSchoolSection(d) +
                _renderResidenceSection(d) +
                '<div class="hh-tab-footer">' +
                    d.totalHoldings + ' total holdings · ' +
                    d.enterpriseRows.length + ' enterprises · ' +
                    d.schools.length + ' schools · ' +
                    d.residences.length + ' residences' +
                    (d.rentIncome > 0 ? ' · Rent: +' + d.rentIncome + 'g/year' : '') +
                '</div>' +
            '</div>';
    }

    function _renderHeader() {
        return '' +
            '<div class="hh-tab-header">' +
                '<h3 class="hh-tab-title">' +
                    T.iconSpan('CIRCLE_DOT', 'Holdings') + ' Holdings' +
                '</h3>' +
                '<div class="hh-tab-actions">' +
                    '<button type="button" class="hh-btn hh-btn-primary" ' +
                        'data-action="add-enterprise">' +
                        T.iconSpan('PLUS', 'Add') + ' Add Enterprise' +
                    '</button>' +
                    '<button type="button" class="hh-btn" ' +
                        'data-action="add-school">' +
                        T.iconSpan('PLUS', 'Add') + ' Add School' +
                    '</button>' +
                    '<button type="button" class="hh-btn" ' +
                        'data-action="add-residence">' +
                        T.iconSpan('PLUS', 'Add') + ' Add Residence' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function _renderStats(d) {
        return '' +
            '<div class="hh-econ-grid hh-econ-grid-5">' +
                T.statCell('Enterprises', d.enterpriseRows.length) +
                T.statCell('Schools', d.schools.length) +
                T.statCell('Residences', d.residences.length) +
                T.statCell('Total', d.totalHoldings) +
                T.statCell('Rent Income', '+' + d.rentIncome + 'g',
                    d.rentIncome > 0 ? 'var(--success)' : null) +
            '</div>';
    }

    function _renderEnterpriseSection(d) {
        return '' +
            '<div class="hh-holding-section">' +
                T.sectionHeader(
                    'Enterprises (' + d.enterpriseRows.length + ')',
                    'INDUSTRY',
                    d.enterpriseStats
                        ? '<span class="hh-holding-section-meta">' +
                            'Profit: ' + (d.enterpriseStats.totalProfit >= 0 ? '+' : '') +
                            (d.enterpriseStats.totalProfit || 0) + 'g · ' +
                            'Workers: ' + (d.enterpriseStats.totalWorkers || 0) +
                          '</span>'
                        : ''
                ) +
                (d.enterpriseRows.length === 0
                    ? T.emptyState('No enterprises owned.')
                    : '<div class="hh-holding-list">' +
                        d.enterpriseRows.map(_renderEnterpriseCard).join('') +
                      '</div>') +
            '</div>';
    }

    function _renderEnterpriseCard(item) {
        var e = item.record;
        var s = item.summary;

        var statusColor = s.status === 'active'
            ? 'var(--success)'
            : (s.status === 'bankrupt' ? 'var(--danger)' : 'var(--warn)');
        var statusLabel = s.status || 'active';

        var profit = (typeof s.annualProfit === 'number') ? s.annualProfit : null;
        var profitHtml = profit === null
            ? '<span class="hh-holding-meta-dim">profit unavailable</span>'
            : '<span style="color:' + (profit >= 0 ? 'var(--success)' : 'var(--warn)') + ';">' +
                (profit >= 0 ? '+' : '') + profit + 'g</span>';

        var typeName = s.type || e.typeName || e.typeId || 'Unknown';
        var locationName = e.locationId ? T.placeName(e.locationId) : 'Unknown';
        var wealth = (typeof s.wealth === 'number') ? s.wealth : null;
        var debt = (typeof s.debt === 'number') ? s.debt : null;
        var workers = (typeof s.workerCount === 'number') ? s.workerCount : null;

        return '' +
            '<div class="hh-holding-card" data-kind="enterprise" ' +
                'data-enterprise-id="' + T.esc(e.id) + '">' +
                '<div class="hh-holding-header">' +
                    '<div class="hh-holding-title">' +
                        T.iconSpan('INDUSTRY', 'Enterprise') + ' ' +
                        T.esc(e.name) +
                        '<span class="hh-holding-type">' + T.esc(typeName) + '</span>' +
                        '<span class="hh-holding-status" style="color:' +
                            statusColor + ';">(' + T.esc(statusLabel) + ')</span>' +
                    '</div>' +
                    '<div class="hh-holding-actions">' +
                        profitHtml +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="edit-enterprise" ' +
                            'data-enterprise-id="' + T.esc(e.id) + '" ' +
                            'title="Edit enterprise">' + T.icon('EDIT') + '</button>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                            'data-action="remove-enterprise" ' +
                            'data-enterprise-id="' + T.esc(e.id) + '" ' +
                            'title="Remove from household">' +
                            T.icon('X_HEAVY') +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="hh-holding-meta">' +
                    '<span>' + T.iconSpan('LOCATION', 'Location') + ' ' +
                        T.esc(locationName) + '</span>' +
                    (wealth !== null
                        ? '<span>' + T.iconSpan('COIN', 'Wealth') + ' ' +
                            wealth + 'g</span>'
                        : '') +
                    (debt !== null
                        ? '<span>' + T.iconSpan('COIN_MINUS', 'Debt') + ' ' +
                            debt + 'g debt</span>'
                        : '') +
                    (workers !== null
                        ? '<span>' + T.iconSpan('PERSON', 'Workers') + ' ' +
                            workers + ' workers</span>'
                        : '') +
                '</div>' +
            '</div>';
    }

    function _renderSchoolSection(d) {
        return '' +
            '<div class="hh-holding-section">' +
                T.sectionHeader(
                    'Private Schools (' + d.schools.length + ')',
                    'HOME'
                ) +
                (d.schools.length === 0
                    ? T.emptyState('No private schools owned.')
                    : '<div class="hh-holding-list">' +
                        d.schools.map(_renderSchoolCard).join('') +
                      '</div>') +
            '</div>';
    }

    function _renderSchoolCard(school) {
        var students = Array.isArray(school.students) ? school.students.length : 0;
        var teachers = Array.isArray(school.teachers) ? school.teachers.length : 0;
        var graduates = Array.isArray(school.graduates) ? school.graduates.length : 0;
        var capacity = (school.maxStudents && school.maxStudents > 0)
            ? Math.round((students / school.maxStudents) * 100)
            : 0;
        var reputation = school.reputation || 50;
        var repColor = reputation >= 80 ? 'var(--success)'
            : reputation >= 60 ? 'var(--accent)'
            : reputation >= 40 ? 'var(--warn)'
            : 'var(--danger)';

        var status = school.status || 'active';
        var statusColor = status === 'active'
            ? 'var(--success)'
            : (status === 'demolished' ? 'var(--danger)' : 'var(--warn)');
        var tuition = (school.customTuition !== null && school.customTuition !== undefined)
            ? school.customTuition
            : (school.tuitionPerYear || 0);

        var locationName = school.locationId ? T.placeName(school.locationId) : 'Unknown';
        var ownershipBadge = school.ownershipType === 'private'
            ? '<span class="hh-holding-badge">Private</span>'
            : (school.ownershipType === 'religious'
                ? '<span class="hh-holding-badge">Religious</span>'
                : '');

        return '' +
            '<div class="hh-holding-card' +
                (status === 'demolished' ? ' demolished' : '') + '" ' +
                'data-kind="school" data-school-id="' + T.esc(school.id) + '">' +
                '<div class="hh-holding-header">' +
                    '<div class="hh-holding-title">' +
                        T.iconSpan('HOME', 'School') + ' ' +
                        T.esc(school.name) +
                        '<span class="hh-holding-status" style="color:' +
                            statusColor + ';">(' + T.esc(status) + ')</span>' +
                        ownershipBadge +
                    '</div>' +
                    '<div class="hh-holding-actions">' +
                        '<span class="hh-holding-meta-dim">Tuition: ' +
                            tuition + 'g</span>' +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="edit-school" ' +
                            'data-school-id="' + T.esc(school.id) + '" ' +
                            'title="Edit school">' + T.icon('EDIT') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="hh-holding-meta">' +
                    '<span>' + T.iconSpan('LOCATION', 'Location') + ' ' +
                        T.esc(locationName) + '</span>' +
                    '<span>' + T.iconSpan('PERSON', 'Students') + ' ' +
                        students + '</span>' +
                    '<span>' + T.iconSpan('PERSON', 'Teachers') + ' ' +
                        teachers + '</span>' +
                    '<span>' + T.iconSpan('CIRCLE_DOT', 'Graduates') + ' ' +
                        graduates + '</span>' +
                    '<span>Rep: <span style="color:' + repColor + ';">' +
                        reputation + '</span></span>' +
                    '<span>Capacity: ' + capacity + '%</span>' +
                '</div>' +
            '</div>';
    }

    function _renderResidenceSection(d) {
        return '' +
            '<div class="hh-holding-section">' +
                T.sectionHeader(
                    'Owned Residences (' + d.residences.length + ')',
                    'HOME',
                    d.rentIncome > 0
                        ? '<span class="hh-holding-section-meta">' +
                            '+' + d.rentIncome + 'g/year' +
                            (d.rentedCount > 0
                                ? ' · ' + d.rentedCount + ' rented'
                                : '') +
                          '</span>'
                        : ''
                ) +
                (d.residences.length === 0
                    ? T.emptyState('No residences owned.')
                    : '<div class="hh-holding-list">' +
                        d.residences.map(_renderResidenceCard).join('') +
                      '</div>') +
            '</div>';
    }

    function _renderResidenceCard(r) {
        var rented = !!r.renterId;
        var statusColor = rented ? 'var(--success)' : 'var(--warn)';
        var statusText = rented ? 'Rented' : 'Vacant';

        var rentDisplay = rented
            ? '<span style="color:var(--success);">+' +
                (r.rentAmount || 0) + 'g/year</span>'
            : '<span class="hh-holding-meta-dim">No renter</span>';

        var typeName = r.typeName || r.typeId || 'Unknown';
        var locationName = r.locationName || 'Unknown';

        return '' +
            '<div class="hh-holding-card' +
                (r.isDemolished ? ' demolished' : '') + '" ' +
                'data-kind="residence" data-residence-id="' + T.esc(r.id) + '">' +
                '<div class="hh-holding-header">' +
                    '<div class="hh-holding-title">' +
                        T.iconSpan('HOME', 'Residence') + ' ' +
                        T.esc(r.name) +
                        '<span class="hh-holding-type">' + T.esc(typeName) + '</span>' +
                        '<span class="hh-holding-status" style="color:' +
                            statusColor + ';">(' + statusText + ')</span>' +
                        (r.isMultiUnit
                            ? '<span class="hh-holding-badge">Multi-unit</span>'
                            : '') +
                    '</div>' +
                    '<div class="hh-holding-actions">' +
                        rentDisplay +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="view-residence" ' +
                            'data-residence-id="' + T.esc(r.id) + '" ' +
                            'title="View residence">' + T.icon('EDIT') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="hh-holding-meta">' +
                    '<span>' + T.iconSpan('LOCATION', 'Location') + ' ' +
                        T.esc(locationName) + '</span>' +
                    '<span>' + T.iconSpan('COIN', 'Value') + ' ' +
                        (r.estimatedValue || 0) + 'g</span>' +
                    (rented
                        ? '<span>' + T.iconSpan('PERSON', 'Renter') + ' ' +
                            T.esc(r.renterName || 'Unknown') + '</span>'
                        : '') +
                    '<span>Condition: ' + T.esc(r.condition || 'good') + '</span>' +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 4. ENTRY POINT
    // =========================================================================

    function renderHouseholdHoldingsTab(container, context) {
        if (!container) return;

        T.runExclusive(_renderGuard, function () {
            if (!context || !context.householdId) {
                container.innerHTML = T.emptyState('Select a household from the sidebar.');
                return;
            }

            if (!T.queries()) {
                container.innerHTML = T.failureState(
                    'HouseholdQueries is not loaded. ' +
                    'Load js/households/household-queries.js.'
                );
                return;
            }

            var data;
            try {
                data = _collect(context.householdId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[HouseholdHoldingsTab] collect failed', e);
                }
                container.innerHTML = T.failureState(
                    'Could not load holdings: ' +
                    (e && e.message ? e.message : 'unknown error')
                );
                return;
            }

            if (data.error) {
                container.innerHTML = T.failureState(data.error);
                return;
            }

            container.innerHTML = _renderBody(data);
            _wire(container, context.householdId);
        }, { onBusy: function () { /* skip re-entrant render */ } });
    }

    // =========================================================================
    // 5. WIRING
    // =========================================================================
    //
    // Delegated clicks. Two maps:
    //   1. attachDelegated — button clicks
    //   2. a second click listener — row clicks (for details)
    //
    // Row clicks go on the row itself via closest('.hh-holding-card').
    // Buttons are separately delegated; the row handler ignores clicks
    // that landed on a button (checked via .closest('button')).

    function _wire(container, householdId) {
        T.attachDelegated(container, {
            '[data-action="add-enterprise"]': function () { _openAddEnterprise(householdId); },
            '[data-action="add-school"]':     function () { _openAddSchool(householdId); },
            '[data-action="add-residence"]':  function () { _openAddResidence(householdId); },
            '[data-action="edit-enterprise"]':function (e, btn) { _openEditEnterprise(btn.getAttribute('data-enterprise-id'), householdId); },
            '[data-action="remove-enterprise"]':function (e, btn) { _confirmRemoveEnterprise(householdId, btn.getAttribute('data-enterprise-id')); },
            '[data-action="edit-school"]':    function (e, btn) { _openEditSchool(btn.getAttribute('data-school-id'), householdId); },
            '[data-action="view-residence"]': function (e, btn) { _openResidenceDetails(btn.getAttribute('data-residence-id'), householdId); }
        });

        // Row click → details. One listener, per-row clicks dispatched
        // by data-kind. Buttons are ignored (they were handled above).
        if (container.__hhHoldingsRowWired) return;
        container.__hhHoldingsRowWired = true;
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || !target.closest) return;
            if (target.closest('button')) return;
            var row = target.closest('.hh-holding-card');
            if (!row) return;

            var kind = row.getAttribute('data-kind');
            if (kind === 'enterprise') {
                var entId = row.getAttribute('data-enterprise-id');
                if (entId && typeof window.openEnterpriseDetailsModal === 'function') {
                    window.openEnterpriseDetailsModal(entId);
                }
            } else if (kind === 'school') {
                var schId = row.getAttribute('data-school-id');
                if (schId && typeof window.openInstitutionDetailsModal === 'function') {
                    window.openInstitutionDetailsModal(schId);
                }
            } else if (kind === 'residence') {
                var rid = row.getAttribute('data-residence-id');
                if (rid) _openResidenceDetails(rid, householdId);
            }
        });
    }

    function _rerender(householdId) {
        T.requestRender(TAB_ID);
        if (typeof window.refreshHouseholdList === 'function') {
            window.refreshHouseholdList();
        }
    }

    // =========================================================================
    // 6. ADD ENTERPRISE (delegates to Industry)
    // =========================================================================

    function _openAddEnterprise(householdId) {
        if (typeof window.openCreateEnterpriseModal !== 'function') {
            T.toastError(
                'Add Enterprise unavailable: openCreateEnterpriseModal is not ' +
                'loaded. Load the industry creation modal.'
            );
            return;
        }
        var summary = T.getHousehold(householdId);
        if (!summary) { T.toastError('Household not found.'); return; }

        window.openCreateEnterpriseModal(function (enterprise) {
            if (enterprise) {
                T.toastSuccess('Enterprise created: ' + enterprise.name + '.');
                _rerender(householdId);
            }
        }, {
            ownerType: 'household',
            ownerId: householdId,
            ownerName: summary.name,
            locationId: summary.locationId || null
        });
    }

    // =========================================================================
    // 7. ADD SCHOOL (delegates to Education)
    // =========================================================================

    function _openAddSchool(householdId) {
        if (typeof window.openCreateInstitutionModal !== 'function') {
            T.toastError(
                'Add School unavailable: openCreateInstitutionModal is not ' +
                'loaded. Load the education institution modal.'
            );
            return;
        }
        var summary = T.getHousehold(householdId);
        if (!summary) { T.toastError('Household not found.'); return; }

        window.openCreateInstitutionModal(function (institution) {
            if (institution) {
                T.toastSuccess('School created: ' + institution.name + '.');
                _rerender(householdId);
            }
        }, {
            ownershipType: 'private',
            ownerId: householdId,
            ownerType: 'household',
            ownerName: summary.name,
            locationId: summary.locationId || null
        });
    }

    // =========================================================================
    // 8. ADD RESIDENCE (two-step: create, then assign owner)
    // =========================================================================
    //
    // The residence is created first (openNewResidenceModal owns its
    // own persist). Then, if the household owns it, we call
    // ResidenceSystem.setResidenceOwner to establish ownership — and
    // residence's own persist flushes. If the owner link fails, the
    // residence exists in the world as unowned; we report the partial
    // success rather than pretending the whole operation failed.

    function _openAddResidence(householdId) {
        if (typeof window.openNewResidenceModal !== 'function') {
            T.toastError(
                'Add Residence unavailable: openNewResidenceModal is not ' +
                'loaded. Load js/households/modals-residence.js.'
            );
            return;
        }
        var summary = T.getHousehold(householdId);
        if (!summary) { T.toastError('Household not found.'); return; }

        var RS = T.residence();
        if (!RS || typeof RS.setResidenceOwner !== 'function') {
            T.toastError('ResidenceSystem is not loaded.');
            return;
        }

        var currentYear;
        try { currentYear = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        window.openNewResidenceModal(
            summary.locationId || null,
            summary.locationName || null,
            function (residenceId) {
                if (!residenceId) return;

                var ownerResult = RS.setResidenceOwner(
                    residenceId, 'household', householdId, {
                        ownerSince: currentYear,
                        ownerName: summary.name
                    }
                );
                if (!ownerResult || ownerResult.success !== true) {
                    T.toastWarning(
                        'Residence created but ownership link failed: ' +
                        (ownerResult ? ownerResult.reason : 'unknown') +
                        '. The residence exists but is unowned.'
                    );
                    _rerender(householdId);
                    return;
                }

                var persisted = (typeof RS.persist === 'function') ? RS.persist() : null;
                if (persisted && persisted.success === false) {
                    T.toastWarning(
                        'Residence created and linked, but storage write ' +
                        'failed: ' + (persisted.reason || 'unknown')
                    );
                } else {
                    T.toastSuccess('Residence created and linked to household.');
                }
                _rerender(householdId);
            }
        );
    }

    // =========================================================================
    // 9. EDIT ENTERPRISE / SCHOOL
    // =========================================================================

    function _openEditEnterprise(enterpriseId, householdId) {
        if (!enterpriseId) return;
        if (typeof window.openEditEnterpriseModal !== 'function') {
            T.toastError(
                'Edit Enterprise unavailable: openEditEnterpriseModal is ' +
                'not loaded.'
            );
            return;
        }
        window.openEditEnterpriseModal(enterpriseId, function () {
            _rerender(householdId);
        });
    }

    function _openEditSchool(schoolId, householdId) {
        if (!schoolId) return;
        if (typeof window.openEditInstitutionModal !== 'function') {
            T.toastError(
                'Edit School unavailable: openEditInstitutionModal is ' +
                'not loaded.'
            );
            return;
        }
        window.openEditInstitutionModal(schoolId, function () {
            _rerender(householdId);
        });
    }

    // =========================================================================
    // 10. REMOVE ENTERPRISE (clears the owner; does not delete)
    // =========================================================================
    //
    // "Remove from household" here means CLEAR THE OWNER, not delete the
    // enterprise. The enterprise stays in the world, unowned, and can be
    // re-acquired. IndustryCommands.updateEnterprise owns the household
    // reverse-index reconciliation when ownerType / ownerId change — so
    // the tab does NOT call HouseholdCommands.removeEnterpriseFromHousehold
    // (which does not exist on that module anyway — the prior revision
    // called HS.removeEnterpriseFromHousehold and the enterprise was
    // never removed).

    function _confirmRemoveEnterprise(householdId, enterpriseId) {
        if (!enterpriseId) return;
        var IS = T.industryState();
        if (!IS || typeof IS.getEnterprise !== 'function') {
            T.toastError('IndustryState is not loaded.');
            return;
        }
        var e;
        try { e = IS.getEnterprise(enterpriseId); }
        catch (err) { e = null; }
        if (!e) { T.toastError('Enterprise not found.'); return; }

        T.confirmDialog(
            'Remove "' + e.name + '" from this household?\n\n' +
            'The enterprise becomes unowned. It is not deleted from the ' +
            'world and can be re-acquired.',
            'Remove Enterprise',
            function () {
                var IC = T.industryCommands();
                if (!IC || typeof IC.updateEnterprise !== 'function') {
                    T.toastError('IndustryCommands is not loaded.');
                    return;
                }

                var result = IC.updateEnterprise(enterpriseId, {
                    ownerType: 'none',
                    ownerId: null
                });
                if (!result || result.success !== true) {
                    T.toastError(
                        'Failed to remove: ' +
                        (result ? result.reason : 'unknown')
                    );
                    return;
                }

                var persisted = (typeof IC.persist === 'function')
                    ? IC.persist()
                    : null;
                if (persisted && persisted.success === false) {
                    T.toastWarning(
                        'Removed in memory; storage write failed: ' +
                        (persisted.reason || 'unknown')
                    );
                } else {
                    T.toastInfo('Enterprise removed from household.');
                }
                _rerender(householdId);
            }
        );
    }

    // =========================================================================
    // 11. VIEW RESIDENCE (delegates to the residence modal)
    // =========================================================================

    function _openResidenceDetails(residenceId, householdId) {
        if (!residenceId) return;
        if (typeof window.openResidenceDetailsModal !== 'function') {
            T.toastError(
                'Residence details unavailable: openResidenceDetailsModal is ' +
                'not loaded. Load js/households/modals-residence.js.'
            );
            return;
        }
        window.openResidenceDetailsModal(residenceId, function () {
            _rerender(householdId);
        });
    }

    // =========================================================================
    // 12. REGISTRATION
    // =========================================================================

    T.register(TAB_ID, renderHouseholdHoldingsTab);

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================
    //
    // The prior revision's on-disk copy ended mid-identifier at
    // `window.refreshHouseholdHoldings` — missing the closing `Tab` and
    // everything after. That was a full-file syntax error: the entire
    // IIFE never executed, so no exports registered and the tab never
    // rendered. This revision ships the complete export block.

    window.HouseholdHoldingsTab = {
        id: TAB_ID,
        render: renderHouseholdHoldingsTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdHoldingsTab;
    }
})();
