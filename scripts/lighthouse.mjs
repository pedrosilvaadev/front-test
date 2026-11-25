#!/usr/bin/env node
/**
 * Lighthouse audit (README §10, P6-02). Versioned audit configuration:
 *
 *   npm run build && npm run lighthouse
 *
 * - Serves the optimized build with `vite preview` (default mock scenario,
 *   MSW + realtime enabled exactly as deployed; nothing is simplified for the audit).
 * - Pages: home and NFT detail. Profiles: Lighthouse `mobile` (default config:
 *   Moto G Power emulation, simulated slow 4G, 4x CPU slowdown) and `desktop`
 *   (desktop-config: 1350x940, simulated cable throttling).
 * - 3 runs per page/profile, each in a fresh Chrome profile (cold cache,
 *   service worker registered from scratch). Median per category and for
 *   LCP / CLS / TBT.
 * - Output: every run in `lighthouse-results/` (git-ignored); the median run
 *   of each page/profile (HTML + JSON) and `summary.{json,md}` in `docs/lighthouse/`.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const PORT = Number(process.env.LH_PORT ?? 4180)
const BASE = `http://localhost:${PORT}`
const RUNS = Number(process.env.LH_RUNS ?? 3)
const PAGES = [
  { id: 'home', path: '/' },
  { id: 'nft-detail', path: '/nft/emerald-ape-042' },
]
const PROFILES = [
  { id: 'mobile', config: undefined },
  { id: 'desktop', config: desktopConfig },
]
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']
const METRICS = {
  lcpMs: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbtMs: 'total-blocking-time',
  fcpMs: 'first-contentful-paint',
}
const RAW_DIR = path.resolve('lighthouse-results')
const OUT_DIR = path.resolve('docs/lighthouse')

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Preview server did not start at ${url}`)
}

async function runOnce(url, profile) {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'kurio-lh-'))
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-first-run', '--no-default-browser-check'],
    userDataDir,
  })
  try {
    const result = await lighthouse(url, { port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: CATEGORIES }, profile.config)
    if (!result) throw new Error('Lighthouse returned no result')
    return result
  } finally {
    await chrome.kill()
    try {
      // Windows may keep the profile locked for a moment after Chrome exits.
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    } catch {
      // best effort: a leftover temp profile does not affect the next run
    }
  }
}

async function main() {
  rmSync(RAW_DIR, { recursive: true, force: true })
  mkdirSync(RAW_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' })
  const summary = { generatedAt: new Date().toISOString(), environment: {}, conditions: {}, results: [] }
  try {
    await waitForServer(BASE)
    for (const page of PAGES) {
      for (const profile of PROFILES) {
        const runs = []
        for (let run = 1; run <= RUNS; run += 1) {
          const result = await runOnce(`${BASE}${page.path}`, profile)
          const { lhr } = result
          const base = path.join(RAW_DIR, `${page.id}-${profile.id}-run${run}`)
          writeFileSync(`${base}.report.html`, result.report[0])
          writeFileSync(`${base}.report.json`, result.report[1])
          const scores = Object.fromEntries(CATEGORIES.map((id) => [id, Math.round((lhr.categories[id]?.score ?? 0) * 100)]))
          const metrics = Object.fromEntries(Object.entries(METRICS).map(([key, audit]) => [key, lhr.audits[audit]?.numericValue ?? null]))
          runs.push({ run, scores, metrics, base })
          summary.environment = {
            lighthouse: lhr.lighthouseVersion,
            chrome: lhr.environment?.hostUserAgent ?? lhr.userAgent,
            benchmarkIndex: lhr.environment?.benchmarkIndex,
            node: process.version,
            os: `${os.type()} ${os.release()} ${os.arch()}`,
            cpus: os.cpus()[0]?.model,
          }
          summary.conditions[profile.id] = {
            formFactor: lhr.configSettings.formFactor,
            screenEmulation: lhr.configSettings.screenEmulation,
            throttlingMethod: lhr.configSettings.throttlingMethod,
            throttling: lhr.configSettings.throttling,
          }
          console.log(`${page.id} ${profile.id} run ${run}:`, JSON.stringify(scores), JSON.stringify(metrics))
        }
        const medians = {
          scores: Object.fromEntries(CATEGORIES.map((id) => [id, median(runs.map((r) => r.scores[id]))])),
          metrics: Object.fromEntries(Object.keys(METRICS).map((key) => [key, median(runs.map((r) => r.metrics[key]))])),
        }
        // Representative report: the run whose performance score is the median.
        const representative = runs.find((r) => r.scores.performance === medians.scores.performance) ?? runs[0]
        for (const ext of ['html', 'json']) {
          copyFileSync(`${representative.base}.report.${ext}`, path.join(OUT_DIR, `${page.id}-${profile.id}.report.${ext}`))
        }
        summary.results.push({
          page: page.id,
          path: page.path,
          profile: profile.id,
          runs: runs.map(({ base: _base, ...rest }) => rest),
          medians,
          representativeRun: representative.run,
        })
      }
    }
  } finally {
    server.kill()
    if (process.platform === 'win32' && server.pid) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  }

  writeFileSync(path.join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  const ms = (v) => (v == null ? '–' : `${Math.round(v)} ms`)
  const lines = [
    '# Lighthouse — medians of 3 runs',
    '',
    `Generated ${summary.generatedAt} · Lighthouse ${summary.environment.lighthouse} · ${summary.environment.chrome}`,
    `Node ${summary.environment.node} · ${summary.environment.os} · ${summary.environment.cpus} · benchmarkIndex ${summary.environment.benchmarkIndex}`,
    '',
    '| Page | Profile | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT | Runs (perf) |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...summary.results.map(
      (r) =>
        `| ${r.page} | ${r.profile} | ${r.medians.scores.performance} | ${r.medians.scores.accessibility} | ${r.medians.scores['best-practices']} | ${r.medians.scores.seo} | ${ms(r.medians.metrics.lcpMs)} | ${r.medians.metrics.cls?.toFixed(3) ?? '–'} | ${ms(r.medians.metrics.tbtMs)} | ${r.runs.map((x) => x.scores.performance).join(' / ')} |`,
    ),
    '',
  ]
  writeFileSync(path.join(OUT_DIR, 'summary.md'), lines.join('\n'))
  console.log(lines.join('\n'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
