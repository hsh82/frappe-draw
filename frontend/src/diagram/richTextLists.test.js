// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { markdownListLines, richTextLayoutText, richTextLines } from "./richTextLists.js";
import { mindmapNodeSize } from "./mindmapNodeSize.js";
import { flowchartNodeSize } from "./flowchartNodeSize.js";

describe("richTextLines", () => {
	it("reads decimal, bullet, and nested list items as text-only rows", () => {
		const lines = richTextLines(
			'<ol start="3"><li><p>First</p><ul><li><p>Nested</p></li></ul></li>' +
				"<li><p>Second</p></li></ol>"
		);

		expect(lines).toEqual([
			{ text: "First", listType: "ordered", depth: 0, number: 3, mode: "auto", dir: "ltr" },
			{
				text: "Nested",
				listType: "bullet",
				depth: 1,
				number: null,
				mode: "auto",
				dir: "ltr",
			},
			{ text: "Second", listType: "ordered", depth: 0, number: 4, mode: "auto", dir: "ltr" },
		]);
	});

	it("uses plain text when rich HTML is unavailable", () => {
		expect(richTextLines("", "First\nSecond")).toEqual([
			{ text: "First", listType: null, depth: 0, number: null },
			{ text: "Second", listType: null, depth: 0, number: null },
		]);
	});

	it("uses only sanitized text when the stored HTML contains unsafe markup", () => {
		const lines = richTextLines("<script>attack()</script><ul><li>Safe</li></ul>");

		expect(lines.map((line) => line.text)).toEqual(["Safe"]);
	});

	it("includes generated markers and indentation in text measurement", () => {
		const lines = richTextLines(
			"<ul><li>Top</li><li><p>Parent</p><ol><li>Child</li></ol></li></ul>"
		);

		expect(richTextLayoutText(lines)).toBe("• Top\n• Parent\n·····1. Child");
	});

	it("includes list markers and nested indentation in node sizing input", () => {
		const text = "x".repeat(20);
		const lines = richTextLines(`<ul><li>${text}<ol><li>${text}</li></ol></li></ul>`);
		const measuredText = richTextLayoutText(lines);
		const plainText = `${text}\n${text}`;

		expect(mindmapNodeSize({ text: measuredText }).h).toBeGreaterThan(
			mindmapNodeSize({ text: plainText }).h
		);
		const listed = flowchartNodeSize({ nodeType: "process", text: measuredText });
		const plain = flowchartNodeSize({ nodeType: "process", text: plainText });
		expect(listed.w * listed.h).toBeGreaterThan(plain.w * plain.h);
	});
});

describe("markdownListLines", () => {
	it("keeps nested list type and escapes text before output", () => {
		const lines = richTextLines(
			"<ol><li>First &amp; <em>safe</em> &lt;script&gt;</li>" +
				"<li>Second<ul><li>Nested [text]</li></ul></li></ol>"
		);

		expect(markdownListLines(lines)).toBe(
			"1. First & safe \\<script\\>\n2. Second\n  - Nested \\[text\\]"
		);
	});

	it("keeps a line break inside one list item instead of creating a new item", () => {
		const lines = richTextLines("<ul><li>First<br>- not another item</li></ul>");

		expect(markdownListLines(lines)).toBe("- First<br>- not another item");
	});
});
