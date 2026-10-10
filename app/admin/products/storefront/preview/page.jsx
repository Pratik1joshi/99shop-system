'use client';
import {useEffect,useState} from 'react';
import {apiJson} from '@/lib/authed-fetch';
import {Product,StoreShell} from '@/components/store/storefront';
export default function Preview(){
  const [product,setProduct]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get('id');apiJson(`/api/admin/commerce/product-merchandising?id=${encodeURIComponent(id)}&preview=1`).then(setProduct).catch(e=>setError(e.message||e.error||'Preview unavailable. Sign in with catalog permissions.'));},[]);
  return <StoreShell><p role="status" className="store-alert">Staff preview of saved content. This does not publish the product.</p>{error&&<p role="alert">{error}</p>}{product&&<Product initial={product} preview/>}</StoreShell>;
}
