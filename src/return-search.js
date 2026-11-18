export const returnSearchKey=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
export function returnIdentifiers(row){return [...new Set([row.marketplaceOrderId,row.id,row.trackingNumber,row.externalPackageId,...(row.trackingNumbers||[]),...(row.externalPackageIds||[])].filter(Boolean).map(returnSearchKey))];}
export function searchReturnOrders(rows,query){
 const key=returnSearchKey(query);if(key.length<3)return [];
 return rows.filter(row=>returnIdentifiers(row).some(id=>id.endsWith(key))).sort((a,b)=>Number(returnIdentifiers(b).includes(key))-Number(returnIdentifiers(a).includes(key))||String(a.marketplaceOrderId||a.id).localeCompare(String(b.marketplaceOrderId||b.id)));
}
export function uniqueReturnOrder(rows,query){const matches=searchReturnOrders(rows,query),key=returnSearchKey(query),exact=matches.filter(row=>returnIdentifiers(row).includes(key));return exact.length===1?exact[0]:matches.length===1?matches[0]:null;}
