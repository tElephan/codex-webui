import {
  buildContentDisposition,
  guessMimeType,
  parseRangeHeader,
} from './file-response';

describe('preview file response helpers', () => {
  it('parses bounded, open-ended, and suffix byte ranges', () => {
    expect(parseRangeHeader('bytes=0-255', 1000)).toEqual({
      start: 0,
      end: 255,
    });
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({
      start: 500,
      end: 999,
    });
    expect(parseRangeHeader('bytes=-100', 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it('rejects invalid or unsatisfiable ranges', () => {
    expect(parseRangeHeader('items=0-1', 1000)).toBe('invalid');
    expect(parseRangeHeader('bytes=1000-1001', 1000)).toBe('invalid');
    expect(parseRangeHeader('bytes=10-9', 1000)).toBe('invalid');
  });

  it('detects compound archive MIME types', () => {
    expect(guessMimeType('project.tar.gz')).toBe('application/gzip');
    expect(guessMimeType('project.tar.xz')).toBe('application/x-xz');
    expect(guessMimeType('slides.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  });

  it('keeps Content-Disposition ASCII-safe while preserving UTF-8 filenames', () => {
    const header = buildContentDisposition('截图 2026-08-21 (final).png', true);

    expect(header).toBe(
      'inline; filename="__ 2026-08-21 (final).png"; ' +
        "filename*=UTF-8''%E6%88%AA%E5%9B%BE%202026-08-21%20%28final%29.png",
    );
    expect(/[^\x20-\x7e]/.test(header)).toBe(false);
  });

  it('sanitizes characters that can break or inject disposition headers', () => {
    const header = buildContentDisposition('bad\r\n"name\\file.txt', false);

    expect(header).toContain('attachment; filename="bad___name_file.txt"');
    expect(header).toContain("filename*=UTF-8''bad%0D%0A%22name%5Cfile.txt");
  });
});
