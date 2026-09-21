/* Shared presentation helpers accept only the already-filtered player view. */
(function(root){
 'use strict';
 function recentActions(log,role){
  const opponent=role==='plague'?'cure':'plague';
  return (log||[]).filter(x=>x.type==='action'?x.role===opponent:
    (opponent==='cure'?/^人类(?:启动了|在.+用了)/:/^瘟疫(?:进化了|悄悄进化)/).test(x.text||'')).slice(-3).reverse();
 }
 function newsQueue(news){return (news||[]).map((x,i)=>({...x,order:i})).sort((a,b)=>(b.priority||0)-(a.priority||0)||b.day-a.day||b.order-a.order);}
 function dayGroups(log){
  const days=new Map();
  for(const entry of log||[]){
   if(!days.has(entry.day)) days.set(entry.day,{day:entry.day,entries:[],spread:null});
   const group=days.get(entry.day),match=/^瘟疫传到了(.+?)。?$/.exec(entry.text||'');
   if(match){
    if(!group.spread){group.spread={day:entry.day,type:'spread',names:[],text:''};group.entries.push(group.spread);}
    group.spread.names=[...new Set([...group.spread.names,...match[1].split('、')])];
    group.spread.text='瘟疫传到了'+group.spread.names.join('、')+'。';
   }else group.entries.push(entry);
  }
  return [...days.values()].sort((a,b)=>a.day-b.day).map(({day,entries})=>({day,entries}));
 }
 const api={recentActions,newsQueue,dayGroups};
 if(typeof module==='object' && module.exports) module.exports=api;else root.PlaguePresentation=api;
})(typeof window==='object'?window:this);
