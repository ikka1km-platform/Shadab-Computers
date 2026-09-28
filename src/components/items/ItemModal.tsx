import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Trash2, 
  Barcode, 
  Camera, 
  Upload, 
  Image as ImageIcon, 
  Plus, 
  Eye, 
  Star, 
  Palette, 
  Ruler, 
  Building2,
  AlertCircle,
  Check,
  Edit3,
} from 'lucide-react';
import { Item } from '../../types';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import { compressImage } from '../../utils/imageCompressor';
import { POPULAR_COLORS, getColorHex, getItemColors } from '../../utils/productVariants';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Partial<Item>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  itemToEdit?: Item | null;
}

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  itemToEdit,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [category, setCategory] = useState('');

  // Brand, Size & Colour(s)
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');

  // Automatically parses multiple colours separated by comma (,) or slash (/)
  const parsedColors = useMemo(() => getItemColors({ color }), [color]);

  // Up to 4 Images
  const [images, setImages] = useState<string[]>([]);
  const [isCompressingImages, setIsCompressingImages] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Pricing & Stock
  const [salePrice, setSalePrice] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [unit, setUnit] = useState('Pcs');
  const [stockQuantity, setStockQuantity] = useState<number>(0);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (itemToEdit) {
      setName(itemToEdit.name || '');
      setCode(itemToEdit.code || '');
      setBarcode(itemToEdit.barcode || '');
      setHsnCode(itemToEdit.hsnCode || '');
      setCategory(itemToEdit.category || '');
      setBrand(itemToEdit.brand || '');
      setSize(itemToEdit.size || '');
      setColor(itemToEdit.color || (itemToEdit.colors ? itemToEdit.colors.join(', ') : ''));
      setImages(itemToEdit.images ? [...itemToEdit.images].slice(0, 4) : []);
      setSalePrice(itemToEdit.salePrice || 0);
      setPurchasePrice(itemToEdit.purchasePrice || 0);
      setTaxRate(itemToEdit.taxRate || 0);
      setUnit(itemToEdit.unit || 'Pcs');
      setStockQuantity(itemToEdit.stockQuantity || 0);
      setMinStockAlert(itemToEdit.minStockAlert || 5);
    } else {
      setName('');
      setCode(`ITM-${Math.floor(100 + Math.random() * 900)}`);
      setBarcode('');
      setHsnCode('');
      setCategory('');
      setBrand('');
      setSize('');
      setColor('');
      setImages([]);
      setSalePrice(0);
      setPurchasePrice(0);
      setTaxRate(0);
      setUnit('Pcs');
      setStockQuantity(0);
      setMinStockAlert(5);
    }
  }, [itemToEdit, isOpen]);

  if (!isOpen) return null;

  // Handle uploading 1 or multiple photos (up to 4)
  const handleImageFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const availableSlots = 4 - images.length;
    if (availableSlots <= 0) {
      alert('You have already reached the maximum limit of 4 product images. Delete an image first to upload a new one.');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, availableSlots);
    setIsCompressingImages(true);

    try {
      const compressedDataUrls: string[] = [];
      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) continue;
        const compressed = await compressImage(file, 800, 800, 0.82);
        compressedDataUrls.push(compressed);
      }

      setImages((prev) => [...prev, ...compressedDataUrls].slice(0, 4));
    } catch (err) {
      console.error('Error compressing product images:', err);
      alert('Failed to process image file. Please try a different image.');
    } finally {
      setIsCompressingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSetPrimaryCover = (indexToPrimary: number) => {
    if (indexToPrimary === 0) return;
    setImages((prev) => {
      const next = [...prev];
      const [selected] = next.splice(indexToPrimary, 1);
      next.unshift(selected);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!itemToEdit?.id || !onDelete) return;
    if (window.confirm(`Are you sure you want to delete ${itemToEdit.name}?`)) {
      setLoading(true);
      try {
        await onDelete(itemToEdit.id);
        onClose();
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onSave({
        name: name.trim(),
        code: code.trim(),
        barcode: barcode.trim() || undefined,
        hsnCode: hsnCode.trim() || undefined,
        category: category.trim() || undefined,
        brand: brand.trim() || undefined,
        size: size.trim() || undefined,
        color: color.trim() || undefined,
        colors: parsedColors.length > 0 ? parsedColors : undefined,
        images: images.length > 0 ? images : undefined,
        salePrice: Number(salePrice),
        purchasePrice: Number(purchasePrice),
        taxRate: Number(taxRate),
        unit,
        stockQuantity: Number(stockQuantity),
        minStockAlert: Number(minStockAlert),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${itemToEdit ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {itemToEdit ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                {itemToEdit ? (
                  <>
                    <span className="text-amber-400">Edit Product:</span>
                    <span className="text-slate-100 max-w-[200px] sm:max-w-xs truncate">{itemToEdit.name}</span>
                  </>
                ) : (
                  <span>Add New Product / Item</span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {itemToEdit 
                  ? `Editing SKU #${itemToEdit.code} • Update Colours, Images, Pricing & Stock` 
                  : 'Photos, Brand, Size, Multiple Colours, Pricing & Inventory Master'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* SECTION 1: PRODUCT IMAGES (UP TO 4) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-indigo-600" />
                  <span>Product Photos</span>
                  <span className="text-[11px] font-semibold text-slate-500 font-mono">
                    ({images.length}/4 Uploaded)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400">Upload up to 4 high-res photos. First image is the main cover.</p>
              </div>

              {images.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressingImages}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isCompressingImages ? 'Optimizing...' : 'Upload Photos'}</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageFilesSelected}
                className="hidden"
              />
            </div>

            {/* 4 Interactive Photo Slots */}
            <div className="grid grid-cols-4 gap-2.5">
              {[0, 1, 2, 3].map((slotIdx) => {
                const imgUrl = images[slotIdx];
                const isCover = slotIdx === 0;

                if (imgUrl) {
                  return (
                    <div
                      key={slotIdx}
                      className="relative group aspect-square rounded-xl overflow-hidden border-2 border-slate-200 bg-white shadow-2xs flex items-center justify-center"
                    >
                      <img
                        src={imgUrl}
                        alt={`Product ${slotIdx + 1}`}
                        className="w-full h-full object-cover"
                      />

                      {/* Main Cover Badge */}
                      {isCover && (
                        <div className="absolute top-1 left-1 bg-emerald-600/90 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-2xs uppercase tracking-tight flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-white" /> Cover
                        </div>
                      )}

                      {/* Hover / Overlay Controls */}
                      <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(imgUrl)}
                            className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-transform hover:scale-105 shadow-xs cursor-pointer"
                            title="Preview Large"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(slotIdx)}
                            className="p-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg transition-transform hover:scale-105 shadow-xs cursor-pointer"
                            title="Remove Photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {!isCover && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryCover(slotIdx)}
                            className="text-[9px] font-bold text-white bg-slate-800/90 hover:bg-slate-800 px-1.5 py-0.5 rounded transition-all cursor-pointer shadow-xs"
                          >
                            Make Cover
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={slotIdx}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressingImages}
                    className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-indigo-600 cursor-pointer p-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-[10px] font-bold">
                      {isCover ? 'Cover Photo' : `Slot ${slotIdx + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: BASIC PRODUCT IDENTIFICATION */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Item / Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Cotton Polo T-Shirt, Basmati Rice (5kg)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Item Code / SKU</label>
                <input
                  type="text"
                  placeholder="ITM-101"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Apparel, Grocery, Footwear"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: BRAND, SIZE & COLOURS (CLEAN 3-COLUMN LAYOUT) */}
          <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                Brand & Variant Specifications
              </span>
              {itemToEdit && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-100/70 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Modifying Product
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Brand / Company Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-500" />
                  Brand / Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nike, Tata, Samsung"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
              </div>

              {/* 2. Size */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Ruler className="w-3 h-3 text-slate-500" />
                  Size / Dimension / Pack
                </label>
                <input
                  type="text"
                  placeholder="e.g. M, XL, 42, 5kg, 100ml"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
              </div>

              {/* 3. Colour(s) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Palette className="w-3 h-3 text-slate-500" />
                    Colour(s)
                  </span>
                  {parsedColors.length > 1 && (
                    <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100 px-1.5 py-0.2 rounded-full">
                      {parsedColors.length} Colours
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Blue, White, Red, Green"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">Separate multiple colours with comma or slash ( , or / )</p>

                {/* Live parsed colour dots preview */}
                {parsedColors.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {parsedColors.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                          style={{ backgroundColor: getColorHex(c) }}
                        />
                        <span>{c}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4: BARCODE & HSN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">Barcode / EAN</label>
                <button
                  type="button"
                  onClick={() => setIsBarcodeScannerOpen(true)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                  title="Scan barcode with camera"
                >
                  <Barcode className="w-3 h-3" /> Scan
                </button>
              </div>
              <input
                type="text"
                placeholder="8901030887309"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">HSN / SAC Code</label>
              <input
                type="text"
                placeholder="1006 (GST HSN)"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase"
              />
            </div>
          </div>

          {/* SECTION 5: PRICING & GST */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sale Price (₹)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={salePrice || ''}
                onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-bold text-blue-700 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Price</label>
              <input
                type="number"
                min="0"
                step="any"
                value={purchasePrice || ''}
                onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">GST Tax Rate</label>
              <select
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value={0}>0% (None)</option>
                <option value={5}>5% GST</option>
                <option value={12}>12% GST</option>
                <option value={18}>18% GST</option>
                <option value={28}>28% GST</option>
              </select>
            </div>
          </div>

          {/* SECTION 6: STOCK & UNITS */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Stock Qty</label>
              <input
                type="number"
                value={stockQuantity || ''}
                onChange={(e) => setStockQuantity(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {['Pcs', 'Kg', 'Bag', 'Box', 'Litre', 'Gram', 'Mtr', 'Dozen', 'Pack', 'Bottle', 'Pair'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Min Alert</label>
              <input
                type="number"
                value={minStockAlert || ''}
                onChange={(e) => setMinStockAlert(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
            {itemToEdit && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || isCompressingImages}
                className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? 'Saving...' : itemToEdit ? 'Update Item' : 'Save Item'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={(scanned) => setBarcode(scanned)}
        title="Scan Barcode to Assign to Item"
      />

      {/* Large Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[80vh] w-auto max-w-full object-contain rounded-xl mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
};
