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
            id: 'households', label: 'Households', description: 'Removes households, positions and assignments; clears live character and residence links and releases household-owned enterprises. Household-owned private schools must be reassigned first.',
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

    // Explicit policy for data intentionally retained by each destructive operation.
    // These are not assertions that every cross-domain reference is valid; they
    // distinguish reusable definitions from historical snapshots and live links.
    var RETAINED_FIELD_POLICY = {
        locations: [
            'location types: reusable definitions',
            'location-linked records: retained live references; review before deleting places'
        ],
        settlements: ['places and location types: reusable records/definitions'],
        governments: ['government type definitions: reusable definitions'],
        roles: ['role category definitions: reusable definitions'],
        characters: [
            'events, crimes, vendettas: historical records/snapshots retained; live character IDs are not guaranteed valid'
        ],
        schools: ['educational subject definitions: reusable definitions', 'character progress: retained records; school linkage policy not yet validated'],
        industries: ['enterprise type definitions: reusable definitions']
    };

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

    function householdReferenceCounts(data) {
        var counts = {
            characters: 0,
            residenceUnits: 0,
            enterpriseOwners: 0,
            educationOwners: 0
        };

        if (Array.isArray(data.characters)) {
            data.characters.forEach(function (character) {
                if (!character || typeof character !== 'object') return;
                var hasCurrent = !!(character.household || character.householdId);
                var hasOpenHistory = Array.isArray(character.householdHistory) &&
                    character.householdHistory.some(function (entry) {
                        return entry && typeof entry === 'object' &&
                            !!entry.householdId && !entry.leftYear;
                    });
                if (hasCurrent || hasOpenHistory) counts.characters++;
            });
        }

        if (Array.isArray(data.residences)) {
            data.residences.forEach(function (residence) {
                if (!residence || !Array.isArray(residence.units)) return;
                residence.units.forEach(function (unit) {
                    if (unit && typeof unit === 'object' && (unit.householdId || unit.isVacant === false)) {
                        counts.residenceUnits++;
                    }
                });
            });
        }

        if (Array.isArray(data.enterprises)) {
            data.enterprises.forEach(function (enterprise) {
                if (enterprise && enterprise.ownerType === 'household') {
                    counts.enterpriseOwners++;
                }
            });
        }

        if (Array.isArray(data.educationalInstitutions)) {
            data.educationalInstitutions.forEach(function (institution) {
                if (institution && institution.ownerType === 'household') {
                    counts.educationOwners++;
                }
            });
        }

        return counts;
    }

    function householdWipeYear(data) {
        var year = Number(data.currentYear);
        if (!Number.isInteger(year) || year < 1) {
            year = typeof window.getCurrentYear === 'function'
                ? Number(window.getCurrentYear()) : NaN;
        }
        if (!Number.isInteger(year) || year < 1) {
            throw new Error('Cannot clear household references because the current world year is invalid.');
        }
        return year;
    }

    function preflightHouseholdWipe(data) {
        ['characters', 'residences', 'enterprises', 'educationalInstitutions']
            .forEach(function (field) {
                if (!Array.isArray(data[field])) {
                    throw new Error(
                        'Cannot wipe households safely: required collection "' +
                        field + '" is missing or malformed. Nothing was deleted.'
                    );
                }
            });

        var ownedSchools = data.educationalInstitutions.filter(function (institution) {
            return institution && institution.ownerType === 'household';
        });
        if (ownedSchools.length) {
            var names = ownedSchools.slice(0, 3).map(function (institution) {
                return institution.name || institution.id || 'Unnamed institution';
            });
            throw new Error(
                'Household wipe blocked: ' + ownedSchools.length +
                ' educational institution(s) still have household ownership (' +
                names.join(', ') +
                '). Reassign or remove that ownership in Education before wiping households.'
            );
        }

        householdWipeYear(data);
    }

    function clearHouseholdReferences(data) {
        var year = householdWipeYear(data);
        var now = Date.now();

        // Character fields are the live reverse index. Historical membership
        // entries are retained, but any open period is closed at the wipe year.
        data.characters.forEach(function (character) {
            if (!character || typeof character !== 'object') return;

            if (character.householdHistory !== undefined &&
                character.householdHistory !== null &&
                !Array.isArray(character.householdHistory)) {
                throw new Error(
                    'Cannot clear household references: Character ' +
                    (character.id || '(unknown)') +
                    ' has a malformed householdHistory collection.'
                );
            }

            // This is a full household-data wipe, not a household departure.
            // Retaining householdHistory would leave deleted household IDs
            // embedded in character records, which can be mistaken for live
            // links by downstream code and audits.
            character.householdHistory = [];
            character.household = '';
            character.householdId = '';
        });

        // Residence occupancy is a live reverse reference. Keep the
        // residence and its historical association records, close active
        // associations, and leave non-demolished units vacant.
        data.residences.forEach(function (residence) {
            if (!residence || typeof residence !== 'object') return;
            if (residence.units !== undefined && !Array.isArray(residence.units)) {
                throw new Error(
                    'Cannot clear household references: Residence ' +
                    (residence.id || '(unknown)') + ' has malformed units.'
                );
            }
            if (!Array.isArray(residence.units)) return;

            residence.units.forEach(function (unit) {
                if (!unit || typeof unit !== 'object') return;
                var householdId = unit.householdId || null;
                var needsVacating = !!householdId || unit.isVacant === false;
                if (!needsVacating) return;

                var householdName = unit.householdName || 'Unknown';
                var unitNumber = unit.unitNumber;

                if (unit.associationHistory !== undefined &&
                    unit.associationHistory !== null &&
                    !Array.isArray(unit.associationHistory)) {
                    throw new Error('Residence unit ' + unitNumber +
                        ' has malformed associationHistory.');
                }
                if (Array.isArray(unit.associationHistory) && householdId) {
                    unit.associationHistory.forEach(function (entry) {
                        if (entry && entry.householdId === householdId &&
                            !entry.endedYear) {
                            entry.endedYear = year;
                            entry.reason = 'Household data wiped';
                            entry.timestamp = now;
                        }
                    });
                }

                if (residence.associationHistory !== undefined &&
                    residence.associationHistory !== null &&
                    !Array.isArray(residence.associationHistory)) {
                    throw new Error('Residence ' + (residence.id || '(unknown)') +
                        ' has malformed associationHistory.');
                }
                if (Array.isArray(residence.associationHistory) && householdId) {
                    residence.associationHistory.forEach(function (entry) {
                        if (entry && entry.householdId === householdId &&
                            entry.unitNumber === unitNumber && !entry.endedYear) {
                            entry.endedYear = year;
                            entry.reason = 'Household data wiped';
                            entry.timestamp = now;
                        }
                    });
                }

                unit.householdId = null;
                unit.householdName = null;

                if (!unit.isDemolished) {
                    unit.isVacant = true;
                    unit.assignedYear = null;
                    unit.vacantYear = year;

                    ['vacancyHistory', 'history', 'timeline'].forEach(function (field) {
                        if (residence[field] !== undefined && residence[field] !== null &&
                            !Array.isArray(residence[field])) {
                            throw new Error('Residence ' + (residence.id || '(unknown)') +
                                ' has malformed ' + field + '.');
                        }
                    });
                    if (!Array.isArray(residence.vacancyHistory)) {
                        residence.vacancyHistory = [];
                    }
                    residence.vacancyHistory.push({
                        startedVacantYear: year,
                        reason: 'Household data wiped: Unit ' + unitNumber,
                        endedVacantYear: null,
                        endedByHouseholdId: null,
                        endedByHouseholdName: null,
                        affectedHouseholds: householdId ? [{
                            householdId: householdId,
                            householdName: householdName,
                            unitNumber: unitNumber
                        }] : []
                    });

                    if (!Array.isArray(residence.history)) residence.history = [];
                    residence.history.push({
                        year: year,
                        action: 'unit_vacated',
                        details: 'Vacated Unit ' + unitNumber + ' (' +
                            householdName + '): Household data wiped',
                        actorId: null,
                        timestamp: now
                    });
                    if (residence.history.length > 500) {
                        residence.history = residence.history.slice(-500);
                    }

                    if (!Array.isArray(residence.timeline)) residence.timeline = [];
                    residence.timeline.push({
                        year: year,
                        type: 'unit_vacated',
                        details: 'Vacated Unit ' + unitNumber + ' (' +
                            householdName + '): Household data wiped',
                        householdName: householdName,
                        unitNumber: unitNumber,
                        timestamp: now
                    });
                    if (residence.timeline.length > 500) {
                        residence.timeline = residence.timeline.slice(-500);
                    }
                }

                residence.lastUpdated = year;
            });
        });

        // Enterprise ownership is authoritative on the enterprise record.
        // Unown household-owned enterprises rather than deleting the
        // enterprises themselves. Private, unowned enterprises are valid.
        data.enterprises.forEach(function (enterprise) {
            if (!enterprise || enterprise.ownerType !== 'household') return;
            enterprise.ownershipType = 'private';
            enterprise.ownerType = 'none';
            enterprise.ownerId = null;
            enterprise.updatedAt = now;
        });
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
        if (config.id === 'households') {
            var refs = householdReferenceCounts(data);
            total += refs.characters + refs.residenceUnits +
                refs.enterpriseOwners + refs.educationOwners;
        }
        return total;
    }

    function scopeSummary(config) {
        var summary = Object.keys(config.fields).map(function (field) {
            var value = getData()[field];
            var count = Array.isArray(value) ? value.length
                : (value && typeof value === 'object' ? Object.keys(value).length : 0);
            return field + ': ' + count;
        });
        if (config.id === 'households') {
            var refs = householdReferenceCounts(getData());
            summary.push('character links: ' + refs.characters);
            summary.push('occupied residence units: ' + refs.residenceUnits);
            summary.push('enterprise owners to release: ' + refs.enterpriseOwners);
            summary.push('household-owned schools: ' + refs.educationOwners);
        }
        var retainedPolicy = RETAINED_FIELD_POLICY[config.id];
        if (retainedPolicy && retainedPolicy.length) {
            summary.push('Retained dependency policy: ' + retainedPolicy.join('; '));
        }
        return summary.join(' · ');
    }

    function render() {
        if (!masterReady) return;
        grid.innerHTML = CONFIG.map(function (config) {
            var count = countFor(config);
            return '<article class="wipe-card" data-wipe-card="' + config.id + '">' +
                '<h2>' + escapeHtml(config.label) + '</h2>' +
                '<p>' + escapeHtml(config.description) + '</p>' +
                '<div class="wipe-meta"><span>Records / links in scope</span><span class="wipe-count">' + count + '</span></div>' +
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
        document.getElementById('wipeModalDescription').textContent = config.id === 'households'
            ? 'This permanently deletes household records and clears their live cross-domain links. Historical membership and residence records are retained. The wipe is blocked if a school is still household-owned.'
            : 'This will permanently remove ' + countFor(config) + ' record(s) across the collections listed below. This action cannot be undone.';
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

    function validateWipeResult(config, data) {
        Object.keys(config.fields).forEach(function (field) {
            var value = data[field];
            var remaining = Array.isArray(value) ? value.length
                : (value && typeof value === 'object' ? Object.keys(value).length : 0);
            if (remaining !== 0) {
                throw new Error('Post-wipe validation failed: ' + field +
                    ' still contains ' + remaining + ' item(s).');
            }
        });

        if (config.id === 'households') {
            var refs = householdReferenceCounts(data);
            if (refs.characters || refs.residenceUnits || refs.enterpriseOwners || refs.educationOwners) {
                throw new Error('Post-wipe validation failed: household references remain (' +
                    'characters ' + refs.characters + ', residence units ' + refs.residenceUnits +
                    ', enterprise owners ' + refs.enterpriseOwners + ', household-owned schools ' +
                    refs.educationOwners + ').');
            }
        }
    }

    function referenceKeysFor(configId) {
        var keys = {
            households: /household(id)?$/i,
            characters: /(character|person|perpetrator|victim|killer|parent|child|master|apprentice|adoptee|adopter|pregnant|surrogate)(id)?$/i,
            locations: /(place|location|parentPlace|settlementLocation)(id)?$/i,
            settlements: /(settlement)(id)?$/i,
            governments: /(government|department|leader)(id)?$/i,
            residences: /(residence|unit)(id)?$/i,
            roles: /(role)(id)?$/i,
            cultures: /(culture)(id)?$/i,
            religions: /(religion|worship)(id)?$/i,
            ranks: /(rank)(id)?$/i,
            schools: /(school|institution|subject)(id)?$/i,
            industries: /(enterprise|industry)(id)?$/i
        };
        return keys[configId];
    }

    // Clear references to every deleted record throughout canonical data,
    // including nested historical records. Reference fields are set to null;
    // arrays that directly contain deleted IDs have those IDs removed.
    function clearReferencesToWipedRecords(data, configId, deletedIds) {
        if (!deletedIds.size) return;
        var referenceKey = referenceKeysFor(configId);
        if (!referenceKey) return;

        function visit(value) {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) {
                value.forEach(visit);
                return;
            }
            Object.keys(value).forEach(function (key) {
                var child = value[key];
                if (referenceKey.test(key) && deletedIds.has(child)) {
                    value[key] = null;
                } else {
                    visit(child);
                }
            });
        }
        Object.keys(data).forEach(function (field) {
            if (configId === 'households' &&
                (field === 'households' || field === 'householdPositions' ||
                 field === 'householdAssignments')) return;
            visit(data[field]);
        });
    }

    function wipe(config) {
        var data = getData();
        var snapshots = {};
        var deletedIds = new Set();
        Object.keys(config.fields).forEach(function (field) {
            var records = data[field];
            if (Array.isArray(records)) {
                records.forEach(function (record) {
                    if (record && typeof record.id === 'string') deletedIds.add(record.id);
                });
            } else if (records && typeof records === 'object') {
                Object.keys(records).forEach(function (id) { deletedIds.add(id); });
            }
        });
        if (config.id === 'households') {
            preflightHouseholdWipe(data);
            snapshots.characters = clone(data.characters);
            snapshots.residences = clone(data.residences);
            snapshots.enterprises = clone(data.enterprises);
        }

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

            if (config.id === 'households') {
                clearHouseholdReferences(data);
            }

            clearReferencesToWipedRecords(data, config.id, deletedIds);

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
            validateWipeResult(config, data);
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
            // Restore memory first, then synchronously attempt to persist that
            // restored state. markDataDirty() alone only schedules a future
            // write and cannot establish durable rollback.
            var durableRollback = false;
            var rollbackError = null;
            if (typeof window.markDataDirty === 'function' &&
                typeof window.saveMasterData === 'function') {
                try {
                    window.markDataDirty();
                    durableRollback = window.saveMasterData() === true;
                    if (!durableRollback && typeof window.getLastSaveError === 'function') {
                        rollbackError = window.getLastSaveError();
                    }
                } catch (saveError) {
                    rollbackError = saveError;
                }
            }

            if (!durableRollback) {
                var rollbackMessage = ' In-memory rollback completed, but durable restoration could not be confirmed.';
                if (rollbackError && rollbackError.message) {
                    rollbackMessage += ' Storage error: ' + rollbackError.message;
                }
                error = new Error((error && error.message ? error.message : String(error)) +
                    rollbackMessage);
            } else {
                error = new Error((error && error.message ? error.message : String(error)) +
                    ' The pre-wipe state was restored in memory and its save was confirmed.');
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
        var data = getData();
        var previousYear = data.currentYear;
        data.currentYear = year;
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        try {
            window.markDataDirty();
            if (window.saveMasterData() !== true) {
                data.currentYear = previousYear;
                if (typeof window.invalidateAccessorCaches === 'function') {
                    window.invalidateAccessorCaches();
                }
                // Keep the in-memory state marked dirty so a later save cannot
                // silently treat the failed year change as committed.
                window.markDataDirty();
                status.textContent = 'Year change could not be saved; the previous year was restored in memory.';
                return;
            }
        } catch (error) {
            data.currentYear = previousYear;
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            try { window.markDataDirty(); } catch (dirtyError) {}
            status.textContent = 'Year change failed; the previous year was restored in memory. ' +
                (error && error.message ? error.message : String(error));
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