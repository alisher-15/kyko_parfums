import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { apiFile, type Query } from "./api";

/** A file the customer or staff picked, ready to go into a FormData. */
export interface PickedFile {
  name: string;
  type: string;
  /** Native: the file's uri; web: the File object itself. */
  part: Blob | { uri: string; name: string; type: string };
}

/**
 * A FormData with one file under `field` (the API takes uploads as `file`).
 *
 * The browser takes a Blob and a name. On phones the app's `fetch` is Expo's (`expo/fetch`,
 * installed globally since SDK 52), which can't send React Native's `{uri, name, type}` parts:
 * it reads a part through `bytes()`. So the phone's file goes in as a part that reads its bytes
 * from disk when the request is sent.
 */
export function formWith(file: PickedFile, field = "file"): FormData {
  const form = new FormData();
  const part = file.part;
  if (part instanceof Blob) {
    form.append(field, part, file.name);
  } else {
    const onDisk = new File(part.uri);
    const upload = { name: file.name, type: file.type, bytes: () => onDisk.bytes() };
    form.append(field, upload as unknown as Blob, file.name);
  }
  return form;
}

/** A photo from the gallery or, with `camera`, a new one. Null when the person cancels. */
export async function pickImage(camera = false): Promise<PickedFile | null> {
  if (camera) {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9 };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? "image/jpeg";
  const name = asset.fileName ?? `photo.${type.split("/")[1] ?? "jpg"}`;
  return { name, type, part: asset.file ?? { uri: asset.uri, name, type } };
}

const EXCEL = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/comma-separated-values",
];

/** An Excel or CSV file from the phone (an import, a price list). */
export async function pickSpreadsheet(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: EXCEL, copyToCacheDirectory: true });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? "application/octet-stream";
  return { name: asset.name, type, part: asset.file ?? { uri: asset.uri, name: asset.name, type } };
}

/**
 * Fetch a protected file from the API and hand it to the phone's «Поделиться» (save to Files,
 * send in WhatsApp…); in the web build it downloads.
 */
export async function saveAndShare(
  path: string,
  filename: string,
  mimeType: string,
  query?: Query,
): Promise<void> {
  const bytes = await apiFile(path, query);
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

/**
 * A picture made in the app (a data URL, e.g. a banner preview) to the phone's «Поделиться»:
 * Instagram, WhatsApp, Photos. In the web build it downloads.
 */
export async function shareDataUrl(dataUrl: string, filename: string): Promise<void> {
  const [head, b64] = dataUrl.split(",", 2);
  const mimeType = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
    return;
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
