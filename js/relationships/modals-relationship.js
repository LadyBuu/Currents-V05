/**
 * =============================================================================
 * STILL WATERS - MODALS RELATIONSHIP (UNIFIED)
 * =============================================================================
 *  
 * Unified relationship modal that handles ALL relationship types.
 * 
 * UPDATED:
 * - Unified creation for all relationship types
 * - Uses RomanceLogic, FriendshipLogic, ProfessionalLogic
 * - Marriage as attribute on committed
 * - No trust/loyalty references
 * - SVG icons from icons.js
 * 
 * =============================================================================
 */

// =============================================================================
// 1. ICON HELPERS
// =============================================================================

function _getIcon(name) {
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    if (window.Icons && window.Icons.CIRCLE) {
        return window.Icons.CIRCLE;
    }
    return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
}

function _getRelationshipIcon(type) {
    var iconMap = {
        'casual_dating': 'HEART_OUTLINE',
        'one_night_stand': 'STAR_4_OUTLINE',
        'committed': 'HEART',
        'friendship': 'FRIENDSHIP',
        'rivalry': 'SWORD',
        'enmity': 'X_HEAVY',
        'apprenticeship': 'CIRCLE_DOT',
        'employment': 'CIRCLE_DOT',
        'guild_membership': 'CIRCLE_DOT',
        'parent_child': 'PERSON',
        'sibling': 'CIRCLE_DOT'
    };
    var iconName = iconMap[type] || 'CIRCLE_DOT';
    return _getIcon(iconName);
}

function _getAttributeIcon(attr) {
    var iconMap = {
        'married': 'MARRIAGE',
        'engaged': 'ENGAGEMENT',
        'cohabiting': 'HOME',
        'polyamorous': 'HEART',
        'secret': 'LOCK',
        'arranged': 'CROWN',
        'love_match': 'HEART',
        'duty_match': 'SHIELD',
        'public': 'UNLOCK',
        'scandalous': 'WARNING',
        'morganatic': 'DIAMOND_OUTLINE'
    };
    var iconName = iconMap[attr] || 'CIRCLE_DOT';
    return _getIcon(iconName);
}

function _getGenderIcon(gender) {
    if (gender === 'male') {
        return _getIcon('MALE') || '♂';
    } else if (gender === 'female') {
        return _getIcon('FEMALE') || '♀';
    }
    return _getIcon('GENDER_NEUTRAL') || '⚥';
}

// =============================================================================
// 2. DEPENDENCY WRAPPERS
// =============================================================================

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
    return null;
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') return window.getCharacters();
    return [];
}

function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') return window.getCurrentLocation(character);
    return character.currentLocation || 'Unknown';
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') return window.getActiveRankDisplay(character);
    return null;
}

function _escapeHtml(str) {
    if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function _showToast(msg, type) {
    if (typeof window._showToast === 'function') {
        window._showToast(msg, type);
    } else if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
    }
}

function _openModal(options) {
    if (typeof window.openModal === 'function') {
        return window.openModal(options);
    }
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') window.closeTopModal();
}

function _getFullRelationshipDescription(id1, id2) {
    if (typeof window.getFullRelationshipDescription === 'function') {
        return window.getFullRelationshipDescription(id1, id2);
    }
    return null;
}

function _getRelationshipBetween(id1, id2) {
    if (typeof window.getRelationshipBetween === 'function') {
        return window.getRelationshipBetween(id1, id2);
    }
    return null;
}

function _getValidationRulesForArchetype(arch) {
    if (typeof window.getValidationRulesForArchetype === 'function') {
        return window.getValidationRulesForArchetype(arch);
    }
    return { minAge: 12 };
}

function _areAttributesCompatible(attributes) {
    if (typeof window.areAttributesCompatible === 'function') {
        return window.areAttributesCompatible(attributes);
    }
    return { valid: true, conflicts: [] };
}

// =============================================================================
// 3. ARCHETYPE SELECTION
// =============================================================================

var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
var ATTRIBUTES = window.RELATIONSHIP_ATTRIBUTES || {};
var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

function getRelationshipTypeOptions() {
    var iconMap = {
        'committed': 'HEART',
        'casual_dating': 'HEART_OUTLINE',
        'one_night_stand': 'STAR_4_OUTLINE',
        'friendship': 'FRIENDSHIP',
        'rivalry': 'SWORD',
        'enmity': 'X_HEAVY',
        'apprenticeship': 'CIRCLE_DOT',
        'employment': 'CIRCLE_DOT',
        'guild_membership': 'CIRCLE_DOT'
    };

    var names = {
        'committed': 'Committed Relationship',
        'casual_dating': 'Casual Dating',
        'one_night_stand': 'One Night Stand',
        'friendship': 'Friendship',
        'rivalry': 'Rivalry',
        'enmity': 'Enmity',
        'apprenticeship': 'Apprenticeship',
        'employment': 'Employment',
        'guild_membership': 'Guild Membership'
    };

    var categories = {
        'ROMANTIC': ['committed', 'casual_dating', 'one_night_stand'],
        'SOCIAL': ['friendship', 'rivalry', 'enmity'],
        'PROFESSIONAL': ['apprenticeship', 'employment', 'guild_membership']
    };

    var html = '';
    var first = true;

    for (var cat in categories) {
        if (categories.hasOwnProperty(cat)) {
            html += '<optgroup label="' + cat + '">';
            var types = categories[cat];
            for (var i = 0; i < types.length; i++) {
                var type = types[i];
                var icon = _getIcon(iconMap[type] || 'CIRCLE_DOT');
                var name = names[type] || type;
                var selected = first ? 'selected' : '';
                html += '<option value="' + type + '" ' + selected + '>' + icon + ' ' + name + '</option>';
                first = false;
            }
            html += '</optgroup>';
        }
    }

    return html;
}

// =============================================================================
// 4. ATTRIBUTE CHECKBOXES
// =============================================================================

function getAttributeCheckboxes(selectedAttributes) {
    selectedAttributes = selectedAttributes || [];
    var orderedAttrs = [
        ATTRIBUTES.MARRIED,
        ATTRIBUTES.ENGAGED,
        ATTRIBUTES.COHABITING,
        ATTRIBUTES.POLYAMOROUS,
        ATTRIBUTES.SECRET,
        ATTRIBUTES.ARRANGED,
        ATTRIBUTES.LOVE_MATCH,
        ATTRIBUTES.DUTY_MATCH
    ];

    var html = '';
    for (var i = 0; i < orderedAttrs.length; i++) {
        var attr = orderedAttrs[i];
        var checked = selectedAttributes.indexOf(attr) !== -1 ? 'checked' : '';
        var displayName = window.getAttributeName ? window.getAttributeName(attr) : attr;
        var icon = _getAttributeIcon(attr);
        html += '<label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:0.65rem; cursor:pointer;">' +
            '<input type="checkbox" class="attr-checkbox" value="' + attr + '" ' + checked + '>' +
            icon + ' ' + displayName +
        '</label>';
    }
    return html;
}

function collectSelectedAttributes() {
    var attributes = [];
    var checkboxes = document.querySelectorAll('.attr-checkbox:checked');
    for (var i = 0; i < checkboxes.length; i++) {
        attributes.push(checkboxes[i].value);
    }

    var compatibility = _areAttributesCompatible(attributes);
    if (!compatibility.valid) {
        var warnIcon = _getIcon('WARNING');
        _showToast(warnIcon + ' Incompatible attributes: ' + compatibility.conflicts.join(', '), 'warning');
    }

    return attributes;
}

// =============================================================================
// 5. UNIFIED RELATIONSHIP MODAL
// =============================================================================

function openRelationshipModal(char1, char2, onSuccess, context) {
    context = context || {};
    
    if (!char1 || !char2) {
        _showToast('Invalid characters provided', 'error');
        return;
    }

    var currentYear = _getCurrentYear();
    var char1Age = _calculateAge(char1.birthYear, char1.isDeceased, char1.deathYear);
    var char2Age = _calculateAge(char2.birthYear, char2.isDeceased, char2.deathYear);
    var char1Location = _getCurrentLocation(char1);
    var char2Location = _getCurrentLocation(char2);

    var related = _getFullRelationshipDescription(char1.id, char2.id);
    var existingRel = _getRelationshipBetween(char1.id, char2.id);

    if (existingRel && existingRel.status === STATUS.ONGOING) {
        _showToast(char1.name + ' and ' + char2.name + ' are already in a relationship!', 'error');
        return;
    }

    var ageGap = Math.abs(char1Age - char2Age);
    var minAge = 12;

    var heartIcon = _getIcon('HEART');
    var warningIcon = _getIcon('WARNING');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var locationIcon = _getIcon('LOCATION');

    var modalContent = `
        <div class="info-box" style="background:var(--bg3); padding:12px; border-radius:8px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${_escapeHtml(char1.name)}</strong> (${char1Age}y)
                    <span style="color:var(--accent); margin:0 8px;">${heartIcon}</span>
                    <strong>${_escapeHtml(char2.name)}</strong> (${char2Age}y)
                </div>
                ${related ? '<div style="color:#c87040; font-size:0.6rem;">' + warningIcon + ' ' + _escapeHtml(related) + '</div>' : ''}
            </div>
            <div style="font-size:0.6rem; color:var(--dim); margin-top:4px;">
                ${locationIcon} ${_escapeHtml(char1Location)} ${heartIcon} ${_escapeHtml(char2Location)}
                ${ageGap > 20 ? ' · ' + warningIcon + ' Age gap: ' + ageGap + ' years' : ' · Age gap: ' + ageGap + ' years'}
            </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block; font-size:0.7rem; color:var(--accent); margin-bottom:4px;">Relationship Type</label>
            <select id="relArchetype" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">
                ${getRelationshipTypeOptions()}
            </select>
        </div>

        <div id="attributesSection" style="display:none;">
            <div class="form-group" style="margin-bottom:12px;">
                <label style="display:block; font-size:0.7rem; color:var(--accent); margin-bottom:4px;">Attributes</label>
                <div style="background:var(--bg2); padding:12px; border-radius:8px;">
                    ${getAttributeCheckboxes()}
                </div>
                <small style="font-size:0.55rem;">${infoIcon} Married, Engaged, and Cohabiting are mutually exclusive</small>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div class="form-group">
                <label style="display:block; font-size:0.7rem; color:var(--accent); margin-bottom:4px;">Start Year</label>
                <input type="number" id="relStartYear" value="${currentYear}" min="1" max="${currentYear + 10}" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">
            </div>
            <div class="form-group">
                <label style="display:block; font-size:0.7rem; color:var(--accent); margin-bottom:4px;">Notes (optional)</label>
                <input type="text" id="relNotes" placeholder="e.g., How they met..." style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">
            </div>
        </div>

        <div class="info-note" style="margin-top:12px; padding:8px; background:var(--bg3); border-radius:6px; font-size:0.6rem;">
            ${infoIcon} Create a relationship between these two characters.
            ${context.isLateSpring ? ' This is a Late Spring romance.' : ''}
        </div>
    `;

    _openModal({
        title: heartIcon + ' Create Relationship',
        content: modalContent,
        confirmText: checkIcon + ' Create Relationship',
        cancelText: 'Cancel',
        onConfirm: function() {
            var archetype = document.getElementById('relArchetype').value;
            var startYear = parseInt(document.getElementById('relStartYear').value);
            var notes = document.getElementById('relNotes').value || '';

            if (isNaN(startYear)) startYear = currentYear;

            var attributes = [];
            if (archetype === ARCHETYPES.COMMITTED) {
                attributes = collectSelectedAttributes();
            }

            var result = null;

            switch(archetype) {
                case ARCHETYPES.COMMITTED:
                    if (typeof window.RomanceLogic !== 'undefined') {
                        result = window.RomanceLogic.startCommittedRelationship(char1.id, char2.id, {
                            startYear: startYear,
                            attributes: attributes,
                            notes: notes
                        });
                    } else if (typeof window.startCommittedRelationship === 'function') {
                        result = window.startCommittedRelationship(char1.id, char2.id, {
                            startYear: startYear,
                            attributes: attributes,
                            notes: notes
                        });
                    }
                    break;

                case ARCHETYPES.CASUAL_DATING:
                    if (typeof window.RomanceLogic !== 'undefined') {
                        result = window.RomanceLogic.startCasualDating(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes
                        });
                    } else if (typeof window.startCasualDating === 'function') {
                        result = window.startCasualDating(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes
                        });
                    }
                    break;

                case ARCHETYPES.ONE_NIGHT_STAND:
                    if (typeof window.RomanceLogic !== 'undefined') {
                        result = window.RomanceLogic.startOneNightStand(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes
                        });
                    } else if (typeof window.startOneNightStand === 'function') {
                        result = window.startOneNightStand(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes
                        });
                    }
                    break;

                case ARCHETYPES.FRIENDSHIP:
                    if (typeof window.FriendshipLogic !== 'undefined') {
                        result = window.FriendshipLogic.createFriendship(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes,
                            strength: 50
                        });
                    } else if (typeof window.createFriendship === 'function') {
                        result = window.createFriendship(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes
                        });
                    }
                    break;

                case ARCHETYPES.RIVALRY:
                    if (typeof window.createRelationship === 'function') {
                        result = window.createRelationship(char1.id, char2.id, {
                            type: ARCHETYPES.RIVALRY,
                            status: STATUS.ONGOING,
                            startYear: startYear,
                            metadata: { notes: notes, cause: 'Established rivalry' }
                        });
                    }
                    break;

                case ARCHETYPES.ENMITY:
                    if (typeof window.createRelationship === 'function') {
                        result = window.createRelationship(char1.id, char2.id, {
                            type: ARCHETYPES.ENMITY,
                            status: STATUS.ONGOING,
                            startYear: startYear,
                            metadata: { notes: notes, cause: 'Established enmity' }
                        });
                    }
                    break;

                case ARCHETYPES.APPRENTICESHIP:
                    if (typeof window.ProfessionalLogic !== 'undefined') {
                        result = window.ProfessionalLogic.createApprenticeship(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes,
                            initialSkill: 10
                        });
                    } else if (typeof window.createApprenticeship === 'function') {
                        result = window.createApprenticeship(char1.id, char2.id, {
                            startYear: startYear,
                            notes: notes
                        });
                    }
                    break;

                default:
                    if (typeof window.createRelationship === 'function') {
                        result = window.createRelationship(char1.id, char2.id, {
                            type: archetype,
                            status: STATUS.ONGOING,
                            startYear: startYear,
                            metadata: { notes: notes }
                        });
                    }
            }

            if (result) {
                var successMsg = 'Relationship created between ' + char1.name + ' and ' + char2.name;
                _showToast(heartIcon + ' ' + successMsg, 'success');
                if (onSuccess) onSuccess();
                _closeTopModal();
            } else {
                _showToast('Failed to create relationship', 'error');
            }
        }
    });

    setTimeout(function() {
        var archetypeSelect = document.getElementById('relArchetype');
        var attributesSection = document.getElementById('attributesSection');

        if (archetypeSelect && attributesSection) {
            archetypeSelect.addEventListener('change', function() {
                attributesSection.style.display = archetypeSelect.value === ARCHETYPES.COMMITTED ? 'block' : 'none';
            });
        }
    }, 50);
}

// =============================================================================
// 6. HELPER FUNCTIONS
// =============================================================================

function findSurpriseMatches(maxMatches) {
    maxMatches = maxMatches || 5;
    var allChars = _getCharacters();
    var currentYear = _getCurrentYear();
    var singles = [];

    for (var i = 0; i < allChars.length; i++) {
        var c = allChars[i];
        if (c.isDeceased) continue;

        var hasPartner = false;
        if (c.relationships) {
            for (var j = 0; j < c.relationships.length; j++) {
                var r = c.relationships[j];
                var relType = r.type || (r.details && r.details.type);
                if ((relType === ARCHETYPES.COMMITTED ||
                     relType === ARCHETYPES.CASUAL_DATING) &&
                    r.status === STATUS.ONGOING) {
                    hasPartner = true;
                    break;
                }
            }
        }
        if (hasPartner) continue;

        var age = currentYear - (c.birthYear || currentYear);
        var minAge = 12;
        if (age < minAge) continue;

        var location = _getCurrentLocation(c);
        singles.push({ char: c, age: age, location: location, gender: c.gender });
    }

    if (singles.length < 2) return [];

    var matches = [];
    var usedChars = new Set();
    var attempts = 0;
    var maxAttempts = maxMatches * 30;

    while (matches.length < maxMatches && attempts < maxAttempts) {
        attempts++;

        var availableMen = singles.filter(function(s) { return s.gender === 'male' && !usedChars.has(s.char.id); });
        var availableWomen = singles.filter(function(s) { return s.gender === 'female' && !usedChars.has(s.char.id); });

        if (availableMen.length === 0 || availableWomen.length === 0) break;

        var randomManIdx = Math.floor(Math.random() * availableMen.length);
        var randomWomanIdx = Math.floor(Math.random() * availableWomen.length);

        var man = availableMen[randomManIdx];
        var woman = availableWomen[randomWomanIdx];

        if (man.char.id === woman.char.id) continue;

        var ageGap = Math.abs(man.age - woman.age);
        if (ageGap > 20) continue;

        // Weighted toward smaller age gaps
        var acceptanceChance = 1 - (ageGap / 25);
        if (Math.random() > acceptanceChance) continue;

        usedChars.add(man.char.id);
        usedChars.add(woman.char.id);
        matches.push({
            char1: man.char,
            char2: woman.char,
            age1: man.age,
            age2: woman.age,
            ageGap: ageGap,
            sameLocation: man.location === woman.location,
            location1: man.location,
            location2: woman.location
        });
    }

    matches.sort(function(a, b) { return a.ageGap - b.ageGap; });
    return matches;
}

function findLateSpringMatch() {
    var allChars = _getCharacters();
    var currentYear = _getCurrentYear();
    var widowedChars = [];

    for (var i = 0; i < allChars.length; i++) {
        var char = allChars[i];
        if (char.isDeceased) continue;

        var widowedRelationship = null;
        if (char.relationships) {
            for (var j = 0; j < char.relationships.length; j++) {
                var rel = char.relationships[j];
                if (rel.status === 'widowed' &&
                    (rel.type === ARCHETYPES.COMMITTED || rel.type === 'romance' || rel.type === 'marriage')) {
                    widowedRelationship = rel;
                    break;
                }
            }
        }

        var hasOngoing = false;
        if (char.relationships) {
            for (var j = 0; j < char.relationships.length; j++) {
                var rel = char.relationships[j];
                if (rel.status === STATUS.ONGOING &&
                    (rel.type === ARCHETYPES.COMMITTED || rel.type === ARCHETYPES.CASUAL_DATING)) {
                    hasOngoing = true;
                    break;
                }
            }
        }

        if (widowedRelationship && !hasOngoing) {
            var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
            if (age >= 30) {
                widowedChars.push({ char: char, age: age });
            }
        }
    }

    if (widowedChars.length < 2) return null;

    for (var i = 0; i < widowedChars.length; i++) {
        for (var j = i + 1; j < widowedChars.length; j++) {
            var w1 = widowedChars[i];
            var w2 = widowedChars[j];
            var ageGap = Math.abs(w1.age - w2.age);
            if (ageGap <= 15) {
                return {
                    char1: w1.char,
                    char2: w2.char,
                    age1: w1.age,
                    age2: w2.age,
                    ageGap: ageGap
                };
            }
        }
    }

    return null;
}

// =============================================================================
// 7. EXPORTS
// =============================================================================

window.openRelationshipModal = openRelationshipModal;
window.findSurpriseMatches = findSurpriseMatches;
window.findLateSpringMatch = findLateSpringMatch;

// Legacy aliases
window.openMatchModal = openRelationshipModal;
window.openPolygynyRelationshipModal = openRelationshipModal;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openRelationshipModal: openRelationshipModal,
        findSurpriseMatches: findSurpriseMatches,
        findLateSpringMatch: findLateSpringMatch
    };
}