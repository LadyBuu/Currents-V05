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
 * capacity, or health scores. Those are the education domain's queries
 * (EducationQueries). The tab does NOT render institution details,
 * enrollment, curriculum, tuition, or ownership. Those are
 * modals-education.js.
 *
 * The only things this tab adds on top of the education domain's own
 * UI are:
 *
 *   1. A settlement-scoped header (name + budget + counts).
 *   2. A location filter on the institution list.
 *   3. A "New Institution" button that pre-fills the settlement.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DELEGATED RENDERING (EducationUI writes into the DOM by id):
 *   - renderEducationSummary(containerId, locationId, {})
 *   - renderInstitutionList(containerId, { filters: { location }, ... })
 *
 * DELEGATED MODALS (resolved at click time):
 *   - window.openCreateInstitutionModal(onSuccess, { locationId })
 *   - window.openInstitutionDetailsModal(institutionId, onSuccess)
 *   - window.openEditInstitutionModal(institutionId, onSuccess)
 *
 * DOMAIN UI IS A DOM WRITER, NOT A STRING RETURNER:
 *   EducationUI's renderers write into a host element by id. To compose
 *   them into a single innerHTML assignment we create a hidden host,
 *   call the renderer, and adopt its innerHTML. This is the same
 *   approach the current education tab uses and the same approach the
 *   education-manager tabs use. It is not a workaround; it is the
 *   agreed contract.
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
    //
    // EducationUI writes into a host by id. We create a hidden host,
    // call the renderer, adopt its innerHTML, remove the host. This is
    // the same pattern the current education tab uses (see its header
    // for the reasoning).

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
            // Header action buttons (data-action)
            var actionBtn = event.target.closest('[data-action]');
            if (actionBtn && container.contains(actionBtn)) {
                event.preventDefault();
                _handleAction(actionBtn.dataset.action, locationId);
                return;
            }
            // Institution-list buttons written by EducationUI use
            // .view-institution-btn / .edit-institution-btn and carry
            // data-institution-id.
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
