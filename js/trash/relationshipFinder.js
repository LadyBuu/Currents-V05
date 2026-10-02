/**
 * =============================================================================
 * STILL WATERS - RELATIONSHIP FINDER UI (systems/relationships/relationshipFinderUI.js)
 * =============================================================================
 * 
 * This file contains the relationship finder tool UI including:
 * - Character selection dropdowns with enhanced options (rank symbol, gender, age, location)
 * - Relationship detection between two characters
 * - Path finding through family/social connections
 * - Consanguinity degree display
 * - Connection path visualization
 * 
 * DEPENDENCIES:
 *   - accessors.js
 *   - familySystem.js
 *   - friendshipSystem.js
 *   - ui/toasts.js
 * =============================================================================
 */

// =============================================================================
// 1. HELPER FUNCTIONS
// =============================================================================

function _getAge(character) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(character.birthYear, character.isDeceased, character.deathYear);
    }
    const currentYear = typeof window.getCurrentYearSafe === 'function' 
        ? window.getCurrentYearSafe() 
        : 1250;
    if (!character.birthYear) return 0;
    if (character.isDeceased && character.deathYear) {
        return Math.max(0, character.deathYear - character.birthYear);
    }
    return Math.max(0, currentYear - character.birthYear);
}

// Get rank symbol directly from the ranks list - NO rank name, just the symbol
function _getRankSymbol(character) {
    if (!character) return '';
    
    // Try to get rank symbol from the ranks list using activeRankId
    if (character.activeRankId && window.masterData && window.masterData.data && window.masterData.data.ranks) {
        const rank = window.masterData.data.ranks.find(r => r.id === character.activeRankId);
        if (rank && rank.symbol) {
            return rank.symbol;
        }
    }
    
    // Check rankAssignments if activeRankId not set
    if (character.rankAssignments && character.rankAssignments.length > 0 && window.masterData && window.masterData.data && window.masterData.data.ranks) {
        // Find the first non-deprecated rank assignment
        const activeRank = character.rankAssignments.find(ra => !ra.isDeprecated);
        if (activeRank) {
            const rank = window.masterData.data.ranks.find(r => r.id === activeRank.rankId);
            if (rank && rank.symbol) {
                return rank.symbol;
            }
        }
    }
    
    return '';
}

function _getLocation(character) {
    if (typeof window.getCurrentLocation === 'function') {
        return window.getCurrentLocation(character);
    }
    return 'Unknown';
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
    } else {
        console.log(`[${type}] ${msg}`);
    }
}

// =============================================================================
// 2. CHARACTER OPTION HTML GENERATOR - Shows rank symbol only
// =============================================================================

function _getCharacterOptionHtml(character) {
    const age = _getAge(character);
    const genderSymbol = character.gender === 'male' ? '♂' : (character.gender === 'female' ? '♀' : '⚥');
    const rankSymbol = _getRankSymbol(character);
    const location = _getLocation(character);
    const locationShort = location.length > 25 ? location.substring(0, 22) + '...' : location;
    const deceasedMark = character.isDeceased ? ' †' : '';
    
    // Show ONLY the rank symbol, not the name
    const rankDisplay = rankSymbol ? `${rankSymbol} ` : '';
    
    return `<option value="${character.id}">
        ${rankDisplay}${genderSymbol} ${_escapeHtml(character.name)} ${_escapeHtml(character.surname || '')}${deceasedMark} - ${age}y - ${_escapeHtml(locationShort)}
    </option>`;
}

// =============================================================================
// 3. RELATIONSHIP FINDER UI - MAIN RENDER FUNCTION
// =============================================================================

/**
 * Render the relationship finder UI inside a container
 * @param {string} containerId - ID of the container element
 */
function renderRelationshipFinder(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Relationship finder container not found:', containerId);
        return;
    }
    
    // Get all living characters
    const characters = typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    const livingChars = characters.filter(c => !c.isDeceased).sort((a, b) => a.name.localeCompare(b.name));
    const optionsHtml = livingChars.map(c => _getCharacterOptionHtml(c)).join('');
    
    // Render the UI
    container.innerHTML = `
        <div class="relationship-finder">
            <div class="finder-instructions">
                <p>Select two characters to find their relationship and connection path.</p>
            </div>
            
            <div class="form-group">
                <label>Character 1</label>
                <div class="select-with-preview">
                    <select id="relFinderChar1" class="character-select" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">
                        <option value="">— Select a character —</option>
                        ${optionsHtml}
                    </select>
                    <div id="relFinderChar1Preview" class="char-preview" style="margin-top:6px;"></div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Character 2</label>
                <div class="select-with-preview">
                    <select id="relFinderChar2" class="character-select" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">
                        <option value="">— Select a character —</option>
                        ${optionsHtml}
                    </select>
                    <div id="relFinderChar2Preview" class="char-preview" style="margin-top:6px;"></div>
                </div>
            </div>
            
            <button id="relFinderFindBtn" class="btn primary" style="padding:8px 16px; cursor:pointer;">Find Relationship</button>
            
            <div id="relFinderResult" class="relation-result" style="margin-top: 16px;"></div>
        </div>
    `;
    
    // Attach event handlers
    _attachEventHandlers();
}

function _attachEventHandlers() {
    const select1 = document.getElementById('relFinderChar1');
    const select2 = document.getElementById('relFinderChar2');
    const preview1 = document.getElementById('relFinderChar1Preview');
    const preview2 = document.getElementById('relFinderChar2Preview');
    const findBtn = document.getElementById('relFinderFindBtn');
    const resultDiv = document.getElementById('relFinderResult');
    
    const getCharacterById = typeof window.getCharacterById === 'function' ? window.getCharacterById : null;
    
    // Preview handlers - shows rank symbol only
    if (select1 && preview1) {
        select1.addEventListener('change', () => {
            const id = select1.value;
            if (id && getCharacterById) {
                const char = getCharacterById(id);
                if (char) preview1.innerHTML = _renderCharacterPreview(char);
                else preview1.innerHTML = '';
            } else {
                preview1.innerHTML = '';
            }
        });
    }
    
    if (select2 && preview2) {
        select2.addEventListener('change', () => {
            const id = select2.value;
            if (id && getCharacterById) {
                const char = getCharacterById(id);
                if (char) preview2.innerHTML = _renderCharacterPreview(char);
                else preview2.innerHTML = '';
            } else {
                preview2.innerHTML = '';
            }
        });
    }
    
    // Find button handler
    if (findBtn && select1 && select2 && resultDiv) {
        findBtn.addEventListener('click', () => {
            const char1Id = select1.value;
            const char2Id = select2.value;
            const result = _findRelationshipBetween(char1Id, char2Id);
            resultDiv.innerHTML = result.html;
            
            // Attach ancestor click handlers
            if (result.success && result.commonAncestors && result.commonAncestors.length > 0) {
                const ancestorItems = resultDiv.querySelectorAll('.ancestor-item');
                for (const item of ancestorItems) {
                    item.addEventListener('click', () => {
                        const id = item.dataset.id;
                        if (id && typeof window.selectCharacter === 'function') {
                            window.selectCharacter(id);
                        }
                    });
                }
            }
        });
    }
}

// Preview shows rank symbol, gender, name, age, location (rank name NOT shown)
function _renderCharacterPreview(character) {
    if (!character) return '';
    const age = _getAge(character);
    const rankSymbol = _getRankSymbol(character);
    const location = _getLocation(character);
    const genderSymbol = character.gender === 'male' ? '♂' : (character.gender === 'female' ? '♀' : '⚥');
    const deceasedMark = character.isDeceased ? ' †' : '';
    
    return `
        <div class="char-preview-content" style="padding: 6px 10px; background: var(--bg3); border-radius: 6px; margin-top: 4px;">
            <div class="preview-name" style="font-weight: bold;">
                ${rankSymbol ? `<span style="color: var(--accent);">${_escapeHtml(rankSymbol)}</span> ` : ''}
                ${genderSymbol} ${_escapeHtml(character.name)} ${_escapeHtml(character.surname || '')}${deceasedMark}
            </div>
            <div class="preview-details" style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">
                ${age} years · ${_escapeHtml(location)}
            </div>
        </div>
    `;
}

function _findRelationshipBetween(char1Id, char2Id) {
    const getCharacterById = typeof window.getCharacterById === 'function' ? window.getCharacterById : null;
    
    if (!char1Id || !char2Id) {
        return { success: false, html: '<div class="warning-text">Please select both characters</div>' };
    }
    
    if (char1Id === char2Id) {
        return { success: false, html: '<div class="warning-text">Same character selected</div>' };
    }
    
    if (!getCharacterById) {
        return { success: false, html: '<div class="warning-text">Character system not available</div>' };
    }
    
    const char1 = getCharacterById(char1Id);
    const char2 = getCharacterById(char2Id);
    
    if (!char1 || !char2) {
        return { success: false, html: '<div class="warning-text">Character not found</div>' };
    }
    
    // Get relationship description
    const getFullRelationshipDescription = typeof window.getFullRelationshipDescription === 'function' 
        ? window.getFullRelationshipDescription 
        : null;
    const relation = getFullRelationshipDescription ? getFullRelationshipDescription(char1Id, char2Id) : null;
    
    const getConsanguinityDegree = typeof window.getConsanguinityDegree === 'function' 
        ? window.getConsanguinityDegree 
        : null;
    const consanguinity = getConsanguinityDegree ? getConsanguinityDegree(char1Id, char2Id) : null;
    const areRelated = !!relation;
    
    // Find connection path
    const findDetailedConnectionPath = typeof window.findDetailedConnectionPath === 'function' 
        ? window.findDetailedConnectionPath 
        : null;
    const path = findDetailedConnectionPath ? findDetailedConnectionPath(char1Id, char2Id) : null;
    
    // Get common ancestors
    const findCommonAncestors = typeof window.findCommonAncestors === 'function' 
        ? window.findCommonAncestors 
        : null;
    const commonAncestors = findCommonAncestors ? findCommonAncestors(char1Id, char2Id) : [];
    
    const age1 = _getAge(char1);
    const age2 = _getAge(char2);
    const location1 = _getLocation(char1);
    const location2 = _getLocation(char2);
    const rank1 = _getRankSymbol(char1);  // Symbol only
    const rank2 = _getRankSymbol(char2);  // Symbol only
    const gender1 = char1.gender === 'male' ? '♂' : (char1.gender === 'female' ? '♀' : '⚥');
    const gender2 = char2.gender === 'male' ? '♂' : (char2.gender === 'female' ? '♀' : '⚥');
    
    let household1 = null, household2 = null;
    if (typeof window.getCharacterHousehold === 'function') {
        household1 = window.getCharacterHousehold(char1.id);
        household2 = window.getCharacterHousehold(char2.id);
    }
    
    let socialDistance = -1;
    if (typeof window.getSocialDistance === 'function') {
        socialDistance = window.getSocialDistance(char1Id, char2Id);
    }
    
    let pathHtml = '';
    if (areRelated && path && path.length > 0) {
        pathHtml = `
            <div class="connection-path" style="margin-top: 12px; padding: 12px; background: var(--bg3); border-radius: 8px;">
                <div class="path-title" style="font-weight: bold; margin-bottom: 8px; font-size: 0.65rem;">Connection Path:</div>
                <div class="path-steps" style="font-size: 0.6rem;">
                    ${path.map((step, i) => `
                        <div style="padding: 4px 0; border-bottom: 1px solid var(--border-light);">
                            <span style="color: var(--accent);">${i + 1}.</span>
                            <span class="step-name">${_escapeHtml(step.name)}</span>
                            ${step.relation ? `<span class="step-relation" style="color: var(--dim); margin-left: 8px;">(${_escapeHtml(step.relation)})</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    let commonAncestorsHtml = '';
    if (commonAncestors.length > 0) {
        commonAncestorsHtml = `
            <div class="common-ancestors" style="margin-top: 12px; padding: 12px; background: var(--bg3); border-radius: 8px;">
                <div class="ancestors-title" style="font-weight: bold; margin-bottom: 8px; font-size: 0.65rem;">Common Ancestors:</div>
                <div class="ancestors-list" style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${commonAncestors.map(a => `
                        <span class="ancestor-item" data-id="${a.id}" style="background: var(--bg2); padding: 4px 10px; border-radius: 16px; font-size: 0.6rem; cursor: pointer;">
                            ${_escapeHtml(a.name)} ${_escapeHtml(a.surname || '')}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    const html = `
        <div class="relation-result-card" style="background: var(--bg2); border-radius: 12px; padding: 16px;">
            <div class="relation-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                <div class="relation-names" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <div style="text-align: center;">
                        <div style="font-size: 0.8rem; font-weight: bold;">${rank1 ? `<span style="color: var(--accent);">${_escapeHtml(rank1)}</span> ` : ''}${gender1} ${_escapeHtml(char1.name)} ${_escapeHtml(char1.surname || '')}</div>
                        <div style="font-size: 0.55rem; color: var(--dim);">${age1} years · ${_escapeHtml(location1)}</div>
                    </div>
                    <div class="relation-arrow" style="font-size: 1.2rem;">↔</div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.8rem; font-weight: bold;">${rank2 ? `<span style="color: var(--accent);">${_escapeHtml(rank2)}</span> ` : ''}${gender2} ${_escapeHtml(char2.name)} ${_escapeHtml(char2.surname || '')}</div>
                        <div style="font-size: 0.55rem; color: var(--dim);">${age2} years · ${_escapeHtml(location2)}</div>
                    </div>
                </div>
                <div class="relation-badges" style="display: flex; gap: 8px;">
                    <span class="relation-badge" style="background: ${areRelated ? 'rgba(200, 112, 64, 0.2)' : 'rgba(74, 158, 106, 0.2)'}; padding: 4px 10px; border-radius: 16px; font-size: 0.6rem;">
                        ${areRelated ? 'Related' : 'Unrelated'}
                    </span>
                    ${consanguinity ? `<span style="background: var(--bg3); padding: 4px 10px; border-radius: 16px; font-size: 0.6rem;">${consanguinity}</span>` : ''}
                </div>
            </div>
            
            <div class="relation-description" style="margin-bottom: 12px; padding: 10px; background: var(--bg3); border-radius: 8px;">
                ${relation ? _escapeHtml(relation) : 'No direct family relationship found'}
            </div>
            
            <div class="blood-relation-${areRelated ? 'warning' : 'safe'}" style="margin-bottom: 12px; padding: 6px 10px; background: ${areRelated ? 'rgba(200, 112, 64, 0.15)' : 'rgba(74, 158, 106, 0.15)'}; border-radius: 6px; font-size: 0.6rem;">
                ${areRelated ? '⚠ These characters are blood related' : '✓ Not blood related'}
            </div>
            
            ${pathHtml}
            ${commonAncestorsHtml}
            
            <div class="comparison-stats" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                <div class="stat-title" style="font-weight: bold; margin-bottom: 8px; font-size: 0.65rem;">Comparison</div>
                <div class="stat-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.6rem;">
                    <div class="stat-item">Age Difference: ${Math.abs(age1 - age2)} years</div>
                    <div class="stat-item">Same Location: ${location1 === location2 ? 'Yes' : 'No'}</div>
                    <div class="stat-item">Same Household: ${household1?.id === household2?.id ? 'Yes' : 'No'}</div>
                    <div class="stat-item">Social Distance: ${socialDistance !== -1 ? socialDistance + ' degrees' : 'No connection'}</div>
                </div>
            </div>
        </div>
    `;
    
    return {
        success: true,
        html: html,
        areRelated: areRelated,
        consanguinity: consanguinity,
        relation: relation,
        commonAncestors: commonAncestors
    };
}

// =============================================================================
// 4. PATH FINDING HELPERS (Exported for external use)
// =============================================================================

function findDetailedConnectionPath(startId, endId, maxDepth = 5) {
    const getCharacterById = typeof window.getCharacterById === 'function' ? window.getCharacterById : null;
    const getParents = typeof window.getParents === 'function' ? window.getParents : null;
    const getChildren = typeof window.getChildren === 'function' ? window.getChildren : null;
    const getSpouses = typeof window.getSpouses === 'function' ? window.getSpouses : null;
    const getAllSiblings = typeof window.getAllSiblings === 'function' ? window.getAllSiblings : null;
    const getFriends = typeof window.getFriends === 'function' ? window.getFriends : null;
    
    if (!getCharacterById) return null;
    
    if (startId === endId) {
        const char = getCharacterById(startId);
        return [{ id: startId, name: char?.name, relation: 'Self' }];
    }
    
    const visited = new Set();
    const queue = [{ 
        id: startId, 
        path: [{ id: startId, name: getCharacterById(startId)?.name, relation: 'Start' }],
        depth: 0
    }];
    visited.add(startId);
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        if (current.depth >= maxDepth) continue;
        
        const connections = getAllConnections(current.id);
        
        for (const conn of connections) {
            if (conn.id === endId) {
                const endChar = getCharacterById(endId);
                return [...current.path, { id: endId, name: endChar?.name, relation: conn.relation }];
            }
            
            if (!visited.has(conn.id)) {
                visited.add(conn.id);
                const connChar = getCharacterById(conn.id);
                queue.push({
                    id: conn.id,
                    path: [...current.path, { id: conn.id, name: connChar?.name, relation: conn.relation }],
                    depth: current.depth + 1
                });
            }
        }
    }
    
    return null;
}

function getAllConnections(characterId) {
    const connections = [];
    const getCharacterById = typeof window.getCharacterById === 'function' ? window.getCharacterById : null;
    const getParents = typeof window.getParents === 'function' ? window.getParents : null;
    const getChildren = typeof window.getChildren === 'function' ? window.getChildren : null;
    const getSpouses = typeof window.getSpouses === 'function' ? window.getSpouses : null;
    const getAllSiblings = typeof window.getAllSiblings === 'function' ? window.getAllSiblings : null;
    const getFriends = typeof window.getFriends === 'function' ? window.getFriends : null;
    
    if (!getCharacterById) return connections;
    
    const character = getCharacterById(characterId);
    if (!character) return connections;
    
    if (getParents) {
        const parents = getParents(characterId);
        for (const parent of parents) connections.push({ id: parent.id, relation: 'parent' });
    }
    
    if (getChildren) {
        const children = getChildren(characterId);
        for (const child of children) connections.push({ id: child.id, relation: 'child' });
    }
    
    if (getSpouses) {
        const spouses = getSpouses(characterId);
        for (const spouse of spouses) connections.push({ id: spouse.id, relation: 'spouse' });
    }
    
    if (getAllSiblings) {
        const siblings = getAllSiblings(characterId);
        for (const sibling of siblings) connections.push({ id: sibling.id, relation: 'sibling' });
    }
    
    if (getFriends) {
        const friends = getFriends(characterId);
        for (const friend of friends) connections.push({ id: friend.id, relation: 'friend' });
    }
    
    return connections;
}

function findCommonAncestors(charId1, charId2) {
    const getAllAncestors = typeof window.getAllAncestors === 'function' ? window.getAllAncestors : null;
    if (!getAllAncestors) return [];
    
    const ancestors1 = getAllAncestors(charId1);
    const ancestors2 = getAllAncestors(charId2);
    
    const ancestors1Ids = new Set(ancestors1.map(a => a.id));
    return ancestors2.filter(a => ancestors1Ids.has(a.id));
}

// =============================================================================
// 5. EXPORTS
// =============================================================================

window.renderRelationshipFinder = renderRelationshipFinder;
window.findDetailedConnectionPath = findDetailedConnectionPath;
window.getAllConnections = getAllConnections;
window.findCommonAncestors = findCommonAncestors;
