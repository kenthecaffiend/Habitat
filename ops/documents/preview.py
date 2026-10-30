"""Synthetic PNG/JPEG preview only. No paths, URLs or uploaded filenames accepted."""
import io
import sys
import warnings
from PIL import Image, ImageOps

MAX_BYTES = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 12_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)

def preview(data):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('input size')
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in ('PNG', 'JPEG') or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('unsupported format or multiple frames')
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('pixel limit')
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        image = ImageOps.exif_transpose(image).convert('RGBA')
        image.thumbnail((1600, 1600))
        # New pixel-only image strips source EXIF, text, profiles and filenames.
        clean = Image.new('RGB', image.size, 'white')
        if 'A' in image.getbands():
            clean.paste(image.convert('RGB'), mask=image.getchannel('A'))
        else:
            clean.paste(image.convert('RGB'))
        out = io.BytesIO()
        clean.save(out, format='PNG')
        if out.tell() > 4 * 1024 * 1024:
            raise ValueError('output size')
        return out.getvalue()

if __name__ == '__main__':
    try:
        sys.stdout.buffer.write(preview(sys.stdin.buffer.read(MAX_BYTES + 1)))
    except Exception:
        sys.stderr.write('PREVIEW_REJECTED\n')
        sys.exit(2)
