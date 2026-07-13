/**
 * =============================================================================
 * STILL WATERS - ROLES TAB UI (js/systems/roles/ui/rolesTabUI.js)
 * =============================================================================
 * 
 * Renders roles as a collapsible category tree with burger menu for mobile
 * Similar to characterListUI.js age-grouped tree structure
 * 
 * UPDATED: Now uses the modular role system (RoleState, RoleQueries, RoleUI)
 * =============================================================================
 */

(function() {
    "use strict";
    
    // =========================================================================
    // 1. DEPENDENCY WRAPPERS - Using the new modular system
    // =========================================================================
    
    function _getRoles() {
        // Use RoleQueries if available
        if (window.RoleQueries && typeof window.RoleQueries.getRoles === 'function') {
            return window.RoleQueries.getRoles({});
        }
        // Fallback to legacy
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        // Direct from RoleState
        if (window.RoleState && typeof window.RoleState.getAllRoles === 'function') {
            return window.RoleState.getAllRoles();
        }
        return [];
    }
    
    function _getRoleById(id) {
        if (window.RoleState && typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof window.getRole === 'function') {
            return window.getRole(id);
        }
        return null;
    }
    
    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        if (window.accessors && typeof window.accessors.getCharacterById === 'function') {
            return window.accessors.getCharacterById(id);
        }
        return null;
    }
    
    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
    
    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
        else console.log(`[${type}] ${msg}`);
    }
    
    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }
    
    // =========================================================================
    // 2. STATE - Using RoleState UI state when available
    // =========================================================================
    
    let _rolesTabUIState = {
        selectedId: null,
        collapsedCategories: {},
        searchTerm: '',
        filterCategory: 'all',
        filterGender: 'all',
        filterMasterOnly: false,
        viewMode: 'list'
    };
    
    const ROLES_UI_STORAGE_KEY = 'roles_ui_state_v1';
    
    function _loadState() {
        try {
            // Try to load from RoleState first
            if (window.RoleState && typeof window.RoleState.getUIState === 'function') {
                const uiState = window.RoleState.getUIState();
                if (uiState) {
                    _rolesTabUIState.selectedId = uiState.selectedRoleId || null;
                    _rolesTabUIState.searchTerm = uiState.searchTerm || '';
                    _rolesTabUIState.filterCategory = uiState.filterCategory || 'all';
                    _rolesTabUIState.filterGender = uiState.filterGender || 'all';
                    _rolesTabUIState.filterMasterOnly = uiState.filterMasterOnly || false;
                    return;
                }
            }
            
            // Fallback to localStorage
            const saved = localStorage.getItem(ROLES_UI_STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                _rolesTabUIState.collapsedCategories = data.collapsedCategories || {};
                _rolesTabUIState.searchTerm = data.searchTerm || '';
                _rolesTabUIState.filterCategory = data.filterCategory || 'all';
                _rolesTabUIState.filterGender = data.filterGender || 'all';
                _rolesTabUIState.filterMasterOnly = data.filterMasterOnly || false;
                if (data.selectedId) _rolesTabUIState.selectedId = data.selectedId;
            }
        } catch(e) {}
    }
    
    function _saveUIState() {
        try {
            // Save to RoleState if available
            if (window.RoleState && typeof window.RoleState.updateUIState === 'function') {
                window.RoleState.updateUIState({
                    selectedRoleId: _rolesTabUIState.selectedId,
                    searchTerm: _rolesTabUIState.searchTerm,
                    filterCategory: _rolesTabUIState.filterCategory,
                    filterGender: _rolesTabUIState.filterGender,
                    filterMasterOnly: _rolesTabUIState.filterMasterOnly
                });
            }
            
            // Also save to localStorage for persistence
            localStorage.setItem(ROLES_UI_STORAGE_KEY, JSON.stringify({
                collapsedCategories: _rolesTabUIState.collapsedCategories,
                searchTerm: _rolesTabUIState.searchTerm,
                filterCategory: _rolesTabUIState.filterCategory,
                filterGender: _rolesTabUIState.filterGender,
                filterMasterOnly: _rolesTabUIState.filterMasterOnly,
                selectedId: _rolesTabUIState.selectedId
            }));
        } catch(e) {}
    }
    
    // =========================================================================
    // 3. GET CATEGORIES - Using RoleState
    // =========================================================================
    
    function _getCategories() {
        if (window.RoleState && typeof window.RoleState.getCategories === 'function') {
            return window.RoleState.getCategories();
        }
        if (typeof window.getRoleCategories === 'function') {
            return window.getRoleCategories();
        }
        return { uncategorized: { id: 'uncategorized', name: 'Uncategorized', icon: '⌇' } };
    }
    
    // =========================================================================
    // 4. FILTER FUNCTIONS - Using RoleQueries when available
    // =========================================================================
    
    function applyRoleFilters(roles) {
        let filtered = [...roles];
        
        if (_rolesTabUIState.searchTerm) {
            const searchLower = _rolesTabUIState.searchTerm.toLowerCase();
            filtered = filtered.filter(r => 
                r.name.toLowerCase().includes(searchLower) ||
                (r.notes || '').toLowerCase().includes(searchLower) ||
                (r.specializations || []).some(s => s.toLowerCase().includes(searchLower))
            );
        }
        
        if (_rolesTabUIState.filterCategory !== 'all') {
            filtered = filtered.filter(r => r.category === _rolesTabUIState.filterCategory);
        }
        
        if (_rolesTabUIState.filterGender !== 'all') {
            if (_rolesTabUIState.filterGender === 'both') {
                filtered = filtered.filter(r => r.genderRestriction !== 'male' && r.genderRestriction !== 'female');
            } else {
                filtered = filtered.filter(r => r.genderRestriction === _rolesTabUIState.filterGender);
            }
        }
        
        if (_rolesTabUIState.filterMasterOnly) {
            filtered = filtered.filter(r => {
                const stats = typeof window.RoleQueries?.getRoleStatistics === 'function'
                    ? window.RoleQueries.getRoleStatistics(r.id)
                    : (typeof window.getRoleStatistics === 'function' 
                        ? window.getRoleStatistics(r.id) 
                        : { totalCharacters: 0, masterCount: 0, expertCount: 0 });
                return stats.masterCount > 0 || stats.expertCount > 0;
            });
        }
        
        return filtered;
    }
    
    // =========================================================================
    // 5. RENDER - COLLAPSIBLE CATEGORY TREE (Using RoleUI when available)
    // =========================================================================
    
    function renderRolesTab(containerId, onSelectRole) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        _loadState();
        
        let roles = _getRoles();
        
        if (!roles || roles.length === 0) {
            container.innerHTML = `<div class="empty-state" style="text-align: center; padding: 40px; color: var(--dim);">No roles found. Click "Add Role" to create one.</div>`;
            return;
        }
        
        roles = applyRoleFilters(roles);
        roles.sort((a, b) => a.name.localeCompare(b.name));
        
        if (roles.length === 0) {
            container.innerHTML = `<div class="empty-state" style="text-align: center; padding: 40px; color: var(--dim);">No roles match your filters.</div>`;
            return;
        }
        
        const categories = _getCategories();
        
        // Group roles by category
        const rolesByCategory = {};
        for (const role of roles) {
            const catId = role.category || 'uncategorized';
            if (!rolesByCategory[catId]) rolesByCategory[catId] = [];
            rolesByCategory[catId].push(role);
        }
        
        // Sort categories by name
        const sortedCatIds = Object.keys(rolesByCategory).sort((a, b) => {
            const nameA = categories[a]?.name || a;
            const nameB = categories[b]?.name || b;
            return nameA.localeCompare(nameB);
        });
        
        let html = '';
        
        for (const catId of sortedCatIds) {
            const catRoles = rolesByCategory[catId];
            const category = categories[catId] || { name: catId, icon: '⌇' };
            const isCollapsed = _rolesTabUIState.collapsedCategories[catId] === true;
            
            html += `
                <div class="role-category-section" style="margin-bottom: 8px;">
                    <div class="role-category-header" data-category="${catId}" style="
                        padding: 6px 10px;
                        background: var(--bg2);
                        border: 1px solid var(--border);
                        border-radius: 6px;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        transition: all 0.2s;
                    ">
                        <span style="font-size: 0.65rem; color: var(--accent); font-family: 'Cinzel', serif;">
                            ${category.icon || '⌇'} ${category.name}
                            <span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">(${catRoles.length})</span>
                        </span>
                        <span style="font-size: 0.55rem; color: var(--accent);">${isCollapsed ? '▶' : '▼'}</span>
                    </div>
                    <div class="role-category-children" data-category="${catId}" style="${isCollapsed ? 'display: none;' : 'margin-left: 4px; margin-top: 4px;'}">
            `;
            
            // Sort roles by name within category
            catRoles.sort((a, b) => a.name.localeCompare(b.name));
            
            for (const role of catRoles) {
                const isSelected = _rolesTabUIState.selectedId === role.id;
                const stats = typeof window.RoleQueries?.getRoleStatistics === 'function'
                    ? window.RoleQueries.getRoleStatistics(role.id)
                    : (typeof window.getRoleStatistics === 'function'
                        ? window.getRoleStatistics(role.id)
                        : { totalCharacters: 0, masterCount: 0, expertCount: 0 });
                
                const genderLabel = role.genderRestriction === 'male' ? '♂' : 
                                   (role.genderRestriction === 'female' ? '♀' : '⚥');
                
                // Check if this role has literacy requirements
                const literacyLabel = role.requiresLiteracy && role.literacyLevel 
                    ? `📖 ${role.literacyLevel}` 
                    : '';
                
                // Check if this role has a salary
                const salaryLabel = role.baseSalary && role.baseSalary > 0 
                    ? `💰 ${role.baseSalary}g` 
                    : '';
                
                html += `
                    <div class="role-node ${isSelected ? 'selected' : ''}" data-role-id="${role.id}" style="
                        margin: 2px 0;
                        padding: 6px 10px;
                        background: ${isSelected ? 'var(--accent-dim)' : 'var(--bg)'};
                        border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--border2)'};
                        border-radius: 4px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                <span style="font-size: 0.7rem;">${role.icon || '◉'}</span>
                                <span style="font-size: 0.65rem; font-weight: bold; color: var(--accent);">${_escapeHtml(role.name)}</span>
                                <span style="font-size: 0.5rem; color: var(--dim); padding: 1px 4px; background: var(--bg2); border-radius: 8px;">${genderLabel}</span>
                                ${literacyLabel ? `<span style="font-size: 0.45rem; color: var(--accent-dim); padding: 1px 4px; background: var(--bg2); border-radius: 8px;">${literacyLabel}</span>` : ''}
                                ${salaryLabel ? `<span style="font-size: 0.45rem; color: var(--success); padding: 1px 4px; background: var(--bg2); border-radius: 8px;">${salaryLabel}</span>` : ''}
                                ${stats.totalCharacters > 0 ? `<span style="font-size: 0.5rem; color: var(--dim);">👥 ${stats.totalCharacters}</span>` : ''}
                            </div>
                            <div style="font-size: 0.5rem; color: var(--dim);">
                                ${role.notes ? _escapeHtml(role.notes.substring(0, 20)) : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            html += `</div></div>`;
        }
        
        container.innerHTML = html;
        
        // Attach click handlers for category headers (collapse/expand)
        const headers = container.querySelectorAll('.role-category-header');
        for (const header of headers) {
            if (header._handlerAttached) continue;
            header._handlerAttached = true;
            header.onclick = function(e) {
                e.stopPropagation();
                const catId = this.dataset.category;
                const children = container.querySelector(`.role-category-children[data-category="${catId}"]`);
                const icon = this.querySelector('span:last-child');
                if (children && icon) {
                    const isHidden = children.style.display === 'none';
                    children.style.display = isHidden ? 'block' : 'none';
                    icon.textContent = isHidden ? '▼' : '▶';
                    _rolesTabUIState.collapsedCategories[catId] = !isHidden;
                    _saveUIState();
                }
            };
        }
        
        // Attach click handlers for role nodes
        const nodes = container.querySelectorAll('.role-node');
        for (const node of nodes) {
            if (node._handlerAttached) continue;
            node._handlerAttached = true;
            node.onclick = function(e) {
                e.stopPropagation();
                const roleId = this.dataset.roleId;
                if (roleId) {
                    _rolesTabUIState.selectedId = roleId;
                    _saveUIState();
                    
                    // Re-render to update selection highlighting
                    renderRolesTab(containerId, onSelectRole);
                    
                    if (onSelectRole && typeof onSelectRole === 'function') {
                        onSelectRole(roleId);
                    }
                }
            };
        }
    }
    
    // =========================================================================
    // 6. FILTER UI - RENDER FILTER CONTROLS
    // =========================================================================
    
    function renderRolesFilterUI(containerId, onFilterChange) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        _loadState();
        
        const categories = _getCategories();
        const categoryOptions = Object.entries(categories).map(([id, cat]) => 
            `<option value="${id}" ${_rolesTabUIState.filterCategory === id ? 'selected' : ''}>${cat.icon || '⌇'} ${cat.name}</option>`
        ).join('');
        
        container.innerHTML = `
            <div class="roles-filter-bar" style="padding: 6px 10px; background: var(--bg2); border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                    <input type="text" id="roleSearchFilter" placeholder="Search roles..." 
                           value="${_escapeHtml(_rolesTabUIState.searchTerm)}" 
                           style="flex: 2; min-width: 100px; padding: 4px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">
                    <select id="roleCategoryFilter" style="flex: 1; min-width: 80px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">
                        <option value="all">All Categories</option>
                        ${categoryOptions}
                    </select>
                    <select id="roleGenderFilter" style="flex: 0.8; min-width: 70px; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">
                        <option value="all" ${_rolesTabUIState.filterGender === 'all' ? 'selected' : ''}>All Genders</option>
                        <option value="both" ${_rolesTabUIState.filterGender === 'both' ? 'selected' : ''}>Both</option>
                        <option value="male" ${_rolesTabUIState.filterGender === 'male' ? 'selected' : ''}>Male</option>
                        <option value="female" ${_rolesTabUIState.filterGender === 'female' ? 'selected' : ''}>Female</option>
                    </select>
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 0.55rem; cursor: pointer; padding: 2px 6px; background: var(--bg); border-radius: 4px;">
                        <input type="checkbox" id="roleMasterOnly" ${_rolesTabUIState.filterMasterOnly ? 'checked' : ''}> Masters
                    </label>
                    <button id="clearRoleFiltersBtn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--dim);">✕</button>
                </div>
            </div>
        `;
        
        // Attach event handlers
        const searchInput = document.getElementById('roleSearchFilter');
        const categoryFilter = document.getElementById('roleCategoryFilter');
        const genderFilter = document.getElementById('roleGenderFilter');
        const masterOnlyCheck = document.getElementById('roleMasterOnly');
        const clearBtn = document.getElementById('clearRoleFiltersBtn');
        
        function updateAndRefresh() {
            _rolesTabUIState.searchTerm = searchInput?.value || '';
            _rolesTabUIState.filterCategory = categoryFilter?.value || 'all';
            _rolesTabUIState.filterGender = genderFilter?.value || 'all';
            _rolesTabUIState.filterMasterOnly = masterOnlyCheck?.checked || false;
            _saveUIState();
            if (onFilterChange) onFilterChange();
        }
        
        if (searchInput) {
            searchInput.addEventListener('input', updateAndRefresh);
        }
        if (categoryFilter) {
            categoryFilter.addEventListener('change', updateAndRefresh);
        }
        if (genderFilter) {
            genderFilter.addEventListener('change', updateAndRefresh);
        }
        if (masterOnlyCheck) {
            masterOnlyCheck.addEventListener('change', updateAndRefresh);
        }
        if (clearBtn) {
            clearBtn.onclick = function() {
                if (searchInput) searchInput.value = '';
                if (categoryFilter) categoryFilter.value = 'all';
                if (genderFilter) genderFilter.value = 'all';
                if (masterOnlyCheck) masterOnlyCheck.checked = false;
                _rolesTabUIState.searchTerm = '';
                _rolesTabUIState.filterCategory = 'all';
                _rolesTabUIState.filterGender = 'all';
                _rolesTabUIState.filterMasterOnly = false;
                _saveUIState();
                if (onFilterChange) onFilterChange();
            };
        }
    }
    
    // =========================================================================
    // 7. RENDER RIGHT PANEL (EDIT VIEW) - Using RoleUI when available
    // =========================================================================
    
    function renderRoleDetailTab(containerId, roleId, onBack, onRefresh) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Use RoleUI.renderRoleDetailPanel if available
        if (window.RoleUI && typeof window.RoleUI.renderRoleDetailPanel === 'function') {
            window.RoleUI.renderRoleDetailPanel(containerId, roleId, onBack, onRefresh);
            return;
        }
        
        // Fallback rendering
        const role = _getRoleById(roleId);
        if (!role) {
            container.innerHTML = '<div class="empty-detail" style="text-align: center; padding: 40px; color: var(--dim);">Role not found</div>';
            return;
        }
        
        const stats = typeof window.RoleQueries?.getRoleStatistics === 'function'
            ? window.RoleQueries.getRoleStatistics(roleId)
            : (typeof window.getRoleStatistics === 'function'
                ? window.getRoleStatistics(roleId)
                : { totalCharacters: 0, masterCount: 0, expertCount: 0, journeymanCount: 0, apprenticeCount: 0, noviceCount: 0 });
        
        const categories = _getCategories();
        
        container.innerHTML = `
            <div class="role-detail-panel" style="padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 6px;">
                    <button id="backToRolesBtn" class="btn small" style="padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 0.55rem;">← Back</button>
                    <h3 style="margin: 0; font-size: 0.75rem; color: var(--accent);">${_escapeHtml(role.name)}</h3>
                    <button id="deleteRoleBtn" class="btn danger small" style="padding: 4px 10px; background: rgba(139,64,64,0.2); border: 1px solid #8a3020; border-radius: 4px; color: #c08080; cursor: pointer; font-size: 0.55rem;">✗ Delete</button>
                </div>
                
                <form id="roleDetailForm">
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Role Name</label>
                        <input type="text" id="roleName" value="${_escapeHtml(role.name)}" required style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Category</label>
                        <select id="roleCategory" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">
                            ${Object.entries(categories).map(([id, cat]) => 
                                `<option value="${id}" ${role.category === id ? 'selected' : ''}>${cat.icon || '⌇'} ${cat.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Gender Restriction</label>
                        <select id="roleGender" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">
                            <option value="both" ${role.genderRestriction === 'both' ? 'selected' : ''}>⚥ Both Genders</option>
                            <option value="male" ${role.genderRestriction === 'male' ? 'selected' : ''}>♂ Male Only</option>
                            <option value="female" ${role.genderRestriction === 'female' ? 'selected' : ''}>♀ Female Only</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Icon</label>
                        <input type="text" id="roleIcon" value="${role.icon || '◉'}" maxlength="2" style="width: 50px; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Base Salary (gold/year)</label>
                        <input type="number" id="roleSalary" value="${role.baseSalary || 0}" min="0" max="200" style="width: 80px; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text);">
                        <span style="font-size: 0.45rem; color: var(--dim); margin-left: 6px;">0 = no salary</span>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 0.55rem; color: var(--accent); cursor: pointer;">
                            <input type="checkbox" id="roleRequiresLiteracy" ${role.requiresLiteracy ? 'checked' : ''}>
                            Requires Literacy
                        </label>
                        <div id="literacyLevelContainer" style="${role.requiresLiteracy ? '' : 'display: none;'} margin-top: 4px;">
                            <select id="roleLiteracyLevel" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">
                                <option value="basic" ${role.literacyLevel === 'basic' ? 'selected' : ''}>Basic</option>
                                <option value="literate" ${role.literacyLevel === 'literate' ? 'selected' : ''}>Literate</option>
                                <option value="educated" ${role.literacyLevel === 'educated' ? 'selected' : ''}>Educated</option>
                                <option value="scholar" ${role.literacyLevel === 'scholar' ? 'selected' : ''}>Scholar</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Specializations</label>
                        <div id="specsList" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;">
                            ${(role.specializations || []).map((spec, i) => `
                                <span style="display: inline-flex; align-items: center; gap: 3px; background: var(--bg3); padding: 2px 6px; border-radius: 10px; font-size: 0.55rem;">
                                    ${_escapeHtml(spec)}
                                    <button type="button" class="remove-spec" data-index="${i}" style="background: none; border: none; cursor: pointer; color: var(--dim); font-size: 0.55rem;">✖</button>
                                </span>
                            `).join('') || '<span style="font-size: 0.55rem; color: var(--dim);">No specializations</span>'}
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <input type="text" id="newSpec" placeholder="New specialization..." style="flex: 1; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">
                            <button type="button" id="addSpecBtn" class="btn small" style="padding: 2px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 0.5rem;">+ Add</button>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.55rem; color: var(--accent); margin-bottom: 2px;">Notes</label>
                        <textarea id="roleNotes" rows="2" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem; color: var(--text); resize: vertical;">${_escapeHtml(role.notes || '')}</textarea>
                    </div>
                    
                    <div style="margin: 10px 0; padding: 8px 10px; background: var(--bg2); border-radius: 4px;">
                        <div style="font-size: 0.55rem; color: var(--accent); margin-bottom: 4px;">Statistics</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 4px; font-size: 0.55rem; color: var(--dim);">
                            <div>👥 ${stats.totalCharacters}</div>
                            <div>◉ ${stats.masterCount}</div>
                            <div>◉ ${stats.expertCount}</div>
                            <div>⌇ ${stats.journeymanCount}</div>
                            <div>⌇ ${stats.apprenticeCount}</div>
                            <div>⌇ ${stats.noviceCount}</div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border);">
                        <button type="submit" class="btn primary" style="padding: 6px 12px; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; color: var(--accent); cursor: pointer; font-size: 0.6rem;">✓ Save</button>
                        <button type="button" id="assignRoleBtn" class="btn" style="padding: 6px 12px; background: #4a9060; border: 1px solid var(--success); border-radius: 4px; color: var(--success); cursor: pointer; font-size: 0.6rem;">Assign</button>
                        <button type="button" id="viewCharactersBtn" class="btn" style="padding: 6px 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 0.6rem;">Holders (${stats.totalCharacters})</button>
                        <button type="button" id="cancelEditBtn" class="btn" style="padding: 6px 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 0.6rem;">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        // Literacy checkbox handler
        const literacyCheckbox = document.getElementById('roleRequiresLiteracy');
        const literacyContainer = document.getElementById('literacyLevelContainer');
        if (literacyCheckbox && literacyContainer) {
            literacyCheckbox.onchange = function() {
                literacyContainer.style.display = this.checked ? 'block' : 'none';
            };
        }
        
        // Attach handlers
        const backBtn = document.getElementById('backToRolesBtn');
        if (backBtn) backBtn.onclick = function() { if (onBack) onBack(); };
        
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.onclick = function() { if (onBack) onBack(); };
        
        const deleteBtn = document.getElementById('deleteRoleBtn');
        if (deleteBtn) {
            deleteBtn.onclick = function() {
                if (confirm(`Delete role "${role.name}" permanently?`)) {
                    if (typeof window.RoleCommands?.deleteRole === 'function') {
                        window.RoleCommands.deleteRole(roleId, true);
                        _saveMasterData();
                        if (onBack) onBack();
                    } else if (typeof window.deleteRole === 'function') {
                        window.deleteRole(roleId);
                        _saveMasterData();
                        if (onBack) onBack();
                    }
                }
            };
        }
        
        const assignBtn = document.getElementById('assignRoleBtn');
        if (assignBtn) {
            assignBtn.onclick = function() {
                if (typeof window.openAssignRoleModal === 'function') {
                    window.openAssignRoleModal(roleId, function() {
                        if (onRefresh) onRefresh();
                        renderRoleDetailTab(containerId, roleId, onBack, onRefresh);
                    });
                } else {
                    _showToast('Assign role not available', 'error');
                }
            };
        }
        
        const viewBtn = document.getElementById('viewCharactersBtn');
        if (viewBtn) {
            viewBtn.onclick = function() {
                if (typeof window.openViewCharactersWithRoleModal === 'function') {
                    window.openViewCharactersWithRoleModal(roleId);
                } else {
                    _showToast('View characters not available', 'error');
                }
            };
        }
        
        const form = document.getElementById('roleDetailForm');
        if (form) {
            form.onsubmit = function(e) {
                e.preventDefault();
                const newName = document.getElementById('roleName').value.trim();
                if (!newName) {
                    _showToast('Role name is required', 'error');
                    return;
                }
                
                // Collect specializations from the DOM
                const specItems = document.querySelectorAll('.spec-item');
                const specializations = [];
                for (const item of specItems) {
                    const text = item.childNodes[0]?.textContent?.trim();
                    if (text) specializations.push(text);
                }
                
                const requiresLiteracy = document.getElementById('roleRequiresLiteracy').checked;
                const literacyLevel = requiresLiteracy ? document.getElementById('roleLiteracyLevel').value : null;
                
                const updates = {
                    name: newName,
                    category: document.getElementById('roleCategory').value,
                    genderRestriction: document.getElementById('roleGender').value,
                    icon: document.getElementById('roleIcon').value || '◉',
                    specializations: specializations,
                    notes: document.getElementById('roleNotes').value,
                    baseSalary: parseInt(document.getElementById('roleSalary').value) || 0,
                    requiresLiteracy: requiresLiteracy,
                    literacyLevel: literacyLevel
                };
                
                let saved = false;
                if (window.RoleCommands && typeof window.RoleCommands.updateRole === 'function') {
                    saved = window.RoleCommands.updateRole(roleId, updates);
                } else if (typeof window.updateRole === 'function') {
                    saved = window.updateRole(roleId, updates);
                }
                
                if (saved) {
                    _saveMasterData();
                    _showToast('Role saved', 'success');
                    if (onRefresh) onRefresh();
                    if (onBack) onBack();
                }
            };
        }
        
        const addSpecBtn = document.getElementById('addSpecBtn');
        if (addSpecBtn) {
            addSpecBtn.onclick = function() {
                const newSpec = document.getElementById('newSpec')?.value.trim();
                if (newSpec) {
                    if (!role.specializations) role.specializations = [];
                    if (!role.specializations.includes(newSpec)) {
                        role.specializations.push(newSpec);
                        if (window.RoleCommands && typeof window.RoleCommands.updateRole === 'function') {
                            window.RoleCommands.updateRole(roleId, { specializations: role.specializations });
                        } else if (typeof window.updateRole === 'function') {
                            window.updateRole(roleId, { specializations: role.specializations });
                        }
                        _saveMasterData();
                        renderRoleDetailTab(containerId, roleId, onBack, onRefresh);
                    } else {
                        _showToast('Specialization already exists', 'error');
                    }
                    document.getElementById('newSpec').value = '';
                }
            };
        }
        
        document.querySelectorAll('.remove-spec').forEach(function(btn) {
            btn.onclick = function() {
                const idx = parseInt(this.dataset.index);
                if (!isNaN(idx)) {
                    role.specializations.splice(idx, 1);
                    if (window.RoleCommands && typeof window.RoleCommands.updateRole === 'function') {
                        window.RoleCommands.updateRole(roleId, { specializations: role.specializations });
                    } else if (typeof window.updateRole === 'function') {
                        window.updateRole(roleId, { specializations: role.specializations });
                    }
                    _saveMasterData();
                    renderRoleDetailTab(containerId, roleId, onBack, onRefresh);
                }
            };
        });
    }
    
    // =========================================================================
    // 8. PUBLIC API - Selection and Refresh
    // =========================================================================
    
    function getSelectedRoleId() {
        return _rolesTabUIState.selectedId;
    }
    
    function clearRoleSelection() {
        _rolesTabUIState.selectedId = null;
        _saveUIState();
    }
    
    function selectRoleInTree(roleId, containerId, onSelectRole) {
        if (!roleId) return;
        _rolesTabUIState.selectedId = roleId;
        _saveUIState();
        if (containerId) {
            renderRolesTab(containerId, onSelectRole);
        }
    }
    
    function refreshRolesTree(containerId, onSelectRole) {
        renderRolesTab(containerId, onSelectRole);
    }
    
    // =========================================================================
    // 9. EXPORTS
    // =========================================================================
    
    window.renderRolesTab = renderRolesTab;
    window.renderRoleDetailTab = renderRoleDetailTab;
    window.renderRolesFilterUI = renderRolesFilterUI;
    window.getSelectedRoleId = getSelectedRoleId;
    window.clearRoleSelection = clearRoleSelection;
    window.selectRoleInTree = selectRoleInTree;
    window.refreshRolesTree = refreshRolesTree;
    
    // Initialize state
    _loadState();

})();