#!/usr/bin/env node
/*
 * Generic-mode build — same pipeline as build_delivery_pdfs.mjs but with all
 * R&D / 과제 metadata stripped from cover / header / footer.
 *
 * - Input : docs/rnd_packages/.../delivery_generic/sources/*.md
 * - HTML  : docs/rnd_packages/.../delivery_generic/html/<n>.html
 * - PDF   : docs/rnd_packages/.../delivery_generic/<n>.pdf
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Marked } from 'marked'
import { chromium } from 'playwright'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DELIVERY = path.join(REPO, 'docs/rnd_packages/RS-2025-02219411_monitoring-sim/delivery_generic')
const SOURCES = path.join(DELIVERY, 'sources')
const HTML_DIR = path.join(DELIVERY, 'html')
const PDF_DIR = DELIVERY
const CSS_REL = '_assets/style.css'

const DOCS = [
  { no: '01', src: '01_Visual_Acceptance_Pack.md', out: '01_Visual_Acceptance_Pack', deliverableName: '시각 수용 갤러리' },
  { no: '06', src: '06_Architecture_Spec.md',  out: '06_Architecture_Spec',  deliverableName: '시스템 아키텍처 설계서' },
  { no: '07', src: '07_User_Manual.md',        out: '07_User_Manual',        deliverableName: '운용 매뉴얼' },
  { no: '08', src: '08_Developer_Guide.md',    out: '08_Developer_Guide',    deliverableName: '개발자/관리자 가이드' },
  { no: '09', src: '09_Inspection_Plan.md',    out: '09_Inspection_Plan',    deliverableName: '검수 플랜' },
  { no: '10', src: '10_Test_Report.md',        out: '10_Test_Report',        deliverableName: '검수 시험 결과 보고서' },
]

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
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

function renderCoverPage(doc, meta) {
  // Generic cover: title + subtitle only. No 과제 metadata.
  const title = meta.title || doc.deliverableName
  const subtitle = meta.subtitle || ''
  return `
<section class="cover-page">
  <div class="cover-title-block">
    <h1 class="cover-title">${escape(title)}</h1>
    ${subtitle ? `<div class="cover-subtitle">${escape(subtitle)}</div>` : ''}
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
<title>${escape(meta.title || doc.deliverableName)}</title>
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

function preprocessMarkdown(md) {
  return md.replace(/^\\newpage\s*$/gm, '')
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

  const html = wrapHtml(doc, meta, renderCoverPage(doc, meta), renderTOC(toc), bodyHtml)
  await fs.writeFile(htmlPath, html, 'utf-8')

  const page = await browser.newPage()
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => document.fonts && document.fonts.ready)

  // Generic header/footer: only doc title + page number. No 과제번호, no 발주처.
  const headerTpl = `
<div style="width:100%; font-size:7pt; color:#666; padding:0 15mm; text-align:right; -webkit-print-color-adjust:exact;">
  <span>${escape(meta.title || doc.deliverableName)}</span>
</div>`.trim()

  const footerTpl = `
<div style="width:100%; font-size:7pt; color:#666; padding:0 15mm; text-align:center; -webkit-print-color-adjust:exact;">
  <span class="pageNumber"></span> / <span class="totalPages"></span>
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

async function main() {
  await fs.mkdir(HTML_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const doc of DOCS) {
      process.stdout.write(`[build-generic] ${doc.src} ... `)
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
