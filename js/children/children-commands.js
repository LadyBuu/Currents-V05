/**
 * =============================================================================
 * STILL WATERS - CHILDREN COMMANDS (js/core/children/children-commands.js)
 * =============================================================================
 * 
 * All write operations for children (birth, adoption, surrogacy, legitimization).
 * 
 * FEATURES:
 *   - Record birth (biological)
 *   - Record adoption (legal, guardianship, foster)
 *   - Remove adoption
 *   - Legitimize child
 *   - Record surrogacy
 *   - Recursion guard
 *   - Event emission
 *   - RELIGION INHERITANCE - Children inherit religion from parents at birth
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - character-commands.js (CharacterCommands)
 *   - family-logic.js (FamilyLogic)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - religion-inheritance.js (ReligionInheritance)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.ChildrenState !== 'undefined' ? window.ChildrenState : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _invalidateCaches() {
        if (typeof window.clearFamilyCache === 'function') {
            window.clearFamilyCache();
        }
        if (typeof window.invalidateWorldCache === 'function') {
            window.invalidateWorldCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    // =========================================================================
    // 2. FAMILY LOGIC WRAPPERS
    // =========================================================================

    function _setParent(childId, parentId, parentType, options) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.setParent(childId, parentId, parentType, options);
        }
        if (typeof window.setParent === 'function') {
            return window.setParent(childId, parentId, parentType, options);
        }
        return null;
    }

    function _removeParent(childId, parentId, options) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.removeParent(childId, parentId, options);
        }
        if (typeof window.removeParent === 'function') {
            return window.removeParent(childId, parentId, options);
        }
        return false;
    }

    function _getParents(childId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getParents(childId);
        }
        if (typeof window.getParents === 'function') {
            return window.getParents(childId);
        }
        return { father: null, mother: null };
    }

    function _getSiblings(childId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getSiblings(childId);
        }
        if (typeof window.getSiblings === 'function') {
            return window.getSiblings(childId);
        }
        return [];
    }

    // =========================================================================
    // 3. RELIGION INHERITANCE WRAPPERS (NEW)
    // =========================================================================

    function _inheritReligionForChild(childId, motherId, fatherId, locationId, options) {
        if (typeof window.ReligionInheritance !== 'undefined' &&
            typeof window.ReligionInheritance.inheritReligionForChild === 'function') {
            return window.ReligionInheritance.inheritReligionForChild(childId, motherId, fatherId, locationId, options);
        }
        // Fallback: try to assign from mother or father directly
        var mother = motherId ? _getCharacterById(motherId) : null;
        var father = fatherId ? _getCharacterById(fatherId) : null;
        var child = _getCharacterById(childId);
        
        if (!child) return null;
        
        // If mother has religion, use it
        if (mother && mother.religionId) {
            if (typeof window.CharacterCommands !== 'undefined' &&
                typeof window.CharacterCommands.assignCharacterReligion === 'function') {
                return window.CharacterCommands.assignCharacterReligion(childId, mother.religionId, {
                    year: child.birthYear || _getCurrentYear(),
                    reason: 'inheritance',
                    notes: 'Inherited from mother (fallback)',
                    inherited: true,
                    inheritedFrom: 'mother'
                });
            }
        }
        
        // If father has religion, use it
        if (father && father.religionId) {
            if (typeof window.CharacterCommands !== 'undefined' &&
                typeof window.CharacterCommands.assignCharacterReligion === 'function') {
                return window.CharacterCommands.assignCharacterReligion(childId, father.religionId, {
                    year: child.birthYear || _getCurrentYear(),
                    reason: 'inheritance',
                    notes: 'Inherited from father (fallback)',
                    inherited: true,
                    inheritedFrom: 'father'
                });
            }
        }
        
        return null;
    }

    // =========================================================================
    // 4. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 5. RECORD BIRTH (with Religion Inheritance)
    // =========================================================================

    /**
     * Records a birth (creates a child character)
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} birthYear - Year of birth
     * @param {Object} options - Options
     * @param {string} options.gender - 'male', 'female', or 'random'
     * @param {boolean} options.isStillborn - Stillborn flag
     * @param {string} options.name - Child's name (optional)
     * @param {string} options.surname - Child's surname (optional)
     * @param {string} options.notes - Notes
     * @param {string} options.birthplaceId - Birthplace location ID
     * @param {boolean} options.autoAssignHousehold - Auto-assign to parent's household
     * @param {boolean} options.inheritReligion - Inherit religion from parents (default: true)
     * @returns {Object} Result object with child
     */
    function recordBirth(mother, father, birthYear, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!mother) {
                return { success: false, reason: 'Mother required' };
            }

            if (mother.isDeceased) {
                return { success: false, reason: 'Mother is deceased' };
            }

            var gender = options.gender || 'random';
            var finalGender = gender === 'random' ? (Math.random() < 0.5 ? 'male' : 'female') : gender;

            var child = null;

            // Use character creation
            if (typeof window.CharacterCommands !== 'undefined') {
                var name = options.name || null;
                var surname = options.surname || father?.surname || mother.surname || '';

                var result = window.CharacterCommands.createCharacter({
                    name: name || 'Newborn',
                    surname: surname,
                    gender: finalGender,
                    birthYear: birthYear,
                    birthplaceId: options.birthplaceId || mother.birthplaceId || null,
                    motherId: mother.id,
                    fatherId: father?.id || null,
                    notes: options.notes || 'Born to ' + mother.name + (father ? ' and ' + father.name : ''),
                    isDeceased: options.isStillborn || false,
                    deathYear: options.isStillborn ? birthYear : null,
                    deathCause: options.isStillborn ? 'Stillborn' : '',
                    currentLocationId: options.birthplaceId || mother.currentLocationId || null
                });

                if (result && result.success) {
                    child = result.data;
                }
            } else {
                return { success: false, reason: 'Character creation not available' };
            }

            if (!child) {
                return { success: false, reason: 'Failed to create child' };
            }

            // ================================================================
            // NEW: INHERIT RELIGION FROM PARENTS
            // ================================================================
            if (options.inheritReligion !== false && !child.isDeceased) {
                var religionResult = _inheritReligionForChild(
                    child.id,
                    mother ? mother.id : null,
                    father ? father.id : null,
                    options.birthplaceId || mother.currentLocationId || null,
                    {
                        year: birthYear,
                        notes: 'Inherited at birth'
                    }
                );

                if (religionResult && religionResult.success) {
                    // Religion was inherited
                    // The child's religionId is already set by the inheritance function
                }
            }

            // Record pregnancy
            var state = _getState();
            if (state) {
                state._addPregnancyRecord({
                    motherId: mother.id,
                    fatherId: father?.id || null,
                    childId: child.id,
                    birthYear: birthYear,
                    gender: finalGender,
                    isStillborn: options.isStillborn || false,
                    notes: options.notes || ''
                });
            }

            _logEvent('birth', 'Birth',
                child.name + ' born to ' + mother.name + (father ? ' and ' + father.name : '') + ' in ' + birthYear,
                [mother, father, child]);

            var religionInfo = child.religionId ? ' (' + (child._religionName || 'with religion') + ')' : '';
            _showToast(child.name + ' born' + religionInfo, 'success');

            _saveMasterData();
            _invalidateCaches();

            return { success: true, child: child };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. RECORD ADOPTION (with optional religion inheritance)
    // =========================================================================

    /**
     * Records an adoption
     * @param {Object} parent - Adoptive parent
     * @param {Object} child - Child being adopted
     * @param {Object} options - Options
     * @param {number} options.year - Year of adoption
     * @param {string} options.type - 'legal', 'guardianship', 'foster'
     * @param {string} options.notes - Notes
     * @param {string} options.parentType - 'father', 'mother', or 'guardian'
     * @param {Object} options.partner - Co-parent (optional)
     * @param {boolean} options.inheritReligion - Inherit religion from adoptive parents (default: true)
     * @returns {Object} Result object
     */
    function recordAdoption(parent, child, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!parent || !child) {
                return { success: false, reason: 'Parent and child required' };
            }

            if (parent.isDeceased) {
                return { success: false, reason: 'Parent is deceased' };
            }

            if (child.isDeceased) {
                return { success: false, reason: 'Child is deceased' };
            }

            var year = options.year || _getCurrentYear();
            var adoptionType = options.type || 'legal';
            var parentType = options.parentType || (parent.gender === 'male' ? 'father' : 'mother');

            // Create adoption record
            var adoption = {
                parentId: parent.id,
                parentName: parent.name,
                year: year,
                type: adoptionType,
                notes: options.notes || '',
                status: 'active',
                timestamp: Date.now()
            };

            // Add to child's adoptedParents array
            if (!child.adoptedParents) child.adoptedParents = [];
            child.adoptedParents.push(adoption);

            // Add to parent's adoptedChildren array
            if (!parent.adoptedChildren) parent.adoptedChildren = [];
            parent.adoptedChildren.push({
                childId: child.id,
                childName: child.name,
                year: year,
                type: adoptionType,
                notes: options.notes || '',
                status: 'active'
            });

            // Set parent in family logic
            _setParent(child.id, parent.id, parentType, {
                biological: false,
                startYear: year,
                notes: 'Adopted in ' + year
            });

            // Handle co-parent
            if (options.partner) {
                var partnerType = options.partner.gender === 'male' ? 'father' : 'mother';
                var partnerAdoption = {
                    parentId: options.partner.id,
                    parentName: options.partner.name,
                    year: year,
                    type: adoptionType,
                    notes: options.notes || 'Co-parent',
                    status: 'active',
                    timestamp: Date.now()
                };
                child.adoptedParents.push(partnerAdoption);

                if (!options.partner.adoptedChildren) options.partner.adoptedChildren = [];
                options.partner.adoptedChildren.push({
                    childId: child.id,
                    childName: child.name,
                    year: year,
                    type: adoptionType,
                    notes: options.notes || 'Co-parent',
                    status: 'active'
                });

                _setParent(child.id, options.partner.id, partnerType, {
                    biological: false,
                    startYear: year,
                    notes: 'Adopted in ' + year
                });
            }

            // ================================================================
            // NEW: INHERIT RELIGION FROM ADOPTIVE PARENTS
            // ================================================================
            if (options.inheritReligion !== false && child.religionId === null) {
                var religionResult = _inheritReligionForChild(
                    child.id,
                    parent,
                    options.partner || null,
                    parent.currentLocationId || null,
                    {
                        year: year,
                        notes: 'Inherited from adoptive parent'
                    }
                );

                if (religionResult && religionResult.success) {
                    // Child inherited religion from adoptive parent
                }
            }

            // Update state
            var state = _getState();
            if (state) {
                state._addAdoptionRecord(child.id, adoption);
                if (options.partner) {
                    state._addAdoptionRecord(child.id, {
                        parentId: options.partner.id,
                        parentName: options.partner.name,
                        year: year,
                        type: adoptionType,
                        notes: options.notes || 'Co-parent',
                        status: 'active'
                    });
                }
            }

            _logEvent('adoption', 'Adoption',
                child.name + ' adopted by ' + parent.name + (options.partner ? ' and ' + options.partner.name : '') + ' in ' + year,
                [parent, child]);

            _showToast(child.name + ' adopted by ' + parent.name, 'success');

            _saveMasterData();
            _invalidateCaches();

            return { success: true, child: child, adoption: adoption };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. REMOVE ADOPTION
    // =========================================================================

    /**
     * Removes an adoption
     * @param {Object} parent - Adoptive parent
     * @param {Object} child - Child
     * @param {Object} options - Options
     * @param {number} options.endYear - Year adoption ended
     * @param {string} options.reason - Reason for removal
     * @param {boolean} options.keepHistory - Keep historical record
     * @returns {Object} Result object
     */
    function removeAdoption(parent, child, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!parent || !child) {
                return { success: false, reason: 'Parent and child required' };
            }

            var endYear = options.endYear || _getCurrentYear();
            var reason = options.reason || 'Adoption dissolved';
            var keepHistory = options.keepHistory !== false;

            // Update adoption records (keep history or remove)
            if (child.adoptedParents) {
                if (keepHistory) {
                    // Mark as ended
                    for (var i = 0; i < child.adoptedParents.length; i++) {
                        if (child.adoptedParents[i].parentId === parent.id) {
                            child.adoptedParents[i].status = 'ended';
                            child.adoptedParents[i].endedYear = endYear;
                            child.adoptedParents[i].endedReason = reason;
                        }
                    }
                } else {
                    // Remove entirely
                    child.adoptedParents = child.adoptedParents.filter(function(a) {
                        return a.parentId !== parent.id;
                    });
                }
            }

            if (parent.adoptedChildren) {
                if (keepHistory) {
                    for (var i = 0; i < parent.adoptedChildren.length; i++) {
                        if (parent.adoptedChildren[i].childId === child.id) {
                            parent.adoptedChildren[i].status = 'ended';
                            parent.adoptedChildren[i].endedYear = endYear;
                            parent.adoptedChildren[i].endedReason = reason;
                        }
                    }
                } else {
                    parent.adoptedChildren = parent.adoptedChildren.filter(function(a) {
                        return a.childId !== child.id;
                    });
                }
            }

            // Remove parent from family logic
            if (!keepHistory) {
                _removeParent(child.id, parent.id, {
                    endYear: endYear,
                    reason: reason
                });
            }

            // Note: Religion is NOT removed on adoption dissolution
            // The child keeps their religion regardless

            // Update state
            var state = _getState();
            if (state) {
                if (keepHistory) {
                    // Update the record to ended status
                    var records = state.getAdoptionRecords(child.id);
                    for (var i = 0; i < records.length; i++) {
                        if (records[i].parentId === parent.id) {
                            records[i].status = 'ended';
                            records[i].endedYear = endYear;
                            records[i].endedReason = reason;
                        }
                    }
                } else {
                    state._removeAdoptionRecord(child.id, parent.id);
                }
            }

            _logEvent('adoption', 'Adoption Removed',
                parent.name + ' is no longer adoptive parent of ' + child.name + ' (' + reason + ')',
                [parent, child]);

            _showToast('Adoption removed between ' + parent.name + ' and ' + child.name, 'info');

            _saveMasterData();
            _invalidateCaches();

            return { success: true };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. LEGITIMIZE CHILD (with optional religion inheritance)
    // =========================================================================

    /**
     * Legitimizes a child (declares them legitimate heir)
     * @param {Object} child - Child character
     * @param {Object} father - Father character (optional)
     * @param {Object} mother - Mother character (optional)
     * @param {Object} options - Options
     * @param {number} options.year - Year of legitimization
     * @param {string} options.changeSurname - 'none', 'father', 'mother', 'hyphenated'
     * @param {string} options.inheritanceRights - 'full', 'limited', 'none'
     * @param {string} options.notes - Notes
     * @param {boolean} options.autoAssignHousehold - Auto-assign to parent's household
     * @param {boolean} options.inheritReligion - Inherit religion from legitimizing parents (default: true)
     * @returns {Object} Result object
     */
    function legitimizeChild(child, father, mother, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!child) {
                return { success: false, reason: 'Child required' };
            }

            if (!father && !mother) {
                return { success: false, reason: 'At least one parent required' };
            }

            var year = options.year || _getCurrentYear();
            var changeSurname = options.changeSurname || 'none';
            var inheritanceRights = options.inheritanceRights || 'full';
            var oldSurname = child.surname;

            // Set parents
            if (father) {
                _setParent(child.id, father.id, 'father', {
                    biological: true,
                    startYear: child.birthYear || year,
                    notes: 'Legitimized in ' + year
                });
            }

            if (mother) {
                _setParent(child.id, mother.id, 'mother', {
                    biological: true,
                    startYear: child.birthYear || year,
                    notes: 'Legitimized in ' + year
                });
            }

            // Change surname
            if (changeSurname === 'father' && father) {
                child.surname = father.surname;
            } else if (changeSurname === 'mother' && mother) {
                child.surname = mother.surname;
            } else if (changeSurname === 'hyphenated' && father && mother) {
                child.surname = (father.surname || '') + '-' + (mother.surname || '');
            }

            // ================================================================
            // NEW: INHERIT RELIGION FROM LEGITIMIZING PARENTS
            // ================================================================
            if (options.inheritReligion !== false && child.religionId === null) {
                var religionResult = _inheritReligionForChild(
                    child.id,
                    mother ? mother.id : null,
                    father ? father.id : null,
                    (mother ? mother.currentLocationId : father ? father.currentLocationId : null),
                    {
                        year: year,
                        notes: 'Inherited during legitimization'
                    }
                );

                if (religionResult && religionResult.success) {
                    // Child inherited religion
                }
            }

            // Record legitimization
            if (!child.legitimization) child.legitimization = [];
            child.legitimization.push({
                year: year,
                declaredBy: father ? father.name : (mother ? mother.name : 'Parents'),
                inheritanceRights: inheritanceRights,
                notes: options.notes || '',
                fatherId: father?.id || null,
                motherId: mother?.id || null,
                oldSurname: oldSurname,
                newSurname: child.surname
            });

            child.isLegitimate = true;
            child.legitimizedYear = year;
            child.inheritanceRights = inheritanceRights;

            _logEvent('legitimization', 'Legitimization',
                child.name + ' legitimized in ' + year + ' with ' + inheritanceRights + ' inheritance rights',
                [child, father, mother]);

            _showToast(child.name + ' legitimized!', 'success');

            _saveMasterData();
            _invalidateCaches();

            return {
                success: true,
                child: child,
                year: year,
                inheritanceRights: inheritanceRights
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. RECORD SURROGACY (with optional religion inheritance)
    // =========================================================================

    /**
     * Records a surrogacy arrangement
     * @param {Object} intendedParent - Intended parent(s)
     * @param {Object} surrogate - Surrogate mother
     * @param {Object} options - Options
     * @param {number} options.childCount - Number of children (1-3)
     * @param {number} options.birthYear - Year of birth
     * @param {Object} options.spermDonor - Sperm donor (optional)
     * @param {Object} options.eggDonor - Egg donor (optional)
     * @param {string} options.notes - Notes
     * @param {boolean} options.inheritReligion - Inherit religion from intended parents (default: true)
     * @returns {Object} Result object
     */
    function recordSurrogacy(intendedParent, surrogate, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!intendedParent || !surrogate) {
                return { success: false, reason: 'Intended parent and surrogate required' };
            }

            if (surrogate.isDeceased) {
                return { success: false, reason: 'Surrogate is deceased' };
            }

            var childCount = options.childCount || 1;
            var birthYear = options.birthYear || _getCurrentYear();
            var spermDonor = options.spermDonor || null;
            var eggDonor = options.eggDonor || null;

            var intendedParentId = intendedParent.id || intendedParent.person?.id;
            var intendedPartnerId = intendedParent.person2?.id || intendedParent.partner?.id || null;

            var children = [];

            for (var i = 0; i < childCount; i++) {
                var gender = Math.random() < 0.5 ? 'male' : 'female';
                var isStillborn = Math.random() < 0.05;

                // Determine genetic parents
                var geneticMother = eggDonor || surrogate;
                var geneticFather = spermDonor || null;

                // Create child
                var childResult = null;
                if (typeof window.CharacterCommands !== 'undefined') {
                    childResult = window.CharacterCommands.createCharacter({
                        name: null,
                        surname: intendedParent.surname || surrogate.surname || '',
                        gender: gender,
                        birthYear: birthYear,
                        motherId: surrogate.id,
                        fatherId: geneticFather?.id || null,
                        notes: 'Surrogacy arrangement - Intended parent: ' + (intendedParent.name || intendedParentId),
                        isDeceased: isStillborn,
                        deathYear: isStillborn ? birthYear : null,
                        deathCause: isStillborn ? 'Stillborn' : '',
                        currentLocationId: surrogate.currentLocationId || null
                    });
                }

                var child = childResult?.data || null;

                if (child) {
                    // Add surrogacy info
                    child.surrogacyInfo = {
                        surrogateId: surrogate.id,
                        intendedParentId: intendedParentId,
                        intendedPartnerId: intendedPartnerId,
                        arrangementYear: options.arrangementYear || _getCurrentYear(),
                        birthYear: birthYear
                    };

                    if (geneticMother && geneticMother.id !== surrogate.id) {
                        child.geneticMotherId = geneticMother.id;
                    }
                    if (geneticFather) {
                        child.geneticFatherId = geneticFather.id;
                    }

                    // ============================================================
                    // NEW: INHERIT RELIGION FROM INTENDED PARENTS
                    // ============================================================
                    if (options.inheritReligion !== false && !child.isDeceased) {
                        var intendedParentChar = _getCharacterById(intendedParentId);
                        var intendedPartnerChar = intendedPartnerId ? _getCharacterById(intendedPartnerId) : null;

                        var religionResult = _inheritReligionForChild(
                            child.id,
                            intendedPartnerChar || intendedParentChar,
                            intendedParentChar || null,
                            surrogate.currentLocationId || null,
                            {
                                year: birthYear,
                                notes: 'Inherited from intended parent via surrogacy'
                            }
                        );

                        if (religionResult && religionResult.success) {
                            // Child inherited religion
                        }
                    }

                    children.push(child);

                    // Create adoption for intended parents
                    if (!isStillborn && typeof window.ChildrenCommands !== 'undefined') {
                        try {
                            var parentChar = _getCharacterById(intendedParentId);
                            if (parentChar) {
                                window.ChildrenCommands.recordAdoption(parentChar, child, {
                                    year: birthYear,
                                    type: 'legal',
                                    notes: 'Surrogacy arrangement',
                                    parentType: parentChar.gender === 'male' ? 'father' : 'mother',
                                    inheritReligion: false  // Already inherited above
                                });
                            }
                        } catch (e) {
                            // Fallback: direct adoption
                            if (!child.adoptedParents) child.adoptedParents = [];
                            child.adoptedParents.push({
                                parentId: intendedParentId,
                                parentName: intendedParent.name || 'Intended Parent',
                                year: birthYear,
                                type: 'legal',
                                notes: 'Surrogacy arrangement',
                                status: 'active'
                            });
                        }
                    }
                }
            }

            // Record surrogacy arrangement
            var surrogacyRecord = {
                id: 'surr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                intendedParentId: intendedParentId,
                intendedPartnerId: intendedPartnerId,
                surrogateId: surrogate.id,
                spermDonorId: spermDonor?.id || null,
                eggDonorId: eggDonor?.id || null,
                arrangementYear: options.arrangementYear || _getCurrentYear(),
                expectedBirthYear: birthYear,
                actualBirthYear: children.length > 0 ? birthYear : null,
                childIds: children.map(function(c) { return c.id; }),
                status: children.length > 0 ? 'completed' : 'active',
                notes: options.notes || ''
            };

            var state = _getState();
            if (state) {
                state._addSurrogacyRecord(surrogacyRecord);
            }

            _logEvent('surrogacy', 'Surrogacy',
                children.length + ' child' + (children.length !== 1 ? 'ren' : '') + ' born via surrogacy',
                [surrogate, intendedParent]);

            var livingChildren = children.filter(function(c) { return !c.isDeceased; });
            var message = livingChildren.length + ' child' + (livingChildren.length !== 1 ? 'ren' : '') + ' born via surrogacy';
            if (children.length - livingChildren.length > 0) {
                message += ' (' + (children.length - livingChildren.length) + ' stillborn)';
            }
            _showToast(message, 'success');

            _saveMasterData();
            _invalidateCaches();

            return {
                success: true,
                children: children,
                surrogacyRecord: surrogacyRecord
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. UPDATE SURROGACY RECORD
    // =========================================================================

    function updateSurrogacyRecord(recordId, updates) {
        if (_processing) {
            return null;
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) return null;

            var records = state.getSurrogacyRecords();
            var index = -1;
            for (var i = 0; i < records.length; i++) {
                if (records[i].id === recordId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) return null;

            var result = state._updateSurrogacyRecord(index, updates);
            _saveMasterData();
            return result;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 11. BULK BIRTH WITH RELIGION INHERITANCE (NEW)
    // =========================================================================

    /**
     * Generates multiple children for a couple with automatic religion inheritance
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} count - Number of children to generate
     * @param {number} baseYear - Base year for births
     * @param {Object} options - Options
     * @param {number} options.spacing - Years between children (default: 2)
     * @param {boolean} options.inheritReligion - Inherit religion (default: true)
     * @returns {Object} Result with children array
     */
    function generateChildrenForCouple(mother, father, count, baseYear, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing', children: [] };
        }
        _processing = true;

        try {
            options = options || {};
            var spacing = options.spacing || 2;
            var children = [];

            for (var i = 0; i < count; i++) {
                var birthYear = baseYear + (i * spacing);
                var gender = Math.random() < 0.5 ? 'male' : 'female';

                var result = recordBirth(mother, father, birthYear, {
                    gender: gender,
                    birthplaceId: mother.currentLocationId || mother.birthplaceId || null,
                    inheritReligion: options.inheritReligion !== false,
                    notes: options.notes || 'Batch birth #' + (i + 1)
                });

                if (result && result.success) {
                    children.push(result.child);
                }
            }

            return {
                success: true,
                children: children,
                count: children.length
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.ChildrenCommands = {
        recordBirth: recordBirth,
        recordAdoption: recordAdoption,
        removeAdoption: removeAdoption,
        legitimizeChild: legitimizeChild,
        recordSurrogacy: recordSurrogacy,
        updateSurrogacyRecord: updateSurrogacyRecord,
        generateChildrenForCouple: generateChildrenForCouple  // NEW
    };

    // Legacy aliases
    window.generateNewborn = function(mother, father, birthYear, options) {
        var result = recordBirth(mother, father, birthYear, options);
        return result.success ? result.child : null;
    };

    window.createAdoption = function(parentId, childId, options) {
        var parent = _getCharacterById(parentId);
        var child = _getCharacterById(childId);
        if (!parent || !child) return { success: false, error: 'Character not found' };
        return recordAdoption(parent, child, options);
    };

    window.removeAdoption = function(parentId, childId, options) {
        var parent = _getCharacterById(parentId);
        var child = _getCharacterById(childId);
        if (!parent || !child) return false;
        var result = removeAdoption(parent, child, options);
        return result.success;
    };

    window.createSurrogacyArrangement = function(intendedParent, surrogate, options, onSuccess) {
        var result = recordSurrogacy(intendedParent, surrogate, options);
        if (result.success && onSuccess) {
            onSuccess();
        }
        return result;
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenCommands;
    }

})();