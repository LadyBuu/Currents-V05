/**
 * =============================================================================
 * STILL WATERS - RUNTIME STATE MANAGEMENT (state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/state.js
 * 
 * This file contains ONLY runtime state variables and their management.
 * NOT included: data persistence, genealogy, locations, calculations, storage.
 * 
 * PURPOSE: Track UI state, selections, filters, modal states, and temporary
 *          runtime flags that are NOT saved to localStorage.
 * 
 * DEPENDENCIES: None (pure runtime state)
 * =============================================================================
 * EXPORTED FUNCTIONS & PROPERTIES (on window):
 * =============================================================================
 * 
 * Main State Object:
 *   - window.StillWatersState - Main state object with all getters/setters
 * 
 * Individual Getters/Setters (live bindings to StillWatersState):
 * 
 * Character Manager State:
 *   - selectedCharId - Currently selected character ID
 *   - ageGroupCollapsedState - Collapsed state of age groups in UI
 *   - relationshipCache - Cached relationship data
 *   - selectedChildId - Selected child ID (auto-clears adoption cache)
 *   - selectedGuardianId - Selected guardian ID
 *   - selectedGuardianType - Type of guardian selected
 *   - selectedPartnerId - Selected partner ID
 * 
 * Location Manager State:
 *   - currentPlaceId - Currently selected place ID
 *   - collapsedNodes - Collapsed nodes in location tree
 * 
 * Rank Manager State:
 *   - rankCollapsedGroups - Collapsed groups in rank manager UI
 * 
 * Role Manager State:
 *   - selectedRoleId - Currently selected role ID
 *   - roleSearchTerm - Role search/filter term
 * 
 * Social Systems (Matchmaker) State:
 *   - selectedRomanceCharacters - Map of selected romance characters (read-only)
 *   - selectedFriendshipCharacters - Map of selected friendship characters (read-only)
 *   - selectedPolygynyMan - Selected polygyny man ID (alias: selectedPolygynyManId)
 *   - selectedPolygynyWoman - Selected polygyny woman ID (alias: selectedPolygynyWomanId)
 *   - heartbreakCollapsedCouples - Map of collapsed couples in heartbreak UI (read-only)
 *   - isSurpriseModalOpen - Whether surprise romance modal is open
 *   - isSurpriseApprenticeModalOpen - Whether surprise apprentice modal is open
 * 
 * Family Tree State:
 *   - treeCurrentCharacterId - Character currently centered in family tree
 * 
 * Timeline State:
 *   - timelineEvents - Array of timeline events
 * 
 * Census & Analytics State:
 *   - censusCurrentView - Current view mode ('list', 'grid', etc.)
 *   - censusSelectedLocationId - Selected location for census filter
 *   - censusFilters - Object with search, gender, lifeStage, rank, role, relationship, status, minAge, maxAge
 *   - censusPresets - Saved census presets
 * 
 * Diagnostics State:
 *   - diagnosticCurrentData - Current diagnostic data being viewed
 * 
 * Bulk Importer State:
 *   - bulkImportedData - Array of imported data
 *   - bulkImportedHeaders - Headers from imported file
 * 
 * Names Manager State:
 *   - namesCountries - Array of available countries for names
 *   - selectedNameCountryId - Currently selected country ID
 *   - namesCurrentTab - Current tab in names manager ('character', 'city', etc.)
 * 
 * Household Manager State:
 *   - selectedHouseholdId - Currently selected household ID
 *   - householdCurrentYear - Current year displayed in household view
 * 
 * Loading & Modal State:
 *   - loadingOverlay - Loading overlay DOM element reference
 * 
 * Map Helper Functions (for reactive collections):
 *   - clearRomanceCharacters() - Clears selected romance characters map
 *   - addRomanceCharacter(id, char) - Adds character to romance selection
 *   - removeRomanceCharacter(id) - Removes character from romance selection
 *   - clearFriendshipCharacters() - Clears selected friendship characters map
 *   - addFriendshipCharacter(id, char) - Adds character to friendship selection
 *   - removeFriendshipCharacter(id) - Removes character from friendship selection
 *   - clearHeartbreakCouples() - Clears heartbreak collapsed couples map
 *   - setHeartbreakCoupleCollapsed(coupleId, isCollapsed) - Sets collapsed state for a couple
 * 
 * Core Functions:
 *   - clearAllRuntimeState() - Resets ALL runtime state (selections, caches, filters)
 *   - clearAdoptionCache() - Clears adoption agency cache specifically
 *   - setSelectedCharacter(id) - Sets selected character ID
 *   - setSelectedPlace(id) - Sets selected place ID
 *   - setSelectedHousehold(id) - Sets selected household ID
 *   - hasSelectedCharacter() - Returns true if a character is selected
 *   - hasSelectedPlace() - Returns true if a place is selected
 *   - hasSelectedHousehold() - Returns true if a household is selected
 * 
 * =============================================================================
 */

// =============================================================================
// STATE MANAGEMENT OBJECT (Live references via getters/setters)
// =============================================================================

const StillWatersState = (function() {
    // =========================================================================
    // 1. PRIVATE VARIABLES
    // =========================================================================
    
    // Character manager state
    let _selectedCharId = null;
    let _ageGroupCollapsedState = {};
    let _relationshipCache = {};
    let _selectedChildId = null;
    let _selectedGuardianId = null;
    let _selectedGuardianType = null;
    let _selectedPartnerId = null;
    
    // Location manager state
    let _currentPlaceId = null;
    let _collapsedNodes = {};
    
    // Rank manager state
    let _rankCollapsedGroups = {};
    
    // Role manager state
    let _selectedRoleId = null;
    let _roleSearchTerm = '';
    
    // Social systems state (Matchmaker)
    let _selectedRomanceCharacters = new Map();
    let _selectedFriendshipCharacters = new Map();
    let _selectedPolygynyManId = null;      // Store ID, not object reference
    let _selectedPolygynyWomanId = null;    // Store ID, not object reference
    let _heartbreakCollapsedCouples = new Map();
    let _isSurpriseModalOpen = false;
    let _isSurpriseApprenticeModalOpen = false;
    
    // Family tree state
    let _treeCurrentCharacterId = null;
    
    // Timeline state
    let _timelineEvents = [];
    
    // Census & analytics state
    let _censusCurrentView = 'list';
    let _censusSelectedLocationId = null;
    let _censusFilters = {
        search: '',
        gender: '',
        lifeStage: '',
        rank: '',
        role: '',
        relationship: '',
        status: '',
        minAge: '',
        maxAge: ''
    };
    let _censusPresets = {};
    
    // Diagnostics state
    let _diagnosticCurrentData = null;
    
    // Bulk importer state
    let _bulkImportedData = [];
    let _bulkImportedHeaders = [];
    
    // Names manager state
    let _namesCountries = [];
    let _selectedNameCountryId = null;
    let _namesCurrentTab = 'character';
    
    // Household manager state
    let _selectedHouseholdId = null;
    let _householdCurrentYear = 1250;
    
    // Loading & modal state
    let _loadingOverlay = null;
    
    // Adoption agency cache (internal performance cache)
    let _adoptRelationshipCache = {};
    let _adoptChildAgeGapCache = {};
    let _currentSelectedChildId = null;
    
    // =========================================================================
    // 2. ADOPTION CACHE MANAGEMENT
    // =========================================================================
    
    /**
     * Clears adoption agency cache specifically
     * Call this when the selected child changes to avoid stale data
     */
    function clearAdoptionCache() {
        _adoptRelationshipCache = {};
        _adoptChildAgeGapCache = {};
        _currentSelectedChildId = _selectedChildId;
    }
    
    // =========================================================================
    // 3. MAIN STATE RESET FUNCTION
    // =========================================================================
    
    /**
     * Clears all runtime state (useful for testing or hard reset)
     * Resets selections, caches, and UI state flags
     * Does NOT clear localStorage or masterData
     */
    function clearAllRuntimeState() {
        // Character manager
        _selectedCharId = null;
        _ageGroupCollapsedState = {};
        _relationshipCache = {};
        _selectedChildId = null;
        _selectedGuardianId = null;
        _selectedGuardianType = null;
        _selectedPartnerId = null;
        
        // Location manager
        _currentPlaceId = null;
        _collapsedNodes = {};
        
        // Rank manager
        _rankCollapsedGroups = {};
        
        // Role manager
        _selectedRoleId = null;
        _roleSearchTerm = '';
        
        // Social systems
        _selectedRomanceCharacters.clear();
        _selectedFriendshipCharacters.clear();
        _selectedPolygynyManId = null;
        _selectedPolygynyWomanId = null;
        _heartbreakCollapsedCouples.clear();
        _isSurpriseModalOpen = false;
        _isSurpriseApprenticeModalOpen = false;
        
        // Family tree
        _treeCurrentCharacterId = null;
        
        // Timeline
        _timelineEvents = [];
        
        // Census
        _censusCurrentView = 'list';
        _censusSelectedLocationId = null;
        _censusFilters = {
            search: '',
            gender: '',
            lifeStage: '',
            rank: '',
            role: '',
            relationship: '',
            status: '',
            minAge: '',
            maxAge: ''
        };
        _censusPresets = {};
        
        // Diagnostics
        _diagnosticCurrentData = null;
        
        // Bulk importer
        _bulkImportedData = [];
        _bulkImportedHeaders = [];
        
        // Names manager
        _namesCountries = [];
        _selectedNameCountryId = null;
        _namesCurrentTab = 'character';
        
        // Household manager
        _selectedHouseholdId = null;
        _householdCurrentYear = 1250;
        
        // Loading state
        if (_loadingOverlay) {
            _loadingOverlay.remove();
            _loadingOverlay = null;
        }
        
        // Adoption cache
        clearAdoptionCache();
    }
    
    // =========================================================================
    // 4. SELECTION HELPER FUNCTIONS
    // =========================================================================
    
    function setSelectedCharacter(id) {
        _selectedCharId = id;
    }
    
    function setSelectedPlace(id) {
        _currentPlaceId = id;
    }
    
    function setSelectedHousehold(id) {
        _selectedHouseholdId = id;
    }
    
    function hasSelectedCharacter() {
        return _selectedCharId !== null;
    }
    
    function hasSelectedPlace() {
        return _currentPlaceId !== null;
    }
    
    function hasSelectedHousehold() {
        return _selectedHouseholdId !== null;
    }
    
    // =========================================================================
    // 5. PUBLIC API (Getters and Setters)
    // =========================================================================
    
    return {
        // ----- Character Manager -----
        get selectedCharId() { return _selectedCharId; },
        set selectedCharId(val) { _selectedCharId = val; },
        
        get ageGroupCollapsedState() { return _ageGroupCollapsedState; },
        set ageGroupCollapsedState(val) { _ageGroupCollapsedState = val; },
        
        get relationshipCache() { return _relationshipCache; },
        set relationshipCache(val) { _relationshipCache = val; },
        
        get selectedChildId() { return _selectedChildId; },
        set selectedChildId(val) { 
            _selectedChildId = val;
            clearAdoptionCache(); // Auto-clear when child changes
        },
        
        get selectedGuardianId() { return _selectedGuardianId; },
        set selectedGuardianId(val) { _selectedGuardianId = val; },
        
        get selectedGuardianType() { return _selectedGuardianType; },
        set selectedGuardianType(val) { _selectedGuardianType = val; },
        
        get selectedPartnerId() { return _selectedPartnerId; },
        set selectedPartnerId(val) { _selectedPartnerId = val; },
        
        // ----- Location Manager -----
        get currentPlaceId() { return _currentPlaceId; },
        set currentPlaceId(val) { _currentPlaceId = val; },
        
        get collapsedNodes() { return _collapsedNodes; },
        set collapsedNodes(val) { _collapsedNodes = val; },
        
        // ----- Rank Manager -----
        get rankCollapsedGroups() { return _rankCollapsedGroups; },
        set rankCollapsedGroups(val) { _rankCollapsedGroups = val; },
        
        // ----- Role Manager -----
        get selectedRoleId() { return _selectedRoleId; },
        set selectedRoleId(val) { _selectedRoleId = val; },
        
        get roleSearchTerm() { return _roleSearchTerm; },
        set roleSearchTerm(val) { _roleSearchTerm = val; },
        
        // ----- Social Systems (Matchmaker) -----
        get selectedRomanceCharacters() { return _selectedRomanceCharacters; },
        get selectedFriendshipCharacters() { return _selectedFriendshipCharacters; },
        
        get selectedPolygynyManId() { return _selectedPolygynyManId; },
        set selectedPolygynyManId(val) { _selectedPolygynyManId = val; },
        
        get selectedPolygynyWomanId() { return _selectedPolygynyWomanId; },
        set selectedPolygynyWomanId(val) { _selectedPolygynyWomanId = val; },
        
        get heartbreakCollapsedCouples() { return _heartbreakCollapsedCouples; },
        
        get isSurpriseModalOpen() { return _isSurpriseModalOpen; },
        set isSurpriseModalOpen(val) { _isSurpriseModalOpen = val; },
        
        get isSurpriseApprenticeModalOpen() { return _isSurpriseApprenticeModalOpen; },
        set isSurpriseApprenticeModalOpen(val) { _isSurpriseApprenticeModalOpen = val; },
        
        // ----- Family Tree -----
        get treeCurrentCharacterId() { return _treeCurrentCharacterId; },
        set treeCurrentCharacterId(val) { _treeCurrentCharacterId = val; },
        
        // ----- Timeline -----
        get timelineEvents() { return _timelineEvents; },
        set timelineEvents(val) { _timelineEvents = val; },
        
        // ----- Census & Analytics -----
        get censusCurrentView() { return _censusCurrentView; },
        set censusCurrentView(val) { _censusCurrentView = val; },
        
        get censusSelectedLocationId() { return _censusSelectedLocationId; },
        set censusSelectedLocationId(val) { _censusSelectedLocationId = val; },
        
        get censusFilters() { return _censusFilters; },
        set censusFilters(val) { _censusFilters = val; },
        
        get censusPresets() { return _censusPresets; },
        set censusPresets(val) { _censusPresets = val; },
        
        // ----- Diagnostics -----
        get diagnosticCurrentData() { return _diagnosticCurrentData; },
        set diagnosticCurrentData(val) { _diagnosticCurrentData = val; },
        
        // ----- Bulk Importer -----
        get bulkImportedData() { return _bulkImportedData; },
        set bulkImportedData(val) { _bulkImportedData = val; },
        
        get bulkImportedHeaders() { return _bulkImportedHeaders; },
        set bulkImportedHeaders(val) { _bulkImportedHeaders = val; },
        
        // ----- Names Manager -----
        get namesCountries() { return _namesCountries; },
        set namesCountries(val) { _namesCountries = val; },
        
        get selectedNameCountryId() { return _selectedNameCountryId; },
        set selectedNameCountryId(val) { _selectedNameCountryId = val; },
        
        get namesCurrentTab() { return _namesCurrentTab; },
        set namesCurrentTab(val) { _namesCurrentTab = val; },
        
        // ----- Household Manager -----
        get selectedHouseholdId() { return _selectedHouseholdId; },
        set selectedHouseholdId(val) { _selectedHouseholdId = val; },
        
        get householdCurrentYear() { return _householdCurrentYear; },
        set householdCurrentYear(val) { _householdCurrentYear = val; },
        
        // ----- Loading & Modal -----
        get loadingOverlay() { return _loadingOverlay; },
        set loadingOverlay(val) { _loadingOverlay = val; },
        
        // ----- Adoption Cache (Internal) -----
        get adoptRelationshipCache() { return _adoptRelationshipCache; },
        get adoptChildAgeGapCache() { return _adoptChildAgeGapCache; },
        get currentSelectedChildId() { return _currentSelectedChildId; },
        
        // ----- Map Helper Methods (for reactive collections) -----
        clearRomanceCharacters: () => _selectedRomanceCharacters.clear(),
        addRomanceCharacter: (id, char) => _selectedRomanceCharacters.set(id, char),
        removeRomanceCharacter: (id) => _selectedRomanceCharacters.delete(id),
        
        clearFriendshipCharacters: () => _selectedFriendshipCharacters.clear(),
        addFriendshipCharacter: (id, char) => _selectedFriendshipCharacters.set(id, char),
        removeFriendshipCharacter: (id) => _selectedFriendshipCharacters.delete(id),
        
        clearHeartbreakCouples: () => _heartbreakCollapsedCouples.clear(),
        setHeartbreakCoupleCollapsed: (coupleId, isCollapsed) => _heartbreakCollapsedCouples.set(coupleId, isCollapsed),
        
        // ----- Core Functions -----
        clearAllRuntimeState,
        clearAdoptionCache,
        setSelectedCharacter,
        setSelectedPlace,
        setSelectedHousehold,
        hasSelectedCharacter,
        hasSelectedPlace,
        hasSelectedHousehold
    };
})();

// =============================================================================
// 6. EXPOSE TO GLOBAL WINDOW OBJECT
// =============================================================================

window.StillWatersState = StillWatersState;

// Also expose individual getters/setters on window for backward compatibility
// Using Object.defineProperty to create live bindings
Object.defineProperty(window, 'selectedCharId', {
    get: () => StillWatersState.selectedCharId,
    set: (val) => { StillWatersState.selectedCharId = val; }
});

Object.defineProperty(window, 'ageGroupCollapsedState', {
    get: () => StillWatersState.ageGroupCollapsedState,
    set: (val) => { StillWatersState.ageGroupCollapsedState = val; }
});

Object.defineProperty(window, 'relationshipCache', {
    get: () => StillWatersState.relationshipCache,
    set: (val) => { StillWatersState.relationshipCache = val; }
});

Object.defineProperty(window, 'selectedChildId', {
    get: () => StillWatersState.selectedChildId,
    set: (val) => { StillWatersState.selectedChildId = val; }
});

Object.defineProperty(window, 'selectedGuardianId', {
    get: () => StillWatersState.selectedGuardianId,
    set: (val) => { StillWatersState.selectedGuardianId = val; }
});

Object.defineProperty(window, 'selectedGuardianType', {
    get: () => StillWatersState.selectedGuardianType,
    set: (val) => { StillWatersState.selectedGuardianType = val; }
});

Object.defineProperty(window, 'selectedPartnerId', {
    get: () => StillWatersState.selectedPartnerId,
    set: (val) => { StillWatersState.selectedPartnerId = val; }
});

Object.defineProperty(window, 'currentPlaceId', {
    get: () => StillWatersState.currentPlaceId,
    set: (val) => { StillWatersState.currentPlaceId = val; }
});

Object.defineProperty(window, 'collapsedNodes', {
    get: () => StillWatersState.collapsedNodes,
    set: (val) => { StillWatersState.collapsedNodes = val; }
});

Object.defineProperty(window, 'rankCollapsedGroups', {
    get: () => StillWatersState.rankCollapsedGroups,
    set: (val) => { StillWatersState.rankCollapsedGroups = val; }
});

Object.defineProperty(window, 'selectedRoleId', {
    get: () => StillWatersState.selectedRoleId,
    set: (val) => { StillWatersState.selectedRoleId = val; }
});

Object.defineProperty(window, 'roleSearchTerm', {
    get: () => StillWatersState.roleSearchTerm,
    set: (val) => { StillWatersState.roleSearchTerm = val; }
});

Object.defineProperty(window, 'selectedRomanceCharacters', {
    get: () => StillWatersState.selectedRomanceCharacters,
    set: () => { throw new Error('selectedRomanceCharacters is read-only. Use clearRomanceCharacters() or addRomanceCharacter()'); }
});

Object.defineProperty(window, 'selectedFriendshipCharacters', {
    get: () => StillWatersState.selectedFriendshipCharacters,
    set: () => { throw new Error('selectedFriendshipCharacters is read-only. Use clearFriendshipCharacters() or addFriendshipCharacter()'); }
});

Object.defineProperty(window, 'selectedPolygynyMan', {
    get: () => StillWatersState.selectedPolygynyManId,
    set: (val) => { StillWatersState.selectedPolygynyManId = val; }
});

Object.defineProperty(window, 'selectedPolygynyWoman', {
    get: () => StillWatersState.selectedPolygynyWomanId,
    set: (val) => { StillWatersState.selectedPolygynyWomanId = val; }
});

Object.defineProperty(window, 'heartbreakCollapsedCouples', {
    get: () => StillWatersState.heartbreakCollapsedCouples,
    set: () => { throw new Error('heartbreakCollapsedCouples is read-only. Use clearHeartbreakCouples() or setHeartbreakCoupleCollapsed()'); }
});

Object.defineProperty(window, 'isSurpriseModalOpen', {
    get: () => StillWatersState.isSurpriseModalOpen,
    set: (val) => { StillWatersState.isSurpriseModalOpen = val; }
});

Object.defineProperty(window, 'isSurpriseApprenticeModalOpen', {
    get: () => StillWatersState.isSurpriseApprenticeModalOpen,
    set: (val) => { StillWatersState.isSurpriseApprenticeModalOpen = val; }
});

Object.defineProperty(window, 'treeCurrentCharacterId', {
    get: () => StillWatersState.treeCurrentCharacterId,
    set: (val) => { StillWatersState.treeCurrentCharacterId = val; }
});

Object.defineProperty(window, 'timelineEvents', {
    get: () => StillWatersState.timelineEvents,
    set: (val) => { StillWatersState.timelineEvents = val; }
});

Object.defineProperty(window, 'censusCurrentView', {
    get: () => StillWatersState.censusCurrentView,
    set: (val) => { StillWatersState.censusCurrentView = val; }
});

Object.defineProperty(window, 'censusSelectedLocationId', {
    get: () => StillWatersState.censusSelectedLocationId,
    set: (val) => { StillWatersState.censusSelectedLocationId = val; }
});

Object.defineProperty(window, 'censusFilters', {
    get: () => StillWatersState.censusFilters,
    set: (val) => { StillWatersState.censusFilters = val; }
});

Object.defineProperty(window, 'censusPresets', {
    get: () => StillWatersState.censusPresets,
    set: (val) => { StillWatersState.censusPresets = val; }
});

Object.defineProperty(window, 'diagnosticCurrentData', {
    get: () => StillWatersState.diagnosticCurrentData,
    set: (val) => { StillWatersState.diagnosticCurrentData = val; }
});

Object.defineProperty(window, 'bulkImportedData', {
    get: () => StillWatersState.bulkImportedData,
    set: (val) => { StillWatersState.bulkImportedData = val; }
});

Object.defineProperty(window, 'bulkImportedHeaders', {
    get: () => StillWatersState.bulkImportedHeaders,
    set: (val) => { StillWatersState.bulkImportedHeaders = val; }
});

Object.defineProperty(window, 'namesCountries', {
    get: () => StillWatersState.namesCountries,
    set: (val) => { StillWatersState.namesCountries = val; }
});

Object.defineProperty(window, 'selectedNameCountryId', {
    get: () => StillWatersState.selectedNameCountryId,
    set: (val) => { StillWatersState.selectedNameCountryId = val; }
});

Object.defineProperty(window, 'namesCurrentTab', {
    get: () => StillWatersState.namesCurrentTab,
    set: (val) => { StillWatersState.namesCurrentTab = val; }
});

Object.defineProperty(window, 'selectedHouseholdId', {
    get: () => StillWatersState.selectedHouseholdId,
    set: (val) => { StillWatersState.selectedHouseholdId = val; }
});

Object.defineProperty(window, 'householdCurrentYear', {
    get: () => StillWatersState.householdCurrentYear,
    set: (val) => { StillWatersState.householdCurrentYear = val; }
});

Object.defineProperty(window, 'loadingOverlay', {
    get: () => StillWatersState.loadingOverlay,
    set: (val) => { StillWatersState.loadingOverlay = val; }
});

// Expose functions directly
window.clearAllRuntimeState = () => StillWatersState.clearAllRuntimeState();
window.clearAdoptionCache = () => StillWatersState.clearAdoptionCache();
window.setSelectedCharacter = (id) => StillWatersState.setSelectedCharacter(id);
window.setSelectedPlace = (id) => StillWatersState.setSelectedPlace(id);
window.setSelectedHousehold = (id) => StillWatersState.setSelectedHousehold(id);
window.hasSelectedCharacter = () => StillWatersState.hasSelectedCharacter();
window.hasSelectedPlace = () => StillWatersState.hasSelectedPlace();
window.hasSelectedHousehold = () => StillWatersState.hasSelectedHousehold();

// Map helper functions
window.clearRomanceCharacters = () => StillWatersState.clearRomanceCharacters();
window.addRomanceCharacter = (id, char) => StillWatersState.addRomanceCharacter(id, char);
window.removeRomanceCharacter = (id) => StillWatersState.removeRomanceCharacter(id);
window.clearFriendshipCharacters = () => StillWatersState.clearFriendshipCharacters();
window.addFriendshipCharacter = (id, char) => StillWatersState.addFriendshipCharacter(id, char);
window.removeFriendshipCharacter = (id) => StillWatersState.removeFriendshipCharacter(id);
window.clearHeartbreakCouples = () => StillWatersState.clearHeartbreakCouples();
window.setHeartbreakCoupleCollapsed = (coupleId, isCollapsed) => StillWatersState.setHeartbreakCoupleCollapsed(coupleId, isCollapsed);
