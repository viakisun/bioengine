// Capture Workbench Picker + Calibration screens via Playwright
import { chromium } from 'playwright'
import { promises as fs } from 'node:fs'

const OUT_DIR = '/Users/adminvia/devwork/_FarmSim/docs/rnd_packages/RS-2025-02219411_monitoring-sim/delivery_generic/html/_assets/screenshots'
const URL_BASE = 'http://localhost:8090'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  page.on('console', m => {
    if (m.type() === 'error') console.log('  [page-error]', m.text().slice(0, 120))
  })

  // 1. Workbench Picker — wait until shader compile done + Picker UI shows
  console.log('[1] Workbench Picker ...')
  await page.goto(`${URL_BASE}/?mode=workbench`, { waitUntil: 'load' })
  try {
    await page.waitForSelector('text=/시나리오|Scenario|선택|phenotyping|D[0-9]+/', { timeout: 45000 })
    console.log('  picker UI detected')
  } catch (e) {
    console.log('  picker UI not found in 45s — continuing')
  }
  await wait(2500)
  await page.screenshot({ path: `${OUT_DIR}/workbench-picker.png` })
  console.log(`  saved workbench-picker.png`)

  // 2. phenotyping filter
  console.log('[2] Picker — phenotyping filter ...')
  try {
    await page.click('text=/생육 분석/', { timeout: 5000 })
    await wait(800)
    await page.screenshot({ path: `${OUT_DIR}/workbench-picker-phenotyping.png` })
    console.log(`  saved workbench-picker-phenotyping.png`)
  } catch (e) {
    console.log(`  (filter not clicked: ${e.message.slice(0, 80)})`)
  }

  // 3. 시나리오 카드 클릭 → Workbench 진입
  console.log('[3] Scenario → Workbench main ...')
  try {
    const card = page.locator('button, div').filter({ hasText: /phenotyping.*D110|D110.*phenotyping|페노타이핑/i }).first()
    await card.click({ timeout: 5000 })
    await wait(1500)

    const startBtn = page.locator('button').filter({ hasText: /^(시작|Start|적용|진입|확인|Apply|OK|Begin)$/i }).first()
    if (await startBtn.isVisible({ timeout: 2000 })) {
      await startBtn.click()
    }
    await wait(8000)
    await page.screenshot({ path: `${OUT_DIR}/workbench-main.png` })
    console.log(`  saved workbench-main.png`)
  } catch (e) {
    console.log(`  (workbench enter failed: ${e.message.slice(0, 80)})`)
  }

  // 4. Calibrate 버튼 → Calibration 페이지
  console.log('[4] Calibrate page ...')
  try {
    await page.click('button:has-text("Calibrate")', { timeout: 5000 })
    await wait(4000)
    await page.screenshot({ path: `${OUT_DIR}/workbench-calibration.png` })
    console.log(`  saved workbench-calibration.png`)
  } catch (e) {
    console.log(`  (Calibrate click failed: ${e.message.slice(0, 80)})`)
  }

  // 5. Calibration — LAI 변수 탭
  console.log('[5] Calibration — LAI variable ...')
  try {
    const lai = page.locator('button').filter({ hasText: /^LAI$/ }).first()
    await lai.click({ timeout: 4000 })
    await wait(1500)
    await page.screenshot({ path: `${OUT_DIR}/workbench-calibration-lai.png` })
    console.log(`  saved workbench-calibration-lai.png`)
  } catch (e) {
    console.log(`  (LAI tab failed: ${e.message.slice(0, 80)})`)
  }

  await browser.close()
  console.log('done')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
