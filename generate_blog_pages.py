#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
博客分页 JSON 生成器
自动扫描包含 <article> 标签的 HTML 文件，提取元数据并生成分页 JSON 文件
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser
from collections import defaultdict


class BlogHTMLParser(HTMLParser):
    """HTML 解析器，提取博客元数据"""

    def __init__(self):
        super().__init__()
        self.has_article = False
        self.meta_tags = {}
        self.title = None
        self.in_title = False
        self.in_script = False
        self.script_content = ''

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        # 检查是否有 article 标签
        if tag == 'article':
            self.has_article = True

        # 提取 meta 标签
        if tag == 'meta':
            name = attrs_dict.get('name') or attrs_dict.get('property')
            content = attrs_dict.get('content')
            if name and content:
                self.meta_tags[name] = content

        # 提取 title 标签
        if tag == 'title':
            self.in_title = True

        # 提取 script 标签内容（检查 JSON-LD）
        if tag == 'script' and attrs_dict.get('type') == 'application/ld+json':
            self.in_script = True
            self.script_content = ''

    def handle_data(self, data):
        if self.in_title:
            self.title = data.strip()
        if self.in_script:
            self.script_content += data

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'script':
            self.in_script = False


def extract_blog_metadata(html_file_path):
    """
    从 HTML 文件中提取博客元数据

    Args:
        html_file_path: HTML 文件路径

    Returns:
        dict: 博客元数据，如果不是博客文章则返回 None
    """
    try:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        parser = BlogHTMLParser()
        parser.feed(html_content)

        meta = parser.meta_tags

        # ========================================
        # 博客识别逻辑（单一硬标记）
        # ========================================

        # 只认显式博客标记 <meta name="post_article" content="true">。
        # 真博客文章(blog.tmp 生成)必带此标；landing 页虽含 <article>+og:type=article
        # 也不算(否则会把 business-in-a-box 等落地页误列进博客)。
        post_article = meta.get('post_article')
        is_blog = bool(post_article and post_article.lower() == 'true')

        # 如果不是博客文章，跳过该文件
        if not is_blog:
            return None

        file_name = os.path.basename(html_file_path)

        # 提取标题（优先使用 og:title 或 meta description，否则用 title 标签）
        title = (
            meta.get('og:title') or
            meta.get('twitter:title') or
            parser.title or
            file_name.replace('.html', '').replace('-', ' ').title()
        )

        # 清理标题（移除网站名称后缀）
        title = re.sub(r'\s*[|丨-]\s*\w+\s*$', '', title)

        # 提取描述/摘要
        excerpt = (
            meta.get('description') or
            meta.get('og:description') or
            meta.get('twitter:description') or
            ''
        )

        # 提取作者
        author = (
            meta.get('article:author') or
            meta.get('author') or
            'Admin'
        )

        # 提取发布日期
        date_str = (
            meta.get('article:published_time') or
            meta.get('datePublished') or
            meta.get('date')
        )

        # 解析日期
        if date_str:
            try:
                # 尝试解析 ISO 8601 格式
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                date = date_obj.strftime('%Y-%m-%d')
            except:
                # 如果解析失败，尝试其他常见格式
                try:
                    date_obj = datetime.strptime(date_str.split('T')[0], '%Y-%m-%d')
                    date = date_obj.strftime('%Y-%m-%d')
                except:
                    # 使用文件修改时间作为后备
                    file_mtime = os.path.getmtime(html_file_path)
                    date = datetime.fromtimestamp(file_mtime).strftime('%Y-%m-%d')
        else:
            # 使用文件修改时间
            file_mtime = os.path.getmtime(html_file_path)
            date = datetime.fromtimestamp(file_mtime).strftime('%Y-%m-%d')

        # 提取分类
        category = meta.get('article:section') or 'Uncategorized'

        # 生成分类 slug
        category_slug = category.lower().replace(' ', '-')

        # 提取缩略图
        thumbnail = (
            meta.get('og:image') or
            meta.get('twitter:image') or
            'https://via.placeholder.com/800x500?text=Blog+Post'
        )

        # 提取标签
        tags_str = meta.get('article:tag') or meta.get('keywords') or ''
        tags = [tag.strip() for tag in tags_str.split(',') if tag.strip()][:4]

        # 提取阅读时间
        read_time = meta.get('twitter:data1') or '5 min read'

        # 生成 slug（使用文件名）
        slug = file_name.replace('.html', '')

        # 构建博客数据
        blog_data = {
            'title': title,
            'slug': slug,
            'excerpt': excerpt[:200] + '...' if len(excerpt) > 200 else excerpt,
            'author': author,
            'authorTitle': 'Content Writer',
            'date': date,
            'category': category,
            'categorySlug': category_slug,
            'thumbnail': thumbnail,
            'url': file_name,
            'readTime': read_time,
            'tags': tags,
            'featured': False  # 默认不是特色文章
        }

        return blog_data

    except Exception as e:
        print(f"⚠️  处理文件 {html_file_path} 时出错: {e}")
        return None


def scan_blog_files(directory='.'):
    """
    扫描目录中所有包含 <article> 标签的 HTML 文件

    Args:
        directory: 要扫描的目录路径

    Returns:
        list: 博客数据列表
    """
    blogs = []
    html_files = list(Path(directory).glob('*.html'))

    # 也扫描 blog 子目录
    blog_dir = Path(directory) / 'blog'
    if blog_dir.exists():
        html_files.extend(blog_dir.glob('*.html'))

    print(f"📂 扫描到 {len(html_files)} 个 HTML 文件...")

    for html_file in html_files:
        # 跳过特殊文件
        if html_file.name in ['blogs.html', 'index.html', 'about.html', 'contact.html', 'faq.html']:
            continue

        print(f"   检查: {html_file}")
        blog_data = extract_blog_metadata(str(html_file))

        if blog_data:
            blogs.append(blog_data)
            print(f"   ✅ 提取成功: {blog_data['title']}")
        else:
            print(f"   ⏭️  跳过（无 article 标签）")

    return blogs


def generate_paginated_json(blogs, posts_per_page=20, output_dir='assets'):
    """
    生成分页 JSON 文件

    Args:
        blogs: 博客数据列表
        posts_per_page: 每页文章数量
        output_dir: 输出目录
    """
    # 按日期排序（最新的在前）
    blogs_sorted = sorted(blogs, key=lambda x: x['date'], reverse=True)

    # 为博客添加递增的 ID（最新的 ID 最大）
    for idx, blog in enumerate(blogs_sorted, start=1):
        blog['id'] = len(blogs_sorted) - idx + 1

    # 设置第一篇为特色文章
    if blogs_sorted:
        blogs_sorted[0]['featured'] = True

    total_blogs = len(blogs_sorted)
    total_pages = (total_blogs + posts_per_page - 1) // posts_per_page

    print(f"\n📊 统计信息:")
    print(f"   总文章数: {total_blogs}")
    print(f"   总页数: {total_pages}")
    print(f"   每页文章数: {posts_per_page}")

    # 统计分类
    category_count = defaultdict(int)
    for blog in blogs_sorted:
        category_count[blog['category']] += 1

    categories = [
        {
            'name': cat,
            'slug': cat.lower().replace(' ', '-'),
            'count': count
        }
        for cat, count in sorted(category_count.items())
    ]

    # 生成索引文件
    index_data = {
        'totalBlogs': total_blogs,
        'totalPages': total_pages,
        'postsPerPage': posts_per_page,
        'categories': categories,
        'latestUpdate': blogs_sorted[0]['date'] if blogs_sorted else datetime.now().strftime('%Y-%m-%d')
    }

    index_path = Path(output_dir) / 'blogs-index.json'
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ 生成索引文件: {index_path}")
    category_names = ', '.join([f"{c['name']}({c['count']})" for c in categories])
    print(f"   分类: {category_names}")

    # 生成分页文件
    print(f"\n📄 生成分页文件:")
    for page_num in range(1, total_pages + 1):
        start_idx = (page_num - 1) * posts_per_page
        end_idx = min(start_idx + posts_per_page, total_blogs)

        page_data = {
            'pageNumber': page_num,
            'blogs': blogs_sorted[start_idx:end_idx]
        }

        page_path = Path(output_dir) / f'blogs-page-{page_num}.json'
        with open(page_path, 'w', encoding='utf-8') as f:
            json.dump(page_data, f, indent=2, ensure_ascii=False)

        print(f"   ✅ 第 {page_num} 页: {page_path} ({len(page_data['blogs'])} 篇)")

    # 删除多余的旧分页文件
    print(f"\n🧹 清理旧文件:")
    for old_page_num in range(total_pages + 1, 100):  # 最多检查到 100 页
        old_page_path = Path(output_dir) / f'blogs-page-{old_page_num}.json'
        if old_page_path.exists():
            old_page_path.unlink()
            print(f"   🗑️  删除: {old_page_path}")

    print(f"\n✨ 完成！生成了 {total_pages} 个分页文件")


def find_site_root(start):
    """
    自动定位站点根目录（即博客文章 HTML 与 assets/ 实际所在的目录）。

    兼容脚本被放在两种位置的所有站点：
      - {site}/assets/script/generate_blog_pages.py  （向上找到 {site}）
      - {site}/generate_blog_pages.py                （脚本自身就在 {site}）

    判定标准：从脚本所在目录向上逐级查找，第一个同时含有
    assets/ 子目录 且 含有 index.html 或 blogs.html 的目录即为站点根。
    找不到时回退为脚本所在目录（保持旧行为，不会更糟）。
    """
    start = Path(start).resolve()
    for d in [start, *start.parents]:
        if (d / 'assets').is_dir() and ((d / 'index.html').exists() or (d / 'blogs.html').exists()):
            return d
    return start


def main():
    """主函数"""
    print("=" * 60)
    print("📚 博客分页 JSON 生成器")
    print("=" * 60)

    # 切到站点根目录（博客文章 HTML 实际所在），而不是脚本自己的目录。
    # 旧逻辑 os.chdir(script_dir) 会切到 assets/script/，扫不到任何 post HTML。
    site_root = find_site_root(Path(__file__).parent)
    os.chdir(site_root)
    print(f"📍 站点根目录: {site_root}")

    # 扫描博客文件（scan_blog_files 同时扫描根目录 *.html 与 blog/ 子目录）
    blogs = scan_blog_files()

    if not blogs:
        print("\n⚠️  未扫描到博客文章（无 post_article=true 标记的页面）")
        print("   仍写出空 blogs-index.json 并清掉旧 blogs-page-*.json，避免残留旧数据。")

    # 即使为空也要生成：写空 index(totalBlogs 0) + 清理所有旧分页，
    # 否则删完文章后 blog 列表会残留上一次的旧数据。
    generate_paginated_json(blogs, posts_per_page=20, output_dir='assets')

    print("\n" + "=" * 60)
    print("✅ 所有操作完成！")
    print("=" * 60)


if __name__ == '__main__':
    main()
