/**
 * =============================================================================
 * STILL WATERS - TIMELINE CORE (js/events/timeline-core.js)
 * =============================================================================
 * 
 * Pure business logic for timeline event collection and filtering.
 * NO DOM MANIPULATION - returns data objects only.
 * 
 * DEPENDENCIES (canonical sources via thin wrappers):
 *   - accessors.js: getCharacters, getCharacterById, getPlaceById
 *   - time.js: getCurrentYearSafe
 *   - icons.js: Icons (via _getIcon)
 *   - constants.js: STORAGE_KEYS
 * 
 * ICON POLICY: NO emojis in text. Use _getIcon() for visual indicators.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. STORAGE KEYS (from constants.js)
// =============================================================================

function _getStorageKeys() {
    if (window.STORAGE_KEYS) {
        return window.STORAGE_KEYS;
    }
    // Fallback if constants.js not loaded
    return {
        TIMELINE_FILTERS: 'timeline_filters',
        TIMELINE_COLLAPSED: 'timeline_collapsed'
    };
}

// =============================================================================
// 2. THIN WRAPPERS TO CANONICAL SOURCES
// =============================================================================

function _getCharacters() {
    if (typeof window.getCharacters === 'function') return window.getCharacters();
    return window.masterData?.data?.characters || [];
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
    return null;
}

function _getPlaceById(id) {
    if (typeof window.getPlaceById === 'function') return window.getPlaceById(id);
    return null;
}

function _getDisasters() {
    if (typeof window.getDisasters === 'function') return window.getDisasters();
    return window.masterData?.data?.disasters || [];
}

function _getAllRelationships() {
    if (typeof window.getAllRelationships === 'function') return window.getAllRelationships();
    if (window.masterData?.data?.relationships) return window.masterData.data.relationships;
    return [];
}

function _getAllApprenticeships() {
    if (typeof window.getAllApprenticeships === 'function') return window.getAllApprenticeships();
    if (window.masterData?.data?.apprenticeships) return window.masterData.data.apprenticeships;
    return [];
}

function _getAllAdoptions() {
    if (typeof window.getAllAdoptions === 'function') return window.getAllAdoptions();
    if (window.masterData?.data?.adoptions) return window.masterData.data.adoptions;
    return [];
}

function _getSurrogacies() {
    if (window.masterData?.data?.surrogacies) return window.masterData.data.surrogacies;
    return [];
}

function _getHouseholdEvents() {
    if (window.masterData?.data?.householdEvents) return window.masterData.data.householdEvents;
    return [];
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
    if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
    return 1250;
}

// =============================================================================
// 3. ICON HELPERS (FIXED - NO RECURSION)
// =============================================================================

// FIXED: Direct reference to window.Icons, no recursion
function _getIcon(name) {
    // Try window.Icons first (the canonical source)
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    
    // Try window._getIcon if it exists and is NOT this function
    if (typeof window._getIcon === 'function' && window._getIcon !== _getIcon) {
        return window._getIcon(name);
    }
    
    // Try window.getIcon if it exists
    if (typeof window.getIcon === 'function') {
        return window.getIcon(name);
    }
    
    // Fallback: return a simple SVG icon
    return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
}

// =============================================================================
// 4. EVENT TYPE TO ICON MAPPING
// =============================================================================

var _EVENT_ICON_MAP = {
    'birth': 'PERSON',
    'death': 'X_HEAVY',
    'move': 'LOCATION',
    'relationship': 'HEART',
    'relationship_end': 'X_HEAVY',
    'marriage': 'MARRIAGE',
    'apprenticeship': 'GEAR',
    'adoption': 'ADOPTION_LEGAL',
    'surrogacy': 'PERSON',
    'disaster': 'WARNING',
    'household': 'HOUSEHOLD'
};

function _getEventIcon(type) {
    var iconName = _EVENT_ICON_MAP[type] || 'CIRCLE_DOT';
    return _getIcon(iconName);
}

// =============================================================================
// 5. EVENT COLLECTION FUNCTIONS
// =============================================================================

function collectAllTimelineEvents() {
    var events = [];
    var characters = _getCharacters();
    
    events = events.concat(_collectBirthEvents(characters));
    events = events.concat(_collectDeathEvents(characters));
    events = events.concat(_collectMoveEvents(characters));
    events = events.concat(_collectRelationshipEvents(characters));
    events = events.concat(_collectMarriageEvents(characters));
    events = events.concat(_collectApprenticeshipEvents());
    events = events.concat(_collectAdoptionEvents());
    events = events.concat(_collectSurrogacyEvents());
    events = events.concat(_collectDisasterEvents());
    events = events.concat(_collectHouseholdEvents());
    
    // Sort by year (oldest first)
    events.sort(function(a, b) {
        return a.year - b.year;
    });
    
    return events;
}

function _collectBirthEvents(characters) {
    var events = [];
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.birthYear) {
            var birthplace = _getPlaceById(char.birthplaceId);
            var fullName = (char.name + ' ' + (char.surname || '')).trim();
            events.push({
                id: 'birth_' + char.id,
                year: char.birthYear,
                type: 'birth',
                title: fullName + ' was born',
                description: 'Born in ' + (birthplace ? birthplace.displayName : 'Unknown location'),
                characterId: char.id,
                characterName: char.name,
                characterSurname: char.surname || '',
                icon: _getEventIcon('birth')
            });
        }
    }
    return events;
}

function _collectDeathEvents(characters) {
    var events = [];
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.isDeceased && char.deathYear) {
            var fullName = (char.name + ' ' + (char.surname || '')).trim();
            events.push({
                id: 'death_' + char.id,
                year: char.deathYear,
                type: 'death',
                title: fullName + ' died',
                description: 'Cause: ' + (char.deathCause || 'Unknown'),
                characterId: char.id,
                characterName: char.name,
                characterSurname: char.surname || '',
                icon: _getEventIcon('death')
            });
        }
    }
    return events;
}

function _collectMoveEvents(characters) {
    var events = [];
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.moves && char.moves.length > 0) {
            for (var j = 0; j < char.moves.length; j++) {
                var move = char.moves[j];
                var location = _getPlaceById(move.locationId);
                events.push({
                    id: 'move_' + char.id + '_' + move.year + '_' + j,
                    year: move.year,
                    type: 'move',
                    title: char.name + ' moved',
                    description: 'Moved to ' + (location ? location.displayName : 'Unknown') + (move.note ? ' — ' + move.note : ''),
                    characterId: char.id,
                    characterName: char.name,
                    characterSurname: char.surname || '',
                    locationId: move.locationId,
                    locationName: location ? location.displayName : 'Unknown',
                    icon: _getEventIcon('move')
                });
            }
        }
    }
    return events;
}

function _collectRelationshipEvents(characters) {
    var events = [];
    var relationships = _getAllRelationships();
    var charMap = {};
    for (var i = 0; i < characters.length; i++) {
        charMap[characters[i].id] = characters[i];
    }
    
    var romanticTypes = ['romance', 'casual_dating', 'committed'];
    
    for (var i = 0; i < relationships.length; i++) {
        var rel = relationships[i];
        var char1 = charMap[rel.character1Id] || null;
        var char2 = charMap[rel.character2Id] || null;
        var isRomantic = romanticTypes.indexOf(rel.type) !== -1;
        
        if (rel.startYear && isRomantic) {
            var id1 = char1 ? char1.id : 'unknown';
            var id2 = char2 ? char2.id : 'unknown';
            events.push({
                id: 'rel_start_' + (rel.id || id1 + '_' + id2),
                year: rel.startYear,
                type: 'relationship',
                title: 'Relationship started',
                description: (char1 ? char1.name : 'Unknown') + ' and ' + (char2 ? char2.name : 'Unknown') + ' began a relationship',
                characterIds: [char1 ? char1.id : null, char2 ? char2.id : null],
                characterNames: [char1 ? char1.name : 'Unknown', char2 ? char2.name : 'Unknown'],
                icon: _getEventIcon('relationship')
            });
        }
        
        if (rel.endYear && (rel.status === 'ended' || rel.status === 'widowed')) {
            var action = rel.status === 'widowed' ? 'was widowed from' : 'ended relationship with';
            var id1 = char1 ? char1.id : 'unknown';
            var id2 = char2 ? char2.id : 'unknown';
            events.push({
                id: 'rel_end_' + (rel.id || id1 + '_' + id2),
                year: rel.endYear,
                type: 'relationship_end',
                title: (char1 ? char1.name : 'Unknown') + ' ' + action + ' ' + (char2 ? char2.name : 'Unknown'),
                description: 'Status: ' + (rel.status === 'widowed' ? 'Widowed' : 'Ended') + (rel.endReason ? ' — ' + rel.endReason : ''),
                characterIds: [char1 ? char1.id : null, char2 ? char2.id : null],
                characterNames: [char1 ? char1.name : 'Unknown', char2 ? char2.name : 'Unknown'],
                icon: _getEventIcon('relationship_end')
            });
        }
    }
    
    return events;
}

function _collectMarriageEvents(characters) {
    var events = [];
    var relationships = _getAllRelationships();
    var charMap = {};
    for (var i = 0; i < characters.length; i++) {
        charMap[characters[i].id] = characters[i];
    }
    
    for (var i = 0; i < relationships.length; i++) {
        var rel = relationships[i];
        var char1 = charMap[rel.character1Id] || null;
        var char2 = charMap[rel.character2Id] || null;
        
        var isMarriage = rel.type === 'marriage' ||
            (rel.metadata && rel.metadata.attributes && rel.metadata.attributes.indexOf('married') !== -1);
        
        if (rel.startYear && isMarriage) {
            var id1 = char1 ? char1.id : 'unknown';
            var id2 = char2 ? char2.id : 'unknown';
            events.push({
                id: 'marriage_' + (rel.id || id1 + '_' + id2),
                year: rel.startYear,
                type: 'marriage',
                title: 'Marriage',
                description: (char1 ? char1.name : 'Unknown') + ' and ' + (char2 ? char2.name : 'Unknown') + ' were married',
                characterIds: [char1 ? char1.id : null, char2 ? char2.id : null],
                characterNames: [char1 ? char1.name : 'Unknown', char2 ? char2.name : 'Unknown'],
                icon: _getEventIcon('marriage')
            });
        }
    }
    
    return events;
}

function _collectApprenticeshipEvents() {
    var events = [];
    var apprenticeships = _getAllApprenticeships();
    var characters = _getCharacters();
    var charMap = {};
    for (var i = 0; i < characters.length; i++) {
        charMap[characters[i].id] = characters[i];
    }
    
    for (var i = 0; i < apprenticeships.length; i++) {
        var app = apprenticeships[i];
        var mentor = charMap[app.mentorId] || null;
        var apprentice = charMap[app.apprenticeId] || null;
        
        if (app.startYear) {
            var roleText = app.roleName ? ' (' + app.roleName + ')' : '';
            events.push({
                id: 'app_start_' + app.id,
                year: app.startYear,
                type: 'apprenticeship',
                title: 'Apprenticeship Started',
                description: (apprentice ? apprentice.name : 'Unknown') + ' apprenticed to ' + (mentor ? mentor.name : 'Unknown') + roleText,
                characterIds: [mentor ? mentor.id : null, apprentice ? apprentice.id : null],
                characterNames: [mentor ? mentor.name : 'Unknown', apprentice ? apprentice.name : 'Unknown'],
                icon: _getEventIcon('apprenticeship')
            });
        }
        
        if (app.completionYear) {
            events.push({
                id: 'app_complete_' + app.id,
                year: app.completionYear,
                type: 'apprenticeship',
                title: 'Apprenticeship Completed',
                description: (apprentice ? apprentice.name : 'Unknown') + ' completed training under ' + (mentor ? mentor.name : 'Unknown'),
                characterIds: [mentor ? mentor.id : null, apprentice ? apprentice.id : null],
                characterNames: [mentor ? mentor.name : 'Unknown', apprentice ? apprentice.name : 'Unknown'],
                icon: _getEventIcon('apprenticeship')
            });
        }
    }
    
    return events;
}

function _collectAdoptionEvents() {
    var events = [];
    var adoptions = _getAllAdoptions();
    var characters = _getCharacters();
    var charMap = {};
    for (var i = 0; i < characters.length; i++) {
        charMap[characters[i].id] = characters[i];
    }
    
    for (var i = 0; i < adoptions.length; i++) {
        var adopt = adoptions[i];
        var parent = charMap[adopt.parentId] || null;
        var child = charMap[adopt.childId] || null;
        
        var typeLabel = adopt.type === 'foster' ? 'Foster' : (adopt.type === 'guardianship' ? 'Guardianship' : 'Adoption');
        
        if (adopt.startYear) {
            var action = adopt.type === 'foster' ? 'fostered by' : 'adopted by';
            events.push({
                id: 'adopt_start_' + adopt.id,
                year: adopt.startYear,
                type: 'adoption',
                title: typeLabel + ' Started',
                description: (child ? child.name : 'Unknown') + ' ' + action + ' ' + (parent ? parent.name : 'Unknown'),
                characterIds: [parent ? parent.id : null, child ? child.id : null],
                characterNames: [parent ? parent.name : 'Unknown', child ? child.name : 'Unknown'],
                icon: _getEventIcon('adoption')
            });
        }
        
        if (adopt.completionYear) {
            var actionComplete = adopt.type === 'foster' ? 'placed with' : 'adopted by';
            events.push({
                id: 'adopt_complete_' + adopt.id,
                year: adopt.completionYear,
                type: 'adoption',
                title: typeLabel + ' Finalized',
                description: (child ? child.name : 'Unknown') + ' officially ' + actionComplete + ' ' + (parent ? parent.name : 'Unknown'),
                characterIds: [parent ? parent.id : null, child ? child.id : null],
                characterNames: [parent ? parent.name : 'Unknown', child ? child.name : 'Unknown'],
                icon: _getEventIcon('adoption')
            });
        }
    }
    
    return events;
}

function _collectSurrogacyEvents() {
    var events = [];
    var surrogacies = _getSurrogacies();
    var characters = _getCharacters();
    var charMap = {};
    for (var i = 0; i < characters.length; i++) {
        charMap[characters[i].id] = characters[i];
    }
    
    for (var i = 0; i < surrogacies.length; i++) {
        var sur = surrogacies[i];
        var intendedParent = charMap[sur.intendedParentId] || null;
        var surrogate = charMap[sur.surrogateId] || null;
        
        if (sur.arrangementYear) {
            events.push({
                id: 'surr_start_' + sur.id,
                year: sur.arrangementYear,
                type: 'surrogacy',
                title: 'Surrogacy Arrangement',
                description: (surrogate ? surrogate.name : 'Unknown') + ' agreed to carry for ' + (intendedParent ? intendedParent.name : 'Unknown'),
                characterIds: [intendedParent ? intendedParent.id : null, surrogate ? surrogate.id : null],
                characterNames: [intendedParent ? intendedParent.name : 'Unknown', surrogate ? surrogate.name : 'Unknown'],
                icon: _getEventIcon('surrogacy')
            });
        }
        
        if (sur.birthYear && sur.childrenBorn && sur.childrenBorn > 0) {
            var plural = sur.childrenBorn !== 1 ? 'ren' : '';
            events.push({
                id: 'surr_birth_' + sur.id,
                year: sur.birthYear,
                type: 'surrogacy',
                title: 'Surrogacy Birth',
                description: (surrogate ? surrogate.name : 'Unknown') + ' gave birth to ' + sur.childrenBorn + ' child' + plural + ' for ' + (intendedParent ? intendedParent.name : 'Unknown'),
                characterIds: [intendedParent ? intendedParent.id : null, surrogate ? surrogate.id : null],
                characterNames: [intendedParent ? intendedParent.name : 'Unknown', surrogate ? surrogate.name : 'Unknown'],
                icon: _getEventIcon('surrogacy')
            });
        }
    }
    
    return events;
}

function _collectDisasterEvents() {
    var events = [];
    var disasters = _getDisasters();
    
    for (var i = 0; i < disasters.length; i++) {
        var disaster = disasters[i];
        var id = disaster.id || (disaster.year + '_' + disaster.disasterType);
        events.push({
            id: 'disaster_' + id,
            year: disaster.year,
            type: 'disaster',
            title: disaster.disasterType + ' at ' + disaster.locationName,
            description: (disaster.deaths || 0) + ' people perished' + (disaster.severity ? ' (Severity: ' + disaster.severity + ')' : ''),
            severity: disaster.severity || 3,
            locationName: disaster.locationName,
            icon: _getEventIcon('disaster')
        });
    }
    
    return events;
}

function _collectHouseholdEvents() {
    var events = [];
    var householdEvents = _getHouseholdEvents();
    var characters = _getCharacters();
    var charMap = {};
    for (var i = 0; i < characters.length; i++) {
        charMap[characters[i].id] = characters[i];
    }
    
    for (var i = 0; i < householdEvents.length; i++) {
        var he = householdEvents[i];
        var character = charMap[he.characterId] || null;
        events.push({
            id: 'household_' + he.id,
            year: he.year,
            type: 'household',
            title: he.eventType,
            description: (character ? character.name : 'Unknown') + ' ' + (he.description || ''),
            characterId: he.characterId,
            characterName: character ? character.name : 'Unknown',
            householdId: he.householdId,
            icon: _getEventIcon('household')
        });
    }
    
    return events;
}

// =============================================================================
// 6. FILTER FUNCTIONS
// =============================================================================

function filterEventsByYearRange(events, minYear, maxYear) {
    if (!events || events.length === 0) return events;
    var filtered = events.slice(0);
    if (minYear !== null && minYear !== undefined && minYear !== '') {
        filtered = filtered.filter(function(e) { return e.year >= minYear; });
    }
    if (maxYear !== null && maxYear !== undefined && maxYear !== '') {
        filtered = filtered.filter(function(e) { return e.year <= maxYear; });
    }
    return filtered;
}

function filterEventsByType(events, types) {
    if (!events || events.length === 0) return events;
    var typeArray = Array.isArray(types) ? types : [types];
    if (typeArray.length === 0 || typeArray[0] === 'all' || typeArray[0] === '') return events;
    return events.filter(function(e) {
        return typeArray.indexOf(e.type) !== -1;
    });
}

function filterEventsByCharacter(events, characterId) {
    if (!events || events.length === 0 || !characterId) return events;
    return events.filter(function(e) {
        return e.characterId === characterId ||
            (e.characterIds && e.characterIds.indexOf(characterId) !== -1);
    });
}

function filterEventsBySearchTerm(events, searchTerm) {
    if (!events || events.length === 0 || !searchTerm) return events;
    var lowerTerm = searchTerm.toLowerCase();
    return events.filter(function(e) {
        return e.title.toLowerCase().indexOf(lowerTerm) !== -1 ||
            e.description.toLowerCase().indexOf(lowerTerm) !== -1;
    });
}

function getUniqueEventTypes(events) {
    if (!events || events.length === 0) return [];
    var types = {};
    for (var i = 0; i < events.length; i++) {
        types[events[i].type] = true;
    }
    return Object.keys(types).sort();
}

function groupEventsByYear(events) {
    var grouped = {};
    if (!events) return grouped;
    for (var i = 0; i < events.length; i++) {
        var year = events[i].year;
        if (!grouped[year]) grouped[year] = [];
        grouped[year].push(events[i]);
    }
    return grouped;
}

function getEventYearRange(events) {
    if (!events || events.length === 0) {
        return { minYear: null, maxYear: null };
    }
    var minYear = Infinity;
    var maxYear = -Infinity;
    for (var i = 0; i < events.length; i++) {
        if (events[i].year < minYear) minYear = events[i].year;
        if (events[i].year > maxYear) maxYear = events[i].year;
    }
    return { minYear: minYear, maxYear: maxYear };
}

function getEventCountsByType(events) {
    var counts = {};
    if (!events) return counts;
    for (var i = 0; i < events.length; i++) {
        var type = events[i].type;
        counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
}

function getTimelineStats(events) {
    var yearRange = getEventYearRange(events);
    var countsByType = getEventCountsByType(events);
    
    return {
        totalEvents: events ? events.length : 0,
        minYear: yearRange.minYear,
        maxYear: yearRange.maxYear,
        yearSpan: yearRange.maxYear && yearRange.minYear ? yearRange.maxYear - yearRange.minYear + 1 : 0,
        countsByType: countsByType
    };
}

// =============================================================================
// 7. STORAGE HELPERS
// =============================================================================

function saveTimelineFilters(filters) {
    var keys = _getStorageKeys();
    try {
        localStorage.setItem(keys.TIMELINE_FILTERS, JSON.stringify(filters));
    } catch (e) {
        // Silent fail
    }
}

function loadTimelineFilters() {
    var keys = _getStorageKeys();
    try {
        var stored = localStorage.getItem(keys.TIMELINE_FILTERS);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        // Silent fail
    }
    return null;
}

function saveTimelineCollapsedState(collapsed) {
    var keys = _getStorageKeys();
    try {
        localStorage.setItem(keys.TIMELINE_COLLAPSED, JSON.stringify(collapsed));
    } catch (e) {
        // Silent fail
    }
}

function loadTimelineCollapsedState() {
    var keys = _getStorageKeys();
    try {
        var stored = localStorage.getItem(keys.TIMELINE_COLLAPSED);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        // Silent fail
    }
    return null;
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

// Core collection
window.collectAllTimelineEvents = collectAllTimelineEvents;

// Filtering functions
window.filterEventsByYearRange = filterEventsByYearRange;
window.filterEventsByType = filterEventsByType;
window.filterEventsByCharacter = filterEventsByCharacter;
window.filterEventsBySearchTerm = filterEventsBySearchTerm;

// Helper functions
window.getUniqueEventTypes = getUniqueEventTypes;
window.groupEventsByYear = groupEventsByYear;
window.getEventYearRange = getEventYearRange;
window.getEventCountsByType = getEventCountsByType;
window.getTimelineStats = getTimelineStats;

// Storage helpers
window.saveTimelineFilters = saveTimelineFilters;
window.loadTimelineFilters = loadTimelineFilters;
window.saveTimelineCollapsedState = saveTimelineCollapsedState;
window.loadTimelineCollapsedState = loadTimelineCollapsedState;

// Internal exports (for testing)
window._getEventIcon = _getEventIcon;
window._EVENT_ICON_MAP = _EVENT_ICON_MAP;