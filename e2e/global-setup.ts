import { CAMERA_CODES, CAMERA_VIDEO, writeBarcodeVideo } from "./tests/barcodes";

export default function globalSetup() {
  // The camera tests' browser reads this file as its webcam; it must exist before launch.
  writeBarcodeVideo(CAMERA_VIDEO, CAMERA_CODES);
}
