import React, { useState, useEffect } from 'react';
import { X, Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

interface AttachmentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  attachments?: string[];
  title?: string;
}

export const AttachmentViewerModal: React.FC<AttachmentViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  attachments = [],
  title = 'Voucher Attachment / Bill Photo',
}) => {
  const images = attachments.length > 0 ? attachments : imageUrl ? [imageUrl] : [];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [isOpen, imageUrl, attachments]);

  if (!isOpen || images.length === 0) return null;

  const currentImg = images[currentIndex] || images[0];

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentImg;
    a.download = `Voucher_Attachment_${Date.now()}_${currentIndex + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-bold text-sm">{title}</h3>
              {images.length > 1 && (
                <span className="text-[11px] text-slate-400">
                  Image {currentIndex + 1} of {images.length}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Download image"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Content */}
        <div className="relative flex-1 overflow-auto p-4 flex items-center justify-center bg-black/50 min-h-[300px]">
          <img
            src={currentImg}
            alt={title}
            className="max-h-[65vh] w-auto object-contain rounded-lg shadow-md"
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-all shadow-md cursor-pointer"
                title="Previous Image"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-all shadow-md cursor-pointer"
                title="Next Image"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail bar if multiple */}
        {images.length > 1 && (
          <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-center gap-2 overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                  currentIndex === idx ? 'border-blue-500 scale-105' : 'border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
