import { create } from 'zustand';

// Import your Image type - adjust the path based on where it's defined
// For example: import { Image } from '@/types/image';
// If you don't have a central types file, you can redefine it here:

export interface ExifData {
  [key: string]: any;
}

export interface Image {
  id: number;
  uuid: string;
  filename: string;
  originalName: string;
  filePath: string;
  thumbnailPath: string;
  fileSize: number;
  format: 'jpg' | 'jpeg' | 'png' | 'tif' | 'tiff';
  width: number;
  height: number;
  hash: string;
  mimeType: string;
  isCorrupted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  exifData?: ExifData;
  previewUrl?: string; // For local file previews
}

type ViewMode = 'view' | 'crop';

interface ImageViewerState {
  isOpen: boolean;
  currentImage: Image | null;
  images: Image[];
  currentIndex: number;
  viewMode: ViewMode;
  readOnly: boolean;
  openViewer: (images: Image[], index: number, readOnly?: boolean) => void;
  closeViewer: () => void;
  nextImage: () => void;
  previousImage: () => void;
  enterCropMode: () => void;
  exitCropMode: () => void;
}

export const useImageViewerStore = create<ImageViewerState>((set, get) => ({
  isOpen: false,
  currentImage: null,
  images: [],
  currentIndex: 0,
  viewMode: 'view',
  readOnly: false,

  openViewer: (images, index, readOnly = false) => {
    set({
      isOpen: true,
      images,
      currentIndex: index,
      currentImage: images[index],
      viewMode: 'view',
      readOnly,
    });
  },

  closeViewer: () => {
    set({
      isOpen: false,
      currentImage: null,
      images: [],
      currentIndex: 0,
      viewMode: 'view',
      readOnly: false,
    });
  },

  nextImage: () => {
    const { images, currentIndex } = get();
    const nextIndex = (currentIndex + 1) % images.length;
    set({
      currentIndex: nextIndex,
      currentImage: images[nextIndex],
      viewMode: 'view',
    });
  },

  previousImage: () => {
    const { images, currentIndex } = get();
    const prevIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1;
    set({
      currentIndex: prevIndex,
      currentImage: images[prevIndex],
      viewMode: 'view',
    });
  },

  enterCropMode: () => {
    set({ viewMode: 'crop' });
  },

  exitCropMode: () => {
    set({ viewMode: 'view' });
  },
}));
