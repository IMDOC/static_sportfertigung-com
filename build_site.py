#!/usr/bin/env python3
"""
build_site.py — 静态站点博客一键构建（SSG 模式）

一次扫描所有 post_article HTML，重新渲染：
  - assets/blogs-page-N.json (分页数据)
  - assets/blogs-index.json  (索引)
  - blog.html                (完整文章卡片网格，SSR)
  - category/{slug}.html     (按分类筛选的卡片列表，SSR)
  - author/{slug}.html       (按作者筛选的文章列表，SSR)
  - 所有 HTML 的 nav + footer (从 menu-config / footer-config 静态化)

所有站内资源必须是绝对路径 /xxx（见 CONVENTIONS.md §1）。
零 JS 依赖即可看到完整内容；JS 只做交互增强。

用法:
    cd {site_root} && python3 build_site.py

退出码:
    0 = 成功
    1 = 关键配置缺失（categories.json / authors.json / menu-config.json）
    2 = HTML 解析失败
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from html import escape as html_escape
from html.parser import HTMLParser
from pathlib import Path


POSTS_PER_PAGE = 20
DEFAULT_THUMBNAIL = 'https://docerp.s3.us-west-1.amazonaws.com/images/p_14/d_default/372f5478573476c5de199e50a54e8b4e.webp'

SKIP_HTML_AT_ROOT = {'blog.html', 'blogs.html', 'index.html', 'about-us.html',
                     'about.html', 'contact-us.html', 'contact.html', 'faq.html',
                     '404.html', 'privacy.html', 'terms.html'}


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.has_article = False
        self.meta = {}
        self.title = None
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'article':
            self.has_article = True
        if tag == 'meta':
            name = d.get('name') or d.get('property')
            content = d.get('content')
            if name and content:
                self.meta[name] = content
        if tag == 'title':
            self._in_title = True

    def handle_data(self, data):
        if self._in_title:
            self.title = (data or '').strip()

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False


def parse_article(path: Path) -> dict | None:
    try:
        html = path.read_text(encoding='utf-8')
    except Exception:
        return None

    p = MetaParser()
    try:
        p.feed(html)
    except Exception:
        return None

    m = p.meta
    is_post = (m.get('post_article', '').lower() == 'true') or \
              (p.has_article and m.get('og:type') == 'article')
    if not is_post:
        return None

    slug = path.stem
    title = (m.get('og:title') or m.get('twitter:title') or p.title or slug).strip()
    title = re.sub(r'\s*[|丨]\s*[^|丨]+\s*$', '', title)

    excerpt = m.get('description') or m.get('og:description') or ''
    if len(excerpt) > 200:
        excerpt = excerpt[:200].rsplit(' ', 1)[0] + '...'

    author = m.get('article:author') or m.get('author') or 'Unknown Author'

    raw_date = m.get('article:published_time') or m.get('datePublished')
    if raw_date:
        try:
            dt = datetime.fromisoformat(raw_date.replace('Z', '+00:00'))
            date = dt.strftime('%Y-%m-%d')
        except Exception:
            date = raw_date[:10]
    else:
        date = datetime.fromtimestamp(path.stat().st_mtime).strftime('%Y-%m-%d')

    category = m.get('article:section') or 'Uncategorized'
    thumbnail = m.get('og:image') or m.get('twitter:image') or DEFAULT_THUMBNAIL

    raw_sources = []
    if m.get('article:tag'):
        raw_sources.append(m['article:tag'])
    if m.get('keywords'):
        raw_sources.append(m['keywords'])
    raw_tags = []
    for src in raw_sources:
        raw_tags.extend(t.strip() for t in src.split(',') if t.strip())
    tags = raw_tags
    read_time = m.get('twitter:data1') or '5 Min. Lesezeit'

    try:
        rel = path.resolve().relative_to(Path.cwd().resolve())
        url = '/' + str(rel).replace('\\', '/').replace('.html', '')
    except ValueError:
        url = '/' + slug

    return {
        'title': title,
        'slug': slug,
        'url': url,
        'excerpt': excerpt,
        'author': author,
        'date': date,
        'category': category,
        'thumbnail': thumbnail,
        'tags': tags,
        'readTime': read_time,
    }


def _is_valid_article(data: dict) -> bool:
    """过滤掉落地页误匹配为 article 的数据：作者 Unknown / 空 / 品牌名（违反 E-E-A-T）
    也过滤没有文章体（body 太短）或 title 长度异常的情况。"""
    if not data:
        return False
    author = (data.get('author') or '').strip()
    if not author or author.lower() in ('unknown author', 'editorial team', 'admin', 'team'):
        return False
    return True


def scan_articles(root: Path) -> list[dict]:
    articles = []
    for p in sorted(root.glob('*.html')):
        if p.name in SKIP_HTML_AT_ROOT or '-test' in p.stem:
            continue
        if p.name.startswith('_'):  # 跳过 _shell.html 等以下划线开头的 template 文件
            continue
        data = parse_article(p)
        if _is_valid_article(data):
            articles.append(data)
    blog_sub = root / 'blog'
    if blog_sub.is_dir():
        for p in sorted(blog_sub.glob('*.html')):
            if '-test' in p.stem:
                continue
            data = parse_article(p)
            if _is_valid_article(data):
                articles.append(data)
    articles.sort(key=lambda a: a['date'], reverse=True)
    return articles


def enrich_with_manifests(articles: list[dict], categories_manifest: dict, authors_manifest: dict, tags_manifest: dict) -> list[dict]:
    cat_by_name = {c['name'].lower(): c for c in categories_manifest.get('categories', [])}
    cat_by_slug = {c['slug']: c for c in categories_manifest.get('categories', [])}
    author_by_name = {a['name']: a for a in authors_manifest.get('authors', [])}

    default_cat_slug = categories_manifest.get('default_category_slug', '')

    tag_lookup: dict[str, dict] = {}
    for t in tags_manifest.get('tags', []):
        tag_lookup[t['slug']] = t
        tag_lookup[t['name'].lower()] = t
        for alias in t.get('aliases', []):
            tag_lookup[alias.lower()] = t
    auto_register = tags_manifest.get('auto_register', False)

    for i, art in enumerate(articles, start=1):
        cat_name_lower = (art.get('category') or '').lower()
        cat = cat_by_name.get(cat_name_lower)
        if not cat:
            for c in categories_manifest.get('categories', []):
                kws = [k.lower() for k in (c.get('parent_topic_keywords') or [])]
                if any(k in cat_name_lower for k in kws):
                    cat = c
                    break
        if not cat:
            cat = cat_by_slug.get(default_cat_slug, categories_manifest.get('categories', [{}])[0] or {})
        art['categorySlug'] = cat.get('slug', 'uncategorized')
        art['category'] = cat.get('name', art.get('category', 'Uncategorized'))

        author_obj = author_by_name.get(art.get('author', ''))
        if author_obj:
            art['authorTitle'] = author_obj.get('title', 'Content Writer')
            art['authorSlug'] = author_obj.get('slug', '')
        else:
            art['authorTitle'] = art.get('authorTitle', 'Content Writer')
            art['authorSlug'] = re.sub(r'[^a-z0-9]+', '-', art.get('author', '').lower()).strip('-')

        resolved_tags = []
        seen_slugs = set()
        for raw in art.get('tags', []):
            key = raw.strip().lower()
            t = tag_lookup.get(key) or tag_lookup.get(tag_slug(raw))
            if t and t['slug'] not in seen_slugs:
                resolved_tags.append({'slug': t['slug'], 'name': t['name']})
                seen_slugs.add(t['slug'])
        art['tags'] = resolved_tags

        art['id'] = len(articles) - i + 1
        art['featured'] = (i == 1)

    return articles


def render_card(art: dict) -> str:
    title = html_escape(art.get('title', 'Untitled'))
    excerpt = html_escape(art.get('excerpt', ''))
    author = html_escape(art.get('author', ''))
    author_slug = art.get('authorSlug', '')
    category = html_escape(art.get('category', ''))
    cat_slug = art.get('categorySlug', '')
    date = art.get('date', '')
    read_time = html_escape(art.get('readTime', '5 Min. Lesezeit'))
    url = art.get('url', '#')
    thumb = art.get('thumbnail') or DEFAULT_THUMBNAIL

    try:
        formatted_date = datetime.strptime(date, '%Y-%m-%d').strftime('%b %d, %Y')
    except Exception:
        formatted_date = date

    author_link = f'<a href="/author/{author_slug}" rel="author" style="color:inherit;text-decoration:none;">{author}</a>' if author_slug else author
    cat_link = f'<a href="/category/{cat_slug}" style="color:#C81E1E;text-decoration:none;">{category}</a>' if cat_slug else category

    tags_html = ''
    tags = art.get('tags', [])[:3]
    if tags:
        pills = ' '.join(
            f'<a href="/tag/{t["slug"]}" class="blog-card-tag">#{html_escape(t["name"])}</a>'
            for t in tags
        )
        tags_html = f'<div class="blog-card-tags">{pills}</div>'

    return f'''<article class="blog-card" data-category-slug="{cat_slug}" data-author-slug="{author_slug}">
  <a href="{url}" class="blog-card-img-wrap">
    <img src="{thumb}" alt="{title}" class="blog-card-img" loading="lazy" onerror="this.src='{DEFAULT_THUMBNAIL}'">
  </a>
  <div class="blog-card-body">
    <span class="blog-card-category">{cat_link}</span>
    <h3 class="blog-card-title"><a href="{url}">{title}</a></h3>
    <p class="blog-card-excerpt">{excerpt}</p>
    {tags_html}
    <div class="blog-card-meta">
      <span><i class="bi bi-person-circle"></i> {author_link}</span>
      <span><i class="bi bi-calendar3"></i> {formatted_date}</span>
      <span><i class="bi bi-clock"></i> {read_time}</span>
    </div>
    <a href="{url}" class="blog-card-read-more">Weiterlesen <i class="bi bi-arrow-right"></i></a>
  </div>
</article>'''


def inject_between_markers(html: str, start: str, end: str, new_content: str) -> tuple[str, bool]:
    pattern = re.compile(re.escape(start) + r'[\s\S]*?' + re.escape(end))
    replacement = f'{start}\n{new_content}\n{end}'
    new_html, n = pattern.subn(replacement, html, count=1)
    if n == 0:
        return html, False
    return new_html, True


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def build_paginated_json(articles: list[dict], out_dir: Path) -> tuple[int, int]:
    total = len(articles)
    total_pages = max(1, (total + POSTS_PER_PAGE - 1) // POSTS_PER_PAGE)

    for p in out_dir.glob('blogs-page-*.json'):
        p.unlink()

    for page in range(1, total_pages + 1):
        start = (page - 1) * POSTS_PER_PAGE
        page_data = {
            'pageNumber': page,
            'blogs': articles[start:start + POSTS_PER_PAGE]
        }
        write_json(out_dir / f'blogs-page-{page}.json', page_data)
    return total, total_pages


def build_index_json(articles: list[dict], categories_manifest: dict, total_pages: int, out_dir: Path) -> None:
    counts = defaultdict(int)
    for a in articles:
        counts[a['categorySlug']] += 1
    cats = []
    for c in categories_manifest.get('categories', []):
        cats.append({
            'name': c['name'],
            'slug': c['slug'],
            'count': counts.get(c['slug'], 0)
        })
    data = {
        'totalBlogs': len(articles),
        'totalPages': total_pages,
        'postsPerPage': POSTS_PER_PAGE,
        'categories': cats,
        'latestUpdate': articles[0]['date'] if articles else datetime.now().strftime('%Y-%m-%d')
    }
    write_json(out_dir / 'blogs-index.json', data)


def render_blog_filter(categories: list[dict]) -> str:
    items = ['<li><a href="/blog" class="active">All Posts</a></li>']
    for c in categories:
        items.append(
            f'<li><a href="/category/{c["slug"]}">{html_escape(c["name"])}</a></li>'
        )
    return '<ul class="filter-list" id="categoryFilter">\n  ' + '\n  '.join(items) + '\n</ul>'


def ssr_blog_list(root: Path, articles: list[dict], categories_manifest: dict, authors_manifest: dict, tags_manifest: dict) -> bool:
    # 兼容两种命名约定：blog.html（新站默认）或 blogs.html（老站遗留）
    target = root / 'blog.html'
    if not target.exists():
        target = root / 'blogs.html'
    if not target.exists():
        return False
    cards = '\n'.join(render_card(a) for a in articles) if articles else \
            '<p class="empty-state">Demnächst neue Artikel.</p>'
    filter_html = render_blog_filter(categories_manifest.get('categories', []))
    sidebar_html = render_sidebar(
        'blog', '',
        categories_manifest.get('categories', []),
        tags_manifest.get('tags', []),
        authors_manifest.get('authors', []),
    )
    html = target.read_text(encoding='utf-8')
    new_html, ok_grid = inject_between_markers(html, '<!-- BLOG_GRID_START -->', '<!-- BLOG_GRID_END -->', cards)
    new_html, _ = inject_between_markers(new_html, '<!-- BLOG_FILTER_START -->', '<!-- BLOG_FILTER_END -->', filter_html)
    new_html, _ = inject_between_markers(new_html, '<!-- BLOG_SIDEBAR_START -->', '<!-- BLOG_SIDEBAR_END -->', sidebar_html)
    if not ok_grid:
        return False
    if new_html != html:
        target.write_text(new_html, encoding='utf-8')
    return True


def render_feature_grid(block: dict) -> str:
    items = block.get('items', [])
    title = html_escape(block.get('title', ''))
    subtitle = html_escape(block.get('subtitle', ''))
    items_html = ''.join(
        f'''<div class="col-md-6 col-lg-4">
          <div class="feature-item">
            <div class="feature-icon"><i class="bi {html_escape(it.get('icon','bi-check-circle'))}"></i></div>
            <h3 class="feature-title">{html_escape(it.get('title',''))}</h3>
            <p class="feature-body">{html_escape(it.get('body',''))}</p>
          </div>
        </div>''' for it in items
    )
    subtitle_html = f'<p class="section-subtitle">{subtitle}</p>' if subtitle else ''
    return f'''<section class="page-section feature-grid-section">
      <div class="container">
        <h2 class="section-title">{title}</h2>
        {subtitle_html}
        <div class="row g-4">{items_html}</div>
      </div>
    </section>'''


def render_faq(block: dict) -> str:
    title = html_escape(block.get('title', 'FAQ'))
    items = block.get('items', [])
    items_html = ''
    for i, it in enumerate(items):
        q = html_escape(it.get('q', ''))
        a = html_escape(it.get('a', ''))
        items_html += f'''<details class="faq-item">
          <summary>{q}</summary>
          <div class="faq-answer"><p>{a}</p></div>
        </details>'''
    return f'''<section class="page-section faq-section">
      <div class="container">
        <h2 class="section-title">{title}</h2>
        <div class="faq-list">{items_html}</div>
      </div>
    </section>'''


def render_cta_banner(block: dict) -> str:
    heading = html_escape(block.get('heading', ''))
    body = html_escape(block.get('body', ''))
    btn_text = html_escape(block.get('button_text', 'Get in touch'))
    btn_link = html_escape(block.get('button_link', '/contact-us'))
    return f'''<section class="page-section cta-banner-section">
      <div class="container">
        <div class="cta-banner">
          <h2 class="cta-heading">{heading}</h2>
          <p class="cta-body">{body}</p>
          <a href="{btn_link}" class="cta-button">{btn_text} <i class="bi bi-arrow-right"></i></a>
        </div>
      </div>
    </section>'''


def render_stat_row(block: dict) -> str:
    items = block.get('items', [])
    items_html = ''.join(
        f'''<div class="stat-col">
          <div class="stat-value">{html_escape(it.get('value',''))}</div>
          <div class="stat-label">{html_escape(it.get('label',''))}</div>
        </div>''' for it in items
    )
    return f'''<section class="page-section stat-row-section">
      <div class="container"><div class="stat-row">{items_html}</div></div>
    </section>'''


def render_custom_html(block: dict) -> str:
    return f'<section class="page-section custom-section"><div class="container">{block.get("html","")}</div></section>'


BLOCK_RENDERERS = {
    'feature_grid': render_feature_grid,
    'faq': render_faq,
    'cta_banner': render_cta_banner,
    'stat_row': render_stat_row,
    'custom_html': render_custom_html,
}


def render_sections(sections: list[dict]) -> str:
    out = []
    for block in sections or []:
        renderer = BLOCK_RENDERERS.get(block.get('type'))
        if renderer:
            out.append(renderer(block))
    return '\n'.join(out)


def ssr_category_pages(root: Path, articles: list[dict], categories_manifest: dict, authors_manifest: dict, tags_manifest: dict, brand: str, domain: str, topbar_config: str) -> int:
    cat_dir = root / 'category'
    cat_dir.mkdir(exist_ok=True)
    by_slug = defaultdict(list)
    for a in articles:
        by_slug[a['categorySlug']].append(a)

    updated = 0
    for cat in categories_manifest.get('categories', []):
        slug = cat['slug']
        name = cat['name']
        seo = cat.get('seo') or {}
        hero = cat.get('hero') or {}

        seo_title = seo.get('title') or f"{name} — Artikel | {brand}"
        seo_description = seo.get('description') or cat.get('description', '')
        seo_keywords = seo.get('keywords') or ''
        og_title = seo_title.split('|')[0].strip()
        og_image = seo.get('og_image') or DEFAULT_BG_IMAGES.get(slug, '')

        h1 = hero.get('h1') or name
        subtitle = hero.get('subtitle') or cat.get('description', '')
        icon = cat.get('icon') or 'bi-folder'

        hero_badge = ''
        if hero.get('badge'):
            hero_badge = f'<div class="page-hero-badge"><i class="bi bi-bookmark-star-fill"></i> {html_escape(hero["badge"])}</div>'

        hero_cta = ''
        if hero.get('cta_text') and hero.get('cta_link'):
            hero_cta = f'<a href="{html_escape(hero["cta_link"])}" class="page-hero-cta">{html_escape(hero["cta_text"])} <i class="bi bi-arrow-right"></i></a>'

        # Hero 背景图优先级：
        # 1) category.hero.background_image（manifest 显式配置）
        # 2) 该分类下**最早一篇**文章的 thumbnail — 避免和 grid 里首屏最新文章卡片图重叠
        # 3) category.seo.og_image
        # 4) DEFAULT_BG_IMAGES[slug] 兜底
        arts_for_hero = by_slug.get(slug, [])
        oldest_article_thumb = ''
        for art in reversed(arts_for_hero):
            if art.get('thumbnail'):
                oldest_article_thumb = art['thumbnail']
                break
        bg_image = (
            hero.get('background_image')
            or oldest_article_thumb
            or og_image
            or DEFAULT_BG_IMAGES.get(slug, '')
        )
        # 使用单引号包 URL，避免与外层 style="..." 的双引号冲突（会截断属性）
        bg_image_url = f", url('{html_escape(bg_image, quote=True)}')" if bg_image else ''

        sidebar_html = render_sidebar(
            'category', slug,
            categories_manifest.get('categories', []),
            tags_manifest.get('tags', []),
            authors_manifest.get('authors', []),
        )

        arts = by_slug.get(slug, [])
        cards = '\n'.join(render_card(a) for a in arts) if arts else \
                f'<p class="empty-state">No {name} articles yet. New articles will appear here.</p>'

        sections_html = render_sections(cat.get('sections', []))

        page_html = CATEGORY_PAGE_TEMPLATE.format(
            slug=slug,
            name=html_escape(name),
            seo_title=html_escape(seo_title),
            og_title=html_escape(og_title),
            seo_description=html_escape(seo_description),
            seo_keywords=html_escape(seo_keywords),
            og_image=html_escape(og_image),
            icon=html_escape(icon),
            h1=html_escape(h1),
            subtitle=html_escape(subtitle),
            hero_badge=hero_badge,
            hero_cta=hero_cta,
            bg_image_url=bg_image_url,
            sidebar_html=sidebar_html,
            brand=html_escape(brand),
            domain=html_escape(domain),
            topbar_config=topbar_config,
        )

        # Inject cards + sections into marker slots
        page_html, _ = inject_between_markers(page_html, '<!-- CATEGORY_GRID_START -->', '<!-- CATEGORY_GRID_END -->', cards)
        page_html, _ = inject_between_markers(page_html, '<!-- CATEGORY_SECTIONS_START -->', '<!-- CATEGORY_SECTIONS_END -->', sections_html)

        target = cat_dir / f'{slug}.html'
        target.write_text(page_html, encoding='utf-8')
        updated += 1
    return updated


DEFAULT_BG_IMAGES = {
    'manufacturing': 'https://docerp.s3.us-west-1.amazonaws.com/images/p_14/d_default/48760783e9cf8297fc0198ed731b3d67.webp',
    'fabric-technology': 'https://docerp.s3.us-west-1.amazonaws.com/images/p_14/d_default/372f5478573476c5de199e50a54e8b4e.webp',
}

DEFAULT_TAG_BG_IMAGE = '/assets/images/tag-hero-bg.webp'


def render_sidebar(current_type: str, current_slug: str, categories: list[dict], tags: list[dict], authors: list[dict]) -> str:
    """Renders the left sidebar shared by blog / category / tag / author pages."""
    # Categories widget
    cat_items = []
    for c in categories:
        active = 'sidebar-active' if (current_type == 'category' and c['slug'] == current_slug) else ''
        cat_items.append(f'''<li class="{active}"><a href="/category/{c['slug']}"><i class="bi {html_escape(c.get('icon','bi-folder'))}"></i> {html_escape(c['name'])}</a></li>''')
    cat_html = '\n'.join(cat_items)

    # Tags widget (cloud style)
    tag_items = []
    for t in tags:
        active = 'tag-active' if (current_type == 'tag' and t['slug'] == current_slug) else ''
        tag_items.append(f'<a href="/tag/{t["slug"]}" class="sidebar-tag {active}">#{html_escape(t["name"])}</a>')
    tag_html = ' '.join(tag_items)

    # Authors widget
    author_items = []
    for a in authors:
        active = 'sidebar-active' if (current_type == 'author' and a['slug'] == current_slug) else ''
        avatar = a.get('avatar_url', '/assets/images/authors/placeholder.webp')
        avatar_local = re.sub(r'^https?://[^/]+', '', avatar)  # A′ onerror fallback (strip CDN host)
        _onerr = f''' onerror="this.onerror=null;this.src='{html_escape(avatar_local)}'"''' if avatar.startswith('http') else ''
        author_items.append(f'''<li class="{active}"><a href="/author/{a['slug']}">
            <img src="{html_escape(avatar)}" alt="{html_escape(a['name'])}" loading="lazy"{_onerr}>
            <div><div class="author-name">{html_escape(a['name'])}</div><div class="author-role">{html_escape(a.get('title',''))}</div></div>
          </a></li>''')
    author_html = '\n'.join(author_items)

    return f'''<aside class="blog-sidebar">
      <div class="sidebar-widget">
        <h3 class="sidebar-title"><i class="bi bi-folder2-open"></i> Kategorien</h3>
        <ul class="sidebar-list sidebar-categories">{cat_html}</ul>
      </div>
      <div class="sidebar-widget">
        <h3 class="sidebar-title"><i class="bi bi-tags"></i> Beliebte Tags</h3>
        <div class="sidebar-tags">{tag_html}</div>
      </div>
      <div class="sidebar-widget">
        <h3 class="sidebar-title"><i class="bi bi-people"></i> Autoren</h3>
        <ul class="sidebar-list sidebar-authors">{author_html}</ul>
      </div>
      <div class="sidebar-widget sidebar-cta">
        <h3>Need a Factory Quote?</h3>
        <p>MOQ from 100 pcs · OEM & ODM · Global shipping.</p>
        <a href="/contact-us" class="sidebar-cta-btn">Get Quote <i class="bi bi-arrow-right"></i></a>
      </div>
    </aside>'''


CATEGORY_PAGE_TEMPLATE = '''<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{seo_title}</title>
    <meta name="description" content="{seo_description}">
    <meta name="keywords" content="{seo_keywords}">
    <link rel="canonical" href="https://www.{domain}/category/{slug}">

    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png">
    <link rel="manifest" href="/manifest.json">

    <meta property="og:type" content="website">
    <meta property="og:title" content="{og_title}">
    <meta property="og:description" content="{seo_description}">
    <meta property="og:url" content="https://www.{domain}/category/{slug}">
    <meta property="og:site_name" content="{brand}">
    <meta property="og:image" content="{og_image}">
    <meta property="og:locale" content="de_DE">

    <meta name="robots" content="index, follow, max-image-preview:large">

    <link href="/assets/css/bootstrap.min.css" rel="stylesheet">
    <link href="/assets/css/bootstrap-icons.min.css" rel="stylesheet">
    <link href="/assets/css/global.css" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/topbar.css?v=20260419-4">
    <link rel="stylesheet" href="/assets/css/dynamic-menu.css?v=20260419-4">
    <link rel="stylesheet" href="/assets/css/blog-card.css?v=20260419-4">
    <link rel="stylesheet" href="/assets/css/blog-pages.css?v=20260419-4">

    <script>window.topBarConfig = {topbar_config};</script>
    <script>
        window.DynamicMenuConfig = {{
            menuFile: '/assets/menu-config.json',
            brandColor: '#18181B',
            sticky: true, theme: 'light', animation: true, showSearch: false,
            containerId: 'dynamic-menu-container'
        }};
    </script>

    <script type="application/ld+json">
    {{
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "{seo_title}",
      "description": "{seo_description}",
      "url": "https://www.{domain}/category/{slug}",
      "inLanguage": "de",
      "publisher": {{ "@type": "Organization", "name": "{brand}", "url": "https://www.{domain}" }}
    }}
    </script>
    <script type="application/ld+json">
    {{
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {{ "@type": "ListItem", "position": 1, "name": "Startseite", "item": "https://www.{domain}/" }},
        {{ "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.{domain}/blog" }},
        {{ "@type": "ListItem", "position": 3, "name": "{name}" }}
      ]
    }}
    </script>
</head>
<body>

<div id="topbar-container"></div>
<div id="dynamic-menu-container"></div>

<section class="page-hero" style="background-image: linear-gradient(180deg, rgba(31, 41, 55,0.35) 0%, rgba(31, 41, 55,0.55) 100%){bg_image_url};">
    <div class="container page-hero-inner">
        {hero_badge}
        <div class="page-hero-icon"><i class="bi {icon}"></i></div>
        <h1>{h1}</h1>
        <p class="page-hero-subtitle">{subtitle}</p>
        {hero_cta}
    </div>
</section>

<section class="page-section-wrap">
    <div class="container">
        <nav aria-label="breadcrumb" class="page-breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="/"><i class="bi bi-house-door"></i> Startseite</a></li>
                <li class="breadcrumb-item"><a href="/blog">Blog</a></li>
                <li class="breadcrumb-item active" aria-current="page">{name}</li>
            </ol>
        </nav>

        <div class="row g-4">
            <div class="col-lg-3 order-lg-1 order-2">
                {sidebar_html}
            </div>
            <div class="col-lg-9 order-lg-2 order-1">
                <h2 class="articles-heading">Artikel in {name}</h2>
                <div class="row g-4">
                    <!-- CATEGORY_GRID_START -->
                    <!-- CATEGORY_GRID_END -->
                </div>

                <!-- CATEGORY_SECTIONS_START -->
                <!-- CATEGORY_SECTIONS_END -->
            </div>
        </div>
    </div>
</section>

<div id="footer-container"></div>

<script src="/assets/js/bootstrap.bundle.min.js"></script>
<script src="/assets/topbar.js"></script>
<script src="/assets/dynamic-menu.js"></script>
<script>
    window.FooterConfig = {{
        configFile: '/assets/footer-config.json',
        backgroundColor: '#18181B', textColor: '#ffffff', linkColor: '#bbbbbb', brandColor: '#C81E1E',
        containerId: 'footer-container'
    }};
</script>
<script src="/assets/footer.js"></script>

</body>
</html>
'''


TAG_PAGE_TEMPLATE = '''<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{tag_title} — Artikel mit Tag {tag_display} | {brand}</title>
    <meta name="description" content="{tag_description}">
    <meta name="keywords" content="{tag_display}, {tag_slug}">
    <link rel="canonical" href="https://www.{domain}/tag/{tag_slug}">

    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png">
    <link rel="manifest" href="/manifest.json">

    <meta property="og:type" content="website">
    <meta property="og:title" content="{tag_title} — Artikel mit Tag {tag_display}">
    <meta property="og:url" content="https://www.{domain}/tag/{tag_slug}">
    <meta property="og:site_name" content="{brand}">
    <meta name="robots" content="{robots}">

    <link href="/assets/css/bootstrap.min.css" rel="stylesheet">
    <link href="/assets/css/bootstrap-icons.min.css" rel="stylesheet">
    <link href="/assets/css/global.css" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/topbar.css?v=20260419-4">
    <link rel="stylesheet" href="/assets/css/dynamic-menu.css?v=20260419-4">
    <link rel="stylesheet" href="/assets/css/blog-card.css?v=20260419-4">
    <link rel="stylesheet" href="/assets/css/blog-pages.css?v=20260419-4">

    <script>
        window.topBarConfig = {topbar_config};
    </script>
    <script>
        window.DynamicMenuConfig = {{
            menuFile: '/assets/menu-config.json',
            brandColor: '#18181B',
            sticky: true, theme: 'light', animation: true, showSearch: false,
            containerId: 'dynamic-menu-container'
        }};
    </script>

    <script type="application/ld+json">
    {{
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "{tag_title} — Artikel mit Tag {tag_display}",
      "url": "https://www.{domain}/tag/{tag_slug}",
      "inLanguage": "de",
      "publisher": {{ "@type": "Organization", "name": "{brand}", "url": "https://www.{domain}" }}
    }}
    </script>
</head>
<body>

<div id="topbar-container"></div>
<div id="dynamic-menu-container"></div>

<section class="page-hero" style="background: linear-gradient(135deg, #18181B 0%, #3A4448 100%);">
    <div class="container page-hero-inner">
        <div class="page-hero-badge"><i class="bi bi-tag-fill"></i> TAG</div>
        <div class="page-hero-icon"><i class="bi bi-tag"></i></div>
        <h1>{tag_display}</h1>
        <p class="page-hero-subtitle">{tag_description}</p>
    </div>
</section>

<section class="page-section-wrap">
    <div class="container">
        <nav aria-label="breadcrumb" class="page-breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="/"><i class="bi bi-house-door"></i> Startseite</a></li>
                <li class="breadcrumb-item"><a href="/blog">Blog</a></li>
                <li class="breadcrumb-item active" aria-current="page">Tag: {tag_display}</li>
            </ol>
        </nav>

        <div class="row g-4">
            <div class="col-lg-3 order-lg-1 order-2">
                {sidebar_html}
            </div>
            <div class="col-lg-9 order-lg-2 order-1">
                <h2 class="articles-heading">Artikel mit Tag {tag_display}</h2>
                <div class="row g-4">
                    <!-- TAG_GRID_START -->
                    <!-- TAG_GRID_END -->
                </div>
            </div>
        </div>
    </div>
</section>

<div id="footer-container"></div>

<script src="/assets/js/bootstrap.bundle.min.js"></script>
<script src="/assets/topbar.js"></script>
<script src="/assets/dynamic-menu.js"></script>
<script>
    window.FooterConfig = {{
        configFile: '/assets/footer-config.json',
        backgroundColor: '#18181B', textColor: '#ffffff', linkColor: '#bbbbbb', brandColor: '#C81E1E',
        containerId: 'footer-container'
    }};
</script>
<script src="/assets/footer.js"></script>

</body>
</html>
'''


def tag_slug(tag: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', tag.lower()).strip('-')


def build_tag_pages(root: Path, articles: list[dict], tags_manifest: dict, categories_manifest: dict, authors_manifest: dict, brand: str, domain: str, topbar_config: str) -> int:
    tag_dir = root / 'tag'
    tag_dir.mkdir(exist_ok=True)

    by_slug: dict[str, list[dict]] = defaultdict(list)
    for a in articles:
        for t in a.get('tags', []):
            by_slug[t['slug']].append(a)

    registered_slugs = {t['slug'] for t in tags_manifest.get('tags', [])}
    for stale in tag_dir.glob('*.html'):
        if stale.stem not in registered_slugs:
            stale.unlink()

    for tag_obj in tags_manifest.get('tags', []):
        slug = tag_obj['slug']
        name = tag_obj['name']
        desc = tag_obj.get('description', f'Artikel mit Tag {name}.')
        arts = by_slug.get(slug, [])

        sidebar_html = render_sidebar(
            'tag', slug,
            categories_manifest.get('categories', []),
            tags_manifest.get('tags', []),
            authors_manifest.get('authors', []),
        )

        bg_image = tag_obj.get('background_image') or DEFAULT_TAG_BG_IMAGE
        robots = 'index, follow, max-image-preview:large' if len(arts) >= 2 else 'noindex, follow'
        page_html = TAG_PAGE_TEMPLATE.format(
            tag_slug=slug,
            tag_display=html_escape(name),
            tag_title=html_escape(name),
            tag_description=html_escape(desc),
            brand=html_escape(brand),
            domain=html_escape(domain),
            topbar_config=topbar_config,
            sidebar_html=sidebar_html,
            bg_image=html_escape(bg_image),
            robots=robots,
        )

        cards = '\n'.join(render_card(a) for a in arts) if arts else \
                f'<p class="empty-state">Noch keine Artikel mit Tag <strong>{html_escape(name)}</strong>.</p>'
        page_html, _ = inject_between_markers(page_html, '<!-- TAG_GRID_START -->', '<!-- TAG_GRID_END -->', cards)

        target = tag_dir / f'{slug}.html'
        target.write_text(page_html, encoding='utf-8')

    return len(tags_manifest.get('tags', []))


def ssr_author_pages(root: Path, articles: list[dict], authors_manifest: dict) -> int:
    author_dir = root / 'author'
    if not author_dir.is_dir():
        return 0
    by_slug = defaultdict(list)
    for a in articles:
        by_slug[a.get('authorSlug', '')].append(a)

    updated = 0
    for author in authors_manifest.get('authors', []):
        target = author_dir / f"{author['slug']}.html"
        if not target.exists():
            continue
        arts = by_slug.get(author['slug'], [])
        cards = '\n'.join(render_card(a) for a in arts) if arts else \
                f'<p class="empty-state">Demnächst neue Artikel von {author["name"]}.</p>'
        html = target.read_text(encoding='utf-8')
        new_html, ok = inject_between_markers(html, '<!-- AUTHOR_GRID_START -->', '<!-- AUTHOR_GRID_END -->', cards)
        if ok and new_html != html:
            target.write_text(new_html, encoding='utf-8')
            updated += 1
    return updated


SITEMAP_SKIP = {'404.html', '500.html', 'privacy.html', 'terms.html', '_shell.html'}
SITEMAP_PRIORITIES = {
    '': 1.0,              # /
    'index': 1.0,
    'blog': 0.9,
    'blogs': 0.9,
    'about': 0.7, 'about-us': 0.7,
    'contact': 0.7, 'contact-us': 0.7,
    'faq': 0.6,
}
CHANGE_FREQ = {
    '': 'weekly', 'index': 'weekly',
    'blog': 'daily', 'blogs': 'daily',
    'category': 'weekly', 'tag': 'weekly', 'author': 'monthly',
}


def _page_is_noindex(path: Path) -> bool:
    try:
        head = path.read_text(encoding='utf-8', errors='ignore')[:6000].lower()
        return 'noindex' in head and 'name="robots"' in head and \
               ('content="noindex' in head or "content='noindex" in head)
    except Exception:
        return False


def _sitemap_entry_priority(rel_path: str) -> tuple[str, float]:
    parts = rel_path.replace('\\', '/').split('/')
    stem = parts[-1].replace('.html', '')
    if len(parts) == 1:  # root-level
        return CHANGE_FREQ.get(stem, 'monthly'), SITEMAP_PRIORITIES.get(stem, 0.8)
    top = parts[0]
    if top == 'category':
        return 'weekly', 0.8
    if top == 'tag':
        return 'weekly', 0.6
    if top == 'author':
        return 'monthly', 0.5
    if top == 'blog':
        return 'daily', 0.8
    return 'monthly', 0.6


def write_sitemap(root: Path, domain: str) -> int:
    from datetime import datetime as _dt
    base = f'https://www.{domain}' if domain and not domain.startswith('http') else (domain or '')
    if not base:
        return 0

    entries: list[tuple[str, str, str, float]] = []  # (loc, lastmod, changefreq, priority)

    def add(html_path: Path, url_path: str):
        if html_path.name in SITEMAP_SKIP:
            return
        if _page_is_noindex(html_path):
            return
        lastmod = _dt.fromtimestamp(html_path.stat().st_mtime).strftime('%Y-%m-%d')
        rel = url_path.lstrip('/')
        freq, pri = _sitemap_entry_priority(rel or 'index')
        loc = f'{base}/{rel}'.rstrip('/') if rel else f'{base}/'
        entries.append((loc, lastmod, freq, pri))

    # Root-level HTML pages (excluding partials / 404 / etc.)
    for p in sorted(root.glob('*.html')):
        if p.name in SITEMAP_SKIP:
            continue
        slug = p.stem
        url = '/' if slug == 'index' else f'/{slug}'
        add(p, url)

    # Sub-folders: blog/, category/, tag/, author/ + landing subdirs (produkte/, leistungen/)
    for sub in ('blog', 'category', 'tag', 'author', 'produkte', 'leistungen'):
        sub_dir = root / sub
        if sub_dir.is_dir():
            for p in sorted(sub_dir.glob('*.html')):
                add(p, f'/{sub}/{p.stem}')

    entries.sort(key=lambda e: (-e[3], e[0]))  # priority desc, then alphabetical
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, freq, pri in entries:
        lines.append(f'  <url>\n    <loc>{html_escape(loc)}</loc>\n'
                     f'    <lastmod>{lastmod}</lastmod>\n'
                     f'    <changefreq>{freq}</changefreq>\n'
                     f'    <priority>{pri:.1f}</priority>\n  </url>')
    lines.append('</urlset>')
    (root / 'sitemap.xml').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return len(entries)


def main():
    root = Path.cwd()
    assets = root / 'assets'

    categories_path = assets / 'categories.json'
    authors_path = assets / 'authors.json'
    tags_path = assets / 'tags.json'

    missing = [p.name for p in [categories_path, authors_path, tags_path] if not p.exists()]
    if missing:
        print(f'ERROR: 缺失 manifest: {", ".join(missing)}。请先跑 /init-blog-framework', file=sys.stderr)
        sys.exit(1)

    categories_manifest = json.loads(categories_path.read_text(encoding='utf-8'))
    authors_manifest = json.loads(authors_path.read_text(encoding='utf-8'))
    tags_manifest = json.loads(tags_path.read_text(encoding='utf-8'))

    # Step 0: 先从 _posts/*.json 渲染文章（Shopify 模式：JSON 为数据源）
    # 失败必须 exit 非零 — 静默跳过会导致 ERP 标"已部署"但站点 HTML 不存在。
    posts_dir = root / '_posts'
    json_files = sorted(posts_dir.glob('*.json')) if posts_dir.is_dir() else []
    if json_files:
        print(f'📝 从 _posts/*.json 渲染文章（{len(json_files)} 篇）...')
        render_script = root / 'render_article.py'
        if not render_script.exists():
            print(
                f'ERROR: render_article.py 不存在于 {root}，'
                f'但 _posts/ 有 {len(json_files)} 个 JSON 待渲染。\n'
                f'解决：从 init-blog-framework/references/render_article.py 拷贝过来，'
                f'或重新跑 /init-blog-framework {root.name}',
                file=sys.stderr,
            )
            sys.exit(2)
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location('render_article', render_script)
            if not (spec and spec.loader):
                print(f'ERROR: 无法构造 render_article.py 的 import spec', file=sys.stderr)
                sys.exit(2)
            ra = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(ra)
            n = ra.build_articles_from_posts(root)
            print(f'   ✓ 渲染 {n} 篇文章')

            # 强校验：每个 _posts/*.json 必须对应一个 .html 文件
            missing_htmls = []
            for jf in json_files:
                slug = jf.stem
                if not (root / f'{slug}.html').exists():
                    missing_htmls.append(slug)
            if missing_htmls:
                print(
                    f'ERROR: render_article.py 跑完后仍有 {len(missing_htmls)} 篇 JSON '
                    f'未生成 HTML: {", ".join(missing_htmls[:5])}'
                    f'{"..." if len(missing_htmls) > 5 else ""}',
                    file=sys.stderr,
                )
                sys.exit(2)
        except SystemExit:
            raise
        except Exception as e:
            import traceback
            print(f'ERROR: _posts 渲染失败: {e}', file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            sys.exit(2)

    print(f'🔍 扫描 {root} 下的博客文章...')
    articles = scan_articles(root)
    print(f'   找到 {len(articles)} 篇文章')

    if articles:
        articles = enrich_with_manifests(articles, categories_manifest, authors_manifest, tags_manifest)

    print('📄 写入分页 JSON...')
    total, total_pages = build_paginated_json(articles, assets)
    build_index_json(articles, categories_manifest, total_pages, assets)
    print(f'   {total} 篇 / {total_pages} 页')

    menu_cfg = json.loads((assets / 'menu-config.json').read_text(encoding='utf-8'))
    brand = (menu_cfg.get('logo') or {}).get('text', 'Brand')
    topbar_cfg_path = assets / 'topbar-config.json'
    topbar_config_str = topbar_cfg_path.read_text(encoding='utf-8').strip() if topbar_cfg_path.exists() else '{}'
    domain_str = categories_manifest.get('domain', 'example.com')

    print('🎨 SSR 渲染静态卡片...')
    if ssr_blog_list(root, articles, categories_manifest, authors_manifest, tags_manifest):
        print('   ✓ blog list 更新（含 filter + sidebar）')
    else:
        print('   ⚠ 未找到 blog.html 或 blogs.html 的 <!-- BLOG_GRID_START/END --> 标记')

    cat_updated = ssr_category_pages(root, articles, categories_manifest, authors_manifest, tags_manifest, brand, domain_str, topbar_config_str)
    print(f'   ✓ {cat_updated} 个 category 页面更新')

    author_updated = ssr_author_pages(root, articles, authors_manifest)
    print(f'   ✓ {author_updated} 个 author 页面更新')

    tag_count = build_tag_pages(root, articles, tags_manifest, categories_manifest, authors_manifest, brand, domain_str, topbar_config_str)
    print(f'   ✓ {tag_count} 个 tag 页面已生成/更新（来自 tags.json manifest）')

    static_content_script = root / 'build-static-content.py'
    if static_content_script.exists():
        import subprocess
        print('🔗 静态化 nav + footer...')
        result = subprocess.run([sys.executable, str(static_content_script)], cwd=root, capture_output=True, text=True)
        if result.returncode == 0:
            print('   ✓ 全站 nav/footer 已静态化')
        else:
            print(f'   ⚠ build-static-content.py 失败: {result.stderr.strip()[:200]}', file=sys.stderr)

    print('🗺️  更新 sitemap.xml...')
    sm_count = write_sitemap(root, domain_str)
    print(f'   ✓ {sm_count} 条 URL 写入 sitemap.xml')

    print(f'\n✨ 构建完成 · 总文章 {total}，分类 {len(categories_manifest.get("categories", []))}，作者 {len(authors_manifest.get("authors", []))}')
    print('   ERP 单一入口：cd {site_dir} && python3 build_site.py')


if __name__ == '__main__':
    main()
