import {ref,onMounted,onBeforeUnmount,watch,nextTick} from 'vue';
export function prepareMobileContent(root){
 if(!root)return;
 root.querySelectorAll('.fixed.inset-0').forEach(layer=>{if(layer.tagName==='DIV'&&layer.classList.contains('flex')&&(layer.className.includes('bg-black')||layer.className.includes('bg-slate-950'))){layer.dataset.mobileDialog='';Array.from(layer.children).filter(child=>child.tagName==='DIV').forEach(panel=>{panel.dataset.mobilePanel='';});}});
 root.querySelectorAll('.fashion-main-stage table,[data-mobile-panel] table').forEach(table=>{
  const headers=table.tHead?.rows,rows=[...Array.from(table.tBodies).flatMap(body=>Array.from(body.rows)),...Array.from(table.tFoot?.rows||[])];
  const head=headers?.length===1?Array.from(headers[0].cells):[];
  const simple=head.length>0&&head.every(cell=>cell.colSpan===1&&cell.rowSpan===1)&&rows.every(row=>Array.from(row.cells).every(cell=>cell.rowSpan===1)&&Array.from(row.cells).reduce((sum,cell)=>sum+cell.colSpan,0)<=head.length);
  if(!simple){delete table.dataset.mobileCards;if(table.parentElement?.tagName==='DIV'){table.parentElement.dataset.mobileScroll='';table.parentElement.dataset.mobileScrollLabel='Geser tabel ke samping untuk melihat semua kolom';}return;}
  table.dataset.mobileCards='';
  if(table.parentElement?.querySelectorAll(':scope > table').length===1){delete table.parentElement.dataset.mobileScroll;delete table.parentElement.dataset.mobileScrollLabel;}
  if(table.tHead.querySelector('button,input,select,a,[role=button],.cursor-pointer'))table.dataset.mobileHeadActions='';else delete table.dataset.mobileHeadActions;
  const labels=head.map((cell,index)=>cell.textContent.replace(/\s+/g,' ').trim()||(cell.querySelector('input[type="checkbox"]')?'Pilih':'Kolom '+(index+1)));
  rows.forEach(row=>{let index=0;Array.from(row.cells).forEach(cell=>{if(cell.colSpan>1){cell.dataset.mobileFull='';if(!cell.textContent.trim()&&!cell.children.length)cell.dataset.mobileEmpty='';else delete cell.dataset.mobileEmpty;delete cell.dataset.mobileLabel;delete cell.dataset.mobileActions;}else{delete cell.dataset.mobileFull;delete cell.dataset.mobileEmpty;cell.dataset.mobileLabel=labels[index]||'';if(/^aksi|tindakan$/i.test(labels[index]))cell.dataset.mobileActions='';else delete cell.dataset.mobileActions;}index+=cell.colSpan;});});
 });
}
export function useMobileLayout(){
 const isMobile=ref(false),menuOpen=ref(false),navigation=ref(null),trigger=ref(null);
 let media=null,observer=null,frame=null,lastFocus=null;
 function schedule(){if(!isMobile.value||frame!=null)return;frame=requestAnimationFrame(()=>{frame=null;prepareMobileContent(document.getElementById('app'));});}
 function closeMenu(restore=true){menuOpen.value=false;if(restore&&isMobile.value)nextTick(()=>{(trigger.value||lastFocus)?.focus?.();});}
 function openMenu(){if(!isMobile.value)return;lastFocus=document.activeElement;menuOpen.value=true;nextTick(()=>{navigation.value?.querySelector('.sidebar-link-active,button,a')?.focus();});}
 function update(){isMobile.value=media.matches;if(!media.matches)closeMenu(false);schedule();}
 function onKey(event){if(!isMobile.value||!menuOpen.value)return;if(event.key==='Escape'){event.preventDefault();closeMenu();return;}if(event.key!=='Tab')return;const elements=Array.from(navigation.value?.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]')||[]).filter(node=>node.getClientRects().length);if(!elements.length){event.preventDefault();navigation.value?.focus();return;}const first=elements[0],last=elements.at(-1);if(event.shiftKey&&(document.activeElement===first||!navigation.value.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!navigation.value.contains(document.activeElement))){event.preventDefault();first.focus();}}
 watch(menuOpen,value=>{document.documentElement.classList.toggle('fashion-menu-open',value&&isMobile.value);});
 onMounted(()=>{media=window.matchMedia('(max-width: 1023px)');update();if(media.addEventListener)media.addEventListener('change',update);else media.addListener(update);observer=new MutationObserver(schedule);observer.observe(document.getElementById('app'),{subtree:true,childList:true,characterData:true});document.addEventListener('keydown',onKey);});
 onBeforeUnmount(()=>{if(media?.removeEventListener)media.removeEventListener('change',update);else media?.removeListener(update);observer?.disconnect();document.removeEventListener('keydown',onKey);document.documentElement.classList.remove('fashion-menu-open');if(frame!=null)cancelAnimationFrame(frame);});
 return {isMobile,menuOpen,navigation,trigger,openMenu,closeMenu};
}
