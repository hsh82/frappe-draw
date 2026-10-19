import { sanitizeRichText } from "@/utils/sanitizeHtml.js";
import { resolveDirection, validDirectionMode } from "./textDirection.js";

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"]);
const LIST_TAG = /<\s*(?:ul|ol)\b/i;

export function richTextLines(html, fallbackText = "", { defaultDirection } = {}) {
	if (!html || (!LIST_TAG.test(String(html)) && !/\bdir\s*=/i.test(String(html))))
		return plainLines(fallbackText, defaultDirection);
	const safeHtml = sanitizeRichText(html);
	if (!safeHtml || typeof DOMParser === "undefined")
		return plainLines(fallbackText, defaultDirection);

	const document = new DOMParser().parseFromString(safeHtml, "text/html");
	const lines = [];
	readBlocks(document.body, lines, defaultDirection);
	return lines.length ? lines : plainLines(fallbackText, defaultDirection);
}

export function richTextLayoutText(lines) {
	return lines.map(layoutLine).join("\n");
}

// A whole-shape direction choice clears block and list direction overrides.
// Inline content is retained byte-for-byte by the DOM serializer where possible.
export function clearRichTextBlockDirections(html) {
	if (!html || typeof DOMParser === "undefined") return html;
	const document = new DOMParser().parseFromString(String(html), "text/html");
	for (const node of document.body.querySelectorAll(
		"div,p,h1,h2,h3,h4,h5,h6,pre,blockquote,ul,ol,li"
	)) {
		node.removeAttribute("dir");
	}
	return document.body.innerHTML;
}

export function renderRichTextWithDefaultDirection(html, defaultDirection) {
	const safeHtml = sanitizeRichText(html);
	if (!safeHtml || typeof DOMParser === "undefined") return safeHtml;
	const defaultMode = validDirectionMode(defaultDirection) || "auto";
	const document = new DOMParser().parseFromString(safeHtml, "text/html");
	const listItems = [...document.body.querySelectorAll("li")].map((item) => {
		const paragraph = item.querySelector(":scope > p");
		return {
			item,
			direction: effectiveListItemDirection(item, paragraph, defaultMode).direction,
		};
	});
	for (const { item, direction } of listItems) {
		item.setAttribute("dir", direction);
	}
	for (const block of document.body.querySelectorAll("p,h1,h2,h3,h4,h5,h6,pre")) {
		if (block.hasAttribute("dir") || block.closest("[dir]")) continue;
		if (defaultMode) block.setAttribute("dir", defaultMode);
	}
	return document.body.innerHTML;
}

function effectiveListItemDirection(item, paragraph, defaultDirection) {
	const text = paragraph?.textContent || item.textContent || "";
	const ancestorMode = directionModeFromAncestors(item);
	const mode =
		validDirectionMode(paragraph?.getAttribute("dir")) ||
		validDirectionMode(item.getAttribute("dir")) ||
		ancestorMode ||
		validDirectionMode(defaultDirection) ||
		"auto";
	return {
		mode,
		direction: resolveDirection(mode || "ltr", text),
	};
}

function directionModeFromAncestors(element) {
	for (
		let ancestor = element.parentElement;
		ancestor && ancestor.tagName !== "BODY";
		ancestor = ancestor.parentElement
	) {
		const mode = validDirectionMode(ancestor.getAttribute("dir"));
		if (mode) return mode;
	}
	return null;
}

export function markdownListLines(lines) {
	return lines.map(markdownLine).join("\n");
}

function readBlocks(parent, lines, defaultDirection) {
	for (const child of parent.childNodes) {
		if (child.nodeType === 3) {
			const text = child.nodeValue.trim();
			if (text) lines.push(plainLine(text, null, defaultDirection));
			continue;
		}
		if (child.nodeType !== 1) continue;
		if (child.tagName === "UL" || child.tagName === "OL") {
			readList(child, lines, 0, defaultDirection);
		} else if (BLOCK_TAGS.has(child.tagName)) {
			const text = textWithoutLists(child).trim();
			if (text) lines.push(plainLine(text, child, defaultDirection));
			readNestedLists(child, lines, 0, defaultDirection);
		} else {
			readBlocks(child, lines, defaultDirection);
		}
	}
}

function readNestedLists(parent, lines, depth, defaultDirection) {
	for (const child of parent.children) {
		if (child.tagName === "UL" || child.tagName === "OL") {
			readList(child, lines, depth, defaultDirection);
		}
	}
}

function readList(list, lines, depth, defaultDirection) {
	const ordered = list.tagName === "OL";
	let number = safeStart(list.getAttribute("start"));
	for (const item of list.children) {
		if (item.tagName !== "LI") continue;
		const text = textWithoutLists(item).trim();
		const paragraph = item.querySelector(":scope > p");
		const { mode, direction } = effectiveListItemDirection(item, paragraph, defaultDirection);
		const align = alignmentOf(paragraph);
		lines.push({
			text,
			listType: ordered ? "ordered" : "bullet",
			depth,
			number: ordered ? number : null,
			...(mode ? { mode, dir: direction } : {}),
			...(align ? { align } : {}),
		});
		if (ordered) number += 1;
		for (const nested of item.children) {
			if (nested.tagName === "UL" || nested.tagName === "OL") {
				readList(nested, lines, depth + 1, defaultDirection);
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

function plainLines(text, defaultDirection) {
	return String(text || "")
		.split(/\r?\n/)
		.map((line) => plainLine(line, null, defaultDirection));
}

function plainLine(text, element = null, defaultDirection) {
	const mode =
		validDirectionMode(element?.closest("[dir]")?.getAttribute("dir")) ||
		validDirectionMode(defaultDirection);
	const direction = mode ? resolveDirection(mode, text) : null;
	const align = alignmentOf(element);
	return {
		text,
		listType: null,
		depth: 0,
		number: null,
		...(mode ? { mode, dir: direction } : {}),
		...(align ? { align } : {}),
	};
}

function alignmentOf(element) {
	const value = element?.style?.textAlign;
	return ["left", "center", "right"].includes(value) ? value : null;
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
		.map((line) => line.replace(/([\\`*_{}\[\]()#+.!|<>~])/g, "\\$1"))
		.join("<br>");
}
