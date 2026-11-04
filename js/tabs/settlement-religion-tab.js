/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RELIGION TAB
 * js/tabs/settlement-religion-tab.js
 * =============================================================================
 *
 * RELIGION TAB RENDERER.
 *
 * Renders the settlement's religious landscape: the per-religion
 * demographic breakdown, the dominant religion and religious unity (both
 * with reason codes), and the places of worship in the settlement. Hosts
 * the actions that open the create-place modal and route the user to the
 * Religion domain's own modals for place details.
 *
 * It is a UI module. It:
 *   - reads through SettlementReligionQueries
 *   - reads place-of-worship data through ReligionQueries
 *   - opens the create-place modal via ReligionModals
 *   - does not read canonical settlement data directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not fabricate missing domain values
 *   - does not render raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Step-1 duplication cleanup):
 *     - Removed the dead helper _currentLocationIdForPlace. It always
 *       returned null and caused _openPlaceDetails to run a
 *       getPlacesOfWorship(null) call as dead code before falling back
 *       to the real path. The active path — resolve the place's religion
 *       via ReligionQueries.getPlaceOfWorship(placeId) and open
 *       ReligionModals.openReligionDetailsModal — is unchanged.
 *     - No other behavioral change. Every read, mutation-delegation, and
 *       modal-open path is byte-identical.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getSettlementReligionQueries() {
        var Q = window.SettlementReligionQueries;
        if (!Q || typeof Q.getPlacesOfWorship !== 'function') {
            throw new Error(
                'settlement-religion-tab: SettlementReligionQueries is ' +
                'missing. Load settlement-religion-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getReligionQueries() {
        var Q = window.ReligionQueries;
        if (!Q || typeof Q.getReligion !== 'function') {
            throw new Error(
                'settlement-religion-tab: ReligionQueries is missing. ' +
                'Load religion-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getReligionModals() {
        return window.ReligionModals || null;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
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

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _escapeHtml(value);
    }

    function _fmtPercent(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString()) + '%';
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
            tabs.requestRender('religion');
        }
    }

    // =========================================================================
    // 3. REASON-CODE LABELS
    // =========================================================================

    function _religiousUnityLabel(reason, value) {
        if (reason === 'available') return _fmtPercent(value);
        if (reason === 'no_population') return _escapeHtml('No population');
        if (reason === 'no_breakdown') return _escapeHtml('Unavailable');
        return _unknown();
    }

    function _dominantReligionLabel(reason, religion) {
        if (reason === 'available' && religion) {
            return _escapeHtml(religion.name || religion.id || 'Unknown');
        }
        if (reason === 'no_population') return _escapeHtml('No population');
        if (reason === 'no_breakdown') return _escapeHtml('Unavailable');
        if (reason === 'unaffiliated_majority') return _escapeHtml('Unaffiliated majority');
        if (reason === 'no_religions') return _escapeHtml('No religions');
        return _unknown();
    }

    function _religiousUnityColor(reason, value) {
        if (reason !== 'available' || typeof value !== 'number') {
            return 'var(--dim)';
        }
        if (value >= 70) return 'var(--success)';
        if (value >= 40) return 'var(--accent)';
        return 'var(--danger)';
    }

    // =========================================================================
    // 4. PLACE-OF-WORSHIP DISPLAY HELPERS
    // =========================================================================

    function _resolveReligionName(place) {
        if (!place) return null;
        if (typeof place.religionName === 'string' && place.religionName.length > 0) {
            return place.religionName;
        }
        var rq = _getReligionQueries();
        if (!place.religionId) return null;
        try {
            var religion = rq.getReligion(place.religionId);
            return religion ? (religion.name || religion.id || null) : null;
        } catch (err) {
            return null;
        }
    }

    function _isPlaceActive(place) {
        if (!place) return false;
        return place.isActive !== false;
    }

    // =========================================================================
    // 5. ACTION HANDLERS
    // =========================================================================

    function _openCreatePlaceModal(locationId) {
        var modals = _getReligionModals();
        if (!modals || typeof modals.openCreatePlaceOfWorshipModal !== 'function') {
            _toast(
                'Religion modals are not loaded. Open the Religion manager ' +
                'to create places of worship.',
                'error'
            );
            return;
        }

        var religions = _activeReligions();
        if (religions.length === 0) {
            _toast(
                'No active religions. Create a religion in the Religion ' +
                'manager first.',
                'error'
            );
            return;
        }

        if (religions.length === 1) {
            modals.openCreatePlaceOfWorshipModal(religions[0].id, {
                onSuccess: function () {
                    _requestRefresh();
                }
            });
            return;
        }

        _openReligionChooserModal(religions, function (religion) {
            modals.openCreatePlaceOfWorshipModal(religion.id, {
                onSuccess: function () {
                    _requestRefresh();
                }
            });
        });
    }

    function _activeReligions() {
        var rq = _getReligionQueries();
        if (typeof rq.getAllReligions !== 'function') return [];
        try {
            return rq.getAllReligions({ includeDeprecated: false }) || [];
        } catch (err) {
            return [];
        }
    }

    function _openReligionChooserModal(religions, onSelect) {
        if (typeof window.openModal !== 'function') {
            _toast('Modal system not available.', 'error');
            return;
        }

        var optionsHtml = '';
        for (var i = 0; i < religions.length; i++) {
            optionsHtml += '<option value="' +
                _escapeHtml(religions[i].id) + '">' +
                _escapeHtml(religions[i].name || religions[i].id) +
                '</option>';
        }

        var content =
            '<div style="padding:4px;">' +
            '<div style="font-size:0.65rem;color:var(--dim);margin-bottom:8px;">' +
            'Choose the religion this place will serve.</div>' +
            '<div class="form-group">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);' +
            'margin-bottom:4px;">Religion</label>' +
            '<select id="chooserReligionSelect" ' +
            'style="width:100%;padding:8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;' +
            'color:var(--text);font-size:0.7rem;">' +
            optionsHtml +
            '</select></div></div>';

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
    }

    /**
     * Opens the Religion-domain details modal for the religion of the
     * given place of worship.
     *
     * There is no dedicated "place details" modal on the public Religion
     * modal surface; the religion details modal (which shows the
     * religion's places, including this one) is the correct entry point.
     *
     * @param {string} placeId
     */
    function _openPlaceDetails(placeId) {
        var modals = _getReligionModals();
        if (!modals || typeof modals.openReligionDetailsModal !== 'function') {
            _toast('Religion modals are not loaded.', 'error');
            return;
        }

        var rq = _getReligionQueries();
        var record = null;
        if (typeof rq.getPlaceOfWorship === 'function') {
            try {
                record = rq.getPlaceOfWorship(placeId);
            } catch (err) {
                record = null;
            }
        }

        if (record && record.religionId) {
            modals.openReligionDetailsModal(record.religionId, {
                onRefresh: function () { _requestRefresh(); }
            });
            return;
        }

        _toast(
            'Place details are managed through the Religion manager.',
            'info'
        );
    }

    // =========================================================================
    // 6. SECTION BUILDERS
    // =========================================================================

    function _buildHeader(context, placeCount) {
        var locationId = context.locationId;
        var summary = context.viewModel || {};
        var name = summary.name
            ? summary.name
            : (_placeName(locationId) || '(unnamed location)');

        var unityHtml = _religiousUnityLabel(
            summary.religiousUnityReason,
            summary.religiousUnity
        );
        var unityColor = _religiousUnityColor(
            summary.religiousUnityReason,
            summary.religiousUnity
        );
        var dominantHtml = _dominantReligionLabel(
            summary.dominantReligionReason,
            summary.dominantReligion
        );

        var refreshBtn = '<button type="button" class="religion-tab-btn" ' +
            'data-action="refresh" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('CIRCLE_DOT') + ' Religion in ' +
            _escapeHtml(name) + '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            _fmtNumber(placeCount) + ' place' +
            (placeCount === 1 ? '' : 's') + ' of worship' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:4px;' +
            'align-items:flex-end;">' +
            refreshBtn +
            '<div style="font-size:0.6rem;color:var(--text);">Unity: ' +
            '<span style="color:' + unityColor + ';font-weight:bold;">' +
            unityHtml + '</span></div>' +
            '<div style="font-size:0.55rem;color:var(--dim);">Dominant: ' +
            dominantHtml + '</div>' +
            '</div>' +
            '</div>';
    }

    function _buildBreakdownSection(context) {
        var locationId = context.locationId;
        var breakdown;
        try {
            breakdown = _getSettlementReligionQueries().getReligiousBreakdown(locationId);
        } catch (err) {
            breakdown = null;
        }

        if (!breakdown) {
            return '<div style="background:var(--bg2);padding:12px 16px;' +
                'border-radius:8px;margin-bottom:16px;' +
                'border:1px solid var(--border);">' +
                '<div style="font-size:0.65rem;color:var(--accent-light);' +
                'font-weight:bold;margin-bottom:6px;">' +
                _getIcon('CIRCLE_DOT') + ' Religious Demographics</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);' +
                'text-align:center;padding:8px 0;">' +
                'Religious breakdown unavailable.</div>' +
                '</div>';
        }

        var total = typeof breakdown.total === 'number' ? breakdown.total : 0;
        var unaffiliated = typeof breakdown.unaffiliated === 'number'
            ? breakdown.unaffiliated
            : 0;

        if (total === 0) {
            return '<div style="background:var(--bg2);padding:12px 16px;' +
                'border-radius:8px;margin-bottom:16px;' +
                'border:1px solid var(--border);">' +
                '<div style="font-size:0.65rem;color:var(--accent-light);' +
                'font-weight:bold;margin-bottom:6px;">' +
                _getIcon('CIRCLE_DOT') + ' Religious Demographics</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);' +
                'text-align:center;padding:8px 0;">' +
                'No population in this settlement. Religious breakdown ' +
                'is undefined.</div>' +
                '</div>';
        }

        var byReligion = breakdown.byReligion || {};
        var entries = [];
        for (var religionId in byReligion) {
            if (!Object.prototype.hasOwnProperty.call(byReligion, religionId)) {
                continue;
            }
            var count = (byReligion[religionId] && typeof byReligion[religionId].count === 'number')
                ? byReligion[religionId].count
                : 0;
            if (count === 0) continue;

            var religion = null;
            try {
                religion = _getReligionQueries().getReligion(religionId);
            } catch (err) {
                religion = null;
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
            ? context.viewModel.dominantReligion.id
            : null;

        function barRow(row) {
            var pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            var barWidth = Math.max(2, pct);
            var isDominant = (dominantId !== null && row.religionId === dominantId);
            var color = isDominant ? 'var(--accent)' : 'var(--bg4)';
            var labelColor = isDominant ? 'var(--accent-light)' : 'var(--text)';
            var fontWeight = isDominant ? 'font-weight:bold;' : '';

            return '<div style="display:flex;align-items:center;gap:8px;' +
                'padding:2px 4px;font-size:0.55rem;' +
                (isDominant ? 'background:var(--accent-dim);border-radius:4px;' : '') +
                '">' +
                '<span style="min-width:110px;color:' + labelColor + ';' + fontWeight + '">' +
                _escapeHtml(row.name) +
                (isDominant ? ' ' + _getIcon('STAR_4') : '') +
                '</span>' +
                '<div style="flex:1;height:8px;background:var(--bg3);' +
                'border-radius:4px;overflow:hidden;">' +
                '<div style="width:' + barWidth + '%;height:100%;' +
                'background:' + color + ';border-radius:4px;"></div>' +
                '</div>' +
                '<span style="min-width:60px;text-align:right;color:var(--dim);">' +
                _fmtNumber(row.count) + ' (' + _fmtPercent(pct) + ')</span>' +
                '</div>';
        }

        var rows = '';
        for (var i = 0; i < entries.length; i++) {
            rows += barRow(entries[i]);
        }

        var unaffiliatedPct = total > 0
            ? Math.round((unaffiliated / total) * 100)
            : 0;
        var unaffiliatedRow =
            '<div style="display:flex;align-items:center;gap:8px;' +
            'padding:2px 4px;font-size:0.55rem;color:var(--dim);">' +
            '<span style="min-width:110px;">Unaffiliated</span>' +
            '<div style="flex:1;height:8px;background:var(--bg3);' +
            'border-radius:4px;overflow:hidden;">' +
            '<div style="width:' + Math.max(2, unaffiliatedPct) + '%;height:100%;' +
            'background:var(--bg4);border-radius:4px;"></div>' +
            '</div>' +
            '<span style="min-width:60px;text-align:right;">' +
            _fmtNumber(unaffiliated) + ' (' + _fmtPercent(unaffiliatedPct) + ')</span>' +
            '</div>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:6px;">' +
            _getIcon('CIRCLE_DOT') + ' Religious Demographics</div>' +
            '<div style="display:flex;flex-direction:column;gap:3px;">' +
            (rows || '') +
            (unaffiliated > 0 ? unaffiliatedRow : '') +
            '</div>' +
            '<div style="font-size:0.5rem;color:var(--dim);' +
            'margin-top:6px;text-align:right;">' +
            'Total counted: ' + _fmtNumber(total) + '</div>' +
            '</div>';
    }

    function _buildPlacesSection(context) {
        var locationId = context.locationId;
        var places;
        try {
            places = _getSettlementReligionQueries().getPlacesOfWorship(locationId);
        } catch (err) {
            places = null;
        }

        if (places === null) {
            return '<div style="background:var(--bg2);padding:12px 16px;' +
                'border-radius:8px;margin-bottom:16px;' +
                'border:1px solid var(--border);">' +
                '<div style="font-size:0.65rem;color:var(--accent-light);' +
                'font-weight:bold;margin-bottom:6px;">' +
                _getIcon('LOCATION') + ' Places of Worship</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);' +
                'text-align:center;padding:8px 0;">' +
                'Settlement not found.</div>' +
                '</div>';
        }

        var header = '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;">' +
            _getIcon('LOCATION') + ' Places of Worship (' +
            _fmtNumber(places.length) + ')</div>';

        var activeReligions = _activeReligions();
        var canCreate = activeReligions.length > 0;

        var createBtn = '<button type="button" class="religion-tab-btn" ' +
            'data-action="create-place" ' + (canCreate ? '' : 'disabled ') +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid ' + (canCreate ? 'var(--accent)' : 'var(--border)') + ';' +
            'border-radius:4px;cursor:' + (canCreate ? 'pointer' : 'not-allowed') + ';' +
            'color:' + (canCreate ? 'var(--accent-light)' : 'var(--dim)') + ';' +
            (canCreate ? '' : 'opacity:0.5;') + '">' +
            _getIcon('PLUS') + ' Create Place of Worship</button>';

        var html = '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            header + createBtn + '</div>';

        if (!canCreate) {
            html += '<div style="font-size:0.55rem;color:var(--warn);' +
                'margin-bottom:8px;padding:0 4px;">' +
                _getIcon('WARNING') + ' No active religions. Create a religion ' +
                'in the Religion manager first.</div>';
        }

        if (places.length === 0) {
            html += '<div style="text-align:center;padding:16px;' +
                'color:var(--dim);font-size:0.6rem;background:var(--bg3);' +
                'border-radius:6px;">' +
                'No places of worship in this settlement.</div>';
            return html;
        }

        html += '<div style="display:flex;flex-direction:column;gap:6px;">';

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (!place || !place.id) continue;

            var active = _isPlaceActive(place);
            var statusColor = active ? 'var(--success)' : 'var(--danger)';
            var statusLabel = active ? 'Active' : 'Inactive';
            var religionName = _resolveReligionName(place) || 'Unknown';
            var placeType = place.type || 'temple';

            var followerCount = typeof place.currentFollowers === 'number'
                ? place.currentFollowers
                : null;
            var tithes = typeof place.annualIncome === 'number'
                ? place.annualIncome
                : null;

            var metaParts = [];
            metaParts.push('Type: ' + placeType);
            if (followerCount !== null) {
                metaParts.push('Followers: ' + followerCount);
            }
            if (tithes !== null) {
                metaParts.push('Tithes: ' + tithes + 'g/yr');
            }

            html += '<div class="religion-place-row" ' +
                'data-place-id="' + _escapeHtml(place.id) + '" ' +
                'style="background:var(--bg);border:1px solid var(--border);' +
                'border-left:3px solid ' + statusColor + ';border-radius:6px;' +
                'padding:10px 14px;cursor:pointer;">' +
                '<div style="display:flex;justify-content:space-between;' +
                'align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:6px;' +
                'flex-wrap:wrap;">' +
                '<span style="font-size:0.7rem;font-weight:bold;' +
                'color:var(--text);">' +
                _escapeHtml(place.name || 'Unnamed place') + '</span>' +
                '<span style="font-size:0.5rem;color:var(--dim);' +
                'padding:1px 6px;border:1px solid var(--border);' +
                'border-radius:8px;">' +
                _escapeHtml(placeType) + '</span>' +
                '<span style="font-size:0.5rem;color:' + statusColor + ';' +
                'padding:1px 6px;border:1px solid ' + statusColor + ';' +
                'border-radius:8px;">' +
                _escapeHtml(statusLabel) + '</span>' +
                '<span style="font-size:0.5rem;color:var(--accent);' +
                'padding:1px 6px;border:1px solid var(--accent);' +
                'border-radius:8px;">' +
                _escapeHtml(religionName) + '</span>' +
                '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);' +
                'margin-top:2px;">' +
                _escapeHtml(metaParts.join(' · ')) +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function _buildFooter() {
        return '<div style="padding:8px;background:var(--bg3);border-radius:6px;' +
            'font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            'Places of worship are owned by the Religion domain. Click a ' +
            'place to open the Religion details for that place\'s faith. ' +
            'Religious unity affects settlement prosperity and crime rate.' +
            '</div>';
    }

    // =========================================================================
    // 7. EVENT WIRING
    // =========================================================================

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            var actionBtn = target.closest('.religion-tab-btn');
            if (actionBtn && container.contains(actionBtn)) {
                if (actionBtn.disabled) return;
                event.preventDefault();
                var action = actionBtn.dataset.action;
                if (action === 'refresh') {
                    _requestRefresh();
                } else if (action === 'create-place') {
                    _openCreatePlaceModal(locationId);
                }
                return;
            }

            var placeRow = target.closest('.religion-place-row');
            if (placeRow && container.contains(placeRow)) {
                event.preventDefault();
                _openPlaceDetails(placeRow.dataset.placeId);
                return;
            }
        });
    }

    // =========================================================================
    // 8. RENDER
    // =========================================================================

    function renderSettlementReligion(container, context) {
        if (!container) {
            throw new Error(
                'settlement-religion-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-religion-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;

        var places;
        try {
            places = _getSettlementReligionQueries().getPlacesOfWorship(locationId);
        } catch (err) {
            places = null;
        }
        var placeCount = Array.isArray(places) ? places.length : 0;

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, placeCount) +
            _buildBreakdownSection(context) +
            _buildPlacesSection(context) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // =========================================================================
    // 9. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-religion-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('religion', renderSettlementReligion);
    }

    _register();

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderSettlementReligion = renderSettlementReligion;
    window._renderSettlementReligion = renderSettlementReligion;

})();
