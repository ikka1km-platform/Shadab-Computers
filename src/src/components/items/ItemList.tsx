import React, { useState, useMemo, useRef } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  AlertCircle, 
  Edit3, 
  Layers, 
  Barcode, 
  Tag, 
  Percent,
  Building2,
  Ruler,
  Palette,
  Images,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  ShoppingCart,
  MessageCircle,
  Filter,
  SlidersHorizontal,
  Check,
  CheckCircle2,
  RotateCcw,
  Share2,
  ExternalLink,
  Trash2,
  ArrowRight,
  Eye,
  Store,
  IndianRupee,
  Tablet,
  Lock,
} from 'lucide-react';
import { Item, BusinessProfile, InvoiceItemEntry, UserRole } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import { canViewPurchasePrice, canManageInventoryItems } from '../../utils/userSession';
import { POPULAR_COLORS, getColorHex, getItemColors } from '../../utils/productVariants';

interface CartItem {
  item: Item;
  quantity: number;
}

interface ItemListProps {
  items: Item[];
  profile?: BusinessProfile;
  currentRole?: 'Owner' | UserRole;
  isKioskMode?: boolean;
  onEnterKioskMode?: () => void;
  onExitKioskMode?: (selectedItems?: InvoiceItemEntry[]) => void;
  onOpenAddModal: () => void;
  onEditItem: (item: Item) => void;
  onQuickBill?: (selectedItems: InvoiceItemEntry[]) => void;
}

export const ItemList: React.FC<ItemListProps> = ({
  items,
  profile,
  currentRole = 'Owner',
  isKioskMode = false,
  onEnterKioskMode,
  onExitKioskMode,
  onOpenAddModal,
  onEditItem,
  onQuickBill,
}) => {
  const isPurchasePriceAllowed = !isKioskMode && canViewPurchasePrice(currentRole);
  const isInventoryManageAllowed = !isKioskMode && canManageInventoryItems(currentRole);
  // View Toggle: 'table' vs 'storefront'
  const [viewMode, setViewMode] = useState<'table' | 'storefront'>('storefront');

  // Search & Barcode
  const [searchQuery, setSearchQuery] = useState('');
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // E-Commerce Multi-Filter State
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [priceMin, setPriceMin] = useState<number | ''>('');
  const [priceMax, setPriceMax] = useState<number | ''>('');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);

  // Cart State for E-Commerce Storefront
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Active image index per product card in grid view: itemId -> imageIndex
  const [cardImageIndex, setCardImageIndex] = useState<Record<number, number>>({});

  // Active selected colour per product card: itemId -> colorName
  const [selectedCardColor, setSelectedCardColor] = useState<Record<number, string>>({});

  // Touch tracking for mobile/tablet swipe gestures on product images
  const touchStartXRef = useRef<Record<number, number>>({});
  const touchStartYRef = useRef<Record<number, number>>({});

  const handlePrevCardImage = (itemId: number, total: number) => {
    setCardImageIndex((prev) => {
      const cur = prev[itemId] || 0;
      const nextIdx = cur > 0 ? cur - 1 : total - 1;
      return { ...prev, [itemId]: nextIdx };
    });
  };

  const handleNextCardImage = (itemId: number, total: number) => {
    setCardImageIndex((prev) => {
      const cur = prev[itemId] || 0;
      const nextIdx = cur < total - 1 ? cur + 1 : 0;
      return { ...prev, [itemId]: nextIdx };
    });
  };

  // Gallery Lightbox state
  const [galleryItem, setGalleryItem] = useState<Item | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Success Toast for adding to cart
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Distinct filter options extracted from items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((it) => {
      if (it.category && it.category.trim()) cats.add(it.category.trim());
    });
    return Array.from(cats).sort();
  }, [items]);

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    items.forEach((it) => {
      if (it.brand && it.brand.trim()) brands.add(it.brand.trim());
    });
    return Array.from(brands).sort();
  }, [items]);

  const availableSizes = useMemo(() => {
    const sizes = new Set<string>();
    items.forEach((it) => {
      if (it.size && it.size.trim()) sizes.add(it.size.trim());
    });
    return Array.from(sizes).sort();
  }, [items]);

  const availableColors = useMemo(() => {
    const colors = new Set<string>();
    items.forEach((it) => {
      getItemColors(it).forEach((c) => colors.add(c));
    });
    return Array.from(colors).sort();
  }, [items]);

  // Active filter count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'ALL') count++;
    if (selectedBrands.length > 0) count += selectedBrands.length;
    if (selectedSizes.length > 0) count += selectedSizes.length;
    if (selectedColors.length > 0) count += selectedColors.length;
    if (inStockOnly) count++;
    if (priceMin !== '' || priceMax !== '') count++;
    return count;
  }, [selectedCategory, selectedBrands, selectedSizes, selectedColors, inStockOnly, priceMin, priceMax]);

  const handleResetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedBrands([]);
    setSelectedSizes([]);
    setSelectedColors([]);
    setInStockOnly(false);
    setPriceMin('');
    setPriceMax('');
    setSearchQuery('');
  };

  // Filter items matching all criteria
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const itColors = getItemColors(it);

      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = it.name.toLowerCase().includes(q);
        const matchesCode = it.code.toLowerCase().includes(q);
        const matchesBarcode = it.barcode?.toLowerCase().includes(q);
        const matchesHsn = it.hsnCode?.toLowerCase().includes(q);
        const matchesCategory = it.category?.toLowerCase().includes(q);
        const matchesBrand = it.brand?.toLowerCase().includes(q);
        const matchesSize = it.size?.toLowerCase().includes(q);
        const matchesColor = itColors.some((c) => c.toLowerCase().includes(q));

        if (!matchesName && !matchesCode && !matchesBarcode && !matchesHsn && !matchesCategory && !matchesBrand && !matchesSize && !matchesColor) {
          return false;
        }
      }

      // 2. Category Filter
      if (selectedCategory !== 'ALL') {
        if (!it.category || it.category.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // 3. Brands Filter (OR within brands)
      if (selectedBrands.length > 0) {
        if (!it.brand || !selectedBrands.includes(it.brand)) {
          return false;
        }
      }

      // 4. Sizes Filter (OR within sizes)
      if (selectedSizes.length > 0) {
        if (!it.size || !selectedSizes.includes(it.size)) {
          return false;
        }
      }

      // 5. Colors Filter (OR within colors)
      if (selectedColors.length > 0) {
        const hasColor = selectedColors.some((sc) =>
          itColors.some((c) => c.toLowerCase() === sc.toLowerCase())
        );
        if (!hasColor) {
          return false;
        }
      }

      // 6. In-Stock Only
      if (inStockOnly && it.stockQuantity <= 0) {
        return false;
      }

      // 7. Price Range Filter (From X to Y)
      if (priceMin !== '' && it.salePrice < Number(priceMin)) {
        return false;
      }
      if (priceMax !== '' && it.salePrice > Number(priceMax)) {
        return false;
      }

      return true;
    });
  }, [items, searchQuery, selectedCategory, selectedBrands, selectedSizes, selectedColors, inStockOnly, priceMin, priceMax]);

  // Overall metrics
  const totalStockValue = items.reduce(
    (sum, it) => sum + (it.stockQuantity * (isPurchasePriceAllowed ? it.purchasePrice : it.salePrice)),
    0
  );

  const lowStockCount = items.filter(
    (it) => it.minStockAlert && it.stockQuantity <= it.minStockAlert
  ).length;

  // Cart operations
  const handleAddToCart = (item: Item, chosenColor?: string) => {
    const selectedColor = chosenColor || selectedCardColor[item.id!];
    const itemWithVariant: Item = selectedColor
      ? {
          ...item,
          name: `${item.name} (${selectedColor})`,
          color: selectedColor,
        }
      : item;

    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id && ci.item.name === itemWithVariant.name);
      if (existing) {
        return prev.map((ci) =>
          ci.item.id === item.id && ci.item.name === itemWithVariant.name
            ? { ...ci, quantity: ci.quantity + 1 }
            : ci
        );
      }
      return [...prev, { item: itemWithVariant, quantity: 1 }];
    });
    showToast(`✓ Added ${itemWithVariant.name} to Cart`);
  };

  const handleUpdateCartQty = (itemId: number, newQty: number) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
    } else {
      setCart((prev) =>
        prev.map((ci) => (ci.item.id === itemId ? { ...ci, quantity: newQty } : ci))
      );
    }
  };

  const handleRemoveFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const cartTotalAmount = useMemo(() => {
    return cart.reduce((sum, ci) => sum + ci.quantity * ci.item.salePrice, 0);
  }, [cart]);

  const cartTotalItemsCount = useMemo(() => {
    return cart.reduce((sum, ci) => sum + ci.quantity, 0);
  }, [cart]);

  // Proceed from Cart to Sale Invoice
  const handleProceedToInvoice = () => {
    if (!onQuickBill || cart.length === 0) return;

    const invoiceItems: InvoiceItemEntry[] = cart.map((ci) => {
      const taxable = ci.quantity * ci.item.salePrice;
      const taxRate = ci.item.taxRate || 0;
      const taxAmount = (taxable * taxRate) / 100;
      return {
        itemId: ci.item.id,
        name: ci.item.name,
        quantity: ci.quantity,
        unit: ci.item.unit,
        rate: ci.item.salePrice,
        taxRate,
        discount: 0,
        total: taxable + taxAmount,
      };
    });

    setIsCartOpen(false);
    if (isKioskMode) {
      if (onExitKioskMode) {
        onExitKioskMode(invoiceItems);
      }
    } else {
      if (onQuickBill) {
        onQuickBill(invoiceItems);
      }
    }
  };

  // WhatsApp Single Product Sharing
  const handleShareWhatsApp = (item: Item) => {
    const brandText = item.brand ? `*Brand:* ${item.brand}%0A` : '';
    const sizeText = item.size ? `*Size:* ${item.size}%0A` : '';
    const chosenColor = selectedCardColor[item.id!];
    const itemColors = getItemColors(item);
    const colorText = chosenColor 
      ? `*Selected Colour:* ${chosenColor}%0A`
      : itemColors.length > 0 
      ? `*Available Colours:* ${itemColors.join(', ')}%0A` 
      : '';
    const storeName = profile?.businessName ? `*Store:* ${profile.businessName}%0A` : '';
    const storePhone = profile?.phone ? `*Contact:* ${profile.phone}%0A` : '';

    const text = `🛍️ *PRODUCT ENQUIRY / ORDER*%0A%0A*Item:* ${item.name}%0A${brandText}${sizeText}${colorText}*Price:* ₹${item.salePrice}%0A*Stock Status:* ${item.stockQuantity > 0 ? 'In Stock' : 'Out of Stock'}%0A%0A${storeName}${storePhone}Please let me know if you would like to order this item!`;

    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // WhatsApp Entire Cart Order
  const handleShareCartWhatsApp = () => {
    if (cart.length === 0) return;

    let itemsList = '';
    cart.forEach((ci, idx) => {
      const ciColors = getItemColors(ci.item);
      const details = [
        ci.item.brand, 
        ci.item.size ? `Size: ${ci.item.size}` : null, 
        ciColors.length > 0 ? `Col: ${ciColors.join('/')}` : null
      ]
        .filter(Boolean)
        .join(', ');
      itemsList += `${idx + 1}. *${ci.item.name}* ${details ? `(${details})` : ''}%0A   Qty: ${ci.quantity} ${ci.item.unit} x ₹${ci.item.salePrice} = *₹${ci.quantity * ci.item.salePrice}*%0A`;
    });

    const storeName = profile?.businessName ? `*To:* ${profile.businessName}%0A` : '';
    const text = `🛒 *NEW ORDER REQUEST*%0A${storeName}%0A*Items Ordered:*%0A${itemsList}%0A*Total Order Amount:* *₹${cartTotalAmount}*%0A%0APlease confirm my order and share invoice details.`;

    const cleanPhone = profile?.phone ? profile.phone.replace(/[^0-9]/g, '') : '';
    const targetUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(targetUrl, '_blank');
  };

  const handleOpenGallery = (item: Item, index = 0) => {
    if (!item.images || item.images.length === 0) return;
    setGalleryItem(item);
    setActiveImageIndex(index);
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Storefront Controls */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Store className="w-6 h-6 text-blue-600" />
              <span>Products & E-Commerce Showcase</span>
            </h2>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
              {items.length} Catalogued
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewMode === 'storefront'
              ? 'Visual online storefront catalogue with multi-photo carousels, brand/size/colour filtering, and WhatsApp ordering'
              : 'Traditional inventory table with barcodes, tax rates, and valuation'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* If in Kiosk Mode: Staff Exit Button */}
          {isKioskMode ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1.5">
                <Tablet className="w-4 h-4 text-purple-600" />
                <span>Customer Showroom</span>
              </span>
              {onExitKioskMode && (
                <button
                  type="button"
                  onClick={() => onExitKioskMode()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                  title="Exit Customer Mode (Requires Staff PIN)"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Staff Exit</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Tablet Showroom Mode Launch Button */}
              {onEnterKioskMode && (
                <button
                  type="button"
                  onClick={onEnterKioskMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                  title="Lock tablet into Customer Showroom Mode before handing to customer"
                >
                  <Tablet className="w-3.5 h-3.5" />
                  <span>Tablet Showroom Mode</span>
                </button>
              )}

              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('storefront')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'storefront'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid Storefront</span>
                </button>
              </div>
            </>
          )}

          {/* Cart Status Pill */}
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{isKioskMode ? 'Bag' : 'Cart'} ({cartTotalItemsCount}) • {formatCurrency(cartTotalAmount)}</span>
            </button>
          )}

          {isInventoryManageAllowed && (
            <button
              onClick={onOpenAddModal}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Quick Metrics Bar - Hidden in Kiosk Mode */}
      {!isKioskMode && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-blue-800 uppercase">Catalogue Products</span>
              <div className="text-lg font-black text-blue-700">{items.length} Total SKUs</div>
            </div>
            <Package className="w-5 h-5 text-blue-600" />
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-800 uppercase">
                {isPurchasePriceAllowed ? 'Stock Valuation (Cost)' : 'Catalogue Value (Retail)'}
              </span>
              <div className="text-lg font-black text-emerald-700">{formatCurrency(totalStockValue)}</div>
            </div>
            <Layers className="w-5 h-5 text-emerald-600" />
          </div>

          <div className={`border rounded-xl p-3 flex items-center justify-between ${
            lowStockCount > 0 ? 'bg-rose-50/70 border-rose-200/60' : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <span className={`text-[11px] font-bold uppercase ${lowStockCount > 0 ? 'text-rose-800' : 'text-slate-600'}`}>
                Low Stock Warnings
              </span>
              <div className={`text-lg font-black ${lowStockCount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                {lowStockCount} Products
              </div>
            </div>
            <AlertCircle className={`w-5 h-5 ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* VIEW 1: E-COMMERCE STOREFRONT (GRID SHOWCASE)        */}
      {/* ==================================================== */}
      {viewMode === 'storefront' ? (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Mobile Filter Toggle Button */}
          <div className="lg:hidden w-full flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
            >
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              <span>Filter Catalogue {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </button>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-rose-600 hover:underline"
              >
                Reset All
              </button>
            )}
          </div>

          {/* LEFT FILTER SIDEBAR */}
          <div className={`w-full lg:w-64 shrink-0 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-5 ${
            isMobileFilterOpen ? 'block' : 'hidden lg:block'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {activeFiltersCount}
                  </span>
                )}
              </div>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            {/* 1. Search Box */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Search Products</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Name, brand, colour..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>

            {/* 2. Categories */}
            {availableCategories.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Category
                </label>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      selectedCategory === 'ALL'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>All Categories</span>
                    <span className="text-[10px] text-slate-400">{items.length}</span>
                  </button>
                  {availableCategories.map((cat) => {
                    const count = items.filter((it) => it.category?.toLowerCase() === cat.toLowerCase()).length;
                    const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 text-blue-700 font-bold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{cat}</span>
                        <span className="text-[10px] text-slate-400">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Brands Checkboxes */}
            {availableBrands.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Brand / Company</span>
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {availableBrands.map((brandName) => {
                    const isChecked = selectedBrands.includes(brandName);
                    return (
                      <label
                        key={brandName}
                        className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900 cursor-pointer font-medium"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBrands((prev) => [...prev, brandName]);
                            } else {
                              setSelectedBrands((prev) => prev.filter((b) => b !== brandName));
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="truncate">{brandName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Sizes Filter Chips */}
            {availableSizes.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Ruler className="w-3.5 h-3.5 text-slate-500" />
                  <span>Size</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSizes.map((s) => {
                    const isSelected = selectedSizes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedSizes((prev) => prev.filter((x) => x !== s));
                          } else {
                            setSelectedSizes((prev) => [...prev, s]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Colours Filter Swatches */}
            {availableColors.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-slate-500" />
                  <span>Colour</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableColors.map((col) => {
                    const isSelected = selectedColors.includes(col);
                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedColors((prev) => prev.filter((c) => c !== col));
                          } else {
                            setSelectedColors((prev) => [...prev, col]);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                        }`}
                        title={col}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                          style={{ backgroundColor: col.toLowerCase() }}
                        />
                        <span className="text-[11px]">{col}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. Price Range Filter (From X to Y) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                  <span>Price Range (₹)</span>
                </label>
                {(priceMin !== '' || priceMax !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setPriceMin('');
                      setPriceMax('');
                    }}
                    className="text-[10px] text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* From X to Y Input Boxes */}
              <div className="grid grid-cols-2 gap-2 items-center">
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 mb-1">From (Min ₹)</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Min"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      className="w-full pl-6 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:bg-white text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-slate-500 mb-1">To (Max ₹)</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Max"
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      className="w-full pl-6 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 focus:bg-white text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Range Chips (Presets) */}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {[
                  { label: 'Under ₹200', min: '', max: 200 },
                  { label: '₹200 - ₹500', min: 200, max: 500 },
                  { label: '₹500 - ₹1,000', min: 500, max: 1000 },
                  { label: 'Above ₹1,000', min: 1000, max: '' },
                ].map((preset, pIdx) => {
                  const isPresetActive = priceMin === preset.min && priceMax === preset.max;
                  return (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => {
                        if (isPresetActive) {
                          setPriceMin('');
                          setPriceMax('');
                        } else {
                          setPriceMin(preset.min as any);
                          setPriceMax(preset.max as any);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                        isPresetActive
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 7. In-Stock Only Toggle */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer">
                <span>In-Stock Only</span>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </label>
            </div>
          </div>

          {/* MAIN PRODUCT CARDS GRID */}
          <div className="flex-1 w-full space-y-4">
            {/* Filter Status Bar */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-1 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Showing <b>{filteredItems.length}</b> of {items.length} products</span>
                {(priceMin !== '' || priceMax !== '') && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                    <span>Price: ₹{priceMin !== '' ? priceMin : '0'} &ndash; ₹{priceMax !== '' ? priceMax : 'Any'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPriceMin('');
                        setPriceMax('');
                      }}
                      className="hover:text-blue-900 cursor-pointer ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
                <Package className="w-12 h-12 mx-auto text-slate-300" />
                <div className="font-bold text-slate-700">No products match your filter criteria</div>
                <p className="text-xs text-slate-400">Try removing some filters or search keywords.</p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-700"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredItems.map((it) => {
                  const hasImages = it.images && it.images.length > 0;
                  const activeImgIdx = cardImageIndex[it.id!] || 0;
                  const currentImage = hasImages ? it.images![activeImgIdx] || it.images![0] : null;
                  const isOutOfStock = it.stockQuantity <= 0;
                  const isLowStock = !isOutOfStock && it.minStockAlert && it.stockQuantity <= it.minStockAlert;

                  // Estimated MRP markup for visual savings badge
                  const mrpEstimate = Math.round(it.salePrice * 1.3);
                  const discountPct = Math.round(((mrpEstimate - it.salePrice) / mrpEstimate) * 100);

                  return (
                    <div
                      key={it.id}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group"
                    >
                      <div>
                        {/* PRODUCT IMAGE & CAROUSEL (WITH TOUCH SWIPE & LEFT/RIGHT BUTTONS) */}
                        <div 
                          className="relative aspect-square w-full bg-slate-100 overflow-hidden flex items-center justify-center select-none"
                          onTouchStart={(e) => {
                            if (!hasImages || it.images!.length <= 1) return;
                            touchStartXRef.current[it.id!] = e.touches[0].clientX;
                            touchStartYRef.current[it.id!] = e.touches[0].clientY;
                          }}
                          onTouchEnd={(e) => {
                            if (!hasImages || it.images!.length <= 1) return;
                            const startX = touchStartXRef.current[it.id!];
                            const startY = touchStartYRef.current[it.id!];
                            if (startX === undefined) return;
                            const endX = e.changedTouches[0].clientX;
                            const endY = e.changedTouches[0].clientY;
                            const diffX = startX - endX;
                            const diffY = startY - endY;
                            // Horizontal swipe threshold
                            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 25) {
                              if (diffX > 0) {
                                // Swiped Left -> go to Next Image
                                handleNextCardImage(it.id!, it.images!.length);
                              } else {
                                // Swiped Right -> go to Previous Image
                                handlePrevCardImage(it.id!, it.images!.length);
                              }
                            }
                            delete touchStartXRef.current[it.id!];
                            delete touchStartYRef.current[it.id!];
                          }}
                        >
                          {currentImage ? (
                            <img
                              src={currentImage}
                              alt={it.name}
                              onClick={() => handleOpenGallery(it, activeImgIdx)}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-300 p-4">
                              <Package className="w-14 h-14" />
                              <span className="text-[10px] font-bold text-slate-400 mt-1">No Image</span>
                            </div>
                          )}

                          {/* Left & Right Navigation Arrow Buttons directly on card */}
                          {hasImages && it.images!.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrevCardImage(it.id!, it.images!.length);
                                }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/65 hover:bg-slate-900/90 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all cursor-pointer backdrop-blur-2xs"
                                title="Previous photo (or swipe right)"
                              >
                                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNextCardImage(it.id!, it.images!.length);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/65 hover:bg-slate-900/90 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all cursor-pointer backdrop-blur-2xs"
                                title="Next photo (or swipe left)"
                              >
                                <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                              </button>

                              {/* Photo counter badge (e.g. 1 / 3) */}
                              <div className="absolute bottom-2.5 right-2.5 z-10 bg-slate-900/75 backdrop-blur-xs text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                                {activeImgIdx + 1} / {it.images!.length}
                              </div>
                            </>
                          )}

                          {/* Badges on Top-Left */}
                          <div className="absolute top-2.5 left-2.5 z-10 flex flex-col items-start gap-1">
                            {hasImages && activeImgIdx === 0 && (
                              <div className="bg-slate-900/85 backdrop-blur-xs text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                Cover
                              </div>
                            )}
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-xs">
                                Out of Stock
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                                Low: {it.stockQuantity} {it.unit}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                                In Stock
                              </span>
                            )}
                          </div>

                          {/* Top-Right Prominent EDIT Button (Always Visible, 1-tap on tablets) */}
                          {isInventoryManageAllowed && !isKioskMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditItem(it);
                              }}
                              className="absolute top-2.5 right-2.5 z-10 bg-amber-400 hover:bg-amber-500 active:scale-95 text-slate-950 text-[11px] font-black px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1 cursor-pointer transition-transform border border-amber-500/80"
                              title="Edit Product Master"
                            >
                              <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Edit</span>
                            </button>
                          )}

                          {/* Mini Carousel Navigation Dots (If >1 image) */}
                          {hasImages && it.images!.length > 1 && (
                            <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5 z-10">
                              {it.images!.map((_, dotIdx) => (
                                <button
                                  key={dotIdx}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCardImageIndex((prev) => ({ ...prev, [it.id!]: dotIdx }));
                                  }}
                                  className={`rounded-full transition-all cursor-pointer ${
                                    activeImgIdx === dotIdx
                                      ? 'w-4 h-1.5 bg-blue-600 shadow-xs'
                                      : 'w-1.5 h-1.5 bg-white/70 hover:bg-white'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* PRODUCT CARD BODY */}
                        <div className="p-4 space-y-2.5">
                          {/* Brand & Category row */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {it.brand ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-tight">
                                {it.brand}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400">
                                #{it.code}
                              </span>
                            )}

                            {it.category && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                {it.category}
                              </span>
                            )}
                          </div>

                          {/* Product Title */}
                          <h3 
                            className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => {
                              if (!isKioskMode && isInventoryManageAllowed) {
                                onEditItem(it);
                              } else {
                                handleOpenGallery(it);
                              }
                            }}
                            title={it.name}
                          >
                            {it.name}
                          </h3>

                          {/* Pricing & Savings */}
                          <div className="flex items-baseline gap-2 pt-0.5">
                            <span className="text-lg font-black text-slate-900">
                              {formatCurrency(it.salePrice)}
                            </span>
                            {it.salePrice > 0 && (
                              <>
                                <span className="text-xs text-slate-400 line-through">
                                   {formatCurrency(mrpEstimate)}
                                </span>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                                  {discountPct}% OFF
                                </span>
                              </>
                            )}
                          </div>

                          {/* Variants: Size & Multiple Colour Options */}
                          {(() => {
                            const itColors = getItemColors(it);
                            if (!it.size && itColors.length === 0) return null;
                            const currentChosenColor = selectedCardColor[it.id!];

                            return (
                              <div className="pt-2 border-t border-slate-100 text-xs space-y-1.5">
                                {it.size && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                      <Ruler className="w-3 h-3 text-slate-400" />
                                      Size:
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      {it.size}
                                    </span>
                                  </div>
                                )}

                                {itColors.length > 0 && (
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                                        <Palette className="w-3 h-3 text-slate-400" />
                                        <span>Colours:</span>
                                      </span>
                                      {currentChosenColor && (
                                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                          Selected: {currentChosenColor}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {itColors.map((c, idx) => {
                                        const isSelected = currentChosenColor?.toLowerCase() === c.toLowerCase();
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                              setSelectedCardColor((prev) => ({
                                                ...prev,
                                                [it.id!]: isSelected ? '' : c,
                                              }));
                                            }}
                                            className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                                              isSelected
                                                ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-300'
                                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                                            }`}
                                            title={`Tap to select colour: ${c}`}
                                          >
                                            <span
                                              className="w-2.5 h-2.5 rounded-full border border-slate-300 shadow-2xs shrink-0"
                                              style={{ backgroundColor: getColorHex(c) }}
                                            />
                                            <span>{c}</span>
                                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* PRODUCT CARD ACTION BUTTONS */}
                      <div className="p-3.5 pt-0">
                        <div className={`grid ${isInventoryManageAllowed && !isKioskMode ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                          {/* 1. Add to Cart / Bill Button */}
                          <button
                            type="button"
                            onClick={() => handleAddToCart(it)}
                            className="flex items-center justify-center gap-1 px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                            title={isKioskMode ? "Add item to customer selection" : "Add item to invoice / cart"}
                          >
                            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{isKioskMode ? 'Add' : 'Add to Bill'}</span>
                          </button>

                          {/* 2. Direct Edit Button (Prominently visible for already created products) */}
                          {isInventoryManageAllowed && !isKioskMode && (
                            <button
                              type="button"
                              onClick={() => onEditItem(it)}
                              className="flex items-center justify-center gap-1 px-2 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                              title="Edit product name, price, colours, photos, or stock"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>Edit</span>
                            </button>
                          )}

                          {/* 3. Order on WhatsApp Button */}
                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(it)}
                            className="flex items-center justify-center gap-1 px-2 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                            title="Share / Order product via WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">WhatsApp</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================================================== */
        /* VIEW 2: TRADITIONAL ACCOUNTING TABLE VIEW            */
        /* ==================================================== */
        <div className="space-y-3">
          {/* Search Bar with Barcode Scanner Icon */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by name, brand, size, colour, SKU, barcode, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsBarcodeScannerOpen(true)}
              className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Scan barcode with camera to find item"
            >
              <Barcode className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">Scan Barcode</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No inventory items matching your search.
              </div>
            ) : (
              filteredItems.map((it) => {
                const isLowStock = it.minStockAlert && it.stockQuantity <= it.minStockAlert;
                const hasImages = it.images && it.images.length > 0;
                const primaryImage = hasImages ? it.images![0] : null;

                return (
                  <div
                    key={it.id}
                    className="p-3.5 md:p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {primaryImage ? (
                        <div 
                          onClick={() => handleOpenGallery(it, 0)}
                          className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 shadow-2xs cursor-pointer group"
                          title="Click to view full photos"
                        >
                          <img
                            src={primaryImage}
                            alt={it.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          {it.images!.length > 1 && (
                            <div className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[9px] font-bold px-1 rounded-tl">
                              +{it.images!.length - 1}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 shadow-2xs shrink-0">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{it.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-normal">#{it.code}</span>
                          
                          {it.brand && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                              <Building2 className="w-2.5 h-2.5" />
                              <span>{it.brand}</span>
                            </span>
                          )}

                          {it.size && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-0.5">
                              <Ruler className="w-2.5 h-2.5 text-slate-500" />
                              <span>{it.size}</span>
                            </span>
                          )}

                          {(() => {
                            const itColors = getItemColors(it);
                            if (itColors.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1 flex-wrap">
                                {itColors.map((c, idx) => (
                                  <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                                    <span 
                                      className="w-2 h-2 rounded-full border border-slate-300 shrink-0" 
                                      style={{ backgroundColor: getColorHex(c) }} 
                                    />
                                    <span>{c}</span>
                                  </span>
                                ))}
                              </div>
                            );
                          })()}

                          {it.category && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {it.category}
                            </span>
                          )}

                          {it.barcode && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                              <Barcode className="w-3 h-3" /> {it.barcode}
                            </span>
                          )}

                          {it.taxRate !== undefined && it.taxRate > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              {it.taxRate}% GST
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                          <span>Sale: <b className="text-blue-600">{formatCurrency(it.salePrice)}</b></span>
                          <span>&bull;</span>
                          {isPurchasePriceAllowed ? (
                            <span>Buy: <b className="text-slate-600">{formatCurrency(it.purchasePrice)}</b></span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold italic bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              Buy: 🔒 Confidential
                            </span>
                          )}
                          {it.hsnCode && (
                            <>
                              <span>&bull;</span>
                              <span className="font-mono text-[11px]">HSN: {it.hsnCode}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className={`font-black text-sm md:text-base ${isLowStock ? 'text-rose-600' : 'text-slate-800'}`}>
                          {it.stockQuantity} {it.unit}
                        </div>
                        <div className="text-[10px] font-semibold">
                          {isLowStock ? (
                            <span className="text-rose-600 font-bold flex items-center gap-0.5 justify-end">
                              <AlertCircle className="w-3 h-3 inline" /> Low Stock
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-bold">In Stock</span>
                          )}
                        </div>
                      </div>

                      {isInventoryManageAllowed && (
                        <button
                          type="button"
                          onClick={() => onEditItem(it)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95"
                          title="Edit Product Master"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* CART SLIDE-OVER / MODAL                              */}
      {/* ==================================================== */}
      {isCartOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-end"
          onClick={() => setIsCartOpen(false)}
        >
          <div 
            className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cart Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-base">Storefront Billing Cart</h3>
                  <p className="text-[11px] text-slate-400">{cartTotalItemsCount} Items selected</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <ShoppingCart className="w-12 h-12 mx-auto text-slate-300" />
                  <div className="font-bold text-slate-600">Your cart is empty</div>
                  <p className="text-xs">Click 'Add to Bill' on products in the storefront.</p>
                </div>
              ) : (
                cart.map((ci) => {
                  const img = ci.item.images && ci.item.images[0];
                  return (
                    <div key={ci.item.id} className="pt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {img ? (
                          <img src={img} alt={ci.item.name} className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-slate-900 truncate">{ci.item.name}</h4>
                          <div className="text-[11px] text-slate-500">
                            ₹{ci.item.salePrice} each
                            {ci.item.size && ` • Size: ${ci.item.size}`}
                            {ci.item.color && ` • Col: ${ci.item.color}`}
                          </div>
                          <div className="font-bold text-xs text-blue-600 mt-0.5">
                            Total: {formatCurrency(ci.quantity * ci.item.salePrice)}
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(ci.item.id!, ci.quantity - 1)}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-xs font-black w-6 text-center">{ci.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(ci.item.id!, ci.quantity + 1)}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(ci.item.id!)}
                          className="p-1 text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-medium">Cart Total Amount:</span>
                  <span className="font-black text-xl text-slate-900">{formatCurrency(cartTotalAmount)}</span>
                </div>

                {isKioskMode && (
                  <div className="bg-purple-50 border border-purple-200/80 rounded-xl p-2.5 text-[11px] text-purple-900 flex items-start gap-2">
                    <Tablet className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <span>Send this selection on WhatsApp or hand the tablet to our counter to get your printed bill!</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleShareCartWhatsApp}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp Order</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleProceedToInvoice}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer"
                  >
                    <span>{isKioskMode ? 'Staff Bill Items' : 'Create Invoice'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="w-full text-center text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear All Cart Items
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={(scanned) => setSearchQuery(scanned)}
        title="Scan Barcode to Locate Item"
      />

      {/* Multi-Image Gallery Lightbox Modal */}
      {galleryItem && galleryItem.images && galleryItem.images.length > 0 && (
        <div 
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setGalleryItem(null)}
        >
          <div 
            className="relative max-w-xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gallery Header */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800 text-white">
              <div>
                <h4 className="font-bold text-sm text-slate-100">{galleryItem.name}</h4>
                <p className="text-[11px] text-slate-400">
                  Photo {activeImageIndex + 1} of {galleryItem.images.length}
                  {galleryItem.brand ? ` • ${galleryItem.brand}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isInventoryManageAllowed && !isKioskMode && (
                  <button
                    type="button"
                    onClick={() => {
                      const it = galleryItem;
                      setGalleryItem(null);
                      onEditItem(it);
                    }}
                    className="px-2.5 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    title="Edit Product Master"
                  >
                    <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Edit Product</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGalleryItem(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Main Active Image with Prev / Next Navigation */}
            <div 
              className="relative w-full h-80 sm:h-96 flex items-center justify-center my-3 bg-black/40 rounded-xl overflow-hidden touch-pan-y"
              onTouchStart={(e) => {
                const touch = e.touches[0];
                (e.currentTarget as any)._touchStartX = touch.clientX;
              }}
              onTouchEnd={(e) => {
                const touchStartX = (e.currentTarget as any)._touchStartX;
                if (typeof touchStartX === 'number' && galleryItem.images && galleryItem.images.length > 1) {
                  const touchEndX = e.changedTouches[0].clientX;
                  const diffX = touchEndX - touchStartX;
                  if (diffX < -30) {
                    // Swiped Left -> Next Image
                    setActiveImageIndex((prev) => (prev < galleryItem.images!.length - 1 ? prev + 1 : 0));
                  } else if (diffX > 30) {
                    // Swiped Right -> Prev Image
                    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : galleryItem.images!.length - 1));
                  }
                }
              }}
            >
              <img
                src={galleryItem.images[activeImageIndex]}
                alt={`Photo ${activeImageIndex + 1}`}
                className="max-h-full max-w-full object-contain select-none pointer-events-none"
              />

              {galleryItem.images.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : galleryItem.images!.length - 1))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-all cursor-pointer z-10"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setActiveImageIndex((prev) => (prev < galleryItem.images!.length - 1 ? prev + 1 : 0))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-all cursor-pointer z-10"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Strip (Up to 4) */}
            {galleryItem.images.length > 1 && (
              <div className="flex items-center gap-2 pt-1">
                {galleryItem.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      activeImageIndex === idx ? 'border-blue-500 scale-105' : 'border-slate-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
