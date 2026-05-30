import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const testEmail = 'rezacdaniel2@gmail.com';
  const testPassword = 'TestPassword123!';

  // Loguj console messages z prohlížeče
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('🔴 Console Error:', msg.text());
    }
  });

  try {
    console.log('📱 Otevírám aplikaci...');
    await page.goto('http://localhost:5174/Evidence-v-daj-/');
    await page.waitForLoadState('domcontentloaded');

    console.log(`📝 Registruji uživatele: ${testEmail}...`);
    const regButton = await page.$('button:has-text("Registruj se")');
    if (regButton) await regButton.click();
    await page.waitForTimeout(500);

    const usernameInput = await page.$('input[placeholder*="3–20"]');
    if (usernameInput) await usernameInput.fill(`user${Date.now()}`);

    const emailInputs = await page.$$('input[type="email"]');
    if (emailInputs.length > 0) await emailInputs[0].fill(testEmail);

    const passwordInputs = await page.$$('input[type="password"]');
    if (passwordInputs.length > 0) await passwordInputs[0].fill(testPassword);
    if (passwordInputs.length > 1) await passwordInputs[1].fill(testPassword);

    const createBtn = await page.$('button:has-text("Vytvořit")');
    if (createBtn) await createBtn.click();
    await page.waitForTimeout(2000);

    console.log('✅ Uživatel vytvořen!');

    // Nová stránka pro reset hesla
    const page2 = await browser.newPage();
    page2.on('console', msg => {
      if (msg.type() === 'error') console.log('🔴 Page2 Error:', msg.text());
    });

    console.log('🔐 Načítám reset hesla...');
    await page2.goto('http://localhost:5174/Evidence-v-daj-/', { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(1000);

    const forgotBtn = await page2.$('button:has-text("Zapomenuté")');
    if (forgotBtn) await forgotBtn.click();
    await page2.waitForTimeout(500);

    console.log(`📧 Zadávám email: ${testEmail}`);
    const emailField = await page2.$('input[type="email"]');
    if (emailField) await emailField.fill(testEmail);
    await page2.waitForTimeout(500);

    const submitBtn = await page2.$('button:has-text("Odeslat")');
    if (submitBtn) {
      console.log('📤 Klikám na Odeslat...');
      await submitBtn.click();

      // Počkej a sleduj změny
      for (let i = 0; i < 20; i++) {
        const errorEl = await page2.$('[class*="error"], [class*="red"]');
        const successEl = await page2.$('text=Odkaz pro reset');

        if (errorEl) {
          const errorText = await errorEl.innerText();
          console.log('❌ Error:', errorText);
          break;
        }

        if (successEl) {
          console.log('✅ Success!');
          break;
        }

        console.log(`⏳ Čekám... (${i+1}/20)`);
        await page2.waitForTimeout(1000);
      }

      await page2.screenshot({ path: 'test-detailed-result.png' });
      console.log('📸 Screenshot uložen');
    }

    await browser.close();
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    await page.screenshot({ path: 'test-detailed-crash.png' });
    await browser.close();
    process.exit(1);
  }
})();
