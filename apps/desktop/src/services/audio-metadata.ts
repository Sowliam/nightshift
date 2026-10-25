/**
 * Audio Metadata & ID3 Cover Art Extractor
 * Extracts embedded album artwork (ID3v2 APIC), title (TIT2), and artist (TPE1)
 * from MP3 / audio ArrayBuffer so imported songs show real album covers.
 */

export interface ExtractedAudioMeta {
  artworkUrl?: string; // Data URL for the album cover image
  title?: string;
  artist?: string;
}

/**
 * Extracts ID3v2 metadata and album artwork from an audio File / ArrayBuffer.
 */
export async function extractAudioMetadata(file: File): Promise<ExtractedAudioMeta> {
  try {
    const buffer = await file.slice(0, Math.min(file.size, 5 * 1024 * 1024)).arrayBuffer();
    const view = new DataView(buffer);

    // Check for "ID3" tag signature at start
    if (view.byteLength < 10) return {};
    const id3 = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
    if (id3 !== 'ID3') {
      return {};
    }

    const versionMajor = view.getUint8(3); // e.g. 3 for ID3v2.3, 4 for ID3v2.4
    const flags = view.getUint8(5);
    const hasExtendedHeader = (flags & 0x40) !== 0;

    // Synchsafe integer tag size (4 bytes, 7 bits each)
    const tagSize =
      ((view.getUint8(6) & 0x7f) << 21) |
      ((view.getUint8(7) & 0x7f) << 14) |
      ((view.getUint8(8) & 0x7f) << 7) |
      (view.getUint8(9) & 0x7f);

    let offset = 10;
    if (hasExtendedHeader && offset + 4 < view.byteLength) {
      const extSize =
        ((view.getUint8(offset) & 0x7f) << 21) |
        ((view.getUint8(offset + 1) & 0x7f) << 14) |
        ((view.getUint8(offset + 2) & 0x7f) << 7) |
        (view.getUint8(offset + 3) & 0x7f);
      offset += extSize;
    }

    const maxOffset = Math.min(view.byteLength - 10, offset + tagSize);
    let artworkUrl: string | undefined;
    let title: string | undefined;
    let artist: string | undefined;

    while (offset < maxOffset) {
      // Frame ID (4 ASCII chars)
      if (offset + 10 > view.byteLength) break;
      const frameId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );

      // Null padding reached
      if (frameId.charCodeAt(0) === 0) break;

      // Frame size
      let frameSize = 0;
      if (versionMajor === 4) {
        // synchsafe in v2.4
        frameSize =
          ((view.getUint8(offset + 4) & 0x7f) << 21) |
          ((view.getUint8(offset + 5) & 0x7f) << 14) |
          ((view.getUint8(offset + 6) & 0x7f) << 7) |
          (view.getUint8(offset + 7) & 0x7f);
      } else {
        frameSize = view.getUint32(offset + 4, false);
      }

      const frameDataOffset = offset + 10;
      if (frameSize <= 0 || frameDataOffset + frameSize > view.byteLength) {
        break;
      }

      // Check for APIC (Attached Picture)
      if (frameId === 'APIC' && !artworkUrl) {
        try {
          const encoding = view.getUint8(frameDataOffset);
          let mimeEnd = frameDataOffset + 1;
          while (mimeEnd < frameDataOffset + frameSize && view.getUint8(mimeEnd) !== 0) {
            mimeEnd++;
          }
          let mimeType = 'image/jpeg';
          if (mimeEnd > frameDataOffset + 1) {
            const bytes: number[] = [];
            for (let i = frameDataOffset + 1; i < mimeEnd; i++) {
              bytes.push(view.getUint8(i));
            }
            mimeType = String.fromCharCode(...bytes);
          }
          if (mimeType === '-->') mimeType = 'image/jpeg';

          // Skip picture type byte (1 byte)
          let descStart = mimeEnd + 1 + 1;
          let descEnd = descStart;

          // Find end of description based on encoding (0/3 = 1 null, 1/2 = 2 nulls)
          if (encoding === 1 || encoding === 2) {
            while (descEnd + 1 < frameDataOffset + frameSize) {
              if (view.getUint8(descEnd) === 0 && view.getUint8(descEnd + 1) === 0) {
                descEnd += 2;
                break;
              }
              descEnd += 2;
            }
          } else {
            while (descEnd < frameDataOffset + frameSize && view.getUint8(descEnd) !== 0) {
              descEnd++;
            }
            descEnd++; // skip null terminator
          }

          const imageStart = descEnd;
          const imageSize = frameDataOffset + frameSize - imageStart;
          if (imageSize > 100) {
            const imgBytes = new Uint8Array(buffer, imageStart, imageSize);
            const blob = new Blob([imgBytes], { type: mimeType });
            artworkUrl = await blobToDataUrl(blob);
          }
        } catch (e) {
          console.warn('Error reading APIC frame:', e);
        }
      } else if (frameId === 'TIT2' && !title) {
        // Track Title
        title = readTextFrame(view, frameDataOffset, frameSize);
      } else if (frameId === 'TPE1' && !artist) {
        // Track Artist
        artist = readTextFrame(view, frameDataOffset, frameSize);
      }

      offset = frameDataOffset + frameSize;
    }

    return { artworkUrl, title, artist };
  } catch (err) {
    console.warn('extractAudioMetadata failed:', err);
    return {};
  }
}

function readTextFrame(view: DataView, offset: number, size: number): string {
  try {
    const encoding = view.getUint8(offset);
    const bytes = new Uint8Array(view.buffer, offset + 1, size - 1);
    if (encoding === 1 || encoding === 2) {
      // UTF-16
      const decoder = new TextDecoder(encoding === 1 ? 'utf-16' : 'utf-16be');
      return decoder.decode(bytes).replace(/\0.*$/g, '').trim();
    } else {
      // ISO-8859-1 or UTF-8
      const decoder = new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1');
      return decoder.decode(bytes).replace(/\0.*$/g, '').trim();
    }
  } catch {
    return '';
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
