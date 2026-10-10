'use client';

/**
 * Retail POS — independent of the restaurant orders/bills/tables/KOT stack.
 * Every mutation goes through /api/admin/retail-sales*, which is backed by
 * lib/retail-sales.js (checkoutSale -> issueStock -> moving-average COGS ->
 * one journal). Nothing here calls the legacy bill/order/KOT endpoints.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote, Building2, Camera, CheckCircle2, CreditCard, Delete, Gift, Keyboard, LayoutGrid, Loader2, MessageCircle,
  Minus, Package, PauseCircle, PencilLine, PlayCircle, Plus, Printer, QrCode, ScanLine, ScanSearch, Search,
  SlidersHorizontal, Sparkles, Split, Tag, TicketPercent, Trash2, User, Wallet, X,
} from 'lucide-react';
import { receiptWhatsappLink } from '@/lib/whatsapp-receipt.js';
import { useCommerceSearch } from '@/components/commerce/use-commerce-search';
import { useShortcut } from '@/components/erp/keyboard';
import SerialPicker from '@/components/commerce/serial-picker';
import { ActionDrawer } from '@/components/erp/primitives';
import { useAuth } from '@/lib/auth-context';
import dynamic from 'next/dynamic';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { printRetailReceipt } from '@/lib/pos-print.js';
import { paymentSummary } from '@/lib/commerce-payment-summary.js';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { formatNepalTime } from '@/lib/time-utils';

const BarcodeScanner = dynamic(() => import('@/components/pos/barcode-scanner'), { ssr: false });

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function RetailPos() {
  const { user } = useAuth();
  const [draftReady, setDraftReady] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const notify = useCallback((description, variant = 'default') => {
    addToast({ description, variant, duration: variant === 'error' ? 5000 : 3000 });
  }, [addToast]);

  const [capabilities, setCapabilities] = useState({});
  const can = (key) => !!capabilities[key];

  const [refresh, setRefresh] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [scanMode, setScanMode] = useState(null);
  const searchRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(true);
  // Full-screen product browser (F5) with its own search, so the till's search box stays free for scanning.
  const [itemsOpen, setItemsOpen] = useState(false);
  const itemsOpenRef = useRef(false);
  itemsOpenRef.current = itemsOpen;
  const [browserTerm, setBrowserTerm] = useState('');
  // Price check: scans show price and stock instead of adding to the sale.
  const [priceCheck, setPriceCheck] = useState(false);
  const [priceResult, setPriceResult] = useState(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [flashId, setFlashId] = useState(null);
  const [cashTyped, setCashTyped] = useState(null);

  const [selectedLine, setSelectedLine] = useState(0);
  const [lineEdit, setLineEdit] = useState(null);
  const [resultIndex, setResultIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [cart, setCart] = useState([]); // [{ local_id, variant_id, name, variant_name, sku, quantity, unit_price, discount_amount }]
  const [customer, setCustomer] = useState(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [customerCreateError, setCustomerCreateError] = useState('');
  const [customerCreateBusy, setCustomerCreateBusy] = useState(false);
  const customerSearch = useCommerceSearch(customerQuery, { group: 'customers', limit: 8, enabled: customerQuery.trim().length > 1 });
  const customerResults = customerQuery.trim().length > 1 ? (customerSearch.groups[0]?.results || []).map((row) => ({ ...row, name: row.title })) : [];
  useEffect(() => {
    if (!customer?.id) return;
    const controller = new AbortController();
    apiJson('/api/admin/commerce/customer?id=' + customer.id, { signal: controller.signal }).then((d) => { if (!controller.signal.aborted) setCustomer(d.customer); }).catch(() => {});
    return () => controller.abort();
  }, [customer?.id]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [promoPreview, setPromoPreview] = useState({ applied_promotions: [], total_discount: 0, line_discounts: [] });
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltyPreview, setLoyaltyPreview] = useState({ balance: 0, estimated_points_to_earn: 0, redemption: { points: 0, value: 0 } });

  const [activeSaleId, setActiveSaleId] = useState(null);
  const checkoutKeyRef = useRef(uid());
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const draft = JSON.parse(sessionStorage.getItem('commerce-cart-' + user.id) || 'null');
        if (draft) { setCart(draft.cart || []); setCustomer(draft.customer); setDiscountAmount(draft.discountAmount || 0); setDiscountReason(draft.discountReason || ''); setCouponCode(draft.couponCode || ''); setRedeemPoints(draft.redeemPoints || 0); setActiveSaleId(draft.activeSaleId || null); checkoutKeyRef.current = draft.key || uid(); }
      } catch { /* An unreadable browser draft does not change server holds. */ }
      setDraftReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [user.id]);
  useEffect(() => {
    if (!draftReady) return;
    try { sessionStorage.setItem('commerce-cart-' + user.id, JSON.stringify({ cart, customer, discountAmount, discountReason, couponCode, redeemPoints, activeSaleId, key: checkoutKeyRef.current })); } catch { notify('Browser draft storage unavailable. Use Hold before leaving.', 'warning'); }
  }, [draftReady, user.id, cart, customer, discountAmount, discountReason, couponCode, redeemPoints, activeSaleId, notify]);

  const [heldSales, setHeldSales] = useState([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [receiptIsReplay, setReceiptIsReplay] = useState(false);
  const lastCompleted = useRef(null);
  const [receiptSettings, setReceiptSettings] = useState({});
  useEffect(() => { apiJson('/api/admin/settings').then((d) => setReceiptSettings(d.settings || d)).catch(() => {}); }, []);
  const [serialPicker, setSerialPicker] = useState(null); // { row, serials, loading }

  /* ------------------------------------------------------------- loading */

  useEffect(() => {
    apiJson('/api/auth/capabilities').then((d) => setCapabilities(d.capabilities || {})).catch(() => {});
  }, []);

  useEffect(() => {
    apiJson('/api/store/menu/categories').then((d) => setCategories(d.categories || [])).catch(() => {});
  }, []);
  // "3*" in front of a code or name means "add 3". The search itself ignores the multiplier.
  const multiplier = searchTerm.match(/^\s*(\d{1,3})\s*[*xX]\s*(.*)$/);
  const searchQuery = multiplier ? multiplier[2] : searchTerm;
  // refreshKey reloads stock badges after checkout or a stock conflict.
  const mainSearch = useCommerceSearch(searchQuery, { group: 'products', limit: 8, refreshKey: refresh, enabled: searchQuery.trim().length > 0 });
  const browser = useCommerceSearch(browserTerm, { group: 'catalog_products', limit: 40, categoryId, refreshKey: refresh, enabled: itemsOpen });
  const toRow = (row) => ({ variantId: row.id, productName: row.title, variantName: row.variant_name, sku: row.sku, price: Number(row.price), mrp: Number(row.mrp) || 0, barcode: row.barcode, trackingMode: row.tracking_mode || 'none', stock: row.available_stock, imageUrl: row.image_url, category: row.category_name });
  const searchResults = searchQuery.trim() ? (mainSearch.groups[0]?.results || []).map(toRow) : [];
  const browserProducts = browser.groups[0]?.results || [];
  const [expandedBrowserProduct, setExpandedBrowserProduct] = useState(null);
  const browserVariant = (product, variant) => toRow({ ...variant, title: product.title, image_url: product.image_url, category_name: product.category_name });
  const loadProducts = useCallback(() => setRefresh((value) => value + 1), []);

  const refreshHeld = useCallback(async () => {
    try {
      const data = await apiJson('/api/admin/retail-sales?status=HELD');
      setHeldSales(data.retail_sales || []);
    } catch { /* non-fatal */ }
  }, []);
  useEffect(() => { refreshHeld(); }, [refreshHeld]);

  // Preview promotions on every cart/customer/coupon change — read-only,
  // authoritative recomputation happens again at checkout.
  useEffect(() => {
    if (!cart.length) { setPromoPreview({ applied_promotions: [], total_discount: 0, line_discounts: [] }); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiJson('/api/admin/retail-promotions/preview', {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify({
            lines: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
            customer_id: customer?.id || null,
            coupon_code: couponCode || undefined,
          }),
        });
        if (!controller.signal.aborted) setPromoPreview(data);
      } catch {
        // Invalid/expired coupon etc — never keep a stale discount on screen; checkout re-validates authoritatively either way.
        if (!controller.signal.aborted) setPromoPreview({ applied_promotions: [], total_discount: 0, line_discounts: [] });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cart, customer, couponCode]);

  // Loyalty preview — balance, estimated points to earn, and the redemption
  // value if `redeemPoints` is set. saleTotal here is computed independently
  // of the `totals` memo below (gross - promo discount) to avoid a
  // declaration-order dependency; checkout re-validates authoritatively.
  useEffect(() => {
    if (!customer?.id) { setLoyaltyPreview({ balance: 0, estimated_points_to_earn: 0, redemption: { points: 0, value: 0 } }); return; }
    const controller = new AbortController();
    const gross = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
    const saleTotal = Math.max(0, gross - (Number(promoPreview.total_discount) || 0));
    const timer = setTimeout(async () => {
      try {
        const data = await apiJson('/api/admin/retail-loyalty/quote', {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify({ customer_id: customer.id, sale_total: saleTotal, points: redeemPoints || 0 }),
        });
        if (!controller.signal.aborted) setLoyaltyPreview(data);
      } catch { /* non-fatal preview */ }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cart, customer, promoPreview, redeemPoints]);

  /* ---------------------------------------------------------------- cart */

  // The line just scanned is selected, highlighted and scrolled into view, like a supermarket till.
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const appendCartLine = useCallback((row, qty = 1, serialNumbers = []) => {
    const current = cartRef.current;
    const match = row.trackingMode !== 'serial' ? current.findIndex((l) => l.variant_id === row.variantId) : -1;
    const newId = uid();
    setCart((prev) => {
      const existing = row.trackingMode !== 'serial' && prev.find((l) => l.variant_id === row.variantId);
      if (existing) {
        return prev.map((l) => l.local_id === existing.local_id ? { ...l, quantity: l.quantity + qty } : l);
      }
      return [...prev, {
        local_id: newId, variant_id: row.variantId, name: row.productName, variant_name: row.variantName,
        sku: row.sku, quantity: qty, unit_price: row.price, discount_amount: 0, image_url: row.imageUrl || null,
        tracking_mode: row.trackingMode, serial_numbers: serialNumbers,
      }];
    });
    setSelectedLine(match >= 0 ? match : current.length);
    setFlashId(match >= 0 ? current[match].local_id : newId);
    if (!itemsOpenRef.current) searchRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!flashId) return undefined;
    document.querySelector(`[data-line-id="${flashId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setFlashId(null), 1300);
    return () => clearTimeout(timer);
  }, [flashId]);

  const addToCart = useCallback(async (row, qty = 1) => {
    if (row.trackingMode !== 'serial') return appendCartLine(row, qty);
    setSerialPicker({ row });
  }, [appendCartLine]);

  const scanQueue = useRef(Promise.resolve());
  const scanBarcode = useCallback((code, qty = 1) => {
    scanQueue.current = scanQueue.current.catch(() => {}).then(async () => {
      try {
        const data = await apiJson('/api/admin/commerce/search?group=products&limit=1&q=' + encodeURIComponent(code));
        const result = data.groups[0]?.results[0];
        if (!result || !result.exact_match) return notify('No exact barcode or SKU found for ' + code, 'error');
        if (priceCheck) return setPriceResult(toRow(result));
        await addToCart(toRow(result), qty);
      } catch (error) { notify(error.message || 'Scanner lookup failed. Scan again.', 'error'); }
    });
  }, [addToCart, notify, priceCheck]);

  // Enter in the search box: a highlighted name match is added; anything else is treated as a barcode or SKU.
  const pickResult = (row) => {
    const qty = multiplier ? Math.max(1, Number(multiplier[1])) : 1;
    if (priceCheck) setPriceResult(row); else addToCart(row, qty);
    setSearchTerm('');
    setResultIndex(0);
    searchRef.current?.focus();
  };
  const submitSearch = () => {
    const code = searchQuery.trim();
    if (!code) return;
    const picked = searchResults[resultIndex];
    if (picked && !/^[0-9]+$/.test(code) && mainSearch.query === searchQuery) return pickResult(picked);
    scanBarcode(code, multiplier ? Math.max(1, Number(multiplier[1])) : 1);
    setSearchTerm('');
    setResultIndex(0);
  };

  const updateQty = (localId, delta) => {
    setCart((prev) => prev.map((l) => l.local_id === localId && l.tracking_mode !== 'serial' ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l).filter(Boolean));
  };
  const removeLine = (localId) => setCart((prev) => prev.filter((l) => l.local_id !== localId));

  const startNewSale = useCallback(() => {
    setCart([]);
    setCustomer(null);
    setCustomerQuery('');
    setDiscountAmount(0);
    setDiscountReason('');
    setCouponCode('');
    setRedeemPoints(0);
    setHoldLabel('');
    setActiveSaleId(null);
    checkoutKeyRef.current = uid();
  }, []);

  const clearCart = useCallback(async () => {
    if (!cart.length) return;
    const ok = await confirm({ title: 'Clear cart?', description: 'Every line in the current cart will be removed.' });
    if (!ok) return;
    startNewSale();
  }, [cart.length, confirm, startNewSale]);

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const quotePayload = JSON.stringify({ lines: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, manual_discount_amount: l.discount_amount, unit_price: l.unit_price, price_overridden: Boolean(l.price_overridden), serial_numbers: l.serial_numbers || [] })), allowPriceOverride: cart.some((l) => l.price_overridden), customer_id: customer?.id || null, discount_amount: discountAmount, coupon_code: couponCode, redeem_loyalty_points: redeemPoints });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!JSON.parse(quotePayload).lines.length) return;
      try {
        const data = await apiJson('/api/admin/commerce/quote', { method: 'POST', body: quotePayload, signal: controller.signal });
        if (!controller.signal.aborted) { setQuote({ key: quotePayload, data }); setQuoteError(''); }
      } catch (error) { if (!controller.signal.aborted) setQuoteError(error.message || 'Cart could not be validated'); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [quotePayload, refresh]);
  const quoteReady = quote?.key === quotePayload && !quoteError && !quote?.data?.conflicts?.length;
  const totals = cart.length && quote?.data || { subtotal: 0, discount: 0, tax: 0, total: 0, promoDiscount: 0, loyaltyDiscount: 0 };

  /* ------------------------------------------------------------ hold/resume */

  const holdCart = useCallback(async () => {
    if (!cart.length) return notify('Add at least one item first.', 'warning');
    setBusy(true);
    try {
      const payload = {
        notes: JSON.stringify({ commerce_v1: { label: holdLabel, cart, couponCode, redeemPoints, discountReason, customer } }),
        lines: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, manual_discount_amount: l.discount_amount, unit_price: l.unit_price, price_overridden: Boolean(l.price_overridden), serial_numbers: l.serial_numbers || [] })),
        customer_id: customer?.id || null,
        discount_amount: discountAmount,
      };
      const data = activeSaleId
        ? await apiJson(`/api/admin/retail-sales/${activeSaleId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiJson('/api/admin/retail-sales', { method: 'POST', body: JSON.stringify(payload) });
      notify(`Sale held (${data.retail_sale.sale_number || '#' + data.retail_sale.id}).`, 'success');
      startNewSale();
      refreshHeld();
    } catch (e) {
      notify(e.error || 'Could not hold this sale.', 'error');
    } finally {
      setBusy(false);
    }
  }, [cart, customer, discountAmount, activeSaleId, notify, startNewSale, refreshHeld, holdLabel, couponCode, redeemPoints, discountReason]);

  const resumeSale = useCallback(async (saleId) => {
    if (cart.length && !await confirm({ title: 'Replace current cart?', description: 'Hold the current cart first if you need to keep it.' })) return;
    setBusy(true);
    try {
      const data = await apiJson(`/api/admin/retail-sales/${saleId}`);
      const sale = data.retail_sale;
      let snapshot = null;
      try { snapshot = JSON.parse(sale.notes || '{}').commerce_v1; } catch {}
      setCart(sale.lines.map((l) => ({
        local_id: uid(), variant_id: l.variant_id, name: l.product_name_snapshot, variant_name: l.variant_name_snapshot,
        sku: l.sku_snapshot, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount_amount: Number(l.discount_amount),
        tracking_mode: (l.serial_numbers || []).length ? 'serial' : 'none', serial_numbers: l.serial_numbers || [],
      })));
      if (snapshot?.cart) setCart(snapshot.cart);
      setCouponCode(snapshot?.couponCode || ''); setRedeemPoints(snapshot?.redeemPoints || 0); setDiscountReason(snapshot?.discountReason || '');
      setCustomer(sale.customer_id ? { id: sale.customer_id, name: sale.customer_name } : null);
      setDiscountAmount(Number(sale.discount_amount || 0));
      setActiveSaleId(sale.id);
      checkoutKeyRef.current = uid();
      setShowHeld(false);
      notify(`Resumed ${sale.sale_number || '#' + sale.id}.`, 'success');
    } catch (e) {
      notify(e.error || 'Could not resume this sale.', 'error');
    } finally {
      setBusy(false);
    }
  }, [notify, cart.length, confirm]);

  // The cashier dashboard continues a held sale with ?resume=<id>. Drop the
  // parameter first so a reload after checkout cannot reopen the sale.
  const resumeOnMount = useRef(resumeSale);
  useEffect(() => {
    const saleId = Number(new URLSearchParams(window.location.search).get('resume'));
    if (!saleId) return;
    window.history.replaceState(null, '', window.location.pathname);
    resumeOnMount.current(saleId);
  }, []);

  const cancelHeld = useCallback(async (saleId) => {
    const ok = await confirm({ title: 'Cancel held sale?', description: 'This held sale will be discarded. Nothing was ever posted for it.' });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/retail-sales/${saleId}/cancel`, { method: 'POST' });
      refreshHeld();
    } catch (e) {
      notify(e.error || 'Could not cancel.', 'error');
    }
  }, [confirm, notify, refreshHeld]);

  /* --------------------------------------------------------------- checkout */

  const [payments, setPayments] = useState([{ method: 'cash', amount: 0, cash_tendered: 0 }]);
  const [creditOverrideReason, setCreditOverrideReason] = useState('');
  const openPayment = () => {
    if (!cart.length || !quoteReady) return;
    setPayments([{ method: 'cash', amount: totals.total, cash_tendered: totals.total }]);
    setCashTyped(null);
    setCreditOverrideReason('');
    setCheckoutError('');
    setShowPayment(true);
  };
  // Customer, discount or coupon changed while paying: a single tender follows the new total.
  useEffect(() => {
    if (!showPayment || !quoteReady) return;
    setPayments((prev) => prev.length !== 1 || prev[0].amount === totals.total ? prev
      : [{ ...prev[0], amount: totals.total, cash_tendered: prev[0].method === 'cash' && prev[0].cash_tendered === prev[0].amount ? totals.total : prev[0].cash_tendered }]);
  }, [showPayment, quoteReady, totals.total]);
  const paymentMode = payments.length > 1 ? 'split' : payments[0]?.method;
  const choosePaymentMode = (id) => {
    setCashTyped(null);
    if (id === 'split') return setPayments([{ method: 'cash', amount: totals.total, cash_tendered: totals.total }, { method: 'online', amount: 0, cash_tendered: 0 }]);
    const balance = Number(customer?.store_credit_balance) || 0;
    // Not enough store credit for the whole bill: use it all and take the rest in cash.
    if (id === 'store_credit' && balance + 0.005 < totals.total) {
      const rest = Math.round((totals.total - balance) * 100) / 100;
      return setPayments([{ method: 'store_credit', amount: balance, cash_tendered: 0 }, { method: 'cash', amount: rest, cash_tendered: rest }]);
    }
    setPayments([{ method: id, amount: totals.total, cash_tendered: id === 'cash' ? totals.total : 0 }]);
  };
  // On-screen keypad for touch tills: the first key replaces the pre-filled exact amount.
  const pressCashKey = (key) => {
    const next = key === 'back' ? (cashTyped ?? '').slice(0, -1) : `${cashTyped ?? ''}${key}`.replace(/^0+(?=\d)/, '').slice(0, 7);
    setCashTyped(next);
    setPayments((prev) => [{ ...prev[0], cash_tendered: Number(next) || 0 }]);
  };

  const paymentSum = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);
  const paymentBreakdown = paymentSummary(totals.total, payments);
  const creditAmount = payments.filter((p) => p.method === 'credit').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const creditLimit = Number(customer?.credit_limit) || 0;
  const creditExposure = Number(customer?.current_credit) || 0;
  const creditOverLimit = creditLimit > 0 && creditExposure + creditAmount > creditLimit + 0.005;
  const canOverrideCredit = can('retail_sale.credit_override');
  const paymentValid = Math.abs(Math.round((paymentSum - totals.total) * 100)) <= 1 && payments.every((p) =>
    Number(p.amount) >= 0 && (p.method !== 'cash' || Number(p.cash_tendered) >= Number(p.amount)) &&
    (p.method !== 'store_credit' || (!!customer && Number(p.amount) <= Number(customer.store_credit_balance || 0))));

  const checkoutBusy = useRef(false);
  const completeSale = useCallback(async () => {
    if (checkoutBusy.current || !quoteReady) return;
    if (!paymentValid) return notify('Payment does not add up to the total.', 'warning');
    if (payments.some((p) => p.method === 'credit') && !customer) return notify('Select a customer for a credit sale.', 'warning');
    if (creditOverLimit && (!canOverrideCredit || creditOverrideReason.trim().length < 8)) return notify('Credit limit exceeded. A Manager or Owner must enter an override reason of at least 8 characters.', 'warning');
    checkoutBusy.current = true;
    setBusy(true);
    try {
      let saleId = activeSaleId;
      if (!saleId) {
        const held = await apiJson('/api/admin/retail-sales', {
          method: 'POST',
          body: JSON.stringify({
            lines: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, manual_discount_amount: l.discount_amount, unit_price: l.unit_price, price_overridden: Boolean(l.price_overridden), serial_numbers: l.serial_numbers || [] })),
            customer_id: customer?.id || null,
            discount_amount: discountAmount,
          }),
        });
        saleId = held.retail_sale.id;
        setActiveSaleId(saleId);
      }
      const data = await apiJson(`/api/admin/retail-sales/${saleId}/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          payments: payments.map((p) => ({ method: p.method, amount: p.amount, cash_tendered: p.cash_tendered || undefined })),
          allowPriceOverride: cart.some((l) => l.price_overridden),
          discount_amount: discountAmount,
          discount_reason: discountReason || undefined,
          customer_id: customer?.id || null,
          coupon_code: couponCode || undefined,
          redeem_loyalty_points: redeemPoints || undefined,
          credit_override_reason: creditOverLimit ? creditOverrideReason.trim() : undefined,
          lines: cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity, manual_discount_amount: l.discount_amount, unit_price: l.unit_price, price_overridden: Boolean(l.price_overridden), serial_numbers: l.serial_numbers || [] })),
          idempotency_key: checkoutKeyRef.current,
        }),
      });
      notify(`Sale ${data.retail_sale.sale_number} completed.`, 'success');
      lastCompleted.current = data.retail_sale;
      setLastReceipt(data.retail_sale);
      setReceiptIsReplay(false);
      setShowPayment(false);
      setMobilePanelOpen(false);
      setCouponCode('');
      setRedeemPoints(0);
      setCreditOverrideReason('');
      startNewSale();
      refreshHeld();
      loadProducts();
    } catch (e) {
      setCheckoutError(e.error || 'Checkout failed. The cart is unchanged; review stock and payment before retrying.');
      setRefresh((value) => value + 1);
    } finally {
      checkoutBusy.current = false;
      setBusy(false);
    }
  }, [quoteReady, paymentValid, payments, customer, creditOverLimit, canOverrideCredit, creditOverrideReason, activeSaleId, cart, discountAmount, discountReason, couponCode, redeemPoints, notify, startNewSale, refreshHeld, loadProducts]);

  useShortcut('f3', () => { setItemsOpen(false); searchRef.current?.focus(); }, { allowInField: true });
  const openPaymentAt = (selector) => { openPayment(); setTimeout(() => document.querySelector(selector)?.focus(), 80); };
  useShortcut('f2', () => openPaymentAt('[data-customer-search]'), { allowInField: true });
  useShortcut('f5', () => setItemsOpen((open) => !open), { allowInField: true });
  useShortcut('f8', () => cart.length && !busy && setHoldOpen(true), { allowInField: true });
  useShortcut('mod+f8', () => setShowHeld(true), { allowInField: true });
  useShortcut('f9', () => (showPayment ? completeSale() : openPayment()), { allowInField: true });
  useShortcut('escape', () => { setShowHeld(false); setSerialPicker(null); setPriceResult(null); setMobilePanelOpen(false); if (!busy) setShowPayment(false); searchRef.current?.focus(); }, { allowInField: true });

  useShortcut('f4', () => document.querySelector('[data-cart-quantity="' + selectedLine + '"]')?.focus(), { allowInField: true });
  useShortcut('f6', () => cart[selectedLine] && can('retail_sale.discount') && setLineEdit('discount'), { allowInField: true });
  useShortcut('shift+f6', () => can('retail_sale.discount') && openPaymentAt('[data-sale-discount]'), { allowInField: true });
  useShortcut('f7', () => cart[selectedLine] && can('retail_sale.price_override') && setLineEdit('price'), { allowInField: true });
  useShortcut('delete', () => cart[selectedLine] && removeLine(cart[selectedLine].local_id));
  useShortcut('arrowdown', () => setSelectedLine(Math.min(cart.length - 1, selectedLine + 1)));
  useShortcut('arrowup', () => setSelectedLine(Math.max(0, selectedLine - 1)));
  useShortcut('+', () => cart[selectedLine] && updateQty(cart[selectedLine].local_id, 1));
  useShortcut('-', () => cart[selectedLine] && updateQty(cart[selectedLine].local_id, -1));
  useShortcut('mod+shift+r', () => window.location.assign(window.location.pathname.replace('/billing','/retail-sales-history')), { allowInField: true });

  useShortcut('f10', () => { if (lastCompleted.current) { setLastReceipt(lastCompleted.current); setReceiptIsReplay(true); } }, { allowInField: true });

  /* --------------------------------------------------------------- render */

  // Supermarket till layout: the cart is the whole screen, products open in a
  // full-screen browser (F5), and every other control lives in the right panel
  // (a bottom sheet on phones and portrait tablets).
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartLines = cart.map((line, index) => ({ ...line, unit_price: quoteReady ? quote.data.pricing?.[index]?.unit_price ?? line.unit_price : line.unit_price, price_reason: quoteReady ? quote.data.pricing?.[index]?.reason : null }));
  const setLineQuantity = (id, quantity) => { if (Number.isInteger(quantity) && quantity > 0) setCart((rows) => rows.map((l) => l.local_id === id && l.tracking_mode !== 'serial' ? { ...l, quantity } : l)); };
  const reprintLast = () => {
    if (!lastCompleted.current) return notify('No sale has been completed on this screen yet.', 'warning');
    setLastReceipt(lastCompleted.current);
    setReceiptIsReplay(true);
  };
  const inCart = Object.fromEntries(Object.entries(cart.reduce((acc, line) => ({ ...acc, [line.variant_id]: (acc[line.variant_id] || 0) + line.quantity }), {})));
  const selected = cart[selectedLine];
  const showDropdown = searchFocused && searchQuery.trim().length > 0 && !/^\d{6,}$/.test(searchQuery.trim());
  const statusMessage = quoteError
    ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{quoteError}</div>
    : quote?.key === quotePayload && quote.data.stock_conflicts?.length
      ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Stock needs attention</strong><ul className="mt-1.5 space-y-1">{quote.data.stock_conflicts.map((conflict) => <li key={conflict.variant_id}><strong>{conflict.product_name}{conflict.variant_name ? ` · ${conflict.variant_name}` : ''}</strong>: {conflict.requested} in cart, {conflict.available} available</li>)}</ul><p className="mt-1.5">Lower the quantity or record the missing stock first.</p></div>
      : quote?.key === quotePayload && quote.data.conflicts?.length
        ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{quote.data.conflicts.join(' ')}</div>
        : null;
  const actionButton = 'flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-[13px] font-semibold text-gray-700 transition hover:border-pink-300 hover:bg-pink-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';
  const Kbd = ({ children }) => <kbd className="rounded border border-gray-300 bg-gray-50 px-1 text-[10px] font-semibold text-gray-500">{children}</kbd>;

  const customerSection = (
  <section aria-label="Customer" className="rounded-2xl border border-gray-200 bg-white p-3">
    <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Customer</p><span className="text-xs text-gray-400">Optional · F2</span></div>
    {customer ? (
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-100 text-pink-700"><User className="h-4 w-4" aria-hidden /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-gray-900">{customer.name || `Customer #${customer.id}`}</p>{customer.phone && <p className="text-xs text-gray-500">{customer.phone}</p>}</div></div>
          <button type="button" aria-label="Remove customer" onClick={() => { setCustomer(null); setRedeemPoints(0); }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">{loyaltyPreview.balance} pts{loyaltyPreview.estimated_points_to_earn > 0 ? ` · +${loyaltyPreview.estimated_points_to_earn} today` : ''}</span>
          {Number(customer.current_credit) > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">Owes {formatCurrency(customer.current_credit)}</span>}
          {Number(customer.store_credit_balance) > 0 && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Store credit {formatCurrency(customer.store_credit_balance)}</span>}
          {creditLimit > 0 && <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">Limit {formatCurrency(creditLimit)}</span>}
          {customer.is_blacklisted ? <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">Credit blocked</span> : null}
        </div>
        {loyaltyPreview.balance > 0 && <label className="mt-2.5 flex items-center gap-2 text-sm text-gray-600">Use points
          <input type="number" min="0" max={loyaltyPreview.balance} value={redeemPoints || ''} onChange={(e) => setRedeemPoints(Math.max(0, Math.min(loyaltyPreview.balance, Number(e.target.value) || 0)))} placeholder="0" className="h-10 w-24 rounded-xl border border-gray-300 px-2 text-right tabular-nums" />
          {loyaltyPreview.redemption?.value > 0 && <span className="font-bold text-amber-700">−{formatCurrency(loyaltyPreview.redemption.value)}</span>}
        </label>}
      </div>
    ) : (
      <div className="relative">
        <input type="text" data-customer-search placeholder="Customer name/phone (optional)" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} className="h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm placeholder:text-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100" />
        {customerResults.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
            {customerResults.map((c) => <button key={c.id} type="button" onClick={() => { setCustomer(c); setCustomerQuery(''); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-pink-50"><span className="font-semibold text-gray-900">{c.name}</span>{c.phone ? <span className="text-gray-500">{c.phone}</span> : null}</button>)}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500"><span>Walk-in customer</span><button type="button" className="font-bold text-pink-700 hover:underline" onClick={() => { setNewCustomer({ name: '', phone: customerQuery.replace(/\D/g, '') }); setCustomerCreateError(''); setShowCustomerCreate(true); }}>New customer</button></div>
      </div>
    )}
  </section>
  );

  const discountSection = (
    <section aria-label="Discount and coupon" className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Discount &amp; coupon</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {can('retail_sale.discount') && <>
          <label className="block text-sm font-semibold text-gray-700">Sale discount (Rs)<input data-sale-discount type="number" min="0" step="0.01" inputMode="decimal" value={discountAmount || ''} onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))} placeholder="0" className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-right text-base font-semibold tabular-nums focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100" /></label>
          <label className="block text-sm font-semibold text-gray-700">Reason{discountAmount > 0 ? '' : ' (optional)'}<input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} maxLength={120} placeholder="e.g. Regular customer" className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100" /></label>
        </>}
        <label className="block text-sm font-semibold text-gray-700 sm:col-span-2">Coupon code<input aria-label="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Only for coupon offers" className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-base font-semibold uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100" /></label>
      </div>
      {promoPreview.applied_promotions.length > 0 && <ul className="space-y-1 text-sm">{promoPreview.applied_promotions.map((p) => <li key={p.id} className="flex justify-between font-bold text-rose-700"><span>{p.name}{p.code ? ` (${p.code})` : ''}</span><span>−{formatCurrency(p.discount)}</span></li>)}</ul>}
      {!quoteReady && <p className="text-xs text-gray-500">Updating the total…</p>}
    </section>
  );

  const controlPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        {/* Totals */}
        <section aria-label="Totals" className="rounded-2xl border border-gray-200 bg-white p-3.5">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">Subtotal · {cartCount} pcs</dt><dd className="font-semibold tabular-nums text-gray-900">{formatCurrency(totals.subtotal + totals.promoDiscount + (totals.lineDiscount || 0))}</dd></div>
            {totals.promoDiscount > 0 && <div className="flex justify-between text-rose-700"><dt className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" aria-hidden />{promoPreview.applied_promotions.map((p) => p.name).join(', ') || 'Offers'}</dt><dd className="font-bold tabular-nums">−{formatCurrency(totals.promoDiscount)}</dd></div>}
            {totals.lineDiscount > 0 && <div className="flex justify-between text-emerald-700"><dt>Line discounts</dt><dd className="font-bold tabular-nums">−{formatCurrency(totals.lineDiscount)}</dd></div>}
            {totals.discount - (totals.loyaltyDiscount || 0) > 0 && <div className="flex justify-between text-emerald-700"><dt>Sale discount</dt><dd className="font-bold tabular-nums">−{formatCurrency(totals.discount - (totals.loyaltyDiscount || 0))}</dd></div>}
            {totals.loyaltyDiscount > 0 && <div className="flex justify-between text-amber-700"><dt>Loyalty points</dt><dd className="font-bold tabular-nums">−{formatCurrency(totals.loyaltyDiscount)}</dd></div>}
            {totals.tax > 0 && <div className="flex justify-between"><dt className="text-gray-600">VAT</dt><dd className="font-semibold tabular-nums text-gray-900">{formatCurrency(totals.tax)}</dd></div>}
          </dl>
          <div className="mt-3 border-t-2 border-dashed border-gray-200 pt-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Total</p>
            <p className="text-[2rem] font-bold leading-tight tabular-nums text-gray-900" aria-live="polite">{formatCurrency(totals.total)}</p>
            <p role="status" className={`mt-1 text-xs ${statusMessage ? 'font-bold text-amber-700' : 'text-gray-500'}`}>{!cart.length ? 'Scan an item to start' : statusMessage ? 'Fix the note below to charge' : !quoteReady ? 'Checking price and stock…' : busy ? 'Saving…' : 'Ready to charge'}</p>
          </div>
          {couponCode && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"><TicketPercent className="h-3.5 w-3.5" aria-hidden />Code {couponCode}</p>}
        </section>

        {statusMessage}
        {quote?.key === quotePayload && quote.data.margin_warnings?.map((warning, index) => <p role="status" className="text-xs text-amber-700" key={index}>SKU #{warning.variant_id}: {warning.message}</p>)}

        {/* Actions */}
        <section aria-label="Sale actions" className="grid grid-cols-2 gap-1.5">
          {can('retail_sale.discount') && <button type="button" className={actionButton} disabled={!selected} onClick={() => setLineEdit('discount')}><Tag className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /><span>Line discount</span></button>}
          {can('retail_sale.price_override') && <button type="button" className={actionButton} disabled={!selected} onClick={() => setLineEdit('price')}><PencilLine className="h-4 w-4 shrink-0 text-sky-600" aria-hidden /><span>Override price</span></button>}
          <button type="button" className={actionButton} disabled={!cart.length || busy} onClick={() => setHoldOpen(true)}><PauseCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /><span>Hold sale</span></button>
          <button type="button" className={`${actionButton} ${priceCheck ? 'border-sky-400 bg-sky-50 text-sky-800' : ''}`} aria-pressed={priceCheck} onClick={() => { setPriceCheck((on) => !on); setPriceResult(null); searchRef.current?.focus(); }}><ScanSearch className="h-4 w-4 shrink-0 text-sky-600" aria-hidden /><span>Price check</span></button>
          <button type="button" className={actionButton} onClick={reprintLast}><Printer className="h-4 w-4 shrink-0 text-gray-600" aria-hidden /><span>Last receipt</span></button>
          <button type="button" className={`${actionButton} hover:border-red-300 hover:bg-red-50`} disabled={!cart.length || busy} onClick={clearCart}><Trash2 className="h-4 w-4 shrink-0 text-red-600" aria-hidden /><span>Clear sale</span></button>
        </section>
      </div>
      {/* Desktop pay button; phones use the bar at the bottom of the screen. */}
      <div className="hidden shrink-0 border-t border-gray-200 bg-white p-3.5 lg:block">
        <button type="button" onClick={openPayment} disabled={!cart.length || busy || !quoteReady}
          className="flex h-14 w-full items-center justify-between gap-3 rounded-xl bg-gray-900 px-5 text-white shadow-md transition hover:bg-gray-800 active:scale-[0.99] disabled:opacity-40">
          <span className="flex items-center gap-2 text-lg font-bold">{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CreditCard className="h-5 w-5" aria-hidden />}Pay</span>
          <span className="flex items-center gap-2"><span className="text-lg font-bold tabular-nums">{formatCurrency(totals.total)}</span><span className="rounded bg-white/15 px-1.5 text-[10px] font-semibold">F9</span></span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-gray-50 lg:flex-row">
      {/* ------------------------------------------------ cart: the main screen */}
      <section aria-label="Current sale" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 space-y-2 border-b border-gray-200 bg-white px-3 py-2.5 sm:px-5">
          {/* The shell header already says "Billing"; this keeps one real page heading for screen readers. */}
          <h1 className="sr-only">Billing</h1>
          {(activeSaleId || priceCheck) && <div className="flex flex-wrap items-center gap-2">
            {activeSaleId && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Held sale #{activeSaleId} resumed</span>}
            {priceCheck && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800">Price check on · scans are not added</span>}
          </div>}
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                ref={searchRef}
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Scan barcode or search product / SKU / brand..."
                aria-label="Scan barcode or search product"
                value={searchTerm}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                onChange={(e) => { setSearchTerm(e.target.value); setResultIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setResultIndex(Math.max(0, Math.min(searchResults.length - 1, resultIndex + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
                  if (e.key === 'Escape') { setSearchTerm(''); return; }
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  submitSearch();
                }}
                className={`h-12 w-full rounded-xl border-2 bg-white pr-4 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 ${priceCheck ? 'border-sky-400 focus:ring-sky-100' : 'border-gray-300 focus:border-pink-400 focus:ring-pink-100'}`}
                style={{ paddingLeft: '2.75rem' }}
              />
              {showDropdown && (
                <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[60dvh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl">
                  {mainSearch.loading && !searchResults.length ? <p className="flex items-center gap-2 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Searching…</p>
                    : !searchResults.length ? <p className="p-4 text-sm text-gray-500">No item matches “{searchQuery}”. Press Enter to try it as a barcode, or open Items (F5).</p>
                    : searchResults.slice(0, 8).map((row, index) => {
                      const out = row.stock != null && row.stock <= 0;
                      return <button key={row.variantId} type="button" disabled={out && !priceCheck} onMouseDown={(e) => e.preventDefault()} onClick={() => pickResult(row)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left disabled:opacity-50 ${index === resultIndex ? 'bg-pink-50 ring-1 ring-pink-200' : 'hover:bg-gray-50'}`}>
                        <ProductThumb src={row.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
                        <span className="min-w-0 flex-1"><span className="block truncate font-bold text-gray-900">{row.productName}{row.variantName && row.variantName !== 'Standard' ? ` · ${row.variantName}` : ''}</span><span className="block truncate text-xs text-gray-500">{[row.sku, row.barcode].filter(Boolean).join(' · ')}{row.stock != null ? ` · ${out ? 'Out of stock' : `${row.stock} in stock`}` : ''}</span></span>
                        <span className="shrink-0 text-base font-bold tabular-nums text-gray-900">{formatCurrency(row.price)}</span>
                      </button>;
                    })}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setItemsOpen(true)} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3.5 text-sm font-bold text-pink-800 hover:bg-pink-100"><LayoutGrid className="h-4 w-4" aria-hidden /><span>Items</span><span className="hidden rounded bg-white px-1.5 text-xs text-pink-700 sm:inline">F5</span></button>
            <button type="button" onClick={() => setScanMode('camera')} aria-label="Scan with camera" title="Scan with camera" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"><Camera className="h-5 w-5" aria-hidden /></button>
            <button type="button" onClick={() => setShowHeld(true)} className="hidden h-12 shrink-0 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 lg:inline-flex"><PlayCircle className="h-4 w-4 text-amber-600" aria-hidden />Held ({heldSales.length})</button>
            <button type="button" onClick={() => setShowHelp(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 lg:grid"><Keyboard className="h-4 w-4" aria-hidden /></button>
          </div>
          <div className="flex justify-end lg:hidden">
            <button type="button" onClick={() => setShowHeld(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"><PlayCircle className="h-4 w-4 text-amber-600" aria-hidden />Held ({heldSales.length})</button>
          </div>
        </header>

        {priceResult && (
          <div className="mx-3 mt-3 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 sm:mx-5" role="status">
            <ProductThumb src={priceResult.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-widest text-sky-700">Price check</p><p className="truncate text-lg font-bold text-gray-900">{priceResult.productName}{priceResult.variantName && priceResult.variantName !== 'Standard' ? ` · ${priceResult.variantName}` : ''}</p><p className="text-sm text-gray-600">{priceResult.stock != null ? `${priceResult.stock} in stock` : 'Stock not tracked'}{priceResult.sku ? ` · ${priceResult.sku}` : ''}</p></div>
            <p className="text-3xl font-bold tabular-nums text-gray-900">{formatCurrency(priceResult.price)}</p>
            <div className="flex gap-2"><Button onClick={() => { addToCart(priceResult); setPriceResult(null); }}>Add to sale</Button><Button variant="outline" onClick={() => setPriceResult(null)}>Close</Button></div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-3 sm:px-5 lg:pb-4">
          {cart.length === 0 ? (
            <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-pink-500 shadow-sm"><ScanLine className="h-8 w-8" aria-hidden /></span>
              <p className="mt-3 text-lg font-bold text-gray-900">Scan an item to start</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">Scan a barcode, type a name in the search box, or open the item list.</p>
              <button type="button" onClick={() => setItemsOpen(true)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:border-pink-300 hover:bg-pink-50"><LayoutGrid className="h-5 w-5" aria-hidden />Browse items (F5)</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div aria-hidden className="hidden grid-cols-[2rem_minmax(0,1fr)_8rem_6rem_7rem_2.5rem] items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 md:grid">
                <span>#</span><span>Item</span><span className="text-center">Qty</span><span className="text-right">Price</span><span className="text-right">Total</span><span />
              </div>
              <ul aria-label="Sale cart" className="divide-y divide-gray-100">
                {cartLines.map((line, index) => {
                  const serial = line.tracking_mode === 'serial';
                  const isSelected = selectedLine === index;
                  return (
                    <li key={line.local_id} data-line-id={line.local_id} onClick={() => setSelectedLine(index)}
                      className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 md:grid-cols-[2rem_minmax(0,1fr)_8rem_6rem_7rem_2.5rem] ${isSelected ? 'bg-pink-50/70' : 'hover:bg-gray-50'} ${flashId === line.local_id ? 'pos-flash' : ''}`}>
                      {isSelected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-pink-500" />}
                      <span className="hidden text-sm font-bold tabular-nums text-gray-400 md:block">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-gray-900">{line.name}{line.variant_name && line.variant_name !== 'Standard' ? <span className="font-semibold text-gray-500"> · {line.variant_name}</span> : null}</p>
                        <p className="truncate text-xs text-gray-500">{[line.sku, line.tracking_mode === 'batch' ? 'batch picked at checkout' : null, line.price_reason].filter(Boolean).join(' · ')}</p>
                        {line.serial_numbers?.length > 0 && <p className="text-xs font-semibold text-violet-700">Serial {line.serial_numbers.join(', ')}</p>}
                        {line.discount_amount > 0 && <p className="text-xs font-bold text-emerald-700">Line discount −{formatCurrency(line.discount_amount)}</p>}
                      </div>
                      <span className="text-right text-base font-bold tabular-nums text-gray-900 md:hidden">{formatCurrency(line.unit_price * line.quantity - line.discount_amount)}</span>
                      <div className="flex items-center gap-1.5 md:justify-center" onClick={(event) => event.stopPropagation()}>
                        <button type="button" aria-label={`Decrease ${line.name}`} disabled={serial || line.quantity <= 1} onClick={() => updateQty(line.local_id, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-30"><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                        <input data-cart-quantity={index} aria-label={`Quantity for ${line.name}`} type="number" min="1" step="1" disabled={serial} value={line.quantity} onFocus={(e) => { setSelectedLine(index); e.target.select(); }} onChange={(e) => setLineQuantity(line.local_id, Number(e.target.value))} className="h-9 w-12 rounded-lg border border-gray-300 text-center text-base font-semibold tabular-nums text-gray-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100" />
                        <button type="button" aria-label={`Increase ${line.name}`} disabled={serial} onClick={() => updateQty(line.local_id, 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-30"><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                      </div>
                      <div className="flex items-center justify-end gap-1 md:contents">
                        <span className="text-right text-sm tabular-nums text-gray-600 md:text-base">{formatCurrency(line.unit_price)}<span className="md:hidden"> each</span></span>
                        <span className="hidden text-right text-base font-bold tabular-nums text-gray-900 md:block">{formatCurrency(line.unit_price * line.quantity - line.discount_amount)}</span>
                        <button type="button" onClick={(event) => { event.stopPropagation(); removeLine(line.local_id); }} aria-label={`Remove ${line.name}`} className="grid h-9 w-9 place-items-center justify-self-end rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <footer className="hidden shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-2.5 text-sm text-gray-500 lg:flex">
          <span><strong className="text-gray-900">{cartCount}</strong> pcs · <strong className="text-gray-900">{cart.length}</strong> lines</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">{selected ? <>Selected: <strong className="max-w-[14rem] truncate text-gray-900">{selected.name}</strong> <span>Qty <Kbd>F4</Kbd></span>{can('retail_sale.discount') && <span>Disc <Kbd>F6</Kbd></span>}{can('retail_sale.price_override') && <span>Price <Kbd>F7</Kbd></span>}<span>Remove <Kbd>Del</Kbd></span></> : <>Search <Kbd>F3</Kbd> Items <Kbd>F5</Kbd> Hold <Kbd>F8</Kbd> Pay <Kbd>F9</Kbd></>}</span>
        </footer>
      </section>

      {/* ------------------------------------------------ control panel */}
      {mobilePanelOpen && <button type="button" aria-label="Close sale panel" className="fixed inset-0 z-30 bg-gray-950/30 lg:hidden" onClick={() => setMobilePanelOpen(false)} />}
      <aside aria-label="Sale panel"
        className={`fixed inset-x-0 bottom-[4.5rem] z-40 flex max-h-[72dvh] min-h-0 flex-col rounded-t-3xl border-t border-gray-200 bg-gray-50 shadow-2xl transition-[transform,visibility] duration-200 lg:visible lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-[340px] lg:translate-y-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none xl:w-[380px] ${mobilePanelOpen ? 'visible translate-y-0' : 'invisible translate-y-[120%]'}`}>
        {controlPanel}
      </aside>

      {/* Phone and portrait-tablet bar: the total and Pay are always one tap away. */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex gap-2 border-t border-gray-200 bg-white p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
        <button type="button" onClick={() => setMobilePanelOpen((open) => !open)} aria-expanded={mobilePanelOpen} className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-left">
          <SlidersHorizontal className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />
          <span className="min-w-0"><span className="block text-sm font-bold text-gray-900">Sale options</span><span className="block truncate text-xs text-gray-500">{customer ? customer.name : 'Walk-in'} · {cartCount} pcs</span></span>
        </button>
        <button type="button" onClick={openPayment} disabled={!cart.length || busy || !quoteReady} className="flex h-12 flex-[1.3] items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 text-base font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}Pay {formatCurrency(totals.total)}
        </button>
      </div>

      {/* ------------------------------------------------ items browser */}
      <Dialog.Root open={itemsOpen} onOpenChange={(open) => { setItemsOpen(open); if (!open) setTimeout(() => searchRef.current?.focus(), 0); }}>
        <Dialog.Portal>
          <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-[75] flex flex-col bg-gray-50 focus:outline-none">
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-3 sm:px-5">
              <Dialog.Title className="text-lg font-bold text-gray-900">Items</Dialog.Title>
              <div className="relative order-3 w-full sm:order-none sm:w-auto sm:flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
                <input autoFocus type="search" value={browserTerm} onChange={(e) => setBrowserTerm(e.target.value)} placeholder="Search items by name, SKU or brand" aria-label="Search items"
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-11 pr-4 text-sm focus:border-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-100" />
              </div>
              <p className="ml-auto hidden text-right text-sm text-gray-500 sm:block">In sale <strong className="block text-base text-gray-900">{cartCount} pcs · {formatCurrency(totals.total)}</strong></p>
              <Dialog.Close asChild><button type="button" className="ml-auto h-11 rounded-xl bg-gray-900 px-5 text-sm font-bold text-white hover:bg-gray-800 sm:ml-0">Done</button></Dialog.Close>
            </header>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <nav aria-label="Categories" className="flex shrink-0 gap-2 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
                {[{ id: '', name: 'All items' }, ...categories].map((category) => {
                  const active = String(categoryId) === String(category.id);
                  return <button key={category.id || 'all'} type="button" aria-pressed={active} onClick={() => setCategoryId(category.id ? String(category.id) : '')}
                    className={`shrink-0 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold transition-colors md:w-full ${active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-pink-50 md:bg-transparent'}`}>{category.name}</button>;
                })}
              </nav>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
                {browser.loading && !browserProducts.length ? (
                  <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" aria-label="Loading items" /></div>
                ) : !browserProducts.length ? (
                  <div className="py-20 text-center text-gray-500"><Package className="mx-auto mb-3 h-12 w-12 opacity-30" aria-hidden /><p className="font-bold">No items here</p><p className="text-sm">Try another name or category.</p></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
                      {browserProducts.map((product) => {
                        const out = Number(product.available_stock) <= 0;
                        const count = product.variants.reduce((sum, variant) => sum + (inCart[variant.id] || 0), 0);
                        return <button key={product.id} type="button" onClick={() => product.variants.length === 1 ? addToCart(browserVariant(product, product.variants[0])) : setExpandedBrowserProduct(expandedBrowserProduct === product.id ? null : product.id)} disabled={busy || (out && product.variants.length === 1)}
                          className={`relative overflow-hidden rounded-xl border-2 bg-white p-2 text-left transition active:scale-[0.97] disabled:cursor-not-allowed ${count ? 'border-pink-400' : out ? 'border-transparent opacity-80' : 'border-transparent shadow-sm hover:border-pink-200'}`}>
                          <div className="relative aspect-square overflow-hidden rounded-xl">
                            <ProductThumb src={product.image_url} alt="" className={`h-full w-full ${out ? 'opacity-45 grayscale' : ''}`} />
                            {count > 0 && <span className="absolute right-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-pink-600 px-1.5 text-xs font-bold text-white shadow">×{count}</span>}
                            {out && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-red-700 shadow-sm">Sold out</span>}
                          </div>
                          <p className="mt-1.5 line-clamp-2 min-h-[2.25rem] text-[13px] font-semibold leading-tight text-gray-900">{product.title}</p>
                          <p className="truncate text-xs text-gray-500">{product.variant_count > 1 ? `${product.variant_count} options · ${product.available_stock} total` : `${product.available_stock} left`}</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">{formatCurrency(product.price)}{product.price_max !== product.price && <span className="ml-1 text-xs font-medium text-gray-500">to {formatCurrency(product.price_max)}</span>}</p>
                        </button>;
                      })}
                    </div>
                    {browserProducts.filter((product) => product.id === expandedBrowserProduct).map((product) => <section key={product.id} className="mt-4 rounded-2xl border border-pink-200 bg-white p-4 shadow-sm" aria-label={`${product.title} options`}>
                      <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-bold text-gray-900">{product.title}</h3><p className="text-xs text-gray-500">Choose a colour or size to add to this sale.</p></div><button type="button" className="text-sm font-semibold text-gray-600 hover:text-gray-900" onClick={() => setExpandedBrowserProduct(null)}>Close</button></div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{product.variants.map((variant) => {
                        const row = browserVariant(product, variant);
                        const out = Number(row.stock) <= 0;
                        return <button key={variant.id} type="button" disabled={out || busy} onClick={() => addToCart(row)} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left text-sm hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50"><span className="min-w-0"><strong className="block truncate">{row.variantName || 'Standard'}</strong><small className="block truncate text-gray-500">{row.sku || row.barcode}</small></span><span className="shrink-0 text-right"><strong className="block">{formatCurrency(row.price)}</strong><small className="text-gray-500">{out ? 'Sold out' : `${row.stock} left`}</small></span></button>;
                      })}</div>
                    </section>)}
                    {browser.groups?.[0]?.has_more && <p className="mt-5 text-center text-sm text-gray-500">Showing the first {browserProducts.length} products. Search or pick a category to find the rest.</p>}
                  </>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {serialPicker && <SerialPicker row={serialPicker.row} selected={cart.flatMap((line) => line.serial_numbers || [])} onClose={() => { setSerialPicker(null); searchRef.current?.focus(); }} onSelect={(serial) => { appendCartLine(serialPicker.row, 1, [serial]); setSerialPicker(null); }} />}

      {/* ------------------------------------------------ held sales */}
      <Dialog.Root open={showHeld} onOpenChange={setShowHeld}>
        <Dialog.Portal>
          <Dialog.Overlay className="erp-overlay" style={{ zIndex: 76 }} />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-[77] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between"><Dialog.Title className="text-lg font-bold text-gray-900">Held sales</Dialog.Title><Dialog.Close aria-label="Close held sales" className="rounded-xl p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" aria-hidden /></Dialog.Close></div>
            {heldSales.length === 0 ? <p className="py-8 text-center text-gray-500">No sales on hold.</p> : <div className="space-y-2">{heldSales.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">{heldLabel(s) || s.customer_name || 'Walk-in'} <span className="font-bold tabular-nums">· {formatCurrency(s.grand_total)}</span></p>
                  <p className="truncate text-xs text-gray-500">{s.sale_number || `#${s.id}`} · {Number(s.item_count || 0)} items · {s.cashier_name} · {formatNepalTime(s.held_at)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button onClick={() => resumeSale(s.id)}><PlayCircle className="mr-1.5 h-4 w-4" aria-hidden /> Resume</Button>
                  <Button variant="ghost" aria-label={`Cancel held sale ${s.sale_number || s.id}`} onClick={() => cancelHeld(s.id)}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                </div>
              </div>
            ))}</div>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ------------------------------------------------ hold */}
      <Dialog.Root open={holdOpen} onOpenChange={(open) => { if (!open) { setHoldOpen(false); searchRef.current?.focus(); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="erp-overlay" style={{ zIndex: 76 }} />
          <Dialog.Content aria-describedby={undefined} className="erp-dialog" style={{ zIndex: 77, width: 'min(26rem, calc(100vw - 2rem))' }}>
            <form onSubmit={(e) => { e.preventDefault(); setHoldOpen(false); holdCart(); }}>
              <Dialog.Title className="text-lg font-bold">Hold this sale</Dialog.Title>
              <p className="mt-1 text-sm text-gray-600">Park it and serve the next customer. Find it again under Held.</p>
              <label className="mt-4 block text-sm font-bold text-gray-700">Name it (optional)<input autoFocus value={holdLabel} onChange={(e) => setHoldLabel(e.target.value)} maxLength={80} placeholder="e.g. Priya, coming back with cash" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm" /></label>
              <div className="erp-dialog__actions"><Dialog.Close asChild><Button variant="outline">Cancel</Button></Dialog.Close><Button type="submit" loading={busy}>Hold sale</Button></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ------------------------------------------------ payment */}
      {showPayment && (
        <Dialog.Root open={showPayment} onOpenChange={(open) => { if (!busy) setShowPayment(open); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[80] bg-gray-950/55" />
            <Dialog.Content aria-describedby={undefined} className="commerce-payment fixed inset-0 z-[81] flex flex-col overflow-hidden bg-white sm:inset-4 sm:rounded-3xl lg:inset-y-6 lg:left-1/2 lg:right-auto lg:w-[min(58rem,calc(100vw-3rem))] lg:-translate-x-1/2">
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3.5">
                <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-pink-100 text-pink-700"><Wallet className="h-5 w-5" aria-hidden /></span><div><Dialog.Title className="text-lg font-bold text-gray-900">Checkout payment</Dialog.Title><p className="text-sm text-gray-500">{cartCount} pcs{customer ? ` · ${customer.name}` : ' · Walk-in'}</p></div></div>
                <button type="button" aria-label="Close payment" onClick={() => !busy && setShowPayment(false)} className="grid h-10 w-10 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" aria-hidden /></button>
              </div>

              <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
                <div className="space-y-4 p-4 sm:p-5 lg:overflow-y-auto">
                  <div className="flex items-end justify-between gap-3 rounded-2xl bg-gray-800 px-5 py-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-70">To collect</p>
                    <p className="text-4xl font-bold tabular-nums">{formatCurrency(totals.total)}</p>
                  </div>

                  {customerSection}
                  {discountSection}

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">How is the customer paying?</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'cash', label: 'Cash', Icon: Banknote },
                        { id: 'online', label: 'Online / QR', Icon: QrCode },
                        ...(can('retail_sale.credit') ? [{ id: 'credit', label: 'Credit', Icon: Building2 }] : []),
                        ...(customer && Number(customer.store_credit_balance) > 0 ? [{ id: 'store_credit', label: 'Store credit', Icon: Gift }] : []),
                        { id: 'split', label: 'Split', Icon: Split },
                      ].map(({ id, label, Icon }) => {
                        const active = id === paymentMode;
                        return <button key={id} type="button" aria-pressed={active} onClick={() => choosePaymentMode(id)}
                          className={`flex h-12 min-w-[7.5rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition active:scale-[0.98] sm:flex-none ${active ? 'border-transparent bg-gray-900 text-white shadow-md' : 'border-gray-200 bg-white text-gray-800 hover:border-pink-300'}`}>
                          <Icon className="h-4 w-4" aria-hidden />{label}
                        </button>;
                      })}
                    </div>
                  </div>

                  {paymentMode === 'cash' && (
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
                      <div className="space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">Cash received
                          <input aria-label="Cash received" type="number" min="0" step="0.01" inputMode="decimal" value={payments[0]?.cash_tendered ?? ''}
                            onChange={(e) => { setCashTyped(null); setPayments([{ ...payments[0], cash_tendered: Number(e.target.value) || 0 }]); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); completeSale(); } }}
                            className="mt-1.5 h-14 w-full rounded-xl border-2 border-gray-300 px-4 text-right text-3xl font-bold tabular-nums text-gray-900 focus:border-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-100" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[totals.total, 100, 500, 1000, 2000, 5000].filter((v, i, a) => a.indexOf(v) === i && (i === 0 || v >= totals.total)).map((amt) => (
                            <button key={amt} type="button" onClick={() => { setCashTyped(null); setPayments([{ ...payments[0], cash_tendered: amt }]); }}
                              className={`h-10 min-w-[4.5rem] rounded-lg border px-3 text-sm font-semibold ${Number(payments[0]?.cash_tendered) === amt ? 'border-pink-600 bg-pink-50 text-pink-800' : 'border-gray-200 bg-white text-gray-800 hover:border-pink-300'}`}>
                              {amt === totals.total ? 'Exact' : formatCurrency(amt).replace('.00', '')}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5" aria-label="Cash keypad">
                        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'back'].map((key) => (
                          <button key={key} type="button" onClick={() => pressCashKey(key)} aria-label={key === 'back' ? 'Delete last digit' : `Key ${key}`}
                            className="grid h-11 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-lg font-semibold text-gray-800 hover:bg-gray-100 active:scale-95">{key === 'back' ? <Delete className="h-5 w-5" aria-hidden /> : key}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {paymentMode === 'online' && <p className="rounded-xl bg-sky-50 p-3.5 text-sm text-sky-900">Ask the customer to pay {formatCurrency(totals.total)} by QR, wallet or card, and check it arrived before completing.</p>}
                  {paymentMode === 'credit' && <p className="rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900">{customer ? <>{formatCurrency(totals.total)} goes on <strong>{customer.name}</strong>&apos;s account to pay later.</> : 'Pick a customer first. A credit sale needs a name to collect from.'}</p>}
                  {paymentMode === 'store_credit' && <p className="rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-900">Paid from store credit. Balance {formatCurrency(customer?.store_credit_balance)}.</p>}

                  {paymentMode === 'split' && (
                    <div className="space-y-2.5">
                      {payments.map((p, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <label className="min-w-[9rem] flex-1 text-xs font-bold uppercase tracking-wide text-gray-500">Method
                            <select value={p.method} onChange={(e) => setPayments((prev) => prev.map((row, idx) => idx === i ? { ...row, method: e.target.value, cash_tendered: e.target.value === 'cash' ? Number(row.amount) || 0 : 0 } : row))}
                              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-gray-900">
                              <option value="cash">Cash</option>
                              <option value="online">Digital / QR / Card</option>
                              {can('retail_sale.credit') && <option value="credit">Credit</option>}
                              {customer && Number(customer.store_credit_balance) > 0 && <option value="store_credit">Store Credit ({formatCurrency(customer.store_credit_balance)} avail.)</option>}
                            </select>
                          </label>
                          <label className="min-w-[8rem] flex-1 text-xs font-bold uppercase tracking-wide text-gray-500">Amount
                            <input type="number" min="0" step="0.01" value={p.amount}
                              onChange={(e) => setPayments((prev) => prev.map((row, idx) => idx === i ? { ...row, amount: Number(e.target.value) || 0, cash_tendered: row.method === 'cash' ? Number(e.target.value) || 0 : row.cash_tendered } : row))}
                              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-right text-base font-semibold tabular-nums text-gray-900" />
                          </label>
                          {p.method === 'cash' && <label className="min-w-[8rem] flex-1 text-xs font-bold uppercase tracking-wide text-gray-500">Cash received
                            <input aria-label={`Cash tendered ${i + 1}`} type="number" min="0" step="0.01" value={p.cash_tendered ?? ''} onChange={(e) => setPayments((prev) => prev.map((row, idx) => idx === i ? { ...row, cash_tendered: Number(e.target.value) || 0 } : row))}
                              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-right text-base font-semibold tabular-nums text-gray-900" />
                          </label>}
                          {payments.length > 1 && <button type="button" aria-label={`Remove payment ${i + 1}`} onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))} className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 hover:bg-white hover:text-red-600"><X className="h-4 w-4" aria-hidden /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="text-sm font-bold text-pink-700 hover:underline" onClick={() => setPayments((prev) => [...prev, { method: prev.some((row) => row.method === 'online') ? 'cash' : 'online', amount: 0, cash_tendered: 0 }])}>+ Split payment</button>

                  {creditOverLimit && <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <p>Credit would reach {formatCurrency(creditExposure + creditAmount)}, above the {formatCurrency(creditLimit)} limit.</p>
                    {canOverrideCredit ? <label className="mt-2 block font-semibold">Manager or Owner override reason<input value={creditOverrideReason} onChange={(event) => setCreditOverrideReason(event.target.value)} maxLength={500} className="mt-1 block h-11 w-full rounded-xl border border-amber-400 px-3 font-normal" placeholder="Why is this credit approved?" /></label> : <p className="mt-1">Ask a Manager or Owner to complete this sale.</p>}
                  </div>}
                </div>

                <div className="flex flex-col border-t border-gray-200 bg-gray-50 p-4 sm:p-5 lg:border-l lg:border-t-0">
                  <dl className="space-y-1.5 text-sm" aria-label="Sale summary">
                    <div className="flex justify-between"><dt className="text-gray-600">Items</dt><dd className="font-semibold">{cartCount}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd className="font-semibold tabular-nums">{formatCurrency(totals.subtotal)}</dd></div>
                    {totals.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discounts</dt><dd className="font-semibold tabular-nums">−{formatCurrency(totals.discount)}</dd></div>}
                    {totals.tax > 0 && <div className="flex justify-between"><dt className="text-gray-600">VAT</dt><dd className="font-semibold tabular-nums">{formatCurrency(totals.tax)}</dd></div>}
                  </dl>
                  <dl className="mt-4 space-y-1.5 border-t border-gray-200 pt-4 text-sm" aria-label="Payment breakdown">
                    <div className="flex justify-between"><dt className="text-gray-600">Amount due</dt><dd className="font-semibold tabular-nums">{formatCurrency(paymentBreakdown.amountDue)}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-600">Cash allocated</dt><dd className="tabular-nums">{formatCurrency(paymentBreakdown.cashAllocated)}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-600">Cash tendered</dt><dd className="tabular-nums">{formatCurrency(paymentBreakdown.cashTendered)}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-600">Other tender allocations</dt><dd className="tabular-nums">{formatCurrency(paymentBreakdown.otherAllocated)}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-600">Remaining</dt><dd className={`font-semibold tabular-nums ${paymentBreakdown.remaining > 0.005 ? 'text-red-600' : ''}`}>{formatCurrency(paymentBreakdown.remaining)}</dd></div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-600 px-4 py-2.5 text-white"><dt className="text-sm font-bold uppercase tracking-wide">Change</dt><dd className="text-2xl font-bold tabular-nums">{formatCurrency(paymentBreakdown.change)}</dd></div>
                  </dl>
                  <p role="status" className={`mt-3 text-sm font-semibold ${paymentValid ? 'text-emerald-700' : 'text-red-600'}`}>Allocated {formatCurrency(paymentSum)} of {formatCurrency(totals.total)}{paymentSum > totals.total + 0.005 ? ` · ${formatCurrency(paymentSum - totals.total)} too much` : ''}</p>
                  {checkoutError && <div role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{checkoutError}</div>}
                  <div className="mt-auto hidden pt-4 lg:block">
                    <button type="button" onClick={completeSale} disabled={!paymentValid || busy || !quoteReady || (creditOverLimit && (!canOverrideCredit || creditOverrideReason.trim().length < 8))}
                      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 text-lg font-bold text-white shadow-md hover:bg-gray-800 active:scale-[0.99] disabled:opacity-40">
                      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
                      Complete Sale
                    </button>
                    <p className="mt-2 text-center text-xs text-gray-500">Enter or F9 completes · Esc goes back</p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
                <p className="text-xs font-bold text-gray-600">Give back<span className="block text-xl font-bold tabular-nums text-emerald-700">{formatCurrency(paymentBreakdown.change)}</span></p>
                <button type="button" onClick={completeSale} disabled={!paymentValid || busy || !quoteReady || (creditOverLimit && (!canOverrideCredit || creditOverrideReason.trim().length < 8))}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 text-base font-bold text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
                  Complete Sale
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      <ActionDrawer open={showCustomerCreate} onOpenChange={setShowCustomerCreate} title="New customer" description="Save a customer and attach them to this sale.">
        <form className="commerce-form" onSubmit={async (event) => {
          event.preventDefault();
          setCustomerCreateBusy(true);
          setCustomerCreateError('');
          try {
            const data = await apiJson('/api/admin/customers', { method: 'POST', body: JSON.stringify(newCustomer) });
            setCustomer(data.customer);
            setCustomerQuery('');
            setShowCustomerCreate(false);
            notify('Customer added to sale.');
          } catch (error) {
            setCustomerCreateError(error.error || error.message || 'Could not save customer.');
          } finally {
            setCustomerCreateBusy(false);
          }
        }}>
          <label>Name<input autoFocus required value={newCustomer.name} onChange={(event) => setNewCustomer((value) => ({ ...value, name: event.target.value }))} /></label>
          <label>Phone<input required type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((value) => ({ ...value, phone: event.target.value }))} /></label>
          {customerCreateError && <p role="alert" className="text-red-700">{customerCreateError}</p>}
          <Button type="submit" disabled={customerCreateBusy}>{customerCreateBusy ? 'Saving…' : 'Save customer'}</Button>
        </form>
      </ActionDrawer>
      <ActionDrawer open={showHelp} onOpenChange={setShowHelp} title="Billing shortcuts" description="Keys work anywhere on the billing screen. Ctrl+Shift+R opens sale lookup; Ctrl+R stays browser refresh.">
        <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
          {[['F2', 'Customer'], ['F3', 'Search / scan'], ['F4', 'Quantity of selected item'], ['F5', 'Items browser'], ['F6', 'Line discount'], ['Shift+F6', 'Sale discount'], ['F7', 'Override price'], ['F8', 'Hold sale'], ['Ctrl+F8', 'Held sales'], ['F9', 'Pay, then Complete'], ['F10', 'Last receipt'], ['↑ ↓', 'Pick a cart line'], ['+ / −', 'Change quantity'], ['Delete', 'Remove line'], ['Esc', 'Close / back'], ['3*code', 'Add 3 of a barcode or item']].map(([key, label]) => <div key={key} className="contents"><dt><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-semibold">{key}</kbd></dt><dd>{label}</dd></div>)}
        </dl>
      </ActionDrawer>
      <ActionDrawer open={!!lineEdit} onOpenChange={(open) => { if (!open) setLineEdit(null); }} title={lineEdit === 'price' ? 'Transaction price override' : 'Manual line discount'} description="This changes only the current sale. Server permissions and pricing are checked at checkout.">{cart[selectedLine] && <div className="commerce-form"><p>{cart[selectedLine].name} / Current unit price {formatCurrency(cart[selectedLine].unit_price)}</p><label>{lineEdit === 'price' ? 'New unit price' : 'Discount amount'}<input autoFocus type="number" min="0" step="0.01" value={lineEdit === 'price' ? cart[selectedLine].unit_price : cart[selectedLine].discount_amount} onChange={(e) => setCart((rows) => rows.map((line,index) => index === selectedLine ? { ...line, [lineEdit === 'price' ? 'unit_price' : 'discount_amount']: Math.max(0, Number(e.target.value) || 0), price_overridden: lineEdit === 'price' || line.price_overridden } : line))} /></label><label>Reason<input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} /></label><Button onClick={() => { setLineEdit(null); searchRef.current?.focus(); }}>Apply</Button></div>}</ActionDrawer>

      {/* ------------------------------------------------ sale completed */}
      {lastReceipt && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-gray-950/50 p-0 sm:items-center sm:p-4">
          <div role="dialog" aria-label="Sale completed" className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-3xl">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100"><CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden /></div>
            <h3 className="text-lg font-bold text-gray-900">Sale Completed</h3>
            <p className="text-sm text-gray-500">{lastReceipt.sale_number}</p>
            <p className="my-2 text-3xl font-bold tabular-nums text-gray-900">{formatCurrency(lastReceipt.grand_total)}</p>
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">Change {formatCurrency((lastReceipt.payments || []).reduce((sum, p) => sum + Number(p.change_given || 0), 0))}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button className="h-11" onClick={async () => {
                try {
                  if (receiptIsReplay) await apiJson(`/api/admin/retail-sales/${lastReceipt.id}/reprint`, { method: 'POST' });
                  printRetailReceipt(lastReceipt, { reprint: receiptIsReplay, size: receiptSettings.receipt_paper_size || '80', settings: receiptSettings });
                } catch (error) { notify(error.error || 'Could not record the receipt reprint.', 'error'); }
              }}>
                <Printer className="mr-2 h-4 w-4" aria-hidden /> {receiptIsReplay ? 'Reprint' : 'Print'}
              </Button>
              <a className="flex h-11 items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 text-sm font-semibold text-green-800 hover:bg-green-100" target="_blank" rel="noopener"
                href={receiptWhatsappLink(lastReceipt, { shopName: receiptSettings.shop_name || '99 Shop by Shahana' })}>
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
            </div>
            <Button variant="outline" className="mt-2 h-11 w-full" onClick={() => { setLastReceipt(null); searchRef.current?.focus(); }}>New Sale</Button>
            <a className="mt-3 inline-block text-sm font-semibold text-pink-700" href={`${window.location.pathname.startsWith('/cashier') ? '/cashier' : '/admin'}/retail-sales-history?sale=${lastReceipt.id}`}>View Sale</a>
          </div>
        </div>
      )}

      {scanMode === 'camera' && (
        <BarcodeScanner
          onDetected={(code) => { scanBarcode(code); setScanMode(null); }}
          onClose={() => setScanMode(null)}
        />
      )}
    </div>
  );
}

function heldLabel(sale) {
  try { return JSON.parse(sale.notes || '{}').commerce_v1?.label || ''; } catch { return ''; }
}

function ProductThumb({ src, alt, className = '' }) {
  const url = toPublicImageUrl(src);
  // A missing file falls back to the icon instead of a broken image.
  const [failed, setFailed] = useState(null);
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-gray-100 text-gray-300 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && failed !== url ? <img src={url} alt={alt} loading="lazy" onError={() => setFailed(url)} className="h-full w-full object-cover" /> : <Package className="h-1/2 w-1/2" aria-hidden />}
    </div>
  );
}
