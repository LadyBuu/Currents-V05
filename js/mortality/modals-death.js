/**
 * =============================================================================
 * STILL WATERS - DEATH MODALS (core/modals/modals-death.js)
 * =============================================================================
 * 
 * This file contains ALL death-related UI modals:
 * - openDeathModal(character, onSuccess) - Main death modal
 * - openMurderModal(victim, onSuccess) - Murder setup modal
 * - openExecutionModal(condemned, onSuccess) - Execution setup modal
 * 
 * UPDATED: Uses unified character selector from modals-core.js
 * 
 * ICON STYLE: SVG icons from icons.js
 * 
 * FIXED: All confirm buttons use simple text (no SVG leaks)
 * FIXED: All input fields have proper color styling
 * 
 * =============================================================================
 */

// =============================================================================
// 1. ICON HELPERS (using icons.js)
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

// =============================================================================
// 2. CONSTANTS
// =============================================================================

var DEATH_CATEGORIES = {
    natural: {
        name: 'Natural Causes',
        suggestions: ['Old age', 'Natural causes', 'Peaceful death', 'Wasting illness', 'Organ failure', 'Heart failure', 'Stroke', 'Senility']
    },
    disease: {
        name: 'Disease',
        suggestions: ['Fever', 'Consumption', 'Pneumonia', 'Infection', 'Plague', 'Dysentery', 'Malaria', 'Smallpox', 'Measles', 'Cholera', 'Typhoid', 'Typhus', 'Influenza', 'Gout', 'Cancer']
    },
    accident: {
        name: 'Accident',
        suggestions: ['Drowning', 'Fell from height', 'Hunting accident', 'Fire', 'Crushed', 'Cart accident', 'Building collapse', 'Tools accident', 'Fell down stairs', 'Slipped on ice', 'Lightning strike', 'Boating accident']
    },
    animal: {
        name: 'Animal Attack',
        suggestions: ['Mauled by bear', 'Trampled by horse', 'Wolf attack', 'Boar goring', 'Snake bite', 'Shark attack', 'Stung by insects', 'Wild dog attack', 'Lion attack', 'Alligator attack']
    },
    war: {
        name: 'War / Battle',
        suggestions: ['Killed in battle', 'War wound', 'Siege', 'Arrow wound', 'Sword wound', 'Cannon fire', 'War exhaustion', 'Executed as prisoner', 'Battle fever', 'Siege starvation']
    },
    childbirth: {
        name: 'Childbirth',
        suggestions: ['Childbed fever', 'Childbirth complications', 'Hemorrhage', 'Puerperal fever', 'Birth trauma', 'Eclampsia', 'Placental abruption']
    },
    suicide: {
        name: 'Suicide',
        suggestions: ['Hanging', 'Drowning', 'Poison', 'Jumped from height', 'Self-inflicted wound', 'Starvation', 'Self-immolation', 'Exsanguination']
    },
    murder: {
        name: 'Murder',
        isCrime: true
    },
    execution: {
        name: 'Execution',
        isExecution: true
    },
    other: {
        name: 'Other',
        suggestions: ['Starvation', 'Exposure', 'Poisoning', 'Frozen to death', 'Heat stroke', 'Thirst', 'Malnutrition', 'Dehydration']
    }
};

var MURDER_MOTIVES = {
    personal: {
        name: 'Personal',
        suggestions: ['Jealousy', 'Revenge', 'Personal vendetta', 'Crime of passion', 'Honor killing', 'Blood feud', 'Love triangle', 'Family dispute', 'Betrayal', 'Insult']
    },
    political: {
        name: 'Political',
        suggestions: ['Political rivalry', 'Treason', 'Succession dispute', 'Coup attempt', 'Court intrigue', 'Religious conflict', 'Assassination', 'Power struggle', 'Revolution']
    },
    criminal: {
        name: 'Criminal',
        suggestions: ['Robbery', 'Contract killing', 'Land dispute', 'Inheritance dispute', 'Debt collection', 'Smuggling dispute', 'Gang violence', 'Protection racket']
    },
    accidental: {
        name: 'Accidental',
        suggestions: ['Mistaken identity', 'Self-defense gone wrong', 'Bar fight gone wrong', 'Hunting accident', 'Drunken fight', 'Torture gone wrong']
    },
    other: {
        name: 'Other',
        suggestions: ['Madness/Insanity', 'Fear of exposure', 'Silencing witness', 'Impersonation', 'Unknown motive', 'Mistake', 'Thrill killing']
    }
};

var EXECUTION_REASONS = {
    murder: {
        name: 'Murder',
        suggestions: ['Murder of a noble', 'Murder of a child', 'Multiple murders', 'Brutal murder', 'Premeditated murder', 'Assassination', 'Murder of a royal']
    },
    treason: {
        name: 'Treason',
        suggestions: ['Treason against the Crown', 'Regicide', 'Rebellion', 'Revolutionary activity', 'Coup attempt', 'Conspiracy', 'Espionage', 'Sedition']
    },
    military: {
        name: 'Military',
        suggestions: ['Desertion', 'Cowardice in battle', 'Insubordination', 'Abandoning post', 'Treasonous collaboration', 'Spying', 'Mutiny']
    },
    religious: {
        name: 'Religious',
        suggestions: ['Blasphemy', 'Sacrilege', 'Witchcraft/Sorcery', 'Heresy', 'Violation of sacred grounds', 'Idolatry', 'Apostasy']
    },
    social: {
        name: 'Social',
        suggestions: ['Adultery', 'Incest', 'Disrespecting a ruler', 'Breaking sacred taboos', 'Dueling', 'Rape', 'Kidnapping', 'Slavery']
    },
    criminal: {
        name: 'Criminal',
        suggestions: ['Highway robbery', 'Counterfeiting', 'Arson', 'Piracy', 'Smuggling', 'Large-scale theft', 'Poaching', 'Forgery']
    },
    other: {
        name: 'Other',
        suggestions: ['Custom reason', 'Political convenience', 'Judicial error', 'Mob justice', 'Scapegoat', 'Public spectacle']
    }
};

var EXECUTION_METHODS = [
    { id: 'beheading', name: 'Beheading', icon: 'SWORD' },
    { id: 'hanging', name: 'Hanging', icon: 'CIRCLE_DOT' },
    { id: 'burning', name: 'Burning at the Stake', icon: 'CIRCLE_DOT' },
    { id: 'guillotine', name: 'Guillotine', icon: 'SWORD' },
    { id: 'firing_squad', name: 'Firing Squad', icon: 'SWORD' },
    { id: 'drowning', name: 'Drowning', icon: 'CIRCLE_DOT' },
    { id: 'stoning', name: 'Stoning', icon: 'CIRCLE_DOT' },
    { id: 'breaking_wheel', name: 'Breaking Wheel', icon: 'CIRCLE_DOT' },
    { id: 'quartering', name: 'Drawing and Quartering', icon: 'CIRCLE_DOT' },
    { id: 'crucifixion', name: 'Crucifixion', icon: 'CROSS' },
    { id: 'garrote', name: 'Garrote (Strangling)', icon: 'CIRCLE_DOT' },
    { id: 'boiling', name: 'Boiling Alive', icon: 'CIRCLE_DOT' }
];

// =============================================================================
// 3. DEPENDENCY WRAPPERS
// =============================================================================

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
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
    return typeof window.getCurrentLocation === 'function' ? window.getCurrentLocation(character) : 'Unknown';
}

function _getActiveRankDisplay(character) {
    return typeof window.getActiveRankDisplay === 'function' ? window.getActiveRankDisplay(character) : null;
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
    }
}

function _openModal(options) {
    if (typeof window.openModal === 'function') return window.openModal(options);
    _showToast('Modal system not available', 'error');
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') window.closeTopModal();
}

function _generateNewborn(mother, father, birthYear, options) {
    if (typeof window.generateNewborn === 'function') {
        return window.generateNewborn(mother, father, birthYear, options);
    }
    return null;
}

function _killCharacter(character, deathYear, deathCause, options) {
    if (typeof window.killCharacter === 'function') {
        return window.killCharacter(character, deathYear, deathCause, options);
    }
    if (!character || character.isDeceased) return false;
    character.isDeceased = true;
    character.deathYear = deathYear;
    character.deathCause = deathCause;
    if (options?.notes) character.deathNotes = options.notes;
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
    return true;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
}

// =============================================================================
// 4. CHARACTER SELECTOR - Uses unified selector
// =============================================================================

function _openCharacterSelectModal(config) {
    // Use unified selector from modals-core.js
    if (typeof window.openUnifiedCharacterSelector === 'function') {
        window.openUnifiedCharacterSelector({
            title: config.title || 'Select Character',
            targetId: config.targetCharacterId || null,
            onSelect: config.onSelect,
            filters: {
                showDeceased: config.includeDeceased || false,
                gender: config.gender || 'all',
                status: config.status || 'all',
                location: config.locationFilter || 'all'
            }
        });
        return;
    }
    
    // Fallback to direct openCharacterSelector
    if (typeof window.openCharacterSelector === 'function') {
        window.openCharacterSelector({
            title: config.title || 'Select Character',
            targetId: config.targetCharacterId || null,
            onSelect: config.onSelect,
            filters: {
                showDeceased: config.includeDeceased || false,
                gender: config.gender || 'all',
                status: config.status || 'all'
            }
        });
        return;
    }
    
    // Legacy fallback
    if (typeof window.openCharacterSelectModal === 'function') {
        window.openCharacterSelectModal(config);
        return;
    }
    
    _showToast('Character selector not available', 'error');
}

// =============================================================================
// 5. MAIN DEATH MODAL
// =============================================================================

function openDeathModal(character, onSuccess) {
    if (!character || character.isDeceased) {
        _showToast('Character not found or already deceased', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var age = _calculateAge(character.birthYear, false, null);
    var rank = _getActiveRankDisplay(character);
    var location = _getCurrentLocation(character);
    var isFemale = character.gender === 'female';
    var canHaveChildbirth = isFemale && age >= 14 && age <= 50;
    
    var warningIcon = _getIcon('WARNING');
    var deathIcon = _getIcon('DEATHSTARS');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var crossIcon = _getIcon('X_HEAVY');
    
    var categoryOptions = '';
    for (var key in DEATH_CATEGORIES) {
        if (DEATH_CATEGORIES.hasOwnProperty(key)) {
            var cat = DEATH_CATEGORIES[key];
            if (key === 'childbirth' && !canHaveChildbirth) continue;
            categoryOptions += '<option value="' + key + '">' + cat.name + '</option>';
        }
    }
    
    var randomCategory = 'natural';
    for (var key in DEATH_CATEGORIES) {
        if (DEATH_CATEGORIES.hasOwnProperty(key) && key !== 'murder' && key !== 'execution' && (key !== 'childbirth' || canHaveChildbirth)) {
            randomCategory = key;
            break;
        }
    }
    var randomSuggestions = DEATH_CATEGORIES[randomCategory]?.suggestions || DEATH_CATEGORIES.natural.suggestions;
    var randomCause = randomSuggestions[Math.floor(Math.random() * randomSuggestions.length)];
    
    var rankText = rank ? rank.display + ' ' : '';
    
    var modalContent = `
        <div class="info-box" style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div><strong>${rankText}${_escapeHtml(character.name)} ${_escapeHtml(character.surname || '')}</strong></div>
            <div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">
                ${_getIcon('LOCATION')} ${_escapeHtml(location)} · Current age: ${age} years · ${character.gender === 'male' ? '♂ Male' : (character.gender === 'female' ? '♀ Female' : '⚧ Other')}
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Cause Category</label>
            <select id="deathCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                ${categoryOptions}
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specific Cause</label>
            <input type="text" id="deathCauseText" value="${_escapeHtml(randomCause)}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            <div id="suggestionButtons" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;"></div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Age at Death</label>
                <input type="number" id="deathAge" value="${age}" min="0" max="150" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
            <div class="form-group">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Death</label>
                <input type="number" id="deathYear" value="${currentYear}" min="${character.birthYear || 1}" max="${currentYear + 10}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>
            <textarea id="deathNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);"></textarea>
        </div>
        
        <div class="warning-box" style="background: rgba(200, 68, 68, 0.15); padding: 10px; border-radius: 6px;">
            <div style="font-size: 0.6rem;">${warningIcon} This action cannot be undone.</div>
        </div>
    `;
    
    // FIXED: Simple text confirm button
    _openModal({
        title: crossIcon + ' Character Death: ' + character.name,
        content: modalContent,
        confirmText: 'Confirm Death',
        cancelText: 'Cancel',
        onConfirm: function() {
            var category = document.getElementById('deathCategory').value;
            var causeText = document.getElementById('deathCauseText').value.trim();
            var deathYear = parseInt(document.getElementById('deathYear').value);
            var notes = document.getElementById('deathNotes').value;
            
            if (!causeText) {
                _showToast('Please enter a cause of death', 'error');
                return false;
            }
            
            if (category === 'childbirth') {
                _closeTopModal();
                handleChildbirthDeath(character, causeText, deathYear, notes, onSuccess);
                return true;
            }
            
            if (category === 'murder') {
                _closeTopModal();
                openMurderModal(character, onSuccess);
                return true;
            }
            
            if (category === 'execution') {
                _closeTopModal();
                openExecutionModal(character, onSuccess);
                return true;
            }
            
            if (isNaN(deathYear) || deathYear < (character.birthYear || 1)) {
                _showToast('Invalid death year', 'error');
                return false;
            }
            
            deathYear = Math.min(deathYear, currentYear + 10);
            
            var fullCause = (DEATH_CATEGORIES[category]?.name || category) + ': ' + causeText;
            var result = _killCharacter(character, deathYear, fullCause, { notes: notes });
            
            if (result && result.success !== false) {
                _saveMasterData();
                _showToast(crossIcon + ' ' + character.name + ' died in ' + deathYear, 'info');
                if (onSuccess) onSuccess();
                _closeTopModal();
            } else {
                _showToast('Failed to record death', 'error');
            }
            return true;
        }
    });
    
    setTimeout(function() {
        var ageInput = document.getElementById('deathAge');
        var yearInput = document.getElementById('deathYear');
        var categorySelect = document.getElementById('deathCategory');
        var causeText = document.getElementById('deathCauseText');
        var suggestionDiv = document.getElementById('suggestionButtons');
        
        if (ageInput && yearInput && character.birthYear) {
            var updateFromAge = function() {
                var age = parseInt(ageInput.value);
                if (!isNaN(age) && age >= 0) {
                    yearInput.value = character.birthYear + age;
                }
            };
            var updateFromYear = function() {
                var year = parseInt(yearInput.value);
                if (!isNaN(year)) {
                    var newAge = year - character.birthYear;
                    if (newAge >= 0) ageInput.value = newAge;
                }
            };
            ageInput.addEventListener('input', updateFromAge);
            yearInput.addEventListener('input', updateFromYear);
        }
        
        function updateSuggestions() {
            var category = categorySelect.value;
            var cat = DEATH_CATEGORIES[category];
            if (cat && cat.suggestions) {
                var html = '';
                for (var i = 0; i < cat.suggestions.length; i++) {
                    var s = cat.suggestions[i];
                    html += '<button type="button" class="suggestion-btn" data-suggestion="' + _escapeHtml(s) + '" style="padding: 4px 8px; font-size: 0.6rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">' + _escapeHtml(s) + '</button>';
                }
                suggestionDiv.innerHTML = html;
                suggestionDiv.querySelectorAll('.suggestion-btn').forEach(function(btn) {
                    btn.addEventListener('click', function() { causeText.value = this.dataset.suggestion; });
                });
            } else {
                suggestionDiv.innerHTML = '';
            }
        }
        
        if (categorySelect) {
            categorySelect.addEventListener('change', updateSuggestions);
            updateSuggestions();
        }
    }, 100);
}

// =============================================================================
// 6. CHILDBIRTH DEATH HANDLER
// =============================================================================

function handleChildbirthDeath(mother, causeText, deathYear, notes, onSuccess) {
    var adjustedYear = deathYear;
    var motherAge = deathYear - (mother.birthYear || deathYear);
    
    if (motherAge > 50) {
        adjustedYear = (mother.birthYear || deathYear) + 35;
        _showToast('⌇ Childbirth age adjusted to 35 years', 'info');
    }
    if (motherAge < 14) {
        adjustedYear = (mother.birthYear || deathYear) + 18;
        _showToast('⌇ Childbirth age adjusted to 18 years', 'info');
    }
    
    var father = null;
    if (mother.relationships) {
        for (var i = 0; i < mother.relationships.length; i++) {
            var rel = mother.relationships[i];
            if (rel.status === 'ongoing' && (rel.type === 'committed' || rel.type === 'casual_dating')) {
                var partnerId = rel.participantA === mother.id ? rel.participantB : rel.participantA;
                father = _getCharacterById(partnerId);
                break;
            }
        }
    }
    
    var gender = Math.random() < 0.5 ? 'male' : 'female';
    var child = _generateNewborn(mother, father, adjustedYear, { gender: gender, isStillborn: false });
    
    if (child) {
        _showToast('✓ ' + child.name + ' was born as ' + mother.name + ' died', 'info');
    }
    
    var fullCause = 'Childbirth: ' + causeText;
    var result = _killCharacter(mother, adjustedYear, fullCause, { notes: notes });
    
    if (result && result.success !== false) {
        _saveMasterData();
        _showToast(_getIcon('X_HEAVY') + ' ' + mother.name + ' died in childbirth in ' + adjustedYear, 'info');
        if (onSuccess) onSuccess();
    } else {
        _showToast('Failed to record death', 'error');
    }
}

// =============================================================================
// 7. MURDER MODAL
// =============================================================================

function openMurderModal(victim, onSuccess) {
    if (!victim || victim.isDeceased) {
        _showToast('Victim not found or already deceased', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var victimAge = _calculateAge(victim.birthYear, false, null);
    var victimLocation = _getCurrentLocation(victim);
    var allChars = _getCharacters();
    
    var potentialKillers = [];
    for (var i = 0; i < allChars.length; i++) {
        var c = allChars[i];
        if (!c.isDeceased && c.id !== victim.id) {
            potentialKillers.push(c);
        }
    }
    potentialKillers.sort(function(a, b) { return a.name.localeCompare(b.name); });
    
    var swordIcon = _getIcon('SWORD');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var warningIcon = _getIcon('WARNING');
    var crossIcon = _getIcon('X_HEAVY');
    
    var motiveOptions = '';
    for (var key in MURDER_MOTIVES) {
        if (MURDER_MOTIVES.hasOwnProperty(key)) {
            var motive = MURDER_MOTIVES[key];
            motiveOptions += '<optgroup label="' + motive.name + '">';
            for (var j = 0; j < motive.suggestions.length; j++) {
                motiveOptions += '<option value="' + _escapeHtml(motive.suggestions[j]) + '">' + _escapeHtml(motive.suggestions[j]) + '</option>';
            }
            motiveOptions += '</optgroup>';
        }
    }
    motiveOptions += '<option value="__custom__">[Custom - write your own]</option>';
    
    var allMotives = [];
    for (var key in MURDER_MOTIVES) {
        if (MURDER_MOTIVES.hasOwnProperty(key)) {
            var motive = MURDER_MOTIVES[key];
            for (var j = 0; j < motive.suggestions.length; j++) {
                allMotives.push(motive.suggestions[j]);
            }
        }
    }
    var randomMotive = allMotives[Math.floor(Math.random() * allMotives.length)];
    
    function renderKillerOptions(showSameLocationOnly) {
        var options = '<option value="">— Select a murderer —</option>';
        for (var i = 0; i < potentialKillers.length; i++) {
            var killer = potentialKillers[i];
            var kLocation = _getCurrentLocation(killer);
            var sameLocation = kLocation === victimLocation;
            
            if (showSameLocationOnly && !sameLocation) continue;
            
            var age = _calculateAge(killer.birthYear, false, null);
            var rank = _getActiveRankDisplay(killer);
            var rankText = rank ? rank.display + ' ' : '';
            options += '<option value="' + killer.id + '" data-location="' + kLocation + '" data-same="' + sameLocation + '">' +
                rankText + _escapeHtml(killer.name) + ' ' + _escapeHtml(killer.surname || '') + ' (' + age + 'y) - ' + _getIcon('LOCATION') + ' ' + _escapeHtml(kLocation) + (sameLocation ? ' ✓' : '') +
            '</option>';
        }
        return options;
    }
    
    var modalContent = `
        <div class="info-box" style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div><strong>◉ Victim:</strong> ${_escapeHtml(victim.name)} ${_escapeHtml(victim.surname || '')} (${victimAge}y)</div>
            <div><strong>${_getIcon('LOCATION')} Location:</strong> ${_escapeHtml(victimLocation)}</div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="filterByLocation">
                <span>${_getIcon('LOCATION')} Only show characters in same location</span>
            </label>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Murderer</label>
            <select id="murdererSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                ${renderKillerOptions(false)}
            </select>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Age at Death</label>
                <input type="number" id="murderAge" value="${victimAge}" min="0" max="150" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
            <div class="form-group">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Murder</label>
                <input type="number" id="murderYear" value="${currentYear}" min="${victim.birthYear + 1}" max="${currentYear + 10}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Murder Method</label>
            <select id="murderMethod" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                <option value="stabbing">${swordIcon} Stabbing</option>
                <option value="poison">${infoIcon} Poison</option>
                <option value="strangulation">${infoIcon} Strangulation</option>
                <option value="bludgeoning">◉ Bludgeoning</option>
                <option value="shooting">${swordIcon} Shooting</option>
                <option value="drowning">${infoIcon} Drowning</option>
                <option value="burning">${infoIcon} Burning</option>
                <option value="falling">${infoIcon} Pushed from height</option>
                <option value="exsanguination">${infoIcon} Exsanguination</option>
                <option value="starvation">${infoIcon} Starvation</option>
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Motive</label>
            <select id="murderMotiveSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                <option value="">— Select a motive —</option>
                ${motiveOptions}
            </select>
            <input type="text" id="customMotive" placeholder="Enter custom motive..." style="width: 100%; margin-top: 6px; display: none; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="killerGotAway">
                <span>${infoIcon} Killer escaped justice (if unchecked, killer may face consequences)</span>
            </label>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>
            <textarea id="murderNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);"></textarea>
        </div>
        
        <div class="warning-box" style="background: rgba(200, 68, 68, 0.15); padding: 10px; border-radius: 6px;">
            <div style="font-size: 0.6rem;">${warningIcon} This will record a murder. The killer may face consequences if caught.</div>
        </div>
    `;
    
    // FIXED: Simple text confirm button
    _openModal({
        title: swordIcon + ' Murder: ' + victim.name,
        content: modalContent,
        confirmText: 'Commit Murder',
        cancelText: 'Cancel',
        onConfirm: function() {
            var murdererId = document.getElementById('murdererSelect').value;
            var murderYear = parseInt(document.getElementById('murderYear').value);
            var murderAge = parseInt(document.getElementById('murderAge').value);
            var method = document.getElementById('murderMethod').value;
            var motiveSelect = document.getElementById('murderMotiveSelect').value;
            var customMotive = document.getElementById('customMotive').value;
            var killerGotAway = document.getElementById('killerGotAway').checked;
            var notes = document.getElementById('murderNotes').value;
            
            if (!murdererId) {
                _showToast('Please select a murderer', 'error');
                return false;
            }
            
            if (!isNaN(murderAge) && murderAge >= 0 && victim.birthYear) {
                murderYear = victim.birthYear + murderAge;
            }
            
            if (isNaN(murderYear) || murderYear < (victim.birthYear || 1) + 1) {
                _showToast('Invalid year', 'error');
                return false;
            }
            
            murderYear = Math.min(murderYear, currentYear + 10);
            
            var motive = motiveSelect;
            if (motiveSelect === '__custom__') {
                motive = customMotive || 'Unknown motive';
            }
            if (!motive || motive === '') {
                motive = 'Unknown motive';
            }
            
            var killer = _getCharacterById(murdererId);
            if (!killer) {
                _showToast('Killer not found', 'error');
                return false;
            }
            
            if (typeof window.triggerMurder === 'function') {
                var result = window.triggerMurder(victim, killer, murderYear, {
                    murderReason: motive,
                    method: method,
                    killerGotAway: killerGotAway,
                    notes: notes,
                    startVendetta: true
                });
                
                if (result && result.success) {
                    _saveMasterData();
                    _showToast(swordIcon + ' ' + killer.name + ' murdered ' + victim.name, 'info');
                    if (result.execution) {
                        _showToast(swordIcon + ' ' + killer.name + ' was executed for the murder', 'warning');
                    }
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                } else {
                    _showToast(result?.reason || 'Failed to commit murder', 'error');
                }
            } else {
                var fullCause = 'Murder: ' + method + ' - Motive: ' + motive;
                var result = _killCharacter(victim, murderYear, fullCause, { notes: notes });
                if (result && result.success !== false) {
                    _saveMasterData();
                    _showToast(swordIcon + ' ' + victim.name + ' was murdered in ' + murderYear, 'info');
                    if (!killerGotAway && killer) {
                        _showToast(swordIcon + ' ' + killer.name + ' faces consequences for the murder', 'warning');
                    }
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                } else {
                    _showToast('Failed to record murder', 'error');
                }
            }
            return true;
        }
    });
    
    setTimeout(function() {
        var filterCheckbox = document.getElementById('filterByLocation');
        var murdererSelect = document.getElementById('murdererSelect');
        var motiveSelect = document.getElementById('murderMotiveSelect');
        var customMotiveInput = document.getElementById('customMotive');
        var murderYearInput = document.getElementById('murderYear');
        var murderAgeInput = document.getElementById('murderAge');
        
        if (murderAgeInput && murderYearInput && victim.birthYear) {
            var updateFromAge = function() {
                var age = parseInt(murderAgeInput.value);
                if (!isNaN(age) && age >= 0) {
                    murderYearInput.value = victim.birthYear + age;
                }
            };
            var updateFromYear = function() {
                var year = parseInt(murderYearInput.value);
                if (!isNaN(year)) {
                    var newAge = year - victim.birthYear;
                    if (newAge >= 0) murderAgeInput.value = newAge;
                }
            };
            murderAgeInput.addEventListener('input', updateFromAge);
            murderYearInput.addEventListener('input', updateFromYear);
        }
        
        if (filterCheckbox && murdererSelect) {
            filterCheckbox.addEventListener('change', function() {
                var showSameLocationOnly = filterCheckbox.checked;
                var currentValue = murdererSelect.value;
                murdererSelect.innerHTML = renderKillerOptions(showSameLocationOnly);
                if (currentValue && murdererSelect.querySelector('option[value="' + currentValue + '"]')) {
                    murdererSelect.value = currentValue;
                }
            });
        }
        
        if (motiveSelect && customMotiveInput) {
            motiveSelect.addEventListener('change', function() {
                customMotiveInput.style.display = motiveSelect.value === '__custom__' ? 'block' : 'none';
            });
            if (randomMotive) {
                var optionExists = false;
                for (var i = 0; i < motiveSelect.options.length; i++) {
                    if (motiveSelect.options[i].value === randomMotive) {
                        optionExists = true;
                        break;
                    }
                }
                if (optionExists) {
                    motiveSelect.value = randomMotive;
                }
            }
        }
    }, 100);
}

// =============================================================================
// 8. EXECUTION MODAL
// =============================================================================

function openExecutionModal(condemned, onSuccess) {
    if (!condemned || condemned.isDeceased) {
        _showToast('Condemned not found or already deceased', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var condemnedAge = _calculateAge(condemned.birthYear, false, null);
    var condemnedLocation = _getCurrentLocation(condemned);
    
    var reasonOptions = '';
    for (var key in EXECUTION_REASONS) {
        if (EXECUTION_REASONS.hasOwnProperty(key)) {
            var reason = EXECUTION_REASONS[key];
            reasonOptions += '<optgroup label="' + reason.name + '">';
            for (var j = 0; j < reason.suggestions.length; j++) {
                reasonOptions += '<option value="' + _escapeHtml(reason.suggestions[j]) + '">' + _escapeHtml(reason.suggestions[j]) + '</option>';
            }
            reasonOptions += '</optgroup>';
        }
    }
    reasonOptions += '<option value="__custom__">[Custom - write your own]</option>';
    
    var allReasons = [];
    for (var key in EXECUTION_REASONS) {
        if (EXECUTION_REASONS.hasOwnProperty(key)) {
            var reason = EXECUTION_REASONS[key];
            for (var j = 0; j < reason.suggestions.length; j++) {
                allReasons.push(reason.suggestions[j]);
            }
        }
    }
    var randomReason = allReasons[Math.floor(Math.random() * allReasons.length)];
    
    var methodOptions = '';
    for (var i = 0; i < EXECUTION_METHODS.length; i++) {
        var method = EXECUTION_METHODS[i];
        var icon = _getIcon(method.icon);
        methodOptions += '<option value="' + method.id + '">' + icon + ' ' + method.name + '</option>';
    }
    
    var swordIcon = _getIcon('SWORD');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var warningIcon = _getIcon('WARNING');
    var crossIcon = _getIcon('X_HEAVY');
    
    var modalContent = `
        <div class="info-box" style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div><strong>${swordIcon} Condemned:</strong> ${_escapeHtml(condemned.name)} ${_escapeHtml(condemned.surname || '')} (${condemnedAge}y)</div>
            <div><strong>${_getIcon('LOCATION')} Location:</strong> ${_escapeHtml(condemnedLocation)}</div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-group">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Age at Execution</label>
                <input type="number" id="executionAge" value="${condemnedAge}" min="0" max="150" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
            <div class="form-group">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Execution</label>
                <input type="number" id="executionYear" value="${currentYear}" min="${condemned.birthYear + 1}" max="${currentYear + 10}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Execution Method</label>
            <select id="executionMethod" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                ${methodOptions}
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason for Execution</label>
            <select id="executionReasonSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                <option value="">— Select a reason —</option>
                ${reasonOptions}
            </select>
            <input type="text" id="customExecutionReason" placeholder="Enter custom reason..." style="width: 100%; margin-top: 6px; display: none; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location of Execution (optional)</label>
            <input type="text" id="executionLocation" placeholder="e.g., Town square, Castle courtyard..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>
            <textarea id="executionNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);"></textarea>
        </div>
        
        <div class="warning-box" style="background: rgba(200, 68, 68, 0.15); padding: 10px; border-radius: 6px;">
            <div style="font-size: 0.6rem;">${warningIcon} This will execute the condemned character. This action cannot be undone.</div>
        </div>
    `;
    
    // FIXED: Simple text confirm button
    _openModal({
        title: swordIcon + ' Execute: ' + condemned.name,
        content: modalContent,
        confirmText: 'Confirm Execution',
        cancelText: 'Grant Mercy',
        onConfirm: function() {
            var executionYear = parseInt(document.getElementById('executionYear').value);
            var executionAge = parseInt(document.getElementById('executionAge').value);
            var methodId = document.getElementById('executionMethod').value;
            var reasonSelect = document.getElementById('executionReasonSelect').value;
            var customReason = document.getElementById('customExecutionReason').value;
            var location = document.getElementById('executionLocation').value;
            var notes = document.getElementById('executionNotes').value;
            
            if (!isNaN(executionAge) && executionAge >= 0 && condemned.birthYear) {
                executionYear = condemned.birthYear + executionAge;
            }
            
            if (isNaN(executionYear) || executionYear < (condemned.birthYear || 1) + 1) {
                _showToast('Invalid year', 'error');
                return false;
            }
            
            executionYear = Math.min(executionYear, currentYear + 10);
            
            var reason = reasonSelect;
            if (reasonSelect === '__custom__') {
                reason = customReason || 'Unknown reason';
            }
            if (!reason || reason === '') {
                reason = 'Unknown reason';
            }
            
            var method = null;
            for (var i = 0; i < EXECUTION_METHODS.length; i++) {
                if (EXECUTION_METHODS[i].id === methodId) {
                    method = EXECUTION_METHODS[i];
                    break;
                }
            }
            if (!method) method = EXECUTION_METHODS[0];
            var locationText = location ? ' at ' + location : '';
            var fullCause = 'Execution (' + method.name + '): ' + reason + locationText;
            
            if (typeof window.triggerExecution === 'function') {
                var result = window.triggerExecution(condemned, executionYear, reason, {
                    method: method.name,
                    location: location,
                    notes: notes
                });
                
                if (result && result.success) {
                    _saveMasterData();
                    _showToast(swordIcon + ' ' + condemned.name + ' was executed', 'info');
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                } else {
                    _showToast(result?.reason || 'Failed to execute', 'error');
                }
            } else {
                var result = _killCharacter(condemned, executionYear, fullCause, { notes: notes });
                if (result && result.success !== false) {
                    _saveMasterData();
                    _showToast(swordIcon + ' ' + condemned.name + ' was executed in ' + executionYear, 'info');
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                } else {
                    _showToast('Failed to record execution', 'error');
                }
            }
            return true;
        }
    });
    
    setTimeout(function() {
        var execAgeInput = document.getElementById('executionAge');
        var execYearInput = document.getElementById('executionYear');
        var reasonSelect = document.getElementById('executionReasonSelect');
        var customReasonInput = document.getElementById('customExecutionReason');
        
        if (execAgeInput && execYearInput && condemned.birthYear) {
            var updateFromAge = function() {
                var age = parseInt(execAgeInput.value);
                if (!isNaN(age) && age >= 0) {
                    execYearInput.value = condemned.birthYear + age;
                }
            };
            var updateFromYear = function() {
                var year = parseInt(execYearInput.value);
                if (!isNaN(year)) {
                    var newAge = year - condemned.birthYear;
                    if (newAge >= 0) execAgeInput.value = newAge;
                }
            };
            execAgeInput.addEventListener('input', updateFromAge);
            execYearInput.addEventListener('input', updateFromYear);
        }
        
        if (reasonSelect && customReasonInput) {
            reasonSelect.addEventListener('change', function() {
                customReasonInput.style.display = reasonSelect.value === '__custom__' ? 'block' : 'none';
            });
            if (randomReason) {
                var optionExists = false;
                for (var i = 0; i < reasonSelect.options.length; i++) {
                    if (reasonSelect.options[i].value === randomReason) {
                        optionExists = true;
                        break;
                    }
                }
                if (optionExists) {
                    reasonSelect.value = randomReason;
                }
            }
        }
    }, 100);
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.openDeathModal = openDeathModal;
window.openMurderModal = openMurderModal;
window.openExecutionModal = openExecutionModal;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DEATH_CATEGORIES: DEATH_CATEGORIES,
        MURDER_MOTIVES: MURDER_MOTIVES,
        EXECUTION_REASONS: EXECUTION_REASONS,
        EXECUTION_METHODS: EXECUTION_METHODS,
        openDeathModal: openDeathModal,
        openMurderModal: openMurderModal,
        openExecutionModal: openExecutionModal
    };
}