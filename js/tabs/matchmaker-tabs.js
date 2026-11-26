/* Matchmaker tabs: location-grouped romance/friendship and rank-based polygamy. */
(function () {
  'use strict';
  var root = document.getElementById('matchmakerApp');
  if (!root) return;
  var tabs = ['romance', 'friendship', 'polygamy'];
  var active = 'romance';
  var suggestions = { romance: [], friendship: [], polygamy: [] };
  var selected = { romance: new Set(), friendship: new Set() };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function chars() {
    var all = window.CharacterQueries && CharacterQueries.getAllCharacters ? CharacterQueries.getAllCharacters() : [];
    return all.filter(function(c){ return c && !c.isDeceased && !c.isDeleted; }).map(function(c){
      c._age = typeof calculateAge === 'function' ? calculateAge(c.birthYear, getCurrentYear()) : null;
      c._loc = c.currentLocationId || 'unknown';
      return c;
    });
  }
  function name(c){ return [c.name,c.surname].filter(Boolean).join(' '); }
  function locName(id){ var p=window.getPlaceById&&getPlaceById(id); return p&&(p.name||p.title)||id; }
  function relationshipRecords(id){ return window.RelationshipQueries ? RelationshipQueries.getForCharacter(id) : []; }
  function priorEnded(c) {
    return relationshipRecords(c.id).filter(function(r){return r.status==='ended'||r.status==='widowed';});
  }
  function eligiblePair(a,b,kind) {
    if(a.id===b.id) return false;
    if(kind==='friendship') return !(window.FriendshipQueries&&FriendshipQueries.getBetween&&FriendshipQueries.getBetween(a.id,b.id,{activeOnly:true}).length);
    return !(window.RomanceQueries&&RomanceQueries.getRomanticRelationships&&RomanceQueries.getRomanticRelationships(a.id,{activeOnly:true}).some(function(r){return r.partnerId===b.id;}));
  }
  function openPair(a,b,kind){
    if(typeof window.openRelationshipModal!=='function') return;
    openRelationshipModal(a,b,function(){ render(); },{defaultType:kind==='friendship'?'friendship':'committed'});
  }
  function grouped(list, kind) {
    var by={}; list.forEach(function(c){(by[c._loc]||(by[c._loc]=[])).push(c);});
    return Object.keys(by).sort(function(a,b){return locName(a).localeCompare(locName(b));}).map(function(id){
      var groups={}; by[id].sort(function(a,b){return (b._age||0)-(a._age||0);}).forEach(function(c){(groups[c.gender||'unknown']||(groups[c.gender||'unknown']=[])).push(c);});
      return '<section class="mm-location"><h3>'+esc(locName(id))+'</h3><div class="mm-genders">'+Object.keys(groups).sort().map(function(g){return '<div><h4>'+esc(g)+'</h4>'+groups[g].map(function(c){var ended=priorEnded(c);return '<label class="mm-person"><input type="checkbox" data-select="'+kind+'" value="'+esc(c.id)+'" '+(selected[kind].has(c.id)?'checked':'')+'><span>'+esc(name(c))+' <small>'+esc(c._age==null?'Age unknown':c._age)+'</small>'+(ended.length?'<small class="mm-history">↺ Prior relationship</small>':'')+'</span></label>';}).join('')+'</div>';}).join('')+'</div></section>';
    }).join('')||'<p>No eligible characters.</p>';
  }
  function render(){
    var list=chars();
    root.innerHTML='<nav class="mm-tabs">'+tabs.map(function(t){return '<button data-tab="'+t+'" class="'+(active===t?'active':'')+'">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>';}).join('')+'</nav><div class="mm-pane">'+(active==='romance'?'<div class="mm-actions"><button data-action="suggest-romance">Matchmaking: suggest 5</button><button data-action="late-spring">Late Spring: widowed</button><button data-action="match-romance">Match selected</button></div><div class="mm-suggestions">'+suggestionHtml('romance')+'</div>'+grouped(list.filter(function(c){return !(window.RomanceQueries&&RomanceQueries.getRomanticRelationships&&RomanceQueries.getRomanticRelationships(c.id,{activeOnly:true}).length);}), 'romance') : active==='friendship'?'<div class="mm-actions"><button data-action="suggest-friendship">Suggest friends</button><button data-action="match-friendship">Create friendship(s)</button></div><div class="mm-suggestions">'+suggestionHtml('friendship')+'</div>'+grouped(list,'friendship'):polygamyHtml(list))+'</div>';
  }
  function suggestionHtml(kind){return (suggestions[kind]||[]).map(function(s,i){var gap=s.a._age==null||s.b._age==null?'Unknown':Math.abs(s.a._age-s.b._age)+' years';return '<div class="mm-suggestion"><span><strong>'+esc(name(s.a))+'</strong> <small>'+esc(s.a._age==null?'Age unknown':s.a._age)+' · '+esc(locName(s.a._loc))+' · '+esc(s.a.gender||'Gender unknown')+'</small> + <strong>'+esc(name(s.b))+'</strong> <small>'+esc(s.b._age==null?'Age unknown':s.b._age)+' · '+esc(locName(s.b._loc))+' · '+esc(s.b.gender||'Gender unknown')+'</small><small>Age gap: '+esc(gap)+' · '+(s.a._loc===s.b._loc?'Same location':'Different locations')+'</small></span><button data-accept="'+kind+'" data-index="'+i+'">Accept</button><button data-deny="'+kind+'" data-index="'+i+'">Dismiss</button></div>';}).join('');}
  function score(a,b){var gap=Math.abs((a._age||0)-(b._age||0));return (a._loc===b._loc?100:0)-gap+(a.gender!==b.gender?8:0)-priorEnded(a).length*2-priorEnded(b).length*2;}
  function makeSuggestions(kind, candidates, count){var pairs=[];for(var i=0;i<candidates.length;i++)for(var j=i+1;j<candidates.length;j++){var a=candidates[i],b=candidates[j];if(eligiblePair(a,b,kind))pairs.push({a:a,b:b,score:score(a,b)});}pairs.sort(function(x,y){return y.score-x.score;});return pairs.slice(0,count);}
  function polygamyHtml(list){
    var ranks=window.RankQueries&&RankQueries.getAllRanks?RankQueries.getAllRanks():[];
    var allowed={};ranks.forEach(function(r){if(r.allowsMultipleSpouses)allowed[r.id]=r;});
    var eligible=list.filter(function(c){return allowed[c.activeRankId];}).sort(function(a,b){return (b._age||0)-(a._age||0);});
    var singles=list.filter(function(c){return !(window.RomanceQueries&&RomanceQueries.getRomanticRelationships&&RomanceQueries.getRomanticRelationships(c.id,{activeOnly:true}).length);}).sort(function(a,b){return (!!allowed[b.activeRankId]-!!allowed[a.activeRankId])||((b._age||0)-(a._age||0));});
    return '<div class="mm-columns"><section><h3>Ranks permitting multiple spouses</h3>'+eligible.map(function(c){var spouses=window.RomanceQueries&&RomanceQueries.getRomanticRelationships?RomanceQueries.getRomanticRelationships(c.id,{activeOnly:true}):[];return '<label><input type="radio" name="mm-poly-a" value="'+esc(c.id)+'">'+esc(name(c))+' · '+esc(c._age)+' · '+esc(locName(c._loc))+'<small>Spouses: '+(spouses.map(function(s){var p=CharacterQueries.getCharacter(s.partnerId);return p?name(p)+' ('+p._age+')':s.partnerId;}).join(', ')||'None')+'</small></label>';}).join('')+'</section><section><h3>Singles</h3>'+singles.map(function(c){return '<label><input type="radio" name="mm-poly-b" value="'+esc(c.id)+'">'+esc(name(c))+' · '+esc(c._age)+' · '+esc(locName(c._loc))+' · '+esc((allowed[c.activeRankId]&&allowed[c.activeRankId].name)||'No polygamy rank')+'</label>';}).join('')+'</section></div><button data-action="match-polygamy">Match selected</button>';
  }
  root.addEventListener('click',function(e){
    var tab=e.target.closest('[data-tab]');if(tab){active=tab.dataset.tab;render();return;}
    var action=e.target.closest('[data-action]');if(action){var a=action.dataset.action,list=chars();
      if(a==='suggest-romance') suggestions.romance=makeSuggestions('romance',list.filter(function(c){return !(RomanceQueries&&RomanceQueries.getRomanticRelationships(c.id,{activeOnly:true}).length);}),5);
      if(a==='late-spring'){var widowed=list.filter(function(c){return relationshipRecords(c.id).some(function(r){return r.status==='widowed';});});suggestions.romance=makeSuggestions('romance',widowed,5);}
      if(a==='suggest-friendship')suggestions.friendship=makeSuggestions('friendship',list,5);
      if(a==='match-romance'||a==='match-friendship'){var k=a==='match-romance'?'romance':'friendship',ids=Array.from(selected[k]);if(k==='romance'&&ids.length!==2){alert('Select exactly two characters.');return;}if(k==='friendship'&&ids.length<2){alert('Select at least two characters.');return;}for(var i=0;i<ids.length-1;i++)openPair(CharacterQueries.getCharacter(ids[i]),CharacterQueries.getCharacter(ids[i+1]),k);selected[k].clear();}
      if(a==='match-polygamy'){var x=root.querySelector('[name="mm-poly-a"]:checked'),y=root.querySelector('[name="mm-poly-b"]:checked');if(x&&y)openPair(CharacterQueries.getCharacter(x.value),CharacterQueries.getCharacter(y.value),'romance');}
      render();return;
    }
    var accept=e.target.closest('[data-accept]');if(accept){var k=accept.dataset.accept,s=suggestions[k].splice(+accept.dataset.index,1)[0];if(s)openPair(s.a,s.b,k);render();return;}
    var deny=e.target.closest('[data-deny]');if(deny){suggestions[deny.dataset.deny].splice(+deny.dataset.index,1);render();}
  });
  root.addEventListener('change',function(e){var el=e.target;if(!el.dataset.select)return;var k=el.dataset.select;if(el.checked)selected[k].add(el.value);else selected[k].delete(el.value);});
  render();
})();