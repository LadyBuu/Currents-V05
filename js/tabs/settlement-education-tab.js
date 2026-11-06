/**
 * =============================================================================
 * SETTLEMENT EDUCATION TAB
 * js/tabs/settlement-education-tab.js
 * =============================================================================
 *
 * Renders the settlement's education landscape. This tab is a
 * settlement-scoped shell over the education domain's own UI:
 *
 *   - Header: education budget, institution / student / teacher counts
 *   - Summary: EducationUI.renderEducationSummary (delegated)
 *   - Institutions: EducationUI.renderInstitutionList, filtered by
 *     { location: context.locationId }
 *   - New Institution: modals-education.openCreateInstitutionModal with
 *     { locationId } pre-filled
 *
 * The tab does NOT compute literacy, coverage, school-age demand,
 * capacity, or health scores. Those are the education domain's queries.
 * The tab does NOT render institution details, enrollment, curriculum,
 * tuition, or ownership. Those are modals-education.js.
 *
 * EDUCATION STATE HYDRATION GUARD:
 *   EducationState must be hydrated before any EducationQueries call.
 *   EducationBootstrap.init() hydrates it, but the settlement manager
 *   page does not call EducationBootstrap.init() — a user who navigates
 *   directly to SettlementManager and opens the Education tab without
 *   ever visiting EducationManager would find EducationState un-hydrated
 *   and every query would throw "must hydrate". The guard closes that
 *   gap by hydrating from masterData.data.educationalInstitutions on
 *   first use, with syncToMasterData: false (read-triggered hydrate must
 *   not schedule a save — see EducationState HYDRATION CONTRACT).
 *
 * DOMAIN UI IS A DOM WRITER, NOT A STRING RETURNER:
 *   EducationUI's renderers write into a host element by id. To compose
 *   them into a single innerHTML assignment we create a hidden host,
 *   call the renderer, and adopt its innerHTML.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'education';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)     { return H().esc(v); }
    function icon(n)    { return H().icon(n); }
    function fmtNum(v)  { return H().fmtNumber(v); }
    function fmtGold(v) { return H().fmtGold(v); }
    function refresh()  { H().requestRefresh(SCOPE, TAB_ID); }

    // -------------------------------------------------------------------
    // Dependency access (soft)
    // -------------------------------------------------------------------

    function _getEducationQueries() {
        var Q = window.EducationQueries;
        if (!Q || typeof Q.getLocationEducationSummary !== 'function') {
            return null;
        }
        return Q;
    }

    function _getEducationUI() {
        var UI = window.EducationUI;
        if (!UI || typeof UI.renderInstitutionList !== 'function') {
            return null;
        }
        return UI;
    }

    function _getSettlementQueries() {
        var Q = window.SettlementQueries;
        if (!Q || typeof Q.getEducationBudget !== 'function') return null;
        return Q;
    }

    function _getEducationState() {
        return window.EducationState || null;
    }

    function _placeName(locationId) {
        var pq = window.PlaceQueries;
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _settlementEducationBudget(locationId) {
        var SQ = _getSettlementQueries();
        if (!SQ) return null;
        try { return SQ.getEducationBudget(locationId); }
        catch (e) { return null; }
    }

    // -------------------------------------------------------------------
    // EducationState hydration guard
    // -------------------------------------------------------------------
    //
    // See EDUCATION STATE HYDRATION GUARD in the header.

    function _ensureEducationStateHydrated() {
        var ES = _getEducationState();
        if (!ES) return;
        if (typeof ES.isHydrated === 'function' && ES.isHydrated()) return;
        if (typeof ES.hydrateFromMasterData !== 'function') return;

        var master = window.masterData && window.masterData.data;
        if (!master) return;

        var raw = master.educationalInstitutions;
        if (!Array.isArray(raw)) {
            // Absence is legitimate: pre-education save, or a fresh
            // install. Hydrate with an empty array so isHydrated()
            // flips and queries return zero-results rather than throwing.
            raw = [];
        }

        try {
            ES.hydrateFromMasterData(raw, { syncToMasterData: false });
        } catch (err) {
            // Duplicate ids throw in the strict path. Log and let the
            // caller's query throw the normal "must hydrate" error, so
            // the tab renders an error state instead of crashing.
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: education state hydrate ' +
                    'failed:', err);
            }
        }
    }

    // -------------------------------------------------------------------
    // Modal delegation (resolved at click time)
    // -------------------------------------------------------------------

    function _resolveModal(name) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: required modal "' + name +
                    '" is not loaded. Load modals-education.js before this tab.');
            }
            H().toast(
                'Education action unavailable: ' + name + ' is not loaded.',
                'error');
            return null;
        }
        return fn;
    }

    function _openCreateInstitution(locationId) {
        var fn = _resolveModal('openCreateInstitutionModal');
        if (!fn) return;
        try { fn(refresh, { locationId: locationId }); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: openCreateInstitutionModal ' +
                    'threw:', err);
            }
            H().toast('Could not open create-institution modal.', 'error');
        }
    }

    function _openInstitutionDetails(institutionId) {
        var fn = _resolveModal('openInstitutionDetailsModal');
        if (!fn) return;
        try { fn(institutionId, refresh); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: openInstitutionDetailsModal ' +
                    'threw:', err);
            }
            H().toast('Could not open institution details.', 'error');
        }
    }

    function _openInstitutionEdit(institutionId) {
        var fn = _resolveModal('openEditInstitutionModal');
        if (!fn) return;
        try { fn(institutionId, refresh); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: openEditInstitutionModal ' +
                    'threw:', err);
            }
            H().toast('Could not open edit modal.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Host-scoped education renderers
    // -------------------------------------------------------------------

    var _hostCounter = 0;

    function _withHiddenHost(callback) {
        var hostId = '__stEduHost_' + (++_hostCounter) + '_' + Date.now();
        var host = document.createElement('div');
        host.id = hostId;
        host.style.display = 'none';
        document.body.appendChild(host);
        try {
            return callback(hostId, host);
        } finally {
            if (host.parentNode) {
                host.parentNode.removeChild(host);
            }
        }
    }

    function _renderSummary(locationId) {
        var UI = _getEducationUI();
        if (!UI || typeof UI.renderEducationSummary !== 'function') {
            return '';
        }
        var innerHtml;
        try {
            innerHtml = _withHiddenHost(function (hostId, host) {
                var ok = UI.renderEducationSummary(hostId, locationId, {});
                return ok ? host.innerHTML : '';
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: renderEducationSummary threw:',
                    err);
            }
            return '<div class="st-section">' +
                '<div class="st-section__empty">' +
                'Education summary unavailable.</div></div>';
        }
        if (!innerHtml) return '';
        return '<div class="st-section">' +
            '<div class="st-section__body">' + innerHtml + '</div>' +
            '</div>';
    }

    function _renderInstitutionList(locationId) {
        var UI = _getEducationUI();
        if (!UI) {
            return '<div class="st-section">' +
                '<div class="st-section__empty">' +
                'EducationUI is not available.</div></div>';
        }
        var innerHtml;
        try {
            innerHtml = _withHiddenHost(function (hostId, host) {
                UI.renderInstitutionList(hostId, {
                    filters: { location: locationId },
                    emptyMessage: 'No educational institutions in this ' +
                        'settlement.'
                });
                return host.innerHTML;
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-education-tab: renderInstitutionList threw:',
                    err);
            }
            return '<div class="st-section">' +
                '<div class="st-section__empty">' +
                'Could not load institution list: ' +
                esc(err && err.message ? err.message : 'unknown error') +
                '</div></div>';
        }
        if (!innerHtml) {
            innerHtml = '<div class="st-section__empty">' +
                'No educational institutions in this settlement.</div>';
        }
        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('BOOK') + ' Institutions in this Settlement</div>' +
            '<div class="st-section__body">' + innerHtml + '</div>' +
            '</div>';
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, summaryStats) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');

        var budget = _settlementEducationBudget(context.locationId);

        var institutionCount = summaryStats ? summaryStats.institutionCount : null;
        var studentCount = summaryStats ? summaryStats.currentStudents : null;
        var teacherCount = summaryStats ? summaryStats.totalTeachers : null;

        var addBtn = '<button type="button" class="st-btn st-btn--accent" ' +
            'data-action="create-institution">' +
            icon('PLUS') + ' New Institution</button>';
        var refreshBtn = '<button type="button" class="st-btn" ' +
            'data-action="refresh">' +
            icon('REFRESH') + ' Refresh</button>';

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('BOOK') + ' Education in ' + esc(name) + '</div>' +
            '<div class="st-header__subtitle">' +
            'Budget: ' + fmtGold(budget) +
            ' \u00b7 ' + fmtNum(institutionCount) + ' institutions' +
            ' \u00b7 ' + fmtNum(studentCount) + ' students' +
            ' \u00b7 ' + fmtNum(teacherCount) + ' teachers' +
            '</div>' +
            '</div>' +
            '<div class="st-header__actions">' +
            refreshBtn + addBtn +
            '</div>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Institutions, enrollment, curriculum, tuition, and ' +
            'ownership are managed through the education modals. This tab ' +
            'is a scoped view: it shows institutions located in this ' +
            'settlement and the settlement\'s education budget.</span></div>';
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _handleAction(action, locationId) {
        if (action === 'refresh') {
            refresh();
            return;
        }
        if (action === 'create-institution') {
            _openCreateInstitution(locationId);
            return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stEducationWired) return;
        container.__stEducationWired = true;
        container.addEventListener('click', function (event) {
            var actionBtn = event.target.closest('[data-action]');
            if (actionBtn && container.contains(actionBtn)) {
                event.preventDefault();
                _handleAction(actionBtn.dataset.action, locationId);
                return;
            }
            var viewBtn = event.target.closest('.view-institution-btn');
            if (viewBtn && container.contains(viewBtn)) {
                event.preventDefault();
                var vid = viewBtn.dataset.institutionId;
                if (vid) _openInstitutionDetails(vid);
                return;
            }
            var editBtn = event.target.closest('.edit-institution-btn');
            if (editBtn && container.contains(editBtn)) {
                event.preventDefault();
                var eid = editBtn.dataset.institutionId;
                if (eid) _openInstitutionEdit(eid);
                return;
            }
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementEducation(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;

        // Hydrate EducationState if the bootstrap hasn't. See
        // EDUCATION STATE HYDRATION GUARD in the header.
        _ensureEducationStateHydrated();

        if (!_getEducationUI()) {
            container.innerHTML = '<div class="st-error">' +
                'EducationUI is not available. Load education-ui-list.js ' +
                'before the settlement education tab.</div>';
            return;
        }

        var summaryStats = null;
        var EQ = _getEducationQueries();
        if (EQ) {
            try {
                summaryStats = EQ.getLocationEducationSummary(locationId, false);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-education-tab: ' +
                        'getLocationEducationSummary threw:', err);
                }
                summaryStats = null;
            }
        }

        var html = '<div class="st-tab">' +
            _buildHeader(context, summaryStats) +
            _renderSummary(locationId) +
            _renderInstitutionList(locationId) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementEducation);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-education-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementEducation = renderSettlementEducation;

})();
