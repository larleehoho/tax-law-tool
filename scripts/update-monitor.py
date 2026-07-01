#!/usr/bin/env python3
"""
税法速查工具 - 每日自动更新检测脚本
每天早上8点检查浙江/江苏/全国税务局网站，自动补充新法规
"""

import json
import re
import os
import sys
import subprocess
from datetime import datetime, date
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import time

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(WORKSPACE, 'data', 'embed.json')
REPO_DIR = WORKSPACE

SOURCES = [
    {
        "name": "浙江省税务局-政策文件",
        "region": "浙江",
        "category": "地方文件",
        "subCategory": "地方规范性文件",
        "url": "https://zhejiang.chinatax.gov.cn/col/col13296/index.html",
        "base_url": "https://zhejiang.chinatax.gov.cn",
        "id_prefix": "zj-auto-",
    },
    {
        "name": "江苏省税务局-最新文件",
        "region": "江苏",
        "category": "地方文件",
        "subCategory": "地方规范性文件",
        "url": "https://jiangsu.chinatax.gov.cn/col/col8199/index.html",
        "base_url": "https://jiangsu.chinatax.gov.cn",
        "id_prefix": "js-auto-",
    },
    {
        "name": "浙江省税务局-热点问答",
        "region": "浙江",
        "category": "地方文件",
        "subCategory": "热点问答",
        "url": "https://zhejiang.chinatax.gov.cn/col/col13296/index.html",
        "base_url": "https://zhejiang.chinatax.gov.cn",
        "id_prefix": "zj-qa-",
        "section_tag": "热点问答",
    },
    {
        "name": "江苏省税务局-12366热点问答",
        "region": "江苏",
        "category": "地方文件",
        "subCategory": "热点问答",
        "url": "https://jiangsu.chinatax.gov.cn/col/col8353/index.html",
        "base_url": "https://jiangsu.chinatax.gov.cn",
        "id_prefix": "js-qa-",
    },
    {
        "name": "国家税务总局-最新文件",
        "region": "全国",
        "category": "税收征管",
        "subCategory": "最新公告",
        "url": "https://www.chinatax.gov.cn/chinatax/n810341/n810755/index.html",
        "base_url": "https://www.chinatax.gov.cn",
        "id_prefix": "natt-auto-",
    },
]


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}")


def fetch_page(url, max_retries=2):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    }
    for attempt in range(max_retries):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=15) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except Exception as e:
            log(f"  ⚠️ 请求失败({attempt+1}/{max_retries}): {url[:60]}... {e}")
            if attempt < max_retries - 1:
                time.sleep(3)
    return None


def extract_items(html, source):
    """Extract items from HTML list page"""
    items = []
    base = source.get('base_url', '')
    section_tag = source.get('section_tag', '')

    # If section_tag specified, only extract from that section
    if section_tag:
        idx = html.find(section_tag)
        if idx > 0:
            html = html[idx:idx+20000]
        else:
            return []

    # Pattern: date + link (common in gov sites)
    patterns = [
        # <li>...date...<a href="...">title</a>...</li>
        re.compile(
            r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})[^<]*<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>',
            re.DOTALL
        ),
        # <a href="...">title</a> ... date
        re.compile(
            r'<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>[^<]*(\d{4}[-/]\d{1,2}[-/]\d{1,2})',
            re.DOTALL
        ),
        # <a ... href="...">title</a>  (date from another span nearby)
        re.compile(
            r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})[\s\S]{0,30}<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]{4,150})</a>',
            re.DOTALL
        ),
    ]

    for pat in patterns:
        matches = pat.findall(html)
        if matches:
            for m in matches:
                if len(m) == 3:
                    dt, href, title = m
                elif len(m) == 2:
                    href, dt = m
                    title = html[html.find(href):][:100]
                else:
                    continue
                title = title.strip()
                href = href.strip()
                if not title or not href or href.startswith('#'):
                    continue
                if href.startswith('//'):
                    href = 'https:' + href
                elif href.startswith('/'):
                    href = base + href
                elif not href.startswith('http'):
                    href = base + '/' + href.lstrip('.')
                dt = dt.replace('/', '-')
                items.append({'title': title, 'url': href.rstrip('/'), 'date': dt})
            break

    # Dedup by URL
    seen = set()
    return [i for i in items if not (i['url'] in seen or seen.add(i['url']))]


# Keywords that indicate this is a tax regulation/notice worth including
INCLUDE_KW = [
    '公告', '通知', '通告', '批复', '函', '规定', '办法', '通知', '决定',
    '税务', '税', '增值税', '所得税', '印花税', '房产税', '土地使用税',
    '土地增值税', '契税', '资源税', '城市维护建设税', '附加',
    '发票', '征收管理', '扣除', '优惠', '减免', '退税', '抵扣',
    '征收率', '税率', '计税', '财税', '税收', '社保', '社会保险', '缴费',
    '非税收入', '财政', '出口退税', '留抵退税', '加计抵减',
    '废止', '修改', '规范性文件', '政策', '热点问答', '12366',
]

EXCLUDE_KW = [
    '招聘', '公示', '公务员', '任前', '任免', '采购', '招标', '中标',
    '面试', '体检', '考察', '录用', '事业单位', '人大', '政协', '提案',
    '领导活动', '会议', '党建', '党史', '学习', '解读', '图解',
    '税路通', '合规宝典', '信用管理', '网上办税',
    '纳税缴费', '诚信纳税',
    '境外投资者以分配利润直接投资税收抵免',
    '关于《国家税务',
    '关于《财政部',
]


def is_tax_document(title):
    """Filter to only useful regulatory/policy documents"""
    for kw in EXCLUDE_KW:
        if kw in title:
            return False
    for kw in INCLUDE_KW:
        if kw in title:
            return True
    return False


def fetch_article_detail(url):
    """Fetch article page and extract metadata + content summary"""
    html = fetch_page(url)
    if not html:
        return None, None, None

    # Extract content
    content_text = ""
    for pat in [
        r'<div[^>]*class=["\']?(?:content|article|text|TRS_Editor|maintext|Custom_UnionStyle|art_content|infoContent)[^>]*>(.*?)</div>',
        r'<div[^>]*class=["\']?(?:content|article|text|TRS_Editor)[^>]*>(.*?)</div>',
        r'<!--content begin-->(.*?)<!--content end-->',
    ]:
        ms = re.findall(pat, html, re.DOTALL | re.IGNORECASE)
        if ms:
            text = ms[0]
            text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
            text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
            text = re.sub(r'<br\s*/?>', '\n', text)
            text = re.sub(r'<p[^>]*>', '\n', text)
            text = re.sub(r'</?[^>]+>', '', text)
            text = re.sub(r'\n{3,}', '\n\n', text).strip()
            if len(text) > 80:
                content_text = text
                break

    # Doc number
    doc_no = None
    for p in [r'文号[：:]\s*([^\s<,，\n]+)',
              r'（(\w+发[\w〔\[\(]*\d+[\]\)〕]\d+号)）']:
        m = re.search(p, html)
        if m:
            doc_no = m.group(1)
            break

    # Publish date
    pub_date = None
    for p in [r'(?:发布日期|发文日期|发布时间)[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})']:
        m = re.search(p, html)
        if m:
            pub_date = m.group(1).replace('/', '-')
            break

    # Fallback: try to find any date in the page
    if not pub_date:
        m = re.search(r'(\d{4}-\d{2}-\d{2})', html[:2000])
        if m:
            pub_date = m.group(1)

    if not content_text:
        tm = re.search(r'<title>([^<]+)</title>', html)
        content_text = f"（详见原文）{tm.group(1) if tm else ''}"

    return content_text[:5000], doc_no, pub_date


def load_data():
    try:
        with open(DATA_FILE, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)


def gen_id(title, prefix):
    t = re.sub(r'^(关于|国家税务总局|浙江省|江苏省|印发)\s*', '', title)
    t = re.sub(r'[^\u4e00-\u9fff\w]', '-', t).strip('-')[:35]
    if not t:
        t = str(hash(title) % 100000)
    return f"{prefix}{t}"


def main():
    log("🚀 税法更新检测开始...")

    data = load_data()
    existing = set()
    for d in data:
        if 'source_url' in d and d['source_url']:
            existing.add(d['source_url'].rstrip('/'))
        # Also check by ID to avoid duplicates
        existing.add(d['id'])

    new_items = []

    for source in SOURCES:
        log(f"\n📡 {source['name']}")
        html = fetch_page(source['url'])
        if not html:
            log(f"  ❌ 获取失败")
            continue

        items = extract_items(html, source)
        log(f"  📄 解析到 {len(items)} 条原始记录")

        # Filter
        items = [i for i in items if is_tax_document(i['title'])]
        log(f"  🎯 过滤后 {len(items)} 条税收相关")

        added = 0
        for item in items:
            url = item['url']
            if url in existing:
                continue

            # Generate ID and check for ID dup too
            iid = gen_id(item['title'], source['id_prefix'])
            if iid in existing:
                continue

            log(f"  📥 {item['title'][:35]}...")

            content_text, doc_no, pub_date = fetch_article_detail(url)
            # Handle None returns
            if content_text is None:
                content_text = "（内容获取失败）"

            entry = {
                "id": iid,
                "category": source['category'],
                "subCategory": source['subCategory'],
                "region": source['region'],
                "title": item['title'],
                "source_url": url,
                "publishDate": pub_date or item.get('date', ''),
                "updateDate": pub_date or item.get('date', ''),
                "status": "现行有效",
                "summary": f"来源：{source['name']}，{pub_date or item.get('date', '')}",
                "content": [{"section": "全文", "text": content_text[:3000]}]
            }
            if doc_no:
                entry['docNo'] = doc_no

            data.append(entry)
            existing.add(url)
            existing.add(iid)
            new_items.append(item['title'])
            added += 1
            time.sleep(0.5)

        log(f"  ✅ 新增 {added} 项")

    if new_items:
        log(f"\n📊 本次新增 {len(new_items)} 条:")
        for t in new_items:
            log(f"  📌 {t}")

        save_data(data)

        # Git
        log("\n📤 推送至 GitHub...")
        today_str = date.today().strftime('%Y-%m-%d')
        msg = f"🤖 自动更新：新增 {len(new_items)} 条 ({today_str})"
        try:
            subprocess.run(['git', 'add', 'data/embed.json'], cwd=REPO_DIR, capture_output=True, timeout=10)
            subprocess.run(['git', 'commit', '-m', msg, '--allow-empty'], cwd=REPO_DIR, capture_output=True, timeout=10)
            r = subprocess.run(['git', 'push', 'origin', 'main'], cwd=REPO_DIR, capture_output=True, timeout=60)
            if r.returncode == 0:
                log("✅ 推送成功")
            else:
                log(f"⚠️ 推送可能失败: {r.stderr.decode()[:200]}")
        except Exception as e:
            log(f"⚠️ {e}")
    else:
        log("\n✅ 无新法规")


if __name__ == '__main__':
    main()
