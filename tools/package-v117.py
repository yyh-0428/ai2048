"""Package only a completed, verified V11.7 run. No external dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, hashlib, subprocess, shutil, stat, sys

root = Path(__file__).resolve().parent.parent
workspace = root.parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda name: json.loads((root / 'docs' / name).read_text())
expected = {'V11_7_DEVELOPMENT.json': 56, 'V11_7_MERGE_ABLATION.json': 8,
            'V11_7_RETAIN5_ABLATION.json': 8, 'V11_7_VALIDATION.json': 120, 'V11_7_OTHER_MODES.json': 72, 'V11_7_RELEASE.json': 20}
for file, count in expected.items():
    j = load(file)
    assert j['complete'] and len(j['rows']) == count, (file, count)
    assert all(r['terminal'] and r['stopReason'] == 'no legal moves' for r in j['rows']), file
latency = load('V11_7_LATENCY.json')
assert latency['complete'] and len(latency['rows']) == latency['protocol']['boards'] * 25
assert latency['rawMeasuredRequests'] == latency['protocol']['boards'] * 105
assert latency['rawMeasurementsSHA256'] == sha(root / latency['rawMeasurements'])
replay = load('V11_7_REPLAY.json')
assert replay['passed'] and replay['records'] == sum(expected.values())
tests = load('TEST_RESULTS_V11_7.json')
assert tests['passed'] and tests['groups'] == 19 and tests['tests'] >= 121
summary = load('V11_7_SUMMARY.json')
assert summary['currentHTMLSHA256'] == sha(root / '2048-ai.html') == tests['htmlSHA256']
identity=load('V11_7_FINAL_BUILD_IDENTITY.json')
assert identity['finalHTMLSHA256'] == sha(root / '2048-ai.html')
assert identity['releaseGameHTMLSHA256'] == sha(root / identity['releaseGameHTML']) == load('V11_7_RELEASE.json')['signatures']['release']['HTMLSHA256']
assert identity['identicalCoordinatorRulesWorkerAndEmbeddedWASM']
assert (root / 'README.md').read_text().startswith('# 2048 AI V11.7')
assert json.loads((root / 'package.json').read_text())['version'] == '11.7.0'
for p in list(root.glob('*.command')) + list(root.glob('*.sh')):
    p.chmod(0o755)
    subprocess.run(['sh', '-n', str(p)], check=True)
old = root / 'docs' / 'MANIFEST.json'
history = root / 'docs' / 'MANIFEST_V11_6.json'
if old.exists() and not history.exists():
    shutil.copyfile(old, history)
files = sorted(p for p in root.rglob('*') if p.is_file() and p != old and not p.name.endswith('.tmp') and '__pycache__' not in p.parts)
manifest = {'version': '11.7.0', 'HTMLSHA256': sha(root / '2048-ai.html'),
            'files': {str(p.relative_to(root)): {'bytes': p.stat().st_size, 'sha256': sha(p)} for p in files}}
old.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
files.append(old)
target = workspace / '2048-AI-V11.7.zip'
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(files):
        z.write(p, root.name + '/' + str(p.relative_to(root)))
with ZipFile(target) as z:
    assert z.testzip() is None, 'ZIP CRC failed'
    names = z.namelist()
    for f in ['2048-ai.html', 'src/coordinator.js', 'src/worker.js', 'README.md', 'docs/V11_7_UPGRADE.md']:
        assert root.name + '/' + f in names
    verify = workspace / 'release-verification'
    if verify.exists():
        raise RuntimeError('Use a fresh release-verification directory')
    z.extractall(verify)
    for i in z.infolist():
        file = verify / i.filename
        if file.is_file():
            file.chmod((i.external_attr >> 16) & 0o777)
    extracted = verify / root.name
    for f, meta in manifest['files'].items():
        assert sha(extracted / f) == meta['sha256'], f
    for file in ['启动 2048 AI.command', '停止本地服务.command', 'server-nc.sh']:
        assert (extracted / file).stat().st_mode & stat.S_IXUSR, file
    assert sha(extracted / '2048-ai.html') == summary['currentHTMLSHA256']
    subprocess.run(['node', '--test', '--test-concurrency=1', '--test-name-pattern=offline release embeds', 'tests/v117.cjs'], cwd=extracted, check=True)
result = {'zip': str(target), 'bytes': target.stat().st_size, 'zipSHA256': sha(target),
          'entries': len(files), 'crcPassed': True, 'extractedAllFilesMatch': True,
          'finalHTMLSHA256': summary['currentHTMLSHA256']}
(workspace / 'V11_7_PACKAGE_CHECK.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
