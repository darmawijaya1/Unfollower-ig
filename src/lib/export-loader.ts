import JSZip from "jszip";
import { classifyExportFile, mergeExportFiles, type ParsedExport } from "./export-parser";

const MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Baca file yang dipilih pengguna: bisa ZIP hasil unduhan Instagram utuh,
 * atau file followers_*.json / following.json satuan.
 * Semua diproses di browser — tidak ada yang dikirim ke server.
 */
export async function loadExportFiles(files: File[]): Promise<ParsedExport> {
  const collected: { path: string; json: unknown }[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`File "${file.name}" terlalu besar.`);

    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || !classifyExportFile(entry.name)) continue;
        collected.push({ path: entry.name, json: JSON.parse(await entry.async("string")) });
      }
    } else if (/\.json$/i.test(file.name)) {
      if (!classifyExportFile(file.name)) continue;
      collected.push({ path: file.name, json: JSON.parse(await file.text()) });
    }
  }

  const result = mergeExportFiles(collected);
  if (result.followers.length === 0 || result.following.length === 0) {
    throw new Error(
      "File followers dan following tidak ditemukan. Pastikan kamu mengunduh data dengan format JSON dan memilih ZIP-nya (atau file followers_1.json + following.json).",
    );
  }
  return result;
}
