import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeApp } from '../nativeRuntime';

function safeFileName(value: string): string {
  // This API accepts a filename, never a path supplied by a caller.
  if (!value || /[/\\\u0000-\u001f\u007f]/.test(value) || /^\s*\.{1,2}\s*$/.test(value)) {
    throw new Error('保存するファイル名を確認できませんでした。');
  }
  const name = value.normalize('NFC').trim().replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '');
  if (!name || new TextEncoder().encode(name).length > 240) {
    throw new Error('保存するファイル名を確認できませんでした。');
  }
  return name;
}

function exportFailure(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String((cause as { message?: unknown })?.message ?? '');
  return /cancel(?:led|ed)?/i.test(message)
    ? new Error('ファイルの保存・共有をキャンセルしました。')
    : new Error('ファイルを保存・共有できませんでした。もう一度お試しください。');
}

/** Export existing text data without changing the stored FarmPro records. */
export async function exportTextFile(fileName: string, text: string, mimeType: string): Promise<void> {
  const name = safeFileName(fileName);
  if (!isNativeApp()) {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement('a');
    try {
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
    return;
  }

  // A separate directory keeps the user's filename and prevents concurrent
  // exports from overwriting each other's temporary contents.
  const folder = `farmpro-exports/${crypto.randomUUID()}`;
  const path = `${folder}/${name}`;
  let written = false;
  let failure: Error | undefined;
  try {
    const result = await Filesystem.writeFile({
      path, directory: Directory.Cache, data: text, encoding: Encoding.UTF8, recursive: true,
    });
    written = true;
    if (!result.uri.startsWith('file://')) throw new Error('Invalid exported file URI');
    // On iOS the plugin resolves only after the chosen activity completes and
    // rejects when the user cancels. Do not show success before this settles.
    await Share.share({ title: name, files: [result.uri], dialogTitle: 'ファイルを保存・共有' });
  } catch (cause) {
    failure = exportFailure(cause);
  } finally {
    if (written) {
      try {
        await Filesystem.deleteFile({ path, directory: Directory.Cache });
        await Filesystem.rmdir({ path: folder, directory: Directory.Cache });
      } catch {
        failure ??= new Error('ファイルの共有は完了しましたが、一時ファイルを削除できませんでした。');
      }
    } else {
      // A failed write may have created a partial file. Only this export's
      // generated directory is eligible for cleanup; the source data stays put.
      try { await Filesystem.rmdir({ path: folder, directory: Directory.Cache, recursive: true }); } catch { /* Missing after a failed write is expected. */ }
    }
  }
  if (failure) throw failure;
}
