/* Pure UI interaction helpers, testable without a browser. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.RWTUX=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function isBackSwipe(x0,y0,x1,y1){
   const dx=x1-x0,dy=y1-y0;
   return dx<=-70&&Math.abs(dy)<=Math.min(65,Math.abs(dx)*0.5);
 }
 function insertionIndex(midpoints,y){
   const index=midpoints.findIndex(mid=>y<mid);
   return index<0?midpoints.length:index;
 }
 function moveById(items,id,destination){
   if(!Array.isArray(items)||!Number.isInteger(destination)||destination<0||destination>=items.length)return false;
   const from=items.findIndex(item=>item.id===id);
   if(from<0||from===destination)return false;
   const [item]=items.splice(from,1);
   items.splice(destination,0,item);
   return true;
 }
 return {isBackSwipe,insertionIndex,moveById};
});
