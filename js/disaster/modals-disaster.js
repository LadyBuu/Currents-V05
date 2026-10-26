/**
 * =============================================================================
 * STILL WATERS - DISASTER MODALS (modals-disaster.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/modals-disaster.js
 *
 * PURPOSE:
 *   Modal dialogs for disaster operations. This layer collects input and
 *   hands it to DisasterCommands; it renders data supplied by
 *   DisasterQueries + DisasterViewModels.
 *
 * OWNERSHIP:
 *   - modal construction and lifecycle
 *   - input collection and UI-level validation
 *   - delegating actions to DisasterCommands
 *   - delegating reads to DisasterQueries
 *   - delegating presentation to DisasterViewModels
 *   - calling DisasterCommands.persist() once per modal action
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not mutate disaster records directly.
 *   - It does not carry fallback formatting for crime/damage categories.
 *   - It does not fabricate years, causes, or descriptions.
 *   - It does not call saveMasterData directly.
 *   - It does not use a module-wide "processing" guard.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterConstants, DisasterCommands, DisasterQueries,
 *     DisasterViewModels
 *   - openModal / closeTopModal / _escapeHtml / _getIcon / _showToast
 *   - getFilteredLocationOptions
 *   - getPlaceById, getCurrentYearSafe
 *
 * ICON POLICY: No emojis. Icons via _getIcon + VM.disasterIconName.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.DisasterConstants;
    var Commands = window.DisasterCommands;
    var Queries = window.DisasterQueries;
    var VM = window.DisasterViewModels;

    if (!C)        throw new Error('modals-disaster.js requires DisasterConstants');
    if (!Commands) throw new Error('modals-disaster.js requires DisasterCommands');
    if (!Queries)  throw new Error('modals-disaster.js requires DisasterQueries');
    if (!VM)       throw new Error('modals-disaster.js requires DisasterViewModels');

    if (typeof window.openModal !== 'function') {
        throw new Error('modals-disaster.js requires openModal');
    }
    if (typeof window.closeTopModal !== 'function') {
        throw new Error('modals-disaster.js requires closeTopModal');
    }
    if (typeof window._escapeHtml !== 'function') {
        throw new Error('modals-disaster.js requires _escapeHtml');
    }
    if (typeof window._getIcon !== 'function') {
        throw new Error('modals-disaster.js requires _getIcon');
    }
    if (typeof window._showToast !== 'function') {
        throw new Error('modals-disaster.js requires _showToast');
    }
    if (typeof window.getFilteredLocationOptions !== 'function') {
        throw new Error('modals-disaster.js requires getFilteredLocationOptions');
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error('modals-disaster.js requires getCurrentYearSafe');
    }
    if (typeof window.getPlaceById !== 'function') {
        throw new Error('modals-disaster.js requires getPlaceById');
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _escape(str) { return window._escapeHtml(str); }
    function _icon(name) { return window._getIcon(name); }
    function _toast(message, type) { window._showToast(message, type); }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            _toast(
                'Saved in memory, but persisting failed: ' + (p.reason || 'unknown'),
                'warning'
            );
        }
    }

    function _close() { window.closeTopModal(); }

    function _detail(label, valueHtml) {
        return '' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + _escape(label) + '</div>' +
            '<div style="font-size:0.75rem;">' + valueHtml + '</div>' +
            '</div>';
    }

    function _detailGrid(cells) {
        return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));' +
            'gap:8px;margin-bottom:12px;">' + cells.join('') + '</div>';
    }

    // =========================================================================
    // 2. CREATE DISASTER MODAL
    // =========================================================================

    function openCreateDisasterModal(options) {
        options = options || {};
        var vm = VM.toCreateDisasterModalViewModel(options, window.getCurrentYearSafe());

        var locationOptions = window.getFilteredLocationOptions(vm.defaultLocationId);
        var typeOptions = '<option value="">Select Disaster Type...</option>';
        for (var i = 0; i < C.DISASTER_TYPES.length; i++) {
            var dt = C.DISASTER_TYPES[i];
            var sel = dt.id === vm.defaultDisasterType ? ' selected' : '';
            typeOptions += '<option value="' + _escape(dt.id) + '"' + sel + '>' +
                _escape(dt.name) + '</option>';
        }

        var content =
            '<div style="margin-bottom:12px;">' +
            '<div style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
            '<select id="disasterLocation" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.65rem;">' +
            locationOptions + '</select>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Disaster Type</label>' +
            '<select id="disasterType" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.65rem;">' +
            typeOptions + '</select>' +
            '<div style="margin-top:4px;font-size:0.5rem;color:var(--dim);">' +
            'Leave as "Select Disaster Type..." for a random type weighted by location.' +
            '</div>' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Year</label>' +
            '<input type="number" id="disasterYear" value="' +
            _escape(vm.defaultYear != null ? String(vm.defaultYear) : '') +
            '" style="width:100%;padding:6px 8px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;cursor:pointer;">' +
            '<input type="checkbox" id="disasterApplyEffects"' +
            (vm.applyEffectsDefault ? ' checked' : '') + '>' +
            'Apply effects to characters and settlements' +
            '</label>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.6rem;color:var(--dim);">' +
            'This will generate a disaster and optionally apply its effects ' +
            '(deaths, prosperity loss, crime increase, structural damage).' +
            '</div>' +
            '</div>';

        return window.openModal({
            title: vm.title,
            content: content,
            confirmText: 'Generate Disaster',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                return _submitCreateDisaster(root, options);
            }
        });
    }

    function _submitCreateDisaster(root, options) {
        var locationId = root.querySelector('#disasterLocation').value;
        var disasterType = root.querySelector('#disasterType').value || null;
        var yearRaw = root.querySelector('#disasterYear').value;
        var year = yearRaw === ''
            ? window.getCurrentYearSafe()
            : parseInt(yearRaw, 10);
        var applyEffects = root.querySelector('#disasterApplyEffects').checked;

        if (!locationId) {
            _toast('Please select a location', 'error');
            return false;
        }
        if (isNaN(year)) {
            _toast('Year must be a number', 'error');
            return false;
        }

        var result = Commands.triggerDisaster(locationId, disasterType, year, {
            applyEffects: applyEffects
        });

        if (!result.success) {
            _toast('Failed to generate disaster: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();

        var disaster = result.data && result.data.disaster;
        var summary = 'Disaster generated';
        if (disaster) {
            summary += ': ' + disaster.disasterType;
            if (result.data.victimsKilled > 0) {
                summary += ' (' + result.data.victimsKilled + ' death(s))';
            }
        }

        _toast(summary, 'success');
        _close();
        if (typeof options.onComplete === 'function') options.onComplete(result.data);
        return true;
    }

    // =========================================================================
    // 3. DISASTER DETAILS MODAL
    // =========================================================================

    function openDisasterDetailsModal(disasterId) {
        var disaster = Queries.getDisaster(disasterId);
        if (!disaster) {
            _toast('Disaster not found', 'error');
            return null;
        }

        var locationName = disaster.locationId
            ? (window.getPlaceById(disaster.locationId) || {}).displayName || disaster.locationName
            : disaster.locationName;

        var vm = VM.toDisasterDetailsViewModel(disaster, locationName);
        if (!vm) {
            _toast('Disaster details unavailable', 'error');
            return null;
        }

        var cells = [
            _detail('Type', _escape(vm.type)),
            _detail('Year', _escape(vm.yearLabel)),
            _detail('Location', _escape(vm.locationName)),
            _detail('Severity', _escape(vm.severityLabel)),
            _detail('Deaths', _escape(String(vm.deaths))),
            _detail('Prosperity Lost', _escape(String(vm.prosperityLoss))),
            _detail('Crime Increase',
                _escape(String(Math.round((vm.crimeIncrease || 0) * 100))) + '%'),
            _detail('Total Loss', _escape(vm.totalLoss + ' gold'))
        ];

        var content = '<div style="padding:4px 0;">' + _detailGrid(cells);

        if (vm.description) {
            content += _detail('Description', _escape(vm.description));
        }

        if (vm.metadata && (vm.metadata.severityText || vm.metadata.locationModifier != null)) {
            var metaParts = [];
            if (vm.metadata.severityText) {
                metaParts.push('Severity band: ' + vm.metadata.severityText);
            }
            if (typeof vm.metadata.locationModifier === 'number') {
                metaParts.push('Location modifier: ' + vm.metadata.locationModifier.toFixed(2));
            }
            content +=
                '<div style="margin-top:8px;padding:8px;background:var(--bg3);' +
                'border-radius:6px;font-size:0.6rem;color:var(--dim);">' +
                _escape(metaParts.join(' · ')) +
                '</div>';
        }

        // Structural damage summary
        if (vm.structuralDamage && vm.structuralDamage.totalCount > 0) {
            var sd = vm.structuralDamage;
            content +=
                '<div style="margin-top:8px;padding:8px;background:var(--bg3);' +
                'border-radius:6px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">' +
                'Structural Damage (' + sd.totalCount + ' item(s), ' +
                sd.totalLoss + ' gold lost)' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;' +
                'font-size:0.55rem;text-align:center;">' +
                _damageCell('Features', sd.featuresDestroyed) +
                _damageCell('Schools', sd.schoolsDestroyed) +
                _damageCell('Enterprises', sd.enterprisesDestroyed) +
                _damageCell('Residences', sd.residencesDemolished) +
                _damageCell('Households', sd.householdsDestroyed) +
                '</div>' +
                '</div>';
        }

        content += '</div>';

        return window.openModal({
            title: 'Disaster Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    function _damageCell(label, count) {
        return '<div>' +
            '<div style="color:var(--dim);">' + _escape(label) + '</div>' +
            '<div style="font-weight:bold;">' + count + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 4. DESTRUCTION DETAIL MODAL
    // =========================================================================

    function openDestroyedItemsModal(disasterId) {
        var disaster = Queries.getDisaster(disasterId);
        if (!disaster) {
            _toast('Disaster not found', 'error');
            return null;
        }

        var vm = VM.toDisasterDetailsViewModel(disaster, disaster.locationName);
        if (!vm || !vm.structuralDamage || vm.structuralDamage.totalCount === 0) {
            _toast('This disaster destroyed nothing', 'info');
            return null;
        }

        var sd = vm.structuralDamage;
        var items = Queries.getDestroyedItems(disasterId);
        var itemVms = VM.toDestructionRows(items);

        var content = '<div style="padding:4px 0;">';

        content +=
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
            '<div style="font-size:0.6rem;">' +
            _escape(vm.type) + ' — ' + _escape(vm.yearLabel) +
            (vm.locationName ? ' at ' + _escape(vm.locationName) : '') +
            '</div>' +
            '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
            sd.totalCount + ' item(s) destroyed · ' + sd.totalLoss + ' gold total loss' +
            '</div>' +
            '</div>';

        if (itemVms.length === 0) {
            content +=
                '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                _escape('No detailed destruction records available.') +
                '</div>';
        } else {
            content += '<div style="max-height:400px;overflow-y:auto;">';
            for (var i = 0; i < itemVms.length; i++) {
                var it = itemVms[i];
                var color = it.colorToken ? 'var(--' + it.colorToken + ')' : 'var(--dim)';
                content +=
                    '<div style="display:flex;justify-content:space-between;' +
                    'padding:4px 8px;background:var(--bg2);border-radius:4px;' +
                    'margin-bottom:2px;font-size:0.6rem;border-left:2px solid ' + color + ';">' +
                    '<span>' + _escape(it.name) + '</span>' +
                    '<span style="color:var(--dim);font-size:0.5rem;">' +
                    _escape(it.categoryLabel) +
                    (it.yearLabel !== '?' ? ' · ' + _escape(it.yearLabel) : '') +
                    '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        content += '</div>';

        return window.openModal({
            title: 'Destruction Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 5. DISASTER STATS MODAL
    // =========================================================================

    function openDisasterStatsModal(locationId) {
        var locationName = locationId
            ? (window.getPlaceById(locationId) || {}).displayName || 'Unknown Location'
            : 'Global';

        var stats = Queries.getDisasterStats(locationId || null);
        var severityStats = Queries.getDisasterSeverityStats();

        var vm = VM.toDisasterStatsViewModel(stats, locationName);
        if (!vm) {
            _toast('Statistics unavailable', 'error');
            return null;
        }
        var severityVm = VM.toSeverityStatsViewModel(severityStats);

        var content = '<div style="padding:4px 0;">';

        content +=
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _statCell('Total Disasters', vm.total) +
            _statCell('Total Deaths', vm.totalDeaths, 'warn') +
            _statCell('Avg Severity', vm.averageSeverityLabel) +
            '</div>';

        // Type distribution
        if (vm.byTypeRows.length > 0) {
            content +=
                '<div style="padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">By Type</div>';
            var shownTypes = Math.min(vm.byTypeRows.length, 5);
            for (var i = 0; i < shownTypes; i++) {
                var row = vm.byTypeRows[i];
                content +=
                    '<div style="display:flex;justify-content:space-between;' +
                    'font-size:0.65rem;padding:2px 0;">' +
                    '<span>' + _escape(row.typeLabel) + '</span>' +
                    '<span>' + row.count + '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        // Severity distribution
        if (severityVm && severityVm.total > 0) {
            content +=
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:12px;">';
            for (var s = 0; s < severityVm.distribution.length; s++) {
                var d = severityVm.distribution[s];
                content +=
                    '<div style="padding:6px;background:var(--bg3);border-radius:4px;' +
                    'text-align:center;font-size:0.6rem;">' +
                    _escape(d.label) + ': ' + d.count +
                    '</div>';
            }
            content += '</div>';
        }

        // Deadliest
        if (vm.deadliest) {
            var deadliest = vm.deadliest;
            content +=
                '<div style="padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:8px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">Deadliest Disaster</div>' +
                '<div style="font-size:0.7rem;">' +
                _escape(deadliest.type) + ' (' + _escape(deadliest.yearLabel) + ') — ' +
                deadliest.deaths + ' deaths' +
                (deadliest.locationName ? ' at ' + _escape(deadliest.locationName) : '') +
                '</div>' +
                '</div>';
        }

        // Most recent
        if (vm.mostRecent) {
            var recent = vm.mostRecent;
            content +=
                '<div style="padding:8px;background:var(--bg3);border-radius:6px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">Most Recent</div>' +
                '<div style="font-size:0.7rem;">' +
                _escape(recent.type) + ' (' + _escape(recent.yearLabel) + ')' +
                (recent.locationName ? ' at ' + _escape(recent.locationName) : '') +
                '</div>' +
                '</div>';
        }

        content += '</div>';

        return window.openModal({
            title: 'Disaster Statistics — ' + _escape(locationName),
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    function _statCell(label, value, colorToken) {
        var style = colorToken ? 'color:var(--' + colorToken + ');' : '';
        return '<div style="padding:8px;background:var(--bg3);border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + _escape(label) + '</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;' + style + '">' +
            _escape(String(value)) + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.DisasterModals = {
        openCreateDisasterModal: openCreateDisasterModal,
        openDisasterDetailsModal: openDisasterDetailsModal,
        openDestroyedItemsModal: openDestroyedItemsModal,
        openDisasterStatsModal: openDisasterStatsModal
    };

    window._disasterModals = window.DisasterModals;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterModals;
    }

})();
