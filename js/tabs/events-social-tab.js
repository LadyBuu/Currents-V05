(function () {
    'use strict';
    var SCOPE = 'events', TAB_ID = 'social';
    var TYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var SOCIAL = [TYPES.FRIENDSHIP || 'friendship', TYPES.RIVALRY || 'rivalry', TYPES.ENMITY || 'enmity'];
    function esc(v) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
    function chars() { return typeof window.getCharacters === 'function' ? window.getCharacters() || [] : []; }
    function name(id) { var c=window.getCharacterById && window.getCharacterById(id); return c ? [c.name,c.surname].filter(Boolean).join(' ') : id; }
    function charLocation(c) { return c && (c.locationId || c.currentLocationId || c.placeId || c.location); }
    function locLabel(id) { var p=window.LocationQueries && window.LocationQueries.getPlaceById && window.LocationQueries.getPlaceById(id); return p && (p.name || p.displayName) || id; }
    function activeSocial() {
        var all=window.RelationshipQueries && window.RelationshipQueries.getActive ? window.RelationshipQueries.getActive() : [];
        return all.filter(function(r){return SOCIAL.indexOf(r.type)!==-1;});
    }
    function refresh(){ if(window.TabManager && window.TabManager.renderActive) window.TabManager.renderActive(SCOPE); }
    function openPair(a,b,type) {
        if(!window.openRelationshipModal){ toast('Relationship creation modal is unavailable.','error'); return; }
        window.openRelationshipModal(a,b,refresh,{defaultType:type});
    }
    function toast(m,t){ if(window.showToast) window.showToast(m,t||'info'); else if(window._showToast) window._showToast(m,t||'info'); }
    function render(container,context) {
        if(!container) return;
        var scopedId=context && context.locationId || '';
        var locs=typeof window.getPlaces==='function' ? window.getPlaces()||[] : [];
        var selected=container.__socialLocation || scopedId || '';
        var selectedOptions='<option value="">Choose location</option>'+locs.map(function(p){var id=p.id||p.placeId;return id?'<option value="'+esc(id)+'" '+(id===selected?'selected':'')+'>'+esc(p.name||p.displayName||id)+'</option>':'';}).join('');
        var filtered=chars().filter(function(c){return !container.__socialLimit || !selected || String(charLocation(c)||'')===String(selected);});
        var records=activeSocial().filter(function(r){
            if(!container.__socialLimit || !selected) return true;
            var a=window.getCharacterById && window.getCharacterById(r.participantA), b=window.getCharacterById && window.getCharacterById(r.participantB);
            return String(charLocation(a)||'')===String(selected) && String(charLocation(b)||'')===String(selected);
        });
        var labels={friendship:'Friendship',rivalry:'Rivalry',enmity:'Enmity'};
        var html='<section class="events-social"><div class="events-social__bar"><label><input type="checkbox" data-social-limit '+(container.__socialLimit?'checked':'')+'> Limit to location</label><select data-social-location '+(container.__socialLimit?'':'disabled')+'>'+selectedOptions+'</select><select data-social-a><option value="">Character A</option>'+filtered.map(function(x){return '<option value="'+esc(x.id)+'">'+esc([x.name,x.surname].filter(Boolean).join(' '))+'</option>';}).join('')+'</select><select data-social-b><option value="">Character B</option>'+filtered.map(function(x){return '<option value="'+esc(x.id)+'">'+esc([x.name,x.surname].filter(Boolean).join(' '))+'</option>';}).join('')+'</select><select data-social-type><option value="friendship">Friendship</option><option value="rivalry">Rivalry</option><option value="enmity">Enmity</option></select><button data-social-action="create">Create relationship</button><button data-social-action="random">Random pair</button><button data-social-action="refresh">Refresh</button></div><p class="events-social__muted">'+records.length+' active social relationship(s)</p><div>'+ (records.length?records.map(function(r){return '<article class="events-social__row"><strong>'+esc(labels[r.type]||r.type)+'</strong> · '+esc(name(r.participantA))+' ↔ '+esc(name(r.participantB))+(r.startYear!=null?' · since '+esc(r.startYear):'')+'</article>';}).join(''):'<p class="events-social__muted">No active social relationships match this view.</p>')+'</div></section>';
        container.innerHTML=html;
        if(container.__socialWired)return;
        container.__socialWired=true;
        container.addEventListener('change',function(e){
            if(e.target.matches('[data-social-limit]')){container.__socialLimit=e.target.checked;}
            if(e.target.matches('[data-social-location]'))container.__socialLocation=e.target.value;
            refresh();
        });
        container.addEventListener('click',function(e){
            var b=e.target.closest('[data-social-action]'); if(!b)return;
            var pool=chars().filter(function(c){return c && c.id && (!container.__socialLimit || !container.__socialLocation || String(charLocation(c)||'')===String(container.__socialLocation));});
            if(b.dataset.socialAction==='refresh'){refresh();return;}
            if(pool.length<2){toast('At least two characters are required in the selected scope.','warning');return;}
            var a,bchar,type;
            if(b.dataset.socialAction==='random'){
                var i=Math.floor(Math.random()*pool.length), j=Math.floor(Math.random()*(pool.length-1)); if(j>=i)j++;
                a=pool[i];bchar=pool[j];type=SOCIAL[Math.floor(Math.random()*SOCIAL.length)];
            } else {
                var aid=container.querySelector('[data-social-a]').value, bid=container.querySelector('[data-social-b]').value;
                a=pool.find(function(x){return x.id===aid;}); bchar=pool.find(function(x){return x.id===bid;}); type=container.querySelector('[data-social-type]').value;
                if(!a||!bchar||a.id===bchar){toast('Choose two different characters.','warning');return;}
            }
            openPair(a,bchar,type);
        });
    }
    if(window.TabManager && window.TabManager.register)window.TabManager.register(SCOPE,TAB_ID,render);
    window.EventsSocialTab={id:TAB_ID,render:render};
})();