# -*- coding: utf-8 -*-
"""发布前卡点：用「花括号配平」精确抽取 setup() 的 return{} 块，核对模板引用的标识符是否都已导出。
（旧版 _audit_export.py 用正则取到 return 块会截断，产生假阳性 —— 本脚本改为配平扫描。）"""
import io, re, sys

SRC = 'index.html'
src = io.open(SRC, encoding='utf-8').read()

# 1) 模板区 = <div id="app"> 到主 <script> 之前
app_at = src.index('id="app"')
main_script_at = src.index('<script>', app_at)
tpl = src[app_at:main_script_at]

# 2) setup 主体 = app.component('toggle-setting' 之前的主 script 块
big_start = main_script_at
big_end = src.index("app.component('toggle-setting'", big_start)
body = src[big_start:big_end]

# 3) 配平抽取 return { ... }
r_at = body.rindex('\n    return {')
i = body.index('{', r_at)
depth, j = 0, i
while j < len(body):
    c = body[j]
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            break
    j += 1
ret = body[i + 1:j]

# 4) 导出键名
exported = set()
for part in re.split(r'[,\n]', ret):
    p = part.strip()
    p = re.sub(r'^//.*$', '', p).strip()
    if not p:
        continue
    m = re.match(r'([A-Za-z_$][\w$]*)\s*(?::|$)', p)
    if m:
        exported.add(m.group(1))
print('return{} 导出键数:', len(exported))

# 5) 模板引用：先按属性抽 attr="..."，再在值内去字符串字面量（避免把整个属性值删掉）
attrs = re.findall(r':?[\w@.\-]+\s*=\s*"([^"]*)"', tpl)
refs = set()
for val in attrs:
    v = re.sub(r"'[^']*'", "''", val)
    v = re.sub(r'"[^"]*"', '""', v)
    for m in re.finditer(r'(?<![\w.$])([A-Za-z_$][\w$]*)\s*[({.\[]', v):
        refs.add(m.group(1))
    for m in re.finditer(r'\{\{\s*([A-Za-z_$][\w$]*)', tpl):
        refs.add(m.group(1))

# 6) setup 顶层（恰好 4 空格缩进）定义的标识符（函数 / const / let）——
#    只取顶层，避免把函数体内的局部变量（如 const el = ...）当成导出对象
defined = set(re.findall(r'^ {4}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', body, re.M))
defined |= set(re.findall(r'^ {4}(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=', body, re.M))

# 5b) v-for / slot 别名（bc / c / item / p ...）不是 setup 的导出对象，从引用集中剔除
aliases = set()
for m in re.finditer(r'v-for\s*=\s*"\s*\(?([^)"]*?)\)?\s+(?:in|of)\s', tpl):
    for piece in m.group(1).split(','):
        piece = piece.strip()
        if re.match(r'^[A-Za-z_$][\w$]*$', piece):
            aliases.add(piece)
for m in re.finditer(r'v-slot:?[\w-]*\s*=\s*"\s*\{([^}]*)\}"', tpl):
    for piece in m.group(1).split(','):
        piece = piece.strip().split(':')[0].strip()
        if re.match(r'^[A-Za-z_$][\w$]*$', piece):
            aliases.add(piece)
for m in re.finditer(r'#[\w-]+\s*=\s*"\s*\{([^}]*)\}"', tpl):
    for piece in m.group(1).split(','):
        piece = piece.strip().split(':')[0].strip()
        if re.match(r'^[A-Za-z_$][\w$]*$', piece):
            aliases.add(piece)

missing = sorted(n for n in refs if n in defined and n not in exported and n not in aliases)
print()
print('=== 模板引用 + setup 内定义 + 未导出（真 P0 候选）===')
if missing:
    for n in missing:
        lines = [str(k) for k, l in enumerate(tpl.split('\n'), 1) if re.search(r'(?<![\w.$])' + re.escape(n) + r'\b', l)]
        print('  ✗ %-28s 模板行: %s' % (n, ','.join(lines[:6])))
else:
    print('  ✅ 无')

for n in ('saveData', 'showToast'):
    print('  %-10s 在 return{} 中: %s' % (n, n in exported))
sys.exit(1 if missing else 0)
