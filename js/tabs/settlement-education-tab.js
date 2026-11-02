/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT EDUCATION TAB
 * js/tabs/settlement-education-tab.js
 * =============================================================================
 *
 * EDUCATION TAB RENDERER.
 *
 * Renders the settlement's education landscape: literacy and coverage
 * metrics, school-age population vs. capacity, education budget, and the
 * list of educational institutions in the settlement subtree. Hosts the
 * action buttons that open the education modals for create / details /
 * enroll / hire.
 *
 * It is a UI module. It:
 *   - reads through EducationQueries and EducationHistory
 *   - reads the settlement education budget via SettlementQueries
 *   - opens the education modals via modals-education.js exports
 *   - does not read canonical settlement data directly
 *   - does not read canonical education data directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not create education records
 *   - does not mutate canonical settlement data
 *   - does not mutate canonical education data
 *   - does not persist
 *   - does not fabricate missing domain values
 *   - does not render raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §32 (Completion Standard). Education
 * domain: education-doc.txt §4.9 (education-ui-list.js), §4.10
 * (modals-education.js).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('education', fn).
 *   SettlementTabs invokes fn(container, context):
 *
 *     container  HTMLElement       already emptied by SettlementTabs
 *     context    {
 *       locationId  string|null    selected settlement id
 *       data        Object|null    canonical settlement record
 *       viewModel   Object|null    buildSettlementSummary result
 *     }
 *
 *   SettlementTabs has already validated locationId and data before
 *   calling the renderer.
 *
 * WHY THE TAB DELEGATES MOST OF ITS WORK
 * --------------------------------------
 *   The education domain ships its own presentation layer:
 *
 *     EducationUI (education-ui-list.js)
 *       renderInstitutionList, renderInstitutionCard,
 *       renderInstitutionTable, renderEducationSummary,
 *       renderReligiousSchoolsList, renderInstitutionHistory, ...
 *
 *     modals-education.js
 *       openCreateInstitutionModal, openEditInstitutionModal,
 *       openInstitutionDetailsModal, openEditCurriculumModal,
 *       openEnrollStudentModal, openHireTeacherModal,
 *       openSetHeadmasterModal, openGraduateStudentModal,
 *       openDeleteInstitutionModal, openTuitionManagementModal,
 *       openOwnershipManagementModal
 *
 *   The old education tab did not use either — it built its own list,
 *   its own create modal, its own edit modal, its own enrollment flow,
 *   and (in a subset of flows) its own tuition and ownership paths.
 *   Roughly 1,200 of that tab's ~1,700 lines duplicated what the
 *   education domain now owns. Two consequences:
 *
 *     1. Every education-domain change had to be mirrored in the tab or
 *        the tab drifted silently. It drifted: the old tab called
 *        EducationState.getInstitutionsByLocation (which exists but
 *        returns raw records the tab then had to shape), it embedded
 *        its own INSTITUTION_TYPES fallback list (which disagreed with
 *        education-constants.js), and it called
 *        EducationCommands.createInstitution with a positional
 *        (name, typeId, locationId, options) signature that is now a
 *        single-object signature on the canonical module.
 *
 *     2. Users saw two different pieces of UI for the same mutation.
 *        The institution list modal (openInstitutionDetailsModal) and
 *        the tab's per-row "Details" button opened different views
 *        with different action buttons.
 *
 *   This rewrite flattens that: the tab is a settlement-scoped shell
 *   that composes EducationUI's list and summary, and routes user
 *   actions through modals-education.js. Every mutation path goes
 *   through the education domain's own modal, which uses
 *   EducationCommands and EducationCommands.persist() per the domain
 *   contract. The tab does not call any education command directly.
 *
 * WHAT THE TAB ADDS ON TOP OF THE DOMAIN UI
 * -----------------------------------------
 *   Three things the education domain's own UI cannot provide, because
 *   they are settlement-scoped rather than school-scoped:
 *
 *     1. A settlement summary line: the settlement name, the
 *        education budget (from SettlementQueries.getEducationBudget),
 *        and the count of institutions in this settlement subtree.
 *
 *     2. A location filter: EducationUI.renderInstitutionList accepts
 *        a `filters` object, and the tab passes
 *        { location: context.locationId }. The education list is
 *        otherwise domain-wide.
 *
 *     3. A "Create Institution" button that pre-fills the settlement's
 *        locationId. modals-education.js's
 *        openCreateInstitutionModal already accepts a `defaultData`
 *        argument; the tab passes { locationId }.
 *
 *   Everything else — the summary metrics, the institution list, the
 *   detail modal, the enrollment flow, the tuition flow — is
 *   EducationUI or modals-education.js, unmodified.
 *
 * SETTLEMENT EDUCATION BUDGET
 * ---------------------------
 *   SettlementQueries.getEducationBudget(locationId) returns the
 *   settlement's allocation for the current period. That is the
 *   settlement-side canonical field settlement.educationBudget,
 *   distinct from any education-domain figure. The tab shows it as
 *   context for the institutions list. The number is not used to
 *   compute anything on the tab; it is display only.
 *
 *   If the settlement record has no educationBudget field (older save),
 *   SettlementQueries.getEducationBudget returns null (per the query's
 *   documented contract). The tab renders "—" for that case. The tab
 *   does not default it to 0 — that would misrepresent the state.
 *
 * LITERACY / COVERAGE / SCHOOL-AGE
 * --------------------------------
 *   These come from EducationQueries.getEducationHealthScore(locationId)
 *   and EducationQueries.getLocationEducationSummary(locationId, false)
 *   via EducationUI.renderEducationSummary. The tab does not compute
 *   them. The prior tab read EducationQueries.getLiteracyRate and
 *   EducationQueries.getSchoolAgePopulation directly (both exist) and
 *   also computed its own "gap" from
 *   Math.max(0, schoolAgePop - totalCapacity) inline — that is
 *   EducationQueries.getStudentDemand's job. The tab no longer
 *   duplicates it.
 *
 * INSTITUTION LIST AND SCHOOL-AGE DEMAND
 * --------------------------------------
 *   EducationUI.renderInstitutionList(containerId, options) is the
 *   canonical institution list renderer. It takes a containerId, not a
 *   container element. The tab creates a sub-container with an id,
 *   then calls the domain renderer against it. That matches how
 *   modals-education.js already drives the renderer
 *   (renderInstitutionList is exported for exactly this use).
 *
 *   The institution list is scoped to the settlement via
 *   { filters: { location: context.locationId } }. The renderer
 *   already supports this via the `location` filter (per
 *   EducationQueries.getInstitutions' filter contract).
 *
 * HISTORY
 * -------
 *   The tab does not render institution-level history in the main
 *   view. EducationUI has a per-institution history renderer, but the
 *   institution list would become very tall if every row embedded its
 *   history. Per-institution history is accessible from
 *   openInstitutionDetailsModal → history panel (that modal already
 *   wires it). The tab does not duplicate that.
 *
 *   The old tab tried to show settlement-level education history
 *   inline and, in the process, called an
 *   EducationState.getInstitutionsByLocation + EducationQueries
 *   combination that had no business being in a settlement tab. There
 *   is no settlement-level education history concept in the domain —
 *   education events are per-institution (per education-history.js)
 *   and per-character (per EducationLearning). The tab does not
 *   invent one.
 *
 * ICON POLICY
 * -----------
 *   No emojis. No inline SVG. Chrome icons come from window.getIcon if
 *   it is loaded; when icons.js is not on the page, the renderer falls
 *   back to plain text labels.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Rewritten against the education module set and the settlement
 *       module set.
 *     - Signature changed from (containerId, locationId, summary) to
 *       (container, context), matching settlement-tabs.js.
 *     - Recursion guard (_rendering) and modal-open flag removed (§20
 *       prohibits recursion guards).
 *     - All inline modal code deleted. Create / edit / details /
 *       curriculum / enroll / hire / headmaster / graduate / delete /
 *       tuition / ownership flows now open the corresponding
 *       modals-education.js export. The prior implementation
 *       re-implemented all eleven, each of which had to be kept in
 *       sync with the domain module.
 *     - All inline institution list rendering deleted. The tab
 *       delegates to EducationUI.renderInstitutionList with
 *       { filters: { location } }. The prior implementation had its
 *       own _renderSchoolSection function with its own row markup,
 *       its own status badges, its own reputation color, and its own
 *       per-row action buttons; it drifted from EducationUI's version.
 *     - All inline summary statistics deleted. The tab delegates to
 *       EducationUI.renderEducationSummary, which uses
 *       EducationQueries.getLocationEducationSummary and
 *       EducationQueries.getEducationHealthScore. The prior
 *       implementation computed the summary inline from
 *       EducationState.getAllInstitutions +
 *       EducationQueries.getInstitutionDetails, and diverged from the
 *       domain's summary in two places (see next bullet).
 *     - The prior tab's "gap" stat was computed inline as
 *       Math.max(0, schoolAgePop - totalCapacity). That is
 *       EducationQueries.getStudentDemand's job, and its output is
 *       already part of the health score / summary. The tab no longer
 *       duplicates it.
 *     - The prior tab's institution list scoped by
 *       EducationState.getInstitutionsByLocation, which returns raw
 *       (cloned) canonical records. The list is now scoped by passing
 *       { filters: { location } } to EducationUI.renderInstitutionList,
 *       which uses EducationQueries.getInstitutions (a projection layer).
 *       The shape the renderer consumes is the domain's own summary,
 *       not a raw record.
 *     - Settlement education budget is read via
 *       SettlementQueries.getEducationBudget. The prior tab read it via
 *       SettlementState.getSettlementData(locationId).educationBudget,
 *       which returned raw canonical state instead of the query's
 *       null-or-number contract. Both paths produce the same number for
 *       a record that has the field; they differ when the field is
 *       absent (query returns null, raw read returns undefined — the
 *       tab now renders "—" for both).
 *     - All numeric values route through _fmtNumber / _fmtGold. All
 *       text values route through _fmtText. No raw null/undefined
 *       reaches the DOM.
 *     - The private helper functions for opening character selectors,
 *       household selectors, and religion selectors are gone. Those
 *       are inside modals-education.js's modals and no longer belong
 *       in a tab.
 *     - window.getCurrentYearSafe is not referenced. window.getCurrentYear
 *       is not called by this tab — the tab does not display a year.
 *   Previous revisions:
 *     - Pre-refactor implementation against SettlementState /
 *       SettlementCommands / SettlementCrud / EducationState /
 *       EducationQueries / EducationCommands, roughly 1,700 lines,
 *       most of which duplicated the domain modules.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getEducationQueries() {
        var Q = window.EducationQueries;
        if (!Q || typeof Q.getLocationEducationSummary !== 'function') {
            throw new Error(
                'settlement-education-tab: EducationQueries is missing. ' +
                'Load education-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getEducationUI() {
        var UI = window.EducationUI;
        if (!UI || typeof UI.renderInstitutionList !== 'function') {
            throw new Error(
                'settlement-education-tab: EducationUI is missing. ' +
                'Load education-ui-list.js before this tab.'
            );
        }
        return UI;
    }

    function _getEducationCommands() {
        var C = window.EducationCommands;
        if (!C || typeof C.createInstitution !== 'function') {
            throw new Error(
                'settlement-education-tab: EducationCommands is missing. ' +
                'Load education-commands.js before this tab.'
            );
        }
        return C;
    }

    function _getSettlementQueries() {
        return window.SettlementQueries || null;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
    }

    function _getEducationModals() {
        return window;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtGold(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString()) + 'g';
    }

    function _fmtPercent(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString()) + '%';
    }

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _escapeHtml(value);
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var icon = window.getIcon(name);
                if (typeof icon === 'string') return icon;
            } catch (e) {
                // getIcon exists but threw; fall through to ''.
            }
        }
        return '';
    }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _requestRefresh() {
        var tabs = _getTabs();
        if (tabs && typeof tabs.requestRender === 'function') {
            tabs.requestRender('education');
        }
    }

    function _settlementEducationBudget(locationId) {
        var SQ = _getSettlementQueries();
        if (!SQ || typeof SQ.getEducationBudget !== 'function') return null;
        try {
            return SQ.getEducationBudget(locationId);
        } catch (err) {
            return null;
        }
    }

    // =========================================================================
    // 3. MODAL DELEGATION
    // =========================================================================
    //
    // Every mutating flow goes through a modals-education.js export. The
    // tab does not call any education command directly. When a modal is
    // missing (education modals not loaded on the page), the tab shows
    // a toast instead of throwing inside an event handler.

    function _openEducationModal(name, args, onMissing) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            if (typeof onMissing === 'function') {
                onMissing();
            } else {
                _toast(
                    'Education modal "' + name + '" is not available. ' +
                    'Load modals-education.js first.',
                    'error'
                );
            }
            return false;
        }
        try {
            fn.apply(window, args || []);
            return true;
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: ' + name + ' threw:', err
                );
            }
            _toast(
                'Could not open modal: ' +
                (err && err.message ? err.message : 'unknown error'),
                'error'
            );
            return false;
        }
    }

    function _openCreateInstitution(locationId) {
        _openEducationModal(
            'openCreateInstitutionModal',
            [
                function () { _requestRefresh(); },   // onSuccess
                { locationId: locationId }            // defaultData
            ]
        );
    }

    function _openInstitutionDetails(institutionId) {
        _openEducationModal(
            'openInstitutionDetailsModal',
            [
                institutionId,
                function () { _requestRefresh(); }    // onSuccess
            ]
        );
    }

    function _openInstitutionEdit(institutionId) {
        _openEducationModal(
            'openEditInstitutionModal',
            [
                institutionId,
                function () { _requestRefresh(); }
            ]
        );
    }

    function _openEnroll(institutionId) {
        _openEducationModal(
            'openEnrollStudentModal',
            [
                institutionId,
                function () { _requestRefresh(); }
            ]
        );
    }

    function _openHireTeacher(institutionId) {
        _openEducationModal(
            'openHireTeacherModal',
            [
                institutionId,
                function () { _requestRefresh(); }
            ]
        );
    }

    // =========================================================================
    // 4. SECTION BUILDERS
    // =========================================================================

    function _buildHeader(context, summaryStats) {
        var locationId = context.locationId;
        var name = (context.viewModel && context.viewModel.name)
            ? context.viewModel.name
            : (_placeName(locationId) || '(unnamed location)');

        var budget = _settlementEducationBudget(locationId);

        var institutionCount = summaryStats
            ? summaryStats.institutionCount
            : null;
        var studentCount = summaryStats
            ? summaryStats.currentStudents
            : null;
        var teacherCount = summaryStats
            ? summaryStats.totalTeachers
            : null;

        var refreshBtn = '<button type="button" class="edu-tab-btn" ' +
            'data-action="refresh" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        var createBtn = '<button type="button" class="edu-tab-btn" ' +
            'data-action="create-institution" ' +
            'style="font-size:0.55rem;padding:3px 12px;background:var(--bg3);' +
            'border:1px solid var(--accent);border-radius:4px;cursor:pointer;' +
            'color:var(--accent-light);">' +
            _getIcon('PLUS') + ' New Institution</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('BOOK') + ' Education in ' + _escapeHtml(name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            'Budget: ' + _fmtGold(budget) + ' · ' +
            _fmtNumber(institutionCount) + ' institutions · ' +
            _fmtNumber(studentCount) + ' students · ' +
            _fmtNumber(teacherCount) + ' teachers' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
            refreshBtn + createBtn +
            '</div>' +
            '</div>';
    }

    /**
     * Delegates to EducationUI.renderEducationSummary, which writes
     * into a container by id. The tab creates a sub-container, calls
     * the renderer, and returns the rendered HTML. If the domain
     * renderer is missing or throws, the section degrades to a short
     * notice rather than aborting the whole tab.
     */
    function _buildSummarySection(locationId, containerId) {
        var UI = _getEducationUI();
        if (typeof UI.renderEducationSummary !== 'function') {
            return '<div style="padding:12px;background:var(--bg2);' +
                'border-radius:8px;margin-bottom:16px;' +
                'border:1px solid var(--border);color:var(--dim);' +
                'font-size:0.6rem;">Education summary renderer not available.</div>';
        }

        // The domain renderer writes into a DOM element by id and does
        // not return the html. We inject a placeholder, let the
        // renderer fill it, then read its innerHTML back into the
        // caller's flow. This keeps the delegation honest: the domain
        // owns the markup.
        var placeholderId = containerId + '_summary';
        var placeholderHost = document.createElement('div');
        placeholderHost.id = placeholderId;
        placeholderHost.style.display = 'none';
        document.body.appendChild(placeholderHost);

        try {
            var ok = UI.renderEducationSummary(placeholderId, locationId, {});
            if (!ok) {
                document.body.removeChild(placeholderHost);
                return '';
            }
            var innerHtml = placeholderHost.innerHTML;
            document.body.removeChild(placeholderHost);
            if (!innerHtml || innerHtml.length === 0) return '';
            return '<div style="margin-bottom:16px;">' + innerHtml + '</div>';
        } catch (err) {
            try {
                if (placeholderHost.parentNode) {
                    document.body.removeChild(placeholderHost);
                }
            } catch (cleanupErr) {
                // Ignore cleanup failures.
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: EducationUI.renderEducationSummary threw:',
                    err
                );
            }
            return '<div style="padding:12px;background:var(--bg2);' +
                'border-radius:8px;margin-bottom:16px;' +
                'border:1px solid var(--border);color:var(--dim);' +
                'font-size:0.6rem;">Education summary unavailable.</div>';
        }
    }

    function _buildInstitutionListSection(locationId, containerId) {
        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('BOOK') + ' Institutions in this Settlement</div>' +
            '<div id="' + _escapeHtml(containerId) + '"></div>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div style="padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            'Institutions, enrollment, curriculum, tuition, and ownership ' +
            'are managed through the education modals. The settlement tab is ' +
            'a scoped view: it shows institutions located in this settlement ' +
            'and the settlement\'s education budget.</div>';
    }

    // =========================================================================
    // 5. WIRING
    // =========================================================================
    //
    // Two wires:
    //
    //   1. Delegated click handler on the tab container for the header
    //      buttons (refresh, create).
    //
    //   2. After EducationUI.renderInstitutionList fills its container,
    //      bind a delegated click handler on that container for its
    //      View / Edit / Enroll / Hire buttons.
    //
    // The institution list container is separate from the tab container,
    // so the two handlers don't overlap. EducationUI writes the buttons
    // with the classes .view-institution-btn and .edit-institution-btn
    // (plus the card variant .enroll-student-btn and .hire-teacher-btn
    // when rendered via renderInstitutionCard). The list renderer only
    // emits View and Edit; the card renderer emits all four. Since the
    // list uses the list renderer, the tab binds View and Edit here.

    function _wireHeaderActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('.edu-tab-btn');
            if (!btn || !container.contains(btn)) return;
            event.preventDefault();
            var action = btn.dataset.action;
            if (action === 'refresh') {
                _requestRefresh();
            } else if (action === 'create-institution') {
                _openCreateInstitution(locationId);
            }
        });
    }

    function _wireInstitutionList(listContainer) {
        listContainer.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            var viewBtn = target.closest('.view-institution-btn');
            if (viewBtn && listContainer.contains(viewBtn)) {
                event.preventDefault();
                _openInstitutionDetails(viewBtn.dataset.institutionId);
                return;
            }

            var editBtn = target.closest('.edit-institution-btn');
            if (editBtn && listContainer.contains(editBtn)) {
                event.preventDefault();
                _openInstitutionEdit(editBtn.dataset.institutionId);
                return;
            }
        });
    }

    // =========================================================================
    // 6. RENDER
    // =========================================================================

    /**
     * Renders the education tab into the container.
     *
     * @param {HTMLElement} container
     * @param {Object} context  { locationId, data, viewModel }
     */
    function renderSettlementEducation(container, context) {
        if (!container) {
            throw new Error(
                'settlement-education-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-education-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;

        // Summary stats for the header. Queries are cheap; the header
        // needs only count fields from getLocationEducationSummary.
        // A query failure degrades the header counts to "—" but does
        // not abort the tab — the institution list below is still
        // useful.
        var summaryStats = null;
        try {
            summaryStats = _getEducationQueries()
                .getLocationEducationSummary(locationId, false);
        } catch (err) {
            summaryStats = null;
        }

        // Unique container id for the institution list. Container id
        // collisions across tabs are prevented by prefixing with the
        // tab id and the location id.
        var listContainerId = 'settlement_edu_list_' +
            _escapeHtml(locationId).replace(/[^a-z0-9_-]/gi, '_');

        // Unique id for the summary renderer's temporary host. Must not
        // collide with the list container id.
        var summaryContainerId = 'settlement_edu_summary_' +
            _escapeHtml(locationId).replace(/[^a-z0-9_-]/gi, '_');

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, summaryStats) +
            _buildSummarySection(locationId, summaryContainerId) +
            _buildInstitutionListSection(locationId, listContainerId) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;

        _wireHeaderActions(container, locationId);

        // Domain renderer writes the institution list into its
        // container. If it fails, replace the container's contents with
        // a short notice; do not throw out of the renderer.
        var listContainer = container.querySelector('#' + listContainerId);
        if (listContainer) {
            try {
                var UI = _getEducationUI();
                UI.renderInstitutionList(listContainerId, {
                    filters: { location: locationId },
                    emptyMessage: 'No educational institutions in this settlement.'
                });
                _wireInstitutionList(listContainer);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-education-tab: renderInstitutionList threw:',
                        err
                    );
                }
                listContainer.innerHTML =
                    '<div style="text-align:center;padding:16px;' +
                    'color:var(--dim);font-size:0.6rem;">' +
                    'Could not load institution list: ' +
                    _escapeHtml(err && err.message ? err.message : 'unknown error') +
                    '</div>';
            }
        }
    }

    // =========================================================================
    // 7. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-education-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('education', renderSettlementEducation);
    }

    _register();

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.renderSettlementEducation = renderSettlementEducation;
    window._renderSettlementEducation = renderSettlementEducation;

})();
