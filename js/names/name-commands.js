/**
 * =============================================================================
 * NAME COMMANDS - All write operations for names
 * =============================================================================
 * 
 * Responsibilities:
 * - Record surname changes with history
 * - Apply marriage surname changes
 * - Update name lists (add/remove names)
 * - Validate before mutation
 * - Log events
 * - Notify subscribers
 * 
 * DEPENDENCIES:
 *   - name-state.js (NameState)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - eventLogger.js (logEvent)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function _validateSurnameChange(character, newSurname, year, reason) {
        if (!character) {
            return { valid: false, reason: 'Character is required' };
        }
        if (character.isDeceased) {
            return { valid: false, reason: 'Cannot change surname of deceased character' };
        }
        if (!newSurname || newSurname.trim() === '') {
            return { valid: false, reason: 'Surname cannot be empty' };
        }
        if (!year || typeof year !== 'number') {
            return { valid: false, reason: 'Valid year is required' };
        }
        if (year > _getCurrentYear() + 10) {
            return { valid: false, reason: 'Year cannot be more than 10 years in the future' };
        }
        if (character.birthYear && year < character.birthYear) {
            return { valid: false, reason: 'Year cannot be before character\'s birth' };
        }

        return { valid: true };
    }

    // =========================================================================
    // 4. CORE COMMAND: Record Surname Change
    // =========================================================================

    function recordSurnameChange(character, newSurname, year, reason, options) {
        // RECURSION GUARD
        if (_processingCommand) {
            console.warn('Name command already processing, skipping');
            return null;
        }
        _processingCommand = true;

        try {
            // Validate
            var validation = _validateSurnameChange(character, newSurname, year, reason);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            // Get or create history
            var history = NameState.getSurnameHistory(character.id);
            if (!history) {
                history = {
                    birthSurname: character.surname || '',
                    entries: [],
                    lastUpdated: character.birthYear || _getCurrentYear()
                };
                character.surnameHistory = history;
            }

            var currentYear = year || _getCurrentYear();
            var previousSurname = options.previousSurname || character.surname || '';

            // Create change entry
            var change = {
                surname: newSurname.trim(),
                year: currentYear,
                reason: reason || 'custom',
                previousSurname: previousSurname,
                spouseId: options.spouseId || null,
                notes: options.notes || '',
                timestamp: Date.now()
            };

            history.entries.push(change);
            history.lastUpdated = currentYear;
            character.surname = newSurname.trim();
            character.surnameSource = options.surnameSource || 'custom';
            character.surnameRules = options.surnameRules || null;

            // Update cache
            NameState.invalidateCache();

            // Log event
            _logEvent('name', 'surname_change',
                character.name + ' changed surname from "' + previousSurname + '" to "' + newSurname + '" (' + reason + ')',
                [character]);

            // Save
            _saveMasterData();

            // Show toast
            var checkIcon = _getIcon('CHECK_SIMPLE');
            _showToast(checkIcon + ' Surname changed to "' + newSurname + '"', 'success');

            return change;

        } catch(e) {
            console.warn('Error recording surname change:', e);
            return null;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. COMMAND: Record Birth Surname
    // =========================================================================

    function recordBirthSurname(character, birthSurname) {
        // RECURSION GUARD
        if (_processingCommand) {
            console.warn('Name command already processing, skipping');
            return null;
        }
        _processingCommand = true;

        try {
            if (!character) return null;

            var history = NameState.getSurnameHistory(character.id);
            if (!history) {
                history = {
                    birthSurname: birthSurname || '',
                    entries: [],
                    lastUpdated: character.birthYear || _getCurrentYear()
                };
                character.surnameHistory = history;
            }

            history.birthSurname = birthSurname || '';
            if (!character.surname) {
                character.surname = birthSurname;
            }

            _saveMasterData();
            NameState.invalidateCache();

            return history;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. COMMAND: Apply Marriage Surnames
    // =========================================================================

    function applyMarriageSurnames(person, spouse, rule, year, notes) {
        // RECURSION GUARD
        if (_processingCommand) {
            console.warn('Name command already processing, skipping');
            return null;
        }
        _processingCommand = true;

        try {
            if (!person || !spouse) {
                _showToast('Both characters are required', 'error');
                return null;
            }
            if (person.isDeceased || spouse.isDeceased) {
                _showToast('Cannot change surname of deceased character', 'error');
                return null;
            }

            var currentYear = year || _getCurrentYear();
            rule = rule || 'wife_takes_husband';

            // Calculate new surnames
            var result = _calculateMarriageSurnames(person, spouse, rule, currentYear);
            var changes = {
                personChanged: false,
                spouseChanged: false,
                personNewSurname: result.newSurname,
                spouseNewSurname: result.spouseNewSurname
            };

            // Apply to person
            if (result.newSurname && result.newSurname !== person.surname) {
                var personChange = recordSurnameChange(person, result.newSurname, currentYear, 'marriage', {
                    spouseId: spouse.id,
                    notes: notes || 'Married ' + spouse.name,
                    previousSurname: person.surname
                });
                if (personChange) {
                    changes.personChanged = true;
                }
            }

            // Apply to spouse
            if (result.spouseNewSurname && result.spouseNewSurname !== spouse.surname) {
                var spouseChange = recordSurnameChange(spouse, result.spouseNewSurname, currentYear, 'marriage', {
                    spouseId: person.id,
                    notes: notes || 'Married ' + person.name,
                    previousSurname: spouse.surname
                });
                if (spouseChange) {
                    changes.spouseChanged = true;
                }
            }

            _logEvent('name', 'marriage_surname',
                person.name + ' and ' + spouse.name + ' changed surnames due to marriage (rule: ' + rule + ')',
                [person, spouse]);

            return changes;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. INTERNAL: Calculate Marriage Surnames
    // =========================================================================

    function _calculateMarriageSurnames(person, spouse, rule, year) {
        var personSurname = person.surname || '';
        var spouseSurname = spouse.surname || '';
        var result = {
            newSurname: personSurname,
            spouseNewSurname: spouseSurname
        };

        switch (rule) {
            case 'wife_takes_husband':
                if (person.gender === 'female' && spouse.gender === 'male') {
                    result.newSurname = spouseSurname;
                    result.spouseNewSurname = spouseSurname;
                } else if (person.gender === 'male' && spouse.gender === 'female') {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = personSurname;
                } else {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = spouseSurname;
                }
                break;

            case 'husband_takes_wife':
                if (person.gender === 'male' && spouse.gender === 'female') {
                    result.newSurname = spouseSurname;
                    result.spouseNewSurname = spouseSurname;
                } else if (person.gender === 'female' && spouse.gender === 'male') {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = personSurname;
                } else {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = spouseSurname;
                }
                break;

            case 'hyphenate':
                var combined = personSurname + '-' + spouseSurname;
                result.newSurname = combined;
                result.spouseNewSurname = combined;
                break;

            case 'keep':
            default:
                result.newSurname = personSurname;
                result.spouseNewSurname = spouseSurname;
                break;
        }

        return result;
    }

    // =========================================================================
    // 8. COMMAND: Revert Last Surname Change
    // =========================================================================

    function revertLastSurnameChange(character) {
        // RECURSION GUARD
        if (_processingCommand) {
            console.warn('Name command already processing, skipping');
            return null;
        }
        _processingCommand = true;

        try {
            if (!character) {
                _showToast('Character is required', 'error');
                return null;
            }

            var history = NameState.getSurnameHistory(character.id);
            if (!history || history.entries.length === 0) {
                _showToast('No surname changes to revert', 'info');
                return null;
            }

            var lastChange = history.entries.pop();
            history.lastUpdated = history.entries.length > 0 ?
                history.entries[history.entries.length - 1].year :
                character.birthYear || _getCurrentYear();

            character.surname = lastChange.previousSurname || history.birthSurname || '';

            _saveMasterData();
            NameState.invalidateCache();

            _logEvent('name', 'surname_reverted',
                character.name + ' reverted surname change from "' + lastChange.surname + '" to "' + character.surname + '"',
                [character]);

            _showToast('Surname reverted to "' + character.surname + '"', 'info');

            return lastChange;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. COMMAND: Add Name to Name List
    // =========================================================================

    function addNameToList(countryId, name, gender, category) {
        // RECURSION GUARD
        if (_processingCommand) {
            console.warn('Name command already processing, skipping');
            return null;
        }
        _processingCommand = true;

        try {
            if (!countryId) {
                _showToast('Country is required', 'error');
                return null;
            }
            if (!name || name.trim() === '') {
                _showToast('Name is required', 'error');
                return null;
            }

            var nameList = NameState.getNameList(countryId);
            if (!nameList) {
                _showToast('Name list not found for country', 'error');
                return null;
            }

            var trimmedName = name.trim();
            var added = false;

            if (gender === 'male') {
                if (nameList.male.indexOf(trimmedName) === -1) {
                    nameList.male.push(trimmedName);
                    added = true;
                }
            } else if (gender === 'female') {
                if (nameList.female.indexOf(trimmedName) === -1) {
                    nameList.female.push(trimmedName);
                    added = true;
                }
            } else {
                // Add to both
                if (nameList.male.indexOf(trimmedName) === -1) {
                    nameList.male.push(trimmedName);
                    added = true;
                }
                if (nameList.female.indexOf(trimmedName) === -1) {
                    nameList.female.push(trimmedName);
                    added = true;
                }
            }

            if (category === 'surname' || gender === 'surname') {
                if (nameList.surnames.indexOf(trimmedName) === -1) {
                    nameList.surnames.push(trimmedName);
                    added = true;
                }
            }

            if (added) {
                _saveMasterData();
                NameState.invalidateCache();
                _showToast('Added "' + trimmedName + '" to name list', 'success');
            } else {
                _showToast('Name already exists', 'info');
            }

            return added;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.NameCommands = {
        recordSurnameChange: recordSurnameChange,
        recordBirthSurname: recordBirthSurname,
        applyMarriageSurnames: applyMarriageSurnames,
        revertLastSurnameChange: revertLastSurnameChange,
        addNameToList: addNameToList,
        
        // Internal (for testing/debugging)
        _calculateMarriageSurnames: _calculateMarriageSurnames,
        _validateSurnameChange: _validateSurnameChange
    };


})();