/**
 * =============================================================================
 * STILL WATERS - CUSTOM ICONS (js/core/icons.js)
 * =============================================================================
 * 
 * LOCATION: js/core/icons.js
 * 
 * All icons are custom SVG paths rendered as inline SVG markup.
 * 
 * USAGE:
 *   <span class="icon">${Icons.CIRCLE}</span>
 * 
 * CONTRACT:
 *   - Icons.X returns TRUSTED inline SVG markup.
 *   - Do NOT concatenate untrusted strings into an icon.
 *   - Do NOT use these to render user-supplied SVG.
 *   - The markup is safe to insert via innerHTML because it contains only
 *     static application-authored SVG.
 * 
 * SEMANTIC MAPPING:
 *   The `getXxxIcon(...)` helpers map domain values to icons.
 *   They are value→asset lookups, not domain logic.
 *   All fallbacks route through Icons.CIRCLE for consistency.
 * 
 * DEPENDENCIES: None.
 * 
 * ICON POLICY: This file is the SINGLE SOURCE for SVG assets.
 * 
 * =============================================================================
 */

(function() {
  'use strict';

  // ===========================================================================
  // 1. INTERNAL HELPERS
  // ===========================================================================

  /**
   * Wraps SVG path content in a standard icon element.
   * Presentation is owned by CSS via `.icon-svg`.
   * 
   * @private
   * @param {string} path - SVG path content
   * @param {string} [viewBox] - Defaults to '0 0 20 20'
   * @param {string} [size] - Defaults to '1em'
   */
  function _createIcon(path, viewBox, size) {
    if (viewBox === undefined || viewBox === null) viewBox = '0 0 20 20';
    if (size === undefined || size === null) size = '1em';
    return '<svg class="icon-svg" viewBox="' + viewBox + '" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' + path + '</svg>';
  }

  function _createIconMulti(paths, viewBox, size) {
    if (viewBox === undefined || viewBox === null) viewBox = '0 0 20 20';
    if (size === undefined || size === null) size = '1em';
    return '<svg class="icon-svg" viewBox="' + viewBox + '" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' + paths.join('') + '</svg>';
  }

  // ===========================================================================
  // 2. ICON DEFINITIONS
  // ===========================================================================

  var Icons = {};

  // ===== BASIC SHAPES =====
  Icons.CIRCLE = _createIcon('<circle cx="10" cy="10" r="5.71" fill="currentColor"/>');
  Icons.CIRCLE_OUTLINE = _createIcon('<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>');
  Icons.CIRCLE_HALF_LEFT = _createIcon('<path d="M10,4.29c-3.15,0-5.71,2.56-5.71,5.71s2.56,5.71,5.71,5.71V4.29Z" fill="currentColor"/>');
  Icons.CIRCLE_HALF_RIGHT = _createIcon('<path d="M10,4.29v11.42c3.15,0,5.71-2.56,5.71-5.71s-2.56-5.71-5.71-5.71Z" fill="currentColor"/>');
  Icons.CIRCLE_QUARTER = _createIcon('<path d="M4.29,10c0,3.15,2.56,5.71,5.71,5.71V4.29c-3.15,0-5.71,2.56-5.71,5.71Z" fill="currentColor"/>');
  Icons.CIRCLE_THREE_QUARTER = _createIcon('<path d="M15.71,10c0-3.15-2.56-5.71-5.71-5.71v11.42c3.15,0,5.71-2.56,5.71-5.71Z" fill="currentColor"/>');
  Icons.CIRCLE_DOT = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="currentColor"/>',
    '<circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);

  // ===== SQUARE VARIANTS =====
  Icons.SQUARE = _createIcon('<rect x="4.29" y="4.29" width="11.42" height="11.42" fill="currentColor"/>');
  Icons.SQUARE_OUTLINE = _createIcon('<rect x="4.29" y="4.29" width="11.42" height="11.42" fill="none" stroke="currentColor" stroke-width="1"/>');
  Icons.DIAMOND = _createIcon('<rect x="4.29" y="4.29" width="11.42" height="11.42" fill="currentColor" transform="rotate(45, 10, 10)"/>');
  Icons.DIAMOND_OUTLINE = _createIcon('<rect x="4.29" y="4.29" width="11.42" height="11.42" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(45, 10, 10)"/>');

  // ===== CROSS / X =====
  Icons.X = _createIconMulti([
    '<line x1="4.6" y1="4.6" x2="15.4" y2="15.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="15.4" y1="4.6" x2="4.6" y2="15.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.X_HEAVY = _createIconMulti([
    '<line x1="4.6" y1="4.6" x2="15.4" y2="15.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<line x1="15.4" y1="4.6" x2="4.6" y2="15.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  ]);
  Icons.CROSS = _createIconMulti([
    '<line x1="10" y1="2.36" x2="10" y2="17.64" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="2.45" y1="10" x2="17.55" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);

  // ===== CHECK / TICK =====
  Icons.CHECK = _createIconMulti([
    '<polyline points="4.66,4.66 15.34,15.34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<polyline points="4.66,15.34 15.34,4.66" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);
  Icons.CHECK_SIMPLE = _createIcon('<polyline points="2.45,10 8.2,15.75 17.55,4.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');

  // ===== ARROWS =====
  Icons.ARROW_UP = _createIcon('<polyline points="10,2.45 4.29,8.16 10,13.87" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.ARROW_DOWN = _createIcon('<polyline points="10,17.55 15.71,11.84 10,6.13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.ARROW_LEFT = _createIcon('<polyline points="2.45,10 8.16,4.29 13.87,10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.ARROW_RIGHT = _createIcon('<polyline points="17.55,10 11.84,15.71 6.13,10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.ARROW_DOUBLE_H = _createIconMulti([
    '<polyline points="2.45,10 8.16,4.29 13.87,10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<polyline points="17.55,10 11.84,15.71 6.13,10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);

  // ===== HEART =====
  Icons.HEART = _createIcon('<path d="M10,17.55C2.86,12.86,2.45,5.45,4.45,3.45c1.73-1.73,4.55-1.2,5.55,0.55,1-1.75,3.82-2.28,5.55-0.55,2,2,1.59,9.41-5.55,14.1Z" fill="currentColor"/>');
  Icons.HEART_OUTLINE = _createIcon('<path d="M10,17.55C2.86,12.86,2.45,5.45,4.45,3.45c1.73-1.73,4.55-1.2,5.55,0.55,1-1.75,3.82-2.28,5.55-0.55,2,2,1.59,9.41-5.55,14.1Z" fill="none" stroke="currentColor" stroke-width="1.5"/>');

  // ===== GENDER =====
  Icons.MALE = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="14.76" y1="5.24" x2="17.07" y2="2.93" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="17.07" y1="5.93" x2="17.07" y2="2.93" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="15.15" y1="2.93" x2="17.07" y2="2.93" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.FEMALE = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="15.71" x2="10" y2="17.93" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="8.2" y1="16.82" x2="11.8" y2="16.82" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.GENDER_NEUTRAL = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="4.29" x2="10" y2="15.71" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
  ]);

  // ===== SPECIAL =====
  Icons.LOCATION = _createIconMulti([
    '<path d="M10,2.86 L4.29,9.29 L4.29,16.43 L15.71,16.43 L15.71,9.29 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<circle cx="10" cy="8.57" r="2.14" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.PERSON = _createIconMulti([
    '<circle cx="10" cy="5.5" r="3" fill="currentColor"/>',
    '<path d="M4.5,18.5c0-3.04,2.46-5.5,5.5-5.5s5.5,2.46,5.5,5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.CROWN = _createIconMulti([
    '<path d="M4.29,17.21h11.42M5.45,14.59L4.29,7.64l3.59,2.92L10,5.29l2.12,5.27l3.59-2.92-1.16,6.95H5.45Z" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.SWORD = _createIconMulti([
    '<line x1="10" y1="4.29" x2="10" y2="15.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="6.13" y1="15.71" x2="13.87" y2="15.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<polygon points="10,2.45 7.14,4.29 12.86,4.29" fill="currentColor"/>'
  ]);
  Icons.BOOK = _createIconMulti([
    '<rect x="4.29" y="4.29" width="11.42" height="11.42" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="4.29" x2="10" y2="15.71" stroke="currentColor" stroke-width="0.5"/>',
    '<line x1="6.13" y1="7.64" x2="13.87" y2="7.64" stroke="currentColor" stroke-width="0.5"/>',
    '<line x1="6.13" y1="10.36" x2="13.87" y2="10.36" stroke="currentColor" stroke-width="0.5"/>'
  ]);
  Icons.GEAR = _createIconMulti([
    '<path d="M10,4.29c-0.8,0-1.55,0.21-2.2,0.58l-0.66-1.58-1.75,1.02,0.71,1.56c-0.72,0.55-1.27,1.29-1.57,2.15l-1.68-0.04-0.06,2.02,1.67,0.08c0.27,0.87,0.8,1.63,1.5,2.2l-0.71,1.55,1.75,1.02,0.66-1.56c0.65,0.35,1.38,0.55,2.15,0.55s1.5-0.2,2.15-0.55l0.66,1.56,1.75-1.02-0.71-1.55c0.7-0.57,1.23-1.33,1.5-2.2l1.67-0.08-0.06-2.02-1.68,0.04c-0.3-0.86-0.85-1.6-1.57-2.15l0.71-1.56-1.75-1.02-0.66,1.58c-0.65-0.37-1.4-0.58-2.2-0.58Z" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.WARNING = _createIconMulti([
    '<path d="M10,4.29L2.45,15.71h15.1l-7.55-11.42Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<line x1="10" y1="8.16" x2="10" y2="12.86" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<circle cx="10" cy="14.59" r="0.71" fill="currentColor"/>'
  ]);
  Icons.STAR_4 = _createIcon('<path d="M10,2.45l2.12,5.43,5.43,2.12-5.43,2.12-2.12,5.43-2.12-5.43-5.43-2.12,5.43-2.12,2.12-5.43Z" fill="currentColor"/>');
  Icons.STAR_4_OUTLINE = _createIcon('<path d="M10,2.45l2.12,5.43,5.43,2.12-5.43,2.12-2.12,5.43-2.12-5.43-5.43-2.12,5.43-2.12,2.12-5.43Z" fill="none" stroke="currentColor" stroke-width="1"/>');
  Icons.STAR = _createIcon('<polygon points="10,2.45 12.12,8.57 18.57,8.57 13.23,12.86 15.34,19.55 10,15.15 4.66,19.55 6.77,12.86 1.43,8.57 7.88,8.57" fill="currentColor"/>');
  Icons.STAR_OUTLINE = _createIcon('<polygon points="10,2.45 12.12,8.57 18.57,8.57 13.23,12.86 15.34,19.55 10,15.15 4.66,19.55 6.77,12.86 1.43,8.57 7.88,8.57" fill="none" stroke="currentColor" stroke-width="1"/>');
  Icons.TRIANGLE_UP = _createIcon('<polygon points="10,2.45 2.45,17.55 17.55,17.55" fill="currentColor" stroke-linejoin="round"/>');
  Icons.TRIANGLE_DOWN = _createIcon('<polygon points="10,17.55 17.55,2.45 2.45,2.45" fill="currentColor" stroke-linejoin="round"/>');

  // ===== UI =====
  Icons.PLUS = _createIconMulti([
    '<line x1="10" y1="4.29" x2="10" y2="15.71" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="4.29" y1="10" x2="15.71" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.MINUS = _createIcon('<line x1="4.29" y1="10" x2="15.71" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>');
  Icons.SEARCH = _createIconMulti([
    '<circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="12.36" y1="12.36" x2="16.64" y2="16.64" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.EDIT = _createIcon('<path d="M12.86,4.29l2.85,2.85-7.5,7.5-3.21,0.36,0.36-3.21,7.5-7.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.TRASH = _createIconMulti([
    '<rect x="6.43" y="7.14" width="7.14" height="9.29" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="4.29" y1="7.14" x2="15.71" y2="7.14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="8.57" y1="4.29" x2="11.43" y2="4.29" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.REFRESH = _createIcon('<path d="M15.34,4.66c2.23,2.23,2.23,5.85,0,8.08s-5.85,2.23-8.08,0-2.23-5.85,0-8.08" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>');
  Icons.UNDO = _createIcon('<path d="M6.13,6.13l-3.68,3.68,3.68,3.68" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.REDO = _createIcon('<path d="M13.87,6.13l3.68,3.68-3.68,3.68" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
  Icons.LOCK = _createIconMulti([
    '<rect x="5.71" y="7.86" width="8.57" height="8.57" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M6.43,7.86v-2.5c0-1.97,1.6-3.57,3.57-3.57s3.57,1.6,3.57,3.57v2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.UNLOCK = _createIconMulti([
    '<rect x="5.71" y="7.86" width="8.57" height="8.57" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M11.43,7.86v-2.5c0-1.97-1.6-3.57-3.57-3.57s-3.57,1.6-3.57,3.57" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.KEY = _createIconMulti([
    '<circle cx="6.43" cy="13.57" r="2.14" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="8.21" y1="11.79" x2="16.64" y2="3.36" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="14.21" y1="5.79" x2="17.07" y2="5.79" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="12.07" y1="7.93" x2="14.93" y2="7.93" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.SHIELD = _createIcon('<path d="M10,2.45l7.5,2.5-2.5,7.5c-1.36,4.09-5,7.5-5,7.5s-3.64-3.41-5-7.5l-2.5-7.5,7.5-2.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>');
  Icons.FLAG = _createIconMulti([
    '<line x1="4.29" y1="4.29" x2="4.29" y2="17.55" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M4.29,4.29h11.42l-4.29,4.29,4.29,4.29H4.29" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);
  Icons.HOME = _createIconMulti([
    '<path d="M18.57,10l-8.57-7.55L1.43,10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<polygon points="4.29,12.86 4.29,17.55 15.71,17.55 15.71,12.86 10,8.16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  ]);

  // ===== RELATIONSHIP =====
  Icons.MARRIAGE = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="4.29" x2="10" y2="15.71" stroke="currentColor" stroke-width="1"/>',
    '<line x1="4.29" y1="10" x2="15.71" y2="10" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.ENGAGEMENT = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="12.5" y1="7.5" x2="15.71" y2="4.29" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.FRIENDSHIP = _createIconMulti([
    '<circle cx="7" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="13" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<path d="M7,12.5c0,1.1,1.34,2,3,2s3-0.9,3-2" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
  ]);

  // ===== STATUS =====
  Icons.STATUS_ACTIVE = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<polyline points="6.13,10 8.8,12.67 13.87,7.33" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);
  Icons.STATUS_PENDING = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="1.43" fill="currentColor"/>'
  ]);
  Icons.STATUS_PROPOSED = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<text x="10" y="12" font-family="sans-serif" font-size="7" font-weight="bold" text-anchor="middle" fill="currentColor">?</text>'
  ]);
  Icons.STATUS_DECLINED = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="6.13" y1="6.13" x2="13.87" y2="13.87" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.STATUS_ENDED = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="6.13" y1="13.87" x2="13.87" y2="6.13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.STATUS_WIDOWED = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="6.13" y1="6.13" x2="13.87" y2="13.87" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="6.13" y1="13.87" x2="13.87" y2="6.13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);

  // ===== LOCATION TYPES =====
  Icons.LOCATION_COUNTRY = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="2.14" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="4.29" x2="10" y2="15.71" stroke="currentColor" stroke-width="0.5"/>',
    '<line x1="4.29" y1="10" x2="15.71" y2="10" stroke="currentColor" stroke-width="0.5"/>'
  ]);
  Icons.LOCATION_REGION = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="2.14" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.LOCATION_COUNTY = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="1.43" fill="currentColor"/>'
  ]);
  Icons.LOCATION_TOWN = _createIconMulti([
    '<rect x="6" y="6" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<rect x="8" y="4" width="4" height="2" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.LOCATION_LOCALITY = _createIconMulti([
    '<rect x="7.14" y="7.14" width="5.71" height="5.71" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);

  // ===== ADOPTION =====
  Icons.ADOPTION_LEGAL = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<polyline points="6.13,10 8.8,12.67 13.87,7.33" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);
  Icons.GUARDIANSHIP = _createIconMulti([
    '<circle cx="10" cy="10" r="5.71" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<circle cx="10" cy="10" r="1.43" fill="currentColor"/>'
  ]);
  Icons.FOSTER = _createIconMulti([
    '<rect x="6" y="6" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>',
    '<line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="0.5"/>'
  ]);

  // ===== DASHBOARD TOOLS =====
  Icons.CHARACTER = _createIconMulti([
    '<circle cx="10" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M4,18c0-3.31,2.69-6,6-6s6,2.69,6,6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<rect x="8.5" y="11" width="3" height="2" fill="currentColor" opacity="0.3"/>',
    '<line x1="10" y1="10.5" x2="10" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
  ]);
  Icons.CENSUS = _createIconMulti([
    '<rect x="3" y="12" width="3" height="6" fill="currentColor" rx="0.5"/>',
    '<rect x="8.5" y="8" width="3" height="10" fill="currentColor" rx="0.5"/>',
    '<rect x="14" y="4" width="3" height="14" fill="currentColor" rx="0.5"/>',
    '<line x1="2" y1="18" x2="18" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
  ]);
  Icons.HOUSEHOLD = _createIconMulti([
    '<path d="M3,11 L10,4 L17,11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="5" y="10" width="10" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<rect x="7.5" y="13" width="2" height="2" fill="currentColor" opacity="0.3"/>',
    '<rect x="11.5" y="13" width="2" height="2" fill="currentColor" opacity="0.3"/>'
  ]);
  Icons.RANK = _createIconMulti([
    '<path d="M4,15 L16,15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M6,15 L4,7 L8,10 L10,5 L12,10 L16,7 L14,15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<circle cx="10" cy="9" r="1.5" fill="currentColor"/>'
  ]);
  Icons.ROLES = _createIconMulti([
    '<circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M10,4 L10,6 M10,14 L10,16 M4,10 L6,10 M14,10 L16,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M6.5,6.5 L7.93,7.93 M12.07,12.07 L13.5,13.5 M6.5,13.5 L7.93,12.07 M12.07,7.93 L13.5,6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.MATCHMAKER = _createIconMulti([
    '<path d="M6,7 C4,5 2,6 2,8.5 C2,11 6,14 6,14 C6,14 10,11 10,8.5 C10,6 8,5 6,7Z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M14,7 C12,5 10,6 10,8.5 C10,11 14,14 14,14 C14,14 18,11 18,8.5 C18,6 16,5 14,7Z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="6" cy="8" r="0.8" fill="currentColor"/>',
    '<circle cx="14" cy="8" r="0.8" fill="currentColor"/>'
  ]);
  Icons.WORLD = _createIconMulti([
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<ellipse cx="10" cy="10" rx="3.5" ry="7" fill="none" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="0.8"/>',
    '<circle cx="10" cy="6.5" r="0.8" fill="currentColor"/>',
    '<circle cx="10" cy="13.5" r="0.8" fill="currentColor"/>'
  ]);
  Icons.EVENTS = _createIconMulti([
    '<path d="M5,10 L8,10 L6,7 L9,7 L7,4 L10,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="3" y="14" width="14" height="3" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<line x1="5" y1="14" x2="5" y2="17" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="15" y1="14" x2="15" y2="17" stroke="currentColor" stroke-width="0.8"/>'
  ]);
  Icons.NAMES = _createIconMulti([
    '<rect x="4" y="3" width="12" height="14" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>',
    '<line x1="6.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>',
    '<line x1="6.5" y1="10" x2="13.5" y2="10" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>',
    '<line x1="6.5" y1="13" x2="11.5" y2="13" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>',
    '<path d="M16,7 L18,5 L18,15 L16,13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);
  Icons.STORK = _createIconMulti([
    '<circle cx="10" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M8,9 C8,12 12,12 12,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M6,14 L14,14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M7,14 L9,18 L11,18 L13,14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  ]);
  Icons.DEATHSTARS = _createIconMulti([
    '<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="7.5" cy="9" r="1.2" fill="currentColor"/>',
    '<circle cx="12.5" cy="9" r="1.2" fill="currentColor"/>',
    '<path d="M8,13 C9,14.5 11,14.5 12,13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="3.5" y1="3.5" x2="5.5" y2="5.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="16.5" y1="3.5" x2="14.5" y2="5.5" stroke="currentColor" stroke-width="0.8"/>'
  ]);
  Icons.FAMILY_TREE = _createIconMulti([
    '<circle cx="10" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="6" cy="10" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="14" cy="10" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="4" cy="16" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="8" cy="16" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="12" cy="16" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="16" cy="16" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="10" y1="6" x2="6" y2="8.2" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="6" x2="14" y2="8.2" stroke="currentColor" stroke-width="1"/>',
    '<line x1="6" y1="11.8" x2="4" y2="14.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="6" y1="11.8" x2="8" y2="14.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="14" y1="11.8" x2="12" y2="14.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="14" y1="11.8" x2="16" y2="14.5" stroke="currentColor" stroke-width="0.8"/>'
  ]);
  Icons.TIMELINE = _createIconMulti([
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<polyline points="10,6 10,10 13,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="4.5" y="3.5" width="11" height="2" fill="none" stroke="currentColor" stroke-width="0.8" rx="0.3"/>',
    '<line x1="5.5" y1="5.5" x2="5.5" y2="3.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="14.5" y1="5.5" x2="14.5" y2="3.5" stroke="currentColor" stroke-width="0.8"/>'
  ]);
  Icons.BULK_IMPORT = _createIconMulti([
    '<path d="M10,4 L10,12 M7,9 L10,12 L13,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="3" y="13" width="14" height="3" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<line x1="5" y1="13" x2="5" y2="16" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>',
    '<line x1="15" y1="13" x2="15" y2="16" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>'
  ]);
  Icons.DIAGNOSTICS = _createIconMulti([
    '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M6,6 L8,8 M12,12 L14,14 M6,14 L8,12 M12,8 L14,6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
    '<circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="10" cy="10" r="0.8" fill="currentColor"/>'
  ]);

  // ===== RANK SYSTEM =====
  Icons.SOVEREIGN = _createIconMulti([
    '<path d="M3,16 L17,16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M5,16 L3,8 L7.5,11 L10,5 L12.5,11 L17,8 L15,16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<circle cx="6" cy="5" r="1" fill="currentColor" opacity="0.6"/>',
    '<circle cx="10" cy="3" r="1" fill="currentColor" opacity="0.6"/>',
    '<circle cx="14" cy="5" r="1" fill="currentColor" opacity="0.6"/>',
    '<circle cx="10" cy="9" r="1.2" fill="currentColor"/>'
  ]);
  Icons.HIGH_NOBLE = _createIconMulti([
    '<path d="M4,15 L16,15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M6,15 L4,9 L8,11 L10,7 L12,11 L16,9 L14,15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<rect x="9" y="8" width="2" height="2" fill="currentColor" transform="rotate(45, 10, 9)"/>'
  ]);
  Icons.NOBLE = _createIconMulti([
    '<path d="M4,15 L16,15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M5,15 L5,12 L15,12 L15,15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<circle cx="7" cy="12" r="1" fill="currentColor"/>',
    '<circle cx="10" cy="12" r="1" fill="currentColor"/>',
    '<circle cx="13" cy="12" r="1" fill="currentColor"/>'
  ]);
  Icons.GENTRY = _createIconMulti([
    '<path d="M3,5 L10,2 L17,5 L17,13 L10,18 L3,13 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    '<path d="M6,9 L10,5 L14,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<circle cx="10" cy="12" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.COMMONER = _createIconMulti([
    '<path d="M3,11 L10,4 L17,11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="5" y="10" width="10" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<rect x="8" y="12" width="4" height="3" fill="none" stroke="currentColor" stroke-width="1"/>'
  ]);
  Icons.RANK_SYMBOL = _createIconMulti([
    '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="10" cy="10" r="2" fill="currentColor"/>',
    '<line x1="10" y1="4" x2="10" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="10" y1="13" x2="10" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="13" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.INHERITANCE = _createIconMulti([
    '<path d="M10,2 L10,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<polyline points="7,7 10,10 13,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<rect x="6" y="12" width="8" height="6" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<line x1="8" y1="14" x2="12" y2="14" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>',
    '<line x1="8" y1="16" x2="11" y2="16" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>'
  ]);
  Icons.NUMBERED_RANK = _createIconMulti([
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<text x="10" y="13" font-family="serif" font-size="10" font-weight="bold" text-anchor="middle" fill="currentColor">VII</text>',
    '<circle cx="10" cy="10" r="1" fill="currentColor" opacity="0.3"/>'
  ]);
  Icons.GENDER_RESTRICTION = _createIconMulti([
    '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    '<path d="M12,12 L14,14 M14,12 L12,14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    '<circle cx="10" cy="10" r="0.8" fill="currentColor"/>'
  ]);
  Icons.SPOUSE_INHERITANCE = _createIconMulti([
    '<circle cx="10" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="10" cy="8" r="1.2" fill="currentColor"/>',
    '<path d="M13,11 L16,14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<path d="M7,11 L4,14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="4" y1="14" x2="16" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.SURNAME_RULE = _createIconMulti([
    '<rect x="4" y="4" width="12" height="4" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<text x="10" y="7.5" font-family="serif" font-size="6" text-anchor="middle" fill="currentColor">Name</text>',
    '<rect x="4" y="12" width="12" height="4" fill="none" stroke="currentColor" stroke-width="1.5" rx="0.5"/>',
    '<text x="10" y="15.5" font-family="serif" font-size="6" text-anchor="middle" fill="currentColor">Location</text>',
    '<path d="M16,14 L18,14" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
  ]);
  Icons.RANK_HIERARCHY = _createIconMulti([
    '<circle cx="10" cy="3" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="5" cy="9" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="15" cy="9" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="3" cy="15" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="7" cy="15" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="13" cy="15" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="17" cy="15" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="10" y1="5" x2="5" y2="7.2" stroke="currentColor" stroke-width="1"/>',
    '<line x1="10" y1="5" x2="15" y2="7.2" stroke="currentColor" stroke-width="1"/>',
    '<line x1="5" y1="10.8" x2="3" y2="13.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="5" y1="10.8" x2="7" y2="13.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="15" y1="10.8" x2="13" y2="13.5" stroke="currentColor" stroke-width="0.8"/>',
    '<line x1="15" y1="10.8" x2="17" y2="13.5" stroke="currentColor" stroke-width="0.8"/>'
  ]);
  Icons.RANK_ANALYTICS = _createIconMulti([
    '<rect x="3" y="10" width="2.5" height="8" fill="currentColor" rx="0.3"/>',
    '<rect x="7.5" y="6" width="2.5" height="12" fill="currentColor" rx="0.3"/>',
    '<rect x="12" y="3" width="2.5" height="15" fill="currentColor" rx="0.3"/>',
    '<rect x="16.5" y="8" width="2.5" height="10" fill="currentColor" rx="0.3"/>',
    '<line x1="2" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
    '<circle cx="10" cy="10" r="0.8" fill="none" stroke="currentColor" stroke-width="0.8"/>'
  ]);
  Icons.HOLDER_STATS = _createIconMulti([
    '<circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    '<circle cx="14" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    '<circle cx="10" cy="14" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    '<path d="M4,9 C4,11.5 8,11.5 8,9" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
    '<path d="M12,9 C12,11.5 16,11.5 16,9" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
    '<text x="10" y="19" font-family="sans-serif" font-size="5" text-anchor="middle" fill="currentColor">12</text>'
  ]);
  Icons.DEPRECATED = _createIconMulti([
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="5.5" y1="5.5" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<line x1="14.5" y1="5.5" x2="5.5" y2="14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  ]);
  Icons.ACTIVE_RANK = _createIconMulti([
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<polyline points="5.5,10 8.5,13 14.5,7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  ]);
  Icons.RANK_ASSIGNMENT = _createIconMulti([
    '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<line x1="10" y1="4" x2="10" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="10" y1="13" x2="10" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<line x1="13" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
  ]);
  Icons.FIX_NUMBERING = _createIconMulti([
    '<path d="M14.5,5.5 C12,3 8,3 5.5,5.5 C3,8 3,12 5.5,14.5 C8,17 12,17 14.5,14.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '<polyline points="14.5,5.5 14.5,2 17.5,3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<text x="10" y="11" font-family="serif" font-size="6" text-anchor="middle" fill="currentColor">VII</text>'
  ]);
  Icons.SYMBOL_PICKER = _createIconMulti([
    '<rect x="2" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1" rx="0.5"/>',
    '<rect x="9" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1" rx="0.5"/>',
    '<rect x="2" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1" rx="0.5"/>',
    '<rect x="9" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1" rx="0.5"/>',
    '<text x="4.5" y="6" font-size="5" text-anchor="middle" fill="currentColor">✦</text>',
    '<text x="11.5" y="6" font-size="5" text-anchor="middle" fill="currentColor">✪</text>',
    '<text x="4.5" y="13" font-size="5" text-anchor="middle" fill="currentColor">♢</text>',
    '<text x="11.5" y="13" font-size="5" text-anchor="middle" fill="currentColor">⌘</text>'
  ]);
  Icons.LEVEL_BADGE = _createIconMulti([
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    '<text x="10" y="13" font-family="sans-serif" font-size="8" font-weight="bold" text-anchor="middle" fill="currentColor">★</text>',
    '<circle cx="4" cy="4" r="1.2" fill="currentColor" opacity="0.5"/>',
    '<circle cx="16" cy="4" r="1.2" fill="currentColor" opacity="0.5"/>',
    '<circle cx="4" cy="16" r="1.2" fill="currentColor" opacity="0.5"/>',
    '<circle cx="16" cy="16" r="1.2" fill="currentColor" opacity="0.5"/>'
  ]);

  // ===========================================================================
  // 3. SEMANTIC HELPERS (value → icon)
  // ===========================================================================
  // These are pure value→asset lookups. They do not do domain logic.
  // All unknown values fall back to Icons.CIRCLE for consistency.

  function getIcon(name, fallback) {
    if (name && Icons[name]) return Icons[name];
    if (fallback && Icons[fallback]) return Icons[fallback];
    return Icons.CIRCLE;
  }

  function getLocationTypeIcon(priority) {
    var map = {
      1: Icons.LOCATION_COUNTRY,
      2: Icons.LOCATION_REGION,
      3: Icons.LOCATION_COUNTY,
      4: Icons.LOCATION_TOWN,
      5: Icons.LOCATION_LOCALITY
    };
    return map[priority] || Icons.LOCATION_LOCALITY;
  }

  function getRelationshipStatusIcon(status) {
    var map = {
      'ongoing': Icons.STATUS_ACTIVE,
      'active': Icons.STATUS_ACTIVE,
      'ended': Icons.STATUS_ENDED,
      'widowed': Icons.STATUS_WIDOWED,
      'pending': Icons.STATUS_PENDING,
      'proposed': Icons.STATUS_PROPOSED,
      'declined': Icons.STATUS_DECLINED
    };
    return map[status] || Icons.CIRCLE;
  }

  function getGenderIcon(gender) {
    var map = {
      'male': Icons.MALE,
      'female': Icons.FEMALE,
      'unknown': Icons.GENDER_NEUTRAL,
      'other': Icons.GENDER_NEUTRAL
    };
    return map[gender] || Icons.GENDER_NEUTRAL;
  }

  function getAdoptionTypeIcon(type) {
    var map = {
      'legal': Icons.ADOPTION_LEGAL,
      'guardianship': Icons.GUARDIANSHIP,
      'foster': Icons.FOSTER
    };
    return map[type] || Icons.CIRCLE;
  }

  function getRankLevelIcon(priority) {
    var map = {
      1: Icons.SOVEREIGN,
      2: Icons.HIGH_NOBLE,
      3: Icons.NOBLE,
      4: Icons.GENTRY,
      5: Icons.COMMONER
    };
    return map[priority] || Icons.RANK_SYMBOL;
  }

  function getRankActionIcon(action) {
    var map = {
      'inheritance': Icons.INHERITANCE,
      'numbered': Icons.NUMBERED_RANK,
      'gender': Icons.GENDER_RESTRICTION,
      'spouse': Icons.SPOUSE_INHERITANCE,
      'surname': Icons.SURNAME_RULE,
      'hierarchy': Icons.RANK_HIERARCHY,
      'analytics': Icons.RANK_ANALYTICS,
      'stats': Icons.HOLDER_STATS,
      'active': Icons.ACTIVE_RANK,
      'deprecated': Icons.DEPRECATED,
      'assign': Icons.RANK_ASSIGNMENT,
      'fix': Icons.FIX_NUMBERING,
      'symbols': Icons.SYMBOL_PICKER,
      'level': Icons.LEVEL_BADGE
    };
    return map[action] || Icons.RANK_SYMBOL;
  }

  function getDashboardToolIcon(tool) {
    var map = {
      'character': Icons.CHARACTER,
      'census': Icons.CENSUS,
      'household': Icons.HOUSEHOLD,
      'rank': Icons.RANK,
      'roles': Icons.ROLES,
      'matchmaker': Icons.MATCHMAKER,
      'world': Icons.WORLD,
      'events': Icons.EVENTS,
      'names': Icons.NAMES,
      'stork': Icons.STORK,
      'deathstars': Icons.DEATHSTARS,
      'family': Icons.FAMILY_TREE,
      'timeline': Icons.TIMELINE,
      'import': Icons.BULK_IMPORT,
      'diagnostics': Icons.DIAGNOSTICS
    };
    return map[tool] || Icons.CIRCLE;
  }

  // ===========================================================================
  // 4. EXPORTS
  // ===========================================================================

  // Attach to window.Icons; merge if it already exists.
  if (typeof window.Icons === 'undefined') {
    window.Icons = Icons;
  } else {
    for (var key in Icons) {
      if (Icons.hasOwnProperty(key) && !window.Icons[key]) {
        window.Icons[key] = Icons[key];
      }
    }
  }

  // Semantic helpers
  window.getIcon = getIcon;
  window.getLocationTypeIcon = getLocationTypeIcon;
  window.getRelationshipStatusIcon = getRelationshipStatusIcon;
  window.getGenderIcon = getGenderIcon;
  window.getAdoptionTypeIcon = getAdoptionTypeIcon;
  window.getRankLevelIcon = getRankLevelIcon;
  window.getRankActionIcon = getRankActionIcon;
  window.getDashboardToolIcon = getDashboardToolIcon;

  // CommonJS for tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      Icons: Icons,
      getIcon: getIcon,
      getLocationTypeIcon: getLocationTypeIcon,
      getRelationshipStatusIcon: getRelationshipStatusIcon,
      getGenderIcon: getGenderIcon,
      getAdoptionTypeIcon: getAdoptionTypeIcon,
      getRankLevelIcon: getRankLevelIcon,
      getRankActionIcon: getRankActionIcon,
      getDashboardToolIcon: getDashboardToolIcon
    };
  }

  if (typeof console !== 'undefined' && console.log) {
    console.log('icons.js loaded - ' + Object.keys(Icons).length + ' custom SVG icons available');
  }

})();