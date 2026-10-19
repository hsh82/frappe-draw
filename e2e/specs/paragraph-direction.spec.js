import { test, expect } from "../helpers/fixtures.js";
import { exitTextEdit, surfaceBox, TEXT_EDITOR, TOOLBAR } from "../helpers/editor.js";

test("Paragraph direction survives list editing, save, and reopen", async ({ page, diagram }) => {
	const name = await diagram.open("unified", { empty: true });
	const canvas = await surfaceBox(page);
	await page.mouse.dblclick(canvas.x + 400, canvas.y + 350);

	const editor = page.locator(`${TEXT_EDITOR} .ProseMirror`);
	await expect(editor).toBeVisible();
	await page.keyboard.type("این پروژه با Frappe 3 توسعه یافته است.");
	await page.locator(TOOLBAR).getByRole("button", { name: "Align center" }).click();
	await expect(page.getByText("Paragraph", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Right-to-Left (RTL)" }).click();
	await expect(editor.locator('p[dir="rtl"]')).toHaveCount(1);
	await expect(editor).toBeFocused();

	await page.keyboard.press("Enter");
	await page.keyboard.type("1. مرحبا Frappe 50%");
	await expect(editor.locator('ol > li[dir="rtl"]')).toHaveCount(1);
	await expect(editor.locator('ol > li > p[dir="rtl"]')).toHaveCount(1);
	await exitTextEdit(page);

	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain('<li dir="rtl"><p dir="rtl">');
	await page.goto(`/draw/d/${name}`);
	await page.waitForLoadState("networkidle");
	await expect(page.locator('.fd-richtext ol > li[dir="rtl"]')).toHaveCount(1);
	await expect(page.locator('.fd-richtext p[dir="rtl"]')).toHaveCount(2);
});
