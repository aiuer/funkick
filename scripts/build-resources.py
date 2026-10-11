#!/usr/bin/env python3
"""Build immutable theme versions; originals and existing photo IDs stay intact."""
import argparse
import base64
import hashlib
import json
import re
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]

def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def safe_image(path, size=900):
    try:
        image = Image.open(path)
    except UnidentifiedImageError:
        # Some source .jpg files are actually HEIC. macOS sips decodes them.
        with tempfile.TemporaryDirectory(prefix='puzzle-heif-') as temp:
            converted = Path(temp) / 'decoded.jpg'
            subprocess.run(['sips', '-s', 'format', 'jpeg', str(path), '--out', str(converted)],
                           check=True, capture_output=True)
            image = Image.open(converted)
            image.load()
    with image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        # Match the original square crop with a slight preference toward faces.
        image = ImageOps.fit(image, (size, size), centering=(0.5, 0.35))
        return image.copy()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source')
    args = parser.parse_args()
    config = json.loads((ROOT / 'resource-config.json').read_text())
    source = Path(args.source or config['source']).expanduser().resolve()
    files = sorted(p for p in source.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'})
    if not files:
        raise SystemExit('No source pictures found')
    effects = config['effects']
    for effect in effects:
        if not (source / effect['photo']).is_file() or not (source / effect['file']).is_file():
            raise SystemExit('Missing effect photo or animation: ' + effect['photo'])

    # Stable IDs preserve the original 23 photos and subsequent collections.
    legacy = (ROOT / 'theme-yuanxin.js').read_text()
    photo_ids = dict((name, key) for key, name in re.findall(r"id:'([^']+)'.*?src:'([^']+)'", legacy))
    index_path = ROOT / 'assets/yuanxin/photo-ids.json'
    if index_path.exists():
        photo_ids.update(json.loads(index_path.read_text()))
    next_id = max([int(v[2:]) for v in photo_ids.values()] or [0]) + 1
    for file in files:
        if file.name not in photo_ids:
            photo_ids[file.name] = 'yx' + str(next_id).zfill(2)
            next_id += 1

    digest = hashlib.sha256(b'resource-builder-v1-square900-webp82')
    digest.update(json.dumps(config, sort_keys=True).encode())
    inputs = files + sorted({source / e['file'] for e in effects})
    for file in inputs:
        digest.update(file.name.encode()); digest.update(file.read_bytes())
    version = 'v-' + digest.hexdigest()[:16]
    output = ROOT / 'assets/yuanxin' / version
    (output / 'images').mkdir(parents=True, exist_ok=True)
    (output / 'effects').mkdir(exist_ok=True)
    photos, offline_photos = [], []
    for file in files:
        key = photo_ids[file.name]
        image = safe_image(file)
        image.save(output / 'images' / (key + '.webp'), format='WEBP', quality=82, method=6)
        thumb = image.resize((240, 240), Image.Resampling.LANCZOS)
        thumb.save(output / 'images' / (key + '-thumb.webp'), format='WEBP', quality=78)
        photo = {'id': key, 'source': file.name, 'title': '合影 ' + key[2:],
                 'image': 'images/' + key + '.webp', 'thumbnail': 'images/' + key + '-thumb.webp',
                 'w': 900, 'h': 900, 'effects': {}}
        photos.append(photo)
        offline = dict(photo)
        buffer = BytesIO(); image.resize((690, 690), Image.Resampling.LANCZOS).save(buffer, 'WEBP', quality=80)
        offline['data'] = 'data:image/webp;base64,' + base64.b64encode(buffer.getvalue()).decode()
        offline_photos.append(offline)

    animations = {}
    for effect in effects:
        file = source / effect['file']
        if file.name not in animations:
            name = hashlib.sha256(file.name.encode()).hexdigest()[:12]
            with Image.open(file) as gif:
                frames, durations = [], []
                for frame_index in range(gif.n_frames):
                    gif.seek(frame_index)
                    frame = gif.convert('RGBA')
                    frame.thumbnail((640, 480), Image.Resampling.LANCZOS)
                    frames.append(frame.copy())
                    durations.append(max(20, gif.info.get('duration', 80)))
                animation = output / 'effects' / (name + '.webp')
                frames[0].save(animation, 'WEBP', save_all=True, append_images=frames[1:],
                               duration=durations, loop=0, quality=80, method=4)
                frames[0].convert('RGB').save(output / 'effects' / (name + '-poster.webp'), 'WEBP', quality=82)
                animations[file.name] = {'media': 'effects/' + name + '.webp',
                    'poster': 'effects/' + name + '-poster.webp',
                    'hold': max(2600, min(6000, sum(durations) + 300)), 'duration': sum(durations)}
        for photo, offline in zip(photos, offline_photos):
            if photo['source'] == effect['photo']:
                for mode in effect['modes']:
                    if mode in photo['effects']:
                        raise SystemExit('Duplicate effect binding: ' + effect['photo'] + ':' + mode)
                    binding = dict(animations[file.name], caption=effect['caption'], source=effect['file'])
                    photo['effects'][mode] = binding
                    offline['effects'][mode] = binding

    manifest = {'schema_version': 1, 'version': version, 'theme': 'yuanxin', 'name': config['name'],
                'count': len(photos), 'photos': photos}
    write_json(output / 'manifest.json', manifest)
    offline = dict(manifest, photos=offline_photos)
    (output / 'offline.js').write_text('window.YUANXIN_OFFLINE=' + json.dumps(offline, ensure_ascii=False) + ';\n')
    write_json(index_path, photo_ids)
    write_json(ROOT / 'assets/yuanxin/current.json', {'schema_version': 1, 'version': version,
                                                    'manifest': version + '/manifest.json'})
    # file:// cannot fetch JSON; this script locates the matching offline bundle.
    (ROOT / 'assets/yuanxin/current.js').write_text('window.YUANXIN_CURRENT=' + json.dumps({'version': version}) + ';\n')
    size = sum(f.stat().st_size for f in output.rglob('*') if f.is_file())
    print(json.dumps({'version': version, 'photos': len(photos), 'animations': len(animations),
                      'bytes': size, 'directory': str(output)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
