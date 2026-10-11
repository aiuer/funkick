#!/usr/bin/env python3
"""Validate and pack an allowlisted release without source files or credentials."""
import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ['puzzle-game.html', 'resource-loader.js', 'theme-classic.js', 'theme-yuanxin.js',
           'lucide.min.js', 'lucide.LICENSE', 'fx-celebrate-1.gif', 'fx-celebrate-2.gif',
           'fx-celebrate-3.gif', 'hug_light.gif', 'kiss_light.gif']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--note', default='游戏更新')
    args = parser.parse_args()
    current = json.loads((ROOT / 'assets/yuanxin/current.json').read_text())
    version = current['version']
    resources = ROOT / 'assets/yuanxin' / version
    manifest = json.loads((resources / 'manifest.json').read_text())
    if manifest['version'] != version:
        raise SystemExit('Manifest version mismatch')
    runtime_paths = [ROOT / file for file in RUNTIME]
    runtime_paths += [ROOT / 'assets/yuanxin/current.json', ROOT / 'assets/yuanxin/current.js']
    runtime_paths += sorted(file for file in resources.rglob('*') if file.is_file())
    for photo in manifest['photos']:
        for value in [photo['image'], photo['thumbnail']]:
            if not (resources / value).is_file():
                raise SystemExit('Missing picture: ' + value)
        for effect in photo['effects'].values():
            for key in ['media', 'poster']:
                if not (resources / effect[key]).is_file():
                    raise SystemExit('Missing effect: ' + effect[key])
    digest = hashlib.sha256()
    for file in runtime_paths:
        if not file.is_file() or file.is_symlink():
            raise SystemExit('Missing file or symlink: ' + str(file))
        data = file.read_bytes()
        if b'ph_key_' in data:
            raise SystemExit('Secret detected in public files')
        digest.update(str(file.relative_to(ROOT)).encode()); digest.update(data)
    release_id = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + digest.hexdigest()[:10]
    release = ROOT / 'releases' / release_id
    site = release / 'site'
    site.mkdir(parents=True, exist_ok=False)
    for file in runtime_paths:
        target = site / file.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
    shutil.copyfile(site / 'puzzle-game.html', site / 'index.html')
    metadata = {'release': release_id, 'resource_version': version, 'photos': manifest['count'],
                'sha256': digest.hexdigest(), 'note': args.note}
    (site / 'release.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    archive = release / 'puzzle.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
        for file in sorted(site.rglob('*')):
            if file.is_file():
                zipped.write(file, file.relative_to(site))
    result = dict(metadata, site=str(site), archive=str(archive), bytes=archive.stat().st_size)
    (ROOT / 'releases/latest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
