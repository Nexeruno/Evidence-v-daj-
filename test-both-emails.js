import { chromium } from 'playwright';

const emails = [
  { email: 'danzby@seznam.cz', name: 'Seznam' },
  { email: 'rezacdaniel2@gmail.com', name: 'Gmail' }
];

(async () => {
  for (const { email, name } of emails) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📧 TEST: ${name} (${email})`);
    console.log('='.repeat(50));

    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('🔴', msg.text());
      }
    });

    try {
      await page.goto('http://localhost:5174/Evidence-v-daj-/');
      await page.waitForLoadState('domcontentloaded');

      // Reset hesla přímo
      console.log('🔐 Testuji reset hesla...');
      const page2 = await browser.newPage();
      await page2.goto('http://localhost:5174/Evidence-v-daj-/', { waitUntil: 'domcontentloaded' });

      const forgotBtn = await page2.$('button:has-text("Zapomenuté")');
      if (forgotBtn) await forgotBtn.click();
      await page2.waitForTimeout(500);

      const emailField = await page2.$('input[type="email"]');
      if (emailField) await emailField.fill(email);
      await page2.waitForTimeout(500);

      const submitBtn = await page2.$('button:has-text("Odeslat")');
      if (submitBtn) {
        console.log(`📤 Odesílám reset na: ${email}`);
        await submitBtn.click();

        // Čekej na response
        for (let i = 0; i < 15; i++) {
          const successEl = await page2.$('text=Odkaz pro reset');
          const errorEl = await page2.$('[class*="error"], [class*="red"]');

          if (successEl) {
            console.log(`✅ ${name}: EMAIL ODESLÁN ÚSPĚŠNĚ!`);
            break;
          }

          if (errorEl) {
            const errorText = await errorEl.innerText();
            console.log(`❌ ${name}: ${errorText}`);
            break;
          }

          console.log(`⏳ Čekám... (${i+1}/15)`);
          await page2.waitForTimeout(1000);
        }
      }

      await page2.close();
    } catch (err) {
      console.error(`❌ ${name}: ${err.message}`);
    } finally {
      await browser.close();
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('TEST HOTOV');
  console.log('='.repeat(50));
})();
