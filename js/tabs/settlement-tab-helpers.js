/**
 * =============================================================================
 * SETTLEMENT TAB HELPERS
 * js/tabs/settlement-tab-helpers.js
 * =============================================================================
 *
 * Shared helpers for every settlement-*-tab.js renderer.
 *
 * Centralizes: escapeHtml (strict), icon lookup, toast, number/gold/
 * percent/text formatting, three-way empty-state, and requestRefresh.
 *
 * PLAYBOOK §6 RULE 9: _esc throws if formatting.js is missing. A silent
 * '' fallback is worse than a throw — a missing escapeHtml is a
 * load-order bug that must be visible.
 *
 * PLAYBOOK §6 RULE 5: emptyState is three-way (no-context / no-items /
 * no-matches). Every tab that renders a list uses it.
 *
 * NO CSS. No tab file emits inline style="..." attributes. Every tab
 * emits class names; the manager's <style> block defines them.
 *
 * DEPENDENCIES:
 *   - formatting.js (escapeHtml) — REQUIRED, throws on call if missing
 *   - icons.js (getIcon, Icons)  — soft
 *   - ui.js (showToast)          — soft
 *   - tab-manager.js (TabManager)— soft (for requestRefresh)
 * =============================================================================
 */

(function () {
    'use strict';

    function _esc(value) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'settlement-tab-helpers: window.escapeHtml is missing. ' +
                'Load js/core/formatting.js before any settlement tab.'
            );
        }
        return window.escapeHtml(value);
    }

    function _icon(name) {
        if (!name) return '';
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _unknown() {
        return '<span class="value-unknown">\u2014</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _esc(value.toLocaleString());
    }

    function _fmtGold(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _esc(value.toLocaleString()) + 'g';
    }

    function _fmtPercent(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _esc(String(value)) + '%';
    }

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _esc(value);
    }

    function _emptyState(kind, message) {
        var text;
        if (kind === 'no-context') {
            text = message || 'Select a settlement from the sidebar.';
        } else if (kind === 'no-matches') {
            text = message || 'No items match the current filters.';
        } else {
            text = message || 'No items yet.';
        }
        return '<div class="st-empty">' + _esc(text) + '</div>';
    }

    function _requestRefresh(scope, tabId) {
        if (window.TabManager
            && typeof window.TabManager.requestRender === 'function') {
            window.TabManager.requestRender(scope, tabId);
        }
    }

    window.SettlementTabHelpers = Object.freeze({
        esc: _esc,
        icon: _icon,
        toast: _toast,
        unknown: _unknown,
        fmtNumber: _fmtNumber,
        fmtGold: _fmtGold,
        fmtPercent: _fmtPercent,
        fmtText: _fmtText,
        emptyState: _emptyState,
        requestRefresh: _requestRefresh
    });
})();
