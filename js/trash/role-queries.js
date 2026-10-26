(function() {
    'use strict';

    function findRoleByName(name) {
        if (!name || typeof name !== 'string') return null;
        var roles = window.getRoles();
        var lower = name.toLowerCase();
        for (var i = 0; i < roles.length; i++) {
            if (roles[i].name && roles[i].name.toLowerCase() === lower) {
                return roles[i];
            }
        }
        return null;
    }

    function getRolesByCategory(categoryId) {
        if (typeof categoryId !== 'string' || categoryId.length === 0) return [];
        var roles = window.getRoles();
        var result = [];
        for (var i = 0; i < roles.length; i++) {
            if (roles[i].category === categoryId) result.push(roles[i]);
        }
        return result;
    }

    window.findRoleByName = findRoleByName;
    window.getRolesByCategory = getRolesByCategory;
})();
