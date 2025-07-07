
import React, { useEffect } from 'react';
import type { Html5QrcodeScanner, QrCodeSuccessCallback, QrCodeErrorCallback } from 'html5-qrcode';
import { CameraIcon } from './icons';

declare var Html5QrcodeScanner: {
  new(elementId: string, config: any, verbose: boolean): Html5QrcodeScanner;
};

interface ScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure: (error: string) => void;
}

const SCANNER_REGION_ID = "scanner-region";

const Scanner: React.FC<ScannerProps> = ({ onScanSuccess, onScanFailure }) => {
  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    const successCallback: QrCodeSuccessCallback = (decodedText, decodedResult) => {
      if (scanner) {
        scanner.pause(true); // Pause scanner on success
      }
      onScanSuccess(decodedText);
    };

    const errorCallback: QrCodeErrorCallback = (error) => {
      // Don't report "QR code not found" errors, as they are very frequent.
      // onScanFailure(error);
    };

    try {
      scanner = new Html5QrcodeScanner(
        SCANNER_REGION_ID,
        { 
          fps: 10, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdge * 0.8);
              return {
                  width: qrboxSize,
                  height: qrboxSize,
              };
          },
          rememberLastUsedCamera: true,
          supportedScanTypes: [0], // 0 for camera
        },
        false // verbose
      );
      scanner.render(successCallback, errorCallback);
    } catch (e) {
      console.error("Failed to initialize scanner", e);
      onScanFailure("Failed to initialize scanner. Please ensure camera permissions are granted and refresh the page.");
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(error => {
          console.error("Failed to clear scanner on cleanup.", error);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full p-4 bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold text-white mb-2 flex items-center">
        <CameraIcon className="w-6 h-6 mr-2" />
        ISBN Scanner
      </h2>
      <div id={SCANNER_REGION_ID} className="w-full rounded-md overflow-hidden"></div>
    </div>
  );
};

export default Scanner;
