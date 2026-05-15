function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
}

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("bbox must contain four numbers");
  }
  return bbox.map(Number);
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined) return [];
  assertArray(value, `${fieldName} must be an array`);
  return value.map((item) => String(item));
}

function normalizePositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${fieldName} must be a positive integer`);
  return number;
}

function normalizeConfidence(value) {
  if (value === undefined) return 1;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error("confidence must be between 0 and 1");
  return number;
}

function normalizeZIndex(value) {
  if (value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeTextStyle(style) {
  if (style === undefined) return {};
  assertObject(style, "style must be an object");
  const normalized = {};
  if (style.fontSize !== undefined) {
    const fontSize = Number(style.fontSize);
    if (!Number.isFinite(fontSize) || fontSize <= 0) throw new Error("style.fontSize must be a positive number");
    normalized.fontSize = fontSize;
  }
  if (style.fontFamily !== undefined) normalized.fontFamily = String(style.fontFamily);
  if (style.color !== undefined) normalized.color = String(style.color);
  if (style.align !== undefined) {
    const align = String(style.align);
    if (!["left", "center", "right"].includes(align)) throw new Error("style.align must be left, center, or right");
    normalized.align = align;
  }
  if (style.bullet !== undefined) normalized.bullet = Boolean(style.bullet);
  return normalized;
}

function normalizeMergedTextBlock(block) {
  assertObject(block, "mergedTextBlocks entries must be objects");
  return {
    id: String(block.id),
    sourceTextBlockIds: normalizeStringArray(block.sourceTextBlockIds, "sourceTextBlockIds"),
    role: String(block.role || "body"),
    text: String(block.text || ""),
    bbox: normalizeBbox(block.bbox),
    style: normalizeTextStyle(block.style),
  };
}

function normalizeTable(table) {
  assertObject(table, "tables entries must be objects");
  return {
    id: String(table.id),
    bbox: normalizeBbox(table.bbox),
    rows: normalizePositiveInteger(table.rows, "rows"),
    columns: normalizePositiveInteger(table.columns, "columns"),
    sourceTextBlockIds: normalizeStringArray(table.sourceTextBlockIds, "sourceTextBlockIds"),
    confidence: normalizeConfidence(table.confidence),
  };
}

function normalizeImageRole(imageRole) {
  assertObject(imageRole, "imageRoles entries must be objects");
  return {
    imageId: String(imageRole.imageId),
    role: String(imageRole.role || "image"),
  };
}

function normalizeRegion(region) {
  assertObject(region, "regions entries must be objects");
  const strategy = String(region.strategy || "native");
  if (!["native", "image", "ignore"].includes(strategy)) {
    throw new Error("region strategy must be native, image, or ignore");
  }
  return {
    id: String(region.id),
    role: String(region.role || "region"),
    strategy,
    bbox: normalizeBbox(region.bbox),
    sourceIds: normalizeStringArray(region.sourceIds, "sourceIds"),
    confidence: normalizeConfidence(region.confidence),
    zIndex: normalizeZIndex(region.zIndex),
  };
}

function normalizeFallback(fallback) {
  assertObject(fallback, "fallbacks entries must be objects");
  return {
    id: String(fallback.id),
    reason: String(fallback.reason || "complex region"),
    bbox: normalizeBbox(fallback.bbox),
    confidence: normalizeConfidence(fallback.confidence),
    zIndex: normalizeZIndex(fallback.zIndex),
  };
}

function validateLayoutHints(value) {
  assertObject(value, "layout hints must be an object");
  assertArray(value.pages, "layout hints must contain pages array");

  return {
    pages: value.pages.map((page) => {
      assertObject(page, "page hints must be objects");
      return {
        pageNumber: Number(page.pageNumber),
        mergedTextBlocks: (page.mergedTextBlocks || []).map(normalizeMergedTextBlock),
        tables: (page.tables || []).map(normalizeTable),
        regions: (page.regions || []).map(normalizeRegion),
        fallbacks: (page.fallbacks || []).map(normalizeFallback),
        ignoredBlockIds: normalizeStringArray(page.ignoredBlockIds, "ignoredBlockIds"),
        imageRoles: (page.imageRoles || []).map(normalizeImageRole),
      };
    }),
  };
}

function validateLayoutHintsForPages(value, requestedPageNumbers) {
  const hints = validateLayoutHints(value);
  const requestedPages = new Set(requestedPageNumbers.map(Number));
  const seenPages = new Set();
  const invalidPages = [];
  const duplicatePages = [];
  const unexpectedPages = [];

  for (const page of hints.pages) {
    if (!Number.isFinite(page.pageNumber) || !Number.isInteger(page.pageNumber) || page.pageNumber <= 0) {
      invalidPages.push(String(page.pageNumber));
      continue;
    }
    if (seenPages.has(page.pageNumber)) {
      duplicatePages.push(page.pageNumber);
      continue;
    }
    seenPages.add(page.pageNumber);
    if (!requestedPages.has(page.pageNumber)) unexpectedPages.push(page.pageNumber);
  }

  if (invalidPages.length > 0) {
    throw new Error(`Claude layout hints included invalid pageNumber: ${invalidPages.join(", ")}`);
  }
  if (duplicatePages.length > 0) {
    throw new Error(`Claude layout hints duplicate page: ${duplicatePages.join(", ")}`);
  }
  if (unexpectedPages.length > 0) {
    throw new Error(`Claude layout hints included unexpected pages: ${unexpectedPages.join(", ")}`);
  }

  const missingPages = [...requestedPages].filter((pageNumber) => !seenPages.has(pageNumber));
  if (missingPages.length > 0) {
    throw new Error(`Claude layout hints missing pages: ${missingPages.join(", ")}`);
  }

  return hints;
}

module.exports = { validateLayoutHints, validateLayoutHintsForPages };
