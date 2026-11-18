const key=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
export function isReturnedOrder(tx){return tx?.returnCompleted===true || key(tx?.orderOutcome)==='returned' || [tx?.statusPencairan,tx?.statusDataMarketplace].some(status=>['retur','returpengembalian','dikembalikan','pengembalian','dibatalkan','batal','cancelled','canceled','returned'].includes(key(status)));}
export function activeDashboardOrders(rows){return (rows||[]).filter(row=>!isReturnedOrder(row));}
