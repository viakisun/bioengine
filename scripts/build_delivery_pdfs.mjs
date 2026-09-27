#!/usr/bin/env node
/*
 * Build delivery PDFs (5 docs) via markdown -> HTML -> Chromium print.
 *
 * - Input : docs/rnd_packages/RS-2025-02219411_monitoring-sim/delivery/sources/*.md
 * - HTML  : docs/rnd_packages/.../delivery/html/<n>.html  (kept as a deliverable)
 * - PDF   : docs/rnd_packages/.../delivery/<n>.pdf        (overwrites prior pandoc PDFs)
 *
 * Run:
 *   node scripts/build_delivery_pdfs.mjs
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Marked } from 'marked'
import { chromium } from 'playwright'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DELIVERY = path.join(REPO, 'docs/rnd_packages/RS-2025-02219411_monitoring-sim/delivery')
const SOURCES = path.join(DELIVERY, 'sources')
const HTML_DIR = path.join(DELIVERY, 'html')
const PDF_DIR = DELIVERY
const CSS_REL = '_assets/style.css'

const PROJECT_NO = 'RS-2025-02219411'
const PROJECT_TITLE = '적심·적과 농작업 로봇 관제 시각화 시뮬레이터 시작품'
const ORG = '주식회사 비아'

const DOCS = [
  { no: '01', src: '01_Visual_Acceptance_Pack.md', out: '01_Visual_Acceptance_Pack', productNo: 1, deliverableName: '시각 수용 갤러리' },
  { no: '06', src: '06_Architecture_Spec.md',  out: '06_Architecture_Spec',  productNo: 6, deliverableName: '시스템 아키텍처 설계서' },
  { no: '07', src: '07_User_Manual.md',        out: '07_User_Manual',        productNo: 7, deliverableName: '운용 매뉴얼' },
  { no: '08', src: '08_Developer_Guide.md',    out: '08_Developer_Guide',    productNo: 8, deliverableName: '개발자/관리자 가이드' },
  { no: '09', src: '09_Inspection_Plan.md',    out: '09_Inspection_Plan',    productNo: 9, deliverableName: '검수 플랜' },
  { no: '10', src: '10_Test_Report.md',        out: '10_Test_Report',        productNo: 10, deliverableName: '검수 시험 결과 보고서' },
]

// --- frontmatter -----------------------------------------------------------

function parseFrontmatter(raw) {
  const meta = {}
  let body = raw
  if (raw.startsWith('---\n')) {
    const end = raw.indexOf('\n---\n', 4)
    if (end !== -1) {
      const block = raw.slice(4, end)
      body = raw.slice(end + 5)
      for (const line of block.split('\n')) {
        const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (m) meta[m[1]] = m[2].trim()
      }
    }
  }
  return { meta, body }
}

// --- markdown setup --------------------------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function makeMarked() {
  const m = new Marked({ gfm: true, breaks: false })
  const toc = []
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const plain = text.replace(/<[^>]+>/g, '')
        const id = `h-${slugify(plain)}-${toc.length}`
        if (depth <= 3) toc.push({ depth, text: plain, id })
        return `<h${depth} id="${id}">${text}</h${depth}>\n`
      },
      // paragraph containing only a single image -> <figure><figcaption>
      paragraph({ tokens }) {
        if (tokens.length === 1 && tokens[0].type === 'image') {
          const t = tokens[0]
          const alt = escape(t.text || '')
          const href = escape(t.href || '')
          return `<figure><img src="${href}" alt="${alt}"><figcaption>${alt}</figcaption></figure>\n`
        }
        const text = this.parser.parseInline(tokens)
        return `<p>${text}</p>\n`
      },
    },
  })
  return { m, toc }
}

// --- HTML wrapper ----------------------------------------------------------

function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }

function renderCoverPage(doc, meta) {
  const title = meta.title || doc.deliverableName
  const subtitle = meta.subtitle || PROJECT_TITLE
  const author = meta.author || ORG
  const date = meta.date || '2026-06-18'
  return `
<section class="cover-page">
  <div class="cover-header">
    <span>${escape(PROJECT_NO)}</span>
    <span>산출물 #${doc.productNo}</span>
  </div>
  <div class="cover-title-block">
    <h1 class="cover-title">${escape(title)}</h1>
    <div class="cover-subtitle">${escape(subtitle)}</div>
    <div class="cover-doc-no">DOC.${doc.no} / ${escape(PROJECT_NO)}</div>
  </div>
  <div class="cover-meta">
    <table>
      <tr><th>과제번호</th><td>${escape(PROJECT_NO)}</td></tr>
      <tr><th>사업명</th><td>스마트팜 다부처패키지 혁신기술개발사업 — 과채류 맞춤형 농작업 지능로봇 및 관제 시스템 개발 및 실증</td></tr>
      <tr><th>산출물</th><td>#${doc.productNo} · ${escape(doc.deliverableName)}</td></tr>
      <tr><th>발주처</th><td>주식회사 비아</td></tr>
      <tr><th>주관기관</th><td>메타파머스</td></tr>
      <tr><th>작성자</th><td>${escape(author)}</td></tr>
      <tr><th>작성일</th><td>${escape(date)}</td></tr>
    </table>
  </div>
</section>`
}

function renderTOC(toc) {
  if (!toc.length) return ''
  const items = toc
    .filter(t => t.depth <= 2)
    .map(t => `<li class="toc-h${t.depth}"><div class="toc-row"><span class="toc-title-text">${escape(t.text)}</span><span class="toc-dots"></span></div></li>`)
    .join('\n    ')
  return `
<section class="toc-page">
  <h1 class="toc-title">목차</h1>
  <ul class="toc-list">
    ${items}
  </ul>
</section>`
}

function wrapHtml(doc, meta, coverHtml, tocHtml, bodyHtml) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escape(meta.title || doc.deliverableName)} — ${escape(PROJECT_NO)}</title>
<link rel="stylesheet" href="${CSS_REL}">
</head>
<body>
${coverHtml}
${tocHtml}
<article class="doc-body">
${bodyHtml}
</article>
</body>
</html>
`
}

// --- per-doc transform -----------------------------------------------------

function preprocessMarkdown(md) {
  // pandoc \newpage markers are redundant — every h1 already triggers page-break-before.
  // Strip them to avoid blank pages.
  md = md.replace(/^\\newpage\s*$/gm, '')
  return md
}

async function buildOne(doc, browser) {
  const srcPath = path.join(SOURCES, doc.src)
  const htmlPath = path.join(HTML_DIR, `${doc.out}.html`)
  const pdfPath = path.join(PDF_DIR, `${doc.out}.pdf`)

  const raw = await fs.readFile(srcPath, 'utf-8')
  const { meta, body } = parseFrontmatter(raw)
  const md = preprocessMarkdown(body)

  const { m, toc } = makeMarked()
  const bodyHtml = m.parse(md)

  const coverHtml = renderCoverPage(doc, meta)
  const tocHtml = renderTOC(toc)
  const html = wrapHtml(doc, meta, coverHtml, tocHtml, bodyHtml)

  await fs.writeFile(htmlPath, html, 'utf-8')

  // Print to PDF
  const page = await browser.newPage()
  const fileUrl = pathToFileURL(htmlPath).href
  await page.goto(fileUrl, { waitUntil: 'load' })
  await page.emulateMedia({ media: 'print' })
  // small wait for fonts
  await page.evaluate(() => document.fonts && document.fonts.ready)

  const headerTpl = `
<div style="width:100%; font-size:7pt; color:#666; padding:0 15mm; display:flex; justify-content:space-between; -webkit-print-color-adjust:exact;">
  <span>${escape(PROJECT_NO)} · 산출물 #${doc.productNo}</span>
  <span>${escape(meta.title || doc.deliverableName)}</span>
</div>`.trim()

  const footerTpl = `
<div style="width:100%; font-size:7pt; color:#666; padding:0 15mm; display:flex; justify-content:space-between; -webkit-print-color-adjust:exact;">
  <span>${escape(ORG)}</span>
  <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`.trim()

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: headerTpl,
    footerTemplate: footerTpl,
    printBackground: true,
    preferCSSPageSize: false,
  })
  await page.close()

  const stat = await fs.stat(pdfPath)
  return { html: htmlPath, pdf: pdfPath, size: stat.size, toc: toc.length }
}

// --- main ------------------------------------------------------------------

async function main() {
  await fs.mkdir(HTML_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const doc of DOCS) {
      process.stdout.write(`[build] ${doc.src} ... `)
      const r = await buildOne(doc, browser)
      console.log(`OK  (${(r.size / 1024).toFixed(1)} KB, ${r.toc} toc items)`)
      results.push({ ...r, no: doc.no })
    }
  } finally {
    await browser.close()
  }

  console.log('\n--- Summary ---')
  for (const r of results) {
    console.log(`  ${r.no}  ${path.relative(REPO, r.pdf)}  ${(r.size / 1024).toFixed(1)} KB`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
