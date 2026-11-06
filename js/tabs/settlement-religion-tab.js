/**
 * =============================================================================
 * SETTLEMENT RELIGION TAB
 * js/tabs/settlement-religion-tab.js
 * =============================================================================
 *
 * Renders the settlement's religious landscape: per-religion demographic
 * breakdown, dominant religion and religious unity (both with reason
 * codes), and places of worship in the settlement subtree. Hosts the
 * action that opens the create-place modal and routes place clicks to
 * the religion details modal.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - SettlementReligionQueries.getReligiousBreakdown(locationId)
 *   - SettlementReligionQueries.getPlacesOfWorship(locationId)
 *   - ReligionQueries.getReligion(religionId)
 *   - ReligionQueries.getAllReligions({ includeDeprecated: false })
 *   - context.viewModel.religiousUnity / dominantReligion / reasons
 *
 * DELEGATED MODALS:
 *   - ReligionModals.openCreatePlaceOfWorshipModal(religionId, { onSuccess })
 *   - ReligionModals.openReligionDetailsModal(religionId, { onRefresh })
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'religion';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)        { return H().esc(v); }
    function icon(n)       { return H().icon(n); }
    function fmtNum(v)     { return H().fmtNumber(v); }
    function fmtPercent(v) { return H().fmtPercent(v); }
    function unknown()     { return H().unknown(); }
    function refresh()     { H().requestRefresh(SCOPE, TAB_ID); }

    // -------------------------------------------------------------------
    // Dependency access (soft; each guards at call time)
    // -------------------------------------------------------------------

    function _getSettlementReligionQueries() {
        var Q = window.SettlementReligionQueries;
        if (!Q || typeof Q.getPlacesOfWorship !== 'function'
            || typeof Q.getReligiousBreakdown !== 'function') {
            return null;
        }
        return Q;
    }

    function _getReligionQueries() {
        var Q = window.ReligionQueries;
        if (!Q || typeof Q.getReligion !== 'function') return null;
        return Q;
    }

    function _getReligionModals() { return window.ReligionModals || null; }

    function _placeName(locationId) {
        var pq = window.PlaceQueries;
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // -------------------------------------------------------------------
    // Reason-code labels
    // -------------------------------------------------------------------

    function _religiousUnityLabel(reason, value) {
        if (reason === 'available') return fmtPercent(value);
        if (reason === 'no_population') return esc('No population');
        if (reason === 'no_breakdown') return esc('Unavailable');
        return unknown();
    }

    function _dominantReligionLabel(reason, religion) {
        if (reason === 'available' && religion) {
            return esc(religion.name || religion.id || 'Unknown');
        }
        if (reason === 'no_population') return esc('No population');
        if (reason === 'no_breakdown') return esc('Unavailable');
        if (reason === 'unaffiliated_majority') return esc('Unaffiliated majority');
        if (reason === 'no_religions') return esc('No religions');
        return unknown();
    }

    function _religiousUnityClass(reason, value) {
        if (reason !== 'available' || typeof value !== 'number') {
            return 'st-stat__value';
        }
        if (value >= 70) return 'st-stat__value st-stat__value--pos';
        if (value >= 40) return 'st-stat__value st-stat__value--accent';
        return 'st-stat__value st-stat__value--neg';
    }

    // -------------------------------------------------------------------
    // Place-of-worship helpers
    // -------------------------------------------------------------------

    function _resolveReligionName(place) {
        if (!place) return null;
        if (typeof place.religionName === 'string'
            && place.religionName.length > 0) {
            return place.religionName;
        }
        if (!place.religionId) return null;
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        try {
            var r = RQ.getReligion(place.religionId);
            return r ? (r.name || r.id || null) : null;
        } catch (e) {
            return null;
        }
    }

    function _isPlaceActive(place) {
        if (!place) return false;
        return place.isActive !== false;
    }

    // -------------------------------------------------------------------
    // Modal delegation
    // -------------------------------------------------------------------

    function _activeReligions() {
        var RQ = _getReligionQueries();
        if (!RQ || typeof RQ.getAllReligions !== 'function') return [];
        try {
            return RQ.getAllReligions({ includeDeprecated: false }) || [];
        } catch (e) {
            return [];
        }
    }

    function _openCreatePlaceModal(locationId) {
        var M = _getReligionModals();
        if (!M || typeof M.openCreatePlaceOfWorshipModal !== 'function') {
            H().toast(
                'Religion modals are not loaded. Open the Religion manager ' +
                'to create places of worship.', 'error');
            return;
        }

        var religions = _activeReligions();
        if (religions.length === 0) {
            H().toast(
                'No active religions. Create a religion in the Religion ' +
                'manager first.', 'error');
            return;
        }

        function _launch(religionId) {
            try {
                M.openCreatePlaceOfWorshipModal(religionId, {
                    onSuccess: function () { refresh(); }
                });
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-religion-tab: ' +
                        'openCreatePlaceOfWorshipModal threw:', err);
                }
                H().toast('Could not open place modal.', 'error');
            }
        }

        if (religions.length === 1) {
            _launch(religions[0].id);
            return;
        }

        _openReligionChooserModal(religions, function (religion) {
            _launch(religion.id);
        });
    }

    function _openReligionChooserModal(religions, onSelect) {
        if (typeof window.openModal !== 'function') {
            H().toast('Modal system not available.', 'error');
            return;
        }

        var optionsHtml = '';
        for (var i = 0; i < religions.length; i++) {
            optionsHtml += '<option value="' +
                esc(religions[i].id) + '">' +
                esc(religions[i].name || religions[i].id) +
                '</option>';
        }

        var content =
            '<div class="st-tab">' +
            '<div class="st-header"><div>' +
            '<div class="st-header__title">Choose Religion</div>' +
            '<div class="st-header__subtitle">' +
            'Choose the religion this place will serve.</div>' +
            '</div></div>' +
            '<div class="st-filters">' +
            '<div class="st-filters__field">' +
            '<label class="st-filters__label">Religion</label>' +
            '<select class="st-filters__select" id="chooserReligionSelect">' +
            optionsHtml + '</select>' +
            '</div>' +
            '</div>' +
            '</div>';

        try {
            window.openModal({
                titleHtml: 'Create Place of Worship',
                contentHtml: content,
                confirmText: 'Continue',
                cancelText: 'Cancel',
                onConfirm: function (modalEl) {
                    var sel = modalEl.querySelector('#chooserReligionSelect');
                    var id = sel ? sel.value : null;
                    if (!id) return false;
                    for (var j = 0; j < religions.length; j++) {
                        if (religions[j].id === id) {
                            onSelect(religions[j]);
                            return true;
                        }
                    }
                    return false;
                }
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-religion-tab: openModal threw:', err);
            }
            H().toast('Could not open religion chooser.', 'error');
        }
    }

    function _openPlaceDetails(placeId) {
        var M = _getReligionModals();
        if (!M || typeof M.openReligionDetailsModal !== 'function') {
            H().toast('Religion modals are not loaded.', 'error');
            return;
        }
        var RQ = _getReligionQueries();
        if (!RQ || typeof RQ.getPlaceOfWorship !== 'function') {
            H().toast(
                'Place details are managed through the Religion manager.',
                'info');
            return;
        }
        var record;
        try { record = RQ.getPlaceOfWorship(placeId); }
        catch (e) { record = null; }
        if (record && record.religionId) {
            try {
                M.openReligionDetailsModal(record.religionId, {
                    onRefresh: function () { refresh(); }
                });
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-religion-tab: openReligionDetailsModal ' +
                        'threw:', err);
                }
                H().toast('Could not open place details.', 'error');
            }
            return;
        }
        H().toast(
            'Place details are managed through the Religion manager.',
            'info');
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, placeCount) {
        var s = context.viewModel || {};
        var name = s.name
            ? s.name
            : (_placeName(context.locationId) || '(unnamed location)');

        var unityHtml = _religiousUnityLabel(s.religiousUnityReason, s.religiousUnity);
        var unityClass = _religiousUnityClass(s.religiousUnityReason, s.religiousUnity);
        var dominantHtml = _dominantReligionLabel(
            s.dominantReligionReason, s.dominantReligion);

        var refreshBtn = '<button type="button" class="st-btn" ' +
            'data-action="refresh">' +
            icon('REFRESH') + ' Refresh</button>';

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('CIRCLE_DOT') + ' Religion in ' + esc(name) + '</div>' +
            '<div class="st-header__subtitle">' +
            fmtNum(placeCount) + ' place' +
            (placeCount === 1 ? '' : 's') + ' of worship' +
            '</div>' +
            '</div>' +
            '<div>' +
            '<div class="st-inline">' +
            '<span class="st-inline__label">Unity</span>' +
            '<span class="' + unityClass + '">' + unityHtml + '</span>' +
            '</div>' +
            '<div class="st-inline">' +
            '<span class="st-inline__label">Dominant</span>' +
            '<span class="st-inline__value">' + dominantHtml + '</span>' +
            '</div>' +
            refreshBtn +
            '</div>' +
            '</div>';
    }

    function _buildBreakdownSection(context) {
        var locationId = context.locationId;
        var SQ = _getSettlementReligionQueries();
        if (!SQ) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('CIRCLE_DOT') + ' Religious Demographics</div>' +
                '<div class="st-section__empty">' +
                'Religion queries are not available.</div></div>';
        }

        var breakdown;
        try { breakdown = SQ.getReligiousBreakdown(locationId); }
        catch (e) { breakdown = null; }

        if (!breakdown) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('CIRCLE_DOT') + ' Religious Demographics</div>' +
                '<div class="st-section__empty">' +
                'Religious breakdown unavailable.</div></div>';
        }

        var total = typeof breakdown.total === 'number' ? breakdown.total : 0;
        var unaffiliated = typeof breakdown.unaffiliated === 'number'
            ? breakdown.unaffiliated : 0;

        if (total === 0) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('CIRCLE_DOT') + ' Religious Demographics</div>' +
                '<div class="st-section__empty">' +
                'No population in this settlement. Religious breakdown ' +
                'is undefined.</div></div>';
        }

        var byReligion = breakdown.byReligion || {};
        var entries = [];
        for (var religionId in byReligion) {
            if (!Object.prototype.hasOwnProperty.call(byReligion, religionId)) {
                continue;
            }
            var entry = byReligion[religionId];
            var count = entry && typeof entry.count === 'number'
                ? entry.count : 0;
            if (count === 0) continue;

            var religion = null;
            var RQ = _getReligionQueries();
            if (RQ) {
                try { religion = RQ.getReligion(religionId); }
                catch (e) { religion = null; }
            }
            entries.push({
                religionId: religionId,
                name: religion ? (religion.name || religion.id) : 'Unknown',
                count: count
            });
        }

        entries.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });

        var dominantId = (context.viewModel
            && context.viewModel.dominantReligion)
            ? context.viewModel.dominantReligion.id : null;

        function barRow(row) {
            var pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            var isDominant = (dominantId !== null
                && row.religionId === dominantId);
            var cls = isDominant ? 'st-row st-row--accent' : 'st-row';
            return '<div class="' + cls + '">' +
                '<div class="st-row__body">' +
                '<div class="st-row__title">' +
                esc(row.name) +
                (isDominant ? ' ' + icon('STAR_4') : '') +
                '</div>' +
                '</div>' +
                '<div class="st-row__meta">' +
                fmtNum(row.count) + ' (' + fmtPercent(pct) + ')' +
                '</div>' +
                '</div>';
        }

        var rows = '';
        for (var i = 0; i < entries.length; i++) {
            rows += barRow(entries[i]);
        }

        var unaffiliatedPct = total > 0
            ? Math.round((unaffiliated / total) * 100) : 0;
        var unaffiliatedRow =
            '<div class="st-row st-row--dim">' +
            '<div class="st-row__body">' +
            '<div class="st-row__title">Unaffiliated</div>' +
            '</div>' +
            '<div class="st-row__meta">' +
            fmtNum(unaffiliated) + ' (' + fmtPercent(unaffiliatedPct) + ')' +
            '</div>' +
            '</div>';

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('CIRCLE_DOT') + ' Religious Demographics</div>' +
            '<div class="st-rows">' +
            (rows || '') +
            (unaffiliated > 0 ? unaffiliatedRow : '') +
            '</div>' +
            '<div class="st-row__meta">' +
            'Total counted: ' + fmtNum(total) +
            '</div>' +
            '</div>';
    }

    function _buildPlacesSection(context) {
        var locationId = context.locationId;
        var SQ = _getSettlementReligionQueries();
        if (!SQ) return '';

        var places;
        try { places = SQ.getPlacesOfWorship(locationId); }
        catch (e) { places = null; }

        if (places === null) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('LOCATION') + ' Places of Worship</div>' +
                '<div class="st-section__empty">' +
                'Settlement not found.</div></div>';
        }

        var activeReligions = _activeReligions();
        var canCreate = activeReligions.length > 0;

        var createBtn = '<button type="button" class="st-btn' +
            (canCreate ? ' st-btn--accent' : '') + '" ' +
            'data-action="create-place"' +
            (canCreate ? '' : ' disabled') + '>' +
            icon('PLUS') + ' Create Place of Worship</button>';

        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('LOCATION') + ' Places of Worship (' +
            fmtNum(places.length) + ')' +
            '<span style="flex:1;"></span>' + createBtn +
            '</div>';

        if (!canCreate) {
            html += '<div class="st-row st-row--warn">' +
                '<div class="st-row__body">' + icon('WARNING') +
                ' No active religions. Create a religion in the Religion ' +
                'manager first.</div></div>';
        }

        if (places.length === 0) {
            html += '<div class="st-section__empty">' +
                'No places of worship in this settlement.</div>';
            return html + '</div>';
        }

        html += '<div class="st-rows">';

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (!place || !place.id) continue;

            var active = _isPlaceActive(place);
            var cls = active ? 'st-row st-row--success' : 'st-row st-row--danger';
            var statusLabel = active ? 'Active' : 'Inactive';
            var religionName = _resolveReligionName(place) || 'Unknown';
            var placeType = place.type || 'temple';

            var followerCount = typeof place.currentFollowers === 'number'
                ? place.currentFollowers : null;
            var tithes = typeof place.annualIncome === 'number'
                ? place.annualIncome : null;

            var metaParts = ['Type: ' + placeType];
            if (followerCount !== null) {
                metaParts.push('Followers: ' + followerCount);
            }
            if (tithes !== null) {
                metaParts.push('Tithes: ' + tithes + 'g/yr');
            }

            html += '<div class="' + cls + '" ' +
                'data-action="place-details" ' +
                'data-place-id="' + esc(place.id) + '">' +
                '<div class="st-row__body">' +
                '<div class="st-row__title">' +
                esc(place.name || 'Unnamed place') +
                ' <span class="st-badge st-badge--dim">' +
                esc(placeType) + '</span>' +
                ' <span class="st-badge' +
                (active ? ' st-badge--pos' : ' st-badge--neg') + '">' +
                esc(statusLabel) + '</span>' +
                ' <span class="st-badge st-badge--warn">' +
                esc(religionName) + '</span>' +
                '</div>' +
                '<div class="st-row__meta">' +
                esc(metaParts.join(' \u00b7 ')) + '</div>' +
                '</div>' +
                '</div>';
        }

        html += '</div></div>';
        return html;
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Places of worship are owned by the Religion domain. ' +
            'Click a place to open the Religion details for that place\'s ' +
            'faith. Religious unity affects settlement prosperity and crime ' +
            'rate.</span></div>';
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _handleAction(action, btn, locationId) {
        if (action === 'refresh') {
            refresh();
            return;
        }
        if (action === 'create-place') {
            _openCreatePlaceModal(locationId);
            return;
        }
        if (action === 'place-details') {
            var placeId = btn.dataset.placeId;
            if (placeId) _openPlaceDetails(placeId);
            return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stReligionWired) return;
        container.__stReligionWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            if (btn.disabled) return;
            event.preventDefault();
            _handleAction(btn.dataset.action, btn, locationId);
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementReligion(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;

        var placeCount = 0;
        var SQ = _getSettlementReligionQueries();
        if (SQ) {
            try {
                var places = SQ.getPlacesOfWorship(locationId);
                if (Array.isArray(places)) placeCount = places.length;
            } catch (e) { placeCount = 0; }
        }

        var html = '<div class="st-tab">' +
            _buildHeader(context, placeCount) +
            _buildBreakdownSection(context) +
            _buildPlacesSection(context) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementReligion);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-religion-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementReligion = renderSettlementReligion;

})();
