(function () {
    'use strict';

    var CONFIG = [
        {
            id: 'locations', label: 'Locations', description: 'Removes every place record. Location types and records that refer to locations are retained.',
            phrase: 'DELETE LOCATIONS', fields: { places: 'array' }
        },
        {
            id: 'settlements', label: 'Settlements', description: 'Removes the complete settlement data map. Places and location types remain.',
            phrase: 'DELETE SETTLEMENTS', fields: { settlementData: 'object' }
        },
        {
            id: 'governments', label: 'Governments', description: 'Removes government departments, legacy government records and government history. Government type definitions remain.',
            phrase: 'DELETE GOVERNMENTS', fields: { governmentDepartments: 'array', governments: 'array', governmentHistory: 'array' }
        },
        {
            id: 'households', label: 'Households', description: 'Removes households and their position and assignment records. Residences are a separate wipe.',
            phrase: 'DELETE HOUSEHOLDS', fields: { households: 'array', householdPositions: 'array', householdAssignments: 'array' }
        },
        {
            id: 'residences', label: 'Residences', description: 'Removes all residence records. Household records are retained.',
            phrase: 'DELETE RESIDENCES', fields: { residences: 'array' }
        },
        {
            id: 'roles', label: 'Roles', description: 'Removes role records. Role category definitions are retained.',
            phrase: 'DELETE ROLES', fields: { roles: 'array' }
        },
        {
            id: 'characters', label: 'Characters', description: 'Removes characters and character-linked relationship, parentage, pregnancy, adoption, surrogacy and subject-progress records. Historical event, crime and vendetta records are retained.',
            phrase: 'DELETE CHARACTERS', fields: {
                characters: 'array', relationships: 'array', parentChildEdges: 'array',
                pregnancyRecords: 'array', surrogacyArrangements: 'array',
                adoptionRecords: 'array', subjectProgress: 'object'
            },
            clearRelationshipState: true
        },
        {
            id: 'cultures', label: 'Cultures', description: 'Removes culture records and culture-to-location association records.',
            phrase: 'DELETE CULTURES', fields: { cultures: 'array', cultureLocationAssociations: 'array' }
        },
        {
            id: 'religions', label: 'Religions', description: 'Removes religions and their places of worship.',
            phrase: 'DELETE RELIGIONS', fields: { religions: 'array', placesOfWorship: 'array' }
        },
        {
            id: 'ranks', label: 'Ranks', description: 'Removes rank records and rank inheritance rules.',
            phrase: 'DELETE RANKS', fields: { ranks: 'array', rankInheritanceRules: 'object' }
        },
        {
            id: 'schools', label: 'Schools', description: 'Removes educational institution records. Educational subject definitions and character progress are retained.',
            phrase: 'DELETE SCHOOLS', fields: { educationalInstitutions: 'array' }
        },
        {
            id: 'industries', label: 'Industries', description: 'Removes enterprise records. Enterprise type definitions are retained.',
            phrase: 'DELETE INDUSTRIES', fields: { enterprises: 'array' }
        }
    ];

    var currentConfig = null;
    var masterReady = false;
    var grid = document.getElementById('wipeGrid');
    var modal = document.getElementById('wipeModal');
    var input = document.getElementById('wipeConfirmInput');
    var confirmButton = document.getElementById('wipeConfirm');
    var status = document.getElementById('diagnosticsStatus');

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function getData() {
        if (!window.masterData || !window.masterData.data) throw new Error('Master data has not been initialized.');
        return window.masterData.data;
    }

    function countFor(config) {
        var data = getData(), total = 0;
        Object.keys(config.fields).forEach(function (field) {
            var value = data[field];
            if (Array.isArray(value)) total += value.length;
            else if (value && typeof value === 'object') total += Object.keys(value).length;
        });
        return total;
    }

    function scopeSummary(config) {
        return Object.keys(config.fields).map(function (field) {
            var value = getData()[field];
            var count = Array.isArray(value) ? value.length
                : (value && typeof value === 'object' ? Object.keys(value).length : 0);
            return field + ': ' + count;
        }).join(' · ');
    }

    function render() {
        if (!masterReady) return;
        grid.innerHTML = CONFIG.map(function (config) {
            var count = countFor(config);
            return '<article class="wipe-card" data-wipe-card="' + config.id + '">' +
                '<h2>' + escapeHtml(config.label) + '</h2>' +
                '<p>' + escapeHtml(config.description) + '</p>' +
                '<div class="wipe-meta"><span>Records in scope</span><span class="wipe-count">' + count + '</span></div>' +
                '<button class="wipe-button" type="button" data-wipe="' + config.id + '"' + (count === 0 ? ' disabled' : '') + '>Delete all ' + escapeHtml(config.label.toLowerCase()) + '</button>' +
                '</article>';
        }).join('');
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (ch) {
            return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch];
        });
    }

    function openConfirm(config) {
        currentConfig = config;
        document.getElementById('wipeModalTitle').textContent = 'Delete all ' + config.label.toLowerCase() + '?';
        document.getElementById('wipeModalDescription').textContent =
            'This will permanently remove ' + countFor(config) + ' record(s) across the collections listed below. This action cannot be undone.';
        document.getElementById('wipeModalScope').textContent = scopeSummary(config);
        document.getElementById('wipePhrase').textContent = config.phrase;
        input.value = '';
        confirmButton.disabled = true;
        modal.classList.add('is-open');
        input.focus();
    }

    function closeConfirm() {
        modal.classList.remove('is-open');
        currentConfig = null;
        input.value = '';
    }

    function wipe(config) {
        var data = getData();
        var snapshots = {};
        Object.keys(config.fields).forEach(function (field) {
            if (!Object.prototype.hasOwnProperty.call(data, field)) {
                throw new Error('Required data collection is missing: ' + field + '. Nothing was deleted.');
            }
            var expected = config.fields[field];
            if (expected === 'array' && !Array.isArray(data[field])) {
                throw new Error('Data collection ' + field + ' is not an array. Nothing was deleted.');
            }
            if (expected === 'object' && (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field]))) {
                throw new Error('Data collection ' + field + ' is not an object. Nothing was deleted.');
            }
            snapshots[field] = clone(data[field]);
        });

        var relationshipSnapshot = null;
        if (config.clearRelationshipState && window.RelationshipState &&
            typeof window.RelationshipState.snapshot === 'function') {
            relationshipSnapshot = window.RelationshipState.snapshot();
        }

        try {
            Object.keys(config.fields).forEach(function (field) {
                data[field] = config.fields[field] === 'array' ? [] : {};
            });

            if (config.clearRelationshipState && window.RelationshipState) {
                if (typeof window.RelationshipState.replaceAll === 'function') {
                    window.RelationshipState.replaceAll([]);
                } else if (typeof window.RelationshipState.clear === 'function') {
                    window.RelationshipState.clear();
                }
            }

            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            if (typeof window.markDataDirty !== 'function' || typeof window.saveMasterData !== 'function') {
                throw new Error('Storage persistence functions are unavailable. Nothing was saved.');
            }
            window.markDataDirty();
            if (window.saveMasterData() !== true) {
                throw new Error('The save failed. The previous data has been restored in memory. Check browser storage capacity and try again.');
            }

            try {
                window.dispatchEvent(new CustomEvent('masterDataUpdated', {
                    detail: { source: 'diagnostics-data-wipe', wipeId: config.id }
                }));
            } catch (eventError) {
                console.warn('[diagnostics] Wipe saved, but update notification failed:', eventError);
            }

            status.textContent = config.label + ' wiped and saved successfully.';
            return true;
        } catch (error) {
            Object.keys(snapshots).forEach(function (field) { data[field] = snapshots[field]; });
            if (relationshipSnapshot && window.RelationshipState &&
                typeof window.RelationshipState.replaceAll === 'function') {
                try { window.RelationshipState.replaceAll(relationshipSnapshot); } catch (restoreError) {
                    console.error('[diagnostics] Relationship rollback failed:', restoreError);
                }
            }
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            if (typeof window.markDataDirty === 'function') {
                try { window.markDataDirty(); } catch (dirtyError) {}
            }
            throw error;
        }
    }

    grid.addEventListener('click', function (event) {
        var button = event.target.closest('[data-wipe]');
        if (!button || button.disabled) return;
        var config = CONFIG.find(function (item) { return item.id === button.dataset.wipe; });
        if (config) openConfirm(config);
    });

    input.addEventListener('input', function () {
        confirmButton.disabled = !currentConfig || input.value.trim() !== currentConfig.phrase;
    });

    document.getElementById('wipeCancel').addEventListener('click', closeConfirm);
    confirmButton.addEventListener('click', function () {
        if (!currentConfig || input.value.trim() !== currentConfig.phrase) return;
        var config = currentConfig;
        confirmButton.disabled = true;
        try {
            wipe(config);
            closeConfirm();
            render();
        } catch (error) {
            status.textContent = 'Wipe failed: ' + (error && error.message ? error.message : String(error));
            console.error('[diagnostics] Data wipe failed:', error);
            confirmButton.disabled = false;
        }
    });

    modal.addEventListener('click', function (event) {
        if (event.target === modal) closeConfirm();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) closeConfirm();
    });

    document.getElementById('refreshBtn').addEventListener('click', function () {
        var result = window.reloadMasterData(true);
        if (!result || result.ok !== true) {
            status.textContent = 'Refresh failed: ' + (result && result.error ? result.error : 'unknown error');
            return;
        }
        status.textContent = 'Data refreshed from browser storage.';
        render();
    });

    document.getElementById('exportBtn').addEventListener('click', function () {
        try {
            var blob = new Blob([JSON.stringify(window.masterData, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'still-waters-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            status.textContent = 'Full master data backup exported.';
        } catch (error) {
            status.textContent = 'Export failed: ' + error.message;
        }
    });

    document.getElementById('importBtn').addEventListener('click', function () {
        window.importData(function (result) {
            if (!result || result.ok !== true) {
                status.textContent = 'Import failed: ' + (result && result.message ? result.message : (result && result.error ? result.error : 'unknown error'));
                return;
            }
            status.textContent = 'Data imported successfully.';
            render();
        });
    });

    document.getElementById('setYearBtn').addEventListener('click', function () {
        var year = Number(document.getElementById('yearInput').value);
        if (!Number.isInteger(year) || year < window.TIME_CONSTANTS.MIN_YEAR || year > window.TIME_CONSTANTS.MAX_YEAR) {
            status.textContent = 'Enter a valid world year (' + window.TIME_CONSTANTS.MIN_YEAR + '–' + window.TIME_CONSTANTS.MAX_YEAR + ').';
            return;
        }
        getData().currentYear = year;
        window.markDataDirty();
        if (window.saveMasterData() !== true) {
            status.textContent = 'Year change could not be saved.';
            return;
        }
        status.textContent = 'Current year set to ' + year + '.';
    });

    function boot() {
        var result = window.initializeStorage();
        if (!result || result.ok !== true) {
            grid.innerHTML = '<div class="wipe-card"><h2>Storage unavailable</h2><p>' +
                escapeHtml(result && result.error ? result.error : 'Master data could not be loaded.') +
                '</p></div>';
            status.textContent = 'Data wipe actions are disabled until storage loads successfully.';
            return;
        }
        masterReady = true;
        document.getElementById('yearInput').value = getData().currentYear;
        render();
        status.textContent = 'Loaded ' + CONFIG.length + ' data wipe operations.';
    }

    boot();
})();