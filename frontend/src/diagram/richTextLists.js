import { sanitizeRichText } from "@/utils/sanitizeHtml.js";

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"]);
const LIST_TAG = /<\s*(?:ul|ol)\b/i;

export function richTextLines(html, fallbackText = "") {
	if (!html || !LIST_TAG.test(String(html))) return plainLines(fallbackText);
	const safeHtml = sanitizeRichText(html);
	if (!safeHtml || typeof DOMParser === "undefined") return plainLines(fallbackText);

	const document = new DOMParser().parseFromString(safeHtml, "text/html");
	const lines = [];
	readBlocks(document.body, lines);
	return lines.length ? lines : plainLines(fallbackText);
}

export function richTextLayoutText(lines) {
	return lines.map(layoutLine).join("\n");
}

export function markdownListLines(lines) {
	return lines.map(markdownLine).join("\n");
}

function readBlocks(parent, lines) {
	for (const child of parent.childNodes) {
		if (child.nodeType === 3) {
			const text = child.nodeValue.trim();
			if (text) lines.push(plainLine(text));
			continue;
		}
		if (child.nodeType !== 1) continue;
		if (child.tagName === "UL" || child.tagName === "OL") {
			readList(child, lines, 0);
		} else if (BLOCK_TAGS.has(child.tagName)) {
			const text = textWithoutLists(child).trim();
			if (text) lines.push(plainLine(text));
			readNestedLists(child, lines, 0);
		} else {
			readBlocks(child, lines);
		}
	}
}

function readNestedLists(parent, lines, depth) {
	for (const child of parent.children) {
		if (child.tagName === "UL" || child.tagName === "OL") readList(child, lines, depth);
	}
}

function readList(list, lines, depth) {
	const ordered = list.tagName === "OL";
	let number = safeStart(list.getAttribute("start"));
	for (const item of list.children) {
		if (item.tagName !== "LI") continue;
		const text = textWithoutLists(item).trim();
		lines.push({
			text,
			listType: ordered ? "ordered" : "bullet",
			depth,
			number,
		});
		if (ordered) number += 1;
		for (const nested of item.children) {
			if (nested.tagName === "UL" || nested.tagName === "OL") {
				readList(nested, lines, depth + 1);
			}
		}
	}
}

function textWithoutLists(node) {
	let text = "";
	for (const child of node.childNodes) {
		if (child.nodeType === 3) text += child.nodeValue;
		else if (child.nodeType === 1 && child.tagName === "BR") text += "\n";
		else if (child.nodeType === 1 && child.tagName !== "UL" && child.tagName !== "OL") {
			const childText = textWithoutLists(child);
			if (BLOCK_TAGS.has(child.tagName) && text && childText) text += "\n";
			text += childText;
		}
	}
	return text;
}

function plainLines(text) {
	return String(text || "")
		.split(/\r?\n/)
		.map((line) => plainLine(line));
}

function plainLine(text) {
	return { text, listType: null, depth: 0, number: null };
}

function safeStart(value) {
	if (value === null || value === "") return 1;
	const start = Number(value);
	return Number.isSafeInteger(start) && start > 0 ? start : 1;
}

function layoutLine(line) {
	// Non-whitespace keeps the heuristic node wrappers from dropping nested indent.
	const indent = "·····".repeat(line.depth || 0);
	const marker =
		line.listType === "bullet" ? "• " : line.listType === "ordered" ? `${line.number}. ` : "";
	return `${indent}${marker}${line.text}`;
}

function markdownLine(line) {
	const depth = Math.max(0, line.depth || 0);
	const indent = "  ".repeat(depth);
	const text = escapeMarkdown(line.text);
	if (line.listType === "ordered") return `${indent}${line.number}. ${text}`;
	return `${indent}- ${text}`;
}

function escapeMarkdown(text) {
	return String(text)
		.split(/\r?\n/)
		.map((line) => line.replace(/([\\`*_{}\[\]()#+.!|<>~-])/g, "\\$1"))
		.join("<br>");
}
