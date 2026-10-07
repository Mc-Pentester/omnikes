'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

type Status = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
interface Supplier { id:string; code:string; name:string; isActive:boolean; }
interface Store { id:string; name:string; isActive:boolean; }
interface Item { id:string; variantId:string; orderedQuantity:number; receivedQuantity:number; unitCost:number; totalCost:number; variant:{ sku:string; product:{name:string} } }
interface Purchase { id:string; reference:string; status:Status; subtotal:number; tax:number; discount:number; total:number; createdAt:string; supplier:{name:string;code:string}; store:{name:string}; items:Item[]; }
interface InventoryOption { variantId:string; variant:{id:string;sku:string;product:{name:string}}; store:{id:string;name:string}; }

const money = (v:number) => Number(v || 0).toFixed(2) + ' HTG';
const statusLabel:Record<Status,string> = { DRAFT:'Brouillon', ORDERED:'Commandée', PARTIALLY_RECEIVED:'Partiellement reçue', RECEIVED:'Reçue', CANCELLED:'Annulée' };

export default function PurchasesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [purchases,setPurchases]=useState<Purchase[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [stores,setStores]=useState<Store[]>([]);
  const [inventory,setInventory]=useState<InventoryOption[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [showReceive,setShowReceive]=useState<Purchase|null>(null);
  const [compact,setCompact]=useState(false);
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState<string|null>(null);
  const [form,setForm]=useState({storeId:'',supplierId:'',reference:'',tax:'0',discount:'0',notes:'',variantId:'',quantity:'1',unitCost:'0'});
  const [receiveQty,setReceiveQty]=useState<Record<string,string>>({});

  const loadPurchases=useCallback(async()=>{setLoading(true);setError(null);try{
    const p=new URLSearchParams({take:'100'}); if(search.trim())p.set('search',search.trim()); if(status)p.set('status',status);
    const r=await fetch('/api/purchases?'+p.toString()); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'Impossible de charger les achats'); setPurchases(d.purchases||[]);
  }catch(e){setError(e instanceof Error?e.message:'Impossible de charger les achats');}finally{setLoading(false);}},[search,status]);
  const loadRefs=useCallback(async()=>{try{
    const [s,v,i]=await Promise.all([fetch('/api/suppliers?take=100'),fetch('/api/stores?take=100'),fetch('/api/inventory?skip=0&take=100')]);
    const sd=await s.json(); const vd=await v.json(); const id=await i.json();
    setSuppliers(sd.suppliers||[]); setStores(vd.stores||[]);
    const rows=(id.inventory||[]) as InventoryOption[]; setInventory(rows);
    setForm(f=>({...f,storeId:f.storeId||vd.stores?.[0]?.id||'',supplierId:f.supplierId||sd.suppliers?.find((x:Supplier)=>x.isActive)?.id||''}));
  }catch(e){console.error(e);}},[]);
  useEffect(()=>{if(!authLoading&&!user)router.push('/login');},[authLoading,user,router]);
  useEffect(()=>{if(user){const timer=window.setTimeout(()=>{void loadRefs();void loadPurchases();},0);return()=>window.clearTimeout(timer);}},[user, loadRefs, loadPurchases]);
  const action=async(id:string,path:string)=>{const r=await fetch('/api/purchases/'+id+'/'+path,{method:'POST'});const d=await r.json().catch(()=>({}));if(!r.ok){alert(d.error||'Action impossible');return;}await loadPurchases();};
  const create=async(e:React.FormEvent)=>{e.preventDefault();setFormError(null);if(!form.storeId||!form.supplierId||!form.reference||!form.variantId){setFormError('Magasin, fournisseur, référence et article sont obligatoires.');return;}setSaving(true);try{
    const r=await fetch('/api/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId:form.storeId,supplierId:form.supplierId,reference:form.reference,tax:Number(form.tax||0),discount:Number(form.discount||0),notes:form.notes||undefined,items:[{variantId:form.variantId,orderedQuantity:Number(form.quantity),unitCost:Number(form.unitCost)}]})});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Création impossible');setShowCreate(false);await loadPurchases();
  }catch(e){setFormError(e instanceof Error?e.message:'Création impossible');}finally{setSaving(false);}};
  const receive=async()=>{if(!showReceive)return;setSaving(true);setFormError(null);try{
    const items=showReceive.items.map(i=>({purchaseItemId:i.id,quantity:Number(receiveQty[i.id]||0)})).filter(x=>x.quantity>0);
    if(!items.length)throw new Error('Indiquez au moins une quantité à recevoir.');
    const r=await fetch('/api/purchases/'+showReceive.id+'/receive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Réception impossible');setShowReceive(null);await loadPurchases();
  }catch(e){setFormError(e instanceof Error?e.message:'Réception impossible');}finally{setSaving(false);}};
  if(authLoading||!user)return authLoading?<div className="min-h-screen flex items-center justify-center">Chargement...</div>:null;
  return <div className="min-h-screen bg-gray-50 flex"><Sidebar compact={compact} onToggleCompact={()=>setCompact(!compact)}/><div className="flex-1 flex flex-col h-screen overflow-hidden">
    <header className="bg-white border-b px-6 py-4 flex items-center justify-between"><div className="flex items-center gap-4"><Logo size={40}/><div><h1 className="text-2xl font-bold">Achats</h1><p className="text-sm text-gray-500">Commandes fournisseurs, réceptions et suivi des dépenses.</p></div></div><Button onClick={()=>{setFormError(null);setShowCreate(true);}}>+ Nouvelle commande</Button></header>
    <main className="flex-1 overflow-y-auto p-6 space-y-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3"><Input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void loadPurchases()}} placeholder="Rechercher une référence"/><select className="h-10 border rounded-md px-3" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><Button variant="outline" onClick={()=>void loadPurchases()}>Rechercher</Button></Card>
      {error&&<Card className="p-4 text-red-600">{error}</Card>}
      {loading?<Card className="p-12 text-center">Chargement des achats...</Card>:<Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50 border-b"><tr>{['Référence','Fournisseur','Magasin','Total','Statut','Actions'].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead><tbody className="divide-y">{purchases.map(p=><tr key={p.id} className="hover:bg-gray-50">
        <td className="px-5 py-4"><div className="font-medium">{p.reference}</div><div className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</div></td><td className="px-5 py-4 text-sm">{p.supplier.name}</td><td className="px-5 py-4 text-sm">{p.store.name}</td><td className="px-5 py-4 text-sm font-semibold">{money(Number(p.total))}</td><td className="px-5 py-4"><span className="px-2 py-1 rounded-full bg-gray-100 text-xs">{statusLabel[p.status]}</span></td>
        <td className="px-5 py-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => router.push('/purchases/' + p.id)}>Détails</Button>{p.status==='DRAFT'&&<><Button size="sm" variant="outline" onClick={()=>void action(p.id,'order')}>Commander</Button><Button size="sm" variant="outline" onClick={()=>void action(p.id,'cancel')}>Annuler</Button></>}{(p.status==='ORDERED'||p.status==='PARTIALLY_RECEIVED')&&<Button size="sm" onClick={()=>{setFormError(null);setReceiveQty(Object.fromEntries(p.items.map(i=>[i.id,String(i.orderedQuantity-i.receivedQuantity)])));setShowReceive(p);}}>Réceptionner</Button>}</div></td>
      </tr>)}</tbody></table></div></Card>}
    </main>
  </div>
  <Modal isOpen={showCreate} onClose={()=>setShowCreate(false)} title="Nouvelle commande fournisseur"><form onSubmit={create} className="space-y-4">{formError&&<div className="p-3 bg-red-50 text-red-700 rounded text-sm">{formError}</div>}
    <select className="w-full h-10 border rounded-md px-3" value={form.storeId} onChange={e=>setForm({...form,storeId:e.target.value})}><option value="">Choisir un magasin</option>{stores.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <select className="w-full h-10 border rounded-md px-3" value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})}><option value="">Choisir un fournisseur</option>{suppliers.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select>
    <Input placeholder="Référence commande *" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/>
    <select className="w-full h-10 border rounded-md px-3" value={form.variantId} onChange={e=>setForm({...form,variantId:e.target.value})}><option value="">Choisir un article</option>{Array.from(new Map(inventory.map(i=>[i.variantId,i])).values()).map(i=><option key={i.variantId} value={i.variantId}>{i.variant.product.name} — {i.variant.sku}</option>)}</select>
    <div className="grid grid-cols-2 gap-3"><Input type="number" min="1" placeholder="Quantité" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/><Input type="number" min="0" step="0.01" placeholder="Coût unitaire HTG" value={form.unitCost} onChange={e=>setForm({...form,unitCost:e.target.value})}/></div>
    <div className="grid grid-cols-2 gap-3"><Input type="number" min="0" step="0.01" placeholder="Taxe" value={form.tax} onChange={e=>setForm({...form,tax:e.target.value})}/><Input type="number" min="0" step="0.01" placeholder="Remise" value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})}/></div>
    <Input placeholder="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setShowCreate(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving?'Création...':'Créer'}</Button></div>
  </form></Modal>
  <Modal isOpen={!!showReceive} onClose={()=>setShowReceive(null)} title={showReceive?'Réception — '+showReceive.reference:'Réception'}><div className="space-y-4">{formError&&<div className="p-3 bg-red-50 text-red-700 rounded text-sm">{formError}</div>}{showReceive?.items.map(i=><div key={i.id} className="grid grid-cols-3 gap-3 items-center"><div className="col-span-2"><div className="font-medium">{i.variant.product.name}</div><div className="text-xs text-gray-500">{i.variant.sku} — restant {i.orderedQuantity-i.receivedQuantity}</div></div><Input type="number" min="0" max={i.orderedQuantity-i.receivedQuantity} value={receiveQty[i.id]||'0'} onChange={e=>setReceiveQty({...receiveQty,[i.id]:e.target.value})}/></div>)}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowReceive(null)}>Annuler</Button><Button onClick={()=>void receive()} disabled={saving}>{saving?'Réception...':'Valider la réception'}</Button></div></div></Modal>
  </div>;
}
