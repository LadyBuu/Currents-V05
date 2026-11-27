(function(){'use strict';
var SCOPE='character', TAB_ID='overview';
function esc(v){return window.escapeHtml(String(v==null?'':v));}
function render(container,context){
 if(!container)return;
 var vm=window.CharacterViewModels;
 var model=context&&context.characterId&&vm&&vm.buildOverviewModel(context.characterId);
 if(!model){container.innerHTML='<div class="character-tab-empty">Select a character to view relationships.</div>';return;}
 var labels={family:'Family',romantic:'Romantic',social:'Social',professional:'Professional'},html='';
 Object.keys(labels).forEach(function(key){
  var rows=model.groups[key]||[];
  html+='<section class="character-tab-section is-expanded"><header class="character-tab-section__header"><span>'+labels[key]+'</span><span>'+rows.length+'</span></header><div class="character-tab-section__body">';
  if(!rows.length)html+='<div class="character-tab-empty">No '+labels[key].toLowerCase()+' relationships recorded.</div>';
  rows.forEach(function(r){
   var age=r.age==null?'Age unknown':esc(r.age),rank=r.rank&&(r.rank.display||r.rank.title||r.rank.name||r.rank);
   html+='<div class="character-tab-rank-row"><div class="character-tab-rank-main"><button type="button" class="character-tab-link" data-select-character="'+esc(r.id)+'">'+esc(r.name)+'</button><span class="character-tab-note">'+esc(r.relationship)+' · '+(typeof window.getGenderIcon==='function'?window.getGenderIcon(r.gender):'')+' · '+age+(rank?' · '+esc(rank):'')+'</span></div><span class="character-tab-note">'+esc(r.status)+'</span></div>';
  });
  html+='</div></section>';
 });
 container.innerHTML=html;
 container.addEventListener('click',function(e){var b=e.target.closest('[data-select-character]');if(!b)return;var id=b.getAttribute('data-select-character');if(window.CharacterUIState)window.CharacterUIState.setSelectedCharacterId(id);if(window.CharacterUI&&typeof window.CharacterUI.selectCharacter==='function')window.CharacterUI.selectCharacter(id);else window.dispatchEvent(new CustomEvent('characterSelected',{detail:{characterId:id}}));});
}
if(window.TabManager&&typeof window.TabManager.register==='function')window.TabManager.register(SCOPE,TAB_ID,render);
window.CharacterOverviewTab={id:TAB_ID,render:render};
if(typeof module!=='undefined'&&module.exports)module.exports=window.CharacterOverviewTab;
})();