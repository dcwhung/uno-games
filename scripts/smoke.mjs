// Headless smoke test: open the app at phone-portrait, start a game, play a few turns.
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4173';
const OUT = process.env.OUT ?? '/tmp/shots';
const TURNS = 6;

const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
});

await page.goto(URL);
await page.waitForSelector('.lobby');
await page.screenshot({ path: `${OUT}/01-lobby.png` });
await page.getByRole('button', { name: 'Play' }).click();
await page.waitForSelector('.scorebar');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/02-table.png` });

// Drive the human's turns through the DOM where possible: draw when nothing playable.
for (let i = 0; i < TURNS; i++) {
    await page.waitForTimeout(1500);
    const banner = await page
        .locator('.turnbanner')
        .textContent()
        .catch(() => '');
    if (banner?.includes('Your turn')) {
        const colorPicker = await page.locator('.colors').count();
        if (colorPicker) {
            await page.locator('.swatch').first().click();
            continue;
        }
        const draw = page.getByRole('button', { name: 'Draw' });
        const pass = page.getByRole('button', { name: 'Pass' });
        if (await pass.count()) await pass.click();
        else if (await draw.count()) await draw.click();
    } else if (await page.locator('.swatch').count()) {
        await page.locator('.swatch').first().click();
    } else if (await page.getByRole('button', { name: 'Accept +4' }).count()) {
        await page.getByRole('button', { name: 'Accept +4' }).click();
    }
}
await page.screenshot({ path: `${OUT}/03-after-turns.png` });

// Landscape check
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/04-landscape.png` });

const scores = await page.locator('.score').allTextContents();
console.log(JSON.stringify({ scores, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
