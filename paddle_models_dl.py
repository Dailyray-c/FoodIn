"""
一键下载 paddlejs OCR 模型到本地（绕过 bcebos 缺失 CORS 头的问题）
- 下载到项目根目录的 _paddle_models/ 下，分 det/ 和 rec/ 两个子目录
- paddlejs-models 在 ocr.ts 中 urlConf 拼接规则：'{dir}{pathMain}{n}.dat' (n 从 1 开始)
- 我们需要：det/model.json + chunk_1.dat；rec/model.json + chunk_1.dat + chunk_2.dat
- 模型来源：https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv2_{det,rec}_fuse_activation/
"""
import os, sys, time, urllib.request, urllib.error, hashlib

BASE = 'https://paddlejs.bj.bcebos.com/models/fuse/ocr/ch_PP-OCRv2_{key}_fuse_activation'
ROOT = os.path.dirname(os.path.abspath(__file__))
TARGETS = {
    'det': ['model.json', 'chunk_1.dat'],
    'rec': ['model.json', 'chunk_1.dat', 'chunk_2.dat'],
}

def fetch(url, path):
    """下载带进度"""
    print(f'  -> {url}')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except urllib.error.URLError as e:
        print(f'  ! 下载失败: {e}'); return False
    sz = len(data)
    with open(path, 'wb') as f:
        f.write(data)
    md5 = hashlib.md5(data).hexdigest()
    dt = time.time() - t0
    print(f'  OK {sz/1024/1024:.2f} MB in {dt:.1f}s  md5={md5[:8]}')
    return True

total_ok = 0
for key, files in TARGETS.items():
    sub = os.path.join(ROOT, '_paddle_models', key)
    os.makedirs(sub, exist_ok=True)
    print(f'== {key} -> {sub}')
    for fn in files:
        url = BASE.format(key=key) + '/' + fn
        dst = os.path.join(sub, fn)
        if os.path.exists(dst) and os.path.getsize(dst) > 1024:
            print(f'  skip {fn} (already exists, {os.path.getsize(dst)/1024/1024:.2f} MB)')
            total_ok += 1; continue
        if fetch(url, dst):
            total_ok += 1

print(f'\n下载完成 {total_ok}/{sum(len(v) for v in TARGETS.values())} 个文件')
print('下一步：')
print('  1) 双击或运行 start_paddle_host.bat 启动本地 HTTP 服务（端口 8000）')
print('  2) 用 http://127.0.0.1:8000/index.html 打开应用（不能用 file://）')
print('  3) F12 控制台执行：')
print('     __foodin.setPaddleModelUrls(')
print('       "http://127.0.0.1:8000/_paddle_models/det/model.json",')
print('       "http://127.0.0.1:8000/_paddle_models/rec/model.json"')
print('     )')
print('  4) 再 await __foodin.preloadPaddleModel() 看是否成功')