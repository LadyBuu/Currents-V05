(function () {
'use strict';
var SCOPE='events', TAB_ID='crime';
function esc(v){return typeof window.escapeHtml==='function'?window.escapeHtml(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function toast(m,t){if(window.showToast)window.showToast(m,t||'info');}
function refresh(){if(window.TabManager&&window.TabManager.renderActive)window.TabManager.renderActive(SCOPE);}
function name(id){var c=id&&window.getCharacterById?window.getCharacterById(id):null;return c&&(c.name||c.displayName)||'Unknown';}
function placeName(id){var p=window.LocationQueries&&window.LocationQueries.getPlaceById?window.LocationQueries.getPlaceById(id):null;return p&&(p.name||p.displayName)||id;}
function getHouseholds(locationId){
 var L=window.LocationQueries,H=window.HouseholdQueries;if(!L||!H||!H.getHouseholdsByLocation)return [];
 var ids=[locationId];try{var sub=L.getAllSubLocationIds(locationId);if(Array.isArray(sub))sub.forEach(function(id){if(ids.indexOf(id)<0)ids.push(id);});}catch(e){}
 var seen={},out=[];ids.forEach(function(id){var hs=[];try{hs=H.getHouseholdsByLocation(id)||[];}catch(e){}hs.forEach(function(h){if(h&&h.id&&!seen[h.id]){seen[h.id]=1;out.push(h);}});});return out;
}
function render(container,context){
 if(!container)return;
 var scoped=context&&context.locationId||'', selected=scoped||container.__crimeSelectedLocation||'';
 if(!selected&&window.getCurrentLocationId)try{selected=window.getCurrentLocationId()||'';}catch(e){}
 var locationControl=scoped?'<div>Location: <strong>'+esc(placeName(scoped))+'</strong></div>':'<label>Location <select data-crime-location>'+(window.buildLocationDropdown?window.buildLocationDropdown(selected,null,true):'<option value="">Select a location</option>')+'</select></label>';
 var Q=window.CrimeQueries,C=window.CrimeConstants, M=window.CrimeModals;
 var all=selected&&Q&&Q.getCrimesByLocation?Q.getCrimesByLocation(selected)||[]:[];
 var types=C&&C.getAllCrimeTypes?C.getAllCrimeTypes():[];
 var type=container.__crimeType||'',status=container.__crimeStatus||'all';
 var crimes=all.filter(function(c){return(!type||c.type===type)&&(status==='all'||(status==='solved'?!!c.solved:!c.solved));}).sort(function(a,b){return(b.year||0)-(a.year||0);});
 var typeOptions='<option value="">All crime types</option>'+types.map(function(t){return '<option value="'+esc(t)+'" '+(t===type?'selected':'')+'>'+esc(t.replace(/_/g,' '))+'</option>';}).join('');
 var html='<section class="events-crime"><div class="events-crime__toolbar">'+locationControl+
 '<button data-crime-action="create" '+(!selected?'disabled':'')+'>Record Crime</button>'+
 '<button data-crime-action="stats" '+(!selected?'disabled':'')+'>Statistics</button>'+
 '<button data-crime-action="vendetta" '+(!selected?'disabled':'')+'>Record Vendetta</button><button data-crime-action="refresh">Refresh</button></div>';
 if(!selected)html+='<p>Select a location to view or record crimes.</p>';
 else {
 html+='<div class="events-crime__filters"><label>Type <select data-crime-type>'+typeOptions+'</select></label> <label>Status <select data-crime-status><option value="all">All statuses</option><option value="unsolved" '+(status==='unsolved'?'selected':'')+'>Unsolved</option><option value="solved" '+(status==='solved'?'selected':'')+'>Solved</option></select></label></div>';
 html+='<p>'+crimes.length+' of '+all.length+' crime(s)</p><div class="events-crime__list">'+(crimes.length?crimes.map(function(c){return '<article class="events-crime__row"><strong>'+esc(M&&M.formatCrimeType?M.formatCrimeType(c.type):c.type)+'</strong> · '+esc(c.year)+' · '+(c.solved?'Solved':'Unsolved')+' · '+esc(name(c.perpetratorId))+(c.victimId?' → '+esc(name(c.victimId)):'')+(c.reason?'<div>'+esc(c.reason)+'</div>':'')+'<button data-crime-action="details" data-id="'+esc(c.id)+'">Details</button></article>';}).join(''):'<p>No crimes match these filters.</p>')+'</div>';
 var hs=getHouseholds(selected),seen={},vs=[];hs.forEach(function(h){(Q.getVendettasByHousehold?Q.getVendettasByHousehold(h.id,{includeResolved:false}):[]).forEach(function(v){if(v&&!seen[v.id]){seen[v.id]=1;vs.push(v);}});});
 html+='<h3>Active vendettas involving households in this location</h3><div class="events-crime__list">'+(vs.length?vs.map(function(v){return '<article class="events-crime__row"><strong>'+esc(v.cause||'Vendetta')+'</strong> · '+esc(v.year||v.startYear||'')+' · '+esc(v.status||'Active')+'<button data-crime-action="vendetta-details" data-id="'+esc(v.id)+'">Details</button><button data-crime-action="resolve-vendetta" data-id="'+esc(v.id)+'">Resolve</button><button data-crime-action="escalate-vendetta" data-id="'+esc(v.id)+'">Escalate</button></article>';}).join(''):'<p>No active vendettas found.</p>')+'</div>';
 }
 html+='</section>';container.innerHTML=html;
 if(container.__crimeWired)return;container.__crimeWired=true;
 container.addEventListener('change',function(e){if(e.target.matches('[data-crime-location]'))container.__crimeSelectedLocation=e.target.value;if(e.target.matches('[data-crime-type]'))container.__crimeType=e.target.value;if(e.target.matches('[data-crime-status]'))container.__crimeStatus=e.target.value;if(e.target.matches('[data-crime-location],[data-crime-type],[data-crime-status]'))refresh();});
 container.addEventListener('click',function(e){var b=e.target.closest('[data-crime-action]');if(!b)return;var action=b.dataset.crimeAction,id=b.dataset.id,loc=scoped||container.__crimeSelectedLocation||selected;
 if(action==='refresh'){refresh();return;}
 if(action==='create'&&M&&M.openCreateCrimeModal){M.openCreateCrimeModal({locationId:loc,onComplete:refresh});return;}
 if(action==='stats'&&M&&M.openCrimeStatsModal){M.openCrimeStatsModal(loc);return;}
 if(action==='details'&&M&&M.openCrimeDetailsModal){M.openCrimeDetailsModal(id);return;}
 if(action==='vendetta'&&M&&M.openVendettaModal){var ids=getHouseholds(loc).map(function(h){return h.id;});M.openVendettaModal({locationId:loc,settlementHouseholdIds:ids,onComplete:refresh});return;}
 if(action==='vendetta-details'&&M&&M.openVendettaDetailsModal){M.openVendettaDetailsModal(id);return;}
 if(action==='resolve-vendetta'||action==='escalate-vendetta'){var cmd=window.CrimeCommands;if(!cmd){toast('Crime commands unavailable.','error');return;}var result;if(action==='resolve-vendetta'){var resolution=window.prompt('Resolution');if(resolution===null)return;result=cmd.resolveVendetta(id,{resolution:resolution});}else result=cmd.escalateVendetta(id,{});if(!result||result.success===false){toast(result&&result.reason||'Vendetta action failed.','error');return;}refresh();}
 });
 container.__crimeSelectedLocation=selected;
}
if(window.TabManager&&window.TabManager.register)window.TabManager.register(SCOPE,TAB_ID,render);
window.EventsCrimeTab={id:TAB_ID,render:render};
})();