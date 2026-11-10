//#region imports
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Translation } from '@taon-dev/i18n/src';
import { Taon, type TaonStorageObject } from 'taon/src';

import { TaonSudoApiService } from '../../../taon-sudo/taon-sudo.api.service';
import { TaonSudoUtils } from '../../../taon-sudo/taon-sudo.utils';
//#endregion

const t = Translation.for(Taon.__FILE_RELATIVE_PATH, Taon.LANG_IMPORT_MAP);

export type TaonSudoBucketPreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'rtf'
  | 'other';

/**
 * Images/PDFs above this size are not loaded until the user asks for it.
 */
const AUTO_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

const TEXT_PREVIEW_MAX_BYTES = 64 * 1024;

@Component({
  selector: 'taon-sudo-bucket-asset-preview',
  templateUrl: './taon-sudo-bucket-asset-preview.component.html',
  styleUrls: ['./taon-sudo-bucket-asset-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
})
export class TaonSudoBucketAssetPreviewComponent implements OnInit {
  readonly t = t.for(this);

  @Input({ required: true })
  asset!: TaonStorageObject;

  @Input({ required: true })
  contextName!: string;

  @Input({ required: true })
  controllerName!: string;

  private readonly api = inject(TaonSudoApiService);

  private readonly sanitizer = inject(DomSanitizer);

  private readonly destroyRef = inject(DestroyRef);

  readonly url = signal('');

  readonly pdfUrl = signal<SafeResourceUrl | undefined>(undefined);

  readonly text = signal('');

  readonly textTruncated = signal(false);

  readonly loading = signal(false);

  readonly error = signal('');

  readonly previewRequested = signal(false);

  readonly kind = signal<TaonSudoBucketPreviewKind>('other');

  readonly needsManualLoad = computed(
    () =>
      ['image', 'pdf'].includes(this.kind()) &&
      Number(this.asset?.size) > AUTO_PREVIEW_MAX_BYTES &&
      !this.previewRequested(),
  );

  readonly formatBytes = TaonSudoUtils.formatBytes;

  readonly textPreviewLimit = TEXT_PREVIEW_MAX_BYTES;

  ngOnInit(): void {
    this.kind.set(this.detectKind());
    void this.load();
  }

  loadPreview(): void {
    this.previewRequested.set(true);
    void this.load();
  }

  download(): void {
    const link = document.createElement('a');
    link.href = this.api.getBucketFileUrl(
      this.contextName,
      this.controllerName,
      this.asset.key,
      true,
    );
    link.download = this.asset.fileName || '';
    link.click();
  }

  mediaError(): void {
    this.error.set(
      this.t.gettext(
        'The preview could not be displayed. The file may be unsupported by this browser.',
      ),
    );
  }

  async load(): Promise<void> {
    if (this.loading() || this.needsManualLoad()) {
      return;
    }
    this.error.set('');
    const url = this.api.getBucketFileUrl(
      this.contextName,
      this.controllerName,
      this.asset.key,
    );
    const kind = this.kind();
    if (kind === 'other') {
      return;
    }
    if (kind === 'pdf') {
      // URL is built by our api service (same backend) - not user input
      this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      return;
    }
    if (kind !== 'text' && kind !== 'rtf') {
      this.url.set(url);
      return;
    }
    this.loading.set(true);
    try {
      const result = await this.api.fetchBucketFileTextPreview(
        this.contextName,
        this.controllerName,
        this.asset.key,
        TEXT_PREVIEW_MAX_BYTES,
      );
      if (this.destroyRef.destroyed) {
        return;
      }
      this.text.set(
        kind === 'rtf' ? this.rtfToPlainText(result.text) : result.text,
      );
      this.textTruncated.set(result.truncated);
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed) {
        console.error('[taon-sudo-bucket-asset-preview] Preview failed', error);
        this.error.set(this.t.gettext('The preview could not be loaded.'));
      }
    } finally {
      if (!this.destroyRef.destroyed) {
        this.loading.set(false);
      }
    }
  }

  private detectKind(): TaonSudoBucketPreviewKind {
    const contentType = (this.asset.contentType || '').trim().toLowerCase();
    const name = (this.asset.fileName || this.asset.key || '').toLowerCase();
    if (contentType === 'image/svg+xml' || name.endsWith('.svg')) {
      // rendered through <img>, so scripts inside SVG are not executed
      return 'image';
    }
    if (contentType.startsWith('image/')) {
      return 'image';
    }
    if (contentType.startsWith('video/')) {
      return 'video';
    }
    if (contentType.startsWith('audio/')) {
      return 'audio';
    }
    if (contentType === 'application/pdf') {
      return 'pdf';
    }
    if (
      contentType === 'application/rtf' ||
      contentType === 'text/rtf' ||
      name.endsWith('.rtf')
    ) {
      return 'rtf';
    }
    if (contentType === 'text/plain' || name.endsWith('.txt')) {
      return 'text';
    }
    return 'other';
  }

  /**
   * Very small RTF -> plain text converter (preview only, never renders RTF/HTML).
   */
  private rtfToPlainText(rtf: string): string {
    let output = '';
    const stack: boolean[] = [];
    let skipGroup = false;
    let index = 0;
    const skipDestinations = new Set([
      'fonttbl',
      'colortbl',
      'stylesheet',
      'info',
      'pict',
      'header',
      'footer',
      'listtable',
      'listoverridetable',
      'rsidtbl',
      'generator',
      'themedata',
      'colorschememapping',
      'latentstyles',
      'datastore',
      'xmlnstbl',
    ]);
    while (index < rtf.length) {
      const char = rtf[index];
      if (char === '{') {
        stack.push(skipGroup);
        index++;
        continue;
      }
      if (char === '}') {
        skipGroup = stack.pop() ?? false;
        index++;
        continue;
      }
      if (char === '\\') {
        const next = rtf[index + 1];
        if (next === '\\' || next === '{' || next === '}') {
          if (!skipGroup) {
            output += next;
          }
          index += 2;
          continue;
        }
        if (next === '*') {
          skipGroup = true;
          index += 2;
          continue;
        }
        if (next === "'") {
          const hex = rtf.substr(index + 2, 2);
          if (!skipGroup && /^[0-9a-f]{2}$/i.test(hex)) {
            output += String.fromCharCode(parseInt(hex, 16));
          }
          index += 4;
          continue;
        }
        const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(index, index + 40));
        if (!match) {
          index += 2;
          continue;
        }
        const [token, word, param] = match;
        index += token.length;
        if (skipDestinations.has(word)) {
          skipGroup = true;
          continue;
        }
        if (skipGroup) {
          continue;
        }
        if (word === 'par' || word === 'line' || word === 'row') {
          output += '\n';
        } else if (word === 'tab' || word === 'cell') {
          output += '\t';
        } else if (word === 'u' && param !== undefined) {
          let code = Number(param);
          if (code < 0) {
            code += 65536;
          }
          output += String.fromCharCode(code);
          // skip the ANSI fallback character
          if (rtf[index] && rtf[index] !== '\\' && rtf[index] !== '{') {
            index++;
          }
        }
        continue;
      }
      if (char === '\r' || char === '\n') {
        index++;
        continue;
      }
      if (!skipGroup) {
        output += char;
      }
      index++;
    }
    return output.replace(/\n{3,}/g, '\n\n').trim();
  }
}
