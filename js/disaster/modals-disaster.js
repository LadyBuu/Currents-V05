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
    // CASCADING LOCATION PICKER
    // =========================================================================

    function _locationTypesByPriority() {
        var types = window.LocationQueries.getLocationTypes().slice();
        types.sort(function(a, b) {
            var ap = typeof a.priority === 'number' ? a.priority : 999999;
            var bp = typeof b.priority === 'number' ? b.priority : 999999;
            return ap - bp || String(a.displayName || a.name || '').localeCompare(
                String(b.displayName || b.name || '')
            );
        });
        return types;
    }

    function _locationLabel(place) {
        return place.displayName || place.name || place.id;
    }

    function _locationOptions(places, selectedId) {
        var html = '<option value="">Select...</option>';
        places.slice().sort(function(a, b) {
            return _locationLabel(a).localeCompare(_locationLabel(b));
        }).forEach(function(place) {
            if (!place || !place.id) return;
            html += '<option value="' + _escape(place.id) + '"' +
                (place.id === selectedId ? ' selected' : '') + '>' +
                _escape(_locationLabel(place)) + '</option>';
        });
        return html;
    }

    function _buildCascadingLocationPicker(root, defaultLocationId) {
        var holder = root.querySelector('#disasterLocationCascade');
        var selectedInput = root.querySelector('#disasterLocation');
        if (!holder || !selectedInput) return;

        var types = _locationTypesByPriority();
        var allRoots = window.LocationQueries.getRootPlaces({ includeDeprecated: false });
        var initialChain = [];
        var current = defaultLocationId
            ? window.getPlaceById(defaultLocationId)
            : null;
        var seen = {};
        while (current && current.id && !seen[current.id]) {
            seen[current.id] = true;
            initialChain.unshift(current);
            current = current.parentId ? window.getPlaceById(current.parentId) : null;
        }

        function childrenFor(parent, expectedType) {
            var children = window.LocationQueries.getPlacesByParent(
                parent ? parent.id : null,
                { includeDeprecated: false }
            );
            if (expectedType) {
                children = children.filter(function(place) {
                    return place.typeId === expectedType.id;
                });
            }
            return children;
        }


        holder.innerHTML = '';
        selectedInput.value = '';
        var firstType = types.length ? types[0] : null;
        var firstRoots = allRoots;
        if (firstType) {
            var typedRoots = allRoots.filter(function(place) {
                return place.typeId === firstType.id;
            });
            if (typedRoots.length) firstRoots = typedRoots;
        }
        if (!firstRoots.length) {
            holder.innerHTML = '<div style="font-size:0.6rem;color:var(--dim);">No top-level locations available.</div>';
            return;
        }

        // If a saved location has an unusual hierarchy, start at its actual
        // root and use its actual child types rather than losing the default.
        var rootPlace = initialChain.length ? initialChain[0] : null;
        var rootCandidates = firstRoots;
        if (rootPlace && !rootCandidates.some(function(p) { return p.id === rootPlace.id; })) {
            rootCandidates = allRoots;
        }

        var rootWrap = document.createElement('div');
        rootWrap.style.marginBottom = '9px';
        var rootLabel = document.createElement('label');
        rootLabel.textContent = firstType
            ? (firstType.displayName || firstType.name || 'Location')
            : 'Location';
        rootLabel.style.cssText = 'display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;';
        var rootSelect = document.createElement('select');
        rootSelect.className = 'disaster-location-level';
        rootSelect.dataset.level = '0';
        rootSelect.style.cssText = 'width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.65rem;';
        rootSelect.innerHTML = _locationOptions(rootCandidates, rootPlace ? rootPlace.id : null);
        rootWrap.appendChild(rootLabel);
        rootWrap.appendChild(rootSelect);
        holder.appendChild(rootWrap);

        function appendChildren(parent, level, selectedId) {
            var nextType = types[level] || null;
            var children = childrenFor(parent, nextType);
            if (!children.length) return;
            var labelText = nextType
                ? (nextType.displayName || nextType.name || 'Location')
                : 'Sub-location';
            var wrap = document.createElement('div');
            wrap.style.marginBottom = '9px';
            var label = document.createElement('label');
            label.textContent = labelText;
            label.style.cssText = 'display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;';
            var select = document.createElement('select');
            select.className = 'disaster-location-level';
            select.dataset.level = String(level);
            select.style.cssText = 'width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.65rem;';
            select.innerHTML = _locationOptions(children, selectedId || null);
            wrap.appendChild(label);
            wrap.appendChild(select);
            holder.appendChild(wrap);
            select.addEventListener('change', function() {
                while (wrap.nextSibling) holder.removeChild(wrap.nextSibling);
                selectedInput.value = select.value;
                var place = select.value ? window.getPlaceById(select.value) : null;
                if (place) appendChildren(place, level + 1, null);
            });
            if (selectedId) {
                selectedInput.value = selectedId;
                var selectedPlace = window.getPlaceById(selectedId);
                if (selectedPlace) appendChildren(selectedPlace, level + 1,
                    initialChain[level + 1] ? initialChain[level + 1].id : null);
            }
        }

        rootSelect.addEventListener('change', function() {
            while (rootWrap.nextSibling) holder.removeChild(rootWrap.nextSibling);
            selectedInput.value = rootSelect.value;
            var place = rootSelect.value ? window.getPlaceById(rootSelect.value) : null;
            if (place) appendChildren(place, 1, null);
        });

        if (rootPlace) {
            selectedInput.value = rootPlace.id;
            appendChildren(rootPlace, 1,
                initialChain[1] ? initialChain[1].id : null);
        } else {
            selectedInput.value = '';
        }
    }

    // =========================================================================
    // 2. CREATE DISASTER MODAL
    // =========================================================================

    function openCreateDisasterModal(options) {
        options = options || {};
        var vm = VM.toCreateDisasterModalViewModel(options, window.getCurrentYearSafe());

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
            '<div id="disasterLocationCascade"></div>' +
            '<input type="hidden" id="disasterLocation" value="">' +
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
            '<div style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.65rem;color:var(--accent);margin-bottom:4px;">Consequences</label>' +
            '<select id="disasterEffectsMode" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.65rem;">' +
            '<option value="random">Generate random consequences</option>' +
            '<option value="custom">Set consequences manually</option>' +
            '</select>' +
            '<div id="disasterCustomEffects" style="display:none;margin-top:8px;padding:8px;background:var(--bg3);border-radius:6px;">' +
            '<div style="font-size:0.58rem;color:var(--dim);margin-bottom:8px;">Set the consequences to apply. Character deaths are scaled to the eligible character population at this location.</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;">' +
            '<label style="font-size:0.6rem;">Deaths<input id="disasterCustomDeaths" type="number" min="0" step="1" value="0" style="display:block;width:100%;margin-top:3px;padding:6px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:5px;"></label>' +
            '<label style="font-size:0.6rem;">Prosperity loss<input id="disasterCustomProsperity" type="number" min="0" step="1" value="0" style="display:block;width:100%;margin-top:3px;padding:6px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:5px;"></label>' +
            '<label style="font-size:0.6rem;">Crime increase (0.25 = 25%)<input id="disasterCustomCrime" type="number" min="0" step="0.01" value="0" style="display:block;width:100%;margin-top:3px;padding:6px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:5px;"></label>' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:7px;font-size:0.6rem;margin-top:9px;"><input type="checkbox" id="disasterCustomStructural" checked> Apply random structural damage</label>' +
            '</div>' +
            '</div>' +
            '<div id="disasterPreview" style="padding:9px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-size:0.62rem;">' +
            '<div style="font-weight:bold;margin-bottom:5px;">Effect preview</div>' +
            '<div style="color:var(--dim);">Select a location to calculate the estimated consequences.</div>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:0.55rem;color:var(--dim);">The preview is calculated before submission. Structural destruction uses a random roll when enabled; the exact items destroyed are determined when effects are applied.</div>' +
            '</div>';

        return window.openModal({
            title: vm.title,
            content: content,
            confirmText: 'Generate Disaster',
            cancelText: 'Cancel',
            onMount: function(root) {
                _buildCascadingLocationPicker(root, vm.defaultLocationId);
                _setupDisasterPreview(root);
            },
            onConfirm: function(root) {
                return _submitCreateDisaster(root, options);
            }
        });
    }

    function _readNonNegativeNumber(root, selector, label) {
        var input = root.querySelector(selector);
        var value = input ? Number(input.value) : NaN;
        if (!isFinite(value) || value < 0) {
            _toast(label + ' must be a non-negative number', 'error');
            return null;
        }
        return value;
    }

    function _setupDisasterPreview(root) {
        var previewNode = root.querySelector('#disasterPreview');
        var locationInput = root.querySelector('#disasterLocation');
        var typeInput = root.querySelector('#disasterType');
        var yearInput = root.querySelector('#disasterYear');
        var modeInput = root.querySelector('#disasterEffectsMode');
        var customPanel = root.querySelector('#disasterCustomEffects');
        if (!previewNode || !locationInput || !typeInput || !yearInput || !modeInput) return;

        function renderPreview() {
            var cached = root.__disasterPreview;
            if (!cached || !cached.success) return;
            var data = cached.data;
            var disaster = data.disaster;
            var custom = modeInput.value === 'custom';
            var deaths = custom ? Number(root.querySelector('#disasterCustomDeaths').value) : disaster.deaths;
            var prosperity = custom ? Number(root.querySelector('#disasterCustomProsperity').value) : disaster.prosperityLoss;
            var expectedCharacterDeaths = disaster.population > 0
                ? Math.round(data.eligibleVictims * Math.min(1, Math.max(0, deaths) / disaster.population))
                : 0;
            var crime = custom ? Number(root.querySelector('#disasterCustomCrime').value) : disaster.crimeIncrease;
            var structural = custom
                ? root.querySelector('#disasterCustomStructural').checked
                : true;
            var rows = [
                ['Disaster', _escape(disaster.disasterType)],
                ['Severity', disaster.severity + '/100'],
                ['Population', String(disaster.population)],
                ['Estimated deaths', String(deaths)],
                ['Eligible characters', String(data.eligibleVictims)],
                ['Expected character deaths', String(expectedCharacterDeaths)],
                ['Prosperity loss', String(prosperity)],
                ['Crime increase', (crime * 100).toFixed(1) + '%'],
                ['Structural damage', structural ? 'Random roll' + (data.structuralDamageChance == null ? '' : ' (' + Math.round(data.structuralDamageChance * 100) + '% chance)') : 'Disabled']
            ];
            var html = '<div style="font-weight:bold;margin-bottom:6px;">Effect preview</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;">';
            rows.forEach(function(row) {
                html += '<div style="padding:5px;background:var(--bg2);border-radius:4px;">' +
                    '<div style="font-size:0.52rem;color:var(--dim);">' + row[0] + '</div>' +
                    '<div style="font-weight:600;">' + row[1] + '</div></div>';
            });
            html += '</div><div style="margin-top:7px;color:var(--dim);font-size:0.54rem;">' +
                data.futureBornExcluded + ' future-born and ' + data.unknownBirthYearExcluded +
                ' characters with unknown birth years will be excluded from victim selection.</div>';
            previewNode.innerHTML = html;
        }

        function generatePreview() {
            var locationId = locationInput.value;
            var year = yearInput.value === '' ? window.getCurrentYearSafe() : parseInt(yearInput.value, 10);
            if (!locationId || !isFinite(year)) {
                root.__disasterPreview = null;
                previewNode.innerHTML = '<div style="font-weight:bold;margin-bottom:5px;">Effect preview</div><div style="color:var(--dim);">Select a location and valid year to calculate effects.</div>';
                return;
            }
            var result = Commands.previewDisaster(locationId, typeInput.value || null, year);
            root.__disasterPreview = result.success ? result : null;
            if (!result.success) {
                previewNode.textContent = 'Preview unavailable: ' + result.reason;
                return;
            }
            if (modeInput.value === 'custom' && !root.__customEffectsInitialized) {
                root.querySelector('#disasterCustomDeaths').value = result.data.disaster.deaths;
                root.querySelector('#disasterCustomProsperity').value = result.data.disaster.prosperityLoss;
                root.querySelector('#disasterCustomCrime').value = result.data.disaster.crimeIncrease;
                root.__customEffectsInitialized = true;
            }
            renderPreview();
        }

        modeInput.addEventListener('change', function() {
            customPanel.style.display = modeInput.value === 'custom' ? 'block' : 'none';
            if (modeInput.value === 'custom' && !root.__customEffectsInitialized) {
                generatePreview();
            } else if (!root.__disasterPreview) {
                generatePreview();
            } else {
                renderPreview();
            }
        });
        [typeInput, yearInput].forEach(function(input) {
            input.addEventListener('change', generatePreview);
        });
        locationInput.addEventListener('change', generatePreview);
        ['#disasterCustomDeaths', '#disasterCustomProsperity', '#disasterCustomCrime', '#disasterCustomStructural']
            .forEach(function(selector) {
                var input = root.querySelector(selector);
                if (input) input.addEventListener('input', renderPreview);
                if (input && input.type === 'checkbox') input.addEventListener('change', renderPreview);
            });
        root.querySelector('#disasterLocationCascade').addEventListener('change', generatePreview);
        generatePreview();
    }

    function _submitCreateDisaster(root, options) {
        var locationId = root.querySelector('#disasterLocation').value;
        var disasterType = root.querySelector('#disasterType').value || null;
        var yearRaw = root.querySelector('#disasterYear').value;
        var year = yearRaw === ''
            ? window.getCurrentYearSafe()
            : parseInt(yearRaw, 10);
        var applyEffects = root.querySelector('#disasterApplyEffects').checked;
        var mode = root.querySelector('#disasterEffectsMode').value;
        if (!locationId) {
            _toast('Please select a location', 'error');
            return false;
        }
        if (isNaN(year)) {
            _toast('Year must be a number', 'error');
            return false;
        }

        var previewResult = root.__disasterPreview;
        if (!previewResult || !previewResult.success ||
            previewResult.data.disaster.locationId !== locationId ||
            previewResult.data.disaster.year !== year ||
            (disasterType && previewResult.data.disaster.disasterId !== disasterType)) {
            previewResult = Commands.previewDisaster(locationId, disasterType, year);
        }
        if (!previewResult.success) {
            _toast('Could not preview disaster: ' + previewResult.reason, 'error');
            return false;
        }
        var previewRecord = previewResult.data.disaster;
        var customEffects = null;
        if (mode === 'custom') {
            customEffects = {
                deaths: _readNonNegativeNumber(root, '#disasterCustomDeaths', 'Deaths'),
                prosperityLoss: _readNonNegativeNumber(root, '#disasterCustomProsperity', 'Prosperity loss'),
                crimeIncrease: _readNonNegativeNumber(root, '#disasterCustomCrime', 'Crime increase'),
                applyStructuralDamage: root.querySelector('#disasterCustomStructural').checked
            };
            if (customEffects.deaths === null || customEffects.prosperityLoss === null ||
                customEffects.crimeIncrease === null) return false;
            previewRecord.deaths = customEffects.deaths;
            previewRecord.prosperityLoss = customEffects.prosperityLoss;
            previewRecord.crimeIncrease = customEffects.crimeIncrease;
            previewRecord.metadata = previewRecord.metadata || {};
            previewRecord.metadata.effectsMode = 'custom';
        }

        var result = Commands.triggerDisaster(locationId, disasterType, year, {
            applyEffects: applyEffects,
            generatedRecord: previewRecord,
            customEffects: customEffects
        });

        var partialFailure = !result.success &&
            result.data && result.data.disaster && result.data.effectsApplied === true;

        if (!result.success && !partialFailure) {
            _toast('Failed to generate disaster: ' + result.reason, 'error');
            return false;
        }

        _commitAndPersist();

        var data = result.data || {};
        var disaster = data.disaster;
        var summary = partialFailure
            ? 'Disaster recorded with partial effects'
            : 'Disaster generated';
        if (disaster) {
            summary += ': ' + disaster.disasterType;
            if (data.victimsKilled > 0) {
                summary += ' (' + data.victimsKilled + ' death(s))';
            }
        }

        if (partialFailure) {
            var failureCount = Array.isArray(data.failures) ? data.failures.length : 0;
            summary += '. ' + failureCount + ' effect failure(s). Check disaster details and console.';
            _toast(summary, 'warning');
        } else {
            _toast(summary, 'success');
        }
        _close();
        if (typeof options.onComplete === 'function') options.onComplete(data);
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

        if (vm.effectsStatus === 'partial' || (vm.effectFailures && vm.effectFailures.length > 0)) {
            var failureLines = [];
            for (var fi = 0; fi < vm.effectFailures.length; fi++) {
                failureLines.push(
                    '<div style="padding:4px 0;border-top:1px solid var(--border);">' +
                    '<strong>' + _escape(vm.effectFailures[fi].system) + '</strong>: ' +
                    _escape(vm.effectFailures[fi].reason) + '</div>'
                );
            }
            content +=
                '<div style="margin-top:8px;padding:8px;background:var(--bg3);' +
                'border-radius:6px;border-left:3px solid var(--warning, #c98a35);">' +
                '<div style="font-size:0.65rem;font-weight:bold;margin-bottom:5px;">' +
                'Partial effects (' + vm.effectFailures.length + ' failure(s))</div>' +
                (failureLines.join('') || '<div>Some effects were incomplete.</div>') +
                '</div>';
        }

        if (vm.structuralDamageSkippedSystems && vm.structuralDamageSkippedSystems.length > 0) {
            content +=
                '<div style="margin-top:8px;padding:8px;background:var(--bg3);' +
                'border-radius:6px;">' +
                '<div style="font-size:0.65rem;font-weight:bold;margin-bottom:5px;">' +
                'Damage systems not applied</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                _escape(vm.structuralDamageSkippedSystems.join(', ')) +
                '</div></div>';
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
